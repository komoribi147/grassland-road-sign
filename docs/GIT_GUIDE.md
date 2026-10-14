# 零基础协作指南（GitHub）

这份文档写给完全没碰过 GitHub 的队友。照着做，半小时就能上手。

## 0. 先搞清楚三件事

- **仓库（Repository）**：我们这个项目的文件夹，放在 GitHub 上，所有人共享同一份。
- **分支（Branch）**：你自己的一条工作线。你在自己的分支上怎么改都不会影响别人。
- **合并请求（Pull Request，简称 PR）**：你把分支合回主线（main）的申请。别人看过、点了通过，改动才会进 main。

一句话记住流程：**开任务 → 拉分支 → 改 → 提 PR → 合进 main。**

> 注意：main 现在已经没有审核要求了，**小改动你也可以直接改 main**（见第 5 节）。
> 下面这套 PR 流程依然值得学，大改动用它更稳。

## 1. 注册与加入（每人 5 分钟）

1. 到 <https://github.com> 注册账号（用常用邮箱，记住密码）。
2. 把账号名发给组长。
3. 组长在仓库页 `Settings → Collaborators → Add people` 里输入你的账号名，点添加。
4. 你会收到一封邮件，点里面的 **Accept invitation**。这一步不做，后面都改不了。

## 2. 最省事的改法：只用浏览器

适合改文案、改剧情、传图片。全程不需要装软件。

1. 打开仓库主页，进到你要改的文件（例如 `story/scenes/act3.json`）。
2. 点右上角铅笔图标 **Edit this file**。
3. 改内容。
4. 滚到底部，填一句"改了什么"。
5. **关键一步**（二选一）：
   - 小改动（改一句话、传一张图）→ 选 **Commit directly to the main branch**，直接提交，完事。
   - 大改动 → 选 **Create a new branch for this commit and start a pull request**，分支名写 `story/act3-tweak`，然后点 **Propose changes** → **Create pull request**。
6. 走了 PR 的话：在 PR 页面右边 **Reviewers** 里选一个队友，他看过之后点 **Merge pull request** 合进 main。

上传图片用 **Add file → Upload files**，同样走分支 + PR。

## 3. 干得多了以后：装个客户端

推荐 **GitHub Desktop**（<https://desktop.github.com>）或 **VS Code**。

GitHub Desktop 的循环是这样的：

1. `File → Clone repository` 把仓库拉到本机。
2. 左上角 **Current branch → New branch**，起个名字（例如 `art/bg-prologue`）。
3. 用记事本 / VS Code 改文件，改动会出现在左边列表里。
4. 左下角写一句提交说明，点 **Commit to art/bg-prologue**。
5. 点右上角 **Publish branch**（第一次）或 **Push origin**。
6. 网页上会出现 **Create Pull Request** 的提示，点进去写说明、指定审核人。

## 4. 冲突了怎么办

两个人同时改了同一行，Git 会提示冲突。别慌：

- 小改动：在 GitHub 网页上点 **Resolve conflicts**，删掉多余的那几行标记，提交。
- 看不懂：在 Issue 里喊人，或者把冲突页面截图发群里。**不要硬着头皮合。**
- 预防办法：动手前先声明"我要改第几幕 / 哪个文件"，大家尽量别碰同一个文件。

## 5. 仓库现在的协作设置（2026 年 10 月起）

**结论：谁都可以直接改 main，不需要等任何人批准。**

| 项目 | 现在的状态 |
| --- | --- |
| 分支保护 | 已取消，三位协作者都能直接提交、直接推 |
| 唯一的硬限制 | 不能强推覆盖历史，不能删 main 分支（防手滑） |
| 自动检查 | 每次推 main 都会跑剧本自检，写错了会亮红叉 |
| 自动发布 | **自检通过才发布**；写坏的版本不会上线，线上一直是上一个能用的版本 |
| 队友权限 | szy-11、gaoxuan566 已加入，权限和组长相同 |

所以你可以：

- 直接推 main（推荐小改动这样做）
- 或者拉分支 → 提合并请求（大改动推荐，好回滚、有人帮看）

### 如果以后想改回"必须审核"

跟组长说一声即可，一条命令就能恢复：main 要求合并请求 + 至少 1 人通过。
适合比赛前一周那种"谁都不许碰坏"的阶段。

## 6. Issue 怎么用

Issue 就是"任务卡"。我们准备了三种模板：

- **剧情/文本任务**：认领一幕剧情、史料卡校对
- **美术资源任务**：认领一张背景图
- **程序功能 / 问题反馈**

用法：`Issues → New issue` 选模板 → 填标题 → 提交。做完之后在 PR 说明里写 `Closes #编号`，合并时任务卡会自动关闭。

## 7. 常见事故

| 情况 | 处理 |
| --- | --- |
| 不小心改了 main | 立刻在群里说，别自己删文件；让组长开 PR 回退 |
| 提交了 `.env`（含大模型 Key） | **马上去讯飞控制台重置 Key**，再提交删除记录 |
| 传了几百 MB 的视频 | 别传进仓库，用网盘，仓库只放图和小音频 |
| 分支落后了、想同步最新 | GitHub Desktop 里 `Branch → Update from main` |
