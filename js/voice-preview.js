import { VoicePlayer, localVoiceEndpoint } from "./voice.js?v=20261024-voice-public";
import { AiClient } from "./ai.js?v=20261021-network-check";

const $ = id => document.getElementById(id);
const [profiles, approved, candidates, voiceInfo] = await Promise.all([
  fetch("story/voices.json").then(r => r.json()),
  fetch("voice/manifest.json").then(r => r.json()),
  fetch("assets/audio/voice-candidates/manifest.json").then(r => r.json()).catch(() => ({ clips: [] })),
  localVoiceEndpoint() ? fetch("/api/voices", { signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => ({ provider: "unknown" })) : Promise.resolve({ provider: "unavailable" }),
]);
let requestVersion = 0, listeningIntent = 0, busy = false;
const history = {};
const roleVoice = voiceInfo.provider === "qwen-clone";
const replyVoiceAvailable = Boolean(localVoiceEndpoint());
const replyVoiceName = roleVoice ? "角色音色配音" : replyVoiceAvailable ? "基础实时朗读" : "在线回复语音尚未开通";
if (!replyVoiceAvailable) {
  $("send").textContent = "发送";
  $("voiceIntro").textContent = "这里可试听全部角色剧情配音，并与角色进行文字对话。";
}
const sourceName = { confirmed: "剧情配音", candidate: "候选声音 · 仅试听", realtime: replyVoiceName };
$("voiceModeNote").textContent = !replyVoiceAvailable
  ? "在线自由对话提供文字回复；132 处剧情配音均可试听。同角色的新回复配音目前在本地版本提供。"
  : roleVoice
  ? "新回答按角色参考录音生成配音；老班长沿用组员选定的声音参考。新句子需几十秒生成，同一句可即时回放。此处不改动剧情进度。"
  : "新回答使用基础实时朗读，音色与组员选定配音不同。此处不改动剧情进度。";
if (!roleVoice) $("voiceFooter").textContent = "本地融合预览 · 已选剧情配音与候选样音均可试听；当前新回答仍使用基础朗读音色。网站未发布。";
const player = new VoicePlayer({ fixedManifest: approved, onAudio: (audio, event) => {
  $("replyAudio").replaceChildren();
  if (audio && event.source === "realtime") { audio.controls = true; audio.style.width = "100%"; $("replyAudio").append(audio); }
}, onStatus: event => {
  for (const slot of document.querySelectorAll(".status")) slot.textContent = "";
  const slot = event.npc ? document.querySelector(`[data-status="${event.npc}"]`) : null;
  const text = event.state === "loading" ? event.source === "realtime" && roleVoice ? "正在生成角色声音，首次需要加载模型…" : "正在准备声音…" : event.state === "playing" ? "正在说话…" : event.state === "ended" ? "播放完毕" : event.state === "error" ? event.message : "";
  if (slot && slot.dataset.voiceSource === event.source) slot.textContent = text;
  $("globalStatus").textContent = text ? `${sourceName[event.source] || "配音"}：${text}` : "可试听选定配音、候选声音，或在下方自由对话。";
  $("replay").hidden = !event.replayable;
  if (event.source === "realtime") {
    if (event.state === "loading") $("connection").textContent = roleVoice ? "正在生成角色声音，新句子需要等待。" : "正在准备朗读。";
    else if (event.state === "playing") $("connection").textContent = `正在播放 · ${replyVoiceName}。`;
    else if (event.state === "ended") $("connection").textContent = `播放完毕 · ${replyVoiceName}。`;
    else if (event.state === "error") $("connection").textContent = event.message;
  } else if (event.source === "confirmed" && event.state === "playing" && !busy) {
    $("connection").textContent = "剧情配音正在上方播放；也可以在这里自由对话。";
  } else if (event.source === "confirmed" && event.state === "ended" && !busy) {
    $("connection").textContent = "剧情配音已播放完毕，可回放或自由对话。";
  } else if (event.state === "idle" && !event.replayable && !busy) $("connection").textContent = "声音已停止，可点击“再听这句”回放。";
} });
player.setVolume(.85);

function play(npc, text, options) {
  listeningIntent++;
  return player.speak(npc, text, options);
}
const sayText = text => text.replaceAll("{player}", "文书");
const lines = Object.entries(approved.lines || {});
const totals = {};
for (const [, entry] of lines) totals[entry.who] = (totals[entry.who] || 0) + 1;
const generatedCount = lines.filter(([, entry]) => entry.generation).length;
$("coverage").textContent = `已接入 ${lines.length} 处剧情配音：${Object.entries(profiles).map(([npc, p]) => `${p.name} ${totals[npc] || 0} 句`).join("，")}。保留组员录音 ${lines.length - generatedCount} 句，本地补全 ${generatedCount} 句。`;
$("librarySummary").textContent = `展开全部 ${lines.length} 处剧情配音`;
$("voiceFooter").textContent = !replyVoiceAvailable
  ? "完整剧情配音已上线；在线自由回复暂提供文字。同角色的新回复配音目前在本地版本提供。"
  : roleVoice
  ? "本地试听 · 固定剧情直接播放已有录音；自由回复按角色参考生成。何大姐沿用已确认的朴实关切声线。生成台词的表演和发音仍可逐句试听调整。网站未发布。"
  : "本地试听 · 固定剧情直接播放已有录音；自由回复当前使用基础朗读或暂不可用，音色与剧情配音不同。网站未发布。";

Object.entries(profiles).forEach(([npc, profile], i) => {
  const fixedId = lines.find(([, entry]) => entry.who === npc)?.[0];
  const fixed = approved.lines[fixedId];
  const candidate = candidates.clips.find(c => c.npc === npc);
  const card = document.createElement("article"); card.className = "card";
  const number = document.createElement("span"); number.className = "number"; number.textContent = `VOICE / 0${i + 1}`;
  const tag = document.createElement("div"); tag.className = "tag";
  tag.textContent = fixed ? `${totals[npc]} 处剧情配音 · ${fixed.generation ? "本地制作" : "组员选定"}` : `${candidate?.age || "角色声音"} · 候选样音`;
  const name = document.createElement("h2"); name.textContent = profile.name;
  const text = fixed?.text || candidate?.sample || "候选声音尚未准备好";
  const quote = document.createElement("p"); quote.className = "quote"; quote.textContent = sayText(text);
  const button = document.createElement("button"); button.type = "button";
  button.textContent = fixed ? "▶ 听剧情配音" : "▶ 听候选声音";
  button.disabled = !fixed && !candidate;
  button.addEventListener("click", () => void play(npc, sayText(text), fixed
    ? { mode: "fixed", id: fixedId, template: fixed.text }
    : { mode: "candidate", url: candidate.url }));
  const status = document.createElement("span"); status.className = "status"; status.dataset.status = npc; status.dataset.voiceSource = fixed ? "confirmed" : "candidate";
  const flag = document.createElement("p"); flag.className = "note";
  flag.textContent = fixed ? "与完整剧情使用同一份音频；展开下方列表可试听每句。" : "此角色的固定剧情配音正在制作。";
  card.append(number, tag, name, quote, button, status, flag); $("cards").append(card);
  {
    const option = document.createElement("option"); option.value = npc; option.textContent = profile.name; $("npc").append(option);
  }
});

function renderLibrary() {
  $("library").replaceChildren();
  for (const [id, entry] of lines) {
    if ($("libraryFilter").value !== "all" && entry.who !== $("libraryFilter").value) continue;
    const row = document.createElement("div"); row.className = "library-line";
    const paragraph = document.createElement("p"); paragraph.textContent = sayText(entry.text);
    const small = document.createElement("small"); small.textContent = `${entry.display} · ${id} · ${entry.dur.toFixed(1)} 秒 · ${entry.generation ? "本地制作" : "组员选定"}`; paragraph.append(small);
    const button = document.createElement("button"); button.type = "button"; button.className = "ghost"; button.textContent = "▶ 播放";
    button.addEventListener("click", () => void play(entry.who, sayText(entry.text), { mode: "fixed", id, template: entry.text }));
    row.append(paragraph, button); $("library").append(row);
  }
}
renderLibrary();
$("globalStatus").textContent = "可试听选定配音、候选声音，或在下方自由对话。";
$("libraryFilter").addEventListener("change", renderLibrary);
$("stop").addEventListener("click", () => { listeningIntent++; player.stop(); });
$("replay").addEventListener("click", () => { listeningIntent++; void player.replay(); });
$("volume").addEventListener("input", event => player.setVolume(Number(event.target.value) / 100));
document.addEventListener("visibilitychange", () => { if (document.hidden) { listeningIntent++; player.stop(); } });
addEventListener("pagehide", () => { listeningIntent++; requestVersion++; player.stop(); });

const ai = new AiClient();
void ai.check().then(online => {
  $("connection").textContent = online ? replyVoiceAvailable ? `对话已连接。新回答使用${replyVoiceName}。` : "文字对话已连接；剧情配音可正常试听，在线回复语音尚未开通。" : "对话暂未连接；已选定的剧情配音和候选样音仍可试听。";
});
function add(who, text, npc = null, mood = "平静") {
  const div = document.createElement("div"); div.className = "message" + (npc ? "" : " me");
  const title = document.createElement("b"); title.textContent = who;
  div.append(title, document.createTextNode(text));
  if (npc && replyVoiceAvailable) {
    const button = document.createElement("button"); button.type = "button"; button.className = "ghost"; button.textContent = "▶ 再听这句";
    button.addEventListener("click", () => void play(npc, text, { mode: "dynamic", mood })); div.append(button);
  }
  $("messages").append(div); $("messages").scrollTop = $("messages").scrollHeight;
  return div;
}
$("npc").addEventListener("change", () => {
  requestVersion++; listeningIntent++; player.stop(); $("messages").replaceChildren();
  const npc = $("npc").value;
  for (const item of history[npc] || []) add(item.role === "player" ? "你" : profiles[npc].name, item.text, item.role === "npc" ? npc : null, item.mood);
});
$("talk").addEventListener("submit", async event => {
  event.preventDefault(); const text = $("question").value.trim(); if (!text || busy) return;
  const npc = $("npc").value, version = ++requestVersion, intent = ++listeningIntent;
  busy = true; player.stop(); $("send").disabled = true; $("npc").disabled = true; $("question").value = "";
  add("你", text); const pending = add(profiles[npc].name, "正在想怎么回答…");
  try {
    const mem = history[npc] || [];
    const situation = npc === "he-xiuying-old" ? "多年以后，晚年何秀英向来访的年轻人回忆1935年草地行军的往事。" : "1935年8月，草地行军间歇，队伍停下来稍作休息。";
    const out = await ai.reply({ npc, mode: "free", playerText: text, trust: 50, address: "同志", situation, history: mem.slice(-10), memories: mem.filter(x => x.role === "player").slice(-6).map(x => x.text) }, 35000);
    if (version !== requestVersion) return;
    pending.remove(); add(profiles[npc].name, out.text, npc, out.mood);
    history[npc] = [...mem, { role: "player", text }, { role: "npc", text: out.text, mood: out.mood }].slice(-12);
    if (!replyVoiceAvailable) $("connection").textContent = "已收到文字回复。在线回复语音尚未开通；剧情配音可正常播放。";
    else if (intent === listeningIntent && !document.hidden) {
      $("connection").textContent = roleVoice ? "文字已收到，正在生成角色声音；首次需要加载模型。" : "文字已收到，正在准备朗读。";
      const ok = await player.speak(npc, out.text, { mode: "dynamic", mood: out.mood });
      if (version === requestVersion) $("connection").textContent = ok ? `正在播放新回答 · ${replyVoiceName}。` : "文字已保留，可点击“再听这句”重试配音。";
    }
  } catch {
    if (version === requestVersion) { pending.remove(); $("question").value = text; $("connection").textContent = "对话没有连接成功，原话已保留，可以重试。"; }
  } finally {
    busy = false; $("send").disabled = false; $("npc").disabled = false; if (!document.hidden) $("question").focus();
  }
});
