# 资源目录

美术和音频都放这里。新增或替换素材后，按剧情 JSON 中引用的文件名检查路径。

```
assets/
  bg/      背景图（9 张）
  storyboards/  六格分镜图与独立画面（95 个画面用于剧情与动作）
  char/    四个人物的统一立绘
  ui/      界面图标、纹理
  audio/   环境音与音效（来源见 audio/SOURCES.md）
```

六格分镜每张分成两列三行，`panel` 从左到右、从上到下编号 `0` 到 `5`；单张画面用 `visual.src` 引用。增加画面时也要在 `story/scenes/*.json` 里加对应引用；`node tools/check-story.mjs` 会检查文件和画面是否重复或缺失。

补完一张图之后，跑一次 `node tools/check-story.mjs`，如果还提示"缺少背景图"，就是文件名写错了。
