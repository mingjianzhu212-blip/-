'use strict';
/* batch7 跟进单第 1 项探针：失败加成存盘/刷新保真 + 确认弹窗拆账 + 主页钮同源
   改前应看到：save 里 failBonus=0.05，load 回来变 0（CAPS 整数 floor 吃掉小数）。 */
const fs = require('node:fs'), path = require('node:path');
const { execEdge } = require('./tools/edge-run');
const PAGE = require('./tools/page'); PAGE.use(__dirname);
const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => claimed[id] = t);
const seedObj = { name: '青玄子', sex: 'm', gender: 'male', robe: 'bai', rank: 15, exp: 1e18, stone: 9000, herb: 50, ore: 50, cave: 1, dan: 1, forge: 1, dao: 0, rootIdx: 1, gong1: 3, gong2: 0, gong3: 0, field: 1, mine: 1, weapon: 3, weaponLv: 2, bagSize: 20, tower: 1, towerMax: 1, petSlots: 1, wisdom: 0, insight: 0, failBonus: 0.05, guardMirror: 0, guardArray: 0, tianji: 0, herb100: 0, herb10000: 0, log: [], bag: [], recipeN: {}, mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 }, stats: { sit: 5, herb: 5, train: 3, enlight: 1, craftPill: 1, explore: 1, hunt: 1, enhance: 0, stoneEarned: 0, farmN: 0 }, plots: [], pets: [], eggs: [], arena: { day: '', left: 3, foes: [], tier: 1, win: 0, lose: 0, rep: 0, proxyDay: '' }, union: { start: t, day: '', left: 1, merit: 0, claimed: [], season: 1 }, sign: { days: 0, last: '' }, secret: { prog: [1, 0, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0, enc: { t: 0, bubble: null, lastId: '', seen: {} }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed: claimed }, equipment: { weapon: null, armor: null, accessory: null }, shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 }, market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 }, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', gate: { lv: 1, grad: 0, disciples: [] }, coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 }, lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 }, unlocks: [], blueprints: {}, bpShop: { week: '', bought: 0 }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 12 }, trail3: { i: 3 }, life: { age: 100, on: true, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null }, mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, guide: { step: 0, done: true, skipped: true, started: true, flags: {}, rewardClaims: {}, toldSystems: {} }, art: { bg: 1, brk: 0, cai: 0 }, last: t };
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(seedObj)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const DIAG = `
<script>
(async function(){
  const out=[], L=(k,v)=>out.push(k+'='+v);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  await sleep(700);
  try{
    const S=XX._s, real=Math.random;
    L('bootFailBonusRaw', String(S.failBonus));                       /* 种子 0.05，boot load 后是多少 */
    const parts0=XX._breakParts(null,false,false);
    L('bootFailPart', String(parts0.parts.find(p=>p.k==='fail').v));
    L('bootFinal', parts0.final.toFixed(4));
    /* 真实失败 → save → 从 localStorage 重载 */
    Math.random=()=>0.999;
    S.rank=15; S.exp=1e18; S.failBonus=0; S.insight=0; S.wisdom=0;
    XX._attemptBreak({});
    await sleep(100);
    const disk1=JSON.parse(localStorage.getItem('xiuxian_save')||'{}');
    L('diskAfterFail1', String(disk1.failBonus));
    XX._load();
    L('reloadFailBonus1', String(XX._s.failBonus));
    const p1=XX._breakParts(null,false,false);
    L('reloadFailPart1', String(p1.parts.find(p=>p.k==='fail').v));
    L('reloadFinal1', p1.final.toFixed(4));
    const keep1=XX._s.failBonus; XX._s.failBonus=0;
    const b1=XX._breakParts(null,false,false); XX._s.failBonus=keep1;
    L('reloadDelta1', (p1.final-b1.final).toFixed(4));
    /* 连败两次 → 0.10 */
    S.rank=15; S.exp=1e18; S.failBonus=0; S.insight=0;
    Math.random=()=>0.999; XX._attemptBreak({}); await sleep(100);
    XX._s.rank=15; XX._s.exp=1e18; XX._attemptBreak({}); await sleep(100);
    const disk2=JSON.parse(localStorage.getItem('xiuxian_save')||'{}');
    L('diskAfterFail2', String(disk2.failBonus));
    XX._load();
    L('reloadFailBonus2', String(XX._s.failBonus));
    const p2=XX._breakParts(null,false,false);
    L('reloadFinal2', p2.final.toFixed(4));
    const keep2=XX._s.failBonus; XX._s.failBonus=0;
    const b2=XX._breakParts(null,false,false); XX._s.failBonus=keep2;
    L('reloadDelta2', (p2.final-b2.final).toFixed(4));
    /* 主页钮与确认弹窗同源 */
    XX._render();
    const badge=document.getElementById('sc-break-badge');
    L('badgeTxt', badge ? badge.textContent : 'none');
    try{ XX._openBreakConfirm(); }catch(e){}
    await sleep(50);
    const partsEl=document.getElementById('bc-parts');
    L('confirmPartsHasFail', partsEl && partsEl.textContent.indexOf('失败积累')>=0 ? 'yes' : 'no:' + (partsEl?partsEl.textContent.slice(0,120):'none'));
    Math.random=real;
  }catch(e){ L('EXC', (e.stack||e.message||'').toString().slice(0,200)); }
  const d=document.createElement('pre'); d.id='diag'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>`;
const f = path.join(PAGE.SCRATCH, '._b7f_probe.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', DIAG + '</body>'), 'utf8');
const ud = path.join(PAGE.SCRATCH, 'xxb7f' + Date.now());
let dom = '';
try {
  dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--user-data-dir=' + ud, '--virtual-time-budget=8000', '--window-size=430,900',
    '--dump-dom', 'file:///' + f.replace(/\\/g, '/')],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) { dom = (e.stdout || '') + ''; }
const m = dom.match(/<pre id="diag">([\s\S]*?)<\/pre>/);
console.log(m ? m[1] : 'DIAG NOT FOUND');
try { fs.rmSync(f, { force: true }); } catch (e) {}
try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}