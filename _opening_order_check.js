'use strict';
/* 常驻探针：开局弹层时序（2026-11-19 制作人批）
   A 创角独占：创角弹窗在场 → 剧情/引导 DOM 都为 0
   B 剧情先于引导：剧情卡开 → 引导 DOM=0；剧情关 → 引导才上台
   用法：ELECTRON_RUN_AS_NODE=1 "D:/Qoder CN/Qoder CN.exe" _opening_order_check.js */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const base = {
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
  enc:{t:0,bubble:null,lastId:''}, encBuff:{mult:0,until:0}, miles:{}, milesNew:[], letters:[], story:{claimed:{}},
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
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';

function runCase(name, seedHtml, act, wait) {
  const DIAG = `var o={};try{
    ${act}
    setTimeout(function(){
      o.charOpen=!document.getElementById('char-modal').classList.contains('hidden');
      o.storyOpen=!document.getElementById('story-modal').classList.contains('hidden');
      o.bubbleDom=document.querySelectorAll('#taixu-bubble').length;
      o.guideActive=document.body.classList.contains('guide-active');
      document.getElementById('diag').textContent='O='+JSON.stringify(o);
    },${wait});
  }catch(e){document.getElementById('diag').textContent='O_ERR='+JSON.stringify({m:String(e&&e.stack||e)});}`;
  const f = path.join(PAGE.SCRATCH, '._openorder_' + name + '.html');
  PAGE.writePage(f, html.replace('</head>', seedHtml + '\n</head>')
    .replace('</body>', FREEZE + '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
      '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},700);});</script></body>'));
  const ud = path.join('D:/xx-scratch', 'xxoo' + Date.now() + '_' + name);
  try {
    const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
      '--virtual-time-budget=12000','--window-size=900,1200','--dump-dom','file:///' + f.replace(/\\/g, '/')],
      { timeout: 120000, encoding: 'utf8', maxBuffer: 1 << 26 });
    const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
    console.log(name.padEnd(10) + (m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG'));
    return m ? m[1].replace(/&quot;/g, '"') : '';
  } catch (e) { console.log(name + ' ERR ' + e.message); return ''; }
  finally { fs.rmSync(f, { force: true }); try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
}

let failed = 0;
/* A 创角独占：无档 → 创角在场，剧情/引导都不许有 */
{
  const r = runCase('创角独占', '<script>try{localStorage.clear();}catch(e){}</scr' + 'ipt>', '', 600);
  let o = null; try { o = JSON.parse(r.replace(/^O=/, '')); } catch (e) {}
  if (!(o && o.charOpen && !o.storyOpen && o.bubbleDom === 0 && !o.guideActive)) failed++;
}
/* B 剧情先于引导：已建号 + 剧情未看 → 剧情卡在场时引导 DOM=0；关剧情后引导上台 */
{
  const r = runCase('剧情先于引导', seed,
    `var s=document.getElementById('story-modal');
     if(!s.classList.contains('hidden')){ window.__storyWasOpen=true; document.getElementById('sto-close').click(); }`,
    1200);
  let o = null; try { o = JSON.parse(r.replace(/^O=/, '')); } catch (e) {}
  if (!(o && o.storyOpen === false && o.bubbleDom >= 1)) failed++;
  /* 额外：剧情关闭前那一刻的 DOM 为 0（同一脚本先量再点） */
  const r2 = runCase('剧情在场', seed, '', 900);
  let o2 = null; try { o2 = JSON.parse(r2.replace(/^O=/, '')); } catch (e) {}
  if (!(o2 && o2.storyOpen === true && o2.bubbleDom === 0)) failed++;
}
console.log('—— 开局时序 · ' + (failed ? ('失败 ' + failed) : '全绿') + ' ——');
process.exit(failed ? 1 : 0);