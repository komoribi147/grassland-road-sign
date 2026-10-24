import assert from "node:assert/strict";
import { collectVoiceLines, expandVoiceJobs } from "./story-voice-lines.mjs";

const scenes = [{ id: "scene", steps: [
  { t: "say", who: "shitou", text: "{player}，等等我。" },
  { t: "say", who: "__player__", text: "我来了。" },
  { t: "select", ai: "he-xiuying", options: [{ reply: "坐下歇歇。" }] },
  { t: "action", after: [{ t: "say", who: "he-xiuying", text: "别急。" }] },
] }];
const lines = collectVoiceLines(scenes);
assert.deepEqual(lines.map(l => l.id), ["scene-000", "scene-002o0", "scene-003a"]);
const jobs = expandVoiceJobs(lines, { lines: {} });
assert.equal(jobs.length, 5, "有称呼的台词要覆盖三种信任称呼");
assert.deepEqual(jobs.slice(0, 3).map(l => l.text), ["文书，等等我。", "同志，等等我。", "你，等等我。"]);
assert.ok(jobs.every(l => !l.text.includes("{")));
assert.equal(expandVoiceJobs(lines, { lines: { "scene-002o0": { text: "坐下歇歇。", who: "he-xiuying", file: "audio/approved.mp3" } } }).length, 4, "已选定录音不重做");
assert.throws(() => expandVoiceJobs(lines, { lines: { "scene-002o0": { text: "旧剧本", who: "he-xiuying" } } }), /不匹配/, "不能静默覆盖已有不同台词");
assert.throws(() => collectVoiceLines([{ id: "scene", steps: [{ t: "action", after: [{ t: "say", who: "shitou", text: "一" }, { t: "say", who: "shitou", text: "二" }] }] }]), /多句/, "不能将多个追加对白挤到同一个 ID");
console.log("剧情配音清单、分支、称呼变体、原录音保护测试通过");
