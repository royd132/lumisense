import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";

import { Miniflare } from "miniflare";

let mf;
let db;

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
  for (const name of [
    "0000_overrated_unicorn.sql",
    "0001_elite_stellaris.sql",
  ]) {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.prepare(statement).run();
    }
  }
});

after(async () => {
  await mf?.dispose();
});

async function request(path, init) {
  return mf.dispatchFetch(`http://localhost${path}`, init);
}

async function startRun({
  text = "退款迟迟没有到账，请帮我核验。",
  order_id = "ORDER_1024",
} = {}) {
  const response = await request("/api/v1/runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      conversation_id: `conv_${crypto.randomUUID()}`,
      customer_id: `customer_${crypto.randomUUID()}`,
      text,
      order_id,
    }),
  });
  assert.equal(response.status, 202);
  return response.json();
}

async function completedRun(runId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await request(`/api/v1/runs/${runId}`);
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
  const events = await request(`/api/v1/runs/${accepted.run_id}/events`);
  assert.equal(events.status, 200);
  assert.match(events.headers.get("content-type") ?? "", /^text\/event-stream/);
  const stream = await events.text();
  assert.match(stream, /event: trace/);
  assert.match(stream, /event: interrupt/);

  const result = await completedRun(accepted.run_id);
  assert.equal(result.review.approved, true);
  assert.equal(result.state, "PENDING_AGENT_APPROVAL");
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
      "oai-authenticated-user-email": "agent@example.com",
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
      "oai-authenticated-user-email": "agent@example.com",
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
      "oai-authenticated-user-email": "agent@example.com",
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
      "oai-authenticated-user-email": "supervisor@example.com",
    },
    body: payload,
  });
  assert.equal(blocked.status, 403);

  await db
    .prepare(
      "INSERT INTO user_roles (email, role, updated_at) VALUES (?, 'SUPERVISOR', ?)",
    )
    .bind("supervisor@example.com", new Date().toISOString())
    .run();
  const approved = await request(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "oai-authenticated-user-email": "supervisor@example.com",
    },
    body: payload,
  });
  assert.equal(approved.status, 200);
});
