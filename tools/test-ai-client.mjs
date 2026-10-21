import assert from "node:assert/strict";
import { createServer } from "node:http";
import { AiClient } from "../js/ai.js";

const paths = [];
const api = createServer(async (req, res) => {
  paths.push(req.url);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const input = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
  if (input.playerText === "等待") return; // 有连接但不响应，检验客户端能主动结束等待。
  if (input.playerText === "出错") { res.writeHead(503); res.end("{}"); return; }
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ text: input.playerText === "空话" ? "" : "跟着队伍走。", mood: "平静", trust: 2 }));
});
await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
globalThis.__AI_API_BASE__ = `http://127.0.0.1:${api.address().port}/`;
try {
  const client = new AiClient();
  const out = await client.ask({ npc: "li-changhe", playerText: "班长，我跟着你。" });
  assert.equal(paths.at(-1), "/api/ask");
  assert.equal(out.text, "跟着队伍走。");
  assert.equal(out.mood, "平静");
  await client.reply({ npc: "li-changhe", playerText: "班长，我跟着你。" });
  assert.equal(paths.at(-1), "/api/npc", "主线和自由提问必须分别使用正确接口");
  await assert.rejects(client.ask({ playerText: "出错" }), /HTTP 503/);
  await assert.rejects(client.ask({ playerText: "空话" }), /empty/);
  await assert.rejects(client.ask({ playerText: "等待" }, 30), (err) => err.name === "AbortError", "无响应不能让提问面板一直锁住");
  console.log("AI 客户端通过：公网地址拼接、两类接口、错误、空回答与超时退出。");
} finally {
  delete globalThis.__AI_API_BASE__;
  api.closeAllConnections();
  await new Promise((resolve) => api.close(resolve));
}
