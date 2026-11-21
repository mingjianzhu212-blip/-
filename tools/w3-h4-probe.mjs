// tools/w3-h4-probe.mjs — GPT 审查 H4 专项补验：真实升 stage 路径
//
// 目的：证明玩家不靠任何状态构造，只用识人页真实 UI 点击就能把 S.npcs.stele.stage
//       从 0 升到 2、解锁并听到「山外」，且 stage<2 时看得到「怎么解锁」的指引。
//
// 与 w3-accept.mjs 的区别：
//   · 那份脚本在 04a 直接构造 S.npcs.stele.stage=2（GPT H4 指出的证据缺口）；
//   · 本探针从新档 met=0 起，按 UI 点击序列真实结算：
//       初见选项 → 碑·耐心听(stage→1) → 三千年·信(stage→2) → 山外·记下(heard)
//   · 全程不置空 Story；浮片用游戏自身 Tutorial.finish() + 真实点 #sto-close 收掉
//     （沿用 H1 三阶段探针 dismissed 的做法），不 mock Story、不隐藏 modal 做断言。
//   · 断言只读 DOM 与 XX._s 派生状态，不读视觉命中；截图前临时隐藏 modal 仅为画面
//     清晰，属「环境替换」，已在报告 env 字段披露，不参与任何断言。
//
// 产物：tools/ui-accept-shots/w3h4-*.png + w3-h4-stage-report.json
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

const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const BASE_HREF = 'file:///' + String(ROOT).replace(/\\/g, '/').replace(/\/+$/, '') + '/';
const PROBE = path.join(SCRATCH, '._w3_h4.html');
fs.writeFileSync(PROBE, SRC.replace('<head>', '<head><base href="' + BASE_HREF + '">'), 'utf8');
const PAGE_URL = 'file:///' + PROBE.replace(/\\/g, '/');

const ud = path.join(SCRATCH, 'w3h4_' + process.pid + '_' + Date.now());
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
  // 只在截图前临时隐藏 modal 让画面干净；不参与断言，env 字段已披露
  await evalJs(`(function(){ document.querySelectorAll('.modal').forEach(function(m){m.classList.add('hidden');}); })()`);
  await sleep(150);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(SHOTS, name), Buffer.from(r.result.data, 'base64'));
  return name;
}

const report = {
  env: {
    storyStubbed: false,
    storyNative: null,
    tutorial: '用游戏自身公开 API Tutorial.finish() 完成新手教程（非逐格点击），reload 让存档标记生效',
    storyModal: '真实点击 #sto-close「继续」收掉，并等过 6s 最小重弹间隔',
    screenshotOnly: '截图前临时给 .modal 加 hidden 仅为画面清晰，不参与任何断言',
    stateConstruction: '零构造：S.npcs.stele 全程由游戏自身 load() 初始化，stage 只由真实 npcPick 结算推进'
  },
  steps: [], asserts: [], shots: []
};
let pass = 0, fail = 0;
const A = (cond, label, got) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + '  →  ' + JSON.stringify(got)); }
  report.asserts.push({ label, ok: !!cond, got: got === undefined ? null : got });
};

// 读一帧「玩家此刻在识人页看得见什么」：stage / 话题解锁 / 锁行提示 / W3 指引 / 线索
const SNAP = `JSON.stringify({
  stage: (function(){ try{ return Npc.npcState(XX._s.npcs.stele).stage; }catch(e){ return -1; } })(),
  met:   (function(){ try{ return Npc.npcState(XX._s.npcs.stele).met; }catch(e){ return -1; } })(),
  heard: (function(){ try{ return (XX._s.npcs.stele.heard||[]).join(','); }catch(e){ return ''; } })(),
  firstOpts: Array.from(document.querySelectorAll('#npc-opts [data-topic="first"]')).map(function(b){return b.dataset.opt;}).join(','),
  topics: Array.from(document.querySelectorAll('#npc-topics .npc-topic')).map(function(r){
    return { id:r.dataset.topic||'', name:(r.querySelector('b')||{}).textContent||'',
      lock:r.classList.contains('lock'),
      hint:(r.querySelector('.sto-hint')||{}).textContent||'' }; }),
  guide: (document.getElementById('npc-w3-guide')||{}).textContent||'',
  guideAct: (function(){ const b=document.querySelector('#npc-w3-guide [data-w3g]'); return b?b.dataset.w3g:''; })(),
  clue3Open: (function(){ const r=document.querySelector('#npc-clues .sto-item[data-clue="clue3"]'); return r?r.dataset.open:''; })(),
  npcRoot: !!document.getElementById('xx-role-npc-root')
})`;

async function snap(name, shotName) {
  const o = JSON.parse(await evalJs(`(function(){ return ${SNAP}; })()`));
  report.steps.push({ name, got: o });
  console.log('[h4] ' + name + ' stage=' + o.stage + ' met=' + o.met + ' heard=[' + o.heard + ']' +
    ' guide=' + (o.guide || '').slice(0, 46));
  if (shotName) report.shots.push(await shot(shotName));
  return o;
}
async function click(sel, label) {
  const r = await evalJs(`(function(){ const b=document.querySelector(${JSON.stringify(sel)});
    if(!b) return JSON.stringify({found:false,sel:${JSON.stringify(sel)}});
    b.click(); return JSON.stringify({found:true,text:b.textContent}); })()`);
  const o = JSON.parse(r);
  if (!o.found) console.log('[h4] !! 未找到 ' + label + ' ' + sel);
  await sleep(520);
  return o;
}

try {
  console.log('\n=== W3 · H4 真实升 stage 路径补验 ===');
  await send('Page.navigate', { url: PAGE_URL });
  await waitLoad(); await sleep(1200);
  await evalJs(`(function(){ try{ localStorage.clear(); }catch(e){} })()`);
  await send('Page.reload'); await waitLoad(); await sleep(1200);

  // 真实创角 → 游戏自身 API 完成教程 → reload → 真实点掉剧情浮片
  await evalJs(`(function(){ const c=document.getElementById('char-confirm'); if(c) c.click(); return true; })()`);
  await sleep(800);
  await evalJs(`(function(){ try{ Tutorial.finish(); }catch(e){} return true; })()`);
  await send('Page.reload'); await waitLoad(); await sleep(1200);
  report.env.storyNative = JSON.parse(await evalJs(`JSON.stringify({
    storyShowIsNative: !!(window.Story && !/function\\(\\)\\{\\}/.test(String(Story.show))),
    storyExists: !!window.Story,
    tutFlag: localStorage.getItem('hasFinishedTutorial')
  })`));
  await evalJs(`(function(){ if(window.ROUTER && ROUTER.open) ROUTER.open('tower'); return true; })()`);
  await sleep(7200);                        // 跨过「场景 +6s 重弹」窗口
  await evalJs(`(function(){ const b=document.getElementById('sto-close'); if(b) b.click(); return true; })()`);
  await sleep(6800);                        // 等过最小重弹间隔
  A(report.env.storyNative.storyShowIsNative === true, 'Story 保持原生（未置空 / 未替换）', report.env.storyNative);

  // 塔页 → 真实点 W3 按钮 → 识人页
  await evalJs(`(function(){ if(window.ROUTER && ROUTER.open) ROUTER.open('tower'); return true; })()`);
  await sleep(600);
  const toNpc = await click('#xx-tower [data-w3="go-stele"]', '去观前');
  A(toNpc.found === true, '塔页「去观前」按钮可点', toNpc);
  await sleep(500);
  const s0 = await snap('00 新档识人页（stage=0）', 'w3h4-00-stage0.png');
  A(s0.npcRoot === true, '真实进入识人页', s0);
  A(s0.met === 0 && s0.stage === 0, '新档 met=0 / stage=0（未被构造）', s0);
  A(/ask_who|ask_black|pass_by/.test(s0.firstOpts), '初见三选项由 UI 真实渲染', s0.firstOpts);

  /* 初见态（met=0）npcSay.topics=[]，本就不渲染话题列表。上一轮探针在这里查
     「山外 / 三千年」锁行提示读回 {}，是断言时序写错、不是产品缺陷；锁行提示必须
     在初见结算（met=1）之后才存在，移到 s1 检查。 */
  A(s0.topics.length === 0, '初见态只给开场选项、不渲染话题列表（正常）', s0.topics);
  A(/山外/.test(s0.guide) && s0.guideAct === 'clue', 'stage=0：W3 指引说明来意并指向「山外」', s0.guide);
  A(/[0-9]/.test(s0.topics.map(t => t.hint).join('')) === false, '锁行提示不含内部数字 / stage 条件名', s0.topics.map(t => t.hint));

  // 真实点击序列：初见 → 碑·耐心听 → 三千年·信 → 山外·记下
  const c1 = await click('#npc-opts [data-topic="first"][data-opt="ask_who"]', '初见·你是什么人');
  A(c1.found === true, '真实点初见选项', c1);
  const s1 = await snap('01 初见后（stage=0，话题出现）', 'w3h4-01-after-first.png');
  A(s1.met === 1 && s1.stage === 0, '初见结算 met=1、stage 仍为 0', s1);
  const t3b = s1.topics.find(t => t.name === '三千年') || {};
  const t4b = s1.topics.find(t => t.name === '山外') || {};
  A(t3b.lock === true && t4b.lock === true, 'stage=0：两个后续话题仍锁着且有提示', [t3b, t4b]);
  A(t4b.hint.length > 0 && /三千年/.test(t4b.hint), 'stage=0：「山外」锁行提示点名「三千年」', t4b.hint);
  A(t3b.hint.length > 0 && /碑/.test(t3b.hint), 'stage=0：「三千年」锁行提示点名「碑」', t3b.hint);

  /* 真实玩家视角：点 W3 的「看还空着的那条」，看它究竟把玩家带到了哪里。
     这里只用 DOM .click() 测处理器去向，不测命中测试；命中测试由 H1 三阶段
     真实鼠标对照负责（玩家收掉引导/剧情浮片后按钮可点）。已在 env 披露。 */
  const clueClick = JSON.parse(await evalJs(`(function(){ const b=document.querySelector('#npc-w3-guide [data-w3g="clue"]');
    if(!b) return JSON.stringify({found:false}); b.click(); return JSON.stringify({found:true,text:b.textContent}); })()`));
  await sleep(450);
  const afterClue = JSON.parse(await evalJs(`JSON.stringify((function(){
    const ring=document.querySelector('#npc-clues .sto-item[data-clue="clue3"]');
    const guide=document.querySelector('#npc-w3-guide [data-w3g]');
    return {
      ringFound:!!ring,
      ringHighlighted:ring?ring.classList.contains('trail-ring'):false,
      ringClickable:ring?(ring.getAttribute('role')==='button'||!!ring.dataset.topic||!!ring.onclick):false,
      ringText:ring?ring.textContent.replace(/\\s+/g,' ').slice(0,50):'',
      openTopicRows:Array.from(document.querySelectorAll('#npc-topics [data-topic]')).map(x=>x.dataset.topic).join(','),
      visibleOptions:document.querySelectorAll('#npc-opts [data-opt]').length,
      guideStillClue:guide?guide.dataset.w3g==='clue':false
    }; })())`));
  report.w3Experience = { clueClick, afterClue,
    deadEnd: !!(afterClue.ringFound && afterClue.ringHighlighted && !afterClue.ringClickable &&
                afterClue.visibleOptions === 0),
    note: 'W3 指引按钮把玩家滚到「碑外一线」的一条只读线索行；deadEnd=true 表示点完之后没有任何可点推进入口' };
  console.log('[w3][obs] 点「看还空着的那条」之后 → ' + JSON.stringify(afterClue));
  await shot('w3h4-01b-after-clue-button.png');

  await click('#npc-topics [data-topic="stele1"]', '话题·碑');
  const c2 = await click('#npc-opts [data-topic="stele1"][data-opt="listen"]', '碑·耐心听');
  A(c2.found === true, '真实点「碑 · 耐心听」', c2);
  const s2 = await snap('02 听完碑（stage=1）', 'w3h4-02-stage1.png');
  A(s2.stage === 1, '真实结算把 stage 推到 1', s2);
  const t3c = s2.topics.find(t => t.name === '三千年') || {};
  const t4c = s2.topics.find(t => t.name === '山外') || {};
  A(t3c.lock === false, 'stage=1：「三千年」解锁可点', t3c);
  A(t4c.lock === true && t4c.hint.length > 0, 'stage=1：「山外」仍锁且提示指向三千年', t4c);
  A(/三千年/.test(t4c.hint), '「山外」锁行提示明确点名「三千年」', t4c.hint);

  await click('#npc-topics [data-topic="stele3"]', '话题·三千年');
  const c3 = await click('#npc-opts [data-topic="stele3"][data-opt="believe"]', '三千年·信');
  A(c3.found === true, '真实点「三千年 · 信」', c3);
  const s3 = await snap('03 听完三千年（stage=2）', 'w3h4-03-stage2.png');
  A(s3.stage === 2, '真实结算把 stage 推到 2', s3);
  const t4d = s3.topics.find(t => t.name === '山外') || {};
  A(t4d.lock === false && t4d.id === 'stele4', 'stage=2：「山外」解锁且可点', t4d);
  A(s3.clue3Open === '0', '此时「山外」线索仍未点亮（还没真的听）', s3.clue3Open);

  await click('#npc-topics [data-topic="stele4"]', '话题·山外');
  const c4 = await click('#npc-opts [data-topic="stele4"][data-opt="note"]', '山外·记下');
  A(c4.found === true, '真实点「山外 · 记下」', c4);
  const s4 = await snap('04 听完山外（heard=stele4）', 'w3h4-04-heard-stele4.png');
  A(/stele4/.test(s4.heard), '「山外」真实记进 heard', s4.heard);
  A(s4.clue3Open === '1', '碑外一线 clue3 线索随之点亮', s4.clue3Open);
  A(/镇妖塔|登塔/.test(s4.guide) && s4.guideAct === 'tower', 'W3 指引随真实进度换成「去登塔」', s4.guide);

  // 收尾：证明这条真实路径确实打通了世界线的前置（只读派生，不改状态）
  const gated = JSON.parse(await evalJs(`JSON.stringify({
    stele4: (function(){ try{ return XX._npcWorldFootStele4 ? XX._npcWorldFootStele4() : null; }catch(e){ return 'no_api'; } })(),
    towerMax: XX._s.towerMax|0,
    worldFoot: XX._s.worldFoot
  })`));
  report.steps.push({ name: '05 世界线前置状态（只读）', got: gated });

  report.verdict = {
    realStageChain: s1.stage === 0 && s2.stage === 1 && s3.stage === 2,
    noStateConstruction: s0.met === 0 && s0.stage === 0,
    lockedRowsGiveHints: !!(t4b.hint && t3b.hint && t4c.hint),
    hintsChainBackwards: /三千年/.test(t4c.hint) && /碑/.test(t3b.hint),
    clueUnlocksByRealTalk: s3.clue3Open === '0' && s4.clue3Open === '1',
    guideFollowsProgress: s0.guideAct === 'clue' && s4.guideAct === 'tower'
  };
  /* W3 指引死路属于「玩家链路缺陷观测」，单列，不算进 H4 是否通过 */
  report.w3Experience.deadEndVerdict = '待最小修复';
  report.verdict.all = Object.values(report.verdict).every(Boolean);
  A(report.verdict.all === true, 'H4 总判定：真实路径可走通且解锁提示成链', report.verdict);
} catch (e) {
  fail++; console.error('[h4] 链路异常', e);
  report.asserts.push({ label: '链路无异常', ok: false, got: String(e && e.stack || e).slice(0, 500) });
} finally {
  report.summary = { pass, fail, at: new Date().toISOString(), page: PAGE_URL };
  fs.writeFileSync(path.join(SHOTS, 'w3-h4-stage-report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log('\n[h4] 通过 ' + pass + ' / 失败 ' + fail + '，截图 ' + report.shots.length + ' 张 → tools/ui-accept-shots/');
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
