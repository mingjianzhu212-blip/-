'use strict';
/* batch6 补单探针：历练事件对决前示战力 + 打坐/历练日课对账 */
const fs = require('node:fs'), path = require('node:path'); const ROOT = __dirname;
const PAGE = require('./tools/page.js'); const { execEdge } = require('./tools/edge-run.js'); PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => claimed[id] = t);
const base = { name: '青玄子', sex: 'm', gender: 'male', robe: 'bai', rank: 5, exp: 1, stone: 9000, herb: 25, ore: 25, cave: 1, dan: 1, forge: 1, dao: 0, rootIdx: 1, gong1: 2, gong2: 0, gong3: 0, field: 0, mine: 0, weapon: 2, weaponLv: 1, bagSize: 20, tower: 0, towerMax: 0, petSlots: 1, wisdom: 0, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0, herb100: 0, herb10000: 0, log: [], bag: [], recipeN: {}, mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 }, stats: { sit: 0, herb: 0, train: 0, enlight: 0, craftPill: 0, explore: 0, hunt: 0, enhance: 0, stoneEarned: 0, farmN: 0 }, plots: [], pets: [], eggs: [], arena: { day: '', left: 3, foes: [], tier: 1, win: 0, lose: 0, rep: 0, proxyDay: '' }, union: { start: t, day: '', left: 1, merit: 0, claimed: [], season: 1 }, sign: { days: 0, last: '' }, secret: { prog: [0, 0, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0, enc: { t: 0, bubble: null, lastId: '', seen: {} }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed: claimed }, equipment: { weapon: null, armor: null, accessory: null }, shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 }, market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 }, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', gate: { lv: 0, grad: 0, disciples: [] }, coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 }, lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 }, unlocks: [], blueprints: {}, bpShop: { week: '', bought: 0 }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 12 }, trail3: { i: 3 }, life: { age: 40, on: true, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null }, mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, guide: { step: 0, done: true, skipped: true, started: true, flags: {}, rewardClaims: {}, toldSystems: {} }, art: { bg: 1, brk: 0, cai: 0 }, last: t };
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");localStorage.removeItem("jxwd_daily_v1");}catch(e){}</scr' + 'ipt>';
const SCRIPT = `
  var sleep=ms=>new Promise(r=>setTimeout(r,ms));await sleep(900);
  var sm=document.getElementById('story-modal');if(sm&&!sm.classList.contains('hidden'))document.getElementById('sto-close').click();
  await sleep(400);
  /* 补1：历练事件对决前示战力 */
  XX._openAdventure();await sleep(250);
  var foe=XX._advFoeCur();
  o.adv={foe:foe?foe.name:'none',power:foe?foe.power:0,
    text:(document.getElementById('enc-text')||{}).textContent||'',
    opts:Array.prototype.map.call(document.querySelectorAll('#enc-opts .enc-opt small'),function(e){return e.textContent;}).join('|')};
  if(!(foe&&o.adv.text.indexOf('对手【'+foe.name+'】战力')>=0&&(o.adv.text.indexOf('领先')>=0||o.adv.text.indexOf('差 ')>=0)&&o.adv.opts.indexOf('对战 '+foe.name+' · 战力')>=0)) o.errs.push('历练对决前未示战力/差距: '+JSON.stringify(o.adv));
  var foeName=foe?foe.name:'';
  XX._resolveAdventure(0);await sleep(250);
  o.adv.log=(XX._s.log[0]&&XX._s.log[0].t)||'';
  if(o.adv.log.indexOf(foeName)<0) o.errs.push('历练结算对手与展示不一致: '+o.adv.log+' vs '+foeName);
  var em=document.getElementById('enc-modal');if(em&&!em.classList.contains('hidden'))XX._closeEncounter();
  /* 补2：实做一次打坐、一次历练，读今日清单与藏经阁日课页眉 */
  ROUTER.open('today');await sleep(400);
  o.todayHeader=(document.getElementById('today-reset')||{}).textContent||'';
  if(o.todayHeader.indexOf('已达成 ')<0) o.errs.push('今日页页眉缺达成计数: '+o.todayHeader);
  function rowsNow(){return Array.prototype.map.call(document.querySelectorAll('#today-list .today-row'),function(r){return r.textContent;}).filter(function(x){return /打坐练气|外出历练/.test(x);});}
  o.rows0=rowsNow();
  XX._act('sit');await sleep(1200);
  o.sitState=window.Daily._state().prog.sit;
  o.rowsSit=rowsNow();
  if(!(o.sitState===1&&o.rowsSit.join('|').indexOf('进度 1 / 10')>=0)) o.errs.push('打坐一次清单未 +1: '+JSON.stringify({s:o.sitState,r:o.rowsSit}));
  XX._act('train');await sleep(1200);
  o.trainState=window.Daily._state().prog.train;
  o.rowsTrain=rowsNow();
  if(!(o.trainState===1&&o.rowsTrain.join('|').indexOf('进度 1 / 3')>=0)) o.errs.push('历练一次清单未 +1: '+JSON.stringify({s:o.trainState,r:o.rowsTrain}));
  ROUTER.open('xiu','xx-quest');await sleep(400);
  o.questHead=(Array.prototype.filter.call(document.querySelectorAll('#page-xiu .q-sec-h'),function(e){return e.textContent.indexOf('今日 · 日课')>=0;})[0]||{}).textContent||'';
  if(o.questHead.indexOf('满进度算 1 项')<0) o.errs.push('日课页眉口径未写明: '+o.questHead);
`;
const DIAG = `(async function(){var o={ok:true,errs:[]};var sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{${SCRIPT}}catch(e){o.ok=false;o.errs.push(String(e&&e.stack||e));}
document.getElementById('diag').textContent='G='+JSON.stringify(o);})();`;
const f = path.join(PAGE.SCRATCH, '._b6supp.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', '<style>*{animation:none!important;transition:none!important}</style><div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div><script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},800);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxb6supp' + Date.now());
let exitCode = 1;
try {
  const out = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + ud, '--virtual-time-budget=14000', '--window-size=430,900', '--dump-dom', 'file:///' + f.replace(/\\/g, '/')], { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const r = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(r);
  let o = null; try { o = JSON.parse(r.replace(/^G=/, '')); } catch (e) {}
  const ok = !!(o && o.ok && o.errs.length === 0);
  console.log(ok ? 'B6-SUPP PASS' : 'B6-SUPP FAIL');
  exitCode = ok ? 0 : 1;
} catch (e) { console.log('ERR ' + e.message); }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
process.exit(exitCode);