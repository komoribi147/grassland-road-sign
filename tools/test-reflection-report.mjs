import assert from "node:assert/strict";
import {
  buildReflectionReport, buildReflectionText,
} from "../js/reflection-report.js";

const characters = {
  "li-changhe": { display: "老班长" }, "shitou": { display: "石头" },
  "he-xiuying": { display: "何大姐" }, "he-xiuying-old": { display: "何秀英（晚年）" },
};
const lore = {
  lubiao: { title: "路标", text: "红布路标是艺术设计。", sourceTitle: "史料原文", sourceUrl: "https://example.com/history" },
  songpan: { title: "松潘草地", text: "1935年8月。", sourceTitle: "地方史", sourceUrl: "https://example.com/songpan" },
};
const state = {
  history: [
    { role: "npc", name: "老班长", text: "跟紧队伍。" },
    { role: "npc", name: "石头", text: "我不怕，真的。" },
    { role: "npc", name: "何秀英（晚年）", text: "许多名字，我记了一辈子。" },
  ],
  memory: { "shitou": [{ role: "player", text: "我陪着你。" }, { role: "npc", text: "好，咱们一块走。" }] },
  answers: ["我陪着你。", "<img src=x onerror=alert(1)>"],
  picks: ["递过干粮", "拉住石头", "拉住石头"], lore: ["lubiao"],
  trust: 98, turns: 12, startedAt: Date.now() - 300000,
};
const report = buildReflectionReport(state, characters, lore, { text: "记住他们。" });
assert.equal(report.companions.length, 3, "同一位人物的晚年不能算作另一个人");
assert.equal(report.companions.find((c) => c.id === "shitou").quote, "好，咱们一块走。", "回望应引用实际发生的独立对话");
assert.equal(report.companions.find((c) => c.id === "he-xiuying").name, "何大姐");
assert.deepEqual(report.picks, ["递过干粮", "拉住石头"], "重走和重复动作不应在回望中刷屏");
assert.deepEqual(report.sourceCards.map((c) => c.id), ["lubiao"], "只收录本次体验中解锁的史料");
assert.equal(report.reflection, state.reflection, "写下的话随本次存档保存");
assert.ok(Number.isFinite(report.createdAt));
assert.equal(buildReflectionReport(state, characters, lore).createdAt, report.createdAt, "重新打开保留回望日期");

report.reflection.note = "我会记得那只伸过来的手。";
report.reflection.keptId = "shitou";
const saved = buildReflectionText(report);
assert.ok(saved.includes(report.reflection.note));
assert.ok(saved.includes("好，咱们一块走。"));
assert.ok(saved.includes("https://example.com/history"));
assert.ok(saved.includes("<img src=x onerror=alert(1)>"), "纯文本导出完整保留原话");
assert.doesNotMatch(saved, /98|信任值|得分|总分|答对|掌握程度|完成率/, "回望不能将参与记录包装成学习成绩");
assert.match(saved, /我想留住的那句话/);
const restored = JSON.parse(JSON.stringify(state));
assert.equal(buildReflectionReport(restored, characters, lore).reflection.note, report.reflection.note);
const empty = buildReflectionReport({ history: [], lore: [] }, characters, lore);
assert.equal(empty.companions.length, 0, "不应替未经历的故事编造回忆");
assert.equal(empty.said.length, 0);
assert.equal(empty.reflection.note, "");
assert.doesNotMatch(buildReflectionText(empty), /未完成|未作答|零分/);
const asked = buildReflectionReport({
  memory: { shitou: [{ role: "npc", text: "沿着脚印走。" }] },
  askMemory: { shitou: [{ q: "你还想回家念书吗？", a: "想啊。你陪我一起学嘛。" }] },
}, characters, lore);
assert.equal(asked.companions[0].quote, "想啊。你陪我一起学嘛。", "独立提问的实际回答应留在回望里");
assert.ok(asked.said.includes("你还想回家念书吗？"), "回望应收录自由提问的原话");
console.log("回望报告通过：真实对话、人物合并、存档、原话与来源导出、留住一句话、留白状态。");
