// 界面接线：标题页、史料卡、菜单、结尾报告。
import { StoryEngine } from "./engine.js?v=20261017-cn-site";
import { Save } from "./save.js";

const $ = (id) => document.getElementById(id);
const screens = ["screenTitle", "screenLore", "screenReplay", "screenMenu", "screenAbout", "screenReport", "screenTalk", "screenError"];

const engine = new StoryEngine({
  toast: showToast,
  report: showReport,
  stateChange: renderLoreCount,
});

// ---------- 通用界面 ----------

let toastTimer = 0;
function showToast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function openScreen(id) {
  for (const s of screens) $(s).hidden = s !== id;
}
function closeScreens() {
  for (const s of screens) $(s).hidden = true;
  document.body.dataset.mode = "playing";
}

function renderLoreCount() {
  $("loreCount").textContent = engine.state ? engine.state.lore.length : 0;
}

function renderLoreList() {
  const list = $("loreList");
  list.innerHTML = "";
  const unlocked = new Set(engine.state?.lore || []);
  for (const [id, card] of Object.entries(engine.lore)) {
    const div = document.createElement("div");
    div.className = "lore-card" + (unlocked.has(id) ? "" : " locked");
    const title = document.createElement("h3");
    title.textContent = unlocked.has(id) ? card.title : (card.lockedTitle || "尚未解锁");
    div.appendChild(title);
    if (unlocked.has(id)) {
      const body = document.createElement("p");
      body.textContent = card.text;
      div.appendChild(body);
      if (card.think) {
        const think = document.createElement("p");
        think.className = "think";
        think.textContent = `想一想：${card.think}`;
        div.appendChild(think);
      }
      if (card.sourceUrl && card.sourceTitle) {
        const source = document.createElement("p");
        source.className = "source";
        const link = document.createElement("a");
        link.href = card.sourceUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `史料参考：${card.sourceTitle}`;
        source.appendChild(link);
        div.appendChild(source);
      }
    } else {
      const body = document.createElement("p");
      body.textContent = "继续体验剧情后解锁。";
      div.appendChild(body);
    }
    list.appendChild(div);
  }
}

let lastReport = null;

function buildReportText(r) {
  return [
    "《草地上的路标》· 学习报告",
    "",
    `日期：${new Date().toLocaleString("zh-CN")}`,
    `他们对你的称呼：${r.address}`,
    `最终信任值：${r.trust}`,
    `你做出的选择：${r.choices} 次`,
    `你说出口的话：${r.words} 字`,
    `与他们对答：${r.turns} 轮`,
    `解锁史料卡：${r.lore}/${r.loreTotal}`,
    `用时：约 ${r.minutes} 分钟`,
    "",
    `你在这段路上遇到过：${r.met.join("、") || "——"}`,
    "",
    "结尾：",
    `　　${r.closing}`,
    "",
    "可以继续了解：",
    "　　松潘草地 · 班佑河 · 湘江战役 · 毛儿盖 · 长征中的女红军 · 1930年代初的河南",
  ].join("\n");
}

function showReport(r) {
  document.body.dataset.mode = "title";
  engine.showHud(false);
  lastReport = r;
  $("reportTitle").textContent = r.title;
  $("reportBody").innerHTML = `
    <p>${r.closing}</p>
    <div class="report-grid">
      <div class="report-cell"><div class="k">他们对你的称呼</div><div class="v">${r.address}</div></div>
      <div class="report-cell"><div class="k">信任值</div><div class="v">${r.trust}</div></div>
      <div class="report-cell"><div class="k">你做出的选择</div><div class="v">${r.choices}</div></div>
      <div class="report-cell"><div class="k">你说过的话</div><div class="v">${r.words} 字</div></div>
      <div class="report-cell"><div class="k">与 NPC 对话</div><div class="v">${r.turns} 轮</div></div>
      <div class="report-cell"><div class="k">史料卡</div><div class="v">${r.lore}/${r.loreTotal}</div></div>
    </div>
    <p class="small">你在这段路上遇到了：${r.met.join("、") || "——"}。用时约 ${r.minutes} 分钟。</p>
    ${r.picks?.length ? `<p class="small">你做过的选择：${r.picks.join("、")}</p>` : ""}
    ${r.said?.length ? `<p class="small">你自己说过的话：「${r.said.join("」「")}」</p>` : ""}
    <p class="small">继续了解：把史料卡里没解锁的卡片找齐，或者换个活法重走一次——他们记住的是你说过的话。</p>
  `;
  openScreen("screenReport");
  renderLoreList();
}

// ---------- 启动 ----------

// ---------- 自由对话：主角想说什么就说什么 ----------

let talkTarget = null;

function renderTalkWho() {
  const box = $("talkWho");
  box.innerHTML = "";
  const present = engine.state ? engine.presentNpcs() : [];
  if (!present.length) {
    box.innerHTML = '<div class="talk-empty">这会儿你身边没有人。</div>';
    return;
  }
  if (talkTarget && !present.includes(talkTarget)) talkTarget = present[0];
  present.forEach((id) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "who-chip" + (id === talkTarget ? " on" : "");
    btn.textContent = engine.characters[id]?.display || id;
    btn.addEventListener("click", () => {
      talkTarget = id;
      renderTalkWho();
      renderTalkLog();
      $("talkInput").focus();
    });
    box.appendChild(btn);
  });
}

function renderTalkLog() {
  const log = $("talkLog");
  log.innerHTML = "";
  if (!talkTarget) {
    log.innerHTML = '<div class="talk-empty">选一个人，跟他说点什么。</div>';
    return;
  }
  const mem = engine.memoryOf(talkTarget);
  if (!mem.length) {
    log.innerHTML = '<div class="talk-empty">你还没跟他说过话。他会记住你说的每一句。</div>';
    return;
  }
  for (const m of mem) {
    const div = document.createElement("div");
    div.className = "bubble " + (m.role === "player" ? "me" : "npc");
    div.textContent = m.text;
    if (m.mood) {
      const s = document.createElement("span");
      s.className = "mood";
      s.textContent = m.mood;
      div.appendChild(s);
    }
    log.appendChild(div);
  }
  log.scrollTop = log.scrollHeight;
}

function openTalk() {
  if (!engine.state) {
    showToast("先开始剧情，再开口说话。");
    return;
  }
  const present = engine.presentNpcs();
  if (!present.length) {
    showToast("这地方，一个人也看不见。");
    return;
  }
  talkTarget = present.includes(talkTarget) ? talkTarget : present[0];
  renderTalkWho();
  renderTalkLog();
  openScreen("screenTalk");
  setTimeout(() => $("talkInput").focus(), 60);
}

async function sendTalk() {
  const input = $("talkInput");
  const text = input.value.trim();
  if (!text || !talkTarget) return;
  input.value = "";

  const log = $("talkLog");
  const pending = document.createElement("div");
  pending.className = "bubble npc pending";
  pending.textContent = "……";
  log.appendChild(pending);
  log.scrollTop = log.scrollHeight;
  $("talkSend").disabled = true;

  const out = await engine.freeTalk(talkTarget, text);

  $("talkSend").disabled = false;
  renderTalkLog();
  if (out.trust) showToast(`信任 ${out.trust > 0 ? "+" : ""}${out.trust} · ${out.display}的反应`);
  input.focus();
}

$("btnTalk").addEventListener("click", openTalk);
$("talkSend").addEventListener("click", sendTalk);
$("talkInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); sendTalk(); }
});

// ---------- 语音入口：按住说话，松开发送 ----------
// 用浏览器自带的语音识别（Chrome / Edge / Safari），不装任何东西、不经过第三方。
// 剧情弹预选项时：可以点选项，也可以按住麦克风说自己的话。
// 「开口说话」面板开着时：说的话直接发给当前选中的 NPC。
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

async function routeVoice(text) {
  // 1. 剧情正停在预选项上：这句话就是回答
  if (engine.submitSpoken(text)) return;
  // 2. 「开口说话」面板开着：说给当前选中的 NPC
  if (!$("screenTalk").hidden && talkTarget) {
    const log = $("talkLog");
    const pending = document.createElement("div");
    pending.className = "bubble npc pending";
    pending.textContent = "……";
    log.appendChild(pending);
    log.scrollTop = log.scrollHeight;
    const out = await engine.freeTalk(talkTarget, text);
    renderTalkLog();
    if (out.trust) showToast(`信任 ${out.trust > 0 ? "+" : ""}${out.trust} · ${out.display}的反应`);
    return;
  }
  // 3. 其他时候：不打断剧情，轻轻说一句
  showToast("这会儿没人在等你说话");
}

function initVoice() {
  const btn = $("btnVoice");
  if (!SpeechRec || !btn) return;   // 浏览器不支持就藏起来，不影响任何人
  btn.hidden = false;

  const rec = new SpeechRec();
  rec.lang = "zh-CN";
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  let recording = false;
  const reset = () => {
    recording = false;
    btn.classList.remove("rec");
    $("voiceLabel").textContent = "";
  };

  rec.onresult = (e) => {
    const text = [...e.results].map((r) => r[0].transcript).join("").trim();
    if (text) routeVoice(text);
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      showToast("浏览器没拿到麦克风权限");
    } else if (e.error !== "aborted" && e.error !== "no-speech") {
      showToast("没听清，按住再说一次");
    }
  };
  rec.onend = reset;

  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (recording || !engine.state) return;
    try {
      rec.start();
      recording = true;
      btn.classList.add("rec");
      $("voiceLabel").textContent = "松开发送";
    } catch { /* 已经在听，忽略 */ }
  });
  const stop = () => { if (recording) { try { rec.stop(); } catch { /* 已经停了 */ } } };
  btn.addEventListener("pointerup", stop);
  btn.addEventListener("pointercancel", stop);
  btn.addEventListener("contextmenu", (e) => e.preventDefault());
}

initVoice();

// 音画预热由引擎的 warmScene 负责（当前幕+下一幕渐进预热），这里不重复预载。

let booting = false;
async function boot() {
  if (booting) { showToast("剧情数据还在路上，马上就好"); return; }   // 别让重复点击变成重复下载
  booting = true;
  try {
    await engine.load();
    $("screenError").hidden = true;
    renderLoreCount();
    $("btnResume").hidden = !Save.read();
  } catch (err) {
    // 数据下不下来就停下来等人，别让人对着一个点了没反应的页面猜
    $("errorDetail").textContent = String(err.message || err);
    openScreen("screenError");
  } finally {
    booting = false;
  }

  engine.ai.check().then((online) => {
    const chars = engine.ai.characters || {};
    const detail = Object.entries(chars)
      .filter(([id]) => !id.startsWith("narration") && !id.endsWith("old"))
      .map(([, info]) => `${info.model}${info.ready ? "" : "（缺 Key）"}`)
      .join(" / ");
    $("aiBadge").textContent = online
      ? `AI 状态：在线 —— 三个 NPC 各自独立：${detail}。你的每一句话都由他们自己对答。`
      : "AI 状态：离线台词模式（未启动本地服务或未配置大模型 Key，剧情仍可完整游玩）";
  });
}

// ---------- 按钮 ----------

$("btnStart").addEventListener("click", () => {
  if (!engine.ready) { boot(); return; }   // 数据没准备好：先重新加载，别让玩家点了个寂寞
  closeScreens();
  engine.startNew();
});

$("btnResume").addEventListener("click", () => {
  if (!engine.ready) { boot(); return; }
  const saved = Save.read();
  if (!saved) return;
  closeScreens();
  engine.resume(saved);
});

$("btnAbout").addEventListener("click", () => openScreen("screenAbout"));
$("btnAbout2").addEventListener("click", () => openScreen("screenAbout"));

$("btnLore").addEventListener("click", () => {
  renderLoreList();
  openScreen("screenLore");
});
$("btnMenu").addEventListener("click", () => openScreen("screenMenu"));

// ---------- 音量：菜单里的滑块，拖到多少就记多少 ----------

const VOLUME_KEY = "grassland-road-sign.volume.v1";

function applyVolume(v, persist = true) {
  const vol = engine.audio.setVolume(v);
  const pct = Math.round(vol * 100);
  $("volSlider").value = String(pct);
  $("volValue").textContent = `${pct}%`;
  if (persist) {
    try { localStorage.setItem(VOLUME_KEY, String(vol)); } catch { /* 忽略 */ }
  }
  return vol;
}

$("volSlider").addEventListener("input", (e) => applyVolume(Number(e.target.value) / 100));

// 打开页面就把上次的音量恢复回去
{
  let saved = 1;
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw != null) saved = Number(raw);
  } catch { /* 忽略 */ }
  applyVolume(Number.isFinite(saved) ? saved : 1, false);
}

// ---------- 回看：整份剧本都能翻，往前能回看、往后能跳过去 ----------

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let replayIdx = -1;
let replayArmed = false;   // 跳转要点两次：往回走会回退进度与信任值，往后走会快进
let allEntries = [];       // 整份剧本（每次打开重新摊平）
let viewEntries = [];      // 当前列表里真正显示的那些（搜过之后就是子集）

const whoOf = (who) => (!who ? "" : who === "__player__" ? "我" : engine.characters?.[who]?.display || who);

/**
 * 把整份剧本摊平成一张表：台词、画面、动作、选择点的提问和每个选项。
 * 以前只列"已经读过"的句子，现在没走到的地方也在表里（显示成灰的），
 * 这样既能往回翻，也能直接跳到后文。
 */
function scriptEntries() {
  const out = [];
  for (const scene of Object.values(engine.scenes || {})) {
    (scene.steps || []).forEach((s, i) => {
      const at = { scene: scene.id, step: i, key: String(i) };
      if (s.t === "say" && s.text) {
        out.push({ ...at, kind: "say", who: whoOf(s.who), text: engine.interpolate(s.text) });
      } else if (s.t === "visual") {
        out.push({ ...at, kind: "shot", label: "画面", text: s.description || "（画面）", visual: s.visual });
      } else if (s.t === "action") {
        out.push({ ...at, kind: "action", label: "动作", text: s.label || "（动作）", visual: s.visual });
      } else if (s.t === "choose" || s.t === "select") {
        if (s.prompt) out.push({ ...at, kind: "prompt", label: "提问", text: engine.interpolate(s.prompt) });
        (s.options || []).forEach((o, oi) => {
          out.push({ ...at, kind: "option", label: "选", key: `${i}:o${oi}`, text: engine.interpolate(o.text), visual: o.visual });
        });
      }
    });
  }
  return out;
}

/** 你现在在哪一句：当前位置之前最后一条非选项 */
function currentEntryIndex() {
  if (!engine.state) return -1;
  const here = engine.rank(engine.state.sceneId, engine.state.step);
  let best = -1;
  allEntries.forEach((l, i) => {
    if (l.kind !== "option" && engine.rank(l.scene, l.step) <= here) best = i;
  });
  return best;
}

/**
 * 这一条配的是哪张画面：读过的用当时记下的，没读到的按剧本往前找最近一处画面。
 * 规则和"跳到这一句"用的是同一套（engine.pictureAt），所以翻到的画面
 * 和真跳过去之后屏幕上那张一定一致。
 */
function pictureFor(entry) {
  if (!entry) return null;
  return engine.pictureAt(entry.scene, entry.step, entry);
}

function updateReplayPos() {
  const n = viewEntries.length;
  $("replayPos").textContent = n ? `${replayIdx + 1} / ${n}` : "";
}

function focusReplay(i, scroll = true) {
  const rows = [...$("replayList").querySelectorAll(".rl-row")];
  if (!rows.length) return;
  const max = viewEntries.length - 1;
  replayIdx = Math.max(0, Math.min(max, i));
  rows.forEach((el) => el.classList.toggle("on", Number(el.dataset.i) === replayIdx));
  const el = $("replayList").querySelector(`.rl-row[data-i="${replayIdx}"]`);
  if (el && scroll) scrollListToCenter($("replayList"), el);
  updateReplayPos();
  updateReplayPick();
}

/** 只滚列表自己，绝不带着整个页面跑（用 scrollIntoView 会把 body 一起滚，页面会不可控地上移） */
function scrollListToCenter(list, row) {
  const lr = list.getBoundingClientRect();
  const rr = row.getBoundingClientRect();
  const delta = rr.top - lr.top - (lr.height - rr.height) / 2;
  list.scrollTo({ top: Math.max(0, list.scrollTop + delta), behavior: "smooth" });
}

/** 底部那条：显示选中哪一句、这一句在前面还是后面，决定按钮怎么写 */
function updateReplayPick() {
  const go = $("btnReplayGo");
  const l = viewEntries[replayIdx];
  replayArmed = false;
  const ahead = l && engine.rank(l.scene, l.step) > engine.rank(engine.state?.sceneId, engine.state?.step ?? 0);
  go.textContent = ahead ? "跳到这一句" : "从这句重新走";
  if (!l) {
    go.disabled = true;
    $("replayPick").textContent = "选中一条，就能跳过去";
    paintReplayShot(null);
    return;
  }
  go.disabled = false;
  const head = l.kind === "say" ? `${esc(l.who)}：` : `${l.label}：`;
  const text = l.text.length > 24 ? l.text.slice(0, 24) + "…" : l.text;
  const seen = engine.hasSeen(l.scene, l.key);
  $("replayPick").textContent = `${ahead ? "往后" : "已读过"}　${l.scene}:${l.step}　${head}${text}`
    + (seen ? "" : "（还没走到）");
  paintReplayShot(l, pictureFor(l));
}

/**
 * 这句当时配的是哪张画面：用和舞台一样的裁切画在小框里。
 * 以前回看只记了文字，所以翻到的句子和屏幕上那张画面对不上。
 */
let replayShotSeq = 0;
async function paintReplayShot(entry, visual) {
  const box = $("replayShot");
  if (!box) return;
  const seq = ++replayShotSeq;
  if (!visual || (!visual.sheet && !visual.src)) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const sheetNo = visual.sheet && /sheet-(\d+)/.exec(visual.sheet);
  $("replayShotNote").textContent = sheetNo
    ? `分镜 ${sheetNo[1]} · 第 ${Number(visual.panel) + 1} 格`
    : "独立画面";
  try {
    await engine.paintPreview($("replayCanvas"), visual, () => seq === replayShotSeq);
  } catch { /* 图还没下好，或者文件缺失，留空即可 */ }
}

/** 渲染列表：term 为空 = 整份剧本；默认把光标停在"你现在这一句"上 */
function renderReplay(term = "", toCurrent = true) {
  const q = String(term || "").trim().toLowerCase();
  allEntries = scriptEntries();
  viewEntries = allEntries.filter((l) => !q
    || `${l.text} ${l.who || ""} ${l.label || ""} ${l.scene}:${l.step}`.toLowerCase().includes(q));
  const mark = (l) => `${l.scene}:${l.step}:${l.key}`;
  const cur = currentEntryIndex();
  const curKey = cur >= 0 ? mark(allEntries[cur]) : "";

  $("replayList").innerHTML = viewEntries.length
    ? viewEntries.map((l, i) => {
      const key = mark(l);
      const cls = ["rl-row"];
      if (i === replayIdx) cls.push("on");
      if (l.kind === "option") cls.push("option");
      if (!engine.hasSeen(l.scene, l.key)) cls.push("unread");
      if (key === curKey) cls.push("cur");
      const head = l.kind === "say"
        ? `<span class="rl-who">${esc(l.who)}：</span>`
        : `<span class="rl-kind">${esc(l.label || "画面")}</span>`;
      return `<div class="${cls.join(" ")}" data-i="${i}" title="${esc(l.text)}">`
        + `<span class="rl-idx">${key === curKey ? "▸ " : ""}${l.scene}:${l.step}</span>`
        + `<span>${head}<span class="rl-text">${esc(l.text)}</span></span></div>`;
    }).join("")
    : `<p class="panel-note">${allEntries.length ? "没有匹配的内容。" : "剧本还没读进来。"}</p>`;
  $("replayList").querySelectorAll(".rl-row").forEach((el) => {
    el.addEventListener("click", () => focusReplay(Number(el.dataset.i)));
  });
  if (viewEntries.length) {
    const at = toCurrent && curKey ? viewEntries.findIndex((l) => mark(l) === curKey) : 0;
    focusReplay(at >= 0 ? at : 0);
  } else {
    replayIdx = -1;
    updateReplayPos();
  }
}

/** 输入 act3:47 / 47 / 任意关键词，把光标移过去（整份剧本里找，不只是读过的） */
function replayJump(raw) {
  const t = String(raw || "").trim();
  if (!t) return false;
  allEntries = scriptEntries();
  const m = t.match(/^([a-z0-9]+)\s*:\s*(\d+)$/i);
  let hit = null;
  if (m) hit = allEntries.find((l) => l.scene.toLowerCase() === m[1].toLowerCase() && l.step === Number(m[2]));
  else if (/^\d+$/.test(t)) hit = allEntries.findLast((l) => l.step === Number(t));
  else hit = allEntries.find((l) => `${l.text} ${l.who || ""}`.includes(t));
  if (!hit) {
    $("replayPos").textContent = "剧本里没有这一句";
    return false;
  }
  renderReplay("", false);          // 先展开全部，保证那一行在列表里
  const at = viewEntries.findIndex((l) => l.scene === hit.scene && l.step === hit.step && l.key === hit.key);
  focusReplay(at >= 0 ? at : 0);
  return true;
}

$("btnReplay").addEventListener("click", () => {
  $("replayQ").value = "";
  replayIdx = -1;
  openScreen("screenReplay");
  renderReplay("", true);           // 打开时停在"你现在这一句"
});
$("replayQ").addEventListener("input", (e) => renderReplay(e.target.value, false));
$("replayQ").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const v = e.target.value.trim();
  if (/^([a-z0-9]+\s*:\s*\d+|\d+)$/i.test(v)) replayJump(v);
  else renderReplay(v, false);
});
$("btnReplayPrev").addEventListener("click", () => focusReplay(replayIdx - 1));
$("btnReplayNext").addEventListener("click", () => focusReplay(replayIdx + 1));
$("btnReplayGo").addEventListener("click", async () => {
  const l = viewEntries[replayIdx];
  if (!l) return;
  const go = $("btnReplayGo");
  const ahead = engine.rank(l.scene, l.step) > engine.rank(engine.state?.sceneId, engine.state?.step ?? 0);
  if (!replayArmed) {
    replayArmed = true;
    go.textContent = ahead ? "真的跳过去？（中间的内容会快进）" : "真的回到这里？（会回退进度和信任值）";
    setTimeout(() => {
      if (replayArmed) {
        replayArmed = false;
        go.textContent = ahead ? "跳到这一句" : "从这句重新走";
      }
    }, 6000);
    return;
  }
  replayArmed = false;
  closeScreens();
  await engine.jumpTo(l.scene, l.step);
});

$("btnSave").addEventListener("click", () => {
  engine.autosave();
  showToast("进度已保存");
});

$("btnToggleSound").addEventListener("click", (e) => {
  const on = !engine.audio.enabled;
  engine.audio.setEnabled(on);
  e.target.textContent = `音效：${on ? "开" : "关"}`;
});

$("btnRestart").addEventListener("click", () => {
  Save.clear();
  closeScreens();
  engine.startNew();
});

$("btnRetry").addEventListener("click", () => {
  $("errorDetail").textContent = "正在重新下载…";
  boot();
});

$("btnReportClose").addEventListener("click", () => {
  Save.clear();
  openScreen("screenTitle");
  $("btnResume").hidden = true;
});

$("btnReportSave").addEventListener("click", () => {
  if (!lastReport) return;
  const blob = new Blob([buildReportText(lastReport)], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "草地上的路标-学习报告.txt";
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("学习报告已保存");
});

// 浏览器要求先有用户操作才允许播放声音，第一次点屏幕时补上环境音
const resumeAudio = () => {
  engine.audio.resume();
  document.removeEventListener("pointerdown", resumeAudio);
};
document.addEventListener("pointerdown", resumeAudio);

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    $(btn.dataset.close).hidden = true;
    if (engine.state) document.body.dataset.mode = "playing";
  });
});

// 键盘：空格 / 回车推进（避免在输入框里触发）
document.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "Escape") closeScreens();
});

// ---------- 演示模式 ----------
// 网址后面加 #auto 就会自动播放：展台演示、录制视频时用。
if (location.hash.includes("auto")) {
  const speed = Number(location.hash.match(/auto(\d+)/)?.[1] || 1400);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  boot().then(async () => {
    await wait(600);
    closeScreens();
    engine.startNew().catch(() => {});
    for (;;) {
      await wait(speed);
      const visible = (el) => el && el.offsetParent !== null;
      const choice = [...document.querySelectorAll("#dialogue .choice-btn")].find(visible);
      if (choice) { choice.click(); continue; }
      document.querySelector("#dialogue")?.click();
    }
  });
} else {
  boot();
}
