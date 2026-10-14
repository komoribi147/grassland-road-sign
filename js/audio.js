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
