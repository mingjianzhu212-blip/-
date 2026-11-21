# P65/P66 · GPT 增量复审送审包 V3（2026-11-13）

> 只做**增量复审**，不重开已通过部分（依 V2 裁定「完成四项后只做增量复审」）。
> 有效送审对象：V2 附件 + 本 V3 补件；V1 粘贴件已损坏作废。
> 通道：CDP 9222「独立审查意见」会话，附件上传（无损原件）。

## 一、V2 裁定后的实际改动（4 hunk，仅 js/game.js）

| 你的意见 | 处理 |
|---|---|
| ① TTL 缺失/非法/未来时间戳/边界 `>` | **已修**：`multiLoadSession()` 改 fail-closed，`!Number.isSafeInteger \|\| <=0 \|\| >now \|\| now-savedAt >= TTL` 一律清键返回 null；旧格式会话直接失效重登 |
| ② 未知错误一律当 token 失效清键 | **已修**：新增 `multiIsCredentialFailure()`（BAD_TOKEN/NO_PROFILE/SUPERSEDED/TOKEN_EXPIRED/AUTH_FAILED/REVOKED/KICKED）才清键；`multiIsNetworkError()` 补 error 字段判定（**核实 net.js:222 的 STREAM_FAIL 在 error 而非 code**）；其余未知错误走第三分支**保留凭据** |
| ③ 缺 js/net.js 原件 | **补交**：`P65P66_NETJS_ORIGINAL_20261113.txt`（13,154B） |
| ④ 缺行为测试证据 | **补交**：`TOKEN_HARDEN_BEHAVIOR_E2E.mjs` 原件 + 完整输出（vm 沙箱真实调用，56/56）＋原 `TOKEN_HARDEN_E2E.mjs` 原件 |
| ⑤ multiEnter 无 .catch() | **已修**：补兜底为「临时故障」保留凭据 |
| ⑥ fail-closed 会让旧会话静默重登 | **已修**：`hadSession && !s` 时提示「会话已过期…请重新登录；角色与存档数据不受影响」 |
| ⑦ 多标签监听非全局 / P66「不压倒」是设计意图 | **仅口径收敛**，不改代码（依你「当前不要求扩大」「不要求修改 P66 数值」） |
| ⑧ 119/9 归档 | **不删记录**，口径改为「首次 119/128（9 失败、根因未逐项定位）＋随后 4 次 128/128」，不作无条件回归结论 |

**明确未改**（依你的「不要求」清单）：P66 四系数、`server/*.mjs`、`js/net.js`、端口策略、历史 P1-C 修复、主存档结构、HttpOnly 迁移/服务端会话失效。
**明确未接线**：`multiLogout()` —— 依你「现有生命周期清理路径可接受，不要求为了本轮强行重构」；仅补行为测试验证其 leave 顺序/失败兜底/不删主存档，接线与否留给祝裁定。

## 二、冻结点（可哈希复核）

| 件 | 字节 | SHA-256 前 16 |
|---|---|---|
| `js/game.js`（修复后，即将交付态） | 758,5xx | `111179c945f4b8a34…` |
| `js/game.js.bak_20261113_pre_gptfix`（修复前基线） | 757975 | `5492a75ccfbf0a6a8…` |
| `P65P66_GPTFIX_DIFF_20261113.txt`（本次 4-hunk 增量 diff） | 6128 | `a2525ab6b0faee02` |
| `P65P66_NETJS_ORIGINAL_20261113.txt`（js/net.js 原件） | 13154 | `419154bbea705077` |
| `P65P66_BEHAVIOR_E2E_ORIGINAL_20261113.txt`（行为测试源码） | 9491 | `668a4987e63c48db` |
| `P65P66_TOKEN_E2E_ORIGINAL_20261113.txt`（原验收件源码） | 5832 | `6b715a49903dbc4c` |
| `P65P66_BEHAVIOR_E2E_OUTPUT_20261113.txt`（行为测试完整输出） | 4553 | `dcc1297d5cd455d0` |
| `P65P66_POSTFIX_TESTS_20261113.txt`（全套回归输出） | 见落盘 | 见落盘 |
| `P65P66_GPT_REVIEW_CLOSURE_20261113.md`（逐条闭环登记） | 见落盘 | 见落盘 |

## 三、net.js 契约核实结论（从原件）
- `connect()` **始终 resolve**：内部 `fetchJson(...).then(...).catch(...)` 兜底，返回 `{ok:false, code, error}`；不会 reject（但已补防御性 `.catch()`）。
- 错误码来源：`post()` catch → `TIMEOUT`/`NETWORK`；join 拒绝 → 服务器 `code` 或 `JOIN_FAIL`；流失败 → `error:'STREAM_FAIL'`（**无 code**）；环境缺依赖 → `error:'环境缺 fetch'` 等。
- `api()` 返回 Promise；`disconnect()` 先 `post('/api/room/leave').catch()` 再 `hardReset()`。
- 服务端凭据失效权威码（`server.mjs:871` / 745 / 350）：`BAD_TOKEN`；另有 `NO_PROFILE`、`SUPERSEDED`。
- **结论**：V2 所担心的「未知错误误清 token」确实存在，已按三分类修正；`ROOM_FULL`/`LEGACY_DISABLED`/`BAD_SNAPSHOT`/`INTERNAL`/限流等临时或业务拒绝现在均**保留凭据**。

## 四、修复后原始测试输出（本机实跑）
- `node --check js/game.js` → GAMEJS_SYNTAX_OK
- `node TOKEN_HARDEN_BEHAVIOR_E2E.mjs` → **PASS=56 FAIL=0**（TTL 10 边界、错误分类 23 例、登出 8 例、分支/口径 8 项）
- `node TOKEN_HARDEN_E2E.mjs` → PASS=15 FAIL=0（原验收件基线未破）
- `node P1C_MUSE_E2E.mjs` → 通过（含 [6] 定版声明）
- `scratch/p1c_prototype/verify_real_logic.mjs` → ✅ 全部通过
- `node --test server/*.test.mjs` → 128/128 pass / fail 0

## 五、请你裁定的问题（增量范围）
1. ①/②/⑤/⑥ 四项修复是否**闭环**，是否仍有 fail-closed 边界或错误分类遗漏？
2. 补交的 `js/net.js` 原件是否足以支撑 connect/disconnect/api 契约复核；三分类的错误码集合是否与原件一致（尤其 `STREAM_FAIL` 在 error 字段、`BAD_TOKEN` 为凭据失效权威码）？
3. 行为级测试 56/56 是否满足你第 4 项「实际行为断言」要求？是否还需补特定用例？
4. `multiLogout()` 维持「不接线」是否可接受，还是必须接入真实登出入口才给 PASS？
5. 综合 V2 + 本增量，是否可以签发 **PASS / CONDITIONAL / REJECT**？若仍 CONDITIONAL，请只列剩余最小事项。

结束标记：`P65P66_GPT_INCREMENTAL_END_20261113`
