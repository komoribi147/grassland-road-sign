import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadVoiceService, normalizeVoiceText, voiceKey } from "../server/voice-service.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(root, ".env")); } catch {}
const { profiles, service } = await loadVoiceService({ provider: "edge" });
const out = path.join(root, "assets/audio/voices");
await mkdir(out, { recursive: true });
const jobs = new Map();
const add = (npc, text) => {
  if (!Object.hasOwn(profiles, npc) || typeof text !== "string") return;
  text = normalizeVoiceText(text);
  if (!text || /[{}]/.test(text)) return;
  jobs.set(`${npc}\n${text}`, { npc, text });
};
for (const [npc, profile] of Object.entries(profiles)) add(npc, profile.sample);
if (!process.argv.includes("--samples")) {
  const walk = (value, owner = null) => {
    if (!value || typeof value !== "object") return;
    const npc = value.ai || owner;
    if (value.t === "say") {
      for (const player of ["文书", "同志", "你"]) add(value.who, String(value.text || "").replaceAll("{player}", player));
    }
    if (npc && typeof value.reply === "string") add(npc, value.reply);
    if (npc && typeof value.fallback === "string") add(npc, value.fallback);
    for (const item of Object.values(value)) if (item && typeof item === "object") walk(item, npc);
  };
  const manifest = JSON.parse(await readFile(path.join(root, "story/manifest.json"), "utf8"));
  for (const scene of manifest.scenes) walk(JSON.parse(await readFile(path.join(root, scene), "utf8")));
}
const clips = [];
let completed = 0;
const queue = [...jobs.values()];
const failures = [];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const job = queue.shift();
    try {
      const audio = await service.speak(job.npc, job.text);
      const file = `${voiceKey(job.npc, job.text, profiles[job.npc])}.mp3`;
      await writeFile(path.join(out, file), audio);
      clips.push({ ...job, url: `assets/audio/voices/${file}` });
      console.log(`[${++completed}/${jobs.size}] ${profiles[job.npc].name}: ${job.text.slice(0, 24)}`);
    } catch (error) { failures.push({ ...job, error: error.message }); console.error(`[FAILED] ${job.npc}: ${error.message.slice(0, 160)}`); }
  }
}));
// A sample-only run preserves previously generated story clips.
if (process.argv.includes("--samples")) {
  try {
    const previous = JSON.parse(await readFile(path.join(out, "manifest.json"), "utf8"));
    for (const clip of previous.clips || []) if (!jobs.has(`${clip.npc}\n${clip.text}`)) clips.push(clip);
  } catch {}
}
clips.sort((a, b) => a.url.localeCompare(b.url));
await writeFile(path.join(out, "manifest.json"), JSON.stringify({ version: 2, provider: "Microsoft Edge Neural", generatedAt: new Date().toISOString(), profiles, clips }, null, 2) + "\n");
console.log(`Generated ${completed}/${jobs.size}; total indexed ${clips.length}.`);
if (failures.length) { console.error(`${failures.length} clips failed; rerun to retry using cached successes.`); process.exitCode = 1; }
