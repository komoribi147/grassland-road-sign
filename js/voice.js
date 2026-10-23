/**
 * 人物台词配音播放器。
 *
 * 只播放 voice/manifest.json 里登记过的句子；没有登记的句子保持静音，不报错。
 * 浏览器不允许自动播放时，按钮仍然可以手动回放。
 */
export class VoicePlayer {
  constructor(button) {
    this.button = button || null;
    this.manifest = null;
    this.audio = null;
    this.currentId = null;
    this.ready = this.load();

    if (this.button) {
      this.button.hidden = true;
      this.button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.replay();
      });
    }
  }

  async load() {
    try {
      const url = new URL("../voice/manifest.json", import.meta.url);
      const response = await fetch(url, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      this.manifest = data && data.lines ? data : null;
      return this.manifest;
    } catch (error) {
      console.warn("人物配音清单没有加载成功：", error);
      this.manifest = null;
      return null;
    }
  }

  has(id) {
    return Boolean(id && this.manifest && this.manifest.lines[id]);
  }

  async play(id) {
    await this.ready;
    const entry = id && this.manifest && this.manifest.lines[id];
    if (!entry || !entry.file) {
      this.stop();
      return;
    }

    this._release();
    const url = new URL(`../voice/${entry.file}`, import.meta.url);
    const audio = new Audio(url.href);
    audio.preload = "auto";
    audio.volume = 0.95;
    this.audio = audio;
    this.currentId = id;
    if (this.button) {
      this.button.hidden = false;
      this.button.textContent = "▶ 回放本句";
    }

    try {
      await audio.play();
    } catch (error) {
      // 自动播放被浏览器拦截：保留按钮，玩家点一下就能听。
      console.info("台词自动播放被拦截，可点“回放本句”。", error);
    }
  }

  replay() {
    const audio = this.audio;
    if (!audio) return;
    try {
      audio.currentTime = 0;
      void audio.play();
    } catch (error) {
      console.info("回放失败：", error);
    }
  }

  stop() {
    this._release();
    this.currentId = null;
    if (this.button) this.button.hidden = true;
  }

  _release() {
    if (!this.audio) return;
    try {
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
    } catch {
      // 浏览器已经在回收这个 Audio 时什么都不用做。
    }
    this.audio = null;
  }
}
