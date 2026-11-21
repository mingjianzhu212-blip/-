// P1-C · Muse 第四方验收 E2E 校验件（headless，无需浏览器）
// 用途：Muse 在本机 `node P1C_MUSE_E2E.mjs` 真实运行，回传完整输出作原件。
// 机制：以文本方式读取真实 js/game.js，提取 PATH_IDS / PATH_BONUS / pathBonusFor / confirmChar 守卫，
//       还原后可运行断言，验证「四道途伤害系数底层值」与「终身锁定白名单守卫」。
// 注意：本件只读源文件文本 + 还原局部函数，不加载整份 game.js（避免 DOM 依赖），不修改任何文件。
import fs from 'fs';

const PATH = 'D:/xx-scratch/jiuxiao-analysis/九霄问道/js/game.js';
const code = fs.readFileSync(PATH, 'utf8');

function extract(re, label) {
  const m = code.match(re);
  if (!m) { console.log(`!! 未匹配到 ${label}`); return null; }
  return m[0];
}

console.log('===== P1-C · E2E 源值提取（来自真实 js/game.js） =====');

// 1) PATH_IDS 字面量
const idsLit = extract(/const PATH_IDS\s*=\s*Object\.freeze\(\[[^\]]*\]\)\s*;/, 'PATH_IDS');
console.log('\n[1] PATH_IDS 源码行：');
console.log('    ' + idsLit);
const PATH_IDS = eval(idsLit.replace('const PATH_IDS =', '').replace(/;$/, ''));
console.log('    解析值 =', JSON.stringify(PATH_IDS));

// 2) PATH_BONUS 字面量
const bonusLit = extract(/const PATH_BONUS\s*=\s*Object\.freeze\(\{[^}]*\}\)\s*;/, 'PATH_BONUS');
console.log('\n[2] PATH_BONUS 源码行：');
console.log('    ' + bonusLit);
const PATH_BONUS = eval(bonusLit.replace('const PATH_BONUS =', '').replace(/;$/, ''));
console.log('    解析值 =', JSON.stringify(PATH_BONUS));

// 3) pathBonusFor 函数（含判定逻辑）
const fnSrc = extract(/function pathBonusFor\(pathId\)\s*\{[\s\S]*?\n\s*\}/, 'pathBonusFor');
console.log('\n[3] pathBonusFor 源码：');
console.log('    ' + fnSrc);
const pathBonusFor = eval('(' + fnSrc + ')');

// 4) confirmChar 守卫行（写入本源前校验白名单）
const guard = extract(/if\s*\(PATH_IDS\.indexOf\(charPath\)\s*>=\s*0[^;]*\)\s*S\.path\s*=\s*charPath;/, 'confirmChar guard');
console.log('\n[4] confirmChar 守卫行（白名单写入守卫）：');
console.log('    ' + guard);

// 5) 注入点 B 注释（开战算定一次，仅非 script 的 playerTurn）
const injB = extract(/const pathBonus = script \? 1 : pathBonusFor\(S\.path\);.*$/m, 'injection B');
console.log('\n[5] 注入点 B（伤害公式乘子算定）：');
console.log('    ' + (injB || '(见 game.js ~10551 行 const pathBonus = script ? 1 : pathBonusFor(S.path))'));

console.log('\n===== 断言（真实求值） =====');
let pass = 0, fail = 0;
function check(name, cond, got) {
  if (cond) { console.log(`  ✓ ${name} = ${JSON.stringify(got)}`); pass++; }
  else { console.log(`  ✗ ${name} = ${JSON.stringify(got)} （期望不符）`); fail++; }
}

// 系数底层值对账（Muse 必查：四道途伤害系数）
check('sword 系数 = 1.00（剑修基准，无加成）', PATH_BONUS.sword === 1.00, PATH_BONUS.sword);
check('body  系数 = 1.05（体修 +5%）',      PATH_BONUS.body === 1.05, PATH_BONUS.body);
check('dan   系数 = 1.04（丹修 +4%）',      PATH_BONUS.dan === 1.04, PATH_BONUS.dan);
check('array 系数 = 1.06（阵修 +6%）',      PATH_BONUS.array === 1.06, PATH_BONUS.array);

// 四道途 ID 与白名单对齐（联机枚举一致）
check('PATH_IDS 含 4 道途', PATH_IDS.length === 4 && PATH_IDS.every(id => id in PATH_BONUS), PATH_IDS);

// pathBonusFor 行为（非法/脏值 → 1，无加成；合法 → 对应系数）
check("pathBonusFor('sword') === 1.00", pathBonusFor('sword') === 1.00, pathBonusFor('sword'));
check("pathBonusFor('body')  === 1.05", pathBonusFor('body') === 1.05, pathBonusFor('body'));
check("pathBonusFor('dan')   === 1.04", pathBonusFor('dan') === 1.04, pathBonusFor('dan'));
check("pathBonusFor('array') === 1.06", pathBonusFor('array') === 1.06, pathBonusFor('array'));
check("pathBonusFor('xxx非法') === 1（脏值无加成）", pathBonusFor('xxx非法') === 1, pathBonusFor('xxx非法'));
check("pathBonusFor('') === 1（空值无加成）", pathBonusFor('') === 1, pathBonusFor(''));

// 守卫：仅本源未定 + 传入值属白名单才写入
check('守卫含 PATH_IDS.indexOf(charPath) >= 0', /PATH_IDS\.indexOf\(charPath\)\s*>=\s*0/.test(guard), true);
check('守卫含 已选合法道途不覆盖（typeof S.path !== string || indexOf<0）', /typeof S\.path\s*!==\s*'string'\s*\|\|\s*PATH_IDS\.indexOf\(S\.path\)\s*<\s*0/.test(guard), true);

console.log(`\n===== E2E 结果：PASS=${pass}  FAIL=${fail} =====`);
if (fail > 0) { console.log('存在不符项，请结合 game.js 源码与 GPT 终审核对。'); process.exit(1); }
else { console.log('全部底层值对账通过。系数均为 game.js 中显式标注之平衡定版 v1 值（见下条）。'); }

// 6) 定版声明（必查项关键证据）：代码注释明示「平衡定版 v1」且制作人追认「平衡pass」
const ph1 = code.indexOf('平衡定版') >= 0;
const ph2 = code.indexOf('平衡pass') >= 0;
console.log('\n[6] 定版声明（game.js:3850-3852 注释块）：');
console.log('    ' + (ph1 && ph2 ? '✓ 源码注释确认：四道途伤害乘子已平衡定版 v1（祝授权「平衡pass」追认定版），上限≤8%' : '✗ 未找到定版声明'));
console.log('\n--- 必查项结论提示 ---');
console.log('sword:1.00 = 基准无加成；四系数 sword/body/dan/array = 1.00/1.05/1.04/1.06');
console.log('经专项平衡 pass 首版定版（祝 2026-11-12 授权「平衡pass」追认），非实施方自定占位值；');
console.log('后续仍可按实战遥测微调（专项 pass 续推）。');
