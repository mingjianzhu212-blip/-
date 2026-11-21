'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSectServer } = require('./sect-server');

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
