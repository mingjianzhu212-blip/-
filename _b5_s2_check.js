'use strict';
/* batch5 第二段探针：图纸定向锻造（天机阁周选图 + 图纸炼器）+ 服务端战力同值回归 + 战力榜页 */
const fs = require('node:fs'), path = require('node:path'); const ROOT = __dirname;
const PAGE = require('./tools/page.js'); const { execEdge } = require('./tools/edge-run.js'); PAGE.use(ROOT);
const { recomputePower } = require('./server/sect-server.js');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => claimed[id] = t);
const base = { name: '青玄子', sex: 'm', gender: 'male', robe: 'bai', rank: 5, exp: 120, stone: 9000, herb: 25, ore: 25, cave: 1, dan: 1, forge: 1, dao: 0, rootIdx: 1, gong1: 2, gong2: 0, gong3: 0, field: 0, mine: 0, weapon: 2, weaponLv: 1, bagSize: 20, tower: 0, towerMax: 0, petSlots: 1, wisdom: 0, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0, herb100: 0, herb10000: 0, log: [], bag: [], recipeN: {}, mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 }, stats: { sit: 0, herb: 0, train: 0, enlight: 0, craftPill: 0, explore: 0, hunt: 0, enhance: 0, stoneEarned: 0, farmN: 0 }, plots: [], pets: [], eggs: [], arena: { day: '', left: 3, tier: 1, win: 0, lose: 0, rep: 0, foes: [] }, union: { start: t, day: '', left: 1, merit: 0, claimed: [], season: 1 }, sign: { days: 0, last: '' }, secret: { prog: [0, 0, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0, enc: { t: 0, bubble: null, lastId: '' }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed: claimed }, equipment: { weapon: null, armor: null, accessory: null }, shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 }, market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 }, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', gate: { lv: 0, grad: 0, disciples: [] }, coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 }, lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 }, unlocks: [], blueprints: {}, bpShop: { week: '', bought: 0 }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 1 }, life: { age: 40, on: true, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null }, mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, guide: { step: 14, done: true, skipped: false, started: true, flags: { c_enter: true, c_sit: true, c_brk: true, c_field: true }, rewardClaims: { taixu_intro_dan_v1: true }, toldSystems: {} }, art: { bg: 1, brk: 0, cai: 0 }, last: t };
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const SCRIPT = `
  await sleep(500);
  var sm=document.getElementById('story-modal');if(sm&&!sm.classList.contains('hidden'))document.getElementById('sto-close').click();
  var gb=document.getElementById('taixu-bubble');if(gb){var sk=document.getElementById('taixu-skip');if(sk)sk.click();}
  await sleep(300);
  var S=XX._s;
  /* ---------- 1. 天机阁周选图 ---------- */
  S.stone=1000000;S.wisdom=10000;S.bpShop={week:'',bought:0};S.blueprints={};
  ROUTER.open('market','mk-tianji');await sleep(500);
  var box=document.getElementById('tj-bp');
  o.shop={rows:box?box.querySelectorAll('[data-buy-bp]').length:0,state:(document.getElementById('tj-bp-state')||{}).textContent||'',
    title:(document.querySelector('.tj-bp-title')||{}).textContent||''};
  if(!(o.shop.rows===6&&o.shop.state.indexOf('0/1')>=0&&o.shop.title.indexOf('图纸')>=0)) o.errs.push('天机阁图纸区缺项: '+JSON.stringify(o.shop));
  var before={stone:S.stone,wisdom:S.wisdom};
  var price0=XX._bpShop().stone;
  box.querySelector('[data-buy-bp="bp_lq5"]').click();await sleep(250);
  var modal=document.getElementById('stance-modal');
  o.confirm={vis:modal&&!modal.classList.contains('hidden'),title:(document.getElementById('st-title')||{}).textContent||''};
  if(!o.confirm.vis||o.confirm.title.indexOf('自选图纸')<0) o.errs.push('选图确认页缺失: '+JSON.stringify(o.confirm));
  document.querySelector('#st-opts [data-st="ok"]').click();await sleep(400);
  o.buy={stone:S.stone,wisdom:S.wisdom,bp:XX._bp().bp_lq5||0,bought:S.bpShop.bought,price:price0,
    state:(document.getElementById('tj-bp-state')||{}).textContent||'',
    dis:Array.prototype.filter.call(box.querySelectorAll('[data-buy-bp]'),function(b){return b.disabled;}).length};
  o.buy.stoneSpent=before.stone-o.buy.stone;o.buy.wisdomSpent=before.wisdom-o.buy.wisdom;
  var cs=document.getElementById('craft-settle');
  o.buy.settle=cs&&!cs.classList.contains('hidden');
  if(!(o.buy.bp===1&&o.buy.bought===1&&o.buy.wisdomSpent===500&&o.buy.state.indexOf('1/1')>=0&&o.buy.dis===6&&o.buy.settle)) o.errs.push('选图购买异常: '+JSON.stringify(o.buy));
  var rec=XX._recipes['lq5'];
  o.buy.stoneExpect=Math.floor(XX._need(S.rank)*3);
  if(!(rec&&o.buy.price===o.buy.stoneExpect&&o.buy.stoneSpent>0&&Math.abs(o.buy.stoneSpent-o.buy.price)<50)) o.errs.push('图纸灵石价不等于需求×3: '+JSON.stringify(o.buy));
  if(cs&&!cs.classList.contains('hidden'))document.getElementById('cs-close').click();
  await sleep(250);
  /* 周重置：旧周键 → 本周 0/1 */
  S.bpShop.week='2000-1-3';S.bpShop.bought=1;XX._render();await sleep(300);
  o.week={bought:S.bpShop.bought,state:(document.getElementById('tj-bp-state')||{}).textContent||''};
  if(!(o.week.bought===0&&o.week.state.indexOf('0/1')>=0)) o.errs.push('图纸周限购未重置: '+JSON.stringify(o.week));
  /* ---------- 2. 图纸炼器：只跳等级/阶位，材料与成功率照卡 ---------- */
  S.rank=5;S.forge=1;S.stone=1000000;S.ore=10000;S.bagSize=100;S.bag=[];
  for(var i=0;i<20;i++)S.bag.push({t:'mat_eye',n:'天目砂'});
  S.blueprints={bp_lq5:1};S.mastery={alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0};
  var ore0=S.ore,stone0=S.stone;
  XX._craftByBlueprint('bp_lq5');await sleep(350);
  o.craft={bp:XX._bp().bp_lq5||0,oreSpent:ore0-S.ore,stoneSpent:stone0-S.stone,
    settle:((document.getElementById('cs-rows')||{}).textContent||'')};
  if(!(o.craft.bp===0&&(o.craft.oreSpent===320||o.craft.oreSpent===224)&&o.craft.stoneSpent>1400&&o.craft.stoneSpent<1600&&o.craft.settle.indexOf('图·承露剑')>=0)) o.errs.push('图纸炼器异常: '+JSON.stringify(o.craft));
  if(!document.getElementById('craft-settle').classList.contains('hidden'))document.getElementById('cs-close').click();
  await sleep(250);
  var ore1=S.ore,stone1=S.stone;
  XX._craftByBlueprint('bp_lq5');await sleep(300);
  o.craftAgain={oreSpent:ore1-S.ore,stoneSpent:stone1-S.stone,log:(S.log&&S.log[0]&&S.log[0].t)||''};
  if(!(o.craftAgain.oreSpent===0&&o.craftAgain.log.indexOf("图·承露剑")>=0)) o.errs.push('无图纸仍可炼: '+JSON.stringify(o.craftAgain));
  /* ---------- 3. 服务端重算 = 客户端 combatPower（同值回归） ---------- */
  function snapNow(){return {client:XX._power(),snap:XX._powerSnapshot()};}
  S.affix=[];S.wu={sword:0,dan:0,array:0};S.art={bg:0,brk:0,cai:0};
  S.danPow={pct:0,until:0};S.dt={qing:0,zhu:0,su:0,xuan:0,huang:0};S.dtMain='';
  S.pets=[];S.equipment={weapon:null,armor:null,accessory:null};
  S.rank=5;S.gong1=2;S.gong2=0;S.gong3=0;S.weapon=2;S.weaponLv=1;
  o.parity=[snapNow()];
  S.rank=15;S.gong1=5;S.gong2=3;S.gong3=0;S.weapon=5;S.weaponLv=7;S.affix=[{id:'pow',q:3}];
  S.wu={sword:3,dan:0,array:0};S.art={bg:5,brk:0,cai:0};S.danPow={pct:0.2,until:Date.now()+3600000};
  S.dt={qing:5,zhu:0,su:0,xuan:0,huang:0};S.dt.qing=0;S.dt.zhu=5;S.dtMain='zhu';S.pets=[{bid:'hundun',lv:30}];
  S.equipment={weapon:'eq_chixiao',armor:'eq_xuangui',accessory:'eq_lingzhu'};
  o.parity.push(snapNow());
  S.rank=25;S.gong1=10;S.gong2=10;S.gong3=10;S.weapon=9;S.weaponLv=20;S.affix=[{id:'pow',q:4}];
  S.wu={sword:5,dan:5,array:5};S.art={bg:9,brk:9,cai:9};S.danPow={pct:0.55,until:Date.now()+3600000};
  S.dt={qing:0,zhu:15,su:0,xuan:0,huang:0};S.dtMain='zhu';
  S.pets=[{bid:'hundun',lv:30},{bid:'hundun',lv:30},{bid:'hundun',lv:30}];
  o.parity.push(snapNow());
  /* ---------- 4. 战力榜页（离线降级也要有页） ---------- */
  ROUTER.open('zong','xx-power');await sleep(500);
  o.board={page:!!document.getElementById('sc-power'),list:!!document.getElementById('sc-pw-list'),
    txt:(document.getElementById('sc-pw-list')||{}).textContent||'',
    hasHint:!!document.querySelector('#sc-power .hint')};
  if(!(o.board.page&&o.board.list&&o.board.hasHint&&/战力榜需连上互助服务|战力/.test(o.board.txt))) o.errs.push('战力榜页缺项: '+JSON.stringify(o.board));
`;
const DIAG = `(async function(){var o={ok:true,errs:[],parity:[],shop:{},buy:{},craft:{},craftAgain:{},week:{},board:{}};var sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{${SCRIPT}}catch(e){o.ok=false;o.errs.push(String(e&&e.stack||e));}
document.getElementById('diag').textContent='G='+JSON.stringify(o);})();`;
const f = path.join(PAGE.SCRATCH, '._b5s2.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE + '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div><script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},800);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxb5s2' + Date.now());
(async function main(){
let exitCode = 1;
try {
  const out = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + ud, '--virtual-time-budget=18000', '--window-size=430,900', '--dump-dom', 'file:///' + f.replace(/\\/g, '/')], { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const r = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(r);
  let o = null; try { o = JSON.parse(r.replace(/^G=/, '')); } catch (e) {}
  if (o && o.ok) {
    /* server.mjs 的重算也进同值回归（SERVER_NO_LISTEN=1 只 import 不监听） */
    process.env.SERVER_NO_LISTEN = '1';
    const mjs = await import(require('node:url').pathToFileURL(path.join(ROOT, 'server', 'server.mjs')).href + '?v=' + Date.now());
    const local = require('./js/multi-local.js');
    const localConstSame = local.AUTH.ART_BG_MAX === mjs.ART_BG_MAX;
    console.log('PARITY_LOCAL_CONST ART_BG_MAX=' + local.AUTH.ART_BG_MAX + '/' + mjs.ART_BG_MAX + ' ' + (localConstSame ? 'SAME' : 'DIFF'));
    if (!localConstSame) o.errs.push('multi-local ART_BG_MAX 与 server.mjs 不同值: ' + local.AUTH.ART_BG_MAX + '/' + mjs.ART_BG_MAX);
    o.parity.forEach((p, i) => {
      const srv = recomputePower(p.snap);
      const same = srv && srv.power === p.client;
      console.log('PARITY[' + i + '] client=' + p.client + ' server=' + (srv ? srv.power : 'null') + ' ' + (same ? 'SAME' : 'DIFF'));
      if (!same) o.errs.push('服务端重算与 combatPower 不同值 idx=' + i + ' client=' + p.client + ' server=' + (srv && srv.power));
      const mjsSrv = mjs.recomputePower(p.snap);
      const mjsSame = mjsSrv && mjsSrv.power === p.client;
      console.log('PARITY_MJS[' + i + '] client=' + p.client + ' server.mjs=' + (mjsSrv ? mjsSrv.power : 'null') + ' ' + (mjsSame ? 'SAME' : 'DIFF'));
      if (!mjsSame) o.errs.push('server.mjs 重算与 combatPower 不同值 idx=' + i + ' client=' + p.client + ' server.mjs=' + (mjsSrv && mjsSrv.power));
      const axes = ['weapon', 'guard', 'dan', 'wu'], paths = ['sword', 'body', 'dan', 'array'];
      let axisOk = true, synOk = true;
      const parts = [];
      axes.forEach(a => {
        const lv = local.pathAxisScore(p.snap, a), sv = mjs.pathAxisScore(p.snap, a);
        if (Math.abs(lv - sv) > 1e-12) axisOk = false;
        parts.push(a + '=' + lv.toFixed(4) + '/' + sv.toFixed(4));
      });
      paths.forEach(pt => {
        const lv = local.synergyMult(p.snap, pt), sv = mjs.pathSynergyMult(p.snap, pt);
        if (Math.abs(lv - sv) > 1e-12) synOk = false;
      });
      console.log('PARITY_LOCAL[' + i + '] axis=' + (axisOk ? 'SAME' : 'DIFF') + ' synergy=' + (synOk ? 'SAME' : 'DIFF') + ' ' + parts.join(' '));
      if (!axisOk || !synOk) o.errs.push('multi-local 共鸣与 server.mjs 不同值 idx=' + i);
    });
  }
  const ok = !!(o && o.ok && o.errs.length === 0);
  console.log(ok ? 'B5S2 PASS' : 'B5S2 FAIL');
  exitCode = ok ? 0 : 1;
} catch (e) { console.log('ERR ' + e.message); }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
process.exit(exitCode);
})();