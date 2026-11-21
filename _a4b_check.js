'use strict';
/* 常驻探针：A4b 四族强化（乙案 · 共用 S.weaponLv · 三族 30% 系数）
   口径：bg +1.5%/级并入 artPowPct；brk +0.15pp/级；cai +0.6%/级；仅拥有该族时生效。
   复算锚点（呆呆已核成本的机制）：seg2 基数 bg +7% / brk +7pp / cai +10%：
     +5 → bg 相对 +7.0%；+10 → +14.0%；+15 → +21.0%；+20 → +28.0%（乘区相对＝总战力相对）
     brk +20 → 7pp→10pp；cai +20 → ×1.10→×1.22（相对 +10.9%）
   用法：ELECTRON_RUN_AS_NODE=1 "D:/Qoder CN/Qoder CN.exe" _a4b_check.js */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const save = {
  name:'元呆呆', sex:'m', gender:'male', robe:'bai', rank:11, exp:0, stone:100000,
  cave:3, dan:2, forge:2, dao:0, rootIdx:2, gong1:2, gong2:0, gong3:0, field:4, mine:2,
  herb:88, ore:300, weapon:2, weaponLv:0, bagSize:20, tower:7, towerMax:6, petSlots:1,
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
  art:{ bg:2, brk:2, cai:2 },
  guide:{ step:7, done:true, skipped:false, started:true, flags:{}, rewardClaims:{}, toldSystems:{} },
  last:t
};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const DIAG = `
(async function(){
  var o={ok:true,errs:[]};
  var sleep=ms=>new Promise(r=>setTimeout(r,ms));
  try{
    await sleep(1200);
    var S=window.S, A=XX._art;
    function read(){ return { pow:A.powPct(), brk:A.brkPct(), stone:A.stonePct() }; }
    S.weaponLv=0; var b0=read();
    var rows={};
    for(const lv of [5,10,15,20]){
      S.weaponLv=lv; var b=read();
      rows[lv]={ bgRel:+(((1+b.pow)/(1+b0.pow))*100-100).toFixed(1), brkPP:+((b.brk-b0.brk)*100).toFixed(2), caiRel:+(((1+b.stone)/(1+b0.stone))*100-100).toFixed(1) };
    }
    o.base=b0; o.rows=rows;
    if(Math.abs(rows[5].bgRel-7.0)>0.1) o.errs.push('bg +5 相对≠7.0: '+rows[5].bgRel);
    if(Math.abs(rows[10].bgRel-14.0)>0.1) o.errs.push('bg +10 相对≠14.0');
    if(Math.abs(rows[15].bgRel-21.0)>0.1) o.errs.push('bg +15 相对≠21.0');
    if(Math.abs(rows[20].bgRel-28.0)>0.1) o.errs.push('bg +20 相对≠28.0');
    if(Math.abs(rows[20].brkPP-3.0)>0.01) o.errs.push('brk +20 增量≠3pp: '+rows[20].brkPP);
    if(Math.abs(rows[20].caiRel-10.9)>0.2) o.errs.push('cai +20 相对≠10.9: '+rows[20].caiRel);
    /* 所有权守门：未获得该族 → 强化不白送 */
    S.art={bg:0,brk:0,cai:0}; S.weaponLv=20;
    o.unowned={pow:A.powPct(),brk:A.brkPct(),stone:A.stonePct()};
    if(o.unowned.pow!==0||o.unowned.brk!==0||o.unowned.stone!==0) o.errs.push('未持有族仍吃强化');
    /* 强化页文案 */
    S.art={bg:2,brk:2,cai:2}; S.weaponLv=3;
    try{ ROUTER.open('dong','xx-enhance-sec'); }catch(e){}
    await sleep(700);
    o.rule=(document.querySelector('.enh-rule')||{}).textContent||'';
    if(!/四族共用/.test(o.rule)||!/1.5%/.test(o.rule)||!/0.15pp/.test(o.rule)||!/0.6%/.test(o.rule)) o.errs.push('强化页规则行未更新/缺系数');
    o.ok=o.errs.length===0;
    document.getElementById('diag').textContent='B='+JSON.stringify(o);
  }catch(e){ document.getElementById('diag').textContent='B='+JSON.stringify({ok:false,err:String(e&&e.stack||e)}); }
})();`;
const f = path.join(PAGE.SCRATCH, '._a4b.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE +
  '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
  '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},900);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxa4b' + Date.now());
let failed = 0;
try {
  const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
    '--virtual-time-budget=15000','--window-size=900,1200','--dump-dom','file:///' + f.replace(/\\/g, '/')],
    { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const txt = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(txt);
  let o = null; try { o = JSON.parse(txt.replace(/^B=/, '')); } catch (e) {}
  if (!(o && o.ok === true)) failed++;
} catch (e) { console.log('ERR ' + e.message); failed++; }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
console.log('—— A4b 四族强化 · ' + (failed ? '失败 1' : '全绿') + ' ——');
process.exit(failed ? 1 : 0);