'use strict';
/* batch5 第二段联调探针：真实 sect-server + 客户端上报/榜单/协力迁移 */
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const cp = require('node:child_process');
const ROOT = __dirname;
const PAGE = require('./tools/page.js'); const { execEdge } = require('./tools/edge-run.js'); PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const stamp = Date.now();
const srvLauncher = path.join('D:/xx-scratch', 'xxb5s2_' + stamp + '_srv.js');
const dataFile = path.join('D:/xx-scratch', 'xxb5s2_' + stamp + '_sect.json');
const t = stamp, claimed = {};['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => claimed[id] = t);
const base = { name: '青玄子', sex: 'm', gender: 'male', robe: 'bai', rank: 8, exp: 120, stone: 9000, herb: 25, ore: 25, cave: 1, dan: 1, forge: 1, dao: 0, rootIdx: 1, gong1: 2, gong2: 0, gong3: 0, field: 0, mine: 0, weapon: 2, weaponLv: 1, bagSize: 20, tower: 0, towerMax: 0, petSlots: 1, wisdom: 0, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0, herb100: 0, herb10000: 0, log: [], bag: [], recipeN: {}, mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 }, stats: { sit: 0, herb: 0, train: 0, enlight: 0, craftPill: 0, explore: 0, hunt: 0, enhance: 0, stoneEarned: 0, farmN: 0 }, plots: [], pets: [], eggs: [], arena: { day: '', left: 3, tier: 1, win: 0, lose: 0, rep: 0, foes: [] }, union: { start: t, day: '', left: 1, merit: 0, claimed: [], season: 1 }, sign: { days: 0, last: '' }, secret: { prog: [0, 0, 0, 0], day: '', swept: 0 }, towerDay: '', towerSwept: 0, enc: { t: 0, bubble: null, lastId: '' }, encBuff: { mult: 0, until: 0 }, miles: {}, milesNew: [], letters: [], story: { claimed: claimed }, equipment: { weapon: null, armor: null, accessory: null }, shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 }, market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 }, acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', gate: { lv: 1, grad: 0, disciples: [{ id: 'd1', name: '弟子甲', apt: 3, task: '', t0: 0, ret: 0, svc: 0, last: '', run: 0 }] }, coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 }, lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 }, unlocks: [], blueprints: {}, bpShop: { week: '', bought: 0 }, council: { day: '', n: 0, last: '' }, trail: { i: 8 }, trail2: { i: 1 }, life: { age: 40, on: true, brk: 0 }, legacy: { gens: 0, relic: null, hist: [], pick: null }, mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 }, guide: { step: 14, done: true, skipped: false, started: true, flags: { c_enter: true, c_sit: true, c_brk: true, c_field: true }, rewardClaims: { taixu_intro_dan_v1: true }, toldSystems: {} }, art: { bg: 1, brk: 0, cai: 0 }, last: t };
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(base)) + ');localStorage.setItem("hasFinishedTutorial","1");localStorage.setItem("arcade_sect_host",HOST);localStorage.setItem("arcade_sect_pid","pqa123456789");localStorage.setItem("arcade_nick","青玄子");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const SCRIPT = `
  var sleep=ms=>new Promise(r=>setTimeout(r,ms));
  await sleep(1200);
  var sm=document.getElementById('story-modal');if(sm&&!sm.classList.contains('hidden'))document.getElementById('sto-close').click();
  var gb=document.getElementById('taixu-bubble');if(gb){var sk=document.getElementById('taixu-skip');if(sk)sk.click();}
  for(var i=0;i<20&&!SECT._state().online;i++)await sleep(500);
  await sleep(2500);
  o.online=SECT._state().online;
  if(!o.online) o.errs.push('SECT 未连上本地服务');
  ROUTER.open('zong','xx-power');await sleep(1200);
  var rows=document.querySelectorAll('#sc-pw-list .sc-pw-row');
  o.board={rows:rows.length,state:(document.getElementById('sc-pw-state')||{}).textContent||'',
    txt:(document.getElementById('sc-pw-list')||{}).textContent||'',
    meRows:document.querySelectorAll('#sc-pw-list .sc-pw-row.me').length};
  if(!(o.board.rows>=2&&o.board.meRows===1&&o.board.txt.indexOf('青玄子')>=0&&o.board.txt.indexOf('旧道友')>=0)) o.errs.push('战力榜渲染异常: '+JSON.stringify(o.board));
  ROUTER.open('zong','xx-gate');await sleep(900);
  var S=XX._s;S.coopBoss={week:'',hpMax:0,dmg:0,claimed:[],parts:0};
  var sum=XX._coopSum();var b=XX._coopBoss();var own=XX._power();
  o.coop={sum:sum,own:own,hpMax:b.hpMax,expect:sum*20,
    html:((document.getElementById('sc-gate')||{}).textContent||'').indexOf('近 7 天')>=0};
  if(!(b.hpMax===o.coop.expect&&sum>=5000000&&o.coop.html)) o.errs.push('协力迁移异常: '+JSON.stringify(o.coop));
`;
const DIAG = `(async function(){var o={ok:true,errs:[],online:false,board:{},coop:{}};var sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{${SCRIPT}}catch(e){o.ok=false;o.errs.push(String(e&&e.stack||e));}
document.getElementById('diag').textContent='G='+JSON.stringify(o);})();`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function getJson(port, p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: p }, res => {
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('timeout')));
  });
}
(async function main() {
  let child = null, ud = '';
  try {
    fs.writeFileSync(srvLauncher, `'use strict';\nconst { createSectServer } = require(${JSON.stringify(path.join(ROOT, 'server', 'sect-server.js'))});\nconst s = createSectServer({ dataFile: process.argv[2] });\ns.listen(0, '127.0.0.1', () => console.log('PORT ' + s.address().port));\n`);
    const now = Date.now();
    fs.writeFileSync(dataFile, JSON.stringify({ players: {
      pold000000: { nick: '旧道友', rank: 12, seen: now, joined: now, power: 5000000, powerAt: now - 3600000,
        powerSource: 'snapshot', powerVer: 1, guardDay: '', guard: 0, pubDay: '', pub: 0, pendStone: 0, pendExp: 0, guardsAll: 0, pubsAll: 0 }
    }, requests: [], events: [] }));
    child = cp.spawn(process.execPath, [srvLauncher, dataFile], { env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }), stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server start timeout')), 8000);
      child.stdout.on('data', d => { buf += d.toString(); const m = /PORT (\d+)/.exec(buf); if (m) { clearTimeout(timer); resolve(Number(m[1])); } });
      child.stderr.on('data', d => process.stderr.write(d));
      child.on('exit', code => { if (!/PORT/.test(buf)) { clearTimeout(timer); reject(new Error('server exited ' + code)); } });
    });
    const host = 'http://127.0.0.1:' + port;
    for (let i = 0; i < 20; i++) { try { const h = await getJson(port, '/api/sect/health'); if (h.ok) break; } catch (e) {} await sleep(200); }
    console.log('LIVE server ' + host);

    ud = path.join('D:/xx-scratch', 'xxb5s2live' + stamp);
    const f = path.join(PAGE.SCRATCH, '._b5s2live.html');
    PAGE.writePage(f, html.replace('</head>', seed.replace('HOST', JSON.stringify(host)) + '\n</head>')
      .replace('</body>', FREEZE + '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div><script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},600);});</script></body>'));
    let out = '';
    try {
      out = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars', '--user-data-dir=' + ud, '--virtual-time-budget=30000', '--window-size=430,900', '--dump-dom', 'file:///' + f.replace(/\\/g, '/')], { timeout: 240000, encoding: 'utf8', maxBuffer: 1 << 26 });
    } finally { try { fs.rmSync(f, { force: true }); } catch (e) {} }
    const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
    const r = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
    console.log(r);
    let o = null; try { o = JSON.parse(r.replace(/^G=/, '')); } catch (e) {}
    const disk = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const mine = disk.players['pqa123456789'] || {};
    console.log('DISK power=' + mine.power + ' source=' + mine.powerSource + ' at=' + (mine.powerAt ? 'set' : '0') + ' ver=' + mine.powerVer);
    if (!(mine.power > 0 && mine.powerSource === 'snapshot' && mine.powerAt > 0)) (o || (o = { errs: [] })).errs.push('服务端未落战力字段: ' + JSON.stringify(mine));
    const pb = await getJson(port, '/api/sect/powerboard?pid=pqa123456789&nick=%E9%9D%92%E7%8E%84%E5%AD%90');
    console.log('BOARD total=' + pb.total + ' sum=' + pb.sum + ' fresh=' + pb.fresh + ' list=' + (pb.list || []).map(x => x.nick + ':' + x.power).join(','));
    const ok = !!(o && o.ok && o.errs.length === 0);
    console.log(ok ? 'B5S2-LIVE PASS' : 'B5S2-LIVE FAIL');
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.log('ERR ' + (e && e.stack || e)); process.exitCode = 1;
  } finally {
    if (child) { try { child.kill(); } catch (e) {} }
    try { fs.rmSync(srvLauncher, { force: true }); } catch (e) {}
    try { fs.rmSync(dataFile, { force: true }); } catch (e) {}
    if (ud) { try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
  }
})();