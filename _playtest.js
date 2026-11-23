'use strict';
/* ============================================================
 * _playtest.js —— 真人路径巡检（可复用，2026-10-25 第 56 节）
 *
 * 之前每一轮的"自动玩家"都是一次性脚本，跑完就删；这份把第 54/55 节的探针
 * 收在一处：以后改任何东西，一条命令就能确认"真人还走得通"。
 *
 * 用法：
 *   node _playtest.js                 跑全部场景
 *   node _playtest.js onboard paths   只跑指定场景
 *   node _playtest.js -l              只列场景
 *   node _playtest.js -v              额外打印原始探针数据（排查用）
 *
 * 四条纪律（前几轮踩出来的，写在这儿免得下次又犯）：
 *   ① 判可见性不能用 offsetParent —— .modal 是 position:fixed，恒为 null；
 *   ② 查按钮必须 scope 到 #panel-host —— 全局 querySelectorAll('button') 会点到别处；
 *   ③ 量几何前先冻结动画 —— CSS 动画不被 virtual-time 驱动，否则量到第 0 帧；
 *   ④ 结果走 <pre id="__pt"> 而不是 document.title —— 标题会被转义，长文本不可靠。
 * ============================================================ */
const { execFileSync, spawn } = require('node:child_process');
const { execEdge } = require('./tools/edge-run');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
/* 2026-10-26 用户要求：临时产物（浏览器 profile / 截图 / 中间 HTML）一律落 D 盘，不写 C 盘；D 不可用时退回系统 temp。 */
const SCRATCH = (function(){ try{ const p = 'D:/xx-scratch'; fs.mkdirSync(p, { recursive: true }); return p; }catch(e){ return os.tmpdir(); } })();

const ROOT = __dirname;
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));

if (!EDGE) {
  console.error('找不到 Edge，无法巡检。');
  process.exit(2);
}
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
/* 临时页面写 D 盘（C 盘不落盘），靠 tools/page.js 在 <head> 后补的 <base href> 把
   style.css / js/*.js 这些相对路径拉回项目根。直接写子目录而不补 base 会整片 404，
   页面里连 XX 都不存在（第 56 轮第一版就是这么空转了一轮）。 */
const PAGE = require('./tools/page');
PAGE.use(ROOT);

/* ---------------- 题签素材体检（Node 侧读 PNG 字节） ----------------
   「图有没有真的挂上」这件事在浏览器里量不可靠：--virtual-time-budget 会快过真机解码，
   100~200KB 的立绘/题签在 headless 里量 naturalWidth 得到的是假红
   （verify.js 第 86/87 节实测 3/7、4/7，结论写在它 216 行）。
   所以素材本身由 Node 判：文件在不在、是不是真 PNG、IHDR 尺寸够不够、有没有瘦成空壳。
   长得好不好看仍然归实拍管（每轮的硬约束）。 */
function hubArtScan(){
  const bad = [];
  const names = new Set();
  const dir = path.join(ROOT, 'js', 'views');
  fs.readdirSync(dir).filter(f => /\.js$/.test(f)).forEach(f => {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    (src.match(/ico:\s*'([^']+)'/g) || []).forEach(m => {
      names.add(m.replace(/^ico:\s*'/, '').replace(/'$/, ''));
    });
  });
  names.forEach(n => {
    const p = path.join(ROOT, 'ui', 'icons', n);
    let b;
    try { b = fs.readFileSync(p); } catch (e) { bad.push(n + ' 缺文件'); return; }
    if (b.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') { bad.push(n + ' 不是 PNG'); return; }
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    if (w < 64 || h < 64) { bad.push(n + ' 尺寸 ' + w + 'x' + h); return; }
    if (b.length < 2048) bad.push(n + ' 只有 ' + b.length + ' 字节（空壳？）');
  });
  return { bad: bad.join(' '), n: names.size };
}
const ART = hubArtScan();
const HUB_ART = ART.bad, HUB_ART_N = ART.n;

/* ---------------- 宗门服务（真服务，不是桩） ----------------
   「第二个真人能不能连上」这条链路只有真 HTTP 才验得了：sect 场景里两个 pid 互相护法、结算、领取。
   服务必须跑在**独立子进程**里，不能 in-process：本文件跑页面用的是 execFileSync（同步阻塞），
   Edge 运行期间整个 Node 事件循环被冻住，同进程的 http server 没机会 accept/响应 → 页面 fetch 永远挂起。
   子进程有独立事件循环，父进程阻塞时它照常服务。就绪信号走 stdout 的 `SECT_READY <url>`。
   服务起不来就让那场断言全红，不静默跳过——静默跳过等于把联网功能当没测过。 */
const SECT_DATA = path.join(SCRATCH, 'pt_sect_' + process.pid + '.json');
const SECT_RUNNER = path.join(__dirname, 'tools', 'sect-server-run.js');
let SECT_CHILD = null, SECT_URL = '', SECT_ERR = '';
function sectStart() {
  return new Promise(res => {
    try {
      SECT_CHILD = spawn(process.execPath, [SECT_RUNNER], {
        env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1', SECT_DATA }),
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (e) { SECT_ERR = String((e && e.message) || e); return res(); }
    let buf = '';
    SECT_CHILD.stdout.on('data', d => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line.startsWith('SECT_READY ')) { SECT_URL = line.slice('SECT_READY '.length).trim(); res(); }
        else if (line.startsWith('SECT_ERR ')) { SECT_ERR = line.slice('SECT_ERR '.length).trim(); res(); }
      }
    });
    SECT_CHILD.on('exit', code => { if (!SECT_URL && !SECT_ERR) { SECT_ERR = '子进程提前退出 code=' + code; res(); } });
    /* 兜底：起不来也只等 8 秒，让断言去报「服务没起」，别把整个套件卡死 */
    setTimeout(() => { if (!SECT_URL && !SECT_ERR) { SECT_ERR = '服务子进程启动超时'; res(); } }, 8000);
  });
}
function sectStop() {
  try { if (SECT_CHILD) SECT_CHILD.kill(); } catch (e) {}
  try { fs.rmSync(SECT_DATA, { force: true }); } catch (e) {}
}

/* ---------------- 存档基底 ---------------- */
/* 一份"刚出新手村"的完整档：字段按 load() 的白名单逐个给，缺字段会走默认值而掩盖问题 */
function baseSave() {
  const t = Date.now();
  return {
    name: '巡检', sex: 'm', gender: 'male', robe: 'bai',
    rank: 1, exp: 260, stone: 8600, cave: 2, dan: 1, forge: 0, dao: 0, rootIdx: 2,
    gong1: 1, gong2: 0, gong3: 0, field: 3, mine: 1, herb: 66, ore: 14,
    weapon: 1, weaponLv: 0, bagSize: 20, tower: 1, towerMax: 1, petSlots: 1,
    wisdom: 120, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0,
    herb100: 0, herb10000: 0, log: [], bag: [], recipeN: {},
    mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 },
    stats: { sit: 1, herb: 0, train: 0, enlight: 0, craftPill: 0, explore: 0, hunt: 0,
             enhance: 0, stoneEarned: 0, farmN: 0 },
    pets: [], eggs: [], plots: [],
    arena: { day: '', left: 3, tier: 0, win: 0, lose: 0, rep: 40, foes: [] },
    union: { start: t, day: '', left: 0, merit: 0, claimed: [], season: 1 },
    sign: { days: 1, last: '' },
    secret: { prog: [1, 0, 0, 0], day: '', swept: 0 },
    towerDay: '', towerSwept: 0,
    enc: { t: 0, bubble: null, lastId: '' }, encBuff: { mult: 0, until: 0 },
    miles: {}, milesNew: [], letters: [],
    story: { claimed: {} },
    equipment: { weapon: null, armor: null, accessory: null },
    shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 },
    market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 },
    questsDone: [], bossKilled: {}, acts: { sit: 0, herb: 0, train: 0, enlight: 0 }, actDay: '',
    /* 纸签两轨默认标成已走完：其余场景在精确比 stone / exp，
       别让"道途第 N 程"的奖励半路入账。纸签自己的场景（trail / trail2）各自重置。 */
    trail: { i: 8 }, trail2: { i: 12 },
    /* 轮回（第 107 轮）：gen 0 = 初世，纸签不出现在任何旧场景里 */
    trail3: { i: 0, gen: 0 },
    last: t
  };
}
/* 主线 24 段全领：用于"只想测别的东西"的场景（否则剧情浮片会盖住面板） */
function allClaimed() {
  const t = Date.now(), c = {};
  ['1-1','1-2','1-3','1-4','1-4b','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5',
   '4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { c[id] = t; });
  return c;
}
const midSave = () => Object.assign(baseSave(), {
  name: '中段', rank: 8, exp: 20000, stone: 500000, cave: 4, dan: 3, forge: 2,
  field: 5, mine: 4, herb: 300, ore: 200, weapon: 2, weaponLv: 3,
  tower: 1, towerMax: 3, petSlots: 2, eggs: [{ bid: 'rat' }],
  secret: { prog: [2, 0, 0, 0], day: '', swept: 0 },
  story: { claimed: allClaimed() }
});

/* ---------------- 页内工具（注入到每个场景） ---------------- */
const HELPERS = `
window.__pt = {};
window.__ptDone = function(o){
  var p = document.getElementById('__pt');
  if(!p){ p = document.createElement('pre'); p.id = '__pt'; p.style.display = 'none'; document.body.appendChild(p); }
  p.textContent = JSON.stringify(o).replace(/</g, '\\u003c');
};
/* 场景里的回调是异步的，外层 try/catch 抓不到 —— 用全局兜底，否则只会看到"超时" */
window.onerror = function(m, u, l){
  try{ __ptDone({ __err: String(m) + '  @' + l }); }catch(e){}
  return false;
};
/* 可见性：不能用 offsetParent（.modal 是 fixed，恒为 null） */function __vis(id){
  var e = document.getElementById(id);
  if(!e) return false;
  if(e.classList.contains('hidden')) return false;
  var cs = getComputedStyle(e);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}
function __sh(sel){
  var e = document.querySelector(sel);
  if(!e) return false;
  if(e.classList.contains('hidden')) return false;
  var cs = getComputedStyle(e);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}
/* 点击：默认 scope 到 #panel-host —— 全局找按钮会点到页面上别处 */
function __click(sel, scope){
  var root = document.querySelector(scope || '#panel-host');
  if(!root) return 'NOSCOPE';
  var e = root.querySelector(sel);
  if(!e) return 'NOSEL';
  if(e.disabled) return 'DISABLED';
  e.click();
  return 'ok';
}
function __clickTxt(t, scope){
  var root = document.querySelector(scope || '#panel-host');
  if(!root) return 'NOSCOPE';
  var bs = root.querySelectorAll('button');
  for(var i = 0; i < bs.length; i++){
    if(bs[i].textContent.replace(/\\s+/g, '').indexOf(t) >= 0 && !bs[i].disabled){ bs[i].click(); return 'ok'; }
  }
  return 'NOSEL';
}
/* 把挡路的弹出层挨个点掉（巡检里的"自动玩家"手） */
function __clearPopups(){
  if(__vis('trib-modal')) return (__click('#trib-skip', 'body') || 'x'), 1;
  if(__vis('break-modal')) return (__click('#b-close', 'body') || 'x'), 1;
  if(__vis('battle-modal')){ var s = document.querySelector('.bt-skip'); if(s){ s.click(); return 1; } }
  if(__vis('hatch-modal')){ var h = document.getElementById('hatch-close'); if(h){ h.click(); return 1; } }
  if(__vis('story-modal')){ var c = document.getElementById('sto-close'); if(c){ c.click(); return 1; } }
  return 0;
}
`;

/* ---------------- 场景 ---------------- */
const SCENARIOS = [
  /* ① 存档里 bubble:null（绝大多数档的常态）不能让 load() 中途抛错 */
  {
    id: 'reload', name: '存档完整回读（bubble:null）', budget: 6000, size: '720,1000',
    save() {
      const s = baseSave();
      s.name = '回归档'; s.rank = 12; s.cave = 0;         /* cave 0 → 主线卡在 1-2，页面别乱动 */
      s.enc = { t: 0, bubble: null, lastId: 'beggar' };
      s.arena.rep = 777;
      s.story = { claimed: { '1-1': 123 } };
      return s;
    },
    body: `setTimeout(function(){
      var S = XX._s;
      __ptDone({ name: S.name, rank: S.rank, rep: S.arena.rep,
        st: Object.keys((S.story || {}).claimed || {}).length });
    }, 900);`,
    checks(d) {
      return [
        { ok: d.name === '回归档', label: 'load() 一路走到尾（名字读回）', detail: d.name },
        { ok: d.rep === 777, label: 'arena 读回（排在 encClean 之后的字段）', detail: String(d.rep) },
        { ok: d.st === 1, label: '主线已领记录读回', detail: String(d.st) }
      ];
    }
  },

  /* ② 真人开局：创角（含道途四选一）→ 现行引导七步 → 打坐 → 突破 → 渡劫 → 结算 → 灵田 → 识人收尾
     ⚠️ 换代重写（制作人拍板 2026-11-13，落码第 5 项）：旧夹具认的是 tut-mask / tut-btn /
     localStorage.hasFinishedTutorial，这三样在现行 DOM 与存档里都不存在了；而且创角那一下没点道途，
     confirmChar 在 game.js:11579 直接 return，弹窗关不掉 → boot 走不下去 → #sc-break 压根不出现，
     于是三条检查一起红（境界 0 / 标记 null / 主线没接上）。现行口径：S.guide 是引导状态，
     #taixu-bubble 是气泡，七步按 step 索引逐条真点，收工条件 = S.guide.done。 */
  {
    id: 'onboard', name: '真人开局全链路（全新档）', budget: 26000, size: '900,1200', fresh: true,
    body: `
      var MODS = ['battle-modal','break-modal','trib-modal','story-modal','off-modal','hatch-modal'];
      var O = { ov: [], refuel: 0, stone: 0, steps: [], got: 0 };
      var seen = {};
      setInterval(function(){
        var on = MODS.filter(__vis);
        if(on.length > 1){
          var k = on.join('+');
          if(!seen[k]){ seen[k] = 1; O.ov.push(k); }
        }
      }, 150);
      var STEP = ['enter.a','enter.b','sit','sit.b1','sit.b2','brk.pre','brk','field.intro','field.joke','field','bag','flash.a','flash.b','handoff'];
      /* 2026-11-20 B1 乙案 14 拍：台词拍点击气泡推进，动作拍走真按钮 */
      var ACT_IDS = { sit: 1, brk: 1, field: 1, handoff: 1 };
      var t = 0, lastStep = -99;
      function gstep(){ return XX._s.guide ? XX._s.guide.step : -1; }
      function fin(why){
        O.done = 1;
        var g = XX._s.guide || {};
        var bub = document.getElementById('taixu-bubble');
        var tr = document.getElementById('sc-trail');
        __ptDone({ why: why, rank: XX._s.rank, brk: O.got, refuel: O.refuel, stoneGiven: O.stone,
          gdone: g.done === true, gskipped: g.skipped === true, gstep: g.step,
          gflags: Object.keys(g.flags || {}).sort().join('+'),
          bub: !bub ? 'nodom' : (bub.style.display === 'none' ? 'hidden' : 'shown'),
          locks: document.querySelectorAll('.guide-locked').length,
          trail: !tr ? 'noEl' : (tr.hidden ? 'hidden' : 'shown'),
          legacy: localStorage.getItem('hasFinishedTutorial'),
          dan: (XX._s.bag || []).filter(function(x){ return x && x.t === 'dan1'; }).length,
          steps: O.steps, ov: O.ov, claimed: Object.keys(XX._s.story.claimed || {}) });
      }
      setInterval(function(){
        if(O.done) return;
        t += 200;
        if(t > 21000){ fin('cap'); return; }
        if(typeof XX === 'undefined' || !XX._s) return;
        if(__vis('char-modal')){
          if(!document.querySelector('#char-path-picks .char-pick.active'))
            O.path = __click('#char-path-picks .char-pick[data-path]', 'body');
          var ni = document.getElementById('char-name'); if(ni) ni.value = '问心';
          __click('#char-confirm', 'body');
          return;
        }
        if(__clearPopups()) return;
        var st = gstep();
        if(st !== lastStep){ lastStep = st; O.steps.push(STEP[st] || ('s' + st)); }
        if(XX._s.guide && XX._s.guide.done){ fin('done'); return; }
        var id = STEP[st];
        if(!ACT_IDS[id]){
          /* 台词拍：点气泡继续（与真人操作同路径） */
          var bb = document.getElementById('taixu-bubble');
          if(bb) bb.click();
          return;
        }
        if(id === 'sit'){ __click('#sc-acts .cave-act[data-k="sit"]', 'body'); return; }
        if(id === 'brk'){
          var need = XX._need(XX._s.rank);
          if(XX._s.exp < need){ XX._s.exp = need + 60; O.refuel++; XX._render(); }
          if(!O.got){
            /* D-5 控骰（第 4 单批复·方案①，2026-11-14）：attemptBreakthrough 里那句 if(Math.random() < p) 是真掷骰，
               炼气段 p = 0.90（BREAK_TIERS[0].base，下限 BAL.breakMin = 0.05），不控骰就是「同码同档一遍绿一遍红」
               （改前实测 1/10、2/16）。只在点这一拍把骰子钉成 0（breakChanceWith 出口有 Math.max(breakMin, …) 兜底，
               所以 0 恒小于任何段的 p），点完当场还原 —— 写法照本文件「巡检不掷骰」「率 95% 上限，必成」两支先例。
               判据一条没放宽：O.got 记的还是「真点成了那颗钮」，rank 涨没涨仍由本场景 checks(d) 第一条自己判。 */
            var brkRnd = Math.random; Math.random = function(){ return 0; };
            var brkHit = __click('#sc-break', 'body');
            /* 阶段三 S2：确认页弹出后，再点 #bc-ok 才真破。
               判据从「按钮存在且未禁用」收紧成「确认页真的开着且按钮未禁用」：
               初始 #bc-ok 已带 disabled（R-S2-a 顺手补），开页时按「够不够破」重新算；
               而 confirmBreakNow 自 R-S2-a 起也有 hidden 早退 —— 但这里仍显式判非 hidden，
               不把「UI 的 disabled」当成流程契约，避免 #sc-break 走直破分支时多点一下。 */
            var bcm = document.getElementById('break-confirm-modal');
            var bc = document.getElementById('bc-ok');
            if(bcm && !bcm.classList.contains('hidden') && bc && !bc.disabled) bc.click();
            Math.random = brkRnd;
            if(brkHit === 'ok') O.got = 1;
          }
          return;
        }
        if(id === 'field'){
          __click('#sc-field', 'body');
          var buy = document.getElementById('xx-field-buy');
          if(buy && buy.disabled && XX._s.stone < 20000){ XX._s.stone = 20000; O.stone++; XX._render(); }
          __click('#xx-field-buy', 'body');
          if(__click('#xx-plots .plot.empty', 'body') === 'ok') O.planted = 1;
          return;
        }
        if(id === 'handoff'){
          if(!document.getElementById('npc-topics')){
            if(!O.roleHub){ __click('.scene-tab[data-tab="role"]', 'body'); O.roleHub = 1; return; }
            __click('[data-role-jump="xx-role-npc"]', '#panel-host');
          }
          return;
        }
      }, 200);
    `,
    checks(d) {
      return [
        { ok: Number(d.rank) >= 1 && d.brk === 1 && d.gskipped === false,
          label: '点【突破】真的突破成功（现行引导不拦自己让点的那颗钮）',
          detail: '境界 ' + d.rank + ' / 突破点击 ' + d.brk + ' / 跳过 ' + d.gskipped },
        { ok: d.gdone === true && (d.bub === 'hidden' || d.bub === 'nodom') && Number(d.locks) === 0 && d.legacy === null,
          label: '突破结算能关、现行引导走完并落标记（S.guide.done，旧 localStorage 标记不再写）',
          detail: 'done ' + d.gdone + ' / 气泡 ' + d.bub + ' / 灰置 ' + d.locks + ' / 旧标记 ' + d.legacy +
                  ' / 收工 ' + d.why + ' / 步序 ' + (d.steps || []).join('>') },
        { ok: (d.ov || []).length === 0, label: '全程没有两个弹窗同时压着',
          detail: (d.ov || []).join(' / ') || '无叠加' },
        { ok: (d.claimed || []).length >= 1 && d.dan === 1 && d.trail === 'shown',
          label: '引导结束后主线立刻接上（赠丹落背包、纸签露头）',
          detail: (d.claimed || []).join(',') + ' / 丹 ' + d.dan + ' / 纸签 ' + d.trail }
      ];
    }
  },

  /* ③ 中段四条真点击：爬塔 / 扫荡 / 炼丹 / 孵蛋 */
  {
    id: 'paths', name: '中段真点击（塔·扫荡·炼丹·孵蛋）', budget: 16000, size: '900,1200',
    save: midSave,
    body: `
      var E = [];
      function snap(){
        var S = XX._s;
        return { tower: S.tower, bag: S.bag.length, eggs: S.eggs.length, pets: S.pets.length,
                 herb: S.herb, alch: S.mastery.alchemyExp };
      }
      /* 战斗演出/孵化演出会自己弹，巡检得先把它点掉再量 */
      setInterval(__clearPopups, 200);
      function step(name, open, fn, wait){
        ROUTER.open(open);
        setTimeout(function(){
          var b = snap(), res = fn();
          setTimeout(function(){
            var a = snap(), ch = [];
            ['tower','bag','eggs','pets','herb','alch'].forEach(function(k){
              if(b[k] !== a[k]) ch.push(k + ':' + b[k] + '→' + a[k]);
            });
            E.push({ n: name, res: res, ch: ch });
          }, wait);
        }, 700);
      }
      /* 2026-11-17 逐层爬塔：点「挑战本层」直接打当前层妖兽，胜则推进一层 */
      setTimeout(function(){ step('塔·挑战本层', 'tower', function(){
        return __click('[data-act="fight"]');
      }, 3200); }, 0);
      setTimeout(function(){ step('塔·扫荡', 'tower', function(){ return __click('[data-act="sweep"]'); }, 1400); }, 5200);
      setTimeout(function(){ step('炼丹', 'dong_alchemy', function(){ return __clickTxt('炼制'); }, 1200); }, 8000);
      setTimeout(function(){ step('孵蛋', 'chong', function(){ return __click('[data-hatch="0"]'); }, 1600); }, 11000);
      setTimeout(function(){ __ptDone({ steps: E }); }, 14500);
    `,
    checks(d) {
      const get = n => (d.steps || []).find(x => x.n === n) || { res: '?', ch: [] };
      const okStep = (n) => { const s = get(n); return s.res.split('/').every(x => x === 'ok') && (s.ch || []).length > 0; };
      return [
        { ok: okStep('塔·挑战本层'), label: '爬塔：挑战本层，真的推进一层', detail: get('塔·挑战本层').res + ' ' + (get('塔·挑战本层').ch || []).join(' ') },
        { ok: get('塔·扫荡').res === 'ok', label: '扫荡：可点', detail: get('塔·扫荡').res },
        { ok: okStep('炼丹'), label: '炼丹：出丹、耗材减少', detail: get('炼丹').res + ' ' + (get('炼丹').ch || []).join(' ') },
        { ok: okStep('孵蛋'), label: '孵蛋：蛋减一、灵兽加一', detail: get('孵蛋').res + ' ' + (get('孵蛋').ch || []).join(' ') }
      ];
    }
  },

  /* ③b 丹方旁支（第 69 节）：炼满炉数 → 参透 → 换材料炼同一枚丹 */
  {
    id: 'recipe', name: '丹方旁支（炼满炉数 → 参透 → 换材料）', budget: 12000, size: '900,1200',
    save() {
      const s = midSave();
      s.dan = 7; s.mastery.alchemyLv = 5; s.stone = 1e6;
      s.herb = 9999; s.herb100 = 9999; s.herb10000 = 9;
      s.recipeN = { dan1: 4 };                 /* 差一炉就参透 */
      s.bag = [{ t: 'mat_core', n: '妖丹' }];
      return s;
    },
    body: `
      setInterval(__clearPopups, 200);
      ROUTER.open('dong_alchemy');
      setTimeout(function(){
        var S = XX._s;
        var alt0 = document.querySelectorAll('#xx-alchemy .craft.alt').length;
        var codex0 = (document.querySelector('.recipe-codex') || {}).textContent || '';
        var exp0 = S.mastery.alchemyExp;
        var real = Math.random; Math.random = function(){ return 0; };   /* 巡检不掷骰 */
        var r1 = __click('#xx-alchemy .craft[data-recipe="dan1"] > button');
        setTimeout(function(){
          var alt1 = document.querySelectorAll('#xx-alchemy .craft.alt').length;
          var codex1 = (document.querySelector('.recipe-codex') || {}).textContent || '';
          /* 堆叠后按「件数」对账，不按格数 */
          var bagBefore = XX._countItem('dan1');
          var coreBefore = XX._countItem('mat_core');
          var n1 = (S.recipeN || {}).dan1;
          var r2 = __click('#xx-alchemy .craft.alt button');
          setTimeout(function(){
            Math.random = real;
            __ptDone({
              alt0: alt0, codex0: codex0, r1: r1,
              alt1: alt1, codex1: codex1, n1: n1,
              bagBefore: bagBefore, coreBefore: coreBefore, r2: r2,
              bagAfter: XX._countItem('dan1'),
              coreAfter: XX._countItem('mat_core'),
              n2: (S.recipeN || {}).dan1,
              expUp: S.mastery.alchemyExp > exp0,
              altName: (document.querySelector('#xx-alchemy .craft.alt b') || {}).textContent || ''
            });
          }, 900);
        }, 700);
      }, 800);
    `,
    checks(d) {
      return [
        { ok: d.alt0 === 0 && (d.codex0 || '').indexOf('丹方 0 / 5') >= 0,
          label: '4 炉时还没有旁方，丹方停在 0/5', detail: d.alt0 + ' ' + d.codex0 },
        { ok: d.r1 === 'ok' && d.n1 === 5,
          label: '第 5 炉炼完，正方炉数记到 5', detail: d.r1 + ' ' + d.n1 },
        { ok: d.alt1 === 1 && (d.codex1 || '').indexOf('丹方 1 / 5') >= 0 && (d.altName || '').indexOf('妖丹方') >= 0,
          label: '参透后多出一行旁方，丹方 1/5', detail: d.alt1 + ' ' + d.codex1 },
        { ok: d.r2 === 'ok' && d.coreAfter === d.coreBefore - 1 && d.bagAfter === d.bagBefore + 1,
          label: '真点旁方：扣妖丹、出同一枚破境丹', detail: d.coreBefore + '→' + d.coreAfter + ' / ' + d.bagBefore + '→' + d.bagAfter },
        { ok: d.n2 === 5 && !!d.expUp,
          label: '旁方不反向计数，炼制照样涨匠道经验', detail: d.n2 + ' ' + d.expUp }
      ];
    }
  },

  /* ③e 丹药四族（第 89 节）：炼丹房一页四族摆齐，再从背包真点三枚五阶丹吃下去 */
  {
    id: 'danfam', name: '丹药四族（炼丹房四段族签 · 三族各服一枚真生效）', budget: 14000, size: '900,1200',
    save() {
      const s = midSave();
      s.rank = 26; s.dan = 9; s.mine = 5;
      s.mastery = { alchemyLv: 5, alchemyExp: 0, forgeLv: 3, forgeExp: 0 };
      s.herb = 99999; s.herb100 = 9999; s.herb10000 = 99; s.ore = 9999;
      s.bag = [];
      return s;
    },
    body: `
      setInterval(__clearPopups, 200);
      var S = XX._s;
      var ids = ['jl5', 'ct5', 'fc5'];
      S.bag = ids.map(function (id) { return { t: id, n: XX._dan.all[id].name }; });
      S.danExp = { mult: 0, until: 0 }; S.danPow = { mult: 0, until: 0 }; S.danGain = { mult: 0, until: 0 };
      XX._render();
      ROUTER.open('dong_alchemy');
      setTimeout(function(){
        var pg = document.getElementById('xx-alchemy');
        var heads = pg ? pg.querySelectorAll('.dan-fam').length : 0;
        var headTxt = pg ? [].map.call(pg.querySelectorAll('.dan-fam b'), function (b) { return b.textContent; }).join(' / ') : '';
        var rows = pg ? pg.querySelectorAll('.craft').length : 0;
        var segs = pg ? pg.querySelectorAll('.dan-seg').length : 0;
        var effs = pg ? pg.querySelectorAll('.craft-eff').length : 0;
        /* 真人路径：侧栏背包 → 点格子开详情 → 详情框点服食。名字一律从丹表取，测试里不写死 */
        var bagBtn = __click('.scene-tab[data-tab="bag"]', 'body');
        setTimeout(function(){
          var gridShown = __sh('#page-bag') ? 'shown' : 'no';
          var names = ids.map(function (id) { return XX._dan.all[id].name; });
          var rate0 = XX._rate(), pow0 = XX._power(), mine0 = XX._dan.mineRate();
          var eatFirst = function () {
            var c = __click('.bag-cell[data-i="0"]', '#panel-host');
            var nm = (document.getElementById('it-name') || {}).textContent || '';
            var acts = [].map.call(document.querySelectorAll('#it-acts [data-do]'),
              function (b) { return b.getAttribute('data-do'); }).join(',');
            var eat = __click('#it-acts [data-do="eat"]', 'body');
            return { c: c, nm: nm, acts: acts, eat: eat };
          };
          var e1 = eatFirst();
          setTimeout(function(){
            var b1 = XX._dan.buff();
            var e2 = eatFirst();
            setTimeout(function(){
              var b2 = XX._dan.buff();
              var e3 = eatFirst();
              setTimeout(function(){
                var b3 = XX._dan.buff();
                var bd = XX._statBreakdown();
                var rowOf = function (list, key) {
                  var r = list.filter(function (x) { return x.label.indexOf(key) >= 0; })[0];
                  return r ? r.v : -1;
                };
                __ptDone({
                  heads: heads, headTxt: headTxt, rows: rows, segs: segs, effs: effs,
                  bagBtn: bagBtn, gridShown: gridShown, names: names,
                  e1: e1, e2: e2, e3: e3, b1: b1, b2: b2, b3: b3,
                  jlRow: rowOf(bd.exp.mults, '聚灵'), ctRow: rowOf(bd.power.mults, '淬体'),
                  rate0: rate0, pow0: pow0, mine0: mine0,
                  rateNow: XX._rate(), powNow: XX._power(), mineNow: XX._dan.mineRate(),
                  bagLeft: S.bag.length, logTop: ((S.log[0] || {}).t || '')
                });
              }, 400);
            }, 400);
          }, 400);
        }, 700);
      }, 900);
    `,
    checks(d) {
      if (d.__err) return [{ ok: false, label: '探针抛错', detail: d.__err }];
      const nm = d.names || [];
      const hasEat = a => /(^|,)eat(,|$)/.test(a || '');
      return [
        { ok: d.heads === 4 && d.headTxt === '破境族 · 九阶 / 聚灵族 · 九阶 / 淬体族 · 九阶 / 丰产族 · 九阶',
          label: '炼丹房一页四族，族头按「族 · 九阶」各带一枚母图', detail: d.heads + ' ' + d.headTxt },
        { ok: d.rows === 37 && d.segs === 37 && d.effs === 37,
          label: '36 枚正方 + 1 行旧妖丹方，行行带阶签与功效', detail: d.rows + '/' + d.segs + '/' + d.effs },
        { ok: d.bagBtn === 'ok' && d.gridShown === 'shown' && d.e1.c === 'ok' && hasEat(d.e1.acts),
          label: '侧栏背包真点得开，点格子先出详情框、框里给「服食」', detail: d.bagBtn + ' ' + d.gridShown + ' ' + d.e1.c + ' ' + d.e1.acts },
        { ok: d.e1.nm === nm[0] && d.e1.eat === 'ok' && d.b1.exp > 0 && d.jlRow > 1 && d.rateNow > d.rate0,
          label: '聚灵族一枚下肚：拆账多一条 ×1.30，修炼速率当场涨', detail: d.e1.nm + ' ' + d.jlRow + ' ' + d.rate0 + '→' + d.rateNow },
        { ok: d.e2.nm === nm[1] && d.e2.eat === 'ok' && Math.abs(d.b2.pow - 0.24) < 1e-6 &&
            Math.abs(d.ctRow - 1.24) < 1e-9 && d.powNow > d.pow0,
          label: '淬体族一枚下肚：战力乘区 +24%，与聚灵互不抢槽', detail: d.e2.nm + ' ' + d.ctRow + ' ' + d.pow0 + '→' + d.powNow },
        { ok: d.e3.nm === nm[2] && d.e3.eat === 'ok' && Math.abs(d.b3.gain - 0.9) < 1e-6 && d.mineNow > d.mine0,
          label: '丰产族一枚下肚：矿脉产出现算真的涨了', detail: d.e3.nm + ' ' + d.mine0 + '→' + d.mineNow },
        { ok: d.b3.exp > 0 && d.b3.pow > 0 && d.b3.gain > 0 && d.bagLeft === 0,
          label: '三族三槽同时在身，背包三格吃完不留残渣', detail: JSON.stringify(d.b3) + ' 剩 ' + d.bagLeft },
        { ok: (d.logTop || '').indexOf(nm[2]) >= 0 && (d.logTop || '').indexOf('90%') >= 0,
          label: '服食日志与丹表功效同一口径（不是各写各的）', detail: d.logTop }
      ];
    }
  },

  /* ③f 法器四族（第 90 节）：炼器坊一页四族摆齐，再从行上真点炼一件战器 */
  {
    id: 'artfam', name: '法器四族（炼器坊四段族签 · 真点炼一件战器）', budget: 12000, size: '900,1200',
    save() {
      const s = midSave();
      s.forge = 5; s.mastery = { alchemyLv: 3, alchemyExp: 0, forgeLv: 3, forgeExp: 0 };
      s.ore = 9999; s.stone = 1e6; s.weapon = 0; s.weaponLv = 0;
      s.art = { bg: 0, brk: 0, cai: 0 };
      s.bag = [{ t: 'mat_bone', n: '兽骨' }, { t: 'mat_bone', n: '兽骨' }, { t: 'mat_bone', n: '兽骨' }];
      return s;
    },
    body: `
      setInterval(__clearPopups, 200);
      var S = XX._s;
      XX._render();
      ROUTER.open('dong_forge');
      setTimeout(function(){
        var pg = document.getElementById('xx-forge');
        var heads = pg ? pg.querySelectorAll('.dan-fam').length : 0;
        var headTxt = pg ? [].map.call(pg.querySelectorAll('.dan-fam b'), function (b) { return b.textContent; }).join(' / ') : '';
        var headArt = pg ? [].map.call(pg.querySelectorAll('.dan-fam img'),
          function (i) { return (i.getAttribute('src') || '').replace('ui/icons/', ''); }).join(',') : '';
        var rows = pg ? pg.querySelectorAll('.craft.art').length : 0;
        var segs = pg ? pg.querySelectorAll('.dan-seg').length : 0;
        var effs = pg ? pg.querySelectorAll('.craft-eff').length : 0;
        /* craft-eff 新口径（21:59 代）：锁定行不输出 .craft-eff，改在 small 里写「需炼器坊 N 级 / 需器师 N 阶」。
           这里按「原因行前缀」认锁定行（与 _craft_fold_check.js:668 isLockRow 同一口径），不认按钮文案——
           炼器行按钮是 owned 优先（「已装备」），拿按钮当锁行身份会误判。 */
        var artRows = pg ? pg.querySelectorAll('.craft.art') : [];
        var lockRows = 0, lockBtnOff = 0, lockBtnTotal = 0, lockReasonOk = 0;
        var unlRows = 0, unlEffOk = 0, unlRateOk = 0;
        for (var ri = 0; ri < artRows.length; ri++) {
          var sm = artRows[ri].querySelector('.craft-main small');
          var t = sm ? String(sm.textContent).replace(/\s+/g, ' ').replace(/^\s*🔒?\s*/, '').trim() : '';
          var bb = artRows[ri].querySelector(':scope > button');
          if (t.indexOf('需炼器坊 ') === 0 || t.indexOf('需器师 ') === 0) {
            lockRows++;
            if (t.indexOf('（当前 ') >= 0) lockReasonOk++;
            if (bb) { lockBtnTotal++; if (bb.disabled) lockBtnOff++; }
          } else {
            unlRows++;
            var ef = artRows[ri].querySelector('.craft-eff');
            if (ef && String(ef.textContent).trim().length > 0) unlEffOk++;
            if (t.indexOf('成功率') >= 0) unlRateOk++;
          }
        }
        var pow0 = XX._power();
        var btn0 = (document.querySelector('#xx-forge .craft[data-recipe="bg1"] > button') || {}).textContent || '';
        var lqBtn0 = (document.querySelector('#xx-forge .craft[data-recipe="wp1"] > button') || {}).textContent || '';
        var rnd = Math.random; Math.random = function () { return 0.01; };   /* 率 95% 上限，必成 */
        var hit = __click('#xx-forge .craft[data-recipe="bg1"] > button', '#panel-host');
        Math.random = rnd;
        setTimeout(function(){
          var bd = XX._statBreakdown();
          var bgRow = bd.power.mults.filter(function (x) { return x.label.indexOf('战器') >= 0; })[0];
          __ptDone({
            heads: heads, headTxt: headTxt, headArt: headArt, rows: rows, segs: segs, effs: effs,
            lockRows: lockRows, lockReasonOk: lockReasonOk, lockBtnOff: lockBtnOff, lockBtnTotal: lockBtnTotal,
            unlRows: unlRows, unlEffOk: unlEffOk, unlRateOk: unlRateOk,
            btn0: btn0, lqBtn0: lqBtn0, hit: hit,
            bg: S.art.bg, lq: S.weapon, name: XX._weaponName(0),
            head1: (pg.querySelectorAll('.dan-fam')[1] || {}).textContent || '',
            btn1: (document.querySelector('#xx-forge .craft[data-recipe="bg1"] > button') || {}).textContent || '',
            lqBtn1: (document.querySelector('#xx-forge .craft[data-recipe="wp1"] > button') || {}).textContent || '',
            bgRow: bgRow ? bgRow.v : -1, pow0: pow0, powNow: XX._power(),
            logTop: ((S.log[0] || {}).t || ''), oreLeft: S.ore, boneLeft: S.bag.length
          });
        }, 500);
      }, 900);
    `,
    checks(d) {
      if (d.__err) return [{ ok: false, label: '探针抛错', detail: d.__err }];
      return [
        { ok: d.heads === 4 && d.headTxt === '灵器族 · 九阶 / 战器族 · 九阶 / 破器族 · 九阶 / 财器族 · 九阶',
          label: '炼器坊一页四族，族头按「族 · 九阶」排列', detail: d.heads + ' ' + d.headTxt },
        { ok: d.headArt === 'weapon1.png,weapon2.png,weapon3.png,weapon4.png',
          label: '四族各带一枚母图（沿用 weapon1..4，不新造图）', detail: d.headArt },
        { ok: d.rows === 36 && d.segs === 36 && d.effs === d.unlRows,
          label: '四族 × 九阶共 36 行行行带阶签；.craft-eff 只给可炼行（锁定行按新口径不输出功效）', detail: d.rows + '/' + d.segs + '/' + d.effs + '（可炼 ' + d.unlRows + ' 锁定 ' + d.lockRows + '）' },
        { ok: d.unlRows + d.lockRows === d.rows && d.unlEffOk === d.unlRows && d.unlRateOk === d.unlRows &&
            d.lockRows > 0 && d.lockReasonOk === d.lockRows && d.lockBtnOff === d.lockBtnTotal && d.lockBtnTotal === d.lockRows,
          label: 'craft-eff 二分完备：可炼行=有功效+有成功率，锁定行=有「需…（当前 …）」原因+按钮禁用，两类相加正好 36 行',
          detail: '可炼 ' + d.unlEffOk + '/' + d.unlRows + ' 功效、' + d.unlRateOk + '/' + d.unlRows + ' 成功率 | 锁定 ' +
            d.lockReasonOk + '/' + d.lockRows + ' 带原因、' + d.lockBtnOff + '/' + d.lockBtnTotal + ' 按钮禁用' },
        { ok: d.btn0 === '炼制' && d.lqBtn0 === '炼制' && d.hit === 'ok',
          label: '一阶战器与一阶灵器都能炼，按钮真点得动', detail: d.btn0 + ' ' + d.lqBtn0 + ' ' + d.hit },
        { ok: d.bg === 1 && d.lq === 0 && d.boneLeft === 0,
          label: '炼成后只写战器槽：S.art.bg=1、灵器仍是空的、兽骨三枚吃干净', detail: d.bg + ' ' + d.lq + ' ' + d.boneLeft },
        { ok: Math.abs(d.bgRow - 1.04) < 1e-9 && d.powNow > d.pow0,
          label: '战器一阶 = 战力乘区 ×1.04，拆账与实时战力同步涨', detail: d.bgRow + ' ' + d.pow0 + '→' + d.powNow },
        { ok: (d.head1 || '').indexOf('持有 1 阶') >= 0 && (d.head1 || '').indexOf('战力 +4%') >= 0,
          label: '族头当场改成「持有 1 阶 · 战力 +4%」', detail: d.head1 },
        { ok: d.btn1 === '已装备' && d.lqBtn1 === '炼制',
          label: '炼过的那一族标「已装备」，灵器族那行不被牵连', detail: d.btn1 + ' ' + d.lqBtn1 },
        { ok: (d.logTop || '').indexOf('战器') >= 0 && (d.logTop || '').indexOf('铁锋刃') >= 0,
          label: '炼制日志点名法器与效果，与面板同一口径', detail: d.logTop }
      ];
    }
  },

  /* ③c 材料账（第 73 节）：炼丹 / 炼器 / 建筑升级 / 强化都写清持有与缺口 */
  {
    id: 'ledger', name: '材料账（持有/所需 + 缺口）', budget: 7000, size: '900,1200',
    save() {
      const s = midSave();
      s.dan = 5; s.forge = 5;
      s.mastery = { alchemyLv: 5, alchemyExp: 0, forgeLv: 3, forgeExp: 0 };
      s.stone = 0; s.herb = 2; s.herb100 = 0; s.herb10000 = 0; s.ore = 0;
      s.bag = []; s.weapon = 3; s.weaponLv = 5;
      return s;
    },
    body: `
      setInterval(__clearPopups, 200);
      ROUTER.open('dong_alchemy');
      setTimeout(function(){
        var S = XX._s;
        S.stone = 0; S.herb = 2; S.ore = 0;      /* 静置 900ms 已长了点零头，读账前先归位 */
        XX._render();
        /* 第 87 轮起一个功能一页：四本账要逐页开下去读（open 里已重绘） */
        var dan = document.querySelector('#xx-alchemy .craft[data-recipe="dan1"]');
        var first = {
          dan: (dan.querySelector('small') || {}).textContent || '',
          danBtn: (dan.querySelector(':scope > button') || {}).textContent || '',
          danOff: !!(dan.querySelector(':scope > button') || {}).disabled
        };
        ROUTER.open('dong_forge');
        /* 第 90 轮起炼器坊是四族 × 九阶 = 36 行，不再是「最后一行就是极品法宝」 */
        var forge = document.querySelector('#xx-forge .craft[data-recipe="wp4"]');
        first.forge = (forge.querySelector('small') || {}).textContent || '';
        first.forgeBtn = (forge.querySelector(':scope > button') || {}).textContent || '';
        ROUTER.open('dong_ups');
        var upg = document.querySelectorAll('#xx-ups .upg')[4];
        /* 外部评审 2026-11-23 第 8 项：设施汇总改纯数据，读状态徽标（无按钮可点） */
        first.upg = (upg.querySelector('.upg-state') || {}).textContent || '';
        first.upgBtnN = upg.querySelectorAll('button').length;
        ROUTER.open('dong_enhance');
        var enh = document.querySelector('#xx-enhance .enh-cost');
        first.enh = (enh || {}).textContent || '';
        ROUTER.open('dong_alchemy');
        S.stone = 1e6; S.herb = 999; S.ore = 999;
        XX._render();
        setTimeout(function(){
          var dan2 = document.querySelector('#xx-alchemy .craft[data-recipe="dan1"]');
          var okTxt = (dan2.querySelector('small') || {}).textContent || '';
          var okBtn = (dan2.querySelector(':scope > button') || {}).textContent || '';
          S.bagSize = 1; S.bag = [{ t: 'mat_core', n: '妖丹' }];
          XX._render();
          var dan3 = document.querySelector('#xx-alchemy .craft[data-recipe="dan1"]');
          __ptDone({
            first: first,
            okTxt: okTxt, okBtn: okBtn,
            bagBtn: (dan3.querySelector(':scope > button') || {}).textContent || '',
            bagTxt: (dan3.querySelector('small') || {}).textContent || ''
          });
        }, 700);
      }, 900);
    `,
    checks(d) {
      const f = d.first || {};
      return [
        { ok: (f.dan || '').indexOf('灵草 2/5') >= 0 && (f.dan || '').indexOf('灵石 20（不足）') >= 0,
          label: '炼丹行写材料持有/所需，灵石不够标不足', detail: f.dan },
        { ok: (f.dan || '').indexOf('失败返还 30% 材料（灵石不退）') >= 0,
          label: '炼丹行在点下去之前就写明失败返还口径', detail: f.dan },
        { ok: f.danBtn === '缺料' && f.danOff === true,
          label: '缺料按钮写明「缺料」并禁用', detail: f.danBtn + ' ' + f.danOff },
        { ok: (f.forge || '').indexOf('矿石 0/200') >= 0 && (f.forge || '').indexOf('灵石 ') >= 0 && (f.forge || '').indexOf('（不足）') >= 0,
          label: '炼器行写矿石持有/所需与灵石价', detail: f.forge },
        { ok: (f.forge || '').indexOf('失败返还 30% 材料（灵石不退）') >= 0,
          label: '炼器行同样写明失败返还口径', detail: f.forge },
        { ok: f.forgeBtn === '缺料', label: '炼器缺料按钮也写「缺料」', detail: f.forgeBtn },
        { ok: f.upg === '缺灵石' && String(f.upgBtnN) === '0',
          label: '设施页纯数据（状态报「缺灵石」、无按钮可点，升级动作在各自页内）', detail: f.upg + ' / 按钮 ' + f.upgBtnN },
        { ok: (f.enh || '').indexOf('矿石 0/') >= 0 && (f.enh || '').indexOf('兽王精魄 0/1') >= 0,
          label: '强化消耗写矿石与 Boss 材料缺口', detail: f.enh },
        { ok: d.okBtn === '炼制' && (d.okTxt || '').indexOf('（不足）') < 0,
          label: '材料够了按钮回到「炼制」，不足标记消失', detail: d.okBtn + ' ' + d.okTxt },
        { ok: d.bagBtn === '背包满' && (d.bagTxt || '').indexOf('背包已满') >= 0,
          label: '背包满时按钮写「背包满」并点明原因', detail: d.bagBtn }
      ];
    }
  },

  /* ④ 面板按钮在"重绘 6 次之后"是否还活着（§44 的老问题） */
  {
    id: 'rebind', name: '面板按钮重绘后仍可点（等 3.2s）', budget: 26000, size: '900,1200',
    save: midSave,
    body: `
      var E = [];
      function snap(){
        var S = XX._s;
        return { bag: S.bag.length, stone: Math.floor(S.stone), left: S.arena.left,
                 rep: S.arena.rep, sec: S.secret.prog.join(''), days: S.sign.days,
                 pets: S.pets.length };
      }
      setInterval(__clearPopups, 200);
      var steps = [
        ['坊市·买入', 'market_goods', function(){ return __click('[data-buy]') + '/' + __click('#st-opts [data-st="ok"]', 'body'); }],
        ['论剑·切磋', 'arena_board',  function(){ return __click('[data-fight]') + '/' + __click('#st-opts [data-st="rush"]', 'body'); }],
        ['秘境·挑战', 'secret_ch0', function(){ return __click('[data-fight]') + '/' + __click('#st-opts [data-st="stone"]', 'body'); }],
        ['签到',      'event_sign',  function(){ return __click('[data-act="sign"]'); }],
        ['灵兽·孵蛋', 'chong',  function(){ return __click('[data-hatch="0"]'); }]
      ];
      var i = 0;
      function next(){
        if(i >= steps.length) return;
        var st = steps[i++];
        ROUTER.open(st[1]);
        setTimeout(function(){
          var b = snap(), res = st[2]();          /* ← 故意等 3.2 秒（跨 6 次 render）才点 */
          setTimeout(function(){
            var a = snap(), ch = [];
            ['bag','stone','left','rep','sec','days','pets'].forEach(function(k){
              if(b[k] !== a[k]) ch.push(k + ':' + b[k] + '→' + a[k]);
            });
            E.push({ n: st[0], res: res, ch: ch });
            next();
          }, 700);
        }, 3200);
      }
      setTimeout(next, 400);
      setTimeout(function(){ __ptDone({ steps: E }); }, 23000);
    `,
    checks(d) {
      const steps = d.steps || [];
      const bad = steps.filter(s => !s.res.split('/').every(x => x === 'ok') || (s.ch || []).length === 0);
      return [
        { ok: steps.length === 5, label: '五个面板都走到了（' + steps.length + '/5）', detail: steps.map(s => s.n).join(',') },
        { ok: bad.length === 0, label: '重绘 6 次后按钮仍生效',
          detail: bad.length ? bad.map(s => s.n + '=' + s.res).join(' ') : '全部生效' }
      ];
    }
  },

  /* ⑤ 剧情节奏：0→46 秒推进，看浮片是不是按拍子来 */
  {
    id: 'pace', name: '剧情节奏（0→46s 时间线）', budget: 62000, size: '900,1100',
    save() {
      const s = baseSave();
      s.name = '节奏档'; s.rank = 0; s.cave = 0; s.stone = 99999;
      s.story = { claimed: {} };
      return s;
    },
    body: `
      var T0 = Date.now(), TL = [], seen = '';
      setInterval(function(){
        var m = document.getElementById('story-modal');
        var on = m && !m.classList.contains('hidden');
        var seg = on ? (m.getAttribute('data-seg') || '') : '';
        var more = on ? ((document.getElementById('sto-more') || {}).textContent || '') : '';
        if(on && seg && seg !== seen){ seen = seg; TL.push({ ms: Date.now() - T0, seg: seg, more: more }); }
        if(!on && seen) seen = '';
      }, 150);
      /* 模拟真人推进：只在时间点改状态，不调任何 Story 内部方法 */
      [[6000, function(){ XX._s.cave = 2; }],
       [13000, function(){ XX._s.rank = 1; }],
       [22000, function(){ XX._s.towerMax = 3; }],
       [31000, function(){ XX._s.towerMax = 5; }],
       [40000, function(){ XX._s.rank = 12; XX._s.mastery.alchemyExp = 5; }]
      ].forEach(function(p){ setTimeout(p[1], p[0]); });
      /* 每 2.5 秒点掉一张（挂机玩家会随手关） */
      setInterval(function(){ var b = document.getElementById('sto-close'); if(b && __sh('#sto-close')) b.click(); }, 2500);
      setTimeout(function(){
        __ptDone({ tl: TL, claimed: Object.keys(XX._s.story.claimed || {}) });
      }, 46000);
    `,
    checks(d) {
      const tl = d.tl || [];
      const segs = tl.map(x => x.seg);
      const want = ['1-1','1-2','1-3','1-4','1-5','2-1'];
      const missing = want.filter(s => segs.indexOf(s) < 0);
      const first = tl.length ? tl[0].ms : 99999;
      /* 相邻两张的间隔：排队模型下应当 ≥ 4 秒（关掉后 460ms 接上的除外，那种是玩家亲手点） */
      return [
        { ok: first < 3000, label: '开局第一段自己弹（' + (first / 1000).toFixed(1) + 's）', detail: String(tl.length ? tl[0].seg : '-') },
        { ok: missing.length === 0, label: '46 秒里六拍全演（不静默）',
          detail: missing.length ? '漏演 ' + missing.join(',') : segs.join(' → ') },
        { ok: (d.claimed || []).length >= 6, label: '六段奖励全部结算', detail: String((d.claimed || []).length) }
      ];
    }
  },

  /* ⑥ 老档回归：一次补 15 段 → 出一张补记卡 */
  {
    id: 'merge', name: '老档一次补 15 段 → 补记卡', budget: 8000, size: '720,1100',
    save() {
      const s = baseSave();
      Object.assign(s, {
        name: '老档', rank: 12, cave: 8, towerMax: 20, farmN: 40,
        pets: [{ bid: 'rat', lv: 9, exp: 0 }], enc: { t: 0, bubble: null, lastId: 'beggar' },
        secret: { prog: [12, 3, 0, 0], day: '', swept: 0 },
        gong1: 6, gong2: 6, gong3: 6, stats: Object.assign({}, s.stats, { farmN: 40 }),
        mastery: { alchemyLv: 4, alchemyExp: 500, forgeLv: 3, forgeExp: 210 },
        story: { claimed: {} }
      });
      s.arena.win = 5;
      return s;
    },
    body: `
      setTimeout(function(){
        var m = document.getElementById('story-modal');
        var on = m && !m.classList.contains('hidden');
        __ptDone({
          shown: !!on, seg: on ? (m.getAttribute('data-seg') || '') : '',
          name: (document.getElementById('sto-name') || {}).textContent || '',
          head: (document.getElementById('sto-ch') || {}).textContent || '',
          list: (document.getElementById('sto-list') || {}).textContent || '',
          gain: (document.getElementById('sto-gain') || {}).textContent || '',
          jump: __sh('#sto-jump'),
          claimed: Object.keys(XX._s.story.claimed || {}).length
        });
      }, 2000);
    `,
    checks(d) {
      const n = (d.list || '').split('、').filter(Boolean).length;
      return [
        { ok: d.shown === true && d.seg === 'merge', label: '15 段不逐段演，改出一张补记卡', detail: d.seg || '无卡' },
        { ok: d.claimed === 15, label: '15 段全部结算（奖励不丢）', detail: String(d.claimed) },
        { ok: n === 15, label: '补记卡列全 15 个名目', detail: n + ' 条' },
        { ok: /悟道值/.test(d.gain || '') && /灵石/.test(d.gain || ''), label: '所得按类型累加（不是 15 行流水）', detail: (d.gain || '').slice(0, 40) },
        { ok: String(d.head || '').indexOf('至') >= 0, label: '抬头写明跨章范围', detail: d.head },
        { ok: d.jump === true, label: '有「去看履历」入口', detail: String(d.jump) }
      ];
    }
  },

  /* ⑦ 老档兼容：存档里没有 acts.ponder 这个键（第 58 节新增参悟之前的所有档） */
  {
    id: 'oldsave', name: '老档缺新字段（acts / wu 都没有）', budget: 9000, size: '760,1100',
    save() {
      const s = baseSave();
      s.name = '老档'; s.rank = 20; s.stone = 5e9; s.cave = 12; s.herb = 99; s.ore = 99;
      s.acts = { sit: 0, herb: 0, train: 0, enlight: 0 };   /* ← 故意缺 ponder */
      s.wisdom = 50000;                                     /* 悟道值：足够点两层，但 wu 键不存在 */
      s.actDay = '';                                        /* 逼一次跨天重置 */
      s.story = { claimed: allClaimed() };
      return s;
    },
    body: `
      setTimeout(function(){
        ROUTER.open('xiu_acts');
        setTimeout(function(){
          var b = document.querySelector('#xx-actions .act[data-k="ponder"]');
          var b0 = XX._s.stone, e0 = XX._s.exp;
          if(b) b.click();
          setTimeout(function(){
            /* 悟道树：老档没有 wu / wuPaid，面板必须照样出三行十五点、且能点 */
            ROUTER.open('role_wu');
            setTimeout(function(){
              var rows = document.querySelectorAll('#xx-role-wu .wu-row').length;
              var nodes = document.querySelectorAll('#xx-role-wu .wu-node').length;
              var foot = (document.querySelector('#xx-role-wu .wu-foot span') || {}).textContent || '';
              var wb = document.querySelector('#xx-role-wu [data-wu="dan"]');
              var wbTxt = wb ? wb.textContent.trim() : 'NOSEL';
              var wis0 = XX._s.wisdom;
              if(wb) wb.click();
              setTimeout(function(){
                __ptDone({
                  hasKey: typeof XX._s.acts.ponder,
                  n: XX._s.acts.ponder,
                  spent: XX._s.stone < b0,
                  gained: XX._s.exp > e0,
                  label: b ? (b.querySelector('small') || {}).textContent || '' : '',
                  wuRows: rows, wuNodes: nodes, wuFoot: foot, wuBtn: wbTxt,
                  wuLv: (XX._s.wu || {}).dan, wuSpent: wis0 - XX._s.wisdom
                });
              }, 300);
            }, 600);
          }, 500);
        }, 700);
      }, 400);
    `,
    checks(d) {
      return [
        { ok: d.hasKey === 'number' && isFinite(d.n), label: '跨天重置后行动次数仍是数字（不是 NaN）', detail: String(d.n) },
        { ok: d.label.indexOf('NaN') < 0, label: '参悟按钮副标题不出现 NaN', detail: d.label },
        { ok: d.spent === true && d.gained === true, label: '老档也能正常参悟（扣钱、加修为）' },
        { ok: d.wuRows === 3 && d.wuNodes === 15, label: '老档（无 wu 字段）悟道树照样出三路十五点',
          detail: d.wuRows + '/' + d.wuNodes },
        { ok: String(d.wuFoot).indexOf('NaN') < 0 && String(d.wuFoot).indexOf('悟道值') >= 0,
          label: '悟道值不显示 NaN', detail: d.wuFoot },
        { ok: d.wuLv === 1 && d.wuSpent > 0, label: '老档也能点悟道树（扣悟道值、等级 +1）',
          detail: 'lv' + d.wuLv + ' -' + d.wuSpent }
      ];
    }
  },

  /* ⑧ 山门 · 弟子（第 61 节）：老档没有 gate 字段 → 面板要能开山、收徒、派差事、到点回山
     整条链路全靠"点面板上那颗按钮"，不调内部函数——函数对不等于人手点得动。 */
  {
    id: 'gate', name: '山门弟子（开山 → 收徒 → 派差事 → 回山）', budget: 14000, size: '760,1100',
    save() {
      const s = baseSave();
      s.name = '宗主'; s.rank = 12; s.stone = 5e7; s.cave = 6; s.field = 6; s.dan = 3;
      s.story = { claimed: allClaimed() };   /* 不然剧情浮片会盖住面板 */
      delete s.gate;                          /* ← 老档：根本没有 gate 这个键 */
      return s;
    },
    body: `
      setTimeout(function(){
        ROUTER.open('zong_gate');
        setTimeout(function(){
          var build = document.querySelector('#sc-gate [data-gact="build"]');
          var built = false, st0 = XX._s.stone;
          if(build){ build.click(); built = true; }
          setTimeout(function(){
            var rec = document.querySelector('#sc-gate [data-gact="recruit"]');
            var lv = XX._gateLv();
            if(rec) rec.click();
            setTimeout(function(){
              var card = document.querySelector('#sc-gate .dcard:not(.empty)');
              var apt = card ? (card.querySelector('.dapt') || {}).textContent || '' : '';
              var d0 = XX._gateList()[0];
              var seclude = document.querySelector('#sc-gate .dact[data-gact="seclude"]');
              if(seclude) seclude.click();
              var busyNow = XX._gateBusy(XX._gateList()[0]);
              var busyCard = document.querySelectorAll('#sc-gate .dcard.busy').length;
              var leftTxt = (document.querySelector('#sc-gate [data-left]') || {}).textContent || '';
              /* 把出发时间拨回 4 小时前 → 下一次心跳（500ms）应自动结算 */
              var d1 = XX._gateList()[0];
              if(d1 && d1.task){ d1.t0 = Date.now() - 4 * 3600 * 1000 - 1000; }
              var e0 = XX._s.exp;
              setTimeout(function(){
                var dNow = XX._gateList()[0] || {};
                var log = (XX._s.log.filter(function(x){ return x.t.indexOf('弟子回山') >= 0; })[0] || {}).t || '';
                __ptDone({
                  built: built, lv: lv, spent: XX._s.stone < st0, n: XX._gateList().length,
                  apt: apt, busyNow: busyNow, busyCard: busyCard, leftTxt: leftTxt,
                  freed: !XX._gateBusy(dNow), expUp: XX._s.exp > e0, log: log,
                  btnBack: document.querySelectorAll('#sc-gate .dact').length
                });
              }, 1400);
            }, 500);
          }, 500);
        }, 500);
      }, 400);
    `,
    checks(d) {
      return [
        { ok: d.built === true && d.lv === 1 && d.spent === true, label: '老档（无 gate 字段）也能点「开山立派」并扣灵石',
          detail: 'lv' + d.lv },
        { ok: d.n === 1, label: '点「收徒」真的收进一名弟子', detail: String(d.n) },
        { ok: /凡骨|黄阶|玄阶|地阶|天阶/.test(d.apt), label: '名牒上写着资质', detail: d.apt },
        { ok: d.busyNow === true && d.busyCard === 1, label: '点「闭关」派人出去，名牒转成外表态',
          detail: String(d.busyCard) },
        { ok: /小时|分钟|秒/.test(d.leftTxt) && d.leftTxt.indexOf('0 秒') < 0, label: '外出时显示归期倒计时（不是 0 秒）',
          detail: d.leftTxt },
        { ok: d.freed === true && d.expUp === true, label: '时辰到 → 心跳自动结算、弟子回山（修为入账）' },
        { ok: /弟子回山/.test(d.log) && /修为/.test(d.log), label: '回山落一行汇总日志', detail: d.log },
        { ok: d.btnBack >= 3, label: '回山后差事三签重新出现（可以再派）', detail: String(d.btnBack) }
      ];
    }
  },

  /* ⑩ 弟子成长（第 62 节）：点资质点化 → 满六趟出师 → 门风亮起
     第一个弟子故意不带 svc 字段（第 61 节的旧档），看读档是补 0 还是整段炸掉。 */
  {
    id: 'gate2', name: '弟子成长（点化 → 出师 → 门风）', budget: 12000, size: '760,1100',
    save() {
      const s = baseSave();
      s.name = '宗主'; s.rank = 12; s.stone = 5e7;
      s.story = { claimed: allClaimed() };
      s.gate = { lv: 2, disciples: [
        { id: 'gA', name: '叶青梧', apt: 2, task: '', t0: 0, ret: 0 },
        { id: 'gB', name: '沈砚',   apt: 3, task: '', t0: 0, ret: 0, svc: 6 }
      ] };
      return s;
    },
    body: `
      setTimeout(function(){
        ROUTER.open('zong_gate');
        setTimeout(function(){
          var root = document.querySelector('#sc-gate');
          var chip0 = (root.querySelector('.dapt[data-gact="apt"]') || {}).textContent || '';
          var svcEl = root.querySelector('.dvoice .dv-n');
          var svcTxt0 = svcEl ? svcEl.textContent : '';
          var voice0 = (root.querySelector('.dvoice .dv-t') || {}).textContent || '';
          var note = (root.querySelector('.gate-note') || {}).textContent || '';
          var st0 = XX._s.stone, cost = XX._gateAptCost();
          var bless0 = XX._gateList()[0].bless | 0;      /* 存档故意没带 bless：旧档读成 0（第 67 节） */
          var aptClick = __click('#sc-gate .dapt[data-gact="apt"]');
          setTimeout(function(){
            var root2 = document.querySelector('#sc-gate');
            var chip1 = (root2.querySelector('.dapt') || {}).textContent || '';
            var aptNow = XX._gateAptOf(XX._gateList()[0]);
            var blessNow = XX._gateList()[0].bless | 0;
            var voicePost = (root2.querySelector('.dvoice .dv-t') || {}).textContent || '';
            var voiceN = root2.querySelectorAll('.dvoice').length;
            var paid = st0 - XX._s.stone;
            /* 点化当场开口（第 67 节）：log[0] 应是弟子自己的反应句 */
            var sayLog = (XX._s.log[0] || {}).t || '';
            var sayOk = /^💬 叶青梧：「/.test(sayLog);
            var sayWord = sayLog.replace(/^💬 叶青梧：「/, '').replace(/」$/, '');
            var sayInLib = sayOk && XX._gateVoiceBlessLib[aptNow - 2].indexOf(sayWord) >= 0;
            var gradBtn = root2.querySelector('[data-gact="grad"]');
            var gradTxt = gradBtn ? gradBtn.textContent : '';
            var n0 = XX._gateList().length, st1 = XX._s.stone;
            if(gradBtn) gradBtn.click();
            setTimeout(function(){
              var root3 = document.querySelector('#sc-gate');
              var log = (XX._s.log.filter(function(x){ return x.t.indexOf('出师') >= 0; })[0] || {}).t || '';
              var lastLog = (XX._s.log[0] || {}).t || '';
              var farewellPlain = lastLog.indexOf('吃用') >= 0;   /* 沈砚没被点化：告别语还是吃用那句 */
              var feng = root3.querySelector('.gate-feng');
              __ptDone({
                chip0: chip0, svcTxt0: svcTxt0, note: note, aptClick: aptClick, chip1: chip1,
                voice0: voice0, voicePost: voicePost, voiceN: voiceN,
                aptNow: aptNow, cost: cost, paid: paid,
                bless0: bless0, blessNow: blessNow, sayLog: sayLog, sayOk: sayOk, sayInLib: sayInLib,
                gradTxt: gradTxt, n0: n0, n1: XX._gateList().length,
                gainStone: XX._s.stone - st1,
                gradN: XX._gateGradN(), feng: feng ? feng.textContent : '',
                yieldTxt: (root3.querySelector('.gate-gain') || {}).textContent || '',
                log: log, farewellPlain: farewellPlain, lastLog: lastLog
              });
            }, 900);
          }, 900);
        }, 500);
      }, 400);
    `,
    checks(d) {
      return [
        { ok: d.aptClick === 'ok' && d.aptNow === 3 && Math.abs(d.paid - d.cost) <= Math.max(2, d.cost * 0.02),
              /* 这 900ms 里灵石一直在涨，读数会差出一点零头：只要求"约等于一份价" */
          label: '点资质签真的点化一档（黄阶 → 玄阶），只扣一份价', detail: d.chip1.trim() + ' · ' + Math.round(d.paid) + '/' + d.cost },
        { ok: /黄阶/.test(d.chip0) && /玄阶/.test(d.chip1),
          label: '资质签上的字跟着变', detail: d.chip0.trim() + ' → ' + d.chip1.trim() },
        { ok: /差事 0\/6/.test(d.svcTxt0) && /[\u4e00-\u9fa5]/.test(d.voice0 || '') && !/^差事 0\/6$/.test(d.voice0 || ''),
          label: '旧档（没有 svc）读成 0 趟；名牒上那句话真画出来了', detail: (d.voice0 || '') + ' · ' + d.svcTxt0 },
        { ok: !!d.voicePost && d.voicePost !== d.voice0,
          label: '点化一档之后，他说的那句话也跟着换了', detail: (d.voice0 || '') + ' → ' + (d.voicePost || '') },
        { ok: d.voiceN === 1,
          label: '只有「在山上、还没满六趟」的弟子才有这一行（满六趟那里放的是出师按钮）', detail: String(d.voiceN) },
        { ok: /点化/.test(d.note) && /灵石/.test(d.note),
          label: '名册底下那行注写着点化价与出师门槛', detail: d.note.slice(0, 30) + '…' },
        { ok: /出师/.test(d.gradTxt) && /灵石/.test(d.gradTxt),
          label: '满六趟的名牒上出现「出师」并写明回馈', detail: d.gradTxt },
        { ok: d.n1 === d.n0 - 1 && d.gradN === 1,
          label: '点「出师」后人真的走了，出师计数 +1', detail: d.n0 + ' → ' + d.n1 },
        { ok: d.gainStone > 0, label: '出师回馈当场入袋', detail: String(d.gainStone) },
        { ok: d.bless0 === 0 && d.blessNow === 1,
          label: '旧档没有 bless 读成 0，点化一次记一次（第 67 节）', detail: d.bless0 + ' → ' + d.blessNow },
        { ok: d.sayOk === true && d.sayInLib === true,
          label: '点化当场，弟子说一句自己的反应', detail: (d.sayLog || '').slice(0, 22) },
        { ok: d.farewellPlain === true,
          label: '没被点化的弟子出师，告别语还是吃用那句', detail: (d.lastLog || '').slice(0, 24) },
        { ok: /门风 \+2%/.test(d.feng) && /\+22%/.test(d.yieldTxt),
          label: '门风 +2% 亮出来，差事收益跟着涨（二品 20% → 22%）', detail: d.yieldTxt.trim() },
        { ok: /出师下山/.test(d.log), label: '落一行出师日志', detail: d.log.slice(0, 34) + '…' }
      ];
    }
  },

  /* ⑪ 弟子记事（第 65 节）：连着两趟同一件事，名牒上的话换成那件事的；
     换一件就从头数。存档故意不带 last/run（第 64 节的旧档），看读档补空不补炸。 */
  {
    id: 'gate3', name: '弟子记事（连做两趟换话 → 换差事从头数）', budget: 15000, size: '760,1100',
    save() {
      const s = baseSave();
      s.name = '宗主'; s.rank = 12; s.stone = 5e7;
      s.story = { claimed: allClaimed() };
      s.gate = { lv: 2, disciples: [
        { id: 'gA', name: '叶青梧', apt: 3, task: '', t0: 0, ret: 0, svc: 0 },
        { id: 'gB', name: '沈砚',   apt: 2, task: '', t0: 0, ret: 0, svc: 3 }
      ] };
      return s;
    },
    body: `
      var basePool = function(apt){ var out=[]; XX._gateVoiceLib[apt-1].forEach(function(p){ p.forEach(function(v){ out.push(v); }); }); return out; };
      var taskPool = function(k){ var out=[]; XX._gateVoiceTaskLib[k].forEach(function(row){ row.forEach(function(p){ p.forEach(function(v){ out.push(v); }); }); }); return out; };
      var inArr = function(a,v){ return a.indexOf(v) >= 0; };
      setTimeout(function(){
        ROUTER.open('zong_gate');
        setTimeout(function(){
          var ga = XX._gateList()[0];
          var card0 = document.querySelector('#sc-gate .dcard:not(.empty)');
          var voice0 = (card0.querySelector('.dv-t') || {}).textContent || '';
          var domMatchesFn = voice0 === XX._gateVoice(ga);
          var run0 = XX._gateRun(ga), last0 = XX._gateLast(ga);
          /* 第 1 趟采药：点真按钮 → 拨回 2 小时 → 等心跳自己结算 */
          var herb1 = document.querySelector('#sc-gate .dcard:not(.empty) .dact[data-gact="herb"]');
          if(herb1) herb1.click();
          XX._gateList()[0].t0 = Date.now() - 2 * 3600 * 1000 - 1500;
          setTimeout(function(){
            var ga1 = XX._gateList()[0];
            var card1 = document.querySelector('#sc-gate .dcard:not(.empty)');
            var voice1 = (card1.querySelector('.dv-t') || {}).textContent || '';
            var run1 = XX._gateRun(ga1), last1 = XX._gateLast(ga1), svc1 = XX._gateSvc(ga1);
            /* 第 2 趟采药：连上了 */
            var herb2 = document.querySelector('#sc-gate .dcard:not(.empty) .dact[data-gact="herb"]');
            if(herb2) herb2.click();
            XX._gateList()[0].t0 = Date.now() - 2 * 3600 * 1000 - 1500;
            setTimeout(function(){
              var ga2 = XX._gateList()[0];
              var card2 = document.querySelector('#sc-gate .dcard:not(.empty)');
              var voice2 = (card2.querySelector('.dv-t') || {}).textContent || '';
              var run2 = XX._gateRun(ga2), last2 = XX._gateLast(ga2);
              var voice2Again = XX._gateVoice(ga2);
              var sayLog = (XX._s.log[0] || {}).t || '';          /* 第 66 节：run=2 那趟弟子主动开口 */
              var sayOk = /^💬 叶青梧：「/.test(sayLog);
              var sayInLib = sayOk && XX._gateVoiceHomeLib.herb[0].indexOf(sayLog.replace(/^💬 叶青梧：「/, '').replace(/」$/, '')) >= 0;
              /* 换巡山：应该从头数 */
              var pat = document.querySelector('#sc-gate .dcard:not(.empty) .dact[data-gact="patrol"]');
              if(pat) pat.click();
              XX._gateList()[0].t0 = Date.now() - 6 * 3600 * 1000 - 1500;
              setTimeout(function(){
                var ga3 = XX._gateList()[0];
                var card3 = document.querySelector('#sc-gate .dcard:not(.empty)');
                var voice3 = (card3.querySelector('.dv-t') || {}).textContent || '';
                __ptDone({
                  apt: XX._gateAptOf(ga3),
                  voice0: voice0, domMatchesFn: domMatchesFn, run0: run0, last0: last0,
                  run1: run1, last1: last1, svc1: svc1,
                  v1inBase: inArr(basePool(XX._gateAptOf(ga1)), voice1),
                  v2inHerb: inArr(taskPool('herb'), voice2),
                  v3inBase: inArr(basePool(XX._gateAptOf(ga3)), voice3),
                  run2: run2, last2: last2, voice2: voice2, voice2Again: voice2Again,
                  sayLog: sayLog, sayOk: sayOk, sayInLib: sayInLib,
                  run3: XX._gateRun(ga3), last3: XX._gateLast(ga3), voice3: voice3,
                  domVoice3: (card3.querySelector('.dv-t') || {}).textContent || ''
                });
              }, 1100);
            }, 1100);
          }, 1100);
        }, 500);
      }, 400);
    `,
    checks(d) {
      return [
        { ok: d.run0 === 0 && d.last0 === '' && /[\u4e00-\u9fa5]/.test(d.voice0 || '') && !/^差事 \d+\/\d+$/.test(d.voice0 || ''),
          label: '旧档（没有 last/run）读成"没记事"，名牒照常说话', detail: (d.voice0 || '').slice(0, 16) },
        { ok: d.domMatchesFn === true, label: '名牒上的话与函数口径一字不差（存档变了字必须跟着变）' },
        { ok: d.run1 === 1 && d.last1 === 'herb' && d.svc1 === 1 && d.v1inBase === true,
          label: '只做一趟还不算"连着"，话仍在基础组里', detail: d.run1 + '/' + d.last1 },
        { ok: d.run2 === 2 && d.last2 === 'herb' && d.v2inHerb === true,
          label: '连做两趟采药，话换进采药那一组', detail: (d.voice2 || '').slice(0, 16) },
        { ok: d.voice2 === d.voice2Again, label: '同一状态永远同一句（不随机）' },
        { ok: d.sayOk === true && d.sayInLib === true,
          label: '连做两趟回山，弟子在日志里主动开口（第 66 节）', detail: (d.sayLog || '').slice(0, 22) },
        { ok: d.run3 === 1 && d.last3 === 'patrol' && d.v3inBase === true && d.domVoice3 === d.voice3,
          label: '换巡山一趟就从头数，话回到基础组', detail: d.run3 + '/' + d.last3 + ' · ' + (d.voice3 || '').slice(0, 12) }
      ];
    }
  },

  /* ⑨ 战斗浮字：论剑与秘境的结算 chip 真的在视口里、贴着右边距 */
  {
    id: 'chip', name: '战斗结算浮字（几何量测）', budget: 9000, size: '720,900',
    save: midSave,
    /* 只把时长归零不够：Chrome 下 0s 动画会停在 0% 帧（opacity:0、多出 18px 位移），
       量到的就是"假溢出"。这里直接钉终态。 */
    css: '.loot-chip{animation:none!important;opacity:1!important;transform:none!important}',
    body: `
      setTimeout(function(){
        ROUTER.open('arena_board');
        setTimeout(function(){
          __click('[data-fight]');
          __click('#st-opts [data-st="rush"]', 'body');
          setTimeout(function(){ try{ XX._challengeSecret(0); }catch(e){} }, 260);
          setTimeout(function(){
            var host = document.getElementById('loot-toast');
            var hb = host.getBoundingClientRect();
            var cs = [].slice.call(host.children).map(function(c){
              var r = c.getBoundingClientRect();
              return { txt: (c.textContent || '').slice(0, 30), right: Math.round(r.right),
                       op: getComputedStyle(c).opacity,
                       inView: (r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight) };
            });
            __ptDone({ n: cs.length, vw: innerWidth, hostRight: Math.round(hb.right), chips: cs });
          }, 600);
        }, 700);
      }, 400);
    `,
    checks(d) {
      const cs = d.chips || [];
      const both = cs.length >= 2;
      const inside = cs.every(c => c.inView);
      const tight = cs.every(c => c.right <= (d.vw - 8));
      return [
        { ok: both, label: '论剑与秘境各落一枚 chip', detail: cs.map(c => c.txt).join(' | ') || '无' },
        { ok: inside, label: '都在视口内（没被挤出屏幕）',
          detail: cs.map(c => 'right=' + c.right + '/vw=' + d.vw).join(' ') },
        { ok: tight, label: '右边缘贴着 10px 边距（不是溢出）', detail: 'hostRight=' + d.hostRight },
        { ok: /声望/.test((cs[0] || {}).txt || ''), label: '论剑 chip 写了所得', detail: (cs[0] || {}).txt || '' }
      ];
    }
  },

  /* ⑩ 妖踪（第 102 轮）：猎妖挂机里浮出的限时机会，真点【追击】/【放过】 */
  {
    id: 'trace', name: '妖踪限时机会（真点追击·放过·过期）', budget: 11000, size: '720,900',
    save: midSave,
    body: `
      setTimeout(function(){
        var S = XX._s, out = {};
        XX._setBattleAnim(false);          /* 演出不参与断言，省下 2.5s 对战 */
        S.rank = 8; S.huntBeast = null; S.huntProg = 0;
        XX._render();
        ROUTER.open('tower');
        setTimeout(function(){
          /* 2026-11-17 删旧猎妖 UI：妖踪引擎保留，直接置当前狩猎兽，不再点列表按钮 */
          S.huntBeast = 'rat'; S.huntProg = 0; XX._render();
          out.hunted = S.huntBeast === 'rat';
          /* 浮片几何：在视口内、不压住底部导航（78px 起） */
          XX._traceReset(); XX._traceSpawn(); XX._tracePaint();
          var bar = document.getElementById('trace-bar'), r = bar.getBoundingClientRect();
          out.shown = !bar.classList.contains('hidden');
          out.geo = { l: Math.round(r.left), t: Math.round(r.top), rt: Math.round(r.right),
                      b: Math.round(r.bottom), vw: innerWidth, vh: innerHeight };
          out.name = document.getElementById('tb-name').textContent;
          out.t1 = document.getElementById('tb-t').textContent;
          out.chaseTxt = document.getElementById('tb-chase').textContent;
          /* 倒计时：等它自己变（不手动重绘），最多等 6 秒 */
          var poll = 0, t0 = Date.now();
          (function wait(){
            var txt = document.getElementById('tb-t').textContent;
            if(txt !== out.t1 || poll++ > 60){
              out.t2 = txt; out.tWait = Date.now() - t0; return next();
            }
            setTimeout(wait, 100);
          })();
          function next(){
            /* 1) 真点【追击】：战力钉成 1 → 必得手；同步读账，不跨 tick */
            XX._trace().power = 1; XX._renderTrace();
            S.bag.length = 0;
            var st0 = S.stone;
            document.getElementById('tb-chase').click();
            out.winStone = Math.round(S.stone - st0);
            out.winBag = S.bag.length;
            out.winHidden = document.getElementById('trace-bar').classList.contains('hidden');
            out.winChip = document.getElementById('loot-toast').textContent || '';
            /* 2) 差距过大：按钮写「差得远」且点下去不起作用 */
            XX._traceSpawn(); XX._trace().power = XX._power() * 1e6; XX._renderTrace();
            var go = document.getElementById('tb-chase');
            out.farTxt = go.textContent; out.farOff = !!go.disabled;
            var stL = S.stone; S.huntProg = 12;
            go.click();
            out.loseStone = Math.round(S.stone - stL);
            out.loseProg = S.huntProg;
            /* 3) 真点【放过】：小份灵石，猎杀进度原样保留 */
            XX._traceSpawn(); S.huntProg = 5;
            var stG = S.stone;
            document.getElementById('tb-let').click();
            out.letStone = Math.round(S.stone - stG);
            out.letProg = S.huntProg;
            out.letHidden = document.getElementById('trace-bar').classList.contains('hidden');
            /* 4) 过期：浮片自隐，账目与进度都不动 */
            XX._traceSpawn(); S.huntProg = 7;
            var stE = S.stone;
            XX._trace().until = Date.now() - 1; XX._traceTick();
            out.expGone = XX._trace() === null;
            out.expStone = Math.round(S.stone - stE);
            out.expProg = S.huntProg;
            out.expHidden = document.getElementById('trace-bar').classList.contains('hidden');
            out.need = XX._needOf(S.rank);
            __ptDone(out);
          }
        }, 700);
      }, 400);
    `,
    checks(d) {
      const g = d.geo || {};
      const t1 = parseInt(d.t1, 10), t2 = parseInt(d.t2, 10);
      const winK = Math.round(d.need * 0.18), letK = Math.round(d.need * 0.02);
      return [
        { ok: d.hunted === true, label: '猎场真的开了（真点「猎杀」）', detail: '' },
        { ok: d.shown === true && g.l >= 0 && g.t >= 0 && g.rt <= g.vw && g.b <= g.vh,
          label: '妖踪浮片现身在视口内', detail: JSON.stringify(g) },
        { ok: (d.name || '').indexOf('异种 · ') === 0, label: '名字是「异种 · 妖兽名」', detail: d.name },
        { ok: !isNaN(t1) && !isNaN(t2) && t1 <= 15 && t1 - t2 >= 1 && d.tWait < 4000,
          label: '倒计时自己往下走（无需手动重绘）', detail: d.t1 + ' → ' + d.t2 + ' · ' + d.tWait + 'ms' },
        { ok: d.chaseTxt === '追击', label: '压得住时按钮就是「追击」', detail: d.chaseTxt },
        { ok: d.winStone === winK && d.winBag === 1 && d.winHidden === true,
          label: '真点追击得手：灵石 +need×0.18、材料 +1、浮片收起',
          detail: d.winStone + '/' + winK + ' · 背包 +' + d.winBag },
        { ok: (d.winChip || '').indexOf('妖踪得手') >= 0, label: '右上角同时飘一枚所得', detail: (d.winChip || '').slice(0, 20) },
        { ok: d.farTxt === '差得远' && d.farOff === true,
          label: '差距过大时按钮改写「差得远」并禁用', detail: d.farTxt + ' ' + d.farOff },
        { ok: d.loseStone === 0 && d.loseProg === 12,
          label: '禁用状态点下去不扣钱、不动进度', detail: d.loseStone + ' / ' + d.loseProg },
        { ok: d.letStone === letK && d.letProg === 5 && d.letHidden === true,
          label: '真点放过：拾 need×0.02、猎杀进度原样保留',
          detail: d.letStone + '/' + letK + ' · 进度 ' + d.letProg },
        { ok: d.expGone === true && d.expHidden === true && d.expStone === 0 && d.expProg === 7,
          label: '十五息到点自行遁走：账目与进度都不动',
          detail: d.expStone + ' / ' + d.expProg }
      ];
    }
  },

  /* ⑫ 山门议事（第 103 轮）：hub 点格子进页 → 真点一签 → 封卷 → 置灰签点不动 */
  {
    id: 'council', name: '山门议事（真点一格进页 · 三选一 · 封卷到明日）', budget: 11000, size: '760,1100',
    save() {
      const s = midSave();
      s.rank = 8; s.stone = 1e6; s.herb = 300;
      s.gate = { lv: 1, grad: 0, disciples: [{ id: 'gA', name: '叶青梧', apt: 3, task: '', t0: 0, ret: 0, svc: 0, last: '', run: 0, bless: 0 }] };
      s.council = { day: '', n: 0, last: '' };
      return s;
    },
    body: `
      setTimeout(function(){
        var S = XX._s, out = {};
        XX._setBattleAnim(false);
        ROUTER.open('zong');
        setTimeout(function(){
          /* 1) hub 里那一格：名字 + 朱砂印「待议」 */
          var cell = document.querySelector('#page-zong .hub-nav [data-jump="xx-council"]');
          out.cellTxt = cell ? cell.textContent.replace(/\\s+/g, ' ').trim() : '';
          out.seal = (document.getElementById('xx-hub-zong-council') || {}).textContent || '';
          if(cell) cell.click();
          setTimeout(function(){
            out.sec = document.getElementById('page-zong').dataset.sec;
            out.title = (document.querySelector('#xx-council .co-head b') || {}).textContent || '';
            var opts = document.querySelectorAll('#xx-council .co-opt');
            out.optN = opts.length;
            out.names = Array.prototype.map.call(opts, function(b){
              return (b.querySelector('.co-n') || {}).textContent || '';
            }).join('/');
            out.h = Math.round(opts[0] ? opts[0].getBoundingClientRect().height : 0);
            /* 2) 真点第一签【开仓赈济】：灵石 −need×0.35，换灵草 +6、声望 +12 */
            var st0 = S.stone, hb0 = S.herb, rp0 = S.arena.rep | 0;
            var b0 = document.querySelector('#xx-council .co-opt[data-cok="relief"]');
            if(b0) b0.click();
            out.dStone = Math.round(S.stone - st0);
            out.dHerb = Math.round(S.herb - hb0);
            out.dRep = (S.arena.rep | 0) - rp0;
            out.need = XX._needOf(S.rank);
            out.sealed = document.querySelectorAll('#xx-council .co-done').length;
            out.day = (document.getElementById('sc-co-day') || {}).textContent || '';
            out.dayCls = (document.getElementById('sc-co-day') || {}).className || '';
            out.last = (document.querySelector('#xx-council .co-done small') || {}).textContent || '';
            out.lastHead = (document.querySelector('#xx-council .co-done b') || {}).textContent || '';
            out.log = (S.log[0] || {}).t || '';
            /* 3) 次日解封：议题轮到第二条；灵草清零 → 「赠药结缘」置灰，真点不扣钱 */
            S.council.day = ''; S.herb = 0; XX._render();
            out.rotate = (document.querySelector('#xx-council .co-head b') || {}).textContent || '';
            var gift = document.querySelector('#xx-council .co-opt[data-cok="gift"]');
            out.giftOff = !!(gift && gift.disabled);
            out.giftWhy = gift ? gift.querySelector('.co-eff').textContent : '';
            var stB = S.stone;
            if(gift) gift.click();
            out.blockPay = Math.round(S.stone - stB);
            out.blockUnsealed = S.council.day === '';
            /* 4) 无弟子在山上：「准其下山」置灰 */
            S.council.n = 3; S.gate.disciples[0].task = 'seclude'; XX._render();
            var allow = document.querySelector('#xx-council .co-opt[data-cok="allow"]');
            out.idleOff = !!(allow && allow.disabled);
            out.idleWhy = allow ? allow.querySelector('.co-eff').textContent : '';
            /* 5) 弟子回山：真点「准其下山」→ 差事趟数 +1，卷宗封上 */
            S.gate.disciples[0].task = ''; XX._render();
            var svc0 = XX._gateSvc(S.gate.disciples[0]);
            var allow2 = document.querySelector('#xx-council .co-opt[data-cok="allow"]');
            if(allow2) allow2.click();
            out.dSvc = XX._gateSvc(S.gate.disciples[0]) - svc0;
            out.sealedHead = (document.querySelector('#xx-council .co-done b') || {}).textContent || '';
            out.sealed2 = (document.querySelector('#xx-council .co-done small') || {}).textContent || '';
            __ptDone(out);
          }, 320);
        }, 720);
      }, 400);
    `,
    checks(d) {
      const cost = Math.max(1, Math.round(d.need * 0.35));
      return [
        { ok: (d.cellTxt || '').indexOf('山门议事') >= 0 && d.seal === '待议',
          label: '宗门 hub 多出一格「山门议事」，朱砂印写「待议」', detail: d.cellTxt + ' · ' + d.seal },
        { ok: d.sec === 'xx-council' && d.title === '山下蝗灾',
          label: '真点格子进的是它自己那页，题名「山下蝗灾」', detail: d.sec + ' · ' + d.title },
        { ok: d.optN === 3 && d.names === '开仓赈济/派弟子帮工/闭门清修',
          label: '一条议题摆三名签', detail: d.names },
        { ok: d.h >= 44, label: '纸签够高，手指好按', detail: d.h + 'px' },
        { ok: d.dStone === -cost && d.dHerb === 6 && d.dRep === 12,
          label: '真点【开仓赈济】：灵石 −need×0.35，换灵草 +6、声望 +12',
          detail: [d.dStone + '/' + (-cost), d.dHerb, d.dRep].join(' · ') },
        { ok: d.sealed === 1 && d.day === '今日已议' && d.dayCls.indexOf('muted') >= 0,
          label: '选完封卷：正文换成结论、页眉印信转灰写「今日已议」',
          detail: d.day + ' · ' + d.dayCls },
        { ok: d.lastHead === '山下蝗灾 · 开仓赈济' && /^灵石 −\d+、灵草 \+6、声望 \+12$/.test(d.last || '') &&
              (d.log || '').indexOf('山门议事') >= 0,
          label: '结论留在纸上（标题 + 数目两行），日志同时记一条',
          detail: d.lastHead + ' ｜ ' + d.last + ' ｜ ' + d.log },
        { ok: d.rotate === '邻山求药', label: '次日解封，议题轮到下一条', detail: d.rotate },
        { ok: d.giftOff === true && d.giftWhy === '灵草不足' && d.blockPay === 0 && d.blockUnsealed === true,
          label: '灵草不足：赠药签置灰写明原因，真点下去分文不动、也不封卷',
          detail: d.giftWhy + ' · ' + d.blockPay + ' · 未封卷 ' + d.blockUnsealed },
        { ok: d.idleOff === true && d.idleWhy === '无弟子在山上',
          label: '弟子都在外时，「准其下山」置灰', detail: d.idleWhy },
        { ok: d.dSvc === 1 && d.sealedHead === '弟子请行 · 准其下山' && (d.sealed2 || '').indexOf('「叶青梧」差事 +1 趟') > 0,
          label: '弟子回山后真点「准其下山」：差事 +1 趟，卷宗封上且写的是刚议完那条',
          detail: d.dSvc + ' · ' + d.sealedHead + ' · ' + d.sealed2 }
      ];
    }
  },

  /* ⑬ 心魔守心（第 104 轮）：照镜前过三息——默守得心念（降照镜线）、断喝得修为 */
  {
    id: 'calm', name: '心魔守心（真点三息 · 默守/断喝 · 门槛降够才照得动）', budget: 12000, size: '760,1100',
    save() {
      const s = midSave();
      s.rank = 12; s.exp = 0;
      s.legacy = { gens: 1, relic: null, hist: [{ gen: 1, rank: 12, age: 600, relic: null }], pick: null };
      return s;
    },
    body: `
      setTimeout(function(){
        var S = XX._s, out = {};
        XX._setBattleAnim(false);
        /* 心魔摆在「原始线高 3%」的位置：一息不守够不着，守满两息正好够 */
        S.rank = 12;
        var me = XX._power();
        S.mirror = { gen: 1, rank: 12, age: 600, brk: 7, pow: Math.round(me * 1.03),
                     wins: 0, done: 0, calm: 0, calmStep: 0 };
        XX._render();
        ROUTER.open('life');
        setTimeout(function(){
          var cell = document.querySelector('#page-life .hub-nav [data-jump="xx-life-mirror"]');
          out.cell = !!cell;
          if(cell) cell.click();
          setTimeout(function(){
            out.state0 = document.getElementById('xx-mf-vs').dataset.state;
            out.box0 = document.getElementById('xx-mf-calm').dataset.state;
            out.tag0 = (document.getElementById('xx-mf-calm-tag') || {}).textContent || '';
            out.ask0 = (document.getElementById('xx-mf-calm-ask') || {}).textContent || '';
            var slips = document.querySelectorAll('#xx-mf-calm [data-calm]');
            out.slipN = slips.length;
            out.slipH = Math.round(slips[0] ? slips[0].getBoundingClientRect().height : 0);
            out.need0 = (document.getElementById('xx-mf-need') || {}).textContent || '';
            out.dis0 = !!(document.getElementById('xx-mf-fight') || {}).disabled;
            /* 第一息：真点【默守】——心念 +1，不拿修为 */
            var e0 = S.exp;
            if(slips[0]) slips[0].click();
            out.tag1 = (document.getElementById('xx-mf-calm-tag') || {}).textContent || '';
            out.dexp1 = Math.round(S.exp - e0);
            out.need1 = (document.getElementById('xx-mf-need') || {}).textContent || '';
            /* 第二息：真点【断喝】——当场拿修为，心念不进 */
            var e1 = S.exp;
            out.gain = XX._mirror.calm.gain();
            var bk = document.querySelector('#xx-mf-calm [data-calm="break"]');
            if(bk) bk.click();
            out.dexp2 = Math.round(S.exp - e1);
            out.tag2 = (document.getElementById('xx-mf-calm-tag') || {}).textContent || '';
            out.calm2 = XX._mirror.calm.count();
            /* 第三息：再默守 → 收签，照镜线降够，按钮亮 */
            var hd = document.querySelector('#xx-mf-calm [data-calm="hold"]');
            if(hd) hd.click();
            out.box3 = document.getElementById('xx-mf-calm').dataset.state;
            out.tag3 = (document.getElementById('xx-mf-calm-tag') || {}).textContent || '';
            out.slip3 = document.querySelectorAll('#xx-mf-calm [data-calm]').length;
            var alive = document.querySelector('#xx-mf-calm [data-calm]');
            out.slipVis = !!(alive && alive.offsetParent !== null);
            out.need3 = (document.getElementById('xx-mf-need') || {}).textContent || '';
            out.state3 = document.getElementById('xx-mf-vs').dataset.state;
            out.dis3 = !!(document.getElementById('xx-mf-fight') || {}).disabled;
            out.k3 = Math.round(XX._mirror.calmK() * 1000) / 1000;
            out.me = me; out.pow = S.mirror.pow;
            /* 真点照镜 */
            var fb = document.getElementById('xx-mf-fight');
            if(fb) fb.click();
            out.wins = XX._mirror.wins();
            out.stateEnd = XX._mirror.state();
            out.boxEnd = document.getElementById('xx-mf-calm').dataset.state;
            out.log = (S.log[0] || {}).t || '';
            out.logCalm = S.log.map(function(x){ return x.t; }).join('|').indexOf('守心') >= 0;
            __ptDone(out);
          }, 420);
        }, 520);
      }, 400);
    `,
    checks(d) {
      return [
        { ok: d.cell === true && d.state0 === 'short' && d.dis0 === true,
          label: '心魔原始战力高 3%：没守心之前照镜按钮是灰的', detail: [d.cell, d.state0, d.dis0].join('/') },
        { ok: d.box0 === 'ask' && d.tag0 === '第 1 息 · 心念 0/3' && (d.ask0 || '').length > 10 && d.slipN === 2,
          label: '心魔页先摆守心：说第一息，两张签（默守 / 断喝）', detail: [d.box0, d.tag0, d.slipN].join('/') },
        { ok: d.slipH >= 44, label: '纸签够高，手指好按', detail: d.slipH + 'px' },
        { ok: d.need0 === '', label: '心念 0 时不给门槛小字，免得多一行零', detail: '「' + d.need0 + '」' },
        { ok: d.tag1 === '第 2 息 · 心念 1/3' && d.dexp1 === 0,
          label: '真点【默守】：心念 +1，修为分文不动', detail: d.tag1 + ' · 修为 +' + d.dexp1 },
        { ok: (d.need1 || '').indexOf('守心 −1.5%') === 0,
          label: '守住一息，照镜线小字立刻写上 −1.5%', detail: d.need1 },
        { ok: d.dexp2 === d.gain && d.gain > 0 && d.calm2 === 1 && d.tag2 === '第 3 息 · 心念 1/3',
          label: '真点【断喝】：当场拿修为（= need×0.08），心念不进',
          detail: [d.dexp2 + '/' + d.gain, d.calm2, d.tag2].join(' · ') },
        { ok: d.box3 === 'over' && d.slip3 === 2 && d.slipVis === false && d.tag3 === '已守心 · 2/3',
          label: '三息走完收签：签收起、印信写「已守心 2/3」', detail: [d.box3, d.slip3, d.slipVis, d.tag3].join('/') },
        { ok: (d.need3 || '').indexOf('守心 −3.0%') === 0 && d.k3 === 0.97 && d.pow > d.me &&
              d.state3 === 'ready' && d.dis3 === false,
          label: '守心 2/3 → 照镜线 ×0.97：心魔原始战力还高一点，按钮已经能点',
          detail: [d.need3, d.k3, d.pow + '>' + d.me, d.state3].join(' · ') },
        { ok: d.wins === 1 && d.stateEnd === 'done' && d.boxEnd === 'none' && d.logCalm === true,
          label: '真点照镜破心魔：道心 +1、守心面板收起、日志留下三息', detail: [d.wins, d.stateEnd, d.boxEnd].join('/') }
      ];
    }
  },

  /* ⑪ 洞天开辟（第 70 节）：真点开辟 / 升重 / 奉主洞，效果当场互换 */
  {
    id: 'dongtian', name: '洞天开辟（点开·升重·换主洞）', budget: 10000, size: '900,1200',
    save() {
      const s = midSave();
      s.rank = 18; s.exp = 0; s.stone = 1e9; s.bag = [];
      s.dt = { qing: 0, zhu: 0, su: 0, xuan: 0, huang: 0 }; s.dtMain = '';
      s.dan = 1; s.mastery = { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 };
      return s;
    },
    body: `
      setInterval(__clearPopups, 200);
      ROUTER.open('dong_dongtian');
      setTimeout(function(){
        var S = XX._s, O = {};
        ['mat_feather','mat_eye','mat_bone'].forEach(function(t){ for(var i=0;i<20;i++) S.bag.push({ t:t, n:t }); });
        ['boss_feather','boss_pearl','boss_heart'].forEach(function(t){ for(var i=0;i<5;i++) S.bag.push({ t:t, n:t }); });
        S.weapon = 2; S.weaponLv = 5; S.weaponBless = 0; S.affix = [];
        XX._render();
        var stone0 = S.stone, feathers0 = S.bag.filter(function(x){ return x.t === 'mat_feather'; }).length;
        O.cost = (document.querySelector('#xx-dongtian [data-card="qing"] [data-f="cost"]') || {}).textContent || '';
        var b = document.querySelector('#xx-dongtian [data-card="qing"] [data-dt-act="open"]');
        O.open0 = b ? (b.disabled ? 'disabled' : 'ok') : 'none';
        if(b && !b.disabled) b.click();
        O.lv1 = XX._dtLv('qing');
        O.paid = S.stone < stone0;
        O.matUsed = feathers0 - S.bag.filter(function(x){ return x.t === 'mat_feather'; }).length;
        O.main0 = XX._dtMain();
        O.eff1 = document.querySelector('#xx-dongtian [data-card="qing"] [data-f="eff"]').textContent;
        O.craft1 = (XX._craftRate(XX._recipes.dan1) * 100).toFixed(1);
        /* 再点一次：灵脉（rank 18 已过 17 门槛） */
        b = document.querySelector('#xx-dongtian [data-card="qing"] [data-dt-act="open"]');
        if(b && !b.disabled) b.click();
        O.lv2 = XX._dtLv('qing');
        O.lv2txt = document.querySelector('#xx-dongtian [data-card="qing"] [data-f="lv"]').textContent;
        /* 朱明初辟 → 奉为主洞 */
        b = document.querySelector('#xx-dongtian [data-card="zhu"] [data-dt-act="open"]');
        if(b && !b.disabled) b.click();
        O.zhu = XX._dtLv('zhu');
        var mb = document.querySelector('#xx-dongtian [data-card="zhu"] [data-dt-act="main"]');
        O.mainBtn = mb ? (mb.disabled ? 'disabled' : 'ok') : 'none';
        if(mb && !mb.disabled) mb.click();
        O.main1 = XX._dtMain();
        O.mainLine = document.querySelector('#xx-dongtian [data-dt-main-line]').textContent;
        O.effQing = document.querySelector('#xx-dongtian [data-card="qing"] [data-f="eff"]').textContent;
        O.craft2 = (XX._craftRate(XX._recipes.dan1) * 100).toFixed(1);
        O.pow = XX._dtTotals().pow;
        O.sum = (document.querySelector('#xx-dongtian .dt-sum') || {}).textContent || '';
        /* 黄庭 rank 19 才开：按钮禁着 */
        var hb = document.querySelector('#xx-dongtian [data-card="huang"] [data-dt-act="open"]');
        O.huangLock = hb ? (hb.disabled ? 'yes' : 'no') : 'none';
        O.huangNext = document.querySelector('#xx-dongtian [data-card="huang"] [data-f="next"]').textContent;
        /* 背包页：容量标签写有效值（储物袋 50 + 玄冥主洞 30） */
        S.bag = []; S.bagSize = 50; S.dt.xuan = 3; XX._dtMainSet('xuan'); XX._render();
        ROUTER.open('bag');
        O.bagCap = (document.getElementById('xx-bag-cap') || {}).textContent || '';
        O.bagCells = document.querySelectorAll('#xx-bag .bag-cell').length;
        __ptDone(O);
      }, 900);
    `,
    checks(d) {
      return [
        { ok: d.open0 === 'ok' && d.lv1 === 1 && d.paid === true && d.matUsed === 2,
          label: '点「开辟」真的扣灵石与材料、初辟成立',
          detail: [d.open0, 'lv' + d.lv1, 'paid=' + d.paid, '材-' + d.matUsed].join('/') },
        { ok: d.cost.indexOf('仙羽 20/2') >= 0,
          label: '价目行把持有/所需写清（仙羽 20/2）', detail: d.cost },
        { ok: d.main0 === 'qing' && /\+1\.5%/.test(d.eff1) && d.craft1 === '93.5',
          label: '首座自动成主洞：×1.5 → 炼丹 +1.5%（92%→93.5%）', detail: d.eff1 + ' / ' + d.craft1 + '%' },
        { ok: d.lv2 === 2 && d.lv2txt.indexOf('灵脉') >= 0,
          label: '再点一次升灵脉（rank 18 已过 17 门槛）', detail: d.lv2txt },
        { ok: d.zhu === 1 && d.mainBtn === 'ok' && d.main1 === 'zhu' && d.mainLine.indexOf('朱明') >= 0,
          label: '朱明初辟可奉主洞，主洞行同步换名', detail: d.mainLine },
        { ok: d.effQing === '炼丹成功率 +2%' && d.craft2 === '94.0' && d.pow === 6,
          label: '换主洞后效果立即互换：青华回落 +2%、朱明战力 ×1.5=+6%',
          detail: d.effQing + ' / ' + d.craft2 + '% / 战力+' + d.pow + '%' },
        { ok: d.huangLock === 'yes' && d.huangNext.indexOf('化神中') >= 0,
          label: '未到境界的黄庭按钮禁用，并写明解锁层', detail: d.huangLock + ' / ' + d.huangNext },
        { ok: d.sum.indexOf('合计：') === 0 && d.sum.indexOf('炼丹成功率 +2%') >= 0 && d.sum.indexOf('战力 +6%') >= 0,
          label: '合计行把两座洞天的当前生效值汇总（不用玩家心算）', detail: d.sum },
        { ok: d.bagCap === '已用 0 / 容量 80（洞天 +30） · 共 0 件',
          label: '背包标签写已用/容量/总件数：储物袋 50 + 玄冥洞天 30，并注明来源', detail: d.bagCap },
        { ok: d.bagCells === 80,
          label: '背包格子按有效容量铺满 80 格', detail: 'cells=' + d.bagCells }
      ];
    }
  },

  /* ⑫ 洞府长页导航 + 洗练锁词条（第 76 节）：真点导航、真锁两条、真等老虎机落定 */
  {
    id: 'caveui', name: '产业导航 + 洗练锁定（真点击·真落定）', budget: 9000, size: '900,1200',
    save() {
      const s = midSave();
      s.rank = 18; s.exp = 0; s.stone = 100000;
      s.weapon = 4; s.weaponLv = 7; s.affix = [];
      return s;
    },
    body: `
      setInterval(__clearPopups, 200);
      ROUTER.open('dong');
      setTimeout(function(){
        var S = XX._s, O = {};
        var pg = document.querySelector('#page-dong');
        var nav = document.querySelector('#page-dong .hub-nav');
        var head = document.querySelector('#page-dong .panel-head');
        O.navN = document.querySelectorAll('#page-dong .hub-nav [data-jump]').length;
        O.navPos = getComputedStyle(nav).position;
        O.navCols = getComputedStyle(nav).gridTemplateColumns.split(' ').length;
        O.navBelowHead = Math.round(nav.getBoundingClientRect().top) >= Math.round(head.getBoundingClientRect().bottom);
        O.hubCards = document.querySelectorAll('#page-dong .panel-body > .card').length;
        var bAl = nav.querySelector('[data-jump="xx-alchemy-sec"]');
        bAl.click();
        var al = document.getElementById('xx-alchemy-sec');
        O.subRoute = ROUTER.current();
        O.subDepth = ROUTER.depth();
        O.subCards = document.querySelectorAll('#page-dong .panel-body > .card').length;
        O.subAlch = !!al;
        O.alTop = al ? Math.round(al.getBoundingClientRect().top - pg.getBoundingClientRect().top) : -1;
        window.backToScene();                       /* 子页的 ← ：先回 hub */
        O.backHub = document.querySelector('#page-dong').dataset.sec;
        O.backScene = document.getElementById('page-scene').classList.contains('active');

        /* 洗练：四条词条，锁 0/2，只重掷 1/3 */
        S.weapon = 4; S.weaponLv = 7; S.stone = 100000;
        S.affix = [{id:'exp',q:4},{id:'pow',q:3},{id:'brk',q:2},{id:'stone',q:1}];
        XX._render(); XX._openReroll();
        O.modal = __vis('reroll-modal');
        O.slots = document.querySelectorAll('#reroll-modal .rr-slot').length;
        O.lockBtns = document.querySelectorAll('#reroll-modal .rr-lock').length;
        document.querySelector('#rr-slot-0 .rr-lock').click();
        document.querySelector('#rr-slot-2 .rr-lock').click();
        O.lockN = document.querySelectorAll('#reroll-modal .rr-slot.locked').length;
        O.costTxt = document.getElementById('rr-go').textContent;
        O.hint = document.getElementById('rr-lockhint').textContent;
        var st0 = S.stone;
        document.getElementById('rr-go').click();
        O.stonePaid = st0 - S.stone;
        setTimeout(function(){
          O.lockAfter = XX._rrLocks().length;
          O.keep0 = S.affix[0].id === 'exp' && S.affix[0].q === 4;
          O.keep2 = S.affix[2].id === 'brk' && S.affix[2].q === 2;
          O.n = S.affix.length;
          O.uniq = new Set(S.affix.map(function(a){ return a.id; })).size;
          O.slots4 = document.querySelectorAll('#reroll-modal .rr-slot .rr-lock').length;
          O.goBack = document.getElementById('rr-go').textContent;
          __ptDone(O);
        }, 2800);
      }, 900);
    `,
    checks(d) {
      return [
        { ok: d.navN === 8 && d.hubCards === 1,
          label: '洞府 hub 七格入口、页面上只剩卷首一张卡（八个分区堆一页的老毛病已拆）',
          detail: d.navN + ' 格 / ' + d.hubCards + ' 张卡' },
        { ok: d.navPos !== 'sticky' && d.navCols >= 2 && d.navBelowHead === true,
          label: '入口格排成两列以上的网格、不吸顶（旧锚点条的 position:sticky 已废）',
          detail: d.navPos + ' / ' + d.navCols + ' 列 / 让位标题栏=' + d.navBelowHead },
        { ok: d.subRoute === 'dong_alchemy' && d.subDepth === 2 && d.subCards === 1 && d.subAlch === true,
          label: '点「炼丹房」这一格 → 压一层进独立页，页里只有炼丹那一张卡',
          detail: d.subRoute + ' 栈深' + d.subDepth + ' 卡' + d.subCards + ' top=' + d.alTop },
        { ok: d.backHub === 'hub' && d.backScene === false,
          label: '独立页按 ← 先回 hub，不是一步退回主场景', detail: d.backHub + ' / sceneActive=' + d.backScene },
        { ok: d.modal === true && d.slots === 4 && d.lockBtns === 4,
          label: '神品法宝四槽全显，每槽都有锁钮',
          detail: [d.modal, 'slots=' + d.slots, 'lock=' + d.lockBtns].join('/') },
        { ok: d.lockN === 2 && d.costTxt.indexOf('2.00万') >= 0,
          label: '锁两条后按钮改写 2.00万（底价翻倍两次）', detail: d.costTxt },
        { ok: d.hint.indexOf('已锁 2 条') >= 0 && d.hint.indexOf('2.00万') >= 0,
          label: '价格提示同步写清锁数与总价', detail: d.hint },
        { ok: d.stonePaid === 20000 && d.keep0 === true && d.keep2 === true &&
              d.n === 4 && d.uniq === 4 && d.lockAfter === 2,
          label: '扣 20000：0/2 号词条原样保留，1/3 号重掷且四条不重复',
          detail: ['paid=' + d.stonePaid, 'keep=' + d.keep0 + '/' + d.keep2,
                   'n=' + d.n, 'uniq=' + d.uniq, 'locks=' + d.lockAfter].join(' ') },
        { ok: d.slots4 === 4 && d.goBack.indexOf('2.00万') >= 0,
          label: '落定后四槽仍可继续锁，价格保持 2.00万', detail: d.goBack }
      ];
    }
  },

  /* ⑮ 城镇七面板「一格一页」（第 88 轮 B）：制作人反复提的老毛病——
     不同功能点进去全挤在同一页，只是上下关系。这里真点每一格（共 33 格），
     验三件事：格子数对得上、点进去是一个独立页（页眉就是那格的名字、
     页里没有 hub 的入口格、← 只回 hub）、hub 上每格图标真加载且有现状印。
     站 hub 上量图标要先让出一拍（enter() 刚换上的 <img> 还没 decode，立刻量得到假裂图）；
     逐格真点则同步读数即可。enter() 会整段换掉 innerHTML，所以每轮都按 key 重新取元素，
     攥着旧节点再 click 就打不出委托监听了。 */
  {
    id: 'townhub', name: '城镇七面板一格一页（真点 33 格）', budget: 12000, size: '900,1200',
    save() {
      const s = midSave();
      s.rank = 12; s.exp = 0; s.stone = 200000;
      return s;
    },
    body: `
      setInterval(__clearPopups, 400);
      var WANT = { xiu:6, role:6, zong:6, market:4, secret:4, arena:3, event:4 };
      var LIST = ['xiu','role','zong','market','secret','arena','event'];
      var O = { rows: [], cells: 0, viewN: 0, dup: 0, depthBad: 0, titleOk: 0,
                noHub: 0, backOk: 0, icMiss: '', sealBad: '', hubCards: 0,
                cardLo: 99, cardHi: 0 };
      var V = {};
      /* 入口格的水墨题签分两处验：
         · 素材本身是不是真 PNG —— 由 Node 直接读字节（HUB_ART）。headless 里
           --virtual-time-budget 会把 100~200KB 的立绘/题签饿死，量 naturalWidth
           只会量到假红（verify.js 第 86/87 节踩过同样的坑，结论写在它 216 行）。
         · DOM 有没有把该挂的那一枚挂上 —— 在页内比对 <img src> 与 HUBKIT 的定义，
           纯字符串，不吃解码时机。
         最后长什么样由实拍定（每轮的硬约束）。 */
      function walk(){
        var i = 0;
        function nextPanel(){
          if(i >= LIST.length){ finish(); return; }
          var p = LIST[i]; i++;
          var row = { p: p, seals: 0 };
          ROUTER.open(p);
          /* 让这一拍走完：DOM 刚换，现状印也要等 XX._render() 落笔 */
          setTimeout(function(){
            var page = document.querySelector('#page-' + p);
            row.sec = page ? page.dataset.sec : 'none';
            var nav = page ? page.querySelector('.hub-nav') : null;
            var keys = nav
              ? [].slice.call(nav.querySelectorAll('[data-jump]')).map(function(c){ return c.dataset.jump; })
              : [];
            row.cells = keys.length;
            row.hubCards = page ? page.querySelectorAll('.panel-body > .card').length : 0;
            /* 每格挂的题签是不是 HUBKIT 里写的那一枚：只比字符串，不等解码 */
            var secs = HUBKIT.secsOf(p) || [];
            row.icMiss = secs.filter(function(s){
              var c = document.querySelector('#page-' + p + ' .hub-nav [data-jump="' + s.key + '"]');
              var im = c ? c.querySelector('img.hc-ic') : null;
              return !im || (im.getAttribute('src') || '').split('/').pop() !== s.ico;
            }).map(function(s){ return p + '/' + s.key; }).join(' ');
            /* 现状印：站在 hub 上量 */
            keys.forEach(function(k){
              var c = document.querySelector('#page-' + p + ' .hub-nav [data-jump="' + k + '"]');
              if(!c) return;
              var sl = c.querySelector('.hc-seal');
              if(sl && sl.textContent && sl.textContent !== '—') row.seals++;
            });
            /* 逐格真点：进独立页读数，再 ← 回 hub */
            keys.forEach(function(k){
              /* ← 之后已经回到 hub，这里必须重新取：enter() 换掉了整段 DOM */
              var c = document.querySelector('#page-' + p + ' .hub-nav [data-jump="' + k + '"]');
              if(!c){ row.lost = (row.lost || 0) + 1; return; }
              var nm = c.querySelector('.hc-t b');
              c.click();
              var sub = ROUTER.current();
              if(sub === p) row.onPanel = (row.onPanel || 0) + 1;
              if(!V[sub]){ V[sub] = 1; O.viewN++; } else O.dup++;
              if(ROUTER.depth() !== 2) O.depthBad++;
              var sp = document.querySelector('#page-' + p);
              var hd = sp ? sp.querySelector('.panel-head h2') : null;
              if(hd && nm && hd.textContent.indexOf(nm.textContent) >= 0) O.titleOk++;
              if(sp && !sp.querySelector('.hub-nav') && !sp.querySelector('[data-jump]')) O.noHub++;
              var nCards = sp ? sp.querySelectorAll('.panel-body > .card').length : 0;
              if(nCards < O.cardLo) O.cardLo = nCards;
              if(nCards > O.cardHi) O.cardHi = nCards;
              var bk = sp ? sp.querySelector('.panel-back') : null;
              if(bk) bk.click();
              var bp = document.querySelector('#page-' + p);
              if(bp && bp.dataset.sec === 'hub') O.backOk++;
            });
            O.cells += keys.length;
            O.icMiss += row.icMiss;
            O.hubCards += row.hubCards;
            if(row.seals < row.cells) O.sealBad += ' ' + p + ':' + row.seals + '/' + row.cells;
            row.lead = row.hubCards;
            O.rows.push(row);
            nextPanel();
          }, 260);
        }
        function finish(){
          O.badLead = O.rows.filter(function(r){
            return r.lead !== (r.p === 'secret' ? 1 : 0);
          }).map(function(r){ return r.p + ':' + r.lead; }).join(' ');
          O.counts = O.rows.map(function(r){ return r.p + ':' + r.cells + '/' + WANT[r.p]; }).join(' ');
          O.allCells = O.rows.every(function(r){ return r.cells === WANT[r.p] && r.sec === 'hub'; });
          __ptDone(O);
        }
        nextPanel();
      }
      ROUTER.open(LIST[0]);
      setTimeout(walk, 300);
    `,
    checks(d) {
      return [
        { ok: d.rows && d.rows.length === 7 && d.allCells === true,
          label: '七个面板 hub 都在，入口格数一个不差（藏经阁6 人物6 宗门6 坊市4 秘境4 论剑3 活动4）',
          detail: d.counts },
        { ok: d.cells === 33 && d.viewN === 33 && d.dup === 0 && !(d.rows || []).some(r => r.onPanel),
          label: '33 格点进去是 33 个不同页面（不是同一页上下滚）',
          detail: '格子' + d.cells + ' · 独立页' + d.viewN + ' · 重页' + d.dup },
        { ok: d.badLead === '' && d.hubCards === 1,
          label: 'hub 上只剩入口格：秘境留一张卷首概览，其余六块 0 张卡',
          detail: d.badLead || '卡合计' + d.hubCards },
        { ok: d.titleOk === 33,
          label: '每格进的那一页，页眉写的就是那一格的功能名', detail: d.titleOk + '/33' },
        { ok: d.noHub === 33 && d.depthBad === 0 && d.backOk === 33,
          label: '独立页里没有第二格入口；栈深恒 2；← 先回 hub 不退主场景',
          detail: ['无入口' + d.noHub, '栈深错' + d.depthBad, '回hub' + d.backOk].join(' / ') },
        { ok: d.icMiss === '',
          label: '33 格各挂 HUBKIT 里写定的那枚题签（挂错/漏挂都算红）',
          detail: d.icMiss ? ('错位:' + d.icMiss) : '33/33 对得上' },
        { ok: HUB_ART === '',
          label: '八块面板用到的每一枚题签素材都是真 PNG（Node 读字节判，不中虚拟时间的假红）',
          detail: HUB_ART || HUB_ART_N + ' 枚全部有效' },
        { ok: d.sealBad === '',
          label: '32 格个个有朱砂印写现状，没有一格还停在占位符「—」',
          detail: d.sealBad || '全部有印' },
        { ok: d.cardLo >= 1 && d.cardHi <= 2,
          label: '每张独立页只装自己那一两张卡，不再堆成一串',
          detail: '最少' + d.cardLo + ' 最多' + d.cardHi }
      ];
    }
  },

  /* ⑬ 道行拆账 + 下一级预览（第 77 节）：点顶栏 chip / 人物面板入口，读三块拆账与升级箭头 */
  {
    id: 'pwbreak', name: '道行拆账 + 升级预览（真点击·真账目）', budget: 9000, size: '900,1200',
    save() {
      const s = midSave();
      s.rank = 18; s.exp = 0; s.stone = 100000;
      s.weapon = 4; s.weaponLv = 7;
      s.affix = [{id:'exp',q:4},{id:'pow',q:3},{id:'brk',q:2},{id:'stone',q:1}];
      return s;
    },
    body: `
      setInterval(__clearPopups, 200);
      var O = {};
      setTimeout(function(){
        var chip = document.getElementById('sc-power-chip');
        O.chipTag = chip.tagName;
        chip.click();
        O.open1 = __vis('power-modal');
        O.secs = document.querySelectorAll('#power-modal .pw-sec').length;
        O.rows = document.querySelectorAll('#power-modal .pw-row').length;
        O.txt = document.getElementById('pw-body').textContent;
        O.sub = document.getElementById('pw-sub').textContent;
        var bd = XX._statBreakdown();
        var prod = function(a){ return a.reduce(function(x,m){ return x * m.v; }, 1); };
        O.powCalc = Math.floor(bd.power.base * prod(bd.power.mults)) +
          bd.power.flats.reduce(function(a,f){ return a + f.v; }, 0);
        O.powNow = XX._power();
        O.expOk = Math.abs(bd.exp.base * prod(bd.exp.mults) - bd.exp.total) < 1e-6;
        O.stoneOk = Math.abs(bd.stone.base * prod(bd.stone.mults) - bd.stone.total) < 1e-6;
        document.getElementById('pw-close').click();
        O.closedBtn = !__vis('power-modal');
        ROUTER.open('role_equip');
        setTimeout(function(){
          var link = document.getElementById('xx-role-break');
          O.link = !!link;
          if(link) link.click();
          O.open2 = __vis('power-modal');
          document.getElementById('power-modal').click();   /* 点遮罩关闭 */
          O.closedMask = !__vis('power-modal');
          ROUTER.open('dong_ups');
          setTimeout(function(){
            var subs = Array.prototype.map.call(
              document.querySelectorAll('#xx-ups .upg small'), function(x){ return x.textContent; }).join('~');
            O.arrowN = (subs.match(/→/g) || []).length;
            O.caveTxt = document.querySelectorAll('#xx-ups .upg small')[3].textContent;
            ROUTER.open('dong_enhance');
            O.enhNext = (document.querySelector('#xx-enhance .enh-next') || {}).textContent || '';
            __ptDone(O);
          }, 700);
        }, 500);
      }, 800);
    `,
    checks(d) {
      return [
        { ok: d.chipTag === 'BUTTON' && d.open1 === true,
          label: '顶栏战力 chip 是按钮，点开拆账弹窗', detail: String(d.chipTag) + ' / ' + d.open1 },
        { ok: d.secs === 3 && d.rows >= 9 && (d.txt || '').indexOf('战力') >= 0 &&
              (d.txt || '').indexOf('修为') >= 0 && (d.txt || '').indexOf('灵石') >= 0,
          label: '弹窗三块齐全（战力 / 修为 / 灵石），逐行列账',
          detail: 'secs=' + d.secs + ' rows=' + d.rows },
        { ok: !/NaN|undefined|Infinity/.test(d.txt || '') && (d.sub || '').indexOf('·') >= 0,
          label: '账面无 NaN，副标题写「道号 · 境界」', detail: d.sub },
        { ok: Number(d.powCalc) === Number(d.powNow) && d.expOk === true && d.stoneOk === true,
          label: '底 × 乘区 + 加区 = 顶部/人物面板的结算值',
          detail: ['pow=' + d.powCalc + '/' + d.powNow, 'exp=' + d.expOk, 'stone=' + d.stoneOk].join(' ') },
        { ok: d.closedBtn === true && d.link === true && d.open2 === true && d.closedMask === true,
          label: '× 能关；人物面板入口能开；点遮罩也能关',
          detail: [d.closedBtn, d.link, d.open2, d.closedMask].join('/') },
        { ok: d.arrowN >= 4 && (d.caveTxt || '').indexOf('→ ×') >= 0,
          label: '升级行写清「当前 → 下一级」（洞府阵带箭头）',
          detail: 'arrows=' + d.arrowN + ' ' + d.caveTxt },
        { ok: (d.enhNext || '').indexOf('下一级 +8') >= 0 && (d.enhNext || '').indexOf('成功率') >= 0,
          label: '法宝强化卡预览 +8 的修炼/战力/成功率', detail: d.enhNext }
      ];
    }
  },

  /* 寿元倒计时 + 坐化转世（第 96 轮）：顶栏 chip 真点进寿元页 → 余命烧完自然坐化 →
     真点「转世续道统」→ 道统页真点读数。坐化不靠手工调 _zuohua()，让心跳自己烧完余命。 */
  {
    id: 'life96', name: '寿元倒计时（chip 真点 · 寿尽坐化 · 真点转世）', budget: 12000, size: '760,1100',
    save() {
      const s = midSave();
      s.rank = 12; s.exp = 0;
      /* P1（阶段一，2026-11-14 已批）：lifeYearSec 300→4320，1 游戏年 = 72 分钟。
         余命 3 真实秒 ⇒ 差 3/4320 = 0.000694 年；age 取 599.9993 后 lifeAge=floor=599，
         剩余口径 lifeLeft=600-599=1 → chip 显示「余 1」（外部评审第 4 项）。 */
      s.life = { age: 599.9993, on: true, brk: 3 };   /* 余命 3 真实秒：首读还活着，两个心跳后自然坐化 */
      s.equipment = { weapon: null, armor: null, accessory: null };
      /* 第 97 轮：背包三件法宝 → 坐化结算卡给出三选一（赤霄 1800 > 玄龟甲 1500 > 聚灵珠 1200） */
      s.bag = [{ t: 'eq_chixiao', n: '赤霄剑' }, { t: 'eq_xuangui', n: '玄龟甲' }, { t: 'eq_lingzhu', n: '聚灵珠' }];
      return s;
    },
    body: `
      setInterval(__clearPopups, 200);
      var O = {};
      setTimeout(function(){
        var chip = document.getElementById('sc-life-chip');
        O.chipTag = chip.tagName;
        O.chip0 = (document.getElementById('sc-life') || {}).textContent;
        O.low0 = chip.classList.contains('low');
        chip.click();
        O.cur1 = ROUTER.current();
        setTimeout(function(){
          var cell = document.querySelector('#page-life .hub-nav [data-jump="xx-life-now"]');
          O.cell = !!cell;
          if(cell) cell.click();
          setTimeout(function(){
            O.cur2 = ROUTER.current();
            O.wick = parseFloat(getComputedStyle(document.getElementById('xx-life-wick')).getPropertyValue('--wick'));
            O.barCls = (document.getElementById('xx-life-barfill').parentNode.className || '');
            O.left = (document.getElementById('xx-life-left').textContent || '');
            /* 等心跳把余命烧完：坐化后自动落回寿元页、转世按钮现身 */
            setTimeout(function(){
              O.zuo = XX._zuo();
              O.cur3 = ROUTER.current();
              O.chipZuo = (document.getElementById('sc-life') || {}).textContent;
              var rb = document.getElementById('xx-life-reborn');
              O.rbShown = !!rb && !rb.hidden;
              /* 第 97 轮：结算卡 + 三选一（默认第一件高亮，真点第二件改选） */
              O.sumTxt = (document.getElementById('xx-life-sum').hidden ? 'hid' : 'show') + '/' +
                (document.getElementById('xx-sum-age') || {}).textContent + '/' +
                (document.getElementById('xx-sum-rank') || {}).textContent + '/' +
                (document.getElementById('xx-sum-brk') || {}).textContent;
              var picks = document.querySelectorAll('#xx-life-picks .pick');
              O.pickN = picks.length;
              O.pickOn0 = picks[0] ? picks[0].getAttribute('data-relic') : '';
              if(picks[1]) picks[1].click();
              O.pickSel = XX._legacy.pick();
              if(rb) rb.click();
              setTimeout(function(){
                O.gens = XX._legacy.gens();
                O.mult = XX._legacy.mult();
                O.age = XX._life.age();
                O.rank = XX._s.rank;
                O.chip4 = (document.getElementById('sc-life') || {}).textContent;
                O.relic = XX._legacy.relic();
                O.histN = XX._legacy.hist().length;
                /* 第 107 轮：真转世之后纸签不该空着，也不该停在上一世那一程 */
                if(window.Tutorial) Tutorial.finish();
                XX._trail.render();
                var tb = document.getElementById('sc-trail');
                O.strip = tb ? (tb.dataset.mode + '/' + tb.hidden) : 'none';
                O.stripKick = (document.getElementById('st-kicker') || {}).textContent || '';
                O.stripName = (document.getElementById('st-name') || {}).textContent || '';
                O.t3 = (XX._s.trail3 || {}).i + '/' + (XX._s.trail3 || {}).gen;
                ROUTER.open('life');
                setTimeout(function(){
                  var c2 = document.querySelector('#page-life .hub-nav [data-jump="xx-life-legacy"]');
                  O.cell2 = !!c2;
                  if(c2) c2.click();
                  setTimeout(function(){
                    O.cur5 = ROUTER.current();
                    O.gensTxt = (document.getElementById('xx-life-gens') || {}).textContent || '';
                    O.rows = document.querySelectorAll('#xx-life-leglist .leg-row').length;
                    O.histRows = document.querySelectorAll('#xx-life-hist .leg-row').length;
                    O.histTxt = (document.getElementById('xx-life-hist') || {}).textContent || '';
                    /* 第 99 轮：真点进心魔页——够不到时只能看，追上之后真点照镜 */
                    ROUTER.open('life');
                    setTimeout(function(){
                      var c3 = document.querySelector('#page-life .hub-nav [data-jump="xx-life-mirror"]');
                      O.cell3 = !!c3;
                      if(c3) c3.click();
                      setTimeout(function(){
                        O.cur6 = ROUTER.current();
                        O.mfName = (document.getElementById('xx-mf-name') || {}).textContent || '';
                        O.mfPow = (document.getElementById('xx-mf-foe') || {}).textContent || '';
                        O.mfState = ((document.getElementById('xx-mf-vs') || { dataset: {} }).dataset || {}).state;
                        O.mfBtn = (document.getElementById('xx-mf-fight') || {}).textContent || '';
                        O.mfDis = !!(document.getElementById('xx-mf-fight') || {}).disabled;
                        XX._s.rank = 12; XX._s.mirror.pow = XX._power(); XX._render();
                        var rate1 = XX._rate();   /* 境界抬到 12 也会抬修炼，基线圈在抬完之后的这一档 */                        O.mfBtn2 = (document.getElementById('xx-mf-fight') || {}).textContent || '';
                        var fb = document.getElementById('xx-mf-fight');
                        if(fb) fb.click();
                        O.mfWins = XX._mirror.wins();
                        O.mfRate = XX._rate() / rate1;
                        O.mfTag = (document.getElementById('xx-life-mirror-tag') || {}).textContent || '';
                        __ptDone(O);
                      }, 400);
                    }, 400);
                  }, 400);
                }, 400);
              }, 600);
            }, 3500);
          }, 500);
        }, 500);
      }, 800);
    `,
    checks(d) {
      return [
        { ok: d.chipTag === 'BUTTON' && d.chip0 === '余 1' && d.low0 === true,
          label: '顶栏寿元 chip 是按钮：余命告急显示剩余「余 1」且挂 low',
          detail: [d.chipTag, d.chip0, d.low0].join('/') },
        { ok: String(d.cur1).indexOf('life') === 0 && d.cell === true && d.cur2 === 'life_now',
          label: 'chip 真点进寿元 hub，hub 格真点进寿元页',
          detail: [d.cur1, d.cell, d.cur2].join('/') },
        { ok: d.wick < 0.01 && String(d.barCls).indexOf('low') >= 0 && String(d.left).indexOf('还剩 1 年') === 0,
          label: '寿烛火苗与余命条同步见底，文案写清还剩几年',
          detail: [d.wick, d.barCls, String(d.left).slice(0, 10)].join(' ') },
        { ok: d.zuo === true && d.chipZuo === '坐化' && d.rbShown === true && d.cur3 === 'life_now',
          label: '余命烧完自然坐化：chip 改「坐化」、自动落寿元页、转世按钮现身',
          detail: [d.zuo, d.chipZuo, d.rbShown, d.cur3].join('/') },
        { ok: d.sumTxt === 'show/600 年/金丹初期/3 次' && d.pickN === 3 && d.pickOn0 === 'eq_chixiao',
          label: '坐化结算卡：享年/止步境界/突破次数 + 三件遗物默认选中最强',
          detail: [d.sumTxt, d.pickN, d.pickOn0].join('/') },
        { ok: d.gens === 1 && Math.abs(d.mult - 1.1) < 1e-9 && d.age === 0 && d.rank === 0 &&
              d.chip4 === '余 120' && d.relic === 'eq_xuangui' && d.pickSel === 'eq_xuangui',
          label: '改选第二件后真点转世：带的是玄龟甲，不是默认最强的赤霄剑',
          detail: [d.gens, d.mult, d.age, d.rank, d.chip4, d.relic, d.pickSel].join('/') },
        { ok: d.cell2 === true && d.cur5 === 'life_legacy' && String(d.gensTxt).indexOf('第 1 世') >= 0 && d.rows === 4,
          label: '道统页真点可读：第 1 世 + 四行账（多一行道心）',
          detail: [d.cell2, d.cur5, d.gensTxt, d.rows].join('/') },
        { ok: d.histN === 1 && d.histRows === 1 &&
              String(d.histTxt).indexOf('第 1 世') >= 0 && String(d.histTxt).indexOf('玄龟甲') >= 0 &&
              String(d.histTxt).indexOf('金丹初期') >= 0 && String(d.histTxt).indexOf('600 年') >= 0,
          label: '历代世系记下这一世：第 1 世 · 金丹初期 · 享年 600 · 遗留玄龟甲',
          detail: [d.histN, d.histRows, String(d.histTxt).slice(0, 40)].join('/') },
        { ok: d.cell3 === true && d.cur6 === 'life_mirror' &&
              String(d.mfName).indexOf('第 1 世的你') > 0 && d.mfPow !== '' &&
              d.mfState === 'short' && d.mfDis === true && String(d.mfBtn).indexOf('还差') === 0,
          label: '心魔页真点可读：镜里是上一世的你，战力不够时按钮只写「还差」',
          detail: [d.cell3, d.cur6, d.mfName, d.mfPow, d.mfState, d.mfBtn].join('/') },
        { ok: String(d.mfBtn2).indexOf('照镜') === 0 && d.mfWins === 1 &&
              Math.abs(d.mfRate - 1.02) < 1e-9 && d.mfTag === '道心 1 胜',
          label: '战力追上后真点照镜：道心 +1、修炼 ×1.02、页眉题签跟着换',
          detail: [d.mfBtn2, d.mfWins, d.mfRate, d.mfTag].join('/') },
        { ok: d.t3 === '0/1' && d.strip === 'lun/false' && d.stripKick === '轮回 · 第1世 · 1/3' &&
              d.stripName === '重修 · 结丹',
          label: '真转世之后纸签换成「轮回 · 第1世」第一关（不再停在上一世那一程）',
          detail: [d.t3, d.strip, d.stripKick, d.stripName].join('/') }
      ];
    }
  },

  /* ⑭ 存档备份（第 78 节）：设置 → 导出 → 粘贴改档 → 校验 → 覆盖写入 → 旧内存不许反写 */
  {
    id: 'savebak', name: '存档备份（导出·校验·导入·冻结旧内存）', budget: 9000, size: '900,1200',
    save() {
      const s = midSave();
      s.name = '巡检本尊'; s.rank = 15; s.stone = 654321;
      return s;
    },
    body: `
      setInterval(__clearPopups, 200);
      var O = {};
      setTimeout(function(){
        document.getElementById('sc-settings').click();
        O.entryShown = __vis('settings-modal');
        document.getElementById('m-backup').click();
        O.open = __vis('save-modal');
        O.setClosed = !__vis('settings-modal');
        O.cur = (document.getElementById('sv-cur').textContent || '');
        O.applyLocked = document.getElementById('sv-apply').disabled;

        document.getElementById('sv-copy').click();
        var out = document.getElementById('sv-out');
        O.copyShown = __vis('sv-out');
        var exp = null;
        try{ exp = JSON.parse(out.value); }catch(e){}
        O.copyParse = !!exp && exp.name === XX._s.name;

        exp.name = '备份归'; exp.stone = 4321; exp.last = Date.now() - 3 * 86400000;
        var tin = document.getElementById('sv-in');
        tin.value = JSON.stringify(exp);
        tin.dispatchEvent(new Event('input', { bubbles:true }));
        O.resetOnInput = !document.getElementById('sv-prev').classList.contains('show');
        document.getElementById('sv-check').click();
        O.prevOk = document.getElementById('sv-prev').classList.contains('ok');
        O.prevTxt = document.getElementById('sv-prev').textContent || '';
        O.applyOn = !document.getElementById('sv-apply').disabled;

        tin.value = '{"rank":"oops"}';
        tin.dispatchEvent(new Event('input', { bubbles:true }));
        document.getElementById('sv-check').click();
        O.badOk = document.getElementById('sv-prev').classList.contains('bad') &&
          (document.getElementById('sv-prev').textContent || '').indexOf('✗') === 0;
        O.applyOff = document.getElementById('sv-apply').disabled;

        tin.value = JSON.stringify(exp);
        tin.dispatchEvent(new Event('input', { bubbles:true }));
        document.getElementById('sv-check').click();
        document.getElementById('sv-apply').click();
        O.doneShown = document.getElementById('sv-done').classList.contains('show');
        O.doneMeta = document.getElementById('sv-done-meta').textContent || '';
        O.applyOff2 = document.getElementById('sv-apply').disabled;
        O.exportLocked = document.getElementById('sv-download').disabled &&
          document.getElementById('sv-copy').disabled;
        O.hint = document.getElementById('sv-copy-hint').textContent || '';
        O.memName = XX._s.name;
        O.memStone = XX._s.stone;

        var rd = function(){
          try{ return JSON.parse(localStorage.getItem('xiuxian_save')) || {}; }catch(e){ return {}; }
        };
        var a = rd();
        O.savedName = a.name; O.savedStone = a.stone;
        O.savedLast = Math.abs((a.last || 0) - Date.now()) < 5000;
        XX.save();                               /* 手动触发一次自动保存 */
        var b = rd();
        O.guardNow = b.name === '备份归' && b.stone === 4321;
        setTimeout(function(){
          var c = rd();
          O.guardLater = c.name === '备份归' && c.stone === 4321;
          document.getElementById('sv-close').click();
          O.closed = !__vis('save-modal');
          __ptDone(O);
        }, 1500);
      }, 800);
    `,
    checks(d) {
      return [
        { ok: d.entryShown === true && d.open === true && d.setClosed === true,
          label: '设置 → 存档备份打开，设置层自动收起',
          detail: [d.entryShown, d.open, d.setClosed].join('/') },
        { ok: (d.cur || '').indexOf('巡检本尊') >= 0 && /存档 [0-9.]+ ?(B|KB|MB)/.test(d.cur || '') &&
              d.applyLocked === true,
          label: '当前存档写清道号与大小；未校验前写入置灰',
          detail: (d.cur || '').replace(/\s+/g, ' ') + ' locked=' + d.applyLocked },
        { ok: d.copyShown === true && d.copyParse === true,
          label: '复制存档文本落到文本框，且是当前档的可解析 JSON',
          detail: [d.copyShown, d.copyParse].join('/') },
        { ok: d.resetOnInput === true && d.prevOk === true && (d.prevTxt || '').indexOf('备份归') >= 0 &&
              d.applyOn === true,
          label: '粘贴新档：改输入即清预览，校验后报道号并解锁',
          detail: (d.prevTxt || '').replace(/\s+/g, ' ') },
        { ok: d.badOk === true && d.applyOff === true,
          label: '非法内容显示 ✗ 并重新置灰', detail: 'bad=' + d.badOk + ' off=' + d.applyOff },
        { ok: d.doneShown === true && (d.doneMeta || '').indexOf('备份归') >= 0 &&
              d.applyOff2 === true && d.exportLocked === true,
          label: '写入后面板报新档，写入/导出按钮一起锁住',
          detail: (d.doneMeta || '') + ' exportLocked=' + d.exportLocked },
        { ok: d.savedName === '备份归' && String(d.savedStone) === '4321' && d.savedLast === true,
          label: 'localStorage 换成导入档，last 改成此刻（挡重复导入刷离线）',
          detail: [d.savedName, d.savedStone, d.savedLast].join(' / ') },
        { ok: d.memName !== '备份归' && d.memStone !== 4321 && d.guardNow === true &&
              d.guardLater === true && d.closed === true,
          label: '旧内存未反写（手动/延时保存都盖不掉新档），弹窗可关',
          detail: ['mem=' + d.memName + '/' + d.memStone, 'now=' + d.guardNow,
                   'later=' + d.guardLater, 'closed=' + d.closed].join(' ') }
      ];
    }
  },

  /* ⑱ 宗门互助真连（Node 侧起了真服务，见文件顶部）。验的是「第二个真人能不能连上」这条链路：
     地址解析 → 探活 → 甲点【发起求助】 → 乙护法 → 甲突破结算 → 乙领灵石 → 世界频道播报 → 设置里看得见连的是谁。
     乙用裸 fetch 走真 HTTP（服务端的跨玩家规则另有 server/sect-server.test.js 覆盖），
     甲全程走真客户端代码与真点击。修为被动挂机也在涨，所以增量只断言下限，确切数字钉在日志行上。 */
  {
    id: 'sect', name: '宗门互助真连（真服务 · 两个玩家）', budget: 26000, size: '900,1200',
    /* 这场是唯一真发 HTTP 的：默认虚拟时间策略一路快进、不等网络，fetch 会在响应回来前就被预算烧光。 */
    vtp: 'pauseIfRequestsFetch',
    save() {
      const s = midSave();
      s.name = '巡检甲'; s.rank = 8; s.exp = 0; s.stone = 1000;
      return s;
    },
    seedExtra() {
      return 'localStorage.setItem("arcade_sect_pid","paaaaaaaaaaaa");' +
        'localStorage.setItem("arcade_nick","巡检甲");' +
        'localStorage.setItem("arcade_sect_host",' +
        JSON.stringify(SECT_URL || 'http://127.0.0.1:1') + ');';
    },
    body: () => `
      setInterval(__clearPopups, 200);
      var O = { srv: ${JSON.stringify(SECT_URL)}, srvErr: ${JSON.stringify(SECT_ERR)} };
      var URL = ${JSON.stringify(SECT_URL)};
      var PB = 'pbbbbbbbbbbbb';
      function api(name, q, body){
        var u = URL + '/api/sect/' + name + '?' + new URLSearchParams(q).toString();
        return fetch(u, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' },
                                 body: JSON.stringify(body) } : { cache: 'no-store' })
          .then(function(r){ return r.json(); });
      }
      function nap(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
      function waitOnline(n){
        return new Promise(function(res){
          var t = setInterval(function(){
            if(SECT._state().online || --n <= 0){ clearInterval(t); res(SECT._state()); }
          }, 150);
        });
      }
      setTimeout(async function(){
        var st = await waitOnline(30);
        O.online = st.online === true;
        O.host = st.host || '';
        if(!O.online){ __ptDone(O); return; }

        /* 真点：修为攒满 → 开宗门页 → 点【发起求助】 */
        XX._s.exp = XX._need(XX._s.rank);
        ROUTER.open('zong_help');
        await nap(500);
        O.pubBtn = __click('[data-act="pub"]');
        await nap(1200);
        var st2 = SECT._state();
        O.reqId = (st2.req && st2.req.id) || '';
        O.quota = (document.getElementById('sc-quota') || {}).textContent || '';
        if(!O.reqId){ __ptDone(O); return; }

        /* 乙（另一个 pid）真发 HTTP 护法 */
        var g = await api('guard', { pid: PB, nick: '巡检乙' }, { pid: PB, nick: '巡检乙', reqId: O.reqId });
        O.guardOk = g.ok === true;
        O.guardStone = Math.floor(g.preview || 0);

        await SECT.refresh();
        await nap(400);
        var st3 = SECT._state();
        O.guards = st3.req ? st3.req.guards : -1;
        O.bonus = SECT.bonusRate();
        O.mineTxt = ((document.getElementById('sc-mine') || {}).textContent || '').replace(/\\s+/g, ' ').slice(0, 60);
        O.members = st3.stats ? st3.stats.members : -1;
        O.onlineCnt = st3.stats ? st3.stats.online : -1;
        O.roster = st3.stats ? (st3.stats.roster || []).map(function(x){ return x.nick; }).join(',') : '';
        O.events = st3.stats ? (st3.stats.events || []).length : -1;

        /* 甲突破成功 → 结算 → 护法修为自动入账 */
        var expBefore = Math.floor(XX._s.exp);
        await SECT.afterBreak(true, XX._s.rank);
        await nap(800);
        O.reqGone = SECT._state().req === null;
        O.expGain = Math.floor(XX._s.exp) - expBefore;
        O.note = SECT._state().noteTxt || '';
        O.logged = (XX._s.log || []).some(function(x){
          return String(x.t || '').indexOf('宗门互助结算：修为 +3000') >= 0;
        });

        /* 乙那份灵石：待领 → 领取 */
        var meB = await api('me', { pid: PB, nick: '巡检乙' });
        O.pendB = meB.me ? Math.floor(meB.me.pendStone) : -1;
        var clB = await api('claim', { pid: PB, nick: '巡检乙' }, { pid: PB, nick: '巡检乙' });
        O.claimB = clB.ok === true ? Math.floor(clB.stone) : -1;

        /* 世界频道该有一条系统播报 */
        var ch = await fetch(URL + '/api/chat/history?since=0&pid=' + PB + '&nick=x', { cache: 'no-store' })
          .then(function(r){ return r.json(); });
        O.chatSys = (ch.list || []).some(function(m){ return m.sys && String(m.text || '').indexOf('护法') >= 0; });

        /* 设置里看得见连的是哪个地址（换服务器/开隧道时不用开控制台猜） */
        document.getElementById('sc-settings').click();
        var ss = document.getElementById('m-sect-state');
        O.stateTxt = ss ? (ss.textContent || '') : 'NOEL';
        O.stateOn = ss ? ss.className === 'on' : false;
        document.getElementById('m-cancel').click();
        __ptDone(O);
      }, 700);
    `,
    checks(d) {
      return [
        { ok: !!d.srv && d.online === true && d.host === d.srv,
          label: '真服务连上了，用的就是填的地址（不是本机默认）',
          detail: d.srvErr ? '服务没起：' + d.srvErr : (d.host || '未连') },
        { ok: d.pubBtn === 'ok' && !!d.reqId && (d.quota || '').indexOf('求助 1/3') >= 0,
          label: '点【发起求助】真贴出去了，配额走到 1/3', detail: [d.pubBtn, d.quota].join(' / ') },
        { ok: d.guardOk === true && d.guards === 1 && d.guardStone === 84,
          label: '另一个玩家护法成功：甲看到 1 人、乙记 84 灵石',
          detail: [d.guardOk, d.guards, d.guardStone].join('/') },
        { ok: d.bonus === 0.07 && (d.mineTxt || '').indexOf('+7%') >= 0,
          label: '护法加成算出来并写在面板上（1 人 = +7%）',
          detail: d.bonus + ' ' + (d.mineTxt || '') },
        { ok: d.members === 2 && d.onlineCnt === 2 && (d.roster || '').indexOf('巡检乙') >= 0 && d.events >= 2,
          label: '山门气象：两个玩家都在册在场，动态流留了痕',
          detail: [d.members, d.onlineCnt, d.roster, d.events].join(' / ') },
        { ok: d.reqGone === true && d.expGain >= 3000 && (d.note || '').indexOf('修为 +3000') >= 0 &&
              d.logged === true,
          label: '突破结算：求助关掉、修为 +3000 真入账（日志钉死确切数）',
          detail: [d.reqGone, d.expGain, d.note, d.logged].join(' / ') },
        { ok: d.pendB === 84 && d.claimB === 84,
          label: '乙的护法灵石可领且真领到', detail: [d.pendB, d.claimB].join('/') },
        { ok: d.chatSys === true, label: '世界频道收到护法播报', detail: String(d.chatSys) },
        { ok: d.stateOn === true && d.stateTxt === '已连上',
          label: '设置只报「已连上」，不把服务器地址/IP 露给玩家', detail: d.stateTxt }
      ];
    }
  },

  /* ⑮ 入门八事（第 105 轮）：场景上那张纸签，新人真点得动、真会往下走
     这一场只用真按钮：点纸签 → 点【打坐】三下 → 纸签跳到采药 → 点【采药】两下。
     境界钉在 0、其余统计清零，第三事（破境）就卡在那儿不动 —— 后面每一步的账才好对。 */
  {
    id: 'trail', name: '入门八事纸签（点「去」· 打坐三下 · 采药两下）', budget: 12000, size: '900,1200',
    save() {
      const s = baseSave();
      s.rank = 0; s.exp = 0; s.cave = 0; s.towerMax = 0;
      s.stone = 0; s.herb = 0; s.ore = 0;
      s.stats = { sit: 0, herb: 0, train: 0, enlight: 0, craftPill: 0, explore: 0, hunt: 0,
                  enhance: 0, stoneEarned: 0, farmN: 0 };
      s.acts = { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 };
      s.secret = { prog: [0, 0, 0, 0], day: '', swept: 0 };
      s.story = { claimed: allClaimed() };     /* 主线浮片别在这场上台挡路 */
      s.trail = { i: 0 };
      return s;
    },
    body: `
      setInterval(__clearPopups, 200);
      var S = XX._s, O = {};
      function t(id){ return (document.getElementById(id) || {}).textContent || ''; }
      function pips(){
        var p = document.querySelectorAll('#st-pips i'), d = 0, n = 0;
        for(var i = 0; i < p.length; i++){
          if(p[i].className === 'done') d++;
          if(p[i].className === 'now') n++;
        }
        return p.length + '/' + d + '/' + n;
      }
      /* 冷却与当日次数是另一套账（8s / 10 次，verify 里有专测）：这里清掉冷却并把按钮解禁，
         再走元素自己那条点击链路 —— 测的是纸签，不是等冷却 */
      function tap(sel){
        XX._resetCd();
        var b = document.querySelector(sel);
        if(!b) return 'NOBUTTON';
        b.disabled = false;
        b.click();
        return 'ok';
      }
      setTimeout(function(){
        XX._setBattleAnim(false);
        /* R-3 已修（阶段一）：引导在台时纸签必须让位，所以本场先真把太虚引导走完（skip = 玩家点「跳过」），
           再验纸签本身；否则量到的是「引导期纸签藏起来」这条新行为，不是本场要验的入门八事。 */
        try{ if(window.Guide) Guide.skip(); }catch(e){}
        try{ XX._trail.render(); }catch(e){}
        var box = document.getElementById('sc-trail');
        /* 1) 新档一进游戏，纸签就摆在场景上，写的是第一事 */
        O.show = box.hidden ? 'hidden' : 'shown';
        O.s1 = t('st-seal') + '|' + t('st-name') + '|' + t('st-prog') + '|' + box.dataset.k;
        O.p1 = pips();
        /* 2) 真点纸签：第一事就在本页 → 圈住【打坐】，人不离开场景 */
        box.click();
        var sit = document.querySelector('#sc-acts .cave-act[data-k="sit"]');
        O.ring = sit ? (sit.className.indexOf('trail-ring') >= 0 ? 'ring' : 'none') : 'NOBUTTON';
        O.stay = ROUTER.current();
        /* 3) 真点【打坐】三下 */
        for(var i = 0; i < 3; i++) tap('#sc-acts .cave-act[data-k="sit"]');
        O.s2 = t('st-seal') + '|' + t('st-name') + '|' + t('st-prog') + '|' + box.dataset.k;
        O.hint2 = t('st-hint');
        O.p2 = pips();
        O.sitN = S.stats.sit;
        O.log1 = (S.log[0] || {}).t || '';
        /* 4) 多打一下：这一步只该发一次奖 */
        tap('#sc-acts .cave-act[data-k="sit"]');
        O.dup = S.log.filter(function(l){ return (l.t || '').indexOf('入门第一事') >= 0; }).length;
        /* 5) 再点纸签：第二事不在本页 → 路由到藏经阁「修炼」日课 */
        box.click();
        setTimeout(function(){
          O.here = ROUTER.current();
          O.herbBtn = !!document.querySelector('#xx-actions .act[data-k="herb"]');
          for(var i = 0; i < 2; i++) tap('#xx-actions .act[data-k="herb"]');
          O.s3 = t('st-seal') + '|' + t('st-name') + '|' + t('st-prog') + '|' + box.dataset.k;
          O.p3 = pips();
          O.herb = S.herb;
          O.herbN = S.stats.herb;
          O.log2 = (S.log[0] || {}).t || '';
          O.awards = S.log.filter(function(l){ return (l.t || '').indexOf('入门第') >= 0; }).length;
          try{ O.saved = JSON.parse(XX._saveText()).trail.i; }catch(e){ O.saved = 'ERR'; }
          __ptDone(O);
        }, 420);
      }, 700);
    `,
    checks(d) {
      return [
        { ok: d.show === 'shown' && d.s1 === '一|打坐三炷香|0/3|sit',
          label: '新档进游戏（引导走完后）：纸签自己摆在场景上，写着第一事「打坐三炷香」0/3',
          detail: d.show + ' · ' + d.s1 },
        { ok: d.p1 === '8/0/1', label: '八个点：头一个亮着、前头没有已了', detail: d.p1 },
        { ok: d.ring === 'ring' && d.stay === 'scene',
          label: '真点纸签：圈住【打坐】，人还留在场景页', detail: d.ring + ' · ' + d.stay },
        { ok: d.s2 === '二|采两把灵草|0/2|herb' && (d.hint2 || '').indexOf('藏经阁') >= 0,
          label: '打坐三下：纸签自己翻到第二事「采两把灵草」，提示指去藏经阁',
          detail: d.s2 + ' · ' + d.hint2 },
        { ok: d.p2 === '8/1/1' && d.sitN === 3,
          label: '点数跟着走：一件已了、下一件亮着', detail: d.p2 + ' · 打坐 ' + d.sitN },
        { ok: d.log1 === '📜 入门第一事 · 打坐三炷香：修为 +4，灵石 +5。',
          label: '第一事当场结账（炼气一层 need=40：修为 +4、灵石 +5），日志钉死这条',
          detail: d.log1 },
        { ok: d.dup === 1, label: '多打一下也不会重复发奖', detail: '入门第一事 ×' + d.dup },
        { ok: d.here === 'xiu_acts' && d.herbBtn === true,
          label: '真点纸签：第二事路由到藏经阁「修炼」页，日课里就有【采药】',
          detail: [d.here, d.herbBtn].join(' · ') },
        { ok: /^三\|破境至炼气三层\|\d+%\|brk$/.test(d.s3 || ''),
          label: '采药两下：纸签翻到第三事「破境至炼气三层」，进度换成修为百分比',
          detail: d.s3 },
        { ok: d.p3 === '8/2/1' && d.herbN === 2 && d.herb === 12,
          label: '采药两下真入账：灵草 3+3，加上第二事的 6 株 = 12',
          detail: d.p3 + ' · 统计 ' + d.herbN + ' · 灵草 ' + d.herb },
        { ok: d.log2 === '📜 入门第二事 · 采两把灵草：修为 +4，灵石 +5，灵草 +6。',
          label: '第二事结账那条日志一字不差', detail: d.log2 },
        { ok: d.awards === 2 && d.saved === 2,
          label: '两条奖、存档停在第三事（关掉页再回来接着走，不用从头）',
          detail: '奖 ×' + d.awards + ' · trail.i ' + d.saved }
      ];
    }
  },
  {
    id: 'trail2', name: '道途十二程（八事之后接上 · 抬境界当场入账 · 题跋 · 日课十下）',
    budget: 12000, size: '900,1200',
    save() {
      const s = baseSave();
      s.rank = 8; s.exp = 0; s.stone = 0; s.herb = 0; s.ore = 0;
      s.towerMax = 0; s.dt = {}; s.wu = { sword: 0, dan: 0, array: 0 };
      s.secret = { prog: [0, 0, 0, 0], day: '', swept: 0 };
      s.gate = { lv: 0, grad: 0, disciples: [] };
      s.story = { claimed: allClaimed() };
      s.trail = { i: 8 };            /* 八事已了：纸签该换道途，而不是自己藏起来 */
      s.trail2 = { i: 0 };
      return s;
    },
    body: `
      setInterval(__clearPopups, 200);
      var S = XX._s, O = {};
      function t(id){ return (document.getElementById(id) || {}).textContent || ''; }
      function pips(){
        var p = document.querySelectorAll('#st-pips i'), d = 0, n = 0;
        for(var i = 0; i < p.length; i++){
          if(p[i].className === 'done') d++;
          if(p[i].className === 'now') n++;
        }
        return p.length + '/' + d + '/' + n;
      }
      function tap(sel){
        XX._resetCd();
        var b = document.querySelector(sel);
        if(!b) return 'NOBUTTON';
        b.disabled = false;
        b.click();
        return 'ok';
      }
      setTimeout(function(){
        XX._setBattleAnim(false);
        var box = document.getElementById('sc-trail');
        /* 1) 八事已了的老档：纸签不收起，当场换成道途第一程 */
        O.s1 = (box.hidden ? 'hidden' : 'shown') + '|' + t('st-kicker') + '|' +
               t('st-seal') + '|' + t('st-name') + '|' + box.dataset.mode;
        O.p1 = pips();
        /* 2) 点纸签：第一程要的是【突破】→ 圈住突破钮，人还留在场景 */
        box.click();
        O.go = (document.getElementById('sc-break').classList.contains('trail-ring') ? 'ring' : 'none')
             + '|' + ROUTER.current();
        /* 3) hub 卷尾题跋写同一句（洞府 hub 底部那行） */
        ROUTER.open('xiu');
        var sc = document.querySelector('#page-xiu .hub-scroll');
        O.hub = sc ? [(sc.querySelector('.hs-title') || {}).textContent,
                      (sc.querySelector('.hs-sub') || {}).textContent,
                      (sc.querySelector('.hs-idx') || {}).textContent].join('|') : 'none';
        ROUTER.back();
        /* 4) 条件真到了才走：抬到筑基，等心跳那一帧自己入账 */
        S.rank = 9;
        setTimeout(function(){
          O.s2 = t('st-kicker') + '|' + t('st-name') + '|' + t('st-prog');
          O.chain = pips();
          var hit = S.log.filter(function(l){ return (l.t || '').indexOf('道途第一程') >= 0; });
          O.log1 = (hit[0] || {}).t || '';
          O.pill = S.bag.filter(function(b){ return b.t === 'dan2'; }).length;
          O.awards = S.log.filter(function(l){ return (l.t || '').indexOf('🧭 道途第') >= 0; }).length;
          /* 5) 日课：打坐真点十下，按钮还得亮着、副标题报剩几次 */
          ROUTER.open('xiu_acts');
          S.acts = { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 };
          S.stats.sit = 0;
          for(var i = 0; i < 10; i++) tap('#xx-actions .act[data-k="sit"]');
          XX._resetCd(); XX._renderCd();
          var sb = document.querySelector('#xx-actions .act[data-k="sit"]');
          O.act = S.acts.sit + '|' + (sb ? sb.disabled : 'none') + '|' +
                  (sb ? ((sb.querySelector('small') || {}).textContent || '') : '');
          try{ O.saved = JSON.parse(XX._saveText()).trail2.i; }catch(e){ O.saved = 'ERR'; }
          __ptDone(O);
        }, 900);
      }, 700);
    `,
    checks(d) {
      return [
        { ok: d.s1 === 'shown|道途 · 1/12|道|筑基|dao',
          label: '八事已了的老档一进游戏：纸签换成道途第一程「筑基」，印信写「道」',
          detail: d.s1 },
        { ok: d.p1 === '12/0/1',
          label: '十二道刻痕，一件没成、头一道亮着', detail: d.p1 },
        { ok: d.go === 'ring|scene',
          label: '真点纸签：圈住顶上【突破】，人还留在场景页', detail: d.go },
        { ok: /^道途 · 筑基\|第一程 · [0-9]+%\|1 \/ 12$/.test(String(d.hub)),
          label: '洞府 hub 卷尾题跋写同一句：走到哪一程、进度多少（三段结构照钉，只把中间百分数放开为「数字+百分号」不锁具体值——它是 game.js trail2Prog 随档浮动的量，写死 0% 就是 R-2）',
          detail: d.hub },
        { ok: d.s2 === '道途 · 2/12|登镇妖塔五层|0 / 5',
          label: '抬到筑基：心跳那一帧自己入账，纸签翻到第二程「登镇妖塔五层」',
          detail: d.s2 },
        { ok: d.chain === '12/1/1',
          label: '刻痕跟着走：第一道变已了、第二道亮着', detail: d.chain },
        { ok: (d.log1 || '').indexOf('🧭 道途第一程 · 筑基：修为 +') === 0 &&
              (d.log1 || '').indexOf('中品破境丹 ×1') > 0,
          label: '入账那笔日志写明第几程、事名与破境丹', detail: d.log1 },
        { ok: d.pill === 1 && d.awards === 1,
          label: '中品破境丹真进背包，且只入一笔（不重复发）',
          detail: '丹 ×' + d.pill + ' · 奖 ×' + d.awards },
        /* W1 修 B（阶段一）：打坐副文改报实得 + 今日档位；次数与可点性照旧钉死。 */
        { ok: /^10\|false\|修为 \+[\d,]+（今日主动 \d+% · 效率 (100|50|25)%） · 剩 20 次$/.test(String(d.act)),
          label: '日课打坐真点十下：次数从 30 扣到 20，按钮还亮着，副文报实得与今日档位（旧口径第 10 下就灰、且只写「+10 秒」）',
          detail: d.act },
        { ok: d.saved === 1,
          label: '进度落盘：关掉页再回来接着走第二程', detail: 'trail2.i ' + d.saved }
      ];
    }
  },
  /* ===== 第 109 轮 · W1「塔底」：一条线索换来的世界事件（识人页听 → 塔页俯身 → 契机 → 三选一 → 终态回响） =====
     老档起步（save() 里不写 worldFoot，读档补空串），全程真点击：
     俯身、抬塔层到契机、点【请沈碑下来】，再走回识人页看回响与「已印证」。 */
  {
    id: 'worldfoot', name: '塔底三线（老档起步 · 俯身 · 契机 · 真点一扇 · 回响）', budget: 18000, size: '900,1200',
    save() {
      const s = baseSave();
      s.story = { claimed: allClaimed() };        /* 主线浮片别在这场上台挡路 */
      s.rank = 6; s.exp = 400; s.tower = 1; s.towerMax = 1; s.guardMirror = 0;
      s.insight = 0; s.wisdom = 120; s.dao = 0; s.trun = 0;
      /* 沈碑：④「山外」听过（线索判定仍只认 heard），关系 20 —— 够请他下来 */
      s.npcs = { stele: { met: 1, rel: 20, stage: 2, seenGens: 0, lastSeen: Date.now(), nudgeAt: 0,
        heard: ['stele1', 'stele3', 'stele4'],
        choice: { listened: 1, showoff: 0, promise: 0 },
        cur: { lastRank: 6, talk: 4, promptTale: 0 } } };
      return s;
    },
    body: `
      setInterval(__clearPopups, 250);
      var S = XX._s, O = {};
      function tt(id){ var e = document.getElementById(id); return e ? e.textContent : ''; }
      function footBtns(){ return Array.prototype.slice.call(document.querySelectorAll('#xx-tower [data-foot]')); }
      function footIds(){ return footBtns().map(function(b){ return b.dataset.foot; }).join(','); }
      function lastRew(){ var a = document.querySelectorAll('#xx-tower .tw-rew');
        return a.length ? a[a.length - 1].textContent : ''; }
      function persisted(){ try{ return JSON.parse(localStorage.getItem('xiuxian_save') || '{}'); }catch(e){ return {}; } }
      function snap(){ return { ins: S.insight | 0, wis: S.wisdom | 0, gd: S.guardMirror | 0,
        foot: S.worldFoot, mile: (S.miles && S.miles.m_foot) ? 1 : 0, done: XX._milesDone(),
        ear: (S.stats && S.stats.stoneEarned) | 0 }; }
      setTimeout(function(){
        XX._setBattleAnim(false);
        ROUTER.open('tower');
        setTimeout(function(){
          var b0 = snap();
          /* 1) 线索已听 + 真进过塔：入口只有一枚【俯身看脚下】；2f 题记同时在，终态回响还没有影 */
          O.footBefore = b0.foot;
          O.gates = footIds();
          O.clue2f = document.getElementById('npc-echo-tower').hidden ? 'hidden' : 'shown';
          O.echoBefore = document.getElementById('world-echo-tower') ? 'shown' : 'none';
          /* 2) 真点俯身：只换状态，顿悟/悟道值/护心镜/道碑一项都不动；契机未到 → 一句等头、三扇门不出 */
          footBtns()[0].click();
          setTimeout(function(){
            var b1 = snap();
            O.dug = b1.foot;
            O.dugBtns = footIds();
            O.wait = lastRew();
            O.dugQuiet = (b1.ins === b0.ins && b1.wis === b0.wis && b1.gd === b0.gd && b1.mile === 0) ? 'ok' : 'bad';
            O.dugSaved = persisted().worldFoot;
            /* 3) 契机：把镇妖塔打通到第 3 层（真人推塔等价于抬历史最高）——三扇门当场登场 */
            S.towerMax = 3;
            setTimeout(function(){
              var c0 = snap();
              O.doors = footIds();
              O.needHalf = Math.round(XX._need(S.rank) * 0.5);
              var ob = document.querySelector('#xx-tower [data-foot="open"]');
              O.openBtn = ob ? (ob.disabled ? 'off' : 'on') : 'none';
              /* 4) 真点【请沈碑下来】（关系 20 过 15 那道槛）：顿悟 +12、悟道值与护心镜一动不动。
                 道碑走的是全局那条 3 秒节流判据（不为 W1 开特例）；无头环境里 setInterval 被虚拟时间
                 饿着（实测等 4.6 秒只跳一拍），所以这里照 verify_npc_ui 的做法显式跑一次同一判据，
                 把它当作"真人 3 秒内必然看到的那一跳"。 */
              ob.click();
              setTimeout(function(){
                var c1 = snap();
                O.picked = c1.foot;
                O.doorsGone = footIds();
                O.towerEcho = tt('world-echo-tower');
                O.insDelta = c1.ins - c0.ins;
                O.wisDelta = c1.wis - c0.wis;
                O.gdDelta = c1.gd - c0.gd;
                /* 同步夹两次快照：中间没有挂机自然量，灵石增量就是这块碑的奖（needOf×0.5），一分不多 */
                var got = XX._checkMiles(true);
                var c2 = snap();
                O.mileGot = got;
                O.mileWas = c1.mile;
                O.mileNow = c2.mile;
                O.doneDelta = c2.done - c1.done;
                O.mileStone = c2.ear - c1.ear;
                /* 5) 终态不可逆：塔上没有第二枚按钮，走同一条点击链路也不会重算一遍 */
                O.reclick = document.querySelector('#xx-tower [data-foot="open"]') ? 'still-there' : 'gone';
                var c3 = snap();
                O.idemIns = c3.ins - c2.ins;
                O.idemMile = c3.mile;
                /* 6) 回识人页：回响独立成块、线索③由「已解」升「已印证」，两页文本不同 */
                ROUTER.open('role');
                setTimeout(function(){
                  ROUTER.open('role', 'xx-role-npc');
                  setTimeout(function(){
                    O.echoNodes = document.querySelectorAll('#npc-world-echo').length;
                    O.npcEcho = tt('npc-world-echo');
                    var rows = document.querySelectorAll('#npc-clues .sto-item');
                    O.em3 = rows.length > 2 ? (rows[2].querySelector('.sto-h em') || {}).textContent : 'norow';
                    var sv = persisted();
                    O.savedFoot = sv.worldFoot;
                    O.savedMile = (sv.miles && sv.miles.m_foot) ? 1 : 0;
                    __ptDone(O);
                  }, 700);
                }, 450);
              }, 700);
            }, 800);
          }, 700);
        }, 800);
      }, 700);
    `,
    checks(d) {
      if (d.__err) return [{ ok: false, label: 'W1 巡检报错', detail: d.__err }];
      return [
        { ok: d.footBefore === '' && d.gates === 'dig' && d.clue2f === 'shown' && d.echoBefore === 'none',
          label: '老档起步 + 听过「山外」：塔页只给一枚【俯身看脚下】，2f 题记在、终态回响还没有',
          detail: [d.footBefore, d.gates, d.clue2f, d.echoBefore].join(' · ') },
        { ok: d.dug === 'dug' && d.dugBtns === '' && d.dugQuiet === 'ok' && d.dugSaved === 'dug',
          label: '真点俯身：状态换成 dug 并落盘，五项数值零入账，三扇门不提前登场',
          detail: [d.dug, JSON.stringify(d.dugBtns), d.dugQuiet, d.dugSaved].join(' · ') },
        { ok: (d.wait || '').indexOf('护心镜') >= 0 && (d.wait || '').indexOf('第 3 层') >= 0,
          label: '契机未到那一句写明两条路（带一面护心镜 / 塔打通到第 3 层）', detail: d.wait },
        { ok: d.doors === 'open,self,seal' && d.openBtn === 'on',
          label: '塔到第 3 层：三扇门按 open·self·seal 顺序登场，关系 20 过槛不置灰',
          detail: d.doors + ' · ' + d.openBtn },
        { ok: d.picked === 'open' && d.doorsGone === '' && d.reclick === 'gone' && d.idemIns === 0,
          label: '选完即终态：三扇门当场消失，再走点击链路顿悟零变化（不可逆、不重复结算）',
          detail: [d.picked, JSON.stringify(d.doorsGone), d.reclick, '顿悟 Δ' + d.idemIns].join(' · ') },
        { ok: d.insDelta === 12 && d.wisDelta === 0 && d.gdDelta === 0,
          label: '甲案本身只发一项：顿悟 +12（未触 100 封顶），悟道值与护心镜一动不动',
          detail: '顿悟 +' + d.insDelta + ' · 悟道 Δ' + d.wisDelta + ' · 镜 Δ' + d.gdDelta },
        { ok: d.mileNow === 1 && d.mileWas === 0 && d.mileGot === 1 && d.doneDelta === 1 &&
              Math.abs(d.mileStone - d.needHalf) <= 1 && d.savedMile === 1,
          label: '全局道碑判据这一步只立「塔下一线」一块碑（不牵连别的碑），奖 = needOf×0.5 且当场落盘',
          detail: '选前 ' + d.mileWas + ' · 选后 ' + d.mileNow + ' · 这一步立 ' + d.mileGot + ' 块 · 总增量 ' +
            d.doneDelta + ' · 碑奖实测 ' + d.mileStone + '（应为 ' + d.needHalf + '） · 存档 ' + d.savedMile },
        { ok: d.towerEcho === '脚下那块石被人翻过又按回去，缝里透下一线光。',
          label: '塔页回响是甲案那一句（三条各不相同，由 worldFoot 现算派生）', detail: d.towerEcho },
        { ok: d.echoNodes === 1 && d.npcEcho.indexOf('他下去了') >= 0 && d.npcEcho !== d.towerEcho,
          label: '识人页回响独立一块、文本与塔页不同（同一件事的两面，不落第二份事实）',
          detail: '壳 ×' + d.echoNodes + ' · ' + d.npcEcho },
        { ok: d.em3 === '已印证' && d.savedFoot === 'open',
          label: '线索③升「已印证」、终态落盘：关掉页再回来仍是这一条',
          detail: d.em3 + ' · ' + d.savedFoot }
      ];
    }
  },
  /* ===== 第 109 轮 · W1 下半场：终态存档冷开（关掉页面再回来，还是这一条） =====
     上一场停在 worldFoot='open'；这一场直接从那份档起，验证「重开 = 只读回响，不再结算、不再给入口」。 */
  {
    id: 'worldfoot2', name: '塔底回响跨重开（终态存档冷启 · 无入口 · 零结算）', budget: 12000, size: '900,1200',
    save() {
      const s = baseSave();
      s.story = { claimed: allClaimed() };
      s.rank = 6; s.exp = 400; s.tower = 1; s.towerMax = 3; s.guardMirror = 0;
      s.insight = 12; s.wisdom = 120; s.dao = 0; s.trun = 0;
      s.npcs = { stele: { met: 1, rel: 20, stage: 2, seenGens: 0, lastSeen: Date.now(), nudgeAt: 0,
        heard: ['stele1', 'stele3', 'stele4'],
        choice: { listened: 1, showoff: 0, promise: 0 },
        cur: { lastRank: 6, talk: 4, promptTale: 0 } } };
      /* 上一场的落盘态：终态 + 已立的公共道碑 */
      s.worldFoot = 'open';
      s.miles = { m_foot: Date.now() };
      return s;
    },
    body: `
      setInterval(__clearPopups, 250);
      var S = XX._s, O = {};
      function tt(id){ var e = document.getElementById(id); return e ? e.textContent : ''; }
      function footIds(){ var a = document.querySelectorAll('#xx-tower [data-foot]');
        return Array.prototype.slice.call(a).map(function(b){ return b.dataset.foot; }).join(','); }
      function snap(){ var Z = XX._s; return { ins: Z.insight | 0, wis: Z.wisdom | 0, gd: Z.guardMirror | 0,
        foot: Z.worldFoot, mf: (Z.miles && Z.miles.m_foot) ? 1 : 0,
        done: XX._milesDone(), ear: (Z.stats && Z.stats.stoneEarned) | 0 }; }
      setTimeout(function(){
        XX._setBattleAnim(false);
        ROUTER.open('tower');
        setTimeout(function(){
          var a0 = snap();
          /* 1) 冷开塔页：没有【俯身】也没有三扇门，只剩那一句回响 */
          O.restored = a0.foot;
          O.btns = footIds();
          O.towerEcho = tt('world-echo-tower');
          O.mile = a0.mf;
          /* 2) 连 load 两次（重开页 / 重复读档）：状态、道碑、三项资源一动不动 */
          XX._load(); XX._load();
          var a1 = snap();
          O.afterLoads = [a1.foot, a1.ins, a1.wis, a1.gd].join('/');
          O.mileKept = a1.mf;
          O.btnsAfterLoad = footIds();
          O.echoAfterLoad = tt('world-echo-tower');
          /* 3) 识人页：回响与「已印证」都从存档派生，不需要再点一次 */
          ROUTER.open('role');
          setTimeout(function(){
            ROUTER.open('role', 'xx-role-npc');
            setTimeout(function(){
              O.echoNodes = document.querySelectorAll('#npc-world-echo').length;
              O.npcEcho = tt('npc-world-echo');
              var rows = document.querySelectorAll('#npc-clues .sto-item');
              O.em3 = rows.length > 2 ? (rows[2].querySelector('.sto-h em') || {}).textContent : 'norow';
              O.sub = tt('npc-clues-sub');
              __ptDone(O);
            }, 700);
          }, 450);
        }, 800);
      }, 700);
    `,
    checks(d) {
      if (d.__err) return [{ ok: false, label: 'W1 冷开巡检报错', detail: d.__err }];
      return [
        { ok: d.restored === 'open' && d.btns === '' && d.mile === 1,
          label: '终态存档冷开塔页：入口与三扇门一律不再出现（不可逆），公共道碑仍立着',
          detail: d.restored + ' · 按钮 ' + JSON.stringify(d.btns) + ' · m_foot ' + d.mile },
        { ok: d.towerEcho === '脚下那块石被人翻过又按回去，缝里透下一线光。',
          label: '塔页回响由 worldFoot 现算派生，重开逐字同一句', detail: d.towerEcho },
        { ok: d.afterLoads === 'open/12/120/0' && d.mileKept === 1,
          label: '连读两次档：终态、顿悟 12、悟道值 120、护心镜 0、m_foot 全部不动（零重算）',
          detail: d.afterLoads + ' · m_foot ' + d.mileKept },
        { ok: d.btnsAfterLoad === '' && d.echoAfterLoad === d.towerEcho,
          label: '重复读档后仍无按钮、回响文本不变（渲染不靠一次性状态）',
          detail: JSON.stringify(d.btnsAfterLoad) + ' · ' + d.echoAfterLoad },
        { ok: d.echoNodes === 1 && d.npcEcho.indexOf('他下去了') >= 0,
          label: '识人页回响独立一块、文本从存档派生（不是刚点完才有的）',
          detail: '壳 ×' + d.echoNodes + ' · ' + d.npcEcho },
        { ok: d.em3 === '已印证' && d.sub === '3/4',
          label: '线索③冷开即「已印证」，清单副标 3/4（stele1/3/4 已听，⑤仍锁）',
          detail: d.em3 + ' · ' + d.sub }
      ];
    }
  },
  /* ===== 第 110 轮 · W2「塔底余波」三条路线的真人场景 =====
     每个场景都是：W1 已选完的终态档 → 再进塔 → 撞见该路线专属痕迹 → 真点那一下 →
     立自己的碑 → 回识人页看沈碑的后续回应。三条各测各的门槛、奖励渠道与互不泄漏。 */
  {
    id: 'w2open', name: 'W2 共撬线（塔到六层 · 描完那个「同」字 · 跨世仍在）', budget: 16000, size: '900,1200',
    save() {
      const s = baseSave();
      s.story = { claimed: allClaimed() };
      s.rank = 6; s.exp = 400; s.tower = 1; s.towerMax = 6; s.guardMirror = 0;
      s.insight = 0; s.wisdom = 120; s.dao = 0; s.trun = 0;
      s.npcs = { stele: { met: 1, rel: 20, stage: 2, seenGens: 0, lastSeen: Date.now(), nudgeAt: 0,
        heard: ['stele1', 'stele3', 'stele4'], choice: { listened: 1, showoff: 0, promise: 0 },
        cur: { lastRank: 6, talk: 4, promptTale: 0 } } };
      s.worldFoot = 'open';                       /* W1 已选完的终态 */
      s.miles = { m_foot: Date.now() };
      return s;
    },
    body: `
      setInterval(__clearPopups, 250);
      var S = XX._s, O = {};
      function tt(id){ var e = document.getElementById(id); return e ? e.textContent : ''; }
      function btnIds(){ var a = document.querySelectorAll('#xx-tower [data-w2]');
        return Array.prototype.slice.call(a).map(function(b){ return b.dataset.w2; }).join(','); }
      /* W2 痕迹/收尾句只认 #world-after（塔页上 .tw-rew 不止一处） */
      /* 查漏只在塔页正文量：道碑列表里本来就列着三块碑的名字，body 级关键词必假红 */
      function towerTxt(){ var e = document.getElementById('xx-tower'); return e ? (e.textContent || '') : ''; }
      function btn(){ return document.querySelector('#xx-tower [data-w2="open"]'); }
      function persisted(){ try{ return JSON.parse(localStorage.getItem('xiuxian_save') || '{}'); }catch(e){ return {}; } }
      function snap(){ var Z = XX._s; return { wis: Z.wisdom | 0, ins: Z.insight | 0, gd: Z.guardMirror | 0,
        ear: (Z.stats && Z.stats.stoneEarned) | 0, mile: (Z.miles && Z.miles.m_foot_open) ? 1 : 0 }; }
      setTimeout(function(){
        XX._setBattleAnim(false);
        ROUTER.open('tower');
        setTimeout(function(){
          var b0 = snap();
          /* 1) 塔到第 6 层：共撬线才有痕迹，另两条线一个字都不出现 */
          O.btn = btnIds();
          O.trace = tt('world-after');
          O.noLeak = (towerTxt().indexOf('石屑') < 0 && towerTxt().indexOf('封条') < 0) ? 'ok' : 'bad:漏了别条线';
          O.w1EchoKept = tt('world-echo-tower');
          /* 2) 真点「替他描完那个同字」：立自己的碑 + 只发一笔小额悟道（灵石统计不动）。
             worldAfterMark 在点击回调里同步跑完（发奖 → 写账 → 落盘 → 重绘），
             所以账目必须在同一拍里量——隔一个 setTimeout 就把挂机的被动灵石也算进来了。 */
          var want = Math.max(1, Math.floor(30 * Math.pow(1.15, S.rank | 0)));
          btn().click();
          var b1 = snap();
          O.lit = b1.mile;
          O.wisWant = want;
          O.wisDelta = b1.wis - b0.wis;
          O.insDelta = b1.ins - b0.ins;
          O.gdDelta = b1.gd - b0.gd;
          O.earDelta = b1.ear - b0.ear;
          O.btnGone = btnIds();
          O.after = tt('world-after');
          /* 3) 幂等：按钮已消失，硬再走一遍链路也不重发 */
          var again = document.querySelector('#xx-tower [data-w2="open"]');
          O.reclick = again ? 'still-there' : 'gone';
          var b2 = snap();
          O.idemWis = b2.wis - b1.wis;
          O.idemMile = b2.mile;
          setTimeout(function(){
            /* 4) 识人页：沈碑给的是共撬线那句后续，且与塔页不同文 */
            ROUTER.open('role');
            setTimeout(function(){
              ROUTER.open('role', 'xx-role-npc');
              setTimeout(function(){
                O.npcParas = document.querySelectorAll('#npc-world-echo p').length;
                O.npcTxt = tt('npc-world-echo');
                O.npcShell = document.querySelectorAll('#npc-world-echo').length;
                /* 5) 转世：碑与终态都跨世留着，回来还是收尾句、没有按钮 */
                try{ XX._resetForNewLife(); }catch(e){}
                setTimeout(function(){
                  ROUTER.open('tower');
                  setTimeout(function(){
                    O.rebornFoot = XX._s.worldFoot;
                    O.rebornMile = (XX._s.miles && XX._s.miles.m_foot_open) ? 1 : 0;
                    O.rebornBtn = btnIds();
                    O.rebornAfter = tt('world-after');
                    var sv = persisted();
                    O.savedMile = (sv.miles && sv.miles.m_foot_open) ? 1 : 0;
                    __ptDone(O);
                  }, 900);
                }, 400);
              }, 700);
            }, 450);
          }, 700);
        }, 900);
      }, 700);
    `,
    checks(d) {
      if (d.__err) return [{ ok: false, label: 'W2 共撬线巡检报错', detail: d.__err }];
      return [
        { ok: d.btn === 'open' && (d.trace || '').indexOf('碑座背面') >= 0 && d.noLeak === 'ok' &&
              d.w1EchoKept === '脚下那块石被人翻过又按回去，缝里透下一线光。',
          label: '塔到第 6 层：共撬线痕迹登场（只有这一条线），W1 那句塔页回响一字未变',
          detail: d.btn + ' · ' + d.noLeak + ' · ' + d.trace },
        { ok: d.lit === 1 && d.wisDelta === d.wisWant && d.insDelta === 0 && d.gdDelta === 0 && d.earDelta === 0,
          label: '真点那一下：立 m_foot_open，只发一笔小额悟道（30×境界系数），顿悟/镜/灵石统计零变化',
          detail: '碑 ' + d.lit + ' · 悟道 +' + d.wisDelta + '（应 ' + d.wisWant + '） · 顿悟 Δ' + d.insDelta +
            ' · 镜 Δ' + d.gdDelta + ' · stoneEarned Δ' + d.earDelta },
        { ok: d.btnGone === '' && d.reclick === 'gone' && d.idemWis === 0 && d.idemMile === 1 &&
              (d.after || '').indexOf('描完了') >= 0,
          label: '立过碑之后：按钮不再出现、换一句常驻收尾，重复走链路零重发',
          detail: JSON.stringify(d.btnGone) + ' · ' + d.reclick + ' · 悟道 Δ' + d.idemWis + ' · ' + d.after },
        { ok: d.npcShell === 1 && d.npcParas === 2 && (d.npcTxt || '').indexOf('碑认得两只手') >= 0,
          label: '识人页：同一块回响里第二段是共撬线的回应（壳仍唯一，与塔页不同文）',
          detail: '壳 ×' + d.npcShell + ' · 段 ' + d.npcParas + ' · ' + d.npcTxt },
        { ok: d.rebornFoot === 'open' && d.rebornMile === 1 && d.rebornBtn === '' &&
              (d.rebornAfter || '').indexOf('描完了') >= 0 && d.savedMile === 1,
          label: '转世之后：终态与那块碑都留着，塔页只剩收尾句、没有第二枚按钮，且已落盘',
          detail: [d.rebornFoot, d.rebornMile, JSON.stringify(d.rebornBtn), d.savedMile].join(' · ') }
      ];
    }
  },
  {
    id: 'w2self', name: 'W2 独撬线（六层不给 · 七层才给 · 窄屏 393 收半枚石屑）', budget: 14000, size: '393,2400',
    save() {
      const s = baseSave();
      s.story = { claimed: allClaimed() };
      s.rank = 6; s.exp = 400; s.tower = 1; s.towerMax = 6; s.guardMirror = 0;
      s.insight = 0; s.wisdom = 120; s.dao = 0; s.trun = 0;
      s.npcs = { stele: { met: 1, rel: 20, stage: 2, seenGens: 0, lastSeen: Date.now(), nudgeAt: 0,
        heard: ['stele1', 'stele3', 'stele4'], choice: { listened: 1, showoff: 0, promise: 0 },
        cur: { lastRank: 6, talk: 4, promptTale: 0 } } };
      s.worldFoot = 'self';
      s.miles = { m_foot: Date.now() };
      return s;
    },
    body: `
      setInterval(__clearPopups, 250);
      var S = XX._s, O = {};
      function tt(id){ var e = document.getElementById(id); return e ? e.textContent : ''; }
      function btnIds(){ var a = document.querySelectorAll('#xx-tower [data-w2]');
        return Array.prototype.slice.call(a).map(function(b){ return b.dataset.w2; }).join(','); }
      /* W2 痕迹/收尾句只认 #world-after（塔页上 .tw-rew 不止一处） */
      function towerTxt(){ var e = document.getElementById('xx-tower'); return e ? (e.textContent || '') : ''; }
      function btn(){ return document.querySelector('#xx-tower [data-w2="self"]'); }
      /* 窄屏几何：先把它滚进视口再量矩形（无头里 .tw-rew 在长页尾部，不滚就是假出屏） */
      function rectOf(el){ if(!el) return null; var q = el.getBoundingClientRect();
        return [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)]; }
      function snap(){ var Z = XX._s; return { ins: Z.insight | 0, wis: Z.wisdom | 0, gd: Z.guardMirror | 0,
        mile: (Z.miles && Z.miles.m_foot_self) ? 1 : 0 }; }
      setTimeout(function(){
        XX._setBattleAnim(false);
        ROUTER.open('tower');
        setTimeout(function(){
          /* 1) 独撬线要第 7 层：停在第 6 层时不给内容（不提前发） */
          O.atSix = btnIds();
          /* 「半枚」只出现在独撬线的 W2 痕迹里；W1 那句塔页回响本身就带「石屑」，不能拿它当判据 */
          O.sixClean = (towerTxt().indexOf('半枚') < 0) ? 'ok' : 'bad:六层就给了';
          /* 2) 真人再往上一层 → 痕迹与按钮当场出现 */
          S.towerMax = 7;
          setTimeout(function(){
            var b0 = snap();
            O.atSeven = btnIds();
            O.trace = tt('world-after');
            O.noLeak = (towerTxt().indexOf('碑背') < 0 && towerTxt().indexOf('封条') < 0) ? 'ok' : 'bad';
            /* 窄屏量几何：痕迹句与按钮各占一行、都在视口内，按钮够一截宽点得着 */
            var wb = btn(); if(wb) wb.scrollIntoView();
            O.vw = Math.round(window.innerWidth); O.vh = Math.round(window.innerHeight);
            O.rAfter = rectOf(document.getElementById('world-after'));
            O.rBtn = rectOf(wb);
            /* 3) 真点「把半枚石屑收进袖里」：走顿悟渠道，悟道值与镜一律不动 */
            btn().click();
            setTimeout(function(){
              var b1 = snap();
              O.mile = b1.mile;
              O.insDelta = b1.ins - b0.ins;
              O.wisDelta = b1.wis - b0.wis;
              O.gdDelta = b1.gd - b0.gd;
              O.btnGone = btnIds();
              O.after = tt('world-after');
              ROUTER.open('role');
              setTimeout(function(){
                ROUTER.open('role', 'xx-role-npc');
                setTimeout(function(){
                  O.npcParas = document.querySelectorAll('#npc-world-echo p').length;
                  O.npcTxt = tt('npc-world-echo');
                  __ptDone(O);
                }, 700);
              }, 450);
            }, 700);
          }, 900);
        }, 900);
      }, 700);
    `,
    checks(d) {
      if (d.__err) return [{ ok: false, label: 'W2 独撬线巡检报错', detail: d.__err }];
      return [
        { ok: d.atSix === '' && d.sixClean === 'ok',
          label: '门槛真实生效：塔停在第 6 层时，独撬线一个字都不给（不是提前发）',
          detail: JSON.stringify(d.atSix) + ' · ' + d.sixClean },
        { ok: d.atSeven === 'self' && (d.trace || '').indexOf('石屑') >= 0 && d.noLeak === 'ok',
          label: '推到第 7 层：独撬痕迹登场，且共撬/封存两条线的词一个都不出现',
          detail: d.atSeven + ' · ' + d.noLeak + ' · ' + d.trace },
        { ok: !!d.rBtn && !!d.rAfter && d.rBtn[0] >= 0 && d.rBtn[2] <= d.vw &&
              d.rAfter[0] >= 0 && d.rAfter[2] <= d.vw && d.rBtn[1] >= 0 && d.rBtn[3] <= d.vh &&
              d.rBtn[2] - d.rBtn[0] >= 80 && d.rAfter[3] <= d.rBtn[1],
          label: '窄屏 393 几何：痕迹句与按钮都不出屏、各占一行不叠压，按钮宽过 80px 点得着',
          detail: '视口 ' + d.vw + '×' + d.vh + ' · 痕 ' + JSON.stringify(d.rAfter) + ' · 钮 ' + JSON.stringify(d.rBtn) },
        { ok: d.mile === 1 && d.insDelta === 6 && d.wisDelta === 0 && d.gdDelta === 0,
          label: '真点那一下：立 m_foot_self，只发顿悟 +6（与共撬线的悟道渠道不同），悟道值/镜零变化',
          detail: '碑 ' + d.mile + ' · 顿悟 +' + d.insDelta + ' · 悟道 Δ' + d.wisDelta + ' · 镜 Δ' + d.gdDelta },
        { ok: d.btnGone === '' && (d.after || '').indexOf('袖里') >= 0,
          label: '立过之后按钮消失、换常驻收尾句（收进袖里那件东西留在那儿）', detail: d.after },
        { ok: d.npcParas === 2 && (d.npcTxt || '').indexOf('袖口') >= 0,
          label: '识人页：沈碑对"独自行动"的回应是另一句（看你袖口、什么也没说）',
          detail: '段 ' + d.npcParas + ' · ' + d.npcTxt }
      ];
    }
  },
  {
    id: 'w2seal', name: 'W2 封存线（敲三下 · 主动参与 · 重开归零）', budget: 18000, size: '900,1200',
    save() {
      const s = baseSave();
      s.story = { claimed: allClaimed() };
      s.rank = 6; s.exp = 400; s.tower = 1; s.towerMax = 5; s.guardMirror = 1;
      s.insight = 0; s.wisdom = 120; s.dao = 0; s.trun = 0;
      s.npcs = { stele: { met: 1, rel: 20, stage: 2, seenGens: 0, lastSeen: Date.now(), nudgeAt: 0,
        heard: ['stele1', 'stele3', 'stele4'], choice: { listened: 1, showoff: 0, promise: 0 },
        cur: { lastRank: 6, talk: 4, promptTale: 0 } } };
      s.worldFoot = 'seal';
      s.miles = { m_foot: Date.now() };
      return s;
    },
    body: `
      setInterval(__clearPopups, 250);
      var S = XX._s, O = {};
      function tt(id){ var e = document.getElementById(id); return e ? e.textContent : ''; }
      function btnIds(){ var a = document.querySelectorAll('#xx-tower [data-w2]');
        return Array.prototype.slice.call(a).map(function(b){ return b.dataset.w2; }).join(','); }
      /* W2 痕迹/收尾句只认 #world-after（塔页上 .tw-rew 不止一处） */
      function towerTxt(){ var e = document.getElementById('xx-tower'); return e ? (e.textContent || '') : ''; }
      function snap(){ var Z = XX._s; return { wis: Z.wisdom | 0, ins: Z.insight | 0, gd: Z.guardMirror | 0,
        foot: Z.worldFoot, mile: (Z.miles && Z.miles.m_foot_seal) ? 1 : 0, done: XX._milesDone() }; }
      setTimeout(function(){
        XX._setBattleAnim(false);
        ROUTER.open('tower');
        setTimeout(function(){
          var b0 = snap();
          /* 1) 封存线门槛最低（第 5 层）：异动先来找你 */
          O.btn = btnIds();
          O.trace = tt('world-after');
          O.noLeak = (towerTxt().indexOf('碑背') < 0 && towerTxt().indexOf('石屑') < 0) ? 'ok' : 'bad';
          /* 2) 玩家不点，就什么都不发生：先空等一拍，确认没有自动结算 */
          setTimeout(function(){
            var b1 = snap();
            O.autoSettle = (b1.mile === 0 && b1.wis === b0.wis) ? 'ok' : 'bad:自动替玩家做了';
            /* 3) 真点「按他说的，敲三下」 */
            var want = Math.max(1, Math.floor(20 * Math.pow(1.15, S.rank | 0)));
            document.querySelector('#xx-tower [data-w2="seal"]').click();
            setTimeout(function(){
              var b2 = snap();
              O.mile = b2.mile;
              O.wisWant = want;
              O.wisDelta = b2.wis - b1.wis;
              O.insDelta = b2.ins - b1.ins;
              O.doneDelta = b2.done - b1.done;
              O.btnGone = btnIds();
              O.after = tt('world-after');
              ROUTER.open('role');
              setTimeout(function(){
                ROUTER.open('role', 'xx-role-npc');
                setTimeout(function(){
                  O.npcParas = document.querySelectorAll('#npc-world-echo p').length;
                  O.npcTxt = tt('npc-world-echo');
                  /* 4) 彻底重开：终态、这块碑一起归零（confirm 在无头里会挂死 → 接管再还原） */
                  var sv = window.confirm; window.confirm = function(){ return true; };
                  try{ XX._resetAll(); }catch(e){}
                  window.confirm = sv;
                  setTimeout(function(){
                    var b3 = snap();
                    O.resetFoot = b3.foot;
                    O.resetMile = b3.mile;
                    O.resetDone = b3.done;
                    ROUTER.open('tower');
                    setTimeout(function(){
                      O.resetBtn = btnIds();
                      O.resetRew = tt('world-after');
                      __ptDone(O);
                    }, 900);
                  }, 600);
                }, 700);
              }, 450);
            }, 700);
          }, 900);
        }, 900);
      }, 700);
    `,
    checks(d) {
      if (d.__err) return [{ ok: false, label: 'W2 封存线巡检报错', detail: d.__err }];
      return [
        { ok: d.btn === 'seal' && (d.trace || '').indexOf('封条的灰是新扫的') >= 0 && d.noLeak === 'ok',
          label: '塔到第 5 层：封印异动自己冒出来（另两条线的词一个不出现）',
          detail: d.btn + ' · ' + d.noLeak + ' · ' + d.trace },
        { ok: d.autoSettle === 'ok',
          label: '玩家不动手就什么都不发生：空等一拍之后既没立碑也没发奖（不自动替玩家完成）',
          detail: d.autoSettle },
        { ok: d.mile === 1 && d.wisDelta === d.wisWant && d.insDelta === 0 && d.doneDelta === 1,
          label: '真点「敲三下」：立 m_foot_seal，只发小额悟道（20×境界系数），这一步只立这一块碑',
          detail: '碑 ' + d.mile + ' · 悟道 +' + d.wisDelta + '（应 ' + d.wisWant + '） · 顿悟 Δ' + d.insDelta +
            ' · 立碑增量 ' + d.doneDelta },
        { ok: d.btnGone === '' && (d.after || '').indexOf('条子底下') >= 0 && d.npcParas === 2 &&
              (d.npcTxt || '').indexOf('你数得比我准') >= 0,
          label: '立过之后：按钮换成常驻收尾句，识人页给的是封存线那句（它记住你了）',
          detail: JSON.stringify(d.btnGone) + ' · 段 ' + d.npcParas + ' · ' + d.npcTxt },
        { ok: d.resetFoot === '' && d.resetMile === 0 && d.resetDone === 0 && d.resetBtn === '' &&
              d.resetRew.indexOf('封条') < 0,
          label: '彻底重开：终态归零、这块碑跟着灭、塔页回到没有 W2 内容的初始态',
          detail: [d.resetFoot, d.resetMile, d.resetDone, JSON.stringify(d.resetBtn)].join(' · ') }
      ];
    }
  },

  /* ---- W3（第 111 轮）：世界线指引 = 红点（S2） + 识人页锁行提示（S3） + 纸签文案（S1）
     一条真人动线：城镇塔格亮着 → 点塔 → 俯身 → 红点灭 → 塔到 3 层红点回来 →
     选一扇门 → 终态灭；全程灵石/修为/悟道只允许 W1 那一笔（封存线 40 悟道 ×系数）动。 */
  {
    id: 'w3guide', name: 'W3 世界线指引（塔格红点全程 · 识人页锁行提示 · 纸签新文案）',
    budget: 20000, size: '900,1200',
    save() {
      const s = baseSave();
      s.story = { claimed: allClaimed() };
      s.rank = 6; s.exp = 400; s.tower = 0; s.towerMax = 1; s.guardMirror = 0;
      s.insight = 0; s.wisdom = 0; s.dao = 0; s.trun = 0;
      s.worldFoot = '';
      s.trail = { i: 8 }; s.trail2 = { i: 1 };      /* 纸签停在第二程「登镇妖塔五层」 */
      s.npcs = { stele: { met: 1, rel: 10, stage: 2, seenGens: 0, lastSeen: Date.now(), nudgeAt: 0,
        heard: ['stele1', 'stele3', 'stele4'], choice: { listened: 1, showoff: 0, promise: 0 },
        cur: { lastRank: 6, talk: 4, promptTale: 0 } } };
      return s;
    },
    body: `
      setInterval(__clearPopups, 250);
      var S = XX._s, O = {};
      function tt(id){ var e = document.getElementById(id); return e ? (e.textContent || '') : ''; }
      function dot(){ var d = document.querySelector('[data-bld="tower"] .e-dot');
        return !d ? 'none' : (d.classList.contains('on') ? 'on' : 'off'); }
      function dotN(){ return document.querySelectorAll('[data-bld="tower"] .e-dot').length; }
      function zero(){ var Z = XX._s; return (Z.stone|0) + '/' + (Z.exp|0) + '/' + (Z.wisdom|0) + '/' + (Z.guardMirror|0); }
      function topicRows(){ return document.querySelectorAll('#npc-topics .npc-topic').length; }
      function hintTxt(){ return Array.prototype.map.call(
        document.querySelectorAll('#npc-topics .npc-topic > p.sto-hint'), function(p){ return p.textContent; }).join('#'); }
      setTimeout(function(){
        try{ Tutorial.finish(); }catch(e){}
        XX._setBattleAnim(false);
        ROUTER.showScene('town');
        XX._dots(true); XX._render();
        setTimeout(function(){
          O.dotN = dotN();
          O.dot0 = dot();                                            /* 听过④ + 进过塔 + 未挖 → 该亮 */
          O.strip = tt('st-kicker') + '/' + tt('st-name') + '/' + tt('st-hint');
          /* 1) 顺着红点真点塔格 → 塔页有俯身入口 */
          document.querySelector('[data-bld="tower"]').click();
          setTimeout(function(){
            O.onTower = window.ROUTER.current();
            var z0 = zero();
            var dg = document.querySelector('#xx-tower [data-foot="dig"]');
            O.digBtn = !!dg;
            if(dg) dg.click();
            var z1 = zero();                                         /* 同一个同步拍里比，不给挂机收益掺进来 */
            O.foot1 = S.worldFoot;
            O.zeroDig = (z0 === z1) ? 'ok' : 'bad:' + z0 + '→' + z1;
            XX._dots(true);
            O.dotAfterDig = dot();                                   /* 挖了、契机未到 → 灭 */
            /* 2) 契机到了（塔 3 层）→ 同一枚红点再亮，指的仍是同一件事 */
            S.towerMax = 3;
            XX._dots(true);
            O.dotAtThree = dot();
            ROUTER.open('tower');
            setTimeout(function(){
              O.doorN = document.querySelectorAll('#xx-tower [data-foot]').length;
              var z2 = zero();
              document.querySelector('#xx-tower [data-foot="seal"]').click();
              var z3 = zero();
              O.foot2 = S.worldFoot;
              O.sealWis = (z3.split('/')[2] | 0) - (z2.split('/')[2] | 0);
              XX._dots(true);
              O.dotFinal = dot();
              O.w2Leak = (S.miles && (S.miles.m_foot_open || S.miles.m_foot_self || S.miles.m_foot_seal)) ? 'bad' : 'ok';
              /* 3) 识人页：只有还锁着的那一行带提示 */
              ROUTER.open('role');
              setTimeout(function(){
                ROUTER.open('role', 'xx-role-npc');
                setTimeout(function(){
                  O.rows = topicRows();
                  O.lockN = document.querySelectorAll('#npc-topics .npc-topic.lock').length;
                  O.hintText = hintTxt();
                  O.hintCfg = Npc.NPC_STELE.topics.filter(function(t){ return t.id === 'stele5'; })[0].lockHint;
                  var zz = zero();
                  XX._dots(true); XX._render();
                  O.zeroGuide = (zz === zero()) ? 'ok' : 'bad';
                  __ptDone(O);
                }, 700);
              }, 500);
            }, 800);
          }, 800);
        }, 700);
      }, 800);
    `,
    checks(d) {
      if (d.__err) return [{ ok: false, label: 'W3 指引巡检报错', detail: d.__err }];
      return [
        { ok: d.dotN === 1, label: '塔格只插一枚红点（复用 DOT_RULES，不重复建指引）',
          detail: d.dotN + ' 枚' },
        { ok: d.dot0 === 'on', label: '听过沈碑④ + 进过塔 + 还没挖 → 城镇塔格红点亮（发现入口不再靠撞）',
          detail: d.dot0 },
        { ok: d.onTower === 'tower' && d.digBtn === true && d.foot1 === 'dug',
          label: '顺着红点进塔：俯身入口真在、真点得动（红点指的路玩家走得通）',
          detail: d.onTower + ' · 钮 ' + d.digBtn + ' · worldFoot=' + d.foot1 },
        { ok: d.zeroDig === 'ok', label: '俯身那一下不给任何资源（灵石/修为/悟道/镜四项原地不动）',
          detail: d.zeroDig },
        { ok: d.dotAfterDig === 'off' && d.dotAtThree === 'on',
          label: '挖完契机未到红点就灭；塔到 3 层（三扇门待选）红点再亮——做完即消失，不空催',
          detail: '挖后 ' + d.dotAfterDig + ' · 塔3层 ' + d.dotAtThree },
        { ok: d.doorN === 3 && d.foot2 === 'seal' && d.dotFinal === 'off',
          label: '三扇门真点一扇进终态 → 红点彻底灭（终态不再提示）',
          detail: '门 ' + d.doorN + ' · 终态 ' + d.foot2 + ' · 红点 ' + d.dotFinal },
        { ok: d.sealWis >= 1, label: '封存线照旧走悟道渠道（W1 结算没被动过）',
          detail: '悟道 +' + d.sealWis },
        { ok: d.w2Leak === 'ok', label: 'W2 三条后续碑一枚都不亮（塔 3 层够不到门槛，指引不越权发账）',
          detail: d.w2Leak },
        { ok: d.rows === 6 && d.lockN === 1 && d.hintText === d.hintCfg,
          label: '识人页六行了仍只有锁着那行带一句提示，文字逐字取配置（③④ 已解锁不再啰嗦）',
          detail: '行 ' + d.rows + ' · 锁 ' + d.lockN + ' · ' + d.hintText },
        { ok: /^道途 · 2\/12\/登镇妖塔五层\//.test(d.strip || '') &&
              d.strip.indexOf('三扇门') >= 0 && d.strip.indexOf('守碑') >= 0,
          label: '纸签第二程的提示既说清三扇门、也把玩家指回观前守碑人（世界线在长线上有了一句话）',
          detail: d.strip },
        { ok: d.zeroGuide === 'ok', label: '红点刷新与提示重绘本身零结算（不是把指引写成了发账）',
          detail: d.zeroGuide }
      ];
    }
  },

  /* ⑯ 阶段三 S2 补充 1 后半（制作人 2026-11-14 点名新增的那一条）：
       「新增一条 S2 断言：确认页拆账合计 = 显示成功率 = XX._breakParts(...).final」
     ——纯追加，一条检查，不动上面任何旧断言。
     实测口径先记在这儿（探针 s2_breakparts_probe.js 两遍输出：s2_breakparts_probe_1.out / _2.out）：
       · 「这一次」那行的名字是 <span><b>这一次</b></span>，取值必须取行内**最后一个** <b>；
         第一版探针用 querySelector('b') 把名字当成了值，8 格全部误读为「等式链不成立」。
       · 「拆账合计 == 显示成功率」只在 raw ≤ 0.85（软膝之前）时严格成立：raw > 0.85 时页面
         本来就多写一行「八五以上折半 · 超出部分只留一成半」（game.js:5576-5579），此时
         这一次 = knee ≠ 逐项相加 = raw —— 这是实现的口径（game.js:5289-5291），不是页面算错。
         探针 8 格实测：raw ≤ 0.85 的 5 格等式链成立，raw > 0.85 的 3 格按同一原因不成立。
       · 所以夹具钉在金丹期（段位基础 0.62）+ 双灵根（rootIdx 2，+5%）+ 丹房 3 级（丹道·炉火 +6%），
         raw = 0.73 稳在 0.85 之下且**三行都有值**（相加才不是自说自话），页内不出现「八五以上折半」行，
         三行必须全等；顿悟/天机/护法/药力/词条/破器/印记/失败积累一律清零，
         断言不依赖任何随存档浮动的数值。对应探针第 5 格 r12_d3_root2（等式链=成立）。
     本场景只真点顶栏【突破】开确认页，再点【再等等】关掉，不点 #bc-ok → 境界不被推进。 */
  {
    id: 's2bc', name: '突破确认页 · 拆账合计 = 显示成功率 = _breakParts().final', budget: 9000, size: '900,1200',
    save() {
      const s = midSave();
      s.rank = 12; s.exp = 9e8;
      /* 段位基础 0.62 + 灵根（双灵根）0.05 + 丹道·炉火（丹房 3 级 ×2%）0.06 = 0.73：
         三行都有值（拆账相加才有意义），且 raw 0.73 ≤ 0.85 → 页内不出现「八五以上折半」行 */
      s.dan = 3; s.rootIdx = 2;
      s.dao = 0; s.insight = 0; s.failBonus = 0; s.pillUntil = 0; s.pillBonus = 0;
      s.guardArray = 0; s.tianji = 0; s.guardMirror = 0; s.secludeUntil = 0;
      s.equipment = { weapon: null, armor: null, accessory: null };
      s.mastery = { alchemyLv: 0, alchemyExp: 0, forgeLv: 1, forgeExp: 0 };
      s.trail3 = { i: 0, gen: 0 };
      /* 引导：这份夹具是「已经出过新手村」的档，S.guide 必须显式标成走完，
         否则 load() 的 else 分支（js/game.js:4782）会把它拉回 step 0 重开引导。 */
      s.guide = { step: 7, done: true, skipped: false, started: true, flags: {}, rewardClaims: {}, toldSystems: {} };
      return s;
    },
    body: `
      var S = XX._s;
      var O = {};
      /* #bc-parts 行文：名字在 <span>，数值在行内最后一个 <b>（「这一次」的名字也套了一层 b） */
      function parse(){
        var el = document.getElementById('bc-parts');
        if(!el) return null;
        var rs = el.querySelectorAll('.bc-row'), out = [];
        for(var i = 0; i < rs.length; i++){
          var sp = rs[i].querySelector('span');
          var bs = rs[i].querySelectorAll('b');
          var vv = bs.length ? String(bs[bs.length - 1].textContent || '') : '';
          var n = parseFloat(vv);
          out.push({ n: String(sp ? sp.textContent : '').trim(), v: vv.trim(),
                     pct: isNaN(n) ? null : n });
        }
        return out;
      }
      /* 补充 4：#bc-ok 的监听绑在 js/router.js 的 bindModals()（boot 期一次），
         所以先确认页面真的装配完了再点，别拿没绑上的按钮当「点了没反应」。 */
      O.boot = { xx: typeof XX !== 'undefined', router: typeof ROUTER !== 'undefined',
                 bcok: !!document.getElementById('bc-ok'),
                 bccancel: !!document.getElementById('bc-cancel'),
                 brkDisabled: !!(document.getElementById('sc-break') || {}).disabled };
      var a = document.getElementById('xx-use-array');
      var j = document.getElementById('xx-use-tianji');
      if(a) a.checked = false;
      if(j) j.checked = false;
      O.rank0 = S.rank;
      /* 与 openBreakConfirm 同一组入参（js/game.js:5553-5557）：护道阵法/天机要「勾上且真有货」 */
      O.calc = XX._breakParts(null, !!(a && a.checked && (S.guardArray | 0) > 0),
                                   !!(j && j.checked && (S.tianji | 0) > 0));
      O.parts = (O.calc.parts || []).map(function(p){ return { k: p.k, n: p.n, v: p.v }; });
      setTimeout(function(){
        O.click = __click('#sc-break', 'body');          /* 真点顶栏那颗钮 */
        setTimeout(function(){
          O.open = __vis('break-confirm-modal');
          O.rows = parse();
          O.rank1 = S.rank;                              /* 观察量，不进断言：开确认页不该把境破了 */
          O.okDisabled = !!(document.getElementById('bc-ok') || {}).disabled;
          O.okText = String((document.getElementById('bc-ok') || {}).textContent || '').trim();
          O.cost = String((document.getElementById('bc-cost') || {}).textContent || '').trim().slice(0, 40);
          __click('#bc-cancel', 'body');
          O.closed = !__vis('break-confirm-modal');
          __ptDone(O);
        }, 500);
      }, 700);
    `,
    checks(d) {
      if (d.__err) return [{ ok: false, label: 'S2 确认页巡检报错', detail: d.__err }];
      const rows = d.rows || [];
      const items = rows.filter(r => r.pct !== null && r.v.charAt(0) === '+');
      const sumPct = Math.round(items.reduce((a, r) => a + r.pct, 0) * 10) / 10;
      const rawRow = rows.filter(r => r.n === '逐项相加')[0];
      const kneeRow = rows.filter(r => r.n.indexOf('八五') >= 0)[0];
      const thisRow = rows.filter(r => r.n === '这一次')[0];
      const c = d.calc || {};
      const pctRaw = Math.round((c.raw || 0) * 1000) / 10;
      const pctFinal = Math.round((c.final || 0) * 1000) / 10;
      const chain = [sumPct + '%(页内各项相加)',
                     (rawRow ? rawRow.pct : '缺') + '%(逐项相加行)',
                     (thisRow ? thisRow.pct : '缺') + '%(这一次行)',
                     pctFinal + '%(_breakParts().final)'].join(' = ');
      return [
        { ok: d.open === true && !!rawRow && !!thisRow && !kneeRow &&
              c.raw <= 0.85 && c.final === c.knee && c.final === c.raw &&
              sumPct === pctRaw && rawRow.pct === pctRaw &&
              thisRow.pct === pctFinal && thisRow.pct === rawRow.pct &&
              items.length === (d.parts || []).filter(p => p.v > 0).length,
          label: '突破确认页：拆账合计 = 显示成功率 = XX._breakParts(...).final（raw≤0.85 段，页内三行与函数值同口径）',
          detail: chain + ' | raw=' + c.raw + ' knee=' + c.knee + ' final=' + c.final +
                  ' | 逐项 ' + items.length + ' 行(' + items.map(r => r.n + ' ' + r.v).join(' / ') + ')' +
                  ' | 八五折半行 ' + (kneeRow ? '有' : '无') + ' | 点【突破】=' + d.click +
                  ' 确认页 ' + (d.open ? '开' : '没开') + '→关 ' + (d.closed ? 'ok' : 'bad') +
                  ' | #bc-ok disabled=' + d.okDisabled + ' 文案「' + d.okText + '」' +
                  ' | 境界 ' + d.rank0 + '→' + d.rank1 }
      ];
    }
  },

  /* ⑰ 负责人 2026-11-14 23:0x 第 3 条点名新增：
       「新增 S2 断言：XX._breakParts(null,false,false) 的 parts 求和=raw、final=XX._breakChanceFinal；
         #bc-ok 点击后 rank 真涨。」
       ——纯追加一个场景（三条检查），上一条 s2bc 与所有旧场景/旧断言一字未动。
       分工先说清：前半个「函数口径等式」verify.js 侧已由他人落了（`verify.js:3541-3544` 取值 +
       `verify.js:5231` 断言，实测绿），本场景从 UI 侧再校一次并回报实测数值；
       后半个「点 #bc-ok 境界真涨」此前**没有任何一套测试覆盖**（s2bc 特意只点【再等等】，
       就是为了不推进境界），所以这条是本场景新增的主体。
       控骰照本文件 D-5 先例（306 行那支）：只在点确认页这两下把 Math.random 钉成 0
       （p = breakChanceFinal ≥ BAL.breakMin = 0.05 > 0，0 恒小于任何 p → 必成），点完当场还原；
       不控骰就是 0.90/0.62 真掷，必然做成 B 类假红。
       夹具钉 rank=5（炼气段，段位基础 0.90）、exp=9e8（远够，且成功后 S.exp -= need 仍为正值可核）、
       顿悟/天机/护法/药力/词条/破器/印记/失败积累/闭关一律清零，勾选框强制不勾
       ——否则 attemptBreakthrough:5469「没有护道阵法」会直接 return，境界不涨。
       第三条是给负责人第 2 条口径做的运行时证明：同一个 DOM 上，
       「只看 disabled」的旧闸门在确认页关闭后仍为真，而「判非 hidden」的新闸门为假 → 必须收紧。
       顺带记录（不参与判定）：确认页已 hidden 时故意再点一次 #bc-ok，看境界会不会再涨
       ——那是实现侧「确认页可被绕过」的观测，只写进报告，不写成断言（未拍板不擅自定对错）。 */
  {
    id: 's2ok', name: '突破确认页 · _breakParts 等式 + 点 #bc-ok 境界真涨 +1 + hidden 闸门', budget: 11000, size: '900,1200',
    save() {
      const s = midSave();
      s.rank = 5; s.exp = 9e8;
      s.dan = 0; s.rootIdx = 0;
      s.dao = 0; s.insight = 0; s.failBonus = 0; s.pillUntil = 0; s.pillBonus = 0;
      s.guardArray = 0; s.tianji = 0; s.guardMirror = 0; s.secludeUntil = 0;
      s.equipment = { weapon: null, armor: null, accessory: null };
      s.mastery = { alchemyLv: 0, alchemyExp: 0, forgeLv: 1, forgeExp: 0 };
      s.trail3 = { i: 0, gen: 0 };
      s.guide = { step: 7, done: true, skipped: false, started: true, flags: {}, rewardClaims: {}, toldSystems: {} };
      return s;
    },
    body: `
      var S = XX._s; var O = {};
      var bcm = document.getElementById('break-confirm-modal');
      var bc  = document.getElementById('bc-ok');
      var a = document.getElementById('xx-use-array'), j = document.getElementById('xx-use-tianji');
      if(a) a.checked = false; if(j) j.checked = false;
      O.boot = { bcm: !!bcm, bc: !!bc, hidden0: bcm ? bcm.classList.contains('hidden') : null,
                 bcDisabled0: bc ? !!bc.disabled : null, xx: typeof XX !== 'undefined',
                 router: typeof ROUTER !== 'undefined' };
      /* ---- 函数口径（负责人第 3 条前半）---- */
      var bp = XX._breakParts(null, false, false);
      O.fn = { sum: bp.parts.reduce(function(x, p){ return x + p.v; }, 0), raw: bp.raw,
               knee: bp.knee, final: bp.final, finFn: XX._breakChanceFinal(null, false),
               partsN: bp.parts.length, guarantee: !!bp.guarantee,
               nz: bp.parts.filter(function(p){ return p.v > 0; })
                          .map(function(p){ return p.n + ' +' + Math.round(p.v * 1000) / 10 + '%'; }) };
      setTimeout(function(){
        O.need0 = XX._need(S.rank); O.rank0 = S.rank; O.exp0 = S.exp;
        /* ---- 真点：#sc-break 弹确认页 → 新闸门判非 hidden 才点 #bc-ok ---- */
        var brkRnd = Math.random; Math.random = function(){ return 0; };
        O.clickBreak = __click('#sc-break', 'body');
        O.opened = bcm ? !bcm.classList.contains('hidden') : false;
        O.gate = { openOld: !!bc && !bc.disabled,
                   openNew: !!(bcm && !bcm.classList.contains('hidden') && bc && !bc.disabled) };
        if(O.gate.openNew) bc.click();
        Math.random = brkRnd;
        O.rank1 = S.rank; O.exp1 = S.exp;
        O.hiddenAfter = bcm ? bcm.classList.contains('hidden') : null;
        O.bcDisabledAfter = bc ? !!bc.disabled : null;
        O.logTop = ((S.log[0] || {}).t || '').slice(0, 40);
        /* 结算行不一定在 S.log[0]：成功后还接着写「刷新最高境界纪录」等行（log() 是 unshift，
           js/game.js:3845），所以判「有没有写突破成功」要扫新增的那几行，不能只盯顶行。 */
        O.logWin = S.log.slice(0, 10).map(function(l){ return String(l.t || ''); });
        O.logBrk = (O.logWin.filter(function(t){ return t.indexOf('突破成功') >= 0; })[0] || '').slice(0, 40);
        O.brkCount = S.life ? (S.life.brk | 0) : null;
        /* 确认页已关：同一 DOM 上旧闸门/新闸门的取值（第 2 条口径的运行时证据） */
        O.gateClosed = { old: !!bc && !bc.disabled,
                         new: !!(bcm && !bcm.classList.contains('hidden') && bc && !bc.disabled) };
        /* 关掉状态下 #bc-ok 的命中测试：真鼠标点得到吗（给报告定「严重度」用，不参与判定） */
        O.hiddenHit = (function(){
          var r = bc.getBoundingClientRect();
          var cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
          var top = (cx >= 0 && cy >= 0) ? document.elementFromPoint(cx, cy) : null;
          return { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
                   display: getComputedStyle(bc).display, hasOffsetParent: !!bc.offsetParent,
                   hitTop: top ? (top.id || top.tagName) : 'none', hitIsBc: top === bc };
        })();
        /* 只记录、不断言：hidden 状态下故意再点一次会不会绕过确认页真破 */
        var r2 = Math.random; Math.random = function(){ return 0; };
        if(bc) bc.click();
        Math.random = r2;
        O.rankBypass = S.rank;
        O.logBypass = (S.log.slice(0, 10).map(function(l){ return String(l.t || ''); })
                       .filter(function(t){ return t.indexOf('突破成功') >= 0; })[0] || '').slice(0, 40);
        __ptDone(O);
      }, 700);
    `,
    checks(d) {
      if (d.__err) return [{ ok: false, label: 'S2 真涨巡检报错', detail: d.__err }];
      const f = d.fn || {}, g = d.gate || {}, gc = d.gateClosed || {};
      const sumEqRaw = f.sum !== undefined && f.sum.toFixed(10) === f.raw.toFixed(10);
      const finalEqFn = f.final !== undefined && f.final.toFixed(10) === f.finFn.toFixed(10);
      const fnStr = 'sum=' + f.sum + ' raw=' + f.raw + ' knee=' + f.knee +
                    ' final=' + f.final + ' _breakChanceFinal=' + f.finFn;
      const expOk = typeof d.exp1 === 'number' && typeof d.exp0 === 'number' &&
                    typeof d.need0 === 'number' && Math.abs((d.exp0 - d.need0) - d.exp1) < 1;
      return [
        { ok: !!d.boot && d.boot.xx === true && d.boot.router === true &&
              d.boot.bcm === true && d.boot.bc === true &&
              sumEqRaw && finalEqFn && f.guarantee === false && f.partsN >= 1,
          label: 'S2 函数口径：XX._breakParts(null,false,false) 的 parts 求和 = raw、final = XX._breakChanceFinal(null,false)（且非必定成功）',
          detail: fnStr + ' | parts ' + f.partsN + ' 项（>0 的：' + ((f.nz || []).join(' / ') || '无') + '）' +
                  ' | guarantee=' + f.guarantee +
                  ' | 页面上 #break-confirm-modal/#bc-ok 都在=' + (d.boot ? (d.boot.bcm && d.boot.bc) : '?') +
                  ' | 开局弹窗 hidden=' + (d.boot ? d.boot.hidden0 : '?') + ' #bc-ok disabled=' + (d.boot ? d.boot.bcDisabled0 : '?') },
        { ok: d.clickBreak === 'ok' && d.opened === true && g.openNew === true &&
              d.rank1 === d.rank0 + 1 && expOk && d.hiddenAfter === true &&
              String(d.logBrk || '').indexOf('突破成功') >= 0,
          label: 'S2 真涨：点【突破】弹确认页 → 点 #bc-ok 后境界 +1、修为扣掉一档 need、确认页自动收回、新增日志里有「突破成功」行',
          detail: '点 #sc-break=' + d.clickBreak + ' 确认页开=' + d.opened +
                  ' | 境界 ' + d.rank0 + '→' + d.rank1 + ' | 修为 ' + d.exp0 + '→' + d.exp1 +
                  '（应扣 need=' + d.need0 + '） | 命中行「' + d.logBrk + '」顶行「' + d.logTop + '」' +
                  ' | 确认后弹窗 hidden=' + d.hiddenAfter + ' #bc-ok disabled=' + d.bcDisabledAfter +
                  ' | 一世突破计数 S.life.brk=' + d.brkCount },
        { ok: g.openOld === true && g.openNew === true && gc.old === true && gc.new === false,
          label: 'S2 闸门：确认页开着时新旧判据同为真（正常路径不回归），确认页关掉后旧判据（只看 disabled）仍为真、新判据（判非 hidden）为假 → 必须判 hidden',
          detail: '开着：old=' + g.openOld + ' new=' + g.openNew +
                  ' | 关掉后：old=' + gc.old + ' new=' + gc.new +
                  '（初始 #bc-ok 带 disabled；开页时按可否突破启用，关闭后仍是启用态 —— 旧判据仍为真）' +
                  ' | 关闭态命中测试：rect=' + JSON.stringify((d.hiddenHit || {}).rect) +
                  ' display=' + (d.hiddenHit || {}).display + ' offsetParent=' + (d.hiddenHit || {}).hasOffsetParent +
                  ' → elementFromPoint=' + (d.hiddenHit || {}).hitTop + ' 是否为 #bc-ok=' + (d.hiddenHit || {}).hitIsBc +
                  ' | 参考观测（不断言）：hidden 时用 .click() 再点一下 #bc-ok → 境界 ' + d.rank1 + '→' + d.rankBypass +
                  '，命中行「' + d.logBypass + '」' }
      ];
    }
  }
];

/* ---------------- 执行 ---------------- */
/* 冻结：动画时长归零 → 元素直接落在终态。CSS 动画不被 virtual-time 驱动，
   不冻就会量到第 0 帧（opacity:0、多出 translateX(18px) 的假溢出）。 */
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;' +
  'transition:none!important}</style>';

function runScenario(sc) {
  const file = path.join(SCRATCH, '._pt_' + sc.id + '_' + process.pid + '.html');
  const save = !sc.fresh && sc.save ? sc.save() : null;
  const seed = (save
    ? '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) +
      ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>'
    : '') +
    /* seedExtra：要在页面脚本跑起来之前就摆好的 localStorage（宗门 pid / 道号 / 服务地址） */
    (sc.seedExtra ? '<script>try{' + sc.seedExtra() + '}catch(e){}</scr' + 'ipt>' : '');
  /* body 允许写成函数：宗门场景要把 Node 侧起好的服务端口拼进去，而端口得等 listen 回调才知道 */
  const bodySrc = typeof sc.body === 'function' ? sc.body() : sc.body;
  const tail = '<script>' + HELPERS +
    '\nsetTimeout(function(){try{\n' + bodySrc + '\n}catch(e){__ptDone({__err:String((e&&e.stack)||e)});}},400);' +
    '\nsetTimeout(function(){if(!document.getElementById("__pt"))__ptDone({__timeout:true});},' +
      Math.max(1000, sc.budget - 1200) + ');' +
    '</scr' + 'ipt>';

  PAGE.writePage(file, HTML
    .replace('</head>', seed + '\n</head>')
    .replace('</body>', FREEZE + (sc.css ? '<style>' + sc.css + '</style>' : '') + tail + '\n</body>'), 'utf8');

  const ud = path.join(SCRATCH, 'xxpt' + process.pid + '_' + Date.now() + Math.random().toString(36).slice(2, 6));
  let dom = '';
  try {
    dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
      '--user-data-dir=' + ud, '--virtual-time-budget=' + sc.budget, '--window-size=' + sc.size]
      /* 真发 HTTP 的场景要 vtp: 'pauseIfRequestsFetch'，否则虚拟时间会在响应回来之前烧光 */
      .concat(sc.vtp ? ['--virtual-time-policy=' + sc.vtp] : [])
      .concat(['--dump-dom', 'file:///' + file.replace(/\\/g, '/')]),
      { encoding: 'utf8', timeout: Math.max(90000, sc.budget + 60000), maxBuffer: 1 << 26,
        stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) {
    dom = String((e && e.stdout) || '');
  } finally {
    /* PT_KEEP=1 保留现场（生成的页面 + profile），排查探针本身的问题时用 */
    if (!process.env.PT_KEEP) {
      try { fs.rmSync(file, { force: true }); } catch (e) {}
      try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
    }
  }
  const m = dom.match(/<pre id="__pt"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) return { err: '页面没有回报数据（探针没跑起来？）' };
  try { return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')); }
  catch (e) { return { err: '探针数据解析失败: ' + m[1].slice(0, 120) }; }
}

function main() {
  const argv = process.argv.slice(2);
  const verbose = argv.indexOf('-v') >= 0;
  const listOnly = argv.indexOf('-l') >= 0;
  const ids = argv.filter(a => a.indexOf('-') !== 0);

  if (listOnly) {
    SCENARIOS.forEach(s => console.log(s.id.padEnd(10) + s.name));
    return 0;
  }
  const picked = ids.length ? SCENARIOS.filter(s => ids.indexOf(s.id) >= 0) : SCENARIOS;
  if (!picked.length) {
    console.error('没有匹配的场景。可用：' + SCENARIOS.map(s => s.id).join(' / '));
    return 2;
  }

  let pass = 0, fail = 0, t0 = Date.now();
  console.log('');
  /* 只有真跑到 sect 场景才起服务子进程：其余巡检不联网，白起一个进程没意义 */
  const boot = picked.some(sc => sc.id === 'sect') ? sectStart() : Promise.resolve();
  return boot.then(() => {
  picked.forEach(sc => {
    const t = Date.now();
    const d = runScenario(sc);
    const rows = d.err ? [{ ok: false, label: '巡检没跑起来', detail: d.err }] : sc.checks(d);
    console.log('▶ ' + sc.id.padEnd(9) + sc.name + '   (' + ((Date.now() - t) / 1000).toFixed(1) + 's)');
    rows.forEach(r => {
      if (r.ok) pass++; else fail++;
      console.log('   ' + (r.ok ? '✓' : '✗') + ' ' + r.label + (r.detail ? '   [' + r.detail + ']' : ''));
    });
    if (verbose) console.log('   · 原始数据: ' + JSON.stringify(d).slice(0, 1200));
    console.log('');
  });

  const total = pass + fail;
  console.log('—— ' + picked.length + ' 个场景 · ' + total + ' 项断言 · 通过 ' + pass +
    ' / 失败 ' + fail + ' · 用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  if (process.env.PT_KEEP) console.log('（PT_KEEP=1：现场留在 ._pt_*.html）');
  return fail ? 1 : 0;
  });
}

/* main() 早退时返回数字、跑场景时返回 Promise，统一裹一层；退出前把真服务和它的数据文件收掉 */
Promise.resolve(main()).then(
  c => { sectStop(); process.exit(c || 0); },
  e => { sectStop(); console.error(e); process.exit(1); });
