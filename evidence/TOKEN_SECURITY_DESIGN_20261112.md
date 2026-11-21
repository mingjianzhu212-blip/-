# 客户端 token 持久化 · 只读分析＋安全设计稿（2026-11-12 通宵单 · 队列 4）

> 授权：祝《通宵开发计划与授权令·2026-11-12》队列 4「完成只读分析＋安全设计稿（存储介质、登出清理、过期回退），实施排队待我批」。
> 依据两方**真实原件**（逐条标出处；本件为总控编制的执行层设计稿，不代写、不裁定）：
> - ChatGPT 原件 `evidence/OVERNIGHT_CHATGPT_ORIGINAL_20261112.md` §4.2（四种介质对比表／登出清理 6 项／过期回退 9 种情况状态机／「不能仅凭客户端解码 JWT 成功就认定有效」）
> - Muse 原件 `evidence/OVERNIGHT_MUSE_ORIGINAL_20261112.md` §Q4（localStorage 注入面真实存在／服务器侧会话失效缺位／死 token 无限重试／多标签页同写竞态）
> - 现状基线 `evidence/TOKEN_PERSIST_READONLY_20261111.md`（`MULTI_SESSION_KEY` 已持久化、路线图第 6 条口径漂移）
>
> **门禁声明**：**零代码写入**（实施 `js/net.js` 属红线①，排队待祝批）；本件不签发任何 PASS。设计审查结论以投递后两方回执原件为准。

## 一、只读分析（现状，沿用核实不重复）
- `js/game.js:7288-7305`：`MULTI_SESSION_KEY='jxwd_multi_session_v1'`，`multiLoadSession()/multiSaveSession({token,name,base,roomId})/multiClearSession()` —— UI 层**已用 localStorage 独立键持久化 token**（不进主存档 `SAVE_KEY`）。
- 写入点 7705（登录成功）；恢复点 7346-7357（刷新重连，失败即 `multiClearSession()` 提示重登）；清理点 8498/11468（转世/重开）。
- `js/net.js:170-180` `connect(..., resumeToken, ...)` 续接契约；`js/net.js:247` `disconnect()` 主动 `post('/api/room/leave')`。
- 口径漂移登记（不改定版）：`GAME_ROADMAP.md` 第 6 条「token 只在内存、刷新即丢」对 UI 装配层**已过时**；只登记、不修订定版正文。
- Muse 原件点名「**本游戏全量 innerHTML 重绘、文本注入面真实存在**」，故 localStorage token 的 XSS 可读风险不是理论风险。

## 二、安全设计稿 · 三要素

### 2.1 存储介质
| 介质 | 优点 | 主要风险 | 来源 |
|---|---|---|---|
| localStorage（现行） | 可跨浏览器重启持久化 | XSS 可读取；Muse「全量 innerHTML 重绘、文本注入面真实存在」 | ChatGPT＋Muse |
| sessionStorage | 关闭标签页通常清除 | 不能满足长期持久登录 | ChatGPT |
| 内存变量 | 不长期留存 | 刷新后丢失 | ChatGPT |
| HttpOnly + Secure + SameSite Cookie | JS 无法直接读取 | 需服务器配合及 CSRF 防护 | ChatGPT |

**设计要求**（两方原件合并）：
- ChatGPT：「如果服务器认证架构允许，优先考虑 Secure、HttpOnly、SameSite Cookie；如果必须使用客户端 Bearer Token，则必须将 XSS 视为重要威胁」；「不要将 token 写入普通日志、调试信息或错误报告」；「不要把 token 当作可信的用户身份声明」；「不能因为已有 `MULTI_SESSION_KEY` 就默认其设计符合安全要求」。
- Muse：「localStorage 持久但可被注入脚本读走……此风险须在设计稿中**正面写明而非回避**」。
- **待裁定（不改定版、不自决）**：是否从 localStorage 迁移到 HttpOnly Cookie 涉及服务器认证架构改造，超出队列 4「设计稿」范围，登记为后续选项交祝。

### 2.2 登出清理
**ChatGPT 原件 6 项最小要求**：①清除持久化 token；②清除内存认证状态；③清理与当前会话绑定的认证缓存；④取消或隔离尚未完成的认证请求；⑤更新 UI 为未登录状态；⑥确保下一次请求不会继续携带旧 token。
**须区分四种情况**（ChatGPT）：用户主动登出／token 过期／token 被服务器撤销／网络临时不可用——「不能全部处理成同一种数据清理操作」；「尤其不应在登出时顺带删除无关的游戏存档和本地角色数据」（与红线③一致）。
**Muse 原件点名缺口**：「只清本地键挡不住已复制 token，**服务器侧会话失效缺位须登记为已知缺口**」。
**顺序约束**（沿用基线第 4 点）：`disconnect()` 先 `post('/api/room/leave')` 通知服务端，再 `multiClearSession()`，避免本地先清导致 leave 请求无 token。

### 2.3 过期回退（状态机）
| 情况 | 预期处理 | 来源 |
|---|---|---|
| token 合法 | 恢复登录状态 | ChatGPT |
| token 过期 | 清除失效凭据，回到未登录 | ChatGPT |
| token 被撤销 | 清除凭据，回到未登录 | ChatGPT |
| token 格式损坏 | 安全拒绝，不崩溃（`multiLoadSession` 已有 try/catch） | ChatGPT＋基线 |
| token 缺失 | 正常游客或未登录状态 | ChatGPT |
| 网络断开 | **不把网络错误误判为 token 失效** | ChatGPT |
| 服务器暂时异常 | 不盲目清除可能仍有效的凭据 | ChatGPT |
| 登出后刷新 | 不恢复旧登录状态 | ChatGPT |
| 失效 token 续接被拒 | 清键并回退全新连接，**防「拿着死 token 无限重试」循环** | Muse |

**ChatGPT 原件硬约束**：「不能仅凭客户端解码 JWT 成功，就认定 token 有效。最终有效性由服务器验证」；「如果存在 refresh token，还必须设计轮换、重放检测及撤销机制，不能无限期复用旧凭据」。
**Muse 原件补充风险**：「多标签页同写一键的竞态」须纳入设计。
**待补（基线第 3 点）**：token 无本地 TTL／`savedAt` 字段与最大续接窗口，长期残留旧 token 仅靠服务端拒绝才失效。

## 三、最小充分测试集（设计层，供实施轮；不冒充已执行）
刷新后续接成功／服务端拒绝续接→清键并提示重登／转世重开清空／多标签同 token 竞态／脏值 JSON 解析失败安全回退／SSE 断线重连不重复写／死 token 不无限重试／网络断开不误清凭据。

## 四、边界声明
- 只读核实＋安全设计稿；**零代码写入**，未跑测试、未做实机验证；未核验 `net.js` 全部调用链与服务端 token 失效逻辑。
- 实施（`js/net.js` 及服务器认证架构）按授权令**排队待祝批**，本件不触碰红线①。
- 与 P1-C D1 选项 (b) 相关但不等价：`MULTI_PATH_KEY` 是「下次连服务时报哪个道途」的偏好键，注释明确「权威在服务器 player.path」，不能因 session 已持久化就推定它可作单机道途权威状态。
