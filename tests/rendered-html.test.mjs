import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Miniflare } from "miniflare";

async function render() {
  const mf = new Miniflare({
    compatibilityDate: "2026-05-22",
    compatibilityFlags: ["nodejs_compat"],
    modules: true,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    scriptPath: "dist/server/index.js",
    d1Databases: { DB: `carepulse-render-${process.pid}-${Date.now()}` },
    serviceBindings: {
      ASSETS: async () => new Response("Not found", { status: 404 }),
    },
  });
  const response = await mf.dispatchFetch("http://localhost/", {
    headers: { accept: "text/html" },
  });
  const buffered = new Response(await response.arrayBuffer(), response);
  await mf.dispose();
  return buffered;
}

test("server-renders the LumiSense empathy workbench with an honest runtime mode", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>LumiSense 感光 \| 欧莱雅美妆 AI 共情管家<\/title>/i);
  assert.match(html, /LumiSense/);
  assert.match(html, /情绪考古师/);
  assert.match(html, /多轮时序因果诊断/);
  assert.match(html, /潜台词摘要/);
  assert.match(html, /未来 3 轮情绪预言/);
  assert.match(html, /三轴匹配/);
  assert.match(html, /JUDGE CHALLENGE/);
  assert.match(html, /AgentLoop/);
  assert.match(html, /DEMO PREVIEW/);
  assert.match(html, /自定义消费者与场景/);
  assert.match(html, /不是单次 Prompt/);
  assert.match(html, /风险预警/);
  assert.match(html, /V2.0/);
  assert.match(html, /提交当前场景到在线 Harness/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("keeps REST, SSE and explicit action approval in the client contract", async () => {
  const [workbench, insightPanel, insightCards, controller, evolution, risk, api, packageJson] = await Promise.all([
    readFile(new URL("../app/features/workbench/components/Workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/workbench/components/InsightPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/workbench/components/InsightCards.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/workbench/hooks/useWorkbenchController.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/features/evolution/components/EvolutionView.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/risk/components/RiskDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/features/harness/api/client.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  const productSource = [workbench, insightPanel, insightCards, controller, evolution, risk].join("\n");

  assert.match(api, /NEXT_PUBLIC_CAREPULSE_API_URL/);
  assert.match(api, /NEXT_PUBLIC_CAREPULSE_API_ENABLED/);
  assert.match(api, /new EventSource/);
  assert.match(api, /approved_action_ids/);
  assert.doesNotMatch(api, /X-Agent-(?:Id|Role)/);
  assert.match(productSource, /type="checkbox"/);
  assert.match(productSource, /EDGE HARNESS ONLINE/);
  assert.match(productSource, /api_key_not_configured/);
  assert.match(productSource, /submitLumiSenseFeedback/);
  assert.match(productSource, /getEvolutionSummary/);
  assert.match(productSource, /runPublicDataSkillLoop/);
  assert.match(productSource, /PUBLIC DATA × AUTOSKILL/);
  assert.match(productSource, /批准发布/);
  assert.match(productSource, /消费者风险预警中心/);
  assert.match(productSource, /高风险消费者处置队列/);
  assert.doesNotMatch(productSource, /坐席疲劳预警/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|@tanstack\/react-query/);
});
