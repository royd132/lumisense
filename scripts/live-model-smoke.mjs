import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required for the live-model smoke test");
}

const root = resolve(import.meta.dirname, "..");
const mf = new Miniflare({
  compatibilityDate: "2026-05-22",
  compatibilityFlags: ["nodejs_compat"],
  modules: true,
  modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
  scriptPath: resolve(root, "dist/server/index.js"),
  d1Databases: { DB: `carepulse-live-smoke-${Date.now()}` },
  bindings: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-5.6-luna",
  },
  serviceBindings: {
    ASSETS: async () => new Response("Not found", { status: 404 }),
  },
});

try {
  const db = await mf.getD1Database("DB");
  const migrationDirectory = resolve(root, "drizzle");
  const migrations = (await readdir(migrationDirectory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of migrations) {
    const sql = await readFile(resolve(migrationDirectory, name), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await db.prepare(statement).run();
    }
  }

  const headers = {
    "content-type": "application/json",
    "oai-authenticated-user-email": "smoke@carepulse.invalid",
  };
  const accepted = await mf.dispatchFetch("http://localhost/api/v1/runs", {
    method: "POST",
    headers,
    body: JSON.stringify({
      conversation_id: `live_smoke_${Date.now()}`,
      customer_id: "live_smoke_customer",
      text: "昨晚用了面霜后脸上红肿刺痛，请尽快安排产品安全团队跟进。",
      order_id: "ORDER_2088",
    }),
  });
  if (accepted.status !== 202) {
    throw new Error(`run creation failed: ${accepted.status}`);
  }
  const { run_id: runId } = await accepted.json();
  let result;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await mf.dispatchFetch(
      `http://localhost/api/v1/runs/${runId}`,
      { headers },
    );
    if (response.status === 200) {
      result = await response.json();
      break;
    }
    if (response.status !== 409) {
      throw new Error(`run read failed: ${response.status}`);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  if (!result) throw new Error("live-model run did not complete");
  console.log(
    JSON.stringify(
      {
        runtime: result.runtime,
        state: result.state,
        intent: result.triage.intent,
        severity: result.risk.severity,
        review_approved: result.review.approved,
        trace_models: result.trace
          .filter((item) =>
            ["triage_and_risk", "copilot", "review"].includes(item.graph_node),
          )
          .map((item) => ({
            node: item.graph_node,
            model: item.model,
            latency_ms: item.latency_ms,
            fallback_used: item.fallback_used,
          })),
      },
      null,
      2,
    ),
  );
} finally {
  await mf.dispose();
}
