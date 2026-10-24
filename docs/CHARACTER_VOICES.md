# 本地角色 AI 配音

运行 `npm start`，打开 `http://localhost:8787/voice-preview.html`。完整剧情的菜单也有“试听角色声音”和独立的“角色配音”开关。

- 老班长：Yunjian，慢速、较低男声。
- 石头：Yunxia，稍快的少年男声。
- 何大姐：Xiaoyi，平稳清楚的女声。
- 晚年何秀英：Xiaoxiao，更慢、更低的女声；这是声音风格处理，尚非专门训练的老年音色。

固定剧情、剧情选项回应、自由对话和自由提问共享同一套声音。旁白和玩家输入不自动朗读。切换角色、下一句、关闭面板、重开、读档、后台或开始录音时停止配音。配音失败时保留文字。

## 生成与运行

本机安装的 Python 依赖位于 `node_modules/.voice-python`，不会打包发布。可用以下方式重新安装：

```powershell
python -m pip install --target node_modules/.voice-python edge-tts mutagen
npm run voices:generate
npm start
```

如果 `python` 不可用，通过环境变量 `VOICE_PYTHON` 指定完整路径。当前环境自动识别 Codex 附带的 Python。代理默认继承 `HTTPS_PROXY` 或 `HTTP_PROXY`，也可设置 `VOICE_PROXY`。

`story/voices.json` 配置声线、音调、语速与试听句。`assets/audio/voices/manifest.json` 索引固定音频。`node_modules/.voice-cache` 保存实时配音缓存；更改声线或文本会生成新缓存。

`POST /api/tts` 接收 `{npc,text}` 并返回 MP3，限 1200 字，最多同时生成四条；相同请求合并。`GET /api/voices` 查看配置。仅使用真实合成结果，无系统朗读回退。

用户已明确允许将剧本台词与 AI 回复文字发送给微软在线配音，但网站暂不上传或发布。语音由社区 edge-tts 接入微软在线神经网络服务，需要网络，接口可用性受外部服务影响。当前未配置付费语音账号，后续可替换正式 TTS API。

## 验证

运行 `npm run test:voice` 检查角色与输入校验、并发去重、缓存、声线换版、取消与迟到请求、音量、静音、故障恢复。再运行 `npm test`、`npm run test:ai`、`npm run check`。
