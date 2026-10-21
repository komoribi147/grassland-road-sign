// 模型密钥只进入临时部署配置和云函数环境，不改写可提交的 cloudbaserc.json。
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as wait } from "node:timers/promises";

const deploymentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function cloudAiEnvironment(input) {
  const key = String(input.AI_API_KEY || "").trim();
  if (key.length < 8 || /^(ollama|mock-key|your[_-]?key|填.*密钥)$/i.test(key)) throw new Error("请在 .env.cloud 填写有效的云端模型密钥。");
  const model = String(input.AI_MODEL || "").trim();
  if (!model) throw new Error("请在 .env.cloud 填写模型名称 AI_MODEL。");
  let base;
  try { base = new URL(input.AI_BASE_URL || "https://spark-api-open.xf-yun.com/v1/chat/completions"); }
  catch { throw new Error("模型地址 AI_BASE_URL 无效。"); }
  if (base.username || base.password || base.search || base.hash) throw new Error("模型地址不能包含账号、密钥或查询参数。");
  if (base.protocol !== "https:") throw new Error("云端模型必须使用 HTTPS 地址。");
  if (/^(localhost|127\.|\[::1\])|\.localhost$|\.local$/i.test(base.hostname)) throw new Error("云端必须使用可访问的公网模型，不能使用本机地址。");
  return { AI_API_KEY: key, AI_MODEL: model, AI_BASE_URL: base.href };
}

export function cloudAiCodeRequest(config, zip) {
  if (!config.envId) throw new Error("缺少 CloudBase 环境编号。");
  if (!Buffer.isBuffer(zip) || zip.length < 4 || zip.readUInt32LE(0) !== 0x04034b50) throw new Error("云函数 ZIP 无效。");
  if (zip.length > 1.5 * 1024 * 1024) throw new Error("云函数 ZIP 超过 API 上传大小限制。");
  return { EnvId: config.envId, FunctionName: "grassland-ai", InstallDependency: "FALSE", Code: { ZipFile: zip.toString("base64") } };
}

async function deployCloudAi() {
  const envPath = path.resolve(deploymentRoot, process.argv[2] || (existsSync(path.join(deploymentRoot, ".env.cloud")) ? ".env.cloud" : ".env"));
  const input = parseEnv(await readFile(envPath, "utf8"));
  const modelEnv = cloudAiEnvironment(input);
  const config = JSON.parse(await readFile(path.join(deploymentRoot, "cloudbaserc.json"), "utf8"));
  const fn = config.functions.find((entry) => entry.name === "grassland-ai");
  if (!fn) throw new Error("cloudbaserc.json 缺少 grassland-ai 配置。");
  fn.envVariables = { ...fn.envVariables, ...modelEnv };
  const cliPath = path.join(process.env.APPDATA || "", "npm/node_modules/@cloudbase/cli/bin/tcb");
  if (!existsSync(cliPath)) throw new Error("未找到已安装的 CloudBase CLI，请先安装并登录。");
  const privateDir = await mkdtemp(path.join(tmpdir(), "grassland-ai-deploy-"));
  const run = (args) => {
    const result = spawnSync(process.execPath, args, { cwd: deploymentRoot, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
    const safeOutput = String(result.stdout || "") + String(result.stderr || "");
    process.stdout.write(safeOutput.split(modelEnv.AI_API_KEY).join("[REDACTED]"));
    if (result.error || result.status !== 0) {
      const err = new Error("云端部署步骤未成功，请检查上述已脱敏日志。");
      err.updating = /ResourceInUse\.Function|FailedOperation\.FunctionUpdating|函数.*更新中/i.test(safeOutput);
      throw err;
    }
  };
  const call = async (action, body) => {
    const bodyFile = path.join(privateDir, `${action}.json`);
    await writeFile(bodyFile, JSON.stringify(body), { mode: 0o600 });
    for (let attempt = 0; ; attempt++) {
      try {
        run([path.join(deploymentRoot, "tools/cloud-api.mjs"), cliPath, "tcb", action, bodyFile]);
        break;
      } catch (err) {
        if (!err.updating || attempt >= 5) throw err;
        await wait(2000);
      }
    }
  };
  try {
    run([path.join(deploymentRoot, "tools/package-ai-function.mjs")]);
    await call("UpdateFunctionCode", cloudAiCodeRequest(config, await readFile(path.join(deploymentRoot, "dist-ai-function.zip"))));
    // 更新代码与环境配置分两步；平台短暂更新中时，仅重试其明确返回的状态冲突。
    await call("UpdateFunctionConfiguration", {
      EnvId: config.envId, FunctionName: fn.name,
      Environment: { Variables: Object.entries(fn.envVariables).map(([Key, Value]) => ({ Key, Value })) },
    });
    console.log("模型配置已写入云端。还需从公开网页验证三个角色实际回答，才能确认 AI 接通。");
  } finally {
    await rm(privateDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  deployCloudAi().catch((err) => { console.error(err.message); process.exitCode = 1; });
}
