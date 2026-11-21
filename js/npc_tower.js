/* ============================================================
 * js/npc_tower.js — 崔九 NPC · 纯逻辑层
 * 定位：守塔老卒「崔九」，与 js/npc.js（沈碑）完全并列、互不引用；
 *       无 require/import/document、无 Math.random，不读写数值产出。
 * 状态字段白名单：met / rel(-100..100) / stage / heard(短字符串数组，去重，≤6 封顶)
 *       / choice{climb,chat,listen} / cur.talk / lastSeen。
 * ============================================================ */
(function(){
  'use strict';

  var NPC_CUIJIU = { id: 'cuijiu', name: '崔九', title: '守塔老卒' };

  /* 阶段四 C2-2（D9 批甲）：话题 3 条 → 6 条，解锁结构照 C1（js/npc.js）同口径。
     崔九存档没有 stage 字段，故只用两种可直读量纲：分（rel）与已听条数（heard 计数）。
     判定优先级 always → heard → rel，一条话题只挂一种主条件（见 isUnlocked）。
     ct4 rel≥8 / ct5 heard≥3 / ct6 rel≥20 三个门槛数字由制作人 D9 批准，
     口径认定为「内容口径」而非冻结数值（stele5 rel≥15 同例在先，js/npc.js:70）。
     lockHint 是未达成时的差额文案，逐字取自内容总表 §C2-2，落按钮后缀位；
     {d}=还差多少、{n}=现已听条数、{min}=门槛，由 lockHintOf 代入，不另立数字。
     6 条可听 ⇒ heard 最长 6，正好等于既有上限，npcPick 的 shift() 挤出不会触发。 */
  var TOPICS = [
    { id: 'ct1', text: '守塔与妖兽', key: 'climb', memKind: 'combat', unlock: { type: 'always' }, lines: [
      '塔里的妖兽，老朽守了几十年。白日无妨，夜里莫要轻近。',
      '妖兽喜阴，塔中寒气最盛。你若要上去，火把万不可灭。',
      '守塔第一桩：莫回头。妖兽专挑人回头时扑来。'
    ] },
    { id: 'ct2', text: '山下传闻', key: 'chat', memKind: 'life', unlock: { type: 'always' }, lines: [
      '山下的事，老朽听得不多。只知镇上换了新米铺，价钱公道。',
      '传闻么？塔外风大，什么话都吹得进来，也吹得出去。',
      '听人说近日有庙会。真不真，得下山亲眼看。'
    ] },
    { id: 'ct3', text: '旧年往事', key: 'listen', memKind: 'story', unlock: { type: 'always' }, lines: [
      '当年随师父上山，也是这般年纪。一晃，胡子都白了。',
      '旧事如塔影，日头一斜就拉得老长。不提也罢。',
      '同袍折在塔里的，老朽每年清明都给他们洒一碗酒。'
    ] },
    { id: 'ct4', text: '塔为什么是钉', key: 'listen', memKind: 'story', unlock: { type: 'rel', min: 8 },
      lockHint: '（这话得等再熟些。先陪老朽说会儿塔上的事。）', lines: [
      /* K2 订正（制作人 2026-11-16 批）：扫帚系沈碑竹帚串台，崔九本命道具是长枪。 */
      '「钉。」老朽把长枪立起来，「塔不是镇妖的，是钉底下那影子的。你每上一层，钉子就松一分。」',
      '「观前那位说得对：别只想着往上爬。」老朽手掌按在塔门底下一块石上，「脚下这块，比他说的还实。」',
      '「你动过它？」他抬眼看了一下，又摇头，「我没问。你也别答。塔里的事，塔知道就够了。」'
    ] },
    { id: 'ct5', text: '灯下那个人', key: 'chat', memKind: 'life', unlock: { type: 'heard', min: 3 },
      lockHint: '（他还没把你认全。多来几趟，把塔上的事听全了再说。）', lines: [
      '「榜九那盏灯？」老朽笑了一下，「灯芯换过三回，都是他自己来换的。他人都没了三百年，灯没断过。」',
      '「他不是死在塔里，是往上走，没回来。这种人老朽记着十一个，灯只亮着一盏。」',
      '「你要是真碰见他，替老朽行个礼。」他把长枪收了收，「老朽守塔那年，是他把我换上来的。」'
    ] },
    { id: 'ct6', text: '断剑与最后一里', key: 'climb', memKind: 'combat', unlock: { type: 'rel', min: 20 },
      lockHint: '（塔顶那句话，他等的人不多。你得让他信你，才听得到。）', lines: [
      '「塔顶那把剑不是打输的人留下的。」老朽往上看，「打输的，剑还在手里。它是走完的人插下去的。」',
      '「他说最后一里替他走完了。」老朽点头，「老朽替他数着——从那年起，这塔上再没下来过人。」',
      '「到了那一层，就把剑拔下来。」他说，「插在石里的是碑，握在手里才是路。」'
    ] }
  ];

  /* 阶段四 C2-1（D3 批甲）：一场可达成的初见。结构照沈碑 first（js/npc.js:76-86），
     但结算不做选项差异——D3 明确「初见 rel +2（沿用现值）」，即下面 npcPick 里
     isNew 分支的那个 2，三个选项一律同值，不引入「选错就扣分」的惩罚感。
     sign 只作记录（照既有 pos／pos／neg 三分法），不参与结算。
     触发条件（met=0 且主线 1-4 已记）由 UI 层判，因为 S.story 只在 UI 层可见；
     本层只持有配置与结算，不读 S、不读 document，纯逻辑层纪律不变。 */
  var FIRST_REL_GAIN = 2;
  var FIRST = {
    lines: [
      '守塔的老卒把长枪靠上墙，没拦你：「往上的人我记着，退下来的人我也记着。你最奇怪——两头我都记不着。」',
      '「身上这股碑灰味。」他朝观前抬了抬下巴，「观口那位也这样看过你。」'
    ],
    options: [
      { id: 'ask_why', label: '他记这些做什么？', sign: 'pos',
        reply: '「总得有人记。」他摸出一小截炭，在塔门框上划了一道，「这是我守的第四十年。」' },
      { id: 'ask_friend', label: '观前那位是我朋友。', sign: 'pos',
        reply: '「不是朋友。」他把炭收回怀里，「他守碑，我守塔。我们这种人不当朋友，只当同一桩差事的两半。」' },
      { id: 'go_up', label: '我要上塔。', sign: 'neg',
        reply: '（他没拦，只把门口的灯往亮处挪了挪。）「火把别灭。莫回头。这三十年我就学会这一句。」' }
    ]
  };

  /* 崔九关系事件（记忆 NPC 框架第二样本）：挂主线《断天门》已有节点，不新增进度字段。
     when 只读 ctx.storyClaimed 与 st.events；一次性由 NpcRel.nextEvent/applyEvent 统一守。
     stageTo 只升不降；rude 选项不给 stageTo（恶语＝他不再往下说，真实且不可追回）。
     E3 open 另带 secludeDays:2（他把枪立在门边、进塔两天）。 */
  function claimed(ctx, id){
    return !!(ctx && ctx.storyClaimed && ctx.storyClaimed[id]);
  }
  var EVENTS3 = {
    order: ['cq_e1', 'cq_e2', 'cq_e3'],
    /* 本 NPC 认的托付 id（applyEvent 的 opt.quest 白名单；沈碑走自己的 QUEST 表） */
    quests: ['CQ_T1'],
    cq_e1: {
      line: '他把册子摊在门槛上。「上去没下来的，都在这上头。老朽每日划一道。」',
      when: function(st, ctx){ return claimed(ctx, '3-2'); },
      options: [
        { id: 'cq_e1_o1', label: '第十一个是谁？', attitude: 'open', stageTo: 1,
          reply: '「册子上有名字。你要看，就自己翻。」他把册子往你那边推了推。' },
        { id: 'cq_e1_o2', label: '那盏灯，是给谁的？', attitude: 'guarded', stageTo: 1,
          reply: '「榜九的。人都没了三百年，灯没断过。」他朝塔外看了一眼，没再说。' },
        { id: 'cq_e1_o3', label: '记这些，有什么用？', attitude: 'rude',
          reply: '他把册子合上，炭收回怀里。「……客自便。」他低头去理火把，不再看你。' }
      ]
    },
    cq_e2: {
      line: '「你去过他旧洞府了？」老卒没抬头，「门前那盏灯，还亮着吧。」',
      when: function(st, ctx){ return claimed(ctx, '4-2'); },
      options: [
        { id: 'cq_e2_o1', label: '我路过时替你看了。以后也替你看。', attitude: 'open', stageTo: 2,
          quest: 'CQ_T1',
          reply: '「不用你添油。」他这才抬头，「路过，看一眼就行。」' },
        { id: 'cq_e2_o2', label: '他人都没了，你为什么还守着他的灯？', attitude: 'guarded', stageTo: 2,
          reply: '「老朽守塔那年，是他把我换上来的。」他把长枪往墙边靠了靠，「换上来的是我，上去的是他。」' },
        { id: 'cq_e2_o3', label: '守着一盏死人的灯，图什么？', attitude: 'rude',
          reply: '他停下手里的活，朝塔外看了半晌。「灯的事，不劳你操心。」再开口，只问你要不要拿火把。' }
      ]
    },
    cq_e3: {
      line: '老卒的手搭在枪杆上。「塔顶那把剑，你看见了。」',
      when: function(st, ctx){ return claimed(ctx, '5-2'); },
      options: [
        { id: 'cq_e3_o1', label: '塔门交给你。我上去。', attitude: 'open', stageTo: 3, secludeDays: 2,
          reply: '「门我守着。」他把枪往门边一立，又朝塔里看了一眼，「你上去吧。」' },
        { id: 'cq_e3_o2', label: '一起上去看看？', attitude: 'guarded', stageTo: 3,
          reply: '「这枪是给守门人用的。」他的手没离开枪杆，「你先上去。老朽在这儿。」' },
        { id: 'cq_e3_o3', label: '这塔早该塌了，守它做什么。', attitude: 'rude',
          reply: '他没接话，把枪从墙上取下，横在门边，背过身去。门框上那道，他没再划。' }
      ]
    }
  };
  /* 状态/应声/翻旧账文案（人设卡批准版；不含数字、阶段名、关系分）。 */
  var TEXT = {
    AWAY: '今日巡塔。火把在门后，自己拿。',
    BAD: '火把在门后。别的，改日再说。',
    SECLUSION: '（塔门虚掩。灯还亮着，枪立在门边。）',
    REBORN: '又走了一遭？塔还在这儿。',
    ECHO_RUDE: '炭我收起来了。什么时候再拿出来，看人。',
    ECHO_OPEN: '门框上，也给你留一道。',
    /* 托付线（2026-11-16 制作人批；done 按「另起一页」定稿） */
    QUEST_OPEN: '明天这个时候，再上塔一趟。老朽有事托你。',
    QUEST_DONE: '册子后头，另起一页。往后这盏灯，你也替我看着。',
    QUEST_ADDR: '守夜人来了。塔还亮着。',
    QUEST_FAIL: '灯，老朽自己看过了。'
  };

  var DAY = 86400000;
  /* 托付线（崔九专属）：E2 open 开出 CQ_T1；次日起完成，超 3 天失约。
     纯逻辑：不碰 DOM、不读 S；只改传入 st.quest.state。
     呆呆钉死边界：第 3 天进页＝done、第 4 天进页＝failed；
     必须先判 age>3 再判 age>=1，否则 age>3 永远进不到 failed。 */
  function questTick(st, ctx){
    if(!st || !st.quest || st.quest.id !== 'CQ_T1' || st.quest.state !== 'open') return null;
    var at = (typeof st.quest.at === 'number' && isFinite(st.quest.at)) ? st.quest.at : 0;
    if(!(at > 0)) return null;                         /* 畸形 at 不判失败，留在 open */
    var now = (ctx && typeof ctx.now === 'number' && isFinite(ctx.now)) ? ctx.now : Date.now();
    var age = (now - at) / DAY;
    if(age > 3){ st.quest.state = 'failed'; return { failed: true }; }
    if(age >= 1){ st.quest.state = 'done'; return { done: true }; }
    return { open: true };
  }

  var BASE_GREETING = '老朽崔九，守着这塔。客从何来？';

  function clampRel(v){
    if (typeof v !== 'number' || !isFinite(v)) return 0;
    if (v < -100) return -100;
    if (v > 100) return 100;
    return v;
  }

  function hashPick(lines, seed){
    if (!Array.isArray(lines) || lines.length === 0) return '';
    var s = String(seed == null ? '' : seed);
    var acc = 0;
    for (var i = 0; i < s.length; i++){ acc = (acc + s.charCodeAt(i)) >>> 0; }
    return lines[acc % lines.length];
  }

  /* 已听条数：只数非空字符串，与读档白名单（js/game.js 的 heard 钳制）同口径。
     不额外去重——heard 由 npcPick 维护，本身已去重。 */
  function heardCount(st){
    var h = (st && Array.isArray(st.heard)) ? st.heard : [];
    var n = 0;
    for (var i = 0; i < h.length; i++){ if (typeof h[i] === 'string' && h[i]) n++; }
    return n;
  }

  /* 解锁判定（C2-2 逻辑新增，零新存档字段）：优先级 always → heard → rel。
     未知类型 fail-closed（返 false），与沈碑 isUnlocked 只认已知类型同一纪律。 */
  function isUnlocked(u, st){
    if (!u || u.type === 'always') return true;
    if (u.type === 'heard') return heardCount(st) >= (u.min | 0);
    if (u.type === 'rel') return clampRel(st && st.rel) >= (u.min | 0);
    return false;
  }

  /* 未达成时的差额文案：模板逐字来自配置表，这里只代入真实差值。
     差值口径 max(0, min - 现值)，已解锁或 always 一律返空串。 */
  function lockHintOf(t, st){
    var u = t && t.unlock;
    if (!u || u.type === 'always') return '';
    if (isUnlocked(u, st)) return '';
    var tpl = String(t.lockHint || '');
    if (!tpl) return '';
    var cur = (u.type === 'rel') ? clampRel(st && st.rel) : heardCount(st);
    var d = Math.max(0, (u.min | 0) - cur);
    return tpl.replace(/\{d\}/g, String(d))
              .replace(/\{n\}/g, String(heardCount(st)))
              .replace(/\{min\}/g, String(u.min | 0));
  }

  function memOf(){
    try {
      if (typeof window === 'undefined' || !window.NpcMemory) return null;
      if (typeof window.NpcMemory.mention !== 'function') return null;
      var r = window.NpcMemory.mention('cuijiu');
      return (r && typeof r === 'object') ? r : null;
    } catch (e){
      return null;
    }
  }

  function voiceOf(){
    try {
      if (typeof window === 'undefined' || !window.NpcVoice) return null;
      if (typeof window.NpcVoice.voice !== 'function') return null;
      var v = window.NpcVoice.voice('cuijiu');
      return (v && typeof v === 'object') ? v : null;
    } catch (e){
      return null;
    }
  }

  function memRecord(text, kind){
    try {
      if (typeof window === 'undefined' || !window.NpcMemory) return null;
      if (typeof window.NpcMemory.record !== 'function') return null;
      /* 回传记录结果：persisted === false 表示只进了内存、没落盘，UI 需要一句话说明 */
      return window.NpcMemory.record('cuijiu', text, kind) || null;
    } catch (e){ return null; }
  }

  function npcSay(state, ctx){
    var safe = (state && typeof state === 'object') ? state : {};
    var voice = voiceOf();
    var mem = memOf();
    /* 呈现口径与沈碑（js/npc.js）一致：[语气前缀] + 底句 + [旧事行后缀]；
       旧事行条件与沈碑同款（mem.knowsPlayer 且 top 为非空字符串）。 */
    /* 托付 done 后称呼变体：用「守夜人来了。塔还亮着。」替代底句，且不再挂「这位朋友」前缀。 */
    var doneQuest = !!(safe.quest && safe.quest.id === 'CQ_T1' && safe.quest.state === 'done');
    var baseGreeting = doneQuest ? TEXT.QUEST_ADDR : BASE_GREETING;
    var greeting = (!doneQuest && voice && typeof voice.prefix === 'string' && voice.prefix)
      ? (voice.prefix + baseGreeting) : baseGreeting;
    if (mem && mem.knowsPlayer && typeof mem.top === 'string' && mem.top){
      /* 与沈碑（js/npc.js）同一句式：叙述在后、记忆短语在前。
         原先是 '（他顿了顿，像是想起什么：' + mem.top + '）'，而 mem.top 本身长这样：
         「你听崔九讲过「守塔与妖兽」：塔里的妖兽，老朽守了几十年…」
         → 拼出来双冒号套叠，且把"你听崔九讲过"这种第二人称转述塞进了崔九自己的叙述里。
         A5（2026-11-20）：塔层类旧事不再引用记忆快照（通关 16 层还提 13 层），
         改成读 ctx.towerMax 的当前权威值；其余旧事照旧引用。 */
      var top = mem.top;
      var isTower = /登塔|镇妖塔|第\s*\d+\s*层/.test(top);
      if (top && !isTower){
        greeting = greeting + '（他顿了顿，像是又想起了' + top + '。）';
      }
      if (ctx && typeof ctx.towerMax === 'number' && ctx.towerMax > 0){
        greeting = greeting + '（他看了看塔：你已经登到第 ' + ctx.towerMax + ' 层了。）';
      }
    }
    var topics = [];
    var heard0 = Array.isArray(safe.heard) ? safe.heard : [];
    for (var i = 0; i < TOPICS.length; i++){
      /* C2-2：话题项带上解锁态与差额文案（形状照沈碑 npcSay 的 topics 项）。
         与沈碑的一处口径差异须记明：沈碑 lockHint 是「不含数字的口吻话」（js/npc.js:363），
         崔九 lockHint 按内容总表 §C2-2 逐字含差额数字，落按钮后缀位——这是文案给定的口径，
         不是把沈碑那条纪律搬过来。解锁判定本身只读 rel / heard，不新增任何字段。 */
      topics.push({ id: TOPICS[i].id, text: TOPICS[i].text,
        unlocked: isUnlocked(TOPICS[i].unlock, safe),
        heard: heard0.indexOf(TOPICS[i].id) >= 0,
        lockHint: lockHintOf(TOPICS[i], safe) });
    }
    var heard = Array.isArray(safe.heard) ? safe.heard.slice() : [];
    return { greeting: greeting, topics: topics, heard: heard };
  }

  function npcPick(state, topicId, ctx){
    if (!state || typeof state !== 'object') return { ok: false };
    var topic = null;
    for (var i = 0; i < TOPICS.length; i++){
      if (TOPICS[i].id === topicId){ topic = TOPICS[i]; break; }
    }
    if (!topic) return { ok: false };
    /* C2-2：锁着的话题不许结算。UI 侧按钮已 disabled，这里是第二道闸（fail-closed），
       与沈碑 npcPick 的 'locked' 分支同口径（js/npc.js:453）——只靠 UI 挡不算锁。
       ct1-ct3 是 always，既有直调路径（含数据层回归）行为一字不变。 */
    if (!isUnlocked(topic.unlock, state)) return { ok: false, error: 'locked' };

    var now = (ctx && ctx.now) ? ctx.now : Date.now();

    if (typeof state.met !== 'number' || !isFinite(state.met)) state.met = 0;
    if (state.met < 1) state.met = 1;

    var heard = Array.isArray(state.heard) ? state.heard.slice() : [];
    for (var j = heard.length - 1; j >= 0; j--){
      if (typeof heard[j] !== 'string') heard.splice(j, 1);
    }
    var idx = heard.indexOf(topic.id);
    var isNew = idx === -1;
    if (isNew){
      heard.push(topic.id);
    } else {
      heard.splice(idx, 1);
      heard.push(topic.id);
    }
    while (heard.length > 6) heard.shift();
    state.heard = heard;

    var relBefore = clampRel(state.rel);
    var relAfter = clampRel(relBefore + (isNew ? 2 : 1));
    state.rel = relAfter;
    var relDelta = relAfter - relBefore;

    if (!state.choice || typeof state.choice !== 'object') state.choice = {};
    var c = state.choice[topic.key];
    state.choice[topic.key] = (typeof c === 'number' && isFinite(c)) ? c + 1 : 1;

    if (!state.cur || typeof state.cur !== 'object') state.cur = {};
    var t = state.cur.talk;
    state.cur.talk = (typeof t === 'number' && isFinite(t)) ? t + 1 : 1;

    state.lastSeen = now;

    var text = hashPick(topic.lines, 'cuijiu|' + topic.id + '|' + state.cur.talk + '|' + now);

    /* 记忆存「可嵌进句子的稳定短语」，不存整段台词：
       原来的文本带当次台词（hashPick 里掺了 now → 每句都不同），
       NpcMemory 的"同文本去重"因此永不命中，8 条桶很快被同一话题的不同措辞占满，
       并且把「登塔破了第 N 层」这类真正有信息量的记忆挤掉。 */
    var memRes = memRecord('「' + topic.text + '」那些旧话', topic.memKind);

    return { ok: true, text: text, relDelta: relDelta, rel: state.rel, heard: state.heard.slice(),
      /* 只有明确 false 才算写盘失败，避免"没接这条线"被误报成失败 */
      memPersisted: (memRes && memRes.persisted === false) ? false : true };
  }

  /* 阶段四 C2-1（D3 批甲）：初见结算。单独一个导出，不改 npcPick 的既有签名
     （npcPick(state, topicId, ctx) 已被数据层回归直调，加参数会破坏调用方）。
     只动 met / rel / cur.talk / lastSeen 四个既有字段：
       · met 0→1，只发生一次（already_met 挡重复）；
       · rel 一律 +FIRST_REL_GAIN（=2，沿用 npcPick 首次分支现值），三选项无差异；
       · 不推 heard（初见不是话题，不占「已听 n/6」）；
       · 不动 choice（三键 climb/chat/listen 是话题键，初见选项无对应键，
         读档白名单也只认这三键，不新造键）；
       · 不写任何数值产出字段——崔九纪律：只给关系与剧情。
     记忆：本轮不落 memRecord（内容总表 §C2-1 未给初见的记忆短语，
       §C2-2 的记忆回指纪律只覆盖三条新话题）。已登记为待拍板，不自行补文案。 */
  function npcFirstPick(state, optionId, ctx){
    if (!state || typeof state !== 'object') return { ok: false, error: 'no_state' };
    if (typeof state.met !== 'number' || !isFinite(state.met)) state.met = 0;
    if (state.met >= 1) return { ok: false, error: 'already_met' };
    var opt = null;
    for (var i = 0; i < FIRST.options.length; i++){
      if (FIRST.options[i].id === optionId){ opt = FIRST.options[i]; break; }
    }
    if (!opt) return { ok: false, error: 'bad_option' };

    var now = (ctx && ctx.now) ? ctx.now : Date.now();
    state.met = 1;
    var relBefore = clampRel(state.rel);
    var relAfter = clampRel(relBefore + FIRST_REL_GAIN);
    state.rel = relAfter;
    if (!state.cur || typeof state.cur !== 'object') state.cur = {};
    var t = state.cur.talk;
    state.cur.talk = (typeof t === 'number' && isFinite(t)) ? t + 1 : 1;
    state.lastSeen = now;

    return { ok: true, first: true, optionId: opt.id, text: opt.reply,
      relDelta: relAfter - relBefore, rel: state.rel,
      heard: (Array.isArray(state.heard) ? state.heard.slice() : []),
      memPersisted: true };
  }

  function npcArrive(state, ctx){
    if (!state || typeof state !== 'object') return false;
    var now = (ctx && ctx.now) ? ctx.now : Date.now();
    if (!(now > 0)) return false;
    state.lastSeen = now;
    return true;
  }

  window.NpcTower = {
    NPC_CUIJIU: NPC_CUIJIU,
    /* 导出话题表：UI 的「已听 n/N」分母必须按真实话题数算，不能写死 6
       （阶段四 C2-2 后真实条数就是 6；分母仍取 TOPICS.length，不写死数字）。 */
    TOPICS: TOPICS,
    /* C2-1：初见配置（两行底句 + 三选项）。触发判定在 UI 层（要读 S.story），
       本层只供配置与结算，保持纯逻辑。 */
    FIRST: FIRST,
    EVENTS3: EVENTS3,
    TEXT: TEXT,
    npcSay: npcSay,
    questTick: questTick,
    npcPick: npcPick,
    npcFirstPick: npcFirstPick,
    npcArrive: npcArrive
  };
})();
