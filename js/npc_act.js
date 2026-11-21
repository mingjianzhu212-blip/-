/* ============================================================
 * npc_act.js — 主动触发调度（记忆 NPC 通用框架 · 第一步）
 *
 * 纯逻辑：不碰 DOM、不读 S、只读传入的 st/ctx 与日额度 act。
 * 三类节点（优先级：转世 > 大境界 > 久未回归）：
 *   reborn   gens 增加               → 现身
 *   break    跨 RANK 大境界段        → 现身（首句引用「现在境界 + 上次境界」两个真值）
 *   idle     lastSeen 距今 > 72h     → 固定地点偶遇
 * P2 丙（2026-11-16 批）：塔创新高不再由沈碑报（一个事实一个声音），改由崔九在塔页应声；
 *   原 tower 节点与信匣「塔第N层。老朽听见了。」退役。沈碑 lastTower 字段保留休眠。
 * 所有台词只含引用槽位（{rankName}/{prevName}/{gens}/{towerMax}），槽位由装配层用真实存档填；
 * 没有槽位的句子不得声称任何事实 —— 框架不编造事件。
 * 日额度：act = S.npcAct（已批 F-3，全局一份）；同一天已放行过一次即不再放行。
 * ============================================================ */
window.NpcAct = (function(){
  'use strict';

  var IDLE_MS = 72 * 3600 * 1000;   /* 与 js/npc.js 的 IDLE_MS 同口径（72 小时） */
  /* 大境界起始 rank（0 炼气 / 9 筑基 / 12 金丹 / 15 元婴 / 18 化神 / 21 炼虚 / 22 合体 / 23 大乘 / 24 渡劫 / 25 飞升） */
  var BIG = [0, 9, 12, 15, 18, 21, 22, 23, 24, 25];
  /* 2026-11-19 制作人批：来访每日上限 3 张（原 1 张）；事件 A 只挂跨大境界。
     小境界不惊动，避免一世 25 张把打坐按钮盖住。 */
  var DAILY_MAX = 3;

  function tierOf(r){
    var t = 0, v = (typeof r === 'number' && isFinite(r)) ? Math.floor(r) : 0;
    for(var i = 0; i < BIG.length; i++){ if(v >= BIG[i]) t = i; }
    return t;
  }
  function fill(tpl, ctx){
    return String(tpl == null ? '' : tpl).replace(/\{(\w+)\}/g, function(_, k){
      var v = ctx ? ctx[k] : '';
      return (v == null) ? '' : String(v);
    });
  }
  function quotaUsed(act, ctx){
    return !!(act && typeof act === 'object' && act.day && ctx && ctx.dayKey && act.day === ctx.dayKey && (act.n | 0) >= DAILY_MAX);
  }

  /* pick — 返回下一个该发生的主动事件（不写任何标记）；没有则 null */
  function pick(st, ctx, act){
    if(!st || typeof st !== 'object' || !ctx) return null;
    if(quotaUsed(act, ctx)) return null;

    /* 1 转世：gens 比上次见时多 */
    if((ctx.gens | 0) > (st.seenGens | 0)){
      return { kind: 'reborn', channel: 'visit', text: fill('第{gens}世了。碑还在这儿。', ctx) };
    }
    /* 2 大境界：跨段（小境界不惊动） */
    var last = (st.cur && typeof st.cur.lastRank === 'number') ? (st.cur.lastRank | 0) : 0;
    var rk = (typeof ctx.rank === 'number') ? (ctx.rank | 0) : 0;
    if(tierOf(rk) > tierOf(last)){
      return { kind: 'break', channel: 'visit', text: fill('{rankName}了。上回你走，还停在{prevName}。', ctx) };
    }
    /* 3 久未回归：与既有 idle 同口径（lastSeen 与 nudgeAt 都过 72h） */
    var now = (typeof ctx.now === 'number') ? ctx.now : 0;
    if(st.lastSeen > 0 && (now - st.lastSeen) > IDLE_MS && (now - (st.nudgeAt || 0)) > IDLE_MS){
      return { kind: 'idle', channel: 'meet', text: '有阵子没见你了。碑没挪。' };
    }
    return null;
  }

  /* mark — 消费一个事件：写该节点的完成标记 + 占掉当日额度（幂等：先判后写） */
  function mark(st, act, d, ctx){
    if(!st || !d || !ctx) return false;
    if(d.kind === 'reborn'){
      st.seenGens = ctx.gens | 0;
    } else if(d.kind === 'break'){
      if(!st.cur || typeof st.cur !== 'object') st.cur = {};
      st.cur.lastRank = ctx.rank | 0;
    } else if(d.kind === 'idle'){
      st.nudgeAt = ctx.now;
    } else {
      return false;
    }
    if(act && typeof act === 'object'){
      if(act.day !== (ctx.dayKey || '')){ act.day = ctx.dayKey || ''; act.n = 0; }
      act.n = (act.n | 0) + 1;
    }
    return true;
  }

  return { pick: pick, mark: mark, _tier: tierOf, _IDLE_MS: IDLE_MS };
})();