import { env } from "cloudflare:workers";
import type { ApiAnalysis, RunInput } from "./carepulse-api";

type RuntimeEnv = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

type ModelUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

type ModelResponse = {
  output_text?: string;
  output?: {
    content?: {
      type?: string;
      text?: string;
    }[];
  }[];
  usage?: ModelUsage;
};

type ModelCallResult<T> = {
  value: T;
  latencyMs: number;
  usage: Required<ModelUsage>;
};

const DEFAULT_MODEL = "gpt-5.6-luna";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const FORBIDDEN_PROMISES = [
  "保证退款",
  "立即退款",
  "保证到账",
  "保证赔偿",
  "一定治愈",
  "保证治愈",
];

function runtimeConfig() {
  const runtime = env as unknown as RuntimeEnv;
  return {
    apiKey: runtime.OPENAI_API_KEY?.trim() ?? "",
    model: runtime.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
  };
}

function responseText(payload: ModelResponse) {
  if (payload.output_text) return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  throw new Error("model response did not include structured output");
}

async function callStructuredModel<T>({
  apiKey,
  model,
  safetyIdentifier,
  schemaName,
  schema,
  system,
  input,
}: {
  apiKey: string;
  model: string;
  safetyIdentifier: string;
  schemaName: string;
  schema: Record<string, unknown>;
  system: string;
  input: Record<string, unknown>;
}): Promise<ModelCallResult<T>> {
  const startedAt = Date.now();
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      safety_identifier: safetyIdentifier.slice(0, 64),
      reasoning: { effort: "low" },
      max_output_tokens: 1200,
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: {
        verbosity: "low",
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`model request failed with status ${response.status}`);
  }
  const payload = (await response.json()) as ModelResponse;
  return {
    value: JSON.parse(responseText(payload)) as T,
    latencyMs: Date.now() - startedAt,
    usage: {
      input_tokens: payload.usage?.input_tokens ?? 0,
      output_tokens: payload.usage?.output_tokens ?? 0,
    },
  };
}

const triageSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: {
      type: "string",
      enum: [
        "PRODUCT_INQUIRY",
        "REFUND_COMPLAINT",
        "PRODUCT_SAFETY_COMPLAINT",
        "DELIVERY_COMPLAINT",
        "OTHER_SERVICE_REQUEST",
      ],
    },
    issue_type: {
      type: "string",
      enum: [
        "INGREDIENT_USAGE",
        "PRODUCT_DAMAGE",
        "REFUND_DELAY",
        "ADVERSE_REACTION",
        "DELIVERY_DELAY",
        "OTHER",
      ],
    },
    explicit_request: { type: "string" },
    implicit_goal: { type: "string" },
    confidence: { type: "number" },
  },
  required: [
    "intent",
    "issue_type",
    "explicit_request",
    "implicit_goal",
    "confidence",
  ],
};

const copilotSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    consumer_summary: { type: "string" },
    service_goal: { type: "string" },
    draft_reply: { type: "string" },
    evidence_refs: {
      type: "array",
      items: { type: "string" },
    },
    uncertainties: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "consumer_summary",
    "service_goal",
    "draft_reply",
    "evidence_refs",
    "uncertainties",
  ],
};

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    approved: { type: "boolean" },
    violations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          code: { type: "string" },
          message: { type: "string" },
        },
        required: ["code", "message"],
      },
    },
    revision_required: { type: "boolean" },
    confidence: { type: "number" },
  },
  required: ["approved", "violations", "revision_required", "confidence"],
};

type TriageOutput = {
  intent: string;
  issue_type: string;
  explicit_request: string;
  implicit_goal: string;
  confidence: number;
};

type CopilotOutput = {
  consumer_summary: string;
  service_goal: string;
  draft_reply: string;
  evidence_refs: string[];
  uncertainties: string[];
};

type ReviewOutput = {
  approved: boolean;
  violations: { code: string; message: string }[];
  revision_required: boolean;
  confidence: number;
};

function fallbackReason(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "model_timeout";
  }
  return "model_unavailable";
}

export async function applyLiveModel(
  base: ApiAnalysis,
  input: RunInput,
  inputHash: string,
): Promise<ApiAnalysis> {
  const { apiKey, model } = runtimeConfig();
  if (!apiKey) {
    return {
      ...base,
      runtime: {
        ...base.runtime,
        fallback_reason: "api_key_not_configured",
      },
    };
  }

  try {
    const triage = await callStructuredModel<TriageOutput>({
      apiKey,
      model,
      safetyIdentifier: inputHash,
      schemaName: "carepulse_triage",
      schema: triageSchema,
      system:
        "你是美妆消费者客服的 Triage Agent。只理解诉求并输出结构化分类；不判断赔偿，不承诺处理结果，不执行动作。输入已经脱敏。",
      input: {
        consumer_message: input.text,
        order_id: input.order_id ?? null,
        product_id: input.product_id ?? null,
        contact_count: input.contact_count ?? 1,
        previous_promise_overdue: input.previous_promise_overdue ?? false,
      },
    });

    const copilot = await callStructuredModel<CopilotOutput>({
      apiKey,
      model,
      safetyIdentifier: inputHash,
      schemaName: "carepulse_copilot",
      schema: copilotSchema,
      system:
        "你是美妆客服 Copilot Agent。只使用给定证据生成中文建议回复。先具体承认消费者问题，再给下一步；不得诊断、推断不良反应原因、保证退款/到账/赔偿或虚构政策。所有动作由确定性服务决定，你只生成回复和证据引用。",
      input: {
        consumer_message: input.text,
        triage: triage.value,
        deterministic_risk: base.risk,
        evidence_packet: base.evidence,
        allowed_action_plan: base.copilot.recommended_actions,
      },
    });

    const availableEvidence = new Set(
      base.evidence.items.map((item) => item.evidence_id),
    );
    const invalidReferences = copilot.value.evidence_refs.filter(
      (item) => !availableEvidence.has(item),
    );
    const unsupportedPromises = FORBIDDEN_PROMISES.filter((phrase) =>
      copilot.value.draft_reply.includes(phrase),
    );
    const deterministicViolations = [
      ...base.review.violations,
      ...(copilot.value.evidence_refs.length === 0
        ? [
            {
              code: "MISSING_EVIDENCE_REFERENCE",
              message: "模型回复没有引用当前证据包。",
            },
          ]
        : []),
      ...(copilot.value.draft_reply.length > 600
        ? [
            {
              code: "REPLY_TOO_LONG",
              message: "模型建议回复超过 600 字上限。",
            },
          ]
        : []),
      ...invalidReferences.map((item) => ({
        code: "INVALID_EVIDENCE_REFERENCE",
        message: `模型引用了不存在的证据：${item}`,
      })),
      ...unsupportedPromises.map((item) => ({
        code: "UNSUPPORTED_PROMISE",
        message: `模型生成了禁止承诺：${item}`,
      })),
    ];

    const review = await callStructuredModel<ReviewOutput>({
      apiKey,
      model,
      safetyIdentifier: inputHash,
      schemaName: "carepulse_review",
      schema: reviewSchema,
      system:
        "你是独立 Review Agent。检查建议是否完整回应诉求、严格基于证据、遵守美妆功效和不良反应沟通边界、没有未经批准的承诺。任何证据缺失、诊断归因、保证退款/到账/赔偿都必须拒绝。",
      input: {
        consumer_message: input.text,
        triage: triage.value,
        risk: base.risk,
        evidence_packet: base.evidence,
        candidate_reply: copilot.value,
        deterministic_violations: deterministicViolations,
      },
    });

    const violations = [...deterministicViolations, ...review.value.violations];
    const approved =
      base.review.approved &&
      review.value.approved &&
      violations.length === 0;
    const latency =
      triage.latencyMs + copilot.latencyMs + review.latencyMs;
    const usage = [triage, copilot, review].reduce(
      (total, item) => ({
        input_tokens: total.input_tokens + item.usage.input_tokens,
        output_tokens: total.output_tokens + item.usage.output_tokens,
      }),
      { input_tokens: 0, output_tokens: 0 },
    );
    const evidenceRefs = copilot.value.evidence_refs.filter((item) =>
      availableEvidence.has(item),
    );
    const trace = base.trace.map((item) => {
      const call =
        item.graph_node === "triage_and_risk"
          ? triage
          : item.graph_node === "copilot"
            ? copilot
            : item.graph_node === "review"
              ? review
              : null;
      if (!call) return item;
      return {
        ...item,
        latency_ms: call.latencyMs,
        model,
        model_version: model,
        fallback_used: false,
        token_usage: {
          input_tokens: call.usage.input_tokens,
          output_tokens: call.usage.output_tokens,
        },
      };
    });

    return {
      ...base,
      state: approved ? "PENDING_AGENT_APPROVAL" : "REVIEW_FAILED",
      runtime: {
        harness: "EDGE_D1",
        model_mode: "LIVE_MODEL",
        model,
        fallback_reason: null,
        model_latency_ms: latency,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
      },
      triage: {
        ...base.triage,
        intent: triage.value.intent,
        issue_type: triage.value.issue_type,
        explicit_request: triage.value.explicit_request,
        implicit_goal: triage.value.implicit_goal,
        confidence: Math.max(0, Math.min(1, triage.value.confidence)),
      },
      copilot: {
        ...base.copilot,
        consumer_summary: copilot.value.consumer_summary,
        service_goal: copilot.value.service_goal,
        draft_reply: copilot.value.draft_reply,
        evidence_refs: evidenceRefs,
        uncertainties: [
          ...base.copilot.uncertainties,
          ...copilot.value.uncertainties,
        ],
        recommended_actions: approved
          ? base.copilot.recommended_actions
          : [],
      },
      review: {
        approved,
        violations,
        revision_required: !approved,
        confidence: Math.min(
          base.review.confidence,
          Math.max(0, Math.min(1, review.value.confidence)),
        ),
      },
      trace: trace.map((item) =>
        item.graph_node === "review"
          ? {
              ...item,
              state_after: approved
                ? "PENDING_AGENT_APPROVAL"
                : "REVIEW_FAILED",
              validator_output: {
                approved,
                deterministic_violation_count:
                  deterministicViolations.length,
              },
            }
          : item,
      ),
    };
  } catch (error) {
    return {
      ...base,
      runtime: {
        ...base.runtime,
        model,
        fallback_reason: fallbackReason(error),
      },
    };
  }
}
