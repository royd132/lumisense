import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test, { after, before } from "node:test";

import { Miniflare } from "miniflare";

let mf;
let db;
const AGENT_EMAIL = "agent@example.com";
const OTHER_AGENT_EMAIL = "other@example.com";
const SUPERVISOR_EMAIL = "supervisor@example.com";

function authHeaders(email = AGENT_EMAIL) {
  return { "oai-authenticated-user-email": email };
}

before(async () => {
  mf = new Miniflare({
    compatibilityDate: "2026-05-22",
    compatibilityFlags: ["nodejs_compat"],
    modules: true,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    scriptPath: "dist/server/index.js",
    d1Databases: { DB: "carepulse-integration-test" },
    serviceBindings: {
      ASSETS: async () => new Response("Not found", { status: 404 }),
    },
  });
  db = await mf.getD1Database("DB");
  const migrationNames = (await readdir(new URL("../drizzle/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of migrationNames) {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.prepare(statement).run();
    }
  }
});

after(async () => {
  await mf?.dispose();
});

async function request(path, init, origin = "http://localhost") {
  return mf.dispatchFetch(`${origin}${path}`, init);
}

async function startRun({
  text = "退款迟迟没有到账，请帮我核验。",
  order_id = "ORDER_1024",
  conversation_id = `conv_${crypto.randomUUID()}`,
  customer_id = `customer_${crypto.randomUUID()}`,
  email = AGENT_EMAIL,
  extra = {},
} = {}) {
  const response = await request("/api/v1/runs", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(email) },
    body: JSON.stringify({
      conversation_id,
      customer_id,
      text,
      order_id,
      ...extra,
    }),
  });
  assert.equal(response.status, 202);
  return response.json();
}

async function completedRun(runId, email = AGENT_EMAIL) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await request(`/api/v1/runs/${runId}`, {
      headers: authHeaders(email),
    });
    if (response.status === 200) return response.json();
    assert.equal(response.status, 409);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("run did not reach the approval interrupt");
}

test("Edge worker streams trace events and checks D1 readiness", async () => {
  const health = await request("/api/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).persistence, "D1");

  const accepted = await startRun();
  const events = await request(`/api/v1/runs/${accepted.run_id}/events`, {
    headers: authHeaders(),
  });
  assert.equal(events.status, 200);
  assert.match(events.headers.get("content-type") ?? "", /^text\/event-stream/);
  const stream = await events.text();
  assert.match(stream, /event: trace/);
  assert.match(stream, /event: interrupt/);

  const result = await completedRun(accepted.run_id);
  assert.equal(result.review.approved, true);
  assert.equal(result.state, "PENDING_AGENT_APPROVAL");
  assert.equal(result.runtime.model_mode, "STRUCTURED_FALLBACK");
  assert.equal(result.runtime.fallback_reason, "api_key_not_configured");
  assert.ok(result.trace.every((item) => item.fallback_used === true));
});

test("competition evaluation recomputes the 60-case report", async () => {
  const response = await request("/api/v1/evaluation", {
    headers: authHeaders(),
  });
  assert.equal(response.status, 200);
  const report = await response.json();
  assert.equal(report.methodology.cases, 60);
  assert.equal(report.slices.length, 6);
  assert.match(report.methodology.limitation, /工程回归/);
  const riskRecall = report.metrics.find(
    (item) => item.key === "high_risk_recall",
  );
  const citationValidity = report.metrics.find(
    (item) => item.key === "citation_validity",
  );
  const safeFailure = report.metrics.find(
    (item) => item.key === "safe_failure",
  );
  assert.equal(riskRecall.carepulse, 100);
  assert.equal(citationValidity.carepulse, 100);
  assert.equal(safeFailure.carepulse, 100);
  assert.ok(report.slices.every((item) => item.passed === item.cases));
});

test("review failure cannot be approved and never recommends actions", async () => {
  const accepted = await startRun({ order_id: "ORDER_UNKNOWN" });
  const result = await completedRun(accepted.run_id);
  assert.equal(result.review.approved, false);
  assert.equal(result.state, "REVIEW_FAILED");
  assert.deepEqual(result.copilot.recommended_actions, []);

  const approval = await request(`/api/v1/cases/${accepted.case_id}/approval`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ decision: "ACCEPT", approved_action_ids: [] }),
  });
  assert.equal(approval.status, 409);
});

test("approval is single-use and creates an idempotent controlled task", async () => {
  const accepted = await startRun();
  await completedRun(accepted.run_id);
  const path = `/api/v1/cases/${accepted.case_id}/approval`;
  const options = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      decision: "ACCEPT",
      approved_action_ids: ["VERIFY_REFUND_ELIGIBILITY"],
    }),
  };

  const first = await request(path, options);
  assert.equal(first.status, 200);
  const second = await request(path, options);
  assert.equal(second.status, 409);

  const outbox = await db
    .prepare("SELECT status, processed_at FROM outbox_events WHERE case_id = ?")
    .bind(accepted.case_id)
    .first();
  assert.equal(outbox.status, "PROCESSED");
  assert.ok(outbox.processed_at);
  const execution = await db
    .prepare(
      "SELECT status, result_json FROM action_executions WHERE case_id = ?",
    )
    .bind(accepted.case_id)
    .first();
  assert.equal(execution.status, "CREATED");
  assert.equal(JSON.parse(execution.result_json).external_dispatch, false);
});

test("reject cannot smuggle actions and safety actions require a database role", async () => {
  const refund = await startRun();
  await completedRun(refund.run_id);
  const rejected = await request(`/api/v1/cases/${refund.case_id}/approval`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({
      decision: "REJECT",
      approved_action_ids: ["VERIFY_REFUND_ELIGIBILITY"],
    }),
  });
  assert.equal(rejected.status, 422);

  const safety = await startRun({
    text: "使用面霜后红肿刺痛，请升级产品安全事件。",
    order_id: "ORDER_2088",
  });
  await completedRun(safety.run_id);
  const path = `/api/v1/cases/${safety.case_id}/approval`;
  const payload = JSON.stringify({
    decision: "ESCALATE",
    approved_action_ids: ["ESCALATE_PRODUCT_SAFETY"],
  });
  const blocked = await request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(SUPERVISOR_EMAIL),
    },
    body: payload,
  });
  assert.equal(blocked.status, 403);

  await db
    .prepare(
      "INSERT INTO user_roles (email, role, updated_at) VALUES (?, 'SUPERVISOR', ?)",
    )
    .bind(SUPERVISOR_EMAIL, new Date().toISOString())
    .run();
  const approved = await request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(SUPERVISOR_EMAIL),
    },
    body: payload,
  });
  assert.equal(approved.status, 200);
});

test("identity, ownership, validation, sanitization and idempotency are enforced", async () => {
  const unauthenticated = await request(
    "/api/v1/runs",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        conversation_id: "conv_unauthenticated",
        customer_id: "customer_unauthenticated",
        text: "查询产品用法",
      }),
    },
    "https://carepulse.example",
  );
  assert.equal(unauthenticated.status, 401);

  const invalid = await request("/api/v1/runs", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      conversation_id: "conv_invalid",
      customer_id: "customer_invalid",
      text: "查询退款",
      contact_count: "3",
      previous_promise_overdue: "false",
    }),
  });
  assert.equal(invalid.status, 422);

  const conversationId = `conv_${crypto.randomUUID()}`;
  const customerId = `customer_${crypto.randomUUID()}`;
  const text =
    "退款问题，手机号 13812345678，邮箱 customer@example.com，地址：上海市徐汇区测试路 88 号。";
  const first = await startRun({
    conversation_id: conversationId,
    customer_id: customerId,
    text,
  });
  const second = await startRun({
    conversation_id: conversationId,
    customer_id: customerId,
    text,
  });
  assert.equal(second.reused, true);
  assert.equal(second.run_id, first.run_id);

  const row = await db
    .prepare(
      "SELECT owner_email, original_input, sanitized_input, request_key FROM service_cases WHERE id = ?",
    )
    .bind(first.case_id)
    .first();
  assert.equal(row.owner_email, AGENT_EMAIL);
  assert.match(row.original_input, /13812345678/);
  assert.doesNotMatch(row.sanitized_input, /13812345678|customer@example\.com/);
  assert.ok(row.request_key);

  const forbidden = await request(`/api/v1/runs/${first.run_id}`, {
    headers: authHeaders(OTHER_AGENT_EMAIL),
  });
  assert.equal(forbidden.status, 404);
});

test("evidence retrieval stays aligned with the order and complaint type", async () => {
  const safety = await startRun({
    text: "使用粉底液后红肿刺痛，请立即处理。",
    order_id: "ORDER_1024",
  });
  const safetyResult = await completedRun(safety.run_id);
  const productEvidence = safetyResult.evidence.items.find(
    (item) => item.evidence_type === "PRODUCT",
  );
  assert.match(productEvidence.title, /粉底液/);
  assert.doesNotMatch(productEvidence.title, /面霜/);

  const refund = await startRun({
    text: "退款已经提交，但迟迟没有到账。",
    order_id: "ORDER_1024",
  });
  const refundResult = await completedRun(refund.run_id);
  const policy = refundResult.evidence.items.find(
    (item) => item.evidence_type === "REFUND_POLICY",
  );
  assert.match(policy.title, /退款进度与时效/);
  assert.doesNotMatch(policy.title, /破损/);
});

test("an agent can request escalation and a supervisor makes the final decision", async () => {
  const accepted = await startRun({
    text: "使用面霜后红肿刺痛，请升级产品安全事件。",
    order_id: "ORDER_2088",
  });
  await completedRun(accepted.run_id);
  const requested = await request(
    `/api/v1/cases/${accepted.case_id}/approval`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        decision: "REQUEST_ESCALATION",
        approved_action_ids: [],
      }),
    },
  );
  assert.equal(requested.status, 200);
  assert.equal((await requested.json()).state, "PENDING_SUPERVISOR_APPROVAL");

  await db
    .prepare(
      "INSERT OR REPLACE INTO user_roles (email, role, updated_at) VALUES (?, 'SUPERVISOR', ?)",
    )
    .bind(SUPERVISOR_EMAIL, new Date().toISOString())
    .run();
  const finalized = await request(
    `/api/v1/cases/${accepted.case_id}/approval`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(SUPERVISOR_EMAIL),
      },
      body: JSON.stringify({
        decision: "ESCALATE",
        approved_action_ids: [
          "ESCALATE_PRODUCT_SAFETY",
          "NOTIFY_DUTY_MANAGER",
        ],
      }),
    },
  );
  assert.equal(finalized.status, 200);
  assert.equal((await finalized.json()).state, "ESCALATED");

  const approvals = await db
    .prepare(
      "SELECT decision, agent_role FROM approval_events WHERE case_id = ? ORDER BY created_at",
    )
    .bind(accepted.case_id)
    .all();
  assert.deepEqual(
    approvals.results.map((item) => [item.decision, item.agent_role]),
    [
      ["REQUEST_ESCALATION", "AGENT"],
      ["ESCALATE", "SUPERVISOR"],
    ],
  );
});

test("outbox retries become dead letters and dashboard reports persisted state", async () => {
  const accepted = await startRun();
  await completedRun(accepted.run_id);
  const createdAt = new Date().toISOString();
  const outboxId = `out_bad_${crypto.randomUUID().slice(0, 8)}`;
  await db
    .prepare(
      "INSERT INTO outbox_events (id, case_id, action_type, payload_json, idempotency_key, status, attempts, next_attempt_at, created_at) VALUES (?, ?, 'UNSUPPORTED_TEST_ACTION', '{}', ?, 'PENDING', 0, ?, ?)",
    )
    .bind(outboxId, accepted.case_id, outboxId, createdAt, createdAt)
    .run();

  await db
    .prepare(
      "INSERT OR REPLACE INTO user_roles (email, role, updated_at) VALUES (?, 'SUPERVISOR', ?)",
    )
    .bind(SUPERVISOR_EMAIL, createdAt)
    .run();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await db
      .prepare("UPDATE outbox_events SET next_attempt_at = ? WHERE id = ?")
      .bind("2000-01-01T00:00:00.000Z", outboxId)
      .run();
    const drained = await request("/api/internal/outbox/drain", {
      method: "POST",
      headers: authHeaders(SUPERVISOR_EMAIL),
    });
    assert.equal(drained.status, 200);
  }
  const deadLetter = await db
    .prepare("SELECT status, attempts, last_error FROM outbox_events WHERE id = ?")
    .bind(outboxId)
    .first();
  assert.equal(deadLetter.status, "DEAD_LETTER");
  assert.equal(deadLetter.attempts, 5);
  assert.match(deadLetter.last_error, /unsupported controlled action/);

  const dashboard = await request("/api/v1/dashboard", {
    headers: authHeaders(SUPERVISOR_EMAIL),
  });
  assert.equal(dashboard.status, 200);
  const snapshot = await dashboard.json();
  assert.ok(snapshot.totals.cases >= 1);
  assert.ok(snapshot.totals.dead_letter_actions >= 1);
  assert.ok(Array.isArray(snapshot.issue_distribution));
  assert.ok(Array.isArray(snapshot.queue));
});

test("dashboard derives acceptance and edit rates from persisted approvals", async () => {
  const accepted = await startRun();
  const result = await completedRun(accepted.run_id);
  const editedReply = `${result.copilot.draft_reply} 我们会在核验后同步进展。`;
  const approval = await request(
    `/api/v1/cases/${accepted.case_id}/approval`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        decision: "EDIT",
        edited_reply: editedReply,
        approved_action_ids: [],
      }),
    },
  );
  assert.equal(approval.status, 200);

  const dashboard = await request("/api/v1/dashboard", {
    headers: authHeaders(),
  });
  assert.equal(dashboard.status, 200);
  const snapshot = await dashboard.json();
  assert.ok(snapshot.approval_rate > 0);
  assert.ok(snapshot.average_edit_rate > 0);
  assert.ok(snapshot.totals.repeat_complaints >= 0);
  assert.ok(snapshot.totals.overdue_promises >= 0);
});
