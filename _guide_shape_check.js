'use strict';
/* 常驻探针：B1 引导形态（2026-11-20 总账第一批）
   验收口径（制作人定版）：
     ①任何时刻最多一个气泡（#taixu-bubble 计数=1）；
     ②气泡宽 ≤ 屏宽 70%；
     ③尾巴存在且指向当前目标元素（尾巴水平中心落在目标横向范围内）；
     ④完成/跳过即整组摘除（气泡与跳过入口 DOM=0，无 guide-active）；
     ⑤刷新恢复：推进后的步数已落盘。
   用法：ELECTRON_RUN_AS_NODE=1 "D:/Qoder CN/Qoder CN.exe" _guide_shape_check.js */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const save = {
  name:'青玄子', sex:'m', gender:'male', robe:'bai', rank:0, exp:0, stone:0,
  cave:0, dan:0, forge:0, dao:0, rootIdx:1, gong1:0, gong2:0, gong3:0, field:0, mine:0,
  herb:0, ore:0, weapon:0, weaponLv:0, bagSize:20, tower:1, towerMax:0, petSlots:1,
  wisdom:0, insight:0, failBonus:0, guardMirror:0, guardArray:0, tianji:0, herb100:0, herb10000:0,
  log:[], bag:[], recipeN:{}, mastery:{alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0},
  stats:{sit:0,herb:0,train:0,enlight:0,craftPill:0,explore:0,hunt:0,enhance:0,stoneEarned:0,farmN:0},
  plots:[], pets:[], eggs:[],
  arena:{day:'',left:0,tier:1,win:0,lose:0,rep:0,foes:[]},
  union:{start:t,day:'',left:0,merit:0,claimed:[],season:1}, sign:{days:0,last:''},
  secret:{prog:[0,0,0,0],day:'',swept:0}, towerDay:'', towerSwept:0,
  enc:{t:0,bubble:null,lastId:''}, encBuff:{mult:0,until:0}, miles:{}, milesNew:[], letters:[], story:{claimed:claimed},
  equipment:{weapon:null,armor:null,accessory:null},
  shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},
  market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},
  questsDone:[], bossKilled:{}, acts:{sit:0,herb:0,train:0,enlight:0,ponder:0}, actDay:'',
  gate:{lv:0,grad:0,disciples:[]}, council:{day:'',n:0,last:''}, trail:{i:0}, trail2:{i:0},
  life:{age:0,on:true,brk:0}, legacy:{gens:0,relic:null,hist:[],pick:null},
  mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},
  guide:{ step:0, done:false, skipped:false, started:true, flags:{}, rewardClaims:{}, toldSystems:{} },
  last:t
};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';

function runCase(name, act, wait) {
  const DIAG = `var o={};try{
    ${act}
    setTimeout(function(){ document.getElementById('diag').textContent='S='+JSON.stringify(o); },${wait});
  }catch(e){document.getElementById('diag').textContent='S_ERR='+JSON.stringify({m:String(e&&e.stack||e)});}`;
  const f = path.join(PAGE.SCRATCH, '._guideshape_' + name + '.html');
  PAGE.writePage(f, html.replace('</head>', seed + '\n</head>')
    .replace('</body>', FREEZE + '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
      '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},900);});</script></body>'));
  const ud = path.join('D:/xx-scratch', 'xxgs' + Date.now() + '_' + name);
  try {
    const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
      '--virtual-time-budget=12000','--window-size=430,900','--dump-dom','file:///' + f.replace(/\\/g, '/')],
      { timeout: 120000, encoding: 'utf8', maxBuffer: 1 << 26 });
    const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
    const txt = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
    console.log(name.padEnd(12) + txt);
    return txt;
  } catch (e) { console.log(name + ' ERR ' + e.message); return ''; }
  finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
}

function measure(extra) {
  return `
    var b=document.getElementById('taixu-bubble');
    o.bubbleDom=document.querySelectorAll('#taixu-bubble').length;
    o.skipDom=document.querySelectorAll('#taixu-skip').length;
    o.guideActive=document.body.classList.contains('guide-active');
    if(b){
      var br=b.getBoundingClientRect();
      o.bw=Math.round(br.width); o.ratio=+(br.width/innerWidth).toFixed(3);
      var tail=b.querySelector('.tb-tail');
      o.tail=!!tail;
      if(tail){
        var tr=tail.getBoundingClientRect();
        o.tailCx=Math.round(tr.left+tr.width/2);
      }
      o.anchored=b.classList.contains('tb-anchored');
      o.step=document.body.dataset.guideStep;
    }
    ${extra || ''}`;
}

let failed = 0;
const closeStory = `
    var sm=document.getElementById('story-modal');
    if(sm && !sm.classList.contains('hidden')) document.getElementById('sto-close').click();`;
/* 场景一：第 0 步形态量测 */
{
  const r = runCase('形态-第0步', closeStory + 'setTimeout(function(){' + measure() + '},700);', 900);
  let o = null; try { o = JSON.parse(r.replace(/^S=/, '')); } catch (e) {}
  const ok = o && o.bubbleDom === 1 && o.skipDom === 1 && o.ratio <= 0.7 + 0.005 && o.tail === true;
  if (!ok) failed++;
}
/* 场景二：点击推进到 sit（第 2 拍），气泡贴目标、尾巴落在目标横向范围内 */
{
  const r = runCase('贴目标-第2拍', closeStory + `
    setTimeout(function(){ var b=document.getElementById('taixu-bubble'); if(b) b.click();
      setTimeout(function(){ var b2=document.getElementById('taixu-bubble'); if(b2) b2.click(); },250);
    },900);
    setTimeout(function(){` + measure(`
    var tg=document.querySelector('#sc-acts .cave-act[data-k="sit"]');
    if(tg&&b){ var gr=tg.getBoundingClientRect(); o.tgL=Math.round(gr.left); o.tgR=Math.round(gr.right); o.tailIn=o.tailCx>=gr.left-6&&o.tailCx<=gr.right+6; }
    o.persistedStep=window.S&&S.guide?S.guide.step:-1;`) + '},1600);', 1900);
  let o = null; try { o = JSON.parse(r.replace(/^S=/, '')); } catch (e) {}
  const ok = o && o.bubbleDom === 1 && o.skipDom === 1 && o.step === '2' && o.persistedStep === 2 && o.tailIn === true;
  if (!ok) failed++;
}
/* 场景三：跳过 → 整组摘除、无残留 */
{
  const r = runCase('跳过摘除', closeStory + `
    setTimeout(function(){
      try{ var gs0=Guide._state(); o.gs0=gs0?{step:gs0.step,done:gs0.done,skipped:gs0.skipped}:'null'; }catch(e){ o.gs0Err=String(e); }
      try{ Guide.skip(); }catch(e){ o.sErr=String(e&&e.message||e); }
    },900);
    setTimeout(function(){` + measure(`
    o.skipPersisted=window.S&&S.guide?{done:S.guide.done,skipped:S.guide.skipped}:null;`) + '},1400);', 1700);
  let o = null; try { o = JSON.parse(r.replace(/^S=/, '')); } catch (e) {}
  const ok = o && o.bubbleDom === 0 && o.skipDom === 0 && o.guideActive === false &&
    o.skipPersisted && o.skipPersisted.done === true && o.skipPersisted.skipped === true;
  if (!ok) failed++;
}
console.log('—— B1 引导形态 · 3 场景 · ' + (failed ? ('失败 ' + failed) : '全绿') + ' ——');
process.exit(failed ? 1 : 0);