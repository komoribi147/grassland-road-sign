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

  const apiBase = () => String(globalThis.__AI_API_BASE__ || "").replace(/\/+$/, "");
  const apiUrl = (path) => apiBase() ? `${apiBase()}/${path}` : `/${path}`;

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

  function fallbackLine(npc) {
    const pool = engine.characters?.[npc]?.freeFallback || ["……"];
    return pool[Math.floor(Math.random() * pool.length)];
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
      npc: activeNpc,
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

    let answer = "";
    try {
      const res = await fetch(apiUrl("api/ask"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.text) throw new Error(data.error || "请求失败");
      answer = String(data.text).trim();
    } catch {
      answer = fallbackLine(activeNpc);
    }

    if (!answer) answer = fallbackLine(activeNpc);
    pending.remove();

    const listMem = memory()[activeNpc] || (memory()[activeNpc] = []);
    listMem.push({ q: text, a: answer });
    if (listMem.length > 12) listMem.splice(0, listMem.length - 12);
    try { engine.autosave?.(); } catch { /* 忽略 */ }

    // 重新按记忆渲染，保证切换人物后还能看到各自的对话
    renderLog();
    busy = false;
    sendBtn.disabled = false;
    input.disabled = false;
    input.focus();
  }

  async function checkAi() {
    try {
      const res = await fetch(apiUrl("api/health"), { cache: "no-store" });
      if (!res.ok) throw new Error("health");
      const data = await res.json();
      if (!data.ai) throw new Error("offline");
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
