'use strict';
/* P2 9/10 探针：协力 Boss（B 案）+ 灵潮（周六 20:00，20s/杀，30 封顶） */
const fs=require('node:fs'),path=require('node:path');const ROOT=__dirname;
const PAGE=require('./tools/page.js');const {execEdge}=require('./tools/edge-run.js');PAGE.use(ROOT);
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const t=Date.now(),claimed={};['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id=>claimed[id]=t);
const base={name:'青玄子',sex:'m',gender:'male',robe:'bai',rank:3,exp:120,stone:9000,herb:25,ore:25,cave:1,dan:1,forge:1,dao:0,rootIdx:1,gong1:2,gong2:0,gong3:0,field:0,mine:0,weapon:0,weaponLv:0,bagSize:20,tower:0,towerMax:0,petSlots:1,wisdom:0,insight:0,failBonus:0,guardMirror:0,guardArray:0,tianji:0,herb100:0,herb10000:0,log:[],bag:[],recipeN:{},mastery:{alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0},stats:{sit:0,herb:0,train:0,enlight:0,craftPill:0,explore:0,hunt:0,enhance:0,stoneEarned:0,farmN:0},plots:[],pets:[],eggs:[],arena:{day:'',left:3,tier:1,win:0,lose:0,rep:0,foes:[]},union:{start:t,day:'',left:1,merit:0,claimed:[],season:1},sign:{days:0,last:''},secret:{prog:[0,0,0,0],day:'',swept:0},towerDay:'',towerSwept:0,enc:{t:0,bubble:null,lastId:''},encBuff:{mult:0,until:0},miles:{},milesNew:[],letters:[],story:{claimed:claimed},equipment:{weapon:null,armor:null,accessory:null},shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},actDay:'',gate:{lv:1,grad:0,disciples:[{id:'d1',name:'叶青梧',apt:3,task:'',t0:0,svc:2,last:'herb',run:2}]},coopBoss:{week:'',hpMax:0,dmg:0,claimed:[],parts:0},lingchao:{week:'',started:0,startedAt:0,kills:0,claimed:[],pv:0},council:{day:'',n:0,last:''},trail:{i:8},trail2:{i:1},life:{age:40,on:true,brk:0},legacy:{gens:0,relic:null,hist:[],pick:null},mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},guide:{step:14,done:true,skipped:false,started:true,flags:{c_enter:true,c_sit:true,c_brk:true,c_field:true},rewardClaims:{taixu_intro_dan_v1:true},toldSystems:{}},art:{bg:0,brk:0,cai:0},last:t};
const seed='<script>try{localStorage.setItem("xiuxian_save",'+JSON.stringify(JSON.stringify(base))+');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr'+'ipt>';
const FREEZE='<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const SCRIPT=`
  await sleep(500);
  var sm=document.getElementById('story-modal');if(sm&&!sm.classList.contains('hidden'))document.getElementById('sto-close').click();
  var gb=document.getElementById('taixu-bubble');if(gb){var sk=document.getElementById('taixu-skip');if(sk)sk.click();}
  await sleep(300);
  var S=XX._s;
  /* 协力 Boss：HP = 成员战力总和（掌门 + 1 弟子同战力）×20 */
  var b=XX._coopBoss();
  var cp=XX._power();
  o.coop={hp:b.hpMax, want:Math.max(1,Math.floor(cp))*2*20, week:XX._coopWeek()};
  if(!(b.hpMax===o.coop.want&&/^\\d{4}-\\d{2}-\\d{2}$/.test(o.coop.week))) o.errs.push('协力 HP/周键异常: '+JSON.stringify(o.coop));
  for(var i=0;i<10;i++) XX._coopHit();
  var b1=XX._coopBoss();
  var stone0=S.stone, bag0=S.bag.length;
  var ok=XX._coopClaim(0);
  o.claim={dmg:b1.dmg, ok:ok, claimed:XX._coopBoss().claimed.slice(), stone:S.stone-stone0, bag:S.bag.length-bag0};
  if(!(b1.dmg>0&&ok&&o.claim.claimed.indexOf(0)>=0&&o.claim.stone>0)) o.errs.push('协力领取异常: '+JSON.stringify(o.claim));
  /* 灵潮：找下一个周六 20:00，模拟进场与封顶 */
  var d=new Date(), add=(6-d.getDay()+7)%7; d.setDate(d.getDate()+add);
  var sat=new Date(d.getFullYear(),d.getMonth(),d.getDate(),20,0,0,0);
  var cell=new Date(sat.getTime()+5*60*1000);
  o.lcWin={active:XX._lingchaoWindow(cell).active, preview:XX._lingchaoWindow(new Date(sat.getTime()-5*60*1000)).preview};
  if(!(o.lcWin.active&&o.lcWin.preview)) o.errs.push('灵潮窗口异常: '+JSON.stringify(o.lcWin));
  var st0=S.stone, ba0=S.bag.length;
  var started=XX._lingchaoStart(cell);
  XX._lingchaoTick(new Date(cell.getTime()+100*1000));
  var st1=XX._lingchaoState().kills;
  XX._lingchaoTick(new Date(cell.getTime()+900*1000));
  var st2=XX._lingchaoState();
  XX._lingchaoTick(new Date(cell.getTime()+1200*1000));
  var st3=XX._lingchaoState();
  o.lc={started:started,k5:st1,k30:st2.kills,claimed:st2.claimed.slice(),capped:st3.kills,
    stone:S.stone-st0, bag:S.bag.length-ba0};
  if(!(started&&st1===5&&st2.kills===30&&st2.claimed.length===6&&st3.kills===30&&o.lc.stone>0)) o.errs.push('灵潮异常: '+JSON.stringify(o.lc));
`;
const DIAG=`(async function(){var o={ok:true,errs:[]};var sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{${SCRIPT}}catch(e){o.ok=false;o.errs.push(String(e&&e.stack||e));}
document.getElementById('diag').textContent='G='+JSON.stringify(o);})();`;
const f=path.join(PAGE.SCRATCH,'._b4p2b.html');
PAGE.writePage(f,html.replace('</head>',seed+'\n</head>').replace('</body>',FREEZE+'<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div><script>window.addEventListener("load",function(){setTimeout(function(){'+DIAG+'},800);});</script></body>'));
const ud=path.join('D:/xx-scratch','xxb4p2b'+Date.now());
try{const out=execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir='+ud,'--virtual-time-budget=16000','--window-size=430,900','--dump-dom','file:///'+f.replace(/\\/g,'/')],{timeout:180000,encoding:'utf8',maxBuffer:1<<26});const m=/<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out||'');const r=m?m[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'):'NO-DIAG';console.log(r);let o=null;try{o=JSON.parse(r.replace(/^G=/,''));}catch(e){}console.log(o&&o.ok&&o.errs.length===0?'P2B PASS':'P2B FAIL');process.exit(o&&o.ok&&o.errs.length===0?0:1);}catch(e){console.log('ERR '+e.message);process.exit(1);}finally{try{fs.rmSync(f,{force:true});}catch(e){}try{fs.rmSync(ud,{recursive:true,force:true});}catch(e){}}