export const CAREPULSE_API_URL = (process.env.NEXT_PUBLIC_CAREPULSE_API_URL ?? "").replace(/\/$/, "");
export const CAREPULSE_API_ENABLED =
  process.env.NEXT_PUBLIC_CAREPULSE_API_ENABLED !== "false";

export type ApiAnalysis = {
  run_id: string;
  case_id: string;
  state: string;
  route: string;
  triage: {
    intent: string;
    issue_type: string;
    explicit_request: string;
    implicit_goal: string;
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
  };
  review: {
    approved: boolean;
    violations: { code: string; message: string }[];
    confidence: number;
  };
  trace: {
    graph_node: string;
    latency_ms: number;
    state_after: string;
  }[];
};

export type RunInput = {
  conversation_id: string;
  customer_id: string;
  text: string;
  order_id?: string;
  contact_count?: number;
  previous_promise_overdue?: boolean;
};

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
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

  await new Promise<void>((resolve, reject) => {
    const stream = new EventSource(
      `${CAREPULSE_API_URL}/api/v1/runs/${accepted.run_id}/events`,
    );
    stream.addEventListener("trace", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { node: string };
      onTrace(data.node);
    });
    const finish = () => {
      stream.close();
      resolve();
    };
    stream.addEventListener("interrupt", finish);
    stream.addEventListener("completed", finish);
    stream.addEventListener("failed", () => {
      stream.close();
      reject(new Error("Harness 运行失败，已转人工复核"));
    });
    stream.onerror = () => {
      stream.close();
      reject(new Error("无法连接 Harness 事件流"));
    };
  });

  return json<ApiAnalysis>(
    await fetch(`${CAREPULSE_API_URL}/api/v1/runs/${accepted.run_id}`),
  );
}

export async function approveCase(
  caseId: string,
  decision: "ACCEPT" | "EDIT" | "REJECT" | "ESCALATE",
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
