'use strict';
/* =============================================================================
 * _craft_fold_check.js —— 炼丹房 / 炼器房「分阶折叠」常驻回归测试
 *
 * 来源：2026-11-18 派单第 1 项。把一次性探针
 *   D:/xx-scratch/log/stage5_20261118_craftfold/probe_craftfold.js
 * 落成工程常驻测试，并加上 PASS/FAIL 断言与退出码（原探针只打印 JSON）。
 *
 * 纪律：
 *   · 只读游戏：不写业务代码、不写项目目录、不改存档；
 *   · 临时页走 tools/page.js 的 D 盘 SCRATCH（跑完即删），浏览器 profile 也写 D 盘；
 *   · 截图写 CRAFT_FOLD_OUT（默认 D:/xx-scratch/log/stage5_20261118_craftfold/）。
 *
 * 两种取证模式（这是本轮踩出来的必要区分，别合并）：
 *   P1 virtual —— 用 --virtual-time-budget 快进，跑 35 项结构与交互/视觉判据（C01–C35 中的硬判项）
 *      + 2 项只观测（C25b 同帧滞后、C33 周期落盘取证、C35 owned∧locked 清单）。
 *      虚拟时间不派发 scroll 事件（实测 scEvents=0），所以「横滑位置保住」不能在这儿判；
 *      同理「点签换阶后状态文案的滞后」在虚拟时间里受重绘时机摆布（同一脚本两轮结果相反，
 *      实测 21:57 轮红 2 条 / 21:59 轮全绿），所以 P1 的 C25 只在**显式重绘后**硬判收敛。
 *   P2 real —— 用 --real-wait 走真实帧，判 3 项：scroll 事件确实派发（R01）、
 *      重绘后横滑保住（R02）、点签后状态文案 2000ms 内收敛（R03，轮询量滞后毫秒）。
 *
 * craft-eff 行展示口径（2026-11-18 21:59 代 js/game.js 11387/11560 起）：
 *   锁定配方不再输出 .craft-eff；可炼配方每行必须有非空 .craft-eff 且与成功率行并存。
 *   五个取样点各判一条：C26 最高锁阶、C27 第 4 阶、C28 默认展开阶、C29 升级跟到的阶、
 *   C30 手动态换到第 2 阶（共 5 条，同一不变式）。
 *   锁行身份口径 = 正文 small 是否以「需炼丹房/需丹师/需炼器坊/需器师」开头（不是按钮文案）：
 *   炼器行按钮是 `owned ? 已装备 : locked ? 未解锁`，存在「已装备 ∧ 未解锁」这一组合。
 *
 * 存档写入取证（22:4x 追加，起因是 C15 在 forge 块间歇性红）：
 *   C31 步骤体内同步写盘必须为 0 次；C32 存档差异键里不得出现折叠/展开语义键；
 *   C33（只观测）把步骤间隙的写盘次数与首次毫秒打出来，对照 js/game.js:13131 的 3000ms 周期落盘。
 *   C15 本身判定逻辑没动，仍是「整块前后一字不变」——它会把周期落盘也判成红，属判据过脆，
 *   口径要不要改（语义化 / 冻结 tickLoop）留给制作人拍板，见报告 §5。
 *
 * 用法：
 *   NODE _craft_fold_check.js                 两房 × 两视口 × 两模式 + 四套实拍
 *   NODE _craft_fold_check.js --no-shot       跳实拍（只跑断言）
 *   NODE _craft_fold_check.js --no-real       跳实时模式（横滑那两项记为未覆盖）
 *   NODE _craft_fold_check.js alchemy         只跑丹房（alchemy / forge）
 *   NODE _craft_fold_check.js --vp=all        再加 360/393/720/1100 四档补充取证
 *                                             （这四档派单未给铺满/横滑口径 → C18 打 OBS 不计 PASS）
 *   NODE _craft_fold_check.js -v              额外逐行打印每轮 DIAG 原文
 *
 * 退出码：0 = 全绿；1 = 有 FAIL（判据不过）；2 = 环境/取数失败（一轮 DIAG 都没拿到）
 * ========================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = __dirname;
const PAGE = require(path.join(ROOT, 'tools', 'page.js'));
const { execEdge } = require(path.join(ROOT, 'tools', 'edge-run.js'));
PAGE.use(ROOT);

const OUT = process.env.CRAFT_FOLD_OUT || 'D:/xx-scratch/log/stage5_20261118_craftfold';
const ARGV = process.argv.slice(2);
const NO_SHOT = ARGV.indexOf('--no-shot') >= 0;
const NO_REAL = ARGV.indexOf('--no-real') >= 0;
const VERBOSE = ARGV.indexOf('-v') >= 0;
const ONLY = ARGV.filter(a => a === 'alchemy' || a === 'forge');
fs.mkdirSync(OUT, { recursive: true });

/* ---------------- 期望口径（派单给的硬数，写死在这儿，不随实现漂） ---------- */
const EXPECT = {
  alchemy: {
    view: 'dong_alchemy', box: '#xx-alchemy', lvKey: 'dan', mstKey: 'alchemyLv',
    tiers: 9, total: 37, autoSeg: 3, upSeg: 7, upLv: 5, upMst: 5,
    bldName: '丹房', condWord: ['丹房', '丹师'], lockReason: ['需炼丹房', '需丹师']
  },
  forge: {
    view: 'dong_forge', box: '#xx-forge', lvKey: 'forge', mstKey: 'forgeLv',
    tiers: 9, total: 36, autoSeg: 1, upSeg: 4, upLv: 5, upMst: 5,
    bldName: '器坊', condWord: ['器坊', '器师'], lockReason: ['需炼器坊', '需器师']
  }
};
/* 种子（与探针同一份）：dan=2 / alchemyLv=2 → 丹房自动态第 3 阶；forge=1 / forgeLv=1 → 器坊第 1 阶 */
const SEED_LV = { alchemy: 2, forge: 1 };
const SEED_MST = { alchemy: 2, forge: 1 };
/* 视口口径（派单）：1280 内容列九签恰好铺满（不可横滑）；430 走横滑 */
const VIEWPORTS = [
  { w: 430, h: 932, scrollable: true },
  { w: 1280, h: 900, scrollable: false }
];
/* --vp=all：追加另外四档（与 _layout_check.js 同口径）作补充取证。
   派单没给这四档的「铺满 / 横滑」预期，所以 C18 只观测不判定（打 OBS，不计进 PASS），
   其余判据（9 签、计数、默认展开、锁签文案、收放、存档不变、无横向滚动、签高、scroll 保住）照判。 */
const VP_ARG = ARGV.filter(a => a.indexOf('--vp=') === 0)[0];
if (VP_ARG === '--vp=all') {
  VIEWPORTS.push(
    { w: 360, h: 640, scrollable: null }, { w: 393, h: 720, scrollable: null },
    { w: 720, h: 1100, scrollable: null }, { w: 1100, h: 720, scrollable: null });
} else if (VP_ARG) {
  console.error('未知参数：' + VP_ARG + '（支持 --vp=all）');
  process.exit(2);
}
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/* ---------------- 存档夹具（与探针一字未改） ---------------- */
function seedScript() {
  const t = Date.now(), claimed = {};
  ['1-1', '1-2', '1-3', '1-4', '1-5', '2-1', '2-2', '2-3', '2-4', '2-5', '3-1', '3-2', '3-3',
    '3-4', '3-5', '4-1', '4-2', '4-3', '4-4', '5-1', '5-2', '5-3', '5-4'
  ].forEach(id => { claimed[id] = t; });
  const s = {
    name: '元呆呆', sex: 'm', gender: 'male', robe: 'bai', rank: 8, exp: 5200, stone: 128400,
    cave: 4, dan: 2, forge: 1, dao: 0, rootIdx: 2, gong1: 2, gong2: 0, gong3: 0, field: 5, mine: 4, herb: 188, ore: 130,
    weapon: 2, weaponLv: 3, bagSize: 20, tower: 7, towerMax: 6, petSlots: 2,
    wisdom: 260, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0, herb100: 12, herb10000: 2,
    log: [], bag: [], recipeN: {}, mastery: { alchemyLv: 2, alchemyExp: 40, forgeLv: 1, forgeExp: 30 },
    stats: { sit: 14, herb: 9, train: 4, enlight: 2, craftPill: 6, explore: 3, hunt: 7, enhance: 2, stoneEarned: 84200, farmN: 5 },
    plots: [], pets: [], eggs: [],
    arena: { day: '', left: 3, tier: 1, win: 4, lose: 1, rep: 120, foes: [] },
    union: { start: t, day: '', left: 0, merit: 0, claimed: [], season: 1 }, sign: { days: 3, last: '' },
    secret: { prog: [3, 1, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0,
    enc: { t: 0, bubble: null, lastId: '' }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed },
    equipment: { weapon: null, armor: null, accessory: null },
    shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 },
    market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 },
    questsDone: [], bossKilled: {}, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '',
    gate: { lv: 0, grad: 0, disciples: [] }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 0 },
    life: { age: 0, on: false, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null },
    mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, last: t
  };
  return '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(s)) +
    ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
}
/* 冻结动画 + 压掉会遮挡的弹窗；量几何前必须冻，否则量到第 0 帧（_playtest.js 纪律③） */
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}' +
  '#char-modal,#story-modal,.scene-particles,.toast{display:none!important}</style>';
const DIAG_EL = '<div id="diag" style="position:fixed;left:0;bottom:0;z-index:9999;font:10px monospace;' +
  'background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>';
const BOOT = 'try{if(window.Guide&&Guide.skip)Guide.skip();}catch(e){}XX._render();';

/* ================= P1：结构与交互（虚拟时间） ================= */
function PROBE(room) {
  const E = EXPECT[room];
  return 'var out={},err=null,STEP=0;window.__werr=window.__werr||[];' +
    'window.addEventListener("error",function(e){try{window.__werr.push(String(e.message).slice(0,120));}catch(x){}});' +
    'var BOX=function(){return document.querySelector(' + JSON.stringify(E.box) + ');};' +
    'var TAGS=function(){return BOX().querySelectorAll(".craft-tier");};' +
    'var SECS=function(){return BOX().querySelectorAll(".craft-sec");};' +
    'var BAR=function(){return BOX().querySelector(".craft-tiers");};' +
    'var SAVE=function(){return localStorage.getItem("xiuxian_save");};' +
    'var OPEN=function(){return Array.prototype.map.call(SECS(),function(x){return x.classList.contains("open")?(+x.dataset.seg):0;}).filter(Boolean);};' +
    'var TXT=function(x){return x?String(x.textContent).replace(/\\s+/g," ").trim():null;};' +
    /* craft-eff 行取证（2026-11-18 21:59 代 js/game.js 改了 11387/11560：锁定配方不再输出 .craft-eff）。
       逐行五元组 [有 .craft-eff, 有则非空, 同行 small 含「成功率」, 按钮文案, 有阶签 .dan-seg]。
       按钮文案「未解锁」= 实现里 locked 的唯一 DOM 口径（game.js:11394），
       据此套同一条不变式：未解锁行 → 无功效行、无成功率行、只写解锁原因；
       可炼行 → 必须有非空功效行且与成功率行并存（不互斥）。 */
    'function ROWFLAGS(sec){return Array.prototype.map.call(sec.querySelectorAll(".craft"),function(r){' +
    '  var e=r.querySelector(".craft-eff"),sm=r.querySelector(".craft-main small"),t=TXT(sm);' +
    '  var b=r.querySelector("button");' +
    '  return [!!e,e?(TXT(e).length>0):false,t?(t.indexOf("成功率")>=0):false,b?TXT(b):null,!!r.querySelector(".dan-seg"),t,' +
    /* 追加两列（22:4x 自纠）：6=dataset.recipe，7=按钮 disabled。
       用 recipeId 定位「哪一条配方」，用 disabled 锁住「已装备 ∧ 未解锁」这类行点不动。 */
    '    r.dataset?r.dataset.recipe||null:null,b?!!b.disabled:null];});}' +
    'function OSECF(){return BOX().querySelector(".craft-sec.open");}' +
    'function OPENROWS(){var os=OSECF();return os?ROWFLAGS(os):null;}' +
    'function OPENSEG(){var os=OSECF();return os?(+os.dataset.seg):0;}' +
    'function snap(){' +
    '  var t=TAGS(),s=SECS(),b=BAR(),o={};' +
    '  o.tiers=t.length;' +
    '  o.segs=Array.prototype.map.call(t,function(x){return +x.dataset.seg;});' +
    '  o.cnt=Array.prototype.map.call(t,function(x){var i=x.querySelector("b i");return i?(+i.textContent):null;});' +
    '  o.cond=Array.prototype.map.call(t,function(x){return TXT(x.querySelector("small"));});' +
    '  o.locked=Array.prototype.map.call(t,function(x){return x.classList.contains("locked");});' +
    '  o.on=Array.prototype.map.call(t,function(x){return x.classList.contains("on");});' +
    '  o.aria=Array.prototype.map.call(t,function(x){return x.getAttribute("aria-expanded");});' +
    /* 🔒 是 CSS 伪元素给的（style.css: #page-dong .craft-tier.locked::after{content:"🔒"}），
       textContent 取不到，必须用 getComputedStyle(el,"::after").content 才量得着。 */
    '  o.after=Array.prototype.map.call(t,function(x){return getComputedStyle(x,"::after").content;});' +
    /* 美术UI 规格口径（2026-11-18 派单更新）：签内文字字号只允许 13/11，不允许 8/9px。
       逐签量 b / b i / small 三个文字节点；::after 角标字号一并量出来但不在 C22 判（见报告待拍板）。 */
    '  o.fs=Array.prototype.map.call(t,function(x){var b=x.querySelector("b"),i=x.querySelector("b i"),sm=x.querySelector("small");' +
    '    return [b?getComputedStyle(b).fontSize:null,i?getComputedStyle(i).fontSize:null,' +
    '      sm?getComputedStyle(sm).fontSize:null,getComputedStyle(x,"::after").fontSize];});' +
    /* 当前展开签（.on）的视觉口径：纸底 + 金环 + 2px 亮朱砂底边，且不得是大片深朱砂填充 */
    '  o.onCss=(function(){var e=BOX().querySelector(".craft-tier.on");if(!e)return null;var c=getComputedStyle(e);' +
    '    return {bg:c.backgroundColor,bgs:c.backgroundImage.slice(0,48),color:c.color,' +
    '      bw:[c.borderTopWidth,c.borderRightWidth,c.borderBottomWidth,c.borderLeftWidth],' +
    '      bs:[c.borderTopStyle,c.borderRightStyle,c.borderBottomStyle,c.borderLeftStyle],' +
    '      bc:[c.borderTopColor,c.borderRightColor,c.borderBottomColor,c.borderLeftColor],' +
    '      shadow:c.boxShadow};})();' +
    /* 对照：普通签与锁签的底色/边框，用来证明「只有当前签是纸底金环」且锁签是虚线 */
    '  o.cssByKind=(function(){var out2=[];' +
    '    Array.prototype.forEach.call(t,function(e){var c=getComputedStyle(e);' +
    '      out2.push([e.classList.contains("on")?"on":(e.classList.contains("locked")?"lock":"norm"),' +
    '        c.backgroundColor,c.borderStyle,c.borderColor]);});' +
    '    return out2;})();' +
    '  o.txt=Array.prototype.map.call(t,function(x){return TXT(x);});' +
    '  o.h=Array.prototype.map.call(t,function(x){return Math.round(x.getBoundingClientRect().height);});' +
    '  o.w=Array.prototype.map.call(t,function(x){return Math.round(x.getBoundingClientRect().width);});' +
    '  o.segOrder=Array.prototype.map.call(s,function(x){return +x.dataset.seg;});' +
    '  o.openSegs=OPEN();' +
    '  o.rowsAll=BOX().querySelectorAll(".craft").length;' +
    '  o.rowsByTier=Array.prototype.map.call(s,function(x){return [+x.dataset.seg,x.querySelectorAll(".craft").length];});' +
    '  o.effByTier=Array.prototype.map.call(s,function(x){' +
    '    var r=x.querySelectorAll(".craft"),e=x.querySelectorAll(".craft-eff"),ne=0;' +
    '    Array.prototype.forEach.call(e,function(y){if(TXT(y))ne++;});' +
    '    return [r.length,e.length,ne];});' +
    '  o.openSeg=OPENSEG();o.openRows=OPENROWS();' +
    '  var os=BOX().querySelector(".craft-sec.open");' +
    '  o.btnOpen=os?(function(){var bb=os.querySelectorAll("button");return [bb.length,' +
    '    Array.prototype.filter.call(bb,function(x){return x.disabled;}).length,' +
    '    Array.prototype.map.call(bb,function(x){return TXT(x);}).join("|")];})():null;' +
    '  o.fam=BOX().querySelectorAll(".dan-fam").length;' +
    '  o.fold=BOX().querySelectorAll(".dan-fam-fold").length;' +
    '  o.strip=BOX().querySelectorAll(".dan-fam-strip").length;' +
    '  o.barHS=b?[b.scrollWidth,b.clientWidth,b.scrollLeft]:null;' +
    '  o.doc=[document.documentElement.scrollWidth,innerWidth];' +
    '  return o;' +
    '}' +
    'var save0=SAVE();var Q=[];' +
    /* 存档写入取证（22:4x 追加）：逐步记录「步骤体内同步写盘」与「步骤间隙（80ms setTimeout，
       tickLoop 的 3000ms 自动落盘落在这里）写盘」。这是为了把 C15 那条「整块前后一字不变」
       的黑箱红拆开看清楚：红到底是玩家收放态进了存档，还是游戏自身的周期落盘。 */
    'var PJ=function(s){try{return JSON.parse(s);}catch(e){return null;}};' +
    'var DIFF=function(a,b){var A=PJ(a),B=PJ(b);if(!A||!B)return ["<parse失败>"];' +
    '  var seen={},ks=[];[A,B].forEach(function(O){Object.keys(O).forEach(function(x){if(!seen[x]){seen[x]=1;ks.push(x);}});});' +
    '  return ks.filter(function(x){return JSON.stringify(A[x])!==JSON.stringify(B[x]);});};' +
    'var LASTS=save0,MMAX=40;out.inStepWrites=[];out.gapWrites=[];out.t0=Date.now();' +
    'Q.push(function(){out.boot={xx:typeof XX!=="undefined",router:typeof ROUTER!=="undefined",' +
    '  guide:(typeof window.Guide==="object"||typeof window.Guide==="function"),' +
    '  box:!!BOX(),view:(window.ROUTER&&ROUTER.current)?ROUTER.current():null};' +
    '  out.init=snap();out.save0len=save0?save0.length:0;});' +
    /* 虚拟时间下的横滑：只记录，不判（scroll 事件不派发，见文件头注） */
    'Q.push(function(){var b=BAR();window.__scn=0;b.addEventListener("scroll",function(){window.__scn++;});' +
    '  window.__b0=b;b.scrollLeft=b.scrollWidth;out.vBarSet=b.scrollLeft;});' +
    'Q.push(function(){out.vScEvents=window.__scn;XX._render();});' +
    'Q.push(function(){var b2=BAR();out.vBarAfter=b2.scrollLeft;out.vBarCls=b2.className;' +
    '  out.vBarRebuilt=(b2!==window.__b0);});' +
    /* 升级后不点签 → 自动态跟到新「当前能炼」阶；再把种子改回来 */
    'Q.push(function(){var S=XX._s;S[' + JSON.stringify(E.lvKey) + ']=' + E.upLv + ';' +
    '  S.mastery[' + JSON.stringify(E.mstKey) + ']=' + E.upMst + ';XX._render();' +
    '  out.upOpen=OPEN();out.upTagOn=Array.prototype.map.call(TAGS(),function(x){return x.classList.contains("on")?(+x.dataset.seg):0;}).filter(Boolean);' +
    '  out.upSegNow=OPENSEG();out.upOpenRows=OPENROWS();});' +
    'Q.push(function(){var S=XX._s;S[' + JSON.stringify(E.lvKey) + ']=' + SEED_LV[room] + ';' +
    '  S.mastery[' + JSON.stringify(E.mstKey) + ']=' + SEED_MST[room] + ';XX._render();out.seedBack=OPEN();});' +
    /* 点最高锁阶 → 再点收起 → 收起态下重绘 */
    'Q.push(function(){var t=TAGS(),last=t[t.length-1];window.__lockSeg=+last.dataset.seg;last.click();});' +
    'Q.push(function(){var sg=window.__lockSeg,sec=BOX().querySelector(\'.craft-sec[data-seg="\' + sg + \'"]\');' +
    '  out.lockClick=sec?(function(){var bb=sec.querySelectorAll("button"),rr=sec.querySelectorAll(".craft");' +
    '    var eff=sec.querySelectorAll(".craft-eff"),ne=0;Array.prototype.forEach.call(eff,function(y){if(TXT(y))ne++;});' +
    '    var ic=rr.length?rr[0].querySelector("small img"):null;' +
    '    return {seg:sg,open:sec.classList.contains("open"),disp:getComputedStyle(sec).display,rows:rr.length,' +
    '      eff:eff.length,effNonEmpty:ne,btn:bb.length,' +
    '      disabled:Array.prototype.filter.call(bb,function(x){return x.disabled;}).length,' +
    '      btnTxt:bb.length?TXT(bb[0]):null,reason:rr.length?TXT(rr[0].querySelector("small")):null,' +
    '      rowFlags:ROWFLAGS(sec),reasons:Array.prototype.map.call(rr,function(x){var s=x.querySelector(".craft-main small");return TXT(s);}),'+
    '      reasonIco:ic?(ic.getAttribute("src")||"").split("/").pop():null};})():null;' +
    '  out.lockOpenAll=OPEN();});' +
    'Q.push(function(){var t=TAGS();t[t.length-1].click();out.afterAllClose=OPEN();});' +
    'Q.push(function(){XX._render();out.afterRerenderClose=OPEN();out.afterRerenderTiers=TAGS().length;});' +
    /* 展开第 4 阶（两房默认种子下第 4 阶都是锁阶）：逐行核 craft-eff 与解锁原因行的新口径 */
    'Q.push(function(){var t=TAGS();if(t[3])t[3].click();});' +
    'Q.push(function(){var sec=BOX().querySelector(\'.craft-sec[data-seg="4"]\'),t=TAGS();' +
    '  out.t4={lockClass:t[3]?t[3].classList.contains("locked"):null,on:t[3]?t[3].classList.contains("on"):null,' +
    '    open:sec?sec.classList.contains("open"):false,disp:sec?getComputedStyle(sec).display:null,' +
    '    seg:OPENSEG(),rows:sec?sec.querySelectorAll(".craft").length:0,' +
    '    eff:sec?sec.querySelectorAll(".craft-eff").length:0,' +
    '    rowFlags:sec?ROWFLAGS(sec):null,' +
    '    reasons:sec?Array.prototype.map.call(sec.querySelectorAll(".craft"),function(x){var s=x.querySelector(".craft-main small");return TXT(s);}):null,' +
    '    btn:sec?sec.querySelectorAll("button").length:0,' +
    '    disabled:sec?Array.prototype.filter.call(sec.querySelectorAll("button"),function(x){return x.disabled;}).length:0,' +
    '    btnTxt:(sec&&sec.querySelector("button"))?TXT(sec.querySelector("button")):null};});' +
    /* 点第二签 → 只开第二阶 */
    'Q.push(function(){var t=TAGS();if(t[1])t[1].click();});' +
    /* 状态文案：click 处理器只翻 class/aria，不重写 <small>（js/game.js:11513-11520），
       所以同帧采样只作观测（滞后大小由 P2 实时轮询量，见 R03）；硬判据放在显式重绘之后。 */
    'Q.push(function(){out.afterSecond=OPEN();' +
    '  out.secondOn=Array.prototype.map.call(TAGS(),function(x){return x.classList.contains("on");});' +
    '  out.secondAria=Array.prototype.map.call(TAGS(),function(x){return x.getAttribute("aria-expanded");});' +
    '  var s2=BOX().querySelector(\'.craft-sec[data-seg="2"]\');' +
    '  out.secondDisp=s2?getComputedStyle(s2).display:null;' +
    '  out.secondCond=Array.prototype.map.call(TAGS(),function(x){return TXT(x.querySelector("small"));});' +
    '  XX._render();});' +
    'Q.push(function(){var t=TAGS();out.secondCondR=Array.prototype.map.call(t,function(x){return TXT(x.querySelector("small"));});' +
    '  out.secondOnR=Array.prototype.map.call(t,function(x){return x.classList.contains("on")?(+x.dataset.seg):0;}).filter(Boolean);' +
    '  out.secondOpenR=OPEN();out.secondRowsR=OSECF()?ROWFLAGS(OSECF()):null;});' +
    /* 解锁条件的第二条分支：建筑满级 + 匠道只有 1 阶 → 锁签与行内原因都必须写「丹师/器师 N 阶」。
       放在所有收放判据之后测，避免扰动前面的自动态与手动态。 */
    'Q.push(function(){var S=XX._s;S[' + JSON.stringify(E.lvKey) + ']=10;S.mastery[' + JSON.stringify(E.mstKey) + ']=1;' +
    '  XX._render();var t=TAGS();var last=t[t.length-1];window.__mSeg=+last.dataset.seg;last.click();});' +
    'Q.push(function(){var t=TAGS(),sg=window.__mSeg,sec=BOX().querySelector(\'.craft-sec[data-seg="\' + sg + \'"]\');' +
    '  out.mstLow={blv:XX._s[' + JSON.stringify(E.lvKey) + '],mst:XX._s.mastery[' + JSON.stringify(E.mstKey) + '],' +
    '    segs:Array.prototype.map.call(t,function(x){return +x.dataset.seg;}),' +
    '    cond:Array.prototype.map.call(t,function(x){return TXT(x.querySelector("small"));}),' +
    '    locked:Array.prototype.map.call(t,function(x){return x.classList.contains("locked");}),' +
    '    open:OPEN(),rowSeg:sg,rowOpen:sec?sec.classList.contains("open"):null,' +
    '    rowReason:sec?(function(){var r=sec.querySelector(".craft small");return TXT(r);})():null,' +
    '    rowBtn:sec?(function(){var b=sec.querySelector(".craft button");return b?[TXT(b),!!b.disabled]:null;})():null};' +
    '  t[t.length-1].click();});' +
    'Q.push(function(){var S=XX._s;S[' + JSON.stringify(E.lvKey) + ']=' + SEED_LV[room] + ';' +
    '  S.mastery[' + JSON.stringify(E.mstKey) + ']=' + SEED_MST[room] + ';XX._render();});' +
    'Q.push(function(){out.saveSame=(save0===SAVE());out.saveNowlen=(SAVE()||"").length;' +
    '  out.saveKeysDiff=DIFF(save0,SAVE()).slice(0,24);out.saveParsable=(PJ(SAVE())!==null);' +
    '  out.blockMs=Date.now()-out.t0;' +
    '  out.final=snap();out.werr=window.__werr;});' +
    'function fin(p){if(err)p.textContent="FOLD-ERR step"+STEP+" "+String(err).slice(0,240);' +
    '  else p.textContent="FOLD="+JSON.stringify(out);}' +
    'function run(i){STEP=i;if(i>=Q.length){fin(document.getElementById("diag"));return;}' +
    '  var sB=SAVE();' +
    '  if(sB!==LASTS&&out.gapWrites.length<MMAX)' +
    '    out.gapWrites.push({step:i,ms:Date.now()-out.t0,keys:DIFF(LASTS,sB).slice(0,16)});' +
    '  LASTS=sB;' +
    '  try{Q[i]();}catch(e){err=String(e&&e.message||e);fin(document.getElementById("diag"));return;}' +
    '  var sA=SAVE();' +
    '  if(sA!==sB){LASTS=sA;if(out.inStepWrites.length<MMAX)' +
    '    out.inStepWrites.push({step:i,ms:Date.now()-out.t0,keys:DIFF(sB,sA).slice(0,16)});}' +
    '  setTimeout(function(){run(i+1);},80);}' +
    'setTimeout(function(){run(0);},60);';
}

/* ================= P2：横滑保住（真实时间，scroll 事件才派发） ============== */
function PROBE_BAR(room) {
  const E = EXPECT[room];
  return 'var out={},t0=Date.now();' +
    'var p=document.getElementById("diag");' +
    'function fin(){p.textContent="BAR="+JSON.stringify(out);}' +
    'try{' +
    '  var box=document.querySelector(' + JSON.stringify(E.box) + ');' +
    '  var b0=box.querySelector(".craft-tiers");' +
    '  if(!b0){out.err="签条不存在（.craft-tiers 没挂上）";fin();}else{' +
    '    window.__n=0;b0.addEventListener("scroll",function(){window.__n++;});' +
    '    out.hs=[b0.scrollWidth,b0.clientWidth,b0.scrollLeft];' +
    '    out.slip=b0.scrollWidth-b0.clientWidth;' +
    '    window.__b0=b0;b0.scrollLeft=b0.scrollWidth;' +
    '    out.set=b0.scrollLeft;' +
    '    var step2=function(){' +
    '      out.scEvents=window.__n;out.atSet=[b0.scrollLeft,out.slip];' +
    '      XX._render();' +
    '      setTimeout(function(){' +
    '        var b2=box.querySelector(".craft-tiers");' +
    '        out.rebuilt=(b2!==window.__b0);' +
    '        out.after=b2?b2.scrollLeft:null;' +
    '        out.afterHS=b2?[b2.scrollWidth,b2.clientWidth]:null;' +
    '        out.cls=b2?b2.className:null;' +
    '        out.openSegs=Array.prototype.map.call(box.querySelectorAll(".craft-sec"),' +
    '          function(x){return x.classList.contains("open")?(+x.dataset.seg):0;}).filter(Boolean);' +
    '        labPhase();' +
    '      },300);' +
    '    };' +
    /* R03：真实时间下量「点签换展开阶 → 状态文案跟上新展开态」的滞后毫秒。
       click 处理器只翻 class 不重写 <small>（js/game.js:11513-11520），文案要等下一次整体重绘；
       虚拟时间里重绘时机会插进采样窗口（同一份脚本两轮结果相反，实测见 21:57 / 21:59 两轮），
       所以这条只能在实时模式用轮询量，不写固定 sleep。 */
    '    function labPhase(){' +
    '      var tg=function(){return box.querySelectorAll(".craft-tier");};' +
    '      var TXT=function(x){return x?String(x.textContent).replace(/\\s+/g," ").trim():null;};' +
    '      var read=function(){var t=tg();return {' +
    '        on:Array.prototype.map.call(t,function(x){return x.classList.contains("on");}),' +
    '        locked:Array.prototype.map.call(t,function(x){return x.classList.contains("locked");}),' +
    '        lab:Array.prototype.map.call(t,function(x){return TXT(x.querySelector("small"));})};};' +
    '      var okf=function(r){return r.lab.every(function(c,k){' +
    '        if(r.locked[k])return /级|阶/.test(String(c));' +
    '        return c===(r.on[k]?"当前":"可炼");});};' +
    '      var rn=0,mo=null;' +
    '      try{mo=new MutationObserver(function(){rn++;});mo.observe(box,{childList:true});}catch(x){}' +
    '      var base=Date.now();var r0=read();var initOk=okf(r0);' +
    '      var t=tg();if(t[1])t[1].click();' +
    '      var a0=read();var polls=0;' +
    '      var done=function(r,lag,timeout){' +
    '        try{if(mo)mo.disconnect();}catch(x){}' +
    '        out.lab={initOk:initOk,onInit:r0.on.indexOf(true)+1,syncAtClick:okf(a0),at0:a0.lab,' +
    '          onAfterClick:a0.on.map(function(x,k){return x?(k+1):0;}).filter(Boolean),' +
    '          lagMs:lag,polls:polls,renders:rn,timeout:!!timeout,labAtFix:r.lab,onFix:r.on.map(function(x,k){return x?(k+1):0;}).filter(Boolean)};' +
    '        out.ms=Date.now()-t0;fin();' +
    '      };' +
    '      (function poll(){polls++;var r=read();' +
    '        if(okf(r)){done(r,Date.now()-base,false);return;}' +
    '        if(Date.now()-base>2500){done(r,null,true);return;}' +
    '        setTimeout(poll,20);})();' +
    '    };' +
    '    (function waitSC(){' +
    '      if(window.__n>0){step2();return;}' +
    '      if(Date.now()-t0>3500){out.scTimeout=true;step2();return;}' +
    '      setTimeout(waitSC,50);' +
    '    })();' +
    '  }' +
    '}catch(e){out.err=String(e&&e.message||e);fin();}';
}

/* ---------------- 跑一轮 ---------------- */
function runOnce(room, vp, mode) {
  const E = EXPECT[room];
  const src = (mode === 'bar') ? PROBE_BAR(room) : PROBE(room);
  const body = BOOT + 'ROUTER.open("' + E.view + '");setTimeout(function(){' + src + '},900);';
  const f = path.join(PAGE.SCRATCH, '._cftest_' + mode + '_' + room + '_' + vp.w + '.html');
  const ud = path.join('D:/xx-scratch', 'xxcftest' + Date.now() + '_' + mode + '_' + room + '_' + vp.w);
  PAGE.writePage(f, HTML.replace('</head>', seedScript() + '\n</head>')
    .replace('</body>', FREEZE + '\n' + DIAG_EL +
      '<script>window.addEventListener("load",function(){setTimeout(function(){' + body + '},400);});</script></body>'));
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--user-data-dir=' + ud, '--window-size=' + vp.w + ',' + vp.h];
  args.push(mode === 'bar' ? '--real-wait=10000' : '--virtual-time-budget=15000');
  args.push('--dump-dom', PAGE.fileUrl(f));
  let out;
  try {
    out = execEdge(args, { timeout: 150000, encoding: 'utf8', maxBuffer: 1 << 26 });
  } catch (e) {
    return { kind: 'env', msg: 'EDGE 调用失败：' + (e && e.message) };
  } finally {
    fs.rmSync(f, { force: true });
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { /* profile 句柄偶发占用 */ }
  }
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(String(out || ''));
  if (!m) return { kind: 'env', msg: '没拿到 #diag（页面未加载或脚本没跑完），dom 长度=' + String(out || '').length };
  const txt = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<');
  const key = (mode === 'bar') ? 'BAR=' : 'FOLD=';
  if (txt.indexOf(key) !== 0) return { kind: 'env', msg: '页内脚本没跑完：' + txt.slice(0, 240) };
  try {
    const d = JSON.parse(txt.slice(key.length));
    if (d.err) return { kind: 'env', msg: '页内取数失败：' + d.err };
    return { kind: 'ok', data: d };
  } catch (e) {
    return { kind: 'env', msg: 'JSON 解析失败：' + e.message + ' 原文=' + txt.slice(0, 300) };
  }
}

/* ---------------- P1 判据（25 条） ---------------- */
function checks(room, vp, o) {
  const E = EXPECT[room];
  const i = o.init, f = o.final || {};
  const C = [];
  const add = (id, ok, label, detail) => C.push({ id, ok: !!ok, label, detail });
  const sameArr = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const condRe = new RegExp('^(' + E.condWord.join('|') + ')\\s*\\d+\\s*(级|阶)$');

  add('C01', o.boot && o.boot.xx === true && o.boot.router === true && o.boot.box === true,
    '页面就绪：' + E.box + ' 容器在、XX/ROUTER 都在（指引走 Guide.skip）',
    'box=' + o.boot.box + ' XX=' + o.boot.xx + ' ROUTER=' + o.boot.router +
    ' 当前 view=' + o.boot.view + ' Guide=' + o.boot.guide);

  add('C02', i.tiers === E.tiers,
    E.bldName + '九阶：页顶 .craft-tier 签数 = ' + E.tiers,
    '实得 ' + i.tiers + ' 签 阶序=' + JSON.stringify(i.segs));

  const cntOk = i.cnt.every(x => typeof x === 'number' && x > 0) &&
    sameArr(i.segs, i.segOrder) && i.cnt.every((x, k) => x === i.rowsByTier[k][1]);
  add('C03', cntOk,
    '每签写的条目数 = 该阶实际行数（逐签对齐，不缺阶不串阶）',
    '签面计数=' + JSON.stringify(i.cnt) + ' | 分段行数=' + JSON.stringify(i.rowsByTier.map(x => x[1])) +
    ' | 签阶序=' + JSON.stringify(i.segs) + ' 段阶序=' + JSON.stringify(i.segOrder));

  const sumCnt = i.cnt.reduce((a, b) => a + (b || 0), 0);
  const sumRows = i.rowsByTier.reduce((a, b) => a + b[1], 0);
  add('C04', i.rowsAll === E.total && sumCnt === E.total && sumRows === E.total,
    E.bldName + '条目合计 = ' + E.total + '（签面相加 = 分段相加 = DOM 行数，一条不漏）',
    'rowsAll=' + i.rowsAll + ' Σ签面=' + sumCnt + ' Σ分段=' + sumRows + '（期望 ' + E.total + '）');

  add('C05', i.openSegs.length === 1 && i.openSegs[0] === E.autoSeg,
    '默认只展开一阶，且是「当前能炼最高阶」第 ' + E.autoSeg + ' 阶（种子 ' + E.lvKey + '=' + SEED_LV[room] + ' / 匠道 ' + SEED_MST[room] + '）',
    '展开阶=' + JSON.stringify(i.openSegs) + '（期望 [' + E.autoSeg + ']）| 展开段行数=' + i.rowsByTier.filter(x => x[0] === i.openSegs[0]).map(x => x[1]) +
    ' | 参考（不断言）默认展开段按钮=' + JSON.stringify(i.btnOpen));

  const lockedSegs = i.locked.map((x, k) => x ? i.segs[k] : 0).filter(Boolean);
  const condTxtOk = lockedSegs.length > 0 && i.locked.every((lk, k) => !lk || condRe.test(String(i.cond[k])));
  /* 2026-11-18 派单更新口径：锁标不在文字里，是 .craft-tier.locked::after 的角标 →
     判 `.locked` 类 + 条件文字 + ::after content 非 none（不再要求 content 里必须是 🔒 这个字面）。 */
  const iconOk = i.locked.every((lk, k) => lk
    ? (String(i.after[k]) !== 'none' && String(i.after[k]) !== '')
    : String(i.after[k]) === 'none');
  add('C06', condTxtOk && iconOk,
    '未解锁阶签 = .locked 类 + 解锁条件文字（' + E.condWord.join(' / ') + ' N级 或 N阶，无空格）+ ::after 角标非 none',
    '锁签阶=' + JSON.stringify(lockedSegs) + ' | 条件文字=' + JSON.stringify(i.locked.map((lk, k) => lk ? i.cond[k] : null).filter(Boolean)) +
    ' | ::after 内容=' + JSON.stringify(i.after) + '（🔒 由 style.css .craft-tier.locked::after 的 content 提供，textContent 取不到，按新口径不判字面值）');

  add('C07', o.upOpen && o.upOpen.length === 1 && o.upOpen[0] === E.upSeg,
    '升级后不点签，自动态跟到第 ' + E.upSeg + ' 阶（' + E.lvKey + '=' + E.upLv + ' + 匠道 ' + E.upMst + '）',
    '展开阶=' + JSON.stringify(o.upOpen) + ' 高亮签阶=' + JSON.stringify(o.upTagOn) + '（期望 [' + E.upSeg + ']）');

  add('C08', o.seedBack && sameArr(o.seedBack, [E.autoSeg]),
    '种子改回后自动态复位到第 ' + E.autoSeg + ' 阶（自动态没被写死在第一次）',
    '展开阶=' + JSON.stringify(o.seedBack));

  const lc = o.lockClick || {};
  /* C09 只校「点开最高锁阶能展开、条目在」这一件事。
     本套早期版本在这里还判「每行都写功效」，那是 craft-eff 改动（21:59 代）之前的契约；
     现在锁阶行按规格不再输出 .craft-eff，功效行的存在性改由 C26（锁行不该有）
     与 C28/C29/C30（可炼行必须有）分别判，覆盖面不缩。 */
  add('C09', lc.open === true && lc.disp !== 'none' && lc.rows > 0,
    '点开最高锁阶（第 ' + (lc.seg || '?') + ' 阶）：分段展开、条目可见（功效行存在性移到 C26/C28）',
    'open=' + lc.open + ' display=' + lc.disp + ' rows=' + lc.rows + ' .craft-eff=' + lc.eff +
    '（非空 ' + lc.effNonEmpty + '，本代锁阶应为 0，由 C26 判）| 参考：此时展开阶=' + JSON.stringify(o.lockOpenAll));

  const reasonOk = typeof lc.reason === 'string' && lc.reason.indexOf('（当前 ') >= 0 &&
    E.lockReason.some(w => lc.reason.indexOf(w) === 0);
  add('C10', lc.btn > 0 && lc.disabled === lc.btn && lc.btnTxt === '未解锁' && reasonOk,
    '锁阶行内按钮全禁用、写「未解锁」、说明行给「需…（当前 …级）」原因',
    '禁用 ' + lc.disabled + '/' + lc.btn + ' 个按钮，首钮「' + lc.btnTxt + '」，原因「' +
    String(lc.reason || '').slice(0, 64) + '」| 行内锁图标=' + (lc.reasonIco || '（无 img，用 emoji）'));

  add('C11', o.afterAllClose && o.afterAllClose.length === 0,
    '再点同一签 → 允许全收起（展开阶数 = 0）',
    '展开阶=' + JSON.stringify(o.afterAllClose));

  add('C12', o.afterRerenderClose && o.afterRerenderClose.length === 0,
    '全收起后触发重绘，仍然全收起（默认展开没替玩家打开）',
    '重绘后展开阶=' + JSON.stringify(o.afterRerenderClose) + ' 签数=' + o.afterRerenderTiers);

  add('C13', o.afterSecond && sameArr(o.afterSecond, [2]),
    '点第二签只展开第二阶（单开不平铺）',
    '展开阶=' + JSON.stringify(o.afterSecond) + ' 第二阶 display=' + o.secondDisp);

  const onArr = (o.secondOn || []).map((x, k) => x ? i.segs[k] : 0).filter(Boolean);
  const ariaArr = (o.secondAria || []).map((x, k) => x === 'true' ? i.segs[k] : 0).filter(Boolean);
  add('C14', sameArr(onArr, [2]) && sameArr(ariaArr, [2]),
    '展开签的 .on 与 aria-expanded 跟实际开合一致',
    'on=' + JSON.stringify(onArr) + ' aria=true 的签=' + JSON.stringify(ariaArr) + ' 展开阶=' + JSON.stringify(o.afterSecond));

  add('C15', o.saveSame === true,
    '全程 localStorage(xiuxian_save) 字符串一字不变（收放态只存内存，不写存档）',
    'saveSame=' + o.saveSame + ' 前后长度=' + o.save0len + '/' + o.saveNowlen +
    '（判定逻辑未动；本轮起附证据：差异键=' + JSON.stringify((o.saveKeysDiff || []).slice(0, 24)) +
    '，写盘取证见 C31/C32/C33）');

  add('C16', i.doc[0] <= i.doc[1] && (!f.doc || f.doc[0] <= f.doc[1]),
    '页面无横向滚动（documentElement.scrollWidth ≤ innerWidth）',
    '默认态 ' + i.doc[0] + '≤' + i.doc[1] + ' | 末态 ' + (f.doc ? f.doc[0] + '≤' + f.doc[1] : '?'));

  /* 2026-11-18 派单更新口径：签高 52、宽 62。宽有一个 CSS 例外——
     style.css:5417-5419 `@media (max-width:380px){ .craft-tier{min-width:58px} }`，
     所以内视口 ≤380 时按 58 判，其余按 62 判（实测内视口见 C16）。 */
  const minH = Math.min.apply(null, i.h), maxH = Math.max.apply(null, i.h);
  const expW = i.doc[1] <= 380 ? 58 : 62;
  const wOk = i.w.length === E.tiers && i.w.every(x => x === expW);
  add('C17', i.h.length === E.tiers && minH === 52 && maxH === 52 && wOk,
    '签高 = 52、签宽 = ' + expW + '（内视口 ' + i.doc[1] + (expW === 58 ? '，走 ≤380 媒体查询降为 58' : '，主口径 62') + '）',
    '各签高=' + JSON.stringify(i.h) + '（期望全 52，且 ≥48 可点面积口径同时成立）| 各签宽=' + JSON.stringify(i.w) +
    '（期望全 ' + expW + '）| CSS 依据：.craft-tier{min-width:62px;min-height:52px} + @media(max-width:380px){min-width:58px}');

  const barMax = (i.barHS ? i.barHS[0] - i.barHS[1] : null);
  const barDetail = '签条 scrollWidth/clientWidth=' + JSON.stringify(i.barHS) + ' 溢出量=' + barMax +
    ' ｜ 虚拟时间对照（不判）：滑到=' + o.vBarSet + ' → 重绘后=' + o.vBarAfter +
    '，scroll 事件=' + o.vScEvents + '（虚拟时间不派发 scroll，故改由 P2 实时判）';
  if (vp.scrollable === null) {
    C.push({ id: 'C18', ok: barMax !== null, obs: true,
      label: '（' + vp.w + 'x' + vp.h + ' 派单未给铺满/横滑口径 → 只观测）签条溢出量 ' + barMax,
      detail: barDetail });
  } else {
    add('C18', vp.scrollable ? (barMax > 0) : (barMax === 0),
      (vp.scrollable ? '该视口签条可横滑（内容超出容器）' : '该视口九签恰好铺满（签条不外溢）') +
      ' ｜ ' + vp.w + 'x' + vp.h,
      barDetail);
  }

  add('C19', i.fam === 4 && i.fold === 1 && i.strip === 1,
    '旧断言依赖的 .dan-fam×4 仍在；四族族头改成一条「族况」摘要（details + strip 各 1）',
    '.dan-fam=' + i.fam + ' .dan-fam-fold=' + i.fold + ' .dan-fam-strip=' + i.strip);

  add('C20', !o.werr || o.werr.length === 0,
    '本轮无 window.onerror（页内脚本没炸）',
    'werr=' + JSON.stringify(o.werr || []));

  /* 解锁条件的第二条分支（派单原文：「丹房/器坊 N 级 或 丹师/器师 N 阶」）。
     前面全程建筑等级都不够，走的一直是建筑分支；这里把建筑顶到 10 级、匠道压回 1 阶，
     锁签文案与行内原因都必须换成匠道分支，且不能残留建筑分支的字样。 */
  const ml = o.mstLow || {};
  const mstCond = new RegExp('^' + E.condWord[1] + '\\s*\\d+\\s*阶$');
  const bldCond = new RegExp('^' + E.condWord[0] + '\\s*\\d+\\s*级$');
  const mlLocked = (ml.locked || []).map((x, k) => x ? ml.segs[k] : 0).filter(Boolean);
  const mlCond = (ml.locked || []).map((x, k) => x ? String(ml.cond[k]) : null).filter(Boolean);
  const rb = ml.rowBtn || [];
  add('C21', ml.locked !== undefined && mlLocked.length > 0 && ml.rowOpen === true &&
    mlCond.every(c => mstCond.test(c)) && !mlCond.some(c => bldCond.test(c)) &&
    typeof ml.rowReason === 'string' && ml.rowReason.indexOf(E.lockReason[1]) === 0 &&
    ml.rowReason.indexOf('（当前 ') > 0 && rb[1] === true && rb[0] === '未解锁',
    '解锁条件第二条分支也走通：建筑顶满 + 匠道 1 阶时，锁签写「' + E.condWord[1] + ' N 阶」而不是「' +
    E.condWord[0] + ' N 级」，行内原因同分支、按钮仍禁用',
    '此时建筑=' + (ml.blv || '?') + ' 匠道=' + (ml.mst || '?') +
    ' | 锁签阶=' + JSON.stringify(mlLocked) + ' 文案=' + JSON.stringify(mlCond) +
    ' | 展开阶=' + JSON.stringify(ml.open) + '（点的第 ' + ml.rowSeg + ' 阶，open=' + ml.rowOpen + '）' +
    ' | 行内原因「' + String(ml.rowReason || '').slice(0, 72) + '」首钮「' + rb[0] + '」disabled=' + rb[1]);

  const px = v => { const m = /(-?[\d.]+)px/.exec(String(v)); return m ? parseFloat(m[1]) : null; };
  const rgbOf = s => { const m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(String(s)); return m ? [+m[1], +m[2], +m[3]] : null; };
  const isGold = c => !!c && c[0] >= 150 && c[1] >= 100 && c[1] <= 180 && c[2] <= 100;
  const isVermilion = c => !!c && c[0] >= 170 && c[1] <= 90 && c[2] <= 90;

  /* C22：签内三个文字节点的字号必须落在 13/11，且不许出现 8/9px。
     ::after 角标字号只量不判（派单第 1 条说不许 8/9px，第 2 条又说锁标是 ::after 角标，
     现值 9px —— 两者按字面会打架，已列进报告 §5.3 待拍板，不自己裁定）。 */
  const fsRows = i.fs || [];
  const fsOk = fsRows.length === E.tiers && fsRows.every(r => px(r[0]) === 13 && px(r[1]) === 11 && px(r[2]) === 11);
  const noTiny = fsRows.every(r => [r[0], r[1], r[2]].every(v => { const n = px(v); return n !== null && n !== 8 && n !== 9; }));
  add('C22', fsOk && noTiny,
    '签内字号 = 13 / 11（阶名 13、计数与状态文案 11），九签无一档落 8 或 9px',
    '逐签 [b, b i, small, ::after] 字号=' + JSON.stringify(fsRows) +
    ' | ::after 角标字号=' + JSON.stringify(fsRows.map(r => r[3])) + '（只观测不判，见待拍板）');

  /* C23：当前展开签的视觉口径 —— 纸底 + 金环 + 2px 亮朱砂底边，且不是大片深朱砂填充。 */
  const oc = i.onCss || {};
  const sh = String(oc.shadow || '');
  const ocBg = rgbOf(oc.bg);
  const borderGold = (oc.bc || []).length === 4 && oc.bc.every(c => isGold(rgbOf(c)));
  const shadowHasGold = isGold(rgbOf(sh.match(/rgba?\([^)]+\)/) ? sh.match(/rgba?\([^)]+\)/)[0] : null));
  const redInShadow = (sh.match(/rgba?\([^)]+\)/g) || []).some(x => isVermilion(rgbOf(x)));
  add('C23', oc.bg === 'rgb(255, 253, 247)' && !isVermilion(ocBg) && (oc.bgs === 'none' || oc.bgs === null) &&
    borderGold && (oc.bs || []).every(s => s === 'solid') && shadowHasGold && redInShadow && /-2px/.test(sh),
    '当前展开签＝纸底 #fffdf7 + 金环 + 2px 亮朱砂底边（无大片深朱砂填充、无背景渐变）',
    '纸底=' + oc.bg + ' 背景图=' + oc.bgs + ' 边框 ' + JSON.stringify(oc.bs) + '/' + JSON.stringify(oc.bc) +
    ' box-shadow=' + sh + ' 文字色=' + oc.color +
    ' | 对照（种类/底色/边框）=' + JSON.stringify(i.cssByKind));

  /* C24：签条几何（派单第 1 条的硬数）。
     九签内容宽 = 9×62 + 8×5 缝 + 容器 padding 2×2 = 602（≤380 媒体查询档 9×58+44=566…实得见 detail）。
     注意 scrollWidth 不会小于 clientWidth：容器比内容宽时它回报的就是 clientWidth，
     所以「内容宽 602」只能在容器比 602 窄的视口上直接读 scrollWidth，宽视口改读溢出量（=0 即放得下）。 */
  const contentW = i.doc[1] <= 380 ? (9 * 58 + 8 * 5 + 4) : 602;
  const bar0 = i.barHS || [];
  const overflow = bar0[0] - bar0[1];
  const expOverflow = Math.max(0, contentW - bar0[1]);
  const cNamed = (vp.w === 430 && vp.h === 932) ? 368 : (vp.w === 1280 && vp.h === 900) ? 658 : null;
  const geoOk = bar0[0] === Math.max(contentW, bar0[1]) && overflow === expOverflow &&
    (cNamed === null || Math.abs(bar0[1] - cNamed) <= 2);
  add('C24', geoOk,
    '签条几何：内容宽 ' + contentW + '（9×' + expW + ' + 8×5 缝 + 4 padding）' +
    (cNamed !== null ? '，client 实测 ' + bar0[1] + ' 对派单口径 ≈' + cNamed + '（±2）' : '') +
    '，' + (bar0[1] >= contentW ? '容器够宽 → 溢出 0（九签全放得下）' : '容器不够宽 → 溢出 ' + overflow + '（可横滑）'),
    '实测 [scrollWidth, clientWidth, scrollLeft]=' + JSON.stringify(bar0) +
    ' | 期望内容宽=' + contentW + ' 期望溢出=' + expOverflow + ' 实测溢出=' + overflow +
    (bar0[1] > contentW ? ' | 注意：容器 ' + bar0[1] + ' 比九签内容 ' + contentW + ' 宽 ' + (bar0[1] - contentW) +
      'px，签不拉伸（flex:0 0 auto），右侧留白，不是「拉伸铺满」' : ''));

  /* C25：状态文案随展开态走（派单第 2 条）。
     硬判两件事：① 默认态文案与 .on 一致；② 点第二签并重绘后「当前」在 2、第 autoSeg 签回落「可炼」。
     为什么不判「点击同帧」：click 处理器（js/game.js:11513-11520）只 classList.toggle 了
     .on / aria-expanded / .craft-sec.open，**不重写 <small> 里的状态文案**，文案只在
     renderCraftFold(11483) 生成 → 同帧必然滞后，滞后毫秒由 P2 实时轮询量（R03），
     这里把同帧快照打成 OBS 记进报告，不计 PASS/FAIL（虚拟时间下重绘时机会插进采样窗口，
     拿它当硬判据会漂）。 */
  const stateTxt = (cond, on, lk) => (lk ? 'cond' : (on ? '当前' : '可炼'));
  const initStateOk = i.cond && i.cond.every((c, k) => {
    if (i.locked[k]) return condRe.test(String(c));
    return String(c) === (i.on[k] ? '当前' : '可炼');
  });
  const curAt = (i.on || []).map((x, k) => x ? i.segs[k] : 0).filter(Boolean);
  const scr = o.secondCondR || [];
  const onR = o.secondOnR || [];
  const renderStateOk = scr.length === E.tiers && onR.length === 1 && onR[0] === 2 &&
    sameArr(o.secondOpenR || [], [2]) &&
    scr.every((c, k) => i.locked[k] ? condRe.test(String(c))
      : String(c) === ((i.segs[k] === 2) ? '当前' : '可炼'));
  add('C25', initStateOk && curAt.length === 1 && curAt[0] === E.autoSeg && renderStateOk,
    '状态文案跟展开态走（重绘口径）：展开签「当前」/其他已解锁「可炼」/未解锁写条件；点第二签并重绘后「当前」迁到 2、第 ' +
    E.autoSeg + ' 签回落「可炼」',
    '默认态文案=' + JSON.stringify(i.cond) + '（.on 签阶=' + JSON.stringify(curAt) + '）' +
    ' | 点第二签后立刻（只翻 class，未重绘）=' + JSON.stringify(o.secondCond) +
    ' | 重绘后=' + JSON.stringify(scr) + '（.on 签阶=' + JSON.stringify(onR) + ' 展开阶=' + JSON.stringify(o.secondOpenR) + '）');

  const sameFrameStale = (o.secondCond || []).filter((c, k) =>
    !i.locked[k] && c !== (i.segs[k] === 2 ? '当前' : '可炼')).length;
  C.push({ id: 'C25b', obs: true,
    label: '同帧滞后观测：点第二签后「未重绘」时有几签状态文案没跟着迁移',
    detail: '滞后签数=' + sameFrameStale + '/' + E.tiers + ' 点击后=' + JSON.stringify(o.secondCond) +
      ' | 根因：js/game.js:11506-11521 click 只 classList.toggle，不重写 <small>；纠正靠下一次整体重绘（实测毫秒见 R03）' });

  /* ---- craft-eff 折叠行展示改动（开发 21:59 代）：一条逐行不变式，套在五个取样点上 ----
     本轮 22:4x 自纠（B 类判据写错，业务码未动）：锁行身份不能拿按钮文案当唯一口径。
     按钮文案在两房不一样：丹房行是 `locked ? 未解锁 : …`（game.js:11396），
     炼器行是 `owned ? 已装备 : locked ? 未解锁 : …`（game.js:11565）——
     「已装备 ∧ 配方未解锁」这一组合下按钮写「已装备」，正文却写解锁原因、且不出 .craft-eff。
     种子（器坊 1 级 / weapon=2）第 2 阶首行正是这一组合，旧判据把它当可炼行判 → 12/12 稳定红。
     现改成正口径：以「正文是否以解锁原因开头」认锁行；锁行不得有 eff 与成功率行，
     非锁行必须有非空 eff 与成功率行。旧覆盖的一条没丢。 */
  const isLockRow = r => E.lockReason.some(w => String(r[5]).indexOf(w) === 0);
  const rowBad = rows => (rows || []).map((r, k) => {
    const lock = r[3] === '未解锁' || isLockRow(r);
    const okRow = lock ? (!r[0] && !r[2] && isLockRow(r))
      : (!!r[0] && !!r[1] && !!r[2]);
    return okRow ? null : k;
  }).filter(x => x !== null);
  const rowBrief = rows => JSON.stringify((rows || []).map(r => [r[3], r[0] ? (r[1] ? 'eff' : 'eff空') : '无eff',
    r[2] ? '有成功率' : '无成功率', isLockRow(r) ? '锁' : '可炼']));

  add('C26', (lc.rowFlags || []).length > 0 && rowBad(lc.rowFlags).length === 0 && lc.eff === 0,
    '锁阶（第 ' + (lc.seg || '?') + ' 阶）逐行：无 .craft-eff、无成功率行，只写「' + E.lockReason.join(' / ') + '…（当前 …）」',
    'rows=' + lc.rows + ' .craft-eff 总数=' + lc.eff + ' 违例行=' + JSON.stringify(rowBad(lc.rowFlags)) +
    ' | 逐行[按钮,功效行,成功率]=' + rowBrief(lc.rowFlags) +
    ' | 原因行样例=' + JSON.stringify((lc.reasons || []).slice(0, 2).map(s => String(s).slice(0, 46))));

  const t4 = o.t4 || {};
  add('C27', t4.open === true && t4.disp !== 'none' && t4.seg === 4 && (t4.rowFlags || []).length > 0 &&
    rowBad(t4.rowFlags).length === 0,
    '展开第 4 阶逐行核同一条 craft-eff 不变式（取样时唯一展开段应为第 4 阶）',
    'open=' + t4.open + ' display=' + t4.disp + ' 第4签.locked=' + t4.lockClass + ' .on=' + t4.on +
    ' rows=' + t4.rows + ' .craft-eff=' + t4.eff + ' 禁用按钮 ' + t4.disabled + '/' + t4.btn + ' 首钮「' + t4.btnTxt + '」' +
    ' 违例行=' + JSON.stringify(rowBad(t4.rowFlags)) + ' | 逐行[按钮,功效行,成功率]=' + rowBrief(t4.rowFlags) +
    ' | 原因行=' + JSON.stringify((t4.reasons || []).map(s => String(s).slice(0, 46))));

  add('C28', i.openSeg === E.autoSeg && (i.openRows || []).length > 0 &&
    i.openRows.every(r => r[3] !== '未解锁') && rowBad(i.openRows).length === 0,
    '默认展开的第 ' + E.autoSeg + ' 阶全是可炼行：逐行都有非空 .craft-eff 且同带成功率行（并存不互斥）',
    '展开阶=' + i.openSeg + ' 违例行=' + JSON.stringify(rowBad(i.openRows)) +
    ' | 逐行[按钮,功效行,成功率]=' + rowBrief(i.openRows));

  add('C29', o.upSegNow === E.upSeg && (o.upOpenRows || []).length > 0 && rowBad(o.upOpenRows).length === 0,
    '升级自动跟到第 ' + E.upSeg + ' 阶后，该阶逐行仍满足 craft-eff 不变式（可炼行有功效行 + 成功率行）',
    '跟到的阶=' + o.upSegNow + '（期望 ' + E.upSeg + '）违例行=' + JSON.stringify(rowBad(o.upOpenRows)) +
    ' | 逐行[按钮,功效行,成功率]=' + rowBrief(o.upOpenRows));

  add('C30', (o.secondRowsR || []).length > 0 && rowBad(o.secondRowsR).length === 0,
    '点第二签并重绘后，第 2 阶逐行仍满足 craft-eff 不变式（手动态换阶不破坏行内展示）',
    '展开阶=' + JSON.stringify(o.secondOpenR) + ' 违例行=' + JSON.stringify(rowBad(o.secondRowsR)) +
    ' | 逐行[按钮,功效行,成功率]=' + rowBrief(o.secondRowsR));

  /* ---- 22:4x 追加：把 C15 那条「整块前后一字不变」的红拆开取证，并锁住「已装备 ∧ 锁」行 ---- */
  const iw = o.inStepWrites || [], gw = o.gapWrites || [];
  add('C31', iw.length === 0,
    '任何一步的执行体内都没写过存档（12 次点签收放 + 每一次显式 XX._render() 都不写盘）',
    '步骤体内写盘次数=' + iw.length + ' | 前 8 次=' + JSON.stringify(iw.slice(0, 8)) +
    ' | 整块虚拟时长=' + o.blockMs + 'ms' +
    ' ｜ 依据：js/game.js:13131-13132 tickLoop 的 3000ms 周期落盘只可能落在步骤间隙（80ms setTimeout）');

  const dk = o.saveKeysDiff || [];
  const foldKey = dk.filter(k => /fold|open|tier|seg|collaps|expand/i.test(String(k)));
  add('C32', o.saveParsable === true && foldKey.length === 0,
    '收放折叠态没有进存档：save0→末态的差异键里不含任何折叠/展开/阶签语义的键，且存档前后都是合法 JSON',
    '差异键(' + dk.length + '个)=' + JSON.stringify(dk.slice(0, 24)) + ' | 其中折叠语义键=' + JSON.stringify(foldKey) +
    ' | 末态可解析=' + o.saveParsable + ' | saveSame=' + o.saveSame);

  C.push({ id: 'C33', obs: true,
    label: '周期落盘取证：步骤间隙写盘发生在第几步、距开跑多少毫秒（对照 game.js 的 3000ms 阈值）',
    detail: '间隙写盘次数=' + gw.length + ' | 整块时长=' + o.blockMs + 'ms | 阈值=3000ms（js/game.js:13131）' +
      ' | 首次=' + JSON.stringify(gw[0] || null) + ' | 前 6 次=' + JSON.stringify(gw.slice(0, 6)) +
      ' | C15 红与这些写盘同因（不是折叠态落盘）' });

  const ROWSETS = [['C26 最高锁阶', lc.rowFlags], ['C27 第 4 阶', t4.rowFlags], ['C28 默认展开阶', i.openRows],
    ['C29 升级跟到的阶', o.upOpenRows], ['C30 手动第 2 阶', o.secondRowsR]];
  const olRows = [];
  ROWSETS.forEach(p => (p[1] || []).forEach(r => {
    if (r[3] === '已装备' && isLockRow(r)) olRows.push({ at: p[0], recipe: r[6], reason: String(r[5]).slice(0, 52), disabled: r[7] });
  }));
  add('C34', olRows.every(r => r.disabled === true),
    '「按钮已装备 + 正文写解锁原因」这类行（owned ∧ locked）按钮必须 disabled（点不动、不会误炼）',
    '这类行数=' + olRows.length + '（0 条也算成立）| 违例=' +
    JSON.stringify(olRows.filter(r => r.disabled !== true)) + ' | 全部=' + JSON.stringify(olRows));

  C.push({ id: 'C35', obs: true,
    label: 'owned ∧ locked 行清单（产品口径待拍板：这类行按规格不出 .craft-eff，玩家看不到已获得法宝的效果）',
    detail: '条数=' + olRows.length + ' | ' + JSON.stringify(olRows) +
      ' | 实现依据：game.js:11565 按钮文案 owned 优先，11560 正文 locked 优先' });

  return C;
}

/* ---------------- P2 判据（3 条） ---------------- */
function checksBar(vp, o) {
  const C = [];
  const add = (id, ok, label, detail) => C.push({ id, ok: !!ok, label, detail });
  const scrollable = o.slip > 0;
  add('R01', scrollable ? (o.scEvents > 0 && !o.scTimeout) : true,
    '实时帧下 scroll 事件确实派发（证明横滑能被实现记进内存；不可横滑视口此项直接成立） ｜ ' + vp.w + 'x' + vp.h,
    'scroll 事件次数=' + o.scEvents + ' 超时标志=' + !!o.scTimeout + ' 溢出量=' + o.slip +
    ' scrollWidth/clientWidth=' + JSON.stringify(o.hs));
  add('R02', !scrollable || (typeof o.after === 'number' && Math.abs(o.after - o.set) <= 1),
    '滑到最右后触发重绘，横滑位置保住（不被默认滚动顶掉） ｜ ' + vp.w + 'x' + vp.h,
    '滑到=' + o.set + ' → 重绘后=' + o.after + '（差 ≤1 算保住）| 重绘换了签条节点=' + o.rebuilt +
    ' | 重绘后签条 class=' + o.cls + ' | 此时展开阶=' + JSON.stringify(o.openSegs) + ' | 用时 ' + o.ms + 'ms');
  /* R03：状态文案换阶后的收敛时间（实时轮询取证，见 PROBE_BAR 注释） */
  const L = o.lab || {};
  add('R03', L.timeout !== true && L.initOk === true && typeof L.lagMs === 'number' && L.lagMs <= 2000,
    '实时：点第二签后状态文案在 2000ms 内跟上新展开态（默认态本身一致；轮询取证，不用固定 sleep） ｜ ' + vp.w + 'x' + vp.h,
    '默认态一致=' + L.initOk + '（原 .on 在第 ' + L.onInit + ' 签）| 点击同帧就纠正=' + L.syncAtClick +
    ' | 收敛滞后=' + L.lagMs + 'ms（轮询 ' + L.polls + ' 次，期间整体重绘 ' + L.renders + ' 次，超时=' + !!L.timeout + '）' +
    ' | 点击瞬间文案=' + JSON.stringify(L.at0) + '（.on 签索引=' + JSON.stringify(L.onAfterClick) + '）' +
    ' → 纠正后=' + JSON.stringify(L.labAtFix) + '（.on 签索引=' + JSON.stringify(L.onFix) + '）');
  return C;
}

/* ---------------- 实拍 ---------------- */
function shots(room) {
  const E = EXPECT[room];
  const res = [];
  for (const [w, h, state] of [[430, 932, 'default'], [430, 932, 'tier4'], [430, 932, 'locked'],
    [1280, 900, 'default'], [1280, 900, 'tier4'], [1280, 900, 'locked']]) {
    const name = 'craft_' + room + '_' + w + '_' + state + '.png';
    /* 'tier4' = 展开第 4 阶（两房默认种子下都是锁阶）：给 craft-eff 改动留肉眼可核的实拍 */
    const idx = state === 'tier4' ? '3' : (state === 'locked' ? '-1' : null);
    const extra = idx === null ? ''
      : 'var tg=document.querySelectorAll(' + JSON.stringify(E.box + ' .craft-tier') + ');' +
        'if(tg.length){tg[' + (idx === '-1' ? 'tg.length-1' : idx) + '].click();}';
    const f = path.join(PAGE.SCRATCH, '._cfshot_' + room + '_' + w + '_' + state + '.html');
    const ud = path.join('D:/xx-scratch', 'xxcfshot' + Date.now() + '_' + room + '_' + w + '_' + state);
    PAGE.writePage(f, HTML.replace('</head>', seedScript() + '\n</head>')
      .replace('</body>', FREEZE + '\n<script>window.addEventListener("load",function(){setTimeout(function(){' +
        BOOT + 'ROUTER.open("' + E.view + '");setTimeout(function(){' + extra + '},700);},450);});</script></body>'));
    const out = path.join(OUT, name);
    try {
      execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
        '--user-data-dir=' + ud, '--virtual-time-budget=10000', '--window-size=' + w + ',' + h,
        '--screenshot=' + out, PAGE.fileUrl(f)], { timeout: 150000, stdio: ['ignore', 'ignore', 'pipe'] });
      res.push([name, fs.existsSync(out) ? 'OK ' + fs.statSync(out).size + 'B' : 'MISS']);
    } catch (e) {
      res.push([name, 'ERR ' + (e && e.message)]);
    } finally {
      fs.rmSync(f, { force: true });
      try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) { /* 同上 */ }
    }
  }
  return res;
}

/* ---------------- 主流程 ---------------- */
const rooms = ONLY.length ? ONLY : ['alchemy', 'forge'];
let pass = 0, fail = 0, envFail = 0, realSkip = 0, obsCount = 0;
const failed = [];
const crypto = require('node:crypto');
const sha8 = p => { try { return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex').slice(0, 8); } catch (e) { return '读不到'; } };
const PIN = ['js/game.js', 'style.css', 'index.html', 'js/views/cave.js', 'js/router.js'];

console.log('=== _craft_fold_check.js 分阶折叠回归 ===');
console.log('命令参数：' + (ARGV.length ? ARGV.join(' ') : '（默认全跑）'));
console.log('ROOT=' + ROOT + ' | 截图/日志 OUT=' + OUT + ' | 房=' + rooms.join(', ') +
  ' | 视口=' + VIEWPORTS.map(v => v.w + 'x' + v.h).join(', ') +
  ' | 模式=P1 virtual + P2 real' + (NO_REAL ? '（--no-real：横滑两项未覆盖）' : '') + (NO_SHOT ? ' | --no-shot' : ''));
console.log('开跑前所测指纹：' + PIN.map(p => p + '=' + sha8(p)).join(' '));

function report(tag, cs) {
  let rf = 0, ro = 0;
  cs.forEach(c => {
    if (c.obs) { ro++; obsCount++; console.log('OBS  ' + tag.padEnd(26) + c.id + ' ' + c.label + '  ｜ ' + c.detail); return; }
    if (c.ok) { pass++; console.log('PASS ' + tag.padEnd(26) + c.id + ' ' + c.label + '  ｜ ' + c.detail); }
    else { fail++; rf++; failed.push(tag + ' ' + c.id + ' ' + c.label + '  ｜ ' + c.detail); console.log('FAIL ' + tag.padEnd(26) + c.id + ' ' + c.label + '  ｜ ' + c.detail); }
  });
  console.log('---- ' + tag + ' 小结：通过 ' + (cs.length - rf - ro) + ' / 失败 ' + rf + (ro ? ' / 只观测 ' + ro : ''));
}

for (const room of rooms) {
  for (const vp of VIEWPORTS) {
    const r1 = runOnce(room, vp, 'fold');
    const tag1 = room + ' P1 ' + vp.w + 'x' + vp.h;
    if (r1.kind !== 'ok') { envFail++; console.log('ENVFAIL ' + tag1 + ' —— ' + r1.msg); }
    else {
      if (VERBOSE) console.log('DIAG ' + tag1 + ' ' + JSON.stringify(r1.data));
      report(tag1, checks(room, vp, r1.data));
      const i = r1.data.init;
      console.log('KEYS ' + tag1.padEnd(26) + '签=' + i.tiers + ' 条目=' + i.rowsAll +
        ' 默认展开=' + JSON.stringify(i.openSegs) + ' 升级后=' + JSON.stringify(r1.data.upOpen) +
        ' 锁签=' + i.locked.filter(Boolean).length + ' 签高=' + Math.min.apply(null, i.h));
    }
    if (!NO_REAL) {
      const r2 = runOnce(room, vp, 'bar');
      const tag2 = room + ' P2 ' + vp.w + 'x' + vp.h;
      if (r2.kind !== 'ok') { envFail++; console.log('ENVFAIL ' + tag2 + ' —— ' + r2.msg); }
      else {
        if (VERBOSE) console.log('DIAG ' + tag2 + ' ' + JSON.stringify(r2.data));
        report(tag2, checksBar(vp, r2.data));
        console.log('KEYS ' + tag2.padEnd(26) + '横滑 ' + r2.data.set + ' → ' + r2.data.after +
          '（scroll 事件 ' + r2.data.scEvents + ' 次，溢出量 ' + r2.data.slip + '）');
      }
    } else realSkip += 2;
  }
  if (!NO_SHOT) shots(room).forEach(([n, s]) => console.log('SHOT ' + n.padEnd(34) + s));
}

console.log('');
console.log('收跑后指纹：' + PIN.map(p => p + '=' + sha8(p)).join(' '));
if (failed.length) { console.log('失败条目全文：'); failed.forEach(x => console.log('  ✗ ' + x)); }
console.log('—— ' + rooms.length + ' 房 × ' + VIEWPORTS.length + ' 视口 · 判据 ' + (pass + fail) +
  ' 项 · 通过 ' + pass + ' / 失败 ' + fail + ' / 环境失败 ' + envFail +
  (obsCount ? ' / 只观测不判定 ' + obsCount + ' 项' : '') +
  (realSkip ? ' / 实时模式跳过 ' + realSkip + ' 项' : ''));
if (envFail && !fail) { console.log('判定：C 环境/取数失败（一轮或多轮没拿到 DIAG），不是实现红。'); process.exit(2); }
if (fail) { console.log('判定：有 FAIL —— 先分 A 实现问题 / B 判据过期 / C 环境，再决定动不动。'); process.exit(1); }
if (envFail) { console.log('判定：判据全过但有环境失败。'); process.exit(2); }
console.log('判定：分阶折叠全绿。');
process.exit(0);
