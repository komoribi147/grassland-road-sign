import assert from "node:assert/strict";
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = await mkdtemp(path.join(root, "node_modules/test-voice-checkpoint-"));
const put = async (name, data) => writeFile(path.join(scratch, name), JSON.stringify(data));
const run = mode => spawnSync(process.execPath, [path.join(scratch, "tools/complete-local-voices.mjs"), mode], { encoding: "utf8" });
const sha = b => createHash("sha256").update(b).digest("hex");
try {
  for (const d of ["tools", "story", "voice/audio", "node_modules/.voice-batch"]) await mkdir(path.join(scratch, d), { recursive: true });
  await put("package.json", { type: "module" });
  for (const f of ["complete-local-voices.mjs", "story-voice-lines.mjs"]) await copyFile(path.join(root, "tools", f), path.join(scratch, "tools", f));
  await put("story/manifest.json", { scenes: ["story/scene.json"] });
  const scene = { id: "scene", steps: [{ t: "say", who: "he", text: "坐下歇歇。" }] };
  await put("story/scene.json", scene);
  await put("story/characters.json", { he: { display: "何大姐" } });
  await put("voice/manifest.json", { lines: {} });
  const ref = { file: "voice/ref.wav", text: "参考台词", seed: 149 };
  const referenceBytes = Buffer.from("reference bytes");
  for (const f of ["voice/ref.wav", "voice/other.wav"]) await writeFile(path.join(scratch, f), referenceBytes);
  await put("story/voice-references.json", { he: ref });
  assert.equal(run("--prepare").status, 0);
  const { jobs } = JSON.parse(await readFile(path.join(scratch, "node_modules/.voice-batch/jobs.json"), "utf8"));
  assert.equal(jobs.length, 1);
  const audio = Buffer.from("ID3 generated fixture");
  await writeFile(path.join(scratch, "voice", jobs[0].file), audio);
  await put("node_modules/.voice-batch/progress.json", { [jobs[0].key]: { signature: jobs[0].signature, sha256: sha(audio), duration: 1 } });
  for (const change of [{ text: "修正后的参考台词" }, { seed: 150 }, { file: "voice/other.wav" }]) {
    await put("story/voice-references.json", { he: { ...ref, ...change } });
    const result = run("--finalize");
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /参考变化/);
    assert.deepEqual(JSON.parse(await readFile(path.join(scratch, "voice/manifest.json"), "utf8")), { lines: {} }, "拒绝接入时不得改写清单");
  }
  await put("story/voice-references.json", { he: ref });
  await writeFile(path.join(scratch, "voice/ref.wav"), "changed bytes");
  assert.match(run("--finalize").stderr, /参考变化/);
  await writeFile(path.join(scratch, "voice/ref.wav"), referenceBytes);
  await writeFile(path.join(scratch, "voice", jobs[0].file), "corrupt audio");
  assert.match(run("--finalize").stderr, /未完成或音频变化/);
  await writeFile(path.join(scratch, "voice", jobs[0].file), audio);
  await put("story/scene.json", { ...scene, steps: [{ ...scene.steps[0], text: "修改了剧本。" }] });
  assert.match(run("--finalize").stderr, /剧本变化/);
  await put("story/scene.json", scene);
  assert.equal(run("--finalize").status, 0);
  assert.equal(run("--prepare").status, 0, "同一配置恢复不应重做");
  assert.equal(JSON.parse(await readFile(path.join(scratch, "node_modules/.voice-batch/jobs.json"), "utf8")).jobs.length, 0);
  await put("story/voice-references.json", { he: { ...ref, text: "新的参考台词" } });
  assert.match(run("--prepare").stderr, /参考声线已变化/);
  console.log("本地配音断点恢复、参考台词/seed/路径/字节、剧本及音频变更拒绝接入通过");
} finally {
  assert.ok(scratch.startsWith(path.join(root, "node_modules/test-voice-checkpoint-")));
  await rm(scratch, { recursive: true, force: true });
}
