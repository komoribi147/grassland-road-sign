import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import * as inquiry from "../js/inquiry.js";
import { importLearningRecords, createReviewState, reviewText, reviewSummary } from "../js/classroom-review.js";
import { reviewInquiry } from "../server/inquiry-service.mjs";
import * as classroomReview from "../js/classroom-review.js";

const task = JSON.parse(await readFile(new URL("../story/inquiry.json", import.meta.url), "utf8"));
const lore = JSON.parse(await readFile(new URL("../story/lore.json", import.meta.url), "utf8"));
let draft = inquiry.createInquiry(task, 1000);
draft.initial = "剧中的红布可以给后来的人指路，所以当年应当统一使用过红布路标。";
draft = inquiry.commitInquiryInitial(draft, 1100);
Object.assign(draft, { stage: 4, sourceIds: ["lubiao"], revision: "红布路标是剧中艺术设计，现有资料不足以证明当年统一使用。", revisionBoundary: "fiction", evidenceNote: "路标卡区分探路记载与红布设计。", changeReason: "原来把故事情境直接当成了历史证据。", completedAt: 2000 });
const payload = inquiry.inquiryRequest(draft, task, "revision");
assert.equal(payload.mode, "revision", "修订阶段必须明确标注，不能再次只发初稿");
assert.equal(payload.initial, draft.initial);
assert.equal(payload.revision, draft.revision);
assert.equal(payload.evidenceNote, draft.evidenceNote);
assert.equal(payload.changeReason, draft.changeReason);

const generated = { studentQuote: "红布路标是剧中艺术设计", observation: "你在修订中区分了剧情设计与史料。", evidenceNote: "资料不足以证明统一使用，也不能据此判断从未发生。", question: "你的解释中哪些部分仍然需要进一步查证？", evidenceIds: ["signpost-design"] };
const feedback = inquiry.groundInquiryFeedback(generated, task, draft.revision, "test-model");
assert.ok(feedback);
draft.revisionFeedback = { ...feedback, snapshot: JSON.stringify(payload) };
const restored = inquiry.restoreInquiry(JSON.stringify(draft), task);
assert.equal(restored.revisionFeedback.studentQuote, generated.studentQuote);
assert.equal(inquiry.restoreInquiry(JSON.stringify({ ...draft, revision: "这是一份完全不同的修订解释。" }), task).revisionFeedback, null, "修订后的新文本不能沿用旧反馈");
assert.equal(inquiry.restoreInquiry(JSON.stringify({ ...draft, changeReason: "理由改变了。" }), task).revisionFeedback, null);
const record = inquiry.buildInquiryRecord(draft, task);
assert.equal(record.aiFeedbackReceived, false);
assert.equal(record.revisionFeedbackReceived, true);
assert.equal(record.revisionFeedback.studentQuote, generated.studentQuote);
assert.ok(inquiry.inquiryText(draft, task, lore).includes("修订稿反馈"));
const imported = importLearningRecords(createReviewState(), JSON.stringify(record), task).state;
assert.equal(imported.cases[0].observation.revisionFeedbackReview, "pending");
assert.equal(reviewSummary(imported).withAi, 1, "只使用修订稿反馈也应计为实际获得过 AI 反馈");
imported.cases[0].observation.revisionFeedbackReview = "needs-check";
imported.cases[0].observation.revisionFeedbackNote = "第二阶段单独核查备注";
const backup = importLearningRecords(createReviewState(), JSON.stringify(imported), task).state;
assert.equal(backup.cases[0].observation.feedbackReview, "pending");
assert.equal(backup.cases[0].observation.revisionFeedbackReview, "needs-check");
assert.ok(reviewText(backup, task, lore).includes("第二阶段单独核查备注"));
assert.throws(() => importLearningRecords(createReviewState(), JSON.stringify({ ...record, revisionFeedback: { ...record.revisionFeedback, studentQuote: "原文没有写这句话" } }), task));
const legacy = { ...record }; delete legacy.revisionFeedback; delete legacy.revisionFeedbackReceived;
assert.equal(importLearningRecords(createReviewState(), JSON.stringify(legacy), task).state.cases[0].record.revisionFeedbackReceived, false, "旧文件仍可导入");
const earlier = importLearningRecords(createReviewState(), JSON.stringify(legacy), task).state;
earlier.cases[0].observation.note = "教师先前已记录的观察";
const supplemented = importLearningRecords(earlier, JSON.stringify(record), task);
assert.equal(supplemented.updated, 1, "再次导入同一原文应补充后来收到的修订反馈");
assert.equal(supplemented.state.cases[0].record.revisionFeedbackReceived, true);
assert.equal(supplemented.state.cases[0].observation.note, "教师先前已记录的观察");
assert.equal(earlier.cases[0].record.revisionFeedbackReceived, false, "导入不能原地修改旧状态");
const conflict = importLearningRecords(supplemented.state, JSON.stringify({ ...record, revision: record.revision + "我又补充了新的判断。" }), task);
assert.equal(conflict.conflicts, 1, "同一编号但学生内容不同应显式报告冲突");
assert.equal(conflict.state.cases[0].record.revision, record.revision, "冲突记录不能覆盖已审阅原文");

let upstream;
const fetcher = async (_url, options) => {
  upstream = JSON.parse(options.body);
  return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(generated) } }] }) };
};
const options = { task, lore, config: { apiKey: "test-key", baseUrl: "https://example.invalid", model: "test-model" }, fetcher };
const response = await reviewInquiry(payload, options);
assert.equal(response.studentQuote, generated.studentQuote, "服务端必须针对修订稿核对原话");
const modelInput = JSON.parse(upstream.messages.find(message => message.role === "user").content);
assert.equal(modelInput.studentExplanation, draft.revision);
assert.equal(modelInput.originalExplanation, draft.initial);
assert.equal(modelInput.studentEvidenceNote, draft.evidenceNote);
assert.ok(upstream.messages[0].content.includes("修订"));
await assert.rejects(reviewInquiry({ ...payload, mode: "invented" }, options), error => error.status === 400);
await assert.rejects(reviewInquiry({ ...payload, revision: " " }, options), error => error.status === 400);
await assert.rejects(reviewInquiry({ ...payload, revision: "字".repeat(801) }, options), error => error.status === 400);
await assert.rejects(reviewInquiry({ ...payload, revisionBoundary: "invented" }, options), error => error.status === 400);
await assert.rejects(reviewInquiry({ ...payload, evidenceNote: "字".repeat(501) }, options), error => error.status === 400);

const nodes = new Map();
const element = id => {
  if (!nodes.has(id)) nodes.set(id, { disabled: false, value: "", textContent: "", replaceChildren() {}, querySelectorAll() { return []; } });
  return nodes.get(id);
};
const rendered = [];
const context = vm.createContext({ ...inquiry, ...classroomReview, taskData: task, loreData: lore, stateData: backup,
  document: { getElementById: element, querySelectorAll: () => [], createElement: tag => ({ tag }) },
  renderEvidenceFeedback(container, value, options) { rendered.push({ container, value, options }); },
});
const view = (await readFile(new URL("../js/classroom-review-view.js", import.meta.url), "utf8")).replace(/^import .*;\s*$/gm, "").replace(/\nbootReview\(\);\s*$/, "");
vm.runInContext(view + '\nreviewTask=taskData;reviewLore=loreData;reviewState=stateData;selectedRecord=stateData.cases[0].record.recordId;renderCase();', context);
assert.equal(element("observeFeedback").disabled, true, "没有初稿反馈时不能填写初稿核查");
assert.equal(element("observeRevisionFeedback").disabled, false, "收到修订反馈时应可独立填写修订核查");
assert.equal(element("revisionFeedbackNote").value, "第二阶段单独核查备注");
assert.equal(element("feedbackNote").value, "");
assert.equal(rendered[0].options.initial, draft.revision, "教师页应以修订原文核对第二次反馈");
console.log("修订反馈通过：独立请求、修订原话核对、过期恢复拒绝、双阶段记录、旧格式兼容、教师核查分离。");
