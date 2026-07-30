from __future__ import annotations

from math import log2

from pydantic import BaseModel, Field

from .schemas import CopilotResult, EvidencePacket


class RankingExample(BaseModel):
    query_id: str
    relevant_ids: set[str]
    retrieved_ids: list[str]
    stale_ids: set[str] = Field(default_factory=set)
    wrong_region_ids: set[str] = Field(default_factory=set)


class RankingMetrics(BaseModel):
    recall_at_k: float
    mrr: float
    ndcg_at_k: float
    stale_retrieval_rate: float
    wrong_region_retrieval_rate: float


def evaluate_rankings(
    examples: list[RankingExample],
    *,
    k: int = 5,
) -> RankingMetrics:
    """Deterministic RAG regression metrics for policy retrieval test fixtures."""

    if not examples:
        return RankingMetrics(
            recall_at_k=0,
            mrr=0,
            ndcg_at_k=0,
            stale_retrieval_rate=0,
            wrong_region_retrieval_rate=0,
        )
    recalls: list[float] = []
    reciprocal_ranks: list[float] = []
    ndcgs: list[float] = []
    stale = 0
    wrong_region = 0
    retrieved = 0
    for example in examples:
        top_k = example.retrieved_ids[:k]
        hits = [1 if item in example.relevant_ids else 0 for item in top_k]
        recalls.append(len(set(top_k) & example.relevant_ids) / max(1, len(example.relevant_ids)))
        first_hit = next((index + 1 for index, hit in enumerate(hits) if hit), None)
        reciprocal_ranks.append(0 if first_hit is None else 1 / first_hit)
        dcg = sum(hit / log2(index + 2) for index, hit in enumerate(hits))
        ideal_hits = min(k, len(example.relevant_ids))
        ideal_dcg = sum(1 / log2(index + 2) for index in range(ideal_hits))
        ndcgs.append(0 if ideal_dcg == 0 else dcg / ideal_dcg)
        stale += len(set(top_k) & example.stale_ids)
        wrong_region += len(set(top_k) & example.wrong_region_ids)
        retrieved += len(top_k)
    count = len(examples)
    return RankingMetrics(
        recall_at_k=sum(recalls) / count,
        mrr=sum(reciprocal_ranks) / count,
        ndcg_at_k=sum(ndcgs) / count,
        stale_retrieval_rate=stale / max(1, retrieved),
        wrong_region_retrieval_rate=wrong_region / max(1, retrieved),
    )


class GroundingReport(BaseModel):
    valid: bool
    invalid_evidence_refs: list[str]
    unsupported_promises: list[str]
    explicit_request_covered: bool


def evaluate_reply_grounding(
    result: CopilotResult,
    evidence: EvidencePacket,
    explicit_request: str,
) -> GroundingReport:
    available = {item.evidence_id for item in evidence.items}
    invalid = [item for item in result.evidence_refs if item not in available]
    forbidden = [
        phrase
        for phrase in ("立即退款", "保证到账", "保证赔偿", "一定治愈")
        if phrase in result.draft_reply
    ]
    covered = bool(
        explicit_request
        and (explicit_request in result.consumer_summary or explicit_request in result.service_goal)
    )
    return GroundingReport(
        valid=not invalid and not forbidden and covered,
        invalid_evidence_refs=invalid,
        unsupported_promises=forbidden,
        explicit_request_covered=covered,
    )
