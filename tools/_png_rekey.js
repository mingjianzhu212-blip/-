'use strict';
/* 素材重抠（第 85 轮 · 方案①）：把 13 张妖兽图上那层铺满整张的半透明「纸底雾」压淡。
   为什么纯 Node：本仓库已有 PNG 解码（tools/_pix.js、shot/_png_alpha.js），补一个编码器
   就能自带「写完立刻回读校验」，不依赖任何三方库，也不依赖那个只在 tools/_icon_proc.js 里用过的 Python。

   为什么不能「把纸底抠成 0」：这 13 张的纸底和画本身的中间调在 alpha、亮度两个维度上整个重叠，
   逐像素分不开（--lum 就是用来证这一点的）。三条路都实测过：
     减常量底（四角中位）——纸底从四角 33 一路渐变到中部 183，固定值一边抠不净一边啃穿；
     按亮度键（LO150/HI212）——外圈没降多少，alpha>=200 的实形从 43% 掉到 26%，画被啃穿；
     min 滤波抠局部底——纸有纹理，局部最小值远低于局部值，crow 外圈 128 只降到 82，同样掉实形。
   所以改成「只压雾、不动墨」：alpha>=SOFT 的实形墨一个字节不碰（每张写完回读核对占比），
   雾走拐点压淡 + 外圈 smoothstep 两步。干净素材外圈平均 alpha≈0，天然被
   「外圈<12 跳过」挡住，不需要维护「哪 13 张坏了」的名单。

   用法：
     node tools/_png_rekey.js                      # 只量，不改（默认 ui/icons 的 beast_*.png）
     node tools/_png_rekey.js --all                # 量 ui/icons 全部 png
     node tools/_png_rekey.js --lum                # 看 alpha 随亮度的分布（判定「能不能按亮度抠」）
     node tools/_png_rekey.js --apply [--dir=..] [--re=..] [--k=0.12] [--soft=200] [--ramp=40] [--margin=48] [--force]
   安全边界：外圈 12px 平均 <12 判干净跳过；>200 判「满铺形象不是纸底」，非 --force 拒改；
   每张写完立刻回读，RGB 任一字节变了、实形墨（alpha>=240，变换可证地不碰这一档）占比下降、
   或外圈没降到一半以下，都报错退出。 */
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const ROOT = path.join(__dirname, '..');

/* ---------- PNG 读 ---------- */
function readChunks(buf) {
  if (buf.toString('ascii', 1, 4) !== 'PNG' || buf[4] !== 0x0d || buf[5] !== 0x0a || buf[6] !== 0x1a || buf[7] !== 0x0a) throw new Error('not png');
  let p = 8; const chunks = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8);
    chunks.push({ type, data: buf.slice(p + 8, p + 8 + len) });
    p += 12 + len;
    if (type === 'IEND') break;
  }
  return chunks;
}
function rgbaOf(chunks) {
  const ihdr = chunks.find(c => c.type === 'IHDR').data;
  const w = ihdr.readUInt32BE(0), h = ihdr.readUInt32BE(4);
  if (ihdr[8] !== 8 || ihdr[9] !== 6 || ihdr[12] !== 0) throw new Error('only 8bit RGBA non-interlaced');
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => c.data)));
  const stride = w * 4, out = Buffer.alloc(h * stride);
  const at = (y, x) => (y - 1) * stride + x, cur = (y, x) => y * stride + x;
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[cur(y, x - 4)] : 0;
      const b = y > 0 ? out[at(y, x)] : 0;
      const c = (x >= 4 && y > 0) ? out[at(y, x - 4)] : 0;
      let v = raw[y * (stride + 1) + 1 + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      out[cur(y, x)] = v & 255;
    }
  }
  return { w, h, px: out };
}

/* ---------- PNG 写 ---------- */
const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii'), body = Buffer.concat([t, data]);
  const head = Buffer.alloc(4); head.writeUInt32BE(data.length, 0);
  const tail = Buffer.alloc(4); tail.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([head, body, tail]);
}
function writePng({ w, h, px }, keepChunks, extra) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const keep = keepChunks.filter(c => c.type !== 'IHDR' && c.type !== 'IDAT' && c.type !== 'IEND' &&
    !(c.type === 'tEXt' && c.data.slice(0, 6).toString('latin1') === 'rekey\0'));
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr)];
  keep.forEach(c => parts.push(chunk(c.type, c.data)));
  (extra || []).forEach(c => parts.push(chunk(c.type, c.data)));
  parts.push(chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/* ---------- 度量 ---------- */
function med(v) { const s = Float64Array.from(v).sort(); const n = s.length; return n ? (n % 2 ? s[(n - 1) >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; }
function lumOf(p, i) { const j = i * 4; return 0.2126 * p[j] + 0.7152 * p[j + 1] + 0.0722 * p[j + 2]; }
function stats({ w, h, px }, wantBand) {
  const A = x => px[x * 4 + 3];
  let n = w * h, z = 0, low = 0, mid = 0, hi = 0, solid = 0;
  for (let i = 0; i < n; i++) { const a = A(i); if (a === 0) z++; else if (a < 64) low++; else if (a < 200) mid++; else hi++; if (a >= 240) solid++; }
  const cs = Math.min(32, w >> 2, h >> 2), corner = [], clum = [];
  for (const [x0, y0] of [[0, 0], [w - cs, 0], [0, h - cs], [w - cs, h - cs]])
    for (let y = y0; y < y0 + cs; y++) for (let x = x0; x < x0 + cs; x++) { const i = y * w + x; corner.push(A(i)); clum.push(lumOf(px, i)); }
  /* edge12 = 外圈 12px 平均 alpha，和第 84 轮记录缺陷时用的口径保持一致（当时是 59~163） */
  let eSum = 0, eN = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++)
    if (x < 12 || y < 12 || x >= w - 12 || y >= h - 12) { eSum += A(y * w + x); eN++; }
  /* 假设检验：这些素材的 alpha 是不是仍严格跟着亮度走（_icon_proc.js 的产物就是 a=f(lum)）。
     若是，纸底就能按「离纸面亮度多远」抠掉，而不是减一个常量底。只有 --lum 要跑，代价 6×像素数。 */
  const bins = [[250, 256], [225, 250], [200, 225], [175, 200], [150, 175], [0, 150]];
  const band = wantBand ? bins.map(([lo, up]) => {
    const v = []; for (let i = 0; i < n; i++) { const L = lumOf(px, i); if (L >= lo && L < up) v.push(A(i)); }
    return v.length ? `${Math.round(med(v))}@${(100 * v.length / n).toFixed(0)}%` : '-';
  }) : null;
  return { w, h, z: 100 * z / n, low: 100 * low / n, mid: 100 * mid / n, hi: 100 * hi / n,
    solid: 100 * solid / n, R: med(corner), paperLum: med(clum), edge12: eSum / eN, band };
}

/* ---------- 命令行 ---------- */
/* 解码器和度量要能被 verify.js 直接 require：素材回归断言和这个工具必须用同一把尺子量，
   各写一份 PNG 解码的话，改了其中一份口径，测试就变成永远为真的空检查。 */
if (require.main !== module) { module.exports = { readChunks, rgbaOf, writePng, stats, med, lumOf }; return; }

const argv = process.argv.slice(2);
const flag = k => argv.includes('--' + k);
const opt = (k, d) => { const m = argv.find(s => s.startsWith('--' + k + '=')); return m ? m.split('=')[1] : d; };
const rawDir = opt('dir', 'ui/icons');
const dir = /^[A-Za-z]:[\\/]/.test(rawDir) || rawDir.startsWith('/') ? rawDir : path.join(ROOT, rawDir);
const re = new RegExp(opt('re', flag('all') ? '\\.png$' : '^beast_.*\\.png$'));
const apply = flag('apply'), force = flag('force');

const files = fs.readdirSync(dir).filter(f => re.test(f)).sort();
const rows = files.map(f => {
  const full = path.join(dir, f);
  let img, chunks;
  try { chunks = readChunks(fs.readFileSync(full)); img = rgbaOf(chunks); }
  catch (e) { return { f, skip: e.message }; }
  const s0 = stats(img, flag('lum'));
  const out = { f, ...s0 };
  /* 幂等标记：改过的写一条 tEXt，重跑直接跳过。光靠「外圈<12」判干净对满铺图形的两张不管用
     （nethpython、scorpion 的墨本来就顶到边，改完外圈还有 56/63），第二遍会再乘一次 K，越改越淡。 */
  const MARK = 'rekey';
  if (chunks.some(c => c.type === 'tEXt' && c.data.slice(0, MARK.length + 1).toString('latin1') === MARK + '\0')) {
    out.act = 'skip(已改过 tEXt:' + MARK + ')';
    return out;
  }
  if (!apply) return out;
  if (s0.edge12 < 12) { out.act = 'skip(外圈<12 干净)'; return out; }
  if (s0.edge12 > 200 && !force) { out.act = 'REFUSE(外圈>200 满铺形象)'; return out; }
  /* 两步，都只压「墨线以下」的雾，alpha>=SOFT+RAMP 的实形墨一个字节不动（写完回读核对 >=200 占比不变）：
     ① 墨线以下整体乘 K：纸底本身就在 140~200 这一段，所以拐点必须压在这一段之下。
        第一版把拐点做成「越接近 SOFT 压得越轻」（140~200 线性过渡），方向正好反了——
        纸底 183 只被乘到 138，实拍里那个方块还在。现在 SOFT 以下一律乘 K，
        SOFT~SOFT+RAMP 之间线性放回 1，过渡带只有 40 级、缩到 150px 不到 1px，看不出硬边。
     ② 外圈 smoothstep：按到画布边的距离再乘一遍（边上 0、MARGIN(48) 处 1），把残留的方框边收掉。 */
  const SOFT = +opt('soft', 200), RAMP = +opt('ramp', 40), K = +opt('k', 0.12), MG = +opt('margin', 48);
  const px = Buffer.from(img.px), n = img.w * img.h, W = img.w, H = img.h;
  for (let i = 0; i < n; i++) {
    const j = i * 4 + 3, a = px[j];
    if (a >= SOFT + RAMP) continue;
    const t = Math.max(0, Math.min(1, (a - SOFT) / RAMP));
    let v = a * (K + (1 - K) * t);
    if (MG > 0) {
      const x = i % W, y = (i / W) | 0;
      const d = Math.min(x, y, W - 1 - x, H - 1 - y);
      const s = Math.max(0, Math.min(1, d / MG));
      v *= s * s * (3 - 2 * s);
    }
    v = Math.round(v);
    px[j] = v < 8 ? 0 : (v > 255 ? 255 : v);
  }
  const buf = writePng({ w: img.w, h: img.h, px }, chunks,
    [{ type: 'tEXt', data: Buffer.from('rekey\0soft=' + SOFT + ' ramp=' + RAMP + ' k=' + K + ' margin=' + MG, 'latin1') }]);
  fs.writeFileSync(full, buf);
  const back = rgbaOf(readChunks(buf)), s1 = stats(back);
  const rgbSame = (() => { for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) if (img.px[i * 4 + k] !== back.px[i * 4 + k]) return false; return true; })();
  out.act = `外圈${s0.edge12.toFixed(0)}->${s1.edge12.toFixed(0)} a0 ${s0.z.toFixed(1)}->${s1.z.toFixed(1)}% 实形${s0.hi.toFixed(0)}->${s1.hi.toFixed(0)}% 墨${s0.solid.toFixed(1)}->${s1.solid.toFixed(1)}% ${rgbSame ? 'RGB不变' : 'RGB变了!'}`;
  if (!rgbSame) out.skip = 'roundtrip';
  else if (s1.solid < s0.solid - 0.01) out.skip = 'inkloss';
  else if (s1.edge12 > s0.edge12 * 0.5) out.skip = 'nochange';
  return out;
});

console.log(`${opt('dir', 'ui/icons')}  re=${re}  ${apply ? 'APPLY' : 'measure'}`);
if (flag('lum')) {
  console.log('file'.padEnd(24) + 'paperLum  cornerR   alpha中位 by 亮度带  (>=250 225-250 200-225 175-200 150-175 <150)');
  rows.forEach(r => console.log(r.skip && !r.act ? r.f.padEnd(24) + 'SKIP ' + r.skip
    : r.f.padEnd(24) + String(Math.round(r.paperLum)).padStart(6) + String(Math.round(r.R)).padStart(9) + '   ' + r.band.map(x => String(x).padStart(8)).join('')));
  return;
}
console.log('file'.padEnd(26) + 'a0%   1-63  64-199 >=200  cornerR 外圈12   act');
rows.forEach(r => console.log(r.skip && !r.act
  ? r.f.padEnd(26) + 'SKIP ' + r.skip
  : r.f.padEnd(26) + [r.z.toFixed(1), r.low.toFixed(1), r.mid.toFixed(1), r.hi.toFixed(1), Math.round(r.R), Math.round(r.edge12)].map(x => String(x).padStart(6)).join(' ') + '   ' + (r.act || '')));
const bad = rows.filter(r => !r.skip && r.edge12 >= 12);
console.log(`外圈 12px 平均 alpha>=12 的 ${bad.length} / ${rows.length} 张：` + bad.map(r => r.f.replace(/\.png$/, '')).join(' '));
if (rows.some(r => r.skip === 'inkloss')) { console.error('!! 有素材的实形墨被啃掉了（alpha>=240 的像素占比下降），改写不可信'); process.exit(1); }
if (rows.some(r => r.skip === 'nochange')) { console.error('!! 外圈没压到一半以下，等于没改（K 太大或口径不对）'); process.exit(1); }
if (rows.some(r => r.skip === 'roundtrip')) { console.error('!! 回读校验未过，上面的改写不可信'); process.exit(1); }
