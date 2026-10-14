# 音频来源与授权（任务卡 #7）

三个文件都取自 Wikimedia Commons，**全部是公有领域（Public domain）**，可商用、无需署名。
下面仍然把来源和作者写清楚，方便答辩时回答版权问题。

下载用的是 Commons 生成的 MP3 转码版本（原文件是 ogg），授权以原文件为准，两者一致。

| 文件名 | 内容 | 时长 | 来源文件 | 作者 | 授权 |
| --- | --- | --- | --- | --- | --- |
| `rain.mp3` | 雨声，环境音循环 | 45.0 s | [File:Rain (1).ogg](https://commons.wikimedia.org/wiki/File:Rain_(1).ogg) | ezwa | Public domain |
| `sfx-splash.mp3` | 泥水溅起，一次性音效 | 1.6 s | [File:Bathtub water splashes.ogg](https://commons.wikimedia.org/wiki/File:Bathtub_water_splashes.ogg) | gradha（PDSounds 第 775 号） | Public domain |
| `sfx-bugle.mp3` | 军号，一次性音效 | 5.1 s | [File:Attention Bugle Call (US).oga](https://commons.wikimedia.org/wiki/File:Attention_Bugle_Call_(US).oga) | U.S. Army Ceremonial Band | Public domain（美国政府作品） |

## 备注

- `rain.mp3`：原文件 45 秒，满足"30 秒以上、可无缝循环、无雷声无音乐"。剧情里由序章和第三幕的
  `"ambient": "rain"` 触发循环播放。
- `sfx-splash.mp3`：源文件是 48 秒的连续水声，这里截取了其中一段独立的水花
  （源文件 14.45–16.07 秒），按 MP3 帧边界裁切，没有重编码，所以音质无损于源。
  如果觉得"浴缸"的水花太清脆、不够泥沼味，换一个源再裁一次即可，文件名不用改。
- `sfx-bugle.mp3`：真军号演奏的"注意"号，5 秒，正好落在任务卡要求的 3–6 秒。

## 复现方式

Commons 的 MP3 转码地址可以直接推出来（`transcoded/<hash>/...`），也可以走 API：

```
https://commons.wikimedia.org/w/api.php?action=query&titles=File:Rain%20(1).ogg
  &prop=videoinfo&viprop=derivatives&format=json
```

返回里的 `audio/mpeg` 那条就是下载地址。
