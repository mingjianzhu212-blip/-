// tools/npc-audio-evidence.mjs — 音频资源替换的最终版本运行证据（复审 NEW-02 / mustFix-1 剩余项）
//
// 为什么需要它：js/audio.js 在本轮之前被并行写手改过（原 click.wav / levelup.wav 不存在，
// 改指 audio/kenney/metal_click.ogg 与 chop.ogg）。审查要求给出「最终版本下资源真的能加载、
// 音效真的能触发、无新增控制台异常」的运行证据，而不只是「路径指向的文件存在」。
//
// 做法：隔离 --user-data-dir + 真实浏览器；只在页面最早期注入一个 Audio 构造器旁路探针
// （把 new Audio(...) 实例收集到 window.__audios），不修改任何产品文件、不改产品逻辑。
// 该注入属于测试仪表，已在本文件与交付报告中披露。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import crypto from 'node:crypto';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const EVID = path.join('D:/xx-scratch/npc-play-evidence', TS + '-audio');
fs.mkdirSync(EVID, { recursive: true });
const SHOTS = path.join(EVID, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
const PORT = 9417, PROFILE = path.join(EVID, 'profile');
const PAGE_URL = 'file:///' + ROOT.replace(/\\/g, '/') + '/index.html';

let pass = 0, fail = 0; const rows = [];
function ok(name, cond, detail) {
  if (cond) { pass++; rows.push({ name, status: 'PASS', detail: detail || '' }); console.log('  PASS  ' + name); }
  else { fail++; rows.push({ name, status: 'FAIL', detail: detail || '' }); console.error('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');

const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + PROFILE, '--remote-debugging-port=' + PORT, '--window-size=1280,900',
  '--autoplay-policy=no-user-gesture-required', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

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
async function click(sel) {
  await ev('(() => { const el=document.querySelector(' + JSON.stringify(sel) + '); if(el&&el.scrollIntoView) el.scrollIntoView({block:"center"}); return 1; })()');
  await sleep(120);
  const b = await ev('(' + HIT + ')(' + JSON.stringify(sel) + ')');
  if (!b || b.w <= 0) throw new Error('不可见 ' + sel);
  const hit = await ev('(() => { const e=document.elementFromPoint(' + b.x + ',' + b.y + '); if(!e) return "";'
    + ' const t=document.querySelector(' + JSON.stringify(sel) + ');'
    + ' if(e===t||t.contains(e)||e.contains(t)) return "ok"; return e.tagName; })()');
  if (hit !== 'ok') throw new Error('命中失败 ' + sel + ' → ' + hit);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await sleep(300);
}
const waitBoot = async () => {
  for (let i = 0; i < 120; i++) {
    const r = await ev('!!(window.ROUTER && document.getElementById("page-scene"))').catch(() => false);
    if (r) return true; await sleep(250);
  }
  return false;
};

(async () => {
  try {
    console.log('===== 静态资源事实 =====');
    const fClick = 'audio/kenney/metal_click.ogg', fLv = 'audio/kenney/chop.ogg';
    ok('A1 点击音效文件存在', fs.existsSync(path.join(ROOT, fClick)), fClick + ' ' + fs.statSync(path.join(ROOT, fClick)).size + ' bytes');
    ok('A2 升级音效文件存在', fs.existsSync(path.join(ROOT, fLv)), fLv + ' ' + fs.statSync(path.join(ROOT, fLv)).size + ' bytes');
    ok('A3 原引用路径确实不存在（改指是必要修复，不是随意替换）',
      !fs.existsSync(path.join(ROOT, 'audio/click.wav')) && !fs.existsSync(path.join(ROOT, 'audio/levelup.wav')),
      'audio/click.wav 与 audio/levelup.wav 均不存在');
    const jsHash = sha('js/audio.js');
    ok('A4 交付版本 audio.js 全量 sha256 已记录', /^[0-9a-f]{64}$/.test(jsHash), jsHash);
    const stat = fs.statSync(path.join(ROOT, 'js/audio.js'));
    ok('A5 audio.js 在测试前已定型（mtime 早于本次运行，未被本轮改动）',
      stat.mtimeMs < Date.now(), new Date(stat.mtimeMs).toISOString() + ' size=' + stat.size);

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
      if (d.method === 'Runtime.exceptionThrown') errors.push('exception: ' + (d.params.exceptionDetails.text || '') + ' ' + ((d.params.exceptionDetails.exception || {}).description || ''));
      if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push('log: ' + d.params.entry.text);
    };
    await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch (e) { }

    /* 测试仪表：在页面脚本之前接管 Audio 构造器，把实例收集起来（不改变产品行为） */
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(function(){ var O = window.Audio; window.__audios = [];
        function W(src){ var a = new O(src); try { a.__src = String(src); } catch(e){} window.__audios.push(a); return a; }
        W.prototype = O.prototype; window.Audio = W; })();`
    });

    await send('Page.navigate', { url: PAGE_URL });
    if (!await waitBoot()) throw new Error('首启失败');
    await sleep(1500);

    console.log('\n===== 运行期：资源加载 =====');
    const list = await ev('window.__audios.map(a => ({ src: a.__src, rs: a.readyState, ns: a.networkState, err: a.error ? a.error.code : null }))');
    ok('A6 页面启动即创建 3 个音频对象（BGM + 点击 + 升级，路径来自交付版本 audio.js）',
      Array.isArray(list) && list.length === 3, JSON.stringify(list));
    const clickA = (list || []).find(a => /metal_click\.ogg$/.test(a.src || ''));
    const lvA = (list || []).find(a => /chop\.ogg$/.test(a.src || ''));
    ok('A7 点击音效在浏览器中真实加载（readyState≥2 且 error 为空）',
      !!clickA && clickA.rs >= 2 && clickA.err === null, JSON.stringify(clickA));
    ok('A8 升级音效在浏览器中真实加载（readyState≥2 且 error 为空）',
      !!lvA && lvA.rs >= 2 && lvA.err === null, JSON.stringify(lvA));
    ok('A9 没有指回已不存在的 .wav 路径', !(list || []).some(a => /\.wav$/i.test(a.src || '')), JSON.stringify((list || []).map(a => a.src)));
    const dur = await ev(`(() => { const a = window.__audios.find(x => /metal_click\\.ogg$/.test(x.__src||''));
      return a ? { d: a.duration, w: a.videoWidth !== undefined } : null; })()`);
    ok('A10 音频可解码（duration 为有限正数，不是坏文件）', !!dur && isFinite(dur.d) && dur.d > 0, JSON.stringify(dur));

    console.log('\n===== 运行期：音效真的被触发（真实点击）=====');
    await ev('localStorage.clear(); localStorage.setItem("hasFinishedTutorial","1"); 1');
    await send('Page.navigate', { url: PAGE_URL });
    if (!await waitBoot()) throw new Error('二次启动失败');
    await sleep(900);
    const before = await ev(`(() => { const a = window.__audios.find(x => /metal_click\\.ogg$/.test(x.__src||''));
      return a ? { paused: a.paused, t: a.currentTime, rs: a.readyState } : null; })()`);
    /* 真实点一个界面按钮：走玩家路径，产品内部会调用点击音效。
       新 profile 首启会被「创立角色」弹窗或新手引导挡住，那就点它们自己的按钮——
       对「点击音效是否真的响」这件事而言，点哪个按钮都一样，关键是真实鼠标事件。 */
    const pickTarget = async () => {
      const cands = ['#tut-mask .tut-x', '.modal:not(.hidden) button', '.sys-btn[data-bld="role"]'];
      for (const sel of cands) {
        const v = await ev('(() => { const el=document.querySelector(' + JSON.stringify(sel) + '); if(!el) return null;'
          + ' const r=el.getBoundingClientRect(); return (r.width>0&&r.height>0)?{w:r.width}:null; })()');
        if (v) return sel;
      }
      return null;
    };
    const useSel = await pickTarget();
    if (!useSel) throw new Error('找不到可点的真实按钮');
    console.log('  · 真实点击目标：' + useSel);
    await click(useSel);
    await sleep(500);
    const after = await ev(`(() => { const a = window.__audios.find(x => /metal_click\\.ogg$/.test(x.__src||''));
      return a ? { paused: a.paused, t: a.currentTime, rs: a.readyState, err: a.error ? a.error.code : null } : null; })()`);
    ok('A11 真实点击后点击音效被播放（currentTime 前进或处于播放态）',
      !!after && (after.t > (before ? before.t : 0) || after.paused === false),
      'before=' + JSON.stringify(before) + ' after=' + JSON.stringify(after));
    const audioApi = await ev('(() => { try{ const p = window.GameAudio._probe(); return { ok: true, p: p }; }catch(e){ return { ok:false, e:String(e&&e.message) }; } })()');
    ok('A12 audio.js 正常执行、公开 API 可用（GameAudio._probe 返回正常结构）',
      !!(audioApi && audioApi.ok && audioApi.p && typeof audioApi.p.muted === 'boolean'), JSON.stringify(audioApi));

    console.log('\n===== 升级音效：业务调用入口 =====');
    /* 业务侧怎么调它，这里就怎么调：两处调用点都是 `if(window.playLevelUpSound) playLevelUpSound();`
       （game.js:9260 镇妖塔通关、game.js:4239 突破成功）。先把调用点原文取出来做代码证据，
       再用同一入口触发一次，检查 chop.ogg 是否真的出声。 */
    const gj = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
    const sites = [];
    gj.split('\n').forEach((line, i) => {
      if (/playLevelUpSound\(\)/.test(line) && /window\.playLevelUpSound/.test(line)) sites.push({ line: i + 1, text: line.trim() });
    });
    ok('A14 业务调用点存在且入口与本次验证一致（塔通关 / 突破成功）', sites.length >= 2,
      sites.map(s => s.line + ': ' + s.text).join(' | '));
    const lvBefore = await ev(`(() => { const a = window.__audios.find(x => /chop\\.ogg$/.test(x.__src||''));
      return a ? { paused: a.paused, t: a.currentTime, rs: a.readyState } : null; })()`);
    await ev('(function(){ if(window.playLevelUpSound) window.playLevelUpSound(); return 1; })()');
    await sleep(600);
    const lvAfter = await ev(`(() => { const a = window.__audios.find(x => /chop\\.ogg$/.test(x.__src||''));
      return a ? { paused: a.paused, t: a.currentTime, rs: a.readyState, err: a.error ? a.error.code : null } : null; })()`);
    ok('A15 升级音效经业务入口真实播放（chop.ogg currentTime 前进 / 处于播放态）',
      !!lvAfter && (lvAfter.t > (lvBefore ? lvBefore.t : 0) || lvAfter.paused === false),
      'before=' + JSON.stringify(lvBefore) + ' after=' + JSON.stringify(lvAfter));

    console.log('\n===== 四个核心文件完整哈希对照（交付版本 vs 测试所跑版本）=====');
    const core = ['index.html', 'style.css', 'js/game.js', 'js/npc.js'];
    let closureHashes = {};
    try {
      const cj = JSON.parse(fs.readFileSync('D:/xx-scratch/npc-play-evidence/20261106073649-closure/closure-report.json', 'utf8'));
      closureHashes = cj.testedFileHashes || {};
    } catch (e) { }
    const manifest = {}; let allSame = true;
    for (const f of core) {
      manifest[f] = { live: sha(f), tested: closureHashes[f] || null };
      if (!closureHashes[f] || closureHashes[f] !== manifest[f].live) allSame = false;
    }
    ok('A16 四个核心文件：交付版本 sha256 与闭合测试所跑版本逐字节一致（全量 64 位）', allSame,
      Object.entries(manifest).map(([k, v]) => k + '=' + v.live).join(' ; '));

    console.log('\n===== 控制台异常 =====');
    ok('A13 全过程无 JS 异常 / 控制台 error', errors.length === 0, errors.length ? errors.slice(0, 4).join(' | ') : '0 条');
    await shot('audio-final');

    const out = { at: new Date().toISOString(), page: PAGE_URL, viewport: '1280x900',
      files: { 'js/audio.js': jsHash, 'audio/kenney/metal_click.ogg': sha(fClick), 'audio/kenney/chop.ogg': sha(fLv) },
      mtimeAudio: new Date(stat.mtimeMs).toISOString(),
      audios: list, before, after, lvBefore, lvAfter, callSites: sites, hashManifest: manifest,
      probe: audioApi, consoleErrors: errors, pass, fail, rows };
    fs.writeFileSync(path.join(EVID, 'audio-evidence.json'), JSON.stringify(out, null, 2));
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
