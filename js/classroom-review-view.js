import { createReviewState, restoreReviewState, importLearningRecords, reviewSummary, reviewText, observationLabels, classroomLabels, misconceptionLabels, feedbackReviewLabels } from "./classroom-review.js";
import { inquiryBoundaryLabels, inquirySupportLabels } from "./inquiry.js";
import { renderEvidenceFeedback } from "./feedback-view.js";

const reviewElement = id => document.getElementById(id);
const reviewStorageKey = "grassland-road-sign.classroom-review.v1";
let reviewState = createReviewState(), reviewTask, reviewLore, selectedRecord = "";
let reviewRecoveryRaw = null;
const reviewNode = (tag, text) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; };
const activeCase = () => reviewState.cases.find(item => item.record.recordId === selectedRecord);

function saveReview() {
  if (reviewRecoveryRaw !== null) { reviewElement("reviewSaveStatus").textContent = "旧数据未覆盖。请下载原始数据；当前导入内容也可另行备份。"; return; }
  try { localStorage.setItem(reviewStorageKey, JSON.stringify(reviewState)); reviewElement("reviewSaveStatus").textContent = "已保存在当前浏览器，请及时备份。"; }
  catch { reviewElement("reviewSaveStatus").textContent = "浏览器未能保存，请立即下载备份。"; }
}

function renderReviewSummary() {
  const counts = reviewSummary(reviewState);
  for (const [id, key] of [["reviewTotal", "total"], ["reviewAi", "withAi"], ["reviewObserved", "observed"], ["reviewFollowup", "followup"]]) reviewElement(id).textContent = counts[key];
}

function renderCase() {
  const item = activeCase();
  if (!item) return;
  const index = reviewState.cases.indexOf(item);
  reviewElement("caseTitle").textContent = "匿名成果 " + (item.alias || String(index + 1).padStart(2, "0"));
  reviewElement("caseAlias").value = item.alias;
  reviewElement("reviewBefore").textContent = item.record.initial;
  reviewElement("reviewAfter").textContent = item.record.revision;
  reviewElement("reviewBeforeBoundary").textContent = inquiryBoundaryLabels[item.record.initialBoundary];
  reviewElement("reviewAfterBoundary").textContent = inquiryBoundaryLabels[item.record.revisionBoundary];
  reviewElement("caseMeta").textContent = "自选帮助：" + inquirySupportLabels[item.record.supportNeed] + " · 初稿 AI 建议：" + (item.record.aiFeedbackReceived ? "实际收到" : "未使用或未收到") + " · 修订稿 AI 建议：" + (item.record.revisionFeedbackReceived ? "实际收到" : "未使用或未收到");
  reviewElement("reviewEvidence").textContent = "依据说明：" + (item.record.evidenceNote || "学生未填写，需结合表达继续询问。");
  reviewElement("reviewReason").textContent = "修订理由：" + (item.record.changeReason || "学生未填写，需结合表达继续询问。");
  reviewElement("reviewSources").textContent = "学生所选资料：" + item.record.sourceIds.map(id => reviewLore[id]?.title || id).join("、");
  const feedbackBox = reviewElement("reviewFeedback");
  if (item.record.feedback) renderEvidenceFeedback(feedbackBox, item.record.feedback, { task: reviewTask, lore: reviewLore, initial: item.record.initial, heading: "初稿阶段 · AI 实际返回的内容", studentLabel: "AI 对应的学生初稿原话" });
  else feedbackBox.replaceChildren(reviewNode("p", "初稿阶段没有实际收到的 AI 反馈。请直接结合学生表达与资料进行观察。"));
  const revisionFeedbackBox = reviewElement("reviewRevisionFeedback");
  if (item.record.revisionFeedback) renderEvidenceFeedback(revisionFeedbackBox, item.record.revisionFeedback, { task: reviewTask, lore: reviewLore, initial: item.record.revision, heading: "修订稿阶段 · AI 实际返回的内容", studentLabel: "AI 对应的学生修订稿原话" });
  else revisionFeedbackBox.replaceChildren(reviewNode("p", "修订稿阶段没有实际收到的 AI 反馈，旧记录也可能没有这一阶段。"));
  for (const select of document.querySelectorAll("[data-observation]")) select.value = item.observation[select.dataset.observation];
  reviewElement("observeFeedback").disabled = !item.record.aiFeedbackReceived;
  reviewElement("feedbackNote").disabled = !item.record.aiFeedbackReceived;
  reviewElement("feedbackNote").value = item.observation.feedbackNote;
  reviewElement("observeRevisionFeedback").disabled = !item.record.revisionFeedbackReceived;
  reviewElement("revisionFeedbackNote").disabled = !item.record.revisionFeedbackReceived;
  reviewElement("revisionFeedbackNote").value = item.observation.revisionFeedbackNote;
  for (const input of reviewElement("misconceptionList").querySelectorAll("input")) input.checked = item.observation.misconceptions.includes(input.value);
  reviewElement("observationNote").value = item.observation.note;
}

function renderReview() {
  renderReviewSummary();
  reviewElement("reviewEmpty").hidden = reviewState.cases.length > 0;
  reviewElement("reviewWorkspace").hidden = !reviewState.cases.length;
  const list = reviewElement("caseList"); list.replaceChildren();
  if (!activeCase()) selectedRecord = reviewState.cases[0]?.record.recordId || "";
  reviewState.cases.forEach((item, index) => {
    const button = reviewNode("button", item.alias || "记录 " + String(index + 1).padStart(2, "0")); button.type = "button";
    if (item.record.recordId === selectedRecord) button.setAttribute("aria-current", "true");
    button.addEventListener("click", () => { selectedRecord = item.record.recordId; renderReview(); });
    list.append(button);
  });
  renderCase();
}

function downloadReview(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function bootReview() {
  try {
    const load = async path => { const response = await fetch(path, { cache: "no-cache" }); if (!response.ok) throw new Error("资料加载失败"); return response.json(); };
    [reviewTask, reviewLore] = await Promise.all([load("story/inquiry.json"), load("story/lore.json")]);
    let raw = null; try { raw = localStorage.getItem(reviewStorageKey); } catch {}
    reviewState = restoreReviewState(raw, reviewTask);
    if (reviewState.restoreError) { reviewRecoveryRaw = raw; reviewElement("reviewRecovery").hidden = false; }
    for (const select of document.querySelectorAll("[data-observation]")) {
      const labels = select.dataset.observation === "classroom" ? classroomLabels : ["feedbackReview", "revisionFeedbackReview"].includes(select.dataset.observation) ? feedbackReviewLabels : observationLabels;
      for (const [value, text] of Object.entries(labels)) { const option = reviewNode("option", text); option.value = value; select.append(option); }
      select.addEventListener("change", () => { const item = activeCase(); if (!item) return; item.observation[select.dataset.observation] = select.value; saveReview(); renderReviewSummary(); });
    }
    for (const [value, text] of Object.entries(misconceptionLabels)) {
      const label = reviewNode("label"), input = document.createElement("input"); input.type = "checkbox"; input.value = value;
      input.addEventListener("change", () => { const item = activeCase(); if (!item) return; item.observation.misconceptions = [...reviewElement("misconceptionList").querySelectorAll("input:checked")].map(node => node.value); saveReview(); });
      label.append(input, document.createTextNode(text)); reviewElement("misconceptionList").append(label);
    }
    reviewElement("importRecords").addEventListener("change", async event => {
      const files = [...event.target.files];
      if (files.length > 100) { reviewElement("reviewStatus").textContent = "每次最多选择 100 份文件。"; event.target.value = ""; return; }
      let added = 0, duplicates = 0, updated = 0, conflicts = 0, failed = 0;
      for (const file of files) {
        try {
          if (file.size > 8 * 1024 * 1024) throw new Error("文件过大");
          const result = importLearningRecords(reviewState, await file.text(), reviewTask);
          reviewState = result.state; added += result.added; duplicates += result.duplicates; updated += result.updated; conflicts += result.conflicts;
        } catch { failed++; }
      }
      saveReview(); renderReview(); reviewElement("sessionNote").value = reviewState.sessionNote;
      reviewElement("adoptRecoveredRecords").disabled = !reviewState.cases.length;
      reviewElement("reviewStatus").textContent = `新增 ${added} 份；为 ${updated} 份相同原文补充了后续反馈；重复 ${duplicates} 份未重复导入。` + (conflicts ? ` ${conflicts} 份编号相同但内容或反馈不同，未覆盖已有记录，请保留两份文件分别核查。` : "") + (failed ? ` ${failed} 份文件无法读取；学生文件上限 1 MB，整班备份上限 8 MB，请选择本课堂导出的记录。` : "请结合具体表达填写教师观察。");
      event.target.value = "";
    });
    reviewElement("caseAlias").addEventListener("input", event => {
      const item = activeCase(); if (!item) return;
      item.alias = event.target.value.slice(0, 20); saveReview();
      const index = reviewState.cases.indexOf(item);
      reviewElement("caseTitle").textContent = "匿名成果 " + (item.alias || String(index + 1).padStart(2, "0"));
      const button = reviewElement("caseList").querySelector('button[aria-current="true"]');
      if (button) button.textContent = item.alias || "记录 " + String(index + 1).padStart(2, "0");
    });
    reviewElement("observationNote").addEventListener("input", event => { const item = activeCase(); if (!item) return; item.observation.note = event.target.value; saveReview(); });
    reviewElement("feedbackNote").addEventListener("input", event => { const item = activeCase(); if (!item || !item.record.aiFeedbackReceived) return; item.observation.feedbackNote = event.target.value; saveReview(); });
    reviewElement("revisionFeedbackNote").addEventListener("input", event => { const item = activeCase(); if (!item || !item.record.revisionFeedbackReceived) return; item.observation.revisionFeedbackNote = event.target.value; saveReview(); });
    reviewElement("sessionNote").value = reviewState.sessionNote;
    reviewElement("sessionNote").addEventListener("input", event => { reviewState.sessionNote = event.target.value; saveReview(); });
    reviewElement("observationForm").addEventListener("submit", event => event.preventDefault());
    reviewElement("exportReview").addEventListener("click", () => downloadReview(reviewText(reviewState, reviewTask, reviewLore), "草地上的路标-课堂试用观察.txt", "text/plain;charset=utf-8"));
    reviewElement("backupReview").addEventListener("click", () => downloadReview(JSON.stringify(reviewState, null, 2), "草地上的路标-教师试用记录备份.json", "application/json;charset=utf-8"));
    reviewElement("downloadOriginalReview").addEventListener("click", () => { if (reviewRecoveryRaw !== null) downloadReview(reviewRecoveryRaw, "草地上的路标-待恢复原始记录.json", "application/json;charset=utf-8"); });
    reviewElement("adoptRecoveredRecords").addEventListener("click", () => {
      if (!reviewState.cases.length || !confirm("这会用当前导入的记录替换未能恢复的浏览器缓存。请先下载希望保留的原始数据。确定采用当前记录吗？")) return;
      reviewRecoveryRaw = null; delete reviewState.restoreError; reviewElement("reviewRecovery").hidden = true; saveReview();
    });
    renderReview(); reviewElement("reviewStatus").textContent = reviewRecoveryRaw !== null ? "之前的记录暂未恢复，原始数据仍保留。请使用下方恢复选项。" : "工具已准备好。导入前请确认分享意愿，并使用匿名编号。";
  } catch { reviewElement("reviewStatus").textContent = "工具暂时没有准备成功，请刷新重试。现有本机记录未改动。"; }
}
bootReview();
