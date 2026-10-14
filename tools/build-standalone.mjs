#!/usr/bin/env node
// 打包成"单文件版"：把剧情、图片、音频、代码全部塞进一个 HTML。
// 生成的这个文件双击就能玩（不需要服务器、不需要联网），可以直接微信发给别人。
//
//   node tools/build-standalone.mjs D:\讯飞杯\草地上的路标-单文件版.html
//
// 为什么不直接双击 index.html？因为浏览器禁止本地网页（file://）加载 js 模块和剧情 JSON。
// 这个脚本就是把这个限制绕过去：全部内联成一个文件。

import { readFile, writeFile } from "node:fs/promises";
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

// 背景图：直接换成 data URI，塞进每一幕的 bg / bg 步骤里
let imgCount = 0;
for (const rel of manifest.scenes) {
  const scene = JSON.parse(await read(rel));
  const swap = async (obj) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      if ((k === "bg" || k === "src") && typeof v === "string" && v.startsWith("assets/")) {
        obj[k] = await toDataURI(v);
        imgCount++;
      } else if (typeof v === "object") {
        await swap(v);
      }
    }
  };
  await swap(scene);
  files[rel] = scene;
}

// 音频：单独放一张表，audio.js 里会优先查这张表
const audioNames = ["rain", "sfx-splash", "sfx-bugle", "sfx-shout"];
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
for (const f of ["js/save.js", "js/audio.js", "js/ai.js", "js/engine.js", "js/main.js"]) {
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

// 让音频去找内联的那份，而不是去请求 mp3 文件
bundle = bundle.replace(
  "new Audio(`assets/audio/${name}.mp3`)",
  "new Audio((window.__AUDIO__ && window.__AUDIO__[name]) || `assets/audio/${name}.mp3`)"
);
bundle = bundle.replace(
  "new Audio(`assets/audio/sfx-${name}.mp3`)",
  "new Audio((window.__AUDIO__ && window.__AUDIO__[\"sfx-\" + name]) || `assets/audio/sfx-${name}.mp3`)"
);

// 拦掉剧情 JSON 的网络请求，改成读内存里的数据（图片和音频已经是 data URI，不用管）
const inline = `
window.__AUDIO__ = ${JSON.stringify(audio)};
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
  /<script type="module" src="js\/main\.js"><\/script>/,
  `<script type="module">\n${inline}\n${bundle}\n</script>`
);
html = html.replace("<title>", "<title>（单文件版）");

await writeFile(outPath, html, "utf8");
const kb = Math.round(Buffer.byteLength(html, "utf8") / 1024);
console.log(`已生成：${outPath}`);
console.log(`大小：${kb} KB（内联了 ${imgCount} 张背景图、${Object.keys(audio).length} 个音频文件）`);
console.log("这个文件双击就能玩，可以直接发给别人。");
