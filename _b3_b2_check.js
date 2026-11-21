'use strict';
/* 第三批 B2 探针：底部五签真点 + 人物页（立绘/装备槽/四族法宝/属性条/一键装备/无传送门）
   用法：ELECTRON_RUN_AS_NODE=1 "D:/Qoder CN/Qoder CN.exe" _b3_b2_check.js */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const base = {name:'青玄子',sex:'m',gender:'male',robe:'bai',rank:6,exp:400,stone:9000,herb:25,ore:25,cave:1,dan:1,forge:2,dao:0,rootIdx:1,gong1:2,gong2:0,gong3:0,field:0,mine:0,weapon:2,weaponLv:1,bagSize:20,tower:0,towerMax:1,petSlots:1,wisdom:0,insight:0,failBonus:0,guardMirror:0,guardArray:0,tianji:0,herb100:0,herb10000:0,log:[],bag:[{t:'eq_huxin',n:'照胆镜'},{t:'eq_yupei',n:'养元玉佩'}],recipeN:{},mastery:{alchemyLv:1,alchemyExp:0,forgeLv:2,forgeExp:0},stats:{sit:9,herb:3,train:2,enlight:1,craftPill:1,explore:0,hunt:0,enhance:0,stoneEarned:100,farmN:0},plots:[],pets:[],eggs:[],arena:{day:'',left:0,tier:1,win:0,lose:0,rep:0,foes:[]},union:{start:t,day:'',left:0,merit:0,claimed:[],season:1},sign:{days:0,last:''},secret:{prog:[0,0,0,0],day:'',swept:0},towerDay:'',towerSwept:0,enc:{t:0,bubble:null,lastId:''},encBuff:{mult:0,until:0},miles:{},milesNew:[],letters:[],story:{claimed:claimed},equipment:{weapon:null,armor:null,accessory:null},shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},actDay:'',gate:{lv:0,grad:0,disciples:[]},council:{day:'',n:0,last:''},trail:{i:8},trail2:{i:1},life:{age:40,on:true,brk:0},legacy:{gens:0,relic:null,hist:[],pick:null},mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},guide:{step:14,done:true,skipped:false,started:true,flags:{c_enter:true,c_sit:true,c_brk:true,c_field:true},rewardClaims:{taixu_intro_dan_v1:true},toldSystems:{}},art:{bg:1,brk:0,cai:0},last:t};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const SCRIPT = `
  await sleep(400);
  var sm=document.getElementById('story-modal'); if(sm&&!sm.classList.contains('hidden')) document.getElementById('sto-close').click();
  var gb=document.getElementById('taixu-bubble'); if(gb){var sk=document.getElementById('taixu-skip'); if(sk) sk.click();}
  await sleep(500);
  function tab(k){ return document.querySelector('.scene-tab[data-tab="'+k+'"]'); }
  function act(k){ var b=tab(k); return !!(b && b.classList.contains('active')); }
  function cur(){ return ROUTER.current(); }
  function sec(){ var p=document.querySelector('.panel-page'); return p ? (p.dataset.panel+':'+p.dataset.sec) : 'scene'; }
  o.tabs=[].slice.call(document.querySelectorAll('.scene-tab')).map(function(b){return b.dataset.tab;});
  if(o.tabs.join(',')!=='role,cave,town,zong,bag') o.errs.push('五签顺序不对: '+o.tabs.join(','));
  /* 人物签 */
  tab('role').click(); await sleep(500);
  o.role={cur:cur(), sec:sec(), act:act('role')};
  if(!(o.role.cur==='role_equip' && o.role.act)) o.errs.push('人物签落点异常: '+JSON.stringify(o.role));
  /* 洞府/城镇/宗门/背包 */
  tab('cave').click(); await sleep(400);
  o.cave={cur:cur(), sub:document.getElementById('scene-cave').classList.contains('active'), act:act('cave')};
  if(!(o.cave.cur==='scene' && o.cave.sub && o.cave.act)) o.errs.push('洞府签异常: '+JSON.stringify(o.cave));
  tab('town').click(); await sleep(400);
  o.town={cur:cur(), sub:document.getElementById('scene-town').classList.contains('active'), act:act('town'), inTown:document.getElementById('page-scene').classList.contains('in-town')};
  if(!(o.town.cur==='scene' && o.town.sub && o.town.inTown && o.town.act)) o.errs.push('城镇签异常: '+JSON.stringify(o.town));
  tab('zong').click(); await sleep(400);
  o.zong={cur:cur(), sec:sec(), act:act('zong')};
  if(!(o.zong.cur==='zong' && o.zong.act)) o.errs.push('宗门签异常: '+JSON.stringify(o.zong));
  tab('bag').click(); await sleep(400);
  o.bag={cur:cur(), sec:sec(), act:act('bag')};
  if(!(o.bag.cur==='bag' && o.bag.act)) o.errs.push('背包签异常: '+JSON.stringify(o.bag));
  /* 底栏压在面板页之上：面板打开时五签仍可见 */
  var br=document.querySelector('.scene-tabs').getBoundingClientRect();
  o.navOnPanel={vis:br.height>0&&br.bottom<=innerHeight+1, z:+getComputedStyle(document.querySelector('.scene-tabs')).zIndex};
  if(!o.navOnPanel.vis) o.errs.push('面板页底栏不可见');
  /* 人物页结构 */
  tab('role').click(); await sleep(500);
  o.sheet={
    sheet:!!document.getElementById('char-sheet'),
    fig:!!document.querySelector('#xx-role-figure img'),
    slots:document.querySelectorAll('#char-sheet .equip-slot').length,
    arts:document.querySelectorAll('#char-sheet .art-slot').length,
    name:(document.getElementById('cs-name')||{}).textContent||'',
    rank:(document.getElementById('cs-rank')||{}).textContent||'',
    path:(document.getElementById('cs-path')||{}).textContent||'',
    stats:(document.getElementById('xx-role-stats')||{}).textContent||'',
    bars:[(document.getElementById('cs-exptxt')||{}).textContent||'', (document.getElementById('cs-lifetxt')||{}).textContent||''],
    bld:document.querySelectorAll('#char-sheet [data-bld]').length,
    jumps:document.querySelectorAll('#char-sheet [data-jump]').length
  };
  if(!(o.sheet.sheet && o.sheet.fig && o.sheet.slots===3 && o.sheet.arts===4 && o.sheet.stats.indexOf('道号')>=0 && o.sheet.bars[0] && o.sheet.bars[1])) o.errs.push('人物页结构缺件: '+JSON.stringify(o.sheet));
  if(o.sheet.bld||o.sheet.jumps) o.errs.push('人物页出现其他功能传送门');
  /* 四族法宝落点：已持有→强化页，未持有→炼器页 */
  function artHop(fam){
    var b=document.querySelector('#xx-role-arts .art-slot[data-art="'+fam+'"]');
    if(!b) return 'missing';
    b.click(); var s=sec(); ROUTER.open('role','xx-role-equip'); return s;
  }
  o.artHops={lq:artHop('lq'), bg:artHop('bg'), brk:artHop('brk'), cai:artHop('cai')};
  if(!(o.artHops.lq==='dong:xx-enhance-sec' && o.artHops.bg==='dong:xx-enhance-sec' && o.artHops.brk==='dong:xx-forge-sec' && o.artHops.cai==='dong:xx-forge-sec')) o.errs.push('法宝位落点异常: '+JSON.stringify(o.artHops));
  /* 一键装备：只填空槽 */
  await sleep(300);
  var ae=document.getElementById('xx-role-auto');
  o.autoBefore={txt:ae?ae.textContent:'', armor:S.equipment.armor||null, acc:S.equipment.accessory||null, weapon:S.equipment.weapon||null, bag:S.bag.length};
  if(ae) ae.click();
  await sleep(400);
  o.autoAfter={armor:S.equipment.armor||null, acc:S.equipment.accessory||null, weapon:S.equipment.weapon||null, bag:S.bag.length, txt:(document.getElementById('xx-role-auto')||{}).textContent||''};
  if(!(S.equipment.armor==='eq_huxin' && S.equipment.accessory==='eq_yupei' && S.equipment.weapon===null)) o.errs.push('一键装备结果异常: '+JSON.stringify(o.autoAfter));
  /* 人物页内页签：札记 */
  var jb=document.querySelector('#char-sheet [data-role-jump="xx-role-journal"]');
  if(jb){ jb.click(); await sleep(400); o.jump={cur:cur(), sec:sec(), act:act('role')};
    if(!(o.jump.cur==='role_journal' && o.jump.act)) o.errs.push('人物内页签异常: '+JSON.stringify(o.jump)); }
`;
const DIAG = `(async function(){
  var o={ok:true,errs:[]}; var sleep=ms=>new Promise(r=>setTimeout(r,ms));
  try{ ${SCRIPT} }catch(e){ o.ok=false; o.errs.push(String(e&&e.stack||e)); }
  document.getElementById('diag').textContent='G='+JSON.stringify(o);
})();`;
const f = path.join(PAGE.SCRATCH, '._b3b2.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE +
  '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
  '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},800);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxb3b2' + Date.now());
try {
  const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
    '--virtual-time-budget=20000','--window-size=430,900','--dump-dom','file:///' + f.replace(/\\/g, '/')],
    { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const r = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(r);
  let o=null; try{ o=JSON.parse(r.replace(/^G=/,'')); }catch(e){}
  console.log(o && o.ok && o.errs.length===0 ? 'B2 PASS' : 'B2 FAIL');
  process.exit(o && o.ok && o.errs.length===0 ? 0 : 1);
} catch (e) { console.log('ERR ' + e.message); process.exit(1); }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }