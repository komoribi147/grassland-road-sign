import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectVoiceLines, expandVoiceJobs } from "./story-voice-lines.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = path.join(root, "node_modules/.voice-batch");
const load = async f => JSON.parse(await readFile(path.join(root, f), "utf8"));
const hash = b => createHash("sha256").update(b).digest("hex");
const bank = await load("voice/manifest.json");
const story = await load("story/manifest.json");
const scenes = await Promise.all(story.scenes.map(load));
const lines = collectVoiceLines(scenes);
await mkdir(scratch, { recursive: true });
if (process.argv.includes("--prepare")) {
  const refs = await load("story/voice-references.json");
  const originalsFile = "voice/original-recordings.json";
  let originals;
  try { originals = await load(originalsFile); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    originals = {};
    for (const [id, entry] of Object.entries(bank.lines)) if (!entry.generation) {
      originals[id] = { ...entry, sha256: hash(await readFile(path.join(root, "voice", entry.file))) };
    }
    await writeFile(path.join(root, originalsFile), JSON.stringify(originals, null, 2) + "\n");
  }
  for (const [id, original] of Object.entries(originals)) {
    if (bank.lines[id].file !== original.file || hash(await readFile(path.join(root, "voice", original.file))) !== original.sha256) throw Error(`原始录音发生变化: ${id}`);
  }
  for (const ref of Object.values(refs)) ref.sha256 = hash(await readFile(path.join(root, ref.file)));
  for (const [id, entry] of Object.entries(bank.lines)) {
    for (const take of [entry, ...Object.values(entry.variants || {})]) {
      const g = take.generation, ref = refs[entry.who];
      if (g && (g.referenceSha256 !== ref.sha256 || (g.referenceText != null &&
        (g.referenceText !== ref.text || g.referenceFile !== ref.file || g.referenceSeed !== ref.seed)))) throw Error(`${id}: 参考声线已变化，需要明确重新生成`);
    }
  }
  const jobs = expandVoiceJobs(lines, bank).map(job => {
    const reference = refs[job.who];
    if (!reference) throw Error(`缺少参考声线: ${job.who}`);
    if (/[{}]/.test(job.text)) throw Error(`${job.id}: 未解析占位符`);
    const signature = hash(JSON.stringify(["qwen-base-fixed-v2", job.who, job.text, reference.file, reference.text, reference.sha256, reference.seed]));
    return { ...job, file: `audio/${job.key}-local.mp3`, reference, signature };
  });
  await writeFile(path.join(scratch, "jobs.json"), JSON.stringify({ jobs, count: lines.length }, null, 2));
  const counts = {};
  for (const l of lines) counts[l.who] = (counts[l.who] || 0) + 1;
  console.log(JSON.stringify({ totalStoryLines: lines.length, existing: Object.keys(bank.lines).length, generationJobs: jobs.length, counts }));
} else if (process.argv.includes("--finalize")) {
  const { jobs } = await load("node_modules/.voice-batch/jobs.json");
  const progress = await load("node_modules/.voice-batch/progress.json");
  const characters = await load("story/characters.json");
  const currentRefs = await load("story/voice-references.json");
  for (const job of jobs) {
    const current = lines.find(l => l.id === job.id);
    if (!current || current.who !== job.who || current.text.replaceAll("{player}", job.address || "{player}") !== job.text) throw Error(`生成期间剧本变化: ${job.key}`);
    const currentRef = currentRefs[job.who];
    if (!currentRef || ["file", "text", "seed"].some(key => currentRef[key] !== job.reference[key]) ||
      hash(await readFile(path.join(root, currentRef.file))) !== job.reference.sha256) throw Error(`生成期间参考变化: ${job.key}`);
    const take = progress[job.key];
    if (!take || take.signature !== job.signature || hash(await readFile(path.join(root, "voice", job.file))) !== take.sha256) throw Error(`未完成或音频变化: ${job.key}`);
    const clip = { file: job.file, dur: take.duration };
    const generation = { provider: "Qwen3-TTS Base local", referenceFile: job.reference.file, referenceText: job.reference.text,
      referenceSeed: job.reference.seed, referenceSha256: job.reference.sha256, signature: job.signature, sha256: take.sha256 };
    if (!bank.lines[job.id]) bank.lines[job.id] = { ...clip, who: job.who, display: characters[job.who].display, text: current.text, version: "local", generation };
    if (job.address) {
      bank.lines[job.id].variants ||= {};
      bank.lines[job.id].variants[job.address] = { ...clip, generation };
    }
  }
  bank.count = Object.keys(bank.lines).length;
  bank.version = "2026-10-24-local-complete";
  bank.source = "组员选定的 56 句录音 + 本地角色声线补全；何大姐 caring-v4";
  await writeFile(path.join(root, "voice/manifest.json.tmp"), JSON.stringify(bank, null, 2) + "\n");
  const { rename } = await import("node:fs/promises");
  await rename(path.join(root, "voice/manifest.json.tmp"), path.join(root, "voice/manifest.json"));
  console.log(`已接入 ${bank.count}/${lines.length} 处剧情台词及三种称呼变体`);
} else throw Error("Use --prepare or --finalize");
