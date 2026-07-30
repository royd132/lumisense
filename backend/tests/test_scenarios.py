import asyncio

from fastapi import HTTPException

from app.harness import CarePulseHarness
from app.orchestrator import CarePulseOrchestrator
from app.schemas import (
    AnalyzeRequest,
    ApprovalRequest,
    CaseState,
    Principal,
    RiskSeverity,
)
from app.store import InMemoryRunStore


def test_faq_uses_short_low_risk_route():
    result = asyncio.run(
        CarePulseOrchestrator().analyze(AnalyzeRequest(text="这款玻尿酸精华敏感肌第一次怎么用？"))
    )
    assert result.route == "FAQ"
    assert result.risk.severity == RiskSeverity.LOW
    assert result.state == CaseState.PENDING_AGENT_APPROVAL
    assert result.copilot.evidence_refs


def test_repeat_refund_complaint_detects_overdue_promise():
    result = asyncio.run(
        CarePulseOrchestrator().analyze(
            AnalyzeRequest(
                text="第三次联系了，破损照片已经发过，退款承诺还是没处理。",
                order_id="ORDER_1024",
                contact_count=3,
                previous_promise_overdue=True,
            )
        )
    )
    assert result.route == "HIGH_RISK"
    assert result.risk.severity == RiskSeverity.HIGH
    assert any("超时" in signal for signal in result.risk.signals)
    assert "立即退款" not in result.copilot.draft_reply


def test_adverse_reaction_and_social_threat_force_critical():
    result = asyncio.run(
        CarePulseOrchestrator().analyze(
            AnalyzeRequest(
                text="用了面霜后脸上红肿，今天不处理我就发到小红书曝光。",
                order_id="ORDER_2088",
            )
        )
    )
    assert result.route == "HIGH_RISK"
    assert result.risk.severity == RiskSeverity.CRITICAL
    assert "ESCALATE_PRODUCT_SAFETY" in {
        action.action for action in result.copilot.recommended_actions
    }
    assert result.review.approved


def test_graph_stops_at_real_interrupt_and_resumes_with_same_thread():
    async def scenario():
        store = InMemoryRunStore()
        harness = CarePulseHarness(store)
        result = await harness.analyze(
            AnalyzeRequest(
                text="用了面霜后脸上红肿，如果不处理我会发到小红书曝光。",
                order_id="ORDER_2088",
            )
        )
        record = await store.get(result.run_id)
        assert record is not None
        assert record.status == "WAITING_APPROVAL"
        assert result.state == CaseState.PENDING_AGENT_APPROVAL

        approval = await harness.approve(
            result.case_id,
            ApprovalRequest(
                decision="ESCALATE",
                approved_action_ids=[
                    "ESCALATE_PRODUCT_SAFETY",
                    "NOTIFY_DUTY_MANAGER",
                ],
            ),
            Principal(
                agent_id="supervisor_1",
                role="SUPERVISOR",
                scopes={"case:read", "case:approve_reply", "case:approve_action"},
            ),
        )
        assert approval.state == CaseState.ESCALATED
        assert len(approval.outbox_event_ids) == 2
        assert (await store.get(result.run_id)).status == "COMPLETED"

    asyncio.run(scenario())


def test_required_evidence_is_checked_for_every_declared_type():
    result = asyncio.run(
        CarePulseOrchestrator().analyze(AnalyzeRequest(text="玻尿酸精华敏感肌第一次怎么用？"))
    )
    evidence_types = {item.evidence_type for item in result.evidence.items}
    assert {"PRODUCT", "CLAIM_POLICY"} <= evidence_types
    assert result.evidence.missing == []


def test_missing_order_fails_closed_at_review():
    result = asyncio.run(
        CarePulseOrchestrator().analyze(
            AnalyzeRequest(text="破损退款已经催了三次", contact_count=3)
        )
    )
    assert "ORDER" in result.evidence.missing
    assert not result.review.approved
    assert any(
        violation.code == "INCOMPLETE_EVIDENCE_PACKET" for violation in result.review.violations
    )


def test_agent_cannot_approve_supervisor_only_action():
    async def scenario():
        store = InMemoryRunStore()
        harness = CarePulseHarness(store)
        result = await harness.analyze(
            AnalyzeRequest(text="用了面霜后红肿，要去微博曝光", order_id="ORDER_2088")
        )
        try:
            await harness.approve(
                result.case_id,
                ApprovalRequest(
                    decision="ACCEPT",
                    approved_action_ids=["ESCALATE_PRODUCT_SAFETY"],
                ),
                Principal(
                    agent_id="agent_1",
                    role="AGENT",
                    scopes={"case:read", "case:approve_reply"},
                ),
            )
        except HTTPException as exc:
            assert exc.status_code == 403
        else:
            raise AssertionError("untrusted agent approved a supervisor-only action")
        assert store.outbox == {}

    asyncio.run(scenario())


def test_reply_approval_and_action_approval_are_separate():
    async def scenario():
        store = InMemoryRunStore()
        harness = CarePulseHarness(store)
        principal = Principal(
            agent_id="agent_1",
            role="AGENT",
            scopes={"case:read", "case:approve_reply"},
        )
        result = await harness.analyze(
            AnalyzeRequest(
                text="第三次联系，退款承诺已超时。",
                order_id="ORDER_1024",
                contact_count=3,
                previous_promise_overdue=True,
            ),
            principal,
        )
        approval = await harness.approve(
            result.case_id,
            ApprovalRequest(decision="ACCEPT", approved_action_ids=[]),
            principal,
        )
        assert approval.state == CaseState.APPROVED
        assert approval.outbox_event_ids == []
        assert store.outbox == {}

    asyncio.run(scenario())


def test_risk_engine_failure_fails_closed_to_review_required():
    orchestrator = CarePulseOrchestrator()

    def fail(_request):
        raise RuntimeError("classifier unavailable")

    orchestrator.risk.analyze = fail
    result = asyncio.run(orchestrator.analyze(AnalyzeRequest(text="请帮我查询这款产品的用法")))
    assert result.risk.severity == RiskSeverity.REVIEW_REQUIRED
    assert result.route == "HIGH_RISK"
    assert result.risk.rule_ids == ["RISK-FALLBACK-000"]


def test_evidence_does_not_mix_product_or_refund_policy():
    safety = asyncio.run(
        CarePulseOrchestrator().analyze(
            AnalyzeRequest(
                text="使用粉底液后红肿刺痛",
                order_id="ORDER_1024",
            )
        )
    )
    product = next(item for item in safety.evidence.items if item.evidence_type == "PRODUCT")
    assert "粉底液" in product.title
    assert "面霜" not in product.title

    refund = asyncio.run(
        CarePulseOrchestrator().analyze(
            AnalyzeRequest(
                text="退款提交后迟迟没有到账",
                order_id="ORDER_1024",
            )
        )
    )
    policy = next(item for item in refund.evidence.items if item.evidence_type == "REFUND_POLICY")
    assert "退款进度与时效" in policy.title
    assert "破损" not in policy.title


def test_case_owner_is_enforced_at_approval():
    async def scenario():
        store = InMemoryRunStore()
        harness = CarePulseHarness(store)
        owner = Principal(
            agent_id="owner_agent",
            role="AGENT",
            scopes={"case:read", "case:approve_reply"},
        )
        result = await harness.analyze(
            AnalyzeRequest(text="请帮我查询产品用法"),
            owner,
        )
        try:
            await harness.approve(
                result.case_id,
                ApprovalRequest(decision="ACCEPT"),
                Principal(
                    agent_id="other_agent",
                    role="AGENT",
                    scopes={"case:read", "case:approve_reply"},
                ),
            )
        except HTTPException as exc:
            assert exc.status_code == 403
        else:
            raise AssertionError("another agent approved an owner-scoped case")

    asyncio.run(scenario())


def test_review_failed_case_can_only_be_rejected():
    async def scenario():
        store = InMemoryRunStore()
        harness = CarePulseHarness(store)
        principal = Principal(
            agent_id="agent_1",
            role="AGENT",
            scopes={"case:read", "case:approve_reply"},
        )
        result = await harness.analyze(
            AnalyzeRequest(text="破损退款已经催了三次", contact_count=3),
            principal,
        )
        assert not result.review.approved
        try:
            await harness.approve(
                result.case_id,
                ApprovalRequest(decision="ACCEPT"),
                principal,
            )
        except HTTPException as exc:
            assert exc.status_code == 409
        else:
            raise AssertionError("review-failed reply was accepted")
        assert store.outbox == {}

    asyncio.run(scenario())
