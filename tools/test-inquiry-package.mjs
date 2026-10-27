import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const root = new URL("..", import.meta.url);
execFileSync(process.execPath, ["tools/package-static.mjs"], { cwd: root, stdio: "pipe" });
for (const page of ["inquiry.html", "teacher-review.html"]) {
const html = await readFile(new URL("../dist/" + page, import.meta.url), "utf8");
const files = [...html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^\"]*)?"/g)].map(match => match[1]).filter(value => !/^(?:https?:|data:)/.test(value));
for (const file of new Set(files)) {
  const exists = await access(new URL("../dist/" + file, import.meta.url)).then(() => true, () => false);
  assert.ok(exists, "静态探究页引用的资源必须发布：" + file);
}
}
console.log("探究静态包通过：主图、样式、脚本、返回故事及教师活动单均已包含。");
