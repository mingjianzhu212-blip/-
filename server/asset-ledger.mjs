/* server/asset-ledger.mjs —— K11 服务端资产账本（基础骨架 · 第 134 轮）
 *
 * 背景：ChatGPT #63 独立审查对"固定价寄售（K11）"给出明确取舍意见——
 *   "当前不建议把固定价寄售接入正式联机资产交易；可以先做单机或纯展示原型，
 *    联机交易应等服务端资产账本具备后再开放。"
 * 理由：服务器目前没有背包／物品表，联机 P2 只结算灵石，物品并不跨玩家流通；
 *   若做成真实玩家间交易，服务器无法独立证明卖家确实持有该物品、也无法证明同一件物品没被重复出售。
 *
 * 本模块即 ChatGPT 建议的"先建立服务端资产账本"基础骨架：
 *   · 物品唯一标识、持有人、数量、锁定状态、交易状态、可追溯流水；
 *   · 转移必须原子化（上架锁物品 → 扣款/转移在一个操作中完成 → 更新订单状态，失败回滚）；
 *   · 每笔操作携带幂等 ID，重复请求/断线重投/快速连点都不能重复转移。
 *
 * 重要边界（与 K11 采纳决策一致）：
 *   **本模块只提供账本能力，不暴露任何真实跨玩家交易接口**（无 POST /api/consign 之类）。
 *   真实寄售 UI/交易须在本账本之上、并经后续四方裁定后再开放。
 *   模块为纯内存态（服务器重启即清空），持久化是 P2 后续切片。
 */

const STATUS = { IDLE: 'idle', LISTED: 'listed', TRADED: 'traded' };

export class AssetLedger {
  constructor() {
    /** itemId -> { itemId, ownerToken, qty, locked, status, history } */
    this.items = new Map();
    /** 已处理过的幂等 ID（防重复转移） */
    this._idem = new Set();
  }

  /* 注册一件物品归 ownerToken 所有（数量 qty ≥ 1）。返回账本记录。 */
  register(itemId, ownerToken, qty) {
    if (typeof itemId !== 'string' || !itemId) throw new Error('itemId 必须非空字符串');
    if (typeof ownerToken !== 'string' || !ownerToken) throw new Error('ownerToken 必须非空字符串');
    const q = Math.max(0, Math.floor(qty || 0));
    if (q < 1) throw new Error('数量必须 ≥ 1');
    if (this.items.has(itemId)) throw new Error('itemId 已存在，不能重复注册');
    const rec = {
      itemId,
      ownerToken,
      qty: q,
      locked: false,
      status: STATUS.IDLE,
      history: [{ op: 'register', ownerToken, qty: q, at: Date.now() }]
    };
    this.items.set(itemId, rec);
    return rec;
  }

  query(itemId) {
    const r = this.items.get(itemId);
    return r ? { ...r, history: r.history.slice() } : null;
  }

  /* 上架锁定（寄售前置）：只有持有人本人能锁，且物品必须空闲。 */
  lock(itemId, ownerToken) {
    const r = this.items.get(itemId);
    if (!r) throw new Error('物品不存在');
    if (r.ownerToken !== ownerToken) throw new Error('只有持有人能锁定');
    if (r.status !== STATUS.IDLE) throw new Error('物品不在空闲态，无法锁定');
    r.locked = true;
    r.status = STATUS.LISTED;
    r.history.push({ op: 'lock', ownerToken, at: Date.now() });
    return { ...r, history: r.history.slice() };
  }

  unlock(itemId, ownerToken) {
    const r = this.items.get(itemId);
    if (!r) throw new Error('物品不存在');
    if (r.ownerToken !== ownerToken) throw new Error('只有持有人能解锁');
    if (!r.locked) return { ...r, history: r.history.slice() };
    r.locked = false;
    r.status = STATUS.IDLE;
    r.history.push({ op: 'unlock', ownerToken, at: Date.now() });
    return { ...r, history: r.history.slice() };
  }

  /* 原子转移（购买）：从一个持有人转移到另一个，带幂等 ID。
     - 幂等：相同 idempotencyId 重复调用只生效一次（返回首次的结果，replayed=true）。
     - 校验：物品存在、未锁定、归属 fromToken、数量充足。
     - 原子性：扣减与归属变更在同一步完成；任何校验失败都整体不改动账本。 */
  transfer(itemId, fromToken, toToken, qty, idempotencyId) {
    if (typeof idempotencyId !== 'string' || !idempotencyId) throw new Error('幂等 ID 必填');
    if (this._idem.has(idempotencyId)) {
      const prev = this._idemResults?.get(idempotencyId) || null;
      return { replayed: true, result: prev };
    }
    const r = this.items.get(itemId);
    if (!r) throw new Error('物品不存在');
    if (r.locked) throw new Error('物品已锁定，无法转移');
    if (r.ownerToken !== fromToken) throw new Error('物品不属于转出方');
    const q = Math.max(0, Math.floor(qty || 0));
    if (q < 1) throw new Error('转移数量必须 ≥ 1');
    if (r.qty < q) throw new Error('数量不足');
    if (typeof toToken !== 'string' || !toToken) throw new Error('接收方 token 必填');

    // —— 原子段开始（无中间失败点）——
    const nowAt = Date.now();
    let result;
    if (q === r.qty) {
      r.ownerToken = toToken;
      r.locked = false;
      r.status = STATUS.IDLE;
      r.history.push({ op: 'transfer', from: fromToken, to: toToken, qty: q, at: nowAt });
      result = { ...r, history: r.history.slice() };
    } else {
      r.qty -= q;
      r.history.push({ op: 'transfer_out', from: fromToken, to: toToken, qty: q, remain: r.qty, at: nowAt });
      const subId = itemId + '#' + (this._splitSeq = (this._splitSeq || 0) + 1);
      const child = {
        itemId: subId,
        parentItemId: itemId,
        ownerToken: toToken,
        qty: q,
        locked: false,
        status: STATUS.IDLE,
        history: [{ op: 'transfer_in', from: fromToken, to: toToken, qty: q, sourceItemId: itemId, at: nowAt }]
      };
      this.items.set(subId, child);
      result = { ...child, history: child.history.slice() };
    }
    // —— 原子段结束 ——

    this._idem.add(idempotencyId);
    if (!this._idemResults) this._idemResults = new Map();
    this._idemResults.set(idempotencyId, result);
    return { replayed: false, result };
  }

  history(itemId) {
    const r = this.items.get(itemId);
    return r ? r.history.slice() : [];
  }
}

export { STATUS };
