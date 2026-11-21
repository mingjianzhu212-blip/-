# 端口基建变更 · 执行与回归验证报告（2026-11-12 通宵单 · 队列 2）

> 授权：祝《通宵开发计划与授权令·2026-11-12》队列 2「此前已授权，今夜执行完毕并做回归验证，消除并行抖动对回归口径的污染」。
> 验收口径（两方真实原件，综合取严）：ChatGPT `OVERNIGHT_CHATGPT_ORIGINAL_20261112.md` §3（三轮全树串行稳定为最低验收／不机械要求 0 失败／已知 3 例保持可识别／新增失败 0／无端口冲突、偶发超时、进程残留）；Muse `OVERNIGHT_MUSE_ORIGINAL_20261112.md` §Q3（改前冻结串行基线＋具名清单／改后逐项一致／并行≥5 次完全一致／EADDRINUSE=0／确定性映射禁用 pid 派生重叠段／既有 3 例不顺手修）。
> 范围：**仅测试文件 PORT 常量**（测试基建），零 `js/`、`server/` 运行时源码写入；备份 `.bak_20261112_pre_portfix` 用复制、回滚用恢复，**未删除任何文件/数据/存档**。

## 一、上轮抖动真因（只读核实）
上轮 8 处改动后仍出现 `AFTER_PARALLEL_2` 265/14（多 11 例 `D1`–`D11` 失败，`server did not start on 7918`），归属 `server/multi-p0d.test.mjs:77`。上轮**漏改** `multi-p0d` 双端口(7890/7960+pid%40)、`multi-p0` 主段(7800-7899)、`multi-p2a` 三端口(8030/8040/8050+MOD)、`k11-trade` 主段(8070+pid%40)，这些 pid 派生段与 p1a/p1b/p1a-client 原段重叠 → 并行时 EADDRINUSE。本轮全部改为确定性固定端口。

## 二、改动清单（确定性固定端口表 9000-9014，禁用 pid 派生）

| 文件 | 原 | 新 | 固定端口 | 理由 |
|---|---|---|---|---|
| `server/multi-p0.test.mjs` | `const PORT = 7800 + (process.pid % 100);` | `const PORT = 9000;` | 9000 | 主段 7800-7899 与 p0c/p0b/p0e/p1a 全重叠 → 固定 9000 |
| `server/multi-p0b.test.mjs` | `const PORT = 7820 + (process.pid % 50);` | `const PORT = 9001;` | 9001 | 7820-7869 与 p0 主段重叠 → 固定 9001 |
| `server/multi-p0c.test.mjs` | `const PORT = 7810 + (process.pid % 50);` | `const PORT = 9002;` | 9002 | 7810-7859 与 p0 主段重叠 → 固定 9002 |
| `server/multi-p0d.test.mjs` | `const PORT_OFF = 7890 + (process.pid % 40);` | `const PORT_OFF = 9003;` | 9003 | 上轮漏改：7890-7929 与 p1a/p1b/p1a-client 重叠，抖动 D1-D11 真因 → 固定 9003 |
| `server/multi-p0d.test.mjs` | `const PORT_ON = 7960 + (process.pid % 40);` | `const PORT_ON = 9004;` | 9004 | 上轮漏改：7960-7999 与 p1a-client 重叠 → 固定 9004 |
| `server/multi-p0e.test.mjs` | `const PORT = 7870 + (process.pid % 50);` | `const PORT = 9005;` | 9005 | 7870-7919 与 p0/p1a 重叠 → 固定 9005 |
| `server/multi-p1a.test.mjs` | `const PORT = 7890 + (process.pid % 50);` | `const PORT = 9006;` | 9006 | 7890-7939 与 p0d/p0e 重叠 → 固定 9006 |
| `server/multi-p1b.test.mjs` | `const PORT = 7910 + (process.pid % 50);` | `const PORT = 9007;` | 9007 | 7910-7959 与 p0d/p1a 重叠 → 固定 9007 |
| `server/multi-p1a-client.test.mjs` | `const PORT = 7940 + (process.pid % 50);` | `const PORT = 9008;` | 9008 | 7940-7989 与 p1b/p0d 重叠 → 固定 9008 |
| `server/multi-p2a.test.mjs` | `const MOD = process.pid % 40;` | `const MOD = 0;` | — | 上轮漏改：pid 派生 MOD → 固定 0（三端口改绝对固定值） |
| `server/multi-p2a.test.mjs` | `const PORT_ENFORCE = 8030 + MOD;` | `const PORT_ENFORCE = 9009;` | 9009 | 8030-8069 与 p2a 自身 OBSERVE/OFF 及 p2a-consistency 边缘重叠 → 固定 9009 |
| `server/multi-p2a.test.mjs` | `const PORT_OBSERVE = 8040 + MOD;` | `const PORT_OBSERVE = 9010;` | 9010 | 8040-8079 → 固定 9010 |
| `server/multi-p2a.test.mjs` | `const PORT_OFF = 8050 + MOD;` | `const PORT_OFF = 9011;` | 9011 | 8050-8089 与 join/k11 8070 段边缘重叠 → 固定 9011 |
| `server/multi-join-concurrency.test.mjs` | `const PORT = 8070 + (process.pid % 40);` | `const PORT = 9012;` | 9012 | 与 k11-trade 完全同段 8070-8109 → 固定 9012 |
| `server/k11-trade.test.mjs` | `const PORT = 8070 + (process.pid % 40);` | `const PORT = 9013;` | 9013 | 上轮漏改主段：与 join 完全同段 → 固定 9013 |
| `server/k11-trade.test.mjs` | `const port = 8150 + (process.pid % 30);` | `const port = 9014;` | 9014 | 上轮漏改第二 server：8150-8179 与 tools 审计段边缘重叠 → 固定 9014 |

- 全树测试集 21 个 `*.test.mjs`（server 14 + tools 7）；起服务实例 15 个，固定端口 9000-9014 两两不重叠，改前逐端口可绑定预检通过。
- 未改（如实登记）：`tools/*.mjs` 审计脚本与 `ui-accept-*.mjs`（7731/7732、8110-8229）**不属 `node --test` 全树成员**，单独运行，本轮不纳入；`tools/*.test.mjs` 7 个文件 `spawn=0` 不起服务。

## 三、验证结果（改前冻结基线逐项比对）

| 运行 | 模式 | exit | pass | fail | EADDRINUSE/未启动 | 失败集合一致 | 新增失败 | 秒 |
|---|---|---|---|---|---|---|---|---|
| BASE_SERIAL（冻结基线） | 串行 | 1 | 276 | 3 | 0 | 基准 | — | 17 |
| AFTER_SERIAL_1 | 串行 | 1 | 276 | 3 | 0 | ✅ | 0 | 17 |
| AFTER_SERIAL_2 | 串行 | 1 | 276 | 3 | 0 | ✅ | 0 | 17 |
| AFTER_SERIAL_3 | 串行 | 1 | 276 | 3 | 0 | ✅ | 0 | 18 |
| AFTER_PARALLEL_1 | 并行 | 1 | 276 | 3 | 0 | ✅ | 0 | 6 |
| AFTER_PARALLEL_2 | 并行 | 1 | 276 | 3 | 0 | ✅ | 0 | 6 |
| AFTER_PARALLEL_3 | 并行 | 1 | 276 | 3 | 0 | ✅ | 0 | 6 |
| AFTER_PARALLEL_4 | 并行 | 1 | 276 | 3 | 0 | ✅ | 0 | 6 |
| AFTER_PARALLEL_5 | 并行 | 1 | 276 | 3 | 0 | ✅ | 0 | 6 |

- **改前具名既有失败清单（3 例，D-008 契约，与端口无关，按两方口径不在本变更内顺手修）**：
  - `C: tutorial.js 必须在 router.js 之前加载`
  - `改后 game.js 与改前基线的差异只发生在两张表定义区间内`
  - `ENCOUNTERS / ADV_EVENTS 字面量之外的 game.js 行数差为 0（仅表内增行）`
- 门禁不通过运行数：**0**；回滚：**未触发（全部改后运行与基线逐项一致）**。
- 进程/端口残留检查：9000-9014 全部可重新绑定，无残留 ✅。
- 原始 TAP：`evidence/PORT_FIX2_*_20261111170934.tap`。

## 四、门禁
- 本件为**测试基建变更**，不签发任何游戏功能 PASS；不改变 #64 串行 94/94 唯一稳定验收口径。
- 真实运行由总控本地执行；Muse 独立实机验收为另一层证据，未以本件冒充。
- 结论：改后 8 次运行（串行 3＋并行 5）与改前冻结基线逐项一致、EADDRINUSE=0、无新增失败 → 并行抖动对回归口径的污染已消除，变更保留。

## 五、验收后一致性维护（如实登记）
- 验收通过后，发现 `server/k11-trade.test.mjs:434` 端口注释仍写旧段说明「与 before 钩子服务器 8070+pid%40 无重叠」，与改后固定端口 9014 不一致；已将该行注释更新为「确定性端口：与 before 钩子服务器 9013 及全树其它固定端口均不重叠」。
- 性质：**仅注释文字**，不改任何端口常量或测试行为；`node --check` 通过。该行为验收后登记，未重新计入上述 8 次运行（8 次运行时注释为旧文字，不影响代码语义与 TAP 结果）。按纪律如实登记，不隐瞒、不冒充已复跑。

## 六、Muse Q5 附注闭环（2026-11-12 用户裁定后升定案）

### 6.1 Q5① 重新锚定（验收后注释修改的回归确认）
- 触发：Muse Q5 附注①「8 次证据时间点在该注释修改之前，建议下轮顺手补跑一次并行确认重新锚定」。
- 执行：2026-11-12 用户裁定后，按相同命令 `node --test server/*.test.mjs tools/*.test.mjs` 跑一次**并行**回归（仅验证，未再改动任何端口常量）。
- 结果：`pass=276 / fail=3 / EADDRINUSE=0`，失败集合与冻结基线**逐项一致**（仍为 3 例 D-008 契约失败：tutorial.js 加载顺序、两张表区间契约×2），**无新增失败、无端口冲突**。
- 原始 TAP：`evidence/PORT_FIX2_REANCHOR_PARALLEL_20261112.tap`。
- 结论：注释修改（k11-trade.test.mjs:434）不影响代码语义，重新锚定确认污染消除结果稳定成立。

### 6.2 Q5② 常设约束（立为项目端口分配纪律）
- **约束**：此后新增任何 `*.test.mjs`（server/ 或 tools/）若需起本地服务，端口**必须**从确定性固定端口表 `9000-9014` 中按既有分配取用，或在统一端口登记表内新申请一段不重叠区间；**严禁**使用 `7800 + pid%N`、`8070 + pid%N`、`8150 + pid%N` 之类的 `pid` 派生重叠段。
- **理由**：上轮抖动（265/14、D1–D11 `server did not start on 7918`）根因正是新增测试文件未纳入固定端口表、用了 pid 派生段与其他测试原段重叠。Muse 明确指出「消除的范围限于现行套件与端口表，新测试文件不按固定表分配端口，污染会复发」。
- **执行要求**：新测试文件 PR/合入前，须在本报告或端口登记表登记其端口；CI/本地并行跑若再现 `EADDRINUSE`，第一怀疑对象即「漏登记的 pid 派生端口」。
- 本约束即日起生效，作为端口基建的常设纪律，不随本单关闭而失效。

### 6.3 升定案
- 端口基建变更经 ChatGPT 执行层 PASS（队列 2 裁定）+ Muse PASS（Q5）+ 重新锚定确认 + 常设约束落地，**升为定案**。
- 仍守门禁：本件为测试基建变更，不签发游戏功能 PASS；不改变 #64 串行 94/94 唯一稳定验收口径；真实运行验收为另一层证据。
