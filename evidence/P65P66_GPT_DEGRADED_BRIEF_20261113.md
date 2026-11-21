# P65/P66 · GPT 增量复审【降级投递件】关键节选＋缺口声明（2026-11-13）

> 依《四方协作调度规矩·补充令》一·5「同一单失败两次即降级为关键节选＋缺口声明并登记缺件待续，不许无限重试把通道卡死」。
> 本单附件上传连续失败（8/8 报「上传未成功」、发送按钮置灰），故**停止附件重试**，改以 composer 单片 <3000 字投递关键节选。
> **缺口声明（必须随裁定保留）**：以下 8 件完整原件未能在网页端送达，仅存在于磁盘，属**缺件待续**，后续按 ChatGPT 点名补投：
> `evidence/P65P66_GPT_INCREMENTAL_V3_20261113.md`、`P65P66_GPT_REVIEW_CLOSURE_20261113.md`、
> `P65P66_GPTFIX_DIFF_20261113.txt`、`P65P66_NETJS_ORIGINAL_20261113.txt`（js/net.js 原件）、
> `P65P66_BEHAVIOR_E2E_ORIGINAL_20261113.txt`、`P65P66_TOKEN_E2E_ORIGINAL_20261113.txt`、
> `P65P66_BEHAVIOR_E2E_OUTPUT_20261113.txt`、`P65P66_POSTFIX_TESTS_20261113.txt`。
> 本片**不冒充全文复审**；请按可见节选裁定，并写明哪些结论因缺件而保留。

## 冻结点
- 修复前 `js/game.js` = `5492a75ccfbf0a6a829b7706adbf78a255176b7e91211c359ee44de608be5ad1`（备份 `js/game.js.bak_20261113_pre_gptfix`）
- 修复后 `js/game.js` = `111179c945f4b8a34cccb336e36d7fad83e49d485ff4774a10d82cb335b5a6da`
- 本次增量 diff = `evidence/P65P66_GPTFIX_DIFF_20261113.txt`（6,128B，sha `a2525ab6b0faee02`），**仅 4 个 hunk、仅 js/game.js**

## 修复①（你 V2 的明确阻断项）TTL fail-closed —— 实际代码
```js
const now = Date.now();
if(!Number.isSafeInteger(o.savedAt) || o.savedAt <= 0 || o.savedAt > now || now - o.savedAt >= MULTI_SESSION_TTL){
  try{ localStorage.removeItem(MULTI_SESSION_KEY); }catch(e){}
  return null;
}
return o;
```
覆盖：缺失 / null / 字符串 / NaN / 0 / 负 / 未来时间 / 非安全整数 / **恰好 30 天（`>=`）** / 超 30 天 → 一律清键不续接；29 天仍可续接。旧格式会话失效重登，并在 `multiEnter()` 用 `hadSession && !s` 提示「上次联机会话已过期（超过 30 天或格式不兼容），请重新登录；角色与存档数据不受影响」。

## 修复② 错误三分类 —— 实际代码
```js
function multiIsCredentialFailure(r){
  if(!r) return false;
  const c = r.code;
  if(c === 'BAD_TOKEN' || c === 'NO_PROFILE' || c === 'SUPERSEDED' ||
     c === 'TOKEN_EXPIRED' || c === 'AUTH_FAILED' || c === 'REVOKED' || c === 'KICKED') return true;
  return false;
}
function multiIsNetworkError(r){
  if(!r) return false;
  const c = r.code;
  if(c === 'TIMEOUT' || c === 'NETWORK' || c === 'STREAM_FAIL') return true;
  const e = (typeof r.error === 'string') ? r.error : '';
  if(e.indexOf('超时') >= 0 || e.indexOf('没响应') >= 0 || e === 'STREAM_FAIL' ||
     e.indexOf('流连接') >= 0 || e.indexOf('环境缺') >= 0 || e === 'NETWORK') return true;
  return false;
}
```
`multiEnter()` 分支：`multiIsCredentialFailure(r)` → 清键重登；`else if(multiIsNetworkError(r))` → 保留凭据稍后重试；**else（未知错误）→ 保留凭据、提示暂未接受**。并补 `.catch()` 兜底为临时故障、不清键。

**net.js 契约核实（已从磁盘原件逐行读，网页端附件未达）**：
- `connect()` 始终 resolve（内部 `fetchJson().then().catch()` 兜底），返回 `{ok:false, code, error}`，不 reject。
- `net.js:222` 流失败 = `{ok:false, error:'STREAM_FAIL'}`，**STREAM_FAIL 在 error 不在 code** —— 这是 V2 版判定会误清 token 的具体成因，已修。
- `net.js:164` post catch → `code: TIMEOUT|NETWORK`；`net.js:192` join 拒绝 → `code: 服务器码|JOIN_FAIL`；`net.js:175/176/210` 环境/流失败 → 仅 `error`。
- `appi()` 返回 Promise；`disconnect()` 先 `post('/api/room/leave').catch()` 再 `hardReset()`。
- 服务端凭据失效权威码：`server.mjs:871` / 745 / 350 = `BAD_TOKEN`；另有 `NO_PROFILE`、`SUPERSEDED`。
- 结论：`ROOM_FULL`/`LEGACY_DISABLED`/`BAD_SNAPSHOT`/`INTERNAL`/限流/`HTTP_500` 等**均非身份失效**，现在一律保留凭据。

## 明确未改（依你 V2「不要求」清单＋授权白名单）
P66 四系数（1.00/1.05/1.04/1.06）、`server/*.mjs`、`js/net.js`、端口策略、历史 P1-C 四项修复、主存档结构、HttpOnly 迁移 / 服务端会话失效。
`multiLogout()` **维持不接线**（依你「现有生命周期清理路径可接受，不要求为了本轮强行重构」），仅补行为测试验证：在线先 leave 后清键、leave 失败仍清键、离线不发 leave、四种 reason 均清键、不删主存档。是否必须接线请你裁定。

## 行为级测试（新增，非正则结构检查）
`TOKEN_HARDEN_BEHAVIOR_E2E.mjs`：从真实 `game.js` 提取函数在 vm 沙箱注入 localStorage/Date/Net 桩**真实调用**。
`node TOKEN_HARDEN_BEHAVIOR_E2E.mjs` → **PASS=56 FAIL=0**（TTL 边界 10 例、错误分类 23 例、登出 8 例、分支/口径 8 项、保存/损坏输入 7 例）。
修复后全套回归：语法 OK；原 `TOKEN_HARDEN_E2E.mjs` 15/15（基线未破）；`P1C_MUSE_E2E.mjs` 通过；`verify_real_logic.mjs` ✅；`node --test server/*.test.mjs` 128/128。
首次 119/128（9 失败）记录**不删除**，根因未逐项定位，归档为已知异常；不作「无条件全树回归 PASS」表述。

## 请你裁定
1. 四项修复（TTL fail-closed / 三分类 / `.catch` / 过期提示）是否闭环，有无边界遗漏？
2. 上述 net.js 契约摘录是否足以支撑 connect/disconnect/api 复核；错误码集合是否与你对原件的理解一致？（若需全文，请点名，按缺件补投）
3. 行为测试 56/56 是否满足你 V2 第 4 项「实际行为断言」要求？
4. `multiLogout()` 维持不接线是否可接受，还是必须接入真实登出入口？
5. 综合 V2 + 本增量，可否签发 **PASS / CONDITIONAL / REJECT**？若仍 CONDITIONAL，只列剩余最小事项，并注明哪些结论受缺件限制。

结束标记：`P65P66_GPT_INCREMENTAL_END_20261113`
