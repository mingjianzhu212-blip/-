# 《九霄问道》双线并行 · 每日积分台账（合并计算）

> 规则：每日 WorkBuddy × Qoder 模型积分总预算 **200 credits**，主线 A 与副线 B **合并计算**，不得分别计算。
> 真实消耗据实记录；无法获得精确值时标记 `spend_unknown`，**不得记为 0**。不因双线并行突破预算。

---

## 2026-11-03（双线模式启动日）

| 动作 | 归属 | 类型 | 消耗 | 说明 |
|---|---|---|---|---|
| 读取项目文件（AGENTS.md / GAME_ROADMAP.md / t117 审查件 / server.mjs 等） | A | 本地 IO | 0 | 本地文件读取，不计模型积分 |
| 检查 ChatGPT Edge 通道（curl 9222） | A | 本地 IO | 0 | 连接被拒，通道已死 |
| Web 检索：即梦官方接入方式 | B | 模型检索 | spend_unknown | 工具未回传精确消耗 |
| Web 检索：即梦免费额度/限制/商用授权 | B | 模型检索 | spend_unknown | 工具未回传精确消耗 |
| 编写 ART_PIPELINE.md / CREDITS_LEDGER.md | B | 本地 IO | 0 | 本地写入 |
| 任务清单建立（主线 A + 副线 B） | A+B | 本地 IO | 0 | 本地任务管理 |

### 当日累计（截至启动日首段）
- **总消耗**：Web 检索 2 次（精确值 `spend_unknown`）+ 全部本地操作 0。
- **是否突破 200 预算**：无法确认（见下方 fail-closed 说明）。
- **剩余额度**：`spend_unknown`（**不得解释为可确信低于 200**）。原因有二：① 2 次 Web 检索精确值未知；② 本桥账（`spend_ledger`）不捕获 WorkBuddy 对话本身的模型消耗，存在盲区。累计无法确认时，按 **fail-closed** 处理：暂停新增模型调用，先解决账本可信度。
- **付费调用**：无（遵守副线 B 权限边界）。

### 备注
- 未做任何 ChatGPT 生成、即梦生成、付费 API 调用。
- 账本盲区：桥账只记录经桥派发的离散调用（如 Qoder 派发、显式检索工具），WorkBuddy 对话自身的模型积分不在其内。真实日消耗可能高于账本可见值。
- 若后续需回取 ChatGPT 审查或实际调用即梦，将单独记录并先评估预算/授权。

---

## 2026-11-03（续 · P0-B 收口 + 副线 B3/B4 定稿）

> 本段在 **fail-closed** 纪律下执行：不新增任何 Web 检索 / ChatGPT / Qoder 模型调用，全部通过本地文件读写、代码编辑与本地 `node --test` 完成。

| 动作 | 归属 | 类型 | 消耗 | 说明 |
|---|---|---|---|---|
| 读 server.mjs / game.js / net.js / 三套测试 / GAME_ROADMAP / HANDOVER / ART_PIPELINE | A+B | 本地 IO | 0 | 本地读取，不计模型积分 |
| 诊断并修复 P0-B 两处失败用例（T4 测试对齐 P0-A 拒绝语义；T5 大厅广播暴露权威战力） | A | 本地代码 | 0 | 改前已 `cp -p` 备份 |
| 运行 `node --test` 三套（P0-B 5/5、P0-A 6/6、P0-C 4/4 回归） | A | 本地 IO | 0 | 真子进程+真 HTTP/SSE，无 mock |
| 更新 GAME_ROADMAP.md / HANDOVER.md（P0-B 交付记录） | A | 本地 IO | 0 | — |
| 定稿 §3 D 混合美术规范（色板/笔触/光影/角色/NPC/场景/UI/负面词） | B | 本地 IO | 0 | B3 |
| 建成 §4 提示词模板库（七类可复用模板 + 纪律） | B | 本地 IO | 0 | B4 |
| 更新 CREDITS_LEDGER.md（本段） | A+B | 本地 IO | 0 | — |

### 本段累计
- **本段新增模型调用消耗**：**0**（fail-closed 下未发起任何检索/生成/派发）。
- **全天可见累计**：仍为「2 次 Web 检索 `spend_unknown` + 其余 0」；剩余额度 `spend_unknown`，未确认触顶。
- **fail-closed 状态**：维持。解除条件——补齐桥账对 WorkBuddy 对话消耗的捕获，或制作人确认当天检索已计入且剩余充足。在此之前，副线 B 的「价格官网复核」「B5–B8 量产/接入」等需模型或付费的动作一律暂缓。
- **付费调用**：无。

---

## 2026-11-03（续 · 第 119 轮 P0-B 独立审查 + 美术样稿准备）

> 本段同样在 **fail-closed** 纪律下执行：未发起任何 Web 检索 / ChatGPT / Qoder / 付费 API。全部为本地读代码、改代码、`node --test`、写文档。

| 动作 | 归属 | 类型 | 消耗 | 说明 |
|---|---|---|---|---|
| 审查 server.mjs 全部战力入口 + game.js `combatPower()` 逐项对照 + 各输入上限截断分析 | A | 本地代码审查 | 0 | 只读 + 本地推理 |
| 修复 `js/game.js` `multiSnapshot()` 大小写 typo（`S.Weapon`→`S.weapon`、`S.WeaponLv`→`S.weaponLv`） | A | 本地代码 | 0 | 改前 `cp -p` 备份 `.bak_20261103_225822_preP0Breview` |
| 新增 `multi-p0b.test.mjs` T6/T7 并跑 P0-B 7/7 + P0-A 6/6 + P0-C 4/4 | A | 本地 IO | 0 | 真子进程+真 HTTP/SSE |
| 更新 GAME_ROADMAP.md / HANDOVER.md（第 119 轮审查结论） | A | 本地 IO | 0 | — |
| 核对 B3/B4 完整性 + 新建 `CHAR_SHENBEI_CARD.md`（沈碑设定卡+提示词+导入规范） | B | 本地 IO | 0 | 未生成图片/未调付费 |
| 更新 ART_PIPELINE.md §3.4/§5/§6/§7/§8（B5/B6/B7 首版） | B | 本地 IO | 0 | — |

### 本段累计
- **本段外部模型调用**：**0**（无 Web 检索 / ChatGPT / Qoder / 付费 API）。
- **本段 WorkBuddy 对话自身模型消耗**：`spend_unknown`（桥账不捕获对话内消耗，按规则不得记为 0、不得推断剩余额度）。
- **全天可见累计**：2 次 Web 检索（`spend_unknown`）+ 本段对话消耗（`spend_unknown`）+ 其余本地 0；**剩余额度 = `spend_unknown`**，未确认触顶。
- **fail-closed 状态**：维持。本段已刻意零外部调用；B2 价格复核、B8 实际量产/接入仍暂缓，待账本可信度解决或制作人确认。
- **付费调用**：无。

---

## 2026-11-03（续 · 第 120 轮 P1-A 道途切片 + P0-B 边界量化）

| 动作 | 归属 | 类型 | 消耗 | 说明 |
|---|---|---|---|---|
| 读 GAME_PATH_SYSTEM_P1.md / server.mjs / net.js / game.js / views/multi.js / AGENTS.md | A | 本地 IO | 0 | — |
| 实施 P1-A：`PATHS` 表 / `pathCatalog()` / `/api/path` / `/api/run/skill` / 温养·点阵·护持·破军斩结算 | A | 本地代码 | 0 | 改前 `cp -p` 备份 `*.bak_20261103_234059_prep1a`（4 个文件） |
| 客户端：`net.js` 第 6 参 path + `me.path` 回写；`game.js` 道途 UI/技能按钮；`views/multi.js` 两个容器 | A | 本地代码 | 0 | 零新增 CSS |
| 新增并跑 `multi-p1a.test.mjs` 8/8 + `multi-p1a-client.test.mjs` 2/2（node:vm 真加载 net.js）+ 回归 p0 6/6 / p0b 7/7 / p0c 4/4 | A | 本地 IO | 0 | 真子进程 + 真 HTTP/SSE |
| 新增 `probe-p0b-boundary.mjs` 量化快照伪造与 legacy 回退的真实影响 | A | 本地脚本 | 0 | 独立探针，不写成断言（防为缺陷背书） |
| 更新 GAME_ROADMAP / HANDOVER / GAME_PATH_SYSTEM_P1 状态 | A | 本地 IO | 0 | — |

### 本段累计
- **本段外部模型调用**：**0**（全程本地代码与测试）。
- **本段对话自身模型消耗**：`spend_unknown`。
- **fail-closed**：维持；**付费调用**：无。

---

## 2026-11-03（续 · 第 121 轮 副线 B 转「备料期」：资产盘点 + 一个月计划 + 授权清单）

> 制作人裁定：**暂不购会员、不批量生图**；先完成框架与页面结构，再集中开通一个月。本轮因此**只做本地盘点与规划**。

| 动作 | 归属 | 类型 | 消耗 | 说明 |
|---|---|---|---|---|
| 新建 `art-pipeline/tools/asset_audit.mjs`，扫描 58 个代码文件，抽出 117 条素材引用并与磁盘比对 | B | 本地脚本 | 0 | 可复现：`node art-pipeline/tools/asset_audit.mjs` |
| 逐项盘点真实内容：BEASTS 43 条/38 图/7 Boss、ITEMS 22 条、GONGS 3、面板 14 个/子页 60、NPC 2 位、外观 5 套 | B | 本地 IO | 0 | 全部从 `js/**` 反查 |
| 新建 `ART_ASSET_MASTER_LIST.md`（190 项 / 15 字段 / A-B-C 分级 / 验收编号） | B | 本地 IO | 0 | B9 |
| 新建 `ONE_MONTH_PRODUCTION_PLAN.md`（36 张定稿：A 21 + B 15，30 天含缓冲） | B | 本地 IO | 0 | B10 |
| 新建 `LICENSE_CHECKLIST.md`（10 问待核实 + 现有 38 张图来源不明） | B | 本地 IO | 0 | B11 |
| 沈碑卡新增 §0.5 一致性与 v0 冲突核对；修负面词与扫帚描述 | B | 本地 IO | 0 | 未改任何图 |
| 更新 `ART_PIPELINE.md` 当前阶段/§3 依据纪律/§6.3 战斗立绘透明/§8 任务表/§9 七步路线 | B | 本地 IO | 0 | — |

### 本段累计
- **本段外部模型调用**：**0**（无 Web 检索 / ChatGPT / Qoder / 付费 API / 生图）。
- **本段对话自身模型消耗**：`spend_unknown`（桥账盲区，按规则不记 0）。
- **全天可见累计**：仍为「2 次 Web 检索 `spend_unknown` + 各段对话 `spend_unknown` + 本地 0」。
- **剩余额度**：`spend_unknown` —— **未推断为低于 200**。
- **fail-closed**：维持。**付费调用 / 会员 / 生图**：全部 0。
- **本轮新增的"待付费"事项**：无。会员与生图继续挂起，等页面结构冻结。
