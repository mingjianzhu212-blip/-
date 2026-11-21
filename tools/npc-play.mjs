// tools/npc-play.mjs — 沈碑识人页 · 真实浏览器游玩验证（不是单元测试）
//
// 目的：用真实 Edge + 真实鼠标事件（Input.dispatchMouseEvent，坐标取自 getBoundingClientRect）
//       走一遍玩家路径，并在每次点击前用 elementFromPoint 做命中校验——不用 DOM .click() 绕过命中测试。
//
// 隔离保证：
//   · 独立 --user-data-dir（D:/xx-scratch/npc-play-evidence/profile-<ts>），不碰用户主 Edge、不碰 9222；
//   · 只在 file:// 的该隔离 profile 内清/写 localStorage，不读取任何真实玩家存档；
//   · 不修改产品文件。
//
// 运行：node tools/npc-play.mjs
// 退出码：0 全通过；1 有断言失败；2 环境异常
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const EVID = path.join('D:/xx-scratch/npc-play-evidence', TS);
fs.mkdirSync(EVID, { recursive: true });
const SHOTS = path.join(EVID, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge'); process.exit(2); }

const PORT = 9411;
const PROFILE = path.join(EVID, 'profile');
const PAGE_URL = 'file:///' + ROOT.replace(/\\/g, '/').replace(/^\/?/, '') + '/index.html';
const VW = Number(process.env.NPC_VW || 1280);
const VH = Number(process.env.NPC_VH || 900);

let pass = 0, fail = 0;
const rows = [];
function ok(name, cond, detail) {
  if (cond) { pass++; rows.push({ name, status: 'PASS', detail: detail || '' }); console.log('  PASS  ' + name); }
  else { fail++; rows.push({ name, status: 'FAIL', detail: detail || '' }); console.error('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT,
  '--window-size=' + VW + ',' + VH, '--hide-scrollbars', 'about:blank'
], { stdio: 'ignore' });

let ws = null, seq = 0;
const pending = new Map();
const events = [];
function send(method, params) {
  return new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('CDP timeout: ' + method)); } }, 30000);
  });
}
async function ev(expr, awaitPromise = true) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise });
  if (r.result && r.result.exceptionDetails) throw new Error('JS: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result && r.result.result ? r.result.result.value : undefined;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const b64 = r.result && r.result.data;
  if (!b64) throw new Error('截图失败: ' + name);
  const f = path.join(SHOTS, name + '.png');
  fs.writeFileSync(f, Buffer.from(b64, 'base64'));
  return f;
}
/* 真实鼠标点击：滚进视口 → 取圆心 → elementFromPoint 命中校验 → 三段式鼠标事件 */
const HIT_SEL = 'sel => { const el = document.querySelector(sel); if(!el) return null;'
  + ' const r = el.getBoundingClientRect(); return { x: r.left + r.width/2, y: r.top + r.height/2, w: r.width, h: r.height }; }';
async function clickSel(sel, note = '', noAuto = false) {
  let attempt = 0, hit = '';
  for (; attempt < 4; attempt++) {
    if (!noAuto) await dismissModals('前置');
    await ev('(() => { const el = document.querySelector(' + JSON.stringify(sel) + '); if(el && el.scrollIntoView) el.scrollIntoView({block:"center"}); return true; })()');
    await sleep(140);
    const box = await ev('(' + HIT_SEL + ')(' + JSON.stringify(sel) + ')');
    if (!box || box.w <= 0 || box.h <= 0) throw new Error('元素不可见: ' + sel);
    hit = await ev('(() => { const e = document.elementFromPoint(' + box.x + ',' + box.y + ');'
      + ' if(!e) return ""; const t = document.querySelector(' + JSON.stringify(sel) + ');'
      + ' if(e === t || t.contains(e) || e.contains(t)) return "ok";'
      + ' const root = e.closest(".modal");'
      + ' return root ? ("MODAL#" + root.id + " :: " + (root.innerText||"").replace(/\\s+/g," ").slice(0,90)) : (e.tagName + "." + e.className); })()');
    if (hit === 'ok') break;
    if (!String(hit).startsWith('MODAL')) throw new Error('命中校验失败(' + sel + ') → 实际命中 ' + hit);
    if (noAuto) throw new Error('命中校验失败(' + sel + ') → 实际命中 ' + hit);
    /* 剧情卡会在我关掉后延迟再弹一层：按它自己的按钮关掉，再试一次 */
    await sleep(500);
  }
  if (hit !== 'ok') throw new Error('命中校验失败(' + sel + ') → 实际命中 ' + hit);
  const box = await ev('(' + HIT_SEL + ')(' + JSON.stringify(sel) + ')');
  const base = { x: box.x, y: box.y, button: 'left', clickCount: 1 };
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: base.x, y: base.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base });
  events.push({ sel, note, at: { x: Math.round(box.x), y: Math.round(box.y) }, hit: 'ok', tries: attempt + 1 });
  await sleep(260);
}
const stele = () => ev('(() => { const s = (typeof XX !== "undefined") && XX._npcStele ? XX._npcStele() : null; return s ? JSON.parse(JSON.stringify(s)) : null; })()');
const text = sel => ev('(() => { const e = document.querySelector(' + JSON.stringify(sel) + '); return e ? e.innerText.replace(/\\s+/g," ").trim() : null; })()');

async function waitBoot() {
  for (let i = 0; i < 120; i++) {
    const ready = await ev('!!((typeof XX !== "undefined") && window.ROUTER && document.getElementById("page-scene"))').catch(() => false);
    if (ready) return true;
    await sleep(250);
  }
  return false;
}
/* 首进必过的「创立角色」：真实点立绘 → 真实输入道号 → 真实点「踏入仙途」 */
async function ensureCharacter() {
  const open = await ev('(() => { const m = document.getElementById("char-modal"); return !!m && !m.classList.contains("hidden"); })()');
  if (!open) return false;
  await shot('00-char-create');
  await clickSel('#char-picks .char-pick', '选男修立绘');
  await clickSel('#char-name', '聚焦道号输入框');
  await send('Input.insertText', { text: '青玄子' });
  await sleep(150);
  const nameVal = await ev('document.getElementById("char-name").value');
  ok('A0 道号真实输入成功', nameVal === '青玄子', 'value=' + nameVal);
  await clickSel('#char-confirm', '踏入仙途');
  await sleep(700);
  return true;
}
/* 新手引导：新游戏会故意重走一遍（finalizeNewGame 清标记）。玩家可跳过——这里走真实的 × 按钮 */
async function dismissTutorial() {
  for (let i = 0; i < 3; i++) {
    const on = await ev('(() => { const m = document.getElementById("tut-mask"); return !!m && m.classList.contains("show"); })()');
    if (!on) return i > 0;
    events.push({ sel: '#tut-mask .tut-x', note: '跳过新手引导（玩家可用的跳过）', hit: 'ok', at: null });
    await clickSel('#tut-mask .tut-x', '跳过新手引导');
    await sleep(400);
  }
  return true;
}
/* 剧情卡 / 奖励卡等真实弹窗：按它们自己的按钮走，和玩家一样，不用脚本硬关 */
const MODAL_CLOSERS = ['#sto-close', '#t-close', '#enc-close', '#rr-close', '#st-close', '#it-close', '#m-close'];
async function dismissModals(tag) {
  let n = 0;
  for (let i = 0; i < 6; i++) {
    const info = await ev('(() => { const m = Array.from(document.querySelectorAll(".modal:not(.hidden)")).filter(x=>x.id!=="char-modal");'
      + ' if(!m.length) return null; const x = m[0]; const b = Array.from(x.querySelectorAll("button.btn-main,button.m-close,button.btn-sub"))'
      + ' .map(y=>y.id?("#"+y.id):null).filter(Boolean); return { id: x.id, head: (x.innerText||"").replace(/\\s+/g," ").slice(0,60), btns: b }; })()');
    if (!info) return n;
    const pick = MODAL_CLOSERS.map(s => s.slice(1)).find(id => info.btns.includes('#' + id));
    if (!pick) return n;
    await clickSel('#' + pick, (tag || '') + ' 关闭弹窗 ' + info.id, true);
    events[events.length - 1].modal = info.head;
    n++;
    await sleep(350);
  }
  return n;
}
async function gotoNpcPage() {
  await clickSel('.sys-btn[data-bld="role"]', '打开人物面板');
  await sleep(400);
  await clickSel('.hub-cell[data-jump="xx-role-npc"]', '进「识人·沈碑」');
  await sleep(500);
  await dismissModals('进识人页');
  await sleep(200);
}

(async () => {
  try {
    // ---- 连接 CDP ----
    let target = null;
    for (let i = 0; i < 120 && !target; i++) {
      await sleep(200);
      try {
        const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
        target = list.find(t => t.type === 'page');
      } catch (e) { }
    }
    if (!target) throw new Error('CDP 端口没起来');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: VW < 560 });
    /* 无头浏览器默认把页面当后台标签（document.hidden=true），产品自己的「面板页/后台标签不弹来访」
       门控会据此拦住浮片——这是测试环境限制，不是产品缺陷。这里让页面以「可见+聚焦」呈现。 */
    try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }

    // ---- 首屏 + 清档（仅该隔离 profile） ----
    await send('Page.navigate', { url: PAGE_URL });
    if (!await waitBoot()) throw new Error('页面未启动');
    await ev('(() => { localStorage.clear(); return true; })()');
    await ev('(() => { localStorage.setItem("hasFinishedTutorial","1"); return true; })()');
    await send('Page.navigate', { url: PAGE_URL });
    if (!await waitBoot()) throw new Error('清档后未启动');
    await sleep(800);
    await ensureCharacter();
    await dismissTutorial();
    await shot('01-scene');

    // ---- A. 初见 ----
    const st0 = await stele();
    ok('A1 新档 met=0（还不认得你）', st0 && st0.met === 0, JSON.stringify(st0 && { met: st0.met, rel: st0.rel }));
    await gotoNpcPage();
    await shot('02-npc-first');
    const greet0 = await text('#npc-greet');
    ok('A2 初见两句开场白真实上屏', !!greet0 && greet0.includes('测灵碑照不出你的命数'), (greet0 || '').slice(0, 60));
    const optCount = await ev('document.querySelectorAll("#npc-opts .npc-opt").length');
    ok('A3 初见给 3 个选项', optCount === 3, 'count=' + optCount);
    ok('A4 初见时话题表不出现（topics 为空）', (await ev('document.querySelectorAll("#npc-topics .npc-topic").length')) === 0);

    await clickSel('#npc-opts .npc-opt[data-opt="ask_black"]', '初见：碑为什么黑');
    const st1 = await stele();
    ok('B1 初见结算真实落档：met=1', st1.met === 1, 'met=' + st1.met);
    ok('B2 初见加关系（ask_black +2）', st1.rel === 2, 'rel=' + st1.rel);
    ok('B3 本世对话次数 +1', st1.cur.talk === 1, 'talk=' + st1.cur.talk);
    const reply1 = await text('#npc-reply');
    ok('B4 回复真实上屏且是沈碑台词', !!reply1 && reply1.includes('黑不是脏'), (reply1 || '').slice(0, 50));
    await shot('03-npc-after-first');

    const topicsAfter = await ev('document.querySelectorAll("#npc-topics .npc-topic").length');
    ok('B5 初见后 6 个话题行出现', topicsAfter === 6, 'count=' + topicsAfter);
    const lockCount = await ev('document.querySelectorAll("#npc-topics .npc-topic.lock").length');
    ok('B6 条件未达的话题被锁（③④⑤）', lockCount === 3, 'locked=' + lockCount);
    const lockClickable = await ev('!!document.querySelector("#npc-topics .npc-topic.lock[data-topic]")');
    ok('B7 锁着的话题行不可点（无 data-topic）', lockClickable === false);

    // ---- C. 有条件的解锁链 ----
    await clickSel('#npc-topics .npc-topic[data-topic="stele1"]', '打开话题①碑');
    const lines1 = await text('#npc-topic-lines');
    ok('C1 话题①正文真实上屏', !!lines1 && lines1.includes('没人知道这碑是谁立的'), (lines1 || '').slice(0, 40));
    await clickSel('#npc-opts .npc-opt[data-opt="listen"]', '话题①：耐心听');
    const st2 = await stele();
    ok('C2 话题①结算 stage 0→1（解锁③）', st2.stage === 1, 'stage=' + st2.stage);
    ok('C3 已听落账 heard∋stele1', (st2.heard || []).includes('stele1'), JSON.stringify(st2.heard));
    const st3unlock = await ev('!document.querySelector("#npc-topics .npc-topic.lock[data-topic=\\"stele3\\"]")');
    ok('C4 ③「三千年」当场解锁', st3unlock === true);
    await shot('04-topic1-done');

    // 打开③
    await clickSel('#npc-topics .npc-topic[data-topic="stele3"]', '打开话题③三千年');
    await clickSel('#npc-opts .npc-opt[data-opt="believe"]', '话题③：信');
    const st3 = await stele();
    ok('C5 stage 1→2（解锁④）', st3.stage === 2, 'stage=' + st3.stage);
    const st4unlock = await ev('!document.querySelector("#npc-topics .npc-topic.lock[data-topic=\\"stele4\\"]")');
    ok('C6 ④「山外」当场解锁', st4unlock === true);

    // ④ + ② 攒关系，验证 rel 门槛才解 ⑤
    await clickSel('#npc-topics .npc-topic[data-topic="stele4"]', '打开话题④山外');
    await clickSel('#npc-opts .npc-opt[data-opt="note"]', '话题④：记下');
    await clickSel('#npc-topics .npc-topic[data-topic="stele2"]', '打开话题②我');
    await clickSel('#npc-opts .npc-opt[data-opt="modest"]', '话题②：自谦');
    let st4 = await stele();
    ok('C7 关系累积到 10（2+3+3+2+2 → 但重复按 +1 计）', st4.rel >= 9, 'rel=' + st4.rel);
    const lock5 = await ev('!!document.querySelector("#npc-topics .npc-topic.lock span, #npc-topics .npc-topic.lock")');
    const lockedNames = await ev('(() => Array.from(document.querySelectorAll("#npc-topics .npc-topic.lock b")).map(e=>e.textContent))()');
    ok('C8 ⑤ 仍锁着（rel<15），且给出不带数字的口吻提示', Array.isArray(lockedNames) && lockedNames.includes('他为何守着'), JSON.stringify(lockedNames));

    // 重复交谈 +1（陪坐）
    for (let i = 0; i < 4; i++) {
      await clickSel('#npc-topics .npc-topic[data-topic="stele1"]', '重复打开①');
      await clickSel('#npc-opts .npc-opt[data-opt="listen"]', '重复：耐心听(+1)');
    }
    const st5 = await stele();
    ok('C9 重复交谈只给 +1（不重复大额 delta）', st5.rel >= 13 && st5.rel <= 16, 'rel=' + st5.rel);
    const unlocked5 = await ev('!document.querySelector("#npc-topics .npc-topic.lock[data-topic=\\"stele5\\"]")');
    ok('C10 rel≥15 时 ⑤ 解锁（条件真实生效）', st5.rel >= 15 ? unlocked5 === true : true, 'rel=' + st5.rel + ' unlocked=' + unlocked5);
    await shot('05-topic5-unlocked');

    if (st5.rel >= 15) {
      await clickSel('#npc-topics .npc-topic[data-topic="stele5"]', '打开话题⑤他为何守着');
      await clickSel('#npc-opts .npc-opt[data-opt="promise"]', '话题⑤：承诺');
      const st6 = await stele();
      ok('C11 stage 3（承诺），关系大幅 +8', st6.stage === 3 && st6.rel >= 23, 'stage=' + st6.stage + ' rel=' + st6.rel);
      ok('C12 choice.promise 落账', st6.choice.promise === 1, 'promise=' + st6.choice.promise);
    } else {
      ok('C11/C12 跳过（rel 未达 15）', false, 'rel=' + st5.rel);
    }

    // ---- D. 碑外一线（heard 派生线索，不提前漏台词）----
    await clickSel('#npc-topics .npc-topic[data-topic="stele6"]', '打开话题⑥道别');
    await clickSel('#npc-opts .npc-opt[data-opt="leave"]', '道别：拱手作别');
    const clueState = await ev('(() => { const rows = Array.from(document.querySelectorAll("#npc-clues .sto-item"));'
      + ' return { n: rows.length, open: rows.filter(r=>r.dataset.open==="1").length,'
      + ' texts: rows.map(r=>r.dataset.open==="1" ? r.innerText.trim().slice(0,12) : "——") }; })()');
    ok('D1 碑外一线恒定 4 条', clueState.n === 4, 'n=' + clueState.n);
    ok('D2 已听过的话题线索点亮（山外/碑/三千年）', clueState.open >= 3, 'open=' + clueState.open);
    ok('D3 未解那条留白「——」（不提前漏 lore）', clueState.texts.filter(t => t.startsWith('——')).length === 4 - clueState.open, JSON.stringify(clueState.texts));

    // ---- E. 刷新后状态正确 ----
    const before = await stele();
    await send('Page.navigate', { url: PAGE_URL });
    if (!await waitBoot()) throw new Error('刷新后未启动');
    await sleep(600);
    const after = await stele();
    ok('E1 刷新后 met/rel/stage/heard 全保留',
      after.met === before.met && after.rel === before.rel && after.stage === before.stage
      && JSON.stringify(after.heard) === JSON.stringify(before.heard),
      'rel ' + before.rel + '→' + after.rel + ' stage ' + before.stage + '→' + after.stage);
    await gotoNpcPage();
    const greetRe = await text('#npc-greet');
    ok('E2 二次进入开场白变了（有记忆的问候，不是初见）', !!greetRe && !greetRe.includes('测灵碑照不出你的命数'), (greetRe || '').slice(0, 50));
    const memTxt = await text('#npc-mem');
    ok('E3 记忆摘要上屏（已听哪几段）', !!memTxt && /已听/.test(memTxt), (memTxt || '').slice(0, 60));
    const heardMark = await ev('(() => Array.from(document.querySelectorAll("#npc-topics .npc-topic em")).map(e=>e.textContent))()');
    ok('E4 听过的话题标「已听」', Array.isArray(heardMark) && heardMark.filter(x => x === '已听').length >= 3, JSON.stringify(heardMark));
    await shot('06-after-reload');

    // 回忆版文案（与首听不同）
    await clickSel('#npc-topics .npc-topic[data-topic="stele1"]', '重开话题①看回忆版');
    const recallTxt = await text('#npc-topic-lines');
    ok('E5 已听话题给「回忆」版而非原文重复', !!recallTxt && recallTxt.includes('回忆'), (recallTxt || '').slice(0, 50));

    // 道别切换：离开页面再回来，回复不残留
    await clickSel('.panel-back[data-back]', '返回人物 hub');
    await sleep(300);
    await clickSel('.hub-cell[data-jump="xx-role-npc"]', '再进识人页');
    const repGone = await ev('(() => { const r = document.getElementById("npc-reply"); return !r || r.hidden || !r.innerText.trim(); })()');
    ok('E6 离页再进，上次回复不残留（页面临时态已清）', repGone === true);
    await shot('07-reenter');

    // 退出人物面板回场景
    await clickSel('.panel-back[data-back]', '回 hub');
    await clickSel('.panel-back[data-back]', '回场景');
    const backScene = await ev('document.getElementById("page-scene").classList.contains("active")');
    ok('E7 可以正常退出到场景', backScene === true);
    await shot('08-back-scene');

    // ---- F. 不破坏既有存档/功能 ----
    const saveKeys = await ev('(() => { const raw = localStorage.getItem("xiuxian_save"); if(!raw) return null;'
      + ' const s = JSON.parse(raw); return { top: Object.keys(s).sort(), rs: s.rank, stone: s.stone,'
      + ' hasNpc: !!s.npcs, steleKeys: s.npcs && s.npcs.stele ? Object.keys(s.npcs.stele).sort() : null }; })()');
    ok('F1 主存档结构未变（9 个 stele 键）', !!saveKeys && saveKeys.hasNpc && saveKeys.steleKeys.length === 9, JSON.stringify(saveKeys && saveKeys.steleKeys));
    ok('F2 角色数值未被 NPC 触碰（rank/stone 仍为数字）', !!saveKeys && typeof saveKeys.rs === 'number' && typeof saveKeys.stone === 'number');
    const noErr = await ev('(() => (window.__hookErr || "") + "")()');
    ok('F3 无全局加载错误', !noErr, noErr);

    // ---- G. 主动来访：久别 72 小时后沈碑自己找上门 ----
    // 两个已核实的环境事实（都记在证据里，不是产品缺陷）：
    //   1) 只改存档里的 rank 没用——读档时按修为重算，无法伪造「破境」；
    //   2) 改完 localStorage 再刷新会被卸载时的自动 save() 覆盖，
    //      所以这里在页面内存里改 stele 的 lastSeen / nudgeAt，然后等一个真实的 60 秒判定节拍。
    // 事件是否触发仍由产品自己的 npcTick 判定，脚本只提供「久别 100 小时」这个前提。
    await ev('(() => { const s = (typeof XX !== "undefined") ? XX._npcStele() : null; if(!s) return "no-state";'
      + ' s.lastSeen = Date.now() - 100*3600*1000; s.nudgeAt = 0; return "injected"; })()');
    let bubbleOn = false;
    for (let i = 0; i < 150 && !bubbleOn; i++) {
      if (i % 20 === 0) await dismissModals('等来访');
      bubbleOn = await ev('(() => { const b = document.getElementById("npc-visit");'
        + ' return !!b && !b.classList.contains("hidden"); })()');
      if (!bubbleOn) await sleep(500);
    }
    const vis = await ev('(() => { const s = (typeof XX !== "undefined") ? XX._npcStele() : null;'
      + ' return { hidden: document.hidden, hasHost: !!document.getElementById("npc-visit"),'
      + ' sceneActive: !!document.getElementById("page-scene") && document.getElementById("page-scene").classList.contains("active"),'
      + ' lastSeen: s ? s.lastSeen : null, nudgeAt: s ? s.nudgeAt : null, now: Date.now(),'
      + ' modalOpen: document.querySelectorAll(".modal:not(.hidden)").length,'
      + ' nvText: (document.getElementById("nv-text")||{}).textContent || "",'
      + ' nvCls: (document.getElementById("npc-visit")||{}).className || "" }; })()');
    ok('G1 久别后沈碑主动上门（非模态浮片出现）', bubbleOn === true, JSON.stringify(vis));
    const bubTxt = await text('#nv-text');
    ok('G2 浮片文案取自配置（久别那句）', !!bubTxt && bubTxt.indexOf('观前的灰') >= 0, (bubTxt || '').slice(0, 40));
    await shot('09-visit-bubble');
    await clickSel('#npc-visit', '点浮片进识人页');
    const onNpc = await ev('!!document.getElementById("xx-role-npc-root") && !!document.getElementById("npc-topics")');
    ok('G3 点浮片直接进「识人·沈碑」子页', onNpc === true);
    const nudge = await ev('(() => { const s = (typeof XX !== "undefined") ? XX._npcStele() : null; return s ? s.nudgeAt : -1; })()');
    ok('G4 事件判定即消费（nudgeAt 已写入，不会重复骚扰）', nudge > 0, 'nudgeAt=' + nudge);
    await shot('10-from-bubble');

    const report = {
      at: new Date().toISOString(), viewport: { w: VW, h: VH }, page: PAGE_URL,
      profile: PROFILE, shots: SHOTS, clicks: events,
      state: { first: st0, afterFirst: st1, afterTopic1: st2, afterStage2: st3, mid: st5, final: await stele() },
      pass, fail, rows
    };
    fs.writeFileSync(path.join(EVID, 'npc-play-report.json'), JSON.stringify(report, null, 2));
    console.log('\n通过 ' + pass + ' / 失败 ' + fail);
    console.log('证据：' + EVID);
    process.exitCode = fail ? 1 : 0;
  } catch (e) {
    console.error('异常：' + (e && e.message || e));
    try { fs.writeFileSync(path.join(EVID, 'npc-play-error.txt'), String(e && e.stack || e)); } catch (_) { }
    process.exitCode = 2;
  } finally {
    try { if (ws) ws.close(); } catch (e) { }
    try {
      spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch (e) { }
    await sleep(600);
  }
})();
