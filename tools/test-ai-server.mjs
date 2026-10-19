import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = "https://grassland-road-sign-d8bdfce86570-1453404640.tcloudbaseapp.com";
const freePort = async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
};

let modelRequest;
const upstream = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  modelRequest = JSON.parse(Buffer.concat(chunks).toString());
  res.setHeader("Content-Type", "application/json");
  const content = modelRequest.model === "qwen2.5:14b"
    ? JSON.stringify({ reply: "怕啥子嘛，跟紧我。 平静", trust: 1, mood: "平静" })
    : JSON.stringify({ reply: "你说嘛，我听着呢。", trust: 1, mood: "好奇" });
  res.end(JSON.stringify({ choices: [{ message: { content } }] }));
});
await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
const upstreamPort = upstream.address().port;
const port = await freePort();
const child = spawn(process.execPath, ["server/server.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    AI_API_KEY: "mock-key",
    AI_MODEL: "lite",
    AI_BASE_URL: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`,
    AI_ALLOWED_ORIGINS: origin,
  },
  stdio: "ignore",
});
const base = `http://127.0.0.1:${port}`;

try {
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) { healthy = true; break; }
    } catch { /* wait for server startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(healthy, "API server should start");

  const blocked = await fetch(`${base}/api/health`, { headers: { Origin: "https://other.example" } });
  assert.equal(blocked.status, 403);
  const hidden = await fetch(`${base}/server/ai-config.json`);
  assert.equal(hidden.status, 404);
  const preflight = await fetch(`${base}/api/npc`, { method: "OPTIONS", headers: { Origin: origin } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);

  const response = await fetch(`${base}/api/npc`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ npc: "shitou", mode: "free", playerText: "你想家了吗？", trust: 20 }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).text, "你说嘛，我听着呢。");
  assert.equal(modelRequest.model, "lite");
  assert.ok(modelRequest.messages.every((item) => item.role !== "system"), "Lite must not receive system role");
  assert.match(modelRequest.messages.at(-1).content, /石头/);
  assert.match(modelRequest.messages.at(-1).content, /你想家了吗/);
  assert.doesNotMatch(modelRequest.messages.at(-1).content, /哥哥/);

  const trusted = await fetch(`${base}/api/npc`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ npc: "shitou", mode: "free", playerText: "你愿意说说家里人吗？", trust: 60 }),
  });
  assert.equal(trusted.status, 200);
  assert.match(modelRequest.messages.at(-1).content, /哥哥/);

  // 本地模型偶尔把情绪和别的角色的口音混进台词，气泡里只应显示台词。
  const localPort = await freePort();
  const localChild = spawn(process.execPath, ["server/server.mjs"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(localPort),
      AI_API_KEY: "mock-key",
      AI_MODEL: "qwen2.5:14b",
      AI_BASE_URL: `http://127.0.0.1:${upstreamPort}/v1/chat/completions`,
    },
    stdio: "ignore",
  });
  try {
    let localReady = false;
    let localHealth;
    for (let i = 0; i < 30; i++) {
      try {
        const healthResponse = await fetch(`http://127.0.0.1:${localPort}/api/health`);
        if (healthResponse.ok) {
          localHealth = await healthResponse.json();
          localReady = true;
          break;
        }
      } catch { /* wait for startup */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(localReady, "local API server should start");
    assert.equal(localHealth.model, "qwen2.5:14b");
    const localReply = await fetch(`http://127.0.0.1:${localPort}/api/npc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ npc: "li-changhe", mode: "free", playerText: "班长，我害怕。" }),
    });
    assert.equal(localReply.status, 200);
    assert.equal((await localReply.json()).text, "怕啥，跟紧我。");
  } finally {
    localChild.kill();
  }
  console.log("AI API smoke test passed: public origin, private files, Lite prompt, character response.");
} finally {
  child.kill();
  await new Promise((resolve) => upstream.close(resolve));
}
