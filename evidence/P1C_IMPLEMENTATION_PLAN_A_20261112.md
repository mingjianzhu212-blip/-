# P1-C 实施施工设计（D1=(a) `S.path`）· 2026-11-12

> 授权：用户 2026-11-12 12:40 裁定点 1「D1 = (a) `S.path`」＋点 4「改完发现没问题就可以写入」（仍须 GPT 独立审查＋测试门禁）。
> 依据原件：
> - ChatGPT 设计层 PASS 原件 `evidence/OVERNIGHT_CHATGPT_VERDICT_20261112.md`（P1-C Q1 PASS）
> - Muse 冻结送审包裁定原件 `evidence/OVERNIGHT_MUSE_VERDICT_20261112.md`（Q1 PASS、Q2 允许 scratch＋11 项、#7 接受 (a) 并钉死三件事）
> - 设计评审件 `evidence/P1C_IMPLEMENTATION_DESIGN_FINAL_20261112.md`（注入点 B 推荐、11 项矩阵、禁止范围 7 条）
> - 只读核实：`js/game.js` 现状（S 初值 154 / load 3907 / save 3850 / confirmChar 11236 / S 重置 11477 / MULTI_PATH_KEY 7292 / multiLoadPath 7324 / openBattleAnim 10461 / playerTurn 10583 / 伤害公式 10598-10603 / mobTurn 10621）、`server/profile.mjs:86-91`（AXIS_GRANTS 四道途）、`js/net.js:171`（联机道途枚举 sword/body/dan/array）
>
> **门禁声明**：本件为**施工设计（含具体改动点、代码骨架、测试集）**，不是实施授权本身；按用户裁定点 4，改动须经本件投递 → **GPT 独立审查（真实发送＋回取正文＋逐条闭环）→ 真实浏览器实测 → 写入 `js/game.js`**。本件不冒充审查通过、不预设 PASS。
>
> **审查状态（2026-11-12）**：GPT 独立审查裁定 **CONDITIONAL**（裁定原件 `P1C_PLAN_A_GPT_REVIEW_20261112.md`，闭环 `P1C_PLAN_A_GPT_CLOSURE_20261112.md`）。D1=(a)/注入点 B/客户端常量方向均受认可；须修正 7 项设计矛盾后方可进入实施。下方 §四/§五/§七 已按闭环清单补正，**补正后不需再送整套设计审查**，直接进入「实现代码 → GPT 审查真实改动 → 真实浏览器实测 → 测试门禁通过 → 写入正式文件」。

---

## 〇、与冻结草案（GAME_PATH_SYSTEM_P1C.md）的关系

冻结草案（2026-11-10）**推荐方案 B（复用 MULTI_PATH_KEY、不进主存档）**，并明确「方案 A 不建议」。本件**不沿用该推荐**：用户 2026-11-12 裁定与 Muse #7 已确认 **D1=(a) = 主存档新增 `S.path`**。草案的核查事实（伤害双分支、script 排除、mobTurn 排除、系数不在客户端）仍成立，本件在 (a) 前提下重新给出数值来源决策（见 §五）。

---

## 一、道途枚举与权威来源（对齐联机口径）

| id | 名称 | 说明 |
|---|---|---|
| `sword` | 剑修 | 武器轴（对照 `AXIS_GRANTS.sword`） |
| `body` | 体修 | 装备/词缀轴 |
| `dan` | 丹修 | 丹力轴 |
| `array` | 阵修 | 悟性轴 |

- **四 id 直接复用联机枚举**（`js/net.js:171`、server `profile.mjs` 一致），保证 S.path 作为本源时联机零转换成本。
- **权威来源**：`S.path`（主存档字段，创角必选、终身伴随）。
- **离线**：本地存档自带，离线可用（解决冻结草案风险 #2「离线不生效」）。
- **老档兜底**：load 时若 `o.path` 缺失/非法 → 置 `''`（未选），触发补选入口（§三）。

---

## 二、数据模型改动（白名单校验兜底，F1 老办法）

### 2.1 S 初值（js/game.js:154）
在 `rootIdx: 1,` 之后新增 `path: '',`（默认未选；新档在创角流程写入具体值）。

### 2.2 load() 恢复（js/game.js:3933-3936 数字字段块之后）
```js
/* P1-C（D1=(a)）：道途为主存档字段。仅接受联机同款四 id，脏值/缺失回落 ''（未选）。
   对齐 F-01 白名单兜底：不接受未知键、不接受非字符串、不接受原型污染键。 */
if (typeof o.path === 'string' && PATH_IDS.indexOf(o.path) >= 0) {
  S.path = o.path;
} else {
  S.path = ''; // 老档/脏档 → 未选，等补选入口
}
```
- 常量 `PATH_IDS = ['sword','body','dan','array']` 在具体改动处就近定义（与 `multiPathCatalog` 同源，不重复硬编码语义）。
- **不**改数字字段迁移逻辑、不碰 `SAVE_KEYS` 脏档闸门。

### 2.3 save()（js/game.js:3862）
无需改：`JSON.stringify(S)` 已含 `path`，随主存档自动持久化。

### 2.4 S 重置（js/game.js:11477）
`S.name = ''; S.sex = 'm'; ...` 处追加 `S.path = '';`（重开/转世走新创角流程重新必选）。

---

## 三、创角必选 ＋ 老档补选入口（UI）

### 3.1 新档创角必选
- `confirmChar()`（11236）当前仅落 `name/sex/gender`。新增：创角模态内**道途四选一**（必选，未选禁止确认）。
- 在 `S.name = name;`（11240）之后写入 `S.path = selectedPath;`（selectedPath 来自模态内选择，默认值不预置、强制用户点选）。
- 老档（`needNewGame===false`）走 `finalizeNewGame` 不受影响；新档 `finalizeNewGame`（11253）仅补灵根，不碰 path（已在 confirmChar 写好）。

### 3.2 老档补选入口
- 当 `S.path === ''`（未选）时，在人物/设置面板显示一个「选择道途」入口（复用语义与创角四选一相同的渲染函数 `renderPathPicker`）。
- 选择后写 `S.path` 并 `save()`；写入后入口隐藏。
- **终身伴随**：一旦选定，入口不再出现；不提供洗点/转职（禁止范围 #5 已固化）。

> 注：UI 具体挂载点（哪个面板 DOM id）需在实施时对照 `render()` / 设置面板现状确定，属低风险 DOM 注入；GPT 审查与浏览器实测会覆盖该处。

---

## 四、联机隔离（S.path 为本源，MULTI_PATH_KEY 降缓存）

Muse #7 钉死：「联机以 `S.path` 为本源、`MULTI_PATH_KEY` 降缓存」。

### 4.1 `multiLoadPath()`（js/game.js:7324）改报本源
```js
function multiLoadPath(){
  // P1-C：本源为 S.path；未选('')返回 ''（触发补选），不回退旧缓存、不默认 sword
  // （GPT 审查矛盾 A：旧缓存/默认 sword 会冒充已选道途，与「补选」规则冲突）
  return (typeof S.path === 'string' && PATH_IDS.indexOf(S.path) >= 0) ? S.path : '';
}
```
> 旧缓存仅作**一次性迁移**候选：当且仅当存档原始 `o.path` 缺失、且 `MULTI_PATH_KEY` 为合法 id 时，方在 `load()` 内迁移进 `S.path` 并 `save()`；**不得每次读取都让缓存覆盖本源**。若 `o.path` 已存在（含 `''`），不读缓存。

### 4.2 连接成功回写本源（js/game.js:7370、7721）
原：`if(r.me && r.me.path) multiSavePath(r.me.path);`
改（冲突处理，非静默覆盖；GPT 审查③）：
```js
if(r.me && r.me.path){
  // 本地未选 → 用服务器值补全本源；本地已选 → 不静默覆盖（避免绕过终身选择）
  if(typeof S.path !== 'string' || PATH_IDS.indexOf(S.path) < 0){ S.path = r.me.path; }
  else if(S.path !== r.me.path){ /* 本地/服务器均有效但不一致：登记冲突、停覆盖，仅缓存服务器值 */ }
  multiSavePath(r.me.path); // MULTI_PATH_KEY 仅作缓存
}
```

### 4.3 离线选择（js/game.js:7735）
原：`multiSavePath(id); renderMulti(); return;`
改：`S.path = id; multiSavePath(id); renderMulti(); return;`

### 4.4 不触碰
不改 `server/server.mjs`、`server/profile.mjs` 联机共鸣与档案重算（禁止范围 #4）；不改 `multiSnapshot()` 上报结构（仍只送 id）。仅客户端读报口径把本源从本地键换成 `S.path`。

---

## 五、注入点 B（伤害乘算，每击一次、全场恒定）

### 5.1 常量与取值（client-side 系数表，单一来源）
```js
/* P1-C 伤害乘子（单机道途）。D1=(a)：path 为单机角色属性，注入点 B 为纯客户端、排除联机，
   故系数取客户端常量，不复用服务器 pathAxisScore（后者留作联机共鸣）。
   数值为初始平衡占位（≤8%），最终系数待平衡专项 pass 确认；本任务只交付机制。
   PATH_BONUS 独立于 server AXIS_GRANTS（两者不同系统，不混用，GPT 审查①）。
   置于模块作用域、Object.freeze，使 load() 与 multiLoadPath() 均可见且不可变（GPT 审查⑥）。 */
const PATH_IDS = Object.freeze(['sword','body','dan','array']);
const PATH_BONUS = Object.freeze({ sword: 1.00, body: 1.05, dan: 1.04, array: 1.06 });
function pathBonusFor(pathId){
  if (PATH_IDS.indexOf(pathId) < 0) return 1;        // 未选/脏值 → 1（无加成）
  const v = PATH_BONUS[pathId];
  return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 1;
}
```

### 5.2 注入点 B 实施（openBattleAnim 内）
- 在 `const pMax = combatPower(), mMax = ...`（10498）之后，`const powRatio = ...`（10502）附近，计算**战斗常量**：
  ```js
  const pathBonus = script ? 1 : pathBonusFor(S.path); // P1-C：开战算定一次；script 场不调用取值函数（GPT 审查⑤）
  ```
- 仅非 script 分支乘算（js/game.js:10601）：
  ```js
  const raw = script
    ? mMax / (script.win ? script.rounds : script.rounds + 2)
    : mMax * (0.26 + Math.random() * 0.08) * Math.max(1, Math.pow(powRatio, 1.3)) * pathBonus;
  //                                                                              ^^^^^^^^^^ 仅此一处，非 script 分支
  const dmg = script ? Math.max(1, Math.ceil(raw))
                     : Math.round(raw * (crit ? 2 : 1));
  ```
- **不作用**：script 场子（论剑/秘境）定速、暴击率（10453 `critRate`）、`mobTurn()`（10621，玩家承伤）、连击/演出/掉落/奖励结算（禁止范围 #7）。

### 5.3 语义正确性（对照 ChatGPT 前置③）
- 每击 `raw` 各自带 `Math.random()`，但 `pathBonus` 为战斗常量 → **每击乘一次、全场恒定**，非「整场只加成一次」、非逐击复利（与 scratch 原型 §⑤ 一致）。
- `S.path===''`（未选）或脏值 → `pathBonus=1` → 与改动前**数值完全等价**（零变化安全默认）。

---

## 六、禁止范围（沿用补正版 7 条，逐条固化）
1–3 沿用 F-01 纪律（记忆上限/键、`st.rel`/`st.stage`、相似文本匹配）；4 不改 `server/server.mjs`、`server/profile.mjs` 联机共鸣与档案重算；5 不改权威配置、不提供洗点/转职；6 不得借接线改联机共鸣/档案重算/权威配置；7 不得改变战斗奖励、掉落与结算语义。

---

## 七、最小充分测试集（迁移 scratch 结论到真实 game.js）

1. 四道途数值对账：同战力同层，四 path 的非 script 伤害期望分别 ×1.00/1.05/1.04/1.06（确定性用固定种子/ mock Math.random 回归）。
2. 老档无加成：`S.path=''` → 伤害与改动前逐字节等价（diff 零差异）。
3. 脏值回退：`S.path='garbage'`/`null`/`undefined` → pathBonus=1。
4. 多道途规则：切 path 即变、互不污染。
5. 重复攻击不重复乘算：两击之和=2×单击（每击恒定一次）。
6. `opts.onSkill` 不叠加：技能命中仍只走非 script 公式，无二次乘区。
7. script 场不受影响：论剑/秘境定速伤害与改动前全等（断言开/关序列相等）。
8. `mobTurn()` 不受影响：玩家承伤与改动前全等。
9. 退出异常不残留：无全局态、不污染 `S`、不改 `PATH_BONUS`。
10. 奖励幂等：奖励结算不读 pathBonus（沿用 P0-A/B/C runId 去重，本任务不重测奖励逻辑，仅断言伤害分支不触碰奖励）。
11. 三者一致＋联机回归（**拆分，不造展示系统**，GPT 审查矛盾 B）：
    - 单机战斗实际伤害只从 `S.path` 经 `pathBonusFor` 计算一次（权威计算=战斗结果同源）；
    - 若有道途名称/加成展示 UI，读取同一合法 `S.path` 与 `PATH_BONUS`；
    - 联机道途显示与服务器登记规则一致，**不把单机 `PATH_BONUS` 当服务器共鸣结果**；
    - 若当前无伤害预估 UI，不为凑「三者一致」额外造展示系统。
    - 联机 `multiLoadPath` 回报校验后的 `S.path`、回写本源冲突处理（§四）专项回归。
12. 隐式依赖轻量检查（GPT 审查⑦）：同场普通战斗日志/统计记录的最终伤害与实际扣血一致；script 场日志与结果保持原行为；若存在录像/回放，播放阶段不再次乘道途系数。
- 附：同输入 50 次恒等、360px/1280px 真实浏览器逐张截图目视（战斗面板伤害数值随 path 变化、script 场不变）、原有战斗行为无非预期变化（回归塔/论剑/秘境三场）。
- **验收分层**（GPT 审查②）：「机制验收」= 指定道途得对应乘数、未选道途完全不变；「平衡验收」= 经专项对比后才定最终系数。不得把机制 PASS 写成数值平衡 PASS。系数 1.00/1.05/1.04/1.06 仅为施工测试占位。
- **scratch 原型 12/12 PASS 结论不进正式验收**（两方原件一致边界）；正式验收以真实 `js/game.js` 跑上述矩阵＋浏览器实测为准。

---

## 八、待 GPT 独立审查重点（开放决策，须逐条回执）

1. **数值来源决策**（原 ChatGPT 前置③ / Muse Q1②）：本件选「客户端常量系数」而非「服务器下发」，理由是注入点 B 纯客户端、排除联机、D1=(a) 为单机角色属性。是否认可？是否有更一致做法（如复用 `pathAxisScore` 客户端等价复刻）？
2. **系数占位值**（1.00/1.05/1.04/1.06，≤8%）：是否够保守？是否需更小或按 AXIS_GRANTS 语义差异化？
3. **联机回写语义**（§4.2）：服务器登记值回流覆盖 `S.path` 本源，是否与「S.path 为本源」冲突？是否应单向（只上报不回写）？
4. **创角 UI 必选**（§3.1）：强制四选一是否破坏既有创角流程/无障碍？挂载点是否安全？
5. **注入点 B 表达式**（§5.2）：`script ? raw : raw*pathBonus` 是否严格保证 script 分支不求值到新乘子（与原草稿自证一致）？
6. **白名单兜底**（§2.2）：`PATH_IDS.indexOf` 校验是否足以挡脏档/原型污染？是否需额外 `Object.prototype` 防护？
7. **回归风险**：改动是否影响战斗统计/成就/录像等隐式依赖（冻结草案风险 #6）？

> 以上 7 点为送审必答项；GPT 裁定为 CONDITIONAL 时，所列前提由总控只读核查满足后闭环；为不通过时本施工设计整体回退、不写代码。
>
> **2026-11-12 补正闭环**：上述 7 点 GPT 已逐条裁定，CONDITIONAL 不成立项已在本件 §四/§五/§七 落实（详见 `P1C_PLAN_A_GPT_CLOSURE_20261112.md`）：① 客户端常量方向认可、PATH_BONUS 独立于 AXIS_GRANTS；② 系数作占位、验收分层；③ 联机回写改冲突处理；④ 创角 UI 列为实施期核对项；⑤ script 场不调用 `pathBonusFor`；⑥ PATH_IDS 冻结于模块作用域；⑦ 增隐式依赖轻量检查。GPT 明示补正后不再送整套设计审查，直接进入实现＋代码级 GPT 审查＋真实浏览器实测。
