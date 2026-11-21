【P65/P66 增量复审·降级投递】关键节选＋缺口声明（单片）

依补充令一·5：附件上传连续失败（8/8 报「上传未成功」、发送按钮置灰），停止重试，改单片关键节选投递。本片**不冒充全文复审**。
缺口声明（须随裁定保留）：8 件原件未能在网页端送达，仅存磁盘 `D:/xx-scratch/jiuxiao-analysis/九霄问道/evidence/`，属**缺件待续**，按你点名补投：V3 增量包、逐条闭环表、修复 DIFF、NETJS_ORIGINAL(js/net.js 原件)、BEHAVIOR_E2E 源码、TOKEN_E2E 源码、BEHAVIOR 输出、POSTFIX 测试输出（均 `P65P66_*_20261113.*`）。

冻结：修复前 `5492a75ccfbf0a6a8…`（bak_20261113_pre_gptfix）；修复后 `111179c945f4b8a34…`；增量 diff 6128B sha `a2525ab6b0faee02`，**仅 4 hunk / 仅 js/game.js**。

■ 修复① TTL fail-closed（V2 阻断项）实际代码
```
const now = Date.now();
if(!Number.isSafeInteger(o.savedAt) || o.savedAt <= 0 || o.savedAt > now || now - o.savedAt >= MULTI_SESSION_TTL){ localStorage.removeItem(MULTI_SESSION_KEY); return null; }
return o;
```
覆盖缺失/null/字符串/NaN/0/负/未来/非安全整数/**恰好 30 天(>=)**/超 30 天 → 清键不续接；29 天可续接。旧会话过期时 `multiEnter` 提示「请重新登录；角色与存档数据不受影响」。

■ 修复② 错误三分类 实际代码
```
function multiIsCredentialFailure(r){ if(!r) return false; const c=r.code;
  return c==='BAD_TOKEN'||c==='NO_PROFILE'||c==='SUPERSEDED'||c==='TOKEN_EXPIRED'||c==='AUTH_FAILED'||c==='REVOKED'||c==='KICKED'; }
function multiIsNetworkError(r){ if(!r) return false; const c=r.code;
  if(c==='TIMEOUT'||c==='NETWORK'||c==='STREAM_FAIL') return true;
  const e=typeof r.error==='string'?r.error:'';
  return e.indexOf('超时')>=0||e.indexOf('没响应')>=0||e==='STREAM_FAIL'||e.indexOf('流连接')>=0||e.indexOf('环境缺')>=0||e==='NETWORK'; }
```
`multiEnter`：credential → 清键重登；else if network → 保留凭据稍后重试；**else 未知 → 保留凭据**提示暂未接受；并补 `.catch()` 兜底为临时故障、不清键。

net.js 契约核实（读磁盘原件，网页附件未达）：`connect()` 始终 resolve `{ok:false,code,error}`（内部 `fetchJson().then().catch()` 兜底），不 reject；**net.js:222 流失败 = `{ok:false,error:'STREAM_FAIL'}`，在 error 不在 code**（V2 误清有效 token 的成因，已修）；164 post catch → code TIMEOUT|NETWORK；192 join 拒 → 服务器码|JOIN_FAIL；175/176/210 环境/流失败仅 error；`api()` 返回 Promise；`disconnect()` 先 `post('/api/room/leave').catch()` 再 `hardReset()`。服务端凭据失效权威码 `server.mjs:871/745/350 = BAD_TOKEN`，另 `NO_PROFILE`、`SUPERSEDED`。结论：`ROOM_FULL`/`LEGACY_DISABLED`/`BAD_SNAPSHOT`/`INTERNAL`/限流/`HTTP_500` 均非身份失效，现在一律保留凭据。

■ 未改（依 V2「不要求」清单＋授权白名单）
P66 四系数 1.00/1.05/1.04/1.06、`server/*.mjs`、`js/net.js`、端口策略、历史 P1-C 四项、主存档结构、HttpOnly 迁移／服务端会话失效。
`multiLogout()` **维持不接线**（依你「现有生命周期清理路径可接受，不要求本轮强行重构」），仅补行为测试：在线先 leave 后清键／leave 失败仍清键／离线不发 leave／四种 reason 均清键／不删主存档。是否必须接线请裁定。

■ 行为级测试（非正则结构检查）
新增 `TOKEN_HARDEN_BEHAVIOR_E2E.mjs`：从真实 game.js 提取函数，在 vm 沙箱注入 localStorage/Date/Net 桩**真实调用** → **PASS=56 FAIL=0**（TTL 边界 10 例、错误分类 23 例、登出 8 例、分支口径 8 项、保存/损坏输入 7 例）。
修复后回归：语法 OK；原 `TOKEN_HARDEN_E2E` 15/15（基线未破）；`P1C_MUSE_E2E` 通过；`verify_real_logic` ✅；`node --test server/*.test.mjs` 128/128。首次 119/128（9 失败）记录**不删除**、根因未逐项定位，归档已知异常，不作「无条件全树回归 PASS」表述。

■ 请裁定
① 四项修复（TTL／三分类／.catch／过期提示）是否闭环、有无边界遗漏？
② 上述 net.js 契约摘录是否足以支撑 connect/disconnect/api 复核、错误码集合是否与你理解一致（需全文请点名，按缺件补投）？
③ 行为测试 56/56 是否满足 V2 第 4 项「实际行为断言」？
④ `multiLogout` 维持不接线是否可接受？
⑤ 综合 V2＋增量，可否签发 **PASS / CONDITIONAL / REJECT**？若仍 CONDITIONAL，只列剩余最小事项，并注明哪些结论受缺件限制。

P65P66_GPT_INCREMENTAL_END_20261113
