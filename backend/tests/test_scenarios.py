import asyncio

from app.orchestrator import CarePulseOrchestrator
from app.schemas import AnalyzeRequest, CaseState, RiskSeverity


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
