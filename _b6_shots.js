'use strict';
/* batch6 实拍：矮窗口弹窗 + 子页六项资源行 */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js'); const { execEdge } = require('./tools/edge-run.js'); PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const OUT = path.join('D:/xx-scratch/log/batch6_20261122');
const t = Date.now(), claimed = {};['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => claimed[id] = t);
const base = { name: '青玄子', sex: 'm', gender: 'male', robe: 'bai', rank: 8, exp: 0, stone: 9000, herb: 50, ore: 50, cave: 1, dan: 1, forge: 1, dao: 0, rootIdx: 1, gong1: 3, gong2: 0, gong3: 0, field: 1, mine: 1, weapon: 3, weaponLv: 2, bagSize: 20, tower: 1, towerMax: 1, petSlots: 1, wisdom: 0, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0, herb100: 0, herb10000: 0, log: [], bag: [], recipeN: {}, mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 }, stats: { sit: 5, herb: 5, train: 3, enlight: 1, craftPill: 1, explore: 1, hunt: 1, enhance: 0, stoneEarned: 0, farmN: 0 }, plots: [], pets: [], eggs: [], arena: { day: '', left: 3, foes: [], tier: 1, win: 0, lose: 0, rep: 0, proxyDay: '' }, union: { start: t, day: '', left: 1, merit: 0, claimed: [], season: 1 }, sign: { days: 0, last: '' }, secret: { prog: [1, 0, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0, enc: { t: 0, bubble: null, lastId: '', seen: {} }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed: claimed }, equipment: { weapon: null, armor: null, accessory: null }, shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 }, market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 }, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', gate: { lv: 1, grad: 0, disciples: [] }, coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 }, lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 }, unlocks: [], blueprints: {}, bpShop: { week: '', bought: 0 }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 12 }, trail3: { i: 3 }, life: { age: 40, on: true, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null }, mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, guide: { step: 0, done: true, skipped: true, started: true, flags: {}, rewardClaims: {}, toldSystems: {} }, art: { bg: 1, brk: 0, cai: 0 }, last: t };
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const shots = [
  ['b6_short_break_360x520.png', 360, 520, 'document.getElementById("break-confirm-modal").classList.remove("hidden");'],
  ['b6_short_enc_360x520.png', 360, 520, 'XX._openEncounter("lantern_seller");'],
  ['b6_pageres_430.png', 430, 900, 'ROUTER.open("dong","xx-dongtian-sec");']
];
for (const [name, w, h, body] of shots) {
  const f = path.join(PAGE.SCRATCH, '._b6shot_' + name + '.html');
  PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE +
    '<script>window.addEventListener("load",function(){setTimeout(function(){try{if(window.Tutorial)Tutorial.finish();var sm=document.getElementById("story-modal");if(sm&&!sm.classList.contains("hidden")){var sc=document.getElementById("sto-close");if(sc)sc.click();}' + body + 'XX._render();}catch(e){}},800);});</script></body>'));
  const out = path.join(OUT, name);
  const ud = path.join('D:/xx-scratch', 'xxb6shot' + Date.now() + '_' + w);
  try {
    execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + ud,
      '--virtual-time-budget=9000', '--window-size=' + w + ',' + h, '--screenshot=' + out,
      'file:///' + f.replace(/\\/g, '/')], { timeout: 120000, stdio: ['ignore', 'ignore', 'pipe'] });
    console.log('截图 ' + name.padEnd(34) + (fs.existsSync(out) ? ('OK ' + fs.statSync(out).size + 'B') : 'MISS'));
  } catch (e) { console.log('截图 ' + name.padEnd(34) + 'ERR ' + (e && e.message)); }
  finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
}