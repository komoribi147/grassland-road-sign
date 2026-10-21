import assert from "node:assert/strict";
import { cloudAiEnvironment } from "./deploy-ai.mjs";
import * as deployment from "./deploy-ai.mjs";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const secret = "sample-cloud-key-not-real";
const valid = { AI_API_KEY: secret, AI_MODEL: "lite" };
const env = cloudAiEnvironment(valid);
assert.equal(env.AI_API_KEY, secret);
assert.equal(env.AI_MODEL, "lite");
assert.equal(env.AI_BASE_URL, "https://spark-api-open.xf-yun.com/v1/chat/completions");
assert.throws(() => cloudAiEnvironment({ AI_API_KEY: "ollama", AI_MODEL: "qwen2.5:14b" }), /有效.*密钥/);
assert.throws(() => cloudAiEnvironment({ ...valid, AI_BASE_URL: "http://127.0.0.1:11434/v1/chat/completions" }), /HTTPS/);
assert.throws(() => cloudAiEnvironment({ ...valid, AI_BASE_URL: "https://localhost/v1/chat/completions" }), /公网/);
assert.throws(() => cloudAiEnvironment({ ...valid, AI_BASE_URL: `https://${secret}@example.com/api` }), /地址/);
assert.throws(() => cloudAiEnvironment({ AI_API_KEY: secret }), /模型名称/);
try { cloudAiEnvironment({ ...valid, AI_BASE_URL: `https://${secret}@example.com/api` }); }
catch (err) { assert.ok(!err.message.includes(secret), "配置错误不能把密钥打印到日志"); }
const deepseek = cloudAiEnvironment({ AI_API_KEY: secret, AI_MODEL: "deepseek-chat", AI_BASE_URL: "https://api.deepseek.com/v1/chat/completions" });
assert.equal(deepseek.AI_MODEL, "deepseek-chat");
console.log("云端配置通过：真实凭据要求、远端 HTTPS、模型名称和错误日志脱敏。");

// 部署边界必须收到原始 ZIP，避免 Windows 重打包丢掉启动文件执行权限。
assert.equal(typeof deployment.cloudAiCodeRequest, "function", "部署应直接提交已生成的 ZIP");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
assert.equal(spawnSync(process.execPath, ["tools/package-ai-function.mjs"], { cwd: root }).status, 0);
const zip = await readFile(path.join(root, "dist-ai-function.zip"));
const request = deployment.cloudAiCodeRequest({ envId: "test-env" }, zip);
assert.equal(request.EnvId, "test-env");
assert.equal(request.FunctionName, "grassland-ai");
assert.equal(request.InstallDependency, "FALSE");
assert.deepEqual(Buffer.from(request.Code.ZipFile, "base64"), zip, "上传包必须逐字节保留");
let found = false;
for (let at = 0; at < zip.length - 46; at++) {
  if (zip.readUInt32LE(at) !== 0x02014b50) continue;
  const name = zip.subarray(at + 46, at + 46 + zip.readUInt16LE(at + 28)).toString();
  if (name === "scf_bootstrap") {
    assert.equal((zip.readUInt32LE(at + 38) >>> 16) & 0o777, 0o755);
    found = true;
  }
}
assert.ok(found, "部署包缺少启动文件");

// 大请求通过文件进入 CLI 进程，避免 Windows 命令行长度限制和密钥出现在进程参数。
const privateDir = await mkdtemp(path.join(tmpdir(), "grassland-api-test-"));
try {
  const cli = path.join(privateDir, "cli.cjs");
  const bodyFile = path.join(privateDir, "body.json");
  await writeFile(cli, "process.stdout.write(JSON.stringify(process.argv.slice(2)))");
  await writeFile(bodyFile, JSON.stringify(request));
  const output = spawnSync(process.execPath, ["tools/cloud-api.mjs", cli, "tcb", "UpdateFunctionCode", bodyFile], { cwd: root, encoding: "utf8" });
  assert.equal(output.status, 0, output.stderr);
  const args = JSON.parse(output.stdout);
  assert.deepEqual(args.slice(0, 4), ["api", "tcb", "UpdateFunctionCode", "--body"]);
  assert.deepEqual(JSON.parse(args[4]), request);
} finally {
  await rm(privateDir, { recursive: true, force: true });
}
console.log("云端部署通过：原始 ZIP、启动执行权限、大请求文件传递。");
