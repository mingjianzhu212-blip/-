/* ============================================================
 * npc_tri.js — 话题三态状态机（记忆 NPC 通用框架 · 第一步）
 *
 * 纯逻辑：不碰 DOM、不读 S、不改存档结构；只读传入的 st/topic/ctx。
 *   三态：'new'（未聊） / 'talked'（已聊） / 'expired'（已过期）
 *   判定全部派生，不落盘：
 *     new     = heard 不含该 topic
 *     expired = heard 含 且 topic.expired.cond(st, ctx) 为真 且 told 不含该 id
 *     talked  = 其余（含「过期提及过一次」之后回落）
 *   过期只提一次：由调用方在结算成功后调 markTold(st, id) 写入 st.told（已批字段 F-1）。
 *
 *   重复文本轮换：idx = (cur.talk + hash(topicId)) % repeat.length
 *     —— 不新增计数；cur.talk 每次结算 +1，连点 3 次必得「首次 + 两句不同重复」。
 * ============================================================ */
window.NpcTri = (function(){
  'use strict';

  /* FNV-1a 32 位：与 js/npc.js 的 npcHash 同算法，但不依赖其内部函数（框架不认角色） */
  function hash(str){
    str = String(str == null ? '' : str);
    var h = 0x811c9dc5;
    for(var i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function heardOf(st){ return (st && Array.isArray(st.heard)) ? st.heard : []; }
  function toldOf(st){ return (st && Array.isArray(st.told)) ? st.told : []; }

  function stateOf(topic, st, ctx){
    if(!topic || !topic.id || !st) return 'new';
    if(heardOf(st).indexOf(topic.id) < 0) return 'new';
    var ex = topic.expired;
    if(ex && typeof ex.cond === 'function'){
      var hit = false;
      try{ hit = !!ex.cond(st, ctx || {}); }catch(e){ hit = false; }
      if(hit && toldOf(st).indexOf(topic.id) < 0) return 'expired';
    }
    return 'talked';
  }

  /* pick — 返回这句话该说什么；写回由调用方（npcPick）统一做，保持结算出口唯一。
     @param topic   内容包里的话题对象（需 repeat[] / expired{text,cond}）
     @param st      S.npcs.<id>
     @param ctx     上下文（只用于 expired.cond）
     @param optReply 首次文本（由既有结算传进来；为 null 表示不是首次）
     @return { kind, text, mark }  mark=true 表示这是一次「过期提及」，调用方须写 told */
  function pick(topic, st, ctx, optReply){
    if(!topic) return { kind: 'new', text: optReply || '', mark: false };
    var s = stateOf(topic, st, ctx);
    if(s === 'new') return { kind: 'new', text: (optReply != null ? optReply : (topic.firstText || '')), mark: false };
    if(s === 'expired'){
      var ex = topic.expired || {};
      return { kind: 'expired', text: String(ex.text || ''), mark: true };
    }
    var pool = Array.isArray(topic.repeat) ? topic.repeat : [];
    if(!pool.length) return { kind: 'talked', text: (optReply || ''), mark: false };
    var talk = (st && st.cur && typeof st.cur.talk === 'number') ? st.cur.talk : 0;
    var idx = (talk + hash(topic.id)) % pool.length;
    return { kind: 'talked', text: String(pool[idx] || ''), mark: false };
  }

  /* markTold — 追加「已给过过期提及」的 topic id（上限 16，去重；只收字符串） */
  function markTold(st, id){
    if(!st || typeof st !== 'object' || typeof id !== 'string' || !id) return false;
    if(!Array.isArray(st.told)) st.told = [];
    if(st.told.indexOf(id) >= 0) return false;
    st.told.push(id);
    if(st.told.length > 16) st.told = st.told.slice(-16);
    return true;
  }

  return { stateOf: stateOf, pick: pick, markTold: markTold, _hash: hash };
})();