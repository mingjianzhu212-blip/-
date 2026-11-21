/* server/multi-p1a.test.mjs — P1-A 道途切片验收（第 120 轮）
 *
 * 纪律：不 mock 服务器、不伪造事件——真子进程 + 真 HTTP/SSE。
 * 覆盖（道途必须是服务器权威状态，客户端只能报枚举）：
 *   A1 道途枚举校验：缺省剑修；非法 join/改道途一律 BAD_PATH；hello 下发目录且**不含系数**。
 *   A2 剑修分奖权重：同战力下剑修多拿（池子不变，只改切法）；客户端塞 pathMult/contribMult 无效。
 *   A3 阵修点阵：本层门槛降到 85%，换层即清；每局 2 次，第 3 次 NO_SKILL_USES。
 *   A4 体修护持：战力不足时硬撑过层、此层无灵石、全境判定为打通（对照精确灵石账）。
 *   A5 丹修温养：催丹全队 +8%/层、上限 3 层、跨层累计；第 4 次 NO_SKILL_USES。
 *   A6 断线续接：resume 沿用已登记道途，body.path 改不动（堵"重连换道途"）。
 *   A7 开战中改道途：BAD_PHASE；已出手再放技能：ALREADY_STRUCK。
 *   A8 源码守卫：客户端只传 id 不持系数；服务器不读任何客户端倍率字段。
 *
 * 运行：node --test server/multi-p1a.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = 9006;
const BASE = 'http://127.0.0.1:' + PORT;

const NEED = [800, 1600, 3200, 6400, 12800];
const TEAM_BONUS = 0.1;
const SWORD_W = 1.15;

let child = null;
const streams = [];
let seq = 0;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function uniq(p) { seq += 1; return p + seq; }

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

function waitFor(sse, name, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting ' + name)), timeoutMs);
    (async () => {
      for (;;) {
        const ev = await nextEvent(sse, timeoutMs);
        if (ev.event === name) { clearTimeout(t); resolve(ev.data); return; }
      }
    })().catch(e => { clearTimeout(t); reject(e); });
  });
}

/* 等到本层推进（run.layer > from）或结算 */
async function waitAdvance(sse, fromLayer) {
  for (;;) {
    const ev = await nextEvent(sse);
    if (ev.event === 'run' && ev.data && ev.data.run && ev.data.run.layer > fromLayer) {
      return { kind: 'run', run: ev.data.run };
    }
    if (ev.event === 'run_settle') return { kind: 'settle', result: ev.data && ev.data.result };
  }
}

/* 等到满足谓词的 run 视图。
   注意：startRun / 普通出手也会广播 run，队列里常有"旧视图"，
   所以不能直接取第一个 run，必须按内容筛选。 */
async function waitRun(sse, pred, timeoutMs = 6000) {
  const t0 = Date.now();
  for (;;) {
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting run predicate');
    const ev = await nextEvent(sse, timeoutMs);
    if (ev.event === 'run' && ev.data && ev.data.run && pred(ev.data.run)) return ev.data.run;
  }
}

async function mkPlayer(name, power, pathId, extra) {
  const body = { name: uniq(name), power };
  if (pathId !== undefined) body.path = pathId;
  if (extra) Object.assign(body, extra);
  const j = await post('/api/join', body);
  assert.equal(j.ok, true, 'join 应成功：' + JSON.stringify(j));
  const sse = openSse(BASE + '/api/stream?token=' + encodeURIComponent(j.player.token));
  const hello = await waitFor(sse, 'hello');
  return { token: j.player.token, id: j.player.id, name: j.player.name, power: j.player.power, path: j.player.path, sse, hello };
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

async function strikeAll(ps) {
  for (const p of ps) {
    const r = await post('/api/run/strike', { token: p.token });
    assert.equal(r.ok, true, 'strike 应成功：' + JSON.stringify(r));
  }
}

/* 推一层：可选先让某人放技能，然后全员出手，返回结果 */
async function playLayer(ps, layer, skillBy) {
  if (skillBy) {
    const r = await post('/api/run/skill', { token: skillBy.token });
    assert.equal(r.ok, true, '技能应成功：' + JSON.stringify(r));
  }
  await strikeAll(ps);
  return waitAdvance(ps[0].sse, layer);
}

/* 分奖预言器：池子不变，按 (个人战力 × 道途权重) 归一化切 */
function expectShares(powers, paths, layer) {
  const pool = Math.floor(NEED[layer - 1] * 0.5 * (layer === 5 ? 1.5 : 1));
  const w = powers.map((p, i) => p * (paths[i] === 'sword' ? SWORD_W : 1));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map(x => Math.max(Math.floor((pool * x) / sum), 1));
}

before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    /* #75：本套用 legacy body.power 登录（无快照），故显式开启闸门；道途逻辑本身与战力来源无关 */
    env: { ...process.env, SERVER_PORT: String(PORT), SERVER_OFFLINE_KICK_MS: '60000', SERVER_SETTLE_HOLD_MS: '3000', SERVER_LEGACY_POWER: '1' },
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

/* ---------------------------------- A1 ---------------------------------- */
test('A1 道途枚举：缺省剑修；非法 join / 非法改道途一律 BAD_PATH；目录不含系数', async () => {
  const plain = await mkPlayer('道', 3000);
  assert.equal(plain.path, 'sword', '不传 path 的旧客户端应缺省剑修');

  const bad = await post('/api/join', { name: uniq('邪'), power: 3000, path: 'godmode' });
  assert.equal(bad.ok, false, '非法道途的 join 必须被拒');
  assert.equal(bad.code, 'BAD_PATH');

  const bad2 = await post('/api/path', { token: plain.token, path: 'godmode' });
  assert.equal(bad2.ok, false);
  assert.equal(bad2.code, 'BAD_PATH');

  for (const id of ['sword', 'body', 'dan', 'array']) {
    const r = await post('/api/path', { token: plain.token, path: id });
    assert.equal(r.ok, true, '合法道途应接受：' + id);
    assert.equal(r.path, id);
  }

  const cat = plain.hello.paths || [];
  assert.equal(cat.length, 4, 'hello 应下发四条道途目录');
  const ids = cat.map(c => c.id).sort();
  assert.deepEqual(ids, ['array', 'body', 'dan', 'sword']);
  for (const c of cat) {
    assert.ok(c.name && c.role && c.skill && c.skill.name, '目录项应带名称/定位/技能名');
    assert.equal(c.contribMult, undefined, '系数不得下发到客户端（分奖权重）');
    assert.equal(c.arrayPct, undefined, '系数不得下发到客户端（点阵折扣）');
    assert.equal(c.warmPct, undefined, '系数不得下发到客户端（温养加成）');
  }
});

/* ---------------------------------- A2 ---------------------------------- */
test('A2 剑修分奖权重 ×1.15：池子不变只改切法；客户端塞倍率字段无效', async () => {
  /* A 剑修 / B 体修，同战力 4000。团队战力 = 8000×1.1 = 8800 ≥ 第 1 层 800。 */
  const A = await mkPlayer('剑', 4000, 'sword');
  const B = await mkPlayer('体', 4000, 'body');
  /* 伪造尝试：在改道途时塞入倍率字段（服务器只该认 body.path） */
  const fake = await post('/api/path', { token: A.token, path: 'sword', pathMult: 99, contribMult: 99, powerMult: 99 });
  assert.equal(fake.ok, true, '带垃圾字段的合法道途请求应成功（垃圾字段被忽略）');
  assert.equal(fake.path, 'sword');

  await mkRoom([A, B]);
  await startRun([A, B]);

  await strikeAll([A, B]);
  const out = await waitAdvance(A.sse, 1);
  assert.equal(out.kind, 'run', '第 1 层应顺利突破');
  assert.equal(out.run.layer, 2);

  const exp = expectShares([4000, 4000], ['sword', 'body'], 1);
  const gotA = (out.run.stones || []).find(s => s.id === A.id);
  const gotB = (out.run.stones || []).find(s => s.id === B.id);
  assert.ok(gotA && gotB, 'run 视图应带本局灵石账');
  assert.equal(gotA.stone, exp[0], '剑修分奖必须 == 权重预言值（213）');
  assert.equal(gotB.stone, exp[1], '体修分奖必须 == 权重预言值（186）');
  assert.ok(gotA.stone > gotB.stone, '同战力下剑修应多拿');
  assert.equal(exp[0], 213, '池子 400、权重 4600/4000 → 213/186');
  assert.equal(exp[1], 186);
  assert.ok(gotA.stone < 400, '伪造 contribMult=99 若生效会拿走近全部池子（≈397），必须没有');
});

/* ---------------------------------- A3 ---------------------------------- */
test('A3 阵修点阵：本层门槛 ×0.85、换层即清、每局 2 次', async () => {
  const A = await mkPlayer('阵', 5000, 'array');
  const B = await mkPlayer('剑', 5000, 'sword');
  const id = await mkRoom([A, B]);
  await startRun([A, B]);

  const s1 = await post('/api/run/skill', { token: A.token });
  assert.equal(s1.ok, true);
  assert.equal(s1.skill, 'array');
  assert.equal(s1.usesLeft, 1, '点阵每局 2 次，用掉一次应剩 1');

  let run = await waitRun(A.sse, r => r.arrayActive === true);
  assert.equal(run.baseNeedPower, 800, '原门槛应仍可见（展示用）');
  assert.equal(run.needPower, Math.floor(800 * 0.85), '点阵生效：800 → 680');
  assert.equal(run.arrayActive, true);

  await strikeAll([A, B]);
  const adv = await waitAdvance(A.sse, 1);
  assert.equal(adv.kind, 'run');
  assert.equal(adv.run.layer, 2);
  assert.equal(adv.run.arrayActive, false, '点阵是"本层"效果，换层必须清掉');
  assert.equal(adv.run.needPower, 1600, '换层后门槛回到原值');

  const s2 = await post('/api/run/skill', { token: A.token });
  assert.equal(s2.ok, true);
  assert.equal(s2.usesLeft, 0);

  await strikeAll([A, B]);
  const adv2 = await waitAdvance(A.sse, 2);
  assert.equal(adv2.kind, 'run');

  const s3 = await post('/api/run/skill', { token: A.token });
  assert.equal(s3.ok, false, '第 3 次点阵必须被拒');
  assert.equal(s3.code, 'NO_SKILL_USES');
  assert.ok(id, '房间号存在');
});

/* ---------------------------------- A4 ---------------------------------- */
test('A4 体修护持：战力不足时硬撑过层、此层无灵石、全境判打通', async () => {
  /* A 体修 4000 + B 剑修 4000 → 团队 8800：1~4 层（800/1600/3200/6400）过，第 5 层（12800）不足。 */
  const A = await mkPlayer('守', 4000, 'body');
  const B = await mkPlayer('剑', 4000, 'sword');
  await mkRoom([A, B]);
  await startRun([A, B]);

  let expStone = 0;
  let expSword = 0;
  for (let layer = 1; layer <= 4; layer++) {
    await strikeAll([A, B]);
    const adv = await waitAdvance(A.sse, layer);
    assert.equal(adv.kind, 'run', '第 ' + layer + ' 层应突破');
    assert.equal(adv.run.layer, layer + 1);
    const e = expectShares([4000, 4000], ['body', 'sword'], layer);
    expStone += e[0];
    expSword += e[1];
    if (layer === 4) {
      /* 第 5 层：先用护持，再出手 */
      const s = await post('/api/run/skill', { token: A.token });
      assert.equal(s.ok, true, '护持应可声明：' + JSON.stringify(s));
      assert.equal(s.skill, 'guard');
      await strikeAll([A, B]);
    }
  }
  const fin = await waitAdvance(A.sse, 5);
  assert.equal(expStone, 2790, '体修 1~4 层预言值');
  assert.equal(expSword, 3206, '剑修 1~4 层预言值');
  assert.equal(fin.kind, 'settle', '护持过层后应结算（而不是继续）');
  assert.equal(fin.result.cleared, true, '护持让缺战力的队伍硬撑过第 5 层 → 判打通');
  assert.equal(fin.result.layers, 5);
  const ra = (fin.result.rewards || []).find(r => r.id === A.id);
  const rb = (fin.result.rewards || []).find(r => r.id === B.id);
  assert.ok(ra && rb);
  assert.equal(ra.stone, expStone, '护持过的那层不给灵石：体修总额应 == 前 4 层之和');
  assert.equal(rb.stone, expSword, '护持过的那层不给灵石：剑修总额应 == 前 4 层之和');
});

/* ---------------------------------- A5 ---------------------------------- */
test('A5 丹修温养：每层 +8%、上限 3 层、跨层累计、次数用尽拒绝', async () => {
  const A = await mkPlayer('丹', 4000, 'dan');
  const B = await mkPlayer('剑', 4000, 'sword');
  await mkRoom([A, B]);
  await startRun([A, B]);

  const base = Math.floor(8000 * (1 + TEAM_BONUS) * 1);            /* 8800 */
  const at = n => Math.floor(8000 * (1 + TEAM_BONUS) * (1 + 0.08 * n));

  for (let layer = 1; layer <= 3; layer++) {
    const s = await post('/api/run/skill', { token: A.token });
    assert.equal(s.ok, true, '第 ' + layer + ' 层催丹应成功：' + JSON.stringify(s));
    assert.equal(s.skill, 'brew');
    const run = await waitRun(A.sse, r => r.warm === layer);
    assert.equal(run.warm, layer, '温养层数应累加到 ' + layer);
    assert.equal(run.teamPower, at(layer), '温养满 ' + layer + ' 层时队伍战力应 == 预言值');
    assert.ok(run.teamPower > base, '温养必须真的提高队伍战力');

    await strikeAll([A, B]);
    const adv = await waitAdvance(A.sse, layer);
    assert.equal(adv.kind, 'run', '第 ' + layer + ' 层应突破（' + at(layer) + ' ≥ ' + NEED[layer - 1] + '）');
    if (layer < 3) assert.equal(adv.run.warm, layer, '温养跨层累计，不得清零');
  }

  const s4 = await post('/api/run/skill', { token: A.token });
  assert.equal(s4.ok, false, '催丹每局 3 次，第 4 次必须被拒');
  assert.equal(s4.code, 'NO_SKILL_USES');
  assert.equal(at(3), 10912, '3 层温养 = 8800 × 1.24');
  assert.ok(at(3) < 12800, '3 层温养仍不足以单凭战力过第 5 层（避免温养变成无脑解）');
});

/* ---------------------------------- A6 ---------------------------------- */
test('A6 断线续接：沿用已登记道途，body.path 改不动（堵重连换道途）', async () => {
  const A = await mkPlayer('续', 3000, 'dan');
  assert.equal(A.path, 'dan');
  await mkRoom([A]);
  const before = await post('/api/path', { token: A.token, path: 'dan' });
  assert.equal(before.ok, true);

  /* 假装断线重连：带同一 token，另外硬塞 path=array */
  const r = await post('/api/join', { token: A.token, name: A.name, power: 3000, path: 'array' });
  assert.equal(r.ok, true, '续接应成功：' + JSON.stringify(r));
  assert.equal(r.resumed, true, '应走续接分支');
  assert.equal(r.player.path, 'dan', '续接必须沿用服务器已登记道途，忽略 body.path');

  /* 续接后在大厅（未开战）仍可正常改道途 —— 走的是 /api/path，不是 join */
  const after = await post('/api/path', { token: A.token, path: 'array' });
  assert.equal(after.ok, true);
  assert.equal(after.path, 'array');
});

/* ---------------------------------- A7 ---------------------------------- */
test('A7 开战中改道途 BAD_PHASE；已出手再放技能 ALREADY_STRUCK', async () => {
  const A = await mkPlayer('锁', 4000, 'array');
  const B = await mkPlayer('伴', 4000, 'sword');
  await mkRoom([A, B]);
  await startRun([A, B]);

  const p = await post('/api/path', { token: A.token, path: 'body' });
  assert.equal(p.ok, false, '开战后改道途必须被拒');
  assert.equal(p.code, 'BAD_PHASE');

  const st = await post('/api/run/strike', { token: A.token });
  assert.equal(st.ok, true);
  const sk = await post('/api/run/skill', { token: A.token });
  assert.equal(sk.ok, false, '已出手不能再放技能');
  assert.equal(sk.code, 'ALREADY_STRUCK');
});

/* ---------------------------------- A8 ---------------------------------- */
test('A8 源码守卫：客户端只传 id 不持系数；服务器不读客户端倍率字段', async () => {
  const net = readFileSync(path.join(ROOT, 'js', 'net.js'), 'utf8');
  assert.ok(/connect:\s*function\s*\(baseUrl,\s*name,\s*power,\s*resumeToken,\s*snapshot,\s*path\)/.test(net),
    'net.js connect 必须接受第 6 参 path');
  assert.ok(/joinBody\.path\s*=\s*String\(path\)/.test(net), 'net.js 应把 path 送进 join body');
  assert.ok(!/contribMult|arrayPct|warmPct/.test(net), 'net.js 不得持有任何道途系数');

  const game = readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8');
  assert.ok(/Net\.api\('\/api\/path'/.test(game), 'game.js 应通过 /api/path 改道途');
  assert.ok(/Net\.api\('\/api\/run\/skill'/.test(game), 'game.js 应通过 /api/run/skill 声明技能');
  assert.ok(!/contribMult/.test(game), 'game.js 不得持有分奖权重（系数只在服务器）');
  assert.ok(!/const PATHS\s*=/.test(game), 'game.js 不得自带道途系数表（目录必须由服务器 hello 下发）');

  const srv = readFileSync(path.join(ROOT, 'server', 'server.mjs'), 'utf8');
  assert.ok(!/body\.pathMult|body\.contribMult|body\.powerMult|body\.pathPct/.test(srv),
    '服务器不得读取任何客户端倍率字段（只认 body.path 枚举）');
  assert.ok(/const PATHS = \{/.test(srv), '服务器应有唯一的道途常量表');
});
