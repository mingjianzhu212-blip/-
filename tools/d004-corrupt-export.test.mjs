/* D-004 · P0-2 收口：备份键写失败时，玩家能否真正导出"原始原文"
 *
 * GPT 第四轮复审的最后一个验收点：
 *   "请提供设置页中从 corruptRawCache 到复制原文或下载原文文件的实际按钮及处理函数。
 *    一条测试：模拟备份键写入失败，进入设置页，成功导出原文，并验证导出内容与原始 raw 完全一致。"
 *
 * 本文件的测法：
 *   不是在 vm 里假造一套等价逻辑，而是把 js/game.js 里**真实的** load catch 段、
 *   corruptRawText / copyCorruptRaw / downloadCorruptRaw / renderSaveCurrent 的源码
 *   原样抽出来，配一个"setItem 会抛错的 localStorage"跑一遍完整链路。
 *
 * 运行：node --test tools/d004-corrupt-export.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');

function extractFn(name){
  const idx = SRC.indexOf('function ' + name + '(');
  if(idx < 0) throw new Error('fn not found: ' + name);
  let i = SRC.indexOf('{', idx), depth = 0;
  for(let j = i; j < SRC.length; j++){
    if(SRC[j] === '{') depth++;
    else if(SRC[j] === '}'){ depth--; if(depth === 0) return SRC.slice(idx, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

/* 构造一个"主键可读、写入一律抛错"的 localStorage（模拟配额满 / 被策略禁写）。
   这正是备份键 xiuxian_save_corrupt 写不进去的那种情况。 */
function makeBrokenStorage(rawSave){
  const store = { [rawSave.key]: rawSave.value };
  return {
    getItem(k){ return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(){ throw new Error('QuotaExceededError'); },   // ← 关键：一切写入都失败
    removeItem(k){ delete store[k]; },
    _store: store,
  };
}

/* 把"原文 → 导出"这条链路真的跑一遍。
   downloadTextAsFile 用真实实现（Blob + a.download）；为了能在 node 里跑，
   只把 document/Blob/URL 这几个浏览器设施做最小替身，其余逻辑一字不改。 */
function buildContext(storage, opts){
  opts = opts || {};
  const downloaded = [];
  const clipboard = [];
  const hintEl = { textContent: '' };
  const outEl = { value: '', classList: { remove(){}, add(){} }, focus(){}, select(){} };

  const document = {
    getElementById(id){
      if(id === 'sv-copy-hint') return hintEl;
      if(id === 'sv-out') return outEl;
      return null;
    },
    createElement(tag){
      const el = { tagName: tag, href: '', download: '', style: {}, click(){ if(opts.onDownload) opts.onDownload(el.href, el.download); } , remove(){} };
      return el;
    },
    body: { appendChild(){} },
    execCommand(){ clipboard.push(outEl.value); return true; },
  };
  const Blob = class { constructor(parts){ this.parts = parts; this._text = parts.join(''); } };
  const URL = { createObjectURL(blob){ downloaded.push(blob._text); return 'blob:mock/' + downloaded.length; }, revokeObjectURL(){} };

  const ctx = {
    localStorage: storage,
    document,
    Blob,
    URL,
    navigator: { clipboard: { writeText(t){ clipboard.push(t); } } },
    setTimeout: (fn) => 0,
    Date, Math, JSON, String, Number, isFinite, Array, Object,
    corruptRawCache: '',
    // 真实代码里用到的几个小工具（照抄语义）
    byteLen: s => Buffer.byteLength(String(s || ''), 'utf8'),
    fmtSize: n => (n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB'),
    pad2: n => String(n).padStart(2, '0'),
    clearTutorialMark: () => {},
    log: () => {},
  };
  vm.createContext(ctx);
  return { ctx, downloaded, clipboard, hintEl, outEl };
}

test('P0-2 收口: setItem 抛错时原文进入 corruptRawCache（不丢）', () => {
  const RAW = JSON.stringify({ rank: 5, exp: 123, stone: 456, name: '测试道友', bag: [{ t: 'dan1', n: '下品丹药' }] });
  const storage = makeBrokenStorage({ key: 'xiuxian_save', value: RAW });
  const { ctx } = buildContext(storage);

  // 真实 load 的 catch 段（只取 catch 内部逻辑，不跑整个 400 行迁移）
  const catchSeg = SRC.match(/let backedUp = false;[\s\S]*?clearTutorialMark\(\); return false;/)[0];
  vm.runInContext('this.runCatch = function(raw, e){ ' + catchSeg + ' };', ctx);
  ctx.saveBlocked = false;
  ctx.runCatch(RAW, new Error('migration failed'));

  assert.strictEqual(ctx.saveBlocked, true, '备份失败也必须进保护状态（禁止写盘）');
  assert.strictEqual(ctx.corruptRawCache, RAW, '原文必须完整留在内存缓存里');
  assert.strictEqual(storage.getItem('xiuxian_save_corrupt'), null, '备份键确实没写进去（模拟条件成立）');
});

test('P0-2 收口: 从 corruptRawCache 导出的文件内容与原始 raw 逐字节一致', () => {
  const RAW = JSON.stringify({ rank: 7, exp: 9, stone: 11, name: '导出验证', bag: [] });
  const storage = makeBrokenStorage({ key: 'xiuxian_save', value: RAW });
  const { ctx, downloaded } = buildContext(storage);

  // 载入真实实现
  vm.runInContext(extractFn('downloadTextAsFile') + '\nthis.downloadTextAsFile = downloadTextAsFile;', ctx);
  vm.runInContext(extractFn('corruptRawText') + '\nthis.corruptRawText = corruptRawText;', ctx);
  vm.runInContext(extractFn('downloadCorruptRaw') + '\nthis.downloadCorruptRaw = downloadCorruptRaw;', ctx);
  ctx.corruptRawCache = RAW;     // 模拟 load 的 catch 已经把它存进来

  const ok = ctx.downloadCorruptRaw();
  assert.strictEqual(ok, true, '导出必须成功');
  assert.strictEqual(downloaded.length, 1, '必须真的生成一次下载');
  assert.strictEqual(downloaded[0], RAW, '导出的内容必须与原始 raw **完全一致**（逐字节）');
});

test('P0-2 收口: 复制原文同样得到完全一致的 raw', () => {
  const RAW = '{"rank":3,"exp":1,"stone":2,"name":"复制验证","bag":[],"note":"含中文与\\"转义\\""}';
  const storage = makeBrokenStorage({ key: 'xiuxian_save', value: RAW });
  const { ctx, clipboard, outEl } = buildContext(storage);

  vm.runInContext(extractFn('copyTextToClipboard') + '\nthis.copyTextToClipboard = copyTextToClipboard;', ctx);
  vm.runInContext(extractFn('corruptRawText') + '\nthis.corruptRawText = corruptRawText;', ctx);
  vm.runInContext(extractFn('copyCorruptRaw') + '\nthis.copyCorruptRaw = copyCorruptRaw;', ctx);
  ctx.corruptRawCache = RAW;

  ctx.copyCorruptRaw();
  assert.strictEqual(outEl.value, RAW, '文本框里必须是完整原文');
  assert.ok(clipboard.length > 0, '必须尝试写入剪贴板/执行复制');
  assert.strictEqual(clipboard[clipboard.length - 1], RAW, '复制到剪贴板的内容必须与 raw 一致');
});

test('P0-2 收口: 有本次缓存时以本次为准（历史备份只在没有本次原文时兜底）', () => {
  const RAW_IN_MEM = '{"rank":1,"name":"内存里的"}';
  const RAW_ON_DISK = '{"rank":2,"name":"备份键里的"}';
  const storage = {
    getItem(k){ return k === 'xiuxian_save_corrupt' ? RAW_ON_DISK : null; },
    setItem(){}, removeItem(){},
  };
  const { ctx } = buildContext(storage);
  vm.runInContext(extractFn('corruptRawText') + '\nthis.corruptRawText = corruptRawText;', ctx);
  ctx.corruptRawCache = RAW_IN_MEM;
  assert.strictEqual(ctx.corruptRawText(), RAW_IN_MEM, '本次失败的原文优先于历史备份（防止导出拿错档）');
});

test('P0-2 收口: 两者都没有时明确返回空（不造假入口）', () => {
  const storage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
  const { ctx, hintEl, downloaded } = buildContext(storage);
  vm.runInContext(extractFn('downloadTextAsFile') + '\nthis.downloadTextAsFile = downloadTextAsFile;', ctx);
  vm.runInContext(extractFn('corruptRawText') + '\nthis.corruptRawText = corruptRawText;', ctx);
  vm.runInContext(extractFn('downloadCorruptRaw') + '\nthis.downloadCorruptRaw = downloadCorruptRaw;', ctx);
  ctx.corruptRawCache = '';

  const ok = ctx.downloadCorruptRaw();
  assert.strictEqual(ok, false, '没有原文时不得谎报成功');
  assert.strictEqual(downloaded.length, 0, '不得生成空文件');
  assert.match(hintEl.textContent, /没有可导出的原文/, '必须明确告诉玩家没有');
});

test('P0-2 收口: 设置页在"仅内存"状态下渲染出真实的下载/复制按钮', () => {
  const fn = extractFn('renderSaveCurrent');
  assert.match(fn, /data-sv-recover="3"[^>]*>下载本次原文</, '必须有"下载本次原文"按钮');
  assert.match(fn, /data-sv-recover="4"[^>]*>复制本次原文</, '必须有"复制本次原文"按钮');
  assert.match(fn, /刷新即丢/, '必须说明内存态会丢');
  // 三种及以上状态都要有
  assert.match(fn, /if\(curRaw\)\{/);
  assert.match(fn, /else if\(bakRaw\)\{/);
  assert.match(fn, /else if\(saveBlocked\)\{/);
});

test('P0-2 收口: 委托把 3/4 分别路由到下载与复制', () => {
  const idx = SRC.indexOf("const act = b.dataset.svRecover;");
  assert.ok(idx > 0, '必须存在按动作区分的委托');
  const seg = SRC.slice(idx, idx + 300);
  assert.match(seg, /if\(act === '3'\) downloadCorruptRaw\(\);/);
  assert.match(seg, /else if\(act === '4'\) copyCorruptRaw\(\);/);
});

test('P0-2 收口: 通用导出通道是真的 Blob 下载（不是只改文字）', () => {
  const fn = extractFn('downloadTextAsFile');
  assert.match(fn, /new Blob\(\[text\]/, '必须真的建 Blob');
  assert.match(fn, /createObjectURL/, '必须真的生成 URL');
  assert.match(fn, /a\.download = fn/, '必须真的设置下载文件名');
  assert.match(fn, /a\.click\(\)/, '必须真的触发点击');
});

/* ================================================================== */
/* 第五轮复审：历史备份 vs 本次原文 的优先级                            */
/* ================================================================== */

test('P0-2 收口2: 备份键里是旧档 A、本次坏的是 B → 导出必须是 B 而不是 A', () => {
  const A = JSON.stringify({ rank: 9, name: '旧的备份A' });
  const B = JSON.stringify({ rank: 3, name: '本次损坏的B' });
  /* 备份键里存着旧档 A；本次 load 读的是 B，且备份写入失败（setItem 抛错）。
     这正是审查指出的场景：键里是 A，内存里是 B。 */
  const storage = {
    _s: { xiuxian_save: B, xiuxian_save_corrupt: A },
    getItem(k){ return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(){ throw new Error('QuotaExceededError'); },
    removeItem(k){ delete this._s[k]; },
  };
  const { ctx, downloaded } = buildContext(storage);
  vm.runInContext(extractFn('downloadTextAsFile') + '\nthis.downloadTextAsFile = downloadTextAsFile;', ctx);
  vm.runInContext(extractFn('corruptRawText') + '\nthis.corruptRawText = corruptRawText;', ctx);
  vm.runInContext(extractFn('downloadCorruptRaw') + '\nthis.downloadCorruptRaw = downloadCorruptRaw;', ctx);

  // 真实 load 的 catch：raw = B，setItem 抛错 → corruptRawCache = B
  const catchSeg = SRC.match(/let backedUp = false;[\s\S]*?clearTutorialMark\(\); return false;/)[0];
  vm.runInContext('this.runCatch = function(raw, e){ ' + catchSeg + ' };', ctx);
  ctx.runCatch(B, new Error('migration failed'));

  assert.strictEqual(ctx.corruptRawCache, B, '本次原文 B 必须进缓存');
  assert.strictEqual(storage.getItem('xiuxian_save_corrupt'), A, '备份键里仍是旧档 A（模拟条件成立）');
  assert.strictEqual(ctx.corruptRawText(), B, '取原文必须优先本次缓存，不能取到旧档 A');

  ctx.downloadCorruptRaw();
  assert.strictEqual(downloaded[0], B, '下载内容必须是本次的 B');
  assert.notStrictEqual(downloaded[0], A, '绝不能导出旧档 A');
});

test('P0-2 收口2: 没有本次缓存时才回落到历史备份', () => {
  const A = JSON.stringify({ rank: 9, name: '历史备份' });
  const storage = { getItem(k){ return k === 'xiuxian_save_corrupt' ? A : null; }, setItem(){}, removeItem(){} };
  const { ctx } = buildContext(storage);
  vm.runInContext(extractFn('corruptRawText') + '\nthis.corruptRawText = corruptRawText;', ctx);
  ctx.corruptRawCache = '';
  assert.strictEqual(ctx.corruptRawText(), A, '当前页面没有本次原文时，用历史备份兜底');
});

test('P0-2 收口2: corruptRawSource 能区分 current / backup / 空', () => {
  const vm2 = (storage, cache) => {
    const { ctx } = buildContext(storage);
    vm.runInContext(extractFn('corruptRawSource') + '\nthis.corruptRawSource = corruptRawSource;', ctx);
    ctx.corruptRawCache = cache;
    return ctx;
  };
  const withBackup = { getItem(){ return '{"a":1}'; }, setItem(){}, removeItem(){} };
  const empty = { getItem(){ return null; }, setItem(){}, removeItem(){} };

  assert.strictEqual(vm2(withBackup, '{"b":2}').corruptRawSource(), 'current', '有本次缓存 → current');
  assert.strictEqual(vm2(withBackup, '').corruptRawSource(), 'backup', '只有键 → backup');
  assert.strictEqual(vm2(empty, '').corruptRawSource(), '', '都没有 → 空');
});

test('P0-2 收口2: 设置页把「本次」和「更早的」分开措辞', () => {
  const fn = extractFn('renderSaveCurrent');
  assert.match(fn, /\u672c\u6b21读档失败/, '必须点明"本次"');
  assert.match(fn, /更早.*自动备份|历史.*自动备份/, '必须把历史备份单独说成"更早/历史"');
  assert.match(fn, /下载本次原文/, '按钮文案要写清是"本次"');
});
