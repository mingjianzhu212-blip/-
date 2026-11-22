'use strict';
/* batch6 探针：引导层级/论剑战力解读/残留词/今日计数/解锁时序/飘字/演出顺序/奇遇空选/入门八事/子页资源行 */
const fs = require('node:fs'), path = require('node:path'); const ROOT = __dirname;
const PAGE = require('./tools/page.js'); const { execEdge } = require('./tools/edge-run.js'); PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => claimed[id] = t);
const base = { name: '青玄子', sex: 'm', gender: 'male', robe: 'bai', rank: 12, exp: 0, stone: 200000, herb: 200, ore: 200, cave: 1, dan: 1, forge: 1, dao: 0, rootIdx: 1, gong1: 4, gong2: 2, gong3: 0, field: 1, mine: 1, weapon: 3, weaponLv: 2, bagSize: 30, tower: 1, towerMax: 0, petSlots: 3, wisdom: 0, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 2, herb100: 0, herb10000: 0, log: [], bag: [{ t: 'dan1', n: '下品破境丹' }], recipeN: {}, mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 }, stats: { sit: 5, herb: 5, train: 3, enlight: 1, craftPill: 0, explore: 0, hunt: 0, enhance: 0, stoneEarned: 0, farmN: 0 }, plots: [], pets: [{ bid: 'rat', lv: 1, exp: 0 }], eggs: [], arena: { day: '', left: 0, foes: [], tier: 1, win: 0, lose: 0, rep: 0, proxyDay: '' }, union: { start: t, day: '', left: 1, merit: 0, claimed: [], season: 1 }, sign: { days: 7, last: '' }, secret: { prog: [0, 0, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0, enc: { t: 0, bubble: null, lastId: '', seen: {} }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed: claimed }, equipment: { weapon: null, armor: null, accessory: null }, shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 }, market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 }, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', gate: { lv: 1, grad: 0, disciples: [] }, coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 }, lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 }, unlocks: [], blueprints: {}, bpShop: { week: '', bought: 0 }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 12 }, trail3: { i: 3 }, life: { age: 40, on: true, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null }, mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, guide: { step: 0, done: false, skipped: false, started: true, flags: {}, rewardClaims: {}, toldSystems: {} }, art: { bg: 1, brk: 0, cai: 0 }, last: t };
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const SCRIPT = `
  var sleep=ms=>new Promise(r=>setTimeout(r,ms));
  await sleep(700);
  var sm=document.getElementById('story-modal');if(sm&&!sm.classList.contains('hidden'))document.getElementById('sto-close').click();
  await sleep(900);
  /* 探针清场后显式起引导：层级测试只关心气泡与弹窗的相对关系 */
  document.querySelectorAll('.modal').forEach(function(m){m.classList.add('hidden');});
  try{ if(window.Guide) Guide.init(); }catch(e){}
  await sleep(600);
  var S=XX._s;
  /* 1. 引导层级 / 点击推进 / 弹窗让位 */
  var g=document.getElementById('taixu-bubble');
  o.guide={exists:!!g, z:g?(+getComputedStyle(g).zIndex||0):0, text:(g&&g.querySelector('.tb-text')||{}).textContent||''};
  if(!g) o.errs.push('引导气泡未出现（seed 未生效）');
  else{
    var t0=o.guide.text; g.click(); await sleep(250);
    o.guide.after=(g.querySelector('.tb-text')||{}).textContent||'';
    if(!(o.guide.after&&o.guide.after!==t0)) o.errs.push('点击未推进气泡: '+JSON.stringify(o.guide));
  }
  var bc=document.getElementById('break-confirm-modal'); bc.classList.remove('hidden');
  await sleep(500);
  o.guide.modal={bubble:g?getComputedStyle(g).display:'none',bubbleZ:g?+getComputedStyle(g).zIndex:0,modalZ:+getComputedStyle(bc).zIndex};
  if(!(o.guide.modal.bubble==='none'&&o.guide.modal.bubbleZ<o.guide.modal.modalZ&&o.guide.modal.bubbleZ<50)) o.errs.push('气泡未让位/层级不对: '+JSON.stringify(o.guide.modal));
  bc.classList.add('hidden'); await sleep(500);
  o.guide.back=g?getComputedStyle(g).display:'none';
  if(o.guide.back==='none') o.errs.push('弹窗关闭后气泡未复出');
  /* 2. 论剑对决前战力解读 */
  S.arena.day=XX._todayKey();S.arena.left=5;S.arena.foes=[{name:'甲',power:1,beat:false},{name:'乙',power:1e12,beat:false},{name:'丙',power:1,beat:false},{name:'丁',power:1,beat:false},{name:'戊',power:1,beat:false},{name:'己',power:1,beat:false}];
  ROUTER.open('arena','ar-board');await sleep(500);
  XX._arenaPick(0);await sleep(200);
  o.arenaAhead=(document.getElementById('st-text')||{}).textContent||'';
  document.getElementById('st-close').click();
  XX._arenaPick(1);await sleep(200);
  o.arenaBehind=(document.getElementById('st-text')||{}).textContent||'';
  document.getElementById('st-close').click();
  if(!(/领先/.test(o.arenaAhead)&&/差 /.test(o.arenaBehind)&&/建议/.test(o.arenaBehind))) o.errs.push('论剑战力解读缺项: '+JSON.stringify({a:o.arenaAhead,b:o.arenaBehind}));
  /* 3. 可见文本残留词扫描（多页） */
  var WORDS=['未动','未改','按现行','现行规则','口径','不新增','零新增','本版','定版','账目','占位','临时','TODO','FIXME','console','debugger','测试一下'];
  var routes=[['role'],['dong'],['xiu'],['zong'],['market'],['secret'],['event'],['arena'],['tower'],['bag'],['chong'],['codex'],['today']];
  var hits=[];
  for(var ri=0;ri<routes.length;ri++){
    try{ROUTER.open(routes[ri][0]);await sleep(250);}catch(e){}
    var txt=(document.body.innerText||'');
    WORDS.forEach(function(w){ if(txt.indexOf(w)>=0) hits.push(routes[ri][0]+':'+w); });
  }
  o.residue=hits;
  if(hits.length) o.errs.push('可见文本残留: '+hits.join(','));
  /* 4. 今日清单签到天数：已签今天显示刚签的那一天 */
  S.sign.days=7;S.sign.last=XX._todayKey();XX._renderToday();await sleep(200);
  var signRow=Array.prototype.filter.call(document.querySelectorAll('#today-list .today-row'),function(r){return r.textContent.indexOf('七日签到')>=0;})[0];
  var first=signRow?signRow.querySelector('.tr-main small').textContent:'';
  o.signLabel={text:first};
  if(first.indexOf('第 7 天')<0) o.errs.push('签到天数口径不符: '+first);
  /* 5. 解锁插屏：当下弹出 + 关闭后逐张排队 */
  S.rank=5;S.unlocks=[];ROUTER.open('scene');await sleep(300);
  XX._queueUnlocks(5,12);XX._render();await sleep(400);
  var cs=document.getElementById('craft-settle');
  o.unlock1={vis:cs&&!cs.classList.contains('hidden'),title:(document.getElementById('cs-title')||{}).textContent||''};
  if(!(o.unlock1.vis&&o.unlock1.title.indexOf('新功能解锁')>=0)) o.errs.push('解锁未当下弹出: '+JSON.stringify(o.unlock1));
  document.getElementById('cs-close').click();await sleep(500);
  o.unlock2={vis:!cs.classList.contains('hidden'),title:(document.getElementById('cs-title')||{}).textContent||''};
  if(!(o.unlock2.vis&&o.unlock2.title.indexOf('新功能解锁')>=0&&o.unlock2.title!==o.unlock1.title)) o.errs.push('解锁未逐张排队: '+JSON.stringify(o.unlock2));
  while(!cs.classList.contains('hidden')){document.getElementById('cs-close').click();await sleep(250);}
  /* 6. 服丹 / 喂食飘字 */
  S.rank=12;S.bag=[{t:'dan1',n:'下品破境丹'}];XX._render();await sleep(200);
  XX._eat(0,'eat');await sleep(150);
  o.pillFloat=Array.prototype.map.call(document.querySelectorAll('.spend-float.gain'),function(e){return e.textContent;}).join('|');
  if(!/修为|生效/.test(o.pillFloat)) o.errs.push('服丹无飘字: '+o.pillFloat);
  await sleep(1000);
  S.pets=[{bid:'rat',lv:1,exp:0}];ROUTER.open('chong');await sleep(400);
  XX._feedPet(0);await sleep(150);
  o.feedFloat=Array.prototype.map.call(document.querySelectorAll('.spend-float.gain'),function(e){return e.textContent;}).join('|');
  if(!/经验/.test(o.feedFloat)) o.errs.push('喂食无经验飘字: '+o.feedFloat);
  await sleep(1000);
  /* 7. 演出顺序：塔先演后结算；破境等天劫 */
  S.rank=12;S.tower=1;S.towerMax=0;S.gong1=6;S.weapon=6;S.weaponLv=10;XX._render();await sleep(300);
  var settled=document.getElementById('craft-settle');while(!settled.classList.contains('hidden')){document.getElementById('cs-close').click();await sleep(200);}
  var settleHidden=settled.classList.contains('hidden');
  XX._towerFight();
  o.towerTiming={battle:!document.getElementById('battle-modal').classList.contains('hidden'),settle:!document.getElementById('craft-settle').classList.contains('hidden'),title:(document.getElementById('cs-title')||{}).textContent||'',before:settleHidden};
  if(!(o.towerTiming.battle&&!o.towerTiming.settle)) o.errs.push('塔结算早于战斗演出: '+JSON.stringify(o.towerTiming));
  document.getElementById('bt-skip').click();await sleep(600);
  o.towerTiming.after={battle:!document.getElementById('battle-modal').classList.contains('hidden'),settle:!document.getElementById('craft-settle').classList.contains('hidden'),title:(document.getElementById('cs-title')||{}).textContent||''};
  if(!(!o.towerTiming.after.battle&&o.towerTiming.after.settle)) o.errs.push('塔战斗后未出结算: '+JSON.stringify(o.towerTiming));
  if(!document.getElementById('craft-settle').classList.contains('hidden')){document.getElementById('cs-close').click();await sleep(300);}
  S.rank=0;S.exp=XX._need(0);S.tianji=1;S.secludeUntil=0;XX._render();await sleep(200);
  XX._attemptBreak({useTianji:true});await sleep(500);
  o.breakTiming={battle:!document.getElementById('trib-modal').classList.contains('hidden'),result:!document.getElementById('break-modal').classList.contains('hidden')};
  if(!(o.breakTiming.battle&&!o.breakTiming.result)) o.errs.push('破境结果早于天劫: '+JSON.stringify(o.breakTiming));
  document.getElementById('trib-skip').click();await sleep(500);
  o.breakTiming.after=!document.getElementById('break-modal').classList.contains('hidden');
  if(!o.breakTiming.after) o.errs.push('天劫后未揭示破境结果');
  if(o.breakTiming.after){document.getElementById('b-close').click();await sleep(300);}
  /* 8. 奇遇逐项审计 + 卖灯翁 */
  var enc=XX._encounters,bad=[];
  Object.keys(enc).forEach(function(id){ (enc[id].opts||[]).forEach(function(opt,i){ var f=opt.fx||{}; var has=!!(opt.ok||f.roll||Object.keys(f).length); if(!has) bad.push(id+':'+i); }); });
  o.encAudit={events:Object.keys(enc).length,options:Object.keys(enc).reduce(function(n,id){return n+(enc[id].opts||[]).length;},0),bad:bad};
  if(bad.length) o.errs.push('奇遇双空选: '+bad.join(','));
  XX._openEncounter('lantern_seller');await sleep(200);
  o.lantern={hints:Array.prototype.map.call(document.querySelectorAll('#enc-opts .enc-opt small'),function(e){return e.textContent;}).join('|')};
  if(!(o.lantern.hints.indexOf('只留一段见闻')>=0&&o.lantern.hints.indexOf('无所得')<0)) o.errs.push('卖灯翁提示未改: '+o.lantern.hints);
  XX._resolveEncounter('lantern_seller',0);await sleep(200);
  o.lantern.log=(S.log||[]).map(function(x){return x.t;}).join('|');
  if(o.lantern.log.indexOf('📖')<0) o.errs.push('卖灯翁选项无反馈: '+o.lantern.log.slice(0,60));
  /* 9. 入门八事完成提示 */
  S.trail={i:6};S.stats.craftPill=1;S.stats.hunt=1;S.towerMax=1;S.trail2={i:12};S.trail3={i:3};XX._render();await sleep(200);
  XX._trail.tick();await sleep(400);
  var tcs=document.getElementById('craft-settle');
  o.trailEnd={vis:tcs&&!tcs.classList.contains('hidden'),title:(document.getElementById('cs-title')||{}).textContent||'',active:XX._trail.active()};
  if(!(o.trailEnd.vis&&o.trailEnd.title.indexOf('入门八事')>=0&&!o.trailEnd.active)) o.errs.push('入门八事完成无结算: '+JSON.stringify(o.trailEnd));
  if(o.trailEnd.vis)document.getElementById('cs-close').click();
  /* 10. 子页六项资源行 */
  var kitPages=[['dong','xx-dongtian-sec'],['role','xx-role-equip'],['zong','xx-gate'],['market','mk-tianji'],['arena','ar-board'],['xiu','xx-gong-sec'],['event','ev-daily'],['secret','sec-ch-0'],['codex'],['today']];
  o.pageRes=[];
  for(var pi=0;pi<kitPages.length;pi++){
    ROUTER.open(kitPages[pi][0],kitPages[pi][1]);await sleep(350);
    var pr=document.querySelector('#panel-host .page-res');
    var vals=pr?Array.prototype.map.call(pr.querySelectorAll('[data-pr]'),function(e){return e.getAttribute('data-pr')+':'+e.textContent;}).join(','):'none';
    o.pageRes.push({route:kitPages[pi].join('/'),n:pr?pr.querySelectorAll('[data-pr]').length:0,vals:vals,resBar:!!document.querySelector('#panel-host .res-bar')});
    if(!(pr&&pr.querySelectorAll('[data-pr]').length===6)) o.errs.push('子页资源行缺项: '+kitPages[pi].join('/')+' '+vals);
  }
  var cave=o.pageRes.filter(function(x){return x.route.indexOf('dong/')===0;})[0];
  if(cave&&cave.resBar) o.errs.push('子页资源行双重占高（仍渲染 res-bar）');
`;
const DIAG = `(async function(){var o={ok:true,errs:[]};var sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{${SCRIPT}}catch(e){o.ok=false;o.errs.push(String(e&&e.stack||e));}
document.getElementById('diag').textContent='G='+JSON.stringify(o);})();`;
const f = path.join(PAGE.SCRATCH, '._b6check.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE + '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div><script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},800);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxb6check' + Date.now());
let exitCode = 1;
try {
  const out = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + ud, '--virtual-time-budget=26000', '--window-size=430,900', '--dump-dom', 'file:///' + f.replace(/\\/g, '/')], { timeout: 240000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const r = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(r);
  let o = null; try { o = JSON.parse(r.replace(/^G=/, '')); } catch (e) {}
  const ok = !!(o && o.ok && o.errs.length === 0);
  console.log(ok ? 'B6 PASS' : 'B6 FAIL');
  exitCode = ok ? 0 : 1;
} catch (e) { console.log('ERR ' + e.message); }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
process.exit(exitCode);