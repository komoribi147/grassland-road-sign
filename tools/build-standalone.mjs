#!/usr/bin/env node
// 打包成"单文件版"：把剧情、图片、音频、代码全部塞进一个 HTML。
// 生成的这个文件双击就能玩（不需要服务器、不需要联网），可以直接微信发给别人。
//
//   node tools/build-standalone.mjs D:\讯飞杯\草地上的路标-单文件版.html
//
// 为什么不直接双击 index.html？因为浏览器禁止本地网页（file://）加载 js 模块和剧情 JSON。
// 这个脚本就是把这个限制绕过去：全部内联成一个文件。

import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outPath = process.argv[2] || path.join(root, "..", "草地上的路标-单文件版.html");
const read = (rel) => readFile(path.join(root, rel), "utf8");

const mime = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg" };
const toDataURI = async (rel) => {
  const buf = await readFile(path.join(root, rel));
  const ext = path.extname(rel).toLowerCase();
  return `data:${mime[ext] || "application/octet-stream"};base64,${buf.toString("base64")}`;
};

// ---------- 1. 剧情数据 ----------
const manifest = JSON.parse(await read("story/manifest.json"));
const characters = JSON.parse(await read("story/characters.json"));
const lore = JSON.parse(await read("story/lore.json"));

const files = {
  "story/manifest.json": manifest,
  "story/characters.json": characters,
  "story/lore.json": lore,
};
const storyboardPaths = new Set();
const standaloneVisuals = new Set();

// 背景图：直接换成 data URI，塞进每一幕的 bg / bg 步骤里
let imgCount = 0;
for (const rel of manifest.scenes) {
  const scene = JSON.parse(await read(rel));
  const swap = async (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      if ((k === "bg" || k === "src") && typeof v === "string" && v.startsWith("assets/")) {
        obj[k] = await toDataURI(v);
        if (v.startsWith("assets/storyboards/")) standaloneVisuals.add(v);
        else imgCount++;
      } else if (typeof v === "object") {
        await swap(v);
      } else if (k === "sheet" && typeof v === "string" && v.startsWith("assets/storyboards/")) {
        storyboardPaths.add(v);
      }
    }
  };
  await swap(scene);
  files[rel] = scene;
}

// 分镜格在剧情里会反复引用同一张图：每张只内联一次，避免单文件膨胀几十倍。
const storyboards = {};
for (const rel of storyboardPaths) storyboards[rel] = await toDataURI(rel);

// 本地单文件也带上人物立绘；网上版仍按普通文件路径加载。
const portraits = {};
for (const name of (await readdir(path.join(root, "assets/char"))).filter((f) => /\.(png|webp)$/i.test(f))) {
  const rel = `assets/char/${name}`;
  portraits[rel] = await toDataURI(rel);
}

// 音频：自动扫描 assets/audio 下所有 mp3，key 就是文件名（不含扩展名），
// audio.js 里会优先查这张表。以前这里写死了四个名字，加音效就会漏掉。
const audioDir = path.join(root, "assets/audio");
let audioNames = [];
try {
  audioNames = (await readdir(audioDir)).filter((f) => f.toLowerCase().endsWith(".mp3"))
    .map((f) => f.slice(0, -4));
} catch { /* 没有音频目录 */ }
const audio = {};
for (const n of audioNames) {
  const rel = `assets/audio/${n}.mp3`;
  try {
    audio[n] = await toDataURI(rel);
  } catch { /* 没有这个文件就跳过 */ }
}

// ---------- 2. 代码 ----------
const stripModule = (src) => src
  .replace(/^\s*import\s+.*?;\s*$/gm, "")
  .replace(/^export\s+(class|const|function|let)\s/gm, "$1 ");

const parts = [];
for (const f of ["js/save.js", "js/audio.js", "js/ai.js", "js/sheet-geometry.js", "js/engine.js", "js/main.js"]) {
  parts.push(`/* ===== ${f} ===== */\n` + stripModule(await read(f)));
}
let bundle = parts.join("\n\n");

// 几个文件都写了 const $ = (id) => ... ，合并后会「重复声明」。
// 它们定义完全一样，保留第一份、删掉其余即可。
let firstDollar = true;
bundle = bundle.split("\n").filter((line) => {
  if (/^const \$ = \(id\) => document\.getElementById\(id\);/.test(line.trim())) {
    if (firstDollar) { firstDollar = false; return true; }
    return false;
  }
  return true;
}).join("\n");

// 让音频去找内联的那份，而不是去请求 mp3 文件。
// audio.js 里有三处拼路径：预热、环境音循环、一次性音效，三处都要改。
const swaps = [
  {
    find: "new Audio(`assets/audio/${name}.mp3`)",
    to: "new Audio((window.__AUDIO__ && window.__AUDIO__[name]) || `assets/audio/${name}.mp3`)",
    what: "环境音循环",
  },
  {
    find: "new Audio(`assets/audio/sfx-${name}.mp3`)",
    to: 'new Audio((window.__AUDIO__ && window.__AUDIO__["sfx-" + name]) || `assets/audio/sfx-${name}.mp3`)',
    what: "一次性音效",
  },
];
for (const s of swaps) {
  if (!bundle.includes(s.find)) console.warn(`⚠️ 没找到「${s.what}」的路径写法，单文件版里这段可能还是去请求文件`);
  bundle = bundle.split(s.find).join(s.to);
}

// 预热那段是把三种前缀拼成 url，也要换成查表
const warmOld = /const url = kind === "bgm"[\s\S]*?assets\/audio\/sfx-\$\{name\}\.mp3`;/;
if (warmOld.test(bundle)) {
  bundle = bundle.replace(warmOld, () =>
    'const __pre = kind === "bgm" ? "bgm-" : kind === "ambient" ? "" : "sfx-";\n' +
    '        const url = (window.__AUDIO__ && window.__AUDIO__[__pre + name]) || `assets/audio/${__pre}${name}.mp3`;'
  );
} else {
  console.warn("⚠️ 没找到「音画预热」的路径写法，单文件版里这段可能还是去请求文件");
}

// 拦掉剧情 JSON 的网络请求，改成读内存里的数据（图片和音频已经是 data URI，不用管）
const inline = `
window.__AUDIO__ = ${JSON.stringify(audio)};
window.__STORYBOARDS__ = ${JSON.stringify(storyboards)};
window.__PORTRAITS__ = ${JSON.stringify(portraits)};
const __FILES__ = ${JSON.stringify(files)};
const __origFetch = window.fetch.bind(window);
window.fetch = function (url, opts) {
  const key = String(url).replace(/^\\.\\//, "");
  if (Object.prototype.hasOwnProperty.call(__FILES__, key)) {
    return Promise.resolve(new Response(JSON.stringify(__FILES__[key]), {
      headers: { "Content-Type": "application/json" },
    }));
  }
  return __origFetch(url, opts);
};
`;

// ---------- 3. 组装 HTML ----------
let html = await read("index.html");
const css = await read("css/style.css");
html = html.replace(/<link rel="stylesheet"[^>]*>/, `<style>\n${css}\n</style>`);
html = html.replace(
  /<script type="module" src="js\/main\.js(?:\?[^\"]*)?"><\/script>/,
  `<script type="module">\n${inline}\n${bundle}\n</script>`
);
html = html.replace("<title>", "<title>（单文件版）");

await writeFile(outPath, html, "utf8");
const kb = Math.round(Buffer.byteLength(html, "utf8") / 1024);
console.log(`已生成：${outPath}`);
console.log(`大小：${kb} KB（内联了 ${imgCount} 张背景图、${storyboardPaths.size + standaloneVisuals.size} 张分镜与独立画面、${Object.keys(portraits).length} 张立绘、${Object.keys(audio).length} 个音频文件）`);
console.log("这个文件双击就能玩，可以直接发给别人。");
