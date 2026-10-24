const normalize = text => String(text || "").replace(/\s+/g, " ").trim();
export const localVoiceEndpoint = (location = globalThis.location) => !location || /^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(location.hostname) ? "/api/tts" : null;
const comparable = text => normalize(text).normalize("NFKC")
  .replace(/^中[。！!，,]\s*/u, "").replace(/[\p{P}\p{S}\s]/gu, "");

/** One shared character voice channel. A cancelled response can never start later. */
export class VoicePlayer {
  constructor({ fetcher = (...args) => fetch(...args), AudioClass = globalThis.Audio,
    createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url),
    manifest = null, fixedManifest = null, onStatus = () => {}, onAudio = () => {},
    location = globalThis.location,
    ttsEndpoint = localVoiceEndpoint(location) } = {}) {
    Object.assign(this, { fetcher, AudioClass, createUrl, revokeUrl, onStatus, onAudio, manifest, fixedManifest, ttsEndpoint });
    this.enabled = true;
    this.masterEnabled = true;
    this.realtimeEnabled = true;
    this.volume = 1;
    this.serial = 0;
    this.audio = null;
    this.last = null;
    this.ready = fixedManifest ? Promise.resolve(fixedManifest) : this.loadFixed();
  }

  async loadFixed() {
    try {
      const res = await this.fetcher("voice/manifest.json", { signal: AbortSignal.timeout(5000), cache: "no-cache" });
      this.fixedManifest = res.ok ? await res.json() : { lines: {} };
    } catch { this.fixedManifest = { lines: {} }; }
    return this.fixedManifest;
  }

  fixedLine(id, npc, template, spokenText = null) {
    const entry = this.fixedManifest?.lines?.[id];
    if (!entry || entry.who !== npc || !/^audio\/[a-zA-Z0-9_-]+\.mp3$/.test(entry.file || "")) return null;
    if (comparable(entry.text) !== comparable(template)) return null;
    if (entry.variants && spokenText != null) {
      const address = Object.keys(entry.variants).find(value =>
        comparable(entry.text.replaceAll("{player}", value)) === comparable(spokenText));
      const variant = entry.variants[address];
      if (!variant || !/^audio\/[a-zA-Z0-9_-]+\.mp3$/.test(variant.file || "")) return null;
      return { ...entry, ...variant };
    }
    return entry;
  }

  stop({ clearReplay = true } = {}) {
    this.serial++;
    this.controller?.abort();
    this.controller = null;
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute?.("src");
      this.audio.load?.();
      this.audio = null;
    }
    if (this.url) this.revokeUrl(this.url);
    this.url = null;
    this.onAudio(null);
    if (clearReplay) this.last = null;
    this.onStatus({ state: "idle", replayable: !!this.last });
  }

  setEnabled(on) { this.enabled = !!on; if (!on) this.stop(); }
  setMasterEnabled(on) { this.masterEnabled = !!on; if (!on) this.stop(); }
  setRealtimeEnabled(on) { this.realtimeEnabled = !!on; if (!on && this.last?.options.mode === "dynamic") this.stop(); }
  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.audio) this.audio.volume = this.volume;
  }

  get canSynthesize() { return Boolean(this.ttsEndpoint); }

  replay() {
    if (!this.last) return Promise.resolve(false);
    const { npc, text, options } = this.last;
    return this.speak(npc, text, options);
  }

  async speak(npc, rawText, options = {}) {
    this.stop();
    const text = normalize(rawText);
    const mode = options.mode || "dynamic";
    if (!this.enabled || !this.masterEnabled || !text || !npc || npc === "__player__") return false;
    if (mode === "dynamic" && !this.realtimeEnabled) return false;
    if (mode === "dynamic" && !this.canSynthesize) {
      this.onStatus({ state: "error", source: "realtime", npc, replayable: false,
        message: "在线回复语音尚未开通，文字对话和剧情配音可正常使用。" });
      return false;
    }
    const serial = this.serial;
    const controller = this.controller = new AbortController();
    const current = () => serial === this.serial && !controller.signal.aborted;
    const source = mode === "fixed" ? "confirmed" : mode === "candidate" ? "candidate" : "realtime";
    const timer = setTimeout(() => controller.abort(), mode === "dynamic" ? 240000 : 45000);
    try {
      let url;
      if (mode === "fixed") {
        await this.ready;
        if (!current()) return false;
        const entry = this.fixedLine(options.id, npc, options.template ?? text, text);
        if (!entry) { this.stop(); return false; }
        url = `voice/${entry.file}`;
      } else if (mode === "candidate") {
        if (!/^assets\/audio\/voice-candidates\/[a-z0-9-]+\.wav$/.test(options.url || "")) throw new Error("候选配音路径无效");
        url = options.url;
      } else if (mode === "sample") {
        if (!this.manifest) {
          const res = await this.fetcher("assets/audio/voices/manifest.json", { signal: controller.signal });
          this.manifest = res.ok ? await res.json() : { clips: [] };
        }
        if (!current()) return false;
        url = this.manifest.clips?.find(item => item.npc === npc && item.text === text)?.url;
      }
      if (!current()) return false;
      this.last = { npc, text, options: { ...options, mode } };
      this.onStatus({ state: "loading", npc, source, replayable: true });
      const response = url
        ? await this.fetcher(url, { signal: controller.signal })
        : await this.fetcher(this.ttsEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ npc, text, mood: options.mood || "平静" }), signal: controller.signal });
      if (!response.ok) throw new Error("配音暂时连不上，文字仍可继续阅读");
      const blob = await response.blob();
      const provider = response.headers?.get?.("X-Voice-Provider") || "edge";
      if (!current()) return false;
      this.url = this.createUrl(blob);
      const audio = this.audio = new this.AudioClass(this.url);
      audio.volume = this.volume;
      this.onAudio(audio, { npc, source });
      audio.addEventListener("ended", () => { if (current()) this.onStatus({ state: "ended", npc, source, provider, replayable: true }); });
      audio.addEventListener("error", () => {
        if (!current()) return;
        this.stop({ clearReplay: false });
        this.onStatus({ state: "error", npc, source, replayable: true, message: "这句配音未能播放，文字仍可继续阅读" });
      });
      await audio.play();
      if (!current()) return false;
      this.onStatus({ state: "playing", npc, source, provider, replayable: true });
      return true;
    } catch (error) {
      if (serial !== this.serial) return false;
      const message = error.name === "NotAllowedError" ? "浏览器暂停了配音，可点“回放本句”重试" : "配音暂时连不上，文字仍可继续阅读";
      this.stop({ clearReplay: false });
      this.onStatus({ state: "error", npc, source, replayable: !!this.last, message });
      return false;
    } finally { clearTimeout(timer); }
  }
}
