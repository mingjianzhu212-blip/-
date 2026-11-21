// tools/ui-accept-p1.mjs — P1-A/B 道途 UI 真实验收（多视口真实截图）
// 真实 headless Edge 加载同源联机服，玩家 A 在浏览器里走 大厅→队伍→副本（截图）；
// 玩家 B 用 node 侧 net.js（项目自带的 SSE 注入）作为真实第二连接，满足开局部署。
// 在 360 窄屏 / 1280 宽屏 各截一图，并断言：道途卡含「专注…+15%」、副本含「流派共鸣 +X%」、无横向溢出。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = 7732;
const BASE = 'http://127.0.0.1:' + PORT;
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge'); process.exit(2); }
const SCRATCH = (function () { try { const p = 'D:/xx-scratch'; fs.mkdirSync(p, { recursive: true }); return p; } catch (e) { return os.tmpdir(); } })();
const SHOTS = path.join(HERE, 'ui-accept-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log('[uiaccept]', ...a);

// ---------------- 服务器 ----------------
const srv = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, SERVER_PORT: String(PORT), SERVER_HOST: '127.0.0.1', SERVER_ROOT: ROOT, SERVER_OFFLINE_KICK_MS: '120000', SERVER_SETTLE_HOLD_MS: '3000' }
});
let srvUp = false;
srv.stdout.on('data', d => { if (d.toString().includes('listening on')) srvUp = true; });
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
for (let i = 0; i < 100 && !srvUp; i++) await sleep(100);
if (!srvUp) { console.error('server 没起来'); srv.kill('SIGKILL'); process.exit(1); }
log('server up', BASE);

// ---------------- Edge（仅玩家 A 的浏览器） ----------------
const ud = path.join(SCRATCH, 'uiaccept_' + process.pid + '_' + Date.now());
fs.mkdirSync(ud, { recursive: true });
const portFile = path.join(ud, 'DevToolsActivePort');
try { fs.rmSync(portFile, { force: true }); } catch (e) {}
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + ud, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
const exited = new Promise(res => { edge.once('exit', res); edge.once('close', res); });
let dport = 0;
for (let i = 0; i < 120 && !dport; i++) { await sleep(100); try { dport = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || 0; } catch (e) {} }
if (!dport) { console.error('devtools 端口没起来'); cleanup(); process.exit(1); }
log('edge devtools', dport);
const browserWs = (await (await fetch('http://127.0.0.1:' + dport + '/json/version')).json()).webSocketDebuggerUrl;

// ---------------- Page（A）封装 ----------------
class Page {
  constructor(ws) { this.ws = ws; this.seq = 0; this.pending = new Map(); this.onmsg = null;
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); } if (this.onmsg) this.onmsg(m); }; }
  send(method, params) { return new Promise(res => { const id = ++this.seq; this.pending.set(id, res); this.ws.send(JSON.stringify({ id, method, params: params || {} })); }); }
  async enable() { await this.send('Page.enable'); await this.send('Runtime.enable'); await this.send('Emulation.enable'); }
  async navigate(u) { await this.send('Page.navigate', { url: u }); }
  async waitLoad(ms = 20000) { let loaded = false; const to = Date.now() + ms; this.onmsg = m => { if (m.method === 'Page.loadEventFired') loaded = true; }; while (!loaded && Date.now() < to) await sleep(100); this.onmsg = null; }
  async eval(expr) { const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.error) throw new Error('eval error: ' + JSON.stringify(r.error)); const v = r.result && r.result.result && r.result.result.value; return v; }
  async setViewport(w, h) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); }
  async screenshot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); }
}

// ---------------- node 侧 net.js（玩家 B） ----------------
function openSse(u) {
  const ac = new AbortController();
  const h = { close: () => { try { ac.abort(); } catch { } } };
  let q = [], waiter = null, closed = false;
  h.ready = fetch(u, { signal: ac.signal }).then(async (res) => {
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    (async () => { try { for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const frame = buf.slice(0, i); buf = buf.slice(i + 2); let ev = 'message', data = ''; for (const line of frame.split('\n')) { if (line.startsWith('event:')) ev = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); } let parsed = null; try { parsed = JSON.parse(data); } catch { parsed = null; } const item = { event: ev, data: parsed }; if (waiter) { const w = waiter; waiter = null; w(item); } else q.push(item); } } } catch { } closed = true; if (waiter) { const w = waiter; waiter = null; w(null); } })();
  });
  h.next = () => new Promise((resolve) => { if (q.length) return resolve(q.shift()); if (closed) return resolve(null); waiter = resolve; });
  return h;
}
function loadNet() {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'net.js'), 'utf8');
  const sandbox = { window: null, fetch: (u, o) => fetch(u, o), URL, JSON, Promise, setTimeout, clearTimeout, encodeURIComponent, console };
  sandbox.window = sandbox; vm.createContext(sandbox); vm.runInContext(src, sandbox, { filename: 'js/net.js' });
  sandbox.Net.deps = { fetch: (u, o) => fetch(u, o), Stream: (u, handlers) => { const sse = openSse(u); (async () => { for (;;) { const ev = await sse.next(); if (!ev) break; try { handlers.onEvent(ev.event, ev.data); } catch { } } })(); return { close: () => sse.close() }; } };
  return sandbox.Net;
}

// ---------------- 浏览器侧辅助 ----------------
async function dismissCharModal(p) {
  const v = await p.eval(`(function(){ var m=document.getElementById('char-modal'); if(m && !m.classList.contains('hidden')){ var n=document.getElementById('char-name'); if(n) n.value='青玄子'; var c=document.getElementById('char-confirm'); if(c) c.click(); return 'dismissed'; } return 'hidden'; })()`);
  if (v === 'dismissed') { await sleep(600); await p.eval(`(function(){ if(window.ROUTER&&window.ROUTER.open) window.ROUTER.open('multi'); })()`); await sleep(600); }
  return v;
}
// 首入引导是「按场景出现的情境提示」，切场景会再弹；截图前强制收起所有可见 modal，保证画面干净
async function hideModals(p) {
  await p.eval(`(function(){ var ms=document.querySelectorAll('.modal'); for(var i=0;i<ms.length;i++){ if(!ms[i].classList.contains('hidden')) ms[i].classList.add('hidden'); } })()`);
}
// 触发式叙事（js/story.js）会按定时器反复弹「初入仙途」浮片；截图场景下直接让其 show/tick 失效并收起当前弹窗
async function suppressStory(p) {
  await p.eval(`(function(){
    try { if (window.Story) { window.Story.show = function(){}; window.Story.tick = function(){}; if (window.Story.renderCardInto) window.Story.renderCardInto = function(){}; } } catch(e){}
    ['story-modal','char-modal'].forEach(function(id){ var m=document.getElementById(id); if(m) m.classList.add('hidden'); });
  })()`);
}
async function enterLobby(p, name, snap, path) {
  return p.eval(`(async()=>{ var r=await window.Net.connect('${BASE}','${name}',1000000,null,${JSON.stringify(snap)},'${path}'); try{ if(window.ROUTER&&window.ROUTER.open) window.ROUTER.open('multi'); }catch(e){} await new Promise(function(res){setTimeout(res,1000);}); return JSON.stringify({ok:!!(r&&r.ok),err:(r&&r.error)||null,state:window.Net?window.Net.state():'?'}); })()`);
}
async function forceRender(p) { await p.eval(`(function(){ if(window.ROUTER&&window.ROUTER.open) window.ROUTER.open('multi'); })()`); await sleep(500); }
async function clickSel(p, sel) { return p.eval(`(function(){ var b=document.querySelector(${JSON.stringify(sel)}); if(b){ b.click(); return true; } return false; })()`); }
async function overflow(p, label, w) {
  const r = await p.eval(`(function(){ var de=document.documentElement; var sw=de.scrollWidth, iw=window.innerWidth; var m=document.getElementById('xx-multi-hall')||document.getElementById('xx-multi-roomcard')||document.getElementById('xx-multi-runcard'); var msw=m?m.scrollWidth:null; return JSON.stringify({scrollWidth:sw,innerWidth:iw,overflowX:sw>iw+2,panelScrollWidth:msw,panelOverflow:msw!=null&&msw>iw+2}); })()`);
  const o = JSON.parse(r); log('overflow', label, w + 'px', JSON.stringify(o)); return o;
}

// ---------------- 流程 ----------------
const report = { steps: [], shots: [], asserts: [], synergy: null };
const SNAP_A = { weapon: 20, weaponLv: 20, equipPower: 0, affixPct: 0, danPowPct: 0, wuPct: 0, artBgPct: 0 };   // 剑修·法宝/强化 满 → +15%
const SNAP_B = { weapon: 0, weaponLv: 0, equipPower: 4500, affixPct: 0, danPowPct: 0, wuPct: 0, artBgPct: 0 };  // 体修·装备 满 → +10.5%
let pA = null, NetB = null;
try {
  // A 的浏览器页
  let initTarget = null;
  for (let i = 0; i < 60 && !initTarget; i++) { await sleep(100); try { const list = await (await fetch('http://127.0.0.1:' + dport + '/json/list')).json(); initTarget = list.find(t => t.type === 'page'); } catch (e) {} }
  const aw = new WebSocket(initTarget.webSocketDebuggerUrl); await new Promise((res, rej) => { aw.onopen = res; aw.onerror = rej; });
  pA = new Page(aw); await pA.enable();

  await pA.navigate(BASE + '/'); await pA.waitLoad(); await sleep(1800);
  await suppressStory(pA); const aModal = 'suppressed'; log('A story suppressed');
  const aEnter = await enterLobby(pA, '道友甲', SNAP_A, 'sword'); log('A enter:', aEnter);
  report.steps.push({ who: 'A', step: 'enterLobby', ...JSON.parse(aEnter) });

  const pathrow = await pA.eval(`(function(){ var e=document.getElementById('xx-multi-pathrow'); return e? e.innerHTML : 'no-el'; })()`);
  const hasFocus = /专注【/.test(pathrow) && /\+15%/.test(pathrow);
  const hasFour = ['剑修', '体修', '丹修', '阵修'].every(n => pathrow.includes(n));
  // 显隐规则（第 128 轮补）：大厅 = 连服务器/报号的入口，只在 lobby 相位显示
  const hallInLobby = await pA.eval(`(function(){ var e=document.getElementById('xx-multi-hall'); return e? e.hidden : 'no-el'; })()`);
  report.asserts.push({ screen: 'lobby', pathCardsRender: hasFocus, fourPaths: hasFour, hallShown: hallInLobby === false });
  log('lobby pathrow hasFocus', hasFocus, 'hasFour', hasFour, 'hallShown', hallInLobby === false);
  for (const [w, h] of [[360, 780], [1280, 900]]) {
    await pA.setViewport(w, h); await sleep(400); await hideModals(pA); await sleep(200);
    const f = path.join(SHOTS, 'lobby_' + w + '.png'); await pA.screenshot(f); report.shots.push({ screen: 'lobby', w, file: f });
    const o = await overflow(pA, 'lobby', w); report.asserts.push({ screen: 'lobby', w, overflowX: o.overflowX, panelOverflow: o.panelOverflow });
  }

  // A 建房
  await forceRender(pA);
  const created = await clickSel(pA, '[data-room="new"]'); await sleep(1200); await forceRender(pA);
  let roomId = await pA.eval(`(function(){ var d=window.Net.data(); return (d&&d.room&&d.room.id)||null; })()`);
  log('A created room:', created, 'roomId:', roomId); report.steps.push({ who: 'A', step: 'createRoom', clicked: created, roomId });
  if (!roomId) throw new Error('A 没建出房间');

  // B（node 侧）连接 + 加入 + 准备
  NetB = loadNet();
  const bEnter = await NetB.connect(BASE, '道友乙', 1000000, null, SNAP_B, 'body');
  log('B enter:', JSON.stringify(bEnter)); report.steps.push({ who: 'B', step: 'enterLobby', ok: !!(bEnter && bEnter.ok), err: (bEnter && bEnter.error) || null });
  const bJoin = await NetB.api('/api/room/join', { roomId });
  log('B join:', JSON.stringify(bJoin)); report.steps.push({ who: 'B', step: 'joinRoom', ok: !!(bJoin && bJoin.ok), err: (bJoin && bJoin.error) || null });
  const bReady = await NetB.api('/api/room/ready', { ready: true });
  log('B ready:', JSON.stringify(bReady)); report.steps.push({ who: 'B', step: 'ready' });

  // A 准备
  await forceRender(pA); await clickSel(pA, '[data-act="ready"]'); await sleep(800); await forceRender(pA);
  const roomState = await pA.eval(`(function(){ var d=window.Net.data(); var r=d&&d.room; return JSON.stringify({members:(r&&r.members||[]).map(function(m){return {name:m.name,path:m.pathName,ready:m.ready};}),canStart:(function(){var rb=(r&&r.members||[]).filter(function(x){return x.ready;}).length; return rb>=2 && (r&&r.members||[]).length>=2 && (r&&r.members||[]).every(function(x){return x.ready;});})()}); })()`);
  log('room state:', roomState); report.steps.push({ who: 'A', step: 'bothReady', room: JSON.parse(roomState) });

  // 队伍截图（两人备好、未开局）
  const hallInRoom = await pA.eval(`(function(){ var e=document.getElementById('xx-multi-hall'); return e? e.hidden : 'no-el'; })()`);
  report.asserts.push({ screen: 'room', hallHidden: hallInRoom === true });
  log('room hall hidden:', hallInRoom);
  for (const [w, h] of [[360, 780], [1280, 900]]) {
    await pA.setViewport(w, h); await sleep(400); await hideModals(pA); await sleep(200);
    const f = path.join(SHOTS, 'room_' + w + '.png'); await pA.screenshot(f); report.shots.push({ screen: 'room', w, file: f });
    const o = await overflow(pA, 'room', w); report.asserts.push({ screen: 'room', w, overflowX: o.overflowX, panelOverflow: o.panelOverflow });
  }

  // A 开局
  const started = await clickSel(pA, '[data-act="start"]'); await sleep(800);
  let runOk = false;
  for (let i = 0; i < 50; i++) { await sleep(200); const has = await pA.eval(`(function(){ var d=window.Net.data(); return !!(d&&d.run); })()`); if (has) { runOk = true; break; } }
  await forceRender(pA); await sleep(400);
  const runHidden = await pA.eval(`(function(){ var e=document.getElementById('xx-multi-runcard'); return e? e.hidden : 'no-el'; })()`);
  const runText = await pA.eval(`(function(){ var e=document.getElementById('xx-multi-runcard'); return e? e.innerText : 'no-el'; })()`);
  log('A start clicked:', started, 'runArrived:', runOk, 'runHidden:', runHidden);
  report.steps.push({ who: 'A', step: 'startRun', clicked: started, runArrived: runOk, runHidden });
  report.synergy = runText.replace(/\s+/g, ' ').slice(0, 600);

  const hasSynergy = /流派共鸣/.test(runText) && /\+\d+%/.test(runText);
  const hallInRun = await pA.eval(`(function(){ var e=document.getElementById('xx-multi-hall'); return e? e.hidden : 'no-el'; })()`);
  report.asserts.push({ screen: 'dungeon', synergyShown: hasSynergy, runHiddenWhenShouldShow: runHidden === true && runOk, hallHidden: hallInRun === true });
  log('dungeon synergyShown:', hasSynergy, 'hallHidden:', hallInRun);
  log('dungeon text:', report.synergy);
  for (const [w, h] of [[360, 780], [1280, 900]]) {
    await pA.setViewport(w, h); await sleep(400); await hideModals(pA); await sleep(200);
    const f = path.join(SHOTS, 'dungeon_' + w + '.png'); await pA.screenshot(f); report.shots.push({ screen: 'dungeon', w, file: f });
    const o = await overflow(pA, 'dungeon', w); report.asserts.push({ screen: 'dungeon', w, overflowX: o.overflowX, panelOverflow: o.panelOverflow });
  }
} catch (e) {
  log('ERROR', e.message); report.error = e.message;
} finally {
  fs.writeFileSync(path.join(HERE, 'ui-accept-report.json'), JSON.stringify(report, null, 2));
  await cleanup();
}
log('REPORT', JSON.stringify(report, null, 2));

async function cleanup() {
  try { if (pA) pA.ws.close(); } catch (e) {}
  try { if (NetB) NetB.disconnect(); } catch (e) {}
  try { if (process.platform === 'win32' && edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore', timeout: 8000 }); else edge.kill(); } catch (e) {}
  await Promise.race([exited, sleep(3000)]);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
  try { srv.kill('SIGKILL'); } catch (e) {}
}
