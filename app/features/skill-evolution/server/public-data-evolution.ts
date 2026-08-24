import { env } from "cloudflare:workers";
import {
  baselineSafetySkill,
  evolvedSafetySkill,
  publicDataSkillEvolution,
} from "../domain/public-data-skill";

type D1Row = Record<string, unknown>;

const SUPERVISOR_ROLES = new Set(["SUPERVISOR", "RISK_MANAGER", "ADMIN"]);

function database(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

function now() {
  return new Date().toISOString();
}

export async function getPublicDataSkillEvolutionState() {
  const db = database();
  const [latestRun, activeSkill] = await Promise.all([
    db
      .prepare(
        "SELECT id, status, trace_id, created_by, created_role, created_at, promoted_at FROM skill_evolution_runs ORDER BY created_at DESC LIMIT 1",
      )
      .first<D1Row>(),
    db
      .prepare(
        "SELECT id, version, status, source_type, promoted_at FROM skill_artifacts WHERE skill_key = ? AND status = 'ACTIVE' ORDER BY promoted_at DESC, created_at DESC LIMIT 1",
      )
      .bind(evolvedSafetySkill.skill_key)
      .first<D1Row>(),
  ]);
  return {
    latest_run: latestRun
      ? {
          id: String(latestRun.id),
          status: String(latestRun.status),
          trace_id: String(latestRun.trace_id),
          created_by: String(latestRun.created_by),
          created_role: String(latestRun.created_role),
          created_at: String(latestRun.created_at),
          promoted_at: latestRun.promoted_at ? String(latestRun.promoted_at) : null,
        }
      : null,
    active_skill: activeSkill
      ? {
          id: String(activeSkill.id),
          version: String(activeSkill.version),
          status: String(activeSkill.status),
          source_type: String(activeSkill.source_type),
          promoted_at: activeSkill.promoted_at ? String(activeSkill.promoted_at) : null,
        }
      : null,
  };
}

export async function runPublicDataSkillEvolution(
  principal: { email: string; role: string },
) {
  const runId = `skillrun_${crypto.randomUUID()}`;
  const traceId = `trace_${crypto.randomUUID()}`;
  const createdAt = now();
  const db = database();
  const baselineJson = JSON.stringify(baselineSafetySkill);
  const candidateJson = JSON.stringify(evolvedSafetySkill);
  await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO skill_artifacts (id, skill_key, version, status, source_type, source_refs_json, artifact_json, parent_id, created_by, created_role, created_at, promoted_at) VALUES (?, ?, ?, 'ACTIVE', 'POLICY_BASELINE', ?, ?, NULL, ?, ?, ?, ?)",
      )
      .bind(
        baselineSafetySkill.id,
        baselineSafetySkill.skill_key,
        baselineSafetySkill.version,
        JSON.stringify(baselineSafetySkill.source_refs),
        baselineJson,
        principal.email,
        principal.role,
        createdAt,
        createdAt,
      ),
    db
      .prepare(
        "INSERT OR IGNORE INTO skill_artifacts (id, skill_key, version, status, source_type, source_refs_json, artifact_json, parent_id, created_by, created_role, created_at, promoted_at) VALUES (?, ?, ?, 'CANDIDATE', 'PUBLIC_CC0', ?, ?, ?, ?, ?, ?, NULL)",
      )
      .bind(
        evolvedSafetySkill.id,
        evolvedSafetySkill.skill_key,
        evolvedSafetySkill.version,
        JSON.stringify(evolvedSafetySkill.source_refs),
        candidateJson,
        evolvedSafetySkill.parent_id,
        principal.email,
        principal.role,
        createdAt,
      ),
    db
      .prepare(
        "INSERT INTO skill_evolution_runs (id, source_dataset, status, baseline_skill_id, candidate_skill_id, management_decision_json, metrics_json, trace_id, created_by, created_role, created_at, promoted_at) VALUES (?, ?, 'AWAITING_HUMAN_PROMOTION', ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
      )
      .bind(
        runId,
        publicDataSkillEvolution.dataset.name,
        baselineSafetySkill.id,
        evolvedSafetySkill.id,
        JSON.stringify(publicDataSkillEvolution.management_decision),
        JSON.stringify(publicDataSkillEvolution.metrics),
        traceId,
        principal.email,
        principal.role,
        createdAt,
      ),
    db
      .prepare(
        "INSERT INTO audit_log (id, tenant_id, user_email, user_role, action, resource_type, resource_id, before_state_json, after_state_json, trace_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        `audit_${crypto.randomUUID()}`,
        "loreal-demo",
        principal.email,
        principal.role,
        "skill_evolution.shadow_evaluate",
        "skill_evolution_run",
        runId,
        JSON.stringify({ version: baselineSafetySkill.version }),
        JSON.stringify({
          version: evolvedSafetySkill.version,
          decision: publicDataSkillEvolution.management_decision.action,
          metrics: publicDataSkillEvolution.metrics,
          status: "AWAITING_HUMAN_PROMOTION",
        }),
        traceId,
        createdAt,
      ),
  ]);
  return {
    run_id: runId,
    trace_id: traceId,
    status: "AWAITING_HUMAN_PROMOTION",
    created_at: createdAt,
    loop: publicDataSkillEvolution,
  };
}

export async function promotePublicDataSkillEvolution(
  runId: string,
  principal: { email: string; role: string },
) {
  const role = principal.role.toUpperCase();
  const isBoundedPublicDemo = principal.email === "public-demo@lumisense.invalid";
  if (!SUPERVISOR_ROLES.has(role) && !isBoundedPublicDemo) {
    return { forbidden: true as const };
  }
  const db = database();
  const run = await db
    .prepare(
      "SELECT id, status, candidate_skill_id, metrics_json, trace_id, promoted_at FROM skill_evolution_runs WHERE id = ?",
    )
    .bind(runId)
    .first<D1Row>();
  if (!run) return null;
  if (String(run.status) === "PROMOTED") {
    return {
      run_id: runId,
      status: "PROMOTED",
      skill_version: evolvedSafetySkill.version,
      trace_id: String(run.trace_id),
      promoted_at: run.promoted_at ? String(run.promoted_at) : null,
      idempotent: true,
    };
  }
  const metrics = JSON.parse(String(run.metrics_json)) as {
    promotion_gate_passed?: boolean;
    existing_regression_passed?: number;
    existing_regression_cases?: number;
  };
  if (
    !metrics.promotion_gate_passed ||
    metrics.existing_regression_passed !== metrics.existing_regression_cases
  ) {
    return { gate_failed: true as const };
  }
  const promotedAt = now();
  const auditId = `audit_${crypto.randomUUID()}`;
  const promotionBatch = await db.batch([
    db
      .prepare(
        "UPDATE skill_evolution_runs SET status = 'PROMOTED', promoted_at = ? WHERE id = ? AND status = 'AWAITING_HUMAN_PROMOTION'",
      )
      .bind(promotedAt, runId),
    db
      .prepare(
        "UPDATE skill_artifacts SET status = 'RETIRED' WHERE skill_key = ? AND status = 'ACTIVE' AND id != ? AND EXISTS (SELECT 1 FROM skill_evolution_runs WHERE id = ? AND status = 'PROMOTED' AND promoted_at = ?)",
      )
      .bind(
        evolvedSafetySkill.skill_key,
        String(run.candidate_skill_id),
        runId,
        promotedAt,
      ),
    db
      .prepare(
        "UPDATE skill_artifacts SET status = 'ACTIVE', promoted_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM skill_evolution_runs WHERE id = ? AND status = 'PROMOTED' AND promoted_at = ?)",
      )
      .bind(promotedAt, String(run.candidate_skill_id), runId, promotedAt),
    db
      .prepare(
        "INSERT INTO audit_log (id, tenant_id, user_email, user_role, action, resource_type, resource_id, before_state_json, after_state_json, trace_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM skill_evolution_runs WHERE id = ? AND status = 'PROMOTED' AND promoted_at = ?)",
      )
      .bind(
        auditId,
        "loreal-demo",
        principal.email,
        principal.role,
        "skill_evolution.promote",
        "skill_artifact",
        String(run.candidate_skill_id),
        JSON.stringify({ version: baselineSafetySkill.version, status: "ACTIVE" }),
        JSON.stringify({
          version: evolvedSafetySkill.version,
          status: "ACTIVE",
          rollback_version: baselineSafetySkill.version,
        }),
        String(run.trace_id),
        promotedAt,
        runId,
        promotedAt,
      ),
  ]);
  if ((promotionBatch[0]?.meta.changes ?? 0) !== 1) return null;
  return {
    run_id: runId,
    status: "PROMOTED",
    skill_version: evolvedSafetySkill.version,
    trace_id: String(run.trace_id),
    promoted_at: promotedAt,
    idempotent: false,
  };
}
