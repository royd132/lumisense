from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any, Protocol
from uuid import uuid4

from .schemas import AnalysisResult, AnalyzeRequest, CaseState, Principal


@dataclass
class RunRecord:
    case_id: str
    request: AnalyzeRequest
    sanitized_input: str
    status: str = "PROCESSING"
    events: list[dict[str, Any]] = field(default_factory=list)
    result: AnalysisResult | None = None
    error: str | None = None
    changed: asyncio.Event = field(default_factory=asyncio.Event)


class RuntimeStore(Protocol):
    async def create(
        self, run_id: str, case_id: str, request: AnalyzeRequest, sanitized_input: str
    ) -> RunRecord: ...

    async def get(self, run_id: str) -> RunRecord | None: ...

    async def get_by_case(self, case_id: str) -> tuple[str, RunRecord] | None: ...

    async def list_processing(self) -> list[str]: ...

    async def emit(self, run_id: str, event: str, data: dict[str, Any]) -> None: ...

    async def save_result(
        self, run_id: str, result: AnalysisResult, status: str
    ) -> None: ...

    async def fail(self, run_id: str, message: str) -> None: ...

    async def commit_approval(
        self,
        case_id: str,
        principal: Principal,
        decision: str,
        target_state: CaseState,
        edited_reply: str | None,
        reason: str | None,
        actions: list[dict[str, str]],
    ) -> list[str]: ...

    async def wait_for_change(self, run_id: str, timeout: float) -> None: ...


class InMemoryRunStore:
    """Concurrency-safe development adapter implementing the production store contract."""

    def __init__(self) -> None:
        self.runs: dict[str, RunRecord] = {}
        self.case_to_run: dict[str, str] = {}
        self.outbox: dict[str, dict[str, Any]] = {}
        self.approvals: list[dict[str, Any]] = []
        self._lock = asyncio.Lock()

    async def create(
        self, run_id: str, case_id: str, request: AnalyzeRequest, sanitized_input: str
    ) -> RunRecord:
        async with self._lock:
            record = RunRecord(
                case_id=case_id,
                request=request,
                sanitized_input=sanitized_input,
            )
            self.runs[run_id] = record
            self.case_to_run[case_id] = run_id
            return record

    async def get(self, run_id: str) -> RunRecord | None:
        return self.runs.get(run_id)

    async def get_by_case(self, case_id: str) -> tuple[str, RunRecord] | None:
        run_id = self.case_to_run.get(case_id)
        if run_id is None:
            return None
        return run_id, self.runs[run_id]

    async def list_processing(self) -> list[str]:
        return [
            run_id
            for run_id, record in self.runs.items()
            if record.status == "PROCESSING"
        ]

    async def emit(self, run_id: str, event: str, data: dict[str, Any]) -> None:
        record = self.runs[run_id]
        record.events.append({"event": event, "data": data})
        record.changed.set()

    async def save_result(
        self, run_id: str, result: AnalysisResult, status: str = "WAITING_APPROVAL"
    ) -> None:
        record = self.runs[run_id]
        record.result = result
        record.status = status
        await self.emit(
            run_id,
            "interrupt" if status == "WAITING_APPROVAL" else "completed",
            {"state": result.state, "route": result.route},
        )

    async def fail(self, run_id: str, message: str) -> None:
        record = self.runs[run_id]
        record.status = "FAILED"
        record.error = message
        await self.emit(run_id, "failed", {"message": message})

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
        async with self._lock:
            run_id = self.case_to_run[case_id]
            record = self.runs[run_id]
            if record.result is None or record.status != "WAITING_APPROVAL":
                raise ValueError("case is not waiting for approval")

            outbox_ids: list[str] = []
            for action in actions:
                key = f"{case_id}:{action['action']}:{action['scope']}"
                existing = next(
                    (item for item in self.outbox.values() if item["idempotency_key"] == key),
                    None,
                )
                if existing:
                    outbox_ids.append(existing["event_id"])
                    continue
                event_id = f"out_{uuid4().hex[:12]}"
                self.outbox[event_id] = {
                    "event_id": event_id,
                    "case_id": case_id,
                    "action": action["action"],
                    "idempotency_key": key,
                    "status": "PENDING",
                    "attempts": 0,
                }
                outbox_ids.append(event_id)

            approval_id = f"apr_{uuid4().hex[:12]}"
            self.approvals.append(
                {
                    "approval_id": approval_id,
                    "case_id": case_id,
                    "agent_id": principal.agent_id,
                    "role": principal.role,
                    "decision": decision,
                    "edited_reply": edited_reply,
                    "reason": reason,
                    "approved_actions": [item["action"] for item in actions],
                }
            )
            updated = record.result.model_copy(update={"state": target_state})
            if edited_reply:
                updated = updated.model_copy(
                    update={
                        "copilot": updated.copilot.model_copy(
                            update={"draft_reply": edited_reply}
                        )
                    }
                )
            record.result = updated
            record.status = "APPROVING"
            record.changed.set()
            return outbox_ids

    async def wait_for_change(self, run_id: str, timeout: float) -> None:
        record = self.runs[run_id]
        record.changed.clear()
        try:
            await asyncio.wait_for(record.changed.wait(), timeout=timeout)
        except TimeoutError:
            return
