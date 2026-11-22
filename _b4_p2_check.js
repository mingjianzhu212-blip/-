'use strict';
/* batch4 P2 探针：功法详情写全（现有数据）+ 视觉收口 CSS 生效 */
const fs=require('node:fs'),path=require('node:path');const ROOT=__dirname;
const PAGE=require('./tools/page.js');const {execEdge}=require('./tools/edge-run.js');PAGE.use(ROOT);
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const t=Date.now(),claimed={};['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id=>claimed[id]=t);
const base={name:'青玄子',sex:'m',gender:'male',robe:'bai',rank:3,exp:120,stone:9000,herb:25,ore:25,cave:1,dan:1,forge:1,dao:0,rootIdx:1,gong1:2,gong2:0,gong3:0,field:0,mine:0,weapon:0,weaponLv:0,bagSize:20,tower:0,towerMax:0,petSlots:1,wisdom:0,insight:0,failBonus:0,guardMirror:0,guardArray:0,tianji:0,herb100:0,herb10000:0,log:[],bag:[],recipeN:{},mastery:{alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0},stats:{sit:0,herb:0,train:0,enlight:0,craftPill:0,explore:0,hunt:0,enhance:0,stoneEarned:0,farmN:0},plots:[],pets:[],eggs:[],arena:{day:'',left:3,tier:1,win:0,lose:0,rep:0,foes:[]},union:{start:t,day:'',left:1,merit:0,claimed:[],season:1},sign:{days:0,last:''},secret:{prog:[0,0,0,0],day:'',swept:0},towerDay:'',towerSwept:0,enc:{t:0,bubble:null,lastId:''},encBuff:{mult:0,until:0},miles:{},milesNew:[],letters:[],story:{claimed:claimed},equipment:{weapon:null,armor:null,accessory:null},shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},actDay:'',gate:{lv:0,grad:0,disciples:[]},council:{day:'',n:0,last:''},trail:{i:8},trail2:{i:1},life:{age:40,on:true,brk:0},legacy:{gens:0,relic:null,hist:[],pick:null},mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},guide:{step:14,done:true,skipped:false,started:true,flags:{c_enter:true,c_sit:true,c_brk:true,c_field:true},rewardClaims:{taixu_intro_dan_v1:true},toldSystems:{}},art:{bg:0,brk:0,cai:0},last:t};
const seed='<script>try{localStorage.setItem("xiuxian_save",'+JSON.stringify(JSON.stringify(base))+');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr'+'ipt>';
const FREEZE='<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const SCRIPT=`
  await sleep(500);
  var sm=document.getElementById('story-modal');if(sm&&!sm.classList.contains('hidden'))document.getElementById('sto-close').click();
  var gb=document.getElementById('taixu-bubble');if(gb){var sk=document.getElementById('taixu-skip');if(sk)sk.click();}
  await sleep(300);
  ROUTER.open('xiu','xx-gong-sec');await sleep(400);
  var rows=document.querySelectorAll('#xx-gong-list .upg');
  o.gong={n:rows.length,details:[],bad:''};
  for(var i=0;i<rows.length;i++){
    var d=rows[i].querySelector('.gong-detail');
    var tx=d?d.textContent:'';
    o.gong.details.push(tx.slice(0,120));
    if(!d||!/当前效果/.test(tx)||!/下一级/.test(tx)||!/领悟条件/.test(tx)||!/冷却无/.test(tx)||!/伤害倍率无/.test(tx)||!/残篇/.test(tx)) o.gong.bad+='row'+i+';';
    if(/NaN|undefined/.test(tx)) o.gong.bad+='nan'+i+';';
  }
  if(!(o.gong.n===3&&!o.gong.bad)) o.errs.push('功法详情缺项: '+JSON.stringify(o.gong));
  /* CSS 收口：面板/标题/入口徽/按钮 */
  var card=document.querySelector('#page-xiu .card');
  var h2=document.querySelector('#page-xiu h2');
  var btn=document.querySelector('#xx-gong-list .upg button');
  o.css={cardBg:card?getComputedStyle(card).backgroundImage.slice(0,40):'',cardR:card?getComputedStyle(card).borderRadius:'',
    h2Color:h2?getComputedStyle(h2).color:'',btnR:btn?getComputedStyle(btn).borderRadius:''};
  if(!(o.css.cardR==='14px'&&o.css.h2Color==='rgb(122, 90, 32)'&&o.css.btnR)) o.errs.push('CSS 收口未生效: '+JSON.stringify(o.css));
  ROUTER.back();await sleep(250);ROUTER.open('xiu');await sleep(350);
  var seal=document.querySelector('#page-xiu .hc-seal');
  o.seal={bg:seal?getComputedStyle(seal).backgroundColor:'',color:seal?getComputedStyle(seal).color:''};
  if(!(o.seal.bg==='rgb(28, 23, 38)'||o.seal.bg.indexOf('28')>=0)) o.errs.push('入口徽标未收口: '+JSON.stringify(o.seal));
`;
const DIAG=`(async function(){var o={ok:true,errs:[]};var sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{${SCRIPT}}catch(e){o.ok=false;o.errs.push(String(e&&e.stack||e));}
document.getElementById('diag').textContent='G='+JSON.stringify(o);})();`;
const f=path.join(PAGE.SCRATCH,'._b4p2.html');
PAGE.writePage(f,html.replace('</head>',seed+'\n</head>').replace('</body>',FREEZE+'<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div><script>window.addEventListener("load",function(){setTimeout(function(){'+DIAG+'},800);});</script></body>'));
const ud=path.join('D:/xx-scratch','xxb4p2'+Date.now());
try{const out=execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir='+ud,'--virtual-time-budget=20000','--window-size=430,900','--dump-dom','file:///'+f.replace(/\\/g,'/')],{timeout:120000,encoding:'utf8',maxBuffer:1<<26});const m=/<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out||'');const r=m?m[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'):'NO-DIAG';console.log(r);let o=null;try{o=JSON.parse(r.replace(/^G=/,''));}catch(e){}console.log(o&&o.ok&&o.errs.length===0?'P2 PASS':'P2 FAIL');process.exit(o&&o.ok&&o.errs.length===0?0:1);}catch(e){console.log('ERR '+e.message);process.exit(1);}finally{try{fs.rmSync(f,{force:true});}catch(e){}try{fs.rmSync(ud,{recursive:true,force:true});}catch(e){}}
