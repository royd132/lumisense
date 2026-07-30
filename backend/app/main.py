from __future__ import annotations

import asyncio
import json
import os
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Annotated

import structlog
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.responses import Response

from .auth import current_principal
from .db import create_database
from .harness import CarePulseHarness
from .orchestrator import CHECKPOINT_SCHEMA_TYPES, CarePulseOrchestrator
from .schemas import (
    AnalysisResult,
    AnalyzeRequest,
    ApprovalRequest,
    ApprovalResult,
    Principal,
    RunAccepted,
    RunStatus,
)
from .services import EvidenceService
from .store import InMemoryRunStore
from .telemetry import configure_telemetry

log = structlog.get_logger()
run_counter = Counter("carepulse_runs_total", "CarePulse graph runs", ["route", "status"])
run_latency = Histogram("carepulse_run_seconds", "End-to-end graph latency")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_telemetry()
    demo_mode = os.getenv("CAREPULSE_DEMO_MODE", "true").lower() == "true"
    async with AsyncExitStack() as stack:
        if demo_mode:
            store = InMemoryRunStore()
            orchestrator = CarePulseOrchestrator()
        else:
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
            from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

            from .retrieval import SqlPolicyEvidenceAdapter
            from .sql_store import SqlRunStore

            database_url = os.environ["DATABASE_URL"]
            engine, sessions = create_database(database_url)
            stack.push_async_callback(engine.dispose)
            checkpoint_url = database_url.replace("postgresql+asyncpg://", "postgresql://")
            checkpointer = await stack.enter_async_context(
                AsyncPostgresSaver.from_conn_string(
                    checkpoint_url,
                    serde=JsonPlusSerializer(allowed_msgpack_modules=CHECKPOINT_SCHEMA_TYPES),
                )
            )
            await checkpointer.setup()
            store = SqlRunStore(sessions)
            orchestrator = CarePulseOrchestrator(
                checkpointer=checkpointer,
                evidence_service=EvidenceService(
                    policy_adapter=SqlPolicyEvidenceAdapter(sessions),
                ),
            )

        app.state.harness = CarePulseHarness(store, orchestrator=orchestrator)
        app.state.tasks = set()
        for run_id in await store.list_processing():
            task = asyncio.create_task(execute_run(app, run_id))
            app.state.tasks.add(task)
            task.add_done_callback(app.state.tasks.discard)
        log.info("carepulse_started", mode="demo" if demo_mode else "production")
        yield
        tasks = list(app.state.tasks)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        log.info("carepulse_stopped")


app = FastAPI(
    title="CarePulse API",
    version="0.2.0",
    description="Evidence-grounded customer care copilot with a durable human approval gate.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CAREPULSE_CORS_ORIGINS", "http://localhost:3000,http://localhost:5173"
        ).split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_harness(request: Request) -> CarePulseHarness:
    return request.app.state.harness


def require_run_access(record, principal: Principal) -> None:
    if not principal.is_supervisor and record.owner_agent_id != principal.agent_id:
        raise HTTPException(status_code=404, detail="run not found")


async def execute_run(app: FastAPI, run_id: str) -> None:
    harness: CarePulseHarness = app.state.harness
    try:
        with run_latency.time():
            result = await harness.execute(run_id)
        run_counter.labels(route=result.route, status="waiting_approval").inc()
    except asyncio.CancelledError:
        raise
    except Exception:
        log.exception("run_failed", run_id=run_id)
        run_counter.labels(route="unknown", status="failed").inc()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "carepulse-api", "harness": "ready"}


@app.post("/api/v1/runs", response_model=RunAccepted, status_code=202)
async def create_run(
    request: AnalyzeRequest,
    http_request: Request,
    principal: Annotated[Principal, Depends(current_principal)],
) -> RunAccepted:
    harness = get_harness(http_request)
    accepted = await harness.accept(request, principal)
    task = asyncio.create_task(execute_run(http_request.app, accepted.run_id))
    http_request.app.state.tasks.add(task)
    task.add_done_callback(http_request.app.state.tasks.discard)
    return accepted


@app.post("/api/v1/analyze", response_model=AnalysisResult)
async def analyze_now(
    request: AnalyzeRequest,
    http_request: Request,
    principal: Annotated[Principal, Depends(current_principal)],
) -> AnalysisResult:
    """Engineering-harness endpoint: runs until the persisted human interrupt."""
    harness = get_harness(http_request)
    with run_latency.time():
        result = await harness.analyze(request, principal)
    run_counter.labels(route=result.route, status="waiting_approval").inc()
    return result


@app.get("/api/v1/runs/{run_id}", response_model=AnalysisResult)
async def get_run(
    run_id: str,
    http_request: Request,
    principal: Annotated[Principal, Depends(current_principal)],
) -> AnalysisResult:
    record = await get_harness(http_request).store.get(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="run not found")
    require_run_access(record, principal)
    if record.result is None:
        raise HTTPException(
            status_code=409,
            detail={"status": record.status, "error": record.error},
        )
    return record.result


@app.get("/api/v1/runs/{run_id}/status", response_model=RunStatus)
async def get_run_status(
    run_id: str,
    http_request: Request,
    principal: Annotated[Principal, Depends(current_principal)],
) -> RunStatus:
    record = await get_harness(http_request).store.get(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="run not found")
    require_run_access(record, principal)
    return RunStatus(
        run_id=run_id,
        case_id=record.case_id,
        status=record.status,
        state=record.result.state if record.result else None,
        error=record.error,
    )


@app.get("/api/v1/runs/{run_id}/events")
async def run_events(
    run_id: str,
    http_request: Request,
    principal: Annotated[Principal, Depends(current_principal)],
) -> StreamingResponse:
    store = get_harness(http_request).store
    record = await store.get(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="run not found")
    require_run_access(record, principal)
    raw_cursor = http_request.headers.get("last-event-id", "0")
    try:
        initial_cursor = max(0, int(raw_cursor))
    except ValueError:
        initial_cursor = 0

    async def stream():
        cursor = initial_cursor
        while True:
            record = await store.get(run_id)
            assert record is not None
            while cursor < len(record.events):
                event = record.events[cursor]
                cursor += 1
                yield (
                    f"id: {cursor}\n"
                    f"event: {event['event']}\n"
                    f"data: {json.dumps(event['data'], ensure_ascii=False, default=str)}\n\n"
                )
            if record.status in {"WAITING_APPROVAL", "COMPLETED", "FAILED"}:
                break
            await store.wait_for_change(run_id, timeout=15)
            refreshed = await store.get(run_id)
            if refreshed and cursor == len(refreshed.events):
                yield ": keep-alive\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.post("/api/v1/cases/{case_id}/approval", response_model=ApprovalResult)
async def approve_case(
    case_id: str,
    approval: ApprovalRequest,
    http_request: Request,
    principal: Annotated[Principal, Depends(current_principal)],
) -> ApprovalResult:
    return await get_harness(http_request).approve(case_id, approval, principal)


@app.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
