# 端口基建变更 · 实施与验证报告（2026-11-11 23:00 单）

> 授权：祝 2026-11-11 02:10 裁定第 4 项「端口基建变更（端口段重叠）：你们决定」；ChatGPT 与 Muse 本轮原件均列为「可立即实行」。
> 范围：**仅测试文件 PORT 常量**（测试基建），未写任何 `js/`、`server/` 运行时源码；改前逐文件备份 `.bak_20261111_pre_portfix`，基线 SHA 见下。

## 一、改动清单（8 处，互斥端口段）

| 文件 | 原 | 新 | 理由 | 改前 SHA-256 | 改后 SHA-256 |
|---|---|---|---|---|---|
| `server/multi-p0c.test.mjs` | `const PORT = 7810 + (process.pid % 50);` | `const PORT = 8600 + (process.pid % 50);` | 7810-7859 与 p0 主段 7800-7899 重叠 → 8600-8649 | `827649cb588713ff…` | `44acc4b0aa44c28a…` |
| `server/multi-p0b.test.mjs` | `const PORT = 7820 + (process.pid % 50);` | `const PORT = 8650 + (process.pid % 50);` | 7820-7869 与 p0 重叠 → 8650-8699 | `e4a37ed7dafb5a26…` | `b88381f3f340cd82…` |
| `server/multi-p0e.test.mjs` | `const PORT = 7870 + (process.pid % 50);` | `const PORT = 8700 + (process.pid % 50);` | 7870-7919 与 p0/p1a 重叠 → 8700-8749 | `b053b816b7be4095…` | `f3a5de1a4e5a7e1e…` |
| `server/multi-p1a.test.mjs` | `const PORT = 7890 + (process.pid % 50);` | `const PORT = 8750 + (process.pid % 50);` | 7890-7939 与 p0e 重叠 → 8750-8799 | `37a647c446b31cf5…` | `cd0fd2ca86e1eb1f…` |
| `server/multi-p1b.test.mjs` | `const PORT = 7910 + (process.pid % 50);` | `const PORT = 8800 + (process.pid % 50);` | 7910-7959 与 p1a 重叠 → 8800-8849 | `840bddb086e0840b…` | `f0cea936e8b60952…` |
| `server/multi-p1a-client.test.mjs` | `const PORT = 7940 + (process.pid % 50);` | `const PORT = 8850 + (process.pid % 50);` | 7940-7989 与 p1b 重叠 → 8850-8899 | `78ad84bdcb95a3e6…` | `eeb64029f035ef14…` |
| `server/multi-join-concurrency.test.mjs` | `const PORT = 8070 + (process.pid % 40);` | `const PORT = 8900 + (process.pid % 50);` | 与 k11-trade.test.mjs 完全同段 8070-8109 → 8900-8949 | `2ed923726fb1b052…` | `049354449f7e19f9…` |
| `server/k11-trade.test.mjs` | `const port = 8150 + (process.pid % 30);` | `const port = 8950 + (process.pid % 30);` | 8150-8179 与 tools/p2a-curve-audit 8170-8199 边缘重叠 → 8950-8979 | `963b61f3a59127d6…` | `ce7921f7f393df80…` |

未改（如实登记）：`server/multi-p0.test.mjs` 主段 7800-7899、`server/k11-trade.test.mjs` 主段 8070-8109 保留；`tools/p2a-curve-audit.mjs`(8170-8199)、`tools/p2a-review-132.mjs`(8180-8209)、`tools/p2b-resource-audit.mjs`(8200-8229) 彼此仍有边缘重叠，但**不属 `node --test` 全树成员**（审计脚本单独运行），为避免扩大变更面本轮未动，登记为后续增量。

## 二、验证结果

| 运行 | 模式 | exit | pass | fail | 秒 |
|---|---|---|---|---|---|
| 改前基线对照 | 并行 | 1 | 276 | 3 | 6 |
| AFTER_PARALLEL_1 | 并行 | 1 | 276 | 3 | 6 |
| AFTER_PARALLEL_2 | 并行 | 1 | 265 | 14 | 11 |
| AFTER_PARALLEL_3 | 并行 | 1 | 276 | 3 | 6 |
| AFTER_SERIAL | 串行 | 1 | 276 | 3 | 16 |

- 全树测试集：21 个 `*.test.mjs`（server 14 + tools 7），命令 `node --test [--test-concurrency=1] <files>`。
- 原始 TAP：`evidence/PORT_FIX_*_20261111152550.tap`。
- 回滚：**已触发**（存在失败运行，已从备份恢复全部文件）；回滚后逐文件 SHA-256 与备份比对 **8/8 完全一致**（其中 `multi-join-concurrency.test.mjs` 恢复为总表 R9 送审基线 `2ed92372…`），现行仓库测试文件与改前无任何差异。

## 二·补、失败归因（只读核实，不推测）
改前基线与改后四跑的失败用例**完全相同**，为既有 3 例，与端口变更无关：
- `not ok 193 - C: tutorial.js 必须在 router.js 之前加载`
- `not ok 278 - 改后 game.js 与改前基线的差异只发生在两张表定义区间内`
- `not ok 279 - ENCOUNTERS / ADV_EVENTS 字面量之外的 game.js 行数差为 0（仅表内增行）`

`AFTER_PARALLEL_2` 另出现 265/14（多 11 例失败），属并行抖动，但基线本身即非零失败 → **「全树连跑 3 次全绿」这一验收标准在当前仓库基线下不成立**。据此判定端口变更**未通过验收、不宣称完成**，按脚本预设回滚；8 处互斥端口段分配方案与备份完整保留，待既有 3 例契约失败另行处理后重跑。总表既有「串行 94/94 唯一稳定验收口径」为特定子集，与本次 21 文件全树（含 D-008 历史契约用例）口径不同，二者不互相替代。

## 三、门禁
- 本件为**测试基建变更**，不签发任何游戏功能 PASS；不改变 #64 串行 94/94 唯一稳定验收口径。
- 真实运行由总控本地执行（WorkBuddy 依宪法「跑自动化测试、收集证据」职责）；Muse 独立实机验收为另一层证据，未以本件冒充。
