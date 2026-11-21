'use strict';
/* 诊断：为何 #char-path-picks 未创建 / char-modal 未显示 —— 抓页内异常与 DOM 状态 */
const { execEdge } = require('./tools/edge-run');
const fs = require('node:fs'), path = require('node:path');
const PAGE = require('./tools/page');
PAGE.use(__dirname);
const HTML = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');

const s = { name:'老档', sex:'m', gender:'male', robe:'bai', rank:1, exp:260, stone:8600,
  cave:2, dan:1, forge:0, dao:0, rootIdx:2, gong1:1, gong2:0, gong3:0, field:3, mine:1,
  herb:66, ore:14, weapon:1, weaponLv:0, bagSize:20, tower:1, towerMax:1, petSlots:1,
  wisdom:120, log:[], bag:[], recipeN:{}, mastery:{alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0},
  stats:{sit:1}, pets:[], eggs:[], plots:[], arena:{day:'',left:2,tier:1,win:0,lose:0,rep:0,foes:[]},
  enc:{t:0,bubble:null,lastId:''}, encBuff:{mult:0,until:0}, miles:{}, milesNew:[], letters:[],
  story:{claimed:{}}, equipment:{weapon:null,armor:null,accessory:null},
  acts:{sit:1,herb:0,train:0,enlight:0,ponder:0}, actDay:'', last:Date.now(), path:'sword' };

const seed = '<script>try{localStorage.setItem("xiuxian_save",'+JSON.stringify(JSON.stringify(s))+
  ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr'+'ipt>';
const probe = `<script>
window.__errs=[];
window.addEventListener('error',function(ev){__errs.push(String(ev.message||ev.error));});
window.addEventListener('unhandledrejection',function(ev){__errs.push('REJ '+String(ev.reason));});
window.__ptDone=function(o){var p=document.getElementById('__pt');if(!p){p=document.createElement('pre');p.id='__pt';p.style.display='none';document.body.appendChild(p);}p.textContent=JSON.stringify(o).replace(/</g,'\\u003c');};
setTimeout(function(){
  var modal=document.getElementById('char-modal');
  var before={modalExists:!!modal, cls:modal?modal.className:'', hasPicks:!!document.getElementById('char-path-picks'),
              editBtn:!!document.getElementById('m-char'), confirm:!!document.getElementById('char-confirm'),
              XX:typeof XX, path:(typeof XX!=='undefined'&&XX._s)?XX._s.path:'NA'};
  var ed=document.getElementById('m-char'); if(ed) ed.click();
  setTimeout(function(){
    var m2=document.getElementById('char-modal');
    __ptDone({before:before,
      after:{cls:m2?m2.className:'', hasPicks:!!document.getElementById('char-path-picks'),
             hasLabel:!!document.getElementById('char-path-label'),
             modalHTMLHead:m2?m2.innerHTML.slice(0,420):''},
      errs:__errs});
  },400);
},900);
<\/script>`;

const file = path.join(PAGE.SCRATCH,'._p1c_diag_'+process.pid+'.html');
PAGE.writePage(file, HTML.replace('</head>',seed+'\n</head>').replace('</body>',probe+'\n</body>'));
const ud = path.join(PAGE.SCRATCH,'p1cdiag'+process.pid);
let dom='';
try{
  dom = execEdge(['--headless=new','--disable-gpu','--no-first-run','--user-data-dir='+ud,
    '--virtual-time-budget=9000','--window-size=900,1200','--dump-dom','file:///'+file.replace(/\\/g,'/')],
    {encoding:'utf8',timeout:120000,maxBuffer:1<<26,stdio:['ignore','pipe','ignore']});
}catch(e){ dom=String((e&&e.stdout)||''); }
try{ fs.rmSync(file,{force:true}); fs.rmSync(ud,{recursive:true,force:true}); }catch(e){}
const m = dom.match(/<pre id="__pt"[^>]*>([\s\S]*?)<\/pre>/);
console.log(m ? m[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>') : 'NO_PROBE_RESULT');
