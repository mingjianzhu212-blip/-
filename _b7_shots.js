'use strict';
/* 外部评审小批单 2026-11-23 实拍：战斗 / 突破 / 遮挡 / 寿元 / 设施纯数据 */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js'); const { execEdge } = require('./tools/edge-run.js'); PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const OUT = path.join('D:/xx-scratch/log/batch7_review_20261123/shots');
fs.mkdirSync(OUT, { recursive: true });
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => claimed[id] = t);
const base = { name: '青玄子', sex: 'm', gender: 'male', robe: 'bai', rank: 8, exp: 0, stone: 9000, herb: 50, ore: 50, cave: 1, dan: 1, forge: 1, dao: 0, rootIdx: 1, gong1: 3, gong2: 0, gong3: 0, field: 1, mine: 1, weapon: 3, weaponLv: 2, bagSize: 20, tower: 1, towerMax: 1, petSlots: 1, wisdom: 0, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0, herb100: 0, herb10000: 0, log: [], bag: [], recipeN: {}, mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 }, stats: { sit: 5, herb: 5, train: 3, enlight: 1, craftPill: 1, explore: 1, hunt: 1, enhance: 0, stoneEarned: 0, farmN: 0 }, plots: [], pets: [], eggs: [], arena: { day: '', left: 3, foes: [], tier: 1, win: 0, lose: 0, rep: 0, proxyDay: '' }, union: { start: t, day: '', left: 1, merit: 0, claimed: [], season: 1 }, sign: { days: 0, last: '' }, secret: { prog: [1, 0, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0, enc: { t: 0, bubble: null, lastId: '', seen: {} }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed: claimed }, equipment: { weapon: null, armor: null, accessory: null }, shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 }, market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 }, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', gate: { lv: 1, grad: 0, disciples: [] }, coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 }, lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 }, unlocks: [], blueprints: {}, bpShop: { week: '', bought: 0 }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 12 }, trail3: { i: 3 }, life: { age: 40, on: true, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null }, mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, guide: { step: 0, done: true, skipped: true, started: true, flags: {}, rewardClaims: {}, toldSystems: {} }, art: { bg: 1, brk: 0, cai: 0 }, last: t };
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const BOOT = 'try{if(window.Tutorial)Tutorial.finish();var sm=document.getElementById("story-modal");if(sm&&!sm.classList.contains("hidden")){var sc=document.getElementById("sto-close");if(sc)sc.click();}}catch(e){}';

const shots = [
  /* A. 洞府主场景：顶栏「下次 +15%」角标 + 修为满溢 + 寿元剩余 chip */
  ['b7_cave_top_430x900.png', 430, 900, 6000, FREEZE, BOOT + `
    XX._s.rank=8; XX._s.exp=XX._needOf(8)*1.2; XX._s.failBonus=0.15;
    XX._s.life={age:100,on:true,brk:0}; XX._render();`],
  /* B. 城镇页：题签让开资源栏、右侧设置/功法圆钮让开藏经阁 */
  ['b7_town_430x900.png', 430, 900, 6000, FREEZE, BOOT + `
    if(window.switchTab) window.switchTab('town'); try{ROUTER.toScene('town');}catch(e){} XX._render();`],
  /* C. 洞府设施子页：纯数据、无按钮；底部提示条完整不被底栏切 */
  ['b7_ups_430x900.png', 430, 900, 6000, FREEZE, BOOT + `
    XX._s.rank=8; XX._s.stone=1e6; XX._s.dan=3; XX._s.forge=3; XX._render();
    ROUTER.open('dong_ups'); XX._render();
    var pp=document.querySelector('.panel-page'); if(pp) pp.scrollTop=pp.scrollHeight;`],
  /* D. 突破成功 dawn：金色粒子升腾 + 境界水墨印章（保留动画，手动置 dawn） */
  ['b7_trib_dawn_430x900.png', 430, 900, 5200, '', BOOT + `
    var m=document.getElementById('trib-modal'); if(m){ m.classList.remove('hidden'); m.setAttribute('data-phase','dawn');
      var rn=document.getElementById('trib-realm-name'); if(rn) rn.textContent='筑基初期';
      var cap=document.getElementById('trib-cap'); if(cap) cap.textContent='天劫降临 · 冲击筑基初期'; }`],
  /* E. 破境失败结算卡：补偿印章里的 X 读真实 failBonus（强制失败后等 TRIB 收尾自动弹） */
  ['b7_break_fail_430x900.png', 430, 900, 12000, '', BOOT + `
    XX._s.rank=8; XX._s.exp=XX._needOf(8)*1.2; XX._s.failBonus=0.1; XX._s.insight=25;
    XX._s.guardMirror=0; XX._s.guardArray=0; XX._s.tianji=0; XX._s.bag=[]; XX._render();
    Math.random=function(){return 0.999;}; XX._attemptBreak({});`],
  /* F. 战斗弹窗：妖兽 multiply 融底、中央「对决」消失、掉血飘字下移 */
  ['b7_battle_430x900.png', 430, 900, 6000, FREEZE, BOOT + `
    var bm=document.getElementById('battle-modal'); if(bm) bm.classList.remove('hidden');
    var host=document.querySelector('#bt-pside .bt-figure');
    if(host){ var sp=document.createElement('span'); sp.className='bt-dmg-float me'; sp.textContent='-1280'; sp.style.left='52%'; sp.style.cssText+=';animation:none!important;opacity:1!important;transform:none!important'; host.appendChild(sp); }
    var host2=document.querySelector('#bt-mside .bt-figure');
    if(host2){ var sp2=document.createElement('span'); sp2.className='bt-dmg-float'; sp2.textContent='-2460'; sp2.style.left='46%'; sp2.style.cssText+=';animation:none!important;opacity:1!important;transform:none!important'; host2.appendChild(sp2); }`],
  /* I. 人物页寿元条：与顶栏 chip 同口径（剩余年数） */
  ['b7_role_life_430x900.png', 430, 900, 6000, FREEZE, BOOT + `
    XX._s.rank=12; XX._s.life={age:570,on:true,brk:0}; XX._render();
    if(window.ROUTER) ROUTER.open('role','xx-role-equip'); XX._render();`],
  /* H. 自动产出合并飘字：从顶栏下面起，不遮灵石/矿石/战力 */
  ['b7_loot_toast_430x900.png', 430, 900, 6000, FREEZE, BOOT + `
    XX._s.rank=8; XX._render();
    var host=document.getElementById('loot-toast');
    if(host){ host.innerHTML='<div class="loot-chip good"><span>获得</span><b>灵草 ×12</b></div><div class="loot-chip"><span>获得</span><b>矿石 ×8</b></div>'; host.querySelectorAll('.loot-chip').forEach(function(c){ c.style.animation='none'; c.style.opacity='1'; c.style.transform='none'; }); }`],
  /* G. 突进定格：动画 paused + 负延迟停在 40% 帧，看 22px 位移是否落地 */
  ['b7_battle_lunge_430x900.png', 430, 900, 6000, '', BOOT + `
    var bm=document.getElementById('battle-modal'); if(bm) bm.classList.remove('hidden');
    var st=document.createElement('style');
    st.textContent='#bt-mside .bt-fig{animation:btLungeL .34s ease-out paused!important;animation-delay:-.14s!important}#bt-pside .bt-fig{animation:btHitGlow .46s ease-out paused!important;animation-delay:-.06s!important}';
    document.head.appendChild(st);`]
];

for (const [name, w, h, budget, freeze, body] of shots) {
  const f = path.join(PAGE.SCRATCH, '._b7shot_' + name + '.html');
  PAGE.writePage(f, html.replace('</head>', seed + '\n' + (freeze || '') + '\n</head>').replace('</body>',
    '<script>window.addEventListener("load",function(){setTimeout(function(){try{' + body + '}catch(e){console.error(e);}},800);});</script></body>'));
  const out = path.join(OUT, name);
  const ud = path.join('D:/xx-scratch', 'xxb7shot' + Date.now() + '_' + w);
  try {
    execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + ud,
      '--virtual-time-budget=' + budget, '--window-size=' + w + ',' + h, '--screenshot=' + out,
      'file:///' + f.replace(/\\/g, '/')], { timeout: 180000, stdio: ['ignore', 'ignore', 'pipe'] });
    console.log('截图 ' + name.padEnd(34) + (fs.existsSync(out) ? ('OK ' + fs.statSync(out).size + 'B') : 'MISS'));
  } catch (e) { console.log('截图 ' + name.padEnd(34) + 'ERR ' + (e && e.message)); }
  finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
}