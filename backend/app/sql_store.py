from __future__ import annotations

import asyncio
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from .db_models import (
    AgentRun,
    ApprovalEvent,
    OutboxEvent,
    RunEvent,
    RunStep,
    ServiceCase,
)
from .schemas import AnalysisResult, AnalyzeRequest, CaseState, Principal
from .store import RunRecord


class SqlRunStore:
    """PostgreSQL adapter. Approval, case state and Outbox writes share one transaction."""

    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self.sessions = sessions

    async def create(
        self, run_id: str, case_id: str, request: AnalyzeRequest, sanitized_input: str
    ) -> RunRecord:
        async with self.sessions.begin() as session:
            session.add(
                ServiceCase(
                    id=case_id,
                    conversation_id=request.conversation_id,
                    customer_id=request.customer_id,
                    original_input=request.text,
                    sanitized_input=sanitized_input,
                    state=CaseState.OPEN,
                    route=None,
                )
            )
            session.add(
                AgentRun(
                    id=run_id,
                    case_id=case_id,
                    status="PROCESSING",
                    request_json=request.model_dump(mode="json"),
                    result_json=None,
                    error=None,
                )
            )
        return RunRecord(case_id=case_id, request=request, sanitized_input=sanitized_input)

    async def _record(self, session: AsyncSession, run: AgentRun) -> RunRecord:
        case = await session.get(ServiceCase, run.case_id)
        events = list(
            (
                await session.scalars(
                    select(RunEvent).where(RunEvent.run_id == run.id).order_by(RunEvent.id)
                )
            ).all()
        )
        return RunRecord(
            case_id=run.case_id,
            request=AnalyzeRequest.model_validate(run.request_json),
            sanitized_input=case.sanitized_input if case else "",
            status=run.status,
            events=[{"event": item.event_type, "data": item.data} for item in events],
            result=(
                AnalysisResult.model_validate(run.result_json)
                if run.result_json is not None
                else None
            ),
            error=run.error,
        )

    async def get(self, run_id: str) -> RunRecord | None:
        async with self.sessions() as session:
            run = await session.get(AgentRun, run_id)
            return await self._record(session, run) if run else None

    async def get_by_case(self, case_id: str) -> tuple[str, RunRecord] | None:
        async with self.sessions() as session:
            run = await session.scalar(select(AgentRun).where(AgentRun.case_id == case_id))
            return (run.id, await self._record(session, run)) if run else None

    async def list_processing(self) -> list[str]:
        async with self.sessions() as session:
            return list(
                (
                    await session.scalars(
                        select(AgentRun.id).where(AgentRun.status == "PROCESSING")
                    )
                ).all()
            )

    async def emit(self, run_id: str, event: str, data: dict[str, Any]) -> None:
        async with self.sessions.begin() as session:
            session.add(RunEvent(run_id=run_id, event_type=event, data=data))
            if event == "trace":
                session.add(
                    RunStep(
                        run_id=run_id,
                        graph_node=str(data.get("node", "unknown")),
                        prompt_version=data.get("prompt_version"),
                        artifact=data,
                        latency_ms=int(data.get("latency_ms", 0)),
                    )
                )

    async def save_result(
        self, run_id: str, result: AnalysisResult, status: str = "WAITING_APPROVAL"
    ) -> None:
        async with self.sessions.begin() as session:
            run = await session.get(AgentRun, run_id, with_for_update=True)
            if run is None:
                raise KeyError(run_id)
            case = await session.get(ServiceCase, run.case_id, with_for_update=True)
            run.result_json = result.model_dump(mode="json")
            run.status = status
            if case:
                case.state = result.state
                case.route = result.route
            session.add(
                RunEvent(
                    run_id=run_id,
                    event_type="interrupt" if status == "WAITING_APPROVAL" else "completed",
                    data={"state": result.state, "route": result.route},
                )
            )

    async def fail(self, run_id: str, message: str) -> None:
        async with self.sessions.begin() as session:
            run = await session.get(AgentRun, run_id, with_for_update=True)
            if run:
                run.status = "FAILED"
                run.error = message
                session.add(RunEvent(run_id=run_id, event_type="failed", data={"message": message}))

    async def commit_approval(
        self,
        case_id: str,
        principal: Principal,
        decision: str,
        target_state: CaseState,
        edited_reply: str | None,
        reason: str | None,
        actions: list[dict[str, str]],
    ) -> list[str]:
        async with self.sessions.begin() as session:
            run = await session.scalar(
                select(AgentRun).where(AgentRun.case_id == case_id).with_for_update()
            )
            if run is None or run.status != "WAITING_APPROVAL" or run.result_json is None:
                raise ValueError("case is not waiting for approval")
            case = await session.get(ServiceCase, case_id, with_for_update=True)
            assert case is not None
            approval_id = f"apr_{uuid4().hex[:12]}"
            session.add(
                ApprovalEvent(
                    id=approval_id,
                    case_id=case_id,
                    agent_id=principal.agent_id,
                    agent_role=principal.role,
                    decision=decision,
                    approved_action_ids=[item["action"] for item in actions],
                    edited_reply=edited_reply,
                    reason=reason,
                )
            )
            outbox_ids: list[str] = []
            for action in actions:
                key = f"{case_id}:{action['action']}:{action['scope']}"
                event_id = f"out_{uuid4().hex[:12]}"
                await session.execute(
                    insert(OutboxEvent)
                    .values(
                        id=event_id,
                        case_id=case_id,
                        action_type=action["action"],
                        payload={"case_id": case_id, "approval_id": approval_id},
                        idempotency_key=key,
                        status="PENDING",
                    )
                    .on_conflict_do_nothing(index_elements=[OutboxEvent.idempotency_key])
                )
                stored_id = await session.scalar(
                    select(OutboxEvent.id).where(OutboxEvent.idempotency_key == key)
                )
                assert stored_id is not None
                outbox_ids.append(stored_id)

            result = AnalysisResult.model_validate(run.result_json)
            result = result.model_copy(update={"state": target_state})
            if edited_reply:
                result = result.model_copy(
                    update={
                        "copilot": result.copilot.model_copy(
                            update={"draft_reply": edited_reply}
                        )
                    }
                )
            run.result_json = result.model_dump(mode="json")
            run.status = "APPROVING"
            case.state = target_state
            return outbox_ids

    async def wait_for_change(self, run_id: str, timeout: float) -> None:
        await asyncio.sleep(min(timeout, 0.5))
