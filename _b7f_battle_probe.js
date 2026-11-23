'use strict';
/* batch7 跟进单第 4 项：真实战斗动效读数（突进位移 / 受击红闪 / 中央字隐藏 / 妖兽融底） */
const fs = require('node:fs'), path = require('node:path');
const { execEdge } = require('./tools/edge-run');
const PAGE = require('./tools/page'); PAGE.use(__dirname);
const ROOT = __dirname;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => claimed[id] = t);
const seedObj = { name: '青玄子', sex: 'm', gender: 'male', robe: 'bai', rank: 8, exp: 0, stone: 9000, herb: 50, ore: 50, cave: 1, dan: 1, forge: 1, dao: 0, rootIdx: 1, gong1: 3, gong2: 0, gong3: 0, field: 1, mine: 1, weapon: 3, weaponLv: 2, bagSize: 20, tower: 1, towerMax: 1, petSlots: 1, wisdom: 0, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0, herb100: 0, herb10000: 0, log: [], bag: [], recipeN: {}, mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 }, stats: { sit: 5, herb: 5, train: 3, enlight: 1, craftPill: 1, explore: 1, hunt: 1, enhance: 0, stoneEarned: 0, farmN: 0 }, plots: [], pets: [], eggs: [], arena: { day: '', left: 3, foes: [], tier: 1, win: 0, lose: 0, rep: 0, proxyDay: '' }, union: { start: t, day: '', left: 1, merit: 0, claimed: [], season: 1 }, sign: { days: 0, last: '' }, secret: { prog: [1, 0, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0, enc: { t: 0, bubble: null, lastId: '', seen: {} }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed: claimed }, equipment: { weapon: null, armor: null, accessory: null }, shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 }, market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 }, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', gate: { lv: 1, grad: 0, disciples: [] }, coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 }, lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 }, unlocks: [], blueprints: {}, bpShop: { week: '', bought: 0 }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 12 }, trail3: { i: 3 }, life: { age: 40, on: true, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null }, mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, guide: { step: 0, done: true, skipped: true, started: true, flags: {}, rewardClaims: {}, toldSystems: {} }, art: { bg: 1, brk: 0, cai: 0 }, last: t };
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(seedObj)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const DIAG = `
<script>
(async function(){
  const out=[], L=(k,v)=>out.push(k+'='+v);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  await sleep(700);
  try{
    if(window.Tutorial) Tutorial.finish();
    try{ const sm=document.getElementById('story-modal'); if(sm&&!sm.classList.contains('hidden')){ var sc=document.getElementById('sto-close'); if(sc) sc.click(); } }catch(e){}
    XX._towerEnter(); XX._render();
    await sleep(200);
    const vs=document.querySelector('.bt-vs-txt');
    L('vsTxtDisplay', vs ? getComputedStyle(vs).display : 'none-el');
    const mav=document.getElementById('bt-mavatar');
    L('mavatarBlend', mav ? getComputedStyle(mav).mixBlendMode : 'none-el');
    let chRet; try{ chRet = XX._challengeTower(); }catch(e){ L('challengeEXC', String(e).slice(0,80)); }
    /* 战斗弹窗可能延迟一拍才出现：先等它可见，再开始逐帧采样 */
    for(let i=0;i<50;i++){
      const bm=document.getElementById('battle-modal');
      if(bm && !bm.classList.contains('hidden')) break;
      await sleep(20);
    }
    {
      const bm=document.getElementById('battle-modal');
      L('prefersReduce', String(matchMedia('(prefers-reduced-motion: reduce)').matches));
      const pf0=document.querySelector('#bt-pside .bt-fig');
      L('figAnimDur', pf0 ? getComputedStyle(pf0).animationDuration : 'no-el');
      L('challengeRet', String(chRet));
      L('battleModalHidden', bm ? String(bm.classList.contains('hidden')) : 'no-el');
      L('hasPside', document.getElementById('bt-pside') ? 'yes' : 'no');
      L('lastLog', (XX._s.log && XX._s.log[0] ? String(XX._s.log[0].t||XX._s.log[0]).slice(0,60) : 'none'));
    }
    let lungeP=0, lungeM=0, hitP=0, hitM=0, maxPx=0, maxMx=0, redP=0, redM=0, samples=0;
    let firstHitFilter='', firstLungeTx='', started=false;
    await new Promise(done => {
      const tick = () => {
        samples++;
        const p=document.getElementById('bt-pside'), m=document.getElementById('bt-mside');
        const pf=document.querySelector('#bt-pside .bt-fig'), mf=document.querySelector('#bt-mside .bt-fig');
        const modal=document.getElementById('battle-modal');
        if(!p||!m||!pf||!mf||!modal||samples>400){ clearInterval(iv); done(); return; }
        if(!modal.classList.contains('hidden')) started=true;
        else if(started){ clearInterval(iv); done(); return; }
        if(p.classList.contains('lunge')) lungeP++;
        if(m.classList.contains('lunge')) lungeM++;
        if(p.classList.contains('hit')) hitP++;
        if(m.classList.contains('hit')) hitM++;
        const ptx=(getComputedStyle(pf).transform.match(/matrix\\(([^)]+)\\)/)||[])[1];
        if(ptx){ const tx=parseFloat(ptx.split(',')[4])||0; if(Math.abs(tx)>maxPx){ maxPx=Math.abs(tx); firstLungeTx=ptx; } }
        const mtx=(getComputedStyle(mf).transform.match(/matrix\\(([^)]+)\\)/)||[])[1];
        if(mtx){ const tx=parseFloat(mtx.split(',')[4])||0; if(Math.abs(tx)>maxMx) maxMx=Math.abs(tx); }
        const pfi=getComputedStyle(pf).filter||'', mfi=getComputedStyle(mf).filter||'';
        if(/195, 74, 54/.test(pfi)){ redP++; if(!firstHitFilter) firstHitFilter='P:'+pfi.slice(0,80); }
        if(/195, 74, 54/.test(mfi)){ redM++; if(!firstHitFilter) firstHitFilter='M:'+mfi.slice(0,80); }
      };
      const iv = setInterval(tick, 30);
      tick();
    });
    L('samples', String(samples));
    L('lungePlayer', String(lungeP));
    L('lungeMob', String(lungeM));
    L('maxAbsTranslatePx', maxPx.toFixed(1));
    L('maxMobTranslatePx', maxMx.toFixed(1));
    L('hitPlayer', String(hitP));
    L('hitMob', String(hitM));
    L('redFlashPlayer', String(redP));
    L('redFlashMob', String(redM));
    L('firstHitFilter', firstHitFilter || 'none-seen');
    L('firstLungeTx', firstLungeTx || 'none-seen');
  }catch(e){ L('EXC', (e.stack||e.message||'').toString().slice(0,200)); }
  const d=document.createElement('pre'); d.id='diag'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>`;
const f = path.join(PAGE.SCRATCH, '._b7f_battle.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', DIAG + '</body>'), 'utf8');
const ud = path.join(PAGE.SCRATCH, 'xxb7fb' + Date.now());
let dom = '';
try {
  dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--user-data-dir=' + ud, '--real-wait=9500', '--window-size=430,900',
    '--dump-dom', 'file:///' + f.replace(/\\/g, '/')],
    { encoding: 'utf8', timeout: 180000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) { dom = (e.stdout || '') + ''; }
const m = dom.match(/<pre id="diag">([\s\S]*?)<\/pre>/);
console.log(m ? m[1] : 'DIAG NOT FOUND');
try { fs.rmSync(f, { force: true }); } catch (e) {}
try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}