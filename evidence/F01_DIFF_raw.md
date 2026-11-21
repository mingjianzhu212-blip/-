--- js/npc_memory.js.bak_20261108_182924_preD006	2026-11-06 02:24:28.152558900 +0800
+++ js/npc_memory.js	2026-11-11 18:22:26.574868000 +0800
@@ -3,7 +3,7 @@
    设计对齐 js/daily.js：IIFE + window 挂载 + hooks 注入 + 脏数据清洗 + _state/_reset
    ---------------------------------------------------------------------
    record(npcId, text)：写入记忆（strength=1，同日/异日同文本去重，每 NPC 上限 8 条）
-   ensureDay()：跨天按真实日历间隔 0.8^elapsed 衰减，strength<0.2 自然淡忘
+   ensureDay()：跨天按真实日历间隔逐条 0.95^elapsed 衰减（锚定 lastTouch），strength<0.2 自然淡忘
    list(npcId)：按 strength 降序、同强度按写入先后的记忆浅拷贝
    attitude(npcId)：好感修正 = 记忆强度之和 × 2，封顶 +16
    mention(npcId)：对话查询 { knowsPlayer, top, attitude }
@@ -20,6 +20,9 @@
   // ============ 记忆类别 ============
   var KINDS = ['combat', 'story', 'sect', 'trade', 'life', 'misc'];
 
+  // 每日衰减系数（F-01·A）：记忆每离线一整天，strength ×= DECAY_PER_DAY（由 0.8 调至 0.95）
+  var DECAY_PER_DAY = 0.95;
+
   // 类别归一化：与 KINDS 严格相等则原样返回，其余一律归入 'misc'
   function normKind(k){
     return KINDS.indexOf(k) !== -1 ? k : 'misc';
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
-      for (const npcId in st.mem) {
-        if (!memHas(npcId)) {
-          continue; // 原型链上的键不参与衰减，也不回写
-        }
-        const bucket = st.mem[npcId];
-        for (let i = bucket.length - 1; i >= 0; i--) {
-          bucket[i].strength = Math.round(bucket[i].strength * factor * 10000) / 10000;
+    for (const npcId in st.mem) {
+      if (!memHas(npcId)) {
+        continue; // 原型链上的键不参与衰减，也不回写
+      }
+      const bucket = st.mem[npcId];
+      for (let i = bucket.length - 1; i >= 0; i--) {
+        // F-01·B：逐条以 lastTouch 为锚点计时衰减；缺省回退 day
+        const anchor = bucket[i].lastTouch || bucket[i].day;
+        const elapsed = Math.round((parseKey(today) - parseKey(anchor)) / 86400000);
+        if (elapsed >= 1) {
+          bucket[i].strength = Math.round(bucket[i].strength * Math.pow(DECAY_PER_DAY, elapsed) * 10000) / 10000;
+          bucket[i].lastTouch = today; // R1：衰减后立即刷新该条计时，避免同日重复衰减
           if (bucket[i].strength < 0.2) {
             bucket.splice(i, 1); // 自然淡忘
           }
         }
-        if (bucket.length === 0) {
-          delete st.mem[npcId];
-        }
+      }
+      if (bucket.length === 0) {
+        delete st.mem[npcId];
       }
     }
     st.day = today;
@@ -173,10 +178,13 @@
     const bucket = bucketOk(npcId) ? st.mem[npcId] : [];
     for (let i = 0; i < bucket.length; i++) {
       if (bucket[i].text.trim() === t) {
-        return { ok: false, msg: '已有相同记忆' }; // 同日/异日同文本均不重复写入
+        // F-01·B：同文本重复提及 → 仅刷新该条衰减计时（lastTouch），不恢复 strength、不重复写入
+        bucket[i].lastTouch = todayKey();
+        const persisted = save();
+        return { ok: true, refreshed: true, count: bucket.length, persisted: persisted };
       }
     }
-    bucket.push({ text: t, day: todayKey(), strength: 1, kind: normKind(kind) });
+    bucket.push({ text: t, day: todayKey(), strength: 1, kind: normKind(kind), lastTouch: todayKey() });
     // 上限 8 条：超出丢弃 strength 最低的一条，strength 相同则丢弃最早写入（数组最靠前）的一条
     while (bucket.length > 8) {
       let worst = 0;
@@ -188,8 +196,11 @@
       bucket.splice(worst, 1);
     }
     st.mem[npcId] = bucket;
-    save();
-    return { ok: true, count: bucket.length };
+    /* persisted=false 表示"只在内存里记住了"（initState 非 ok 或配额满）。
+       原先直接丢弃 save() 返回值后仍报 ok:true，玩家以为老卒记住了，
+       刷新后台词从"认得你"退回"这位朋友"，且日志里一个字都没有。 */
+    const persisted = save();
+    return { ok: true, count: bucket.length, persisted: persisted };
   }
 
   // ============ 查询 ============
@@ -304,7 +315,8 @@
         }
       }
       if (!dup) {
-        toBucket.push({ text: m.text, day: m.day, strength: m.strength, kind: m.kind }); // 四字段原样保留
+        // R2-a 对齐 sanitize：缺 lastTouch 的旧档记忆迁移时置当前日期（非原始 day），避免升级首日一次性大幅衰减
+        toBucket.push({ text: m.text, day: m.day, strength: m.strength, kind: m.kind, lastTouch: (typeof m.lastTouch === 'string' && m.lastTouch) ? m.lastTouch : todayKey() });
         moved++;
       }
     }
@@ -379,6 +391,10 @@
           m.kind = 'misc'; // kind 缺失/非法：归入 'misc'（老档无 kind 字段兼容）
           changed = true;
         }
+        if (typeof m.lastTouch !== 'string') {
+          m.lastTouch = today; // R2-a：旧存档记忆缺 lastTouch → 首次迁移置当前日期（非原始 day），避免升级首日一次性大幅衰减
+          changed = true;
+        }
         if (seen[m.text.trim()]) {
           changed = true;
           continue; // trim 相同文本只保留最早一条
@@ -411,10 +427,19 @@
   }
 
   function _reset(){
-    /* 显式重置是受控恢复路径：解除保护后写空态。不得由启动流程自动调用。 */
-    initState = 'ok';
+    /* 显式重置是受控恢复路径：写空态成功后才解除保护。不得由启动流程自动调用。
+       ⚠️ 顺序不能反。原实现先 initState='ok' 再 rawSave()，写失败时留下面这个危险组合：
+       内存空 + 磁盘旧 + 已允许写盘 → 之后任意一次 record() 都会用「空白 + 新记忆」覆盖旧档，
+       或刷新后把上一档整桶记忆读回来（"重开 = 全新的人"被破坏）。
+       现在失败就保持 blocked，宁可这局不记新记忆，也不覆盖玩家旧档。 */
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
 
   function init(h){
