import assert from "node:assert/strict";
import { imageSource, visualLayout } from "../js/visual-delivery.js";

const assets = { "assets/stills/scene.png": { full: "full.webp", small: "small.webp" } };
assert.equal(imageSource("assets/stills/scene.png", { width: 390, dpr: 2 }, assets), "small.webp");
assert.equal(imageSource("assets/stills/scene.png", { width: 1440, dpr: 1 }, assets), "full.webp");
assert.equal(imageSource("assets/stills/scene.png", { width: 844, dpr: 2 }, assets), "full.webp",
  "旋转为横屏后应按需要升级清晰度");
assert.equal(imageSource("data:image/webp;base64,abc", { width: 390 }, assets), "data:image/webp;base64,abc");
assert.equal(imageSource("assets/missing.png", { width: 390 }, assets), "assets/missing.png");

const frame = { x: 0, y: 0, w: 1664, h: 941 };
for (const [width, height] of [[320, 568], [390, 844], [768, 1024]]) {
  const result = visualLayout(frame, width, height, { portrait: true, top: 88, bottom: height * .58 });
  assert.deepEqual(result.source, frame, "竖屏保留完整镜头，不能裁去两侧人物和动作");
  const d = result.destination;
  assert.ok(d.x >= 0 && d.y >= 88 && d.x + d.w <= width + .01 && d.y + d.h <= height * .58 + .01);
  assert.ok(Math.abs(d.w / d.h - frame.w / frame.h) < .0001, "手机画面不能拉伸");
}
const wide = visualLayout(frame, 1600, 900);
assert.deepEqual(wide.destination, { x: 0, y: 0, w: 1600, h: 900 });
assert.ok(wide.source.w <= frame.w && wide.source.h <= frame.h);
// 剧本指定的细节近景必须保留，不能又回到整张原图。
const detail = { x: 100, y: 200, w: 700, h: 400 };
assert.deepEqual(visualLayout(detail, 390, 844, { portrait: true, top: 88, bottom: 480 }).source, detail);
console.log("图片分辨率选择、竖屏完整构图、横屏取景与细节镜头通过。");
