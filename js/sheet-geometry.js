// 六格分镜的取景几何。
//
// 为什么需要它：分镜图并不是严格的"均分 2 列 × 3 行"——实测 16 张图里，
// 格线偏离均分位置最多 38 px（sheet-01 的第二条横线在 646，均分是 682）。
// 按均分切，第一、二行的画面底部会带进一条格线加下一格的开头（就是"下面多出来一个大框"），
// 第三行又会从画面内部开始切，把头尾切掉。
//
// 所以这里直接从像素里把格线量出来：格线是"又暗又匀"的一整条，
// 画面内容不会整行都这么匀，用这一点就能把它和画面区分开。
// 量不到（图打不开、canvas 读不了）才退回均分。
//
// 这个文件是纯函数，不碰 DOM，`work/test-geom.mjs` 直接拿真实图的像素剖面来测。

/** 分隔带在整条线上的搜索范围：理论位置 ± 这个比例 */
const GUTTER_SEARCH = 0.1;

/**
 * 在 expect 附近找一条格线，返回整条暗带的 [起, 止]（含端点）；找不到返回 null。
 * 判据 = 亮度低 + 横向极差小：一整条格线的每个像素都差不多暗。
 */
export function findGutter(mean, flat, expect, span) {
  const lo = Math.max(0, Math.round(expect - span));
  const hi = Math.min(mean.length, Math.round(expect + span) + 1);
  if (hi - lo < 8) return null;

  let sumMean = 0;
  let sumFlat = 0;
  for (let i = lo; i < hi; i++) {
    sumMean += mean[i];
    sumFlat += flat[i];
  }
  const n = hi - lo;
  const baseMean = sumMean / n;
  const baseFlat = sumFlat / n;

  let mid = lo;
  let best = Infinity;
  for (let i = lo; i < hi; i++) {
    const score = mean[i] / (baseMean + 1e-6) + 0.35 * (flat[i] / (baseFlat + 1e-6));
    if (score < best) {
      best = score;
      mid = i;
    }
  }

  // 从最暗那条往外撑：亮度还没回到"正常画面"水平的，都算格线
  const content = bandMedian(mean, lo, hi);
  const threshold = mean[mid] + 0.35 * (content - mean[mid]);
  let a = mid;
  let b = mid;
  while (a - 1 >= lo && mean[a - 1] <= threshold) a--;
  while (b + 1 < hi && mean[b + 1] <= threshold) b++;
  return [a, b];
}

function bandMedian(arr, lo, hi) {
  const slice = Array.prototype.slice.call(arr, lo, hi).sort((x, y) => x - y);
  return slice[slice.length >> 1];
}

/**
 * 由像素剖面求出格线位置，按比例（0～1）返回。
 * mean/flat 是每条线（每行或每列）的平均亮度与极差，长度就是该方向的像素数。
 */
export function guttersFromProfiles(rowMean, rowFlat, colMean, colFlat) {
  const H = rowMean.length;
  const W = colMean.length;
  const asFraction = (band, size) => (band ? [band[0] / size, (band[1] + 1) / size] : null);
  return {
    rows: [
      asFraction(findGutter(rowMean, rowFlat, H / 3, H * GUTTER_SEARCH), H),
      asFraction(findGutter(rowMean, rowFlat, (2 * H) / 3, H * GUTTER_SEARCH), H),
    ],
    cols: [asFraction(findGutter(colMean, colFlat, W / 2, W * GUTTER_SEARCH), W)],
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

/** 把一条边分 3 段（行）或 2 段（列）：分隔处优先用格线暗带，没有就均分 */
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

/** 取某一格的取景框（原图像素）。visual.src 是独立整图，不分格。 */
export function frameOf(visual, boxes, width, height) {
  if (!visual || visual.src || !boxes) return { x: 0, y: 0, w: width, h: height };
  const panel = Number(visual.panel) || 0;
  const row = boxes.rows[Math.floor(panel / 2)] || [0, height];
  const col = boxes.cols[panel % 2] || [0, width];
  return { x: col[0], y: row[0], w: col[1] - col[0], h: row[1] - row[0] };
}
