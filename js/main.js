// 界面接线：标题页、史料卡、菜单、结尾报告。
import { StoryEngine } from "./engine.js?v=20261016-crop";
import { Save } from "./save.js";

const $ = (id) => document.getElementById(id);
const screens = ["screenTitle", "screenLore", "screenReplay", "screenMenu", "screenAbout", "screenReport", "screenTalk"];

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
    if (unlocked.has(id)) {
      div.innerHTML = `<h3>${card.title}</h3><p>${card.text}</p>` +
        (card.think ? `<p class="think">想一想：${card.think}</p>` : "");
    } else {
      div.innerHTML = `<h3>${card.lockedTitle || "尚未解锁"}</h3><p>继续体验剧情后解锁。</p>`;
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

async function boot() {
  try {
    await engine.load();
  } catch (err) {
    showToast(`剧情数据读取失败：${err.message}`);
    return;
  }
  renderLoreCount();
  $("btnResume").hidden = !Save.read();

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
  closeScreens();
  engine.startNew();
});

$("btnResume").addEventListener("click", () => {
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

// ---------- 回看：翻已经读过的内容，可以搜、可以跳到指定某句 ----------

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let replayIdx = -1;
let replayArmed = false;   // 「从这句重新走」要点两次：改动会回退进度与信任值
const replayLog = () => ((engine.state && engine.state.log) || []).filter((entry) => entry.kind === "s");

function updateReplayPos() {
  const n = replayLog().length;
  $("replayPos").textContent = n ? `${replayIdx + 1} / ${n}` : "";
}

function focusReplay(i, scroll = true) {
  const rows = [...$("replayList").querySelectorAll(".rl-row")];
  if (!rows.length) return;
  const max = replayLog().length - 1;
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

/** 底部那条：显示当前选中句，并决定「从这句重新走」能不能点 */
function updateReplayPick() {
  const go = $("btnReplayGo");
  const l = replayLog()[replayIdx];
  replayArmed = false;
  go.textContent = "从这句重新走";
  if (!l) {
    go.disabled = true;
    $("replayPick").textContent = "选中一条，就能从这里重新走";
    paintReplayShot(null);
    return;
  }
  go.disabled = false;
  const head = l.kind === "n" ? "" : `${l.who}：`;
  const text = l.text.length > 26 ? l.text.slice(0, 26) + "…" : l.text;
  $("replayPick").textContent = `当前：${l.scene}:${l.step}　${head}${text}`;
  paintReplayShot(l);
}

/**
 * 这句当时配的是哪张画面：用和舞台一样的裁切画在小框里。
 * 以前回看只记了文字，所以翻到的句子和屏幕上那张画面对不上。
 */
let replayShotSeq = 0;
async function paintReplayShot(entry) {
  const box = $("replayShot");
  if (!box) return;
  const visual = entry && entry.visual;
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

/** 只列已经走到过的句子；term 为空 = 全部 */
function renderReplay(term = "", focusLast = true) {
  const q = String(term || "").trim().toLowerCase();
  const list = replayLog();
  const rows = list.map((l, i) => ({ l, i }))
    .filter(({ l }) => !q || `${l.text} ${l.who} ${l.scene}:${l.step}`.toLowerCase().includes(q));
  $("replayList").innerHTML = rows.length
    ? rows.map(({ l, i }) => `<div class="rl-row${i === replayIdx ? " on" : ""}" data-i="${i}" title="跳到这一句">
        <span class="rl-idx">${l.scene}:${l.step}</span>
        <span><span class="rl-who">${l.kind === "n" ? "" : esc(l.who) + "："}</span><span class="rl-text${l.kind === "n" ? " narration" : ""}">${esc(l.text)}</span></span>
      </div>`).join("")
    : `<p class="panel-note">${list.length ? "没有匹配的句子。" : "还没开始读。走几句剧情再回来。"}</p>`;
  $("replayList").querySelectorAll(".rl-row").forEach((el) => {
    el.addEventListener("click", () => focusReplay(Number(el.dataset.i)));
  });
  if (rows.length) {
    replayIdx = focusLast ? rows[rows.length - 1].i : rows[0].i;
    focusReplay(replayIdx);
  } else {
    replayIdx = -1;
    updateReplayPos();
  }
}

/** 输入 act3:47 / 47 / 任意关键词，把光标移过去 */
function replayJump(raw) {
  const t = String(raw || "").trim();
  if (!t) return false;
  const list = replayLog();
  const m = t.match(/^([a-z0-9]+)\s*:\s*(\d+)$/i);
  let idx = -1;
  if (m) idx = list.findIndex((l) => l.scene.toLowerCase() === m[1].toLowerCase() && l.step === Number(m[2]));
  else if (/^\d+$/.test(t)) idx = list.findLastIndex((l) => l.step === Number(t));
  else idx = list.findIndex((l) => `${l.text} ${l.who}`.includes(t));
  if (idx < 0) {
    $("replayPos").textContent = "还没读到这一句";
    return false;
  }
  renderReplay("", false);          // 先展开全部，保证那一行在列表里
  focusReplay(idx);
  return true;
}

$("btnReplay").addEventListener("click", () => {
  $("replayQ").value = "";
  replayIdx = -1;
  openScreen("screenReplay");
  renderReplay("", true);           // 打开时停在最后一条（刚看过的那句）
});
$("replayQ").addEventListener("input", (e) => renderReplay(e.target.value, true));
$("replayQ").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const v = e.target.value.trim();
  if (/^([a-z0-9]+\s*:\s*\d+|\d+)$/i.test(v)) replayJump(v);
  else renderReplay(v, false);
});
$("btnReplayPrev").addEventListener("click", () => focusReplay(replayIdx - 1));
$("btnReplayNext").addEventListener("click", () => focusReplay(replayIdx + 1));
$("btnReplayGo").addEventListener("click", async () => {
  const l = replayLog()[replayIdx];
  if (!l) return;
  const go = $("btnReplayGo");
  if (!replayArmed) {
    replayArmed = true;
    go.textContent = "真的回到这里？（会回退进度和信任值）";
    setTimeout(() => {
      if (replayArmed) { replayArmed = false; go.textContent = "从这句重新走"; }
    }, 6000);
    return;
  }
  replayArmed = false;
  go.textContent = "从这句重新走";
  closeScreens();
  await engine.rewindTo(l.scene, l.step);
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
