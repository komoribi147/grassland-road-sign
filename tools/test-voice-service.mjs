import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { createVoiceService } from "../server/voice-service.mjs";

const scratch = new URL("../node_modules/", import.meta.url);
await mkdir(scratch, { recursive: true });
const cacheDir = await mkdtemp(new URL("test-voice-", scratch));
try {
  let calls = 0;
  let fail = false;
  const profiles = { stone: { voice: "voice-a", rate: "+0%", pitch: "+0Hz" } };
  const service = createVoiceService({ cacheDir, profiles, synthesize: async ({ text, profile }) => {
    calls++;
    if (fail) throw new Error("offline");
    await new Promise(r => setTimeout(r, 10));
    return Buffer.from("ID3" + profile.voice + text);
  } });
  await assert.rejects(() => service.speak("unknown", "你好"), /角色/);
  await assert.rejects(() => service.speak("stone", "x".repeat(1201)), /文本/);
  await assert.rejects(() => service.speak("stone", "  "), /文本/);
  const [a, b] = await Promise.all([service.speak("stone", "你好"), service.speak("stone", "你好")]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1, "并发相同文本只合成一次");
  await service.speak("stone", "你好");
  assert.equal(calls, 1, "重复请求命中磁盘缓存");
  fail = true;
  await assert.rejects(() => service.speak("stone", "新一句"), /offline/);
  fail = false;
  await service.speak("stone", "新一句");
  assert.equal(calls, 3, "失败不污染后续重试");
  const changed = createVoiceService({ cacheDir, profiles: { stone: { ...profiles.stone, voice: "voice-b" } }, synthesize: async () => { calls++; return Buffer.from("ID3voice-b"); } });
  await changed.speak("stone", "你好");
  assert.equal(calls, 4, "改声线后不复用旧声线缓存");
  const seenProfiles = [];
  const emotional = createVoiceService({ cacheDir, profiles: { stone: { voice: "calm-reference", moods: { 难过: { voice: "sad-reference" } } } }, synthesize: async job => { seenProfiles.push(job.profile.voice); return Buffer.from("ID3" + job.profile.voice); } });
  await emotional.speak("stone", "记得他们。", "难过");
  await emotional.speak("stone", "记得他们。", "平静");
  assert.deepEqual(seenProfiles, ["sad-reference", "calm-reference"], "不同情绪使用对应角色参考录音，缓存不能串用");
  let started;
  const entered = new Promise(resolve => { started = resolve; });
  let physicallyCancelled = false;
  const cancellable = createVoiceService({ cacheDir, profiles, synthesize: async ({ signal }) => {
    started();
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => { physicallyCancelled = true; reject(new DOMException("cancelled", "AbortError")); }, { once: true }));
  } });
  const controller = new AbortController();
  const waiting = cancellable.speak("stone", "取消这次生成", "", controller.signal);
  const cancelled = assert.rejects(waiting, error => error.name === "AbortError");
  await entered;
  controller.abort();
  await cancelled;
  assert.equal(physicallyCancelled, true, "停止播放也应终止无人等待的慢速生成");
  console.log("角色验证、文本限制、并发去重、磁盘缓存、失败恢复与声线换版通过");
} finally { await rm(cacheDir, { recursive: true, force: true }); }
