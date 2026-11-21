/* D-007 · 通宵深玩报告「仍在·可修」批次：源码契约测试
 *
 * 定位说明（重要，供独立审查判定证据强度）：
 *   本批 20 余处改动全部是纯文案、显示口径、日志反馈、以及 DOM 内容签名守卫，
 *   没有新增业务状态、没有改数值/存档/主循环时序。
 *   「运行时行为」由 headless 全套回归覆盖（verify.js / _playtest.js /
 *   verify_npc_ui.js / verify_break.js / verify_npc.js 等）；
 *   本文件固定的是「源码契约」——防止这些字面量与守卫被后续改动抹掉，
 *   并同时校验本批没有越界触碰红线（日志上限、uiSignature、主循环兜底、原生确认弹窗）。
 *   它是源码层证据，不等价于真实浏览器运行验收，两类证据分别记录。
 *
 * 运行：node --test tools/d007-ui-text.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const game = fs.readFileSync(path.join(root, 'js', 'game.js'), 'utf8');
const sect = fs.readFileSync(path.join(root, 'js', 'views', 'sect.js'), 'utf8');
const verifySrc = fs.readFileSync(path.join(root, 'verify.js'), 'utf8');

const has = (s, x) => s.includes(x);
const absent = (s, x) => !s.includes(x);

/* ---------- 一、纯文案 / 显示口径 ---------- */

test('A24 强化「下一级」成功率与按钮/实际结算同源（不再用 nCh 少算 3%）', () => {
  assert.ok(absent(game, 'const nCh = Math.min(1, Math.max(BAL.enhanceMinChance'), '旧的 nCh 已移除');
  const m = game.match(/html \+= '<div class="enh-next">下一级 \+'[\s\S]{0,420}?Math\.round\(ch \* 100\)/);
  assert.ok(m, 'enh-next 行使用 enhanceChance() 的结果 ch');
});

test('A52 破境丹效果文案写明「立得修为」的折算口径（约 N 秒修炼量）', () => {
  assert.ok(has(game, "d.exp + ' 秒修炼量"), 'po 族文案带秒数口径，跨境界仍准确');
  assert.ok(absent(game, "'；服食立得修为，'"), '不再含无数值的旧文案');
});

test('B38 签到格子：已领后不再把「下一次待领」误标成已领', () => {
  assert.ok(has(game, 'const lastClaimed = idx === 0 ? SIGN_REWARD.length - 1 : idx - 1;'));
  assert.ok(has(game, 'const claimed = done ? (S.sign.days > 0 && i <= lastClaimed) : (i < idx);'));
  assert.ok(absent(game, "today ? (done ? ' got' : ' now')"), '旧的三元口径已移除');
});

test('A66/B40 声望兑换档位按 rep 升序排列', () => {
  const m = game.match(/const ARENA_SHOP = \[([\s\S]*?)\];/);
  assert.ok(m, 'ARENA_SHOP 存在');
  const reps = Array.from(m[1].matchAll(/rep:(\d+)/g), x => Number(x[1]));
  assert.deepStrictEqual(reps, [30, 60, 100, 150, 220], '30/60/100/150/220 升序');
  assert.ok(m[1].indexOf("id:'dan3'") < m[1].indexOf("id:'bag'"), 'index 0 仍是上品丹药（buyRep(0) 兼容）');
});

test('C39 破防门丹药括号配对（需【…】以上）', () => {
  assert.ok(absent(game, "+ '」以上'"), '不再有开【闭」的不配对括号');
  assert.ok(has(game, "+ '】以上'"));
});

test('A47/B49 勾选天机令或顿悟圆满时按钮写「必定成功」而非成功率', () => {
  assert.ok(has(game, 'const useTianji = !!(tjBox && tjBox.checked) && (S.tianji | 0) > 0;'));
  assert.ok(has(game, 'const epiphanyFull = (S.insight || 0) >= WISDOM.full;'));
  assert.ok(has(game, "'（必定成功 100%）'"));
});

test('A73/B78 镇妖塔并排标签语义消歧（待挑战层 / 已通关最高）', () => {
  assert.ok(has(game, "'<div class=\"tw-fl\"><span>待挑战层</span><b>' + S.tower"));
  assert.ok(has(game, "'<div class=\"tw-fl\"><span>已通关最高</span><b>' + S.towerMax"));
  assert.ok(absent(game, '<span>当前层</span>'), '旧的「当前层」标签已换');
  assert.ok(absent(game, '<span>历史最高</span>'), '旧的「历史最高」标签已换');
});

test('A31 物品详情寄售价与 sellMarket 实收价同源（不再用 ITEMS 固定 sell）', () => {
  assert.ok(has(game, 'const sellP = sellPrice(it.t);'), '详情取动态价');
  assert.ok(has(game, 'resetMarket();'), '先同步当日行情，保证与坊市页同入口');
  assert.ok(has(game, "setTxt('it-sell',   sellP ?"));
  assert.ok(has(game, "if(sellP)     html += '<button class=\"btn-sub\" data-do=\"sell\">'"));
  assert.ok(absent(game, 'fmt(meta.sell)'), '旧的固定标价显示已全部移除');
});

test('A33 坊市寄售：列表 12 行与「一键寄售全部」件数口径写清', () => {
  assert.ok(has(game, '一键寄售全部（'));
  assert.ok(has(game, '上面只列出前 12 件；一键寄售会卖出背包里全部可卖材料'));
});

test('A54 矿脉「开辟后产量」写进独立 hint 行（按钮保持短文案，防 393 窄屏挤压回归）', () => {
  assert.ok(has(game, "const hint = document.querySelector('#xx-mine .hint');"), '产量说明落在按钮外的 hint');
  assert.ok(has(game, '开辟后每分钟产 '), 'hint 写出升级后产量');
  assert.ok(has(game, "else{ btn.disabled = S.stone < mineCost(); btn.textContent = '开辟 · 灵石 ' + fmt(mineCost()); }"),
    '按钮回到改前的短文案');
  assert.ok(absent(game, "（升级后每分钟 +'"), '长说明不再塞进按钮（已证实会把窄屏左侧标签挤成竖排）');
});

test('A57 探索秘境：运行时动态标价 + 静态文案补产出范围', () => {
  assert.ok(has(game, "setTxt('xx-treasure', '🗺️ 探索秘境 · 灵石 ' + fmt(treasureCost()));"));
  assert.ok(has(sect, '随境界递增，与实扣同源'));
  assert.ok(has(sect, '各 5~20 份'));
  assert.ok(absent(sect, '探索秘境 · 灵石</button>'), '静态按钮不再留悬空的「· 灵石」');
});

test('A65 功法精进日志不再输出 undefined（GONGS 无 ico 字段）', () => {
  assert.ok(absent(game, "log(g.ico + ' ' + g.name"));
  assert.ok(has(game, "log('📖 【' + g.name + '】精进到第 '"));
});

test('A97 云游老道日志补上实际修为数值', () => {
  assert.ok(has(game, "log('📜 云游老道指点两句，瓶颈松动了些，修为 +' + fmt(v), 'sys');"));
  assert.ok(absent(game, "log('📜 云游老道指点两句，瓶颈松动了些。', 'sys');"));
});

test('A16 冷却中不再清空小字副文', () => {
  assert.ok(absent(game, "small.textContent = left > 0 ? ''"));
  assert.ok(has(game, "small.textContent = (small.dataset.base || '') + (limit ? ' · 剩 ' + leftN + ' 次' : '');"));
});

test('A64 喂食灵兽日志写明灵草/灵石消耗', () => {
  assert.ok(has(game, "（灵草 −' + herbCost + '、灵石 −' + fmt(stoneCost)"));
});

test('A75 自动猎杀的两处停止都给出「已停止」反馈', () => {
  const n = (game.match(/自动猎杀已停止/g) || []).length;
  assert.strictEqual(n, 2, '战力不足停 + 背包满停（实际 ' + n + ' 处）');
});

test('A11/A91 奇遇分支结果叙述（含反噬原因）写进日志而非丢弃', () => {
  assert.ok(has(game, "if(detail) log('📖 ' + detail, 'sys');"));
});

test('A77 灵兽槽满孵化日志写明「本次孵化未进行」', () => {
  assert.ok(has(game, '本次孵化未进行'));
});

/* ---------- 二、渲染稳定性：三份内容签名守卫 ---------- */

test('A61/A77 背包 / 灵兽园 / 坊市寄售三处 innerHTML 均有内容签名守卫', () => {
  assert.ok(has(game, "let bagBox = null, bagSig = '';"));
  assert.ok(has(game, "let petBox = null, petSig = '';"));
  assert.ok(has(game, "let sellBox = null, sellSig = '';"));
  assert.ok(/if\(box !== bagBox \|\| html !== bagSig\)\{\s*bagBox = box; bagSig = html;\s*box\.innerHTML = html;\s*\}/.test(game), 'renderBag 守卫');
  assert.ok(/if\(box !== petBox \|\| html !== petSig\)\{\s*petBox = box; petSig = html;\s*box\.innerHTML = html;\s*\}/.test(game), 'renderPets 守卫');
  assert.ok(/if\(sBox !== sellBox \|\| html !== sellSig\)\{\s*sellBox = sBox; sellSig = html;\s*sBox\.innerHTML = html;\s*\}/.test(game), 'mk-sell 守卫');
  assert.ok(has(game, 'sellBox = null; sellSig = \'\';'), '离开坊市时缓存一并清空，不残留游离子树');
});

/* ---------- 三、白名单边界：红线未被触碰 ---------- */

test('禁止范围未被动：日志上限 / uiSignature / 主循环兜底 / 原生确认弹窗', () => {
  assert.ok(has(game, 'if(S.log.length > 40) S.log.length = 40;'), '日志上限 40 未改（需裁定）');
  assert.ok(has(game, 'sigNum(S.exp)'), 'uiSignature 未动（需真机测量）');
  assert.ok(has(game, 'uiIdleTicks >= 2'), 'tickLoopBody 兜底时序未动');
  assert.ok(has(game, "confirm('放生【'"), '未擅自替换原生 confirm（环境限制，靠签名缓存缓解）');
  assert.ok(has(game, 'needG'), '核心成长指数仍在（数值未改）');
});

/* ---------- 四、回归资产同步升级 ---------- */

test('verify.js 寄售断言由硬编码 30 升级为「与 _sellPrice 同源」精确校验', () => {
  assert.ok(has(verifySrc, "L('itemSellDyn', XX._sellPrice('mat_core'));"), '冻结打开详情那一刻的动态价');
  assert.ok(has(verifySrc, 'Number(F.itemSellDyn)'));
  assert.ok(absent(verifySrc, 'ok(/30/.test(F.itemSellTxt)'), '旧的硬编码断言已移除（未删除断言，改为更强校验）');
});
