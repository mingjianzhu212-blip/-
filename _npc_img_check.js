'use strict';
/* 组合探针：A5 NPC 关系进度感 + 崔九问候 / A6 图片兜底（2026-11-20 总账第二批） */
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
  herb:88, ore:30, weapon:2, weaponLv:2, bagSize:20, tower:7, towerMax:16, petSlots:1,
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
  npcs:{ stele:{ met:1, rel:14, stage:2, heard:['stele1','stele2'], lastSeen:t, told:[], keyLogged:[] },
         cuijiu:{ met:1, rel:20, heard:['ct1'], lastSeen:t } },
  guide:{ step:7, done:true, skipped:false, started:true, flags:{}, rewardClaims:{}, toldSystems:{} },
  last:t
};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const DIAG = `
(async function(){
  var o={ok:true,errs:[]};
  var sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function txt(id){ var e=document.getElementById(id); return e?e.textContent:''; }
  function topicRow(name){ var rows=[].slice.call(document.querySelectorAll('.npc-topic')); return rows.filter(function(r){return r.textContent.indexOf(name)>=0;})[0]||null; }
  try{
    await sleep(1200);
    var sm=document.getElementById('story-modal'); if(sm && !sm.classList.contains('hidden')) document.getElementById('sto-close').click();
    await sleep(300);
    try{ ROUTER.open('role','xx-role-npc'); }catch(e){ o.errs.push('open npc: '+e.message); }
    await sleep(900);
    o.stage0=txt('npc-rel');
    var row0=topicRow('他为何守着');
    o.lockedRow=!!row0;
    o.locked=!!(row0 && row0.classList.contains('lock'));
    o.hint=row0 ? (row0.querySelector('.sto-hint')||{}).textContent||'' : '';
    if(!(o.stage0 && /多来坐坐/.test(o.stage0))) o.errs.push('阶段定性行缺失');
    if(!o.locked) o.errs.push('rel14 深话题未锁');
    if(o.hint && /[0-9０-９]/.test(o.hint)) o.errs.push('锁定提示含数字');
    if(!/坐坐|托付|塔/.test(o.hint)) o.errs.push('锁定提示未指向类别');
    /* 跨过门槛：rel 16 → 阶段 1 + 新话题亮起 + 信号 */
    window.S.npcs.stele.rel=16;
    try{ ROUTER.open('role'); }catch(e){}
    await sleep(300);
    try{ ROUTER.open('role','xx-role-npc'); }catch(e){}
    await sleep(900);
    o.stage1=txt('npc-rel');
    var row1=topicRow('他为何守着');
    o.unlocked=!!(row1 && !row1.classList.contains('lock'));
    o.signal=(window.S.log||[]).some(function(l){ return (l.t||'').indexOf('眼神')>=0; });
    if(!(o.stage1 && /肯多说你两句/.test(o.stage1))) o.errs.push('跨门槛阶段行未变');
    if(!o.unlocked) o.errs.push('跨门槛话题未亮');
    if(!o.signal) o.errs.push('阶段变化无可见信号');
    /* 崔九问候：旧记忆引用 13 层，当前 towerMax=16 → 必须引用 16 */
    try{
      var orig = window.NpcMemory.mention;
      window.NpcMemory.mention = function(){ return { knowsPlayer:true, top:'你登塔破了第 13 层', attitude:4 }; };
      var st = window.S.npcs.cuijiu || { met:1 };
      var say = window.NpcTower.npcSay(st, { now: Date.now(), towerMax: 16 });
      window.NpcMemory.mention = orig;
      o.cuijiu={ greet:say.greeting, has16:say.greeting.indexOf('第 16 层')>=0, has13:say.greeting.indexOf('第 13 层')>=0 };
      if(!o.cuijiu.has16 || o.cuijiu.has13) o.errs.push('崔九问候仍引用过期层数');
    }catch(e){ o.errs.push('cuijiu: '+e.message); }
    /* A6：断图兜底 */
    var im=document.createElement('img');
    im.src='ui/icons/__missing__.png'; im.alt='矿石'; im.style.width='24px'; im.style.height='24px';
    document.body.appendChild(im);
    await sleep(3800);
    var fb=im.nextSibling;
    o.imgfb={ done:im.dataset.fbDone, hasFb:!!(fb && fb.className==='img-fb'), text:fb?fb.textContent:'', hidden:getComputedStyle(im).display };
    if(!(o.imgfb.done==='1' && o.imgfb.hasFb && o.imgfb.text && o.imgfb.hidden==='none')) o.errs.push('断图未出文字兜底');
    var falsePos=[].slice.call(document.getElementsByTagName('img')).some(function(x){ return x.dataset.fbDone==='1' && x.naturalWidth>0; });
    o.noFalsePositive=!falsePos;
    if(falsePos) o.errs.push('正常图被误判兜底');
    o.ok=o.errs.length===0;
    document.getElementById('diag').textContent='N='+JSON.stringify(o);
  }catch(e){ document.getElementById('diag').textContent='N='+JSON.stringify({ok:false,err:String(e&&e.stack||e)}); }
})();`;
const f = path.join(PAGE.SCRATCH, '._npcimg.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE +
  '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
  '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},900);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxni' + Date.now());
let failed = 0;
try {
  const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
    '--virtual-time-budget=20000','--window-size=900,1200','--dump-dom','file:///' + f.replace(/\\/g, '/')],
    { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const txt2 = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(txt2);
  let o = null; try { o = JSON.parse(txt2.replace(/^N=/, '')); } catch (e) {}
  if (!(o && o.ok === true)) failed++;
} catch (e) { console.log('ERR ' + e.message); failed++; }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
console.log('—— A5 关系进度感 + A6 图片兜底 · ' + (failed ? '失败 1' : '全绿') + ' ——');
process.exit(failed ? 1 : 0);