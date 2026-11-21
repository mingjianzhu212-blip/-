# tellSystem 嵌套对象深层校验 · 维护项设计（2026-11-12 通宵单 · 队列 5 填充项）

> 授权：祝《通宵开发计划与授权令·2026-11-12》队列 5「填充项（主线间隙才做）：tellSystem 嵌套对象深层校验维护项，限设计＋scratch 实现＋E2E，不进正式底本」。
> **范围界定（如实声明）**：授权令未附该维护项的原始任务单，本件按**现行代码只读核实到的事实**界定范围（见第一节）；若与祝所指口径不同，留晨报核对，不自行扩大。
> **红线**：全程不写 `js/game.js`、`js/guide_taixu.js` 等正式底本；实现只在 `scratch/p1c_prototype/` 之外的独立 scratch 目录，E2E 为该 scratch 实现的端到端测试，不冒充正式代码验收。

## 一、现状（只读核实，行号以 2026-11-12 现行文件为准）
- `js/game.js:4415-4427` 载入 `o.guide` 时，三个嵌套 map 均**只做浅层校验**：
  ```js
  flags:        (gd.flags        && typeof gd.flags        === 'object' && !Array.isArray(gd.flags))        ? gd.flags        : {},
  rewardClaims: (gd.rewardClaims && typeof gd.rewardClaims === 'object' && !Array.isArray(gd.rewardClaims)) ? gd.rewardClaims : {},
  toldSystems:  (gd.toldSystems  && typeof gd.toldSystems  === 'object' && !Array.isArray(gd.toldSystems))  ? gd.toldSystems  : {}
  ```
  即「是 object 且非数组」即原样采纳，**未校验内部键名与值类型**。
- `js/guide_taixu.js:242-245`：
  ```js
  function tellSystem(name) {
    if (!state || !state.skipped || state.toldSystems[name]) return;   // truthy 判重
    state.toldSystems[name] = true; persist();
    ...
  }
  ```
- 写入正例：`state.toldSystems[name] = true`（布尔真）。键全集由 `SYSTEM_TIP` 定义：`field/tower/npc/bag/brk`。

## 二、深层校验缺口（缺陷机理，非危言）
| 脏值形态 | 浅层校验结果 | 后果 |
|---|---|---|
| `toldSystems.field = "yes"` / `1` / `{}` / `[]` | 采纳（外层仍是 object） | `state.toldSystems['field']` 为 truthy → `tellSystem('field')` **误判已讲过、跳过补讲** |
| `toldSystems` 键含 `__proto__` / `constructor` / `prototype` | 采纳 | 原型链键可通过 `name` 命中或污染，判重失真 |
| 值为嵌套对象／数组 | 采纳 | 语义不明，且 `persist()` 会把脏值写回存档 |
| `flags` / `rewardClaims` 同类脏值 | 采纳 | 同上（幂等凭证 `state.rewardClaims[DAN_CLAIM]` 亦为 truthy 判重，`guide_taixu.js:84`） |

## 三、设计（scratch 实现目标，非底本改动）
1. **外层**：非对象／数组／null → 回退 `{}`（沿用既有语义）。
2. **逐键**：只保留**白名单键**；`toldSystems` 白名单＝`SYSTEM_TIP` 五键；`flags`/`rewardClaims` 拒绝原型污染键（`__proto__`/`constructor`/`prototype`）并只留安全字符串键。
3. **逐值**：只保留严格 `=== true`；其余（字符串/数字/null/对象/数组/函数）一律丢弃。
4. **构造**：写入用全新的 `{}` 且 `Object.defineProperty`/直接赋值安全键，绝不把脏对象整体引用带回 `state`，避免原型污染与脏值回写。
5. **不变式**：正常存档经校验后形态不变（不误伤合法 `true`）；脏存档被净化；`tellSystem` 判重行为与「布尔真」语义一致。
6. **不入底本**：实现为独立纯函数模块，供未来若获授权时替换 `game.js:4424` 的浅层分支；本轮仅做取证。

## 四、E2E 覆盖（scratch，不冒充正式验收）
正常档／外层非对象／数组／脏 truthy 值／原型污染键／嵌套对象值／flags+rewardClaims 同类／端到端判重链路（脏档净化后 `tellSystem` 恰补讲一次）／持久化不再回写脏值。

## 五、边界声明
- 本件为设计层；scratch 实现与 E2E 输出见 `scratch/tellSystem_deep_validate/`；**未改任何正式底本文件**、未在真实浏览器跑 UI E2E（本轮 E2E 指 scratch 实现的端到端断言）。
- 不签发任何 PASS 到底本；不宣称该维护项已合入。若祝所指维护项另有定义，以原件为准，留晨报核对。
