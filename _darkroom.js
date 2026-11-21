'use strict';
/* ============================================================
 * _darkroom.js —— 小黑屋巡检（2026-10-26）
 *
 * 不是替代 verify / _playtest，而是补它们测不到的那一面：
 * 把 13 个页面在「中期 / 大后期 / 脏档 / 空档 / 时间异常」五种存档下
 * 无人值守地点一遍，记录
 *   ① window.onerror / unhandledrejection / console.error
 *   ② 面板文字里的 NaN / undefined / Infinity / [object Object]
 *   ③ 破图（img.naturalWidth === 0）
 *   ④ 横向溢出（元素右边界超出视口）
 *   ⑤ 重复 id（getElementById 会只认第一个）
 *   ⑥ 每个按钮点下去之后新冒出来的错误
 *
 * 用法：node _darkroom.js           跑全部存档态
 *       node _darkroom.js mid late  只跑指定态
 * ============================================================ */
const { execEdge } = require('./tools/edge-run');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
/* 2026-10-26 用户要求：临时产物（浏览器 profile / 截图 / 中间 HTML）一律落 D 盘，不写 C 盘；D 不可用时退回系统 temp。 */
const SCRATCH = (function(){ try{ const p = 'D:/xx-scratch'; fs.mkdirSync(p, { recursive: true }); return p; }catch(e){ return os.tmpdir(); } })();

const ROOT = __dirname;
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const allClaimed = () => {
  const t = Date.now(), c = {};
  ['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5',
   '4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { c[id] = t; });
  return c;
};
const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

function core(rank) {
  const t = Date.now();
  return {
    name: '黑屋客', sex: 'm', gender: 'male', robe: 'bai',
    rank, exp: 0, stone: 5e11, cave: 20, dan: 10, forge: 10, dao: 60, rootIdx: 3,
    gong1: 30, gong2: 30, gong3: 30, field: 30, mine: 30, herb: 9999, ore: 9999,
    weapon: 4, weaponLv: 20, weaponBless: 0,
    affix: [{ id: 'exp', q: 4 }, { id: 'pow', q: 4 }, { id: 'brk', q: 4 }, { id: 'stone', q: 4 }],
    equipment: { weapon: 'eq_chixiao', armor: 'eq_xuangui', accessory: 'eq_lingzhu' },
    bagSize: 50, bag: [{ t: 'dan1', n: '下品破境丹' }, { t: 'eq_qingfeng', n: '青锋剑' }, { t: 'mat_core', n: '妖丹' }],
    swordAura: 0,
    tower: 10, towerMax: 10, towerDay: today(), towerSwept: 0,
    pets: [{ bid: 'rat', lv: 5, exp: 0 }], petSlots: 3, eggs: [{ bid: 'crow' }],
    huntBeast: 'rat', huntProg: 0, bossKilled: {},
    mastery: { alchemyLv: 6, alchemyExp: 100, forgeLv: 6, forgeExp: 100 },
    recipeN: { dan1: 5, dan2: 4, dan3: 3, dan4: 2, dan5: 1 },
    stats: { sit: 10, herb: 10, train: 10, enlight: 5, craftPill: 20, explore: 10, hunt: 50,
             enhance: 10, stoneEarned: 1e9, farmN: 30 },
    questsDone: [], miles: {}, milesNew: [],
    story: { claimed: allClaimed() }, letters: [],
    pillUntil: 0, pillBonus: 0,
    wisdom: 5000, insight: 100, wu: { sword: 5, dan: 5, array: 5 }, wuPaid: { sword: 9, dan: 9, array: 9 },
    failBonus: 30, guardMirror: 1, guardArray: 3, tianji: 1,
    shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 },
    herb100: 99, herb10000: 99,
    acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: today(),
    market: { day: today(), goods: [{ id: 'dan1', price: 100, bought: false }], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 },
    arena: { day: today(), left: 3, foes: [{ name: '甲乙', power: 1e6, beat: false }], tier: 2, win: 4, lose: 1, rep: 1200 },
    sign: { days: 2, last: today() },
    union: { start: t - 864e5, day: today(), left: 1, merit: 500, claimed: [], season: 2 },
    gate: { lv: 5, grad: 2, disciples: [
      { id: 'd1', name: '叶青梧', apt: 5, task: '', t0: 0, ret: 0, svc: 6, last: 'herb', run: 2, bless: 1 },
      { id: 'd2', name: '沈砚', apt: 3, task: 'seclude', t0: t, ret: t + 144e5, svc: 2, last: 'seclude', run: 1, bless: 0 }
    ] },
    dt: { qing: 3, zhu: 2, su: 1, xuan: 0, huang: 0 }, dtMain: 'qing',
    enc: { t: 0, bubble: null, lastId: '' }, encBuff: { mult: 0, until: 0 },
    secret: { prog: [10, 10, 10, 10], day: today(), swept: 0 },
    powScale: 1, last: t
  };
}

const STATES = {
  mid: () => Object.assign(core(8), {
    stone: 5e6, cave: 6, dan: 4, forge: 3, field: 8, mine: 8, herb: 500, ore: 500,
    weapon: 2, weaponLv: 5, weaponBless: 0, bagSize: 30, tower: 3, towerMax: 3,
    pets: [], eggs: [], petSlots: 1, mastery: { alchemyLv: 3, alchemyExp: 20, forgeLv: 2, forgeExp: 0 },
    recipeN: { dan1: 2 }, gate: { lv: 2, grad: 0, disciples: [] },
    dt: { qing: 1, zhu: 0, su: 0, xuan: 0, huang: 0 }, dtMain: 'qing',
    secret: { prog: [3, 0, 0, 0], day: '', swept: 0 },
    ui: { auraExpected: 0, deep: true }
  }),
  late: () => Object.assign(core(24), { ui: { auraExpected: 0, deep: true } }),
  aura: () => Object.assign(core(8), { swordAura: 2, ui: { auraExpected: 2 } }),
  empty: () => ({}),
  arr: () => ([]),
  dirty: () => ({
    name: 123, sex: 5, gender: null, robe: 'nope', rank: '9', exp: 'x', stone: null,
    cave: -5, dan: 999, forge: -1, dao: 'a', rootIdx: 99, field: -3, mine: 'm',
    herb: -2, ore: null, weapon: 99, weaponLv: -4, bagSize: 'x',
    tower: -1, towerMax: -2, towerDay: 5, towerSwept: -3,
    pets: 'x', petSlots: 0, eggs: [{ bid: 'nope' }, null], plots: [{ crop: 'nope' }],
    dungeon: null, stats: { sit: 'x', hunt: null }, questsDone: 'x',
    miles: { bad: 'x', m_rank1: 'x' }, milesNew: 'x', letters: [{ id: 1 }],
    pillUntil: 'x', pillBonus: null, wisdom: 'x', insight: 999,
    failBonus: 'x', guardMirror: -3, guardArray: null, tianji: 'x',
    shop: 'x', herb100: -1, herb10000: 'x', acts: 'x', actDay: 5,
    market: 'x', arena: 'x', sign: 'x', union: 'x', gate: 'x', dt: 'x', dtMain: 'nope',
    enc: 'x', encBuff: 'x', secret: 'x', equipment: 'x', affix: 'x', mastery: 'x',
    bag: [null, { t: 'nope' }, {}], story: 'x', last: 'x', swordAura: 'x'
  }),
  future: () => Object.assign(core(8), { last: Date.now() + 3600e3, stone: 1e6 }),
  ancient: () => Object.assign(core(8), { last: Date.now() - 86400e3 * 30, stone: 1e6 }),
  /* 三年后回来：跨天/赛季/派差事/作物全过期，看重置链路会不会算出负数或 NaN */
  stale: () => Object.assign(core(12), {
    actDay: '2020-1-1', towerDay: '2020-1-1', towerSwept: 5,
    market: { day: '2020-1-1', goods: [{ id: 'dan1', price: 100, bought: true }], buyRate: 1, sellRate: 1, sold: 5, freeRefresh: 0 },
    arena: { day: '2020-1-1', left: 0, foes: [{ name: '甲', power: 1e5, beat: true }], tier: 1, win: 2, lose: 2, rep: 100 },
    sign: { days: 6, last: '2020-1-1' },
    union: { start: Date.now() - 86400e3 * 1000, day: '2020-1-1', left: 0, merit: 100, claimed: [0, 1], season: 1 },
    plots: [{ crop: 'herb', t0: Date.now() - 86400e3 * 900, need: 300 }],
    huntProg: 1e9, huntBeast: 'rat',
    pillUntil: Date.now() - 86400e3 * 900, pillBonus: 0.15,
    encBuff: { mult: 0.6, until: Date.now() - 86400e3 * 900 },
    gate: { lv: 3, grad: 1, disciples: [
      { id: 'd1', name: '叶青梧', apt: 3, task: 'herb', t0: Date.now() - 86400e3 * 900, ret: Date.now() - 86400e3 * 899, svc: 1, last: 'herb', run: 1, bless: 0 }
    ] },
    last: Date.now() - 86400e3 * 900,
    ui: { auraExpected: 0, deep: true }
  })
};

/* ---------------- 页内探针 ---------------- */
const PROBE = `
window.__dr = { err: [], notes: [] };
window.onerror = function(m, u, l, c){ __dr.err.push('onerror: ' + m + ' @' + l + ':' + c); return false; };
window.addEventListener('unhandledrejection', function(e){
  __dr.err.push('rejection: ' + ((e.reason && (e.reason.message || e.reason)) || '?'));
});
(function(){
  var ce = console.error;
  console.error = function(){
    __dr.err.push('console.error: ' + Array.prototype.join.call(arguments, ' ').slice(0, 180));
    ce.apply(console, arguments);
  };
})();
function __sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
function __bad(t){
  var hit = [];
  ['NaN', 'undefined', 'Infinity', '[object Object]'].forEach(function(k){
    if(t.indexOf(k) >= 0) hit.push(k);
  });
  return hit;
}
function __txt(sel){
  var e = document.querySelector(sel);
  return e ? (e.textContent || '') : '';
}
function __vis(id){
  var e = document.getElementById(id);
  if(!e || e.classList.contains('hidden')) return false;
  var cs = getComputedStyle(e);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}
var MODALS = ['settings-modal','char-modal','treasure-modal','item-modal','battle-modal','trib-modal',
  'enc-modal','reroll-modal','break-modal','off-modal','hatch-modal','story-modal','power-modal','save-modal'];
function __closeAll(){
  MODALS.forEach(function(id){
    var m = document.getElementById(id);
    if(!m || m.classList.contains('hidden')) return;
    var b = m.querySelector('#m-close,#sv-close,#pw-close,#t-close,#it-close,#b-close,#trib-skip,#enc-close,#rr-close,#off-close,#hatch-close,#sto-close,.m-close');
    if(b){ try{ b.click(); }catch(e){} }
    if(!m.classList.contains('hidden')){
      if(id === 'char-modal') return;                 /* 创角框不乱关，交给场景自己点 */
      m.classList.add('hidden');
    }
  });
}
function __imgs(root){
  var out = [];
  Array.prototype.forEach.call(root.querySelectorAll('img'), function(i){
    if(i.complete && i.naturalWidth === 0) out.push(i.getAttribute('src'));
  });
  return out;
}
/* 被祖先 overflow:hidden 裁掉的元素不算视觉溢出（立绘放大裁切就是这么做的） */
function __clipped(e, vw){
  var p = e.parentElement;
  while(p && p !== document.documentElement){
    var cs = getComputedStyle(p);
    if(cs.overflow !== 'visible' || cs.overflowX !== 'visible'){
      var r = p.getBoundingClientRect();
      if(r.left > -1 && r.right < vw + 1) return true;
    }
    p = p.parentElement;
  }
  return false;
}
function __overflow(root){
  var vw = document.documentElement.clientWidth, out = [];
  Array.prototype.forEach.call(root.querySelectorAll('*'), function(e){
    var cs = getComputedStyle(e);
    if(cs.display === 'none' || cs.visibility === 'hidden') return;
    var r = e.getBoundingClientRect();
    if(r.width < 2 || r.height < 2) return;
    if(r.right > vw + 1.5 || r.left < -1.5){
      if(__clipped(e, vw)) return;
      out.push((e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]) +
        ' ' + Math.round(r.left) + '..' + Math.round(r.right));
    }
  });
  return out.slice(0, 6);
}
function __dupIds(){
  var seen = {}, dup = [];
  Array.prototype.forEach.call(document.querySelectorAll('[id]'), function(e){
    if(seen[e.id]) { if(dup.indexOf(e.id) < 0) dup.push(e.id); }
    seen[e.id] = 1;
  });
  return dup;
}
function __btns(){
  var host = document.getElementById('panel-host');
  if(!host) return [];
  return Array.prototype.filter.call(host.querySelectorAll('button'), function(b){
    if(b.classList.contains('panel-back')) return false;
    if(b.closest('.hidden')) return false;
    var cs = getComputedStyle(b);
    if(cs.display === 'none' || cs.visibility === 'hidden') return false;
    var r = b.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  });
}
function __label(b){
  var t = (b.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 14);
  return (b.id ? '#' + b.id + ' ' : '') + (t || b.className.split(' ')[0] || b.tagName);
}
function __done(o){
  var p = document.getElementById('__pt');
  if(!p){ p = document.createElement('pre'); p.id = '__pt'; p.style.display = 'none'; document.body.appendChild(p); }
  p.textContent = JSON.stringify(o).replace(/</g, '\\\\u003c');
}
var O = { state: null, err: [], views: {}, clicks: [], modals: {}, checks: {}, ops: [] };
/* 数值不变量：任何一次操作之后，这些字段都不允许 NaN / Infinity / 负数 */
var NUMK = ['rank','exp','stone','cave','dan','forge','dao','field','mine','herb','ore','weapon',
  'weaponLv','bagSize','tower','towerMax','petSlots','wisdom','insight','failBonus','guardMirror',
  'guardArray','tianji','herb100','herb10000','potion','powScale'];
function __inv(){
  var s = XX._s, bad = [];
  NUMK.forEach(function(k){
    var v = s[k];
    if(v === undefined) return;
    if(typeof v !== 'number' || !isFinite(v) || v < 0) bad.push(k + '=' + JSON.stringify(v));
  });
  if(s.rank > 40) bad.push('rank>' + s.rank);
  var t = __txt('#panel-host');
  __bad(t).forEach(function(k){ if(bad.indexOf('文本 ' + k) < 0) bad.push('文本 ' + k); });
  return bad;
}
function __sig(){
  var s = XX._s;
  return JSON.stringify([s.rank, Math.round(s.exp), Math.round(s.stone), s.herb, s.ore, s.weapon,
    s.weaponLv, s.cave, s.dan, s.forge, s.field, s.mine, s.wisdom, s.insight, s.bag.length,
    s.pets.length, s.eggs.length, s.acts.sit, s.market.sold, s.gate.disciples.length,
    (s.gate.disciples[0] || {}).apt, JSON.stringify(s.dt), s.log.length ? s.log[0].t : '']);
}
async function DEEP(){
  var ops = [
    ['打坐', function(){ XX._act('sit'); }],
    ['采药', function(){ XX._act('herb'); }],
    ['历练', function(){ XX._act('train'); }],
    ['顿悟', function(){ XX._act('enlight'); }],
    ['参悟', function(){ XX._act('ponder'); }],
    ['寻宝', function(){ XX._treasure(); }],
    ['买田', function(){ XX._buyField(); }],
    ['买矿', function(){ XX._buyMine(); }],
    ['扩包', function(){ XX._buyBag(); }],
    ['升丹房', function(){ XX._upgradeBuilding('alchemy'); }],
    ['升器坊', function(){ XX._upgradeBuilding('forge'); }],
    ['炼下品丹', function(){ XX._craftItem('alchemy','dan1'); }],
    ['炼上品丹', function(){ XX._craftItem('alchemy','dan3'); }],
    ['炼器下品', function(){ XX._craftItem('forge','wp1'); }],
    ['猎妖', function(){ XX._hunt('rat'); }],
    ['停猎妖', function(){ XX._stopHunt(); }],
    ['塔挑战', function(){ XX._challengeTower(); }],
    ['塔扫荡', function(){ XX._sweepTower(); }],
    ['论剑', function(){ XX._challengeArena(0); }],
    ['换声望', function(){ XX._buyRep(); }],
    ['秘境挑战', function(){ XX._challengeSecret(0); }],
    ['秘境扫荡', function(){ XX._sweepSecret(); }],
    ['坊市刷新', function(){ XX._refreshMarket(); }],
    ['坊市购入', function(){ XX._buyMarket(0); }],
    ['坊市寄售', function(){ XX._sellMarket(0); }],
    ['清仓材料', function(){ XX._sellAll(); }],
    ['签到', function(){ XX._sign(); }],
    ['争霸战', function(){ XX._unionFight(); }],
    ['领战功', function(){ XX._claimUnion(); }],
    ['山门升级', function(){ XX._gateUp(); }],
    ['收徒', function(){ XX._gateRecruit(); }],
    ['派差事', function(){ var d = XX._gate().disciples.filter(function(x){ return !x.task; })[0]; if(d) XX._gateAssign(d.id, 'herb'); }],
    ['点化', function(){ var d = XX._gate().disciples[0]; if(d) XX._gateApt(d.id); }],
    ['回山结算', function(){ XX._gateSettle(); }],
    ['洞天开辟', function(){ XX._dtOpen('xuan'); }],
    ['换主洞', function(){ XX._dtMainSet('zhu'); }],
    ['悟道树', function(){ XX._wuBuy('sword'); }],
    ['强化法宝', function(){ XX._enhance(); }],
    ['开洗练', function(){ XX._openReroll(); }],
    ['批量播种', function(){ XX._plantAll(); }],
    ['收获', function(){ XX._harvestAll(); }],
    ['穿上法宝', function(){ XX._equipItem('eq_qingfeng'); }],
    ['卸下法宝', function(){ XX._unequipItem('weapon'); }],
    ['孵蛋', function(){ XX._hatch(0); }],
    ['喂灵兽', function(){ XX._feedPet(0); }],
    ['看信', function(){ var l = XX._letters()[0]; if(l) XX._openLetter(l.id); }],
    ['领任务', function(){ var q = (XX._quests() || [])[0]; if(q) XX._claimQuest(q.id); }],
    ['突破', function(){ XX._s.exp = XX._need(XX._s.rank) * 1.05; XX._break(); }],
    ['换剑意', function(){ XX._cycleAura(); }]
  ];
  for(var i = 0; i < ops.length; i++){
    var name = ops[i][0], err0 = __dr.err.length, thrown = '', sig0 = __sig();
    try{ ops[i][1](); }catch(e){ thrown = String(e && e.message || e); }
    /* 战斗类操作是异步结算的（动画走定时器）→ 最多等 800ms 看数值有没有落定 */
    for(var w = 0; w < 10 && __sig() === sig0; w++) await __sleep(80);
    var bad = __inv(), errs = __dr.err.slice(err0).slice(0, 2), noop = __sig() === sig0;
    if(thrown) errs.unshift('throw: ' + thrown);
    if(bad.length || errs.length || noop){
      O.ops.push({ op: name, bad: bad, err: errs, noop: noop });
    }
    __closeAll();
  }
  /* 存盘 → 读盘：把内存写回 localStorage，再对照 load() 能读出来的字段 */
  var st;
  try{ XX._saveText(); st = JSON.parse(localStorage.getItem('xiuxian_save')); }catch(e){ st = null; }
  O.checks.diskAura = st ? st.swordAura : 'none';
  O.checks.memAura = XX._auraIdx();
  O.checks.diskGate = st ? (st.gate || {}).lv : 'none';
  O.checks.diskDt = st ? (st.dt || {}).qing : 'none';
  /* 后期财富标尺：一层的灵石收入（判断 2^31 截断会不会被真实玩家撞上） */
  try{
    var bd = XX._statBreakdown();
    O.checks.rateExp = Math.round(bd.exp.total);
    O.checks.rateStone = Math.round(bd.stone.total);
    O.checks.layerSec = Math.round(XX._need(XX._s.rank) / Math.max(1e-6, bd.exp.total));
    O.checks.layerStone = Math.round(bd.stone.total * (XX._need(XX._s.rank) / Math.max(1e-6, bd.exp.total)));
  }catch(e){ O.checks.rateErr = String(e && e.message || e); }
  /* 32 位截断体检：把灵石抬到 30 亿（后期一层收入就能到），看天机阁还能不能买 */
  try{
    var s = XX._s, save0 = s.stone;
    s.stone = 3e9;
    var price = XX._shopPrice('heart_mirror', 'stone');
    var row = XX._wisdomShop().filter(function(x){ return x.id === 'heart_mirror'; })[0] || {};
    var buyOk = XX._buyShop('heart_mirror');
    O.checks.wrap = {
      stone: 3e9, signed: (3e9 | 0), price: price, enoughFlag: row.enoughStone,
      buyOk: buyOk, paid: 3e9 - s.stone, log: (s.log[0] || {}).t
    };
    s.stone = save0;
    /* 主线发奖同款截断：把一段带 stoneK 的奖励重新发一次，看钱是不是被打回负数 */
    if(window.Story && Story._STORY && Story._STORY.length){
      var seg = Story._STORY.filter(function(q){
        return (q.rw || []).some(function(p){ return p[0] === 'stoneK'; });
      })[0];
      if(!seg) seg = Story._STORY[0];
      delete s.story.claimed[seg.id];
      s.stone = 3e9;
      var got = null;
      try{ got = Story._settle(seg); }catch(e){ got = 'throw ' + (e && e.message); }
      O.checks.wrapStory = { seg: seg.id, rw: JSON.stringify(seg.rw), got: JSON.stringify(got), after: s.stone };
      s.stone = save0;
    }
  }catch(e){ O.checks.wrapErr = String(e && e.message || e); }
}
async function RUN(){
  var ui = (window.__SEED_UI || {});
  for(var w = 0; w < 40 && typeof XX === 'undefined'; w++) await __sleep(100);
  O.booted = typeof XX !== 'undefined' && !!XX._s;
  if(!O.booted){ O.err = __dr.err.slice(); __done(O); return; }
  O.checks.rank = XX._s.rank;
  O.checks.name = XX._s.name;
  O.checks.aura = XX._auraIdx();
  O.checks.auraCls = XX._auraCls();
  O.checks.dtMain = XX._dtMain();
  O.checks.gateLv = XX._gateLv();
  O.checks.disciples = XX._gate().disciples.length;
  O.checks.pets = XX._pets().length;
  O.checks.dupIds = __dupIds();
  O.checks.log = (XX._s.log || []).slice(-4).map(function(x){ return String(x.t || x).slice(0, 60); });
  O.checks.day = { actDay: XX._s.actDay, towerDay: XX._s.towerDay, market: XX._s.market.day,
    arena: XX._s.arena.day, swept: XX._s.towerSwept, marketSold: XX._s.market.sold,
    arenaLeft: XX._s.arena.left, signDays: XX._s.sign.days, plots: XX._s.plots.length,
    hunt: XX._s.huntBeast, gateTask: (XX._s.gate.disciples[0] || {}).task || '' };

  var names = Object.keys(window.VIEWS || {});
  for(var vi = 0; vi < names.length; vi++){
    var name = names[vi];
    __closeAll();
    try{ ROUTER.open(name); }catch(e){ O.views[name] = { openErr: String(e && e.message || e) }; continue; }
    await __sleep(120);
    var host = document.getElementById('panel-host');
    if(!host){ O.views[name] = { noHost: true }; continue; }
    var baseBad = __bad(host.textContent || '');
    var v = {
      bad: baseBad,
      imgs: __imgs(host),
      oflow: __overflow(host),
      btnN: __btns().length
    };
    /* 按钮雨：每个按钮点一下，记录新错误 / 新坏字 */
    var btns = __btns().slice(0, 18), clickIssues = [];
    for(var bi = 0; bi < btns.length; bi++){
      var b = btns[bi];
      if(!b.isConnected) continue;
      var label = __label(b), before = __dr.err.length;
      try{ b.click(); }catch(e){ __dr.err.push('click-throw: ' + label + ' -> ' + (e && e.message)); }
      await __sleep(45);
      var fresh = __dr.err.slice(before);
      var nowBad = __bad(__txt('#panel-host')).filter(function(k){ return baseBad.indexOf(k) < 0; });
      if(fresh.length || nowBad.length){
        clickIssues.push({ v: name, b: label, err: fresh.slice(0, 2), bad: nowBad });
      }
      __closeAll();
      if(clickIssues.length >= 8) break;
    }
    if(clickIssues.length) v.clicks = clickIssues;
    O.views[name] = v;
  }

  /* 弹窗巡检：能确定开法的都开一遍 */
  __closeAll();
  var mods = [
    ['settings-modal', function(){ document.getElementById('sc-settings').click(); }],
    ['power-modal',    function(){ XX._openPower(); }],
    ['save-modal',     function(){ XX._openSave(); }],
    ['item-modal',     function(){ XX._itemDetail(0); }]
  ];
  for(var mi = 0; mi < mods.length; mi++){
    var mid = mods[mi][0];
    __closeAll();
    var err0 = __dr.err.length;
    try{ mods[mi][1](); }catch(e){ __dr.err.push('modal-open: ' + mid + ' -> ' + (e && e.message)); }
    await __sleep(120);
    O.modals[mid] = {
      open: __vis(mid),
      bad: __bad(__txt('#' + mid)),
      err: __dr.err.slice(err0).slice(0, 3)
    };
    __closeAll();
    O.modals[mid].closed = !__vis(mid);
  }

  /* 指令雨：把每个系统接口都真调一遍，看数值会不会脏 */
  if(ui.deep){ await DEEP(); }

  O.err = __dr.err.slice();
  __done(O);
}
setTimeout(function(){ RUN().catch(function(e){ O.fatal = String(e && e.stack || e); __done(O); }); }, 700);
setTimeout(function(){ if(!document.getElementById('__pt')){ O.timeout = true; __done(O); } }, 24000);
`;

function runState(name) {
  const save = STATES[name] ? STATES[name]() : null;
  const seed = save == null ? '' :
    '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) +
    ');localStorage.setItem("hasFinishedTutorial","1");' +
    'window.__SEED_UI=' + JSON.stringify((save && save.ui) || {}) + ';}catch(e){}</scr' + 'ipt>';
  const file = path.join(ROOT, '._dr_' + name + '_' + process.pid + '.html');
  fs.writeFileSync(file, HTML
    .replace('</head>', seed + '\n</head>')
    .replace('</body>', '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>' +
      '<script>' + PROBE + '</scr' + 'ipt>\n</body>'), 'utf8');
  const ud = path.join(SCRATCH, 'xxdr' + process.pid + '_' + Date.now() + '_' + name);
  let dom = '';
  try {
    dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
      '--user-data-dir=' + ud, '--virtual-time-budget=26000', '--window-size=900,1200',
      '--dump-dom', 'file:///' + file.replace(/\\/g, '/')],
      { encoding: 'utf8', timeout: 180000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    dom = String((e && e.stdout) || '');
  } finally {
    try { fs.rmSync(file, { force: true }); } catch (e) {}
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
  }
  const m = dom.match(/<pre id="__pt"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) return { state: name, probe: 'NO_REPORT' };
  try {
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  } catch (e) {
    return { state: name, probe: 'PARSE_FAIL', raw: m[1].slice(0, 200) };
  }
}

function report(name, d) {
  console.log('\n━━━━━━━━━━ 状态：' + name + ' ━━━━━━━━━━');
  if (d.probe) { console.log('  探针异常：' + d.probe + ' ' + (d.raw || '')); return; }
  if (!d.booted) { console.log('  未 boot：' + JSON.stringify((d.err || []).slice(0, 5))); return; }
  const c = d.checks || {};
  console.log('  rank=' + c.rank + ' name=' + JSON.stringify(c.name) + ' aura=' + c.aura +
    '(' + c.auraCls + ') dt=' + JSON.stringify(c.dtMain) + ' gate=' + c.gateLv + '/' + c.disciples +
    ' pets=' + c.pets);
  if (c.dupIds && c.dupIds.length) console.log('  ⚠ 重复 id：' + c.dupIds.join(', '));
  if (c.day) console.log('  跨天链：' + JSON.stringify(c.day));
  if (d.checks && d.checks.diskAura !== undefined) {
    console.log('  存盘剑意=' + d.checks.diskAura + '，内存剑意=' + d.checks.memAura +
      '（seed 期望 ' + JSON.stringify((STATES[name]() || {}).swordAura || 0) + '）');
  }
  if (d.checks && d.checks.layerStone !== undefined) {
    console.log('  标尺：修为 ' + d.checks.rateExp + '/秒，灵石 ' + d.checks.rateStone + '/秒，一层约 ' +
      d.checks.layerSec + ' 秒 = ' + d.checks.layerStone + ' 灵石');
  }
  if (d.checks && d.checks.wrap) {
    const w = d.checks.wrap;
    console.log('  32 位体检：灵石 3e9 →(|0)= ' + w.signed + '，天机阁报价 ' + w.price +
      '，UI 说够不够=' + w.enoughFlag + '，买成功=' + w.buyOk + '，实付 ' + w.paid + '，日志「' + w.log + '」');
  }
  if (d.checks && d.checks.wrapStory) {
    const w = d.checks.wrapStory;
    console.log('  主线发奖体检：' + w.seg + ' rw=' + w.rw + ' → ' + w.got + '，发奖后灵石 = ' + w.after);
  }
  if (d.checks && d.checks.wrapErr) console.log('  32 位体检异常：' + d.checks.wrapErr);
  if (d.ops && d.ops.length) {
    console.log('  ⚠ 指令雨问题 ' + d.ops.length + ' 条：');
    d.ops.forEach(o => console.log('    · ' + o.op +
      (o.noop ? ' [没动静]' : '') + '：' +
      ((o.bad || []).join(' ') || '') + ' ' + ((o.err || []).join(' ') || '')));
  }
  if (d.err && d.err.length) {
    console.log('  ⚠ 页面错误 ' + d.err.length + ' 条：');
    d.err.slice(0, 12).forEach(e => console.log('    · ' + e));
  }
  Object.keys(d.views || {}).forEach(v => {
    const x = d.views[v], bits = [];
    if (x.openErr) bits.push('打开失败 ' + x.openErr);
    if (x.bad && x.bad.length) bits.push('坏字 ' + x.bad.join('/'));
    if (x.imgs && x.imgs.length) bits.push('破图 ' + x.imgs.join(' '));
    if (x.oflow && x.oflow.length) bits.push('溢出 ' + x.oflow.join(' ; '));
    if (x.clicks && x.clicks.length) bits.push('点击问题 ' + JSON.stringify(x.clicks));
    if (bits.length) console.log('  ⚠ ' + v + '（' + x.btnN + ' 按钮）：' + bits.join(' | '));
  });
  Object.keys(d.modals || {}).forEach(m => {
    const x = d.modals[m], bits = [];
    if (!x.open) bits.push('打不开');
    if (!x.closed) bits.push('关不掉');
    if (x.bad && x.bad.length) bits.push('坏字 ' + x.bad.join('/'));
    if (x.err && x.err.length) bits.push('错误 ' + JSON.stringify(x.err));
    if (bits.length) console.log('  ⚠ 弹窗 ' + m + '：' + bits.join(' | '));
  });
  console.log('  结论：' + ((d.err || []).length === 0 &&
    Object.keys(d.views || {}).every(v => !(d.views[v].bad || []).length &&
      !(d.views[v].imgs || []).length && !(d.views[v].oflow || []).length &&
      !(d.views[v].clicks || []).length) ? '干净' : '见上'));
}

const argv = process.argv.slice(2);
const pick = argv.length ? argv : Object.keys(STATES);
pick.forEach(n => {
  if (!STATES[n]) { console.log('未知状态：' + n); return; }
  const t = Date.now();
  const d = runState(n);
  console.log('\n[' + n + '] ' + ((Date.now() - t) / 1000).toFixed(1) + 's');
  report(n, d);
});
