/* ============ NPC 记忆语气切片 ============
   存储键：无（本切片不持久化，只消费 window.NpcMemory 的查询接口）
   ---------------------------------------------------------------------
   voice(npcId)：读取 NpcMemory.mention(npcId)，按好感修正分档，
                返回 { knowsPlayer, level, prefix, suffix, attitude }
   wrap(npcId, baseLine)：把 prefix 拼在台词前、suffix 拼在台词后
   ---------------------------------------------------------------------
   纯函数切片：不写 localStorage、不改 NpcMemory 内部状态；
   NpcMemory 缺失时进入回退模式，voice 一律按陌生人档位返回
   =========================================================================== */
(function(){
  'use strict';

  function voice(npcId) {
    // 每次调用都现场判断依赖，不在文件加载时缓存 NpcMemory 引用
    if (!window.NpcMemory || typeof window.NpcMemory.mention !== 'function') {
      // 回退模式：拿不到记忆模块，一律按陌生人处理
      return { knowsPlayer: false, level: 'stranger', prefix: '这位朋友，', suffix: '', attitude: 0 };
    }

    var mention;
    try {
      mention = window.NpcMemory.mention(npcId);
    } catch (e) {
      // 回退模式：mention 调用抛异常，一律按陌生人处理
      return { knowsPlayer: false, level: 'stranger', prefix: '这位朋友，', suffix: '', attitude: 0 };
    }

    // 返回值契约校验：非 null 对象、knowsPlayer 为 boolean、
    // attitude 为有限数字、top 为 string 或 null
    if (typeof mention !== 'object' || mention === null ||
        typeof mention.knowsPlayer !== 'boolean' ||
        typeof mention.attitude !== 'number' || !isFinite(mention.attitude) ||
        mention.attitude < 0 || mention.attitude > 16 ||
        (mention.top !== null && typeof mention.top !== 'string')) {
      // 回退模式：mention 返回值契约不满足，一律按陌生人处理
      return { knowsPlayer: false, level: 'stranger', prefix: '这位朋友，', suffix: '', attitude: 0 };
    }

    var knowsPlayer = mention.knowsPlayer;
    var attitude = mention.attitude;
    var top = mention.top;
    var level;
    var prefix;

    // 按好感修正分档：>=12 老友 / >=6 熟络 / >0 认得 / <=0 陌生人
    if (attitude >= 12) {
      level = 'close';
      prefix = '老朋友，';
    } else if (attitude >= 6) {
      level = 'warm';
      prefix = '又见面了，';
    } else if (attitude > 0) {
      level = 'aware';
      prefix = '是你啊。';
    } else {
      level = 'stranger';
      prefix = '这位朋友，';
    }

    // 认得玩家且印象里有明确话题时，句尾补一句“像是想起什么”
    var suffix = '';
    if (knowsPlayer && typeof top === 'string' && top !== '') {
      suffix = '（像是想起什么：' + top + '）';
    }

    return { knowsPlayer: knowsPlayer, level: level, prefix: prefix, suffix: suffix, attitude: attitude };
  }

  function wrap(npcId, baseLine) {
    // baseLine 不是字符串或去掉空格后为空时，原样返回不拼接
    if (typeof baseLine !== 'string' || baseLine.trim() === '') {
      return baseLine;
    }
    var v = voice(npcId);
    return v.prefix + baseLine + v.suffix;
  }

  window.NpcVoice = { voice: voice, wrap: wrap };
})();
