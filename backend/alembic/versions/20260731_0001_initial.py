"""Create the CarePulse transactional and policy schema.

Revision ID: 20260731_0001
Revises:
Create Date: 2026-07-31
"""

from datetime import UTC, datetime

from alembic import op
from app.db_models import Base, PolicyChunk, PolicyDocument
from app.retrieval import deterministic_embedding

revision = "20260731_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    connection = op.get_bind()
    Base.metadata.create_all(bind=connection, checkfirst=True)
    valid_from = datetime(2026, 1, 1, tzinfo=UTC)
    documents = [
        ("refund_damage", "破损商品售后政策", "v5"),
        ("refund_progress", "退款进度与时效政策", "v5"),
        ("safety_sop", "产品安全处置 SOP", "v6"),
        ("risk_escalation", "高风险服务升级规则", "v4"),
        ("foundation_p120", "持妆粉底液 P120 产品资料", "v3"),
        ("cream_b26c0719", "玻色因紧致面霜产品资料", "v3"),
        ("product_usage", "敏感肌首次使用建议", "v4"),
        ("claim_safety", "功效沟通合规指引", "v3"),
    ]
    connection.execute(
        PolicyDocument.__table__.insert(),
        [
            {
                "id": item_id,
                "title": title,
                "version": version,
                "region": "CN",
                "channel": "ONLINE",
                "approval_status": "APPROVED",
                "valid_from": valid_from,
                "valid_to": None,
            }
            for item_id, title, version in documents
        ],
    )
    chunks = [
        (
            "refund_damage_3_2",
            "refund_damage",
            "3.2",
            "签收 7 日内且已有有效破损凭证，可发起退款资格核验。",
            "REFUND_POLICY",
        ),
        (
            "refund_progress_4_1",
            "refund_progress",
            "4.1",
            "退款状态与到账时间必须以 OMS 和支付渠道核验结果为准，不得提前承诺。",
            "REFUND_POLICY",
        ),
        (
            "safety_sop_2_1",
            "safety_sop",
            "2.1",
            "出现明确红肿等不良反应描述时，应建议暂停使用并进入安全事件流程。",
            "SAFETY_SOP",
        ),
        (
            "risk_escalation_1_3",
            "risk_escalation",
            "1.3",
            "不良反应与公开传播意图同时出现时，风险取最高等级并强制人工升级。",
            "RISK_POLICY",
        ),
        (
            "foundation_p120_safety",
            "foundation_p120",
            "safety",
            "持妆粉底液出现明确刺激或红肿时应立即停止使用，专业评估前不得推断原因。",
            "PRODUCT",
        ),
        (
            "cream_b26c0719_safety",
            "cream_b26c0719",
            "safety",
            "面霜出现明确红肿时应立即停止使用，产品批次需由产品安全团队核验。",
            "PRODUCT",
        ),
        (
            "product_usage_2",
            "product_usage",
            "2",
            "首次使用前建议局部测试；出现持续不适时应停止使用并咨询专业人士。",
            "PRODUCT",
        ),
        (
            "claim_safety_1_4",
            "claim_safety",
            "1.4",
            "客服不得使用治疗疾病、保证效果或一定治愈等医学承诺。",
            "CLAIM_POLICY",
        ),
    ]
    connection.execute(
        PolicyChunk.__table__.insert(),
        [
            {
                "id": chunk_id,
                "document_id": document_id,
                "clause_id": clause_id,
                "content": content,
                "chunk_metadata": {
                    "evidence_type": evidence_type,
                    "policy_type": document_id.upper(),
                    "product_scope": ["MAKEUP", "SKINCARE"],
                    "region": "CN",
                    "channel": ["ONLINE"],
                    "approval_status": "APPROVED",
                    "effective_from": "2026-01-01",
                    "effective_to": None,
                },
                "embedding": deterministic_embedding(content),
            }
            for (
                chunk_id,
                document_id,
                clause_id,
                content,
                evidence_type,
            ) in chunks
        ],
    )


def downgrade() -> None:
    Base.metadata.drop_all(bind=op.get_bind(), checkfirst=True)
