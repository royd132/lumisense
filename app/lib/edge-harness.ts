import { env, waitUntil } from "cloudflare:workers";
import type { ApiAnalysis, RunInput } from "./carepulse-api";
import { applyLiveModel } from "./openai-runtime";

type Severity = ApiAnalysis["risk"]["severity"];
type D1Row = Record<string, unknown>;
type AccessScope = { email: string; canReadAll: boolean };
type ApprovalDecision =
  | "ACCEPT"
  | "EDIT"
  | "REJECT"
  | "ESCALATE"
  | "REQUEST_ESCALATION";

const PROMPT_VERSION = "edge_harness_v4";
const MODEL_ALIAS = "deterministic_structured_fallback";
const SUPERVISOR_ROLES = new Set(["SUPERVISOR", "RISK_MANAGER", "ADMIN"]);
const MAX_OUTBOX_ATTEMPTS = 5;

const ORDER_RECORDS: Record<
  string,
  {
    title: string;
    content: string;
    productId: string;
    deliveredAt: string;
    refundStatus: string;
  }
> = {
  ORDER_1024: {
    title: "ORDER_1024",
    content:
      "订单于 2026-07-28 11:30 签收；退款状态 NOT_REQUESTED；实付金额 ¥389。",
    productId: "FOUNDATION_P120",
    deliveredAt: "2026-07-28T11:30:00+08:00",
    refundStatus: "NOT_REQUESTED",
  },
  ORDER_2088: {
    title: "ORDER_2088 / 批次 B26C0719",
    content: "订单已签收 5 天；实付金额 ¥499；产品批次 B26C0719。",
    productId: "CREAM_B26C0719",
    deliveredAt: "2026-07-25T10:00:00+08:00",
    refundStatus: "NOT_REQUESTED",
  },
};

const PRODUCT_RECORDS: Record<
  string,
  { title: string; content: string; category: string }
> = {
  SERUM_HA30: {
    title: "复颜玻尿酸精华 30ml / 已批准产品资料",
    content:
      "配方含透明质酸类保湿成分；产品定位为日常保湿，不属于治疗产品。敏感肌首次使用建议先做局部测试；皮肤屏障破损、持续泛红或处于治疗期时，应先咨询专业人士。",
    category: "SKINCARE",
  },
  FOUNDATION_P120: {
    title: "持妆粉底液 P120 产品与安全资料",
    content:
      "彩妆产品出现明确刺激、刺痛或红肿时应立即停止使用；需记录使用部位、出现时间、症状与产品批次，在专业评估前不得推断原因。",
    category: "MAKEUP",
  },
  CREAM_B26C0719: {
    title: "玻色因紧致面霜 50ml / 批次 B26C0719",
    content:
      "该面霜为日常护肤产品，不用于治疗皮肤疾病。出现明确红肿、起疹或灼热时应立即停止使用；需记录使用部位、出现时间、症状与批次，在专业评估前不得推断原因。",
    category: "SKINCARE",
  },
};

const SUPPORTED_CONTROLLED_ACTIONS = new Set([
  "VERIFY_REFUND_ELIGIBILITY",
  "ESCALATE_PRODUCT_SAFETY",
  "NOTIFY_DUTY_MANAGER",
  "REQUEST_SUPERVISOR_REVIEW",
]);

export type StoredRun = {
  runId: string;
  caseId: string;
  status: string;
  result: ApiAnalysis | null;
};

export type DashboardSnapshot = {
  generated_at: string;
  totals: {
    cases: number;
    critical: number;
    high: number;
    waiting_approval: number;
    pending_supervisor: number;
    repeat_complaints: number;
    overdue_promises: number;
    pending_actions: number;
    dead_letter_actions: number;
  };
  approval_rate: number;
  average_edit_rate: number;
  risk_trend: { date: string; count: number }[];
  issue_distribution: { issue: string; count: number }[];
  queue: {
    id: string;
    state: string;
    severity: string;
    issue: string;
    owner: string;
    updated_at: string;
  }[];
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

function editRatio(before: string, after: string) {
  if (before === after) return 0;
  if (!before.length || !after.length) return 1;
  let changed = Math.abs(before.length - after.length);
  const shared = Math.min(before.length, after.length);
  for (let index = 0; index < shared; index += 1) {
    if (before[index] !== after[index]) changed += 1;
  }
  return Math.min(1, changed / Math.max(before.length, after.length));
}

function sanitizeModelInput(value: string) {
  return value
    .replace(/\b1[3-9]\d{9}\b/g, "[手机号已脱敏]")
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[邮箱已脱敏]",
    )
    .replace(
      /(?:地址|住址)[：:]\s*[^，。\n]{4,80}/g,
      "地址：[地址已脱敏]",
    );
}

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hashed = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashed)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function routeFor(intent: string, severity: Severity) {
  if (["HIGH", "CRITICAL", "REVIEW_REQUIRED"].includes(severity)) {
    return "HIGH_RISK";
  }
  return intent === "PRODUCT_INQUIRY" ? "FAQ" : "STANDARD_COMPLAINT";
}

export function analyzeDeterministic(
  input: RunInput,
  runId: string,
  caseId: string,
  inputHash: string,
): ApiAnalysis {
  const text = input.text;
  const safety =
    /红肿|过敏|刺痛|不良反应|灼热|起疹|发痒|瘙痒|脱皮|肿胀|烫伤感/.test(
      text,
    );
  const damaged =
    /(?:商品|产品|包裹|包装|外包装|瓶身|快递|粉底液|面霜|精华).{0,8}破损|破损.{0,8}(?:商品|产品|包裹|包装|外包装|瓶身|快递|粉底液|面霜|精华|照片)|碎裂|漏液/.test(
      text,
    );
  const refund = /退款|退货|到账|退钱|售后/.test(text) || damaged;
  const publicThreat =
    /微博|小红书|抖音|社交平台|曝光|媒体|监管|消协|投诉平台|律师/.test(
      text,
    );
  const inferredRepeat =
    /第[三四五六七八九十\d]+次|反复联系|联系了很多次|一直没人处理/.test(
      text,
    );
  const inferredOverdue =
    /承诺.*(?:超时|没处理|没结果|没消息)|说好.*(?:没处理|没结果|没消息)|超过.*小时/.test(
      text,
    );
  const repeat = (input.contact_count ?? 1) >= 3 || inferredRepeat;
  const overdue =
    input.previous_promise_overdue === true || inferredOverdue;
  const order = input.order_id ? ORDER_RECORDS[input.order_id] : undefined;
  const inferredProductId = /玻尿酸|精华/.test(text)
    ? "SERUM_HA30"
    : /粉底/.test(text)
      ? "FOUNDATION_P120"
      : /面霜/.test(text)
        ? "CREAM_B26C0719"
        : undefined;
  const productId = order?.productId ?? input.product_id ?? inferredProductId;
  const product = productId ? PRODUCT_RECORDS[productId] : undefined;

  const intent = safety
    ? "PRODUCT_SAFETY_COMPLAINT"
    : refund
      ? "REFUND_COMPLAINT"
      : "PRODUCT_INQUIRY";
  const issueType = safety
    ? "ADVERSE_REACTION"
    : refund
      ? damaged
        ? "PRODUCT_DAMAGE"
        : "REFUND_DELAY"
      : "INGREDIENT_USAGE";
  const signals = [
    ...(safety ? ["消费者描述明确产品不良反应"] : []),
    ...(publicThreat ? ["消费者表达公开传播、法律或监管升级倾向"] : []),
    ...(repeat
      ? [
          input.contact_count
            ? `同一问题已联系 ${input.contact_count} 次`
            : "文本表明消费者已反复联系",
        ]
      : []),
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
  const productEvidence = product
    ? [
        {
          evidence_id: `product:${productId?.toLowerCase()}`,
          evidence_type: "PRODUCT",
          title: product.title,
          content: product.content,
        },
      ]
    : [];
  const evidence = safety
    ? [
        ...orderEvidence,
        ...productEvidence,
        {
          evidence_id: "policy:safety_sop_v6:clause_2_1",
          evidence_type: "SAFETY_SOP",
          title: "产品安全处置 SOP §2.1",
          content:
            "出现红肿、起疹、刺痛或灼热时，应建议暂停使用；记录使用部位、出现时间、症状、就医情况和产品批次，并进入安全事件收集流程。客服不得诊断或推断因果。",
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
            evidence_id: damaged
              ? "policy:refund_damage_v5:clause_3_2"
              : "policy:refund_progress_v5:clause_4_1",
            evidence_type: "REFUND_POLICY",
            title: damaged
              ? "破损商品售后政策 §3.2"
              : "退款进度与时效政策 §4.1",
            content: damaged
              ? "签收 7 日内且已有有效破损凭证，可发起退款资格核验。"
              : "退款状态与到账时间必须以 OMS/支付渠道核验结果为准，不得提前承诺。",
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
            content: overdue
              ? "上一轮 24 小时反馈承诺已超时。"
              : "没有超时承诺。",
          },
        ]
      : [
          ...(productEvidence.length
            ? productEvidence
            : [
                {
                  evidence_id: "product:usage_v4:clause_2",
                  evidence_type: "PRODUCT",
                  title: "敏感肌首次使用建议",
                  content:
                    "首次使用前建议局部测试；持续不适时应停止使用并咨询专业人士。",
                },
              ]),
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
          reason: "存在公开传播倾向或严重安全信号",
          requires_approval: true,
        },
      ]
    : refund
      ? [
          {
            action: "VERIFY_REFUND_ELIGIBILITY",
            reason: "订单与适用政策证据支持进入资格核验",
            requires_approval: true,
          },
        ]
      : [];
  const nodes = [
    "ingestion",
    "triage_and_risk",
    "evidence_fan_out",
    "copilot",
    "review",
  ];
  const states = [
    "OPEN",
    "EVIDENCE_PENDING",
    "EVIDENCE_PENDING",
    "DRAFT_READY",
    reviewApproved ? "PENDING_AGENT_APPROVAL" : "REVIEW_FAILED",
  ];
  const evidenceRefs = evidence.map((item) => item.evidence_id);

  return {
    run_id: runId,
    case_id: caseId,
    state: reviewApproved ? "PENDING_AGENT_APPROVAL" : "REVIEW_FAILED",
    route: routeFor(intent, severity),
    runtime: {
      harness: "EDGE_D1",
      model_mode: "STRUCTURED_FALLBACK",
      model: MODEL_ALIAS,
      fallback_reason: null,
      model_latency_ms: 0,
      input_tokens: 0,
      output_tokens: 0,
    },
    triage: {
      intent,
      issue_type: issueType,
      explicit_request: safety
        ? "解释原因并立即处理"
        : refund
          ? "尽快完成退款处理"
          : "获得准确产品使用建议",
      implicit_goal: safety
        ? "保障安全并获得可信的升级处理"
        : refund
          ? "确认责任并避免重复沟通"
          : "确认产品是否适合当前场景",
      entities: {
        order_id: input.order_id ?? null,
        product_id: productId ?? null,
      },
      required_evidence: requiredEvidence,
      confidence: safety ? 0.97 : refund ? 0.94 : 0.93,
    },
    risk: { severity, signals, confidence: signals.length ? 0.98 : 0.95 },
    evidence: { items: evidence, missing },
    copilot: {
      consumer_summary: safety
        ? "消费者诉求：解释原因并立即处理。"
        : refund
          ? "消费者诉求：尽快完成退款处理。"
          : "消费者诉求：获得准确产品使用建议。",
      service_goal: safety
        ? "保障安全并进入受控升级流程"
        : refund
          ? "确认责任并避免重复沟通"
          : "基于批准资料提供准确建议",
      draft_reply: draft,
      recommended_actions: reviewApproved ? candidateActions : [],
      evidence_refs: evidenceRefs,
      uncertainties: missing.map((kind) => `缺少 ${kind} 证据`),
    },
    review: {
      approved: reviewApproved,
      violations: missing.map((kind) => ({
        code: "INCOMPLETE_EVIDENCE_PACKET",
        message: `必需证据不完整：${kind}`,
      })),
      revision_required: !reviewApproved,
      confidence: reviewApproved ? 0.98 : 0.91,
    },
    trace: nodes.map((graph_node, index) => ({
      graph_node,
      latency_ms: [2, 7, 12, 5, 4][index],
      state_before: index === 0 ? "OPEN" : states[index - 1],
      state_after: states[index],
      model: MODEL_ALIAS,
      model_version: "carepulse_edge_v4",
      prompt_version:
        graph_node === "triage_and_risk"
          ? "triage_v2"
          : graph_node === "copilot"
            ? "copilot_v2"
            : graph_node === "review"
              ? "review_v2"
              : null,
      input_hash: inputHash,
      tool_calls:
        graph_node === "evidence_fan_out"
          ? evidence.map((item) => `read:${item.evidence_type}`)
          : [],
      evidence_ids:
        graph_node === "copilot" || graph_node === "review"
          ? evidenceRefs
          : [],
      risk_signals:
        graph_node === "triage_and_risk" || graph_node === "review"
          ? signals
          : [],
      agent_output: {
        artifact_type:
          graph_node === "triage_and_risk"
            ? "triage"
            : graph_node === "copilot"
              ? "copilot"
              : graph_node === "review"
                ? "review"
                : "deterministic_service",
      },
      validator_output:
        graph_node === "review"
          ? { approved: reviewApproved, missing_evidence: missing }
          : {},
      token_usage: {},
      fallback_used: true,
    })),
  };
}

async function executeRun(
  input: RunInput,
  runId: string,
  caseId: string,
  inputHash: string,
) {
  const db = database();
  try {
    const result = await applyLiveModel(
      analyzeDeterministic(input, runId, caseId, inputHash),
      input,
      inputHash,
    );
    const createdAt = now();
    const artifacts = [
      ["triage", result.triage, "triage_v2"],
      ["risk", result.risk, null],
      ["evidence", result.evidence, null],
      ["copilot", result.copilot, "copilot_v2"],
      ["review", result.review, "review_v2"],
    ] as const;

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
            state_before: trace.state_before,
            state_after: trace.state_after,
            prompt_version: trace.prompt_version,
            evidence_ids: trace.evidence_ids,
            model: trace.model,
            fallback_used: trace.fallback_used,
          }),
          createdAt,
        )
        .run();
    }
    await db.batch([
      ...artifacts.map(([artifactType, data, promptVersion]) =>
        db
          .prepare(
            "INSERT OR REPLACE INTO agent_artifacts (run_id, artifact_type, data_json, prompt_version, created_at) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(
            runId,
            artifactType,
            JSON.stringify(data),
            promptVersion,
            createdAt,
          ),
      ),
      db
        .prepare(
          "INSERT INTO risk_events (id, case_id, severity, signals_json, route, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(
          id("risk"),
          caseId,
          result.risk.severity,
          JSON.stringify(result.risk.signals),
          result.route,
          createdAt,
        ),
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
          "UPDATE agent_runs SET status = 'WAITING_APPROVAL', result_json = ?, model_alias = ?, updated_at = ? WHERE id = ?",
        )
        .bind(
          JSON.stringify(result),
          result.runtime.model,
          createdAt,
          runId,
        ),
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
  } catch (error) {
    const failedAt = now();
    await db.batch([
      db
        .prepare(
          "UPDATE agent_runs SET status = 'FAILED', error = ?, updated_at = ? WHERE id = ?",
        )
        .bind(
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Harness execution failed",
          failedAt,
          runId,
        ),
      db
        .prepare(
          "UPDATE service_cases SET state = 'REVIEW_FAILED', risk_severity = 'REVIEW_REQUIRED', updated_at = ? WHERE id = ?",
        )
        .bind(failedAt, caseId),
      db
        .prepare(
          "INSERT INTO run_events (run_id, event_type, data_json, created_at) VALUES (?, 'failed', ?, ?)",
        )
        .bind(
          runId,
          JSON.stringify({ message: "自动分析失败，已转人工复核。" }),
          failedAt,
        ),
    ]);
  }
}

export async function createRun(input: RunInput, ownerEmail: string) {
  const sanitizedInput = sanitizeModelInput(input.text);
  const inputHash = await digest(
    JSON.stringify({
      ...input,
      text: sanitizedInput,
      owner_email: ownerEmail.toLowerCase(),
    }),
  );
  const requestKey = `${ownerEmail.toLowerCase()}:${input.conversation_id}:${inputHash}`;
  const db = database();
  const existing = await db
    .prepare(
      "SELECT s.id AS case_id, r.id AS run_id, r.status FROM service_cases s JOIN agent_runs r ON r.case_id = s.id WHERE s.request_key = ? ORDER BY r.created_at DESC LIMIT 1",
    )
    .bind(requestKey)
    .first<D1Row>();
  if (existing) {
    waitUntil(drainOutbox());
    return {
      run_id: String(existing.run_id),
      case_id: String(existing.case_id),
      status: String(existing.status),
      reused: true,
    };
  }

  const runId = id("run");
  const caseId = id("case");
  const createdAt = now();
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO service_cases (id, conversation_id, customer_id, owner_email, assigned_agent_email, original_input, sanitized_input, request_key, state, route, risk_severity, result_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', 'PROCESSING', 'REVIEW_REQUIRED', '{}', ?, ?)",
        )
        .bind(
          caseId,
          input.conversation_id,
          input.customer_id,
          ownerEmail.toLowerCase(),
          ownerEmail.toLowerCase(),
          input.text,
          sanitizedInput,
          requestKey,
          createdAt,
          createdAt,
        ),
      db
        .prepare(
          "INSERT INTO agent_runs (id, case_id, status, request_json, result_json, input_hash, prompt_version, model_alias, created_at, updated_at) VALUES (?, ?, 'PROCESSING', ?, '{}', ?, ?, ?, ?, ?)",
        )
        .bind(
          runId,
          caseId,
          JSON.stringify({ ...input, text: sanitizedInput }),
          inputHash,
          PROMPT_VERSION,
          MODEL_ALIAS,
          createdAt,
          createdAt,
        ),
    ]);
  } catch (error) {
    const raced = await db
      .prepare(
        "SELECT s.id AS case_id, r.id AS run_id, r.status FROM service_cases s JOIN agent_runs r ON r.case_id = s.id WHERE s.request_key = ? ORDER BY r.created_at DESC LIMIT 1",
      )
      .bind(requestKey)
      .first<D1Row>();
    if (raced) {
      return {
        run_id: String(raced.run_id),
        case_id: String(raced.case_id),
        status: String(raced.status),
        reused: true,
      };
    }
    throw error;
  }
  waitUntil(
    Promise.all([
      executeRun({ ...input, text: sanitizedInput }, runId, caseId, inputHash),
      drainOutbox(),
    ]),
  );
  return { run_id: runId, case_id: caseId, status: "PROCESSING", reused: false };
}

function accessClause(scope: AccessScope, alias = "s") {
  return scope.canReadAll
    ? { sql: "", binds: [] as string[] }
    : { sql: ` AND ${alias}.owner_email = ?`, binds: [scope.email.toLowerCase()] };
}

export async function getRun(
  runId: string,
  scope: AccessScope,
): Promise<StoredRun | null> {
  const access = accessClause(scope);
  const row = await database()
    .prepare(
      `SELECT r.id, r.case_id, r.status, r.result_json
       FROM agent_runs r
       JOIN service_cases s ON s.id = r.case_id
       WHERE r.id = ?${access.sql}`,
    )
    .bind(runId, ...access.binds)
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

export async function getEventsAfter(
  runId: string,
  cursor: number,
  scope: AccessScope,
) {
  const access = accessClause(scope);
  const rows = await database()
    .prepare(
      `SELECT e.id, e.event_type, e.data_json
       FROM run_events e
       JOIN agent_runs r ON r.id = e.run_id
       JOIN service_cases s ON s.id = r.case_id
       WHERE e.run_id = ? AND e.id > ?${access.sql}
       ORDER BY e.id`,
    )
    .bind(runId, cursor, ...access.binds)
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
  const queue = await database()
    .prepare(
      "SELECT COUNT(*) AS pending FROM outbox_events WHERE status IN ('PENDING', 'RETRY', 'PROCESSING')",
    )
    .first<{ pending: number }>();
  return {
    status: "ok",
    service: "carepulse-edge-harness",
    persistence: "D1",
    outbox_pending: Number(queue?.pending ?? 0),
  };
}

export async function roleForUser(email: string) {
  const row = await database()
    .prepare("SELECT role FROM user_roles WHERE email = ?")
    .bind(email.toLowerCase())
    .first<{ role: string }>();
  return row?.role?.toUpperCase() ?? "AGENT";
}

async function stableOutboxId(key: string) {
  return `out_${(await digest(key)).slice(0, 12)}`;
}

async function dispatchControlledTask(claimed: D1Row) {
  if (!SUPPORTED_CONTROLLED_ACTIONS.has(String(claimed.action_type))) {
    throw new Error(`unsupported controlled action: ${claimed.action_type}`);
  }
  const createdAt = now();
  await database()
    .prepare(
      "INSERT OR IGNORE INTO action_executions (id, outbox_event_id, case_id, action_type, idempotency_key, status, result_json, created_at) VALUES (?, ?, ?, ?, ?, 'CREATED', ?, ?)",
    )
    .bind(
      `exec_${String(claimed.id).replace(/^out_/, "")}`,
      claimed.id,
      claimed.case_id,
      claimed.action_type,
      claimed.idempotency_key,
      JSON.stringify({
        queue: "controlled_action",
        external_dispatch: false,
        adapter_state: "READY_FOR_TYPED_ADAPTER",
      }),
      createdAt,
    )
    .run();
}

export async function drainOutbox(limit = 20) {
  const db = database();
  const dueAt = now();
  const candidates = await db
    .prepare(
      "SELECT id FROM outbox_events WHERE status IN ('PENDING', 'RETRY') AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at LIMIT ?",
    )
    .bind(dueAt, Math.min(Math.max(limit, 1), 100))
    .all<{ id: string }>();
  let processed = 0;
  let retried = 0;
  let deadLettered = 0;
  for (const candidate of candidates.results) {
    const claimed = await db
      .prepare(
        "UPDATE outbox_events SET status = 'PROCESSING' WHERE id = ? AND status IN ('PENDING', 'RETRY') RETURNING id, case_id, action_type, idempotency_key, attempts",
      )
      .bind(candidate.id)
      .first<D1Row>();
    if (!claimed) continue;
    try {
      await dispatchControlledTask(claimed);
      const processedAt = now();
      await db
        .prepare(
          "UPDATE outbox_events SET status = 'PROCESSED', processed_at = ?, last_error = NULL WHERE id = ? AND status = 'PROCESSING'",
        )
        .bind(processedAt, claimed.id)
        .run();
      processed += 1;
    } catch (error) {
      const attempts = Number(claimed.attempts ?? 0) + 1;
      const exhausted = attempts >= MAX_OUTBOX_ATTEMPTS;
      const nextAttempt = exhausted
        ? null
        : new Date(
            Date.now() + Math.min(300, 2 ** attempts) * 1000,
          ).toISOString();
      await db
        .prepare(
          "UPDATE outbox_events SET status = ?, attempts = ?, last_error = ?, next_attempt_at = ? WHERE id = ? AND status = 'PROCESSING'",
        )
        .bind(
          exhausted ? "DEAD_LETTER" : "RETRY",
          attempts,
          error instanceof Error ? error.message.slice(0, 1000) : "dispatch failed",
          nextAttempt,
          claimed.id,
        )
        .run();
      if (exhausted) deadLettered += 1;
      else retried += 1;
    }
  }
  return { processed, retried, dead_lettered: deadLettered };
}

export async function approveRun(
  caseId: string,
  payload: {
    decision: ApprovalDecision;
    edited_reply?: string;
    reason?: string;
    approved_action_ids?: string[];
  },
  principal: { agentId: string; email: string; role: string },
) {
  const db = database();
  const privileged = SUPERVISOR_ROLES.has(principal.role.toUpperCase());
  const row = await db
    .prepare(
      `SELECT r.id, r.status, r.result_json, s.owner_email
       FROM agent_runs r
       JOIN service_cases s ON s.id = r.case_id
       WHERE r.case_id = ?
       ORDER BY r.created_at DESC
       LIMIT 1`,
    )
    .bind(caseId)
    .first<D1Row>();
  if (!row) return { error: "case not found", status: 404 };
  if (!privileged && String(row.owner_email).toLowerCase() !== principal.email) {
    return { error: "case access denied", status: 403 };
  }
  const currentStatus = String(row.status);
  if (!["WAITING_APPROVAL", "WAITING_SUPERVISOR"].includes(currentStatus)) {
    return { error: "case is not waiting for approval", status: 409 };
  }
  const result = JSON.parse(String(row.result_json)) as ApiAnalysis;
  const selected = payload.approved_action_ids ?? [];
  const available = new Map(
    result.copilot.recommended_actions.map((action) => [
      action.action,
      action,
    ]),
  );
  if (payload.decision === "REJECT" && selected.length > 0) {
    return { error: "rejected replies cannot approve actions", status: 422 };
  }
  if (
    !result.review.approved &&
    !["REJECT", "REQUEST_ESCALATION"].includes(payload.decision) &&
    !(payload.decision === "ESCALATE" && privileged)
  ) {
    return { error: "review-failed cases cannot be approved", status: 409 };
  }
  if (
    payload.decision !== "REQUEST_ESCALATION" &&
    selected.some(
      (action) =>
        !available.has(action) &&
        !(
          privileged &&
          payload.decision === "ESCALATE" &&
          result.risk.severity === "CRITICAL" &&
          action === "ESCALATE_PRODUCT_SAFETY"
        ),
    )
  ) {
    return { error: "unknown action id", status: 422 };
  }
  if (payload.decision === "EDIT" && !payload.edited_reply?.trim()) {
    return { error: "edited reply is required", status: 422 };
  }
  if (
    result.risk.severity === "CRITICAL" &&
    !["ESCALATE", "REQUEST_ESCALATION", "REJECT"].includes(payload.decision)
  ) {
    return { error: "critical cases must be escalated or rejected", status: 409 };
  }
  const supervisorOnly = new Set([
    "ESCALATE_PRODUCT_SAFETY",
    "NOTIFY_DUTY_MANAGER",
  ]);
  if (
    selected.some((action) => supervisorOnly.has(action)) &&
    !privileged
  ) {
    return { error: "supervisor approval required", status: 403 };
  }
  if (
    payload.decision === "ESCALATE" &&
    ["HIGH", "CRITICAL"].includes(result.risk.severity) &&
    !privileged
  ) {
    return { error: "high-risk escalation requires supervisor", status: 403 };
  }
  if (
    payload.decision === "ESCALATE" &&
    result.risk.severity === "CRITICAL" &&
    !selected.includes("ESCALATE_PRODUCT_SAFETY")
  ) {
    return {
      error: "critical escalation must explicitly approve the safety action",
      status: 422,
    };
  }
  if (
    currentStatus === "WAITING_SUPERVISOR" &&
    payload.decision !== "ESCALATE" &&
    payload.decision !== "REJECT"
  ) {
    return { error: "supervisor queue requires a final decision", status: 409 };
  }

  const actions =
    payload.decision === "REQUEST_ESCALATION"
      ? ["REQUEST_SUPERVISOR_REVIEW"]
      : selected;
  const claim = await db
    .prepare(
      "UPDATE agent_runs SET status = 'APPROVING', updated_at = ? WHERE id = ? AND status = ?",
    )
    .bind(now(), row.id, currentStatus)
    .run();
  if ((claim.meta.changes ?? 0) !== 1) {
    return { error: "case approval was already claimed", status: 409 };
  }

  const targetState =
    payload.decision === "REJECT"
      ? "REVIEW_FAILED"
      : payload.decision === "REQUEST_ESCALATION"
        ? "PENDING_SUPERVISOR_APPROVAL"
        : payload.decision === "ESCALATE"
          ? "ESCALATED"
          : "APPROVED";
  const targetRunStatus =
    payload.decision === "REQUEST_ESCALATION"
      ? "WAITING_SUPERVISOR"
      : "COMPLETED";
  result.state = targetState;
  if (payload.edited_reply) result.copilot.draft_reply = payload.edited_reply;
  const approvalId = id("apr");
  const createdAt = now();
  const outbox = await Promise.all(
    actions.map(async (action) => {
      const key = `${caseId}:${action}:${PROMPT_VERSION}`;
      return { id: await stableOutboxId(key), key, action };
    }),
  );
  try {
    await db.batch([
      db
        .prepare(
          "UPDATE service_cases SET state = ?, result_json = ?, resolved_at = ?, updated_at = ? WHERE id = ?",
        )
        .bind(
          targetState,
          JSON.stringify(result),
          targetRunStatus === "COMPLETED" ? createdAt : null,
          createdAt,
          caseId,
        ),
      db
        .prepare(
          "UPDATE agent_runs SET status = ?, result_json = ?, updated_at = ? WHERE id = ? AND status = 'APPROVING'",
        )
        .bind(
          targetRunStatus,
          JSON.stringify(result),
          createdAt,
          row.id,
        ),
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
          JSON.stringify(actions),
          payload.edited_reply ?? null,
          payload.reason ?? null,
          createdAt,
        ),
      ...outbox.map((item) =>
        db
          .prepare(
            "INSERT OR IGNORE INTO outbox_events (id, case_id, action_type, payload_json, idempotency_key, status, attempts, next_attempt_at, created_at) VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?)",
          )
          .bind(
            item.id,
            caseId,
            item.action,
            JSON.stringify({ case_id: caseId, approval_id: approvalId }),
            item.key,
            createdAt,
            createdAt,
          ),
      ),
      db
        .prepare(
          "INSERT INTO run_events (run_id, event_type, data_json, created_at) VALUES (?, 'completed', ?, ?)",
        )
        .bind(
          row.id,
          JSON.stringify({
            state: targetState,
            decision: payload.decision,
            outbox_event_ids: outbox.map((item) => item.id),
          }),
          createdAt,
        ),
    ]);
  } catch (error) {
    await db
      .prepare(
        "UPDATE agent_runs SET status = ?, error = ? WHERE id = ? AND status = 'APPROVING'",
      )
      .bind(
        currentStatus,
        error instanceof Error ? error.message.slice(0, 1000) : "approval failed",
        row.id,
      )
      .run();
    throw error;
  }
  waitUntil(drainOutbox());
  return {
    state: targetState,
    outbox_event_ids: outbox.map((item) => item.id),
    status: 200,
  };
}

export async function getDashboard(scope: AccessScope): Promise<DashboardSnapshot> {
  const db = database();
  const ownerFilter = scope.canReadAll ? "" : " WHERE owner_email = ?";
  const ownerAnd = scope.canReadAll ? "" : " AND owner_email = ?";
  const bind = scope.canReadAll ? [] : [scope.email.toLowerCase()];
  const totals = await db
    .prepare(
      `SELECT
         COUNT(*) AS cases,
         SUM(CASE WHEN risk_severity = 'CRITICAL' THEN 1 ELSE 0 END) AS critical,
         SUM(CASE WHEN risk_severity = 'HIGH' THEN 1 ELSE 0 END) AS high,
         SUM(CASE WHEN state = 'PENDING_AGENT_APPROVAL' THEN 1 ELSE 0 END) AS waiting_approval,
         SUM(CASE WHEN state = 'PENDING_SUPERVISOR_APPROVAL' THEN 1 ELSE 0 END) AS pending_supervisor,
         SUM(CASE WHEN json_extract(result_json, '$.risk.signals') LIKE '%同一问题已联系%' THEN 1 ELSE 0 END) AS repeat_complaints,
         SUM(CASE WHEN result_json LIKE '%历史服务承诺已经超时%' THEN 1 ELSE 0 END) AS overdue_promises
       FROM service_cases${ownerFilter}`,
    )
    .bind(...bind)
    .first<D1Row>();
  const actions = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN o.status IN ('PENDING', 'RETRY', 'PROCESSING') THEN 1 ELSE 0 END) AS pending_actions,
         SUM(CASE WHEN o.status = 'DEAD_LETTER' THEN 1 ELSE 0 END) AS dead_letter_actions
       FROM outbox_events o
       JOIN service_cases s ON s.id = o.case_id
       WHERE 1 = 1${scope.canReadAll ? "" : " AND s.owner_email = ?"}`,
    )
    .bind(...bind)
    .first<D1Row>();
  const approvals = await db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN a.decision IN ('ACCEPT', 'EDIT', 'ESCALATE') THEN 1 ELSE 0 END) AS accepted
       FROM approval_events a
       JOIN service_cases s ON s.id = a.case_id
       WHERE 1 = 1${scope.canReadAll ? "" : " AND s.owner_email = ?"}`,
    )
    .bind(...bind)
    .first<D1Row>();
  const edits = await db
    .prepare(
      `SELECT a.edited_reply, ar.data_json
       FROM approval_events a
       JOIN service_cases s ON s.id = a.case_id
       JOIN agent_runs r ON r.case_id = s.id
       JOIN agent_artifacts ar ON ar.run_id = r.id AND ar.artifact_type = 'copilot'
       WHERE a.decision = 'EDIT' AND a.edited_reply IS NOT NULL${
         scope.canReadAll ? "" : " AND s.owner_email = ?"
       }
       ORDER BY a.created_at DESC
       LIMIT 1000`,
    )
    .bind(...bind)
    .all<D1Row>();
  const issues = await db
    .prepare(
      `SELECT
         COALESCE(json_extract(result_json, '$.triage.issue_type'), 'PROCESSING') AS issue,
         COUNT(*) AS count
       FROM service_cases
       ${ownerFilter}
       GROUP BY issue
       ORDER BY count DESC
       LIMIT 8`,
    )
    .bind(...bind)
    .all<D1Row>();
  const trend = await db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
       FROM service_cases
       WHERE risk_severity IN ('HIGH', 'CRITICAL')${ownerAnd}
       GROUP BY date
       ORDER BY date DESC
       LIMIT 7`,
    )
    .bind(...bind)
    .all<D1Row>();
  const queue = await db
    .prepare(
      `SELECT id, state, risk_severity, assigned_agent_email, updated_at, result_json
       FROM service_cases
       WHERE state IN ('PENDING_AGENT_APPROVAL', 'PENDING_SUPERVISOR_APPROVAL', 'REVIEW_FAILED', 'ESCALATED')${ownerAnd}
       ORDER BY
         CASE risk_severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,
         updated_at DESC
       LIMIT 12`,
    )
    .bind(...bind)
    .all<D1Row>();
  const approvalTotal = Number(approvals?.total ?? 0);
  const editRates = edits.results.map((row) => {
    const original = JSON.parse(String(row.data_json)) as ApiAnalysis["copilot"];
    return editRatio(original.draft_reply, String(row.edited_reply));
  });
  return {
    generated_at: now(),
    totals: {
      cases: Number(totals?.cases ?? 0),
      critical: Number(totals?.critical ?? 0),
      high: Number(totals?.high ?? 0),
      waiting_approval: Number(totals?.waiting_approval ?? 0),
      pending_supervisor: Number(totals?.pending_supervisor ?? 0),
      repeat_complaints: Number(totals?.repeat_complaints ?? 0),
      overdue_promises: Number(totals?.overdue_promises ?? 0),
      pending_actions: Number(actions?.pending_actions ?? 0),
      dead_letter_actions: Number(actions?.dead_letter_actions ?? 0),
    },
    approval_rate:
      approvalTotal === 0
        ? 0
        : Math.round(
            (Number(approvals?.accepted ?? 0) / approvalTotal) * 1000,
          ) / 10,
    average_edit_rate:
      editRates.length === 0
        ? 0
        : Math.round(
            (editRates.reduce((sum, value) => sum + value, 0) /
              editRates.length) *
              1000,
          ) / 10,
    risk_trend: trend.results
      .map((row) => ({
        date: String(row.date),
        count: Number(row.count),
      }))
      .reverse(),
    issue_distribution: issues.results.map((row) => ({
      issue: String(row.issue),
      count: Number(row.count),
    })),
    queue: queue.results.map((row) => {
      const parsed =
        String(row.result_json) === "{}"
          ? null
          : (JSON.parse(String(row.result_json)) as ApiAnalysis);
      return {
        id: String(row.id),
        state: String(row.state),
        severity: String(row.risk_severity),
        issue: parsed?.triage.issue_type ?? "PROCESSING",
        owner: String(row.assigned_agent_email ?? "待分配"),
        updated_at: String(row.updated_at),
      };
    }),
  };
}
