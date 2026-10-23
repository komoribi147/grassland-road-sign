#!/usr/bin/env node
// Prepare only the files needed by the static site host.
import { cp, copyFile, mkdir, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IMAGE_ASSETS } from "../js/image-assets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, "dist");
if (!out.startsWith(`${root}${path.sep}`)) throw new Error("Refusing to write outside the project");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await copyFile(path.join(root, "index.html"), path.join(out, "index.html"));
await copyFile(path.join(root, "rescue-demo.html"), path.join(out, "rescue-demo.html"));
for (const dir of ["css", "js", "story", "voice"]) {
  await cp(path.join(root, dir), path.join(out, dir), { recursive: true });
}
await mkdir(path.join(out, "assets"));
for (const dir of ["audio", "rescue", "ui"]) {
  await cp(path.join(root, "assets", dir), path.join(out, "assets", dir), { recursive: true });
}

const images = new Set(["assets/stills/today-path-monument.png"]);
const collect = value => {
  if (typeof value === "string" && value.startsWith("assets/stills/")) images.add(value);
  else if (value && typeof value === "object") Object.values(value).forEach(collect);
};
const manifest = JSON.parse(await readFile(path.join(root, "story/manifest.json"), "utf8"));
for (const scene of manifest.scenes) collect(JSON.parse(await readFile(path.join(root, scene), "utf8")));
await mkdir(path.join(out, "assets/optimized"));
for (const source of images) {
  const image = IMAGE_ASSETS[source];
  if (!image) throw new Error(`Missing optimized image: ${source}`);
  for (const tier of ["full", "small"]) await copyFile(path.join(root, image[tier]), path.join(out, image[tier]));
}

console.log("Static site prepared in dist/.");
