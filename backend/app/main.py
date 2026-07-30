from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from uuid import uuid4

import structlog
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.responses import Response

from .orchestrator import CarePulseOrchestrator
from .schemas import (
    AnalysisResult,
    AnalyzeRequest,
    ApprovalRequest,
    ApprovalResult,
    CaseState,
    RunAccepted,
)
from .services import ToolPolicyService
from .store import InMemoryRunStore

log = structlog.get_logger()
orchestrator = CarePulseOrchestrator()
tool_policy = ToolPolicyService()
store = InMemoryRunStore()
run_counter = Counter("carepulse_runs_total", "CarePulse graph runs", ["route", "status"])
run_latency = Histogram("carepulse_run_seconds", "End-to-end graph latency")


@asynccontextmanager
async def lifespan(_: FastAPI):
    log.info("carepulse_started", mode="demo")
    yield
    log.info("carepulse_stopped")


app = FastAPI(
    title="CarePulse API",
    version="0.1.0",
    description="Evidence-grounded customer care copilot with a human approval gate.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def execute_run(run_id: str, case_id: str, request: AnalyzeRequest) -> None:
    try:
        store.emit(run_id, "progress", {"node": "triage", "label": "正在理解消费者诉求"})
        await asyncio.sleep(0.08)
        store.emit(run_id, "progress", {"node": "risk", "label": "正在检查风险信号"})
        result = await orchestrator.analyze(request, run_id=run_id, case_id=case_id)
        for trace in result.trace:
            store.emit(
                run_id,
                "trace",
                {
                    "node": trace.graph_node,
                    "latency_ms": trace.latency_ms,
                    "state_after": trace.state_after,
                },
            )
        store.complete(run_id, result)
        run_counter.labels(route=result.route, status="success").inc()
    except Exception as exc:  # fail closed: clients see a review-required failure
        log.exception("run_failed", run_id=run_id)
        store.fail(run_id, "自动分析未完成，请转人工复核。")
        run_counter.labels(route="unknown", status="failed").inc()
        raise exc


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "carepulse-api"}


@app.post("/api/v1/runs", response_model=RunAccepted, status_code=202)
async def create_run(request: AnalyzeRequest, background: BackgroundTasks) -> RunAccepted:
    run_id = f"run_{uuid4().hex[:12]}"
    case_id = f"case_{uuid4().hex[:12]}"
    store.create(run_id, case_id)
    background.add_task(execute_run, run_id, case_id, request)
    return RunAccepted(run_id=run_id, case_id=case_id)


@app.post("/api/v1/analyze", response_model=AnalysisResult)
async def analyze_now(request: AnalyzeRequest) -> AnalysisResult:
    """Synchronous engineering-harness endpoint."""
    with run_latency.time():
        result = await orchestrator.analyze(request)
    run_counter.labels(route=result.route, status="success").inc()
    return result


@app.get("/api/v1/runs/{run_id}", response_model=AnalysisResult)
async def get_run(run_id: str) -> AnalysisResult:
    record = store.runs.get(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="run not found")
    if record.result is None:
        raise HTTPException(status_code=409, detail={"status": record.status, "error": record.error})
    return record.result


@app.get("/api/v1/runs/{run_id}/events")
async def run_events(run_id: str) -> StreamingResponse:
    if run_id not in store.runs:
        raise HTTPException(status_code=404, detail="run not found")

    async def stream():
        cursor = 0
        while True:
            record = store.runs[run_id]
            while cursor < len(record.events):
                event = record.events[cursor]
                cursor += 1
                yield (
                    f"event: {event['event']}\n"
                    f"data: {json.dumps(event['data'], ensure_ascii=False, default=str)}\n\n"
                )
            if record.status in {"COMPLETED", "FAILED"}:
                break
            record.changed.clear()
            try:
                await asyncio.wait_for(record.changed.wait(), timeout=15)
            except TimeoutError:
                yield ": keep-alive\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/v1/cases/{case_id}/approval", response_model=ApprovalResult)
async def approve_case(case_id: str, request: ApprovalRequest) -> ApprovalResult:
    run_id = store.case_to_run.get(case_id)
    if run_id is None or store.runs[run_id].result is None:
        raise HTTPException(status_code=404, detail="case not found")
    result = store.runs[run_id].result
    assert result is not None
    if result.state != CaseState.PENDING_AGENT_APPROVAL:
        raise HTTPException(status_code=409, detail="case is not waiting for approval")

    if request.decision == "REJECT":
        store.set_case_state(case_id, CaseState.REVIEW_FAILED)
        return ApprovalResult(case_id=case_id, state=CaseState.REVIEW_FAILED)

    target_state = (
        CaseState.ESCALATED if request.decision == "ESCALATE" else CaseState.APPROVED
    )
    outbox_ids: list[str] = []
    if request.decision in {"ACCEPT", "EDIT", "ESCALATE"}:
        for action in result.copilot.recommended_actions:
            decision = tool_policy.evaluate(action, result.risk)
            if decision.allowed:
                outbox_ids.append(
                    store.add_outbox(case_id, action.action, action.idempotency_scope)
                )
    store.set_case_state(case_id, target_state)
    return ApprovalResult(case_id=case_id, state=target_state, outbox_event_ids=outbox_ids)


@app.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

