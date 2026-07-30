from __future__ import annotations

from datetime import UTC, datetime
from hashlib import sha256
from typing import ClassVar

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .db_models import PolicyChunk, PolicyDocument
from .schemas import AnalyzeRequest, EvidenceItem, TriageResult


def deterministic_embedding(text: str, dimensions: int = 1536) -> list[float]:
    """Key-free development embedding; replace with the configured model adapter."""

    normalized = "".join(text.lower().split())
    grams = {
        normalized[index : index + 2]
        for index in range(max(1, len(normalized) - 1))
        if normalized[index : index + 2]
    }
    values = [0.0] * dimensions
    for gram in grams:
        digest = sha256(gram.encode("utf-8")).digest()
        index = int.from_bytes(digest[:4], "big") % dimensions
        values[index] += 1.0
    norm = sum(value * value for value in values) ** 0.5
    return values if norm == 0 else [value / norm for value in values]


class PolicyRetriever:
    """Metadata-first hybrid retrieval: valid approved policy + FTS/vector ranking."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def search(
        self,
        query: str,
        *,
        embedding: list[float] | None,
        region: str = "CN",
        channel: str = "ONLINE",
        limit: int = 8,
        evidence_types: list[str] | None = None,
    ) -> list[tuple[PolicyChunk, PolicyDocument]]:
        now = datetime.now(UTC)
        filters = (
            PolicyDocument.approval_status == "APPROVED",
            PolicyDocument.region == region,
            PolicyDocument.channel.in_([channel, "ALL"]),
            PolicyDocument.valid_from <= now,
            or_(PolicyDocument.valid_to.is_(None), PolicyDocument.valid_to > now),
        )
        text_rank = func.ts_rank_cd(
            func.to_tsvector("simple", PolicyChunk.content),
            func.plainto_tsquery("simple", query),
        )
        score = text_rank
        if embedding is not None:
            vector_rank = 1 - PolicyChunk.embedding.cosine_distance(embedding)
            score = (text_rank * 0.45) + (vector_rank * 0.55)

        statement = (
            select(PolicyChunk, PolicyDocument)
            .join(PolicyDocument, PolicyDocument.id == PolicyChunk.document_id)
            .where(and_(*filters))
            .order_by(score.desc())
            .limit(limit)
        )
        if evidence_types:
            statement = statement.where(
                PolicyChunk.chunk_metadata["evidence_type"].astext.in_(evidence_types)
            )
        return list((await self.session.execute(statement)).all())


class SqlPolicyEvidenceAdapter:
    """Production EvidenceService adapter backed by metadata-filtered FTS + pgvector."""

    KNOWLEDGE_TYPES: ClassVar[set[str]] = {
        "PRODUCT",
        "REFUND_POLICY",
        "SAFETY_SOP",
        "RISK_POLICY",
        "CLAIM_POLICY",
    }

    def __init__(self, sessions) -> None:
        self.sessions = sessions

    async def __call__(
        self,
        request: AnalyzeRequest,
        triage: TriageResult,
    ) -> list[EvidenceItem]:
        required = [item for item in triage.required_evidence if item in self.KNOWLEDGE_TYPES]
        if not required:
            return []
        query = " ".join(
            [
                request.text,
                triage.intent,
                triage.issue_type,
                *required,
            ]
        )
        async with self.sessions() as session:
            rows = await PolicyRetriever(session).search(
                query,
                embedding=deterministic_embedding(query),
                evidence_types=required,
                limit=32,
            )
        selected: dict[str, EvidenceItem] = {}
        for chunk, document in rows:
            evidence_type = str(chunk.chunk_metadata.get("evidence_type", "POLICY"))
            if evidence_type in selected:
                continue
            selected[evidence_type] = EvidenceItem(
                evidence_id=f"policy:{document.id}:{chunk.clause_id}",
                evidence_type=evidence_type,
                title=f"{document.title} §{chunk.clause_id}",
                content=chunk.content,
                source=document.title,
                version=document.version,
                clause_id=chunk.clause_id,
                metadata={
                    **chunk.chunk_metadata,
                    "region": document.region,
                    "channel": document.channel,
                    "approval_status": document.approval_status,
                },
            )
        return [selected[item] for item in required if item in selected]
