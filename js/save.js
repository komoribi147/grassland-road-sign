// 进度存档：浏览器本地存储，关掉网页也不会丢。
const KEY = "grassland-road-sign.save.v1";

export const Save = {
  read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  write(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
      return true;
    } catch {
      return false;
    }
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* 忽略 */ }
  },
};
