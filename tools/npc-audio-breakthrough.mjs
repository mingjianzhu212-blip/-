// tools/npc-audio-breakthrough.mjs — NEW-02 收口：真实「突破成功」业务事件是否触发升级音效
//
// 上一轮审查（末轮）判 NEW-02 open，理由：只证明了「业务入口能出声」，没证明「业务事件真的调用了它」。
// 本脚本不调入口、不改产品代码，走玩家路径：
//   建角色 → 点【打坐】攒修为到门槛 → 点顶部【⚡ 突破】按钮 → 读日志确认「突破成功」
//   → 同一时刻读 chop.ogg 的 currentTime 是否前进。
// 仍使用隔离 profile + Audio 构造器旁路探针（测试仪表，已在报告披露）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const EVID = path.join('D:/xx-scratch/npc-play-evidence', TS + '-breakthrough');
fs.mkdirSync(EVID, { recursive: true });
const SHOTS = path.join(EVID, 'shots'); fs.mkdirSync(SHOTS, { recursive: true });

const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
const PORT = 9419, PROFILE = path.join(EVID, 'profile');
const PAGE_URL = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html';

let pass = 0, fail = 0; const rows = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; rows.push({ name, status: 'PASS', detail: detail || '' }); console.log('  PASS  ' + name); }
  else { fail++; rows.push({ name, status: 'FAIL', detail: detail || '' }); console.error('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT, '--window-size=1280,900',
  '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

let ws = null, seq = 0; const pending = new Map();
const send = (m, p) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p || {} }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('CDP timeout ' + m)); } }, 30000);
});
async function ev(e, aw = true) {
  const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: aw });
  if (r.result && r.result.exceptionDetails) throw new Error('JS: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 240));
  return r.result && r.result.result ? r.result.result.value : undefined;
}
async function shot(n) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.result.data, 'base64'));
}
const HIT = 'sel => { const el=document.querySelector(sel); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}; }';
async function click(sel) {
  await ev('(()=>{const el=document.querySelector(' + JSON.stringify(sel) + ');if(el&&el.scrollIntoView)el.scrollIntoView({block:"center"});return 1})()');
  await sleep(110);
  const b = await ev('(' + HIT + ')(' + JSON.stringify(sel) + ')');
  if (!b || b.w <= 0) throw new Error('不可见 ' + sel);
  const hit = await ev('(()=>{const e=document.elementFromPoint(' + b.x + ',' + b.y + ');if(!e)return "";const t=document.querySelector(' + JSON.stringify(sel) + ');'
    + 'if(e===t||t.contains(e)||e.contains(t))return "ok";const m=e.closest(".modal");return m?("MODAL#"+m.id):e.tagName+"."+e.className;})()');
  if (hit !== 'ok') throw new Error('命中 ' + sel + ' → ' + hit);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await sleep(260);
}
const waitBoot = async () => {
  for (let i = 0; i < 120; i++) { const r = await ev('!!(window.ROUTER&&document.getElementById("page-scene"))').catch(() => false); if (r) return true; await sleep(250); }
  return false;
};
/* 关掉挡路弹窗：只点弹窗自己的按钮（取弹窗内最后一个可见按钮＝确认/继续），不绕过命中测试 */
async function dismissAll() {
  /* 新手引导遮罩不是 .modal，但它同样挡点击：先点它自己的「跳过」 */
  for (let t = 0; t < 3; t++) {
    const tut = await ev('(() => { const b=document.querySelector("#tut-mask .tut-x"); if(!b) return false;'
      + ' const r=b.getBoundingClientRect(); return r.width>0&&r.height>0; })()');
    if (!tut) break;
    try { await click('#tut-mask .tut-x'); } catch (e) { await sleep(300); }
  }
  for (let i = 0; i < 10; i++) {
    const info = await ev(`(() => { const m=document.querySelector('.modal:not(.hidden)'); if(!m) return null;
      const bs=Array.from(m.querySelectorAll('button')).filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>0;});
      return { id: m.id, bid: bs.length ? (bs[bs.length-1].id || null) : null }; })()`);
    if (!info) return;
    if (!info.bid) { await sleep(300); continue; }
    try { await click('#' + info.bid); } catch (e) { await sleep(350); }
    await sleep(150);
  }
}
/* 点一个目标：先清弹窗，点不到就重试几次 */
async function clickThrough(sel) {
  for (let a = 0; a < 5; a++) {
    await dismissAll();
    try { await click(sel); return true; } catch (e) { await sleep(350); }
  }
  throw new Error('多次重试仍点不到 ' + sel);
}

(async () => {
  try {
    let target = null;
    for (let i = 0; i < 120 && !target; i++) {
      await sleep(200);
      try { const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json(); target = l.find(t => t.type === 'page'); } catch (e) { }
    }
    if (!target) throw new Error('CDP 未就绪');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    const errors = [];
    ws.onmessage = m => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); return; }
      if (d.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (d.params.exceptionDetails.text || ''));
      if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push('log: ' + d.params.entry.text);
    };
    await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(function(){ var O=window.Audio; window.__audios=[]; function W(src){ var a=new O(src); try{a.__src=String(src);}catch(e){} window.__audios.push(a); return a; }
        W.prototype=O.prototype; window.Audio=W; })();`
    });

    await send('Page.navigate', { url: PAGE_URL });
    if (!await waitBoot()) throw new Error('首启失败');
    await sleep(900);
    await dismissAll();

    /* 建角色：创立角色弹窗的确认按钮就是「踏入仙途」，直接真点它（默认男修） */
    const hasConfirm = await ev('(() => { const b=document.querySelector("#char-confirm"); if(!b) return false;'
      + ' const r=b.getBoundingClientRect(); return r.width>0&&r.height>0; })()');
    if (hasConfirm) { await clickThrough('#char-confirm'); await sleep(900); }
    await dismissAll();
    await sleep(400);
    await dismissAll();

    console.log('===== 准备：把修为攒到突破门槛（真实点打坐）=====');
    const breakTxt0 = await ev('(() => { const b=document.getElementById("sc-break"); return b ? { txt:(b.innerText||"").trim(), dis:!!b.disabled } : null; })()');
    console.log('  · 初始突破按钮：' + JSON.stringify(breakTxt0));
    let ready = false, sits = 0;
    for (let i = 0; i < 30; i++) {
      await dismissAll();
      const st = await ev('(() => { const b=document.getElementById("sc-break"); return b ? { txt:(b.innerText||"").trim(), dis:!!b.disabled } : null; })()');
      if (st && /突破/.test(st.txt) && !st.dis) { ready = true; break; }
      const hasSit = await ev('(() => { const el=Array.from(document.querySelectorAll(".cave-act")).find(x=>(x.innerText||"").indexOf("打坐")>=0);'
        + ' if(!el) return false; const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; })()');
      if (!hasSit) break;
      await ev('(() => { const el=Array.from(document.querySelectorAll(".cave-act")).find(x=>(x.innerText||"").indexOf("打坐")>=0);'
        + ' if(el) el.setAttribute("data-t-sit","1"); return 1; })()');
      try { await clickThrough('.cave-act[data-t-sit="1"]'); sits++; } catch (e) { await sleep(400); }
      await sleep(220);
    }
    const breakTxt1 = await ev('(() => { const b=document.getElementById("sc-break"); return b ? { txt:(b.innerText||"").trim(), dis:!!b.disabled } : null; })()');
    ok('B1 通过真实打坐把修为攒到突破门槛（顶部按钮变为可点「突破」）', ready,
      '打坐 ' + sits + ' 次；按钮=' + JSON.stringify(breakTxt1));
    await shot('before-break');

    console.log('\n===== 真实点击【突破】按钮，观察升级音效 =====');
    const lvBefore = await ev(`(() => { const a=window.__audios.find(x=>/chop\\.ogg$/.test(x.__src||''));
      return a ? { paused:a.paused, t:a.currentTime, rs:a.readyState, err:a.error?a.error.code:null } : null; })()`);
    const logBefore = await ev('(() => { const e=document.getElementById("xx-log"); return e ? e.textContent : ""; })()');
    let broke = false, attempts = 0, logAfter = '', lvAfter = null, lastTitle = null;
    for (let k = 0; k < 4 && !broke; k++) {
      await dismissAll();
      const st = await ev('(() => { const b=document.getElementById("sc-break"); return b ? { txt:(b.innerText||"").trim(), dis:!!b.disabled } : null; })()');
      if (!st || !/突破/.test(st.txt) || st.dis) {
        // 失败会掉修为：先确认弹窗都关了，再继续打坐补回来
        for (let i = 0; i < 6; i++) {
          await dismissAll();
          const has = await ev('(() => { const el=Array.from(document.querySelectorAll(".cave-act")).find(x=>(x.innerText||"").indexOf("打坐")>=0);'
            + ' if(!el) return false; const r=el.getBoundingClientRect(); return r.width>0&&r.height>0; })()');
          if (!has) break;
          await ev('(() => { const el=Array.from(document.querySelectorAll(".cave-act")).find(x=>(x.innerText||"").indexOf("打坐")>=0);'
            + ' if(el) el.setAttribute("data-t-sit","1"); return 1; })()');
          try { await clickThrough('.cave-act[data-t-sit="1"]'); sits++; } catch (e) { await sleep(400); continue; }
          await sleep(220);
        }
        continue;
      }
      attempts++;
      await clickThrough('#sc-break');
      /* 结果弹窗要等渡劫/演出结束才出现（game.js 里 showBreak 是 TRIB 的 onDone 回调），
         所以轮询等它自报成败，而不是睡固定时长后猜。 */
      let btitle = null;
      for (let w = 0; w < 24; w++) {
        await sleep(400);
        btitle = await ev('(() => { const t=document.getElementById("b-title"); const m=document.getElementById("break-modal");'
          + ' return (t && m && !m.classList.contains("hidden")) ? (t.innerText||"").trim() : null; })()');
        if (btitle && /突破/.test(btitle)) break;
      }
      logAfter = await ev('(() => { const e=document.getElementById("xx-log"); return e ? e.textContent : ""; })()');
      lastTitle = btitle;
      broke = /突破成功/.test(String(btitle||'')) || /突破成功/.test(logAfter || '');
      await dismissAll();
    }
    lvAfter = await ev(`(() => { const a=window.__audios.find(x=>/chop\\.ogg$/.test(x.__src||''));
      return a ? { paused:a.paused, t:a.currentTime, rs:a.readyState, err:a.error?a.error.code:null } : null; })()`);
    await shot('after-break');

    ok('B2 真实完成一次「突破成功」业务事件（日志出现突破成功）', broke,
      '尝试 ' + attempts + ' 次；日志尾部=' + String(logAfter || '').slice(-120).replace(/\s+/g, ' '));
    ok('B3 该事件发生时升级音效真的播放（chop.ogg currentTime 前进 / 处于播放态）',
      !!lvAfter && (lvAfter.t > (lvBefore ? lvBefore.t : 0) || lvAfter.paused === false),
      'before=' + JSON.stringify(lvBefore) + ' after=' + JSON.stringify(lvAfter));
    ok('B4 全程无 JS 异常 / 控制台 error', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ') : '0 条');

    const out = { at: new Date().toISOString(), page: PAGE_URL, sits, breakTxt0, breakTxt1, attempts,
      broke, lastTitle, lvBefore, lvAfter, logTail: String(logAfter || '').slice(-400), consoleErrors: errors, pass, fail, rows };
    fs.writeFileSync(path.join(EVID, 'breakthrough-evidence.json'), JSON.stringify(out, null, 2));
    console.log('\n通过 ' + pass + ' / 失败 ' + fail);
    console.log('证据：' + EVID);
    process.exitCode = fail ? 1 : 0;
  } catch (e) {
    console.error('异常：' + (e && e.message || e));
    try { fs.writeFileSync(path.join(EVID, 'error.txt'), String(e && e.stack || e)); } catch (_) { }
    process.exitCode = 2;
  } finally {
    try { ws && ws.close(); } catch (e) { }
    try { edge.kill(); } catch (e) { }
  }
})();
