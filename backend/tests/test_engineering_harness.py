import asyncio

from app.engineering_harness import (
    RankingExample,
    evaluate_rankings,
    evaluate_reply_grounding,
)
from app.orchestrator import CarePulseOrchestrator
from app.schemas import AnalyzeRequest


def test_rag_harness_reports_ranking_and_policy_filter_failures():
    metrics = evaluate_rankings(
        [
            RankingExample(
                query_id="refund",
                relevant_ids={"policy:refund:v5:3.2"},
                retrieved_ids=[
                    "policy:refund:v5:3.2",
                    "policy:refund:v3:2.1",
                    "policy:refund:us:v5",
                ],
                stale_ids={"policy:refund:v3:2.1"},
                wrong_region_ids={"policy:refund:us:v5"},
            )
        ],
        k=3,
    )
    assert metrics.recall_at_k == 1
    assert metrics.mrr == 1
    assert metrics.ndcg_at_k == 1
    assert metrics.stale_retrieval_rate == 1 / 3
    assert metrics.wrong_region_retrieval_rate == 1 / 3


def test_reply_grounding_harness_accepts_evidence_bound_reply():
    result = asyncio.run(
        CarePulseOrchestrator().analyze(
            AnalyzeRequest(
                text="破损商品需要退款",
                order_id="ORDER_1024",
            )
        )
    )
    report = evaluate_reply_grounding(
        result.copilot,
        result.evidence,
        result.triage.explicit_request,
    )
    assert report.valid
