// Compare deployed bytes with dist, including every optimized image in the build.
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const origin = process.argv[2];
if (!origin || !/^https:\/\//.test(origin)) throw new Error("Pass the public HTTPS site URL");
const paths = ["index.html", "css/style.css", "js/main.js", "js/engine.js", "js/visual-delivery.js",
  "js/image-assets.js", "js/reflection-view.js", "story/scenes/prologue.json", "story/scenes/act2.json"];
for (const file of await readdir(path.join(root, "dist/assets/optimized"))) paths.push(`assets/optimized/${file}`);
const hash = data => createHash("sha256").update(data).digest("hex");
const failed = [], verified = [];
let next = 0;
async function worker() {
  while (next < paths.length) {
    const file = paths[next++];
    try {
      const response = await fetch(`${origin.replace(/\/$/, "")}/${file}?verify=visual1-${Date.now()}`, {
        cache: "no-store", signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const remote = Buffer.from(await response.arrayBuffer());
      const local = await readFile(path.join(root, "dist", file));
      if (hash(remote) !== hash(local)) throw new Error("SHA256 mismatch");
      verified.push(file);
    } catch (error) { failed.push({ file, error: error.message }); }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
const report = { time: new Date().toISOString(), origin, checked: paths.length, passed: verified.length, failed };
if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report));
process.exitCode = failed.length ? 1 : 0;
