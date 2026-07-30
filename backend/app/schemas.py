from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(UTC)


class CaseState(StrEnum):
    OPEN = "OPEN"
    EVIDENCE_PENDING = "EVIDENCE_PENDING"
    DRAFT_READY = "DRAFT_READY"
    REVIEW_FAILED = "REVIEW_FAILED"
    PENDING_AGENT_APPROVAL = "PENDING_AGENT_APPROVAL"
    APPROVED = "APPROVED"
    SENT = "SENT"
    ESCALATED = "ESCALATED"
    WAITING_EXTERNAL_ACTION = "WAITING_EXTERNAL_ACTION"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class RiskSeverity(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"


class AnalyzeRequest(BaseModel):
    conversation_id: str = "conv_demo"
    customer_id: str = "customer_demo"
    text: str = Field(min_length=1, max_length=8000)
    order_id: str | None = None
    product_id: str | None = None
    contact_count: int = Field(default=1, ge=1)
    previous_promise_overdue: bool = False
    agent_id: str = "agent_demo"


class TriageResult(BaseModel):
    intent: str
    issue_type: str
    explicit_request: str
    implicit_goal: str
    entities: dict[str, str] = Field(default_factory=dict)
    required_evidence: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class RiskSignal(BaseModel):
    risk_type: str
    severity: RiskSeverity
    signals: list[str]
    confidence: float = Field(ge=0, le=1)
    rule_ids: list[str] = Field(default_factory=list)


class EvidenceItem(BaseModel):
    evidence_id: str
    evidence_type: str
    title: str
    content: str
    source: str
    version: str | None = None
    clause_id: str | None = None
    fetched_at: datetime = Field(default_factory=utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)


class EvidencePacket(BaseModel):
    items: list[EvidenceItem]
    missing: list[str] = Field(default_factory=list)


class RecommendedAction(BaseModel):
    action: str
    reason: str
    requires_approval: bool = True
    idempotency_scope: str


class CopilotResult(BaseModel):
    consumer_summary: str
    service_goal: str
    draft_reply: str
    recommended_actions: list[RecommendedAction]
    evidence_refs: list[str]
    uncertainties: list[str] = Field(default_factory=list)


class ReviewViolation(BaseModel):
    code: str
    message: str


class ReviewResult(BaseModel):
    approved: bool
    violations: list[ReviewViolation] = Field(default_factory=list)
    revision_required: bool = False
    confidence: float = Field(ge=0, le=1)


class TraceEvent(BaseModel):
    run_id: str
    graph_node: str
    state_before: CaseState
    state_after: CaseState
    latency_ms: int
    model: str | None = None
    model_version: str | None = None
    prompt_version: str | None = None
    input_hash: str | None = None
    tool_calls: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    risk_signals: list[str] = Field(default_factory=list)
    agent_output: dict[str, Any] = Field(default_factory=dict)
    validator_output: dict[str, Any] = Field(default_factory=dict)
    token_usage: dict[str, int] = Field(default_factory=dict)
    fallback_used: bool = False
    created_at: datetime = Field(default_factory=utcnow)


class AnalysisResult(BaseModel):
    run_id: str
    case_id: str
    conversation_id: str
    state: CaseState
    route: str
    triage: TriageResult
    risk: RiskSignal
    evidence: EvidencePacket
    copilot: CopilotResult
    review: ReviewResult
    trace: list[TraceEvent]
    revision_count: int = 0


class RunAccepted(BaseModel):
    run_id: str
    case_id: str
    status: str = "PROCESSING"


class ApprovalRequest(BaseModel):
    decision: str = Field(pattern="^(ACCEPT|EDIT|REJECT|ESCALATE)$")
    edited_reply: str | None = Field(default=None, max_length=8000)
    reason: str | None = Field(default=None, max_length=1000)
    approved_action_ids: list[str] = Field(default_factory=list)


class ApprovalResult(BaseModel):
    approval_id: str = Field(default_factory=lambda: f"apr_{uuid4().hex[:12]}")
    case_id: str
    state: CaseState
    outbox_event_ids: list[str] = Field(default_factory=list)


class Principal(BaseModel):
    """Identity derived by the API layer; never accepted from an approval body."""

    agent_id: str
    role: str
    scopes: set[str] = Field(default_factory=set)

    @property
    def is_supervisor(self) -> bool:
        return self.role in {"SUPERVISOR", "RISK_MANAGER", "ADMIN"}


class RunStatus(BaseModel):
    run_id: str
    case_id: str
    status: str
    state: CaseState | None = None
    error: str | None = None
