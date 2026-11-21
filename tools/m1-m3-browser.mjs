// tools/m1-m3-browser.mjs — M-1 / M-2 真实浏览器验收（file:// 双击启动路径）
//
// 与 ui-accept-p1.mjs 的「同源 HTTP 托管」不同，本脚本**直接导航到 file://index.html**，
// 目的就是验证授权书要求的「双击 index.html 可运行」兼容性。
//
// 隔离保证：
//   · 独立 --user-data-dir（m1-m3-evidence/edge-profile-<ts>），不碰用户主 Edge；
//   · 测试数据只写入该隔离 profile 的 localStorage，不读取/清空任何真实玩家存档；
//   · 故障注入只覆盖 Storage.prototype.setItem（仅针对 xiuxian_save 键），可完整恢复。
//
// 运行：node tools/m1-m3-browser.mjs
// 退出码：0 全通过；1 有断言失败；2 环境/启动异常
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import crypto from 'node:crypto';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EVID = path.resolve(ROOT, '..', 'm1-m3-evidence');
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const SHOTS = path.join(EVID, 'shots_' + TS);
fs.mkdirSync(SHOTS, { recursive: true });

const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge 可执行文件'); process.exit(2); }
const ROOT_POSIX = ROOT.replace(/\\/g, '/');
const FILE_URL = encodeURI('file:///' + ROOT_POSIX.replace(/^\/+/, '') + '/index.html');
const TODAY = (() => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); })();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const results = [], pageErrors = [], consoleErrors = [], notes = [];
function ok(name, cond, detail) {
  if (cond) { pass++; results.push({ name, status: 'PASS', detail: detail || '' }); console.log('  PASS  ' + name); }
  else { fail++; results.push({ name, status: 'FAIL', detail: detail || '' }); console.error('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

// ------------------------------------------------------------------ Edge / CDP
const ud = path.join(EVID, 'edge-profile_' + TS);
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
ws.onmessage = ev => {
  let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails || {};
    const frames = (d.stackTrace && d.stackTrace.callFrames) || [];
    pageErrors.push({
      text: d.text || (d.exception || {}).description || 'unknown',
      url: d.url || null, line: d.lineNumber, col: d.columnNumber,
      frames: frames.slice(0, 4).map(f => ({ url: f.url, line: f.lineNumber, fn: f.functionName }))
    });
  }
  if (m.method === 'Log.entryAdded' && m.params.entry && m.params.entry.level === 'error') {
    const e = m.params.entry;
    consoleErrors.push({ text: String(e.text || '').slice(0, 300), url: e.url || null, line: e.lineNumber || null, source: e.source || null });
  }
};
const send = (method, params) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });
let loadFired = false;
const origHandler = ws.onmessage;
ws.onmessage = ev => { origHandler(ev); try { const m = JSON.parse(ev.data); if (m.method === 'Page.loadEventFired') loadFired = true; } catch (e) {} };

await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');

async function navigate(waitMs) {
  loadFired = false;
  await send('Page.navigate', { url: FILE_URL });
  for (let i = 0; i < 200 && !loadFired; i++) await sleep(100);
  await sleep(waitMs || 1200);
  return loadFired;
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) return { __evalError: String((r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text) };
  const v = r.result && r.result.result ? r.result.result.value : undefined;
  return v;
}
async function evalJson(expression) {
  const v = await evalJs(expression);
  if (typeof v !== 'string') return { __notString: v };
  try { return JSON.parse(v); } catch (e) { return { __parseError: v.slice(0, 500) }; }
}
async function screenshot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (r.result && r.result.data) { const p = path.join(SHOTS, name + '.png'); fs.writeFileSync(p, Buffer.from(r.result.data, 'base64')); return p; }
  return null;
}
async function setViewport(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await sleep(400);
}
// 真实鼠标点击（CDP Input，走浏览器命中测试，等同玩家点击）
async function realClick(sel) {
  // 遍历所有匹配元素，挑第一个「尺寸正常 + 在视口内 + elementFromPoint 命中」的，
  // 等价于真实玩家能点到的那个；严禁用 DOM .click() 绕过命中测试。
  const box = await evalJson(`(function(){ try{
    const list=Array.from(document.querySelectorAll(${JSON.stringify(sel)}));
    for(const e of list){
      const r=e.getBoundingClientRect();
      if(r.width<2||r.height<2) continue;
      const cx=r.left+r.width/2, cy=r.top+r.height/2;
      if(cx<1||cy<1||cx>window.innerWidth-1||cy>window.innerHeight-1) continue;
      const hit=document.elementFromPoint(cx,cy);
      if(hit&&(hit===e||e.contains(hit))) return JSON.stringify({x:cx,y:cy,w:r.width,h:r.height,matched:list.length,hit:hit.tagName+'.'+hit.className+'#'+hit.id,hitIsTarget:true});
    }
    return JSON.stringify({err:'no-visible-match',matched:list.length});
  }catch(e){ return JSON.stringify({err:e.message}); } })()`);
  if (box.err || !box.w || !box.h) return { ...box, clicked: false };
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(500);
  return { ...box, clicked: true };
}

const report = {
  generatedAt: new Date().toISOString(),
  edge: EDGE, url: FILE_URL, protocol: 'file://', profile: ud, shots: SHOTS, todayKey: TODAY,
  isolation: 'dedicated headless Edge user-data-dir; injected test save only; real player profile untouched',
  modificationsDisclosure: [], notes, results, pageErrors, consoleErrors
};

try {
  // ---------------------------------------------------- 步骤 1：首次导航（无预置档）
  console.log('\n=== 步骤 1：file:// 首次导航（无存档，验证双击启动不白屏）===');
  const loaded1 = await navigate(1500);
  ok('B-01 file:// 页面 loadEventFired', loaded1 === true, 'loaded=' + loaded1);
  const first = await evalJson(`(function(){ try{ return JSON.stringify({
    hasXX: typeof XX==='object', hasNpcMemory: typeof window.NpcMemory==='object',
    hasRouter: typeof window.ROUTER==='object', hasDaily: typeof window.Daily==='object',
    hasStory: typeof window.Story==='object', hasMultiLedger: typeof window.MultiLedger==='object',
    title: document.title, bodyLen: document.body?document.body.innerText.length:0,
    scriptCount: document.querySelectorAll('script[src]').length,
    storageWorks: (function(){ try{ localStorage.setItem('__probe__','1'); const v=localStorage.getItem('__probe__'); localStorage.removeItem('__probe__'); return v==='1'; }catch(e){ return 'ERR:'+e.message; } })()
  }); }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  console.log('  首次导航状态: ' + JSON.stringify(first));
  ok('B-02 file:// 下 30 个经典脚本全部加载（XX/NpcMemory/ROUTER/Daily/Story/MultiLedger 就绪）',
    first.hasXX && first.hasNpcMemory && first.hasRouter && first.hasDaily && first.hasStory && first.hasMultiLedger, JSON.stringify(first));
  ok('B-03 file:// 下页面非白屏（body 文本 > 100 字符）', (first.bodyLen || 0) > 100, 'bodyLen=' + first.bodyLen);
  ok('B-04 file:// 下 localStorage 可读写（存档机制前提）', first.storageWorks === true, String(first.storageWorks));
  ok('B-05 index.html 无 type="module"（未破坏双击启动契约）',
    (await evalJs(`document.querySelectorAll('script[type="module"]').length`)) === 0);

  // --------------------------------- 步骤 2：预置隔离旧存档 + 旧 NPC 记忆（不清空任何真实数据）
  console.log('\n=== 步骤 2：写入隔离测试数据（仅本 profile 内）===');
  const seedExpr = `(function(){ try{
    const save = { rank:3, exp:5000, stone:12345, name:'隔离测试道友', last:Date.now(), cave:2,
                   log:[], bag:[], wisdom:100, herb:50, ore:50 };
    const mem = { day:${JSON.stringify(TODAY)}, mem:{ shen_bei:[
      { text:'旧记忆·曾在碑前听他讲断天门', day:${JSON.stringify(TODAY)}, strength:1, kind:'story' },
      { text:'旧记忆·论剑台赢过一场', day:${JSON.stringify(TODAY)}, strength:0.9, kind:'combat' }
    ] } };
    localStorage.setItem('xiuxian_save', JSON.stringify(save));
    localStorage.setItem('jxwd_npc_memory_v1', JSON.stringify(mem));
    localStorage.setItem('hasFinishedTutorial','1');
    return JSON.stringify({ ok:true, saveLen:localStorage.getItem('xiuxian_save').length, memLen:localStorage.getItem('jxwd_npc_memory_v1').length });
  }catch(e){ return JSON.stringify({ok:false, err:e.message}); } })()`;
  const seeded = await evalJson(seedExpr);
  ok('B-06 隔离旧主存档 + 旧 NPC 记忆预置成功', seeded.ok === true, JSON.stringify(seeded));

  // ------------------------------------ 步骤 3：刷新 → 老档路径 → finishBoot → init 读回
  console.log('\n=== 步骤 3：刷新页面（真实模拟玩家重开），验证 M-1 旧记忆读回 ===');
  const loaded2 = await navigate(1800);
  ok('B-07 刷新后 loadEventFired', loaded2 === true);
  const afterReload = await evalJson(`(function(){ try{
    const M=window.NpcMemory, X=XX;
    return JSON.stringify({
      memList: M?M.list('shen_bei'):null,
      memDay: M?M._state().day:null,
      saveName: X?X._s.name:null, saveRank: X?X._s.rank:null,
      saveStone: X?X._s.stone:null,
      charModalHidden: (function(){const e=document.getElementById('char-modal');return e?e.classList.contains('hidden'):'no-el';})(),
      hasSaveHealth: !!(X&&typeof X._saveHealth==='function'),
      health: X&&X._saveHealth?X._saveHealth():null,
      diskMemRaw: localStorage.getItem('jxwd_npc_memory_v1')
    });
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  console.log('  刷新后: ' + JSON.stringify({ memList: afterReload.memList, saveName: afterReload.saveName, saveRank: afterReload.saveRank, health: afterReload.health }));
  const mt = (afterReload.memList || []).map(x => x.text);
  ok('B-08 【M-1 核心】刷新后旧 NPC 记忆被读回（修复前为 []）',
    mt.includes('旧记忆·曾在碑前听他讲断天门') && mt.includes('旧记忆·论剑台赢过一场'), JSON.stringify(mt));
  /* 注意：stone 会因既有 offline() 离线收益/挂机结算增长，不能写死为预置值。
     本断言只验证「旧档字段被读回且未被本轮改动破坏」：name/rank 精确匹配，
     stone 为有限数且 >= 预置值（既有增益允许）。 */
  ok('B-09 旧主存档逐字段读回（name/rank/stone 未被本轮改动破坏）',
    afterReload.saveName === '隔离测试道友' && afterReload.saveRank === 3 &&
    typeof afterReload.saveStone === 'number' && isFinite(afterReload.saveStone) && afterReload.saveStone >= 12345,
    JSON.stringify({ n: afterReload.saveName, r: afterReload.saveRank, s: afterReload.saveStone, note: 'stone 含既有 offline() 离线收益' }));
  ok('B-10 老档路径未弹创角弹窗（启动流程正常）', afterReload.charModalHidden === true, String(afterReload.charModalHidden));
  ok('B-11 【M-2】XX._saveHealth 只读诊断接口可用', afterReload.hasSaveHealth === true);
  ok('B-12 初始存档健康状态为 failing=false', afterReload.health && afterReload.health.failing === false, JSON.stringify(afterReload.health));

  // ---------------------------------------------- 步骤 4：正常保存 / 保存失败 / 再次保存
  console.log('\n=== 步骤 4：M-2 存档写入失败统一反馈（受控故障注入）===');
  const normal = await evalJson(`(function(){ try{
    const before = localStorage.getItem('xiuxian_save');
    const r = XX.save();
    return JSON.stringify({ r, h:XX._saveHealth(), unchanged: localStorage.getItem('xiuxian_save')!==null, beforeLen:before?before.length:0 });
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('B-13 正常保存返回 true，且健康状态保持 failing=false', normal.r === true && normal.h.failing === false, JSON.stringify(normal));

  const injected = await evalJson(`(function(){ try{
    window.__origSetItem = Storage.prototype.setItem;
    window.__rawBefore = localStorage.getItem('xiuxian_save');
    Storage.prototype.setItem = function(k,v){
      if(k==='xiuxian_save') throw new Error('QuotaExceededError (injected by m1-m3-browser)');
      return window.__origSetItem.call(this,k,v);
    };
    const rs = [XX.save(), XX.save(), XX.save(), XX.save(), XX.save()];
    const logArr = (XX._s.log||[]);
    return JSON.stringify({
      rs, health: XX._saveHealth(),
      failLogCount: logArr.filter(x=>String(x.t).indexOf('存档写入失败')>=0).length,
      failLogText: (logArr.find(x=>String(x.t).indexOf('存档写入失败')>=0)||{}).t || null,
      toastText: (document.getElementById('toast')||{}).textContent || '',
      rawUnchanged: localStorage.getItem('xiuxian_save') === window.__rawBefore,
      rawExists: localStorage.getItem('xiuxian_save') !== null
    });
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  console.log('  故障注入结果: ' + JSON.stringify({ rs: injected.rs, health: injected.health, failLogCount: injected.failLogCount, toast: injected.toastText }));
  ok('B-14 写盘失败时 save() 如实返回 false（不伪装成功）', Array.isArray(injected.rs) && injected.rs.every(r => r === false), JSON.stringify(injected.rs));
  ok('B-15 【M-2】系统能明确识别失败（_saveHealth().failing=true，failures 递增）',
    injected.health && injected.health.failing === true && injected.health.failures >= 5, JSON.stringify(injected.health));
  ok('B-16 失败反馈可见：日志面板出现明确告警并引导导出备份',
    injected.failLogCount === 1 && String(injected.failLogText).includes('存档备份'), JSON.stringify({ c: injected.failLogCount, t: injected.failLogText }));
  ok('B-17 失败反馈可见：toast 出现存档写入失败提示', String(injected.toastText).includes('存档写入失败'), injected.toastText);
  ok('B-18 连续 5 次失败只提示 1 次（不高频重复刷屏）', injected.failLogCount === 1, 'failLogCount=' + injected.failLogCount);
  ok('B-19 保存失败不清除、不覆盖旧存档（磁盘字节完全不变）',
    injected.rawUnchanged === true && injected.rawExists === true, JSON.stringify(injected));

  // 让 tickLoop 也跑过一次（每 3 秒自动保存），验证自动保存失败同样不刷屏
  await sleep(3400);
  const tickCheck = await evalJson(`(function(){ try{ return JSON.stringify({
    health: XX._saveHealth(),
    failLogCount: (XX._s.log||[]).filter(x=>String(x.t).indexOf('存档写入失败')>=0).length
  }); }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('B-20 自动保存（tickLoop）失败也受同一节流保护，告警不增加',
    tickCheck.failLogCount === 1, JSON.stringify(tickCheck));

  const restored = await evalJson(`(function(){ try{
    Storage.prototype.setItem = window.__origSetItem;
    const r = XX.save();
    return JSON.stringify({
      r, health: XX._saveHealth(),
      recoverLogCount: (XX._s.log||[]).filter(x=>String(x.t).indexOf('存档写入已恢复')>=0).length,
      rawExists: localStorage.getItem('xiuxian_save')!==null,
      deleteOrig: delete window.__origSetItem
    });
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  console.log('  恢复结果: ' + JSON.stringify(restored));
  ok('B-21 故障解除后再次保存返回 true', restored.r === true, JSON.stringify(restored));
  ok('B-22 恢复后健康状态回到 failing=false', restored.health && restored.health.failing === false, JSON.stringify(restored.health));
  ok('B-23 恢复写了一条「已恢复」日志（失败状态闭环）', restored.recoverLogCount === 1, 'recoverLogCount=' + restored.recoverLogCount);

  // 第二个故障周期应重新提示（证明节流不是永久静默）
  const cycle2 = await evalJson(`(function(){ try{
    const o = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k,v){ if(k==='xiuxian_save') throw new Error('injected-2'); return o.call(this,k,v); };
    const r = XX.save();
    const c = (XX._s.log||[]).filter(x=>String(x.t).indexOf('存档写入失败')>=0).length;
    Storage.prototype.setItem = o;
    return JSON.stringify({ r, failLogCount:c, after:XX.save(), health:XX._saveHealth() });
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('B-24 新故障周期会重新提示（节流不是永久静默）', cycle2.r === false && cycle2.failLogCount === 2, JSON.stringify(cycle2));

  // ------------------------------------------------- 步骤 5：新记忆落盘 + 刷新连续性
  console.log('\n=== 步骤 5：新增 NPC 记忆 → 刷新 → 记忆连续性（浏览器真实路径）===');
  const rec = await evalJson(`(function(){ try{
    const r = window.NpcMemory.record('shen_bei','浏览器新增记忆·描完碑背的同字','story');
    const disk = JSON.parse(localStorage.getItem('jxwd_npc_memory_v1'));
    return JSON.stringify({ r, texts:(disk.mem.shen_bei||[]).map(x=>x.text) });
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('B-25 浏览器内 record() 成功且新旧记忆同盘',
    rec.r && rec.r.ok === true && rec.texts.includes('旧记忆·曾在碑前听他讲断天门') && rec.texts.includes('浏览器新增记忆·描完碑背的同字'), JSON.stringify(rec));
  const loaded3 = await navigate(1800);
  const cont = await evalJson(`(function(){ try{ return JSON.stringify({
    texts: window.NpcMemory.list('shen_bei').map(x=>x.text),
    name: XX._s.name, health: XX._saveHealth()
  }); }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('B-26 再次刷新后新增记忆与旧记忆均连续可读',
    loaded3 && cont.texts && cont.texts.includes('浏览器新增记忆·描完碑背的同字') && cont.texts.includes('旧记忆·曾在碑前听他讲断天门'), JSON.stringify(cont.texts));
  ok('B-27 再次刷新后主存档仍完好（旧档兼容未被破坏）', cont.name === '隔离测试道友', String(cont.name));

  // -------------------------------------------- 步骤 6：UI 真实点击 + 多视口截图
  console.log('\n=== 步骤 6：真实鼠标点击 + 多视口截图（不置空 Story，不绕过命中测试）===');
  /* 项目既有经验（2026-11-04 H1 三阶段实测）：Story 引导 #story-modal 会按场景 + 6s
     间隔重弹，短暂遮挡侧栏按钮。本轮**不置空 Story.show / Story.tick**，保留真实玩家
     可见的遮挡；做法是每个场景单独 reload 回到干净大厅，若浮片已可见则用 CDP 真实
     点击「继续」关闭，并把遮挡状态写入证据。严禁用 DOM .click() 绕过命中测试。 */
  async function modalState() {
    return await evalJson(`(function(){ try{
      const m=document.getElementById('story-modal');
      const vis=!!(m&&!m.classList.contains('hidden')&&getComputedStyle(m).display!=='none');
      const overlays=Array.from(document.querySelectorAll('.modal')).filter(e=>!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none').map(e=>e.id);
      return JSON.stringify({storyVisible:vis,overlays});
    }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  }
  async function dismissIfVisible(tag) {
    const st = await modalState();
    if (st.storyVisible) {
      const c = await realClick('#sto-close');
      notes.push(tag + '：检测到既有 #story-modal 可见，用 CDP 真实点击「继续」关闭（未置空 Story.show/tick），结果 ' + JSON.stringify(c));
      await sleep(300);
    }
    return st;
  }
  await setViewport(1280, 800);

  // 6.1 人物页：单独 reload 回到干净大厅，再真实鼠标点击
  await navigate(1500);
  report.modalBeforeRole = await dismissIfVisible('人物页');
  const roleClick = await realClick('[data-bld="role"]');
  report.roleClick = roleClick;
  console.log('  人物页点击: ' + JSON.stringify(roleClick));
  ok('B-28 【真实鼠标】人物页入口存在且可点击（命中测试 hitIsTarget）',
    roleClick.clicked === true && roleClick.hitIsTarget === true, JSON.stringify(roleClick));
  const roleView = await evalJson(`(function(){ try{ return JSON.stringify({
    rolePanel: !!document.querySelector('.panel-page[data-panel="role"]'),
    hasRoleNpc: document.body.innerText.indexOf('识人')>=0,
    hasPower: document.body.innerText.indexOf('道体')>=0 || document.body.innerText.indexOf('战力')>=0,
    panelTextLen:(document.body.innerText||'').length
  }); }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('B-29 人物页视图确实打开（role 面板存在且含识人/道体栏目）',
    roleView.rolePanel === true && roleView.hasRoleNpc === true && (roleView.panelTextLen || 0) > 100, JSON.stringify(roleView));
  const shotRole = await screenshot('01_role_1280');
  ok('B-30 人物页 1280 视口截图已保存', !!shotRole, String(shotRole));

  // 6.2 每日奖励路径：单独 reload → 真实点活动入口 → 真实点「日常任务」子格
  await navigate(1500);
  report.modalBeforeEvent = await dismissIfVisible('每日路径');
  const eventClick = await realClick('[data-bld="event"]');
  report.eventClick = eventClick;
  console.log('  活动入口点击: ' + JSON.stringify(eventClick));
  ok('B-31a 【真实鼠标】限时活动入口可点击（命中测试 hitIsTarget）',
    eventClick.clicked === true && eventClick.hitIsTarget === true, JSON.stringify(eventClick));
  /* [data-bld="event"] 有 3 个匹配，命中的是带 data-scroll 的卡片 → ROUTER 会直接跳子页，
     活动 hub 的「日常任务」子格此时不在 DOM。用产品 API ROUTER.open('event') 明确定位到 hub
     （仅导航，不是验收点击，已披露），后续子格点击仍是 CDP 真实鼠标。 */
  await evalJs(`(function(){ try{ if(window.ROUTER && window.ROUTER.open) window.ROUTER.open('event'); }catch(e){} })()`);
  notes.push('活动入口点击命中带 data-scroll 的卡片会直达子页；为验证「日常任务」子格，使用产品 API ROUTER.open("event") 打开活动 hub（仅导航），子格点击仍为 CDP 真实鼠标；已披露。');
  await sleep(500);
  const hubState = await evalJson(`(function(){ try{ return JSON.stringify({
    eventPanel: !!document.querySelector('.panel-page[data-panel="event"]'),
    hasDailyJump: !!document.querySelector('[data-jump="ev-daily"]')
  }); }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('B-31b 活动面板打开且存在「日常任务」子入口',
    hubState.eventPanel === true && hubState.hasDailyJump === true, JSON.stringify(hubState));
  const dailyJump = await realClick('[data-jump="ev-daily"]');
  report.dailyJump = dailyJump;
  console.log('  日常任务子格点击: ' + JSON.stringify(dailyJump));
  ok('B-31c 【真实鼠标】进入「日常任务」子页',
    dailyJump.clicked === true && dailyJump.hitIsTarget === true, JSON.stringify(dailyJump));
  const eventView = await evalJson(`(function(){ try{ return JSON.stringify({
    dailyApi: !!(window.Daily && typeof window.Daily.list==='function'),
    dailyListLen: window.Daily?window.Daily.list().length:-1,
    dailyNames: window.Daily?window.Daily.list().map(t=>t.name):[],
    dailyBoxText: ((document.getElementById('xx-daily')||{}).innerText||'').slice(0,160),
    hasDailyTaskText: ((document.getElementById('xx-daily')||{}).innerText||'').indexOf('打坐练气')>=0
  }); }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('B-31 每日任务模块可读（Daily.list 返回 3 条任务，奖励规则未改）',
    eventView.dailyApi === true && eventView.dailyListLen === 3, JSON.stringify(eventView));
  ok('B-31d 每日子页渲染出既有任务名（UI 未被本轮修复破坏）',
    eventView.hasDailyTaskText === true, JSON.stringify({ names: eventView.dailyNames, box: eventView.dailyBoxText }));
  const shotEvent = await screenshot('02_event_1280');
  ok('B-32 每日任务 1280 视口截图已保存', !!shotEvent, String(shotEvent));

  await setViewport(360, 780);
  const shotNarrow = await screenshot('03_daily_360');
  ok('B-33 360 窄视口截图已保存（多视口检查）', !!shotNarrow, String(shotNarrow));
  const overflow = await evalJson(`(function(){ try{ return JSON.stringify({
    scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
    bodyScrollW: document.body.scrollWidth
  }); }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  report.narrowOverflow = overflow;
  notes.push('360 视口溢出测量：' + JSON.stringify(overflow) + '（本轮未改 CSS/layout，仅记录基线）');

  // ----------------------------------------------------------- 步骤 7：异常汇总
  console.log('\n=== 步骤 7：页面异常与控制台错误 ===');
  const patchRelated = pageErrors.filter(e => /game\.js|npc_memory\.js/.test([e.url, ...(e.frames || []).map(f => f.url)].join(' ')));
  const nonResourceErrors = consoleErrors.filter(e => !/net::ERR_/.test(e.text || ''));
  ok('B-34 【严格】全流程无未捕获 JS 异常（含既有环境噪声，如实保留）', pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));
  ok('B-34b 【分类】无来自本轮修改文件（game.js / npc_memory.js）的未捕获异常', patchRelated.length === 0, JSON.stringify(patchRelated));
  ok('B-35 【严格】全流程无 console error（含既有环境噪声，如实保留）', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
  ok('B-35b 【分类】console error 全部为资源/网络类（net::ERR_*），无 JS 语法/类型错误', nonResourceErrors.length === 0, JSON.stringify(nonResourceErrors));
  report.errorClassification = { pageErrors, consoleErrors, patchRelated, nonResourceErrors };
  notes.push('故障注入期间 console.warn("[save] localStorage.setItem failed") 属预期的 warn，不是 error，未计入 B-35。');

} catch (e) {
  fail++;
  results.push({ name: 'B-xx 脚本运行异常', status: 'FAIL', detail: e.stack || e.message });
  console.error('脚本异常: ' + (e.stack || e.message));
} finally {
  report.total = pass + fail; report.pass = pass; report.fail = fail;
  report.fileHashes = {};
  for (const f of ['js/game.js', 'js/npc_memory.js', 'index.html', 'js/daily.js', 'js/story.js', 'js/router.js']) {
    try { report.fileHashes[f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex'); } catch (e) {}
  }
  const out = path.join(EVID, '03_m1_m3_browser_results.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
  console.log('\n=== 汇总 ===');
  console.log('断言总数: ' + (pass + fail) + '  通过: ' + pass + '  失败: ' + fail + '  退出码: ' + (fail ? 1 : 0));
  console.log('证据落盘: ' + out);
  console.log('截图目录: ' + SHOTS);
  try { ws.close(); } catch (e) {}
  try { edge.kill(); } catch (e) {}
  for (let i = 0; i < 30 && !edgeExited; i++) await sleep(100);
  process.exit(fail ? 1 : 0);
}
