# P65 + P66 · ChatGPT 独立审查送审包（冻结点，2026-11-13）

> 送审对象：即将交付的实际版本（js/game.js 当前磁盘态）+ 完整变更 hunk + 基线哈希 + 原始测试结果 + 已知异常。
> 通道：独立 `--user-data-dir` 的 Edge + CDP 9222（不动用户主 Edge）。
> 授权：祝《通宵开发计划与授权令·2026-11-12》队列 4（token 设计稿）+ 2026-11-12 AskUserQuestion 答复（pathBonus→授权平衡pass；token→授权实施）。

## 一、任务定位
- **P65｜token 安全加固（红线①·客户端侧）**：将 `evidence/TOKEN_SECURITY_DESIGN_20261112.md` 中客户端侧可落地部分写入 `js/game.js`。服务端会话失效 + HttpOnly Cookie 迁移属红线①服务端侧，本单**不写**（登记为已知缺口，另排期）。
- **P66｜pathBonus 平衡专项定版（D1=(a)）**：四道途伤害乘子由「机制占位」升级为「平衡定版 v1」，数值经祝授权「平衡pass」追认（sword/body/dan/array = 1.00/1.05/1.04/1.06，上限 ≤8%）。

## 二、变更文件与基线
| 文件 | 变更类型 | 基线 |
|---|---|---|
| `js/game.js` | 修改（3 处 hunk） | `js/game.js.bak_20261112_p1c_codefix`（P1C codefix 前）；本次另存 `js/game.js.bak_20261113_p65p66`（本次交付态） |
| `P1C_MUSE_E2E.mjs` | 修改（[6] 占位→定版断言） | 同目录历史版本 |
| `TOKEN_HARDEN_E2E.mjs` | 新增（客户端加固 headless 验收件） | — |

## 三、js/game.js 变更 hunk（实际代码）

### Hunk A — 联机会话块（原 7326-7344 → 现 红线① 加固块）
新增：`MULTI_SESSION_TTL = 30*24*60*60*1000`；`multiLoadSession` 增加 `savedAt` + TTL 过期判定（过期即清键、视为缺失）；`multiSaveSession` 每次落地刷新 `savedAt`；新增 `multiIsNetworkError(r)`（TIMEOUT/NETWORK/STREAM_FAIL/超时/没响应 → true；JOIN_FAIL/LEGACY_DISABLED → false）；新增 `multiLogout(reason)`（先 post leave 再清本地键，四原因区分）；新增 `hookMultiStorage()`（多标签 storage 事件同步断连）。

### Hunk B — `multiEnter()` 续接分支（原 7386-7391 单行失败处理 → 现网络/token 区分）
`if(!r.ok){ ... }` 改为：网络错误（`multiIsNetworkError`）不清凭据、提示稍后重试；token 失效才 `multiClearSession()` 并提示重登。顶部增加 `hookMultiStorage()` 注册。

### Hunk C — `PATH_BONUS` 注释（原 3850-3852「机制占位」→ 现「平衡定版 v1」）
数值 **未变更**（仍 1.00/1.05/1.04/1.06）；注释改为已定版、标注祝追认「平衡pass」、说明上限 ≤8% 与实际区间 [0%,+6%]、道途差异主要靠技能/共鸣、后续可按遥测微调。

## 四、原始测试结果（本机实跑）
- `node --check js/game.js` → GAMEJS_SYNTAX_OK
- `node P1C_MUSE_E2E.mjs` → **PASS=13 FAIL=0**（含 [6] 定版声明 ✓）
- `node TOKEN_HARDEN_E2E.mjs` → **PASS=15 FAIL=0**
- `node scratch/p1c_prototype/verify_real_logic.mjs` → ✅ 全部通过
- `node --test server/*.test.mjs` → **128/128 pass**（回归无破坏）
- 备份：`js/game.js.bak_20261113_p65p66`（757975 字节，交付态）

## 五、已知异常 / 已知缺口（须 GPT 一并审查，不得伪装通过）
1. **服务器侧会话失效缺位 + localStorage XSS 可读**：客户端 localStorage token 仍可被注入脚本读走（Muse 原件点名「全量 innerHTML 重绘、文本注入面真实存在」）。本单只在客户端加 TTL/网络区分/登出顺序/多标签保护，**未**迁移 HttpOnly Cookie、未实现服务端会话失效。属红线①服务端侧，待祝批后另排期。
2. **`multiLogout` 当前无显式调用方**：生命周期清理（转世/重开 8564/11635）已走 `Net.disconnect()`（先 post leave 再清内存）+ `multiClearSession()`，顺序已正确，故未改这两处；`multiLogout` 作为统一登出入口供未来显式登出使用。请 GPT 确认此取舍是否可接受，还是应把 8564/11635 也改为 `multiLogout('lifecycle')`。
3. **`hookMultiStorage` 注册时机**：在 `multiEnter()` 首行注册（幂等）。若用户在未进入过联机 UI 的标签内发生登出，该标签的 storage 监听未注册——但登出发生在联机 UI 内，进入即注册，实际覆盖。请 GPT 确认是否需在全局启动处注册。

## 六、请 ChatGPT 审查焦点
- 红线①客户端侧落地是否完整、无引入新漏洞（尤其 `multiIsNetworkError` 判定集合、`multiLogout` 顺序、TTL 边界）。
- Hunk A/B 是否破坏既有联机续接/登出流程（对照 `js/net.js` connect/disconnect 契约）。
- P66 定版注释与数值一致性与「≤8% 不压倒 combatPower/共鸣」的声明是否成立。
- 已知缺口 1/2/3 的取舍是否合理，是否须在本单补强。
- 一致性/安全/存档（不误删游戏主存档）。
