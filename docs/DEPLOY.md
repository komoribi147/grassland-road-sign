# 运行与发布

## 一、本地演示（最稳，推荐答辩时用）

```bash
node server/server.mjs
```

打开 <http://localhost:8787>。本机免费模型可把 `server/.env.ollama.example` 复制成根目录的 `.env`；需要先运行 Ollama 并下载 `qwen2.5:14b`。Ollama 的本机接口不校验真实 API Key，模板里的 `ollama` 只是供现有服务器识别为已配置。

这台开发电脑已安装 `qwen2.5:14b`，项目根目录的 `.env` 已按此模板配置。启动服务后，菜单应显示三个角色均使用该模型；点“开口说话”可分别与在场人物交谈。`.env` 被 Git 忽略，不会进入静态网页打包。

如需改回讯飞云端模型，可用 `server/.env.example` 作为模板填写自己的 APIPassword。环境变量 `AI_MODEL` 会统一覆盖三个角色的模型名，但每人的性格、语气和独立对话记忆仍由原有设定控制。

优点：有 AI 实时对话、有音效、不受网络限制（除了大模型那一步）。
注意：`.env` 已经在 `.gitignore` 里，不会被提交，Key 不会泄露。

## 二、GitHub Pages（分享给评委扫二维码）

仓库里已经放好 `.github/workflows/pages.yml`，只要做一次性设置：

`Settings → Pages → Build and deployment → Source` 选 **GitHub Actions**。

以后每次往 main 合并，网站会自动更新，地址是：

```
https://<你的账号名>.github.io/grassland-road-sign/
```

Pages 网页通过 `js/site-config.js` 连接公开 AI 服务。当前云端已接入 DeepSeek，三名角色两类接口的真实回答已实测通过；网页交互验收状态见 [公网接入记录](PUBLIC_AI_DEPLOYMENT.md)。

## 三、中国大陆访问版（腾讯云 CloudBase）

测试站已部署在上海环境 `grassland-road-sign-d8bdfce86570`，地址是：

<https://grassland-road-sign-d8bdfce86570-1453404640.tcloudbaseapp.com/>

CloudBase 从本仓库公开的 `main` 分支运行 `npm run package:static`，将生成的 `dist/` 部署到网站根目录 `/`。网页已连接公开 DeepSeek 服务；服务不可用时使用剧本兜底台词。云函数维护步骤见第四节。

队员更新 GitHub 后，进入 CloudBase 控制台的 **静态网站托管 → 网站部署 → grassland-road-sign → 更新服务**，选择 **公开仓库部署**，填写本仓库地址并选择 `main`，保持构建命令和目录不变，再部署一次。目前尚未配置自动发布，GitHub 推送本身不会自动更新测试站。

仓库也准备了自动发布流程：`.github/workflows/cloudbase.yml`。它会把网页、剧情和素材打包到 `dist/`，再上传到 CloudBase 静态网站托管。若要改为每次推送 `main` 自动部署，需要先给 GitHub Actions 配置权限受限的腾讯云密钥；未设置密钥时，工作流只打包，不会发布。

若要启用 GitHub Actions 自动发布，在 GitHub 仓库的 `Settings → Secrets and variables → Actions` 添加三个仓库密钥：

| 密钥名 | 从哪里取得 |
| --- | --- |
| `TCB_SECRET_ID` | 腾讯云访问管理中的 API 密钥 SecretId |
| `TCB_SECRET_KEY` | 同一组 API 密钥的 SecretKey |
| `TCB_ENV_ID` | CloudBase 环境 ID |

密钥只放在 GitHub Secrets，不要写进代码或发到聊天里。建议为部署单独创建权限受限的腾讯云密钥。设置完成后，往 `main` 推送代码就会自动更新中国大陆版；也可以在 GitHub 的 Actions 页面手动运行发布流程。首次成功发布后，CloudBase 会提供访问地址。

CloudBase 静态托管集成 CDN 和 HTTPS。默认域名可以先用来试访问，官方建议正式使用绑定自己的域名；如果网站托管在中国大陆并使用自定义域名，需要先完成 ICP 备案。备案和域名要由域名/云账号持有人在控制台办理。

当前静态网站打包后约 265 MB，主要是 98 张独立剧情镜头及样张图片。人物立绘仍保存在仓库，但剧情暂不加载，静态发布包也不包含。网页按剧情进度加载镜头；CDN 可以减少跨地区访问延迟，但不能消除高清文件的下载流量。后续可在保留原始 PNG 的前提下制作高质量 WebP/AVIF 发布版本，进一步减小移动网络流量。免费体验版的默认域名只供开发测试，会显示访问提示，也有访问频率限制；正式公开使用需要合规的自定义域名和备案资源。

## 四、CloudBase 线上 AI（已部署 DeepSeek）

网页继续用静态托管，角色请求交给同一 CloudBase 环境中的 HTTP 云函数。**密钥只填云函数的环境变量，不写入 GitHub、静态网页或 `js/site-config.js`。**

1. 现有环境已有 `grassland-ai` HTTP 云函数与 `/api` 公开路由，无需重复创建。函数使用 Node.js 20.19、监听 `9000` 端口。
2. 将 `server/.env.cloud.example` 复制为根目录 `.env.cloud`，填写所选云端模型的以下配置。此文件已被 Git 忽略，保留原有本地 Ollama 配置。星火 Lite 需要先在讯飞开放平台开通并取得该版本的 APIPassword；免费用量和并发以平台规则为准。

| 变量 | 值 |
| --- | --- |
| `AI_API_KEY` | DeepSeek 开放平台的 API Key |
| `AI_MODEL` | `deepseek-chat`，覆盖三个角色原先各自的模型名 |
| `AI_BASE_URL` | `https://api.deepseek.com/v1/chat/completions` |

3. 运行 `npm run deploy:ai`。脚本打包 API、人设与配置，通过云端 API 上传原始 ZIP 并更新云函数环境变量。ZIP 保留启动脚本执行权限，不含 `.env`；密钥不进入网页、Git 或系统进程参数。
4. 运行 `npm run check:public-ai -- --live`，验证两类接口收到三名角色的真实回答；随后从公开网页实际提问。**仅健康检查显示已配置不能证明模型有效。**

来源白名单及网关跨域分工已配置在 `cloudbaserc.json`。默认路由去掉 `/api` 前缀，服务兼容转发前后的两种路径。现有按 IP 限制为每实例每分钟 12 次，尚无持久化总用量上限；扩大开放前需结合模型平台额度和网关能力控制总用量。

CloudBase 默认域名有访问提示和频率限制；若面向大量访客长期开放，需要按云平台要求配置正式域名及相应资源。

## 四之补充、三个 NPC 各用各的模型

打开 `server/ai-config.json`，每个角色可以单独指定：

```json
"default":  { "model": "4.0Ultra", "apiKeyEnv": "AI_API_KEY", "temperature": 0.85 },
"characters": {
  "li-changhe":  { "temperature": 0.65, "apiKeyEnv": "AI_KEY_LAOBANZHANG" },
  "shitou":      { "model": "lite",     "temperature": 1.0,  "apiKeyEnv": "AI_KEY_SHITOU" },
  "he-xiuying":  { "temperature": 0.8,  "apiKeyEnv": "AI_KEY_HEXIUYING" }
}
```

`apiKeyEnv` 写的是**环境变量名**。若以后改用不同模型，三个人可以各申请一个讯飞账号，各填各的 Key，
额度互不占用，谁的角色就用谁的额度：

```
AI_API_KEY=组长备用Key
AI_KEY_LAOBANZHANG=同学A的APIPassword
AI_KEY_SHITOU=同学B的APIPassword
AI_KEY_HEXIUYING=同学C的APIPassword
```

某个角色没填自己的 Key，就自动用 `AI_API_KEY`。设置 `AI_MODEL=lite` 时，三个角色都用 Lite，但仍各自保留不同人设、语气和对话记忆。一个 Key 都没配时会改用剧本兜底台词。
启动时终端会打印每个 NPC 用的模型和有没有配上 Key，菜单里也能看到。

## 五、比赛现场 checklist

- [ ] 提前一天在比赛用的那台电脑上跑通 `node server/server.mjs`
- [ ] 提前准备好 `.env`，并且**单独测一次** AI 回答（有的会场网络访问不了外网）
- [ ] 准备 **#auto 自动演示**页面备用：`http://localhost:8787/#auto`
- [ ] 断网保险：提前生成**单文件版**（双击 `3-生成单文件版.bat`），它是独立的 HTML，
      双击就玩，不需要服务器也不需要网络。⚠️ 直接双击 `index.html` 是打不开的
      （浏览器禁止本地网页读取剧情数据），别到时候才发现
- [ ] 录一段 3～5 分钟的完整录屏放在 U 盘里，作为最后兜底
- [ ] 音量：现场用笔记本喇叭时把音效调小，`菜单 → 音效`

## 六、讯飞星火 Key 怎么拿

1. 打开 <https://console.xfyun.cn>，注册/登录。
2. 找到 **星火认知大模型**，创建一个应用。
3. 在应用详情里找到 **服务接口认证信息**，里面有 `APIPassword`（有的界面写作 `APIKey:APISecret` 拼起来的串）。
4. 把这个串填进 `.env` 的 `AI_API_KEY`，`AI_MODEL` 填控制台里显示的版本号。
5. 重启 `node server/server.mjs`，打开网页右上角"菜单"，应显示 **AI 状态：在线**。

> 免费额度用完或 Key 失效时，网页不会有异常，只会自动回到剧本兜底台词——演示不会崩。

### 注意：代理软件会拦住国内大模型

星火、通义这些接口都在国内。如果电脑上开着代理软件的**全局模式**（所有流量都走境外节点），
请求会从国外绕一圈出去，接口大概率直接失败。实测现象是连接被重置、或者一直转圈。

解决办法二选一：

- 把代理切到**规则模式**（国内直连、国外走代理），这是最省事的做法；
- 或者在代理软件里把 `spark-api-open.xf-yun.com`、`dashscope.aliyuncs.com` 加进直连名单。

判断方法：终端里跑 `curl -o NUL -w "%{http_code}\n" https://spark-api-open.xf-yun.com/`，
返回 `404` 或 `401` 都说明通了，`000` 就是没通。

### 用钱的纪律

这个项目是学生作品，**能白嫖就白嫖**：

- 大模型对话：讯飞开放平台的星火有免费额度，够开发期用。
- 背景图 / 立绘：优先用即梦、通义万相网页版、豆包的**每日免费次数**。
- 识图（验收图片有没有画错）：`claude-vision-skill` 走的是百炼的免费额度，可以放心用。
- **任何会产生费用的调用，先问组长。** 每个人用自己的账号时，各自看好自己的额度。
