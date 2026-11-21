# F-01 白名单对照 · 完整 diff 与越界声明

> 基线：`js/npc_memory.js.bak_20261108_182924_preD006`（2026-11-06）
> 当前：`js/npc_memory.js`（2026-11-11 18:22）
> 说明：本文件为补 Muse「白名单未越界」核验之用。下面逐段标注归属。

## 一、白名单归属表

| diff 段 | 归属 | 说明 |
|---------|------|------|
| 头部注释 `0.8^elapsed`→`0.95^elapsed 逐条 锚定 lastTouch` | F-01·A+B 注释 | 描述性，无逻辑 |
| `+ var DECAY_PER_DAY = 0.95;` | F-01·A | 引入常量 |
| `ensureDay()` 改写为逐条 `lastTouch` 计时 + `m.lastTouch = today`（R1） | F-01·B + R1 | 核心衰减逻辑 |
| `record()` 同文本改为刷新 `lastTouch`、返回 `refreshed`、push 带 `lastTouch`、返回 `persisted` | F-01·B | 重复刷新 |
| `migrate()` push 带 `lastTouch` 兜底（缺省=今天） | F-01·R2-a | 平滑迁移 |
| `sanitize()` 补 `lastTouch` 兜底（缺省=今天） | F-01·R2-a | 平滑迁移 |
| `_reset()` fail-closed 硬化（见下） | ⚠️ **越出 F-01 白名单** | 不在任务单口径内，授权待制作人确认 |

## 二、⚠️ 越界声明（须制作人裁定）

`js/npc_memory.js` 当前版本除上表 F-01 五项白名单改动外，还含一处 **`_reset()` fail-closed 硬化**：

- 原实现：`initState='ok'` 先置位，再 `rawSave()`；若写盘失败，会留下「内存空 + 磁盘旧 + 已允许写盘」的危险组合，后续 `record()` 可能用空白+新记忆覆盖旧档，或刷新后把上一档记忆读回（"重开 = 全新的人"被破坏）。
- 新实现：`rawSave()` 失败则保持 `blocked` 并返回 `{ok:false,persisted:false}`，成功才 `initState='ok'`。

该改动是**内存安全收益**（避免重置时误覆盖玩家旧档），但 **不属于 F-01（NPC 记忆衰减 A+B）任务单白名单**。本单白名单仅含 A/B/R1/R2-a 及"不动项"，未列 `_reset`。

因此：
1. 本交付物**不能声称"diff 仅含 F-01 落点、零越界"**；存在上述越界改动。
2. 该越界改动的授权状态**待制作人（祝）确认**：是独立已授权修复、还是应分离/回退。
3. 在制作人裁定前，F-01 的 A/B/R1/R2-a 验证与 `_reset` 硬化验证应**分开计**：Muse 可先就 F-01 白名单五项出结论，`_reset` 另列待办。

## 三、完整 diff（基线 → 当前，逐段标注）

```diff
--- js/npc_memory.js.bak_20261108_182924_preD006	2026-11-06 02:24:28
+++ js/npc_memory.js	2026-11-11 18:22:26
@@ -3,7 +3,7 @@
     record(npcId, text)：写入记忆（strength=1，同日/异日同文本去重，每 NPC 上限 8 条）
-   ensureDay()：跨天按真实日历间隔 0.8^elapsed 衰减，strength<0.2 自然淡忘
+   ensureDay()：跨天按真实日历间隔逐条 0.95^elapsed 衰减（锚定 lastTouch），strength<0.2 自然淡忘
     list / attitude / mention ...
   [F-01·A+B 注释，无逻辑]
@@ -20,6 +20,9 @@
   var KINDS = ['combat', 'story', 'sect', 'trade', 'life', 'misc'];
+  // 每日衰减系数（F-01·A）：记忆每离线一整天，strength ×= DECAY_PER_DAY（由 0.8 调至 0.95）
+  var DECAY_PER_DAY = 0.95;
+  [F-01·A 引入常量]
@@ -135,25 +138,27 @@
   function ensureDay(){
     const today = todayKey();
     if (st.day === today) {
-      return; // 同一天内多次调用不重复衰减
+      return; // 同一天内多次调用不重复衰减（st.day 仅作"今日是否已处理"快判）
     }
-    const elapsed = Math.round((parseKey(today) - parseKey(st.day)) / 86400000);
-    if (elapsed >= 1) {
-      const factor = Math.pow(0.8, elapsed);
-      for (const npcId in st.mem) { ... bucket[i].strength = round(... * factor ...); ... }
-    }
+    for (const npcId in st.mem) {
+      ...
+      const anchor = bucket[i].lastTouch || bucket[i].day;
+      const elapsed = Math.round((parseKey(today) - parseKey(anchor)) / 86400000);
+      if (elapsed >= 1) {
+        bucket[i].strength = round(... * Math.pow(DECAY_PER_DAY, elapsed) ...);
+        bucket[i].lastTouch = today; // R1：衰减后立即刷新该条计时，避免同日重复衰减
+        if (bucket[i].strength < 0.2) bucket.splice(i, 1);
+      }
+      ...
+    }
+   [F-01·B 逐条计时 + R1]
@@ -173,10 +178,13 @@
     for (let i = 0; i < bucket.length; i++) {
       if (bucket[i].text.trim() === t) {
-        return { ok: false, msg: '已有相同记忆' };
+        bucket[i].lastTouch = todayKey();
+        const persisted = save();
+        return { ok: true, refreshed: true, count: bucket.length, persisted: persisted };
       }
     }
-    bucket.push({ text: t, day: todayKey(), strength: 1, kind: normKind(kind) });
+    bucket.push({ text: t, day: todayKey(), strength: 1, kind: normKind(kind), lastTouch: todayKey() });
     ...
-    save();
-    return { ok: true, count: bucket.length };
+    const persisted = save();
+    return { ok: true, count: bucket.length, persisted: persisted };
   }
+   [F-01·B 重复刷新 + persisted 返回]
@@ -304,7 +315,8 @@
       if (!dup) {
-        toBucket.push({ text: m.text, day: m.day, strength: m.strength, kind: m.kind });
+        toBucket.push({ text: m.text, day: m.day, strength: m.strength, kind: m.kind, lastTouch: (typeof m.lastTouch === 'string' && m.lastTouch) ? m.lastTouch : todayKey() });
       }
+   [F-01·R2-a migrate 兜底]
@@ -379,6 +391,10 @@
         if (typeof m.lastTouch !== 'string') {
           m.lastTouch = today; // R2-a：旧存档记忆缺 lastTouch → 首次迁移置当前日期
           changed = true;
         }
+   [F-01·R2-a sanitize 兜底]
@@ -411,10 +427,19 @@
   function _reset(){
-    /* 显式重置是受控恢复路径：解除保护后写空态。不得由启动流程自动调用。 */
-    initState = 'ok';
+    /* 显式重置是受控恢复路径：写空态成功后才解除保护。不得由启动流程自动调用。
+       ⚠️ 顺序不能反。原实现先 initState='ok' 再 rawSave()，写失败时留危险组合... 现在失败就保持 blocked */
     st = blank();
-    rawSave();
+    if(!rawSave()){
+      initState = 'blocked';
+      try{ console.error('[NpcMemory] 重置写盘失败，保持 fail-closed（本局不再写记忆）'); }catch(e2){}
+      return { ok: false, persisted: false };
+    }
+    initState = 'ok';
+    return { ok: true, persisted: true };
   }
+   [⚠️ 越出 F-01 白名单：_reset fail-closed 硬化]
```

## 四、基线全文（preD006，供重建对照）

见 `js/npc_memory.js.bak_20261108_182924_preD006`（项目内已有）。
