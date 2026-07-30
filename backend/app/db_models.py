from __future__ import annotations

from datetime import datetime

from pgvector.sqlalchemy import VECTOR
from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class ServiceCase(Base):
    __tablename__ = "service_cases"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(String(80), index=True)
    customer_id: Mapped[str] = mapped_column(String(80), index=True)
    owner_agent_id: Mapped[str] = mapped_column(String(120), index=True)
    original_input: Mapped[str] = mapped_column(Text)
    sanitized_input: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(40), index=True)
    route: Mapped[str | None] = mapped_column(String(40))
    risk_severity: Mapped[str | None] = mapped_column(String(30), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("service_cases.id"), index=True)
    status: Mapped[str] = mapped_column(String(40), index=True)
    request_json: Mapped[dict] = mapped_column(JSON)
    result_json: Mapped[dict | None] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class RunStep(Base):
    __tablename__ = "run_steps"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    graph_node: Mapped[str] = mapped_column(String(80))
    prompt_version: Mapped[str | None] = mapped_column(String(80))
    artifact: Mapped[dict] = mapped_column(JSON, default=dict)
    latency_ms: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AgentArtifact(Base):
    __tablename__ = "agent_artifacts"
    __table_args__ = (
        UniqueConstraint("run_id", "artifact_type", name="uq_agent_artifact_run_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    artifact_type: Mapped[str] = mapped_column(String(40))
    data: Mapped[dict] = mapped_column(JSON)
    prompt_version: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RiskEvent(Base):
    __tablename__ = "risk_events"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("service_cases.id"), index=True)
    severity: Mapped[str] = mapped_column(String(30), index=True)
    signals: Mapped[list] = mapped_column(JSON, default=list)
    rule_ids: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RunEvent(Base):
    __tablename__ = "run_events"
    __table_args__ = (Index("ix_run_events_run_id_id", "run_id", "id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(40))
    data: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApprovalEvent(Base):
    __tablename__ = "approval_events"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("service_cases.id"), index=True)
    agent_id: Mapped[str] = mapped_column(String(80))
    agent_role: Mapped[str] = mapped_column(String(40))
    decision: Mapped[str] = mapped_column(String(30))
    approved_action_ids: Mapped[list] = mapped_column(JSON, default=list)
    edited_reply: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_outbox_idempotency"),)

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    case_id: Mapped[str] = mapped_column(ForeignKey("service_cases.id"), index=True)
    action_type: Mapped[str] = mapped_column(String(80))
    payload: Mapped[dict] = mapped_column(JSON)
    idempotency_key: Mapped[str] = mapped_column(String(240))
    status: Mapped[str] = mapped_column(String(30), default="PENDING", index=True)
    attempts: Mapped[int] = mapped_column(default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ActionExecution(Base):
    __tablename__ = "action_executions"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_action_execution_idempotency"),)

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    outbox_event_id: Mapped[str] = mapped_column(ForeignKey("outbox_events.id"), index=True)
    action_type: Mapped[str] = mapped_column(String(80))
    idempotency_key: Mapped[str] = mapped_column(String(240))
    status: Mapped[str] = mapped_column(String(30), default="CREATED", index=True)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PolicyDocument(Base):
    __tablename__ = "policy_documents"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    title: Mapped[str] = mapped_column(String(240))
    version: Mapped[str] = mapped_column(String(40))
    region: Mapped[str] = mapped_column(String(20), index=True)
    channel: Mapped[str] = mapped_column(String(40), index=True)
    approval_status: Mapped[str] = mapped_column(String(40), index=True)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PolicyChunk(Base):
    __tablename__ = "policy_chunks"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("policy_documents.id"), index=True)
    clause_id: Mapped[str] = mapped_column(String(80), index=True)
    content: Mapped[str] = mapped_column(Text)
    chunk_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    embedding: Mapped[list[float] | None] = mapped_column(VECTOR(1536))
