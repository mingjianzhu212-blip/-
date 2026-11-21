/* D-005 专项：D-004 之后继续修的这批"审查判不阻断但确实存在"的问题
 *
 * 逐条对应：
 *   A. tryImport 搬完删源键（否则每次无存档开局都弹一次）
 *   B. bossKilled 只收 BEASTS 表里的 id
 *   C. acts / wuPaid 数值钳制（脏值不再产生 NaN）
 *   D. letters.rw 奖励钳制（手改档不能白拿灵石/悟道）
 *   E. 转世/重开清 UI 态（rrLocks / farmSel）
 *   F. spendFloat 并发上限 1
 *   H. mkFlash 按 data-slot 定位（缺货导致行序错位时不闪错行）
 *   J. 导出打包侧车键 + 导入写回 + 不污染主档
 *
 * 手法与 D-004 一致：从 js/game.js 抽**真实函数源码**进 node:vm 跑。
 * 运行：node --test tools/d005-followup.test.mjs
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
function extractConst(decl){
  const i = SRC.indexOf(decl);
  if(i < 0) throw new Error('const not found: ' + decl);
  const end = SRC.indexOf('\n', i);
  return SRC.slice(i, end);
}

/* ---------- A. tryImport 删源键 ---------- */
test('A: tryImport 成功后删除 arcade_xx_save（避免每次开局重复弹窗）', () => {
  const fn = extractFn('tryImport');
  assert.match(fn, /localStorage\.removeItem\('arcade_xx_save'\)/,
    '必须删源键，否则"只搬一次"的承诺不成立');
});

test('A: tryImport 实际执行后源键消失、主档被写入', () => {
  const store = {
    arcade_xx_save: JSON.stringify({ rank: 7, exp: 100, stone: 50, cave: 2, dan: 1, dao: 0, rootIdx: 1 }),
  };
  const ctx = {
    localStorage: {
      getItem(k){ return k in store ? store[k] : null; },
      setItem(k, v){ store[k] = v; },
      removeItem(k){ delete store[k]; },
    },
    confirm: () => true,
    console: { warn(){} },
    S: { rank: 0, exp: 0, stone: 0, cave: 0, dan: 0, forge: 0, field: 0, dao: 0, rootIdx: 0, log: [] },
    RANK_NAMES: new Array(30).fill('境'),
    ROOTS: [{}, {}, {}, {}, {}],
    TOP: 25,
    BAL: { caveMax: 9, fieldMax: 9 },
    BUILDINGS: { alchemy: { maxLevel: 9 }, forge: { maxLevel: 9 } },
    GONGS: [{ id: 'gong1', max: 10 }, { id: 'gong2', max: 10 }, { id: 'gong3', max: 10 }],
    ensureActs: () => {},
    safeTs: (v, fb) => (typeof v === 'number' && isFinite(v) ? v : fb),
    log: () => {},
    Date, Math, JSON, isFinite, Array, Object, String,
  };
  vm.createContext(ctx);
  vm.runInContext(extractFn('tryImport') + '\nthis.tryImport = tryImport;', ctx);
  const ok = ctx.tryImport();
  assert.strictEqual(ok, true, '应当搬移成功');
  assert.strictEqual(store.arcade_xx_save, undefined, '源键必须已删除');
});

/* ---------- B. bossKilled 白名单 ---------- */
test('B: load 只收 BEASTS 表里存在的 bossKilled 键', () => {
  const fn = extractFn('load');
  const seg = fn.slice(fn.indexOf('S.bossKilled = {}'), fn.indexOf('S.bossKilled = {}') + 400);
  assert.match(seg, /BEASTS\.some\(b => b\.id === k\)/, '必须按 BEASTS 表校验键名');
  assert.match(seg, /!Array\.isArray\(o\.bossKilled\)/, '数组不得被当成对象收下');
});

/* ---------- C. acts / wuPaid 钳制 ---------- */
test('C: acts 读档逐键钳到非负整数（脏值不再变 NaN）', () => {
  const fn = extractFn('load');
  const i = fn.indexOf('const ACT_KEYS');
  assert.ok(i > 0, '必须能找到 acts 读取段');
  const seg = fn.slice(i, i + 500);
  assert.match(seg, /typeof v === 'number' && isFinite\(v\)/, '非数字必须挡掉');
  assert.match(seg, /Math\.max\(0, Math\.floor\(v\)\)/, '必须钳到非负整数');
});

test('C: wuPaid 同样钳制（它是洗点返成的记账依据）', () => {
  const fn = extractFn('load');
  const i = fn.indexOf('S.wuPaid = Object.assign(');
  assert.ok(i > 0);
  const seg = fn.slice(i, i + 500);
  assert.match(seg, /Object\.keys\(S\.wuPaid\)\.forEach/);
  assert.match(seg, /Math\.max\(0, v\)/);
});

/* ---------- D. letters.rw 钳制 ---------- */
test('D: letters 读档走 sanitizeLetterReward（不再原样收 rw）', () => {
  const fn = extractFn('load');
  assert.match(fn, /rw: sanitizeLetterReward\(x\.rw\)/, '必须过钳制函数');
  assert.doesNotMatch(fn, /rw: \(x\.rw && typeof x\.rw === 'object'\) \? x\.rw : null/,
    '旧的原样收法必须消失');
});

test('D: sanitizeLetterReward 真的拦得住离谱值', () => {
  const code = extractConst('function sanitizeLetterReward') === '' ? extractFn('sanitizeLetterReward') : extractFn('sanitizeLetterReward');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.sanitizeLetterReward = sanitizeLetterReward;', ctx);
  const f = ctx.sanitizeLetterReward;

  assert.strictEqual(f(null), null);
  assert.strictEqual(f('x'), null);
  assert.strictEqual(f([]), null);
  assert.strictEqual(f({}), null);

  const huge = f({ wisdom: 1e9, stone: 1e9, herb: 1e9 });
  assert.strictEqual(huge.wisdom, 200, 'wisdom 必须夹到上限 200');
  assert.strictEqual(huge.stone, 3, 'stone 倍数必须夹到 3');
  assert.strictEqual(huge.herb, 9, 'herb 必须夹到 9');

  const neg = f({ wisdom: -5, stone: -1, herb: -2 });
  assert.strictEqual(neg, null, '全负值等于没有奖励');

  const normal = f({ wisdom: 30 });
  assert.deepStrictEqual({ ...normal }, { wisdom: 30 }, '合法值原样保留');
});

/* ---------- E. 转世/重开清 UI 态 ---------- */
test('E: resetForNewLife 清 rrLocks 与 farmSel', () => {
  const fn = extractFn('resetForNewLife');
  assert.match(fn, /rrLocks\.clear\(\)/, '洗练锁是上一世的槽位号');
  assert.match(fn, /farmSel = 'herb'/, '灵田选中作物要回到默认');
});

test('E: resetAll 同样清 rrLocks 与 farmSel', () => {
  const fn = extractFn('resetAll');
  assert.match(fn, /rrLocks\.clear\(\)/);
  assert.match(fn, /farmSel = 'herb'/);
});

/* ---------- F. spendFloat 并发 ---------- */
test('F: spendFloat 同一时刻只保留一枚（新的先结算旧的）', () => {
  const fn = extractFn('spendFloat');
  assert.match(fn, /if\(spendFloatCleanup\)\{ try\{ spendFloatCleanup\(\); \}/,
    '新的出现时要先清掉上一枚');
  assert.match(fn, /spendFloatCleanup = cleanup;/, '必须记下这次的清理器');
  assert.match(fn, /if\(spendFloatCleanup === cleanup\) spendFloatCleanup = null;/,
    '清理后要解引用，避免持有已死节点');
  /* cleanup 必须真的解绑全局监听 */
  assert.match(fn, /document\.removeEventListener\('scroll', onScroll, true\)/);
  assert.match(fn, /window\.removeEventListener\('resize', onScroll\)/);
});

/* ---------- H. mkFlash 按 data-slot ---------- */
test('H: 行情行带 data-slot（槽位下标，不是行序）', () => {
  assert.match(SRC, /'<div class="mk-row'[\s\S]{0,120}data-slot="' \+ i \+ '"/,
    '行必须带槽位下标');
});

test('H: 墨晕按 data-slot 定位，不再用 querySelectorAll 的行序', () => {
  const i = SRC.indexOf('if(mkFlash >= 0)');
  const seg = SRC.slice(i, i + 400);
  assert.match(seg, /querySelector\('\.mk-row\[data-slot="' \+ mkFlash \+ '"\]'\)/,
    '必须按槽位精确定位');
  assert.doesNotMatch(seg, /querySelectorAll\('\.mk-row'\)\[mkFlash\]/,
    '按行序会因缺货槽位错位');
});

test('H: 买入浮字定位同样按 data-slot', () => {
  const i = SRC.indexOf('const row = gBox ?');
  const seg = SRC.slice(i, i + 200);
  assert.match(seg, /data-slot=/, '浮字锚点也要按槽位定位');
  assert.doesNotMatch(seg, /querySelectorAll\('\.mk-row'\)\[idx\]/);
});

/* ---------- J. 侧车打包 ---------- */
test('J: 常量声明早于 previewSaveText 使用（const 有 TDZ）', () => {
  const lines = SRC.split('\n');
  let decl = 0;
  lines.forEach((l, i) => { if(/const SIDECAR_FIELD\s*=/.test(l)) decl = i + 1; });
  assert.ok(decl > 0, '必须有 SIDECAR_FIELD 声明');
  const early = [];
  lines.forEach((l, i) => { if(l.includes('SIDECAR_FIELD') && !/const SIDECAR_FIELD/.test(l) && (i + 1) < decl) early.push(i + 1); });
  assert.deepStrictEqual(early, [], '不得有早于声明的使用（否则运行时 ReferenceError）');
});

test('J: 导出走 buildSaveBundle 而不是裸 JSON.stringify(S)', () => {
  const fn = extractFn('downloadSave');
  assert.match(fn, /buildSaveBundle\(\)/);
  assert.doesNotMatch(fn, /JSON\.stringify\(S\)/, '裸序列化会漏掉侧车');
  const fn2 = extractFn('copySave');
  assert.match(fn2, /buildSaveBundle\(\)/);
});

test('J: buildSaveBundle 把 5 个侧车键打进 __sidecar', () => {
  const fn = extractFn('buildSaveBundle');
  assert.match(fn, /o\[SIDECAR_FIELD\] = side/);
  const keys = extractConst('const SIDECAR_KEYS =');
  ['jxwd_daily_v1', 'jxwd_npc_memory_v1', 'jxwd_npc_visit_v1', 'hasFinishedTutorial', 'xiuxian_best']
    .forEach(k => assert.ok(keys.includes(k), '必须包含 ' + k));
});

test('J: 导入时侧车从主档对象里摘掉（不污染 SAVE_KEY）', () => {
  const fn = extractFn('writeImportedSave');
  assert.match(fn, /const side = obj\[SIDECAR_FIELD\];/, '先取出来');
  assert.match(fn, /delete saveObj\[SIDECAR_FIELD\]/, '落盘对象必须没有该键');
  /* 关键顺序：先摘再序列化。反过来（先 stringify 再 delete）raw 里仍带着侧车。 */
  const iStr = fn.indexOf('JSON.stringify(saveObj)');
  const iDel = fn.indexOf('delete saveObj[SIDECAR_FIELD]');
  assert.ok(iDel > 0 && iStr > 0 && iDel < iStr, '必须"先摘键、后序列化"');
  assert.match(fn, /restoreSidecar\(side\)/, '主档写成功后再恢复侧车');
  const iSet = fn.indexOf('localStorage.setItem');
  const iRestore = fn.indexOf('restoreSidecar(side)');
  assert.ok(iSet > 0 && iRestore > iSet, '侧车恢复必须在主档写入之后');
});

test('J: restoreSidecar 遇到写不进去只跳过、不阻断', () => {
  const fn = extractFn('restoreSidecar');
  assert.match(fn, /try\{ localStorage\.setItem\(k, v\); n\+\+; \}catch\(e\)\{/,
    '单个键写失败不能抛出去');
  assert.match(fn, /typeof v !== 'string' \|\| !v\.length/, '非字符串/空值要挡掉');
});

test('J: 侧车端到端（打包 → 清空 → 恢复）', () => {
  const store = {
    jxwd_daily_v1: '{"day":"2026-11-08","done":1}',
    jxwd_npc_memory_v1: '{"stele":{"met":1}}',
    jxwd_npc_visit_v1: '{"last":123}',
    hasFinishedTutorial: '1',
    xiuxian_best: '21',
  };
  const ctx = {
    localStorage: {
      getItem(k){ return k in store ? store[k] : null; },
      setItem(k, v){ store[k] = v; },
      removeItem(k){ delete store[k]; },
    },
    S: { rank: 5, exp: 1, stone: 2, name: '测试', bag: [] },
    JSON, Math, Object, Array, String, Number, isFinite, Date,
  };
  vm.createContext(ctx);
  vm.runInContext(extractConst('const SIDECAR_KEYS =') + '\nthis.SIDECAR_KEYS = SIDECAR_KEYS;', ctx);
  vm.runInContext(extractConst('const SIDECAR_FIELD =') + '\nthis.SIDECAR_FIELD = SIDECAR_FIELD;', ctx);
  vm.runInContext(extractFn('collectSidecar') + '\nthis.collectSidecar = collectSidecar;', ctx);
  vm.runInContext(extractFn('buildSaveBundle') + '\nthis.buildSaveBundle = buildSaveBundle;', ctx);
  vm.runInContext(extractFn('restoreSidecar') + '\nthis.restoreSidecar = restoreSidecar;', ctx);

  const bundle = ctx.buildSaveBundle();
  const parsed = JSON.parse(bundle);
  assert.strictEqual(parsed.rank, 5, '主档字段照旧');
  assert.ok(parsed.__sidecar, '必须带侧车');
  assert.strictEqual(Object.keys(parsed.__sidecar).length, 5, '五项都要在');

  // 模拟换设备：清空后再恢复
  Object.keys(store).forEach(k => { delete store[k]; });
  const n = ctx.restoreSidecar(parsed.__sidecar);
  assert.strictEqual(n, 5, '五项都要写回');
  assert.strictEqual(store.jxwd_npc_memory_v1, '{"stele":{"met":1}}', '内容逐字一致');
  assert.strictEqual(store.xiuxian_best, '21');
});

test('J: 没有侧车时导出不带 __sidecar（不写空字段）', () => {
  const ctx = {
    localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){} },
    S: { rank: 1, exp: 1, stone: 0, name: 'x', bag: [] },
    JSON, Math, Object, Array, String, Number, isFinite, Date,
  };
  vm.createContext(ctx);
  vm.runInContext(extractConst('const SIDECAR_KEYS ='), ctx);
  vm.runInContext(extractConst('const SIDECAR_FIELD ='), ctx);
  vm.runInContext(extractFn('collectSidecar') + '\nthis.collectSidecar = collectSidecar;', ctx);
  vm.runInContext(extractFn('buildSaveBundle') + '\nthis.buildSaveBundle = buildSaveBundle;', ctx);
  const parsed = JSON.parse(ctx.buildSaveBundle());
  assert.strictEqual(parsed.__sidecar, undefined, '无侧车时不应出现该字段');
});

/* ================================================================== */
/* J-1（GPT 复审唯一阻断项）：落盘到 SAVE_KEY 的必须是**纯主档**        */
/* 断言直接读 localStorage 实际写入的字符串，不看中间对象               */
/* ================================================================== */

function makeWriteCtx(store){
  const ctx = {
    localStorage: {
      getItem(k){ return k in store ? store[k] : null; },
      setItem(k, v){ store[k] = v; },
      removeItem(k){ delete store[k]; },
    },
    SAVE_KEY: 'xiuxian_save',
    JSON, Math, Object, Array, String, Number, isFinite, Date,
  };
  vm.createContext(ctx);
  vm.runInContext(extractConst('const SIDECAR_KEYS ='), ctx);
  vm.runInContext(extractConst('const SIDECAR_FIELD ='), ctx);
  vm.runInContext(extractFn('restoreSidecar') + '\nthis.restoreSidecar = restoreSidecar;', ctx);
  vm.runInContext(extractFn('writeImportedSave') + '\nthis.writeImportedSave = writeImportedSave;', ctx);
  return ctx;
}

test('J-1: 导入后 SAVE_KEY 的实际落盘内容不含 __sidecar', () => {
  const store = { jxwd_daily_v1: '{"d":1}' };
  const ctx = makeWriteCtx(store);

  const bundle = {
    rank: 8, exp: 500, stone: 1200, name: '落盘验证', bag: [{ t: 'dan1', n: '下品丹药' }],
    __sidecar: {
      jxwd_daily_v1: '{"day":"2026-11-08","done":1}',
      jxwd_npc_memory_v1: '{"stele":{"met":1,"rel":3}}',
      jxwd_npc_visit_v1: '{"last":123,"queue":["cuijiu"]}',
      hasFinishedTutorial: '1',
      xiuxian_best: '21',
    },
  };

  const out = ctx.writeImportedSave(bundle);

  /* ① 读**实际落盘**的字符串，而不是看内存对象 */
  const persisted = store['xiuxian_save'];
  assert.ok(persisted, '必须真的写入 SAVE_KEY');

  const parsed = JSON.parse(persisted);
  assert.strictEqual(parsed.__sidecar, undefined, '落盘的主档里绝不能有 __sidecar');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(parsed, '__sidecar'), false,
    '连这个键都不该存在（hasOwnProperty 也必须是 false）');

  /* ② 主档字段照常 */
  assert.strictEqual(parsed.rank, 8);
  assert.strictEqual(parsed.name, '落盘验证');
  assert.strictEqual(parsed.bag.length, 1);

  /* ③ 五个侧车键逐字节恢复 */
  assert.strictEqual(out.sideN, 5, '五项都要恢复');
  assert.strictEqual(store.jxwd_daily_v1, '{"day":"2026-11-08","done":1}');
  assert.strictEqual(store.jxwd_npc_memory_v1, '{"stele":{"met":1,"rel":3}}');
  assert.strictEqual(store.jxwd_npc_visit_v1, '{"last":123,"queue":["cuijiu"]}');
  assert.strictEqual(store.hasFinishedTutorial, '1');
  assert.strictEqual(store.xiuxian_best, '21');

  /* ④ 返回的 raw 就是落盘的那一份 */
  assert.strictEqual(out.raw, persisted, '返回的 raw 必须与实际落盘一致');
  assert.strictEqual(out.raw.indexOf('__sidecar'), -1, 'raw 里也不该出现这个字符串');
});

test('J-1: 再执行一次**真实 save()**，侧车字段不会被写回主档', () => {
  const store = {};
  const ctx = makeWriteCtx(store);
  const bundle = {
    rank: 3, exp: 10, stone: 20, name: '二次保存', bag: [],
    __sidecar: { xiuxian_best: '9' },
  };
  const out = ctx.writeImportedSave(bundle);

  /* 关键：这里不再"手工再序列化一次"，而是把 js/game.js 里**真实的 save() 函数**
     抽出来执行。它读的是模块级 S 与 inited/saveBlocked/frozenForImport，
     所以把这些状态按"导入完成后"的真实取值配好：
       · S 由刚刚落盘的内容 load 而来（模拟重载后的状态）
       · inited = true（boot 已完成）
       · saveBlocked = false（导入写入成功后已解除）
       · frozenForImport = false（已重载，冻结解除） */
  const S = JSON.parse(store['xiuxian_save']);

  const saveCtx = {
    localStorage: {
      getItem(k){ return k in store ? store[k] : null; },
      setItem(k, v){ store[k] = v; },
      removeItem(k){ delete store[k]; },
    },
    SAVE_KEY: 'xiuxian_save',
    S: S,
    inited: true,
    saveBlocked: false,
    frozenForImport: false,
    reportFrozenNoSave(){ throw new Error('不该走到冻结提示'); },
    reportSaveRecovered(){},
    reportSaveFailure(){},
    JSON, Math, Object, Array, String, Number, isFinite, Date,
  };
  vm.createContext(saveCtx);
  vm.runInContext(extractFn('save') + '\nthis.save = save;', saveCtx);

  const ok = saveCtx.save();
  assert.strictEqual(ok, true, '真实 save() 必须成功（inited / 未冻结 / 未封锁）');

  /* 读真实落盘内容 */
  const persisted = store['xiuxian_save'];
  const parsed = JSON.parse(persisted);
  assert.strictEqual(parsed.__sidecar, undefined, '真实 save() 之后主档里仍不得有 __sidecar');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(parsed, '__sidecar'), false,
    'hasOwnProperty 也必须是 false');
  assert.strictEqual(persisted.indexOf('__sidecar'), -1, '落盘字符串里连这个字串都不该有');

  /* 主档字段与侧车都还在各自的正确位置 */
  assert.strictEqual(parsed.rank, 3);
  assert.strictEqual(parsed.name, '二次保存');
  assert.strictEqual(store.xiuxian_best, '9', '侧车本身仍在自己的键里');
  assert.strictEqual(out.sideN, 1);
});

test('J-1: 传入对象被就地清理（后续误用也不会带出去）', () => {
  const store = {};
  const ctx = makeWriteCtx(store);
  const bundle = { rank: 1, exp: 1, stone: 1, name: 'x', __sidecar: { xiuxian_best: '1' } };
  ctx.writeImportedSave(bundle);
  assert.strictEqual(bundle.__sidecar, undefined, '原对象上的 __sidecar 也应被摘掉');
});

test('J-1: 侧车恢复失败不阻断主档写入', () => {
  const store = {};
  const ctx = makeWriteCtx(store);
  /* 让侧车 setItem 一律抛错（配额满），主档仍须写入成功 */
  const realSet = ctx.localStorage.setItem;
  ctx.localStorage.setItem = function(k, v){
    if(k !== 'xiuxian_save') throw new Error('QuotaExceededError');
    return realSet.call(this, k, v);
  };
  const out = ctx.writeImportedSave({ rank: 2, exp: 2, stone: 2, name: 'y', __sidecar: { xiuxian_best: '5' } });
  assert.ok(store['xiuxian_save'], '主档必须写成功');
  assert.strictEqual(out.sideN, 0, '侧车一项都没恢复（但也没抛）');
});

/* ---------- C-2: acts 白名单化（GPT 建议） ---------- */
test('C-2: acts 读档只保留五个正式行动键，未知键不写回存档', () => {
  const fn = extractFn('load');
  assert.match(fn, /const ACT_KEYS = \['sit', 'herb', 'train', 'enlight', 'ponder'\]/,
    '必须有显式白名单');
  assert.match(fn, /S\.acts = \{\};/, '必须从空对象重建，而不是 Object.assign 带上未知键');
  const i = fn.indexOf("const ACT_KEYS");
  const seg = fn.slice(i, i + 700);
  assert.match(seg, /ACT_KEYS\.forEach\(k => \{/, '只遍历白名单');
  assert.doesNotMatch(seg, /Object\.assign\(\{[^}]*sit: 0[\s\S]{0,200}o\.acts\)/,
    '旧的 Object.assign 合并没有白名单，会带未知键');
});

test('C-2: 白名单化后未知键确实被丢弃、已知键保留并钳制', () => {
  /* 单独跑白名单这一段逻辑，验证行为而不是只查字符串 */
  const code = `
    const ACT_KEYS = ['sit', 'herb', 'train', 'enlight', 'ponder'];
    function readActs(srcActs){
      const S = {};
      S.acts = {};
      ACT_KEYS.forEach(k => {
        const v = srcActs[k];
        S.acts[k] = (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.floor(v)) : 0;
      });
      return S.acts;
    }
    this.readActs = readActs;
  `;
  const ctx = { Math, isFinite, Object };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const r = ctx.readActs({ sit: 3, herb: 'x', train: -5, enlight: 10, ponder: 1.7, hacker: 999, __proto__x: 1 });
  assert.deepStrictEqual(Object.keys(r).sort(), ['enlight', 'herb', 'ponder', 'sit', 'train'],
    '只应有五个正式键');
  assert.strictEqual(r.sit, 3, '合法值保留');
  assert.strictEqual(r.herb, 0, '字符串归零');
  assert.strictEqual(r.train, 0, '负数归零');
  assert.strictEqual(r.enlight, 10);
  assert.strictEqual(r.ponder, 1, '小数取整');
  assert.strictEqual(r.hacker, undefined, '未知键必须被丢弃');
});
