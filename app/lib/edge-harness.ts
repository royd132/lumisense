import { env, waitUntil } from "cloudflare:workers";
import type { ApiAnalysis, RunInput } from "./carepulse-api";

type Severity = ApiAnalysis["risk"]["severity"];
type D1Row = Record<string, unknown>;

const SUPERVISOR_ROLES = new Set(["SUPERVISOR", "RISK_MANAGER", "ADMIN"]);
const ORDER_RECORDS: Record<string, { title: string; content: string }> = {
  ORDER_1024: {
    title: "ORDER_1024",
    content: "订单于 2026-07-28 11:30 签收；退款状态 NOT_REQUESTED；实付金额 ¥389。",
  },
  ORDER_2088: {
    title: "ORDER_2088 / 批次 B26C0719",
    content: "订单已签收 5 天；实付金额 ¥499；产品批次 B26C0719。",
  },
};

export type StoredRun = {
  runId: string;
  caseId: string;
  status: string;
  result: ApiAnalysis | null;
};

function database(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function now() {
  return new Date().toISOString();
}

function routeFor(intent: string, severity: Severity) {
  if (["HIGH", "CRITICAL", "REVIEW_REQUIRED"].includes(severity)) return "HIGH_RISK";
  return intent === "PRODUCT_INQUIRY" ? "FAQ" : "STANDARD_COMPLAINT";
}

function analyze(input: RunInput, runId: string, caseId: string): ApiAnalysis {
  const text = input.text;
  const safety = /红肿|过敏|刺痛|不良反应/.test(text);
  const refund = /退款|退货|破损/.test(text);
  const publicThreat = /微博|小红书|社交平台|曝光|媒体/.test(text);
  const repeat = (input.contact_count ?? 1) >= 3;
  const overdue = Boolean(input.previous_promise_overdue);
  const order = input.order_id ? ORDER_RECORDS[input.order_id] : undefined;

  const intent = safety
    ? "PRODUCT_SAFETY_COMPLAINT"
    : refund
      ? "REFUND_COMPLAINT"
      : "PRODUCT_INQUIRY";
  const issueType = safety
    ? "ADVERSE_REACTION"
    : refund
      ? /破损/.test(text)
        ? "PRODUCT_DAMAGE"
        : "REFUND_DELAY"
      : "INGREDIENT_USAGE";
  const signals = [
    ...(safety ? ["消费者描述明确产品不良反应"] : []),
    ...(publicThreat ? ["消费者表达公开平台传播倾向"] : []),
    ...(repeat ? [`同一问题已联系 ${input.contact_count} 次`] : []),
    ...(overdue ? ["历史服务承诺已经超时"] : []),
  ];
  const severity: Severity = safety
    ? "CRITICAL"
    : publicThreat || repeat || overdue
      ? "HIGH"
      : "LOW";
  const requiredEvidence = safety
    ? ["ORDER", "PRODUCT", "SAFETY_SOP", "RISK_POLICY"]
    : refund
      ? ["ORDER", "REFUND_POLICY", "CASE_HISTORY", "PROMISE"]
      : ["PRODUCT", "CLAIM_POLICY"];

  const orderEvidence = order
    ? [
        {
          evidence_id: `order:${input.order_id}`,
          evidence_type: "ORDER",
          title: order.title,
          content: order.content,
        },
      ]
    : [];
  const evidence = safety
    ? [
        ...orderEvidence,
        {
          evidence_id: "product:cream_b26c0719:safety",
          evidence_type: "PRODUCT",
          title: "面霜安全资料",
          content: "不良反应原因不得在专业评估前推断。",
        },
        {
          evidence_id: "policy:safety_sop_v6:clause_2_1",
          evidence_type: "SAFETY_SOP",
          title: "产品安全处置 SOP §2.1",
          content: "出现明确红肿时，应建议暂停使用并进入安全事件流程。",
        },
        {
          evidence_id: "policy:risk_escalation_v4:clause_1_3",
          evidence_type: "RISK_POLICY",
          title: "高风险服务升级规则 §1.3",
          content: "不良反应与公开传播意图同时出现时，强制人工升级。",
        },
      ]
    : refund
      ? [
          ...orderEvidence,
          {
            evidence_id: "policy:refund_v5:clause_3_2",
            evidence_type: "REFUND_POLICY",
            title: "破损商品售后政策 §3.2",
            content: "签收 7 日内且已有有效破损凭证，可发起退款资格核验。",
          },
          {
            evidence_id: `history:${input.conversation_id}`,
            evidence_type: "CASE_HISTORY",
            title: "结构化服务历史",
            content: `同一问题已联系 ${input.contact_count ?? 1} 次。`,
          },
          {
            evidence_id: `promise:${input.conversation_id}`,
            evidence_type: "PROMISE",
            title: "历史服务承诺",
            content: overdue ? "上一轮 24 小时反馈承诺已超时。" : "没有超时承诺。",
          },
        ]
      : [
          {
            evidence_id: "product:usage_v4:clause_2",
            evidence_type: "PRODUCT",
            title: "敏感肌首次使用建议",
            content: "首次使用前建议局部测试；持续不适时应停止使用并咨询专业人士。",
          },
          {
            evidence_id: "policy:claim_safety_v3:clause_1_4",
            evidence_type: "CLAIM_POLICY",
            title: "功效沟通合规指引 §1.4",
            content: "客服不得使用治疗疾病或保证效果等医学承诺。",
          },
        ];
  const present = new Set(evidence.map((item) => item.evidence_type));
  const missing = requiredEvidence.filter((kind) => !present.has(kind));
  const reviewApproved = missing.length === 0;
  const draft = safety
    ? "很抱歉得知您出现了红肿。请先暂停使用该产品；如症状明显、持续或加重，请及时寻求专业医疗帮助。经您确认后，我们会立即升级至产品安全团队。完成专业评估前，我们不会对原因作推断。"
    : refund
      ? "很抱歉让您为同一问题多次联系我们。我们已核对到已有记录，无需再次提交相同材料。我们会优先提交退款资格复核；退款仍需完成系统核验，暂不对到账时间作不确定承诺。"
      : "根据已批准的产品说明，建议首次使用前先做局部测试，确认无不适后再逐步使用。如目前正处于持续泛红、破损或治疗期，建议先咨询专业医生。";
  const candidateActions = safety
    ? [
        {
          action: "ESCALATE_PRODUCT_SAFETY",
          reason: "命中明确不良反应硬规则",
          requires_approval: true,
        },
        {
          action: "NOTIFY_DUTY_MANAGER",
          reason: "存在公开平台传播倾向或严重安全信号",
          requires_approval: true,
        },
      ]
    : refund
      ? [
          {
            action: "VERIFY_REFUND_ELIGIBILITY",
            reason: "订单与政策证据支持进入资格核验",
            requires_approval: true,
          },
        ]
      : [];
  const nodes = ["ingestion", "triage_and_risk", "evidence_fan_out", "copilot", "review"];
  const states = [
    "OPEN",
    "EVIDENCE_PENDING",
    "EVIDENCE_PENDING",
    "DRAFT_READY",
    reviewApproved ? "PENDING_AGENT_APPROVAL" : "REVIEW_FAILED",
  ];

  return {
    run_id: runId,
    case_id: caseId,
    state: reviewApproved ? "PENDING_AGENT_APPROVAL" : "REVIEW_FAILED",
    route: routeFor(intent, severity),
    triage: {
      intent,
      issue_type: issueType,
      explicit_request: safety
        ? "解释原因并立即处理"
        : refund
          ? "尽快完成退款"
          : "获得准确产品使用建议",
      implicit_goal: safety
        ? "保障安全并获得可信的升级处理"
        : refund
          ? "确认责任并避免重复沟通"
          : "确认产品是否适合当前场景",
      confidence: safety ? 0.97 : refund ? 0.94 : 0.93,
    },
    risk: { severity, signals, confidence: signals.length ? 0.98 : 0.95 },
    evidence: { items: evidence, missing },
    copilot: {
      consumer_summary: safety
        ? "消费者诉求：解释原因并立即处理。"
        : refund
          ? "消费者诉求：尽快完成退款。"
          : "消费者诉求：获得准确产品使用建议。",
      service_goal: safety
        ? "保障安全并进入受控升级流程"
        : refund
          ? "确认责任并避免重复沟通"
          : "基于批准资料提供准确建议",
      draft_reply: draft,
      recommended_actions: reviewApproved ? candidateActions : [],
    },
    review: {
      approved: reviewApproved,
      violations: missing.map((kind) => ({
        code: "INCOMPLETE_EVIDENCE_PACKET",
        message: `必需证据不完整：${kind}`,
      })),
      confidence: reviewApproved ? 0.98 : 0.91,
    },
    trace: nodes.map((graph_node, index) => ({
      graph_node,
      latency_ms: [2, 7, 12, 5, 4][index],
      state_after: states[index],
    })),
  };
}

async function executeRun(input: RunInput, runId: string, caseId: string) {
  const db = database();
  try {
    const result = analyze(input, runId, caseId);
    const createdAt = now();
    for (const trace of result.trace) {
      await db
        .prepare(
          "INSERT INTO run_events (run_id, event_type, data_json, created_at) VALUES (?, 'trace', ?, ?)",
        )
        .bind(
          runId,
          JSON.stringify({
            node: trace.graph_node,
            latency_ms: trace.latency_ms,
            state_after: trace.state_after,
          }),
          createdAt,
        )
        .run();
    }
    await db.batch([
      db
        .prepare(
          "UPDATE service_cases SET state = ?, route = ?, risk_severity = ?, result_json = ?, updated_at = ? WHERE id = ?",
        )
        .bind(
          result.state,
          result.route,
          result.risk.severity,
          JSON.stringify(result),
          createdAt,
          caseId,
        ),
      db
        .prepare(
          "UPDATE agent_runs SET status = 'WAITING_APPROVAL', result_json = ?, updated_at = ? WHERE id = ?",
        )
        .bind(JSON.stringify(result), createdAt, runId),
      db
        .prepare(
          "INSERT INTO run_events (run_id, event_type, data_json, created_at) VALUES (?, 'interrupt', ?, ?)",
        )
        .bind(
          runId,
          JSON.stringify({ state: result.state, route: result.route }),
          createdAt,
        ),
    ]);
  } catch {
    const failedAt = now();
    await db.batch([
      db
        .prepare("UPDATE agent_runs SET status = 'FAILED', error = ?, updated_at = ? WHERE id = ?")
        .bind("Harness execution failed", failedAt, runId),
      db
        .prepare(
          "INSERT INTO run_events (run_id, event_type, data_json, created_at) VALUES (?, 'failed', ?, ?)",
        )
        .bind(runId, JSON.stringify({ message: "自动分析失败，已转人工复核。" }), failedAt),
    ]);
  }
}

export async function createRun(input: RunInput) {
  const runId = id("run");
  const caseId = id("case");
  const createdAt = now();
  const db = database();
  await db.batch([
    db
      .prepare(
        "INSERT INTO service_cases (id, conversation_id, customer_id, state, route, risk_severity, result_json, created_at, updated_at) VALUES (?, ?, ?, 'OPEN', 'PROCESSING', 'REVIEW_REQUIRED', '{}', ?, ?)",
      )
      .bind(caseId, input.conversation_id, input.customer_id, createdAt, createdAt),
    db
      .prepare(
        "INSERT INTO agent_runs (id, case_id, status, request_json, result_json, created_at, updated_at) VALUES (?, ?, 'PROCESSING', ?, '{}', ?, ?)",
      )
      .bind(runId, caseId, JSON.stringify(input), createdAt, createdAt),
  ]);
  waitUntil(executeRun(input, runId, caseId));
  return { run_id: runId, case_id: caseId, status: "PROCESSING" };
}

export async function getRun(runId: string): Promise<StoredRun | null> {
  const row = await database()
    .prepare("SELECT id, case_id, status, result_json FROM agent_runs WHERE id = ?")
    .bind(runId)
    .first<D1Row>();
  if (!row) return null;
  const rawResult = String(row.result_json);
  return {
    runId: String(row.id),
    caseId: String(row.case_id),
    status: String(row.status),
    result: rawResult === "{}" ? null : (JSON.parse(rawResult) as ApiAnalysis),
  };
}

export async function getEventsAfter(runId: string, cursor: number) {
  const rows = await database()
    .prepare(
      "SELECT id, event_type, data_json FROM run_events WHERE run_id = ? AND id > ? ORDER BY id",
    )
    .bind(runId, cursor)
    .all<D1Row>();
  return rows.results.map((row) => ({
    id: Number(row.id),
    event: String(row.event_type),
    data: JSON.parse(String(row.data_json)) as Record<string, unknown>,
  }));
}

export async function healthCheck() {
  const row = await database().prepare("SELECT 1 AS ok").first<{ ok: number }>();
  if (row?.ok !== 1) throw new Error("D1 readiness query failed");
  return {
    status: "ok",
    service: "carepulse-edge-harness",
    persistence: "D1",
  };
}

export async function roleForUser(email: string) {
  const row = await database()
    .prepare("SELECT role FROM user_roles WHERE email = ?")
    .bind(email.toLowerCase())
    .first<{ role: string }>();
  return row?.role ?? "AGENT";
}

async function stableOutboxId(key: string) {
  const bytes = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `out_${[...new Uint8Array(digest)]
    .slice(0, 6)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

async function consumeOutbox(eventIds: string[]) {
  const db = database();
  for (const eventId of eventIds) {
    const claimed = await db
      .prepare(
        "UPDATE outbox_events SET status = 'PROCESSING' WHERE id = ? AND status IN ('PENDING', 'RETRY') RETURNING id, case_id, action_type, idempotency_key",
      )
      .bind(eventId)
      .first<D1Row>();
    if (!claimed) continue;
    const processedAt = now();
    try {
      await db.batch([
        db
          .prepare(
            "INSERT OR IGNORE INTO action_executions (id, case_id, action_type, idempotency_key, status, result_json, created_at) VALUES (?, ?, ?, ?, 'CREATED', ?, ?)",
          )
          .bind(
            `exec_${String(claimed.id).replace(/^out_/, "")}`,
            claimed.case_id,
            claimed.action_type,
            claimed.idempotency_key,
            JSON.stringify({ queue: "controlled_action", external_dispatch: false }),
            processedAt,
          ),
        db
          .prepare(
            "UPDATE outbox_events SET status = 'PROCESSED', processed_at = ? WHERE id = ?",
          )
          .bind(processedAt, eventId),
      ]);
    } catch (error) {
      await db
        .prepare(
          "UPDATE outbox_events SET status = 'RETRY', attempts = attempts + 1, last_error = ? WHERE id = ?",
        )
        .bind(error instanceof Error ? error.message.slice(0, 1000) : "dispatch failed", eventId)
        .run();
    }
  }
}

export async function approveRun(
  caseId: string,
  payload: {
    decision: "ACCEPT" | "EDIT" | "REJECT" | "ESCALATE";
    edited_reply?: string;
    reason?: string;
    approved_action_ids?: string[];
  },
  principal: { agentId: string; role: string },
) {
  const db = database();
  const row = await db
    .prepare("SELECT id, status, result_json FROM agent_runs WHERE case_id = ?")
    .bind(caseId)
    .first<D1Row>();
  if (!row) return { error: "case not found", status: 404 };
  if (row.status !== "WAITING_APPROVAL") {
    return { error: "case is not waiting for approval", status: 409 };
  }
  const result = JSON.parse(String(row.result_json)) as ApiAnalysis;
  const selected = payload.approved_action_ids ?? [];
  const available = new Map(
    result.copilot.recommended_actions.map((action) => [action.action, action]),
  );
  if (payload.decision === "REJECT" && selected.length > 0) {
    return { error: "rejected replies cannot approve actions", status: 422 };
  }
  if (!result.review.approved && payload.decision !== "REJECT") {
    return { error: "review-failed cases cannot be approved", status: 409 };
  }
  if (selected.some((action) => !available.has(action))) {
    return { error: "unknown action id", status: 422 };
  }
  const supervisorOnly = new Set([
    "ESCALATE_PRODUCT_SAFETY",
    "NOTIFY_DUTY_MANAGER",
  ]);
  if (
    selected.some((action) => supervisorOnly.has(action)) &&
    !SUPERVISOR_ROLES.has(principal.role)
  ) {
    return { error: "supervisor approval required", status: 403 };
  }
  if (
    payload.decision === "ESCALATE" &&
    ["HIGH", "CRITICAL"].includes(result.risk.severity) &&
    !SUPERVISOR_ROLES.has(principal.role)
  ) {
    return { error: "high-risk escalation requires supervisor", status: 403 };
  }
  const claim = await db
    .prepare(
      "UPDATE agent_runs SET status = 'APPROVING', updated_at = ? WHERE id = ? AND status = 'WAITING_APPROVAL'",
    )
    .bind(now(), row.id)
    .run();
  if ((claim.meta.changes ?? 0) !== 1) {
    return { error: "case approval was already claimed", status: 409 };
  }

  const targetState =
    payload.decision === "REJECT"
      ? "REVIEW_FAILED"
      : payload.decision === "ESCALATE"
        ? "ESCALATED"
        : "APPROVED";
  result.state = targetState;
  if (payload.edited_reply) result.copilot.draft_reply = payload.edited_reply;
  const approvalId = id("apr");
  const createdAt = now();
  const outbox = await Promise.all(
    selected.map(async (action) => {
      const key = `${caseId}:${action}:edge_v2`;
      return { id: await stableOutboxId(key), key, action };
    }),
  );
  try {
    await db.batch([
      db
        .prepare(
          "UPDATE service_cases SET state = ?, result_json = ?, updated_at = ? WHERE id = ?",
        )
        .bind(targetState, JSON.stringify(result), createdAt, caseId),
      db
        .prepare(
          "UPDATE agent_runs SET status = 'COMPLETED', result_json = ?, updated_at = ? WHERE id = ? AND status = 'APPROVING'",
        )
        .bind(JSON.stringify(result), createdAt, row.id),
      db
        .prepare(
          "INSERT INTO approval_events (id, case_id, agent_id, agent_role, decision, approved_action_ids_json, edited_reply, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          approvalId,
          caseId,
          principal.agentId,
          principal.role,
          payload.decision,
          JSON.stringify(selected),
          payload.edited_reply ?? null,
          payload.reason ?? null,
          createdAt,
        ),
      ...outbox.map((item) =>
        db
          .prepare(
            "INSERT OR IGNORE INTO outbox_events (id, case_id, action_type, payload_json, idempotency_key, status, attempts, created_at) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?)",
          )
          .bind(
            item.id,
            caseId,
            item.action,
            JSON.stringify({ case_id: caseId, approval_id: approvalId }),
            item.key,
            createdAt,
          ),
      ),
    ]);
  } catch (error) {
    await db
      .prepare(
        "UPDATE agent_runs SET status = 'WAITING_APPROVAL', error = ? WHERE id = ? AND status = 'APPROVING'",
      )
      .bind(error instanceof Error ? error.message.slice(0, 1000) : "approval failed", row.id)
      .run();
    throw error;
  }
  await consumeOutbox(outbox.map((item) => item.id));
  return {
    state: targetState,
    outbox_event_ids: outbox.map((item) => item.id),
    status: 200,
  };
}
