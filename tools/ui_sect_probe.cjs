'use strict';
/* 同源宗门连接验收：本站静态服务反向代理真实宗门 API，设置页与宗门页读同一状态。 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { createSectServer } = require('../server/sect-server.js');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.UI_SECT_LOG_DIR || 'D:/xx-scratch/log/rv4_ui_fix_20261125/final';
const SCRATCH = (() => { try { fs.mkdirSync('D:/xx-scratch', { recursive: true }); return 'D:/xx-scratch'; } catch (_) { return os.tmpdir(); } })();
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const listen = (s, host = '127.0.0.1') => new Promise(r => s.listen(0, host, r));
const close = s => new Promise(r => s.close(r));
let pass = 0, fail = 0;
const ok = (v, label, got) => { if (v) { pass++; console.log('PASS ' + label); } else { fail++; console.log('FAIL ' + label + ' :: ' + JSON.stringify(got)); } };
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.json':'application/json', '.mp3':'audio/mpeg', '.wav':'audio/wav' };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const dataDir = path.join(SCRATCH, 'uifix_sect_' + process.pid + '_' + Date.now()); fs.mkdirSync(dataDir, { recursive: true });
  const backend = createSectServer({ dataFile: path.join(dataDir, 'sect.json'), allowedOrigins: [] }); await listen(backend);
  const backendPort = backend.address().port;
  let proxyDelayMs = 0;
  const staticServer = http.createServer((req, res) => {
    if (req.url.startsWith('/api/sect/')) {
      const up = http.request({ host: '127.0.0.1', port: backendPort, path: req.url, method: req.method, headers: req.headers }, r => {
        const reply = () => { res.writeHead(r.statusCode, r.headers); r.pipe(res); };
        if (proxyDelayMs) setTimeout(reply, proxyDelayMs); else reply();
      });
      up.on('error', () => { res.writeHead(502); res.end('{"ok":false}'); }); req.pipe(up); return;
    }
    let rel = decodeURIComponent(req.url.split('?')[0]); if (rel === '/') rel = '/index.html';
    const file = path.resolve(ROOT, '.' + rel);
    if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (e, buf) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(buf); });
  });
  const lan = Object.values(os.networkInterfaces()).flat().find(x => x && x.family === 'IPv4' && !x.internal).address;
  await listen(staticServer, '0.0.0.0');
  const base = 'http://' + lan + ':' + staticServer.address().port;
  const ud = path.join(dataDir, 'edge'); fs.mkdirSync(ud, { recursive: true });
  const portFile = path.join(ud, 'DevToolsActivePort');
  const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + ud, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
  const exited = new Promise(r => { edge.once('exit', r); edge.once('close', r); }); let ws = null, seq = 0, loaded = false; const pending = new Map();
  try {
    if (!EDGE) throw new Error('找不到 Edge');
    let port = 0; for (let i = 0; i < 120 && !port; i++) { await sleep(100); try { port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || 0; } catch (_) {} }
    if (!port) throw new Error('devtools 端口没起来');
    let target; for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find(x => x.type === 'page'); } catch (_) { await sleep(100); } }
    ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Page.loadEventFired') loaded = true; };
    const send = (method, params = {}) => new Promise(r => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
    await send('Page.enable'); await send('Runtime.enable'); await send('Page.navigate', { url: base + '/' });
    for (let i = 0; i < 200 && !loaded; i++) await sleep(100); if (!loaded) throw new Error('页面 load 超时');
    await evaluate(`(async()=>{for(let i=0;i<100&&!window.SECT;i++)await new Promise(r=>setTimeout(r,50));})()`);
    let state; for (let i = 0; i < 100; i++) { await sleep(100); state = await evaluate(`SECT._state()`); if (state.ready) break; }
    ok(state.online && state.ready && state.host === base, 'HTTP 页面默认连接本站同源服务', state);
    await evaluate(`(async()=>{document.getElementById('sc-settings').click(); await new Promise(r=>setTimeout(r,300));})()`);
    const settingOn = await evaluate(`({text:document.getElementById('m-sect-state').textContent,host:document.getElementById('m-sect').value,state:SECT._state()})`);
    ok(settingOn.text === '已连上' && settingOn.host === '' && settingOn.state.host === base, '设置页显示已连接且入口留空自动连接', settingOn);
    await evaluate(`(async()=>{document.getElementById('m-close').click(); ROUTER.open('zong','xx-power'); await SECT.panelOpen();})()`);
    const sectOn = await evaluate(`({state:SECT._state(),body:document.getElementById('panel-host').innerText})`);
    ok(sectOn.state.online && sectOn.state.host === settingOn.state.host && !/localhost/.test(sectOn.body), '宗门页与设置页同源且均在线', sectOn);
    proxyDelayMs = 1500;
    const connecting = await evaluate(`(()=>{SECT.reconnect();const state=SECT._state();ROUTER.open('zong','xx-weather');const weather=document.getElementById('sc-wq').textContent;ROUTER.open('zong','xx-power');const power=document.getElementById('sc-pw-state').textContent;ROUTER.open('zong','xx-help');const help=document.getElementById('sc-quota').textContent;return {state,weather,power,help};})()`);
    ok(!connecting.state.ready && !connecting.state.online && connecting.weather === '连接中…' && connecting.power === '连接中…' && connecting.help === '连接中…', '连接未就绪时三页均显示连接中而非未连接', connecting);
    await evaluate(`(async()=>{for(let i=0;i<80&&!SECT._state().ready;i++)await new Promise(r=>setTimeout(r,50));})()`);
    const reconnected = await evaluate(`SECT._state()`); proxyDelayMs = 0;
    ok(reconnected.ready && reconnected.online, '延迟响应结束后连接状态自行恢复', reconnected);
    await close(backend); backend.removeAllListeners();
    await evaluate(`(async()=>{SECT.reconnect();document.getElementById('sc-settings').click();await SECT.panelOpen();})()`);
    await evaluate(`(async()=>{for(let i=0;i<120&&!/^未连接/.test(document.getElementById('m-sect-state').textContent);i++)await new Promise(r=>setTimeout(r,100));})()`);
    const settingOff = await evaluate(`({text:document.getElementById('m-sect-state').textContent,state:SECT._state()})`);
    const off = await evaluate(`SECT._state()`); ok(!off.ready && !off.online, '服务断开后同源探测明确失败', off);
    await evaluate(`(async()=>{document.getElementById('m-close').click();ROUTER.open('zong','xx-power');await SECT.panelOpen();for(let i=0;i<120&&document.getElementById('sc-pw-state').textContent!=='未连接';i++)await new Promise(r=>setTimeout(r,100));})()`);
    const sectOff = await evaluate(`({state:SECT._state(),text:document.getElementById('sc-pw-state').textContent})`);
    ok(!settingOff.state.online && /^未连接/.test(settingOff.text) && !sectOff.state.online && sectOff.text === '未连接', '断开后设置页与宗门页均显示未连接', { settingOff, sectOff });
  } catch (e) { fail++; console.log('FAIL 探针异常 :: ' + (e.stack || e)); }
  finally {
    try { if (ws) ws.close(); } catch (_) {}
    try { if (edge.pid) process.platform === 'win32' ? spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore', timeout: 8000 }) : edge.kill(); } catch (_) {}
    await Promise.race([exited, sleep(3000)]);
    try { backend.close(); } catch (_) {} try { staticServer.close(); } catch (_) {}
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch (_) {}
    console.log('RESULT pass=' + pass + ' fail=' + fail); process.exitCode = fail ? 1 : 0;
  }
})();
