/* server/k11-trade.test.mjs —— K11 真实跨玩家交易首轮 MVP 专项（2026-11-11）
 *
 * 纪律：单测用 TradeDesk + 本地 mock wallet（语义与 server 注入的 profiles.addStones 一致），
 *       覆盖 K11-1~7；HTTP 部分验证路由接线、token 鉴权与错误路径。
 * 已知边界（如实登记）：物品注册端点属 P2 切片、不在 MVP（K11_TASK_ORDER_20261111.md 明确排除），
 *       故「挂单→购买→余额变更」的成功全链路以单测（mock wallet 镜像 addStones 语义）覆盖；
 *       HTTP 成功路径需先有物品在账本中，留待物品注册接口落地后补真 HTTP 端到端。
 *
 * 运行：node --test server/k11-trade.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import { AssetLedger, STATUS } from './asset-ledger.mjs';
import { TradeDesk } from './k11-trade.mjs';

/* —— 本地 wallet，语义镜像 profiles.addStones（debit 不足抛错、整体不改动） —— */
class MockWallet {
  constructor(balances = {}) { this.b = { ...balances }; }
  balance(t) { return this.b[t] || 0; }
  debit(t, amt) { if ((this.b[t] || 0) < amt) throw new Error('灵石不足'); this.b[t] -= amt; }
  credit(t, amt) { this.b[t] = (this.b[t] || 0) + amt; }
}

function newDesk(balances) {
  const ledger = new AssetLedger();
  ledger.register('item-1', 'seller', 1);
  const desk = new TradeDesk(ledger, new MockWallet(balances));
  return { ledger, desk };
}

/* K11-1：挂单成功 → 物品 LISTED、listings 可见、灵石未动 */
test('K11-1 consign 成功：物品 LISTED、listings 可见、灵石未动', () => {
  const { ledger, desk } = newDesk({ seller: 0, buyer: 100 });
  const l = desk.consign('item-1', 'seller', 50);
  assert.equal(l.status, 'open');
  assert.equal(ledger.query('item-1').status, STATUS.LISTED);
  assert.equal(desk.listings().length, 1);
  assert.equal(desk.listings()[0].price, 50);
  // 灵石未动
  assert.equal(desk.wallet.balance('seller'), 0);
  assert.equal(desk.wallet.balance('buyer'), 100);
});

/* K11-2：购买成功 → 买家-价、卖家+价、物品归属买家、item TRADED、listing CLOSED */
test('K11-2 buy 成功：余额变更 + 物品转移 + 挂单关闭', () => {
  const { ledger, desk } = newDesk({ seller: 0, buyer: 100 });
  const l = desk.consign('item-1', 'seller', 50);
  const { result } = desk.buy(l.listingId, 'buyer', 'idem-1');
  assert.equal(desk.wallet.balance('buyer'), 50);   // 100 - 50
  assert.equal(desk.wallet.balance('seller'), 50);  // 0 + 50
  assert.equal(ledger.query('item-1').ownerToken, 'buyer');
  assert.equal(ledger.query('item-1').status, STATUS.TRADED);
  assert.equal(result.price, 50);
  assert.equal(desk.listings().length, 0); // 已成交，不在售
});

/* K11-3：幂等 → 同 idempotencyId 重复购买只成交一次（不双扣/不双转） */
test('K11-3 幂等：同 idempotencyId 重复购买只生效一次', () => {
  const { ledger, desk } = newDesk({ seller: 0, buyer: 100 });
  const l = desk.consign('item-1', 'seller', 50);
  const a = desk.buy(l.listingId, 'buyer', 'idem-x');
  const b = desk.buy(l.listingId, 'buyer', 'idem-x'); // 重复
  assert.equal(a.replayed, false);
  assert.equal(b.replayed, true);
  assert.equal(desk.wallet.balance('buyer'), 50); // 只扣一次
  assert.equal(ledger.query('item-1').ownerToken, 'buyer');
});

/* K11-4：余额不足 → 购买被拒，账本与余额不变 */
test('K11-4 余额不足：购买被拒且不改账', () => {
  const { ledger, desk } = newDesk({ seller: 0, buyer: 30 }); // 不够 50
  const l = desk.consign('item-1', 'seller', 50);
  assert.throws(() => desk.buy(l.listingId, 'buyer', 'idem-2'), /灵石不足/);
  assert.equal(desk.wallet.balance('buyer'), 30); // 未扣
  assert.equal(ledger.query('item-1').ownerToken, 'seller'); // 未转
  assert.equal(desk.listings().length, 1); // 挂单仍在
});

/* K11-5：并发 → 同一挂单多次购买至多成交一次，其余被拒 */
test('K11-5 并发购买同挂单：至多一次成交', () => {
  const { ledger, desk } = newDesk({ seller: 0, buyer: 500 });
  const l = desk.consign('item-1', 'seller', 50);
  const r1 = desk.buy(l.listingId, 'buyer', 'idem-a'); // 第一次成功
  assert.equal(r1.replayed, false);
  assert.throws(() => desk.buy(l.listingId, 'buyer', 'idem-b'), /不可购买/); // 已成交
  assert.throws(() => desk.buy(l.listingId, 'buyer', 'idem-c'), /不可购买/);
  assert.equal(desk.wallet.balance('buyer'), 450);
  assert.equal(ledger.query('item-1').ownerToken, 'buyer');
});

/* K11-6：撤单 → 未成交前撤单，物品 IDLE、listing CANCELLED、不可再购 */
test('K11-6 撤单：物品回 IDLE、挂单关闭、不可再购', () => {
  const { ledger, desk } = newDesk({ seller: 0, buyer: 100 });
  const l = desk.consign('item-1', 'seller', 50);
  const c = desk.cancel(l.listingId, 'seller');
  assert.equal(c.status, 'cancelled');
  assert.equal(ledger.query('item-1').status, STATUS.IDLE);
  assert.equal(desk.listings().length, 0);
  assert.throws(() => desk.buy(l.listingId, 'buyer', 'idem-3'), /不可购买/);
});

/* K11-7：越界拒绝 */
test('K11-7 越界：物品不存在/非持有人挂单/非持有人撤单一律拒绝', () => {
  const { ledger, desk } = newDesk({ seller: 0, buyer: 100 });
  assert.throws(() => desk.consign('nope', 'seller', 50), /物品不存在/);
  const l = desk.consign('item-1', 'seller', 50);
  assert.throws(() => desk.consign('item-1', 'buyer', 50), /只有持有人能挂单/);
  assert.throws(() => desk.cancel(l.listingId, 'buyer'), /只有挂单方能撤单/);
  assert.throws(() => desk.buy('bad', 'buyer', 'idem-9'), /挂单不存在/);
});

/* K11-8（P0-4）：幂等键绑定请求身份——不同买家复用同一客户幂等 ID 不会串结果 */
test('K11-8 幂等键绑定身份：不同买家复用同客户 ID 各自独立成交', () => {
  const ledger = new AssetLedger();
  ledger.register('item-a', 'sellerA', 1);
  ledger.register('item-b', 'sellerB', 1);
  const desk = new TradeDesk(ledger, new MockWallet({ sellerA: 0, sellerB: 0, buyerA: 500, buyerB: 500 }));
  const la = desk.consign('item-a', 'sellerA', 50);
  const lb = desk.consign('item-b', 'sellerB', 50);
  const ra = desk.buy(la.listingId, 'buyerA', 'same-idem');
  assert.equal(ra.replayed, false);
  // buyerB 用同一客户幂等 ID 买不同挂单：不应重放 buyerA 的成交，应独立成交
  const rb = desk.buy(lb.listingId, 'buyerB', 'same-idem');
  assert.equal(rb.replayed, false);
  assert.equal(desk.wallet.balance('buyerA'), 450);
  assert.equal(desk.wallet.balance('buyerB'), 450);
  assert.equal(ledger.query('item-a').ownerToken, 'buyerA');
  assert.equal(ledger.query('item-b').ownerToken, 'buyerB');
});

/* K11-9（P1-1）：严格整数校验——小数/负数/0 价格与数量被拒 */
test('K11-9 严格整数校验：非正整数价格/数量被拒', () => {
  const { ledger, desk } = newDesk({ seller: 0, buyer: 100 });
  assert.throws(() => desk.consign('item-1', 'seller', 1.5), /价格必须为正整数/);
  assert.throws(() => desk.consign('item-1', 'seller', -5), /价格必须为正整数/);
  assert.throws(() => desk.consign('item-1', 'seller', 0), /价格必须为正整数/);
  assert.throws(() => desk.consign('item-1', 'seller', 50, 0), /数量必须为正整数/);
  assert.throws(() => desk.consign('item-1', 'seller', 50, 1.5), /数量必须为正整数/);
  assert.throws(() => desk.consign('item-1', 'seller', 50, -3), /数量必须为正整数/);
});

/* K11-9b（P1-1 严格类型）：价格/数量必须为 JSON 数字，字符串数字被拒 */
test('K11-9b 严格类型：字符串型价格/数量被拒', () => {
  const { ledger, desk } = newDesk({ seller: 0, buyer: 100 });
  assert.throws(() => desk.consign('item-1', 'seller', '50'), /价格必须为正整数/);
  assert.throws(() => desk.consign('item-1', 'seller', 50, '1'), /数量必须为正整数/);
  assert.throws(() => desk.consign('item-1', 'seller', null), /价格必须为正整数/);
  assert.throws(() => desk.consign('item-1', 'seller', undefined), /价格必须为正整数/);
});

/* K11-10（P0-2/P0-3）：卖家里程碑入账失败 → 全额回滚（买家退款、物品回卖家、挂单可重试），
   且同幂等 ID 重试只生效一次（无双扣/无免费物品）。 */
class FlakyWallet extends MockWallet {
  constructor(balances, failFirstSellerCredit) { super(balances); this._failCredit = failFirstSellerCredit; }
  credit(t, amt) {
    if (t === 'seller' && this._failCredit) { this._failCredit = false; throw new Error('模拟首次入账失败'); }
    return super.credit(t, amt);
  }
}
test('K11-10 失败原子回滚：入账异常后一致态可重试，不双扣不免费物品', () => {
  const ledger = new AssetLedger();
  ledger.register('item-1', 'seller', 1);
  const desk = new TradeDesk(ledger, new FlakyWallet({ seller: 0, buyer: 100 }, true));
  const l = desk.consign('item-1', 'seller', 50);
  assert.throws(() => desk.buy(l.listingId, 'buyer', 'idem-f'), /模拟首次入账失败/);
  // 失败后一致态：买家已退款、物品回卖家并重新锁定、挂单仍在售
  assert.equal(desk.wallet.balance('buyer'), 100, '买家应被全额退款');
  assert.equal(ledger.query('item-1').ownerToken, 'seller');
  assert.equal(ledger.query('item-1').status, STATUS.LISTED, '物品应重新锁定回 LISTED');
  assert.equal(l.status, 'open', '挂单应回到 open 可重试');
  assert.equal(desk.listings().length, 1);
  // 同幂等 ID 重试（首次未登记 → 真实重试）成功，仅扣一次
  const r = desk.buy(l.listingId, 'buyer', 'idem-f');
  assert.equal(r.replayed, false);
  assert.equal(desk.wallet.balance('buyer'), 50);
  assert.equal(desk.wallet.balance('seller'), 50);
  assert.equal(ledger.query('item-1').ownerToken, 'buyer');
});

/* K11-11（P1-3）：幂等记录容量受控——超过上限自动回收最旧记录，不无限增长 */
test('K11-11 幂等记录容量受控：超限自动回收最旧键（真实 LRU）', () => {
  const { ledger, desk } = newDesk({ seller: 0, buyer: 5000 });
  for (let i = 0; i < 6000; i++) desk._idemAdd('k' + i, { n: i });
  assert.equal(desk._idem.has('k0'), false, '最旧键应已被回收');
  assert.equal(desk._idem.has('k5999'), true, '最新键应保留');
  assert.ok(desk._idem.size <= 5000, '幂等记录应被裁剪到上限内，实际 ' + desk._idem.size);
});

/* ===================== R1 / P0-3：补偿一致性（核心阻断项） ===================== */
/* 故障注入钱包：卖家"扣回"步骤（补偿逆操作）抛错，模拟资金补偿失败 */
class SellerDebitFails extends MockWallet {
  debit(t, amt) {
    if (t === 'seller') throw new Error('模拟卖家扣回失败');
    return super.debit(t, amt);
  }
}
/* 故障注入账本：物品转移恒失败（卖家已入账、买家已扣款后触发补偿） */
class FailingTransferLedger extends AssetLedger {
  transfer() { throw new Error('模拟物品转移失败'); }
}
/* 故障注入钱包：买家扣款"先改余额后抛错"，模拟部分写入后异常 */
class PartialDebitWallet extends MockWallet {
  constructor(balances, failFirst) { super(balances); this._fail = failFirst; }
  debit(t, amt) {
    if (t === 'buyer' && this._fail) { this._fail = false; this.b[t] = (this.b[t] || 0) - amt; throw new Error('模拟买家扣款部分写入后失败'); }
    return super.debit(t, amt);
  }
}

/* K11-12（R1）：卖家扣回补偿失败 → 资金未恢复一致 → 挂单进入 failed，绝不重新开放（防卖家凭空得利+二次出售） */
test('K11-12 补偿失败不重开：卖家扣回失败时挂单进入 failed 且卖家余额未回退', () => {
  const ledger = new FailingTransferLedger();
  ledger.register('item-1', 'seller', 1);
  const desk = new TradeDesk(ledger, new SellerDebitFails({ seller: 0, buyer: 100 }));
  const l = desk.consign('item-1', 'seller', 50);
  assert.throws(() => desk.buy(l.listingId, 'buyer', 'idem-r1'), /模拟物品转移失败/);
  // 补偿后：买家已退款(100)，但卖家扣回失败→卖家仍持 50，资金不一致
  const L = desk._listings.get(l.listingId); // 必须查内部记录（consign 返回的是副本）
  assert.equal(desk.wallet.balance('buyer'), 100, '买家应被全额退款');
  assert.equal(desk.wallet.balance('seller'), 50, '卖家扣回失败→仍持有 50（暴露给人工核账）');
  assert.equal(L.status, 'failed', '挂单必须进入 failed，绝不重新开放');
  assert.ok(L.failReason && typeof L.failReason === 'string', 'failed 应携带可审计故障原因');
  assert.equal(L.failAudit.allUndosOk, false, 'failAudit 应记录补偿未全部成功');
  assert.equal(desk.listings().length, 0, 'failed 挂单不可在售、不可被二次购买');
  // 即便攻击者重试同挂单，也因 failed 态而拒绝（绝不重新开放）
  assert.throws(() => desk.buy(l.listingId, 'buyer', 'idem-r1-retry'), /已失败|不可购买/);
});

/* K11-13（R1）：扣款"先改余额后抛错"的极端故障 → 余额守卫补偿正确全额回滚 → 挂单可安全重试 */
test('K11-13 部分写入后异常：余额守卫补偿使资金完全恢复，挂单回到 open', () => {
  const { ledger, desk } = newDesk({ seller: 0, buyer: 100 });
  // 用 PartialDebitWallet 替换内部 wallet（failFirst=true：首次买家扣款先改余额后抛错）
  desk.wallet = new PartialDebitWallet({ seller: 0, buyer: 100 }, true);
  const l = desk.consign('item-1', 'seller', 50);
  assert.throws(() => desk.buy(l.listingId, 'buyer', 'idem-r2'), /模拟买家扣款部分写入后失败/);
  assert.equal(desk.wallet.balance('buyer'), 100, '买家余额应完全恢复');
  assert.equal(desk.wallet.balance('seller'), 0, '卖家余额应未变');
  const L = desk._listings.get(l.listingId);
  assert.equal(ledger.query('item-1').ownerToken, 'seller', '物品仍归卖家');
  assert.equal(ledger.query('item-1').status, STATUS.LISTED, '物品应重新锁定回 LISTED');
  assert.equal(L.status, 'open', '资金与物品均恢复→允许重试');
  // 真实重试成功
  const r = desk.buy(l.listingId, 'buyer', 'idem-r2');
  assert.equal(r.replayed, false);
  assert.equal(desk.wallet.balance('buyer'), 50);
  assert.equal(desk.wallet.balance('seller'), 50);
});

/* ===================== R2 / P1-3：容量边界 ===================== */
test('K11-14 总容量边界：挂单总数严格 ≤ MAX_LISTINGS(1000)，超限回收最旧非在售记录', () => {
  const ledger = new AssetLedger();
  const desk = new TradeDesk(ledger, new MockWallet({ seller: 0, buyer: 100000 }));
  // 注册 1200 件并全部成交 → 累计 1200 条 closed 记录
  for (let i = 0; i < 1200; i++) {
    ledger.register('cap-' + i, 'seller', 1);
    const l = desk.consign('cap-' + i, 'seller', 1);
    desk.buy(l.listingId, 'buyer', 'idem-cap-' + i);
  }
  assert.equal(desk._listings.size, 1000, '挂单总容量必须严格 ≤ 1000，实际 ' + desk._listings.size);
});

test('K11-14b 在售容量与全满拒绝：open 达 500 拒挂；全为非 evictable 时拒挂', () => {
  const ledger = new AssetLedger();
  const desk = new TradeDesk(ledger, new MockWallet({ seller: 0 }));
  for (let i = 0; i < 500; i++) ledger.register('act-' + i, 'seller', 1);
  let ok = 0, rej = 0;
  for (let i = 0; i < 500; i++) { try { desk.consign('act-' + i, 'seller', 1); ok++; } catch { rej++; } }
  assert.equal(ok, 500);
  ledger.register('act-over', 'seller', 1);
  assert.throws(() => desk.consign('act-over', 'seller', 1), /在售挂单已达上限/);
});

/* ===================== R4 / P1-2：部分数量出售的真实归属 ===================== */
test('K11-15 部分数量出售：挂 3/10，买 3 后整栈归属买家、剩余 7 归买家持有', () => {
  const ledger = new AssetLedger();
  ledger.register('stack-1', 'seller', 10);
  const desk = new TradeDesk(ledger, new MockWallet({ seller: 0, buyer: 100 }));
  const l = desk.consign('stack-1', 'seller', 50, 3); // 挂 3 件，单价 50
  assert.equal(l.qty, 3);
  const { result } = desk.buy(l.listingId, 'buyer', 'idem-stack');
  const it = ledger.query('stack-1');
  assert.equal(it.ownerToken, 'buyer', '整栈归属应转给买家');
  assert.equal(it.qty, 7, '剩余数量应为 7');
  assert.equal(it.status, STATUS.IDLE, '仍有余量，状态 IDLE');
  assert.equal(desk.wallet.balance('buyer'), 50);
  assert.equal(desk.wallet.balance('seller'), 50);
});

/* ===================== HTTP 接线与鉴权（错误路径，因物品注册端点属 P2 切片） ===================== */
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = 9013;
const BASE = 'http://127.0.0.1:' + PORT;
let child = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uniq = p => (p + '_' + Math.random().toString(36).slice(2, 8)).slice(0, 12);
function post(p, body) {
  return fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  }).then(r => r.json());
}
function get(p) {
  return fetch(BASE + p).then(r => r.json());
}

before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    env: {
      ...process.env,
      SERVER_PORT: String(PORT),
      SERVER_PROFILE_MODE: 'enforce',
      SERVER_OFFLINE_KICK_MS: '60000',
      SERVER_SETTLE_HOLD_MS: '50',
      SERVER_TEST_MODE: '1'
    },
    stdio: 'ignore'
  });
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      const j = await r.json();
      if (j.ok) return;
    } catch { /* 未起 */ }
    await sleep(150);
  }
  throw new Error('server did not start');
});
after(() => { if (child) { try { child.kill(); } catch { /* noop */ } } });

async function mkToken() {
  const j = await post('/api/join', { name: uniq('k11'), path: 'sword' });
  assert.equal(j.ok, true, 'join：' + JSON.stringify(j));
  return j.player.token;
}

test('K11-HTTP 路由接线：listings 返回 ok、consign 无物品被拒、buy 无挂单被拒', async () => {
  const t = await mkToken();
  const list = await get('/api/k11/listings?token=' + t);
  assert.equal(list.ok, true, 'listings 应可用：' + JSON.stringify(list));
  assert.equal(Array.isArray(list.listings), true);
  const consign = await post('/api/k11/consign', { token: t, itemId: 'item-1', price: 50 });
  assert.equal(consign.ok, false, '无物品挂单应被拒：' + JSON.stringify(consign));
  assert.equal(consign.code, 'CONSIGN_FAIL');
  const buy = await post('/api/k11/buy', { token: t, listingId: 'L-nope', idempotencyId: 'idem-h1' });
  assert.equal(buy.ok, false, '无挂单购买应被拒：' + JSON.stringify(buy));
  assert.equal(buy.code, 'BUY_FAIL');
});

test('K11-HTTP 鉴权：无 token 的 consign 被拒', async () => {
  const consign = await post('/api/k11/consign', { itemId: 'item-1', price: 50 });
  assert.equal(consign.ok, false);
  assert.equal(consign.code, 'BAD_TOKEN');
});

/* P1-4（真实 HTTP 成功端到端）：经真实档案 + 真实账本 + 真实接口完成购买，
   核对双方余额与物品归属，并断言公开响应不含任何身份凭证（P0-1）。 */
async function grantStones(token, amount) {
  return post('/api/_test/grant-stones', { token, amount });
}
async function seedItem(token, itemId, qty = 1) {
  return post('/api/_test/seed-item', { token, itemId, qty });
}
async function profileStones(token) {
  const j = await get('/api/profile?token=' + token);
  return j.profile ? j.profile.stones : null;
}

test('K11-HTTP-P1-4 真实端到端：seed→挂单→购买→余额/归属核对 + 公开 DTO 无 token', async () => {
  const seller = await mkToken();
  const buyer = await mkToken();
  const g = await grantStones(buyer, 100);
  assert.equal(g.ok, true, 'grant：' + JSON.stringify(g));
  const s = await seedItem(seller, 'k11-e2e-1', 1);
  assert.equal(s.ok, true, 'seed：' + JSON.stringify(s));

  const consign = await post('/api/k11/consign', { token: seller, itemId: 'k11-e2e-1', price: 50 });
  assert.equal(consign.ok, true, 'consign：' + JSON.stringify(consign));
  assert.equal('sellerToken' in consign.listing, false, '挂单响应不得含 sellerToken');
  assert.equal(consign.listing.price, 50);
  assert.equal(consign.listing.status, 'open');

  const list = await get('/api/k11/listings?token=' + buyer);
  assert.equal(list.ok, true);
  assert.equal(list.listings.length, 1);
  assert.equal('sellerToken' in list.listings[0], false, 'listings 响应不得含 sellerToken');

  const buy = await post('/api/k11/buy', { token: buyer, listingId: consign.listing.listingId, idempotencyId: 'e2e-1' });
  assert.equal(buy.ok, true, 'buy：' + JSON.stringify(buy));
  assert.equal('buyerToken' in buy.result, false, '购买结果不得含 buyerToken');
  assert.equal('sellerToken' in buy.result, false, '购买结果不得含 sellerToken');
  assert.equal(buy.result.price, 50);
  assert.equal(buy.result.transfer.itemId, 'k11-e2e-1');
  assert.equal(buy.result.transfer.status, 'traded');

  // 真实档案余额核对
  const bs = await profileStones(buyer);
  const ss = await profileStones(seller);
  assert.equal(bs, 50, '买家余额应为 50，实际 ' + bs);
  assert.equal(ss, 50, '卖家余额应为 50，实际 ' + ss);

  // R4：独立读取真实账本，断言物品确已归属买家（非仅校验 DTO）
  const own = await get('/api/_test/ownership?itemId=k11-e2e-1');
  assert.equal(own.ok, true, 'ownership：' + JSON.stringify(own));
  assert.equal(own.item.ownerToken, buyer, '真实账本归属应为买家');
  assert.equal(own.item.status, 'traded');
  assert.equal(own.item.qty, 0, '整栈(1件)买走后账本余量应为 0');

  // 成交后挂单下架
  const list2 = await get('/api/k11/listings?token=' + buyer);
  assert.equal(list2.listings.length, 0, '成交后挂单应下架');

  // 幂等：同 idem 重复购买只生效一次（买家余额不变）
  const buy2 = await post('/api/k11/buy', { token: buyer, listingId: consign.listing.listingId, idempotencyId: 'e2e-1' });
  assert.equal(buy2.ok, true);
  assert.equal(buy2.replayed, true, '重复购买应标记为 replayed');
  const bs2 = await profileStones(buyer);
  assert.equal(bs2, 50, '重复购买后买家余额仍应为 50');
});

/* R3（P1-4 生产隔离）：未启用 SERVER_TEST_MODE 时，seed/grant/ownership 一律 404，不暴露任何内部能力 */
function post2(base, p, body) {
  return fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  }).then(r => r.json());
}
test('K11-HTTP-R3 生产隔离：无 TEST_MODE 时 seed/grant/ownership 均 404', async () => {
  const port = 9014; // 确定性端口：与 before 钩子服务器 9013 及全树其它固定端口均不重叠
  const base2 = 'http://127.0.0.1:' + port;
  const child2 = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    env: {
      ...process.env,
      SERVER_PORT: String(port),
      SERVER_PROFILE_MODE: 'enforce',
      SERVER_OFFLINE_KICK_MS: '60000',
      SERVER_SETTLE_HOLD_MS: '50'
      /* 注意：此处未设置 SERVER_TEST_MODE —— 模拟生产环境 */
    },
    stdio: 'ignore'
  });
  try {
    for (let i = 0; i < 80; i++) {
      try { const r = await fetch(base2 + '/api/health'); if ((await r.json()).ok) break; } catch { /* 未起 */ }
      await sleep(150);
    }
    const j = await post2(base2, '/api/join', { name: uniq('k11p'), path: 'sword' });
    assert.equal(j.ok, true, 'join：' + JSON.stringify(j));
    const tok = j.player.token;
    const seed = await post2(base2, '/api/_test/seed-item', { token: tok, itemId: 'x', qty: 1 });
    assert.equal(seed.ok, false);
    assert.equal(seed.code, 'NOT_FOUND', '生产环境 seed 必须 404，实际 ' + JSON.stringify(seed));
    const grant = await post2(base2, '/api/_test/grant-stones', { token: tok, amount: 100 });
    assert.equal(grant.ok, false);
    assert.equal(grant.code, 'NOT_FOUND', '生产环境 grant 必须 404，实际 ' + JSON.stringify(grant));
    const own = await fetch(base2 + '/api/_test/ownership?itemId=x').then(r => r.json());
    assert.equal(own.ok, false);
    assert.equal(own.code, 'NOT_FOUND', '生产环境 ownership 必须 404，实际 ' + JSON.stringify(own));
  } finally {
    try { child2.kill(); } catch { /* noop */ }
  }
});
