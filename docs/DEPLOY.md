# 运行与发布

## 一、本地演示（最稳，推荐答辩时用）

```bash
node server/server.mjs
```

打开 <http://localhost:8787>。想接大模型，把 `server/.env.example` 复制成根目录的 `.env` 填好 Key。

优点：有 AI 实时对话、有音效、不受网络限制（除了大模型那一步）。
注意：`.env` 已经在 `.gitignore` 里，不会被提交，Key 不会泄露。

## 二、GitHub Pages（分享给评委扫二维码）

仓库里已经放好 `.github/workflows/pages.yml`，只要做一次性设置：

`Settings → Pages → Build and deployment → Source` 选 **GitHub Actions**。

以后每次往 main 合并，网站会自动更新，地址是：

```
https://<你的账号名>.github.io/grassland-road-sign/
```

Pages 版是纯静态的：**没有 AI 实时对话**，NPC 会用剧本里写好的兜底台词（体验依然完整）。想让人在线上也体验 AI，需要把 `server/` 部署到一台能跑 Node 的服务器上（下面第三节）。

## 三、带 AI 的线上版（可选）

需要一个能跑 Node.js 的环境，任选其一：

- 云服务器（腾讯云/阿里云轻量应用服务器，学生机便宜）
- Render / Railway 这类平台

部署时配置三个环境变量：

| 变量 | 值 |
| --- | --- |
| `AI_BASE_URL` | `https://spark-api-open.xf-yun.com/v1/chat/completions` |
| `AI_API_KEY` | 讯飞控制台的 APIPassword |
| `AI_MODEL` | 控制台里开通的版本，例如 `4.0Ultra` |

启动命令：`node server/server.mjs`（或 `npm start`）。

## 三之补充、三个 NPC 各用各的模型（推荐）

打开 `server/ai-config.json`，每个角色可以单独指定：

```json
"default":  { "model": "4.0Ultra", "apiKeyEnv": "AI_API_KEY", "temperature": 0.85 },
"characters": {
  "li-changhe":  { "temperature": 0.65, "apiKeyEnv": "AI_KEY_LAOBANZHANG" },
  "shitou":      { "model": "lite",     "temperature": 1.0,  "apiKeyEnv": "AI_KEY_SHITOU" },
  "he-xiuying":  { "temperature": 0.8,  "apiKeyEnv": "AI_KEY_HEXIUYING" }
}
```

`apiKeyEnv` 写的是**环境变量名**。这样三个人可以各申请一个讯飞账号，各填各的 Key，
额度互不占用，谁的角色就用谁的额度：

```
AI_API_KEY=组长备用Key
AI_KEY_LAOBANZHANG=同学A的APIPassword
AI_KEY_SHITOU=同学B的APIPassword
AI_KEY_HEXIUYING=同学C的APIPassword
```

某个角色没填自己的 Key，就自动用 `AI_API_KEY`。一个都没配也不会崩，只是改用剧本兜底台词。
启动时终端会打印每个 NPC 用的模型和有没有配上 Key，菜单里也能看到。

## 四、比赛现场 checklist

- [ ] 提前一天在比赛用的那台电脑上跑通 `node server/server.mjs`
- [ ] 提前准备好 `.env`，并且**单独测一次** AI 回答（有的会场网络访问不了外网）
- [ ] 准备 **#auto 自动演示**页面备用：`http://localhost:8787/#auto`
- [ ] 断网保险：万一没网，直接双击 `index.html`（离线兜底台词），照样能演示完整故事
- [ ] 录一段 3～5 分钟的完整录屏放在 U 盘里，作为最后兜底
- [ ] 音量：现场用笔记本喇叭时把音效调小，`菜单 → 音效`

## 五、讯飞星火 Key 怎么拿

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
