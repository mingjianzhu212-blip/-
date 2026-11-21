/* server/k11-trade.mjs —— K11 真实跨玩家交易编排（首轮 MVP · 2026-11-11 · 修正批次 v2）
 *
 * 修正依据：ChatGPT 独立审查裁定（chatgpt_k11_verdict_clean_20261111.md，CONDITIONAL→暂不通过，需修正后复审）
 *   P0-1 公开 DTO：任何 HTTP 响应都不暴露 sellerToken / buyerToken 等身份凭证。
 *   P0-2 交易一致性：buy() 引入 OPEN→PROCESSING→CLOSED 状态机，不可逆的物品转移放在最后，
 *        任何灵石结算异常都经补偿回滚到一致态，杜绝"物品已转、灵石未结"的免费物品窗口。
 *   P0-3 退款/恢复：补偿链 + failed 状态，失败交易要么完全回滚可重试，要么进入需人工介入的 failed。
 *   P0-4 幂等绑定身份：幂等键 = 操作类型 + buyerToken + listingId + 客户 idempotencyId，
 *        同键同请求才重放，同键不同请求各自独立成交（不串结果）。
 *   P1-1 严格整数校验：价格/数量必须为正整数，拒绝小数/负数/非有限值（避免账目不守恒）。
 *   P1-2 数量不超额：挂单数量不得超过持有数量。
 *   P1-3 容量控制：挂单总数、在售挂单数、幂等记录数均设上限并裁剪，长期运行不无限积累。
 *
 * 不修改 asset-ledger.mjs 语义、不修改 #64 已签代码；纯内存态（重启清空）不变。
 *
 * wallet 接口（由 server 注入，封装 profiles.addStones）：
 *   balance(token) -> number
 *   debit(token, amt)  // 扣付，余额不足抛错
 *   credit(token, amt) // 入账
 */

import { AssetLedger, STATUS } from './asset-ledger.mjs';

/* 容量上限（纯内存态，必须有界，避免长期运行无限积累） */
const MAX_LISTINGS = 1000;        // 挂单总容量（含已关闭/已撤/已失败）—— 严格 ≤ 上限
const MAX_ACTIVE_LISTINGS = 500;  // 同时在售(open)挂单上限（超过则拒挂，引导先成交/撤单）
const MAX_IDEM = 5000;            // 幂等记录容量（真实 LRU 裁剪）

/* —— 公开 DTO：一律不携带任何身份凭证 —— */
export function publicListing(L) {
  return {
    listingId: L.listingId,
    itemId: L.itemId,
    price: L.price,
    qty: L.qty,
    status: L.status
  };
}

export function publicBuyResult(out) {
  if (!out) return null;
  return {
    listingId: out.listingId,
    itemId: out.itemId,
    price: out.price,
    qty: out.qty,
    // 只暴露物品转移后的客观状态，绝不带 ownerToken / history
    transfer: out.transfer ? {
      itemId: out.transfer.itemId,
      qty: out.transfer.qty,
      status: out.transfer.status
    } : null
  };
}

export class TradeDesk {
  constructor(ledger, wallet) {
    if (!(ledger instanceof AssetLedger)) throw new Error('TradeDesk 需要 AssetLedger 实例');
    if (!wallet || typeof wallet.balance !== 'function') throw new Error('TradeDesk 需要 wallet');
    this.ledger = ledger;
    this.wallet = wallet;
    /** listingId -> { listingId, itemId, sellerToken, price, qty, status, failReason?, failAudit? } */
    this._listings = new Map(); // 保留插入顺序，便于容量裁剪
    /** 幂等键 -> 结果（真实 LRU：访问即移到末尾，超出回收最旧） */
    this._idem = new Map();
    this._seq = 0;
    this._attemptSeq = 0;
  }

  _newId() {
    return 'L' + (++this._seq).toString(36) + '-' + Date.now().toString(36);
  }

  /* 容量裁剪：在售超限则标记 overActive；总容量超限前先回收最旧的非在售记录，
     确保新增后总数严格 ≤ MAX_LISTINGS（避免 > 导致的 off-by-one 越界）。 */
  _prune() {
    let openCount = 0;
    for (const L of this._listings.values()) if (L.status === 'open') openCount++;
    if (openCount >= MAX_ACTIVE_LISTINGS) return { overActive: true };
    if (this._listings.size >= MAX_LISTINGS) {
      for (const [id, L] of this._listings) {
        if (L.status !== 'open' && L.status !== 'processing') {
          this._listings.delete(id);
          if (this._listings.size < MAX_LISTINGS) break;
        }
      }
      if (this._listings.size >= MAX_LISTINGS) return { overActive: false, full: true };
    }
    return { overActive: false };
  }

  /* 真实 LRU：访问即移到末尾；超出上限回收最旧（队首）记录 */
  _idemGet(key) {
    if (!this._idem.has(key)) return undefined;
    const v = this._idem.get(key);
    this._idem.delete(key);
    this._idem.set(key, v);
    return v;
  }

  _idemAdd(key, result) {
    if (this._idem.has(key)) this._idem.delete(key);
    this._idem.set(key, result);
    while (this._idem.size > MAX_IDEM) {
      const first = this._idem.keys().next().value;
      if (first === undefined) break;
      this._idem.delete(first);
    }
  }

  /* 挂单：严格 JSON 数字类型 + 正整数校验 + 数量不超额 + 容量控制；成功即 lock 物品 → LISTED。 */
  consign(itemId, sellerToken, price, qty = 1) {
    // P1-1 严格类型：拒绝字符串/小数/负数/0/非有限值（避免账目不守恒）
    if (typeof price !== 'number' || !Number.isInteger(price) || price <= 0)
      throw new Error('价格必须为正整数');
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1)
      throw new Error('数量必须为正整数');
    const item = this.ledger.query(itemId);
    if (!item) throw new Error('物品不存在');
    if (item.ownerToken !== sellerToken) throw new Error('只有持有人能挂单');
    if (item.status !== STATUS.IDLE) throw new Error('物品不空闲，无法挂单');
    if (qty > item.qty) throw new Error('挂单数量超过持有数量');
    const prune = this._prune();
    if (prune.overActive) throw new Error('在售挂单已达上限');
    if (prune.full) throw new Error('挂单市场已满');
    this.ledger.lock(itemId, sellerToken); // → LISTED
    const id = this._newId();
    const rec = { listingId: id, itemId, sellerToken, price: price, qty: qty, status: 'open' };
    this._listings.set(id, rec);
    return { ...rec };
  }

  /* 购买：状态机 + 补偿回滚；任何异常都不产生"免费物品"或"灵石凭空消失"。
     不可逆的物品转移放在灵石结算之后，确保只有全部可回滚步骤成功后才真正易主。
     补偿一致性（P0-3）：每一项补偿独立记录成功/失败；只有"全部资金回到交易前状态"
     且"物品恢复归卖家"同时成立，才允许挂单回到 open 可重试；否则进入 failed 待人工，
     绝不允许在资金未恢复一致时重新开放挂单（否则卖家可能凭空得利并二次出售）。 */
  buy(listingId, buyerToken, idempotencyId) {
    if (typeof idempotencyId !== 'string' || !idempotencyId) throw new Error('幂等 ID 必填');
    if (idempotencyId.length > 256) throw new Error('幂等 ID 过长');
    // P0-4：幂等键绑定操作类型 + 买家 + 挂单 + 客户幂等 ID（同键同请求才重放）
    const idemKey = 'k11-buy:' + buyerToken + ':' + listingId + ':' + idempotencyId;
    const cached = this._idemGet(idemKey);
    if (cached !== undefined) return { replayed: true, result: cached };
    const L = this._listings.get(listingId);
    if (!L) throw new Error('挂单不存在');
    if (L.status === 'failed') throw new Error('挂单已失败，需人工处理');
    if (L.status !== 'open') throw new Error('挂单不可购买');
    if (L.sellerToken === buyerToken) throw new Error('不能购买自己的挂单');

    // 交易前余额快照（用于事后一致性判定）
    const buyerBefore = this.wallet.balance(buyerToken);
    const sellerBefore = this.wallet.balance(L.sellerToken);
    if (buyerBefore < L.price) throw new Error('灵石不足');

    // —— 进入处理中（P0-2 状态机）——
    L.status = 'processing';
    const undos = [];
    try {
      // 先登记"可安全补偿"的撤销（带余额守卫：仅当余额确已变动才执行反向操作，
      // 因此即使某步"先改余额后抛错"也能正确回滚，且未改时不会反向误扣）
      undos.push(() => { if (this.wallet.balance(buyerToken) !== buyerBefore) this.wallet.credit(buyerToken, L.price); });
      this.wallet.debit(buyerToken, L.price);

      undos.push(() => { if (this.wallet.balance(L.sellerToken) !== sellerBefore) this.wallet.debit(L.sellerToken, L.price); });
      this.wallet.credit(L.sellerToken, L.price);

      // 最后做不可逆的物品转移；成功后即提交，之后无可能失败步骤
      this.ledger.unlock(L.itemId, L.sellerToken); // 解除 LISTED 锁
      const ledgerKey = idemKey + '#' + (++this._attemptSeq); // 每次尝试唯一账本幂等键
      const { result: transfer } = this.ledger.transfer(
        L.itemId, L.sellerToken, buyerToken, L.qty, ledgerKey
      );
      // —— 提交 ——
      L.status = 'closed';
      const out = {
        listingId, itemId: L.itemId, buyerToken, sellerToken: L.sellerToken,
        price: L.price, qty: L.qty, transfer
      };
      this._idemAdd(idemKey, out);
      return { replayed: false, result: out };
    } catch (e) {
      // 逆序执行补偿，逐项记录成功/失败
      const undoResults = [];
      let allUndosOk = true;
      for (let i = undos.length - 1; i >= 0; i--) {
        try { undos[i](); undoResults[i] = true; }
        catch { undoResults[i] = false; allUndosOk = false; }
      }
      // 物品恢复：失败前若仍锁定在卖家名下(LISTED)即视为已恢复；
      // 若已 unlock 为 IDLE 则重新锁定回 LISTED；二者均须 owner 仍是卖家
      let itemRestored = false;
      try {
        const it = this.ledger.query(L.itemId);
        if (it && it.ownerToken === L.sellerToken && it.status === STATUS.LISTED) {
          itemRestored = true; // 仍锁定在卖家名下，可直接重试
        } else if (it && it.ownerToken === L.sellerToken && it.status === STATUS.IDLE) {
          this.ledger.lock(L.itemId, L.sellerToken);
          const it2 = this.ledger.query(L.itemId);
          itemRestored = !!(it2 && it2.ownerToken === L.sellerToken && it2.status === STATUS.LISTED);
        }
      } catch { itemRestored = false; }
      // 一致性判定：资金与物品必须同时恢复，才允许 reopen；否则进入 failed
      const buyerNow = this.wallet.balance(buyerToken);
      const sellerNow = this.wallet.balance(L.sellerToken);
      const fundsRestored = allUndosOk && buyerNow === buyerBefore && sellerNow === sellerBefore;
      const canReopen = itemRestored && fundsRestored;
      L.status = canReopen ? 'open' : 'failed';
      if (!canReopen) {
        // failed 必须携带可审计信息，供人工核账，且绝不重新开放
        L.failReason = (e && e.message) || String(e);
        L.failAudit = {
          allUndosOk, undoResults,
          buyerBefore, sellerBefore, buyerNow, sellerNow,
          itemRestored
        };
      }
      throw e;
    }
  }

  /* 撤单：未成交前持有人可撤，物品 unlock 回 IDLE。 */
  cancel(listingId, token) {
    const L = this._listings.get(listingId);
    if (!L) throw new Error('挂单不存在');
    if (L.status !== 'open') throw new Error('挂单不可撤');
    if (L.sellerToken !== token) throw new Error('只有挂单方能撤单');
    this.ledger.unlock(L.itemId, L.sellerToken); // → IDLE
    L.status = 'cancelled';
    return { ...L };
  }

  /* 在售挂单列表（仅 open）。注意：返回内部记录（含 sellerToken）仅供单测/内部逻辑；
     经 HTTP 输出时必须经 publicListing() 过滤。 */
  listings() {
    return [...this._listings.values()].filter(l => l.status === 'open').map(l => ({ ...l }));
  }
}

export { STATUS };
