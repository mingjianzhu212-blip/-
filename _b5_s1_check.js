'use strict';
/* batch5 第一段探针：解锁插屏通用化 + 法宝图鉴 */
const fs=require('node:fs'),path=require('node:path');const ROOT=__dirname;
const PAGE=require('./tools/page.js');const {execEdge}=require('./tools/edge-run.js');PAGE.use(ROOT);
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const t=Date.now(),claimed={};['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id=>claimed[id]=t);
const base={name:'青玄子',sex:'m',gender:'male',robe:'bai',rank:5,exp:120,stone:9000,herb:25,ore:25,cave:1,dan:1,forge:1,dao:0,rootIdx:1,gong1:2,gong2:0,gong3:0,field:0,mine:0,weapon:2,weaponLv:1,bagSize:20,tower:0,towerMax:0,petSlots:1,wisdom:0,insight:0,failBonus:0,guardMirror:0,guardArray:0,tianji:0,herb100:0,herb10000:0,log:[],bag:[],recipeN:{},mastery:{alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0},stats:{sit:0,herb:0,train:0,enlight:0,craftPill:0,explore:0,hunt:0,enhance:0,stoneEarned:0,farmN:0},plots:[],pets:[],eggs:[],arena:{day:'',left:3,tier:1,win:0,lose:0,rep:0,foes:[]},union:{start:t,day:'',left:1,merit:0,claimed:[],season:1},sign:{days:0,last:''},secret:{prog:[0,0,0,0],day:'',swept:0},towerDay:'',towerSwept:0,enc:{t:0,bubble:null,lastId:''},encBuff:{mult:0,until:0},miles:{},milesNew:[],letters:[],story:{claimed:claimed},equipment:{weapon:null,armor:null,accessory:null},shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},actDay:'',gate:{lv:0,grad:0,disciples:[]},coopBoss:{week:'',hpMax:0,dmg:0,claimed:[],parts:0},lingchao:{week:'',started:0,startedAt:0,kills:0,claimed:[],pv:0},unlocks:[],council:{day:'',n:0,last:''},trail:{i:8},trail2:{i:1},life:{age:40,on:true,brk:0},legacy:{gens:0,relic:null,hist:[],pick:null},mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},guide:{step:14,done:true,skipped:false,started:true,flags:{c_enter:true,c_sit:true,c_brk:true,c_field:true},rewardClaims:{taixu_intro_dan_v1:true},toldSystems:{}},art:{bg:1,brk:0,cai:0},last:t};
const seed='<script>try{localStorage.setItem("xiuxian_save",'+JSON.stringify(JSON.stringify(base))+');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr'+'ipt>';
const FREEZE='<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const SCRIPT=`
  await sleep(500);
  var sm=document.getElementById('story-modal');if(sm&&!sm.classList.contains('hidden'))document.getElementById('sto-close').click();
  var gb=document.getElementById('taixu-bubble');if(gb){var sk=document.getElementById('taixu-skip');if(sk)sk.click();}
  await sleep(300);
  var S=XX._s;
  o.points=XX._unlockPoints.map(function(p){return p.id+':'+p.rank+':'+(p.name?'y':'n')+':'+(p.desc?'y':'n')+':'+(p.go?'y':'n');});
  if(!(o.points.length>=10&&o.points.every(function(x){return x.indexOf(':y:y:y')>=0;}))) o.errs.push('解锁点总表异常: '+JSON.stringify(o.points));
  /* 新解锁：rank 6 弹「幽谷秘境」，只弹一次，有前往 */
  S.rank=6;S.unlocks=[];XX._queueUnlocks(5,6);XX._render();await sleep(300);
  var cs=document.getElementById('craft-settle');
  o.unlock={vis:!cs.classList.contains('hidden'),title:(document.getElementById('cs-title')||{}).textContent||'',
    hasGo:!!Array.from(document.querySelectorAll('#cs-rows button')).some(function(b){return b.textContent.indexOf('前往')>=0;})};
  if(!(o.unlock.vis&&/新功能解锁 · 秘境 · 幽谷秘境/.test(o.unlock.title)&&o.unlock.hasGo)) o.errs.push('解锁插屏缺项: '+JSON.stringify(o.unlock));
  document.getElementById('cs-close').click();await sleep(300);XX._render();await sleep(200);
  o.unlock.seen=XX._unlockSeen().indexOf('secret2')>=0;o.unlock.again=!cs.classList.contains('hidden');
  if(!(o.unlock.seen&&!o.unlock.again)) o.errs.push('解锁重复弹/未记录: '+JSON.stringify(o.unlock));
  /* 图鉴：真实入口 role → 法宝图鉴；36 件、进度 3/36、灰影有出处 */
  ROUTER.open('role','xx-role-equip');await sleep(300);
  o.codex={};
  var link=document.querySelector('#char-sheet [data-codex]'); o.codex.entry=!!link;
  if(!link) o.errs.push('人物页无法宝图鉴入口');
  else link.click(); await sleep(400);
  o.codex.cur=ROUTER.current();
  o.codex.cards=document.querySelectorAll('#xx-codex .codex-card').length;
  o.codex.prog=(document.getElementById('codex-progress')||{}).textContent||'';
  o.codex.owned=document.querySelectorAll('#xx-codex .codex-card.owned').length;
  o.codex.lockedSrc=(document.querySelector('#xx-codex .codex-card.locked .cc-src')||{}).textContent||'';
  o.codex.topbarEntry=!!document.querySelector('.topbar [data-codex]');
  if(!(o.codex.cur==='codex'&&o.codex.cards===36&&o.codex.prog.indexOf('3 / 36')>=0&&o.codex.owned===3&&/出处/.test(o.codex.lockedSrc)&&/炼器坊/.test(o.codex.lockedSrc)&&!o.codex.topbarEntry)) o.errs.push('图鉴缺项: '+JSON.stringify(o.codex));
`;
const DIAG=`(async function(){var o={ok:true,errs:[]};var sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{${SCRIPT}}catch(e){o.ok=false;o.errs.push(String(e&&e.stack||e));}
document.getElementById('diag').textContent='G='+JSON.stringify(o);})();`;
const f=path.join(PAGE.SCRATCH,'._b5s1.html');
PAGE.writePage(f,html.replace('</head>',seed+'\n</head>').replace('</body>',FREEZE+'<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div><script>window.addEventListener("load",function(){setTimeout(function(){'+DIAG+'},800);});</script></body>'));
const ud=path.join('D:/xx-scratch','xxb5s1'+Date.now());
try{const out=execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir='+ud,'--virtual-time-budget=16000','--window-size=430,900','--dump-dom','file:///'+f.replace(/\\/g,'/')],{timeout:180000,encoding:'utf8',maxBuffer:1<<26});const m=/<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out||'');const r=m?m[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'):'NO-DIAG';console.log(r);let o=null;try{o=JSON.parse(r.replace(/^G=/,''));}catch(e){}console.log(o&&o.ok&&o.errs.length===0?'B5S1 PASS':'B5S1 FAIL');process.exit(o&&o.ok&&o.errs.length===0?0:1);}catch(e){console.log('ERR '+e.message);process.exit(1);}finally{try{fs.rmSync(f,{force:true});}catch(e){}try{fs.rmSync(ud,{recursive:true,force:true});}catch(e){}}
