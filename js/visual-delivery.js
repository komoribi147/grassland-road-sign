import { IMAGE_ASSETS } from "./image-assets.js?v=20261023-hair2";

// Canonical PNG paths remain in the story/save. Only the delivered file varies.
export function imageSource(src, { width = 1440, dpr = 1 } = {}, assets = IMAGE_ASSETS) {
  const image = assets[src];
  if (!image) return src; // Includes embedded data URIs in the single-file edition.
  return width * Math.min(dpr || 1, 2) <= 960 ? image.small : image.full;
}

export function visualLayout(frame, width, height, { portrait = false, top = 0, bottom = height } = {}) {
  if (portrait) {
    const available = Math.max(1, bottom - top);
    const scale = Math.min(width / frame.w, available / frame.h);
    const w = frame.w * scale, h = frame.h * scale;
    return { source: { ...frame }, destination: { x: (width - w) / 2, y: top + (available - h) / 2, w, h } };
  }
  const scale = Math.max(width / frame.w, height / frame.h);
  const w = Math.min(frame.w, width / scale), h = Math.min(frame.h, height / scale);
  return {
    source: { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) / 2, w, h },
    destination: { x: 0, y: 0, w: width, h: height },
  };
}
