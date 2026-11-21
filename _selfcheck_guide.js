'use strict';
/* Node 仿真自检：纯 Node 环境 stub window/document/timer，加载 js/guide_taixu.js，
 * 验证 R1–R6 / C1–C5 关键行为在修复后未回归。
 * 说明：军规2（真实点击成功率）与渲染层表现由 Muse 侧聊实机补验，本脚本只验证逻辑状态机。 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const FILE = path.join(__dirname, 'js/guide_taixu.js');
if (!fs.existsSync(FILE)) { console.error('MISSING ' + FILE); process.exit(2); }
const code = fs.readFileSync(FILE, 'utf8');

let PASS = 0, FAIL = 0;
const fails = [];
function ok(name, cond) {
  if (cond) { PASS++; console.log('  PASS  ' + name); }
  else { FAIL++; fails.push(name); console.log('  FAIL  ' + name); }
}

/* 受控定时器：setTimeout 入队，手动 runAllTimeouts 触发；clearTimeout 删除 */
let _tid = 0; const _to = {};
function setTimeoutStub(fn) { const id = ++_tid; _to[id] = fn; return id; }
function clearTimeoutStub(id) { delete _to[id]; }
function setIntervalStub() { return 1; }
function clearIntervalStub() {}
function runAllTimeouts() {
  const ids = Object.keys(_to);
  for (const id of ids) { const fn = _to[id]; delete _to[id]; try { fn(); } catch (e) { console.log('  [timeout err] ' + e.message); } }
}
function clearTimeouts() { for (const k in _to) delete _to[k]; }

function makeEl(tag) {
  const el = {
    tagName: tag, style: {}, dataset: {}, _classes: new Set(),
    _text: '', _children: [],
    classList: {
      add(c) { el._classes.add(c); },
      remove(c) { el._classes.delete(c); },
      contains(c) { return el._classes.has(c); }
    },
    set textContent(v) { el._text = v; },
    get textContent() { return el._text; },
    addEventListener() {},
    appendChild(c) { el._children.push(c); if (c) c.parentNode = el; if (c && c.id === 'taixu-bubble') document._bubble = c; },
    removeChild(c) { el._children = el._children.filter(x => x !== c); if (c && c === document._bubble) document._bubble = null; if (c) c.parentNode = null; },
    getBoundingClientRect() { return { width: 100, height: 30, left: 50, top: 50 }; },
    querySelector(sel) {
      if (sel === '.tb-text') return el._tbText || (el._tbText = makeEl('div'));
      if (sel === '.tb-skip') return el._tbSkip || (el._tbSkip = makeEl('button'));
      return null;
    }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._innerHTML || ''; },
    set(v) { el._innerHTML = v; if (!el._tbText) el._tbText = makeEl('div'); if (!el._tbSkip) el._tbSkip = makeEl('button'); }
  });
  return el;
}

let document, window, logCalls, saveCount, addItemResult, S;

function freshEnv(opts) {
  opts = opts || {};
  logCalls = []; saveCount = 0; addItemResult = opts.addItemResult !== false;
  S = {
    stats: { sit: 0 }, rank: 0, plots: [],
    npcs: { stele: { met: 0 } }, bag: [],
    guide: opts.guide || null
  };
  const bodyEl = makeEl('body');
  document = {
    body: bodyEl, head: makeEl('head'), _bubble: null,
    getElementById(id) {
      if (id === 'taixu-bubble') return document._bubble || null;
      return null;
    },
    createElement(t) { return makeEl(t); },
    querySelector() { return makeEl('div'); }
  };
  window = {
    S, innerWidth: 1280, innerHeight: 800,
    saveGame() { saveCount++; },
    addItem(id, name) { if (!addItemResult) return false; S.bag.push({ id, name }); return true; },
    log() { logCalls.push(Array.prototype.slice.call(arguments)); },
    Guide: null,
    addEventListener() {}
  };
  clearTimeouts();
  const sandbox = {
    window, document, console,
    setTimeout: setTimeoutStub, clearTimeout: clearTimeoutStub,
    setInterval: setIntervalStub, clearInterval: clearIntervalStub,
    Math, Date, JSON
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

console.log('\n== 仿真自检开始 ==');

/* 1. 老玩家误判（有进度但从未启动引导 → 不应启动） */
console.log('\n[1] R1 老玩家识别');
freshEnv({ guide: null });
S.rank = 1; // 业务进度，但 guide 为 null（从未启动）
window.Guide.init();
ok('有进度未启动 → 不创建气泡', document._bubble === null);

/* 2. 全新玩家：7 步全推进到 done + 丹药原子发放 + 追叙 persist */
console.log('\n[2] 全流程 + R4 追叙即时持久化 + 丹药原子');
freshEnv({ guide: null });
window.Guide.init();
ok('新玩家启动引导(气泡已建)', document._bubble !== null);
ok('初始 step=0', window.Guide._state().step === 0);
runAllTimeouts(); // enter 步 auto 推进
ok('enter 自动推进到 step1', window.Guide._state().step === 1);
S.stats.sit = 1; window.Guide.complete('sit');
ok('sit 完成 → step2', window.Guide._state().step === 2);
S.rank = 1;
const scBefore = saveCount;
window.Guide.complete('brk'); // 有 after 追叙
const st2 = window.Guide._state();
ok('brk 完成标记已写', st2.flags['c_brk'] === true);
ok('brk 完成后立即 persist(R4)', saveCount > scBefore);
runAllTimeouts(); // after 回调 → 推进 step3
ok('brk after 追叙后推进到 step3', window.Guide._state().step === 3);
S.plots = [{}]; window.Guide.complete('field');
ok('field 完成 → step4(bag)', window.Guide._state().step === 4);
const bagSt = window.Guide._state();
ok('bag 步入场即发丹(凭证已写)', bagSt.rewardClaims['taixu_intro_dan_v1'] === true);
ok('背包恰有1颗下品聚气丹', S.bag.length === 1);
runAllTimeouts(); // bag auto → step5
ok('bag 自动推进 step5', window.Guide._state().step === 5);
runAllTimeouts(); // flash auto → step6
ok('flash 自动推进 step6', window.Guide._state().step === 6);
S.npcs.stele.met = 1; window.Guide.complete('handoff');
ok('handoff 完成 → done', window.Guide._state().done === true);
ok('全程 done 落盘', S.guide.done === true);

/* 3. R2/R3 丹药原子 + 失败不写凭证 + 重进补发 */
console.log('\n[3] R2/R3 丹药发放原子性');
freshEnv({ guide: null });
window.Guide.init();
runAllTimeouts(); // step1
S.stats.sit = 1; window.Guide.complete('sit');
S.rank = 1; window.Guide.complete('brk'); runAllTimeouts(); // step3
addItemResult = false; // 模拟背包满/接口异常
S.plots = [{}]; window.Guide.complete('field'); // 进入 bag 步，发丹应失败
const st3 = window.Guide._state();
ok('addItem失败 → 不写凭证', st3.rewardClaims['taixu_intro_dan_v1'] === undefined);
ok('addItem失败 → 背包无丹', S.bag.length === 0);
addItemResult = true; // 恢复
document._bubble = null; // 模拟重进，触发重渲染补发
window.Guide.init();
const st3b = window.Guide._state();
ok('重进后补发丹(凭证写出)', st3b.rewardClaims['taixu_intro_dan_v1'] === true);
ok('背包最终仅1颗丹(幂等)', S.bag.length === 1);

/* 4. R1 断点续走（引导中途刷新，不应重置/不应误判老玩家） */
console.log('\n[4] R1 断点续走');
freshEnv({
  guide: { step: 2, started: true, done: false, skipped: false,
    flags: { c_enter: true, c_sit: true, c_brk: true },
    rewardClaims: { taixu_intro_dan_v1: true }, toldSystems: {} }
});
S.rank = 1; S.stats.sit = 1; S.plots = [{}]; S.bag = [{ id: 'dan_juqi', name: '下品聚气丹' }];
window.Guide.init();
const st4 = window.Guide._state();
ok('断点续走：恢复 step=2', st4.step === 2);
ok('断点续走：丹药凭证保留', st4.rewardClaims['taixu_intro_dan_v1'] === true);
ok('断点续走：未重置为0', st4.step !== 0);

/* 5. 跳过无残留 + 补讲持久化 */
console.log('\n[5] 跳过路径');
freshEnv({ guide: null });
window.Guide.init();
runAllTimeouts(); // step1
window.Guide.skip();
const st5 = window.Guide._state();
ok('跳过 → done', st5.done === true);
ok('跳过 → skipped', st5.skipped === true);
ok('跳过清 dataset.guideStep', document.body.dataset.guideStep === '');
ok('跳过气泡隐藏', document._bubble.style.display === 'none');
window.Guide.tellSystem('field');
ok('跳过者开灵田补讲(太虚真人)', logCalls.some(a => a[0] && a[0].indexOf('太虚真人') >= 0));
ok('补讲记录持久化', st5.toldSystems['field'] === true);

/* 6. 非当前步 complete 被拒 */
console.log('\n[6] 完成判定身份校验');
freshEnv({ guide: null });
window.Guide.init();
const r6 = window.Guide.complete('brk'); // step0 时 brk(step2) 不应推进
ok('非当前步 complete 返回 false', r6 === false);
ok('非当前步 step 不变', window.Guide._state().step === 0);

/* 7. 台词零开发残留 */
console.log('\n[7] 军规5 零开发残留');
freshEnv({ guide: null });
const scan = window.Guide.scanResidue();
ok('scanResidue 命中数=0', scan.hits === 0);

/* 8. R5 after 回调二次校验（step 不符/已跳过时不误推进） */
console.log('\n[8] R5 追叙回调守卫');
freshEnv({ guide: null });
window.Guide.init();
runAllTimeouts(); // step1
S.stats.sit = 1; window.Guide.complete('sit'); // step2
S.rank = 1; window.Guide.complete('brk'); // 写入 after 定时器
const st8 = window.Guide._state();
st8.step = 0; // 模拟刷新/跳步后 step 变化
runAllTimeouts(); // after 回调：step(0)!==idx(2) → 拒绝推进
ok('R5 守卫：step 不符时 after 回调不推进', window.Guide._state().step === 0);

/* 9. C5 重置后 state 重绑定（resetAll 替换为新 S.guide，控制器须指向新对象） */
console.log('\n[9] C5 重置后 state 重绑定');
freshEnv({ guide: null });
window.Guide.init();
runAllTimeouts(); // step1
const beforeObj = window.Guide._state();
const oldGuide = S.guide;
// 模拟 resetAll：替换 S.guide 为全新对象（真实 game.js 在 resetAll 内执行）
S.guide = { step: 0, done: false, skipped: false, flags: {}, rewardClaims: {}, toldSystems: {} };
window.Guide.reset(); // game.js resetAll 末调此
const afterObj = window.Guide._state();
ok('C5 重置后 state 指向新 S.guide 对象', afterObj === S.guide && afterObj !== oldGuide);
ok('C5 重置后控制器不再操作旧对象', beforeObj !== afterObj);
ok('C5 重置后引导重新开始(step=0)', afterObj.step === 0);
ok('C5 重置后气泡已重建', document._bubble !== null);

console.log('\n==== 仿真自检汇总 ====');
console.log('PASS=' + PASS + '  FAIL=' + FAIL);
if (FAIL > 0) { console.log('失败项: ' + fails.join(' | ')); process.exit(1); }
console.log('ALL_GREEN');
