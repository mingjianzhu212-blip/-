'use strict';
/* 常驻探针：A1 灵器错价（2026-11-20 制作人批，甲案）
   口径：
     ①同阶四族灵石价齐平：seg1..4 wpN == bgN == brkN == caiN（40/120/300/700）；
     ②recipeStoneCost 不再随境界变化（rank0 与 rank24 同值）；
     ③wp4 的 boss_core 仍保留；
     ④artStoneAll 仍为 36（含 stone 定义的炼器配方数）；
     ⑤wp2 成败各一次，结算层逐项数字 = 实际状态差（灵石/矿石/经验）。
   用法：ELECTRON_RUN_AS_NODE=1 "D:/Qoder CN/Qoder CN.exe" _art_price_check.js */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const save = {
  name:'元呆呆', sex:'m', gender:'male', robe:'bai', rank:11, exp:0, stone:1000000,
  cave:2, dan:1, forge:2, dao:0, rootIdx:2, gong1:2, gong2:0, gong3:0, field:4, mine:2,
  herb:100000, ore:100000, weapon:0, weaponLv:0, bagSize:999, tower:7, towerMax:6, petSlots:1,
  wisdom:260, insight:0, failBonus:0, guardMirror:0, guardArray:0, tianji:0, herb100:0, herb10000:0,
  log:[], bag:[], recipeN:{}, mastery:{alchemyLv:3,alchemyExp:0,forgeLv:2,forgeExp:0},
  stats:{sit:14,herb:9,train:4,enlight:2,craftPill:6,explore:3,hunt:7,enhance:2,stoneEarned:84200,farmN:5},
  plots:[], pets:[], eggs:[],
  arena:{day:'',left:3,tier:1,win:4,lose:1,rep:120,foes:[]},
  union:{start:t,day:'',left:0,merit:0,claimed:[],season:1}, sign:{days:3,last:''},
  secret:{prog:[3,1,0,0],day:'',swept:0}, towerDay:'', towerSwept:0,
  enc:{t:0,bubble:null,lastId:''}, encBuff:{mult:0,until:0}, miles:{}, milesNew:[], letters:[], story:{claimed:claimed},
  equipment:{weapon:null,armor:null,accessory:null},
  shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},
  market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},
  questsDone:[], bossKilled:{}, acts:{sit:0,herb:0,train:0,enlight:0,ponder:0}, actDay:'',
  gate:{lv:0,grad:0,disciples:[]}, council:{day:'',n:0,last:''}, trail:{i:8}, trail2:{i:0},
  life:{age:0,on:false,brk:0}, legacy:{gens:0,relic:null,hist:[],pick:null},
  mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},
  guide:{ step:7, done:true, skipped:false, started:true, flags:{}, rewardClaims:{}, toldSystems:{} },
  last:t
};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const DIAG = `
var o={ok:true,errs:[]};
function rowsNow(){ var out=[]; document.querySelectorAll('#cs-rows .cs-row').forEach(function(r){ var k=r.querySelector('span'),v=r.querySelector('b'); out.push({k:k?k.textContent:'',v:v?v.textContent:''}); }); return out; }
try{
  var R=XX._recipes, S=XX._s;
  /* ① 同阶四族齐平（rank 11） */
  S.rank=11;
  var pairs=[['wp1','bg1','brk1','cai1'],['wp2','bg2','brk2','cai2'],['wp3','bg3','brk3','cai3'],['wp4','bg4','brk4','cai4']];
  o.tiers=[];
  pairs.forEach(function(p,i){
    var v=p.map(function(id){ return XX._recipeStoneCost(R[id]); });
    var same=v.every(function(x){ return x===v[0]; });
    o.tiers.push({seg:i+1,costs:v,same:same});
    if(!same) o.errs.push('seg'+(i+1)+' 四族不齐: '+v.join('/'));
  });
  /* ② 不随境界变化 */
  var w2=[0,8,11,14,17,24].map(function(r){ S.rank=r; return XX._recipeStoneCost(R.wp2); });
  o.wp2ByRank=w2;
  if(!w2.every(function(x){ return x===120; })) o.errs.push('wp2 随境界变化: '+w2.join('/'));
  S.rank=11;
  /* ③ boss_core 保留 */
  var w4m=(R.wp4.mats||[]).filter(function(m){ return m.t==='boss_core' && m.n===1; }).length;
  o.bossCore=w4m===1;
  if(!o.bossCore) o.errs.push('wp4 boss_core 缺失');
  /* ④ artStoneAll 36（含 stone 定义的炼器配方数） */
  var n=Object.keys(R).filter(function(k){ var r=R[k]; if(r.bld!=='forge') return false; return r.stoneK!=null || (r.mats||[]).filter(function(m){return m.t==='stone';}).length===1; }).length;
  o.artStoneAll=n;
  if(n!==36) o.errs.push('artStoneAll='+n+' ≠36');
  /* ⑤ wp2 失败 + 成功对账 */
  function craftFail(){
    S.weapon=0; S.stone=100000; S.ore=1000;
    var st0=S.stone, or0=S.ore, e0=S.mastery.forgeExp, lv0=S.mastery.forgeLv;
    var rnd=Math.random; Math.random=function(){return 0.999;};
    XX._craftItem('forge','wp2'); Math.random=rnd;
    var rows=rowsNow(), m=document.getElementById('craft-settle');
    var open=m&&!m.classList.contains('hidden');
    var st1=S.stone, or1=S.ore;
    var stone=rows.filter(function(r){return r.k==='消耗 · 灵石';})[0]||{v:''};
    var ore=rows.filter(function(r){return r.k==='消耗 · 矿石';})[0]||{v:''};
    var back=rows.filter(function(r){return r.k.indexOf('返还')===0;})[0]||{v:''};
    var exp=rows.filter(function(r){return r.k==='匠道经验';})[0]||{v:''};
    var ok=open && stone.v.indexOf('−'+(st0-st1))===0 && stone.v.indexOf('不返还')>=0 &&
      ore.v.indexOf('−30')===0 && back.v.indexOf('+'+Math.floor(30*0.3))===0 &&
      exp.v.indexOf('+'+(10*2*0.3))===0 && (st0-st1)===120 && (or0-or1)===30-9;
    if(m) document.getElementById('cs-close').click();
    return {open:open, stone:stone.v, ore:ore.v, back:back.v, exp:exp.v, stoneDelta:st0-st1, oreDelta:or0-or1, ok:ok};
  }
  function craftSucc(){
    S.weapon=0; S.stone=100000; S.ore=1000;
    var st0=S.stone, or0=S.ore;
    var rnd=Math.random; Math.random=function(){return 0;};
    XX._craftItem('forge','wp2'); Math.random=rnd;
    var rows=rowsNow(), m=document.getElementById('craft-settle');
    var open=m&&!m.classList.contains('hidden');
    var st1=S.stone, or1=S.ore;
    var stone=rows.filter(function(r){return r.k==='消耗 · 灵石';})[0]||{v:''};
    var ore=rows.filter(function(r){return r.k==='消耗 · 矿石';})[0]||{v:''};
    var prod=rows.filter(function(r){return r.k==='成品';})[0]||{v:''};
    var exp=rows.filter(function(r){return r.k==='匠道经验';})[0]||{v:''};
    var ok=open && stone.v.indexOf('−'+(st0-st1))===0 && ore.v.indexOf('−'+(or0-or1))===0 &&
      prod.v.indexOf('中品法宝')===0 && exp.v.indexOf('+20')===0 && S.weapon===2 && (st0-st1)===120 && (or0-or1)===30;
    if(m) document.getElementById('cs-close').click();
    return {open:open, stone:stone.v, ore:ore.v, prod:prod.v, exp:exp.v, weapon:S.weapon, ok:ok};
  }
  o.fail=craftFail(); o.succ=craftSucc();
  if(!o.fail.ok) o.errs.push('wp2 失败对账不过');
  if(!o.succ.ok) o.errs.push('wp2 成功对账不过');
  o.ok=o.errs.length===0;
  document.getElementById('diag').textContent='A='+JSON.stringify(o);
}catch(e){ document.getElementById('diag').textContent='A='+JSON.stringify({ok:false,err:String(e&&e.stack||e)}); }`;
const f = path.join(PAGE.SCRATCH, '._artprice.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE +
  '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
  '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},900);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxap' + Date.now());
let failed = 0;
try {
  const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
    '--virtual-time-budget=16000','--window-size=900,1200','--dump-dom','file:///' + f.replace(/\\/g, '/')],
    { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const txt = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(txt);
  let o = null; try { o = JSON.parse(txt.replace(/^A=/, '')); } catch (e) {}
  if (!(o && o.ok === true)) failed++;
} catch (e) { console.log('ERR ' + e.message); failed++; }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
console.log('—— A1 灵器错价 · ' + (failed ? '失败 1' : '全绿') + ' ——');
process.exit(failed ? 1 : 0);