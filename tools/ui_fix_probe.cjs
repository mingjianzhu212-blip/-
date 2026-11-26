'use strict';
/* rv4m6 UI 修复验收：受控新档 + 六视口/短视口几何、真实中心点击、红点锚定与人物不离页。 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.UI_FIX_LOG_DIR || 'D:/xx-scratch/log/rv4_ui_fix_20261125/final';
const SCRATCH = (() => { try { fs.mkdirSync('D:/xx-scratch', { recursive: true }); return 'D:/xx-scratch'; } catch (_) { return os.tmpdir(); } })();
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (v, label, got) => { if (v) { pass++; console.log('PASS ' + label); } else { fail++; console.log('FAIL ' + label + ' :: ' + JSON.stringify(got)); } };
if (!EDGE) { console.error('找不到 Edge'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const ud = path.join(SCRATCH, 'uifix_' + process.pid + '_' + Date.now());
fs.mkdirSync(ud, { recursive: true });
const portFile = path.join(ud, 'DevToolsActivePort');
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + ud,
  '--remote-debugging-port=0', '--window-size=900,700', 'about:blank'], { stdio: 'ignore' });
const exited = new Promise(r => { edge.once('exit', r); edge.once('close', r); });
let ws = null;
class Page {
  constructor(socket) { this.s = socket; this.id = 0; this.pending = new Map(); this.loaded = false;
    socket.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); } if (m.method === 'Page.loadEventFired') this.loaded = true; }; }
  send(method, params = {}) { return new Promise(resolve => { const id = ++this.id; this.pending.set(id, resolve); this.s.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + JSON.stringify(r.result.exceptionDetails.exception));
    return r.result.result.value; }
  async viewport(w, h) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(150); }
  async shot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); }
}
(async () => {
  try {
    let port = 0;
    for (let i = 0; i < 120 && !port; i++) { await sleep(100); try { port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || 0; } catch (_) {} }
    if (!port) throw new Error('devtools 端口没起来');
    let target;
    for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find(x => x.type === 'page'); } catch (_) { await sleep(100); } }
    if (!target) throw new Error('没有 page target');
    ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const p = new Page(ws); await p.send('Page.enable'); await p.send('Runtime.enable');
    await p.send('Page.navigate', { url: 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') });
    for (let i = 0; i < 200 && !p.loaded; i++) await sleep(100);
    if (!p.loaded) throw new Error('页面 load 超时');
    await p.eval(`(async()=>{ for(let i=0;i<100&&(!window.XX||!XX._s);i++) await new Promise(r=>setTimeout(r,50)); })()`);
    await p.eval(`(()=>{ try{Story.show=()=>{};Story.tick=()=>{};}catch(e){} })()`);
    await p.eval(`(()=>{ XX.reset(true); document.getElementById('char-name').value='验道子'; document.querySelector('.char-pick[data-path="sword"]').click(); document.getElementById('char-confirm').click(); document.getElementById('story-modal').classList.add('hidden'); document.dispatchEvent(new Event('jx:story-close')); Guide.init(); })()`);
    let step = -1;
    for (let i = 0; i < 100; i++) { await sleep(100); step = await p.eval(`Guide._state().step`); if (step < 2) await p.eval(`(()=>{const b=document.getElementById('taixu-bubble');if(b&&getComputedStyle(b).display!=='none')b.click();})()`); if (step === 2) break; }
    if (step !== 2) console.log('GUIDE_DIAG ' + JSON.stringify(await p.eval(`({guide:Guide._state(),tutorial:window.Tutorial?window.Tutorial._state():null,modals:Array.from(document.querySelectorAll('.modal')).filter(e=>!e.classList.contains('hidden')).map(e=>e.id),visit:!document.getElementById('npc-visit').classList.contains('hidden'),enc:!document.getElementById('enc-bubble').classList.contains('hidden'),bubble:!!document.getElementById('taixu-bubble')})`)));
    ok(step === 2, '受控新档进入打坐引导第 2 步', { step });
    ok(await p.eval(`S.stats.sit === 0 && S.rank === 0 && S.path === 'sword'`), '新档初始状态干净且道途已选', await p.eval(`({sit:S.stats.sit,rank:S.rank,path:S.path})`));

    const views = [[360,640],[393,720],[430,900],[720,1100],[1100,720],[1280,800],[504,485]];
    const rows = [];
    for (const [w,h] of views) {
      await p.viewport(w,h);
      const g = await p.eval(`(()=>{
        const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
        const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
        const acts=document.getElementById('sc-acts'), banner=document.querySelector('.npc-banner'), sit=document.querySelector('#sc-acts [data-k="sit"]'), train=document.querySelector('#sc-acts [data-k="train"]'), hunt=document.querySelector('.cave-hunt-open');
        const ar=rect(acts),br=rect(banner),sr=rect(sit),tr=rect(train),hr=rect(hunt);
        const hit=e=>{const r=e.getBoundingClientRect(),t=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return t&&t.closest?t.closest('button').getAttribute('data-k')||t.closest('button').className:null;};
        return {acts:ar,banner:br,sit:sr,train:tr,hunt:hr,overlapActs:overlap(ar,br),overlapSit:overlap(sr,br),overlapTrain:overlap(tr,br),overlapHunt:overlap(hr,br),gap:ar.y-br.bottom,hitSit:hit(sit),hitTrain:hit(train),hitHunt:hit(hunt),sameRow:sr.y===tr.y&&sr.y===hr.y};
      })()`);
      rows.push({ viewport:w+'x'+h, ...g });
      ok(g.overlapActs === 0 && g.overlapSit === 0 && g.overlapTrain === 0 && g.overlapHunt === 0 && g.gap >= 0,
        '洞府横幅与三按钮零重叠 ' + w+'x'+h, g);
      ok(g.hitSit === 'sit' && g.hitTrain === 'train' && g.hitHunt === 'cave-hunt-open' && g.sameRow,
        '三键同排且打坐/历练中心命中自身 ' + w+'x'+h, g);
      if (w === 504 || w === 360) await p.shot(path.join(OUT, 'shots', 'cave_'+w+'x'+h+'.png'));
    }
    console.log('GEOMETRY ' + JSON.stringify(rows));
    await p.viewport(430,900);
    const before = await p.eval(`S.stats.sit`);
    await p.eval(`(()=>{const b=document.querySelector('#sc-acts [data-k="sit"]'),r=b.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const top=document.elementFromPoint(x,y);top.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:x,clientY:y,view:window}));})()`);
    await sleep(200);
    const after = await p.eval(`({sit:S.stats.sit,step:Guide._state().step,done:!!Guide._state().flags.c_sit})`);
    ok(before === 0 && after.sit === before + 1 && after.done && after.step === 3, '真实中心点击打坐计数 +1 且引导完成', { before, after });
    await p.eval(`ROUTER.back(); document.querySelector('.scene-tab[data-tab="cave"]').click()`);
    await sleep(100);
    await p.eval(`document.querySelector('.npc-banner').click()`);
    await sleep(100);
    ok(await p.eval(`ROUTER.current()==='role_npc'`), '沈碑横幅入口仍可达', await p.eval(`ROUTER.current()`));
    await p.eval(`ROUTER.back(); document.querySelector('.scene-tab[data-tab="role"]').click()`);
    await sleep(100);
    const artBefore = await p.eval(`({route:ROUTER.current(),html:document.getElementById('panel-host').innerHTML.slice(0,200),toast:document.getElementById('toast').textContent})`);
    await p.eval(`document.querySelector('#xx-role-arts .art-slot').click()`);
    await sleep(50);
    const artAfter = await p.eval(`({route:ROUTER.current(),html:document.getElementById('panel-host').innerHTML.slice(0,200),toast:document.getElementById('toast').textContent,shown:document.getElementById('toast').classList.contains('show')})`);
    ok(artBefore.route === artAfter.route && artBefore.html === artAfter.html && artAfter.shown && /炼器坊/.test(artAfter.toast), '人物法宝卡只提示不离页', { artBefore, artAfter });

    await p.eval(`ROUTER.back(); document.querySelector('.scene-tab[data-tab="town"]').click(); S.market.freeRefresh=2; S.arena.left=3; S.sign.days=1; S.sign.last=''; S.stats.sit=3; XX._render()`);
    await sleep(1200);
    await p.eval(`XX._render()`);
    const dots = await p.eval(`(()=>{const sels=['[data-bld="event"]','[data-bld="arena"]','[data-bld="market"]:not([data-scroll])','[data-bld="xiu"][data-scroll="xx-quest"]'];return sels.map(sel=>{const e=document.querySelector(sel),d=e&&e.querySelector('.e-dot');if(!d)return {sel,found:false};d.style.animation='none';d.style.transform='none';const r=d.getBoundingClientRect(),a=e.querySelector('.art-shape').getBoundingClientRect();return {sel,found:true,on:d.classList.contains('on'),parent:d.parentElement.className,dx:r.x+r.width/2-(a.x+a.width/2),dy:r.y+r.height/2-(a.y+a.height/2),cornerDist:Math.hypot(r.right-a.right,r.y-a.y),dot:r,art:a};});})()`);
    for (const d of dots) ok(d.found && d.on && d.parent === 'art-shape' && d.cornerDist <= 4, '城镇红点锚定建筑立绘角 ' + d.sel, d);
    await p.shot(path.join(OUT, 'shots', 'town_430x900.png'));

    const fmt = await p.eval(`({zero:SECT._fmtAgo(0),missing:SECT._fmtAgo(undefined),nan:SECT._fmtAgo(NaN),now:SECT._fmtAgo(Date.now())})`);
    ok(fmt.zero === '—' && fmt.missing === '—' && fmt.nan === '—' && fmt.now === '刚刚', 'fmtAgo 无时间戳不显示大数日前', fmt);
    const pathWords = await p.eval(`({opts:XX._pathOpts.map(x=>({hint:x.hint,tag:x.tag})),rows:Object.values(XX._pathBonus).map(x=>x.length)})`);
    ok(pathWords.opts.length === 4 && pathWords.opts.every(x => !/资源产出|功法领悟|修行速度/.test(x.hint)) && pathWords.rows.length === 4 && pathWords.rows.every(x => x === 9), '四道途 hint 不承诺资源或修行收益', pathWords);
    const full = await p.eval(`(()=>{const s=S,n=XX._need(s.rank);s.exp=n*1.2;XX._render();const t=document.getElementById('sc-exp-num');return {text:t&&t.textContent,exp:s.exp,need:n};})()`);
    ok(full.text.includes('120') && full.text.includes(String(full.need)), '顶栏超 100% 同屏显示当前/需求', full);
  } catch (e) {
    fail++; console.log('FAIL 探针异常 :: ' + (e.stack || e));
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    try { if (process.platform === 'win32' && edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore', timeout: 8000 }); else edge.kill(); } catch (_) {}
    await Promise.race([exited, sleep(3000)]);
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch (_) {}
    console.log('RESULT pass=' + pass + ' fail=' + fail);
    process.exitCode = fail ? 1 : 0;
  }
})();
