/* D-004 P0/P1 修复专项验证（真实执行真实代码，不 mock）
 *
 * 目的：GPT 独立审查判定「需修改后交付」，列出 P0 五项。本文件逐条验证修复真的生效，
 * 而不是只看源码里"写了这么一句"。
 *
 * 手法：把 js/game.js 里**目标函数的真实源码**抽出来，在 node:vm 里配最小上下文执行，
 * 断言行为。这样测的是真代码，不是我另写一份等价的假代码。
 *
 * 运行：node --test tools/d004-audit-fixes.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');

/* 从源码里截取一个具名函数的完整文本（按大括号配平） */
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

/* ------------------------------------------------------------------ */
/* P0-1 loopSafe / tickLoop 双层错误隔离                               */
/* ------------------------------------------------------------------ */
test('P0-1: loopSafe 吞掉子系统异常但返回 undefined，不影响后续', () => {
  const code = extractFn('loopSafe');
  const ctx = { console: { error(){} } };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.out = [];', ctx);
  const r1 = ctx.loopSafe('boom', () => { throw new Error('x'); });
  ctx.loopSafe('ok', () => 42);
  assert.strictEqual(r1, undefined, '异常子系统应返回 undefined 而不是抛出');
});

test('P0-1: tickLoop 外层 finally 保证循环头炸了也尝试 save', () => {
  const code = extractFn('tickLoop');
  // 构造最小上下文：tickLoopBody 抛错、save 必须被调用
  let saved = 0;
  const ctx = {
    console: { error(){} },
    Date,
    lastSave: 0,
    save(){ saved++; return true; },
    tickLoopBody(){ throw new Error('offlineCapSec boom'); },
    tickLoop: null,
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.tickLoop = tickLoop;', ctx);
  ctx.tickLoop();
  assert.strictEqual(saved, 1, '循环体整段抛错时，finally 仍必须落盘一次');
});

test('P0-1: save 失败时 lastSave 不推进（否则节流会一直空转）', () => {
  const code = extractFn('tickLoop');
  let saved = 0;
  const ctx = {
    console: { error(){} },
    Date,
    lastSave: 0,
    save(){ saved++; return false; },   // 写盘失败
    tickLoopBody(){},
    tickLoop: null,
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.tickLoop = tickLoop;', ctx);
  ctx.tickLoop();
  assert.strictEqual(saved, 1);
  assert.strictEqual(ctx.lastSave, 0, 'save 返回 false 时不得推进 lastSave');
});

/* ------------------------------------------------------------------ */
/* P0-3 读档背包上限要容纳转世收回的三槽装备                            */
/* ------------------------------------------------------------------ */
test('P0-3: load 的背包截断上限 = bagMaxCap + EQUIP_SLOTS.length', () => {
  const line = SRC.match(/if\(Array\.isArray\(o\.bag\)\) S\.bag = o\.bag\.filter\([^\n]*\n?/);
  assert.ok(line, '必须能找到背包装载行');
  assert.match(line[0], /slice\(0, bagMaxCap\(\) \+ EQUIP_SLOTS\.length\)/,
    '转世收回的三槽装备不得被读档截断（旧写法 slice(0, bagMaxCap()) 会丢）');
});

test('P0-3: renderBag 用 Math.max(cap, S.bag.length) 保证超容可见', () => {
  const fn = extractFn('renderBag');
  assert.match(fn, /Math\.max\(cap, S\.bag\.length\)/,
    '超容物品必须仍能显示，否则玩家看不到"还在包里"');
});

/* ------------------------------------------------------------------ */
/* P0-2 存档损坏保护闸门                                               */
/* ------------------------------------------------------------------ */
test('P0-2: save() 在 saveBlocked 时拒绝写盘', () => {
  const fn = extractFn('save');
  assert.match(fn, /if\(saveBlocked\) return false/, '损坏保护必须拦住写盘');
});

test('P0-2: load 的 catch 只有在读到 raw 时才置 saveBlocked', () => {
  const fn = extractFn('load');
  assert.match(fn, /if\(raw\)\{[\s\S]{0,200}saveBlocked = true/,
    '只有"确实读到过内容"才进保护模式，真无存档仍要能创角');
});

test('P0-2: boot 在 saveBlocked 时不弹创角', () => {
  const idx = SRC.indexOf('const had = load();');
  assert.ok(idx > 0);
  const seg = SRC.slice(idx, idx + 800);
  assert.match(seg, /if\(saveBlocked\)/, 'boot 必须识别保护模式');
  assert.match(seg, /finishBoot\(\);\s*return;/, '保护模式不得继续走创角分支');
});

/* ------------------------------------------------------------------ */
/* P0-5 导入冻结期必须出声                                             */
/* ------------------------------------------------------------------ */
test('P0-5: frozenForImport 时调用提示而不是静默 return', () => {
  const fn = extractFn('save');
  assert.match(fn, /if\(frozenForImport\)\{ reportFrozenNoSave\(\); return false; \}/,
    '静默丢进度必须改成显式提示');
});

/* ------------------------------------------------------------------ */
/* P1-1 物品游标按对象身份定位                                         */
/* ------------------------------------------------------------------ */
test('P1-1: 委托处理器用 S.bag.indexOf(cur) 重新定位', () => {
  const idx = SRC.indexOf("const act = b.dataset.do;");
  const seg = SRC.slice(idx, idx + 900);
  assert.match(seg, /const curIdx = S\.bag\.indexOf\(cur\)/,
    '不得信任打开详情时的旧下标');
  assert.match(seg, /if\(curIdx < 0\)\{/, '物品已不在背包时必须放弃操作');
});

test('P1-1: closeItemDetail 清空游标', () => {
  const fn = extractFn('closeItemDetail');
  assert.match(fn, /itemCurIt = null;/);
  assert.doesNotMatch(fn, /itemCurIdx/, '下标游标已删除（只保留对象引用，避免误以为还有索引快照）');
});

/* ------------------------------------------------------------------ */
/* P0-4 数字白名单负值钳制                                             */
/* ------------------------------------------------------------------ */
test('P0-4: load 对存量类字段做 Math.max(0,...) 钳制', () => {
  const fn = extractFn('load');
  assert.match(fn, /'exp','stone','herb','ore','wisdom'/, '存量类字段必须点名');
  assert.match(fn, /Math\.max\(0, S\[k\]\)/, '必须真的钳到 0');
  assert.match(fn, /'dao'/, 'dao 必须在内（为负会让 expRate 变负 → 挂机倒退）');
});

/* ------------------------------------------------------------------ */
/* P1-4 词条读档去重                                                   */
/* ------------------------------------------------------------------ */
test('P1-4: S.affix 读档按 id 去重（与 rollAffix 同口径）', () => {
  const fn = extractFn('load');
  assert.match(fn, /const used = \{\};/, '必须具备去重集合');
  assert.match(fn, /used\[x\.id\]/, '重复 id 必须被跳过');
});

/* ------------------------------------------------------------------ */
/* 转世装备守恒（P0-3 的另一半）                                        */
/* ------------------------------------------------------------------ */
test('P0-3: startNewLife 把三槽全部搬进背包，且不单独 push relic', () => {
  const fn = extractFn('startNewLife');
  assert.match(fn, /const slotItems = \[\];/, '必须先收集三槽');
  assert.match(fn, /slotItems\.forEach\(id => \{[\s\S]{0,80}S\.bag\.push/, '三槽必须全部回收');
  assert.doesNotMatch(fn, /S\.bag\.splice\(bi, 1\)/,
    '旧的"先摘遗物再 push"往返会净丢一件，必须消失');
});

/* ------------------------------------------------------------------ */
/* resetAll 侧车状态清理（P1-2 部分）                                  */
/* ------------------------------------------------------------------ */
test('P1-2: resetAll 清 multiWins / multiCreditedRuns / NpcMemory / 毁档备份', () => {
  const fn = extractFn('resetAll');
  assert.match(fn, /S\.multiWins = 0; S\.multiCreditedRuns = \[\];/);
  assert.match(fn, /NpcMemory\._reset/, 'NPC 记忆库是独立键，必须单独清');
  assert.match(fn, /removeItem\('xiuxian_save_corrupt'\)/, '玩家明确清档时应删掉毁档备份');
  assert.match(fn, /saveBlocked = false/, '玩家主动重开应解除保护闸门');
});

/* ================================================================== */
/* 第二轮复审（GPT）新增四项门禁                                        */
/* ================================================================== */

test('P0-2b: getItem() 抛异常时无条件进保护（不能靠 if(raw) 判断）', () => {
  const fn = extractFn('load');
  // 必须存在一个只包 getItem 的 try/catch，且 catch 里直接置 saveBlocked 并 return
  const m = fn.match(/try\{\s*raw = localStorage\.getItem\(SAVE_KEY\);\s*\}\s*catch\(e\)\{[\s\S]{0,300}?saveBlocked = true;[\s\S]{0,200}?return false;/);
  assert.ok(m, '读取阶段就要有独立的 try/catch 并直接置 saveBlocked —— 此时 raw 仍是 null，if(raw) 挡不住');
});

test('P0-4b: 数字钳制不再使用 32 位位运算 |0（会溢出）', () => {
  const fn = extractFn('load');
  const clampSeg = fn.slice(fn.indexOf('数字字段的合法性分三层处理'));
  assert.ok(clampSeg.length > 0, '必须能找到钳制段');
  assert.match(clampSeg, /Math\.floor\(v\)/, '必须用 Math.floor 取整');
  assert.doesNotMatch(clampSeg.slice(0, clampSeg.indexOf('if(typeof S.name')), /\|\s*0\)/,
    '钳制段不得再用 x|0（2147483648|0 会变负数）');
});

test('P0-4b: 存在带业务上限的 CAPS 表，且覆盖 rank/rootIdx/weapon/bagSize', () => {
  const fn = extractFn('load');
  const m = fn.match(/const CAPS = \{[\s\S]*?\};/);
  assert.ok(m, '必须有上限表');
  ['rank', 'rootIdx', 'weapon', 'bagSize', 'petSlots', 'dao'].forEach(k => {
    assert.match(m[0], new RegExp(k + ':'), '上限表必须覆盖 ' + k);
  });
  assert.match(fn, /Math\.min\(cap, Math\.floor\(v\)\)/, '必须真的夹上限');
});

test('P0-4b: 非数字字段（name/log/bag）形状也要挡', () => {
  const fn = extractFn('load');
  assert.match(fn, /if\(typeof S\.name !== 'string'\) S\.name = '';/);
  assert.match(fn, /if\(!Array\.isArray\(S\.log\)\) S\.log = \[\];/);
  assert.match(fn, /if\(!Array\.isArray\(S\.bag\)\) S\.bag = \[\];/);
});

test('P0-5b: 导入冻结有常驻横幅（不是只有一次性 toast）', () => {
  const banner = extractFn('frozenBannerShow');
  assert.match(banner, /createElement\('div'\)/, '必须真的创建一个 DOM 节点');
  assert.match(banner, /frozen-banner/, '必须有稳定 id（也用于幂等判断）');
  assert.match(banner, /position:fixed/, '必须固定在视口上，玩家不可能"没看见"');
  const report = extractFn('reportFrozenNoSave');
  assert.match(report, /frozenBannerShow\(\);\s*\n\s*if\(frozenWarned\) return;/,
    '横幅必须**每次**都挂，不能被"只提醒一次"挡住');
});

test('P0-5b: 导入成功立刻显示横幅（不等第一次 save）', () => {
  const idx = SRC.indexOf('function applySaveText');
  const seg = SRC.slice(idx, idx + 1200);
  assert.match(seg, /frozenBannerShow\(\);/, '写入主键成功后应立即挂横幅');
});

test('P0-5b: 离开页面时尽力提醒（beforeunload）', () => {
  assert.match(SRC, /addEventListener\('beforeunload'[\s\S]{0,300}?frozenForImport/,
    '冻结期离开页面要有一次拦截提醒');
});

/* ================================================================== */
/* 第三轮复审：仅剩的两个阻断项                                        */
/* ================================================================== */

test('P0-4c: safeTs 拦住非数字/NaN/Infinity/过早/未来时间戳', () => {
  const code = extractFn('safeTs');
  const tsMin = SRC.match(/const TS_MIN = (\d+);/)[1];
  const ctx = { Date, isFinite, TS_MIN: Number(tsMin) };
  vm.createContext(ctx);
  vm.runInContext(code + '\nthis.safeTs = safeTs;', ctx);
  const FB = 1700000000000;
  const now = Date.now();
  // 脏值一律回落
  assert.strictEqual(ctx.safeTs('abc', FB), FB, '字符串必须回落');
  assert.strictEqual(ctx.safeTs(NaN, FB), FB, 'NaN 必须回落');
  assert.strictEqual(ctx.safeTs(Infinity, FB), FB, 'Infinity 必须回落');
  assert.strictEqual(ctx.safeTs(null, FB), FB, 'null 必须回落');
  assert.strictEqual(ctx.safeTs(undefined, FB), FB, 'undefined 必须回落');
  assert.strictEqual(ctx.safeTs(0, FB), FB, '0（1970）早于下限，必须回落');
  assert.strictEqual(ctx.safeTs(now + 86400000 * 3, FB), FB, '跑到未来三天，必须回落');
  // 合法值原样保留
  const good = now - 3600000;
  assert.strictEqual(ctx.safeTs(good, FB), good, '合法历史时间戳必须原样保留');
});

test('P0-4c: load 里 last 走 safeTs（不再裸取 o.last）', () => {
  const fn = extractFn('load');
  assert.match(fn, /S\.last = safeTs\(o\.last, Date\.now\(\)\);/, '必须走校验');
  assert.doesNotMatch(fn, /S\.last = o\.last \|\| Date\.now\(\)/, '裸取写法必须消失');
});

test('P0-2c: 备份键写失败时原文仍留在内存（corruptRawCache）', () => {
  const fn = extractFn('load');
  assert.match(fn, /corruptRawCache = raw;/, '备份失败也要把原文暂存到内存');
  assert.match(fn, /备份也失败——原文暂存在内存/, '日志要说清原文在哪');
});

test('P0-2c: 取回入口优先备份键、其次内存缓存，都没有时明说没有', () => {
  const fn = extractFn('recoverCorruptSave');
  assert.match(fn, /localStorage\.getItem\('xiuxian_save_corrupt'\)/);
  assert.match(fn, /if\(!txt\) txt = corruptRawCache \|\| '';/, '必须回落到内存缓存');
  assert.match(fn, /没有可取回的原文/, '都没有时必须明说，不能给假入口');
});

test('P0-2c: 设置页三种状态分别给不同说明（本次原文/历史备份/都没有）', () => {
  const fn = extractFn('renderSaveCurrent');
  assert.match(fn, /本次读档失败/, '本次原文态必须点明"本次"');
  assert.match(fn, /仍暂存在本页内存里/, '仅内存态必须提示"刷新即丢"');
  assert.match(fn, /历史.*自动备份/, '历史备份要单独说清是哪一份');
  assert.match(fn, /没有留下可恢复的原文/, '都没有时必须说明');
});

test('P0-2c: boot 在仅内存态时额外警告"刷新前务必导出"', () => {
  const idx = SRC.indexOf('if(saveBlocked){\n        needNewGame = false;');
  assert.ok(idx > 0, '必须能定位 boot 的保护分支');
  const seg = SRC.slice(idx, idx + 700);
  assert.match(seg, /corruptRawCache \?/, '必须按是否有内存原文给不同措辞');
  assert.match(seg, /刷新前务必导出/, '必须提示时限');
});
