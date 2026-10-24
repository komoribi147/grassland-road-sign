import assert from "node:assert/strict";
import { VoicePlayer } from "../js/voice.js";

const clips = [];
class Clip {
  constructor(src) { this.src = src; this.volume = 1; this.paused = true; this.listeners = {}; clips.push(this); }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  removeAttribute() {}
  load() {}
}
let resolveOld;
const events = [];
const revoked = [];
const voice = new VoicePlayer({
  AudioClass: Clip,
  fetcher: async (_url, options) => {
    const { text } = JSON.parse(options.body);
    if (text === "旧话") return new Promise(resolve => { resolveOld = resolve; });
    if (text === "断网") throw new Error("network");
    return { ok: true, blob: async () => new Blob([text], { type: "audio/mpeg" }) };
  },
  manifest: { clips: [] },
  fixedManifest: { lines: {} },
  createUrl: () => "blob:test-" + clips.length,
  revokeUrl: url => revoked.push(url),
  onStatus: event => events.push(event),
});
const old = voice.speak("li-changhe", "旧话");
await Promise.resolve();
await voice.speak("shitou", "新话");
assert.equal(clips.length, 1);
resolveOld({ ok: true, blob: async () => new Blob(["old"]) });
await old;
assert.equal(clips.length, 1, "迟到请求不得播放或覆盖当前角色");
voice.setVolume(0.35);
assert.equal(clips[0].volume, 0.35);
voice.setEnabled(false);
assert.equal(clips[0].paused, true, "关配音立即停播");
assert.equal(revoked.length, 1);
await voice.speak("shitou", "静音话");
assert.equal(clips.length, 1);
voice.setEnabled(true);
assert.equal(await voice.speak("shitou", "断网"), false);
assert.equal(events.at(-1).state, "error", "合成失败应给出可见错误状态");
await voice.speak("he-xiuying", "恢复了");
assert.equal(clips.length, 2);
voice.stop();
assert.equal(clips.at(-1).paused, true);
console.log("迟到回复不串音、静音取消、音量联动、失败提示和恢复通过");
let publicFetches = 0;
const publicEvents = [];
const publicVoice = new VoicePlayer({
  location: { hostname: "komoribi147.github.io" }, fixedManifest: { lines: {} },
  fetcher: async () => { publicFetches++; throw Error("不应请求静态站点的配音接口"); },
  onStatus: e => publicEvents.push(e),
});
assert.equal(publicVoice.canSynthesize, false);
assert.equal(await publicVoice.speak("he-xiuying", "新的回答。"), false);
assert.equal(publicFetches, 0);
assert.match(publicEvents.at(-1).message, /在线回复语音尚未开通/);
const localVoice = new VoicePlayer({ location: { hostname: "localhost" }, fixedManifest: { lines: {} } });
assert.equal(localVoice.canSynthesize, true, "本机仍使用已确认的角色音色生成");
console.log("静态站点不请求不存在的语音接口，本机保留角色配音通过");
