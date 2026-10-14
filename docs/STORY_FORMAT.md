# 剧情数据写法（写给编剧）

剧情写在 `story/scenes/*.json` 里。你不需要会编程，只要照着下面的"积木"拼句子。

## 一个场景长什么样

```json
{
  "id": "act3",
  "title": "第三幕 · 路标",
  "bg": "assets/bg/act3-rain-markers.jpg",
  "tone": ["#3f4841", "#141a16"],
  "ambient": "rain",
  "present": ["li-changhe", "shitou", "he-xiuying"],
  "situation": "第三天夜里，队伍走散了，只剩下你们几个和三个伤员。",
  "steps": [
    { "t": "narrate", "text": "第三天。雨又下起来了，比之前更大。" },
    { "t": "say", "who": "li-changhe", "text": "往北。看到那棵歪脖子树没有？" }
  ]
}
```

- `id`：这一幕的编号，不能和别的幕重复。
- `title`：显示在页面左上角。
- `bg` / `tone`：背景图路径 + 缺图时的渐变底色（缺图不影响玩）。
- `ambient`：`"rain"` 一直下雨，`""` 不下雨。
- `present`：这一幕里在场的人。玩家随时可以点「开口说话」找他们聊；写成 `[]` 就是身边没人。
- `situation`：给大模型的一句话情境说明，写清楚"此刻正在发生什么"，NPC 主动聊天时靠它不出戏。
- `steps`：一幕里从上到下执行的步骤。

## 九种积木

### 1. 旁白
```json
{ "t": "narrate", "text": "雨落在后背上，很轻，很冷。" }
```

### 2. 台词
```json
{ "t": "say", "who": "li-changhe", "text": "跟着走。" }
```
`who` 只能是 `story/characters.json` 里有的：`li-changhe`（老班长）、`shitou`（石头）、`he-xiuying`（何大姐）、`he-xiuying-old`（晚年的何秀英）、`__player__`（玩家自己）。

### 3. 心里话
```json
{ "t": "think", "text": "你说不清自己是哪个连的。" }
```

### 4. 让玩家选

> **重要**：玩家的**台词**一律不用这个，用第 5 条的自由输入。
> 这个只用来写**动作**上的二选一（接过鞋 / 把手缩回去）。

```json
{
  "t": "choose",
  "options": [
    { "text": "接过布鞋", "trust": 8, "why": "接住了别人的东西" },
    { "text": "把手缩回去", "trust": -5, "why": "没有接" }
  ]
}
```
`trust` 是信任值变化；`goto` 可选，写了就跳到别的地方。

### 5. 玩家自由回答（接大模型）
```json
{
  "t": "input",
  "key": "answer_victory",
  "ai": "li-changhe",
  "situation": "夜里在草地上，老班长偷偷问你：革命胜利了是什么样。",
  "hint": "你想怎么说？（按回车）",
  "trust": 3,
  "fallback": ["嗯。那我要走到那天。"]
}
```
- `ai`：由哪个角色接话。
- `situation`：**必须写清楚此刻发生了什么**，大模型靠这句话不出戏。
- `fallback`：没网 / 没配 Key 时用的台词，**必填**，也是给大模型兜底的人格示范。
- `trust`：**只有兜底时才会用到**。有 AI 的时候，信任值由 NPC 听完玩家的话自己判断（规则写在 `characters.json` 的 `judge` 里），剧本里的数字管不着。
- `fallback` 也可以分档：`[{ "minTrust": 80, "text": "……" }]`，信任值到了才会用。
- `after` 可选：回复完之后再补几句旁白，写法是 `"after": [{ "t": "narrate", "text": "……" }]`。

### 6. 必须点一下的动作
```json
{ "t": "action", "label": "站起来", "hint": "点一下，才算真的站起来" }
```
用来制造"我得动手"的感觉，比如站起来、递木棍、插木棍、走近老班长。

### 7. 给信任值 / 记变量
```json
{ "t": "trust", "delta": 15, "why": "一起把石头拉了上来" }
{ "t": "var", "set": { "story": "forgot" } }
```

### 8. 解锁史料卡 / 换背景 / 放音效
```json
{ "t": "lore", "card": "xiangjiang" }
{ "t": "bg", "src": "assets/bg/act4-signpost.jpg", "tone": ["#4c5044", "#14170f"] }
{ "t": "sfx", "name": "bugle" }
```
`card` 必须是 `story/lore.json` 里的编号。

### 9. 跳转与分支
```json
{ "t": "label", "name": "rejoin" }
{ "t": "goto", "scene": "act1" }
{ "t": "goto", "scene": "prologue:rejoin" }
{ "t": "if", "cond": { "var": "trust", "op": ">=", "value": 50 }, "goto": "act3:deep" }
{ "t": "end", "title": "走出草地", "text": "他让我记住。我记了一辈子。" }
```
- `label` 是给自己设的路牌，`goto` 可以跳到"某一幕的第几块积木"。
- `if` 里的条件：`op` 可以是 `>=` `>` `<=` `<` `==` `!=`；`var` 写 `trust`（信任值）或 `var.变量名`。
- `end` 结束全片，弹出学习报告。

## 两个小魔法

- 台词里写 `{player}`，页面会自动换成当前称呼（你 → 同志 → 文书）。
- 台词里写 `{var:answer_victory}`，会把玩家当时说过的话填进去，实现"NPC 记得你说过什么"。

## 改完必须做的两件事

```bash
node tools/check-story.mjs     # 自检：跳转、人物、史料卡编号
```

再打开网页，从头点到你改的地方看一眼。

## 三条写作纪律

1. 不喊口号，用细节说话。
2. 不用 1949 年之后的词汇。
3. 史实不能编。虚构人物可以，时间地点战役不行。

标了 `"draft": true` 的步骤，是程序同学代笔的过渡句，需要主笔编剧确认或改写。`node tools/check-story.mjs` 会把它们列出来。
