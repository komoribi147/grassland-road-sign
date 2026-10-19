// 互动样张独立于正式存档。人物来自用户首选原图，显示遮罩保持脸、手与牵引物连在一起。
const $ = (id) => document.getElementById(id);
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const ease = (v) => v * v * (3 - 2 * v);
const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

class SceneAudio {
  constructor() {
    this.enabled = true;
    this.started = false;
    this.clips = new Map();
    for (const [name, file, volume, loop] of [
      ["rain", "rain", .23, true],
      ["strain", "sfx-cloth-strain", .4, false],
      ["mud", "sfx-mud-churn", .36, false],
      ["pant", "sfx-pant", .36, false],
    ]) {
      const audio = new Audio(`assets/audio/${file}.mp3`);
      audio.preload = "none";
      audio.volume = volume;
      audio.loop = loop;
      this.clips.set(name, audio);
    }
  }
  play(name) {
    if (!this.enabled || document.hidden) return;
    const audio = this.clips.get(name);
    if (!audio) return;
    if (!audio.loop) audio.currentTime = 0;
    audio.play().catch(() => {});
  }
  pause() { for (const clip of this.clips.values()) clip.pause(); }
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.pause();
    else if (this.started) this.play("rain");
    return this.enabled;
  }
}

export class RescueDemo {
  constructor() {
    this.phase = "loading";
    this.progress = 0;
    this.visualProgress = 0;
    this.holding = false;
    this.assisted = false;
    this.holdElapsed = 0;
    this.lastCount = -1;
    this.motion = !motionPreference.matches;
    this.pointer = null;
    this.tilt = { x: 0, y: 0 };
    this.time = 0;
    this.lastTime = 0;
    this.raf = 0;
    this.mudPlayed = false;
    this.shoreReady = false;
    this.framesReady = false;
    this.memoryTimer = 0;
    this.audio = new SceneAudio();
    this.canvas = $("weather");
    this.ctx = this.canvas.getContext("2d");
    this.ui = Object.fromEntries([
      "enterButton", "intro", "interaction", "speaker", "line", "gripButton", "pullButton",
      "pullLabel", "holdFill", "assistButton", "replayButton", "effortTrack", "effortFill",
      "quietNote", "actionHint", "memory", "people", "camera", "effortFrame", "nearBankFrame",
      "shoreFrame", "motionToggle", "soundToggle",
    ].map((id) => [id, $(id)]));
    // 雨滴稀疏、没有噪点贴图，水纹跟随泥面位置和协力动作。
    this.drops = Array.from({ length: 85 }, (_, i) => ({
      x: ((i * 73.37) % 997) / 997,
      y: ((i * 139.13) % 991) / 991,
      speed: .24 + (i % 6) * .04,
      length: 8 + (i % 5) * 3,
    }));
    this.bind();
    this.updateMotion();
    this.resize();
    this.load();
    this.resumeFrame();
  }

  async load() {
    const load = async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      if (!img.naturalWidth) throw new Error("Empty scene image");
      return img;
    };
    // 结束图单独加载，失败不阻断用户进入；准备好后才显示对应画面。
    load("assets/rescue/shore.webp").then(() => { this.shoreReady = true; }).catch(() => {});
    Promise.all([load("assets/rescue/effort.webp"), load("assets/rescue/near-bank.webp")])
      .then(() => { this.framesReady = true; })
      .catch(() => {});
    try {
      await Promise.all([load("assets/rescue/scene.webp"), load("assets/rescue/background.webp")]);
      this.setPhase("intro");
      this.ui.enterButton.disabled = false;
      this.ui.enterButton.textContent = "走近他们 →";
    } catch {
      $("loadError").hidden = false;
      this.ui.enterButton.textContent = "重新加载";
      this.ui.enterButton.disabled = false;
    }
  }

  setPhase(phase) { this.phase = phase; document.body.dataset.phase = phase; }
  say(who, text) { this.ui.speaker.textContent = who; this.ui.line.textContent = text; }

  enter() {
    if (this.phase === "loading") { location.reload(); return; }
    this.audio.started = true;
    this.audio.play("rain");
    this.ui.intro.hidden = true;
    this.ui.interaction.hidden = false;
    this.setPhase("prepare");
    this.ui.gripButton.focus({ preventScroll: true });
  }

  grip() {
    if (this.phase !== "prepare") return;
    this.setPhase("ready");
    this.ui.gripButton.hidden = true;
    this.ui.pullButton.hidden = false;
    this.ui.assistButton.hidden = false;
    this.ui.effortTrack.hidden = false;
    this.ui.quietNote.hidden = true;
    this.ui.actionHint.textContent = window.matchMedia("(pointer: coarse)").matches
      ? "按住屏幕用力；松开就能停下来。"
      : "按住鼠标或空格键；松开就能停下来。";
    this.say("李长河", "石头，抓稳。听我数，一、二、三！");
    this.ui.pullButton.focus({ preventScroll: true });
  }

  startPull(assisted = false) {
    if (!["ready", "pulling"].includes(this.phase) || document.hidden) return;
    if (this.holding) return;
    this.holding = true;
    this.assisted = assisted;
    this.holdElapsed = this.progress > 0 ? 1.5 : 0;
    this.lastCount = -1;
    document.body.dataset.holding = "true";
    this.ui.assistButton.setAttribute("aria-pressed", String(assisted));
    this.ui.assistButton.textContent = assisted ? "暂停协力" : "点一下，持续协力";
    this.ui.quietNote.hidden = true;
    this.ui.pullLabel.textContent = this.progress > 0 ? "抓牢，一起用力" : "抓牢，等口令";
    this.audio.play("strain");
    this.setPhase("pulling");
  }

  stopPull() {
    const wasHolding = this.holding;
    this.holding = false;
    this.assisted = false;
    this.pointer = null;
    document.body.dataset.holding = "false";
    this.ui.assistButton.setAttribute("aria-pressed", "false");
    this.ui.assistButton.textContent = "点一下，持续协力";
    this.audio.clips.get("strain").pause();
    if (wasHolding && this.phase === "pulling") {
      this.setPhase("ready");
      this.ui.pullLabel.textContent = "按住，继续一起拉";
      this.ui.quietNote.hidden = true;
      this.say("何秀英", "稳住。准备好了，我们再一起拉。");
    }
  }

  complete() {
    this.setPhase("complete");
    this.stopPull();
    this.ui.pullButton.hidden = true;
    this.ui.assistButton.hidden = true;
    this.ui.replayButton.hidden = false;
    this.ui.quietNote.hidden = true;
    this.ui.actionHint.textContent = "你和他们一起，抓牢了这一次。";
    if (this.shoreReady) {
      this.ui.shoreFrame.hidden = false;
      $("scene").setAttribute("aria-hidden", "true");
      // 先恢复布局再淡入，避免 display:none 直接跳到不透明。
      this.ui.shoreFrame.getBoundingClientRect();
      this.ui.shoreFrame.classList.add("on");
      this.say("何秀英", "上来了。先喘口气，我们都在。");
    } else {
      this.say("何秀英", "稳住了。沿着草甸，继续往岸边挪。");
    }
    this.audio.play("pant");
    this.memoryTimer = window.setTimeout(() => { this.ui.memory.hidden = false; }, 1500);
    this.ui.replayButton.focus({ preventScroll: true });
  }

  replay() {
    window.clearTimeout(this.memoryTimer);
    this.stopPull();
    this.progress = this.visualProgress = this.holdElapsed = 0;
    this.lastCount = -1;
    this.mudPlayed = false;
    this.ui.shoreFrame.hidden = true;
    $("scene").removeAttribute("aria-hidden");
    this.ui.shoreFrame.classList.remove("on");
    this.ui.memory.hidden = true;
    this.ui.replayButton.hidden = true;
    this.ui.gripButton.hidden = false;
    this.ui.effortTrack.hidden = true;
    this.ui.actionHint.textContent = "先找到稳固的支点。";
    this.say("何秀英", "先站稳！踩住这块草甸，抓牢绑腿布。");
    this.setPhase("prepare");
    this.updateProgress();
    this.updateFrames();
    this.ui.gripButton.focus({ preventScroll: true });
  }

  bind() {
    this.ui.enterButton.addEventListener("click", () => this.enter());
    this.ui.gripButton.addEventListener("click", () => this.grip());
    this.ui.replayButton.addEventListener("click", () => this.replay());
    const pull = this.ui.pullButton;
    pull.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || this.holding) return;
      event.preventDefault();
      pull.focus({ preventScroll: true });
      pull.setPointerCapture(event.pointerId);
      this.pointer = event.pointerId;
      this.startPull();
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
      pull.addEventListener(name, (event) => {
        if (this.pointer === event.pointerId) this.stopPull();
      });
    }
    pull.addEventListener("keydown", (event) => {
      if (![" ", "Enter"].includes(event.key)) return;
      event.preventDefault();
      if (!event.repeat) this.startPull();
    });
    pull.addEventListener("keyup", (event) => {
      if (![" ", "Enter"].includes(event.key)) return;
      event.preventDefault();
      if (!this.assisted) this.stopPull();
    });
    // 屏幕阅读器的按钮激活仍可完成同一动作，不要求必须持续按住。
    pull.addEventListener("click", (event) => {
      if (event.detail === 0 && !this.holding) this.startPull(true);
    });
    pull.addEventListener("blur", () => { if (!this.assisted) this.stopPull(); });
    this.ui.assistButton.addEventListener("click", () => {
      if (this.holding) this.stopPull();
      else this.startPull(true);
    });
    this.ui.motionToggle.addEventListener("click", () => {
      this.motion = !this.motion;
      this.updateMotion();
    });
    motionPreference.addEventListener("change", (event) => {
      this.motion = !event.matches;
      this.updateMotion();
    });
    this.ui.soundToggle.addEventListener("click", () => {
      const enabled = this.audio.toggle();
      this.ui.soundToggle.setAttribute("aria-pressed", String(enabled));
      this.ui.soundToggle.querySelector("span").textContent = enabled ? "开" : "关";
    });
    $("sceneWindow").addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse" || !this.motion) return;
      const r = $("sceneWindow").getBoundingClientRect();
      this.tilt.x = ((event.clientX - r.left) / r.width - .5) * 5;
      this.tilt.y = ((event.clientY - r.top) / r.height - .5) * 3;
    });
    $("sceneWindow").addEventListener("pointerleave", () => { this.tilt.x = this.tilt.y = 0; });
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("blur", () => this.stopPull());
    document.addEventListener("visibilitychange", () => {
      document.body.classList.toggle("page-hidden", document.hidden);
      if (document.hidden) {
        this.stopPull();
        this.audio.pause();
        cancelAnimationFrame(this.raf);
        this.raf = 0;
        this.lastTime = 0;
      } else {
        if (this.audio.started) this.audio.play("rain");
        this.resumeFrame();
      }
    });
    window.addEventListener("pagehide", () => {
      this.stopPull();
      this.audio.pause();
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    });
    window.addEventListener("pageshow", () => this.resumeFrame());
  }

  updateMotion() {
    document.body.classList.toggle("motion-off", !this.motion);
    this.ui.motionToggle.setAttribute("aria-pressed", String(this.motion));
    this.ui.motionToggle.querySelector("span").textContent = this.motion ? "开" : "关";
    if (!this.motion) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.updateFrames();
  }

  updateFrames() {
    if (!this.framesReady || !this.motion || this.phase === "intro" || this.phase === "loading") {
      this.ui.effortFrame.style.opacity = "0";
      this.ui.nearBankFrame.style.opacity = "0";
      return;
    }
    // Two brief dissolves at distinct rescue milestones keep faces readable
    // while the held frame preserves each visible gain toward the bank.
    const q = this.visualProgress;
    this.ui.effortFrame.style.opacity = String(ease(clamp((q - .18) / .13)));
    this.ui.nearBankFrame.style.opacity = String(ease(clamp((q - .58) / .15)));
  }

  resize() {
    const r = $("sceneWindow").getBoundingClientRect();
    this.width = r.width;
    this.height = r.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    // 窄桌面面板完整保留三张脸；宽屏才裁去少量下缘。手机使用独立的横向画幅。
    const contain = r.width / r.height < 1.6;
    $("sceneWindow").classList.toggle("contain", contain);
    $("scene").setAttribute("preserveAspectRatio", contain ? "xMidYMin meet" : "xMidYMin slice");
    this.ui.shoreFrame.style.objectFit = contain ? "contain" : "cover";
    this.ui.effortFrame.style.objectFit = contain ? "contain" : "cover";
    this.ui.nearBankFrame.style.objectFit = contain ? "contain" : "cover";
    const scale = (contain ? Math.min : Math.max)(r.width / 1672, r.height / 941);
    this.projection = { scale, x: (r.width - 1672 * scale) / 2, y: 0 };
  }

  updateProgress() {
    const q = this.progress;
    this.ui.holdFill.style.transform = `scaleX(${q})`;
    this.ui.effortFill.style.transform = `scaleX(${q})`;
    const percent = String(Math.round(q * 100));
    if (this.ui.effortTrack.getAttribute("aria-valuenow") !== percent) {
      this.ui.effortTrack.setAttribute("aria-valuenow", percent);
    }
  }

  step(dt) {
    this.time += dt;
    if (this.holding && this.phase === "pulling") {
      this.holdElapsed += dt;
      if (this.holdElapsed < 1.5) {
        const count = Math.min(2, Math.floor(this.holdElapsed / .5));
        if (count !== this.lastCount) {
          this.lastCount = count;
          this.say("李长河", ["一——站稳。", "二——抓牢。", "三！一起拉！"][count]);
        }
      } else {
        if (this.progress === 0) this.say("李长河", "一起拉！石头，抓住，别松手！");
        this.ui.pullLabel.textContent = "抓牢，一起用力";
        this.progress = clamp(this.progress + dt / 3.8);
        if (this.progress > .35 && !this.mudPlayed) {
          this.mudPlayed = true;
          this.audio.play("mud");
        }
        this.updateProgress();
        if (this.progress >= 1) this.complete();
      }
    }
    this.visualProgress += (this.progress - this.visualProgress) * Math.min(1, dt * 7);
    this.updateFrames();
    if (this.motion && !["loading", "intro"].includes(this.phase)) {
      const q = ease(this.visualProgress);
      const breath = Math.sin(this.time * 1.5) * .026;
      // 同一变换作用于人物、双手和牵引物，支点附近移动最小，握点不会分离。
      this.ui.people.style.transform = `rotate(${(-.78 * q + breath).toFixed(4)}deg)`;
      this.ui.camera.style.transform = `translate3d(${this.tilt.x.toFixed(2)}px,${this.tilt.y.toFixed(2)}px,0) scale(${(1 + q * .009).toFixed(4)})`;
    }
    if (this.motion) this.drawWeather();
  }

  drawWeather() {
    const { ctx, width: w, height: h, time: t } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = .65;
    ctx.strokeStyle = "rgba(216,228,221,.16)";
    ctx.beginPath();
    for (const d of this.drops) {
      const y = ((d.y + t * d.speed) % 1.1) * h;
      const x = ((d.x - t * .028) % 1 + 1) % 1 * w;
      ctx.moveTo(x, y);
      ctx.lineTo(x - d.length * .2, y + d.length);
    }
    ctx.stroke();
    if (this.phase === "complete") return;
    const { scale, x: ox, y: oy } = this.projection;
    const active = this.holding && this.holdElapsed >= 1.5;
    // 在泥水区域作少量椭圆水纹，远近尺寸不同；不会覆盖脸和衣物。
    const centers = [[1400, 837], [1175, 868], [1595, 870], [1030, 736], [1510, 890]];
    centers.forEach(([x, y], i) => {
      const age = (t * (active ? .8 : .32) + i * .21) % 1;
      const radius = (10 + age * (active ? 95 : 44)) * scale;
      ctx.strokeStyle = `rgba(203,213,199,${((1 - age) * (active ? .24 : .12)).toFixed(3)})`;
      ctx.lineWidth = .8;
      ctx.beginPath();
      ctx.ellipse(ox + x * scale, oy + y * scale, radius, radius * .17, -.04, .12, Math.PI * 1.88);
      ctx.stroke();
    });
  }

  resumeFrame() {
    if (this.raf || document.hidden) return;
    const frame = (time) => {
      const dt = this.lastTime ? clamp((time - this.lastTime) / 1000, 0, .5) : 0;
      this.lastTime = time;
      this.step(dt);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
}

new RescueDemo();
