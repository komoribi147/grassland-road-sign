# 第一次打开这个项目，从这里开始

三条路，按你想做的事选一条。**不用先学编程。**

---

## 路线一：只想看看它长什么样（0 分钟）

打开这个网址就行，手机也能看：

**https://komoribi147.github.io/grassland-road-sign/**

线上版没有 AI 实时对话（NPC 用剧本里写好的台词），故事完整可玩。
想体验"随便说什么他都能接"，需要走路线三。

---

## 路线二：想改文字、换图片（10 分钟，不用装软件）

适合：编剧、文案、美术、史料校对。

1. 到 <https://github.com> 注册账号，把用户名发给组长，等他把你的名字加进仓库。
2. 收到邮件点 **Accept invitation**。
3. 打开 [GIT_GUIDE.md](GIT_GUIDE.md)，照着第 2 节"只用浏览器"做完一次：
   在 `docs/队友签名.md` 里加一行自己的名字，提一个合并请求。

走完这一次，你就已经会协作了——以后改剧情、传图片都是同一套流程。

---

## 路线三：想在自己电脑上把它跑起来（20 分钟）

适合：想看真实效果、要接 AI、要调页面的同学。

### 第 1 步：装 Node.js

> 只有这一步需要装东西。装一次，以后都不用装了。

1. 打开 <https://nodejs.org/zh-cn>，下载 **LTS 版本**（Windows 安装包 .msi）。
2. 双击安装，一路点"下一步"，不用改任何选项。
3. **装完之后，把它之前打开的黑色命令行窗口全部关掉**（不关掉可能不生效）。
4. 验证：按 `Win + R`，输入 `cmd`，回车。在黑窗口里输入：

```
node -v
```

能看到类似 `v22.11.0` 的一行字，就装好了。如果提示"不是内部或外部命令"，就是没装成功，或者没关掉旧窗口重开。

### 第 2 步：把项目拿到自己电脑上

**最省事的办法（不用装 Git）：**

1. 打开 <https://github.com/komoribi147/grassland-road-sign>
2. 点绿色的 **Code** 按钮 → **Download ZIP**
3. 解压到一个**路径里没有空格**的地方，例如 `D:\grassland-road-sign`

**会用一点 Git 的同学：**

```
git clone https://github.com/komoribi147/grassland-road-sign.git
```

### 第 3 步：跑起来

1. 打开解压出来的文件夹（能看到 `index.html`、`server` 这一层）。
2. 在文件夹地址栏里把路径清空，输入 `cmd`，回车——会打开一个定位到这个文件夹的黑窗口。
3. 在黑窗口里输入：

```
node server/server.mjs
```

4. 看到"草地上的路标 · 本地预览已启动"，就成功了。
5. 浏览器打开 <http://localhost:8787>。
6. 想关掉：回到黑窗口按 `Ctrl + C`。

### 第 4 步（可选）：接上大模型

现在不接也能玩完整故事（NPC 用剧本兜底台词）。等剧情定稿后再接，步骤见 [DEPLOY.md](DEPLOY.md) 第五节。

---

## 我该干什么？三个角色的第一步

| 你是 | 先做这件事 | 做完之后 |
| --- | --- | --- |
| 编剧 / 文案 | 通读 [剧本原文.docx](剧本原文.docx)，对照 `story/scenes/*.json` 找出现在不自然的地方 | 认领 Issue [#2](https://github.com/komoribi147/grassland-road-sign/issues/2) |
| 美术 / 音频 | 读 [ART_GUIDE.md](ART_GUIDE.md)，先出**一张**序章背景图 | 认领 Issue [#4](https://github.com/komoribi147/grassland-road-sign/issues/4) |
| 程序 / AI | 走路线三把项目跑起来，然后随便改一行 CSS 看效果 | 认领 Issue [#1](https://github.com/komoribi147/grassland-road-sign/issues/1) |

## 三件必须知道的事

1. **不要直接改 main 分支**。所有改动都走"开分支 → 提合并请求 → 别人点通过"。详见 [GIT_GUIDE.md](GIT_GUIDE.md)。
2. **改完剧情一定要跑一次**：
   ```
   node tools/check-story.mjs
   ```
   它会告诉你有没有写错的跳转、对不上的人物名、缺的图片。
3. **`.env` 和任何 Key 绝对不能提交**。那个文件已经在忽略名单里，不要手动上传。

## 卡住了怎么办

- 先翻 [GIT_GUIDE.md](GIT_GUIDE.md) 的"常见事故"那一节。
- 还没有答案，就在对应的 Issue 下面留言，或者截图发群里。
- **卡住不是你的问题，是文档没写清楚**——把这句话告诉组长，让他补文档。
