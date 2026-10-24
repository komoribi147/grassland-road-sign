export const VOICE_ADDRESSES = ["文书", "同志", "你"];
export function collectVoiceLines(scenes) {
  const lines = [], ids = new Set();
  const add = (id, who, text) => {
    if (!who || who === "__player__" || typeof text !== "string" || !text.trim()) return;
    if (ids.has(id)) throw Error(`重复配音 ID: ${id}`);
    ids.add(id); lines.push({ id, who, text });
  };
  for (const scene of scenes) scene.steps.forEach((step, i) => {
    const id = `${scene.id}-${String(i).padStart(3, "0")}`;
    if (step.t === "say") add(id, step.who, step.text);
    for (const [n, option] of (step.options || []).entries()) {
      if (option.reply) add(`${id}o${n}`, step.ai || option.replyWho || step.replyWho, option.reply);
      if (option.after?.some(s => s.t === "say")) throw Error(`${id}: 尚不支持选项内追加配音 ID`);
    }
    const after = (step.after || []).filter(s => s.t === "say");
    if (after.length > 1) throw Error(`${id}: 多句追加对白需要独立 ID`);
    for (const sub of after) add(`${id}a`, sub.who, sub.text);
  });
  return lines;
}

export function expandVoiceJobs(lines, bank) {
  const jobs = [];
  for (const line of lines) {
    const existing = bank.lines[line.id];
    if (existing && (existing.who !== line.who || existing.text !== line.text)) {
      // Original recordings may intentionally omit the leader's opening interjection.
      const normalize = t => t.normalize("NFKC").replace(/^中[。！!，,]\s*/u, "").replace(/[\p{P}\p{S}\s]/gu, "");
      if (existing.who !== line.who || normalize(existing.text) !== normalize(line.text)) throw Error(`${line.id}: 已有录音与剧本不匹配`);
    }
    if (line.text.includes("{player}")) {
      for (const [i, address] of VOICE_ADDRESSES.entries()) {
        if (existing?.variants?.[address]) continue;
        jobs.push({ ...line, key: `${line.id}-address${i}`, address, text: line.text.replaceAll("{player}", address) });
      }
    } else if (!existing) jobs.push({ ...line, key: line.id });
  }
  return jobs;
}
