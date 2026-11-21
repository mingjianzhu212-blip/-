# P65 + P66 · ChatGPT 独立审查送审包 V2（无损冻结点，2026-11-13）

> **V2 取代 V1（V1 粘贴件已作废）**：上一轮通过 composer 粘贴投递的 V1 全文，因长文本插入重试导致**重复片段、代码断裂丢字**，已核实为**损坏原件，整条作废**。本轮改用**附件上传**（`DOM.setFileInputFiles`），附件为磁盘原件字节级副本，无截断/拼接损坏。composor 内仅放 <3000 字的说明。
> 送审对象：即将交付的实际磁盘版本 `js/game.js` + 完整 diff + 精确增量 diff + 基线哈希 + 原始测试输出 + 已知异常。
> 通道：独立 `--user-data-dir` 的 Edge + CDP 9222（不动用户主 Edge），会话「独立审查意见」。
> 授权：祝《通宵开发计划与授权令·2026-11-12》队列 4 + 2026-11-12 AskUserQuestion 答复（pathBonus→授权平衡pass；token→授权实施）。

## 一、任务定位
- **P65｜token 安全加固（红线①·客户端侧）**：将 `evidence/TOKEN_SECURITY_DESIGN_20261112.md` 中客户端侧可落地部分写入 `js/game.js`。服务端会话失效 + HttpOnly Cookie 迁移属红线①**服务端侧，本单不写**，登记为已知缺口另排期。
- **P66｜pathBonus 平衡专项定版（D1=(a)）**：四道途伤害乘子由「机制占位」升级为「平衡定版 v1」，数值经祝授权「平衡pass」追认（sword/body/dan/array = 1.00/1.05/1.04/1.06，上限 ≤8%，实际区间 [0%,+6%]）。**数值未变，仅注释定版**。

## 二、冻结点：文件、字节数、SHA-256（可复核）

| 交付件 / 附件（均在 `D:/xx-scratch/jiuxiao-analysis/九霄问道/evidence/`） | 字节 | SHA-256 |
|---|---|---|
| `js/game.js`（当前磁盘态，即将交付版） | 757975 | `5492a75ccfbf0a6a829b7706adbf78a255176b7e91211c359ee44de608be5ad1` |
| `js/game.js.bak_20261113_p65p66`（本次交付态备份，与上面**哈希一致**） | 757975 | `5492a75ccfbf0a6a829b7706adbf78a255176b7e91211c359ee44de608be5ad1` |
| `js/game.js.bak_20261112_p1c_domfix`（磁盘上最近的改前基线，见「三」） | 751243 | `b383b81b711c5620f5b5b834eec6b10e80091bb57b7b8e65a5ca6a1712b8e274` |
| `P65P66_GPT_REVIEW_PACKAGE_V2_20261113.md`（本件） | 见落盘 | 见落盘 |
| `P65P66_EXACT_DIFF_20261113.txt`（**精确本次增量 diff**，5 hunk / 129 行） | 8695 | 见落盘 |
| `P65P66_FULL_DIFF_20261113.txt`（相对 domfix 基线的**完整 diff**，9 hunk / 196 行） | 13555 | `38ac9cf671e1ced74aaf…` |
| `P65P66_CODE_HUNKS_20261113.txt`（三 hunk 字面代码，从真实 game.js 提取） | 10789 | `81c18315b6afc04fa7ec…` |
| `P65P66_RAW_TEST_OUTPUT_20261113.txt`（原始测试输出，含首次 119/9） | 3169 | `56bea33d8aa03650f69c…` |
| `P65P66_SERVER_FULL_20261113.txt`（服务端全量复跑 128/128） | 29755 | `c192b98ac64d2c54442f…` |
| `P65P66_SERVER_FLAKY1/2/3.txt`（三次独立复跑，各 128/128） | 见落盘 | 见落盘 |

## 三、基线与 diff 的诚实说明（V1 的一处错误已更正）
- V1 送审包把改前基线写成 `js/game.js.bak_20261112_p1c_codefix`，**不准确**，V2 更正为 `bak_20261112_p1c_domfix`（更接近、差异更小：122 变更行 vs 192）。
- 磁盘上**没有**恰好等于「P65/P66 动手前那一刻」的备份。`bak_20261112_p1c_domfix` 是 P1-C DOM 修复**之前**的快照，因此相对它的**完整 diff（`P65P66_FULL_DIFF_20261113.txt`, 9 hunk）额外包含 4 个历史 P1-C 已交付修复**：
  1. `renderPathPreview()` 动态注入 P1-C 样式（`p1c-path-style`）
  2. `#char-confirm` 真实父节点 insertBefore 修复（避免 NotFoundError）
  3. `showCharModal()` 改用 `needNewGame` 判定终身道途锁定（不再依赖不可靠的 editing 形参）
  4. 写入 `S.path` 前校验 `charPath ∈ PATH_IDS`（GPT 终审阻断项①）
  —— 这 4 处**均属上一轮 P1-C 已交付、已审查内容，不是 P65/P66 越界改动**。
- 为让审查输入精确，另附 **`P65P66_EXACT_DIFF_20261113.txt`**：从完整 diff 中截取**仅本次 5 个 hunk**（`@@ -3847` PATH_BONUS 注释；`@@ -7323/-7336/-7381/-7388` 联机会话加固 + 续接分支），是本单真正的变更范围。请以此件判定 P65/P66，完整 diff 用于核对磁盘态与历史一致性。
- **白名单核对结论**：本次 `js/game.js` 改动仅限上述 5 hunk；另改 `P1C_MUSE_E2E.mjs`（[6] 占位断言→定版断言）、新增 `TOKEN_HARDEN_E2E.mjs`。未改 index.html / style.css / server / 存档结构。

## 四、原始测试结果（本机实跑，输出见附件）
- `node --check js/game.js` → `GAMEJS_SYNTAX_OK`
- `node P1C_MUSE_E2E.mjs` → **PASS=13 FAIL=0**（含 [6] 定版声明 ✓）
- `node TOKEN_HARDEN_E2E.mjs` → **PASS=15 FAIL=0**（TTL/网络错误判定/登出/多标签/续接分支/日志不泄漏 token）
- `node scratch/p1c_prototype/verify_real_logic.mjs` → 全部通过
- `node --test server/*.test.mjs`：
  - **首次复跑出现 `# pass 119 / # fail 9`**（见 `P65P66_RAW_TEST_OUTPUT_20261113.txt` 第 55–69 行），为**异常，不隐瞒**；
  - 随后 **4 次独立全量复跑均 `128/128 pass / fail 0 / EXIT=0`**（`P65P66_SERVER_FULL_20261113.txt` + `FLAKY1/2/3`）。
  - 初判为并发端口冲突导致的偶发（flaky）失败；**根因未做逐用例定位**，按门禁标为「已知异常·未完全解释」，不作为「回归无破坏」的强证据，请 GPT 一并审查。

## 五、已知异常 / 已知缺口（须 GPT 一并审查，不得伪装通过）
1. **服务端侧会话失效缺位 + localStorage XSS 可读**：客户端 localStorage token 仍可被注入脚本读走（Muse 原件点名「全量 innerHTML 重绘、文本注入面真实存在」）。本单只加客户端 TTL/网络区分/登出顺序/多标签保护，**未**迁 HttpOnly Cookie、**未**实现服务端会话失效。属红线①服务端侧，待祝批后另排期。
2. **`multiLogout` 当前无显式调用方**：生命周期清理（转世/重开 8564/11635）已走 `Net.disconnect()`（先 post leave 再清内存）+ `multiClearSession()`，顺序已正确故未改；`multiLogout` 作为统一登出入口供未来显式登出使用。请裁定取舍是否可接受，还是应把 8564/11635 也改为 `multiLogout('lifecycle')`。
3. **`hookMultiStorage` 注册时机**：在 `multiEnter()` 首行注册（幂等）。未进入过联机 UI 的标签没有监听；但登出发生在联机 UI 内，进入即注册，实际覆盖。请裁定是否需在全局启动处注册。
4. **服务端测试偶发 9 失败**（见四）：未逐用例定位根因，已实报并给出 4 次全绿复跑证据。
5. **送审通道异常已披露**：V1 粘贴件损坏作废；上一轮 ChatGPT 回复出现「连接已中断，正在等待完整答复」，未产生裁定。本轮为干净会话重送。

## 六、请 ChatGPT 审查焦点
- 红线①客户端侧落地是否完整、无引入新漏洞（尤其 `multiIsNetworkError` 判定集合、`multiLogout` 顺序、TTL 边界、`savedAt` 缺失时的行为）。
- `EXACT_DIFF` 的 5 个 hunk 是否破坏既有联机续接/登出流程（对照 `js/net.js` connect/disconnect 契约）。
- P66 定版注释与数值一致性、「≤8% 不压倒 combatPower/共鸣」声明是否成立。
- 已知异常 1–5 的取舍是否合理；异常 4 是否阻断「回归无破坏」结论。
- 一致性 / 安全 / 存档（不误删游戏主存档）/ 与历史 P1-C 修复有无冲突。
- 请给出明确的 **PASS / CONDITIONAL / REJECT** 及逐条依据。结束标记：`P65P66_GPT_REVIEW_END_20261113`
