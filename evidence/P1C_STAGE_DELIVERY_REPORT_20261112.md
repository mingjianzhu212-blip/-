# P1-C 单机道途接入（D1=(a) S.path）· 阶段性交付报告

- 日期：2026-11-12
- 任务：#59 P1-C 单机道途接入
- **状态：GPT 独立审查已 PASS（终审定稿），四方工作流尚余 Muse 第四方验收 + 用户最终裁定**
- **未宣称正式通过或关闭**（依门禁加固条款 3 与四方工作流宪法）
- 依据用户 2026-11-12 裁定：① D1=(a) `S.path` 作单机道途数据源；② Muse 冻结送审包已手动补投；③ 端口/K11/token 执行层结果由四方自判；④「改完发现没问题就可以写入」（放宽红线①，但 **GPT 独立审查＋测试门禁不省略**）

---

## 一、完成内容

1. **实施设计**：`P1C_IMPLEMENTATION_PLAN_A_20261112.md`，经 GPT 设计层 CONDITIONAL 后 6 次补正闭环。
2. **真实代码写入** `js/game.js`：D1=(a) `S.path` 本源 + 注入点 B（仅非 script 的 `playerTurn()` 伤害公式乘 `pathBonus`，每击一次、全场恒定）。
3. **落实 Muse #7 三件事**：老档补选默认值「未选」+补选入口、`load()` 白名单校验兜底、联机 `S.path` 为本源 `MULTI_PATH_KEY` 降缓存。
4. **GPT 代码层首审 4 项阻断**全部修复并复验。
5. **真实浏览器实测发现并修复 2 个真实 bug**（静态审查未发现，浏览器门禁价值实证）：
   - `renderPathPreview()` 用 `modal.insertBefore(box, cf)` 抛 `NotFoundError` → 道途选择器不创建、创角弹窗打不开。根因：`#char-confirm` 是 `.m-card` 子节点、非 `#char-modal` 直接子节点。修复：`cf.parentNode.insertBefore(box, cf)`，并动态注入 `#p1c-path-style` 样式（仍只改 `js/game.js`，不碰 `index.html`/`style.css`）。
   - `showCharModal` 用 `editing && existing` 判定锁定，但真实编辑入口 `#m-char` 传 `false`（只有重开传 `true`）→ 终身道途锁定在真实入口失效。修复：改以 `needNewGame` + `S.path` 存档状态判定。
6. **完整证据链归档**：4 份 GPT 原件、审查意见闭环记录、无损完整 diff、测试原始输出、4 张双视口截图。

## 二、修改文件

| 文件 | 性质 | 说明 |
|---|---|---|
| `js/game.js` | **唯一正式源码改动** | 13 个 hunk / 282 行 diff；当前 SHA-256 `bb6a8e89…f412acd855eed2d74daf4bf` |
| `js/game.js.bak_20261112_p1c_planA` | 改前基线 | 743,045 B，13:22 |
| `js/game.js.bak_20261112_p1c_codefix` | 回滚点① | 748,102 B，13:46 |
| `js/game.js.bak_20261112_p1c_domfix` | 回滚点②（DOM 修复前） | 751,243 B，14:55 |
| `scratch/p1c_prototype/pathBonus.test.mjs` | 新增测试 | 11 项矩阵 + 确定性附加，12/12 |
| `scratch/p1c_prototype/verify_real_logic.mjs` | 新增测试 | 从真实 game.js 抽常量/函数/注入点姿势校验 |
| `scratch/p1c_prototype/online_branches.test.mjs` | 新增测试 | 联机 4 分支逻辑层桩验证 13/13，**有限制声明** |
| `_p1c_browser_verify.js` | 新增测试 | 真实浏览器 3 场景 22 项 + 4 张双视口截图 |
| `_p1c_diag.js` | 诊断脚本 | 定位 DOM bug 根因 |
| `evidence/P1C_*.md/.txt` | 证据归档 | 设计、4 份 GPT 原件、闭环记录、完整 diff、测试输出、本报告 |
| `screenshot/p1c_*.png` | 4 张实拍 | new360 / new1280 / edit360 / edit1280 |

**白名单核对**：13 个 hunk 全落在预期行段；新增行中唯一出现 `server` 字样的是注释（说明 PATH_BONUS 独立于服务器 AXIS_GRANTS），无实际改动 server/*、联机共鸣、档案战力重算、奖励结算、`combatPower()`、`mobTurn()`、掉落。全量 `S.path` 写入点 8 处均有白名单或「仅未选时」守卫。

## 三、关键实现

- **数据源**：`S.path` 为主存档本源，初值 `''`；`load()` 白名单校验（`PATH_IDS = Object.freeze(['sword','body','dan','array'])`），脏值/缺失回落 `''`，仅 `o.path === undefined` 时一次性从 `MULTI_PATH_KEY` 迁移。
- **系数表**：`PATH_BONUS = Object.freeze({sword:1.00, body:1.05, dan:1.04, array:1.06})`，模块作用域，独立于 `AXIS_GRANTS`；`pathBonusFor()` 白名单+有限正数校验，非法返回 1。机制占位 ≤8%，最终平衡待专项 pass。
- **注入点 B**：`const pathBonus = script ? 1 : pathBonusFor(S.path);` 开战算定一次；非 script 分支 `raw = … * pathBonus`；script 场（论剑/秘境定速）、暴击率、掉落、奖励结算均不触碰。
- **联机隔离**：`multiLoadPath()` 仅返回白名单 `S.path`（未选返 `''` 触发补选，不回退旧缓存/默认 sword）；重连回写四分支（服务器非法不动、本地未选补全、冲突保留本地并 `log` 且不写缓存、一致同步缓存）；`act==='path'` 加 PATH_IDS 白名单、已选锁定、非法回值回退合法 id。
- **创角/补选 UI**：动态注入 `#char-path-picks` 容器（复用 `.char-pick` 样式 + `aria-pressed`），`pathName`、`renderPathPreview()`；`showCharModal` 按存档状态区分「新档必选 / 老档补选 / 已选只读」；`confirmChar` 创角必选拦截 + 仅本源未确定时写入；`finishBoot` 老档补选提示。
- **枚举对齐**：正式实现用联机真实四 id（`sword/body/dan/array`），弃用 scratch 原型桩（sword/blade/fist/mystic），保证联机零转换。

## 四、测试证据（三类分开记，互不替代）

| 类别 | 证据 | 结果 |
|---|---|---|
| 语法 | `node --check js/game.js` | SYNTAX_OK |
| 机制原型 | `pathBonus.test.mjs` | 12/12 PASS（四道途数值/老档无加成/脏值回退/多道途/重复攻击/script 排除/mobTurn 不受影响/奖励幂等/确定性 50 次） |
| 真实源码逻辑 | `verify_real_logic.mjs` | 全通过（白名单拒绝 `''`/未知串/`__proto__`/null、冻结不可变、单次乘算、终身锁定、DOM 修复姿势） |
| 受影响回归 | `node --test server/*.test.mjs` | **115/115 PASS，fail 0**（联机既有套件未被破坏） |
| 联机分支逻辑层 | `online_branches.test.mjs` | **13/13 PASS**，含 4 分支全情形；**限制声明：受控桩、非真服务回归** |
| 真实浏览器 | `_p1c_browser_verify.js` | **22/22 PASS**（A 创角必选 6/6、B 老档补选 7/7、C 已选不可改 5/5、4 张截图生成） |
| 真实截图目视 | 4 张 PNG 逐张 ViewImage | 360 为 2×2、1280 为一行四列；编辑态「道途·剑修（终身道途，不可更改）」、剑修高亮其余灰显；均无重叠/出屏/截断/遮挡 |
| **真服务联机 4 分支回归** | `server/multi-p1c-online-regression.test.mjs` | **13/13 PASS**（真实 `server.mjs` + 真实 `js/net.js` 客户端，端口 9011；A 组服务端链路 6 项 + B 组客户端四分支判定 7 项，均由真实 server 回值驱动） |
| 无损原件 | `evidence/P1C_FULL_DIFF_20261112.txt` | 282 行 / 13 hunk / 17,931 B；送出前后 SHA-256 一致 `fb2dc6b2…166b0` |
| 原始输出 | `evidence/P1C_FULL_TEST_EVIDENCE_20261112.txt` | 2,382 B，含各测试原始输出、全量写入点、4 份 SHA-256 |

**披露**：页内状态断言使用 `el.click()`（项目 `_playtest.js` 既有惯例，模拟点击），未覆盖真实鼠标命中区域/遮挡情形；截图页为清除无关 `#story-modal` 剧情卡，真实点击其「继续」按钮，**未屏蔽任何 DOM**。`online_branches.test.mjs` 为逻辑层桩验证，已在脚本头部声明不等价于真服务回归。

## 五、验收结果

- **GPT 独立审查：已执行 5 轮，终审定稿裁定 PASS，签发 P1-C 最终代码审查 PASS**。
  - 设计层（#1）CONDITIONAL→6 次补正闭环；代码层首审（#2）4 项阻断全修复；降级定点复审关键逻辑 PASS/整体 CONDITIONAL；最终复审 CONDITIONAL（点名 3 缺口：无损 diff、测试证据、真服务回归）；**终审定稿（#5）补交守卫最小 diff＋针对性测试＋全量 128/128 TAP 后，GPT 判两项阻断均闭合，签发 PASS，并声明「本轮审查到此结束，不再附加新的前置门槛」**。
  - 本次终审定稿两项阻断：① charPath 写入前白名单守卫（PASS）；② 全量 server 128/128 原始 TAP（PASS）。五维审查表（高风险边界/内存/解耦/异步/留存）全 PASS。
- **真实运行验收**：headless Edge + CDP 双视口 22/22 + 4 张截图目视通过；**真服务联机 4 分支回归已补做 13/13 PASS**；**Muse 第四方独立验收未派发**。
- **门禁结论**：测试全绿 ≠ GPT 审查通过 ≠ 真实运行验收通过。GPT 审查环节现已 PASS；按四方工作流宪法，仍待 **Muse 第四方验收** 与 **用户（祝）最终裁定** 二者完成，#59 方可标为正式交付完成/关闭。

## 六、风险与未完成（如实登记缺件）

1. **真服务联机 4 分支回归已完成**（GPT 点名的唯一实质缺口）：`server/multi-p1c-online-regression.test.mjs` **13/13 PASS**（真实 `server.mjs` + 真实 `js/net.js` 客户端）；落盘原件 SHA-256 与送出前一致。
2. **charPath 写入白名单守卫（GPT 终审阻断项①）已修复并复验**：改动仅 `js/game.js` `confirmChar()` 一处条件，加 `PATH_IDS.indexOf(charPath) >= 0` 守卫；定向测试 5 项行为仿真全过，所在套件 27/27；当前 `js/game.js` SHA-256 `70a9a200…`。
3. **全量 server 128/128 原始 TAP 已提交**（GPT 终审阻断项②）：`evidence/P1C_FULL_SERVER_TAP_20261112.txt`，# tests 128 / # pass 128 / # fail 0。
4. **Muse 第四方独立验收未派发**（宪法四方工作流要求：Qoder/ChatGPT/Muse/用户缺一不可）。Qoder CN 通道仍为缺件（7331 ECONNREFUSED），本轮低风险改动按「总控直写例外」处理，已在第八节认账。
5. **用户最终裁定未取得**。
6. **已知非阻断小问题**（GPT 明确不作阻断）：编辑态弹窗标题仍为「创立角色」；`el.click()` 模拟点击未覆盖命中测试。
7. **通道副作用（已闭环）**：此前 8KB `execCommand insertText` 卡死 ChatGPT 页面 JS 主线程，已用浏览器级 CDP 关闭该标签并以同 URL 重建（`BCD2C8A5…`）；本轮终审定稿改用「附件上传 + 发送按钮点击」，无卡死、无拼接损坏。

## 七、下一步（按优先级）

1. **派发 Muse 第四方独立验收**（侧聊「链路 测试 自动化 检查」，CDP 9223，目标 `2C9A0A63FB27D709`）：以新玩家身份实机试玩 + 只读证据核验；投递最小充分集（本报告 + 完整 diff + 测试证据 + 守卫修复 diff/测试 + 浏览器 4 张截图 + GPT 最终 PASS 原件），投后回读侧聊确认原文在列。
2. **提交用户（祝）最终裁定**：Muse 验收回执到手后，由用户拍板是否正式关闭 #59；届时回写《四方状态总表》与 `GAME_ROADMAP.md`（当前 #59 不关闭、不标「正式交付完成」）。
3. 排期 #60 K11 交易接口、#61 客户端 token 持久化（设计层双 PASS，待实施）。

## 八、费用与授权说明

- 本轮全部改动由 WorkBuddy **总控直写例外**执行（Qoder CN Bridge 7331 仍不可达、单方挂起）：改动均为小型/明确/低风险，且用户 2026-11-12 裁定点 4 已授权「改完发现没问题就可以写入」。此为例外认账，**不作惯例**。
- ChatGPT 网页端审查不消耗 Qoder CN 每日 200 credits；本轮本地测试与网页审查 credits 记 `spend_unknown` 不记零；每日 200 熔断规则独立生效、未触发。
- 未改 server、未改数值平衡、未动联机共鸣/档案重算/奖励/掉落，未越白名单。
