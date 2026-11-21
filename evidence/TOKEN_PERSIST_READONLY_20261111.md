# 客户端 token 持久化 · 只读分析与安全设计（零代码写入）· 2026-11-11 23:00 单

> 依据两方真实原件：ChatGPT「第四位：客户端 token 持久化分析……先完成安全边界分析、生命周期和失效处理设计」「可以立即做｜只读分析、设计、测试」；Muse「token 持久化：只做只读分析＋安全设计（存储介质/登出清理/过期回退），实施排队」「实施属红线①，必须停下」。本件只做只读核实与设计要点，**不写 `js/net.js` 一行代码**。

## 一、只读核实：现状与既有口径不一致（如实登记，不改定版）
| 来源 | 原文/事实 | 判定 |
|---|---|---|
| `GAME_ROADMAP.md` 「下一步」第 6 条 | 「客户端 token 持久化（约 3 行，`js/net.js`）：当前 token 只在内存、刷新页面即丢」 | **该描述对 UI 装配层已过时**，见下 |
| `js/net.js:7` | 「存储键：无（token 只在内存，刷新页面重新 connect——联机会话本就短生命）」 | 指**协议层 net.js 自身**不落盘，属实；不代表整个客户端不存 |
| `js/game.js:7288-7305` | `MULTI_SESSION_KEY='jxwd_multi_session_v1'`；`multiLoadSession()` / `multiSaveSession({token,name,base,roomId})` / `multiClearSession()` | **UI 层已用独立键持久化 token**（不进主存档） |
| `js/game.js:7705` | 登录成功后 `multiSaveSession({ token: r.me.token, name, base, roomId:null })` | 写入点确认 |
| `js/game.js:7346-7357` | 刷新后 `multiLoadSession()` 取 token 走重连；失败则 `multiClearSession()` 并提示重登 | 恢复与失效回退已存在 |
| `js/game.js:8498 / 11468` | 转世 / 重开均 `multiClearSession()` | 清理点确认（「刷新续接只针对同一世内」） |
| `js/net.js:170-180` | `connect(..., resumeToken, ...)`；`if (resumeToken) joinBody.token = String(resumeToken)` | 服务器续接契约确认 |

**结论**：`GAME_ROADMAP` 第 6 条与现状存在口径漂移。按两方一致的「记录对齐、不改定版」纪律，本件**不修改 `GAME_ROADMAP.md` 原文**，仅在状态总表登记该漂移，供祝后续决定是否修订待办清单。此项与 P1-C 口径漂移同性质，但**不自行追加勘误到方案正文**。

## 二、安全设计要点（设计层，供实施轮；不预设已批）
1. **存储介质**：现行方案为 `localStorage` 独立键（`MULTI_SESSION_KEY`），不含 `SAVE_KEY` 主存档，符合「不进主存档」既有纪律；设计层需评估 XSS 可读风险与「同浏览器多标签共享 token」的语义。
2. **生命周期**：写入仅在 connect 成功与进出房间时；主动离开 / 转世 / 重开清空（现行 3 处已覆盖）；**待补**：SSE `lost` / `bye` 事件与服务端主动失效时是否同步清理，需实施轮核实。
3. **过期与回退**：现行重连失败即 `multiClearSession()` + 提示重登（7350），属安全回退；**待补**：token 无本地 TTL/过期时间字段，长期残留的旧 token 仅靠服务端拒绝才失效，建议设计层评估加 `savedAt` 与最大续接窗口。
4. **登出清理**：`disconnect()`（`net.js:247` 主动 `post('/api/room/leave')`）与 `multiClearSession()` 的调用顺序需保证「先通知服务端、再清本地」，避免本地先清导致 leave 请求无 token。
5. **最小充分测试集**（供实施轮）：刷新后续接成功、服务端拒绝续接→本地清空并提示、转世/重开清空、多标签同 token 行为、脏值/JSON 解析失败安全回退（`multiLoadSession` 已有 try/catch）、SSE 断线重连不重复写。

## 三、边界声明
- 只读核实＋设计要点；**未改任何代码**、未跑测试、未做实机验证；未核验 `net.js` 全部调用链与服务端 token 失效逻辑。
- 本件**不签发**任何 PASS；实施（写 `js/net.js`）按两方原件一致口径属红线①，排队待祝明确授权。
- 与 P1-C 的 D1 选项 (b) 相关但不等价：`MULTI_PATH_KEY`（7274）是「下次连服务时报哪个道途」的**偏好键**，注释明确「不是权威值；权威在服务器 player.path」，不能因 session 已持久化就推定它可作单机道途权威状态。
