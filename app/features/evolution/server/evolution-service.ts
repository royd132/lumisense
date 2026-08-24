import { env } from "cloudflare:workers";

type D1Row = Record<string, unknown>;

function database(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

function now() {
  return new Date().toISOString();
}

export async function recordLumisenseFeedback(
  principal: { email: string; role: string },
  input: {
    conversationId: string;
    feedbackType: "subtext" | "prediction" | "recommendation" | "risk_alert";
    verdict: "accurate" | "partially" | "inaccurate" | "false_positive";
    detail?: string;
  },
) {
  const feedbackId = `feedback_${crypto.randomUUID()}`;
  const auditId = `audit_${crypto.randomUUID()}`;
  const traceId = `trace_${crypto.randomUUID()}`;
  const createdAt = now();
  const trainingStatus =
    input.verdict === "accurate" ? "VERIFIED" : "PENDING_HUMAN_REVIEW";
  const db = database();
  await db.batch([
    db
      .prepare(
        "INSERT INTO lumisense_feedback (id, user_email, user_role, conversation_id, feedback_type, verdict, detail, training_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        feedbackId,
        principal.email,
        principal.role,
        input.conversationId,
        input.feedbackType,
        input.verdict,
        input.detail ?? null,
        trainingStatus,
        createdAt,
      ),
    db
      .prepare(
        "INSERT INTO audit_log (id, tenant_id, user_email, user_role, action, resource_type, resource_id, before_state_json, after_state_json, trace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        auditId,
        "loreal-demo",
        principal.email,
        principal.role,
        "feedback.create",
        "lumisense_feedback",
        feedbackId,
        null,
        JSON.stringify({
          conversation_id: input.conversationId,
          feedback_type: input.feedbackType,
          verdict: input.verdict,
          training_status: trainingStatus,
        }),
        traceId,
        createdAt,
      ),
  ]);
  return {
    feedback_id: feedbackId,
    trace_id: traceId,
    training_status: trainingStatus,
    audited: true,
  };
}

export async function getLumisenseFeedbackQueue(limit = 20) {
  const rows = await database()
    .prepare(
      "SELECT id, user_email, user_role, conversation_id, feedback_type, verdict, detail, training_status, created_at FROM lumisense_feedback ORDER BY created_at DESC LIMIT ?",
    )
    .bind(Math.max(1, Math.min(limit, 100)))
    .all<D1Row>();
  return rows.results.map((row) => ({
    id: String(row.id),
    user_email: String(row.user_email),
    user_role: String(row.user_role),
    conversation_id: String(row.conversation_id),
    feedback_type: String(row.feedback_type),
    verdict: String(row.verdict),
    detail: row.detail ? String(row.detail) : null,
    training_status: String(row.training_status),
    created_at: String(row.created_at),
  }));
}

export async function getLumisenseEvolutionSummary() {
  const db = database();
  const [totals, byType, recent] = await Promise.all([
    db
      .prepare(
        `SELECT
          COUNT(*) AS total_feedback,
          SUM(CASE WHEN training_status = 'PENDING_HUMAN_REVIEW' THEN 1 ELSE 0 END) AS pending_review,
          SUM(CASE WHEN training_status = 'VERIFIED' THEN 1 ELSE 0 END) AS verified,
          SUM(CASE WHEN training_status = 'REJECTED' THEN 1 ELSE 0 END) AS rejected
         FROM lumisense_feedback`,
      )
      .first<D1Row>(),
    db
      .prepare(
        "SELECT feedback_type, COUNT(*) AS count FROM lumisense_feedback GROUP BY feedback_type ORDER BY count DESC",
      )
      .all<D1Row>(),
    db
      .prepare(
        "SELECT id, conversation_id, feedback_type, verdict, training_status, created_at FROM lumisense_feedback ORDER BY created_at DESC LIMIT 6",
      )
      .all<D1Row>(),
  ]);
  return {
    total_feedback: Number(totals?.total_feedback ?? 0),
    pending_review: Number(totals?.pending_review ?? 0),
    verified: Number(totals?.verified ?? 0),
    rejected: Number(totals?.rejected ?? 0),
    by_type: byType.results.map((row) => ({
      feedback_type: String(row.feedback_type),
      count: Number(row.count),
    })),
    recent: recent.results.map((row) => ({
      id: String(row.id),
      conversation_id: String(row.conversation_id),
      feedback_type: String(row.feedback_type),
      verdict: String(row.verdict),
      training_status: String(row.training_status),
      created_at: String(row.created_at),
    })),
  };
}

export async function reviewLumisenseFeedback(
  feedbackId: string,
  principal: { email: string; role: string },
  input: { decision: "approve" | "reject"; correction?: string },
) {
  const db = database();
  const isAdmin = principal.role.toUpperCase() === "ADMIN";
  const row = await db
    .prepare(
      `SELECT id, user_email, training_status FROM lumisense_feedback
       WHERE id = ?${isAdmin ? "" : " AND user_email = ?"}`,
    )
    .bind(feedbackId, ...(!isAdmin ? [principal.email] : []))
    .first<D1Row>();
  if (!row) return null;
  const nextStatus = input.decision === "approve" ? "VERIFIED" : "REJECTED";
  const updated = await db
    .prepare(
      "UPDATE lumisense_feedback SET training_status = ?, detail = COALESCE(?, detail) WHERE id = ? AND training_status = 'PENDING_HUMAN_REVIEW'",
    )
    .bind(nextStatus, input.correction?.slice(0, 800) || null, feedbackId)
    .run();
  if ((updated.meta.changes ?? 0) !== 1) return null;
  const traceId = `trace_${crypto.randomUUID()}`;
  await db
    .prepare(
      "INSERT INTO audit_log (id, tenant_id, user_email, user_role, action, resource_type, resource_id, before_state_json, after_state_json, trace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      `audit_${crypto.randomUUID()}`,
      "loreal-demo",
      principal.email,
      principal.role,
      "feedback.review",
      "lumisense_feedback",
      feedbackId,
      JSON.stringify({ training_status: row.training_status }),
      JSON.stringify({ training_status: nextStatus, correction: input.correction?.slice(0, 800) || null }),
      traceId,
      now(),
    )
    .run();
  return { feedback_id: feedbackId, training_status: nextStatus, audited: true };
}

export async function getLumisenseConfig(configKey: string) {
  const row = await database()
    .prepare(
      "SELECT value_json, updated_by, updated_role, updated_at FROM lumisense_config WHERE config_key = ?",
    )
    .bind(configKey)
    .first<D1Row>();
  if (!row) return null;
  return {
    value: JSON.parse(String(row.value_json)) as Record<string, unknown>,
    updated_by: String(row.updated_by),
    updated_role: String(row.updated_role),
    updated_at: String(row.updated_at),
  };
}

export async function updateLumisenseConfig(
  principal: { email: string; role: string },
  configKey: string,
  value: Record<string, unknown>,
) {
  const previous = await getLumisenseConfig(configKey);
  const auditId = `audit_${crypto.randomUUID()}`;
  const traceId = `trace_${crypto.randomUUID()}`;
  const createdAt = now();
  const valueJson = JSON.stringify(value);
  const db = database();
  await db.batch([
    db
      .prepare(
        "INSERT INTO lumisense_config (config_key, value_json, updated_by, updated_role, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(config_key) DO UPDATE SET value_json = excluded.value_json, updated_by = excluded.updated_by, updated_role = excluded.updated_role, updated_at = excluded.updated_at",
      )
      .bind(configKey, valueJson, principal.email, principal.role, createdAt),
    db
      .prepare(
        "INSERT INTO audit_log (id, tenant_id, user_email, user_role, action, resource_type, resource_id, before_state_json, after_state_json, trace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        auditId,
        "loreal-demo",
        principal.email,
        principal.role,
        "config.update",
        "brand_persona",
        configKey,
        previous ? JSON.stringify(previous.value) : null,
        valueJson,
        traceId,
        createdAt,
      ),
  ]);
  return { config_key: configKey, trace_id: traceId, updated_at: createdAt };
}
