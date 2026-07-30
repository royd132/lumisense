from __future__ import annotations

from time import perf_counter
from typing import Any, TypedDict
from uuid import uuid4

from langgraph.graph import END, StateGraph

from .schemas import (
    AnalysisResult,
    AnalyzeRequest,
    CaseState,
    CopilotResult,
    EvidencePacket,
    ReviewResult,
    RiskSignal,
    TraceEvent,
    TriageResult,
)
from .services import (
    CopilotAgent,
    DeterministicValidator,
    EvidenceService,
    ReviewAgent,
    RiskSignalEngine,
    SanitizationService,
    TriageAgent,
)


class GraphState(TypedDict, total=False):
    request: AnalyzeRequest
    run_id: str
    case_id: str
    case_state: CaseState
    sanitized_text: str
    route: str
    triage: TriageResult
    risk: RiskSignal
    evidence: EvidencePacket
    copilot: CopilotResult
    review: ReviewResult
    trace: list[TraceEvent]
    revision_count: int


class CarePulseOrchestrator:
    def __init__(self) -> None:
        self.sanitizer = SanitizationService()
        self.triage = TriageAgent()
        self.risk = RiskSignalEngine()
        self.evidence = EvidenceService()
        self.copilot = CopilotAgent()
        self.validator = DeterministicValidator()
        self.reviewer = ReviewAgent()
        self.graph = self._build_graph()

    def _trace(
        self,
        state: GraphState,
        node: str,
        before: CaseState,
        after: CaseState,
        started: float,
        **extra: Any,
    ) -> list[TraceEvent]:
        events = list(state.get("trace", []))
        events.append(
            TraceEvent(
                run_id=state["run_id"],
                graph_node=node,
                state_before=before,
                state_after=after,
                latency_ms=max(1, int((perf_counter() - started) * 1000)),
                **extra,
            )
        )
        return events

    async def _ingest(self, state: GraphState) -> GraphState:
        started = perf_counter()
        request = state["request"]
        sanitized = self.sanitizer.sanitize(request.text)
        return {
            **state,
            "sanitized_text": sanitized,
            "trace": self._trace(
                state, "ingestion", CaseState.OPEN, CaseState.OPEN, started
            ),
        }

    async def _triage_and_risk(self, state: GraphState) -> GraphState:
        started = perf_counter()
        request = state["request"]
        triage = await self.triage.run(request, state["sanitized_text"])
        risk = self.risk.analyze(request)
        route = (
            "HIGH_RISK"
            if risk.severity.value in {"HIGH", "CRITICAL", "REVIEW_REQUIRED"}
            else "FAQ"
            if triage.intent == "PRODUCT_INQUIRY"
            else "STANDARD_COMPLAINT"
        )
        return {
            **state,
            "triage": triage,
            "risk": risk,
            "route": route,
            "case_state": CaseState.EVIDENCE_PENDING,
            "trace": self._trace(
                state,
                "triage_and_risk",
                CaseState.OPEN,
                CaseState.EVIDENCE_PENDING,
                started,
                risk_signals=risk.signals,
                prompt_version="triage_v1",
            ),
        }

    async def _collect_evidence(self, state: GraphState) -> GraphState:
        started = perf_counter()
        evidence = await self.evidence.collect(state["request"], state["triage"])
        return {
            **state,
            "evidence": evidence,
            "trace": self._trace(
                state,
                "evidence_fan_out",
                CaseState.EVIDENCE_PENDING,
                CaseState.EVIDENCE_PENDING,
                started,
                evidence_ids=[item.evidence_id for item in evidence.items],
            ),
        }

    async def _draft(self, state: GraphState) -> GraphState:
        started = perf_counter()
        copilot = await self.copilot.run(
            state["request"], state["triage"], state["risk"], state["evidence"]
        )
        return {
            **state,
            "copilot": copilot,
            "case_state": CaseState.DRAFT_READY,
            "trace": self._trace(
                state,
                "copilot",
                CaseState.EVIDENCE_PENDING,
                CaseState.DRAFT_READY,
                started,
                evidence_ids=copilot.evidence_refs,
                prompt_version="copilot_v1",
            ),
        }

    async def _review(self, state: GraphState) -> GraphState:
        started = perf_counter()
        violations = self.validator.validate(state["copilot"])
        review = await self.reviewer.run(state["copilot"], violations)
        after = (
            CaseState.PENDING_AGENT_APPROVAL
            if review.approved
            else CaseState.REVIEW_FAILED
        )
        return {
            **state,
            "review": review,
            "case_state": after,
            "trace": self._trace(
                state,
                "review",
                CaseState.DRAFT_READY,
                after,
                started,
                evidence_ids=state["copilot"].evidence_refs,
                prompt_version="review_v1",
            ),
        }

    def _review_route(self, state: GraphState) -> str:
        if state["review"].approved:
            return "human_gate"
        if state.get("revision_count", 0) < 1:
            return "revise"
        return "human_gate"

    async def _revise(self, state: GraphState) -> GraphState:
        # Bounded once. A production LLM call receives only the review violations.
        copilot = state["copilot"].model_copy(
            update={
                "draft_reply": state["copilot"].draft_reply.replace("立即退款", "优先提交退款资格复核")
            }
        )
        return {**state, "copilot": copilot, "revision_count": 1}

    async def _human_gate(self, state: GraphState) -> GraphState:
        # Persisted production graphs can replace this node with langgraph.interrupt().
        return state

    def _build_graph(self):
        builder = StateGraph(GraphState)
        builder.add_node("ingest", self._ingest)
        builder.add_node("triage_and_risk", self._triage_and_risk)
        builder.add_node("evidence", self._collect_evidence)
        builder.add_node("draft", self._draft)
        builder.add_node("review", self._review)
        builder.add_node("revise", self._revise)
        builder.add_node("human_gate", self._human_gate)
        builder.set_entry_point("ingest")
        builder.add_edge("ingest", "triage_and_risk")
        builder.add_edge("triage_and_risk", "evidence")
        builder.add_edge("evidence", "draft")
        builder.add_edge("draft", "review")
        builder.add_conditional_edges(
            "review",
            self._review_route,
            {"human_gate": "human_gate", "revise": "revise"},
        )
        builder.add_edge("revise", "review")
        builder.add_edge("human_gate", END)
        return builder.compile()

    async def analyze(
        self,
        request: AnalyzeRequest,
        *,
        run_id: str | None = None,
        case_id: str | None = None,
    ) -> AnalysisResult:
        initial: GraphState = {
            "request": request,
            "run_id": run_id or f"run_{uuid4().hex[:12]}",
            "case_id": case_id or f"case_{uuid4().hex[:12]}",
            "case_state": CaseState.OPEN,
            "trace": [],
            "revision_count": 0,
        }
        state = await self.graph.ainvoke(initial)
        return AnalysisResult(
            run_id=state["run_id"],
            case_id=state["case_id"],
            conversation_id=request.conversation_id,
            state=state["case_state"],
            route=state["route"],
            triage=state["triage"],
            risk=state["risk"],
            evidence=state["evidence"],
            copilot=state["copilot"],
            review=state["review"],
            trace=state["trace"],
            revision_count=state["revision_count"],
        )

