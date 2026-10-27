import { feedbackFor } from "./inquiry.js";

const feedbackNode = (tag, className, text) => {
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function renderEvidenceFeedback(container, value, { task, lore, initial, heading = "AI 阅读建议 · 请结合资料核对", studentLabel = "这次回应的是你的这句话" }) {
  container.replaceChildren();
  const feedback = feedbackFor(value, task, initial);
  if (!feedback) return false;
  const card = feedbackNode("article", "feedback-card evidence-feedback");
  card.append(feedbackNode("h4", "", heading));
  if (feedback.model) card.append(feedbackNode("p", "feedback-model", "记录中的模型：" + feedback.model));
  if (feedback.version === 2) {
    const quote = feedbackNode("div", "feedback-student");
    quote.append(feedbackNode("span", "card-label", studentLabel), feedbackNode("blockquote", "", feedback.studentQuote));
    card.append(quote);
  } else card.append(feedbackNode("p", "feedback-legacy", "旧版反馈未记录对应原句和逐句摘录。以下保留当时实际收到的内容，不补造引用。"));
  for (const [label, text] of [["AI 的回应", feedback.observation], ["AI 的解释", feedback.evidenceNote], ["留给学生的追问", feedback.question]]) {
    const block = feedbackNode("section", "feedback-section");
    block.append(feedbackNode("span", "card-label", label), feedbackNode("p", label === "留给学生的追问" ? "feedback-question" : "", text));
    card.append(block);
  }
  if (feedback.version === 2) for (const [index, citation] of feedback.citations.entries()) {
    const source = lore[citation.sourceId];
    const evidence = feedbackNode("section", "feedback-evidence");
    evidence.append(feedbackNode("h5", "", `依据 ${index + 1} · ${source?.title || citation.sourceId}`), feedbackNode("span", "card-label", "本页资料整理摘录 · 非史料原文"), feedbackNode("blockquote", "", citation.excerpt), feedbackNode("p", "feedback-scope", "资料支持的范围（项目组整理）：" + citation.scope));
    card.append(evidence);
  }
  for (const id of feedback.sourceIds) {
    const source = lore[id]; if (!source) continue;
    const details = feedbackNode("details", "feedback-source-detail");
    details.append(feedbackNode("summary", "", "查看完整资料卡 · " + source.title), feedbackNode("p", "", source.text), feedbackNode("small", "", "项目组整理，非原始史料的逐字引文。"));
    if (source.sourceTitle && source.sourceUrl) {
      const link = feedbackNode("a", "source-link", "原始来源 · " + source.sourceTitle + " ↗");
      link.href = source.sourceUrl; link.target = "_blank"; link.rel = "noopener noreferrer";
      details.append(link);
    }
    card.append(details);
  }
  card.append(feedbackNode("p", "feedback-caution", "原话和摘录能够对应，不代表 AI 的解释已经被证明正确。请结合资料和教师意见核对。"));
  container.append(card);
  return true;
}
