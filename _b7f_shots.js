'use strict';
/* batch7 跟进单实拍：城镇道途横幅 / 背包满购买提示 / 战斗多回合连续帧 */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js'); const { execEdge } = require('./tools/edge-run.js'); PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const OUT = path.join('D:/xx-scratch/log/batch7_review_20261123/shots_followup');
fs.mkdirSync(OUT, { recursive: true });
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => claimed[id] = t);
const base = { name: '青玄子', sex: 'm', gender: 'male', robe: 'bai', rank: 8, exp: 0, stone: 90000, herb: 50, ore: 50, cave: 1, dan: 1, forge: 1, dao: 0, rootIdx: 1, gong1: 3, gong2: 0, gong3: 0, field: 1, mine: 1, weapon: 3, weaponLv: 2, bagSize: 20, tower: 1, towerMax: 1, petSlots: 1, wisdom: 0, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0, herb100: 0, herb10000: 0, log: [], bag: [], recipeN: {}, mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 }, stats: { sit: 5, herb: 5, train: 3, enlight: 1, craftPill: 1, explore: 1, hunt: 1, enhance: 0, stoneEarned: 0, farmN: 0 }, plots: [], pets: [], eggs: [], arena: { day: '', left: 3, foes: [], tier: 1, win: 0, lose: 0, rep: 0, proxyDay: '' }, union: { start: t, day: '', left: 1, merit: 0, claimed: [], season: 1 }, sign: { days: 0, last: '' }, secret: { prog: [1, 0, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0, enc: { t: 0, bubble: null, lastId: '', seen: {} }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed: claimed }, equipment: { weapon: null, armor: null, accessory: null }, shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 }, market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 }, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', gate: { lv: 1, grad: 0, disciples: [] }, coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 }, lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 }, unlocks: [], blueprints: {}, bpShop: { week: '', bought: 0 }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 8 }, trail3: { i: 3 }, life: { age: 40, on: true, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null }, mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, guide: { step: 0, done: true, skipped: true, started: true, flags: {}, rewardClaims: {}, toldSystems: {} }, art: { bg: 1, brk: 0, cai: 0 }, last: t };
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const BOOT = 'try{if(window.Tutorial)Tutorial.finish();var sm=document.getElementById("story-modal");if(sm&&!sm.classList.contains("hidden")){var sc=document.getElementById("sto-close");if(sc)sc.click();}}catch(e){}';

const shots = [
  /* A. 城镇页 + 道途纸签（9/12）：观察是否压藏经阁、是否覆盖可点建筑 */
  ['f_town_trail_430x900.png', 430, 900, 6000, FREEZE, BOOT + `
    if(window.switchTab) window.switchTab('town'); try{ROUTER.toScene('town');}catch(e){}
    XX._s.trail={i:8}; XX._s.trail2={i:8}; XX._s.trail3={i:3}; XX._render();`],
  /* B. 背包满时点购买：toast 明确可见（真实时钟，避免虚拟时间把 toast 快进掉） */
  ['f_bagfull_buy_430x900.png', 430, 900, 0, '', BOOT + `
    XX._s.rank=8; XX._s.stone=90000; XX._s.bagSize=56;
    XX._s.bag=[]; for(var i=0;i<56;i++) XX._s.bag.push({t:'mat_bone',n:'兽骨'});
    var d=new Date(); var key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    XX._s.market={day:key, goods:[{id:'dan1',price:100,bought:false}], buyRate:1, sellRate:1, sold:0, freeRefresh:1};
    try{ ROUTER.open('market','mk-goods'); }catch(e){}
    XX._render();
    setTimeout(function(){
      var btn=document.querySelector('#mk-goods [data-buy]');
      if(btn){ btn.click(); }
    }, 300);`, 1900],
  /* C. 窄屏城镇（360）：横幅不压题签/建筑 */
  ['f_town_trail_360x640.png', 360, 640, 6000, FREEZE, BOOT + `
    if(window.switchTab) window.switchTab('town'); try{ROUTER.toScene('town');}catch(e){}
    XX._s.trail={i:8}; XX._s.trail2={i:8}; XX._s.trail3={i:3}; XX._render();`]
];

for (const [name, w, h, budget, freeze, body, realWait] of shots) {
  const f = path.join(PAGE.SCRATCH, '._b7fshot_' + name + '.html');
  PAGE.writePage(f, html.replace('</head>', seed + '\n' + (freeze || '') + '\n</head>').replace('</body>',
    '<script>window.addEventListener("load",function(){setTimeout(function(){try{' + body + '}catch(e){console.error(e);}},800);});</script></body>'));
  const out = path.join(OUT, name);
  const ud = path.join('D:/xx-scratch', 'xxb7fshot' + Date.now() + '_' + w);
  try {
    const edgeArgs = ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + ud]
      .concat(realWait ? ['--real-wait=' + realWait] : ['--virtual-time-budget=' + budget])
      .concat(['--window-size=' + w + ',' + h, '--screenshot=' + out, 'file:///' + f.replace(/\\/g, '/')]);
    execEdge(edgeArgs, { timeout: 180000, stdio: ['ignore', 'ignore', 'pipe'] });
    console.log('截图 ' + name.padEnd(34) + (fs.existsSync(out) ? ('OK ' + fs.statSync(out).size + 'B') : 'MISS'));
  } catch (e) { console.log('截图 ' + name.padEnd(34) + 'ERR ' + (e && e.message)); }
  finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
}