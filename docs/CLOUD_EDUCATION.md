# 云端 DeepSeek 教育网站说明

本版以网站交付。学习首页 `learn.html` 串起故事 `index.html`、学生探究 `inquiry.html`、教师核查 `teacher-review.html` 与评审导览 `review.html`。

## 运行

维护者复制 `server/.env.example` 为根目录 `.env`，在服务端填写 DeepSeek API Key，使用 `deepseek-chat` 和 `https://api.deepseek.com/v1/chat/completions`。运行 `node server/server.mjs`，打开 <http://localhost:8787/learn.html>。学习者只需浏览器，无需安装本地大模型。

模型调用链为“浏览器 → 项目服务端或云函数 → DeepSeek → 引用校验与证据回填 → 浏览器”。密钥不得写入网页、Git、截图或参赛压缩包。学生主动发起请求时，必要的学习文本会发送至云端处理。教师导入的记录及人工备注留在浏览器。

固定剧情使用已有配音；动态 AI 回复以文字呈现，本版网页不调用本机语音模型。原有音频制作工具保留供制作素材使用。

## 发布和核验

`npm run package:static` 输出完整静态网站到 `dist/`，包括新增首页、评审导览和开发示例。此目录不含服务端密钥。将其部署到现有静态托管后，公开入口为站点地址加 `/learn.html`。

AI 云函数仍使用现有 `grassland-ai` 和 `/api` 路由；`.env.cloud` 在服务端使用，禁止进入静态包。`npm run deploy:ai` 会更新公开服务，需在本轮获准发布后执行。仅健康检查不能证明实际模型返回有效。

检查命令：`node tools/check-story.mjs`、`npm test`、`npm run test:ai`、`npm run test:inquiry`。还需从网页验证两轮真实请求、导出和教师导入；班级并发与校园网络需另行测试。

## 评审与视频

`review.html` 中的样例明确标为开发者输入，非课堂数据。教师页面默认空白，评审自行下载示例后可主动导入。

2026-11-15 两次公网探究核验：初稿约 2.2 秒，修订约 1.5 秒，字段校验通过。各一次样例不能推断平均性能、班级容量或教学效果。

项目视频按比赛截图要求装入 ZIP 后上传“其他补充材料”，单个压缩包不超过 200MB。以平台最终规则为准。本版尚未开展真实课堂试用。
