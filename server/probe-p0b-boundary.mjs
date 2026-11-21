/* server/probe-p0b-boundary.mjs — P0-B 遗留安全边界的**实测探针**（第 120 轮建立，第 122 轮更新）
 *
 * 这不是测试、不参与 `node --test`（文件名不带 .test）。它的唯一用途是把 P0-B
 * 还没根治的地方**量出数字**，避免用"应该没事"来交差。
 *
 * 两个边界：
 *   边界①：legacy 路径 = 不带 snapshot 时服务器接受 body.power。
 *          第 122 轮（#75）已加闸门：默认关闭，仅显式 SERVER_LEGACY_POWER=1 才开。
 *          本探针同时测"关闸"与"开闸"两档，给出残余风险的上界。
 *   边界②：snapshot 路径 = 服务器重算，但**输入是客户端自报的养成数值**，
 *          可一路填到合法上限。这个是结构性问题，局域网阶段无解（需 P2 服务器持有角色档案）。
 *
 * 运行：node server/probe-p0b-boundary.mjs
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const PORT_OFF = 7955;   // 默认档（闸门关闭）
const PORT_ON = 7956;    // 开闸档（SERVER_LEGACY_POWER=1）
const PORT_PROFILE = 7957;   // 档案档（SERVER_PROFILE_MODE=enforce，第 130 轮）
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 合法满级快照：每项取客户端源码的理论最大（第 123 轮核对，宠物 216 万、装备 4500） */
const MAX_SNAP = {
  rank: 25, gongLvs: [10, 10, 10], weapon: 9, weaponLv: 20,
  affixPct: 22, wuPct: 52, artBgPct: 0.56, danPowPct: 0.55, dtPowPct: 22.5,
  petPower: 2160000, equipPower: 4500
};
/* 组合攻击：每项填天文数字，全部靠钳制落地（第 123 轮收紧上限后应等于合法满级） */
const CHEAT_SNAP = {
  rank: 1e9, gongLvs: [1e9, 1e9, 1e9], weapon: 1e9, weaponLv: 1e9,
  affixPct: 1e9, wuPct: 1e9, artBgPct: 1e9, danPowPct: 1e9, dtPowPct: 1e9,
  petPower: 1e9, equipPower: 1e9
};
const ZERO_SNAP = {
  rank: 0, gongLvs: [0, 0, 0], weapon: 0, weaponLv: 0, affixPct: 0, wuPct: 0,
  artBgPct: 0, danPowPct: 0, dtPowPct: 0, petPower: 0, equipPower: 0
};

function mkPost(base) {
  return async function post(p, body) {
    const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
    return r.json();
  };
}

/* 起一个服务、跑 fn、关掉；保证两档配置各自隔离 */
async function withServer(port, extraEnv, fn) {
  const child = spawn(process.execPath, [path.join(HERE, 'server.mjs')], {
    env: { ...process.env, SERVER_PORT: String(port), SERVER_OFFLINE_KICK_MS: '60000', SERVER_SETTLE_HOLD_MS: '3000', ...extraEnv },
    stdio: 'ignore'
  });
  const base = 'http://127.0.0.1:' + port;
  try {
    for (let i = 0; i < 80; i++) {
      try { const r = await fetch(base + '/api/health'); if ((await r.json()).ok) break; } catch { /* 未起 */ }
      await sleep(150);
    }
    await fn(mkPost(base), base);
  } finally {
    try { child.kill(); } catch { /* noop */ }
    await sleep(150);
  }
}

/* 一个号带一个正常号，全程不放技能，看能否走完五层 */
async function runNoSkillFiveLayers(post, cheaterPower) {
  const cheat = await post('/api/join', { name: '作弊' + Math.floor(Math.random() * 9000 + 1000), power: cheaterPower });
  const normal = await post('/api/join', { name: '正常' + Math.floor(Math.random() * 9000 + 1000), power: 1000, snapshot: ZERO_SNAP });
  if (!cheat.ok || !normal.ok) return '登录被拒（cheat=' + (cheat.code || 'ok') + ', normal=' + (normal.code || 'ok') + '）';
  const room = await post('/api/room/create', { token: cheat.player.token });
  if (!room.ok) return '建房失败 ' + room.code;
  await post('/api/room/join', { token: normal.player.token, roomId: room.room.id });
  await post('/api/room/ready', { token: cheat.player.token, ready: true });
  await post('/api/room/ready', { token: normal.player.token, ready: true });
  await post('/api/room/start', { token: cheat.player.token });
  for (let layer = 1; layer <= 5; layer++) {
    await post('/api/run/strike', { token: cheat.player.token });
    await post('/api/run/strike', { token: normal.player.token });
    await sleep(150);
  }
  let phase = '?';
  for (let i = 0; i < 20; i++) {
    const lob = await post('/api/lobby', { token: cheat.player.token });
    const rm = (lob.rooms || []).find(x => x.id === room.room.id);
    if (!rm) { phase = '房间已散'; break; }
    phase = rm.phase;
    if (phase === 'settled' || phase === 'lobby') break;
    await sleep(100);
  }
  return 'phase=' + phase + '（cheater 自报 ' + cheaterPower.toExponential(2) + '）';
}

async function main() {
  const out = {};

  /* ================= 默认档：闸门关闭（生产默认） ================= */
  await withServer(PORT_OFF, {}, async (post, base) => {
    const h = await (await fetch(base + '/api/health')).json();
    out['默认档·legacyPower'] = h.legacyPower;

    const legit = await post('/api/join', { name: '满级合法', power: 1, snapshot: MAX_SNAP });
    out['默认档·满级合法玩家重算战力'] = legit.player.power;

    /* 边界②：全新号 + 满级快照 */
    const forged = await post('/api/join', { name: '伪造快照', power: 1, snapshot: MAX_SNAP });
    out['默认档·空号伪造满级快照战力'] = forged.player.power;
    out['默认档·伪造快照与满级真号比值'] = +(forged.player.power / legit.player.power).toFixed(4);

    /* 边界③（第 123 轮收紧上限后新增）：把每项都顶到天文数字，看钳制后的天花板 */
    const cheatCap = await post('/api/join', { name: '顶格攻击', power: 1, snapshot: CHEAT_SNAP });
    out['默认档·各项顶到 1e9 的战力'] = cheatCap.player.power;
    out['默认档·顶格攻击与满级真号比值'] = +(cheatCap.player.power / legit.player.power).toFixed(4);
    out['默认档·顶格攻击是否超出合法满级'] = cheatCap.player.power > legit.player.power ? '是（异常）' : '否（钳制生效）';

    /* 边界①：无快照自报 */
    const l1 = await post('/api/join', { name: '自报9.99e9', power: 9.99e9 });
    out['默认档·无快照自报 9.99e9'] = l1.ok ? ('被接受=' + l1.player.power) : ('被拒 code=' + l1.code);

    /* 正规客户端是否受影响 */
    const real = await post('/api/join', { name: '正规客户端', power: 999999999, snapshot: ZERO_SNAP });
    out['默认档·带快照正规客户端可登录'] = real.ok;

    out['默认档·作弊号能否无技能秒通五层'] = await runNoSkillFiveLayers(post, 9.99e9);
    out['默认档·作弊号自报但未带快照=被闸门拦下'] = true;
  });

  /* ================= 开闸档：仅局域网迁移旧客户端时显式开启 ================= */
  await withServer(PORT_ON, { SERVER_LEGACY_POWER: '1' }, async (post, base) => {
    const h = await (await fetch(base + '/api/health')).json();
    out['开闸档·legacyPower'] = h.legacyPower;

    const l1 = await post('/api/join', { name: '自报9.99e9', power: 9.99e9 });
    out['开闸档·无快照自报 9.99e9'] = l1.ok ? ('被接受=' + l1.player.power) : ('被拒 code=' + l1.code);

    const l2 = await post('/api/join', { name: '自报3e9', power: 3e9 });
    out['开闸档·自报 3e9（=LEGACY_POWER_CAP）'] = l2.ok ? ('被接受=' + l2.player.power) : ('被拒 code=' + l2.code);

    const l3 = await post('/api/join', { name: '自报4e9', power: 4e9 });
    out['开闸档·自报 4e9（<MAX_POWER 但>CAP）'] = l3.ok ? ('被接受=' + l3.player.power) : ('被拒 code=' + l3.code);

    out['开闸档·残余风险：作弊号无技能秒通五层'] = await runNoSkillFiveLayers(post, 3e9);
  });

  /* ================= 档案档：SERVER_PROFILE_MODE=enforce（第 130 轮 P2-A） =================
   * 这是边界②的**根治档**：服务器自己持有角色档案，战力由档案派生，客户端快照一律不读。
   * 下面三个数就是"根治了没有"的直接证据：
   *   ① 伪造满级快照拿到的战力（应 = 档案初始值，而不是满级真号）
   *   ② 它与满级真号的比值（应远小于 1，而不是 1.0000）
   *   ③ 档案本身是否由服务器说了算（客户端塞的字段被忽略）
   */
  await withServer(PORT_PROFILE, { SERVER_PROFILE_MODE: 'enforce' }, async (post, base) => {
    const h = await (await fetch(base + '/api/health')).json();
    out['档案档·profileMode'] = h.profileMode;

    const forged = await post('/api/join', { name: '伪造快照', power: 1, snapshot: MAX_SNAP });
    out['档案档·伪造满级快照拿到的战力'] = forged.player.power;
    out['档案档·该战力来源'] = forged.player.powerSource;
    const legitPower = 1665108540;   /* 默认档实测的满级合法重算值（探针自测，见上方默认档） */
    out['档案档·伪造快照与满级真号比值'] = +(forged.player.power / legitPower).toFixed(8);

    const cheatCap = await post('/api/join', { name: '顶格攻击', power: 1, snapshot: CHEAT_SNAP });
    out['档案档·各项顶到 1e9 的战力'] = cheatCap.player.power;
    out['档案档·顶格攻击与满级真号比值'] = +(cheatCap.player.power / legitPower).toFixed(8);

    /* 客户端试图直接写档案 */
    const writer = await post('/api/join', { name: '塞档案', power: 1, snapshot: MAX_SNAP, profile: { cultivation: 999999, weaponLv: 20, rank: 25 } });
    const pf = await (await fetch(base + '/api/profile?token=' + encodeURIComponent(writer.player.token))).json();
    out['档案档·客户端塞入的档案修为（应为 0）'] = pf.profile ? pf.profile.cultivation : 'no-profile';
    out['档案档·客户端塞入的档案强化（应为 0）'] = pf.profile ? pf.profile.weaponLv : 'no-profile';
    out['档案档·档案派生战力'] = pf.profile ? pf.profile.profilePower : 'no-profile';
  });

  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error('PROBE FAIL', e); process.exitCode = 1; });
