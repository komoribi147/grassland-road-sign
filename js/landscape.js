// 横屏手机的画面说明栏：对话隐藏（纯画面节拍）时，把当前画面的描述放进右栏，
// 避免右侧出现一块空黑。仅在 (orientation: landscape) and (max-height: 520px) 生效。
(() => {
  const mq = matchMedia("(orientation: landscape) and (max-height: 520px)");
  const dialogue = document.getElementById("dialogue");
  const canvas = document.getElementById("storyVisual");
  const hint = document.getElementById("visualHint");
  if (!dialogue || !canvas) return;

  const panel = document.createElement("aside");
  panel.id = "lsPanel";
  panel.hidden = true;
  panel.innerHTML =
    '<div class="ls-kicker">画面</div>' +
    '<p class="ls-text"></p>' +
    '<div class="ls-foot">点击画面继续</div>';
  document.body.appendChild(panel);
  const textEl = panel.querySelector(".ls-text");

  let raf = 0;
  function sync() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const active = mq.matches
        && document.body.dataset.mode === "playing"
        && dialogue.hidden;
      if (!active) {
        panel.hidden = true;
        return;
      }
      let text = (canvas.getAttribute("aria-label") || "").replace(/^我看见：/, "").trim();
      if (!text) {
        text = (hint?.textContent || "").replace(/（[^）]*）/g, "").trim();
      }
      textEl.textContent = text || "画面加载中…";
      panel.hidden = false;
    });
  }

  const obs = new MutationObserver(sync);
  obs.observe(dialogue, { attributes: true, attributeFilter: ["hidden"] });
  obs.observe(canvas, { attributes: true, attributeFilter: ["aria-label", "hidden"] });
  obs.observe(document.body, { attributes: true, attributeFilter: ["data-mode"] });
  mq.addEventListener("change", sync);
  window.addEventListener("resize", sync);
  sync();
})();
