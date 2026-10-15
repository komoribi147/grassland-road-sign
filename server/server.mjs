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
  const base = aiConfig.default || {};
  const own = (aiConfig.characters || {})[npc] || {};
  const merged = { ...base, ...own };
  const ownKey = merged.apiKeyEnv ? process.env[merged.apiKeyEnv] : "";
  const key = ownKey || process.env.AI_API_KEY || "";
  return {
    baseUrl: merged.baseUrl,
    model: merged.model,
    temperature: Number(merged.temperature ?? 0.85),
    maxTokens: Number(merged.maxTokens ?? 220),
    apiKey: key,
    keySource: ownKey ? merged.apiKeyEnv : (process.env.AI_API_KEY ? "AI_API_KEY" : ""),
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
    "只输出这个角色说出口的话，不要旁白、不要动作描写、不要括号、不要引号，1到3句，短句，口语。",
    "",
    "另外，你要判断玩家这句话让你对他的信任变化，用一个 -5 到 5 的整数表示：",
    "  真诚、承认害怕、关心伤员和别人、说到自己吃过的苦 → +1 到 +3",
    "  把自己吃的用的让给别人、替别人担风险 → +3 到 +5",
    "  撒谎、吹牛、敷衍、抱怨、命令别人 → -2 到 -5",
    "  普通的接话 → 0",
    c.judge ? `本角色额外标准：${c.judge}` : "",
    "",
    '输出必须是这样一个 JSON，不要有任何多余文字：{"reply":"你要说的话","trust":0,"mood":"平静"}',
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
      const reply = String(obj.reply || "").trim();
      if (reply) return { text: reply, trust, mood: MOODS.includes(obj.mood) ? obj.mood : "平静" };
    } catch { /* 落到下面的兜底 */ }
  }
  return { text, trust: 0, mood: "平静" };
}

async function askModel(payload) {
  const cfg = configFor(payload.npc);
  if (!cfg.apiKey) throw new Error("这个角色还没有配置 API Key");

  const res = await fetch(cfg.baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: buildMessages(payload),
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
    }),
    signal: AbortSignal.timeout(30000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`模型接口返回 ${res.status}：${raw.slice(0, 300)}`);
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`模型接口返回的不是 JSON：${raw.slice(0, 200)}`); }
  const content = data?.choices?.[0]?.message?.content || "";
  const out = parseModelOutput(content);
  if (!out.text) throw new Error("模型没有返回台词");
  return out;
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
    const detail = {};
    for (const id of Object.keys(characters)) {
      const cfg = configFor(id);
      detail[id] = { model: cfg.model, ready: Boolean(cfg.apiKey), key: cfg.keySource };
    }
    const ready = Object.values(detail).filter((d) => d.ready).length;
    return send(res, 200, JSON.stringify({
      ok: true,
      ai: ready > 0,
      model: aiConfig.default?.model || "",
      ready,
      total: Object.keys(detail).length,
      characters: detail,
      reason: ready ? "" : "没有配置 AI_API_KEY（.env），使用剧本兜底台词",
    }));
  }

  if (url.pathname === "/api/npc" && req.method === "POST") {
    try {
      const payload = await readBody(req);
      const cfg = configFor(payload.npc);
      if (!cfg.apiKey) return send(res, 503, JSON.stringify({ error: "这个角色还没配置 API Key" }));
      const out = await askModel(payload);
      console.log(`[AI] ${characters[payload.npc]?.display || payload.npc}(${cfg.model}${cfg.keySource ? " / " + cfg.keySource : ""}) ← ${String(payload.playerText).slice(0, 24)} → 信任 ${out.trust >= 0 ? "+" : ""}${out.trust}`);
      return send(res, 200, JSON.stringify(out));
    } catch (err) {
      console.error("[AI] 出错：", err.message);
      return send(res, 502, JSON.stringify({ error: err.message }));
    }
  }

  // 静态文件
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";   // 子目录也要能打开（例如 /openworld/）
  const filePath = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""));
  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    return send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
  try {
    // 用「大小 + 修改时间」当版本号：文件没变就回 304，浏览器不必把图和音频重下一遍；
    // 文件换了（比如替换某个音效）版本号就变，会自动拿到新的，不用再手动加 ?v=
    const st = await stat(filePath);
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
