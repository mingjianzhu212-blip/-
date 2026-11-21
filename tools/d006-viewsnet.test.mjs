/* D-006 专项：从未被审查过的模块（views / net / npc* / story / daily / trib / tutorial）清扫
 *
 * 逐条对应：
 *   A. 联机页 offline 死锁（大厅卡被藏 → 唯一地址输入框不可达）
 *   B. [hidden] 被 .mc-opts / .ch-input 的 display 盖掉
 *   C. tutorial.js 加载顺序（router.js 末尾同步 XX.boot）
 *   D. daily.js 日期单调 / isFinite / 去重 / claim 重读
 *   E. game.js 签到与行动次数的日期判定（改系统时间刷资源）
 *   F. npc_memory.record 写盘失败仍报 ok
 *   G. npc_visit 写盘失败不可见 / _state 返回内部引用
 *   H. restoreSidecar 后 NPC 常驻内存未重载（导入被覆盖）
 *   I. 崔九旧事行双冒号病句
 *   J. trib busy 分支丢 onDone
 *
 * 手法：能跑就跑真实源码（vm 注入 window/localStorage/Date），跑不动的要求源码形式断言并注明。
 * 运行：node --test tools/d006-viewsnet.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const GAME = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
const NET = fs.readFileSync(path.join(ROOT, 'js/net.js'), 'utf8');
const DAILY = fs.readFileSync(path.join(ROOT, 'js/daily.js'), 'utf8');
const NPC_MEM = fs.readFileSync(path.join(ROOT, 'js/npc_memory.js'), 'utf8');
const NPC_VISIT = fs.readFileSync(path.join(ROOT, 'js/npc_visit.js'), 'utf8');
const NPC_TOWER = fs.readFileSync(path.join(ROOT, 'js/npc_tower.js'), 'utf8');
const TRIB = fs.readFileSync(path.join(ROOT, 'js/trib.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');

function extractFn(src, name){
  const idx = src.indexOf('function ' + name + '(');
  if(idx < 0) throw new Error('fn not found: ' + name);
  let i = src.indexOf('{', idx), depth = 0;
  for(let j = i; j < src.length; j++){
    if(src[j] === '{') depth++;
    else if(src[j] === '}'){ depth--; if(depth === 0) return src.slice(idx, j + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

/* ============================================================ */
/* A. 联机页死锁                                                 */
/* ============================================================ */

test('A: offline 态必须露出大厅卡（否则唯一能填地址的输入框不可达）', async () => {
  const i = GAME.indexOf("const st = window.Net ? Net.state() : 'offline';");
  assert.ok(i > 0, '必须能定位 renderMulti 的状态判定');
  const seg = GAME.slice(i, i + 900);
  assert.match(seg, /hall\.hidden = !\(st === 'lobby' \|\| st === 'offline'\)/,
    'offline 也显示大厅卡：state 只能由 Net.connect 改成 lobby，connect 只由卡内 #xx-multi-join 触发');
  assert.doesNotMatch(seg, /hall\.hidden = st !== 'lobby'/,
    '旧写法会让 offline 藏掉整张卡 → 新玩家永远连不上（闭环死锁）');
});

test('A: go 分支真的切到道号行（注释承诺必须兑现）', async () => {
  const fn = extractFn(GAME, 'multiAct');
  const i = fn.indexOf("if(act === 'go')");
  const seg = fn.slice(i, i + 900);
  assert.match(seg, /nr\.hidden = false/, '必须展开道号行');
  assert.match(seg, /cr\.hidden = true/, '必须收起地址行');
  assert.match(seg, /hallmsg/, '必须给一句可见反馈');
});

test('A: 五个静默动作统一走 multiCall（失败要提示）', async () => {
  const fn = extractFn(GAME, 'multiAct');
  ['/api/room/ready', '/api/room/start', '/api/run/strike', '/api/run/leave', '/api/room/leave', '/api/room/chat']
    .forEach(p => {
      const i = fn.indexOf(p);
      assert.ok(i > 0, '找不到 ' + p);
      assert.match(fn.slice(Math.max(0, i - 60), i + 20), /multiCall\(/, p + ' 必须走 multiCall');
    });
  const call = extractFn(GAME, 'multiCall');
  assert.match(call, /if\(!r \|\| !r\.ok\) multiToastErr\(r\)/, '失败必须提示');
});

test('A: 传输层失败码有对应中文文案（不再是"没成：NETWORK"）', async () => {
  const fn = extractFn(GAME, 'multiToastErr');
  ['NOT_CONNECTED', 'NETWORK', 'TIMEOUT', 'ALREADY_STRUCK', 'NO_SKILL_USES'].forEach(k => {
    assert.ok(fn.includes(k + ':'), '缺少 ' + k + ' 的文案');
  });
  assert.match(fn, /xx-multi-runinfo/, '副本态必须写到副本卡内的容器，否则玩家看不见');
});

test('A: 离开房间后本地归位（否则永久卡在房间态）', async () => {
  const fn = extractFn(GAME, 'multiAct');
  const i = fn.indexOf("if(act === 'leaveroom')");
  assert.ok(i > 0);
  assert.match(fn.slice(i, i + 600), /Net\.clearRoom/, '必须在确认成功后清掉 data.room 并回 lobby');
  assert.match(NET, /clearRoom: function \(\) \{[\s\S]{0,120}data\.room = null;/, 'net 层要真的清 room');
});

test('A: run.log 走 escHtml（未转义的 innerHTML sink）', async () => {
  assert.match(GAME, /logBox\.innerHTML = \(run\.log \|\| \[\]\)\.map\(t => '<p class="npc-greet-line">' \+ escHtml\(t\) \+ '<\/p>'\)/,
    'run.log 含玩家自填道号，服务器只校验长度不滤字符');
});

/* ============================================================ */
/* B. [hidden] 被 display 盖掉                                    */
/* ============================================================ */

test('B: style.css 补齐 .ch-input[hidden] / .mc-opts[hidden]', async () => {
  assert.match(CSS, /\.ch-input\[hidden\]\{ display:none; \}/, '缺 .ch-input[hidden]（≤520px 时地址行/道号行收不回去）');
  assert.match(CSS, /\.mc-opts\[hidden\]\{ display:none; \}/, '缺 .mc-opts[hidden]（登录后道途行收不回去）');
  /* 证据：这两个类确实各自带 display，会把 UA 的 [hidden]{display:none} 盖掉 */
  assert.match(CSS, /\.mc-opts\{ display:grid;/, '.mc-opts 的 display:grid 是覆盖来源');
  assert.match(CSS, /\.ch-input\{ display:flex;/, '.ch-input 的 display:flex 是覆盖来源');
});

/* ============================================================ */
/* C. tutorial 加载顺序                                          */
/* ============================================================ */

test('C: tutorial.js 必须在 router.js 之前加载', async () => {
  const a = INDEX.indexOf('js/tutorial.js');
  const b = INDEX.indexOf('js/router.js');
  assert.ok(a > 0 && b > 0 && a < b,
    'router.js 末尾同步执行 XX.boot() → finishBoot 里的 Tutorial.start() 必须有 Tutorial 可用');
  assert.match(GAME, /if\(window\.Tutorial\) window\.Tutorial\.start\(\);/,
    '唯一调用点仍是带守卫的，顺序错了就是静默跳过');
});

/* ============================================================ */
/* D. daily.js                                                   */
/* ============================================================ */

/* 用可控的"今天"跑真实 daily.js（它只用无参 new Date()） */
function makeDaily(nowParts, store, opts){
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a){ if(a.length === 0) super(nowParts[0], nowParts[1] - 1, nowParts[2], 12, 0, 0); else super(...a); }
    static now(){ return new RealDate(nowParts[0], nowParts[1] - 1, nowParts[2], 12, 0, 0).getTime(); }
  }
  const ls = {
    getItem(k){ return k in store ? store[k] : null; },
    setItem(k, v){ store[k] = String(v); },
    removeItem(k){ delete store[k]; },
  };
  const ctx = { window: {}, localStorage: ls, console, Date: FakeDate, JSON, Math, Object, Array, String, Number };
  ctx.window = ctx;
  /* claim 现在只走 Web Locks（无锁则拒绝）。默认注入一个真互斥的假实现，模拟现代浏览器。 */
  let tail = Promise.resolve();
  ctx.navigator = { locks: { request(name, fn){ const run = tail.then(() => fn()); tail = run.then(() => {}, () => {}); return run; } } };
  vm.createContext(ctx);
  vm.runInContext(DAILY, ctx);
  /* init 是 game.js boot 时的标准入口：load() + ensureDay()。这里照原样调，
     让"读盘 → 清洗 → 跨天判定"整条真实路径跑起来（不调的话 st 为 null）。 */
  if(!(opts && opts.skipInit)){
    ctx.ready = ctx.Daily.init({ needOf: () => 100, rank: () => 0, wisdomGain: v => v, grant: () => {}, log: () => {} });
  }
  return ctx;
}

test('D: todayKey 补零（否则字符串比较在 8~9 号与 10~31 号之间会反过来）', async () => {
  const ctx = makeDaily([2026, 11, 8], {});
  assert.ok(ctx.Daily, 'Daily 必须挂到 window 上');
  /* 通过 list() 间接无法取到 key，这里直接跑源码里的函数体 */
  const ctx2 = { Date: class extends Date { constructor(){ super(2026, 10, 8, 12); } } };
  vm.createContext(ctx2);
  vm.runInContext(extractFn(DAILY, 'pad2') + '\n' + extractFn(DAILY, 'todayKey') + '\nthis.todayKey = todayKey;', ctx2);
  assert.strictEqual(ctx2.todayKey(), '2026-11-08');
});

test('D: 日期往后走才重置（重置由锁内路径执行）', async () => {
  const store = {
    jxwd_daily_v1: JSON.stringify({ day: '2026-11-08', prog: { sit: 10, train: 3, tower: 1 }, claimed: ['sit', 'train', 'tower'] }),
  };
  // 同一天 → 已领记录保留
  let ctx = makeDaily([2026, 11, 8], store);
  await ctx.ready;
  assert.ok(ctx.Daily.allClaimed(), '同一天应保持已全部领取');

  // 往后一天 → init（锁内）执行跨天重置
  ctx = makeDaily([2026, 11, 9], store);
  await ctx.ready;
  assert.ok(!ctx.Daily.allClaimed(), '跨天必须重置');
  assert.deepStrictEqual(ctx.Daily._state().claimed, [], '锁内 init 负责真正的重置');
  assert.strictEqual(ctx.Daily._state().prog.sit, 0);
});

test('D: 系统时间回拨不再赠一次重置（原实现只判 !==）', async () => {
  const store = {
    jxwd_daily_v1: JSON.stringify({ day: '2026-11-20', prog: { sit: 10, train: 3, tower: 0 }, claimed: ['sit', 'train'] }),
  };
  const ctx = makeDaily([2026, 11, 10], store);   // 时钟被改到更早
  await ctx.ready;
  const st = ctx.Daily._state();
  assert.deepStrictEqual(st.claimed, ['sit', 'train'], '回拨不得清空已领记录');
  assert.strictEqual(st.prog.sit, 10, '回拨不得清零进度');
  assert.strictEqual(st.day, '2026-11-20', '也不得覆盖记录日（保持较晚那天）');
});

test('D: 历史未补零日期（2026-11-8）仍被正确识别为同一天', async () => {
  const store = {
    jxwd_daily_v1: JSON.stringify({ day: '2026-11-8', prog: { sit: 10, train: 0, tower: 0 }, claimed: ['sit'] }),
  };
  const ctx = makeDaily([2026, 11, 8], store);
  await ctx.ready;
  const st = ctx.Daily._state();
  assert.deepStrictEqual(st.claimed, ['sit'], '同一天不得因格式差异被重置');
  assert.strictEqual(st.prog.sit, 10);
  assert.strictEqual(st.day, '2026-11-08', 'day 应被规范化为补零格式');
});

test('D: prog=Infinity 不得让任务立刻可领（1e999 解析结果）', async () => {
  const store = {
    jxwd_daily_v1: JSON.stringify({ day: '2026-11-08', prog: { sit: 10, train: 3, tower: 1 }, claimed: [] }),
  };
  // 用 JSON.parse 得到真正的 Infinity
  store.jxwd_daily_v1 = store.jxwd_daily_v1.replace('"sit":10', '"sit":1e999');
  const ctx = makeDaily([2026, 11, 8], store);
  await ctx.ready;
  const st = ctx.Daily._state();
  assert.strictEqual(st.prog.sit, 0, 'Infinity 必须被钳成 0，否则三个任务立刻可领');
  const sit = ctx.Daily.list().find(t => t.id === 'sit');
  assert.strictEqual(sit.done, false, '被钳成 0 的 sit 不得显示可领');
  assert.strictEqual(sit.prog, 0);
});

test('D: claimed 去重，allClaimed 不再按长度谎报', async () => {
  const store = {
    jxwd_daily_v1: JSON.stringify({ day: '2026-11-08', prog: { sit: 10, train: 0, tower: 0 }, claimed: ['sit', 'sit', 'sit'] }),
  };
  const ctx = makeDaily([2026, 11, 8], store);
  await ctx.ready;
  assert.deepStrictEqual(ctx.Daily._state().claimed, ['sit'], '必须去重');
  assert.strictEqual(ctx.Daily.allClaimed(), false, '三个 sit 不代表三件事都领了');
});

test('D: claim 在锁内重读磁盘（顺序双标签页场景：第二页被拒且不二次发奖）', async () => {
  const store = {};
  const ctx = makeDaily([2026, 11, 8], store);
  let granted = 0;
  ctx.Daily.init({ needOf: () => 100, rank: () => 0, wisdomGain: v => v, grant: () => { granted++; return true; }, log: () => {} });
  await ctx.Daily.bump('sit', 10);
  /* 模拟另一个标签页已经领过并写盘 */
  const cur = JSON.parse(store.jxwd_daily_v1);
  cur.claimed = ['sit'];
  store.jxwd_daily_v1 = JSON.stringify(cur);

  const r = await ctx.Daily.claim('sit');
  assert.strictEqual(r.ok, false, '磁盘上已领过 → 必须拒绝');
  assert.strictEqual(r.msg, '今日已领取');
  assert.strictEqual(granted, 0, '绝不能二次发奖');
});

/* 并发测试：单线程 JS 无法制造真正的交错，所以用「真互斥」的假 Web Locks 验证串行化。
   这与被测代码的选择一致：claim 只走 Web Locks，没有锁就明确拒绝（第三轮复审裁定）。 */
function makeLockedDaily(store){
  return makeDaily([2026, 11, 8], store);   /* makeDaily 默认已注入互斥锁 */
}

test('D: 并发双领（Web Locks）→ 只发一次奖', async () => {
  const store = {};
  const ctx = makeLockedDaily(store);
  let granted = 0;
  ctx.Daily.init({ needOf: () => 100, rank: () => 0, wisdomGain: v => v, grant: () => { granted++; return true; }, log: () => {} });
  await ctx.Daily.bump('sit', 10);

  /* 两个「标签页」同时发起领取：都还没看到对方的写入 */
  const [a, b] = await Promise.all([ctx.Daily.claim('sit'), ctx.Daily.claim('sit')]);
  const okN = [a, b].filter(x => x && x.ok).length;
  assert.strictEqual(okN, 1, '并发双领只能有一次成功（锁内重读拦掉第二次）');
  assert.strictEqual(granted, 1, 'grant 只能执行一次 —— 这才是原子性证据');
  assert.deepStrictEqual(JSON.parse(store.jxwd_daily_v1).claimed, ['sit'], 'claimed 只能记一条');
});

test('D: 无 Web Locks → 直接拒绝领取（不再走非原子租约降级）', async () => {
  const store = {};
  const ctx = makeDaily([2026, 11, 8], store);
  delete ctx.navigator;                       /* 模拟不支持 Web Locks 的旧环境 */
  let granted = 0;
  await ctx.Daily.init({ needOf: () => 100, rank: () => 0, wisdomGain: v => v, grant: () => { granted++; return true; }, log: () => {} });
  /* bump 在无锁环境也拒绝写入（跨标签页读改写不安全），所以进度需要手工铺到磁盘上 */
  store.jxwd_daily_v1 = JSON.stringify({ day: '2026-11-08', prog: { sit: 10, train: 0, tower: 0 }, claimed: [] });

  const r = await ctx.Daily.claim('sit');
  assert.strictEqual(r.ok, false, '没有原子锁就不发钱');
  assert.strictEqual(r.code, 'NO_LOCK');
  assert.match(r.msg, /不支持安全的跨窗口领取/, '要让玩家知道原因');
  assert.match(r.msg, /只开一个窗口/, '要给可操作指引，不能只说不行');
  assert.strictEqual(granted, 0, '被拒时一分钱都不能发');
  /* 拒绝时不留任何标记，也不写盘：磁盘内容应保持手工铺的那一份 */
  assert.deepStrictEqual(JSON.parse(store.jxwd_daily_v1).claimed, [], '拒绝时不能留下已领标记');
});

test('D: 发奖失败（主档写不进去）→ 保留待入账记录等补发，不谎称成功', async () => {
  const store = {};
  const ctx = makeDaily([2026, 11, 8], store);
  ctx.Daily.init({ needOf: () => 100, rank: () => 0, wisdomGain: v => v, grant: () => false, log: () => {} });
  await ctx.Daily.bump('sit', 10);
  const r = await ctx.Daily.claim('sit');
  assert.strictEqual(r.ok, false, '主档没写进去就不能宣称领取成功');
  assert.match(r.msg, /下次进入游戏会自动补上/, '要明确告诉玩家会自动补发');
  /* 语义（第二轮复审后）：**不回滚 claimed**，靠 pending + 启动补发保证"不会白扣"。
     回滚标记会让玩家能立刻再点一次，而主档里其实可能已经进过账（写盘报错≠一定没写）。 */
  const st = ctx.Daily._state();
  assert.deepStrictEqual(st.claimed, ['sit'], '标记保留：这一笔算已领，靠补发兜底');
  assert.ok(st.pending['sit@2026-11-08'], '必须留下待入账记录，供下次启动补发');
});

test('D: 领取记录写不进去 → 不发奖（宁可不领也不多领）', async () => {
  const store = {};
  const ctx = makeDaily([2026, 11, 8], store);
  let granted = 0;
  ctx.Daily.init({ needOf: () => 100, rank: () => 0, wisdomGain: v => v, grant: () => { granted++; return true; }, log: () => {} });
  await ctx.Daily.bump('sit', 10);
  /* bump 之后把 daily 的写盘打挂 */
  const realSet = ctx.localStorage.setItem;
  ctx.localStorage.setItem = function(k, v){
    if(k === 'jxwd_daily_v1') throw new Error('QuotaExceededError');
    return realSet.call(this, k, v);
  };
  const r = await ctx.Daily.claim('sit');
  assert.strictEqual(r.ok, false);
  assert.match(r.msg, /领取记录写入失败/);
  assert.strictEqual(granted, 0, '标记没落盘就不许发奖，否则刷新后能再领一次');
});

test('D: 任务名与机制一致（只有胜利才 bump）', async () => {
  assert.ok(DAILY.includes("name:'通关镇妖塔'"), '文案必须写"通关"，因为 game.js 只在胜利分支 bump');
  const i = GAME.indexOf("dailyBump('tower')");
  assert.ok(i > 0);
  const before = GAME.slice(Math.max(0, i - 1200), i);
  assert.match(before, /if\(!win\)\{ trunEnd\('lose'\); return; \}/, '失败分支确实先返回了');
});

/* ============================================================ */
/* E. game.js 日期判定                                           */
/* ============================================================ */

test('E: dayNo 兼容补零与未补零两种格式', async () => {
  const ctx = { Math, String };
  vm.createContext(ctx);
  vm.runInContext(extractFn(GAME, 'dayNo') + '\nthis.dayNo = dayNo;', ctx);
  assert.strictEqual(ctx.dayNo('2026-11-8'), 20261108);
  assert.strictEqual(ctx.dayNo('2026-11-08'), 20261108);
  assert.strictEqual(ctx.dayNo('2026-12-01'), 20261201);
  assert.ok(ctx.dayNo('2026-11-8') < ctx.dayNo('2026-11-10'), '不能出现 8 号"大于"10 号');
  assert.strictEqual(ctx.dayNo(''), 0);
  assert.strictEqual(ctx.dayNo('abc'), 0);
});

test('E: 签到与行动次数改成严格递增判定（改系统时间刷不出来）', async () => {
  assert.match(GAME, /const signCanClaim = \(\) => dayNo\(S\.sign\.last\) < todayNo\(\);/,
    '签到必须"日期往后走"才可再签');
  assert.match(GAME, /if\(dayNo\(S\.actDay\) < todayNo\(\)\) resetActs\(\);/,
    '行动次数必须同样严格递增');
  assert.match(GAME, /if\(dayNo\(S\.towerDay\) < todayNo\(\)\)\{ S\.towerDay = tk; S\.towerSwept = 0; \}/,
    '塔的每日扫荡同理');
  assert.doesNotMatch(GAME, /S\.sign\.last !== todayKey\(\)/, '旧的 !== 判定必须消失');
});

/* ============================================================ */
/* F. npc_memory.record 写盘失败                                  */
/* ============================================================ */

/* 与 makeDaily 同款：给 vm 注入可控时钟。
   npc_memory.init() 内会调 ensureDay()，按真实日历间隔做 0.8^elapsed 衰减，
   strength<0.2 的旧记忆会被「自然淡忘」并回写磁盘（这是产品既定行为，D-006 注释已写明）。
   若「今天」随宿主真实日期漂移，F 组里硬编码的历史 day 会在若干天后跨过阈值，
   在断言「磁盘旧档原样保留」之前就被合法写没，形成日期依赖型假失败。
   固定到 2026-11-08 后，历史 day=2026-11-01 的间隔恒为 7 天（0.8^7=0.2097≥0.2，不淡忘），
   与 D-006 交付时 148/148 全绿的测试语义完全一致；断言本身一字未改。 */
function makeNpcMemory(store, opts){
  const RealDate = Date;
  const parts = (opts && opts.today) || [2026, 11, 8];
  class FakeDate extends RealDate {
    constructor(...a){ if(a.length === 0) super(parts[0], parts[1] - 1, parts[2], 12, 0, 0); else super(...a); }
    static now(){ return new RealDate(parts[0], parts[1] - 1, parts[2], 12, 0, 0).getTime(); }
  }
  const ls = {
    getItem(k){ return k in store ? store[k] : null; },
    setItem(k, v){ if(opts && opts.failWrite) throw new Error('QuotaExceededError'); store[k] = String(v); },
    removeItem(k){ delete store[k]; },
  };
  const ctx = { window: {}, localStorage: ls, console, JSON, Math, Object, Array, String, Number, Date: FakeDate, isFinite };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(NPC_MEM, ctx);
  return ctx;
}

test('F: record 正常时返回 persisted:true', async () => {
  const store = {};
  const ctx = makeNpcMemory(store, {});
  ctx.NpcMemory.init();
  const r = ctx.NpcMemory.record('shen_bei', '你在论剑台赢了一场', 'combat');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.persisted, true, '真的写进磁盘了');
  assert.ok(store['jxwd_npc_memory_v1'], '磁盘上必须有记忆');
});

test('F: 写盘失败时 persisted:false（不再假装记住了）', async () => {
  const store = {};
  const ctx = makeNpcMemory(store, {});
  ctx.NpcMemory.init();
  /* init 之后再把写盘打挂，模拟配额突然满 */
  ctx.localStorage.setItem = function(){ throw new Error('QuotaExceededError'); };
  const r = ctx.NpcMemory.record('shen_bei', '你点化了弟子「甲」', 'sect');
  assert.strictEqual(r.ok, true, '内存里确实记住了');
  assert.strictEqual(r.persisted, false, '必须如实报告没落盘');
});

test('F: _reset 写盘失败时保持 fail-closed（不再先抬 ok 再写）', async () => {
  /* 显式固定「今天」，保证历史 day 与今天的间隔恒为 7 天；见 makeNpcMemory 注释。
     改的是测试夹具时钟，不是断言，也不是产品代码。 */
  const store = { jxwd_npc_memory_v1: JSON.stringify({ v: 1, day: '2026-11-01', mem: { shen_bei: [{ text: '旧记忆', day: '2026-11-01', strength: 1, kind: 'story' }] } }) };
  const ctx = makeNpcMemory(store, { today: [2026, 11, 8] });
  ctx.NpcMemory.init();
  ctx.localStorage.setItem = function(){ throw new Error('QuotaExceededError'); };
  const r = ctx.NpcMemory._reset();
  assert.strictEqual(r.ok, false, '写不进去就不能宣称重置成功');
  assert.strictEqual(r.persisted, false);
  const rd = ctx.NpcMemory.record('shen_bei', '你新记的一句', 'story');
  assert.strictEqual(rd.persisted, false, 'blocked 后必须拒绝写盘，避免用空态覆盖旧档');
  assert.ok(store['jxwd_npc_memory_v1'].indexOf('旧记忆') >= 0, '磁盘上的旧记忆必须原样保留');
});

/* ============================================================ */
/* G. npc_visit 写盘失败 / _state                                 */
/* ============================================================ */

function makeVisit(store, opts){
  const ls = {
    getItem(k){ return k in store ? store[k] : null; },
    setItem(k, v){ if(opts && opts.failWrite) throw new Error('QuotaExceededError'); store[k] = String(v); },
    removeItem(k){ delete store[k]; },
  };
  const ctx = { window: {}, localStorage: ls, console, JSON, Math, Object, Array, String, Number, isFinite };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(NPC_VISIT, ctx);
  return ctx;
}

test('G: clear 全量清空写盘失败时返回 persisted:false', async () => {
  const store = { jxwd_npc_visit_v1: JSON.stringify({ q: [{ npc: 'shen_bei', id: 'e1', text: 'x', ts: 1 }] }) };
  const ctx = makeVisit(store, {});
  assert.ok(ctx.NpcVisitQueue.pending().length >= 0);
  ctx.localStorage.setItem = function(){ throw new Error('QuotaExceededError'); };
  const r = ctx.NpcVisitQueue.clear();
  assert.strictEqual(r.persisted, false, '写不进去必须如实报告（否则新一世会读回上一世队列）');
  assert.ok(store['jxwd_npc_visit_v1'].indexOf('e1') >= 0, '磁盘旧队列仍在（这正是要暴露的风险）');
});

test('G: _state 是深拷贝（外部改动不污染真实队列）', async () => {
  const store = { jxwd_npc_visit_v1: JSON.stringify({ q: [{ npc: 'shen_bei', id: 'e1', text: 'x', ts: 1 }] }) };
  const ctx = makeVisit(store, {});
  const s1 = ctx.NpcVisitQueue._state();
  s1.q.push({ npc: 'hack', id: 'zz', text: 'y', ts: 2 });
  const s2 = ctx.NpcVisitQueue._state();
  assert.strictEqual(s2.q.length, s1.q.length - 1, '改副本不该影响内部状态');
});

test('G: 损坏原文先备份再走空队列', async () => {
  const store = { jxwd_npc_visit_v1: '{这不是合法 JSON' };
  const ctx = makeVisit(store, {});
  assert.ok(store['jxwd_npc_visit_v1_corrupt'], '必须留一份原文，否则下一次 push 的 save 会把它覆盖掉');
  assert.strictEqual(store['jxwd_npc_visit_v1_corrupt'], '{这不是合法 JSON');
});

/* ============================================================ */
/* H. restoreSidecar 后重载 NPC 内存                              */
/* ============================================================ */

test('H: restoreSidecar 写完后重载 NpcMemory 与 NpcVisitQueue', async () => {
  const fn = extractFn(GAME, 'restoreSidecar');
  assert.match(fn, /NpcMemory\.load/, '必须重载记忆库，否则下一次 record 会用旧内存覆盖刚导入的');
  assert.match(fn, /NpcVisitQueue\.load/, '来访队列同理');
  assert.match(NPC_VISIT, /load: load,/, 'NpcVisitQueue 必须导出 load');
});

test('H: restoreSidecar 行为验证（有侧车→两个 load 各调一次；无侧车→不调）', async () => {
  const fn = extractFn(GAME, 'restoreSidecar');
  const store = {};
  let memLoad = 0, visitLoad = 0;
  const ctx = {
    localStorage: {
      getItem(k){ return k in store ? store[k] : null; },
      setItem(k, v){ store[k] = String(v); },
    },
    SIDECAR_KEYS: ['jxwd_daily_v1', 'jxwd_npc_memory_v1', 'jxwd_npc_visit_v1', 'hasFinishedTutorial', 'xiuxian_best'],
    window: {},
  };
  ctx.window = ctx;
  ctx.NpcMemory = { load(){ memLoad++; } };
  ctx.NpcVisitQueue = { load(){ visitLoad++; } };
  vm.createContext(ctx);
  vm.runInContext(fn + '\nthis.restoreSidecar = restoreSidecar;', ctx);

  const n0 = ctx.restoreSidecar(null);
  assert.strictEqual(n0, 0);
  assert.strictEqual(memLoad + visitLoad, 0, '没有侧车就不该重载');

  const n = ctx.restoreSidecar({ jxwd_npc_memory_v1: '{"a":1}', jxwd_npc_visit_v1: '{"q":[]}' });
  assert.strictEqual(n, 2);
  assert.strictEqual(memLoad, 1, '有写入必须重载记忆库');
  assert.strictEqual(visitLoad, 1, '有写入必须重载来访队列');
});

/* ============================================================ */
/* I. 崔九旧事行                                                 */
/* ============================================================ */

test('I: 崔九旧事行不再双冒号套叠', async () => {
  const ctx = { window: {}, console, JSON, Math, Object, Array, String, Number, isFinite };
  ctx.window = ctx;
  ctx.NpcMemory = {
    mention(){ return { knowsPlayer: true, top: '「守塔与妖兽」那些旧话' }; },
    record(){ return { ok: true }; },
    list(){ return []; },
  };
  vm.createContext(ctx);
  vm.runInContext(NPC_TOWER, ctx);
  const say = ctx.NpcTower.npcSay({ rel: 10, heard: [] }, { now: 1 });
  assert.ok(say.greeting.endsWith('（他顿了顿，像是又想起了「守塔与妖兽」那些旧话。）'),
    '实际拼出：' + say.greeting);
  assert.ok(say.greeting.indexOf('想起什么：') < 0, '旧的"想起什么："句式必须消失');
});

test('I: 崔九记忆存稳定短语（去重才能命中）', async () => {
  assert.match(NPC_TOWER, /memRecord\('「' \+ topic\.text \+ '」那些旧话', topic\.memKind\)/,
    '带 now 的散列台词会让"同文本去重"永不命中，8 条桶被同一话题占满');
});

test('I: 沈碑相关记忆短语用第二人称（不把 UI 术语漏进 NPC 口中）', async () => {
  assert.ok(GAME.indexOf("'玩家在论剑台赢了一场'") < 0, '不得再写"玩家…"');
  assert.ok(GAME.indexOf("'你在论剑台赢了一场'") > 0, '应改为第二人称');
  assert.ok(!/NpcMemory\.record\([^)]*'玩家/.test(GAME), '所有 record 文本都不得以"玩家"开头');
});

test('I: 已听分母按真实话题数（崔九 3 / 沈碑 5）', async () => {
  assert.match(GAME, /function npcHeardTotal\(\)/, '沈碑分母必须有统一计算');
  assert.match(GAME, /t && !t\.noHear/, '要排除 noHear 的道别话题');
  assert.match(GAME, /NpcTower\.TOPICS\.length/, '崔九分母要用真实话题数');
  assert.match(NPC_TOWER, /TOPICS: TOPICS,/, 'NpcTower 必须导出 TOPICS');
  assert.ok(!/\+\s*'\/6 已听/.test(GAME), '不得再写死 /6');
});

/* ============================================================ */
/* J. trib busy 不丢结算                                         */
/* ============================================================ */

test('J: 演出中重复触发保持幂等契约（不叠播、不调其 onDone）——规格未变', async () => {
  const el = () => ({
    classList: { add(){}, remove(){} },
    setAttribute(){}, getAttribute(){ return ''; },
    addEventListener(){}, removeEventListener(){},
    offsetWidth: 0,
  });
  const timers = [];
  const ctx = {
    document: { getElementById: el, querySelectorAll: () => [] },
    console, JSON, Math, Object, Array, String, Number,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout(){},
  };
  /* trib.js 末尾写 window.TRIB，所以 window 必须是 context 本身 */
  ctx.window = ctx;
  ctx.matchMedia = () => ({ matches: false });     /* 关掉 reduced 才能进 busy 分支 */
  vm.createContext(ctx);
  vm.runInContext(TRIB, ctx);
  assert.ok(ctx.TRIB, 'trib.js 应把 TRIB 挂到 window 上');

  let a = 0, b = 0;
  const r1 = ctx.TRIB.play(true, { onDone: () => { a++; }, rank: '筑基' });
  assert.strictEqual(r1.playing, true, '第一次应真的播');
  const r2 = ctx.TRIB.play(true, { onDone: () => { b++; }, rank: '金丹' });
  assert.strictEqual(r2.playing, false, '演出中不叠播');
  assert.strictEqual(r2.dropped, true, '要如实标记"这次 onDone 被丢掉了"（供事后追查）');

  assert.strictEqual(ctx.TRIB.skip(), true, '跳过 → finish');
  assert.strictEqual(a, 1, '第一次结算必须执行');
  assert.strictEqual(b, 0, '幂等契约：第二次的 onDone 不得被调用（verify.js 守护这条）');
});

test('J: 幂等缺口已在代码里写明"待裁定"，没有偷偷改规格', async () => {
  assert.match(TRIB, /已知缺口（待制作人裁定，不擅自改）/, '必须留痕说明为什么没改');
  assert.match(TRIB, /或禁止演出期间突破（等于给突破加 4\.6 秒冷却，属玩法变更）/, '必须写清两条可选修法的代价');
  assert.doesNotMatch(TRIB, /pendingDone/, '不得保留"补发 onDone"的实现（会破坏既有幂等断言）');
});

test('J: 突破入口刻意不加"天劫冷却"锁（玩法取舍，须制作人裁定）', async () => {
  const fn = extractFn(GAME, 'attemptBreakthrough');
  assert.doesNotMatch(fn.slice(0, 900), /if\(window\.TRIB && TRIB\.busy\)\{/,
    '加锁等于给突破加 4.6 秒冷却，属玩法变更；本次只修"结算卡丢失"');
  assert.match(fn.slice(0, 900), /刻意\*\*不\*\*加/, '必须留下"为什么不做"的说明，避免后人误以为漏了');
});

/* ================================================================== */
/* 第二轮复审阻断项 J-1：崩溃恢复（标记已落盘、奖励未入账）              */
/* ================================================================== */

/* 造一个「主存档」替身：grant 把奖励与凭据一起写进 main，
   和 game.js 里 `S.dailyApplied` + save() 的语义一致。 */
async function makeCrashDaily(store, main){
  const ctx = makeDaily([2026, 11, 8], store, { skipInit: true });
  const hooks = {
    needOf: () => 100, rank: () => 0, wisdomGain: v => v, log: () => {},
    grant(rw){
      if(main.failGrant) return false;
      main.stone += rw.stone || 0;
      main.wisdom += rw.wisdom || 0;
      if(rw.claimId && main.applied.indexOf(rw.claimId) < 0) main.applied.push(rw.claimId);
      return true;
    },
    isApplied(id){ return main.applied.indexOf(id) >= 0; }
  };
  await ctx.Daily.init(hooks);
  return { ctx, hooks };
}

test('J-1: 标记已落盘、奖励未入账 → 重新初始化必须补发（且只补一次）', async () => {
  const store = {};
  const main = { stone: 0, wisdom: 0, applied: [], failGrant: true };

  /* 第一次：claim 把 claimed + pending 写进 jxwd_daily_v1，但主存档写不进去 */
  const a = await makeCrashDaily(store, main);
  await a.ctx.Daily.bump('sit', 10);
  const r1 = a.ctx.Daily.claim('sit');
  /* claim 现在返回 Promise，但这条路径是同步降级，用 then 拿结果 */
  return r1.then(async res => {
    assert.strictEqual(res.ok, false, '主存档写不进去时不能宣称领取成功');
    assert.match(res.msg, /下次进入游戏会自动补上/, '要告诉玩家会自动补发');
    const persisted = JSON.parse(store.jxwd_daily_v1);
    assert.deepStrictEqual(persisted.claimed, ['sit'], 'claimed 已落盘');
    assert.ok(persisted.pending && persisted.pending['sit@2026-11-08'], '必须留下待入账记录（这是崩溃恢复的唯一线索）');
    assert.strictEqual(main.stone, 0, '此时一分钱都还没发');

    /* 第二次：模拟重启（新 context，同一份 store），主存档恢复正常 */
    main.failGrant = false;
    const b = await makeCrashDaily(store, main);
    /* init 里已经跑了 recoverPending */
    assert.strictEqual(main.stone, 80, '补发了一次：needOf(100) × stoneK(0.8) = 80');
    assert.strictEqual(main.wisdom, 50, '悟道值也补上了');
    assert.ok(JSON.parse(store.jxwd_daily_v1).pending['sit@2026-11-08'] === undefined,
      '补发成功后要清掉待入账记录');

    /* 第三次：再启动一次，不能重复发 */
    const c = await makeCrashDaily(store, main);
    assert.strictEqual(main.stone, 80, '第二次启动不得重复补发');
    assert.strictEqual(main.wisdom, 50);
  });
});

test('J-1: 已入账但没来得及清 pending → 重启只清记录、不重复发奖', async () => {
  const store = {};
  const main = { stone: 0, wisdom: 0, applied: [], failGrant: false };
  const a = await makeCrashDaily(store, main);
  await a.ctx.Daily.bump('sit', 10);
  return a.ctx.Daily.claim('sit').then(async res => {
    assert.strictEqual(res.ok, true);
    assert.strictEqual(main.stone, 80, '正常路径发了一次');

    /* 手工把 pending 塞回去，模拟"清 pending 的那次 save 没落地就崩了" */
    const cur = JSON.parse(store.jxwd_daily_v1);
    cur.pending = { 'sit@2026-11-08': { stone: 80, wisdom: 50, at: 1 } };
    store.jxwd_daily_v1 = JSON.stringify(cur);

    const b = await makeCrashDaily(store, main);
    assert.strictEqual(main.stone, 80, '凭据已在 → 不得再发一次（幂等）');
    assert.strictEqual(main.wisdom, 50);
    assert.ok(JSON.parse(store.jxwd_daily_v1).pending['sit@2026-11-08'] === undefined,
      '记录应被清掉，否则每次启动都会白白重跑一遍补发');
  });
});

test('J-1: 待入账记录被改档 → 只按配置额度补发，无法放大', async () => {
  const store = {
    jxwd_daily_v1: JSON.stringify({
      day: '2026-11-08', prog: { sit: 10, train: 0, tower: 0 }, claimed: ['sit'],
      pending: { 'sit@2026-11-08': { stone: 1e9, wisdom: 'x' }, 'bad-key': { stone: 9e9, wisdom: 1 } }
    })
  };
  const main = { stone: 0, wisdom: 0, applied: [], failGrant: false };
  await makeCrashDaily(store, main);
  /* 认不出的键（bad-key）直接丢；认得出的键（sit@日期）按**配置**重算发放，
     所以改档最多骗到一笔正常额度（80），不可能拿到 1e9 那种被写进磁盘的数字。 */
  assert.strictEqual(main.stone, 80, '只按配置额度补发，不读磁盘上的金额');
  assert.ok(main.stone < 1e9, '不能被改档放大');
  const st = JSON.parse(store.jxwd_daily_v1);
  assert.deepStrictEqual(st.pending, {}, '处理完的记录要清掉');
  assert.ok(main.applied.indexOf('bad-key') < 0, '认不出的键不能产生凭据');
});

/* ================================================================== */
/* 第二轮复审阻断项 M：persisted:false 必须被 UI 消费                    */
/* ================================================================== */

test('M: 崔九 npcPick 在写盘失败时回传 memPersisted:false', async () => {
  const ctx = { window: {}, console, JSON, Math, Object, Array, String, Number, isFinite };
  ctx.window = ctx;
  ctx.NpcMemory = {
    record(){ return { ok: true, count: 1, persisted: false }; },   /* 模拟配额满 */
    mention(){ return { knowsPlayer: false, top: '' }; },
    list(){ return []; }
  };
  vm.createContext(ctx);
  vm.runInContext(NPC_TOWER, ctx);

  const state = { met: 1, rel: 5, heard: [], choice: { climb: 0, chat: 0, listen: 0 },
                  cur: { talk: 0 }, lastSeen: 1 };
  const r = ctx.NpcTower.npcPick(state, 'ct1', { now: Date.now() });
  assert.strictEqual(r.ok, true, '写盘失败不该拦对话');
  assert.strictEqual(r.memPersisted, false, '必须把"没落盘"如实回传，UI 才能提示');
});

test('M: 写盘成功时 memPersisted 为 true（不误报）', async () => {
  const ctx = { window: {}, console, JSON, Math, Object, Array, String, Number, isFinite };
  ctx.window = ctx;
  ctx.NpcMemory = {
    record(){ return { ok: true, count: 1, persisted: true }; },
    mention(){ return { knowsPlayer: false, top: '' }; },
    list(){ return []; }
  };
  vm.createContext(ctx);
  vm.runInContext(NPC_TOWER, ctx);
  const state = { met: 1, rel: 5, heard: [], choice: { climb: 0, chat: 0, listen: 0 },
                  cur: { talk: 0 }, lastSeen: 1 };
  const r = ctx.NpcTower.npcPick(state, 'ct1', { now: Date.now() });
  assert.strictEqual(r.memPersisted, true);
});

test('M: 沈碑 npcPick 也回传 memPersisted（源码形参一致，不靠猜）', async () => {
  const NPCJS = fs.readFileSync(path.join(ROOT, 'js/npc.js'), 'utf8');
  assert.match(NPCJS, /return window\.NpcMemory\.record\(MEM_ID, text\) \|\| null;/, '记忆结果要回传，不能丢');
  assert.match(NPCJS, /memPersisted: \(memRes && memRes\.persisted === false\) \? false : true/, '只有明确 false 才算失败');
});

test('M: UI 侧确实消费了 memPersisted（台词原样，另加一行小字）', async () => {
  assert.match(GAME, /const memWarn = \(r\.memPersisted === false\);/, '沈碑侧要消费');
  assert.match(GAME, /cuijiuUi\.replyWarn = \(r\.memPersisted === false\);/, '崔九侧要消费');
  assert.match(GAME, /这段记忆未能留存/, '要有一句玩家看得见的说明');
  assert.match(GAME, /这段记忆只留在本次会话里/, '日志里也要留一条');
});

/* ================================================================== */
/* 第三轮复审：同一 context 内的失败回滚 + 未知 pending 处理             */
/* ================================================================== */

test('J-1: 同一 context 内 grant 失败后必须回滚内存，否则会误判"已入账"丢掉补发', async () => {
  const store = {};
  /* 这个 main 精确模拟 game.js 里注入的 grant：改内存 → save 失败 → 回滚内存 → 返回 false */
  const main = { stone: 0, wisdom: 0, applied: [], failSave: true };
  const ctx = makeDaily([2026, 11, 8], store, { skipInit: true });
  const hooks = {
    needOf: () => 100, rank: () => 0, wisdomGain: v => v, log: () => {},
    grant(rw){
      const old = { s: main.stone, w: main.wisdom, a: main.applied.slice() };
      main.stone += rw.stone || 0;
      main.wisdom += rw.wisdom || 0;
      if(rw.claimId && main.applied.indexOf(rw.claimId) < 0) main.applied.push(rw.claimId);
      if(main.failSave){                      /* 写盘失败 → 整体回滚 */
        main.stone = old.s; main.wisdom = old.w; main.applied = old.a;
        return false;
      }
      return true;
    },
    isApplied(id){ return main.applied.indexOf(id) >= 0; }
  };
  ctx.Daily.init(hooks);
  await ctx.Daily.bump('sit', 10);

  return ctx.Daily.claim('sit').then(r1 => {
    assert.strictEqual(r1.ok, false);
    assert.strictEqual(main.stone, 0, '写盘失败后内存也要回滚（否则 isApplied 会撒谎）');
    assert.deepStrictEqual(main.applied, [], 'dailyApplied 不能在失败后残留');
    assert.ok(ctx.Daily._state().pending['sit@2026-11-08'], 'pending 必须还在');

    /* 同一 context、同一份内存：这时再恢复必须真的发一次 */
    main.failSave = false;
    ctx.Daily._recover();
    assert.strictEqual(main.stone, 80, '同一会话内恢复必须真的入账一次');
    assert.strictEqual(main.wisdom, 50);
    assert.deepStrictEqual(main.applied, ['sit@2026-11-08']);
    assert.ok(ctx.Daily._state().pending['sit@2026-11-08'] === undefined, '入账后清 pending');

    /* 再来一次不得重复 */
    ctx.Daily._recover();
    assert.strictEqual(main.stone, 80, '第三次恢复不得重复发奖');
  });
});

test('J-1: 认不出任务的 pending 记录会被清掉并留日志（不永久滞留）', async () => {
  const store = {
    jxwd_daily_v1: JSON.stringify({
      day: '2026-11-08', prog: { sit: 0, train: 0, tower: 0 }, claimed: [],
      pending: { 'zzz@2026-11-08': { at: 1 }, 'sit@2026-11-08': { at: 1 } }
    })
  };
  const main = { stone: 0, wisdom: 0, applied: [], failSave: false };
  const warns = [];
  const oldWarn = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  try{
    await makeCrashDaily(store, main);
  } finally { console.warn = oldWarn; }
  const st = JSON.parse(store.jxwd_daily_v1);
  assert.ok(st.pending['zzz@2026-11-08'] === undefined, '认不出的键不能一直留着（否则每次启动都重试）');
  assert.ok(st.pending['sit@2026-11-08'] === undefined, '合法的那笔已补发并清掉');
  assert.strictEqual(main.stone, 80, '只发合法那一笔');
  assert.ok(warns.some(w => /认不出任务的待入账记录/.test(w)), '清理要留一条控制台记录，便于追查');
});

test('J-1: game.js 的 grant 在 save 失败时确实回滚了内存（源码级守护）', async () => {
  const i = GAME.indexOf('grant: rw => {');
  assert.ok(i > 0, '必须能定位 grant 注入');
  const seg = GAME.slice(i, i + 1600);
  assert.match(seg, /const oldStone\s+= S\.stone;/, '要先把旧值存下来');
  assert.match(seg, /S\.dailyApplied = oldApplied;/, '回滚范围必须包含 dailyApplied（漏了它就会误判已入账）');
  assert.match(seg, /S\.stone = oldStone;/, '灵石要回滚');
  assert.match(seg, /S\.wisdom = oldWisdom;/, '悟道值要回滚');
});

/* ================================================================== */
/* 第四轮复审：启动恢复与领取必须共用同一把 CLAIM_LOCK                  */
/* ================================================================== */

/* 共享锁：两个 context 用同一个 locks 对象，并记录"同时进入临界区的最大数量"。
   如果两条路径各自加锁（或有一条没加锁），max 就会 > 1。 */
function sharedLocks(){
  const st = { active: 0, max: 0, calls: 0 };
  let tail = Promise.resolve();
  return {
    st,
    locks: {
      request(name, fn){
        st.calls++;
        const run = tail.then(() => {
          st.active++;
          st.max = Math.max(st.max, st.active);
          let r;
          try { r = fn(); }
          catch(e){ st.active--; throw e; }
          return Promise.resolve(r).then(
            v => { st.active--; return v; },
            e => { st.active--; throw e; }
          );
        });
        tail = run.then(() => {}, () => {});
        return run;
      }
    }
  };
}

test('J-1: 启动恢复与领取共用同一把锁，两个临界区不重叠', async () => {
  const store = {
    jxwd_daily_v1: JSON.stringify({
      day: '2026-11-08', prog: { sit: 10, train: 0, tower: 0 }, claimed: ['sit'],
      pending: { 'sit@2026-11-08': { at: 1 } }
    })
  };
  const main = { stone: 0, wisdom: 0, applied: [], failGrant: false };
  const L = sharedLocks();
  const hooksFor = () => ({
    needOf: () => 100, rank: () => 0, wisdomGain: v => v, log: () => {},
    grant(rw){
      main.stone += rw.stone || 0;
      main.wisdom += rw.wisdom || 0;
      if(rw.claimId && main.applied.indexOf(rw.claimId) < 0) main.applied.push(rw.claimId);
      return true;
    },
    isApplied(id){ return main.applied.indexOf(id) >= 0; }
  });

  /* 两个独立 context（模拟两个标签页），共用同一份 store 与同一把锁 */
  const A = makeDaily([2026, 11, 8], store, { skipInit: true });
  const B = makeDaily([2026, 11, 8], store, { skipInit: true });
  A.navigator = { locks: L.locks };
  B.navigator = { locks: L.locks };

  /* A 先走启动恢复；B 先 init（拿 H）再同一时刻走领取。
     两边都去拿同一把锁 —— 若任一条绕过锁，max 就会 > 1。 */
  const pA = A.Daily.init(hooksFor());
  const pB = B.Daily.init(hooksFor()).then(() => B.Daily.claim('sit'));
  const [n, r] = await Promise.all([pA, pB]);

  assert.strictEqual(L.st.max, 1, '两条路径必须串行：同时进入临界区的次数不能 > 1');
  assert.ok(L.st.calls >= 3, '两条路径都应该真的去拿锁（A 的恢复 + B 的恢复 + B 的领取），而不是绕过锁');
  /* 状态一致性：那笔待入账只被结算一次 */
  assert.strictEqual(main.stone, 80, '补发与领取合计只入账一次');
  assert.deepStrictEqual(main.applied, ['sit@2026-11-08'], '凭据只可能有一条');
  assert.deepStrictEqual(JSON.parse(store.jxwd_daily_v1).pending, {}, 'pending 必须清空');
  assert.strictEqual(r.ok, false, 'B 的领取应被"今日已领取"挡住（claimed 里已有 sit）');
});

test('J-1: 无 Web Locks 时 init 不做恢复（不在无锁条件下改 pending）', async () => {
  const store = {
    jxwd_daily_v1: JSON.stringify({
      day: '2026-11-08', prog: { sit: 10, train: 0, tower: 0 }, claimed: ['sit'],
      pending: { 'sit@2026-11-08': { at: 1 } }
    })
  };
  const main = { stone: 0, wisdom: 0, applied: [] };
  const ctx = makeDaily([2026, 11, 8], store, { skipInit: true });
  delete ctx.navigator;
  const n = await ctx.Daily.init({
    needOf: () => 100, rank: () => 0, wisdomGain: v => v, log: () => {},
    grant(rw){ main.stone += rw.stone || 0; return true; },
    isApplied(){ return false; }
  });
  assert.strictEqual(n, 0, '无锁不恢复');
  assert.strictEqual(main.stone, 0, '一分钱都没发');
  assert.ok(JSON.parse(store.jxwd_daily_v1).pending['sit@2026-11-08'], 'pending 原样留在盘上，等有锁的环境再补');
});

test('J-1: 领取进行中时另一 context 执行 init —— 初始化整段在锁内，不覆盖领取结果', async () => {
  const store = {
    jxwd_daily_v1: JSON.stringify({
      day: '2026-11-08', prog: { sit: 10, train: 0, tower: 0 }, claimed: [], pending: {}
    })
  };
  const main = { stone: 0, wisdom: 0, applied: [], failGrant: false };
  const L = sharedLocks();
  const hooksFor = () => ({
    needOf: () => 100, rank: () => 0, wisdomGain: v => v, log: () => {},
    grant(rw){
      main.stone += rw.stone || 0;
      if(rw.claimId && main.applied.indexOf(rw.claimId) < 0) main.applied.push(rw.claimId);
      return true;
    },
    isApplied(id){ return main.applied.indexOf(id) >= 0; }
  });

  const A = makeDaily([2026, 11, 8], store, { skipInit: true });   /* 同时启动的另一个标签页 */
  const B = makeDaily([2026, 11, 8], store, { skipInit: true });   /* 先完成 init，再去领取 */
  A.navigator = { locks: L.locks };
  B.navigator = { locks: L.locks };

  await B.Daily.init(hooksFor());          /* B 先具备 H（这一步也走锁，但此时无人竞争） */
  const pB = B.Daily.claim('sit');         /* 领取先排队 */
  const pA = A.Daily.init(hooksFor());     /* 紧接着 A 启动：load/ensureDay 必须在锁内 */
  await Promise.all([pB, pA]);

  assert.strictEqual(L.st.max, 1, 'init 与 claim 不能同时进入临界区');
  /* 关键证据：A 的 load 若在锁外，会在 B 写入 claimed 之前就读盘 → A 的 st.claimed 会是空数组 */
  assert.deepStrictEqual(A.Daily._state().claimed, ['sit'],
    'init 必须在锁内加载，才能看到领取刚写下的状态（否则说明 load 跑在锁外）');
  assert.deepStrictEqual(JSON.parse(store.jxwd_daily_v1).claimed, ['sit'], '落盘状态必须一致');
  assert.strictEqual(main.stone, 80, '只发一次');
});

test('J-1: 无 Web Locks 时 init 一个字节都不写（不改 day/prog/claimed/pending，不发奖）', async () => {
  const raw = JSON.stringify({
    day: '2026-11-01', prog: { sit: 10, train: 3, tower: 1 }, claimed: ['sit'],
    pending: { 'sit@2026-11-01': { at: 1 } }
  });
  const store = { jxwd_daily_v1: raw };
  const main = { stone: 0, wisdom: 0, applied: [] };
  const ctx = makeDaily([2026, 11, 8], store, { skipInit: true });   /* 今天 11-08，存档是 11-01 */
  delete ctx.navigator;                                              /* 无 Web Locks */
  const n = await ctx.Daily.init({
    needOf: () => 100, rank: () => 0, wisdomGain: v => v, log: () => {},
    grant(rw){ main.stone += rw.stone || 0; return true; },
    isApplied(){ return false; }
  });

  assert.strictEqual(n, 0, '无锁不恢复');
  assert.strictEqual(store.jxwd_daily_v1, raw, '初始化必须一个字节都不写（含跨天，也不许 save）');
  assert.strictEqual(main.stone, 0, '不发奖');
  assert.ok(JSON.parse(store.jxwd_daily_v1).pending['sit@2026-11-01'], 'pending 原样留着');

  /* 渲染路径同样不许写盘 */
  const l = ctx.Daily.list();
  ctx.Daily.allClaimed();
  assert.strictEqual(store.jxwd_daily_v1, raw, 'list/allClaimed 也不能触发写盘');
  /* 但展示值要按"跨天已重置"呈现，否则玩家会看到昨天的进度 */
  assert.ok(l.every(t => t.prog === 0 && !t.claimed && !t.done), '跨天时展示为已重置（只读快照）');
});

test('J-1: 支持 Web Locks 时渲染路径也不写盘（hasLock ≠ 已在临界区）', async () => {
  const raw = JSON.stringify({
    day: '2026-11-01', prog: { sit: 10, train: 3, tower: 1 }, claimed: ['sit'],
    pending: { 'sit@2026-11-01': { at: 1 } }
  });
  const store = { jxwd_daily_v1: raw };
  const ctx = makeDaily([2026, 11, 8], store, { skipInit: true });   /* 不 init：模拟"没取过锁就渲染" */
  /* navigator.locks 存在（makeDaily 默认注入），即 hasLock() 为真 */
  const l = ctx.Daily.list();
  ctx.Daily.allClaimed();
  assert.strictEqual(store.jxwd_daily_v1, raw,
    '渲染不能因为"浏览器支持 Web Locks"就写盘 —— hasLock() 不等于当前已持锁');
  assert.ok(l.every(t => t.prog === 0 && !t.claimed), '跨天时按今日口径展示');
});

test('J-1: bump 与 claim 走同一把锁，跨标签页不互相覆盖', async () => {
  const store = {};
  const main = { stone: 0, wisdom: 0, applied: [], failGrant: false };
  const L = sharedLocks();
  const hooksFor = () => ({
    needOf: () => 100, rank: () => 0, wisdomGain: v => v, log: () => {},
    grant(rw){
      main.stone += rw.stone || 0;
      if(rw.claimId && main.applied.indexOf(rw.claimId) < 0) main.applied.push(rw.claimId);
      return true;
    },
    isApplied(id){ return main.applied.indexOf(id) >= 0; }
  });

  const A = makeDaily([2026, 11, 8], store, { skipInit: true });
  const B = makeDaily([2026, 11, 8], store, { skipInit: true });
  A.navigator = { locks: L.locks };
  B.navigator = { locks: L.locks };

  await A.Daily.init(hooksFor());
  await B.Daily.init(hooksFor());

  /* A 页累积进度（会写盘），B 页同时领取 —— 两条写路径必须串行 */
  const pBump = A.Daily.bump('sit', 10);
  const pClaim = B.Daily.claim('sit');
  const [, r] = await Promise.all([pBump, pClaim]);

  assert.strictEqual(L.st.max, 1, 'bump 与 claim 不能同时进入临界区');
  assert.strictEqual(r.ok, true, '进度已满 → 领取成功');
  /* 关键：bump 写下的进度不能被 claim 的旧状态覆盖 */
  assert.strictEqual(JSON.parse(store.jxwd_daily_v1).prog.sit, 10, 'bump 的进度必须留在盘上');
  assert.deepStrictEqual(JSON.parse(store.jxwd_daily_v1).claimed, ['sit'], '领取标记也要在');
  assert.strictEqual(main.stone, 80);
});

test('J-1: 无 Web Locks 时 bump 明确拒绝写入（两个 context 同时累积也不静默丢/虚报）', async () => {
  const raw = JSON.stringify({ day: '2026-11-08', prog: { sit: 0, train: 0, tower: 0 }, claimed: [] });
  const store = { jxwd_daily_v1: raw };

  const A = makeDaily([2026, 11, 8], store, { skipInit: true });
  const B = makeDaily([2026, 11, 8], store, { skipInit: true });
  delete A.navigator;
  delete B.navigator;                       /* 两个都不支持 Web Locks */

  const hooks = { needOf: () => 100, rank: () => 0, wisdomGain: v => v, log: () => {} };
  await A.Daily.init(hooks);
  await B.Daily.init(hooks);

  /* 两个标签页同时累积同一任务 */
  const [ra, rb] = await Promise.all([A.Daily.bump('sit', 1), B.Daily.bump('sit', 1)]);

  assert.strictEqual(ra.ok, false, '无锁环境不能假装记下了');
  assert.strictEqual(rb.ok, false);
  assert.strictEqual(ra.code, 'NO_LOCK');
  assert.strictEqual(rb.code, 'NO_LOCK');
  assert.match(ra.msg, /未保存/, '要明确说"本次未保存"');
  assert.strictEqual(store.jxwd_daily_v1, raw, '一个字节都不许写（否则就会互相覆盖）');

  /* UI 也要能知道：list 按今日口径展示，进度确实是 0，不会虚报"1" */
  assert.strictEqual(A.Daily.list().find(t => t.id === 'sit').prog, 0, '不得虚报进度');
});

test('J-1: game.js 把 bump 的 NO_LOCK 结果转成一次玩家可见提示', () => {
  assert.match(GAME, /function dailyBump\(kind\)\{/, '要有统一上报口');
  assert.match(GAME, /r\.code === 'NO_LOCK' && !dailyNoLockWarned/, '无锁提示只提示一次，不刷屏');
  assert.match(GAME, /日常任务进度本次不记/, '提示要说清后果');
  /* 两处调用点都必须走 dailyBump，不能还留着裸 Daily.bump */
  assert.doesNotMatch(GAME, /Daily\.bump\('tower'\)/, '爬塔那处必须走 dailyBump');
  /* 裸调用只允许出现在 dailyBump 内部那一处 */
  assert.strictEqual((GAME.match(/Daily\.bump\(/g) || []).length, 1, '除 helper 外不许有裸调用（否则失败结果被丢掉）');
});

/* 第九轮审查新阻断：有锁环境 save() 返回 false 时不能虚报成功。真跑 daily.js 的 bump。 */
test('J-1: 有锁 bump 写盘失败 → 不返回成功、回滚内存进度、磁盘不变', async () => {
  const raw = JSON.stringify({ day: '2026-11-08', prog: { sit: 3, train: 0, tower: 0 }, claimed: [] });
  const store = { jxwd_daily_v1: raw };
  const ctx = makeDaily([2026, 11, 8], store);   /* 有 Web Locks */
  await ctx.ready;                                /* init 完成（同日不写盘） */
  const before = ctx.Daily._state().prog.sit;     /* 修改前的进度 */
  /* 注入写盘失败：save() 里 setItem 抛错 → 返回 false */
  ctx.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  const r = await ctx.Daily.bump('sit', 1);
  assert.strictEqual(r.ok, false, '写盘失败不能返回成功（否则就是虚报）');
  assert.strictEqual(r.code, 'SAVE_FAILED', '要带可区分的失败码，供 UI 提示');
  assert.match(r.msg, /未记下/, '文案要如实说本次没记下');
  assert.strictEqual(ctx.Daily._state().prog.sit, before, '内存进度必须回滚到修改前，不能停在 4');
  assert.strictEqual(ctx.Daily.list().find(t => t.id === 'sit').prog, before, 'UI 展示也不能虚报');
  assert.strictEqual(store.jxwd_daily_v1, raw, '磁盘一个字节都不该变');
});

/* 真跑 game.js 的 dailyBump：普通写盘失败要给玩家提示、UNKNOWN_TASK 不误报、只提示一次。 */
test('J-1: 真跑 dailyBump —— SAVE_FAILED 提示、UNKNOWN_TASK 静默、只提示一次', async () => {
  const fn = extractFn(GAME, 'dailyBump');
  const logs = [];
  function makeCtx(bumpResult){
    const c = {
      Daily: { bump: () => Promise.resolve(bumpResult) },
      log: (m) => logs.push(m),
      Promise,
      dailyNoLockWarned: false,
      dailySaveFailWarned: false,
    };
    vm.createContext(c);
    vm.runInContext(fn + '\nglobalThis.__bump = dailyBump;', c);
    return c;
  }
  /* SAVE_FAILED：连调两次，只应提示一次 */
  const c1 = makeCtx({ ok:false, code:'SAVE_FAILED', msg:'任务进度保存失败（本机存储异常），本次进度未记下。' });
  c1.__bump('sit'); c1.__bump('sit');
  await new Promise(r => setTimeout(r, 0));
  assert.ok(logs.some(m => /未记下/.test(m)), '写盘失败要给玩家可见提示');
  assert.strictEqual(logs.length, 1, '只提示一次，不刷屏');
  /* UNKNOWN_TASK：herb/enlight/ponder 等本就不计入日常的正常动作，绝不能误报 */
  logs.length = 0;
  const c2 = makeCtx({ ok:false, code:'UNKNOWN_TASK', msg:'任务不存在' });
  c2.__bump('herb');
  await new Promise(r => setTimeout(r, 0));
  assert.strictEqual(logs.length, 0, '任务不存在的正常动作不得误报"保存失败"');
  /* NO_LOCK 仍走独立提示，不被新的普通失败分支抢占 */
  logs.length = 0;
  const c3 = makeCtx({ ok:false, code:'NO_LOCK', msg:'当前浏览器不支持安全的多窗口记录，本次任务进度未保存。' });
  c3.__bump('sit');
  await new Promise(r => setTimeout(r, 0));
  assert.ok(logs.some(m => /日常任务进度本次不记/.test(m)), 'NO_LOCK 仍走原独立提示');
});
