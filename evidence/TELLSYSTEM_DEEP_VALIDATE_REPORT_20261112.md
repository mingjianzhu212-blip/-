# 队列 5 完成报告｜tellSystem 嵌套对象深层校验维护项

- 日期：2026-11-12（通宵授权令窗内，执行层推进）
- 授权依据：《通宵开发计划与授权令 · 祝 2026-11-12》队列 5：「填充项（主线间隙才做）：tellSystem 嵌套对象深层校验维护项，限**设计＋scratch 实现＋E2E，不进正式底本**」
- 边界声明：本项**零正式底本写入**；未触碰 `js/game.js`、`js/guide_taixu.js`；未改定版口径；无删除、无付费、无对外发送。

## 一、只读核实结论（问题依据）

| 位置 | 现状 | 风险 |
|---|---|---|
| `js/game.js:4424` 载入/迁移 | `flags` / `rewardClaims` / `toldSystems` 仅做**浅层 object 校验**（是对象即放行） | 内层脏值原样进入运行时 state |
| `js/guide_taixu.js:243` `tellSystem()` | 判重用 `state.toldSystems[name]` 的 **truthy** 判断 | 脏 truthy 值（`"yes"` / `1` / `{}` / `[]`）被误判「已讲过」，玩家永久跳过该条系统提示且无补讲 |
| 序列化回写 | 净化前对象直接落存档 | 脏值/污染键被持久化，反复污染后续载入 |

补充风险：原型污染键（`__proto__` / `constructor` / `prototype`）在浅层校验下可随对象合并进入 state。

设计件原文：`evidence/TELLSYSTEM_DEEP_VALIDATE_DESIGN_20261112.md`。

## 二、scratch 实现（不进正式底本）

文件：`scratch/tellSystem_deep_validate/deepValidate.mjs`（独立纯函数模块，不 import 任何正式源码）

- `SYSTEM_TIP_KEYS = ['field','tower','npc','bag','brk']`：`toldSystems` 允许键白名单。
- `cleanTruthyMap(raw, {whitelist})`：外层非对象/数组一律回退 `{}`；跳过不安全键；**仅保留严格 `=== true` 的值**；**构造全新 `{}`**（不复用输入对象，切断原型链与脏键）。
- `cleanGuideMaps(gd)`：一次性净化 `flags` / `rewardClaims` / `toldSystems` 三张表，`toldSystems` 附加白名单。
- `tellSystemOnce(state, name, log)`：模拟判重逻辑，用于 E2E 验证「净化后恰补讲一次」。

## 三、E2E 实测证据

命令：

```bash
cd "D:/xx-scratch/jiuxiao-analysis/九霄问道"
node --check scratch/tellSystem_deep_validate/deepValidate.mjs
node --check scratch/tellSystem_deep_validate/deepValidate.test.mjs
node --test scratch/tellSystem_deep_validate/deepValidate.test.mjs > evidence/TELLSYSTEM_DEEP_VALIDATE_E2E_20261112.tap
```

- 语法检查：两文件 `node --check` 均通过。
- 结果：`EXIT=0`，`# tests 9 / # pass 9 / # fail 0`。
- 原始 TAP 原件：`evidence/TELLSYSTEM_DEEP_VALIDATE_E2E_20261112.tap`。

| 用例 | 覆盖 | 结果 |
|---|---|---|
| E1 | 正常档不被破坏 | PASS |
| E2 | 外层非对象 / 数组 → 三表回退 `{}` | PASS |
| E3 | 脏 truthy 值（字符串/数字/对象/数组）被清除 | PASS |
| E4 | `__proto__` / `constructor` / `prototype` 污染键被丢弃，且未污染 `Object.prototype` | PASS |
| E5 | `toldSystems` 白名单外键被丢弃 | PASS |
| E6 | `flags` / `rewardClaims` 同类脏值净化 | PASS |
| E7 | **端到端**：脏档净化后 `tellSystem` 恰补讲一次（浅层校验下会被误跳过） | PASS |
| E8 | 持久化序列化后无脏值 / 污染键 | PASS |
| E9 | 同一输入多次结果恒等（幂等） | PASS |

## 四、纪律与缺口登记

1. 本项是**设计＋scratch＋E2E**，不是正式修复；正式底本 `game.js:4424` 的浅层校验**未改动**，须另立授权单才可合入。
2. E2E 为**独立纯函数仿真**：验证的是净化算法与判重语义，不冒充「已在浏览器载入真实存档跑通」；未做真实 `index.html` + 存档注入的端到端，登记为已知缺口。
3. 未送 ChatGPT / Muse 独立审查（授权令队列 5 未要求四方审查）；本项仅作填充项取证，不宣称验收通过。
4. 本报告为执行层推进，不构成定案。
