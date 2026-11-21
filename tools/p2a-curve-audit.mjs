/* tools/p2a-curve-audit.mjs —— 《P2-A-3：四道途成长曲线与 NEED 对齐度只读审计》的测量工具
 *
 * 只读声明：
 *   · 本脚本**不修改任何产品代码**（server/*.mjs、js/* 一行不动）；
 *   · 只做三件事：起一个 enforce 档服务器 → 用真实接口登录/组队/通关 → 读 GET /api/profile 取档案；
 *   · 产出原始数据（JSON + 可读表），供审计报告引用。
 *
 * 要回答的问题（制作人指定）：
 *   ① 技术正确：每个道途是否都能获得**对应**的成长轴？（已由 T7 覆盖，这里复核）
 *   ② 数值合理：各道途的成长收益与实际 NEED 难度是否相匹配？（**尚无证据**，本脚本取证）
 *
 * 运行：node tools/p2a-curve-audit.mjs [局数，默认 10]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ROUNDS = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 10;
const PORT = 8170 + (process.pid % 30);
const BASE = 'http://127.0.0.1:' + PORT;

/* NEED 与副本规则（抄自 server/server.mjs，服务器权威常量） */
const NEED = [800, 1600, 3200, 6400, 12800];
const TOTAL_LAYERS = 5;
const TEAM_BONUS = 0.1;
/* 档案上限（抄自 server.mjs 钳制常量） */
const CAPS = { weaponLv: 20, equipPower: 4500, affixPct: 22, danPowPct: 0.55, wuPct: 52 };
/* 每层投入（抄自 server/profile.mjs 的 AXIS_GRANTS） */
const AXIS_GRANTS = {
  sword: { weaponLv: 2, equipPower: 0, affixPct: 0, danPowPct: 0, wuPct: 0 },
  body: { weaponLv: 0, equipPower: 45, affixPct: 2.2, danPowPct: 0, wuPct: 0 },
  dan: { weaponLv: 0, equipPower: 0, affixPct: 0, danPowPct: 0.055, wuPct: 0 },
  array: { weaponLv: 0, equipPower: 0, affixPct: 0, danPowPct: 0, wuPct: 5.2 }
};
const PATHS = ['sword', 'body', 'dan', 'array'];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const streams = [];
let seq = 0;
const uniq = (p) => { seq += 1; return p + seq; };

async function post(p, body) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}
async function getJson(p) { return (await fetch(BASE + p)).json(); }

function openSse(u) {
  const ac = new AbortController();
  const handle = { close: () => { try { ac.abort(); } catch { /* noop */ } } };
  handle.ready = fetch(u, { signal: ac.signal }).then(async (res) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = ''; const queue = []; let waiter = null; let closed = false;
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, i); buf = buf.slice(i + 2);
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
    return { next: () => new Promise((resolve) => {
      if (queue.length) return resolve(queue.shift());
      if (closed) return resolve(null);
      waiter = resolve;
    }) };
  });
  streams.push(handle);
  return handle;
}
function nextEvent(sse, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting event')), timeoutMs);
    (async () => {
      const s = await sse.ready;
      const ev = await s.next();
      clearTimeout(t);
      if (!ev) reject(new Error('stream closed')); else resolve(ev);
    })();
  });
}

async function mkPlayer(name, pathId) {
  const j = await post('/api/join', { name: uniq(name), path: pathId });
  if (!j.ok) throw new Error('join 失败：' + JSON.stringify(j));
  const sse = openSse(BASE + '/api/stream?token=' + encodeURIComponent(j.player.token));
  await nextEvent(sse);
  return { token: j.player.token, id: j.player.id, name: j.player.name, path: pathId, sse };
}
async function profileOf(p) {
  const j = await getJson('/api/profile?token=' + encodeURIComponent(p.token));
  return j.ok ? j.profile : null;
}

/* 打完一整局：建房 → 全 ready → start → 逐层出手 → 等结算 */
async function playOneRun(ps) {
  const r = await post('/api/room/create', { token: ps[0].token });
  const roomId = r.room.id;
  for (let i = 1; i < ps.length; i++) await post('/api/room/join', { token: ps[i].token, roomId });
  for (const p of ps) await post('/api/room/ready', { token: p.token, ready: true });
  const st = await post('/api/room/start', { token: ps[0].token });
  if (!st.ok) throw new Error('start 失败');
  /* 排空开局 run 事件 */
  for (;;) {
    const e = await nextEvent(ps[0].sse);
    if (e.event === 'run') break;
    if (e.event === 'room') continue;
  }
  let settled = null;
  for (let guard = 0; guard < 40 && !settled; guard++) {
    for (const p of ps) await post('/api/run/strike', { token: p.token });
    const e = await nextEvent(ps[0].sse);
    if (e.event === 'run_settle') { settled = e.data; break; }
  }
  if (!settled) throw new Error('未等到结算');
  /* 等房间回 lobby */
  for (let i = 0; i < 60; i++) {
    const e = await nextEvent(ps[0].sse);
    if (e.event === 'room' && e.data && e.data.room && e.data.room.phase === 'lobby') break;
  }
  return settled.result;
}

function teamPowerOf(profiles) {
  const total = profiles.reduce((a, p) => a + p.power, 0);
  return Math.floor(total * (1 + TEAM_BONUS * Math.max(profiles.length - 1, 0)));
}

async function runScenario(label, pathIds) {
  const ps = [];
  for (let i = 0; i < pathIds.length; i++) ps.push(await mkPlayer(label + i, pathIds[i]));
  const rounds = [];
  for (let k = 1; k <= ROUNDS; k++) {
    const before = [];
    for (const p of ps) before.push(await profileOf(p));
    const teamBefore = teamPowerOf(before);
    /* 该队力能过的层数（NEED 门槛） */
    let canPass = 0;
    for (const need of NEED) { if (teamBefore >= need) canPass++; else break; }
    const res = await playOneRun(ps);
    const after = [];
    for (const p of ps) after.push(await profileOf(p));
    rounds.push({
      round: k,
      teamPowerBefore: teamBefore,
      layersBefore: before[0].layersCleared,
      layersClearedThisRun: res.layers,
      cleared: res.cleared,
      teamPowerAfter: teamPowerOf(after),
      members: pathIds.map((pid, i) => ({
        path: pid,
        power: after[i].power,
        rank: after[i].rank,
        cultivation: after[i].cultivation,
        weaponLv: after[i].weaponLv,
        equipPower: after[i].equipPower,
        affixPct: after[i].affixPct,
        danPowPct: after[i].danPowPct,
        wuPct: after[i].wuPct,
        layersCleared: after[i].layersCleared
      }))
    });
  }
  return { label, pathIds, rounds };
}

async function main() {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    env: { ...process.env, SERVER_PORT: String(PORT), SERVER_PROFILE_MODE: 'enforce', SERVER_OFFLINE_KICK_MS: '60000', SERVER_SETTLE_HOLD_MS: '200' },
    stdio: 'ignore'
  });
  try {
    let health = null;
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(BASE + '/api/health');
        const j = await r.json();
        if (j.ok) { health = j; break; }
      } catch { /* 还没起来 */ }
      await sleep(150);
    }
    if (!health) throw new Error('server did not start');
    if (health.profileMode !== 'enforce') throw new Error('档位不对：' + health.profileMode);
    const scenarios = [];
    scenarios.push(await runScenario('四人', PATHS));
    scenarios.push(await runScenario('双人', ['sword', 'dan']));
    scenarios.push(await runScenario('三人', ['sword', 'body', 'dan']));

    const out = {
      auditedAt: new Date().toISOString(),
      rounds: ROUNDS,
      constants: { NEED, TOTAL_LAYERS, TEAM_BONUS, CAPS, AXIS_GRANTS },
      scenarios
    };
    fs.writeFileSync(path.join(ROOT, 'evidence', 'p2a-curve-audit.json'), JSON.stringify(out, null, 2));

    /* 可读表 */
    console.log('\n══ P2-A-3 成长曲线 × NEED 对齐度 · 只读实测 ══\n');
    for (const sc of scenarios) {
      console.log('── 场景：' + sc.label + '（' + sc.pathIds.join(' / ') + '）──');
      console.log('局次 | 队力(前) | 本局层数 | 档案战力(各道途) | rank | 修为 | 各轴(剑:强化 体:装备/词缀 丹:淬丹 阵:悟道) | 下一层门槛');
      for (const r of sc.rounds) {
        const ms = r.members.map(m => m.path + '=' + m.power).join(' ');
        const ax = r.members.map(m => {
          if (m.path === 'sword') return '剑:' + m.weaponLv;
          if (m.path === 'body') return '体:' + m.equipPower + '/' + m.affixPct;
          if (m.path === 'dan') return '丹:' + m.danPowPct;
          return '阵:' + m.wuPct;
        }).join(' ');
        const ranks = r.members.map(m => m.rank).join('/');
        const cults = r.members.map(m => m.cultivation).join('/');
        const nextNeed = NEED[Math.min(r.layersClearedThisRun, TOTAL_LAYERS - 1)];
        console.log(String(r.round).padStart(3) + '  | ' + String(r.teamPowerBefore).padStart(8) + ' | ' +
          String(r.layersClearedThisRun).padStart(8) + ' | ' + ms.padEnd(42) + ' | ' + ranks.padStart(5) + ' | ' +
          cults.padStart(12) + ' | ' + ax.padEnd(46) + ' | ' + nextNeed);
      }
      /* 何时能过第 5 层 */
      const last = sc.rounds[sc.rounds.length - 1];
      const tp = last.teamPowerAfter;
      const full = tp >= NEED[TOTAL_LAYERS - 1];
      console.log('  → 第 ' + ROUNDS + ' 局后队力 ' + tp + '，第 5 层门槛 ' + NEED[TOTAL_LAYERS - 1] + '：' + (full ? '可过' : '**不可过**'));
      console.log('');
    }
    console.log('原始数据：evidence/p2a-curve-audit.json\n');
  } finally {
    streams.forEach(s => { try { s.close(); } catch { /* noop */ } });
    try { child.kill(); } catch { /* noop */ }
  }
}

main().catch(e => { console.error('AUDIT FAIL', e); process.exitCode = 1; });
