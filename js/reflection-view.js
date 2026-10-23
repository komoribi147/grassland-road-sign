import { imageSource } from "./visual-delivery.js?v=20261023-hair1";
// 全部原话用 textContent 呈现，玩家输入不会成为页面标记。
function reflectionNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderReflectionReport(container, report, { onChange = () => false } = {}) {
  container.replaceChildren();
  const cover = reflectionNode("div", "reflection-cover");
  const image = reflectionNode("img", "reflection-cover-image");
  image.src = globalThis.__REFLECTION_COVER__ || imageSource("assets/stills/today-path-monument.png", {
    width: globalThis.innerWidth || 1440, dpr: globalThis.devicePixelRatio || 1,
  });
  image.decoding = "async";
  image.alt = "今天的草地，小路旁的纪念碑";
  image.addEventListener("error", () => { image.hidden = true; });
  const coverText = reflectionNode("div", "reflection-cover-text");
  coverText.append(
    reflectionNode("span", "reflection-kicker", "一段路，一次相遇"),
    reflectionNode("blockquote", "reflection-closing", report.closing),
  );
  cover.append(image, coverText);
  container.append(cover);

  const content = reflectionNode("div", "reflection-content");
  content.append(reflectionNode("p", "reflection-intro", "那些名字，那些说过的话，先留在这里。"));
  const people = reflectionNode("section", "reflection-section");
  people.append(reflectionNode("h3", "reflection-heading", "与你同行的人"));
  const cards = reflectionNode("div", "reflection-people");
  const keepButtons = [];
  for (const person of report.companions) {
    const card = reflectionNode("article", "reflection-person");
    card.dataset.person = person.id;
    card.append(
      reflectionNode("h4", "reflection-name", person.name),
      reflectionNode("blockquote", "reflection-quote", person.quote),
    );
    const keep = reflectionNode("button", "reflection-keep");
    keep.type = "button";
    keep.setAttribute("aria-label", `留住${person.name}的这句话`);
    const update = () => {
      const active = report.reflection.keptId === person.id;
      keep.setAttribute("aria-pressed", String(active));
      keep.textContent = active ? "已留住这句话" : "留住这句话";
      card.classList.toggle("kept", active);
    };
    keep.addEventListener("click", () => {
      report.reflection.keptId = report.reflection.keptId === person.id ? "" : person.id;
      keepButtons.forEach((refresh) => refresh());
      persist();
    });
    keepButtons.push(update);
    update();
    card.append(keep);
    cards.append(card);
  }
  if (!report.companions.length) cards.append(reflectionNode("p", "reflection-muted", "这一页还没有留下人物对话。"));
  people.append(cards);
  content.append(people);

  if (report.said.length) {
    const spoken = reflectionNode("section", "reflection-section");
    spoken.append(reflectionNode("h3", "reflection-heading", "你也曾这样说"));
    const lines = reflectionNode("div", "reflection-own-words");
    for (const text of report.said) lines.append(reflectionNode("blockquote", "reflection-own-quote", text));
    spoken.append(lines);
    content.append(spoken);
  }
  if (report.picks.length) {
    const choices = reflectionNode("details", "reflection-details");
    choices.append(reflectionNode("summary", "", "回看你做过的选择"));
    const list = reflectionNode("ul", "reflection-choices");
    for (const text of report.picks) list.append(reflectionNode("li", "", text));
    choices.append(list);
    content.append(choices);
  }

  const noteArea = reflectionNode("section", "reflection-section reflection-note-area");
  const noteLabel = reflectionNode("label", "reflection-heading", "给这段路留一句话");
  noteLabel.htmlFor = "reflectionNote";
  const help = reflectionNode("p", "reflection-muted", "写给同行的人，也写给现在的自己。想写的时候再写，留白也可以。");
  help.id = "reflectionNoteHelp";
  const note = reflectionNode("textarea", "reflection-note");
  note.id = "reflectionNote";
  note.name = "reflectionNote";
  note.rows = 4;
  note.maxLength = 1000;
  note.placeholder = "一个名字，一个瞬间，或一句还没说出口的话……";
  note.value = report.reflection.note;
  note.setAttribute("aria-describedby", help.id);
  const saved = reflectionNode("p", "reflection-save-state");
  saved.setAttribute("role", "status");
  saved.setAttribute("aria-live", "polite");
  function persist() {
    saved.textContent = onChange() ? "已保存在这台设备" : "这次未能保存到设备，可以用上方按钮保存回望。";
  }
  note.addEventListener("input", () => {
    report.reflection.note = note.value;
    persist();
  });
  noteArea.append(noteLabel, help, note, saved);
  content.append(noteArea);

  const sources = reflectionNode("details", "reflection-details reflection-sources");
  sources.append(reflectionNode("summary", "", "故事之外的历史"));
  sources.append(reflectionNode("p", "reflection-muted", "人物与具体遭遇为艺术创作，角色对话不作为史料引用。这一路解锁的史料，留待想了解更多时慢慢读。"));
  for (const source of report.sourceCards) {
    const card = reflectionNode("article", "reflection-source");
    card.append(reflectionNode("h4", "", source.title), reflectionNode("p", "", source.text));
    if (source.sourceUrl && source.sourceTitle && /^https?:\/\//i.test(source.sourceUrl)) {
      const link = reflectionNode("a", "reflection-source-link", source.sourceTitle);
      link.href = source.sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      card.append(link);
    }
    sources.append(card);
  }
  if (!report.sourceCards.length) sources.append(reflectionNode("p", "reflection-muted", "这次体验尚未解锁史料卡。"));
  content.append(sources);
  content.append(reflectionNode("p", "reflection-date", new Date(report.createdAt).toLocaleDateString("zh-CN")));
  container.append(content);
}
