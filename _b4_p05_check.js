'use strict';
/* batch4 P0.5 探针：种植等待提示/掉落穿戴/破境保底/灵兽定性/502 提示/互指与差距 */
const fs=require('node:fs'),path=require('node:path');const ROOT=__dirname;
const PAGE=require('./tools/page.js');const {execEdge}=require('./tools/edge-run.js');PAGE.use(ROOT);
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const t=Date.now(),claimed={};['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id=>claimed[id]=t);
const base={name:'新手',sex:'m',gender:'male',robe:'bai',rank:3,exp:99999,stone:2000,herb:0,ore:0,cave:1,dan:1,forge:1,dao:0,rootIdx:1,gong1:0,gong2:0,gong3:0,field:1,mine:0,weapon:0,weaponLv:0,bagSize:20,tower:0,towerMax:0,petSlots:1,wisdom:0,insight:0,failBonus:0,guardMirror:0,guardArray:0,tianji:0,herb100:0,herb10000:0,log:[],bag:[],recipeN:{},mastery:{alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0},stats:{sit:0,herb:0,train:0,enlight:0,craftPill:0,explore:0,hunt:0,enhance:0,stoneEarned:0,farmN:0},plots:[{crop:'herb',t0:Date.now()-5000,need:300}],pets:[],eggs:[],arena:{day:'',left:3,tier:1,win:0,lose:0,rep:0,foes:[]},union:{start:t,day:'',left:1,merit:0,claimed:[],season:1},sign:{days:0,last:''},secret:{prog:[0,0,0,0],day:'',swept:0},towerDay:'',towerSwept:0,enc:{t:0,bubble:null,lastId:''},encBuff:{mult:0,until:0},miles:{},milesNew:[],letters:[],story:{claimed:claimed},equipment:{weapon:null,armor:null,accessory:null},shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},actDay:'',gate:{lv:0,grad:0,disciples:[]},council:{day:'',n:0,last:''},trail:{i:0},trail2:{i:0},life:{age:0,on:true,brk:0},legacy:{gens:0,relic:null,hist:[],pick:null},mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},guide:{step:14,done:true,skipped:false,started:true,flags:{c_enter:true,c_sit:true,c_brk:true,c_field:true},rewardClaims:{taixu_intro_dan_v1:true},toldSystems:{}},art:{bg:0,brk:0,cai:0},last:t};
const seed='<script>try{localStorage.setItem("xiuxian_save",'+JSON.stringify(JSON.stringify(base))+');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr'+'ipt>';
const FREEZE='<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const SCRIPT=`
  await sleep(500);
  var sm=document.getElementById('story-modal');if(sm&&!sm.classList.contains('hidden'))document.getElementById('sto-close').click();
  var gb=document.getElementById('taixu-bubble');if(gb){var sk=document.getElementById('taixu-skip');if(sk)sk.click();}
  await sleep(400);
  var S=XX._s;
  /* 1 种植等待：田页与纸签同屏倒计时+可做 */
  ROUTER.open('dong','xx-field');await sleep(400);
  var w=(document.getElementById('xx-field-wait')||{}).textContent||'';
  o.wait={txt:w};
  if(!(/灵草/.test(w)&&/后成熟/.test(w)&&/打坐/.test(w)&&/爬塔/.test(w))) o.errs.push('田页等待提示缺项: '+w);
  ROUTER.back();await sleep(300);
  var th=(document.getElementById('st-hint')||{}).textContent||'';
  o.trailWait={txt:th};
  if(!(/后成熟/.test(th)&&/可先去做/.test(th))) o.errs.push('纸签等待提示缺项: '+th);
  /* 2 掉落立即穿戴 */
  S.bag=[{t:'eq_qingfeng',n:'青锋剑'}];
  XX._showEquipDrop({id:'eq_qingfeng',mailed:false});await sleep(300);
  var cs=document.getElementById('craft-settle');
  var rows=(document.getElementById('cs-rows')||{}).textContent||'';
  var btn=[].slice.call(document.querySelectorAll('#cs-rows button')).filter(function(b){return b.textContent==='立即穿戴';})[0];
  o.drop={vis:!cs.classList.contains('hidden'),rows:rows,btn:!!btn};
  if(!(o.drop.vis&&/高 /.test(rows)&&/当前武器槽/.test(rows)&&btn)) o.errs.push('掉落穿戴缺项: '+JSON.stringify(o.drop));
  if(btn){btn.click();await sleep(300);}
  o.equipped={weapon:S.equipment.weapon,closed:cs.classList.contains('hidden')};
  if(!(S.equipment.weapon==='eq_qingfeng'&&o.equipped.closed)) o.errs.push('掉落穿戴未生效: '+JSON.stringify(o.equipped));
  /* 3 破境失败第一行保底 */
  window.TRIB=null;var rnd=Math.random;Math.random=function(){return 0.999;};
  S.rank=3;S.exp=99999;S.insight=0;S.failBonus=0;XX._render();XX._attemptBreak();await sleep(400);
  var desc=document.getElementById('b-desc');
  var boon=desc?desc.querySelector('.brk-boon'):null;
  o.fail={boon:boon?boon.textContent:'',first:desc&&desc.firstElementChild?desc.firstElementChild.className:''};
  if(!(boon&&/下次成功率 \\+5/.test(boon.textContent)&&desc.firstElementChild===boon)) o.errs.push('失败保底缺项: '+JSON.stringify(o.fail));
  Math.random=rnd;document.getElementById('b-close').click();
  /* 4 灵兽园定性 */
  ROUTER.open('chong');await sleep(400);
  var cond=(document.getElementById('xx-pet-cond')||{}).textContent||'';
  var badge=(document.getElementById('sc-pet-badge')||{}).textContent||'';
  o.pet={cur:ROUTER.current(),cond:cond,badge:badge};
  if(!(o.pet.cur==='chong'&&/解锁条件/.test(cond)&&/妖兽蛋/.test(cond)&&badge==='差蛋')) o.errs.push('灵兽入口缺项: '+JSON.stringify(o.pet));
  ROUTER.back();await sleep(250);
  /* 5 502 读取与提示元素 */
  var st='ok';
  try{await SECT._readJson({ok:false,status:502,json:function(){return Promise.resolve({});}});st='no-throw';}catch(e){st=e.message;}
  o.net={read:st,tag:SECT._errTag(new Error('HTTP 502'))};
  if(!(st==='HTTP 502'&&o.net.tag.indexOf('502')>=0)) o.errs.push('502 处理异常: '+JSON.stringify(o.net));
  ROUTER.open('zong','xx-weather');await sleep(400);
  o.net.retry=!!document.querySelector('#sc-weather [data-sect-retry]');
  if(!o.net.retry) o.errs.push('气象页无重试按钮');
  ROUTER.back();await sleep(250);
  /* 6 料仓/背包互指 + 差距解读 */
  ROUTER.open('bag');await sleep(300);
  var bagLink=document.querySelector('#page-bag [data-cross="dong"]');
  o.cross={bag:!!bagLink};
  if(!bagLink) o.errs.push('背包无洞府料仓互指');
  else{bagLink.click();await sleep(300);o.cross.bagCur=ROUTER.current();if(ROUTER.current()!=='dong') o.errs.push('背包互指落点异常: '+ROUTER.current());}
  ROUTER.open('dong','xx-alchemy-sec');await sleep(300);
  var alLink=document.querySelector('#xx-alchemy-sec [data-cross="bag"]');
  o.cross.alch=!!alLink;
  if(!alLink) o.errs.push('炼丹页无背包互指');
  var gap=XX._powerGapAdvice(1000,2000);
  o.gap={txt:gap};
  if(!(/差 1000 战力/.test(gap)&&/建议/.test(gap)&&(/补装备/.test(gap)||/破镜|破境/.test(gap)))) o.errs.push('差距解读缺项: '+gap);
`;
const DIAG=`(async function(){var o={ok:true,errs:[]};var sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{${SCRIPT}}catch(e){o.ok=false;o.errs.push(String(e&&e.stack||e));}
document.getElementById('diag').textContent='G='+JSON.stringify(o);})();`;
const f=path.join(PAGE.SCRATCH,'._b4p05.html');
PAGE.writePage(f,html.replace('</head>',seed+'\n</head>').replace('</body>',FREEZE+'<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div><script>window.addEventListener("load",function(){setTimeout(function(){'+DIAG+'},800);});</script></body>'));
const ud=path.join('D:/xx-scratch','xxb4p05'+Date.now());
try{const out=execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir='+ud,'--virtual-time-budget=20000','--window-size=430,900','--dump-dom','file:///'+f.replace(/\\/g,'/')],{timeout:180000,encoding:'utf8',maxBuffer:1<<26});const m=/<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out||'');const r=m?m[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'):'NO-DIAG';console.log(r);let o=null;try{o=JSON.parse(r.replace(/^G=/,''));}catch(e){}console.log(o&&o.ok&&o.errs.length===0?'P05 PASS':'P05 FAIL');process.exit(o&&o.ok&&o.errs.length===0?0:1);}catch(e){console.log('ERR '+e.message);process.exit(1);}finally{try{fs.rmSync(f,{force:true});}catch(e){}try{fs.rmSync(ud,{recursive:true,force:true});}catch(e){}}