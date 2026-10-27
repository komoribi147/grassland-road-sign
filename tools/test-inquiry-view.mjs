import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import * as inquiry from "../js/inquiry.js";
import { AiClient } from "../js/ai.js";

// 执行实际前端请求逻辑，外部 fetch 模拟一个尚未返回的模型。
// 回到浏览器缓存页时，不应遗留永远 disabled 的提问按钮。
const nodes = new Map(), events = {};
const node = id => {
  if (!nodes.has(id)) nodes.set(id, { disabled: false, textContent: "", replaceChildren() {}, querySelectorAll() { return []; }, focus() {}, scrollIntoView() {} });
  return nodes.get(id);
};
const context = vm.createContext({ ...inquiry, AiClient, AbortController, setTimeout, clearTimeout,
  document: { getElementById: node, querySelectorAll: () => [], querySelector: () => node("heading"), createElement: tag => node("created-" + tag) },
  localStorage: { setItem() {} },
  addEventListener(name, handler) { events[name] = handler; },
  fetch: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })),
});
let script = await readFile(new URL("../js/inquiry-view.js", import.meta.url), "utf8");
script = script.replace(/^import .*;\s*$/gm, "").replace(/\nbootInquiry\(\);\s*$/, "");
vm.runInContext(script + '\ninquiryTask={id:"signpost-evidence",sourceIds:["lubiao"]};inquiryDraft={initial:"原稿",initialBoundary:"unsure",sourceIds:["lubiao"],feedback:null};globalThis.startRequest=askInquiry;', context);
const pending = context.startRequest();
assert.equal(node("askInquiry").disabled, true);
events.pagehide();
await pending;
assert.equal(node("askInquiry").disabled, false, "返回缓存页面后必须仍能重新提问");
assert.ok(!node("requestStatus").textContent.includes("正在结合资料"), "取消的请求不能继续显示等待中");
context.actualTask = JSON.parse(await readFile(new URL("../story/inquiry.json", import.meta.url), "utf8"));
vm.runInContext('inquiryTask=actualTask;inquiryLore={};inquiryDraft=createInquiry(inquiryTask,1000);inquiryDraft.initial="从侧栏进入也要保留原稿";goInquiry(2);goInquiry(1);globalThis.afterNavigation=inquiryDraft;', context);
assert.equal(context.afterNavigation.initialCommitted, true, "从侧栏离开第一步也必须锁定原稿");
assert.equal(context.afterNavigation.baseline.text, "从侧栏进入也要保留原稿");
console.log("探究页面请求取消通过：离页取消后恢复提问按钮，不留下旧等待状态。");

vm.runInContext('inquiryDraft=createInquiry(actualTask,1000);inquiryDraft.initial="我原来认为故事中的路标是统一制度";inquiryDraft.revision="对照资料后知道红布路标是艺术设计";inquiryDraft.sourceIds=["lubiao"];inquiryDraft.stage=4;globalThis.startRevisionRequest=()=>askInquiry("revision");', context);
const revisionPending = context.startRevisionRequest();
assert.equal(node("askRevision").disabled, true, "修订反馈请求须锁住自己的按钮");
events.pagehide();
await revisionPending;
assert.equal(node("askRevision").disabled, false, "离页后修订反馈按钮必须恢复");
assert.ok(!node("revisionRequestStatus").textContent.includes("正在"));

let resolveLate;
context.fetch = (_url, options) => new Promise(resolve => { resolveLate = resolve; });
const latePending = context.startRevisionRequest();
vm.runInContext('invalidateInquiry("revision");inquiryDraft.revision="我已经又改了自己的解释";', context);
resolveLate({ ok: true, json: async () => ({ observation: "晚到的回应", evidenceNote: "晚到的依据", question: "晚到的追问", sourceIds: ["lubiao"] }) });
await latePending;
vm.runInContext('globalThis.afterLate=inquiryDraft;', context);
assert.equal(context.afterLate.revisionFeedback, null, "旧请求晚到不能写入新修订稿");
console.log("修订页面请求通过：独立等待状态、离页取消与晚到响应拒绝。");
