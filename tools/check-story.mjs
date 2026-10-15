#!/usr/bin/env node
// 剧本数据自检：在本地和 GitHub 上（每次提交/合并请求）自动运行。
// 用法：node tools/check-story.mjs
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const errors = [];
const warnings = [];
const drafts = [];

const readJSON = async (rel) => JSON.parse(await readFile(path.join(root, rel), "utf8"));

const manifest = await readJSON("story/manifest.json");
const characters = await readJSON("story/characters.json");
const lore = await readJSON("story/lore.json");
const scenes = {};

for (const rel of manifest.scenes) {
  const scene = await readJSON(rel);
  if (scenes[scene.id]) errors.push(`场景 id 重复：${scene.id}（${rel}）`);
  scenes[scene.id] = { ...scene, __file: rel };
}

if (!scenes[manifest.start]) errors.push(`manifest.start 指向不存在的场景：${manifest.start}`);

const STEP_TYPES = new Set([
  "say", "narrate", "think", "choose", "action", "input",
  "label", "trust", "var", "bg", "ambient", "sfx", "lore",
  "if", "jump", "goto", "end",
]);

const jumpTargets = [];
const bgFiles = new Set();

const checkSteps = (list, sceneId, where) => {
  if (!Array.isArray(list)) {
    errors.push(`${sceneId} ${where} 不是数组`);
    return;
  }
  list.forEach((step, i) => {
    const tag = `${sceneId} ${where}[${i}]`;
    if (!step || typeof step !== "object") return errors.push(`${tag} 不是对象`);
    if (!STEP_TYPES.has(step.t)) errors.push(`${tag} 未知类型 t=${step.t}`);
    if (step.draft) drafts.push(`${tag} —— ${step.text || step.label || step.prompt || ""}`.slice(0, 90));
    if (step.who && step.who !== "__player__" && !characters[step.who]) {
      warnings.push(`${tag} who=${step.who} 不在 characters.json 里（会按原样显示）`);
    }
    if (step.ai && !characters[step.ai]) errors.push(`${tag} ai=${step.ai} 不在 characters.json 里`);
    if (step.card && !lore[step.card]) errors.push(`${tag} card=${step.card} 不在 lore.json 里`);
    if (step.t === "input" && !Array.isArray(step.fallback)) {
      warnings.push(`${tag} 自由回答缺少 fallback 兜底台词（没连大模型时会冷场）`);
    }
    if (step.t === "choose") {
      if (!Array.isArray(step.options) || step.options.length < 2) errors.push(`${tag} 至少要有两个选项`);
      for (const opt of step.options || []) {
        if (!opt.text) errors.push(`${tag} 有选项缺少 text`);
        if (opt.goto) jumpTargets.push({ sceneId, target: opt.goto, tag });
      }
    }
    if (step.t === "if") {
      if (!step.cond) errors.push(`${tag} if 步骤缺少 cond`);
      if (step.goto) jumpTargets.push({ sceneId, target: step.goto, tag });
    }
    if (step.t === "goto" && step.scene) jumpTargets.push({ sceneId, target: step.scene, tag });
    if (step.t === "bg" && step.src) bgFiles.add(step.src);
    if (step.t === "label" && !step.name) errors.push(`${tag} label 缺少 name`);
    if (step.after) checkSteps(step.after, sceneId, `${where}[${i}].after`);
  });
};

for (const scene of Object.values(scenes)) {
  if (scene.bg) bgFiles.add(scene.bg);
  if (scene.present !== undefined) {
    if (!Array.isArray(scene.present)) errors.push(`${scene.id} 的 present 必须是数组`);
    else for (const id of scene.present) {
      if (!characters[id]) errors.push(`${scene.id} 的 present 里有不认识的角色 ${id}`);
    }
  } else {
    warnings.push(`${scene.id} 没写 present，玩家在这一幕不能主动开口说话`);
  }
  checkSteps(scene.steps, scene.id, "steps");
}

// 跳转目标是否存在
for (const { sceneId, target, tag } of jumpTargets) {
  const [targetScene, label] = String(target).split(":");
  const scene = scenes[targetScene];
  if (!scene) { errors.push(`${tag} 跳转到不存在的场景 ${targetScene}`); continue; }
  if (label) {
    const labels = scene.steps.filter((s) => s.t === "label").map((s) => s.name);
    if (!labels.includes(label)) errors.push(`${tag} 跳转到不存在的标记 ${target}`);
  }
}

// 没被任何地方用到的标记（多半是写错了名字）
for (const scene of Object.values(scenes)) {
  const labels = scene.steps.filter((s) => s.t === "label").map((s) => s.name);
  const used = jumpTargets.filter((j) => j.target.startsWith(`${scene.id}:`)).map((j) => j.target.split(":")[1]);
  for (const label of labels) {
    if (!used.includes(label) && !scene.steps.some((s) => s.t === "jump" && s.label === label)) {
      warnings.push(`${scene.id} 里的标记 "${label}" 从来没有被跳转到`);
    }
  }
}

// 美术资源是否存在（缺图只会退化成渐变底色，所以是提示不是错误）
for (const src of bgFiles) {
  try { await access(path.join(root, src)); }
  catch { warnings.push(`缺少背景图：${src}（页面会先用渐变底色，不影响流程）`); }
}

// 输出
const sceneCount = Object.keys(scenes).length;
const stepCount = Object.values(scenes).reduce((n, s) => n + s.steps.length, 0);

// 人物立绘：有就用，没有也不影响跑通（名字要完全一致，见 docs/立绘需求.md）
const PORTRAITS = [
  "li-changhe-wary.png", "li-changhe-soft.png", "li-changhe-tired.png",
  "shitou-scared.png", "shitou-curious.png", "shitou-smile.png",
  "he-xiuying-calm.png", "he-xiuying-firm.png", "he-xiuying-sad.png",
];
let havePortrait = 0;
for (const f of PORTRAITS) {
  try { await access(path.join(root, "assets/char", f)); havePortrait++; } catch { /* 还没有 */ }
}

console.log(`检查完成：${sceneCount} 个场景 / ${stepCount} 个步骤 / ${Object.keys(lore).length} 张史料卡`);
console.log(`人物立绘：${havePortrait}/${PORTRAITS.length} 张${havePortrait === 0 ? "（还没有，规格和提示词见 docs/立绘需求.md）" : ""}`);
if (drafts.length) {
  console.log(`\n待团队定稿的补写内容（${drafts.length} 处）：`);
  for (const d of drafts) console.log("  · " + d);
}
if (warnings.length) {
  console.log(`\n提示（${warnings.length} 条）：`);
  for (const w of warnings) console.log("  - " + w);
}
if (errors.length) {
  console.error(`\n错误（${errors.length} 条）：`);
  for (const e of errors) console.error("  ✗ " + e);
  process.exit(1);
}
console.log("\n没有错误。");
