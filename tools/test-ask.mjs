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
  focus() {}
  blur() {}
}
let elements;
globalThis.MutationObserver = class { observe() {} };

function setup() {
  elements = new Map([".dialogue-inner", "#askWho", "#askLog", "#askForm", "#askInput", "#askSend", "#askClose"].map(id => [id, new Element()]));
  const body = new Element();
  globalThis.document = { body, getElementById: () => new Element(), createElement: () => new Element() };
  let finish;
  let saved = 0;
  const engine = {
    state: { askMemory: {} }, epoch: 1,
    characters: { a: { display: "班长", freeFallback: ["跟紧队伍。"] }, b: { display: "石头" } },
    presentNpcs: () => ["a", "b"],
    ai: { check: async () => true, ask: () => new Promise(resolve => { finish = resolve; }) },
    autosave: () => { saved++; },
  };
  initAsk(engine);
  const open = elements.get(".dialogue-inner").children[0];
  open.emit("click");
  const start = (text) => { elements.get("#askInput").value = text; elements.get("#askForm").emit("submit"); return finish; };
  return { engine, start, close: () => elements.get("#askClose").emit("click"), open: () => open.emit("click"), saved: () => saved };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

{
  const app = setup();
  app.start("我能帮什么忙？")({ text: "扶着小石头。" });
  await flush();
  assert.deepEqual(app.engine.state.askMemory.a, [{ q: "我能帮什么忙？", a: "扶着小石头。" }]);
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
  assert.deepEqual(app.engine.state.askMemory.a, [{ q: "新问题", a: "新回答" }]);
}
console.log("自由提问通过：正常保存、关闭重开、重新开始、回看跳转及过期请求隔离。");
