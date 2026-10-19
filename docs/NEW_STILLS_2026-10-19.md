# 本轮新增独立镜头

图片均由内置 imagegen 生成，原始 PNG 保存在 `D:/讯飞杯/output/visual-masters/single-frames/`；网站使用的副本在 `assets/stills/`。旧图没有进入本地静态发布包。本轮没有提交或发布。

| 网站文件 | 原始文件 | 视觉核对 |
| --- | --- | --- |
| `bog-alone.png` | `17-石头陷泥-纪实版-v1.png` | 石头陷至腰部，双手接触泥草，救援尚未开始；军号造型略简化 |
| `bandage.png` | `15-草地包扎-纪实版-v1.png` | 何大姐包扎老班长赤裸的右脚，石头已在岸上 |
| `grain-pick.png` | `18-捡拾青稞-纪实版-v1.png` | 粮袋塌陷、散粒很少；衣袖泥痕仍略重 |
| `soup-serving.png` | `20-雨夜分汤-纪实版-v1.png` | 薄汤、黑锅、空碗和伤员，已修正误入的军号和血迹 |
| `approach-medic-night.png` | `112-走近何大姐-中国面孔-v4.png` | 中国面孔；移除误生成的马匹、帐篷、营火，油布改为粗布质感 |
| `medic-last-bandage.png` | `82-最后一卷绷带-v3.png` | 保留药箱和最后一卷绷带，移除远处误生成的马匹与强烈金色日光 |

黎明吹军号现有独立镜头 `dawn-bugle.png` 已接入，但背景队伍人数偏多，与走散后的剧情不符，列为待重做镜头。本轮针对该镜头的两次新生成请求均被图片服务拒绝，未取得可审核的新图；当前网站仍使用原镜头。

本轮两张修正图仍为各自剧情位置的独立图片，旧候选原图继续保存在 `output/visual-masters/single-frames/`。`approach-medic-night.png` 的最初候选出现西方面孔，用户已指出并弃用。

### 走近何大姐：中国面孔与营地背景（最终定向编辑）

> Edit this existing 16:9 historical-film still with ONE focused continuity correction: replace only the DISTANT BACKGROUND with a sparse, rain-dark Chinese grassland camp at night: low wet grass, thin mist, at most two indistinct crouching Chinese comrades blurred in the distance. Remove ALL horses, tents, upright structures, campfires and orange light. Keep foreground exactly recognizable: the clearly Chinese woman medic's face, age, black tied hair, tired expression, plain grey cotton clothes, crouching posture, hands touching the matte woven oilcloth, satchel, metal canteen, wounded Chinese patient, their proportions, camera framing and subdued blue-grey lighting. Maintain photographic realism, matte cloth, clean low-noise image. No new foreground people or objects, no extra fingers, no text, watermark, UI, plastic tarp, CG or poster styling.

### 最后一卷绷带：移除多余背景（最终定向编辑）

> Use case: precise-object-edit. Correct ONLY the distant BACKGROUND of this 16:9 1935 Chinese Red Army grassland film still. Remove every horse or horse-shaped silhouette, tents, camp structures and bright golden sun. Replace with empty damp grey-green grassland, shallow mist, and very soft cool dawn sky; perhaps one indistinct walking Chinese comrade far behind, but no extra foreground person. Keep the entire foreground exactly recognizable and unchanged: the Chinese woman medic's grey cotton sleeves and hands in plausible contact with the old wooden medical box, the single last roll of cloth bandage, her kneeling body, worn garments, wet grass, photographic framing, focus, and muted color. No text, symbols, watermark, plastic, modern objects, extra fingers, face change, painterly style, film grain or orange glow.

## 生成提示词

### 草地包扎

> Use case: historical-scene. Asset type: a single clean 16:9 cinematic still for a 1935 Chinese Red Army grassland narrative, immediately AFTER the supplied bog rescue reference. Keep the recognizable exhausted 52-year-old cook and 25-year-old woman medic, their worn 1935 grey cotton clothes, the cook's black iron pot and the medic's weathered medical satchel, same overcast cold grey-green marsh and low camera realism. On stable wet turf, the cook sits low with his anatomical RIGHT foot bare and dirty, left foot still wearing a worn straw sandal. A small believable abrasion on his bare right foot is being carefully wrapped by the medic with a torn strip of her own cotton sleeve; she kneels with her weight balanced and eyes focused on the foot. The teen bugler may be indistinct in the deep background, already rescued and resting, not still in the bog. Frame the medic's hands, bare right foot, faces and actual cloth contact clearly and plausibly. Candid historical film still, restrained natural expressions, asymmetrical mud and frayed cloth, diffuse rainy light, clean image with very little grain and no stylized texture. No red cloth signpost yet, no posing, no perfect uniforms, no writing, no text, no UI, no watermark, no modern medical supplies, no dramatic wounds or blood, no extra fingers, no reversed bare foot, no disconnected hands, no plastic CGI.

### 石头陷泥

> Generate a 16:9 historical film still of the 16-year-old bugler just after sinking waist-deep into the 1935 grey-green rainy grassland bog. Use `bog-rescue.png` only to preserve the boy's identity, old bugle, muted color and terrain. Both hands brace against real wet grass and peat; his body weight and waterline are physically plausible. The cook and medic have not begun pulling, so there is no taut cloth, rescuer or red marker. Tired natural face, irregular mud, clean low-grain image; no poster pose, added people, modern objects, deformed hands, or text.

### 捡拾青稞（最终定向编辑）

> Edit the referenced photorealistic 16:9 historical scene with one focused correction to the grain sack and barley only. Make the old cloth sack look more clearly trampled and partly flattened in the wet grass, with its torn mouth collapsed. Reduce the visible qingke barley to a genuinely tiny remainder: only a few small mud-specked individual kernels near the torn mouth and under the woman's fingertips, with the bag nearly empty. Keep her thumb and index fingertip in direct, physically plausible contact with one kernel. Preserve exactly the same woman's face, hair, natural crouch, old medicine box, clothing, bog, rain mist, subdued colors, framing, and documentary photographic texture. No red fabric, text, watermark, painting style, added objects, or hand distortions.

### 雨夜分汤（最终定向编辑）

> Use case: precise-object-edit. This is a historical film still used in a 1935 grassland camp story. Preserve the same older cook, black iron pot, measured thin barley soup being ladled into a bowl, wet grey-green camp, lens, framing, lighting, facial expression, textures and all hand contacts. Correct only two continuity errors: remove the brass bugle from the young woman on the left and put her worn small medical satchel at her side instead; change the reclining person's blood-stained forehead cloth into a plain clean damp cloth with no wound, redness or blood. Keep everyone natural, exhausted and unposed. No new people, no other changed objects, no text, no watermark, no red fabric, no stylized grain.
