// 本地小服务器：把网站跑起来，并把玩家输入转发给大模型。
// 零依赖，只需要本机的 Node.js。
//
//   node server/server.mjs
//   打开 http://localhost:8787
//
// 三个 NPC 各自独立：各有各的人设、各有各的对话记忆（记忆在前端分开存），
// 模型、温度、甚至 API 账号都可以在 server/ai-config.json 里分别指定。

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

try { process.loadEnvFile(path.join(root, ".env")); } catch { /* 没有 .env 就跳过 */ }

const PORT = Number(process.env.PORT || 8787);
const characters = JSON.parse(await readFile(path.join(root, "story/characters.json"), "utf8"));
const aiConfig = JSON.parse(await readFile(path.join(root, "server/ai-config.json"), "utf8"));

/** 把 default 和某个角色的单独配置合起来 */
function configFor(npc) {
  const defaults = aiConfig.default || {};
  const own = (aiConfig.characters || {})[npc] || {};
  const merged = { ...defaults, ...own };
  const ownKey = merged.apiKeyEnv ? process.env[merged.apiKeyEnv] : "";
  const key = ownKey || process.env.AI_API_KEY || "";
  return {
    baseUrl: process.env.AI_BASE_URL || merged.baseUrl,
    model: process.env.AI_MODEL || merged.model,
    temperature: Number(merged.temperature ?? 0.85),
    maxTokens: Number(merged.maxTokens ?? 220),
    apiKey: key,
  };
}

const MOODS = ["警惕", "缓和", "疲惫", "难过", "坚定", "好奇", "平静"];

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

function buildMessages({ npc, situation, trust = 0, address = "你", playerText, memories = [], history = [], mode = "beat" }) {
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
    mode === "free" ? "玩家是主动开口找你说话的，你可以比平时多说一点点。" : "",
    situation ? `此刻的情境：${situation}` : "",
    secrets.length ? `你可以说出的心里话（只在合适的时机，不要一次全说）：${secrets.join("；")}` : "",
    memories.length ? `玩家之前说过：${memories.join("；")}` : "",
    "不要编造人物设定中未给出的亲属、生平和未来经历；没有交代的事就说不知道。",
    "只输出这个角色说出口的话，不要旁白、不要动作描写、不要括号、不要引号，1到3句，短句，口语。",
    "",
    "另外，你要判断玩家这句话让你对他的信任变化，用一个 -5 到 5 的整数表示：",
    "  真诚、承认害怕、关心伤员和别人、说到自己吃过的苦 → +1 到 +3",
    "  把自己吃的用的让给别人、替别人担风险 → +3 到 +5",
    "  撒谎、吹牛、敷衍、抱怨、命令别人 → -2 到 -5",
    "  普通的接话 → 0",
    c.judge ? `本角色额外标准：${c.judge}` : "",
    "",
    '输出必须是这样一个 JSON，不要有任何多余文字：{"reply":"你要说的话","trust":0,"mood":"平静"}。reply 里只能放说出口的台词，不能放情绪词或字段名。',
    `mood 只能从这几个里选一个：${MOODS.join("、")}`
  ].filter(Boolean).join("\n");

  const messages = [{ role: "system", content: system }];
  for (const h of history.slice(-10)) {
    if (!h.text) continue;
    messages.push({ role: h.role === "player" ? "user" : "assistant", content: h.text });
  }
  messages.push({ role: "user", content: playerText || "" });
  return messages;
}

/** 模型有时会包着 ```json 或者多说一句，这里做容错解析 */
function parseModelOutput(raw) {
  const text = String(raw || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(text.slice(start, end + 1));
      const trust = Math.max(-5, Math.min(5, Math.round(Number(obj.trust) || 0)));
      const reply = cleanSpokenText(obj.reply);
      if (reply) return { text: reply, trust, mood: MOODS.includes(obj.mood) ? obj.mood : "平静" };
    } catch { /* 落到下面的兜底 */ }
  }
  // 部分本地模型会把台词写在 JSON 外，或把信任字段接在台词尾部。
  const replyMatch = text.match(/"reply"\s*:\s*"((?:\\.|[^"\\])*)"/s);
  let spoken = text;
  if (replyMatch) {
    try { spoken = JSON.parse(`"${replyMatch[1]}"`); }
    catch { spoken = replyMatch[1]; }
  }
  spoken = cleanSpokenText(spoken.replace(/\s*\{\s*"(?:trust|mood)"[\s\S]*$/, ""));
  const trustMatch = text.match(/"trust"\s*:\s*(-?\d+)/);
  const moodMatch = text.match(/"mood"\s*:\s*"([^"\n]+)"/);
  return {
    text: spoken,
    trust: trustMatch ? Math.max(-5, Math.min(5, Number(trustMatch[1]))) : 0,
    mood: MOODS.includes(moodMatch?.[1]) ? moodMatch[1] : "平静",
  };
}

function cleanSpokenText(value) {
  // 本地模型偶尔把 mood 的值接在完整台词后面，避免状态词出现在气泡里。
  return String(value || "")
    .trim()
    .replace(new RegExp(`([。！？])\\s*(?:${MOODS.join("|")})$`), "$1")
    .trim();
}

async function askModel(payload) {
  const cfg = configFor(payload.npc);
  if (!cfg.apiKey) throw new Error("这个角色还没有配置 API Key");

  const messages = buildMessages(payload);
  // 星火 Lite/Pro 不支持 system 消息，把人设放进当轮 user 消息。
  if (["lite", "generalv3", "pro-128k"].includes(cfg.model)) {
    const roleGuide = messages.shift().content;
    messages.at(-1).content = `${roleGuide}\n\n玩家刚才说：${messages.at(-1).content}`;
  }

  const res = await fetch(cfg.baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(30000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`模型接口返回 ${res.status}`);
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error("模型接口返回的不是 JSON"); }
  const content = data?.choices?.[0]?.message?.content || "";
  const out = parseModelOutput(content);
  if (!out.text) throw new Error("模型没有返回台词");
  if (payload.npc === "li-changhe") {
    // 老班长是河南信阳人；本地模型偶尔借用了石头的四川语气。
    out.text = out.text.replace(/啥子嘛/g, "啥").replace(/啥子/g, "啥").replace(/嘛(?=[。！？]|$)/g, "吧");
  }
  return out;
}

// ---------- HTTP ----------

const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-cache" });
  res.end(body);
};

// 只发布网页需要的文件。尤其不能让浏览器读取根目录的 .env、.git 或 server/。
const PUBLIC_FILES = new Set(["index.html", "rescue-demo.html", "favicon.ico"]);
const PUBLIC_DIRS = new Set(["assets", "css", "js", "story", "docs", "openworld"]);
const allowedOrigins = new Set((process.env.AI_ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean));
const requestCounts = new Map();

function allowOrigin(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;
  let sameOrigin = false;
  try { sameOrigin = new URL(origin).host === req.headers.host; } catch { return false; }
  if (!sameOrigin && !allowedOrigins.has(origin)) return false;
  res.setHeader("Vary", "Origin");
  if (!sameOrigin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return true;
}

function withinRateLimit(req) {
  const now = Date.now();
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean).at(-1);
  const ip = forwarded || req.socket.remoteAddress || "unknown";
  const entry = requestCounts.get(ip);
  if (!entry || now - entry.since >= 60000) {
    requestCounts.set(ip, { since: now, count: 1 });
    if (requestCounts.size > 10000) requestCounts.clear();
    return true;
  }
  entry.count++;
  return entry.count <= 12;
}

function validatePayload(input) {
  if (!input || typeof input !== "object" || !characters[input.npc] || input.npc === "he-xiuying-old") return null;
  const playerText = typeof input.playerText === "string" ? input.playerText.trim() : "";
  if (!playerText || playerText.length > 200) return null;
  const shortText = (value, max) => typeof value === "string" ? value.slice(0, max) : "";
  return {
    npc: input.npc,
    mode: input.mode === "free" ? "free" : "beat",
    situation: shortText(input.situation, 300),
    trust: Math.max(0, Math.min(100, Number(input.trust) || 0)),
    address: shortText(input.address, 20) || "你",
    playerText,
    memories: Array.isArray(input.memories) ? input.memories.slice(-6).map((s) => shortText(s, 200)) : [],
    history: Array.isArray(input.history) ? input.history.slice(-10).map((h) => ({
      role: h?.role === "player" ? "player" : "npc",
      text: shortText(h?.text, 200),
    })) : [],
  };
}

const readBody = (req) => new Promise((resolve, reject) => {
  let buf = "";
  req.on("data", (c) => {
    buf += c;
    if (buf.length > 12000) reject(new Error("请求太大"));
  });
  req.on("end", () => { try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); } });
  req.on("error", reject);
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith("/api/")) {
    if (!allowOrigin(req, res)) return send(res, 403, JSON.stringify({ error: "来源不允许" }));
    if (req.method === "OPTIONS") return send(res, 204, "");
  }

  if (url.pathname === "/api/health") {
    const detail = {};
    for (const id of Object.keys(characters)) {
      const cfg = configFor(id);
      detail[id] = { model: cfg.model, ready: Boolean(cfg.apiKey) };
    }
    const ready = Object.values(detail).filter((d) => d.ready).length;
    return send(res, 200, JSON.stringify({
      ok: true,
      ai: ready > 0,
      model: process.env.AI_MODEL || aiConfig.default?.model || "",
      ready,
      total: Object.keys(detail).length,
      characters: detail,
      reason: ready ? "" : "没有配置 AI_API_KEY（.env），使用剧本兜底台词",
    }));
  }

  if (url.pathname === "/api/npc" && req.method === "POST") {
    try {
      if (!withinRateLimit(req)) return send(res, 429, JSON.stringify({ error: "说得太快了，请稍后再试" }));
      const payload = validatePayload(await readBody(req));
      if (!payload) return send(res, 400, JSON.stringify({ error: "对话内容不合要求" }));
      const cfg = configFor(payload.npc);
      if (!cfg.apiKey) return send(res, 503, JSON.stringify({ error: "这个角色还没配置 API Key" }));
      const out = await askModel(payload);
      console.log(`[AI] ${characters[payload.npc]?.display || payload.npc}(${cfg.model}) → 信任 ${out.trust >= 0 ? "+" : ""}${out.trust}`);
      return send(res, 200, JSON.stringify(out));
    } catch (err) {
      console.error("[AI] 出错：", err.message);
      return send(res, 502, JSON.stringify({ error: "角色暂时无法回答" }));
    }
  }

  // 静态文件
  let rel;
  try { rel = decodeURIComponent(url.pathname).replaceAll("\\", "/"); }
  catch { return send(res, 400, "Bad path", "text/plain; charset=utf-8"); }
  if (rel.endsWith("/")) rel += "index.html";   // 子目录也要能打开（例如 /openworld/）
  const parts = rel.split("/").filter(Boolean);
  const permitted = parts.length === 1
    ? PUBLIC_FILES.has(parts[0])
    : PUBLIC_DIRS.has(parts[0]);
  if (!permitted || parts.some((part) => part.startsWith(".") || part === "..")) {
    return send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
  const filePath = path.resolve(root, ...parts);
  if (!filePath.startsWith(root + path.sep) || !existsSync(filePath)) {
    return send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
  try {
    // 用「大小 + 修改时间」当版本号：文件没变就回 304，浏览器不必把图和音频重下一遍；
    // 文件换了（比如替换某个音效）版本号就变，会自动拿到新的，不用再手动加 ?v=
    const st = await stat(filePath);
    if (!st.isFile()) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag, "Cache-Control": "no-cache" });
      return res.end();
    }
    const buf = await readFile(filePath);
    const type = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-cache", ETag: etag });
    res.end(buf);
  } catch {
    send(res, 500, "Read error", "text/plain; charset=utf-8");
  }
});

server.listen(PORT, () => {
  const list = Object.keys(characters)
    .filter((id) => id !== "narration")
    .map((id) => {
      const cfg = configFor(id);
      return `${characters[id].display || characters[id].name}:${cfg.model}${cfg.apiKey ? "" : "(未配 Key)"}`;
    });
  console.log("");
  console.log("  草地上的路标 · 本地预览已启动");
  console.log(`  打开： http://localhost:${PORT}`);
  console.log(`  NPC ： ${list.join("  |  ")}`);
  console.log(`  AI ： ${configFor("li-changhe").apiKey ? "已连接" : "未配置 Key，使用剧本兜底台词"}`);
  console.log("");
});
