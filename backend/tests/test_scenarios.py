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
        CarePulseOrchestrator().analyze(
            AnalyzeRequest(text="这款玻尿酸精华敏感肌第一次怎么用？")
        )
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
        CarePulseOrchestrator().analyze(
            AnalyzeRequest(text="玻尿酸精华敏感肌第一次怎么用？")
        )
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
        violation.code == "INCOMPLETE_EVIDENCE_PACKET"
        for violation in result.review.violations
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
        result = await harness.analyze(
            AnalyzeRequest(
                text="第三次联系，退款承诺已超时。",
                order_id="ORDER_1024",
                contact_count=3,
                previous_promise_overdue=True,
            )
        )
        approval = await harness.approve(
            result.case_id,
            ApprovalRequest(decision="ACCEPT", approved_action_ids=[]),
            Principal(
                agent_id="agent_1",
                role="AGENT",
                scopes={"case:read", "case:approve_reply"},
            ),
        )
        assert approval.state == CaseState.APPROVED
        assert approval.outbox_event_ids == []
        assert store.outbox == {}

    asyncio.run(scenario())
