// tools/w3-accept.mjs — W3「世界线指引」真实浏览器链路验收// 玩家路径：新档塔页 → 点「去观前」→ 识人页指引 → 点线索 → 真实听「山外」
//          → 目标当场换话 → 点回塔底 → 俯身 → 三选一 → 塔页/识人页回响。
// 新加的两枚按钮一律用真实 DOM click，不用直接改状态代替点击。
// 只有「前置进度」用 XX._s 构造，因为跑完整套入塔五步/初见对话与本次改动无关。
// 产物：tools/ui-accept-shots/w3-*.png + w3-chain-report.json
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SHOTS = path.join(HERE, 'ui-accept-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const SCRATCH = 'D:/xx-scratch';
fs.mkdirSync(SCRATCH, { recursive: true });

const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 临时探针页：读真实 index.html，只补 <base> 让相对路径仍指向项目（沿用 tools/page.js 的口径）
const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const BASE_HREF = 'file:///' + String(ROOT).replace(/\\/g, '/').replace(/\/+$/, '') + '/';
const PROBE = path.join(SCRATCH, '._w3_accept.html');
fs.writeFileSync(PROBE, SRC.replace('<head>', '<head><base href="' + BASE_HREF + '">'), 'utf8');
const PAGE_URL = 'file:///' + PROBE.replace(/\\/g, '/');

const ud = path.join(SCRATCH, 'w3accept_' + process.pid + '_' + Date.now());
fs.mkdirSync(ud, { recursive: true });
const portFile = path.join(ud, 'DevToolsActivePort');
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  '--user-data-dir=' + ud, '--remote-debugging-port=0', '--window-size=480,960', 'about:blank'],
  { stdio: 'ignore' });
const exited = new Promise(res => { edge.once('exit', res); edge.once('close', res); });

let dport = 0;
for (let i = 0; i < 150 && !dport; i++) {
  await sleep(100);
  try { dport = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || 0; } catch (e) {}
}
if (!dport) { console.error('devtools 端口没起来'); process.exit(1); }
const browserWs = (await (await fetch('http://127.0.0.1:' + dport + '/json/version')).json()).webSocketDebuggerUrl;
let target = null;
for (let i = 0; i < 80 && !target; i++) {
  try { target = (await (await fetch('http://127.0.0.1:' + dport + '/json/list')).json()).find(t => t.type === 'page'); }
  catch (e) { await sleep(100); }
}
if (!target) { console.error('没有 page target'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map(); let onmsg = null;
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (onmsg) onmsg(m);
};
const send = (method, params) => new Promise(res => {
  const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} }));
});
await send('Page.enable'); await send('Runtime.enable'); await send('Emulation.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 480, height: 960, deviceScaleFactor: 1, mobile: false });
async function waitLoad(ms = 20000) {
  let loaded = false; const to = Date.now() + ms;
  onmsg = m => { if (m.method === 'Page.loadEventFired') loaded = true; };
  while (!loaded && Date.now() < to) await sleep(100);
  onmsg = null; return loaded;
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result && r.result.result && r.result.result.value;
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const f = path.join(SHOTS, name);
  fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
  return f;
}

const report = { steps: [], asserts: [], shots: [] };
let pass = 0, fail = 0;
const A = (cond, label, got) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + '  →  ' + JSON.stringify(got)); }
  report.asserts.push({ label, ok: !!cond, got: got === undefined ? null : got });
};
// 每个 step 在页面内跑一段 async 代码，返回 JSON 字符串；异常也带回来，不吞
async function step(name, body, shotName) {
  const expr = `(async function(){ const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    try { ${body} } catch(e){ return JSON.stringify({ EXC:String(e&&e.message||e), stack:String(e&&e.stack||'').slice(0,400) }); } })()`;
  let v = await evalJs(expr);
  let o;
  try { o = JSON.parse(v); } catch (e) { o = { EXC: 'eval 无有效返回', raw: String(v).slice(0, 200) }; }
  report.steps.push({ name, result: o });
  console.log('[w3] ' + name + ' ' + JSON.stringify(o));
  if (shotName) {
    // 截图前把新弹的剧情/引导浮片收起，画面才干净
    await evalJs(`(function(){ try{ if(window.Story){ Story.show=function(){}; Story.tick=function(){};
      if(Story.renderCardInto) Story.renderCardInto=function(){}; } }catch(e){}
      document.querySelectorAll('.modal').forEach(function(m){m.classList.add('hidden');}); })()`);
    await sleep(180);
    report.shots.push(path.basename(await shot(shotName)));
  }
  return o;
}

try {
  console.log('\n=== W3 世界线指引 · 真实浏览器链路验收 ===');
  await send('Page.navigate', { url: PAGE_URL });
  await waitLoad();
  await sleep(1200);
  // 清档重开，保证从新档起跑
  await evalJs(`(function(){ try{ localStorage.clear(); }catch(e){} })()`);
  await send('Page.reload'); await waitLoad(); await sleep(1200);

  const s0 = await step('00 创角 / 收起引导', `
    const c=document.getElementById('char-confirm'); if(c) c.click();
    await sleep(700);
    try{ Tutorial.finish(); }catch(e){}
    try{ if(window.Story){ Story.show=function(){}; Story.tick=function(){}; if(Story.renderCardInto) Story.renderCardInto=function(){}; } }catch(e){}
    document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
    document.querySelectorAll('.tut-mask,.tut-tip').forEach(m=>m.classList.remove('show'));
    return JSON.stringify({ name: XX._s.name, foot: XX._s.worldFoot, towerMax: XX._s.towerMax|0 });
  `);
  A(s0.foot === '', '新档 worldFoot 为空', s0);

  const s1 = await step('01 新档塔页 · 切片 A 入口', `
    ROUTER.open('tower'); await sleep(550);
    const b=document.querySelector('#xx-tower [data-w3="go-stele"]');
    const rew=Array.from(document.querySelectorAll('#xx-tower .tw-rew')).map(x=>x.textContent);
    return JSON.stringify({ hasBtn:!!b, btn:b?b.textContent:'', rew:rew,
      footN:document.querySelectorAll('#xx-tower [data-foot]').length });
  `, 'w3-01-tower-fresh.png');
  A(s1.hasBtn === true && s1.footN === 0, '新档塔页出现「去观前」且仍无 data-foot 入口', s1);
  A(/观前守碑/.test(s1.rew.join('')), '塔页有指向守碑人的可见线索', s1.rew);

  const s2 = await step('02 真点「去观前」→ 识人页', `
    document.querySelector('#xx-tower [data-w3="go-stele"]').click(); await sleep(750);
    const g=document.getElementById('npc-w3-guide');
    const b=g&&g.querySelector('[data-w3g]');
    return JSON.stringify({ npcRoot:!!document.getElementById('xx-role-npc-root'),
      guide:g?g.textContent:'', act:b?b.dataset.w3g:'', btn:b?b.textContent:'',
      topicsDigits:/[0-9]/.test((document.getElementById('npc-topics')||{}).textContent||''),
      echoEmpty:(document.getElementById('npc-world-echo')||{}).textContent==='' });
  `, 'w3-02-stele-guide.png');
  A(s2.npcRoot === true, '按钮真的把玩家送进识人页', s2);
  A(s2.act === 'clue' && /山外/.test(s2.guide), '识人页说明来意并指向「山外」', s2);
  A(s2.topicsDigits === false && s2.echoEmpty === true, '既有话题区/回响壳未被污染', s2);

  const s3 = await step('03 真点「看还空着的那条」→ 线索高亮', `
    const b=document.querySelector('#npc-w3-guide [data-w3g="clue"]'); if(b) b.click();
    await sleep(500);
    const row=document.querySelector('#npc-clues .sto-item[data-clue="clue3"]');
    return JSON.stringify({ ring:row?row.classList.contains('trail-ring'):false,
      clue:row?row.querySelector('b').textContent:'', open:row?row.dataset.open:'' });
  `, 'w3-03-clue-highlight.png');
  A(s3.ring === true && s3.open === '0', '按钮滚动并高亮未解的「山外」线索行', s3);

  const s4a = await step('04a 构造前置：stage 到能谈「山外」', `
    const S=XX._s;
    S.npcs={ stele:{ met:1, rel:6, stage:2, seenGens:(S.legacy.gens|0), lastSeen:Date.now(),
      nudgeAt:0, heard:[], choice:{listened:1,showoff:0,promise:0},
      cur:{lastRank:S.rank|0,talk:1,promptTale:0} } };
    ROUTER.open('role','xx-role-npc'); await sleep(600);
    const t=document.querySelector('#npc-topics [data-topic="stele4"]');
    return JSON.stringify({ hasTopic:!!t, before:(document.getElementById('npc-w3-guide')||{}).textContent||'' });
  `);
  A(s4a.hasTopic === true, '「山外」话题可谈', s4a);

  const s4b = await step('04b 真实点话题 + 选项 → 目标当场换话', `
    document.querySelector('#npc-topics [data-topic="stele4"]').click(); await sleep(350);
    const o=document.querySelector('#npc-opts [data-opt="note"]');
    if(o) o.click(); await sleep(650);
    const g=document.getElementById('npc-w3-guide'), b=g&&g.querySelector('[data-w3g]');
    const S=XX._s;
    return JSON.stringify({ hadOpt:!!o, heard:(S.npcs.stele.heard||[]).join(','),
      guide:g?g.textContent:'', act:b?b.dataset.w3g:'', btn:b?b.textContent:'' });
  `, 'w3-04-goal-changed.png');
  A(s4b.hadOpt && /stele4/.test(s4b.heard), '真实对话结算把「山外」记进 heard', s4b);
  A(s4b.act === 'tower' && /镇妖塔/.test(s4b.guide), '指引随玩家操作换成「先去登塔」', s4b);

  const s5 = await step('05 真点「去镇妖塔」→ 回塔页', `
    const b=document.querySelector('#npc-w3-guide [data-w3g="tower"]'); const label=b?b.textContent:'';
    if(b) b.click(); await sleep(650);
    return JSON.stringify({ label, tower:!!document.querySelector('#xx-tower'),
      npcGone:!document.getElementById('xx-role-npc-root') });
  `, 'w3-05-back-tower.png');
  A(s5.tower === true && s5.npcGone === true, '按钮真的把玩家送回塔页', s5);

  const s6 = await step('06 已登塔 → 俯身入口 + 红点', `
    XX._s.towerMax=3;
    ROUTER.open('tower'); await sleep(550); XX._render();
    /* renderDots 自带 1s 节流，靠 500ms 常规 render 过窗口；等够了再读红点，
       否则读到的是改变前的上一帧（节流是既有 S2 行为，与本次改动无关） */
    await sleep(1400);
    const dig=document.querySelector('#xx-tower [data-foot="dig"]');
    const dot=document.querySelector('[data-bld="tower"] .e-dot');
    return JSON.stringify({ dig:dig?dig.textContent:'',
      footIds:Array.from(document.querySelectorAll('#xx-tower [data-foot]')).map(x=>x.dataset.foot).join(','),
      dotOn:dot?dot.classList.contains('on'):null,
      w3BtnGone:!document.querySelector('#xx-tower [data-w3="go-stele"]') });
  `, 'w3-06-dig-ready.png');
  A(s6.dig === '俯身看脚下' && s6.footIds === 'dig', '塔底出现俯身入口', s6);
  A(s6.dotOn === true, 'S2 塔入口红点亮', s6);
  A(s6.w3BtnGone === true, '前置指引自动退场，不与真入口并存', s6);

  const s7a = await step('07a 识人页目标换成「回塔底」', `
    ROUTER.open('role','xx-role-npc'); await sleep(600);
    const g=document.getElementById('npc-w3-guide'), b=g&&g.querySelector('[data-w3g]');
    return JSON.stringify({ guide:g?g.textContent:'', act:b?b.dataset.w3g:'' });
  `, 'w3-07-goal-final.png');
  A(s7a.act === 'tower' && /现在动得了/.test(s7a.guide), '听过且登过塔后，指引指向俯身', s7a);

  const s7b = await step('07b 真点「回塔底」', `
    document.querySelector('#npc-w3-guide [data-w3g="tower"]').click(); await sleep(650);
    return JSON.stringify({ tower:!!document.querySelector('#xx-tower') });
  `);
  A(s7b.tower === true, '回塔底按钮有效', s7b);

  const s8 = await step('08 真点「俯身看脚下」→ 三选一', `
    document.querySelector('#xx-tower [data-foot="dig"]').click(); await sleep(650);
    return JSON.stringify({ foot:XX._s.worldFoot,
      doors:Array.from(document.querySelectorAll('#xx-tower [data-foot]')).map(x=>x.dataset.foot).join(',') });
  `, 'w3-08-three-doors.png');
  A(s8.foot === 'dug' && s8.doors === 'open,self,seal', '俯身后进入三选一', s8);

  const s9 = await step('09 真点终态 → 塔页回响', `
    const b=document.querySelector('#xx-tower [data-foot="seal"]'); if(b) b.click(); await sleep(750);
    return JSON.stringify({ foot:XX._s.worldFoot,
      echo:(document.getElementById('world-echo-tower')||{}).textContent||'' });
  `, 'w3-09-tower-echo.png');
  A(s9.foot === 'seal' && s9.echo.length > 0, '终态落账且塔页出现回响', s9);

  const s10 = await step('10 回识人页 → 指引收起、回响接手', `
    ROUTER.open('role','xx-role-npc'); await sleep(650);
    const g=document.getElementById('npc-w3-guide'), e=document.getElementById('npc-world-echo');
    return JSON.stringify({ guideEmpty:g?g.textContent==='':null, echo:e?e.textContent.slice(0,70):'' });
  `, 'w3-10-npc-echo.png');
  A(s10.guideEmpty === true && s10.echo.length > 0, '终态后指引退场、回响接手', s10);

} catch (e) {
  fail++; console.error('[w3] 链路异常', e);
  report.asserts.push({ label: '链路无异常', ok: false, got: String(e && e.message || e) });
} finally {
  report.summary = { pass, fail, at: new Date().toISOString(), page: PAGE_URL };
  fs.writeFileSync(path.join(SHOTS, 'w3-chain-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('\n[w3] 通过 ' + pass + ' / 失败 ' + fail + '，截图 ' + report.shots.length + ' 张 → tools/ui-accept-shots/');
  // 温和关闭自建的 headless 实例（不是用户的 Edge，不用 taskkill /F）
  try {
    const bws = new WebSocket(browserWs);
    await new Promise(r => { bws.onopen = r; bws.onerror = r; });
    bws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await sleep(400); try { bws.close(); } catch (e) {}
  } catch (e) {}
  await Promise.race([exited, sleep(2500)]);
  try { if (edge.exitCode === null) edge.kill(); } catch (e) {}
  try { ws.close(); } catch (e) {}
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(PROBE, { force: true }); } catch (e) {}
}
process.exit(fail ? 1 : 0);
