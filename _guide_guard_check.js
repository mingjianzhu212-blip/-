'use strict';
/* 常驻探针：引导与创角弹窗互斥（2026-11-19 制作人批）
   验收口径：#char-modal 在场时，#taixu-bubble 的 DOM 数量必须为 0（不是 display:none）。
   覆盖：A 首开无档；B 清档（设置→清空存档）；C 编辑角色（改名）不误伤既有引导。
   用法：ELECTRON_RUN_AS_NODE=1 "D:/Qoder CN/Qoder CN.exe" _guide_guard_check.js */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const save = {
  name:'元呆呆', sex:'m', gender:'male', robe:'bai', rank:8, exp:5200, stone:128400,
  cave:3, dan:2, forge:1, dao:0, rootIdx:2, gong1:2, gong2:0, gong3:0, field:4, mine:2,
  herb:88, ore:30, weapon:2, weaponLv:2, bagSize:20, tower:7, towerMax:6, petSlots:1,
  wisdom:260, insight:0, failBonus:0, guardMirror:0, guardArray:0, tianji:0, herb100:0, herb10000:0,
  log:[], bag:[], recipeN:{}, mastery:{alchemyLv:2,alchemyExp:40,forgeLv:1,forgeExp:0},
  stats:{sit:14,herb:9,train:4,enlight:2,craftPill:6,explore:3,hunt:7,enhance:2,stoneEarned:84200,farmN:5},
  plots:[], pets:[], eggs:[],
  arena:{day:'',left:3,tier:1,win:4,lose:1,rep:120,foes:[]},
  union:{start:t,day:'',left:0,merit:0,claimed:[],season:1}, sign:{days:3,last:''},
  secret:{prog:[3,1,0,0],day:'',swept:0}, towerDay:'', towerSwept:0,
  enc:{t:0,bubble:null,lastId:''}, encBuff:{mult:0,until:0}, miles:{}, milesNew:[], letters:[], story:{claimed},
  equipment:{weapon:null,armor:null,accessory:null},
  shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},
  market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},
  questsDone:[], bossKilled:{}, acts:{sit:0,herb:0,train:0,enlight:0,ponder:0}, actDay:'',
  gate:{lv:0,grad:0,disciples:[]}, council:{day:'',n:0,last:''}, trail:{i:8}, trail2:{i:0},
  life:{age:0,on:false,brk:0}, legacy:{gens:0,relic:null,hist:[],pick:null},
  mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0}, last:t
};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';

const CASES = [
  ['首开无档', '<script>try{localStorage.clear();}catch(e){}</scr' + 'ipt>', ''],
  ['清档回创角', seed, 'window.confirm=function(){return true;};document.getElementById("sc-settings").click();if(window.XX&&XX._resetAll)XX._resetAll();else if(typeof XX!=="undefined"&&XX._resetAll)XX._resetAll();'],
  ['编辑角色(非新档)', seed, 'if(typeof XX!=="undefined"&&XX._render)XX._render();document.getElementById("m-char").click();']
];
let failed = 0;
for (const [name, seedHtml, act] of CASES) {
  const DIAG = `var out={};try{
    ${act}
    setTimeout(function(){
      out.charOpen=!document.getElementById('char-modal').classList.contains('hidden');
      out.bubbleDom=document.querySelectorAll('#taixu-bubble').length;
      out.skipDom=document.querySelectorAll('#taixu-bubble .tb-skip').length;
      out.guideActive=document.body.classList.contains('guide-active');
      document.getElementById('diag').textContent='G='+JSON.stringify(out);
    },350);
  }catch(e){document.getElementById('diag').textContent='G='+JSON.stringify({err:String(e&&e.stack||e)});}`;
  const f = path.join(PAGE.SCRATCH, '._guideguard_' + name + '.html');
  PAGE.writePage(f, html.replace('</head>', seedHtml + '\n</head>')
    .replace('</body>', FREEZE + '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
      '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},650);});</script></body>'));
  const ud = path.join('D:/xx-scratch', 'xxgg' + Date.now() + '_' + name);
  try {
    const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
      '--virtual-time-budget=10000','--window-size=900,1200','--dump-dom','file:///' + f.replace(/\\/g, '/')],
      { timeout: 120000, encoding: 'utf8', maxBuffer: 1 << 26 });
    const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
    const txt = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
    console.log(name.padEnd(10) + txt);
    let o = null;
    try { o = JSON.parse(String(txt).replace(/^G=/, '')); } catch (e) {}
    const ok = o && o.charOpen === true && o.bubbleDom === 0 && o.skipDom === 0 && o.guideActive === false;
    if (!ok) failed++;
  } catch (e) { console.log(name + ' ERR ' + e.message); failed++; }
  finally { fs.rmSync(f, { force: true }); try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
}
console.log('—— 引导/创角互斥 · 3 场景 · ' + (failed ? ('失败 ' + failed) : '全绿') + ' ——');
process.exit(failed ? 1 : 0);