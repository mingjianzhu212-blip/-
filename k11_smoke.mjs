// K11 真实 HTTP 端到端冒烟：证明 server.mjs 里已接线的 K11 路由真能跑通（非仅单测）。
const BASE = 'http://127.0.0.1:7755';
const j = async (p, body) => {
  const r = await fetch(BASE + p, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return r.json();
};
const post = (p, b) => j(p, b);
const get = (p) => j(p, null);

const log = [];
const assert = (name, cond, extra) => { log.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + JSON.stringify(extra) : '')); if (!cond) process.exitCode = 1; };

try {
  // 1. 卖家注册
  const s = await post('/api/join', { name: '卖家甲', power: 100 });
  assert('join-seller ok', s.ok && s.player && typeof s.player.token === 'string', s.ok ? { token: s.player.token.slice(0, 6) + '…' } : s);
  const tokS = s.player.token;

  // 2. 铸造物品 + 发灵石（测试态路由）
  const seed = await post('/api/_test/seed-item', { token: tokS, itemId: 'sword01', qty: 3 });
  assert('seed-item ok', seed.ok && seed.item.itemId === 'sword01' && seed.item.qty === 3, seed);
  const gS = await post('/api/_test/grant-stones', { token: tokS, amount: 1000 });
  assert('grant-stones(seller) ok', gS.ok && gS.stones === 1000, gS);

  // 3. 挂单
  const c = await post('/api/k11/consign', { token: tokS, itemId: 'sword01', price: 100, qty: 3 });
  assert('consign ok + 返回公开 DTO(不含 sellerToken)', c.ok && c.listing && c.listing.listingId && !('sellerToken' in c.listing), c.listing);
  const listingId = c.listing.listingId;

  // 4. 在售列表应含 1 条
  const l1 = await get('/api/k11/listings');
  assert('listings=1 before buy', l1.ok && l1.listings.length === 1, l1);

  // 5. 买家注册 + 发灵石
  const b = await post('/api/join', { name: '买家乙', power: 100 });
  const tokB = b.player.token;
  const gB = await post('/api/_test/grant-stones', { token: tokB, amount: 1000 });
  assert('grant-stones(buyer) ok', gB.ok && gB.stones === 1000, gB);

  // 6. 购买（首次）
  const buy1 = await post('/api/k11/buy', { token: tokB, listingId, idempotencyId: 'idem-1' });
  assert('buy first ok + 公开结果(不含 ownerToken)', buy1.ok && buy1.replayed === false && buy1.result && !('transfer' && buy1.result.transfer && 'ownerToken' in (buy1.result.transfer || {})), buy1);

  // 7. 幂等重放：同 idempotencyId 返回首次结果，不重复成交
  const buy2 = await post('/api/k11/buy', { token: tokB, listingId, idempotencyId: 'idem-1' });
  assert('buy idempotent replay', buy2.ok && buy2.replayed === true, buy2);

  // 8. 成交后列表清空
  const l2 = await get('/api/k11/listings');
  assert('listings=0 after buy', l2.ok && l2.listings.length === 0, l2);

  // 9. 撤单闭环：发新物品再挂单并撤（不复用已售出的 sword01）
  const seed2 = await post('/api/_test/seed-item', { token: tokS, itemId: 'sword02', qty: 1 });
  assert('seed-item2 ok', seed2.ok, seed2);
  const c2 = await post('/api/k11/consign', { token: tokS, itemId: 'sword02', price: 50, qty: 1 });
  const lid2 = c2.listing.listingId;
  const x = await post('/api/k11/cancel', { token: tokS, listingId: lid2 });
  assert('cancel own listing ok', x.ok && x.listing.status === 'cancelled', x);

  console.log(log.join('\n'));
  console.log(log.every(l => l.startsWith('PASS')) ? '\nK11_EOE_ALL_PASS' : '\nK11_EOE_HAS_FAIL');
} catch (e) {
  console.log(log.join('\n'));
  console.log('ERR ' + e.message);
  process.exitCode = 2;
}
