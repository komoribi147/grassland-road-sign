// 环境音管理：文件放在 assets/audio/ 下，缺失时静默跳过，不影响剧情。

/**
 * 每个素材自己的基准音量（0～1），比统一的默认值更细。
 * 雨声是 45 秒的公有领域录音，本身录得偏轻，压在 0.5 里几乎听不见，所以单独给足。
 * 想再调就改这里的数字；剧本里的 `level` 优先于这张表。
 */
const AMBIENT_LEVEL = {
  rain: 0.7,
};

export class AudioManager {
  constructor() {
    this.layers = new Map(); // name -> HTMLAudioElement
    this.enabled = true;
    this.volume = 0.5;   // 雨声这类环境音本身偏"轻"，音量给足一点才听得出来
    this.master = 1;     // 总音量（玩家在菜单里拖的那个），0 到 1
    this.missing = new Set(); // 已经确认缺失的文件，不再重复请求
  }

  /** 这一层该用多大音量（总音量 × 基准，关了声音就是 0） */
  _level(base) {
    return this.enabled ? Math.max(0, Math.min(1, base * this.master)) : 0;
  }

  /** 这一层的基准音量：剧本/表里写了就用它，没写就用默认（环境音 0.5） */
  _baseFor(el) {
    return Number.isFinite(el.baseLevel) ? el.baseLevel : this.volume;
  }

  /** 按各自基准重新算一遍所有在播的音量（拖总音量条、开关声音时用） */
  _applyLevels() {
    for (const el of this.layers.values()) {
      el.volume = this._level(this._baseFor(el)) * (el.fade ?? 1);
    }
  }

  /** 玩家拖音量条：0 到 1 */
  setVolume(v) {
    const vol = Math.max(0, Math.min(1, Number(v) || 0));
    this.master = vol;
    this._applyLevels();
    return vol;
  }

  setEnabled(on) {
    this.enabled = on;
    for (const el of this.layers.values()) {
      if (!on) {
        clearInterval(el.fadeTimer);
        el.fade = 0;
        el.pause();
      }
      else el.play().catch(() => { /* 浏览器要求用户先交互 */ });
    }
    this._applyLevels();
  }

  /** 浏览器要求先有用户操作才允许播放，第一次点击时把待播的环境音补上 */
  resume() {
    if (!this.enabled) return;
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

  /**
   * 循环播放环境音，例如 rain / wind / steps。
   * level（0～1）传了就用它当这一层的基准，没传就用素材表 / 默认值。
   * 已经在放的层不重头来，只调音量。
   */
  loop(name, level) {
    if (!name || this.missing.has(name)) return;
    const playing = this.layers.get(name);
    if (playing) {
      if (Number.isFinite(level)) {
        playing.baseLevel = level;
        this._applyLevels();
      }
      return playing;
    }
    const el = new Audio(`assets/audio/${name}.mp3`);
    el.loop = true;
    el.baseLevel = Number.isFinite(level) ? level : AMBIENT_LEVEL[name] ?? this.volume;
    el.fade = 0;
    el.volume = 0;
    el.addEventListener("playing", () => {
      clearInterval(el.fadeTimer);
      const started = Date.now();
      el.fade = 0;
      this._applyLevels();
      el.fadeTimer = setInterval(() => {
        if (el.paused || this.layers.get(name) !== el) {
          clearInterval(el.fadeTimer);
          return;
        }
        el.fade = Math.min(1, (Date.now() - started) / 700);
        this._applyLevels();
        if (el.fade === 1) clearInterval(el.fadeTimer);
      }, 25);
    });
    el.addEventListener("error", () => {
      this.missing.add(name);
      this.layers.delete(name);
    });
    this.layers.set(name, el);
    el.play().catch(() => { /* 等用户第一次点击后再播 */ });
    return el;
  }

  stop(name) {
    const el = this.layers.get(name);
    if (!el) return;
    clearInterval(el.fadeTimer);
    el.pause();
    this.layers.delete(name);
  }

  /** 一次性音效，例如 splash / bell */
  once(name, level) {
    if (!name || this.missing.has(`sfx:${name}`)) return;
    const el = new Audio(`assets/audio/sfx-${name}.mp3`);
    el.volume = this._level(Number.isFinite(level) ? level : 0.4);
    el.addEventListener("error", () => this.missing.add(`sfx:${name}`));
    el.play().catch(() => { /* 忽略 */ });
  }
}
