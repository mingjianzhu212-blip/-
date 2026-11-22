/* server/multi-p0e.test.mjs — 快照各项上限验收（第 123 轮，回应 ChatGPT 第 123 轮独立审查）
 *
 * 审查发现（已确认成立）：服务端各"汇总项"上限远宽于客户端真实合法最大值
 * （宠物 3e9 对真实 216 万、装备 3e9 对真实 4500、词缀 300% 对真实 22%…），
 * 于是"构造一个各项都顶到上限的快照"即可拿到 1e10 ＝ 实测满级 2.78e9 的 3.6 倍，
 * 等于把 #75 刚关掉的 legacy 口子换个入口重开。
 *
 * 本轮把六项上限改成"客户端源码可指认的理论最大"，本文件守住三件事：
 *   E1 组合攻击（全部字段填 1e9）不得超过合法满级：作弊天花板 == 合法满级
 *   E2 逐项钳制：单项超限等于该项取合法上限，而不是被采信
 *   E3 合法满级快照不被削弱（防止"为了安全把上限收太窄"，那会误伤真玩家）
 *   E4 天花板数量级守卫（若有人把 PET/EQUIP 改回 3e9，此条必红）
 *   E5 源码守卫：六个上限必须等于实测推导值（防悄悄改宽/改窄）
 *
 * 运行：node --test server/multi-p0e.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = 9005;
const BASE = 'http://127.0.0.1:' + PORT;

let child = null;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---- 预言器：与服务端 recomputePower 同构（上限取本轮收紧后的值） ---- */
const GONGS = [{ rate: 1.03 }, { rate: 1.04 }, { rate: 1.05 }];
const WEAPON_MULT = [1.0, 1.05, 1.10, 1.20, 1.35, 1.44, 1.53, 1.63, 1.73, 1.85];
const CAPS = {
  RANK: 25, GONG: 10, ENHANCE: 20, ENHANCE_RATE: 0.05,
  AFFIX_PCT: 22, WU_PCT: 52, ART_BG: 0.86, DAN_FRAC: 0.55, DT_PCT: 22.5,
  PET_TOTAL: 0.40, EQUIP: 4500, MAX: 1e10
};
const clampNum = (v, lo, hi, dflt) => {
  const n = (typeof v === 'number' && Number.isFinite(v)) ? v : dflt;
  return Math.min(hi, Math.max(lo, n));
};
function expectedPower(snap) {
  const rank = clampNum(snap.rank, 0, CAPS.RANK, 0);
  const gLv = Array.isArray(snap.gongLvs) ? snap.gongLvs : [];
  const gongMult = GONGS.reduce((a, g, i) => a * Math.pow(g.rate, clampNum(gLv[i], 0, CAPS.GONG, 0)), 1);
  const weaponMult = WEAPON_MULT[clampNum(snap.weapon, 0, WEAPON_MULT.length - 1, 0)] || 1;
  const enhance = 1 + clampNum(snap.weaponLv, 0, CAPS.ENHANCE, 0) * CAPS.ENHANCE_RATE;
  const core = 10 * 100 * Math.pow(1.5, rank) * gongMult * weaponMult * enhance;
  const mult = (1 + clampNum(snap.affixPct, 0, CAPS.AFFIX_PCT, 0) / 100)
    * (1 + clampNum(snap.wuPct, 0, CAPS.WU_PCT, 0) / 100)
    * (1 + clampNum(snap.artBgPct, 0, CAPS.ART_BG, 0))
    * (1 + clampNum(snap.danPowPct, 0, CAPS.DAN_FRAC, 0))
    * (1 + clampNum(snap.dtPowPct, 0, CAPS.DT_PCT, 0) / 100);
  const petCap = Math.floor(CAPS.PET_TOTAL * 10 * 100 * Math.pow(1.5, rank));
  const flat = Math.min(clampNum(snap.petPower, 0, Number.MAX_SAFE_INTEGER, 0), petCap) + clampNum(snap.equipPower, 0, CAPS.EQUIP, 0);
  return clampNum(Math.floor(core * mult) + flat, 1, CAPS.MAX);
}

/* 合法满级快照：每项都取客户端源码里的理论最大 */
const LEGIT_MAX = {
  rank: 25, gongLvs: [10, 10, 10], weapon: 9, weaponLv: 20,
  affixPct: 22, wuPct: 52, artBgPct: 0.86, danPowPct: 0.55, dtPowPct: 22.5,
  petPower: 10100467, equipPower: 4500
};
/* 组合攻击：每项都填天文数字，靠钳制落地 */
const CHEAT = {
  rank: 1e9, gongLvs: [1e9, 1e9, 1e9], weapon: 1e9, weaponLv: 1e9,
  affixPct: 1e9, wuPct: 1e9, artBgPct: 1e9, danPowPct: 1e9, dtPowPct: 1e9,
  petPower: 1e9, equipPower: 1e9
};

async function post(p, body) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}
const uniq = (s) => s + Math.floor(Math.random() * 9000 + 1000);
const join = (name, snapshot) => post('/api/join', { name, snapshot });

before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    cwd: ROOT,
    env: { ...process.env, SERVER_PORT: String(PORT), SERVER_OFFLINE_KICK_MS: '60000', SERVER_SETTLE_HOLD_MS: '3000' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', (d) => { out += d.toString(); });
  for (let i = 0; i < 100; i++) {
    if (out.includes('listening')) return;
    await sleep(100);
  }
  throw new Error('服务器未起：' + out.slice(0, 400));
});
after(() => { if (child) { try { child.kill(); } catch { /* noop */ } } });

test('E1 组合攻击不得超过合法满级：作弊天花板 == 合法满级', async () => {
  const legit = await join(uniq('满级'), LEGIT_MAX);
  const cheat = await join(uniq('顶格'), CHEAT);
  assert.equal(legit.ok, true, '合法满级快照应能登录：' + JSON.stringify(legit));
  assert.equal(cheat.ok, true, '组合攻击快照应能登录（钳制后仍可玩）：' + JSON.stringify(cheat));
  assert.equal(legit.player.powerSource, 'snapshot');
  assert.equal(cheat.player.power, legit.player.power,
    '每项顶到天文数字的战力必须与合法满级完全相等（说明钳制生效）；实际 合法=' + legit.player.power + ' 攻击=' + cheat.player.power);
  assert.equal(legit.player.power, expectedPower(LEGIT_MAX), '合法满级必须等于预言值');
});

test('E2 逐项钳制：单项超限等价于该项取合法上限，而不是被采信', async () => {
  /* 每一项单独放大到 1e9，其余置 0：结果必须等于"该项=合法上限、其余 0"，且严格小于该项=1e9 若无钳制的情形 */
  const fields = ['rank', 'weapon', 'weaponLv', 'affixPct', 'wuPct', 'artBgPct', 'danPowPct', 'dtPowPct', 'petPower', 'equipPower'];
  const capOf = {
    rank: CAPS.RANK, weapon: WEAPON_MULT.length - 1, weaponLv: CAPS.ENHANCE,
    affixPct: CAPS.AFFIX_PCT, wuPct: CAPS.WU_PCT, artBgPct: CAPS.ART_BG,
    danPowPct: CAPS.DAN_FRAC, dtPowPct: CAPS.DT_PCT, petPower: 400, equipPower: CAPS.EQUIP
  };
  const ZERO = {
    rank: 0, gongLvs: [0, 0, 0], weapon: 0, weaponLv: 0, affixPct: 0, wuPct: 0,
    artBgPct: 0, danPowPct: 0, dtPowPct: 0, petPower: 0, equipPower: 0
  };
  for (let idx = 0; idx < fields.length; idx++) {
    const f = fields[idx];
    const over = await join(uniq('超' + idx), { ...ZERO, [f]: 1e9 });
    const atCap = await join(uniq('正' + idx), { ...ZERO, [f]: capOf[f] });
    assert.equal(over.ok, true, f + ' 超限快照应能登录');
    assert.equal(over.player.power, atCap.player.power,
      f + ' 超限必须被钳到合法上限（实际 ' + over.player.power + ' vs 上限 ' + atCap.player.power + '）');
  }
  /* 功法单独测：三维都超限 == 三维都=10 */
  const overG = await join(uniq('超gong'), { ...ZERO, gongLvs: [1e9, 1e9, 1e9] });
  const capG = await join(uniq('正gong'), { ...ZERO, gongLvs: [10, 10, 10] });
  assert.equal(overG.player.power, capG.player.power, '功法等级超限必须被钳到 10 级');
});

test('E3 合法满级快照不得被削弱（上限收太窄会误伤真玩家）', async () => {
  const legit = await join(uniq('真满级'), LEGIT_MAX);
  assert.equal(legit.ok, true);
  const p = legit.player.power;
  assert.ok(p > 1.5e9, '满级真号战力应 > 1.5e9（法宝 0.86 / 灵兽随境界封顶后实测约 1.99e9），实际 ' + p);
  assert.ok(p < 2e9, '满级真号战力应 < 2e9，实际 ' + p);
});

test('E4 天花板数量级守卫：全顶格战力必须显著低于旧上限时代的 1e10', async () => {
  const cheat = await join(uniq('天花板'), CHEAT);
  assert.equal(cheat.ok, true);
  const p = cheat.player.power;
  assert.ok(p < 3e9, '顶格战力必须 < 3e9（若把 PET/EQUIP 上限改回 3e9，此条会红）；实际 ' + p);
  /* 与旧行为对照：旧上限下同一份快照会打到 MAX_POWER=1e10 */
  assert.ok(p < 1e10 * 0.5, '不得回到 1e10 量级');
});

test('E5 源码守卫：六个汇总项上限必须等于实测推导值', () => {
  const src = readFileSync(path.join(ROOT, 'server', 'server.mjs'), 'utf8');
  const grab = (name) => {
    const m = src.match(new RegExp('const\\s+' + name + '\\s*=\\s*([0-9_.e]+)'));
    return m ? Number(m[1].replace(/_/g, '')) : NaN;
  };
  assert.equal(grab('AFFIX_POW_CAP_PCT'), 22, '词缀上限应为 22（单条最高品阶；rollAffix 保证不重复）');
  assert.equal(grab('WU_POW_CAP_PCT'), 52, '悟道锋芒全满 = 52');
  assert.equal(grab('DAN_POW_CAP_FRAC'), 0.55, '淬体丹最高档 = 0.55');
  assert.equal(grab('DT_POW_CAP_PCT'), 22.5, '洞天 pow 15 × 主洞 1.5 = 22.5');
  assert.equal(grab('ART_BG_MAX'), 0.86, '法宝战力最高 = ART_FX.bg 0.56 + 强化 20 级 ×1.5% = 0.86');
  assert.equal(grab('PET_TOTAL_CAP'), 0.40, '灵兽合计封顶 = 40% × 境界基础战力（随 rank 计算）');
  assert.ok(!/const\s+PET_POWER_CAP\s*=/.test(src), '不得再留固定 216 万灵兽上限（会低估高境界合法灵兽）');
  assert.equal(grab('EQUIP_POWER_CAP'), 4500, '三槽最强装备 = 4500');
});
