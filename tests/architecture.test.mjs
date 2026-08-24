import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

function lines(value) {
  return value.trimEnd().split(/\r?\n/).length;
}

test("framework entrypoints and compatibility facades stay thin", async () => {
  const entrypoint = await source("app/page.tsx");
  assert.ok(lines(entrypoint) <= 10, "app/page.tsx must only compose the product shell");

  for (const path of [
    "app/lib/carepulse-api.ts",
    "app/lib/edge-harness.ts",
    "app/lib/lumisense-demo.ts",
    "app/lib/openai-runtime.ts",
    "app/lib/public-data-skill.ts",
  ]) {
    const facade = await source(path);
    assert.ok(lines(facade) <= 12, `${path} must remain a compatibility facade`);
  }
});

test("feature boundaries keep domain and browser code free of Worker persistence", async () => {
  const skillDomain = await source(
    "app/features/skill-evolution/domain/public-data-skill.ts",
  );
  const browserClient = await source("app/features/harness/api/client.ts");
  assert.doesNotMatch(skillDomain, /cloudflare:workers|D1Database/);
  assert.doesNotMatch(browserClient, /cloudflare:workers|D1Database/);
});

test("large product modules remain bounded and named by responsibility", async () => {
  const modules = [
    "app/features/harness/server/edge-harness.ts",
    "app/features/actions/server/action-service.ts",
    "app/features/analytics/server/dashboard-service.ts",
    "app/features/evolution/server/evolution-service.ts",
    "app/features/skill-evolution/server/public-data-evolution.ts",
    "app/features/shell/LumiSenseApp.tsx",
    "app/features/workbench/components/Workspace.tsx",
    "app/features/risk/components/RiskDashboard.tsx",
    "app/features/growth/components/GrowthView.tsx",
    "app/features/evolution/components/EvolutionView.tsx",
  ];
  for (const path of modules) {
    const moduleSource = await source(path);
    assert.ok(lines(moduleSource) <= 800, `${path} exceeded the 800-line architecture budget`);
  }
});
