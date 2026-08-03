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
  assert.match(html, /运行时序诊断/);
  assert.match(html, /SAFE FALLBACK/);
  assert.match(html, /风险预警/);
  assert.match(html, /V2.0/);
  assert.match(html, /正在验证运行时/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("keeps REST, SSE and explicit action approval in the client contract", async () => {
  const [page, api, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/carepulse-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(api, /NEXT_PUBLIC_CAREPULSE_API_URL/);
  assert.match(api, /NEXT_PUBLIC_CAREPULSE_API_ENABLED/);
  assert.match(api, /new EventSource/);
  assert.match(api, /approved_action_ids/);
  assert.doesNotMatch(api, /X-Agent-(?:Id|Role)/);
  assert.match(page, /type="checkbox"/);
  assert.match(page, /确定性安全回退/);
  assert.match(page, /submitLumiSenseFeedback/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|@tanstack\/react-query/);
});
