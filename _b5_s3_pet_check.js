'use strict';
/* batch5 第三段2 探针：灵兽资质鉴定（甲案 · 纯展示） */
const fs = require('node:fs'), path = require('node:path'); const ROOT = __dirname;
const PAGE = require('./tools/page.js'); const { execEdge } = require('./tools/edge-run.js'); PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => claimed[id] = t);
const base = { name: '青玄子', sex: 'm', gender: 'male', robe: 'bai', rank: 15, exp: 120, stone: 100000, herb: 25, ore: 25, cave: 1, dan: 1, forge: 1, dao: 0, rootIdx: 1, gong1: 2, gong2: 0, gong3: 0, field: 0, mine: 0, weapon: 2, weaponLv: 1, bagSize: 20, tower: 0, towerMax: 0, petSlots: 3, wisdom: 0, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0, herb100: 0, herb10000: 0, log: [], bag: [], recipeN: {}, mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 }, stats: { sit: 0, herb: 0, train: 0, enlight: 0, craftPill: 0, explore: 0, hunt: 0, enhance: 0, stoneEarned: 0, farmN: 0 }, plots: [], pets: [{ bid: 'rat', lv: 1, exp: 0 }, { bid: 'crane', lv: 13, exp: 0 }, { bid: 'hundun', lv: 25, exp: 0 }], eggs: [], arena: { day: '', left: 0, foes: [], tier: 1, win: 0, lose: 0, rep: 0 }, union: { start: t, day: '', left: 1, merit: 0, claimed: [], season: 1 }, sign: { days: 0, last: '' }, secret: { prog: [0, 0, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0, enc: { t: 0, bubble: null, lastId: '' }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed: claimed }, equipment: { weapon: null, armor: null, accessory: null }, shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 }, market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 }, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', gate: { lv: 0, grad: 0, disciples: [] }, coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 }, lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 }, unlocks: [], blueprints: {}, bpShop: { week: '', bought: 0 }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 1 }, life: { age: 40, on: true, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null }, mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, guide: { step: 14, done: true, skipped: false, started: true, flags: { c_enter: true, c_sit: true, c_brk: true, c_field: true }, rewardClaims: { taixu_intro_dan_v1: true }, toldSystems: {} }, art: { bg: 1, brk: 0, cai: 0 }, last: t };
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const SCRIPT = `
  await sleep(500);
  var sm=document.getElementById('story-modal');if(sm&&!sm.classList.contains('hidden'))document.getElementById('sto-close').click();
  await sleep(300);
  var S=XX._s;
  ROUTER.open('chong');await sleep(600);
  o.rows=document.querySelectorAll('#xx-pets .pet-row').length;
  o.buttons=document.querySelectorAll('#xx-pets [data-apt]').length;
  o.hint=(document.querySelector('#page-chong .hint:last-of-type')||{}).textContent||'';
  o.apts=S.pets.map(function(p){var a=XX._petApt(p);return a?a.name:'?';});
  var want=['凡品','仙品','祖品'];
  o.allApts=[['rat',1],['jiao',13],['crane',13],['bat',13],['hundun',25]].map(function(x){
    var a=XX._petApt({bid:x[0],lv:x[1]});return a?a.name:'?';}).join(',');
  if(!(o.rows===3&&o.buttons===3&&o.apts.join(',')===want.join(',')&&o.allApts==='凡品,灵品,仙品,神品,祖品'&&o.hint.indexOf('仅作评鉴，不影响战力与产出')>=0)) o.errs.push('鉴定入口/评级异常: '+JSON.stringify(o));
  var power0=XX._power(),pets0=JSON.stringify(S.pets),stone0=S.stone;
  o.details=[];
  for(var i=0;i<3;i++){
    var b=document.querySelector('#xx-pets [data-apt="'+i+'"]');
    if(!b){o.errs.push('第 '+i+' 只无鉴定按钮');continue;}
    b.click();await sleep(250);
    var cs=document.getElementById('craft-settle');
    var txt=(document.getElementById('cs-rows')||{}).textContent||'';
    var sub=(document.getElementById('cs-sub')||{}).textContent||'';
    o.details.push({vis:cs&&!cs.classList.contains('hidden'),sub:sub,rows:txt});
    if(!(cs&&!cs.classList.contains('hidden')&&sub.indexOf('仅作评鉴，不影响战力与产出')>=0&&txt.indexOf(want[i])>=0)) o.errs.push('第 '+i+' 只鉴定页缺项: '+JSON.stringify(o.details[i]));
    document.getElementById('cs-close').click();await sleep(200);
  }
  o.noChange={power:XX._power()===power0,pets:JSON.stringify(S.pets)===pets0,stone:S.stone>=stone0-1,
    keys:S.pets.map(function(p){return Object.keys(p).sort().join(',');}).join('|')};
  if(!(o.noChange.power&&o.noChange.pets&&o.noChange.stone&&o.noChange.keys==='bid,exp,lv|bid,exp,lv|bid,exp,lv')) o.errs.push('鉴定改变了战力/存档/扣费: '+JSON.stringify(o.noChange));
  /* 重复鉴定同值（同一只升级前结果一致） */
  var a1=XX._petApt(S.pets[2]),a2=XX._petApt(S.pets[2]);
  o.same=a1.name+'/'+a1.lines.join('|')===a2.name+'/'+a2.lines.join('|');
  if(!o.same) o.errs.push('重复鉴定结果漂移');
`;
const DIAG = `(async function(){var o={ok:true,errs:[]};var sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{${SCRIPT}}catch(e){o.ok=false;o.errs.push(String(e&&e.stack||e));}
document.getElementById('diag').textContent='G='+JSON.stringify(o);})();`;
const f = path.join(PAGE.SCRATCH, '._b5s3pet.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE + '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div><script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},800);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxb5s3pet' + Date.now());
let exitCode = 1;
try {
  const out = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + ud, '--virtual-time-budget=16000', '--window-size=430,900', '--dump-dom', 'file:///' + f.replace(/\\/g, '/')], { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const r = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(r);
  let o = null; try { o = JSON.parse(r.replace(/^G=/, '')); } catch (e) {}
  const ok = !!(o && o.ok && o.errs.length === 0);
  console.log(ok ? 'B5S3-PET PASS' : 'B5S3-PET FAIL');
  exitCode = ok ? 0 : 1;
} catch (e) { console.log('ERR ' + e.message); }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
process.exit(exitCode);