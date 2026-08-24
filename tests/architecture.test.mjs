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

  const controller = await source("app/features/workbench/hooks/useWorkbenchController.ts");
  assert.doesNotMatch(controller, /from ["'][^"']*components\//);
  assert.doesNotMatch(controller, /from ["']antd|@ant-design\/icons/);
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

  const workspace = await source("app/features/workbench/components/Workspace.tsx");
  assert.ok(lines(workspace) <= 80, "Workspace must remain a composition root");
  const controller = await source("app/features/workbench/hooks/useWorkbenchController.ts");
  assert.ok(lines(controller) <= 180, "workbench controller exceeded its state-management budget");
});

test("global styles remain a thin ordered manifest with bounded domain files", async () => {
  const manifest = await source("app/globals.css");
  assert.ok(lines(manifest) <= 12, "app/globals.css must only order domain styles");
  for (const path of [
    "app/styles/foundation.css",
    "app/styles/workbench-shell.css",
    "app/styles/workbench-insights.css",
    "app/styles/product-shell.css",
    "app/styles/risk.css",
    "app/styles/growth.css",
    "app/styles/evolution.css",
    "app/styles/access.css",
    "app/styles/responsive.css",
  ]) {
    const stylesheet = await source(path);
    assert.ok(lines(stylesheet) <= 1000, `${path} exceeded the 1000-line style budget`);
  }
});
