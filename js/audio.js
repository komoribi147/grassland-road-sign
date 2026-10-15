// 环境音管理：文件放在 assets/audio/ 下，缺失时静默跳过，不影响剧情。
export class AudioManager {
  constructor() {
    this.layers = new Map(); // name -> HTMLAudioElement
    this.enabled = true;
    this.volume = 0.5;   // 雨声这类环境音本身偏"轻"，音量给足一点才听得出来
    this.missing = new Set(); // 已经确认缺失的文件，不再重复请求
  }

  setEnabled(on) {
    this.enabled = on;
    for (const el of this.layers.values()) {
      el.volume = on ? this.volume : 0;
      if (!on) el.pause();
      else el.play().catch(() => { /* 浏览器要求用户先交互 */ });
    }
  }

  /** 浏览器要求先有用户操作才允许播放，第一次点击时把待播的环境音补上 */
  resume() {
    for (const el of this.layers.values()) {
      el.play().catch(() => { /* 仍然不允许就下次再说 */ });
    }
  }

  /**
   * 预热：提前把音频下进浏览器缓存（只下载、不播放，所以不受自动播放限制）。
   * 不预热的话音效要等下载完才响——那正是"音画不同步"的来源。
   * kind: "sfx"（一次性音效）/ "ambient"（循环环境音）/ "bgm"（配乐）
   */
  warm(names = [], kind = "sfx") {
    for (const name of names) {
      if (!name) continue;
      const key = kind === "bgm" ? `bgm:${name}` : kind === "ambient" ? name : `sfx:${name}`;
      if (this.layers.has(key) || this.missing.has(key)) continue;
      const warmed = (this.warmed ||= new Set());
      if (warmed.has(key)) continue;
      warmed.add(key);
      const url = kind === "bgm"
        ? `assets/audio/bgm-${name}.mp3`
        : kind === "ambient"
          ? `assets/audio/${name}.mp3`
          : `assets/audio/sfx-${name}.mp3`;
      const el = new Audio();
      el.preload = "auto";
      el.volume = 0;
      // 文件还没放进来（比如缺 sfx-shout.mp3）就记下来，免得每次预热都白发一次 404
      el.addEventListener("error", () => {
        this.missing.add(key);
        warmed.delete(key);
      });
      el.src = url;
      try { el.load(); } catch { /* 忽略 */ }
    }
  }

  /** 循环播放环境音，例如 rain / wind / steps */
  loop(name) {
    if (!name || this.layers.has(name) || this.missing.has(name)) return;
    const el = new Audio(`assets/audio/${name}.mp3`);
    el.loop = true;
    el.volume = this.enabled ? this.volume : 0;
    el.addEventListener("error", () => {
      this.missing.add(name);
      this.layers.delete(name);
    });
    el.play().catch(() => { /* 等用户第一次点击后再播 */ });
    this.layers.set(name, el);
  }

  stop(name) {
    const el = this.layers.get(name);
    if (!el) return;
    el.pause();
    this.layers.delete(name);
  }

  /** 一次性音效，例如 splash / bell */
  once(name) {
    if (!name || this.missing.has(`sfx:${name}`)) return;
    const el = new Audio(`assets/audio/sfx-${name}.mp3`);
    el.volume = this.enabled ? Math.min(0.6, this.volume + 0.15) : 0;
    el.addEventListener("error", () => this.missing.add(`sfx:${name}`));
    el.play().catch(() => { /* 忽略 */ });
  }
}
