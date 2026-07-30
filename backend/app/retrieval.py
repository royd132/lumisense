from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .db_models import PolicyChunk, PolicyDocument


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
        return list((await self.session.execute(statement)).all())
