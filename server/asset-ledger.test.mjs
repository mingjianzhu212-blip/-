/* server/asset-ledger.test.mjs —— K11 服务端资产账本基础骨架（第 134 轮）
 *
 * 验证：注册/查询/锁定/原子转移/幂等/越界拒绝。
 * 注：本账本只提供能力，不暴露真实跨玩家交易接口（与 K11 采纳决策一致）。
 * 运行：node --test server/asset-ledger.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { AssetLedger, STATUS } from './asset-ledger.mjs';

test('register 后 query 可见，且历史记录登记', () => {
  const L = new AssetLedger();
  const r = L.register('sword-1', 'tokA', 3);
  assert.equal(r.ownerToken, 'tokA');
  assert.equal(r.qty, 3);
  assert.equal(r.status, STATUS.IDLE);
  const q = L.query('sword-1');
  assert.equal(q.qty, 3);
  assert.equal(q.history.length, 1);
});

test('lock/unlock 只能持有人操作，且锁定期间不可转移', () => {
  const L = new AssetLedger();
  L.register('sword-1', 'tokA', 1);
  assert.throws(() => L.lock('sword-1', 'tokB'), /持有人/);
  L.lock('sword-1', 'tokA');
  assert.equal(L.query('sword-1').locked, true);
  assert.throws(() => L.transfer('sword-1', 'tokA', 'tokB', 1, 'idem-1'), /锁定/);
  L.unlock('sword-1', 'tokA');
  assert.equal(L.query('sword-1').locked, false);
});

test('transfer 原子转移 + 数量/归属校验', () => {
  const L = new AssetLedger();
  L.register('sword-1', 'tokA', 5);
  const { replayed, result } = L.transfer('sword-1', 'tokA', 'tokB', 2, 'idem-2');
  assert.equal(replayed, false);
  assert.equal(result.ownerToken, 'tokB');
  assert.equal(result.qty, 3);
  assert.throws(() => L.transfer('sword-1', 'tokB', 'tokA', 99, 'idem-3'), /数量不足/);
  assert.throws(() => L.transfer('sword-1', 'tokA', 'tokC', 1, 'idem-4'), /不属于转出方/);
});

test('transfer 幂等：相同幂等 ID 只生效一次', () => {
  const L = new AssetLedger();
  L.register('sword-1', 'tokA', 5);
  const r1 = L.transfer('sword-1', 'tokA', 'tokB', 2, 'idem-x');
  const r2 = L.transfer('sword-1', 'tokA', 'tokB', 2, 'idem-x');
  assert.equal(r1.replayed, false);
  assert.equal(r2.replayed, true, '相同幂等 ID 必须判为重放');
  assert.equal(r2.result.ownerToken, 'tokB');
  assert.equal(L.query('sword-1').qty, 3, '只扣一次');
});

test('register 重复 itemId / 非法参数必须拒绝', () => {
  const L = new AssetLedger();
  L.register('sword-1', 'tokA', 1);
  assert.throws(() => L.register('sword-1', 'tokA', 1), /已存在/);
  assert.throws(() => L.register('', 'tokA', 1), /itemId/);
  assert.throws(() => L.register('sword-2', 'tokA', 0), /数量/);
});
