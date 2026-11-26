/* ============================================================
 * 主线《断天门》 —— 独立模块（数据表驱动，不改 game.js 任何既有逻辑）
 *
 * ⚠️ 口径（2026-10-25 第 51 节修订）：主线不是"一个要去点的面板"，而是
 *    修行进程里的**触发式叙事**——玩家在洞府打坐/爬塔/破境/收田，做到的
 *    那一刻，剧情自己找上门（一张宣纸浮片），奖励当场入账，不必来领。
 *    人物面板里只留一份「已发生」的履历，供回看。
 *
 *   ① 触发：tick 每 2.5 秒看一眼，当前那段条件达成 → 立即结算 + 弹卡
 *   ② 不打断：渡劫天象 / 战斗 / 闭关归来 / 孵化 / 奇遇 / 突破结算 / 创角 / 新手引导
 *      在台面上时一律让路，等它们收场再弹（叙事不能盖玩法，也不能盖别的叙事）
 *   ③ 不刷屏：结算照常全结算，浮片排队演（间隔 6 秒、最多排 3 段，多出来的记入履历）
 *   ④ 不丢字：卡片 12 秒无人理会自动收起，正文永久留在人物面板的履历里
 *   ⑤ 进度只读存档真实字段，只有 S.story.claimed 是新增写入
 *
 * 接线：
 *   index.html  在 game.js 之前引入本文件 + #story-modal 静态 DOM
 *   game.js     finishBoot() 内 Story.init({...})（★ 必须在 load() 之后）
 *               tickLoop 内 Story.tick()
 *               renderRole() 内 Story.renderInto()（人物面板的履历卡）
 *               load() 里 S.story 对象容错；resetAll() 里清 S.story
 * ============================================================ */
const Story = (() => {
  'use strict';
  let D = null;                 // 依赖（game.js boot 注入）
  let lastCheck = 0;
  let playing = false;          // 卡片正在台上
  let closeT = 0;
  let lastDrain = 0;
  /* 叙事节奏：queue 是排着队还没演的段（不丢，只是等）
     lastCardAt 记上一张弹出的时间，pumpT 是"等间隔"的定时器 */
  let queue = [];
  let lastCardAt = 0;
  let pumpT = 0;
  let hintShown = '';           // 上一次落过指路的段 id（同一段只提一次）

  const TICK_MS = 2500;         // 判定间隔
  const AUTO_MS = 12000;        // 卡片无人理会自动收起（正文在人物面板还在）
  /* 叙事节奏：两张浮片之间至少隔 6 秒（玩家刚点完「继续」，不能立刻又怼一张）；
     积压最多排 3 段，再多就记进履历并在日志留一句指路——不丢奖励，也不糊人一脸。
     一开始试过"20 秒窗口内最多弹 2 张"，实测会把玩家正常推进的剧情整段静默掉
     （开局 46 秒只弹 2 张、6 段全记进履历），所以改成排队而不是丢。 */
  const GAP_MS = 6000;
  const MAX_QUEUE = 3;
  /* 一次结算 >= 4 段就不逐段演了，改出一张"补记"卡。
     为什么要这条：老档第一次接上主线时实测一次补 14 段，逐段演只会演出
     第一章前三段（而他实际已经走到第三章），最相关的几段反而被静默。
     这种"早就发生过的事"不该逐段戏剧化——一张卡说清补了哪几段、给了什么，
     剩下的交回履历，才是对的粒度。 */
  const MERGE_AT = 4;

  /* 境界序号（已按 RANK_NAMES 实测校准）：0-8 炼气 / 9-11 筑基 / 12-14 金丹
     / 15-17 元婴 / 18-20 化神 / 21 炼虚 / 22 合体 / 23 大乘 / 24 渡劫 / 25 飞升 */
  const RK = { jindan: 12, yuanying: 15, huashen: 18, dujie: 24, feisheng: 25 };

  const farmN = s => (s.stats && s.stats.farmN) || 0;
  const secLayers = s => (s.secret && Array.isArray(s.secret.prog))
    ? s.secret.prog.reduce((a, b) => a + (b | 0), 0) : 0;

  const CH = ['', '第一章 · 无碑之人', '第二章 · 丹上之纹', '第三章 · 劫主',
              '第四章 · 两边都是真的', '第五章 · 叩关'];

  const ITEM_NAME = { guardMirror: '护心镜', guardArray: '护道阵法', tianji: '天机令' };

  /* 一~二十四：章回与段数都往这上面取，省得面板里出现阿拉伯数字
     （收尾批复第 3 项：补「二十四」，1-4b 上线后共 24 段） */
  const CN = ['', '一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四',
    '十五','十六','十七','十八','十九','二十','二十一','二十二','二十三','二十四'];

  /* 台上这些一出现，剧情就让路 */
  const BLOCK_IDS = ['settings-modal', 'char-modal', 'treasure-modal', 'item-modal',
    'battle-modal', 'trib-modal', 'enc-modal', 'reroll-modal', 'break-modal',
    'off-modal', 'hatch-modal'];

  /* —— 任务表 ——
   * prog(s)：读档实时进度；need：目标值（need=1 当作「成/未成」二值任务）
   * hint：还差一口气时露出的指路句（玩家得知道去哪把它做完）
   * rw：['wis',n]=悟道值（经 wisdomGain 境界系数）/ ['stoneK',k]=灵石（needOf×k）
   *     ['item',id,n] / ['dao',n] / ['rep',n]
   * text：记录里永久保留的白描正文 */
  const STORY = [
    /* ---------- 第一章 · 无碑之人（与太虚引导、沈碑初见单轨合流） ---------- */
    { id:'1-1', ch:1, name:'碑上无名', need:1, prog:()=>1, hint:'',
      text:'测灵碑照不出你的命数，反而墨色翻涌。暗处传来一声极轻的叹息：「三千年，碑只黑过两次。」',
      rw:[['wis',50]] },
    { id:'1-2', ch:1, name:'后山守碑人', need:1,
      prog:s=>(s.npcs && s.npcs.stele && s.npcs.stele.met === 1) ? 1 : 0,
      hint:'依太虚真人所言，去人物 · 识人页拜见后山守碑人',
      text:'你依言来到后山。守碑老吏沈碑头也不抬：「坐。碑上的字，你先看，看不懂的再问。」他没问你的名字，却死死盯了你的眼睛一眼。',
      rw:[['wis',60]] },
    { id:'1-3', ch:1, name:'气行周天', need:1, prog:s=>s.rank>=2?1:0, hint:'突破至炼气三层',
      text:'夜深吐纳时，你听见地底传来沉闷的潮声——不像海，像某个被钉在山底的庞然大物在缓缓呼吸。',
      rw:[['stoneK',0.5],['wis',80]] },
    { id:'1-4', ch:1, name:'塔底有异', need:3, prog:s=>s.towerMax||0, hint:'前往城镇 · 镇妖塔通关三层',
      text:'塔里的妖不像妖，越往上越像从「门那边」漏下来的影子。数妖的老卒崔九把长枪靠在墙边：塔不是镇妖的，是钉东西的——你每上一层，钉子松一分。',
      rw:[['item','guardMirror',1]] },
    { id:'1-4b', ch:1, name:'塔门口的数', need:1,
      prog:s=>(s.story && s.story.claimed && s.story.claimed['1-4']) ? 1 : 0,
      hint:'去镇妖塔门口看看守塔老卒崔九的记数册',
      text:'崔九翻开泛黄的册子：「往上的人我记着，退下来的人我也记着。你最奇怪——两头我都记不着。后山那位老吏若问起，替我带句话：第三根钉子松了。」',
      rw:[] },
    { id:'1-5', ch:1, name:'章回 · 影子慢了半息', need:1, prog:()=>1, hint:'',
      text:'深夜你回看后山测灵碑：漆黑的碑面上，你的人形影子——比你慢了半息才动。沈碑站在暗影里，破天荒多说了一句：「上一世走到这儿的人，也发现了这件事。」',
      rw:[['wis',100]] },

    /* ---------- 第二章 ---------- */
    { id:'2-1', ch:2, name:'初开丹炉', need:1,
      prog:s=>(s.mastery && s.mastery.alchemyExp>0)?1:0, hint:'在炼丹房开一炉',
      text:'丹成时丹面有云状细纹，像某种你没见过的字。',
      rw:[['wis',60]] },
    { id:'2-2', ch:2, name:'田里第一茬', need:5, prog:farmN, hint:'在灵田收满五畦',
      text:'第一茬自己种的灵草，比坊市买的苦，但扎实。',
      rw:[['stoneK',1]] },
    { id:'2-3', ch:2, name:'丹纹成印', need:1, prog:s=>s.rank>=RK.jindan?1:0, hint:'修为到金丹',
      text:'内视丹田：金丹上有一道极细的纹，像半枚没刻完的印。',
      rw:[['wis',150]] },
    { id:'2-4', ch:2, name:'秘境留言', need:10, prog:secLayers, hint:'秘境合计探至十层',
      text:'石壁上前人刻字：「别往上修了。越往上，它越看得见你。」落款：天骄榜第七。',
      rw:[['item','tianji',1]] },
    { id:'2-5', ch:2, name:'章回 · 锁孔在门这边', need:1, prog:()=>1, hint:'',
      text:'你梦见天门——门上没有锁。锁孔在门这一侧。有人进去后，把自己和「它」关在了一起。',
      rw:[['wis',200]] },

    /* ---------- 第三章 ---------- */
    { id:'3-1', ch:3, name:'第二封信', need:1, prog:()=>1, hint:'',
      text:'字条再现：「丹上的纹看见了？那是我斩下来的一缕魂，藏了三千年。」',
      rw:[['wis',100]] },
    { id:'3-2', ch:3, name:'塔是钉', need:10, prog:s=>s.towerMax||0, hint:'镇妖塔通关十层',
      /* 阶段四 C2-3：text 改写（崔九进场），need／prog／hint／rw 一字未动 */
      text:'塔是钉，钉住灵脉交汇处的一个巨大影子。你每通关一层，钉子松一分。老卒把那本记数的册子摊给你看：上去没下来的人，十一个。他仍每日划一道。',
      rw:[['item','guardArray',1]] },
    { id:'3-3', ch:3, name:'灵兽向北', need:1, prog:s=>(s.pets&&s.pets.length>=1)?1:0, hint:'先孵一只灵兽',
      text:'小兽破壳后不肯看你，冲着北边的天叫了半宿。北边是天门。',
      rw:[['stoneK',1]] },
    { id:'3-4', ch:3, name:'劫主来信', need:1,
      prog:s=>(s.enc && s.enc.lastId)?1:0, hint:'奇遇会自己上门：在洞府待着，等一次事件。',
      text:'一封没有落款的信：「他骗你。是天道要吃我，关了我三千年。你们的机缘，一半是我给的。」',
      rw:[['wis',150]] },
    { id:'3-5', ch:3, name:'章回 · 两半印', need:1, prog:s=>s.rank>=RK.yuanying?1:0, hint:'修为到元婴',
      text:'你修得越快，门开得越快。渡劫那天，是你开门，还是门开你？',
      rw:[['wis',300]] },

    /* ---------- 第四章 ---------- */
    { id:'4-1', ch:4, name:'论剑异样', need:3, prog:s=>(s.arena&&s.arena.win)||0, hint:'论剑台胜三场',
      text:'有对手认输前死死盯着你：「你身上，有两个人的气息。」',
      rw:[['rep',200]] },
    { id:'4-2', ch:4, name:'榜九的灯', need:1, hint:'天骄榜进前十五。灯是榜九的，位置是你的。',
      /* 原稿 need:15 与「16-名次」自相矛盾（只有第 1 名才够 15）→ 改二值判定，进前十五即达成 */
      prog:()=>{ try{ const r = D ? D.heroRank() : 99; return r <= 15 ? 16 - r : 0; }catch(e){ return 0; } },
      /* 阶段四 C2-3：text 改写（崔九进场），need／prog／hint／rw 一字未动 */
      text:'榜上第九三百年前就死了。可你路过他的旧洞府，门前的灯是亮的。塔门口那老卒说，灯芯换过三回，都是他自己来换的——老卒守塔那年，是他把老卒换上来的。',
      rw:[['wis',150]] },
    { id:'4-3', ch:4, name:'心法取舍', need:5,
      prog:s=>Math.min(s.gong1||0, s.gong2||0, s.gong3||0), hint:'三门功法各修到五级——拖后腿的那一门，洞府 · 洞府设施里看得见。',
      text:'两个声音说的可能是同一件事的正反两面。你谁都不敢全信，只能信自己修出来的。',
      rw:[['stoneK',2]] },
    { id:'4-4', ch:4, name:'章回 · 长信', need:1, prog:s=>s.rank>=RK.huashen?1:0, hint:'修为到化神',
      text:'无名氏绝笔：「他等的不是一个能杀他的人，是一个能重新谈判的人——一个连灵碑都没登上的、清白的人。」',
      rw:[['wis',500],['item','tianji',1]] },

    /* ---------- 第五章 ---------- */
    { id:'5-1', ch:5, name:'九雷之后', need:1, prog:s=>s.rank>=RK.dujie?1:0, hint:'修为到渡劫',
      text:'九雷已尽，门上无锁。门里吵了三千年的两个声音，第一次同时安静下来。',
      rw:[['wis',300]] },
    { id:'5-2', ch:5, name:'塔顶断剑', need:25, prog:s=>s.towerMax||0, hint:'镇妖塔通关 25 层',
      /* 奖励定稿为天机令 ×1（下一次突破必定成功）——和这句「最后一里，我替你走完了」是同一件事：
         塔顶那位没能走完的那一步，由这枚令替你走。不做成装备：此处已是渡劫期，
         ITEMS 里最高一档装备（赤霄剑 1800 战力）在这个阶段没有意义，给数值反而是侮辱。 */
      /* 阶段四 C2-3：text 改写（原句保留、尾部续写崔九一笔），need／prog／hint／rw 一字未动 */
      text:'塔顶没有妖，只有一把插在石里的断剑，剑下一行字：「最后一里，我替你走完了。」这一回老卒没数你上塔几趟，只把长枪从墙上取了下来。',
      rw:[['item','tianji',1]] },
    { id:'5-3', ch:5, name:'登峰', need:1,
      prog:()=>{ try{ return (D && D.heroRank() === 1) ? 1 : 0; }catch(e){ return 0; } },
      hint:'天骄榜登顶',
      text:'碑上原来有个空着的「已飞升」栏，在等有人填上它。',
      rw:[['wis',500]] },
    { id:'5-4', ch:5, name:'终章 · 说吧', need:1, prog:s=>s.rank>=RK.feisheng?1:0, hint:'修为到飞升',
      text:'飞升之后，信匣里最后一封信只有两个字：「说吧。」第一句话，留给你自己。',
      rw:[['dao',1]] }
  ];

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

  const byId = id => STORY.find(q => q.id === id);
  const cur = () => { const s = D && D.s(); return (s && s.story) ? s.story : null; };

  /* 进度读取包一层：某条读坏了只是这条显示 0，不能让整个面板白屏 */
  function progOf(q){
    try{ return Math.max(0, (q.prog(D.s()) | 0)); }catch(e){ return 0; }
  }
  /* 线性链：仅当上一条已记，本条才轮到 */
  function unlocked(i){
    if(i === 0) return true;
    const c = cur();
    return !!(c && c.claimed && c.claimed[STORY[i - 1].id]);
  }
  function state(i){
    const c = cur(); if(!c || !c.claimed) return 'lock';
    if(c.claimed[STORY[i].id]) return 'done';
    return unlocked(i) ? 'open' : 'lock';
  }
  const doneCount = () => STORY.filter((q, i) => state(i) === 'done').length;
  const progTxt = (q, p) => q.need <= 1 ? (p >= 1 ? '已成' : '未至')
                                        : Math.min(p, q.need) + ' / ' + q.need;

  /* ---------------- 结算（发奖唯一出口） ---------------- */
  /* 返回 [{k, n, name}]：结构化是为了补记卡能把多段奖励按类型累加 */
  function applyRw(rw){
    const s = D.s(), rk = s.rank || 0, got = [];
    (rw || []).forEach(p => {
      const k = p[0], a = p[1], b = p[2];
      if(k === 'wis'){
        const n = D.wisdom(a);
        s.wisdom = Math.floor(s.wisdom || 0) + n;        /* 不用 | 0：钱数越过 2^31 会翻负 */
        got.push({ k: 'wis', n: n, name: '悟道值' });
      }else if(k === 'stoneK'){
        const n = Math.round(D.needOf(rk) * a);
        s.stone = Math.floor(s.stone || 0) + n;          /* 同上：主线发奖是 tick 里自动入账的 */
        got.push({ k: 'stone', n: n, name: '灵石' });
      }else if(k === 'item'){
        s[a] = (s[a] | 0) + (b | 0);
        got.push({ k: 'item:' + a, n: (b | 0), name: '【' + (ITEM_NAME[a] || a) + '】' });
      }else if(k === 'dao'){
        s.dao = (s.dao | 0) + (a | 0);
        got.push({ k: 'dao', n: (a | 0), name: '道韵' });
      }else if(k === 'rep'){
        if(s.arena) s.arena.rep = (s.arena.rep | 0) + (a | 0);
        got.push({ k: 'rep', n: (a | 0), name: '论剑声望' });
      }
    });
    return got;
  }
  const gotTxt = g => g.k.indexOf('item:') === 0 ? (g.name + '×' + g.n) : (g.name + ' +' + g.n);
  /* 多段奖励按类型累加（补记卡用） */
  function joinGot(groups){
    const order = [], map = {};
    (groups || []).forEach(g => (g || []).forEach(x => {
      if(!map[x.k]){ map[x.k] = { k: x.k, n: 0, name: x.name }; order.push(x.k); }
      map[x.k].n += x.n;
    }));
    return order.map(k => gotTxt(map[k])).join(' · ');
  }

  /* 把这一段记进存档并发奖（达成即入账，不再有"领取"这一步） */
  function settle(q){
    const c = cur();
    if(!c || c.claimed[q.id]) return null;
    c.claimed[q.id] = Date.now();
    const got = applyRw(q.rw);
    const txt = got.map(gotTxt).join('、');
    D.log('📜 主线 · ' + q.name + (txt ? '（' + txt + '）' : ''), 'gold');
    D.save();
    return got;
  }

  /* 一次把能达成的都结算掉（串行链：第一条没达成就停） */
  function drain(){
    const out = [];
    for(let i = 0; i < STORY.length; i++){
      const st = state(i);
      if(st === 'done') continue;
      if(st !== 'open') break;
      const q = STORY[i];
      if(progOf(q) < q.need) break;
      const got = settle(q);
      if(!got) break;
      out.push({ q: q, got: got });
    }
    return out;
  }

  /* ---------------- 剧情浮片 ---------------- */
  const isBlocked = () => BLOCK_IDS.some(id => {
    const e = document.getElementById(id);
    return !!(e && !e.classList.contains('hidden'));
  });
  /* 新手引导还没走完时，别插进它的对话框中间 */
  function tutBusy(){
    try{
      const st = window.Tutorial && Tutorial._state ? Tutorial._state() : null;
      return !!(st && st.step > 0 && !st.finished);
    }catch(e){ return false; }
  }
  const ready = () => !!(D && !playing && !isBlocked() && !tutBusy());

  const setTxt = (id, txt) => { const e = document.getElementById(id); if(e) e.textContent = txt; };
  /* "去看履历"只在补记卡上出现（单段卡的正文就在眼前，不需要跳） */
  function jumpBtn(on){
    const b = document.getElementById('sto-jump');
    if(b) b.style.display = on ? '' : 'none';
  }

  function showCard(q, got, silent){
    const m = document.getElementById('story-modal');
    if(!m) return false;
    const gained = joinGot([got || []]);
    setTxt('sto-ch', CH[q.ch] || '');
    setTxt('sto-name', q.name);
    setTxt('sto-text', q.text);
    setTxt('sto-list', '');
    setTxt('sto-gain', gained ? '所得 · ' + gained : '');
    setTxt('sto-more', silent > 0 ? '另有 ' + silent + ' 段已记入履历' : '');
    jumpBtn(false);
    m.classList.remove('hidden');
    m.setAttribute('data-seg', q.id);
    /* 2026-11-19 开局弹层调度：剧情上台 → 太虚引导让位（Guide 监听此事件即摘气泡） */
    try{ document.dispatchEvent(new Event('jx:story-open')); }catch(e){}
    playing = true;
    clearTimeout(closeT);
    closeT = setTimeout(closeCard, AUTO_MS);
    return true;
  }

  /* 补记卡：一口气补了好几段时用一张交代，不再逐段演 */
  function showMerge(list){
    const m = document.getElementById('story-modal');
    if(!m) return false;
    const chs = [];
    list.forEach(x => { if(chs.indexOf(x.q.ch) < 0) chs.push(x.q.ch); });
    const head = chs.length > 1
      ? '第' + CN[chs[0]] + '章 至 第' + CN[chs[chs.length - 1]] + '章'
      : CH[chs[0]];
    setTxt('sto-ch', head);
    setTxt('sto-name', '补记 · ' + (CN[list.length] || list.length) + '段');
    setTxt('sto-text', '这一程走得太急。有些事，回头才看得清。');
    setTxt('sto-list', list.map(x => x.q.name).join('、'));
    const gained = joinGot(list.map(x => x.got));
    setTxt('sto-gain', gained ? '所得 · ' + gained : '');
    setTxt('sto-more', '正文都记在人物 · 断天门里');
    jumpBtn(true);
    m.classList.remove('hidden');
    m.setAttribute('data-seg', 'merge');
    try{ document.dispatchEvent(new Event('jx:story-open')); }catch(e){}
    playing = true;
    clearTimeout(closeT);
    closeT = setTimeout(closeCard, AUTO_MS + 6000);   /* 名目多，多给六秒 */
    return true;
  }

  function closeCard(){
    const m = document.getElementById('story-modal');
    if(m) m.classList.add('hidden');
    playing = false;
    clearTimeout(closeT);
    lastCheck = 0;                    /* 让下一段在下一次心跳里就能接上 */
    /* 剧情退场：太虚引导此时才许上台（Guide 监听此事件） */
    try{ document.dispatchEvent(new Event('jx:story-close')); }catch(e){}
    if(queue.length) setTimeout(() => pump(true), 460);   /* 队列里还有：收掉就接上，不隔太久 */
  }

  /* 演下一张。
     force=true：玩家刚刚亲手关掉上一张 → 立刻接上（连看的节奏）。
     force=false：由心跳触发 → 距上一张不足 GAP_MS 就先排着，到点自己弹。 */
  function pump(force){
    if(playing || !queue.length) return;
    clearTimeout(pumpT); pumpT = 0;
    /* 遮挡复查：pump 多数由 setTimeout 延时触发（间隔 GAP_MS 6 秒、关窗后 460ms），
       这期间玩家完全可能点开战斗/设置/人物面板。showCard 内部不做任何遮挡判定，
       原先会把剧情卡直接压到那些弹窗底下（违反"叙事不打断玩法"），
       而且 playing 仍被置 true 并挂上 12 秒自动关闭 → 这段时间 ready() 恒 false，
       后续所有剧情段只能排队、不结算。被遮挡就延后再试，段子留在队列里不动。 */
    if(!ready()){ pumpT = setTimeout(() => pump(force), 800); return; }
    const wait = force ? 0 : (lastCardAt + GAP_MS - Date.now());
    if(wait > 0){ pumpT = setTimeout(() => pump(true), wait); return; }
    const it = queue.shift();
    lastCardAt = Date.now();
    showCard(it.q, it.got, it.silent || 0);
  }

  /* ---------------- 心跳（tickLoop 每 500ms 叫一次，内部 2.5s 节流） ---------------- */
  function tick(){
    const now = Date.now();
    if(now - lastCheck < TICK_MS) return;
    lastCheck = now;
    if(!ready()) return;
    if(now - lastDrain < 400) return;
    const list = drain();
    if(!list.length) return;
    lastDrain = now;
    D.render();
    renderInto();

    if(list.length >= MERGE_AT){
      /* 已排队但还没演过的段不能丢：它们的奖励已发、履历已记，
         直接 queue=[] 等于"这几段剧情从来没有出现过"，补记卡名单里也没有它们。
         这里把队列里的段并进本次合并名单（先排队的在前，保持发生顺序）。 */
      const merged = queue.concat(list);
      queue = []; clearTimeout(pumpT); pumpT = 0;
      lastCardAt = now;
      showMerge(merged);
      logHint();
      return;
    }
    const room = Math.max(0, MAX_QUEUE - queue.length);
    const take = list.slice(0, room);
    const over = list.length - take.length;        /* 排不下的才静默（奖励已发，履历已记） */
    if(take.length){
      take[0].silent = over;                       /* 只有第一张交代"其余几段已记入" */
      queue = queue.concat(take);
    }
    pump(false);
    logHint();                                     /* 事情发生了，顺带把下一步递到日志里 */
  }

  /* 当前这一段（串行链上第一条没记完的） */
  function nextIdx(){
    for(let i = 0; i < STORY.length; i++) if(state(i) !== 'done') return i;
    return -1;
  }

  /* 指路：结算完一段后，在日志里落一句"下一步该去干什么"。
     玩家不会主动去翻人物面板，但每天都会扫一眼日志——这句话放在那儿才有用。
     同一段只提一次（hintShown 去重），不刷屏。 */
  function logHint(){
    const i = nextIdx();
    if(i < 0) return;
    const q = STORY[i];
    if(hintShown === q.id) return;
    hintShown = q.id;
    if(!q.hint) return;
    D.log('📜 断天门 · 下一步：' + q.hint, 'sys');
  }

  /* ---------------- 人物面板的履历（只是回看，不是入口） ---------------- */
  function renderInto(){
    const box = document.getElementById('xx-role-story');
    if(!box) return;
    const done = []; let curAt = -1;
    STORY.forEach((q, i) => {
      const st = state(i);
      if(st === 'done') done.push(i);
      else if(curAt < 0) curAt = i;
    });
    const sub = document.getElementById('xx-role-story-sub');
    if(sub) sub.textContent = done.length ? '已走过 ' + done.length + ' 段' : '';
    if(!done.length && curAt < 0){ box.innerHTML = ''; return; }

    let html = '';
    for(let ch = 1; ch < CH.length; ch++){
      const items = done.filter(i => STORY[i].ch === ch);
      const isCur = curAt >= 0 && STORY[curAt].ch === ch;
      if(!items.length && !isCur) continue;
      html += '<div class="sto-ch">' + CH[ch] + '</div>';
      items.forEach(i => {
        html += '<div class="sto-item">'
          +   '<div class="sto-h"><b>' + esc(STORY[i].name) + '</b><em>已记</em></div>'
          +   '<p class="sto-t">' + esc(STORY[i].text) + '</p>'
          + '</div>';
      });
      if(isCur){
        const q = STORY[curAt], st = state(curAt);
        html += '<div class="sto-item sto-now">'
          +   '<div class="sto-h"><b>' + esc(st === 'lock' ? '？？？' : q.name) + '</b>'
          +     '<span>' + (st === 'lock' ? '尚未开启' : progTxt(q, progOf(q))) + '</span></div>'
          +   (st !== 'lock' && q.hint ? '<p class="sto-hint">' + esc(q.hint) + '</p>' : '')
          + '</div>';
      }
    }
    box.innerHTML = html;
  }

  /* ---------------- boot 注入 ---------------- */
  /* Story.init({
   *   s: ()=>S, needOf: r=>needOf(r), wisdom: n=>wisdomGain(n),
   *   heroRank: ()=>{ const l = rankList(); const i = l.findIndex(r=>r.me); return i<0?99:i+1; },
   *   log, save, render }) */
  function init(deps){
    D = deps;
    const s = D.s();
    /* 对象字段容错：缺/坏/是数组 → 重建空账；脏 id、脏时间戳直接丢 */
    if(!s.story || typeof s.story !== 'object' || Array.isArray(s.story)) s.story = { claimed: {} };
    if(!s.story.claimed || typeof s.story.claimed !== 'object' || Array.isArray(s.story.claimed))
      s.story.claimed = {};
    Object.keys(s.story.claimed).forEach(id => {
      const v = s.story.claimed[id];
      if(!byId(id) || typeof v !== 'number' || !isFinite(v)) delete s.story.claimed[id];
    });
    /* 浮片是静态 DOM，绑一次；点遮罩或「继续」都收 */
    const m = document.getElementById('story-modal');
    if(m && !m.dataset.bound){
      m.dataset.bound = '1';
      m.addEventListener('click', ev => { if(ev.target === m) closeCard(); });
      const b = document.getElementById('sto-close');
      if(b) b.addEventListener('click', closeCard);
      const jb = document.getElementById('sto-jump');
      if(jb) jb.addEventListener('click', () => {
        closeCard();
        try{ if(window.ROUTER) ROUTER.open('role', 'xx-role-story'); }catch(e){}
      });
      jumpBtn(false);
    }
    renderInto();
  }

  const api = {
    init, tick, renderInto, closeCard,
    _STORY: STORY, _state: state, _done: doneCount, _settle: settle, _drain: drain,
    _tick: () => { lastCheck = 0; lastDrain = 0; tick(); },
    _playing: () => playing, _blocked: isBlocked, _tutBusy: tutBusy,
    _pump: pump, _burst: () => ({ queued: queue.length, at: lastCardAt }),
    /* 用例开局复位（只在 verify 里用）：连弹队列、上一张的时刻、指路去重标记全部归零，
       让「达成即弹」「落一句下一步」这类断言从已知状态起跑，而不是接着上一节用例的余温。
       playing 不在这里清 —— 它只能由 closeCard() 复位，测试要复位请走 closeCard 那扇正门。 */
    _resetBurst: () => { queue = []; lastCardAt = 0; clearTimeout(pumpT); pumpT = 0; hintShown = ''; },
    _hint: () => hintShown, _next: nextIdx, _merge: showMerge, _joinGot: joinGot,
    _rk: RK, _secLayers: secLayers
  };
  window.Story = api;          /* 测试 / 截图 / 控制台入口（const 不挂 window，必须显式挂） */
  return api;
})();
