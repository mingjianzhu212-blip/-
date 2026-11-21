/* server/multi-p0d.test.mjs — #75 legacy 战力回退闸门验收（第 122 轮）
 *
 * 背景：第 120 轮探针实测出两个 P0-B 遗留边界，其中 legacy 路径更危险——
 *   无 snapshot 时服务器接受客户端自报 body.power（原仅校验 0 < p ≤ 1e10），
 *   自报 9.99e9 是满级真号（实测 2.78e9）的 3.6 倍；一个自报号带一个正常号，
 *   不放任何技能即可走完五层。
 *
 * 制作人裁定（已授权）：SERVER_LEGACY_POWER **默认关闭**，仅显式设为 '1' 才开启。
 * 本套测试验证该闸门的三种状态：
 *   默认（不设 env）    → 无快照登录一律 LEGACY_DISABLED；带快照的正规客户端不受影响。
 *   显式 =1            → 兼容旧客户端，但受 LEGACY_POWER_CAP（3e9，与 MAX_POWER 解耦）约束。
 *   快照畸形           → BAD_SNAPSHOT（不再静默回落成 power=100 的隐形 legacy）。
 *
 * 纪律：真子进程 + 真 HTTP，不 mock。两个服务器实例（关闸 / 开闸）各起一份。
 *
 * 运行：node --test server/multi-p0d.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT_OFF = 9003;      // 默认：legacy 关闭
const PORT_ON = 9004;       // 显式：SERVER_LEGACY_POWER=1
const BASE_OFF = 'http://127.0.0.1:' + PORT_OFF;
const BASE_ON = 'http://127.0.0.1:' + PORT_ON;
const SETTLE_MS = 2000;   // 需足够宽，D11 要观察 settled 相位

const kids = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function postTime(base, p, body) {
  const r = await fetch(base + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return r.json();
}
const postOff = (p, b) => postTime(BASE_OFF, p, b);
const postOn = (p, b) => postTime(BASE_ON, p, b);
const getJson = async (base, p) => (await fetch(base + p)).json();

async function boot(port, extraEnv) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    env: { ...process.env, SERVER_PORT: String(port), SERVER_OFFLINE_KICK_MS: '60000', SERVER_SETTLE_HOLD_MS: String(SETTLE_MS), ...extraEnv },
    stdio: 'ignore'
  });
  kids.push(child);
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(base + '/api/health'); if ((await r.json()).ok) return child; } catch { /* 未起 */ }
    await sleep(120);
  }
  throw new Error('server did not start on ' + port);
}

/* 正规客户端快照：中段养成（rank 5，功法各 3 级，法宝 3 阶强化 5） */
const MID_SNAP = { rank: 5, gongLvs: [3, 3, 3], weapon: 3, weaponLv: 5, affixPct: 20, wuPct: 10, artBgPct: 0.14, danPowPct: 0.1, dtPowPct: 8, petPower: 12000, equipPower: 800 };
/* 满级快照：仅用于 D11 验证"关闸后仍能打完五层"（门槛最高 12800） */
const MAX_SNAP = { rank: 25, gongLvs: [10, 10, 10], weapon: 9, weaponLv: 20, affixPct: 88, wuPct: 52, artBgPct: 0.56, danPowPct: 0.55, dtPowPct: 22.5, petPower: 216000000, equipPower: 5400 };

before(async () => {
  /* 关键：这里**不设** SERVER_LEGACY_POWER，测的就是默认档 */
  await boot(PORT_OFF, {});
  await boot(PORT_ON, { SERVER_LEGACY_POWER: '1' });
});
after(() => { kids.forEach(k => { try { k.kill(); } catch { /* noop */ } }); });

const uniq = (s) => s + Math.floor(Math.random() * 9000 + 1000);

/* ---------------- 默认档：闸门关闭 ---------------- */

test('D1 默认配置下健康检查应报 legacyPower=false（闸门默认关闭）', async () => {
  const h = await getJson(BASE_OFF, '/api/health');
  assert.equal(h.ok, true);
  assert.equal(h.legacyPower, false, '未设 SERVER_LEGACY_POWER 时 legacyPower 必须为 false');
});

test('D2 默认档：无快照登录一律 LEGACY_DISABLED，并给出可读中文提示', async () => {
  const j = await postOff('/api/join', { name: uniq('旧端'), power: 5000 });
  assert.equal(j.ok, false, '默认档下无快照不应登录成功');
  assert.equal(j.code, 'LEGACY_DISABLED');
  assert.ok(typeof j.error === 'string' && j.error.length > 8, '必须带可读 error，客户端才能提示用户刷新');
  assert.ok(/快照/.test(j.error), 'error 应说明缺的是养成快照');
});

test('D3 默认档：带快照的正规客户端不受影响（powerSource=snapshot，战力>0）', async () => {
  const j = await postOff('/api/join', { name: uniq('正规'), power: 999999999, snapshot: MID_SNAP });
  assert.equal(j.ok, true, '带快照必须能登录：' + JSON.stringify(j));
  assert.equal(j.player.powerSource, 'snapshot');
  assert.ok(j.player.power > 1000, '中段养成战力应显著高于白板，实测 ' + j.player.power);
  assert.ok(j.player.power < 999999999, '必须忽略客户端自报的 body.power（闸门之外这条也不能漏）');
});

test('D4 默认档：即使 body.power 荒谬（1e12）也走闸门拒绝，而不是 BAD_POWER', async () => {
  /* 语义：闸门先于数值校验——没有快照就根本没有可核验输入，报什么值都不重要 */
  const j = await postOff('/api/join', { name: uniq('荒谬'), power: 1e12 });
  assert.equal(j.ok, false);
  assert.equal(j.code, 'LEGACY_DISABLED', '无快照路径应统一被闸门拦住');
});

test('D5 快照畸形（数组/非对象）应 BAD_SNAPSHOT，不得静默回落成 power=100', async () => {
  const a = await postOff('/api/join', { name: uniq('数组'), power: 5000, snapshot: [] });
  assert.equal(a.ok, false, '数组快照不应被当成合法快照');
  assert.equal(a.code, 'BAD_SNAPSHOT');
  const b = await postOff('/api/join', { name: uniq('字符串'), power: 5000, snapshot: 'boom' });
  assert.equal(b.ok, false);
  assert.equal(b.code, 'BAD_SNAPSHOT');
});

/* ---------------- 显式开闸：兼容旧客户端，但受 cap 约束 ---------------- */

test('D6 显式 SERVER_LEGACY_POWER=1 时旧客户端可登录，powerSource=legacy', async () => {
  const h = await getJson(BASE_ON, '/api/health');
  assert.equal(h.legacyPower, true, '显式开启后 legacyPower 必须为 true');
  const j = await postOn('/api/join', { name: uniq('兼容'), power: 5000 });
  assert.equal(j.ok, true, '开闸后无快照应可登录：' + JSON.stringify(j));
  assert.equal(j.player.power, 5000);
  assert.equal(j.player.powerSource, 'legacy');
});

test('D7 开闸后 LEGACY_POWER_CAP(3e9) 与 MAX_POWER(1e10) 解耦：4e9 应被拒', async () => {
  /* 这条是关键：4e9 < MAX_POWER=1e10，若 cap 没解耦就会被放行 */
  const over = await postOn('/api/join', { name: uniq('超帽'), power: 4e9 });
  assert.equal(over.ok, false, '4e9 超过 LEGACY_POWER_CAP 应被拒，即使低于 MAX_POWER');
  assert.equal(over.code, 'BAD_POWER');

  const edge = await postOn('/api/join', { name: uniq('帽内'), power: 3e9 });
  assert.equal(edge.ok, true, '恰好等于 cap 应放行：' + JSON.stringify(edge));
  assert.equal(edge.player.power, 3e9);
});

test('D8 开闸后仍不接受非法数值（0 / 负数 / 字符串 / NaN）', async () => {
  for (const bad of [0, -5, '10000', Number.NaN]) {
    const j = await postOn('/api/join', { name: uniq('非法'), power: bad });
    assert.equal(j.ok, false, '非法 power 应被拒：' + String(bad));
    assert.equal(j.code, 'BAD_POWER');
  }
});

test('D9 开闸后带快照仍优先走重算（legacy 只是兼容通道，不夺权）', async () => {
  const j = await postOn('/api/join', { name: uniq('双给'), power: 2e9, snapshot: MID_SNAP });
  assert.equal(j.ok, true);
  assert.equal(j.player.powerSource, 'snapshot', '带快照时必须走重算，而不是采信 2e9');
  assert.ok(j.player.power < 2e9, 'body.power 必须被忽略，实测 ' + j.player.power);
});

test('D10 既不报快照也不报 power：不再静默补 power=100（关闸 LEGACY_DISABLED / 开闸 BAD_POWER）', async () => {
  /* 旧行为：这种登录会被服务器凭空补成 power=100 且标 legacy——隐式默认信任。
     新行为：关闸时被闸门拒；开闸时因"缺数值"拒。两条都不再产生默认战力。 */
  const off = await postOff('/api/join', { name: uniq('空手') });
  assert.equal(off.ok, false);
  assert.equal(off.code, 'LEGACY_DISABLED');

  const on = await postOn('/api/join', { name: uniq('空手2') });
  assert.equal(on.ok, false, '开闸后缺 power 也不应被补成 100');
  assert.equal(on.code, 'BAD_POWER');
});

test('D11 默认档（legacy 关）下仅凭快照客户端仍能完整走完五层并结算', async () => {
  /* 本轮最重要的回归保护：既有 5 套测试都是开闸跑的，没人验证过"关闸后还能不能玩"。
     这里用两个纯快照客户端走完 建房→入队→备好→开战→五层→结算。 */
  const A = await postOff('/api/join', { name: uniq('甲'), power: 1, snapshot: MAX_SNAP });
  const B = await postOff('/api/join', { name: uniq('乙'), power: 1, snapshot: MAX_SNAP });
  assert.equal(A.ok, true, JSON.stringify(A));
  assert.equal(B.ok, true, JSON.stringify(B));
  assert.equal(A.player.powerSource, 'snapshot');

  const room = await postOff('/api/room/create', { token: A.player.token });
  assert.equal(room.ok, true, '建房应成功：' + JSON.stringify(room));
  const roomId = room.room.id;
  assert.equal((await postOff('/api/room/join', { token: B.player.token, roomId })).ok, true);
  assert.equal((await postOff('/api/room/ready', { token: A.player.token, ready: true })).ok, true);
  assert.equal((await postOff('/api/room/ready', { token: B.player.token, ready: true })).ok, true);
  const started = await postOff('/api/room/start', { token: A.player.token });
  assert.equal(started.ok, true, '开战应成功：' + JSON.stringify(started));

  for (let layer = 1; layer <= 5; layer++) {
    await postOff('/api/run/strike', { token: A.player.token });
    await postOff('/api/run/strike', { token: B.player.token });
    await sleep(120);
  }

  let phase = '?';
  for (let i = 0; i < 60; i++) {
    const lob = await postOff('/api/lobby', { token: A.player.token });
    const rm = (lob.rooms || []).find(x => x.id === roomId);
    if (!rm) { phase = '房间已散'; break; }
    phase = rm.phase;
    if (phase === 'settled') break;
    await sleep(60);
  }
  assert.equal(phase, 'settled', '两个快照客户端应打完全部五层并进入结算，实际 ' + phase);
});
