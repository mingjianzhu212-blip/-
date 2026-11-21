/* js/npc_visit.js — NPC 主动事件队列（NpcVisitQueue）（纯逻辑层）
 * 定位：与 npc_memory.js / npc_tower.js 并列的纯逻辑层。装配层在条件满足时 push 事件，
 *       渲染由装配层决定（正式项目走事件驱动：NPC 卡片内主动搭话行，不挂常规 render）。
 *       本文件不碰 DOM、不用 Math.random、不读写任何数值产出（灵石/修为/战力均无关）。
 * 存储：localStorage 键 'jxwd_npc_visit_v1'，独立于主存档、jxwd_daily_v1、jxwd_npc_memory_v1。
 *       读写全程 try-catch：写入失败静默保留内存态；读取失败或 JSON 解析失败按空状态处理。
 * 状态：st = { q: [ {npc, id, text, ts}, ... ] }，q 为数组，头部最旧、尾部最新，容量 MAX_VISITS = 5。
 * API：
 *   push(npc,id,text,ctx)：入队（npc+id 幂等——注意是队列级：同 id 已消费后可再次入队，
 *     破纪录每次新纪录都该再贺喜；堆叠防护只针对同一次结算的重复触发）
 *   pending(npc?)：只读查询待展示事件（队列序，最旧在前）
 *   take(npc?)：取出即移除（渲染后调用）
 *   clear(npc?)：清空全部或按 npc（转世/重开用；全量清无条件落盘空队列）
 *   _state()/_reset()：调试与测试
 */
(function(){
  'use strict';

  var KEY = 'jxwd_npc_visit_v1';
  var MAX_VISITS = 5;

  var st = { q: [] };

  function isStr(v){
    return typeof v === 'string';
  }

  function nonEmptyTrimmed(v){
    return typeof v === 'string' && v.trim() !== '';
  }

  function isFiniteNum(v){
    return typeof v === 'number' && isFinite(v);
  }

  function copyOf(e){
    return { npc: e.npc, id: e.id, text: e.text, ts: e.ts };
  }

  function indexOfMatch(npc, id){
    for (var i = 0; i < st.q.length; i++) {
      if (st.q[i].npc === npc && st.q[i].id === id) return i;
    }
    return -1;
  }

  /* ---------- 存储 ---------- */

  function save(){
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
      return true;
    } catch (err) {
      /* 写入失败：保留内存态，但必须让调用方知道没落盘 —— 原先这里返回 undefined，
         调用方全部当成功，于是"事件已消费"只发生在内存里，刷新后同一句搭话会再播一次。 */
      return false;
    }
  }

  function load(){
    var raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (err) {
      raw = null;
    }
    if (raw === null || raw === undefined) {
      st.q = [];
      return;
    }
    var parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      parsed = null;
    }
    if (parsed === null && raw) {
      /* 解析失败：先把原文另存一份再走空队列。
         否则下一次 push() 的 save() 会把损坏原文直接覆盖掉，玩家/维护者再也取不回来
         （主存档那条链路有 xiuxian_save_corrupt 兜底，这里原先没有对应物）。 */
      try { localStorage.setItem(KEY + '_corrupt', raw); } catch (e2) {}
      try { console.error('[npc_visit] 来访队列解析失败，原文已备份到 ' + KEY + '_corrupt'); } catch (e3) {}
    }
    st.q = (parsed && typeof parsed === 'object' && parsed.q && isArr(parsed.q)) ? parsed.q : [];
    if (sanitize()) save();
  }

  function isArr(v){
    return Object.prototype.toString.call(v) === '[object Array]';
  }

  /* ---------- 清洗：load 之后调用，返回是否实际改动 ---------- */

  function sanitize(){
    var changed = false;

    if (!st || typeof st !== 'object' || !isArr(st.q)) {
      st.q = [];
      return true;
    }

    var out = [];
    var seen = {};
    var i, e, npc, id, text, ts, k;

    for (i = 0; i < st.q.length; i++) {
      e = st.q[i];
      if (!e || typeof e !== 'object') { changed = true; continue; }
      if (!nonEmptyTrimmed(e.npc) || !nonEmptyTrimmed(e.id) || !nonEmptyTrimmed(e.text) || !isFiniteNum(e.ts)) {
        changed = true;
        continue;
      }
      npc = e.npc.trim();
      id = e.id.trim();
      text = e.text.trim();
      ts = e.ts;
      k = npc + '\u0000' + id;
      if (seen[k]) { changed = true; continue; }
      seen[k] = true;
      if (npc !== e.npc || id !== e.id || text !== e.text) changed = true;
      out.push({ npc: npc, id: id, text: text, ts: ts });
    }

    if (out.length !== st.q.length) changed = true;

    /* 容量不变量（T-114 审查 A2）：load 恢复的合法历史数据也可能超上限，
       sanitize 统一裁剪到 MAX_VISITS——保留最新（数组尾部）的 5 条，与 push 淘汰口径一致。 */
    if (out.length > MAX_VISITS) {
      out = out.slice(out.length - MAX_VISITS);
      changed = true;
    }

    if (changed) st.q = out;
    return changed;
  }

  /* ---------- (1) push ---------- */

  function push(npc, id, text, ctx){
    if (!nonEmptyTrimmed(npc)) return { ok: false, msg: 'npc 必须是非空字符串' };
    if (!nonEmptyTrimmed(id)) return { ok: false, msg: 'id 必须是非空字符串' };
    if (!nonEmptyTrimmed(text)) return { ok: false, msg: 'text 必须是非空字符串' };

    var now;
    if (ctx && ctx.now !== undefined && ctx.now !== null) {
      if (!isFiniteNum(ctx.now)) return { ok: false, msg: 'ctx.now 必须是有限数' };
      now = ctx.now;
    } else {
      now = Date.now();
    }

    npc = npc.trim();
    id = id.trim();
    text = text.trim();

    if (indexOfMatch(npc, id) >= 0) {
      return { ok: true, dup: true, count: st.q.length };
    }

    st.q.push({ npc: npc, id: id, text: text, ts: now });
    while (st.q.length > MAX_VISITS) st.q.shift();

    save();
    return { ok: true, dup: false, count: st.q.length };
  }

  /* ---------- (2) pending ---------- */

  function pending(npc){
    if (npc !== undefined && !isStr(npc)) return [];
    var out = [];
    for (var i = 0; i < st.q.length; i++) {
      if (npc === undefined || st.q[i].npc === npc) out.push(copyOf(st.q[i]));
    }
    return out;
  }

  /* ---------- (3) take ---------- */

  function take(npc){
    if (npc !== undefined && !isStr(npc)) return [];
    var kept = [], taken = [], e;
    for (var i = 0; i < st.q.length; i++) {
      e = st.q[i];
      if (npc === undefined || e.npc === npc) taken.push(copyOf(e));
      else kept.push(e);
    }
    if (taken.length) {
      st.q = kept;
      /* 落盘失败也要报出来：内存已消费、磁盘没变 → 刷新后同一句搭话会再播一次。
         这里不回滚（回滚等于本次立刻重复播报），只留可见记录。 */
      if (!save()) { try { console.warn('[npc_visit] take 落盘失败：事件可能在刷新后重复播报'); } catch (e0) {} }
    }
    return taken;
  }

  /* ---------- (4) clear ---------- */

  function clear(npc){
    if (npc !== undefined && !isStr(npc)) return { ok: true, removed: 0 };
    var before = st.q.length;
    if (npc === undefined) {
      st.q = [];
    } else {
      var kept = [];
      for (var i = 0; i < st.q.length; i++) {
        if (st.q[i].npc !== npc) kept.push(st.q[i]);
      }
      st.q = kept;
    }
    var removed = before - st.q.length;
    /* 生命周期边界（T-114 审查 A4）：全量 clear（转世/重开）无条件落盘空队列——
       即便内存恰为空（load 失败降级后），也要覆盖掉可能残存的旧存储，防"存储恢复后旧事件复现"。
       按 npc 局部清没有删除就不动盘。
       persisted=false 表示清空只发生在内存里：新一世开局可能读回上一世的旧队列。 */
    var persisted = true;
    if (npc === undefined || removed > 0) persisted = save();
    return { ok: true, removed: removed, persisted: persisted };
  }

  /* ---------- (7) 调试 / 测试 ---------- */

  function _state(){
    /* 深拷贝：原实现返回内部引用，调试/测试方一旦 _state().q.push(...) 就直接改真实队列
       且不经 save()，内存与磁盘立刻分叉。npc_memory 那边本来就是深拷贝，这里对齐口径。 */
    return { q: st.q.map(function (e) { return JSON.parse(JSON.stringify(e)); }) };
  }

  function _reset(){
    st.q = [];
    try {
      localStorage.removeItem(KEY);
    } catch (err) {
      /* 清不掉存储键不影响内存态隔离 */
    }
    return { ok: true };
  }

  load();

  window.NpcVisitQueue = {
    push: push,
    pending: pending,
    take: take,
    clear: clear,
    /* 导出 load：侧车导入后磁盘变了，常驻内存必须跟着重读，
       否则下一次 push() 会用导入前的旧队列整体覆盖刚导入的记录。 */
    load: load,
    _state: _state,
    _reset: _reset
  };
})();
