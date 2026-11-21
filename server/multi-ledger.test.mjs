/* 联机结算幂等账 · 验收测试（第 123 轮，修第 117 轮独立审查 H1/H2）
 *
 * 真实调用 js/multi-ledger.js（require 真模块），不复制逻辑进测试。
 * 关键：L2/L3 两条用例在旧实现下会失败——旧的"只记最近一局"方案对 L3 的
 * 场景（A 局延迟重投）会返回"首次"，从而重复入账。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/* 服务器用 crypto.randomUUID()，测试必须用同格式的真实 runId（第 124 轮加了严格格式校验） */
const U = (n) => String(n).padStart(8, '0') + '-1111-4aaa-8bbb-' + String(n).padStart(12, '0');
const A = U(1), B = U(2), C = U(3);

test('L1 claim 首次为真、重复为假（H1/H2 的基础语义）', () => {
  const ML = require(path.join(ROOT, 'js/multi-ledger.js'));
  const S = {};
  assert.equal(ML.claim(S, A).first, true, '第一次见到该 runId 应入账');
  assert.equal(ML.claim(S, A).first, false, '同一 runId 再来必须判重');
  assert.equal(ML.claim(S, A).first, false, '反复投递仍然判重');
  assert.equal(ML.seen(S, A), true);
  assert.equal(ML.seen(S, B), false);
});

test('L2 第 N-1 局延迟重投不得重复入账（旧实现只记最近一局，此条会红）', () => {
  const ML = require(path.join(ROOT, 'js/multi-ledger.js'));
  const S = {};
  assert.equal(ML.claim(S, A).first, true, 'A 局先入账');
  assert.equal(ML.claim(S, B).first, true, 'B 局随后入账');
  /* SSE 重连把 A 局重投一次 —— 旧实现此时"最近一局"是 B，A 会被当新局 */
  assert.equal(ML.claim(S, A).first, false, 'A 局延迟重投必须仍被判重（H2）');
});

test('L2b runId 大小写必须归一（否则同一局会被当成两局）', () => {
  const ML = require(path.join(ROOT, 'js/multi-ledger.js'));
  const S = {};
  assert.equal(ML.claim(S, A).first, true);
  assert.equal(ML.claim(S, A.toUpperCase()).first, false, '大写形式必须判为同一局');
  assert.equal(ML.claim(S, '  ' + A + '  ').first, false, '前后空白不应绕过判重');
  assert.equal(S.multiCreditedRuns.length, 1, '归一后表里只应有一条');
});

test('L3 环形保留 64 局：最近的都记住，最旧的被淘汰', () => {
  const ML = require(path.join(ROOT, 'js/multi-ledger.js'));
  const S = {};
  for (let i = 0; i < ML.KEEP + 5; i++) ML.claim(S, U(100 + i));
  assert.equal(S.multiCreditedRuns.length, ML.KEEP, '表长度必须封顶在 KEEP，防存档膨胀');
  assert.equal(ML.seen(S, U(100)), false, '最旧的应被淘汰');
  assert.equal(ML.seen(S, U(100 + ML.KEEP + 4)), true, '最新的必须在表内');
  assert.equal(ML.seen(S, U(100 + 5)), true, '边界元素（第 64 新）应保留');
});

test('L4 脏存档清洗：非数组/重号/非字符串/超长/非 UUID 一律不可信', () => {
  const ML = require(path.join(ROOT, 'js/multi-ledger.js'));
  const S = { multiCreditedRuns: 'not-an-array' };
  assert.deepEqual(ML.hist(S), [], '非数组应清成空表');
  const S2 = { multiCreditedRuns: [A, A, 123, null, '', 'x'.repeat(5000), 'not-a-uuid', B] };
  assert.deepEqual(ML.hist(S2), [A, B], '去重并剔除非字符串/非 UUID/超长垃圾');
  const S3 = { multiCreditedRuns: undefined };
  assert.deepEqual(ML.hist(S3), []);
});

test('L4b 读档清洗也必须封顶 KEEP（否则一份被塞上万条合法 runId 的存档会整段进内存）', () => {
  const ML = require(path.join(ROOT, 'js/multi-ledger.js'));
  const big = [];
  for (let i = 0; i < 5000; i++) big.push(U(i));
  const S = { multiCreditedRuns: big };
  const h = ML.hist(S);
  assert.equal(h.length, ML.KEEP, 'hist 必须把表修剪到 KEEP 条，实得 ' + h.length);
  assert.equal(S.multiCreditedRuns.length, ML.KEEP, 'S 上的表也必须被就地修剪');
  assert.equal(ML.seen(S, U(0)), false, '最旧的应被丢掉');
  assert.equal(ML.seen(S, U(4999)), true, '最新的必须保留');
});

test('L5 模块自身绝不落盘（原子性的前提：只改内存，由调用方一次 save 写）', () => {
  const ML = require(path.join(ROOT, 'js/multi-ledger.js'));
  /* 把 localStorage 换成一碰就炸的陷阱：模块若自行持久化，这里必抛 */
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let touched = false;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { touched = true; throw new Error('MultiLedger 不得访问 localStorage'); }
  });
  try {
    const S = {};
    ML.claim(S, 'x1');
    ML.claim(S, 'x2');
    ML.hist(S);
    ML.seen(S, 'x1');
  } finally {
    if (desc) Object.defineProperty(globalThis, 'localStorage', desc);
    else delete globalThis.localStorage;
  }
  assert.equal(touched, false, 'claim/hist/seen 期间不得触碰 localStorage');
});

test('L6 无 state / 无 runId / 格式非法 的降级语义明确', () => {
  const ML = require(path.join(ROOT, 'js/multi-ledger.js'));
  assert.equal(ML.claim(null, A).first, false, '没有存档对象时不得声称可入账');
  assert.equal(ML.claim(null, A).reason, 'NO_STATE');
  const S = {};
  assert.equal(ML.claim(S, '').first, true, '无 runId 无法去重，交由服务器保证');
  assert.equal(ML.claim(S, '').reason, 'NO_RID');
  assert.equal(ML.claim(S, 'not-a-uuid').reason, 'NO_RID', '格式非法等同无 runId');
  assert.equal(S.multiCreditedRuns, undefined, '非法 id 不得写进幂等表');
});

test('L7 接线守卫：认领必须在"确认有我的奖励"之后，且 save() 紧跟认领', () => {
  const game = readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
  assert.ok(/ML\.claim(?:Settlement)?\(S,\s*rid(?:,\s*true)?\)/.test(game), 'game.js 结算必须调用 MultiLedger.claim(S, rid) / claimSettlement（正式结算走 strict 拒绝非法 runId）');
  assert.ok(/S\.multiCreditedRuns/.test(game), 'game.js 必须把幂等表读进主存档（load 里）');
  assert.ok(!/const dup = !!rid && multiCreditedRun\(\) === rid;/.test(game),
    '不得保留旧的"最近一局相等即判重"写法（H2）');
  /* 第 124 轮复核 E4：认领必须发生在 mine.stone > 0 判断之内，否则会误标记、丢掉补发的奖励 */
  const m = game.match(/ML\.claim(?:Settlement)?\(S,\s*rid/);
  const claimAt = m ? m.index : -1;
  const guardAt = game.indexOf('if(mine && mine.stone > 0){');
  assert.ok(guardAt > 0 && claimAt > guardAt, 'claim 必须在 "mine && mine.stone > 0" 分支内部（E4）');
  /* H1：奖励与幂等标记必须由同一次 save() 落盘，且 save 的失败要被检测到 */
  const saveAt = game.indexOf('if(!save())', claimAt);
  assert.ok(saveAt > claimAt, '认领之后必须紧跟一次受检测的 save()（失败要能发现）');
});

test('L8 页面必须先加载模块再加载 game.js（否则 window.MultiLedger 不存在）', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const ledger = html.indexOf('js/multi-ledger.js');
  const game = html.indexOf('src="js/game.js"');
  assert.ok(ledger > 0, 'index.html 必须引入 js/multi-ledger.js');
  assert.ok(game > 0, 'index.html 必须引入 js/game.js');
  assert.ok(ledger < game, 'multi-ledger.js 必须在 game.js 之前加载');
});

test('L9 hist 必须归一写回大写 UUID（ChatGPT #63 意见①：不能只在长度不变时返回原数组）', () => {
  const ML = require(path.join(ROOT, 'js/multi-ledger.js'));
  const S = { multiCreditedRuns: ['ABCDEF12-3456-7890-ABCD-EF1234567890'] }; // 合法但大写
  const h = ML.hist(S);
  assert.deepEqual(h, ['abcdef12-3456-7890-abcd-ef1234567890'], 'hist 必须返回小写归一形式');
  assert.deepEqual(S.multiCreditedRuns, ['abcdef12-3456-7890-abcd-ef1234567890'], '归一结果必须写回 S（不能只在长度变化时写回）');
  assert.equal(ML.seen(S, 'abcdef12-3456-7890-abcd-ef1234567890'), true, '小写查询应命中');
  assert.equal(ML.seen(S, 'ABCDEF12-3456-7890-ABCD-EF1234567890'), true, '大写形式也应命中（已归一）');
});

test('L10 claim strict：正式结算缺失/非法 runId 必须拒绝入账（ChatGPT #63 意见③）', () => {
  const ML = require(path.join(ROOT, 'js/multi-ledger.js'));
  // 非 strict 仍兼容旧语义（默认）：无 runId 视为首次
  const S = {};
  assert.equal(ML.claim(S, '').first, true, '非 strict 缺 runId 仍按旧语义 first:true');
  assert.equal(ML.claim(S, '').reason, 'NO_RID');
  // strict：正式结算必须拒绝
  const S2 = {};
  assert.equal(ML.claim(S2, '', true).first, false, 'strict 缺 runId 拒绝入账');
  assert.equal(ML.claim(S2, '', true).reason, 'REJECT_NO_RID');
  assert.equal(ML.claim(S2, 'not-a-uuid', true).reason, 'REJECT_NO_RID', 'strict 非法 UUID 拒绝入账');
  assert.equal(S2.multiCreditedRuns, undefined, 'strict 拒绝时不得写进幂等表');
  // strict 下合法 runId 正常认领
  const S3 = {};
  assert.equal(ML.claim(S3, A, true).first, true, 'strict 合法 runId 正常认领');
  assert.equal(ML.claim(S3, A, true).first, false, 'strict 重复判重');
});

test('L11 结算判定 fail-closed：ML 缺失时拒绝入账（ChatGPT #63 收口①）', () => {
  const ML = require(path.join(ROOT, 'js/multi-ledger.js'));
  // 正常挂载：委托 strict 认领（合法 runId 入账、缺失/非法 runId 拒绝）
  const S0 = {};
  assert.equal(ML.claimSettlement(S0, A).first, true, 'ML 正常挂载时合法 runId 正常认领');
  const S1 = {};
  assert.equal(ML.claimSettlement(S1, '').first, false, 'ML 正常挂载时缺失 runId 拒绝入账（strict）');
  assert.equal(ML.claimSettlement(S1, '').reason, 'REJECT_NO_RID');
  // 异常态：MultiLedger 全局未挂载 → 一律拒绝入账（fail-closed），不再退回会放行非法/缺失 runId 的旧逻辑
  const saved = globalThis.MultiLedger;
  delete globalThis.MultiLedger;
  try {
    const S2 = {};
    const r2 = ML.claimSettlement(S2, 'whatever-rid');
    assert.equal(r2.first, false, 'ML 缺失时结算必须 fail-closed 拒绝入账');
    assert.equal(r2.reason, 'LEDGER_UNAVAILABLE');
    const S3 = {};
    const r3 = ML.claimSettlement(S3, '');   // 缺失 runId 也拒绝
    assert.equal(r3.first, false);
    assert.equal(S2.multiCreditedRuns, undefined, 'fail-closed 拒绝时不得写进幂等表');
  } finally {
    globalThis.MultiLedger = saved;
  }
});

