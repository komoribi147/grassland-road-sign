// 自由提问：只在当前场景在场人物中切换，每个人物独立记忆；
// 提问不推进主线、不改信任值，关闭后回到原来那一句/那组选项。
export function initAsk(engine) {
  const dialogue = document.getElementById("dialogue");
  const inner = dialogue?.querySelector(".dialogue-inner");
  if (!dialogue || !inner || !engine) return;

  const layer = document.createElement("div");
  layer.id = "askLayer";
  layer.hidden = true;
  layer.innerHTML = `
    <div class="ask-card" role="dialog" aria-modal="true" aria-label="自由提问">
      <div class="ask-head">
        <h2>自由提问</h2>
        <button type="button" class="ask-close" id="askClose">返回剧情</button>
      </div>
      <div class="ask-who" id="askWho"></div>
      <div class="ask-log" id="askLog"></div>
      <form class="ask-row" id="askForm">
        <input id="askInput" type="text" maxlength="80" autocomplete="off" placeholder="问一句此刻的事…" />
        <button type="submit" id="askSend">问</button>
      </form>
      <p class="ask-note">他们只知道此刻以前的事；以后的事，只能按自己的见识去猜。</p>
    </div>`;
  document.body.appendChild(layer);

  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.id = "askBtn";
  openBtn.className = "ask-open";
  openBtn.textContent = "自由提问";
  openBtn.hidden = true;
  openBtn.title = "AI 未连接";
  inner.appendChild(openBtn);

  const whoEl = layer.querySelector("#askWho");
  const logEl = layer.querySelector("#askLog");
  const form = layer.querySelector("#askForm");
  const input = layer.querySelector("#askInput");
  const sendBtn = layer.querySelector("#askSend");
  const closeBtn = layer.querySelector("#askClose");

  let activeNpc = null;
  let busy = false;
  let requestVersion = 0;

  const memory = () => {
    if (!engine.state) return {};
    if (!engine.state.askMemory) engine.state.askMemory = {};
    return engine.state.askMemory;
  };

  const present = () => {
    try {
      return (engine.presentNpcs?.() || []).filter((id) => id !== "he-xiuying-old" && engine.characters?.[id]);
    } catch {
      return [];
    }
  };

  const displayOf = (npc) => engine.characters?.[npc]?.display || npc;

  function preferredNpc(list) {
    const step = engine.scene?.()?.steps?.[engine.state?.step] || {};
    const candidate = step.ai || step.who;
    if (list.includes(candidate)) return candidate;
    return list[0];
  }

  function renderWho() {
    const list = present();
    whoEl.innerHTML = "";
    for (const npc of list) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ask-chip" + (npc === activeNpc ? " on" : "");
      btn.textContent = displayOf(npc);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (busy || npc === activeNpc) return;
        activeNpc = npc;
        renderWho();
        renderLog();
        input.focus();
      });
      whoEl.appendChild(btn);
    }
  }

  function addMsg(kind, text) {
    const div = document.createElement("div");
    div.className = "ask-msg " + kind;
    div.textContent = text;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
    return div;
  }

  function renderLog() {
    logEl.innerHTML = "";
    const list = memory()[activeNpc] || [];
    if (!list.length) {
      logEl.innerHTML = '<div class="ask-empty">他还没听你问过什么。说一句此刻的事吧。</div>';
      return;
    }
    for (const item of list) {
      addMsg("q", "你：" + item.q);
      addMsg("a", displayOf(activeNpc) + "：" + item.a);
    }
  }

  function open() {
    const list = present();
    if (!list.length) {
      engine.on?.toast?.("这会儿身边没有人。");
      return;
    }
    if (!activeNpc || !list.includes(activeNpc)) activeNpc = preferredNpc(list);
    layer.hidden = false;
    renderWho();
    renderLog();
    setTimeout(() => input.focus(), 40);
  }

  function close() {
    requestVersion++;
    busy = false;
    sendBtn.disabled = false;
    input.disabled = false;
    layer.hidden = true;
    input.blur();
  }

  async function send() {
    const text = input.value.trim();
    if (!text || busy) return;
    const list = present();
    if (!list.includes(activeNpc)) {
      engine.on?.toast?.("他不在这儿。");
      return;
    }

    const npc = activeNpc;
    const state = engine.state;
    const epoch = engine.epoch;
    const version = ++requestVersion;
    const current = () => version === requestVersion && engine.state === state && engine.epoch === epoch && !layer.hidden && activeNpc === npc;
    busy = true;
    sendBtn.disabled = true;
    input.disabled = true;
    input.value = "";
    addMsg("q", "你：" + text);
    const pending = addMsg("pending", "……");

    const lore = (engine.state?.lore || [])
      .map((id) => engine.lore?.[id])
      .filter(Boolean)
      .map((c) => ({ title: c.title, text: c.text }));

    const payload = {
      npc,
      mode: "ask",
      playerText: text,
      situation: engine.situationText?.("") || "",
      sceneTitle: engine.scene?.()?.title || "",
      step: engine.state?.step ?? 0,
      trust: engine.state?.trust ?? 0,
      address: engine.address?.() || "你",
      present: list,
      knownLore: lore,
      askHistory: (memory()[activeNpc] || []).slice(-6),
      memories: (engine.memoryOf?.(activeNpc) || []).filter((m) => m.role === "player").slice(-6).map((m) => m.text),
      history: (engine.state?.history || []).slice(-4).map((h) => ({ role: h.role, text: h.text })),
    };

    try {
      let answer = "";
      try {
        const data = await engine.ai.ask(payload);
        answer = String(data.text).trim();
        if (!answer) throw new Error("empty");
      } catch {
        if (!current()) return;
        input.value = text;
        renderLog();
        const status = addMsg("status", "这句话没能送达，对话暂时连不上。原话已保留，可以重试。");
        status.setAttribute("role", "status");
        return;
      }
      // 关闭、重开或回看后，旧请求不再属于眼前这次体验。
      if (!current()) return;
      const listMem = memory()[npc] || (memory()[npc] = []);
      listMem.push({ q: text, a: answer });
      if (listMem.length > 12) listMem.splice(0, listMem.length - 12);
      try { engine.autosave?.(); } catch { /* 忽略 */ }
      renderLog();
    } finally {
      pending.remove();
      if (version === requestVersion) {
        busy = false;
        sendBtn.disabled = false;
        input.disabled = false;
        if (current()) input.focus();
      }
    }
  }

  async function checkAi() {
    try {
      if (!await engine.ai.check()) throw new Error("offline");
      openBtn.hidden = false;
      openBtn.title = "";
    } catch {
      openBtn.hidden = true;
      openBtn.title = "AI 未连接";
    }
  }

  openBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    open();
  });

  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); close(); });
  form.addEventListener("submit", (e) => { e.preventDefault(); e.stopPropagation(); send(); });

  // 面板内的点击/按键不要传给主线的“点击继续”和“空格推进”
  for (const type of ["click", "pointerdown", "keydown"]) {
    layer.addEventListener(type, (e) => {
      if (type === "keydown" && e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      e.stopPropagation();
    });
  }

  // 打开时把人物按当前场景刷新（换幕/换人后仍然只显示在场者）
  const refresh = () => {
    if (!layer.hidden) {
      const list = present();
      if (!list.includes(activeNpc)) activeNpc = list[0] || null;
      renderWho();
    }
  };
  new MutationObserver(refresh).observe(dialogue, { attributes: true, attributeFilter: ["hidden"] });
  void checkAi();
}
