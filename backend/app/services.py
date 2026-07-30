from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass

from .schemas import (
    AnalyzeRequest,
    CopilotResult,
    EvidenceItem,
    EvidencePacket,
    RecommendedAction,
    ReviewResult,
    ReviewViolation,
    RiskSeverity,
    RiskSignal,
    TriageResult,
)


class SanitizationService:
    """Preserves the original input while limiting PII sent to model-facing nodes."""

    _phone = re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")
    _email = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")

    def sanitize(self, text: str) -> str:
        text = self._phone.sub("[手机号已脱敏]", text)
        return self._email.sub("[邮箱已脱敏]", text)


class TriageAgent:
    """Structured deterministic fallback; replace the body with one JSON-schema LLM call."""

    async def run(self, request: AnalyzeRequest, sanitized_text: str) -> TriageResult:
        text = sanitized_text.lower()
        if any(word in text for word in ("红肿", "过敏", "刺痛", "不良反应")):
            return TriageResult(
                intent="PRODUCT_SAFETY_COMPLAINT",
                issue_type="ADVERSE_REACTION",
                explicit_request="解释原因并立即处理",
                implicit_goal="保障安全并获得可信的升级处理",
                entities={k: v for k, v in {"order_id": request.order_id}.items() if v},
                required_evidence=["ORDER", "PRODUCT", "SAFETY_SOP", "RISK_POLICY"],
                confidence=0.97,
            )
        if any(word in text for word in ("退款", "破损", "退货")):
            return TriageResult(
                intent="REFUND_COMPLAINT",
                issue_type="PRODUCT_DAMAGE" if "破损" in text else "REFUND_DELAY",
                explicit_request="尽快完成退款",
                implicit_goal="确认责任并避免继续重复沟通",
                entities={k: v for k, v in {"order_id": request.order_id}.items() if v},
                required_evidence=["ORDER", "REFUND_POLICY", "CASE_HISTORY", "PROMISE"],
                missing_fields=[] if request.order_id else ["order_id"],
                confidence=0.94,
            )
        return TriageResult(
            intent="PRODUCT_INQUIRY",
            issue_type="INGREDIENT_USAGE",
            explicit_request="获得准确产品使用建议",
            implicit_goal="确认产品是否适合当前使用场景",
            entities={},
            required_evidence=["PRODUCT", "CLAIM_POLICY"],
            confidence=0.93,
        )


class RiskSignalEngine:
    """Hard rules win. Any classifier failure must return REVIEW_REQUIRED, never LOW."""

    def analyze(self, request: AnalyzeRequest) -> RiskSignal:
        text = request.text
        signals: list[str] = []
        rule_ids: list[str] = []
        severity = RiskSeverity.LOW

        def hit(signal: str, rule: str, level: RiskSeverity) -> None:
            nonlocal severity
            signals.append(signal)
            rule_ids.append(rule)
            order = {
                RiskSeverity.LOW: 0,
                RiskSeverity.MEDIUM: 1,
                RiskSeverity.HIGH: 2,
                RiskSeverity.CRITICAL: 3,
                RiskSeverity.REVIEW_REQUIRED: 2,
            }
            if order[level] > order[severity]:
                severity = level

        if any(word in text for word in ("红肿", "呼吸困难", "不良反应", "严重过敏")):
            hit("消费者描述明确产品不良反应", "RISK-SAFETY-001", RiskSeverity.CRITICAL)
        if any(word in text for word in ("微博", "小红书", "社交平台", "曝光", "媒体")):
            hit("消费者表达公开平台传播倾向", "RISK-PR-002", RiskSeverity.HIGH)
        if any(word in text for word in ("律师", "起诉", "监管", "消协")):
            hit("消费者提及法律或监管程序", "RISK-LEGAL-003", RiskSeverity.HIGH)
        if request.contact_count >= 3:
            hit(f"同一问题已联系 {request.contact_count} 次", "RISK-REPEAT-004", RiskSeverity.HIGH)
        if request.previous_promise_overdue:
            hit("历史服务承诺已经超时", "RISK-PROMISE-005", RiskSeverity.HIGH)

        return RiskSignal(
            risk_type=(
                "PRODUCT_SAFETY_ESCALATION"
                if severity == RiskSeverity.CRITICAL
                else "SERVICE_ESCALATION"
                if signals
                else "NO_ESCALATION_SIGNAL"
            ),
            severity=severity,
            signals=signals,
            rule_ids=rule_ids,
            confidence=0.98 if signals else 0.95,
        )


class EvidenceService:
    """Typed mock adapters. Production adapters can be swapped without changing the graph."""

    async def _order(self, request: AnalyzeRequest) -> EvidenceItem | None:
        await asyncio.sleep(0)
        if not request.order_id:
            return None
        return EvidenceItem(
            evidence_id=f"order:{request.order_id}",
            evidence_type="ORDER",
            title=request.order_id,
            content="订单已签收 2 天；退款状态为 NOT_REQUESTED；实付金额 ¥389。",
            source="OMS",
            metadata={"status": "DELIVERED", "refund_status": "NOT_REQUESTED"},
        )

    async def _history(self, request: AnalyzeRequest) -> EvidenceItem | None:
        await asyncio.sleep(0)
        if request.contact_count < 2 and not request.previous_promise_overdue:
            return None
        return EvidenceItem(
            evidence_id=f"history:{request.conversation_id}",
            evidence_type="CASE_HISTORY",
            title="结构化服务历史",
            content=(
                f"同一问题已联系 {request.contact_count} 次；"
                f"历史承诺超时={request.previous_promise_overdue}。"
            ),
            source="CRM",
        )

    async def _policy(self, triage: TriageResult) -> EvidenceItem:
        await asyncio.sleep(0)
        if triage.issue_type == "ADVERSE_REACTION":
            return EvidenceItem(
                evidence_id="policy:safety_sop_v6:clause_2_1",
                evidence_type="SAFETY_SOP",
                title="产品安全处置 SOP §2.1",
                content="出现明确红肿等不良反应描述时，应建议暂停使用并进入安全事件流程。",
                source="政策知识库",
                version="v6",
                clause_id="2.1",
                metadata={"region": "CN", "approval_status": "APPROVED"},
            )
        if triage.intent == "REFUND_COMPLAINT":
            return EvidenceItem(
                evidence_id="policy:refund_v5:clause_3_2",
                evidence_type="REFUND_POLICY",
                title="破损商品售后政策 §3.2",
                content="签收 7 日内且已有有效破损凭证，可发起退款资格核验。",
                source="政策知识库",
                version="v5",
                clause_id="3.2",
                metadata={"region": "CN", "channel": "ONLINE", "approval_status": "APPROVED"},
            )
        return EvidenceItem(
            evidence_id="product:usage_v4:clause_2",
            evidence_type="PRODUCT",
            title="敏感肌首次使用建议",
            content="首次使用前建议局部测试；出现持续不适时应停止使用并咨询专业人士。",
            source="产品知识库",
            version="v4",
            clause_id="2",
            metadata={"approval_status": "APPROVED"},
        )

    async def collect(self, request: AnalyzeRequest, triage: TriageResult) -> EvidencePacket:
        order, history, policy = await asyncio.gather(
            self._order(request), self._history(request), self._policy(triage)
        )
        items = [item for item in (order, history, policy) if item is not None]
        available = {item.evidence_type for item in items}
        missing = [
            kind for kind in triage.required_evidence
            if kind in {"ORDER", "CASE_HISTORY"} and kind not in available
        ]
        return EvidencePacket(items=items, missing=missing)


class CopilotAgent:
    async def run(
        self,
        request: AnalyzeRequest,
        triage: TriageResult,
        risk: RiskSignal,
        evidence: EvidencePacket,
    ) -> CopilotResult:
        refs = [item.evidence_id for item in evidence.items]
        if risk.severity == RiskSeverity.CRITICAL:
            draft = (
                "很抱歉得知您出现了红肿。请先暂停使用该产品；如症状明显、持续或加重，"
                "请及时寻求专业医疗帮助。经您确认后，我们会立即升级至产品安全团队。"
                "完成专业评估前，我们不会对原因作推断。"
            )
            actions = [
                RecommendedAction(
                    action="ESCALATE_PRODUCT_SAFETY",
                    reason="命中明确不良反应硬规则",
                    idempotency_scope="safety_v6",
                ),
                RecommendedAction(
                    action="NOTIFY_DUTY_MANAGER",
                    reason="存在公开平台传播倾向或严重安全信号",
                    idempotency_scope="risk_policy_v4",
                ),
            ]
        elif triage.intent == "REFUND_COMPLAINT":
            draft = (
                "很抱歉让您为同一问题多次联系我们。我们已核对到已有记录，无需再次提交相同材料。"
                "我们会优先提交退款资格复核；退款仍需完成系统核验，暂不对到账时间作不确定承诺。"
            )
            actions = [
                RecommendedAction(
                    action="VERIFY_REFUND_ELIGIBILITY",
                    reason="订单与政策证据支持进入资格核验",
                    idempotency_scope="refund_v5",
                )
            ]
        else:
            draft = (
                "根据已批准的产品说明，建议首次使用前先做局部测试，确认无不适后再逐步使用。"
                "如目前正处于持续泛红、破损或治疗期，建议先咨询专业医生。"
            )
            actions = []

        return CopilotResult(
            consumer_summary=f"消费者诉求：{triage.explicit_request}。",
            service_goal=triage.implicit_goal,
            draft_reply=draft,
            recommended_actions=actions,
            evidence_refs=refs,
            uncertainties=evidence.missing,
        )


class DeterministicValidator:
    def validate(self, result: CopilotResult) -> list[ReviewViolation]:
        violations: list[ReviewViolation] = []
        if not result.evidence_refs:
            violations.append(
                ReviewViolation(code="MISSING_EVIDENCE", message="建议回复缺少证据引用")
            )
        if "立即退款" in result.draft_reply or "保证到账" in result.draft_reply:
            violations.append(
                ReviewViolation(
                    code="UNSUPPORTED_REFUND_PROMISE",
                    message="回复包含未经核验的退款承诺",
                )
            )
        return violations


class ReviewAgent:
    async def run(
        self,
        copilot: CopilotResult,
        deterministic_violations: list[ReviewViolation],
    ) -> ReviewResult:
        return ReviewResult(
            approved=not deterministic_violations,
            violations=deterministic_violations,
            revision_required=bool(deterministic_violations),
            confidence=0.97,
        )


@dataclass
class ToolDecision:
    allowed: bool
    requires_supervisor: bool
    reason: str


class ToolPolicyService:
    def evaluate(self, action: RecommendedAction, risk: RiskSignal) -> ToolDecision:
        if action.action == "NOTIFY_DUTY_MANAGER":
            return ToolDecision(
                allowed=risk.severity in {RiskSeverity.HIGH, RiskSeverity.CRITICAL},
                requires_supervisor=False,
                reason="通知动作由风险等级与人工批准共同授权",
            )
        if action.action == "VERIFY_REFUND_ELIGIBILITY":
            return ToolDecision(
                allowed=True,
                requires_supervisor=False,
                reason="仅创建资格核验任务，不执行退款",
            )
        return ToolDecision(
            allowed=True,
            requires_supervisor=action.action == "ESCALATE_PRODUCT_SAFETY",
            reason="高风险升级动作进入受控队列",
        )

