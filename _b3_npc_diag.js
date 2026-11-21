'use strict';
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const s = {name:'复验散人',sex:'m',gender:'male',robe:'bai',rank:6,exp:400,stone:1000,cave:0,dan:1,forge:1,dao:0,rootIdx:1,gong1:0,gong2:0,gong3:0,field:0,mine:0,herb:25,ore:25,weapon:0,weaponLv:0,bagSize:20,tower:0,towerMax:1,petSlots:1,wisdom:0,insight:0,failBonus:0,guardMirror:0,guardArray:0,tianji:0,herb100:0,herb10000:0,log:[],bag:[],recipeN:{},mastery:{alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0},stats:{sit:9,herb:3,train:2,enlight:1,craftPill:1,explore:0,hunt:0,enhance:0,stoneEarned:100,farmN:0},plots:[],pets:[],eggs:[],arena:{day:'',left:0,tier:1,win:0,lose:0,rep:0,foes:[]},union:{start:t,day:'',left:0,merit:0,claimed:[],season:1},sign:{days:0,last:''},secret:{prog:[0,0,0,0],day:'',swept:0},towerDay:'',towerSwept:0,enc:{t:0,bubble:null,lastId:''},encBuff:{mult:0,until:0},miles:{},milesNew:[],letters:[],story:{claimed:claimed},equipment:{weapon:null,armor:null,accessory:null},shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},questsDone:[],bossKilled:{},acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},actDay:'',gate:{lv:0,grad:0,disciples:[]},council:{day:'',n:0,last:''},trail:{i:8},trail2:{i:1},life:{age:40,on:true,brk:0},legacy:{gens:0,relic:null,hist:[],pick:null},mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},guide:{step:14,done:true,skipped:false,started:true,flags:{c_enter:true,c_sit:true,c_brk:true,c_field:true},rewardClaims:{taixu_intro_dan_v1:true},toldSystems:{}},npcs:{stele:{met:1,rel:10,stage:2,seenGens:0,lastSeen:Date.now(),nudgeAt:0,heard:['stele1','stele3','stele4'],choice:{listened:1,showoff:0,promise:0},cur:{lastRank:6,talk:4,promptTale:0}}},worldFoot:'',last:t};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(s)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const DIAG = `(async function(){
  var o={ok:true,errs:[]}; var sleep=ms=>new Promise(r=>setTimeout(r,ms));
  window.__errs=[]; window.addEventListener('error',function(e){ window.__errs.push(String(e.message)); });
  try{
    var sm=document.getElementById('story-modal'); if(sm&&!sm.classList.contains('hidden')) document.getElementById('sto-close').click();
    var gb=document.getElementById('taixu-bubble'); if(gb){var sk=document.getElementById('taixu-skip'); if(sk) sk.click();}
    await sleep(600);
    ROUTER.open('role'); await sleep(500);
    o.r1=ROUTER.current(); o.depth1=ROUTER.depth();
    ROUTER.open('role','xx-role-npc'); await sleep(700);
    o.r2=ROUTER.current(); o.depth2=ROUTER.depth();
    o.panel=document.querySelector('.panel-page') ? document.querySelector('.panel-page').dataset.sec : 'none';
    o.hasTopics=!!document.getElementById('npc-topics');
    o.rows=document.querySelectorAll('#npc-topics .npc-topic').length;
    o.lock=document.querySelectorAll('#npc-topics .npc-topic.lock').length;
    o.hint=(function(){var e=document.querySelector('#npc-topics .npc-topic.lock .npc-topic-hint');return e?e.textContent:'';})();
    o.errsPage=window.__errs;
    o.bodyHead=(document.getElementById('panel-host')||{}).innerText ? document.getElementById('panel-host').innerText.slice(0,160) : '';
  }catch(e){ o.ok=false; o.errs.push(String(e&&e.stack||e)); }
  document.getElementById('diag').textContent='G='+JSON.stringify(o);
})();`;
const f = path.join(PAGE.SCRATCH, '._b3npcdiag.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE +
  '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
  '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},800);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxnpcdiag' + Date.now());
try {
  const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
    '--virtual-time-budget=14000','--window-size=900,1200','--dump-dom','file:///' + f.replace(/\\/g, '/')],
    { timeout: 120000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  console.log(m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG');
} catch (e) { console.log('ERR ' + e.message); }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }