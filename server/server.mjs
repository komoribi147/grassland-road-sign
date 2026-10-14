// 本地小服务器：把网站跑起来，并把玩家输入转发给大模型。
// 零依赖，只需要本机的 Node.js。
//
//   node server/server.mjs
//   打开 http://localhost:8787
//
// 环境变量（写在项目根目录的 .env 文件里，见 .env.example）：
//   AI_BASE_URL  默认讯飞星火 OpenAI 兼容接口
//   AI_API_KEY   在讯飞开放平台控制台拿到的 APIPassword
//   AI_MODEL     默认 4.0Ultra
//   不配置 Key 也能跑，只是 NPC 会用剧本里写好的兜底台词。

import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

try { process.loadEnvFile(path.join(root, ".env")); } catch { /* 没有 .env 就跳过 */ }

const PORT = Number(process.env.PORT || 8787);
const AI_BASE_URL = process.env.AI_BASE_URL || "https://spark-api-open.xf-yun.com/v1/chat/completions";
const AI_API_KEY = process.env.AI_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "4.0Ultra";

const characters = JSON.parse(await readFile(path.join(root, "story/characters.json"), "utf8"));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8",
};

// ---------- 给大模型的"人设提示词" ----------

function buildMessages({ npc, situation, trust = 0, address = "你", playerText, memories = [], history = [] }) {
  const c = characters[npc];
  if (!c) throw new Error(`未知角色：${npc}`);

  const secrets = (c.secrets || [])
    .filter((s) => trust >= (s.minTrust ?? 0))
    .map((s) => s.text);

  const system = [
    "你在沉浸式历史叙事作品《草地上的路标》里扮演一个角色，和玩家对话。",
    "时间地点：1935年8月，川西北松潘草地，连日阴雨，队伍正在往外走。",
    `你扮演：${c.display || c.name}（本名${c.name}）。`,
    `身份：${c.identity}`,
    `性格：${c.persona}`,
    `说话方式：${c.speech}`,
    (c.never || []).length ? `绝对不要：${c.never.join("；")}。` : "",
    `玩家当前信任值 ${Math.round(trust)}/100，你称呼他“${address}”。信任低时保持警惕和距离，信任高时把他当自己人。`,
    situation ? `此刻的情境：${situation}` : "",
    secrets.length ? `你可以说出的心里话（只在合适的时机，不要一次全说）：${secrets.join("；")}` : "",
    memories.length ? `玩家之前说过：${memories.join("；")}` : "",
    "只输出这个角色说出口的话，不要旁白、不要动作描写、不要括号、不要引号。1到3句，短句，口语。",
  ].filter(Boolean).join("\n");

  const messages = [{ role: "system", content: system }];
  for (const h of history.slice(-8)) {
    if (!h.text) continue;
    messages.push({ role: h.role === "player" ? "user" : "assistant", content: h.text });
  }
  messages.push({ role: "user", content: playerText || "" });
  return messages;
}

async function askModel(payload) {
  const res = await fetch(AI_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AI_API_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: buildMessages(payload),
      temperature: 0.85,
      max_tokens: 160,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`模型接口返回 ${res.status}：${text.slice(0, 300)}`);
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`模型接口返回的不是 JSON：${text.slice(0, 200)}`); }
  const out = data?.choices?.[0]?.message?.content || "";
  return out.replace(/^["“]|["”]$/g, "").trim();
}

// ---------- HTTP ----------

const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(body);
};

const readBody = (req) => new Promise((resolve, reject) => {
  let buf = "";
  req.on("data", (c) => {
    buf += c;
    if (buf.length > 1e6) reject(new Error("请求太大"));
  });
  req.on("end", () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
  req.on("error", reject);
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/health") {
    return send(res, 200, JSON.stringify({
      ok: true,
      ai: Boolean(AI_API_KEY),
      model: AI_MODEL,
      reason: AI_API_KEY ? "" : "没有配置 AI_API_KEY（.env），使用剧本兜底台词",
    }));
  }

  if (url.pathname === "/api/npc" && req.method === "POST") {
    try {
      if (!AI_API_KEY) return send(res, 503, JSON.stringify({ error: "未配置 AI_API_KEY" }));
      const payload = await readBody(req);
      const text = await askModel(payload);
      console.log(`[AI] ${characters[payload.npc]?.display || payload.npc} ← ${String(payload.playerText).slice(0, 30)}`);
      return send(res, 200, JSON.stringify({ text }));
    } catch (err) {
      console.error("[AI] 出错：", err.message);
      return send(res, 502, JSON.stringify({ error: err.message }));
    }
  }

  // 静态文件
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const filePath = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    return send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
  try {
    const buf = await readFile(filePath);
    send(res, 200, buf, MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream");
  } catch {
    send(res, 500, "Read error", "text/plain; charset=utf-8");
  }
});

server.listen(PORT, () => {
  console.log("");
  console.log("  草地上的路标 · 本地预览已启动");
  console.log(`  打开： http://localhost:${PORT}`);
  console.log(`  AI ： ${AI_API_KEY ? `已连接（${AI_MODEL}）` : "未配置 Key，使用剧本兜底台词"}`);
  console.log("");
});
