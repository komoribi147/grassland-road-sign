import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadVoiceService } from "../server/voice-service.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try { process.loadEnvFile(path.join(root, ".env")); } catch {}
const profiles = JSON.parse(await readFile(path.join(root, "story/voice-designs.json"), "utf8"));
const { service } = await loadVoiceService({ provider: "edge" });
const output = path.join(root, "assets/audio/voice-candidates");
await mkdir(output, { recursive: true });
for (const [npc, profile] of Object.entries(profiles)) {
  const audio = await service.speak(npc, profile.sample);
  await writeFile(path.join(output, `${npc}-edge-baseline.mp3`), audio);
  console.log(`Same-text baseline saved: ${npc}`);
}
