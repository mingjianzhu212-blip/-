/* ============================================================
 * js/npc.js — 沈碑 NPC · 纯逻辑层（第 108 轮 / 沈碑 MVP 第二阶段第一步）
 *
 * 定位：识人 · 守碑老吏「沈碑」。只给信息与情感，零数值产出——
 *       本文件绝不读写 S.stone / S.exp / 战力 / 任何数值公式，也不碰奇遇事件表里
 *       那个同名的 `stele`（无字残碑）对象。
 *
 * 依赖注入（本模块不直接引用 game.js 的任何全局变量）：
 *   · stele = S.npcs.stele 对象（由 UI 层传入）——本模块只写它的冻结字段：
 *             met / rel / stage / heard / choice.* / cur.talk / lastSeen
 *             （cur.lastRank / cur.promptTale / seenGens / nudgeAt 属事件与重逢层，本步不动）
 *   · ctx   = { now, gens }（只读派生输入）：
 *             now  = 当前毫秒时间戳（缺省时回落 Date.now()）
 *             gens = 已转世代数（S.legacy.gens）
 *   这样 UI 层可自由取用，测试层也能注入假时钟；相同 stele+ctx 必然得到相同结果
 *   （选句只用 npcHash 确定性散列，全程不使用 Math.random）。
 *
 * 权威规格：完整报告《九霄问道-完整报告-四轮合一-手机版.html》第五轮终审 r5a–r5g
 *           （rel≥15 解锁⑤ / stage≥2 解锁④ / 重复交谈 +1 / 五个对话选项增量 / stage 0→3）。
 *           台词取自 r4b 冻结脚本；星号标注为「草稿文案」，最终以制作人改字为准。
 *
 * 尚未接线（本步范围外，留给后续 UI / 事件层）：
 *   · index.html 引入本脚本、识人页渲染、人物页第六格入口
 *   · npcTick 主动事件（破境 / 旧事来访 / 久未见面浮片）与 tickLoop 挂接
 *   · 进入交谈即 lastSeen=now 的「到访」动作（npcPick 已在每次结算时刷新 lastSeen）
 *
 * 记忆接入（T-402）：
 *   · 沈碑经 window.NpcMemory（js/npc_memory.js 提供）记住玩家做过的事——
 *     初见与谈过的话题在结算成功时落账（memRecord），重逢对话中提及一件旧事（memOf）。
 *   · 记忆系统缺失或调用异常时一律静默回退，对话表现与原版完全一致。
 * 语气（T-404）：已见过对话经 window.NpcVoice 补称呼前缀；缺失/异常一律静默回退。
 * ============================================================ */
window.Npc = (function(){
  'use strict';

  /* 冻结边界（与第一阶段数据层 load() 白名单钳制一致） */
  var REL_MIN = -100, REL_MAX = 100;
  var STAGE_MAX = 3;
  var HEARD_CAP = 5;   /* 阶段二 N10：实际可听话题 5 条（道别 noHear 不计），与 npcHeardTotal() 分母一致 */
  var TALK_CAP = 9999;
  var IDLE_MS = 72 * 3600 * 1000;   /* 久未见面：72 小时 */

  /* 四条「碑外一线」线索对应的话题（切片 2f）。
     顺序即清单顺序；条件只认 heard —— 见 npcClues 注释。 */
  var CLUE_IDS = ['stele1', 'stele3', 'stele4', 'stele5'];

  /* 记忆系统 id（T-402）：js/npc_memory.js 以该 id 存取沈碑的记忆 */
  var MEM_ID = 'shen_bei';

  /* ----------------------------------------------------------
   * NPC_STELE — 沈碑冻结配置常量（话题 / 选项 / 增量 / 台词）
   *   sign：pos 正向 · neu 中性 · neg 负面 · none 不计关系（道别）
   *         「首次」按 rel 原值结算；「重复」时 pos/neu→+1，neg/none→0（r5a 规则 2）
   *   stageTo：该选项把 stage 推进到的目标（只升不降；P7 起走 NpcRel.setStage 的 max 收敛，
   *            不计入 attitude.open，也不再由闲聊次数推进）
   *   choice：结算时递增的 choice 计数键（listened / showoff / promise）
   *   reply：该选项的回应台词（冻结，r4b）
   *   lockHint：话题③④⑤ 还锁着时给玩家的一句口吻话（W3·S3；只指方向、不写条件）
   *   注：标「*草稿」者为规格未给原文、按沈碑口吻补的短句，待制作人改字。
   * ---------------------------------------------------------- */
  var NPC_STELE = {
    id: 'stele',
    name: '沈碑',
    title: '守碑老吏',

    thresholds: {
      relMax: REL_MAX,
      relMin: REL_MIN,
      topic3Stage: 1,   /* ③ 三千年：stage ≥ 1 */
      topic4Stage: 2,   /* ④ 山外：stage ≥ 2 */
      topic5Rel: 15,    /* ⑤ 他为何守着：rel ≥ 15 */
      maxStage: STAGE_MAX,
      repeatGain: 1     /* 重复交谈：正向 / 中性 +1（陪伴值） */
    },

    /* 初见（met=0，只发生一次） */
    first: {
      lines: [
        '测灵碑照不出你的命数。三千年，碑只黑过两次。你是第二个。',
        '我不该认得你。可我认得这双眼睛。'
      ],
      options: [
        { id: 'ask_who',   label: '你是什么人？',   sign: 'pos', rel:  1, reply: '守碑的。碑在，人在。' },            /* *草稿回应 */
        { id: 'ask_black', label: '碑为什么黑？',   sign: 'pos', rel:  2, reply: '黑不是脏。是有人来过。' },        /* *草稿回应 */
        { id: 'pass_by',   label: '我只是路过。',   sign: 'neg', rel: -1, reply: '（他没拦你，只把扫帚往旁边挪了挪。）' } /* *草稿回应 */
      ]
    },

    /* 六个话题（①②⑥ 常驻；③ stage≥1；④ stage≥2；⑤ rel≥15） */
    topics: [
      { id: 'stele1', name: '碑', unlock: { type: 'always' },
        lore: '没人知道这碑是谁立的。有这座观之前，碑就在了。',
        /* 记忆 NPC 框架第一步（改法四）：重复 / 过期文本（负责人代写，制作人试音放行后落。
           规矩：短句陈述收尾、不用问句、不用感叹号、自称「老朽」；过期条件见开工前置登记表。 */
        repeat: ['碑的事，说过了。老朽不爱翻来覆去。', '看碑就行。字比人稳。',
          '灵田的草熟了不收，炼丹房就空着。等它长的时候，去打坐，别守着。'],
        expired: { text: '碑字磨没了。你不用再听第二遍。', cond: function(st){ return st.stage >= 3; } },
        recall: ['碑还在那儿。字又淡了些。', '你问过这碑的来历。他没再多说。'],   /* *草稿回忆版 */
        options: [
          { id: 'listen',    label: '耐心听', sign: 'pos', rel:  3, stageTo: 1, choice: 'listened',
            reply: '碑面原是有字的。三千年，字一点点磨没了，只剩一道黑。' },
          { id: 'press',     label: '追问',   sign: 'pos', rel:  2, stageTo: 1,
            reply: '黑不是磨掉的。是……刻上去的。' },
          { id: 'interrupt', label: '打断',   sign: 'neg', rel: -2,
            reply: '（他不再说话，只低头扫地上的灰。）' }
        ] },
      { id: 'stele2', name: '我', unlock: { type: 'always' },
        lore: '照不出。所以我不敢给你看剩下的字。',
        repeat: ['你的命数，碑照不出。老朽说过一遍。', '照不出，就是照不出。碑没变，你也没变。'],
        expired: { text: '你的事，碑上没写。写不写，也不由它。', cond: function(st){ return st.stage >= 3; } },
        recall: ['「照不出」的话，他说过两遍。', '他没再提你剩下的字。'],          /* *草稿回忆版 */
        options: [
          { id: 'modest',  label: '自谦',     sign: 'pos', rel:  2,
            reply: '命数是自己的，看不看都一样。' },
          { id: 'showoff', label: '炫耀破境', sign: 'neg', rel: -4, choice: 'showoff',
            reply: '老夫守碑千年，见过的天才，比这碑上的字还多。' },
          { id: 'silent',  label: '沉默',     sign: 'neu', rel:  0,
            reply: '（他陪你站了一会儿。）' }
        ] },
      { id: 'stele3', name: '三千年', unlock: { type: 'stage', min: 1 },
        lockHint: '他还没肯讲这段。再陪他说几次碑的事。',
        lore: '一个和你一样、碑照不出的人。他进了天门，再没出来。',
        repeat: ['三千年的事，讲过。再讲，碑上的字也不会多一道。', '门里锁着什么，老朽说过。碑黑的那一下，就是它。',
          '塔里的骨与羽别扔。器坊缺这个；打不动，先去人物页把法宝穿上。'],
        expired: { text: '塔底你也去过。碑上那道黑，你如今看得懂了。',
                   cond: function(st, ctx){ return st.stage >= 3 && !!ctx && ctx.worldFoot !== ''; } },
        recall: ['那个进了天门的人，他没再往下讲。', '三千年里，碑只黑过两次。他是第一个。'], /* *草稿回忆版 */
        options: [
          { id: 'believe', label: '信',   sign: 'pos', rel: 3, stageTo: 2,
            reply: '门里，锁着什么东西。别急着往上修。' },
          { id: 'doubt',   label: '存疑', sign: 'neu', rel: 0,
            reply: '信不信由你。老夫只是守碑的。' }
        ] },
      { id: 'stele4', name: '山外', unlock: { type: 'stage', min: 2 },
        lockHint: '山外的事他还压着。塔上的事，他还想再看看你能走多远。',
        lore: '塔底有东西。别只想着往上爬。',
        repeat: ['先看脚下。碑座底下的事，老朽说过了。', '山外的事，老朽只看见碑上那一道。剩下的，你自己走。',
          '碑后有条旧路，通上古秘境。秘境里出的料，够你炼一炉丹、打一件器。'],
        expired: { text: '塔底动过了。碑座那块石头，你比老朽清楚。',
                   cond: function(st, ctx){ return !!ctx && ctx.worldFoot !== ''; } },
        recall: ['塔底的事，他提过一次。', '「先看脚下」——他说过。'],            /* *草稿回忆版 */
        options: [
          { id: 'note',  label: '记下', sign: 'pos', rel:  2,
            reply: '回头到塔里，先看脚下。' },
          { id: 'shrug', label: '敷衍', sign: 'neg', rel: -1,
            reply: '（他轻叹，不再言语。）' }
        ] },
      { id: 'stele5', name: '他为何守着', unlock: { type: 'rel', min: 15 },
        lockHint: '他认你还不够深。多来坐坐，把托付办成。',
        lore: '等人。等第二个碑照不出的人走到这扇门前，把门里的东西说清楚。',
        repeat: ['等谁，老朽说过。碑在这儿，他就还得等。', '守，是守给碑上那些字看的。'],
        expired: { text: '等的那个人，你已经知道了。碑上的字，也快认全了。', cond: function(st){ return st.stage >= 3; } },
        recall: ['他要等的人，或许就是你。', '「把门里的东西说清楚」——这句你没忘。'], /* *草稿回忆版 */
        options: [
          { id: 'promise',      label: '承诺替他留意', sign: 'pos', rel: 8, stageTo: 3, choice: 'promise',
            reply: '好。有你这句话，老夫再守三千年也值。' },
          { id: 'noncommittal', label: '不置可否',     sign: 'neu', rel: 0,
            reply: '（他点点头，眼神暗了暗。）' }
        ] },
      { id: 'stele6', name: '道别', unlock: { type: 'always' }, noHear: true,
        lore: '去吧。观前的路，老夫替你扫着。',
        recall: ['观前的路，他一直扫着。'],                                        /* 道别不计 heard，恒显 lore */
        options: [
          { id: 'leave', label: '拱手作别', sign: 'none', rel: 0,
            reply: '（你拱了拱手，转身去了。）' }                                  /* *草稿动作行 */
        ] }
    ],

    /* 开场白分支（确定性；优先级 met=0 → 重逢 → 炫耀 → 常听 → 久未见面 → 默认，r4b） */
    greetings: {
      reunion: [
        '你换了个人。眼睛里的东西，没变。',
        '又换了一副躯壳。可这双眼睛，老夫认得。'
      ],
      /* W4 跨世回指（阶段一预备役）：第二世起、且上一世有记录时优先于通用重逢句。
         只读 legacy.hist[0]，不新增存档字段；缺记录时静默回落到 reunion。 */
      pastLife: '「{rank}」，是你上一世走到的地方。碑上的字磨掉了一道，这一世老夫陪你从头扫起。',
      showoff: '又来炫耀了？坐吧，老夫今日不想听。',
      listened: '来了。老夫这儿还有半截没讲完的。',
      idle: '观前的灰，都积了一层。',
      def: '碑还是老样子。你倒是一天一个样。'
    },

    /* 主动事件文案（冻结，供后续事件层使用；本步不接线） */
    events: {
      breakLine: '你又破了一境。碑面，起了一道极细的纹。',
      evA: '沈碑拄着扫帚立在观前：碑，动了一下。',
      evB: '老夫有桩旧事，想说给你听。',
      evC: '观前的灰都积了一层。'
    },

    /* ===== 记忆 NPC 框架第二步：事件对话（他先说事，玩家回态度） =====
       制作人 2026-11-16 批「结构过稿、文本留后检」。每条一次性（st.events 记 id），
       不可重开；选项只记类别（attitude：open/guarded/rude/cost），不存玩家原文。
       得罪项后果走 NpcRel.reprimand（恶语 −8/冷脸 1 日；出卖 −30/冷脸 3 日/永久关保密）。 */
    events2: {
      ev_brick: {
        line: '碑后第三块砖，松了。',
        options: [
          { id: 'go',   label: '我去看看。',       attitude: 'open',  quest: 'T1',
            reply: '嗯。石头不等人。' },
          { id: 'why',  label: '为什么是第三块。', attitude: 'guarded',
            reply: '（他没答，把扫帚往碑后指了指。）' },
          { id: 'none', label: '这与我何干。',     attitude: 'rude',  betray: false,
            reply: '记下了。' }
        ]
      },
      ev_name: {
        line: '有个名字，老朽搁了三十年。你想听，就记着。',
        options: [
          { id: 'keep', label: '我记着。',           attitude: 'open', quest: 'T2',
            reply: '那你就记着。别说出去。' },
          { id: 'ask',  label: '你不想说，我不问。', attitude: 'guarded',
            reply: '（他点了点头，把话收回去了。）' },
          { id: 'cut',  label: '三十年前的事，与我无关。', attitude: 'rude',
            reply: '记下了。' }
        ]
      },
      ev_deep: {
        line: '碑上的字，磨掉的那一道，是有人自己抹的。',
        options: [
          { id: 'believe', label: '我信。',       attitude: 'open',
            reply: '信就好。往下的事，你慢慢会懂。' },
          { id: 'how',     label: '你怎么知道。', attitude: 'guarded',
            reply: '（他看了你一会儿，没答。）' },
          { id: 'mock',    label: '编得不错。',   attitude: 'rude',
            reply: '记下了。' }
        ]
      },
      ev_fail: {
        line: '〔原话奉还〕——这话，是你说的。',
        options: [
          { id: 'own',    label: '是我没做到。', attitude: 'open',
            reply: '（他不再说了，把碑上的灰又扫了一遍。）' },
          { id: 'silent', label: '（沉默）',      attitude: 'guarded',
            reply: '（他也沉默。风从碑后过去。）' },
          { id: 'deny',   label: '我说过吗。',   attitude: 'rude', betray: true,
            reply: '（他看了你很久，转身进了碑后的屋子。）' }
        ]
      }
    }
  };

  /* ----------------------------------------------------------
   * npcHash — 确定性选句散列（FNV-1a 32 位，非随机）
   *   @param {*} str  任意输入（内部 String() 化，null/undefined 视为 ''）
   *   @return {number} 0 .. 2^32-1 的非负整数
   *   纯函数、无副作用。相同输入永远得到相同输出。
   * ---------------------------------------------------------- */
  function npcHash(str){
    str = String(str == null ? '' : str);
    var h = 0x811c9dc5;
    for(var i = 0; i < str.length; i++){
      h ^= str.charCodeAt(i);
      /* h *= 16777619（用移位规避 32 位溢出精度问题） */
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  /* ---------- 内部工具（不对外） ---------- */
  function clampInt(v, lo, hi, def){
    return (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, Math.floor(v))) : def;
  }
  function clampTime(v){
    return (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
  }
  /* 字符串数组钳制（记忆 NPC 框架第一步 F-1/F-2）：只收 1..16 字字符串、去重、上限 cap。
     读档与写回共用同一口径，避免畸形值进存档。 */
  function strList(v, cap){
    var out = [], seen = {};
    if(!Array.isArray(v)) return out;
    for(var i = 0; i < v.length && out.length < cap; i++){
      var t = v[i];
      if(typeof t !== 'string' || t.length === 0 || t.length > 16 || seen[t]) continue;
      seen[t] = 1; out.push(t);
    }
    return out;
  }
  function nowOf(ctx){
    return (ctx && typeof ctx.now === 'number' && isFinite(ctx.now) && ctx.now > 0) ? Math.floor(ctx.now) : Date.now();
  }
  function gensOf(ctx){
    return (ctx && typeof ctx.gens === 'number' && isFinite(ctx.gens) && ctx.gens >= 0) ? Math.floor(ctx.gens) : 0;
  }
  /* 确定性从数组取一条；空数组给空串 */
  function pickVariant(arr, seed){
    if(!arr || !arr.length) return '';
    return arr[npcHash(seed) % arr.length];
  }
  function findTopic(id){
    for(var i = 0; i < NPC_STELE.topics.length; i++){ if(NPC_STELE.topics[i].id === id) return NPC_STELE.topics[i]; }
    return null;
  }
  function findOpt(list, id){
    if(!list) return null;
    for(var i = 0; i < list.length; i++){ if(list[i].id === id) return list[i]; }
    return null;
  }
  function isUnlocked(u, st){
    if(!u) return false;
    if(u.type === 'always') return true;
    if(u.type === 'stage')  return st.stage >= (u.min | 0);
    if(u.type === 'rel')    return st.rel >= (u.min | 0);
    return false;
  }

  /* ---------- 记忆接入（T-402）— window.NpcMemory 由 js/npc_memory.js 提供 ---------- */
  /* 读记忆：NpcMemory 缺失 / mention 抛错 / 返回值非对象，一律回退 null，绝不冒泡 */
  function memOf(){
    try{
      if(typeof window === 'undefined') return null;
      if(!window.NpcMemory || typeof window.NpcMemory.mention !== 'function') return null;
      var m = window.NpcMemory.mention(MEM_ID);
      return (m && typeof m === 'object') ? m : null;
    }catch(e){
      return null;
    }
  }
  /* 记记忆：仅当 NpcMemory 就绪且 record 可用才调用；任何异常静默忽略、不返回 */
  function memRecord(text){
    try{
      if(typeof window === 'undefined') return null;
      if(!window.NpcMemory || typeof window.NpcMemory.record !== 'function') return null;
      /* 把记录结果回传：persisted === false 表示只进了内存、没落盘（配额满/隐私模式）。
         UI 据此给一句低干扰说明，而不是让玩家以为这段记忆已经永久留下。 */
      return window.NpcMemory.record(MEM_ID, text) || null;
    }catch(e){
      /* 静默忽略：记忆失败绝不影响对话 */
    }
  }
  /* 读语气（T-404）：与 memOf 同款静默回退，语气切片缺失/异常绝不影响对话 */
  function voiceOf(){
    try{
      if(typeof window === 'undefined') return null;
      if(!window.NpcVoice || typeof window.NpcVoice.voice !== 'function') return null;
      var v = window.NpcVoice.voice(MEM_ID);
      return (v && typeof v === 'object') ? v : null;
    }catch(e){
      return null;
    }
  }

  /* 把可能畸形的存档读成安全视图（不改原对象） */
  function readState(stele){
    var s = (stele && typeof stele === 'object') ? stele : {};
    var heard = Array.isArray(s.heard) ? s.heard.filter(function(x){ return typeof x === 'string'; }) : [];
    var choice = (s.choice && typeof s.choice === 'object') ? s.choice : {};
    var cur = (s.cur && typeof s.cur === 'object') ? s.cur : {};
    return {
      met: s.met ? 1 : 0,
      rel: clampInt(s.rel, REL_MIN, REL_MAX, 0),
      stage: clampInt(s.stage, 0, STAGE_MAX, 0),
      seenGens: clampInt(s.seenGens, 0, 1e9, 0),
      lastSeen: clampTime(s.lastSeen),
      nudgeAt: clampTime(s.nudgeAt),
      heard: heard.slice(0, HEARD_CAP),
      /* 记忆 NPC 框架第一步（已批 F-1/F-2）：三态的一次性标记与关键对话位。
         读侧只收 1..16 字字符串、去重、上限 16；写侧在 commit 里同样钳制。 */
      told: strList(s.told, 16),
      keyLogged: strList(s.keyLogged, 16),
      choice: {
        listened: clampInt(choice.listened, 0, 999, 0),
        showoff:  clampInt(choice.showoff,  0, 999, 0),
        promise:  clampInt(choice.promise,  0, 999, 0)
      },
      cur: {
        lastRank:   clampInt(cur.lastRank, 0, 25, 0),
        talk:       clampInt(cur.talk, 0, TALK_CAP, 0),
        promptTale: cur.promptTale ? 1 : 0
      }
    };
  }

  /* 把改动写回真实 stele：只写本层管理的字段，
     保留 cur.lastRank / cur.promptTale 及 seenGens / nudgeAt（属事件与重逢层） */
  function commit(stele, st){
    stele.met   = st.met ? 1 : 0;
    stele.rel   = clampInt(st.rel, REL_MIN, REL_MAX, 0);
    stele.stage = clampInt(st.stage, 0, STAGE_MAX, 0);
    stele.heard = st.heard.slice(0, HEARD_CAP);
    /* 记忆 NPC 框架第一步：told / keyLogged 随结算一起写回（与 heard 同一处出口）。 */
    stele.told = strList(st.told, 16);
    stele.keyLogged = strList(st.keyLogged, 16);
    stele.choice = {
      listened: clampInt(st.choice.listened, 0, 999, 0),
      showoff:  clampInt(st.choice.showoff,  0, 999, 0),
      promise:  clampInt(st.choice.promise,  0, 999, 0)
    };
    if(!stele.cur || typeof stele.cur !== 'object') stele.cur = { lastRank: 0, talk: 0, promptTale: 0 };
    stele.cur.talk = clampInt(st.cur.talk, 0, TALK_CAP, 0);   /* 只动 talk，保留 lastRank / promptTale */
    stele.lastSeen = clampTime(st.lastSeen);
  }

  function greetingOf(st, ctx){
    var gens = gensOf(ctx), now = nowOf(ctx);
    /* 重逢优先：gens > seenGens（进入页应先 npcSay 再 npcMarkReunion 消费掉） */
    if(gens > st.seenGens){
      if(ctx && ctx.pastRankName) return NPC_STELE.greetings.pastLife.replace('{rank}', ctx.pastRankName);
      var g = Math.max(0, Math.min(gens - 1, NPC_STELE.greetings.reunion.length - 1));
      return NPC_STELE.greetings.reunion[g];
    }
    if(st.choice.showoff >= 1) return NPC_STELE.greetings.showoff;
    if(st.choice.listened >= 3) return NPC_STELE.greetings.listened;
    if(st.lastSeen > 0 && (now - st.lastSeen) > IDLE_MS) return NPC_STELE.greetings.idle;
    return NPC_STELE.greetings.def;
  }

  /* ----------------------------------------------------------
   * npcState — 只读：把 stele 归一成安全视图（供 UI 摘要 / 测试）
   *   @param  {object} stele  S.npcs.stele（可缺省/畸形）
   *   @return {object} { met, rel, stage, seenGens, lastSeen, nudgeAt, heard[], choice{}, cur{} }
   *   纯函数、无副作用（不改 stele）。
   * ---------------------------------------------------------- */
  function npcState(stele){ return readState(stele); }

  /* ----------------------------------------------------------
   * npcClues — 「碑外一线」四条线索（切片 2f · 纯派生，只读）
   *   @param  {object} stele  S.npcs.stele 原始状态对象（可缺省 / 畸形）
   *   @return {object[]} 恒定 4 条、顺序固定：[{ id, topicId, name, line, open }]
   *   line 是 NPC_STELE.topics[].lore 的引用——不复制、不改写、不新编台词。
   *   open 只认 heard ∋ 该话题，不能用 stage/rel 代替：stage≥2 只保证点过③
   *   （believe 推到 2），不保证听过④；反之 heard∋stele4 恒蕴含 stage≥2
   *   （④要 stage≥2 才解锁，而 stage 只升不降），所以线索一旦点亮不会回锁。
   *   纯函数：经 readState 规范化，不调 commit()、不改 stele、不读时间、不碰存档。
   * ---------------------------------------------------------- */
  function npcClues(stele){
    var st = readState(stele);
    return NPC_STELE.topics.filter(function(t){
      return CLUE_IDS.indexOf(t.id) >= 0;
    }).map(function(t, i){
      return {
        id: 'clue' + (i + 1),
        topicId: t.id,
        name: t.name,
        line: t.lore,
        open: st.heard.indexOf(t.id) >= 0
      };
    });
  }

  /* ----------------------------------------------------------
   * npcSay — 只读：当前「沈碑会说什么 / 有哪些话题可谈」
   *   @param  {object} stele  S.npcs.stele
   *   @param  {object} ctx    { now?, gens? }
   *   @return {object}
   *     未见过(met=0)：{ speaker, first:true, lines:[初见两句], options:[{id,label}×3], topics:[] }
   *     已见过(met=1)：{ speaker, first:false, lines:[开场白一句], options:[], topics:[...] }
   *       topics[i] = { id, name, unlocked, heard, lines:[lore 或 回忆版], options:[{id,label}]（未解锁为[]）,
   *                     lockHint }   —— lockHint：未解锁时给一句「怎么让他肯讲」的口吻话（W3·S3），
   *                                   已解锁恒为空串；只带配置里的原文，不含 stage/rel 与任何数字。
   *   纯函数、无副作用（不改 stele，不写存档）。确定性：同 stele+ctx 结果恒定。
   * ---------------------------------------------------------- */
  function npcSay(stele, ctx){
    var st = readState(stele);
    if(!st.met){
      return {
        speaker: NPC_STELE.name,
        first: true,
        lines: NPC_STELE.first.lines.slice(),
        options: NPC_STELE.first.options.map(function(o){ return { id: o.id, label: o.label }; }),
        topics: []
      };
    }
    var topics = NPC_STELE.topics.map(function(t){
      var unlocked = isUnlocked(t.unlock, st);
      var heard = st.heard.indexOf(t.id) >= 0;
      var text = heard ? pickVariant(t.recall, t.id + ':' + st.stage) : t.lore;
      var opts = unlocked ? t.options.map(function(o){ return { id: o.id, label: o.label }; }) : [];
      /* W3·S3：锁着的那一行给一句口吻话，让玩家知道「下一步该往哪儿让他肯讲」。
         只从不带数字的 lockHint 取，解锁判定（isUnlocked）一字未动。 */
      return { id: t.id, name: t.name, unlocked: unlocked, heard: heard, lines: [text], options: opts,
        lockHint: unlocked ? '' : String(t.lockHint || '') };
    });
    /* T-404：已见过时若 NpcVoice 给出称呼前缀（prefix），就加在开场白前；
       level/attitude/suffix 一律不使用——态度与旧事由 greeting 分支与旧事行承担；
       NpcVoice 缺失/异常时对话与原版完全一致。 */
    var greeting = greetingOf(st, ctx);
    var voice = voiceOf();
    var openLine = (voice && typeof voice.prefix === 'string' && voice.prefix) ? (voice.prefix + greeting) : greeting;
    var lines = [ openLine ];
    /* T-402：已见过时若沈碑记得玩家，就在开场白后补一句旧事；
       记忆缺失 / 异常 / 没认出玩家时，lines 保持原版单句开场白。 */
    var mem = memOf();
    if(mem && mem.knowsPlayer && typeof mem.top === 'string' && mem.top){
      /* 记忆文本按「可嵌进句子」的事件短语存（初见你那日 / 你问过他「碑」），
         这里只补前后缀，拼出来是一句通顺的话，不是「想起什么：初见沈碑」这种断句。 */
      lines.push('（他顿了顿，像是想起了' + mem.top + '。）');
    }
    return {
      speaker: NPC_STELE.name,
      first: false,
      lines: lines,
      options: [],
      topics: topics
    };
  }

  /* ----------------------------------------------------------
   * npcPick — 结算一个选择（会写 stele）
   *   @param  {object} stele     S.npcs.stele（必须为对象，本函数就地写它）
   *   @param  {object} ctx       { now?, gens? }
   *   @param  {string} topicId   'first' | 'stele1'..'stele6'
   *   @param  {string} optionId  该话题下的选项 id
   *   @return {object}
   *     成功：{ ok:true, speaker, first?, reply, relDelta, rel, stage, firstTime, heard[] }
   *     失败：{ ok:false, error:'no_state'|'already_met'|'bad_topic'|'locked'|'bad_option', ... }
   *   副作用（仅冻结 NPC 字段）：met / rel / stage / heard / choice.* / cur.talk / lastSeen。
   *   绝不触碰 S.stone/S.exp/战力 等数值；不写 cur.lastRank/cur.promptTale/seenGens/nudgeAt。
   *   规则：
   *     · 初见只触发一次（met 0→1）；
   *     · 首次 = 用选项 rel 原值结算、推 heard；重复 = pos/neu→+1、neg/none→0（不重复大额 delta）；
   *     · stage 只升不降，重复选择也推进（r5a 规则 4）；
   *     · 每次结算刷新 lastSeen=now，并 cur.talk+1（本世对话次数）。
   * ---------------------------------------------------------- */
  function npcPick(stele, ctx, topicId, optionId){
    if(!stele || typeof stele !== 'object') return { ok: false, error: 'no_state', topicId: topicId, optionId: optionId };
    var st = readState(stele);
    var now = nowOf(ctx);

    /* —— 初见 —— */
    if(topicId === 'first'){
      if(st.met) return { ok: false, error: 'already_met', topicId: topicId, optionId: optionId };
      var fo = findOpt(NPC_STELE.first.options, optionId);
      if(!fo) return { ok: false, error: 'bad_option', topicId: topicId, optionId: optionId };
      st.met = 1;
      st.rel = clampInt(st.rel + fo.rel, REL_MIN, REL_MAX, 0);
      st.cur.talk = clampInt(st.cur.talk + 1, 0, TALK_CAP, 0);
      st.lastSeen = now;
      commit(stele, st);
      memRecord('初见你那日');   /* T-402：结算成功才落账，一切失败路径绝不调用 */
      return {
        ok: true, speaker: NPC_STELE.name, first: true, topicId: 'first', optionId: fo.id,
        reply: fo.reply, relDelta: fo.rel, rel: st.rel, stage: st.stage, firstTime: true, heard: st.heard.slice()
      };
    }

    /* —— 话题 —— */
    var topic = findTopic(topicId);
    if(!topic) return { ok: false, error: 'bad_topic', topicId: topicId, optionId: optionId };
    if(!isUnlocked(topic.unlock, st)) return { ok: false, error: 'locked', topicId: topicId, optionId: optionId };
    var opt = findOpt(topic.options, optionId);
    if(!opt) return { ok: false, error: 'bad_option', topicId: topicId, optionId: optionId };

    var firstTime = st.heard.indexOf(topic.id) < 0 && !topic.noHear;
    /* 首次用原值；重复时 pos/neu→+1，neg/none→0 */
    var delta = firstTime ? opt.rel : ((opt.sign === 'pos' || opt.sign === 'neu') ? NPC_STELE.thresholds.repeatGain : 0);
    st.rel = clampInt(st.rel + delta, REL_MIN, REL_MAX, 0);

    /* P7（2026-11-16 批复）：stageTo 统一走 NpcRel.setStage 的 max 收敛；
       不计入 attitude.open、不套用 open 的「每 2 次 +1」。
       NpcRel 缺失/异常时回落旧写法，行为与旧版逐字一致，不留死路。 */
    if(opt.stageTo){
      try{
        if(window.NpcRel && typeof window.NpcRel.setStage === 'function') window.NpcRel.setStage(st, opt.stageTo);
        else if(st.stage < opt.stageTo) st.stage = Math.min(STAGE_MAX, opt.stageTo);
      }catch(e){
        if(st.stage < opt.stageTo) st.stage = Math.min(STAGE_MAX, opt.stageTo);
      }
    }

    if(opt.choice === 'listened' || opt.choice === 'showoff' || opt.choice === 'promise'){
      st.choice[opt.choice] = clampInt(st.choice[opt.choice] + 1, 0, 999, 0);
    }

    /* 记忆 NPC 框架第一步（改法四）：重复/过期文本走 NpcTri（纯逻辑，js/npc_tri.js）。
       首次仍用选项原文；重复用话题的 repeat[] 轮换（cur.talk + topicId 散列）；
       过期只提一次（命中且 told 未记 → 用 expired.text，并在 commit 前写 told）。
       ★ 必须在「把本话题写进 heard」之前判定：否则首次也会被看成已聊。
       NpcTri 缺失时静默回落 opt.reply —— 与旧行为逐字一致，不留死路。 */
    var tri = null, replyText = opt.reply;
    try{
      if(window.NpcTri && typeof window.NpcTri.pick === 'function'){
        tri = window.NpcTri.pick(topic, st, ctx, firstTime ? opt.reply : null);
        if(tri && typeof tri.text === 'string' && tri.text) replyText = tri.text;
        if(tri && tri.mark && !firstTime) window.NpcTri.markTold(st, topic.id);
      }
    }catch(e){ tri = null; replyText = opt.reply; }

    if(firstTime && st.heard.length < HEARD_CAP && st.heard.indexOf(topic.id) < 0){ st.heard.push(topic.id); }

    st.cur.talk = clampInt(st.cur.talk + 1, 0, TALK_CAP, 0);
    st.lastSeen = now;
    commit(stele, st);

    /* T-402：结算成功才落一笔记忆；文案按话题名取，不改任何结算结果 */
    var memText = topic ? ('你问过他「' + topic.name + '」') : '你同他讲过几句话';
    var memRes = memRecord(memText);

    return {
      ok: true, speaker: NPC_STELE.name, first: false, topicId: topic.id, optionId: opt.id,
      reply: replyText, relDelta: delta, rel: st.rel, stage: st.stage, firstTime: firstTime, heard: st.heard.slice(),
      tri: (tri && tri.kind) ? tri.kind : 'new',
      /* 只有明确 false 才算"写盘失败"；null/undefined 表示没接这条线，按成功处理，避免误报 */
      memPersisted: (memRes && memRes.persisted === false) ? false : true
    };
  }

  /* ----------------------------------------------------------
   * npcMarkReunion — 重逢同步（会写 stele.seenGens；UI 层进入识人页调用一次）
   *   @param  {object} stele  S.npcs.stele
   *   @param  {object} ctx    { gens? }
   *   @return {boolean} 是否真的发生了重逢同步（gens > seenGens 时为 true）
   *   副作用：把 seenGens 抬到 gens（仅此一字段）。cur 由转世时 resetForNewLife 清零，此处不动。
   *   调用时序：先 npcSay（读重逢开场白）→ 再本函数（消费掉，避免下次重复播）。
   * ---------------------------------------------------------- */
  function npcMarkReunion(stele, ctx){
    if(!stele || typeof stele !== 'object') return false;
    var gens = gensOf(ctx);
    var seen = clampInt(stele.seenGens, 0, 1e9, 0);
    if(gens > seen){ stele.seenGens = gens; return true; }
    return false;
  }

  /* ==========================================================
   * 事件层（主动来访）— 纯逻辑判定，不碰 DOM / 定时器 / 游戏全局
   * 三类事件各自独立门控；一次调用只「消费」一个（写它的完成标记），
   * 其余当前也满足者放入 pending（不写标记），留待后续 tick 依次消费——
   * 因此同时满足也绝不丢失任何事件条件。
   * 稳定优先级 break(破境) > tale(旧事) > idle(久别)：冻结规格未规定三者先后
   * （仅规定「重逢开场白优先于久别」由 npcSay/greetingOf 负责，与本层无关）；
   * 本顺序只决定「同时满足时谁先浮」，不改任何数值与玩法。如需调整改 EVENT_ORDER。
   * ========================================================== */
  var EVENT_ORDER = ['break', 'tale', 'idle'];
  var TALE_ID = 'stele3';   /* 旧事终点话题：已听话题③即不再提示 */

  function rankOf(ctx){
    return (ctx && typeof ctx.rank === 'number' && isFinite(ctx.rank) && ctx.rank >= 0) ? Math.floor(ctx.rank) : 0;
  }
  function ensureCur(stele){
    if(!stele.cur || typeof stele.cur !== 'object') stele.cur = { lastRank: 0, talk: 0, promptTale: 0 };
    return stele.cur;
  }
  /* 事件A 条件：本世 rank 跨大境界段（2026-11-19 制作人批：小境界不再惊动；
     现状口径与 NpcAct 的 BIG 段表一致：0/9/12/15/18/21/22/23/24/25）。 */
  var MAJOR = [0, 9, 12, 15, 18, 21, 22, 23, 24, 25];
  function majorOf(r){
    var t = 0, v = (typeof r === 'number' && isFinite(r)) ? Math.floor(r) : 0;
    for(var i = 0; i < MAJOR.length; i++){ if(v >= MAJOR[i]) t = i; }
    return t;
  }
  function evBreakReady(st, ctx){
    var last = clampInt(st.cur.lastRank, 0, 25, 0);
    var rank = rankOf(ctx);
    return (rank > last && majorOf(rank) > majorOf(last)) ? { rank: rank, prevRank: last } : null;
  }
  /* 事件B 条件：cur.promptTale==0 && stage>=1 && !heard.includes('stele3')（冻结口径，无 talk 条件） */
  function evTaleReady(st){
    if(st.cur.promptTale !== 0) return null;
    if(st.stage < 1) return null;
    if(st.heard.indexOf(TALE_ID) >= 0) return null;
    return { stage: st.stage };
  }
  /* 事件C 条件：lastSeen>0 && now-lastSeen>72h && now-nudgeAt>72h */
  function evIdleReady(st, ctx){
    var now = nowOf(ctx);
    if(st.lastSeen <= 0) return null;
    if((now - st.lastSeen) <= IDLE_MS) return null;
    if((now - st.nudgeAt) <= IDLE_MS) return null;
    return { lastSeen: st.lastSeen, nudgeAt: st.nudgeAt, gapMs: now - st.lastSeen };
  }

  /* ----------------------------------------------------------
   * npcTick — 主动来访事件判定（纯逻辑，不碰 DOM）
   *   @param  {object} stele  S.npcs.stele（必须为对象；本函数会写完成标记）
   *   @param  {object} ctx    { now, gens, rank }
   *   @return {object} { fired: descriptor|null, pending: descriptor[] }
   *     descriptor = { type:'break'|'tale'|'idle', text, consumed:bool, data:{...} }
   *   规则：
   *     · 一次最多消费一个事件（fired.consumed=true）并写对应标记：
   *         break → cur.lastRank=rank ；tale → cur.promptTale=1 ；idle → nudgeAt=now
   *     · 其余同时满足者进 pending（consumed=false，不写标记，后续 tick 依次消费，不丢失）
   *     · 稳定优先级 break > tale > idle（EVENT_ORDER），不改任何数值/玩法
   *     · 不读 S、不写 S.rank；不改 npcSay/npcPick 行为；畸形输入返回空结果。
   * ---------------------------------------------------------- */
  function npcTick(stele, ctx){
    if(!stele || typeof stele !== 'object') return { fired: null, pending: [] };
    var st = readState(stele);
    /* 三个条件互不依赖彼此的写回，先全求值 */
    var hits = { break: evBreakReady(st, ctx), tale: evTaleReady(st), idle: evIdleReady(st, ctx) };
    var list = [];
    for(var i = 0; i < EVENT_ORDER.length; i++){
      var t = EVENT_ORDER[i];
      if(!hits[t]) continue;
      var d;
      if(t === 'break')      d = { type: 'break', text: NPC_STELE.events.evA, data: hits.break };
      else if(t === 'tale')  d = { type: 'tale',  text: NPC_STELE.events.evB, data: hits.tale };
      else                   d = { type: 'idle',  text: NPC_STELE.events.evC, data: hits.idle };
      d.consumed = false;
      list.push(d);
    }
    if(!list.length) return { fired: null, pending: [] };

    /* 只消费最高优先级那一个：写它的完成标记 */
    var first = list[0];
    if(first.type === 'break'){
      ensureCur(stele).lastRank = clampInt(first.data.rank, 0, 25, 0);
    } else if(first.type === 'tale'){
      ensureCur(stele).promptTale = 1;
    } else {
      stele.nudgeAt = nowOf(ctx);
    }
    first.consumed = true;
    return { fired: first, pending: list.slice(1) };
  }

  /* ----------------------------------------------------------
   * npcArrive — 到访标记（玩家实际进入对话页时调用一次）
   *   @param  {object} stele  S.npcs.stele
   *   @param  {object} ctx    { now }
   *   @return {boolean} 是否成功写入 lastSeen
   *   副作用：仅 lastSeen = ctx.now（缺省回落 Date.now()）。
   *   不动 rel/stage/heard/choice/cur 内各字段/nudgeAt/seenGens；不新增字段；畸形输入返回 false。
   * ---------------------------------------------------------- */
  function npcArrive(stele, ctx){
    if(!stele || typeof stele !== 'object') return false;
    var now = nowOf(ctx);
    if(!(now > 0)) return false;
    stele.lastSeen = now;
    return true;
  }

  return {
    NPC_STELE: NPC_STELE,
    HEARD_CAP: HEARD_CAP,
    npcHash: npcHash,
    npcState: npcState,
    npcClues: npcClues,
    npcSay: npcSay,
    npcPick: npcPick,
    npcMarkReunion: npcMarkReunion,
    npcTick: npcTick,
    npcArrive: npcArrive
  };
})();
