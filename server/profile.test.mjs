/* server/profile.test.mjs —— grantRun 输入边界专项（第 134 轮，补 ChatGPT #63 意见②）
 *
 * 纯函数单测：真 import profile.mjs，不启服务器。
 * 覆盖：正常推进 / Infinity 拒绝 / 层数钳制且修为-轴一致 / 非法道途回落 / 负数与 NaN。
 * 运行：node --test server/profile.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { grantRun, createProfile } from './profile.mjs';

/* 与 server.mjs 同源的钳制常量（rankStep 用 profile.mjs 默认值 8000） */
const CFG = {
  need: [800, 1600, 3200, 6400, 12800],
  maxLayers: 5,
  rankCap: 25,
  enhanceMax: 20, equipCap: 4500, affixCap: 22, danCap: 0.55, wuCap: 52, artBgCap: 0.56,
  rankStep: 8000
};

test('grantRun 正常推进：层数/修为/轴投入一致', () => {
  const p = createProfile('t');
  grantRun(p, 3, 100, CFG, 'sword');
  assert.equal(p.layersCleared, 3);
  assert.equal(p.cultivation, 800 + 1600 + 3200, '修为 = 前三层门槛之和');
  assert.equal(p.weaponLv, 2 * 3, '剑修轴按层数增长');
  assert.equal(p.stones, 100);
  assert.equal(p.runs, 1);
});

test('grantRun 必须拒绝 Infinity（层数/灵石）', () => {
  const p = createProfile('t');
  grantRun(p, Infinity, Infinity, CFG, 'sword');
  assert.equal(p.layersCleared, 0, 'Infinity 层数必须当 0');
  assert.equal(p.cultivation, 0);
  assert.equal(p.stones, 0, 'Infinity 灵石必须当 0');
  assert.equal(p.runs, 0, '未推进不得计局');
});

test('grantRun 层数超过上限必须钳制，且修为层数与轴层数一致', () => {
  const p = createProfile('t');
  grantRun(p, 999, 50, CFG, 'body');   // maxLayers=5
  assert.equal(p.layersCleared, 5, '层数必须钳制到 maxLayers');
  assert.equal(p.cultivation, 800 + 1600 + 3200 + 6400 + 12800, '修为只算到上限层');
  assert.equal(p.equipPower, 45 * 5, '轴投入与钳制后层数一致（不越界）');
});

test('grantRun 非法 pathId 回落剑修（不越界、不报错）', () => {
  const p = createProfile('t');
  grantRun(p, 2, 0, CFG, 'hacked_path');
  assert.equal(p.layersCleared, 2);
  assert.equal(p.weaponLv, 2 * 2, '回落剑修轴');
  assert.equal(p.equipPower, 0, '别的轴不得被污染');
});

test('grantRun 负数/NaN 层数视为 0', () => {
  const p = createProfile('t');
  grantRun(p, -5, 0, CFG, 'sword');
  assert.equal(p.layersCleared, 0);
  assert.equal(p.cultivation, 0);
  grantRun(p, NaN, 0, CFG, 'sword');
  assert.equal(p.layersCleared, 0, 'NaN 层数必须当 0');
});
