# P65/P66 · GPT 独立审查意见逐条闭环登记（2026-11-13）

- 审查原件：`evidence/P65P66_GPT_VERDICT_FULL_20261113.txt`（6,667 字，CDP 9222「独立审查意见」会话真实 textContent 回取，非转述）
- 审查结论：**CONDITIONAL，暂不签发 PASS**
- 修复前基线：`js/game.js.bak_20261113_pre_gptfix`（5492a75c…）；修复后：`111179c945f4b8a34…`
- 门禁：审查后改代码已重跑受影响测试；涉及状态机/边界，**须重新送审增量复审**（见文末状态）

## 逐条闭环（意见 / 严重程度 / 判定 / 技术依据 / 复验结果）

| # | 意见 | 严重 | 判定 | 技术依据 | 处理与复验 |
|---|---|---|---|---|---|
| 1 | `multiLoadSession()` 只在 savedAt 是数字时校验 TTL；缺失/字符串/未来时间戳会绕过 30 天窗口，且 `>` 应为 `>=` | **高（阻断）** | **成立** | 修复前源码 `typeof o.savedAt === 'number' && Date.now()-o.savedAt > TTL`；旧格式会话无 savedAt | 改为 fail-closed：`!Number.isSafeInteger \|\| <=0 \|\| >now \|\| now-savedAt >= TTL` 一律清键返回 null。**复验**：行为级 E2E 10 个边界用例全过（缺失/null/字符串/NaN/0/负/未来/非安全整数/恰好30天/31天），29 天仍可续接 |
| 2 | `multiIsNetworkError()` 未知错误一律当 token 失效清键，范围过宽 | **高** | **成立，且更具体** | 核实 `net.js:222` 流失败返回 `{ok:false, error:'STREAM_FAIL'}`（在 **error** 非 code）；`server.mjs:871` 凭据失效码是 `BAD_TOKEN`；`JOIN_FAIL`/`ROOM_FULL`/`LEGACY_DISABLED`/`INTERNAL` 均非身份失效 | 拆三类：新增 `multiIsCredentialFailure()`（BAD_TOKEN/NO_PROFILE/SUPERSEDED/TOKEN_EXPIRED/AUTH_FAILED/REVOKED/KICKED）才清键；`multiIsNetworkError()` 补 error 字段判定；**其余未知错误走第三分支保留凭据**。**复验**：行为级 E2E 7 凭据码 + 3 临时码 + 5 error 文本 + 8 未知码全部符合预期 |
| 3 | 缺 `js/net.js` 原件，无法核对 connect/disconnect/api 契约 | 中（证据缺口） | **成立** | 送审 V2 附件清单确无该文件 | 补交原件 `P65P66_NETJS_ORIGINAL_20261113.txt`（13,154B，sha 419154bb…）。核实：connect 始终 resolve `{ok:false,...}`（内部 catch 兜底），api 返回 Promise，disconnect 先 post leave 再 hardReset |
| 4 | `multiLogout()` 未显式调用 `Net.disconnect()`、reason 无分支、无调用方；不能认定生命周期登出已统一 | 中 | **部分成立** | 源码确实只发 leave 再清键；但生命周期路径 8564/11635 已走 `Net.disconnect()`+`multiClearSession()`，顺序正确 | **不改接线**（GPT 明示「现有生命周期清理路径可接受、不要求本轮强行重构」），但补行为测试验证：在线先 leave 后清键、leave 失败仍清键、离线不发 leave、四种 reason 均清键、不删主存档。裁定权交回 GPT/祝 |
| 5 | 测试是「函数已定义/含 TTL 判定」的结构检查，不足以代替行为验证 | 中 | **成立** | 原 `TOKEN_HARDEN_E2E.mjs` 用正则 `hasLogout`/`hasTtlInLoad` | 新增 `TOKEN_HARDEN_BEHAVIOR_E2E.mjs`：从真实 game.js 提取函数在 vm 沙箱注入 localStorage/Date/Net 桩真实调用，**56/56 PASS**；原 15/15 保留作基线可比 |
| 6 | `multiEnter()` 无 `.catch()`，若 connect reject 会成未处理 Promise rejection | 中 | **成立（防御性）** | 核实 connect 内部有 catch 理论上不 reject，但依赖异常仍可能 | 补 `.catch()` 兜底为「临时故障」保留凭据、不清键 |
| 7 | savedAt 缺失 fail-closed 会让旧会话重登，应在提示中说明原因，别表现成角色数据丢失 | 低（体验） | **成立** | 修复前静默清键、无任何提示 | `multiEnter()` 增加 `hadSession && !s` 判定，提示「上次联机会话已过期…请重新登录；角色与存档数据不受影响」，且不含 token |
| 8 | 多标签 storage 监听只在进入联机 UI 后注册，不是全局覆盖；不应描述成「彻底消除竞态」 | 低 | **成立（口径）** | 源码 `multiEnter()` 首行幂等注册 | 不改代码（GPT 明示「当前不要求扩大到全局启动注册」）；口径改登记为「尽力而为的客户端保护，非跨标签原子锁」 |
| 9 | P66 注释与数值一致性 PASS；但「不压倒 combatPower/共鸣」是设计意图，非实战平衡已验证 | 低 | **成立** | 精确 diff 显示只改注释；四系数 1.00/1.05/1.04/1.06 未变 | 不改数值（GPT 明示「不要求修改 P66 数值」）；口径收敛为「一致性 PASS，实战平衡以专项 pass 授权范围为准」 |
| 10 | 首次服务端 119/9 不得被后续全绿覆盖；端口冲突只是初判，未逐用例定位；阻断「无条件全树回归 PASS」表述 | 中 | **成立** | 原始输出保留 119/9；后续 4 次 128/128 | 不删除首次失败记录；归档口径改为「首次 119/128（9 失败，根因未逐项定位），随后 4 次独立复跑 128/128」，不作无条件回归结论 |
| 11 | V1 粘贴件损坏、连接中断 | 低 | **成立** | 已核实重复片段与断裂丢字 | V1 整条作废；V2 附件上传无损重送；本轮增量复审继续以附件为准 |

## 拒绝 / 部分接受的依据
- **未修改** `P66` 数值、`server/*.mjs`、`js/net.js`、端口策略、历史 P1-C 修复、主存档结构 —— 依据 GPT「不要求」清单与授权白名单。
- **未接线** `multiLogout()` —— 依据 GPT「现有生命周期清理路径可接受，不要求为了本轮强行重构」；改接线属扩大范围，留给祝裁定。
- **未迁 HttpOnly Cookie / 未实现服务端会话失效** —— 属红线①服务端侧，用户授权仅覆盖客户端侧，登记为已知缺口另排期。

## 修改白名单核对
- 仅 `js/game.js`：4 个 hunk（`P65P66_GPTFIX_DIFF_20261113.txt`，6,128B，sha a2525ab6…）
- 新增 `TOKEN_HARDEN_BEHAVIOR_E2E.mjs`
- 证据文件（evidence/ 下）
- 备份 `js/game.js.bak_20261113_pre_gptfix`、`TOKEN_HARDEN_E2E.mjs.bak_20261113_pre_gptfix`

## 复验证据（修复后实跑）
| 项 | 结果 |
|---|---|
| `node --check js/game.js` | GAMEJS_SYNTAX_OK |
| `node TOKEN_HARDEN_BEHAVIOR_E2E.mjs` | **PASS=56 FAIL=0** |
| `node TOKEN_HARDEN_E2E.mjs` | PASS=15 FAIL=0（基线未破） |
| `node P1C_MUSE_E2E.mjs` | 通过（含 [6] 定版声明） |
| `scratch/p1c_prototype/verify_real_logic.mjs` | ✅ 全部通过 |
| `node --test server/*.test.mjs` | 128/128 pass / fail 0 |
| 原始输出 | `evidence/P65P66_POSTFIX_TESTS_20261113.txt`、`evidence/P65P66_BEHAVIOR_E2E_OUTPUT_20261113.txt` |

## 三类证据分别记录（不互相替代）
1. **测试全绿** ✅（上表）
2. **GPT 独立审查**：V2 审查 = CONDITIONAL（未通过）；**增量复审待回取**，本单不得宣称「审查已通过」
3. **真实运行验收**：Muse 第四方尚未验收；祝最终裁定未取得

## 当前门禁状态
- 已完成：只读核实 → 白名单 → 备份基线 → 实施 → 语法检查 → 专项测试 + 受影响回归 → 差异未越白名单核对 → 审查意见逐条闭环
- **未完成**：GPT 增量复审（涉及状态机/边界，必须重新送审并回取正文）→ Muse 第四方验收 → 祝最终裁定
- 结论：**阶段性成果**，不是正式交付通过。
