// F-01 总控自测：在 Node + vm 沙箱中加载真实 npc_memory.js（不依赖浏览器），
// 验证 A(0.95) / B(重复刷新) / R1(同日不重衰减) / R2-a(老档补 lastTouch) / 回归 / 删除阈值。
// 旧口径 0.8 仅作公式参照列，不参与真实模块运行。
import fs from 'fs';
import vm from 'vm';

const PATH = 'D:/xx-scratch/jiuxiao-analysis/九霄问道/js/npc_memory.js';
const code = fs.readFileSync(PATH, 'utf8');

function makeLS(){
  const store = new Map();
  return {
    getItem: k => store.has(k) ? store.get(k) : null,
    setItem: (k,v) => { store.set(k, String(v)); },
    removeItem: k => store.delete(k),
  };
}

function newMod(){
  const window = {};
  const localStorage = makeLS();
  const sandbox = { window, localStorage, console, Date, Math, JSON, Object, Array, String, Number, isFinite };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return { NM: window.NpcMemory, ls: localStorage };
}

function mk(seedObj){
  const { NM, ls } = newMod();
  ls.setItem('jxwd_npc_memory_v1', JSON.stringify(seedObj));
  NM.init({});
  return NM;
}

const r2 = x => Math.round(x * 10000) / 10000;
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };

let pass = 0, fail = 0;
function check(name, cond, detail){
  if (cond){ pass++; console.log('  PASS  ' + name + (detail ? ('  | ' + detail) : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? ('  | ' + detail) : '')); }
}
const mem = (NM, id) => { const m = NM._state().mem[id]; return (m && m.length) ? m[0] : null; };

console.log('\n===== [A] 衰减系数 = 0.95（逐条计时） =====');
for (const K of [1, 3, 5, 10, 20, 30]) {
  const NM = mk({ day: daysAgo(K), mem: { t: [{ text: 'a', day: daysAgo(K), strength: 1, kind: 'misc', lastTouch: daysAgo(K) }] } });
  const m = mem(NM, 't');
  const s = m ? m.strength : 0;
  const exp = r2(Math.pow(0.95, K));
  check('离线 ' + K + ' 天 strength=' + s, Math.abs(s - exp) < 1e-9, '期望 ' + exp);
}

console.log('\n===== [B] 重复提及刷新计时（不恢复强度） =====');
{
  const NM = mk({ day: daysAgo(10), mem: { t: [{ text: 'b', day: daysAgo(10), strength: 1, kind: 'misc', lastTouch: daysAgo(10) }] } });
  const before = mem(NM, 't');
  const res = NM.record('t', 'b', 'misc'); // 同文本再次记录 = 重复提及
  const after = mem(NM, 't');
  check('record 返回 {ok:true, refreshed:true}', res.ok === true && res.refreshed === true, JSON.stringify(res));
  check('lastTouch 已刷新为今天', after.lastTouch === today(), 'before=' + before.lastTouch + ' after=' + after.lastTouch);
  check('strength 未恢复（保持衰减后）', Math.abs(after.strength - before.strength) < 1e-12, 'before=' + before.strength + ' after=' + after.strength);
}
{
  // 真实模块对照：刷新过的记忆 vs 未刷新，证明 B 重置了倒计时
  const NM = mk({ day: daysAgo(40), mem: {
    refreshed: [{ text: 'x', day: daysAgo(40), strength: 1, kind: 'misc', lastTouch: daysAgo(3) }],
    stale:     [{ text: 'y', day: daysAgo(30), strength: 1, kind: 'misc', lastTouch: daysAgo(30) }],
  }});
  const rf = mem(NM, 'refreshed').strength; // 0.95^3
  const rs = mem(NM, 'stale').strength;       // 0.95^30
  check('刷新(3天前) 强度=0.95^3', Math.abs(rf - r2(Math.pow(0.95, 3))) < 1e-9, 'rf=' + rf);
  check('未刷新(30天前) 强度=0.95^30', Math.abs(rs - r2(Math.pow(0.95, 30))) < 1e-9, 'rs=' + rs);
  check('刷新显著强于未刷新（B 生效）', rf > rs, 'rf=' + rf + ' rs=' + rs);
}

console.log('\n===== [R1] 同日多次 ensureDay 不重复衰减 =====');
{
  const NM = mk({ day: daysAgo(7), mem: { t: [{ text: 'a', day: daysAgo(7), strength: 1, kind: 'misc', lastTouch: daysAgo(7) }] } });
  const s1 = mem(NM, 't').strength;
  NM.ensureDay(); // 同一真实日 → 早返回
  const s2 = mem(NM, 't').strength;
  check('s1===s2（无重复衰减）', s1 === s2, 's1=' + s1 + ' s2=' + s2);
}

console.log('\n===== [R2-a] 老档缺 lastTouch → 补齐为今天，升级首日不大幅衰减 =====');
{
  const NM = mk({ day: daysAgo(100), mem: { t: [{ text: 'c', day: daysAgo(100), strength: 1, kind: 'misc' }] } }); // 无 lastTouch
  const m = mem(NM, 't');
  check('lastTouch 补齐为字符串(今天)', typeof m.lastTouch === 'string' && m.lastTouch === today(), 'lastTouch=' + m.lastTouch);
  check('strength≈1（未因 100 天离线被一次性衰减）', m.strength === 1, 'strength=' + m.strength);
}
{
  const NM = mk({ day: today(), mem: { t: [{ text: 'c', day: daysAgo(100), strength: 1, kind: 'misc' }] } });
  const m = mem(NM, 't');
  check('day=今天 老档: lastTouch 补齐', typeof m.lastTouch === 'string', 'lastTouch=' + m.lastTouch);
  check('day=今天 老档: strength 保持 1', m.strength === 1, 'strength=' + m.strength);
}

console.log('\n===== [删除阈值] strength<0.2 自然淡忘 =====');
{
  const NM = mk({ day: daysAgo(40), mem: { t: [{ text: 'a', day: daysAgo(40), strength: 1, kind: 'misc', lastTouch: daysAgo(40) }] } });
  const gone = !NM._state().mem.t || NM._state().mem.t.length === 0;
  check('离线 40 天 → 被删除 (0.95^40≈' + r2(Math.pow(0.95, 40)) + ')', gone, JSON.stringify(NM._state().mem));
}
{
  const NM = mk({ day: daysAgo(30), mem: { t: [{ text: 'a', day: daysAgo(30), strength: 1, kind: 'misc', lastTouch: daysAgo(30) }] } });
  const kept = NM._state().mem.t && NM._state().mem.t.length === 1;
  check('离线 30 天 → 仍保留 (0.95^30≈' + r2(Math.pow(0.95, 30)) + ')', kept, 'strength=' + mem(NM, 't').strength);
}

console.log('\n===== [回归] 上限8 / attitude / list / mention / recall =====');
{
  const NM = mk({ day: today(), mem: {} });
  for (let i = 0; i < 10; i++) NM.record('rg', 'm' + i, 'misc');
  const stt = NM._state();
  check('记忆上限 8 条', stt.mem.rg.length === 8, 'len=' + stt.mem.rg.length);
  const sum = stt.mem.rg.reduce((a, b) => a + b.strength, 0);
  check('attitude = min(sum*2,16)', NM.attitude('rg') === Math.min(sum * 2, 16), 'att=' + NM.attitude('rg') + ' sum*2=' + (sum * 2));
  check('list 返回 8 条数组', Array.isArray(NM.list('rg')) && NM.list('rg').length === 8);
  check('mention.knowsPlayer=true', NM.mention('rg').knowsPlayer === true);
  check('recall.top 为字符串', typeof NM.recall('rg', 'misc').top === 'string');
}

console.log('\n===== [migrate] lastTouch 保留并作为衰减锚点（非 day），R2-a 经 migrate 成立 =====');
{
  // 记忆 lastTouch=今天(合法)、day=100天前(老 day)：init 时 elapsed=0 不衰减、R1 不触发；
  // 验证 migrate 保留 lastTouch(今天) 作为锚点、绝不以老 day 计衰减。
  const NM = mk({ day: daysAgo(100), mem: { from: [{ text: 'x', day: daysAgo(100), strength: 1, kind: 'misc', lastTouch: today() }] } });
  const before = mem(NM, 'from');
  check('init 后 lastTouch 仍为今天(未因老 day 衰减)', before && before.lastTouch === today() && Math.abs(before.strength - 1) < 1e-9, 'lastTouch=' + (before && before.lastTouch) + ' strength=' + (before && before.strength));
  const res = NM.migrate('from', 'to');
  const m = mem(NM, 'to');
  check('migrate 成功 moved=1', res.ok === true && res.moved === 1, JSON.stringify(res));
  check('迁移后 lastTouch 保留为今天(非 day=100天前)', m && m.lastTouch === today(), 'lastTouch=' + (m && m.lastTouch));
  check('迁移后 day 仍为原 day(100天前)', m && m.day === daysAgo(100), 'day=' + (m && m.day));
  check('迁移后 strength 保持 1（锚定今天，未用老 day 计衰减）', Math.abs(m.strength - 1) < 1e-9, 'strength=' + (m && m.strength));
}
{
  // 老档(无 lastTouch, 老 day) → load→sanitize 置今天 → migrate 后仍为今天，无升级首日衰减（R2-a 经 migrate 成立）
  const NM = mk({ day: daysAgo(100), mem: { from: [{ text: 'y', day: daysAgo(100), strength: 1, kind: 'misc' }] } });
  const before = mem(NM, 'from');
  check('load 后 lastTouch=今天(R2-a 由 sanitize 落实)', before && before.lastTouch === today(), 'lastTouch=' + (before && before.lastTouch));
  const res = NM.migrate('from', 'to');
  const m = mem(NM, 'to');
  check('migrate 后 lastTouch 仍为今天、strength≈1（R2-a 经 migrate 保持）', m && m.lastTouch === today() && Math.abs(m.strength - 1) < 1e-9, 'lastTouch=' + (m && m.lastTouch) + ' strength=' + (m && m.strength));
}

console.log('\n===== [衰减对照表] 新口径=真实模块跑数(0.95) | 旧口径=公式参照(0.8) =====');
console.log('离线天数\t新(0.95)实测\t旧(0.8)公式\t新是否保留');
for (let K = 0; K <= 35; K++) {
  const NM = mk({ day: daysAgo(K), mem: { t: [{ text: 'a', day: daysAgo(K), strength: 1, kind: 'misc', lastTouch: daysAgo(K) }] } });
  const m = mem(NM, 't');
  const sNew = m ? m.strength : 0;
  const sOld = r2(Math.pow(0.8, K));
  console.log(K + '\t' + sNew + '\t' + sOld + '\t' + (sNew >= 0.2 ? '保留' : '遗忘'));
}

console.log('\n===== 自测结论: PASS=' + pass + ' FAIL=' + fail + ' =====');
process.exit(fail === 0 ? 0 : 1);
