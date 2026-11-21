/* tools/p2a-review-132.mjs —— 第 132 轮 · P0-1 / P0-2 复核测量（只读）
 *
 * 触发：制作人要求核实两个数字的原始出处并重算比例、复核 P0-1 六项、重测 P0-2 序列。
 * 本脚本**只读**：不修改任何产品代码，只起服务器、走真实接口、读响应。
 *
 * 产出：evidence/p2a-review-132.json（原始数据）+ 控制台可读表。
 * 运行：node tools/p2a-review-132.mjs [局数，默认 12]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ROUNDS = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 12;
const PORT = 8180 + (process.pid % 30);
const PORT_OFF = 8190 + (process.pid % 30);   /* off 档：测"客户端上报值 vs 服务器重算值" */
const BASE = 'http://127.0.0.1:' + PORT;
const BASE_OFF = 'http://127.0.0.1:' + PORT_OFF;

/* 服务器权威常量（全部抄自 server/server.mjs / server/profile.mjs） */
const NEED = [800, 1600, 3200, 6400, 12800];
const TOTAL_LAYERS = 5;
const TEAM_BONUS = 0.1;
const MAX_POWER = 1e10;
const RANK_CAP = 25, RANK_STEP = 8000, POW_K = 100, ENHANCE_MAX = 20, ENHANCE_POW_RATE = 0.05;
const WEAPON_MULT = [1.0, 1.05, 1.10, 1.20, 1.35, 1.44, 1.53, 1.63, 1.73, 1.85];
const EQUIP_POWER_CAP = 4500, AFFIX_POW_CAP_PCT = 22, DAN_POW_CAP_FRAC = 0.55, WU_POW_CAP_PCT = 52, ART_BG_MAX = 0.56;
const GONGS = [{ rate: 1.03, max: 10 }, { rate: 1.04, max: 10 }, { rate: 1.05, max: 10 }];
const AXIS_GRANTS = {
  sword: { weaponLv: 2, equipPower: 0, affixPct: 0, danPowPct: 0, wuPct: 0 },
  body: { weaponLv: 0, equipPower: 45, affixPct: 2.2, danPowPct: 0, wuPct: 0 },
  dan: { weaponLv: 0, equipPower: 0, affixPct: 0, danPowPct: 0.055, wuPct: 0 },
  array: { weaponLv: 0, equipPower: 0, affixPct: 0, danPowPct: 0, wuPct: 5.2 }
};
/* 单机"合法满级"快照（与 probe-p0b-boundary.mjs 的 MAX_SNAP 同口径） */
const MAX_SNAP = {
  rank: 25, gongLvs: [10, 10, 10], weapon: 9, weaponLv: 20,
  affixPct: 22, wuPct: 52, artBgPct: 0.56, danPowPct: 0.55, dtPowPct: 22.5,
  petPower: 2160000, equipPower: 4500
};
/* 轴权重（抄自 pathAxisScore） */
const AXIS_WEIGHT = { sword: 1.0, body: 1.0, dan: 1.0, array: 1.0 };  /* 四轴满投入都 = 1.0 */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const streams = [];
let seq = 0;
const uniq = (p) => { seq += 1; return p + seq; };

/* 与 server.mjs recomputePower 完全同构的预言器（用于理论极值计算） */
function clampNum(v, lo, hi, dflt) { const n = (typeof v === 'number' && Number.isFinite(v)) ? v : dflt; return Math.min(hi, Math.max(lo, n)); }
function predictPower(snap) {
  const rank = clampNum(snap.rank, 0, RANK_CAP, 0);
  const gLv = Array.isArray(snap.gongLvs) ? snap.gongLvs : [];
  const gongMult = GONGS.reduce((a, g, i) => a * Math.pow(g.rate, clampNum(gLv[i], 0, g.max, 0)), 1);
  const weapon = clampNum(snap.weapon, 0, WEAPON_MULT.length - 1, 0);
  const weaponMult = WEAPON_MULT[weapon] || 1;
  const weaponLv = clampNum(snap.weaponLv, 0, ENHANCE_MAX, 0);
  const enhance = 1 + weaponLv * ENHANCE_POW_RATE;
  const core = 10 * POW_K * Math.pow(1.5, rank) * gongMult * weaponMult * enhance;
  const affixPct = clampNum(snap.affixPct, 0, AFFIX_POW_CAP_PCT, 0);
  const wuPct = clampNum(snap.wuPct, 0, WU_POW_CAP_PCT, 0);
  const artBgPct = clampNum(snap.artBgPct, 0, ART_BG_MAX, 0);
  const danPowPct = clampNum(snap.danPowPct, 0, DAN_POW_CAP_FRAC, 0);
  const dtPowPct = clampNum(snap.dtPowPct, 0, 22.5, 0);
  const mult = (1 + affixPct / 100) * (1 + wuPct / 100) * (1 + artBgPct) * (1 + danPowPct) * (1 + dtPowPct / 100);
  const petPower = clampNum(snap.petPower, 0, 2160000, 0);
  const equipPower = clampNum(snap.equipPower, 0, EQUIP_POWER_CAP, 0);
  return clampNum(Math.floor(core * mult) + petPower + equipPower, 1, MAX_POWER);
}
/* 档案通道的**理论极值**（rank 满 + 该道途轴 cap 满；其余轴为 0） */
function archiveTheoreticalCeiling(pathId) {
  const g = AXIS_GRANTS[pathId];
  const snap = {
    rank: RANK_CAP, gongLvs: [0, 0, 0], weapon: 0,
    weaponLv: Math.min(ENHANCE_MAX, g.weaponLv * 999),
    equipPower: Math.min(EQUIP_POWER_CAP, g.equipPower * 999),
    affixPct: Math.min(AFFIX_POW_CAP_PCT, g.affixPct * 999),
    danPowPct: Math.min(DAN_POW_CAP_FRAC, g.danPowPct * 999),
    wuPct: Math.min(WU_POW_CAP_PCT, g.wuPct * 999),
    artBgPct: 0, dtPowPct: 0, petPower: 0
  };
  return { snap, power: predictPower(snap) };
}

async function post(p, body) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}
async function postOff(p, body) {
  const r = await fetch(BASE_OFF + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
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
function teamPowerOf(profiles) {
  const total = profiles.reduce((a, p) => a + p.power, 0);
  return Math.floor(total * (1 + TEAM_BONUS * Math.max(profiles.length - 1, 0)));
}
/* 队力能过的层数 */
function layersPassable(teamPower) {
  let n = 0;
  for (const need of NEED) { if (teamPower >= need) n++; else break; }
  return n;
}

async function playOneRun(ps) {
  const r = await post('/api/room/create', { token: ps[0].token });
  if (!r.ok) throw new Error('建房失败：' + JSON.stringify(r));
  const roomId = r.room.id;
  for (let i = 1; i < ps.length; i++) await post('/api/room/join', { token: ps[i].token, roomId });
  for (const p of ps) await post('/api/room/ready', { token: p.token, ready: true });
  const st = await post('/api/room/start', { token: ps[0].token });
  if (!st.ok) throw new Error('开局失败：' + JSON.stringify(st));
  for (;;) { const e = await nextEvent(ps[0].sse); if (e.event === 'run') break; }
  let settled = null;
  for (let guard = 0; guard < 40 && !settled; guard++) {
    for (const p of ps) await post('/api/run/strike', { token: p.token });
    const e = await nextEvent(ps[0].sse);
    if (e.event === 'run_settle') { settled = e.data; break; }
  }
  if (!settled) throw new Error('未等到结算');
  for (let i = 0; i < 60; i++) {
    const e = await nextEvent(ps[0].sse);
    if (e.event === 'room' && e.data && e.data.room && e.data.room.phase === 'lobby') break;
  }
  return settled.result;
}

async function runScenario(label, pathIds) {
  const ps = [];
  for (let i = 0; i < pathIds.length; i++) ps.push(await mkPlayer(label + i, pathIds[i]));
  const rounds = [];
  let clearedAt = null;
  for (let k = 1; k <= ROUNDS; k++) {
    const before = [];
    for (const p of ps) before.push(await profileOf(p));
    const teamBefore = teamPowerOf(before);
    const passableBefore = layersPassable(teamBefore);
    const res = await playOneRun(ps);
    const after = [];
    for (const p of ps) after.push(await profileOf(p));
    const teamAfter = teamPowerOf(after);
    const layersTotal = after[0].layersCleared;
    const nextNeed = NEED[Math.min(layersTotal, TOTAL_LAYERS - 1)];
    if (res.cleared && clearedAt === null) clearedAt = k;
    rounds.push({
      round: k,
      teamPowerBefore: teamBefore,
      passableLayersBefore: passableBefore,
      layersThisRun: res.layers,
      cleared: res.cleared,
      teamPowerAfter: teamAfter,
      ratioToNextNeed: +(teamAfter / nextNeed).toFixed(3),
      nextNeed,
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
  return { label, pathIds, clearedAtRound: clearedAt, rounds };
}

async function main() {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    env: { ...process.env, SERVER_PORT: String(PORT), SERVER_PROFILE_MODE: 'enforce', SERVER_OFFLINE_KICK_MS: '60000', SERVER_SETTLE_HOLD_MS: '200' },
    stdio: 'ignore'
  });
  /* off 档服务器：用于测"客户端上报值 vs 服务器重算值"与拒绝原因分布。
     ⚠ 上一版脚本犯的错就是**在 enforce 档测单机满级**——enforce 忽略快照，只会返回档案初始 1000。
     单机满级必须在 off 档（走快照重算）测。 */
  const childOff = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    env: { ...process.env, SERVER_PORT: String(PORT_OFF), SERVER_PROFILE_MODE: 'off', SERVER_OFFLINE_KICK_MS: '60000', SERVER_SETTLE_HOLD_MS: '200' },
    stdio: 'ignore'
  });
  try {
    let health = null;
    for (let i = 0; i < 100; i++) {
      try { const r = await fetch(BASE + '/api/health'); const j = await r.json(); if (j.ok) { health = j; break; } } catch { /* 未起 */ }
      await sleep(150);
    }
    if (!health) throw new Error('server did not start');
    let healthOff = null;
    for (let i = 0; i < 100; i++) {
      try { const r = await fetch(BASE_OFF + '/api/health'); const j = await r.json(); if (j.ok) { healthOff = j; break; } } catch { /* 未起 */ }
      await sleep(150);
    }
    if (!healthOff) throw new Error('off server did not start');

    /* ---- 核查 1：单机合法满级（**off 档**服务器实测，不引用任何历史文档数字） ---- */
    const solo = await postOff('/api/join', { name: '满级实测', snapshot: MAX_SNAP });
    const singleplayerFullPower = solo.player.power;      /* 服务器权威重算值 */
    const predictedFullPower = predictPower(MAX_SNAP);
    /* 交叉验证：同一份满级快照在 enforce 档会被忽略（返回档案初始值）——这正是 enforce 的作用 */
    const soloEnforce = await post('/api/join', { name: '满级实测2', snapshot: MAX_SNAP });
    const singleplayerFullPowerEnforce = soloEnforce.player.power;
    /* 四道途在"单机满级快照"下的合法满级战力：基础战力与道途无关，差异只在共鸣上限 */
    const fullByPath = {};
    for (const pid of ['sword', 'body', 'dan', 'array']) {
      fullByPath[pid] = {
        basePower: singleplayerFullPower,
        maxSynergyPct: 15,
        maxEffectivePower: Math.floor(singleplayerFullPower * 1.15)
      };
    }
    /* 诊断指标用：客户端上报值 vs 服务器重算值（off 档） */
    const reportedVsRecomputed = {
      reported: 9.99e9,                                    /* 客户端自称 */
      recomputed: singleplayerFullPower,                    /* 服务器重算 */
      ratio: +(singleplayerFullPower / 9.99e9).toFixed(8)
    };
    /* 诊断指标用：拒绝原因分布（off 档，实测三种典型拒绝） */
    const rejectReasons = [];
    const r1 = await postOff('/api/join', { name: '拒1' });
    rejectReasons.push({ case: '无快照登录', code: r1.code || 'OK' });
    const r2 = await postOff('/api/join', { name: '拒2', snapshot: 'not-an-object' });
    rejectReasons.push({ case: '快照格式非法', code: r2.code || 'OK' });
    const r3 = await postOff('/api/join', { name: '拒3', path: 'not-a-path' });
    rejectReasons.push({ case: '道途 id 非法', code: r3.code || 'OK' });

    /* ---- 核查 2：单人能否开局（服务器规则事实） ---- */
    const lone = await mkPlayer('独行', 'sword');
    const loneRoom = await post('/api/room/create', { token: lone.token });
    await post('/api/room/ready', { token: lone.token, ready: true });
    const loneStart = await post('/api/room/start', { token: lone.token });

    /* ---- 核查 3：档案通道的理论极值（公式计算，与实测对照） ---- */
    const ceilings = {};
    for (const pid of ['sword', 'body', 'dan', 'array']) {
      const c = archiveTheoreticalCeiling(pid);
      ceilings[pid] = { snapshot: c.snap, theoreticalCeiling: c.power };
    }

    /* ---- 核查 4：各队伍规模的成长序列 ---- */
    const scenarios = [];
    scenarios.push(await runScenario('双人', ['sword', 'dan']));
    scenarios.push(await runScenario('三人', ['sword', 'body', 'dan']));
    scenarios.push(await runScenario('四人', ['sword', 'body', 'dan', 'array']));

    /* ---- 汇总 ---- */
    const summary = {
      singleplayerFullPower,
      predictedFullPower,
      singleplayerFullPowerInEnforce: singleplayerFullPowerEnforce,
      reportedVsRecomputed,
      rejectReasons,
      ratioArchiveVsFull: null,   /* 下面用实测最高档案战力算 */
      singlePlayerCanStart: { ok: !!loneStart.ok, code: loneStart.code || null },
      ceilings,
      scenarios: scenarios.map(s => ({
        label: s.label,
        pathIds: s.pathIds,
        clearedAtRound: s.clearedAtRound,
        finalMemberPowers: s.rounds[s.rounds.length - 1].members.map(m => ({ path: m.path, power: m.power })),
        maxMemberPower: Math.max(...s.rounds[s.rounds.length - 1].members.map(m => m.power)),
        finalRatioToNextNeed: s.rounds[s.rounds.length - 1].ratioToNextNeed
      }))
    };
    const maxArchivePower = Math.max(...scenarios.flatMap(s => s.rounds.flatMap(r => r.members.map(m => m.power))));
    summary.maxArchivePowerMeasured = maxArchivePower;
    summary.ratioArchiveVsFull = +(maxArchivePower / singleplayerFullPower).toFixed(6);
    summary.archiveVsMaxPower = +(maxArchivePower / MAX_POWER).toFixed(10);

    const out = {
      auditedAt: new Date().toISOString(),
      rounds: ROUNDS,
      constants: { NEED, TOTAL_LAYERS, TEAM_BONUS, MAX_POWER, RANK_CAP, RANK_STEP, AXIS_GRANTS, MAX_SNAP },
      summary,
      scenarios
    };
    fs.writeFileSync(path.join(ROOT, 'evidence', 'p2a-review-132.json'), JSON.stringify(out, null, 2));

    /* ---------- 控制台报告 ---------- */
    console.log('\n══ 第 132 轮复核测量 ══\n');
    console.log('【核查 1】单机合法满级（**off 档**服务器实测，不引用任何历史文档数字）');
    console.log('  off 档服务器重算值  : ' + singleplayerFullPower.toLocaleString());
    console.log('  同构公式预言值      : ' + predictedFullPower.toLocaleString() + '（一致：' + (singleplayerFullPower === predictedFullPower) + '）');
    console.log('  同一满级快照在 enforce 档: ' + singleplayerFullPowerEnforce.toLocaleString() + '（enforce 忽略快照 → 档案初始值，证明 enforce 生效）');
    console.log('  四道途满级基础战力  : 相同（道途不影响基础战力），满共鸣后 = ' + fullByPath.sword.maxEffectivePower.toLocaleString());
    console.log('  诊断指标·上报 vs 重算: 上报 9.99e9 → 重算 ' + singleplayerFullPower.toLocaleString() + '（比值 ' + reportedVsRecomputed.ratio + '）');
    console.log('  诊断指标·拒绝原因分布: ' + rejectReasons.map(r => r.case + '→' + r.code).join('； '));
    console.log('');
    console.log('【核查 2】单人能否开局');
    console.log('  结果: ok=' + summary.singlePlayerCanStart.ok + ' code=' + summary.singlePlayerCanStart.code + '（服务器规则 MIN_PLAYERS）');
    console.log('');
    console.log('【核查 3】档案通道理论极值（rank 满 + 该轴 cap 满）');
    for (const pid of Object.keys(ceilings)) {
      console.log('  ' + pid.padEnd(6) + ' 理论上限 ' + ceilings[pid].theoreticalCeiling.toLocaleString() +
        '  = 单机满级的 ' + (ceilings[pid].theoreticalCeiling / singleplayerFullPower * 100).toFixed(3) + '%');
    }
    console.log('  MAX_POWER          : ' + MAX_POWER.toLocaleString() + '（通用兜底，档案实测最高只到它的 ' + (summary.archiveVsMaxPower * 100).toFixed(4) + '%）');
    console.log('');
    console.log('【核查 4】实测最高档案战力 vs 单机满级');
    console.log('  实测最高档案战力    : ' + maxArchivePower.toLocaleString());
    console.log('  / 单机满级真号      : ' + (summary.ratioArchiveVsFull * 100).toFixed(3) + '%  （即档案是满级的 ' + (1 / summary.ratioArchiveVsFull).toFixed(2) + ' 分之一）');
    console.log('');
    console.log('【核查 5】各队伍规模成长序列');
    for (const sc of scenarios) {
      console.log('  ── ' + sc.label + '（' + sc.pathIds.join('/') + '）──');
      console.log('     局次 | 队力(前) | 可过层 | 本局层数 | 队力(后) | 战力/下一层门槛 | 各成员战力');
      for (const r of sc.rounds) {
        console.log('     ' + String(r.round).padStart(4) + ' | ' + String(r.teamPowerBefore).padStart(9) + ' | ' +
          String(r.passableLayersBefore).padStart(6) + ' | ' + String(r.layersThisRun).padStart(8) + ' | ' +
          String(r.teamPowerAfter).padStart(9) + ' | ' + String(r.ratioToNextNeed).padStart(16) + ' | ' +
          r.members.map(m => m.path + '=' + m.power).join(' '));
      }
      console.log('     首次通关第五层：第 ' + sc.clearedAtRound + ' 局' + (sc.clearedAtRound ? '' : '（未通关）'));
      console.log('');
    }
    console.log('原始数据：evidence/p2a-review-132.json\n');
  } finally {
    streams.forEach(s => { try { s.close(); } catch { /* noop */ } });
    try { child.kill(); } catch { /* noop */ }
    try { childOff.kill(); } catch { /* noop */ }
  }
}

main().catch(e => { console.error('REVIEW FAIL', e); process.exitCode = 1; });
