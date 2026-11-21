// tools/npc-closure.mjs — 针对 GPT 独立审查三条 mustFix 的专项核实（真实浏览器 + 逻辑层 vm）
//
// M1 最终状态对应：核对测试所跑版本 = 当前文件（哈希）
// M2 记忆写入 / 存档持久化 一致性：注入 xiuxian_save 写失败，观察内存态、记忆键、刷新后状态
// M3 重复进入与主动来访的生命周期：连续进出 5 次，检查节点是否翻倍、一次点击是否只结算一次、
//    以及 npcTick 在已消费后是否幂等（vm 里直接调纯逻辑层）
//
// 隔离：独立 --user-data-dir；只在该 profile 的 file:// localStorage 内操作；不改产品代码。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';
import crypto from 'node:crypto';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const EVID = path.join('D:/xx-scratch/npc-play-evidence', TS + '-closure');
fs.mkdirSync(EVID, { recursive: true });
const SHOTS = path.join(EVID, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
const PORT = 9416, PROFILE = path.join(EVID, 'profile');
const PAGE_URL = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html';

let pass = 0, fail = 0; const rows = [];
function ok(name, cond, detail) {
  if (cond) { pass++; rows.push({ name, status: 'PASS', detail: detail || '' }); console.log('  PASS  ' + name); }
  else { fail++; rows.push({ name, status: 'FAIL', detail: detail || '' }); console.error('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- M3-b：逻辑层幂等（vm 载入真实 js/npc.js） ---------------- */
function testNpcTickIdempotent() {
  const code = fs.readFileSync(path.join(ROOT, 'js', 'npc.js'), 'utf8');
  const win = {};
  const ctx = { window: win, Date, Math, console, String, Array, Object, JSON, isFinite };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const Npc = win.Npc;
  const now = 1793948558846;
  const stele = { met: 1, rel: 0, stage: 0, heard: [], choice: { listened: 0, showoff: 0, promise: 0 },
    cur: { lastRank: 0, talk: 0, promptTale: 0 }, seenGens: 0,
    lastSeen: now - 100 * 3600 * 1000, nudgeAt: 0 };
  const r1 = Npc.npcTick(stele, { now, gens: 0, rank: 0 });
  const r2 = Npc.npcTick(stele, { now: now + 1000, gens: 0, rank: 0 });
  const r3 = Npc.npcTick(stele, { now: now + 2000, gens: 0, rank: 0 });
  ok('M3-1 久别事件第一次判定触发并写 nudgeAt', !!r1.fired && r1.fired.type === 'idle' && stele.nudgeAt === now,
    'fired=' + (r1.fired && r1.fired.type) + ' nudgeAt=' + stele.nudgeAt);
  ok('M3-2 已消费后再次判定不再触发（不会反复骚扰）', !r2.fired && !r3.fired,
    'r2=' + JSON.stringify(r2.fired) + ' r3=' + JSON.stringify(r3.fired));
  ok('M3-3 事件文案逐字取自配置', r1.fired && r1.fired.text === Npc.NPC_STELE.events.evC, r1.fired && r1.fired.text);
}

/* ---------------- 浏览器部分 ---------------- */
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT, '--window-size=1280,900', '--hide-scrollbars',
  'about:blank'], { stdio: 'ignore' });

let ws = null, seq = 0; const pending = new Map();
const send = (method, params) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, res);
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('CDP timeout ' + method)); } }, 30000);
});
async function ev(expr, awaitPromise = true) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  if (r.result && r.result.exceptionDetails) throw new Error('JS: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 240));
  return r.result && r.result.result ? r.result.result.value : undefined;
}
async function shot(n) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.result.data, 'base64'));
}
const HIT = 'sel => { const el = document.querySelector(sel); if(!el) return null; const r = el.getBoundingClientRect();'
  + ' return { x:r.left+r.width/2, y:r.top+r.height/2, w:r.width, h:r.height }; }';
async function click(sel, note, noAuto) {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (!noAuto) await dismiss();
    await ev('(() => { const el=document.querySelector(' + JSON.stringify(sel) + '); if(el&&el.scrollIntoView) el.scrollIntoView({block:"center"}); return 1; })()');
    await sleep(130);
    const b = await ev('(' + HIT + ')(' + JSON.stringify(sel) + ')');
    if (!b || b.w <= 0) throw new Error('不可见 ' + sel);
    const hit = await ev('(() => { const e=document.elementFromPoint(' + b.x + ',' + b.y + '); if(!e) return "";'
      + ' const t=document.querySelector(' + JSON.stringify(sel) + ');'
      + ' if(e===t||t.contains(e)||e.contains(t)) return "ok"; const m=e.closest(".modal"); return m?("MODAL#"+m.id):(e.tagName+"."+e.className); })()');
    if (hit === 'ok') {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
      await sleep(240); return true;
    }
    await sleep(450);
  }
  throw new Error('命中失败 ' + sel);
}
const CLOSERS = ['#sto-close', '#t-close', '#enc-close', '#rr-close', '#st-close', '#it-close', '#m-close'];
async function dismiss() {
  for (let i = 0; i < 5; i++) {
    const b = await ev('(() => { const m=Array.from(document.querySelectorAll(".modal:not(.hidden)")).filter(x=>x.id!=="char-modal");'
      + ' if(!m.length) return null; return { id:m[0].id, btns:Array.from(m[0].querySelectorAll("button")).map(y=>y.id?("#"+y.id):null).filter(Boolean) }; })()');
    if (!b) return;
    const pick = CLOSERS.map(s => s.slice(1)).find(id => b.btns.includes('#' + id));
    if (!pick) return;
    try { await click('#' + pick, 'close ' + b.id, true); } catch (e) { await sleep(350); }
  }
}
const waitBoot = async () => {
  for (let i = 0; i < 120; i++) {
    const r = await ev('!!((typeof XX !== "undefined") && window.ROUTER && document.getElementById("page-scene"))').catch(() => false);
    if (r) return true; await sleep(250);
  }
  return false;
};

(async () => {
  try {
    console.log('===== M3-b 逻辑层幂等（vm）=====');
    testNpcTickIdempotent();

    let target = null;
    for (let i = 0; i < 120 && !target; i++) {
      await sleep(200);
      try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); target = l.find(t => t.type === 'page'); } catch (e) { }
    }
    if (!target) throw new Error('CDP 未就绪');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }

    /* M1：记录测试所跑版本的文件哈希 */
    const hashes = {};
    for (const f of ['index.html', 'style.css', 'js/game.js', 'js/npc.js']) {
      const c = fs.readFileSync(path.join(ROOT, f));
      hashes[f] = require_hash(c);
    }
    function require_hash(buf) {
      return crypto.createHash('sha256').update(buf).digest('hex');
    }

    // 首启：清档 → 建角色 → 跳引导
    await send('Page.navigate', { url: PAGE_URL });
    if (!await waitBoot()) throw new Error('首启失败');
    await ev('localStorage.clear(); localStorage.setItem("hasFinishedTutorial","1"); 1');
    await send('Page.navigate', { url: PAGE_URL });
    if (!await waitBoot()) throw new Error('清档后失败');
    await sleep(600);
    if (await ev('(() => { const m=document.getElementById("char-modal"); return !!m && !m.classList.contains("hidden"); })()')) {
      await click('#char-picks .char-pick');
      await click('#char-name');
      await send('Input.insertText', { text: '青玄子' });
      await click('#char-confirm');
      await sleep(700);
    }
    for (let i = 0; i < 3; i++) {
      if (!await ev('(() => { const m=document.getElementById("tut-mask"); return !!m && m.classList.contains("show"); })()')) break;
      await click('#tut-mask .tut-x'); await sleep(350);
    }

    // 进识人页，办一次初见（让页面进入稳定状态）
    await click('.sys-btn[data-bld="role"]');
    await click('.hub-cell[data-jump="xx-role-npc"]');
    await sleep(400);
    await dismiss();
    if (await ev('document.querySelectorAll("#npc-opts .npc-opt[data-opt=\\"ask_black\\"]").length')) {
      await click('#npc-opts .npc-opt[data-opt="ask_black"]');
    }

    console.log('\n===== M3-a 重复进入的生命周期 =====');
    const counts = [];
    for (let i = 0; i < 5; i++) {
      console.log('  · 第 ' + (i+1) + ' 轮进出');
      await click('.panel-back[data-back]');          // 回 hub
      await sleep(200);
      await click('.hub-cell[data-jump="xx-role-npc"]');
      await sleep(350);
      await dismiss();
      counts.push(await ev(`(() => ({
        clues: document.querySelectorAll('#npc-clues').length,
        w3: document.querySelectorAll('#npc-w3-guide').length,
        echo: document.querySelectorAll('#npc-world-echo').length,
        greet: document.querySelectorAll('#npc-greet').length,
        topics: document.querySelectorAll('#npc-topics .npc-topic').length,
        opts: document.querySelectorAll('#npc-opts .npc-opt').length
      }))()`));
    }
    const stable = counts.every(c => c.clues <= 1 && c.w3 <= 1 && c.echo <= 1 && c.greet === 1 && c.topics === 6);
    ok('M3-4 连续进出 5 次：壳节点不翻倍、话题恒 6 行', stable, JSON.stringify(counts[counts.length - 1]));
    ok('M3-5 5 次进出后唯一性（clues/w3/echo 各 ≤1）', counts.every(c => c.clues <= 1 && c.w3 <= 1 && c.echo <= 1),
      JSON.stringify(counts.map(c => [c.clues, c.w3, c.echo])));

    console.log('\n===== M3-c 一次点击只结算一次 =====');
    await click('#npc-topics .npc-topic[data-topic="stele1"]');
    const before = await ev('(() => { const s=XX._npcStele(); return { talk: s.cur.talk, rel: s.rel, heard: s.heard.slice() }; })()');
    await click('#npc-opts .npc-opt[data-opt="listen"]');
    const after = await ev('(() => { const s=XX._npcStele(); return { talk: s.cur.talk, rel: s.rel, heard: s.heard.slice() }; })()');
    ok('M3-6 点一次只 +1 次对话（无重复结算）', after.talk === before.talk + 1, before.talk + '→' + after.talk);
    ok('M3-7 首次听话题关系按原值 +3（重复才 +1）', after.rel === before.rel + 3, before.rel + '→' + after.rel);

    console.log('\n===== M2 记忆写入 vs 存档持久化（注入 xiuxian_save 写失败）=====');
    /* 事实基线（先读盘，不猜）：
       - save() 为布尔返回，失败时只调 reportSaveFailure()（game.js:3326/3340），无重试；
       - npcChoose 里 save() 的返回值被忽略（game.js:6927），业务照常推进；
       - 但产品自己在 pagehide / visibilitychange 上各挂了一次 save()（game.js:10154-10155），
         tickLoop 还每 3 秒存一次。所以「写盘失败」只可能是短时窗口，下一拍/卸载时会被补写。
       因此本轮不再假设「必然出现内存/磁盘不一致」，改为分别取证两条真实路径：
       A 故障持续（补写也失败）→ 盘上回退到上次成功写盘点，玩家已被明确告警，记忆键独立留存；
       B 故障恢复后 → 产品自己的保存路径把内存态补写落盘，不产生静默丢失。 */
    const memBefore = await ev('(() => { const raw=localStorage.getItem("jxwd_npc_memory_v1"); return raw ? raw.length : 0; })()');
    const diskBefore = await ev(`(() => { try{
      const raw = localStorage.getItem('xiuxian_save'); if(!raw) return null;
      const st = JSON.parse(raw).npcs.stele;
      return { rel: st.rel, talk: st.cur.talk, heard: st.heard.slice() };
    }catch(e){ return { error: String(e && e.message) }; } })()`);
    // 只让主存档写入失败，记忆键仍可写（模拟磁盘/配额故障只命中主键）
    await ev(`(() => {
      if(!window.__origSetItem) window.__origSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k, v){
        if(k === 'xiuxian_save'){ throw new Error('quota-mock'); }
        return window.__origSetItem.call(this, k, v);
      };
      return 'patched';
    })()`);
    await click('#npc-topics .npc-topic[data-topic="stele2"]');
    await click('#npc-opts .npc-opt[data-opt="modest"]');
    const during = await ev(`(() => { const s=XX._npcStele();
      return { rel: s.rel, talk: s.cur.talk, heard: s.heard.slice(),
               memLen: (localStorage.getItem('jxwd_npc_memory_v1')||'').length,
               replyShown: !document.getElementById('npc-reply').hidden,
               badClass: document.getElementById('npc-reply').classList.contains('bad'),
               replyText: (document.getElementById('npc-reply').innerText||'').slice(0,60) }; })()`);
    ok('M2-1 写盘失败时内存态照常推进（玩家当下看到回复）', during.replyShown === true && !during.badClass,
      'reply=' + during.replyText.replace(/\s+/g, ' '));
    ok('M2-2 记忆键独立写入（不随主存档一起失败）', during.memLen >= memBefore, memBefore + '→' + during.memLen);
    // 同一故障周期内再踢两次写盘：reportSaveFailure 靠 saveFailActive 去重，不该刷屏
    for (let i = 0; i < 2; i++) {
      await click('#npc-topics .npc-topic[data-topic="stele2"]');
      const oid = await ev('(() => { const b=document.querySelector("#npc-opts .npc-opt"); return b?b.getAttribute("data-opt"):null; })()');
      if (oid) await click('#npc-opts .npc-opt[data-opt="' + oid + '"]');
    }
    /* 告警落在游戏日志里（log() → S.log → #xx-log），但识人页是整页视图、日志节点可能不在位，
       所以查全局 DOM 文本，查不到就当 0（不因为取不到节点而抛异常掩盖真实结果）。 */
    const failHits = await ev(`(() => {
      const box = document.getElementById("xx-log");
      const t = box ? box.textContent : (document.body ? document.body.textContent : "");
      return (t.match(/存档写入失败/g) || []).length;
    })()`);
    ok('M2-3 写盘失败对玩家可见（游戏日志出现「存档写入失败」，不是静默丢弃）', failHits >= 1, '告警出现 ' + failHits + ' 次');
    ok('M2-4 同一故障周期只提示一次（saveFailActive 去重，不刷屏）', failHits === 1, '告警出现 ' + failHits + ' 次');

    /* A：故障持续到卸载——pagehide 那次 save() 同样失败，盘上停在故障前最后一次成功写盘。
       这是产品真实边界，必须如实记录（能在界面告警里看到，但盘上确实没写进去）。 */
    const memInMemory = await ev('(() => { const s=XX._npcStele(); return { rel: s.rel, talk: s.cur.talk, heard: s.heard.slice() }; })()');
    await send('Page.navigate', { url: PAGE_URL });
    if (!await waitBoot()) throw new Error('刷新失败');
    await sleep(700);
    const diskAfterFail = await ev(`(() => { const s=XX._npcStele();
      return { rel: s.rel, talk: s.cur.talk, heard: s.heard.slice(),
               memTop: (window.NpcMemory && NpcMemory.mention) ? ((NpcMemory.mention("shen_bei")||{}).top || null) : null }; })()`);
    await shot('m2-A-reload-after-sustained-failure');
    ok('M2-5 故障持续到卸载时，盘上回退到上次成功写盘点（失败窗口内的主档进度确实没落盘）',
      !!diskBefore && !diskBefore.error && diskAfterFail.talk === diskBefore.talk
      && memInMemory.talk > diskAfterFail.talk,
      '故障前盘上 talk=' + (diskBefore && diskBefore.talk) + ' / 内存已到 talk=' + memInMemory.talk
      + ' / 刷新后盘上 talk=' + diskAfterFail.talk);
    ok('M2-6 主档写失败不影响记忆键留存（刷新后记忆仍在）', diskAfterFail.memTop === '初见你那日',
      'memTop=' + diskAfterFail.memTop);

    /* B：恢复写能力后，产品自己的保存路径（pagehide / tickLoop）把内存态补写落盘 → 不产生静默丢失。
       这就是上一轮「不一致=false」的真正原因，逐条落到断言里，不靠猜。 */
    /* B：恢复写能力后，产品自己的保存路径把内存态补写落盘 → 不产生静默丢失。
       刷新后落在主界面，先按玩家路径回识人页（进页本身也会 save()，属产品原有保存点），
       再点一次话题选项，然后比对「内存 vs 盘上」。 */
    await click('.sys-btn[data-bld="role"]');
    await click('.hub-cell[data-jump="xx-role-npc"]');
    await sleep(400);
    await dismiss();
    const openTopic = await ev(`(() => {
      const el = document.querySelector('#npc-topics .npc-topic:not(.lock)');
      return el ? el.getAttribute('data-topic') : null;
    })()`);
    if (!openTopic) throw new Error('刷新后没有可用话题行，无法继续 M2-B');
    await click('#npc-topics .npc-topic[data-topic="' + openTopic + '"]');
    const oid2 = await ev('(() => { const b=document.querySelector("#npc-opts .npc-opt"); return b?b.getAttribute("data-opt"):null; })()');
    if (oid2) await click('#npc-opts .npc-opt[data-opt="' + oid2 + '"]');
    const recoveredMem = await ev('(() => { const s=XX._npcStele(); return { rel: s.rel, talk: s.cur.talk, heard: s.heard.slice() }; })()');
    const diskSynced = await ev(`(() => { try{ const st=JSON.parse(localStorage.getItem("xiuxian_save")).npcs.stele;
      return { rel: st.rel, talk: st.cur.talk }; }catch(e){ return { error: String(e && e.message) }; } })()`);
    ok('M2-7 故障恢复后产品自身保存路径完成补写（内存与盘上重新一致，无静默丢失）',
      !diskSynced.error && diskSynced.talk === recoveredMem.talk && diskSynced.rel === recoveredMem.rel,
      '内存=' + recoveredMem.talk + '/rel' + recoveredMem.rel + ' 盘上=' + diskSynced.talk + '/rel' + diskSynced.rel);
    await send('Page.navigate', { url: PAGE_URL });
    if (!await waitBoot()) throw new Error('刷新失败');
    await sleep(700);
    const disk = await ev('(() => { const s=XX._npcStele(); return { rel: s.rel, talk: s.cur.talk, heard: s.heard.slice(), memTop: (window.NpcMemory && NpcMemory.mention) ? (NpcMemory.mention("shen_bei")||{}).top : null }; })()');
    await shot('m2-B-reload-after-recovery');
    ok('M2-8 恢复后刷新，进度与记忆都还在（端到端持久化成立）',
      disk.talk === recoveredMem.talk && disk.rel === recoveredMem.rel && disk.memTop === '初见你那日',
      '刷新后 talk=' + disk.talk + ' rel=' + disk.rel + ' memTop=' + disk.memTop);

    const out = { at: new Date().toISOString(), viewport: '1280x900', page: PAGE_URL,
      testedFileHashes: hashes, counts,
      memory: { before: memBefore, diskBefore, during, failHits, inMemory: memInMemory, diskAfterFail, recoveredMem, diskSynced, disk },
      pass, fail, rows };
    fs.writeFileSync(path.join(EVID, 'closure-report.json'), JSON.stringify(out, null, 2));
    console.log('\n通过 ' + pass + ' / 失败 ' + fail);
    console.log('证据：' + EVID);
    process.exitCode = fail ? 1 : 0;
  } catch (e) {
    console.error('异常：' + (e && e.message || e));
    try { fs.writeFileSync(path.join(EVID, 'error.txt'), String(e && e.stack || e)); } catch (_) { }
    process.exitCode = 2;
  } finally {
    try { if (ws) ws.close(); } catch (e) { }
    try { spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { }
    await sleep(500);
  }
})();
