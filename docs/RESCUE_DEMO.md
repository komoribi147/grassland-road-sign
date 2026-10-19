# 泥沼拉人交互样张

本地入口：[打开样张](http://localhost:8787/rescue-demo.html)。首页底部也有“体验「泥沼拉人」动态样张”链接。本页是独立体验，供审核画风、动效和操作手感。

## 已实现

- 以用户在 2026-10-18 选定的三人救援图为主体，用显示遮罩保留原图人物面貌与抓握细节，背景补图填充被遮挡区域。
- 稀疏雨丝、缓慢漂移的薄雾、少量泥水涟漪、轻微镜头视差。
- “站稳、抓牢”之后按住鼠标、触屏、空格或回车，听口令共同用力；松开暂停，进度保留。
- “点一下，持续协力”提供替代操作，可随时暂停。切换标签页、失焦或触摸取消时停止持续输入。
- 用力时人物与牵引物共同发生小幅变换，保持握点连接；随协力进度短暂切换“发力”和“近岸”两张关键画面，松开后停留在已达到的画面；完成后淡入三人坐在岸上喘息的衔接图。可重玩。
- 音效使用项目已有的雨声、布料绷紧、泥水翻动和喘息声；点击进入后播放，支持静音。
- 动态开关提供静态对照，并尊重系统“减少动态效果”偏好。静态模式仍能完整操作。
- 窄桌面面板完整保留三人的脸，手机采用横向画幅与下方操作区。

当前人物动作由三张关键画面与原图的轻微分层变换构成，尚不具备连续、独立的手臂和腿部动作。新增画面是待审核的本地样张素材；正式场景可在人物与握点逐帧核对后再接入。

## 文件与素材

入口：`rescue-demo.html`；样式：`css/rescue-demo.css`；交互：`js/rescue-demo.js`。

| 素材 | 用途 | 来源 |
| --- | --- | --- |
| `assets/rescue/scene.webp` | 原图人物与静态对照 | 用户首选图 |
| `assets/rescue/background.webp` | 人物身后的草地与泥水 | 内置 imagegen 编辑 |
| `assets/rescue/shore.webp` | 脱困后的衔接镜头 | 内置 imagegen 参考图生成 |
| `assets/rescue/effort.webp` | 第一次发力的关键画面 | 内置 imagegen 参考图生成，原图见 `output/visual-masters/05a-泥沼拉人-发力关键帧-v1.png` |
| `assets/rescue/near-bank.webp` | 石头接近岸边的关键画面 | 内置 imagegen 参考图生成，原图见 `output/visual-masters/05b-泥沼拉人-近岸关键帧-v1.png` |

五张图片均为 1672×941。新增两张 WebP 质量参数 90，各约 0.30 MB；现有三张约 1.22 MB。原始图保留在工作区的 `output/visual-masters/` 与 `output/rescue-demo/`。生成工具不公开具体模型，本次未通过 API 指定模型。

## 生成提示词

### 空草地背景

Use case: precise-object-edit. Create a clean background plate for a website animation from this exact reference image. Remove ALL three people, their clothes, the iron cooking pot, brass bugle and the long object between their hands. Reconstruct only the empty grassy bank on the left and shallow dark marsh water and peat on the right where those objects were. Keep the exact camera, 16:9 framing, terrain boundary, foreground grass, water level, horizon, original colors and overcast misty daylight. The entire output is an empty wet grassland landscape, with no people or equipment anywhere. Preserve the existing unoccluded landscape as faithfully as possible. No writing, no UI, no new mountains, no added objects. This is a background plate, not a new composition.

### 脱困后的衔接图

Use case: historical-scene. Create the immediate next shot after the reference, an emotionally restrained quiet moment on firm wet grass. Keep the exact recognizable three Chinese people, their ages, 1935 worn grey cotton clothes, low camera, 16:9 wide composition, muted grey-green and dark peat palette, misty flat marsh and soft overcast daylight. Everyone is now sitting or crouching together on the firm grassy bank, resting and catching their breath, entirely above the shallow water. The younger teenage bugler at right sits with both knees bent on the grass, soaked and muddy, holding his oxidized brass bugle to his chest, breathing hard with tired relief. The 52-year-old cook at center-left leans on one knee and steadies the boy's shoulder, exhausted, with the same black cooking pot on his back. His anatomical RIGHT foot is bare and dirty; LEFT foot has worn grass sandal. The same young woman medic at left supports his upper arm, worried but relieved, old medical satchel at her side. The long cloth strip lies slack on the grass. No one stands in the water. Believable weight and stable anatomy, clean natural faces and hands, realistic coarse cloth with sparse irregular tears, restrained film-still photography, minimal grain. No wounds, no blood, no violence, no red cloth, no text, no UI, no new characters, no hills.

两次出图都只参考用户首选的三人救援图。

### 发力关键画面（v1）

Use case: historical-scene. Asset type: second 16:9 key frame for a web interactive rescue sequence. The supplied image is the exact preceding shot and the identity, costume, location, camera, lighting and color reference. Create the immediate next moment, roughly one second later, in the SAME locked-off low camera framing and same misty 1935 marsh landscape. Same three recognizable Chinese people, same clothes, pot, medic satchel, bugle, and same long sodden cloth held taut by the older cook and teenage bugler. Older cook on the left plants his bare RIGHT foot hard into the turf, leans his hips backward a little and draws his hands about a handspan toward shore; the medic behind him braces his shoulders with genuine weight. The boy on the right leans forward against the cloth, waterline moves only a little lower on his torso; muddy water forms a restrained wake and small ripples. Preserve clear hands gripping the same continuous cloth with believable force, no detached limbs. Faces show effort without theatrical grimaces. Muted grey-green and mud-brown, overcast diffuse cold light, wet coarse fabric, clean film-still realism with minimal grain. Keep all people within the reference's central layout so this can dissolve with the preceding image. No text, UI, watermarks, new people, hills, weapons, bright red, exaggerated splashing, extra fingers, distorted feet, or glossy CG.

### 近岸关键画面（v1）

Use case: historical-scene. Asset type: third 16:9 key frame for a web interactive rescue sequence. Image 1 is the original locked camera and identity reference; Image 2 is the immediately preceding effort frame. Depict the NEXT physical moment about two seconds later in the same low fixed camera, same foggy marsh bank, same three recognizable Chinese people and weather. The boy has moved roughly half a meter left toward the grassy bank, and is now supported at the bank edge: his muddy upper torso rises somewhat from the shallow peat and one elbow starts to find firmer grass. He is still partly in muddy water, still gripping the SAME continuous sodden cloth with both hands. The older cook has shifted his weight back over his bent planted legs, drawing the cloth toward him; his anatomical right foot is bare, left foot in worn grass sandal, black cooking pot still on his back. The medic's body braces the cook's shoulder and back. Keep the three anatomically credible and the cloth continuous, hands attached and visibly loaded. Show only modest displaced peat and small ripples, no dramatic spray. This is just before the separate final seated-on-shore shot, not a completed rescue. Maintain original 16:9 layout and near identical overcast light, terrain boundary, muted grey-green and mud-brown, highly realistic clean historical film still, natural tired faces, minimal grain. Do not add text, UI, watermarks, red fabric, new people, hills, modern items, weapons, extra fingers, impossible limbs, or plastic CGI.

两张新图使用内置 imagegen；第二张同时参考首选图和第一张关键画面。原图未替换。

## 验证

在 Chrome 浏览器中实测鼠标按住/释放、暂停保留进度、持续协力、重玩、键盘输入；模拟手机真实触摸输入，并检查 390 px、320 px 与手机横屏布局；检查系统减少动态效果模式。浏览器实测未出现页面异常或资源加载错误。

后续针对窄桌面面板调整了完整取景，并在 Codex 内置浏览器复核。检查 `node --check js/rescue-demo.js`、`node tools/check-story.mjs`、`npm test` 和 `git diff --check` 均通过；静态包包含入口和所有依赖素材。

新增关键画面后，在 Chrome 的本地预览中按住协力实测：进度约 43% 时发力画面完全显示，约 98% 时近岸画面完全显示，完成时岸上画面正常淡入；两张图片均无加载错误。390 px 手机宽度的系统“减少动态效果”模式中，协力进度正常推进，新增画面保持隐藏，页面无横向溢出。复核了 `node --check js/rescue-demo.js`、`node tools/check-story.mjs`、`npm test`、`git diff --check` 和静态打包；新素材已包含在 `dist/assets/rescue/`。测试截图见 `output/rescue-demo/verification-*.png`。

交互报告、过程截图与原始生成图在 `D:/讯飞杯/output/rescue-demo/`。新图和交互尚待用户目视审核。
