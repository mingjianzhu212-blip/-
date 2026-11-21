/* D-008「见闻录 · 沉浸感内容工程」源码契约测试
 *
 * 定位说明（供独立审查判定证据强度）：
 *   本批是纯静态内容表扩容——只往 js/game.js 的 ENCOUNTERS / ADV_EVENTS 两张表末尾追加条目，
 *   零新增存档字段、零新增数值档位、零逻辑分支、零 UI/路由/渲染改动、零不可逆。
 *   本文件做四类可复核校验：
 *     ① 用 node:vm 真实求值两张表（不是正则猜字段），逐条校验结构与值域；
 *     ② 校验「既有 4+4 条逐字未改」——改前基线取自 js/D008_BACKUP_20261109_020957/game.js；
 *     ③ 校验新增条目「零新数值档位」——所有 fx 值必须落在既有 4 条用过的档位集合内；
 *     ④ 校验红线零触碰——需要改但本批明令禁止的函数/常量/存档键在 game.js 全文逐字仍在，
 *        且改后 game.js 与基线的差异只发生在两张表定义区间内（用行级 diff 判定）。
 *   源码契约 ≠ 真实浏览器运行验收；后者由 verify.js / headless 全套 / 多视口截图覆盖，
 *   两类证据分别记录。
 *
 * 运行：node --test tools/d008-content.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8');
const BAK = path.join(root, 'js', 'D008_BACKUP_20261109_020957', 'game.js');
const base = fs.existsSync(BAK) ? fs.readFileSync(BAK, 'utf8') : null;

/* 从源码里按「括号配平」精确截取两个表定义的字面量文本，再用 vm 真实求值成对象 */
function grab(src, name, open, close){
  const i = src.indexOf('const ' + name + ' = ' + open);
  assert.ok(i >= 0, name + ' 定义存在');
  const start = src.indexOf(open, i);
  let d = 0, end = -1;
  for(let k = start; k < src.length; k++){
    const c = src[k];
    if(c === open) d++;
    else if(c === close){ d--; if(d === 0){ end = k; break; } }
  }
  assert.ok(end > start, name + ' 字面量闭合');
  return src.slice(start, end + 1);
}
const evalLit = (lit) => vm.runInNewContext('(' + lit + ')', {});
/* vm 求值出的对象来自另一个 realm，deepStrictEqual 会因跨 realm 原型不同而误判失败
   （值完全相同）。用 JSON 归一化到本 realm 后再做深度比较，仍逐字段严格。 */
const plain = (v) => JSON.parse(JSON.stringify(v));
const enc = evalLit(grab(game, 'ENCOUNTERS', '{', '}'));
const adv = evalLit(grab(game, 'ADV_EVENTS', '[', ']'));
const enc0 = base ? evalLit(grab(base, 'ENCOUNTERS', '{', '}')) : null;
const adv0 = base ? evalLit(grab(base, 'ADV_EVENTS', '[', ']')) : null;

const FX_KEYS = ['costStone','stone','wisdom','insight','exp','expLoss','boost','roll'];
const NUM_KEYS = ['costStone','stone','wisdom','insight','exp','expLoss'];
const ORIG_ENC_IDS = ['beggar','pouch','stele','amulet'];

/* 既有 4 条用过的数值档位全集（来自改前 ENCOUNTERS，逐字核对过 game.js:1100-1140）。
   新增条目只允许复用这些档位，不允许出现任何新数值——这是「零新增数值」的可复核判据。 */
const ALLOW = {
  costStone:[10,30], stone:[180], wisdom:[50], insight:[12,5], exp:[], expLoss:[0.08],
  mult:[0.60,0.15], sec:[900], w:[6,4,5]
};
const inSet = (arr, v) => arr.indexOf(v) >= 0;

/* fx 类型契约（D-008 第二轮独立审查要求，定点补证）：
   fx 必须是「非 null、非数组、纯对象」；boost 仅允非数组对象且只含 mult/sec；
   roll 必须是数组，其分支只允非数组对象且只含 w/text/fx，分支内 fx 同样须为合法对象。
   该规则与 verify.js 运行时契约逐字一致，两类证据分别记录且同源。 */
const validFx = (fx) => fx !== null && typeof fx === 'object' && !Array.isArray(fx);
const validBoost = (b) => b !== null && typeof b === 'object' && !Array.isArray(b)
  && Object.keys(b).every(k => k === 'mult' || k === 'sec')
  && typeof b.mult === 'number' && typeof b.sec === 'number';
const validRoll = (r) => Array.isArray(r) && r.every(b =>
  b !== null && typeof b === 'object' && !Array.isArray(b)
  && Object.keys(b).every(k => k === 'w' || k === 'text' || k === 'fx')
  && typeof b.w === 'number' && typeof b.text === 'string' && validFx(b.fx));

/* ---------- 一、规模与既有条目逐字未改 ---------- */

test('ENCOUNTERS 由 4 扩到 34、ADV_EVENTS 由 4 扩到 18', () => {
  assert.strictEqual(Object.keys(enc).length, 34, '奇遇 34 条');
  assert.strictEqual(adv.length, 18, '历练 18 条');
});

test('既有 4 个奇遇条目逐字未改（逐字段深度相等）', () => {
  assert.ok(enc0, '改前基线存在');
  ORIG_ENC_IDS.forEach(id => {
    assert.deepStrictEqual(plain(enc[id]), plain(enc0[id]), id + ' 内容与改前完全一致');
  });
});

test('既有 4 条历练逐字未改、新增 14 条 id 顺延 5~18 且唯一', () => {
  assert.ok(adv0, '改前基线存在');
  for(let i = 0; i < 4; i++) assert.deepStrictEqual(plain(adv[i]), plain(adv0[i]), '历练 id=' + (i + 1) + ' 未改');
  const ids = plain(adv).map(a => a.id);   /* plain: 归一化到本 realm，避免跨 realm 数组原型误判 */
  assert.deepStrictEqual(ids, Array.from({length:18}, (_, i) => i + 1), 'id 严格 1..18');
  assert.strictEqual(new Set(ids).size, 18, 'id 唯一');
});

test('34 个奇遇 id 唯一、且不与既有 4 条冲突', () => {
  const ids = Object.keys(enc);
  assert.strictEqual(new Set(ids).size, 34, 'id 唯一');
  ORIG_ENC_IDS.forEach(id => assert.ok(ids.indexOf(id) >= 0, id + ' 仍在'));
  assert.ok(ids.indexOf('beggar') < ids.indexOf('beggar_again'), '追加在表尾（既有在前、新增在后）');
});

/* ---------- 二、逐条结构合法 ---------- */

test('每个奇遇条目字段完整、text/label 无 HTML 注入', () => {
  Object.keys(enc).forEach(id => {
    const e = enc[id];
    assert.ok(e.icon && typeof e.icon === 'string', id + ' 有 icon');
    assert.ok(e.name && typeof e.name === 'string', id + ' 有 name');
    assert.ok(e.text && typeof e.text === 'string' && e.text.length >= 8, id + ' 有 text');
    assert.ok(Array.isArray(e.opts) && e.opts.length >= 2, id + ' 至少 2 个选项');
    assert.ok(!/</.test(e.text), id + ' text 无 <');
    e.opts.forEach((o, i) => {
      assert.ok(o.label && typeof o.label === 'string', id + '#' + i + ' 有 label');
      assert.ok(validFx(o.fx), id + '#' + i + ' 有合法 fx（对象，非 null/数组/字符串；纯叙事为 {}）');
      /* ok 是结算叙述文案，但引擎只在「非 roll 选项」上实际展示：resolveEncounter 对 roll 选项会把
         detail 覆盖为分支 text（js/game.js:5327 `detail = hit.text || ''`），ok 对 roll 选项是死数据。
         因此契约只在「非 roll 选项」上强制 ok；既有 4 条（beggar/pouch/stele/amulet）受红线「逐字未改」
         保护且引擎对缺省 ok 有兜底（o.ok || ''），一并祖父化豁免。 */
      if(ORIG_ENC_IDS.indexOf(id) < 0 && !(o.fx && o.fx.roll)) assert.ok(o.ok !== undefined, id + '#' + i + ' 有 ok（非 roll 选项，结算叙述文案）');
      assert.ok(!/</.test(o.label), id + '#' + i + ' label 无 <');
    });
  });
});

test('每个历练条目 desc 非空无 HTML、恰 2 个选项且 action 只取 battle/escape', () => {
  adv.forEach(a => {
    assert.ok(a.desc && typeof a.desc === 'string' && a.desc.length >= 8, 'id=' + a.id + ' desc');
    assert.ok(!/</.test(a.desc), 'id=' + a.id + ' desc 无 <');
    assert.ok(Array.isArray(a.options) && a.options.length === 2, 'id=' + a.id + ' 恰 2 选项');
    a.options.forEach(o => {
      assert.ok(o.text && typeof o.text === 'string', 'id=' + a.id + ' 选项 text');
      assert.ok(['battle','escape'].indexOf(o.action) >= 0, 'id=' + a.id + ' action 合法');
    });
  });
});

/* ---------- 三、零新增数值档位 ---------- */

test('新增 30 条奇遇的 fx 键全在 8 类白名单、roll 分支完整', () => {
  const newIds = Object.keys(enc).filter(id => ORIG_ENC_IDS.indexOf(id) < 0);
  assert.strictEqual(newIds.length, 30, '新增 30 条');
  const chk = (fx, id) => {
    if(!validFx(fx)) return;
    Object.keys(fx).forEach(k => assert.ok(FX_KEYS.indexOf(k) >= 0, id + ' fx 键 ' + k + ' 合法'));
    if(fx.boost !== undefined) assert.ok(validBoost(fx.boost), id + ' boost 为合法对象且仅含 mult/sec');
    if(fx.roll !== undefined){
      assert.ok(Array.isArray(fx.roll), id + ' roll 为数组');
      fx.roll.forEach(b => {
        assert.strictEqual(typeof b.w, 'number', id + ' roll.w 是数字');
        assert.ok(b.text && typeof b.text === 'string', id + ' roll.text 存在');
        assert.ok(validFx(b.fx), id + ' roll.fx 为合法对象');
        chk(b.fx, id);
      });
    }
  };
  newIds.forEach(id => enc[id].opts.forEach(o => chk(o.fx, id)));
});

test('新增 30 条零新数值档位：所有 fx 值都在既有 4 条的档位集合内', () => {
  const newIds = Object.keys(enc).filter(id => ORIG_ENC_IDS.indexOf(id) < 0);
  const chk = (fx, id) => {
    if(!fx) return;
    NUM_KEYS.forEach(k => {
      if(fx[k] !== undefined) assert.ok(inSet(ALLOW[k], fx[k]), id + ' ' + k + '=' + fx[k] + ' 是既有档位');
    });
    if(fx.boost){
      assert.ok(inSet(ALLOW.mult, fx.boost.mult), id + ' boost.mult 是既有档位');
      assert.ok(inSet(ALLOW.sec, fx.boost.sec), id + ' boost.sec 是既有档位');
    }
    if(fx.roll) fx.roll.forEach(b => {
      assert.ok(inSet(ALLOW.w, b.w), id + ' roll.w=' + b.w + ' 是既有权重');
      chk(b.fx, id);
    });
  };
  newIds.forEach(id => enc[id].opts.forEach(o => chk(o.fx, id)));
});

test('绝大多数新增条目是纯叙事（fx 为空），带数值的仅卷五 4 条故人回响', () => {
  const newIds = Object.keys(enc).filter(id => ORIG_ENC_IDS.indexOf(id) < 0);
  const withFx = newIds.filter(id => enc[id].opts.some(o => o.fx && Object.keys(o.fx).length > 0));
  assert.deepStrictEqual(withFx, ['beggar_again','amulet_again','pouch_again','stele_again'],
    '仅这 4 条带 fx，且复用既有档位；其余 26 条纯叙事');
});

/* ---------- 三之二、fx 类型契约（第二轮审查定点补证） ---------- */

test('fx 类型契约：反例验证（null/数组/字符串/非法 roll 被拒，合法结构通过）', () => {
  /* 这些用例直接验证契约规则本身，证明「合法对象」判定不是只查 !== undefined 的假绿 */
  assert.strictEqual(validFx(null), false, 'fx:null 被拒');
  assert.strictEqual(validFx([]), false, 'fx:[] 被拒');
  assert.strictEqual(validFx('x'), false, 'fx:字符串 被拒');
  assert.strictEqual(validFx({}), true, 'fx:{} 合法');
  assert.strictEqual(validFx({ stone: 180 }), true, 'fx:{stone:180} 合法');
  assert.strictEqual(validRoll({}), false, 'roll:{} 非数组 被拒');
  assert.strictEqual(validRoll(null), false, 'roll:null 被拒');
  assert.strictEqual(validRoll([{ w: 6, text: 'a', fx: null }]), false, 'roll 分支 fx:null 被拒');
  assert.strictEqual(validRoll([{ w: 6, text: 'a', fx: {} }]), true, 'roll 合法分支 通过');
  assert.strictEqual(validBoost({ mult: 0.6, sec: 900, extra: 1 }), false, 'boost 含额外键 被拒');
  assert.strictEqual(validBoost({ mult: 0.6, sec: 900 }), true, 'boost 合法 通过');
});

test('fx 类型契约：嵌套 falsy 非法值（boost:null / roll:null）漏检漏洞已闭合', () => {
  /* 第三轮审查指出的真值判断漏洞：若用 `if(fx.boost)` 守卫，boost:null 会被跳过而漏检。
     修复后改用 `!== undefined` 守卫，下面模拟与 verify.js 同款的 chkFx 判定逻辑。 */
  const safeChk = (fx) => {
    if(!validFx(fx)) return false;
    if(fx.boost !== undefined && !validBoost(fx.boost)) return false;
    if(fx.roll !== undefined && !validRoll(fx.roll)) return false;
    return true;
  };
  assert.strictEqual(validBoost(null), false, 'boost:null 被拒');
  assert.strictEqual(validBoost(0), false, 'boost:0 被拒');
  assert.strictEqual(validRoll(null), false, 'roll:null 被拒');
  assert.strictEqual(validRoll('x'), false, 'roll:字符串 被拒');
  assert.strictEqual(safeChk({ boost: null }), false, '{boost:null} 被拒（不再漏检）');
  assert.strictEqual(safeChk({ roll: null }), false, '{roll:null} 被拒（不再漏检）');
  assert.strictEqual(safeChk({ boost: { mult: 0.6, sec: 900 } }), true, '合法 boost 通过');
  assert.strictEqual(safeChk({ roll: [{ w: 6, text: 'a', fx: {} }] }), true, '合法 roll 通过');
});

test('全部 34 条奇遇的真实 fx 均通过类型契约（validFx + validBoost + validRoll）', () => {
  Object.keys(enc).forEach(id => {
    enc[id].opts.forEach((o, i) => {
      assert.ok(validFx(o.fx), id + '#' + i + ' fx 为合法对象（非 null/数组/字符串）');
      if(o.fx.boost) assert.ok(validBoost(o.fx.boost), id + '#' + i + ' boost 为合法对象且仅含 mult/sec');
      if(o.fx.roll) assert.ok(validRoll(o.fx.roll), id + '#' + i + ' roll 为数组且分支合法');
    });
  });
});

/* ---------- 四、红线零触碰 ---------- */

test('触发/结算/渲染链、ENC 常量、历练结算常量逐字未改', () => {
  const must = [
    'const ENC = { chance: 0.30, everySec: 60, ttlSec: 300 };',
    'const ADV_STONE = 50, ADV_EXP_LOSS = 10, ADV_ESCAPE_EXP = 5;',
    'const ids = Object.keys(ENCOUNTERS).filter(id => id !== S.enc.lastId || Object.keys(ENCOUNTERS).length < 2);',
    'function encApplyFx(fx){',
    'if(fx.costStone){ S.stone = Math.max(0, S.stone - fx.costStone);',
    'const ev = ADV_EVENTS[Math.floor(Math.random() * ADV_EVENTS.length)];',
    'function resolveAdventure(i){',
    'function renderEncounter(){'
  ];
  must.forEach(s => assert.ok(game.includes(s), '逐字仍在：' + s.slice(0, 48)));
});

test('本批禁止触碰的红线在源码中逐字仍在（数值/存档/主循环/UI 时序）', () => {
  const must = [
    'needG',                             // 成长指数
    'if(S.log.length > 40)',             // 日志上限
    'sigNum(S.exp)',                     // uiSignature
    'uiIdleTicks >= 2',                  // 主循环兜底
    'SIDECAR_KEYS',                      // 侧车键
    'SAVE_SIG_KEYS',                     // 存档签名键
    "confirm('放生【'"                   // 原生 confirm
  ];
  must.forEach(s => assert.ok(game.includes(s), '红线逐字仍在：' + s.slice(0, 40)));
  /* 战力公式是 const 箭头函数（不是 function 声明），且与改前基线逐字一致——
     这比"存在某函数名"更强：连乘区一个因子都不能被改动。 */
  const cpNow = (game.match(/^  const combatPower = .*$/m) || [])[0] || '';
  const cpBase = base ? (base.match(/^  const combatPower = .*$/m) || [])[0] || '' : '';
  assert.ok(cpNow.includes('Math.pow(1.5, S.rank)'), '战力公式主体仍在');
  assert.strictEqual(cpNow, cpBase, '战力公式整行与改前基线逐字一致');
});

test('改后 game.js 与改前基线的差异只发生在两张表定义区间内', () => {
  assert.ok(base, '改前基线存在');
  /* 用「表定义之前」和「表定义之后」两段文本比对：本批只允许改表体，前后文必须逐字一致。
     表体从 ENCOUNTERS 定义起点到 ADV_EVENTS 字面量结束。 */
  const encStartNow = game.indexOf('const ENCOUNTERS = {');
  const advEndNow = game.indexOf('const ADV_EVENTS = [') + grab(game, 'ADV_EVENTS', '[', ']').length;
  const encStartBase = base.indexOf('const ENCOUNTERS = {');
  const advEndBase = base.indexOf('const ADV_EVENTS = [') + grab(base, 'ADV_EVENTS', '[', ']').length;
  const beforeNow = game.slice(0, encStartNow), afterNow = game.slice(advEndNow);
  const beforeBase = base.slice(0, encStartBase), afterBase = base.slice(advEndBase);
  assert.strictEqual(beforeNow, beforeBase, 'ENCOUNTERS 之前的全文逐字未改');
  assert.strictEqual(afterNow, afterBase, 'ADV_EVENTS 之后的全文逐字未改');
  /* 两表之间的中段（含既有的 ADV_STONE 常量行、历练表头注释）与改前基线逐字相等。
     注意：中段本来就含 `const ADV_STONE = 50, ...` 这条既有常量，判据必须是「与基线相等」
     而不是「不含代码」——后者会误判合法存量。 */
  const midNow = game.slice(
    game.indexOf('const ENCOUNTERS = {') + grab(game, 'ENCOUNTERS', '{', '}').length,
    game.indexOf('const ADV_EVENTS = ['));
  const midBase = base.slice(
    base.indexOf('const ENCOUNTERS = {') + grab(base, 'ENCOUNTERS', '{', '}').length,
    base.indexOf('const ADV_EVENTS = ['));
  assert.strictEqual(midNow, midBase, '两表之间的中段与改前基线逐字完全一致');
  assert.ok(midNow.includes('历练 · 文字冒险'), '中段仍是原有的历练表头注释');
});

test('ENCOUNTERS / ADV_EVENTS 字面量之外的 game.js 行数差为 0（仅表内增行）', () => {
  assert.ok(base, '改前基线存在');
  /* 表内允许增行；把两张表字面量整体剔除后，剩余全文必须逐字相等（含行数） */
  const strip = (s) => s
    .replace(grab(s, 'ENCOUNTERS', '{', '}'), '«ENC»')
    .replace(grab(s, 'ADV_EVENTS', '[', ']'), '«ADV»');
  assert.strictEqual(strip(game), strip(base), '剔除两张表后 game.js 余下全文逐字完全一致');
});
