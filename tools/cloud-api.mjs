// 从私有文件读取请求体，在进程内传给已登录的 CLI；密钥不会进入系统命令行。
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const [, , cli, service, action, bodyFile] = process.argv;
if (!cli || !service || !action || !bodyFile) throw new Error("缺少云端 API 请求参数。");
const body = JSON.stringify(JSON.parse(await readFile(bodyFile, "utf8")));
process.argv = [process.execPath, cli, "api", service, action, "--body", body, "--json"];
await import(pathToFileURL(cli).href);
