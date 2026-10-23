# 老班长发型修正（2026-10-23）

- 位置：第四幕“走近老班长”，`assets/stills/approach-last-signpost.png`。
- 用户指出背影人物扎发髻与老班长的设定不一致；使用内置 imagegen 对原图局部编辑，改为自然、凌乱的黑灰色短发。
- 已目视确认发髻和束发消失；背对视角、坐姿、红布木棍、黑锅、前景手和草鞋、泥路与远山保留。
- 替换前母版备份于项目外 `D:/讯飞杯/output/hair-fix-2026-10-23/approach-last-signpost-before.png`。
- 通过既有优化脚本生成新的高清与手机 WebP，文件内容指纹改变；更新模块版本参数，让重新打开页面时获取新映射。

## 实际编辑提示词

### 第三幕补充修正

- 根据用户截图与“看到那棵歪树没有”台词定位到 `assets/stills/cook-looks-ahead.png`，此图仍有发髻，属于上一轮漏改的另一镜头。
- 使用内置 imagegen 编辑，目视确认改为自然黑灰色短发；人物面貌、神情、背锅、红布探路棍、远处歪树与草地构图保留。
- 原图备份：`D:/讯飞杯/output/hair-fix-2026-10-23/cook-looks-ahead-before.png`。新版模块参数：`20261023-hair2`。

编辑提示词：

Use case: precise-object-edit. Edit the provided original historical film still, not a website screenshot. Make ONE localized correction to the elderly Chinese MALE squad leader's hairstyle: remove the topknot/bun at the top-back of his head, any braid or tied hair, and the long strands around the ears, forehead and nape. Replace with practical short, damp, untied, uneven black-and-gray hair about 2–4 cm long, appropriate to an older male Red Army soldier in 1935. Natural short hairline around ears and nape. Retain his exact recognizable face, age, wrinkles, beard, expression, gaze to the right, head angle, ears, skin and pose. Preserve the walking stick with red cloth on the left, his hands, muddy tattered gray uniform, ropes and pot on his back, distant leaning tree on right, wet marsh, mountains, fog and sky. Keep the original 1672x941 wide framing and all composition, lighting, subdued gray-green/mud-brown palette and photographic texture. Only visible alteration should be the haircut. No bun, braid, ponytail, long locks, hair accessories, new hat, new text or watermark.

### 第四幕原修正

Use case: precise-object-edit. Image 1 is the edit target, a photorealistic 16:9 historical film still for a 1935 Chinese Red Army grassland story. Make ONE tightly localized correction to the elderly MALE squad leader seated with his back to the viewer in the upper center. Remove his topknot/hair bun and all tied-up or long nape hair, replacing ONLY his hair with practical short, damp, untied, uneven black-and-gray hair, about 2–4 cm long, consistent with an exhausted older Chinese male Red Army soldier. Natural short hairline at the back of his neck. No braid, ponytail, bun, shaved decorative style, hair accessory or new hat. Preserve the exact back-facing pose, male identity, neck, ears, head angle, body, muddy gray uniform, seated position, red-cloth wooden marker on his left, black pot on his right, marsh, mountains, cloudy sky, muddy path, foreground first-person left hand and straw shoe. Preserve all composition, physical contact, lighting, low-saturation gray-green/mud-brown colors and image texture outside the small hair region. Do not add/remove/move any person, prop or scenery. Keep the original wide 16:9 framing. The only visible change should be a believable short male haircut instead of the topknot. No text or watermark.
