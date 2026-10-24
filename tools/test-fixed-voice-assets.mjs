import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { VoicePlayer } from "../js/voice.js";
import { createHash } from "node:crypto";
import { collectVoiceLines, VOICE_ADDRESSES } from "./story-voice-lines.mjs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("voice/manifest.json", root), "utf8"));
const story = JSON.parse(await readFile(new URL("story/manifest.json", root), "utf8"));
const scenes = {};
for (const file of story.scenes) { const scene = JSON.parse(await readFile(new URL(file, root), "utf8")); scenes[scene.id] = scene; }
const player = new VoicePlayer({ fixedManifest: manifest });
const expected = collectVoiceLines(Object.values(scenes));
assert.equal(expected.length, 132);
assert.equal(Object.keys(manifest.lines).length, expected.length, "全剧所有角色与选项分支都应有配音");
assert.equal(manifest.count, expected.length);
for (const line of expected) assert.ok(player.fixedLine(line.id, line.who, line.text), `${line.id}: 缺少配音`);
const counts = {};
for (const [id, entry] of Object.entries(manifest.lines)) {
  const match = id.match(/^(.+)-(\d+)(?:o(\d+)|(a))?$/);
  assert.ok(match, id);
  const step = scenes[match[1]]?.steps[Number(match[2])];
  assert.ok(step, `${id}: 剧情位置必须存在`);
  let who = step.who, text = step.text;
  if (match[3] != null) {
    const option = step.options?.[Number(match[3])];
    who = step.ai || option?.replyWho || step.replyWho; text = option?.reply;
  } else if (match[4]) {
    const after = step.after?.find(item => item.t === "say"); who = after?.who; text = after?.text;
  }
  assert.ok(player.fixedLine(id, who, text), `${id}: 说话人和台词应与剧情匹配`);
  const file = new URL(`voice/${entry.file}`, root);
  const audio = await readFile(file);
  assert.ok(audio.length > 500 && Number.isFinite(entry.dur) && entry.dur > 0, `${id}: 音频不能为空`);
  assert.ok(audio.subarray(0, 3).toString() === "ID3" || (audio[0] === 255 && (audio[1] & 224) === 224), `${id}: 应为 MP3`);
  if (entry.text.includes("{player}")) {
    for (const address of VOICE_ADDRESSES) {
      const v = player.fixedLine(id, who, text, entry.text.replaceAll("{player}", address));
      assert.ok(v && v.file === entry.variants[address].file, `${id}: 称呼变体 ${address}`);
      const bytes = await readFile(new URL(`voice/${v.file}`, root));
      assert.ok(bytes.length > 500);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), v.generation.sha256);
    }
  }
  if (entry.generation) assert.equal(createHash("sha256").update(audio).digest("hex"), entry.generation.sha256);
  counts[who] = (counts[who] || 0) + 1;
}
assert.deepEqual(counts, { "li-changhe": 54, "shitou": 29, "he-xiuying": 47, "he-xiuying-old": 2 });
const originals = JSON.parse(await readFile(new URL("voice/original-recordings.json", root), "utf8"));
assert.equal(Object.keys(originals).length, 56);
for (const [id, original] of Object.entries(originals)) {
  assert.equal(manifest.lines[id].file, original.file, `${id}: 原版文件路径不变`);
  assert.equal(manifest.lines[id].text, original.text, `${id}: 原版字幕不变`);
  const audio = await readFile(new URL(`voice/${original.file}`, root));
  assert.equal(createHash("sha256").update(audio).digest("hex"), original.sha256, `${id}: 原录音不得被替换`);
}
assert.ok((await stat(new URL("voice/audio/prologue-007o0-v2.mp3", root))).size > 1000);
console.log("132 处剧情配音、三种称呼、原 56 句文件保护、文字与 MP3 校验通过");
