'use strict';
/* P1 指路台词落库校针：沈碑 3 句、崔九 3 句逐字在位；崔九秘境句与掉落表对得上 */
const fs=require('node:fs'),path=require('node:path');const ROOT=__dirname;
const PAGE=require('./tools/page.js');const {execEdge}=require('./tools/edge-run.js');PAGE.use(ROOT);
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const FREEZE='<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const DIAG=`(async function(){var o={ok:true,errs:[]};var sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 await sleep(800);
 var S1='灵田的草熟了不收，炼丹房就空着。等它长的时候，去打坐，别守着。';
 var S2='塔里的骨与羽别扔。器坊缺这个；打不动，先去人物页把法宝穿上。';
 var S3='碑后有条旧路，通上古秘境。秘境里出的料，够你炼一炉丹、打一件器。';
 var C1='塔里掉的料，拿去器坊；器打好了，人物页佩上，再回来爬。';
 var C2='秘境十层有王，王掉的是强化料。强化在洞府·法宝强化，别在塔里瞎琢磨。';
 var C3='打不过就看差多少战力——差得多先补装备，差一点就攒修为破境。别硬顶。';
 function has(id, key, line){
   var t=Npc.NPC_STELE.topics.filter(function(x){return x.id===id;})[0];
   return !!(t && Array.isArray(t[key]) && t[key].indexOf(line)>=0);
 }
 o.stele={s1:has('stele1','repeat',S1),s2:has('stele3','repeat',S2),s3:has('stele4','repeat',S3)};
 var ct=NpcTower.TOPICS.filter(function(x){return x.id==='ct1';})[0];
 o.cuijiu={c1:!!(ct&&ct.lines.indexOf(C1)>=0),c2:!!(ct&&ct.lines.indexOf(C2)>=0),c3:!!(ct&&ct.lines.indexOf(C3)>=0)};
 o.anchor={floors:XX._bal.secretFloors};
 if(!(o.stele.s1&&o.stele.s2&&o.stele.s3)) o.errs.push('沈碑指路句缺失');
 if(!(o.cuijiu.c1&&o.cuijiu.c2&&o.cuijiu.c3)) o.errs.push('崔九指路句缺失');
 if(o.anchor.floors!==10) o.errs.push('秘境层数不是 10');
}catch(e){o.ok=false;o.errs.push(String(e&&e.stack||e));}
document.getElementById('diag').textContent='G='+JSON.stringify(o);})();`;
const f=path.join(PAGE.SCRATCH,'._npcguide.html');
PAGE.writePage(f,html.replace('</head>','<script>try{localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr'+'ipt>\n</head>').replace('</body>',FREEZE+'<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div><script>window.addEventListener("load",function(){setTimeout(function(){'+DIAG+'},500);});</script></body>'));
const ud=path.join('D:/xx-scratch','xxnpcg'+Date.now());
try{const out=execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir='+ud,'--virtual-time-budget=8000','--window-size=430,900','--dump-dom','file:///'+f.replace(/\\/g,'/')],{timeout:120000,encoding:'utf8',maxBuffer:1<<26});const m=/<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out||'');const r=m?m[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'):'NO-DIAG';console.log(r);let o=null;try{o=JSON.parse(r.replace(/^G=/,''));}catch(e){}console.log(o&&o.ok&&o.errs.length===0?'NPCGUIDE PASS':'NPCGUIDE FAIL');process.exit(o&&o.ok&&o.errs.length===0?0:1);}catch(e){console.log('ERR '+e.message);process.exit(1);}finally{try{fs.rmSync(f,{force:true});}catch(e){}try{fs.rmSync(ud,{recursive:true,force:true});}catch(e){}}
