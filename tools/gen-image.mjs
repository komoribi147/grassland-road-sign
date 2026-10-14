#!/usr/bin/env node
// 一键出图：调用阿里云百炼的通义万相生成背景图 / 立绘。
//
//   node tools/gen-image.mjs "提示词" assets/bg/prologue-marsh-dusk.jpg
//   node tools/gen-image.mjs "提示词" 立绘.png 1024*1024
//
// 需要先在项目根目录的 .env 里填 DASHSCOPE_API_KEY（阿里云百炼的 Key）。
// 提示词怎么写，见 docs/ART_GUIDE.md 第三节。
//
// 注意：这一步会消耗阿里云的额度（约几毛钱一张）。生成的图请务必人工过一眼，
// 按 ART_GUIDE 里那四条检查：有没有文字、手脚有没有崩、有没有现代物件、衣服对不对。

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
try { process.loadEnvFile(path.join(root, ".env")); } catch { /* 没有 .env 就跳过 */ }

const key = process.env.DASHSCOPE_API_KEY || "";
const [prompt, outPath, size = "1280*720", model = "wanx2.1-t2i-turbo"] = process.argv.slice(2);

// 通义万相很喜欢在画面角落加落款和印章，光在正面提示词里写"不要文字"没用，
// 必须用负向提示词压住。实测有效。
const NEGATIVE = "文字,字母,签名,落款,题字,印章,红章,水印,logo,边框,画框,"
  + "现代物件,拉链,眼镜,塑料,手表,六根手指,畸形的手,畸形的脚,多余肢体";

if (!prompt || !outPath) {
  console.error('用法: node tools/gen-image.mjs "提示词" 输出路径 [尺寸，默认 1280*720]');
  process.exit(1);
}
if (!key) {
  console.error("缺少 DASHSCOPE_API_KEY。把 server/.env.example 复制成 .env，填上百炼的 Key。");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const api = "https://dashscope.aliyuncs.com/api/v1";

const submit = await fetch(`${api}/services/aigc/text2image/image-synthesis`, {
  method: "POST",
  headers: { ...headers, "X-DashScope-Async": "enable" },
  body: JSON.stringify({
    model,
    input: { prompt, negative_prompt: NEGATIVE },
    parameters: { size, n: 1, prompt_extend: true },
  }),
});
const submitText = await submit.text();
if (!submit.ok) {
  console.error(`提交失败（${submit.status}）：${submitText.slice(0, 400)}`);
  console.error("提示：如果报网络错误，多半是代理软件开着全局模式，见 docs/DEPLOY.md。");
  process.exit(1);
}
const taskId = JSON.parse(submitText).output?.task_id;
console.log(`任务已提交：${taskId}（约 10 秒）`);

let url = "";
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const res = await fetch(`${api}/tasks/${taskId}`, { headers });
  const data = await res.json();
  const status = data.output?.task_status;
  if (status === "SUCCEEDED") { url = data.output?.results?.[0]?.url || ""; break; }
  if (status === "FAILED") {
    console.error(`生成失败：${JSON.stringify(data.output).slice(0, 400)}`);
    process.exit(1);
  }
  process.stdout.write(".");
}
if (!url) { console.error("\n超时，任务可能还在跑，稍后可以重试。"); process.exit(1); }

const img = await fetch(url);
const buf = Buffer.from(await img.arrayBuffer());
const abs = path.isAbsolute(outPath) ? outPath : path.join(root, outPath);
await mkdir(path.dirname(abs), { recursive: true });
await writeFile(abs, buf);
console.log(`\n已保存：${abs}（${Math.round(buf.length / 1024)} KB）`);
console.log("别忘了人工过一眼：有没有文字、手脚有没有崩、有没有现代物件。");
