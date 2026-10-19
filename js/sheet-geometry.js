// 六格分镜的取景几何。
//
// 为什么需要它：分镜图并不是严格的"均分 2 列 × 3 行"。实测 16 张图里，
// 格线偏离均分位置最多 38 px（sheet-01 的第二条横线在 646，均分是 682）。
// 按均分切，第一、二行的画面底部会带进一条格线加下一格的开头，第三行又会从画面内部切起。
//
// 格线有两种：暗线（sheet-01/02/03…）和白线（sheet-06/07/09/10/11），所以判据不看明暗——
// 只看"这条线是不是整条一个颜色"。衡量"整条一个颜色"用的是稳健极差（p92-p8），
// 不能用最大最小差：格线和垂直格线的交叉点只占极少数像素，却会把画面那条线的极差也拉大，
// 让暗边框看起来"不均匀"。
//
// 两种都找不到时（有的图两格直接拼在一起），退而找这条边界上最强的那道边。
// 全程量不到才退回均分。
//
// 这个文件是纯函数，不碰 DOM，`work/test-geom.mjs` 直接拿真实图的像素剖面来测。

/** 格线在理论位置 ± 这个比例内找 */
const GUTTER_SEARCH = 0.1;
/** 稳健极差小于"画面稳健极差中位数"的这个比例，才算一整条一个颜色 */
const UNIFORM_LIMIT = 0.35;
/** 退到"最强边"时至少要有这么明显的落差 */
const EDGE_MIN = 18;
/**
 * 以找到的那条核心线为中心、固定半宽切一刀。
 * 实测分隔带最宽 16 px（sheet-11 的竖缝），半宽 10 px 足够覆盖；
 * 不做"往两边撑"是因为画面本身很平滑的地方会被一路撑掉半张画。
 */
const HALF_RATIO = 0.01;
const HALF_MIN = 5;
const HALF_MAX = 12;

function halfFor(size) {
  return Math.min(HALF_MAX, Math.max(HALF_MIN, Math.round(size * HALF_RATIO)));
}

function medianOf(arr, lo, hi) {
  const slice = Array.prototype.slice.call(arr, lo, hi).sort((a, b) => a - b);
  return slice[slice.length >> 1];
}

function percentileOf(arr, lo, hi, p) {
  const slice = Array.prototype.slice.call(arr, lo, hi).sort((a, b) => a - b);
  return slice[Math.min(slice.length - 1, Math.floor(slice.length * p))];
}

/**
 * 在 expect 附近找一条格线，返回整条分隔带的 [起, 止)（原图/采样同单位）；找不到返回 null。
 * size 是该方向的原始像素数（用来决定安全边距）。
 */
export function findGutter(mean, spread, expect, span, size) {
  const n = mean.length;
  const lo = Math.max(0, Math.round(expect - span));
  const hi = Math.min(n, Math.round(expect + span) + 1);
  if (hi - lo < 8) return null;
  const half = halfFor(size || n);

  // 1) 整条一个颜色的线（暗线、白线都在内），且离画面亮度越远越像格线
  const contentSpread = medianOf(spread, lo, hi) + 1e-6;
  const contentMean = medianOf(mean, lo, hi);
  const levelSpread = percentileOf(mean, lo, hi, 0.9) - percentileOf(mean, lo, hi, 0.1) + 1e-6;
  let mid = -1;
  let best = Infinity;
  for (let i = lo; i < hi; i++) {
    const uniform = spread[i] / contentSpread;
    const extreme = Math.min(Math.abs(mean[i] - contentMean) / levelSpread, 1);
    const score = uniform + 0.6 * (1 - extreme);
    if (score < best) {
      best = score;
      mid = i;
    }
  }

  if (mid >= 0 && spread[mid] / contentSpread <= UNIFORM_LIMIT) {
    return [Math.max(0, mid - half), Math.min(n, mid + half + 1)];
  }

  // 2) 这张图这处没有格线：找最强的那道边
  let edge = -1;
  let bestDrop = EDGE_MIN;
  for (let i = lo + 2; i < hi - 2; i++) {
    const d = Math.abs(mean[i + 2] - mean[i - 2]);
    if (d > bestDrop) {
      bestDrop = d;
      edge = i;
    }
  }
  if (edge >= 0) return [Math.max(0, edge - half), Math.min(n, edge + half + 1)];
  return null;
}

/**
 * 由像素剖面求出格线位置，按比例（0～1）返回。
 * mean/spread 是每条线（每行或每列）的平均亮度与稳健极差，长度就是该方向的采样数。
 * width/height 是原图像素尺寸（决定安全边距）。
 */
export function guttersFromProfiles(rowMean, rowSpread, colMean, colSpread, width, height) {
  const H = rowMean.length;
  const W = colMean.length;
  const asFraction = (band, size) => (band ? [band[0] / size, band[1] / size] : null);
  return {
    rows: [
      asFraction(findGutter(rowMean, rowSpread, H / 3, H * GUTTER_SEARCH, height), H),
      asFraction(findGutter(rowMean, rowSpread, (2 * H) / 3, H * GUTTER_SEARCH, height), H),
    ],
    cols: [asFraction(findGutter(colMean, colSpread, W / 2, W * GUTTER_SEARCH, width), W)],
  };
}

/**
 * 由格线推出每格的取景框（原图像素）。
 * gutters 为 null 或某条格线没量到时，那一处退回均分。
 * 返回 { rows: [[上, 下], [上, 下], [上, 下]], cols: [[左, 右], [左, 右]] }
 */
export function panelBoxes(gutters, width, height) {
  const trim = Math.max(2, Math.round(Math.min(width, height) * 0.004));
  return {
    rows: axisSpans(height, 3, trim, gutters && gutters.rows, height * 0.008),
    cols: axisSpans(width, 2, trim, gutters && gutters.cols, width * 0.008),
  };
}

/** 把一条边分 3 段（行）或 2 段（列）：分隔处优先用格线，没有就均分 */
function axisSpans(size, count, trim, bands, slack) {
  const cuts = [];
  for (let i = 1; i < count; i++) {
    const at = (i * size) / count;
    const band = bands && bands[i - 1];
    const above = band ? Math.floor(band[0] * size) : Math.round(at - slack);
    const below = band ? Math.ceil(band[1] * size) : Math.round(at + slack);
    cuts.push({ above, below });
  }
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push([
      i === 0 ? trim : cuts[i - 1].below,
      i === count - 1 ? size - trim : cuts[i].above,
    ]);
  }
  return out;
}

/** 取画面取景框（原图像素）。独立镜头可指定归一化 crop 做细节切镜。 */
export function frameOf(visual, boxes, width, height) {
  if (visual?.src) {
    const c = visual.crop;
    if (c && [c.x, c.y, c.w, c.h].every(Number.isFinite) && c.x >= 0 && c.y >= 0
        && c.w > 0 && c.h > 0 && c.x + c.w <= 1 && c.y + c.h <= 1) {
      return { x: Math.round(c.x * width), y: Math.round(c.y * height),
        w: Math.round(c.w * width), h: Math.round(c.h * height) };
    }
    return { x: 0, y: 0, w: width, h: height };
  }
  if (!visual || !boxes) return { x: 0, y: 0, w: width, h: height };
  const panel = Number(visual.panel) || 0;
  const row = boxes.rows[Math.floor(panel / 2)] || [0, height];
  const col = boxes.cols[panel % 2] || [0, width];
  return { x: col[0], y: row[0], w: col[1] - col[0], h: row[1] - row[0] };
}
