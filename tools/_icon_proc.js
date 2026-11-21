'use strict';
/* 图标后处理：白底转透明 + 去水印 + 缩到渲染尺寸
   用法：node _icon_proc.js <src.png> <dst.png> [size=384] */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const PY = 'C:/Users/35695/.workbuddy/binaries/python/envs/default/Scripts/python.exe';
const src = process.argv[2], dst = process.argv[3], size = process.argv[4] || '384';
const script = `
from PIL import Image, ImageDraw
import sys
im = Image.open(sys.argv[1]).convert('RGB')
lum = im.convert('L')
# 亮度转 alpha：<=200 实形，200~250 线性半透（浅灰墨染），>250 全透
alpha = lum.point(lambda v: 255 if v <= 200 else max(0, min(255, int((250 - v) * 7))))
alpha = alpha.point(lambda v: 0 if v < 28 else v)   # 去噪点
im = im.convert('RGBA'); im.putalpha(alpha)
# 右下角水印区清空（剪影居中，角落本空）
d = ImageDraw.Draw(im); w, h = im.size
d.rectangle([int(w * 0.80), int(h * 0.91), w, h], fill=(0, 0, 0, 0))
im = im.resize((${size}, ${size}), Image.LANCZOS)
im.save(sys.argv[2], optimize=True)
`;
const tmp = path.join(require('./page').SCRATCH, '._proc_' + process.pid + '.py');
fs.writeFileSync(tmp, script, 'utf8');
try { execFileSync(PY, [tmp, src, dst], { stdio: ['ignore', 'ignore', 'pipe'] }); }
finally { fs.rmSync(tmp, { force: true }); }
console.log('proc', path.basename(dst), fs.statSync(dst).size >> 10, 'KB');
