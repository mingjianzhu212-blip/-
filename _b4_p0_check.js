'use strict';
/* batch4 P0 探针：A1 日键/今日清单、离线软结算、坊市/论剑确认、缺料跳转、被动飘字
   用法：ELECTRON_RUN_AS_NODE=1 "D:/Qoder CN/Qoder CN.exe" _b4_p0_check.js */
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
const SCRIPT = `
  await sleep(500);
  var sm=document.getElementById('story-modal'); if(sm&&!sm.classList.contains('hidden')) document.getElementById('sto-close').click();
  var gb=document.getElementById('taixu-bubble'); if(gb){var sk=document.getElementById('taixu-skip'); if(sk) sk.click();}
  await sleep(400);
  var S=XX._s;
  /* A1：日键与倒计时 */
  o.day={key:XX._todayKey(), no:XX._todayNo(), resetMs:XX._nextResetMs()};
  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(o.day.key)) o.errs.push('日键格式异常');
  if(!(o.day.resetMs>0 && o.day.resetMs<=24*3600*1000)) o.errs.push('重置倒计时异常: '+o.day.resetMs);
  {
    var nd=new Date(), y=nd.getFullYear(), mo=nd.getMonth(), dd=nd.getDate();
    var t1=new Date(y,mo,dd,7,59,0,0).getTime(), t2=new Date(y,mo,dd,8,0,0,0).getTime();
    o.boundary={ k1:XX._todayKeyAt(t1), k2:XX._todayKeyAt(t2), n1:XX._todayNoAt(t1), n2:XX._todayNoAt(t2) };
    if(!(o.boundary.n1 < o.boundary.n2 && o.boundary.k1 !== o.boundary.k2)) o.errs.push('08:00 日界异常: '+JSON.stringify(o.boundary));
  }
  /* C1：今日清单 + 签到领取 */
  S.sign.last=''; XX._render(); await sleep(200);
  document.getElementById('sc-today').click(); await sleep(400);
  o.today={cur:ROUTER.current(), title:(document.querySelector('#page-today h2')||{}).textContent||'',
    rows:document.querySelectorAll('#today-list .today-row').length,
    cd:(document.getElementById('today-reset')||{}).textContent||'',
    dot:document.getElementById('sc-today-dot').classList.contains('on')};
  if(!(o.today.cur==='today' && o.today.rows>=12 && /08:00|距下次重置/.test(o.today.cd) && o.today.dot)) o.errs.push('今日页缺项: '+JSON.stringify(o.today));
  var signBtn=document.querySelector('#today-list [data-today-claim="sign"]');
  if(!signBtn) o.errs.push('今日页没有签到领取');
  else{
    signBtn.click(); await sleep(400);
    o.sign={days:S.sign.days, last:S.sign.last, showsSettle:!document.getElementById('craft-settle').classList.contains('hidden')};
    if(!(S.sign.days===1 && S.sign.last===XX._todayKey() && o.sign.showsSettle)) o.errs.push('签到领取异常: '+JSON.stringify(o.sign));
    document.getElementById('cs-close').click();
  }
  /* 行动次数与底层一致 */
  try{
    var actRow=[].slice.call(document.querySelectorAll('#today-list .today-row')).filter(function(r){
      var b=r.querySelector('.tr-main b'); return b && b.textContent.replace(/^[^\\u4e00-\\u9fa5]+/,'')==='打坐';
    })[0];
    var want='剩 '+(Math.max(0,XX._bal.actLimit.sit-(S.acts.sit|0)))+' / '+XX._bal.actLimit.sit;
    o.actRow={txt:actRow?actRow.textContent:'', want:want};
    if(!(actRow && actRow.textContent.indexOf(want)>=0)) o.errs.push('行动次数不同源: '+JSON.stringify(o.actRow));
  }catch(e){ o.errs.push('行动行检查异常'); }
  ROUTER.back(); await sleep(300);
  /* 离线 1 小时：软结算 + 数值对账 */
  S.last=Date.now()-3600*1000; var e0=S.exp,s0=S.stone,o0=S.ore;
  XX._offline(); var e1=S.exp,s1=S.stone,o1=S.ore; await sleep(300);
  var om=document.getElementById('off-modal');
  o.off={vis:!!(om&&!om.classList.contains('hidden')), soft:!!(om&&om.classList.contains('soft')),
    dur:(document.getElementById('off-dur')||{}).textContent||'',
    rows:(document.getElementById('off-rows')||{}).textContent||''};
  var li=XX._lastOffline()||{};
  o.off.check={gExp:li.gExp, dExp:e1-e0, gStone:li.gStone, dStone:s1-s0, gOre:li.gOre, dOre:o1-o0};
  if(!(o.off.vis && o.off.soft && /60 分钟|1 小时/.test(o.off.dur) && o.off.rows.indexOf('修为')>=0)) o.errs.push('离线页缺项: '+JSON.stringify(o.off));
  if(Math.abs(li.gExp-(e1-e0))>1e-6 || Math.abs(li.gStone-(s1-s0))>1e-6 || Math.abs(li.gOre-(o1-o0))>1e-6) o.errs.push('离线对账不符: '+JSON.stringify(o.off.check));
  document.getElementById('off-close').click();
  /* 坊市购买确认：取消不扣、确认成交 */
  ROUTER.open('market','mk-goods'); await sleep(300);
  S.market.goods=[{id:'dan1',price:50,bought:false}]; S.stone=1000; XX._render(); await sleep(200);
  var buy=document.querySelector('#mk-goods [data-buy]'); var st0=S.stone;
  if(buy) buy.click(); await sleep(200);
  o.mkConfirm={vis:!document.getElementById('stance-modal').classList.contains('hidden'),
    txt:(document.getElementById('st-text')||{}).textContent||''};
  if(!(o.mkConfirm.vis && /单价|余额|买后/.test(o.mkConfirm.txt))) o.errs.push('坊市确认缺项: '+JSON.stringify(o.mkConfirm));
  document.getElementById('st-close').click(); await sleep(150);
  o.mkCancel={bought:S.market.goods[0].bought, stone:S.stone};
  if(o.mkCancel.bought || Math.abs(S.stone-st0)>1) o.errs.push('坊市取消仍扣款: '+JSON.stringify(o.mkCancel));
  buy=document.querySelector('#mk-goods [data-buy]'); if(buy) buy.click(); await sleep(150);
  var okBtn=document.querySelector('#st-opts [data-st="ok"]'); if(okBtn) okBtn.click(); await sleep(300);
  o.mkBuy={bought:S.market.goods[0].bought, stone:S.stone, want:st0-50};
  if(!(S.market.goods[0].bought && Math.abs(S.stone-(st0-50))<=2)) o.errs.push('坊市确认成交异常: '+JSON.stringify(o.mkBuy));
  /* 论剑商店确认 */
  ROUTER.open('arena','ar-shop'); await sleep(300);
  S.arena.rep=500; S.bag=[]; XX._render(); await sleep(200);
  var ab=document.querySelector('#xx-arena-shop [data-buy]'); var rp0=S.arena.rep;
  if(ab) ab.click(); await sleep(200);
  o.rpConfirm={vis:!document.getElementById('stance-modal').classList.contains('hidden'),
    txt:(document.getElementById('st-text')||{}).textContent||''};
  if(!(o.rpConfirm.vis && /声望/.test(o.rpConfirm.txt))) o.errs.push('论剑确认缺项');
  document.getElementById('st-close').click(); await sleep(150);
  if(S.arena.rep!==rp0) o.errs.push('论剑取消仍扣声望');
  ab=document.querySelector('#xx-arena-shop [data-buy]'); if(ab) ab.click(); await sleep(150);
  okBtn=document.querySelector('#st-opts [data-st="ok"]'); if(okBtn) okBtn.click(); await sleep(300);
  if(!(S.arena.rep<rp0)) o.errs.push('论剑确认未成交');
  /* 缺料跳转：炼丹行 / 破境页 */
  S.herb=0; ROUTER.open('dong','xx-alchemy-sec'); await sleep(400);
  var mg=document.querySelector('#xx-alchemy [data-mat-go]');
  o.matGo={exists:!!mg, to:mg?mg.dataset.matGo:''};
  if(!mg) o.errs.push('炼丹缺料无跳转');
  else{ mg.click(); await sleep(400); o.matGo.cur=ROUTER.current(); if(ROUTER.current()!=='dong_field') o.errs.push('炼丹缺料落点异常: '+ROUTER.current()); }
  S.rank=0; S.exp=99999; S.bag=[]; XX._openBreakConfirm(); await sleep(300);
  var bmg=document.querySelector('#bc-pill [data-mat-go]');
  o.breakGo={exists:!!bmg};
  if(!bmg) o.errs.push('破境缺丹无跳转');
  else{ bmg.click(); await sleep(400); o.breakGo.cur=ROUTER.current(); if(ROUTER.current()!=='dong_alchemy') o.errs.push('破境缺丹落点异常: '+ROUTER.current()); }
  /* 被动飘字：30 秒虚拟时间至少 3 条带数字 */
  var chips=[];
  var lt=document.getElementById('loot-toast');
  if(lt) new MutationObserver(function(muts){
    muts.forEach(function(m){ [].slice.call(m.addedNodes).forEach(function(n){ if(n.textContent) chips.push(n.textContent); }); });
  }).observe(lt,{childList:true});
  await sleep(30000);
  o.float={n:chips.length, sample:chips.slice(0,4).join(' | '), acc:XX._passFloatState().acc};
  if(!(o.float.n>=3 && /\\d/.test(o.float.sample) && (o.float.acc.exp>0 || o.float.acc.stone>0 || o.float.acc.ore>0))) o.errs.push('被动飘字不足: '+JSON.stringify(o.float));
`;
const DIAG = `(async function(){
  var o={ok:true,errs:[]}; var sleep=ms=>new Promise(r=>setTimeout(r,ms));
  try{ ${SCRIPT} }catch(e){ o.ok=false; o.errs.push(String(e&&e.stack||e)); }
  document.getElementById('diag').textContent='G='+JSON.stringify(o);
})();`;
const f = path.join(PAGE.SCRATCH, '._b4p0.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE +
  '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
  '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},800);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxb4p0' + Date.now());
try {
  const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
    '--virtual-time-budget=60000','--window-size=430,900','--dump-dom','file:///' + f.replace(/\\/g, '/')],
    { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const r = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(r);
  let o=null; try{ o=JSON.parse(r.replace(/^G=/,'')); }catch(e){}
  console.log(o && o.ok && o.errs.length===0 ? 'B4P0 PASS' : 'B4P0 FAIL');
  process.exit(o && o.ok && o.errs.length===0 ? 0 : 1);
} catch (e) { console.log('ERR ' + e.message); process.exit(1); }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }