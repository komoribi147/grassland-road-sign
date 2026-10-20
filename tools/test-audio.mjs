import assert from "node:assert/strict";
import { AudioManager } from "../js/audio.js";

const clips = [];
globalThis.Audio = class {
  constructor(src) {
    this.src = src;
    this.volume = 1;
    this.paused = true;
    this.listeners = new Map();
    clips.push(this);
  }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  play() {
    this.paused = false;
    this.listeners.get("playing")?.();
    return Promise.resolve();
  }
  pause() { this.paused = true; }
};

const audio = new AudioManager();
audio.once("heartbeat", 0.3);
assert.equal(clips.at(-1).volume, 0.3, "剧本音量应决定一次性音效的实际音量");

const rain = audio.loop("rain");
assert.ok(rain.volume < 0.1, "环境音初次播放应从低音量平缓进入");
await new Promise((resolve) => setTimeout(resolve, 850));
assert.ok(rain.volume > 0.65, "环境音淡入后应达到原定音量");

audio.setEnabled(false);
assert.equal(rain.volume, 0, "关闭声音时环境音应静音");
audio.setEnabled(true);
assert.ok(rain.volume < 0.1, "重新开启声音时环境音也应平缓进入");
await new Promise((resolve) => setTimeout(resolve, 850));
assert.ok(rain.volume > 0.65, "重新开启后应恢复到原定音量");

console.log("音量与环境音淡入通过");
