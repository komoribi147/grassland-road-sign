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
  // 复现 DeepSeek 的真实失败：JSON 模式混入纯文本 assistant 历史会耗尽输出预算只返回空白。
  const incompatibleHistory = modelRequest.response_format?.type === "json_object" && modelRequest.messages.some((item) => {
    if (item.role !== "assistant") return false;
    try { return typeof JSON.parse(item.content).reply !== "string"; } catch { return true; }
  });
  const content = modelRequest.model === "qwen2.5:14b"
    ? JSON.stringify({ reply: "怕啥子嘛，跟紧我。 平静", trust: 1, mood: "平静" })
    : JSON.stringify({ reply: "你说嘛，我听着呢。", trust: 1, mood: "好奇" });
  res.end(JSON.stringify({ choices: [{ message: { content: incompatibleHistory ? " ".repeat(220) : content } }] }));
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
    AI_ALLOWED_ORIGINS: `${origin},https://gateway-injected.example`,
    AI_GATEWAY_CORS_ORIGINS: "https://gateway-injected.example",
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

  const gatewayHealth = await fetch(`${base}/health`, { headers: { Origin: origin } });
  assert.equal(gatewayHealth.status, 200, "CloudBase 网关去掉 /api 前缀后仍能检查服务");
  assert.equal((await gatewayHealth.json()).ai, true);
  const gatewayBlocked = await fetch(`${base}/health`, { headers: { Origin: "https://other.example" } });
  assert.equal(gatewayBlocked.status, 403, "短路径也必须执行来源校验");
  const managedCors = await fetch(`${base}/health`, { headers: { Origin: "https://gateway-injected.example" } });
  assert.equal(managedCors.status, 200);
  assert.equal(managedCors.headers.get("access-control-allow-origin"), null, "网关已注入跨域头的域名，应用不能重复注入");

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

  const elderly = await fetch(`${base}/api/npc`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ npc: "he-xiuying-old", mode: "free", playerText: "您还记得草地上的事吗？", trust: 50 }),
  });
  assert.equal(elderly.status, 200, "声音试听页可与晚年何秀英自由对话");
  assert.ok((await elderly.json()).text);
  assert.match(modelRequest.messages.at(-1).content, /时间地点：多年以后，何秀英晚年/);
  assert.doesNotMatch(modelRequest.messages.at(-1).content, /时间地点：1935年8月，川西北松潘草地/);
  const elderlyInStory = await fetch(`${base}/api/npc`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ npc: "he-xiuying-old", mode: "beat", playerText: "我们继续赶路。" }),
  });
  assert.equal(elderlyInStory.status, 400, "晚年人物不能混入行军时期剧情互动");

  const gatewayNpc = await fetch(`${base}/npc`, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ npc: "li-changhe", playerText: "班长，我们一起走。" }),
  });
  assert.equal(gatewayNpc.status, 200, "CloudBase 短路径应接通相同的角色接口");
  assert.ok((await gatewayNpc.json()).text);

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
    const withHistory = await fetch(`http://127.0.0.1:${localPort}/api/npc`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ npc: "li-changhe", mode: "free", playerText: "你叫什么名字？",
        history: [{ role: "npc", text: "醒了？醒了就爬起来。" }, { role: "player", text: "我醒了。" }] }),
    });
    assert.equal(withHistory.status, 200, "正式剧情带 NPC 历史时也必须能收到回答，不能退化成 502");
    assert.equal((await withHistory.json()).text, "怕啥，跟紧我。");
    const priorNpc = modelRequest.messages.find((item) => item.role === "assistant");
    assert.equal(JSON.parse(priorNpc.content).reply, "醒了？醒了就爬起来。", "历史原话保留，但遵守与本轮一致的 JSON 协议");
    assert.ok(modelRequest.messages.some((item) => item.role === "user" && item.content === "我醒了。"), "玩家原话仍按用户消息传入");
  } finally {
    localChild.kill();
  }
  console.log("AI API smoke test passed: public origin, private files, Lite prompt, character response.");
} finally {
  child.kill();
  await new Promise((resolve) => upstream.close(resolve));
}
