'use strict';
/* 第三批第一段探针（B4 顶栏两行 / B5 设施镜像与动作回页）
   T 顶栏：430/393/360 三档量两行高度、六项资源在位、标签可见、数字不被裁切
   T0 基线：旧包（batch2）同档量顶栏高度，回报增幅
   F 设施页：六行全「进页」，逐行点击落点正确
   G 功法：真实点按钮升一级（等级+扣费），灵石不足可见差额
   A 聚灵阵：真实点按钮升一级（等级+扣费），灵石不足可见差额
   用法：ELECTRON_RUN_AS_NODE=1 "D:/Qoder CN/Qoder CN.exe" _b3_b45_check.js */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const base = {name:'复验散人',sex:'m',gender:'male',robe:'bai',rank:3,exp:120,stone:900000,herb:25,ore:25,cave:0,dan:1,forge:1,dao:0,rootIdx:1,gong1:0,gong2:0,gong3:0,field:0,mine:0,weapon:0,weaponLv:0,bagSize:20,tower:1,towerMax:1,petSlots:1,wisdom:0,insight:0,failBonus:0,guardMirror:0,guardArray:0,tianji:0,herb100:0,herb10000:0,log:[],bag:[],recipeN:{},mastery:{alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0},stats:{sit:9,herb:3,train:2,enlight:1,craftPill:1,explore:0,hunt:0,enhance:0,stoneEarned:100,farmN:0},plots:[],pets:[],eggs:[],arena:{day:'',left:0,tier:1,win:0,lose:0,rep:0,foes:[]},union:{start:t,day:'',left:0,merit:0,claimed:[],season:1},sign:{days:0,last:''},secret:{prog:[0,0,0,0],day:'',swept:0},towerDay:'',towerSwept:0,enc:{t:0,bubble:null,lastId:''},encBuff:{mult:0,until:0},miles:{},milesNew:[],letters:[],story:{claimed:claimed},equipment:{weapon:null,armor:null,accessory:null},shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},questsDone:[],bossKilled:{},acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},actDay:'',gate:{lv:0,grad:0,disciples:[]},council:{day:'',n:0,last:''},trail:{i:8},trail2:{i:0},life:{age:40,on:true,brk:0},legacy:{gens:0,relic:null,hist:[],pick:null},mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},guide:{step:14,done:true,skipped:false,started:true,flags:{c_enter:true,c_sit:true,c_brk:true,c_field:true},rewardClaims:{taixu_intro_dan_v1:true},toldSystems:{}},last:t};
function seedOf(save) { return '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>'; }
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';

function runPage(file, seedHtml, script, wait, size, budget) {
  const DIAG = `(async function(){
    var o={ok:true,errs:[]}; var sleep=ms=>new Promise(r=>setTimeout(r,ms));
    try{ ${script} }catch(e){ o.ok=false; o.errs.push(String(e&&e.stack||e)); }
    setTimeout(function(){ document.getElementById('diag').textContent='G='+JSON.stringify(o); }, ${wait});
  })();`;
  const f = path.join(PAGE.SCRATCH, '._b3b45_' + Date.now() + Math.random().toString(36).slice(2,5) + '.html');
  const src = fs.readFileSync(file, 'utf8');
  PAGE.writePage(f, src.replace('</head>', seedHtml + '\n</head>').replace('</body>', FREEZE +
    '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
    '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},700);});</script></body>'));
  const ud = path.join('D:/xx-scratch', 'xxb3' + Date.now() + Math.random().toString(36).slice(2,5));
  try {
    const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
      '--virtual-time-budget=' + (budget || 14000),'--window-size=' + size,'--dump-dom','file:///' + f.replace(/\\/g, '/')],
      { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
    const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
    return m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  } catch (e) { return 'G={"ok":false,"errs":["' + e.message.replace(/"/g, "'") + '"]}'; }
  finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
}

const TOP_SCRIPT = `
  await sleep(400);
  var sm=document.getElementById('story-modal');
  if(sm && !sm.classList.contains('hidden')){ var c=document.getElementById('sto-close'); if(c) c.click(); }
  var gb=document.getElementById('taixu-bubble'); if(gb){ var sk=document.getElementById('taixu-skip'); if(sk) sk.click(); }
  await sleep(500);
  var tb=document.querySelector('.topbar');
  o.w=innerWidth; o.h=innerHeight;
  o.barH=tb?Math.round(tb.getBoundingClientRect().height):-1;
  o.details=document.querySelectorAll('.topbar details').length;
  var ids=['sc-stone','sc-exp-num','sc-life','sc-herb','sc-ore','sc-power'];
  o.chips=[];
  ids.forEach(function(id){
    var e=document.getElementById(id); if(!e){ o.chips.push({id:id,missing:true}); return; }
    var chip=e.closest('.tb-chip'); var lab=chip?chip.querySelector('i'):null;
    var rb=e.getBoundingClientRect(), cb=chip?chip.getBoundingClientRect():rb;
    o.chips.push({id:id, txt:(e.textContent||'').trim(), vis:rb.width>0&&rb.height>0,
      label:lab?(lab.textContent||'').trim():'', labelVis:!!(lab&&getComputedStyle(lab).display!=='none'&&lab.getBoundingClientRect().width>0),
      clip: e.scrollWidth > Math.ceil(cb.width)+1, out: rb.left<0||rb.right>innerWidth+0.5});
  });
  var bad=o.chips.filter(function(c){ return c.missing||!c.vis||!c.labelVis||c.clip||c.out; });
  if(bad.length) o.errs.push('资源项异常: '+JSON.stringify(bad));
  if(o.details) o.errs.push('顶栏仍有折叠层');
  if(o.barH<=0) o.errs.push('顶栏高度量不到');
`;

const RUN_SCRIPT = `
  await sleep(400);
  var sm=document.getElementById('story-modal');
  if(sm && !sm.classList.contains('hidden')){ var c=document.getElementById('sto-close'); if(c) c.click(); }
  var gb=document.getElementById('taixu-bubble'); if(gb){ var sk=document.getElementById('taixu-skip'); if(sk) sk.click(); }
  await sleep(300);
  var S=XX._s;
  /* F 设施页镜像 + 落点 */
  ROUTER.open('dong','xx-ups-sec'); await sleep(500);
  var btns=[].slice.call(document.querySelectorAll('#xx-ups .upg button'));
  o.mirror={n:btns.length, texts:btns.map(function(b){return b.textContent;})};
  if(btns.length!==6 || btns.some(function(b){return b.textContent!=='进页';})) o.errs.push('设施页非全镜像: '+JSON.stringify(o.mirror));
  var hops=[];
  function here(){ var p=document.querySelector('.panel-page'); return p?p.getAttribute('data-panel')+':'+p.getAttribute('data-sec'):'none'; }
  for(var i=0;i<btns.length;i++){
    ROUTER.open('dong','xx-ups-sec'); await sleep(260);
    var b=document.querySelectorAll('#xx-ups .upg button')[i]; if(b) b.click(); await sleep(260);
    hops.push(i+'='+here());
  }
  o.hops=hops;
  var want=['0=xiu:xx-gong-sec','1=xiu:xx-gong-sec','2=xiu:xx-gong-sec','3=dong:xx-array-sec','4=dong:xx-alchemy-sec','5=dong:xx-forge-sec'];
  o.hopWant=want.join('|'); o.hopOk=hops.join('|')===o.hopWant;
  if(!o.hopOk) o.errs.push('镜像落点异常: '+hops.join('|'));
  /* G 功法真实入口升级 */
  ROUTER.open('xiu','xx-gong-sec'); await sleep(400);
  S.stone=900000; XX._render();
  var g0=S.gong1|0, st0=S.stone, gb0=document.querySelectorAll('#xx-gong-list .upg button')[0];
  o.gongBtnBefore=gb0?gb0.textContent:'';
  if(gb0) gb0.click();
  await sleep(400);
  o.gong={lv0:g0, lv1:S.gong1|0, stone0:st0, stone1:S.stone, msg:((document.getElementById('xx-gong-msg')||{}).textContent||'')};
  if(!(S.gong1===g0+1 && S.stone<st0 && o.gong.msg.indexOf('已参到')>=0)) o.errs.push('功法升级未生效: '+JSON.stringify(o.gong));
  S.stone=0; XX._render(); await sleep(200);
  var gb1=document.querySelectorAll('#xx-gong-list .upg button')[0];
  o.gongPoor={disabled:gb1?gb1.disabled:null, txt:(document.querySelectorAll('#xx-gong-list .upg small')[0]||{}).textContent||''};
  if(!(o.gongPoor.disabled && o.gongPoor.txt.indexOf('灵石差')>=0)) o.errs.push('功法不足未明示: '+JSON.stringify(o.gongPoor));
  /* A 聚灵阵真实入口升级 */
  ROUTER.open('dong','xx-array-sec'); await sleep(400);
  S.stone=900000; XX._render();
  var c0=S.cave|0, ast0=S.stone;
  var ab=document.getElementById('xx-array-upbtn'); o.arrayBtn=ab?ab.textContent:'';
  if(ab) ab.click();
  await sleep(400);
  o.array={lv0:c0, lv1:S.cave|0, stone0:ast0, stone1:S.stone, msg:((document.getElementById('xx-array-msg')||{}).textContent||'')};
  if(!(S.cave===c0+1 && S.stone<ast0 && o.array.msg.indexOf('已升到')>=0)) o.errs.push('聚灵阵升级未生效: '+JSON.stringify(o.array));
  S.stone=0; XX._render(); await sleep(200);
  var ab2=document.getElementById('xx-array-upbtn');
  o.arrayPoor={disabled:ab2?ab2.disabled:null, cost:((document.getElementById('xx-array-cost')||{}).textContent||'')};
  if(!(o.arrayPoor.disabled && o.arrayPoor.cost.indexOf('差')>=0)) o.errs.push('聚灵阵不足未明示: '+JSON.stringify(o.arrayPoor));
`;

function parse(r){ try{ return JSON.parse(r.replace(/^G=/,'')); }catch(e){ return null; } }
let failed = 0;
const sizes = [['430','900'],['393','720'],['360','640']];
const afterH = {};
console.log('== T 顶栏两行（当前） ==');
for (const [w,h] of sizes) {
  const r = runPage(path.join(ROOT,'index.html'), seedOf(base), TOP_SCRIPT, 2600, w+','+h, 12000);
  console.log(w+'x'+h+' '+r);
  const o = parse(r); if(!(o && o.ok && o.errs.length===0)) failed++;
  if(o) afterH[w]=o.barH;
}
console.log('== T0 基线（旧包 batch2 顶栏高度） ==');
for (const [w,h] of sizes) {
  const r = runPage('D:/xx-scratch/log/fix_20261120/_oldpkg/index.html', seedOf(base), TOP_SCRIPT, 2600, w+','+h, 12000);
  const o = parse(r);
  console.log(w+'x'+h+' barH=' + (o ? o.barH : 'ERR') + (o && afterH[w] ? ('  -> 当前 ' + afterH[w] + ' (+' + (afterH[w] - o.barH) + 'px)') : ''));
  if(!o) failed++;
}
console.log('== F/G/A 真实入口 ==');
{
  const r = runPage(path.join(ROOT,'index.html'), seedOf(base), RUN_SCRIPT, 4200, '900,1200', 20000);
  console.log(r);
  const o = parse(r); if(!(o && o.ok && o.errs.length===0)) failed++;
}
console.log(failed ? ('B45 FAIL ' + failed) : 'B45 PASS');
process.exit(failed ? 1 : 0);