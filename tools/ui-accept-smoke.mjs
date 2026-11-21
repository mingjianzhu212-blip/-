// tools/ui-accept-smoke.mjs — 探针：验证「同源自服务 + headless Edge + Net.connect + ROUTER.open('multi') 渲染道途卡」
// 只做大厅一屏，目的是先验证最难的三个假设是否成立，再投入完整流程。
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');                 // 游戏项目目录
const PORT = 7731;
const BASE = 'http://127.0.0.1:' + PORT;
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge'); process.exit(2); }

const SCRATCH = (function () { try { const p = 'D:/xx-scratch'; fs.mkdirSync(p, { recursive: true }); return p; } catch (e) { return os.tmpdir(); } })();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- 服务器 ----------
const srv = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, SERVER_PORT: String(PORT), SERVER_HOST: '127.0.0.1', SERVER_ROOT: ROOT, SERVER_OFFLINE_KICK_MS: '120000', SERVER_SETTLE_HOLD_MS: '3000' }
});
let srvUp = false;
srv.stdout.on('data', d => { const s = d.toString(); if (s.includes('listening on')) srvUp = true; });
srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
for (let i = 0; i < 100 && !srvUp; i++) await sleep(100);
if (!srvUp) { console.error('server 没起来'); srv.kill('SIGKILL'); process.exit(1); }
console.log('[smoke] server up on', BASE);
// 探一下首页是否真的返回 index.html
try {
  const r = await fetch(BASE + '/');
  const t = await r.text();
  console.log('[smoke] GET / ->', r.status, 'len', t.length, 'hasIndexHtml', /<html/i.test(t));
} catch (e) { console.error('[smoke] GET / 失败', e.message); }

// ---------- Edge CDP ----------
const ud = path.join(SCRATCH, 'uiaccept_' + process.pid + '_' + Date.now());
fs.mkdirSync(ud, { recursive: true });
const portFile = path.join(ud, 'DevToolsActivePort');
try { fs.rmSync(portFile, { force: true }); } catch (e) {}
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + ud, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
const exited = new Promise(res => { edge.once('exit', res); edge.once('close', res); });
let port = 0;
for (let i = 0; i < 120 && !port; i++) { await sleep(100); try { port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || 0; } catch (e) {} }
if (!port) { console.error('devtools 端口没起来'); cleanup(); process.exit(1); }
console.log('[smoke] edge devtools port', port);

let browserWs = null;
try { browserWs = (await (await fetch('http://127.0.0.1:' + port + '/json/version')).json()).webSocketDebuggerUrl; } catch (e) {}
let target = null;
for (let i = 0; i < 80 && !target; i++) { try { const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); target = list.find(t => t.type === 'page'); } catch (e) { await sleep(100); } }
if (!target) {
  // 复用 profile 没开 page，自己开一个
  try {
    const bws = new WebSocket(browserWs);
    await new Promise((res, rej) => { bws.onopen = res; bws.onerror = rej; });
    bws.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'about:blank' } }));
    await sleep(500); bws.close();
  } catch (e) {}
  for (let i = 0; i < 60 && !target; i++) { await sleep(100); try { const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); target = list.find(t => t.type === 'page'); } catch (e) {} }
}
if (!target) { console.error('没有 page target'); cleanup(); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: BASE + '/' });
let loaded = false;
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Page.loadEventFired') loaded = true; };
for (let i = 0; i < 200 && !loaded; i++) await sleep(100);
console.log('[smoke] page loaded', loaded);
await sleep(1500); // 给游戏初始化一点时间

const expr = `(async () => {
  try {
    const r = await window.Net.connect('${BASE}', '道友甲', 1000000, null,
      { weapon:20, weaponLv:20, equipPower:4500, affixPct:22, danPowPct:0.55, wuPct:0, artBgPct:0.56 }, 'sword');
    try { if (window.ROUTER && window.ROUTER.open) window.ROUTER.open('multi'); } catch(e) {}
    await new Promise(res => setTimeout(res, 1000));
    const hall = document.getElementById('xx-multi-hall');
    const pathrow = document.getElementById('xx-multi-pathrow');
    const off = document.getElementById('xx-multi-offline');
    const room = document.getElementById('xx-multi-roomcard');
    const run = document.getElementById('xx-multi-runcard');
    return JSON.stringify({
      ok: !!(r && r.ok), err: (r && r.error) || null,
      state: window.Net ? window.Net.state() : 'noNet',
      hallHidden: hall ? hall.hidden : 'no-el',
      offHidden: off ? off.hidden : 'no-el',
      roomHidden: room ? room.hidden : 'no-el',
      runHidden: run ? run.hidden : 'no-el',
      pathrowHidden: pathrow ? pathrow.hidden : 'no-el',
      pathrowHTML: pathrow ? pathrow.innerHTML.slice(0, 800) : 'no-el'
    });
  } catch (e) { return JSON.stringify({ except: e.message }); }
})()`;

const ev = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
const val = ev.result && ev.result.result && ev.result.result.value;
console.log('[smoke] eval result:', val);
try { console.log('[smoke] parsed:', JSON.stringify(JSON.parse(val), null, 2)); } catch (e) {}

async function cleanup() {
  try { if (ws) ws.close(); } catch (e) {}
  try { if (process.platform === 'win32' && edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore', timeout: 8000 }); else edge.kill(); } catch (e) {}
  await Promise.race([exited, sleep(3000)]);
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
  try { srv.kill('SIGKILL'); } catch (e) {}
}
await cleanup();
console.log('[smoke] done');
