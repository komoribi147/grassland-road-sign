// 剧情引擎：读 story/ 目录下的 JSON，按步骤播放，处理选择、自由回答、信任值、史料卡。
// 剧情作者只需要写 JSON，不需要改这个文件。

import { AiClient } from "./ai.js";
import { AudioManager } from "./audio.js";
import { Save } from "./save.js";

const $ = (id) => document.getElementById(id);
const PLAYER = "__player__";

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
    this._bgFront = true;
    this.reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    this.ui = {
      bgA: $("bgA"), bgB: $("bgB"), rain: $("rain"),
      topbar: $("topbar"), chapterName: $("chapterName"),
      trustAddress: $("trustAddress"), trustFill: $("trustFill"),
      dialogue: $("dialogue"), speaker: $("speakerName"),
      text: $("dialogueText"), choices: $("choices"), hint: $("clickHint"),
    };
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
      startedAt: Date.now(),
    };
  }

  startNew() {
    this.epoch++;
    this.state = this.newState();
    this.enterScene(this.state.sceneId, true);
    return this.run();
  }

  resume(saved) {
    this.epoch++;
    this.state = { ...this.newState(), ...saved };
    this.enterScene(this.state.sceneId, true);
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
    this.state.sceneId = id;
    if (!initial) this.state.step = 0;
    this.ui.chapterName.textContent = scene.title || id;
    if (scene.bg || scene.tone) this.setBg(scene.bg, scene.tone);
    if (scene.ambient !== undefined) this.setAmbient(scene.ambient);
    this.updateTrust();
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
    back.classList.remove("on");
    this._bgFront = !this._bgFront;
  }

  setAmbient(name) {
    if (name) this.audio.loop(name);
    this.ui.rain.hidden = name !== "rain";
  }

  updateTrust() {
    const t = Math.max(0, Math.min(100, Math.round(this.state.trust)));
    this.state.trust = t;
    this.ui.trustFill.style.width = `${t}%`;
    this.ui.trustAddress.textContent = this.address(t);
  }

  addTrust(delta, why) {
    if (!delta) return;
    this.state.trust += delta;
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
      const cleanup = () => {
        document.removeEventListener("click", onClick);
        document.removeEventListener("keydown", onKey);
        this.ui.dialogue.classList.remove("waiting");
      };
      const onClick = (e) => {
        if (e.target.closest?.(".screen, #topbar, .choices, .input-row")) return;
        if (performance.now() - startAt < 260) return;
        cleanup();
        resolve();
      };
      const onKey = (e) => {
        if (e.key === " " || e.key === "Enter") { cleanup(); resolve(); }
      };
      document.addEventListener("click", onClick);
      document.addEventListener("keydown", onKey);
      this.ui.dialogue.classList.add("waiting");
    });
  }

  /** 播一句台词 / 旁白，等玩家点击后返回 */
  async speak(step) {
    const isNarration = step.t === "narrate";
    const isThought = step.t === "think";
    const isPlayer = step.who === PLAYER;
    const who = isPlayer
      ? "我"
      : step.who
        ? (this.characters[step.who]?.display || step.who)
        : "";

    this.ui.speaker.hidden = !who;
    this.ui.speaker.textContent = who;
    this.ui.text.className = isNarration ? "narration" : isThought ? "thought" : isPlayer ? "who" : "";

    const text = step.raw ? step.text : this.interpolate(step.text);
    if (who && !isNarration) {
      this.state.history.push({ role: isPlayer ? "player" : "npc", name: who, text });
      if (this.state.history.length > 60) this.state.history.shift();
    }
    await this.type(text);
    this.ui.hint.hidden = false;
    await this.waitClick();
    this.ui.hint.hidden = true;
    return "next";
  }

  async choose(step) {
    const box = this.ui.choices;
    box.hidden = false;
    box.innerHTML = "";
    if (step.prompt) {
      this.ui.speaker.hidden = true;
      this.ui.text.className = "narration";
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
    if (picked.set) Object.assign(this.state.vars, picked.set);
    if (picked.trust) this.addTrust(picked.trust, picked.why);
    if (picked.reply) {
      const who = picked.replyWho || step.replyWho;
      await this.speak(who ? { t: "say", who, text: picked.reply } : { t: "narrate", text: picked.reply });
    }
    if (await this.runAfter(picked)) return "moved";
    return this.applyMove(picked);
  }

  async action(step) {
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

  /** 执行步骤里的 after 追加内容（用于"回复之后再补一句旁白"） */
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

  async freeInput(step) {
    const box = this.ui.choices;
    box.hidden = false;
    box.innerHTML = "";

    const row = document.createElement("div");
    row.className = "input-row";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 60;
    input.placeholder = step.hint || "写下你想说的话，按回车";
    const send = document.createElement("button");
    send.type = "button";
    send.textContent = "说";
    row.append(input, send);
    box.appendChild(row);
    input.focus();

    const value = await new Promise((resolve) => {
      const submit = () => {
        const v = input.value.trim();
        if (v) resolve(v);
      };
      send.addEventListener("click", submit);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    });

    box.hidden = true;
    box.innerHTML = "";
    this.state.vars[step.key || "answer"] = value;
    this.state.answers.push(value);
    this.state.turns++;
    await this.speak({ t: "say", who: PLAYER, text: value, raw: true });

    // 先给出"他在想"的停顿，再取大模型回复
    this.ui.speaker.hidden = false;
    this.ui.speaker.textContent = this.characters[step.ai]?.display || "";
    this.ui.text.className = "thinking";
    this.ui.text.textContent = "……";

    let reply = "";
    if (this.ai.online) {
      try {
        reply = await this.ai.reply({
          npc: step.ai,
          situation: this.interpolate(step.situation || ""),
          trust: this.state.trust,
          address: this.address(),
          playerText: value,
          memories: this.state.answers.slice(-6),
          history: this.state.history.slice(-8).map((h) => ({ role: h.role, text: h.text })),
        });
      } catch { /* 超时或报错，退回剧本兜底台词 */ }
    }
    if (!reply) reply = this.pickFallback(step);

    await this.speak({ t: "say", who: step.ai, text: reply, raw: true });
    if (step.trust) this.addTrust(step.trust, step.why);
    if (await this.runAfter(step)) return "moved";
    return this.applyMove(step);
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
      case "say":
      case "narrate":
      case "think":
        return this.speak(step);
      case "choose":
        return this.choose(step);
      case "action":
        return this.action(step);
      case "input":
        return this.freeInput(step);
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
    if (this.running) return;
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
      if (epoch === this.epoch) this.running = false;
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
    };
  }
}
