// 剧情引擎的「画面跟着句子走」测试：node tools/test-engine.mjs
//
// 盯的是回看那一类 bug：翻到的画面、往回跳/往后跳之后屏幕上的画面，
// 必须是同一张，而且属于这一版剧本（上一版留下的日志不能再用）。
// 用极简 DOM 替身把真实的 StoryEngine 跑起来，图用不同的 src 区分，
// 断言「最后画上去的是哪张图」。
import assert from "node:assert/strict";
import { frameOf } from "../js/sheet-geometry.js";

const STAGE = { width: 1600, height: 900 };
const drawCalls = [];
const attempts = new Map();
const failAlways = new Set();   // 永远下不来的图
const failOnce = new Set();     // 第一次失败、第二次成功

function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    contains: (c) => set.has(c),
    toggle: () => {},
  };
}

function makeEl(id) {
  const el = {
    id, hidden: false, style: {}, dataset: {}, textContent: "", innerHTML: "",
    value: "", className: "", width: 0, height: 0, offsetWidth: 0, children: [],
    classList: makeClassList(),
    addEventListener() {}, removeEventListener() {},
    appendChild(c) { el.children.push(c); return c; },
    setAttribute() {}, getAttribute: () => null,
    querySelector: () => null, querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: STAGE.width, height: STAGE.height, top: 0, left: 0 }),
    getContext: () => ({
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "low",
      drawImage(img) { drawCalls.push({ src: img.src }); },
      getImageData() { throw new Error("SecurityError"); },   // 量不了格线 → 退回均分
    }),
  };
  el.parentElement = { classList: makeClassList(), getBoundingClientRect: el.getBoundingClientRect };
  return el;
}

const elements = new Map();
globalThis.document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeEl(id));
    return elements.get(id);
  },
  createElement: (tag) => makeEl(tag),
  addEventListener() {}, removeEventListener() {},
};
globalThis.window = {
  addEventListener() {}, removeEventListener() {},
  devicePixelRatio: 1, matchMedia: () => ({ matches: false }),
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.Audio = class {
  constructor() { this.volume = 0; }
  play() { return Promise.resolve(); }
  pause() {}
  addEventListener() {}
};
globalThis.Image = class {
  constructor() { this.naturalWidth = 0; this.naturalHeight = 0; this._src = ""; }
  get src() { return this._src; }
  set src(v) {
    this._src = v;
    const n = (attempts.get(v) || 0) + 1;
    attempts.set(v, n);
    const bad = failAlways.has(v) || (failOnce.has(v) && n === 1);
    setTimeout(() => {
      if (bad) { this.onerror?.(); return; }
      this.naturalWidth = 1536;
      this.naturalHeight = 1024;
      this.onload?.();
    }, 0);
  }
  decode() { return Promise.resolve(); }
};

const { StoryEngine } = await import("../js/engine.js");

/** 等一拍，让图片 onload / 绘制这些异步动作落下来 */
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const lastDrawn = () => (drawCalls.length ? drawCalls[drawCalls.length - 1].src : null);

function makeEngine(scenes, start = "act1") {
  const e = new StoryEngine({});
  e.reduced = true;
  e.characters = { a: { display: "老班长" } };
  e.lore = { c1: { title: "史料" } };
  e.manifest = { start, scenes: Object.keys(scenes) };
  e.scenes = scenes;
  e.storyHash = e.storyHashOf(e.manifest);
  return e;
}

// 新一轮视觉制作期间，旧立绘应保持在磁盘上，但剧情不能加载或展示它们。
{
  const e = makeEngine({ act1: { id: "act1", steps: [] } });
  e.setPortrait("a");
  assert.equal(e.ui.portrait.hidden, true, "未启用的新立绘不应出现在剧情里");
  assert.equal(attempts.get("assets/char/a.png") || 0, 0, "不应请求旧立绘素材");
}

const PIC_A = { src: "assets/stills/a.png" };
const PIC_B = { src: "assets/stills/b.png" };

assert.deepEqual(
  frameOf({ src: "assets/stills/a.png", crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } }, null, 1600, 900),
  { x: 160, y: 180, w: 800, h: 540 },
  "独立画面应能切出可信的细节近景",
);

// 每个正式镜头重新开始缓慢推拉，切换方向；减少动态效果时保持静止。
{
  const e = makeEngine({ act1: { id: "act1", steps: [] } });
  e.reduced = false;
  await e.renderVisual(PIC_A);
  assert.equal(e.ui.visual.classList.contains("shot-a"), true);
  await e.renderVisual(PIC_B);
  assert.equal(e.ui.visual.classList.contains("shot-b"), true);
  e.reduced = true;
  await e.renderVisual(PIC_A);
  assert.equal(e.ui.visual.classList.contains("shot-a"), false);
  assert.equal(e.ui.visual.classList.contains("shot-b"), false);
}

// 雾只出现在湿冷草地镜头，切到夜营或今日草地就收起。
{
  const e = makeEngine({ act1: { id: "act1", steps: [] } });
  e.setBg("assets/stills/fog-morning-bg.png");
  assert.equal(e.ui.mist.hidden, false);
  e.setBg("assets/stills/camp-night-bg.png");
  assert.equal(e.ui.mist.hidden, true);
}

// 一幕：台词 → 状态步骤 → 台词 → 画面 B → 台词（落点）
const jumpyScene = () => ({
  act1: {
    id: "act1",
    title: "第一幕",
    steps: [
      { t: "say", who: "a", text: "一" },                     // 0
      { t: "trust", delta: 5 },                               // 1
      { t: "var", set: { k: 1 } },                            // 2
      { t: "lore", card: "c1" },                              // 3
      { t: "say", who: "a", text: "二" },                     // 4
      { t: "label", name: "mid" },                            // 5
      { t: "visual", description: "画面B", visual: PIC_B },   // 6
      { t: "say", who: "a", text: "三" },                     // 7
    ],
  },
});

let ok = 0;
const check = (pass, label) => {
  if (pass) ok++;
  console.log(`  ${pass ? "✓" : "✗"} ${label}`);
};

console.log("① 往后跳（跳到这一句）：画面要跟着落点走");
{
  const e = makeEngine(jumpyScene());
  e.state = e.newState();
  e._activeVisual = PIC_A;                 // 跳走前屏幕上还是 A
  e.paintVisual(new Image(), PIC_A);
  drawCalls.length = 0;
  e.jumpTo("act1", 7).catch(() => {});     // 落点是台词，会停在"等点击"上，不用等它跑完
  await settle();
  check(lastDrawn() === PIC_B.src, `落点屏幕上换成第 6 步那张（期望 b.png，实际 ${lastDrawn()}）`);
  check(e.state.trust === 5 && e.state.vars.k === 1 && e.state.lore.includes("c1"),
    "中间的快进照旧（信任 5+1、变量、史料卡都结算）");
  const entry = { scene: "act1", step: 7, kind: "say", text: "三" };
  check(e.pictureAt("act1", 7, entry)?.src === PIC_B.src,
    "回看给这一句算出的画面和跳过去看到的是同一张");
}

console.log("\n② 往回跳（从这句重新走）：画面回到当时那张");
{
  const e = makeEngine(jumpyScene());
  e.state = e.newState();
  e.state.sceneId = "act1";
  e.state.step = 7;
  e.state.log = [
    { scene: "act1", step: 4, who: "老班长", kind: "s", text: "二", visual: PIC_A, storyHash: e.storyHash },
  ];
  e._activeVisual = PIC_B;
  drawCalls.length = 0;
  e.rewindTo("act1", 4).catch(() => {});
  await settle();
  check(lastDrawn() === PIC_A.src, `回到当时配的那张（期望 a.png，实际 ${lastDrawn()}）`);
}

console.log("\n③ 上一版剧本留下的日志不认");
{
  const e = makeEngine(jumpyScene());
  e.state = e.newState();
  e.state.log = [
    { scene: "act1", step: 7, kind: "s", text: "三", visual: PIC_A, storyHash: "deadbeef" },
  ];
  check(e.pictureAt("act1", 7) === PIC_B, "别的版本记的画面被忽略，按这一版剧本重算（→ b.png）");
  e.state.log[0].storyHash = e.storyHash;
  check(e.pictureAt("act1", 7) === PIC_A, "同一版剧本记下的画面照旧用（→ a.png）");
}

console.log("\n④ 读档：剧本更新过就丢掉旧日志（进度留着）");
{
  const e = makeEngine({ act1: { id: "act1", title: "第一幕", steps: [{ t: "label" }, { t: "label" }, { t: "label" }] } });
  const saved = {
    ...e.newState(),
    sceneId: "act1",
    step: 2,
    trust: 42,
    storyHash: "old-one",
    log: [{ scene: "act1", step: 1, text: "旧的", visual: PIC_A, storyHash: "old-one" }],
    trustLog: [{ scene: "act1", step: 1, delta: 3 }],
    seen: { act1: { 0: true, 1: true, 9: true } },   // 9 是旧剧本里才有的步号
  };
  await e.resume(saved);
  check(e.state.trust === 42 && e.state.step >= 2, "进度和信任值留着");
  check(e.state.log.length === 0 && e.state.trustLog.length === 0, "旧版的日志/信任值坐标丢掉了");
  check(e.hasSeen("act1", 1) === true && e.state.seen.act1[9] === undefined,
    "「走到过哪一步」按位置重建：走过来的仍算读过、旧步号不残留");
  check(e.state.storyHash === e.storyHash, "存档指纹换成这一版剧本");
}

console.log("\n⑤ 图下不来：重试一次，真下不来就把画面收掉");
{
  const e = makeEngine(jumpyScene());
  e.state = e.newState();
  failOnce.add("assets/stills/flaky.png");
  drawCalls.length = 0;
  await e.renderVisual({ src: "assets/stills/flaky.png" });
  check(lastDrawn() === "assets/stills/flaky.png", "第一次被掐断、第二次成功，画面照常出来");

  failAlways.add("assets/stills/gone.png");
  e.state = e.newState();
  e._activeVisual = PIC_A;
  drawCalls.length = 0;
  await e.renderVisual({ src: "assets/stills/gone.png" });
  check(drawCalls.length === 0 && e._activeVisual === null && elements.get("storyVisual").hidden === true,
    "真下不来就收起画面，不把上一张留在屏幕上");
}

console.log("\n⑥ 图还在路上就开口说话：日志记的是「这一步该配哪张」");
{
  const e = makeEngine(jumpyScene());
  e.state = e.newState();
  e.state.sceneId = "act1";
  e.state.step = 4;                 // 第 4 步是台词，剧本里到这儿还没有任何画面
  e._wantedVisual = PIC_B;          // 但这一次画面 B 已经排上队了（图还在下）
  e._activeVisual = PIC_A;          // 屏幕上还停着上一格 A
  await e.speak({ t: "say", who: "a", text: "二" }, { autoNext: true });
  const logged = e.state.log[e.state.log.length - 1];
  check(logged.visual?.src === PIC_B.src,
    `入日志的是这一步该配的 B，不是屏幕上那张旧的 A（实际 ${logged.visual?.src}）`);
  check(e.pictureAt("act1", 4)?.src === PIC_B.src,
    "回看给这一句算出的也是 B：卡顿之后翻回看不会再跳到上一格");
}

console.log("\n⑦ 剧本标注的音量传给实际音效");
{
  const e = makeEngine({ act1: { id: "act1", steps: [] } });
  let played;
  e.audio.once = (...args) => { played = args; };
  await e.play({ t: "sfx", name: "heartbeat", level: 0.3 });
  check(played?.[0] === "heartbeat" && played?.[1] === 0.3,
    "一次性音效使用剧本标注的 level");
}

console.log("\n⑧ 画面和台词的音效在内容出现时播放");
for (const kind of ["visual", "say"]) {
  const e = makeEngine({ act1: { id: "act1", steps: [] } });
  const played = [];
  let release;
  e.audio.once = (...args) => played.push(args);
  e.visualBeat = e.speak = () => new Promise((resolve) => { release = resolve; });
  const pending = e.play({ t: kind, name: "cue", after: [{ t: "sfx", name: "thump", level: 0.2 }] });
  check(played.length === 1 && played[0][0] === "thump" && played[0][1] === 0.2,
    `${kind} 的音效不等点击继续才响`);
  release("next");
  await pending;
  check(played.length === 1, `${kind} 的音效不会重复播放`);
}

console.log(ok === 19 ? "\n全部通过" : `\n有断言没过（${ok}/19）`);
process.exit(ok === 19 ? 0 : 1);
