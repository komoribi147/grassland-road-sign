import { feedbackFor, inquirySupportLabels, inquiryBoundaryLabels, inquiryFeedbackText } from "./inquiry.js";

export const observationLabels = { pending: "待观察", visible: "有具体表现", followup: "需要追问" };
export const classroomLabels = { pending: "待观察", smooth: "可以顺利用起来", adjust: "需要调整" };
export const feedbackReviewLabels = { pending: "待核查", useful: "建议有帮助", "needs-check": "需要核查或纠正" };
export const misconceptionLabels = { boundary: "把剧情直接当作史实", evidence: "观点与依据没有对应", absence: "把缺少证据当成从未发生", operation: "页面或设备操作困难", other: "其他需要跟进的问题" };
const reviewDimensions = { boundary: "区分史实与创作", evidence: "说明相关依据", revision: "说明修订或保留的理由" };
const reviewString = (value, max) => typeof value === "string" ? value.slice(0, max) : "";
const failRecord = () => { throw new Error("记录格式或来源不符合本活动要求，原有记录未改动。"); };

export function createReviewState() { return { schema: "grassland-classroom-review", schemaVersion: 1, cases: [], sessionNote: "" }; }

function validatedRecord(value, task) {
  if (!value || value.schema !== "grassland-inquiry-record" || value.schemaVersion !== 1 || value.taskId !== task.id || value.taskVersion !== task.version || typeof value.recordId !== "string" || !/^[a-zA-Z0-9-]{8,100}$/.test(value.recordId)) failRecord();
  if (![value.initial, value.revision].every(text => typeof text === "string" && text.trim() && text.length <= 800)) failRecord();
  if (![value.initialBoundary, value.revisionBoundary].every(key => Object.hasOwn(inquiryBoundaryLabels, key))) failRecord();
  if (!Array.isArray(value.sourceIds) || !value.sourceIds.length || value.sourceIds.length > task.sourceIds.length || value.sourceIds.some(id => !task.sourceIds.includes(id))) failRecord();
  if (!Number.isFinite(value.startedAt) || !Number.isFinite(value.completedAt) || value.startedAt <= 0 || value.completedAt < value.startedAt) failRecord();
  if (!Object.hasOwn(inquirySupportLabels, value.supportNeed) || typeof value.aiFeedbackReceived !== "boolean") failRecord();
  const feedback = value.aiFeedbackReceived ? feedbackFor(value.feedback, task, value.initial) : null;
  if (value.aiFeedbackReceived && !feedback) failRecord();
  if (value.revisionFeedbackReceived !== undefined && typeof value.revisionFeedbackReceived !== "boolean") failRecord();
  const revisionFeedbackReceived = value.revisionFeedbackReceived === true;
  const revisionFeedback = revisionFeedbackReceived ? feedbackFor(value.revisionFeedback, task, value.revision) : null;
  if (revisionFeedbackReceived && !revisionFeedback) failRecord();
  // 只恢复已知字段；不渲染导入文件自带的 HTML、任务标题或来源链接。
  return { schema: value.schema, schemaVersion: 1, recordId: value.recordId, taskId: task.id, taskVersion: task.version, taskTitle: task.title, startedAt: value.startedAt, completedAt: value.completedAt, initial: value.initial, initialBoundary: value.initialBoundary, revision: value.revision, revisionBoundary: value.revisionBoundary, sourceIds: [...new Set(value.sourceIds)], supportNeed: value.supportNeed, evidenceNote: reviewString(value.evidenceNote, 500), changeReason: reviewString(value.changeReason, 500), aiFeedbackReceived: value.aiFeedbackReceived, feedback, revisionFeedbackReceived, revisionFeedback };
}

function validatedCase(value, task) {
  const record = validatedRecord(value.record, task);
  const observation = { boundary: "pending", evidence: "pending", revision: "pending", classroom: "pending", feedbackReview: "pending", feedbackNote: "", revisionFeedbackReview: "pending", revisionFeedbackNote: "", misconceptions: [], note: "" };
  const raw = value.observation || {};
  for (const key of Object.keys(reviewDimensions)) if (Object.hasOwn(observationLabels, raw[key])) observation[key] = raw[key];
  if (Object.hasOwn(classroomLabels, raw.classroom)) observation.classroom = raw.classroom;
  observation.misconceptions = [...new Set(Array.isArray(raw.misconceptions) ? raw.misconceptions : [])].filter(key => Object.hasOwn(misconceptionLabels, key));
  observation.note = reviewString(raw.note, 1000);
  if (record.aiFeedbackReceived) {
    if (Object.hasOwn(feedbackReviewLabels, raw.feedbackReview)) observation.feedbackReview = raw.feedbackReview;
    observation.feedbackNote = reviewString(raw.feedbackNote, 1000);
  }
  if (record.revisionFeedbackReceived) {
    if (Object.hasOwn(feedbackReviewLabels, raw.revisionFeedbackReview)) observation.revisionFeedbackReview = raw.revisionFeedbackReview;
    observation.revisionFeedbackNote = reviewString(raw.revisionFeedbackNote, 1000);
  }
  return { record, alias: reviewString(value.alias, 20), observation };
}

export function importLearningRecords(state, text, task) {
  if (typeof text !== "string") throw new Error("请选择本课堂导出的学习记录或备份。");
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > 8 * 1024 * 1024) throw new Error("备份过大，整班备份不超过 8 MB。");
  let data; try { data = JSON.parse(text); } catch { throw new Error("这份文件无法读取，请选择课堂导出的学习记录。"); }
  let cases;
  if (data?.schema === "grassland-classroom-review" && data.schemaVersion === 1 && Array.isArray(data.cases)) cases = data.cases;
  else {
    if (bytes > 1024 * 1024) throw new Error("单个学生记录不超过 1 MB，请选择整班备份格式或分批导入。");
    cases = (Array.isArray(data) ? data : [data]).map(record => ({ record }));
  }
  if (cases.length > 100) throw new Error("请分批导入，每次最多 100 份记录。");
  const checked = cases.map(value => validatedCase(value, task));
  const nextCases = [...state.cases];
  const existing = new Map(nextCases.map((item, index) => [item.record.recordId, index]));
  const bodyKeys = ["taskId", "taskVersion", "startedAt", "completedAt", "initial", "initialBoundary", "revision", "revisionBoundary", "supportNeed", "evidenceNote", "changeReason"];
  let added = 0, duplicates = 0, updated = 0, conflicts = 0;
  for (const item of checked) {
    const index = existing.get(item.record.recordId);
    if (index === undefined) { existing.set(item.record.recordId, nextCases.length); nextCases.push(item); added++; continue; }
    const previous = nextCases[index];
    const sameBody = bodyKeys.every(key => previous.record[key] === item.record[key]) && JSON.stringify([...previous.record.sourceIds].sort()) === JSON.stringify([...item.record.sourceIds].sort());
    const feedbackConflict = ["feedback", "revisionFeedback"].some(key => previous.record[key] && item.record[key] && JSON.stringify(previous.record[key]) !== JSON.stringify(item.record[key]));
    if (!sameBody || feedbackConflict) { conflicts++; continue; }
    const record = { ...previous.record };
    let supplemented = false;
    for (const [key, receivedKey] of [["feedback", "aiFeedbackReceived"], ["revisionFeedback", "revisionFeedbackReceived"]]) {
      if (!record[key] && item.record[key]) { record[key] = item.record[key]; record[receivedKey] = true; supplemented = true; }
    }
    // 相同学生原文可补上稍后返回的反馈，教师原有观察、匿名编号均保留。
    if (supplemented) { nextCases[index] = { ...previous, record }; updated++; }
    else duplicates++;
  }
  if (nextCases.length > 100) throw new Error("本轮最多记录 100 份成果，请先导出汇总，再开始新的试用记录。");
  return { state: { ...state, cases: nextCases, sessionNote: state.sessionNote || reviewString(data.sessionNote, 2000) }, added, duplicates, updated, conflicts };
}

export function restoreReviewState(raw, task) {
  if (raw === null || raw === undefined || raw === "") return createReviewState();
  try { return importLearningRecords(createReviewState(), raw, task).state; } catch { return { ...createReviewState(), restoreError: true }; }
}

export function reviewSummary(state) {
  return { total: state.cases.length, withAi: state.cases.filter(item => item.record.aiFeedbackReceived || item.record.revisionFeedbackReceived).length, observed: state.cases.filter(item => Object.keys(reviewDimensions).every(key => item.observation[key] !== "pending")).length, followup: state.cases.filter(item => Object.keys(reviewDimensions).some(key => item.observation[key] === "followup")).length };
}

export function reviewText(state, task, lore = {}) {
  const summary = reviewSummary(state);
  const rows = ["《草地上的路标》· 课堂试用观察", task.title, "", `导入 ${summary.total} 份匿名成果，其中 ${summary.withAi} 份记录实际收到 AI 反馈。`, `教师已完成三项观察 ${summary.observed} 份；标记需要追问 ${summary.followup} 份。`, "这些是本轮记录数量与人工观察，不能据此证明普遍教学效果。", "", "课堂使用情况", state.sessionNote || "（尚未填写）", ""];
  state.cases.forEach((item, index) => {
    rows.push(`记录 ${item.alias || String(index + 1).padStart(2, "0")}`, "最初解释：" + item.record.initial, "最初判断：" + inquiryBoundaryLabels[item.record.initialBoundary], "修改后的解释：" + item.record.revision, "现在判断：" + inquiryBoundaryLabels[item.record.revisionBoundary], "学生的依据说明：" + (item.record.evidenceNote || "未填写"), "学生的修改理由：" + (item.record.changeReason || "未填写"), "资料编号：" + item.record.sourceIds.join("、"), "自选帮助：" + inquirySupportLabels[item.record.supportNeed], "初稿 AI 反馈：" + (item.record.aiFeedbackReceived ? "已收到" : "未收到或未使用"));
    if (lore && item.record.sourceIds.some(id => lore[id])) rows.push("学生所选资料：" + item.record.sourceIds.map(id => lore[id]?.title || id).join("、"));
    if (item.record.feedback) {
      rows.push("初稿反馈", ...inquiryFeedbackText(item.record.feedback, task, lore));
      rows.push("教师核查初稿 AI 建议：" + (feedbackReviewLabels[item.observation.feedbackReview] || feedbackReviewLabels.pending), "初稿反馈核查备注：" + (item.observation.feedbackNote || "尚未填写"));
    }
    rows.push("修订稿 AI 反馈：" + (item.record.revisionFeedbackReceived ? "已收到" : "未收到或未使用"));
    if (item.record.revisionFeedback) {
      rows.push("修订稿反馈", ...inquiryFeedbackText(item.record.revisionFeedback, task, lore));
      rows.push("教师核查修订稿 AI 建议：" + (feedbackReviewLabels[item.observation.revisionFeedbackReview] || feedbackReviewLabels.pending), "修订稿反馈核查备注：" + (item.observation.revisionFeedbackNote || "尚未填写"));
    }
    for (const [key, label] of Object.entries(reviewDimensions)) rows.push("教师观察 · " + label + "：" + observationLabels[item.observation[key]]);
    rows.push("课堂使用：" + classroomLabels[item.observation.classroom], "跟进问题：" + (item.observation.misconceptions.map(key => misconceptionLabels[key]).join("、") || "尚未标记"), "教师备注：" + (item.observation.note || "未填写"), "");
  });
  return rows.join("\n");
}
