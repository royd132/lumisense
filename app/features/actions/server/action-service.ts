import { env, waitUntil } from "cloudflare:workers";
import type { ApiAnalysis } from "../../harness/api/client";
import { PROMPT_VERSION } from "../../harness/domain/runtime-contract";

type D1Row = Record<string, unknown>;
type ApprovalDecision =
  | "ACCEPT"
  | "EDIT"
  | "REJECT"
  | "ESCALATE"
  | "REQUEST_ESCALATION";

const SUPERVISOR_ROLES = new Set(["SUPERVISOR", "RISK_MANAGER", "ADMIN"]);
const MAX_OUTBOX_ATTEMPTS = 5;
const SUPPORTED_CONTROLLED_ACTIONS = new Set([
  "VERIFY_REFUND_ELIGIBILITY",
  "ESCALATE_PRODUCT_SAFETY",
  "NOTIFY_DUTY_MANAGER",
  "REQUEST_SUPERVISOR_REVIEW",
]);

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

async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hashed = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hashed)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
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
