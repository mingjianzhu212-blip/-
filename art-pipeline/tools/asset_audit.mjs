/* 副线 B：美术资产引用盘点（只读，不改游戏代码）
   用途：从真实代码里抽出「被引用的素材路径」，与磁盘上的实际文件比对，
        产出「已有 / 缺失 / 未被引用（孤儿）」三张表，作为资产总清单的事实依据。
   运行：node art-pipeline/tools/asset_audit.mjs [--json]
*/
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'screenshot', 'shot', '.smoke', 'art-pipeline', 'audio']);
const CODE_EXT = new Set(['.html', '.css', '.js', '.mjs']);
const ASSET_EXT = /\.(png|jpg|jpeg|webp|svg|ttf|woff2?|mp3|ogg|wav)$/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(p, out);
    } else {
      const ext = path.extname(e.name).toLowerCase();
      if (CODE_EXT.has(ext) && !e.name.includes('.bak')) out.push(p);
    }
  }
  return out;
}

function walkAssets(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkAssets(p, out);
    else if (ASSET_EXT.test(e.name) && !e.name.includes('.bak')) out.push(p);
  }
  return out;
}

/* 引用抽取：覆盖 "ui/x.png"、'ui/x.png'、url(ui/x.png)、模板字符串、以及常量表里的字符串 */
const REF_RE = /(?:["'`(])((?:\.\/)?ui\/[A-Za-z0-9_\-./]+\.(?:png|jpg|jpeg|webp|svg|ttf|woff2?|mp3|ogg|wav))/g;

const codeFiles = walk(ROOT);
const refs = new Map(); // relPath -> Set(codeFile)
const perFile = new Map();

for (const f of codeFiles) {
  const src = fs.readFileSync(f, 'utf8');
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  for (const m of src.matchAll(REF_RE)) {
    const p = m[1].replace(/^\.\//, '');
    if (!refs.has(p)) refs.set(p, new Set());
    refs.get(p).add(rel);
    if (!perFile.has(rel)) perFile.set(rel, new Set());
    perFile.get(rel).add(p);
  }
}

const referenced = [...refs.keys()].sort();
const missing = referenced.filter((p) => !fs.existsSync(path.join(ROOT, p)));
const present = referenced.filter((p) => fs.existsSync(path.join(ROOT, p)));

const allAssets = walkAssets(path.join(ROOT, 'ui')).map(
  (p) => path.relative(ROOT, p).split(path.sep).join('/')
);
const orphan = allAssets.filter((p) => !refs.has(p)).sort();

const byDir = {};
for (const p of present) {
  const d = path.posix.dirname(p);
  byDir[d] = (byDir[d] || 0) + 1;
}
const orphanByDir = {};
for (const p of orphan) {
  const d = path.posix.dirname(p);
  orphanByDir[d] = (orphanByDir[d] || 0) + 1;
}

const report = {
  scannedCodeFiles: codeFiles.length,
  referencedTotal: referenced.length,
  referencedPresent: present.length,
  referencedMissing: missing.length,
  assetsOnDisk: allAssets.length,
  orphanTotal: orphan.length,
  byDir,
  orphanByDir,
  missing,
  missingDetail: missing.map((p) => ({ path: p, usedBy: [...refs.get(p)] })),
  orphan,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('扫描代码文件：', report.scannedCodeFiles);
  console.log('代码引用素材路径：', report.referencedTotal, '（存在', report.referencedPresent, '/ 缺失', report.referencedMissing, '）');
  console.log('ui/ 下实际素材文件：', report.assetsOnDisk, '（未被任何代码引用：', report.orphanTotal, '）');
  console.log('\n=== 被引用目录分布 ===');
  for (const d of Object.keys(byDir).sort()) console.log(' ', d, ':', byDir[d]);
  console.log('\n=== 缺失（代码要但磁盘没有）===');
  if (!missing.length) console.log('  （无）');
  for (const p of missing) console.log('  MISS', p, '<-', [...refs.get(p)].join(', '));
  console.log('\n=== 孤儿（磁盘有但代码没引用）===');
  if (!orphan.length) console.log('  （无）');
  for (const d of Object.keys(orphanByDir).sort()) console.log(' ', d, ':', orphanByDir[d], '个');
  console.log('\n孤儿明细：');
  for (const p of orphan) console.log('  ORPHAN', p);
}
