// tools/m1-m3-final-experience.mjs — 阶段五第 9 项：最终浏览器实际体验验证
//
// 与 m1-m3-browser.mjs 的区别（不是重复验收）：
//  1. 主验收以「故障注入」为核心；本脚本先走一段**完全不注入故障**的正常玩家路径，
//     并用真实鼠标验证 M-2 告警文案指引的「设置 → 存档备份」入口是否真的可达
//     （若玩家点不到导出按钮，告警就是无效指引）。
//  2. 补主验收 B-24 暴露的覆盖缺口：B-24 只断言第二个故障周期「日志再次 +1」，
//     没有在该周期**故障期间**断言 _saveHealth().failing===true / firstAt 重新计时。
//     本脚本 F-16~F-22 逐状态核对双周期状态机。
//  3. 新增此前未截的「设置 / 存档备份」页面截图，做多视口目视。
//
// 隔离：独立 headless Edge --user-data-dir；只写该 profile 内的隔离测试数据；
//       不读取、不清空、不覆盖任何真实玩家存档；故障注入只覆盖 Storage.prototype.setItem，可完整还原。
// 运行：node tools/m1-m3-final-experience.mjs
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
const SHOTS = path.join(EVID, 'shots_final_' + TS);
fs.mkdirSync(SHOTS, { recursive: true });

const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge 可执行文件'); process.exit(2); }
const FILE_URL = encodeURI('file:///' + ROOT.replace(/\\/g, '/').replace(/^\/+/, '') + '/index.html');
const TODAY = (() => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); })();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
const results = [], pageErrors = [], consoleErrors = [], notes = [], disclosures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; results.push({ name, status: 'PASS', detail: detail || '' }); console.log('  PASS  ' + name); }
  else { fail++; results.push({ name, status: 'FAIL', detail: detail || '' }); console.error('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

const ud = path.join(EVID, 'edge-profile_final_' + TS);
fs.mkdirSync(ud, { recursive: true });
const portFile = path.join(ud, 'DevToolsActivePort');
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + ud, '--remote-debugging-port=0', 'about:blank'
], { stdio: 'ignore' });
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
let loadFired = false;
ws.onmessage = ev => {
  let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Page.loadEventFired') loadFired = true;
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails || {};
    pageErrors.push({ text: d.text || (d.exception || {}).description || 'unknown', url: d.url || null,
      frames: ((d.stackTrace && d.stackTrace.callFrames) || []).slice(0, 4).map(f => ({ url: f.url, line: f.lineNumber })) });
  }
  if (m.method === 'Log.entryAdded' && m.params.entry && m.params.entry.level === 'error') {
    const e = m.params.entry;
    consoleErrors.push({ text: String(e.text || '').slice(0, 300), url: e.url || null, source: e.source || null });
  }
};
const send = (method, params) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');

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
  return r.result && r.result.result ? r.result.result.value : undefined;
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
// 真实鼠标点击（CDP Input + elementFromPoint 命中测试），严禁用 DOM .click() 绕过命中测试
async function realClick(sel) {
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
// 只做命中测试、不真的点击（用于「点击会触发真实下载」的按钮）
async function hitTest(sel) {
  return await evalJson(`(function(){ try{
    const list=Array.from(document.querySelectorAll(${JSON.stringify(sel)}));
    for(const e of list){
      const r=e.getBoundingClientRect();
      if(r.width<2||r.height<2) continue;
      const cx=r.left+r.width/2, cy=r.top+r.height/2;
      if(cx<1||cy<1||cx>window.innerWidth-1||cy>window.innerHeight-1) continue;
      const hit=document.elementFromPoint(cx,cy);
      if(hit&&(hit===e||e.contains(hit))) return JSON.stringify({x:cx,y:cy,w:r.width,h:r.height,matched:list.length,text:(e.innerText||'').slice(0,60),hitIsTarget:true});
    }
    return JSON.stringify({err:'no-visible-match',matched:list.length});
  }catch(e){ return JSON.stringify({err:e.message}); } })()`);
}
async function modalState() {
  return await evalJson(`(function(){ try{
    const m=document.getElementById('story-modal');
    const vis=!!(m&&!m.classList.contains('hidden')&&getComputedStyle(m).display!=='none');
    return JSON.stringify({storyVisible:vis,overlays:Array.from(document.querySelectorAll('.modal')).filter(e=>!e.classList.contains('hidden')&&getComputedStyle(e).display!=='none').map(e=>e.id)});
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
}
async function cleanHall(tag) {
  await navigate(1500);
  const st = await modalState();
  if (st.storyVisible) {
    const c = await realClick('#sto-close');
    notes.push(tag + '：检测到既有 #story-modal 可见，用 CDP 真实点击「继续」关闭（未置空 Story.show/tick）→ ' + JSON.stringify(c));
    await sleep(300);
  }
  return st;
}

const report = {
  generatedAt: new Date().toISOString(), purpose: '阶段五第 9 项：最终浏览器实际体验验证 + B-24 覆盖缺口补验',
  edge: EDGE, url: FILE_URL, protocol: 'file://', profile: ud, shots: SHOTS, todayKey: TODAY,
  isolation: 'dedicated headless Edge user-data-dir; injected test save only; real player profile untouched',
  disclosures, notes, results, pageErrors, consoleErrors
};

try {
  await setViewport(1280, 800);

  // ========================= A. 正常玩家路径（完全不注入故障）=========================
  console.log('\n=== A. 正常玩家路径（无故障注入）===');
  const loaded = await navigate(1500);
  ok('F-01 file:// 双击启动：loadEventFired', loaded === true, 'loaded=' + loaded);

  const boot = await evalJson(`(function(){ try{ return JSON.stringify({
    hasXX:typeof XX==='object', hasNpcMemory:typeof window.NpcMemory==='object',
    hasRouter:typeof window.ROUTER==='object', hasDaily:typeof window.Daily==='object',
    scriptCount:document.querySelectorAll('script[src]').length,
    moduleCount:document.querySelectorAll('script[type="module"]').length,
    bodyLen:(document.body?document.body.innerText.length:0)
  }); }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('F-02 file:// 下 30 个经典脚本就绪、无 type=module（双击契约未破）',
    boot.hasXX && boot.hasNpcMemory && boot.hasRouter && boot.hasDaily && boot.scriptCount === 30 && boot.moduleCount === 0, JSON.stringify(boot));

  const seed = await evalJson(`(function(){ try{
    localStorage.setItem('xiuxian_save', JSON.stringify({rank:3,exp:5000,stone:12345,name:'最终体验测试道友',last:Date.now(),cave:2}));
    localStorage.setItem('jxwd_npc_memory_v1', JSON.stringify({day:'${TODAY}',mem:{shen_bei:[
      {text:'最终体验·旧记忆甲',day:'${TODAY}',strength:2,kind:'misc'},
      {text:'最终体验·旧记忆乙',day:'${TODAY}',strength:1,kind:'story'}]}}));
    return JSON.stringify({saveLen:localStorage.getItem('xiuxian_save').length,memLen:localStorage.getItem('jxwd_npc_memory_v1').length});
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('F-03 隔离预置旧主存档 + 旧 NPC 记忆成功（仅本 profile）', !!seed.saveLen && !!seed.memLen, JSON.stringify(seed));

  await navigate(1500);
  const afterReload = await evalJson(`(function(){ try{ return JSON.stringify({
    mem:window.NpcMemory.list('shen_bei').map(x=>x.text),
    name:XX._s.name, rank:XX._s.rank,
    health:XX._saveHealth()
  }); }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('F-04 【M-1 正常路径】刷新后 2 条旧 NPC 记忆均读回',
    Array.isArray(afterReload.mem) && afterReload.mem.includes('最终体验·旧记忆甲') && afterReload.mem.includes('最终体验·旧记忆乙'), JSON.stringify(afterReload.mem));
  ok('F-05 刷新后旧主存档逐字段读回（name/rank 未破坏）',
    afterReload.name === '最终体验测试道友' && afterReload.rank === 3, JSON.stringify({ name: afterReload.name, rank: afterReload.rank }));
  ok('F-06 正常启动时存档健康状态为 failing=false / failures=0',
    afterReload.health && afterReload.health.failing === false && afterReload.health.failures === 0, JSON.stringify(afterReload.health));

  const normalSave = await evalJson(`(function(){ try{
    const before=localStorage.getItem('xiuxian_save');
    const r=XX.save();
    const after=localStorage.getItem('xiuxian_save');
    return JSON.stringify({r,beforeLen:before.length,afterLen:after.length,wrote:(before!==after||r===true),health:XX._saveHealth()});
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('F-07 正常保存返回 true 且未触发任何失败反馈',
    normalSave.r === true && normalSave.health.failing === false, JSON.stringify(normalSave));

  // --- 验证 M-2 告警文案指引的「设置 → 存档备份」入口真实可达 ---
  console.log('\n=== A2. 真实鼠标：设置 → 存档备份（验证告警指引有效）===');
  const st1 = await cleanHall('设置路径');
  report.modalBeforeSettings = st1;
  const settingsClick = await realClick('#sc-settings');
  report.settingsClick = settingsClick;
  ok('F-08 【真实鼠标】设置入口 #sc-settings 命中且可点击',
    settingsClick.clicked === true && settingsClick.hitIsTarget === true, JSON.stringify(settingsClick));
  const settingsOpen = await evalJson(`(function(){ try{ const m=document.getElementById('settings-modal');
    return JSON.stringify({open:!!(m&&!m.classList.contains('hidden')),
      backupBtn:!!document.getElementById('m-backup'),
      backupText:(document.getElementById('m-backup')||{}).innerText||'',
      hasLabel:(m?m.innerText:'').indexOf('存档备份（换设备 / 防清缓存）')>=0});
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('F-09 设置面板已打开且存在「存档备份」按钮',
    settingsOpen.open === true && settingsOpen.backupBtn === true && /存档备份/.test(settingsOpen.backupText), JSON.stringify(settingsOpen));

  const shotSettings = await screenshot('01_settings_1280');
  ok('F-10 设置面板 1280 视口截图已保存', !!shotSettings, String(shotSettings));

  const backupClick = await realClick('#m-backup');
  report.backupClick = backupClick;
  ok('F-11 【真实鼠标】点击「存档备份 · 导出 / 导入」打开备份面板',
    backupClick.clicked === true && backupClick.hitIsTarget === true, JSON.stringify(backupClick));
  const saveModal = await evalJson(`(function(){ try{ const m=document.getElementById('save-modal');
    return JSON.stringify({open:!!(m&&!m.classList.contains('hidden')),
      downloadBtn:!!document.getElementById('sv-download'),
      copyBtn:!!document.getElementById('sv-copy'),
      lead:((m?m.innerText:'').indexOf('先导出一份')>=0)});
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('F-12 存档备份面板已打开（含「下载存档文件」与「复制存档文本」）',
    saveModal.open === true && saveModal.downloadBtn === true && saveModal.copyBtn === true, JSON.stringify(saveModal));
  const downloadHit = await hitTest('#sv-download');
  report.downloadHit = downloadHit;
  disclosures.push('#sv-download 仅做 elementFromPoint 命中测试，未真实点击 —— 避免 headless 下触发实际文件下载；已披露。');
  ok('F-13 【告警指引可落地】「下载存档文件」按钮可见且命中测试通过',
    downloadHit.hitIsTarget === true && /下载存档文件/.test(downloadHit.text || ''), JSON.stringify(downloadHit));
  const shotBackup = await screenshot('02_backup_1280');
  ok('F-14 存档备份面板 1280 视口截图已保存', !!shotBackup, String(shotBackup));

  // --- 人物页 / 识人（NPC 相关视图）---
  const st2 = await cleanHall('人物页路径');
  report.modalBeforeRole = st2;
  const roleClick = await realClick('[data-bld="role"]');
  report.roleClick = roleClick;
  ok('F-15 【真实鼠标】人物页入口命中且可点击',
    roleClick.clicked === true && roleClick.hitIsTarget === true, JSON.stringify(roleClick));
  const roleView = await evalJson(`(function(){ try{ return JSON.stringify({
    rolePanel:!!document.querySelector('.panel-page[data-panel="role"]'),
    hasRoleNpc:(document.body.innerText||'').indexOf('识人')>=0,
    textLen:(document.body.innerText||'').length }); }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('F-16 人物页视图打开且含「识人」栏目（NPC 交互入口未受影响）',
    roleView.rolePanel === true && roleView.hasRoleNpc === true, JSON.stringify(roleView));

  await setViewport(360, 780);
  const shotNarrow = await screenshot('03_settings_360');
  ok('F-17 360 窄视口截图已保存', !!shotNarrow, String(shotNarrow));
  const overflow = await evalJson(`(function(){ try{ return JSON.stringify({
    scrollW:document.documentElement.scrollWidth,clientW:document.documentElement.clientWidth,
    bodyScrollW:document.body.scrollWidth}); }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  report.narrowOverflow = overflow;
  notes.push('360 视口溢出测量：' + JSON.stringify(overflow) + '（本轮未改 CSS/layout，仅记录）');
  await setViewport(1280, 800);

  // ========================= B. 双周期故障状态机细查（补 B-24 缺口）=========================
  console.log('\n=== B. 双周期故障状态机细查（补 B-24 未断言的「故障期间」状态）===');
  disclosures.push('B 段故障注入仍是覆盖 Storage.prototype.setItem（仅对 xiuxian_save 抛错）的模拟，不等于真实磁盘配额满；已披露，与主验收口径一致。');
  const cycle = await evalJson(`(function(){ try{
    const KEY='xiuxian_save';
    const orig=Storage.prototype.setItem;
    const fails=(XX._s.log||[]).filter(x=>String(x.t).indexOf('存档写入失败')>=0).length;
    const recovers=(XX._s.log||[]).filter(x=>String(x.t).indexOf('存档写入已恢复')>=0).length;
    const raw0=localStorage.getItem(KEY);
    const inject=function(k,v){ if(k===KEY) throw new Error('injected-final-experience'); return orig.call(this,k,v); };

    // 周期 1：注入 → 故障期间读状态（B-24 缺的就是这个）
    Storage.prototype.setItem=inject;
    const r1=XX.save();
    const during1=XX._saveHealth();
    const toast1=(document.getElementById('toast')||{}).innerText||'';
    const log1=(XX._s.log||[]).filter(x=>String(x.t).indexOf('存档写入失败')>=0).length;
    const rawDuring1=localStorage.getItem(KEY);
    Storage.prototype.setItem=orig;
    const after1=XX.save();
    const health1=XX._saveHealth();
    const recover1=(XX._s.log||[]).filter(x=>String(x.t).indexOf('存档写入已恢复')>=0).length;
    const firstAt1=health1.firstAt;

    // 周期 2：再注入 → 故障期间读状态 + 计时是否更新
    Storage.prototype.setItem=inject;
    const r2=XX.save();
    const during2=XX._saveHealth();
    const log2=(XX._s.log||[]).filter(x=>String(x.t).indexOf('存档写入失败')>=0).length;
    const rawDuring2=localStorage.getItem(KEY);
    Storage.prototype.setItem=orig;
    const after2=XX.save();
    const health2=XX._saveHealth();
    const recover2=(XX._s.log||[]).filter(x=>String(x.t).indexOf('存档写入已恢复')>=0).length;

    return JSON.stringify({fails,recovers,raw0Len:(raw0||'').length,
      c1:{r:r1,during:during1,toast:toast1,log:log1,rawUnchanged:rawDuring1===raw0,after:after1,health:health1,recover:recover1,firstAt:firstAt1},
      c2:{r:r2,during:during2,log:log2,rawUnchanged:rawDuring2!==null,after:after2,health:health2,recover:recover2},
      restored:(Storage.prototype.setItem===orig)});
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  report.cycles = cycle;
  ok('F-18 【补 B-24】周期 1 故障期间 failing===true 且 firstAt>0',
    cycle.c1 && cycle.c1.r === false && cycle.c1.during.failing === true && cycle.c1.during.firstAt > 0, JSON.stringify(cycle.c1 && cycle.c1.during));
  ok('F-19 周期 1 期间：失败日志恰好 1 条 + toast 可见 + 旧存档字节不变',
    cycle.c1 && cycle.c1.log === 1 && /存档写入失败/.test(cycle.c1.toast) && cycle.c1.rawUnchanged === true, JSON.stringify(cycle.c1 && { log: cycle.c1.log, toast: cycle.c1.toast, rawUnchanged: cycle.c1.rawUnchanged }));
  ok('F-20 周期 1 恢复后 failing===false 且写了一条恢复日志',
    cycle.c1 && cycle.c1.after === true && cycle.c1.health.failing === false && cycle.c1.recover === 1, JSON.stringify(cycle.c1 && { after: cycle.c1.after, health: cycle.c1.health, recover: cycle.c1.recover }));
  ok('F-21 【补 B-24 核心】周期 2 故障期间 failing===true（不是永久静默）',
    cycle.c2 && cycle.c2.r === false && cycle.c2.during.failing === true, JSON.stringify(cycle.c2 && cycle.c2.during));
  ok('F-22 【补 B-24 核心】周期 2 firstAt 重新计时（> 周期 1）',
    cycle.c2 && cycle.c2.during.firstAt > cycle.c1.firstAt, JSON.stringify({ c1: cycle.c1 && cycle.c1.firstAt, c2: cycle.c2 && cycle.c2.during.firstAt }));
  ok('F-23 周期 2 失败日志再次 +1，恢复后 failing===false 且恢复日志 +1',
    cycle.c2 && cycle.c2.log === 2 && cycle.c2.after === true && cycle.c2.health.failing === false && cycle.c2.recover === 2,
    JSON.stringify(cycle.c2 && { log: cycle.c2.log, after: cycle.c2.after, failing: cycle.c2.health.failing, recover: cycle.c2.recover }));
  ok('F-24 故障注入已完全还原（Storage.prototype.setItem 复原）', cycle.restored === true, JSON.stringify({ restored: cycle.restored }));

  await navigate(1500);
  const finalState = await evalJson(`(function(){ try{ return JSON.stringify({
    mem:window.NpcMemory.list('shen_bei').map(x=>x.text), name:XX._s.name,
    health:XX._saveHealth(), saveLen:(localStorage.getItem('xiuxian_save')||'').length });
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  ok('F-25 双周期故障后刷新：NPC 记忆与主存档仍连续完好',
    finalState.name === '最终体验测试道友' && Array.isArray(finalState.mem) && finalState.mem.length >= 2 && finalState.health.failures === 0, JSON.stringify(finalState));

  // ============ D. 复审补验：备份导出的真实数据源 / 双通道独立 / 启动路径唯一性 ============
  console.log('\n=== D. 复审补验（R-09 / R-10 / R-11 / N4）===');
  disclosures.push('D 段为验证「写盘失败时告警指引的备份是否包含未落盘内存态」，临时替换 Storage.prototype.setItem、URL.createObjectURL、HTMLAnchorElement.prototype.click，测试后全部还原；属于对原始产品行为的模拟，已披露。');

  const st3 = await cleanHall('备份导出路径');
  report.modalBeforeBackup2 = st3;
  await evalJs(`(function(){ try{
    window.__m1m3 = {
      origSet: Storage.prototype.setItem, origCreate: URL.createObjectURL,
      origClick: HTMLAnchorElement.prototype.click, blobs: [],
      stone: XX._s.stone, name: XX._s.name,
      mainBefore: localStorage.getItem('xiuxian_save')
    };
    Storage.prototype.setItem = function(k,v){ if(k==='xiuxian_save') throw new Error('injected-backup-verify'); return window.__m1m3.origSet.call(this,k,v); };
    URL.createObjectURL = function(b){ window.__m1m3.blobs.push(b); return 'blob:m1m3-verify'; };
    HTMLAnchorElement.prototype.click = function(){};   // 阻止 headless 下真实文件下载
    return true;
  }catch(e){ return false; } })()`);
  const sClick = await realClick('#sc-settings');
  const bClick = await realClick('#m-backup');
  // 只在内存里推进进度；此时主档写盘被注入为失败
  await evalJs(`(function(){ XX._s.stone = 999888.5; XX._s.name = '内存态最新进度'; return true; })()`);
  const dClick = await realClick('#sv-download');
  await sleep(400);
  const backupVerify = await evalJson(`(async function(){ try{
    const m = window.__m1m3;
    const text = m.blobs.length ? await m.blobs[0].text() : '';
    let obj = {}; try{ obj = JSON.parse(text); }catch(e){}
    const diskNow = localStorage.getItem('xiuxian_save');
    const health = XX._saveHealth();
    Storage.prototype.setItem = m.origSet;
    URL.createObjectURL = m.origCreate;
    HTMLAnchorElement.prototype.click = m.origClick;
    XX._s.stone = m.stone; XX._s.name = m.name;
    const out = { exportedStone: obj.stone, exportedName: obj.name,
      hasLatest: obj.stone === 999888.5 && obj.name === '内存态最新进度',
      diskUnchanged: diskNow === m.mainBefore, failingDuring: health.failing, blobs: m.blobs.length };
    delete window.__m1m3;
    return JSON.stringify(out);
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  report.backupVerify = backupVerify;
  report.backupClicks = { settings: sClick, backup: bClick, download: dClick };
  ok('F-26 【R-10 真实鼠标】设置 → 存档备份 → 下载存档文件 全链路命中且可点击',
    sClick.clicked === true && bClick.clicked === true && dClick.clicked === true && dClick.hitIsTarget === true,
    JSON.stringify({ s: sClick.clicked, b: bClick.clicked, d: dClick.clicked, hit: dClick.hitIsTarget }));
  ok('F-27 【R-09 核心】写盘失败时导出的备份包含最新内存态进度（不是磁盘旧档）',
    backupVerify.hasLatest === true && backupVerify.blobs >= 1, JSON.stringify(backupVerify));
  ok('F-28 【R-09 佐证】故障注入期间磁盘旧主档字节未被改动，且告警状态确实为 failing',
    backupVerify.diskUnchanged === true && backupVerify.failingDuring === true, JSON.stringify(backupVerify));

  // R-11：主档写失败时，NPC 独立键仍应独立写入成功，两通道不互污
  const dual = await evalJson(`(function(){ try{
    const KEY='xiuxian_save', MKEY='jxwd_npc_memory_v1';
    const orig=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){ if(k===KEY) throw new Error('injected-dual'); return orig.call(this,k,v); };
    const mainBefore=localStorage.getItem(KEY), memBefore=localStorage.getItem(MKEY);
    const saveRet=XX.save();
    const r=window.NpcMemory.record('shen_bei','双通道隔离测试记忆','misc');
    const memAfter=localStorage.getItem(MKEY), mainAfter=localStorage.getItem(KEY);
    Storage.prototype.setItem=orig;
    let hasNew=false; try{ hasNew=JSON.parse(memAfter).mem.shen_bei.some(x=>x.text==='双通道隔离测试记忆'); }catch(e){}
    return JSON.stringify({ saveRet, mainUnchanged:mainBefore===mainAfter, memChanged:memBefore!==memAfter,
      memHasNew:hasNew, recordOk:!!(r&&r.ok===true) });
  }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  report.dualChannel = dual;
  ok('F-29 【R-11】主档写失败时 NPC 独立键仍成功写入，两通道失败不互污',
    dual.saveRet === false && dual.mainUnchanged === true && dual.memChanged === true && dual.memHasNew === true && dual.recordOk === true, JSON.stringify(dual));

  // N4：真实启动路径的 init 唯一性（仅测试环境计数，不加入产品全局对象）
  const initProbe = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
(function(){
  var _m;
  window.__m1m3InitCalls = 0;
  Object.defineProperty(window, 'NpcMemory', {
    configurable: true,
    get: function(){ return _m; },
    set: function(v){
      _m = v;
      if (v && typeof v.init === 'function' && !v.__m1m3Counted) {
        var orig = v.init;
        v.init = function(){ window.__m1m3InitCalls++; return orig.apply(this, arguments); };
        Object.defineProperty(v, '__m1m3Counted', { value: true, enumerable: false });
      }
    }
  });
})();` });
  const initScriptId = initProbe.result && initProbe.result.identifier;
  await navigate(1500);
  const bootOnce = await evalJson(`(function(){ try{ return JSON.stringify({
    initCalls: window.__m1m3InitCalls, hasXX: typeof XX === 'object',
    hasMem: !!(window.NpcMemory && window.NpcMemory.list),
    memCount: window.NpcMemory ? window.NpcMemory.list('shen_bei').length : -1
  }); }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  const bootTwice = await evalJson(`(function(){ try{ XX.boot(); XX.boot(); return JSON.stringify({ initCalls: window.__m1m3InitCalls }); }catch(e){ return JSON.stringify({except:e.message}); } })()`);
  if (initScriptId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initScriptId });
  await navigate(1200);   // 恢复为未插桩的原始产品代码后再做异常分类
  report.initUniqueness = { bootOnce, bootTwice };
  ok('F-30 【N4】真实 file:// 启动路径中 NpcMemory.init() 恰好执行 1 次，且旧记忆已读回',
    bootOnce.initCalls === 1 && bootOnce.hasXX === true && bootOnce.hasMem === true && bootOnce.memCount >= 2, JSON.stringify(bootOnce));
  ok('F-31 【N4】重复调用 XX.boot() 不会再次触发 init（inited + npcMemInited 双守卫）',
    bootTwice.initCalls === 1, JSON.stringify(bootTwice));

  // ========================= C. 异常分类 =========================
  console.log('\n=== C. 异常分类（如实记录，不粉饰）===');
  const patchRelated = pageErrors.filter(e => /game\.js|npc_memory\.js/.test([e.url, ...(e.frames || []).map(f => f.url)].join(' ')));
  const nonResource = consoleErrors.filter(e => !/net::ERR_/.test(e.text || ''));
  report.errorClassification = { patchRelated, nonResource,
    pageErrorCount: pageErrors.length, consoleErrorCount: consoleErrors.length };
  ok('F-32 【分类】无来自本轮修改文件（game.js / npc_memory.js）的未捕获异常', patchRelated.length === 0, JSON.stringify(patchRelated));
  ok('F-33 【分类】console error 全部为资源/网络类（net::ERR_*），无 JS 语法/类型错误', nonResource.length === 0, JSON.stringify(nonResource));
  notes.push('既有环境噪声：audio.js 的 NotSupportedError、缺失 wav 的 ERR_FILE_NOT_FOUND、宗门服务 ERR_CONNECTION_REFUSED；已由 04_baseline_control_results.json 证明修改前既有，本脚本不重复做严格断言。');

} catch (e) {
  fail++;
  results.push({ name: 'F-xx 脚本运行异常', status: 'FAIL', detail: e.stack || e.message });
  console.error('脚本异常: ' + (e.stack || e.message));
} finally {
  report.total = pass + fail; report.pass = pass; report.fail = fail;
  report.fileHashes = {};
  for (const f of ['js/game.js', 'js/npc_memory.js', 'index.html', 'js/daily.js', 'js/story.js', 'js/router.js']) {
    try { report.fileHashes[f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex'); } catch (e) {}
  }
  const out = path.join(EVID, '08_final_experience_results.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2), 'utf8');
  console.log('\n=== 最终体验验证：' + pass + ' PASS / ' + fail + ' FAIL（共 ' + (pass + fail) + '）===');
  console.log('证据: ' + out);
  console.log('截图: ' + SHOTS);
  try { ws.close(); } catch (e) {}
  try { edge.kill(); } catch (e) {}
  await sleep(300);
  process.exit(fail === 0 ? 0 : 1);
}
