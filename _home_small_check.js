'use strict';
/* 主页小高度常驻探针（只读游戏，产物只写 D 盘）
   任务单 2026-11-18：PC 窗口高度不够时主页一滚就散架。
   修法：主页整屏不滚（舞台锁 100dvh，内部元素按高度收放）。
   验收硬条件：1280x600、430x700 打开主页，滚到底再回顶，不错位、不压盖、无空白断层。
   本探针做两件事：
     1) 几何体检：doc/scene 无滚动、cave 不产生滚动、关键块两两不压盖、底部有实体不空白；
     2) 实拍：滚到底一张、回顶一张，落 D:/xx-scratch/log/home_small/。
   用法：ELECTRON_RUN_AS_NODE=1 "D:/Qoder CN/Qoder CN.exe" _home_small_check.js */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const OUT = 'D:/xx-scratch/log/home_small';
fs.mkdirSync(OUT, { recursive: true });

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now();
const claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5',
 '4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const s = {
  name:'元呆呆', sex:'m', gender:'male', robe:'bai',
  rank:8, exp:5200, stone:128400, cave:3, dan:2, forge:1, dao:0, rootIdx:2,
  gong1:2, gong2:0, gong3:0, field:4, mine:2, herb:88, ore:30,
  weapon:2, weaponLv:2, bagSize:20, tower:7, towerMax:6, petSlots:1,
  wisdom:260, insight:0, failBonus:0, guardMirror:0, guardArray:0, tianji:0,
  herb100:0, herb10000:0, log:[], bag:[], recipeN:{},
  mastery:{alchemyLv:2,alchemyExp:40,forgeLv:1,forgeExp:0},
  stats:{sit:14,herb:9,train:4,enlight:2,craftPill:6,explore:3,hunt:7,enhance:2,stoneEarned:84200,farmN:5},
  plots:[], pets:[], eggs:[],
  arena:{day:'',left:3,tier:1,win:4,lose:1,rep:120,foes:[]},
  union:{start:t,day:'',left:0,merit:0,claimed:[],season:1},
  sign:{days:3,last:''},
  secret:{prog:[3,1,0,0],day:'',swept:0}, towerDay:'', towerSwept:0,
  enc:{t:0,bubble:null,lastId:''}, encBuff:{mult:0,until:0},
  miles:{}, milesNew:[], letters:[], story:{claimed},
  equipment:{weapon:null,armor:null,accessory:null},
  shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},
  market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},
  questsDone:[], bossKilled:{}, acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},
  actDay:'', gate:{lv:0,grad:0,disciples:[]},
  council:{day:'',n:0,last:''},
  trail:{i:8}, trail2:{i:0},
  life:{age:0,on:false,brk:0}, legacy:{gens:0,relic:null,hist:[],pick:null},
  mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},
  last:t
};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(s)) +
  ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}' +
  '#char-modal,#story-modal,.scene-particles,.toast{display:none!important}</style>';

/* 先滚到底，再回顶；两个状态各量一次几何，并输出压盖/出屏/底部空隙。 */
const DIAG = `var out={};
var q=function(x){return document.querySelectorAll(x);},g=function(x){return document.querySelector(x);};
var R=function(e){var r=e.getBoundingClientRect();return {l:Math.round(r.left),t:Math.round(r.top),r:Math.round(r.right),b:Math.round(r.bottom)};};
var scene=g('#page-scene'), cave=g('#scene-cave'), hb=g('#sc-handbook'), top=g('#page-scene .topbar'),
    ban=g('#scene-cave .npc-banner'), acts=g('#scene-cave .cave-acts'), tabs=g('#page-scene .scene-tabs'), rail=g('#page-scene .sys-rail');
var BLK=[['topbar',top],['handbook',hb],['banner',ban],['acts',acts],['tabs',tabs],['rail',rail]];
function measure(tag){
  var o={};
  o.win=[innerWidth,innerHeight];
  o.doc=[document.scrollingElement.scrollWidth,document.scrollingElement.clientWidth,document.scrollingElement.scrollHeight,document.scrollingElement.clientHeight,window.scrollY];
  o.scene=scene?[scene.scrollWidth,scene.clientWidth,scene.scrollHeight,scene.clientHeight,scene.scrollTop]:null;
  o.cave=cave?[cave.scrollWidth,cave.clientWidth,cave.scrollHeight,cave.clientHeight,cave.scrollTop]:null;
  o.caveOv=cave?getComputedStyle(cave).overflowY+'/'+getComputedStyle(cave).overflowX:null;
  var rects={};BLK.forEach(function(p){ if(p[1]) rects[p[0]]=R(p[1]); });
  o.rects=rects;
  var ov=[];
  for(var i=0;i<BLK.length;i++)for(var j=i+1;j<BLK.length;j++){
    var a=rects[BLK[i][0]],b=rects[BLK[j][0]];if(!a||!b)continue;
    var ix=Math.min(a.r,b.r)-Math.max(a.l,b.l),iy=Math.min(a.b,b.b)-Math.max(a.t,b.t);
    if(ix>4&&iy>4) ov.push(BLK[i][0]+'x'+BLK[j][0]+' '+ix+'x'+iy);
  }
  o.overlap=ov;
  var off=[];BLK.forEach(function(p){var r=rects[p[0]];if(!r)return;
    if(r.l<-2||r.r>innerWidth+2||r.t<-2||r.b>innerHeight+2) off.push(p[0]+' '+JSON.stringify(r));});
  o.offscreen=off;
  o.bottomGap=(tabs?Math.round(innerHeight-R(tabs).b):null);
  o.actsAboveTabs=(acts&&tabs)?Math.round(R(tabs).t-R(acts).b):null;
  o.bannerAboveActs=(ban&&acts)?Math.round(R(acts).t-R(ban).b):null;
  o.nodeY=Array.prototype.map.call(q('#scene-cave .node-jade'),function(e){var r=R(e);return [r.t,r.b];});
  out[tag]=o;
}
setTimeout(function(){
  window.scrollTo(0,999999);
  document.scrollingElement.scrollTop=999999;
  if(scene)scene.scrollTop=999999;
  if(cave)cave.scrollTop=999999;
  setTimeout(function(){
    measure('bottom');
    window.scrollTo(0,0);document.scrollingElement.scrollTop=0;
    if(scene)scene.scrollTop=0;if(cave)cave.scrollTop=0;
    setTimeout(function(){
      measure('top');
      document.getElementById('diag').textContent='HOME_SMALL='+JSON.stringify(out);
    },250);
  },300);
},600);`;
/* 截图状态：bottom=先滚到底再拍；top=滚到底后回顶再拍。 */
const SCROLL = {
  bottom: 'window.scrollTo(0,999999);document.scrollingElement.scrollTop=999999;' +
    'var sc=document.getElementById("scene-cave");if(sc)sc.scrollTop=999999;' +
    'var sy=document.getElementById("page-scene");if(sy)sy.scrollTop=999999;',
  top: 'window.scrollTo(0,999999);document.scrollingElement.scrollTop=999999;' +
    'var sc=document.getElementById("scene-cave");if(sc)sc.scrollTop=999999;' +
    'var sy=document.getElementById("page-scene");if(sy)sy.scrollTop=999999;' +
    'setTimeout(function(){window.scrollTo(0,0);document.scrollingElement.scrollTop=0;' +
    'if(sc)sc.scrollTop=0;if(sy)sy.scrollTop=0;},350);'
};

/* 验收两档出图；另两档只量几何，守 690/730 断点带不压盖。 */
for (const [w,h] of [[1280,600],[430,700],[1280,780],[430,690]]) {
  const tag = w + 'x' + h;
  const needShot = (w === 1280 && h === 600) || (w === 430 && h === 700);
  /* 1) 几何体检 */
  {
    const f = path.join(PAGE.SCRATCH, '._homesmall_' + w + '_' + h + '.html');
    PAGE.writePage(f, html
      .replace('</head>', seed + '\n</head>')
      .replace('</body>', FREEZE + '\n<div id="diag" style="position:fixed;left:0;top:0;z-index:9999;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>\n' +
        '<script>window.addEventListener("load",function(){setTimeout(function(){if(window.Tutorial)Tutorial.finish();XX._render();' + DIAG + '},450);});</script>\n</body>'));
    const ud = path.join('D:/xx-scratch', 'xxhomesmall' + Date.now() + '_' + w);
    try {
      const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
        '--virtual-time-budget=12000','--window-size=' + w + ',' + h,'--dump-dom','file:///' + f.replace(/\\/g, '/')],
        { timeout: 120000, encoding: 'utf8', maxBuffer: 1 << 26 });
      const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
      console.log('几何 ' + tag.padEnd(9) + (m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : ('NO-DIAG len=' + (out || '').length)));
    } catch (e) {
      console.log('几何 ' + tag.padEnd(9) + 'ERR ' + (e && e.message));
    } finally {
      fs.rmSync(f, { force: true });
      try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
    }
  }
  /* 2) 两态实拍 */
  for (const state of (needShot ? ['bottom','top'] : [])) {
    const name = 'home_small_' + tag + '_' + state + '.png';
    const body = 'if(window.Tutorial)Tutorial.finish();XX._render();' + SCROLL[state];
    const f = path.join(PAGE.SCRATCH, '._homeshot_' + w + '_' + state + '.html');
    PAGE.writePage(f, html
      .replace('</head>', seed + '\n</head>')
      .replace('</body>', FREEZE + '\n<script>window.addEventListener("load",function(){setTimeout(function(){' + body + '},500);});</script>\n</body>'));
    const out = path.join(OUT, name);
    const ud = path.join('D:/xx-scratch', 'xxhomeshot' + Date.now() + '_' + w + '_' + state);
    try {
      execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
        '--virtual-time-budget=9000','--window-size=' + w + ',' + h,'--screenshot=' + out,
        'file:///' + f.replace(/\\/g, '/')], { timeout: 120000, stdio: ['ignore','ignore','pipe'] });
      console.log('截图 ' + name.padEnd(34) + (fs.existsSync(out) ? ('OK ' + fs.statSync(out).size + 'B') : 'MISS'));
    } catch (e) {
      console.log('截图 ' + name.padEnd(34) + 'ERR ' + (e && e.message));
    } finally {
      fs.rmSync(f, { force: true });
      try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
    }
  }
}