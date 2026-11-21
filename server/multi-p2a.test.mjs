/* server/multi-p2a.test.mjs — P2-A 服务器权威角色档案（第 130 轮）
 *
 * 纪律：不 mock 服务器、不伪造事件——真子进程 + 真 HTTP/SSE。
 *
 * 覆盖（enforce 档是本轮的核心主张：伪造养成快照这条���被物理删除）：
 *   T1 enforce：提交**满级养成快照**，服务器给的战力仍是档案初始值（1000），
 *               而不是满级真号战力 → 边界②在这一档被根治。
 *   T2 enforce：服务器结算推进档案（层数/修为/强化），档案派生战力随之上涨。
 *   T3 enforce：join 请求里带 profile 字段一律被忽略（客户端不能写档案）。
 *   T4 enforce：同 token 续接不重置档案、不刷战力。
 *   T5 observe：档案照建照推，但战力仍以快照为准（可对比"档案算出多少 vs 你报了多少"）。
 *   T6 off：默认档行为逐字不变（现状无回归），且**不建档**。
 *
 * 运行：node --test server/multi-p2a.test.mjs
 * 本套起三个服务器实例（enforce / observe / off），端口互不重叠。
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MOD = 0;
const PORT_ENFORCE = 9009;
const PORT_OBSERVE = 9010;
const PORT_OFF = 9011;

const children = [];
const streams = [];
let seq = 0;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function uniq(p) { seq += 1; return p + seq; }

/* ---- 预言器：与 server.mjs recomputePower 逐项一致（抄自 multi-p0b.test.mjs） ---- */
const GONGS = [{ rate: 1.03, max: 10 }, { rate: 1.04, max: 10 }, { rate: 1.05, max: 10 }];
const WEAPON_MULT = [1.0, 1.05, 1.10, 1.20, 1.35, 1.44, 1.53, 1.63, 1.73, 1.85];
const ENHANCE_POW_RATE = 0.05, ENHANCE_MAX = 20, RANK_CAP = 25, GONG_CAP = 10;
const ART_BG_MAX = 0.56, WU_POW_CAP_PCT = 52, AFFIX_POW_CAP_PCT = 22, DAN_POW_CAP_FRAC = 0.55, DT_POW_CAP_PCT = 22.5;
const PET_POWER_CAP = 2160000, EQUIP_POWER_CAP = 4500, MAX_POWER = 1e10;
function clampNum(v, lo, hi, dflt) { const n = (typeof v === 'number' && Number.isFinite(v)) ? v : dflt; return Math.min(hi, Math.max(lo, n)); }
function expectedPower(snap) {
  const rank = clampNum(snap.rank, 0, RANK_CAP, 0);
  const gLv = Array.isArray(snap.gongLvs) ? snap.gongLvs : [];
  const gongMult = GONGS.reduce((a, g, i) => a * Math.pow(g.rate, clampNum(gLv[i], 0, GONG_CAP, 0)), 1);
  const weapon = clampNum(snap.weapon, 0, WEAPON_MULT.length - 1, 0);
  const weaponMult = WEAPON_MULT[weapon] || 1;
  const weaponLv = clampNum(snap.weaponLv, 0, ENHANCE_MAX, 0);
  const enhance = 1 + weaponLv * ENHANCE_POW_RATE;
  const core = 10 * 100 * Math.pow(1.5, rank) * gongMult * weaponMult * enhance;
  const affixPct = clampNum(snap.affixPct, 0, AFFIX_POW_CAP_PCT, 0);
  const wuPct = clampNum(snap.wuPct, 0, WU_POW_CAP_PCT, 0);
  const artBgPct = clampNum(snap.artBgPct, 0, ART_BG_MAX, 0);
  const danPowPct = clampNum(snap.danPowPct, 0, DAN_POW_CAP_FRAC, 0);
  const dtPowPct = clampNum(snap.dtPowPct, 0, DT_POW_CAP_PCT, 0);
  const mult = (1 + affixPct / 100) * (1 + wuPct / 100) * (1 + artBgPct) * (1 + danPowPct) * (1 + dtPowPct / 100);
  const petPower = clampNum(snap.petPower, 0, PET_POWER_CAP, 0);
  const equipPower = clampNum(snap.equipPower, 0, EQUIP_POWER_CAP, 0);
  return clampNum(Math.floor(core * mult) + petPower + equipPower, 1, MAX_POWER);
}

/* 满级养成快照（各轴都顶格）——用来证明"伪造它也没用" */
const FULL = {
  rank: 25, gongLvs: [10, 10, 10], weapon: 9, weaponLv: 20,
  affixPct: 22, wuPct: 52, artBgPct: 0.56, danPowPct: 0.55, dtPowPct: 22.5,
  petPower: 2160000, equipPower: 4500
};
const FULL_POWER = expectedPower(FULL);
/* 档案初始战力：rank0 / 无养成 → 10 × POW_K = 1000（与 P0-B 的 1000 同源） */
const PROFILE_INIT_POWER = 1000;

/* ===================== 服务器实例 ===================== */
async function startServer(port, mode) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    env: {
      ...process.env,
      SERVER_PORT: String(port),
      SERVER_PROFILE_MODE: mode,
      SERVER_OFFLINE_KICK_MS: '60000',
      SERVER_SETTLE_HOLD_MS: '200'
    },
    stdio: 'ignore'
  });
  children.push(child);
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(base + '/api/health');
      const j = await r.json();
      if (j.ok) {
        assert.equal(j.profileMode, mode, mode + ' 档位应被服务器接受（实测 ' + j.profileMode + '）');
        return { base, child };
      }
    } catch { /* 未起 */ }
    await sleep(150);
  }
  throw new Error('server did not start: ' + mode);
}

let ENV = null;   /* { enforce:{base}, observe:{base}, off:{base} } */

before(async () => {
  const e = await startServer(PORT_ENFORCE, 'enforce');
  const o = await startServer(PORT_OBSERVE, 'observe');
  const f = await startServer(PORT_OFF, 'off');
  ENV = { enforce: e, observe: o, off: f };
});

after(() => {
  streams.forEach(s => { try { s.close(); } catch { /* noop */ } });
  children.forEach(c => { try { c.kill(); } catch { /* noop */ } });
});

/* ===================== HTTP / SSE 小工具（按 base 分实例） ===================== */
async function post(base, p, body) {
  const r = await fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return r.json();
}
async function getJson(base, p) {
  const r = await fetch(base + p);
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

/* 等 "run" 或 "run_settle" 事件之一 */
async function waitRunOrSettle(sse, timeoutMs = 6000) {
  for (;;) {
    const ev = await nextEvent(sse, timeoutMs);
    if (!ev) return { run: null, settled: null };
    if (ev.event === 'run') return { run: ev.data.run, settled: null };
    if (ev.event === 'run_settle') return { run: null, settled: ev.data };
  }
}

/* 登录（可带快照/额外字段），返回玩家信息 + SSE */
async function mkPlayer(base, name, snapshot, pathId, extra) {
  const body = { name: uniq(name) };
  if (snapshot !== undefined) body.snapshot = snapshot;
  if (pathId !== undefined) body.path = pathId;
  if (extra) Object.assign(body, extra);
  const j = await post(base, '/api/join', body);
  assert.equal(j.ok, true, 'join 应成功：' + JSON.stringify(j));
  const sse = openSse(base + '/api/stream?token=' + encodeURIComponent(j.player.token));
  await nextEvent(sse, 6000);   // hello
  return {
    token: j.player.token, id: j.player.id, name: j.player.name,
    power: j.player.power, powerSource: j.player.powerSource, path: j.player.path, sse
  };
}

async function mkRoom(base, ps) {
  const r = await post(base, '/api/room/create', { token: ps[0].token });
  assert.equal(r.ok, true, 'create 应成功：' + JSON.stringify(r));
  for (let i = 1; i < ps.length; i++) {
    const j = await post(base, '/api/room/join', { token: ps[i].token, roomId: r.room.id });
    assert.equal(j.ok, true, 'join room 应成功：' + JSON.stringify(j));
  }
  for (const p of ps) {
    const rr = await post(base, '/api/room/ready', { token: p.token, ready: true });
    assert.equal(rr.ok, true, 'ready 应成功：' + JSON.stringify(rr));
  }
  return r.room.id;
}

/* ===================== T1 ===================== */
test('T1 enforce：伪造满级养成快照无效，战力仍是档案初始值', async () => {
  const base = ENV.enforce.base;
  const A = await mkPlayer(base, '伪', FULL, 'sword');
  assert.equal(A.powerSource, 'profile', 'enforce 档的来源必须标 profile');
  assert.equal(A.power, PROFILE_INIT_POWER, 'enforce 档满级快照不得带来任何战力（实测 ' + A.power + '）');
  assert.notEqual(A.power, FULL_POWER, '伪造满级快照必须拿不到满级真号战力（满级真号=' + FULL_POWER + '）');
  assert.ok(A.power < FULL_POWER / 1000, '档案初始战力应比满级真号低三个数量级以上');
  /* 档案只读接口：存在且是服务器给的内容 */
  const pf = await getJson(base, '/api/profile?token=' + encodeURIComponent(A.token));
  assert.equal(pf.ok, true, '档案接口应可用');
  assert.equal(pf.profile.cultivation, 0, '新档案修为应为 0');
  assert.equal(pf.profile.weaponLv, 0, '新档案强化应为 0');
  assert.equal(pf.profile.rank, 0, '新档案境界应为 0');
  assert.equal(pf.profile.power, PROFILE_INIT_POWER, '档案派生战力应为 1000');
});

/* ===================== T2 ===================== */
test('T2 enforce：服务器结算推进档案，档案派生战力随之上涨', async () => {
  const base = ENV.enforce.base;
  const A = await mkPlayer(base, '推', undefined, 'sword');
  const B = await mkPlayer(base, '推2', undefined, 'sword');
  const before = A.power;
  await mkRoom(base, [A, B]);
  const st = await post(base, '/api/room/start', { token: A.token });
  assert.equal(st.ok, true, 'start 应成功');
  await waitRunAsync(A.sse, r => Array.isArray(r.skills) && r.skills.length >= 2);
  let settled = null;
  for (let guard = 0; guard < 8 && !settled; guard++) {
    await post(base, '/api/run/strike', { token: A.token });
    await post(base, '/api/run/strike', { token: B.token });
    const ev = await waitRunOrSettle(A.sse);
    if (ev.settled) settled = ev.settled;
  }
  for (let i = 0; i < 40 && !settled; i++) {
    const e = await nextEvent(A.sse, 6000);
    if (e.event === 'run_settle') settled = e.data;
  }
  assert.ok(settled, '两名档案号应跑到结算（清场或团灭）：' + JSON.stringify(settled));
  const pf = await getJson(base, '/api/profile?token=' + encodeURIComponent(A.token));
  assert.equal(pf.ok, true, '结算后档案应可读');
  assert.ok(pf.profile.layersCleared >= 1, '档案应记下突破的层数（实测 ' + pf.profile.layersCleared + '）');
  assert.ok(pf.profile.cultivation > 0, '档案修为应随通关增长（实测 ' + pf.profile.cultivation + '）');
  assert.ok(pf.profile.weaponLv >= 1, '档案强化应随通关增长（实测 ' + pf.profile.weaponLv + '）');
  assert.ok(pf.profile.power > before, '档案派生战力必须上涨（' + before + ' → ' + pf.profile.power + '）');
  assert.ok(pf.profile.power <= FULL_POWER, '档案战力不得越过合法满级上限');
});

/* ===================== T3 ===================== */
test('T3 enforce：join 带 profile 字段一律被忽略（客户端不能写档案）', async () => {
  const base = ENV.enforce.base;
  const A = await mkPlayer(base, '写', undefined, 'sword', { profile: { cultivation: 999999, weaponLv: 20, rank: 25, stones: 1e12 } });
  assert.equal(A.power, PROFILE_INIT_POWER, '客户端塞的档案不得影响战力');
  const pf = await getJson(base, '/api/profile?token=' + encodeURIComponent(A.token));
  assert.equal(pf.ok, true);
  assert.equal(pf.profile.cultivation, 0, '档案修为必须仍是 0（客户端写入被忽略）');
  assert.equal(pf.profile.weaponLv, 0, '档案强化必须仍是 0');
  assert.equal(pf.profile.rank, 0, '档案境界必须仍是 0');
  assert.equal(pf.profile.stones, 0, '档案灵石必须仍是 0');
  /* 源码守卫：服务器不得暴露任何写档案的路由 */
  const srv = readFileSync(path.join(ROOT, 'server', 'server.mjs'), 'utf8');
  assert.ok(!/\['POST',\s*'\/api\/profile'/.test(srv), '不得存在写档案的接口（POST /api/profile）');
});

/* ===================== T4 ===================== */
test('T4 enforce：同 token 续接不重置档案、不刷战力', async () => {
  const base = ENV.enforce.base;
  const A = await mkPlayer(base, '续', undefined, 'sword');
  const B = await mkPlayer(base, '续2', undefined, 'sword');
  await mkRoom(base, [A, B]);
  const st = await post(base, '/api/room/start', { token: A.token });
  assert.equal(st.ok, true);
  await waitRunAsync(A.sse, r => Array.isArray(r.skills) && r.skills.length >= 2);
  let settled = null;
  for (let guard = 0; guard < 8 && !settled; guard++) {
    await post(base, '/api/run/strike', { token: A.token });
    await post(base, '/api/run/strike', { token: B.token });
    const ev = await waitRunOrSettle(A.sse);
    if (ev.settled) settled = ev.settled;
  }
  const pf1 = await getJson(base, '/api/profile?token=' + encodeURIComponent(A.token));
  assert.ok(pf1.profile.layersCleared >= 1, '先跑一遍拿档案进度');
  /* 续接：同 token 再 join（服务器 P0-C 的续接路径） */
  const again = await post(base, '/api/join', { name: uniq('续'), token: A.token });
  assert.equal(again.ok, true, '续接应成功：' + JSON.stringify(again));
  assert.equal(again.resumed, true, '应识别为续接');
  assert.equal(again.player.power, pf1.profile.power, '续接战力必须等于档案战力（不得重置或刷取）');
  const pf2 = await getJson(base, '/api/profile?token=' + encodeURIComponent(A.token));
  assert.equal(pf2.profile.cultivation, pf1.profile.cultivation, '续接不得改动档案修为');
  assert.equal(pf2.profile.layersCleared, pf1.profile.layersCleared, '续接不得改动档案层数');
});

/* ===================== T5 ===================== */
test('T5 observe：档案照建照推，但战力仍以快照为准（可对比差异）', async () => {
  const base = ENV.observe.base;
  const A = await mkPlayer(base, '观', FULL, 'sword');
  assert.equal(A.powerSource, 'snapshot', 'observe 档战力仍按快照算（现状不变）');
  assert.equal(A.power, FULL_POWER, 'observe 档应与 P0-B 完全一致');
  const pf = await getJson(base, '/api/profile?token=' + encodeURIComponent(A.token));
  assert.equal(pf.ok, true, 'observe 档也要建档（用于对比）');
  assert.equal(pf.profile.cultivation, 0, '刚建档时修为为 0');
  assert.equal(pf.profile.profilePower, PROFILE_INIT_POWER, '档案派生战力（1000）远小于快照战力（' + FULL_POWER + '）→ 差异可量化');
  assert.equal(pf.profile.power, FULL_POWER, 'observe 档生效战力仍是快照战力');
  assert.equal(pf.profile.mode, 'observe', '档案摘要应标出当前档位');
});

/* ===================== T7（P2-A-2）=====================
 * 缺口：enforce 档下档案只有 weaponLv 一条线 → **四个道途拿到完全相同的养成投入**，
 * 只有剑修吃得到共鸣，P1-B 的"道途=流派"在根治档下被抹平。
 * 期望（规则来自服务器常量，不是抄实现输出）：
 *   档案按**服务器登记的道途**分配养成轴投入（剑修→法宝强化 / 体修→装备护体 / 丹修→淬丹 / 阵修→悟道），
 *   每突破一层 +1 档，其余轴为 0；共鸣随之按各自轴权重上涨（丹修 1.0 权重最高，剑修 0.6 最低）。
 */
const AXIS_RULES = {
  sword: { weaponLv: 2, equipPower: 0, affixPct: 0, danPowPct: 0, wuPct: 0 },
  body: { weaponLv: 0, equipPower: 45, affixPct: 2.2, danPowPct: 0, wuPct: 0 },
  dan: { weaponLv: 0, equipPower: 0, affixPct: 0, danPowPct: 0.055, wuPct: 0 },
  array: { weaponLv: 0, equipPower: 0, affixPct: 0, danPowPct: 0, wuPct: 5.2 }
};
/* 轴权重与上限（抄自 server.mjs pathAxisScore + recomputePower 钳制常量，同一口径） */
function expectedSynergy(pathId, layers) {
  const r = AXIS_RULES[pathId];
  const lv = layers * r.weaponLv, eq = layers * r.equipPower;
  const af = layers * r.affixPct, dp = layers * r.danPowPct, wp = layers * r.wuPct;
  let score = 0;
  if (pathId === 'sword') score = Math.min(1, (lv / 20) * 0.6 + 0);
  else if (pathId === 'body') score = Math.min(1, (eq / 4500) * 0.7 + (af / 22) * 0.3);
  else if (pathId === 'dan') score = Math.min(1, dp / 0.55);
  else if (pathId === 'array') score = Math.min(1, (wp / 52) * 0.7 + 0);
  return +(15 * score).toFixed(4);
}

test('T7 enforce：档案按道途分配养成轴 → 四道途的共鸣各不相同（P1-B 在根治档下不失效）', async () => {
  const base = ENV.enforce.base;
  const A = await mkPlayer(base, '轴', undefined, 'sword');
  const B = await mkPlayer(base, '轴2', undefined, 'body');
  const C = await mkPlayer(base, '轴3', undefined, 'dan');
  const D = await mkPlayer(base, '轴4', undefined, 'array');
  const ps = [A, B, C, D];
  await mkRoom(base, ps);
  const st = await post(base, '/api/room/start', { token: A.token });
  assert.equal(st.ok, true, 'start 应成功');
  await waitRunAsync(A.sse, r => Array.isArray(r.skills) && r.skills.length >= 4);

  /* 出手到结算（团灭也算，结算层数由服务器判） */
  let settled = null;
  for (let guard = 0; guard < 12 && !settled; guard++) {
    for (const p of ps) await post(base, '/api/run/strike', { token: p.token });
    const ev = await waitRunOrSettle(A.sse);
    if (ev.settled) settled = ev.settled;
  }
  for (let i = 0; i < 40 && !settled; i++) {
    const e = await nextEvent(A.sse, 6000);
    if (e.event === 'run_settle') settled = e.data;
  }
  assert.ok(settled, '四人档案号应跑到结算');
  const layers = settled.result.layers;
  assert.ok(layers >= 1, '至少应突破一层（实测 ' + layers + '）');

  /* T7a：档案按道途分配轴投入，且只在自家轴上有投入 */
  for (const p of ps) {
    const pf = await getJson(base, '/api/profile?token=' + encodeURIComponent(p.token));
    assert.equal(pf.ok, true, '档案应可读');
    const r = AXIS_RULES[p.path];
    const exp = {
      weaponLv: layers * r.weaponLv,
      equipPower: layers * r.equipPower,
      danPowPct: +(layers * r.danPowPct).toFixed(6),
      wuPct: +(layers * r.wuPct).toFixed(6)
    };
    assert.equal(pf.profile.weaponLv, exp.weaponLv, p.path + ' 档案法宝强化应按自家轴增长');
    assert.equal(pf.profile.equipPower, exp.equipPower, p.path + ' 档案装备护体应按自家轴增长');
    assert.ok(Math.abs(pf.profile.danPowPct - exp.danPowPct) < 1e-9, p.path + ' 档案淬丹应按自家轴增长');
    assert.ok(Math.abs(pf.profile.wuPct - exp.wuPct) < 1e-9, p.path + ' 档案悟道应按自家轴增长');
    /* 别人的轴必须是 0 */
    for (const other of ['sword', 'body', 'dan', 'array']) {
      if (other === p.path) continue;
      const o = AXIS_RULES[other];
      if (o.weaponLv) assert.equal(pf.profile.weaponLv, 0, p.path + ' 不该拿到剑修轴投入');
      if (o.equipPower) assert.equal(pf.profile.equipPower, 0, p.path + ' 不该拿到体修轴投入');
      if (o.danPowPct) assert.ok(Math.abs(pf.profile.danPowPct) < 1e-9, p.path + ' 不该拿到丹修轴投入');
      if (o.wuPct) assert.ok(Math.abs(pf.profile.wuPct) < 1e-9, p.path + ' 不该拿到阵修轴投入');
    }
  }

  /* T7b：再开一局，读共鸣——四个道途必须各不相同，且与规则期望一致 */
  /* 等结算驻留结束回 lobby */
  for (let i = 0; i < 40; i++) {
    const e = await nextEvent(A.sse, 6000);
    if (e.event === 'room' && e.data && e.data.room && e.data.room.phase === 'lobby') break;
  }
  for (const p of ps) await post(base, '/api/room/ready', { token: p.token, ready: true });
  const st2 = await post(base, '/api/room/start', { token: A.token });
  assert.equal(st2.ok, true, '二次开局应成功');
  const run = await waitRunAsync(A.sse, r => Array.isArray(r.skills) && r.skills.length >= 4);
  const got = {};
  for (const p of ps) {
    const s = run.skills.find(x => x.id === p.id);
    assert.ok(s, 'run.skills 应含 ' + p.path);
    got[p.path] = s.synergyPct;
  }
  const vals = Object.values(got);
  assert.ok(vals.every(v => v > 0), '四道途结算后都应有共鸣（实测 ' + JSON.stringify(got) + '）');
  assert.equal(new Set(vals).size, 4, '四道途的共鸣值必须互不相同（实测 ' + JSON.stringify(got) + '）');
  assert.ok(got.dan > got.array && got.array > got.sword && got.sword > got.body,
    '共鸣大小应按轴权重与档案分配（丹 1.0 > 阵 0.7 > 剑 0.6[仅强化那半] > 体 0.37）排序，实测 ' + JSON.stringify(got));
  for (const p of ps) {
    const exp = expectedSynergy(p.path, layers);
    /* 共鸣值下发时按 0.1% 舍入（3.15 → 3.2），故容差取 0.11 */
    assert.ok(Math.abs(got[p.path] - exp) < 0.11, p.path + ' 共鸣应约等于 ' + exp + '%（实测 ' + got[p.path] + '%）');
  }
});

/* ===================== T6 ===================== */
test('T6 off：默认档行为逐字不变（无回归），且不建档', async () => {
  const base = ENV.off.base;
  const A = await mkPlayer(base, '旧', FULL, 'sword');
  assert.equal(A.powerSource, 'snapshot', 'off 档来源仍是 snapshot');
  assert.equal(A.power, FULL_POWER, 'off 档应与 P0-B 完全一致（满级快照 → 满级重算值）');
  const pf = await getJson(base, '/api/profile?token=' + encodeURIComponent(A.token));
  assert.equal(pf.ok, false, 'off 档不建档');
  assert.equal(pf.code, 'NO_PROFILE', 'off 档应回 NO_PROFILE（实测 ' + pf.code + '）');
  /* 无快照登录在 off 档仍是 legacy 关闭（#75 语义不变） */
  const B = await post(base, '/api/join', { name: uniq('旧2') });
  assert.equal(B.ok, false, 'off 档无快照登录仍应被拒');
  assert.equal(B.code, 'LEGACY_DISABLED', '应是 LEGACY_DISABLED（实测 ' + B.code + '）');
});
