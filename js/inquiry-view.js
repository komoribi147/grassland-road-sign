import { createInquiry, restoreInquiry, inquiryRequest, feedbackFor, currentInquiryFeedback, inquiryText, inquiryBoundaryLabels, inquiryStageAllowed, commitInquiryInitial, inquirySupportLabels, inquirySupportHint, buildInquiryRecord } from "./inquiry.js";
import { AiClient } from "./ai.js";
import { renderEvidenceFeedback } from "./feedback-view.js";

const inquiryElement = id => document.getElementById(id);
const inquiryStorageKey = "grassland-road-sign.inquiry.signpost.v1";
const inquiryApi = new AiClient();
let inquiryDraft, inquiryTask, inquiryLore, inquiryController;
let inquiryGeneration = 0;
const inquiryNode = (tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function persistInquiry() {
  try {
    localStorage.setItem(inquiryStorageKey, JSON.stringify(inquiryDraft));
    inquiryElement("saveStatus").textContent = "已自动保存在当前浏览器";
  } catch { inquiryElement("saveStatus").textContent = "浏览器未能保存，请完成后下载记录"; }
}

function cancelInquiryRequest() {
  inquiryGeneration++;
  inquiryController?.abort();
  inquiryController = null;
  for (const id of ["askInquiry", "askRevision"]) inquiryElement(id).disabled = false;
  for (const id of ["requestStatus", "revisionRequestStatus"]) inquiryElement(id).textContent = "";
}

function invalidateInquiry(mode = "initial") {
  cancelInquiryRequest();
  if (mode === "initial") inquiryDraft.feedback = null;
  inquiryDraft.revisionFeedback = null;
}

function renderInquiryFeedback() {
  for (const container of document.querySelectorAll("[data-feedback]")) {
    container.replaceChildren();
    const feedback = inquiryDraft.feedback;
    if (!feedback || feedback.snapshot !== JSON.stringify(inquiryRequest(inquiryDraft, inquiryTask))) continue;
    renderEvidenceFeedback(container, feedback, { task: inquiryTask, lore: inquiryLore, initial: inquiryDraft.initial });
  }
  for (const container of document.querySelectorAll("[data-revision-feedback]")) {
    container.replaceChildren();
    const feedback = currentInquiryFeedback(inquiryDraft, inquiryTask, "revision");
    if (feedback) renderEvidenceFeedback(container, feedback, { task: inquiryTask, lore: inquiryLore, initial: inquiryDraft.revision, heading: "AI 对修订稿的阅读建议 · 请继续核对", studentLabel: "这次回应的是你的修订稿" });
  }
}

function renderInquiry(focus = true) {
  for (const panel of document.querySelectorAll("[data-panel]")) panel.hidden = Number(panel.dataset.panel) !== inquiryDraft.stage;
  for (const button of document.querySelectorAll("[data-stage]")) {
    const step = Number(button.dataset.stage);
    button.disabled = !inquiryStageAllowed(inquiryDraft, step, inquiryTask);
    if (step === inquiryDraft.stage) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  }
  inquiryElement("initialAnswer").value = inquiryDraft.initial;
  inquiryElement("initialAnswer").readOnly = inquiryDraft.initialCommitted;
  inquiryElement("initialLocked").hidden = !inquiryDraft.initialCommitted;
  inquiryElement("revisionAnswer").value = inquiryDraft.revision;
  inquiryElement("evidenceNote").value = inquiryDraft.evidenceNote;
  inquiryElement("changeReason").value = inquiryDraft.changeReason;
  for (const group of ["initialBoundary", "revisionBoundary"]) {
    for (const input of inquiryElement(group).querySelectorAll("input")) {
      input.checked = inquiryDraft[group] === input.value;
      input.disabled = group === "initialBoundary" && inquiryDraft.initialCommitted;
    }
  }
  for (const input of inquiryElement("supportNeed").querySelectorAll("input")) input.checked = inquiryDraft.supportNeed === input.value;
  inquiryElement("supportHint").textContent = inquirySupportHint(inquiryDraft, inquiryTask);
  for (const input of inquiryElement("sourceList").querySelectorAll("input")) input.checked = inquiryDraft.sourceIds.includes(input.value);
  inquiryElement("originalQuote").textContent = inquiryDraft.initial;
  inquiryElement("selectedSources").textContent = "我准备引用：" + inquiryDraft.sourceIds.map(id => inquiryLore[id].title).join("、");
  renderInquiryFeedback();
  inquiryElement("beforeText").textContent = inquiryDraft.initial;
  inquiryElement("afterText").textContent = inquiryDraft.revision;
  inquiryElement("beforeBoundary").textContent = inquiryBoundaryLabels[inquiryDraft.initialBoundary];
  inquiryElement("afterBoundary").textContent = inquiryBoundaryLabels[inquiryDraft.revisionBoundary];
  inquiryElement("recordEvidence").textContent = "我的依据：" + (inquiryDraft.evidenceNote || "尚未填写，可返回第三步补充。");
  inquiryElement("recordReason").textContent = "修改或保留的理由：" + (inquiryDraft.changeReason || "尚未填写，可返回第三步补充。");
  const sources = inquiryElement("recordSources");
  sources.replaceChildren(inquiryNode("p", "", "这次解释所引用的资料："));
  for (const id of inquiryDraft.sourceIds) {
    const card = inquiryLore[id];
    const link = inquiryNode("a", "", card.sourceTitle + " ↗");
    link.href = card.sourceUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
    sources.append(link);
  }
  if (focus) {
    document.querySelector(`[data-panel="${inquiryDraft.stage}"] h2`).focus({ preventScroll: true });
    inquiryElement("workspace").scrollIntoView({ block: "start", behavior: "instant" });
  }
}

function goInquiry(stage) {
  if (!inquiryStageAllowed(inquiryDraft, stage, inquiryTask)) return;
  if (stage >= 2) inquiryDraft = commitInquiryInitial(inquiryDraft);
  // 切换步骤时取消旧请求；之后的回复不能落进另一次编辑。
  cancelInquiryRequest();
  inquiryDraft.stage = stage;
  persistInquiry();
  renderInquiry();
}

function buildInquiryInputs() {
  for (const group of ["initialBoundary", "revisionBoundary"]) {
    for (const [value, title] of Object.entries(inquiryBoundaryLabels)) {
      const label = inquiryNode("label", "");
      const input = document.createElement("input");
      input.type = "radio"; input.name = group; input.value = value;
      input.addEventListener("change", () => {
        if (group === "initialBoundary" && inquiryDraft.initialCommitted) return;
        invalidateInquiry(group === "initialBoundary" ? "initial" : "revision");
        inquiryDraft[group] = value;
        persistInquiry();
        renderInquiryFeedback();
      });
      label.append(input, document.createTextNode(title));
      inquiryElement(group).append(label);
    }
  }
  for (const [value, text] of Object.entries(inquirySupportLabels)) {
    const label = inquiryNode("label", "");
    const input = document.createElement("input"); input.type = "radio"; input.name = "supportNeed"; input.value = value;
    input.addEventListener("change", () => { invalidateInquiry(); inquiryDraft.supportNeed = value; persistInquiry(); inquiryElement("supportHint").textContent = inquirySupportHint(inquiryDraft, inquiryTask); renderInquiryFeedback(); });
    label.append(input, document.createTextNode(text)); inquiryElement("supportNeed").append(label);
  }
  for (const [index, id] of inquiryTask.sourceIds.entries()) {
    const source = inquiryLore[id];
    const card = inquiryNode("article", "source-card"); card.id = "source-" + id;
    card.append(inquiryNode("span", "card-label", "资料 " + String(index + 1).padStart(2, "0")), inquiryNode("h3", "", source.title), inquiryNode("p", "source-body", source.text), inquiryNode("p", "source-note", "项目组依据下列公开资料整理 · 非史料原文"));
    const link = inquiryNode("a", "source-link", source.sourceTitle + " ↗");
    link.href = source.sourceUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
    card.append(link);
    const label = inquiryNode("label", "source-select");
    const check = document.createElement("input"); check.type = "checkbox"; check.value = id;
    check.addEventListener("change", () => {
      invalidateInquiry();
      inquiryDraft.sourceIds = [...inquiryElement("sourceList").querySelectorAll("input:checked")].map(input => input.value);
      inquiryElement("sourceError").hidden = true;
      persistInquiry();
      renderInquiryFeedback();
    });
    label.append(check, document.createTextNode("把这张资料作为我的解释依据")); card.append(label);
    inquiryElement("sourceList").append(card);
  }
  for (const text of inquiryTask.manualHints) inquiryElement("manualHints").append(inquiryNode("li", "", text));
}

async function askInquiry(mode = "initial") {
  const isRevision = mode === "revision";
  if (isRevision && (inquiryDraft.stage !== 4 || !inquiryDraft.revision.trim())) return;
  if (!inquiryDraft.sourceIds.length) {
    inquiryElement("sourceError").hidden = false;
    inquiryElement("sourceList").querySelector("input").focus();
    return;
  }
  cancelInquiryRequest();
  const controller = new AbortController(); inquiryController = controller;
  const generation = ++inquiryGeneration;
  const payload = inquiryRequest(inquiryDraft, inquiryTask, mode);
  const snapshot = JSON.stringify(payload);
  const feedbackKey = isRevision ? "revisionFeedback" : "feedback";
  const button = inquiryElement(isRevision ? "askRevision" : "askInquiry");
  const status = inquiryElement(isRevision ? "revisionRequestStatus" : "requestStatus");
  inquiryDraft[feedbackKey] = null; persistInquiry(); renderInquiryFeedback();
  button.disabled = true;
  status.textContent = isRevision ? "正在对照初稿、修订稿和你的依据说明…你也可以直接下载自己的记录。" : "正在结合资料阅读你的解释…你也可以直接进入下一步。";
  const timer = setTimeout(() => controller.abort(), 80000);
  try {
    const response = await fetch(inquiryApi.endpoint("api/inquiry"), { method: "POST", headers: { "Content-Type": "application/json" }, body: snapshot, signal: controller.signal });
    if (!response.ok) throw new Error("unavailable");
    const feedback = feedbackFor(await response.json(), inquiryTask, isRevision ? payload.revision : payload.initial);
    if (!feedback) throw new Error("invalid");
    if (generation !== inquiryGeneration || snapshot !== JSON.stringify(inquiryRequest(inquiryDraft, inquiryTask, mode))) return;
    inquiryDraft[feedbackKey] = { ...feedback, snapshot };
    persistInquiry(); renderInquiryFeedback();
    status.textContent = isRevision ? "修订稿建议已返回。请检查它是否准确理解你的修改；也可以把这个追问留给课堂交流。" : "建议已返回。看看它的依据，再决定是否修改自己的解释。";
  } catch {
    if (generation !== inquiryGeneration) return;
    status.textContent = isRevision ? "这次未能取得修订稿反馈。你的两次表达与依据仍保留，可以直接下载记录、交给教师讨论或稍后重试。" : "这次未能取得 AI 反馈。你的原话已保留；可以重试，或展开下方资料提示，继续修改解释。";
  } finally {
    clearTimeout(timer);
    if (generation === inquiryGeneration) { button.disabled = false; inquiryController = null; }
  }
}

async function bootInquiry() {
  try {
    const load = async path => { const response = await fetch(path, { cache: "no-cache" }); if (!response.ok) throw new Error("资料暂时不可用"); return response.json(); };
    [inquiryTask, inquiryLore] = await Promise.all([load("story/inquiry.json"), load("story/lore.json")]);
    for (const id of inquiryTask.sourceIds) if (!inquiryLore[id]) throw new Error("资料缺失");
    let stored = null; try { stored = localStorage.getItem(inquiryStorageKey); } catch {}
    inquiryDraft = restoreInquiry(stored, inquiryTask);
    inquiryElement("sceneText").textContent = inquiryTask.scene;
    inquiryElement("sceneNote").textContent = inquiryTask.sceneNote;
    inquiryElement("inquiryQuestion").textContent = inquiryTask.question;
    inquiryElement("boundaryClaim").textContent = inquiryTask.boundaryClaim;
    buildInquiryInputs();
    for (const button of document.querySelectorAll("[data-stage], [data-go]")) button.addEventListener("click", () => goInquiry(Number(button.dataset.stage || button.dataset.go)));
    for (const [id, key] of [["initialAnswer", "initial"], ["revisionAnswer", "revision"], ["evidenceNote", "evidenceNote"], ["changeReason", "changeReason"]]) {
      inquiryElement(id).addEventListener("input", event => {
        if (key === "initial" && inquiryDraft.initialCommitted) { event.target.value = inquiryDraft.initial; return; }
        invalidateInquiry(key === "initial" ? "initial" : "revision");
        inquiryDraft[key] = event.target.value; persistInquiry();
        renderInquiryFeedback();
      });
    }
    inquiryElement("initialForm").addEventListener("submit", event => { event.preventDefault(); if (inquiryDraft.initial.trim()) { inquiryDraft = commitInquiryInitial(inquiryDraft); goInquiry(2); } else inquiryElement("initialAnswer").focus(); });
    inquiryElement("revisionForm").addEventListener("submit", event => { event.preventDefault(); if (inquiryDraft.revision.trim()) { inquiryDraft.completedAt = Date.now(); goInquiry(4); } else inquiryElement("revisionAnswer").focus(); });
    inquiryElement("toRevision").addEventListener("click", () => {
      if (!inquiryDraft.sourceIds.length) { inquiryElement("sourceError").hidden = false; inquiryElement("sourceList").querySelector("input").focus(); return; }
      goInquiry(3);
    });
    inquiryElement("askInquiry").addEventListener("click", () => askInquiry());
    inquiryElement("askRevision").addEventListener("click", () => askInquiry("revision"));
    inquiryElement("downloadInquiry").addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([inquiryText(inquiryDraft, inquiryTask, inquiryLore)], { type: "text/plain;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = "草地上的路标-我的史料探究.txt"; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    inquiryElement("downloadLearningRecord").addEventListener("click", () => {
      const record = buildInquiryRecord(inquiryDraft, inquiryTask);
      if (!record) return;
      const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: "application/json;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = "草地上的路标-匿名学习记录.json"; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    inquiryElement("restartInquiry").addEventListener("click", () => {
      if (!confirm("开始新一次探究会替换这次的本机草稿。请先下载希望保留的记录。现在开始新一次吗？")) return;
      invalidateInquiry(); inquiryDraft = createInquiry(inquiryTask); goInquiry(1);
    });
    if (new URLSearchParams(location.search).get("from") === "story") {
      inquiryElement("storyOrigin").hidden = false;
      for (const link of document.querySelectorAll("[data-return-story]")) { link.href = "index.html#resume"; link.textContent = "回到刚才的故事 →"; }
    }
    inquiryElement("loadStatus").hidden = true;
    inquiryElement("workspace").hidden = false;
    renderInquiry(false);
  } catch {
    inquiryElement("loadStatus").textContent = "探究资料暂时没有加载成功。请刷新重试，或返回故事继续体验。";
  }
}

addEventListener("pagehide", () => {
  const wasPending = Boolean(inquiryController);
  cancelInquiryRequest();
  if (wasPending) for (const id of ["requestStatus", "revisionRequestStatus"]) inquiryElement(id).textContent = "已取消上次阅读请求，可以重新提问。";
});
bootInquiry();
