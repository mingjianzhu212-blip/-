/* ============ NPC 记忆（localStorage 独立持久化 · 按日衰减） ============
   存储键：jxwd_npc_memory_v1（与主存档 SAVE_KEY、jxwd_daily_v1 相互独立）
   设计对齐 js/daily.js：IIFE + window 挂载 + hooks 注入 + 脏数据清洗 + _state/_reset
   ---------------------------------------------------------------------
   record(npcId, text)：写入记忆（strength=1，同日/异日同文本去重，每 NPC 上限 8 条）
   ensureDay()：跨天按真实日历间隔逐条 0.95^elapsed 衰减（锚定 lastTouch），strength<0.2 自然淡忘
   list(npcId)：按 strength 降序、同强度按写入先后的记忆浅拷贝
   attitude(npcId)：好感修正 = 记忆强度之和 × 2，封顶 +16
   mention(npcId)：对话查询 { knowsPlayer, top, attitude }
   record(npcId, text, kind)：第三参 kind 分类（KINDS 六类别，非法归 'misc'）
   recall(npcId, kind)：按类别优先回忆，无该类别时回退整体最新
   gate(npcId, threshold)：态度门槛查询（attitude ≥ threshold → true），供对话选项置灰
   migrate(fromId, toId)：记忆桶整体迁移（同文本 toId 优先），供 NPC ID 改名/老档迁移一次性使用
   =========================================================================== */
(function(){
  'use strict';

  const KEY = 'jxwd_npc_memory_v1';

  // ============ 记忆类别 ============
  var KINDS = ['combat', 'story', 'sect', 'trade', 'life', 'misc'];

  // 每日衰减系数（F-01·A）：记忆每离线一整天，strength ×= DECAY_PER_DAY（由 0.8 调至 0.95）
  var DECAY_PER_DAY = 0.95;

  // 类别归一化：与 KINDS 严格相等则原样返回，其余一律归入 'misc'
  function normKind(k){
    return KINDS.indexOf(k) !== -1 ? k : 'misc';
  }

  // ============ 内部状态 ============
  let hooks = {};
  let st = blank();
  /* M-1 复审（A1/A2/A3）+ 第二轮复审（H6/N6）：写盘保护绑定「初始化是否可信」。
     三态：uninit 未完成初始化 / ok 完整可信 / blocked 读盘故障、数据无效、
     清洗异常或清洗回写失败。blocked 期间一律禁止写盘，保护磁盘上可能仍可
     人工恢复的原始字节；内存态本次会话仍可用，但不会落盘。
     下次 load() 完整成功会自动解除；_reset() 是显式受控恢复路径。 */
  let initState = 'uninit';

  // 空白状态：day 为今日，mem 按 npcId 分桶
  function blank(){
    return { day: todayKey(), mem: {} };
  }

  // 桶存在性判定：只认 st.mem 的自有属性，杜绝 __proto__/constructor 等原型键读写
  function memHas(npcId){
    return Object.prototype.hasOwnProperty.call(st.mem, npcId);
  }

  // 有效桶判定：自有属性 + 数组
  function bucketOk(npcId){
    return memHas(npcId) && Array.isArray(st.mem[npcId]);
  }

  // 日期键：年-月-日（本地时区、不补零），与 js/daily.js 的 todayKey() 完全一致
  function todayKey(){
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  // 日期键 → 本地零点 Date，用于真实日历间隔运算（跨月/跨年/闰年自动正确）
  function parseKey(key){
    const p = String(key).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  // ============ 持久化（与 js/daily.js 同款 try-catch 兜底） ============
  // 内部原始写盘：仅供 load() 的清洗回写与 _reset() 显式重置使用，绕过 initState 保护
  function rawSave(){
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
      return true;
    } catch (e) {
      // localStorage 不可用（隐私模式/配额满）时静默失败，仅保留内存态
      return false;
    }
  }

  function save(){
    /* 复审 A1/A2/A3：未完成可信初始化一律不写盘（fail-closed）。
       返回值仅表示「本次是否真正落盘」，不改变任何调用方的既有语义。 */
    if (initState !== 'ok') return false;
    return rawSave();
  }

  function load(){
    /* 第二轮独立复审 H6/N6：load() 是导出接口，可能被外部单独调用，因此必须
       「自身」具备完整 fail-closed 保证，不能依赖 init() 的外层 try/catch。
       入口先把状态降为 uninit：任何中途异常都不会遗留可写的 ok 状态。
       读取故障 / JSON 损坏 / 顶层结构无效 / sanitize 异常（含部分改写 st 后抛错）/
       清洗回写失败，一律 blocked；blocked 期间 save() 拒绝写盘，磁盘原始字节保留。
       返回布尔：true = 读取、结构、清洗及其回写全部成功；false = 未通过，禁止写盘。 */
    initState = 'uninit';
    let raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {
      st = blank();
      initState = 'blocked';
      return false;
    }
    try {
      if (raw) {
        const obj = JSON.parse(raw);
        // 顶层必须是普通对象；数组 / null / 原始类型视为结构无效
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) st = obj;
        else { st = blank(); initState = 'blocked'; return false; }
      } else {
        st = blank();
      }
    } catch (e) {
      st = blank();
      initState = 'blocked';
      return false;
    }
    let cleaned = false;
    try {
      cleaned = sanitize();
    } catch (e) {
      // sanitize 可能已部分改写 st；丢弃脏内存态并退回 blank，绝不写盘。
      // 磁盘字节未动，故障解除后重新 load() 可完整恢复原始记忆。
      st = blank();
      initState = 'blocked';
      return false;
    }
    if (cleaned && !rawSave()) {
      // N6：清洗回写失败不得伪装成「清洗结果已持久化」；存储不可写时同样 blocked。
      // 此处是唯一受控的内部清洗回写通道，调用前已通过读取/结构/清洗全部检查。
      initState = 'blocked';
      return false;
    }
    initState = 'ok';
    return true;
  }

  // ============ 跨天衰减 ============
  function ensureDay(){
    const today = todayKey();
    if (st.day === today) {
      return; // 同一天内多次调用不重复衰减（st.day 仅作"今日是否已处理"快判）
    }
    for (const npcId in st.mem) {
      if (!memHas(npcId)) {
        continue; // 原型链上的键不参与衰减，也不回写
      }
      const bucket = st.mem[npcId];
      for (let i = bucket.length - 1; i >= 0; i--) {
        // F-01·B：逐条以 lastTouch 为锚点计时衰减；缺省回退 day
        const anchor = bucket[i].lastTouch || bucket[i].day;
        const elapsed = Math.round((parseKey(today) - parseKey(anchor)) / 86400000);
        if (elapsed >= 1) {
          bucket[i].strength = Math.round(bucket[i].strength * Math.pow(DECAY_PER_DAY, elapsed) * 10000) / 10000;
          bucket[i].lastTouch = today; // R1：衰减后立即刷新该条计时，避免同日重复衰减
          if (bucket[i].strength < 0.2) {
            bucket.splice(i, 1); // 自然淡忘
          }
        }
      }
      if (bucket.length === 0) {
        delete st.mem[npcId];
      }
    }
    st.day = today;
    save();
  }

  // ============ 写入 ============
  function record(npcId, text, kind){
    ensureDay();
    if (typeof npcId !== 'string' || npcId.trim() === '') {
      return { ok: false, msg: 'npcId 不能为空' };
    }
    if (typeof text !== 'string' || text.trim() === '') {
      return { ok: false, msg: '记忆内容不能为空' };
    }
    const t = text.trim();
    const bucket = bucketOk(npcId) ? st.mem[npcId] : [];
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i].text.trim() === t) {
        // F-01·B：同文本重复提及 → 仅刷新该条衰减计时（lastTouch），不恢复 strength、不重复写入
        bucket[i].lastTouch = todayKey();
        const persisted = save();
        return { ok: true, refreshed: true, count: bucket.length, persisted: persisted };
      }
    }
    bucket.push({ text: t, day: todayKey(), strength: 1, kind: normKind(kind), lastTouch: todayKey() });
    // 上限 8 条：超出丢弃 strength 最低的一条，strength 相同则丢弃最早写入（数组最靠前）的一条
    while (bucket.length > 8) {
      let worst = 0;
      for (let i = 1; i < bucket.length; i++) {
        if (bucket[i].strength < bucket[worst].strength) {
          worst = i;
        }
      }
      bucket.splice(worst, 1);
    }
    st.mem[npcId] = bucket;
    /* persisted=false 表示"只在内存里记住了"（initState 非 ok 或配额满）。
       原先直接丢弃 save() 返回值后仍报 ok:true，玩家以为老卒记住了，
       刷新后台词从"认得你"退回"这位朋友"，且日志里一个字都没有。 */
    const persisted = save();
    return { ok: true, count: bucket.length, persisted: persisted };
  }

  // ============ 查询 ============
  // 某 NPC 全部记忆的 strength 之和
  function sumStrength(bucket){
    let sum = 0;
    for (let i = 0; i < bucket.length; i++) {
      sum += bucket[i].strength;
    }
    return sum;
  }

  function list(npcId){
    ensureDay();
    if (typeof npcId !== 'string' || !bucketOk(npcId)) {
      return [];
    }
    const bucket = st.mem[npcId];
    const order = bucket.map(function(m, i){ return { m: m, i: i }; });
    order.sort(function(a, b){
      if (b.m.strength !== a.m.strength) {
        return b.m.strength - a.m.strength; // strength 降序
      }
      return a.i - b.i; // 同 strength 按写入先后
    });
    return order.map(function(x){
      return { text: x.m.text, day: x.m.day, strength: x.m.strength, kind: x.m.kind }; // 浅拷贝
    });
  }

  function attitude(npcId){
    ensureDay();
    if (typeof npcId !== 'string' || !bucketOk(npcId)) {
      return 0;
    }
    return Math.min(sumStrength(st.mem[npcId]) * 2, 16); // 好感修正封顶 +16
  }

  function mention(npcId){
    ensureDay();
    if (typeof npcId !== 'string' || !bucketOk(npcId) || st.mem[npcId].length === 0) {
      return { knowsPlayer: false, top: null, attitude: 0 };
    }
    const bucket = st.mem[npcId];
    let top = bucket[0];
    for (let i = 1; i < bucket.length; i++) {
      if (bucket[i].strength > top.strength) {
        top = bucket[i];
      }
    }
    // top 取 strength 最高的记忆文本，同 strength 取最早写入（严格大于才替换，即保留靠前的一条）
    return { knowsPlayer: true, top: top.text, attitude: Math.min(sumStrength(bucket) * 2, 16) };
  }

  // 按类别回忆：优先该类别 strength 最高的一条，无该类记忆回退整体最新一条
  function recall(npcId, kind){
    ensureDay();
    const sorted = list(npcId); // 已按 strength 降序、同强度按写入先后
    if (sorted.length === 0) {
      return { knowsPlayer: false, top: null, attitude: 0 };
    }
    const target = normKind(kind);
    let top = sorted[0]; // 整体最新：strength 最高的一条
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].kind === target) {
        top = sorted[i]; // 该类别第一条即该类 strength 最高的最新一条
        break;
      }
    }
    return { knowsPlayer: true, top: top.text, attitude: attitude(npcId) };
  }

  // 态度门槛查询：attitude(npcId) ≥ threshold；threshold<=0 时恒真（仅 npcId 非法为 false）
  function gate(npcId, threshold){
    if (typeof npcId !== 'string' || npcId.trim() === '') {
      return false;
    }
    if (typeof threshold !== 'number' || !isFinite(threshold) || threshold < 0) {
      return false;
    }
    if (threshold <= 0) {
      return true; // 门 0：不读 st.mem，恒真
    }
    if (!bucketOk(npcId)) {
      return false;
    }
    return attitude(npcId) >= threshold;
  }

  // ============ 迁移 ============
  // NPC ID 改名/老档迁移：fromId 桶整体搬入 toId（同文本 toId 优先保留），一次性使用
  function migrate(fromId, toId){
    if (typeof fromId !== 'string' || fromId.trim() === '' || typeof toId !== 'string' || toId.trim() === '') {
      return { ok: false, msg: '参数无效' };
    }
    if (fromId === toId) {
      return { ok: true, moved: 0, kept: 0 }; // no-op，不写盘
    }
    ensureDay();
    const fromBucket = bucketOk(fromId) ? st.mem[fromId] : [];
    const toExisted = bucketOk(toId);
    const toBucket = toExisted ? st.mem[toId] : [];
    const kept = toBucket.length;
    let moved = 0;
    for (let i = 0; i < fromBucket.length; i++) {
      const m = fromBucket[i];
      let dup = false;
      for (let j = 0; j < toBucket.length; j++) {
        if (toBucket[j].text.trim() === m.text.trim()) {
          dup = true; // 同文本：toId 优先保留原条目，kind/strength 均不动
          break;
        }
      }
      if (!dup) {
        // R2-a 对齐 sanitize：缺 lastTouch 的旧档记忆迁移时置当前日期（非原始 day），避免升级首日一次性大幅衰减
        toBucket.push({ text: m.text, day: m.day, strength: m.strength, kind: m.kind, lastTouch: (typeof m.lastTouch === 'string' && m.lastTouch) ? m.lastTouch : todayKey() });
        moved++;
      }
    }
    // 合并后容量 8：与 record() 的压缩规则一致（最低 strength 先淘汰，同强度淘汰最靠前/最早写入的一条）
    while (toBucket.length > 8) {
      let worst = 0;
      for (let i = 1; i < toBucket.length; i++) {
        if (toBucket[i].strength < toBucket[worst].strength) {
          worst = i;
        }
      }
      toBucket.splice(worst, 1);
    }
    if (memHas(fromId)) {
      delete st.mem[fromId];
    }
    if (toExisted || moved > 0) {
      st.mem[toId] = toBucket;
    }
    save();
    return { ok: true, moved: moved, kept: kept };
  }

  // ============ 脏数据清洗 ============
  // 返回值仅供内部判断“是否发生了数据变更”（load 据此立即落盘）
  function sanitize(){
    let changed = false;
    if (typeof st !== 'object' || st === null || Array.isArray(st)) {
      st = blank();
      return true;
    }
    if (typeof st.day !== 'string') {
      st.day = '';
      changed = true;
    }
    if (typeof st.mem !== 'object' || st.mem === null || Array.isArray(st.mem)) {
      st.mem = {};
      changed = true;
    }
    const today = todayKey();
    for (const npcId in st.mem) {
      if (!memHas(npcId)) {
        continue; // 只清洗自有属性桶，原型链上的键不动
      }
      const bucket = st.mem[npcId];
      if (!Array.isArray(bucket)) {
        st.mem[npcId] = [];
        changed = true;
        continue;
      }
      const seen = Object.create(null);
      const clean = [];
      for (let i = 0; i < bucket.length; i++) {
        const m = bucket[i];
        if (typeof m !== 'object' || m === null) {
          changed = true;
          continue;
        }
        if (typeof m.text !== 'string' || m.text.trim() === '') {
          changed = true;
          continue; // text 无效：丢弃
        }
        if (typeof m.day !== 'string') {
          m.day = today; // day 无效：置当日
          changed = true;
        }
        if (typeof m.strength !== 'number' || !isFinite(m.strength) || m.strength <= 0) {
          m.strength = 1; // strength 无效：置 1
          changed = true;
        }
        if (KINDS.indexOf(m.kind) === -1) {
          m.kind = 'misc'; // kind 缺失/非法：归入 'misc'（老档无 kind 字段兼容）
          changed = true;
        }
        if (typeof m.lastTouch !== 'string') {
          m.lastTouch = today; // R2-a：旧存档记忆缺 lastTouch → 首次迁移置当前日期（非原始 day），避免升级首日一次性大幅衰减
          changed = true;
        }
        if (seen[m.text.trim()]) {
          changed = true;
          continue; // trim 相同文本只保留最早一条
        }
        seen[m.text.trim()] = true;
        clean.push(m);
      }
      // 容量 8 清理：与 record() 的 while 压缩规则完全一致（最低 strength 先淘汰，同强度淘汰最靠前/最早写入的一条）
      while (clean.length > 8) {
        let worst = 0;
        for (let i = 1; i < clean.length; i++) {
          if (clean[i].strength < clean[worst].strength) {
            worst = i;
          }
        }
        clean.splice(worst, 1);
        changed = true;
      }
      if (clean.length !== bucket.length) {
        changed = true;
      }
      st.mem[npcId] = clean;
    }
    return changed;
  }

  // ============ 对外：调试/重置 ============
  function _state(){
    return JSON.parse(JSON.stringify(st)); // 深拷贝，外部改动不影响内部状态
  }

  function _reset(){
    /* 显式重置是受控恢复路径：写空态成功后才解除保护。不得由启动流程自动调用。
       ⚠️ 顺序不能反。原实现先 initState='ok' 再 rawSave()，写失败时留下面这个危险组合：
       内存空 + 磁盘旧 + 已允许写盘 → 之后任意一次 record() 都会用「空白 + 新记忆」覆盖旧档，
       或刷新后把上一档整桶记忆读回来（"重开 = 全新的人"被破坏）。
       现在失败就保持 blocked，宁可这局不记新记忆，也不覆盖玩家旧档。 */
    st = blank();
    if(!rawSave()){
      initState = 'blocked';
      try{ console.error('[NpcMemory] 重置写盘失败，保持 fail-closed（本局不再写记忆）'); }catch(e2){}
      return { ok: false, persisted: false };
    }
    initState = 'ok';
    return { ok: true, persisted: true };
  }

  function init(h){
    /* 复审 A3：init 任何一步异常都必须保持 blocked（fail-closed），
       不能只靠 game.js 吞异常；否则 load 未完成 / ensureDay 抛错时 st 仍是
       blank()，后续 record() 会覆盖磁盘上可能完好的旧数据。 */
    initState = 'uninit';
    try {
      hooks = h || {};
      load();
      if (initState !== 'ok') return;
      ensureDay();
      initState = 'ok';
    } catch (e) {
      initState = 'blocked';
    }
  }

  window.NpcMemory = {
    init: init,
    record: record,
    list: list,
    attitude: attitude,
    mention: mention,
    recall: recall,
    gate: gate,
    migrate: migrate,
    KINDS: KINDS.slice(),
    ensureDay: ensureDay,
    sanitize: sanitize,
    load: load,
    save: save,
    _state: _state,
    _reset: _reset
  };
})();
