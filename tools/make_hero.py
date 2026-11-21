"""把白底立绘转成透明背景 PNG（v5：距离场渐隐法）
核心洞察：水墨白底立绘里，"该透明"的是**离墨迹很远的大片留白**，
而"该保留"的白（白衣、云纹）都被墨线/青带包围，离墨迹很近。
于是：
  1) 墨迹掩膜 = 非近白像素（黑发/青饰带/墨云/皮肤）
  2) 从所有墨迹像素做多源 BFS，算出每个像素到最近墨迹的距离（距离场）
  3) alpha = f(distance)：近墨迹处不透明，越远越透明，到 D1 之后全透明
     f 用平滑曲线，避免硬边
  4) 上采样回原尺寸 + 轻微羽化
好处：白衣完整、留白干净，没有方块残留。
"""
from PIL import Image, ImageFilter
import os
from collections import deque

OUT_DIR = r'C:\Users\35695\WorkBuddy\2026-10-17-23-36-20\xiuxian\ui\avatar'
SRC = {
    'hero_male.png':   r'C:\Users\35695\.workbuddy\clipboard-images\clipboard-2026-10-18T09-27-48-564Z-7061bd57.jpg',
    'hero_female.png': r'C:\Users\35695\.workbuddy\clipboard-images\clipboard-2026-10-18T09-27-48-569Z-f250b138.jpg',
}
INK_HI   = 216# 三通道最小值 <此值 → 墨迹/彩色（角色锚点）
DS       = 4    # 距离场计算的下采样倍数（1920→480，够用且快）
D_KEEP   = 13   # 距离 ≤D_KEEP（×原图px）全不透明：墨迹本身 + 紧邻的衣料边缘
D_CLEAR  = 46   # 距离 ≥D_CLEAR 全透明：远处的纯留白
FEATHER  = 2.5  # 最后对 alpha 做高斯羽化
TARGET_W = 1080


def distance_field(ink, w, h):
    """多源 BFS：返回每像素到最近墨迹的曼哈顿距离（近似欧氏，够用）"""
    INF = 0x3FFFFFFF
    dist = [INF] * (w * h)
    q = deque()
    for i in range(w * h):
        if ink[i]:
            dist[i] = 0
            q.append(i)
    d = 0
    while q:
        d += 1
        for _ in range(len(q)):
            i = q.popleft()
            x, y = i % w, i // w
            if x > 0:
                j = i - 1
                if dist[j] > d:
                    dist[j] = d; q.append(j)
            if x < w - 1:
                j = i + 1
                if dist[j] > d:
                    dist[j] = d; q.append(j)
            if y > 0:
                j = i - w
                if dist[j] > d:
                    dist[j] = d; q.append(j)
            if y < h - 1:
                j = i + w
                if dist[j] > d:
                    dist[j] = d; q.append(j)
    return dist


def smoothstep(e0, e1, x):
    if e1 <= e0:
        return 0.0 if x >= e1 else 1.0
    t = (x - e0) / (e1 - e0)
    t = 0.0 if t < 0 else (1.0 if t > 1 else t)
    return t * t * (3 - 2 * t)          # smoothstep，端点导数为 0


def cutout(src_path, out_path):
    im = Image.open(src_path).convert('RGB')
    W, H = im.size
    small = im.resize((W // DS, H // DS), Image.BILINEAR)
    w, h = small.size
    sp = small.load()

    ink = bytearray(w * h)
    for y in range(h):
        base = y * w
        for x in range(w):
            r, g, b = sp[x, y]
            ink[base + x] = 1 if min(r, g, b) < INK_HI else 0

    dist = distance_field(ink, w, h)

    # alpha（小图）
    a_small = bytearray(w * h)
    dk, dc = D_KEEP / DS, D_CLEAR / DS
    for i in range(w * h):
        a_small[i] = int(255 * (1 - smoothstep(dk, dc, dist[i])))
    a_img = Image.frombytes('L', (w, h), bytes(a_small))
    a_img = a_img.resize((W, H), Image.BILINEAR)
    a_img = a_img.filter(ImageFilter.GaussianBlur(FEATHER))

    out = im.convert('RGBA')
    out.putalpha(a_img)
    bbox = out.getbbox()
    if bbox:
        out = out.crop(bbox)
    if out.width > TARGET_W:
        nh = int(out.height * TARGET_W / out.width)
        out = out.resize((TARGET_W, nh), Image.LANCZOS)
    out.save(out_path, 'PNG', optimize=True)
    return out.size, os.path.getsize(out_path)


for name, src in SRC.items():
    dst = os.path.join(OUT_DIR, name)
    size, nbytes = cutout(src, dst)
    print(f'{name}: {size[0]}x{size[1]}  {nbytes/1024:.0f} KB')