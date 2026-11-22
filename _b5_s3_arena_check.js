'use strict';
/* batch5 第三段1 探针：论剑台雇人代打（甲案） */
const fs = require('node:fs'), path = require('node:path'); const ROOT = __dirname;
const PAGE = require('./tools/page.js'); const { execEdge } = require('./tools/edge-run.js'); PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => claimed[id] = t);
const base = { name: '青玄子', sex: 'm', gender: 'male', robe: 'bai', rank: 12, exp: 120, stone: 100000, herb: 25, ore: 25, cave: 1, dan: 1, forge: 1, dao: 0, rootIdx: 1, gong1: 2, gong2: 0, gong3: 0, field: 0, mine: 0, weapon: 2, weaponLv: 1, bagSize: 20, tower: 0, towerMax: 0, petSlots: 1, wisdom: 0, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0, herb100: 0, herb10000: 0, log: [], bag: [], recipeN: {}, mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 }, stats: { sit: 0, herb: 0, train: 0, enlight: 0, craftPill: 0, explore: 0, hunt: 0, enhance: 0, stoneEarned: 0, farmN: 0 }, plots: [], pets: [], eggs: [], arena: { day: '', left: 0, foes: [], tier: 1, win: 0, lose: 0, rep: 0 }, union: { start: t, day: '', left: 1, merit: 0, claimed: [], season: 1 }, sign: { days: 0, last: '' }, secret: { prog: [0, 0, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0, enc: { t: 0, bubble: null, lastId: '' }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed: claimed }, equipment: { weapon: null, armor: null, accessory: null }, shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 }, market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 }, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', gate: { lv: 0, grad: 0, disciples: [] }, coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 }, lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 }, unlocks: [], blueprints: {}, bpShop: { week: '', bought: 0 }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 1 }, life: { age: 40, on: true, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null }, mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, guide: { step: 14, done: true, skipped: false, started: true, flags: { c_enter: true, c_sit: true, c_brk: true, c_field: true }, rewardClaims: { taixu_intro_dan_v1: true }, toldSystems: {} }, art: { bg: 1, brk: 0, cai: 0 }, last: t };
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const SCRIPT = `
  await sleep(500);
  var sm=document.getElementById('story-modal');if(sm&&!sm.classList.contains('hidden'))document.getElementById('sto-close').click();
  await sleep(300);
  var S=XX._s;
  function seedArena(){
    S.arena.day=XX._todayKey(); S.arena.left=5; S.arena.win=0; S.arena.lose=0; S.arena.rep=0;
    S.arena.proxyDay='';
    S.arena.foes=[];
    for(var i=0;i<6;i++)S.arena.foes.push({name:'道友'+i,power:100+i,beat:false});
    S.stone=100000;
  }
  o.oldSave={has:'proxyDay' in S.arena,type:typeof S.arena.proxyDay,val:S.arena.proxyDay};
  seedArena();
  ROUTER.open('arena','ar-board');await sleep(600);
  o.cost=XX._arenaProxyCost();
  o.expectCost=Math.floor(XX._need(S.rank)*0.6);
  o.buttons=document.querySelectorAll('#xx-arena-foes [data-proxy]').length;
  o.elig=XX._arenaProxyEligible();
  if(!(o.cost===o.expectCost&&o.buttons===6&&o.elig)) o.errs.push('代打入口异常: '+JSON.stringify(o));
  /* 取消：不扣 */
  document.querySelector('#xx-arena-foes [data-proxy="0"]').click();await sleep(250);
  var mod=document.getElementById('stance-modal');
  o.confirm={vis:mod&&!mod.classList.contains('hidden'),text:(document.getElementById('st-text')||{}).textContent||'',
    title:(document.getElementById('st-title')||{}).textContent||''};
  if(!(o.confirm.vis&&o.confirm.title.indexOf('雇人代打')>=0&&o.confirm.text.indexOf('胜负随机')>=0&&o.confirm.text.indexOf('1')>=0&&o.confirm.text.indexOf('灵石')>=0)) o.errs.push('代打确认页缺项: '+JSON.stringify(o.confirm));
  document.getElementById('st-close').click();await sleep(250);
  o.cancel={left:S.arena.left,stone:S.stone,beat:S.arena.foes[0].beat};
  if(!(o.cancel.left===5&&!o.cancel.beat)) o.errs.push('取消代打仍扣次数/对手: '+JSON.stringify(o.cancel));
  /* 确认：扣灵石、扣次数、走现有论剑结算 */
  document.querySelector('#xx-arena-foes [data-proxy="0"]').click();await sleep(200);
  document.querySelector('#st-opts [data-st="ok"]').click();await sleep(500);
  var bm=document.getElementById('battle-modal');if(bm&&!bm.classList.contains('hidden')){var sk=document.getElementById('bt-skip');if(sk)sk.click();}
  await sleep(300);
  o.done={left:S.arena.left,stone:S.stone,beat:S.arena.foes[0].beat,wins:S.arena.win,losses:S.arena.lose,
    proxyDay:S.arena.proxyDay,today:XX._todayKey(),
    log0:(S.log[0]&&S.log[0].t)||'',log1:(S.log[1]&&S.log[1].t)||'',
    buttons:document.querySelectorAll('#xx-arena-foes [data-proxy]').length,elig:XX._arenaProxyEligible(),
    keys:Object.keys(S.arena).sort().join(',')};
  o.spent=100000-o.done.stone;
  if(!(o.done.left===4&&o.done.beat===true&&(o.done.wins+o.done.losses)===1&&o.done.buttons===0&&!o.done.elig)) o.errs.push('代打结算异常: '+JSON.stringify(o.done));
  if(!(o.done.proxyDay===o.done.today&&o.done.today)) o.errs.push('代打日键未落 08:00 日界: '+JSON.stringify(o.done));
  if(!(/花 .*灵石雇人代打/.test(o.done.log1)&&o.cost===o.expectCost)) o.errs.push('代打灵石扣款异常: '+JSON.stringify({spent:o.spent,cost:o.cost,log1:o.done.log1}));
  if(!/论剑胜|不敌/.test(o.done.log0+o.done.log1)) o.errs.push('未走现有论剑结算日志: '+JSON.stringify([o.done.log0,o.done.log1]));
  if(o.done.keys!=='day,foes,left,lose,proxyDay,rep,tier,win') o.errs.push('论剑存档字段不符: '+o.done.keys);
  if(!(o.oldSave.has&&o.oldSave.type==='string'&&o.oldSave.val==='')) o.errs.push('旧档缺 proxyDay 未按未用处理: '+JSON.stringify(o.oldSave));
  /* 同日出第二场：拒绝且不扣 */
  var left0=S.arena.left,tot0=S.arena.win+S.arena.lose;
  var again=XX._arenaProxy(1);await sleep(200);
  o.again={ok:again,left:S.arena.left,log:(S.log[0]&&S.log[0].t)||''};
  if(!(again===false&&o.again.left===left0&&(S.arena.win+S.arena.lose)===tot0&&/今日已代打/.test(o.again.log))) o.errs.push('同日二次代打未拒绝: '+JSON.stringify(o.again));
  /* 顺序 A：先手动 1 场，再代打 */
  seedArena();XX._challengeArena(0,'plain');await sleep(400);
  var bm1=document.getElementById('battle-modal');if(bm1&&!bm1.classList.contains('hidden')){var sk1=document.getElementById('bt-skip');if(sk1)sk1.click();}
  await sleep(300);XX._render();await sleep(300);
  o.manualFirst={left:S.arena.left,elig:XX._arenaProxyEligible(),buttons:document.querySelectorAll('#xx-arena-foes [data-proxy]').length,proxyDay:S.arena.proxyDay};
  if(!(o.manualFirst.left===4&&o.manualFirst.elig&&o.manualFirst.buttons===5&&o.manualFirst.proxyDay==='')) o.errs.push('先手动后不可代打: '+JSON.stringify(o.manualFirst));
  document.querySelector('#xx-arena-foes [data-proxy="1"]').click();await sleep(200);
  document.querySelector('#st-opts [data-st="ok"]').click();await sleep(500);
  var bm2=document.getElementById('battle-modal');if(bm2&&!bm2.classList.contains('hidden')){var sk2=document.getElementById('bt-skip');if(sk2)sk2.click();}
  await sleep(300);
  o.manualThenProxy={left:S.arena.left,proxyDay:S.arena.proxyDay,foe1:S.arena.foes[1].beat,elig:XX._arenaProxyEligible()};
  if(!(o.manualThenProxy.left===3&&o.manualThenProxy.proxyDay===XX._todayKey()&&o.manualThenProxy.foe1===true&&!o.manualThenProxy.elig)) o.errs.push('先手动后代打异常: '+JSON.stringify(o.manualThenProxy));
  /* 顺序 B：先代打，再手动 1 场 */
  seedArena();XX._render();await sleep(300);
  document.querySelector('#xx-arena-foes [data-proxy="0"]').click();await sleep(200);
  document.querySelector('#st-opts [data-st="ok"]').click();await sleep(500);
  var bm3=document.getElementById('battle-modal');if(bm3&&!bm3.classList.contains('hidden')){var sk3=document.getElementById('bt-skip');if(sk3)sk3.click();}
  await sleep(300);
  o.proxyThenManual={left:S.arena.left,proxyDay:S.arena.proxyDay,elig:XX._arenaProxyEligible()};
  XX._challengeArena(1,'plain');await sleep(400);
  var bm4=document.getElementById('battle-modal');if(bm4&&!bm4.classList.contains('hidden')){var sk4=document.getElementById('bt-skip');if(sk4)sk4.click();}
  await sleep(300);
  o.proxyThenManual.leftAfter=S.arena.left;o.proxyThenManual.foe1=S.arena.foes[1].beat;
  if(!(o.proxyThenManual.left===4&&o.proxyThenManual.proxyDay===XX._todayKey()&&!o.proxyThenManual.elig&&o.proxyThenManual.leftAfter===3&&o.proxyThenManual.foe1===true)) o.errs.push('先代打后手动异常: '+JSON.stringify(o.proxyThenManual));
  /* 跨日：旧日键按未用处理 */
  seedArena();S.arena.proxyDay='2000-1-3';XX._render();await sleep(300);
  o.nextDay={elig:XX._arenaProxyEligible(),buttons:document.querySelectorAll('#xx-arena-foes [data-proxy]').length};
  if(!(o.nextDay.elig&&o.nextDay.buttons===6)) o.errs.push('旧日键未按未用处理: '+JSON.stringify(o.nextDay));
  /* 灵石不足：可点但拒绝，不扣次数、不写日键 */
  seedArena();S.stone=0;XX._render();await sleep(400);
  var btn=document.querySelector('#xx-arena-foes [data-proxy="0"]');
  o.poor={btn:!!btn,elig:XX._arenaProxyEligible()};
  if(!(btn&&o.poor.elig)) o.errs.push('灵石不足时入口应保留并给提示: '+JSON.stringify(o.poor));
  btn.click();await sleep(250);
  o.poor.left=S.arena.left;o.poor.proxyDay=S.arena.proxyDay;o.poor.log=(S.log[0]&&S.log[0].t)||'';
  if(!(o.poor.left===5&&o.poor.proxyDay===''&&/灵石不足/.test(o.poor.log))) o.errs.push('灵石不足未拒绝: '+JSON.stringify(o.poor));
`;
const DIAG = `(async function(){var o={ok:true,errs:[]};var sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{${SCRIPT}}catch(e){o.ok=false;o.errs.push(String(e&&e.stack||e));}
document.getElementById('diag').textContent='G='+JSON.stringify(o);})();`;
const f = path.join(PAGE.SCRATCH, '._b5s3arena.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE + '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div><script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},800);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxb5s3arena' + Date.now());
let exitCode = 1;
try {
  const out = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + ud, '--virtual-time-budget=18000', '--window-size=430,900', '--dump-dom', 'file:///' + f.replace(/\\/g, '/')], { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const r = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(r);
  let o = null; try { o = JSON.parse(r.replace(/^G=/, '')); } catch (e) {}
  const ok = !!(o && o.ok && o.errs.length === 0);
  console.log(ok ? 'B5S3-ARENA PASS' : 'B5S3-ARENA FAIL');
  exitCode = ok ? 0 : 1;
} catch (e) { console.log('ERR ' + e.message); }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
process.exit(exitCode);