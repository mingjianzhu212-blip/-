/* tools/p2b-resource-audit.mjs —— 第 133 轮 · R2-B 资源经济循环只读审计（测量工具）
 *
 * 只读声明：不修改任何产品代码；只起 enforce 档服务器、走真实接口、读响应。
 * 要回答的问题（制作人指定）：
 *   ① 全部资源种类及产出来源
 *   ② 各资源的实际消耗出口（**代码勘查 + 接口实测**）
 *   ③ 每局副本资源净增长（毕业前 vs 毕业后）
 *   ④ 第五层毕业后的重复收益
 *   ⑤ 各道途的资源需求差异
 *   ⑥ 长期累积模拟（1 / 3 / 6 个月）
 *   ⑦ 不同资源的通胀风险排序（依据 ①~⑥ 的实测）
 *
 * 运行：node tools/p2b-resource-audit.mjs [毕业后局数，默认 12]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AFTER_ROUNDS = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 12;
const PORT = 8200 + (process.pid % 30);
const BASE = 'http://127.0.0.1:' + PORT;

/* 服务器权威常量（抄自 server/server.mjs） */
const NEED = [800, 1600, 3200, 6400, 12800];
const TOTAL_LAYERS = 5;
const BOSS_LAYER = 5;
const TEAM_BONUS = 0.1;
/* 单机对照常量（抄自 js/game.js 的 BAL，用于跨通道套利比较） */
const SINGLE = { need0: 40, needG: 1.85, arenaWinStoneK: 0.8, enhanceStoneK: 0.3, enhanceStoneR: 1.25 };
const needOfSingle = (i) => Math.floor(SINGLE.need0 * Math.pow(SINGLE.needG, i));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const streams = [];
let seq = 0;
const uniq = (p) => { seq += 1; return p + seq; };

async function post(p, body) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}
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
  const j = await (await fetch(BASE + '/api/profile?token=' + encodeURIComponent(p.token))).json();
  return j.ok ? j.profile : null;
}
async function playOneRun(ps) {
  const r = await post('/api/room/create', { token: ps[0].token });
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
  return settled.data ? settled.data.result : settled.result;
}
/* 副本灵石池（服务器算法：pool = floor(need*0.5*(BOSS?1.5:1))，按贡献分摊） */
function poolOf(layers) {
  let pool = 0;
  for (let n = 1; n <= layers; n++) pool += Math.floor(NEED[n - 1] * 0.5 * (n === BOSS_LAYER ? 1.5 : 1));
  return pool;
}

async function main() {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    env: { ...process.env, SERVER_PORT: String(PORT), SERVER_PROFILE_MODE: 'enforce', SERVER_OFFLINE_KICK_MS: '60000', SERVER_SETTLE_HOLD_MS: '200' },
    stdio: 'ignore'
  });
  try {
    let health = null;
    for (let i = 0; i < 100; i++) {
      try { const r = await fetch(BASE + '/api/health'); const j = await r.json(); if (j.ok) { health = j; break; } } catch { /* 未起 */ }
      await sleep(150);
    }
    if (!health) throw new Error('server did not start');

    /* 四人队：剑修 / 体修 / 丹修 / 阵修 */
    const paths = ['sword', 'body', 'dan', 'array'];
    const ps = [];
    for (let i = 0; i < paths.length; i++) ps.push(await mkPlayer('资' + i, paths[i]));

    const rounds = [];
    let prev = null;
    const TOTAL_ROUNDS = 3 + AFTER_ROUNDS;      /* 前 3 局用于打到毕业，后 N 局测毕业后重复收益 */
    for (let k = 1; k <= TOTAL_ROUNDS; k++) {
      const before = [];
      for (const p of ps) before.push(await profileOf(p));
      const res = await playOneRun(ps);
      const after = [];
      for (const p of ps) after.push(await profileOf(p));
      const members = ps.map((p, i) => {
        const b = before[i], a = after[i];
        const delta = {
          path: paths[i],
          stone: a.stones - b.stones,
          cultivation: a.cultivation - b.cultivation,
          rank: a.rank - b.rank,
          weaponLv: a.weaponLv - b.weaponLv,
          equipPower: a.equipPower - b.equipPower,
          affixPct: a.affixPct - b.affixPct,
          danPowPct: a.danPowPct - b.danPowPct,
          wuPct: a.wuPct - b.wuPct,
          power: a.power - b.power,
          /** 战力是否已达该道途的封顶（连续两局增量为 0 视为封顶） */
          powerPlateau: null,
          layersCleared: a.layersCleared - b.layersCleared
        };
        return { path: paths[i], after: a, delta };
      });
      rounds.push({
        round: k,
        phase: k <= 3 ? '毕业前' : '毕业后',
        cleared: !!res.cleared,
        layersThisRun: res.layers,
        poolTotal: poolOf(res.layers),
        members
      });
      prev = after;
    }

    /* 长期累积模拟：以"毕业后每局净增长恒定"为前提做线性外推。
       ⚠ 起始基数必须取**实际最后状态**（下面 lastState），而不是 0——
         ChatGPT 独立复核指出初版表格里的基数没交代清楚。 */
    const afterRounds = rounds.filter(r => r.phase === '毕业后');
    const perRound = [];
    for (const p of paths) {
      const rows = afterRounds.map(r => r.members.find(m => m.path === p).delta);
      const avg = (k) => rows.reduce((a, d) => a + d[k], 0) / rows.length;
      perRound.push({
        path: p,
        stone: +avg('stone').toFixed(2),
        cultivation: +avg('cultivation').toFixed(2),
        rank: +avg('rank').toFixed(4),
        weaponLv: +avg('weaponLv').toFixed(4),
        equipPower: +avg('equipPower').toFixed(4),
        affixPct: +avg('affixPct').toFixed(6),
        danPowPct: +avg('danPowPct').toFixed(6),
        wuPct: +avg('wuPct').toFixed(4),
        power: +avg('power').toFixed(2),
        layersCleared: +avg('layersCleared').toFixed(4)
      });
    }
    /* 各道途战力封顶判定：连续两局增量为 0 → 视为该道途已封顶 */
    const plateauInfo = {};
    for (const p of paths) {
      let firstZero = null, consecutive = 0;
      for (const r of rounds) {
        const d = r.members.find(m => m.path === p).delta.power;
        if (d === 0) { consecutive++; if (consecutive >= 2 && firstZero === null) firstZero = r.round; }
        else consecutive = 0;
      }
      const lastDelta = rounds[rounds.length - 1].members.find(m => m.path === p).delta;
      plateauInfo[p] = {
        firstPlateauRound: firstZero,
        lastPowerDelta: lastDelta.power,
        lastEquipPowerDelta: lastDelta.equipPower,
        stillGrowing: lastDelta.power !== 0 || lastDelta.equipPower !== 0,
        theoreticalExtraFullClears: lastDelta.equipPower > 0 ? Math.ceil((4500 - lastDelta.after.equipPower) / lastDelta.equipPower) : 0
      };
    }
    const DAILY = 3;   /* 假设每天 3 局（保守估计，待制作人确认） */
    /* 长期外推必须夹住上限：rank ≤ 25、各轴有 cap；只有修为/灵石/计数是真无上限。
       （初版线性外推没夹 cap，会把"理论增量 900 阶"这种无意义数字算出来——已修正。） */
    const CAPS = { rank: 25, weaponLv: 20, equipPower: 4500, affixPct: 22, danPowPct: 0.55, wuPct: 52 };
    const lastState = rounds[rounds.length - 1].members;
    const horizons = [30, 90, 180].map(days => {
      const runs = days * DAILY;
      const row = { days, runsPerDay: DAILY, totalRuns: runs };
      for (const pr of perRound) {
        const st0 = lastState.find(m => m.path === pr.path).after;
        const growth = {
          cultivation: st0.cultivation + pr.cultivation * runs,      /* 无上限 */
          stone: st0.stones + pr.stone * runs,                       /* 无上限（档案侧） */
          weaponLv: Math.min(CAPS.weaponLv, st0.weaponLv + pr.weaponLv * runs),
          equipPower: Math.min(CAPS.equipPower, st0.equipPower + pr.equipPower * runs),
          affixPct: Math.min(CAPS.affixPct, st0.affixPct + pr.affixPct * runs),
          danPowPct: Math.min(CAPS.danPowPct, st0.danPowPct + pr.danPowPct * runs),
          wuPct: Math.min(CAPS.wuPct, st0.wuPct + pr.wuPct * runs),
          rank: Math.min(CAPS.rank, st0.rank + pr.rank * runs)
        };
        row[pr.path] = {
          cultivation: Math.round(growth.cultivation),
          stone: Math.round(growth.stone),
          weaponLv: +growth.weaponLv.toFixed(2),
          equipPower: +growth.equipPower.toFixed(2),
          affixPct: +growth.affixPct.toFixed(4),
          danPowPct: +growth.danPowPct.toFixed(4),
          wuPct: +growth.wuPct.toFixed(2),
          rank: +growth.rank.toFixed(2),
          rankCapped: st0.rank + pr.rank * runs > CAPS.rank
        };
      }
      return row;
    });

    /* 单机对照：论剑台胜一局 / 强化一级的灵石量（按境界） */
    const singleCompare = [0, 5, 10, 15, 20, 25].map(rank => ({
      rank,
      arenaWinStone: Math.floor(needOfSingle(rank) * SINGLE.arenaWinStoneK),
      enhanceStoneAtLv0: Math.floor(needOfSingle(rank) * SINGLE.enhanceStoneK)
    }));

    const out = {
      auditedAt: new Date().toISOString(),
      afterRounds: AFTER_ROUNDS,
      constants: { NEED, TOTAL_LAYERS, TEAM_BONUS, SINGLE },
      poolPerFullClear: poolOf(TOTAL_LAYERS),
      rounds,
      perRoundAvgAfterGraduation: perRound,
      plateauInfo,
      startStateAfterGraduation: lastState.map(m => ({ path: m.path, cultivation: m.after.cultivation, stones: m.after.stones, power: m.after.power, rank: m.after.rank, equipPower: m.after.equipPower })),
      horizons,
      singleCompare
    };
    fs.writeFileSync(path.join(ROOT, 'evidence', 'p2b-resource-audit.json'), JSON.stringify(out, null, 2));

    /* ---------------- 控制台报告 ---------------- */
    console.log('\n══ 第 133 轮 · R2-B 资源经济循环 · 只读实测 ══\n');
    console.log('【③ 每局资源净增长】（灵石/修为为**档案侧**增量；单人 = 四人队中剑修一人的档案）');
    console.log('局次 | 阶段 | 通关 | 层数 | 池(全队) | 剑修:灵石/修为/rank | 体修:灵石/修为 | 丹修:灵石/修为 | 阵修:灵石/修为 | 战力变化(剑修)');
    for (const r of rounds) {
      const g = (p) => r.members.find(m => m.path === p);
      console.log(
        String(r.round).padStart(3) + ' | ' + r.phase.padEnd(4) + ' | ' + (r.cleared ? '是' : '否').padStart(3) + ' | ' +
        String(r.layersThisRun).padStart(4) + ' | ' + String(r.poolTotal).padStart(7) + ' | ' +
        (g('sword').delta.stone + '/' + g('sword').delta.cultivation + '/' + g('sword').delta.rank).padEnd(21) + ' | ' +
        (g('body').delta.stone + '/' + g('body').delta.cultivation).padEnd(15) + ' | ' +
        (g('dan').delta.stone + '/' + g('dan').delta.cultivation).padEnd(15) + ' | ' +
        (g('array').delta.stone + '/' + g('array').delta.cultivation).padEnd(15) + ' | ' +
        String(g('sword').delta.power));
    }
    console.log('\n【④ 毕业后每局平均净增长（' + afterRounds.length + ' 局平均）】');
    for (const pr of perRound) {
      console.log('  ' + pr.path.padEnd(6) + ' 灵石 ' + String(pr.stone).padStart(9) +
        ' | 修为 ' + String(pr.cultivation).padStart(9) +
        ' | rank ' + String(pr.rank).padStart(8) +
        ' | 轴: 强化 ' + pr.weaponLv + ' 装备 ' + pr.equipPower + ' 词缀 ' + pr.affixPct + ' 淬丹 ' + pr.danPowPct + ' 悟道 ' + pr.wuPct +
        ' | 战力 ' + pr.power);
    }
    console.log('\n【④b 各道途战力封顶判定（**不能只看剑修就下全称结论**）】');
    for (const p of paths) {
      const info = plateauInfo[p];
      console.log('  ' + p.padEnd(6) + ' 首次连续零增量局次: ' + (info.firstPlateauRound === null ? '未出现' : '第 ' + info.firstPlateauRound + ' 局') +
        ' | 末局战力增量 ' + info.lastPowerDelta +
        ' | 末局装备护体增量 ' + info.lastEquipPowerDelta +
        ' | 是否仍在增长: ' + (info.stillGrowing ? '是' : '否') +
        (info.theoreticalExtraFullClears ? ' | 距装备护体上限(4500)还需约 ' + info.theoreticalExtraFullClears + ' 次满通关' : ''));
    }
    console.log('\n【⑥ 长期模拟起始基数（**实际最后状态**，用于核对，不从 0 起算）】');
    for (const s of out.startStateAfterGraduation) {
      console.log('  ' + s.path.padEnd(6) + ' 修为 ' + String(s.cultivation).padStart(9) + ' | 灵石 ' + String(s.stones).padStart(8) +
        ' | 战力 ' + String(s.power).padStart(10) + ' | rank ' + s.rank + ' | 装备护体 ' + s.equipPower);
    }
    console.log('\n【⑥ 长期累积模拟（外推，前提：毕业后每局净增长恒定；每天 ' + DAILY + ' 局）】');
    for (const h of horizons) {
      console.log('  ── ' + h.days + ' 天（' + h.days / 30 + ' 个月，' + h.totalRuns + ' 局）──');
      for (const p of paths) {
        const x = h[p];
        console.log('     ' + p.padEnd(6) + ' 修为累计 ' + String(x.cultivation).padStart(9) +
          ' | 灵石累计 ' + String(x.stone).padStart(9) +
          ' | 轴增量 强化' + x.weaponLv + ' 装备' + x.equipPower + ' 词缀' + x.affixPct + ' 淬丹' + x.danPowPct + ' 悟道' + x.wuPct +
          ' | rank ' + x.rank + (x.rankCapped ? '（已封顶25）' : ''));
      }
    }
    console.log('\n【单机对照：论剑台胜一局 / 强化一级的灵石（needOf = 40×1.85^rank）】');
    for (const s of singleCompare) {
      console.log('  境界 ' + String(s.rank).padStart(2) + ' → 论剑台胜 ' + String(s.arenaWinStone).padStart(10) +
        ' | 强化一级 ' + String(s.enhanceStoneAtLv0).padStart(10));
    }
    console.log('  联机·四人通关五层全队池 = ' + poolOf(TOTAL_LAYERS) + '（人均约 ' + Math.floor(poolOf(TOTAL_LAYERS) / 4) + '）');
    console.log('\n原始数据：evidence/p2b-resource-audit.json\n');
  } finally {
    streams.forEach(s => { try { s.close(); } catch { /* noop */ } });
    try { child.kill(); } catch { /* noop */ } }
}

main().catch(e => { console.error('AUDIT FAIL', e); process.exitCode = 1; });
