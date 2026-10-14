# 音频来源与授权（任务卡 #7）

三个文件都是**公有领域 / CC0**，可商用、无需署名。下面仍然把来源和作者写清楚，
方便答辩时回答"素材哪来的"。

- `rain.mp3`、`sfx-bugle.mp3` 取自 Wikimedia Commons，用的是 Commons 生成的 MP3 转码版本
  （原文件是 ogg），授权以原文件为准，两者一致。
- `sfx-splash.mp3` 取自 Freesound 上一段真实的"泥地行走"录音，剪出其中一个落点。

| 文件名 | 内容 | 时长 | 来源文件 | 作者 | 授权 |
| --- | --- | --- | --- | --- | --- |
| `rain.mp3` | 雨声，环境音循环 | 45.0 s | [File:Rain (1).ogg](https://commons.wikimedia.org/wiki/File:Rain_(1).ogg) | ezwa | Public domain |
| `sfx-splash.mp3` | 脚踩进泥地，一次性音效 | 1.96 s | [Walking through Mud](https://freesound.org/people/Breviceps/sounds/508179/) | Breviceps | CC0 1.0（公有领域等效） |
| `sfx-bugle.mp3` | 军号，一次性音效 | 5.1 s | [File:Attention Bugle Call (US).oga](https://commons.wikimedia.org/wiki/File:Attention_Bugle_Call_(US).oga) | U.S. Army Ceremonial Band | Public domain（美国政府作品） |

## 备注

- `rain.mp3`：原文件 45 秒，满足"30 秒以上、可无缝循环、无雷声无音乐"。剧情里由序章和第三幕的
  `"ambient": "rain"` 触发循环播放。
- `sfx-splash.mp3`：一段真实泥地行走录音里的单个落点（源文件 10.50–12.40 秒），
  前面留了一点安静，听起来像单独踩下去一步。处理后峰值统一到 −3 dBFS，192 kbps。
  同一条录音长 25 秒，如果想做"一直在泥里走"的环境音，换一个更长的窗口即可。
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

剪辑与归一化用的是 ffmpeg（便携版，只放在工作区，没有装进系统）：

```
ffmpeg -ss 10.50 -t 1.90 -i source.mp3 \
  -af "afade=t=in:st=0:d=0.02,afade=t=out:st=1.50:d=0.4,volume=-0.5dB" \
  -c:a libmp3lame -b:a 192k -ar 44100 sfx-splash.mp3
```

`volume` 的数值是先用 `volumedetect` 量出峰值、再补到 −3 dBFS 得到的。

## 变更记录

- 2026-10-14：`sfx-splash.mp3` 最初用的是 Commons 的浴缸水花（Public domain），
  听感偏清脆、不像泥地；第二版是两个 CC0 单步素材硬拼（BenDrain），接缝和音质都不行。
  现在这版是真实泥地行走录音里剪出来的单步（Breviceps，CC0）。
