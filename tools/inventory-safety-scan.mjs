// 背包与物品资产安全 · 只读覆盖扫描（不改产品代码）
// 对齐 PRODUCT_MASTER_PLAN.md §1.2 的 11 子项，逐项核对 game.js 真实代码是否存在对应实现/守卫。
// 输出：每个子项的代码存在性 + 关键行号 + 是否已有专项测试覆盖（grep tools/）。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const game = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
const lines = game.split('\n');

function near(pat, span = 400) {
  const re = new RegExp(pat);
  const out = [];
  lines.forEach((ln, i) => { if (re.test(ln)) out.push(`L${i + 1}: ${ln.trim().slice(0, 120)}`); });
  return out.slice(0, 6);
}
function countRe(pat) {
  const re = new RegExp(pat, 'g');
  return (game.match(re) || []).length;
}

// 专项测试是否已存在
const toolsDir = path.join(ROOT, 'tools');
const toolFiles = fs.readdirSync(toolsDir).filter(f => f.endsWith('.mjs') || f.endsWith('.js'));
function testMentions(pat) {
  const hits = [];
  for (const f of toolFiles) {
    const c = fs.readFileSync(path.join(toolsDir, f), 'utf8');
    if (new RegExp(pat).test(c)) hits.push(f);
  }
  return [...new Set(hits)];
}

const R = [];
function row(item, codePresent, detail, testFiles) {
  R.push({ item, codePresent, detail, tests: testFiles });
}

// 1. 物品获取/扣除/转移
row('① 物品获取/扣除/转移',
  countRe(/\b(addItem|removeItems|gainItem|useItem|addRes|deductItem)\b/) > 0,
  `addItem/removeItems 等函数调用点 ${countRe(/\b(addItem|removeItems)\b/)} 处；定义见 ${near('function (addItem|removeItems|gainItem)').join(' | ') || '未直接定位'}`,
  testMentions('addItem|removeItems|useItem'));

// 2. 数量/堆叠/合并
{
  const addItemBody = (() => {
    const m = game.match(/function addItem\([^)]*\)\s*\{([\s\S]*?)\n\}/);
    return m ? m[1] : '';
  })();
  row('② 数量/堆叠/合并',
    /bag\.push|bag\[/.test(addItemBody) || /findIndex|some\(.*id/.test(addItemBody),
    addItemBody.includes('count') || addItemBody.includes('堆叠') || /bag\.find/.test(addItemBody)
      ? 'addItem 按 id 合并计数（堆叠）' : 'addItem 直接 push（未见显式堆叠合并，需确认）',
    testMentions('堆叠|merge|stack'));
}

// 3. 满背包处理
row('③ 满背包处理',
  countRe(/背包已满|背包满|bagCap\(\)|S\.bag\.length\s*>=\s*bagCap/) > 0,
  `满包守卫 ${countRe(/背包已满|背包满|bagCap\(\)/)} 处：${near('背包已满|背包满|bagCap').slice(0,3).join(' | ')}`,
  testMentions('背包满|bagCap|INV_FULL'));

// 4. 道具使用与消耗
row('④ 道具使用与消耗',
  countRe(/useItem|消耗|costK|costR|matOk/) > 0,
  `useItem/消耗调用 ${countRe(/useItem|消耗/)} 处；炼制入口含 matOk 校验`,
  testMentions('useItem|消耗'));

// 5. 炼制材料扣除（原子性：材料扣而结果未生）
{
  const refines = near('function (refine|craft|forge|炼|breed)|_act\\(\'(refine|craft|alchemy)');
  row('⑤ 炼制材料扣除（原子性）',
    countRe(/matOk|缺料|材料不足|removeItems\([^)]*mat/) > 0,
    `炼制前材料校验 ${countRe(/matOk|缺料|材料不足/)} 处；需确认"扣材料"与"出结果"是否同一事务/顺序：${refines.slice(0,2).join(' | ')}`,
    testMentions('炼制|refine|材料扣除'));
}

// 6. 炼制成功/失败/异常中断
row('⑥ 炼制成功/失败/异常中断',
  countRe(/炼制失败|成功才 save|失败.*不写档|rollback|回滚/) > 0,
  `失败处理/回滚相关 ${countRe(/炼制失败|回滚|不写档/)} 处；沈碑已落实"成功才 save 失败不写档"(L7820) 可作参照`,
  testMentions('炼制失败|异常中断'));

// 7. 重复操作/重复领取
row('⑦ 重复操作/重复领取',
  countRe(/幂等|idempot|已领取|already|dedup|去重|runId/) > 0,
  `幂等/去重守卫 ${countRe(/幂等|已领取|dedup|去重|runId/)} 处（含联机 runId 去重，需确认单机领取幂等）`,
  testMentions('重复领取|幂等|idempot'));

// 8. 物品丢失/重复生成
row('⑧ 物品丢失/重复生成',
  countRe(/loseItem|物品丢失|重复生成|dup/) > 0,
  `显式丢失/重复生成防护 ${countRe(/物品丢失|重复生成/)} 处——多为隐式（依赖扣发对称），需专项测试验证`,
  testMentions('物品丢失|重复生成'));

// 9. 存档读取/物品迁移
row('⑨ 存档读取/物品迁移',
  countRe(/S\.bag|bag:\s*\[|loadProfile|migrate|老档/) > 0,
  `存档含 bag 引用 ${countRe(/S\.bag/)} 处；迁移默认 ${near('bag.*默认|老档.*bag|没有.*bag').slice(0,2).join(' | ')}`,
  testMentions('存档|save|load|迁移'));

// 10. 旧版本存档兼容
row('⑩ 旧版本存档兼容',
  countRe(/老档|legacy|兼容|migrate|没有.*则|默认/) > 0,
  `兼容/迁移分支 ${countRe(/老档|legacy|兼容|migrate/)} 处`,
  testMentions('旧版|legacy|兼容|迁移'));

// 11. 异常退出后资产恢复
row('⑪ 异常退出后资产恢复',
  countRe(/catch|finally|save\(\)|异常.*恢复|崩溃/) > 0,
  `save/catch 调用 ${countRe(/save\(\)|catch\(/)} 处；需确认资产变更是否在事务边界内落盘`,
  testMentions('异常|恢复|崩溃'));

console.log('=== 背包与物品资产安全 · 只读覆盖扫描 ===');
console.log(`game.js 体积 ${(game.length/1024).toFixed(0)}KB，addItem/removeItems 调用点 ${countRe(/\b(addItem|removeItems)\b/)} 处\n`);
let covered = 0;
for (const r of R) {
  const flag = r.codePresent ? '✅代码存在' : '❌代码缺口';
  const tst = r.tests.length ? `｜测试:${r.tests.join(',')}` : '｜⚠️无专项测试';
  if (r.codePresent) covered++;
  console.log(`[${flag}] ${r.item}\n   ${r.detail}${tst}\n`);
}
console.log(`代码覆盖：${covered}/${R.length} 子项有代码实现；专项测试覆盖需逐个确认（多数 ⚠️无专项）。`);
console.log('注：本扫描为只读静态分析，不改产品代码；原子性/丢失/重复等需运行时专项测试补充证据。');
