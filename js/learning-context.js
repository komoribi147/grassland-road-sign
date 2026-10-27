export function learningInquiryLink(protocol) {
  return protocol === "file:" ? null : "inquiry.html?from=story";
}

export function contextualInquiry(state) {
  if (!state || state.vars?.learningCueDismissed || !state.lore?.includes("lubiao")) return null;
  const relevant = (state.sceneId === "act2" && state.step >= 46) || (state.sceneId === "act3" && state.step <= 12);
  return relevant ? { key: "signpost-evidence", sourceId: "lubiao", title: "探路棍与红布，史料实际支持什么？", href: "inquiry.html?from=story" } : null;
}
