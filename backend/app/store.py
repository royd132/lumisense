from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from .schemas import AnalysisResult, CaseState


@dataclass
class RunRecord:
    case_id: str
    status: str = "PROCESSING"
    events: list[dict[str, Any]] = field(default_factory=list)
    result: AnalysisResult | None = None
    error: str | None = None
    changed: asyncio.Event = field(default_factory=asyncio.Event)


class InMemoryRunStore:
    """Local MVP store. SQLAlchemy repositories replace this in production."""

    def __init__(self) -> None:
        self.runs: dict[str, RunRecord] = {}
        self.case_to_run: dict[str, str] = {}
        self.outbox: dict[str, dict[str, Any]] = {}

    def create(self, run_id: str, case_id: str) -> RunRecord:
        record = RunRecord(case_id=case_id)
        self.runs[run_id] = record
        self.case_to_run[case_id] = run_id
        return record

    def emit(self, run_id: str, event: str, data: dict[str, Any]) -> None:
        record = self.runs[run_id]
        record.events.append({"event": event, "data": data})
        record.changed.set()

    def complete(self, run_id: str, result: AnalysisResult) -> None:
        record = self.runs[run_id]
        record.result = result
        record.status = "COMPLETED"
        self.emit(run_id, "completed", {"state": result.state, "route": result.route})

    def fail(self, run_id: str, message: str) -> None:
        record = self.runs[run_id]
        record.status = "FAILED"
        record.error = message
        self.emit(run_id, "failed", {"message": message})

    def add_outbox(self, case_id: str, action: str, scope: str) -> str:
        event_id = f"out_{uuid4().hex[:12]}"
        idempotency_key = f"{case_id}:{action}:{scope}"
        for existing in self.outbox.values():
            if existing["idempotency_key"] == idempotency_key:
                return existing["event_id"]
        self.outbox[event_id] = {
            "event_id": event_id,
            "case_id": case_id,
            "action": action,
            "idempotency_key": idempotency_key,
            "status": "PENDING",
        }
        return event_id

    def set_case_state(self, case_id: str, state: CaseState) -> None:
        run_id = self.case_to_run[case_id]
        record = self.runs[run_id]
        if record.result:
            record.result = record.result.model_copy(update={"state": state})

