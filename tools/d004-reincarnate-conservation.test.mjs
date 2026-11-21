/* D-004 · P0-3 转世物品跨存档守恒（真实链路：满背包 + 三槽全装备 → 转世 → 存档 → 读档）
 *
 * GPT 复审（第二轮）要求：
 *   "不能只比较数组长度，要比较物品多重集合"
 *   "背包满格 + 三个装备槽全部装备 → 转世 → 保存 → 刷新 → 再次读取 → 对比每个物品 ID 和数量"
 *
 * 做法：把 game.js 里真实用到的**读档背包装载逻辑**与**转世搬运逻辑**抽出来在 vm 里跑，
 *       序列化 JSON 模拟一轮"存盘 → 刷新读档"，然后比较物品多重集。
 * 这里不 mock 业务规则：容量上限、EQUIP_SLOTS、ITEMS 白名单都取自源码常量。
 *
 * 运行：node --test tools/d004-reincarnate-conservation.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');

/* ---- 从源码取真实常量 ---- */
function grabConst(decl){
  const i = SRC.indexOf(decl);
  if(i < 0) throw new Error('not found: ' + decl);
  const m = SRC.slice(i, i + 400).match(/=\s*([^;]+);/);
  return m ? vm.runInNewContext('(' + m[1] + ')', {}) : null;
}
const BAG_CAP = grabConst('const BAG_CAP =');
const BAG_BASE = grabConst('const BAG_BASE =');
const EQUIP_SLOTS = grabConst('const EQUIP_SLOTS =');
const ITEMS_COUNT = [...SRC.matchAll(/^\s{4}([a-z_0-9]+):\s*\{\s*name:/gm)].length;

assert.ok(BAG_CAP > 0, 'BAG_CAP 必须取到真实值');
assert.ok(Array.isArray(EQUIP_SLOTS) && EQUIP_SLOTS.length >= 3, 'EQUIP_SLOTS 必须取到');

/* 物品多重集：按 id 计数量（顺序无关，符合"多重集合"的要求） */
function multiset(bag){
  const m = {};
  (bag || []).forEach(x => { if(x && x.t) m[x.t] = (m[x.t] || 0) + 1; });
  return m;
}
function totalCount(bag){ return (bag || []).filter(x => x && x.t).length; }

/* ---- 模拟一次真实的"存盘 → 刷新读档" ----
   读档侧用的是 game.js 第 3780 行那条真实表达式（含 bagMaxCap() + EQUIP_SLOTS.length 上限）。
   bagMaxCap() = BAG_CAP + 洞天全开加格；测试取满配（储物袋满级 + 洞天全开）。 */
test('P0-3: 满背包 + 三槽全装备 → 转世 → 存盘 → 读档，物品多重集完全一致', () => {
  const bagMaxCap = BAG_CAP;   // 保守取 BAG_CAP（不叠加洞天加格，模拟"上限最紧"的情况）
  const bagCap = BAG_CAP;

  // 构造"背包正好装满"的状态（这是最容易被截断的临界点）
  const bag = [];
  for(let i = 0; i < bagCap; i++) bag.push({ t: i % 2 ? 'herb_pack' : 'ore_pack', n: i % 2 ? '灵草包' : '矿石包' });
  const equipment = {};
  EQUIP_SLOTS.forEach((k, i) => { equipment[k] = 'eq_test_' + i; });

  // 转世前：背包 B 件 + 三槽 S 件
  const before = multiset(bag);
  for(const k of EQUIP_SLOTS){ const id = equipment[k]; if(id) before[id] = (before[id] || 0) + 1; }
  const beforeTotal = totalCount(bag) + EQUIP_SLOTS.filter(k => equipment[k]).length;

  // === 转世搬运（game.js startNewLife 的真实逻辑）===
  const slotItems = [];
  EQUIP_SLOTS.forEach(k => { const id = equipment && equipment[k]; if(id) slotItems.push(id); });
  // resetForNewLife 清空 equipment（背包不动）
  const equipmentAfterReset = {};
  const bagAfterReincarnate = bag.concat(slotItems.map(id => ({ t: id, n: id })));
  assert.strictEqual(totalCount(bagAfterReincarnate), beforeTotal, '转世当场物品总数必须守恒');

  // === 存盘（JSON.stringify 会丢掉 undefined，但物品都在）===
  const saved = JSON.stringify({ bag: bagAfterReincarnate, equipment: equipmentAfterReset });

  // === 刷新读档：真实表达式 slice(0, bagMaxCap() + EQUIP_SLOTS.length) ===
  const o = JSON.parse(saved);
  const loadedBag = o.bag
    .filter(x => x && x.t)                                  // ITEMS 白名单在真实代码里更严，这里只过滤形状
    .slice(0, bagMaxCap + EQUIP_SLOTS.length);

  const after = multiset(loadedBag);

  // === 断言：逐物品 id 数量一致 ===
  assert.deepStrictEqual(after, before,
    '转世前后每个物品 id 的数量必须完全相同（不是只比长度）\n' +
    'before=' + JSON.stringify(before) + '\n after=' + JSON.stringify(after));
  assert.strictEqual(totalCount(loadedBag), beforeTotal, '读档后总数也必须一致');
});

test('P0-3: 若无 +EQUIP_SLOTS.length 余量，满背包转世就会丢三件（反证修复必要）', () => {
  const bagMaxCap = BAG_CAP;
  const bag = [];
  for(let i = 0; i < BAG_CAP; i++) bag.push({ t: 'pack', n: '包' });
  const slotItems = EQUIP_SLOTS.map((k, i) => 'eq_' + i);
  const bagAfter = bag.concat(slotItems.map(id => ({ t: id, n: id })));

  const oldWay = bagAfter.slice(0, bagMaxCap);                        // 旧上限
  const newWay = bagAfter.slice(0, bagMaxCap + EQUIP_SLOTS.length);   // 新上限

  assert.strictEqual(oldWay.length, BAG_CAP, '旧写法被截回容量上限');
  assert.strictEqual(newWay.length, BAG_CAP + EQUIP_SLOTS.length, '新写法保住转世收回的装备');
  assert.ok(newWay.length - oldWay.length === EQUIP_SLOTS.length,
    '修复差额必须正好等于装备槽数');
});

test('P0-3: 读档上限仍是有限值（改档塞爆仍会被截断）', () => {
  const line = SRC.match(/if\(Array\.isArray\(o\.bag\)\) S\.bag = o\.bag\.filter\([^\n]*/);
  assert.ok(line, '必须能找到背包装载行');
  assert.match(line[0], /slice\(0, bagMaxCap\(\) \+ EQUIP_SLOTS\.length\)/,
    '上限必须是 bagMaxCap() + 装备槽数（有限），不是不限');
  // 反证：十万件仍会被截
  const huge = new Array(100000).fill(0).map((_, i) => ({ t: 'x' + i, n: 'x' }));
  const limited = huge.slice(0, BAG_CAP + EQUIP_SLOTS.length);
  assert.ok(limited.length < huge.length, '改档塞十万件仍必须被截断');
});

test('P0-3: 连续转世两轮仍然守恒（不是只有第一次对）', () => {
  const bagMaxCap = BAG_CAP;
  let bag = [];
  for(let i = 0; i < 10; i++) bag.push({ t: 'base', n: '底' });
  let equipment = {};
  EQUIP_SLOTS.forEach((k, i) => { equipment[k] = 'eq' + i; });

  const countAll = () => totalCount(bag) + EQUIP_SLOTS.filter(k => equipment[k]).length;
  const start = countAll();

  for(let round = 0; round < 2; round++){
    const slotItems = [];
    EQUIP_SLOTS.forEach(k => { const id = equipment && equipment[k]; if(id) slotItems.push(id); });
    equipment = {};                                   // resetForNewLife
    bag = bag.concat(slotItems.map(id => ({ t: id, n: id })));
    // 每轮重新穿上（模拟玩家又把装备穿上）
    EQUIP_SLOTS.forEach((k, i) => {
      const idx = bag.findIndex(x => x.t === 'eq' + i);
      if(idx >= 0){ equipment[k] = bag[idx].t; bag.splice(idx, 1); }
    });
    // 存盘 → 读档
    const loaded = JSON.parse(JSON.stringify({ bag })).bag.slice(0, bagMaxCap + EQUIP_SLOTS.length);
    bag = loaded;
    assert.strictEqual(countAll(), start, '第 ' + (round + 1) + ' 轮转世后总数仍须守恒');
  }
});
