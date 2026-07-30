from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException

from .orchestrator import CarePulseOrchestrator
from .schemas import (
    AnalysisResult,
    AnalyzeRequest,
    ApprovalRequest,
    ApprovalResult,
    CaseState,
    Principal,
    RiskSeverity,
    RunAccepted,
)
from .services import SanitizationService, ToolPolicyService
from .store import RuntimeStore


class CarePulseHarness:
    """Single runtime boundary for identity, graph execution, approval and side effects."""

    def __init__(
        self,
        store: RuntimeStore,
        orchestrator: CarePulseOrchestrator | None = None,
        tool_policy: ToolPolicyService | None = None,
    ) -> None:
        self.store = store
        self.orchestrator = orchestrator or CarePulseOrchestrator()
        self.tool_policy = tool_policy or ToolPolicyService()
        self.sanitizer = SanitizationService()

    async def accept(self, request: AnalyzeRequest) -> RunAccepted:
        run_id = f"run_{uuid4().hex[:12]}"
        case_id = f"case_{uuid4().hex[:12]}"
        await self.store.create(
            run_id,
            case_id,
            request,
            self.sanitizer.sanitize(request.text),
        )
        return RunAccepted(run_id=run_id, case_id=case_id)

    async def execute(self, run_id: str) -> AnalysisResult:
        record = await self.store.get(run_id)
        if record is None:
            raise KeyError(run_id)
        initial = self.orchestrator.initial_state(
            record.request,
            run_id=run_id,
            case_id=record.case_id,
        )
        try:
            config = self.orchestrator._config(run_id)
            checkpoint = await self.orchestrator.graph.aget_state(config)
            graph_input = None if checkpoint.values else initial
            async for update in self.orchestrator.graph.astream(
                graph_input,
                config=config,
                stream_mode="updates",
            ):
                for node, payload in update.items():
                    if node == "__interrupt__":
                        continue
                    trace = payload.get("trace", []) if isinstance(payload, dict) else []
                    latest = trace[-1] if trace else None
                    await self.store.emit(
                        run_id,
                        "trace",
                        {
                            "node": node,
                            "latency_ms": latest.latency_ms if latest else 0,
                            "state_after": (
                                latest.state_after if latest else "PROCESSING"
                            ),
                        },
                    )
            snapshot = await self.orchestrator.graph.aget_state(
                config
            )
            result = self.orchestrator.result_from_state(snapshot.values)
            waiting = bool(snapshot.interrupts)
            await self.store.save_result(
                run_id,
                result,
                "WAITING_APPROVAL" if waiting else "COMPLETED",
            )
            return result
        except Exception:
            await self.store.fail(run_id, "自动分析未完成，已安全转入人工复核。")
            raise

    async def analyze(self, request: AnalyzeRequest) -> AnalysisResult:
        accepted = await self.accept(request)
        return await self.execute(accepted.run_id)

    async def approve(
        self,
        case_id: str,
        request: ApprovalRequest,
        principal: Principal,
    ) -> ApprovalResult:
        found = await self.store.get_by_case(case_id)
        if found is None:
            raise HTTPException(status_code=404, detail="case not found")
        run_id, record = found
        result = record.result
        if result is None or record.status != "WAITING_APPROVAL":
            raise HTTPException(status_code=409, detail="case is not waiting for approval")
        if "case:approve_reply" not in principal.scopes:
            raise HTTPException(status_code=403, detail="reply approval permission required")

        available = {item.action: item for item in result.copilot.recommended_actions}
        unknown = set(request.approved_action_ids) - set(available)
        if unknown:
            raise HTTPException(
                status_code=422,
                detail=f"unknown action ids: {', '.join(sorted(unknown))}",
            )
        if request.decision in {"REJECT"} and request.approved_action_ids:
            raise HTTPException(status_code=422, detail="rejected replies cannot approve actions")

        selected: list[dict[str, str]] = []
        for action_id in request.approved_action_ids:
            action = available[action_id]
            policy = self.tool_policy.evaluate(action, result.risk)
            if not policy.allowed:
                raise HTTPException(status_code=403, detail=policy.reason)
            if "case:approve_action" not in principal.scopes:
                raise HTTPException(status_code=403, detail="action approval permission required")
            if policy.requires_supervisor and not principal.is_supervisor:
                raise HTTPException(
                    status_code=403,
                    detail=f"{action.action} requires supervisor approval",
                )
            selected.append(
                {"action": action.action, "scope": action.idempotency_scope}
            )

        if (
            request.decision == "ESCALATE"
            and result.risk.severity in {RiskSeverity.HIGH, RiskSeverity.CRITICAL}
            and not principal.is_supervisor
        ):
            raise HTTPException(status_code=403, detail="high-risk escalation requires supervisor")

        target_state = {
            "REJECT": CaseState.REVIEW_FAILED,
            "ESCALATE": CaseState.ESCALATED,
            "ACCEPT": CaseState.APPROVED,
            "EDIT": CaseState.APPROVED,
        }[request.decision]
        try:
            outbox_ids = await self.store.commit_approval(
                case_id,
                principal,
                request.decision,
                target_state,
                request.edited_reply,
                request.reason,
                selected,
            )
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

        resumed = await self.orchestrator.resume(
            run_id,
            {
                "decision": request.decision,
                "target_state": target_state,
                "agent_id": principal.agent_id,
                "approved_action_ids": request.approved_action_ids,
            },
        )
        if request.edited_reply:
            resumed = resumed.model_copy(
                update={
                    "copilot": resumed.copilot.model_copy(
                        update={"draft_reply": request.edited_reply}
                    )
                }
            )
        await self.store.save_result(run_id, resumed, "COMPLETED")
        return ApprovalResult(
            case_id=case_id,
            state=target_state,
            outbox_event_ids=outbox_ids,
        )
