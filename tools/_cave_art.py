"""第 86 轮 · 洞府界面素材预处理（可复现）

输入：ImageGen 出来的原图目录（文件名前缀见 RAW）
输出：
  ui/cave/paper.png   卡片宣纸底纹（居中裁方，去四角水印）
  ui/cave/soil.png    灵田田块底（裁掉纸边，只留翻耕土）
  ui/cave/scene.png   洞府小景横卷（裁掉底部与右缘水印带）
  ui/icons/cave_tag_*.png  分区题签（擦水印 → 裁主体 → 亮度转 alpha → 256）

为什么题签不直接缩放：生成图右下角有「Qoder AI生成」浅灰小字，直接亮度转 alpha
会变成一枚淡墨脏块。判据用「孤立浅灰笔画」——底 20% 带内 lum<246 且半径 6 邻域内
没有任何 lum<200 的实墨的像素，判为字，刷白；这样墨影（紧贴实墨）能留下。

用法：python tools/_cave_art.py <原图目录> <项目根>
"""
import sys, os
from PIL import Image, ImageDraw, ImageStat

RAW = {
    "paper": "cave_paper", "soil": "cave_soil", "scene": "cave_scene",
    "field": "tag_field", "mine": "tag_mine", "alchemy": "tag_alchemy", "forge": "tag_forge",
}
PAPER_TARGET_LUM = 240.0   # 面板纸底 #f7f3e9 的亮度，底纹整体对齐它，避免卡片比页面深


def load(raw, key):
    pref = RAW[key]
    f = [x for x in os.listdir(raw) if x.startswith(pref)]
    if not f:
        raise SystemExit("原图缺失：" + pref + "（在 " + raw + "）")
    return Image.open(os.path.join(raw, sorted(f)[-1])).convert("RGB")


def wipe_text(im, report=None):
    """擦掉生成图的水印「Qoder AI生成」。

    第一版按「底 20% 带内孤立浅灰笔画」判，实测不成立：四张题签的墨影本来就压到
    y≈98%（量过：mine 98.7% / alchemy 95.9% / forge 97.4%），字和影在同一行带里，
    按位置或按亮度都切不开，alchemy 擦完仍在丹炉下方留一小片灰脏。
    改成连通域过滤：字是许多孤立小团（每道笔画几十到几百像素），主体+墨影是一个
    大团，面积不到最大团 1% 的一律刷白。"""
    from collections import deque
    g = im.convert("L"); w, h = g.size
    # 一次 tobytes 拿全图像素（PIL 的 px[x,y] 逐点取在 100 万像素上要几十秒）
    buf = g.tobytes()
    mask = [1 if b < 246 else 0 for b in buf]
    seen = bytearray(w * h)
    comps = []
    for i in range(w * h):
        if not mask[i] or seen[i]:
            continue
        q = deque([i]); seen[i] = 1
        cells = []
        while q:
            p = q.popleft(); cells.append(p)
            px, py = p % w, p // w
            for dy in (-1, 0, 1):
                yy = py + dy
                if yy < 0 or yy >= h:
                    continue
                for dx in (-1, 0, 1):
                    if dx == 0 and dy == 0:
                        continue
                    xx = px + dx
                    if 0 <= xx < w:
                        j = yy * w + xx
                        if mask[j] and not seen[j]:
                            seen[j] = 1; q.append(j)
        comps.append(cells)
    if not comps:
        return im, 0
    biggest = max(len(c) for c in comps)
    keep = int(biggest * 0.01)
    px = im.load(); n = 0; dropped = 0
    for c in comps:
        if len(c) >= keep:
            continue
        dropped += 1
        for p in c:
            px[p % w, p // w] = (255, 255, 255); n += 1
    if report is not None:
        report[:] = [(len(c), min(x % w for x in c), max(x % w for x in c), min(x // w for x in c), max(x // w for x in c))
                     for c in sorted(comps, key=len, reverse=True)[:6]]
    return im, n


def crop_square(im, frac):
    w, h = im.size; s = int(min(w, h) * frac)
    x0, y0 = (w - s) // 2, (h - s) // 2
    return im.crop((x0, y0, x0 + s, y0 + s))


def match_lum(im, target):
    d = target - ImageStat.Stat(im.convert("L")).mean[0]
    return im.point(lambda v: max(0, min(255, int(v + d))))


def flatten(im, k):
    """把亮度对目标值的偏差整体压到 k 倍：原图左下角有一坨挺重的褐晕，
    直接当卡片底铺就是一块脏印子；压到四成就只剩纸面气韵，纤维颗粒还在。"""
    return im.point(lambda v: max(0, min(255, int(PAPER_TARGET_LUM + (v - PAPER_TARGET_LUM) * k))))


def to_alpha(im):
    """与 tools/_icon_proc.js 同一档：<=200 实形，200~250 线性半透，>250 全透，<28 去噪。"""
    lum = im.convert("L")
    a = lum.point(lambda v: 255 if v <= 200 else max(0, min(255, int((250 - v) * 7))))
    a = a.point(lambda v: 0 if v < 28 else v)
    out = im.convert("RGBA"); out.putalpha(a)
    return out


def bbox(im, pad):
    g = im.convert("L"); w, h = g.size
    pts = [(x, y) for y in range(h) for x in range(w) if g.load()[x, y] < 245]
    if not pts:
        raise SystemExit("题签裁不出主体（全白？）")
    x0, x1 = min(p[0] for p in pts), max(p[0] for p in pts)
    y0, y1 = min(p[1] for p in pts), max(p[1] for p in pts)
    bw, bh = x1 - x0, y1 - y0
    m = int(max(bw, bh) * pad)
    return im.crop((max(0, x0 - m), max(0, y0 - m), min(w, x1 + m), min(h, y1 + m)))


def main(raw, root):
    out_cave = os.path.join(root, "ui", "cave")
    out_icon = os.path.join(root, "ui", "icons")
    os.makedirs(out_cave, exist_ok=True)
    # 三张底图不带 alpha，走 JPG：PNG-24 存这种连续色阶的纸纹/水墨要 300KB~1.3MB，
    # 同画面 JPG q82 只要几十 KB（项目本来就用 cave-bg.jpg / scene-bg.jpg 打底）。
    def save_jpg(im, name, q=82):
        im.convert("RGB").save(os.path.join(out_cave, name), quality=q, optimize=True, progressive=True)

    # ① 宣纸底纹：居中裁方（四角水印随之去掉）→ 512 → 亮度对齐面板纸色
    paper = flatten(match_lum(crop_square(load(raw, "paper"), 0.80), PAPER_TARGET_LUM), 0.40).resize((512, 512), Image.LANCZOS)
    save_jpg(paper, "paper.jpg")

    # ② 田块土：生成图四周有纸边留白，上下左右各裁一成，只留翻耕土
    soil = load(raw, "soil")
    w, h = soil.size
    soil = soil.crop((int(w * .10), int(h * .10), int(w * .90), int(h * .92))).resize((320, 320), Image.LANCZOS)
    # 原图均亮 59 —— 直接铺就是一排炭块，和整页淡米宣纸打架（实拍验过）。
    # 压一半对比度再整体提到均亮 ~150：垄沟仍是深褐，垄面转成暖土黄。
    # 第二版再加褐调：只提 R 压 B 各一成，实拍仍是水泥地/钢板的青灰，
    # 得把蓝压到 .78、绿微降，土才真发黄。
    SOIL_K, SOIL_C = 0.55, 120
    soil = soil.point(lambda v: max(0, min(255, int(v * SOIL_K + SOIL_C))))
    r, g, b = soil.split()
    soil = Image.merge("RGB", (r.point(lambda v: min(255, int(v * 1.12))),
                               g.point(lambda v: int(v * 0.97)),
                               b.point(lambda v: int(v * 0.76))))
    save_jpg(soil, "soil.jpg")

    # ③ 洞府小景：底部 8% 与右缘 3% 是水印带，裁掉；卡片里最多铺到 ~900px 宽，出 900 就够
    scene = load(raw, "scene")
    w, h = scene.size
    scene = scene.crop((0, 0, int(w * .97), int(h * .92)))
    scene = scene.resize((900, int(900 * scene.height / scene.width)), Image.LANCZOS)
    save_jpg(scene, "scene.jpg")

    # ④ 题签：擦字 → 裁主体 → 正方 → 256 → 亮度转 alpha
    for key in ("field", "mine", "alchemy", "forge"):
        im = load(raw, key)
        im, wiped = wipe_text(im)
        im = bbox(im, 0.06)
        s = max(im.size)
        canvas = Image.new("RGB", (s, s), (255, 255, 255))
        canvas.paste(im, ((s - im.width) // 2, (s - im.height) // 2))
        alpha = to_alpha(canvas.resize((256, 256), Image.LANCZOS))
        alpha.save(os.path.join(out_icon, "cave_tag_" + key + ".png"), optimize=True)
        a = alpha.split()[3]
        print("tag_%-8s 擦字 %5d px  裁后 %3dx%-3d  实形 %4.1f%%  -> ui/icons/cave_tag_%s.png"
              % (key, wiped, im.width, im.height, 100 * sum(1 for v in a.getdata() if v >= 200) / (256 * 256), key))

    for name, note in [("paper.jpg", "纸底"), ("soil.jpg", "田土"), ("scene.jpg", "小景")]:
        p = os.path.join(out_cave, name)
        im = Image.open(p)
        print("%-6s %-3dx%-3d 均亮 %5.1f  %dKB" % (note, im.width, im.height,
              ImageStat.Stat(im.convert("L")).mean[0], os.path.getsize(p) >> 10))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
