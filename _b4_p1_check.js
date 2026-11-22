'use strict';
/* batch4 P1 探针：长时派遣结算/复用三档、溢出可视化+常驻入口、世界通告与聊天分离 */
const fs=require('node:fs'),path=require('node:path');const ROOT=__dirname;
const PAGE=require('./tools/page.js');const {execEdge}=require('./tools/edge-run.js');PAGE.use(ROOT);
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const t=Date.now(),claimed={};['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id=>claimed[id]=t);
const base={name:'青玄子',sex:'m',gender:'male',robe:'bai',rank:3,exp:120,stone:9000,herb:0,ore:0,cave:1,dan:1,forge:1,dao:0,rootIdx:1,gong1:0,gong2:0,gong3:0,field:0,mine:0,weapon:0,weaponLv:0,bagSize:20,tower:9,towerMax:9,petSlots:1,wisdom:0,insight:0,failBonus:0,guardMirror:0,guardArray:0,tianji:0,herb100:0,herb10000:0,log:[],bag:[],recipeN:{},mastery:{alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0},stats:{sit:0,herb:0,train:0,enlight:0,craftPill:0,explore:0,hunt:0,enhance:0,stoneEarned:0,farmN:0},plots:[],pets:[],eggs:[],arena:{day:'',left:3,tier:1,win:0,lose:0,rep:0,foes:[]},union:{start:t,day:'',left:1,merit:0,claimed:[],season:1},sign:{days:0,last:''},secret:{prog:[0,0,0,0],day:'',swept:0},towerDay:'',towerSwept:0,enc:{t:0,bubble:null,lastId:''},encBuff:{mult:0,until:0},miles:{},milesNew:[],letters:[],story:{claimed:claimed},equipment:{weapon:null,armor:null,accessory:null},shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},actDay:'',gate:{lv:1,grad:0,disciples:[{id:'d1',name:'测试弟子',apt:3,task:'herb',t0:Date.now()-2*3600*1000-1000,svc:0,last:'',run:0}]},council:{day:'',n:0,last:''},trail:{i:8},trail2:{i:1},life:{age:40,on:true,brk:0},legacy:{gens:0,relic:null,hist:[],pick:null},mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},guide:{step:14,done:true,skipped:false,started:true,flags:{c_enter:true,c_sit:true,c_brk:true,c_field:true},rewardClaims:{taixu_intro_dan_v1:true},toldSystems:{}},art:{bg:0,brk:0,cai:0},last:t};
const seed='<script>try{localStorage.setItem("xiuxian_save",'+JSON.stringify(JSON.stringify(base))+');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr'+'ipt>';
const FREEZE='<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const SCRIPT=`
  await sleep(500);
  var sm=document.getElementById('story-modal');if(sm&&!sm.classList.contains('hidden'))document.getElementById('sto-close').click();
  var gb=document.getElementById('taixu-bubble');if(gb){var sk=document.getElementById('taixu-skip');if(sk)sk.click();}
  await sleep(400);
  var S=XX._s;
  /* 长时派遣：三档沿用现有 2/4/6h；到点结算 + 名册补位 */
  o.gateTasks=Object.keys(XX._gateTasks).map(function(k){return XX._gateTasks[k].name+':'+XX._gateTasks[k].dur;});
  S.gate={lv:1,grad:0,disciples:[{id:'d2',name:'测试弟子二',apt:3,task:'herb',t0:Date.now()-2*3600*1000-1000,svc:0,last:'',run:0}]};
  var h0=S.herb; XX._gateSettle(); await sleep(300);
  o.gate={herb:S.herb-h0, task:S.gate.disciples[0].task, idle:XX._gateIdleN(),
    settle:!document.getElementById('craft-settle').classList.contains('hidden'),
    title:(document.getElementById('cs-title')||{}).textContent||''};
  if(!(o.gate.herb>0&&o.gate.task===''&&o.gate.idle===1&&o.gate.settle&&o.gate.title.indexOf('派遣结算')>=0)) o.errs.push('派遣结算缺项: '+JSON.stringify(o.gate));
  document.getElementById('cs-close').click();
  /* 溢出百分比 + 常驻入口 + 下次加成 */
  S.rank=0;S.exp=Math.ceil(XX._need(0)*4.4);S.failBonus=0.05;XX._render();ROUTER.open('xiu','xx-cult');await sleep(300);
  var need=XX._need(0), pct=Math.round(S.exp/need*100);
  o.overflow={txt:(document.getElementById('xx-exptxt')||{}).textContent||'',chip:(document.getElementById('sc-exp-num')||{}).textContent||'',pct:pct,
    ready:!document.getElementById('sc-break-badge').classList.contains('hidden'),
    sub:(document.getElementById('sc-break-badge')||{}).textContent||''};
  if(!(o.overflow.txt.indexOf(pct+'%')>=0&&o.overflow.txt.indexOf('溢出')>=0&&o.overflow.chip===pct+'%'&&o.overflow.ready&&/下次 \\+5/.test(o.overflow.sub))) o.errs.push('溢出/入口缺项: '+JSON.stringify(o.overflow));
  document.getElementById('sc-break').click();await sleep(300);
  o.overflow.confirm=!document.getElementById('break-confirm-modal').classList.contains('hidden');
  if(!o.overflow.confirm) o.errs.push('常驻入口未打开破境确认');
  XX._closeBreakConfirm(); ROUTER.back(); await sleep(250);
  /* 世界通告：独立条，不进聊天；限流/队列 */
  XX._announce('破境','测试甲');await sleep(500);
  o.ann={vis:!document.getElementById('world-ann').classList.contains('hidden'),
    txt:(document.getElementById('world-ann-text')||{}).textContent||'',
    chatHas:(document.getElementById('ch-msgs')?document.getElementById('ch-msgs').textContent:'').indexOf('测试甲')>=0};
  if(!(o.ann.vis&&/测试甲/.test(o.ann.txt)&&!o.ann.chatHas)) o.errs.push('通告条缺项: '+JSON.stringify(o.ann));
  for(var i=0;i<7;i++) XX._announce('测试','排队'+i);
  var st=XX._annState();
  o.annQueue={q:st.q,busy:st.busy};
  if(!(st.q<=5&&st.busy)) o.errs.push('通告队列未限流: '+JSON.stringify(o.annQueue));
`;
const DIAG=`(async function(){var o={ok:true,errs:[]};var sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{${SCRIPT}}catch(e){o.ok=false;o.errs.push(String(e&&e.stack||e));}
document.getElementById('diag').textContent='G='+JSON.stringify(o);})();`;
const f=path.join(PAGE.SCRATCH,'._b4p1.html');
PAGE.writePage(f,html.replace('</head>',seed+'\n</head>').replace('</body>',FREEZE+'<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div><script>window.addEventListener("load",function(){setTimeout(function(){'+DIAG+'},800);});</script></body>'));
const ud=path.join('D:/xx-scratch','xxb4p1'+Date.now());
try{const out=execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir='+ud,'--virtual-time-budget=16000','--window-size=430,900','--dump-dom','file:///'+f.replace(/\\/g,'/')],{timeout:180000,encoding:'utf8',maxBuffer:1<<26});const m=/<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out||'');const r=m?m[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'):'NO-DIAG';console.log(r);let o=null;try{o=JSON.parse(r.replace(/^G=/,''));}catch(e){}console.log(o&&o.ok&&o.errs.length===0?'P1 PASS':'P1 FAIL');process.exit(o&&o.ok&&o.errs.length===0?0:1);}catch(e){console.log('ERR '+e.message);process.exit(1);}finally{try{fs.rmSync(f,{force:true});}catch(e){}try{fs.rmSync(ud,{recursive:true,force:true});}catch(e){}}