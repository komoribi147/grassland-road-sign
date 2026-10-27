import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

let captured = "", fakeSource = false, historicalLanguage = false, calls = 0;
const upstream = http.createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  captured = text;
  calls++;
  let studentQuote = "";
  try { studentQuote = JSON.parse(JSON.parse(text).messages.find(message => message.role === "user" && message.content.startsWith("{"))?.content || "{}").studentExplanation || ""; } catch {}
  const content = { studentQuote, observation: "你在追问标记的作用。", evidenceNote: "资料整理将红布路标标注为艺术设计。", question: "纪念战友与引导方向有什么不同？", sourceIds: [fakeSource ? "invented" : "lubiao"], evidenceIds: [fakeSource ? "invented" : "signpost-design"] };
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(historicalLanguage ? { reply: "科学的事我说不清，先把探路的任务做好。", mood: "平静" } : content) } }] }));
});
await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
const probe = http.createServer();
await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const origin = "https://classroom.example";
const child = spawn(process.execPath, ["server/server.mjs"], { cwd: new URL("..", import.meta.url), env: { ...process.env, PORT: String(port), AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1/chat/completions`, AI_MODEL: "test-model", AI_API_KEY: "test-key", AI_ALLOWED_ORIGINS: origin }, stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
const post = (payload, route = "/api/inquiry") => fetch(base + route, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(5000) });
const valid = { taskId: "signpost-evidence", initial: "我觉得路标能给后来的人指路，但不确定红布是不是史实。", initialBoundary: "unsure", sourceIds: ["lubiao"], supportNeed: "evidence" };
try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(base + "/api/health"); if (r.ok) break; } catch {} await delay(50); }
  assert.equal((await fetch(base + "/teacher-review.html")).status, 200, "教师试用记录页需要能正常访问");
  const response = await post(valid);
  assert.equal(response.status, 200, "服务端尚未提供有史料依据的探究反馈");
  const result = await response.json();
  assert.equal(result.version, 2, "模型反馈需要核对原话并绑定固定资料摘录");
  assert.equal(result.studentQuote, valid.initial);
  assert.equal(result.citations[0].evidenceId, "signpost-design");
  assert.equal(result.sourceIds[0], "lubiao");
  assert.ok(captured.includes("艺术设计"));
  assert.ok(captured.includes("让观点和依据对应起来"), "反馈需要回应学生选择的帮助方向");
  assert.ok(!captured.includes("扮演一个角色"));
  assert.equal((await post({ ...valid, initial: " " })).status, 400);
  assert.equal((await post({ ...valid, initial: "字".repeat(801) })).status, 400);
  assert.equal((await post({ ...valid, sourceIds: ["invented"] })).status, 400);
  assert.equal((await post({ ...valid, sourceIds: [] })).status, 400);
  assert.equal((await post({ ...valid, taskId: "invented" })).status, 400);
  assert.equal((await post({ ...valid, initialBoundary: "invented" })).status, 400);
  assert.equal((await post({ ...valid, supportNeed: "invented-instruction" })).status, 400);
  const spoofed = await post({ ...valid, knownLore: [{ text: "FORGED_SOURCE_CONTENT" }] }, "/inquiry");
  assert.equal(spoofed.status, 200);
  assert.ok(!captured.includes("FORGED_SOURCE_CONTENT"));
  const blocked = await fetch(base + "/inquiry", { method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: JSON.stringify(valid) });
  assert.equal(blocked.status, 403);
  fakeSource = true;
  const beforeInvalidEvidence = calls;
  assert.equal((await post(valid)).status, 502, "不能把模型编造的来源当成史料依据");
  assert.equal(calls - beforeInvalidEvidence, 2, "原话或依据错误时最多重新生成一次");
  historicalLanguage = true;
  const before = calls;
  const ordinary = await post({ npc: "li-changhe", playerText: "先做什么？", present: ["li-changhe"] }, "/api/ask");
  assert.equal((await ordinary.json()).text, "科学的事我说不清，先把探路的任务做好。", "正常历史语境的科学与任务不能触发现代事物回退");
  assert.equal(calls - before, 1, "正常词汇不应额外请求模型");
  console.log("探究接口通过：可信资料、云网关路径、来源拒绝、输入边界与模型伪造来源拒绝。");
} finally {
  const exited = new Promise(resolve => child.once("close", resolve));
  if (child.exitCode === null) { child.kill(); await exited; }
  await new Promise(resolve => upstream.close(resolve));
}
