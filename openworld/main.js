// 《草地上的路标》开放世界原型
// 目标：先证明"在草地上自由走、自由说话、会迷路、会陷泥、要给后面的人插路标"这套玩法成立。
// 地块和人物现在都是色块占位，美术（贴图、行走图）由美术同学按 docs/OPENWORLD.md 的规格补上。

const TILE = 40;                 // 一块地多大（像素）
const MAP_W = 64, MAP_H = 48;    // 地图多少块
const VISION = 6.5;              // 看得见几块地（剧本：雾大，五步外看不见人）

const T = { DRY: 0, GRASS: 1, TALL: 2, WATER: 3, MUD: 4, RIVER: 5 };
const COLOR = {
  [T.DRY]:   [106, 104, 82],
  [T.GRASS]: [74, 90, 69],
  [T.TALL]:  [58, 74, 56],
  [T.WATER]: [59, 74, 82],
  [T.MUD]:   [42, 38, 34],
  [T.RIVER]: [74, 106, 120],
};
const SPEED = { [T.DRY]: 1.15, [T.GRASS]: 1, [T.TALL]: 0.72, [T.WATER]: 0.5, [T.MUD]: 0, [T.RIVER]: 0 };

// ---------- 地图生成（固定种子，每次打开一样）----------

function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

const terrain = new Uint8Array(MAP_W * MAP_H);
for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    let n = noise(x / 9, y / 9, 7) * 0.68 + noise(x / 3.6, y / 3.6, 13) * 0.32;
    n += Math.max(0, (x - MAP_W * 0.7) / (MAP_W * 0.3)) * 0.42;   // 东边地势高，通往班佑河
    n += Math.max(0, (7 - x) / 7) * 0.26;                          // 出发点稍微干一点
    let t;
    if (x >= MAP_W - 3) t = T.RIVER;
    else if (n > 0.63) t = T.DRY;
    else if (n > 0.47) t = T.GRASS;
    else if (n > 0.36) t = T.TALL;
    else if (n > 0.27) t = T.WATER;
    else t = T.MUD;
    terrain[y * MAP_W + x] = t;
  }
}
const at = (x, y) => (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) ? T.RIVER : terrain[(y | 0) * MAP_W + (x | 0)];
// 注意：泥沼是"能走进去、进去就出不来"，不能设成不可通行，否则永远不会陷进去
const walkable = (x, y) => at(x, y) !== T.RIVER;
const safeGround = (x, y) => at(x, y) !== T.RIVER && at(x, y) !== T.MUD;

// 出发点周围清出一块能站人的干地，省得一睁眼就陷在泥里
for (let y = 18; y <= 30; y++) {
  for (let x = 4; x <= 16; x++) {
    const i = y * MAP_W + x;
    if (terrain[i] === T.MUD || terrain[i] === T.WATER) {
      terrain[i] = noise(x / 5, y / 5, 3) > 0.5 ? T.GRASS : T.DRY;
    }
  }
}

// ---------- 状态 ----------

const state = {
  player: { x: 8.5 * TILE, y: 24.5 * TILE, vx: 0, vy: 0, face: 1 },
  moveTarget: null,
  keys: new Set(),
  explored: new Uint8Array(MAP_W * MAP_H),
  marks: [],
  trust: 0,
  stuck: false, stuckAt: 0, rescued: false,
  learned: false,
  done: false,
  npcs: {},
  talking: null,
  memory: {},
  answers: [],
};

const NPCS = [
  { id: "li-changhe", x: 10.2 * TILE, y: 24.0 * TILE, color: "#8a8577", off: [-38, 16], speed: 0.92 },
  { id: "shitou",     x: 9.6 * TILE,  y: 25.9 * TILE, color: "#7d8a6a", off: [34, 24],  speed: 1.02 },
  { id: "he-xiuying", x: 11.0 * TILE, y: 25.2 * TILE, color: "#8f7f7a", off: [-6, 46],  speed: 0.95 },
];

let characters = {};
const $ = (id) => document.getElementById(id);

const canvas = $("game");
const ctx = canvas.getContext("2d");
let view = { w: 0, h: 0, dpr: 1 };

function resize() {
  view.dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = window.innerWidth;
  view.h = window.innerHeight;
  canvas.width = view.w * view.dpr;
  canvas.height = view.h * view.dpr;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
}
window.addEventListener("resize", resize);
resize();

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const tileDist = (ax, ay, bx, by) => Math.hypot((ax - bx) / TILE, (ay - by) / TILE);

function address() { return state.trust >= 80 ? "文书" : state.trust >= 50 ? "同志" : "你"; }

let toastTimer = 0;
function toast(text, ms = 2600) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

// ---------- 渲染 ----------

function draw() {
  const px = state.player.x, py = state.player.y;
  let camX = px - view.w / 2, camY = py - view.h / 2;
  camX = Math.max(0, Math.min(MAP_W * TILE - view.w, camX));
  camY = Math.max(0, Math.min(MAP_H * TILE - view.h, camY));
  if (MAP_W * TILE < view.w) camX = (MAP_W * TILE - view.w) / 2;
  if (MAP_H * TILE < view.h) camY = (MAP_H * TILE - view.h) / 2;

  ctx.fillStyle = "#0b0f0d";
  ctx.fillRect(0, 0, view.w, view.h);

  const x0 = Math.max(0, Math.floor(camX / TILE) - 1);
  const y0 = Math.max(0, Math.floor(camY / TILE) - 1);
  const x1 = Math.min(MAP_W - 1, Math.ceil((camX + view.w) / TILE));
  const y1 = Math.min(MAP_H - 1, Math.ceil((camY + view.h) / TILE));
  const pt = { x: px / TILE, y: py / TILE };

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * MAP_W + x;
      const d = Math.hypot(x + 0.5 - pt.x, y + 0.5 - pt.y);
      let alpha;
      if (d <= VISION) alpha = 1;
      else if (state.explored[i]) alpha = 0.26;
      else continue;

      const t = terrain[i];
      const v = (hash2(x, y, 99) - 0.5) * 16;
      const c = COLOR[t];
      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${c[0] + v | 0},${c[1] + v | 0},${c[2] + v | 0})`;
      const sx = Math.round(x * TILE - camX), sy = Math.round(y * TILE - camY);
      ctx.fillRect(sx, sy, TILE + 1, TILE + 1);

      // 一点细节，免得全是纯色块
      ctx.globalAlpha = alpha * 0.5;
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      if (t === T.TALL) {
        for (let k = 0; k < 3; k++) {
          const gx = sx + 8 + k * 12 + hash2(x, y, k) * 5;
          const gy = sy + 12 + hash2(x, y, k + 9) * 18;
          ctx.moveTo(gx, gy + 8); ctx.lineTo(gx + 1, gy - 2);
        }
      } else if (t === T.WATER || t === T.RIVER) {
        ctx.moveTo(sx + 6, sy + 20); ctx.lineTo(sx + 30, sy + 20);
        ctx.moveTo(sx + 12, sy + 30); ctx.lineTo(sx + 34, sy + 30);
      } else if (t === T.MUD) {
        ctx.arc(sx + 14, sy + 16, 4, 0, 6.3);
        ctx.moveTo(sx + 28, sy + 28); ctx.arc(sx + 26, sy + 27, 3, 0, 6.3);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // 路标
  for (const m of state.marks) {
    const d = tileDist(m.x, m.y, px, py);
    if (d > VISION && !state.explored[(m.y / TILE | 0) * MAP_W + (m.x / TILE | 0)]) continue;
    const sx = m.x - camX, sy = m.y - camY;
    ctx.globalAlpha = d > VISION ? 0.45 : 1;
    ctx.strokeStyle = "#6b5a45";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(sx, sy + 6); ctx.lineTo(sx, sy - 20); ctx.stroke();
    ctx.fillStyle = "#c8553d";
    ctx.beginPath();
    ctx.moveTo(sx + 1, sy - 20); ctx.lineTo(sx + 15, sy - 15); ctx.lineTo(sx + 1, sy - 10);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // 人
  for (const npc of Object.values(state.npcs)) {
    const d = tileDist(npc.x, npc.y, px, py);
    if (d > VISION + 1) continue;
    drawPerson(npc.x - camX, npc.y - camY, npc.color, d <= VISION);
    if (d <= 2.2) {
      ctx.fillStyle = "rgba(232,228,218,.85)";
      ctx.font = '12px "PingFang SC", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(characters[npc.id]?.display || npc.id, npc.x - camX, npc.y - camY - 26);
    }
  }
  drawPerson(px - camX, py - camY, "#c8c2b4", true);

  // 泥沼警示光圈（踩上去了）
  if (state.stuck) {
    ctx.strokeStyle = "rgba(200,85,61,.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px - camX, py - camY, 26 + Math.sin(performance.now() / 160) * 4, 0, 6.3);
    ctx.stroke();
  }
}

function drawPerson(x, y, color, lit) {
  ctx.globalAlpha = lit ? 1 : 0.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 9, 11, 0, 0, 6.3);   // 身子
  ctx.fill();
  ctx.fillStyle = "rgba(232,228,218,.9)";
  ctx.beginPath();
  ctx.arc(x, y - 12, 7, 0, 6.3);             // 头
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 9, 11, 0, 0, 6.3);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ---------- 每帧更新 ----------

let last = performance.now();
function step(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  updatePlayer(dt);
  updateNpcs(dt);
  updateVision();
  updateHud();
  draw();
  requestAnimationFrame(step);
}

function updatePlayer(dt) {
  const p = state.player;
  if (state.done || state.talking) return;

  if (state.stuck) {
    // 陷住了：挣扎没有用。身边没人来拉的话，自己慢慢爬出来
    if (performance.now() - state.stuckAt > 2500 && !state.rescued) {
      state.rescued = true;
      escapeMud("你自己爬了出来，浑身都是泥。");
    }
    return;
  }

  let dx = 0, dy = 0;
  const k = state.keys;
  if (k.has("a") || k.has("arrowleft")) dx -= 1;
  if (k.has("d") || k.has("arrowright")) dx += 1;
  if (k.has("w") || k.has("arrowup")) dy -= 1;
  if (k.has("s") || k.has("arrowdown")) dy += 1;

  if (dx || dy) {
    state.moveTarget = null;
  } else if (state.moveTarget) {
    const tx = state.moveTarget.x - p.x, ty = state.moveTarget.y - p.y;
    const len = Math.hypot(tx, ty);
    if (len > 6) { dx = tx / len; dy = ty / len; } else { state.moveTarget = null; }
  }
  if (!dx && !dy) return;

  const norm = Math.hypot(dx, dy) || 1;
  const here = at(p.x / TILE, p.y / TILE);
  const sp = 150 * (SPEED[here] || 1) * dt;
  const nx = p.x + (dx / norm) * sp;
  const ny = p.y + (dy / norm) * sp;

  if (walkable(nx / TILE, p.y / TILE)) p.x = nx; else state.moveTarget = null;
  if (walkable(p.x / TILE, ny / TILE)) p.y = ny; else state.moveTarget = null;

  // 踩进深泥沼
  if (at(p.x / TILE, p.y / TILE) === T.MUD && !state.stuck) fallInMud();
}

function fallInMud() {
  state.stuck = true;
  state.stuckAt = performance.now();
  state.rescued = false;
  toast("你陷进泥里了！别乱动，越动陷得越快");
}

function nearestNpc(px, py, maxTiles) {
  let best = null, bestD = Infinity;
  for (const npc of Object.values(state.npcs)) {
    const d = tileDist(npc.x, npc.y, px, py);
    if (d < bestD) { bestD = d; best = npc; }
  }
  return best && bestD <= maxTiles ? best : null;
}

function escapeMud(why) {
  const p = state.player;
  // 挪到最近能站的地方
  for (let r = 1; r < 6; r++) {
    let moved = false;
    for (const [ox, oy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
      const tx = (p.x / TILE + ox), ty = (p.y / TILE + oy);
      if (safeGround(tx, ty)) { p.x = (tx + 0.5) * TILE; p.y = (ty + 0.5) * TILE; moved = true; break; }
    }
    if (moved) break;
  }
  state.stuck = false;
  state.learned = true;
  toast(why + "「按 E 插根木棍，给后面的人做个记号。」", 4200);
}

function updateNpcs(dt) {
  const p = state.player;
  for (const npc of Object.values(state.npcs)) {
    if (!npc.follow) continue;
    const tx = p.x + npc.off[0], ty = p.y + npc.off[1];
    const dx = tx - npc.x, dy = ty - npc.y;
    const len = Math.hypot(dx, dy);
    if (len < 10) continue;
    const sp = 135 * npc.speed * dt;
    const nx = npc.x + (dx / len) * Math.min(sp, len);
    const ny = npc.y + (dy / len) * Math.min(sp, len);
    if (at(nx / TILE, ny / TILE) !== T.MUD && at(nx / TILE, ny / TILE) !== T.RIVER) npc.x = nx;
    if (at(npc.x / TILE, ny / TILE) !== T.MUD && at(npc.x / TILE, ny / TILE) !== T.RIVER) npc.y = ny;

    // 走散的人来拉你
    if (state.stuck && tileDist(npc.x, npc.y, p.x, p.y) <= 4) {
      const d = dist(npc, p);
      if (d < 62) {
        state.rescued = true;
        state.trust += 5;
        escapeMud(`${characters[npc.id]?.display || npc.id}伸过木棍把你拽了出来。`);
        say(npc.id, "陷进去了别慌，把枪横过来，趴下，等同志来拉你。记住没有？");
      }
    }
  }
}

function updateVision() {
  const pt = { x: state.player.x / TILE, y: state.player.y / TILE };
  const r = Math.ceil(VISION);
  for (let y = Math.floor(pt.y - r); y <= pt.y + r; y++) {
    for (let x = Math.floor(pt.x - r); x <= pt.x + r; x++) {
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue;
      if (Math.hypot(x + 0.5 - pt.x, y + 0.5 - pt.y) <= VISION) state.explored[y * MAP_W + x] = 1;
    }
  }
}

// ---------- HUD ----------

function updateHud() {
  $("addr").textContent = address();
  $("trustFill").style.width = Math.max(0, Math.min(100, state.trust)) + "%";
  $("markCount").textContent = `路标 ${state.marks.length}`;

  const near = nearestNpc(state.player.x, state.player.y, 2.4);
  $("btnTalk").hidden = !near || Boolean(state.talking) || state.done;
  if (near) $("btnTalk").textContent = `跟${characters[near.id]?.display || ""}说句话（E）`;

  const onMud = at(state.player.x / TILE, state.player.y / TILE) === T.MUD;
  $("btnStick").hidden = Boolean(near) || state.stuck || state.done || onMud || Boolean(state.talking);

  if (state.done) return;
  let hint = "雾很大，五步外看不见人";
  if (state.stuck) hint = "陷住了 —— 别动，等同志过来";
  else if (near) hint = `跟${characters[near.id]?.display || ""}说句话`;
  else if (state.marks.length < 3) hint = "按 E 插一根木棍，给后面的人留个记号";
  else if (state.player.x / TILE > MAP_W - 12) hint = "前面有水声了";
  $("hint").textContent = hint;

  // 罗盘：路标插得越多越准（剧本里指南针受潮失灵）
  const jitter = state.marks.length >= 3 ? 0 : Math.sin(performance.now() / 700) * 45;
  $("needle").style.transform = `translateY(-8px) rotate(${90 + jitter}deg)`;
}

// ---------- 说话 ----------

const talkLog = $("talkLog");

function bubble(role, text) {
  const d = document.createElement("div");
  d.className = "bubble " + role;
  d.textContent = text;
  talkLog.appendChild(d);
  talkLog.scrollTop = talkLog.scrollHeight;
  return d;
}

function say(npcId, text) {
  openTalk(npcId);
  bubble("npc", text);
}

function openTalk(npcId) {
  state.talking = npcId;
  $("talk").hidden = false;
  $("talkWho").textContent = characters[npcId]?.display || npcId;
  talkLog.innerHTML = "";
  const mem = state.memory[npcId] || [];
  for (const m of mem) bubble(m.role === "player" ? "me" : "npc", m.text);
  setTimeout(() => $("talkText").focus(), 60);
}

function closeTalk() {
  state.talking = null;
  $("talk").hidden = true;
  // 输入框还占着焦点的话，键盘就彻底失灵了（走也走不动、E 也没反应）
  if (document.activeElement?.tagName === "INPUT") document.activeElement.blur();
}

async function sendTalk() {
  const input = $("talkText");
  const text = input.value.trim();
  if (!text || !state.talking) return;
  input.value = "";
  const npcId = state.talking;
  state.memory[npcId] = state.memory[npcId] || [];
  state.memory[npcId].push({ role: "player", text });
  state.answers.push(text);
  bubble("me", text);
  const pending = bubble("pending", "……");
  $("talkSend").disabled = true;

  let reply = "";
  let dTrust = 0;
  try {
    const res = await fetch("../api/npc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        npc: npcId,
        mode: "free",
        situation: "你在松潘草地的雾里自由走动，队伍正在往东找出路。",
        trust: state.trust,
        address: address(),
        playerText: text,
        memories: state.answers.slice(-6),
        history: state.memory[npcId].slice(-10),
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (res.ok) {
      const data = await res.json();
      reply = (data.text || "").trim();
      dTrust = Number(data.trust) || 0;
    }
  } catch { /* 没接大模型就退回剧本台词 */ }

  if (!reply) {
    const pool = characters[npcId]?.freeFallback || ["……"];
    reply = pool[Math.floor(Math.random() * pool.length)];
  }
  pending.remove();
  bubble("npc", reply);
  state.memory[npcId].push({ role: "npc", text: reply });
  $("talkSend").disabled = false;
  if (dTrust) {
    state.trust += dTrust;
    toast(`信任 ${dTrust > 0 ? "+" : ""}${dTrust}`);
  }
  state.npcs[npcId].follow = true;   // 说过话，他就跟着你走
  input.focus();
}

// ---------- 输入 ----------

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (document.activeElement?.tagName === "INPUT") return;
  state.keys.add(k);
  if (k === "e") interact();
  if (k === "escape") { closeTalk(); $("help").hidden = true; }
});
window.addEventListener("keyup", (e) => state.keys.delete(e.key.toLowerCase()));

function interact() {
  if (state.talking) return;
  const near = nearestNpc(state.player.x, state.player.y, 2.4);
  if (near) { openTalk(near.id); return; }
  plantStick();
}

function plantStick() {
  if (state.stuck || state.done) return;
  const p = state.player;
  const t = at(p.x / TILE, p.y / TILE);
  if (t === T.RIVER) { toast("水流太急，插不住"); return; }
  if (state.marks.some((m) => dist(m, p) < 40)) { toast("这儿已经有记号了"); return; }
  state.marks.push({ x: p.x, y: p.y });
  if (state.marks.length === 1) toast("木棍上绑了一条红布——后面的人靠它认路", 3600);
}

canvas.addEventListener("pointerdown", (e) => {
  if (state.done) return;
  const camX = cameraX(), camY = cameraY();
  state.moveTarget = { x: e.clientX + camX, y: e.clientY + camY };
});

function cameraX() {
  let c = state.player.x - view.w / 2;
  if (MAP_W * TILE < view.w) return (MAP_W * TILE - view.w) / 2;
  return Math.max(0, Math.min(MAP_W * TILE - view.w, c));
}
function cameraY() {
  let c = state.player.y - view.h / 2;
  if (MAP_H * TILE < view.h) return (MAP_H * TILE - view.h) / 2;
  return Math.max(0, Math.min(MAP_H * TILE - view.h, c));
}

$("btnTalk").addEventListener("click", interact);
$("btnStick").addEventListener("click", plantStick);
$("talkClose").addEventListener("click", closeTalk);
$("talkSend").addEventListener("click", sendTalk);
$("talkText").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); sendTalk(); }
});
$("btnHelp").addEventListener("click", () => { $("help").hidden = false; });
$("helpClose").addEventListener("click", () => { $("help").hidden = true; });
$("btnAgain").addEventListener("click", () => location.reload());

// ---------- 结局 ----------

function checkEnding() {
  if (state.done) return;
  if (state.player.x / TILE >= MAP_W - 5) {
    state.done = true;
    closeTalk();
    $("ending").hidden = false;
    $("hint").textContent = "看到河了";
  }
}

// ---------- 启动 ----------

async function boot() {
  try {
    const res = await fetch("../story/characters.json", { cache: "no-store" });
    characters = await res.json();
  } catch { characters = {}; }
  for (const n of NPCS) state.npcs[n.id] = { ...n, off: [...n.off] };
  // 调试 / 自动化测试用：控制台里 window.__ow.state 能看到玩家和 NPC 的位置
  window.__ow = { state, at, T, TILE, MAP_W, MAP_H };
  $("help").hidden = false;
  toast("点地图任意处就能走，WASD 也行", 4000);
  requestAnimationFrame(step);
  setInterval(checkEnding, 200);
}
boot();
