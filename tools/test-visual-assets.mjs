import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sceneOrder = ["prologue.json", "act1.json", "act2.json", "act3.json", "act4.json", "epilogue.json"];
const files = (await readdir(path.join(root, "story/scenes")))
  .filter((name) => name.endsWith(".json"))
  .sort((a, b) => sceneOrder.indexOf(a) - sceneOrder.indexOf(b));
const referenced = new Set();
const usages = new Map();
const shotList = [];
let visualCount = 0;

function record(src, where, caption = "") {
  referenced.add(src);
  const entries = usages.get(src) || [];
  entries.push(where);
  usages.set(src, entries);
  shotList.push({ src, where, caption });
}

function visit(value, where) {
  if (!value || typeof value !== "object") return;
  if (value.visual) {
    assert.equal(value.visual.sheet, undefined, `${where}: 仍在使用旧六格分镜`);
    assert.match(value.visual.src || "", /^assets\/stills\/[\w-]+\.png$/, `${where}: 应使用新纪实单镜头`);
    record(value.visual.src, where, value.description || value.label || value.text || "");
    if (value.visual.crop) {
      const { x, y, w, h } = value.visual.crop;
      assert.ok([x, y, w, h].every(Number.isFinite) && x >= 0 && y >= 0
        && w > 0 && h > 0 && x + w <= 1 && y + h <= 1,
      `${where}: 细节镜头取景框超出原图`);
    }
    visualCount++;
  }
  if (value.t === "bg" && value.src) {
    assert.match(value.src, /^assets\/stills\/[\w-]+\.png$/, `${where}: 仍在使用旧背景`);
    record(value.src, where, "背景切换");
  }
  for (const [key, sub] of Object.entries(value)) visit(sub, `${where}.${key}`);
}

for (const name of files) {
  const scene = JSON.parse(await readFile(path.join(root, "story/scenes", name), "utf8"));
  assert.match(scene.bg || "", /^assets\/stills\/[\w-]+\.png$/, `${name}: 仍在使用旧背景`);
  record(scene.bg, `${name}.bg`, scene.title || "场景背景");
  visit(scene.steps, name);
}

for (const src of referenced) await access(path.join(root, src));
if (process.argv.includes("--inventory")) {
  console.log("# 正式剧情独立镜头清单\n");
  console.log(`当前 ${shotList.length} 次图片使用，${referenced.size} 张不同文件。每一行最终须对应独立生成的图片。\n`);
  console.log("| 序号 | 位置 | 画面内容 | 目前图片 | 当前复用次数 |");
  console.log("| ---: | --- | --- | --- | ---: |");
  shotList.forEach(({ src, where, caption }, index) => {
    const safe = caption.replace(/\s+/g, " ").replaceAll("|", "\\|");
    console.log(`| ${index + 1} | \`${where}\` | ${safe} | \`${src}\` | ${usages.get(src).length} |`);
  });
  process.exit(0);
}
assert.ok(visualCount >= 80, `视觉节点不足：${visualCount}`);
const duplicatePaths = [...usages].filter(([, entries]) => entries.length > 1);
const hashes = new Map();
for (const src of referenced) {
  const hash = createHash("sha256").update(await readFile(path.join(root, src))).digest("hex");
  const entries = hashes.get(hash) || [];
  entries.push(src);
  hashes.set(hash, entries);
}
const duplicateContents = [...hashes.values()].filter((entries) => entries.length > 1);
const total = [...usages.values()].reduce((count, entries) => count + entries.length, 0);
assert.equal(duplicatePaths.length, 0,
  `${total} 次正式图片使用中有 ${duplicatePaths.length} 个路径被复用；例如 ${duplicatePaths.slice(0, 5).map(([src, entries]) => `${src} (${entries.length} 次)`).join(", ")}`);
assert.equal(duplicateContents.length, 0,
  `发现内容相同但文件名不同的图片：${duplicateContents.slice(0, 5).map((entries) => entries.join(" / ")).join(", ")}`);
console.log(`新视觉素材检查通过：${visualCount} 个节点，${total} 次正式使用，${referenced.size} 张独立图片`);
