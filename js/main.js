// 界面接线：标题页、史料卡、菜单、结尾报告。
import { StoryEngine } from "./engine.js";
import { Save } from "./save.js";

const $ = (id) => document.getElementById(id);
const screens = ["screenTitle", "screenLore", "screenMenu", "screenAbout", "screenReport"];

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

function showReport(r) {
  document.body.dataset.mode = "title";
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
    <p class="small">继续了解：把史料卡里没解锁的卡片找齐，或者换个活法重走一次——他们记住的是你说过的话。</p>
  `;
  openScreen("screenReport");
  renderLoreList();
}

// ---------- 启动 ----------

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
    $("aiBadge").textContent = online
      ? `AI 状态：在线（${engine.ai.model}）—— 你的每一句自由回答都由大模型即兴回应`
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
  const canned = [
    "我不记得了。醒过来就在这儿了。",
    "能走出去。老班长说能，就能。",
    "革命胜利了，我请你吃白面馍。",
    "我记住你了，李长河，河南信阳人。",
    "何大姐，你那个学生，我替你记着。",
  ];
  let idx = 0;
  const speed = Number(location.hash.match(/auto(\d+)/)?.[1] || 1400);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  boot().then(async () => {
    await wait(600);
    closeScreens();
    engine.startNew().catch(() => {});
    for (;;) {
      await wait(speed);
      const choice = document.querySelector(".choice-btn");
      if (choice) { choice.click(); continue; }
      const input = document.querySelector(".input-row input");
      if (input) {
        input.value = canned[idx++ % canned.length];
        await wait(200);
        document.querySelector(".input-row button")?.click();
        continue;
      }
      document.querySelector("#dialogue")?.click();
    }
  });
} else {
  boot();
}
