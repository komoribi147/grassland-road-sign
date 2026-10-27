#!/usr/bin/env node
// CloudBase HTTP 云函数只需 API 服务、人设和配置；不要打包 .env 或网页素材。
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, "dist-ai-function");
if (!out.startsWith(root + path.sep)) throw new Error("Refusing to write outside the project");

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, "server"), { recursive: true });
await mkdir(path.join(out, "story"), { recursive: true });
await mkdir(path.join(out, "js"), { recursive: true });
await copyFile(path.join(root, "server/inquiry-service.mjs"), path.join(out, "server/inquiry-service.mjs"));
await copyFile(path.join(root, "js/inquiry.js"), path.join(out, "js/inquiry.js"));
await copyFile(path.join(root, "story/inquiry.json"), path.join(out, "story/inquiry.json"));
await copyFile(path.join(root, "story/lore.json"), path.join(out, "story/lore.json"));
await copyFile(path.join(root, "server/server.mjs"), path.join(out, "server/server.mjs"));
await copyFile(path.join(root, "server/voice-service.mjs"), path.join(out, "server/voice-service.mjs"));
await copyFile(path.join(root, "server/synthesize-voice.py"), path.join(out, "server/synthesize-voice.py"));
await copyFile(path.join(root, "server/synthesize-clone.py"), path.join(out, "server/synthesize-clone.py"));
await copyFile(path.join(root, "server/ai-config.json"), path.join(out, "server/ai-config.json"));
await copyFile(path.join(root, "story/characters.json"), path.join(out, "story/characters.json"));
await copyFile(path.join(root, "story/voices.json"), path.join(out, "story/voices.json"));
await writeFile(path.join(out, "package.json"), JSON.stringify({
  name: "grassland-road-sign-ai",
  private: true,
  type: "module",
  scripts: { start: "node server/server.mjs" },
}, null, 2) + "\n");
const bootstrap = path.join(out, "scf_bootstrap");
await writeFile(bootstrap, "#!/bin/sh\nPORT=9000 node server/server.mjs\n", { encoding: "utf8" });

// Windows 打包工具会丢掉可执行位；这里生成一个小型 ZIP，并把启动脚本标记为 755。
const files = ["package.json", "scf_bootstrap", "server/server.mjs", "server/inquiry-service.mjs", "js/inquiry.js", "story/inquiry.json", "story/lore.json", "server/voice-service.mjs", "server/synthesize-voice.py", "server/synthesize-clone.py", "server/ai-config.json", "story/characters.json", "story/voices.json"];
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data) {
  let c = 0xffffffff;
  for (const byte of data) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const localParts = [];
const centralParts = [];
let offset = 0;
for (const name of files) {
  const nameBytes = Buffer.from(name);
  const data = await readFile(path.join(out, name));
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  localParts.push(local, nameBytes, data);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4); // UNIX zip entry
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(((name === "scf_bootstrap" ? 0o100755 : 0o100644) << 16) >>> 0, 38);
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, nameBytes);
  offset += local.length + nameBytes.length + data.length;
}
const centralSize = centralParts.reduce((n, part) => n + part.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);
await writeFile(path.join(root, "dist-ai-function.zip"), Buffer.concat([...localParts, ...centralParts, end]));
console.log("CloudBase AI function prepared: dist-ai-function.zip (no .env included).");
