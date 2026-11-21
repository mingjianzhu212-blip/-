'use strict';
/* 第三批 B6 探针（本段已落的两项）：突破成功/失败演出、塔 Boss 层呈现区别
   用法：ELECTRON_RUN_AS_NODE=1 "D:/Qoder CN/Qoder CN.exe" _b3_b6_check.js */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const base = {name:'青玄子',sex:'m',gender:'male',robe:'bai',rank:3,exp:9999,stone:9000,herb:25,ore:25,cave:1,dan:1,forge:2,dao:0,rootIdx:1,gong1:2,gong2:0,gong3:0,field:0,mine:0,weapon:2,weaponLv:1,bagSize:20,tower:10,towerMax:9,petSlots:1,wisdom:0,insight:0,failBonus:0,guardMirror:0,guardArray:0,tianji:0,herb100:0,herb10000:0,log:[],bag:[],recipeN:{},mastery:{alchemyLv:1,alchemyExp:0,forgeLv:2,forgeExp:0},stats:{sit:9,herb:3,train:2,enlight:1,craftPill:1,explore:0,hunt:0,enhance:0,stoneEarned:100,farmN:0},plots:[],pets:[],eggs:[],arena:{day:'',left:0,tier:1,win:0,lose:0,rep:0,foes:[]},union:{start:t,day:'',left:0,merit:0,claimed:[],season:1},sign:{days:0,last:''},secret:{prog:[0,0,0,0],day:'',swept:0},towerDay:'',towerSwept:0,enc:{t:0,bubble:null,lastId:''},encBuff:{mult:0,until:0},miles:{},milesNew:[],letters:[],story:{claimed:claimed},equipment:{weapon:null,armor:null,accessory:null},shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},actDay:'',gate:{lv:0,grad:0,disciples:[]},council:{day:'',n:0,last:''},trail:{i:8},trail2:{i:1},life:{age:40,on:true,brk:0},legacy:{gens:0,relic:null,hist:[],pick:null},mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},guide:{step:14,done:true,skipped:false,started:true,flags:{c_enter:true,c_sit:true,c_brk:true,c_field:true},rewardClaims:{taixu_intro_dan_v1:true},toldSystems:{}},art:{bg:1,brk:0,cai:0},last:t};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const SCRIPT = `
  await sleep(500);
  var sm=document.getElementById('story-modal'); if(sm&&!sm.classList.contains('hidden')) document.getElementById('sto-close').click();
  var gb=document.getElementById('taixu-bubble'); if(gb){var sk=document.getElementById('taixu-skip'); if(sk) sk.click();}
  await sleep(400);
  var S=XX._s;
  try{ window.TRIB = null; }catch(e){}
  /* 成功演出 */
  S.rank=3; S.exp=99999; S.insight=0; S.failBonus=0; XX._render();
  var rnd=Math.random; Math.random=function(){ return 0; };
  XX._attemptBreak();
  await sleep(500);
  var bm=document.getElementById('break-modal');
  o.win={ vis:!!(bm&&!bm.classList.contains('hidden')),
    title:(document.getElementById('b-title')||{}).textContent||'',
    desc:(document.getElementById('b-desc')||{}).textContent||'' };
  if(!(o.win.vis && o.win.title.indexOf('突破成功')>=0 && o.win.desc.indexOf('修炼速度')>=0 && o.win.desc.indexOf('本境新解锁')>=0 && o.win.desc.indexOf('战力')>=0)) o.errs.push('成功演出缺项: '+JSON.stringify(o.win));
  document.getElementById('b-close').click();
  await sleep(300);
  /* 失败演出 */
  S.rank=3; S.exp=99999; S.insight=0; S.failBonus=0; XX._render();
  Math.random=function(){ return 0.999; };
  var rank0=S.rank;
  XX._attemptBreak();
  await sleep(500);
  o.fail={ vis:!!(bm&&!bm.classList.contains('hidden')), rankSame:S.rank===rank0,
    title:(document.getElementById('b-title')||{}).textContent||'',
    desc:(document.getElementById('b-desc')||{}).textContent||'' };
  if(!(o.fail.vis && o.fail.rankSame && o.fail.title.indexOf('突破未成')>=0 && o.fail.desc.indexOf('成功率')>=0 && o.fail.desc.indexOf('顿悟进度')>=0 && o.fail.desc.indexOf('修为反噬')>=0)) o.errs.push('失败演出缺项: '+JSON.stringify(o.fail));
  document.getElementById('b-close').click();
  Math.random=rnd;
  await sleep(300);
  /* 塔 Boss 层：名号 / 立绘位 / 结算字 */
  S.rank=30; S.exp=0; S.tower=10; S.towerMax=9; S.wisdom=0; XX._render();
  o.bossBefore={beast:XX._towerBeast(10).name, isBoss:!!XX._towerBeast(10).boss};
  XX._towerFight();
  await sleep(900);
  o.boss={ title:(document.getElementById('bt-title')||{}).textContent||'',
    mname:(document.getElementById('bt-mname')||{}).textContent||'',
    bossCls:document.getElementById('bt-mavatar')?document.getElementById('bt-mavatar').classList.contains('boss'):false,
    tag:!!document.querySelector('.bt-boss-tag') };
  if(!(o.boss.title.indexOf('妖王')>=0 && o.boss.title.indexOf('首战')>=0 && o.boss.mname.indexOf('妖王')>=0 && o.boss.bossCls && o.boss.tag)) o.errs.push('Boss 出场缺项: '+JSON.stringify(o.boss));
  document.getElementById('bt-skip').click();
  await sleep(600);
  o.bossResult={ logLast:(S.log&&S.log[0]?S.log[0].t:'') , logAll:(S.log||[]).slice(0,4).map(function(x){return x.t;}).join(' | ') };
  if(o.bossResult.logAll.indexOf('Boss 专属')<0 && o.bossResult.logAll.indexOf('妖王')<0) o.errs.push('Boss 结算日志缺项: '+JSON.stringify(o.bossResult));
  o.settleTower={ vis:!document.getElementById('craft-settle').classList.contains('hidden'),
    title:(document.getElementById('cs-title')||{}).textContent||'',
    rows:(document.getElementById('cs-rows')||{}).textContent||'',
    soft:document.getElementById('craft-settle').classList.contains('soft') };
  if(!(o.settleTower.vis && o.settleTower.title.indexOf('妖王伏诛')>=0 && o.settleTower.rows.indexOf('Boss 专属')>=0 && o.settleTower.soft)) o.errs.push('塔结算层缺项: '+JSON.stringify(o.settleTower));
  document.getElementById('cs-close').click();
  await sleep(300);
  /* 结算层：收获 */
  S.plots=[{crop:'herb',t0:Date.now()-5000,need:1}]; XX._render();
  XX._harvestAll(); await sleep(300);
  o.settleHarvest={ vis:!document.getElementById('craft-settle').classList.contains('hidden'),
    title:(document.getElementById('cs-title')||{}).textContent||'',
    rows:(document.getElementById('cs-rows')||{}).textContent||'' };
  if(!(o.settleHarvest.vis && o.settleHarvest.title.indexOf('收获结算')>=0 && o.settleHarvest.rows.indexOf('灵草')>=0)) o.errs.push('收获结算层缺项: '+JSON.stringify(o.settleHarvest));
  document.getElementById('cs-close').click();
  await sleep(300);
  /* 结算层：签到 */
  S.sign.last=''; S.sign.days=0; XX._render(); XX._claimSign(); await sleep(300);
  o.settleSign={ vis:!document.getElementById('craft-settle').classList.contains('hidden'),
    title:(document.getElementById('cs-title')||{}).textContent||'',
    rows:(document.getElementById('cs-rows')||{}).textContent||'' };
  if(!(o.settleSign.vis && o.settleSign.title.indexOf('签到结算')>=0 && o.settleSign.rows.length>0)) o.errs.push('签到结算层缺项: '+JSON.stringify(o.settleSign));
  document.getElementById('cs-close').click();
  /* 被动飘字频率：20 秒内合并条数应远少于 tick 次数（40），且至少 1 条 */
  var chipLog=[];
  var lt=document.getElementById('loot-toast');
  if(lt) new MutationObserver(function(muts){
    muts.forEach(function(m){ [].slice.call(m.addedNodes).forEach(function(n){ if(n.textContent) chipLog.push(n.textContent); }); });
  }).observe(lt,{childList:true});
  await sleep(20000);
  o.float={ n:chipLog.length, sample:chipLog.slice(0,5).join(' | '), state:XX._passFloatState() };
  if(!(o.float.n>=1 && o.float.n<=6)) o.errs.push('被动飘字频率异常: '+JSON.stringify(o.float));
`;
const DIAG = `(async function(){
  var o={ok:true,errs:[]}; var sleep=ms=>new Promise(r=>setTimeout(r,ms));
  try{ ${SCRIPT} }catch(e){ o.ok=false; o.errs.push(String(e&&e.stack||e)); }
  document.getElementById('diag').textContent='G='+JSON.stringify(o);
})();`;
const f = path.join(PAGE.SCRATCH, '._b3b6.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE +
  '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
  '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},800);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxb3b6' + Date.now());
try {
  const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
    '--virtual-time-budget=60000','--window-size=430,900','--dump-dom','file:///' + f.replace(/\\/g, '/')],
    { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const r = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(r);
  let o=null; try{ o=JSON.parse(r.replace(/^G=/,'')); }catch(e){}
  console.log(o && o.ok && o.errs.length===0 ? 'B6 PASS' : 'B6 FAIL');
  process.exit(o && o.ok && o.errs.length===0 ? 0 : 1);
} catch (e) { console.log('ERR ' + e.message); process.exit(1); }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }