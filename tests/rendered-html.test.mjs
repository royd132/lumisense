import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the CarePulse workbench with an honest runtime mode", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>CarePulse \| 证据驱动客服 Copilot<\/title>/i);
  assert.match(html, /CarePulse/);
  assert.match(html, /消费者问题理解/);
  assert.match(html, /证据包/);
  assert.match(html, /演示模式/);
  assert.match(html, /无后端副作用/);
  assert.doesNotMatch(html, /Harness 在线/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("keeps REST, SSE and explicit action approval in the client contract", async () => {
  const [page, api, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/carepulse-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(api, /NEXT_PUBLIC_CAREPULSE_API_URL/);
  assert.match(api, /new EventSource/);
  assert.match(api, /approved_action_ids/);
  assert.match(api, /X-Agent-Role/);
  assert.match(page, /type="checkbox"/);
  assert.match(page, /演示回退/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|@tanstack\/react-query/);
});
