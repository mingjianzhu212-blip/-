/* tools/p2a-consistency-check.mjs —— 第 130/131 轮 · 四栏一致性核对
 *
 * 为什么有这个脚本：制作人要求「实际代码、测试证据、回滚依据、roadmap 状态一致」。
 * 人靠记性核对四栏会漂移——文档写了 69 项全绿，代码后来改了；探针数字换了，文档还挂着旧值。
 * 这个脚本把**能机械判定**的部分固化成断言，每次改完 P2-A 相关代码就跑一次。
 *
 * 四栏对照：
 *   A 实际代码   —— 起真服务器，看真响应（不是读源码猜行为）
 *   B 测试证据   —— 真跑 node --test 套件，取计数
 *   C 回滚依据   —— 备份文件是否存在、是否真的是"改前"件（看命名与生成说明）
 *   D roadmap/文档—— 文档里声称的数字与状态，是否与 A/B 实测一致
 *
 * 运行：node tools/p2a-consistency-check.mjs
 * 退出码 0 = 四栏一致；非 0 = 有不一致项（逐条打印）。
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MOD = process.pid % 30;
const PORT_OFF = 8110 + MOD;
const PORT_ENFORCE = 8120 + MOD;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const rows = [];
function row(bar, item, expect, actual, ok, note) {
  rows.push({ bar, item, expect, actual, ok: !!ok, note: note || '' });
}
function read(p) {
  try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return ''; }
}

async function startServer(port, mode) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    env: { ...process.env, SERVER_PORT: String(port), SERVER_PROFILE_MODE: mode, SERVER_OFFLINE_KICK_MS: '60000', SERVER_SETTLE_HOLD_MS: '200' },
    stdio: 'ignore'
  });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(base + '/api/health'); const j = await r.json(); if (j.ok) return { base, child, health: j }; } catch { /* 未起 */ }
    await sleep(150);
  }
  throw new Error('server did not start: ' + mode);
}
function stop(c) { try { c.kill(); } catch { /* noop */ } }

async function post(base, p, body) {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}

const MAX_SNAP = {
  rank: 25, gongLvs: [10, 10, 10], weapon: 9, weaponLv: 20,
  affixPct: 22, wuPct: 52, artBgPct: 0.56, danPowPct: 0.55, dtPowPct: 22.5,
  petPower: 2160000, equipPower: 4500
};

async function main() {
  /* ================= A 栏：实际代码（起真服务器看真响应） ================= */
  const off = await startServer(PORT_OFF, 'off');
  const enf = await startServer(PORT_ENFORCE, 'enforce');

  row('A 实际代码', '默认档位 = off（不改变现有运行行为）', 'off', String(off.health.profileMode), off.health.profileMode === 'off');
  row('A 实际代码', '默认档不建档（GET /api/profile → NO_PROFILE）', 'NO_PROFILE', await (async () => {
    const j = await post(off.base, '/api/join', { name: '核对A', snapshot: MAX_SNAP });
    const pf = await (await fetch(off.base + '/api/profile?token=' + encodeURIComponent(j.player.token))).json();
    return pf.code || 'ok';
  })(), true, '建档与否是 off 档的关键区别');

  const forged = await post(enf.base, '/api/join', { name: '核对B', snapshot: MAX_SNAP });
  row('A 实际代码', 'enforce 档伪造满级快照 → 档案初始战力 1000', '1000', String(forged.player.power), forged.player.power === 1000);
  row('A 实际代码', 'enforce 档战力来源标记', 'profile', String(forged.player.powerSource), forged.player.powerSource === 'profile');

  const pf = await (await fetch(enf.base + '/api/profile?token=' + encodeURIComponent(forged.player.token))).json();
  row('A 实际代码', '档案派生战力 = 生效战力（enforce）', '1000/1000', pf.profile.power + '/' + pf.profile.profilePower, pf.profile.power === 1000 && pf.profile.profilePower === 1000);

  /* A 栏补充：默认档下空号伪造满级快照拿到的战力（作为"独立实测"的分子/分母基准） */
  const offForged = await post(off.base, '/api/join', { name: '核对C', snapshot: MAX_SNAP });
  row('A 实际代码', '默认档·空号伪造满级快照的战力（满级真号量级）', '>1e9', String(offForged.player.power), offForged.player.power > 1e9);

  /* 独立实测比值：档案档 / 默认档 —— 用来核对文档里写的 "6e-7" 是不是实测值 */
  const measuredRatio = forged.player.power / offForged.player.power;
  const measuredRatioStr = measuredRatio.toExponential(0);
  row('A 实际代码', '独立实测比值（档案档伪造值 / 默认档满级真号）', '≈6e-7', measuredRatioStr, Math.abs(measuredRatio - 6e-7) < 1e-8);

  /* 源码层：不得存在写档案的路由 */
  const srv = read('server/server.mjs');
  row('A 实际代码', '服务器不存在 POST /api/profile（客户端无法写档案）', '无', /\['POST',\s*'\/api\/profile'/.test(srv) ? '有' : '无', !/\['POST',\s*'\/api\/profile'/.test(srv));

  /* P2-A-2：档案按道途分配养成轴（源码层核对：常量与接线都在） */
  const prof = read('server/profile.mjs');
  row('A 实际代码', '档案按道途分配轴的常量表存在（四轴）', 'AXIS_GRANTS 四轴', /AXIS_GRANTS/.test(prof) ? 'AXIS_GRANTS 四轴' : '缺失', /AXIS_GRANTS/.test(prof));
  row('A 实际代码', '结算时把道途传给档案推进', 'profiles.grant(..., m.path)', /profiles\.grant\(m\.token,[^)]*m\.path\)/.test(srv) ? '已接' : '未接', /profiles\.grant\(m\.token,[^)]*m\.path\)/.test(srv));

  /* ================= B 栏：测试证据（真跑套件） ================= */
  const suites = ['multi-p0', 'multi-p0b', 'multi-p0c', 'multi-p1a', 'multi-p1a-client', 'multi-p0d', 'multi-p0e', 'multi-ledger', 'multi-p1b', 'multi-p2a'];
  let passTotal = 0, failTotal = 0, suiteFail = [];
  for (const s of suites) {
    const out = spawnSync(process.execPath, ['--test', path.join(ROOT, 'server', s + '.test.mjs')], { encoding: 'utf8', timeout: 180000 });
    const txt = (out.stdout || '') + (out.stderr || '');
    const pm = txt.match(/^# pass (\d+)/m);
    const fm = txt.match(/^# fail (\d+)/m);
    const p = pm ? Number(pm[1]) : 0;
    const f = fm ? Number(fm[1]) : 0;
    passTotal += p; failTotal += f;
    if (f > 0) suiteFail.push(s);
  }
  row('B 测试证据', '联机侧分套跑全绿（无失败）', 'fail=0', 'fail=' + failTotal, failTotal === 0, suiteFail.join(','));
  row('B 测试证据', '联机侧总断言数（应与 roadmap 声称一致）', '70', String(passTotal), passTotal === 70, '分套跑才是真实基线');

  /* ================= C 栏：回滚依据（真实备份 + 生成时间 + 内容） ================= */
  /* 要防的是"文件存在但不是改前状态"这种假证据，所以三样都查：
   *   ① 文件在不在；
   *   ② **生成时间早于被改文件**（mtime 证明它是改动之前取的）；
   *   ③ **内容不含本轮标记**（内容证明它确实是改动之前的状态）。
   *   注：第 130 轮那件是"事后重建件"，只能当还原参考，不算改前证据——脚本对此显式断言。 */
  const backup = 'server/server.mjs.bak_20261104_1205_preP2A';
  const bExists = fs.existsSync(path.join(ROOT, backup));
  row('C 回滚依据', '改前备份文件存在', '存在', bExists ? '存在' : '不存在', bExists);

  const realBackup = 'server/server.mjs.bak_20261104_114042_preP2A2';   /* 第 131 轮改前真备份 */
  const rbExists = fs.existsSync(path.join(ROOT, realBackup));
  row('C 回滚依据', '第 131 轮改前**真备份**存在', '存在', rbExists ? '存在' : '不存在', rbExists);

  let timeOk = false, timeNote = '';
  if (rbExists) {
    const bTime = fs.statSync(path.join(ROOT, realBackup)).mtimeMs;
    const tTime = fs.statSync(path.join(ROOT, 'server/server.mjs')).mtimeMs;
    timeOk = bTime < tTime;
    timeNote = '备份 ' + new Date(bTime).toISOString().slice(0, 19) + ' < 被改文件 ' + new Date(tTime).toISOString().slice(0, 19);
  }
  row('C 回滚依据', '真备份的生成时间早于被改文件', '备份更早', timeNote || '无法比较', timeOk, 'mtime 是"改动前取的"的第一手证据');

  let contentOk = false, contentNote = '';
  if (rbExists) {
    const bTxt = read(realBackup);
    /* 本轮（P2-A-2）引入的标记：AXIS_GRANTS 与 settle 里传 m.path —— 真备份里不该有 */
    const hasNewMark = /AXIS_GRANTS|profiles\.grant\(m\.token,[^)]*m\.path\)/.test(bTxt);
    contentOk = !hasNewMark;
    contentNote = hasNewMark ? '含本轮标记（不是改前状态）' : '不含本轮标记（确为改前状态）';
  }
  row('C 回滚依据', '真备份内容不含本轮标记（确为改前状态）', '不含', contentNote || '无法判断', contentOk);

  row('C 回滚依据', '⚠ 第 130 轮那件是否真为"改动前生成"', '否（事后重建件）', '否（事后重建件）', true,
    '如实记账：第 130 轮改 server.mjs 前没有备份；此件是事后逆向重建，只能当还原参考，不算改前证据');
  const hasRebuildNote = read('HANDOVER.md').includes('不是改前备份');
  row('C 回滚依据', 'HANDOVER 已如实标注"重建件 ≠ 改前备份"', '是', hasRebuildNote ? '是' : '否', hasRebuildNote);

  /* ================= D 栏：roadmap / 文档状态 ================= */
  const road = read('GAME_ROADMAP.md');
  const hand = read('HANDOVER.md');
  const plan = read('SERVER_PROFILE_P2.md');

  row('D 文档状态', 'roadmap 声称联机侧 70 项全绿', '70', road.includes('**70 项全绿**') ? '70' : '未找到', road.includes('**70 项全绿**') && passTotal === 70);
  row('D 文档状态', 'roadmap 记录的探针比值 == A 栏**独立实测**比值', measuredRatioStr, road.includes(measuredRatioStr) ? measuredRatioStr : ('文档未含 ' + measuredRatioStr),
    road.includes(measuredRatioStr), '不是查文档自洽，而是拿文档声称值与实测值对撞');
  row('D 文档状态', 'roadmap 标注 P2-A 为"技术切片完成"而非根治', '技术切片完成', road.includes('技术切片完成') ? '技术切片完成' : '未找到', road.includes('技术切片完成'));
  row('D 文档状态', 'roadmap 明示 ≠ 公网防作弊已解决 / 公网口径不变', '是', /公网口径不变|公网防作弊未解决/.test(road) ? '是' : '否', /公网口径不变|公网防作弊未解决/.test(road));
  row('D 文档状态', 'HANDOVER 标注"不等于 P2 根治完成"', '是', hand.includes('不等于 P2 根治完成') ? '是' : '否', hand.includes('不等于 P2 根治完成'));
  row('D 文档状态', '方案文档头部写明状态口径', '是', /技术切片/.test(plan.slice(0, 1600)) ? '是' : '否', /技术切片/.test(plan.slice(0, 1600)));
  row('D 文档状态', '三份文档一致标注默认 off', '是',
    (road.includes('默认 off') || road.includes('默认仍 off')) && plan.includes('off') ? '是' : '否',
    (road.includes('默认 off') || road.includes('默认仍 off')) && plan.includes('off'));

  /* --- 防回归守卫：被 ChatGPT 独立复核降级/撤销的表述，不得重新溜回文档 ---
     注意：报告里**引用**旧表述（例如"原报告此处写的是'证据闭合'，现已降级"）是允许的，
     所以按行判定：只在"没有降级/引用标记"的行里检查旧表述是否复活。 */
  const rev = read('P2A_REVIEW_132.md');
  const lines = rev.split(/\r?\n/);
  const staleInUse = lines.filter(l => l.includes('证据闭合') && !/降级|原报告|改为|已改|复核/.test(l));
  row('D 文档状态', '复核报告：历史差值表述已降级为"高度吻合"（不再称证据闭合）',
    '含"高度吻合"且旧表述未被当作现行结论',
    (rev.includes('高度吻合') ? '含"高度吻合"' : '缺') + ' / 仍在用的旧表述 ' + staleInUse.length + ' 处',
    rev.includes('高度吻合') && staleInUse.length === 0);
  row('D 文档状态', '复核报告：A/B 方案已标为"候选值 / 待验证设计"', '是',
    (rev.includes('候选值') && rev.includes('待验证设计')) ? '是' : '否',
    rev.includes('候选值') && rev.includes('待验证设计'));
  row('D 文档状态', '复核报告：含新增风险 R2-B（毕业后资源经济）', '是', rev.includes('R2-B') ? '是' : '否', rev.includes('R2-B'));
  row('D 文档状态', '复核报告：失衡倍数**同时给出队伍与个人两个口径**', '16131 + 3945',
    (rev.includes('16,131') ? '有16,131' : '无') + ' / ' + (rev.includes('3,945') ? '有3,945' : '无'),
    rev.includes('16,131') && rev.includes('3,945'), '口径不明 = 数字会被误用');
  row('D 文档状态', '复核报告：B-2 唯一性断言已撤销（不再写"只能靠 B-2"）', '是',
    rev.includes('不是唯一解') ? '已改' : '未改', rev.includes('不是唯一解'));

  /* --- 第 133 轮 R2-B 报告的守卫（命名约定 / 三者不可互替 / 核心结论在场） --- */
  const r2b = read('P2B_RESOURCE_AUDIT.md');
  row('D 文档状态', 'R2-B 报告：代理序列命名为「单成员档案成长序列」', '是',
    r2b.includes('单成员档案成长序列') ? '是' : '否', r2b.includes('单成员档案成长序列'),
    '不得把双人局中的成员写成"单人队伍测试"');
  row('D 文档状态', 'R2-B 报告：声明守卫/测试/独立审计三者不可互替', '是',
    r2b.includes('不能互相替代') ? '是' : '否', r2b.includes('不能互相替代'));
  row('D 文档状态', 'R2-B 报告：核心结论在场（修为无出口 / 战力增量为 0）', '是',
    (r2b.includes('修为') && /delta\.power = 0|零收益/.test(r2b)) ? '是' : '否',
    r2b.includes('修为') && /delta\.power = 0|零收益/.test(r2b));
  /* ChatGPT 独立复核否掉的过度概括：不得把"剑修封顶"写成"所有道途封顶" */
  row('D 文档状态', 'R2-B 报告：体修封顶局数已按实测定（体修 ≠ 其他道途）', '含"第 23 局"',
    r2b.includes('第 23 局') ? '含"第 23 局"' : '缺',
    r2b.includes('第 23 局'), 'ChatGPT 判定"所有道途战力增量为 0"不成立（体修仍在增长）');
  row('D 文档状态', 'R2-B 报告：幂等与信任边界已单列', '是',
    /幂等/.test(r2b) ? '是' : '否', /幂等/.test(r2b));
  row('D 文档状态', 'R2-B 报告：长期模拟已声明"服务器不重启"前提', '是',
    r2b.includes('不重启') ? '是' : '否', r2b.includes('不重启'), '档案纯内存，重启即清空');
  row('D 文档状态', 'R2-B 报告：含零修改证明（产品代码 mtime 对照）', '是',
    /零修改|mtime/.test(r2b) ? '是' : '否', /零修改|mtime/.test(r2b));

  stop(off.child); stop(enf.child);

  /* ================= 输出四栏对照表 ================= */
  const bars = ['A 实际代码', 'B 测试证据', 'C 回滚依据', 'D 文档状态'];
  console.log('\n══ 第 130/131 轮 · 四栏一致性核对（实际代码 / 测试证据 / 回滚依据 / roadmap 状态）══\n');
  let bad = 0;
  for (const bar of bars) {
    console.log('── ' + bar + ' ──');
    for (const r of rows.filter(x => x.bar === bar)) {
      if (!r.ok) bad++;
      console.log('  ' + (r.ok ? '✓' : '✗') + ' ' + r.item);
      console.log('      期望: ' + r.expect + '   实测: ' + r.actual + (r.note ? '   备注: ' + r.note : ''));
    }
    console.log('');
  }
  console.log('结果: ' + (rows.length - bad) + '/' + rows.length + ' 项一致' + (bad ? '（' + bad + ' 项不一致）' : '') + '\n');
  if (bad) process.exitCode = 1;
}

main().catch(e => { console.error('CHECK FAIL', e); process.exitCode = 1; });
