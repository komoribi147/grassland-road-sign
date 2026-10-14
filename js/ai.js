// 与本地小服务器（server/server.mjs）里的 /api/npc 通信。
// 服务器不在线 / 没配大模型 Key 时，剧情会自动用剧本科幻写好的台词兜底。
export class AiClient {
  constructor() {
    this.online = false;
    this.model = "";
    this.checked = false;
    this.lastError = "";
  }

  async check() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch("api/health", { cache: "no-store", signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = await res.json();
      this.online = !!info.ai;
      this.model = info.model || "";
      this.lastError = info.reason || "";
    } catch (err) {
      this.online = false;
      this.lastError = String(err);
    }
    this.checked = true;
    return this.online;
  }

  async reply(payload, timeoutMs = 25000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch("api/npc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const text = (data.text || "").trim();
      if (!text) throw new Error("empty");
      return text;
    } finally {
      clearTimeout(t);
    }
  }
}
