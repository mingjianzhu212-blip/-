'use strict';
/* P0 验收：挂机 5 分钟（虚拟时间）至少 3 条带数字的被动收益飘字 */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const base = {name:'青玄子',sex:'m',gender:'male',robe:'bai',rank:3,exp:120,stone:9000,herb:25,ore:25,cave:1,dan:1,forge:2,dao:0,rootIdx:1,gong1:2,gong2:0,gong3:0,field:0,mine:0,weapon:2,weaponLv:1,bagSize:20,tower:1,towerMax:1,petSlots:1,wisdom:0,insight:0,failBonus:0,guardMirror:0,guardArray:0,tianji:0,herb100:0,herb10000:0,log:[],bag:[],recipeN:{},mastery:{alchemyLv:1,alchemyExp:0,forgeLv:2,forgeExp:0},stats:{sit:9,herb:3,train:2,enlight:1,craftPill:1,explore:0,hunt:0,enhance:0,stoneEarned:100,farmN:0},plots:[],pets:[],eggs:[],arena:{day:'',left:3,tier:1,win:0,lose:0,rep:500,foes:[]},union:{start:t,day:'',left:1,merit:0,claimed:[],season:1},sign:{days:0,last:''},secret:{prog:[0,0,0,0],day:'',swept:0},towerDay:'',towerSwept:0,enc:{t:0,bubble:null,lastId:''},encBuff:{mult:0,until:0},miles:{},milesNew:[],letters:[],story:{claimed:claimed},equipment:{weapon:null,armor:null,accessory:null},shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},actDay:'',gate:{lv:0,grad:0,disciples:[]},council:{day:'',n:0,last:''},trail:{i:8},trail2:{i:1},life:{age:40,on:true,brk:0},legacy:{gens:0,relic:null,hist:[],pick:null},mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},guide:{step:14,done:true,skipped:false,started:true,flags:{c_enter:true,c_sit:true,c_brk:true,c_field:true},rewardClaims:{taixu_intro_dan_v1:true},toldSystems:{}},art:{bg:1,brk:0,cai:0},last:t};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const DIAG = `(async function(){
  var o={ok:true,errs:[],chips:[]}; var sleep=ms=>new Promise(r=>setTimeout(r,ms));
  try{
    var sm=document.getElementById('story-modal'); if(sm&&!sm.classList.contains('hidden')) document.getElementById('sto-close').click();
    var gb=document.getElementById('taixu-bubble'); if(gb){var sk=document.getElementById('taixu-skip'); if(sk) sk.click();}
    await sleep(500);
    var e0=XX._s.exp,s0=XX._s.stone,o0=XX._s.ore;
    var host=document.getElementById('loot-toast');
    new MutationObserver(function(muts){
      muts.forEach(function(m){ [].slice.call(m.addedNodes).forEach(function(n){
        var tx=n.textContent||''; if(tx.indexOf('修为 +')>=0||tx.indexOf('灵石 +')>=0||tx.indexOf('矿石 +')>=0) o.chips.push(tx);
      }); });
    }).observe(host,{childList:true});
    await sleep(300000);
    o.delta={exp:XX._s.exp-e0, stone:XX._s.stone-s0, ore:XX._s.ore-o0};
    o.n=o.chips.length; o.sample=o.chips.slice(0,6);
    if(o.n<3) o.errs.push('5 分钟飘字不足 3 条: '+o.n);
    if(!o.chips.every(function(x){return /[0-9]/.test(x);})) o.errs.push('有飘字不带数字');
    if(!(o.delta.exp>0)) o.errs.push('底层修为无增长');
  }catch(e){ o.ok=false; o.errs.push(String(e&&e.stack||e)); }
  document.getElementById('diag').textContent='G='+JSON.stringify(o);
})();`;
const f = path.join(PAGE.SCRATCH, '._b4float5m.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE +
  '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
  '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},800);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxb4f5' + Date.now());
try {
  const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
    '--virtual-time-budget=320000','--window-size=430,900','--dump-dom','file:///' + f.replace(/\\/g, '/')],
    { timeout: 420000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const r = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(r);
  let o=null; try{ o=JSON.parse(r.replace(/^G=/,'')); }catch(e){}
  console.log(o && o.ok && o.errs.length===0 ? 'FLOAT5M PASS' : 'FLOAT5M FAIL');
  process.exit(o && o.ok && o.errs.length===0 ? 0 : 1);
} catch (e) { console.log('ERR ' + e.message); process.exit(1); }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }