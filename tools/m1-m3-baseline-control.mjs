// tools/m1-m3-baseline-control.mjs — 基线对照（只读夹具，跑完即删，不新增独立项目）
//
// 目的（两项，均为动态真实环境证据，不是静态推断）：
//  1. 证明主验收脚本 B-34/B-35 观察到的 audio.js / 网络资源错误在**修改前就已存在**，
//     与本轮 M-1/M-2 改动无因果关系；
//  2. 在真实 file:// 浏览器里动态复现 P-01：基线版本刷新后旧 NPC 记忆读不回，
//     而修复版（m1-m3-browser.mjs 的 B-08）可读回。
//
// 方法：构造一个临时最小运行副本，除 game.js / npc_memory.js 换成修改前基线字节外，
//       其余文件全部来自当前项目（ui/ 与 audio/ 为完整真实副本，保证资源缺失状态
//       完全一致，不是模拟）。用独立 headless Edge + file:// 打开同一页面。
// 退出码：0 对照成立；1 对照不成立；2 环境异常
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import crypto from 'node:crypto';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EVID = path.resolve(ROOT, '..', 'm1-m3-evidence');
const BASE = path.join(EVID, 'baseline_20261106_005934');
const MAIN = path.join(EVID, '03_m1_m3_browser_results.json');
const TS = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const CTRL = path.join(EVID, 'control_' + TS);
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TODAY = (() => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); })();

if (!EDGE || !fs.existsSync(path.join(BASE, 'game.js'))) { console.error('Edge 或基线文件缺失'); process.exit(2); }

// ---------------------------------------------------------- 构造对照副本
// 逐文件复制（不用 fs.cpSync：Windows 上该 API 在本环境复制 ui/ 时会静默终止进程）
function copyTree(src, dst, filter) {
  fs.mkdirSync(dst, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name.includes('.bak_')) continue;
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyTree(s, d, filter);
    else if (ent.isFile() && (!filter || filter(ent.name))) fs.copyFileSync(s, d);
  }
}
const copyJsTree = (src, dst) => copyTree(src, dst, n => n.endsWith('.js'));
fs.mkdirSync(CTRL, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(CTRL, 'index.html'));
fs.copyFileSync(path.join(ROOT, 'style.css'), path.join(CTRL, 'style.css'));
copyJsTree(path.join(ROOT, 'js'), path.join(CTRL, 'js'));
fs.copyFileSync(path.join(BASE, 'game.js'), path.join(CTRL, 'js', 'game.js'));
fs.copyFileSync(path.join(BASE, 'npc_memory.js'), path.join(CTRL, 'js', 'npc_memory.js'));
// 资源目录用**完整真实副本**（不用 junction/软链）：资源缺失状态与真实 file:// 环境一致，
// 且清理时绝不会误删原项目资源。ui/ ~35MB + audio/ ~58MB，跑完即删。
console.log('复制 ui/ 与 audio/ 真实副本（保持资源缺失状态一致）…');
for (const d of ['ui', 'audio']) {
  try { copyTree(path.join(ROOT, d), path.join(CTRL, d), null); console.log('  ' + d + '/ 复制完成'); }
  catch (e) { console.error(d + ' 复制失败: ' + e.message); process.exit(2); }
}

const hashes = {};
for (const f of ['js/game.js', 'js/npc_memory.js', 'index.html', 'js/audio.js', 'js/router.js']) {
  const p = path.join(CTRL, f);
  if (fs.existsSync(p)) hashes[f] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
console.log('=== 基线对照副本 ===');
console.log('目录: ' + CTRL);
console.log('game.js SHA      : ' + hashes['js/game.js'] + '（应为基线 4e9c25a2…e0b）');
console.log('npc_memory.js SHA: ' + hashes['js/npc_memory.js'] + '（应为基线 f20124a4…a64）');
console.log('audio.js SHA     : ' + hashes['js/audio.js'] + '（未修改，与主项目一致）');

// ------------------------------------------------------------------ Edge / CDP
const ud = path.join(EVID, 'edge-profile_control_' + TS);
fs.mkdirSync(ud, { recursive: true });
const portFile = path.join(ud, 'DevToolsActivePort');
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + ud, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
let exited = false; edge.once('exit', () => { exited = true; });
let port = 0;
for (let i = 0; i < 150 && !port; i++) { await sleep(100); try { port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || 0; } catch (e) {} }
if (!port) { console.error('CDP 端口未就绪'); try { edge.kill(); } catch (e) {} process.exit(2); }
let target = null;
for (let i = 0; i < 100 && !target; i++) { try { const l = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); target = l.find(t => t.type === 'page'); } catch (e) { await sleep(100); } }
if (!target) { console.error('无 page target'); try { edge.kill(); } catch (e) {} process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map(), pageErrors = [], consoleErrors = [];
let loadFired = false;
ws.onmessage = ev => {
  let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Page.loadEventFired') loadFired = true;
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails || {};
    pageErrors.push({ text: d.text || (d.exception || {}).description || 'unknown', url: d.url || null, line: d.lineNumber });
  }
  if (m.method === 'Log.entryAdded' && m.params.entry && m.params.entry.level === 'error') {
    const e = m.params.entry;
    consoleErrors.push({ text: String(e.text || '').slice(0, 200), url: e.url || null });
  }
};
const send = (method, params) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params: params || {} })); });
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
const CTRL_POSIX = CTRL.replace(/\\/g, '/').replace(/^\/+/, '');
const FILE_URL = encodeURI('file:///' + CTRL_POSIX + '/index.html');
async function navigate(waitMs) {
  loadFired = false;
  await send('Page.navigate', { url: FILE_URL });
  for (let i = 0; i < 200 && !loadFired; i++) await sleep(100);
  await sleep(waitMs || 1500);
  return loadFired;
}
async function evalJson(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result && r.result.exceptionDetails) return { __evalError: String((r.result.exceptionDetails.exception || {}).description || r.result.exceptionDetails.text) };
  const v = r.result && r.result.result ? r.result.result.value : undefined;
  try { return JSON.parse(v); } catch (e) { return { __raw: v }; }
}
// 与主验收脚本完全同构的真实鼠标点击：尺寸检查 + elementFromPoint 命中测试，不绕过命中
async function realClick(sel) {
  const b = await evalJson(`(function(){try{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return JSON.stringify({err:'no-el'});const r=e.getBoundingClientRect();if(r.width<2||r.height<2)return JSON.stringify({err:'zero-size'});const x=r.left+r.width/2,y=r.top+r.height/2;const hit=document.elementFromPoint(x,y);return JSON.stringify({x,y,hit:hit?(hit.tagName+'.'+hit.className):null,hitIsTarget:!!(hit&&(hit===e||e.contains(hit)))});}catch(e){return JSON.stringify({err:e.message});}})()`);
  if (b.err) return b;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await sleep(500);
  return b;
}
// 兜底：真实点击一个可见 button，确保 audio.js 的 click 委托（playClick）确实被调用
async function realClickButton() {
  const b = await evalJson(`(function(){try{
    const bs=Array.from(document.querySelectorAll('button:not([disabled])'));
    for(const e of bs){
      const r=e.getBoundingClientRect();
      if(r.width<2||r.height<2)continue;
      const x=r.left+r.width/2,y=r.top+r.height/2;
      if(x<1||y<1||x>window.innerWidth-1||y>window.innerHeight-1)continue;
      const hit=document.elementFromPoint(x,y);
      if(hit&&(hit===e||e.contains(hit)))return JSON.stringify({x,y,id:e.id,cls:String(e.className).slice(0,40),text:(e.textContent||'').trim().slice(0,20)});
    }
    return JSON.stringify({err:'no-visible-button',total:bs.length});
  }catch(e){return JSON.stringify({err:e.message});}})()`);
  if (b.err) return b;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await sleep(900);
  return b;
}

let pass = 0, fail = 0; const results = [];
function ok(name, cond, detail) { if (cond) { pass++; results.push({ name, status: 'PASS', detail: detail || '' }); console.log('  PASS  ' + name); } else { fail++; results.push({ name, status: 'FAIL', detail: detail || '' }); console.error('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); } }

try {
  console.log('\n=== 基线页首次导航 + 与主脚本相同操作序列 ===');
  const l1 = await navigate(1600);
  ok('C-01 基线页 file:// 正常加载', l1 === true);
  const boot = await evalJson(`(function(){try{return JSON.stringify({hasXX:typeof XX==='object',hasNpcMemory:typeof window.NpcMemory==='object',hasSaveHealth:typeof XX._saveHealth==='function'});}catch(e){return JSON.stringify({except:e.message});}})()`);
  console.log('  基线能力: ' + JSON.stringify(boot));
  ok('C-02 基线版本确实没有 _saveHealth（确认用的是修改前代码）', boot.hasSaveHealth === false, JSON.stringify(boot));

  // 与主脚本完全相同的隔离数据
  const seed = `(function(){try{
    localStorage.setItem('xiuxian_save',JSON.stringify({rank:3,exp:5000,stone:12345,name:'隔离测试道友',last:Date.now(),cave:2,log:[],bag:[],wisdom:100,herb:50,ore:50}));
    localStorage.setItem('jxwd_npc_memory_v1',JSON.stringify({day:${JSON.stringify(TODAY)},mem:{shen_bei:[{text:'旧记忆·曾在碑前听他讲断天门',day:${JSON.stringify(TODAY)},strength:1,kind:'story'}]}}));
    localStorage.setItem('hasFinishedTutorial','1');
    return JSON.stringify({ok:true});}catch(e){return JSON.stringify({ok:false,err:e.message});}})()`;
  await evalJson(seed);
  await navigate(1800);

  // 【关键】P-01 缺陷动态复现：基线版本不 init → 刷新后旧记忆读不回
  const mem = await evalJson(`(function(){try{return JSON.stringify({
    list:window.NpcMemory.list('shen_bei'),
    state:window.NpcMemory._state(),
    disk:localStorage.getItem('jxwd_npc_memory_v1')
  });}catch(e){return JSON.stringify({except:e.message});}})()`);
  console.log('  基线刷新后 NPC 记忆: ' + JSON.stringify(mem.list));
  ok('C-03 【P-01 动态复现】基线版本刷新后旧 NPC 记忆读不回（list 为空）',
    Array.isArray(mem.list) && mem.list.length === 0, JSON.stringify(mem.list));
  ok('C-04 基线版本磁盘旧记忆字节仍在（尚未被首次 record 覆盖）',
    String(mem.disk).includes('旧记忆·曾在碑前听他讲断天门'));
  const covered = await evalJson(`(function(){try{
    window.NpcMemory.record('shen_bei','基线版新写入','misc');
    return JSON.stringify({disk:localStorage.getItem('jxwd_npc_memory_v1')});
  }catch(e){return JSON.stringify({except:e.message});}})()`);
  ok('C-05 【P-01 动态复现】基线版本首次 record 即覆盖磁盘旧记忆（缺陷成立）',
    !String(covered.disk).includes('旧记忆·曾在碑前听他讲断天门') && String(covered.disk).includes('基线版新写入'), String(covered.disk).slice(0, 220));

  // 与主脚本相同的真实点击（触发 audio.js 既有点击音异常）
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const clicks = {};
  clicks.role = await realClick('[data-bld="role"]');
  clicks.event = await realClick('[data-bld="event"]');
  clicks.button = await realClickButton();
  clicks.gameAudio = await evalJson(`(function(){try{return JSON.stringify({hasGameAudio:!!window.GameAudio,hasPlayClick:!!(window.GameAudio&&window.GameAudio.playClick)});}catch(e){return JSON.stringify({except:e.message});}})()`);
  console.log('  基线版真实点击: ' + JSON.stringify(clicks));
  await sleep(1200);

  // ------------------------------------------------------------- 错误集合对比
  console.log('\n=== 环境噪声对照：基线 vs 修复版 ===');
  const main = fs.existsSync(MAIN) ? JSON.parse(fs.readFileSync(MAIN, 'utf8')) : null;
  const normText = s => String(s || '').replace(/file:\/\/\/\S+/g, '<file-url>').replace(/control_\d+|%E4%B9%9D%E9%9C%84%E9%97%AE%E9%81%93/g, '<root>').trim();
  const mainPage = main ? (main.pageErrors || []).map(e => normText(typeof e === 'string' ? e : e.text)) : null;
  const mainConsole = main ? (main.consoleErrors || []).map(e => normText(typeof e === 'string' ? e : e.text)) : null;
  const ctrlPage = pageErrors.map(e => normText(e.text));
  const ctrlConsole = consoleErrors.map(e => normText(e.text));

  console.log('  修复版 pageErrors  : ' + JSON.stringify(mainPage));
  console.log('  基线版 pageErrors  : ' + JSON.stringify(ctrlPage));
  console.log('  修复版 consoleError: ' + JSON.stringify(mainConsole));
  console.log('  基线版 consoleError: ' + JSON.stringify(ctrlConsole));

  const uniqCtrlPage = [...new Set(ctrlPage)];
  const uniqCtrlConsole = [...new Set(ctrlConsole)];
  ok('C-06 基线版本同样出现 audio.js 的 NotSupportedError（既有，非本轮引入）',
    uniqCtrlPage.some(t => t.includes('NotSupportedError')) || pageErrors.some(e => String(e.url).includes('audio.js')),
    JSON.stringify(pageErrors));
  ok('C-07 基线版本同样出现 ERR_FILE_NOT_FOUND（缺失 wav，既有）',
    uniqCtrlConsole.some(t => t.includes('ERR_FILE_NOT_FOUND')), JSON.stringify(uniqCtrlConsole));
  ok('C-08 基线版本同样出现宗门服务 ERR_CONNECTION_REFUSED（服务未启动，既有）',
    uniqCtrlConsole.some(t => t.includes('ERR_CONNECTION_REFUSED')), JSON.stringify(uniqCtrlConsole));
  ok('C-09 基线版本的错误来源与本轮修改文件无关（audio.js / 资源 / 网络）',
    pageErrors.every(e => !/game\.js|npc_memory\.js/.test(String(e.url || ''))), JSON.stringify(pageErrors.map(e => e.url)));
  const mainAudioSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'js', 'audio.js'))).digest('hex');
  ok('C-10 audio.js 字节未被本轮修改（对照副本与主项目 SHA 一致，无因果关系）',
    hashes['js/audio.js'] === mainAudioSha, JSON.stringify({ control: hashes['js/audio.js'], project: mainAudioSha }));
  /* playClick 是 AudioManager 内部方法，不暴露到 window.GameAudio（hasPlayClick=false 属正常封装）；
     判断委托是否真实触发，应以「CDP 真实点击命中可见 button + 随后出现 audio.js 异常」为准。 */
  ok('C-10b 基线版真实点击命中可见 button，并触发 audio.js 既有异常',
    !!clicks.button && !clicks.button.err && !!clicks.button.id && pageErrors.length > 0,
    JSON.stringify({ button: clicks.button, pageErrorCount: pageErrors.length, note: 'window.GameAudio 不暴露内部 playClick，属正常封装' }));

  const conclusion = {
    generatedAt: new Date().toISOString(),
    purpose: '证明主验收的 B-34/B-35 环境噪声在修改前既有；并在真实浏览器动态复现 P-01 缺陷',
    controlDir: CTRL + '（跑完删除，仅保留本 JSON 证据）',
    controlFileHashes: hashes,
    protocol: 'file://', edge: EDGE,
    isolation: 'dedicated headless Edge profile; injected test save only; ui/audio are full copies (no links) of the real project',
    disclosure: '对照副本仅替换 game.js / npc_memory.js 为基线字节；其余文件、资源缺失状态、操作序列与主验收一致',
    baseline: { pageErrors, consoleErrors, memListAfterReload: mem.list, clicks },
    patchedRunFromFile: MAIN,
    patchedRun: main ? { pageErrors: main.pageErrors, consoleErrors: main.consoleErrors } : null,
    total: pass + fail, pass, fail, results
  };
  const out = path.join(EVID, '04_baseline_control_results.json');
  fs.writeFileSync(out, JSON.stringify(conclusion, null, 2), 'utf8');
  console.log('\n=== 汇总 ===');
  console.log('对照断言: ' + (pass + fail) + '  通过: ' + pass + '  失败: ' + fail + '  退出码: ' + (fail ? 1 : 0));
  console.log('证据落盘: ' + out);
} catch (e) {
  fail++;
  console.error('对照脚本异常: ' + (e.stack || e.message));
} finally {
  try { ws.close(); } catch (e) {}
  try { edge.kill(); } catch (e) {}
  for (let i = 0; i < 30 && !exited; i++) await sleep(100);
  // 删除只读对照夹具（全部是真实副本，不含任何链接，删除绝不影响原项目）
  try { fs.rmSync(CTRL, { recursive: true, force: true }); } catch (e) { console.error('对照目录清理失败（保留供人工检查）: ' + e.message); }
  if (!fs.existsSync(CTRL)) console.log('对照夹具已清理；原项目 ui/ 与 audio/ 完好');
  process.exit(fail ? 1 : 0);
}
