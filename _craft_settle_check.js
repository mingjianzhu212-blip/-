'use strict';
/* 常驻探针：A1 炼制结算层（2026-11-20 总账第一批）
   验收口径（制作人定版）：
     ①成败都弹结算层；
     ②列账数字 = 实际状态差（灵石/材料/返还逐项）；
     ③失败明写「灵石不返还」；
     ④结算层不自动消失，点确认钮才关；
     ⑤炼丹与炼器共用同一结算层（本探针以炼丹 dan1 连炼，覆盖成败两态）。
   用法：ELECTRON_RUN_AS_NODE=1 "D:/Qoder CN/Qoder CN.exe" _craft_settle_check.js */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const save = {
  name:'元呆呆', sex:'m', gender:'male', robe:'bai', rank:8, exp:0, stone:1000000,
  cave:2, dan:3, forge:1, dao:0, rootIdx:2, gong1:2, gong2:0, gong3:0, field:4, mine:2,
  herb:100000, ore:10000, weapon:2, weaponLv:2, bagSize:999, tower:7, towerMax:6, petSlots:1,
  wisdom:260, insight:0, failBonus:0, guardMirror:0, guardArray:0, tianji:0, herb100:0, herb10000:0,
  log:[], bag:[], recipeN:{}, mastery:{alchemyLv:3,alchemyExp:0,forgeLv:1,forgeExp:0},
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
  guide:{ step:0, done:true, skipped:false, started:true, flags:{}, rewardClaims:{}, toldSystems:{} },
  last:t
};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';

const DIAG = `
var o={ok:true,errs:[],succ:0,fail:0,checks:0,autoClose:null};
function rowsNow(){
  var out=[];
  document.querySelectorAll('#cs-rows .cs-row').forEach(function(r){
    var k=r.querySelector('span'), v=r.querySelector('b');
    out.push({k:k?k.textContent:'', v:v?v.textContent:''});
  });
  return out;
}
try{
  var loop=0, firstAfter=null;
  while(loop<60 && (o.succ===0 || o.fail===0)){
    loop++;
    window.S.bag=[];
    var st0=window.S.stone, hb0=window.S.herb;
    XX._craftItem('alchemy','dan1');
    var st1=window.S.stone, hb1=window.S.herb;
    var modal=document.getElementById('craft-settle');
    var open=modal && !modal.classList.contains('hidden');
    var title=document.getElementById('cs-title').textContent;
    var rows=rowsNow();
    var stoneRow=rows.filter(function(r){return r.k.indexOf('灵石')>=0;})[0]||{k:'',v:''};
    var stoneText=rows.filter(function(r){return r.k==='消耗 · 灵石';})[0];
    var backRows=rows.filter(function(r){return r.k.indexOf('返还')===0;});
    var prodRow=rows.filter(function(r){return r.k==='成品';})[0];
    var isFail=title.indexOf('失败')>=0;
    if(isFail) o.fail++; else o.succ++;
    o.checks++;
    /* ① 弹层必须开 */
    if(!open) o.errs.push('L'+loop+' 未弹结算层');
    /* ② 灵石数字 = 实际差值 */
    var expectStone='−'+String(st0-st1);
    if(!stoneText || stoneText.v.indexOf(expectStone)!==0) o.errs.push('L'+loop+' 灵石行['+(stoneText?stoneText.v:'无')+']≠'+expectStone);
    /* ③ 失败：灵石行明写不返还 + 返还行/无；成功：有成品行、无返还行 */
    if(isFail){
      if(!stoneText || stoneText.v.indexOf('不返还')<0) o.errs.push('L'+loop+' 失败未写灵石不返还');
      var backOk=backRows.length>0 || rows.some(function(r){return r.k==='返还';});
      if(!backOk) o.errs.push('L'+loop+' 失败无返还行');
      var expBack=Math.floor(5*0.3);
      if(backRows.length && backRows[0].v.indexOf('+'+expBack)!==0) o.errs.push('L'+loop+' 返还数['+backRows[0].v+']≠+'+expBack);
      if(hb1!==hb0-5+expBack) o.errs.push('L'+loop+' 灵草差['+(hb0-hb1)+']≠'+(5-expBack));
    }else{
      if(!prodRow) o.errs.push('L'+loop+' 成功无成品行');
      if(backRows.length) o.errs.push('L'+loop+' 成功出现返还行');
      if(hb1!==hb0-5) o.errs.push('L'+loop+' 成功灵草差['+(hb0-hb1)+']≠5');
    }
    /* ⑤ 手动关闭生效 */
    document.getElementById('cs-close').click();
    if(!modal.classList.contains('hidden')) o.errs.push('L'+loop+' 确认钮未关闭结算层');
  }
  o.loop=loop;
  /* ④ 不自动消失：再炼一次，等 900ms 不关 */
  var st2=window.S.stone;
  XX._craftItem('alchemy','dan1');
  setTimeout(function(){
    var m2=document.getElementById('craft-settle');
    o.autoClose = m2 ? !m2.classList.contains('hidden') : false;
    if(!o.autoClose) o.errs.push('结算层自动消失');
    if(m2) document.getElementById('cs-close').click();
    document.getElementById('diag').textContent='C='+JSON.stringify(o);
  },900);
}catch(e){ document.getElementById('diag').textContent='C='+JSON.stringify({ok:false,err:String(e&&e.stack||e)}); }`;

const f = path.join(PAGE.SCRATCH, '._craftsettle.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>')
  .replace('</body>', FREEZE + '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
    '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},900);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxcs' + Date.now());
let failed = 0;
try {
  const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
    '--virtual-time-budget=20000','--window-size=900,1200','--dump-dom','file:///' + f.replace(/\\/g, '/')],
    { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const txt = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(txt);
  let o = null; try { o = JSON.parse(txt.replace(/^C=/, '')); } catch (e) {}
  const ok = o && o.ok !== false && o.errs && o.errs.length === 0 && o.succ > 0 && o.fail > 0 && o.autoClose === true;
  if (!ok) failed++;
} catch (e) { console.log('ERR ' + e.message); failed++; }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
console.log('—— A1 炼制结算 · ' + (failed ? ('失败 ' + failed) : '全绿') + ' ——');
process.exit(failed ? 1 : 0);