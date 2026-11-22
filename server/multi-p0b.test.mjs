/* server/multi-p0b.test.mjs — P0-B 独立验收测试（第 118 轮）
 *
 * 纪律：不 mock 服务器、不伪造事件——真子进程 + 真 HTTP/SSE。
 * 覆盖（P0-B：服务器权威战力 = 受钳制养成快照重算，不再采信客户端最终数字）：
 *   T1 防直接报力作弊：快照为低位（rank0）却 body.power=1e9 → 服务器用重算值（≈1000），忽略 1e9。
 *   T2 输入钳制：快照 rank=999 → 钳到 25，power 受控（≠1e12/1e9），不影响公平。
 *   T3 公式一致：合法中段快照的服务器重算值 == 客户端公式预言值（回归守护）。
 *   T4 legacy 回落：无快照时仅钳制 body.power（≤MAX_POWER），且 powerSource='legacy'；负力 BAD_POWER。
 *   T5 广播用重算值：第二客户端在大厅看到的是服务器重算战力，而非客户端自报 1e9。
 *   T6 武器/强化真实流入：weapon=9/weaponLv=20 的重算战力必须严格高于 weapon=0/weaponLv=0（防多人模式持器修士被偷偷压战力）。
 *   T7 客户端字段守卫：multiSnapshot 必须读 S.weapon / S.weaponLv（小写），不得引用不存在的 S.Weapon / S.WeaponLv（大写 typo 会让武器/强化永远以 0 上报）。
 *
 * 运行：node --test server/multi-p0b.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = 9001;
const BASE = 'http://127.0.0.1:' + PORT;
const KICK_MS = 8000;
const SETTLE_MS = 100;

let child = null;
const streams = [];
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---- 预言器：与 server.mjs recomputePower 逐项一致，用于回归守护 ---- */
const GONGS = [{ rate: 1.03, max: 10 }, { rate: 1.04, max: 10 }, { rate: 1.05, max: 10 }];
const WEAPON_MULT = [1.0, 1.05, 1.10, 1.20, 1.35, 1.44, 1.53, 1.63, 1.73, 1.85];
const ENHANCE_POW_RATE = 0.05, ENHANCE_MAX = 20, RANK_CAP = 25, GONG_CAP = 10;
/* 上限常量必须与服务端保持一致（第 123 轮按客户端真实合法最大值收紧，见 server.mjs 注释） */
const ART_BG_MAX = 0.86, WU_POW_CAP_PCT = 52, AFFIX_POW_CAP_PCT = 22, DAN_POW_CAP_FRAC = 0.55, DT_POW_CAP_PCT = 22.5;
const PET_TOTAL_CAP = 0.40, EQUIP_POWER_CAP = 4500, MAX_POWER = 1e10;
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
  const petCap = Math.floor(PET_TOTAL_CAP * 10 * 100 * Math.pow(1.5, rank));
  const petPower = Math.min(clampNum(snap.petPower, 0, Number.MAX_SAFE_INTEGER, 0), petCap);
  const equipPower = clampNum(snap.equipPower, 0, EQUIP_POWER_CAP, 0);
  return clampNum(Math.floor(core * mult) + petPower + equipPower, 1, MAX_POWER);
}

async function post(p, body) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return r.json();
}
function joinSnap(name, snapshot, power) {
  const j = post('/api/join', { name, power, snapshot });
  return j;
}
function openSse(u) {
  const ac = new AbortController();
  const p = fetch(u, { signal: ac.signal }).then(async (res) => {
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
            let parsed = null; try { parsed = JSON.parse(data); } catch { parsed = null; }
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
      }),
      drain: () => queue.splice(0),
      close: () => { try { ac.abort(); } catch { /* noop */ } }
    };
  });
  p.then(s => streams.push(s));
  return p;
}
function waitFor(sse, evName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting ' + evName)), timeoutMs);
    (async () => {
      for (;;) {
        const ev = await sse.next();
        if (!ev) { clearTimeout(t); reject(new Error('stream closed while waiting ' + evName)); return; }
        if (ev.event === evName) { clearTimeout(t); resolve(ev.data); return; }
      }
    })();
  });
}

before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    /* #75：T4 专测 legacy 回退，闸门默认关闭，故本套显式开启（默认关闭由 multi-p0d 覆盖） */
    env: { ...process.env, SERVER_PORT: String(PORT), SERVER_OFFLINE_KICK_MS: String(KICK_MS), SERVER_SETTLE_HOLD_MS: String(SETTLE_MS), SERVER_LEGACY_POWER: '1' },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/health'); if ((await r.json()).ok) return; } catch { /* 未起 */ }
    await sleep(150);
  }
  throw new Error('server did not start');
});
after(() => { streams.forEach(s => { try { s.close(); } catch { /* noop */ } }); if (child) child.kill(); });

const LOW_SNAP = { rank: 0, gongLvs: [0, 0, 0], weapon: 0, weaponLv: 0, affixPct: 0, wuPct: 0, artBgPct: 0, danPowPct: 0, dtPowPct: 0, petPower: 0, equipPower: 0 };

test('T1 防直接报力作弊：低位快照 + body.power=1e9 → 服务器用重算值，忽略 1e9', async () => {
  const j = await joinSnap('甲' + Math.floor(Math.random() * 900 + 100), LOW_SNAP, 1e9);
  assert.equal(j.ok, true, '带快照 join 应成功：' + JSON.stringify(j));
  assert.equal(j.player.powerSource, 'snapshot', '应标记 snapshot（权威重算）');
  assert.equal(j.player.power, expectedPower(LOW_SNAP), '应使用重算值（≈1000）');
  assert.notEqual(j.player.power, 1e9, '必须忽略客户端自报的 1e9');
  assert.equal(j.player.power, 1000, 'rank0/无养成 重算值应为 1000');
});

test('T2 输入钳制：快照 rank=999 → 钳到 25，power 受控（≠1e12/1e9）', async () => {
  const snap = { ...LOW_SNAP, rank: 999 };
  const j = await joinSnap('乙' + Math.floor(Math.random() * 900 + 100), snap, 1e9);
  assert.equal(j.ok, true);
  assert.equal(j.player.powerSource, 'snapshot');
  const exp = expectedPower(snap);
  assert.equal(j.player.power, exp, 'rank 应被钳到 25 后重算');
  assert.equal(exp, expectedPower({ ...LOW_SNAP, rank: 25 }), 'rank=999 与 rank=25 应得同一重算值');
  assert.ok(j.player.power <= MAX_POWER, '不得突破 MAX_POWER');
  assert.notEqual(j.player.power, 1e9, '忽略自报 1e9');
  assert.ok(j.player.power > 1e6 && j.player.power < 1e8, 'rank25 无养成 重算值应在千万级内');
});

test('T3 公式一致：合法中段快照的服务器重算 == 客户端公式预言值', async () => {
  const snap = {
    rank: 12, gongLvs: [5, 3, 0], weapon: 3, weaponLv: 8,
    affixPct: 20, wuPct: 10, artBgPct: 0.1, danPowPct: 0, dtPowPct: 5,
    petPower: 500000, equipPower: 3000
  };
  const j = await joinSnap('丙' + Math.floor(Math.random() * 900 + 100), snap, 12345);
  assert.equal(j.ok, true);
  assert.equal(j.player.powerSource, 'snapshot');
  const exp = expectedPower(snap);
  assert.equal(j.player.power, exp, '服务器重算必须与公式预言值逐项一致（否则公式漂移）');
  assert.ok(exp > 3e5 && exp < 1e10, '合法中段玩家战力应在合理区间（实测约 9.7e5）');
});

test('T4 legacy 回落：无快照时不采信 body.power 为真相，仅放行 ≤MAX_POWER 的正常值', async () => {
  /* 无快照 → legacy：body.power 仅作兼容传入，服务器不采信为权威（权威走快照重算）。
     放行规则与 P0-A 一致：正常值（≤MAX_POWER 且 >0）原样接受并标 legacy；
     越界（>MAX_POWER 或 ≤0）一律 BAD_POWER 拒绝——防「直接报 1e12」。 */
  const a = await post('/api/join', { name: '丁' + Math.floor(Math.random() * 900 + 100), power: 5000 });
  assert.equal(a.ok, true);
  assert.equal(a.player.power, 5000, '无快照正常档 power 应原样（≤MAX_POWER）');
  assert.equal(a.player.powerSource, 'legacy', '无快照应标记 legacy');
  const b = await post('/api/join', { name: '戊' + Math.floor(Math.random() * 900 + 100), power: 1e12 });
  assert.equal(b.ok, false, 'legacy 越界 power（1e12 > MAX_POWER）必须被拒（与 P0-A 一致）');
  assert.equal(b.code, 'BAD_POWER', '应返回 BAD_POWER');
  const c = await post('/api/join', { name: '己' + Math.floor(Math.random() * 900 + 100), power: -5 });
  assert.equal(c.ok, false, '负 power 应被拒');
  assert.equal(c.code, 'BAD_POWER', '应返回 BAD_POWER');
});

test('T5 广播用重算值：第二客户端在大厅看到的是服务器重算战力，而非自报 1e9', async () => {
  /* A：低位快照 + 自报 1e9；B：旁观者，确认大厅里 A 的 power 是重算值 1000，不是 1e9 */
  const A = await joinSnap('庚' + Math.floor(Math.random() * 900 + 100), LOW_SNAP, 1e9);
  assert.equal(A.ok, true);
  /* 旁观者 B 也走真实客户端路径（带快照）。#75 起"既不报快照也不报 power"的登录会被拒，
     因为那等于让服务器替客户端凭空补一个 power=100——隐式默认信任，必须堵掉。 */
  const B = await joinSnap('辛' + Math.floor(Math.random() * 900 + 100), LOW_SNAP, 1000);
  assert.equal(B.ok, true, '旁观者应能正常登录：' + JSON.stringify(B));
  const sseB = await openSse(BASE + '/api/stream?token=' + encodeURIComponent(B.player.token));
  streams.push(sseB);
  await waitFor(sseB, 'hello');
  let seen = false;
  for (let i = 0; i < 25; i++) {
    const lob = await waitFor(sseB, 'lobby', 4000).catch(() => null);
    if (!lob) break;
    const a = (lob.players || []).find(p => p.name === A.player.name);
    if (a) {
      assert.equal(a.power, expectedPower(LOW_SNAP), '大厅广播的 A 战力必须是服务器重算值');
      assert.equal(a.power, 1000, '不得是 A 自报的 1e9');
      assert.equal(a.powerSource, 'snapshot', '应带权威标记');
      seen = true;
      break;
    }
  }
  assert.equal(seen, true, '应在大厅可见 A 的重算战力');
});

test('T6 武器/强化必须真实流入服务器重算：weapon=9/weaponLv=20 战力必须严格高于 0/0', async () => {
  /* 用一份"合法满级玩家"快照，仅切换武器/强化两字段，验证服务器确实按快照里的武器与强化重算，
     而不是把这两项当 0（这正是第 119 轮审查发现的客户端 multiSnapshot 大小写 typo 的后果）。 */
  /* 一份"合法满级玩家"快照：每项都取客户端源码给出的真实上限（第 123 轮核对） */
  const base = { rank: 25, gongLvs: [10, 10, 10], affixPct: 22, wuPct: 52, artBgPct: 0.86, danPowPct: 0.55, dtPowPct: 22.5, petPower: 10100467, equipPower: 4500 };
  const armed = { ...base, weapon: 9, weaponLv: 20 };
  const bare  = { ...base, weapon: 0, weaponLv: 0 };
  const jArmed = await joinSnap('甲' + Math.floor(Math.random() * 900 + 100), armed, 1e9);
  const jBare  = await joinSnap('乙' + Math.floor(Math.random() * 900 + 100), bare, 1e9);
  assert.equal(jArmed.ok, true, '持器满级快照应成功：' + JSON.stringify(jArmed));
  assert.equal(jBare.ok, true, '裸装满级快照应成功：' + JSON.stringify(jBare));
  assert.equal(jArmed.player.power, expectedPower(armed), '服务器重算必须包含武器/强化（== 公式预言值）');
  assert.equal(jBare.player.power, expectedPower(bare), '裸装重算必须 == 公式预言值');
  assert.ok(jArmed.player.power > jBare.player.power, '武器+强化必须显著提升破层战力，否则多人模式持器修士被偷偷压战力');
});

test('T7 客户端 multiSnapshot 必须读取正确状态字段（防 S.Weapon/S.WeaponLv 大写 typo）', async () => {
  const src = readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8');
  const m = src.match(/function multiSnapshot\(\)\{[\s\S]*?\n  \}/);
  assert.ok(m, '应在 game.js 中找到 multiSnapshot() 定义');
  const body = m[0];
  assert.ok(/weapon:\s*Math\.max\(0,\s*Math\.min\(9,\s*S\.weapon\s*\|/.test(body), 'multiSnapshot 必须用 S.weapon（小写）读取法宝品质');
  assert.ok(/weaponLv:\s*Math\.max\(0,\s*Math\.min\(BAL\.enhanceMax,\s*S\.weaponLv\s*\|/.test(body), 'multiSnapshot 必须用 S.weaponLv（小写）读取强化等级');
  assert.ok(!/S\.Weapon\b/.test(body) && !/S\.WeaponLv\b/.test(body), 'multiSnapshot 不得引用不存在的 S.Weapon / S.WeaponLv（大写）');
  /* #75：legacy 默认关闭后，返回 null 等于让用户完全进不了联机（空快照被拒）。
     失败时必须回报"零养成"快照，让服务器照旧重算，而不是放弃上报。 */
  assert.ok(!/return null/.test(body), 'multiSnapshot 失败路径不得 return null（会被 LEGACY_DISABLED 挡住进不去）');
  assert.ok(/rank:\s*0,\s*gongLvs:\s*\[0,\s*0,\s*0\]/.test(body), 'multiSnapshot 的失败回落必须给出零养成快照');
});

