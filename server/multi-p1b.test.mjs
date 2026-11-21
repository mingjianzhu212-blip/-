/* server/multi-p1b.test.mjs — P1-B 流派共鸣（道途 × 功法/装备联动，第 126 轮）
 *
 * 纪律：不 mock 服务器、不伪造事件——真子进程 + 真 HTTP/SSE。
 * 覆盖（共鸣必须是服务器权威、有上限、不破坏 P0-B 重算标量）：
 *   B1 剑修武器共鸣：高武器/强化快照下剑修 synergyPct=15，体修同快照=0。
 *   B2 丹修淬丹共鸣：满淬丹快照下丹修 synergyPct=15，剑修同快照=0。
 *   B3 阵修悟道共鸣：满悟道快照下阵修 synergyPct=10.5（0.7 权重），剑修同快照=0。
 *   B4 共鸣上限封顶：snapshot 超界（999/1e12）仍被钳制，synergyPct 恒在 [0,15]。
 *   B5 共鸣作用在团队战力：同快照两队，剑修队 teamPower > 体修队 teamPower。
 *   B6 P0-B 不变量：同快照换道途，join 的 base power 不变（共鸣不污染权威标量）。
 *   B7 安全：客户端注入 synergyGain/pathAxis 等垃圾字段无效；源码不读这些字段、目录不发系数。
 *
 * 运行：node --test server/multi-p1b.test.mjs
 * 本套用**默认生产配置**（不开启 SERVER_LEGACY_POWER），必须带快照登录，顺带验新默认可玩。
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = 9007;
const BASE = 'http://127.0.0.1:' + PORT;

let child = null;
const streams = [];
let seq = 0;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function uniq(p) { seq += 1; return p + seq; }

/* 预置快照（共鸣只读 weapon/weaponLv/equipPower/affixPct/danPowPct/wuPct/artBgPct） */
function snap(over) {
  return Object.assign({
    rank: 1, gongLvs: [0, 0, 0], weapon: 0, weaponLv: 0,
    affixPct: 0, wuPct: 0, artBgPct: 0, danPowPct: 0, dtPowPct: 0,
    petPower: 0, equipPower: 0
  }, over || {});
}
const S_WEAPON = snap({ weapon: 9, weaponLv: 20 });   // 剑修轴满
const S_DAN = snap({ danPowPct: 0.55 });               // 丹修轴满
const S_WU = snap({ wuPct: 52 });                      // 阵修轴满（0.7 权重 → 0.7）
const S_OVER = snap({ weapon: 999, weaponLv: 999, equipPower: 1e12, affixPct: 999, danPowPct: 99, wuPct: 999, artBgPct: 99 });
const S_ZERO = snap({});                                // 所有轴 0

async function post(p, body) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return r.json();
}

function openSse(u) {
  const ac = new AbortController();
  const handle = { close: () => { try { ac.abort(); } catch { /* noop */ } } };
  handle.ready = fetch(u, { signal: ac.signal }).then(async (res) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const queue = [];
    let waiter = null;
    let closed = false;
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, i);
            buf = buf.slice(i + 2);
            let ev = 'message'; let data = '';
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) ev = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            let parsed = null;
            try { parsed = JSON.parse(data); } catch { parsed = null; }
            const item = { event: ev, data: parsed };
            if (waiter) { const w = waiter; waiter = null; w(item); } else queue.push(item);
          }
        }
      } catch { /* aborted */ }
      closed = true;
      if (waiter) { const w = waiter; waiter = null; w(null); }
    })();
    return {
      next: () => new Promise((resolve) => {
        if (queue.length) return resolve(queue.shift());
        if (closed) return resolve(null);
        waiter = resolve;
      })
    };
  });
  streams.push(handle);
  return handle;
}

function nextEvent(sse, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting event')), timeoutMs);
    (async () => {
      const s = await sse.ready;
      const ev = await s.next();
      clearTimeout(t);
      if (!ev) reject(new Error('stream closed'));
      else resolve(ev);
    })();
  });
}

async function waitRunAsync(sse, pred, timeoutMs = 6000) {
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting run predicate');
    const ev = await nextEvent(sse, timeoutMs);
    if (ev.event === 'run' && ev.data && ev.data.run && pred(ev.data.run)) return ev.data.run;
  }
}

/* 带快照登录（默认生产配置，必须带 snapshot） */
async function mkPlayer(name, snapshot, pathId, extra) {
  const body = { name: uniq(name), snapshot };
  if (pathId !== undefined) body.path = pathId;
  if (extra) Object.assign(body, extra);
  const j = await post('/api/join', body);
  assert.equal(j.ok, true, '带快照 join 应成功：' + JSON.stringify(j));
  const sse = openSse(BASE + '/api/stream?token=' + encodeURIComponent(j.player.token));
  await nextEvent(sse, 6000);   // hello
  return { token: j.player.token, id: j.player.id, name: j.player.name, power: j.player.power, path: j.player.path, sse };
}

async function mkRoom(ps) {
  const r = await post('/api/room/create', { token: ps[0].token });
  assert.equal(r.ok, true, 'create 应成功：' + JSON.stringify(r));
  for (let i = 1; i < ps.length; i++) {
    const j = await post('/api/room/join', { token: ps[i].token, roomId: r.room.id });
    assert.equal(j.ok, true, 'join room 应成功：' + JSON.stringify(j));
  }
  for (const p of ps) {
    const rr = await post('/api/room/ready', { token: p.token, ready: true });
    assert.equal(rr.ok, true, 'ready 应成功：' + JSON.stringify(rr));
  }
  return r.room.id;
}

async function startRun(ps) {
  const r = await post('/api/room/start', { token: ps[0].token });
  assert.equal(r.ok, true, 'start 应成功：' + JSON.stringify(r));
}

before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    /* 默认生产配置：不开 legacy 闸门，必须带快照登录（顺带验新默认可玩 + 共鸣路径） */
    env: { ...process.env, SERVER_PORT: String(PORT), SERVER_OFFLINE_KICK_MS: '60000', SERVER_SETTLE_HOLD_MS: '3000' },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/health'); if ((await r.json()).ok) return; } catch { /* 未起 */ }
    await sleep(150);
  }
  throw new Error('server did not start');
});

after(() => {
  streams.forEach(s => { try { s.close(); } catch { /* noop */ } });
  if (child) child.kill();
});

/* ---------------------------------- B1 ---------------------------------- */
test('B1 剑修武器共鸣：高武器快照下剑修 synergyPct=15、体修同快照=0', async () => {
  const A = await mkPlayer('剑', S_WEAPON, 'sword');
  const B = await mkPlayer('体', S_WEAPON, 'body');
  await mkRoom([A, B]);
  await startRun([A, B]);
  const run = await waitRunAsync(A.sse, r => Array.isArray(r.skills) && r.skills.length >= 2);
  const a = run.skills.find(s => s.id === A.id);
  const b = run.skills.find(s => s.id === B.id);
  assert.ok(a && b, 'run.skills 应含两名成员');
  assert.equal(a.synergyPct, 15, '剑修（武器满投入）共鸣必须 = 15%');
  assert.equal(b.synergyPct, 0, '体修（武器轴无投入）共鸣必须 = 0%');
  assert.equal(a.axisName, '法宝·强化', '剑修轴展示名应为 法宝·强化');
  assert.equal(b.axisName, '装备·护体', '体修轴展示名应为 装备·护体');
});

/* ---------------------------------- B2 ---------------------------------- */
test('B2 丹修淬丹共鸣：满淬丹快照下丹修 synergyPct=15、剑修同快照=0', async () => {
  const A = await mkPlayer('丹', S_DAN, 'dan');
  const B = await mkPlayer('剑', S_DAN, 'sword');
  await mkRoom([A, B]);
  await startRun([A, B]);
  const run = await waitRunAsync(A.sse, r => Array.isArray(r.skills) && r.skills.length >= 2);
  const a = run.skills.find(s => s.id === A.id);
  const b = run.skills.find(s => s.id === B.id);
  assert.equal(a.synergyPct, 15, '丹修（淬丹满投入）共鸣必须 = 15%');
  assert.equal(b.synergyPct, 0, '剑修（淬丹轴无投入）共鸣必须 = 0%');
  assert.equal(a.axisName, '淬丹·丹元');
});

/* ---------------------------------- B3 ---------------------------------- */
test('B3 阵修悟道共鸣：满悟道快照下阵修 synergyPct=10.5、剑修同快照=0', async () => {
  const A = await mkPlayer('阵', S_WU, 'array');
  const B = await mkPlayer('剑', S_WU, 'sword');
  await mkRoom([A, B]);
  await startRun([A, B]);
  const run = await waitRunAsync(A.sse, r => Array.isArray(r.skills) && r.skills.length >= 2);
  const a = run.skills.find(s => s.id === A.id);
  const b = run.skills.find(s => s.id === B.id);
  assert.equal(a.synergyPct, 10.5, '阵修（悟道满投入·0.7 权重）共鸣必须 = 10.5%');
  assert.equal(b.synergyPct, 0, '剑修（悟道轴无投入）共鸣必须 = 0%');
  assert.equal(a.axisName, '悟道·阵理');
});

/* ---------------------------------- B4 ---------------------------------- */
test('B4 共鸣上限封顶：snapshot 超界仍被钳制，synergyPct 恒在 [0,15]', async () => {
  for (const pid of ['sword', 'body', 'dan', 'array']) {
    const P = await mkPlayer('封', S_OVER, pid);
    const C = await mkPlayer('伴', S_ZERO, 'sword');   /* 同伴，凑够 2 人开局 */
    await mkRoom([P, C]);
    await startRun([P, C]);
    const run = await waitRunAsync(P.sse, r => Array.isArray(r.skills) && r.skills.length >= 2);
    const p = run.skills.find(s => s.id === P.id);
    assert.ok(p.synergyPct >= 0 && p.synergyPct <= 15, pid + ' 超界快照共鸣必须 ≤ 15%（实测 ' + p.synergyPct + '）');
  }
  /* 零投入快照：任何道途共鸣都必须 = 0 */
  const Z = await mkPlayer('零', S_ZERO, 'sword');
  const ZC = await mkPlayer('零伴', S_OVER, 'body');
  await mkRoom([Z, ZC]);
  await startRun([Z, ZC]);
  const runZ = await waitRunAsync(Z.sse, r => Array.isArray(r.skills) && r.skills.length >= 2);
  const z = runZ.skills.find(s => s.id === Z.id);
  assert.equal(z.synergyPct, 0, '零投入快照共鸣必须 = 0%');
});

/* ---------------------------------- B5 ---------------------------------- */
test('B5 共鸣作用在团队战力：同快照两队，剑修队 teamPower > 体修队 teamPower', async () => {
  const sA = await mkPlayer('剑队', S_WEAPON, 'sword');
  const sB = await mkPlayer('剑队2', S_WEAPON, 'sword');
  await mkRoom([sA, sB]);
  await startRun([sA, sB]);
  const runSword = await waitRunAsync(sA.sse, r => Array.isArray(r.skills) && r.skills.length >= 2);
  const swordTeam = runSword.teamPower;

  const bA = await mkPlayer('体队', S_WEAPON, 'body');
  const bB = await mkPlayer('体队2', S_WEAPON, 'body');
  await mkRoom([bA, bB]);
  await startRun([bA, bB]);
  const runBody = await waitRunAsync(bA.sse, r => Array.isArray(r.skills) && r.skills.length >= 2);
  const bodyTeam = runBody.teamPower;

  assert.ok(swordTeam > bodyTeam, '同快照下剑修队（武器共鸣）团队战力应高于体修队：' + swordTeam + ' vs ' + bodyTeam);
});

/* ---------------------------------- B6 ---------------------------------- */
test('B6 P0-B 不变量：同快照换道途，join 的 base power 不变（共鸣不污染权威标量）', async () => {
  const A = await post('/api/join', { name: uniq('同'), snapshot: S_WEAPON, path: 'sword' });
  const B = await post('/api/join', { name: uniq('同'), snapshot: S_WEAPON, path: 'body' });
  assert.equal(A.ok, true); assert.equal(B.ok, true);
  assert.equal(A.player.power, B.player.power, '同快照、不同道途的 recompute 标量必须一致（共鸣只作用于副本内）');
});

/* ---------------------------------- B7 ---------------------------------- */
test('B7 安全：客户端注入 synergyGain/pathAxis 等垃圾字段无效；源码不读、目录不发系数', async () => {
  /* 行为：带一堆伪造的共鸣字段，剑修高武器快照的共鸣应仍是 15%，不受注入影响 */
  const A = await mkPlayer('伪', S_WEAPON, 'sword', {
    synergyGain: 9, pathAxis: 'weapon', weaponSynergy: 99, synergyPct: 80, axisName: 'hack'
  });
  const C = await mkPlayer('伪伴', S_ZERO, 'body');
  await mkRoom([A, C]);
  await startRun([A, C]);
  const run = await waitRunAsync(A.sse, r => Array.isArray(r.skills) && r.skills.length >= 2);
  const p = run.skills.find(s => s.id === A.id);
  assert.equal(p.synergyPct, 15, '注入 synergyGain=9 等字段不得改变共鸣（应仍是 15%）');
  assert.equal(p.axisName, '法宝·强化', '注入 axisName=hack 不得覆盖服务器下发的展示名');

  /* 源码守卫 */
  const srv = readFileSync(path.join(ROOT, 'server', 'server.mjs'), 'utf8');
  assert.ok(!/body\.synergyGain|body\.pathAxis|body\.weaponSynergy/.test(srv), '服务器不得读取任何客户端共鸣字段');
  assert.ok(/const SYNERGY_GAIN = 0\.15/.test(srv), '服务器应有唯一的共鸣上限常量');
  const net = readFileSync(path.join(ROOT, 'js', 'net.js'), 'utf8');
  assert.ok(!/synergyGain|synergyPct|pathAxis/.test(net), 'net.js 不得上报任何共鸣字段');
  const game = readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8');
  assert.ok(!/synergyGain|pathAxis/.test(game), 'game.js 不得持有共鸣系数');
  /* 目录不得下发数值系数（axis/axisName 是展示标签，不是系数） */
  assert.ok(/axisName:\s*AXIS_NAMES/.test(srv), 'pathCatalog 应下发 axisName（展示标签）');
  assert.ok(!/synergyGain:/.test(srv), 'pathCatalog 不得下发 synergyGain 系数');
});

/* 等 "run" 或 "run_settle" 事件之一（B8 驱动副本用） */
async function waitRunOrSettle(sse, timeoutMs = 6000) {
  for (;;) {
    const ev = await nextEvent(sse, timeoutMs);
    if (!ev) return { run: null, settled: null };
    if (ev.event === 'run') return { run: ev.data.run, settled: null };
    if (ev.event === 'run_settle') return { run: null, settled: ev.data };
  }
}
/* 等下一个 room 事件（含成员 base power） */
async function waitRoom(sse, timeoutMs = 6000) {
  for (;;) {
    const ev = await nextEvent(sse, timeoutMs);
    if (!ev) return null;
    if (ev.event === 'room' && ev.data && ev.data.room) return ev.data.room;
  }
}
/* 取某道途+快照下、同伴为全零快照时的共鸣百分比（B9 用） */
async function synergyOf(name, snapshot, pathId) {
  const A = await mkPlayer(name, snapshot, pathId);
  const C = await mkPlayer(name + '伴', S_ZERO, 'sword');
  await mkRoom([A, C]);
  await startRun([A, C]);
  const run = await waitRunAsync(A.sse, r => Array.isArray(r.skills) && r.skills.length >= 2);
  const a = run.skills.find(s => s.id === A.id);
  return a ? a.synergyPct : null;
}

/* ---------------------------------- B8 ---------------------------------- */
test('B8 基础战力不受副本过程污染（join→开局→出手→结算，base power 不变）', async () => {
  const A = await mkPlayer('污', S_WEAPON, 'sword');
  const B = await mkPlayer('污2', S_WEAPON, 'sword');
  const baseA = A.power, baseB = B.power;
  await mkRoom([A, B]);
  await startRun([A, B]);
  await waitRunAsync(A.sse, r => Array.isArray(r.skills) && r.skills.length >= 2); // 先排空开局 run 事件，避免重复出手
  for (let guard = 0; guard < 6; guard++) {
    await post('/api/run/strike', { token: A.token });
    await post('/api/run/strike', { token: B.token });
    const ev = await waitRunOrSettle(A.sse);
    if (ev.settled) break;
  }
  let settled = null;
  for (let i = 0; i < 40 && !settled; i++) {
    const e = await nextEvent(A.sse, 6000);
    if (e.event === 'run_settle') settled = e.data;
  }
  assert.ok(settled, '两满武器号应跑到结算（清场或团灭）：' + JSON.stringify(settled));
  const roomEv = await waitRoom(A.sse);
  const ma = roomEv.members.find(m => m.id === A.id);
  const mb = roomEv.members.find(m => m.id === B.id);
  assert.equal(ma.power, baseA, '结算后 A 基础战力不得被共鸣/副本战力污染');
  assert.equal(mb.power, baseB, '结算后 B 基础战力不得被污染');
  // 源码守卫：memberPowerInRoom 只读 m.power，从不把副本有效战力写回基础战力
  const srv = readFileSync(path.join(ROOT, 'server', 'server.mjs'), 'utf8');
  assert.ok(!/m\.power\s*=\s*memberPowerInRoom/.test(srv), '成员基础战力不得被副本有效战力覆盖');
  assert.ok(!/m\.power\s*=\s*m\.power\s*\*/.test(srv), '不得把副本乘算结果写回基础战力');
});

/* ---------------------------------- B9 ---------------------------------- */
test('B9 四条轴权重正确：双满投入 = +15%，单项分量符合权重', async () => {
  // 权重：sword 0.6+0.4 / body 0.7+0.3 / dan 1.0 / wu 0.7+0.3（上限 Math.min(1,*)）
  assert.equal(await synergyOf('b9_s1', snap({ weaponLv: 20 }), 'sword'), 9, '剑修·仅强化满（0.6×15%）应 +9%');
  assert.equal(await synergyOf('b9_s2', snap({ weapon: 9 }), 'sword'), 6, '剑修·仅法宝满（0.4×15%）应 +6%');
  assert.equal(await synergyOf('b9_b1', snap({ equipPower: 4500 }), 'body'), 10.5, '体修·仅装备满（0.7×15%）应 +10.5%');
  assert.equal(await synergyOf('b9_b2', snap({ affixPct: 22 }), 'body'), 4.5, '体修·仅词缀满（0.3×15%）应 +4.5%');
  assert.equal(await synergyOf('b9_d1', snap({ danPowPct: 0.55 }), 'dan'), 15, '丹修·淬丹满应 +15%');
  assert.equal(await synergyOf('b9_w1', snap({ wuPct: 52 }), 'array'), 10.5, '阵修·仅悟道满（0.7×15%）应 +10.5%');
  assert.equal(await synergyOf('b9_w2', snap({ artBgPct: 0.56 }), 'array'), 4.5, '阵修·仅图录满（0.3×15%）应 +4.5%');
  assert.equal(await synergyOf('b9_w3', snap({ wuPct: 52, artBgPct: 0.56 }), 'array'), 15, '阵修·悟道+图录双满应 +15%（非仅 10.5%）');
});

/* ---------------------------------- B10 ---------------------------------- */
test('B10 道途切换与重连：轴心始终由服务器登记道途决定（客户端无法保留/注入轴）', async () => {
  const A = await mkPlayer('切', S_WEAPON, 'sword');
  // run 相位之外允许切换道途；切换后服务器登记 body
  const sw = await post('/api/path', { token: A.token, path: 'body' });
  assert.equal(sw.ok, true); assert.equal(sw.path, 'body');
  const C = await mkPlayer('切伴', S_ZERO, 'sword');
  await mkRoom([A, C]);
  await startRun([A, C]);
  const run1 = await waitRunAsync(A.sse, r => Array.isArray(r.skills) && r.skills.length >= 2);
  const a1 = run1.skills.find(s => s.id === A.id);
  assert.equal(a1.path, 'body', '切换后的道途必须由服务器登记');
  assert.equal(a1.axisName, '装备·护体', '轴心由服务器登记道途决定，非客户端');
  assert.equal(a1.synergyPct, 0, 'S_WEAPON 在 guard 轴无投入 → 共鸣 0');
  // run 内再切换应被拒（BAD_PHASE），证明道途不能在副本中借客户端篡改
  const blocked = await post('/api/path', { token: A.token, path: 'sword' });
  assert.equal(blocked.ok, false); assert.equal(blocked.code, 'BAD_PHASE');
  // 重连：断开 SSE，用同一 token 重连，轴心仍由服务器登记道途决定
  A.sse.close();
  const sse2 = openSse(BASE + '/api/stream?token=' + encodeURIComponent(A.token));
  await nextEvent(sse2, 6000);
  const run2 = await waitRunAsync(sse2, r => Array.isArray(r.skills) && r.skills.some(s => s.id === A.id));
  const a2 = run2.skills.find(s => s.id === A.id);
  assert.equal(a2.path, 'body');
  assert.equal(a2.axisName, '装备·护体', '重连后仍读取服务器登记道途，客户端无法借重连改轴');
  sse2.close();
});
