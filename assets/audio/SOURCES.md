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

## 这一批音效的来源（C 表 24 条 · 2026-10-15）

全部取自 Freesound 的 **CC0** 素材（可商用、免署名），下的是高码率预览 mp3，
再用 ffmpeg 裁剪、滤波、淡入淡出并统一峰值。原始素材对应关系如下：

| 用在哪几条 | 源素材（Freesound，CC0） | 作者 |
| --- | --- | --- |
| sfx-rustle / bandage / cloth-strain / cloth-ring / pack | [foley cloth rustle](https://freesound.org/s/19291/) | martian |
| sfx-flag | [flag plastic garbage bag flap quick in wind2](https://freesound.org/s/450831/) | kyles |
| sfx-pour / kettle-empty | [Pouring Water Into Metal Pot or Kettle](https://freesound.org/s/585516/) | ahriik |
| sfx-stomach | [stomach growl-PiSh_01](https://freesound.org/s/52293/) | XxBirdoxX |
| sfx-spoon-scrape | [Ceramic Plate and Spoon Scratching While Eating](https://freesound.org/s/799630/) | bilal.techie |
| sfx-chew | [Eating a cracker (Mouth closed)](https://freesound.org/s/364924/) | Rudmer_Rotteveel |
| sfx-pant | [Heavy Breathing](https://freesound.org/s/163383/) | Under7dude |
| sfx-gasp | [Gasp Male](https://freesound.org/s/271245/) | bertiehs |
| sfx-mumble | [Crowd Mumble 2](https://freesound.org/s/267250/) | BerlinGameScene |
| sfx-wood-knock | [Knock_on_door.wav](https://freesound.org/s/244325/) | Philip_Daniels |
| sfx-bird | [Bird Freaking Out](https://freesound.org/s/812026/) | qubodup |
| sfx-grass-steps | [Walk Wet](https://freesound.org/s/231850/) | alegemaate |
| sfx-run-splash | [running through a puddle](https://freesound.org/s/249930/) | launemax |
| sfx-foot-mud / sfx-stick-mud | BenDrain 的泥地单步（见上文第一批记录） | BenDrain |

还有两条是**自己合成**的，不涉及任何版权：`sfx-heartbeat`（心跳 + 4.3 kHz 耳鸣，正弦合成）、
`sfx-thump`（低频转场咚，正弦 + 低通）。

### 第二轮修正（听完反馈后换源的四条）

| 文件 | 反馈 | 现在的做法 | 源素材（Freesound，CC0） |
| --- | --- | --- | --- |
| `sfx-chew.mp3` | 太脆，像在啃饼干 | 换成"嚼口香糖"那种湿闷的，低通 3.4 kHz + 放慢 8% | [loud-gum-chewing](https://freesound.org/s/613719/) · Pizzazif |
| `sfx-pour.mp3` | 只有倒水，没有漱口 | 前半倒水、后半咕噜漱口，拼成一条 | [Pouring Water…](https://freesound.org/s/585516/) + [Gargling some water](https://freesound.org/s/218195/) · edhutschek |
| `sfx-flag.mp3` | 听着像塑料袋 | 换成真正的旗帜布料摩擦 | [Flag Rustle 2, Foley, Med Distance](https://freesound.org/s/870602/) · CHallSmith |
| `sfx-mumble.mp3` | 应该是"嗯嗯"的低哼 | 一声软哼复制成两声，低通 1.3 kHz、压到 −14 dB | [Man final pain moan](https://freesound.org/s/867174/) · Lord_Bennelengtone |

加工方式：裁剪 → 滤波 → 淡入淡出 → 统一峰值；每条在剧情里的实际音量由步骤里的 `level` 决定。
加工脚本在工作区 `work/fx-build.mjs`（不进仓库）。

## 备注

- `rain.mp3`：原文件 45 秒，满足"30 秒以上、可无缝循环、无雷声无音乐"。剧情里由序章和第三幕的
  `"ambient": "rain"` 触发循环播放。
- `sfx-splash.mp3`：一段真实泥地行走录音里的单个落点（源文件 10.50–12.40 秒），
  前面留了一点安静，听起来像单独踩下去一步。处理后峰值统一到 −3 dBFS，192 kbps。
  同一条录音长 25 秒，如果想做"一直在泥里走"的环境音，换一个更长的窗口即可。
- `sfx-bugle.mp3`：真军号演奏的"注意"号，5 秒，落在任务卡要求的 3–6 秒内。
  找过中国军号的录音（Commons、Freesound 的 CC0、Internet Archive 上的中文老唱片），
  **没有找到可以自由使用的**：中国政府的音视频作品不像美国那样自动进入公有领域，
  官方媒体的军号录音都还在版权期内。所以暂时用这条美国陆军仪仗乐队吹的"注意"号，
  乐器本身就是军号，听感是对的。以后如果从爱给网这类平台拿到明确可商用的中国军号，
  直接替换这个文件就行，代码不用改。

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
