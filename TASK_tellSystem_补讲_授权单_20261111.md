# 太虚真人 V1 · tellSystem 三系统补讲 — 新授权单（复述备案）

> 任务编号：WB-TS-20261111
> 起草：WorkBuddy（总控）｜2026-11-11 17:20
> 状态：复述备案起草完成，待祝签字授权立项后派发 Qoder 执行

---

## 一、背景与依据

- **F1 四方闭环已完成**：祝 2026-11-11 签收落地（SHA `d7678245…`），Muse 第四方由 CONDITIONAL 转正式 PASS。Muse 裁定将 tellSystem 三系统补讲**明确排除出 F1 PASS 范围**，须以「未实现」登记、单独立项。
- **死代码核查（已做实，不冒充已补讲）**：
  - `guide_taixu.js:242` 定义 `tellSystem(name)`；`:247` 定义 `SYSTEM_TIP`（field / tower / npc / bag / brk 五键）；`:354` 经 `window.Guide` 暴露。
  - `game.js` 全文零调用 `tellSystem` → 确为死代码。
- **祝 2026-11-11 裁定**：「tellSystem 单独立项接线（新授权单）」。

## 二、目标

让**跳过引导**的玩家，在首次打开各系统时，由太虚真人补讲一次且仅一次。去重由 `tellSystem` 内建 `state.toldSystems[name]` 保证，刷新后仍不重复。

## 三、接线白名单（仅以下三处，全保留、brk/npc 不拆轮；均加 `typeof window.Guide !== 'undefined'` 前置判，复用现有呼告写法，不改函数体）

- **A2 实施前核账（祝令）**：接线前以现行代码实际入口为准逐处复核；若实测入口/触发时机与下述申报不符，须先向祝报备、待确认后再改，不得静默按申报落刀。

1. **`router.js` `open(name, scrollTo)`（L145）或 `bindScene` 点击处理器（L178–182）**：`enter` 之后按映射调 `window.Guide.tellSystem(sysKey)`。
   - 映射：`name==='tower' → 'tower'`；`name==='bag' → 'bag'`；`name==='dong' && scrollTo==='xx-field' → 'field'`。
   - 其余 name（role 等）不触发。
2. **`game.js` `attemptBreakthrough`（L4911，或 L4970 附近 brk 完成点）**：进入突破流程时调 `window.Guide.tellSystem('brk')`。
3. **`game.js` `npcPageEnter`（L7826，识人/沈碑页进入时序）**：进入识人/沈碑页时调 `window.Guide.tellSystem('npc')`。

## 四、禁止范围（红线）

- 不改动引导七步流程、不触 F1 已修 `load()`、不改动 `tellSystem` 函数体与去重/跳过判定。
- 不扩权到非跳过者（`tellSystem` 内部 `if(!state||!state.skipped||state.toldSystems[name]) return;` 已保证仅跳过者收到）。
- 不引入新系统键、**严格禁改 `SYSTEM_TIP` 文案**（祝令 C1：无论何种理由均不改，除非另开授权单）。
- 严格仅 `skipped` 触发（祝令 C2：非跳过者任何情况下不显示补讲；`tellSystem` 内部 `if(!state||!state.skipped||state.toldSystems[name]) return;` 已保证）。
- 不静默扩权：超出三处接线或映射变更须回祝确认。

## 五、验收标准（Muse 原话拓展）

- **硬门槛（B1，Muse 原话 + 祝令同轮验）**：用一个「跳过号」连开 **field / tower / bag** 三系统，各补讲**一次且仅一次**（`toldSystems` 三键置位、sys 栏各出现 1 条、刷新后不再重复）；`brk`（突破）、`npc`（识人/沈碑）**同标准、同轮验**（不拆轮、不延后），各一次且仅一次。
- **回归**：正常引导玩家（未跳过）打开系统**不**触发补讲（`skipped=false` 被 `tellSystem` 前置拦截）。
- **持久化**：`toldSystems` 随 `S.guide` 同事务写盘（F1 已修 `load()` 恢复 `o.guide`，天然继承）；刷新后续开不重复。

## 六、四方分工（本新单独立走完整门禁）

- **Qoder（代码执行）**：按白名单接三处；提交 diff + 新基线 SHA。不负责最终验收。
- **WorkBuddy（总控 / 测试设计 / 集成 / 最终验收）**：设计专项测试（跳过号开五系统去重 + 正常号不触发 + 刷新续走），真机 E2E 复测，收证据，依独立审查+实测作结论。不得自写自测自宣布正确。
- **ChatGPT（独立审查）**：CDP 9222 真实回执，审接线正确性、是否仅跳过者触发、dedupe、无副作用；意见非命令，逐条核实。
- **Muse（第四方验收）**：CDP 9223 侧聊原件，按验收标准出 PASS / 不通过；不代写、不扩权。
- **祝（最终裁定）**：签授权、签收落地。

## 七、费用

- Qoder CN：接线 3 处 + 测试 + 审查配合，预估 small；具体 credits 以 Qoder 回执为准，未知记 `spend_unknown` 不记零。
- ChatGPT 网页端：不计 Qoder credits。
- 每日 WorkBuddy×Qoder 200 credits 熔断独立生效。

## 八、回执清单（四方各回原件）

- Qoder：`callId` 回执 + diff 原文 + 新 SHA。
- ChatGPT：VERDICT + 逐条意见（真实回执，不冒充未读源码已验证）。
- Muse：第四方验收原件（侧聊回复，落盘）。
- WB：E2E 复测日志 + 截图。

## 九、祝签字授权（立项目）

- **祝 2026-11-11 17:30 签字授权**：确认 A1（三处接线全保留、brk/npc 不拆轮）、A2（接线前核实际入口、不符先报备）、B1（硬门槛＝跳过号连开 field/tower/bag 各一次且仅一次，brk/npc 同标准同轮验）、B2/B3（均保留为硬门槛）、C1（SYSTEM_TIP 禁改）、C2（严格仅 skipped 触发）、D（不调整）。
- **明确指令**：改稿落盘后**直接派发**，不再回呈一次签字。即按本复述备案派发执行，并走完整四方门禁（实施 → ChatGPT 独立审查 → Muse 第四方验收 → 祝最终裁定）。

## 十、当前状态

已立项·派发中（祝 2026-11-11 17:30 签字授权）。执行路径：总控直写例外实施（Qoder 桥只读，依《四方协作》补充令与 F1 先例，小型明确低风险改动由总控直写、注明原因/费用）→ 真机 E2E 专项测试 → ChatGPT 独立审查（CDP 9222）→ Muse 第四方验收（CDP 9223）→ 祝最终裁定。
