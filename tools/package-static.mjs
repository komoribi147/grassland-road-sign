#!/usr/bin/env node
// Prepare only the files needed by the static site host.
import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, "dist");
if (!out.startsWith(`${root}${path.sep}`)) throw new Error("Refusing to write outside the project");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await copyFile(path.join(root, "index.html"), path.join(out, "index.html"));
await copyFile(path.join(root, "rescue-demo.html"), path.join(out, "rescue-demo.html"));
for (const dir of ["css", "js", "story"]) {
  await cp(path.join(root, dir), path.join(out, dir), { recursive: true });
}
await mkdir(path.join(out, "assets"));
for (const dir of ["audio", "rescue", "stills", "ui"]) {
  await cp(path.join(root, "assets", dir), path.join(out, "assets", dir), { recursive: true });
}

console.log("Static site prepared in dist/.");
