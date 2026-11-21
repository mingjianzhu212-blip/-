# K11 真实跨玩家交易 · 设计三件套（只读层 · 零代码写入）· 2026-11-11 23:00 单

> 依据两方真实原件：ChatGPT `freediscuss_chatgpt_reply_20261111150556.md`（优先级第二位：「应先完成真实交易生命周期设计、资产一致性、幂等及并发安全审查，而不是直接把现有 ledger 骨架当成可用交易系统」）；Muse `freediscuss_muse_reply_raw_20261111.md`（「K11 设计三件套：状态迁移图、资产守恒不变量断言清单、四类并发/掉线场景预期终态」）。
>
> **现状纠正（重要）**：任务单第二节第 6 条沿用 02:10 总表口径称「骨架 `asset-ledger.mjs`，无真实跨玩家交易接口」。本轮只读核实发现 `server/k11-trade.mjs` **已存在**（11,705 字节，2026-11-11 13:19），导出 `TradeDesk`（`consign` / `buy` / `cancel` / `listings`），`server/k11-trade.test.mjs` 含 **21 个用例**（含 HTTP 路由接线、幂等、补偿回滚）。故本件按**现行实现**做设计层核验，不按「从零设计」写，亦不改任何代码。

## 一、状态迁移图（据 `k11-trade.mjs` 实读）

```
物品：STATUS.IDLE ──consign()/lock()──> STATUS.LISTED ──buy()/unlock()+transfer()──> STATUS.TRADED(qty=0)
        ▲                                    │                                          │
        └──────── cancel()/unlock() ─────────┘                                          │
                                              │                                       │
挂单： (不存在) ──consign()──> open ──buy()──> processing ──成功──> closed            │
                                │                │                                    │
                                │                └──异常 + 资金/物品完全恢复──> open（可重试）
                                │                └──异常 + 任一未恢复──────> failed（人工核账，绝不重开）
                                └──cancel()──> cancelled
```
- `buy()` 顺序：`processing` → 买家 `debit` → 卖家 `credit` → `unlock` → `ledger.transfer()`（不可逆步骤放最后）→ `closed` + 幂等记录。
- 幂等键 `k11-buy:<buyerToken>:<listingId>:<idempotencyId>`（P0-4 绑定操作类型+买家+挂单+客户键），账本键再附 `#attemptSeq` 保证每次尝试唯一。
- 容量上限：`MAX_LISTINGS=1000`、`MAX_ACTIVE_LISTINGS=500`、`MAX_IDEM=5000`（LRU 裁剪）。

## 二、资产守恒不变量断言清单（供实施轮/独立审查核，不冒充已验证）
| # | 不变量 | 现行代码依据 |
|---|---|---|
| 1 | 任一时刻 `buyer.balance + seller.balance` 变化量 = 0（无灵石凭空增减） | `buy()` 的 undos 余额守卫（补偿前先比对 before） |
| 2 | 任一时刻物品 `qty` 与 `ownerToken` 的组合守恒，不出现「一份物品两个主人」 | `transfer()` 原子段（97-101） |
| 3 | 幂等重放返回首次结果且不重复扣款/转移 | `_idemGet` / `ledger._idem` |
| 4 | 异常处理后 `open` 仅当 `itemRestored && fundsRestored` 同时成立 | `buy()` catch 段 `canReopen` |
| 5 | `failed` 携带 `failReason` + `failAudit`（前后余额、undo 结果、物品恢复标志），且永不被重新开放 | catch 段末 |
| 6 | 撤单仅 `open` 且仅挂单方，物品回 `IDLE` | `cancel()` 223-233 |
| 7 | HTTP 输出经 `publicListing()`/`publicBuyResult()` 过滤，不泄露 `sellerToken` | 30/40 行 + `listings()` 注释明示 |
| 8 | 挂单/幂等容量不越上限 | `_prune()` + 三个 MAX 常量 |
| 9 | 价格与数量严格正整数（拒字符串/小数/负数/0/非有限值） | `consign()` 112-118 |

## 三、四类并发／掉线场景预期终态（设计层预期，未实测）
| 场景 | 预期终态 | 依据 |
|---|---|---|
| 同一买家重复提交同一 `idempotencyId` | 第二次 `replayed:true` 返回首次 `result`，余额与账本各只变一次 | `_idemGet` 缓存 |
| 不同买家同时买同一 `open` 挂单 | 单线程 JS 下先到者 `closed`；后到者撞 `L.status!=='open'` 抛「挂单不可购买」，无双卖 | `buy()` 状态机前置校验 |
| 买家扣款后、物品转移前掉线／抛错 | 补偿逆序回滚；资金与物品均恢复 → `open`；任一未恢复 → `failed` + 审计，绝不重开 | `buy()` catch（K11-13 用例） |
| 服务重启／SSE 断开后客户端重连 | HTTP 层 `_idem` 与账本状态由服务器进程持有；**当前实现未核实持久化**，预期为进程内状态，重启后挂单/幂等记录丢失，需在设计层标注为风险而非断言可用 | 只读核实：`TradeDesk` 构造用 `Map`，未见落盘 |

## 四、一处初判的撤销（如实登记，避免误报）
初读 `server/asset-ledger.mjs:97-100`（`r.qty -= q; r.ownerToken = toToken;`）时，曾疑为「部分转移时剩余数量所有权被错误转给接收方」。经查 `server/k11-trade.test.mjs:277` 存在明确用例 **「K11-15 部分数量出售：挂 3/10，买 3 后整栈归属买家、剩余 7 归买家持有」**（断言 `it.qty === 7`），且注释标注 `R4 / P1-2：部分数量出售的真实归属` → **该行为为既定设计并有测试覆盖，撤销缺陷疑点，不作问题上报**。本件不冒充独立审查结论。

## 五、边界声明
- 本件为**只读设计层产出**：未改任何 `server/`、`js/` 源码；未实跑 K11 21 用例；未做真实并发/掉线实测；未核验 HTTP 路由全量行为。
- 本件**不签发**：K11 实施 PASS、交易安全 PASS、并发验收 PASS。
- 两方原件一致：K11 接口代码实施属红线①，本轮止步于设计层。第三节「服务重启持久化」为**待验证风险**，不写成已确认缺陷。
