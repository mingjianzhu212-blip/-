// tools/b34b35-accept.mjs — B-34 / B-35 针对性浏览器验收（file:// 双击启动路径）
//
// 目标：捕获页面加载期间真实产生的（1）页面异常 （2）控制台 error 级日志
//       （3）失败网络请求，并按 URL 分类，用于「修改前 / 修改后」对照。
//
// B-34：audio.js 曾引用不存在的 audio/click.wav、audio/levelup.wav —— 浏览器会报
//       net::ERR_FILE_NOT_FOUND（既出现在 Network.loadingFailed，也被记为 console error）。
//       修复后改用既有经核验的 kenney/metal_click.ogg、kenney/chop.ogg，应不再出现 wav 失败。
//
// B-35：file:// 双击且未配置宗门服务地址时，SECT.boot 会向 http://localhost:8787/api/sect/health
//       发探活请求，无服务时失败 net::ERR_CONNECTION_REFUSED。修复后 candidates() 在无配置 file://
//       下返回空候选，不应再发出该请求。
//
// 隔离：独立 --user-data-dir，不碰用户主 Edge；仅写入隔离 profile 的 localStorage。
//
// 运行：node tools/b34b35-accept.mjs --tag=before --out=tools/evidence/b34b35/before.json
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge 可执行文件'); process.exit(2); }

// 允许从外部覆盖待测根目录（用于对照已备份的旧版本），默认就是项目根。
const rootArg = process.argv.find(a => a.startsWith('--root='));
const TEST_ROOT = rootArg ? path.resolve(rootArg.slice('--root='.length)) : ROOT;
const rootPosix = TEST_ROOT.replace(/\\/g, '/');
const FILE_URL = encodeURI('file:///' + rootPosix.replace(/^\/+/, '') + '/index.html');

const tagArg = process.argv.find(a => a.startsWith('--tag='));
const TAG = tagArg ? tagArg.slice('--tag='.length) : 'run';
const outArg = process.argv.find(a => a.startsWith('--out='));
const OUT = outArg ? outArg.slice('--out='.length) : path.join(HERE, 'evidence', 'b34b35', TAG + '.json');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- 隔离 profile ----
const EVID = path.resolve(HERE, 'evidence', 'b34b35');
fs.mkdirSync(EVID, { recursive: true });
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const ud = path.join(EVID, 'edge-profile_' + TAG + '_' + TS);
fs.mkdirSync(ud, { recursive: true });
const portFile = path.join(ud, 'DevToolsActivePort');

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + ud, '--remote-debugging-port=0', 'about:blank'
], { stdio: 'ignore' });
let edgeExited = false;
edge.once('exit', () => { edgeExited = true; });

let port = 0;
for (let i = 0; i < 150 && !port; i++) {
  await sleep(100);
  try { port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || 0; } catch (e) {}
}
if (!port) { console.error('CDP 端口未就绪'); try { edge.kill(); } catch (e) {} process.exit(2); }

let target = null;
for (let i = 0; i < 100 && !target; i++) {
  try { const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); target = list.find(t => t.type === 'page'); } catch (e) { await sleep(100); }
}
if (!target) { console.error('没有 page target'); try { edge.kill(); } catch (e) {} process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0; const pending = new Map();
const pageErrors = [], consoleErrors = [], failedRequests = [], badResponses = [];
const reqUrl = new Map(); // requestId -> url
const reqFail = new Map(); // requestId -> {errorText, canceled}

ws.onmessage = ev => {
  let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  const mm = m.method;
  if (mm === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails || {};
    const frames = (d.stackTrace && d.stackTrace.callFrames) || [];
    pageErrors.push({
      text: d.text || (d.exception || {}).description || 'unknown',
      url: d.url || null, line: d.lineNumber, col: d.columnNumber,
      frames: frames.slice(0, 4).map(f => ({ url: f.url, line: f.lineNumber, fn: f.functionName }))
    });
  } else if (mm === 'Log.entryAdded' && m.params.entry && m.params.entry.level === 'error') {
    const e = m.params.entry;
    consoleErrors.push({ text: String(e.text || '').slice(0, 400), url: e.url || null, line: e.lineNumber || null, source: e.source || null });
  } else if (mm === 'Network.requestWillBeSent') {
    try { reqUrl.set(m.params.requestId, m.params.request && m.params.request.url); } catch (e) {}
  } else if (mm === 'Network.loadingFailed') {
    const rid = m.params.requestId;
    reqFail.set(rid, { errorText: m.params.errorText, canceled: !!m.params.canceled, type: m.params.type });
    failedRequests.push({ url: reqUrl.get(rid) || null, errorText: m.params.errorText, canceled: !!m.params.canceled, type: m.params.type || null });
  } else if (mm === 'Network.responseReceived') {
    const r = m.params.response || {};
    if (r.status >= 400) badResponses.push({ url: (m.params.response && m.params.response.url) || reqUrl.get(m.params.requestId) || null, status: r.status });
  }
};
const send = (method, params) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });

let loadFired = false;
const wrap = ws.onmessage;
ws.onmessage = ev => { wrap(ev); try { const x = JSON.parse(ev.data); if (x.method === 'Page.loadEventFired') loadFired = true; } catch (e) {} };

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');

// 导航到 file:// index.html
loadFired = false;
await send('Page.navigate', { url: FILE_URL });
for (let i = 0; i < 200 && !loadFired; i++) await sleep(100);

// 捕获窗口：SECT 首轮探活超时约 2.5s、音频 404 在加载后 1s 内出现；给 6s 余量。
await sleep(6000);

// ---- 分类 ----
const isWav = u => typeof u === 'string' && /\.wav(\?|$)/i.test(u);
const isSect = u => typeof u === 'string' && (/8787/.test(u) || /\/api\/sect\//.test(u) || /sect-server|sect\/health/.test(u));

const wavFailed = failedRequests.filter(r => isWav(r.url));
const sectFailed = failedRequests.filter(r => isSect(r.url) && !isWav(r.url));
// 控制台错误中也筛 wav / 宗门相关（浏览器常把失败资源记成 console error）
const wavConsole = consoleErrors.filter(e => isWav(e.url) || isWav(e.text));
const sectConsole = consoleErrors.filter(e => isSect(e.url) || isSect(e.text));
const otherConsole = consoleErrors.filter(e => !isWav(e.url) && !isWav(e.text) && !isSect(e.url) && !isSect(e.text));
const otherFailed = failedRequests.filter(r => !isWav(r.url) && !(isSect(r.url) && !isWav(r.url)));

const summary = {
  tag: TAG,
  fileUrl: FILE_URL,
  capturedAt: new Date().toISOString(),
  counts: {
    pageErrors: pageErrors.length,
    consoleErrors: consoleErrors.length,
    failedRequests: failedRequests.length,
    badResponses: badResponses.length
  },
  classified: {
    wavFailedRequests: wavFailed,
    sectFailedRequests: sectFailed,
    wavConsoleErrors: wavConsole,
    sectConsoleErrors: sectConsole,
    otherConsoleErrors: otherConsole,
    otherFailedRequests: otherFailed
  },
  raw: {
    pageErrors, consoleErrors, failedRequests, badResponses
  }
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));

// 收尾
try { await Promise.race([send('Browser.close'), sleep(1000)]); } catch (e) {}
try { if (!edgeExited) { require('node:child_process').spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore', timeout: 8000 }); } } catch (e) {}
try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}

console.log('[' + TAG + '] 已写出 ' + OUT);
console.log('[' + TAG + '] pageErrors=' + pageErrors.length +
  ' consoleErrors=' + consoleErrors.length +
  ' failedRequests=' + failedRequests.length +
  ' | wav=' + (wavFailed.length + wavConsole.length) +
  ' sect=' + (sectFailed.length + sectConsole.length) +
  ' other=' + (otherConsole.length + otherFailed.length));
process.exit(0);
