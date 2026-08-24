import { env } from "cloudflare:workers";

type D1Row = Record<string, unknown>;
type AccessScope = { email: string; canReadAll: boolean };

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
