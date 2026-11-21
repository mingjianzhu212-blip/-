'use strict';
/* 背包与物品资产安全 · 真实运行时回归（headless Edge + CDP）
 * 复用项目既有 edge-cdp 思路：启动隔离 headless Edge，加载真实游戏，
 * 在浏览器内运行 tools/inv-diag.js，取回 JSON 观测，逐条核对 PRODUCT_MASTER_PLAN §1.2 的 11 子项 + 4 运行时缺口。
 * 只读审计：不修改产品代码；localStorage 落在一次性隔离 profile（D:/xx-scratch/inv-audit-profile）。
 */
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROJECT = 'D:/xx-scratch/jiuxiao-analysis/九霄问道';
const GAME_JS = path.join(PROJECT, 'js/game.js');
const DIAG = path.join(PROJECT, 'tools/inv-diag.js');
const PROFILE = 'D:/xx-scratch/inv-audit-profile';
const PORT = 9333;
const URL = 'file:///' + PROJECT.replace(/\\/g, '/') + '/index.html';
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge。'); process.exit(2); }

const sha256 = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gameHashBefore = sha256(GAME_JS);

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (e ? '  →  ' + e : '')); } };

(async () => {
  // 启动隔离 headless Edge
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(PROFILE, { recursive: true });
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run',
    '--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT, '--window-size=900,1200', 'about:blank'],
    { stdio: 'ignore' });
  const exited = new Promise(res => { edge.once('exit', res); edge.once('close', res); });
  let ws = null;
  const cleanup = async () => {
    try { if (ws) ws.close(); } catch (e) {}
    try { if (process.platform === 'win32' && edge.pid) require('node:child_process').spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore', timeout: 8000 }); else edge.kill(); } catch (e) {}
    await Promise.race([exited, sleep(3000)]);
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (e) {}
  };
  try {
    // 等 CDP 端口
    let target = null;
    for (let i = 0; i < 80 && !target; i++) {
      await sleep(150);
      try { const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); target = list.find(t => t.type === 'page'); } catch (e) {}
    }
    if (!target) throw new Error('没有 page target');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let seq = 0; const pending = new Map(); let loaded = false;
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Page.loadEventFired') loaded = true; };
    const send = (method, params) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url: URL });
    for (let i = 0; i < 200 && !loaded; i++) await sleep(100);
    if (!loaded) throw new Error('页面 load 超时');
    await sleep(1500); // 等 boot 完成

    const src = fs.readFileSync(DIAG, 'utf8');
    const r = await send('Runtime.evaluate', { expression: src, awaitPromise: true, returnByValue: true });
    const val = r.result && r.result.result && r.result.result.value;
    if (typeof val !== 'string') throw new Error('DIAG 无返回值: ' + JSON.stringify(r.result && r.result.exceptionDetails || r.result));
    const R = JSON.parse(val);

    console.log('\n=== 背包与物品资产安全 · 运行时回归结果 ===');
    if (R.errors && R.errors.length) { console.log('  ! DIAG 内部异常:'); R.errors.forEach(e => console.log('    - ' + e)); }

    // ① 获取
    ok(R.acquire && R.acquire.grew, '① 物品获取：塔·精锐门使背包物品增加', JSON.stringify(R.acquire));
    // ② 堆叠/合并
    ok(R.stack && R.stack.entries === 3 && R.stack.countById === 3, '② 堆叠/合并：重复获取产生独立 entry，按 id 可计数', JSON.stringify(R.stack));
    // ③+⑧ 满背包不丢物
    ok(R.fullBag && R.fullBag.ok === false && R.fullBag.equipmentUnchanged && R.fullBag.weaponStillEquipped && R.fullBag.noItemLost,
      '③⑧ 满背包：卸下失败返回 false，装备不变、物品不丢', JSON.stringify(R.fullBag));
    // ① 转移
    ok(R.transfer && R.transfer.equipped && R.transfer.bagRemovedOnEquip && R.transfer.weaponSet && R.transfer.unequipped && R.transfer.bagReturnedOnUnequip,
      '① 转移：装备/卸下在背包↔装备槽移动无丢失', JSON.stringify(R.transfer));
    // ① 消耗
    ok(R.consume && R.consume.removed, '① 扣除/消耗：服食丹药移除背包物品', JSON.stringify(R.consume));
    // ⑤ 炼制成功
    ok(R.craftSuccess && R.craftSuccess.outputPresent && R.craftSuccess.stoneSpent && R.craftSuccess.noCrash,
      '⑤ 炼制·成功：材料扣除 + 产出入账', JSON.stringify(R.craftSuccess));
    // ⑤ 炼制失败
    ok(R.craftFail && R.craftFail.outputAbsent && R.craftFail.herbNetConsumed,
      '⑤ 炼制·失败：材料先扣、仅返还 30%、无产出（失败耗料为设计内）', JSON.stringify(R.craftFail));
    // ⑤ 炼制门槛不足
    ok(R.craftAbort && R.craftAbort.stoneUnchanged && R.craftAbort.bagUnchanged,
      '⑤ 炼制·门槛不足：材料不足提前返回，零扣除（原子性安全路径）', JSON.stringify(R.craftAbort));
    // ⑦ 领取幂等
    ok(R.claimIdem && R.claimIdem.available && R.claimIdem.idempotent,
      '⑦ 领取幂等：每日签到二次调用不重复发奖', JSON.stringify(R.claimIdem));
    // ⑨ 存档写出/解析
    ok(R.save && R.save.saveTextOk && R.save.bagInSave && R.save.roundTripOk,
      '⑨ 存档：写出/解析/往返一致', JSON.stringify(R.save && { saveTextOk: R.save.saveTextOk, bagInSave: R.save.bagInSave, roundTripOk: R.save.roundTripOk }));
    // ⑩ 旧档兼容
    ok(R.save && R.save.oldSaveCompatible, '⑩ 旧版本存档兼容：极简旧档可解析（不抛错）', 'oldSaveCompatible=' + (R.save && R.save.oldSaveCompatible));
    // ⑪ 异常退出恢复
    ok(R.save && R.save.recoveredBag && R.save.recoveredStone,
      '⑪ 异常退出恢复：内存破坏后 _load() 从持久化快照恢复', JSON.stringify(R.save && { recoveredBag: R.save.recoveredBag, recoveredStone: R.save.recoveredStone }));
    // 损坏存档容错（观测项，不阻断）
    console.log('  · 损坏存档容错 corruptResilient=' + (R.save && R.save.corruptResilient) + (R.save && R.save.corruptResilient === false ? '（若 false 则为真实风险，需补强）' : ''));

    // 落盘原始结果
    fs.mkdirSync(path.join(PROJECT, 'evidence'), { recursive: true });
    fs.writeFileSync(path.join(PROJECT, 'evidence/inventory_audit_result.json'), JSON.stringify(R, null, 2), 'utf8');

    const gameHashAfter = sha256(GAME_JS);
    ok(gameHashAfter === gameHashBefore, '只读审计：game.js 未被修改（SHA 一致）', gameHashBefore.slice(0, 12) + ' vs ' + gameHashAfter.slice(0, 12));
  } catch (e) {
    console.error('审计执行失败: ' + (e && e.stack || e));
    fail++;
  } finally {
    await cleanup();
  }
  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail > 0 ? 1 : 0;
})();
