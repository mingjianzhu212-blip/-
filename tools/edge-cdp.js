'use strict';
/* ============================================================
 * edge-cdp.js —— 用 CDP 代替 Edge 的命令行 --dump-dom / --screenshot
 *
 * 为什么需要它（2026-10-25 实测 Edge 155.0.4283.45）：
 *   同一台机器上 `msedge --headless=new --dump-dom` 与 `--screenshot=...`
 *   都会立刻退出且 stdout / 目标文件为空；但同样的 headless 进程带
 *   `--remote-debugging-port` 却完全正常。也就是说坏的只是命令行这两个
 *   一次性输出开关，不是 headless 本身。
 *   测试脚本（verify / _playtest / _curve / _layout_check / shot）原本全靠
 *   `--dump-dom` 取 DOM，于是统一改走这个薄壳：参数与 Edge 命令行保持一致，
 *   内部连 CDP 取 outerHTML / Page.captureScreenshot，输出形状不变。
 *
 * 用法（由 tools/edge-run.js 调用，不直接手敲）：
 *   node tools/edge-cdp.js --headless=new --disable-gpu --no-first-run \
 *     --user-data-dir=<dir> --virtual-time-budget=16000 --window-size=900,1200 \
 *     --dump-dom file:///...
 *   node tools/edge-cdp.js ... --screenshot=<out.png> file:///...
 *
 * 虚拟时间的语义尽量对齐 Edge 命令行：先真实等到 load，再开
 * Emulation.setVirtualTimePolicy('advance', budget)，等 budget 用完再取结果。
 * （先开虚拟时间会抢在导航之前把预算烧光，实测 diag 永远不出来。）
 * ============================================================ */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
/* 2026-10-26 用户要求：临时产物（浏览器 profile / 截图 / 中间 HTML）一律落 D 盘，不写 C 盘；D 不可用时退回系统 temp。 */
const SCRATCH = (function(){ try{ const p = 'D:/xx-scratch'; fs.mkdirSync(p, { recursive: true }); return p; }catch(e){ return os.tmpdir(); } })();
const path = require('node:path');

const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge。'); process.exit(2); }

const args = process.argv.slice(2);
const getFlag = name => {
  const hit = args.find(a => a === name || a.startsWith(name + '='));
  if (!hit) return null;
  return hit === name ? '' : hit.slice(name.length + 1);
};
const dump = args.includes('--dump-dom');
const shotPath = getFlag('--screenshot');
const budget = Number(getFlag('--virtual-time-budget') || 0);
/* 默认 'advance'：虚拟时间一路快进，不为在途网络请求停脚。跑纯本地的场景这是对的（快）。
   但宗门场景要真发 HTTP，'advance' 会在响应回来之前就把预算烧光，页面里的 fetch 永远不 resolve。
   这种场景显式传 'pauseIfRequestsFetch'，让虚拟时间在有请求在途时暂停。 */
const vtp = getFlag('--virtual-time-policy') || 'advance';
/* 虚拟时间会把 CSS 动画/过渡「一帧跑完」——静态构图能验，命中迸光、飘字这类只活几百毫秒的
   动效一律拍不到（拍出来永远是终态）。要看动效就传 --real-wait=<ms>，走真实时钟等到位再抓。 */
const realWait = Number(getFlag('--real-wait') || 0);
const sizeRaw = getFlag('--window-size') || '900,1200';
const [winW, winH] = sizeRaw.split(',').map(n => Number(n) || 0);
const url = args.find(a => !a.startsWith('--'));
if (!url || (!dump && shotPath == null)) {
  console.error('用法：edge-cdp.js ... --dump-dom <url> | --screenshot=<png> <url>');
  process.exit(2);
}

const ownProfile = !getFlag('--user-data-dir');
const ud = getFlag('--user-data-dir') || path.join(SCRATCH, 'xxcdp' + process.pid + '_' + Date.now());
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 复用同一个 profile 的第二、第三次启动，Edge 有时一个标签都不开（上一次会话没收尾干净），
   /json/list 里只剩 browser/other 目标，调用方就看到「没有 page target」。
   这里自己用浏览器级 CDP 补开一页，省得每个测试脚本都要为每次启动换一个新 profile。 */
async function createPageTarget(port) {
  let bws = null;
  try {
    const v = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
    if (!v.webSocketDebuggerUrl) return null;
    bws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((res, rej) => { bws.onopen = res; bws.onerror = rej; });
    bws.send(JSON.stringify({ id: 1, method: 'Target.createTarget', params: { url: 'about:blank' } }));
    await new Promise(res => {
      const h = ev => { try { if (JSON.parse(ev.data).id === 1) { bws.removeEventListener('message', h); res(); } } catch (e) {} };
      bws.addEventListener('message', h);
      setTimeout(res, 3000);
    });
  } catch (e) {
    return null;
  } finally {
    try { if (bws) bws.close(); } catch (e) {}
  }
  for (let i = 0; i < 60; i++) {
    await sleep(100);
    try {
      const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
      const t = list.find(x => x.type === 'page');
      if (t) return t;
    } catch (e) {}
  }
  return null;
}

(async () => {
  const flags = ['--headless=new', '--disable-gpu', '--no-first-run',
    '--user-data-dir=' + ud, '--remote-debugging-port=0',
    '--window-size=' + (winW || 900) + ',' + (winH || 1200)];
  if (args.includes('--hide-scrollbars')) flags.push('--hide-scrollbars');
  flags.push('about:blank');
  /* 先删残留的端口文件再启动：Edge 启动过程中才写它，复用同一个 profile 时若先读到上一次的
     端口，就会去连一个已经死掉的地址，最后只报「没有 page target」（第 82 轮实测）。 */
  const portFile = path.join(ud, 'DevToolsActivePort');
  try { fs.mkdirSync(ud, { recursive: true }); } catch (e) {}
  try { fs.rmSync(portFile, { force: true }); } catch (e) {}
  const edge = spawn(EDGE, flags, { stdio: 'ignore' });
  let ws = null;
  const exited = new Promise(res => { edge.once('exit', res); edge.once('close', res); });
  const cleanup = async () => {
    try { if (ws) ws.close(); } catch (e) {}
    /* 光 kill 父进程不够：Edge 的 gpu / renderer / utility 子进程不一定会跟着退，
       留下的一堆僵尸无头实例会跟下一次启动抢 CPU，虚拟时间被饿死（第 89 轮实测：diag 永远不出来）。
       Windows 上按进程树杀，一次收干净；其它平台 kill 已经够了。 */
    try {
      if (process.platform === 'win32' && edge.pid) {
        require('node:child_process').spawnSync('taskkill',
          ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore', timeout: 8000 });
      } else edge.kill();
    } catch (e) {}
    /* 必须等 Edge 进程真退出再收尾：profile 锁没释放时，下一次用同一个 user-data-dir
       的启动会把 URL 转交给这个垂死的实例然后立刻退出，DevToolsActivePort 永远读不到，
       调用方只看到 status=1（verify.js 的截图段、shot/*.js 的第二张图都是这么挂的）。 */
    await Promise.race([exited, sleep(3000)]);
    if (ownProfile) { try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
  };
  try {
    /* 端口 0：让 Edge 自己挑，从 profile 里的 DevToolsActivePort 读回来（文件已在启动前清掉） */
    let port = 0;
    for (let i = 0; i < 120 && !port; i++) {
      await sleep(100);
      try { port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || 0; } catch (e) {}
    }
    if (!port) throw new Error('devtools 端口没起来');

    let target = null;
    for (let i = 0; i < 80 && !target; i++) {
      try {
        const list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
        target = list.find(t => t.type === 'page');
      } catch (e) { await sleep(100); }
    }
    if (!target) target = await createPageTarget(port);
    if (!target) throw new Error('没有 page target');

    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let seq = 0;
    const pending = new Map();
    let loaded = false, budgetDone = false;
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      if (m.method === 'Page.loadEventFired') loaded = true;
      if (m.method === 'Emulation.virtualTimeBudgetExpired') budgetDone = true;
    };
    const send = (method, params) => new Promise(res => {
      const id = ++seq;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    /* Edge 不吃 --force-prefers-reduced-motion（实测 matchMedia 仍是 false），只能走 CDP 模拟。
       传 --reduced-motion 时整页按「系统要求减少动态效果」渲染，用于实拍降级后的终态。 */
    if (args.includes('--reduced-motion')) {
      await send('Emulation.setEmulatedMedia',
        { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    }
    /* 截图模式把视口钉死为 --window-size：Page.captureScreenshot 抓的是视口，
       而 Windows 的窗口还有边框/标题栏，直接抓会得到 870×1205 这类尺寸。
       阶段三 S9.3：dump 模式在窄屏（<500）同样钉视口——Edge 的窗口最小内宽约 504，
       否则 --window-size=360,640 量到的 innerWidth 永远是 504，360 档等于没测。
       只在窄屏启用，宽屏沿用原窗口尺寸，避免改变既有布局基线。 */
    if ((!dump && winW && winH) || (dump && winW && winH && winW < 500)) {
      await send('Emulation.setDeviceMetricsOverride',
        { width: winW, height: winH, deviceScaleFactor: 1, mobile: false });
    }
    await send('Page.navigate', { url });
    /* 等到真正 load（约 1s；比死等固定毫秒稳，文件大时也不会抢跑） */
    for (let i = 0; i < 200 && !loaded; i++) await sleep(100);
    if (!loaded) throw new Error('页面 load 超时');

    if (budget > 0) {
      await send('Emulation.setVirtualTimePolicy',
        { policy: vtp, budget, maxVirtualTimeTaskStarvationCount: 10000 });
      const deadline = Date.now() + Math.max(30000, budget + 20000);
      while (!budgetDone && Date.now() < deadline) await sleep(100);
    } else {
      await sleep(realWait || 300);            /* 无预算时给首帧渲染留一点时间；--real-wait 用于拍动效 */
    }

    if (dump) {
      const r = await send('Runtime.evaluate',
        { expression: 'document.documentElement.outerHTML', returnByValue: true });
      const html = r.result && r.result.result && r.result.result.value;
      if (typeof html !== 'string') throw new Error('取 DOM 失败');
      process.stdout.write(html);
    } else {
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const b64 = r.result && r.result.data;
      if (!b64) throw new Error('截图失败');
      fs.writeFileSync(shotPath, Buffer.from(b64, 'base64'));
    }
    /* Browser.close 有时不回响应，等一秒就够；剩下的交给 finally 的 kill */
    try { await Promise.race([send('Browser.close'), sleep(1000)]); } catch (e) {}
  } catch (e) {
    console.error('edge-cdp: ' + (e && e.message || e));
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
})();
