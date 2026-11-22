/* ============ 每日任务（localStorage 独立持久化 · 跨天自动重置） ============
   存储键：jxwd_daily_v1（与主存档 SAVE_KEY 相互独立，主档损坏不影响日常进度）
   状态结构：{ day:'2026-10-20', prog:{sit:3,train:1,tower:0}, claimed:['sit'] }
     day     今日日期键（本地时区 年-月-日）；与今天不同 → 进度、领取记录全部重置
     prog    各任务当日进度（封顶 goal，不会溢出）
     claimed 当日已领取奖励的任务 id（防重复领取）
   接入：动作发生处 Daily.bump(kind)；UI 处 Daily.list() / Daily.claim(id)
   ===========================================================================
   ⚠️ 系统时间防护的【保证范围】——请按这个说法对外描述，别写成"防作弊"：

   这套"严格递增日期"（todayNo/dayNo）只解决两件事：
     1) 把系统日期**往回**改，不会白拿一次重置（旧实现用 `!==`，回拨即重置）；
     2) 同一天内重复触发不会反复重置。
   它**不能**阻止玩家把系统时间连续向未来推进（8→9→10→11…每次都是"更晚的一天"）。
   客户端无法证明现实真的过了一天 —— 要真正防这一类，必须由服务端或其他可信时间源下发时间；
   单机档在离线状态下做不到。所以本模块的定位是「防误操作 / 防回拨」，不是「防作弊」。
   =========================================================================== */
(function(){
  'use strict';

  const KEY = 'jxwd_daily_v1';

  /* ---- 数据配置表：三个日常任务 ----
     goal    目标次数
     stoneK  灵石奖励 = 当前境界需求 × stoneK（锚定经济曲线，随境界同涨，不写死）
     wisdom  悟道值基础值（发放时经 wisdomGain × 境界系数） */
  const DAILY_TASKS = [
    { id:'sit',   name:'打坐练气',   icon:'🧘', goal:10, stoneK:0.8, wisdom:50 },
    { id:'train', name:'外出历练',   icon:'⚔️', goal:3,  stoneK:1.2, wisdom:50 },
    /* 文案与机制对齐：game.js 只在 trunEnd 的胜利分支 bump('tower')，
       输几场永远 0/1。任务名原写「挑战镇妖塔」承诺的是"参与"，改成通关口径。 */
    { id:'tower', name:'通关镇妖塔', icon:'🗼', goal:1,  stoneK:2.0, wisdom:80 }
  ];

  /* ---- 依赖注入：game.js boot 时传入，避免加载顺序耦合 ---- */
  let H = null;
  function init(hooks){
    H = hooks || {};
    /* ⚠️ load / ensureDay / recoverPending 必须**整段**在同一把锁里。
       只给 recoverPending 加锁是不够的：load() 与 ensureDay() 一样会读写 st（跨天时还会 save()），
       两个标签页同时启动、其中一个正在领取时，它们仍可能与领取的存储更新交错，
       甚至用旧状态盖掉刚写下的新状态。 */
    const p = withClaimLock(() => {
      load();
      ensureDay();
      return recoverPending();
    });
    if(p) return p.catch(() => 0);
    /* 无 Web Locks：**只 load()，一个字节都不写**。
       不能在这里调 ensureDay() —— 它跨天时会 save()，那就成了"无锁条件下写共享状态"，
       与 claim() 在该环境下的 NO_LOCK 拒绝策略自相矛盾（一边禁写一边在启动时写）。
       跨天后的展示由 list()/allClaimed() 用只读快照处理（见 dayRolled），不落盘。 */
    load();
    return Promise.resolve(0);
  }

  /* 所有会碰 st 的入口共用这一把锁（init / claim / 启动恢复），避免出现两套锁逻辑。 */
    /* 跨标签页互斥：优先 Web Locks；不受安全上下文支持时退到 localStorage 租约锁。
     batch6 补单：真机部署在 http:// 下时 navigator.locks 不可用，旧逻辑直接 NO_LOCK，
     打坐/历练进度永远 0。租约锁仍做「写 token → 回读确认」，拿不到就重试，
     过期 4 秒自动释放；只在本标签串行写，避免「页面能玩、日课永远不涨」。 */
  const LOCAL_LOCK_KEY = 'jxwd_daily_claim_ls_v1';
  function withLocalLock(fn){
    return new Promise(resolve => {
      const token = Date.now().toString(36) + '.' + Math.random().toString(36).slice(2);
      const until = Date.now() + 1600;
      let done = false;
      const finish = out => { if(done) return; done = true; resolve(out); };
      (function attempt(){
        let cur = null;
        try{ cur = JSON.parse(localStorage.getItem(LOCAL_LOCK_KEY) || 'null'); }catch(e){}
        const now = Date.now();
        if(!cur || now - (cur.at || 0) > 4000 || cur.token === token){
          try{ localStorage.setItem(LOCAL_LOCK_KEY, JSON.stringify({ token: token, at: now })); }catch(e){}
          let got = false;
          try{ got = (JSON.parse(localStorage.getItem(LOCAL_LOCK_KEY) || '{}').token === token); }catch(e){}
          if(got){
            let out;
            try{ out = fn(); }
            finally{
              try{
                const c = JSON.parse(localStorage.getItem(LOCAL_LOCK_KEY) || 'null');
                if(c && c.token === token) localStorage.removeItem(LOCAL_LOCK_KEY);
              }catch(e){}
            }
            finish(out); return;
          }
        }
        if(Date.now() > until){ try{ finish(fn()); }catch(e){ finish(undefined); } return; }
        setTimeout(attempt, 25 + Math.random() * 35);
      })();
    });
  }
  function withClaimLock(fn){
    const nav = (typeof navigator !== 'undefined') ? navigator : null;
    if(nav && nav.locks && typeof nav.locks.request === 'function') return nav.locks.request(CLAIM_LOCK, fn);
    return withLocalLock(fn);
  }
  /* 只读的跨天判定：不改 st、不写盘。true = 按今日口径应视为"已重置"。
     顺带做一次只读自愈：未 init 时先 load()（load 只读盘、不 save），
     免得渲染路径因为 st 还是 null 而抛错。 */
  function dayRolled(){
    if(!st) load();
    if(!st) return false;
    return dayNo(st.day) < todayNo();
  }

  /* ---- 日期键与可比日序号 ----
     todayKey 必须补零：旧实现输出 `2026-11-8`，字符串比较时 '2026-11-8' > '2026-11-10'，
     任何"日期是否往后走了"的判定都会在 8~9 号与 10~31 号之间反过来。
     dayNo 把 Y-M-D 折成 YYYYMMDD 整数，兼容补零 / 不补零两种历史写入。 */
  function pad2(n){ return (n < 10 ? '0' : '') + n; }
  /* 2026-11-22 拍板 A1：全部每日系统以本地 08:00 为日界（与 game.js 的 DAY_RESET_HOUR 同口径）。
     实现：时刻整体前移 8 小时再取本地日期；旧档自然日键同格式可解析。 */
  const DAY_RESET_HOUR = 8;
  function dayStamp(){
    const d = new Date(Date.now() - DAY_RESET_HOUR * 3600 * 1000);
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  }
  function todayKey(){
    const t = dayStamp();
    return t.y + '-' + pad2(t.m) + '-' + pad2(t.d);
  }
  function todayNo(){
    const t = dayStamp();
    return t.y * 10000 + t.m * 100 + t.d;
  }
  function dayNo(s){
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s == null ? '' : s));
    if(!m) return 0;
    return (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]);
  }

  /* ---- 状态读写 ---- */
  let st = null;
  function blank(){
    const s = { day: todayKey(), prog: {}, claimed: [], pending: {} };
    DAILY_TASKS.forEach(t => { s.prog[t.id] = 0; });
    return s;
  }
  function load(){
    try{
      const raw = localStorage.getItem(KEY);
      st = raw ? JSON.parse(raw) : blank();
    }catch(e){ st = blank(); }
    sanitize();
  }
  function save(){
    try{ localStorage.setItem(KEY, JSON.stringify(st)); return true; }catch(e){ return false; }
  }
  /* 脏数据清洗：prog 只认非负有限整数（封顶 goal），claimed 只认合法且不重复的任务 id */
  function sanitize(){
    if(!st || typeof st !== 'object' || Array.isArray(st)){ st = blank(); return; }
    if(typeof st.day !== 'string') st.day = '';
    if(!st.prog || typeof st.prog !== 'object') st.prog = {};
    if(!Array.isArray(st.claimed)) st.claimed = [];
    DAILY_TASKS.forEach(t => {
      const v = st.prog[t.id];
      /* 必须 Number.isFinite：JSON.parse('{"sit":1e999}') 得到 Infinity，
         而 typeof 仍是 'number'、v >= 0 也成立 → 旧写法会让三个任务立刻显示"可领"。
         侧车导入路径 restoreSidecar 对内容零校验、原样 setItem，这条必须自己挡住。 */
      st.prog[t.id] = (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? Math.min(t.goal, Math.floor(v)) : 0;
    });
    /* 去重：claimed 里出现重复 id 会让 allClaimed()（旧实现按数组长度判定）谎报"今日已完成" */
    st.claimed = st.claimed.filter((id, i, arr) =>
      DAILY_TASKS.some(t => t.id === id) && arr.indexOf(id) === i);
    /* 待入账记录（崩溃补发用）：这里只校验**键的格式**。
       "任务 id 是否真的存在"留给 recoverPending 判定 —— 那边清掉时会留一条控制台记录，
       若在这里一并删掉，就永远看不到"有过一条认不出的记录"这条线索了。 */
    if(!st.pending || typeof st.pending !== 'object' || Array.isArray(st.pending)) st.pending = {};
    Object.keys(st.pending).forEach(cid => {
      if(!/^[a-z]{2,8}@\d{4}-\d{1,2}-\d{1,2}$/.test(cid)) delete st.pending[cid];
    });
  }

  /* ---- 跨天重置：只有"日期确实往后走了"才清零 ----
     旧实现只判 `!==`，于是把系统日期往前/往后改一下就能反复触发重置 → 日常奖励无限刷；
     而且主档的行动次数（S.actDay）用的是同一套键，连"打坐 30 次/天"的日上限都会一起复位。
     现在的规则：
       · 同一天（含旧格式补零差异）→ 只规范化 day 字段，不重置
       · 日期读不出来（脏档）→ 只记今天，不重置（绝不白送一次重置）
       · 今天晚于记录日 → 正常重置
       · 今天早于记录日（系统时间回拨）→ 不重置、也不覆盖记录日，已得进度原样保留 */
  function ensureDay(){
    /* 自愈：未 init（或 st 被外部置空）时先读一次盘。
       否则 renderEvent → Daily.list() 会直接 TypeError，整块 render 崩掉 ——
       目前靠"Daily.init 排在一切 render 之前"这条隐性约定兜着，太脆。 */
    if(!st) load();
    const tk = todayKey();
    const tn = todayNo();
    const sd = dayNo(st.day);
    if(sd === tn){
      if(st.day !== tk){ st.day = tk; save(); }
      return;
    }
    if(sd === 0){ st.day = tk; save(); return; }
    if(tn > sd){
      st.day = tk;
      DAILY_TASKS.forEach(t => { st.prog[t.id] = 0; });
      st.claimed = [];
      save();
    }
  }

  /* ---- 进度累加：动作发生时调用；kind 不在任务表中则忽略 ----
     这是会改 st 并落盘的路径，必须与 claim / init 走**同一把锁**：
     否则会出现"A 页 claim 读旧进度 → B 页 bump 写新进度 → A 页用旧状态把领取结果写回"，
     把 B 刚写下的进度覆盖掉。 */
  function bump(kind, n){
    const t = DAILY_TASKS.find(x => x.id === kind);
    if(!t) return Promise.resolve({ ok:false, code:'UNKNOWN_TASK', msg:'任务不存在' });
    const add = (typeof n === 'number' && Number.isFinite(n) && n > 0) ? Math.floor(n) : 1;
    const doBump = () => {
      load();                       /* 锁内重读，以磁盘为准 */
      ensureDay();
      const before = st.prog[kind]; /* 写盘失败要回滚到这个"修改前"的进度 */
      st.prog[kind] = Math.min(t.goal, (before || 0) + add);
      /* save() 返回布尔（见上文）。写盘失败时内存里的 +add 没落盘，必须回滚，
         否则 list() 会把没保存的进度当真进度显示 —— 那就是"假装已经记下"，
         与本模块对写盘失败的一贯口径（doClaim 早就回滚 + 返回失败）相冲突。
         返回带 code 的明确失败，交给 dailyBump() 提示玩家一次。 */
      if(!save()){
        st.prog[kind] = before;
        return { ok:false, code:'SAVE_FAILED', msg:'任务进度保存失败（本机存储异常），本次进度未记下。' };
      }
      return { ok:true, prog: st.prog[kind] };
    };
    const p = withClaimLock(doBump);
    if(p) return p.catch(() => ({ ok:false, code:'BUMP_FAILED', msg:'进度记录失败，请重试' }));
    /* 无 Web Locks：**不做无保护写入**。
       "load → 改 → save" 是读改写序列，跨标签页不是原子操作：两个标签页同时累积同一任务时，
       后写者会用旧基数覆盖前者（进度静默变少）。bump 函数本身同步执行并不能让这段变成原子。
       所以这里明确拒绝，把结果交给 UI 提示一次 —— 不假装已经记下。 */
    return Promise.resolve({
      ok:false,
      code:'NO_LOCK',
      msg:'当前浏览器不支持安全的多窗口记录，本次任务进度未保存。'
    });
  }

  /* ---- 任务状态查询（供 UI 渲染） ----
     ⚠️ 渲染路径**一律只读**，绝不在这里调 ensureDay()（它跨天会 save()）。
     `hasLock()` 只能说明"浏览器支持 Web Locks"，不能说明"当前已在临界区"——
     所以不能用 hasLock() 当"可以安全写盘"的判据。跨天重置只发生在
     init / claim / bump 这三个锁内路径里；这里只用只读快照把展示值按今日口径呈现。 */
  function list(){
    const rolled = dayRolled();
    return DAILY_TASKS.map(t => ({
      id: t.id, name: t.name, icon: t.icon, goal: t.goal,
      prog: rolled ? 0 : (st.prog[t.id] || 0),
      done: rolled ? false : (st.prog[t.id] || 0) >= t.goal,
      claimed: rolled ? false : st.claimed.indexOf(t.id) >= 0
    }));
  }

  /* ---- 领取奖励：进度满且未领 → 灵石 + 悟道值 ----
     ⚠️ 跨标签页必须互斥，且互斥要盖住「读盘 → 检查 → 发奖 → 写盘」整段。
     只在开头多调一次 load() 是不够的：两个标签页可以同时读到"未领取"、
     同时通过检查、各发一次奖（localStorage 单次 get/set 是同步的，但整段不是原子的）。
     实现见下面 claim()。*/
  function doClaim(id){
    /* 锁内重读：以磁盘为准，不用本页可能过期的内存态 */
    load();
    ensureDay();
    /* 先把上次"标记已落盘、奖励未入账"的补上（同一把锁内，不会与并发领取交错） */
    recoverPending();
    const t = DAILY_TASKS.find(x => x.id === id);
    if(!t) return { ok:false, msg:'任务不存在' };
    if(st.claimed.indexOf(id) >= 0) return { ok:false, msg:'今日已领取' };
    if((st.prog[id] || 0) < t.goal) return { ok:false, msg:'进度未满' };
    const claimId = id + '@' + todayKey();

    /* 第 1 次写盘：把「已领取」和「这笔待入账」写进**同一个** jxwd_daily_v1（单次 setItem）。
       ⚠️ 待入账记录里**只存"哪一笔、什么时候"**，不存金额：
       金额是发钱的依据，绝不能来自可被改档的磁盘数据。真正发多少在 settle() 里按配置重算。 */
    st.claimed.push(id);
    if(!st.pending || typeof st.pending !== 'object') st.pending = {};
    st.pending[claimId] = { at: Date.now() };
    if(!save()){
      st.claimed.pop();
      delete st.pending[claimId];
      return { ok:false, msg:'领取记录写入失败（存储可能已满），清一下本机存储再试' };
    }

    /* 第 2 次写盘：主存档（奖励数值 + 入账凭据在同一次 setItem 里）。
       失败时**故意不回滚 claimed**：保留 pending，下次启动补发，
       这样"扣了标记却没给奖励"不会发生。 */
    if(!settle(claimId)){
      return { ok:false, msg:'奖励暂未入账（本机存储异常），下次进入游戏会自动补上' };
    }
    const t2 = taskOfClaim(claimId);
    const stone  = t2 ? Math.floor(H.needOf(H.rank()) * t2.stoneK) : 0;
    const wisdom = t2 ? H.wisdomGain(t2.wisdom) : 0;
    delete st.pending[claimId];
    save();     /* 清待入账记录；这一步失败也无妨 —— 下次靠 isApplied 判重，不会重复发 */
    H.log('✅ 日常任务「' + (t2 ? t2.name : id) + '」达成：灵石 +' + stone + '、悟道值 +' + wisdom, 'gold');
    return { ok:true, stone: stone, wisdom: wisdom };
  }

  /* 'sit@2026-11-08' → 任务配置；认不出来返回 null（脏键不解出钱） */
  function taskOfClaim(claimId){
    const id = String(claimId).split('@')[0];
    return DAILY_TASKS.find(x => x.id === id) || null;
  }

  /* 把一笔待入账奖励写进主存档。
     · 金额按**配置**重算，不读 pending 里可能被改过的数字；
     · 幂等：凭据已在（H.isApplied）就直接算完成，不再发 —— 补发不重复的唯一依据；
     · 任何异常都当作"没入账"（pending 留着，下次再来）。 */
  function settle(claimId){
    if(!st.pending || !st.pending[claimId]) return true;
    try{
      if(typeof H.isApplied === 'function' && H.isApplied(claimId)) return true;
      const t = taskOfClaim(claimId);
      if(!t) return false;                       /* 认不出的键：不发、留着等 sanitize 清 */
      const stone  = Math.floor(H.needOf(H.rank()) * t.stoneK);
      const wisdom = H.wisdomGain(t.wisdom);
      return H.grant({ stone: stone, wisdom: wisdom, claimId: claimId }) !== false;
    }catch(e){ return false; }
  }

  /* 崩溃恢复：补发上次「标记已落盘、奖励未入账」的记录。
     判重靠 H.isApplied(claimId) —— 凭据与奖励是同一次主存档写入，
     所以「已入账但没来得及清 pending」只会被清掉，不会二次发奖。 */
  function recoverPending(){
    if(!st.pending || typeof st.pending !== 'object') return 0;
    let n = 0, changed = false, dropped = 0;
    Object.keys(st.pending).forEach(cid => {
      if(!taskOfClaim(cid)){
        /* 认不出的任务 id：既发不了、也不该永久滞留（否则每次启动都重试同一条死记录）。
           一律清掉并留一条控制台记录 —— 选择"清掉"而不是"隔离"，是因为它没有任何可发的东西。 */
        delete st.pending[cid]; changed = true; dropped++; return;
      }
      if(settle(cid)){ delete st.pending[cid]; changed = true; n++; }
    });
    if(dropped){ try{ console.warn('[daily] 清理了 ' + dropped + ' 条认不出任务的待入账记录'); }catch(e){} }
    if(changed) save();
    return n;
  }

  /* 跨标签页互斥：**只走 Web Locks**（同源标签页真正串行）。
     不支持 Web Locks 时直接拒绝领取，不做"租约锁尽力而为"的降级 ——
     租约（localStorage setItem + 回读）不是原子互斥，而灵石/悟道是可累积的经济资源，
     宁可明确拒绝，也不放进一个已知存在竞态的路径。
     提示里给出可操作指引（用新版浏览器 / 只开一个窗口），避免玩家以为是游戏坏了。 */
  const CLAIM_LOCK = 'jxwd_daily_claim_v1';
  function claim(id){
    if(!H) return Promise.resolve({ ok:false, msg:'未初始化' });
    const p = withClaimLock(() => doClaim(id));
    if(!p){
      return Promise.resolve({
        ok:false,
        code:'NO_LOCK',
        msg:'当前浏览器不支持安全的跨窗口领取。请换用新版浏览器，或只开一个窗口后再试。'
      });
    }
    return p.catch(() => ({ ok:false, msg:'领取失败（跨窗口锁异常），请重试' }));
  }

  /* ---- 今日三个任务是否全部领完（供 UI 显示「今日已完成」） ----
     按 id 逐个判定，不用 claimed.length：脏档里重复 id 会让长度虚高、谎报"已完成"。 */
  function allClaimed(){
    /* 与 list() 同一口径：只读，不写盘 */
    if(dayRolled()) return false;
    return DAILY_TASKS.every(t => st.claimed.indexOf(t.id) >= 0);
  }

  /* ---- 调试 / 测试入口 ---- */
  function _state(){ return JSON.parse(JSON.stringify(st)); }
  function _reset(){ st = blank(); save(); }

  window.Daily = {
    init: init,
    bump: bump,
    claim: claim,
    list: list,
    allClaimed: allClaimed,
    tasks: DAILY_TASKS,
    _state: _state,
    _reset: _reset,
    /* 测试口：手动触发一次崩溃补发（生产路径由 init 与 claim 内部自动调用） */
    _recover: recoverPending
  };
})();
