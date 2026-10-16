// 剧情引擎：读 story/ 目录下的 JSON，按步骤播放，处理选择、预选项回答、信任值、史料卡。
// 剧情作者只需要写 JSON，不需要改这个文件。

import { AiClient } from "./ai.js";
import { AudioManager } from "./audio.js";
import { Save } from "./save.js";

const $ = (id) => document.getElementById(id);
const PLAYER = "__player__";

// 情绪 → 立绘文件名后缀。剧本里写中文情绪（和 AI 返回的一致），文件用英文名。
const MOOD_FILE = {
  "警惕": "wary", "缓和": "soft", "疲惫": "tired",
  "害怕": "scared", "好奇": "curious", "笑": "smile",
  "平静": "calm", "坚定": "firm", "难过": "sad",
};

export class StoryEngine {
  constructor(hooks = {}) {
    this.on = hooks;                     // { toast, report, stateChange }
    this.ai = new AiClient();
    this.audio = new AudioManager();
    this.manifest = null;
    this.characters = {};
    this.lore = {};
    this.scenes = {};
    this.state = null;
    this.epoch = 0;                      // 重开一次就加一，用来终止旧循环
    this.running = false;
    this._resolveSelect = null;          // 预选项等待中：语音回答 / 重开收场用
    this._resolveClick = null;           // 点击等待中：重开收场用
    this._bgFront = true;
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    this.ui = {
      bgA: $("bgA"), bgB: $("bgB"), rain: $("rain"),
      topbar: $("topbar"), chapterName: $("chapterName"),
      trustAddress: $("trustAddress"), trustFill: $("trustFill"),
      dialogue: $("dialogue"), speaker: $("speakerName"),
      text: $("dialogueText"), choices: $("choices"), hint: $("clickHint"),
      portrait: $("portrait"),
      visual: $("storyVisual"), visualHint: $("visualHint"),
    };
    this._portraitToken = 0;
    this._visualToken = 0;
    this._activeVisual = null;
    this._activeImage = null;
    window.addEventListener("resize", () => {
      if (this._activeVisual && this._activeImage) this.paintVisual(this._activeImage, this._activeVisual);
    });
  }

  /** 显示某个角色的立绘。没有这张图就自动不显示，不会留空框。 */
  setPortrait(npcId, mood) {
    const el = this.ui.portrait;
    if (!el) return;
    const token = ++this._portraitToken;
    if (!npcId || npcId === PLAYER || !this.characters?.[npcId]) { el.hidden = true; return; }
    const want = mood || this.characters[npcId].defaultMood || "";
    const list = [];
    const withExt = (base) => [`${base}.png`, `${base}.webp`];
    // 先找指定情绪，再找默认情绪，最后把九种情绪都试一遍 ——
    // 这样"只画了三个表情里的一个"也能显示出来，不会空着。
    if (want && MOOD_FILE[want]) list.push(...withExt(`assets/char/${npcId}-${MOOD_FILE[want]}`));
    const rest = Object.values(MOOD_FILE).filter((m) => m !== MOOD_FILE[want]);
    for (const m of rest) list.push(...withExt(`assets/char/${npcId}-${m}`));
    list.push(...withExt(`assets/char/${npcId}`));

    const tryNext = (i) => {
      if (token !== this._portraitToken) return;
      if (i >= list.length) { el.hidden = true; return; }
      const probe = new Image();
      probe.onload = () => {
        if (token !== this._portraitToken) return;
        el.src = window.__PORTRAITS__?.[list[i]] || list[i];
        el.hidden = false;
        // 每个人呼吸的节奏不一样，画面才不像一个模子
        const seed = [...npcId].reduce((n, c) => n + c.charCodeAt(0), 0);
        el.style.animationDuration = `0.5s, ${(3.6 + (seed % 17) / 10).toFixed(2)}s`;
      };
      probe.onerror = () => tryNext(i + 1);
      probe.src = window.__PORTRAITS__?.[list[i]] || list[i];
    };
    tryNext(0);
  }

  /** 从六格分镜图中取出当前一格；窄屏保留整格画面。 */
  paintVisual(img, visual) {
    const canvas = this.ui.visual;
    if (!canvas) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = width;
    canvas.height = height;
    const panelWidth = img.naturalWidth / 2;
    const panelHeight = img.naturalHeight / 3;
    const col = visual.panel % 2;
    const row = Math.floor(visual.panel / 2);
    const sx = col * panelWidth;
    const sy = row * panelHeight;
    const ctx = canvas.getContext("2d");
    const cover = Math.max(width / panelWidth, height / panelHeight);
    const cropWidth = width / cover;
    const cropHeight = height / cover;
    ctx.filter = "blur(18px) brightness(0.4)";
    ctx.drawImage(img, sx + (panelWidth - cropWidth) / 2, sy + (panelHeight - cropHeight) / 2,
      cropWidth, cropHeight, 0, 0, width, height);
    ctx.filter = "none";
    const contain = Math.min(width / panelWidth, height / panelHeight);
    const displayWidth = panelWidth * contain;
    const displayHeight = panelHeight * contain;
    ctx.drawImage(img, sx, sy, panelWidth, panelHeight,
      (width - displayWidth) / 2, (height - displayHeight) / 2, displayWidth, displayHeight);
    canvas.hidden = false;
  }

  async renderVisual(visual, description = "") {
    const canvas = this.ui.visual;
    const token = ++this._visualToken;
    this._activeVisual = visual || null;
    this._activeImage = null;
    canvas.hidden = true;
    if (!visual?.sheet) return;
    canvas.setAttribute("aria-label", `我看见：${(description || "草地上的景象").replaceAll("你", "我")}`);
    const img = new Image();
    const loaded = await new Promise((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = window.__STORYBOARDS__?.[visual.sheet] || visual.sheet;
    });
    if (token !== this._visualToken) return;
    if (!loaded) { this.on.toast?.("画面暂时无法加载"); return; }
    this._activeImage = img;
    this.paintVisual(img, visual);
  }

  async visualBeat(step) {
    this.ui.dialogue.hidden = true;
    this.ui.visualHint.hidden = false;
    this.setPortrait(null);
    await this.renderVisual(step.visual, step.description);
    await this.waitClick();
    this.ui.visualHint.hidden = true;
    return "next";
  }

  // ---------- 读取数据 ----------

  async load() {
    const j = async (path) => {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`读取 ${path} 失败（HTTP ${res.status}）`);
      return res.json();
    };
    this.manifest = await j("story/manifest.json");
    this.characters = await j("story/characters.json");
    this.lore = await j("story/lore.json");
    const list = await Promise.all(this.manifest.scenes.map(j));
    for (const scene of list) this.scenes[scene.id] = scene;
  }

  // ---------- 状态 ----------

  newState() {
    const start = this.manifest.start;
    return {
      sceneId: start,
      step: 0,
      trust: 0,
      vars: {},
      lore: [],
      answers: [],
      picks: [],
      turns: 0,
      history: [],
      log: [],        // 回看用：走到过的每一句（场景 + 步号 + 谁 + 文本）
      trustLog: [],   // 回看用：每一笔信任值变化发生在哪一句（回退时按它扣回去）
      memory: {},     // 每个 NPC 一份独立的对话记忆
      freeTrust: {},  // 自由对话带来的信任值，按幕封顶，防止刷分
      startedAt: Date.now(),
    };
  }

  // ---------- 每个 NPC 自己的记性 ----------

  memoryOf(npc) {
    if (!this.state.memory) this.state.memory = {};
    if (!this.state.memory[npc]) this.state.memory[npc] = [];
    return this.state.memory[npc];
  }

  remember(npc, role, text, mood) {
    if (!npc || npc === PLAYER || !text) return;
    const mem = this.memoryOf(npc);
    mem.push({ role, text, mood: mood || "" });
    if (mem.length > 40) mem.shift();
  }

  /** 此刻在场、可以说话的人 */
  presentNpcs() {
    const scene = this.scene();
    return (scene?.present || []).filter((id) => this.characters[id] && id !== "he-xiuying-old");
  }

  situationText(fallback = "") {
    const scene = this.scene();
    return this.interpolate(scene?.situation || fallback || scene?.title || "");
  }

  /** 自由对话时的信任值上限：每一幕最多累计 ±10，避免刷分 */
  capFreeTrust(delta) {
    if (!delta) return 0;
    if (!this.state.freeTrust) this.state.freeTrust = {};
    const key = this.state.sceneId;
    const used = this.state.freeTrust[key] || 0;
    const next = Math.max(-10, Math.min(10, used + delta));
    this.state.freeTrust[key] = next;
    return next - used;
  }

  /** 主动开口：玩家对着某个角色说一句话 */
  async freeTalk(npcId, text) {
    const display = this.characters[npcId]?.display || npcId;
    this.remember(npcId, "player", text);
    this.state.answers.push(text);
    this.state.turns++;

    let out = null;
    if (this.ai.online) {
      try {
        const previous = this.memoryOf(npcId).slice(0, -1);
        out = await this.ai.reply({
          npc: npcId,
          mode: "free",
          situation: this.situationText("队伍正在草地上往外走。"),
          trust: this.state.trust,
          address: this.address(),
          playerText: text,
          memories: previous.filter((m) => m.role === "player").slice(-6).map((m) => m.text),
          history: previous.slice(-10),
        });
      } catch (err) {
        this.lastAiError = String(err.message || err);
      }
    }
    if (!out) {
      const pool = this.characters[npcId]?.freeFallback || ["……"];
      const last = (this.state.lastFallback || {})[npcId];
      const fresh = pool.filter((t) => t !== last);
      const use = fresh.length ? fresh : pool;
      const pick = use[Math.floor(Math.random() * use.length)];
      this.state.lastFallback = { ...(this.state.lastFallback || {}), [npcId]: pick };
      out = { text: pick, trust: 0, mood: "" };
    }

    this.remember(npcId, "npc", out.text, out.mood);
    this.setPortrait(npcId, out.mood);
    const delta = this.capFreeTrust(out.trust);
    if (delta) this.addTrust(delta, `${display}的反应`);
    this.autosave();
    return { ...out, trust: delta, display, mood: out.mood || "" };
  }

  startNew() {
    this.epoch++;
    this.abortWaits();
    this.state = this.newState();
    this.enterScene(this.state.sceneId, true);
    return this.run();
  }

  resume(saved) {
    this.epoch++;
    this.abortWaits();
    this.state = { ...this.newState(), ...saved };
    if (!this.scenes[this.state.sceneId]) {   // 旧存档指向已经不存在的场景
      this.on.toast?.("这段路的地图变了，从序幕重新开始。");
      this.state.sceneId = this.manifest.start;
      this.state.step = 0;
    }
    this.enterScene(this.state.sceneId, true);
    return this.run();
  }

  /**
   * 从某一句重新走：把进度指回那里，并把信任值回退到"那一步之前"的状态。
   * 这一步自己的增量会在重走时重新加回来，所以不会重复累加。
   * 同一幕里往回退时，背景与环境音也会退回到当时的样子。
   */
  rewindTo(sceneId, step) {
    const scene = this.scenes[sceneId];
    if (!scene || !scene.steps[step]) return false;

    const log = this.state.log || [];
    let idx = -1;
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].scene === sceneId && log[i].step === step) { idx = i; break; }
    }
    if (idx < 0) return false;

    // 1) 信任值：把这一步及之后加过的分扣掉
    const order = Object.keys(this.scenes);
    const rank = (id) => { const k = order.indexOf(id); return k < 0 ? 999 : k; };
    const tr = rank(sceneId);
    let rollback = 0;
    const keep = [];
    for (const t of this.state.trustLog || []) {
      const after = rank(t.scene) > tr || (rank(t.scene) === tr && t.step >= step);
      if (after) rollback += t.delta; else keep.push(t);
    }
    this.state.trust = Math.max(0, Math.min(100, Math.round((this.state.trust || 0) - rollback)));
    this.state.trustLog = keep;
    this.state.log = log.slice(0, idx);

    // 2) 背景与环境音退回到当时那一句的样子
    let bg = scene.bg;
    let tone = scene.tone;
    let amb = scene.ambient;
    for (let i = 0; i < step; i++) {
      const s = scene.steps[i];
      if (s.t === "bg") { bg = s.src; tone = s.tone; }
      if (s.t === "ambient") amb = s.name || "";
    }
    if (this.state.sceneId !== sceneId) this.enterScene(sceneId, false);
    if (bg || tone) this.setBg(bg, tone);
    if (amb !== undefined) this.setAmbient(amb);
    this.state.sceneId = sceneId;
    this.state.step = step;
    this.updateTrust();
    this.autosave();

    // 3) 从这里重新跑
    this.epoch++;
    this.abortWaits();
    this.on.toast?.(`回到 ${sceneId}:${step} —— 从这里接着走${rollback ? `（信任值回退 ${rollback}）` : ""}`);
    return this.run();
  }

  autosave() {
    if (!this.state) return;
    const slim = { ...this.state, history: this.state.history.slice(-40) };
    Save.write(slim);
    this.on.stateChange?.(slim);
  }

  // ---------- 进度与文本 ----------

  scene() { return this.scenes[this.state.sceneId]; }

  address(trust = this.state?.trust ?? 0) {
    return trust >= 80 ? "文书" : trust >= 50 ? "同志" : "你";
  }

  interpolate(text = "") {
    return String(text)
      .replace(/\{player\}/g, this.address())
      .replace(/\{trust\}/g, String(Math.round(this.state.trust)))
      .replace(/\{var:([A-Za-z0-9_]+)\}/g, (_, k) => this.state.vars[k] ?? "");
  }

  findLabel(scene, name) {
    return scene.steps.findIndex((s) => s.t === "label" && s.name === name);
  }

  enterScene(id, initial = false) {
    const scene = this.scenes[id];
    if (!scene) throw new Error(`找不到场景：${id}`);
    this.showHud(true);
    this.state.sceneId = id;
    if (!initial) this.state.step = 0;
    this.ui.chapterName.textContent = scene.title || id;
    this.showChapterCard(scene.title);
    this.setPortrait(null);          // 换幕时收起立绘
    this.renderVisual(null);
    if (scene.bg || scene.tone) this.setBg(scene.bg, scene.tone);
    if (scene.ambient !== undefined) this.setAmbient(scene.ambient);
    this.updateTrust();
    this.warmScene(id);   // 提前把这一幕和下一幕的图和声音下下来
  }

  /**
   * 预热：这一幕 + 下一幕要用的背景图与音频，提前下载。
   * 不预热的话，换背景会先看到渐变底、音效要等下载完才响（音画不同步）。
   */
  warmScene(sceneId) {
    const order = Object.keys(this.scenes);
    const ids = [sceneId, order[order.indexOf(sceneId) + 1]].filter(Boolean);
    for (const id of ids) {
      const scene = this.scenes[id];
      if (!scene) continue;
      const sfx = [];
      const images = [];
      if (scene.bg) images.push(scene.bg);
      for (const s of scene.steps || []) {
        if (s.t === "sfx" && s.name) sfx.push(s.name);
        if (s.t === "bg" && s.src) images.push(s.src);
        if (s.visual?.sheet) images.push(s.visual.sheet);
        for (const sub of s.after || []) if (sub.t === "sfx" && sub.name) sfx.push(sub.name);
        for (const sub of s.after || []) if (sub.visual?.sheet) images.push(sub.visual.sheet);
        for (const o of s.options || []) {
          if (o.visual?.sheet) images.push(o.visual.sheet);
          for (const sub of o.after || []) if (sub.t === "sfx" && sub.name) sfx.push(sub.name);
          for (const sub of o.after || []) if (sub.visual?.sheet) images.push(sub.visual.sheet);
        }
      }
      if (scene.ambient) this.audio.warm([scene.ambient], "ambient");
      this.audio.warm(sfx, "sfx");
      for (const src of new Set(images)) {
        const img = new Image();     // 只为把图下进缓存，不插入页面
        img.src = window.__STORYBOARDS__?.[src] || src;
      }
    }
  }

  /** 剧情进行中显示对话区与顶栏；结束时收起 */
  showHud(on) {
    this.ui.dialogue.hidden = !on;
    this.ui.topbar.hidden = !on;
    this.ui.text.textContent = "";
    this.ui.speaker.hidden = true;
    this.ui.choices.hidden = true;
    this.ui.choices.innerHTML = "";
    this.ui.hint.hidden = true;
    this.ui.visualHint.hidden = true;
  }

  setBg(src, tone) {
    const front = this._bgFront ? this.ui.bgA : this.ui.bgB;
    const back = this._bgFront ? this.ui.bgB : this.ui.bgA;
    const grad = Array.isArray(tone) && tone.length >= 2
      ? `linear-gradient(165deg, ${tone[0]}, ${tone[1]})`
      : "linear-gradient(165deg, #24302a, #0b100e)";
    front.style.backgroundImage = grad;
    if (src) {
      const img = new Image();
      img.onload = () => { front.style.backgroundImage = `url("${src}")`; };
      img.src = src; // 文件不存在时保持渐变底色
    }
    front.classList.add("on");
    // 背景缓慢推拉：每换一次背景就换一个方向，并且重新开始
    this._kb = !this._kb;
    front.classList.remove("kb-a", "kb-b");
    void front.offsetWidth;
    front.classList.add(this._kb ? "kb-a" : "kb-b");
    back.classList.remove("on");
    this._bgFront = !this._bgFront;
  }

  setAmbient(name) {
    const want = name || "";
    if (this._ambient !== want) {
      if (this._ambient) this.audio.stop(this._ambient);
      if (want) this.audio.loop(want);
      this._ambient = want;
    }
    this.ui.rain.hidden = want !== "rain";

    // 浏览器有时候会拦下自动播放。真被拦了就明确告诉玩家一句话，
    // 不要让人对着一个没声音的页面猜。
    if (want) {
      const wanted = want;
      setTimeout(() => {
        const el = this.audio.layers.get(wanted);
        if (el && el.paused && this.audio.enabled) {
          this.on.toast?.("声音被浏览器挡住了，点一下屏幕任意位置就能开");
        }
      }, 1600);
    }
  }

  updateTrust() {
    const before = this.state ? this.address() : "你";
    const t = Math.max(0, Math.min(100, Math.round(this.state.trust)));
    this.state.trust = t;
    this.ui.trustFill.style.width = `${t}%`;
    const after = this.address(t);
    this.ui.trustAddress.textContent = after;
    // 称呼变了就说一声 —— 这是全片最重要的一个反馈
    if (after !== before && this.state.startedAt) {
      this.on.toast?.(`从现在起，他们叫你「${after}」`, 4200);
    }
  }

  /** 换幕时闪一张章节卡 */
  showChapterCard(title) {
    const el = document.getElementById("chapterCard");
    if (!el || !title) return;
    document.getElementById("chapterCardText").textContent = title;
    el.hidden = false;
    el.style.animation = "none";
    void el.offsetWidth;          // 强制重排，让动画重新播
    el.style.animation = "";
    clearTimeout(this._cardTimer);
    this._cardTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  addTrust(delta, why) {
    if (!delta) return;
    this.state.trust += delta;
    (this.state.trustLog ||= []).push({ scene: this.state.sceneId, step: this.state.step, delta });
    if (this.state.trustLog.length > 400) this.state.trustLog.shift();
    this.updateTrust();
    const sign = delta > 0 ? `+${delta}` : String(delta);
    this.on.toast?.(`信任 ${sign}${why ? " · " + why : ""}`);
  }

  // ---------- 文字与交互 ----------

  type(str) {
    const el = this.ui.text;
    el.textContent = "";
    if (!str) return Promise.resolve();
    if (this.reduced) { el.textContent = str; return Promise.resolve(); }
    return new Promise((resolve) => {
      let i = 0;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearInterval(timer);
        el.textContent = str;
        document.removeEventListener("pointerdown", finish, true);
        resolve();
      };
      const timer = setInterval(() => {
        i += 2;
        el.textContent = str.slice(0, i);
        if (i >= str.length) finish();
      }, 24);
      document.addEventListener("pointerdown", finish, true);
    });
  }

  waitClick() {
    return new Promise((resolve) => {
      const startAt = performance.now();
      let done = false;
      const cleanup = () => {
        document.removeEventListener("click", onClick);
        document.removeEventListener("keydown", onKey);
        this.ui.dialogue.classList.remove("waiting");
      };
      const finish = () => {
        if (done) return;
        done = true;
        this._resolveClick = null;
        cleanup();
        resolve();
      };
      this._resolveClick = finish;   // 重开 / 读档时由 abortWaits 收掉
      const onClick = (e) => {
        if (e.target.closest?.(".screen, #topbar, .choices, .input-row")) return;
        if (performance.now() - startAt < 260) return;
        finish();
      };
      const onKey = (e) => {
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === " " || e.key === "Enter") finish();
      };
      document.addEventListener("click", onClick);
      document.addEventListener("keydown", onKey);
      this.ui.dialogue.classList.add("waiting");
    });
  }

  /** 播一句人物台词，等玩家点击后返回。 */
  async speak(step, opts = {}) {
    this.ui.dialogue.hidden = false;
    this.ui.visualHint.hidden = true;
    const isPlayer = step.who === PLAYER;
    const who = isPlayer
      ? "我"
      : step.who
        ? (this.characters[step.who]?.display || step.who)
        : "";

    this.ui.speaker.hidden = !who;
    this.ui.speaker.textContent = who;
    this.ui.text.className = isPlayer ? "text who" : "text";

    const text = step.raw ? step.text : this.interpolate(step.text);
    // 回看用：把这一句记下来（幕 + 步号 + 说话人 + 文本），按快了也能回去看
    const log = (this.state.log ||= []);
    log.push({
      scene: this.state.sceneId,
      step: this.state.step,
      who: who || "",
      kind: "s",
      text,
    });
    if (log.length > 400) log.shift();
    // 只有人物说话时才换立绘。
    if (step.who && step.who !== PLAYER) this.setPortrait(step.who, step.mood);
    if (who) {
      this.state.history.push({ role: isPlayer ? "player" : "npc", name: who, text });
      if (this.state.history.length > 60) this.state.history.shift();
      if (!isPlayer) this.remember(step.who, "npc", text, step.mood);
    }
    await this.type(text);
    if (opts.autoNext) return "next";
    this.ui.hint.hidden = false;
    await this.waitClick();
    this.ui.hint.hidden = true;
    return "next";
  }

  async choose(step) {
    this.ui.dialogue.hidden = false;
    this.ui.visualHint.hidden = true;
    const box = this.ui.choices;
    box.hidden = false;
    box.innerHTML = "";
    if (step.prompt) {
      this.ui.speaker.hidden = true;
      this.ui.text.className = "text narration";
      await this.type(this.interpolate(step.prompt));
    }

    const picked = await new Promise((resolve) => {
      step.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "choice-btn";
        btn.textContent = this.interpolate(opt.text);
        btn.addEventListener("click", () => resolve(opt));
        box.appendChild(btn);
      });
    });

    box.hidden = true;
    box.innerHTML = "";
    this.state.picks.push(picked.text);
    this.state.history.push({ role: "player", name: "我", text: picked.text });
    if (picked.visual) await this.visualBeat({ visual: picked.visual, description: picked.text });
    if (picked.set) Object.assign(this.state.vars, picked.set);
    if (picked.trust) this.addTrust(picked.trust, picked.why);
    if (picked.reply) {
      const who = picked.replyWho || step.replyWho;
      if (who) await this.speak({ t: "say", who, text: picked.reply });
    }
    if (await this.runAfter(picked)) return "moved";
    return this.applyMove(picked);
  }

  async action(step) {
    this.ui.dialogue.hidden = false;
    this.ui.visualHint.hidden = true;
    if (step.visual) await this.renderVisual(step.visual, step.label);
    const box = this.ui.choices;
    box.hidden = false;
    box.innerHTML = "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn action";
    btn.textContent = this.interpolate(step.label || "继续");
    const hit = new Promise((resolve) => btn.addEventListener("click", resolve));
    box.appendChild(btn);
    if (step.hint) {
      // 动作提示显示在台词区，不遮挡按钮
      const hint = document.createElement("div");
      hint.className = "click-hint";
      hint.textContent = step.hint;
      box.appendChild(hint);
    }
    await hit;
    box.hidden = true;
    box.innerHTML = "";
    this.state.picks.push(step.label || "继续");
    if (step.trust) this.addTrust(step.trust, step.why);
    if (await this.runAfter(step)) return "moved";
    return this.applyMove(step);
  }

  /** 执行步骤里的 after 追加内容。 */
  async runAfter(step) {
    if (!Array.isArray(step.after)) return false;
    for (const sub of step.after) {
      const r = await this.play(sub);
      if (r === "moved") return true;
    }
    return false;
  }

  pickFallback(step) {
    const list = step.fallback || [];
    if (!list.length) return "……（他看了你一眼，没有接话。）";
    const items = list.map((x) => (typeof x === "string" ? { minTrust: 0, text: x } : x));
    const ok = items.filter((x) => this.state.trust >= (x.minTrust ?? 0));
    return (ok.length ? ok[ok.length - 1] : items[0]).text;
  }

  /** 预选项回答：点一句，主角说出口，NPC 回应。也可以按住语音说自己的话（走 submitSpoken）。
   *  AI 在线时交给大模型接话；离线用选项自带的 reply 台词（语音回答用步骤的 fallback）。 */
  async selectStep(step) {
    this.ui.dialogue.hidden = false;
    this.ui.visualHint.hidden = true;
    const box = this.ui.choices;
    box.hidden = false;
    box.innerHTML = "";

    const picked = await new Promise((resolve) => {
      this._resolveSelect = resolve;   // 按住语音说的话，从 submitSpoken 走这个口子进来
      step.options.forEach((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "choice-btn";
        btn.textContent = this.interpolate(opt.text);
        btn.addEventListener("click", () => { this._resolveSelect = null; resolve(opt); });
        box.appendChild(btn);
      });
    });

    box.hidden = true;
    box.innerHTML = "";
    this._resolveSelect = null;
    if (picked.aborted) return "stop";   // 中途重开：旧循环直接收场
    const spoken = !!picked.spoken;
    if (!spoken) this.state.picks.push(picked.text);
    this.state.answers.push(picked.text);
    this.state.turns++;
    this.state.vars[step.key || "answer"] = picked.text;
    if (!spoken && picked.set) Object.assign(this.state.vars, picked.set);
    this.remember(step.ai, "player", picked.text);
    if (spoken) {
      this.state.voiceAnswers = (this.state.voiceAnswers || 0) + 1;
      if (this.state.voiceAnswers === 1) {
        this.on.toast?.("这句话是你自己说出口的，他记住了", 3800);
      }
    }
    // 说出口的话以"我"的口吻播出，直接接下去，不用再点一下
    await this.speak({ t: "say", who: PLAYER, text: picked.text, raw: true }, { autoNext: true });

    // 先给出"他在想"的停顿，再取大模型回复；没连上就用选项写好的回应
    this.ui.speaker.hidden = false;
    this.ui.speaker.textContent = this.characters[step.ai]?.display || "";
    this.ui.text.className = "text thinking";
    this.ui.text.textContent = "……";

    let reply = "";
    let aiTrust = 0;
    if (this.ai.online) {
      try {
        const previous = this.memoryOf(step.ai).slice(0, -1);
        const out = await this.ai.reply({
          npc: step.ai,
          situation: this.interpolate(step.situation || "") || this.situationText(),
          trust: this.state.trust,
          address: this.address(),
          playerText: picked.text,
          memories: previous.filter((m) => m.role === "player").slice(-6).map((m) => m.text),
          history: previous.slice(-10),
        });
        reply = out.text;
        aiTrust = out.trust;
        this.lastMood = out.mood || "";
      } catch (err) {
        this.lastAiError = String(err.message || err); // 超时或报错，退回选项写好的回应
      }
    }
    if (!reply) {
      if (spoken) {
        reply = this.pickFallback(step);
        aiTrust = step.trust ?? 0;
      } else {
        reply = picked.reply || this.pickFallback(step);
        aiTrust = picked.trust ?? step.trust ?? 0;
      }
    }

    await this.speak({ t: "say", who: step.ai, text: reply, raw: true });
    if (this.lastMood) this.setPortrait(step.ai, this.lastMood);
    if (aiTrust) {
      this.addTrust(aiTrust, this.ai.online
        ? `${this.characters[step.ai]?.display || ""}的反应`
        : (spoken ? "你自己说出口的话" : (picked.why || `${this.characters[step.ai]?.display || ""}的反应`)));
    }
    if (!spoken && Array.isArray(picked.after) && picked.after.length) {
      for (const sub of picked.after) {
        const r = await this.play(sub);
        if (r === "moved") return "moved";
      }
    }
    if (await this.runAfter(step)) return "moved";
    return this.applyMove(picked);
  }

  /** 语音回答入口：剧情正停在预选项上时，把这句话当作玩家的回答；没人在等就返回 false。 */
  submitSpoken(text) {
    if (!this._resolveSelect) return false;
    this._resolveSelect({ spoken: true, text });
    this._resolveSelect = null;
    return true;
  }

  /** 重开 / 读档时收掉旧的等待，别让旧循环卡住新游戏 */
  abortWaits() {
    if (this._resolveSelect) {
      this._resolveSelect({ aborted: true, text: "" });
      this._resolveSelect = null;
    }
    this._resolveClick?.();
    this._resolveClick = null;
  }

  applyMove(step) {
    if (step.goto) {
      this.moveTo(step.goto);
      return "moved";
    }
    return "next";
  }

  moveTo(target) {
    const [sceneId, label] = String(target).split(":");
    if (sceneId !== this.state.sceneId) {
      if (label) {
        this.state.sceneId = sceneId;
        const idx = this.findLabel(this.scenes[sceneId], label);
        this.state.step = idx >= 0 ? idx + 1 : 0;
        this.enterScene(sceneId);
      } else {
        this.state.step = 0;
        this.enterScene(sceneId);
      }
    } else {
      const idx = this.findLabel(this.scenes[sceneId], label);
      this.state.step = idx >= 0 ? idx + 1 : 0;
    }
  }

  check(cond) {
    if (!cond) return true;
    const v = String(cond.var || "trust").startsWith("var.")
      ? this.state.vars[String(cond.var).slice(4)]
      : this.state.trust;
    const n = Number(v) || 0;
    const val = Number(cond.value ?? 0);
    switch (cond.op || ">=") {
      case ">=": return n >= val;
      case ">": return n > val;
      case "<=": return n <= val;
      case "<": return n < val;
      case "==": return n === val;
      case "!=": return n !== val;
      default: return false;
    }
  }

  // ---------- 主循环 ----------

  async play(step) {
    switch (step.t) {
      case "visual": {
        const done = await this.visualBeat(step);
        if (step.after && await this.runAfter(step)) return "moved";
        return done;
      }
      case "say": {
        const done = await this.speak(step);
        // 台词也可以挂 after：等玩家点过这一句，再补一个音效（不新增步骤，步号不会错位）
        if (step.after && await this.runAfter(step)) return "moved";
        return done;
      }
      case "choose":
        return this.choose(step);
      case "action":
        return this.action(step);
      case "select":
        return this.selectStep(step);
      case "label":
        return "next";
      case "trust":
        this.addTrust(step.delta || 0, step.why);
        return "next";
      case "var":
        Object.assign(this.state.vars, step.set || {});
        return "next";
      case "bg":
        this.setBg(step.src, step.tone);
        return "next";
      case "ambient":
        this.setAmbient(step.name);
        return "next";
      case "sfx":
        this.audio.once(step.name);
        return "next";
      case "lore": {
        if (!this.state.lore.includes(step.card)) {
          this.state.lore.push(step.card);
          const card = this.lore[step.card];
          this.on.toast?.(`史料卡解锁 · ${card ? card.title : step.card}`);
        }
        return "next";
      }
      case "if":
        if (this.check(step.cond)) return this.applyMove({ goto: step.goto });
        return "next";
      case "jump": {
        const idx = this.findLabel(this.scene(), step.label);
        if (idx >= 0) this.state.step = idx;
        return "next";
      }
      case "goto":
        return this.applyMove({ goto: step.scene });
      case "end":
        this.finish(step);
        return "stop";
      default:
        console.warn("[engine] 未知步骤类型：", step.t, step);
        return "next";
    }
  }

  async run() {
    if (this.running) { this._wantRun = true; return; }
    this.running = true;
    const epoch = this.epoch;
    let guard = 0;
    try {
      while (epoch === this.epoch) {
        if (++guard > 8000) break;
        const scene = this.scene();
        if (!scene) break;
        const step = scene.steps[this.state.step];
        if (!step) { this.finish({}); break; }
        const result = await this.play(step);
        if (result === "stop") break;
        if (result === "next") this.state.step++;
        this.autosave();
      }
    } catch (err) {
      console.error(err);
      this.on.toast?.(`剧情出错：${err.message}`);
    } finally {
      this.running = false;
      if (this._wantRun) {              // 中途重开：旧循环收场后，把新游戏跑起来
        this._wantRun = false;
        this.run();
      }
    }
  }

  finish(step) {
    const report = this.buildReport(step);
    this.on.report?.(report);
  }

  buildReport(step = {}) {
    const unlocked = this.state.lore.length;
    const total = Object.keys(this.lore).length;
    const chars = [...new Set(this.state.history.filter((h) => h.role === "npc").map((h) => h.name))];
    return {
      title: step.title || "走出来了",
      closing: step.text || "他让我记住。我记了一辈子。",
      trust: Math.round(this.state.trust),
      address: this.address(),
      choices: this.state.picks.length,
      words: this.state.answers.join("").length,
      turns: this.state.turns,
      lore: unlocked,
      loreTotal: total,
      met: chars.filter((n) => n !== "我"),
      minutes: Math.max(1, Math.round((Date.now() - this.state.startedAt) / 60000)),
      picks: (this.state.picks || []).slice(-8),
      said: (this.state.answers || []).slice(-5),
    };
  }
}
