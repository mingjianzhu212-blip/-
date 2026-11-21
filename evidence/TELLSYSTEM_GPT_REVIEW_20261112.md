# 送审件 · tellSystem 深层校验（game.js load() 块）· 2026-11-12

> 审查方：ChatGPT（独立网页通道，CDP 9222）。本件为即将交付的实际改动，非仅开发者总结。
> 改动文件：`D:/xx-scratch/jiuxiao-analysis/九霄问道/js/game.js`（唯一修改点，line ~4416-4431 的 load() 块）。
> 备份：`js/game.js.bak_20261112_tellsystem`。

## 一、改动目的（白名单）
替换 load() 中对 `S.guide.flags / rewardClaims / toldSystems` 的浅层 object 校验为深层校验：
- 旧：仅 `typeof === 'object' && !Array.isArray` 即原样保留 → 脏 truthy 值（字符串/数字/对象/数组）会被保留；原型污染键（`__proto__`/`constructor`/`prototype`）会被原样写回。
- 后果：`Guide.tellSystem(name)`（`guide_taixu.js:243`）以 `state.toldSystems[name]` truthy 判重，脏 truthy 会令其误判「已讲过」而**永久跳过补讲**；原型污染键写回存档。
- 新：仅保留严格布尔 `true`、跳过不安全键、`toldSystems` 限白名单 `field/tower/npc/bag/brk`（对齐 `guide_taixu.js` 的 `SYSTEM_TIP`）。

## 二、OLD 块（改动前）
```
        const gd = o.guide;
        S.guide = {
          step: (typeof gd.step === 'number' && isFinite(gd.step)) ? Math.max(0, Math.floor(gd.step)) : 0,
          done: gd.done === true,
          skipped: gd.skipped === true,
          started: gd.started === true,
          flags: (gd.flags && typeof gd.flags === 'object' && !Array.isArray(gd.flags)) ? gd.flags : {},
          rewardClaims: (gd.rewardClaims && typeof gd.rewardClaims === 'object' && !Array.isArray(gd.rewardClaims)) ? gd.rewardClaims : {},
          toldSystems: (gd.toldSystems && typeof gd.toldSystems === 'object' && !Array.isArray(gd.toldSystems)) ? gd.toldSystems : {}
        };
```

## 三、NEW 块（改动后）
```
        const gd = o.guide;
        /* tellSystem 深层校验（2026-11-12）：toldSystems/flags/rewardClaims 此前仅做浅层 object 校验，
           脏 truthy 值（字符串/数字/对象/数组）会令 Guide.tellSystem() 误判「已讲过」而跳过补讲；
           原型污染键（__proto__/constructor/prototype）会被原样写回。
           改为深层清理：仅保留严格布尔 true、跳过不安全键、toldSystems 限白名单
           （field/tower/npc/bag/brk，对齐 guide_taixu.js SYSTEM_TIP）。 */
        const cleanTruthyMap = function(raw, whitelist){
          const out = {};
          if(!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
          const w = whitelist ? new Set(whitelist) : null;
          Object.keys(raw).forEach(k => {
            if(k === '__proto__' || k === 'constructor' || k === 'prototype') return;
            if(w && !w.has(k)) return;
            if(raw[k] === true) out[k] = true;
          });
          return out;
        };
        const TS_KEYS = ['field','tower','npc','bag','brk'];
        S.guide = {
          step: (typeof gd.step === 'number' && isFinite(gd.step)) ? Math.max(0, Math.floor(gd.step)) : 0,
          done: gd.done === true,
          skipped: gd.skipped === true,
          started: gd.started === true,
          flags: cleanTruthyMap(gd.flags),
          rewardClaims: cleanTruthyMap(gd.rewardClaims),
          toldSystems: cleanTruthyMap(gd.toldSystems, TS_KEYS)
        };
```

## 四、设计依据与验证证据
- 设计件：`evidence/TELLSYSTEM_DEEP_VALIDATE_DESIGN_20261112.md`
- scratch 纯函数实现：`scratch/tellSystem_deep_validate/deepValidate.mjs`（ESM，导出 `cleanTruthyMap/cleanGuideMaps/tellSystemOnce`）
- scratch E2E：`deepValidate.test.mjs` 在 `node --test` 下 **9/9 PASS**（E1 正常档、E2 外层非对象、E3 脏 truthy、E4 原型污染、E5 白名单、E6 flags/rewardClaims、E7 端到端补讲一次、E8 持久化无脏值、E9 幂等）
- 内联逻辑测试（复刻 NEW 块函数）：`_inline_logic_test.mjs` **10/10 PASS**（含 `Object.prototype` 无污染断言）
- `node --check js/game.js`：**通过（exit 0）**
- `guide_taixu.js` 未改动（其写入恒为 `= true`、读用 truthy 判重，根因在 load 未清理，故修复点仅在 game.js）。

## 五、已知约束 / 待审查点
1. 仅改 load() 一处，未动运行时逻辑、未动定版口径、未合入未授权范围外代码。
2. `cleanTruthyMap`/`TS_KEYS` 定义在 load() 函数作用域内（每次 load 重建，代价极小，可接受）；如需提到模块级可议。
3. 老档若 `toldSystems` 存过脏值，升级后会被清理（符合预期：脏值本不该持久化）。
4. 未做真实浏览器存档注入 E2E（仅 scratch + 内联逻辑测试），已在设计件登记为已知缺口。

请审查：该改动是否安全、是否越白名单、有无回归/原型污染/白名单遗漏风险，给出 PASS / CONDITIONAL / FAIL 及具体意见。
END_TELLSYSTEM_REVIEW_20261112
