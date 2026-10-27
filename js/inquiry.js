// 记录学习过程；不根据字数、感受或角色信任值给学生评分。
const inquiryBoundaries = new Set(["fact", "fiction", "unsure"]);
const inquiryTrim = (value, max = 800) => typeof value === "string" ? value.slice(0, max) : "";
export const inquiryBoundaryLabels = {
  fact: "现有资料可以直接证明", fiction: "现有资料不足以证明，应区分剧情设计", unsure: "暂不确定，还需要核对",
};
export const inquirySupportLabels = { boundary: "分清史实与艺术创作", evidence: "让观点和依据对应起来", perspective: "理解人物在当时的处境" };

export function createInquiry(task, now = Date.now()) {
  return { taskId: task.id, taskVersion: task.version, recordId: globalThis.crypto?.randomUUID?.() || `local-${now}-${Math.random().toString(36).slice(2)}`, startedAt: now, completedAt: null, stage: 1, initial: "", initialBoundary: "unsure", initialCommitted: false, baseline: null, sourceIds: [], feedback: null, revisionFeedback: null, revision: "", revisionBoundary: "unsure", supportNeed: "boundary", evidenceNote: "", changeReason: "" };
}

export function commitInquiryInitial(draft, now = Date.now()) {
  if (draft.initialCommitted && draft.baseline) return { ...draft, initial: draft.baseline.text, initialBoundary: draft.baseline.boundary };
  const initial = inquiryTrim(draft.initial).trim();
  if (!initial) return draft;
  const boundary = inquiryBoundaries.has(draft.initialBoundary) ? draft.initialBoundary : "unsure";
  return { ...draft, initial, initialBoundary: boundary, initialCommitted: true, baseline: { text: initial, boundary, at: now } };
}

export function inquirySupportHint(draft, task) {
  return task.supportGuides?.[draft.supportNeed] || task.supportGuides?.boundary || task.manualHints[0];
}

export function inquirySourceIds(ids, task) {
  return [...new Set(Array.isArray(ids) ? ids : [])].filter(id => task.sourceIds.includes(id));
}

export function inquiryStageAllowed(draft, stage, task) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 4) return false;
  if (stage >= 2 && !draft.initial.trim()) return false;
  if (stage >= 3 && !Array.isArray(draft.sourceIds)) return false;
  if (stage >= 3 && (!draft.sourceIds.length || draft.sourceIds.some(id => !task.sourceIds.includes(id)))) return false;
  return stage !== 4 || Boolean(draft.revision.trim());
}

export function feedbackFor(value, task, initial = null) {
  if (!value || typeof value !== "object" || !Array.isArray(value.sourceIds) || !value.sourceIds.length || value.sourceIds.some(id => !task.sourceIds.includes(id))) return null;
  if (value.version !== undefined && value.version !== 1 && value.version !== 2) return null;
  const result = { observation: inquiryTrim(value.observation, 500).trim(), evidenceNote: inquiryTrim(value.evidenceNote, 600).trim(), question: inquiryTrim(value.question, 300).trim(), sourceIds: inquirySourceIds(value.sourceIds, task) };
  if (!result.observation || !result.evidenceNote || !result.question) return null;
  if (value.version === 2) {
    if (typeof value.studentQuote !== "string" || !value.studentQuote.trim() || value.studentQuote.length > 160 || !Array.isArray(value.citations) || !value.citations.length || value.citations.length > (task.evidenceRules || []).length) return null;
    if (typeof initial === "string" && (!initial.includes(value.studentQuote) || value.studentQuote.length < Math.min(8, initial.trim().length))) return null;
    const citations = [];
    for (const item of value.citations) {
      const rule = task.evidenceRules?.find(rule => rule.id === item?.evidenceId);
      if (!rule || item.sourceId !== rule.sourceId || item.excerpt !== rule.excerpt || item.scope !== rule.scope || citations.some(citation => citation.evidenceId === item.evidenceId)) return null;
      citations.push({ evidenceId: rule.id, sourceId: rule.sourceId, excerpt: rule.excerpt, scope: rule.scope });
    }
    const sources = [...new Set(citations.map(item => item.sourceId))];
    if (sources.length !== result.sourceIds.length || sources.some(id => !result.sourceIds.includes(id))) return null;
    Object.assign(result, { version: 2, studentQuote: value.studentQuote, citations, model: inquiryTrim(value.model, 80) });
  }
  return result;
}

export function groundInquiryFeedback(value, task, initial, model) {
  if (!value || !Array.isArray(value.evidenceIds) || !value.evidenceIds.length || value.evidenceIds.length > (task.evidenceRules || []).length) return null;
  const rules = value.evidenceIds.map(id => task.evidenceRules.find(rule => rule.id === id));
  if (rules.some(rule => !rule)) return null;
  return feedbackFor({ ...value, version: 2, model, sourceIds: [...new Set(rules.map(rule => rule.sourceId))], citations: rules.map(rule => ({ evidenceId: rule.id, sourceId: rule.sourceId, excerpt: rule.excerpt, scope: rule.scope })) }, task, initial);
}

export function inquiryFeedbackText(feedback, task, lore = {}) {
  const rows = ["AI 实际反馈（解释与追问仍需人工核对）"];
  if (feedback.version === 2) rows.push("对应的学生原话：" + feedback.studentQuote);
  else rows.push("旧版反馈：当时未记录逐句原话与资料摘录，不补造引用。");
  if (feedback.model) rows.push("记录中的模型：" + feedback.model);
  rows.push("AI 回应：" + feedback.observation, "AI 解释：" + feedback.evidenceNote, "AI 追问：" + feedback.question);
  if (feedback.version === 2) for (const citation of feedback.citations) {
    const card = lore[citation.sourceId];
    rows.push("对应资料：" + (card?.title || citation.sourceId), "资料整理摘录（非史料原文）：" + citation.excerpt, "资料支持范围（项目组整理）：" + citation.scope);
    if (card?.sourceTitle && card?.sourceUrl) rows.push(card.sourceTitle, card.sourceUrl);
  }
  else for (const id of feedback.sourceIds) {
    const card = lore[id]; rows.push("所据资料：" + (card?.title || id));
    if (card?.sourceTitle && card?.sourceUrl) rows.push(card.sourceTitle, card.sourceUrl);
  }
  return rows;
}

export function inquiryRequest(draft, task, mode = "initial") {
  const request = { taskId: task.id, initial: inquiryTrim(draft.initial).trim(), initialBoundary: inquiryBoundaries.has(draft.initialBoundary) ? draft.initialBoundary : "unsure", sourceIds: inquirySourceIds(draft.sourceIds, task), supportNeed: Object.hasOwn(inquirySupportLabels, draft.supportNeed) ? draft.supportNeed : "boundary" };
  if (mode === "revision") Object.assign(request, { mode, revision: inquiryTrim(draft.revision).trim(), revisionBoundary: inquiryBoundaries.has(draft.revisionBoundary) ? draft.revisionBoundary : "unsure", evidenceNote: inquiryTrim(draft.evidenceNote, 500).trim(), changeReason: inquiryTrim(draft.changeReason, 500).trim() });
  return request;
}

export function currentInquiryFeedback(draft, task, mode = "initial") {
  const value = mode === "revision" ? draft.revisionFeedback : draft.feedback;
  if (value?.snapshot !== JSON.stringify(inquiryRequest(draft, task, mode))) return null;
  return feedbackFor(value, task, mode === "revision" ? draft.revision : draft.initial);
}

export function restoreInquiry(raw, task) {
  const fresh = createInquiry(task);
  try {
    const saved = JSON.parse(raw);
    if (!saved || saved.taskId !== task.id || saved.taskVersion !== task.version) return fresh;
    const draft = { ...fresh, initial: inquiryTrim(saved.initial), revision: inquiryTrim(saved.revision), sourceIds: inquirySourceIds(saved.sourceIds, task) };
    if (typeof saved.recordId === "string" && /^[a-zA-Z0-9-]{8,100}$/.test(saved.recordId)) draft.recordId = saved.recordId;
    if (Number.isFinite(saved.startedAt) && saved.startedAt > 0) draft.startedAt = saved.startedAt;
    if (Number.isFinite(saved.completedAt) && saved.completedAt >= draft.startedAt) draft.completedAt = saved.completedAt;
    draft.evidenceNote = inquiryTrim(saved.evidenceNote, 500);
    draft.changeReason = inquiryTrim(saved.changeReason, 500);
    if (Object.hasOwn(inquirySupportLabels, saved.supportNeed)) draft.supportNeed = saved.supportNeed;
    for (const key of ["initialBoundary", "revisionBoundary"]) if (inquiryBoundaries.has(saved[key])) draft[key] = saved[key];
    draft.stage = Number.isInteger(saved.stage) && saved.stage >= 1 && saved.stage <= 4 ? saved.stage : 1;
    if (saved.initialCommitted && saved.baseline && typeof saved.baseline.text === "string" && saved.baseline.text.trim()) {
      draft.initial = inquiryTrim(saved.baseline.text);
      draft.initialBoundary = inquiryBoundaries.has(saved.baseline.boundary) ? saved.baseline.boundary : "unsure";
      draft.initialCommitted = true;
      draft.baseline = { text: draft.initial, boundary: draft.initialBoundary, at: Number.isFinite(saved.baseline.at) ? saved.baseline.at : draft.startedAt };
    } else if (draft.stage > 1 && draft.initial.trim()) Object.assign(draft, commitInquiryInitial(draft));
    if (!draft.initial.trim()) draft.stage = 1;
    else if (draft.stage >= 3 && !draft.sourceIds.length) draft.stage = 2;
    else if (draft.stage === 4 && !draft.revision.trim()) draft.stage = 3;
    // AI 反馈与当时提交的解释/来源绑定；旧请求不能污染新草稿。
    let matches = false;
    try {
      const oldRequest = JSON.parse(saved.feedback?.snapshot || "null");
      matches = oldRequest?.taskId === task.id && JSON.stringify(inquiryRequest(oldRequest, task)) === JSON.stringify(inquiryRequest(draft, task));
    } catch { /* 旧格式或损坏请求不恢复反馈 */ }
    if (matches) {
      const feedback = feedbackFor(saved.feedback, task, draft.initial);
      if (feedback) draft.feedback = { ...feedback, snapshot: JSON.stringify(inquiryRequest(draft, task)) };
    }
    const revisionFeedback = currentInquiryFeedback({ ...draft, revisionFeedback: saved.revisionFeedback }, task, "revision");
    if (revisionFeedback) draft.revisionFeedback = { ...revisionFeedback, snapshot: JSON.stringify(inquiryRequest(draft, task, "revision")) };
    return draft;
  } catch { return fresh; }
}

export function buildInquiryRecord(draft, task, now = Date.now()) {
  if (draft.stage !== 4 || !inquiryStageAllowed(draft, 4, task)) return null;
  const feedback = currentInquiryFeedback(draft, task);
  const revisionFeedback = currentInquiryFeedback(draft, task, "revision");
  return { schema: "grassland-inquiry-record", schemaVersion: 1, recordId: draft.recordId, taskId: task.id, taskVersion: task.version, taskTitle: task.title, startedAt: draft.startedAt, completedAt: draft.completedAt || now, initial: draft.baseline?.text || draft.initial, initialBoundary: draft.baseline?.boundary || draft.initialBoundary, revision: draft.revision, revisionBoundary: draft.revisionBoundary, sourceIds: inquirySourceIds(draft.sourceIds, task), supportNeed: draft.supportNeed || "boundary", evidenceNote: inquiryTrim(draft.evidenceNote, 500), changeReason: inquiryTrim(draft.changeReason, 500), aiFeedbackReceived: Boolean(feedback), feedback, revisionFeedbackReceived: Boolean(revisionFeedback), revisionFeedback };
}

export function inquiryText(draft, task, lore) {
  const rows = ["《草地上的路标》· 史料探究记录", "", task.title, task.question, "", "最初的解释", draft.initial || "（尚未填写）", "最初的判断：" + inquiryBoundaryLabels[draft.initialBoundary], "", "对照资料后的解释", draft.revision || "（尚未填写）", "现在的判断：" + inquiryBoundaryLabels[draft.revisionBoundary], "", "本次引用的资料（项目组整理，非史料原文）"];
  rows.push("我的依据说明", draft.evidenceNote || "（尚未填写）", "我修改或保留观点的理由", draft.changeReason || "（尚未填写）", "需要帮助的方向：" + (inquirySupportLabels[draft.supportNeed] || inquirySupportLabels.boundary), "");
  for (const id of inquirySourceIds(draft.sourceIds, task)) {
    const card = lore[id];
    if (card) rows.push(card.title, card.text, card.sourceTitle || "", card.sourceUrl || "", "");
  }
  const feedback = currentInquiryFeedback(draft, task);
  if (feedback) rows.push("初稿反馈", ...inquiryFeedbackText(feedback, task, lore));
  else rows.push("初稿阶段没有生成 AI 反馈记录；可依据资料整理提示自行核对。");
  const revisionFeedback = currentInquiryFeedback(draft, task, "revision");
  if (revisionFeedback) rows.push("", "修订稿反馈", ...inquiryFeedbackText(revisionFeedback, task, lore));
  else rows.push("修订稿阶段未收到 AI 反馈。");
  rows.push("", "本记录保留表达与修改过程，不据此判断个人品德或证明教学效果。");
  return rows.join("\n");
}
