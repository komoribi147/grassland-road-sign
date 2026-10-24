# Character Voices Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 本地四角色 AI 剧情配音、实时自由对话配音和可试听交付。
**Architecture:** Node 服务验证角色和文本，调用 Python edge-tts，按声线版本与文本 SHA256 缓存。浏览器 VoicePlayer 负责取消、音量、开关和错误状态；剧情与两类对话共享播放器。
**Tech Stack:** Node.js、Python edge-tts、HTMLAudioElement。
**Spec:** docs/superpowers/specs/2026-10-23-character-voices-design.md

## Global Constraints

- 仅本地，不推送或上传。
- 保留现有故事、AI 对话和环境音行为。
- 不使用系统朗读冒充独立 AI 声线。
- 原始凭据与运行时依赖不进入静态资源。

## Review Focus

- 切换角色期间迟到音频不能播放。
- 关闭配音或录音开始后立即停止。
- 未知角色、超长文本、相同请求并发应被正确处理。
- 网络失败保持文字和后续操作可用。
- 固定剧情中的称呼变量应预生成或可实时合成。

### Task 1: 服务与音频生成

Files: server/voice-service.mjs, server/synthesize-voice.py, story/voices.json, tools/generate-voices.mjs, tools/test-voice-service.mjs.
- [ ] 编写并运行验证、并发去重、失败恢复与缓存的测试。
- [ ] 实现 createVoiceService({synthesize, cacheDir, profiles}) 的 synthesize(npc,text) -> Buffer。
- [ ] 接入 /api/tts 和 /api/voices，限制请求大小、频率与并发。
- [ ] 生成四个试听和全部可达固定台词的音频索引。

### Task 2: 播放与界面

Files: js/voice.js, js/engine.js, js/main.js, js/ask.js, index.html, tools/test-voice-player.mjs.
- [ ] 编写迟到响应、取消、音量、静音与故障的播放测试并先运行。
- [ ] VoicePlayer.speak(npc,text)、stop()、setEnabled(on)、setVolume(v) 接入剧情和两种自由对话。
- [ ] 添加菜单配音开关与试听入口，录音/后台/面板切换停播。

### Task 3: 试听交付与验证

Files: voice-preview.html, docs/CHARACTER_VOICES.md, package.json.
- [ ] 本地试听页展示声线、逐个试听、停止和真实自由对话。
- [ ] 运行剧情、引擎、AI、声音检查，检查真实合成文件和真实对话转语音。
- [ ] 打开本地试听页，交付音频与入口，注明未发布和联网要求。

## Execution ledger

- 用户要求直接做完，因此连续执行，不再增加方案审批轮次；在当前项目完成，保留 docs/_pov-audit.html。
