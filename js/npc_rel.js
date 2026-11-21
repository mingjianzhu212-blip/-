/* ============================================================
 * npc_rel.js — 关系事件引擎 + 可失去 + 状态机（记忆 NPC 框架 · 第二步）
 *
 * 纯逻辑：不碰 DOM、不读 S；只读传入的 st（S.npcs.<id>）与 ctx。
 *   ctx = { now, dayKey, dayNum(1..31), worldFoot, gens, seenGens, rank, towerMax }
 *
 * 口径（制作人 2026-11-16 批复）：
 *   · 阶段只认三类里程碑：托付完成度(trust)、事件关键选择(attitude.open)、付出代价(attitude.cost)；
 *     对话次数 cur.talk 一律不参与 stage 判定。
 *   · 老档映射：stage = max(旧 stage, relFloor(rel))，relFloor 15/30/60 → 1/2/3，只升不降。
 *   · 可失去：恶语/失约/长期冷落真实扣 rel；冷脸由 coldUntil 驱动；出卖托付永久关闭保密类。
 *   · 状态机：seclusion > away > bad > in，全部由时间与事件派生，不随机。
 * ============================================================ */
window.NpcRel = (function(){
  'use strict';

  var DAY = 86400000;

  function relFloor(rel){
    var r = (typeof rel === 'number' && isFinite(rel)) ? rel : 0;
    if(r >= 60) return 3;
    if(r >= 30) return 2;
    if(r >= 15) return 1;
    return 0;
  }

  /* 只升不降；返回 true 表示 stage 变了 */
  function setStage(st, n){
    if(!st || typeof st !== 'object') return false;
    var cur = (typeof st.stage === 'number') ? (st.stage | 0) : 0;
    var next = Math.max(0, Math.min(3, n | 0));
    if(next <= cur) return false;
    st.stage = next;
    return true;
  }

  /* 老档一次性映射（幂等：max 之后不会再降） */
  function migrateStage(st){
    if(!st || typeof st !== 'object') return false;
    return setStage(st, relFloor(st.rel));
  }

  function ensure(st, key, kind){
    if(!st || typeof st !== 'object') return null;
    if(kind === 'num'){ if(typeof st[key] !== 'number' || !isFinite(st[key])) st[key] = 0; return st[key]; }
    if(kind === 'obj'){ if(!st[key] || typeof st[key] !== 'object') st[key] = {}; return st[key]; }
    if(kind === 'arr'){ if(!Array.isArray(st[key])) st[key] = []; return st[key]; }
    return st[key];
  }
  function clampInt(v, lo, hi){
    return (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, Math.floor(v))) : lo;
  }
  function has(ev, id){ return Array.isArray(ev) && ev.indexOf(id) >= 0; }
  function mark(st, id){
    var ev = ensure(st, 'events', 'arr');
    if(ev.indexOf(id) < 0){ ev.push(id); if(ev.length > 16) st.events = ev.slice(-16); }
  }

  function isTrustBroken(st){ return has(st && st.events, 'trust_broken'); }

  /* ---- 三类里程碑 ---- */
  function milestone(st, kind, ctx){
    if(!st || typeof st !== 'object') return false;
    var att = ensure(st, 'attitude', 'obj');
    if(kind === 'trust'){
      st.trust = clampInt((st.trust | 0) + 1, 0, 3);
      return setStage(st, Math.min(3, 1 + st.trust));
    }
    if(kind === 'open'){
      att.open = clampInt((att.open | 0) + 1, 0, 99);
      if(att.open % 2 === 0) return setStage(st, Math.min(3, (st.stage | 0) + 1));
      return false;
    }
    if(kind === 'cost'){
      att.cost = clampInt((att.cost | 0) + 1, 0, 99);
      return setStage(st, Math.min(3, (st.stage | 0) + 1));
    }
    return false;
  }

  /* ---- 可失去 ---- */
  function num(v){
    return (typeof v === 'number' && isFinite(v)) ? v : 0;   /* 时间戳禁止 |0：32 位截断会变成负数 */
  }
  function chill(st, days, ctx){
    if(!st) return;
    var until = (ctx && ctx.now ? ctx.now : Date.now()) + days * DAY;
    st.coldUntil = Math.max(num(st.coldUntil), until);
  }
  function addRel(st, delta){
    if(!st) return;
    var v = (typeof st.rel === 'number' && isFinite(st.rel)) ? st.rel : 0;
    st.rel = Math.max(-100, Math.min(100, v + delta));
  }
  function reprimand(st, kind, ctx){
    if(!st) return;
    if(kind === 'rude'){ addRel(st, -8); chill(st, 1, ctx); }
    else if(kind === 'fail'){ addRel(st, -10); chill(st, 1, ctx); }
    else if(kind === 'betray'){ addRel(st, -30); chill(st, 3, ctx); mark(st, 'trust_broken'); }
  }

  /* 长期冷落：30 日未见扣一次（lastDecayAt 闸） */
  function decay(st, ctx){
    if(!st || !ctx) return false;
    var now = ctx.now || Date.now();
    var last = num(st.lastSeen);
    if(!last) return false;
    if(now - last < 30 * DAY) return false;
    if(now - num(st.lastDecayAt) < 30 * DAY) return false;
    st.lastDecayAt = now;
    addRel(st, -5);
    return true;
  }

  /* ---- 状态机 ---- */
  function stateOf(st, ctx){
    if(!st || !ctx) return 'in';
    var now = ctx.now || Date.now();
    var s = st.state;
    if(s && s.kind === 'seclusion' && num(s.until) > now) return 'seclusion';
    if(ctx.dayNum && ctx.dayNum % 7 === 0) return 'away';
    if(num(st.coldUntil) > now) return 'bad';
    return 'in';
  }
  function setSeclusion(st, days, ctx){
    if(!st) return;
    st.state = { kind: 'seclusion', until: (ctx && ctx.now ? ctx.now : Date.now()) + days * DAY };
  }

  /* ---- 托付线 ---- */
  var QUEST = {
    T1: { deadline: 3, failRel: -8, reward: { herb: 3 }, next: 'T2' },
    T2: { deadline: 5, failRel: -10, reward: { ore: 2 }, next: 'T3' },
    T3: { deadline: 7, failRel: -20, reward: { mat_bone: 1 }, next: null }
  };
  function questOpen(st, id, ctx){
    if(!st) return;
    st.quest = { id: id, state: 'open', at: (ctx && ctx.now) || Date.now() };
  }
  function questState(st){ return (st && st.quest && st.quest.id) ? st.quest.state : ''; }

  /* 完成/失败判定（只读 ctx 的真值）；返回 {done:[id], failed:[id]} */
  function questTick(st, ctx){
    var out = { done: [], failed: [] };
    if(!st || !st.quest || !st.quest.id) return out;
    var q = st.quest, cfg = QUEST[q.id];
    if(!cfg || q.state !== 'open') return out;
    var age = ((ctx && ctx.now ? ctx.now : Date.now()) - num(q.at)) / DAY;
    var done = false;
    if(q.id === 'T1') done = !!(ctx && ctx.worldFoot !== '');
    else if(q.id === 'T2') done = age >= 1;                      /* 记下之后隔日回来 */
    else if(q.id === 'T3') done = !!(ctx && (ctx.worldFoot === 'open' || ctx.worldFoot === 'self' || ctx.worldFoot === 'seal'));
    if(done){
      q.state = 'done';
      out.done.push(q.id);
      milestone(st, 'trust', ctx);
      return out;
    }
    if(age > cfg.deadline){
      q.state = 'failed';
      addRel(st, cfg.failRel);
      chill(st, q.id === 'T3' ? 2 : 1, ctx);
      if(q.id === 'T3') mark(st, 'trust_broken');
      out.failed.push(q.id);
    }
    return out;
  }

  /* ---- 事件对话 ---- */
  function nextEvent(st, ctx, eventsCfg){
    if(!st || !eventsCfg) return null;
    var stt = stateOf(st, ctx);
    if(stt !== 'in') return null;                                /* 不在/闭关/心情差时不出事件 */
    /* 第二个 NPC 样本：顺序可由配置给（沈碑不传 order → 原四段顺序逐字不变）；
       条件优先 ev.when(st,ctx)，无则回落沈碑的 evalCond。 */
    var order = Array.isArray(eventsCfg.order) ? eventsCfg.order : ['ev_brick','ev_name','ev_deep','ev_fail'];
    for(var i = 0; i < order.length; i++){
      var id = order[i], ev = eventsCfg[id];
      if(!ev || has(st.events, id)) continue;
      var hit = (typeof ev.when === 'function') ? !!ev.when(st, ctx) : evalCond(id, st, ctx);
      if(hit) return { id: id, line: ev.line, options: ev.options };
    }
    return null;
  }
  function evalCond(id, st, ctx){
    var stage = (st.stage | 0);
    if(id === 'ev_brick') return stage >= 1 && !st.quest && !isTrustBroken(st);
    if(id === 'ev_name') return st.quest && st.quest.id === 'T1' && st.quest.state === 'done' && !isTrustBroken(st);
    if(id === 'ev_deep'){
      if(!st.quest || st.quest.id !== 'T2' || st.quest.state !== 'done') return false;
      return !!(ctx && (ctx.worldFoot === 'open' || ctx.worldFoot === 'self' || ctx.worldFoot === 'seal'));
    }
    if(id === 'ev_fail') return !!(st.quest && st.quest.state === 'failed');
    return false;
  }
  /* 应用一个态度选项；返回 { text, kind } */
  function applyEvent(st, eventsCfg, evId, optId, ctx){
    if(!st || !eventsCfg || !eventsCfg[evId]) return null;
    var ev = eventsCfg[evId];
    var opt = null;
    for(var i = 0; i < (ev.options || []).length; i++){ if(ev.options[i].id === optId){ opt = ev.options[i]; break; } }
    if(!opt) return null;
    if(has(st.events, evId)) return null;                        /* 不可重开 */
    mark(st, evId);
    /* 事件选项可带 stageTo：与话题链同一 max 收敛入口（只升不降）。
       沈碑 events2 无该键 → 行为逐字不变。 */
    if(opt.stageTo) setStage(st, opt.stageTo);
    var kind = opt.attitude || 'guarded';
    if(kind === 'open') milestone(st, 'open', ctx);
    else if(kind === 'cost') milestone(st, 'cost', ctx);
    else if(kind === 'rude'){
      var att = ensure(st, 'attitude', 'obj');
      att.rude = clampInt((att.rude | 0) + 1, 0, 99);
      reprimand(st, opt.betray ? 'betray' : 'rude', ctx);
    } else {
      var a2 = ensure(st, 'attitude', 'obj');
      a2.guarded = clampInt((a2.guarded | 0) + 1, 0, 99);
    }
    /* 托付 id 白名单：沈碑走本文件的 QUEST 表；第二个 NPC 可在 eventsCfg.quests 里声明。
       缺声明且不在 QUEST → 不开，fail-closed。 */
    if(opt.quest && ((Array.isArray(eventsCfg.quests) && eventsCfg.quests.indexOf(opt.quest) >= 0) || QUEST[opt.quest])){
      questOpen(st, opt.quest, ctx);
    }
    if(opt.secludeDays) setSeclusion(st, opt.secludeDays, ctx);
    return { text: opt.reply || '', kind: kind };
  }

  /* ---- D3 尾巴：转世弥合一句（新写，不重放原文） ----
     opts 可选：{ field:'told'|'heard', text:'…' }。不传＝沈碑现状逐字不变；
     崔九没有 told，传 { field:'heard', text:TEXT.REBORN }，原句里的「碑」不归他说。 */
  function rebornEcho(st, ctx, opts){
    if(!st || !ctx) return null;
    if((ctx.gens | 0) <= (st.seenGens | 0)) return null;
    var field = (opts && opts.field === 'heard') ? 'heard' : 'told';
    var said = Array.isArray(st[field]) ? st[field] : [];
    if(!said.length) return null;
    var id = 'echo_' + (ctx.gens | 0);
    if(has(st.events, id)) return null;
    mark(st, id);
    return (opts && typeof opts.text === 'string' && opts.text)
      ? opts.text
      : '上回那句，老朽换个说法。碑记得的，比人记得的久。';
  }

  return {
    relFloor: relFloor, setStage: setStage, migrateStage: migrateStage,
    milestone: milestone, decay: decay, reprimand: reprimand,
    stateOf: stateOf, setSeclusion: setSeclusion,
    questOpen: questOpen, questState: questState, questTick: questTick,
    nextEvent: nextEvent, applyEvent: applyEvent, rebornEcho: rebornEcho,
    isTrustBroken: isTrustBroken, _QUEST: QUEST
  };
})();