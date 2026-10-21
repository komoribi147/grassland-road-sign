// 回望只收录本次体验里真实出现的文字，不替玩家判断感受。
const reflectionPeople = ["li-changhe", "shitou", "he-xiuying"];
const reflectionStrings = (items) => [...new Set((Array.isArray(items) ? items : [])
  .filter((text) => typeof text === "string" && text.trim()).map((text) => text.trim()))];

export function buildReflectionReport(state, characters = {}, lore = {}, ending = {}) {
  const previous = state.reflection;
  const reflection = previous && typeof previous === "object" && !Array.isArray(previous) ? previous : {};
  reflection.note = typeof reflection.note === "string" ? reflection.note.slice(0, 1000) : "";
  reflection.keptId = reflectionPeople.includes(reflection.keptId) ? reflection.keptId : "";
  if (!Number.isFinite(reflection.createdAt) || reflection.createdAt <= 0) reflection.createdAt = Date.now();
  state.reflection = reflection;

  const history = Array.isArray(state.history) ? state.history : [];
  const companions = [];
  for (const id of reflectionPeople) {
    const variants = id === "he-xiuying" ? [id, "he-xiuying-old"] : [id];
    const names = variants.map((key) => characters[key]?.display).filter(Boolean);
    // 角色记忆包含独立对话，也能补足主线 history 只保留最近 60 句的情况。
    const questions = Array.isArray(state.askMemory?.[id]) ? state.askMemory[id] : [];
    let quote = [...questions].reverse().find((item) => typeof item.a === "string" && item.a.trim())?.a || "";
    for (const key of variants) {
      if (quote) break;
      const memory = Array.isArray(state.memory?.[key]) ? state.memory[key] : [];
      const line = [...memory].reverse().find((item) => item.role === "npc" && typeof item.text === "string" && item.text.trim());
      if (line) { quote = line.text; break; }
    }
    if (!quote) quote = [...history].reverse().find((item) => item.role === "npc" && names.includes(item.name) && typeof item.text === "string")?.text || "";
    if (quote) companions.push({ id, name: characters[id]?.display || names[0] || id, quote });
  }
  if (!companions.some((person) => person.id === reflection.keptId)) reflection.keptId = "";

  return {
    title: "走过草地以后",
    closing: ending.text || "还有许多人的名字，我记了一辈子。",
    createdAt: reflection.createdAt,
    companions,
    picks: reflectionStrings(state.picks).slice(-6),
    said: reflectionStrings([
      ...(Array.isArray(state.answers) ? state.answers : []),
      ...reflectionPeople.flatMap((id) => (Array.isArray(state.askMemory?.[id]) ? state.askMemory[id] : []).map((item) => item.q)),
    ]).slice(-5),
    sourceCards: reflectionStrings(state.lore).filter((id) => lore[id]).map((id) => ({ id, ...lore[id] })),
    reflection,
  };
}

export function buildReflectionText(report) {
  const lines = [
    "《草地上的路标》· 走过草地以后", "",
    new Date(report.createdAt).toLocaleDateString("zh-CN"), "",
    report.closing, "", "与你同行的人", "",
  ];
  for (const person of report.companions) lines.push(`${person.name}：`, `「${person.quote}」`, "");
  if (report.said.length) lines.push("你也曾这样说", ...report.said.map((text) => `「${text}」`), "");
  if (report.picks.length) lines.push("你做过的选择", ...report.picks.map((text) => `· ${text}`), "");
  const kept = report.companions.find((person) => person.id === report.reflection.keptId);
  if (kept) lines.push("我想留住的那句话", `${kept.name}：「${kept.quote}」`, "");
  lines.push("我给这段路留下的话", report.reflection.note.trim() || "（留一处空白。）", "");
  lines.push("故事之外的历史", "人物与具体遭遇为艺术创作，角色对话不作为史料引用。", "");
  for (const card of report.sourceCards) {
    lines.push(card.title, card.text);
    if (card.sourceTitle && card.sourceUrl) lines.push(`史料参考：${card.sourceTitle}`, card.sourceUrl);
    lines.push("");
  }
  return lines.join("\n");
}
