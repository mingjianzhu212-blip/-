'use strict';
/* 修复单探针：P0 炼器坊/炼丹房页内升级 + 二阶解锁与结算；P1a 不足明示；设施页镜像 */
const fs = require('node:fs'), path = require('node:path');
const ROOT = 'D:/xx-scratch/jiuxiao-analysis/九霄问道';
const PAGE = require(path.join(ROOT, 'tools/page.js'));
const { execEdge } = require(path.join(ROOT, 'tools/edge-run.js'));
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const save = {name:'复验散人',sex:'m',gender:'male',robe:'bai',rank:0,exp:0,stone:8,cave:0,dan:0,forge:0,dao:0,rootIdx:1,gong1:0,gong2:0,gong3:0,field:0,mine:0,herb:25,ore:20,weapon:0,weaponLv:0,bagSize:20,tower:1,towerMax:0,petSlots:1,wisdom:0,insight:0,failBonus:0,guardMirror:0,guardArray:0,tianji:0,herb100:0,herb10000:0,log:[],bag:[],recipeN:{},mastery:{alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0},stats:{sit:0,herb:0,train:0,enlight:0,craftPill:0,explore:0,hunt:0,enhance:0,stoneEarned:0,farmN:0},plots:[],pets:[],eggs:[],arena:{day:'',left:0,tier:1,win:0,lose:0,rep:0,foes:[]},union:{start:t,day:'',left:0,merit:0,claimed:[],season:1},sign:{days:0,last:''},secret:{prog:[0,0,0,0],day:'',swept:0},towerDay:'',towerSwept:0,enc:{t:0,bubble:null,lastId:''},encBuff:{mult:0,until:0},miles:{},milesNew:[],letters:[],story:{claimed:claimed},equipment:{weapon:null,armor:null,accessory:null},shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},questsDone:[],bossKilled:{},acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},actDay:'',gate:{lv:0,grad:0,disciples:[]},council:{day:'',n:0,last:''},trail:{i:0},trail2:{i:0},life:{age:0,on:true,brk:0},legacy:{gens:0,relic:null,hist:[],pick:null},mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},guide:{step:7,done:true,skipped:false,started:true,flags:{},rewardClaims:{},toldSystems:{}},last:t};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const DIAG = `
(async function(){
  var o={ok:true,errs:[]}; var sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function txt(id){ var e=document.getElementById(id); return e?e.textContent:''; }
  try{
    await sleep(1200);
    var sm=document.getElementById('story-modal'); if(sm && !sm.classList.contains('hidden')) document.getElementById('sto-close').click();
    await sleep(300);
    var S=window.S;
    /* 1) 器坊 0→1 本房页内（8 灵石 + 20 矿石） */
    try{ ROUTER.open('dong','xx-forge-sec'); }catch(e){ o.errs.push('open forge: '+e.message); }
    await sleep(700);
    o.upTxt0=txt('xx-forge-up');
    var b0=document.getElementById('xx-forge-upbtn');
    o.btn0=!!b0;
    if(b0) b0.click();
    await sleep(500);
    o.lv1={forge:S.forge, stone:S.stone, ore:S.ore, msg:txt('xx-forge-upmsg')};
    if(!(S.forge===1 && S.ore===0 && S.stone>=0)) o.errs.push('器坊 0→1 失败: '+JSON.stringify(o.lv1));
    /* 2) 不足明示：0 灵石点升级 */
    S.stone=0; XX._render(); await sleep(300);
    var b1=document.getElementById('xx-forge-upbtn'); if(b1) b1.click();
    await sleep(400);
    o.short={forge:S.forge, msg:txt('xx-forge-upmsg')};
    if(!/灵石差/.test(o.short.msg)) o.errs.push('不足未明示: ['+o.short.msg+']');
    if(S.forge!==1) o.errs.push('不足仍扣升');
    /* 3) 1→2（按界面费用补齐） */
    var cost=XX._bldUpgradeCost('forge');
    S.stone=cost.stone; S.ore=Math.max(S.ore, 500); S.bag=[{t:'boss_core',n:5}];
    cost.mats.forEach(function(m){ if(m.t==='ore') S.ore=Math.max(S.ore,m.n); });
    XX._render(); await sleep(300);
    var b2=document.getElementById('xx-forge-upbtn'); if(b2) b2.click();
    await sleep(500);
    o.lv2={forge:S.forge, msg:txt('xx-forge-upmsg')};
    if(S.forge!==2) o.errs.push('器坊 1→2 失败: '+JSON.stringify(o.lv2));
    /* 4) 二阶四族价 120 + 任炼一件 wp2 出结算层 */
    var rows=[].slice.call(document.querySelectorAll('#xx-forge .craft')).filter(function(r){ return r.dataset.recipe && /^wp2$/.test(r.dataset.recipe); });
    // 需要切到二阶签
    var tabs=[].slice.call(document.querySelectorAll('#xx-forge-sec *')).filter(function(e){ return e.children.length===0 && e.textContent.trim().indexOf('二阶')===0; });
    if(tabs[0]){ var bt=tabs[0].closest('button'); if(bt) bt.click(); }
    await sleep(500);
    rows=[].slice.call(document.querySelectorAll('#xx-forge .craft')).filter(function(r){ return r.dataset.recipe==='wp2'; });
    o.wp2=rows[0] ? rows[0].textContent.replace(/\\s+/g,' ').slice(0,140) : 'NOT FOUND';
    if(!/灵石 120/.test(o.wp2)) o.errs.push('二阶价非 120: '+o.wp2);
    S.stone=1000; S.ore=100; S.weapon=0; XX._render(); await sleep(300);
    var rnd=Math.random; Math.random=function(){return 0;};
    try{ XX._craftItem('forge','wp2'); }catch(e){ o.errs.push('craft wp2: '+e.message); }
    Math.random=rnd; await sleep(400);
    var m=document.getElementById('craft-settle');
    o.settle={open:!!(m && !m.classList.contains('hidden')), text:(m?m.textContent.replace(/\\s+/g,' ').slice(0,200):'')};
    if(!o.settle.open) o.errs.push('wp2 未弹结算层');
    if(m) document.getElementById('cs-close').click();
    /* 5) 丹房 0→1 */
    S.stone=8; S.herb=25; try{ ROUTER.open('dong','xx-alchemy-sec'); }catch(e){}
    await sleep(700);
    var ab=document.getElementById('xx-alchemy-upbtn'); if(ab) ab.click();
    await sleep(500);
    o.alch={dan:S.dan, stone:S.stone, herb:S.herb, msg:txt('xx-alchemy-upmsg')};
    if(!(S.dan===1)) o.errs.push('丹房 0→1 失败: '+JSON.stringify(o.alch));
    /* 6) 设施页全量镜像：六行按钮一律「进页」（第三批 B5 起） */
    try{ ROUTER.open('dong','xx-ups-sec'); }catch(e){}
    await sleep(600);
    var ups=[].slice.call(document.querySelectorAll('#xx-ups .upg button')).map(function(b){return b.textContent;});
    o.upsBtns=ups;
    if(ups.length!==6 || ups.filter(function(x){return x==='进页';}).length!==6) o.errs.push('设施页镜像按钮异常: '+ups.join('/'));
    o.ok=o.errs.length===0;
    document.getElementById('diag').textContent='F='+JSON.stringify(o);
  }catch(e){ document.getElementById('diag').textContent='F='+JSON.stringify({ok:false,err:String(e&&e.stack||e)}); }
})();`;
const f = path.join(PAGE.SCRATCH, '._fixp0.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE +
  '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
  '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},900);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxfixp0' + Date.now());
let failed = 0;
try {
  const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
    '--virtual-time-budget=18000','--window-size=900,1200','--dump-dom','file:///' + f.replace(/\\/g, '/')],
    { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const txt2 = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(txt2);
  let o = null; try { o = JSON.parse(txt2.replace(/^F=/, '')); } catch (e) {}
  if (!(o && o.ok === true)) failed++;
} catch (e) { console.log('ERR ' + e.message); failed++; }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
console.log('—— 修复单 P0 · ' + (failed ? '失败 1' : '全绿') + ' ——');
process.exit(failed ? 1 : 0);