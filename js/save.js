// 进度存档：浏览器本地存储，关掉网页也不会丢。
const KEY = "grassland-road-sign.save.v1";
const VERSION = 2;   // 存档结构变了就把这个数字加一，旧存档自动作废，避免读坏

export const Save = {
  read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return (data?.v ?? 0) === VERSION ? data : null;
    } catch {
      return null;
    }
  },
  write(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...state, v: VERSION, savedAt: Date.now() }));
      return true;
    } catch {
      return false;
    }
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* 忽略 */ }
  },
};
