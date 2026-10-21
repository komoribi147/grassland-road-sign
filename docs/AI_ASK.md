# 自由提问 · AI 接入说明

## 这是什么

在对话卡右上角增加「自由提问」入口。玩家可以就当前场景向**当前在场人物**提问：

- 只允许选择当前在场人物；
- 每个人物有独立问答记忆（`engine.state.askMemory[npc]`），不会串；
- 回答只显示在提问面板，不推进主线、不改信任值、不写入主线选择；
- 关闭面板回到原来那一句/那组选项；
- 知识截止当前幕/步：不能提未来、结局、人物生死、胜负；
- 问未来只能做人物主观判断；
- 禁用现代词：提示词 + 生成后检查，命中重试一次，仍命中回退人物台词；
- 模型不可用或缺少 Key 时自动回退剧本台词。

前端文件：`js/ask.js`、`css/ask.css`；入口在 `js/main.js` 的 `initAsk(engine)`。

## 本地运行

```bash
cp .env.example .env
# 填写 DeepSeek（或任意 OpenAI 兼容）配置
node server/server.mjs
# 打开 http://localhost:8787
```

`.env` 示例：

```env
AI_BASE_URL=https://api.deepseek.com/v1/chat/completions
AI_API_KEY=你的Key
AI_MODEL=deepseek-chat
```

`.env` 已在 `.gitignore` 中，不要提交。

## 为什么 GitHub Pages 上按钮会隐藏

`js/ask.js` 启动时会请求 `api/health`：

- 返回 `ai: true` 才显示「自由提问」；
- GitHub Pages 是静态托管，没有 `/api/ask`，健康检查失败，按钮隐藏，不会出现“点了没反应”；
- 部署好后端后，把 `js/site-config.js` 的 `window.__AI_API_BASE__` 指到后端地址，按钮会自动出现。

## 部署到腾讯云 CloudBase HTTP 云函数

`server/server.mjs` 已经是零依赖 Node 服务，监听 `PORT`，并包含 `/api/health`、`/api/npc`、`/api/ask`。

打包：

```bash
npm run package:ai
# 生成 dist-ai-function.zip，不含 .env
```

CloudBase 控制台：

1. 新建 **HTTP 云函数**，运行时 Node.js；
2. 上传 `dist-ai-function.zip`；
3. 函数监听端口 **9000**（`scf_bootstrap` 已设置 `PORT=9000`）；
4. 配置环境变量：
   - `AI_BASE_URL=https://api.deepseek.com/v1/chat/completions`
   - `AI_API_KEY=...`
   - `AI_MODEL=deepseek-chat`
   - `AI_ALLOWED_ORIGINS=https://komoribi147.github.io`
5. 取得 HTTP 访问地址后，修改 `js/site-config.js`：

```js
window.__AI_API_BASE__ = "https://你的云函数网关地址";
```

6. 重新发布 GitHub Pages。

跨域：`server/server.mjs` 的 `allowOrigin` 会读取 `AI_ALLOWED_ORIGINS`；本地预览还需加上 `http://127.0.0.1:8787`、`http://localhost:8787`（按需）。

## `/api/ask` 契约

请求：

```json
{
  "npc": "li-changhe",
  "playerText": "我们最后能走出草地吗？",
  "sceneTitle": "序章 · 泥水",
  "step": 8,
  "situation": "黄昏，松潘草地边缘的雨里。",
  "trust": 20,
  "address": "你",
  "present": ["li-changhe", "shitou", "he-xiuying"],
  "knownLore": [{ "title": "松潘草地", "text": "..." }],
  "askHistory": [{ "q": "...", "a": "..." }],
  "memories": ["玩家之前说过的话"],
  "history": [{ "role": "npc", "text": "..." }]
}
```

响应：

```json
{ "text": "说不准。我估摸着……", "mood": "平静" }
```

服务端会校验 `npc` 必须在 `present` 里，拒绝不在场人物。

## 记忆与知识截止

- `askHistory`：该人物自己的问答历史，前端保存在 `state.askMemory[npc]`，最多 12 轮；每次请求带最近 6 轮。
- `memories`：该人物在主剧情里听玩家说过的话（`engine.memoryOf(npc)`）。
- `history`：当前场景最近 4 条主线对话，用于共享情境。
- 系统提示明确：只知道到当前幕/步为止，不能提未来；未来的问题只能主观判断。
- 已解锁史料卡会作为 `knownLore` 传入，减少胡编。
