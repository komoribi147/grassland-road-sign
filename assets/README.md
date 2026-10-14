# 资源目录

美术和音频都放这里。**文件名必须和 `docs/ART_GUIDE.md` 里写的一模一样**，放进去刷新网页就生效，不需要改代码。

```
assets/
  bg/      背景图（9 张，最重要）
  char/    人物立绘（下一步任务，代码还没接）
  ui/      界面图标、纹理
  audio/   环境音与音效（rain.mp3 / sfx-splash.mp3 / sfx-bugle.mp3，已到位，见 audio/SOURCES.md）
```

bg/、char/、ui/ 三个文件夹现在还是空的，网页照样能完整跑通：背景会退化成灰绿色渐变色块，立绘暂时不显示。audio/ 里的三个音效已经放好了（来源与授权记在 `assets/audio/SOURCES.md`）。所以**美术可以一张一张慢慢补，不会挡住别人的进度**。

补完一张图之后，跑一次 `node tools/check-story.mjs`，如果还提示"缺少背景图"，就是文件名写错了。
