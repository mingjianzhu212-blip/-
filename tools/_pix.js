'use strict';
/* 最小 PNG 解码 + 像素对比：客观测量云雾层的可见度（不依赖任何三方库）
   用法：node _pix.js <a.png> <b.png>
   输出：平均色差 / 95 分位色差 / 最大色差 / 有差异像素占比 */
const fs = require('node:fs');
const zlib = require('node:zlib');

function decode(file) {
  const buf = fs.readFileSync(file);
  let p = 8, w = 0, h = 0, bd = 0, ct = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.slice(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bd = data[8]; ct = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 2 && ct !== 6)) throw new Error('unsupported png: bd=' + bd + ' ct=' + ct);
  const bpp = ct === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * bpp);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++];
    const line = raw.slice(pos, pos + w * bpp); pos += w * bpp;
    for (let x = 0; x < w * bpp; x++) {
      const a = x >= bpp ? out[y * w * bpp + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * w * bpp + x] : 0;
      const c = (x >= bpp && y > 0) ? out[(y - 1) * w * bpp + x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      out[y * w * bpp + x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}

function cmp(fileA, fileB) {
  const A = decode(fileA), B = decode(fileB);
  if (A.w !== B.w || A.h !== B.h) throw new Error('size mismatch');
  const n = A.w * A.h;
  const diffs = [];
  let sum = 0, changed = 0;
  for (let i = 0; i < n; i++) {
    const ia = i * A.bpp, ib = i * B.bpp;
    const d = (Math.abs(A.data[ia] - B.data[ib]) + Math.abs(A.data[ia + 1] - B.data[ib + 1]) + Math.abs(A.data[ia + 2] - B.data[ib + 2])) / 3;
    sum += d; diffs.push(d); if (d >= 2) changed++;
  }
  diffs.sort((x, y) => x - y);
  const q = k => diffs[Math.min(diffs.length - 1, Math.floor(diffs.length * k))];
  console.log(fileA.split(/[\\/]/).pop() + ' vs ' + fileB.split(/[\\/]/).pop());
  console.log('  平均色差 ' + (sum / n).toFixed(2) +
    ' | 中位 ' + q(0.5).toFixed(1) +
    ' | 95分位 ' + q(0.95).toFixed(1) +
    ' | 峰值 ' + diffs[diffs.length - 1].toFixed(1) +
    ' | 有变化像素 ' + (changed / n * 100).toFixed(1) + '%');
}

cmp(process.argv[2], process.argv[3]);
