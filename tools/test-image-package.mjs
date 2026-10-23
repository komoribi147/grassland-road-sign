import assert from "node:assert/strict";
import { readFile, stat, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { IMAGE_ASSETS, IMAGE_RELEASE } from "../js/image-assets.js";

const root = path.resolve(import.meta.dirname, "..");
const referenced = new Set(["assets/stills/today-path-monument.png"]);
const collect = value => {
  if (typeof value === "string" && value.startsWith("assets/stills/")) referenced.add(value);
  else if (value && typeof value === "object") Object.values(value).forEach(collect);
};
for (const rel of JSON.parse(await readFile(path.join(root, "story/manifest.json"), "utf8")).scenes) {
  collect(JSON.parse(await readFile(path.join(root, rel), "utf8")));
}
let original = 0, full = 0, small = 0;
for (const source of referenced) {
  const image = IMAGE_ASSETS[source];
  assert.ok(image, `正式镜头缺少网页图：${source}`);
  original += (await stat(path.join(root, source))).size;
  for (const tier of ["full", "small"]) {
    assert.match(image[tier], /^assets\/optimized\/[a-z0-9-]+-[a-f0-9]{12}\.webp$/);
    const data = await readFile(path.join(root, image[tier]));
    assert.equal(data.toString("ascii", 0, 4), "RIFF");
    assert.equal(data.toString("ascii", 8, 12), "WEBP");
    assert.ok(image[tier].includes(createHash("sha256").update(data).digest("hex").slice(0, 12)), "文件内容变化必须带新地址");
    assert.equal(data.length, image[tier + "Bytes"]);
  }
  full += image.fullBytes;
  small += image.smallBytes;
}
assert.ok(full < original * .2, "高清网页图总体至少减少 80% 体积");
assert.ok(small < full, "手机小图不能比桌面总量更大");
execFileSync(process.execPath, ["tools/package-static.mjs"], { cwd: root, stdio: "pipe" });
for (const source of referenced) {
  for (const tier of ["full", "small"]) await access(path.join(root, "dist", IMAGE_ASSETS[source][tier]));
}
await assert.rejects(access(path.join(root, "dist/assets/stills")), "发布包不应携带高清原图");
console.log(`网页图与发布包通过：${referenced.size} 张，版本 ${IMAGE_RELEASE}，${(original / 1048576).toFixed(2)} → ${(full / 1048576).toFixed(2)} MiB；手机 ${(small / 1048576).toFixed(2)} MiB。`);
