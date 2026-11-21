# 《九霄问道》太虚真人新手引导 — 四方任务单（草案 v1）
- 日期：2026-11-11
- 状态：祝已拍板人设与脚本（见 spec 第六节 1–4）；本单为按四方流程落地之任务单草案，待四方走完。
- 来源 spec：《九霄问道》新手引导师傅——人设与开局气泡脚本（草稿 v1），2026-11-11。

## 一、范围与目标
- 用「专职引导人物 太虚真人（道号；俗名顾长眠）」+「气泡悬浮排」+「渐进解锁」一次性治四条：
  ① 无人引见沈碑；② 一创角功能全解锁；③ 引导气泡卡死/挂旧文案；④ 教完撒手 rank5–9 死区（死区本身另立项，本单不扩展其长度）。
- 交付：客户端引导模块（新增）+ tutorial 改造/替换 + 存档键 `jxwd_guide_v1`（step/done/skipped）。

## 二、验收标准（来自 spec 第三~五节 + 技术军规）
A. 新号 E2E：6 分钟内走完第 0~6 步，终点 = 与沈碑完成第一次对话（NPC 线细化口径待 F-01 统一，不在本单拍板）。
B. 引导后 10 分钟内目标栏始终有明确下一步（沈碑目标接棒）。
C. 技术军规五条逐条实测（不许只验文案不验底层状态）：
  1. 气泡层活在渲染外状态层，点击不进重绘 DOM 生命周期。根因：现 tutorial.js 用 `document.addEventListener('click', guard, true)` 捕获取消（js/tutorial.js:116），正是被重绘吞点击的老底子。
  2. 气泡点击成功率以实机 E2E 验：第 0~6 步每步点击一次生效，无「点了没反应」。
  3. 断点续走：刷新/关页重进从断点恢复，不重播/不丢进度/不重复发丹药（丹药发放与 step 原子绑定，只发一次）。
  4. 跳过路径：点「先别唠叨」立即结束 + 全部解锁 + 无残留气泡；跳过后再开新系统补一句。
  5. 台词零开发残留：全量扫引导文案，命中开发者指令类文本为 0。

## 三、四方分工（宪法）
- 总控 WorkBuddy：本任务单 + 验收标准 + 调度 + 集成 + 最终结论。
- 代码执行 Qoder：实现客户端引导层（新建 js/guide_taixu.js + 改写 tutorial.js 为状态机 + 渐进解锁 + 跳过 + 存档）。注：本会话 Qoder CN Bridge 此前不可达，真实运行/测试按补充令改派 Muse。
- 独立审查 ChatGPT：经 CDP 9222 直读实际代码 + 架构（气泡外渲染层、存档原子性、点击可靠性）+ 技术军规逐条核验。
- 验收 Muse：经 CDP 9223 侧聊，按验收口径做新号实机走查（6 分钟、每步点击、断点续、跳过、零残留）+ 出体验审计报告。
- 祝：最终裁定（含游戏代码写入授权）。

## 四、授权边界与白名单
- 不碰：server/ 后端（K11 账本/交易）、asset-ledger.mjs、#64 已定稿逻辑。
- 丹药发放：复用现有背包/物品接口（下品聚气丹×1，祝已定），不新造经济回路。
- 新增：js/guide_taixu.js（或等价新模块）；tutorial.js 改造为状态机；存档键 jxwd_guide_v1（当前未占用，已核对无冲突）。
- 红线：游戏正式代码写入须祝单独授权；六类停问事项未批不动。

## 五、实施切片建议（给代码执行方任务单草稿）
1. 架构：气泡层独立于 game.js 的 render() 生命周期（技术军规1 根因），用独立状态容器 + 事件委托而非 document 级 capture 拦截。
2. tutorial.js → 状态机：step/done/skipped，`jxwd_guide_v1` 持久化，断线/刷新续走。
3. 渐进解锁：未教系统灰置锁定，教一个解一个（作废一创角全解锁）。
4. 跳过：常驻「先别唠叨」，点了结束 + 全解 + 打日志；跳过者对应系统首次打开补一句。
5. 丹药：第 4 步发放与 step 原子绑定（只发一次，断点续不重发）。
6. 台词：全量扫描零开发残留；按 spec 第 0~6 步文案落库。

## 六、当前状态（2026-11-11 更新）
- ✅ 只读核实现状：js/tutorial.js 即被替换对象，确认现用 document 级 capture 点击拦截（js/tutorial.js:116），正是 spec 指认的卡死老底子；`jxwd_guide_v1`/本单用 `S.guide` 当前未占用；js/game.js 主循环大量 render()，气泡须外置——已全部落实。
- ✅ 实施完成（总控直写）：Qoder CN Bridge 本会话不可达，本单按「总控直写例外」由 WorkBuddy 直接落地（小改、低风险、已说明原因与费用）。改动清单：
  1. 新建 `js/guide_taixu.js`（257 行，IIFE 自包含）：GuideState/GuideController/GuideView 三分，完成判定读权威业务状态（window.S）或业务成功后调 `Guide.complete(stepId)`，**绝不监听全局捕获点击**；丹药发放与引导进度同 window.saveGame 事务、唯一凭证幂等；跳过仅释放引导限制不覆盖原生解锁；`scanResidue()` 全量扫文案（命中须为 0）。
  2. `js/game.js` 接线：① `const S` 增 `guide:{...}` 初始字段；② 暴露 `window.S/window.addItem/window.saveGame/window.log`；③ `finishBoot()` 末调 `Guide.init()`（新/老/导入三路汇聚点）；④ 四处业务成功点插 `Guide.complete('sit'/'brk'/'field'/'handoff')`（打坐/突破/灵田/沈碑）；⑤ `resetAll()` 重置 `S.guide`（重开引导重播）；⑥ `ITEMS` 注册 `dan_juqi`（下品聚气丹，复用 dan1.png 图标）。
  3. `index.html`：移除 `tutorial.js`（其 capture 点击为卡死根因），改挂 `js/guide_taixu.js`（置于 router.js 之前）。
- ✅ 逻辑自检（Node 仿真，非浏览器）：重建为 `_selfcheck_guide.js`（原脚本未留存），覆盖 R1–R6/C1–C5 关键行为，**PASS=32 FAIL=0 ALL_GREEN**——含 R1 老玩家识别/断点续走、R2/R3 丹药原子+失败不写凭证+重进补发、R4 追叙即时 persist、R5 回调守卫、C1–C5 逻辑、跳过无残留、非当前步 complete 被拒、scanResidue=0。syntax-check（node --check）guide_taixu.js 通过（game.js 9 处接线 grep 确认仍完好）。
- ✅ ChatGPT 架构评审（旁聊 9222）已回：方向认可、采纳其修正设计（业务成功驱动完成 / POLL 状态验证 / 丹药同事务+唯一凭证 / 双层解锁 / 5 组 E2E + 3 额外验证），非正式 PASS；本次实施严格按其修正落地。
- ✅ ChatGPT 正式独立审查（实施后，非旁聊，CDP 9222）已回收正文（回执 `chatgpt_guide_formal_review_20261111.md`，VERDICT=需修正，不签发 PASS）：清单 R1(高,init误判老玩家) R2/R3(高,claimDan写凭证时机/原子) R4(中,after未即时persist) R5(中,定时器回调校验) R6(中,扫描范围不全) + 边缘 C1(降级定位) C2(重绘重定位) C3(interval清理) C4(data-guide-step清理) C5(resetAll后state绑定)。已按审查意见**逐条落地全部修复**（guide_taixu.js 两批共 9 处 Edit，语法校验通过，逻辑自检 32/32 全绿）。
- ✅ **ChatGPT 独立审查最终裁定：PASS**（门禁闭环）。三轮复审链路：① 正式审查（BsV4uN→`chatgpt_guide_formal_review_20261111.md`，VERDICT=需修正，R1–R6/C1–C5）；② 复审 lGMulM（VERDICT=仍有问题，余 R2/R3 证据、R6 兜底层、C1 可见性、C5 重绑定 4 项）；③ 复审 YKiatY（R1–R6 + C1–C4 全通过，C5 证据不足）→ 补交 C5 证据（4oD9u2 → `chatgpt_guide_c5_final_20261111.md`）：**C5 核销，最终 VERDICT=PASS**。审查明确「后续可进入集成验收与实际游戏体验验证阶段」。逻辑自检同步 PASS=36 FAIL=0。
- ✅🔶 **Muse 第四方验收（9223 侧聊）：已回收验收报告原件 → 结论 HOLD（2 项阻断，均在证据层，非实现被证伪）**。投递成功（exit 0 / DONE_OK）后，Muse 于侧聊回验收报告（原件落 `muse_guide_acceptance_reply_20261111.md`，末标 `MUSE_GUIDE_ACCEPTANCE_END`）。要点：
  - **① 只读技术核验无法执行**：任务单让 Muse「直接读本地文件」但**未附文件附件**，Muse 环境访问不到 `D:/xx-scratch/...`；点名补件：`guide_taixu.js`/`game.js`/`index.html`/仿真自检脚本+36/36 输出/`chatgpt_guide_c5_final_20261111.md` 原文。→ 可补：将证据文件**附件原样投递**侧聊后，Muse 可逐条出「成立/不成立+行号」。
  - **② 证据链闭环核验**：36/36 是 Node 逻辑仿真、ChatGPT 三轮是代码/逻辑审查，**交互层真实证据为零**（气泡在 500ms 重绘下的真实存活与点击、真实刷新断点恢复、真实跳过体感）；引实测前科「沈碑来访气泡静态/逻辑层无断点、三局实机仍点不开」→ 拒以仿真 36/36 冒充真实点击证据。
  - **③ 体验审计 3 雷点**：断点续走刷新（发丹/交接步高危、存档按域名隔离）、跳过补讲（连环弹泡变新打扰＝回归「一创角全解锁」老问题）、渐进解锁挡点击与**终点接棒（沈碑对话链三局实机从未跑通，终点断链＝全程白走）**。
  - **补验路径**：① 补投实现+证据文件附件；② 由持有浏览器环境方（调度侧或 ChatGPT CDP）按第③节清单跑新号 E2E（七步逐点、发丹/交接步各刷新、第二号走跳过、终点真跑通沈碑首聊并验记忆落盘），录屏/日志回投 Muse 复核。两项补齐后 Muse 复审可转 PASS。
  - **性质判定**：HOLD 为合规第四方意见，未证明实现有错；第②项的沈碑终点为**既有游戏问题**（F-01 / rank 5–9 死区，本单不扩展），是否单独立项超出本单授权，须祝裁定。最终 PASS 裁定权在祝。
- ✅🔶 **Muse 第四方验收（续）：补投证据附件后升级为「有条件通过 CONDITIONAL PASS」**。按用户「先补附件，E2E 待你裁定」，用 `send_guide_evidence_muse.mjs`（仿 v4：`DOM.setFileInputFiles` 挂 6 份文件 + 真实点击发送）投递 guide_taixu.js/game.js(740KB)/index.html/_selfcheck_guide.js/36-36 输出原件/ChatGPT 终审原文（`filesSet=true`/`READBACK hit:1`/`museReplyDone=true`）。Muse 独立核验（原件落 `guide_evidence_muse_reply.txt`，末标 `MUSE_GUIDE_REVIEW2_END`）：逐行读 guide_taixu.js(341)、对 game.js 基线 diff、独立复跑自检 **36/36 ALL_GREEN exit 0**；五条口径代码/逻辑层**全部成立**（气泡外渲染层、双通道完成判定+幂等、断点续走+丹药原子、跳过无残留+补讲、台词零残留）。**剩余唯一条件＝真浏览器实机 E2E（调度侧已登记未执行，待祝裁定）**。两项非阻断发现：
  - **F1（跨任务改动登记）**：game.js:7396 `ML.claimSettlement/LEDGER_UNAVAILABLE` 标「#63 收口①」，属**先于本单的 #63 联机结算改动**，非本单 9 处之一。复核当前 `js/multi-ledger.js`（Nov 10）第 116/122 行已导出 `claimSettlement`→**运行时风险不成立**；仅须跨任务点名登记，非阻断。
  - **F2（渐进解锁视觉层缺失，轻微）**：`applyLocks` 为空实现、三份文件无 `.guide-active/[data-guide-step]` 变灰 CSS——「未教学系统轻微变灰」未落地，现行仅步骤顺序解锁、无视觉分层；不挡点击（反而更安全），但与 spec 口径不符，请制作人定：补 CSS 或改 spec 表述，二选一登记即可。
  - **结论**：第四方代码/逻辑层验收通过；E2E 缺口 + F2 视觉决策留祝裁定，F1 已证无运行时风险。
- ✅ **F2 视觉补件已闭环**：按用户「先补 F2 视觉再定」，已实装渐进解锁视觉层——`applyLocks()` 由空桩改为依据 `state.step` 给未教系统加 `.guide-locked`（仅 `filter:grayscale(.75);opacity:.5`，**不挡点击、不覆盖原生解锁**），`injectStyle()` 注入 `body.guide-active .guide-locked` 规则，`render()`/`tick()` 调用、`hideBubble()`/`clearLocks()` 在结束与重置时清除；入场步（target=.app）不入灰避免整页灰置。`node --check` 通过、自检仍 **36/36 ALL_GREEN**。补件已重投 Muse（`send_guide_f2_patch.mjs` → `guide_f2_muse_reply.txt`，15:10 回执 **MUSE_GUIDE_F2_RECEIPT_END**）：Muse 逐行 diff 确认改动严格限于 F2 申报范围、无夹带，CSS 只动 filter/opacity 不触 pointer-events、不挡点击、不覆盖原生解锁，结束/跳过/重置均无残留；独立复跑自检 **36/36 ALL_GREEN** → **F2 已闭合归零**。
- ⚠️ 未完成/风险（截至本状态）：① **真浏览器实机 E2E 缺口（唯一未决项）**：每步点击、断点续走刷新、跳过体感、终点沈碑接棒——逻辑/代码层已证（自检 36/36 + ChatGPT PASS + Muse CONDITIONAL PASS），但交互层真实证据为零；按用户「E2E 待你裁定」留作独立验收项，未冒充通过。② **F1 跨任务登记仍挂开放**：属 #63 联机结算线（`ML.claimSettlement` 依赖的 `js/multi-ledger.js` 现行含该方法→运行时无风险），不属引导模块范围，Muse 点名补件尚未投递，待原件到手单独核销，不挡本单 E2E 后转 PASS。③ 下品聚气丹复用 dan1.png 图标（未新增美术资源，未碰 asset-ledger）。④ F-01 与本单并行不阻塞。⑤ 游戏正式代码写入须祝单独授权（本单为引导模块落地，最终裁定待祝）。

## 七、授权与门禁裁定追加（2026-11-11 15:21 用户明确）
- ✅ **「总控直写例外」本次认账并登记在案，不得成惯例**：本单因 Qoder CN Bridge 本会话不可达，依《四方协作调度规矩·补充令》"总控直写例外"由 WorkBuddy 直接落地代码；此例外**仅适用于本单**，今后任何开发任务不得默认沿用，须仍走 Qoder 桥或明确二次授权。
- ✅ **正式落地以 E2E 通过版文件为唯一底本**：本单若最终通过（ChatGPT PASS + Muse 复核转 PASS + 用户裁定），正式游戏代码写入的**唯一底本 = 经 E2E 全矩阵验证通过的 `js/guide_taixu.js` / `js/game.js` / `index.html` 当前版本**；此后任何改动须在此底本之上、重新走四方流程，不得回退或并行另写。
- ✅ **E2E 执行授权（方案1）**：用户授权跑 E2E 全矩阵——新号七步逐点、发丹步与交接步各刷新验底层值、二号走跳过路径、终点沈碑首次对话并验记忆落盘；沈碑若卡在既有 bug 如实记录、不许绕。E2E 原件回投 Muse 旁聊复核，转正式 PASS 后再报用户裁定。
- ⛔ **E2E 通过前红线**：不签最终 PASS、不动正式游戏代码。
- ✅ **F1 跨任务登记维持开放**：不挡本单。
