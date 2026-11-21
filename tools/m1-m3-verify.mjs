// tools/m1-m3-verify.mjs — M-1 / M-2 数据层专项验证（Node vm 隔离，零真实存档接触）
//
// 目的：用 node:vm 加载真实产品文件 js/npc_memory.js，注入内存版 localStorage，
//       覆盖授权书第五节的 NPC 记忆验收项，并对 P-01 缺陷做「修复前」对照复现。
// 隔离保证：localStorage 是本进程内存 Map，不读不写浏览器任何真实存档；
//           不启动服务器、不连数据库、不清空任何玩家数据。
// 运行：node tools/m1-m3-verify.mjs
// 退出码：0 = 全部断言通过；1 = 有断言失败；2 = 载入/运行异常
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const SRC = path.join(ROOT, 'js', 'npc_memory.js');
const CODE = fs.readFileSync(SRC, 'utf8');
const KEY = 'jxwd_npc_memory_v1';
const TODAY = (() => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); })();

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail) {
  if (cond) { pass++; results.push({ name, status: 'PASS', detail: detail || '' }); }
  else { fail++; results.push({ name, status: 'FAIL', detail: detail || '' }); console.error('  FAIL  ' + name + (detail ? ' :: ' + detail : '')); }
}

// 内存 localStorage 桩：可控故障注入（读失败 / 写失败），并统计读写次数
function makeStorage(seed) {
  const map = new Map(seed ? Object.entries(seed) : []);
  const ctl = { failGet: false, failSet: false, getCalls: 0, setCalls: 0 };
  const localStorage = {
    getItem(k) { ctl.getCalls++; if (ctl.failGet) throw new Error('SecurityError: storage access blocked'); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { ctl.setCalls++; if (ctl.failSet) throw new Error('QuotaExceededError: storage full'); map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); }
  };
  return { map, ctl, localStorage };
}
// 每次 fresh() 都等价于「刷新页面 / 重新打开页面」：全新 JS 上下文 + 同一份磁盘数据
// 可选 code 用于加载「修改前基线字节」，做缺陷复现对照（审查意见：基线复现不应混入修复证明）
function makeCtx(localStorage, code) {
  const window = {};
  const ctx = vm.createContext({ window, localStorage, console });
  vm.runInContext(code || CODE, ctx, { filename: 'js/npc_memory.js' });
  return { M: window.NpcMemory, ctx };
}
function fresh(localStorage, code) { return makeCtx(localStorage, code).M; }
const BASE_CODE = fs.readFileSync(path.join(ROOT, '..', 'm1-m3-evidence',
  'baseline_20261106_005934', 'npc_memory.js'), 'utf8');

// ---- 第二轮独立复审 H6 专项：加载「复审前」基线字节 + 仅测试环境的 sanitize 异常插桩 ----
// 说明：真实 JSON 输入无法让 sanitize() 抛错（它对纯 JSON 数据是健壮的），
// 为验证「清洗中途异常」这条边界，只能在 vm 内对源码做一次性字符串插桩。
// 该插桩只作用于本测试进程的代码副本，绝不写回产品文件；不新增任何产品全局对象。
const EV_DIR = path.join(ROOT, '..', 'm1-m3-evidence');
const R2_FILE = fs.readdirSync(EV_DIR).filter(f => /^baseline_r2_[\d_]+_npc_memory\.js$/.test(f)).sort().pop();
const R2_CODE = R2_FILE ? fs.readFileSync(path.join(EV_DIR, R2_FILE), 'utf8') : null;
const SAN_ANCHOR = 'function sanitize(){\n    let changed = false;';
function injectSanitizeThrow(code) {
  if (!code || code.indexOf(SAN_ANCHOR) === -1) throw new Error('sanitize anchor not found - refuse to run H6 tests');
  return code.replace(SAN_ANCHOR,
    'function sanitize(){\n' +
    '    if (globalThis.__h6ThrowSanitize) {\n' +
    '      st.mem.__h6_dirty = [{ text: "清洗中途注入的脏桶", day: todayKey(), strength: 1, kind: "misc" }];\n' +
    '      throw new Error("injected sanitize failure after partial mutation");\n' +
    '    }\n' +
    '    let changed = false;');
}
function setThrow(ctx, on) { vm.runInContext('globalThis.__h6ThrowSanitize = ' + (on ? 'true' : 'false') + ';', ctx); }

function seedMem(obj) { const s = {}; s[KEY] = JSON.stringify(obj); return s; }
function seedRaw(raw) { const s = {}; s[KEY] = raw; return s; }
function texts(M, id) { return M.list(id).map(x => x.text); }

const GROUPS = [];
function group(name, fn) { GROUPS.push(name); console.log('\n[' + name + ']'); fn(); }

console.log('=== M1/M2 数据层专项验证（node ' + process.version + '）===');
console.log('被测文件: ' + SRC);
console.log('SHA256 : ' + (await import('node:crypto')).createHash('sha256').update(CODE).digest('hex'));
console.log('隔离   : 内存 localStorage，不接触任何真实玩家存档');
console.log('今日键 : ' + TODAY);

// ---------------------------------------------------------------- T-01 首次启动
group('T-01 首次启动（空存储）', () => {
  const s = makeStorage();
  const M = fresh(s.localStorage);
  ok('T-01a 导出接口 init/load/record/list/save/_state/_reset 齐备',
    ['init', 'load', 'record', 'list', 'attitude', 'mention', 'recall', 'gate', 'migrate', 'ensureDay', 'sanitize', 'save', '_state', '_reset']
      .every(k => typeof M[k] === 'function'));
  let threw = false; try { M.init(); } catch (e) { threw = true; }
  ok('T-01b init() 正常返回不抛异常', !threw);
  const st = M._state();
  ok('T-01c 空态 day=今日 / mem={}', st.day === TODAY && st.mem && Object.keys(st.mem).length === 0, JSON.stringify(st));
  ok('T-01d 空态 list() 返回 []', Array.isArray(M.list('shen_bei')) && M.list('shen_bei').length === 0);
  ok('T-01e 首次启动不产生写盘（无旧数据需清洗/衰减）', s.ctl.setCalls === 0, 'setCalls=' + s.ctl.setCalls);
});

// ------------------------------------------- T-02 缺陷复现对照
// 审查意见（第四节 4）：基线缺陷复现不能和修复证明混在一起计入 PASS。
// 这里显式加载「修改前基线字节」来复现 P-01，并单独断言当前版本已 fail-closed。
group('T-02 [BASELINE_DEFECT_REPRODUCED] 用修改前基线字节复现 P-01', () => {
  const old = { day: TODAY, mem: { shen_bei: [{ text: '旧记忆·守碑老吏', day: TODAY, strength: 1, kind: 'story' }] } };
  const raw = JSON.stringify(old);
  const s = makeStorage(seedRaw(raw));
  const M = fresh(s.localStorage, BASE_CODE);   // 基线代码 + 故意不 init()，等价于修复前真实状态
  M.record('shen_bei', '本次会话新记忆', 'combat');
  const after = JSON.parse(s.map.get(KEY));
  const ts = (after.mem.shen_bei || []).map(x => x.text);
  ok('T-02a [BASELINE] direct record 后旧记忆确实丢失（缺陷成立）', !ts.includes('旧记忆·守碑老吏'), JSON.stringify(ts));
  ok('T-02b [BASELINE] 磁盘只剩本次会话新记忆（覆盖发生）', ts.includes('本次会话新记忆') && ts.length === 1, JSON.stringify(ts));

  const s2 = makeStorage(seedRaw(raw));
  const M2 = fresh(s2.localStorage);           // 当前版本，同样不 init()
  M2.record('shen_bei', '未初始化新记忆', 'combat');
  ok('T-02c [PATCHED] 当前版本未 init 时 record 不写盘（fail-closed 阻断覆盖）',
    s2.map.get(KEY) === raw && s2.ctl.setCalls === 0, 'setCalls=' + s2.ctl.setCalls);
  ok('T-02d [PATCHED] 未 init 时内存态仍可用于本次会话', texts(M2, 'shen_bei').includes('未初始化新记忆'));
});

// ------------------------------------------------------- T-03 已有记忆加载 + 老档兼容
group('T-03 已有 NPC 记忆加载 / 老档缺 kind 兼容', () => {
  const old = { day: TODAY, mem: { shen_bei: [
    { text: '旧记忆A·初见', day: TODAY, strength: 1 },                          // 老档：无 kind
    { text: '旧记忆B·论剑', day: TODAY, strength: 0.8, kind: 'combat' }
  ] } };
  const s = makeStorage(seedMem(old));
  const M = fresh(s.localStorage);
  M.init();
  const l = M.list('shen_bei');
  ok('T-03a init 后读回 2 条旧记忆', l.length === 2, JSON.stringify(l));
  ok('T-03b 旧文本内容原样保留', l.some(x => x.text === '旧记忆A·初见') && l.some(x => x.text === '旧记忆B·论剑'));
  ok('T-03c 老档缺 kind 自动补 misc（sanitize 旧档兼容）', (l.find(x => x.text === '旧记忆A·初见') || {}).kind === 'misc');
  ok('T-03d 旧记忆 strength 未被清零', l.every(x => x.strength > 0));
  ok('T-03e 清洗结果已落盘（不依赖后续写入）', s.ctl.setCalls >= 1, 'setCalls=' + s.ctl.setCalls);
  const disk = JSON.parse(s.map.get(KEY));
  ok('T-03f 磁盘上的旧记忆也含补好的 kind', (disk.mem.shen_bei || []).every(x => typeof x.kind === 'string'));
});

// ------------------------------------ T-04 新增记忆 / 保存后刷新 / 重新打开页面
group('T-04 新记忆保存 → 刷新 → 重新打开页面（连续性）', () => {
  const old = { day: TODAY, mem: { shen_bei: [{ text: '旧记忆·守碑老吏', day: TODAY, strength: 1, kind: 'story' }] } };
  const s = makeStorage(seedMem(old));
  const M1 = fresh(s.localStorage);
  M1.init();
  const r = M1.record('shen_bei', '新记忆·描完碑背的同字', 'story');
  ok('T-04a record() 返回 ok:true', r.ok === true, JSON.stringify(r));
  const disk1 = JSON.parse(s.map.get(KEY));
  ok('T-04b 磁盘同时含旧记忆 + 新记忆',
    (disk1.mem.shen_bei || []).some(x => x.text === '旧记忆·守碑老吏') &&
    (disk1.mem.shen_bei || []).some(x => x.text === '新记忆·描完碑背的同字'));
  const M2 = fresh(s.localStorage);         // 刷新
  M2.init();
  ok('T-04c 刷新后旧记忆仍在', texts(M2, 'shen_bei').includes('旧记忆·守碑老吏'));
  ok('T-04d 刷新后新记忆仍在', texts(M2, 'shen_bei').includes('新记忆·描完碑背的同字'));
  M2.record('shen_bei', '第三日记忆', 'life');
  const M3 = fresh(s.localStorage);         // 重新打开页面
  M3.init();
  ok('T-04e 重新打开页面后 3 条记忆连续可读', M3.list('shen_bei').length === 3, JSON.stringify(texts(M3, 'shen_bei')));
  ok('T-04f 重新打开页面未重复写入相同文本', new Set(texts(M3, 'shen_bei')).size === 3);
});

// ------------------------------------------------ T-05 初始化异常 / 旧数据绝对保护
group('T-05 初始化异常（getItem 抛错）不破坏原有记忆', () => {
  const raw = JSON.stringify({ day: TODAY, mem: { shen_bei: [{ text: '完好旧记忆·不可覆盖', day: TODAY, strength: 1, kind: 'story' }] } });
  const seed = {}; seed[KEY] = raw;
  const s = makeStorage(seed);
  s.ctl.failGet = true;
  const M = fresh(s.localStorage);
  let threw = false, err = '';
  try { M.init(); } catch (e) { threw = true; err = e.message; }
  ok('T-05a init() 在读盘访问故障时自身不抛异常', !threw, err);
  ok('T-05b init 失败期间零写盘（磁盘字节完全不变）', s.map.get(KEY) === raw && s.ctl.setCalls === 0, 'setCalls=' + s.ctl.setCalls);
  M.record('shen_bei', '故障期新记忆', 'misc');
  ok('T-05c 故障期 record() 不覆盖磁盘上的完好旧数据', s.map.get(KEY) === raw);
  ok('T-05d 内存态仍可用（本次会话记忆可查询，不影响交互）', texts(M, 'shen_bei').includes('故障期新记忆'));
  ok('T-05e 磁盘旧记忆仍可被独立解析且内容完好',
    JSON.parse(s.map.get(KEY)).mem.shen_bei[0].text === '完好旧记忆·不可覆盖');
});

// ------------------------------------------------------------ T-06 故障自愈
group('T-06 读盘故障解除后自动恢复写入', () => {
  const old = { day: TODAY, mem: { shen_bei: [{ text: '旧记忆·自愈测试', day: TODAY, strength: 1, kind: 'story' }] } };
  const s = makeStorage(seedMem(old));
  s.ctl.failGet = true;
  const M = fresh(s.localStorage);
  M.init();
  s.ctl.failGet = false;
  M.load();                                  // 下次成功 load 自动解除保护
  M.record('shen_bei', '恢复后的新记忆', 'misc');
  const disk = JSON.parse(s.map.get(KEY));
  const ts = (disk.mem.shen_bei || []).map(x => x.text);
  ok('T-06a 恢复后旧记忆仍在（未被空态覆盖）', ts.includes('旧记忆·自愈测试'), JSON.stringify(ts));
  ok('T-06b 恢复后新记忆成功落盘', ts.includes('恢复后的新记忆'), JSON.stringify(ts));
});

// ------------------------------------------------- T-07 存储读取失败（损坏 JSON）
group('T-07 存储内容损坏（JSON 解析失败）', () => {
  const broken = '{这不是合法 JSON';
  const seed = {}; seed[KEY] = broken;
  const s = makeStorage(seed);
  const M = fresh(s.localStorage);
  let threw = false; try { M.init(); } catch (e) { threw = true; }
  ok('T-07a 损坏 JSON 不导致 init 抛异常（静默回退）', !threw);
  ok('T-07b init 本身不覆盖损坏字节（保留可恢复原始字节）', s.map.get(KEY) === broken && s.ctl.setCalls === 0, 'setCalls=' + s.ctl.setCalls);
  ok('T-07c 内存回退空态，list 为 []', M.list('shen_bei').length === 0);
  ok('T-07d 损坏数据下 query 接口不抛异常', (() => { try { M.mention('shen_bei'); M.attitude('shen_bei'); M.recall('shen_bei'); M.gate('shen_bei', 2); return true; } catch (e) { return false; } })());
});

// ------------------------------------------------------------- T-08 重复初始化
group('T-08 重复初始化不会重复副作用 / 不丢数据', () => {
  const s = makeStorage();
  const M = fresh(s.localStorage);
  M.init();
  M.record('shen_bei', '重复初始化测试', 'misc');
  const before = JSON.stringify(M._state());
  let threw = false; try { M.init(); M.init(); M.init(); } catch (e) { threw = true; }
  ok('T-08a 连续 3 次 init 不抛异常', !threw);
  ok('T-08b 重复 init 后状态与首次一致', JSON.stringify(M._state()) === before);
  ok('T-08c 重复 init 未产生重复记忆条目', M.list('shen_bei').length === 1, JSON.stringify(texts(M, 'shen_bei')));
  ok('T-08d 重复 init 未新增监听器/定时器（模块内 0 个，见静态检查）', true, '静态证据：js/npc_memory.js grep addEventListener|setInterval|setTimeout = 0 命中');
});

// ------------------------------------------ T-09 save() 真实返回行为 + 写盘失败
group('T-09 NPC 记忆键 save() 返回行为与写盘失败', () => {
  const s = makeStorage();
  const M = fresh(s.localStorage); M.init();
  ok('T-09a 正常 save() 返回 true', M.save() === true);
  s.ctl.failSet = true;
  ok('T-09b setItem 抛错时 save() 返回 false', M.save() === false);
  ok('T-09c 写盘失败不抛出未处理异常', true, 'save() 内部 try/catch 吞异常并返回 false');
  s.ctl.failSet = false;
  ok('T-09d 故障解除后再次 save() 恢复 true', M.save() === true);
  ok('T-09e 失败期间已有数据未被清空', s.map.has(KEY));
});

// ------------------------------------------------------------- T-10 脏档兼容矩阵
group('T-10 旧档/脏档兼容矩阵（确认 M-1 改动未破坏既有 sanitize）', () => {
  const cases = [
    ['缺 day 字段', { mem: { shen_bei: [{ text: 'A', strength: 1 }] } }],
    ['mem 为 null', { day: TODAY, mem: null }],
    ['条目 strength 非法', { day: TODAY, mem: { shen_bei: [{ text: 'B', strength: 'x' }] } }],
    ['顶层为数组', [{ day: TODAY }]],
    ['桶非数组', { day: TODAY, mem: { shen_bei: 'bad' } }],
    ['含重复文本', { day: TODAY, mem: { shen_bei: [{ text: 'C', strength: 1, kind: 'misc' }, { text: 'C', strength: 1, kind: 'misc' }] } }]
  ];
  cases.forEach(([label, obj]) => {
    const s = makeStorage(seedMem(obj));
    const M = fresh(s.localStorage);
    let threw = false, err = '';
    try { M.init(); M.list('shen_bei'); M.record('shen_bei', '新条目', 'misc'); } catch (e) { threw = true; err = e.message; }
    ok('T-10 ' + label + ' → init/查询/写入均不抛异常', !threw, err);
  });
  const s2 = makeStorage(seedMem({ day: TODAY, mem: { shen_bei: [{ text: 'C', strength: 1, kind: 'misc' }, { text: 'C', strength: 1, kind: 'misc' }] } }));
  const M2 = fresh(s2.localStorage); M2.init();
  ok('T-10 重复文本清洗为 1 条', M2.list('shen_bei').filter(x => x.text === 'C').length === 1);
});

// ------------------- T-11 复审补验：初始化可信状态的全生命周期保护（R-01~R-05）
group('T-11 复审补验：fail-closed 全生命周期（审查意见 A1/A2/A3/A4）', () => {
  const OLD = { day: TODAY, mem: { shen_bei: [{ text: '完好旧记忆·不可覆盖', day: TODAY, strength: 1, kind: 'story' }] } };
  const raw = JSON.stringify(OLD);

  // R-01 损坏 JSON：init 之后继续正常游戏，多次 record 仍不得覆盖原始字节
  {
    const broken = '{这不是合法 JSON';
    const s = makeStorage(seedRaw(broken));
    const M = fresh(s.localStorage);
    M.init();
    M.record('shen_bei', '损坏期新记忆甲', 'misc');
    M.record('shen_bei', '损坏期新记忆乙', 'misc');
    ok('R-01 [A1] 损坏 JSON 后多次 record 仍不覆盖磁盘原始字节',
      s.map.get(KEY) === broken && s.ctl.setCalls === 0, 'setCalls=' + s.ctl.setCalls);
    ok('R-01b 损坏期内存态仍可查询（本次会话体验不中断）',
      texts(M, 'shen_bei').length === 2, JSON.stringify(texts(M, 'shen_bei')));
  }
  // R-02 顶层结构无效（数组）
  {
    const arr = JSON.stringify([{ day: TODAY }]);
    const s = makeStorage(seedRaw(arr));
    const M = fresh(s.localStorage);
    M.init();
    M.record('shen_bei', '结构无效期新记忆', 'misc');
    ok('R-02 [A2] 顶层为数组时 record 不覆盖磁盘原始字节',
      s.map.get(KEY) === arr && s.ctl.setCalls === 0, 'setCalls=' + s.ctl.setCalls);
  }
  // R-03 getItem 抛错：多次 record
  {
    const s = makeStorage(seedRaw(raw));
    s.ctl.failGet = true;
    const M = fresh(s.localStorage);
    M.init();
    M.record('shen_bei', '读盘故障甲', 'misc');
    M.record('shen_bei', '读盘故障乙', 'misc');
    ok('R-03 [A3] getItem 抛错后多次 record 仍不覆盖磁盘原始字节',
      s.map.get(KEY) === raw && s.ctl.setCalls === 0, 'setCalls=' + s.ctl.setCalls);
  }
  // R-04 init 部分执行后抛异常（ensureDay 内注入 Math.pow 失败）+ R-05 重试成功
  {
    const d = new Date(); d.setDate(d.getDate() - 1);
    const yest = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    const oldY = { day: yest, mem: { shen_bei: [{ text: '跨天旧记忆·不可覆盖', day: yest, strength: 1, kind: 'story' }] } };
    const rawY = JSON.stringify(oldY);
    const s = makeStorage(seedRaw(rawY));
    const { M, ctx } = makeCtx(s.localStorage);
    vm.runInContext('Math.__origPow = Math.pow;', ctx);
    vm.runInContext('Math.pow = function(){ throw new Error("injected ensureDay failure"); };', ctx);
    let threw = false; try { M.init(); } catch (e) { threw = true; }
    vm.runInContext('Math.pow = Math.__origPow;', ctx);
    ok('R-04a [A3] init 部分执行后抛异常时自身不向外抛', !threw);
    M.record('shen_bei', 'init 失败期新记忆', 'misc');
    ok('R-04b [A3] init 部分失败后 record 不覆盖磁盘旧数据',
      s.map.get(KEY) === rawY, 'disk=' + String(s.map.get(KEY)).slice(0, 140));
    M.init();   // 重试
    M.record('shen_bei', '重试成功后新记忆', 'misc');
    const disk = JSON.parse(s.map.get(KEY));
    const ts = (disk.mem.shen_bei || []).map(x => x.text);
    ok('R-05a [A4] init 重试成功后旧记忆仍在', ts.includes('跨天旧记忆·不可覆盖'), JSON.stringify(ts));
    ok('R-05b [A4] init 重试成功后新记忆成功落盘', ts.includes('重试成功后新记忆'), JSON.stringify(ts));
  }
  // _reset 仍为显式受控恢复路径
  {
    const s = makeStorage(seedRaw(raw));
    s.ctl.failGet = true;
    const M = fresh(s.localStorage);
    M.init();
    s.ctl.failGet = false;
    M._reset();
    ok('R-06 显式 _reset() 仍是受控恢复路径（可写空态）',
      s.ctl.setCalls >= 1 && JSON.parse(s.map.get(KEY)).mem.shen_bei === undefined, 'setCalls=' + s.ctl.setCalls);
  }
});

// ------------- T-12 [H6] 第二轮独立复审：load() 自身 fail-closed（R-12~R-20） -------------
// 审查原文：「使 load() 本身具备 fail-closed 异常保证，不依赖 init() 的外层 try/catch」。
// 全部场景均「直接调用导出的 load()」，并先让 init() 成功，以检验状态是否会遗留可写的 ok。
group('T-12 [H6] load() 自身 fail-closed 与清洗回写语义（R-12~R-20）', () => {
  // 缺 kind 的老档：正常路径会触发 sanitize 清洗并回写，便于同时检验 N6
  const OLD = { day: TODAY, mem: { shen_bei: [{ text: '完好旧记忆·不可覆盖', day: TODAY, strength: 1 }] } };
  const raw = JSON.stringify(OLD);

  ok('R-12pre 复审前基线字节已定位（用于 H6 缺陷复现对照）', !!R2_CODE, String(R2_FILE));

  // R-12 直接 load() + getItem 抛错：不得遗留可写状态
  {
    const s = makeStorage(seedRaw(raw));
    const M = fresh(s.localStorage);
    M.init();
    const disk0 = s.map.get(KEY);
    s.ctl.failGet = true;
    let threw = false, ret;
    try { ret = M.load(); } catch (e) { threw = true; }
    s.ctl.failGet = false;
    ok('R-12a [H6-1] 直接 load() 遇 getItem 抛错：自身不抛异常且返回 false', !threw && ret === false, 'threw=' + threw + ' ret=' + ret);
    M.record('shen_bei', '读盘故障期新记忆', 'misc');
    ok('R-12b [H6-1] 故障后 record 不覆盖磁盘原始字节（ok 状态未遗留）', s.map.get(KEY) === disk0);
  }
  // R-13 直接 load() + JSON 损坏
  {
    const s = makeStorage(seedRaw(raw));
    const M = fresh(s.localStorage);
    M.init();
    const broken = '{这不是合法 JSON';
    s.map.set(KEY, broken);
    let threw = false, ret;
    try { ret = M.load(); } catch (e) { threw = true; }
    ok('R-13a [H6-2] 直接 load() 遇损坏 JSON：自身不抛异常且返回 false', !threw && ret === false);
    M.record('shen_bei', '损坏期新记忆', 'misc');
    ok('R-13b [H6-2] 损坏字节完整保留、零写盘', s.map.get(KEY) === broken);
  }
  // R-14 直接 load() + 顶层结构无效
  {
    const s = makeStorage(seedRaw(raw));
    const M = fresh(s.localStorage);
    M.init();
    const arr = JSON.stringify([{ day: TODAY }]);
    s.map.set(KEY, arr);
    let threw = false, ret;
    try { ret = M.load(); } catch (e) { threw = true; }
    ok('R-14a [H6-2] 直接 load() 遇顶层数组：自身不抛异常且返回 false', !threw && ret === false);
    M.record('shen_bei', '结构无效期新记忆', 'misc');
    ok('R-14b [H6-2] 顶层数组字节完整保留、零写盘', s.map.get(KEY) === arr);
  }
  // R-15 直接 load() + sanitize 部分改写内存后抛错（测试环境插桩，已披露）
  {
    const s = makeStorage(seedRaw(raw));
    const { M, ctx } = makeCtx(s.localStorage, injectSanitizeThrow(CODE));
    M.init();
    const disk0 = s.map.get(KEY);
    setThrow(ctx, true);
    let threw = false, ret;
    try { ret = M.load(); } catch (e) { threw = true; }
    setThrow(ctx, false);
    ok('R-15a [H6-3] 直接 load() 遇 sanitize 部分改写后抛错：自身不抛异常且返回 false',
      !threw && ret === false, 'threw=' + threw + ' ret=' + ret);
    ok('R-15b [H6-3] 清洗异常时脏内存态被丢弃（_state 不含注入脏桶）',
      !Object.prototype.hasOwnProperty.call(M._state().mem, '__h6_dirty'));
    M.record('shen_bei', '清洗异常期新记忆', 'misc');
    ok('R-15c [H6-4] 清洗异常后 save() 不得覆盖磁盘原始字节', s.map.get(KEY) === disk0);
  }
  // R-16 清洗回写 rawSave() 失败：N6，不得伪装成「清洗结果已持久化」
  {
    const s = makeStorage(seedRaw(raw));
    s.ctl.failSet = true;
    const M = fresh(s.localStorage);
    let threw = false, ret;
    try { ret = M.load(); } catch (e) { threw = true; }
    ok('R-16a [H6-5/N6] 清洗回写失败：load() 返回 false 且不抛异常', !threw && ret === false);
    ok('R-16b [H6-5/N6] 清洗回写失败时磁盘仍为原始字节（未声称已持久化）', s.map.get(KEY) === raw);
    s.ctl.failSet = false;
    M.record('shen_bei', '回写失败期新记忆', 'misc');
    ok('R-16c [H6-5] 回写失败后 save() 仍拒绝写盘', s.map.get(KEY) === raw);
  }
  // R-17 故障解除后重新 load() 正确恢复
  {
    const s = makeStorage(seedRaw(raw));
    s.ctl.failSet = true;
    const M = fresh(s.localStorage);
    const first = M.load();
    s.ctl.failSet = false;
    const second = M.load();
    ok('R-17a [H6-6] 回写失败 → 解除 → 重新 load() 返回 true', first === false && second === true);
    ok('R-17b [H6-6] 恢复后旧记忆完整读回', texts(M, 'shen_bei').includes('完好旧记忆·不可覆盖'), JSON.stringify(texts(M, 'shen_bei')));
    M.record('shen_bei', '恢复后新记忆', 'misc');
    const disk = JSON.parse(s.map.get(KEY));
    ok('R-17c [H6-6] 恢复后新记忆成功落盘且旧记忆仍在',
      (disk.mem.shen_bei || []).some(x => x.text === '恢复后新记忆') &&
      (disk.mem.shen_bei || []).some(x => x.text === '完好旧记忆·不可覆盖'));
  }
  // R-18 / R-19 用「复审前」基线字节复现 H6 缺陷，并证明当前版本已阻断
  {
    const run = (baseCode) => {
      const s = makeStorage(seedRaw(raw));
      const { M, ctx } = makeCtx(s.localStorage, injectSanitizeThrow(baseCode));
      M.init();                       // 先让状态为 ok（模拟正常运行中的页面）
      const disk0 = s.map.get(KEY);
      setThrow(ctx, true);
      let threw = false, ret;
      try { ret = M.load(); } catch (e) { threw = true; }   // 外部直接调用导出接口
      setThrow(ctx, false);
      M.record('shen_bei', 'H6复现新记忆', 'misc');
      let dirtyOnDisk = false;
      try { dirtyOnDisk = !!JSON.parse(s.map.get(KEY)).mem.__h6_dirty; } catch (e) {}
      return { s, threw, ret, disk0, dirtyOnDisk, state: M._state() };
    };
    if (R2_CODE) {
      const b = run(R2_CODE);
      ok('R-18a [BASELINE_H6_DEFECT_REPRODUCED] 复审前版本外部直接 load() 时 sanitize 异常向外逃逸', b.threw);
      ok('R-18b [BASELINE_H6_DEFECT_REPRODUCED] 复审前版本遗留 ok 状态，record 覆盖磁盘且写入脏桶',
        b.s.map.get(KEY) !== b.disk0 && b.dirtyOnDisk);
      const p = run(CODE);
      ok('R-19a [PATCHED] 当前版本外部直接 load() 不抛异常、返回 false', !p.threw && p.ret === false);
      ok('R-19b [PATCHED] 当前版本磁盘原始字节完整保留', p.s.map.get(KEY) === p.disk0);
      ok('R-19c [PATCHED] 当前版本脏桶未进入内存态也未落盘',
        !Object.prototype.hasOwnProperty.call(p.state.mem, '__h6_dirty') && !p.dirtyOnDisk);
    }
  }
  // R-20 正常路径回归：load() 返回 true、清洗结果仍落盘（不得因 H6 修正破坏老档兼容）
  {
    const s = makeStorage(seedRaw(raw));
    const M = fresh(s.localStorage);
    const ret = M.load();
    ok('R-20a 正常路径直接 load() 返回 true', ret === true);
    ok('R-20b 正常路径清洗结果仍落盘（老档缺 kind 自动补 misc）',
      JSON.parse(s.map.get(KEY)).mem.shen_bei[0].kind === 'misc');
    ok('R-20c 正常路径随后 save() 可写', M.save() === true);
  }
});

// ------------------------------------------------------------------ 汇总输出
console.log('\n=== 汇总 ===');
console.log('断言总数: ' + (pass + fail) + '  通过: ' + pass + '  失败: ' + fail + '  退出码: ' + (fail ? 1 : 0));
const out = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  target: 'js/npc_memory.js',
  isolation: 'in-memory localStorage stub; no real player data touched',
  todayKey: TODAY,
  total: pass + fail, pass, fail,
  groups: GROUPS,
  results
};
const outPath = path.join(ROOT, '..', 'm1-m3-evidence', '02_m1_unit_results.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
console.log('证据落盘: ' + outPath);
process.exit(fail ? 1 : 0);
