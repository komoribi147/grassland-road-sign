"""把即梦下载的原图处理成立绘：裁水印 → 抠背景 → 缩尺寸。
思路：背景是浅绿纯色，用"从四角泛洪填充"（魔法棒）只去掉连到边缘的背景，
不会误伤人物身上同色系的衣服（全局按颜色抠图最容易出这个问题）。
"""
import sys, os, glob
import numpy as np
from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")

KEY = (255, 0, 255)          # 用作"待删"的标记色，画面里不会出现
# PIL 的泛洪填充是把三通道差值相加来比容差的。
# 只从四个角撒种子会漏掉边缘颜色不一致的区域，所以下面沿着整条边每隔一段就撒一个种子。
THRESH = 110
BOTTOM_CROP = 0.07           # 裁掉底部 7%（即梦AI 品牌水印在右下角）
OUT_HEIGHT = 1400            # 立绘最终高度


def dilate(mask, times=1):
    """3x3 膨胀，纯 numpy 实现（没有 scipy 也能用）"""
    m = mask
    for _ in range(times):
        p = np.pad(m, 1, constant_values=False)
        m = (p[:-2, :-2] | p[:-2, 1:-1] | p[:-2, 2:] |
             p[1:-1, :-2] | p[1:-1, 1:-1] | p[1:-1, 2:] |
             p[2:, :-2] | p[2:, 1:-1] | p[2:, 2:])
    return m


def process(src, dst):
    im = Image.open(src).convert("RGB")
    w, h = im.size
    # 1) 裁掉底部的水印
    im = im.crop((0, 0, w, int(h * (1 - BOTTOM_CROP))))
    w, h = im.size

    # 2) 沿整条边撒种子泛洪填充背景（只从四角撒会漏掉一大片）
    step = 12
    seeds = [(x, 1) for x in range(1, w, step)] + [(x, h - 2) for x in range(1, w, step)] \
        + [(1, y) for y in range(1, h, step)] + [(w - 2, y) for y in range(1, h, step)]
    for xy in seeds:
        try:
            ImageDraw.floodfill(im, xy, KEY, thresh=THRESH)
        except Exception:
            pass

    # 3) 用 numpy 精细处理边缘：
    #    泛洪填过的算"确定背景"；它外圈再扩几像素，把颜色接近背景的（抗锯齿白边）也清掉，
    #    否则人物轮廓外会留一圈浅绿。
    arr = np.array(im).astype(np.int16)
    solid_bg = (np.abs(arr[:, :, 0] - KEY[0]) < 40) & \
               (np.abs(arr[:, :, 1] - KEY[1]) < 40) & \
               (np.abs(arr[:, :, 2] - KEY[2]) < 40)

    # 背景色：取图像四条边的中位数
    border = np.concatenate([arr[0:3].reshape(-1, 3), arr[-3:].reshape(-1, 3),
                             arr[:, 0:3].reshape(-1, 3), arr[:, -3:].reshape(-1, 3)])
    bg_color = np.median(border, axis=0)
    dist = np.sqrt(((arr - bg_color) ** 2).sum(axis=2))

    ring = dilate(solid_bg, 8) & ~solid_bg          # 轮廓外约 8 像素的一圈
    alpha = np.where(solid_bg, 0, 255).astype(np.uint8)
    alpha[ring & (dist < 175)] = 0                   # 清掉残留的浅绿（细长物件边缘最容易留）

    edge = dilate(solid_bg, 2) & ~solid_bg & ~(alpha == 0)
    soft = np.clip(dist * 1.8, 0, 255).astype(np.uint8)
    alpha[edge] = np.minimum(alpha[edge], soft[edge])  # 边缘羽化，不要硬边

    im = Image.fromarray(np.dstack([np.array(im), alpha]), "RGBA")

    # 4) 按人物实际范围裁剪，再缩到规定高度
    box = im.getbbox()
    if box:
        im = im.crop(box)
    ratio = OUT_HEIGHT / im.height
    im = im.resize((max(1, int(im.width * ratio)), OUT_HEIGHT), Image.LANCZOS)

    im.save(dst, "PNG", optimize=True)
    kb = os.path.getsize(dst) // 1024
    print("  → %s  %s  %d KB" % (os.path.basename(dst), im.size, kb))


if __name__ == "__main__":
    srcs = sys.argv[1:-1]
    dst = sys.argv[-1]
    for s in srcs:
        print("处理", os.path.basename(s)[:50])
        process(s, dst)
