export const CAREPULSE_API_URL = (process.env.NEXT_PUBLIC_CAREPULSE_API_URL ?? "").replace(/\/$/, "");
export const CAREPULSE_API_ENABLED =
  process.env.NEXT_PUBLIC_CAREPULSE_API_ENABLED !== "false";

export type ApiAnalysis = {
  run_id: string;
  case_id: string;
  state: string;
  route: string;
  runtime: {
    harness: "EDGE_D1" | "PYTHON_LANGGRAPH";
    model_mode: "LIVE_MODEL" | "STRUCTURED_FALLBACK";
    model: string;
    fallback_reason: string | null;
    model_latency_ms: number;
    input_tokens: number;
    output_tokens: number;
  };
  triage: {
    intent: string;
    issue_type: string;
    explicit_request: string;
    implicit_goal: string;
    entities: {
      order_id: string | null;
      product_id: string | null;
    };
    required_evidence: string[];
    confidence: number;
  };
  risk: {
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "REVIEW_REQUIRED";
    signals: string[];
    confidence: number;
  };
  evidence: {
    items: {
      evidence_id: string;
      evidence_type: string;
      title: string;
      content: string;
    }[];
    missing: string[];
  };
  copilot: {
    consumer_summary: string;
    service_goal: string;
    draft_reply: string;
    recommended_actions: {
      action: string;
      reason: string;
      requires_approval: boolean;
    }[];
    evidence_refs: string[];
    uncertainties: string[];
  };
  review: {
    approved: boolean;
    violations: { code: string; message: string }[];
    revision_required: boolean;
    confidence: number;
  };
  trace: {
    graph_node: string;
    latency_ms: number;
    state_before: string;
    state_after: string;
    model: string;
    model_version: string;
    prompt_version: string | null;
    input_hash: string;
    tool_calls: string[];
    evidence_ids: string[];
    risk_signals: string[];
    agent_output: Record<string, unknown>;
    validator_output: Record<string, unknown>;
    token_usage: Record<string, number>;
    fallback_used: boolean;
  }[];
};

export type RunInput = {
  conversation_id: string;
  customer_id: string;
  text: string;
  order_id?: string;
  product_id?: string;
  contact_count?: number;
  previous_promise_overdue?: boolean;
  scenario_key?: "allergy" | "pregnancy" | "acne" | "gift" | "expectation";
  consumer_name?: string;
  brand?: string;
  skin_type?: string;
  personality?: string;
  concern?: string;
};

export type EvolutionSummary = {
  total_feedback: number;
  pending_review: number;
  verified: number;
  rejected: number;
  by_type: { feedback_type: string; count: number }[];
  recent: {
    id: string;
    conversation_id: string;
    feedback_type: string;
    verdict: string;
    training_status: string;
    created_at: string;
  }[];
};

export type EvaluationReport = {
  report_version: string;
  generated_at: string;
  methodology: {
    suite: string;
    cases: number;
    baseline: string;
    limitation: string;
  };
  metrics: {
    key: string;
    label: string;
    carepulse: number;
    baseline: number;
    unit: "percent" | "rate";
    target: string;
  }[];
  slices: {
    name: string;
    cases: number;
    passed: number;
    note: string;
  }[];
  claims: string[];
};

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function waitForRunResult(runId: string): Promise<ApiAnalysis> {
  for (let attempt = 0; attempt < 480; attempt += 1) {
    const response = await fetch(`${CAREPULSE_API_URL}/api/v1/runs/${runId}`);
    if (response.ok) return response.json() as Promise<ApiAnalysis>;
    if (response.status !== 409) return json<ApiAnalysis>(response);
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  throw new Error("Harness 运行超时，已保留案例供人工复核");
}

export async function startRun(
  input: RunInput,
  onTrace: (node: string) => void,
): Promise<ApiAnalysis> {
  const accepted = await json<{ run_id: string; case_id: string }>(
    await fetch(`${CAREPULSE_API_URL}/api/v1/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const stream = new EventSource(
        `${CAREPULSE_API_URL}/api/v1/runs/${accepted.run_id}/events`,
      );
      const timeout = window.setTimeout(() => {
        stream.close();
        reject(new Error("SSE timeout"));
      }, 120000);
      stream.addEventListener("trace", (event) => {
        const data = JSON.parse((event as MessageEvent).data) as { node: string };
        onTrace(data.node);
      });
      const finish = () => {
        window.clearTimeout(timeout);
        stream.close();
        resolve();
      };
      stream.addEventListener("interrupt", finish);
      stream.addEventListener("completed", finish);
      stream.addEventListener("failed", () => {
        window.clearTimeout(timeout);
        stream.close();
        reject(new Error("Harness 运行失败，已转人工复核"));
      });
      stream.onerror = () => {
        window.clearTimeout(timeout);
        stream.close();
        reject(new Error("无法连接 Harness 事件流"));
      };
    });
  } catch {
    // SSE can be interrupted by a proxy or a backgrounded browser tab. The
    // persisted run remains authoritative, so fall back to bounded polling.
  }

  return waitForRunResult(accepted.run_id);
}

export async function approveCase(
  caseId: string,
  decision:
    | "ACCEPT"
    | "EDIT"
    | "REJECT"
    | "ESCALATE"
    | "REQUEST_ESCALATION",
  editedReply: string,
  approvedActionIds: string[],
) {
  return json<{ state: string; outbox_event_ids: string[] }>(
    await fetch(`${CAREPULSE_API_URL}/api/v1/cases/${caseId}/approval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        decision,
        edited_reply: decision === "EDIT" ? editedReply : undefined,
        approved_action_ids: approvedActionIds,
      }),
    }),
  );
}

export type CurrentPrincipal = {
  email: string;
  display_name: string;
  role: string;
  can_read_all_cases: boolean;
};

export type ApiDashboard = {
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

export async function getCurrentPrincipal() {
  return json<CurrentPrincipal>(
    await fetch(`${CAREPULSE_API_URL}/api/v1/me`, { cache: "no-store" }),
  );
}

export async function getDashboard() {
  return json<ApiDashboard>(
    await fetch(`${CAREPULSE_API_URL}/api/v1/dashboard`, {
      cache: "no-store",
    }),
  );
}

export async function getEvaluationReport() {
  return json<EvaluationReport>(
    await fetch(`${CAREPULSE_API_URL}/api/v1/evaluation`, {
      cache: "no-store",
    }),
  );
}

export async function getEvolutionSummary() {
  const payload = await json<{ code: number; data: EvolutionSummary }>(
    await fetch(`${CAREPULSE_API_URL}/api/v1/evolution/summary`, {
      cache: "no-store",
    }),
  );
  return payload.data;
}

export async function reviewEvolutionFeedback(input: {
  feedbackId: string;
  decision: "approve" | "reject";
  correction?: string;
}) {
  return json<{ code: number; data: { feedback_id: string; training_status: string; audited: boolean } }>(
    await fetch(`${CAREPULSE_API_URL}/api/v1/evolution/feedback/${input.feedbackId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: input.decision, correction: input.correction }),
    }),
  );
}

export async function submitLumiSenseFeedback(input: {
  conversationId: string;
  kind: "subtext" | "prediction";
  verdict: "accurate" | "partially" | "inaccurate";
  detail?: string;
}) {
  const endpoint =
    input.kind === "subtext"
      ? "/api/v1/subtext/feedback"
      : "/api/v1/emotion/feedback";
  const body =
    input.kind === "subtext"
      ? {
          conversation_id: input.conversationId,
          feedback_type: input.verdict,
          feedback_text: input.detail,
        }
      : {
          conversation_id: input.conversationId,
          verdict: input.verdict,
          detail: input.detail,
        };
  return json<{
    code: number;
    message: string;
    data: {
      feedback_id: string;
      trace_id: string;
      training_status: string;
      audited: boolean;
    };
  }>(
    await fetch(`${CAREPULSE_API_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function updateBrandPersona(input: {
  brand: string;
  keywords: string[];
  style: string;
  forbiddenWords: string[];
}) {
  return json<{
    code: number;
    message: string;
    data: { trace_id: string; updated_at: string };
  }>(
    await fetch(`${CAREPULSE_API_URL}/api/v1/admin/brand`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand: input.brand,
        keywords: input.keywords,
        style: input.style,
        forbidden_words: input.forbiddenWords,
      }),
    }),
  );
}
