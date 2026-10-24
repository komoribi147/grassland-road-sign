# 角色声音第二轮：年龄与情绪

用户指出第一版没有感情，音色的年龄区别不明显。第一版 Edge 神经网络声线加语速/音高的方案未达到要求，不视为最终角色配音。

本轮先生成四个可试听候选，不批量替换整部剧情。使用 Qwen3-TTS VoiceDesign 1.7B，根据年龄、音质、气息、对象与情绪生成声音；不是简单调慢或降调。

- 老班长：52 岁的疲惫、粗粝男声，对受伤年轻人关心而坚定。
- 石头：16 岁、变声后仍明显少年的男声，逞强与害怕同在。
- 何大姐：25 岁成年女声，安排事情干脆，照看伤口时放柔。
- 晚年何秀英：70 多岁的声音目标，有老年气息和轻微沙颗粒，平静回忆；年龄是此次声音设计目标，未改写人物史料。

用户明确允许把虚构声音描述与试听台词发给通义官方演示。官方演示返回匿名 GPU 可用额度为 0，本轮没有从该服务生成音频。改用官方开放模型在本机运行。

运行文件：

- `story/voice-designs.json`：声音描述和试听句。
- `tools/download-voice-design-modelscope.py`：从 Qwen 官方 ModelScope 仓库下载权重。
- `tools/design-character-voices-local.py --release-chat-vram`：临时卸载已加载的 qwen2.5:14b 对话模型，释放显存后生成四个候选。下一次对话请求会自动重新加载对话模型。
- `voice-candidates.html`：新旧样音对比页。

模型、GPU 环境、运行依赖位于 git 忽略的 `node_modules` 中。新音频位于 `assets/audio/voice-candidates`，实际完成后才建立索引。年龄和表演需用户试听判断，不以生成成功替代听感验收。

官方资料：https://github.com/QwenLM/Qwen3-TTS#voice-design

## 本轮结果

本机生成了四段 24 kHz PCM WAV，时长分别为老班长 8.32 秒、石头 7.68 秒、何大姐 7.20 秒、晚年何秀英 10.56 秒。模型与声音解码器 SHA256 与 Hugging Face 官方索引一致。当前使用 SDPA 推理，四段耗时分别为 63.1、57.0、52.4、39.9 秒，不作为实时自由对话的低延迟方案。

生成了四段相同台词的 Edge 对照 MP3，供隔离文本差异进行试听。对比入口为本机 `http://localhost:8788/voice-candidates.html`；当前候选尚未替换剧情库和自由对话声线，网站未发布。

已安装环境：`node_modules/.qwen-local/Scripts/python.exe`。再次生成候选可使用该 Python 运行 `tools/design-character-voices-local.py --release-chat-vram`，无需再次下载模型。`tools/generate-voice-baselines.mjs` 生成同句旧声线对照。
