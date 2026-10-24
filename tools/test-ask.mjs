// 运行真实提问面板的事件处理；仅替代 DOM 和远端模型等待。
import assert from "node:assert/strict";
import { initAsk } from "../js/ask.js";

class Element {
  constructor() { this.children = []; this.events = {}; this.hidden = false; this.value = ""; this.disabled = false; }
  set innerHTML(value) { this.html = value; this.children = []; }
  get innerHTML() { return this.html; }
  appendChild(el) { this.children.push(el); return el; }
  querySelector(id) { return elements.get(id); }
  addEventListener(type, fn) { this.events[type] = fn; }
  emit(type) { this.events[type]?.({ preventDefault() {}, stopPropagation() {} }); }
  remove() {}
  setAttribute() {}
  focus() {}
  blur() {}
}
let elements;
globalThis.MutationObserver = class { observe() {} };

function setup() {
  elements = new Map([".dialogue-inner", "#askWho", "#askLog", "#askForm", "#askInput", "#askSend", "#askClose"].map(id => [id, new Element()]));
  const body = new Element();
  globalThis.document = { body, hidden: false, getElementById: () => new Element(), createElement: () => new Element() };
  let finish;
  let saved = 0;
  const spoken = [];
  const engine = {
    state: { askMemory: {} }, epoch: 1,
    characters: { a: { display: "班长", freeFallback: ["跟紧队伍。"] }, b: { display: "石头" } },
    presentNpcs: () => ["a", "b"],
    ai: { check: async () => true, ask: () => new Promise((resolve, reject) => { finish = value => value instanceof Error ? reject(value) : resolve(value); }) },
    autosave: () => { saved++; },
    voice: { serial: 0, stop() { this.serial++; }, speak: (...args) => { spoken.push(args); return Promise.resolve(true); } },
  };
  initAsk(engine);
  const open = elements.get(".dialogue-inner").children[0];
  open.emit("click");
  const start = (text) => { elements.get("#askInput").value = text; elements.get("#askForm").emit("submit"); return finish; };
  return { engine, start, close: () => elements.get("#askClose").emit("click"), open: () => open.emit("click"), saved: () => saved, spoken };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

{
  const app = setup();
  app.start("我能帮什么忙？")({ text: "扶着小石头。" });
  await flush();
  assert.deepEqual(app.engine.state.askMemory.a, [{ q: "我能帮什么忙？", a: "扶着小石头。", mood: "平静" }]);
  assert.equal(app.saved(), 1);
  assert.equal(elements.get("#askSend").disabled, false);
}
{
  const app = setup();
  const finish = app.start("旧问题");
  app.close();
  app.engine.state = { askMemory: {} };
  app.engine.epoch++;
  app.open();
  finish({ text: "旧回答" });
  await flush();
  assert.deepEqual(app.engine.state.askMemory, {}, "上一轮等待的回答不得进入重新开始的回望");
  assert.equal(app.saved(), 0);
  assert.equal(elements.get("#askSend").disabled, false);
}
{
  const app = setup();
  const finish = app.start("旧位置的问题");
  app.engine.epoch++;
  finish({ text: "旧位置的回答" });
  await flush();
  assert.deepEqual(app.engine.state.askMemory, {}, "回看跳转后的旧回答也必须丢弃");
  assert.equal(elements.get("#askSend").disabled, false);
}
{
  const app = setup();
  const oldFinish = app.start("旧问题");
  app.close();
  app.open();
  const newFinish = app.start("新问题");
  oldFinish({ text: "旧回答" });
  await flush();
  assert.equal(elements.get("#askSend").disabled, true, "旧请求不能释放新请求的等待状态");
  newFinish({ text: "新回答" });
  await flush();
  assert.deepEqual(app.engine.state.askMemory.a, [{ q: "新问题", a: "新回答", mood: "平静" }]);
}
{
  const app = setup();
  app.start("你叫什么名字")(new Error("HTTP 503"));
  await flush();
  assert.deepEqual(app.engine.state.askMemory, {}, "断线不能保存不相关的预设台词冒充回答");
  assert.equal(elements.get("#askInput").value, "你叫什么名字", "失败保留原话供重试");
  assert.equal(app.saved(), 0);
  assert.equal(elements.get("#askSend").disabled, false);
}
{
  const app = setup();
  const finish = app.start("等我回来再说");
  document.hidden = true;
  finish({ text: "知道，先歇着。" });
  await flush();
  assert.equal(app.engine.state.askMemory.a.length, 1, "后台到达的回答保留文字");
  assert.equal(app.spoken.length, 0, "后台到达的新回答不能重新开口");
}
{
  const app = setup();
  const finish = app.start("等一等");
  app.engine.voice.stop();
  finish({ text: "不急。" });
  await flush();
  assert.equal(app.spoken.length, 0, "等待 AI 期间停止或试听别句后，不自动抢回声音");
}
console.log("自由提问通过：正常保存、关闭重开、过期请求隔离、断线重试、后台和停止期间的迟到配音。");
