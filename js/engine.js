// 剧情引擎：读 story/ 目录下的 JSON，按步骤播放，处理选择、预选项回答、信任值、史料卡。
// 剧情作者只需要写 JSON，不需要改这个文件。

import { AiClient } from "./ai.js";
import { AudioManager } from "./audio.js";
import { Save } from "./save.js";
import { frameOf, guttersFromProfiles, panelBoxes } from "./sheet-geometry.js";

const $ = (id) => document.getElementById(id);
const PLAYER = "__player__";

/** 本次打开的标记：剧情数据每次都强制取最新的一份（见 _refresh） */
const SNAPSHOT = Date.now().toString(36);

/**
 * 量一张分镜图的格线：读一遍像素，找"整条一个颜色"的线——
 * 不看它亮还是暗（实测 sheet-06/07/09/10/11 的格线是白线，其余是暗线）。
 * 分镜并不是严格均分（实测横线最多偏 38 px），按均分切会把下一格的开头带进画面。
 * 环境不支持（没有 canvas、或读到跨域图）返回 null，由调用方退回均分。
 */
function measureSheet(img) {
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  if (!width || !height) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, width, height).data;
  const rows = lineStats(px, width, height, "row");
  const cols = lineStats(px, width, height, "col");
  return panelBoxes(
    guttersFromProfiles(rows.mean, rows.spread, cols.mean, cols.spread, width, height),
    width,
    height,
  );
}

/**
 * 每条线的平均亮度与稳健极差（p92-p8）。
 * 稳健极差用来判断"这条线是不是整条一个颜色"——格线是，画面内容不是；
 * 交叉点只占极少数像素，用百分位就能把它甩掉，换成最大最小差就会被它带偏。
 * 沿线的采样点数最多 160 个，够了。
 */
function lineStats(px, width, height, axis) {
  const count = axis === "row" ? height : width;
  const along = axis === "row" ? width : height;
  const step = Math.max(1, Math.floor(along / 160));
  const mean = new Float64Array(count);
  const spread = new Float64Array(count);
  const buf = new Float64Array(Math.ceil(along / step));
  for (let i = 0; i < count; i++) {
    let n = 0;
    let sum = 0;
    for (let j = 0; j < along; j += step) {
      const x = axis === "row" ? j : i;
      const y = axis === "row" ? i : j;
      const p = (y * width + x) * 4;
      const v = px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114;
      buf[n++] = v;
      sum += v;
    }
    const view = buf.subarray(0, n);
    view.sort();
    mean[i] = sum / n;
    spread[i] = view[Math.min(n - 1, Math.floor(n * 0.92))] - view[Math.floor(n * 0.08)];
  }
  return { mean, spread };
}

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
    this.portraitsEnabled = false;       // 新立绘尚在暂存审核，剧情暂不请求旧立绘

    this.ui = {
      bgA: $("bgA"), bgB: $("bgB"), rain: $("rain"), mist: $("mist"),
      topbar: $("topbar"), chapterName: $("chapterName"),
      trustAddress: $("trustAddress"), trustFill: $("trustFill"),
      dialogue: $("dialogue"), speaker: $("speakerName"),
      text: $("dialogueText"), choices: $("choices"), hint: $("clickHint"),
      portrait: $("portrait"),
      visual: $("storyVisual"), visualHint: $("visualHint"),
    };
    this._portraitToken = 0;
    this._visualToken = 0;
    this._bgToken = 0;
    this._imageCache = new Map();
    this._imageDeadlines = new Map();  // 下载中的宽限期:预热用短超时开始,播出时放宽
    this._sheetBoxes = new Map();   // 分镜图 -> 量好的每格取景框（一轮游戏只量一次）
    this._activeVisual = null;
    this._activeImage = null;
    // "这一步该配哪张画面"——图还没到、甚至到不了的时候也记着，台词和回看都靠它
    this._wantedVisual = null;
    window.addEventListener("resize", () => {
      if (this._activeVisual && this._activeImage) this.paintVisual(this._activeImage, this._activeVisual);
    });
  }

  /** 下载并解码一次；分镜、背景和立绘切换时复用同一张已就绪的图。
   *  网络挂起（既不成也不报错，移动网络常见）时按超时当失败，别让剧情无限等下去。
   *  超时可调：后台预取用短超时好尽快重试，轮到播出时用默认的 25 秒；
   *  请求被掐断（卡顿时浏览器会这么干）则重试一次。 */
  loadImage(src, timeoutMs = 25000, attempt = 0) {
    // 预热用 12s 短超时先下；轮到真播出时把期限放宽——慢网下图还没下完，
    // 短超时会先把共享的这条 promise 烧断，播出拿到的就是一条已经失败的 promise
    //（「第一幕后没有画面」的根因）。只延长、不缩短。
    const live = this._imageDeadlines.get(src);
    if (live && live.deadline - performance.now() < timeoutMs) {
      clearTimeout(live.timer);
      live.deadline = performance.now() + timeoutMs;
      live.timer = setTimeout(live.fail, timeoutMs);
    }
    if (this._imageCache.has(src)) return this._imageCache.get(src);
    const loaded = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      const fail = () => {
        this._imageCache.delete(src);
        this._imageDeadlines.delete(src);
        reject(new Error(`图片加载超时：${src}`));
      };
      const dead = { deadline: performance.now() + timeoutMs, timer: setTimeout(fail, timeoutMs), fail };
      this._imageDeadlines.set(src, dead);
      img.onload = async () => {
        clearTimeout(dead.timer);
        this._imageDeadlines.delete(src);
        try { await img.decode?.(); } catch { /* onload 已确认图片可用 */ }
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(dead.timer);
        this._imageDeadlines.delete(src);
        this._imageCache.delete(src);
        // 卡顿的时候浏览器会把还在排队的请求掐掉，这种失败重试一次就好了
        if (attempt < 1) {
          setTimeout(() => { this.loadImage(src, timeoutMs, attempt + 1).then(resolve, reject); }, 400);
          return;
        }
        reject(new Error(`图片加载失败：${src}`));
      };
      img.src = window.__STORYBOARDS__?.[src] || window.__PORTRAITS__?.[src] || src;
    });
    this._imageCache.set(src, loaded);
    return loaded;
  }

  /** 显示某个角色的统一立绘。没有这张图就自动不显示。 */
  setPortrait(npcId) {
    const el = this.ui.portrait;
    if (!el) return;
    const token = ++this._portraitToken;
    if (!this.portraitsEnabled || !npcId || npcId === PLAYER || !this.characters?.[npcId]) {
      el.hidden = true;
      return;
    }
    const withExt = (base) => [`${base}.png`, `${base}.webp`];
    const list = withExt(`assets/char/${npcId}`);

    const tryNext = async (i) => {
      if (token !== this._portraitToken) return;
      if (i >= list.length) { el.hidden = true; return; }
      try {
        const img = await this.loadImage(list[i]);
        if (token !== this._portraitToken) return;
        // 立绘本身也先解码，避免 src 已赋值而屏幕仍留一帧空白。
        const url = img.src;
        if (el.src !== url) el.src = url;
        el.hidden = false;
        // 每个人呼吸的节奏不一样，画面才不像一个模子
        const seed = [...npcId].reduce((n, c) => n + c.charCodeAt(0), 0);
        el.style.animationDuration = `0.5s, ${(3.6 + (seed % 17) / 10).toFixed(2)}s`;
      } catch { tryNext(i + 1); }
    };
    tryNext(0);
  }

  /** 这一格的取景框：整张分镜图只量一次，之后反复用 */
  _boxesFor(img, visual) {
    if (!visual || visual.src) return null;
    const key = visual.sheet;
    if (this._sheetBoxes.has(key)) return this._sheetBoxes.get(key);
    let boxes = null;
    try {
      boxes = measureSheet(img);
    } catch { /* 读不了像素（比如跨域）就退回均分 */ }
    if (!boxes) boxes = panelBoxes(null, img.naturalWidth, img.naturalHeight);
    this._sheetBoxes.set(key, boxes);
    return boxes;
  }

  /** 把一格画面铺满目标 canvas：等比放大到铺满，超出的居中裁掉 */
  _drawVisual(canvas, img, visual) {
    if (!canvas) return false;
    // canvas 自己有 hidden 时量出来是 0，所以量它的容器
    const rect = (canvas.parentElement || canvas).getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    const frame = frameOf(visual, this._boxesFor(img, visual), img.naturalWidth, img.naturalHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const cover = Math.max(width / frame.w, height / frame.h);
    const cropWidth = Math.min(frame.w, width / cover);
    const cropHeight = Math.min(frame.h, height / cover);
    ctx.drawImage(img, frame.x + (frame.w - cropWidth) / 2, frame.y + (frame.h - cropHeight) / 2,
      cropWidth, cropHeight, 0, 0, width, height);
    return true;
  }

  /** 舞台上的画面 */
  paintVisual(img, visual) {
    const canvas = this.ui.visual;
    if (!canvas) return;
    if (!this._drawVisual(canvas, img, visual)) return;
    canvas.classList.remove("shot-a", "shot-b");
    if (!this.reduced) {
      this._shotFlip = !this._shotFlip;
      void canvas.offsetWidth;
      canvas.classList.add(this._shotFlip ? "shot-a" : "shot-b");
    }
    canvas.hidden = false;
    canvas.parentElement.classList.add("showing-visual");
  }

  /**
   * 回看里的小预览：跟舞台用同一套取景，所见即当时那张。
   * stillWanted 用来判断"玩家是不是已经翻到别的句子了"——图下得慢的时候，
   * 先发起的那次不能把后一次盖回去，否则又会文字和画面对不上。
   */
  async paintPreview(canvas, visual, stillWanted) {
    const source = visual && (visual.src || visual.sheet);
    if (!canvas || !source) return false;
    const img = await this.loadImage(source);
    if (stillWanted && !stillWanted()) return false;
    return this._drawVisual(canvas, img, visual);
  }

  async renderVisual(visual, description = "") {
    const canvas = this.ui.visual;
    const token = ++this._visualToken;
    const source = visual?.src || visual?.sheet;
    // 先记下"这一步该配哪张"，再等图：慢网/卡顿时图会晚一大截才到，
    // 台词和回看得拿到正确的那张，不能等画上去才算数（_activeVisual 是画上去之后才有值）。
    this._wantedVisual = source ? visual : null;
    if (!source) {
      this._activeVisual = null;
      this._activeImage = null;
      canvas.hidden = true;
      canvas.classList.remove("shot-a", "shot-b");
      canvas.parentElement.classList.remove("showing-visual");
      return;
    }
    canvas.setAttribute("aria-label", `我看见：${(description || "草地上的景象").replaceAll("你", "我")}`);
    // 图没下好之前，这一格的故事内容先用描述文字撑着；点击照常推进，不等图
    this.ui.visualHint.textContent = description ? `${description}（画面加载中…）` : "画面加载中…";
    try {
      const img = await this.loadImage(source);
      if (token !== this._visualToken) return;   // 已经翻到别的画面去了，晚到的图别画上来
      this._activeVisual = visual;
      this._activeImage = img;
      this.paintVisual(img, visual);
      this.ui.visualHint.textContent = "点击画面继续";
    } catch {
      if (token !== this._visualToken) return;
      // 图确实下不来（重试也没成）：把上一张收掉。留着它会变成"画面比内容慢一步"，
      // 玩家看到的是上一格，回看也会跟着对不上。
      this._activeVisual = null;
      this._activeImage = null;
      canvas.hidden = true;
      canvas.classList.remove("shot-a", "shot-b");
      canvas.parentElement.classList.remove("showing-visual");
      this.on.toast?.("画面暂时无法加载");
      this.ui.visualHint.textContent = description ? `${description}（点击继续）` : "点击继续";
    }
  }

  async visualBeat(step) {
    this.ui.dialogue.hidden = true;
    this.ui.visualHint.hidden = false;
    this.setPortrait(null);
    // 不 await：画面在后台下载，下好就淡入；点击随时能推进，慢网不再卡住剧情
    this.renderVisual(step.visual, step.description);
    await this.waitClick();
    // 这里不给 _visualToken 加一：图晚到也要画上来——后面几句台词都配这张画面，
    // 丢掉它屏幕就停在上一格，回看和屏幕还会各说各话。真翻到别的画面时，
    // 那一次 renderVisual 自己会把这次顶掉（token 已经管住了先后）。
    this.ui.visualHint.hidden = true;
    this.ui.visualHint.textContent = "点击画面继续";
    return "next";
  }

  /**
   * 某一步在屏幕上该配哪张画面。回看的预览和"往回跳/往后跳"两个方向都走它，
   * 三处才不会各说各话：
   *   1) 这一步自己带画面（画面/动作步骤、选项）就用它；
   *   2) 读过的这一步：用日志里当时记下的那张（选项、after 里换过的画面都算数）；
   *   3) 没读过的（往后跳）：按剧本往前找最近一处画面——真演到那一刻也是这张。
   */
  pictureAt(sceneId, step, entry = null) {
    if (entry?.visual) return entry.visual;
    const def = this.scenes?.[sceneId]?.steps?.[step];
    if (def?.visual && (def.t === "visual" || def.t === "action")) return def.visual;
    const logged = (this.state?.log || []).findLast((l) => l.scene === sceneId
      && l.step === step && l.visual && this.sameStory(l));
    if (logged) return logged.visual;
    const steps = this.scenes?.[sceneId]?.steps || [];
    for (let i = Math.min(Number(step) || 0, steps.length - 1); i >= 0; i--) {
      const v = steps[i]?.visual;
      if (v && steps[i].t !== "say") return v;   // 台词自己不带画面
    }
    return null;
  }

  /**
   * 这条日志是不是这一版剧本记下的。
   * 日志按「幕:步号」记画面，剧本一改（删掉或插入一步）步号就整体挪位，
   * 上一版留下的日志套到新剧本上就会让回看显示"上一个版本"的图。
   */
  sameStory(entry) {
    return !!this.storyHash && entry?.storyHash === this.storyHash;
  }

  // ---------- 读取数据 ----------
  // 剧情数据总共只有约 42KB，第一次下载成功后整包缓存进 localStorage。
  // 之后打开（断网、github.io 被限速都行）立刻就能玩，剧情推进不再依赖网络；
  // 后台会再静默刷新一次，编剧更新剧情后玩家最多晚一次打开就能拿到。

  static DATA_KEY = "gsr.data.v1";

  /** 剧情数据是否已经可用（拿来挡“点了开始却没反应”的情况） */
  get ready() {
    return !!(this.manifest && Object.keys(this.scenes).length);
  }

  async load() {
    const cached = this._readCache();
    if (cached) {
      this._applyData(cached);
      this._warmAll();
      this._refresh(false);   // 后台静默更新，失败不打扰正在玩的人
      return;
    }
    await this._refresh(true);  // 第一次打开必须联网，失败往上抛给 boot 弹重试页
  }

  _readCache() {
    try {
      const data = JSON.parse(localStorage.getItem(StoryEngine.DATA_KEY));
      if (!data?.manifest?.scenes?.length || !data.characters || !data.scenes?.length) return null;
      return data;
    } catch { return null; }
  }

  /** 下载全部剧情数据并应用；每个请求失败自动重试一次。required 为真时重试仍失败就抛错。 */
  async _refresh(required) {
    const j = async (path) => {
      let last;
      for (let i = 0; i < 2; i++) {
        try {
          // 每次打开都带一个本次会话的随机戳：绕开浏览器缓存与 CDN 缓存。
          // 不带的话，刚部署完还可能拿到上一版的剧本——回看里就会出现"上一个版本"
          // 的句子和画面。剧情数据一共 42KB，重新下一次的代价可以忽略。
          const res = await fetch(`${path}?t=${SNAPSHOT}`, { cache: "no-store" });
          if (!res.ok) throw new Error(`读取 ${path} 失败（HTTP ${res.status}）`);
          return await res.json();
        } catch (err) {
          last = err;
          await new Promise((r) => setTimeout(r, 600));
        }
      }
      throw last;
    };
    try {
      const manifest = await j("story/manifest.json");
      const [characters, lore, sceneList] = await Promise.all([
        j("story/characters.json"),
        j("story/lore.json"),
        Promise.all(manifest.scenes.map(j)),
      ]);
      const data = { manifest, characters, lore, scenes: sceneList };
      // 玩家正玩着的时候不换剧本：步号会整体挪位，正走在的那一步会变成别的句子。
      // 这版新数据先存进缓存，下次打开就是新的。
      const swapping = !!this.state && this.storyHash
        && this.storyHashOf(manifest, sceneList) !== this.storyHash;
      if (!swapping) this._applyData(data);
      try { localStorage.setItem(StoryEngine.DATA_KEY, JSON.stringify(data)); } catch { /* 隐私模式写不进去就算了 */ }
      if (!swapping) this._warmAll();
    } catch (err) {
      if (required) throw err;   // 没有缓存可用，交给 boot 弹重试页
      // 有缓存：静默失败，继续用缓存数据玩
    }
  }

  /** 数据就位（新下到的或缓存里的都一样）后，顺手记下它是哪一版剧本 */
  _applyData(data) {
    this.manifest = data.manifest;
    this.characters = data.characters;
    this.lore = data.lore;
    this.scenes = {};
    for (const scene of data.scenes) this.scenes[scene.id] = scene;
    this.storyHash = this.storyHashOf(data.manifest, data.scenes);
  }

  /** 数据就位后预热立绘和首幕的图与声音（沿用团队的渐进预热体系） */
  _warmAll() {
    this.warmScene(this.manifest.start);
  }

  /** 剧本内容的短指纹：存档里的日志只认同一版剧本记下的 */
  storyHashOf(manifest, scenes = this.scenes) {
    const text = JSON.stringify([manifest?.scenes || [], scenes]);
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
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
      seen: {},       // 回看用：走到过哪些步骤（没走到的在回看里是灰的）
      memory: {},     // 每个 NPC 一份独立的对话记忆
      freeTrust: {},  // 自由对话带来的信任值，按幕封顶，防止刷分
      startedAt: Date.now(),
      storyHash: this.storyHash,   // 这一档是拿哪一版剧本记的
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
    this.setPortrait(npcId);
    const delta = this.capFreeTrust(out.trust);
    if (delta) this.addTrust(delta, `${display}的反应`);
    this.autosave();
    return { ...out, trust: delta, display, mood: out.mood || "" };
  }

  startNew() {
    if (!this.ready) { this.on.toast?.("剧情数据还没准备好，请稍等重试"); return; }
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
    // 剧本改过了（步号会整体挪位）：上一版留下的日志、信任值坐标都不能再用，
    // 否则回看会把新剧本的句子配上旧剧本的画面。进度本身留着。
    if (saved.storyHash !== this.storyHash) {
      this.state.log = [];
      this.state.trustLog = [];
      this.rebuildSeen();              // "走到过哪一步"按位置重建，读过的部分不会整片变灰
      this.state.storyHash = this.storyHash;
      this.on.toast?.("剧本更新过了，回看按新版重新记一遍");
    }
    this.enterScene(this.state.sceneId, true);
    return this.run();
  }

  /**
   * 剧本改过之后，细到每一步的"看没看过"已经不可信（步号挪位了），
   * 但"当前位置之前的都走过"这层意思还成立——按它重建，回看里读过的部分不会整片变灰。
   */
  rebuildSeen() {
    const order = Object.keys(this.scenes);
    const upto = order.indexOf(this.state.sceneId);
    const seen = {};
    order.slice(0, upto + 1).forEach((id, i) => {
      const steps = this.scenes[id].steps || [];
      const last = i < upto ? steps.length - 1 : Number(this.state.step) || 0;
      seen[id] = {};
      for (let k = 0; k <= last; k++) seen[id][String(k)] = true;
    });
    this.state.seen = seen;
  }

  /**
   * 从某一句重新走：把进度指回那里，并把信任值回退到"那一步之前"的状态。
   * 这一步自己的增量会在重走时重新加回来，所以不会重复累加。
   * 同一幕里往回退时，画面、背景与环境音也会退回到当时的样子。
   */
  async rewindTo(sceneId, step) {
    const scene = this.scenes[sceneId];
    if (!scene || !scene.steps[step]) return false;

    const log = this.state.log || [];
    // 目标可以是任何一步（画面、选择点都行），不要求它是记过日志的台词；
    // 那一句的画面、以及日志要砍到哪里，都按"谁在前面"来算。
    const targetRank = this.rank(sceneId, step);
    const target = log.findLast((e) => e.scene === sceneId && e.step === step) || null;

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
    this.state.log = log.filter((e) => this.rank(e.scene, e.step) < targetRank);

    // 2) 背景与环境音退回到当时那一句的样子
    let bg = scene.bg;
    let tone = scene.tone;
    let amb = scene.ambient;
    let ambLevel = scene.ambientLevel;
    for (let i = 0; i < step; i++) {
      const s = scene.steps[i];
      if (s.t === "bg") { bg = s.src; tone = s.tone; }
      if (s.t === "ambient") { amb = s.name || ""; ambLevel = s.level; }
    }
    if (this.state.sceneId !== sceneId) this.enterScene(sceneId, false);
    if (bg || tone) this.setBg(bg, tone);
    if (amb !== undefined) this.setAmbient(amb, ambLevel);
    this.state.sceneId = sceneId;
    this.state.step = step;
    this.updateTrust();
    this.autosave();

    // 3) 先收掉旧循环，再把画面退回当时那张，最后才跑新的。
    //    不补这一步的话，"从这句重新走"之后画面还停在跳走前那一张，台词和画面对不上。
    this.epoch++;
    this.abortWaits();
    await this.renderVisual(this.pictureAt(sceneId, step, target), target?.text || "");
    this.on.toast?.(`回到 ${sceneId}:${step} —— 从这里接着走${rollback ? `（信任值回退 ${rollback}）` : ""}`);
    return this.run();
  }

  /**
   * 跳到剧本里的某一步：往回跳 = 从这句重新走（会回退信任值）；
   * 往后跳 = 快进（见 fastForwardTo）。回看面板两个方向都用这个口子。
   */
  async jumpTo(sceneId, step) {
    if (!this.scenes[sceneId]?.steps?.[step]) return false;
    if (this.rank(sceneId, step) < this.rank(this.state.sceneId, this.state.step)) {
      return this.rewindTo(sceneId, step);
    }
    return this.fastForwardTo(sceneId, step);
  }

  /** 把 "场景:标签" / "场景" 解析成（第几幕, 第几步） */
  _resolveMove(target) {
    const ids = Object.keys(this.scenes);
    const [sceneId, label] = String(target || "").split(":");
    const index = ids.indexOf(sceneId);
    if (index < 0) return null;
    if (label) {
      const at = this.findLabel(this.scenes[sceneId], label);
      return { index, step: at >= 0 ? at + 1 : 0 };
    }
    return { index, step: 0 };
  }

  /**
   * 往后跳到某一步：中间那些步骤"快进"过去——只结算它们的状态影响
   * （信任值、变量、史料卡、换幕/环境音），不显示画面、不等点击、也不替玩家做选择。
   * 这样往后跳不会把状态跳乱，跳过的地方在回看里仍然是灰的（确实没看过）。
   */
  async fastForwardTo(sceneId, step) {
    const ids = Object.keys(this.scenes);
    const target = this.rank(sceneId, step);
    let index = ids.indexOf(this.state.sceneId);
    if (index < 0) return false;
    let at = this.state.step + 1;      // 当前这一步已经演过了，从下一步开始算
    let bg;
    let tone;
    let amb;
    let ambLevel;
    let guard = 0;

    while (guard++ < 6000) {
      const id = ids[index];
      if (!id) break;
      if (id === sceneId && at >= step) break;
      const scene = this.scenes[id];
      const s = (scene.steps || [])[at];
      if (!s) {                        // 这一幕走完了，进下一幕
        if (id === sceneId) break;      // 目标就在这一幕，只是没走到那儿
        index += 1;
        at = 0;
        continue;
      }
      switch (s.t) {
        case "trust": this.addTrust(s.delta || 0, s.why); break;
        case "var": Object.assign(this.state.vars, s.set || {}); break;
        case "lore":
          if (!this.state.lore.includes(s.card)) this.state.lore.push(s.card);
          break;
        case "bg": bg = s.src; tone = s.tone; break;
        case "ambient": amb = s.name; ambLevel = s.level; break;
        case "goto": {
          const to = this._resolveMove(s.scene);
          if (to) { index = to.index; at = to.step; continue; }
          break;
        }
        case "jump": {
          const to = this.findLabel(scene, s.label);
          if (to >= 0) { at = to; continue; }
          break;
        }
        case "if":
          if (this.check(s.cond)) {
            const to = this._resolveMove(s.goto);
            if (to) { index = to.index; at = to.step; continue; }
          }
          break;
        default:
          break;                       // 台词/画面/选项：快进不演
      }
      at += 1;
    }

    if (this.state.sceneId !== sceneId) this.enterScene(sceneId, false);
    if (bg || tone) this.setBg(bg, tone);
    if (amb !== undefined) this.setAmbient(amb, ambLevel);
    this.state.sceneId = sceneId;
    this.state.step = step;
    this.updateTrust();
    this.autosave();
    this.epoch++;
    this.abortWaits();
    // 往后的落点也要补上画面：快进不演中间的步骤，画面会一直停在跳走前那张，
    // 落点若是台词，就成了"台词是新的、画面还是旧的"。落点自带画面时它会自己重演。
    await this.renderVisual(this.pictureAt(sceneId, step), "");
    this.on.toast?.(`已跳到 ${sceneId}:${step} —— 中间的内容按快进处理，没有替你做选择`);
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

  // ---------- 回看用：走到过哪一步 ----------

  /** 幕号 × 10000 + 步号，用来比较"谁在前面" */
  rank(sceneId, step) {
    const i = Object.keys(this.scenes).indexOf(sceneId);
    return (i < 0 ? 9999 : i) * 10000 + (Number(step) || 0);
  }

  /** 记下走到的这一步。key 用步号；选项用 "步号:o序号" */
  markSeen(key = String(this.state.step)) {
    const seen = (this.state.seen ||= {});
    (seen[this.state.sceneId] ||= {})[String(key)] = true;
  }

  hasSeen(sceneId, key) {
    const seen = this.state?.seen;
    if (seen && seen[sceneId]) return !!seen[sceneId][String(key)];
    // 老存档没有这一栏：按"走到哪算哪"推断
    return this.rank(sceneId, String(key).split(":")[0]) <= this.rank(this.state?.sceneId, this.state?.step ?? -1);
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
    if (scene.ambient !== undefined) this.setAmbient(scene.ambient, scene.ambientLevel);
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
      const sheets = [];   // 只需要分镜才量格线（背景图不分格）
      if (scene.bg) images.push(scene.bg);
      for (const s of scene.steps || []) {
        if (s.t === "sfx" && s.name) sfx.push(s.name);
        if (s.t === "bg" && s.src) images.push(s.src);
        if (s.visual?.sheet || s.visual?.src) images.push(s.visual.sheet || s.visual.src);
        if (s.visual?.sheet) sheets.push(s.visual.sheet);
        for (const sub of s.after || []) if (sub.t === "sfx" && sub.name) sfx.push(sub.name);
        for (const sub of s.after || []) if (sub.visual?.sheet || sub.visual?.src) images.push(sub.visual.sheet || sub.visual.src);
        for (const sub of s.after || []) if (sub.visual?.sheet) sheets.push(sub.visual.sheet);
        for (const o of s.options || []) {
          if (o.visual?.sheet || o.visual?.src) images.push(o.visual.sheet || o.visual.src);
          if (o.visual?.sheet) sheets.push(o.visual.sheet);
          for (const sub of o.after || []) if (sub.t === "sfx" && sub.name) sfx.push(sub.name);
          for (const sub of o.after || []) if (sub.visual?.sheet || sub.visual?.src) images.push(sub.visual.sheet || sub.visual.src);
          for (const sub of o.after || []) if (sub.visual?.sheet) sheets.push(sub.visual.sheet);
        }
      }
      if (scene.ambient) this.audio.warm([scene.ambient], "ambient");
      this.audio.warm(sfx, "sfx");
      this._prefetchImages(images);
      // 顺手把分镜的取景框量出来：量一次要读一遍像素，放在预热阶段做，
      // 真轮到这张画面时就不用现场算了
      for (const src of new Set(sheets)) this._warmGeometry(src);
    }
  }

  /**
   * 幕内图片预取：按出场顺序排队（并发 3，先出场先占带宽，不再是十几张一起抢），
   * 失败或超时自动重试。移动网络请求容易挂起，重试几次比一次失败就放弃强得多；
   * 预取用 12 秒短超时，好尽快重试，轮到播出时才用完整的 25 秒。
   */
  _prefetchImages(srcs) {
    const queue = [...new Set(srcs)];
    const worker = async () => {
      while (queue.length) {
        const src = queue.shift();
        for (let attempt = 0; attempt < 3; attempt++) {
          try { await this.loadImage(src, 12000); break; }
          catch { if (attempt < 2) await new Promise((r) => setTimeout(r, 1200 * (attempt + 1))); }
        }
      }
    };
    Promise.all(Array.from({ length: 3 }, worker)).catch(() => {});
  }

  /** 预热阶段把某张分镜的格线量好并记下来 */
  _warmGeometry(src) {
    if (this._sheetBoxes.has(src)) return;
    this.loadImage(src).then((img) => {
      if (this._sheetBoxes.has(src)) return;
      let boxes = null;
      try {
        boxes = measureSheet(img);
      } catch { /* 读不了像素就退回均分 */ }
      this._sheetBoxes.set(src, boxes || panelBoxes(null, img.naturalWidth, img.naturalHeight));
    }).catch(() => { /* 图缺失，显示时再处理 */ });
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
    this.ui.mist.hidden = !/assets\/stills\/(?:prologue-marsh-bg|fog-morning-bg|bog-transition-bg|markers|dawn-meadow-bg|last-signpost-wide-bg)\.png$/.test(src || "");
    const token = ++this._bgToken;
    const front = this._bgFront ? this.ui.bgA : this.ui.bgB;
    const back = this._bgFront ? this.ui.bgB : this.ui.bgA;
    const grad = Array.isArray(tone) && tone.length >= 2
      ? `linear-gradient(165deg, ${tone[0]}, ${tone[1]})`
      : "linear-gradient(165deg, #24302a, #0b100e)";
    front.style.backgroundImage = grad;
    if (src) {
      this.loadImage(src).then((img) => {
        if (token === this._bgToken) front.style.backgroundImage = `url("${img.src}")`;
      }).catch(() => {}); // 文件不存在时保持渐变底色
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

  /** 切环境音。level（0～1）可选：指定这一层多响，不传就用素材自己的基准（雨声 0.7） */
  setAmbient(name, level) {
    const want = name || "";
    if (this._ambient !== want) {
      if (this._ambient) this.audio.stop(this._ambient);
      this._ambient = want;
    }
    if (want) this.audio.loop(want, level);
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
      // 这一句当时配的是哪张画面：回看要能对上，重走也要能回到当时那张
      // （用"该配哪张"而不是"画上去的那张"：图还在路上时，后者是上一格）
      visual: this._wantedVisual ? { ...this._wantedVisual } : null,
      // 记下是哪一版剧本（剧本一改步号就挪位，别的版本记的日志不能再用）
      storyHash: this.storyHash,
    });
    if (log.length > 400) log.shift();
    // 只有人物说话时才换立绘。
    if (step.who && step.who !== PLAYER) this.setPortrait(step.who);
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
    this.markSeen(`${this.state.step}:o${step.options.indexOf(picked)}`);
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
    if (step.visual) this.renderVisual(step.visual, step.label);   // 不 await：动作按钮先出来，图下好再淡入
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
    if (!spoken && step.options.includes(picked)) this.markSeen(`${this.state.step}:o${step.options.indexOf(picked)}`);
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
    if (this.lastMood) this.setPortrait(step.ai);
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
        this.setAmbient(step.name, step.level);
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
        this.markSeen();
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
