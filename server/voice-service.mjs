import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const normalizeVoiceText = text => String(text || "").replace(/\s+/g, " ").trim();
export const voiceKey = (npc, text, profile) => createHash("sha256")
  .update(JSON.stringify([2, npc, normalizeVoiceText(text), profile.voice, profile.rate, profile.pitch])).digest("hex");

export function createVoiceService({ cacheDir, profiles, synthesize }) {
  const pending = new Map();
  const stopped = () => new DOMException("配音已停止", "AbortError");
  const subscribe = (work, signal) => new Promise((resolve, reject) => {
    work.clients++;
    let finished = false;
    const finish = (callback, value) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", onAbort);
      work.clients--;
      if (!work.clients && !work.done) {
        work.controller.abort();
        if (pending.get(work.key) === work) pending.delete(work.key);
      }
      callback(value);
    };
    const onAbort = () => finish(reject, stopped());
    signal?.addEventListener("abort", onAbort, { once: true });
    work.promise.then(value => finish(resolve, value), error => finish(reject, error));
    if (signal?.aborted) onAbort();
  });
  return {
    async speak(npc, rawText, mood = "", signal) {
      if (signal?.aborted) throw stopped();
      if (!Object.hasOwn(profiles, npc)) throw new Error("未知配音角色");
      if (typeof rawText !== "string" || !rawText.trim() || rawText.length > 1200) throw new Error("配音文本应为 1 至 1200 字");
      const text = normalizeVoiceText(rawText);
      const profile = profiles[npc].moods?.[mood] || profiles[npc];
      const key = voiceKey(npc, text, profile);
      const file = path.join(cacheDir, `${key}.mp3`);
      try { const cached = await readFile(file); if (signal?.aborted) throw stopped(); if (cached.length) return cached; } catch (error) { if (error.code !== "ENOENT") throw error; }
      if (signal?.aborted) throw stopped();
      if (pending.has(key)) return subscribe(pending.get(key), signal);
      if (pending.size >= 4) throw new Error("配音正忙，请稍后再试");
      const work = { key, controller: new AbortController(), clients: 0, done: false, promise: null };
      work.promise = (async () => {
        await mkdir(cacheDir, { recursive: true });
        if (work.controller.signal.aborted) throw stopped();
        const audio = await synthesize({ npc, text, profile, signal: work.controller.signal });
        if (!Buffer.isBuffer(audio) || audio.length === 0) throw new Error("语音服务未返回音频");
        const temp = `${file}.${randomUUID()}.tmp`;
        try { await writeFile(temp, audio); await rename(temp, file); }
        finally { await rm(temp, { force: true }).catch(() => {}); }
        return audio;
      })().finally(() => { work.done = true; if (pending.get(key) === work) pending.delete(key); });
      pending.set(key, work);
      return subscribe(work, signal);
    },
  };
}

export function resolveVoicePython() {
  if (process.env.VOICE_PYTHON) return process.env.VOICE_PYTHON;
  const bundled = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", process.platform === "win32" ? "python.exe" : "bin/python3");
  return existsSync(bundled) ? bundled : process.platform === "win32" ? "python" : "python3";
}

export async function synthesizeWithEdge({ text, profile }) {
  const tempDir = path.join(root, "node_modules", ".voice-tmp");
  await mkdir(tempDir, { recursive: true });
  const output = path.join(tempDir, `${randomUUID()}.mp3`);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(resolveVoicePython(), [path.join(root, "server", "synthesize-voice.py")], { cwd: root, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
      let stderr = "";
      const timer = setTimeout(() => { child.kill(); reject(new Error("配音超时，请重试")); }, 40000);
      child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-1800); });
      child.on("error", err => { clearTimeout(timer); reject(err); });
      child.stdin.on("error", () => {});
      child.on("close", code => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error(`AI 配音暂时不可用（${stderr.trim() || code}）`));
      });
      child.stdin.end(JSON.stringify({ text, profile, output }));
    });
    return await readFile(output);
  } finally { await rm(output, { force: true }).catch(() => {}); }
}

let cloneQueue = Promise.resolve();
export function synthesizeWithClone(job) {
  const render = async () => {
    if (job.signal?.aborted) throw new DOMException("配音已停止", "AbortError");
    const directory = path.join(root, "node_modules", ".voice-tmp");
    await mkdir(directory, { recursive: true });
    const output = path.join(directory, `${randomUUID()}.wav`);
    const python = process.env.VOICE_CLONE_PYTHON || path.join(root, "node_modules", ".qwen-local", "Scripts", "python.exe");
    try {
      await new Promise((resolve, reject) => {
        const child = spawn(python, [path.join(root, "server", "synthesize-clone.py")], { cwd: root, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
        let stderr = "";
        let cancelled = false, timedOut = false;
        const terminate = () => {
          if (child.exitCode !== null) return;
          if (process.platform === "win32") spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => child.kill());
          else child.kill();
        };
        const onAbort = () => { cancelled = true; terminate(); };
        job.signal?.addEventListener("abort", onAbort, { once: true });
        const timer = setTimeout(() => { timedOut = true; terminate(); }, 210000);
        child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-2200); });
        child.on("error", error => { clearTimeout(timer); job.signal?.removeEventListener("abort", onAbort); reject(error); });
        child.stdin.on("error", () => {});
        child.on("close", code => {
          clearTimeout(timer); job.signal?.removeEventListener("abort", onAbort);
          if (cancelled) reject(new DOMException("配音已停止", "AbortError"));
          else if (timedOut) reject(new Error("角色配音生成超时，请重试"));
          else code === 0 ? resolve() : reject(new Error(stderr.trim() || "角色配音未能生成"));
        });
        if (job.signal?.aborted) onAbort();
        else child.stdin.end(JSON.stringify({ npc: job.npc, text: job.text, profile: job.profile, output }));
      });
      return await readFile(output);
    } finally { await rm(output, { force: true }).catch(() => {}); }
  };
  const current = cloneQueue.then(render, render);
  cloneQueue = current.catch(() => {});
  return current;
}

export async function loadVoiceService({ provider: requestedProvider } = {}) {
  const profiles = JSON.parse(await readFile(path.join(root, "story", "voices.json"), "utf8"));
  let settings = {};
  try { settings = JSON.parse(await readFile(path.join(root, "server", "voice-settings.json"), "utf8")); } catch {}
  const provider = (requestedProvider || process.env.VOICE_PROVIDER || settings.provider) === "qwen-clone" ? "qwen-clone" : "edge";
  if (provider === "qwen-clone") {
    const references = JSON.parse(await readFile(path.join(root, "story", "voice-references.json"), "utf8"));
    for (const [npc, ref] of Object.entries(references)) {
      const configure = async candidate => {
        const bytes = await readFile(path.join(root, candidate.file));
        const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
        return { ...profiles[npc], voice: `qwen-clone-v1:${digest}`, rate: "+0%", pitch: "+0Hz", referenceFile: candidate.file, referenceText: candidate.text, seed: ref.seed, provider, source: ref.source };
      };
      const selected = await configure(ref);
      selected.moods = {};
      for (const [mood, variant] of Object.entries(ref.moods || {})) selected.moods[mood] = await configure(variant);
      profiles[npc] = selected;
    }
  }
  return { provider, profiles, service: createVoiceService({ profiles, cacheDir: path.join(root, "node_modules", ".voice-cache"), synthesize: provider === "qwen-clone" ? synthesizeWithClone : synthesizeWithEdge }) };
}
