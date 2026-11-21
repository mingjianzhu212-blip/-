'use strict';
/* ============================================================
 * _curve.js —— 进阶曲线量测（2026-10-25 第 57 节）
 *
 * 回答一个问题：**从第 r 层到第 r+1 层，要挂多久？**
 * 不做纸面推导，直接让页面报 XX._rate()（就是 expRate 本体），
 * 再用一次真实的 offline() 结算交叉核对，确认我读的公式没抄错。
 *
 * 三种横向投入档：
 *   裸   —— 什么都不升（只有境界加成），看纯粹的结构性斜率
 *   半程 —— 功法各 5 级、中品法宝、洞府 8 级、双灵根、道韵 1
 *   满   —— 功法全 10 级、上品法宝、洞府 20 级、单灵根、道韵 3
 *
 * 用法：node _curve.js        （会打印表格 + 结论摘要）
 * ============================================================ */
const { execFileSync } = require('node:child_process');
const { execEdge } = require('./tools/edge-run');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
/* 2026-10-26 用户要求：临时产物（浏览器 profile / 截图 / 中间 HTML）一律落 D 盘，不写 C 盘；D 不可用时退回系统 temp。 */
const SCRATCH = (function(){ try{ const p = 'D:/xx-scratch'; fs.mkdirSync(p, { recursive: true }); return p; }catch(e){ return os.tmpdir(); } })();

const ROOT = __dirname;
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
if (!EDGE) { console.error('找不到 Edge。'); process.exit(2); }
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const PROFILES = [
  { id: '裸',   gong: [0, 0, 0], weapon: 0, cave: 0,  rootIdx: 1, dao: 0, desc: '只有境界加成（结构斜率）' },
  { id: '半程', gong: [5, 5, 5], weapon: 2, cave: 8,  rootIdx: 2, dao: 1, desc: '功法各 5 级 / 中品法宝 / 洞府 8 级 / 双灵根 / 道韵 1' },
  { id: '满',   gong: [10, 10, 10], weapon: 3, cave: 20, rootIdx: 3, dao: 3, desc: '功法全满 / 上品法宝 / 洞府 20 级 / 单灵根 / 道韵 3' }
];

/* 页内：把每个档、每层的 expRate 报出来；顺带用真实 offline() 核一次 */
const BODY = `
/* 山门的价格一律问游戏本体（_gateXXXCost），工具里不抄公式——抄一遍就会漂 */
function gateCosts(){
  var S = XX._s, old = S.gate, o = {};
  S.gate = { lv: 0, disciples: [] };  o.build = XX._gateBuildCost();
  S.gate.lv = 1; o.lvc = 0;
  while(S.gate.lv < 5){ o.lvc += XX._gateLvCost(); S.gate.lv++; }      /* 五品→一品 累计 */
  S.gate.lv = 5;                                                       /* 一品：可收 12 人 */
  o.rec = 0;
  while(S.gate.disciples.length < 12){ o.rec += XX._gateRecruitCost(); S.gate.disciples.push({ id:'x' + S.gate.disciples.length, name:'x', apt:2, task:'', t0:0 }); }
  o.cap = XX._gateCap(); o.mult = XX._gateYieldMult();
  /* 弟子成长（第 62 节）：点化按"一档一口价"，出师回馈按"一层收入 × 0.20 × 资质/3" */
  o.apt = XX._gateAptCost();
  o.grad3 = XX._gateGradGain({ apt: 3 });
  S.gate = old || { lv: 0, disciples: [] };
  return o;
}
function save(p, r){
  var S = XX._s;
  S.rank = r;
  S.gong1 = p.gong[0]; S.gong2 = p.gong[1]; S.gong3 = p.gong[2];
  S.weapon = p.weapon; S.cave = p.cave; S.rootIdx = p.rootIdx; S.dao = p.dao;
  S.weaponLv = 0; S.affix = []; S.enhanceLv = 0;
  return S;
}
/* 悟道树（第 68 节扩到五层）：价直接问本体，工具里不抄 WU_COST */
function wuTable(){
  var S = XX._s, oldR = S.rank, oldWu = S.wu, oldPaid = S.wuPaid, out = {};
  [0, 10, 20].forEach(function(r){
    S.rank = r; out[r] = {};
    ['sword','dan','array'].forEach(function(k){
      S.wu[k] = 0;
      var cost = [], pct = XX._wuTree[k].pct;
      for(var i = 0; i < XX._wuMax; i++){ cost.push(XX._wuCost(k)); S.wu[k]++; }
      S.wu[k] = 0;
      out[r][k] = { cost: cost, pct: pct };
    });
  });
  S.rank = oldR; S.wu = oldWu; S.wuPaid = oldPaid;
  return out;
}
/* 洞天开辟（第 70 节）：三重价直接问本体，验证"每座合计 1.5 层收入" */
function dtTable(){
  var S = XX._s, old = { rank: S.rank, dt: S.dt, dtMain: S.dtMain };
  var out = { k: XX._dtK, rows: [], eff: {}, raw: null };
  [15, 17, 20, 23, 25].forEach(function(r){
    S.rank = r; S.dt = { qing:0, zhu:0, su:0, xuan:0, huang:0 }; S.dtMain = '';
    var inc = XX._stoneRate() * (XX._need(r) / XX._rate());
    var cost = [];
    for(var lv = 0; lv < 3; lv++){ S.dt.qing = lv; cost.push(XX._dtCost('qing')); }
    S.dt.qing = 0;
    var sum = cost.reduce(function(a, b){ return a + b; }, 0);
    out.rows.push({ rank: r, inc: inc, cost: cost, sum: sum, five: sum * 5 });
  });
  /* 效果不该随境界漂：15 与 25 全开、同主洞，总量必须一模一样 */
  [15, 25].forEach(function(r){
    S.rank = r; S.dt = { qing:3, zhu:3, su:3, xuan:3, huang:3 }; S.dtMain = 'qing';
    out.eff[r] = XX._dtTotals();
    if(r === 15){
      out.raw = {};
      XX._dtCaves.forEach(function(c){ out.raw[c.id] = XX._dtBonus(c.id); });
    }
  });
  S.rank = old.rank; S.dt = old.dt; S.dtMain = old.dtMain;
  return out;
}
setTimeout(function(){
  var PROF = ${JSON.stringify(PROFILES)};
  var out = { rows: [], check: null, wu: wuTable(), dt: dtTable() };
  PROF.forEach(function(p){
    for(var r = 0; r <= 25; r++){
      save(p, r);
      out.rows.push({ prof: p.id, rank: r,
        rate: XX._rate(), need: XX._need(r), stone: XX._stoneRate(),
        gate: gateCosts(),                                  /* 山门（第 61 节）：价直接问游戏本体 */
        caveCost: XX._caveCost(), gongCost: [XX._gongCost({id:'gong1',costK:0.15,costR:1.30}),
                                              XX._gongCost({id:'gong2',costK:0.18,costR:1.32}),
                                              XX._gongCost({id:'gong3',costK:0.22,costR:1.35})] });
    }
  });
  /* 交叉核对：真实走一次 offline()，看 8 小时到底进了多少修为 */
  var S = save(PROF[1], 11);
  S.exp = 0; S.last = Date.now() - 8 * 3600 * 1000;
  var e0 = S.exp;
  try{ XX._offline(); }catch(e){}
  out.check = { rank: 11, gainedExp: S.exp - e0, expect: XX._rate() * 8 * 3600 };
  __ptDone(out);
}, 900);
`;

const HELPERS = `
window.__ptDone = function(o){
  var p = document.getElementById('__pt');
  if(!p){ p = document.createElement('pre'); p.id = '__pt'; p.style.display = 'none'; document.body.appendChild(p); }
  p.textContent = JSON.stringify(o).replace(/</g, '\\u003c');
};
window.onerror = function(m, u, l){ try{ __ptDone({ __err: String(m) + ' @' + l }); }catch(e){} return false; };
`;

const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}' +
  '#char-modal,.off-modal{display:none!important}</style>';

const file = path.join(ROOT, '._curve_' + process.pid + '.html');
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify({
  name: '曲线', sex: 'm', gender: 'male', rank: 0, exp: 0, stone: 0, cave: 0, rootIdx: 1,
  story: { claimed: {} }, miles: {}, milesNew: [], letters: [], bag: [], plots: [],
  mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 },
  stats: { sit: 0, herb: 0, train: 0, enlight: 0, craftPill: 0, explore: 0, hunt: 0, enhance: 0, stoneEarned: 0, farmN: 0 },
  arena: { day: '', left: 3, tier: 0, win: 0, lose: 0, rep: 0, foes: [] },
  secret: { prog: [0, 0, 0, 0], day: '', swept: 0 },
  enc: { t: 0, bubble: null, lastId: '' }, last: Date.now()
})) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';

fs.writeFileSync(file, HTML
  .replace('</head>', seed + '\n</head>')
  .replace('</body>', FREEZE + '<script>' + HELPERS + BODY + '</scr' + 'ipt>\n</body>'), 'utf8');

const ud = path.join(SCRATCH, 'xxcv' + Date.now());
let dom = '';
try {
  dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--user-data-dir=' + ud, '--virtual-time-budget=6000', '--window-size=800,1000',
    '--dump-dom', 'file:///' + file.replace(/\\/g, '/')],
    { encoding: 'utf8', timeout: 90000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) { dom = String((e && e.stdout) || ''); }
try { fs.rmSync(file, { force: true }); } catch (e) {}
try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}

const m = dom.match(/<pre id="__pt"[^>]*>([\s\S]*?)<\/pre>/);
if (!m) {
  console.error('页面没报数据——探针没跑起来。');
  process.exit(1);
}
const D = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

/* ---- 输出 ---- */
const NAME = ['炼气一','炼气二','炼气三','炼气四','炼气五','炼气六','炼气七','炼气八','炼气九',
  '筑基初','筑基中','筑基后','金丹初','金丹中','金丹后','元婴初','元婴中','元婴后',
  '化神初','化神中','化神后','炼虚','合体','大乘','渡劫','飞升'];

const byProf = {};
D.rows.forEach(r => { (byProf[r.prof] = byProf[r.prof] || {})[r.rank] = r; });

const fmtDur = s => {
  if (s < 90) return Math.round(s) + 's';
  if (s < 5400) return (s / 60).toFixed(1) + 'm';
  if (s < 86400 * 2) return (s / 3600).toFixed(1) + 'h';
  return (s / 86400).toFixed(1) + 'd';
};
const fmtNum = n => n >= 1e8 ? (n / 1e8).toFixed(2) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(Math.round(n));

console.log('');
console.log('交叉核对（真实 offline()，境界 11 / 半程档 / 8 小时）：');
console.log('  实得修为 ' + fmtNum(D.check.gainedExp) + '　公式推算 ' + fmtNum(D.check.expect) +
  '　偏差 ' + (100 * (D.check.gainedExp / D.check.expect - 1)).toFixed(2) + '%');
console.log('');
console.log('每层所需挂机时长（单层，不含手动操作）');
console.log('层  境界     需求        裸        半程       满');
for (let r = 0; r <= 25; r++) {
  const a = byProf['裸'][r], b = byProf['半程'][r], c = byProf['满'][r];
  console.log(
    String(r).padStart(2) + '  ' + NAME[r].padEnd(6) +
    fmtNum(a.need).padStart(9) +
    fmtDur(a.need / a.rate).padStart(10) +
    fmtDur(b.need / b.rate).padStart(10) +
    fmtDur(c.need / c.rate).padStart(10)
  );
}

/* 结构性结论 */
const a0 = byProf['裸'], b0 = byProf['半程'], c0 = byProf['满'];
const ratio = i => (a0[i + 1].need / a0[i + 1].rate) / (a0[i].need / a0[i].rate);
console.log('');
console.log('结构性斜率（裸档，相邻两层时长比）：' + ratio(3).toFixed(3) + '×/层');
console.log('  → 等价于每层耗时乘以 ' + ratio(3).toFixed(2) + '，25 层累计膨胀 ' +
  Math.round(Math.pow(ratio(3), 21)) .toLocaleString() + ' 倍');
console.log('  → 需求每层 ×1.85，境界自身增速只有 ×1.18；差额必须由横向系统补。');
console.log('');

[['半程', b0], ['满', c0]].forEach(([k, prof]) => {
  const cross8 = [];
  const cross24 = [];
  for (let r = 0; r < 25; r++) {
    const t = prof[r].need / prof[r].rate;
    if (t > 8 * 3600 && cross8.length === 0) cross8.push(r);
    if (t > 86400 && cross24.length === 0) cross24.push(r);
  }
  const r8 = cross8[0], r24 = cross24[0];
  console.log(k + '档：单层超过 8 小时（离线封顶）从 ' + (r8 === undefined ? '没有' : '第 ' + r8 + ' 层「' + NAME[r8] + '」') +
    ' 开始；超过 24 小时从 ' + (r24 === undefined ? '没有' : '第 ' + r24 + ' 层「' + NAME[r24] + '」') + ' 开始。');
});

/* ---- 经济体检：一层的时间里挣的灵石，够不够买"下一级加速" ---- */
console.log('经济体检（半程档）：一层的挂机灵石收入 vs 下一级洞府 / 下一级功法');
console.log('层  境界     一层收入     洞府下一级   占收入   功法1下一级  占收入');
for (let r = 0; r < 25; r++) {
  const p = b0[r];
  const dur = p.need / p.rate;
  const inc = p.stone * dur;
  const cc = p.caveCost;
  const gc = p.gongCost[0];
  console.log(
    String(r).padStart(2) + '  ' + NAME[r].padEnd(6) +
    fmtNum(inc).padStart(9) + fmtNum(cc).padStart(12) +
    ((100 * cc / inc).toFixed(1) + '%').padStart(8) +
    fmtNum(gc).padStart(13) + ((100 * gc / inc).toFixed(1) + '%').padStart(8)
  );
}
console.log('（>100% = 一层的时间攒不够买那一级，升级要靠好几层攒钱）');
console.log('');

/* ---- 反馈到位率：一次上线 / 一次点击，玩家能看见多少进度 ---- */
/* 离线封顶 = 8h × 1.12^max(0, r-14)；打坐 = max(10s, need×0.2%)；顿悟 = max(100s, need×1%)，大悟 ×2 */
const capOf = r => 8 * 3600 * Math.pow(1.12, Math.max(0, r - 14));
const manualOf = (p, r) => {
  const T = p.need / p.rate;          /* 一层需要的挂机秒 */
  const sit = 10 * Math.max(10 / T, 0.002);
  const enl = 5 * (0.8 * Math.max(100 / T, 0.01) + 0.2 * Math.max(200 / T, 0.02));
  return { sit: Math.max(10 / T, 0.002), enl: 0.8 * Math.max(100 / T, 0.01) + 0.2 * Math.max(200 / T, 0.02),
           day: sit + enl };
};

console.log('反馈到位率（半程档）：一次闭关能推多少、一次点击能推多少');
console.log('层  境界     一层时长    离线封顶   封顶覆盖   打坐1次    顿悟1次    一天手动');
for (let r = 0; r <= 25; r++) {
  const p = b0[r];
  const T = p.need / p.rate;
  const cap = capOf(r);
  const mm = manualOf(p, r);
  console.log(
    String(r).padStart(2) + '  ' + NAME[r].padEnd(6) +
    fmtDur(T).padStart(9) + fmtDur(cap).padStart(10) +
    ((100 * Math.min(1, cap / T)).toFixed(0) + '%').padStart(9) +
    ((100 * mm.sit).toFixed(2) + '%').padStart(9) +
    ((100 * mm.enl).toFixed(2) + '%').padStart(9) +
    ((100 * mm.day).toFixed(1) + '%').padStart(9)
  );
}
console.log('（封顶覆盖 = 一次闭关最多能推掉这一层的百分之几；<100% 说明上线一次看不完一层）');
console.log('');
/* ---- 灵石口子：参悟能吃掉多少富余 ---- */
/* 参悟一次 = 需求 ×3%，成本 = 一层灵石收入 × 8%；每日 3 次 */
console.log('灵石口子（参悟）：每天 3 次能换多少进度、吃掉多少灵石');
console.log('层  境界     一次耗时    3次换进度   3次花掉（一层收入的比例）   一日总进度(封顶+参悟)');
for (let r = 10; r <= 25; r++) {
  const p = b0[r];
  const T = p.need / p.rate;
  const inc = p.stone * T;
  const cost3 = 0.08 * inc * 3;
  const gain3 = 0.03 * 3;
  const cap = capOf(r);
  console.log(
    String(r).padStart(2) + '  ' + NAME[r].padEnd(6) +
    fmtDur(T).padStart(9) +
    ((100 * gain3).toFixed(0) + '%').padStart(11) +
    ((100 * cost3 / inc).toFixed(0) + '%').padStart(26) +
    ((100 * (Math.min(1, cap / T) + gain3)).toFixed(0) + '%').padStart(22)
  );
}
console.log('（8% / 3% / 3 次都标着 [PLACEHOLDER]：未经过真人 playtest）');
console.log('');

/* ---- 山门 · 弟子（第 61 节）：价格锚在"一层收入"，贡献锚在"自己的修炼速度" ---- */
/* 价直接读游戏本体（gateCosts），不在这里抄公式；只有"贡献"是设计口径：
     满编闭关贡献 = 12 人 × 2% × (资质均值 2.2 / 3) × 一品 +50%
   它必须是一条平线——锚的是"自己的修炼速度"，所以境界涨它按比例涨，占比不变。
   若这张表里的百分比随层数往上走，就说明又锚到"当前层需求"上了（第 58 节踩过）。 */
{
  const APT_AVG = 2.2, K = 0.02, DMUL = 1.5, N = 12;
  const pct = N * K * (APT_AVG / 3) * DMUL;
  console.log('山门 · 弟子：开山/收徒/升品阶的价（按"一层灵石收入"的倍数看），与满编贡献');
  console.log('层  境界     一层收入      开山      收满12徒     升满五品   价合计/层收入  满编闭关贡献');
  for (let r = 9; r <= 25; r++) {
    const p = b0[r], g = p.gate;
    const T = p.need / p.rate;
    const inc = p.stone * T;
    const all = g.build + g.rec + g.lvc;
    console.log(
      String(r).padStart(2) + '  ' + NAME[r].padEnd(6) +
      fmtNum(inc).padStart(11) +
      fmtNum(g.build).padStart(10) +
      fmtNum(g.rec).padStart(12) +
      fmtNum(g.lvc).padStart(11) +
      ((all / inc).toFixed(1) + ' 层').padStart(14) +
      ('+' + (100 * pct).toFixed(0) + '%').padStart(15)
    );
  }
  console.log('（"价合计"应稳定在 12 层左右——开山 1 + 收满约 6 + 升满约 5，全锚一层收入，所以层数一变钱就跟着变）');
  console.log('（"满编贡献"应是一条平的 +' + (100 * pct).toFixed(0) + '%：12 人闭关各抵自己 2% 的修炼速度）');
  console.log('');
}

/* ---- 弟子成长（第 62 节）：点化 / 出师 / 门风，三条同样锚"一层收入" ----
   所以它们在这张表里也应该是平线。若"12 人全点满"随层数上涨，说明价又锚到了别处。 */
{
  const pct = 12 * 0.02 * (2.2 / 3) * 1.5;
  console.log('弟子成长：点化（一档一口价）/ 出师回馈 / 门风，都按"一层灵石收入"折算');
  console.log('层  境界     点化一档    12人全点满   出师回馈(玄阶)   满编贡献  含门风满');
  for (let r = 9; r <= 25; r += 4) {
    const p = b0[r], g = p.gate;
    const inc = p.stone * (p.need / p.rate);
    const aptLv = g.apt / inc, full = (g.apt * 4 * 12) / inc, gradLv = g.grad3 / inc;
    console.log(
      String(r).padStart(2) + '  ' + NAME[r].padEnd(6) +
      (aptLv.toFixed(3) + ' 层').padStart(11) +
      (full.toFixed(1) + ' 层').padStart(12) +
      (gradLv.toFixed(3) + ' 层').padStart(13) +
      ('+' + (100 * pct).toFixed(0) + '%').padStart(11) +
      ('+' + (100 * pct * 1.2).toFixed(0) + '%').padStart(11)
    );
  }
  console.log('（前三列应当一路不变：0.12 / 5.8 / 0.20——第 9 层和第 25 层"贵得一样"，这正是设计要的）');
  console.log('（最后一列是门风满十人后的上限：+' + (100 * pct).toFixed(0) + '% × 1.2 = +' + (100 * pct * 1.2).toFixed(0) + '%）');
  console.log('');
}

/* ---- 悟道树（第 68 节扩到五层）：每 1% 的价格必须随层数上涨 ----
   价直接读游戏本体（_wuCost），这里只负责把"贵了多少"摆出来。
   基准日收入 = 签到 100 + 日常 180（×境界系数），任务/巡山/失败没算——所以天数只会更短。 */
{
  const WU = D.wu, MU = r => Math.pow(1.15, r);
  const keys = [['sword', '锋芒 · 战力'], ['dan', '归一 · 修炼'], ['array', '地脉 · 灵石']];
  console.log('悟道树：五层价（直接读游戏本体）与"每 1% 的价格"');
  [0, 10, 20].forEach(r => {
    console.log('境界 ' + r + '（系数 ×' + MU(r).toFixed(2) + '）：');
    keys.forEach(([k, label]) => {
      const cell = WU[r][k], sum = cell.cost.reduce((a, b) => a + b, 0);
      console.log('  ' + label + '  ' +
        cell.cost.map((v, i) => fmtNum(v) + '/' + cell.pct[i] + '%').join('  ') +
        '   合计 ' + fmtNum(sum) + ' · 每1% ' +
        cell.cost.map((v, i) => (v / cell.pct[i]).toFixed(0)).join('/'));
    });
    const daily = 280 * MU(r), branch = WU[r].sword.cost.reduce((a, b) => a + b, 0);
    console.log('  基准日收入约 ' + fmtNum(daily) + '（未计任务/巡山）；一路点满约 ' +
      (branch / daily).toFixed(0) + ' 天');
  });
  console.log('（每 1% 一层比一层贵，扩层不是"更便宜的同款"；一路 12400×系数 ≈ 4 枚天机令）');
  console.log('');
}

/* ---- 洞天开辟（第 70 节）：五座 × 三重，价格锚"一层灵石收入" ----
   设计口径：每座三重合计 = 1.5 层收入（0.30 + 0.50 + 0.70），五座 = 7.5 层。
   效果全是百分比，不随境界漂；价按"买的那一刻"现算，所以占比是平线。 */
{
  const DT = D.dt;
  console.log('洞天开辟：三重价 = 一层灵石收入的 0.30 / 0.50 / 0.70');
  console.log('层  境界     一层收入      初辟      灵脉      洞天   合计/一层   五座/一层');
  DT.rows.forEach(r => {
    console.log(
      String(r.rank).padStart(2) + '  ' + NAME[r.rank].padEnd(6) +
      fmtNum(r.inc).padStart(11) +
      fmtNum(r.cost[0]).padStart(10) +
      fmtNum(r.cost[1]).padStart(10) +
      fmtNum(r.cost[2]).padStart(10) +
      (r.sum / r.inc).toFixed(2).padStart(11) +
      (r.five / r.inc).toFixed(2).padStart(11)
    );
  });
  console.log('（"合计/一层"应稳定在 1.5、"五座/一层"稳定在 7.5——floor 的零头会带来 ±0.01）');
  console.log('');
  const T = DT.eff[15], T25 = DT.eff[25];
  const rows = [['craft', '炼丹成功率'], ['pow', '战力'], ['enh', '强化成功率'],
    ['exp', '修炼'], ['stone', '灵石']];
  console.log('五座全开（主洞青华 ×1.5）的总效果：');
  rows.forEach(([k, label]) => { if(T[k]) console.log('  ' + label.padEnd(10) + '+' + T[k] + '%'); });
  if(T.refund) console.log('  ' + '炼丹失败返还'.padEnd(10) + (30 + T.refund) + '%（原 30%）');
  if(T.ore) console.log('  ' + '矿石消耗'.padEnd(10) + '−' + T.ore + '%');
  if(T.off) console.log('  ' + '离线封顶'.padEnd(10) + '+' + T.off + ' 小时');
  if(T.bag) console.log('  ' + '背包'.padEnd(10) + '+' + T.bag + ' 格');
  console.log('  （15 层与 25 层总量' +
    (JSON.stringify(T) === JSON.stringify(T25) ? '完全一致 → 平线，没有偷偷锚回"当前层需求"' : '不一致 → 漂了！') + '）');
  console.log('');
}
