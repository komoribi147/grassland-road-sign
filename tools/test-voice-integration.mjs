import assert from "node:assert/strict";
import { VoicePlayer } from "../js/voice.js";

const approved = { lines: {
  "prologue-007o1": { who: "li-changhe", text: "跟在后头，别乱走。", file: "audio/prologue-007o1.mp3" },
  "bad-path": { who: "shitou", text: "你好", file: "../.env" },
  "act3-017": { who: "shitou", text: "{player}，等等我。", file: "audio/default.mp3", variants: {
    "文书": { file: "audio/address0.mp3", dur: 2 }, "同志": { file: "audio/address1.mp3", dur: 2 }, "你": { file: "audio/address2.mp3", dur: 2 },
  } },
} };
const requests = [], clips = [], events = [];
class Clip {
  constructor(src) { this.src = src; this.paused = true; this.listeners = {}; clips.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  removeAttribute() {}
  load() {}
}
const player = new VoicePlayer({
  manifest: { clips: [] }, fixedManifest: approved, AudioClass: Clip,
  fetcher: async (url, options) => { requests.push({ url, options }); return { ok: true, blob: async () => new Blob(["ID3 audio"], { type: "audio/mpeg" }) }; },
  createUrl: () => "blob:voice", revokeUrl: () => {}, onStatus: e => events.push(e),
});
await player.ready;
assert.equal(typeof player.fixedLine, "function", "融合播放器需要校验选定台词和角色");
assert.equal(player.fixedLine("prologue-007o1", "li-changhe", "中。跟在后头，别乱走。")?.text, "跟在后头，别乱走。");
assert.equal(player.fixedLine("prologue-007o1", "shitou", "跟在后头，别乱走。"), null, "不能给其他角色套用录音");
assert.equal(player.fixedLine("prologue-007o1", "li-changhe", "已经修改成另一句话。"), null, "剧本变化后不播放旧文本音频");
assert.equal(player.fixedLine("bad-path", "shitou", "你好"), null, "清单只能引用配音目录内音频");
await player.speak("shitou", "同志，等等我。", { mode: "fixed", id: "act3-017", template: "{player}，等等我。" });
assert.equal(requests.at(-1).url, "voice/audio/address1.mp3", "称呼应与信任对应的字幕一致");
await player.speak("shitou", "你，等等我。", { mode: "fixed", id: "act3-017", template: "{player}，等等我。" });
assert.equal(requests.at(-1).url, "voice/audio/address2.mp3", "低信任播放你称呼版本");
assert.equal(player.fixedLine("act3-017", "shitou", "{player}，等等我。", "朋友，等等我。"), null, "未知称呼不播放错误的声音");
await player.speak("li-changhe", "跟在后头，别乱走。", { mode: "fixed", id: "prologue-007o1" });
assert.equal(requests.at(-1).url, "voice/audio/prologue-007o1.mp3", "组员选定音频优先");
assert.equal(events.at(-1).source, "confirmed");
player.setVolume(.2);
assert.equal(clips.at(-1).volume, .2);
player.setMasterEnabled(false);
assert.equal(clips.at(-1).paused, true, "总静音立即停止选定配音");
player.setMasterEnabled(true);
const before = requests.length;
await player.speak("shitou", "尚未选定的剧情台词", { mode: "fixed", id: "missing" });
assert.equal(requests.length, before, "缺配音的剧情不自动混入另一套音色");
await player.speak("li-changhe", "这是一句新的 AI 回答。", { mode: "dynamic" });
assert.equal(requests.at(-1).url, "/api/tts", "AI 新回答进行实时合成");
assert.equal(events.at(-1).source, "realtime");
const last = JSON.parse(requests.at(-1).options.body);
await player.replay();
assert.deepEqual(JSON.parse(requests.at(-1).options.body), last, "回放只重新播放上一句，不再请求 AI 回答");
player.stop();
await player.speak("li-changhe", "跟在后头，别乱走。", { mode: "fixed", id: "prologue-007o1" });
player.stop({ clearReplay: false });
assert.ok(player.last, "暂时切换标签或打开菜单后保留手动回放入口");
await player.replay();
assert.equal(requests.at(-1).url, "voice/audio/prologue-007o1.mp3");
player.stop();

let resolveManifest;
const stale = new VoicePlayer({ manifest: { clips: [] }, AudioClass: Clip,
  fetcher: url => url === "voice/manifest.json"
    ? new Promise(resolve => { resolveManifest = resolve; })
    : Promise.resolve({ ok: true, blob: async () => new Blob(["audio"]) }),
  createUrl: () => "blob:stale", revokeUrl: () => {},
});
const count = clips.length;
const pending = stale.speak("li-changhe", "跟在后头，别乱走。", { mode: "fixed", id: "prologue-007o1" });
stale.stop();
resolveManifest({ ok: true, json: async () => approved });
await pending;
assert.equal(clips.length, count, "清单迟到也不能播已跳过的台词");
console.log("选定台词优先、文字/角色校验、静音音量、缺失台词、实时回复、回放和清单迟到取消通过");
