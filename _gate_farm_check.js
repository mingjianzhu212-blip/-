'use strict';
/* 组合探针：A2 闭关锁文案 / A3 灵田回执与防吞（2026-11-20 总账第二批） */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const save = {
  name:'元呆呆', sex:'m', gender:'male', robe:'bai', rank:11, exp:999999999, stone:100000,
  cave:3, dan:2, forge:1, dao:0, rootIdx:2, gong1:2, gong2:0, gong3:0, field:2, mine:2,
  herb:88, ore:300, weapon:2, weaponLv:2, bagSize:20, tower:7, towerMax:6, petSlots:1,
  wisdom:260, insight:0, failBonus:0, guardMirror:0, guardArray:0, tianji:0, herb100:0, herb10000:0,
  log:[], bag:[], recipeN:{}, mastery:{alchemyLv:2,alchemyExp:40,forgeLv:1,forgeExp:0},
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
  secludeUntil: t + 4 * 86400000,
  guide:{ step:7, done:true, skipped:false, started:true, flags:{}, rewardClaims:{}, toldSystems:{} },
  last:t
};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const DIAG = `
(async function(){
  var o={ok:true,errs:[]};
  var sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function q(s){ try{ return document.querySelector(s); }catch(e){ return null; } }
  function txt(id){ var e=document.getElementById(id); return e?e.textContent:''; }
  try{
    await sleep(1200);
    var sm=document.getElementById('story-modal'); if(sm && !sm.classList.contains('hidden')) document.getElementById('sto-close').click();
    await sleep(300);
    try{ ROUTER.showScene('town'); }catch(e){}
    await sleep(400);
    var S=window.S;
    S.trail2={i:0}; try{ XX._render(); }catch(e){}
    o.scBreak={disabled:!!(document.getElementById('sc-break')||{}).disabled, text:txt('sc-break'), title:(document.getElementById('sc-break')||{}).title||''};
    o.barTitle=(document.getElementById('sc-expbar')||{}).title||'';
    o.trailHint=txt('st-hint');
    try{ ROUTER.open('xiu','xx-cult'); }catch(e){ o.errs.push('open xiu: '+e.message); }
    await sleep(700);
    o.panelBreak={disabled:!!(document.getElementById('xx-break')||{}).disabled, text:txt('xx-break'), title:(document.getElementById('xx-break')||{}).title||''};
    o.breakTip=txt('xx-break-tip');
    o.expTxt=txt('xx-exptxt');
    o.expGap=txt('xx-expgap');
    try{ ROUTER.open('xiu'); }catch(e){}
    await sleep(500);
    o.seal=txt('xx-hub-xiu-cult');
    S.secludeUntil=0; try{ XX._render(); }catch(e){}
    await sleep(600);
    o.afterUnlock={disabled:!!(document.getElementById('sc-break')||{}).disabled, text:txt('sc-break'), tip:txt('xx-break-tip')};
    /* A3：灵田 */
    try{ ROUTER.open('dong','xx-field'); }catch(e){ o.errs.push('open field: '+e.message); }
    await sleep(600);
    S.field=2; S.plots=[{crop:'herb', t0:Date.now()-600000, need:1}, null]; S.stats.farmN=5;
    try{ XX._render(); }catch(e){}
    await sleep(500);
    var ripe=q('#xx-plots [data-i="0"]');
    o.ripeBefore=!!(ripe && ripe.classList.contains('ripe'));
    var fn0=S.stats.farmN;
    for(var i=0;i<3;i++){ if(ripe) ripe.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); }
    await sleep(400);
    o.harvest={farmN:S.stats.farmN, delta:S.stats.farmN-fn0, plot0:S.plots[0], msg:txt('xx-farm-msg')};
    var empty=q('#xx-plots [data-i="1"]');
    o.emptyBefore=!!(empty && empty.classList.contains('empty'));
    if(empty) empty.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    await sleep(500);
    var g=q('#xx-plots [data-i="1"]');
    o.plant={plot1:!!S.plots[1], growDom:!!(g && (g.classList.contains('grow')||g.classList.contains('plot'))), msg:txt('xx-farm-msg')};
    S.field=1; S.plots=[]; S.stats.farmN=0;
    try{ XX._render(); }catch(e){}
    await sleep(500);
    try{ XX._plantPlot(0,'herb100'); }catch(e){ o.errs.push('plant100: '+e.message); }
    await sleep(300);
    o.fail={plot0:S.plots[0], msg:txt('xx-farm-msg')};
    if(!(o.fail && o.fail.msg && /灵田 10 级/.test(o.fail.msg))) o.errs.push('失败无可见提示');
    if(!(o.harvest && o.harvest.delta===1)) o.errs.push('收获连点未幂等: '+JSON.stringify(o.harvest));
    if(!(o.plant && o.plant.plot1)) o.errs.push('播种未落状态');
    if(!(o.scBreak.disabled && /闭关中/.test(o.scBreak.text))) o.errs.push('顶栏按钮未禁用/无闭关中');
    if(!/大境界/.test(o.scBreak.title)) o.errs.push('顶栏 title 未写锁对象');
    if(!/闭关中/.test(o.barTitle)) o.errs.push('修为条 title 未读闭关');
    if(!/闭关中/.test(o.trailHint)) o.errs.push('道途 hint 未读闭关');
    if(!(o.panelBreak.disabled && /闭关中/.test(o.panelBreak.text))) o.errs.push('面板按钮未禁用');
    if(!(/大境界/.test(o.breakTip) && /可做/.test(o.breakTip))) o.errs.push('面板提示缺锁对象/并行目标');
    if(!/闭关中/.test(o.expTxt)) o.errs.push('人物页溢出文本未读闭关:['+o.expTxt+']');
    if(o.seal!=='闭关中') o.errs.push('修为卡 seal 未改闭关中:['+o.seal+']');
    if(o.afterUnlock.disabled) o.errs.push('解禁后按钮未恢复');
    if(/大境界/.test(o.afterUnlock.tip)) o.errs.push('解禁后提示未恢复');
    o.ok=o.errs.length===0;
    document.getElementById('diag').textContent='X='+JSON.stringify(o);
  }catch(e){ document.getElementById('diag').textContent='X='+JSON.stringify({ok:false,err:String(e&&e.stack||e)}); }
})();`;
const f = path.join(PAGE.SCRATCH, '._gatefarm.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE +
  '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
  '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},900);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxgf' + Date.now());
let failed = 0;
try {
  const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
    '--virtual-time-budget=20000','--window-size=900,1200','--dump-dom','file:///' + f.replace(/\\/g, '/')],
    { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const txt2 = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(txt2);
  let o = null; try { o = JSON.parse(txt2.replace(/^X=/, '')); } catch (e) {}
  if (!(o && o.ok === true)) failed++;
} catch (e) { console.log('ERR ' + e.message); failed++; }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
console.log('—— A2 闭关锁 + A3 灵田 · ' + (failed ? '失败 1' : '全绿') + ' ——');
process.exit(failed ? 1 : 0);