'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSectServer, recomputePower, POWER_FRESH_MS } = require('./sect-server');

const a = { pid: 'paaaaaaaa', nick: '青玄', rank: 4 };
const b = { pid: 'pbbbbbbbb', nick: '明月', rank: 4 };

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-sect-'));
  const dataFile = path.join(dir, 'sect.json');
  const server = createSectServer({ dataFile });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { server, dataFile, base: `http://127.0.0.1:${server.address().port}` };
}

async function call(base, action, player, body) {
  const qs = new URLSearchParams({ pid: player.pid, nick: player.nick });
  const res = await fetch(`${base}/api/sect/${action}?${qs}`, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid: player.pid, nick: player.nick, ...body })
  });
  return { status: res.status, data: await res.json() };
}

test('health and malformed player identifiers are handled', async t => {
  const { base } = await fixture(t);
  assert.deepEqual(await (await fetch(`${base}/api/sect/health`)).json(), { ok: true });
  const bad = await fetch(`${base}/api/sect/me?pid=x&nick=x`);
  assert.equal(bad.status, 400);
});

test('help requests enforce ownership, deduplicate guards and settle rewards once', async t => {
  const { base } = await fixture(t);
  const own = await call(base, 'publish', a, { rank: a.rank, ready: true });
  assert.equal(own.status, 200);
  const id = own.data.req.id;
  assert.equal((await call(base, 'publish', a, { rank: a.rank, ready: true })).status, 409);
  assert.equal((await call(base, 'guard', a, { reqId: id })).status, 403);
  assert.equal((await call(base, 'guard', b, { reqId: id })).status, 200);
  assert.equal((await call(base, 'guard', b, { reqId: id })).status, 409);
  const settled = await call(base, 'settle', a, { reqId: id, rank: a.rank, success: true });
  assert.equal(settled.status, 200);
  assert.ok(settled.data.expGain > 0);
  assert.equal((await call(base, 'settle', a, { reqId: id, rank: a.rank, success: true })).status, 404);
  const reward = await call(base, 'claim', a, {});
  assert.equal(reward.data.exp, settled.data.expGain);
  assert.equal((await call(base, 'claim', a, {})).data.exp, 0);
  assert.ok((await call(base, 'claim', b, {})).data.stone > 0);
});

test('求助有效期为 30 分钟', async t => {
  const { base } = await fixture(t);
  const own = await call(base, 'publish', a, { rank: a.rank, ready: true });
  const left = own.data.req.leftMs;
  assert.ok(left > 29 * 60 * 1000 && left <= 30 * 60 * 1000, `leftMs=${left}`);
});

test('published requests and player quotas survive a server restart', async t => {
  const first = await fixture(t);
  const published = await call(first.base, 'publish', a, { rank: a.rank, ready: true });
  const requestId = published.data.req.id;
  await new Promise(resolve => first.server.close(resolve));

  const restarted = createSectServer({ dataFile: first.dataFile });
  await new Promise(resolve => restarted.listen(0, '127.0.0.1', resolve));
  t.after(async () => new Promise(resolve => restarted.close(resolve)));
  const base = `http://127.0.0.1:${restarted.address().port}`;
  const me = await call(base, 'me', a);
  assert.equal(me.data.req.id, requestId);
  assert.equal(me.data.me.pub, 1);
});

test('invalid rank and mismatched player identity are rejected', async t => {
  const { base } = await fixture(t);
  assert.equal((await call(base, 'publish', a, { rank: 99, ready: true })).status, 400);
  const response = await fetch(`${base}/api/sect/publish?pid=${a.pid}&nick=${a.nick}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid: b.pid, nick: b.nick, rank: a.rank, ready: true })
  });
  assert.equal(response.status, 400);
  const nullBody = await fetch(`${base}/api/sect/claim?pid=${a.pid}&nick=${a.nick}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null'
  });
  assert.equal(nullBody.status, 400);
});

test('world chat sanitizes text, enforces cooldown and marks own messages', async t => {
  const { base } = await fixture(t);
  const send = (player, body) => fetch(`${base}/api/chat/send?pid=${player.pid}&nick=${encodeURIComponent(player.nick)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pid: player.pid, nick: player.nick, ...body })
  });
  const history = (player, since) => fetch(`${base}/api/chat/history?pid=${player.pid}&nick=${encodeURIComponent(player.nick)}&since=${since}`).then(r => r.json());

  assert.equal((await send(a, { text: '   ' })).status, 400);
  const first = await (await send(a, { text: '今日 <b>天气</b>不错，适合破境' })).json();
  assert.equal(first.ok, true);
  const own = first.list.at(-1);
  assert.equal(own.mine, true);
  assert.equal(own.text, '今日 b天气/b不错，适合破境');
  assert.equal((await send(a, { text: '说太快了' })).status, 429);
  const long = await (await send(b, { text: '长'.repeat(200) })).json();
  assert.equal(long.list.at(-1).text.length, 60);
  const fresh = await history(a, own.seq);
  assert.equal(fresh.list.length, 1);
  assert.equal(fresh.list[0].nick, '明月');
  assert.equal(fresh.list[0].mine, false);
});

test('guarding a breakthrough request is broadcast to the world channel', async t => {
  const { base } = await fixture(t);
  const own = await call(base, 'publish', a, { rank: a.rank, ready: true });
  await call(base, 'guard', b, { reqId: own.data.req.id });
  const hist = await fetch(`${base}/api/chat/history?pid=${b.pid}&nick=${encodeURIComponent(b.nick)}&since=0`).then(r => r.json());
  const sys = hist.list.filter(m => m.sys);
  assert.equal(sys.length, 1);
  assert.match(sys[0].text, /青玄 得 明月 护法/);
});

test('山门气象统计全服活跃度并记录动态时间轴', async t => {
  const { base } = await fixture(t);
  const stats = () => fetch(`${base}/api/sect/stats?pid=${a.pid}&nick=${encodeURIComponent(a.nick)}`).then(r => r.json());

  const empty = await stats();
  assert.equal(empty.ok, true);
  assert.equal(empty.members, 1);          /* 只有 a 自己访问过 */
  assert.equal(empty.online, 1);           /* 刚访问 → 在场 */
  assert.equal(empty.todayGuard, 0);
  assert.equal(empty.todayPub, 0);
  assert.equal(empty.events.length, 0);

  const own = await call(base, 'publish', a, { rank: a.rank, ready: true });
  assert.equal(own.status, 200);
  await call(base, 'guard', b, { reqId: own.data.req.id });

  const after = await stats();
  assert.equal(after.members, 2);
  assert.equal(after.online, 2);
  assert.equal(after.todayPub, 1);         /* a 今日求助 1 次 */
  assert.equal(after.todayGuard, 1);       /* b 今日护法 1 次 */
  assert.ok(after.events.length >= 2);
  assert.equal(after.events[0].kind, 'guard');   /* 最新的在前 */
  assert.equal(after.events[1].kind, 'pub');
  assert.match(after.events[0].text, /明月 为 青玄 护法/);
  assert.ok(after.roster.length >= 1);
  assert.ok(after.roster.every(x => typeof x.nick === 'string' && Number.isInteger(x.rank)));
});

test('山门气象的动态时间轴随服务重启保留', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-sect-'));
  const dataFile = path.join(dir, 'sect.json');
  const start = async () => {
    const server = createSectServer({ dataFile });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { server, base: `http://127.0.0.1:${server.address().port}` };
  };
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const one = await start();
  await call(one.base, 'publish', a, { rank: a.rank, ready: true });
  await new Promise(resolve => one.server.close(resolve));

  const two = await start();
  t.after(async () => { await new Promise(resolve => two.server.close(resolve)); });
  const st = await fetch(`${two.base}/api/sect/stats?pid=${a.pid}&nick=${encodeURIComponent(a.nick)}`).then(r => r.json());
  assert.equal(st.ok, true);
  assert.ok(st.events.length >= 1);
  assert.equal(st.events[0].kind, 'pub');
});

/* ===================== batch5 第 4 项：服务端战力 + 战力榜 ===================== */
const SNAP_BASE = { rank: 0, gongLvs: [0, 0, 0], weapon: 0, weaponLv: 0, affixPct: 0,
  wuPct: 0, artBgPct: 0, danPowPct: 0, dtPowPct: 0, petPower: 0, equipPower: 0 };

test('服务端战力重算：拒绝无效快照、逐项钳制、基础值正确', () => {
  assert.equal(recomputePower(null), null);
  assert.equal(recomputePower('x'), null);
  assert.equal(recomputePower([]), null);
  const base = recomputePower(SNAP_BASE);
  assert.equal(base.source, 'snapshot');
  assert.equal(base.power, 1000);                       /* 10 × POW_K × 1.5^0 */
  assert.equal(recomputePower({ ...SNAP_BASE, rank: 1 }).power, 1500);
  assert.equal(recomputePower({ ...SNAP_BASE, rank: 2 }).power, 2250);
  /* 非数字/负数/超上限全部钳制，不会出现 NaN 或 0 */
  const clamped = recomputePower({ rank: 999, gongLvs: [99, 99, 99], weapon: 99, weaponLv: 999,
    affixPct: 1e9, wuPct: 1e9, artBgPct: 1e9, danPowPct: 1e9, dtPowPct: 1e9,
    petPower: 1e12, equipPower: 1e12 });
  assert.ok(Number.isInteger(clamped.power) && clamped.power > 0);
  /* 钳制到合法满级：rank25 + 三功法满 + 灵器 9 + 强化 20 + 其余乘区满 + 灵兽/装备上限 */
  const maxed = recomputePower({ rank: 25, gongLvs: [10, 10, 10], weapon: 9, weaponLv: 20,
    affixPct: 22, wuPct: 52, artBgPct: 0.86, danPowPct: 0.55, dtPowPct: 22.5,
    petPower: 10100467, equipPower: 4500 });
  assert.equal(clamped.power, maxed.power);
  assert.ok(maxed.power > 1e8 && maxed.power <= 1e10);
});

test('战力上报与战力榜：服务端重算、排序、前 50、旧档兼容', async t => {
  const { base } = await fixture(t);
  const report = (player, snapshot) => call(base, 'power', player, { snapshot, ver: 1 });
  const board = player => fetch(`${base}/api/sect/powerboard?pid=${player.pid}&nick=${encodeURIComponent(player.nick)}`).then(r => r.json());

  const none = await board(a);
  assert.equal(none.ok, true);
  assert.equal(none.list.length, 0);
  assert.equal(none.me.power, 0);
  assert.equal(none.me.fresh, false);
  assert.equal(none.sum, 0);

  const ra = await report(a, { ...SNAP_BASE, rank: 4 });
  assert.equal(ra.status, 200);
  assert.equal(ra.data.ok, true);
  assert.equal(ra.data.power, 5062);                    /* floor(10×100×5.0625) */
  assert.equal(ra.data.source, 'snapshot');

  const rb = await report(b, { ...SNAP_BASE, rank: 4, gongLvs: [2, 0, 0] });
  assert.ok(rb.data.power > ra.data.power);

  const list = await board(a);
  assert.equal(list.total, 2);
  assert.equal(list.fresh, 2);
  assert.equal(list.list[0].nick, b.nick);
  assert.equal(list.list[1].nick, a.nick);
  assert.equal(list.list[0].me, false);
  assert.equal(list.list[1].me, true);
  assert.equal(list.me.rank, 2);
  assert.equal(list.sum, ra.data.power + rb.data.power);
  assert.ok(list.list.every(x => !('pid' in x) && !('ip' in x)));

  /* 直接报 power 数字不被采信 */
  const fake = await call(base, 'power', a, { power: 1e12, snapshot: null });
  assert.equal(fake.status, 400);

  /* 超过 50 人只回 50 名（按战力降序） */
  for (let i = 0; i < 51; i++) {
    await report({ pid: `pboard${String(i).padStart(3, '0')}`, nick: `同门${i}` }, { ...SNAP_BASE, rank: 3 + (i % 3) });
  }
  const many = await board(a);
  assert.equal(many.total, 53);
  assert.equal(many.list.length, 50);
  for (let i = 1; i < many.list.length; i++) assert.ok(many.list[i - 1].power >= many.list[i].power);
});

test('战力榜新鲜度：超过 7 天不上榜、不计入协力总和；旧档无字段不报错', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xiuxian-sect-'));
  const dataFile = path.join(dir, 'sect.json');
  const fixed = Date.now();
  const legacy = { nick: '旧档', guardDay: '', guard: 0, pubDay: '', pub: 0, pendStone: 0, pendExp: 0,
    seen: fixed, rank: 3, joined: fixed, guardsAll: 0, pubsAll: 0, power: 8000, powerAt: fixed - 8 * 24 * 3600 * 1000 };
  const stale = { ...legacy, nick: '陈旧', power: 9000, powerAt: fixed - 8 * 24 * 3600 * 1000 };
  const fresh = { ...legacy, nick: '新报', power: 7000, powerAt: fixed - 24 * 3600 * 1000 };
  const old = { pid: 'poldold00', nick: '无字段', rank: 1, seen: fixed, joined: fixed };
  fs.writeFileSync(dataFile, JSON.stringify({ players: { poldold00: old, pstale000: stale, pfresh000: fresh }, requests: [], events: [] }));
  const server = createSectServer({ dataFile, now: () => fixed });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const q = p => `${base}/api/sect/powerboard?pid=${p.pid}&nick=${encodeURIComponent(p.nick)}`;
  const me = await fetch(q({ pid: 'poldold00', nick: '无字段' })).then(r => r.json());
  assert.equal(me.ok, true);
  assert.equal(me.total, 2);                            /* 旧档 power 补 0，不上榜；过期上报仍留榜 */
  assert.equal(me.fresh, 1);
  assert.equal(me.sum, 7000);                           /* 只算近 7 天 */
  assert.ok(POWER_FRESH_MS === 7 * 24 * 3600 * 1000);
  const reported = await call(base, 'power', { pid: 'poldold00', nick: '无字段' }, { snapshot: { ...SNAP_BASE, rank: 2 }, ver: 1 });
  assert.equal(reported.status, 200);
  const after = await fetch(q({ pid: 'poldold00', nick: '无字段' })).then(r => r.json());
  assert.equal(after.total, 3);
  assert.equal(after.me.power, 2250);
  assert.equal(after.me.fresh, true);
});
