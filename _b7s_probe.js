'use strict';
/* batch7 背包堆叠探针：老档散件合并对账 / 堆叠键 / 容量按格 / 增减 */
const fs = require('node:fs'), path = require('node:path');
const { execEdge } = require('./tools/edge-run');
const PAGE = require('./tools/page'); PAGE.use(__dirname);
const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => claimed[id] = t);
const bag = [];
for(let i = 0; i < 12; i++) bag.push({ t: 'mat_bone', n: '兽骨' });
for(let i = 0; i < 5; i++) bag.push({ t: 'mat_core', n: '妖丹' });
for(let i = 0; i < 3; i++) bag.push({ t: 'dan1', n: '下品丹药' });
bag.push({ t: 'eq_chixiao', n: '赤霄剑' });
bag.push({ t: 'eq_chixiao', n: '赤霄剑' });
const seedObj = { name: '青玄子', sex: 'm', gender: 'male', robe: 'bai', rank: 8, exp: 0, stone: 9000, herb: 50, ore: 50, cave: 1, dan: 1, forge: 1, dao: 0, rootIdx: 1, gong1: 3, gong2: 0, gong3: 0, field: 1, mine: 1, weapon: 3, weaponLv: 2, bagSize: 20, tower: 1, towerMax: 1, petSlots: 1, wisdom: 0, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0, herb100: 0, herb10000: 0, log: [], bag: bag, recipeN: {}, mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 }, stats: { sit: 5, herb: 5, train: 3, enlight: 1, craftPill: 1, explore: 1, hunt: 1, enhance: 0, stoneEarned: 0, farmN: 0 }, plots: [], pets: [], eggs: [], arena: { day: '', left: 3, foes: [], tier: 1, win: 0, lose: 0, rep: 0, proxyDay: '' }, union: { start: t, day: '', left: 1, merit: 0, claimed: [], season: 1 }, sign: { days: 0, last: '' }, secret: { prog: [1, 0, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0, enc: { t: 0, bubble: null, lastId: '', seen: {} }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed: claimed }, equipment: { weapon: null, armor: null, accessory: null }, shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 }, market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 }, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', gate: { lv: 1, grad: 0, disciples: [] }, coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 }, lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 }, unlocks: [], blueprints: {}, bpShop: { week: '', bought: 0 }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 12 }, trail3: { i: 3 }, life: { age: 40, on: true, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null }, mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, guide: { step: 0, done: true, skipped: true, started: true, flags: {}, rewardClaims: {}, toldSystems: {} }, art: { bg: 1, brk: 0, cai: 0 }, last: t };
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(seedObj)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const DIAG = `
<script>
(async function(){
  const out=[], L=(k,v)=>out.push(k+'='+v);
  await new Promise(r=>setTimeout(r,700));
  try{
    const S=XX._s;
    const m=XX._bagMerge();
    L('merge', JSON.stringify(m));
    L('totalBefore', String(m && m.beforeItems));
    L('totalAfter', String(m && m.afterItems));
    L('slotsBefore', String(m && m.beforeSlots));
    L('slotsAfter', String(m && m.afterSlots));
    L('boneQty', String(XX._countItem('mat_bone')));
    L('coreQty', String(XX._countItem('mat_core')));
    L('dan1Qty', String(XX._countItem('dan1')));
    L('eqSlots', String(S.bag.filter(x=>x.t==='eq_chixiao').length));
    L('eqQty', S.bag.filter(x=>x.t==='eq_chixiao').map(x=>XX._bagQty(x)).join(','));
    /* 同键并格不占新格 */
    const slots0=S.bag.length;
    XX._bagAdd('mat_bone','兽骨',3);
    L('addMergedSlots', String(S.bag.length));
    L('addMergedDelta', String(S.bag.length - slots0));
    L('boneQtyAfterAdd', String(XX._countItem('mat_bone')));
    /* 容量按格：满格时已有同键可并、新品类不可 */
    const keep=S.bag;
    S.bag=[]; for(let i=0;i<XX._s.bagSize;i++) S.bag.push({t:'mat_bone',n:'兽骨',q:1});
    const cap=XX._s.bagSize;
    L('capSlots', String(S.bag.length));
    L('canMergeFull', XX._bagCanAccept('mat_bone') ? 'yes' : 'no');
    L('canNewFull', XX._bagCanAccept('dan2') ? 'yes' : 'no');
    S.bag=keep;
  }catch(e){ L('EXC',(e.stack||e.message||'').toString().slice(0,200)); }
  const d=document.createElement('pre'); d.id='diag'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>`;
const f = path.join(PAGE.SCRATCH, '._b7s_probe.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', DIAG + '</body>'), 'utf8');
const ud = path.join(PAGE.SCRATCH, 'xxb7s' + Date.now());
let dom = '';
try {
  dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--user-data-dir=' + ud, '--virtual-time-budget=5000', '--window-size=430,900',
    '--dump-dom', 'file:///' + f.replace(/\\/g, '/')],
    { encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) { dom = (e.stdout || '') + ''; }
const mm = dom.match(/<pre id="diag">([\s\S]*?)<\/pre>/);
console.log(mm ? mm[1] : 'DIAG NOT FOUND');
try { fs.rmSync(f, { force: true }); } catch (e) {}
try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}