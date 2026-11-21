'use strict';
/* 常驻探针：B3 沈碑呈现位＋必达（2026-11-20 总账第一批）
   验收口径：
     ①四个呈现位都挂同一图源（data-npc-art="stele"）：主页卡 / 对话页 / 现身事件 / 碑文题记；
     ②断图兜底：img 触发 error → 所在容器 .art-failed、破图隐藏、垫底「碑」字块可见（不出空白）；
     ③恢复：img 触发 load → .art-failed 移除；
     ④共用缓存：NpcArt 提供 preload/status，创角后预加载（status 应为 ok/loading，不是 idle）；
     ⑤崔九同构接口预留（_art.cuijiu 允许 null，preloadHero 存在）。
   用法：ELECTRON_RUN_AS_NODE=1 "D:/Qoder CN/Qoder CN.exe" _npc_art_check.js */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const save = {
  name:'青玄子', sex:'f', gender:'female', robe:'qing', rank:8, exp:5200, stone:128400,
  cave:3, dan:2, forge:1, dao:0, rootIdx:2, gong1:2, gong2:0, gong3:0, field:4, mine:2,
  herb:88, ore:30, weapon:2, weaponLv:2, bagSize:20, tower:7, towerMax:6, petSlots:1,
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
  npcs:{stele:{met:1, rel:10, stage:2, heard:['stele4','stele5'], lastSeen:t, told:[], keyLogged:[]}},
  guide:{ step:7, done:true, skipped:false, started:true, flags:{}, rewardClaims:{}, toldSystems:{} },
  last:t
};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const DIAG = `
var o={};
function q(s){ try{ return document.querySelector(s); }catch(e){ return null; } }
try{
  var sm=document.getElementById('story-modal'); if(sm && !sm.classList.contains('hidden')) document.getElementById('sto-close').click();
  setTimeout(function(){
    /* ④ 预加载与接口 */
    o.api=!!(window.NpcArt && NpcArt.preload && NpcArt.preloadAll && NpcArt.preloadHero && NpcArt._art);
    o.status=window.NpcArt?NpcArt.status('stele'):'noModule';
    o.cui=window.NpcArt?('cuijiu' in NpcArt._art):false;
    /* ① 主页卡 + 现身事件 */
    var bImg=q('.nb-ava img[data-npc-art="stele"]'), bSeal=q('.nb-ava .nb-seal');
    o.banner={img:!!bImg, seal:!!bSeal};
    var v=document.getElementById('npc-visit'); if(v) v.classList.remove('hidden');
    var vImg=q('.nv-ava img[data-npc-art="stele"]'), vSeal=q('.nv-ava .nv-seal');
    o.visit={img:!!vImg, seal:!!vSeal};
    /* ② 断图兜底：error → art-failed + 图隐藏；load → 恢复 */
    if(bImg){
      bImg.dispatchEvent(new Event('error'));
      o.fail={cls:bImg.parentNode.classList.contains('art-failed'), disp:getComputedStyle(bImg).display};
      bImg.dispatchEvent(new Event('load'));
      o.recover={cls:bImg.parentNode.classList.contains('art-failed'), disp:getComputedStyle(bImg).display};
    }
    /* ① 对话页 */
    ROUTER.open('role','xx-role-npc');
    setTimeout(function(){
      var pImg=q('.npc-pic[data-npc-art="stele"]'), pSeal=q('.npc-portrait .npc-seal');
      o.role={img:!!pImg, seal:!!pSeal};
      /* ① 题记（塔页） */
      try{ ROUTER.open('scene'); }catch(e){}
      var tb=q('.bld[data-bld="tower"]'); if(tb) tb.click();
      setTimeout(function(){
        var echo=document.getElementById('npc-echo-tower');
        o.echo={node:!!echo, hidden:echo?echo.hidden:null, img:!!(echo&&echo.querySelector('img.echo-ava[data-npc-art="stele"]'))};
        document.getElementById('diag').textContent='N='+JSON.stringify(o);
      },900);
    },900);
  },1200);
}catch(e){ document.getElementById('diag').textContent='N='+JSON.stringify({err:String(e&&e.stack||e)}); }`;
const f = path.join(PAGE.SCRATCH, '._npccheck.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE +
  '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
  '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},800);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxna' + Date.now());
let failed = 0;
try {
  const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
    '--virtual-time-budget=18000','--window-size=900,1200','--dump-dom','file:///' + f.replace(/\\/g, '/')],
    { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const txt = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(txt);
  let o = null; try { o = JSON.parse(txt.replace(/^N=/, '')); } catch (e) {}
  const ok = o && o.api === true && o.status !== 'idle' && o.status !== 'noModule' && o.cui === true &&
    o.banner && o.banner.img && o.banner.seal && o.visit && o.visit.img && o.visit.seal &&
    o.fail && o.fail.cls === true && o.fail.disp === 'none' && o.recover && o.recover.cls === false && o.recover.disp !== 'none' &&
    o.role && o.role.img && o.role.seal &&
    o.echo && o.echo.node && o.echo.hidden === false && o.echo.img === true;
  if (!ok) failed++;
} catch (e) { console.log('ERR ' + e.message); failed++; }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
console.log('—— B3 沈碑呈现位 · ' + (failed ? '失败 1' : '全绿') + ' ——');
process.exit(failed ? 1 : 0);