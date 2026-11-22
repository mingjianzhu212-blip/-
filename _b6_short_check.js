'use strict';
/* batch6 矮窗口几何：360x520 / 360x640 下弹窗按钮、圆钮、底部导航不互相压 */
const fs = require('node:fs'), path = require('node:path'); const ROOT = __dirname;
const PAGE = require('./tools/page.js'); const { execEdge } = require('./tools/edge-run.js'); PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => claimed[id] = t);
const base = { name: '青玄子', sex: 'm', gender: 'male', robe: 'bai', rank: 8, exp: 0, stone: 9000, herb: 50, ore: 50, cave: 1, dan: 1, forge: 1, dao: 0, rootIdx: 1, gong1: 3, gong2: 0, gong3: 0, field: 1, mine: 1, weapon: 3, weaponLv: 2, bagSize: 20, tower: 1, towerMax: 1, petSlots: 1, wisdom: 0, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0, herb100: 0, herb10000: 0, log: [], bag: [], recipeN: {}, mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 }, stats: { sit: 5, herb: 5, train: 3, enlight: 1, craftPill: 1, explore: 1, hunt: 1, enhance: 0, stoneEarned: 0, farmN: 0 }, plots: [], pets: [], eggs: [], arena: { day: '', left: 3, foes: [], tier: 1, win: 0, lose: 0, rep: 0, proxyDay: '' }, union: { start: t, day: '', left: 1, merit: 0, claimed: [], season: 1 }, sign: { days: 0, last: '' }, secret: { prog: [1, 0, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0, enc: { t: 0, bubble: null, lastId: '', seen: {} }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed: claimed }, equipment: { weapon: null, armor: null, accessory: null }, shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 }, market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 }, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', gate: { lv: 1, grad: 0, disciples: [] }, coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 }, lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 }, unlocks: [], blueprints: {}, bpShop: { week: '', bought: 0 }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 12 }, trail3: { i: 3 }, life: { age: 40, on: true, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null }, mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, guide: { step: 0, done: true, skipped: true, started: true, flags: {}, rewardClaims: {}, toldSystems: {} }, art: { bg: 1, brk: 0, cai: 0 }, last: t };
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const SCRIPT = `
  var sleep=ms=>new Promise(r=>setTimeout(r,ms)); await sleep(700);
  var sm=document.getElementById('story-modal');if(sm&&!sm.classList.contains('hidden'))document.getElementById('sto-close').click();
  await sleep(400);
  function rect(el){if(!el)return null;var r=el.getBoundingClientRect();return {t:Math.round(r.top),b:Math.round(r.bottom),l:Math.round(r.left),r:Math.round(r.right),w:Math.round(r.width),h:Math.round(r.height)};}
  var vh=innerHeight,vw=innerWidth;
  var bc=document.getElementById('break-confirm-modal');bc.classList.remove('hidden');
  await sleep(200);
  var card=bc.querySelector('.m-card');if(card)card.scrollTop=card.scrollHeight;
  await sleep(200);
  o.break={vh:vh,vw:vw,card:rect(card),ok:rect(document.getElementById('bc-ok')),cancel:rect(document.getElementById('bc-cancel'))};
  if(!o.break.ok||o.break.ok.t<0||o.break.ok.b>vh) o.errs.push('破境确认按钮被裁: '+JSON.stringify(o.break));
  bc.classList.add('hidden');
  XX._openEncounter('lantern_seller');await sleep(250);
  var em=document.getElementById('enc-modal');var opts=Array.prototype.map.call(em.querySelectorAll('.enc-opt'),rect);
  o.enc={card:rect(em.querySelector('.m-card')),opts:opts};
  if(!opts.length||opts.some(function(r){return r.t<0||r.b>vh;})) o.errs.push('奇遇选项被裁: '+JSON.stringify(o.enc));
  XX._closeEncounter();await sleep(200);
  var ar=document.querySelector('.act-rail'), sr=document.querySelector('.sys-rail'), tabs=document.querySelector('.scene-tabs');
  o.scene={act:rect(ar),sys:rect(sr),tabs:rect(tabs)};
  var chips=Array.prototype.map.call(document.querySelectorAll('.sys-btn'),rect);
  o.scene.sysChips=chips;
  for(var i=1;i<chips.length;i++){ if(chips[i].t < chips[i-1].b - 1) o.errs.push('右侧圆钮重叠 i='+i); }
  if(ar&&tabs&&ar.b>tabs.t) o.errs.push('左圆钮压到底部导航');
  if(sr&&tabs&&sr.b>tabs.t) o.errs.push('右圆钮压到底部导航');
  if(tabs&&tabs.t<0) o.errs.push('底部导航出屏');
`;
const DIAG = `(async function(){var o={ok:true,errs:[]};var sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{${SCRIPT}}catch(e){o.ok=false;o.errs.push(String(e&&e.stack||e));}
document.getElementById('diag').textContent='G='+JSON.stringify(o);})();`;
for (const [w, h] of [[360, 520], [360, 640]]) {
  const f = path.join(PAGE.SCRATCH, '._b6short_' + w + 'x' + h + '.html');
  PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', '<style>*{animation-duration:0s!important;transition:none!important}</style><div id="diag" style="position:fixed;left:0;top:0;font:9px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all;z-index:99999"></div><script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},600);});</script></body>'));
  const ud = path.join('D:/xx-scratch', 'xxb6short' + Date.now() + '_' + h);
  try {
    const out = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + ud, '--virtual-time-budget=12000', '--window-size=' + w + ',' + h, '--dump-dom', 'file:///' + f.replace(/\\/g, '/')], { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
    const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
    console.log(w + 'x' + h + ' ' + (m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG'));
  } catch (e) { console.log(w + 'x' + h + ' ERR ' + e.message); }
  finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
}