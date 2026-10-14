# 音频来源与授权（任务卡 #7）

三个文件都是**公有领域 / CC0**，可商用、无需署名。下面仍然把来源和作者写清楚，
方便答辩时回答"素材哪来的"。

- `rain.mp3`、`sfx-bugle.mp3` 取自 Wikimedia Commons，用的是 Commons 生成的 MP3 转码版本
  （原文件是 ogg），授权以原文件为准，两者一致。
- `sfx-splash.mp3` 取自 Freesound，两个 CC0 音效各取一步、按帧首尾相接。

| 文件名 | 内容 | 时长 | 来源文件 | 作者 | 授权 |
| --- | --- | --- | --- | --- | --- |
| `rain.mp3` | 雨声，环境音循环 | 45.0 s | [File:Rain (1).ogg](https://commons.wikimedia.org/wiki/File:Rain_(1).ogg) | ezwa | Public domain |
| `sfx-splash.mp3` | 脚踩进泥地（两步），一次性音效 | 1.4 s | [Footsteps_Mud_Single_01](https://freesound.org/people/BenDrain/sounds/488077/) + [_03](https://freesound.org/people/BenDrain/sounds/488082/) | BenDrain | CC0 1.0（公有领域等效） |
| `sfx-bugle.mp3` | 军号，一次性音效 | 5.1 s | [File:Attention Bugle Call (US).oga](https://commons.wikimedia.org/wiki/File:Attention_Bugle_Call_(US).oga) | U.S. Army Ceremonial Band | Public domain（美国政府作品） |

## 备注

- `rain.mp3`：原文件 45 秒，满足"30 秒以上、可无缝循环、无雷声无音乐"。剧情里由序章和第三幕的
  `"ambient": "rain"` 触发循环播放。
- `sfx-splash.mp3`：就是"脚踩进泥里"的声音。两个 CC0 单步素材（0.65 s + 0.72 s）
  按 MP3 帧首尾相接，没有重编码。同一套素材里还有连续行走的
  `Footsteps_Mud_01/02/03/04`，如果以后要做"行军"环境音可以直接用。
- `sfx-bugle.mp3`：真军号演奏的"注意"号，5 秒，正好落在任务卡要求的 3–6 秒。

## 复现方式

Commons 的 MP3 转码地址可以直接推出来（`transcoded/<hash>/...`），也可以走 API：

```
https://commons.wikimedia.org/w/api.php?action=query&titles=File:Rain%20(1).ogg
  &prop=videoinfo&viprop=derivatives&format=json
```

返回里的 `audio/mpeg` 那条就是下载地址。

Freesound 的预览文件地址藏在搜索结果页里（`data-mp3` 属性），把结尾的 `-lq.mp3`
换成 `-hq.mp3` 就是高码率预览。原始 wav 需要登录下载，CC0 素材用预览 mp3 即可。

## 变更记录

- 2026-10-14：`sfx-splash.mp3` 最初用的是 Commons 的浴缸水花（Public domain），
  听感偏清脆、不像泥地，改成现在的 CC0 泥地脚步。
