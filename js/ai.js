// 本地预览走同源 API；线上静态站通过 site-config.js 指向云端 API。
// API 未就绪时，剧情会自动使用剧本里的兜底台词。
export class AiClient {
  constructor() {
    this.online = false;
    this.model = "";
    this.checked = false;
    this.lastError = "";
  }

  endpoint(path) {
    if (["localhost", "127.0.0.1", "[::1]"].includes(globalThis.location?.hostname)) return path;
    const base = String(globalThis.__AI_API_BASE__ || "").replace(/\/+$/, "");
    return base ? `${base}/${path}` : path;
  }

  async check() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(this.endpoint("api/health"), { cache: "no-store", signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = await res.json();
      this.online = !!info.ai;
      this.model = info.model || "";
      this.characters = info.characters || {};
      this.ready = info.ready ?? 0;
      this.total = info.total ?? 0;
      this.lastError = info.reason || "";
    } catch (err) {
      this.online = false;
      this.lastError = String(err);
    }
    this.checked = true;
    return this.online;
  }

  async reply(payload, timeoutMs = 25000) {
    return this.request("api/npc", payload, timeoutMs);
  }

  async ask(payload, timeoutMs = 25000) {
    return this.request("api/ask", payload, timeoutMs);
  }

  async request(path, payload, timeoutMs) {
    if (["localhost", "127.0.0.1", "[::1]"].includes(globalThis.location?.hostname)) timeoutMs = Math.max(timeoutMs, 150000);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(this.endpoint(path), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const text = (data.text || "").trim();
      if (!text) throw new Error("empty");
      return { text, trust: Number(data.trust) || 0, mood: data.mood || "" };
    } finally {
      clearTimeout(t);
    }
  }
}
