'use strict';
/* ============================================================
 * 九霄问道 · 独立版
 * 从「像素游戏厅」里单独拎出来的放置挂机游戏，玩法数值保持不变，
 * 界面重做、依赖(store/sfx/排行榜)全部内联，单文件双击即玩。
 * 宗门互助是可选模块：连得上 server/sect-server.js 就用，连不上自动降级成单机。
 * ============================================================ */

/* ---------- 轻量 store / 音效 ---------- */
const store = {
  get(key, fb){
    try{ const r = localStorage.getItem(key); return r == null ? fb : JSON.parse(r); }
    catch(e){ return fb; }
  },
  set(key, v){
    try{ localStorage.setItem(key, JSON.stringify(v)); }catch(e){}
  }
};

const sfx = (function(){
  /* 合成音效已退役（2026-10-20）：改用文件音频（audio.js 的 bgm.mp3 + metal_click.ogg），
     on 恒为 false → 所有 sfx.xxx() 调用点零改动且静音，避免与文件音频双响 */
  let ac = null, on = false;
  function c(){
    if(!on) return null;
    if(!ac){
      try{
        const AC = window.AudioContext || window.webkitAudioContext;
        if(!AC) return null;
        ac = new AC();
      }catch(e){ return null; }
    }
    if(ac.state === 'suspended'){ try{ ac.resume(); }catch(e){} }
    return ac;
  }
  function tone(freq, dur, type, vol){
    const ctx = c(); if(!ctx) return;
    try{
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol == null ? 0.06 : vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + dur);
    }catch(e){}
  }
  return {
    isOn(){ return on; },
    toggle(){
      on = !on; store.set('xiuxian_sfx_on', on);
      if(on) this.click();
      renderSfxBtn();
      return on;
    },
    click(){ tone(660, 0.05, 'square', 0.05); },
    score(){ tone(880, 0.09, 'triangle', 0.07); setTimeout(() => tone(1180, 0.10, 'triangle', 0.06), 70); },
    hit(){ tone(180, 0.07, 'sawtooth', 0.05); },
    win(){ [523,659,784,1047].forEach((f,i) => setTimeout(() => tone(f, 0.13, 'triangle', 0.07), i * 90)); },
    lose(){ [400,300,220].forEach((f,i) => setTimeout(() => tone(f, 0.16, 'sawtooth', 0.06), i * 110)); },
    pop(){ tone(1046, 0.06, 'sine', 0.05); }
  };
})();

function renderSfxBtn(){
  const b = document.getElementById('sc-sfx');
  const onNow = !!(window.GameAudio && !GameAudio.isMuted());
  if(b){
    /* 2026-10-24：侧栏换 AI 水墨图标后不能再写 emoji（会冲掉 img），
       开关态改为「图标变暗 + 文字切 音效/静音」 */
    b.innerHTML = '<img class="sys-ic" src="ui/icons/rail_sfx.png" alt=""><small>' + (onNow ? '音效' : '静音') + '</small>';
    b.classList.toggle('muted', !onNow);
  }
}

/* ============================================================
 * 水墨图标 · emoji → PNG（第 83 轮）
 * 系统 emoji 是全彩的，压在宣纸底上跟水墨对不上；结构位（按钮、行首、面板标题）
 * 一律换成 ui/icons 里的墨色 PNG。
 * ⚠️ 为什么是一张表而不是逐个改：同一条 emoji 在十几个面板里出现，且 XX / SECT /
 *   VIEWS 是三块互不共享作用域的代码，查表 + 一个全局函数是唯一不用把表抄三遍的写法。
 * ⚠️ 没配到图的 emoji 原样返回，所以补一张图就自动生效，漏一个也不会渲染成空串。
 * ⚠️ 调用点的容器必须是 innerHTML；用 textContent 写会把 <img> 变成一串尖括号。
 * ============================================================ */
window.INK_ICON = {
  '⚔': 'ui/icons/ic_blade.png',     /* 单剑斜出：交叉双剑在 16px 会读成「×」关闭钮 */
  '⛩': 'ui/icons/ic_gate.png',
  '🎁': 'ui/icons/ic_gift.png',
  '🎲': 'ui/icons/ic_die.png',
  '📦': 'ui/icons/ic_box.png',
  '💰': 'ui/icons/ic_stonebag.png',
  '🗑': 'ui/icons/ic_trash.png',
  '🐉': 'ui/icons/ic_beast.png',
  '🥚': 'ui/icons/ic_egg.png',
  '📜': 'ui/icons/ic_scroll.png',
  '🕯': 'ui/icons/ic_candle.png',
  '🔒': 'ui/icons/ic_lock.png',
  '💊': 'ui/icons/dan1.png',
  '⚡': 'ui/icons/ic_bolt.png',
  '🏯': 'ui/icons/ic_pagoda.png',
  '🧘': 'ui/icons/ic_sit2.png',
  '🏔': 'ui/icons/ic_cave2.png'
};
/* cls 默认 .btn-ic（行首 16px）；侧栏那种 26px 圆钮传 'sys-ic'
   ⚠️ 键一律不带 U+FE0F：⚔️/⛩️/🗑️ 这类符号在源码里带不带变体选择符是随机的，
      查表前两边都剥掉，否则同一个 emoji 会一半查得到一半查不到。 */
window.inkIco = function(emo, cls){
  const src = window.INK_ICON[String(emo).replace(/\uFE0F/g, '')];
  if(!src) return emo;
  return '<img class="' + (cls || 'btn-ic') + '" src="' + src + '" alt="">';
};

/* ============================================================
 * 修仙核心（玩法数值与游戏厅版完全一致）
 * ============================================================ */
const XX = (function(){
  const SAVE_KEY = 'xiuxian_save';
  const BEST_KEY = 'xiuxian_best';

  const RANK_NAMES = [];
  ['一层','二层','三层','四层','五层','六层','七层','八层','九层'].forEach(x => RANK_NAMES.push('炼气' + x));
  ['初期','中期','后期'].forEach(x => RANK_NAMES.push('筑基' + x));
  ['初期','中期','后期'].forEach(x => RANK_NAMES.push('金丹' + x));
  ['初期','中期','后期'].forEach(x => RANK_NAMES.push('元婴' + x));
  ['初期','中期','后期'].forEach(x => RANK_NAMES.push('化神' + x));
  RANK_NAMES.push('炼虚境', '合体境', '大乘境', '渡劫期', '飞升');
  const TOP = RANK_NAMES.length - 1;

  /* ============ 寿元 / 坐化 / 转世（第 96 轮：骨架） ============
     为什么按「大境界」分段而不是按层：26 层各写一个上限，调数值要动 26 个格子，
     而且同一大境界里的三层本来就该是一条命——寿元是"境界给你的时间"，不是"层数给你的时间"。
     最后一格是 Infinity：飞升即不死，转世变成玩家自己的选择而不是被死亡逼的。 */
  const STAGE_NAMES = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫', '飞升'];
  const LIFE_MAX = [120, 300, 600, 1200, 2400, 4000, 6000, 9000, 13000, Infinity];
  /* 层 → 大境界段：0~8 炼气，9~20 每三层一段，21 起一层一段 */
  const lifeStageOf = rank => {
    const r = Math.max(0, Math.min(TOP, rank | 0));
    if(r <= 8) return 0;
    if(r <= 20) return 1 + Math.floor((r - 9) / 3);
    return r - 16;
  };

  const ROOTS = [
    { name: '废灵根', mult: 0.7, w: 18, bonus: 0 },
    { name: '杂灵根', mult: 1.0, w: 40, bonus: 0.02 },
    { name: '双灵根', mult: 1.2, w: 26, bonus: 0.05 },
    { name: '单灵根', mult: 1.45, w: 13, bonus: 0.08 },
    { name: '天灵根', mult: 1.9, w: 3, bonus: 0.12 }
  ];

  /* 战力数值规模系数：对标大型修仙游戏的「千万/亿级战力」观感，全部战力数字统一 ×POW_K
     基础战力 = 10×POW_K × 1.5^境界 → 开局 1000、满境界基础约 2525 万，加上功法/法宝/灵兽乘数后期可达数亿 */
  const POW_K = 100;

  const S = { name: '', sex: 'm', gender: 'male', robe: 'bai', rank: 0, exp: 0, stone: 0, cave: 0, dan: 0, forge: 0, dao: 0, rootIdx: 1, path: '', last: Date.now(), log: [], field: 0, bag: [], powScale: POW_K,
    /* 太虚真人引导 V1（2026-11-11）：引导进度/跳过/补讲/奖励凭证，随主存档同一事务提交 */
    guide: { step: 0, done: false, skipped: false, flags: {}, rewardClaims: {}, toldSystems: {} },
    gong1: 0, gong2: 0, gong3: 0,                       /* 三种功法等级（逐步进阶） */
    herb: 0, ore: 0,                                    /* 材料：灵草 / 矿石（炼丹、炼器用） */
    mine: 0,                                            /* 矿脉等级（产矿石） */
    plots: [],                                          /* 灵田田块：[{crop,t0,need}]，空位 = null（种田闭环） */
    weapon: 0,                                          /* 当前法宝品质：0无 1下品 2中品 3上品 4极品 */
    equipment: { weapon: null, armor: null, accessory: null },   /* 装备三槽：存 ITEMS 的 id，null=空槽 */
    weaponLv: 0,                                        /* 法宝强化等级 +N（0~20） */
    weaponBless: 0,                                     /* 强化祝福值（连败累积，满则必成） */
    affix: [],                                          /* 法宝洗练词条 [{id, q}]，条数 = 法宝品质 */
    art: { bg: 0, brk: 0, cai: 0 },                     /* 法器另三族持有阶位（0无 1~9 阶）；灵器族仍走上面的 S.weapon */
    /* rv4 唯一扩展容器：souls 本世兽魂；found 曾取得专属料；claimed 万兽谱已领段。
       转世只清 souls，found/claimed 跨世；重开整组清零。 */
    rv4: { v: 1, souls: [], found: [], claimed: [] },
    swordAura: 0,                                       /* 剑意流派：0 青莲剑意 / 1 紫霄神雷 / 2 赤炎流光 */
    bagSize: 20,                                        /* 背包容量（储物袋可扩到 50） */
    huntBeast: null,                                    /* 当前历练的妖兽 id（null=未历练） */
    huntProg: 0,                                        /* 击杀进度（秒） */
    bossKilled: {},                                     /* 已击杀的 Boss（首通奖励用） */
    eggs: [],                                           /* 妖兽蛋 [{bid}]（未孵化） */
    mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 },   /* 匠道修为：丹师/器师阶位与经验 */
    recipeN: {},                                        /* 丹方旁支：每张正方已炼炉数（第 69 节，{dan1: 4}） */
    tower: 1,                                           /* 镇妖塔当前层（从 1 开始） */
    towerMax: 0,                                        /* 镇妖塔历史最高通关层 */
    towerDay: '',                                       /* 上次扫荡日期（跨天重置扫荡） */
    towerSwept: 0,                                      /* 今日已扫荡层数 */
    towerBossMail: 0,                                   /* 旧档 Boss 料一次性补信匣是否已领（0/1，转世保留） */
    /* 镇妖塔一局五步（第 100 轮）：在塔里时才有值，出塔置 null
       f0 = 入塔时的层数；step = 已走几步；doors = 当前三步的门（顺序打乱）；
       charms = 本局符（锋/护，出塔即散）；brk = 本局破防次数；res = 本局账本 */
    trun: null,
    trunLast: null,                                     /* 上一局结算（塔页显示一行） */
    pets: [],                                           /* 灵兽 [{bid, lv, exp}]（已孵化，参战加战力） */
    petSlots: 1,                                        /* 灵兽槽（可养几只，1~3） */
    stats: { sit: 0, herb: 0, train: 0, enlight: 0, craftPill: 0, explore: 0, hunt: 0, enhance: 0, stoneEarned: 0, farmN: 0 },  /* 累计统计（任务进度）；farmN = 累计收畦数（主线 2-2 用） */
    questsDone: [],                                     /* 已完成（已领奖）的任务 id */
    miles: {},                                          /* 仙途道碑：已达成 {id: 时间戳} */
    milesNew: [],                                       /* 新达成但还没进人物面板看过的 id（驱动入口红点） */
    story: { claimed: {} },                             /* 主线《断天门》：只记已领取的段 {id: 时间戳}；进度本身实时读上面的真实字段，不另存一份 */
    letters: [],                                        /* 信匣：闭关期间山里发生的事（{id,kind,day,text,rw,open,at}） */
    pillUntil: 0, pillBonus: 0,                          /* 丹药突破 buff：截止时间戳 + 加成值 */
    /* ---- 第 89 节：聚灵 / 淬体 / 丰产三族丹药的临时 buff ----
       三条各占一个槽，谁也不覆盖谁；与奇遇 encBuff 同理，是独立叠乘而不是取大 */
    danExp:  { mult: 0, until: 0 },                       /* 聚灵丹：修炼速度倍率 */
    danPow:  { pct: 0,  until: 0 },                       /* 淬体丹：战力百分比 */
    danGain: { pct: 0,  until: 0 },                       /* 丰产丹：采药与矿脉产出百分比 */
    /* ---- 全局突破与丹药辅助生态（贯穿全境界） ---- */
    wisdom: 0,                                           /* 悟道值（货币，无上限）：仅任务/签到/突破失败可得 */
    insight: 0,                                          /* 顿悟进度 0~100：失败累积，满则下次必定顿悟 */
    wu: { sword: 0, dan: 0, array: 0 },                   /* 悟道树三路等级 0~5（见 WU_TREE） */
    wuPaid: { sword: 0, dan: 0, array: 0 },               /* 每路实际花掉的悟道值（洗点按这个退，不按现价） */
    failBonus: 0,                                        /* 失败累积的成功率加成：+5%/次，上限 +30% */
    guardMirror: 0,                                      /* 护心镜：突破失败时返还 50% 已扣修为（被动） */
    guardArray: 0,                                       /* 护道阵法：突破时使用，本次基础成功率 +15% */
    tianji: 0,                                           /* 天机令：下一次突破必定 100% 成功 */
    shop: { week: '', heart_mirror: 0, guard_array: 0, tianjiTier: -1 },  /* 天机阁：周限购计数 + 天机令已兑境界段 */
    herb100: 0,                                          /* 百年灵草：极品破境丹材料（探索/秘境产出） */
    herb10000: 0,                                        /* 万年灵草：极品/大乘破境丹材料（高阶产出） */
    acts: { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 },     /* 今日已用行动次数 */
    actDay: '',                                          /* 行动次数对应日期，跨天重置 */
    /* 坊市（每日货架 + 寄售行情） */
    market: { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 },
    /* 论剑台（每日挑战 + 段位） */
    arena: { day: '', left: 0, foes: [], tier: 0, win: 0, lose: 0, rep: 0, proxyDay: '' },
    /* 限时活动：七日签到（断签重置）+ 仙盟争霸（7 天赛季，战功换强化材料） */
    sign: { days: 0, last: '' },
    /* 每日任务奖励的「已入账登录状态」（D-006 J-1）：形如 'sit@2026-11-08'。
       作用：把「发了多少奖」和「这笔奖发过没有」写在**同一次主存档写入**里，
       这样"标记已落盘、奖励还没入账就崩了"能被下次启动识别并补发，且补发不会重复
       （详见 js/daily.js 的 pending / recoverPending）。只留最近 40 条，够跨很久的补发窗口。 */
    dailyApplied: [],
    union: { start: 0, day: '', left: 0, merit: 0, claimed: [], season: 1 },
    /* 山门 · 弟子（第 61 节）：lv=品阶 0~5（0=未立山门）；disciples 是山门名册
       [{id, name, apt 1~5, task ''|seclude|herb|patrol, t0 出发时间戳, ret 回山时间, svc 已做差事数,
         last 上回做完的差事, run 连着几趟做同一件事}]
       grad = 出师人数（第 62 节）：每出师一人，门风 +2% 差事收益，至多十人 */
    gate: { lv: 0, disciples: [], grad: 0 },
    /* P2 宗门协力 Boss（拍板 B：总血量 = 成员战力总和 ×20；周一 08:00 重置） */
    coopBoss: { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 },
    /* P2 灵潮（周六 20:00–20:15；进场后每 20 秒一杀，30 杀封顶） */
    lingchao: { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 },
    /* batch5：已弹过的功能解锁插屏 id（不重复弹；老档见 load 种子） */
    unlocks: [],
    /* batch5：图纸定向锻造（一次性图纸计数）＋天机阁每周自选图 */
    blueprints: {},
    bpShop: { week: '', bought: 0 },
    /* 山门议事（第 103 轮）：每日一条议题三选一。n = 已议过几条（决定今天轮到哪条议题，
       只增不减），last = 上一条的结论文本（议事页与日志各留一处） */
    council: { day: '', n: 0, last: '' },
    /* 入门八事（第 105 轮）：第一局的手把手路线，i = 已了的事数（0~8，8 = 全了）。
       只记进度不记账——八件事的达成条件全部读现成字段（stats / rank / towerMax / cave…），
       不再另存一套"做过没做过"，免得两处说法打架。 */
    trail: { i: 0 },
    /* 道途（第 106 轮）：八事之后接手的长线目标，i = 已过几程（0~12，12 = 全了）。
       与 trail 同一口径：只记进度，达成条件读现成字段（rank / towerMax / gate / dt / wu…）。 */
    trail2: { i: 0 },
    /* 轮回之途（第 107 轮）：第二世起的三关（重修 → 照心魔 → 逾过前世）。
       gen = 这张纸签属于第几世；换世时整张重走 —— 十二程讲的是"一世怎么走完"，
       同一套表不能拿去量第二世（塔、洞天、山门都是跨世保留的，会一帧连发十二笔）。 */
    trail3: { i: 0, gen: 0 },
    /* 洞天开辟（第 70 节）：五方洞天各 0~3 重；dtMain = 奉为主洞的那一座（效果 ×1.5） */
    dt: { qing: 0, zhu: 0, su: 0, xuan: 0, huang: 0 },
    dtMain: '',
    /* 秘境副本（章节 → 层，每日扫荡一次；第 10 层守关妖王掉 Boss 稀有材料） */
    /* 随机奇遇：挂机每 60 秒按概率刷出一个气泡，点开选选项结算（enc.t=上次判定时间戳，bubble={id,t0} 待处理）
       encBuff = 奇遇给的临时修炼倍率 { mult, until }，与丹药 buff 独立叠加
       seen = 阶段四 C4-1（D8 批准的唯一新增存档字段）：{奇遇id: 当日 S.day.key}，同一自然日不重复 */
    enc: { t: 0, bubble: null, lastId: '', seen: {} },
    encBuff: { mult: 0, until: 0 },
    secret: { prog: [0, 0, 0, 0], day: '', swept: 0 },
    /* 寿元（第 96 轮）：age 单位是「游戏年」，on=false 表示这一档没开寿元（老档默认不开，玩家自己点）
       zuo = 坐化时间戳，0 表示还活着；坐化后一切收益停摆，只能转世
       brk = 这一世突破了几次（第 97 轮：坐化结算卡要用，转世归零） */
    life: { age: 0, on: true, brk: 0 },
    zuo: 0,
    /* 道统世系：gens = 已转世几世，relic = 上一世留下的遗物（法宝 id）
       hist = 历代世系（第 97 轮）：{ gen, rank, age, relic }，只留最近 12 世
       pick = 坐化时玩家从三件遗物里挑中的那件（还没转世，先记在这儿） */
    legacy: { gens: 0, relic: null, hist: [], pick: null },
    /* 心魔照镜（第 99 轮）：心魔 = 上一世的你
       gen/rank/age/brk/pow = 上一世死时的世数、境界、享年、突破次数、战力（记下来就不再变）
       wins = 照镜胜场（跨世累计，修炼加成封顶 5 胜）
       done = 这一世照过没有（赢下才算，每世一次；转世归零）
       calm / calmStep = 守心三息里守住几息、走到了第几息（第 104 轮；每世重来） */
    mirror: { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 },
    /* 沈碑 NPC（识人 · 守碑老吏，第 108 轮）：纯信息+情感，零数值产出。
       met=是否见过；rel=态度 -100..100；stage=故事档 0..3；seenGens=已同步的转世代数
       lastSeen=最后见面时间戳(0=从未见过)；nudgeAt=久未见面浮片冷却；heard=已讲话题 id(≤6)
       choice=重要选择(跨世回响)；cur=本世经历(转世清空一次)
       派生(不落档)：maxRank=Math.max(S.rank, …hist.rank)；pastGen/pastRank 读 legacy.hist[0] */
    npcs: { stele: { met: 0, rel: 0, stage: 0, seenGens: 0, lastSeen: 0, nudgeAt: 0,
                     heard: [], told: [], keyLogged: [], lastTower: 0,
                        trust: 0, coldUntil: 0, quest: null,
                        attitude: { open: 0, guarded: 0, rude: 0, cost: 0 },
                        events: [], state: { kind: 'in', until: 0 }, lastDecayAt: 0,
                     choice: { listened: 0, showoff: 0, promise: 0 },
                     cur: { lastRank: 0, talk: 0, promptTale: 0 } },
            /* 崔九（守塔老卒，第 113 轮；第 5 阶段接入框架）：7 个新字段已批（P1–P10 / 补充批复），
               不含 lastTower——塔纪录沿用既有 congrats_max 搭话（js/game.js:11619）。 */
            cuijiu: { met: 0, rel: 0, stage: 0, lastSeen: 0, heard: [],
                      coldUntil: 0, attitude: { open: 0, guarded: 0, rude: 0 },
                      events: [], state: { kind: 'in', until: 0 },
                      lastDecayAt: 0, seenGens: 0,
                      quest: null,
                      choice: { climb: 0, chat: 0, listen: 0 },
                      cur: { talk: 0 } } },
    /* 记忆 NPC 框架第一步（F-3）：主动触发日额度，全局一份（制作人批 Q-1 甲）。
       day 与 S.day.key 相同才算「今日已用」；跨天由判定自然失效，写回时换 day 并清零。 */
    npcAct: { day: '', n: 0 },
    /* W1「塔底」（第 109 轮）：世界事件的唯一真值。
       '' 未发现 · 'dug' 已俯身等契机 · 'open'/'self'/'seal' 三条终态（不可逆）。
       塔页与识人页的回响一律由它现算派生，不在别处再存一份事实。 */
    worldFoot: '',
    /* 阶段一（路3，2026-11-14）：W1 修 B 的当日主动修为计数 + 突破闭关闸门。
       day.key = 本地自然日（跨天由 ensureDay 重置）；secludeUntil = 大境界突破后的闭关终点
       （墙钟毫秒，0 = 无闸）。两者都随主存档落盘，读档侧见 load() 的同名迁移段。 */
    day: { key: '', expGain: 0, sweepExp: 0, dec: { res: 0, risk: 0, grow: 0, social: 0 } },
    secludeUntil: 0 };
  let inited = false, timer = 0, upsBuilt = false, lastSave = 0;
  /* D 阶段 · 渲染节流状态（集群1 吞点击缓解 · 第一阶段，零行为回归）：
     周期性 500ms 渲染改为「状态签名变化才重建」+ 1 秒兜底；
     任何 handler 内的直接 render() 调用保持即时，不被本门控影响。 */
  let uiSig = '', uiIdleTicks = 0, uiSigErr = false, asyncDirty = false;

  /* 心魔照镜（第 99 轮）：每赢一场 +2% 修炼，最多算 5 场（+10%）。
     与道统（每世 +10%）同量级但各算一路：一个是"转了几世"，一个是"赢过几次自己"。 */
  const MIRROR = { winK: 0.02, winCap: 5 };

  /* ============ 统一数值基准（所有数字都从这里出，调数值只改这一处） ============ */
  /* 设计主线：境界需求 need = need0 × needG^层 是唯一的主曲线，
     其余（修炼速度/灵石/升级消耗/寻宝）全部锚定到它，保证不后期崩盘。 */
  const BAL = {
    need0: 40,      needG: 1.85,        // 境界需求 = 40 × 1.85^层（每层约 ×1.85）
    v0: 1.6,        rankH: 1.18,        // 挂机速度 = 1.6 × 灵根 × 1.18^层（境界加成，每突破 +18%）
    /* 阶段二 N2：r18–24 挂机被动乘区（只作用 tick/离线，不影响打坐/参悟/历练等主动产出）。
       解决「层需求涨 1.85×、被动只涨 1.18×」的后期独木难支；主动被动占比由 W1 预算锚定。 */
    latePassive: Object.freeze([1.15, 1.30, 1.50, 1.70, 2.00, 2.40, 2.90]),
    stone0: 0.5,    stoneRankH: 1.48,   // 灵石产出 = 0.5 × 1.48^层 × 洞府加成（指数增长；但 1.48 远低于物价曲线 1.85 → 境界越高越缺钱）
    caveR: 1.06,    caveMax: 20,        // 洞府：灵石 ×1.06/级，20 级封顶
    danR: 2.0,                          // 炼丹房：突破成功率 +2%/级（10 级满 +20%；炼制加成见 CRAFT.ratePerLv）
    fieldPer: 2,    fieldMax: 30,       // 灵田：每级每分钟自动凝 2 灵石，30 级封顶（灵草改走种田闭环）
    plotCap: 9,                          // 灵田田块上限（3×3）：田块数 = min(灵田等级, 上限)
    plotYieldLv: 0.02,                   // 灵田每级收获产量 +2%（等级超出田块上限后的成长线）
    minePer: 1,     mineMax: 30,         // 矿脉：每级每分钟 1 块矿石，30 级封顶
    /* 升级/寻宝消耗锚定「当前层需求」：cost = need × K × R^级，让灵石经济与修为同涨 */
    caveK: 0.18,    caveCostR: 1.30,
    fieldK: 0.20,   fieldCostR: 1.15,   // 灵田消耗曲线调缓（级数从 12 → 30）
    mineK: 0.20,    mineCostR: 1.15,    // 矿脉消耗（与灵田对齐）
    treasureK: 0.5,                    // 探索 = 当前层需求 × 0.5（出材料，随境界变贵）
    daoExp: 0.45,   daoStone: 0.2,     // 道韵对修炼/灵石的加成
    /* ---- 寿元 / 转世（第 96 轮）----
       全部寿元手感只由 lifeYearSec 一个旋钮决定：1 游戏年 = 多少真实秒。
       调这一格就等于同时调「一世多长」「离线一次烧掉几年」，别处不再散参数。
       5 分钟/年 × 炼气 120 年 = 一世 10 小时真实游玩（含离线结算），刚好一个放置游戏的赛季长度。 */
    lifeYearSec: 4320,                 // 1 游戏年 = 4320 秒（72 分钟）。阶段一 P1：路 3 到飞升需 136 天，原 300 秒/年下一世只活 45 天；制作人已批改为 4320
    lifeLow: 0.15,                     // 剩余不足 15% → 顶栏寿元 chip 转朱砂告急
    legacyExp: 0.10,                   // 每转世一世，永久 +10% 修炼速度（道统）
    legacyRelic: 1,                    // 转世时可带走的遗物件数（骨架期只带最强的一件）
    /* 突破概率：段表 BREAK_TIERS 写死各境界基础概率（调数值只改那张表），
       各种加成「加算」，硬上限 breakMax、下限 breakMin；
       阶段二 N1：原始加算值先过「软膝」0.85 + (raw-0.85)×0.15，再夹 [breakMin, breakMax]，
       避免满配后概率贴顶、边际收益归零（软膝函数见 breakChanceFinal）；
       保底：顿悟进度满 100 / 天机令 → 必定成功（见 WISDOM / BREAK_GUARDS / SHOP_CFG） */
    breakBase: 0.85, breakMin: 0.05, breakMax: 0.98,
    breakLossCapDays: 1.092,           // 阶段二 N3：失败反噬最多扣「被动 1.092 天」的修为（护心镜再减半）
    daoBreak: 0.02,                    // 道韵 +2%/点 突破成功率
    pillBreak: 0.15, pillDur: 600,     // 丹药突破 buff：最多 +15%，持续 10 分钟
    /* 每日行动次数上限（对齐一念逍遥：主动操作限次，后续靠挂机）
       第 106 轮修正：原值 10/15/10/5/3 配上 8~90 秒的冷却，打坐 10 次只够点 80 秒、
       五个按钮在第一局 5 分钟内全部变灰 —— 那不是"限次"，是"没得玩"。
       现在按"第一节能点二十来分钟、后期一天也点得完"给量；单次产出一个数没动。 */
    actLimit: { sit: 30, herb: 30, train: 12, enlight: 6, ponder: 4 },
    /* 参悟（2026-10-25 第 58 节）：把富余灵石烧成修为，给后期一个"手里有钱就能做的事"。
       定价锚定「这一下花掉这一层灵石收入的 ponderCostK」——锚的是**收入的占比**，
       不是绝对数值、也不是当前层需求：后两者会让同一个按钮在第 1 层和第 24 层的相对价格差四位数
       （洗练的 5000 灵石固定价就是这么废掉的）。这样它在任何境界"贵得一样"。 */
    ponderPct: 0.03,      // [PLACEHOLDER] 一次换 当前层需求 × 3%
    ponderCostK: 0.08,    // [PLACEHOLDER] 一次花 一层灵石收入 × 8%
    /* ============================================================
     * 山门 · 弟子（2026-10-25 第 61 节）：后期"钱没处花、上线没事做"的第二个补口。
     *   为什么还是灵石：后期唯一过剩又无上限出口的资源就是它（第 58 节已论证）；
     *     洞府/灵田/矿脉有等级顶、强化被 Boss 材料卡、洗练固定价等于免费——山门是纯灵石 sink。
     *   为什么不新增货币：三种差事产的全是既有资源（修为 / 灵草 / 矿石 / 悟道值），
     *     一个系统不该为了"看起来新"再造一种钱。
     *   定价锚：开山/升品阶/收徒一律锚「一层灵石收入」的占比（与参悟同一口径），
     *     所以第 1 层和第 24 层"贵得一样"；绝不锚绝对数值或当前层需求。
     *   筑基（9）之后才开放：早期灵石要留给洞府，别让山门抢饭碗。
     * ============================================================ */
    gateUnlock: 9,          // 开山立派所需境界（筑基）
    gateMaxLv: 5,           // 山门品阶 1~5（五品 → 一品）
    gateCapBase: 2, gateCapPer: 2,          // 弟子上限 = 2 + 品阶×2 → 4/6/8/10/12
    gateBuildK: 1.0,                        // 开山立派 = 一层灵石收入 × 1.0
    gateLvK: 0.6, gateLvR: 1.5,             // 升品阶 = 一层收入 × 0.6 × 1.5^(品阶-1)；升满约 5 层收入
    gateRecruitK: 0.3, gateRecruitR: 0.12,  // 收徒 = 一层收入 × 0.3 × (1 + 0.12×现有弟子数)；收满约 6 层收入
    gateYieldPer: 0.10,                     // 品阶加成：差事收益 +10%/品阶（一品 +50%）
    gateSecludeK: 0.02,     // [PLACEHOLDER] 闭关 4h = 自己修炼速度 × 4h × 2% ×(资质/3)
    gateHerbBase: 6,  gateHerbApt: 4,       // 采药 2h：灵草 = 6 + 资质×4（×品阶系数）
    gateHerb100Rank: 10,                    // 采药额外带一株百年灵草（灵田 10 级之后才用得上）
    gateOreBase: 10,  gateOreApt: 5,        // 巡山 6h：矿石 = 10 + 资质×5
    gateWisBase: 8,   gateWisApt: 4,        // 巡山 6h：悟道值 = 8 + 资质×4（小额，不动天机阁的定价）
    /* 弟子成长（2026-10-25 第 62 节）：把"抽到天阶"变成"养出天阶"
       —— 点化改写资质，出师换一个空位与一条永久门风。两个都锚一层收入，与层数无关。 */
    gateAptK: 0.12,                         // 点化一档 = 一层收入 × 0.12（凡骨→天阶共 0.48 层）
    gateGradSvc: 6,                         // 出师门槛：满六趟差事（闭关 4h ×6 = 24h，采药 2h ×6 = 12h）
    gateGradK: 0.20,                        // 出师回馈 = 一层收入 × 0.20 × (资质/3) → 0.07~0.33 层
    gateFengPer: 0.02, gateFengCap: 10,     // 门风：每出师一人差事收益 +2%，至多十人（+20%）
    /* 法宝（武器）修炼速度加成，按品质：0无 1下品 2中品 3上品 4极品 */
    weaponMult: [1.0, 1.05, 1.10, 1.20, 1.35, 1.44, 1.53, 1.63, 1.73, 1.85],
    /* 灵兽（一念逍遥式养成）：猎妖掉蛋 → 孵化 → 喂养升级 → 出战加战力 */
    petHatchK: 0.5,       // 孵化灵石 = 当前层需求 × 0.5
    petSlotCost: [1.5, 5], // 第 2 / 3 个灵兽槽 = 需求 × 1.5 / 5
    petFeedHerb: 5,       // 每次喂食灵草
    petFeedStoneK: 0.1,   // （阶段二 N6 起废弃）旧动态喂食灵石系数，保留字段不再读取；新固定表见 petFeedStone()
    petExpPerFeed: 15,    // 每次喂食 +15 经验
    petExpBase: 20,       // 升到下一级所需经验 = 20 × 当前等级
    petMaxLv: 30,         // 灵兽满级 30
    petPowerRate: 0.2,    // （阶段二 N7 起废弃）旧统一灵兽战力系数，保留字段不再读取；新分档见 PET_RATE
    petMaxSlots: 3,       // 最多 3 只出战灵兽
    petEggMax: 20,        // 蛋最多囤 20 枚，防无限积压
    /* 镇妖塔：无限层爬塔，战力够了自动通关，每日可扫荡已通层拿挂机收益 */
    towerBase: 20 * POW_K,   // 第 1 层守卫战力（×POW_K = 2000，跟随全局战力刻度）
    towerG: 1.35,         // 每层战力 ×1.35
    towerSweepRatio: 0.6, // 扫荡收益 = 各层首通奖励 × 0.6
    /* 坊市：每日货架 + 寄售行情（价格一律锚定境界需求，防后期通胀失控） */
    marketSlots: 6,       // 每日货架商品位数
    marketRefreshK: 0.6,  // 手动刷新货架 = 需求 × 0.6 灵石（每日免费 1 次）
    marketSellMax: 20,    // 每日寄售额度（超出后坊市压价）
    marketSellDown: 0.5,  // 超额后的压价系数
    /* 法宝强化（对标一念逍遥的装备养成：强化 +N、洗练词条，吃 Boss 稀有材料） */
    enhanceMax: 20,       // 强化上限 +20
    enhanceExpRate: 0.03, // 每级 +3% 修炼速度
    enhancePowRate: 0.05, // 每级 +5% 战力
    enhanceOreBase: 10,   // 强化矿石 = 10 + 5 × 当前级
    enhanceOreStep: 5,
    enhanceStoneK: 0.3,   // 强化灵石 = 需求 × 0.3 × 1.25^级
    enhanceStoneR: 1.25,
    enhanceFailPer: 0.03, // 每级成功率 -3%
    enhanceMinChance: 0.55,
    enhanceBlessMax: 5,   // 连败 5 次后必成（祝福值，护肝）
    enhanceMatFrom: 5,    // +5 起要 Boss 稀有材料
    baseCritRate: 0.08,   /* 基础暴击率 8%，洗练暴击率词条在此基础上加 */
    /* 洗练消耗已固定为 RR_COST=5000 灵石（见洗练弹窗块），不再按境界取价、不消耗材料 */
    /* 秘境副本：章节式多层副本，与镇妖塔的无限爬塔区分开 */
    secretFloors: 10,     // 每章 10 层
    secretSweepRatio: 0.6, // 扫荡收益比例
    /* 论剑台（每日挑战道友榜，胜负按战力 + 临场发挥，声望换资源） */
    arenaDaily: 5,        // 每日挑战次数
    arenaFoes: 6,         // 每日对手数量
    arenaWinStoneK: 0.8,  // 胜：灵石 = 需求 × 0.8
    arenaLoseStoneK: 0.2, // 负：灵石 = 需求 × 0.2
    arenaWinRep: 10,      // 胜：声望 +10
    arenaLoseRep: 3,      // 负：声望 +3
    arenaProxyStoneK: 0.6, // batch5：雇人代打价格 = 当前一层需求 ×0.6（每日限 1 场，占今日出战）
    /* 限时活动：七日签到（断签重置）+ 仙盟争霸（7 天赛季，战功换强化材料） */
    unionDays: 7,         // 一个赛季 7 天
    unionWinMerit: 60,    // 出战胜：战功 +60 上下
    unionLoseMerit: 20    // 出战负：战功 +20
  };
  /* 猎妖掉蛋概率（按品阶：越高阶越难掉，Boss 首通必掉） */
  const EGG_RATE = { 1: 0.10, 2: 0.06, 3: 0.03, 4: 0.015, 5: 0.008 };

  /* ============================================================
   * 全局突破与丹药辅助生态（贯穿全境界，防后期概率太低卡死退坑）
   * 调数值只改这三张表，不碰逻辑
   * ============================================================ */
  /* 1. 境界段突破表：基础概率 / 失败扣修为比例 / 该段对应丹药 / 丹药加成
        rank 区间对应 RANK_NAMES：0-8 炼气 / 9-11 筑基 / 12-14 金丹 / 15-17 元婴
        / 18-20 化神 / 21 炼虚 / 22 合体 / 23 大乘 / 24 渡劫 / 25 飞升 */
  const BREAK_TIERS = [
    { name:'炼气期', from:0,  to:8,  base:0.90, lose:0.25, pill:'dan1', pillBonus:0.10 },
    { name:'筑基期', from:9,  to:11, base:0.75, lose:0.30, pill:'dan2', pillBonus:0.15 },
    { name:'金丹期', from:12, to:14, base:0.62, lose:0.35, pill:'dan2', pillBonus:0.15 },
    { name:'元婴期', from:15, to:17, base:0.45, lose:0.40, pill:'dan3', pillBonus:0.22 },
    { name:'化神期', from:18, to:20, base:0.32, lose:0.45, pill:'dan3', pillBonus:0.22 },
    { name:'炼虚境', from:21, to:21, base:0.22, lose:0.50, pill:'dan4', pillBonus:0.30 },
    { name:'合体境', from:22, to:22, base:0.16, lose:0.50, pill:'dan4', pillBonus:0.30 },
    { name:'大乘境', from:23, to:23, base:0.10, lose:0.55, pill:'dan5', pillBonus:0.35 },
    { name:'渡劫期', from:24, to:24, base:0.07, lose:0.60, pill:'dan5', pillBonus:0.35 }
  ];
  /* 阶段一（路3，2026-11-14 制作人已批）：突破日历闸门。
     只挂跨大境界那一次（9 个 gate，含 24→25 进入飞升）；16 次段内小境界突破不设闸。
     BREAK_GATES[i] = 突破前的 rank；BREAK_CD[i] = 该次成功后须闭关的小时数（0 = 不设闸）。
     secludeUntil = 成功时刻 + 本段 CD；突破失败不触发、不延长；墙钟时间，离线照常流逝。 */
  const BREAK_GATES = [8, 11, 14, 17, 20, 21, 22, 23, 24];
  const BREAK_CD = [96, 336, 672, 156, 156, 288, 552, 1008, 0];
  function gateCdMs(rankBefore){
    const i = BREAK_GATES.indexOf(rankBefore | 0);
    return i >= 0 ? BREAK_CD[i] * 3600 * 1000 : 0;
  }
  /* 闸门时刻是墙钟毫秒（≈1.79e12），绝不能用 `| 0` 读 —— 那会截成 int32，判定恒为「已出关」。
     secludeTs 取安全时间戳，secludeLeftMs 给剩余毫秒（负数/NaN/字符串一律按 0）。 */
  const secludeTs = () => { const t = Number(S.secludeUntil); return (isFinite(t) && t > 0) ? t : 0; };
  const secludeLeftMs = () => Math.max(0, secludeTs() - Date.now());
  /* A2（2026-11-20）：闭关锁只锁「下一次大境界突破」；小境界、修炼、产出不受影响。
     所有可突破/攒满类文案与按钮态统一从这里取口径（CD 与 secludeUntil 生成逻辑一字不动）。 */
  const gateLockNote = () => '闭关中 · 余 ' + fmtCd(secludeLeftMs()) + '（大境界突破后须闭关稳固，小境界不受影响）';
  function gateGoals(){
    const out = [];
    try { const next = (S.towerMax | 0) + 1; if(next <= 100) out.push('镇妖塔第 ' + next + ' 层'); } catch (e) {}
    try { out.push((S.field | 0) < 3 ? '灵田开垦' : '灵田收一茬'); } catch (e) {}
    try { if(typeof bldLevel === 'function' && bldLevel('alchemy') >= 1) out.push('炼丹房开一炉'); } catch (e) {}
    try { if(typeof bldLevel === 'function' && bldLevel('forge') >= 1) out.push('炼器坊打一件'); } catch (e) {}
    try { out.push((S.npcs && S.npcs.stele && S.npcs.stele.met) ? '去后山陪沈碑坐坐' : '去后山认认沈碑'); } catch (e) {}
    return out.slice(0, 3);
  }
  /* 阶段一（路3）W1 修 B：每日主动修为预算（100% 线）。只作用主动来源，被动 tick / 离线不设顶。
     100% 线 = 日常五源满产 + 塔藏宝室 10 局/日（数值落点表 §3.2 B-1，按 BREAK_TIERS 段序）。 */
  const ACTIVE_BUDGET = [35933, 159854, 877239, 5274646, 33247560, 61507947, 113789656, 210510807, 389444943];
  /* 阶段一（路3）W4 转世印记：中档 +2% 修为速率 / +1% 突破成功率；与 daoBreak 合并封顶 +8%。 */
  const IMPRINT = { expPerGen: 0.02, expCap: 0.20, breakPerGen: 0.01, breakCap: 0.08 };
  /* 2. 悟道体系：拆成「顿悟进度 insight」与「悟道值 wisdom（货币）」两条独立轨
        - insight 0~100：突破失败累积，满则下次必定顿悟，顿悟后清零（原保底手感）
        - wisdom 无上限：天机阁兑换货币；产出与价格共用境界系数（通胀同步）
        悟道值获取途径仅三条：突破失败 / 每日签到 / 任务领奖（全部走 wisdomGain 入口） */
  const WISDOM = {
    perFail: 5,          /* 每次突破失败 → 顿悟进度 +5 */
    failStep: 0.05,      /* 每次突破失败 → 下次成功率 +5% */
    failCap: 0.30,       /* 失败加成上限 +30% */
    full: 100,           /* 顿悟进度满 100 → 下次突破必定成功 */
    wisdomPerFail: 5,    /* 突破失败 → 悟道值 +5（×境界系数） */
    wisdomSign: 100,     /* 每日签到 → 悟道值 +100（×境界系数） */
    wisdomSit: 50,       /* 阶段二 N5：每日首次打坐 → 悟道值 +50（×境界系数） */
    wisdomQuest: 50      /* 任务领奖 → 悟道值 +50（×境界系数） */
  };
  /* ============================================================
   * 悟道树（2026-10-25 第 59 节）：把"悟道值"这个已有货币再开一个出口。
   *   为什么用悟道值而不是新开一种：它现在只有一个去向（天机阁换保底道具，3000×1.15^境界），
   *   等于"攒二十天换一次保底"。给它第二个去处，玩家每次看着余额就得做一次取舍：
   *   换一枚天机令（一次救命），还是点一层树（长期收益）。**这就是这个系统唯一的决策。**
   *   五层（第 68 节扩层）：单路点满 12400×境界系数 ≈ 4 枚天机令，三路全满约 12 枚——
   *   正常一局（约 40 天）只够专精一到两路，取舍从"先点哪路"变成"这局走哪条道"。
   *   扩层只是把三路原有的同类加成延长，没有新增任何"加速"机制：
   *   不缩短参悟冷却、不跳时间、不翻倍产出；1.568×/层 的结构斜率一点没动。
   *   加成刻意做小（修炼 +28% / 灵石 +42% / 战力 +52%）：它们只负责让"每天多看一眼"有回报。
   * ============================================================ */
  /* icon 存图片路径而非字符：水墨单色是视觉红线，系统 emoji 是全彩的，混在一起会破风格 */
  const WU_TREE = {
    sword: { name:'锋芒', icon:'ui/icons/ic_swords.png', desc:'战力', unit:'%',
      pct:[8, 8, 10, 12, 14], name3:['见锋','藏锋','无锋','忘剑','无我'],
      txt:['看破招式之前，先看清自己出手的力气。','锋芒不必外露，落在该落的地方就够。','手中无剑，剑在眼里。','招式都忘了，剩下的才是自己的。','到最后，连出剑的人也不见了。'] },
    dan:   { name:'归一', icon:'ui/icons/ic_taiji.png', desc:'修炼速度', unit:'%',
      pct:[4, 4, 6, 6, 8], name3:['入定','忘言','归一','坐忘','无息'],
      txt:['坐得住，比坐得久更难。','话少了，杂念也少了。','万法归一，一归何处。','忘了时辰，忘了自己，只剩一口气在走。','一口气也不必有了，天地替你呼吸。'] },
    array: { name:'地脉', icon:'ui/icons/ic_river.png', desc:'灵石产出', unit:'%',
      pct:[6, 6, 8, 10, 12], name3:['引脉','蓄势','伏流','归墟','山河'],
      txt:['山里有水，水里有气，气里有你要的东西。','不急着取，先让它积着。','地表看不见的，才是真正在流的。','水走到尽头，会回到山里去。','整座山的呼吸，都算你的。'] }
  };
  const WU_MAX = 5;
  /* 价 = 基础价 × 境界系数。后两层继续按"每 1% 越来越贵"定：
     剑 50→125→250→292→357 / 归一 100→250→417→583→625 / 地脉 67→167→313→350→417 */
  /* 悟道节点成本：首层 2026-11-19 制作人批 400→200。
     对账：线上试玩「需 459」= floor(400 × 1.15^1)（炼气二层；浮点 459.999… 取整），
     与公式一致，不是错位；每一层的价 = WU_COST[lv] × 1.15^当前境界。 */
  const WU_COST = [200, 1000, 2500, 3500, 5000];
  const WU_RESPEC_KEEP = 0.8;             /* 洗点返还 80%：点错要付两成学费，但不至于不敢试 */

  /* 3. 丹药分级（第 89 节扩到九枚）：
        tier = 品阶，仍是 1~5 的旧尺子，驱动丹师经验与旧档门槛，一格没动；
        seg  = 大境界段 1~9，这一轮的分级尺——「阶 = 段」。段 1/2/4/6/8 就是老五枚，
             段 3/5/7/9 是新补的四枚，同段新丹严格优于旧丹，旧丹一枚不会失效。
        低于当前境界段要求的破境丹无效（判定见 pillValid，比 seg 不比 tier）。 */
  const BREAK_PILLS = [
    { id:'dan1', name:'下品破境丹', tier:1, seg:1, bonus:0.10 },
    { id:'dan2', name:'中品破境丹', tier:2, seg:2, bonus:0.15 },
    { id:'dan_jindan', name:'九转金丹', tier:2, seg:3, bonus:0.18 },
    { id:'dan3', name:'上品破境丹', tier:3, seg:4, bonus:0.22 },
    { id:'dan_huashen', name:'紫霄还神丹', tier:3, seg:5, bonus:0.26 },
    { id:'dan4', name:'极品破境丹', tier:4, seg:6, bonus:0.30 },
    { id:'dan_heti', name:'归真丹', tier:4, seg:7, bonus:0.32 },
    { id:'dan5', name:'大乘破境丹', tier:5, seg:8, bonus:0.35 },
    { id:'dan_dujie', name:'九霄雷髓丹', tier:5, seg:9, bonus:0.40 }
  ];
  /* 4. 突破辅助道具：元数据（数值 / 限购 / 价格统一在 SHOP_CFG，避免两处漂移） */
  const BREAK_GUARDS = {
    heart_mirror: { name:'护心镜',   type:'shield',    desc:'突破失败时返还 50% 已扣除修为（被动触发，失败才消耗）' },
    guard_array:  { name:'护道阵法', type:'guard',     desc:'突破时使用，本次基础成功率固定 +15%（不与丹药叠加翻倍）' },
    tianji:       { name:'天机令',   type:'guarantee', desc:'下一次突破必定 100% 成功（每大境界限兑 1 次；不占背包格，持有数见本页，突破时勾选使用）' }
  };
  /* ============================================================
   * 5. 天机阁商品配置表（唯一数值入口：价格 / 限购 / 发放全读这张表）
   *    【定价与坊市彻底脱钩，两个维度】
   *    坊市（基础物资）  ：售价 = 当前境界需求 need × k（0.25~6），随物价水涨船高；
   *    天机阁（保底道具）：双扣制——灵石按「当前总资产比例」+ 悟道值按「大额基础价」，
   *      灵石价 = max(need × assetAnchor, 当前灵石 × assetRatio)，ratio 0.35~0.45：
   *        囤多少钱都一口榨走三到五成家当，从根上防「挂机两天亿万灵石、道具只卖几千」的通胀崩盘；
   *      悟道价 = baseWisdom × 1.15^境界（与悟道值产出同系数，但基础价大幅提高，必须省着花）。
   *    limit.type = 'week'     每周限购 n 次（周一 0 点为界）
   *               = 'rankTier' 每个大境界限 n 次（以该段起始境界为 key）
   * ============================================================ */
  const SHOP_CFG = {
    rankMul: rank => Math.pow(1.15, Math.max(0, Number(rank) | 0)),   /* rank25 ≈ 33 倍 */
    guardArrayBonus: 0.15,                                            /* 护道阵法固定 +15% */
    /* 保底道具灵石价 = 当前总灵石 × assetRatio（下限 need × assetAnchor，防一无所有时 1 灵石白嫖） */
    assetRatio:  { heart_mirror: 0.35, guard_array: 0.40, tianji: 0.45 },
    assetAnchor: { heart_mirror: 1.2,  guard_array: 2.0,  tianji: 3.0  },
    items: {
      heart_mirror: { name:'护心镜',   icon:'🛡️', baseWisdom:800,  limit:{ type:'week',     n:2 } },
      guard_array:  { name:'护道阵法', icon:'🌀', baseWisdom:1500, limit:{ type:'week',     n:1 } },
      tianji:       { name:'天机令',   icon:'🧿', baseWisdom:3000, limit:{ type:'rankTier', n:1 } }
    }
  };
  const breakTierOf   = rank => BREAK_TIERS.find(t => rank >= t.from && rank <= t.to) || BREAK_TIERS[BREAK_TIERS.length - 1];

  /* ---- 悟道树 ---- */
  const wuOf    = k => ((S.wu && S.wu[k]) | 0);
  const wuPaid  = k => ((S.wuPaid && S.wuPaid[k]) | 0);
  const wuPct   = k => {
    const t = WU_TREE[k]; if(!t) return 0;
    let n = 0;
    for(let i = 0; i < Math.min(wuOf(k), WU_MAX); i++) n += t.pct[i];
    return n;
  };
  const wuExpMult   = () => 1 + wuPct('dan')   / 100;
  const wuStoneMult = () => 1 + wuPct('array') / 100;
  const wuPowMult   = () => 1 + wuPct('sword') / 100;
  /* 价 = 基础价 × 境界系数（与天机阁同一口径，两边的购买力才可比） */
  const wuCostOf = k => {
    const lv = wuOf(k);
    if(lv >= WU_MAX) return 0;
    return Math.max(1, Math.floor(WU_COST[lv] * SHOP_CFG.rankMul(S.rank)));
  };
  function wuBuy(k){
    const t = WU_TREE[k];
    if(!t) return false;
    if(wuOf(k) >= WU_MAX){ log('「' + t.name + '」已悟尽。', 'gold'); return false; }
    const c = wuCostOf(k);
    if(moneyInt(S.wisdom) < c){ log('悟道值不足，「' + t.name + '」下一层要 ' + fmt(c) + ' 点。', 'bad'); return false; }
    S.wisdom = moneyInt(S.wisdom) - c;
    const lv = wuOf(k) + 1;
    S.wu[k] = lv;
    S.wuPaid[k] = wuPaid(k) + c;
    log('☯️ 悟道 · 「' + t.name3[lv - 1] + '」' + t.desc + ' +' + t.pct[lv - 1] + '%。' + t.txt[lv - 1], 'gold');
    sfx.win(); save(); render(); renderWu();
    return true;
  }
  function wuRespec(){
    const total = ['sword','dan','array'].reduce((a, k) => a + wuPaid(k), 0);
    if(!total){ log('还没点过悟道。', ''); return false; }
    const back = Math.floor(total * WU_RESPEC_KEEP);
    ['sword','dan','array'].forEach(k => { S.wu[k] = 0; S.wuPaid[k] = 0; });
    S.wisdom = moneyInt(S.wisdom) + back;
    log('🔄 洗去悟道，返还 ' + fmt(back) + ' 悟道值（两成散在风里）。', 'sys');
    save(); render(); renderWu();
    return true;
  }
  const breakPillMeta = id => BREAK_PILLS.find(p => p.id === id) || { tier:0, seg:0, bonus:0, name:'' };
  const guardMeta     = id => (SHOP_CFG.items[id] ? Object.assign({ id }, SHOP_CFG.items[id], BREAK_GUARDS[id] || {}) : null);

  /* ============ 角色（道号 / 性别 / 服装，向大型网游看齐） ============ */
  /* 服装配置：imgM / imgF 是人物立绘素材的路径（男/女各一张），留空则用内置 Q 版小人占位。
     素材放 ui/avatar/，建议命名 av_m_<服装id>.png / av_f_<服装id>.png，做好后我填上即可。 */
  const ROBES = [
    { id: 'qing', name: '青云道袍', color: '#4fc9ad', dark: '#2d7a68', imgM: '', imgF: '' },
    { id: 'bai',  name: '素白仙袍', color: '#e8ecf6', dark: '#9aa0b8', imgM: 'ui/avatar/av_m_bai.png', imgF: '' },
    { id: 'jin',  name: '金缕仙衣', color: '#e0bc6a', dark: '#a8843a', imgM: '', imgF: '' },
    { id: 'mo',   name: '玄墨道袍', color: '#6b7bd6', dark: '#3d4a9a', imgM: '', imgF: '' },
    { id: 'zhu',  name: '朱红战袍', color: '#e0786a', dark: '#a04a3a', imgM: '', imgF: '' }
  ];
  const robeOf = id => ROBES.find(r => r.id === id) || ROBES[0];
  /* 当前角色（或指定性别+服装）的自绘头像路径；空串 = 用内置 SVG 占位 */
  const avatarImg = (sex, robeId) => {
    const r = robeOf(robeId || S.robe);
    const s = sex || S.sex;
    return s === 'f' ? (r.imgF || '') : (r.imgM || '');
  };
  /* 内置 Q 版修仙者占位小人（性别换发型，服装换袍色）——用户自绘后自动被 avatarImg 覆盖 */
  function avatarSVG(sex, robeId){
    const r = robeOf(robeId);
    const hair = '#3a2a1a', skin = '#f2d7b4';
    const isF = sex === 'f';
    return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
      /* 身体（袍子） */
      '<path d="M30 55 L70 55 L78 94 L22 94 Z" fill="' + r.color + '" stroke="' + r.dark + '" stroke-width="2"/>' +
      /* 腰带 */
      '<rect x="26" y="70" width="48" height="6" rx="3" fill="#d4a94c"/>' +
      /* 领口 */
      '<path d="M42 55 L50 64 L58 55" fill="none" stroke="' + r.dark + '" stroke-width="2.5"/>' +
      /* 手臂 */
      '<path d="M30 58 L22 72 L30 70 Z" fill="' + r.color + '" stroke="' + r.dark + '" stroke-width="2"/>' +
      '<path d="M70 58 L78 72 L70 70 Z" fill="' + r.color + '" stroke="' + r.dark + '" stroke-width="2"/>' +
      /* 头 */
      '<circle cx="50" cy="36" r="16" fill="' + skin + '" stroke="' + r.dark + '" stroke-width="1.5"/>' +
      /* 发型 */
      (isF
        ? '<path d="M34 30 Q34 18 50 18 Q66 18 66 30 L66 40 Q58 34 50 34 Q42 34 34 40 Z" fill="' + hair + '"/>' +
          '<circle cx="34" cy="20" r="6" fill="' + hair + '"/><circle cx="66" cy="20" r="6" fill="' + hair + '"/>' +
          '<path d="M30 34 Q28 52 32 60" stroke="' + hair + '" stroke-width="4" fill="none" stroke-linecap="round"/>' +
          '<path d="M70 34 Q72 52 68 60" stroke="' + hair + '" stroke-width="4" fill="none" stroke-linecap="round"/>'
        : '<path d="M34 30 Q34 17 50 17 Q66 17 66 30 L66 38 Q58 32 50 32 Q42 32 34 38 Z" fill="' + hair + '"/>' +
          '<rect x="44" y="10" width="12" height="5" rx="2.5" fill="' + hair + '"/>' +
          '<circle cx="50" cy="8" r="4" fill="' + hair + '"/>') +
      /* 眼睛 */
      '<circle cx="43" cy="36" r="2" fill="#2a1a10"/><circle cx="57" cy="36" r="2" fill="#2a1a10"/>' +
      '</svg>';
  }

  /* 三种功法，按境界解锁、逐步进阶（越高级每级加成越高，体现成长） */
  const GONGS = [
    { id: 'gong1', name: '引气诀',   unlock: 0,  rate: 1.03, max: 10, costK: 0.15, costR: 1.30, img: 'ui/icons/gong1.png', desc: '炼气期基础功法' },
    { id: 'gong2', name: '凝神诀',   unlock: 9,  rate: 1.04, max: 10, costK: 0.18, costR: 1.32, img: 'ui/icons/gong2.png', desc: '筑基期进阶功法' },
    { id: 'gong3', name: '金丹大道', unlock: 12, rate: 1.05, max: 10, costK: 0.22, costR: 1.35, img: 'ui/icons/gong3.png', desc: '金丹期高级功法' }
  ];

  /* ============================================================
   * 生产建筑体系：炼丹房 / 炼器坊（Building + Recipe + Crafting）
   * 调数值只改这三张表，逻辑零硬编码
   * ============================================================ */
  /* 炼制通用规则：建筑每级 +2% 成功率、硬上限 95%、失败返还 30% 材料（灵石不退） */
  const CRAFT = { ratePerLv: 0.02, rateCap: 0.95, failRefund: 0.30 };

  /* 匠道修为（丹师 / 器师阶位）：一阶起步，成功炼制涨经验，攒够升阶。
     阶位加成炼制成功率，高阶配方另有阶位门槛（reqM）——建筑等级是硬件，匠道修为是手艺。 */
  const MASTERY = {
    expBase: 10,        // 每次炼制经验 = expBase × 配方品阶（tier）
    failKeep: 0.30,     // 失败也涨 30% 经验（失败乃成功之母，与材料返还同比例）
    perTierRate: 0.01,  // 每升一阶，该匠道所有炼制成功率 +1%
    max: 9              // 一阶起步，九阶圆满
  };
  /* 升阶经验需求表（下标 = 当前阶位 - 1）：×2.5 递增，升阶难度逐步加大、不轻易进阶
     1→2 需 100（约 10 炉下品丹）… 8→9 需 63000（约千炉高阶丹），累计逾十万 */
  const MASTERY_EXP = [100, 250, 650, 1600, 4000, 10000, 25000, 63000];

  /* 1. 建筑数据：等级 / 上限 / 升级消耗（灵石锚定境界需求 × K × R^级，基础材料随级数涨） */
  const BUILDINGS = {
    alchemy: {
      id: 'alchemy', name: '炼丹房', stateKey: 'dan', maxLevel: 10,
      icon: 'ui/icons/danlu.png', baseMat: 'herb',
      desc: '炼制破境丹之地。每级炼制成功率 +2%、突破成功率 +2%，并解锁更高阶丹方。',
      stoneK: 0.20, costR: 1.35,
      upgradeMats: lv => [{ t: 'herb', n: 25 + lv * 30 }]
    },
    forge: {
      id: 'forge', name: '炼器坊', stateKey: 'forge', maxLevel: 10,
      icon: 'ui/icons/weapon1.png', baseMat: 'ore',
      desc: '炼制法宝之地。每级炼制成功率 +2%，并解锁更高阶法宝图谱。',
      stoneK: 0.20, costR: 1.35,
      upgradeMats: lv => [{ t: 'ore', n: 20 + lv * 25 }]
    }
  };

  /* 2. 配方表：按建筑分组；reqLv = 解锁所需建筑等级；rate = 基础成功率；
     mats = 材料表（stone 走灵石，herb/ore/herb100/herb10000 走计数器，其余走背包）；
     stoneK 存在时灵石 = need × stoneK（法宝沿用「经济与修为同涨」），否则灵石写死在 mats 里。
     品阶门槛与突破系统对齐：dan3(元婴/化神)→炼丹房3级，dan4(炼虚/合体)→5级，dan5(大乘/渡劫)→7级；
     极品法宝→炼器坊5级。低等级产基础货过渡，高等级才能冲击大境界。 */
  const RECIPES = {
    /* ================= 炼丹房 ================= */
    dan1: { recipeId: 'dan1', bld: 'alchemy', name: '下品破境丹', tier: 1, reqLv: 1, rate: 0.90,
      out: 'dan1', img: 'ui/icons/dan1.png', cls: '',
      mats: [{ t: 'herb', n: 5 }, { t: 'stone', n: 20 }],
      note: '炼气期破境之用，亦可在突破前服食，小幅提升破境之机' },
    dan2: { recipeId: 'dan2', bld: 'alchemy', name: '中品破境丹', tier: 2, reqLv: 2, rate: 0.75,
      out: 'dan2', img: 'ui/icons/dan2.png', cls: 'good',
      mats: [{ t: 'herb', n: 15 }, { t: 'herb100', n: 1 }, { t: 'stone', n: 80 }],
      note: '筑基/金丹期破境之用，需百年灵草入药' },
    dan2_core: { recipeId: 'dan2_core', bld: 'alchemy', name: '中品破境丹 · 妖丹方', tier: 2, reqLv: 2, rate: 0.80,
      out: 'dan2', img: 'ui/icons/dan2.png', cls: 'good',
      mats: [{ t: 'herb', n: 5 }, { t: 'mat_core', n: 2 }, { t: 'stone', n: 20 }],
      note: '以妖丹代百年灵草，更省灵草，体现猎妖材料的价值' },
    dan3: { recipeId: 'dan3', bld: 'alchemy', name: '上品破境丹', tier: 3, reqLv: 3, reqM: 2, rate: 0.60,
      out: 'dan3', img: 'ui/icons/dan3.png', cls: 'gold',
      mats: [{ t: 'herb', n: 40 }, { t: 'herb100', n: 2 }, { t: 'stone', n: 300 }],
      note: '元婴/化神期破境之用，需百年灵草二株、丹师二阶' },
    dan4: { recipeId: 'dan4', bld: 'alchemy', name: '极品破境丹', tier: 4, reqLv: 5, reqM: 3, rate: 0.40,
      out: 'dan4', img: 'ui/icons/dan4.png', cls: 'gold',
      mats: [{ t: 'herb10000', n: 1 }, { t: 'mat_eye', n: 1 }, { t: 'stone', n: 2000 }],
      note: '炼虚/合体期破境专用，需炼丹房 5 级 + 丹师三阶，万年灵草 + 魔晶' },
    dan5: { recipeId: 'dan5', bld: 'alchemy', name: '大乘破境丹', tier: 5, reqLv: 7, reqM: 5, rate: 0.25,
      out: 'dan5', img: 'ui/icons/dan5.png', cls: 'gold',
      mats: [{ t: 'herb10000', n: 2 }, { t: 'boss_heart', n: 1 }, { t: 'stone', n: 8000 }],
      note: '大乘/渡劫期破境专用，需炼丹房 7 级 + 丹师五阶，万年灵草二株 + 九尾心' },
    /* ================= 炼器坊 ================= */
    wp1: { recipeId: 'wp1', bld: 'forge', name: '下品法宝', tier: 1, reqLv: 1, rate: 0.90,
      out: 'weapon', outLv: 1, mult: 1.05, img: 'ui/icons/weapon1.png',
      mats: [{ t: 'ore', n: 10 }, { t: 'stone', n: 40 }],
      note: '初出炼器之手的寻常法宝，装备后永久提升修炼速度' },
    wp2: { recipeId: 'wp2', bld: 'forge', name: '中品法宝', tier: 2, reqLv: 2, rate: 0.75,
      out: 'weapon', outLv: 2, mult: 1.10, img: 'ui/icons/weapon2.png',
      mats: [{ t: 'ore', n: 30 }, { t: 'stone', n: 120 }],
      note: '宝光内蕴，已能引天地灵气缓缓入体' },
    wp3: { recipeId: 'wp3', bld: 'forge', name: '上品法宝', tier: 3, reqLv: 3, reqM: 2, rate: 0.60,
      out: 'weapon', outLv: 3, mult: 1.20, img: 'ui/icons/weapon3.png',
      mats: [{ t: 'ore', n: 80 }, { t: 'stone', n: 300 }],
      note: '出炉时常有雷火淬炼之象，需器师二阶，器身隐有符文流转' },
    wp4: { recipeId: 'wp4', bld: 'forge', name: '极品法宝', tier: 4, reqLv: 5, reqM: 3, rate: 0.35,
      out: 'weapon', outLv: 4, mult: 1.35, img: 'ui/icons/weapon4.png',
      mats: [{ t: 'ore', n: 200 }, { t: 'boss_core', n: 1 }, { t: 'stone', n: 700 }],
      note: '炼成之日天地共鸣，需炼器坊 5 级 + 器师三阶 + 兽王精魄，元婴期老怪方能驾驭' }
  };

  /* ============================================================
   * 丹方旁支（第 69 节）：每张破境丹方炼够炉数，就参透一张旁方。
   *   同一枚丹药、同一成功率，只换材料——给兽骨/仙羽/蛟龙珠这些
   *   "只够卖钱"的辅材一个去处，也让老玩家在材料之间做一次选择。
   *   不新增产出、不动任何数值斜率；正方照旧是主线，旁方是第二条路。
   *   门槛随品阶递减（5/4/3/2/1）：一炉越贵，越少炉就该悟出来，
   *   否则顶级丹"炼五炉才参透"等于把收集目标定在没人到得了的地方。
   * ============================================================ */
  const DAN_VARIANTS = {
    dan1: { recipeId: 'dan1_alt', of: 'dan1', name: '下品破境丹 · 妖丹方', tier: 1, reqLv: 1, rate: 0.90, need: 5,
      out: 'dan1', img: 'ui/icons/dan1.png', cls: '',
      mats: [{ t: 'mat_core', n: 1 }, { t: 'stone', n: 20 }],
      note: '以妖丹代灵草，猎妖所得也能入炉' },
    dan2: { recipeId: 'dan2_alt', of: 'dan2', name: '中品破境丹 · 骨引方', tier: 2, reqLv: 2, rate: 0.75, need: 4,
      out: 'dan2', img: 'ui/icons/dan2.png', cls: 'good',
      mats: [{ t: 'herb', n: 10 }, { t: 'mat_bone', n: 2 }, { t: 'stone', n: 80 }],
      note: '兽骨为引，省下一株百年灵草' },
    dan3: { recipeId: 'dan3_alt', of: 'dan3', name: '上品破境丹 · 羽炼方', tier: 3, reqLv: 3, reqM: 2, rate: 0.60, need: 3,
      out: 'dan3', img: 'ui/icons/dan3.png', cls: 'gold',
      mats: [{ t: 'herb', n: 40 }, { t: 'mat_feather', n: 2 }, { t: 'stone', n: 300 }],
      note: '仙羽入药，两根金丹灵禽羽换两株百年灵草' },
    dan4: { recipeId: 'dan4_alt', of: 'dan4', name: '极品破境丹 · 珠还方', tier: 4, reqLv: 5, reqM: 3, rate: 0.40, need: 2,
      out: 'dan4', img: 'ui/icons/dan4.png', cls: 'gold',
      mats: [{ t: 'herb10000', n: 1 }, { t: 'boss_pearl', n: 2 }, { t: 'stone', n: 3000 }],
      note: '两枚蛟龙珠代魔晶，海底千年道行也是药引' },
    dan5: { recipeId: 'dan5_alt', of: 'dan5', name: '大乘破境丹 · 涅槃方', tier: 5, reqLv: 7, reqM: 5, rate: 0.25, need: 1,
      out: 'dan5', img: 'ui/icons/dan5.png', cls: 'gold',
      mats: [{ t: 'herb10000', n: 2 }, { t: 'boss_feather', n: 4 }, { t: 'stone', n: 8000 }],
      note: '四根朱雀羽代九尾心，火中涅槃，药性更烈' }
  };
  const DAN_VARIANT_LIST = Object.keys(DAN_VARIANTS).map(k => {
    DAN_VARIANTS[k].bld = 'alchemy';          /* 旁方与正方共用炼丹房 / 匠道门槛 */
    return DAN_VARIANTS[k];
  });
  const DAN_VARIANT_COUNT = DAN_VARIANT_LIST.length;
  const DAN_VARIANT_BY_ID = {};
  DAN_VARIANT_LIST.forEach(v => { DAN_VARIANT_BY_ID[v.recipeId] = v; });

  /* ============================================================
   * 丹药四族 × 九阶（第 89 节）
   *   「阶」= 大境界段（BREAK_TIERS 的 1..9），不是品阶。九段正好对上丹师九阶
   *   （MASTERY.max），所以 36 枚里没有一枚是「境界到了炼不出」或「炼出来没用」
   *   的死内容：破境族把金丹 / 化神 / 合体 / 渡劫四段的空档补齐，聚灵 / 淬体 /
   *   丰产三族各九阶，效果仍挂在四条本来就存在的钩子上，不新增结算系统：
   *     破境 → S.pillBonus + 一次性修为（老语义一字不改）
   *     聚灵 → S.danExp.mult  挂 expRate，与奇遇 encBuff 各自独立、互相叠乘
   *     淬体 → S.danPow.pct   挂 combatPower
   *     丰产 → S.danGain.pct  挂采药与矿脉产出
   *   老五枚（dan1..dan5）的 id / 名称 / 材料 / 成功率 / 服食收益都留在 RECIPES
   *   与 ITEMS 原处，本表只给它们补 fam 与 seg 两把尺，其余 31 枚按下表生成。
   *   调数值只改 DAN_CURVE / DAN_FX / DAN_MATS / DAN_ROWS 四张表，别处不写数字。
   * ============================================================ */
  const DAN_FAMS = ['po', 'jl', 'ct', 'fc'];
  const DAN_FAM = {
    po: { name: '破境', img: 'ui/icons/dan1.png',
          lead: '一次闭关之用：突破成功率 + 立得修为' },
    jl: { name: '聚灵', img: 'ui/icons/dan_jl.png',
          lead: '一段时间内修炼速度倍率（与奇遇、洞天叠乘）' },
    ct: { name: '淬体', img: 'ui/icons/dan_ct.png',
          lead: '一段时间内战力百分比（猎妖 / 论剑 / 秘境都吃这一档）' },
    fc: { name: '丰产', img: 'ui/icons/dan_fc.png',
          lead: '一段时间内采药与矿脉产出百分比' }
  };
  /* 阶 = 段：段位名与 BREAK_TIERS 同序，只用于文案，不参与判定 */
  const DAN_SEG_NAME = ['炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'];
  /* tier 仍只驱动丹师经验（gainMasteryExp 里 expBase × rec.tier），沿用旧的五档斜率，
     所以三阶丹与四阶丹给的经验一样多——加了品种，没动升阶速度。 */
  const DAN_CURVE = {
    tier:  [1, 2, 2, 3, 3, 4, 4, 5, 5],
    reqLv: [1, 2, 2, 3, 3, 5, 5, 7, 7],
    reqM:  [1, 1, 1, 2, 2, 3, 3, 5, 5],
    rate:  [0.90, 0.75, 0.68, 0.60, 0.50, 0.40, 0.32, 0.25, 0.18]
  };
  /* brk（作破境丹握在手中的加成）不在这里：它只写在 BREAK_PILLS 一处，下面倒推 */
  const DAN_FX = {
    po: { buff: [0.05, 0.10, 0.12, 0.15, 0.20, 0.30, 0.32, 0.35, 0.40],   /* = 旧 PILL_BUFF 五档 */
          exp:  [60, 300, 700, 1200, 3000, 6000, 15000, 30000, 60000] },  /* = 旧五档的 expRate()×秒数 */
    jl: { mult: [0.10, 0.14, 0.18, 0.24, 0.30, 0.36, 0.44, 0.52, 0.60] },
    ct: { pct:  [0.06, 0.09, 0.13, 0.18, 0.24, 0.30, 0.38, 0.46, 0.55] },
    fc: { pct:  [0.30, 0.40, 0.55, 0.70, 0.90, 1.10, 1.35, 1.60, 2.00] }
  };
  const DAN_STONE = [25, 100, 180, 350, 750, 2200, 4200, 8500, 16000];
  const DAN_MAIN = [                                                        /* 主药：六阶起换万年灵草，与旧方 dan4/dan5 同调 */
    [['herb', 8]], [['herb', 18]],
    [['herb', 28], ['herb100', 1]], [['herb', 45], ['herb100', 2]], [['herb', 70], ['herb100', 3]],
    [['herb10000', 1]], [['herb10000', 1], ['herb100', 6]],
    [['herb10000', 2]], [['herb10000', 3]]
  ];
  /* 三族招牌药引（sig 每阶都加、aux 是本族专属辅料），八阶起添一份 Boss 料 */
  const DAN_MATS = {
    jl: { sig: 'mat_core',    n: [1, 2, 3, 4, 6, 8, 12, 16, 24], boss: 'boss_pearl' },
    ct: { sig: 'mat_bone',    n: [2, 4, 6, 8, 12, 20, 24, 30, 40], boss: 'boss_core' },
    fc: { sig: 'mat_feather', n: [1, 1, 2, 2, 3, 4, 5, 6, 8], boss: 'boss_feather',
          aux: 'ore', auxN: [10, 25, 40, 60, 90, 150, 220, 300, 500] }
  };
  const DAN_BOSS_N = [0, 0, 0, 0, 0, 0, 0, 1, 2];
  const DAN_ROWS = {
    jl: [
      ['引气丹', '一阶聚灵，药力最浅，胜在便宜。服后行功，一个周天顶别半个周天。'],
      ['聚灵丹', '丹身有雾气绕着不散，凑近了能听见极细的风声。'],
      ['灵犀丹', '气有灵犀，心亦有灵犀。修道路上第一枚真正讲究「聚」字的丹。'],
      ['纳元丹', '纳元气于方寸之间。服下后行功，丹田里像有人替你扇风。'],
      ['朝真丹', '朝真一炷香，胜过枯坐半日。药力已能压住气脉，不至于散在周天里。'],
      ['灵海丹', '丹成之刻满室灵气倒卷，如百川归海。六阶以上，炼一炉要守一炉。'],
      ['太虚丹', '太虚之中一气可化万物。七阶聚灵罕有流通，多是闭关冲境前的储备。'],
      ['天泉丹', '一丸入腹，气脉如天泉灌注，源源不绝。'],
      ['九霄聚灵丹', '聚九霄清气于一炉。此丹不为破境，只为把这一场闭关最值钱的部分留在自己身上。']
    ],
    ct: [
      ['淬体丹', '粗淬散的丸子，武夫打底常用，修士拿来挨妖兽一爪。'],
      ['铁骨丹', '服后筋骨作响，像有人在里头敲铁。'],
      ['铜皮丹', '铜皮铁骨，先求挨得住，再谈打得狠。'],
      ['龙筋丹', '以兽骨熬筋。服下周身发热，出手比往日沉三分。'],
      ['玄骨丹', '骨色转玄，隐有铁光。硬接筑基期妖兽一击而筋骨无损。'],
      ['金刚丹', '丹如金石，掷地有声。体修以之护身，敢与法宝争锋。'],
      ['洗髓丹', '易髓换骨，脱一层旧皮。药性烈，服后三日不能停功。'],
      ['九淬丹', '九次淬炼方得一枚，骨相已变，寻常刀剑不能伤。'],
      ['天雷淬体丹', '引雷入体，以天威锻血肉。服下时九窍生烟，渡劫期体修非此不入门。']
    ],
    fc: [
      ['丰产丹', '农家用肥，丹房用这一枚。洒在药圃上，三日内草色尤青。'],
      ['百草丹', '百草得气则长。一趟采药，多摘近三分之一。'],
      ['催生丹', '催芽催生，夺天工之一线。'],
      ['灵雨丹', '丹成时室内生潮，像刚下过一场细雨。'],
      ['厚土丹', '土厚则药肥，脉静则矿生。'],
      ['万物生丹', '一阶之上更有九阶，此丹已能让废矿重新挂霜。'],
      ['甘霖丹', '甘霖普降，田垄与矿脉同时受益，庄头人家重金难求。'],
      ['地脉丹', '循地脉而行，矿气自涌。一枚可抵半个矿洞。'],
      ['天降琼浆丹', '琼浆自天而降，草木矿石皆得滋养——丹房里最不打眼、也最来钱的一枚。']
    ]
  };
  /* 破境族只补旧方空着的四段：id 单独给，材料在主药曲线上另添，八阶以上才见 Boss 料 */
  const DAN_PO_NEW = [
    { id: 'dan_jindan', seg: 3, img: 'ui/icons/dan2.png', name: '九转金丹', add: [],
      desc: '九转方成一丹，丹身有细金游走。金丹期道基未稳，服之如以铁水灌缝。' },
    { id: 'dan_huashen', seg: 5, img: 'ui/icons/dan3.png', name: '紫霄还神丹', add: [],
      desc: '取紫霄雷气凝神，丹成时隐见人影端坐。化神期神魂将离体，非此丹不能安座。' },
    { id: 'dan_heti', seg: 7, img: 'ui/icons/dan4.png', name: '归真丹', add: [['mat_eye', 2]],
      desc: '丹香不散，久视如临深渊。合体要将身与道合为一物，这枚就是那根缝线。' },
    { id: 'dan_dujie', seg: 9, img: 'ui/icons/dan5.png', name: '九霄雷髓丹', add: [['boss_heart', 1], ['mat_marrow', 1]],
      desc: '以神兽之髓引九霄之雷。渡劫头一道天雷，此丹替修士挨下。' }
  ];
  /* 老五枚的段位：段 → 旧 id。BREAK_TIERS[].pill 一字不改，新丹只是严格更优的第二条路 */
  const DAN_PO_LEG = { 1: 'dan1', 2: 'dan2', 4: 'dan3', 6: 'dan4', 8: 'dan5' };
  const danCls = tier => (tier <= 1 ? '' : tier === 2 ? 'good' : 'gold');
  const danPct = v => Math.round(v * 100) + '%';
  const danMatsOf = (fam, seg, extra) => {
    const list = DAN_MAIN[seg - 1].map(m => ({ t: m[0], n: m[1] }));
    const cfg = DAN_MATS[fam];
    if(cfg){
      list.push({ t: cfg.sig, n: cfg.n[seg - 1] });
      if(cfg.aux) list.push({ t: cfg.aux, n: cfg.auxN[seg - 1] });
      if(DAN_BOSS_N[seg - 1]) list.push({ t: cfg.boss, n: DAN_BOSS_N[seg - 1] });
    }
    (extra || []).forEach(m => list.push({ t: m[0], n: m[1] }));
    list.push({ t: 'stone', n: DAN_STONE[seg - 1] });
    return list;
  };
  /* 效果文案只有一个来源：面板、背包详情、服食日志三处都从这句里取数，不会各说各话 */
  function danEffectText(d){
    const min = Math.round(BAL.pillDur / 60);
    if(d.fam === 'po')   return '破境成功率 +' + danPct(d.brk) + '；服食立得修为（约 ' + d.exp + ' 秒修炼量，按当时修炼速度折算），' + min + ' 分钟内破境再 +' + danPct(d.buff);
    if(d.fam === 'jl')   return min + ' 分钟内修炼速度 +' + danPct(d.mult);
    if(d.fam === 'ct')   return min + ' 分钟内战力 +' + danPct(d.pct);
    return min + ' 分钟内采药与矿脉产出 +' + danPct(d.pct);
  }
  const DAN_BY_ID = {};     /* 36 枚全量记录（含老五枚） */
  const DAN_IDS = {};       /* fam → [id × 9]，按阶升序 */
  const DAN_LIST = [];
  DAN_FAMS.forEach(fam => {
    const ids = [];
    for(let seg = 1; seg <= 9; seg++){
      const tier = DAN_CURVE.tier[seg - 1];
      const d = { id: '', fam, seg, tier, name: '', img: '', cls: danCls(tier), mats: null,
        rate: DAN_CURVE.rate[seg - 1], reqLv: DAN_CURVE.reqLv[seg - 1], reqM: DAN_CURVE.reqM[seg - 1],
        buff: 0, exp: 0, mult: 0, pct: 0, brk: 0, legacy: false };
      if(fam === 'po'){ d.buff = DAN_FX.po.buff[seg - 1]; d.exp = DAN_FX.po.exp[seg - 1]; }
      if(fam === 'jl')  d.mult = DAN_FX.jl.mult[seg - 1];
      if(fam === 'ct')  d.pct  = DAN_FX.ct.pct[seg - 1];
      if(fam === 'fc')  d.pct  = DAN_FX.fc.pct[seg - 1];
      const leg = fam === 'po' ? DAN_PO_LEG[seg] : null;
      if(leg){   /* 老五枚：字段仍以 RECIPES 里那一份为准，这里只镜像出来供 UI 与结算查表 */
        const rec = RECIPES[leg];
        d.id = leg; d.legacy = true; d.name = rec.name; d.img = rec.img; d.cls = rec.cls || danCls(tier);
        d.mats = rec.mats; rec.fam = fam; rec.seg = seg;
      }else{
        const row = fam === 'po'
          ? DAN_PO_NEW.filter(x => x.seg === seg)[0]
          : { id: fam + seg, seg, name: DAN_ROWS[fam][seg - 1][0], add: [], desc: DAN_ROWS[fam][seg - 1][1] };
        d.id = row.id; d.name = row.name; d.img = fam === 'po' ? row.img : DAN_FAM[fam].img;
        d.desc = row.desc;
        d.mats = danMatsOf(fam, seg, row.add);
        RECIPES[d.id] = { recipeId: d.id, bld: 'alchemy', fam, seg, tier, name: d.name,
          reqLv: d.reqLv, reqM: d.reqM, rate: d.rate, out: d.id, img: d.img, cls: d.cls,
          mats: d.mats, note: row.desc };
      }
      if(fam === 'po'){
        const bp = BREAK_PILLS.find(p => p.id === d.id);
        d.brk = (bp && bp.bonus) || 0;
      }
      ids.push(d.id); DAN_BY_ID[d.id] = d; DAN_LIST.push(d);
    }
    DAN_IDS[fam] = ids;
  });
  /* rv4 十二味专属丹：独立表，不改旧 36 枚的 id、顺序、材料与效果。
     每味从同 (fam,seg) 标准丹复制全部门槛、成功率、时效与效果字段，只替换两味主料。 */
  const RV4_DAN_ROWS = [
    { id:'dan_chansu', name:'蟾酥丹', fam:'jl', seg:1, mats:[['matb_ox',1],['matb_croc',1]],
      desc:'丹名取蟾酥，丹成却带一股苦气。服后心神先定，气脉后顺。' },
    { id:'dan_bodan', name:'豹胆丹', fam:'ct', seg:1, mats:[['matb_wolf',1],['matb_leopard',1]],
      desc:'一味豹胆入炉，苦到极处便是回甘。武夫服之，敢挨妖兽一爪。' },
    { id:'dan_lurong', name:'鹿茸丹', fam:'po', seg:2, mats:[['matb_lion',1],['matb_tiger',1]],
      desc:'丹色温润，如嫩角未骨化时。服后精血先温，行功不至发寒。' },
    { id:'dan_jungu', name:'骏骨丹', fam:'fc', seg:2, mats:[['matb_eagle',1],['matb_bear',1]],
      desc:'丹气轻清，像一节轻骨里自有去路。古人千金买骏骨，买的也是这份认路。' },
    { id:'dan_hurong', name:'狐绒丹', fam:'jl', seg:3, mats:[['matb_monkey',2],['matb_rabbit',2]],
      desc:'丹名取狐绒，服之幻中生真。此丹要久坐方得，多用于闭关守神。' },
    { id:'dan_nilin', name:'逆鳞丹', fam:'ct', seg:3, mats:[['matb_deer',2],['matb_moth',2]],
      desc:'丹性最烈，如逆鳞连着魂，入喉先要镇住它的怒。服后皮骨如锻。' },
    { id:'dan_xiewei', name:'蝎尾丹', fam:'fc', seg:4, mats:[['matb_jiao',4],['matb_horse',4]],
      desc:'以毒攻毒，药性如蝎尾针之烈，可祛三尸风；炼成一炉，丹房三日有腥。' },
    { id:'dan_linxie', name:'麟竭丹', fam:'po', seg:4, mats:[['matb_qilin',3],['matb_tortoise',3]],
      desc:'仁兽之血凝成的赤块，续骨接脉。破境前后各服一丸，道基不至裂处。' },
    { id:'dan_baize', name:'白泽通玄丹', fam:'jl', seg:5, mats:[['matb_phoenix',8],['matb_crane',8]],
      desc:'白泽毛端那一字，一味可抵半卷谱。此丹不增力气，只增清明。' },
    { id:'dan_jinwu', name:'金乌丹', fam:'ct', seg:5, mats:[['matb_python',6],['matb_bonejiao',6]],
      desc:'翎影中另有一日，一炉要添三炉炭。合体期服它，如吞一粒小太阳。' },
    { id:'dan_heding', name:'鹤顶丹', fam:'fc', seg:6, mats:[['matb_nethpython',15],['matb_fox',15]],
      desc:'丹色如鹤顶朝日。此丹不为战阵，只为浮阳得降、关隘可叩；所获灵石随同段旧例。' },
    { id:'dan_kunpeng', name:'鲲鹏丹', fam:'po', seg:8, mats:[['matb_yinglong',39],['matb_moqilin',39]],
      desc:'一羽压舟，非风不能举；此丹亦非大风关不可服。渡劫期闭关，多半就为等它。' }
  ];
  const RV4_DAN_LIST = [], RV4_DAN_BY_ID = {};
  RV4_DAN_ROWS.forEach(row => {
    const std = DAN_BY_ID[DAN_IDS[row.fam][row.seg - 1]];
    const mats = row.mats.map(m => ({ t:m[0], n:m[1] }));
    mats.push({ t:'stone', n:DAN_STONE[row.seg - 1] });
    const d = { id:row.id, fam:row.fam, seg:row.seg, tier:std.tier, name:row.name,
      img:std.img, cls:std.cls, desc:row.desc, mats, rate:std.rate, reqLv:std.reqLv,
      reqM:std.reqM, buff:std.buff, exp:std.exp, mult:std.mult, pct:std.pct, brk:std.brk,
      legacy:false, rv4:true };
    RECIPES[d.id] = { recipeId:d.id, bld:'alchemy', fam:d.fam, seg:d.seg, tier:d.tier,
      name:d.name, reqLv:d.reqLv, reqM:d.reqM, rate:d.rate, out:d.id, img:d.img,
      cls:d.cls, mats:d.mats, note:d.desc, rv4:true };
    RV4_DAN_LIST.push(d); RV4_DAN_BY_ID[d.id] = d;
  });
  /* 寄售口径照旧：丹药按品阶定价，四阶以上不收（与老档 dan4/dan5 无寄售价一致）。
     真正的写入要等 ITEMS / SELL_K 两张表定义完——它们在更远处，就地写会撞 const 的 TDZ。 */
  const DAN_SELL_TIER = { 1: 0.20, 2: 0.50, 3: 1.20, 4: 0, 5: 0 };
  function danFillBagMeta(){
    DAN_LIST.concat(RV4_DAN_LIST).forEach(d => {
      if(d.legacy) return;
      ITEMS[d.id] = { n: d.name, img: d.img, cls: d.cls,
        usage: DAN_FAM[d.fam].name + '族第 ' + d.seg + ' 阶丹：' + danEffectText(d),
        source: '炼丹房炼就 · ' + DAN_FAM[d.fam].name + '族第 ' + d.seg + ' 阶（需丹房 ' + d.reqLv + ' 级 / 丹师 ' + d.reqM + ' 阶）',
        description: d.desc };
      if(DAN_SELL_TIER[d.tier]) SELL_K[d.id] = DAN_SELL_TIER[d.tier];
    });
  }
  /* 没挂 fam 的旧方（dan2_core 这类按产出物走的第二条路）在此认祖归宗 */
  Object.keys(RECIPES).forEach(k => {
    const rec = RECIPES[k];
    if(rec.bld !== 'alchemy' || rec.fam) return;
    const d = DAN_BY_ID[rec.out];
    if(d){ rec.fam = d.fam; rec.seg = d.seg; }
  });
  DAN_VARIANT_LIST.forEach(v => { const d = DAN_BY_ID[v.out]; if(d){ v.fam = d.fam; v.seg = d.seg; } });

  /* ============================================================
   * 法器四族九阶（第 90 节）：灵器 / 战器 / 破器 / 财器 × 九阶 = 36 枚
   *   灵器 → 提升 weaponMult（修炼速度倍率，老四条 wp1..wp4 一字不改 + 新补 wp5..wp9）
   *   战器 → 战力百分比（combatPower 里一路独立乘区）
   *   破器 → 突破成功率加算（breakChanceWith 里与丹药同格式的百分点）
   *   财器 → 灵石产出倍率（stoneRate 里一路独立乘区）
   *   四族各占一个持有位（灵器仍用老字段 S.weapon，另三族 S.art.bg/brk/cai），
   *   互不覆盖；强化 +20 与洗练词条仍共一档（挂在 S.weaponLv / S.affix 上，按主器）。
   *   调数值只改 ART_CURVE / ART_FX / ART_ORE / ART_MATS / ART_ROWS，别处不写数字。
   * ============================================================ */
  const ART_FAMS = ['lq', 'bg', 'brk', 'cai'];
  const ART_FAM = {
    lq:  { name: '灵器', img: 'ui/icons/weapon1.png', lead: '常佩不卸：修炼速度' },
    bg:  { name: '战器', img: 'ui/icons/weapon2.png', lead: '常佩不卸：战力百分比' },
    brk: { name: '破器', img: 'ui/icons/weapon3.png', lead: '常佩不卸：突破成功率' },
    cai: { name: '财器', img: 'ui/icons/weapon4.png', lead: '常佩不卸：灵石产出' }
  };
  /* 阶 = 段：与 BREAK_TIERS / DAN_SEG_NAME 同序，只用于文案 */
  const ART_CURVE = {
    tier:  [1, 2, 3, 4, 4, 5, 5, 5, 5],
    reqLv: [1, 2, 3, 5, 6, 7, 8, 9, 10],   /* 九阶要炼器坊满级 */
    reqM:  [1, 1, 2, 3, 3, 4, 5, 6, 7],
    rate:  [0.90, 0.75, 0.60, 0.35, 0.30, 0.27, 0.24, 0.21, 0.18]
  };
  /* 灵器族的增量不在这里：它就是 BAL.weaponMult 减 1（老表直接扩到十项，两边不会漂） */
  const ART_FX = {
    bg:  [0, 0.04, 0.07, 0.11, 0.16, 0.22, 0.29, 0.37, 0.46, 0.56],
    brk: [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.085, 0.10],
    cai: [0, 0.06, 0.10, 0.15, 0.22, 0.30, 0.39, 0.49, 0.61, 0.75]
  };
  const ART_ORE = [10, 30, 80, 200, 320, 480, 700, 1000, 1500];
  /* 灵石按阶走固定档（与第 89 节 DAN_STONE 同一条口径）：新图谱的灵石只是敲打钱，
     真正卡脖子的是矿石与妖兽料；老四条灵石已并入 ART_STONE 同档（2026-11-20 A1），不再走 need×K */
  const ART_STONE = [40, 120, 300, 700, 1500, 3200, 6000, 12000, 24000];
  /* 三族招牌辅料（五阶起再加一份辅料，与矿石、与招牌料都不重样；七阶起见 Boss 料、八阶一份、九阶两份） */
  const ART_MATS = {
    lq:  { sig: 'mat_eye',     n: [1, 2, 3, 5, 8, 12, 16, 22, 30],    aux: null,       an: [0, 0, 0, 0, 0, 0, 0, 0, 0],    boss: 'boss_heart' },
    bg:  { sig: 'mat_bone',    n: [3, 6, 12, 24, 36, 52, 72, 96, 130], aux: 'mat_eye',  an: [1, 1, 2, 3, 4, 6, 8, 10, 14], boss: 'boss_core' },
    brk: { sig: 'mat_core',    n: [2, 4, 8, 16, 26, 40, 58, 80, 110],  aux: 'mat_eye',  an: [1, 1, 2, 3, 4, 5, 7, 9, 12],  boss: 'boss_pearl' },
    cai: { sig: 'mat_feather', n: [1, 2, 3, 5, 8, 12, 16, 22, 30],     aux: 'mat_core', an: [1, 1, 2, 3, 4, 6, 8, 10, 14], boss: 'boss_feather' }
  };
  const ART_BOSS_N = [0, 0, 0, 0, 0, 0, 1, 1, 2];
  const ART_ROWS = {
    lq: [
      ['', ''], ['', ''], ['', ''], ['', ''],
      ['玄光剑', '剑身不映人影，只映灵气流转。'],
      ['承露剑', '晨露凝于剑脊，一夜不落。'],
      ['太虚剑', '出鞘无声，收鞘无痕。'],
      ['紫宸剑', '紫气东来，剑上一线帝星。'],
      ['九霄灵枢剑', '九霄之灵皆在此枢，佩之则天地替你行功。']
    ],
    bg: [
      ['铁锋刃', '粗铁开锋，胜在顺手。'],
      ['青钢戟', '戟沉三分，出手也重三分。'],
      ['玄铁重剑', '重剑无锋，大巧不工。'],
      ['龙筋弓', '以蛟龙之筋为弦，一箭穿石。'],
      ['破军刀', '刀名破军，见血则鸣。'],
      ['斩星剑', '剑落如星坠，夜空要少一颗。'],
      ['天罡斧', '三十六天罡，尽数压在斧背。'],
      ['诛邪枪', '枪出如龙，专挑邪祟的七寸。'],
      ['九霄斩仙剑', '斩的不是人，是这一境的天花板。']
    ],
    brk: [
      ['引雷锥', '一道细雷，专破气机滞涩。'],
      ['定神珠', '掌中一丸，心不散则境不散。'],
      ['破障铃', '铃响三声，关隘自开。'],
      ['问心镜', '先照见自己，再照见那道门。'],
      ['玄门针', '针尖一点，天门也得分缝。'],
      ['断障梭', '来去如梭，把劫云织成布。'],
      ['渡厄幡', '幡影一展，替你挡一瞬天威。'],
      ['问天圭', '持圭问天，天意稍缓。'],
      ['九霄破境玦', '玦口对着劫云——这一境，本就该过。']
    ],
    cai: [
      ['招财铃', '铃一响，路上就多两枚灵石。'],
      ['聚宝盘', '盘心微凹，自己往下沉的都是钱。'],
      ['金蟾铃', '金蟾不鸣，鸣则财至。'],
      ['落宝金钱', '钱落有声，落谁手里看缘分。'],
      ['泉涌珠', '一线石泉，从珠里渗出来。'],
      ['金玉斗', '斗小量大，量的是这一方的财气。'],
      ['四方来财印', '印一盖，四方的财路就算你一份。'],
      ['天禄鼎', '鼎中常有物自生，取之不尽。'],
      ['九霄聚宝盆', '九霄的零碎，落地都归这只盆。']
    ]
  };
  const artCls = tier => (tier <= 1 ? '' : tier === 2 ? 'good' : 'gold');
  const ART_BY_ID = {};   /* 36 枚全量（含老四条） */
  const ART_IDS = {};     /* fam → [id × 9] */
  const ART_LIST = [];
  const artMatsOf = (fam, seg) => {
    const cfg = ART_MATS[fam];
    const list = [{ t: 'ore', n: ART_ORE[seg - 1] }, { t: cfg.sig, n: cfg.n[seg - 1] },
                  { t: 'stone', n: ART_STONE[seg - 1] }];
    if(cfg.aux && seg >= 5) list.push({ t: cfg.aux, n: cfg.an[seg - 1] });
    if(ART_BOSS_N[seg - 1]) list.push({ t: cfg.boss, n: ART_BOSS_N[seg - 1] });
    return list;
  };
  ART_FAMS.forEach(fam => {
    const ids = [];
    for(let seg = 1; seg <= 9; seg++){
      const tier = ART_CURVE.tier[seg - 1];
      const legacyId = fam === 'lq' && seg <= 4 ? 'wp' + seg : null;
      let d;
      if(legacyId){
        /* 老四条（wp1..wp4）：名称 / 图标 / 材料 / 成功率 / 倍率仍以 RECIPES 里那一份为准 */
        const rec = RECIPES[legacyId];
        d = { id: legacyId, fam, seg, tier, name: rec.name, img: rec.img, cls: rec.cls || artCls(tier),
              mats: rec.mats, rate: rec.rate, reqLv: rec.reqLv, reqM: rec.reqM || 1, legacy: true };
        rec.fam = fam; rec.famOf = fam; rec.seg = seg;
        if(!rec.outLv) rec.outLv = seg;
      }else{
        const row = ART_ROWS[fam][seg - 1];
        const id = fam + seg;
        d = { id, fam, seg, tier, name: row[0], desc: row[1], cls: artCls(tier),
              img: fam === 'lq' ? 'ui/icons/weapon' + Math.min(4, seg) + '.png' : ART_FAM[fam].img,
              mats: artMatsOf(fam, seg),
              rate: ART_CURVE.rate[seg - 1], reqLv: ART_CURVE.reqLv[seg - 1], reqM: ART_CURVE.reqM[seg - 1],
              legacy: false };
        RECIPES[id] = { recipeId: id, bld: 'forge', fam, famOf: fam, seg, tier, name: d.name,
          reqLv: d.reqLv, reqM: d.reqM, rate: d.rate, out: 'art', outLv: seg,
          img: d.img, cls: d.cls, mats: d.mats, note: d.desc };
      }
      ids.push(d.id); ART_BY_ID[d.id] = d; ART_LIST.push(d);
    }
    ART_IDS[fam] = ids;
  });
  const artById = (fam, seg) => (seg > 0 ? (ART_BY_ID[(ART_IDS[fam] || [])[seg - 1]] || null) : null);
  /* batch5：图纸定向锻造（首批 6 张；只用现有 ART_ROWS / RECIPES，不新增法宝） */
  const BLUEPRINTS = [
    { id:'bp_lq5',  fam:'lq',  seg:5, name:'图·承露剑' },
    { id:'bp_bg5',  fam:'bg',  seg:5, name:'图·破军刀' },
    { id:'bp_brk5', fam:'brk', seg:5, name:'图·玄门针' },
    { id:'bp_cai5', fam:'cai', seg:5, name:'图·泉涌珠' },
    { id:'bp_lq7',  fam:'lq',  seg:7, name:'图·太虚剑' },
    { id:'bp_bg7',  fam:'bg',  seg:7, name:'图·天罡斧' }
  ];
  const BP_IDS = BLUEPRINTS.map(b => b.id);
  const BP_BY_ID = {}; BLUEPRINTS.forEach(b => { BP_BY_ID[b.id] = b; });
  const BP_POOLS = {
    yougu: ['bp_lq5', 'bp_bg5', 'bp_brk5', 'bp_cai5'],
    beiming: ['bp_lq7', 'bp_bg7']
  };
  const bpCount = id => Math.max(0, (S.blueprints && S.blueprints[id]) | 0);
  function bpGive(id){
    if(!BP_BY_ID[id]) return false;
    if(!S.blueprints || typeof S.blueprints !== 'object') S.blueprints = {};
    S.blueprints[id] = Math.min(999, bpCount(id) + 1);
    return true;
  }
  /* 效果文案只有一个来源：炼器面板与炼制日志都从这里取数 */
  function artEffectText(fam, seg){
    if(!seg) return '未佩';
    if(fam === 'lq') return '修炼速度 ×' + (BAL.weaponMult[seg] || 1).toFixed(2);
    if(fam === 'bg') return '战力 +' + danPct(ART_FX.bg[seg]);
    if(fam === 'brk') return '突破成功率 +' + danPct(ART_FX.brk[seg]);
    return '灵石产出 ×' + (1 + ART_FX.cai[seg]).toFixed(2);
  }

  /* ---- rv4 兽魂：独立旁挂 10 件，全部被动；不占佩戴位、不累加。
     每族有效阶位由旧四族法宝与本族最高兽魂共同取最大，效果仍只走原四族通道。 ---- */
  const RV4_SOUL_ROWS = [
    { id:'soul_wolf',   name:'狼毫哨', fam:'bg',  seg:1, reqLv:1,  reqM:1, rate:0.90, ore:10,  stone:40,   boss:null,
      mats:[['matb_rat',1],['matb_crow',1],['mat_bone',3]], desc:'狼毫凝哨，兽魂镇于战器族，只取本族最高阶。' },
    { id:'soul_toad',   name:'蟾骨笛', fam:'lq',  seg:1, reqLv:1,  reqM:1, rate:0.90, ore:10,  stone:40,   boss:null,
      mats:[['matb_toad',1],['matb_boar',1],['mat_eye',1]], desc:'蟾骨作笛，兽魂镇于灵器族，修炼只取本族最高阶。' },
    { id:'soul_horse',  name:'骏影鞭', fam:'brk', seg:3, reqLv:3,  reqM:2, rate:0.60, ore:80,  stone:300,  boss:null,
      mats:[['matb_horse',1],['matb_hound',1],['mat_core',8]], desc:'骏影入鞭，破境只取本族最高阶。' },
    { id:'soul_qilin',  name:'麟趾印', fam:'cai', seg:4, reqLv:5,  reqM:3, rate:0.35, ore:200, stone:700,  boss:null,
      mats:[['matb_crane',1],['matb_dragon',1],['mat_feather',5]], desc:'麟趾落印，灵石产出只取本族最高阶。' },
    { id:'soul_scorpion',name:'蝎尾铃',fam:'bg',  seg:5, reqLv:6,  reqM:3, rate:0.30, ore:320, stone:1500, boss:null,
      mats:[['matb_bat',2],['matb_snake',2],['mat_bone',36]], desc:'尾铃镇魂，与旧战器共同比阶，不叠加。' },
    { id:'soul_bat',    name:'蝠影冕', fam:'lq',  seg:5, reqLv:6,  reqM:3, rate:0.30, ore:320, stone:1500, boss:null,
      mats:[['matb_spider',1],['matb_scorpion',1],['mat_eye',8]], desc:'蝠影藏冕，与旧灵器共同比阶，不叠加。' },
    { id:'soul_crane',  name:'鹤翎冠', fam:'brk', seg:6, reqLv:7,  reqM:4, rate:0.27, ore:480, stone:3200, boss:null,
      mats:[['matb_rakshasa',2],['matb_ghoul',2],['mat_core',40]], desc:'鹤翎护顶，与旧破器共同比阶，不叠加。' },
    { id:'soul_crow',   name:'乌羽灯', fam:'bg',  seg:7, reqLv:8,  reqM:5, rate:0.24, ore:700, stone:6000, boss:'boss_core',
      mats:[['matb_goldencrow',4],['matb_baize',4],['mat_bone',72],['boss_core',1]], desc:'乌羽照夜，七阶兽魂只替代同族较低效果。' },
    { id:'soul_jiao',   name:'蛟脊索', fam:'cai', seg:8, reqLv:9,  reqM:6, rate:0.21, ore:1000,stone:12000,boss:'boss_feather',
      mats:[['matb_xiezhi',1],['matb_taotie',1],['mat_feather',22],['boss_feather',1]], desc:'蛟脊为索，八阶财魂只替代同族较低效果。' },
    { id:'soul_kunpeng',name:'鲲鹏翼', fam:'lq',  seg:9, reqLv:10, reqM:7, rate:0.18, ore:1500,stone:24000,boss:'boss_heart',
      mats:[['matb_zhulong',2],['matb_kunpeng',2],['mat_eye',30],['boss_heart',2]], desc:'鲲鹏展翼，九阶灵魂只替代同族较低效果。' }
  ];
  const RV4_SOUL_BY_ID = {};
  RV4_SOUL_ROWS.forEach(s => {
    const tier = s.seg <= 2 ? 1 : s.seg <= 4 ? 2 : s.seg <= 6 ? 3 : 4;
    s.tier = tier;
    s.img = ART_FAM[s.fam].img;
    s.cls = artCls(tier);
    s.mats = [{ t:'ore', n:s.ore }].concat(s.mats.map(m => ({ t:m[0], n:m[1] })), [{ t:'stone', n:s.stone }]);
    s.recipeId = s.id;
    RV4_SOUL_BY_ID[s.id] = s;
    RECIPES[s.id] = { recipeId:s.id, bld:'forge', fam:s.fam, famOf:s.fam, seg:s.seg, tier,
      name:s.name, reqLv:s.reqLv, reqM:s.reqM, rate:s.rate, out:s.id, outLv:s.seg,
      img:s.img, cls:s.cls, mats:s.mats, note:s.desc, rv4:true, soul:true };
  });
  const RV4_BESTIARY_TIERS = [
    { id:'t1', name:'妖兽卷', K:3 }, { id:'t2', name:'灵兽卷', K:5 },
    { id:'t3', name:'仙兽卷', K:8 }, { id:'t4', name:'魔兽卷', K:12 },
    { id:'t5', name:'神兽卷', K:20 }
  ];
  const RV4_BESTIARY_K = {};
  RV4_BESTIARY_TIERS.forEach(t => { RV4_BESTIARY_K[t.id] = t.K; });
  const emptyRv4 = () => ({ v:1, souls:[], found:[], claimed:[] });
  const rv4Ids = (v, byId) => {
    const out = [], seen = {};
    if(Array.isArray(v)) v.forEach(id => {
      if(typeof id !== 'string' || !byId[id] || seen[id]) return;
      seen[id] = 1; out.push(id);
    });
    return out;
  };
  function ensureRv4(){
    if(!S.rv4 || typeof S.rv4 !== 'object' || Array.isArray(S.rv4)) S.rv4 = emptyRv4();
    if(!Array.isArray(S.rv4.souls)) S.rv4.souls = [];
    if(!Array.isArray(S.rv4.found)) S.rv4.found = [];
    if(!Array.isArray(S.rv4.claimed)) S.rv4.claimed = [];
    S.rv4.v = 1;
    return S.rv4;
  }
  const rv4HasSoul = id => ensureRv4().souls.indexOf(id) >= 0;
  const rv4SoulMax = fam => RV4_SOUL_ROWS.reduce((m, s) =>
    s.fam === fam && rv4HasSoul(s.id) ? Math.max(m, s.seg) : m, 0);
  const rv4SoulAt = fam => RV4_SOUL_ROWS.filter(s => s.fam === fam && rv4HasSoul(s.id))
    .sort((a, b) => b.seg - a.seg)[0] || null;
  function rv4Found(id){
    const r = ensureRv4();
    if(!RV4_MAT_BY_ID[id] || r.found.indexOf(id) >= 0) return false;
    r.found.push(id); return true;
  }
  function bestiaryProgress(tier){
    return RV4_MATS.filter(m => m.tier === tier && ensureRv4().found.indexOf(m.id) >= 0).length;
  }
  function claimBestiary(tier){
    const row = RV4_BESTIARY_TIERS.find(t => t.id === tier);
    if(!row){ log('万兽谱卷次有误。', 'bad'); return { ok:false, reason:'bad-tier' }; }
    const r = ensureRv4();
    if(r.claimed.indexOf(tier) >= 0){ log('这一卷的灵石已经领过了。', 'bad'); return { ok:false, reason:'claimed' }; }
    const need = RV4_MATS.filter(m => m.tier === RV4_BESTIARY_TIERS.indexOf(row) + 1).length;
    if(bestiaryProgress(RV4_BESTIARY_TIERS.indexOf(row) + 1) < need){
      log('这一卷尚未集齐，卖掉的旧料不会从谱上抹去，也不会补记。', 'bad'); return { ok:false, reason:'incomplete' };
    }
    const reward = needOf(S.rank) * row.K;
    r.claimed.push(tier);
    S.stone += reward; S.stats.stoneEarned = (S.stats.stoneEarned || 0) + reward;
    log('📖 万兽谱·' + row.name + '已收录，灵石 +' + fmt(reward) + '。', 'gold');
    sfx.win(); save(); render(); renderBestiary();
    return { ok:true, tier:tier, reward:reward };
  }

  /* ============================================================
   * 种田闭环：灵田「播种 → 生长倒计时 → 收获 → 直通炼丹房」
   * 灵田等级 = 田块数（min(lv, plotCap)），超出后每级收获产量 +2%；
   * 灵石仍由灵田自动凝结（离线照常），灵草全部出自田块。
   * 调数值只改 CROPS / BAL.plotCap / BAL.plotYieldLv。
   * ============================================================ */
  const CROPS = {
    herb:      { id: 'herb',      name: '灵草',     out: 'herb',      yield: 6, grow: 300,   reqLv: 1,  img: 'ui/icons/herb.png',
                 note: '一茬五分钟，炼丹房的口粮' },
    herb100:   { id: 'herb100',   name: '百年灵草', out: 'herb100',   yield: 1, grow: 2400,  reqLv: 10, img: 'ui/icons/herb.png',
                 note: '四十分钟一茬，中品/上品破境丹的药引' },
    herb10000: { id: 'herb10000', name: '万年灵草', out: 'herb10000', yield: 1, grow: 14400, reqLv: 20, img: 'ui/icons/herb10000.png',
                 note: '四个时辰一茬，睡前下种正好' }
  };

  /* ============ 随机奇遇（挂机偶遇气泡 → 古风弹窗 → 选一项结算） ============ */
  /* 触发：每挂机 ENC.everySec 秒判定一次，ENC.chance 概率刷出一个气泡；
     已有气泡时不重复刷；气泡 ENC.ttlSec 秒无人问津则自行消散（不惩罚，纯白给机会）。 */
  const ENC = { chance: 0.30, everySec: 60, ttlSec: 300 };
  /* 每个事件：icon 气泡/弹窗图标、name 标题、text 剧情、opts 选项
     选项 fx 结算字段（全部走 encApplyFx 统一入口）：
       costStone  事前扣除的灵石（不够则按钮置灰）   stone 灵石
       wisdom     悟道值（×境界系数）                 insight 顿悟进度（上限 WISDOM.full）
       exp        修为（按当前 need 的百分比给）        expLoss 扣修为（按 need 的百分比扣，下限 0）
       boost      临时修炼倍率 { mult: 0.6, sec: 900 }（与丹药 buff 独立，可叠加）
       roll       随机分支：[{ w:权重, text, fx }]，命中即用该分支结算
     未命中的分支不弹提示；不在 fx 里写的字段一律不结算。 */
  const ENCOUNTERS = {
    beggar: {
      icon: '🫡', name: '路畔快饿死的散修',
      text: '道旁石阶上倒着个散修，嘴唇干裂，手里还攥着半截断剑。见你佩剑，他伸出枯瘦的手：「道友……十枚灵石，够我熬过这个月。」',
      opts: [
        { label: '给他 10 灵石',   fx: { costStone: 10, wisdom: 50 }, ok: '你把灵石放进他掌心。他磕了个头，说记住了你的道号。' },
        { label: '摇头走开',       fx: {},                                  ok: '你转身走了。身后没有声音。' }
      ]
    },
    pouch: {
      icon: '👜', name: '道旁的破损储物袋',
      text: '半埋在土里的储物袋裂了口子，袋口的禁制早已失效。里面还剩几件东西，但袋上残留的禁咒气息说明：主人多半死得不远。',
      opts: [
        { label: '强行打开', risk: true, fx: { roll: [
          { w: 6, text: '禁咒反噬被袋中残存的灵石挡了一瞬——你捞到一笔横财。', fx: { stone: 180 } },
          { w: 4, text: '禁咒炸开，气海翻涌，你被掀退三步。', fx: { expLoss: 0.08 } }
        ] } },
        { label: '原样埋回去',     fx: {}, ok: '你把土拍平。有些东西不该拿。' }
      ]
    },
    stele: {
      icon: '🪨', name: '无字残碑',
      text: '半人高的石碑，碑面被雨水磨平了大半。剩下的三个字你不认得，可看久了，眼前会浮起一些不属于你的画面。',
      opts: [
        { label: '静心参悟',     fx: { roll: [
          { w: 5, text: '心念一动，某个卡了很久的关窍松了。', fx: { insight: 12 } },
          { w: 5, text: '那些画面太碎，你只记住了「有人等过你」这种感觉。', fx: { insight: 5, boost: { mult: 0.15, sec: 900 } } }
        ] } },
        { label: '拓下碑文就走', fx: {}, ok: '碑上三个字，你抄在袖里，字迹很快淡了。' }
      ]
    },
    amulet: {
      icon: '🧙', name: '卖符的老妪',
      text: '路口支着个草摊，老妪面前摊了一叠黄符，边缘烧得参差不齐。「小友，一枚聚气符，三十灵石。」她的眼神在你腰间的储物袋上停了一下。',
      opts: [
        { label: '买一张（30 灵石）', fx: { costStone: 30, boost: { mult: 0.60, sec: 900 } },
          ok: '黄符贴在胸口，温热感一路走到气海。' },
        { label: '摆手走开',        fx: {}, ok: '老妪也不挽留，只在你身后轻轻咳了一声。' }
      ]
    },

    /* ============================================================
       D-008「见闻录」内容增补 · 奇遇池 4 → 34（5 卷 × 6 条）
       —— 只在此静态表末尾追加条目，零新增存档字段、零新增数值档位、零逻辑改动。
       口径（供独立审查核对）：
         · 触发/结算/渲染全部沿用 encTick / encApplyFx / openEncounter 既有链；
           encTick 用 Object.keys(ENCOUNTERS) 全表随机 + 相邻去重，追加即生效。
         · 26 条为纯叙事：opts 的 fx 一律 {}，只回一句白描 ok（走 D-007 A11/A91 的日志链）。
         · 仅卷五 4 条「故人回响」复用既有 4 条用过的 fx 档位原值：
             costStone 10 / wisdom 50（同 beggar）、costStone 30 / boost{0.60,900}（同 amulet）、
             roll 6:4 + stone 180 / expLoss 0.08（同 pouch）、
             roll 5:5 + insight 12 / insight 5 + boost{0.15,900}（同 stele）。
           没有任何新字段、新档位、新数值；不改 ENC 三个常量。
         · 呼应只写在文本里（散修/老妪/储物袋/残碑的后续），不新增「已读」等状态。
         · 文风：白描、短句、日常细节、留白，不抒情、不夸张、多无结局（沿用既有 4 条调性）。
       ============================================================ */

    /* ---- 卷一 · 山野遭逢 ---- */
    ridge_tea: {
      icon: '🍵', name: '山脊上的茶棚',
      text: '山脊上有间茶棚，只两张三条腿的凳。挑夫把担子搁下，碗里的水凉了也没喝，就望着来路。',
      opts: [
        { label: '坐下歇一歇', fx: {}, ok: '你坐了会儿。挑夫望的还是来路，说北边这几天风向变了，下山的人比上山的多。' },
        { label: '继续赶路',   fx: {}, ok: '走出半里，回头看，茶棚还在原处。' }
      ]
    },
    ferry: {
      icon: '⛵', name: '渡口的船',
      text: '渡口的船拴着，船家蹲在船头补一张网。水面很平，看不出流向。',
      opts: [
        { label: '问几时开船', fx: {}, ok: '「等人齐。」他说完又低头补网，没说要等几个。' },
        { label: '沿河自己走', fx: {}, ok: '河湾很长，走到日头偏西，仍能看见那艘船。' }
      ]
    },
    millet: {
      icon: '🌾', name: '坡上的粟田',
      text: '坡上种着一片粟，穗子被压得低。田边立了个稻草人，身上披的却是件真衣裳。',
      opts: [
        { label: '把衣裳取下来叠好', fx: {}, ok: '你叠好放在田埂上。那衣裳是从山门那道观上放下来的，说是主人交代过，回来时好认。风吹过来，粟穗动了一下。' },
        { label: '不动，绕过去',     fx: {}, ok: '你从田边绕过去。走了几步，还是回了一次头。' }
      ]
    },
    stone_mason: {
      icon: '🪨', name: '歇着的采石匠',
      text: '石宕边一个匠人歇着，手边半块没凿完的碑。他见你，把凿子往怀里收了收。',
      opts: [
        { label: '问这碑给谁凿的', fx: {}, ok: '「还没定。」他用袖子擦了擦碑面，没再往下说。' },
        { label: '点头过去',       fx: {}, ok: '你走了。身后凿石的声音隔了一会儿才又响起来。' }
      ]
    },
    lost_lamp: {
      icon: '🏮', name: '山道上一盏灯',
      text: '山道上挂着一盏灯，灯罩擦得很干净，火却快灭了。四下没有屋子。',
      opts: [
        { label: '把灯罩扶正', fx: {}, ok: '你把歪了的灯罩扶正。火苗晃了晃还是那么小——这盏灯没人添过油，却也没断过芯。' },
        { label: '留着，别碰', fx: {}, ok: '你没碰它。第二天再经过，灯已经灭了，还挂在那里。' }
      ]
    },
    rain_shelter: {
      icon: '🌧️', name: '雨檐下同避',
      text: '雨忽然大了。窄檐下已经站了个人，往里挪了半步，给你空出够站的地方。',
      opts: [
        { label: '道声谢，一起等', fx: {}, ok: '两个人谁也没说话。雨停时那人先走了，地上留了一小片干。他走的是塔那条路，背上一支长枪。' },
        { label: '冒雨走',         fx: {}, ok: '你走进雨里。檐下那人没动，也没看你。' }
      ]
    },

    /* ---- 卷二 · 市井百态 ---- */
    noodle: {
      icon: '🍜', name: '巷口的面摊',
      text: '面摊支在巷口，锅里只剩一勺汤。摊主说今日卖完了，却还把火留着。',
      opts: [
        { label: '问还做不做', fx: {}, ok: '「等人。」他搅了搅那勺汤，「说好要来的。」' },
        { label: '走开',       fx: {}, ok: '你走出巷口，那点火光还在身后亮着。听人说那锅汤每日留一勺，留了十一年——塔上不再下来人那年起。' }
      ]
    },
    knife_grinder: {
      icon: '🔪', name: '墙根的磨刀人',
      text: '磨刀人蹲在墙根，磨石上搁着一把没开刃的刀。刀是新的，主家却一直没来取。',
      opts: [
        { label: '问刀是谁的', fx: {}, ok: '他摇头，说记不清了，反正是量好了尺寸打的。' },
        { label: '不多问',     fx: {}, ok: '磨石声一下一下，你走远了还听得见。' }
      ]
    },
    pawnshop: {
      icon: '🏷️', name: '当铺高处的玉扣',
      text: '当铺柜台高处摆着一排死当，其中一枚玉扣，成色寻常，标签却写得极仔细。',
      opts: [
        { label: '问那枚玉扣', fx: {}, ok: '伙计取下来给你看又收回去：「有人月月来问，没赎。」' },
        { label: '看看就走',   fx: {}, ok: '你出门时，伙计把那枚玉扣又摆正了些。' }
      ]
    },
    storyteller: {
      icon: '📖', name: '只剩一个听客',
      text: '茶楼里说书人正收醒木，底下只剩一个听客。他照样把那段收了尾，一字没省。',
      opts: [
        { label: '坐下听完整段',   fx: {}, ok: '醒木一落，收的是一段「门上无锁」的旧书，说到门这边有人把自己关了进去，就没了下文。说书人自己把凳子摞好。' },
        { label: '立在门口听两句', fx: {}, ok: '你只听了两句。故事没讲完，也不知后来怎样。' }
      ]
    },
    medicine_shop: {
      icon: '🌿', name: '药铺门口晒陈皮',
      text: '药铺伙计在门口晒陈皮，翻得很慢，每一片都翻到。筐边压着张没写完的药方。',
      opts: [
        { label: '替他按住被风掀的方子', fx: {}, ok: '你把方子压好。他道了谢，又低头翻陈皮。' },
        { label: '绕开晒着的筐',         fx: {}, ok: '你贴着墙走过去，没踩着一片。' }
      ]
    },
    lantern_seller: {
      icon: '🏮', name: '卖灯翁收摊',
      text: '卖灯的老翁收了摊，独留一盏没卖出去的，挂在担子头上，自己提着走。',
      opts: [
        { label: '买下那最后一盏', fx: {}, ok: '他说不必给钱，「镇口新米铺的老掌柜要一盏」。你还是把钱搁在了担子上。' },
        { label: '目送他走',       fx: {}, ok: '那盏灯一晃一晃，拐进巷子就看不见了。' }
      ]
    },

    /* ---- 卷三 · 古洞遗刻 ---- */
    wall_marks: {
      icon: '🪨', name: '壁上一排刻痕',
      text: '古洞石壁上一排短刻痕，一道挨一道，末了那道只刻了一半。旁边有块磨平的石面，像是留着还要刻。',
      opts: [
        { label: '数了数',       fx: {}, ok: '刻痕太密，数到后头乱了。你把手从石面上收回来。' },
        { label: '不数，接着走', fx: {}, ok: '你往洞里走。那半道刻痕留在身后，没人补上。' }
      ]
    },
    old_shoes: {
      icon: '👟', name: '洞口一双旧鞋',
      text: '洞口整整齐齐摆着一双旧鞋，鞋底磨穿了，鞋头朝着洞里。不像丢的，像脱下来放好的。',
      opts: [
        { label: '照原样摆着，进去', fx: {}, ok: '你绕开那双鞋进了洞。回来时，它们还在原处。' },
        { label: '停在洞口',         fx: {}, ok: '你没进去。风从洞里出来，带着点凉。' }
      ]
    },
    dried_ink: {
      icon: '🖌️', name: '干涸的一方砚',
      text: '石台上一方砚，墨早干透了，砚池里积了薄薄一层灰。笔搁在笔架上，笔尖还是洗过的样子。',
      opts: [
        { label: '把笔摆正', fx: {}, ok: '笔本来就是正的。你手停了停，还是收了回来。' },
        { label: '不碰',     fx: {}, ok: '桌面别的东西都蒙了灰，只有那支笔没有。' }
      ]
    },
    bone_flute: {
      icon: '🎶', name: '石缝里的短笛',
      text: '石缝里卡着一支短笛，不是竹的。孔眼开得极正，却落满了灰，看得出许久没人吹过。',
      opts: [
        { label: '取下来擦净放回', fx: {}, ok: '你擦净了，又放回原处。缝还是那道缝。' },
        { label: '留它在缝里',     fx: {}, ok: '你没动它。洞里静，也听不出从前是什么调子。' }
      ]
    },
    incense_cold: {
      icon: '🕯️', name: '小龛前的冷香灰',
      text: '小龛前一堆香灰，堆得尖，插过三支香的痕还在。灰是冷的，龛里什么也没供。',
      opts: [
        { label: '把歪的香痕扶一扶', fx: {}, ok: '香灰一碰就塌了些。你没再动。' },
        { label: '退出来',           fx: {}, ok: '你退了出来。龛还是空的，谁也不知道供过谁。' }
      ]
    },
    rope_bridge: {
      icon: '🪢', name: '崖间断了的老索',
      text: '一道旧索横在崖间，中间断了，两头还拴得牢。断口磨得发亮，不是一刀砍的。',
      opts: [
        { label: '拽了拽这头', fx: {}, ok: '这头还结实。你松了手，索子在空中晃了两下。' },
        { label: '另找路',     fx: {}, ok: '你沿崖边绕过去。那半截索子一直垂着，没再动。崖那边是塔后的封门，两条门锁都是新的。' }
      ]
    },

    /* ---- 卷四 · 宗门来客 ---- */
    outer_disciple: {
      icon: '📕', name: '岔口打转的弟子',
      text: '外门弟子捧着册子在岔口打转，见你过来，想问又没开口，先把手里的册子换了只手拿。',
      opts: [
        { label: '停下来等他问', fx: {}, ok: '他问了藏经阁怎么走。你指了，他道谢时册子还是拿反的。' },
        { label: '指了路就走',   fx: {}, ok: '你抬手指了指。走出几步，听见他在身后小声道了谢。' }
      ]
    },
    elder_errand: {
      icon: '📜', name: '执事没带出去的话',
      text: '执事在廊下拦住你，说有句话要带给某位师叔，想了想又说：「算了，我自己去。」',
      opts: [
        { label: '说可以顺路带', fx: {}, ok: '他摆摆手，说不难得跑一趟。你走出两步，看见他从袖里抽出一张字条又按了回去——那字迹你见过。' },
        { label: '点头让开',     fx: {}, ok: '你让开半步。他往另一头去了，脚步不快。' }
      ]
    },
    scripture_copy: {
      icon: '🖋️', name: '抄经的少年',
      text: '抄经的少年伏在案上，一页抄到末尾停了笔，把那页轻轻揭起来，对着光看了看。',
      opts: [
        { label: '放轻脚步走过去', fx: {}, ok: '你走得很轻。他没抬头，把纸铺回原处继续抄。' },
        { label: '站一会儿',       fx: {}, ok: '他一直没发现有人。你站了会儿，也就走了。' }
      ]
    },
    refuse_pill: {
      icon: '⚱️', name: '丹房后墙根的废渣',
      text: '丹房后墙根倒着一炉废渣，还温着。旁边搁了张记废的纸，写着「火候过了半刻」，字迹很平。',
      opts: [
        { label: '把纸压好别被风刮走', fx: {}, ok: '你拿块小石压住纸角。炉渣慢慢凉了。' },
        { label: '不碰，走开',         fx: {}, ok: '你走开了。那半刻的差错，没人再提起。' }
      ]
    },
    gate_night: {
      icon: '🏮', name: '山门换班',
      text: '山门夜值的弟子换了班，前一班把灯笼递过去，两人没说话，只把提手换了个手。',
      opts: [
        { label: '从侧门进去，不惊动',   fx: {}, ok: '你从侧门进去。灯笼换了手，光还是照着那一级台阶。' },
        { label: '在阶下等灯稳了再走',   fx: {}, ok: '灯稳了，你才上阶。值夜的没问你是谁，只把手里的册子换了只手拿——像上回岔口那个弟子。' }
      ]
    },
    return_robe: {
      icon: '🥋', name: '归还的旧道袍',
      text: '执事房门口叠着一件洗净的旧道袍，压了张条子：「还回来了，没写是谁的」。',
      opts: [
        { label: '替它把条子摆正', fx: {}, ok: '你把条子摆正。道袍袖口磨白了，叠得却很齐。' },
        { label: '看一眼就走',     fx: {}, ok: '你走了。那件道袍在门口放到傍晚，才有人收进去。' }
      ]
    },

    /* ---- 卷五 · 故人回响（文本呼应既有 4 条；fx 复用其档位原值，零新增） ---- */
    beggar_again: {
      icon: '🫡', name: '又是那道石阶',
      text: '又是那道石阶。上回那个散修不在，石阶却被人扫干净了，断剑靠在墙根，剑尖朝着路口。',
      opts: [
        { label: '留 10 灵石在阶上', fx: { costStone: 10, wisdom: 50 },
          ok: '你把灵石搁在扫净的石阶上。回来时，灵石没了，剑还靠着。' },
        { label: '把断剑往墙根推正些', fx: {}, ok: '你把剑推正了些。石阶一直干净着，没人再来坐。' }
      ]
    },
    amulet_again: {
      icon: '🧙', name: '老妪的摊子还在',
      text: '草摊还在路口，黄符收进了一只木匣，老妪坐在摊后打盹。见你站住，她没睁眼，只把匣子往你这边推了推。',
      opts: [
        { label: '买一张（30 灵石）', fx: { costStone: 30, boost: { mult: 0.60, sec: 900 } },
          ok: '黄符还是那个烧得参差的边。贴上胸口，温热感走得和上次一样慢。' },
        { label: '替她把匣盖合上', fx: {}, ok: '你轻轻合上匣盖。她没醒，也没咳。' }
      ]
    },
    pouch_again: {
      icon: '👜', name: '又露出半只储物袋',
      text: '土里又露出半只储物袋，这回禁制是新的。袋口系得紧，边上却压着块小石，像是有人特意留了记号。',
      opts: [
        { label: '打开', risk: true, fx: { roll: [
          { w: 6, text: '禁制松了，袋里是攒下的灵石，压着张字条：「给下一个来的」。', fx: { stone: 180 } },
          { w: 4, text: '禁咒没散尽，气海一沉，你退了半步。', fx: { expLoss: 0.08 } }
        ] } },
        { label: '照那记号，原样埋回去', fx: {}, ok: '你把土拍平，小石压回原处。有些东西是留给下一个的。' }
      ]
    },
    stele_again: {
      icon: '🪨', name: '残碑被扶正了',
      text: '残碑被人扶正了，碑脚垫了两块碎石。碑面还是那三个字，你仍旧不认得，只是这回站得近些。',
      opts: [
        { label: '静心再看一会儿', fx: { roll: [
          { w: 5, text: '看了许久，那个卡着的关窍又松了一点。', fx: { insight: 12 } },
          { w: 5, text: '还是只记住「有人等过你」这句话，心却定了些。', fx: { insight: 5, boost: { mult: 0.15, sec: 900 } } }
        ] } },
        { label: '替碑脚再垫一块石', fx: {}, ok: '你捡了块石垫上，碑稳了。风从碑面过去，没留下什么。' }
      ]
    },
    spring_fair: {
      icon: '🧺', name: '刚摆开的春市',
      text: '开春的集市刚摆开，卖什么的都还没定，摊主们各自把空筐倒扣着晾。有个小孩在筐间穿来穿去，谁也没拦。',
      opts: [
        { label: '挑个空筐帮着翻过来', fx: {}, ok: '你翻好一只筐。摊主远远点了下头，继续晾他的。' },
        { label: '沿摊慢慢走一圈',     fx: {}, ok: '你走了一圈，什么也没买。日头把筐影挪短了些。' }
      ]
    },
    first_snow: {
      icon: '❄️', name: '第一场雪',
      text: '夜里落了第一场雪，不厚。清早山门口一行脚印，从里往外，到阶下就停了，没有回来的。',
      opts: [
        { label: '在阶上站一会儿',   fx: {}, ok: '你站了会儿。雪盖住了脚印，也盖住了停下的地方。' },
        { label: '拿扫帚把阶扫出来', fx: {}, ok: '你把台阶扫净。那行脚印留在阶下，没舍得扫。' }
      ]
    }
  };

  /* ============ 历练 · 文字冒险（点【历练】随机抽事件，选项即时结算） ============ */
  /* action: battle = 以战力对决（赢 +50 灵石 / 输 −10 修为）；escape = 明哲保身（+5 修为） */
  const ADV_STONE = 50, ADV_EXP_LOSS = 10, ADV_ESCAPE_EXP = 5;
  /* 阶段二 N9：历练三档改为按当前层需求缩放（低段由常量下限兜住，行为不变）：
     胜 = max(50, need×0.5)、败 = max(10, need×0.005)、绕行 = max(5, need×0.01)。 */
  const advWinStone  = () => Math.max(ADV_STONE, Math.floor(needOf(S.rank) * 0.5));
  const advLossExp   = () => Math.max(ADV_EXP_LOSS, Math.floor(needOf(S.rank) * 0.005));
  const advEscapeExp = () => Math.max(ADV_ESCAPE_EXP, Math.floor(needOf(S.rank) * 0.01));
  const ADV_EVENTS = [
    {
      id: 1,
      desc: '你在山洞口遇到一只发狂的野狼，獠牙上还挂着涎水，正死死盯着你。你要怎么做？',
      options: [
        { text: '拔剑迎战', action: 'battle' },
        { text: '绕道而行', action: 'escape' }
      ]
    },
    {
      id: 2,
      desc: '荒山夜雨，前方的破庙里透出微光，隐隐有低语声随风飘来。',
      options: [
        { text: '入庙探查', action: 'battle' },
        { text: '雨中赶路', action: 'escape' }
      ]
    },
    {
      id: 3,
      desc: '山涧边生着一株七叶灵参，参下却盘着一条青鳞蛇，正吐着信子。',
      options: [
        { text: '抢参就走', action: 'battle' },
        { text: '退让三分', action: 'escape' }
      ]
    },
    {
      id: 4,
      desc: '一名黑衣修士拦在山道上，斜睨着你说：此路是他开，留下灵石再走。',
      options: [
        { text: '出手教训', action: 'battle' },
        { text: '拱手让路', action: 'escape' }
      ]
    },
    /* D-008「见闻录」历练池 4 → 18：仅在此数组末尾追加 14 条，按地域分层。
       口径：id 顺延 5~18；action 只用 battle / escape（resolveAdventure 只认这两个值，
       结果文案硬编码在结算函数里，本批不改）；text 会拼进「历练·<text>：」日志，故写成可与之前缀连读的短动作。
       desc 沿用既有白描短句调性，零新增字段、零数值、零逻辑改动。 */
    {
      id: 5,
      desc: '溪边饮水时，水底慢慢浮起一片青鳞，不止一条。',
      options: [
        { text: '涉水击退', action: 'battle' },
        { text: '退回岸上', action: 'escape' }
      ]
    },
    {
      id: 6,
      desc: '废弃的矿洞里传来铁器敲石的声音，一下，又一下，不见人出来。',
      options: [
        { text: '进洞查看', action: 'battle' },
        { text: '绕开洞口', action: 'escape' }
      ]
    },
    {
      id: 7,
      desc: '竹林深处有片压倒的竹子，断口还新，旁边的笋被啃了一半。',
      options: [
        { text: '循痕追进去', action: 'battle' },
        { text: '沿竹径绕行', action: 'escape' }
      ]
    },
    {
      id: 8,
      desc: '雪线上蹲着一只白毛的东西，一动不动，只有呼出的白气在动。',
      options: [
        { text: '上前驱赶', action: 'battle' },
        { text: '隔着雪坡避开', action: 'escape' }
      ]
    },
    {
      id: 9,
      desc: '古镇的更楼塌了半边，楼底堆着新翻的土，土里露出半截兽骨。',
      options: [
        { text: '下楼看个究竟', action: 'battle' },
        { text: '沿街另寻宿处', action: 'escape' }
      ]
    },
    {
      id: 10,
      desc: '乱葬岗的荒草没过膝盖，中间有一小片草是倒着长的，像被什么压过。',
      options: [
        { text: '拨草过去', action: 'battle' },
        { text: '从岗边绕开', action: 'escape' }
      ]
    },
    {
      id: 11,
      desc: '石桥下的水声忽然停了。低头看，桥洞里两点光正对着你。',
      options: [
        { text: '跃下桥面', action: 'battle' },
        { text: '快步过桥', action: 'escape' }
      ]
    },
    {
      id: 12,
      desc: '云栈的木板缺了一段，缺口对面的崖壁上，攀着个不像人的影子。',
      options: [
        { text: '贴壁逼过去', action: 'battle' },
        { text: '原路退回', action: 'escape' }
      ]
    },
    {
      id: 13,
      desc: '荒田里立着个戴斗笠的人，你走他也走，你停他也停，始终隔着三垄。',
      options: [
        { text: '横穿田垄过去', action: 'battle' },
        { text: '退回路边', action: 'escape' }
      ]
    },
    {
      id: 14,
      desc: '沙碛上散着几副完整的小兽骨架，头都朝着同一个方向。',
      options: [
        { text: '朝骨架所指走', action: 'battle' },
        { text: '背向而行', action: 'escape' }
      ]
    },
    {
      id: 15,
      desc: '渡口停着一条空船，舱板下有轻微的抓挠声，节奏很匀。',
      options: [
        { text: '掀开舱板', action: 'battle' },
        { text: '解缆另寻渡', action: 'escape' }
      ]
    },
    {
      id: 16,
      desc: '老槐树的树洞里塞满了干草，草窝还是温的，洞口挂着几缕灰毛。',
      options: [
        { text: '守在树边等它回来', action: 'battle' },
        { text: '趁早离开', action: 'escape' }
      ]
    },
    {
      id: 17,
      desc: '山坳里一潭死水，水面不起波，投块石子下去，沉得比寻常慢。',
      options: [
        { text: '俯身探看', action: 'battle' },
        { text: '离潭上岸', action: 'escape' }
      ]
    },
    {
      id: 18,
      desc: '塌了半截的山神庙前，供桌被擦得干净，桌上放着一枚还带体温的兽牙。',
      options: [
        { text: '进庙会一会', action: 'battle' },
        { text: '不惊动，下山', action: 'escape' }
      ]
    }
  ];

  /* ============ 法宝强化 / 洗练（对标一念逍遥的装备养成） ============ */
  /* 5 种词条 × 5 档品质；词条条数 = 法宝品质（下品1 / 中品2 / 上品3 / 极品4） */
  const AFFIX = [
    { id:'exp',   name:'修炼速度', vals:[2, 4, 6, 9, 13] },
    { id:'pow',   name:'战力',     vals:[3, 6, 10, 15, 22] },
    { id:'brk',   name:'突破率',   vals:[1, 2, 3, 5, 7] },
    { id:'stone', name:'灵石产出', vals:[3, 6, 10, 15, 22] },
    { id:'hunt',  name:'猎妖速度', vals:[5, 10, 15, 22, 30] },
    { id:'crit',  name:'暴击率',   vals:[2, 4, 6, 9, 13] }   /* 加区：基础暴击 + 词条值（战斗演出读取） */
  ];
  const AFFIX_Q = ['凡品', '灵品', '宝品', '仙品', '神品'];
  const AFFIX_CLS = ['q0', 'q1', 'q2', 'q3', 'q4'];
  const AFFIX_W = [40, 30, 18, 9, 3];
  const affixMeta = id => AFFIX.find(a => a.id === id);
  const affixN = () => Math.max(0, Math.min(4, S.weapon));   /* 词条条数 = 法宝品质 */
  function rollAffixQ(){
    const tot = AFFIX_W.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    for(let i = 0; i < AFFIX_W.length; i++){ r -= AFFIX_W[i]; if(r <= 0) return i; }
    return 0;
  }
  /* keep：要保留原词条的槽位下标（锁定）。未锁槽位从剩余词条池里抽，保证同一法宝不出现重复词条 */
  function rollAffix(keep){
    const n = affixN(), out = [], used = new Set();
    (keep || []).forEach(i => {
      const old = S.affix[i];
      if(i >= 0 && i < n && old && affixMeta(old.id) && !used.has(old.id)){
        out[i] = { id: old.id, q: old.q }; used.add(old.id);
      }
    });
    const pool = AFFIX.filter(a => !used.has(a.id));
    for(let i = 0; i < n; i++){
      if(out[i]) continue;
      const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      if(!a) break;
      out[i] = { id: a.id, q: rollAffixQ() };
    }
    return out.filter(Boolean);
  }
  const affixSum = id => S.affix.reduce((s, x) => {
    const a = affixMeta(id);
    return (x.id === id && a) ? s + a.vals[x.q] : s;
  }, 0);
  /* 各词条加成（换算成乘区 / 加区） */
  const affixExpMult = () => 1 + affixSum('exp') / 100;
  const affixPowMult = () => 1 + affixSum('pow') / 100;
  const affixStoneMult = () => 1 + affixSum('stone') / 100;
  const affixHuntMult = () => 1 + affixSum('hunt') / 100;
  const affixBreak = () => affixSum('brk') / 100;
  /* 暴击率（加区）：基础值 + 洗练词条；战斗演出初始化时读取，老档无 crit 词条时为基础值 */
  const affixCritRate = () => BAL.baseCritRate + affixSum('crit') / 100;
  /* 强化加成：修炼速度 +3%/级、战力 +5%/级 */
  const enhanceExpMult = () => 1 + S.weaponLv * BAL.enhanceExpRate;
  const enhancePowMult = () => 1 + S.weaponLv * BAL.enhancePowRate;
  /* 强化消耗：矿石 + 灵石，+5 起追加 Boss 稀有材料 */
  function enhanceMat(){
    const lv = S.weaponLv;
    if(lv < BAL.enhanceMatFrom) return null;
    if(lv < 10) return 'boss_core';
    if(lv < 15) return 'boss_pearl';
    if(lv < 20) return 'boss_feather';
    return 'boss_heart';
  }
  function enhanceCost(){
    const baseOre = BAL.enhanceOreBase + BAL.enhanceOreStep * S.weaponLv;
    return {
      ore: Math.max(1, Math.ceil(baseOre * (1 - dtOreDisc() / 100))),
      stone: Math.floor(needOf(S.rank) * BAL.enhanceStoneK * Math.pow(BAL.enhanceStoneR, S.weaponLv)),
      mat: enhanceMat(), n: 1
    };
  }
  /* 强化成功率：每级 -3%，最低 55%；洞天加成加在下限之后、1 之前；祝福值满则必成（护肝） */
  function enhanceChance(){
    if(S.weaponBless >= BAL.enhanceBlessMax) return 1;
    return Math.min(1, Math.max(BAL.enhanceMinChance, 1 - S.weaponLv * BAL.enhanceFailPer) + dtEnhPct() / 100);
  }
  /* P1：强化/洗练资源不足的可见结果（不只日志区） */
  function enhSay(text, bad){
    const el = document.getElementById('xx-enh-msg');
    if(!el) return;
    el.textContent = text || '';
    el.className = 'farm-msg ' + (text ? (bad ? 'bad' : 'good') : '');
    if(el._t) clearTimeout(el._t);
    if(text) el._t = setTimeout(function(){ el.textContent = ''; el.className = 'farm-msg'; }, 3600);
  }
  function enhanceWeapon(){
    if(S.weapon <= 0){ log('还没有法宝，先去炼器坊炼一件。', 'bad'); enhSay('尚无法宝，先去炼器坊炼一件。', true); return; }
    if(S.weaponLv >= BAL.enhanceMax){ log('法宝已强化到 +' + BAL.enhanceMax + '，炉火纯青。', 'gold'); enhSay('已满级 +' + BAL.enhanceMax + '。', false); return; }
    const c = enhanceCost();
    if(S.ore < c.ore){ log('矿石不足，强化 +' + (S.weaponLv + 1) + ' 要 ' + c.ore + ' 块（矿脉产）。', 'bad'); enhSay('矿石差 ' + (c.ore - S.ore) + '（要 ' + c.ore + '）。', true); return; }
    if(S.stone < c.stone){ log('灵石不足，强化 +' + (S.weaponLv + 1) + ' 要 ' + fmt(c.stone) + ' 灵石。', 'bad'); enhSay('灵石差 ' + fmt(c.stone - S.stone) + '（要 ' + fmt(c.stone) + '）。', true); return; }
    if(c.mat && countItem(c.mat) < c.n){
      log('缺「' + ((ITEMS[c.mat] || {}).n || '稀有材料') + '」×1，强化 +' + (S.weaponLv + 1) + ' 要它（打 Boss 掉）。', 'bad');
      enhSay('缺【' + ((ITEMS[c.mat] || {}).n || '稀有材料') + '】×1（打 Boss 掉）。', true); return;
    }
    S.ore -= c.ore; S.stone -= c.stone;
    if(c.mat) removeItems(c.mat, c.n);
    S.stats.enhance = (S.stats.enhance || 0) + 1;
    if(Math.random() < enhanceChance()){
      S.weaponLv++; S.weaponBless = 0;
      log('✨ 强化成功！法宝 +' + S.weaponLv + '（修炼 ×' + enhanceExpMult().toFixed(2) + '、战力 ×' + enhancePowMult().toFixed(2) + '）', 'gold');
      enhSay('强化成功：+' + S.weaponLv + '（修炼 ×' + enhanceExpMult().toFixed(2) + '、战力 ×' + enhancePowMult().toFixed(2) + '）。', false);
      sfx.win();
    }else{
      S.weaponBless++;
      log('💥 强化失败，材料没了。祝福值 ' + S.weaponBless + '/' + BAL.enhanceBlessMax + '（满了必成，失败不掉级）。', 'bad');
      enhSay('强化失败，祝福 ' + S.weaponBless + '/' + BAL.enhanceBlessMax + '（满了必成）。', true);
      sfx.click();
    }
    save(); render(); renderEnhance();
  }
  /* 洗练（同步结算版）：固定底价 RR_COST 灵石，锁词条后按 2^锁数 加价——与洗练弹窗
     （openReroll / doRerollSpin 老虎机演出）最终结算口径一致，仅无演出；测试与兼容调用走这里 */
  function rerollAffix(lockIdx){
    if(S.weapon <= 0){ log('还没有法宝，洗练不了。', 'bad'); return; }
    const locks = lockIdx || [];
    const cost = rrCost(locks.length);
    if(S.stone < cost){ log('灵石不足，洗练要 ' + fmt(cost) + ' 灵石。', 'bad'); enhSay('灵石差 ' + fmt(cost - S.stone) + '（洗练要 ' + fmt(cost) + '）。', true); return; }
    S.stone -= cost;
    const old = S.affix.slice();
    S.affix = rollAffix(locks);
    log('🎲 洗练' + (locks.length ? '（锁 ' + locks.length + ' 条）' : '') + '：' + affixText(S.affix) +
      (old.length ? '（原 ' + affixText(old) + '）' : ''), 'gold');
    sfx.win();
    save(); render(); renderEnhance();
  }
  function affixText(list){
    if(!list || !list.length) return '无词条';
    return list.map(x => {
      const a = affixMeta(x.id);
      return a ? (AFFIX_Q[x.q] + '·' + a.name + ' +' + a.vals[x.q] + '%') : '';
    }).filter(Boolean).join('、');
  }
  function renderEnhance(){
    const box = document.getElementById('xx-enhance');
    if(!box) return;
    if(S.weapon <= 0){
      box.innerHTML = '<div class="enh-empty">' +
        '<img src="ui/icons/weapon1.png" alt="" style="width:48px;height:48px;opacity:.35">' +
        '<b>尚无法宝</b><p>先去炼器坊炼一件，再回来强化与洗练。</p>' +
        '<button type="button" class="enh-btn" id="xx-enh-go">去炼器坊</button></div>';
      const go = document.getElementById('xx-enh-go');
      if(go) go.onclick = () => { try{ ROUTER.open('dong', 'xx-forge-sec'); }catch(e){} };
      return;
    }
    const c = enhanceCost();
    const ch = enhanceChance();
    const maxed = S.weaponLv >= BAL.enhanceMax;
    /* A4a（2026-11-20）：先明示强化对象与适用范围（纯呈现，无数值改动） */
    const wname = weaponName(S.weapon);
    let html = '<div class="enh-head">' +
      '<span>强化对象：<b>' + wname + '</b> · 灵器（主器） · 当前 +' + S.weaponLv + '</span>' +
      '<span>修炼 ×' + enhanceExpMult().toFixed(2) + ' · 战力 ×' + enhancePowMult().toFixed(2) + '</span></div>' +
      '<div class="enh-rule">强化档四族共用：灵器全额（修炼 +3%／战力 +5% 每级）；战器 / 破器 / 财器按 30% 系数受益（战器 +1.5% 战力／破器 +0.15pp 突破成功率／财器 +0.6% 灵石，每级），需先获得该族法器。</div>';
    const costList = [{ t: 'ore', n: c.ore }, { t: 'stone', n: c.stone }];
    if(c.mat) costList.push({ t: c.mat, n: c.n });
    html += '<div class="enh-cost">强化消耗：' + matLedger(costList) + '</div>';
    if(dtEnhPct() > 0 || dtOreDisc() > 0){
      html += '<div class="enh-dt">洞天加成：' +
        (dtEnhPct() > 0 ? '强化成功率 +' + dtNum(dtEnhPct()) + '%' : '') +
        (dtEnhPct() > 0 && dtOreDisc() > 0 ? ' · ' : '') +
        (dtOreDisc() > 0 ? '矿石消耗 −' + dtNum(dtOreDisc()) + '%' : '') + '</div>';
    }
    html += '<div class="enh-bar"><div class="enh-track"><i style="width:' + (S.weaponLv / BAL.enhanceMax * 100).toFixed(1) + '%"></i></div>' +
      '<span>' + S.weaponLv + ' / ' + BAL.enhanceMax + '</span></div>';
    if(!maxed){
      const nlv = S.weaponLv + 1;
      /* A24：本次强化到 +nlv 的成功率就是 enhanceChance()（按当前等级算，含祝福必成与洞天加成）。
         旧代码拿 nlv 再算一次，等于显示的是「下下级」概率，比按钮与实际结算低约 3 个百分点。 */
      html += '<div class="enh-next">下一级 +' + nlv +
        '：修炼 ×' + (1 + nlv * BAL.enhanceExpRate).toFixed(2) +
        ' · 战力 ×' + (1 + nlv * BAL.enhancePowRate).toFixed(2) +
        ' · 成功率 ' + Math.round(ch * 100) + '%</div>';
    }
    html += '<button class="enh-btn" data-act="enhance"' + (maxed ? ' disabled' : '') + '>' +
      (maxed ? '已满级 +' + BAL.enhanceMax : '⚒️ 强化到 +' + (S.weaponLv + 1) + '（成功率 ' + Math.round(ch * 100) + '%' +
        (S.weaponBless > 0 ? ' · 祝福 ' + S.weaponBless + '/' + BAL.enhanceBlessMax : '') + '）') + '</button>';
    html += '<div class="enh-affix">' + affixText(S.affix) + '</div>';
    html += '<button class="enh-btn reroll" data-act="reroll">' + inkIco('🎲') + '洗练词条（' + fmt(RR_COST) + ' 灵石起）</button>';
    html += '<p class="hint">强化吃矿石和灵石，+5 起要 Boss 稀有材料 · 失败不掉级，攒满 ' + BAL.enhanceBlessMax + ' 次祝福必成 · 洗练可先锁住满意的词条，只重掷其余（老虎机演出）</p>';
    box.innerHTML = html;
    /* D-003 事件委托 */
    if (!box.dataset.d_binded) {
      box.dataset.d_binded = '1';
      box.addEventListener('click', ev => {
        const b = ev.target.closest('[data-act]');
        if (b) { ev.stopPropagation(); if (b.dataset.act === 'enhance') enhanceWeapon(); else openReroll(); }
      });
    }
  }

  /* ============ 法宝洗练：老虎机词条槽（纯 CSS 动画，无任何图片素材） ============ */
  const RR_COST     = 5000;   /* 底价 5000 灵石；每多锁 1 条价格翻倍 */
  const RR_ROLL_MS  = 1500;   /* 滚动时长 1.5s */
  const RR_STOP_GAP = 200;    /* 未锁槽位依次落定，间隔 0.2s */
  const RR_REEL_N   = 8;      /* 卷轴一条序列的条数（×2 份实现无缝循环） */
  let rrSpinning = false;
  const rrLocks = new Set();  /* 本次洗练要保留的槽位（不写存档，关页面即散） */

  /* 单条词条行：品质决定 CSS class（q0 白 / q1 绿 / q2 蓝 / q3 紫 / q4 金） */
  function rrLineHTML(a, q){
    return '<div class="rr-line ' + AFFIX_CLS[q] + '">' +
      AFFIX_Q[q] + '·' + a.name + ' +' + a.vals[q] + '%</div>';
  }
  /* 随机词条（用于滚动过程中的假象） */
  function rrRandLine(){
    const a = AFFIX[Math.floor(Math.random() * AFFIX.length)];
    return rrLineHTML(a, rollAffixQ());
  }
  /* 滚动卷轴：一条序列重复两份，配合 translateY(-50%)→0 无缝向下滚 */
  function rrReelHTML(){
    let seq = '';
    for(let i = 0; i < RR_REEL_N; i++) seq += rrRandLine();
    return '<div class="rr-reel">' + seq + seq + '</div>';
  }
  /* 落定后的最终词条 */
  function rrSlotHTML(x){
    const a = affixMeta(x.id);
    if(!a) return '<div class="rr-line rr-locked">—</div>';
    return '<div class="rr-line rr-final ' + AFFIX_CLS[x.q] + '">' +
      AFFIX_Q[x.q] + '·' + a.name + ' +' + a.vals[x.q] + '%</div>';
  }
  function rrSlotCount(){ return Math.min(4, affixN()); }   /* 品质 1~4 对应 1~4 槽 */
  function rrCost(locks){ return RR_COST * Math.pow(2, Math.max(0, locks | 0)); }
  function rrMaxLocks(){ return Math.max(0, rrSlotCount() - 1); }   /* 至少留一条参与洗练 */

  function rrLockBtn(i, locked){
    return '<button class="rr-lock' + (locked ? ' on' : '') + '" data-lock="' + i + '"' +
      (rrSpinning ? ' disabled' : '') + '>' + (locked ? '已锁' : '锁') + '</button>';
  }
  /* 重绘槽位与价格提示：开窗、锁/解锁、洗练结束共用一套口径 */
  function rrPaint(){
    const n = rrSlotCount(), canLock = rrMaxLocks() > 0;
    for(let i = 0; i < 4; i++){
      const el = document.getElementById('rr-slot-' + i);
      if(!el) continue;
      const open = i < n && !!S.affix[i];
      const locked = open && rrLocks.has(i);
      el.className = 'rr-slot' + (locked ? ' locked' : '');
      el.innerHTML = open ? rrSlotHTML(S.affix[i]) + (canLock ? rrLockBtn(i, locked) : '')
        : '<div class="rr-line rr-locked">' + (i < n ? '待洗练' : '未开启（法宝品质不足）') + '</div>';
    }
    rrPaintCost();
  }
  function rrPaintCost(){
    const locks = rrLocks.size, cost = rrCost(locks);
    const go = document.getElementById('rr-go');
    if(go){
      go.disabled = rrSpinning;
      /* 按钮图标走水墨 PNG（emoji 在 Windows 上是彩色的，和素墨界面打架）；
         这里只有静态串与数字进 innerHTML，没有玩家输入。 */
      go.innerHTML = '<img class="btn-ic" src="ui/icons/ic_die.png" alt="">' +
        (rrSpinning ? '洗练中…'
          : locks ? '洗练保留 ' + locks + ' 条（' + fmt(cost) + ' 灵石）'
          : '洗练词条（' + fmt(cost) + ' 灵石）');
    }
    document.querySelectorAll('#reroll-modal .rr-lock').forEach(b => { b.disabled = rrSpinning; });
    const hint = document.getElementById('rr-lockhint');
    if(!hint) return;
    const maxL = rrMaxLocks();
    hint.textContent = locks
      ? '已锁 ' + locks + ' 条 · 本次 ' + fmt(cost) + ' 灵石 · 每多锁 1 条价格翻倍'
      : maxL <= 0
        ? '当前只有 1 条词条，至少留一条参与洗练，暂不能锁定。'
        : '点槽位右侧「锁」可保留该词条（最多 ' + maxL + ' 条）；锁 1 条 ' + fmt(rrCost(1)) + '，之后每多锁 1 条价格翻倍。';
  }

  function openReroll(){
    const modal = document.getElementById('reroll-modal');
    if(!modal) return;
    if(S.weapon <= 0){ log('还没有法宝，先去炼器坊炼一件。', 'bad'); return; }
    if(rrSpinning) return;
    const card = modal.querySelector('.rr-card');
    if(card) card.classList.remove('rr-jackpot');
    document.getElementById('rr-weapon').textContent = weaponName(S.weapon) + ' +' + S.weaponLv;
    const n = rrSlotCount();
    Array.from(rrLocks).forEach(i => { if(i >= n || !S.affix[i]) rrLocks.delete(i); });
    if(rrLocks.size >= n) rrLocks.clear();   /* 法宝品质变低后，别留「全锁」的死局 */
    rrPaint();
    modal.classList.remove('hidden');
  }
  function closeReroll(){
    if(rrSpinning) return;                       /* 滚动中不允许关，避免结算错乱 */
    const modal = document.getElementById('reroll-modal');
    if(modal) modal.classList.add('hidden');
  }

  /* 洗练：扣灵石 → 未锁槽位滚动 → 1.5s 后依次落定 → 金色触发金光 + 震动 */
  function doRerollSpin(){
    if(rrSpinning) return;
    if(S.weapon <= 0){ log('还没有法宝，洗练不了。', 'bad'); return; }
    const n = rrSlotCount();
    Array.from(rrLocks).forEach(i => { if(i >= n || !S.affix[i]) rrLocks.delete(i); });
    if(rrLocks.size >= n) rrLocks.clear();
    const locks = new Set(rrLocks);
    const cost = rrCost(locks.size);
    if(S.stone < cost){ log('灵石不足，洗练要 ' + fmt(cost) + ' 灵石。', 'bad'); enhSay('灵石差 ' + fmt(cost - S.stone) + '（洗练要 ' + fmt(cost) + '）。', true); return; }
    S.stone -= cost;
    save(); render();
    rrSpinning = true;
    const card = document.querySelector('#reroll-modal .rr-card');
    if(card) card.classList.remove('rr-jackpot');
    for(let i = 0; i < 4; i++){
      const el = document.getElementById('rr-slot-' + i);
      if(!el) continue;
      if(i >= n){
        el.className = 'rr-slot';
        el.innerHTML = '<div class="rr-line rr-locked">未开启（法宝品质不足）</div>';
      }else if(locks.has(i)){
        el.className = 'rr-slot locked';       /* 锁住的槽不滚，直接留在原位 */
        el.innerHTML = rrSlotHTML(S.affix[i]) + rrLockBtn(i, true);
      }else{
        el.className = 'rr-slot';
        el.innerHTML = rrReelHTML();
      }
    }
    rrPaintCost();
    const result = rollAffix(Array.from(locks));
    const openIdx = [];
    for(let i = 0; i < n; i++) if(!locks.has(i)) openIdx.push(i);
    if(!openIdx.length){ rrFinish(result, false); return; }
    let jackpot = false;
    openIdx.forEach((i, k) => {
      setTimeout(() => {
        const el = document.getElementById('rr-slot-' + i);
        const a = result[i];
        if(!el || !a) return;                      /* 词条为空不得继续：rrSlotHTML(undefined) 会抛错，
                                                      抛在 setTimeout 里无人捕获 → rrFinish 永不执行 → rrSpinning 永久 true → 洗练锁死 */
        el.className = 'rr-slot';
        el.innerHTML = rrSlotHTML(a) + rrLockBtn(i, false);
        if(a.q >= 4) jackpot = true;   /* 只认新掷出的金；锁住的旧神品不重复放光 */
        sfx.click();
        if(k === openIdx.length - 1) setTimeout(() => rrFinish(result, jackpot), RR_STOP_GAP + 140);
      }, RR_ROLL_MS + k * RR_STOP_GAP);
    });
  }
  function rrFinish(result, jackpot){
    S.affix = result;
    rrSpinning = false;                            /* 先复位：无论后面哪一步出错，UI 都不会被锁死 */
    rrPaintCost();
    log('🎲 洗练' + (rrLocks.size ? '（锁 ' + rrLocks.size + ' 条）' : '') + '：' + affixText(S.affix), 'gold');
    const card = document.querySelector('#reroll-modal .rr-card');
    if(jackpot){
      if(card){ card.classList.remove('rr-jackpot'); void card.offsetWidth; card.classList.add('rr-jackpot'); }
      if(window.playLevelUpSound) window.playLevelUpSound(); else sfx.win();
      log('✨ 神品现世！宝光冲霄。', 'gold');
      setTimeout(() => { if(card) card.classList.remove('rr-jackpot'); }, 1100);
    }else{
      sfx.win();
    }
    save(); render(); renderEnhance();
  }

  /* 弹窗一次性绑定（dataset 守卫防重复） */
  (function bindRerollModal(){
    const modal = document.getElementById('reroll-modal');
    if(!modal || modal.dataset.bound) return;
    modal.dataset.bound = '1';
    const x = document.getElementById('rr-close');
    if(x) x.addEventListener('click', closeReroll);
    modal.addEventListener('click', ev => { if(ev.target === modal) closeReroll(); });
    const g = document.getElementById('rr-go');
    if(g) g.addEventListener('click', doRerollSpin);
    const slots = modal.querySelector('.rr-slots');
    if(slots) slots.addEventListener('click', ev => {
      const b = ev.target.closest ? ev.target.closest('.rr-lock') : null;
      if(!b || rrSpinning) return;
      const i = Number(b.dataset.lock);
      if(!(i >= 0) || i >= rrSlotCount() || !S.affix[i]) return;
      if(rrLocks.has(i)){ rrLocks.delete(i); }
      else{
        if(rrLocks.size >= rrMaxLocks()){
          log('洗练至少要留一条词条，最多锁 ' + rrMaxLocks() + ' 条。', 'bad'); return;
        }
        rrLocks.add(i);
      }
      rrPaint();
    });
  })();

  /* ============ 限时活动（七日签到 + 仙盟争霸） ============ */
  /* 七日签到：连续 7 天一轮，第 7 天大奖；断签从第一天重新计 */
  const SIGN_REWARD = [
    { txt: '灵石（需求 ×0.5）', stone: 0.5 },
    { txt: '灵草 ×30',          herb: 30 },
    { txt: '下品丹药 ×1',       item: 'dan1', n: 1 },
    { txt: '矿石 ×50',          ore: 50 },
    { txt: '中品丹药 ×1',       item: 'dan2', n: 1 },
    { txt: '妖兽蛋 ×1',         egg: 1 },
    { txt: '极品破境丹 ×1（周大奖）', item: 'dan4', n: 1, big: true }
  ];
  /* 仙盟争霸：赛季内每日出战一次攒战功，战功换强化材料（阶段二 N4 重定价：单季上限 553 可兑完五档） */
  const UNION_REWARD = [
    { merit: 60,  txt: '灵石（需求 ×2）+ 灵草 50' },
    { merit: 180, txt: '中品丹药 ×1 + 矿石 100' },
    { merit: 330, txt: '妖兽蛋 ×1' },
    { merit: 450, txt: '兽王精魄 ×1（强化材料）' },
    { merit: 540, txt: '蛟龙珠 ×1（强化材料）' }
  ];
  /* 原 ydayKey()（昨天的未补零日期键）在断签判定改用 dayNo 比较后已无调用点，随本次一并删除——
     留着会让人以为它还在参与签到判定。 */
  const signIdx = () => S.sign.days % SIGN_REWARD.length;
  /* 只能"日期往后走"才能再签。原为 `!==`：把系统日期改成明天就能再签一次、
     连签天数照涨，改回去再改一次还能继续 —— 七天大奖可以无限刷。
     dayNo 兼容历史未补零的 last（'2026-11-8'）。 */
  const signCanClaim = () => dayNo(S.sign.last) < todayNo();
  /* batch6：签到天数显示口径——已签今天时显示「刚签的那一天」，未签时显示「今天可签的那一天」。
     旧写法一律 (days%7)+1，签完第 7 天后会显示第 1 天，和实际操作对不上。 */
  const signDayLabel = () => {
    const m = (S.sign.days | 0) % 7;
    return signCanClaim() ? (m + 1) : (m === 0 ? 7 : m);
  };
  function claimSign(){
    if(!signCanClaim()){ log('今日已签到，明日再来。', 'bad'); return; }
    /* 断签重置：除空值外，只有"上次签到正好是昨天"才保留连签，
       其余（含系统时间往前/往后跳）一律从头算。昨天用真实日期差求得，
       不用 dayNo 做减法（YYYYMMDD 减 1 在月初会算出非法日期）。 */
    if(S.sign.last !== ''){
      const yd = new Date(Date.now() - 86400000);
      const yNo = yd.getFullYear() * 10000 + (yd.getMonth() + 1) * 100 + yd.getDate();
      if(dayNo(S.sign.last) !== yNo) S.sign.days = 0;
    }
    const rw = SIGN_REWARD[signIdx()];
    const srows = [];
    let signStone = 0;
    if(rw.stone){
      const v = Math.floor(needOf(S.rank) * rw.stone);
      signStone = v;
      S.stone += v; S.stats.stoneEarned += v;
      srows.push(settleLine('灵石', '+' + fmt(v), 'good'));
    }
    if(rw.herb){ S.herb += rw.herb; srows.push(settleLine('灵草', '+' + rw.herb, 'good')); }
    if(rw.ore){ S.ore += rw.ore; srows.push(settleLine('矿石', '+' + rw.ore, 'good')); }
    let signMail = 0;
    if(rw.item){ const r = addItemEx(rw.item, ((ITEMS[rw.item] || {}).n) || rw.item); if(r.mail) signMail++; srows.push(settleLine('丹药 · ' + ((ITEMS[rw.item] || {}).n || rw.item), '+1' + (r.mail ? '（入信匣）' : ''), r.mail ? 'bad' : 'good')); }
    if(rw.item2){ const r = addItemEx(rw.item2, ((ITEMS[rw.item2] || {}).n) || rw.item2); if(r.mail) signMail++; srows.push(settleLine('丹药 · ' + ((ITEMS[rw.item2] || {}).n || rw.item2), '+1' + (r.mail ? '（入信匣）' : ''), r.mail ? 'bad' : 'good')); }
    if(rw.egg){
      /* 与其它产出点同口径封顶：否则蛋可以摞过 petEggMax，下次读档被 slice(0,20) 静默吞掉。
         满篓时不假装"留着"（信匣并没有这个入口），而是明确告诉玩家今天这枚没拿到、
         且**不推进签到天数**——让玩家清完蛋篓再来领，奖励不会凭空气化。 */
      if(S.eggs.length >= BAL.petEggMax){
        log('🐣 签到第 ' + (S.sign.days + 1) + ' 天是大奖，但蛋篓已满（' + BAL.petEggMax + ' 枚）：先去灵兽园孵化，腾出位置再来领。', 'bad');
        save(); render();
        return false;
      }
      const can = BEASTS.filter(b => S.rank >= b.rank - 1);
      const b = can[Math.floor(Math.random() * can.length)] || BEASTS[0];
      S.eggs.push({ bid: b.id });
      srows.push(settleLine('妖兽蛋', '+1（' + b.name + '）', 'good'));
    }
    S.sign.days++;
    S.sign.last = todayKey();
    /* 悟道值产出途径之一：每日签到（×境界系数） */
    const wg = wisdomGain(WISDOM.wisdomSign);
    S.wisdom = moneyInt(S.wisdom) + wg;
    srows.push(settleLine('悟道值', '+' + wg, 'good'));
    log('🎁 签到成功（第 ' + S.sign.days + ' 天）：' + rw.txt + '，悟道值 +' + wg +
        (signMail > 0 ? '（背包已满，' + signMail + ' 件丹药暂存信匣）' : ''), rw.big ? 'gold' : 'good');
    showSettle({
      icon: '🎁', title: '签到结算 · 第 ' + S.sign.days + ' 天', sub: rw.txt,
      rows: srows, note: '逐项按本次实际入账列明；断签会从头计，蛋篓满时不再收蛋。'
    });
    sfx.win();
    save(); render(); renderEvent(); renderBag();
  }
  /* 阶段二 N4：赛季天数不再封顶到 7 —— 旧写法 min(7, 真实天数) 让第 8 天起永远显示第 7 天，
     resetUnion() 的「> 7 天」分支成为死代码，战功永不清零。现在返回真实天数，由 resetUnion 结算并开新季。 */
  const unionDay = () => {
    const start = S.union.start || Date.now();
    return Math.floor((Date.now() - start) / 86400000) + 1;
  };
  function resetUnion(){
    if(!S.union.start){ S.union.start = Date.now(); S.union.season = 1; }
    if(unionDay() > BAL.unionDays && S.union.merit >= 0){
      /* 赛季到期：结算并开新赛季 */
      S.union.start = Date.now();
      S.union.merit = 0;
      S.union.claimed = [];
      S.union.season = (S.union.season || 1) + 1;
      S.union.day = ''; S.union.left = 0;
      log('🏆 仙盟争霸赛季结算，第 ' + S.union.season + ' 季开打。', 'gold');
    }
    /* 严格递增判定（原为 !==）：改系统日期不再赠送每日出战次数 */
    if(dayNo(S.union.day) < todayNo()){ S.union.day = todayKey(); S.union.left = 1; }
  }
  function unionFight(){
    resetUnion();
    if(S.union.left <= 0){ log('今日已出战，明日再来。', 'bad'); return; }
    const cp = combatPower();
    const foe = Math.floor(cp * (1.0 + Math.random() * 0.6));
    const win = cp * (0.85 + Math.random() * 0.3) >= foe * (0.85 + Math.random() * 0.3);
    S.union.left--;
    const merit = win ? (BAL.unionWinMerit + Math.floor(Math.random() * 20)) : BAL.unionLoseMerit;
    S.union.merit += merit;
    const stone = Math.floor(needOf(S.rank) * (win ? 1.2 : 0.3));
    S.stone += stone; S.stats.stoneEarned += stone;
    log(win ? '🏆 挫败敌盟守将（战力 ' + fmt(foe) + '），战功 +' + merit + '、灵石 +' + fmt(stone)
            : '🏆 不敌敌盟守将（战力 ' + fmt(foe) + '），战功 +' + merit + '、灵石 +' + fmt(stone), win ? 'good' : 'bad');
    if(win) sfx.win(); else sfx.click();
    save(); render(); renderEvent();
  }
  function claimUnion(idx){
    resetUnion();
    const rw = UNION_REWARD[idx];
    if(!rw){ log('奖励不存在，请刷新后重试。', 'bad'); return; } // P0-3 死键反馈（2026-11-13 收口；原型 claimUnionFeedback 经 GPT V3 + Muse 第四方确认）
    if(S.union.claimed.indexOf(idx) >= 0){ log('这份奖励已经领过了。', 'bad'); return; }
    if(S.union.merit < rw.merit){ log('战功不足，要 ' + rw.merit + ' 战功（现有 ' + S.union.merit + '）。', 'bad'); return; }
    let mailN = 0;
    if(idx === 0){ const v = Math.floor(needOf(S.rank) * 2); S.stone += v; S.stats.stoneEarned += v; S.herb += 50; }
    else if(idx === 1){ const r = addItemEx('dan2', '中品丹药'); if(r.mail) mailN++; S.ore += 100; }
    else if(idx === 2){
      if(S.eggs.length >= BAL.petEggMax){ log('蛋篓已满，先去灵兽园孵化。', 'bad'); return; }
      const can = BEASTS.filter(b => S.rank >= b.rank - 1);
      const b = can[Math.floor(Math.random() * can.length)] || BEASTS[0];
      S.eggs.push({ bid: b.id });
    }
    else if(idx === 3){ const r = addItemEx('boss_core', '兽王精魄'); if(r.mail) mailN++; }
    else if(idx === 4){ const r = addItemEx('boss_pearl', '蛟龙珠'); if(r.mail) mailN++; }
    S.union.claimed.push(idx);
    log('🏅 战功兑换：' + rw.txt + (mailN > 0 ? '（背包已满，' + mailN + ' 件暂存信匣）' : ''), 'gold');
    sfx.win();
    save(); render(); renderEvent(); renderBag();
  }
  function renderEvent(){
    /* 日常任务（js/daily.js 模块；红点 = 进度满且未领取） */
    const dBox = document.getElementById('xx-daily');
    if(dBox && typeof Daily !== 'undefined'){
      const tasks = Daily.list();
      const anyReady = tasks.some(t => t.done && !t.claimed);
      let html = '<div class="ev-line"><span>今日任务</span><b>' +
        (Daily.allClaimed() ? '已全部完成' : '已达成 ' + tasks.filter(t => t.done).length + ' / ' + tasks.length + ' 项 · 满进度算 1 项') +
        (anyReady ? '<i class="dot-red"></i>' : '') + '</b></div>';
      html += '<div class="ev-rew-list">';
      tasks.forEach(t => {
        const cfg = Daily.tasks.find(c => c.id === t.id) || {};
        const stone = Math.floor(needOf(S.rank) * (cfg.stoneK || 0));   /* 与 claim 发奖同算法，预览值随境界实时 */
        const wis = wisdomGain(cfg.wisdom || 0);
        const pct = Math.min(100, t.prog / t.goal * 100);
        const ready = t.done && !t.claimed;
        html += '<div class="ev-row' + (t.claimed ? ' got' : '') + '">' +
          '<div class="ev-main"><b>' + t.icon + ' ' + t.name + (ready ? '<i class="dot-red"></i>' : '') + '</b>' +
          '<span>灵石 +' + fmt(stone) + ' · 悟道值 +' + fmt(wis) + '</span>' +
          '<div class="ev-track"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>' +
          (t.claimed ? '<span class="ev-res">已领</span>'
                     : '<button class="ev-btn small" data-daily="' + t.id + '"' + (ready ? '' : ' disabled') + '>' +
                       (ready ? '领取' : t.prog + '/' + t.goal) + '</button>') +
          '</div>';
      });
      html += '</div>';
      html += '<p class="hint">打坐 / 历练 / 爬塔自动计入 · 每日 08:00 重置</p>';
      /* 阶段三 S4：内容没变不重建，避免 500ms 重绘把 mousedown/mouseup 拆到两个节点上 */
      if(dBox.dataset.sig !== html){ dBox.dataset.sig = html; dBox.innerHTML = html; }
      if (!dBox.dataset.d_binded) {
        dBox.dataset.d_binded = '1';
        dBox.addEventListener('click', ev => {
          const b = ev.target.closest('[data-daily]');
          if (!b) return;
          ev.stopPropagation();
          /* Daily.claim 现在返回 Promise：它要在跨标签页互斥锁内完成「读盘→检查→发奖→保存」，
             Web Locks 只有异步 API。这里按住按钮防连点，结果回来再放行。
             （不支持 Web Locks 的环境走 localStorage 租约锁，同样返回 Promise，调用方式一致。） */
          if (b.disabled) return;
          b.disabled = true;
          Promise.resolve(Daily.claim(b.dataset.daily)).then(r => {
            b.disabled = false;
            if (r && r.ok) { sfx.win(); settleDailyClaim(r); render(); renderEvent(); renderBag(); }
            else log((r && r.msg) || '领取失败', 'bad');
          }, () => { b.disabled = false; log('领取失败，请重试。', 'bad'); });
        });
      }
    }
    const sBox = document.getElementById('xx-sign');
    if(sBox){
      const idx = signIdx();
      const done = !signCanClaim();
      const lastClaimed = idx === 0 ? SIGN_REWARD.length - 1 : idx - 1;
      const todayReward = SIGN_REWARD[done ? lastClaimed : idx];
      let html = '<div class="ev-line"><span>连续签到</span><b>' + (S.sign.days % 7 === 0 && S.sign.days > 0 ? '第 7 天（已圆满）' : '第 ' + ((S.sign.days % 7) + (done ? 0 : 1)) + ' 天') + '</b></div>';
      html += '<div class="ev-days">';
      SIGN_REWARD.forEach((rw, i) => {
        /* B38：done（今日已领）时 idx 已经是「下一次待领」的格子，不能再把它标成已领；
           刚领完的是 idx 的前一格（跨 7 天轮回取模）。未领时 idx 才是「今日」格。
           旧写法在已领后把明天的格子也写成已领，与顶栏天数差了一天。 */
        const claimed = done ? (S.sign.days > 0 && i <= lastClaimed) : (i < idx);
        const today = !done && i === idx;
        html += '<div class="ev-day' + (claimed ? ' passed' : '') + (today ? ' now' : '') + '">' +
          '<b>' + (i + 1) + '</b><span>' + (claimed ? '已领' : today ? '今日' : '未领') + '</span></div>';
      });
      html += '</div>';
      /* 线上终验：领完那一下 idx 已滑到明天，旧写法把「明天的奖励」当成「今日奖励」；
         这里固定显示今天这一格（已领则回看上一格），口径与结算同一行表。 */
      html += '<div class="ev-rew">' + (done ? '今日已领：' : '今日可领：') + todayReward.txt + '</div>';
      html += '<button class="ev-btn" data-act="sign"' + (done ? ' disabled' : '') + '>' + (done ? '今日已签到' : inkIco('🎁') + '签到领奖') + '</button>';
      html += '<p class="hint">连续 7 天一轮，第 7 天给极品破境丹 · 断一天从头再来</p>';
      if(sBox.dataset.sig !== html){ sBox.dataset.sig = html; sBox.innerHTML = html; }
      if(!sBox.dataset.d_binded){
        sBox.dataset.d_binded = '1';
        sBox.addEventListener('click', ev => {
          const b = ev.target.closest('[data-act="sign"]');
          if(b && !b.disabled){ ev.stopPropagation(); claimSign(); }
        });
      }
    }
    const uBox = document.getElementById('xx-union');
    if(uBox){
      resetUnion();
      const d = unionDay();
      let html = '';
      html += '<div class="ev-line"><span>赛季</span><b>第 ' + S.union.season + ' 季 · 第 ' + d + ' / ' + BAL.unionDays + ' 天</b></div>';
      html += '<div class="ev-line"><span>战功</span><b>' + S.union.merit + '</b></div>';
      html += '<div class="ev-line"><span>今日出战</span><b>' + S.union.left + ' / 1</b></div>';
      html += '<button class="ev-btn" data-act="fight"' + (S.union.left <= 0 ? ' disabled' : '') + '>' +
        (S.union.left <= 0 ? '今日已出战' : inkIco('⚔️') + '迎战敌盟守将') + '</button>';
      html += '<p class="hint">每日出战一次，赢了战功多 · 赛季结束（7 天）战功清零，记得先兑奖</p>';
      if(uBox.dataset.sig !== html){ uBox.dataset.sig = html; uBox.innerHTML = html; }
      if(!uBox.dataset.d_binded){
        uBox.dataset.d_binded = '1';
        uBox.addEventListener('click', ev => {
          const b = ev.target.closest('[data-act="fight"]');
          if(b && !b.disabled){ ev.stopPropagation(); unionFight(); }
        });
      }
    }
    const rBox = document.getElementById('xx-union-rew');
    if(rBox){
      resetUnion();
      let html = '';
      UNION_REWARD.forEach((rw, i) => {
        const got = S.union.claimed.indexOf(i) >= 0;
        const can = S.union.merit >= rw.merit;
        const pct = Math.min(100, S.union.merit / rw.merit * 100);
        html += '<div class="ev-row' + (got ? ' got' : '') + '">' +
          '<div class="ev-main"><b>' + rw.merit + ' 战功</b><span>' + rw.txt + '</span>' +
          '<div class="ev-track"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>' +
          (got ? '<span class="ev-res">已领</span>' : '<button class="ev-btn small" data-claim="' + i + '"' + (can ? '' : ' disabled') + '>领取</button>') +
          '</div>';
      });
      if(rBox.dataset.sig !== html){ rBox.dataset.sig = html; rBox.innerHTML = html; }
      if (!rBox.dataset.d_binded) {
        rBox.dataset.d_binded = '1';
        rBox.addEventListener('click', ev => {
          const b = ev.target.closest('[data-claim]');
          if (b) { ev.stopPropagation(); claimUnion(Number(b.dataset.claim)); }
        });
      }
    }
  }

  /* ============ 论剑台（道友榜切磋 + 段位 + 声望兑换，对标一念逍遥的竞技） ============ */
  /* 段位按累计声望晋升，每次升段有一次性奖励 */
  const ARENA_TIERS = [
    { name:'外门弟子', rep:0 },
    { name:'内门弟子', rep:60 },
    { name:'真传弟子', rep:180 },
    { name:'执法长老', rep:400 },
    { name:'峰主首座', rep:800 },
    { name:'一地道君', rep:1500 },
    { name:'九霄道尊', rep:3000 }
  ];
  /* 声望兑换（道韵般的硬通货：换材料、换蛋、换容量） */
  const ARENA_SHOP = [
    { id:'dan3',       name:'上品丹药', img:'ui/icons/dan3.png',    rep:30 },
    { id:'egg',        name:'妖兽蛋',   ico:'🥚',                   rep:60 },
    { id:'boss_core',  name:'兽王精魄', img:'ui/icons/boss_core.png', rep:100 },
    { id:'bag',        name:'储物袋',   ico:'🎒',                    rep:150 },
    { id:'boss_pearl', name:'蛟龙珠',   img:'ui/icons/mat_bone.png', rep:220 },
    /* 2026-11-17 批复：删旧猎妖后给 boss_feather / boss_heart 留可再生口 */
    { id:'boss_feather', name:'朱雀羽', img:'ui/icons/boss_feather.png', rep:500 },
    { id:'boss_heart',   name:'九尾心', img:'ui/icons/boss_heart.png',   rep:800 }
  ];
  const SURNAMES = ['李','王','张','陈','云','萧','苏','柳','沈','顾','谢','陆','秦','楚','燕'];
  const DAO_NAMES = ['青玄','无涯','寒山','听雪','问心','素问','太乙','长风','紫阳','太虚','清虚','寻真','沧溟','归墟','孤鸿','暮烟','疏影','忘机'];
  function daoName(used){
    for(let i = 0; i < 20; i++){
      const n = SURNAMES[Math.floor(Math.random() * SURNAMES.length)] + DAO_NAMES[Math.floor(Math.random() * DAO_NAMES.length)];
      if(!used || !used.some(x => x.name === n)) return n;
    }
    return '无名散修';
  }
  const tierOf = () => {
    let t = 0;
    ARENA_TIERS.forEach((x, i) => { if(S.arena.rep >= x.rep) t = i; });
    return t;
  };
  function resetArenaDay(){
    /* >= ：当天（或时钟回拨）就沿用已有对手，只有日期往后走才重掷 */
    if(dayNo(S.arena.day) >= todayNo() && S.arena.foes && S.arena.foes.length) return;
    S.arena.day = todayKey();
    S.arena.left = BAL.arenaDaily;
    rollArenaFoes();
  }
  function rollArenaFoes(){
    const cp = Math.max(10 * POW_K, combatPower());
    const used = [];
    const list = [];
    for(let i = 0; i < BAL.arenaFoes; i++){
      const mul = 0.65 + i * 0.17 + Math.random() * 0.12;   /* 由弱到强排布，最后两个是硬茬 */
      list.push({ name: daoName(used), power: Math.max(10 * POW_K, Math.floor(cp * mul)), beat: false });
      used.push(list[list.length - 1]);
    }
    S.arena.foes = list;
  }
  /* 阶段二 N8：对手境界标签按「相对自己」推算（S.rank + round(log(战力比)/log1.5)），
     不再用绝对战力反推——旧口径在战力乘区膨胀后会把同阶对手标低 1~3 段。 */
  const rankByPower = p => {
    const cp = Math.max(10 * POW_K, combatPower());
    const offset = Math.round(Math.log(Math.max(1e-9, p / cp)) / Math.log(1.5));
    return Math.max(0, Math.min(TOP, (S.rank | 0) + offset));
  };

  /* ---------- 起手式（第 101 轮）----------
     论剑、秘境沿的是第 93 轮的口径「结果先入账、演出后开」，所以决策必须压在掷骰之前：
     点「挑战」先弹一张起手式，选完才结算；关掉等于没打（次数和对手都留着）。
     程序内调用（verify / playtest / 暗房 / 实拍）仍走老签名，默认 'plain' = 原来的掷骰与收益，行为一字不变。 */
  let stanceCb = null;
  function pickStance(cfg, cb){
    const modal = document.getElementById('stance-modal');
    if(!modal){ cb('plain'); return; }
    stanceCb = cb;
    document.getElementById('st-ico').textContent = cfg.icon || '⚔';
    document.getElementById('st-title').textContent = cfg.title || '起手式';
    document.getElementById('st-text').innerHTML = cfg.text || '';
    document.getElementById('st-foot').textContent = cfg.foot || '';
    const box = document.getElementById('st-opts');
    box.innerHTML = (cfg.opts || []).map(o =>
      '<button class="enc-opt' + (o.risk ? ' risk' : '') + '" data-st="' + o.k + '"' + (o.off ? ' disabled' : '') + '>' +
      '<span>' + escHTML(o.n) + '</span><small>' + escHTML(o.d) + '</small></button>').join('');
    if(!box.dataset.bound){
      box.dataset.bound = '1';
      box.addEventListener('click', ev => {
        const b = ev.target.closest('.enc-opt');
        if(!b || b.disabled) return;
        const k = b.dataset.st, fn = stanceCb;
        closeStance();
        if(fn) fn(k);
      });
      const x = document.getElementById('st-close');
      if(x) x.addEventListener('click', () => { const fn = stanceCb; closeStance(); if(fn) fn(null); });
      modal.addEventListener('click', ev => { if(ev.target === modal){ const fn = stanceCb; closeStance(); if(fn) fn(null); } });
    }
    modal.classList.remove('hidden');
    sfx.pop();
  }
  function closeStance(){
    const modal = document.getElementById('stance-modal');
    if(modal) modal.classList.add('hidden');
    stanceCb = null;
  }

  /* batch10：所有不可逆/交易动作共用一张游戏内确认卡。
     UI 层复用既有起手式弹层；测试可通过 _setConfirmHandler 自动作答，不触碰原生 confirm。 */
  let confirmHandler = null;
  function confirmAction(cfg, cb){
    if(confirmHandler) return confirmHandler(cfg || {}, cb);
    pickStance({
      icon: cfg.icon || '❔', title: cfg.title || '请确认',
      text: cfg.text || '', foot: cfg.foot || '取消不会改变任何资源或物品。',
      opts: [
        { k:'cancel', n:'取消', d:'保留现状' },
        { k:'ok', n:cfg.okText || '确认', d:cfg.okDesc || '' }
      ]
    }, k => cb(k === 'ok'));
  }

  function challengeArena(i, stance){
    resetArenaDay();
    if(S.arena.left <= 0){ log('今日论剑次数用尽了，明日再来。', 'bad'); return; }
    const f = S.arena.foes[i];
    if(!f || f.beat) return;
    /* 起手式只调「临场发挥」的两端与奖励配比：抢攻把上限抬上去、下限压下来，
       守拙把起伏收窄再补灵石。plain 是老口径（±15%、奖励原样），程序内调用仍走它。 */
    stance = stance || 'plain';
    const my = combatPower() * (stance === 'rush' ? 0.80 + Math.random() * 0.44
                              : stance === 'guard' ? 0.94 + Math.random() * 0.10
                              : 0.85 + Math.random() * 0.30);
    const op = f.power * (0.85 + Math.random() * 0.30);
    const win = my >= op;
    S.arena.left--; f.beat = true;
    const kStone = win
      ? (stance === 'rush' ? BAL.arenaWinStoneK * 1.2 : stance === 'guard' ? BAL.arenaWinStoneK * 1.25 : BAL.arenaWinStoneK)
      : (stance === 'rush' ? BAL.arenaLoseStoneK * 0.4 : stance === 'guard' ? BAL.arenaLoseStoneK * 1.25 : BAL.arenaLoseStoneK);
    const kRep = win && stance === 'rush' ? 1.5 : 1;
    const stone = Math.floor(needOf(S.rank) * kStone);
    const rep = Math.round((win ? BAL.arenaWinRep : BAL.arenaLoseRep) * kRep);
    S.stone += stone; S.stats.stoneEarned += stone;
    S.arena.rep += rep;
    if(win) S.arena.win++; else S.arena.lose++;
    if(win) coopBossHit();   /* P2：论剑胜利计入宗门协力伤害 */
    /* NPC 记忆（T-506 接入）：沈碑看门人视角，论剑台胜负落账；记忆系统缺失/异常一律静默，绝不影响结算 */
    /* 记忆短语用第二人称：这句会被 npc.js 拼进沈碑的开场白
       （「（他顿了顿，像是想起了…）」），写"玩家在论剑台赢了一场"会把 UI 术语漏进 NPC 口中。 */
    try{ if(window.NpcMemory) NpcMemory.record('shen_bei', win ? '你在论剑台赢了一场' : '你在论剑台输了一场', 'combat'); }catch(e){}
    const stTxt = stance === 'rush' ? '（抢攻）' : stance === 'guard' ? '（守拙）' : '';
    log(win ? '⚔️ 论剑胜 ' + f.name + stTxt + '（战力 ' + fmt(f.power) + '），声望 +' + rep + '、灵石 +' + fmt(stone)
            : '⚔️ 不敌 ' + f.name + stTxt + '（战力 ' + fmt(f.power) + '），声望 +' + rep + '、灵石 +' + fmt(stone), win ? 'good' : 'bad');
    if(win) sfx.win(); else sfx.click();
    gainChip((win ? '⚔️ 胜 ' : '⚔️ 不敌 ') + f.name + ' · 声望 +' + rep, win ? 'good' : '');
    const before = S.arena.tier || 0;
    const now = tierOf();
    if(now > before){
      S.arena.tier = now;
      const rw = Math.floor(needOf(S.rank) * 3);
      S.stone += rw;
      log('🏅 段位晋升：' + ARENA_TIERS[now].name + '！灵石 +' + fmt(rw), 'gold');
      sfx.win();
    }
    save(); render(); renderArena();
    /* 第 93 轮：切磋以前只有右上角一枚 chip（实测点下去 modal:false），等于对着日志盲掷骰子。
       胜负和奖励在上面已经入账了，这里只补一场「照着已定结果演」的动画，经济数值一个字没动。 */
    if(battleAnim && document.getElementById('battle-modal')){
      openBattleAnim(0, () => { render(); renderArena(); }, {
        title: '论剑台 · <b>' + f.name + '</b>' + (stance === 'rush' ? ' · 抢攻' : stance === 'guard' ? ' · 守拙' : ''),
        mob: rivalLook(f.name),
        mobPower: f.power,
        script: { win: win, rounds: 3 },
        loot: { stone: stone, rep: rep }
      });
    }
  }
  /* 论剑对决前的战力解读：落后复用 P0.5 的 powerGapAdvice；领先给等价口径的领先幅度 */
  function arenaGapText(cp, foe){
    cp = Math.max(0, Number(cp) || 0); foe = Math.max(0, Number(foe) || 0);
    if(cp >= foe){
      const lead = cp - foe;
      const pct = foe > 0 ? Math.round(lead / foe * 100) : 0;
      return '你领先 <b>' + fmt(lead) + '</b> 战力（约 ' + pct + '%），占优';
    }
    return powerGapAdvice(cp, foe);
  }
  /* 论剑台的入口：先问起手式，选完才交给 challengeArena 结算 */
  function arenaPick(i){
    resetArenaDay();
    if(S.arena.left <= 0){ log('今日论剑次数用尽了，明日再来。', 'bad'); return false; }
    const f = S.arena.foes[i];
    if(!f || f.beat) return false;
    const need = needOf(S.rank);
    const cpNow = combatPower();
    pickStance({
      icon: '⚔', title: '论剑台 · 起手式',
      text: '对手【' + escHTML(f.name) + '】战力 <b>' + fmt(f.power) + '</b>，你有 <b>' + fmt(cpNow) +
        '</b>。<br>' + arenaGapText(cpNow, f.power) + '。<br>同一把剑，起手不同，收成不同——胜灵石 ' +
        fmt(Math.floor(need * BAL.arenaWinStoneK)) + '、败灵石 ' +
        fmt(Math.floor(need * BAL.arenaLoseStoneK)) + '（基准）。',
      opts: [
        { k: 'rush',  n: '抢攻', d: '掷骰放宽（×0.80–1.24）· 胜：声望 ×1.5、灵石 ×1.2 · 负：灵石 ×0.4' },
        { k: 'guard', n: '守拙', d: '起伏收窄（×0.94–1.04）· 无论胜负灵石 ×1.25' }
      ],
      foot: '关掉就当没打：次数与对手都留着。'
    }, k => { if(k) challengeArena(i, k); });
    return true;
  }
  /* batch5 第 5 项（甲案）：雇人代打。
     每日限 1 场，占今日出战次数；价格 = 当前一层需求 ×0.6 灵石；
     胜负仍走 challengeArena('plain') 的随机判定与现有结算，不另开奖励、不加服务端记录。
     日界与全局 08:00 同口径：S.arena.proxyDay 记「今天已代打」的日键；旧档缺字段按未用处理。 */
  function arenaProxyCost(){ return Math.max(1, Math.floor(needOf(S.rank) * BAL.arenaProxyStoneK)); }
  function arenaProxyEligible(){
    resetArenaDay();
    return S.arena.left > 0 && S.arena.proxyDay !== todayKey() && S.arena.foes.some(f => !f.beat);
  }
  function arenaProxyPick(i){
    resetArenaDay();
    if(!arenaProxyEligible()){
      log(S.arena.left <= 0 ? '今日论剑次数用尽了，明日再来。'
          : S.arena.proxyDay === todayKey() ? '今日已代打过了，明日再来。'
          : '榜上已无可代打的对手。', 'bad');
      return false;
    }
    const f = S.arena.foes[i];
    if(!f || f.beat) return false;
    const cost = arenaProxyCost();
    if(S.stone < cost){ log('灵石不足，雇人代打要 ' + fmt(cost) + ' 灵石。', 'bad'); return false; }
    pickStance({
      icon: '⚔', title: '论剑台 · 雇人代打',
      text: '请一位道友替你打【' + escHTML(f.name) + '】（战力 <b>' + fmt(f.power) + '</b>）。' +
        '<br>费用 <b>' + fmt(cost) + '</b> 灵石（当前一层需求 ×' + BAL.arenaProxyStoneK + '），并消耗今日出战 <b>1</b> 次。' +
        '<br>胜负随机，按现有论剑结算（声望/灵石照发）；胜率低也允许。',
      opts: [{ k: 'ok', n: '确认代打', d: '灵石 -' + fmt(cost) + ' · 出战 -1' }],
      foot: '取消不扣灵石、不扣次数。代打每日限 1 场；先手动切磋、后代打也可以。'
    }, k => { if(k === 'ok') doArenaProxy(i, cost); });
    return true;
  }
  function doArenaProxy(i, cost){
    resetArenaDay();
    if(!arenaProxyEligible()) return false;
    const f = S.arena.foes[i];
    if(!f || f.beat) return false;
    if(S.stone < cost){ log('灵石不足，雇人代打要 ' + fmt(cost) + ' 灵石。', 'bad'); return false; }
    S.stone -= cost;
    S.arena.proxyDay = todayKey();          /* 日键与 08:00 日界同口径；保存由 challengeArena 的 save 一并落 */
    log('💸 花 ' + fmt(cost) + ' 灵石雇人代打【' + f.name + '】。', 'note');
    challengeArena(i, 'plain');
    return true;
  }
  /* 第三批 P0：论剑商店兑换二次确认（声望余额/换后余额）；真正扣声望下沉到 doBuyRep */
  function buyRep(idx){
    const it = ARENA_SHOP[idx];
    if(!it){ log('商品不存在，请刷新宗门商店后重试。', 'bad'); return; }
    if(S.arena.rep < it.rep){ log('声望不足，换【' + it.name + '】要 ' + it.rep + ' 声望。', 'bad'); return; }
    if(it.id === 'bag' && S.bagSize >= BAG_CAP){ log('背包已到 ' + BAG_CAP + ' 格，装不下了。', 'bad'); return; }
    if(it.id === 'egg' && S.eggs.length >= BAL.petEggMax){ log('蛋篓已满，先去灵兽园孵化。', 'bad'); return; }
    if((it.id === 'boss_core' || it.id === 'boss_pearl' || it.id === 'dan3') && !bagCanAccept(it.id)){
      const m = '背包已满（' + bagCap() + ' 格），先卖掉或扩个储物袋再换。';
      log(m, 'bad'); try{ if(window.toast) toast(m); }catch(e){}
      return;
    }
    pickStance({
      icon: '🏅', title: '论剑台 · 确认兑换',
      text: '物品：<b>' + escHTML(it.name) + '</b> ×1' +
        '<br>单价：<b>' + fmt(it.rep) + '</b> 声望' +
        '<br>余额：' + fmt(S.arena.rep) + ' → 换后 <b>' + fmt(S.arena.rep - it.rep) + '</b>',
      opts: [{ k: 'ok', n: '确认兑换', d: '声望 -' + fmt(it.rep) }],
      foot: '取消不会扣任何声望，货品保留。'
    }, k => { if(k === 'ok') doBuyRep(idx); });
  }
  function doBuyRep(idx){
    const it = ARENA_SHOP[idx];
    if(!it){ log('商品不存在，请刷新宗门商店后重试。', 'bad'); return; } // P0-3 死键反馈（2026-11-13 收口；原型 buyRepFeedback 经 GPT V3 + Muse 第四方确认）
    if(S.arena.rep < it.rep){ log('声望不足，换【' + it.name + '】要 ' + it.rep + ' 声望。', 'bad'); return; }
    if(it.id === 'bag' && S.bagSize >= BAG_CAP){ log('背包已到 ' + BAG_CAP + ' 格，装不下了。', 'bad'); return; }
    if(it.id === 'egg' && S.eggs.length >= BAL.petEggMax){ log('蛋篓已满，先去灵兽园孵化。', 'bad'); return; }
    if((it.id === 'boss_core' || it.id === 'boss_pearl' || it.id === 'dan3') && !bagCanAccept(it.id)){
      const m = '背包已满（' + bagCap() + ' 格），先卖掉或扩个储物袋再换。';
      log(m, 'bad'); try{ if(window.toast) toast(m); }catch(e){}
      return;
    }
    S.arena.rep -= it.rep;
    if(it.id === 'bag'){ S.bagSize = Math.min(BAG_CAP, S.bagSize + BAG_STEP); log('🏅 换得储物袋，背包扩到 ' + S.bagSize + ' 格。', 'gold'); }
    else if(it.id === 'egg'){
      const can = BEASTS.filter(b => S.rank >= b.rank - 1);
      const b = can[Math.floor(Math.random() * can.length)] || BEASTS[0];
      S.eggs.push({ bid: b.id });
      log('🏅 换得一枚妖兽蛋（' + b.name + '）。', 'gold');
    }else{
      addItem(it.id, it.name);
      log('🏅 换得【' + it.name + '】。', 'gold');
    }
    sfx.pop();
    save(); render(); renderArena(); renderBag();
  }
  /* ============ 天骄榜（纯文字榜单：30 位修仙 NPC + 玩家实时排名） ============
     NPC 战力 = 本境界基准战力（含功法，不含法宝/强化/洗练/装备）× 各自系数（0.28~40）——
     玩家的江湖地位由装备养成决定：洗练/强化拉满即可爬榜夺魁；境界突破则全榜水涨船高，
     永远是"可追赶的目标"。renderRank 挂在主 render 上，任何战力变化实时刷新名次。 */
  const RANK_NPCS = [
    ['青云剑尊', 40],   ['太虚道人', 28],   ['合欢老魔', 19],   ['血河老祖', 13],   ['玄阴圣母', 9],
    ['丹霞仙子', 6.5],  ['万毒真人', 5],    ['御兽天君', 4.2],  ['磐石老怪', 3.6],  ['白骨道人', 3.1],
    ['紫霄剑仙', 2.7],  ['幽冥鬼主', 2.35], ['碧波仙姥', 2.05], ['金身罗汉', 1.8],  ['赤炎魔君', 1.6],
    ['静水师太', 1.42], ['雷罚天尊', 1.26], ['灵犀道君', 1.12], ['醉梦散人', 1.0],  ['铁算先生', 0.9],
    ['缚魂姥姥', 0.8],  ['青莲童子', 0.71], ['断岳狂僧', 0.63], ['摘星楼主', 0.56], ['枯荣道人', 0.5],
    ['落霞仙姝', 0.44], ['千机老人', 0.39], ['独孤剑痴', 0.35], ['混世小妖王', 0.31], ['扫地道童', 0.28]
  ];
  function rankList(){
    const base = 10 * POW_K * Math.pow(1.5, S.rank) * gongMult();   /* 本境界基准（功法计入） */
    const list = RANK_NPCS.map(([n, k]) => ({ name: n, pow: Math.floor(base * k) }));
    list.push({ name: S.name || '散修', pow: combatPower(), me: true });
    list.sort((a, b) => b.pow - a.pow);
    return list;
  }
  /* 榜单自动滚动的视图代次：每次 renderRank 自增；延时回调只在代次未变时执行，
     避免"离开榜单又回来"时旧任务的滚动打断新页面。 */
  let rankScrollVer = 0;
  function renderRank(){
    const box = document.getElementById('xx-hero-rank');
    if(!box) return;
    const list = rankList();
    const myIdx = list.findIndex(x => x.me);
    box.innerHTML = list.map((x, i) => {
      const cls = 'rk-row' + (x.me ? ' rk-me' : '') + (i < 3 ? ' rk-' + (i + 1) : '');
      return '<div class="' + cls + '">' +
        '<span class="rk-no">' + (i + 1) + '</span>' +
        '<span class="rk-name">' + (x.me ? '【' + escHTML(x.name) + '】· 你' : escHTML(x.name)) + '</span>' +
        '<span class="rk-pow">' + fmt(x.pow) + '</span></div>';
    }).join('');
    const tip = document.getElementById('xx-hero-rank-tip');
    if(tip) tip.textContent = '当前第 ' + (myIdx + 1) + ' 名 · 战力提升（突破 / 法宝强化 / 洗练 / 装备）实时刷新名次';
    /* 名次变化才自动滚到玩家行，避免每次 tick 滚动打断浏览 */
    if(box.dataset.myIdx !== String(myIdx)){
      box.dataset.myIdx = String(myIdx);
      /* 延时 60ms 再滚。用「视图代次」而不是只看 isConnected：
         这 60ms 内玩家可能离开榜单又回来，新容器的 isConnected 同样是 true，
         但它不属于这次渲染 —— 盲目滚动会打断玩家在新页面上的操作。 */
      const myVer = ++rankScrollVer;
      setTimeout(() => {
        if(myVer !== rankScrollVer) return;                 /* 期间又渲染过 → 本次作废 */
        const b2 = document.getElementById('xx-hero-rank');
        if(!b2 || !b2.isConnected) return;                  /* 已离开榜单视图 */
        const me2 = b2.querySelector('.rk-me');
        if(me2) me2.scrollIntoView({ block:'center' });
      }, 60);
    }
  }
  function renderArena(){
    resetArenaDay();
    const meBox = document.getElementById('xx-arena-me');
    if(meBox){
      const t = tierOf();
      const next = ARENA_TIERS[t + 1];
      const proxyTxt = S.arena.proxyDay === todayKey() ? '今日已代打'
        : (S.arena.left > 0 ? '今日可代打 1 场' : '不可用（次数用尽）');
      meBox.innerHTML =
        '<div class="ar-tier">' + ARENA_TIERS[t].name + '</div>' +
        '<div class="ar-line"><span>声望</span><b>' + S.arena.rep + '</b></div>' +
        '<div class="ar-line"><span>战绩</span><b>' + S.arena.win + ' 胜 ' + S.arena.lose + ' 负</b></div>' +
        '<div class="ar-line"><span>今日挑战</span><b>' + S.arena.left + ' / ' + BAL.arenaDaily + '</b></div>' +
        '<div class="ar-line"><span>代打</span><b>' + proxyTxt + '</b></div>' +
        (next ? '<div class="ar-next">再攒 ' + (next.rep - S.arena.rep) + ' 声望升「' + next.name + '」</div>'
              : '<div class="ar-next">已至九霄道尊，无人可敌</div>');
    }
    const fBox = document.getElementById('xx-arena-foes');
    if(fBox){
      let html = '';
      S.arena.foes.forEach((f, i) => {
        const cp = combatPower();
        const odds = cp / f.power;
        const tag = odds >= 1.25 ? '稳操胜券' : odds >= 1 ? '旗鼓相当' : odds >= 0.8 ? '略有不敌' : '凶多吉少';
        const canProxy = arenaProxyEligible();
        html += '<div class="ar-row' + (f.beat ? ' done' : '') + '">' +
          '<div class="ar-main"><b>' + f.name + '<small>' + RANK_NAMES[rankByPower(f.power)] + '</small></b>' +
          '<span>战力 ' + fmt(f.power) + ' · ' + tag + '</span></div>' +
          (f.beat ? '<span class="ar-res">已挑战</span>'
            : '<div class="ar-ops">' +
              '<button class="ar-btn" data-fight="' + i + '"' + (S.arena.left <= 0 ? ' disabled' : '') + '>切磋</button>' +
              (canProxy ? '<button class="ar-btn proxy" data-proxy="' + i + '">代打</button>' : '') +
              '</div>') +
          '</div>';
      });
      fBox.innerHTML = html;
      if (!fBox.dataset.d_binded) {
        fBox.dataset.d_binded = '1';
        fBox.addEventListener('click', ev => {
          const b = ev.target.closest('[data-fight]');
          if (b) { ev.stopPropagation(); arenaPick(Number(b.dataset.fight)); return; }
          const p = ev.target.closest('[data-proxy]');
          if (p) { ev.stopPropagation(); arenaProxyPick(Number(p.dataset.proxy)); }
        });
      }
    }
    const sBox = document.getElementById('xx-arena-shop');
    if(sBox){
      let html = '';
      ARENA_SHOP.forEach((it, i) => {
        const ico = it.img ? '<img src="' + it.img + '" alt="">' : '<img class="ar-emo" src="ui/icons/ic_box.png" alt="">';
        html += '<div class="ar-row">' + ico + '<div class="ar-main"><b>' + it.name + '</b><span>' + it.rep + ' 声望</span></div>' +
          '<button class="ar-btn buy" data-buy="' + i + '"' + (S.arena.rep < it.rep ? ' disabled' : '') + '>兑换</button></div>';
      });
      sBox.innerHTML = html;
      if (!sBox.dataset.d_binded) {
        sBox.dataset.d_binded = '1';
        sBox.addEventListener('click', ev => {
          const b = ev.target.closest('[data-buy]');
          if (b) { ev.stopPropagation(); buyRep(Number(b.dataset.buy)); }
        });
      }
    }
  }

  /* ============ 秘境副本（章节式多层副本 + 每日扫荡，与镇妖塔的无限爬塔区分） ============ */
  /* 4 个章节 × 10 层；第 10 层是守关妖王，掉 Boss 稀有材料（喂给法宝强化） */
  const SECRET_CH = [
    { name:'荒山古洞', base:30,    g:1.30, rank:0,  mat:'mat_core',    bossItem:'boss_core',
      story:'荒山深处那座洞府，你曾从枯骨手里接过半卷残经。如今再探，洞里还有别的东西在呼吸。' },
    { name:'幽谷秘境', base:220,   g:1.28, rank:6,  mat:'mat_bone',    bossItem:'boss_pearl',
      story:'幽谷常年起雾，谷中灵药成片，也养出了不认人的东西。猎户说，进谷的人一半没出来。' },
    { name:'北冥玄境', base:1600,  g:1.26, rank:12, mat:'mat_feather', bossItem:'boss_feather',
      story:'北冥有海，海上有境。传说玄境一日，人间一年——进去的人，多半是迷失在时间里了。' },
    { name:'九霄天域', base:12000, g:1.25, rank:18, mat:'mat_eye',     bossItem:'boss_heart',
      story:'九霄之上，云海之间，有一片不属于人间的天域。飞升之前，总得去那里走一遭。' }
  ];
  SECRET_CH.forEach(c => c.base *= POW_K);   /* 守关战力跟随全局战力刻度（×100） */
  const SECRET_FLOORS = BAL.secretFloors;
  const secretProg = ci => (S.secret.prog && typeof S.secret.prog[ci] === 'number') ? S.secret.prog[ci] : 0;
  const secretPower = (ci, f) => Math.floor(SECRET_CH[ci].base * Math.pow(SECRET_CH[ci].g, f - 1));
  function secretReward(ci, f){
    const ch = SECRET_CH[ci];
    const boss = f >= SECRET_FLOORS;
    return {
      stone: Math.floor(needOf(S.rank) * (0.5 + f * 0.06) * (boss ? 3 : 1)),
      mat: boss ? ch.bossItem : ch.mat
    };
  }
  function resetSecretDay(){
    /* 严格递增：改系统时间刷不出新的扫荡次数 */
    if(dayNo(S.secret.day) < todayNo()){ S.secret.day = todayKey(); S.secret.swept = 0; }
  }
  function secretTotal(){
    return SECRET_CH.reduce((a, _, ci) => a + secretProg(ci), 0);
  }
  function challengeSecret(ci, road, repeat){
    const ch = SECRET_CH[ci];
    if(!ch) return;
    if(S.rank < ch.rank){ log('「' + ch.name + '」要 ' + RANK_NAMES[ch.rank] + ' 才开得动。', 'bad'); return; }
    const done = secretProg(ci) >= SECRET_FLOORS;
    const f0 = done ? SECRET_FLOORS : secretProg(ci) + 1;
    const need0 = secretPower(ci, f0);
    const cp0 = combatPower();
    if(cp0 < need0){ log('战力不足，第 ' + f0 + ' 层守关 ' + fmt(need0) + ' 战力（' + powerGapAdvice(cp0, need0) + '）。', 'bad'); return; }
    /* batch5：十层已通后的重复挑战——只掷图纸 20%，不再给灵石/材料、不推进层数 */
    if(repeat || done){
      const pool = ci === 1 ? BP_POOLS.yougu : ci === 2 ? BP_POOLS.beiming : null;
      if(!pool){ log('「' + ch.name + '」十层已通，妖王伏诛。', 'gold'); return; }
      let drop = null;
      if(Math.random() < 0.2){
        drop = pool[Math.floor(Math.random() * pool.length)];
        if(bpGive(drop)) log('📜 重复挑战妖王，得【' + BP_BY_ID[drop].name + '】。', 'gold');
      }
      showSettle({ icon: '👑', title: ch.name + ' · 第 10 层 · 重复挑战',
        rows: [settleLine('图纸', drop ? ('+' + BP_BY_ID[drop].name + ' ×1') : '本次未掉（20% 概率）', drop ? 'good' : 'bad')],
        note: '重复挑战只掷图纸，不再给灵石/材料，也不推进层数。' });
      save(); render(); renderSecret(); renderBag();
      return;
    }
    const f = f0;
    const need = need0;
    /* 探路（第 101 轮）：灵石与材料不可兼得——取财多拿灵石、取料多拿材料，层数与守关战力都不变。
       plain 是老口径（灵石原样、1 个材料），程序内调用仍走它。 */
    road = road || 'plain';
    const base = secretReward(ci, f);
    const rw = {
      stone: road === 'stone' ? Math.round(base.stone * 1.6)
           : road === 'mat' ? Math.round(base.stone * 0.6) : base.stone,
      mat: base.mat,
      matN: road === 'mat' ? 2 : road === 'stone' ? 0 : 1
    };
    const firstBoss = f >= SECRET_FLOORS && secretProg(ci) < SECRET_FLOORS;
    S.secret.prog[ci] = f;
    S.stone += rw.stone; S.stats.stoneEarned += rw.stone;
    let got = '', added = 0, mailed = 0;
    const matName = (ITEMS[rw.mat] || {}).n || rw.mat;
    for(let k = 0; k < rw.matN; k++){
      const r = addItemEx(rw.mat, matName);
      if(r.ok || r.mail){ added++; if(r.mail) mailed++; }
      else break;
    }
    if(added > 0) got = '，得「' + matName + '」' + (added > 1 ? ' ×' + added : '') +
      (mailed > 0 ? '（其中 ' + mailed + ' 件背包已满，暂存信匣）' : '');
    log('🌀 ' + ch.name + ' 第 ' + f + ' 层通关！灵石 +' + fmt(rw.stone) + got,
        mailed > 0 ? 'bad' : (f >= SECRET_FLOORS ? 'gold' : 'good'));
    if(f >= SECRET_FLOORS){ log('👑 守关妖王伏诛，「' + ch.name + '」十层尽通！', 'gold'); }
    gainChip('🌀 ' + ch.name + ' ' + f + ' 层 · 灵石 +' + fmt(rw.stone), f >= SECRET_FLOORS ? 'gold' : 'good');
    coopBossHit();   /* P2：秘境通关计入宗门协力伤害 */
    /* batch5：幽谷/北冥 10 层 Boss 首通必掉一张对应池图纸；重复 20% */
    let bpDrop = null;
    if(f >= SECRET_FLOORS){
      const pool = ci === 1 ? BP_POOLS.yougu : ci === 2 ? BP_POOLS.beiming : null;
      if(pool && (firstBoss || Math.random() < 0.2)){
        bpDrop = pool[Math.floor(Math.random() * pool.length)];
        bpGive(bpDrop);
        log('📜 妖王遗落图纸【' + BP_BY_ID[bpDrop].name + '】' + (firstBoss ? '（首通必掉）' : '（20% 掉落）') + '。', 'gold');
      }
    }
    {
      const srows = [settleLine('灵石', '+' + fmt(rw.stone), 'good')];
      if(bpDrop) srows.push(settleLine('图纸 · ' + BP_BY_ID[bpDrop].name, '+1', 'good'));
      if(added > 0) srows.push(settleLine('材料 · ' + matName, '+' + added + (mailed ? '（部分入信匣）' : ''), mailed ? 'bad' : 'good'));
      if(rw.matN === 0) srows.push(settleLine('材料', '本层走「取财」，不带材料'));
      showSettle({
        icon: f >= SECRET_FLOORS ? '👑' : '🌀',
        title: ch.name + ' · 第 ' + f + ' 层' + (f >= SECRET_FLOORS ? ' · 妖王伏诛' : ''),
        sub: '已推进一层 · ' + (f >= SECRET_FLOORS ? '十层尽通' : '守关战力不变'),
        rows: srows,
        note: '取财多得灵石、取料多得材料；背包满的材料已转入信匣。'
      });
    }
    markDayDec('risk');   /* 阶段三收尾：今日四类决策 · 风险推进（秘境开打） */
    sfx.win();
    save(); render(); renderSecret(); renderBag();
    /* 第 93 轮：秘境和论剑一样，以前只有 chip（实测 modal:false）。战力门槛在上面已经拦过了
       （打不足压根进不来），所以这场照着必胜演；第 10 层换成妖王档，boss 立绘会放大。
       mob 拷一份，不改 BEASTS 原表——那是全局共享的。 */
    if(battleAnim && document.getElementById('battle-modal')){
      const b0 = towerBeast(f), boss = f >= SECRET_FLOORS;
      openBattleAnim(0, () => { render(); renderSecret(); renderBag(); }, {
        title: ch.name + ' · 第 <b>' + f + '</b> 层' + (road === 'stone' ? ' · 取财' : road === 'mat' ? ' · 取料' : ''),
        mob: { name: boss ? '守关妖王 · ' + b0.name : b0.name, img: b0.img, hue: b0.hue || 0, boss: boss },
        mobPower: need,
        script: { win: true, rounds: boss ? 4 : 3 },
        loot: { mat: added > 0 ? rw.mat : null, matN: added, stone: rw.stone }
      });
    }
  }
  /* 秘境入口：先问「这层要灵石还是要材料」，选完才打 */
  function secretPick(ci){
    const ch = SECRET_CH[ci];
    if(!ch) return false;
    if(S.rank < ch.rank){ log('「' + ch.name + '」要 ' + RANK_NAMES[ch.rank] + ' 才开得动。', 'bad'); return false; }
    const done = secretProg(ci) >= SECRET_FLOORS;
    const f = done ? SECRET_FLOORS : secretProg(ci) + 1;
    const need = secretPower(ci, f), cp = combatPower();
    if(cp < need){ log('战力不足，第 ' + f + ' 层守关 ' + fmt(need) + ' 战力（' + powerGapAdvice(cp, need) + '）。', 'bad'); return false; }
    if(done){
      const pool = ci === 1 ? BP_POOLS.yougu : ci === 2 ? BP_POOLS.beiming : null;
      if(!pool){ log('「' + ch.name + '」十层已通，妖王伏诛。', 'gold'); return false; }
      pickStance({
        icon: '👑', title: ch.name + ' · 第 10 层 · 重复挑战',
        text: '只掷一样东西：<b>20%</b> 掉一张图纸。重复挑战不再给灵石/材料，也不推进层数。',
        opts: [{ k: 'repeat', n: '再战妖王', d: '图纸 20% · 无其他收益' }],
        foot: '关掉就当没打。'
      }, k => { if(k) challengeSecret(ci, 'repeat', true); });
      return true;
    }
    const base = secretReward(ci, f);
    const matName = (ITEMS[base.mat] || {}).n || base.mat;
    pickStance({
      icon: '🌀', title: ch.name + ' · 第 ' + f + ' 层 · 探路',
      text: '守关 <b>' + fmt(need) + '</b> 战力。这一层的收成怎么分，由你挑——' +
        '基准是灵石 ' + fmt(base.stone) + ' + 「' + escHTML(matName) + '」×1。',
      opts: [
        { k: 'stone', n: '取财', d: '灵石 ×1.6 · 本层不带材料' },
        { k: 'mat',   n: '取料', d: '灵石 ×0.6 · 材料 ×2' }
      ],
      foot: '两条路都推进一层、守关战力不变；关掉就当没闯。'
    }, k => { if(k) challengeSecret(ci, k); });
    return true;
  }
  function sweepSecret(){
    resetSecretDay();
    const total = secretTotal();
    if(total <= 0){ log('还没打通任何一层秘境，先去闯一层。', 'bad'); return; }
    if(S.secret.swept){ log('今日秘境已扫荡过，明天再来。', 'bad'); return; }
    let stone = 0;
    SECRET_CH.forEach((ch, ci) => {
      const p = secretProg(ci);
      for(let f = 1; f <= p; f++) stone += Math.floor(secretReward(ci, f).stone * BAL.secretSweepRatio);
    });
    S.stone += stone; S.stats.stoneEarned += stone;
    /* 扫荡只给材料不爆背包：每章按进度给 1 个该章材料 */
    let got = 0;
    SECRET_CH.forEach(ch => {
      if(secretProg(SECRET_CH.indexOf(ch)) > 0){
        const r = bagAddQty(ch.mat, ((ITEMS[ch.mat] || {}).n) || ch.mat, 1);
        if(r.ok) got++;
      }
    });
    S.secret.swept = 1;
    log('🌀 扫荡全部秘境，灵石 +' + fmt(stone) + (got ? '，材料 ×' + got : '') + '。', 'good');
    sfx.pop();
    save(); render(); renderSecret(); renderBag();
  }
  function renderSecret(){
    const top = document.getElementById('xx-secret-top');
    if(top){
      resetSecretDay();
      const total = secretTotal();
      const topHtml = '<div class="sec-line">已通层数 <b>' + total + ' / ' + (SECRET_CH.length * SECRET_FLOORS) + '</b></div>' +
        '<button class="sec-btn" data-act="sweep"' + (S.secret.swept || total <= 0 ? ' disabled' : '') + '>' +
        (S.secret.swept ? '今日已扫荡' : '🌀 扫荡全部秘境（' + Math.round(BAL.secretSweepRatio * 100) + '% 收益）') + '</button>' +
        '<p class="hint">每章 10 层，第 10 层守关妖王掉 Boss 稀有材料 · 每日扫荡一次</p>';
      if(top.dataset.sig !== topHtml){
        top.dataset.sig = topHtml; top.innerHTML = topHtml;
        const b = top.querySelector('[data-act="sweep"]');
        if(b) b.addEventListener('click', sweepSecret);
      }
    }
    /* hub 四格的朱砂印：一章一层进度，进哪一章之前先看哪章还欠着几层（第 88 轮 B 拆页） */
    if(document.getElementById('xx-hub-sec-0')){
      [0, 1, 2, 3].forEach(ci => {
        const e = document.getElementById('xx-hub-sec-' + ci);
        if(e) e.textContent = secretProg(ci) + '/' + SECRET_FLOORS + ' 层';
      });
    }
    document.querySelectorAll('.sec-ch').forEach(box => {
      const ci = Number(box.dataset.ch);
      const ch = SECRET_CH[ci];
      if(!ch) return;
      const p = secretProg(ci);
      const f = Math.min(p + 1, SECRET_FLOORS);
      const done = p >= SECRET_FLOORS;
      const locked = S.rank < ch.rank;
      const need = secretPower(ci, f);
      const cp = combatPower();
      const canWin = !locked && !done && cp >= need;
      const rw = secretReward(ci, f);
      let html = '<div class="sec-name">' + ch.name + '<span class="sec-tag">' + RANK_NAMES[ch.rank] + '</span></div>' +
        '<p class="sec-story">' + ch.story + '</p>';
      /* 2026-11-19 UI 第二批：十格层梯（已通金 / 当前红点 / 第 10 格王标），补章页下半屏空白 */
      let ladder = '<div class="sec-floor">';
      for(let i = 1; i <= SECRET_FLOORS; i++){
        const cls = i <= p ? ' done' : (i === p + 1 && !done ? ' cur' : '');
        ladder += '<span class="sec-step' + cls + (i === SECRET_FLOORS ? ' boss' : '') + '" title="第 ' + i + ' 层"></span>';
      }
      ladder += '</div>';
      html += ladder +
        '<div class="sec-prog"><div class="sec-track"><i style="width:' + (p / SECRET_FLOORS * 100).toFixed(1) + '%"></i></div>' +
        '<span>' + p + ' / ' + SECRET_FLOORS + ' 层</span></div>' +
        '<div class="sec-rew">' + (done ? '十层尽通' : '第 ' + f + ' 层守关 ' + fmt(need) + ' 战力 · 灵石 ' + fmt(rw.stone) + ' · 材料「' + (((ITEMS[rw.mat] || {}).n) || rw.mat) + '」') + '</div>';
      const bpPool = ci === 1 ? BP_POOLS.yougu : ci === 2 ? BP_POOLS.beiming : null;
      html += locked ? '<div class="sec-lock">' + RANK_NAMES[ch.rank] + '开启</div>'
        : done ? (bpPool
            ? '<button class="sec-btn" data-repeat="' + ci + '">👑 重复挑战妖王 · 图纸 20%</button>'
            : '<div class="sec-lock done">已通关</div>')
        : '<button class="sec-btn' + (canWin ? '' : ' off') + '" data-fight="' + ci + '">' +
          (canWin ? inkIco('⚔️') + '探路 · 第 ' + f + ' 层' : '战力不足（差 ' + fmt(need - cp) + '）') + '</button>';
      if(box.dataset.sig !== html){
        box.dataset.sig = html; box.innerHTML = html;
        const btn = box.querySelector('[data-fight]');
        if(btn && canWin) btn.addEventListener('click', () => secretPick(ci));
        const rb = box.querySelector('[data-repeat]');
        if(rb) rb.addEventListener('click', () => secretPick(ci));
      }
    });
  }

  /* ============ 猎妖（一念逍遥式：战力解锁 + 自动战斗挂机产材料） ============ */
  /* 30 种妖兽，4 品阶：妖兽(赭红)/灵兽(青碧)/仙兽(鎏金)/魔兽(紫冥) */
  const BEASTS = [
    /* ---- 妖兽（炼气期，掉妖丹） ---- */
    { id: 'rat',  name: '妖鼠', img: 'ui/icons/beast_rat.png',  tier: 1, power: 10,  rank: 0, drop: 'mat_core' },
    { id: 'crow', name: '妖鸦', img: 'ui/icons/beast_crow.png', tier: 1, power: 15,  rank: 0, drop: 'mat_core' },
    { id: 'toad', name: '妖蟾', img: 'ui/icons/beast_toad.png', tier: 1, power: 20,  rank: 1, drop: 'mat_core' },
    { id: 'boar', name: '妖豕', img: 'ui/icons/beast_boar.png', tier: 1, power: 30,  rank: 1, drop: 'mat_core' },
    { id: 'ox',   name: '妖牛', img: 'ui/icons/beast_ox.png',   tier: 1, power: 40,  rank: 2, drop: 'mat_core' },
    { id: 'croc', name: '妖鳄', img: 'ui/icons/beast_croc.png', tier: 1, power: 55,  rank: 3, drop: 'mat_core' },
    { id: 'wolf', name: '妖狼', img: 'ui/icons/beast_wolf.png', tier: 1, power: 70,  rank: 4, drop: 'mat_core' },
    { id: 'leopard', name: '妖豹', img: 'ui/icons/beast_leopard.png', tier: 1, power: 90, rank: 5, drop: 'mat_core' },
    { id: 'eagle', name: '妖鹰', img: 'ui/icons/beast_eagle.png', tier: 1, power: 115, rank: 6, drop: 'mat_core' },
    { id: 'bear', name: '妖熊', img: 'ui/icons/beast_bear.png', tier: 1, power: 140, rank: 7, drop: 'mat_core' },
    { id: 'lion', name: '妖狮', img: 'ui/icons/beast_lion.png', tier: 1, power: 170, rank: 8, drop: 'mat_core' },
    { id: 'tiger', name: '妖虎·兽王', img: 'ui/icons/beast_tiger.png', tier: 1, power: 200, rank: 8, drop: 'mat_core', boss: true, bossDrop: 'boss_core' },
    /* ---- 灵兽（筑基期，掉兽骨） ---- */
    { id: 'horse', name: '妖马', img: 'ui/icons/beast_horse.png', tier: 2, power: 300,  rank: 9, drop: 'mat_bone' },
    { id: 'hound', name: '灵犬', img: 'ui/icons/beast_hound.png', tier: 2, power: 380,  rank: 9, drop: 'mat_bone' },
    { id: 'monkey', name: '灵猴', img: 'ui/icons/beast_monkey.png', tier: 2, power: 480, rank: 9, drop: 'mat_bone' },
    { id: 'rabbit', name: '玉兔', img: 'ui/icons/beast_rabbit.png', tier: 2, power: 600, rank: 10, drop: 'mat_bone' },
    { id: 'deer', name: '灵鹿', img: 'ui/icons/beast_deer.png', tier: 2, power: 750, rank: 10, drop: 'mat_bone' },
    { id: 'moth', name: '灵蝶', img: 'ui/icons/beast_moth.png', tier: 2, power: 950, rank: 11, drop: 'mat_bone' },
    { id: 'jiao', name: '蛟龙·妖王', img: 'ui/icons/beast_jiao.png', tier: 2, power: 1200, rank: 11, drop: 'mat_bone', boss: true, bossDrop: 'boss_pearl' },
    /* ---- 仙兽（金丹期，掉仙羽） ---- */
    { id: 'crane', name: '灵鹤', img: 'ui/icons/beast_crane.png', tier: 3, power: 2000, rank: 12, drop: 'mat_feather' },
    { id: 'dragon', name: '妖龙', img: 'ui/icons/beast_dragon.png', tier: 3, power: 3000, rank: 12, drop: 'mat_feather' },
    { id: 'qilin', name: '麒麟', img: 'ui/icons/beast_qilin.png', tier: 3, power: 4500, rank: 13, drop: 'mat_feather' },
    { id: 'tortoise', name: '玄武', img: 'ui/icons/beast_tortoise.png', tier: 3, power: 6800, rank: 13, drop: 'mat_feather' },
    { id: 'phoenix', name: '朱雀·仙灵', img: 'ui/icons/beast_phoenix.png', tier: 3, power: 10000, rank: 14, drop: 'mat_feather', boss: true, bossDrop: 'boss_feather' },
    /* ---- 魔兽（元婴期起，掉魔晶） ---- */
    { id: 'bat', name: '妖蝠', img: 'ui/icons/beast_bat.png', tier: 4, power: 15000, rank: 15, drop: 'mat_eye' },
    { id: 'snake', name: '蛇妖', img: 'ui/icons/beast_snake.png', tier: 4, power: 22000, rank: 16, drop: 'mat_eye' },
    { id: 'spider', name: '妖蛛', img: 'ui/icons/beast_spider.png', tier: 4, power: 33000, rank: 17, drop: 'mat_eye' },
    { id: 'scorpion', name: '妖蝎', img: 'ui/icons/beast_scorpion.png', tier: 4, power: 50000, rank: 18, drop: 'mat_eye' },
    { id: 'rakshasa', name: '罗刹', img: 'ui/icons/beast_rakshasa.png', tier: 4, power: 58000, rank: 19, drop: 'mat_eye' },
    { id: 'ghoul', name: '尸魈', img: 'ui/icons/beast_ghoul.png', tier: 4, power: 66000, rank: 19, drop: 'mat_eye' },
    { id: 'python', name: '蟒妖', img: 'ui/icons/beast_python.png', tier: 4, power: 75000, rank: 20, drop: 'mat_eye' },
    { id: 'bonejiao', name: '骨蛟', img: 'ui/icons/beast_bonejiao.png', tier: 4, power: 95000, rank: 21, drop: 'mat_eye' },
    { id: 'nethpython', name: '幽冥蟒', img: 'ui/icons/beast_nethpython.png', tier: 4, power: 110000, rank: 21, drop: 'mat_eye' },
    { id: 'fox', name: '九尾妖狐', img: 'ui/icons/beast_fox.png', tier: 4, power: 120000, rank: 22, drop: 'mat_eye', boss: true, bossDrop: 'boss_heart' },
    /* ---- 神兽（合体期起，掉神兽之髓；Boss 稀有掉九尾心，供大乘破境丹） ---- */
    { id: 'goldenCrow', name: '三足金乌', img: 'ui/icons/beast_goldenCrow.png', tier: 5, power: 130000, rank: 22, drop: 'mat_marrow' },
    { id: 'baize', name: '白泽', img: 'ui/icons/beast_baize.png', tier: 5, power: 145000, rank: 22, drop: 'mat_marrow' },
    { id: 'xiezhi', name: '獬豸', img: 'ui/icons/beast_xiezhi.png', tier: 5, power: 240000, rank: 23, drop: 'mat_marrow' },
    { id: 'taotie', name: '饕餮·凶兽王', img: 'ui/icons/beast_taotie.png', tier: 5, power: 320000, rank: 23, drop: 'mat_marrow', boss: true, bossDrop: 'boss_heart' },
    { id: 'zhulong', name: '烛龙', img: 'ui/icons/beast_snake.png', hue: 15, tier: 5, power: 420000, rank: 24, drop: 'mat_marrow' },
    { id: 'kunpeng', name: '鲲鹏', img: 'ui/icons/beast_crane.png', hue: 190, tier: 5, power: 480000, rank: 24, drop: 'mat_marrow' },
    { id: 'yinglong', name: '应龙·祖龙裔', img: 'ui/icons/beast_dragon.png', hue: 130, tier: 5, power: 560000, rank: 24, drop: 'mat_marrow', boss: true, bossDrop: 'boss_heart' },
    { id: 'moqilin', name: '墨玉麒麟', img: 'ui/icons/beast_qilin.png', hue: 160, tier: 5, power: 700000, rank: 25, drop: 'mat_marrow' },
    { id: 'hundun', name: '混沌·凶兽之祖', img: 'ui/icons/beast_fox.png', hue: 275, tier: 5, power: 900000, rank: 25, drop: 'mat_marrow', boss: true, bossDrop: 'boss_heart' }
  ];
  BEASTS.forEach(b => b.power *= POW_K);   /* 妖兽战力跟随全局战力刻度（×100，妖鼠 1000 → 混沌 9000 万） */
  const BEAST_TIER_NAME = ['', '妖兽', '灵兽', '仙兽', '魔兽', '神兽'];
  /* 变色妖兽已全部拥有独立水墨图标（2026-10-24 AI 生成 38 枚），hue 区分法已废 */
  const beastImgStyle = b => b && b.hue ? ' style="filter:hue-rotate(' + b.hue + 'deg) saturate(1.35) brightness(.92)"' : '';
  /* 灵兽战力（阶段二 N7）：妖兽基础战力 × 品阶系数 PET_RATE × (1 + 0.03×等级)。
     品阶系数按下标（tier 1–5）：0.03/0.035/0.04/0.045/0.05；等级成长从旧 0.1 降到 0.03，
     存量灵兽按新公式重算、不另补偿（任务单明确）。三只合计另有 40% 境界战力总上限，见 petPowerSum。 */
  const PET_RATE = Object.freeze([0.03, 0.035, 0.04, 0.045, 0.05]);
  const PET_LEVEL_STEP = 0.03;
  const PET_TOTAL_CAP = 0.40;
  /* 阶段二 N6：喂食灵石改为固定九段表（按当前大境界段取），不再随 needOf 指数暴涨。 */
  const PET_FEED_STONE = Object.freeze([20, 50, 120, 300, 700, 1600, 3500, 8000, 18000]);
  const petFeedStoneCost = () => {
    const i = BREAK_TIERS.indexOf(breakTierOf(S.rank));
    return PET_FEED_STONE[Math.max(0, Math.min(PET_FEED_STONE.length - 1, i))];
  };
  const petPowerOf = p => {
    const b = BEASTS.find(x => x.id === p.bid);
    if(!b) return 0;
    const lv = p.lv || 1;
    const rate = PET_RATE[(b.tier | 0) - 1] || PET_RATE[0];
    return Math.floor(b.power * rate * (1 + PET_LEVEL_STEP * lv));
  };
  /* 灵兽总战力：单只按 PET_RATE 计算，三只合计封顶 = 40% × 境界基础战力（10 × POW_K × 1.5^rank）。
     封顶只压合计，不改单只展示值；超限时战斗/拆账统一走这里，保证显示=结算。 */
  const petPowerSum = () => {
    const sum = S.pets.reduce((a, p) => a + petPowerOf(p), 0);
    const cap = Math.floor(PET_TOTAL_CAP * 10 * POW_K * Math.pow(1.5, S.rank));
    return Math.min(sum, cap);
  };
  /* ---- 装备三槽：总战力 = 基础境界战力 + 武器 + 防具 + 饰品 ---- */
  const EQUIP_SLOTS = ['weapon', 'armor', 'accessory'];
  const SLOT_NAME = { weapon: '武器', armor: '防具', accessory: '饰品' };
  const equipPowerOf = id => (id && ITEMS[id] && ITEMS[id].power) || 0;   /* 脏数据/空槽都按 0 算 */
  const equipPowerSum = () => {
    let s = 0;
    EQUIP_SLOTS.forEach(k => { s += equipPowerOf(S.equipment && S.equipment[k]); });
    return s;
  };
  /* 玩家战力：基础境界 × 功法 × 法宝 × 强化 × 词条 + 出战灵兽 + 装备三槽加成（淬体丹是一段时间的百分比，乘在基础段里） */
  const combatPower = () => Math.floor(10 * POW_K * Math.pow(1.5, S.rank) * gongMult() * weaponMult() * enhancePowMult() * affixPowMult() * wuPowMult() * (1 + danPowPct()) * (1 + artPowPct()) * (1 + dtPowPct() / 100)) + petPowerSum() + equipPowerSum();
  /* 猎杀一只妖兽的耗时（秒）：战力碾压则更快，战力不足返回 Infinity */
  const killTime = beast => {
    const ratio = combatPower() / beast.power;
    if(ratio < 1) return Infinity;
    return Math.max(1, Math.round(30 / ratio));   /* 战力刚好 30 秒/只，碾压更短 */
  };

  /* ============ 任务（主线 + 支线，剧情短句口语、有画面感） ============ */
  /* goal.kind: sit/herb/train/enlight(行动次数) rank(境界) field/mine/cave/dan/gong1/gong2/gong3(等级)
                craftPill(炼丹次数) weapon(法宝品质) explore(探索次数) stoneEarned(累计灵石) */
  const QUESTS = [
    /* ---- 主线（next 链自动推进） ---- */
    { id: 'm1', type: 'main', next: 'm2', title: '荒山问道', goal: { kind: 'sit', n: 3 }, reward: { stone: 50 }, rtxt: '灵石 +50',
      story: '你本是山下樵夫家的儿子。这日上山砍柴，一脚踩空，滚进一座荒废洞府。\n洞府里一具枯骨盘坐石台，手边半卷残经——《引气诀》。\n石台刻着一行字：「吾乃青云散人，寿尽于此。有缘人得此经，续我衣钵。」' },
    { id: 'm2', type: 'main', next: 'm3', title: '初感灵气', goal: { kind: 'rank', n: 2 }, reward: { herb: 10 }, rtxt: '灵草 +10',
      story: '你照残经吐纳，日升月落。\n第七日黄昏，丹田忽生一丝暖意，像初雪撞上太阳。\n你睁开眼，知道自己从今往后，不是凡人了。' },
    { id: 'm3', type: 'main', next: 'm4', title: '开垦灵田', goal: { kind: 'field', n: 3 }, reward: { stone: 200 }, rtxt: '灵石 +200',
      story: '修行要灵药，灵药要灵田。\n你在山腰寻得一块向阳坡地，搬石、除草、引泉。\n一锄一锄，给自己凿出一个安身立命的地方。' },
    { id: 'm4', type: 'main', next: 'm5', title: '丹火初燃', goal: { kind: 'craftPill', n: 1 }, reward: { dan2: 1 }, rtxt: '中品丹药 +1',
      story: '你在洞府杂物里翻出一尊破旧丹炉，炉底两个小字：玄阳。\n你吹掉灰，升起第一炉火。\n烟起的那一刻，你有点想哭——这洞府，像有主了。' },
    { id: 'm5', type: 'main', next: 'm6', title: '筑基', goal: { kind: 'rank', n: 9 }, reward: { bag: 1 }, rtxt: '储物袋 +1（背包+5格）',
      story: '炼气九层圆满，气海翻涌。\n你盘坐洞府，冲击筑基。\n这一关，过了是修士；过不去，就再来。' },
    { id: 'm6', type: 'main', next: 'm7', title: '凝神', goal: { kind: 'gong2', n: 5 }, reward: { stone: 1000 }, rtxt: '灵石 +1000',
      story: '筑基之后，残经续篇的字才浮出来——《凝神诀》。\n原来这经越往后越深，像一口挖不完的井。' },
    { id: 'm7', type: 'main', next: 'm8', title: '金丹大道', goal: { kind: 'rank', n: 12 }, reward: { ore: 100 }, rtxt: '矿石 +100',
      story: '修士一生最要紧的一关，是金丹。\n将浑身灵力，凝成一颗小小的、滚烫的金丹。\n仙凡之别，就在这一颗丹上。' },
    { id: 'm8', type: 'main', next: null, title: '飞升', goal: { kind: 'rank', n: 25 }, reward: { dao: 1 }, rtxt: '道韵 +1',
      story: '九霄之上，有天门。\n雷云压顶，你踏天而起。\n这一去，山下的樵夫、砍柴的少年、荒山的洞府，都成了前尘。' },
    /* ---- 支线（独立，随时可做） ---- */
    { id: 's1', type: 'side', title: '采药达人', goal: { kind: 'herb', n: 20 }, reward: { stone: 300 }, rtxt: '灵石 +300',
      story: '山里的灵草认得你的脚步了。你一弯腰，它们就冒头。' },
    { id: 's2', type: 'side', title: '探索狂人', goal: { kind: 'explore', n: 10 }, reward: { herb: 50 }, rtxt: '灵草 +50',
      story: '秘境里到底有什么？你去了十次，越去越想再去。' },
    { id: 's3', type: 'side', title: '炼器高手', goal: { kind: 'weapon', n: 3 }, reward: { ore: 50 }, rtxt: '矿石 +50',
      story: '炉火纯青，矿石在你手里变成杀器。你不是铁匠，你是炼器师。' },
    { id: 's4', type: 'side', title: '炼丹宗师', goal: { kind: 'craftPill', n: 20 }, reward: { dan3: 1 }, rtxt: '上品丹药 +1',
      story: '二十炉丹，炉炉不炸。方圆百里，都知道荒山有个会炼丹的。' },
    { id: 's5', type: 'side', title: '洞府之主', goal: { kind: 'cave', n: 10 }, reward: { stone: 2000 }, rtxt: '灵石 +2000',
      story: '洞府不再是那个破洞了。聚灵阵转起来，灵气像水一样流进来。' },
    { id: 's6', type: 'side', title: '散财童子', goal: { kind: 'stoneEarned', n: 100000 }, reward: { bag: 1 }, rtxt: '储物袋 +1',
      story: '灵石多到没处放。你开始理解什么叫「钱是身外之物」。' }
  ];
  /* 阶段三 S6：主线/支线逐条「去哪、找谁、要什么」。
     只放指路句，不改 goal/奖励/解锁；任务面板已渲染 .q-hint，补齐即可。 */
  const QUEST_HINTS = {
    m1: '去藏经阁 · 修炼，坐满三炷香。一炷香就是一下，不用人教。',
    m2: '修为满了就点顶上【突破】。这一步不看天赋，看你坐得够久。',
    m3: '去洞府开畦，一畦一畦开到三级。山腰那块向阳坡地等着。',
    m4: '去洞府 · 炼丹房，升起第一炉火。炉子旧，火是新的。',
    m5: '炼气九层圆满再点【突破】。这一关过不去，就再来一次。',
    m6: '去藏经阁 · 功法，把凝神诀参到五级——每一级都要灵石，越往后越贵。',
    m7: '再往上走三层，到金丹初期。仙凡之别，就在这一颗丹上。',
    m8: '一路修到飞升。这一去，山下的人都成了前尘。',
    s1: '采药二十次。山里的草认得你的脚步。',
    s2: '秘境去满十次。越去越想再去。',
    s3: '去炼器坊，把法宝打上三阶。',
    s4: '二十炉丹，炉炉不炸。去炼丹房慢慢炼。',
    s5: '去洞府 · 聚灵阵，把它开到十级。灵气像水一样流进来。',
    s6: '累计挣够十万灵石。打坐、卖货、塔里那一趟趟都算。'
  };

  /* 数值 */
  const needOf = i => Math.floor(BAL.need0 * Math.pow(BAL.needG, i));
  const rootOf = () => ROOTS[S.rootIdx] || ROOTS[1];
  /* 封顶后的实际等级：横向系统到顶后不再累加，从根上防止数值崩盘 */
  const caveLv = () => Math.min(S.cave, BAL.caveMax);
  const danLv = () => Math.min(S.dan, BUILDINGS.alchemy.maxLevel);
  /* 功法：三种叠加，各自封顶 max 级 */
  const gongLvOf = g => Math.min(S[g.id], g.max);
  const gongMult = () => GONGS.reduce((a, g) => a * Math.pow(g.rate, gongLvOf(g)), 1);
  const gongUnlocked = g => S.rank >= g.unlock;
  const weaponMult = () => BAL.weaponMult[artSeg('lq')] || 1;
  /* 旧法宝阶位与有效阶位分开：炼制/图鉴 owned 只认旧法宝，效果统一认两系共同最高。 */
  const oldArtSeg = fam => (fam === 'lq' ? S.weapon : ((S.art && S.art[fam]) || 0));
  const artSeg = fam => Math.max(oldArtSeg(fam), rv4SoulMax(fam));
  const artFx = (fam, seg) => { const tbl = ART_FX[fam]; return (tbl && tbl[seg]) || 0; };
  /* A4b 乙案（2026-11-20 制作人批、呆呆复算通过）：强化档四族共用 S.weaponLv，
     战/破/财按 30% 系数受益；只在该族已获得时生效（seg>0），不白送。 */
  const enhShareLv = () => Math.max(0, Math.min(BAL.enhanceMax, S.weaponLv | 0));
  const artPowPct = () => { const seg = artSeg('bg'); return artFx('bg', seg) + (seg ? 0.015 * enhShareLv() : 0); };   /* +1.5%/级 */
  const artBrkPct = () => { const seg = artSeg('brk'); return artFx('brk', seg) + (seg ? 0.0015 * enhShareLv() : 0); }; /* +0.15pp/级 */
  const artStonePct = () => { const seg = artSeg('cai'); return artFx('cai', seg) + (seg ? 0.006 * enhShareLv() : 0); }; /* +0.6%/级 */
  /* ---- 寿元读取口（第 96 轮）：全部走这几个函数，UI/断言不许自己算 ---- */
  const lifeStage = () => lifeStageOf(S.rank);
  const lifeMax = () => LIFE_MAX[lifeStage()];
  const lifeAge = () => Math.floor((S.life && S.life.age) || 0);
  const lifeLeft = () => { const m = lifeMax(); return isFinite(m) ? Math.max(0, m - lifeAge()) : Infinity; };
  const lifeOn = () => !!(S.life && S.life.on);
  const isZuo = () => !!(S.zuo);
  const gens = () => (S.legacy && S.legacy.gens) || 0;
  /* 道统：转世留下的永久修炼加成（与道韵分开算，两条乘区各自独立） */
  const legacyMult = () => 1 + gens() * BAL.legacyExp;
  /* 还剩多少「真实秒」可活（飞升 = Infinity）：tick 拿它截断这一段收益 */
  const lifeRoomSec = () => {
    const m = lifeMax();
    return isFinite(m) ? Math.max(0, (m - ((S.life && S.life.age) || 0)) * BAL.lifeYearSec) : Infinity;
  };
  /* ---- 心魔照镜（第 99 轮）：心魔 = 上一世的你 ----
     上一世死时的战力原样记下来，照镜就是「打赢上一世的自己」——不掷骰、不受当世加成影响。
     胜场给的是修炼乘区（每胜 +2%，封顶 5 胜 +10%），与道统 ×(1+10%×世) 各算一路。 */
  const mirrorWins = () => (S.mirror && S.mirror.wins) || 0;
  const mirrorExpMult = () => 1 + Math.min(mirrorWins(), MIRROR.winCap) * MIRROR.winK;
  const mirrorPower = () => Math.max(10 * POW_K, Math.round(Number(S.mirror && S.mirror.pow) || 0));
  const mirrorReady = () => gens() > 0 && !(S.mirror && S.mirror.done) && mirrorPower() > 10 * POW_K;
  /* ---------- 心魔守心（第 104 轮）----------
     照镜之前先过三息：心魔每息说一句你上一世说得出的话，你只有两条路——
     默守（心念 +1，破镜线每点降 1.5%）或断喝（当场从心魔身上撕下一块修为 need×0.08，心念不进）。
     两条都不是白拿：想早破镜就忍住不取，想攒修为就少一点心念。
     只动「照镜这一下的门槛」与一次性修为，不动战力公式、不动 needG、不加倍率通道。 */
  const CALM_K = 0.015, CALM_EXP = 0.08;
  const CALM = [
    { ask: '「这一世，你也会像我一样，死在一间空屋子里。」' },
    { ask: '「你记得的那座山门，早就不在了。你还护着谁？」' },
    { ask: '「把剑放下吧。像我一样，歇一歇。」' }
  ];
  const calmStep = () => Math.max(0, Math.min(CALM.length, (S.mirror && S.mirror.calmStep) | 0));
  const calmDone = () => calmStep() >= CALM.length;
  const calmCount = () => Math.max(0, Math.min(3, (S.mirror && S.mirror.calm) | 0));
  const mirrorCalmK = () => 1 - CALM_K * calmCount();
  const mirrorNeed = () => Math.max(10 * POW_K, Math.round(mirrorPower() * mirrorCalmK()));
  const calmExpGain = () => Math.max(1, Math.round(needOf(S.rank) * CALM_EXP));
  function calmPick(k){
    if(!mirrorReady() || calmDone()) return false;
    if(k !== 'hold' && k !== 'break') return false;
    S.mirror.calmStep = Math.min(CALM.length, calmStep() + 1);
    if(k === 'hold'){
      S.mirror.calm = Math.min(3, calmCount() + 1);
      log('🪷 守心第 ' + S.mirror.calmStep + ' 息：你没有出声。心念 +1。', '');
    }else{
      const v = calmExpGain();
      const got = addActiveExp(v);
      log('🪷 守心第 ' + S.mirror.calmStep + ' 息：你断喝一声，心魔退半步——修为 +' + fmt(got) + '。', 'gold');
    }
    if(calmDone()) log('🪷 三息已过。心念 ' + calmCount() + '/3，破镜线 ×' + mirrorCalmK().toFixed(3) + '。', 'gold');
    sfx.pop(); save(); render();
    return true;
  }
  /* 阶段一（路3）W4：道韵软顶 + 印记 + 合成乘区总封顶。
     道韵前 5 点保留原值，第 6 点起 exp 每点 +10%、stone 每点 +10%；
     道韵×道统×印记三通道合成封 ×6.0（20 世由 ×37.62 压到 ×6.00，对 8 世内零损）。 */
  const daoExpMult = () => 1 + Math.min(5, Math.max(0, S.dao | 0)) * BAL.daoExp + Math.max(0, (S.dao | 0) - 5) * 0.10;
  const daoStoneMult = () => 1 + Math.min(5, Math.max(0, S.dao | 0)) * BAL.daoStone + Math.max(0, (S.dao | 0) - 5) * 0.10;
  const imprintExpMult = () => 1 + Math.min(IMPRINT.expCap, gens() * IMPRINT.expPerGen);
  const legacyChainMult = () => Math.min(6.0, daoExpMult() * legacyMult() * imprintExpMult());
  /* 突破成功率印记：与 daoBreak（每点 +2%）合并封顶 +8%，避免两条通道重复记功。 */
  const breakImprintK = () => Math.min(IMPRINT.breakCap, gens() * IMPRINT.breakPerGen + Math.max(0, S.dao | 0) * BAL.daoBreak);
  const expRate = () => BAL.v0 * rootOf().mult * Math.pow(BAL.rankH, S.rank) * gongMult() * weaponMult() * enhanceExpMult() * affixExpMult() * legacyChainMult() * mirrorExpMult() * (1 + encBuff()) * (1 + danExpBuff()) * wuExpMult() * (1 + dtExpPct() / 100);
  /* 阶段二 N2：挂机被动乘区（r18 起；r<18 恒 1）。主动产出（打坐/参悟/历练/塔悟符）继续读 expRate()。 */
  const latePassiveMult = () => {
    const r = S.rank | 0;
    if(r < 18) return 1;
    const i = Math.min(BAL.latePassive.length - 1, r - 18);
    return BAL.latePassive[i];
  };
  const passiveRate = () => expRate() * latePassiveMult();
  const stoneRate = () => BAL.stone0 * Math.pow(BAL.stoneRankH, S.rank) * Math.pow(BAL.caveR, caveLv()) * affixStoneMult() * daoStoneMult() * wuStoneMult() * (1 + artStonePct()) * (1 + dtStonePct() / 100);
  /* 境界加成：每突破一层，修炼速度 +18%（让「突破」有实打实的变强感） */
  const rankMult = () => Math.pow(BAL.rankH, S.rank);
  const gongCost = g => Math.floor(needOf(S.rank) * g.costK * Math.pow(g.costR, S[g.id]));
  const caveCost = () => Math.floor(needOf(S.rank) * BAL.caveK * Math.pow(BAL.caveCostR, S.cave));
  const fieldCost = () => Math.floor(needOf(S.rank) * BAL.fieldK * Math.pow(BAL.fieldCostR, S.field));
  const mineCost = () => Math.floor(needOf(S.rank) * BAL.mineK * Math.pow(BAL.mineCostR, S.mine));
  /* 灵田：自动凝灵石（灵草改走「播种 → 生长 → 收获」种田闭环）；矿脉：产矿石 */
  const fieldPerSec = () => Math.min(S.field, BAL.fieldMax) * BAL.fieldPer / 60;
  const minePerSec = () => Math.min(S.mine, BAL.mineMax) * BAL.minePer / 60 * (1 + danGainPct());
  const treasureCost = () => Math.floor(needOf(S.rank) * BAL.treasureK);
  /* 参悟成本 = 这一层的灵石收入 × ponderCostK。
     一层收入 = 灵石/秒 × 一层要挂多久 = stoneRate × (need / expRate)，两个都是现成函数，
     所以它天然跟着境界走，不需要再单独维护一条成本曲线。 */
  const ponderCost = () => {
    const layerSec = needOf(S.rank) / Math.max(1e-6, expRate());
    return Math.max(50, Math.floor(stoneRate() * layerSec * BAL.ponderCostK));
  };
  /* ============================================================
   * 洞天开辟（2026-10-25 第 70 节）
   *   五方洞天 × 三重（初辟 / 灵脉 / 洞天），价格锚"一层灵石收入"：
   *   一座合计 1.5 层、五座 7.5 层——后期要攒，但占比不随境界漂。
   *   效果全是平的百分比，挂进现有乘区；不新增货币，也不让参悟/悟道变快。
   * ============================================================ */
  const DT_MAX = 3;
  const DT_K = [0.30, 0.50, 0.70];                   /* 初辟 / 灵脉 / 洞天 各占一层收入的比例 */
  const DT_LV_NAME = ['初辟', '灵脉', '洞天'];
  const DT_FIELDS = {
    craft:  { label: '炼丹成功率', sign: '+' },
    refund: { label: '失败返还',   sign: '+' },     /* 显示成绝对值（30% → 40%） */
    pow:    { label: '战力',       sign: '+' },
    enh:    { label: '强化成功率', sign: '+' },
    ore:    { label: '矿石消耗',   sign: '−' },
    off:    { label: '离线封顶',   sign: '+' },
    bag:    { label: '背包',       sign: '+' },
    exp:    { label: '修炼',       sign: '+' },
    stone:  { label: '灵石',       sign: '+' }
  };
  /* eff 的每个字段是"当前等级的总量"（下标 = 等级 0~3），主洞再整体 ×1.5。
     unlock = 冲到该重所需的绝对境界；lv1 的 rank 就是这座洞天的解锁层。 */
  const DONGTIAN = [
    { id:'qing', name:'青华洞天', dir:'东', theme:'丹霞', unlock:[15,17,19],
      eff:{ craft:[0,1,2,4], refund:[0,0,0,10] },
      mats:[ [{t:'mat_feather',n:2}], [{t:'mat_feather',n:6}], [{t:'boss_feather',n:2}] ],
      desc:'丹霞映炉，炉火自明。' },
    { id:'zhu', name:'朱明洞天', dir:'南', theme:'兵火', unlock:[16,18,20],
      eff:{ pow:[0,4,9,15] },
      mats:[ [{t:'mat_eye',n:2}], [{t:'mat_eye',n:6}], [{t:'boss_pearl',n:2}] ],
      desc:'兵火淬锋，杀伐自生。' },
    { id:'su', name:'素灵洞天', dir:'西', theme:'地藏', unlock:[17,19,21],
      eff:{ enh:[0,2,5,10], ore:[0,0,0,20] },
      mats:[ [{t:'mat_bone',n:2}], [{t:'mat_bone',n:6}], [{t:'boss_pearl',n:2}] ],
      desc:'地藏藏金，器成不动。' },
    { id:'xuan', name:'玄冥洞天', dir:'北', theme:'归藏', unlock:[18,20,22],
      eff:{ off:[0,1,2.5,4.5], bag:[0,6,12,20] },
      mats:[ [{t:'mat_feather',n:2}], [{t:'mat_feather',n:6}], [{t:'boss_heart',n:2}] ],
      desc:'归藏纳虚，闭关不知春秋。' },
    { id:'huang', name:'黄庭洞天', dir:'中', theme:'地脉', unlock:[19,21,23],
      eff:{ exp:[0,2,5,9], stone:[0,3,7,12] },
      mats:[ [{t:'mat_eye',n:2}], [{t:'mat_eye',n:6}], [{t:'boss_heart',n:2}] ],
      desc:'地脉通灵，一呼一吸皆成修为。' }
  ];
  /* batch5：破境之外的功能解锁点总表（只列现有系统/数据；不新增数值）。
     插屏只报「新功能名 + 一句话用途 + 前往」，已弹过的不再重复。 */
  const UNLOCK_POINTS = [
    { id:'secret2', rank:6, name:'秘境 · 幽谷秘境', desc:'新秘境章节：产炼丹/炼器材料与 Boss 料', go:['secret'] },
    { id:'gate', rank:BAL.gateUnlock, name:'宗门 · 山门', desc:'可收弟子、派差事；离线也照算', go:['zong','xx-gate'] },
    { id:'gong2', rank:9, name:'功法 · 凝神诀', desc:'第二门功法，修炼速度再上一阶', go:['xiu','xx-gong-sec'] },
    { id:'secret3', rank:12, name:'秘境 · 北冥玄境', desc:'更高阶秘境：产高阶材料与 Boss 料', go:['secret'] },
    { id:'gong3', rank:12, name:'功法 · 金丹大道', desc:'第三门功法，修炼速度再上一阶', go:['xiu','xx-gong-sec'] },
    { id:'dt-qing', rank:15, name:'洞天 · 青华洞天', desc:'洞天开辟：永久修炼与灵石加成', go:['dong','xx-dongtian-sec'] },
    { id:'dt-zhu', rank:16, name:'洞天 · 朱明洞天', desc:'洞天开辟：永久修炼与灵石加成', go:['dong','xx-dongtian-sec'] },
    { id:'dt-su', rank:17, name:'洞天 · 素灵洞天', desc:'洞天开辟：永久修炼与灵石加成', go:['dong','xx-dongtian-sec'] },
    { id:'secret4', rank:18, name:'秘境 · 九霄天域', desc:'终章秘境：产最高阶材料与 Boss 料', go:['secret'] },
    { id:'dt-xuan', rank:18, name:'洞天 · 玄冥洞天', desc:'洞天开辟：永久修炼与灵石加成', go:['dong','xx-dongtian-sec'] },
    { id:'dt-huang', rank:19, name:'洞天 · 黄庭洞天', desc:'洞天开辟：永久修炼与灵石加成', go:['dong','xx-dongtian-sec'] }
  ];
  function unlockSeen(){ return Array.isArray(S.unlocks) ? S.unlocks : (S.unlocks = []); }
  const unlockPending = [];
  /* 只在「本次破境跨过门槛」时入队，不按当前 rank 扫描——避免旧档/测试改 rank 时一次弹一串 */
  function queueUnlocks(rankBefore, rankAfter){
    if(!(rankAfter > rankBefore)) return;
    const seen = unlockSeen();
    UNLOCK_POINTS.forEach(p => {
      if(p.rank > rankBefore && p.rank <= rankAfter && seen.indexOf(p.id) < 0 && unlockPending.indexOf(p.id) < 0)
        unlockPending.push(p.id);
    });
  }
  function unlockTick(){
    if(!unlockPending.length) return;
    const cs = document.getElementById('craft-settle');
    if(cs && !cs.classList.contains('hidden')) return;
    if(document.querySelector('.modal:not(.hidden)')) return;
    const seen = unlockSeen();
    const id = unlockPending[0];
    const next = UNLOCK_POINTS.find(p => p.id === id);
    if(!next){ unlockPending.shift(); return; }
    unlockPending.shift();
    seen.push(next.id);
    save();
    showSettle({
      icon: '✨', title: '新功能解锁 · ' + next.name,
      sub: next.desc,
      rows: [settleLine('解锁条件', '境界 ' + RANK_NAMES[next.rank] + '（已达成）', 'good')],
      note: '只报本次新解锁；已解锁过的不再重复。'
    });
    const box = document.getElementById('cs-rows');
    if(box && next.go){
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn-main settle-act'; b.textContent = '前往 · ' + next.name;
      b.onclick = () => { const m = document.getElementById('craft-settle'); if(m) m.classList.add('hidden'); try{ ROUTER.open(next.go[0], next.go[1] || undefined); }catch(e){} };
      box.appendChild(b);
    }
  }
  const dtCave = id => DONGTIAN.find(c => c.id === id) || null;
  const dtLv = id => Math.max(0, Math.min(DT_MAX, (S.dt && S.dt[id]) | 0));
  function dtMainId(){
    if(S.dtMain && dtLv(S.dtMain) > 0) return S.dtMain;
    const first = DONGTIAN.find(c => dtLv(c.id) > 0);
    return first ? first.id : '';
  }
  const dtMult = id => (dtLv(id) > 0 && id === dtMainId()) ? 1.5 : 1;
  const dtNum = v => (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  function dtLayerInc(){ return stoneRate() * (needOf(S.rank) / Math.max(1e-6, expRate())); }
  /* 价格按"买的那一刻的境界"算：同样 1.5 层，早买绝对数小、占比不变 */
  function dtCost(id){
    const c = dtCave(id), lv = dtLv(id);
    if(!c || lv >= DT_MAX) return 0;
    return Math.max(1, Math.floor(dtLayerInc() * DT_K[lv]));
  }
  function dtMats(id){
    const c = dtCave(id), lv = dtLv(id);
    return (c && lv < DT_MAX) ? c.mats[lv] : [];
  }
  /* dtBonus = 该洞天不乘主洞的当前总量；dtEff = 实际生效（含主洞 ×1.5） */
  function dtBonus(id){
    const c = dtCave(id), lv = dtLv(id), out = {};
    if(!c) return out;
    Object.keys(c.eff).forEach(k => { out[k] = Math.round(c.eff[k][lv] * 100) / 100; });
    return out;
  }
  function dtEff(id){
    const raw = dtBonus(id), m = dtMult(id), out = {};
    Object.keys(raw).forEach(k => { out[k] = Math.round(raw[k] * m * 100) / 100; });
    return out;
  }
  function dtTotals(){
    const out = { craft:0, refund:0, pow:0, enh:0, ore:0, off:0, bag:0, exp:0, stone:0 };
    DONGTIAN.forEach(c => {
      const e = dtEff(c.id);
      Object.keys(e).forEach(k => { out[k] += e[k]; });
    });
    Object.keys(out).forEach(k => { out[k] = Math.round(out[k] * 100) / 100; });
    return out;
  }
  const dtExpPct   = () => dtTotals().exp;
  const dtStonePct = () => dtTotals().stone;
  const dtPowPct   = () => dtTotals().pow;
  const dtCraftPct = () => dtTotals().craft;
  const dtRefundPct= () => dtTotals().refund;
  const dtEnhPct   = () => dtTotals().enh;
  const dtOreDisc  = () => dtTotals().ore;
  const dtOffSec   = () => dtTotals().off * 3600;
  const dtBagN     = () => dtTotals().bag;
  function dtEffText(c, lv, mult){
    if(!c || lv <= 0) return '尚未开辟';
    const parts = [];
    Object.keys(c.eff).forEach(k => {
      const v = Math.round(c.eff[k][lv] * mult * 100) / 100;
      if(!v) return;
      if(k === 'refund') parts.push('失败返还 ' + Math.round(CRAFT.failRefund * 100 + v) + '%');
      else if(k === 'off') parts.push('离线封顶 +' + dtNum(v) + ' 小时');
      else if(k === 'bag') parts.push('背包 +' + dtNum(v) + ' 格');
      else parts.push(DT_FIELDS[k].label + ' ' + DT_FIELDS[k].sign + dtNum(v) + '%');
    });
    return parts.length ? parts.join(' · ') : '—';
  }
  /* 合计行（第 71 节）：五张卡各写自己的当前值（主洞 ×1.5 也只写在自己的卡上），
     "一共加了多少"不该让玩家心算，这里按字段汇总一次。 */
  function dtSumText(t){
    const parts = [];
    if(t.craft) parts.push('炼丹成功率 +' + dtNum(t.craft) + '%');
    if(t.refund) parts.push('失败返还 ' + Math.round(CRAFT.failRefund * 100 + t.refund) + '%');
    if(t.pow) parts.push('战力 +' + dtNum(t.pow) + '%');
    if(t.enh) parts.push('法宝强化 +' + dtNum(t.enh) + '%');
    if(t.ore) parts.push('矿石消耗 −' + dtNum(t.ore) + '%');
    if(t.exp) parts.push('修炼 +' + dtNum(t.exp) + '%');
    if(t.stone) parts.push('灵石 +' + dtNum(t.stone) + '%');
    if(t.off) parts.push('离线封顶 +' + dtNum(t.off) + ' 小时');
    if(t.bag) parts.push('背包 +' + dtNum(t.bag) + ' 格');
    return parts.length ? '合计：' + parts.join(' · ') : '';
  }
  function dtOpen(id){
    const c = dtCave(id);
    if(!c) return false;
    const lv = dtLv(id);
    if(lv >= DT_MAX){ log('【' + c.name + '】已三重圆满。', 'gold'); return false; }
    const needRank = c.unlock[lv];
    if((S.rank | 0) < needRank){
      log('【' + c.name + '】' + DT_LV_NAME[lv] + '需 ' + RANK_NAMES[needRank] + '（当前 ' + RANK_NAMES[S.rank | 0] + '）。', 'bad');
      return false;
    }
    const cost = dtCost(id);
    if(S.stone < cost){ log('灵石不足，开辟【' + c.name + '】' + DT_LV_NAME[lv] + '要 ' + fmt(cost) + ' 灵石。', 'bad'); return false; }
    const mats = dtMats(id);
    for(const m of mats){
      if(!matHas(m.t, m.n)){ log(matName(m.t) + '不足，开辟【' + c.name + '】' + DT_LV_NAME[lv] + '要 ' + m.n + ' 个。', 'bad'); return false; }
    }
    const hadMain = !!(S.dtMain && dtLv(S.dtMain) > 0);
    S.stone -= cost;
    mats.forEach(m => matTake(m.t, m.n));
    S.dt[id] = lv + 1;
    if(!hadMain){
      const first = DONGTIAN.find(x => dtLv(x.id) > 0);
      S.dtMain = first ? first.id : id;
      if(S.dtMain === id) log('🌌 首座洞天自成主洞，其效 ×1.5；他日可随时改奉。', 'gold');
    }
    log('⛰️ 洞天开辟：【' + c.name + '】' + DT_LV_NAME[lv] + '成（' +
      dtEffText(c, lv + 1, dtMult(id)) + '）。', 'gold');
    sfx.win(); save(); render();
    return true;
  }
  function dtMainSet(id){
    if(dtLv(id) <= 0){ log('这座洞天尚未开辟。', 'bad'); return false; }
    if(dtMainId() === id) return false;
    S.dtMain = id;
    log('🌌 改奉【' + dtCave(id).name + '】为主洞，其效 ×1.5。', 'gold');
    sfx.click(); save(); render();
    return true;
  }
  /* ============================================================
   * 山门 · 弟子（2026-10-25 第 61 节）
   *   形状：花灵石开山 → 花灵石收徒 → 把弟子派去闭关/采药/巡山 → 时辰到了他们自己回山、
   *   账当场入袋（**不卡收益**，与信匣同一条纪律：放置游戏不惩罚没手动收菜的人）。
   *   玩家要做的只有一件事：回来把闲着的人再派出去。这就是后期缺的那个"上线就有事做"。
   *   三种差事 = 三条不同的成长轴，所以"谁去干什么"是真正的取舍，不是数值高低：
   *     闭关 → 修为（境界这条主轴的唯一缺口）
   *     采药 → 灵草/百年灵草（炼丹，反过来喂突破成功率）
   *     巡山 → 矿石 + 悟道值（法宝强化 / 天机阁与悟道树的那笔钱）
   *   产出全部锚在"自己的修炼速度"或固定小额上，**不锚当前层需求**——
   *   锚需求的系统会随着层数膨胀，最后把 1.568×/层 的结构斜率一起改掉。
   * ============================================================ */
  const GATE_TASKS = {
    seclude: { id:'seclude', name:'闭关', dur: 4 * 3600 },
    herb:    { id:'herb',    name:'采药', dur: 2 * 3600 },
    patrol:  { id:'patrol',  name:'巡山', dur: 6 * 3600 }
  };
  /* 资质：权重决定"天阶"有多稀罕。资质只影响产出（1~5），不做成长——弟子的故事在别处，
     这里是一个可算的系统，不该再叠一层"养成"让玩家算不过来。 */
  const GATE_APTS = [ {n:'凡骨', w:36}, {n:'黄阶', w:30}, {n:'玄阶', w:21}, {n:'地阶', w:10}, {n:'天阶', w:3} ];
  const GATE_LV_NAME = ['五品', '四品', '三品', '二品', '一品'];
  const GATE_NAMES = ['叶青梧','沈砚','陆知白','苏小满','裴无咎','顾长风','白露','程雪衣','谢知微','温三更',
    '江晚舟','宋岐','林听泉','霍小山','秦望舒','穆青崖','燕十三','柳含烟','闻人砚','周密'];

  /* ---------- 弟子的话（第 63 节）----------
     一个二维表：[资质 5 档][趟数 4 档]，每格两句，按弟子 id 取其一。
     三条纪律：
       1. **不随机**。这个面板 500ms 局部重绘一次，随机取句会让字每帧都换，
          像坏了；确定性取句才看得出"这个人这几天变了"。
       2. **档位要能被玩出来**。趟数是 0 / 1~2 / 3~4 / 5（差一趟出师），
          所以同一个人走完六趟会换四次话——这就是"成长"最便宜的写法。
       3. **话要平，不要美**。一句小动作或一句实情，不写抒情长句：
          这一行字只有 10.5px，说漂亮话就成噪音了。
     满六趟时名牒上放的是"出师"按钮，没有这一行（第 62 节）。 */
  const GATE_VOICE = [
    /* 凡骨：根骨最差，话里全是"补"和"不服" */
    [['根骨差，练一遍不够练三遍。', '师兄说我笨。我不吭声。'],
     ['走一趟回来，腿是软的。', '记不住路，我一路数石头。'],
     ['路认熟了，脚也不疼了。', '还是慢，但没落下过。'],
     ['再一趟就满六趟了。', '手上磨出茧，也算有长进。']],
    /* 黄阶 */
    [['剑还没握稳。', '山上比家里安静。'],
     ['今天比昨天多站了半炷香。', '采回来的药，你数过没有。'],
     ['剑招记全了，就是慢。', '后山那条路，我闭着眼也能走。'],
     ['六趟了，我等你开口。', '再派一趟吧，我还不想走。']],
    /* 玄阶 */
    [['让我守山吧，我不怕闷。', '夜里听见后山有动静。'],
     ['这一趟没白走。', '炉火我添过了。'],
     ['同辈里，我算稳的。', '山门的钟，听着像催人。'],
     ['该走了。你留我，我就留下。', '差一趟，我把话说到这儿。']],
    /* 地阶 */
    [['我想试试闭关久一点。', '有人比我起得早，我知道是谁。'],
     ['这点活，不费什么。', '带回来的东西，你收着。'],
     ['师兄们开始问我了。', '我想看看山那边的样子。'],
     ['六趟了。你要留我，说一声。', '该做的我都做完了。']],
    /* 天阶：不必再点化，话里带点自持 */
    [['这点差事，不累。', '师父，我快追上你了。'],
     ['一趟不够看。', '山外也就那样。'],
     ['他们跟不上，我等他们。', '我练我的，不与人比。'],
     ['六趟了。留不留，你一句话。', '这座山，我闭着眼也走得完。']]
  ];

  /* 弟子记事（第 65 节）：连着两趟以上做同一件事，话就换成那件事的。
     形状 [差事][资质带 0/1/2][连着几趟 0=2~3、1=4+] → 两句。
     资质带只分三段（凡骨·黄 / 玄 / 地·天）：同一件事，笨人和天才的口气不一样，
     但没必要五档全写一遍——那会变成"为凑数而凑数"，每档说的话其实没差别。 */
  const GATE_VOICE_TASK = {
    herb: [
      [['采药这活，比练剑实在。', '背篓磨破了两个。'],
       ['连着采，手一摸就知道是什么草。', '药圃的路，我走顺了。']],
      [['采药看着轻，其实耗人。', '这几味，我认得比师兄准。'],
       ['连采六趟，鼻子都灵了。', '哪片坡上药最全，我知道。']],
      [['采回来的，都是上品的。', '这活我做，是浪费。'],
       ['总派我采药，是缺人还是信我？', '药圃该翻土了，我记着。']]
    ],
    patrol: [
      [['山里夜里冷，我穿了厚的。', '巡一圈，脚上是泥。'],
       ['每块界碑我都摸过一遍。', '路我认得，可还是怕。']],
      [['昨夜山那边有动静，我看了。', '巡山不难，难的是不走神。'],
       ['连着巡，哪块石头松我都知道。', '夜里我睡得着，白天补。']],
      [['我巡过的地方，没人敢来。', '山界上的草，我踩平了。'],
       ['总让我巡山，倒像是让我看家。', '这山我守得住，只是没仗打。']]
    ],
    seclude: [
      [['静室里，坐不住也得坐。', '坐了两个时辰，腿麻。'],
       ['数息数到一百，就乱了。', '闭久了，听见自己心跳。']],
      [['这一次，气顺多了。', '静室里什么也听不见，正好。'],
       ['连着闭，气自己会走。', '我不想出关，可饭得吃。']],
      [['闭关对我来说，不算苦。', '这次有所得，说不清。'],
       ['总把我关进去，是怕我出来？', '再给我几天，我能破一层。']]
    ]
  };

  /* 弟子回山主动开口（第 66 节）：名牒上的话是"你问他才说"（闲置才显示），
     这一批是"他回山那一刻自己说的"，落在日志里。形状 [差事][事件档 0/1/2][两句]。
     事件档不是连做区间，是"恰好到门槛"：0=第一次连着(2)、1=开始有意见(4)、2=临行(6=出师门槛)。
     1/3/5 趟不说话——日志是扫一眼的地方，人人天天说话就成了刷屏。
     不分资质带：名牒已经表达了资质的口气差异，日志一扫而过，写三档就是凑数。 */
  const GATE_VOICE_HOME = {
    herb: [
      ['又是我来采药，背篓都认路了。', '药圃的土翻过了，比上回好走。'],
      ['这几趟采下来，我闭眼也认得药味。', '师父，东坡的灵芝该采了。'],
      ['六趟满了。这背篓留给下一个人吧。', '最后一趟，采的都是好货。']
    ],
    patrol: [
      ['又巡了一趟，山里没事。', '界碑我都重新摸了一遍。'],
      ['这几趟巡下来，夜里什么声我都知道。', '师父，西边篱笆松了，我记着。'],
      ['六趟满了。这山我交还给你。', '最后一趟，走到山门天刚亮。']
    ],
    seclude: [
      ['又坐了一轮，气顺了些。', '静室的蒲团，被我坐热了。'],
      ['这几轮坐下来，呼吸自己会沉。', '师父，我好像摸到点门槛了。'],
      ['六趟满了。出去以后，我不会懈怠。', '最后一轮，我把自己坐空了。']
    ]
  };

  /* 弟子对玩家的记忆（第 67 节）：两处"他记得你"。
     BLESS = 点化那一刻的反应（人就在山上，当场开口），按升到的新资质取句，[新资质-2][两句]；
     FAREWELL = 被点化过的弟子下山时的告别语（这身资质是你给的），bless ≥ 1 才用。
     仍是纯文案：一个 int 字段，不碰任何产出与价格锚。 */
  const GATE_VOICE_BLESS = [
    ['经脉里像有热水走过。', '这一身浊气，散了些。'],
    ['耳朵清了，夜里听得见风。', '师父，我好像能看见气了。'],
    ['骨头缝里都是力气。', '方才那阵疼，值。'],
    ['原来天阶是这种感觉。', '师父，我对得起这份灵石了。']
  ];
  const GATE_VOICE_FAREWELL = [
    ['你替我洗过经脉，这份情我带下山。', '这身资质是你给的，丢不了人。']
  ];

  const gateList = () => (S.gate && Array.isArray(S.gate.disciples)) ? S.gate.disciples : [];
  const gateLv   = () => Math.max(0, Math.min(BAL.gateMaxLv, (S.gate && S.gate.lv) | 0));
  const gateGradN = () => Math.max(0, Math.min(9999, Number((S.gate && S.gate.grad) || 0)));
  const gateCap  = () => BAL.gateCapBase + gateLv() * BAL.gateCapPer;
  /* 门风：出师过的人越多，山门越像个山门（永久、封顶，不许无限涨） */
  const gateFeng = () => BAL.gateFengPer * Math.min(BAL.gateFengCap, gateGradN());
  const gateYieldMult = () => 1 + BAL.gateYieldPer * gateLv() + gateFeng();
  /* 一层灵石收入 = 灵石/秒 × 一层要挂多久（与参悟同一把尺子，别另开一条曲线） */
  const gateLayerStone = () => stoneRate() * (needOf(S.rank) / Math.max(1e-6, expRate()));
  const gateBuildCost   = () => Math.max(200, Math.floor(gateLayerStone() * BAL.gateBuildK));
  const gateLvCost      = () => Math.max(200, Math.floor(gateLayerStone() * BAL.gateLvK * Math.pow(BAL.gateLvR, Math.max(0, gateLv() - 1))));
  const gateRecruitCost = () => Math.max(100, Math.floor(gateLayerStone() * BAL.gateRecruitK * (1 + BAL.gateRecruitR * gateList().length)));
  const gateTaskOf = d => (d && d.task && GATE_TASKS[d.task]) ? GATE_TASKS[d.task] : null;
  const gateBusy   = d => !!gateTaskOf(d);
  /* ⚠️ 时间戳是 13 位毫秒，**不能用 `|0`**（32 位截断 → 4 小时差事的倒计时会显示成 0 秒）。
     第 61 节第一次跑真人巡检就栽在这儿：函数级测试全绿，点了按钮却是"0 秒"。 */
  const gateT0     = d => (d && typeof d.t0 === 'number' && isFinite(d.t0)) ? d.t0 : 0;
  const gateLeft   = d => { const t = gateTaskOf(d); return t ? Math.max(0, gateT0(d) + t.dur * 1000 - Date.now()) : 0; };
  const gateIdleN  = () => gateList().filter(d => !gateBusy(d)).length;
  /* 已做差事数：小整数，但同样走 Number()——`|0` 只在 0~2^31 上可信（第 61 节的教训） */
  const gateSvc    = d => (d && typeof d.svc === 'number' && isFinite(d.svc)) ? Math.max(0, Math.floor(d.svc)) : 0;
  const gateAptOf  = d => Math.max(1, Math.min(5, (d && d.apt) | 0));
  /* 点化：一档一口价，不看当前资质（各档加的是同一份产出，价也就该一样） */
  const gateAptCost = () => Math.max(100, Math.floor(gateLayerStone() * BAL.gateAptK));
  const gateGradReady = d => gateSvc(d) >= BAL.gateGradSvc;
  /* 趟数分四档：0 / 1~2 / 3~4 / 差一趟（出师那趟单独算，名牒上放的是按钮） */
  const gateVoiceTier = d => {
    const s = Math.min(gateSvc(d), BAL.gateGradSvc - 1);
    return s <= 0 ? 0 : s <= 2 ? 1 : s <= BAL.gateGradSvc - 2 ? 2 : 3;
  };
  /* 弟子记事：上回派去干什么、连着几趟（第 65 节）。
     只记"上一趟"就够——玩家看得出的是"他一直被派去采药"，不需要整部履历。 */
  const gateLast   = d => (d && GATE_TASKS[d.last]) ? d.last : '';
  const gateRun    = d => (d && typeof d.run === 'number' && isFinite(d.run)) ? Math.max(0, Math.floor(d.run)) : 0;
  /* 连着几趟分三段：0~1 趟不算"连着"，2~3 趟是"总派我"，4 趟以上才允许他有点意见 */
  const gateRunBand = d => { const r = gateRun(d); return r >= 4 ? 2 : r >= 2 ? 1 : 0; };
  /* 资质带：同一件事，凡骨与天阶的口气不该一样（GATE_VOICE_TASK 只分三段） */
  const gateAptBand = d => { const a = gateAptOf(d); return a <= 2 ? 0 : a === 3 ? 1 : 2; };
  /* 回山开口的事件档（第 66 节）：run **恰好**落在 2 / 4 / 出师门槛(6)那一趟才算"到了开口的时候"
     ——是门槛，不是区间。1/3/5 趙不开口，防止日志被话说满。 */
  const gateHomeBand = r => (r === BAL.gateGradSvc) ? 2 : (r === 4) ? 1 : (r === 2) ? 0 : -1;
  /* 稳定哈希：同一个弟子永远说同一句（不能用 Math.random——面板 500ms 重绘一次，字会乱跳） */
  const gateHash = s => { let h = 0; for(let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const gateVoice = d => {
    const pool = (gateRunBand(d) > 0 && GATE_VOICE_TASK[gateLast(d)])
      ? GATE_VOICE_TASK[gateLast(d)][gateAptBand(d)][gateRunBand(d) - 1]
      : GATE_VOICE[gateAptOf(d) - 1][gateVoiceTier(d)];
    return pool[gateHash(String(d.id || d.name || '')) % pool.length];
  };
  /* 出师回馈：锚"一层收入 × 资质/3"——一个天阶弟子的谢礼，是一个凡骨弟子的五倍 */
  const gateGradGain  = d => Math.max(0, Math.floor(gateLayerStone() * BAL.gateGradK * (gateAptOf(d) / 3)));
  /* 红点只看"刚回来的那十分钟"：闲置本身不该一直亮着，否则红点等于常亮，等于没有 */
  const gateFresh = () => gateLv() > 0 && gateList().some(d => {
    const ret = (typeof d.ret === 'number' && isFinite(d.ret)) ? d.ret : 0;
    return !gateBusy(d) && ret > 0 && Date.now() - ret < 10 * 60000;
  });

  function gateBuild(){
    if(gateLv() > 0) return false;
    if((S.rank | 0) < BAL.gateUnlock){ log('开山立派要先筑基（当前 ' + RANK_NAMES[S.rank | 0] + '）。', 'bad'); return false; }
    const c = gateBuildCost();
    if(S.stone < c){ log('灵石不足，开山立派要 ' + fmt(c) + ' 灵石。', 'bad'); return false; }
    S.stone -= c;
    S.gate.lv = 1;
    log('⛩️ 你在后山立起山门，亲笔题了「' + (S.name || '无名') + '」两个字。从今往后，这山上不只你一个人了。', 'gold');
    log('山门 · 五品：可收弟子 ' + gateCap() + ' 人，差事收益 +' + Math.round((gateYieldMult() - 1) * 100) + '%。', 'sys');
    sfx.win(); save(); render();
    return true;
  }
  function gateUp(){
    const lv = gateLv();
    if(!lv){ log('还没有山门。', 'bad'); return false; }
    if(lv >= BAL.gateMaxLv){ log('一品山门已是此界顶峰，再往上，要等飞升之后。', 'gold'); return false; }
    const c = gateLvCost();
    if(S.stone < c){ log('灵石不足，升品阶要 ' + fmt(c) + ' 灵石。', 'bad'); return false; }
    S.stone -= c;
    S.gate.lv = lv + 1;
    log('⛩️ 山门升作「' + GATE_LV_NAME[S.gate.lv - 1] + '」：可收弟子 ' + gateCap() + ' 人，差事收益 +' + Math.round((gateYieldMult() - 1) * 100) + '%。', 'gold');
    sfx.win(); save(); render();
    return true;
  }
  function gateNewName(){
    const used = gateList().map(d => d.name);
    const pool = GATE_NAMES.filter(n => used.indexOf(n) < 0);
    if(!pool.length) return '无名弟子' + (gateList().length + 1);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function gateRollApt(){
    const total = GATE_APTS.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total;
    for(let i = 0; i < GATE_APTS.length; i++){ r -= GATE_APTS[i].w; if(r <= 0) return i + 1; }
    return 1;
  }
  function gateRecruit(){
    if(!gateLv()){ log('先开山立派。', 'bad'); return null; }
    if(gateList().length >= gateCap()){ log('山门只容得下 ' + gateCap() + ' 名弟子，先升品阶。', 'bad'); return null; }
    const c = gateRecruitCost();
    if(S.stone < c){ log('灵石不足，收一名弟子要 ' + fmt(c) + ' 灵石。', 'bad'); return null; }
    S.stone -= c;
    const apt = gateRollApt();
    const d = { id: 'g' + Date.now().toString(36) + Math.floor(Math.random() * 1000), name: gateNewName(), apt: apt, task: '', t0: 0, ret: Date.now(), svc: 0, last: '', run: 0, bless: 0 };
    S.gate.disciples.push(d);
    log('🧾 收下弟子「' + d.name + '」· ' + GATE_APTS[apt - 1].n + (apt >= 4 ? '。这块料子，是运气。' : '。'), apt >= 4 ? 'gold' : 'sys');
    sfx.pop(); save(); render();
    return d;
  }
  function gateAssign(sid, task){
    const d = gateList().find(x => x.id === sid);
    const t = GATE_TASKS[task];
    if(!d || !t) return false;
    if(gateBusy(d)){ log(d.name + ' 还在' + GATE_TASKS[d.task].name + '，人不在山上。', ''); return false; }
    d.task = task; d.t0 = Date.now();
    markDayDec('res');   /* 阶段三收尾：今日四类决策 · 资源调配 */
    log('📜 ' + d.name + ' 领了「' + t.name + '」，' + fmtDur(t.dur) + '后回山。', 'sys');
    sfx.pop(); save(); render();
    return true;
  }
  /* 点化（第 62 节）：花灵石把资质提一档，封顶天阶。
     这件事的意义不是数值，是把"抽到一个天阶"从运气变成可以下的功夫——
     收徒仍是抽签（天阶 3%），但抽到凡骨也不再是废号，只是要多花点灵石。
     人不在山上点化不了：这不是限制，是让"留一个人守山"成为一个真的选择。 */
  function gateApt(sid){
    const d = gateList().find(x => x.id === sid);
    if(!d) return false;
    if(gateBusy(d)){ log(d.name + ' 还在' + GATE_TASKS[d.task].name + '，人不在山上，等人回来再点化。', ''); return false; }
    const apt = gateAptOf(d);
    if(apt >= GATE_APTS.length){ log(d.name + ' 已是天阶，资质到顶了。', ''); return false; }
    const c = gateAptCost();
    if(S.stone < c){ log('灵石不足，点化要 ' + fmt(c) + ' 灵石。', 'bad'); return false; }
    S.stone -= c;
    d.apt = apt + 1;
    /* 记忆（第 67 节）：被点化过这件事要被弟子记住——bless 记次数，出师告别语看它 */
    d.bless = ((typeof d.bless === 'number' && isFinite(d.bless)) ? Math.floor(d.bless) : 0) + 1;
    /* NPC 记忆（T-506 接入）：沈碑记得玩家点化过哪个弟子；缺失/异常一律静默 */
    try{ if(window.NpcMemory) NpcMemory.record('shen_bei', '你点化了弟子「' + d.name + '」', 'sect'); }catch(e){}
    log('🌀 你以指作笔，替 ' + d.name + ' 洗了一遍经脉：' + GATE_APTS[apt - 1].n + ' → ' + GATE_APTS[apt].n + '。',
      apt + 1 >= 4 ? 'gold' : 'sys');
    /* 当场开口：人就在山上，被洗完经脉总得有点反应。log 后 unshift → 他的话在系统行上方 */
    const bpool = GATE_VOICE_BLESS[d.apt - 2];
    if(bpool) log('💬 ' + d.name + '：「' + bpool[gateHash(String(d.id)) % bpool.length] + '」', '');
    sfx.pop(); save(); render();
    return true;
  }
  /* 出师（第 62 节）：满六趟差事，弟子下山，留一笔灵石与一条门风，空出一个位子。
     这是山门唯一"人会走"的地方——名册不是一排永久加成的格子，是一茬一茬的人。
     回馈不与 svc 成正比（否则留得越久回得越多，等于逼人囤人），只锚资质。 */
  function gateGraduate(sid){
    const d = gateList().find(x => x.id === sid);
    if(!d) return false;
    if(gateBusy(d)){ log(d.name + ' 还在' + GATE_TASKS[d.task].name + '，出师要等人回山。', ''); return false; }
    if(!gateGradReady(d)){ log(d.name + ' 才走了 ' + gateSvc(d) + ' 趟差事，还不到出师的时候（满 ' + BAL.gateGradSvc + ' 趟）。', ''); return false; }
    const get = gateGradGain(d), was = gateGradN();
    S.gate.disciples = gateList().filter(x => x !== d);
    S.gate.grad = was + 1;
    S.stone += get;
    /* 告别语（第 67 节）：被点化过的记得"这身资质是你给的"，没点化的只记吃用 —— 同一件事，两种记法 */
    const blessed = ((typeof d.bless === 'number' && isFinite(d.bless)) ? Math.floor(d.bless) : 0) >= 1;
    log('🎓 ' + d.name + ' 出师下山。临走把攒下的 ' + fmt(get) + ' 灵石留在山门。', 'gold');
    if(blessed){
      const fpool = GATE_VOICE_FAREWELL[0];
      log('💬 ' + d.name + '：「' + fpool[gateHash(String(d.id)) % fpool.length] + '」', '');
    }else{
      log('「师父，这些年在山上吃用的，我都记着。」', 'gold');
    }
    if(was < BAL.gateFengCap && S.gate.grad >= BAL.gateFengCap)
      log('门风已成：此后山中差事收益 +' + Math.round(gateFeng() * 100) + '%。', 'gold');
    sfx.win(); save(); render();
    return true;
  }
  /* 到时辰就结算（可离线）：每个弟子按"出发那一刻定下的差事"结一次，结完置空等指派。
     一次只落一行日志（12 个弟子各落一行会把日志刷满，也是"反馈噪声"的典型）。 */
  function gateSettle(){
    const list = gateList(); if(!list.length) return 0;
    const now = Date.now();
    const got = { n: 0, kinds: {}, exp: 0, herb: 0, herb100: 0, ore: 0, wis: 0, voices: [] };
    list.forEach(d => {
      const t = gateTaskOf(d);
      if(!t || now - gateT0(d) < t.dur * 1000) return;
      const m = gateYieldMult(), af = Math.max(1, Math.min(5, d.apt | 0)) / 3;
      if(d.task === 'seclude'){
        const g = Math.floor(expRate() * t.dur * BAL.gateSecludeK * af * m);
        S.exp += g; got.exp += g;
      }else if(d.task === 'herb'){
        const h = Math.floor((BAL.gateHerbBase + (d.apt | 0) * BAL.gateHerbApt) * m);
        S.herb = moneyInt(S.herb) + h; got.herb += h;
        if((S.rank | 0) >= BAL.gateHerb100Rank){ S.herb100 = (S.herb100 | 0) + 1; got.herb100 += 1; }
      }else{
        const o = Math.floor((BAL.gateOreBase + (d.apt | 0) * BAL.gateOreApt) * m);
        const w = Math.floor((BAL.gateWisBase + (d.apt | 0) * BAL.gateWisApt) * m);
        S.ore = moneyInt(S.ore) + o; got.ore += o;
        S.wisdom = moneyInt(S.wisdom) + w; got.wis += w;
      }
      got.n++;
      got.kinds[d.task] = (got.kinds[d.task] | 0) + 1;
      d.svc = gateSvc(d) + 1;          /* 差事趟数：出师的门槛（第 62 节） */
      /* 记事（第 65 节）：这一趟跟上一趟一样，就往上数；换了一件事，从头数 */
      d.run = (gateLast(d) === d.task) ? gateRun(d) + 1 : 1;
      d.last = d.task;
      /* 主动开口（第 66 节）：恰好到门槛（2/4/6）的那位记一笔，落句在下面统一写 */
      const hb = gateHomeBand(gateRun(d));
      if(hb >= 0 && GATE_VOICE_HOME[d.last] && GATE_VOICE_HOME[d.last][hb])
        got.voices.push({ id: d.id, name: d.name, key: d.last, hb: hb });
      d.task = ''; d.t0 = 0; d.ret = now;
    });
    if(!got.n) return 0;
    const bits = [];
    if(got.kinds.seclude) bits.push('弟子闭关 ' + got.kinds.seclude + ' 人 · 修为 +' + fmt(got.exp));
    if(got.kinds.herb)    bits.push('采药 ' + got.kinds.herb + ' 人 · 灵草 +' + fmt(got.herb) + (got.herb100 ? '、百年灵草 +' + got.herb100 : ''));
    if(got.kinds.patrol)  bits.push('巡山 ' + got.kinds.patrol + ' 人 · 矿石 +' + fmt(got.ore) + '、悟道值 +' + fmt(got.wis));
    log('⛩️ 弟子回山：' + bits.join('；') + '。', 'gold');
    /* 回山短评：到门槛的那几位说一句。单次结算全山门最多两句——弟子的话不是剧情，
       丢了不可惜；一次结算每人最多一趟，所以 voices 每弟子最多一条，截断的是"人数"。
       log 是 unshift（最新在顶）：要按名册序出现在日志顶部，得倒着写。 */
    got.voices.slice(0, 2).reverse().forEach(v => {
      const pool = GATE_VOICE_HOME[v.key][v.hb];
      log('💬 ' + v.name + '：「' + pool[gateHash(String(v.id)) % pool.length] + '」', '');
    });
    /* P1：派遣完成软结算（沿用现有差事时长与产出，不新增数值） */
    {
      const rows = [];
      if(got.kinds.seclude) rows.push(settleLine('闭关弟子 · 修为', '+' + fmt(got.exp), 'good'));
      if(got.kinds.herb) rows.push(settleLine('采药弟子 · 灵草', '+' + fmt(got.herb) + (got.herb100 ? '、百年灵草 +' + got.herb100 : ''), 'good'));
      if(got.kinds.patrol){
        rows.push(settleLine('巡山弟子 · 矿石', '+' + fmt(got.ore), 'good'));
        rows.push(settleLine('巡山弟子 · 悟道值', '+' + fmt(got.wis), 'good'));
      }
      showSettle({ icon: '⛩️', title: '弟子回山 · 派遣结算', sub: got.n + ' 人回山 · 自动回到可派遣名册',
        rows, note: '弟子已回山：闭关 4 小时、采药 2 小时、巡山 6 小时，按实际完成的差事结算。' });
    }
    save(); render();
    return got.n;
  }
  /* 面板：名册结构只在"品阶/弟子/差事"变化时重建，倒计时原地改写文本——
     500ms 一次的整体重绘会把刚点下的按钮换掉，点击反馈（hover/按下）就断了。 */
  /* ===== P2 · 宗门协力 Boss（拍板 B） =====
     成员战力总和：现行只有掌门有战力字段，弟子无独立战力；本版按「掌门 + 每名弟子各计掌门同战力」
     计人数，总血量 = 该和 × 20（倍数常量单独提出，便于下次报批调整）。
     伤害来源：镇妖塔/秘境/论剑胜利，各按当次 combatPower() 计一次。 */
  const COOP_HP_MULT = 20;
  const COOP_MATS = ['boss_core', 'boss_pearl', 'boss_feather', 'boss_heart'];
  function coopWeekKey(){
    const t = dayStamp();
    const d = new Date(t.y, t.m - 1, t.d);
    const dow = (d.getDay() + 6) % 7;           /* 周一=0 */
    d.setDate(d.getDate() - dow);
    const p = n => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function coopMembers(){ return 1 + ((S.gate && S.gate.disciples) ? S.gate.disciples.length : 0); }
  /* batch5 第 4 项迁移：下个周键起，总血量优先用服务端认可的战力（近 7 天同步）。
     服务端 sum 已含本地掌门（若本地有新鲜同步）；弟子无独立战力，仍按掌门同战力补人数。
     没连服务、没同步或缓存过期 → 回退旧口径（本地掌门/弟子同战力），不把血量算成 1。 */
  function coopServerPower(){
    try{
      if(typeof SECT === 'undefined' || !SECT.powerBoard) return null;
      const pb = SECT.powerBoard();
      const at = SECT.powerBoardAt ? SECT.powerBoardAt() : 0;
      if(!pb || !pb.ok || !(pb.fresh > 0) || !(pb.sum > 0)) return null;
      if(!at || Date.now() - at > 30 * 60000) return null;
      return { sum: Math.max(0, pb.sum | 0), me: !!(pb.me && pb.me.fresh) };
    }catch(e){ return null; }
  }
  function coopBossSum(){
    const own = Math.max(1, Math.floor(combatPower()));
    const n = coopMembers();
    const sv = coopServerPower();
    if(!sv) return own * n;
    return sv.sum + (sv.me ? 0 : own) + own * (n - 1);
  }
  function coopBossEnsure(){
    if(!S.coopBoss || typeof S.coopBoss !== 'object') S.coopBoss = { week:'', hpMax:0, dmg:0, claimed:[], parts:0 };
    const wk = coopWeekKey();
    if(S.coopBoss.week !== wk || !S.coopBoss.hpMax){
      const sum = coopBossSum();
      S.coopBoss = { week: wk, hpMax: Math.max(1, sum * COOP_HP_MULT), dmg: 0, claimed: [], parts: 0 };
    }else if(S.coopBoss.dmg === 0 && !(S.coopBoss.claimed || []).length && coopServerPower()){
      /* 周切换瞬间服务端榜单可能还没拉回：本周尚未出手时，按新口径补一次（已出手则保持冻结） */
      const next = Math.max(1, coopBossSum() * COOP_HP_MULT);
      if(next > S.coopBoss.hpMax) S.coopBoss.hpMax = next;
    }
    return S.coopBoss;
  }
  function coopBossHit(){
    const b = coopBossEnsure();
    if(b.dmg >= b.hpMax) return;
    const dmg = Math.max(1, Math.floor(combatPower()));
    b.dmg = Math.min(b.hpMax, b.dmg + dmg);
    b.parts = 1;
    /* 跨档时给一条世界通告（结构同其他通告，不进聊天） */
    [0.25, 0.5, 0.75, 1].forEach((p, i) => {
      if(!b.claimed.includes(i) && b.dmg >= Math.floor(b.hpMax * p) && b.dmg - dmg < Math.floor(b.hpMax * p)){
        announce('协力', '镇山妖王已推进到第 ' + (i + 1) + ' 档');
      }
    });
  }
  function coopBossClaim(i){
    const b = coopBossEnsure();
    const pct = [0.25, 0.5, 0.75, 1][i];
    if(pct == null || b.dmg < Math.floor(b.hpMax * pct) || b.claimed.includes(i)) return false;
    const id = COOP_MATS[i], meta = ITEMS[id] || {};
    const r = addItemEx(id, meta.n || id);
    const stone = Math.floor(needOf(S.rank) * 0.5);
    S.stone += stone; S.stats.stoneEarned += stone;
    b.claimed.push(i);
    log('🐲 协力里程碑 ' + (i + 1) + '/4：' + (meta.n || id) + ' ×1、灵石 +' + fmt(stone) +
      (r && r.mail ? '（材料暂存信匣）' : '') + '。', 'gold');
    save(); render();
    return true;
  }
  function coopBossHtml(){
    if(!gateLv()) return '';
    const b = coopBossEnsure();
    const pct = Math.min(100, b.dmg / b.hpMax * 100);
    let h = '<div class="coop"><div class="coop-head"><b>镇山妖王 · 宗门协力</b>' +
      '<span>' + (b.parts ? '本版参与：掌门 1 人' : '尚未出手') + ' · 周一 08:00 重置</span></div>' +
      '<div class="coop-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
      '<p class="coop-num">累计伤害 ' + fmt(b.dmg) + ' / ' + fmt(b.hpMax) + '（' + pct.toFixed(1) + '%）' +
      ' · 伤害来源：塔/秘境/论剑胜利</p><div class="coop-steps">';
    [0.25, 0.5, 0.75, 1].forEach((p, i) => {
      const need = Math.floor(b.hpMax * p);
      const done = b.claimed.includes(i);
      const can = !done && b.dmg >= need;
      h += '<button type="button" class="coop-step' + (done ? ' done' : '') + '" data-gact="coopclaim" data-i="' + i + '"' +
        (done || !can ? ' disabled' : '') + '>' + Math.round(p * 100) + '%' +
        '<small>' + (done ? '已领' : (can ? '领取' : fmt(need))) + '</small></button>';
    });
    h += '</div><p class="hint">总血量 = 宗门成员战力总和 × ' + COOP_HP_MULT + '（' +
      (coopServerPower() ? '取自宗门服务近 7 天同步的真实战力' : '未连宗门服务，暂按本地掌门与弟子同战力计') +
      '；弟子暂无独立战力，按掌门同战力计人数）。</p></div>';
    return h;
  }

  /* ===== P2 · 灵潮（周六 20:00–20:15；20 秒一杀，30 杀封顶） ===== */
  const LC_KILL_MS = 20000, LC_CAP = 30;
  function lingchaoWindow(now){
    now = now || new Date();
    const day = now.getDay();                    /* 6 = 周六 */
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0, 0);
    const end = new Date(start.getTime() + 15 * 60000);
    const active = day === 6 && now >= start && now < end;
    const preview = day === 6 && now >= new Date(start.getTime() - 10 * 60000) && now < start;
    /* 下一次周六 20:00：周日~周五取本周六；周六过了场次则顺延 7 天 */
    let next = new Date(start.getTime());
    const toSat = (6 - day + 7) % 7;
    if(toSat > 0) next.setDate(next.getDate() + toSat);
    else if(now >= end) next.setDate(next.getDate() + 7);
    const week = coopWeekKey();
    return { active, preview, start, end, next, week,
      leftMs: active ? (end - now) : Math.max(0, next - now) };
  }
  function lingchaoEnsure(){
    if(!S.lingchao || typeof S.lingchao !== 'object') S.lingchao = { week:'', started:0, startedAt:0, kills:0, claimed:[], pv:0 };
  }
  function lingchaoStart(now){
    lingchaoEnsure();
    const w = lingchaoWindow(now);
    if(!w.active){ log('灵潮未开（每周六 20:00–20:15）。', 'bad'); return false; }
    if(S.lingchao.week !== w.week){ S.lingchao = { week:w.week, started:0, startedAt:0, kills:0, claimed:[], pv:1 }; }
    if(S.lingchao.started){ log('已在灵潮中，守到 30 杀封顶。', ''); return true; }
    S.lingchao.started = 1; S.lingchao.startedAt = (now ? now.getTime() : Date.now()); S.lingchao.kills = 0;
    log('🌊 灵潮已起：每 20 秒一杀，30 杀封顶；中途离开不惩罚。', 'gold');
    save(); render();
    return true;
  }
  function lingchaoTick(nowIn){
    lingchaoEnsure();
    const now = nowIn || new Date();
    const w = lingchaoWindow(now);
    if(S.lingchao.week !== w.week && !w.active) return;
    /* 预告：开前 10 分钟走世界通告条（每周一次） */
    if(w.preview && S.lingchao.week !== w.week && !S.lingchao.pv){
      S.lingchao.week = w.week; S.lingchao.pv = 1;
      announce('灵潮预告', '周六 20:00 灵潮将起，15 分钟，30 杀封顶');
      save();
    }
    if(!S.lingchao.started || S.lingchao.week !== w.week) return;
    const end = Math.min(now.getTime(), w.end.getTime());
    const kills = Math.min(LC_CAP, Math.floor(Math.max(0, end - S.lingchao.startedAt) / LC_KILL_MS));
    if(kills <= S.lingchao.kills) return;
    S.lingchao.kills = kills;
    /* 每 5 杀一档：现有材料 1 份 + 灵石 = 一层需求 ×0.2 */
    [5,10,15,20,25,30].forEach((k, i) => {
      if(kills >= k && !S.lingchao.claimed.includes(i)){
        const r = addItemEx('mat_core', '妖丹');
        const stone = Math.floor(needOf(S.rank) * 0.2);
        S.stone += stone; S.stats.stoneEarned += stone;
        S.lingchao.claimed.push(i);
        log('🌊 灵潮 ' + k + ' 杀：妖丹 ×1、灵石 +' + fmt(stone) + (r && r.mail ? '（妖丹入信匣）' : '') + '。', 'good');
      }
    });
    save();
  }
  function lingchaoHtmlRow(){
    lingchaoEnsure();
    const w = lingchaoWindow();
    const st = S.lingchao.week === w.week ? S.lingchao : null;
    const kills = st ? st.kills : 0;
    const started = !!(st && st.started);
    let state, btn = '';
    if(w.active){
      state = started ? ('进行中 · ' + kills + '/' + LC_CAP + ' 杀' + (kills >= LC_CAP ? ' · 已封顶' : '')) : '已开启 · 可进入';
      if(!started) btn = '<button type="button" data-lingchao="start">进入</button>';
    }else if(w.preview){ state = '10 分钟内开始'; }
    else { state = '距开始 ' + fmtCd(w.leftMs); }
    return '<div class="today-row' + (kills >= LC_CAP ? ' done' : '') + '">' +
      '<div class="tr-main"><b>🌊 灵潮</b><small>周六场 · 20 秒一杀 · 30 杀封顶 · 每 5 杀一份材料</small></div>' +
      '<span class="tr-state">' + state + (kills >= LC_CAP ? ' · 封顶后无额外产出' : '') + '</span>' + (btn || '<span></span>') + '</div>';
  }
  function gateHtml(){
    const lv = gateLv(), list = gateList();
    if(!lv){
      if((S.rank | 0) < BAL.gateUnlock){
        return '<p class="hint">筑基之后，可以在后山立一处山门。收几个根骨过得去的弟子，' +
          '派去闭关、采药、巡山——他们在山里的这些日子，回来会分你一份。</p>' +
          '<div class="gate-foot"><button type="button" class="gate-btn" disabled>开山立派' +
          '<small>需 ' + RANK_NAMES[BAL.gateUnlock] + '</small></button></div>';
      }
      return '<p class="hint">你如今筑基有成，可以在后山立一处山门。往后你不在这山上的日子，' +
        '也有人替你守着炉火、替你去看山那边的动静。</p>' +
        '<div class="gate-foot"><button type="button" class="gate-btn" data-gact="build">开山立派' +
        '<small>' + fmt(gateBuildCost()) + ' 灵石</small></button></div>';
    }
    let h = coopBossHtml() + '<div class="gate-meta"><span class="gate-gain">差事收益 +' + Math.round((gateYieldMult() - 1) * 100) + '%' +
      (gateGradN() ? '<i class="gate-feng">门风 +' + Math.round(gateFeng() * 100) + '%</i>' : '') + '</span>' +
      '<span class="gate-idle">闲置 ' + gateIdleN() + ' 人' +
      (gateGradN() ? ' · 出师 ' + gateGradN() + ' 人' : '') + '</span></div><div class="dgrid">';
    list.forEach(d => {
      const t = gateTaskOf(d), apt = gateAptOf(d), ready = gateGradReady(d);
      /* 资质那一枚小签，能点化时就是个按钮（价在 title 与底下那行注里）：
         点化这件事必须挂在"这个人身上"，做成一个全局按钮就要先选人，多一步。 */
      const chip = (!t && apt < GATE_APTS.length)
        ? '<button type="button" class="dapt up" data-gact="apt" data-sid="' + d.id + '" data-apt="' + apt + '"' +
          ' title="点化 · ' + fmt(gateAptCost()) + ' 灵石">' + GATE_APTS[apt - 1].n + ' ↑</button>'
        : '<span class="dapt" data-apt="' + apt + '">' + GATE_APTS[apt - 1].n + '</span>';
      const body = t
        ? '<div class="dstate">' + t.name + ' · 剩 <i data-left="' + d.id + '">' + fmtDur(gateLeft(d) / 1000) + '</i></div>'
        : '<div class="dacts">' + Object.keys(GATE_TASKS).map(k => '<button type="button" class="dact" data-gact="' + k + '" data-sid="' + d.id + '">' +
            GATE_TASKS[k].name + '<small>' + fmtDur(GATE_TASKS[k].dur) +
            (k === 'seclude' ? ' · 修为' : '') + '</small></button>').join('') + '</div>' +
          (ready
            ? '<button type="button" class="dgrad" data-gact="grad" data-sid="' + d.id + '">出师' +
              '<small>留 ' + fmt(gateGradGain(d)) + ' 灵石</small></button>'
            : '<div class="dvoice"><span class="dv-t">' + gateVoice(d) + '</span>' +
              '<i class="dv-n">差事 ' + Math.min(gateSvc(d), BAL.gateGradSvc) + '/' + BAL.gateGradSvc + '</i></div>');
      /* 外部评审 2026-11-23 第 7 项：差事在身的弟子卡不可派 → 置灰 + 小锁（原因即倒计时）；
         可出师 → 淡金边 + 红点。 */
      h += '<div class="dcard' + (t ? ' busy anchor-locked' : (ready ? ' anchor-ready' : '')) + '" data-sid="' + d.id + '">' +
        (t ? '<i class="anchor-lock" aria-hidden="true"></i>' : '') +
        '<div class="dtop"><b>' + escHTML(d.name) + '</b>' + chip + '</div>' + body +
        '</div>';
    });
    /* 空位写成看得见的空名牒："还差几个"比"3/8"直观，也顺手把品阶的意义摆出来 */
    const empt = Math.max(0, gateCap() - list.length);
    for(let i = 0; i < Math.min(empt, 8); i++) h += '<div class="dcard empty anchor-locked"><i class="anchor-lock" aria-hidden="true"></i><span>空位</span></div>';
    h += '</div><p class="gate-note">点资质可点化（' + fmt(gateAptCost()) + ' 灵石一档）' +
      ' · 满 ' + BAL.gateGradSvc + ' 趟差事可送弟子出师，空出的位子再收新的' +
      ' · 差事到点自动回山并回到可派遣名册，离线也照算</p>' +
      '<p class="hint">闭关补的是境界的账；能不能立刻破境，另看境界壁垒——这两件事如今不是一回事。</p><div class="gate-foot">' +
      '<button type="button" class="gate-btn" data-gact="recruit"' + (list.length >= gateCap() ? ' disabled' : '') + '>收徒' +
      '<small>' + fmt(gateRecruitCost()) + ' 灵石</small></button>' +
      (lv < BAL.gateMaxLv
        ? '<button type="button" class="gate-btn ghost" data-gact="up">升品阶<small>' + fmt(gateLvCost()) + ' 灵石</small></button>'
        : '<span class="gate-max">一品山门 · 已至顶</span>') +
      '</div>';
    return h;
  }
  function renderGate(){
    const box = document.getElementById('sc-gate');
    if(!box) return;
    const lv = gateLv(), list = gateList();
    const lvEl = document.getElementById('sc-gate-lv');
    if(lvEl) lvEl.textContent = lv ? GATE_LV_NAME[lv - 1] + '山门 · ' + list.length + '/' + gateCap() : '未立山门';
    /* sig 必须带资质、趟数档、记事档与"够不够出师"：漏一项就是"点了点化 / 走完一趟，字没变"
       （第 62 节的坑；第 63 节把趟数档放了进来，第 65 节又加了 last + 连着几趟） */
    const sig = lv + '|' + S.rank + '|' + gateGradN() + '|' +
      list.map(d => d.id + ':' + (gateBusy(d) ? d.task : '-') + ':' + gateAptOf(d) + ':' +
        gateVoiceTier(d) + ':' + gateLast(d) + gateRunBand(d) + ':' + (gateGradReady(d) ? 1 : 0)).join(',');
    if(box.dataset.sig !== sig){ box.dataset.sig = sig; box.innerHTML = gateHtml(); }
    list.forEach(d => {
      if(!gateBusy(d)) return;
      const el = box.querySelector('[data-left="' + d.id + '"]');
      if(el) el.textContent = fmtDur(gateLeft(d) / 1000);
    });
    if(!box.dataset.bound){
      box.dataset.bound = '1';
      box.addEventListener('click', ev => {
        const btn = ev.target && ev.target.closest ? ev.target.closest('[data-gact]') : null;
        if(!btn || btn.disabled) return;
        const a = btn.getAttribute('data-gact');
        if(a === 'build') gateBuild();
        else if(a === 'up') gateUp();
        else if(a === 'recruit') gateRecruit();
        else if(a === 'apt') gateApt(btn.getAttribute('data-sid') || '');
        else if(a === 'grad') gateGraduate(btn.getAttribute('data-sid') || '');
        else if(a === 'coopclaim') coopBossClaim(Number(btn.getAttribute('data-i')) || 0);
        else gateAssign(btn.getAttribute('data-sid') || '', a);
      });
    }
  }
  /* ---------- 山门议事（第 103 轮）----------
     「山门 · 弟子」是一套可算的循环，但玩家在上面只做一件事：派差事。一天里没有一个
     需要拿主意的地方——议事就是那儿。每天布一条山门琐事，三选一，选完封卷到明日。
     口径：每条只做「一次性入账」或「拿现有资源换别的资源」，不进任何倍率通道、
     不碰战力公式与 needG；代价只花灵石/灵草/矿石，不动修为与寿元。 */
  const COUNCIL = [
    { id: 'locust', title: '山下蝗灾',
      text: '蝗虫过境，山下的田被啃去大半。村长领着十几户人在山门外跪了一夜，说只求一口吃的。',
      opts: [
        { k: 'relief', n: '开仓赈济', d: '散些灵石换粮，村民回赠采来的灵草。', cost: { stone: 0.35 }, gain: { rep: 12, herb: 6 } },
        { k: 'send', n: '派弟子帮工', d: '让山上最闲的那个跟着去，回来多算一趟差事。', need: 'idle', gain: { svc: 1, stone: 0.2 } },
        { k: 'shut', n: '闭门清修', d: '俗务是俗务，你的道在山上。', gain: { exp: 0.25 } }
      ] },
    { id: 'scripture', title: '邻山求药',
      text: '百里外的青崖观遣人送信：他们缺一味止血的灵草，愿以人情相抵。信末字迹很急。',
      opts: [
        { k: 'gift', n: '赠药结缘', d: '灵草送出去，换一份山野间的名声。', cost: { herb: 12 }, gain: { rep: 8, stone: 0.45 } },
        { k: 'sell', n: '作价卖出', d: '情分算不得数，灵石拿在手里才是实在。', gain: { stone: 0.55 } },
        { k: 'pass', n: '婉言回绝', d: '不结仇，也不结缘。', gain: { exp: 0.15 } }
      ] },
    { id: 'stairs', title: '石阶坍塌',
      text: '后山石阶被夜雨冲塌了一段，弟子上下山要绕半里。修与不修，都要拿主意。',
      opts: [
        { k: 'hire', n: '雇工修缮', d: '请山下石匠来，工钱不便宜，但山门看着像个山门。', cost: { stone: 0.3 }, gain: { rep: 14 } },
        { k: 'self', n: '亲率弟子修', d: '自己带人搬石头，省些工钱，多费一份弟子力气。', cost: { stone: 0.1 }, need: 'idle', gain: { svc: 1, rep: 8 } },
        { k: 'later', n: '暂且搁置', d: '绕半里路而已，先放着。', gain: { exp: 0.12 } }
      ] },
    { id: 'leave', title: '弟子请行',
      text: '一名弟子在你门前站了半晌，说想下山历练。山门立起来了，弟子迟早要走。',
      opts: [
        { k: 'allow', n: '准其下山', d: '放他走一趟，带回来的见闻也算山门的。', need: 'idle', gain: { svc: 1, rep: 6, stone: 0.2 } },
        { k: 'keep', n: '留山守门', d: '山上总得有人守着。', gain: { stone: 0.3 } },
        { k: 'teach', n: '亲授一剑', d: '路是他自己的，剑可以是你教的。', gain: { exp: 0.3 } }
      ] },
    { id: 'caravan', title: '商队借宿',
      text: '一支商队赶夜路错过了驿站，领头的递上一袋灵石，问能否借山门檐下歇一宿。',
      opts: [
        { k: 'host', n: '引客入山', d: '一宿而已，山门不缺这盏灯。', gain: { stone: 0.25, rep: 6 } },
        { k: 'barter', n: '以石换矿', d: '宿钱免了，换他们车上那批矿石。', cost: { stone: 0.2 }, gain: { ore: 18 } },
        { k: 'wave', n: '不惊动', d: '山门夜静，别生事。', gain: { exp: 0.1 } }
      ] }
  ];
  const councilIssue = () => COUNCIL[Math.max(0, S.council.n | 0) % COUNCIL.length];
  const councilDone  = () => dayNo(S.council.day) >= todayNo();   /* 当天已议（回拨也算已议） */
  const councilIdle  = () => gateList().find(d => !gateBusy(d)) || null;
  /* 代价与所得都按 needOf(rank) 现算，面板上写的就是真正会入账的数 */
  function councilCostOf(o){
    const need = needOf(S.rank);
    if(!o || !o.cost) return 0;
    if(o.cost.stone) return Math.max(1, Math.round(need * o.cost.stone));
    return o.cost.herb || o.cost.ore || 0;
  }
  function councilFxText(o){
    const need = needOf(S.rank), g = o.gain || {}, parts = [];
    if(o.cost && o.cost.stone) parts.push('灵石 −' + fmt(councilCostOf(o)));
    if(o.cost && o.cost.herb) parts.push('灵草 −' + o.cost.herb);
    if(o.cost && o.cost.ore) parts.push('矿石 −' + o.cost.ore);
    if(g.stone) parts.push('灵石 +' + fmt(Math.max(1, Math.round(need * g.stone))));
    if(g.exp) parts.push('修为 +' + fmt(Math.round(need * g.exp)));
    if(g.herb) parts.push('灵草 +' + g.herb);
    if(g.ore) parts.push('矿石 +' + g.ore);
    if(g.rep) parts.push('声望 +' + g.rep);
    if(g.svc) parts.push('弟子差事 +1 趟');
    return parts.join(' · ');
  }
  function councilBlocked(o){
    if(o.need === 'idle' && !councilIdle()) return '无弟子在山上';
    if(o.cost && o.cost.stone && S.stone < councilCostOf(o)) return '灵石不足';
    if(o.cost && o.cost.herb && S.herb < o.cost.herb) return '灵草不足';
    if(o.cost && o.cost.ore && S.ore < o.cost.ore) return '矿石不足';
    return '';
  }
  function councilApply(o){
    const need = needOf(S.rank), g = o.gain || {}, out = [];
    if(o.cost && o.cost.stone){ S.stone -= councilCostOf(o); out.push('灵石 −' + fmt(councilCostOf(o))); }
    if(o.cost && o.cost.herb){ S.herb -= o.cost.herb; out.push('灵草 −' + o.cost.herb); }
    if(o.cost && o.cost.ore){ S.ore -= o.cost.ore; out.push('矿石 −' + o.cost.ore); }
    if(g.stone){ const v = Math.max(1, Math.round(need * g.stone)); S.stone += v; S.stats.stoneEarned += v; out.push('灵石 +' + fmt(v)); }
    if(g.exp){ const v = Math.round(need * g.exp); const got = addActiveExp(v); out.push('修为 +' + fmt(got)); }
    if(g.herb){ S.herb += g.herb; out.push('灵草 +' + g.herb); }
    if(g.ore){ S.ore += g.ore; out.push('矿石 +' + g.ore); }
    if(g.rep){ S.arena.rep = (S.arena.rep | 0) + g.rep; out.push('声望 +' + g.rep); }
    if(g.svc){
      const d = councilIdle();
      if(d){ d.svc = gateSvc(d) + g.svc; out.push('「' + d.name + '」差事 +' + g.svc + ' 趟'); }
    }
    return out;
  }
  function councilPick(k){
    if(gateLv() <= 0){ log('先开山立派，才有议事。', 'bad'); return false; }
    if(councilDone()){ log('今日已议，明日再说。', ''); return false; }
    const issue = councilIssue(), o = (issue.opts || []).find(x => x.k === k);
    if(!o) return false;
    if(councilBlocked(o)){ log('议不成：' + councilBlocked(o) + '。', 'bad'); return false; }
    const got = councilApply(o);
    S.council.day = todayKey();
    S.council.n = (S.council.n | 0) + 1;
    S.council.last = issue.title + ' · ' + o.n + '：' + got.join('、');
    markDayDec('social');   /* 阶段三收尾：今日四类决策 · 事件社交 */
    log('⛩️ 山门议事「' + issue.title + '」——你定了：' + o.n + '。' + (got.length ? '（' + got.join('、') + '）' : ''), 'gold');
    sfx.pop(); save(); render();
    return true;
  }
  function councilHtml(){
    if(gateLv() <= 0) return '<p class="co-hint">山门还没立起来，也就没有需要拿主意的事。</p>';
    const issue = councilIssue();
    if(councilDone()){
      /* 封卷后 n 已经 +1，councilIssue() 指的是「明天那条」——所以这里不能再拿议题名当标题，
         否则刚议完的纸上写着明天的题目。结论原文存在 last 里，按「：」拆成标题行与数目行。 */
      const txt = S.council.last || '';
      const cut = txt.indexOf('：');
      const head = cut > 0 ? txt.slice(0, cut) : (txt || issue.title + ' · 已议');
      const rest = cut > 0 ? txt.slice(cut + 1) : '';
      return '<div class="co-done"><b>' + escHTML(head) + '</b>' +
        (rest ? '<small>' + escHTML(rest) + '</small>' : '') + '</div>' +
        '<p class="co-hint">明日此时，另有琐事上门。</p>';
    }
    let h = '<div class="co-head"><b>' + issue.title + '</b></div>' +
      '<p class="co-text">' + issue.text + '</p><div class="co-opts">';
    issue.opts.forEach(o => {
      const blocked = councilBlocked(o);
      h += '<button type="button" class="co-opt" data-cok="' + o.k + '"' + (blocked ? ' disabled' : '') + '>' +
        '<span class="co-n">' + o.n + '</span>' +
        '<small>' + o.d + '</small>' +
        '<em class="co-eff">' + (blocked ? blocked : councilFxText(o)) + '</em>' +
        '</button>';
    });
    return h + '</div><p class="co-hint">一天只议一条；选完封卷，明日另有琐事。</p>';
  }
  function renderCouncil(){
    const box = document.getElementById('xx-council');
    if(!box) return;
    const sig = [gateLv(), S.council.day, S.council.n, councilIdle() ? councilIdle().id : '',
      Math.floor(S.stone), Math.floor(S.herb), Math.floor(S.ore), (S.arena.rep | 0)].join('|');
    if(box.dataset.sig !== sig){
      box.dataset.sig = sig;
      box.innerHTML = councilHtml();
    }
    if(!box.dataset.bound){
      box.dataset.bound = '1';
      box.addEventListener('click', ev => {
        const btn = ev.target && ev.target.closest ? ev.target.closest('[data-cok]') : null;
        if(!btn || btn.disabled) return;
        councilPick(btn.getAttribute('data-cok'));
      });
    }
    const tag = document.getElementById('sc-co-day');
    if(tag){
      const t = gateLv() <= 0 ? '未立山门' : councilDone() ? '今日已议' : '今日待议';
      if(tag.textContent !== t) tag.textContent = t;
      tag.classList.toggle('muted', gateLv() <= 0 || councilDone());
    }
    renderFourStates();
  }
  /* 阶段三 S8：四类决策的「今日状态」。
     阶段三收尾（制作人批准）：S.day.dec 四个 0/1 = 今日是否真的发生过；前置「今日已/未」，
     括号里保留原有的在途 / 闲置 / 参悟剩余等真实细节（不丢信息，也不虚构当日事实）。 */
  function renderFourStates(){
    const el = document.getElementById('xx-four-states');
    if(!el) return;
    ensureDay();
    ensureActs();
    const dec = dayDec();
    const idle = gateIdleN(), busy = gateList().filter(gateBusy).length;
    const resDet = gateLv() <= 0 ? '未立山门' : (idle + ' 人闲着 · ' + busy + ' 人在外');
    const res = gateLv() <= 0 ? resDet
      : (dec.res ? '今日已派' : '今日未派') + '（' + resDet + '）';
    const riskDet = trunOn() ? '塔里那一局还在走'
      : (S.trunLast ? '上一局 · ' + (S.trunLast.why === 'done' ? '五步走完' : S.trunLast.why === 'quit' ? '主动出塔' : '中道折戟') : '塔里没局');
    const risk = (dec.risk ? '今日已开打' : '今日未开打') + '（' + riskDet + '）';
    const left = Math.max(0, (BAL.actLimit.ponder | 0) - (S.acts.ponder | 0));
    const growDet = left > 0 ? ('参悟剩 ' + left + ' 次') : '参悟今日已尽';
    const grow = (dec.grow ? '今日已投入' : '今日未投入') + '（' + growDet + '）';
    const social = gateLv() <= 0 ? '未立山门'
      : (dec.social ? '今日已社交' : '今日未社交') + '（今日' + (councilDone() ? '已议' : '待议') + '）';
    const t = '今日四事 · 资源调配：' + res + ' · 风险推进：' + risk +
      ' · 成长投资：' + grow + ' · 事件社交：' + social;
    if(el.textContent !== t) el.textContent = t;
  }
  /* 洞天开辟（第 70 节）：结构只在等级/主洞/境界变化时重建；500ms 的 render 只改文本。
     按钮委托在容器上——内部重绘不换按钮（第 44/61 节的坑）。 */
  function dtShellHtml(){
    let html = '<div class="dt-head"><span>已开 <b>' + DONGTIAN.filter(c => dtLv(c.id) > 0).length +
      '</b> / ' + DONGTIAN.length + '</span><span class="dt-main-line" data-dt-main-line></span></div>' +
      '<p class="dt-sum" data-dt-sum></p><div class="dt-list">';
    DONGTIAN.forEach(c => {
      html += '<div class="dt-card" data-card="' + c.id + '">' +
        '<div class="dt-top"><b>' + c.name + '</b><span class="dt-dir">' + c.dir + ' · ' + c.theme + '</span>' +
        '<span class="dt-lv" data-f="lv"></span></div>' +
        '<div class="dt-eff" data-f="eff"></div>' +
        '<div class="dt-next" data-f="next"></div>' +
        '<div class="dt-cost" data-f="cost"></div>' +
        '<div class="dt-foot">' +
          '<button type="button" class="dt-btn" data-dt-act="open" data-id="' + c.id + '"></button>' +
          '<button type="button" class="dt-btn ghost" data-dt-act="main" data-id="' + c.id + '" data-f="mainbtn">奉为主洞</button>' +
        '</div></div>';
    });
    return html + '</div>';
  }
  function renderDongtian(){
    const box = document.getElementById('xx-dongtian');
    if(!box) return;
    const mainId = dtMainId();
    const sig = (S.rank | 0) + '|' + DONGTIAN.map(c => dtLv(c.id)).join(',') + '|' + mainId;
    if(box.dataset.sig !== sig){ box.dataset.sig = sig; box.innerHTML = dtShellHtml(); }
    if(!box.dataset.bound){
      box.dataset.bound = '1';
      box.addEventListener('click', ev => {
        const btn = ev.target && ev.target.closest ? ev.target.closest('[data-dt-act]') : null;
        if(!btn || btn.disabled) return;
        const id = btn.getAttribute('data-id') || '';
        if(btn.getAttribute('data-dt-act') === 'open') dtOpen(id); else dtMainSet(id);
      });
    }
    const mainEl = box.querySelector('[data-dt-main-line]');
    if(mainEl){
      const mc = dtCave(mainId);
      mainEl.textContent = mc ? '主洞：' + mc.name + '（×1.5）' : '主洞：未定';
    }
    const totals = dtTotals();
    const sumEl = box.querySelector('[data-dt-sum]');
    if(sumEl) sumEl.textContent = dtSumText(totals);
    DONGTIAN.forEach(c => {
      const card = box.querySelector('[data-card="' + c.id + '"]');
      if(!card) return;
      const lv = dtLv(c.id), mult = dtMult(c.id);
      const set = (f, t) => { const el = card.querySelector('[data-f="' + f + '"]'); if(el) el.textContent = t; };
      set('lv', lv ? DT_LV_NAME[lv - 1] + ' · ' + lv + '/3' : '未开辟');
      set('eff', lv ? dtEffText(c, lv, mult) : '—');
      card.classList.toggle('main', c.id === mainId);
      card.classList.toggle('unopened', lv === 0);
      const btn = card.querySelector('[data-dt-act="open"]');
      const mb = card.querySelector('[data-f="mainbtn"]');
      if(lv >= DT_MAX){
        set('next', '三重圆满');
        set('cost', '');
        btn.textContent = '已圆满';
        btn.disabled = true;
      }else{
        const needRank = c.unlock[lv];
        const rankOk = (S.rank | 0) >= needRank;
        const cost = dtCost(c.id), mats = dtMats(c.id);
        set('next', rankOk
          ? '下一重 · ' + DT_LV_NAME[lv] + '：' + dtEffText(c, lv + 1, mult)
          : '下一重 · ' + DT_LV_NAME[lv] + '（' + RANK_NAMES[needRank] + ' 解锁）');
        set('cost', rankOk ? matLedger([{ t: 'stone', n: cost }].concat(mats)) : '');
        btn.textContent = '开辟 · ' + DT_LV_NAME[lv];
        btn.disabled = !rankOk || S.stone < cost || mats.some(m => !matHas(m.t, m.n));
      }
      if(mb){
        mb.style.display = lv ? '' : 'none';
        const isMain = c.id === mainId;
        mb.textContent = isMain ? '已是主洞' : '奉为主洞';
        mb.disabled = isMain;
      }
    });
    /* totals 只用于给读屏/测试留一个不重建的落点：数值本身在各卡里已经写清 */
    box.dataset.totals = JSON.stringify(totals);
  }
  /* 丹药突破 buff：吃丹药后限时提升突破成功率 */
  const pillBonus = () => (Date.now() < S.pillUntil) ? S.pillBonus : 0;
  /* 突破成功率（不服用破境丹时的最终判定概率）—— 统一走 BREAK_TIERS 段表 + 软膝，保证 UI 显示 = 实际判定 */
  const breakChance = () => breakChanceFinal(null, false);

  function fmt(n){
    n = Math.floor(n || 0);
    if(n < 10000) return String(n);
    if(n < 1e8) return (n / 1e4).toFixed(n < 1e6 ? 2 : 1) + '万';
    return (n / 1e8).toFixed(2) + '亿';
  }
  function fmt1(n){ return n < 10000 ? (Math.round(n * 10) / 10).toFixed(1) : fmt(n); }
  /* 修为展示统一向下取整；缺口按两个显示整数相减，避免「还差 0」却还不能突破。 */
  function expInt(n){ return Math.floor(Math.max(0, Number(n) || 0)); }
  function expGapInt(exp, need){ return Math.max(0, expInt(need) - expInt(exp)); }
  function pct1(v){ return (Math.round((Number(v) || 0) * 1000) / 10).toFixed(1); }
  /* 钱数取整一律走这里，不许用 | 0：位运算把值折进 int32，越过 2^31 就翻成负数。
     层 23 起一层灵石收入已经 30 亿量级（见 _curve.js），| 0 是必然踩到的。 */
  function moneyInt(n){ return Math.floor(n || 0); }
  /* 任何名字进 innerHTML 前都要过这里（角色名/弟子名…）：
     现在拼进去的都是本地起的名字，但拼接位点一旦被远程数据（宗门榜、信件）复用就是 XSS。 */
  function escHTML(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }
  function pickRoot(){
    const total = ROOTS.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total;
    for(let i = 0; i < ROOTS.length; i++){ r -= ROOTS[i].w; if(r <= 0) return i; }
    return 1;
  }

  /* 日志 */
  function log(text, cls){
    S.log.unshift({ t: text, c: cls || '' });
    if(S.log.length > 40) S.log.length = 40;
    renderLog();
  }
  function renderLog(){
    const box = document.getElementById('xx-log');
    if(!box) return;
    box.innerHTML = '';
    S.log.forEach(item => {
      const p = document.createElement('p');
      if(item.c) p.className = item.c;
      p.textContent = item.t;
      box.appendChild(p);
    });
  }

  /* ---------- 入口红点 · 可领取提示（2026-10-24）----------
     开局 initEntryDots() 给各场景入口插一枚 .e-dot（只插一次）；render() 末尾
     节流调 renderDots()，按各子系统「有东西可领 / 有次数可用」判据切换 .on。
     选择器同时覆盖城镇入口与侧栏同源按钮（如 [data-bld="event"] 命中宝藏阁+七日签到）。 */
  const DOT_RULES = [
    ['[data-bld="event"]',                        () => signCanClaim() || dailyClaimable()],           /* 宝藏阁 + 侧栏七日签到 */
    ['[data-bld="xiu"][data-scroll="xx-quest"]',  () => questList().some(x => questDone(x.q))],        /* 福缘：有任务达成可领 */
    ['[data-bld="arena"]',                        () => (S.arena.left | 0) > 0],                       /* 论剑台：今日还有次数 */
    ['[data-bld="market"]:not([data-scroll])',    () => (S.market.freeRefresh | 0) > 0],               /* 坊市：今日免费刷新还在 */
    ['[data-bld="secret"]',                       () => secretTotal() > 0 && !S.secret.swept],         /* 上古秘境：有进度且未扫荡 */
    ['[data-bld="zong"]',                         () => (S.union.left | 0) > 0 || gateFresh()],      /* 宗门：仙盟今日可出战 / 弟子刚回山待派 */
    ['[data-bld="chong"]',                        () => S.eggs.length > 0],                            /* 灵兽园：有蛋待孵 */
    /* W3·S2：世界线（W1 塔底）在塔里此刻真有事可做才亮——两个判据都是现成闸门，
       俯身（未挖）与开门三选一（已挖待选）互为前后段，选完进终态自然一起灭，
       不需要任何新存档字段，也绝不出现「亮了却做不了」的错指。 */
    ['[data-bld="tower"]',                        () => worldFootCanDig() || worldFootCanChoose()]
  ];
  const dailyClaimable = () => (typeof Daily !== 'undefined' && Daily.list)
    ? Daily.list().some(t => t.done && !t.claimed) : false;
  function initEntryDots(){
    /* 插红点是"锦上添花"，任何一步出错都不能拖垮 boot（boot 中断会让后续模块整片没初始化） */
    try{
      const sels = Array.from(new Set(DOT_RULES.map(r => r[0])));
      sels.forEach(sel => {
        if(typeof sel !== 'string' || !sel) return;
        document.querySelectorAll(sel).forEach(el => {
          if(el.querySelector('.e-dot')) return;
          const d = document.createElement('i');
          d.className = 'e-dot';
          /* 城镇建筑把红点挂到立绘本体；侧栏等普通入口仍挂按钮自身。 */
          const shape = el.classList && el.classList.contains('bld') && el.classList.contains('art')
            ? el.querySelector('.art-shape') : null;
          (shape || el).appendChild(d);
        });
      });
    }catch(e){}
    /* 人物（道碑）单独插一枚：不走 DOT_RULES——那张表由 renderDots 统一驱动，
       而道碑红点的开关频率与"看没看过"有关，独立控制更直白 */
    try{
      const r = document.querySelector('[data-tab="role"]');
      if(r && !r.querySelector('.e-dot')){
        const d = document.createElement('i');
        d.className = 'e-dot';
        r.appendChild(d);
      }
    }catch(e){}
  }
  /* 道碑红点：有新立未看的碑才亮（进人物面板即灭，见 milesMarkSeen） */
  function renderMileDot(){
    try{
      const r = document.querySelector('[data-tab="role"]');
      const d = r ? r.querySelector('.e-dot') : null;
      if(d) d.classList.toggle('on', (S.milesNew || []).length > 0);
    }catch(e){}
  }
  let lastDotsAt = 0;
  function renderDots(force){
    const now = Date.now();
    if(!force && now - lastDotsAt < 1000) return;   /* 1s 节流：render() 每 500ms 跑，没必要每次都查 */
    lastDotsAt = now;
    DOT_RULES.forEach(rule => {
      const sel = rule[0], pred = rule[1];
      let on = false;
      try{ on = !!pred(); }catch(e){}
      document.querySelectorAll(sel).forEach(el => {
        const d = el.querySelector('.e-dot');
        if(d) d.classList.toggle('on', on);
      });
    });
  }

  /* 存档 */
  /* 导入成功后先冻结写入：内存里还是旧进度，继续自动保存会盖掉刚导入的档。
     页面重载后自然解冻（新档读进来，frozenForImport 从 false 起）。 */
  let frozenForImport = false;

  /* ---------- M-2：存档写入失败统一反馈 ----------
     save() 返回布尔；全文本匹配约 106 处、真实调用点 104 处，仅 2 处显式检查。
     tickLoop 每 3 秒自动保存，保存失败原先玩家全程无提示。
     做法：save() 内部统一兜底，不改任何调用点、不改业务返回值与推进顺序。
     !inited / frozenForImport 属「未到写入时机」，不告警；同一故障周期只提示一次，
     恢复后再失败才重新提示（避免 3 秒一次刷屏）。不新增定时器、不新增 window 全局。
     边界：本层只让失败「可见 + 可查」，不阻止关键业务继续推进，也不代表备份状态。 */
  let saveFailActive = false, saveFailCount = 0, saveFailFirstAt = 0;
  /* 存档时间戳校验（`last`）。
     `S.last = o.last || Date.now()` 不够：o.last 若是非数字字符串 / NaN / Infinity，
     后续 `(Date.now() - S.last)/1000` 会得到 NaN，而 offline() 里 `dt < 0` 与 `dt > cap`
     对 NaN 都是 false → NaN 一路流进离线收益计算，修为/灵石全变 NaN。
     规则：必须是有限数字、落在合理区间（不早于 2000 年、不晚于现在 + 1 天），否则回落为当前时刻。 */
  const TS_MIN = 946684800000;          /* 2000-01-01，早于此视为脏值 */
  function safeTs(v, fallback){
    const now = Date.now();
    if(typeof v !== 'number' || !isFinite(v)) return fallback;
    if(v < TS_MIN || v > now + 86400000) return fallback;   /* 过早 / 跑到未来一天以上 */
    return v;
  }
  /* 存档损坏保护闸门：load() 读到过原始数据但迁移失败时置真。
     作用：禁止一切保存，避免 boot 弹创角后 confirmChar() 的 save()
     把玩家唯一那份（只是读不出来的）存档覆盖成新档。
     解除路径只有两条：玩家在设置页成功「取回备份」，或玩家主动重开。 */
  let saveBlocked = false;
  /* 读档失败时的原文内存暂存（备份键也写不进去时的最后一条恢复路径）。
     只在本次页面会话有效——刷新即丢，所以 UI 上必须明确提示"尽快导出"。 */
  let corruptRawCache = '';
  function reportSaveFailure(){
    saveFailCount++;
    if(saveFailActive) return;
    saveFailActive = true;
    saveFailFirstAt = Date.now();
    try{ log('⚠️ 存档保存失败：当前进度尚未保存，关闭页面可能丢失。请到「设置 → 存档备份」导出一份存档。', 'bad'); }catch(e){}
    try{ if(typeof window.showToast === 'function') window.showToast('⚠️ 存档写入失败，请导出存档备份'); }catch(e){}
    try{ console.warn('[save] localStorage.setItem failed'); }catch(e){}
  }
  function reportSaveRecovered(){
    if(!saveFailActive) return;
    saveFailActive = false;
    try{ log('✅ 存档写入已恢复，进度可以继续正常保存。', 'good'); }catch(e){}
  }
  /* 导入冻结期的保护：一次性 toast 不够（玩家漏看一次就再无提示，然后玩几小时全丢）。
     这里做两件事：
     1. 主界面顶部挂一条**常驻**横幅，直到页面重载才消失（不依赖玩家点掉）；
     2. 在 pagehide/beforeunload 时再提醒一次（浏览器不保证能弹，但尽力）。
     横幅用动态创建，不新增 index.html 模板节点，也不动存档结构。 */
  let frozenWarned = false;
  function frozenBannerShow(){
    if(typeof document === 'undefined') return;
    if(document.getElementById('frozen-banner')) return;
    const bar = document.createElement('div');
    bar.id = 'frozen-banner';
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;padding:8px 12px;' +
      'background:#8a3b2e;color:#fdf6e3;font-size:13px;line-height:1.5;text-align:center;' +
      'box-shadow:0 2px 6px rgba(0,0,0,.25)';
    bar.textContent = '⚠️ 已导入新存档，但页面尚未重新载入：现在的进度不会保存。请刷新页面（Ctrl+R）后再继续玩。';
    try{ document.body.appendChild(bar); }catch(e){}
  }
  function reportFrozenNoSave(){
    frozenBannerShow();
    if(frozenWarned) return;
    frozenWarned = true;
    try{ log('⚠️ 已导入新存档，但页面尚未重新载入：现在的进度不会被保存。请尽快刷新页面（Ctrl+R）。', 'bad'); }catch(e){}
    try{ if(typeof window.showToast === 'function') window.showToast('⚠️ 导入后需刷新才生效，当前进度不会保存'); }catch(e){}
  }
  /* P1-C → 阶段二 N11（制作人已批）：单机道途 ID 与伤害乘子，按九段（BREAK_TIERS 下标）给矩阵。
     ID 对齐联机枚举；每段四道途极差 ≤8pp，单场伤害差 ≤8%。
     设计目标：每条道途都有明确强势段（剑炼气/体元婴/丹炼虚/阵合体），不存在「全程最优解」。
     唯一数据源 = PATH_BONUS（按段数组），创角/改道/战斗展示/伤害计算全部从本表派生，禁止另存副本。
     PATH_BONUS 独立于 server AXIS_GRANTS（不同系统不混用，GPT 审查①）。
     冻结于模块作用域：load()/multiLoadPath()/openBattleAnim() 均可见且不可变（GPT 审查⑥）。 */
  const PATH_IDS = Object.freeze(['sword','body','dan','array']);
  const PATH_BONUS = Object.freeze({
    /*                 炼气   筑基   金丹   元婴   化神   炼虚   合体   大乘   渡劫 */
    sword: Object.freeze([1.08, 1.06, 1.04, 1.02, 1.00, 1.00, 1.02, 1.04, 1.06]),
    body:  Object.freeze([1.02, 1.04, 1.06, 1.08, 1.06, 1.04, 1.02, 1.00, 1.02]),
    dan:   Object.freeze([1.00, 1.02, 1.02, 1.04, 1.06, 1.08, 1.06, 1.04, 1.02]),
    array: Object.freeze([1.04, 1.04, 1.02, 1.00, 1.04, 1.04, 1.08, 1.06, 1.02])
  });
  /* 当前境界段下标：0=炼气 … 8=渡劫；越界/脏值由调用方夹取 */
  const pathSegIndex = () => {
    const i = BREAK_TIERS.indexOf(breakTierOf(S.rank));
    return i < 0 ? BREAK_TIERS.length - 1 : i;
  };
  function pathBonusFor(pathId, seg){
    if (PATH_IDS.indexOf(pathId) < 0) return 1;             // 未选/脏值 → 1（无加成）
    const arr = PATH_BONUS[pathId];
    if (!arr) return 1;
    const i = (seg == null) ? pathSegIndex() : Math.max(0, Math.min(arr.length - 1, seg | 0));
    const v = arr[i];
    return (typeof v === 'number' && isFinite(v) && v > 0) ? v : 1;
  }
  /* 议程4 P1-2 道途加成可见化 → 阶段二 N11 九段矩阵：
     呈现层一律从 PATH_BONUS 取当前段值，禁止在呈现代码里重打系数（Muse 门禁①）。 */
  const PATH_NAMES = Object.freeze({ sword: '剑修', body: '体修', dan: '丹修', array: '阵修' });
  function pathBonusPct(pathId, seg){       // 纯呈现：如 '+8%' / '基准'，源=PATH_BONUS 当前段
    const pct = Math.round((pathBonusFor(pathId, seg) - 1) * 100);
    return pct === 0 ? '基准' : '+' + pct + '%';
  }
  function pathBonusLabel(pathId, seg){     // 可读清单：如 '剑修 ×1.08（+8% 伤害）'
    const v = pathBonusFor(pathId, seg);
    const pct = Math.round((v - 1) * 100);
    return (PATH_NAMES[pathId] || String(pathId)) + ' ×' + v.toFixed(2) + (pct === 0 ? '（基准）' : '（+' + pct + '% 伤害）');
  }
  function pathBonusTable(seg){             // 当前段（或指定段）四道途派生表，不另建副本
    const i = (seg == null) ? pathSegIndex() : Math.max(0, Math.min(BREAK_TIERS.length - 1, seg | 0));
    return PATH_IDS.map(id => ({ id, name: PATH_NAMES[id], seg: i, segName: BREAK_TIERS[i].name, mult: PATH_BONUS[id][i] }));
  }
  /* 创角/改道卡用的九段文案：'本段炼气期 +8% · 九段 +8/+6/+4/+2/0/0/+2/+4/+6' */
  function pathBonusSegText(pathId){
    const arr = PATH_BONUS[pathId] || [];
    const cur = pathSegIndex();
    const all = arr.map(v => {
      const p = Math.round((v - 1) * 100);
      return p === 0 ? '0' : (p > 0 ? '+' + p : String(p));
    }).join('/');
    return '本段' + BREAK_TIERS[cur].name + ' ' + pathBonusPct(pathId) + ' · 九段 ' + all;
  }
  /* 漂移断言（Q3 漂移断言法，Muse 门禁①）：呈现层读取的道途加成必须与 PATH_BONUS 源值逐段一致；
     并拦截「缺失映射 / 非法值 / PATH_IDS 之外的 stealth 键 / 名称映射缺失 / 段长不符 / 极差超 8pp」。
     说明：pathBonusTable() 由 PATH_BONUS 派生，本条本质是「派生表与权威源的一致性检查」，
     并非以第二份倍率数据为基准的独立 deepEqual（不另建倍率副本即为此意）。 */
  function assertPathBonusNoDrift(){
    // 1) 每个 PATH_IDS 必须有长度 = BREAK_TIERS.length 的合法数值数组（缺失 / 非法值 / 段长不符拦截）
    for (const id of PATH_IDS){
      const arr = PATH_BONUS[id];
      if (!Array.isArray(arr))
        throw new Error('PATH_BONUS 非法结构 @' + id + ' = ' + arr);
      if (arr.length !== BREAK_TIERS.length)
        throw new Error('PATH_BONUS 段长漂移 @' + id + '：期望 ' + BREAK_TIERS.length + ' 实际 ' + arr.length);
      for (let i = 0; i < arr.length; i++){
        const v = arr[i];
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0)
          throw new Error('PATH_BONUS 非法值 @' + id + '[' + i + '] = ' + v);
      }
    }
    // 2) PATH_BONUS 不得含 PATH_IDS 之外的 stealth 键（禁止另建 / 暗加倍率）
    const bonusKeys = Object.keys(PATH_BONUS);
    if (bonusKeys.length !== PATH_IDS.length)
      throw new Error('PATH_BONUS 键数漂移: 期望 ' + PATH_IDS.length + ' 实际 ' + bonusKeys.length);
    for (const k of bonusKeys){
      if (PATH_IDS.indexOf(k) < 0)
        throw new Error('PATH_BONUS 含未授权键 @' + k);
    }
    // 3) 名称映射完整性：每个 PATH_IDS 必须在 PATH_NAMES 中有非空名称（缺失映射拦截）
    for (const id of PATH_IDS){
      const n = PATH_NAMES[id];
      if (typeof n !== 'string' || n.length === 0)
        throw new Error('PATH_NAMES 名称映射缺失 @' + id);
    }
    // 4) 呈现表与权威源逐段一致（派生表 vs PATH_BONUS）
    for (let seg = 0; seg < BREAK_TIERS.length; seg++){
      for (const r of pathBonusTable(seg)){
        if (PATH_BONUS[r.id][seg] !== r.mult)
          throw new Error('PATH_BONUS 漂移 @' + r.id + '[' + seg + ']：源=' + PATH_BONUS[r.id][seg] + ' 呈现=' + r.mult);
      }
      // 5) 每段四道途极差 ≤8pp（验收线）
      const vals = PATH_IDS.map(id => PATH_BONUS[id][seg]);
      const spread = Math.max.apply(null, vals) - Math.min.apply(null, vals);
      if (spread > 0.08 + 1e-12)
        throw new Error('PATH_BONUS 极差超 8pp @段' + seg + ' = ' + Math.round(spread * 100) + 'pp');
    }
    // 6) 每条道途至少有一个「本段最强」段（不存在全程陪跑）
    for (const id of PATH_IDS){
      const own = Math.max.apply(null, PATH_BONUS[id]);
      const hasTop = PATH_BONUS[id].some((v, seg) =>
        Math.abs(v - Math.max.apply(null, PATH_IDS.map(k => PATH_BONUS[k][seg]))) < 1e-12);
      if (!hasTop)
        throw new Error('PATH_BONUS 道途无强势段 @' + id + '（自身峰值 ' + own + '）');
    }
    return true;
  }

  /* === AGENDA1_HELPERS_START === */
  /* 议程1 P0-1 顶栏修为语义（纯呈现，不改数值/存档）：突破按钮与修为条口径统一 */
  function breakButtonLabel(s){
    const rank = s.rank, exp = Number(s.exp) || 0, need = Number(s.need) || 0, top = s.top;
    const nextRankName = s.nextRankName || '', chancePct = Number(s.chancePct) || 0;
    const left = Math.max(0, need - exp), leftShown = expGapInt(exp, need);
    if (rank >= top) return { text: '♻️ 转世', disabled: false, action: 'reincarnate', title: '已至最高境界 · 点此转世重修', left: 0 };
    /* 路 3 第四态：闸门期优先于「修为一满就显示突破」。可点（点了由 attemptBreakthrough 说明三值），
       否则玩家只能悬停看 title，等于静默失败。 */
    const cdLeft = Math.max(0, Number(s.cdLeft) || 0);
    if (cdLeft > 0) return { text: '⏳ 闭关中 · 余 ' + fmtCd(cdLeft), disabled: true, action: null,
      title: gateLockNote() + ' · 解禁 ' + fmtWhen(Date.now() + cdLeft) + ' · 可做：' + gateGoals().join('、'),
      left: left, cd: cdLeft };
    if (left <= 0) return { text: '⚡ 突破 ' + nextRankName + ' ' + Number(chancePct).toFixed(1) + '%', disabled: false, action: 'doBreak', title: '当前修为 ' + fmt(expInt(exp)) + ' / 本层需求 ' + fmt(expInt(need)) + ' · 可突破 · 溢出 ' + fmt(Math.max(0, expInt(exp) - expInt(need))), left: 0 };
    return { text: '距突破还差 ' + fmt(leftShown), disabled: true, action: null, title: '当前修为 ' + fmt(expInt(exp)) + ' / 本层需求 ' + fmt(expInt(need)) + ' · 还差 ' + fmt(leftShown), left };
  }
  function expReadout(exp, need){
    const e = Number(exp) || 0, n = Number(need) || 1;
    /* A2：闭关锁定期内，修为条口径改「闭关中」，不再提示可突破 */
    if (secludeLeftMs() > 0) return { barPct: '100.0%', roleText: '闭关中 · 余 ' + fmtCd(secludeLeftMs()), title: gateLockNote() + ' · 可做：' + gateGoals().join('、') };
    /* 第 9 条补落（2026-11-20）：溢出时不再只报「已满」，明示可突破与溢出数（只改显示） */
    if (e >= n) return { barPct: '100.0%', roleText: '可突破 · 溢出 ' + fmt(Math.max(0, expInt(e) - expInt(n))), title: '当前修为 ' + fmt(expInt(e)) + ' / 本层需求 ' + fmt(expInt(n)) + ' · 可突破 · 溢出 ' + fmt(Math.max(0, expInt(e) - expInt(n))) };
    return { barPct: Math.max(0, Math.min(100, e / n * 100)).toFixed(1) + '%', roleText: fmt(expInt(e)) + ' / ' + fmt(expInt(n)), title: '当前修为 ' + fmt(expInt(e)) + ' / 本层需求 ' + fmt(expInt(n)) };
  }
  /* 议程1 P0-2 凝神指引（纯呈现）：功法任务补「解锁门槛/去处」提示，不改 goal.n/cost */
  const GONG_NAME = { gong1: '引气诀', gong2: '凝神诀', gong3: '化神诀' };
  const ACT_NAMES_CD = { sit: '打坐', herb: '采药', train: '历练', enlight: '顿悟', ponder: '参悟' };
  function questProgressLabel(q, prog, ctx){
    ctx = ctx || {};
    const kind = q.goal.kind;
    const g = (typeof GONGS !== 'undefined' ? GONGS : []).find(function(x){ return x && x.id === kind; }) || null;
    const name = GONG_NAME[kind] || '';
    const unit = (kind === 'rank') ? '层' : (name ? '级' : '');
    const head = (name ? name + ' ' : '') + fmt(prog) + ' / ' + fmt(q.goal.n) + (unit ? ' ' + unit : '');
    const out = { head: head, hint: '', locked: false, nextCost: null, jump: null, unit: unit };
    if (g && typeof ctx.rank === 'number'){
      if (ctx.rank < g.unlock){
        out.locked = true;
        out.hint = (name || '这门功法') + '还没现出来。先把' + (RANK_NAMES[g.unlock] || ('境界 ' + g.unlock)) + '这一步跨过去。';
      }
      else if (g.costK){ // costK 存在：复用游戏内既有公式 gongCost(g) 取真实灵石费，避免把系数当费用、也不显示「0 灵石」
        const c = (typeof gongCost === 'function') ? gongCost(g) : g.costK;
        if (c > 0){ out.hint = '去藏经阁 · 功法参到下一级，需 ' + fmt(c) + ' 灵石。'; out.jump = 'xiu_gong'; }
      }
      else if (g.costR){ out.hint = '去洞府 · 洞府设施参到下一级（道韵 ' + fmt(g.costR) + '）。'; out.jump = 'dong_ups'; } // costK=0 仅 costR：按道韵呈现，不显示 0
    }
    /* 非功法任务：用 S6 逐条指路句；功法任务若已给出更具体的费用，不覆盖 */
    if(!out.hint && QUEST_HINTS[q.id]) out.hint = QUEST_HINTS[q.id];
    return out;
  }
  /* 议程1 P0-4 冷却卡片副文（纯呈现）：base 空且无次数上限时，兜底显示行动名，不再留空白 */
  function cdSubtitle(o){
    const raw = o.base == null ? '' : String(o.base).trim();
    const b = raw || (ACT_NAMES_CD[o.k] || '行动');
    const lim = Number(o.limit), n = Number(o.acts);
    const safeLim = Number.isFinite(lim) && lim > 0 ? lim : 0;
    const safeN = Number.isFinite(n) ? n : 0;
    const leftN = safeLim > 0 ? Math.max(0, safeLim - safeN) : 0;
    const text = b + (safeLim > 0 ? ' · 剩 ' + leftN + ' 次' : '');
    return { text: text, nonEmpty: text.trim().length > 0, hasNaN: /NaN|undefined|Infinity/.test(text) };
  }
  /* === AGENDA1_HELPERS_END === */

  function save(){
    if(!inited) return false;
    /* 存档损坏保护：读到过原始数据但迁移失败时，一次都不许保存。
       否则创角存档会覆盖掉玩家那份只是"读不出来"的真实存档。 */
    if(saveBlocked) return false;
    /* 导入冻结期不保存是既有设计（避免把内存里旧进度写回刚导入的新档），
       但不能静默——否则玩家不重载继续玩几小时，进度全丢且毫不知情。
       走一次性提示通道，明确告知"现在不保存、请尽快重载"。 */
    if(frozenForImport){ reportFrozenNoSave(); return false; }
    /* 2026-11-19：创角弹窗在场时，空名档不许落盘。
       清档后 Guide.reset 等模块会顺手 save，一次空名保存就会在刷新后变成「无名散修」
       （或盖掉刚建的号）。创角确认时名字已写入，这条不会拦正常保存。 */
    try{
      if(!S.name){
        const cm = document.getElementById('char-modal');
        if(cm && !cm.classList.contains('hidden')) return false;
      }
    }catch(e){}
    /* 第 124 轮复核意见 A：原来这里吞掉异常，调用方无从得知"没写进去"。
       改为返回布尔值——结算入账要据此决定是否提示玩家。 */
    try{
      localStorage.setItem(SAVE_KEY, JSON.stringify(S));
      reportSaveRecovered();
      return true;
    }catch(e){
      reportSaveFailure();
      return false;
    }
  }
  /* 今日日期键（本地时区）。补零输出：旧实现是 `2026-11-8`，
     字符串比较时 '2026-11-8' > '2026-11-10'，任何"日期是否往后走了"的判定都会错。
     旧的未补零值仍能被 dayNo() 正确解析，所以历史存档无需迁移。 */
  /* 第三批 A1（2026-11-22 制作人拍板）：全部每日系统以本地 08:00 为日界。
     做法：把当前时刻整体前移 8 小时再取本地日期——07:59 仍算前一日，08:00 翻篇。
     旧档里的日期键（自然日）仍按同一格式解析，无需改存档结构。 */
  const DAY_RESET_HOUR = 8;
  function dayStampAt(ts){
    const d = new Date(Number(ts) - DAY_RESET_HOUR * 3600 * 1000);
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  }
  function dayStamp(){ return dayStampAt(Date.now()); }
  function todayKeyAt(ts){
    const t = dayStampAt(ts);
    const p = n => (n < 10 ? '0' : '') + n;
    return t.y + '-' + p(t.m) + '-' + p(t.d);
  }
  function todayKey(){ return todayKeyAt(Date.now()); }
  /* 可比日序号 YYYYMMDD：只用它做"跨天了吗"的大小判定，不做日期加减（月份边界会错）。
     ⚠️ 保证范围（与 js/daily.js 同一口径，别写成"防作弊"）：
     严格递增判定只防「回拨」与「同日重复触发」，**不防把系统时间连续向未来推进**
     （8→9→10…每次都是更晚的一天）。客户端没有可信时间源，离线单机档做不到；
     要真正防这一类必须有服务端下发时间。 */
  function todayNoAt(ts){
    const t = dayStampAt(ts);
    return t.y * 10000 + t.m * 100 + t.d;
  }
  function todayNo(){ return todayNoAt(Date.now()); }
  /* 距下一次 08:00 重置的毫秒数（只用于显示倒计时） */
  function nextDayResetMs(){
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DAY_RESET_HOUR, 0, 0, 0);
    if(now.getTime() >= next.getTime()) next.setDate(next.getDate() + 1);
    return Math.max(0, next.getTime() - now.getTime());
  }
  function dayNo(s){
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s == null ? '' : s));
    return m ? ((+m[1]) * 10000 + (+m[2]) * 100 + (+m[3])) : 0;
  }
  function resetActs(){
    /* ⚠️ 这里也是"新增行动"必须同步的三个地方之一（另两个是 S 初值与 load 的合并）。
       漏了它 → 跨天之后 acts.ponder 变 undefined → 按钮副标题显示"剩 NaN 次"。 */
    S.acts = { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 };
    S.actDay = todayKey();
  }
  function ensureActs(){
    /* 严格递减判定（原为 `!==`）：把系统日期往回改不会再触发一次重置，
       往前改也不再"每改一次给一整套新的行动次数"。行动次数是资源，不能由系统时间决定。 */
    if(dayNo(S.actDay) < todayNo()) resetActs();
  }
  /* 「当没存档」= 从头开始：引导完成标记（tutorial.js 的 KEY）要一起清，否则重开/脏档后
     新角色会跳过引导。load() 跑在 tutorial.js 之前，不能调 Tutorial.reset()。 */
  function clearTutorialMark(){
    try{ localStorage.removeItem('hasFinishedTutorial'); }catch(e){}
  }
  /* 最近一次读档的背包堆叠对账（UI/测试只读）：{beforeSlots, afterSlots, beforeItems, afterItems} */
  let lastBagMerge = null;
  function load(){
    /* raw 提升到 try 外：catch 里要拿它做毁档备份（见下）。
       load 是 400 行的长迁移函数，任何一处抛错（往往是代码 bug，不是存档坏了）
       都会落进 catch → 原实现直接 return false → boot 判定「没有存档」→ 弹创角 →
       confirmChar() 立刻 save() 把唯一那份存档覆盖掉 = 一次 bug 永久毁档。
       现在先把原始串原样备份到独立 key（只留最近一次，不会无限增长），再返回 false。 */
    let raw = null;
    /* 读取本身抛异常（隐私模式 SecurityError / 存储被策略禁用）：
       这时**根本无法判断**玩家有没有存档，必须无条件进保护状态。
       不能用 if(raw) 判断——那时 raw 还是 null，会把"读不出来"误当成"没有存档"，
       boot 随即走创角，save() 再把主键覆盖掉（哪怕 setItem 多半也会失败，也不能靠它兜底）。 */
    try{
      raw = localStorage.getItem(SAVE_KEY);
    }catch(e){
      saveBlocked = true;
      try{ console.error('[load] localStorage 读取被拒绝，进入存档保护状态（禁止保存）：', e); }catch(_){}
      return false;
    }
    try{
      if(!raw){ clearTutorialMark(); return false; }
      const o = JSON.parse(raw);
      if(!o || typeof o !== 'object' || Array.isArray(o)){ clearTutorialMark(); return false; }
      /* 脏档闸门：一个本游戏字段都没有（{}、别的系统写进同一个 key 的对象…）→ 当作没有存档，
         让 boot 走创角，而不是静默起一个 name=''、rank=0 的无名档。 */
      const SAVE_KEYS = ['rank','exp','stone','name','last','cave','log','bag'];
      if(!SAVE_KEYS.some(k => Object.prototype.hasOwnProperty.call(o, k))){ clearTutorialMark(); return false; }
      ['rank','exp','stone','cave','dan','dao','rootIdx','field','mine','gong1','gong2','gong3','herb','ore','weapon','bagSize','pillUntil','pillBonus','petSlots','forge',
       'wisdom','failBonus','guardMirror','guardArray','tianji','herb100','herb10000'].forEach(k => {
        if(typeof o[k] === 'number' && isFinite(o[k])) S[k] = o[k];
      });
      /* P1-C（D1=(a)）：道途为主存档字段。仅接受联机同款四 id（白名单兜底，拒绝非字符串/未知串/原型污染键）；
         脏值或缺失回落 ''（未选，等补选入口）。旧缓存仅作一次性迁移：原始存档无 path 字段时，才从
         MULTI_PATH_KEY 补入本源（不每次读取覆盖，GPT 审查矛盾 A）。 */
      if (typeof o.path === 'string' && PATH_IDS.indexOf(o.path) >= 0) {
        S.path = o.path;
      } else {
        S.path = '';
        if (o.path === undefined) {
          try { const c = localStorage.getItem(MULTI_PATH_KEY); if (c && PATH_IDS.indexOf(c) >= 0) S.path = c; } catch(e){}
        }
      }
      /* 数字字段的合法性分三层处理（不用 `x | 0`：位运算是 32 位有符号截断，
         2147483648|0 会变成负数，大数值反而被钳成 0 或翻负）。
         ① 非负存量（浮点允许小数）：只取下限。
         ② 整数型 + 有业务上限：floor 后夹进 [0, 上限]。
         ③ 无明确业务上限的计数：floor 后只取下限。 */
      ['exp','stone','herb','ore','wisdom','herb100','herb10000','pillBonus','pillUntil'].forEach(k => {
        if(typeof S[k] === 'number' && isFinite(S[k])) S[k] = Math.max(0, S[k]);
      });
      /* 带上限的整数型：上限来自各自的业务边界（见注释） */
      const CAPS = {
        rank: TOP,                 /* 境界 0..25 */
        dao: 9999,                 /* 道韵：转世次数，实际不可能到四位数 */
        cave: 999, dan: 999, forge: 999, field: 999, mine: 999,   /* 建筑等级 */
        rootIdx: 4,                /* 灵根枚举（pickRoot 的候选数） */
        weapon: 9,                 /* 法宝品阶 0..9 */
        weaponLv: 20,              /* 强化上限（ENHANCE_MAX 同口径） */
        bagSize: BAG_CAP,          /* 储物袋不超过上限 */
        petSlots: 99,              /* 灵兽槽：BAL.petMaxSlots 之上再留余量，避免常量未定义时被钳成 0 */
        gong1: 10, gong2: 10, gong3: 10,  /* 功法等级上限 */
        guardMirror: 9999, guardArray: 9999, tianji: 9999,  /* 道具计数 */
        insight: 999, swordAura: 3, huntProg: 1e9,
        tower: 99, towerMax: 99, towerSwept: 9999, weaponBless: 99, zuo: 1e6
      };
      Object.keys(CAPS).forEach(k => {
        const v = S[k];
        if(typeof v !== 'number' || !isFinite(v)) return;
        const cap = CAPS[k];
        S[k] = Math.max(0, Math.min(cap, Math.floor(v)));
      });
      /* 失败加成是小数（每次 +0.05、上限 +0.30），绝不能进上面的整数 CAPS：
         Math.floor(0.05) = 0，曾导致「破境失败后刷新页面，加成凭空消失」。
         这里只夹范围，不取整。 */
      S.failBonus = Math.max(0, Math.min(WISDOM.failCap, Number(S.failBonus) || 0));
      /* 布尔/字符串型标记不做数值处理，但必须挡住"数字混进字符串位"的脏档 */
      if(typeof S.name !== 'string') S.name = '';
      if(!Array.isArray(S.log)) S.log = [];
      if(!Array.isArray(S.bag)) S.bag = [];
      /* 剑意流派（战斗中央剑气弧的配色）：cycleAura 的注释早就写着"存盘记忆"，
         但 load() 一直没读它 → 切换一次、刷新就回到青莲剑意。这里补上，夹进三档之内。 */
      S.swordAura = (typeof o.swordAura === 'number' && isFinite(o.swordAura))
        ? Math.max(0, Math.min(2, Math.floor(o.swordAura))) : 0;   /* 2 = AURA_CLS 最后一档，写死避开 const 时序 */
      /* 悟道体系拆分迁移（v2）：
         新档 insight 独立存在（顿悟进度 0~100）、wisdom 为货币（无上限）；
         旧档只有 wisdom(0~100 进度) → 全量迁入 insight，货币从 0 起，避免白嫖大量悟道值 */
      if(typeof o.insight === 'number' && isFinite(o.insight)){
        S.insight = Math.max(0, Math.min(WISDOM.full, o.insight | 0));
        S.wisdom = Math.max(0, moneyInt(S.wisdom));                  /* 新档：保留货币 */
      }else{
        S.insight = Math.max(0, Math.min(WISDOM.full, moneyInt(S.wisdom)));
        S.wisdom = 0;
      }
      /* 装备三槽是对象字段，上面的数字白名单管不着 → 单独容错：
         ① 旧档没有 equipment → 空三槽；② 槽位类型必须与物品定义对得上，
            否则视为未装备（防老档脏数据把饰品塞进武器槽）。*/
      S.equipment = { weapon: null, armor: null, accessory: null };
      /* 联机结算幂等表（第 123 轮）：跟着主存档一起读写，才能与灵石奖励同一次落盘。
         第 124 轮复核意见 E2/E3：清洗规则只在 MultiLedger 里维护一份，这里不另写一套，
         否则"读档清洗"与"运行期认领"会漂移。缺模块时退回空表（最坏结果是旧局重投补一次）。 */
      S.multiCreditedRuns = Array.isArray(o.multiCreditedRuns) ? o.multiCreditedRuns.slice() : [];
      try{ if(window.MultiLedger) window.MultiLedger.hist(S); else S.multiCreditedRuns = []; }catch(e){ S.multiCreditedRuns = []; }
      /* 每日任务「已入账登录状态」（D-006 J-1）：只收 'id@YYYY-M-D' 形式的短串，去重，最多 40 条。
         它是"这笔奖发过没有"的唯一登录状态 —— 崩在"标记已落盘、奖励未入账"之间时，
         下次启动靠它判断该不该补发（见 js/daily.js 的 recoverPending）。 */
      S.dailyApplied = [];
      if(Array.isArray(o.dailyApplied)){
        const seenApplied = {};
        o.dailyApplied.forEach(v => {
          if(typeof v !== 'string' || v.length > 40) return;
          if(!/^[a-z]{2,8}@\d{4}-\d{1,2}-\d{1,2}$/.test(v)) return;
          if(seenApplied[v]) return;
          seenApplied[v] = 1;
          S.dailyApplied.push(v);
        });
        S.dailyApplied = S.dailyApplied.slice(-40);
      }
      /* 组队首次通关计数：不持久化的话每次刷新都从 undefined 起算，
         第一局通关必然又是 ===1 → 崔九的「首次闯通」记忆与主动来访每次会话重放一遍。 */
      S.multiWins = (typeof o.multiWins === 'number' && isFinite(o.multiWins)) ? Math.max(0, o.multiWins | 0) : 0;
      const eq = (o.equipment && typeof o.equipment === 'object') ? o.equipment : {};
      EQUIP_SLOTS.forEach(k => {
        const id = eq[k];
        if(typeof id === 'string' && ITEMS[id] && ITEMS[id].slot === k) S.equipment[k] = id;
      });
      /* 寿元 / 道统（第 96 轮）迁移：
         老档一律 on=false —— 已经修了几十层的人不该被突然告知"你只剩两年"，
         要开由玩家自己在寿元页点那一下（不可逆，所以按钮上写清楚）。新档走 S 初值的 on=true。 */
      const lf = (o.life && typeof o.life === 'object') ? o.life : null;
      S.life = lf
        ? { age: Math.max(0, Number(lf.age) || 0), on: !!lf.on, brk: Math.max(0, lf.brk | 0) }
        : { age: 0, on: false, brk: 0 };
      S.zuo = (typeof o.zuo === 'number' && isFinite(o.zuo) && o.zuo > 0) ? o.zuo : 0;
      const lg2 = (o.legacy && typeof o.legacy === 'object') ? o.legacy : null;
      /* 历代世系（第 97 轮）：只收字段齐、境界合法的行，最多 12 条——脏档不许把列表撑爆 */
      const hist = (lg2 && Array.isArray(lg2.hist) ? lg2.hist : [])
        .filter(h => h && typeof h === 'object' && (h.rank | 0) >= 0 && (h.rank | 0) <= TOP)
        .slice(0, 12)
        .map(h => ({
          gen: Math.max(1, h.gen | 0),
          rank: h.rank | 0,
          age: Math.max(0, Number(h.age) || 0),
          relic: (typeof h.relic === 'string' && ITEMS[h.relic]) ? h.relic : null
        }));
      S.legacy = {
        gens: lg2 ? Math.max(0, lg2.gens | 0) : 0,
        relic: (lg2 && typeof lg2.relic === 'string' && ITEMS[lg2.relic]) ? lg2.relic : null,
        hist: hist,
        pick: (lg2 && typeof lg2.pick === 'string' && ITEMS[lg2.pick]) ? lg2.pick : null
      };
      if(S.zuo && !isFinite(lifeMax())) S.zuo = 0;      /* 飞升不死：脏档里坐化状态直接作废 */
      /* 心魔照镜（第 99 轮）迁移：老档没有 mirror → 全 0（等于还没认识心魔）。
         脏值一律夹回去：境界 0~TOP、战力非负、gen 不许超过已转世数（否则会出现"来自未来的心魔"）。 */
      const mr = (o.mirror && typeof o.mirror === 'object') ? o.mirror : null;
      S.mirror = {
        gen: mr ? Math.max(0, Math.min(S.legacy.gens, mr.gen | 0)) : 0,
        rank: mr ? Math.max(0, Math.min(TOP, mr.rank | 0)) : 0,
        age: mr ? Math.max(0, Number(mr.age) || 0) : 0,
        brk: mr ? Math.max(0, mr.brk | 0) : 0,
        pow: mr ? Math.max(0, Math.round(Number(mr.pow) || 0)) : 0,
        wins: mr ? Math.max(0, mr.wins | 0) : 0,
        done: mr && mr.done ? 1 : 0,
        calm: mr ? Math.max(0, Math.min(3, mr.calm | 0)) : 0,
        calmStep: mr ? Math.max(0, Math.min(3, mr.calmStep | 0)) : 0
      };
      /* 沈碑 NPC（识人 · 守碑老吏，第 108 轮）迁移：老档没有 npcs → 落默认（还不认识你），零破坏。
         逐字段白名单 + 钳制：met 0/1、rel −100..100、stage 0..3、seenGens 0..已转世数、
         heard 只收短字符串、去重、≤6；choice/cur 计数非负封顶；lastSeen/nudgeAt 只收非负时间戳（0=从未见过）。 */
      const np = (o.npcs && typeof o.npcs === 'object' && o.npcs.stele && typeof o.npcs.stele === 'object') ? o.npcs.stele : null;
      const npInt = (v, lo, hi) => (typeof v === 'number' && isFinite(v)) ? Math.max(lo, Math.min(hi, Math.floor(v))) : 0;
      const npTime = v => (typeof v === 'number' && isFinite(v) && v > 0) ? Math.floor(v) : 0;
      /* 记忆 NPC 框架第一步（F-1/F-2）：字符串数组钳制——只收 1..16 字字符串、去重、上限 cap。
         keepOnly 传入时只保留该集合内的 id（told 只许记「已听过的 topic」）。 */
      const npStrList = (v, cap, keepOnly) => {
        const out = [], seen = {};
        if(Array.isArray(v)){
          for(let i = 0; i < v.length && out.length < cap; i++){
            const t = v[i];
            if(typeof t !== 'string' || t.length === 0 || t.length > 16 || seen[t]) continue;
            if(keepOnly && keepOnly.indexOf(t) < 0) continue;
            seen[t] = 1; out.push(t);
          }
        }
        return out;
      };
      const npChoice = c => ({ listened: npInt(c && c.listened, 0, 999),
                               showoff:  npInt(c && c.showoff,  0, 999),
                               promise:  npInt(c && c.promise,  0, 999) });
      const npHeard = [];
      const npSeen = {};
      if(Array.isArray(np && np.heard)){
        for(let i = 0; i < np.heard.length && npHeard.length < 5; i++){
          const t = np.heard[i];
          if(typeof t === 'string' && t.length > 0 && t.length <= 16 && !npSeen[t]){ npSeen[t] = 1; npHeard.push(t); }
        }
      }
      S.npcs = { stele: {
        met: npInt(np && np.met, 0, 1),
        rel: npInt(np && np.rel, -100, 100),
        stage: npInt(np && np.stage, 0, 3),
        seenGens: npInt(np && np.seenGens, 0, S.legacy.gens),
        lastSeen: npTime(np && np.lastSeen),
        nudgeAt: npTime(np && np.nudgeAt),
        heard: npHeard,
        /* 记忆 NPC 框架第一步（已批 F-1/F-2）：told 只许记「已听过的 topic」；keyLogged 本步只建位。 */
        told: npStrList(np && np.told, 16, npHeard),
        keyLogged: npStrList(np && np.keyLogged, 16),
        /* 记忆 NPC 框架第一步（制作人 2026-11-16 批）：塔创新高「上次已报层」。
           位置在 npcs.<id> 直下（与 stage/heard 同级），不在 cur 下——与 S.towerMax 同寿命，
           转世保留、重开随 S.npcs 整块清；默认 0、钳 0..99。 */
        lastTower: npInt(np && np.lastTower, 0, 99),
        /* 记忆 NPC 框架第二步（7 字段已批；events 与 keyLogged 分工：keyLogged=关键句入史展示，
           events=一次性事件/托付终局/永久关闭标记，只做幂等，不展示）。 */
        trust: npInt(np && np.trust, 0, 3),
        coldUntil: npTime(np && np.coldUntil),
        quest: (function(){
          const q = np && np.quest;
          if(!q || typeof q !== 'object') return null;
          if(['T1','T2','T3'].indexOf(q.id) < 0) return null;
          if(['open','done','failed'].indexOf(q.state) < 0) return null;
          return { id: q.id, state: q.state, at: npTime(q.at) };
        })(),
        attitude: {
          open:    npInt(np && np.attitude && np.attitude.open, 0, 99),
          guarded: npInt(np && np.attitude && np.attitude.guarded, 0, 99),
          rude:    npInt(np && np.attitude && np.attitude.rude, 0, 99),
          cost:    npInt(np && np.attitude && np.attitude.cost, 0, 99)
        },
        events: npStrList(np && np.events, 16),
        state: (function(){
          const s = np && np.state;
          const k = s && s.kind;
          if(['in','away','seclusion','bad'].indexOf(k) < 0) return { kind: 'in', until: 0 };
          return { kind: k, until: npTime(s.until) };
        })(),
        lastDecayAt: npTime(np && np.lastDecayAt),
        choice: npChoice(np && np.choice),
        cur: {
          lastRank: npInt(np && np.cur && np.cur.lastRank, 0, TOP),
          talk:     npInt(np && np.cur && np.cur.talk, 0, 9999),
          promptTale: npInt(np && np.cur && np.cur.promptTale, 0, 1)
        }
      } };
      /* 崔九 NPC（守塔老卒，第 113 轮）迁移：老档没有 cuijiu → 落默认（零破坏）。
         白名单与钳制同 stele 口径：met 0/1、rel −100..100、heard 只收短字符串去重 ≤6、
         choice 计数非负封顶、lastSeen 只收非负时间戳。 */
      const nq = (o.npcs && typeof o.npcs === 'object' && o.npcs.cuijiu && typeof o.npcs.cuijiu === 'object') ? o.npcs.cuijiu : null;
      const nqChoice = c => ({ climb:  npInt(c && c.climb,  0, 999),
                               chat:   npInt(c && c.chat,   0, 999),
                               listen: npInt(c && c.listen, 0, 999) });
      const nqHeard = [];
      const nqSeen = {};
      if(Array.isArray(nq && nq.heard)){
        for(let i = 0; i < nq.heard.length && nqHeard.length < 6; i++){
          const t = nq.heard[i];
          if(typeof t === 'string' && t.length > 0 && t.length <= 16 && !nqSeen[t]){ nqSeen[t] = 1; nqHeard.push(t); }
        }
      }
      S.npcs.cuijiu = {
        met: npInt(nq && nq.met, 0, 1),
        rel: npInt(nq && nq.rel, -100, 100),
        stage: npInt(nq && nq.stage, 0, 3),
        lastSeen: npTime(nq && nq.lastSeen),
        heard: nqHeard,
        /* 记忆 NPC 框架第二样本（P1–P10 批复）：冷脸/态度/一次性/状态/冷落闸/跨世认出。
           时间戳一律 npTime（禁 |0：32 位截断会变负数）。lastTower 不再给崔九。 */
        coldUntil: npTime(nq && nq.coldUntil),
        attitude: {
          open:    npInt(nq && nq.attitude && nq.attitude.open, 0, 99),
          guarded: npInt(nq && nq.attitude && nq.attitude.guarded, 0, 99),
          rude:    npInt(nq && nq.attitude && nq.attitude.rude, 0, 99)
        },
        events: npStrList(nq && nq.events, 16),
        state: (function(){
          const s = nq && nq.state;
          const k = s && s.kind;
          if(['in','away','seclusion','bad'].indexOf(k) < 0) return { kind: 'in', until: 0 };
          return { kind: k, until: npTime(s.until) };
        })(),
        lastDecayAt: npTime(nq && nq.lastDecayAt),
        seenGens: npInt(nq && nq.seenGens, 0, S.legacy.gens),
        /* 托付线：只认 CQ_T1 + 三态；at 用 npTime（禁 |0）。 */
        quest: (function(){
          const q = nq && nq.quest;
          if(!q || typeof q !== 'object') return null;
          if(q.id !== 'CQ_T1') return null;
          if(['open','done','failed'].indexOf(q.state) < 0) return null;
          return { id: 'CQ_T1', state: q.state, at: npTime(q.at) };
        })(),
        choice: nqChoice(nq && nq.choice),
        cur: { talk: npInt(nq && nq.cur && nq.cur.talk, 0, 9999) }
      };
      /* W1「塔底」迁移：只认白名单五值，其余（缺键 / 数字 / 对象 / 未知串 / null）一律回退 ''.
         只读 o、不读 S 旧值 → 重复 load 幂等；老档没这个键时等价于「没俯身过」，不会凭空立碑。 */
      const wfOk = ['', 'dug', 'open', 'self', 'seal'];
      S.worldFoot = (typeof o.worldFoot === 'string' && wfOk.indexOf(o.worldFoot) >= 0) ? o.worldFoot : '';
      /* 记忆 NPC 框架第一步（已批 F-3）：主动触发日额度。只认 YYYY-MM-DD 的 day 与 0..9 的 n。 */
      const na = (o.npcAct && typeof o.npcAct === 'object') ? o.npcAct : null;
      S.npcAct = {
        day: (na && typeof na.day === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(na.day)) ? na.day : '',
        n: npInt(na && na.n, 0, 9)
      };
      /* 阶段一（路3，2026-11-14）迁移前备份：只备份一次，保留最早那份旧档原串。
         写失败不影响读档（load 不改主键；真出错还有 catch 里的 xiuxian_save_corrupt + saveBlocked 兜底）。 */
      try{
        if(!localStorage.getItem('xiuxian_save_pre_stage1')){
          localStorage.setItem('xiuxian_save_pre_stage1', raw);
        }
      }catch(_){}
      /* 阶段一（路3）新增字段：只读 o、不读 S 旧值 → 重复 load 幂等。
         老档没有 day/secludeUntil 时补零值；境界、资源、NPC 关系一律不动。
         day = W1 修 B 的当日主动修为计数（跨天由 ensureDay 重置）；
         secludeUntil = 大境界突破后的闭关终点（墙钟毫秒，0 = 无闸）。 */
      const od = (o.day && typeof o.day === 'object' && !Array.isArray(o.day)) ? o.day : {};
      /* 阶段三收尾（制作人 2026-11-14 批准）：dec = 今日四类决策各 0/1。
         旧档没有这个键 → 四 0；非对象 / 脏值 → 整组归零；只接受 1，其余一律 0。 */
      const odk = (od.dec && typeof od.dec === 'object' && !Array.isArray(od.dec)) ? od.dec : {};
      const b01 = v => (v === 1 ? 1 : 0);
      S.day = {
        key: (typeof od.key === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(od.key)) ? od.key : '',
        expGain: (typeof od.expGain === 'number' && isFinite(od.expGain)) ? Math.max(0, od.expGain) : 0,
        sweepExp: (typeof od.sweepExp === 'number' && isFinite(od.sweepExp)) ? Math.max(0, od.sweepExp) : 0,
        dec: { res: b01(odk.res), risk: b01(odk.risk), grow: b01(odk.grow), social: b01(odk.social) }
      };
      S.secludeUntil = (typeof o.secludeUntil === 'number' && isFinite(o.secludeUntil)) ? Math.max(0, o.secludeUntil) : 0;
      /* 天机阁限购状态迁移：缺失/损坏 → 空账（不会出现负计数或 NaN） */
      const sh = (o.shop && typeof o.shop === 'object') ? o.shop : {};
      S.shop = {
        week: typeof sh.week === 'string' ? sh.week : '',
        heart_mirror: Math.max(0, sh.heart_mirror | 0),
        guard_array: Math.max(0, sh.guard_array | 0),
        tianjiTier: (typeof sh.tianjiTier === 'number' && isFinite(sh.tianjiTier)) ? (sh.tianjiTier | 0) : -1
      };
      /* 旧存档迁移：单一 gong 字段 → gong1（引气诀） */
      if(typeof o.gong === 'number' && !S.gong1){ S.gong1 = Math.max(0, o.gong | 0); }
      /* 镇妖塔字段 */
      if(typeof o.tower === 'number' && isFinite(o.tower)) S.tower = Math.max(1, o.tower | 0);
      if(typeof o.towerMax === 'number' && isFinite(o.towerMax)) S.towerMax = Math.max(0, o.towerMax | 0);
      if(typeof o.towerDay === 'string') S.towerDay = o.towerDay;
      if(typeof o.towerSwept === 'number' && isFinite(o.towerSwept)) S.towerSwept = Math.max(0, o.towerSwept | 0);
      S.towerBossMail = (o.towerBossMail | 0) ? 1 : 0;   /* 旧档 Boss 料补信匣是否已领（0/1） */
      /* 镇妖塔一局五步（第 100 轮）：进行中的局跨刷新保留。
         存档里的门 / 步数 / 符全按白名单钳一遍——旧档没有这个字段就是 null，照旧从「入塔」开始。 */
      S.trun = null;
      const tr = (o.trun && typeof o.trun === 'object') ? o.trun : null;
      if(tr && Array.isArray(tr.doors) && tr.doors.length === 3 && tr.doors.every(k => TDOOR[k])){
        const cn = (v, cap) => isFinite(Number(v)) ? Math.max(0, Math.min(cap, Number(v))) : 0;
        S.trun = {
          f0: Math.max(1, cn(tr.f0, 999999) | 0),
          step: Math.min(TRUN.steps, cn(tr.step, TRUN.steps) | 0),
          doors: tr.doors.slice(),
          charms: { feng: cn(tr.charms && tr.charms.feng, 99) | 0, hu: cn(tr.charms && tr.charms.hu, 99) | 0 },
          brk: cn(tr.brk, 9) | 0,
          end: 0,
          res: { f: cn(tr.res && tr.res.f, 999) | 0, stone: cn(tr.res && tr.res.stone, 1e15),
                 herb: cn(tr.res && tr.res.herb, 1e15), ore: cn(tr.res && tr.res.ore, 1e15),
                 mat: cn(tr.res && tr.res.mat, 9999) | 0, charm: cn(tr.res && tr.res.charm, 999) | 0 }
        };
        if(S.trun.step >= TRUN.steps) S.trun = null;      /* 步数已满的脏档直接丢 */
      }
      const tl = (o.trunLast && typeof o.trunLast === 'object') ? o.trunLast : null;
      S.trunLast = tl ? {
        why: (tl.why === 'done' || tl.why === 'lose' || tl.why === 'quit') ? tl.why : 'done',
        steps: Math.max(0, Math.min(TRUN.steps, Number(tl.steps) || 0)),
        f: Math.max(0, Number(tl.f) || 0), stone: Math.max(0, Number(tl.stone) || 0),
        herb: Math.max(0, Number(tl.herb) || 0), ore: Math.max(0, Number(tl.ore) || 0),
        mat: Math.max(0, Number(tl.mat) || 0), charm: Math.max(0, Number(tl.charm) || 0)
      } : null;
      /* 2026-11-17 逐层爬塔（制作人拍板）：旧「一局五步」的进行中状态与上一局摘要作废。
         字段仍留在存档对象里（不删结构），这里读档后一律清空；新 UI 不再入口五步。 */
      S.trun = null;
      S.trunLast = null;
      /* 角色字段（道号/性别/服装） */
      if(typeof o.name === 'string') S.name = o.name.slice(0, 12);
      if(typeof o.sex === 'string' && (o.sex === 'm' || o.sex === 'f')) S.sex = o.sex;
      /* 立绘性别（2026-10-18）：gender 与 sex 同源，老档从 sex 补正 */
      S.gender = genderOf(typeof o.gender === 'string' && o.gender ? o.gender : S.sex);
      if(typeof o.robe === 'string' && ROBES.some(r => r.id === o.robe)) S.robe = o.robe;
      S.rank = Math.max(0, Math.min(TOP, S.rank | 0));
      S.rootIdx = Math.max(0, Math.min(ROOTS.length - 1, S.rootIdx | 0));
      S.field = Math.max(0, Math.min(BAL.fieldMax, S.field | 0));
      S.mine = Math.max(0, Math.min(BAL.mineMax, S.mine | 0));
      /* 种田闭环（v3）：旧档无 plots → 空田；非法条目（未知作物/非数值时间）清成空位 */
      S.plots = Array.isArray(o.plots)
        ? o.plots.slice(0, plotCount()).map(p => (p && CROPS[p.crop] && isFinite(p.t0) && isFinite(p.need) && p.need > 0)
            ? { crop: p.crop, t0: p.t0, need: p.need } : null)
        : [];
      /* 随机奇遇：清洗 enc / encBuff（气泡不跨会话保留，encClean 内清空） */
      encClean(o);
      /* 第 89 节：三族丹药 buff 同样是时间戳型状态，脏值一律钳回 0~上限 */
      danClean(o);
      S.cave = Math.max(0, Math.min(BAL.caveMax, S.cave | 0));
      S.dan = Math.max(0, Math.min(BUILDINGS.alchemy.maxLevel, S.dan | 0));
      S.forge = Math.max(0, Math.min(BUILDINGS.forge.maxLevel, S.forge | 0));
      /* 匠道修为迁移：阶位 1~max 钳制，经验非负 */
      if(o.mastery && typeof o.mastery === 'object'){
        ['alchemyLv', 'forgeLv'].forEach(k => {
          if(typeof o.mastery[k] === 'number' && isFinite(o.mastery[k])) S.mastery[k] = Math.max(1, Math.min(MASTERY.max, o.mastery[k] | 0));
        });
        ['alchemyExp', 'forgeExp'].forEach(k => {
          if(typeof o.mastery[k] === 'number' && isFinite(o.mastery[k])) S.mastery[k] = Math.max(0, o.mastery[k] | 0);
        });
      }
      /* 丹方旁支（第 69 节）：只认正方 id；旧档没有就全 0（旁方自然锁着） */
      S.recipeN = {};
      if(o.recipeN && typeof o.recipeN === 'object' && !Array.isArray(o.recipeN)){
        Object.keys(DAN_VARIANTS).forEach(k => {
          const n = o.recipeN[k];
          if(typeof n === 'number' && isFinite(n)) S.recipeN[k] = Math.max(0, Math.min(9999, n | 0));
        });
      }
      /* 洞天开辟（第 70 节）：五座 id 白名单 + 等级 0~3；主洞必须是已开的，否则自动取第一座 */
      S.dt = { qing: 0, zhu: 0, su: 0, xuan: 0, huang: 0 };
      if(o.dt && typeof o.dt === 'object' && !Array.isArray(o.dt)){
        DONGTIAN.forEach(c => {
          const n = o.dt[c.id];
          if(typeof n === 'number' && isFinite(n)) S.dt[c.id] = Math.max(0, Math.min(DT_MAX, n | 0));
        });
      }
      S.dtMain = '';
      if(typeof o.dtMain === 'string' && S.dt[o.dtMain] > 0) S.dtMain = o.dtMain;
      if(!S.dtMain){
        const firstDt = DONGTIAN.find(c => S.dt[c.id] > 0);
        S.dtMain = firstDt ? firstDt.id : '';
      }
      S.herb = Math.max(0, moneyInt(S.herb));      /* 灵草/矿石高层也是千万量级，不能用 | 0 */
      S.ore = Math.max(0, moneyInt(S.ore));
      S.weapon = Math.max(0, Math.min(BAL.weaponMult.length - 1, S.weapon | 0));
      /* 法器另三族（第 90 节）：旧档没有 art 字段就全 0；有则逐个夹进 0~9 */
      S.art = { bg: 0, brk: 0, cai: 0 };
      if(o.art && typeof o.art === 'object' && !Array.isArray(o.art)){
        ART_FAMS.forEach(fam => {
          if(fam === 'lq') return;
          const n = o.art[fam];
          if(typeof n === 'number' && isFinite(n)) S.art[fam] = Math.max(0, Math.min(9, n | 0));
        });
      }
      /* rv4 唯一容器迁移：旧档补空，未知 id 忽略并去重；found 不从背包现货反推。 */
      const rv4Raw = (o.rv4 && typeof o.rv4 === 'object' && !Array.isArray(o.rv4)) ? o.rv4 : {};
      S.rv4 = {
        v: 1,
        souls: rv4Ids(rv4Raw.souls, RV4_SOUL_BY_ID),
        found: rv4Ids(rv4Raw.found, RV4_MAT_BY_ID),
        claimed: rv4Ids(rv4Raw.claimed, RV4_BESTIARY_K)
      };
      /* 限时活动：七日签到 / 仙盟争霸 */
      if(o.sign && typeof o.sign === 'object'){
        S.sign.days = (typeof o.sign.days === 'number' && isFinite(o.sign.days)) ? Math.max(0, o.sign.days | 0) : 0;
        S.sign.last = typeof o.sign.last === 'string' ? o.sign.last : '';
      }
      if(o.union && typeof o.union === 'object'){
        const u = o.union;
        S.union.start = (typeof u.start === 'number' && isFinite(u.start)) ? u.start : Date.now();
        S.union.day = typeof u.day === 'string' ? u.day : '';
        S.union.left = (typeof u.left === 'number' && isFinite(u.left)) ? Math.max(0, Math.min(1, u.left | 0)) : 0;
        S.union.merit = (typeof u.merit === 'number' && isFinite(u.merit)) ? Math.max(0, u.merit | 0) : 0;
        S.union.season = (typeof u.season === 'number' && isFinite(u.season)) ? Math.max(1, u.season | 0) : 1;
        S.union.claimed = Array.isArray(u.claimed) ? u.claimed.filter(x => typeof x === 'number' && x >= 0 && x < UNION_REWARD.length) : [];
      }
      /* 山门 · 弟子：品阶钳制 0~5；名册逐条白名单（脏 id/未知差事整条丢），条数不超过上限 */
      if(o.gate && typeof o.gate === 'object'){
        S.gate.lv = (typeof o.gate.lv === 'number' && isFinite(o.gate.lv)) ? Math.max(0, Math.min(BAL.gateMaxLv, o.gate.lv | 0)) : 0;
        S.gate.grad = (typeof o.gate.grad === 'number' && isFinite(o.gate.grad)) ? Math.max(0, Math.min(9999, Math.floor(o.gate.grad))) : 0;
        S.gate.disciples = Array.isArray(o.gate.disciples)
          ? o.gate.disciples.filter(d => d && typeof d.id === 'string' && typeof d.name === 'string')
              .map(d => ({
                id: d.id.slice(0, 24),
                name: String(d.name).slice(0, 8),
                apt: Math.max(1, Math.min(5, d.apt | 0)),
                task: GATE_TASKS[d.task] ? d.task : '',
                t0: (typeof d.t0 === 'number' && isFinite(d.t0)) ? d.t0 : 0,
                ret: (typeof d.ret === 'number' && isFinite(d.ret)) ? d.ret : 0,
                /* 第 61 节的旧档没有 svc：补 0（老弟子从零开始攒趟数），不炸 */
                svc: (typeof d.svc === 'number' && isFinite(d.svc)) ? Math.max(0, Math.min(9999, Math.floor(d.svc))) : 0,
                /* 第 65 节的 last/run：旧档同样补空（没记事 = 没连着做过任何事） */
                last: GATE_TASKS[d.last] ? d.last : '',
                run: (typeof d.run === 'number' && isFinite(d.run)) ? Math.max(0, Math.min(9999, Math.floor(d.run))) : 0,
                /* 第 67 节的 bless（被点化过几次）：旧档没有就补 0 —— "他没记得你" */
                bless: (typeof d.bless === 'number' && isFinite(d.bless)) ? Math.max(0, Math.min(999, Math.floor(d.bless))) : 0
              }))
              .slice(0, BAL.gateCapBase + BAL.gateMaxLv * BAL.gateCapPer)
          : [];
      }
      /* P2：宗门协力 Boss / 灵潮（旧档无则用默认；周键不符会在 ensure 时重置） */
      if(o.coopBoss && typeof o.coopBoss === 'object'){
        const c = o.coopBoss;
        S.coopBoss.week = typeof c.week === 'string' ? c.week : '';
        S.coopBoss.hpMax = (typeof c.hpMax === 'number' && isFinite(c.hpMax)) ? Math.max(0, Math.floor(c.hpMax)) : 0;
        S.coopBoss.dmg = (typeof c.dmg === 'number' && isFinite(c.dmg)) ? Math.max(0, Math.floor(c.dmg)) : 0;
        S.coopBoss.parts = (typeof c.parts === 'number' && isFinite(c.parts)) ? Math.max(0, c.parts | 0) : 0;
        S.coopBoss.claimed = Array.isArray(c.claimed) ? c.claimed.filter(x => typeof x === 'number' && x >= 0 && x < 4) : [];
      }
      /* batch5：老档没有 unlocks → 把当前已越过的解锁点直接记为已弹，避免上线一次弹一串 */
      if(Array.isArray(o.unlocks)) S.unlocks = o.unlocks.filter(id => typeof id === 'string' && UNLOCK_POINTS.some(p => p.id === id));
      else S.unlocks = UNLOCK_POINTS.filter(p => S.rank >= p.rank).map(p => p.id);
      if(o.blueprints && typeof o.blueprints === 'object' && !Array.isArray(o.blueprints)){
        S.blueprints = {};
        BP_IDS.forEach(id => {
          const n = o.blueprints[id];
          if(typeof n === 'number' && isFinite(n) && n > 0) S.blueprints[id] = Math.min(999, Math.floor(n));
        });
      }
      if(o.bpShop && typeof o.bpShop === 'object'){
        S.bpShop.week = typeof o.bpShop.week === 'string' ? o.bpShop.week : '';
        S.bpShop.bought = (typeof o.bpShop.bought === 'number' && isFinite(o.bpShop.bought)) ? Math.max(0, Math.min(1, o.bpShop.bought | 0)) : 0;
      }
      if(o.lingchao && typeof o.lingchao === 'object'){
        const c = o.lingchao;
        S.lingchao.week = typeof c.week === 'string' ? c.week : '';
        S.lingchao.started = c.started ? 1 : 0;
        S.lingchao.startedAt = (typeof c.startedAt === 'number' && isFinite(c.startedAt)) ? c.startedAt : 0;
        S.lingchao.kills = (typeof c.kills === 'number' && isFinite(c.kills)) ? Math.max(0, Math.min(30, c.kills | 0)) : 0;
        S.lingchao.claimed = Array.isArray(c.claimed) ? c.claimed.filter(x => typeof x === 'number' && x >= 0 && x < 6) : [];
        S.lingchao.pv = c.pv ? 1 : 0;
      }
      /* 山门议事（第 103 轮）：旧档无则补空卷（今日待议）；n 只进不退，钳在 9999 内防脏档刷屏 */
      if(o.council && typeof o.council === 'object'){
        const c = o.council;
        S.council.day = typeof c.day === 'string' ? c.day.slice(0, 16) : '';
        S.council.n = (typeof c.n === 'number' && isFinite(c.n)) ? Math.max(0, Math.min(9999, Math.floor(c.n))) : 0;
        S.council.last = typeof c.last === 'string' ? c.last.slice(0, 120) : '';
      }
      /* 入门八事（第 105 轮）：老档一律按「已了」处理 —— 已经自己摸到路的人，不该被按回新手流程。
         进度只进不退、夹在 0~8；脏值（字符串 / 负数）一律当作已了，别把纸签顶成怪数。 */
      S.trail = { i: trailMigrate(o.trail) };
      /* 道途（第 106 轮）：没这个字段的老档静默定位到「第一件还没做成的」，不补发前面已满足的奖励
         （那是白送）；有则夹进 0~12。老档若卡在某一程没做、后面其实都够了，补做那一程时会一路补发。 */
      S.trail2 = { i: trail2Migrate(o.trail2) };
      /* 轮回（第 107 轮）：字段属于当前世才认；换过世 / 没有字段的老档，静默定位到这一世第一件
         还没做成的（十二程那种"补发一串"在这里不行 —— 三关里两关是跨世比战力，一加载就全亮）。 */
      S.trail3 = { i: trail3Migrate(o.trail3, (S.legacy && S.legacy.gens) | 0),
                   gen: (S.legacy && S.legacy.gens) | 0 };
      /* 论剑台（旧档无则重置今日榜） */
      if(o.arena && typeof o.arena === 'object'){
        const a = o.arena;
        S.arena.day = typeof a.day === 'string' ? a.day : '';
        S.arena.left = (typeof a.left === 'number' && isFinite(a.left)) ? Math.max(0, Math.min(BAL.arenaDaily, a.left | 0)) : 0;
        S.arena.tier = (typeof a.tier === 'number' && isFinite(a.tier)) ? Math.max(0, Math.min(ARENA_TIERS.length - 1, a.tier | 0)) : 0;
        S.arena.win = (typeof a.win === 'number' && isFinite(a.win)) ? Math.max(0, a.win | 0) : 0;
        S.arena.lose = (typeof a.lose === 'number' && isFinite(a.lose)) ? Math.max(0, a.lose | 0) : 0;
        S.arena.rep = (typeof a.rep === 'number' && isFinite(a.rep)) ? Math.max(0, a.rep | 0) : 0;
        /* batch5：旧档没有 proxyDay → 按「今日未代打」处理（空串），不报错、不改其余字段 */
        S.arena.proxyDay = typeof a.proxyDay === 'string' ? a.proxyDay : '';
        /* 战力刻度迁移：旧档（powScale 未标记或 ≠ 当前 POW_K）持久化的对手战力按倍率补正 */
        const pwK = (typeof o.powScale === 'number' && o.powScale > 0 && o.powScale !== POW_K) ? (POW_K / o.powScale)
                  : (typeof o.powScale === 'number' && o.powScale > 0) ? 1 : POW_K;
        S.arena.foes = Array.isArray(a.foes) ? a.foes.filter(x => x && typeof x.name === 'string').map(x => ({
          name: x.name.slice(0, 8), power: Math.max(10 * POW_K, Math.floor((x.power | 0) * pwK)), beat: !!x.beat })).slice(0, BAL.arenaFoes) : [];
      }
      /* 秘境副本（旧档无则全 0） */
      if(o.secret && typeof o.secret === 'object'){
        const sc = o.secret;
        S.secret.prog = Array.isArray(sc.prog)
          ? sc.prog.slice(0, SECRET_CH.length).map(v => Math.max(0, Math.min(SECRET_FLOORS, v | 0))) : [];
        while(S.secret.prog.length < SECRET_CH.length) S.secret.prog.push(0);
        S.secret.day = typeof sc.day === 'string' ? sc.day : '';
        S.secret.swept = (typeof sc.swept === 'number' && isFinite(sc.swept)) ? Math.max(0, sc.swept | 0) : 0;
      }
      /* 法宝强化 / 洗练词条 */
      S.weaponLv = (typeof o.weaponLv === 'number' && isFinite(o.weaponLv)) ? Math.max(0, Math.min(BAL.enhanceMax, o.weaponLv | 0)) : 0;
      S.weaponBless = (typeof o.weaponBless === 'number' && isFinite(o.weaponBless)) ? Math.max(0, Math.min(BAL.enhanceBlessMax, o.weaponBless | 0)) : 0;
      /* 词条读档：与 rollAffix 同口径**按 id 去重**（rollAffix 用 used 集合保证不重复，
         所以任何重复词条都是异常档/手改）。不去重的话 4 条同 id 神品会让 affixPowMult()
         冲到 1.88，而服务器 AFFIX_POW_CAP_PCT=22 只认 1.22 → 本机战力高、房间内低，
         玩家表现为"明明战力够却过不去"。 */
      S.affix = [];
      if(Array.isArray(o.affix)){
        const used = {};
        o.affix.forEach(x => {
          if(!x || !affixMeta(x.id) || used[x.id]) return;
          used[x.id] = 1;
          S.affix.push({ id: x.id, q: Math.max(0, Math.min(4, x.q | 0)) });
        });
        S.affix = S.affix.slice(0, affixN());
      }
      if(!S.affix.length && S.weapon > 0) S.affix = rollAffix();   /* 旧档有法宝无词条 → 补一套 */
      S.bagSize = Math.max(BAG_BASE, Math.min(BAG_CAP, S.bagSize | 0));   /* 旧档无 bagSize 时取基础 20 */
      if(typeof o.huntProg === 'number' && isFinite(o.huntProg)) S.huntProg = Math.max(0, o.huntProg);
      if(typeof o.huntBeast === 'string' && BEASTS.some(b => b.id === o.huntBeast)) S.huntBeast = o.huntBeast;
      else S.huntBeast = null;
      /* 2026-11-17 删旧猎妖 UI（制作人批复 B）：同世读档也清，防老档后台继续自动产料 */
      S.huntBeast = null; S.huntProg = 0;
      /* 首通标记只认 BEASTS 表里真实存在的 id：旧版只查"是不是对象"，
         任何键名的脏数据都会永远写回存档（数组也能过）。 */
      S.bossKilled = {};
      if(o.bossKilled && typeof o.bossKilled === 'object' && !Array.isArray(o.bossKilled)){
        Object.keys(o.bossKilled).forEach(k => {
          if(o.bossKilled[k] && BEASTS.some(b => b.id === k)) S.bossKilled[k] = 1;
        });
      }
      if(Array.isArray(o.eggs)) S.eggs = o.eggs.slice(0, BAL.petEggMax).filter(x => x && x.bid && BEASTS.some(b => b.id === x.bid));
      if(Array.isArray(o.pets)) S.pets = o.pets.slice(0, BAL.petMaxSlots).filter(x => x && x.bid).map(x => ({ bid: x.bid, lv: Math.max(1, Math.min(BAL.petMaxLv, x.lv | 0)), exp: Math.max(0, x.exp | 0) }));
      S.petSlots = Math.max(1, Math.min(BAL.petMaxSlots, S.petSlots | 0));
      if(S.pets.length > S.petSlots) S.pets = S.pets.slice(0, S.petSlots);
      GONGS.forEach(g => { S[g.id] = Math.max(0, Math.min(g.max, S[g.id] | 0)); });
      /* 旧档背包里的 paper/iron 已废弃（图纸/废铁不再产出），清掉。
         上限按「储物袋满级 + 洞天加格」收，不能按 S.bagSize 截——否则洞天加格里的东西读档即丢。 */
      /* 读档背包上限 = 合法容量 + 转世上限余量。
         合法容量 bagMaxCap()（储物袋满级 + 洞天全开加格）是给「正常情况下最多能装多少」定的；
         但转世时三槽装备会收回背包，这一步是**系统自己**合法产生的超出（最多 EQUIP_SLOTS.length 件），
         不能被当成「改档塞爆 DOM」而 slice 掉——否则满配玩家转世后一刷新就丢装备。
         上限仍然是有限值，改档塞几万件依旧会被截断。 */
      if(Array.isArray(o.bag)) S.bag = o.bag.filter(x => x && x.t && ITEMS[x.t]).slice(0, bagMaxCap() + EQUIP_SLOTS.length);
      /* 2026-11-19 改名回刷：背包条目只认 id，显示名一律以 ITEMS 现名为准；
         老档里存的旧 n（如「护心镜」→「照胆镜」）在读档时刷新，不把旧名带进新版本。 */
      try{
        S.bag.forEach(it => {
          const meta = ITEMS[it.t];
          if(meta && meta.n && it.n !== meta.n) it.n = meta.n;
        });
      }catch(e){}
      /* 背包堆叠迁移（batch7 跟进单）：旧档散件 → 同键并格，总件数必须一件不少。
         装备/法宝（eq_/art_/有装备槽）不同键、不并；其它按 id+全部变型字段归并。 */
      try{
        const beforeSlots = S.bag.length;
        let beforeItems = 0;
        S.bag.forEach(it => { beforeItems += bagQtyOf(it); });
        const merged = [], map = new Map();
        S.bag.forEach(it => {
          const q = bagQtyOf(it);
          const key = bagStackKey(it);
          if(key && map.has(key)){ map.get(key).q = bagQtyOf(map.get(key)) + q; return; }
          const copy = Object.assign({}, it);
          copy.q = q;
          merged.push(copy);
          if(key) map.set(key, copy);
        });
        let afterItems = 0;
        merged.forEach(it => { afterItems += bagQtyOf(it); });
        S.bag = merged;
        lastBagMerge = { beforeSlots, afterSlots: merged.length, beforeItems, afterItems };
      }catch(e){ lastBagMerge = { error: String(e && e.message || e).slice(0, 80) }; }
      if(lastBagMerge && !lastBagMerge.error && lastBagMerge.beforeSlots !== lastBagMerge.afterSlots){
        try{ console.info('[背包堆叠迁移] 格 ' + lastBagMerge.beforeSlots + '→' + lastBagMerge.afterSlots +
          '，件 ' + lastBagMerge.beforeItems + '→' + lastBagMerge.afterItems); }catch(e){}
      }
      /* 任务进度：stats 合并，questsDone 读取 */
      if(o.stats && typeof o.stats === 'object'){
        Object.keys(S.stats).forEach(k => { if(typeof o.stats[k] === 'number' && isFinite(o.stats[k])) S.stats[k] = o.stats[k]; });
      }
      if(Array.isArray(o.questsDone)) S.questsDone = o.questsDone.slice();
      /* 仙途道碑：只认表里有的 id（改档/旧档混入的脏 id 直接丢掉） */
      if(o.miles && typeof o.miles === 'object'){
        Object.keys(o.miles).forEach(k => {
          const v = o.miles[k];
          if(MILES.some(m => m.id === k) && typeof v === 'number' && isFinite(v)) S.miles[k] = v;
        });
      }
      if(Array.isArray(o.milesNew)) S.milesNew = o.milesNew.filter(id => MILES.some(m => m.id === id));
      /* 信匣：只认形状对得上的（脏数据整封丢），最多 6 封。
         rw 是拆信时的发奖依据（rw.stone 会直接乘进灵石），必须逐个钳制——
         旧写法只判"是对象"，一份手改档塞 rw.stone=1e9 就能白拿。 */
      if(Array.isArray(o.letters)) S.letters = o.letters.filter(x => x && typeof x.id === 'string' &&
        typeof x.text === 'string').slice(0, 6).map(x => ({
          id: x.id, kind: String(x.kind || ''), day: String(x.day || '第 1 日'), text: x.text,
          rw: sanitizeLetterReward(x.rw), open: !!x.open, at: x.at || Date.now() }));
      /* 合并而不是整体替换：老档没有 ponder 这个键，整体替换会让参悟按钮永远禁用。
         但合并后必须**白名单化 + 逐个钳制**：
         · 白名单：acts 是固定业务字段（不是开放式容器），未知键不会被消费却会一直写回存档，
           属于无价值脏数据；将来新增行动类型应显式加进 ACT_KEYS 并给默认值。
         · 钳制：`S.acts.sit = "abc"` 会让按钮副标题显示"剩 NaN 次"，负数等于白送次数。 */
      const ACT_KEYS = ['sit', 'herb', 'train', 'enlight', 'ponder'];
      const srcActs = (o.acts && typeof o.acts === 'object') ? o.acts : {};
      S.acts = {};
      ACT_KEYS.forEach(k => {
        const v = srcActs[k];
        S.acts[k] = (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.floor(v)) : 0;
      });
      /* 悟道树同理：老档没有 wu / wuPaid，合并默认值，否则面板一进就 NaN */
      S.wu = Object.assign({ sword: 0, dan: 0, array: 0 }, (o.wu && typeof o.wu === 'object') ? o.wu : {});
      Object.keys(S.wu).forEach(k => { S.wu[k] = Math.max(0, Math.min(WU_MAX, S.wu[k] | 0)); });
      S.wuPaid = Object.assign({ sword: 0, dan: 0, array: 0 }, (o.wuPaid && typeof o.wuPaid === 'object') ? o.wuPaid : {});
      /* wuPaid 是"洗点返八成"的记账依据：不钳制等于给改档开了免费悟道值的口子 */
      Object.keys(S.wuPaid).forEach(k => {
        const v = S.wuPaid[k];
        S.wuPaid[k] = (typeof v === 'number' && isFinite(v)) ? Math.max(0, v) : 0;
      });
      S.actDay = o.actDay || '';
      /* 主线《断天门》：只记"已领取"，对象字段单独容错（数字白名单管不着）。
         脏 id / 脏时间戳在这里就丢掉；表本身在 js/story.js 里，Story.init 还会再清一遍 */
      S.story = { claimed: {} };
      const stObj = (o.story && typeof o.story === 'object' && !Array.isArray(o.story)) ? o.story : {};
      const stClaimed = (stObj.claimed && typeof stObj.claimed === 'object' && !Array.isArray(stObj.claimed)) ? stObj.claimed : {};
      Object.keys(stClaimed).forEach(k => {
        const v = stClaimed[k];
        if(typeof v !== 'number' || !isFinite(v)) return;
        try{ if(typeof Story !== 'undefined' && Story._STORY && !Story._STORY.some(q => q.id === k)) return; }catch(e){}
        S.story.claimed[k] = v;
      });
      /* 坊市（旧档无则重建：买入/收购行情、货架、今日已售） */
      if(o.market && typeof o.market === 'object'){
        const m = o.market;
        S.market.day = typeof m.day === 'string' ? m.day : '';
        S.market.buyRate = (typeof m.buyRate === 'number' && isFinite(m.buyRate)) ? Math.max(0.5, Math.min(2, m.buyRate)) : 1;
        S.market.sellRate = (typeof m.sellRate === 'number' && isFinite(m.sellRate)) ? Math.max(0.5, Math.min(2, m.sellRate)) : 1;
        S.market.sold = (typeof m.sold === 'number' && isFinite(m.sold)) ? Math.max(0, m.sold | 0) : 0;
        S.market.freeRefresh = (typeof m.freeRefresh === 'number' && isFinite(m.freeRefresh)) ? Math.max(0, m.freeRefresh | 0) : 1;
        S.market.goods = Array.isArray(m.goods) ? m.goods.filter(x => x && marketItem(x.id)).map(x => ({
          id: x.id, price: Math.max(1, x.price | 0), bought: !!x.bought })) : [];
      }
      ensureActs();
      S.last = safeTs(o.last, Date.now());
      if(Array.isArray(o.log)) S.log = o.log.slice(0, 40);
      /* F1 修复（2026-11-11）：断点续走——此前 load() 未恢复 o.guide，
         导致刷新后引导进度整档丢失（S.guide 随主存档同事务保存、却没读回来）。
         引导状态挂在 S.guide，逐字段白名单校验合并，缺字段用默认值兜底，避免脏档注入任意对象。
         Guide.init() 据此判断 alreadyStarted，从而正确续走而非误判老玩家跳过引导。 */
      if(o.guide && typeof o.guide === 'object' && !Array.isArray(o.guide)){
        const gd = o.guide;
        /* tellSystem 深层校验（2026-11-12）：toldSystems/flags/rewardClaims 此前仅做浅层 object 校验，
           脏 truthy 值（字符串/数字/对象/数组）会令 Guide.tellSystem() 误判「已讲过」而跳过补讲；
           原型污染键（__proto__/constructor/prototype）会被原样写回。
           改为深层清理：仅保留严格布尔 true、跳过不安全键、toldSystems 限白名单
           （field/tower/npc/bag/brk，对齐 guide_taixu.js SYSTEM_TIP）。
           依据 evidence/TELLSYSTEM_DEEP_VALIDATE_DESIGN_20261112.md 与 scratch 实现（E2E 9/9）。 */
        const cleanTruthyMap = function(raw, whitelist){
          const out = {};
          if(!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
          const w = whitelist ? new Set(whitelist) : null;
          Object.keys(raw).forEach(k => {
            if(k === '__proto__' || k === 'constructor' || k === 'prototype') return;
            if(w && !w.has(k)) return;
            if(raw[k] === true) out[k] = true;
          });
          return out;
        };
        const TS_KEYS = ['field','tower','npc','bag','brk'];
        S.guide = {
          step: (typeof gd.step === 'number' && isFinite(gd.step)) ? Math.max(0, Math.floor(gd.step)) : 0,
          done: gd.done === true,
          skipped: gd.skipped === true,
          started: gd.started === true,
          flags: cleanTruthyMap(gd.flags),
          rewardClaims: cleanTruthyMap(gd.rewardClaims),
          toldSystems: cleanTruthyMap(gd.toldSystems, TS_KEYS)
        };
      } else {
        S.guide = { step: 0, done: false, skipped: false, started: false, flags: {}, rewardClaims: {}, toldSystems: {} };
      }
      /* 2026-11-17：旧档已通关塔层的一次性 Boss 料补信匣（未拆前不置标记，幂等） */
      try{ towerBossCompLetter(); }catch(e){}
      return true;
    }catch(e){
      /* 迁移过程中抛错：把原始串留档，避免后续 save() 把唯一一份存档覆盖成新档。
         消费者：设置页「存档」处的手动恢复（玩家/维护者可从这里取回原串）。
         ⚠️ 保护模式：只要主键里**确实读到过内容**（raw 非空），就说明玩家有存档。
         此时绝不能把"读档失败"当成"没有存档"——否则 boot 会弹创角，
         confirmChar() 的 save() 会把唯一一份存档覆盖掉，一次 bug = 永久毁档。
         所以这里挂一个 saveBlocked 闸门，禁止任何保存，直到玩家手动选择重开。 */
      let backedUp = false;
      try{
        if(raw && typeof raw === 'string'){
          localStorage.setItem('xiuxian_save_corrupt', raw);
          backedUp = true;
        }
      }catch(_){}
      if(raw){
        saveBlocked = true;      /* 关键：有原始数据 → 禁止保存，防止被新档覆盖 */
        /* 备份键写不进去（存储满/被禁写）时，原文仍留在内存里：
           设置页可以把它导出成文件/文本，玩家不至于只能开开发者工具捞。
           注意这是"尽力而为"——页面一旦刷新内存就没了，所以同时明确提示。 */
        corruptRawCache = raw;
        console.error('[load] 读档迁移失败' + (backedUp ? '，原始存档已备份到 xiuxian_save_corrupt' : '，且备份也失败——原文暂存在内存，请立刻到设置页导出') + '：', e);
      }
      clearTutorialMark(); return false;
    }
  }
  /* 从旧游戏厅搬存档（只搬一次，玩家在游戏内确认后才执行） */
  function readArcadeImport(){
    try{
      const raw = localStorage.getItem('arcade_xx_save');
      if(!raw) return null;
      const o = JSON.parse(raw);
      if(!o || typeof o !== 'object' || typeof o.rank !== 'number') return null;
      return o;
    }catch(e){ return null; }
  }
  function applyArcadeImport(o){
    ['rank','exp','stone','cave','dan','dao','rootIdx'].forEach(k => {
      if(typeof o[k] === 'number' && isFinite(o[k])) S[k] = o[k];
    });
    if(typeof o.gong === 'number') S.gong1 = Math.max(0, o.gong | 0);
    S.rank = Math.max(0, Math.min(TOP, S.rank | 0));
    S.rootIdx = Math.max(0, Math.min(ROOTS.length - 1, S.rootIdx | 0));
    S.cave = Math.max(0, Math.min(BAL.caveMax, S.cave | 0));
    S.dan = Math.max(0, Math.min(BUILDINGS.alchemy.maxLevel, S.dan | 0));
    S.forge = Math.max(0, Math.min(BUILDINGS.forge.maxLevel, S.forge | 0));
    S.field = Math.max(0, Math.min(BAL.fieldMax, S.field | 0));
    GONGS.forEach(g => { S[g.id] = Math.max(0, Math.min(g.max, S[g.id] | 0)); });
    ensureActs();
    S.last = safeTs(o.last, Date.now());
    if(Array.isArray(o.log)) S.log = o.log.slice(0, 40);
    /* 搬完就删源键：取消则不删，下次仍可再选。 */
    try{ localStorage.removeItem('arcade_xx_save'); }catch(e){}
    log('📦 已从游戏厅搬来你的修行进度（境界与资源；背包/灵田等旧格式数据不迁移）。', 'sys');
    return true;
  }
  function askArcadeImport(o, done){
    confirmAction({
      icon:'📦', title:'发现旧修行存档', okText:'确认搬入',
      text:'检测到你在「游戏厅」里的修仙存档（<b>' + escHTML(RANK_NAMES[o.rank] || '?') + '</b>）。<br>要把它搬过来吗？',
      foot:'只迁移旧版支持的数据；取消不会删除旧存档。'
    }, ok => done(!!ok && applyArcadeImport(o)));
  }

  /* 收益 */
  function tick(dt){
    if(dt <= 0) return;
    /* 寿元先扣：这一段里若寿元耗尽，就只结算到坐化那一刻，之后（含离线）颗粒无收。
       递归只会进一层——zuohua() 之后 isZuo() 为真，内层直接走正常分支。 */
    if(lifeOn() && !isZuo()){
      const room = lifeRoomSec();
      if(isFinite(room) && dt > room){ tick(room); zuohua(); return; }
      S.life.age = ((S.life && S.life.age) || 0) + dt / BAL.lifeYearSec;
    }
    const expGain = passiveRate() * dt;
    S.exp += expGain;
    const stoneGain = (stoneRate() + fieldPerSec()) * dt;
    S.stone += stoneGain;                              /* 灵田并入挂机产出，离线也结算 */
    S.stats.stoneEarned += stoneGain;                  /* 累计灵石（任务进度） */
    const oreGain = minePerSec() * dt;
    S.ore += oreGain;                                  /* 矿脉产矿石 */
    /* 第三批 B6：被动产出只累计、不逐 tick 刷屏；活体每秒合并一次 8 秒窗口（见 passFloatTick） */
    if(dt <= 5 && !document.hidden){
      passAcc.exp += expGain; passAcc.stone += stoneGain; passAcc.ore += oreGain;
    }
    huntTick(dt);                                     /* 猎妖挂机结算 */
    gateSettle();                                     /* 山门弟子差事到点结算（按时间戳判，离线也能补） */
  }
  function fmtDur(sec){
    if(sec < 90) return Math.floor(sec) + ' 秒';
    if(sec < 5400) return Math.floor(sec / 60) + ' 分钟';
    return (sec / 3600).toFixed(1) + ' 小时';
  }
  /* 阶段一（路3）W1：自然日重置与主动修为预算。
     day 的三字段随主存档落盘；跨天判定复用现网「日期字符串严格往后走才重置」口径。 */
  let dayTier1Told = false, dayTier2Told = false;
  const dayDecZero = () => ({ res: 0, risk: 0, grow: 0, social: 0 });
  /* 今日四类决策（阶段三收尾，制作人批准）：只认 0/1；缺键 / 脏值一律归 0，不新增顶层键。 */
  function dayDec(){
    if(!S.day || typeof S.day !== 'object' || Array.isArray(S.day)) S.day = { key: '', expGain: 0, sweepExp: 0, dec: dayDecZero() };
    const d = S.day.dec;
    if(!d || typeof d !== 'object' || Array.isArray(d)){ S.day.dec = dayDecZero(); return S.day.dec; }
    ['res', 'risk', 'grow', 'social'].forEach(k => { if(d[k] !== 1) d[k] = 0; });
    return d;
  }
  /* 当日第一次发生某一类真实决策时置 1；ensureDay 先跑，跨天自动归零。 */
  function markDayDec(k){
    if(['res', 'risk', 'grow', 'social'].indexOf(k) < 0) return;
    ensureDay();
    const d = dayDec();
    if(d[k] !== 1) d[k] = 1;
  }
  function ensureDay(){
    if(!S.day || typeof S.day !== 'object' || Array.isArray(S.day)){
      S.day = { key: '', expGain: 0, sweepExp: 0, dec: dayDecZero() };
    }
    dayDec();
    if(dayNo(S.day.key) < todayNo()){
      S.day = { key: todayKey(), expGain: 0, sweepExp: 0, dec: dayDecZero() };
      dayTier1Told = false; dayTier2Told = false;
    }else if(!S.day.key){
      S.day.key = todayKey();
    }
  }
  const activeBudget = () => ACTIVE_BUDGET[BREAK_TIERS.indexOf(breakTierOf(S.rank))] || ACTIVE_BUDGET[0];
  /* 扫荡修为顶（口径 1 预备役）：现行扫荡修为恒 0，本常量只在将来有产出时生效；
     届时应把每笔扫荡修为同时累进 S.day.sweepExp，并按 30% 顶截断（灵石/材料不受影响）。 */
  const sweepExpCap = () => Math.floor(activeBudget() * 0.30);
  const activeEff = () => { ensureDay(); const B = activeBudget(); return S.day.expGain < B ? 1 : (S.day.expGain < B * 1.5 ? 0.5 : 0.25); };
  /* 主动修为入账：先按当日累计档位折算，再把名义量计入累计；返回实际到账值。
     被动 tick / 离线 / 弟子闭关不经过这里（W1 修 B：只顶主动）。 */
  function addActiveExp(v){
    v = Math.max(0, Number(v) || 0);
    if(!v) return 0;
    ensureDay();
    const B = Math.max(1, activeBudget());
    const used = Math.max(0, Number(S.day.expGain) || 0);
    const eff = used < B ? 1 : (used < B * 1.5 ? 0.5 : 0.25);
    S.day.expGain = used + v;
    const got = v * eff;
    S.exp += got;
    if(used < B && S.day.expGain >= B && !dayTier1Told){
      dayTier1Told = true;
      log('⏳ 今日主动修行已到预算（' + fmt(Math.floor(S.day.expGain)) + '/' + fmt(B) + '，为预算的 100%）。此后主动那几笔（打坐、参悟、顿悟这一类）按 50% 计 —— 再点仍有得。挂机与离线不在这条里，照常；明日清晨重置。', 'sys');
    }
    if(used < B * 1.5 && S.day.expGain >= B * 1.5 && !dayTier2Told){
      dayTier2Told = true;
      log('⏳ 今日主动修行已超预算（' + fmt(Math.floor(S.day.expGain)) + '/' + fmt(B) + '，为预算的 150%）。此后主动按 25% 计 —— 仍有得，只是更薄，不归零。明日清晨重置。', 'sys');
    }
    return got;
  }
  /* 闸门时长与时刻：CD 跨天，fmtDur(sec) 只到小时，这里给「X 天 Y 小时」与本地时刻。 */
  function fmtCd(ms){
    const s = Math.max(0, Math.ceil(ms / 1000));
    if(s < 60) return s + ' 秒';
    if(s < 3600) return Math.ceil(s / 60) + ' 分钟';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if(h < 24) return m ? (h + ' 小时 ' + m + ' 分') : (h + ' 小时');
    const d = Math.floor(h / 24), rh = h % 24;
    return rh ? (d + ' 天 ' + rh + ' 小时') : (d + ' 天');
  }
  function fmtWhen(ts){
    const d = new Date(ts);
    const p = n => (n < 10 ? '0' : '') + n;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  /* 离线封顶（阶段一 W2 修订）：前段（rank <= 17）一律补到 12 小时；已 >= 12 小时的段不动。
     12h 地板让两次上线间隔 40,950 秒一次吃饱全天。 */
  function offlineCapSec(){
    return Math.max(12 * 3600, 8 * 3600 * Math.pow(1.12, Math.max(0, (S.rank | 0) - 14))) + dtOffSec();
  }
  let lastOfflineInfo = null;
  function offline(){
    let dt = (Date.now() - (S.last || Date.now())) / 1000;
    /* ⚠️ S.last 若是脏值（字符串/NaN），这里会算出 NaN。
       下面 4012 行 `if(!isFinite(dt) || dt < 8) return;` 会挡住它，
       所以**不会**流进 tick() 产出——但 S.last 自身仍是脏的，会一直污染后续比较，
       所以读档侧用 safeTs() 就把源头拦掉（见 load 里 S.last = safeTs(o.last, Date.now())）。 */
    /* 更漏防篡改：存档时间跑到"未来"（玩家把系统时间往前调）→ 本次离线收益不作数。
       闲人修仙等联网放置游戏用服务器时间做权威；单机没有服务器，只能拿"时间倒流"这个
       唯一可判的异常来兜底，至少堵住"改本地时间刷离线"这条最省事的作弊路径。 */
    if(dt < -60){
      log('⏳ 更漏有误（存档时间晚于此刻），本次闭关所得不计。', 'bad');
      S.last = Date.now(); save();
      return;
    }
    if(!isFinite(dt) || dt < 8) return;
    /* 离线封顶：基准 8 小时，从第 14 层（金丹后）起每层 ×1.12。
       为什么要动：单层时长在第 19 层就超过 8 小时、第 24 层到了 4 天，
       封顶不变等于"回来收一次"的信息量从 100% 掉到 8%——放置游戏的核心承诺（离线也在变强）
       变成每次只挪一格血皮。这里不动任何产出速率，只让"一次闭关"能装的量跟着层数走：
       第 14 层 8h / 第 19 层 ~14h / 第 24 层 ~25h，玩家每次上线仍能看到一大截进度。 */
    const cap = offlineCapSec();
    const used = Math.min(dt, cap);
    const cut = Math.max(0, dt - used);
    const cdBefore = Math.max(0, secludeTs() - (S.last || Date.now()));
    const e0 = S.exp, s0 = S.stone, o0 = S.ore, h0 = S.stats.hunt || 0;
    const logN0 = (S.log || []).length;
    tick(used);
    const gExp = S.exp - e0, gStone = S.stone - s0, gOre = S.ore - o0, gHunt = (S.stats.hunt || 0) - h0;
    /* 第三批 P0：离线期间山门差事/议事等自动结算的条目（log 是 unshift 头插，新条目在最前） */
    const dispatch = (S.log || []).slice(0, Math.max(0, (S.log || []).length - logN0))
      .map(x => x.t).filter(t => /弟子|差事|议事|回山|出师|山门/.test(t)).slice(0, 5);
    lastOfflineInfo = { used: used, dt: dt, cap: cap, gExp: gExp, gStone: gStone, gOre: gOre, gHunt: gHunt, dispatch: dispatch };
    /* 结果底层数字：按出关时速率核算（期间若破境，expRate 随 rank 变，故不写成「速率×时长」。 */
    const rateNow = passiveRate(), stoneNow = stoneRate();
    const cdSpent = Math.min(dt * 1000, cdBefore);
    const cdLeftMs = secludeLeftMs();
    log('🕯️ 闭关 ' + fmtDur(used) + '：修为 +' + fmt(gExp) + '（' + fmt(rateNow) + '/秒），灵石 +' + fmt(gStone), 'sys');
    if(dt > cap) log('（离线实经 ' + fmtDur(dt) + '，本次结算封顶 ' + fmtDur(cap) + '，未计 ' + fmtDur(cut) + '）', '');
    const ripe = ripeCount();
    if(ripe > 0) log('🌱 出关时，灵田里有 ' + ripe + ' 株作物已经成熟，快收进炼丹房。', 'sys');
    /* 闭关归来 · 结算弹窗：离线 ≥5 分钟才摆席（刷新/短退不打扰） */
    /* 第三批 P0：离线 ≥10 分钟才摆席（刷新/短退不打扰），并改用软结算不挡操作 */
    if(used >= 600){
      pushLetters({ used: used, ripe: ripe, gExp: gExp, gStone: gStone, gOre: gOre, gHunt: gHunt });
      showOffline({ used: used, cap: cap, capped: dt > cap, ripe: ripe, gExp: gExp, gStone: gStone, gOre: gOre, gHunt: gHunt,
        dt: dt, cut: cut, rate: rateNow, stoneRate: stoneNow, cdBefore: cdBefore, cdSpent: cdSpent, cdLeft: cdLeftMs, dispatch: dispatch });
    }
  }
  /* 闭关归来弹窗：放置游戏的核心反馈——重进游戏先看这一屏收获 */
  /* ---------- 信匣（2026-10-25）----------
     离线归来的明细表只回答"得了多少"，不回答"这些天山里怎么样了"。
     前者是数值，后者才是"你不在的时候世界还在转"的代入感（一念逍遥主策复盘里反复讲的那件事）。
     参照《闲人修仙》"化身云游、收获以书信寄回"，但做了两处改造以贴合本作：
     ① 主收益照旧自动入账，信匣**不卡收益**——放置游戏不该惩罚"没手动收菜"的人；
        信里带的是小额添头（悟道值/灵草/灵石），拆了才领，是甜头不是门槛。
     ② 信件只写这回真发生了的事（灵田熟了几畦、猎了几只妖、挖了多少矿），
        不编随机鸡汤——白描、短句、具体，跟修行札记一个语气。 */
  const LETTER_POOL = [
    { kind:'rain',  day:0.30, rw:{ wisdom: 30 },  txt: '后山落了一场灵雨。你睡得沉，没淋着。' },
    { kind:'bird',  day:0.55, rw:{ wisdom: 20 },  txt: '一只青羽的鸟在窗台上停了半晌，又飞走了。' },
    { kind:'wind',  day:0.80, rw:{ wisdom: 25 },  txt: '夜里起过一阵山风，把院里的落叶都卷到了阶下。' },
    { kind:'well',  day:1.20, rw:{ stone: 0.6 },  txt: '灵泉涨了些，舀一瓢下来，凉得手心发木。' },
    { kind:'cat',   day:1.60, rw:{ wisdom: 35 },  txt: '有只野猫来廊下躲过雨，第二天早上不见了。' },
    { kind:'cloud', day:2.10, rw:{ wisdom: 40 },  txt: '云海压到了半山腰，整整三日没散。' }
  ];
  function letterCap(used){
    if(used >= 6 * 3600) return 4;
    if(used >= 2 * 3600) return 3;
    if(used >= 1800) return 2;
    return 1;
  }
  /* 信匣奖励钳制（读档用）。取值上限按 LETTER_POOL 与 makeLetters 的真实产出量级定：
     wisdom 单封 ≤ 40、stone 是 needOf 的倍数（最高 0.6）、herb 最多整块灵田的 9 格。
     放宽到"够用但不可能白拿"的量级；超出即按上限收，不整封丢弃（顺手留证据给玩家）。 */
  function sanitizeLetterReward(rw){
    if(!rw || typeof rw !== 'object' || Array.isArray(rw)) return null;
    const num = (v, cap) => (typeof v === 'number' && isFinite(v)) ? Math.max(0, Math.min(cap, v)) : 0;
    const out = {};
    const w = num(rw.wisdom, 200);        if(w) out.wisdom = w;
    const s = num(rw.stone, 3);           if(s) out.stone = s;
    const h = num(rw.herb, 9);            if(h) out.herb = Math.floor(h);
    /* 2026-11-17：补发信可带材料；只认 ITEMS 表里真实存在的 id，数量钳 1–99 */
    if(Array.isArray(rw.items)){
      const items = rw.items.filter(x => x && typeof x.id === 'string' && ITEMS[x.id] &&
        typeof x.n === 'number' && isFinite(x.n))
        .slice(0, 10)
        .map(x => ({ id: x.id, n: Math.max(0, Math.min(99, x.n | 0)) }))
        .filter(x => x.n > 0);
      if(items.length) out.items = items;
    }
    if(rw.flag === 'towerBossMail') out.flag = 'towerBossMail';
    return Object.keys(out).length ? out : null;
  }
  /* 按这回真发生的事凑信：先写实（灵田/猎妖/矿脉/精进），不足的用见闻补齐 */
  function makeLetters(o){
    const used = o.used || 0;
    const days = Math.max(1, Math.round(used / 3600));
    const out = [];
    const push = (kind, text, rw) => out.push({ kind: kind, text: text, rw: rw || null });
    if(o.ripe > 0) push('field', '灵田东头那 ' + o.ripe + ' 株熟了，替你收了，堆在檐下。', { herb: o.ripe });
    if(o.gHunt > 0) push('hunt', '猎得妖兽 ' + o.gHunt + ' 只，兽骨晾在院里，妖丹收进匣子。', null);
    if(o.gOre >= 1) push('mine', '矿脉那边出了 ' + fmt(o.gOre) + ' 块矿石，哑巴徒弟一声没吭地搬进了库房。', null);
    push('train', '打坐未曾间断，修为涨了 ' + fmt(o.gExp) + '。', null);
    /* 见闻：按离线时长挑（同一种不重复），给一点悟道值当"听了个消息"的回礼 */
    const pool = LETTER_POOL.filter(x => used / 3600 >= x.day);
    for(let i = 0; i < pool.length && out.length < letterCap(used); i++) push(pool[i].kind, pool[i].txt, pool[i].rw);
    return out.slice(0, letterCap(used)).map((x, i) => ({
      id: 'L' + Date.now().toString(36) + i, kind: x.kind, day: '第 ' + days + ' 日',
      text: x.text, rw: x.rw, open: false, at: Date.now()
    }));
  }
  function pushLetters(o){
    const made = makeLetters(o || {});
    if(!made.length) return 0;
    S.letters = S.letters.concat(made);
    /* 已拆的先清，未拆的最多留 6 封——别让信匣变成垃圾堆 */
    S.letters = S.letters.filter(x => !x.open).concat(S.letters.filter(x => x.open));
    if(S.letters.length > 6) S.letters = S.letters.slice(0, 6);
    save();
    return made.length;
  }
  function letterCount(){ return (S.letters || []).filter(x => !x.open).length; }
  /* 记忆 NPC 框架第一步（改法一 · 信匣来信通道）：复用 S.letters 既有形状投递，零新增字段。
     内容只有一句碑边的话（来自内容包的 acts 池，带引用槽位），不带奖励、不带任务钩子；
     未拆信上限沿用既有 6 封规则。 */
  function pushNpcLetter(text){
    if(typeof text !== 'string' || !text) return false;
    const id = 'N' + Date.now().toString(36) + (S.letters ? S.letters.length : 0);
    if((S.letters || []).some(x => x && x.id === id)) return false;
    S.letters = (S.letters || []).concat([{ id: id, kind: 'npc', day: '碑边', text: text, rw: {}, open: false, at: Date.now() }]);
    S.letters = S.letters.filter(x => !x.open).concat(S.letters.filter(x => x.open));
    if(S.letters.length > 6) S.letters = S.letters.slice(0, 6);
    log('✉️ 信匣里多了一封没拆的信。', 'note');
    return true;
  }
  /* 2026-11-17 批复：删旧猎妖前，老档已通关的 10/20/30… 层 Boss 料一次性补信匣。
   幂等：信未拆前不置标记；拆信时 rw.flag='towerBossMail' 置 1。若信被信匣上限挤掉，
   下次读档会重投（未拆=未领，不会重复发奖）。 */
function towerBossCompLetter(){
  if(S.towerBossMail) return 0;
  const max = S.towerMax | 0;
  if(max < 10) return 0;
  const ID = 'TBOSS20261117';
  if((S.letters || []).some(x => x && x.id === ID)) return 0;
  const agg = {}, order = [];
  /* 批复：旧档补发只算 10/20/30/40 四档（可达段），50+ 不补 */
  [10, 20, 30, 40].forEach(function(n){
    if(n > max) return;
    const tier = Math.min(5, Math.max(1, Math.ceil(n / 10)));
    const d = TOWER_BOSS_DROP[tier];
    if(!d) return;
    if(!agg[d.id]){ agg[d.id] = { id: d.id, n: 0 }; order.push(d.id); }
    agg[d.id].n += d.n;
  });
  if(!order.length) return 0;
  const items = order.map(id => ({ id: id, n: agg[id].n }));
  const names = items.map(x => ((ITEMS[x.id] || {}).n || x.id) + ' ×' + x.n).join('、');
  S.letters = [{
    id: ID, kind: 'sys', day: '补发',
    text: '镇妖塔旧档补发：已通关塔层的 Boss 料一次补进信匣（' + names + '）。',
    rw: { items: items, flag: 'towerBossMail' }, open: false, at: Date.now()
  }].concat(S.letters || []);
  log('✉️ 信匣里多了一封镇妖塔补发的信。', 'note');
  return 1;
}
/* 拆阅：展开并给添头；已拆的不再发（防连点刷） */
  function openLetter(id){
    const it = (S.letters || []).find(x => x.id === id);
    if(!it || it.open) return null;
    it.open = true;
    const rw = it.rw || {};
    const got = [];
    if(rw.wisdom){ S.wisdom = moneyInt(S.wisdom) + rw.wisdom; got.push('悟道值 +' + rw.wisdom); }
    if(rw.herb){ S.herb = moneyInt(S.herb) + rw.herb; got.push('灵草 +' + rw.herb); }
    if(rw.stone){ const v = Math.floor(needOf(S.rank) * rw.stone); S.stone += v; S.stats.stoneEarned += v; got.push('灵石 +' + fmt(v)); }
    /* 2026-11-17：信匣支持材料补发（老档 Boss 料一次性补口） */
    if(Array.isArray(rw.items)){
      rw.items.forEach(function(x){
        if(!x || typeof x.id !== 'string') return;
        const meta = ITEMS[x.id] || {};
        const need = Math.max(0, x.n | 0);
        let gotN = 0, mailN = 0;
        for(let i = 0; i < need; i++){
          const r = addItemEx(x.id, meta.n || x.id);
          if(r.ok || r.mail){ gotN++; if(r.mail) mailN++; } else break;
        }
        if(gotN) got.push((meta.n || x.id) + ' ×' + gotN + (mailN ? '（暂存信匣 ' + mailN + '）' : ''));
      });
    }
    /* 只认白名单标记，防旧档/脏信借 rw.flag 改任意字段 */
    if(rw.flag === 'towerBossMail') S.towerBossMail = 1;
    if(got.length) log('✉️ ' + it.day + ' · ' + it.text + '（' + got.join('、') + '）', 'sys');
    save();
    render();          /* ⚠️ 这里不重渲染信匣：整表重建会把"刚展开的那封"换成待拆的信封，
                          拆信动画就白做了。信匣的视觉由点击处原地改写（见 renderLetters 的委托） */
    return got.join('、');
  }
  function renderLetters(){
    const box = document.getElementById('off-letters');
    if(!box) return;
    const list = (S.letters || []).filter(x => !x.open);
    if(!list.length){ box.innerHTML = ''; box.classList.remove('has'); return; }
    box.classList.add('has');
      box.innerHTML = '<div class="ol-head">信匣 · <span>' + list.length + ' 封未拆</span></div>' +
      list.map(x => '<div class="ol-item" data-lid="' + x.id + '">' +
        '<i class="ol-seal"></i>' +
        '<div class="ol-main"><b>' + x.day + ' · 一封没拆的信</b>' +
        '<small>点开看看</small></div></div>').join('');
    if(!box.dataset.bound){
      box.dataset.bound = '1';
      box.addEventListener('click', ev => {
        const it = ev.target && ev.target.closest ? ev.target.closest('.ol-item') : null;
        if(!it || it.classList.contains('opened')) return;
        const lid = it.getAttribute('data-lid');
        const x = (S.letters || []).find(y => y.id === lid);
        const got = openLetter(lid);
        if(got == null) return;
        /* 原地把这枚信封改成素笺（整表不重建，展开才留得住） */
        it.classList.add('opened');
        it.textContent = '';
        /* 印留在右下角，但褪成淡朱——"这封已经启过了" */
        const seal = document.createElement('i');
        seal.className = 'ol-seal done';
        it.appendChild(seal);
        /* 拆开后仍留"第几日"——时间线感是"你不在的这些天"的关键 */
        if(x && x.day){
          const dm = document.createElement('div');
          dm.className = 'ol-day';
          dm.textContent = x.day;
          it.appendChild(dm);
        }
        const body = document.createElement('div');
        body.className = 'ol-body';
        body.textContent = x ? x.text : '';
        it.appendChild(body);
        if(got){
          const gg = document.createElement('div');
          gg.className = 'ol-got';
          gg.textContent = got;
          it.appendChild(gg);
        }
        /* 抬头计数同步：拆一封少一封 */
        const hd = box.querySelector('.ol-head span');
        if(hd) hd.textContent = letterCount() + ' 封未拆';
        sfx.pop();
      });
    }
  }

  function showOffline(o){
    const m = document.getElementById('off-modal');
    if(!m) return;
    const dur = document.getElementById('off-dur');
    const rows = document.getElementById('off-rows');
    const note = document.getElementById('off-note');
    if(dur){
      /* dt 缺失时按 used+cut 还原「实际离开了多久」，避免结果印出 NaN（手动调用/老调用点兜底）。 */
      const dtAll = (typeof o.dt === 'number' && isFinite(o.dt)) ? o.dt : (Number(o.used) || 0) + (Number(o.cut) || 0);
      dur.textContent = '此番闭关 ' + fmtDur(o.used) +
        (o.capped ? ' —— 你离开了 ' + fmtDur(dtAll) + '，本次按 ' + fmtDur(o.cap || offlineCapSec()) + ' 结算，未计的 ' + fmtDur(o.cut || 0) + ' 不入账' : '');
    }
    const list = [
      ['修为', '+' + fmt(o.gExp) + '（按出关时速率 ' + fmt(o.rate || 0) + '/秒 × ' + fmtDur(o.used) + ' 核算）'],
      ['灵石', '+' + fmt(o.gStone) + (o.stoneRate ? '（' + fmt(o.stoneRate) + '/秒 × ' + fmtDur(o.used) + '）' : '')]
    ];
    if(o.gOre >= 1) list.push(['矿石', '+' + fmt(o.gOre)]);
    if(o.gHunt > 0) list.push(['猎妖击杀', o.gHunt + ' 只']);
    (o.dispatch || []).forEach(t => list.push(['期间事务', String(t).replace(/^[^\u4e00-\u9fa5A-Za-z0-9]+/, '')]));
    if(rows) rows.innerHTML = list.map(r =>
      '<div class="off-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
    const noteBits = [];
    if(o.ripe > 0) noteBits.push('🌱 灵田里还有 ' + o.ripe + ' 株作物熟了，记得收。');
    if(o.cdBefore > 0){
      if(o.cdLeft > 0){
        noteBits.push('⏳ 你不在的 ' + fmtDur(o.dt) + ' 里，境界闭关也照样走了 ' + fmtCd(o.cdSpent) + ' —— 尚余 ' + fmtCd(o.cdLeft) + '，' + fmtWhen(Date.now() + o.cdLeft) + ' 可破。');
      }else{
        noteBits.push('⏳ 你不在的 ' + fmtDur(o.dt) + ' 里，境界闭关已于 ' + fmtWhen(Date.now()) + ' 满 —— 回来即可再破。');
      }
    }
    if(note) note.textContent = noteBits.join(' · ');
    renderLetters();     /* 信匣：待拆的信（跨次留存，不拆就一直在） */
    m.classList.add('soft');   /* P0：软结算——遮罩不挡操作，卡片可手动关 */
    m.classList.remove('hidden');
    if(typeof sfx !== 'undefined' && sfx.win) sfx.win();
  }

  /* 操作 */
  const CD = {};
  const cdLeft = k => Math.max(0, (CD[k] || 0) - Date.now());
  const setCd = (k, ms) => { CD[k] = Date.now() + ms; };

  /* sec 是"等效挂机秒"；minPct 是按当前层需求的兜底比例（0.002 = 0.2%）。
     为什么要有兜底：挂机速度随境界只涨 1.18×，而层需求涨 1.85×，所以"打坐 = 10 秒挂机"
     这条从第 13 层起就变成 0.0x% 的进度条——点了看不到任何变化，等于按钮坏了。
     保底让"一次点击"永远能看见反馈，早期仍由 sec 主导（第 12 层之前两者打平以前者为准）。 */
  function gainExp(sec, label, minPct){
    const v = Math.max(expRate() * sec, minPct ? needOf(S.rank) * minPct : 0);
    const got = addActiveExp(v);
    log(label + ' 修为 +' + fmt(got), 'good');
    sfx.score();
    render();
  }
  const ACT_NAMES = { sit: '打坐', herb: '采药', train: '历练', enlight: '顿悟', ponder: '参悟' };
  /* 每日任务进度同步：Daily.bump 现在返回 Promise（要进跨窗口锁）。
     无 Web Locks 的环境下它会明确拒绝写入（"load→改→save" 跨标签页不安全），
     这里把"没记下"如实告诉玩家一次 —— 不要让他以为进度已经保存。 */
  let dailyNoLockWarned = false;
  let dailySaveFailWarned = false;
  function dailyBump(kind){
    if(typeof Daily === 'undefined') return;
    Promise.resolve(Daily.bump(kind)).then(r => {
      if(r && r.ok === true){
        /* batch6 对账：bump 走跨窗口锁是异步的，动作当场那次 render 读到的还是旧值。
           这里在锁内保存返回后再刷一次自课/今日清单，做到“点完一下，计数就 +1”。 */
        try{ renderToday(); renderEvent(); renderQuest(); }catch(e){}
      }
      if(r && r.ok === false && r.code === 'NO_LOCK' && !dailyNoLockWarned){
        dailyNoLockWarned = true;
        log('⚠️ ' + r.msg + '（日常任务进度本次不记，其他玩法不受影响）', 'bad');
      } else if(r && r.ok === false &&
               (r.code === 'SAVE_FAILED' || r.code === 'BUMP_FAILED') &&
               !dailySaveFailWarned){
        /* 有锁但保存失败（进度已在 daily.js 回滚）：也要如实告知"本次没记下"，
           与无锁提示分开计数、各只提示一次，避免反复刷屏。
           ⚠️ 只认这两个码：UNKNOWN_TASK（herb/enlight/ponder 等正常动作本就不计入日常）
           必须静默忽略，否则每次采药/顿悟都会误报"保存失败"。 */
        dailySaveFailWarned = true;
        log('⚠️ ' + r.msg + '（可清理本机存储后重试，其他玩法不受影响）', 'bad');
      }
    }, () => {});
  }
  function act(kind){
    ensureActs();
    if(cdLeft(kind) > 0) return;
    const limit = BAL.actLimit[kind] || 0;
    if(S.acts[kind] >= limit){
      log('今日「' + ACT_NAMES[kind] + '」次数已用完（' + limit + '/' + limit + '），明日再来，挂机照常。', 'bad');
      return;
    }
    /* 参悟要先验钱：次数与统计在下面统一累加，不能先扣次数再报"灵石不足" */
    if(kind === 'ponder'){
      const pc = ponderCost();
      if(S.stone < pc){ log('灵石不足，参悟一次要 ' + fmt(pc) + ' 灵石。', 'bad'); return; }
      S.stone -= pc;
    }
    S.acts[kind] = (S.acts[kind] | 0) + 1;      /* |0 兜底：老档/异常态没有这个键时不能变 NaN */
    S.stats[kind] = (S.stats[kind] || 0) + 1;   /* 累计行动次数（任务进度） */
    if(kind === 'sit' && typeof window.Guide !== 'undefined') window.Guide.complete('sit');
    if(typeof Daily !== 'undefined') dailyBump(kind);   /* 每日任务进度（sit/train 有效，herb/enlight 自动忽略） */
    if(kind === 'sit'){
      setCd(kind, 8000);
      /* 阶段二 N5：每日首次打坐附赠悟道值 50×境界系数（不加存档字段：S.acts.sit 当天首次恒为 1） */
      if(S.acts.sit === 1){
        const wgSit = wisdomGain(WISDOM.wisdomSit);
        S.wisdom = moneyInt(S.wisdom) + wgSit;
        log('🧘 每日首坐，心澄气定，悟道值 +' + wgSit + '。', 'gold');
      }
      gainExp(10, '🧘 打坐一炷香，', 0.002);   /* [PLACEHOLDER] 0.2%/次：30 次正好一层 6%，一天点完也不会把一层的进度吃掉太多 */
    }else if(kind === 'herb'){
      setCd(kind, 10000);
      const v = Math.max(1, Math.floor(3 * (1 + danGainPct())));
      S.herb += v;
      log('🌿 采得灵草 +' + v + ' 株（炼丹材料）' + (danGainPct() > 0 ? '，丰产丹效力之中' : '') + '。', 'good');
      sfx.pop(); render();
    }else if(kind === 'train'){
      /* 历练 = 文字冒险：随机抽事件弹古风对话框，选项即时结算（冷却/次数照旧） */
      setCd(kind, 30000);
      return openAdventure();
    }else if(kind === 'ponder'){
      /* 与打坐同一套兜底口径：早期由"60 秒挂机"主导，后期由"当前层 3%"主导 */
      setCd(kind, 30000);
      const v = Math.max(expRate() * 60, needOf(S.rank) * BAL.ponderPct);
      const got = addActiveExp(v);
      const ponderEff = activeEff();
      log('🪙 以灵石参悟，修为 +' + fmt(got) + '（耗灵石 ' + fmt(ponderCost()) +
        (ponderEff < 1 ? ' · 今日主动已降档，这一笔按 ' + Math.round(ponderEff * 100) + '% 计' : '') + '）', 'gold');
      sfx.win(); render();
    }else if(kind === 'enlight'){
      setCd(kind, 90000);
      /* [PLACEHOLDER] 普通 1% / 大悟 2% 兜底：顿悟每天只有 6 次，必须是"看得见的一截" */
      if(Math.random() < 0.2){
        const vBig = Math.max(expRate() * 200, needOf(S.rank) * 0.02);
        const gotBig = addActiveExp(vBig);
        log('✨ 福至心灵，一朝顿悟！修为 +' + fmt(gotBig), 'gold');
        sfx.win(); render();
      }else{
        gainExp(100, '✨ 静坐观想，', 0.01);
      }
    }
    save();
    trailTick();          /* 打完坐/采完药当场推进纸签，不必等 500ms 那一跳 */
    renderCd();   /* 点完立刻刷新冷却,别等 500ms 的定时器 */
  }

  /* 宗门互助接口（模块在后面，用 typeof 探活兜底） */
  function sectBonus(){
    try{ return (typeof SECT !== 'undefined' && SECT.bonusRate) ? SECT.bonusRate() : 0; }catch(e){ return 0; }
  }
  function sectAfter(success, rankBefore){
    try{ if(typeof SECT !== 'undefined' && SECT.afterBreak) SECT.afterBreak(success, rankBefore); }catch(e){}
  }
  function grant(exp, stone){
    exp = Math.max(0, Number(exp) || 0);
    stone = Math.max(0, Number(stone) || 0);
    if(!exp && !stone) return;
    let gotExp = 0;
    if(exp) gotExp = addActiveExp(exp);
    if(stone) S.stone += stone;
    const bits = [];
    if(gotExp) bits.push('修为 +' + fmt(gotExp));
    if(stone) bits.push('灵石 +' + fmt(stone));
    log('⛩️ 宗门互助结算：' + bits.join('，'), 'gold');
    save(); render();
  }

  /* ---------- 突破：全境界自适应概率 + 丹药分级 + 顿悟进度保底 + 护道道具（护心镜/阵法/天机令） ---------- */
  /* 计算某枚丹药在当前境界段是否有效：比的是「阶」（大境界段），品阶只用于老语义兜底 */
  function pillValid(pillId){
    const t = breakTierOf(S.rank);
    const want = breakPillMeta(t.pill);
    const has = breakPillMeta(pillId);
    if(has.seg && want.seg) return has.seg >= want.seg;
    return has.tier >= want.tier;
  }
  /* 原始加算值（不含宗门护法/阵法，也不含最终软膝与夹取）：
     概率唯一来源：BREAK_TIERS 段表 base + 各加算项；UI 与实际判定共用最终函数 breakChanceFinal。
     阶段二 N1：本函数只返回 raw，软膝与上下限统一放到 breakChanceFinal，避免任何调用点再自行 Math.min 封顶。 */
  /* 阶段三 S2：拆账与判定同源。parts 里每一项都是 breakChanceWith 原来就加的那一项，
     顺序、数值、口径完全不变；确认页只展示，不另算一份。 */
  function breakChanceParts(pillId, useArray, useTianji){
    const t = breakTierOf(S.rank);
    const parts = [
      { k: 'base',   n: '段位基础',   v: t.base },
      { k: 'root',   n: '灵根',       v: rootOf().bonus },
      { k: 'danLv',  n: '丹道 · 炉火', v: danLv() * (BAL.danR / 100) },
      { k: 'imprint',n: '转世印记',   v: breakImprintK() },
      { k: 'pill',   n: '已服丹药',   v: pillBonus() },
      { k: 'affix',  n: '洗练词条',   v: affixBreak() },
      { k: 'art',    n: '破器',       v: artBrkPct() },
      { k: 'fail',   n: '失败积累',   v: Math.min(WISDOM.failCap, S.failBonus || 0) }
    ];
    if(pillId && pillValid(pillId)) parts.push({ k: 'pillUse', n: '本次服食', v: breakPillMeta(pillId).bonus });
    if(useArray) parts.push({ k: 'array', n: '护道阵法', v: SHOP_CFG.guardArrayBonus });
    const sect = sectBonus();
    if(sect > 0) parts.push({ k: 'sect', n: '宗门护法', v: sect });
    const raw = parts.reduce(function(a, p){ return a + p.v; }, 0);
    const knee = breakSoftKnee(raw);
    const final = Math.max(BAL.breakMin, Math.min(BAL.breakMax, knee));
    return { parts: parts, raw: raw, knee: knee, final: final, guarantee: !!useTianji };
  }
  function breakChanceWith(pillId){
    return breakChanceParts(pillId, false, false).raw;
  }
  /* 最终判定概率（阶段二 N1）：raw → 软膝 0.85/0.15 → 夹 [BAL.breakMin, BAL.breakMax]。
     软膝含义：raw≤0.85 原样；超过后每 1pp 只兑现 0.15pp，满配仍有边际收益、且不贴死 100%。
     护道阵法与宗门护法属于「加算」项，必须在软膝之前并入 raw（阵法 +15% 不再翻倍）。 */
  function breakSoftKnee(raw){
    return raw <= 0.85 ? raw : 0.85 + (raw - 0.85) * 0.15;
  }
  function breakChanceFinal(pillId, useArray){
    return breakChanceParts(pillId, useArray, false).final;
  }
  /* 突破缺丹药时的指路文案（与炼丹房联动）：有可用丹药 → null；
     已解锁丹方 → 请前往炼制；建筑够但阶位不够 → 修匠道；未解锁 → 提示所需建筑等级 */
  function pillHintText(){
    const t = breakTierOf(S.rank);
    const needSeg = breakPillMeta(t.pill).seg;
    const hasValid = BREAK_PILLS.some(p => p.seg >= needSeg && countItem(p.id) > 0);
    if(hasValid) return null;
    const rec = RECIPES[t.pill];
    if(!rec) return null;
    const lv = bldLevel('alchemy');
    const mst = masteryOf('alchemy');
    const reqM = rec.reqM || 1;
    if(lv >= rec.reqLv && mst >= reqM){
      return '背包缺【' + breakPillMeta(t.pill).name + '】：请前往炼丹房炼制（已解锁，成功率 ' + Math.round(craftRate(rec) * 100) + '%），炼成后在背包里服食可加成功率。';
    }
    if(lv >= rec.reqLv){
      return '【' + breakPillMeta(t.pill).name + '】需丹师 ' + reqM + ' 阶（当前 ' + mst + ' 阶）：请前往炼丹房多炼低阶丹，积累匠道经验。';
    }
    let s = '【' + breakPillMeta(t.pill).name + '】需炼丹房 ' + rec.reqLv + ' 级（当前 ' + lv + ' 级）';
    if(mst < reqM) s += '、丹师 ' + reqM + ' 阶（当前 ' + mst + ' 阶）';
    return s + '：先升级匠道，再炼制。';
  }
  /* 破境丹的正道是「服食」（背包里点服食 → S.pillBonus 10 分钟加成），
     不是点突破时自动吃。此处只做**文案桥接**：让提示与真实机制一致，
     不改任何数值、不改任何消耗行为（自动服用属于未经授权的玩法变更）。 */
  function pillUseText(){
    const pick = autoPickBreakPill();
    if(!pick) return null;
    const pm = breakPillMeta(pick);
    if(!pm || !pm.tier) return null;
    const d = DAN_BY_ID[pick];
    if(!d) return null;
    /* D-1（制作人拍板 2026-11-13）：提示数字取服食真实到账值 d.buff（与 eatDan 日志同源），
       不再用 pm.bonus —— 那是 UI 不可达的选丹口径（brk），曾致提示 +22% 而实际到账 +15%。
       只改显示来源，brk/buff 数值本身一律不动（最终数值留大改阶段二统一出方案）。 */
    return '💊 背包里有【' + pm.name + '】：点开背包服食，突破成功率 +' + danPct(d.buff) + '（' + Math.round(BAL.pillDur / 60) + ' 分钟）';
  }
  /* 高阶法宝指路（元婴期起建议炼器坊 2 级+，与炼器坊联动） */
  function weaponHintText(){
    const t = breakTierOf(S.rank);
    if(breakPillMeta(t.pill).tier < 3) return null;          /* 炼气/筑基/金丹不催法宝 */
    if(S.weapon >= 2) return null;
    const lv = bldLevel('forge');
    return lv >= 2 ? '高阶法宝建议同步炼制：请前往炼器坊（已解锁中品图谱，修炼 ×1.10）。'
                   : '高阶法宝需炼器坊 2 级解锁（当前 ' + lv + ' 级）：先升级炼器坊。';
  }
  /* 突破状态摘要（前端 UI 与测试用） */
  function breakState(pillId){
    const t = breakTierOf(S.rank);
    const shop = Object.keys(SHOP_CFG.items).reduce((a, id) => {
      a[id] = Object.assign(shopLimitState(id), { priceStone: shopPrice(id, 'stone'), priceWisdom: shopPrice(id, 'wisdom') });
      return a;
    }, {});
    return {
      tier: t, rank: S.rank, rankName: RANK_NAMES[S.rank],
      base: t.base, lose: t.lose,
      needPill: t.pill, needPillName: breakPillMeta(t.pill).name,
      chance: breakChanceFinal(pillId, false),
      chanceWithArray: breakChanceFinal(pillId, true),
      insight: S.insight || 0, insightFull: (S.insight || 0) >= WISDOM.full,
      wisdom: S.wisdom || 0, wisdomGainFail: wisdomGain(WISDOM.wisdomPerFail),
      failBonus: Math.min(WISDOM.failCap, S.failBonus || 0),
      guardArr: S.guardArray || 0, guardMirror: S.guardMirror || 0,
      tianji: S.tianji || 0,
      shop: shop, rankMul: SHOP_CFG.rankMul(S.rank),
      alchemyLv: bldLevel('alchemy'), forgeLv: bldLevel('forge'),
      pillHint: pillHintText(), weaponHint: weaponHintText(),
      pills: BREAK_PILLS.map(p => Object.assign({}, p, { valid: p.seg >= breakPillMeta(t.pill).seg, own: countItem(p.id) }))
    };
  }
  /*
   * 全局突破函数（贯穿全境界）
   * opts = {
   *   pill:      'dan1'|'dan2'|'dan3'|'dan4'|'dan5'  突破时服用的丹药 id（可选）
   *   useArray:  true/false   本次使用护道阵法（基础成功率 +15%，一用即耗）
   *   useTianji: true/false   本次使用天机令（必定成功）
   *   护心镜为被动道具：失败时自动消耗并返还 50% 已扣除修为，无需传参
   * }
   */
  function attemptBreakthrough(opts){
    opts = opts || {};
    /* 太虚真人·跳过者补讲（首次打开突破系统；tellSystem 内部已判 skipped 与去重） */
    if (typeof window.Guide !== 'undefined') window.Guide.tellSystem('brk');
    /* 这里刻意**不**加"天劫演出期间禁止突破"的锁：
       #trib-modal 是 pointer-events:none（不挡点击，是有意设计），所以玩家确实能在 4.6 秒演出里
       再破一次。那属于"连续破境"的节奏问题，是玩法取舍，不是缺陷 —— 加锁等于凭空给突破加了
       4.6 秒冷却，会改变玩家的操作手感，要由制作人裁定。
       真正的缺陷是"第二次的结算卡被丢掉了"，那一半已在 js/trib.js 修好（pendingDone 补发）。 */
    if(S.rank >= TOP){ log('已经飞升，人间再无可破之境。', 'gold'); return; }
    /* 阶段一（路3）突破日历闸门：只拦跨大境界那一次。
       必须放在「修为不足」之前 —— 否则闸门期先弹「条件不足」，违反「不许只写条件不足」。 */
    const gateMs = gateCdMs(S.rank);
    const cdLeftMs = gateMs > 0 ? secludeLeftMs() : 0;
    if(cdLeftMs > 0){
      const nextAt = fmtWhen(Date.now() + cdLeftMs);
      const need0 = needOf(S.rank);
      if(S.exp >= need0){
        log('⏳ 境界壁垒未消：上一境初成、气机未固，须再境界闭关 ' + fmtCd(cdLeftMs) + ' 方可再破。修为照收，不因闸门而止；攒下的不会白攒。下次可破：' + nextAt + '。', 'sys');
      }else{
        log('⏳ 境界壁垒未消：距出关还有 ' + fmtCd(cdLeftMs) + '（下次可破 ' + nextAt + '）。出关之前，纵满亦不可破 —— 眼下修为 ' + fmt(S.exp) + '/' + fmt(need0) + '，还差 ' + fmt(Math.max(0, need0 - S.exp)) + '，照攒便是。', 'sys');
      }
      return;
    }
    const need = needOf(S.rank);
    if(S.exp < need){ log('修为不足，先攒到 ' + fmt(need) + '。', 'bad'); return; }
    const t = breakTierOf(S.rank);
    const rankBefore = S.rank;

    /* ---- 1. 校验丹药：持有 + 品阶是否对当前境界有效 ---- */
    const pillId = opts.pill || null;
    if(pillId){
      if(!breakPillMeta(pillId).tier){ log('此物不可作破境之用。', 'bad'); return; }
      if(countItem(pillId) <= 0){
        const hint = pillHintText();
        log('背包里没有【' + breakPillMeta(pillId).name + '】。' + (hint || ''), 'bad'); return;
      }
      if(!pillValid(pillId)){
        log('【' + RANK_NAMES[S.rank] + '】期，基础破境丹已无效，需【' + breakPillMeta(t.pill).name + '】以上。', 'bad'); return;
      }
    }else{
      /* 未带丹药：缺该段破境丹时指路炼丹房 / 炼器坊（不拦截，仅提示） */
      const hint = pillHintText();
      if(hint) log('💡 ' + hint, 'sys');
      const wh = weaponHintText();
      if(wh) log('💡 ' + wh, 'sys');
    }
    /* ---- 2. 校验辅助道具 ----
       护道阵法：主动勾选（本次基础成功率 +15%，突破一用即耗，无论成败）
       天机令  ：主动勾选（必定成功）
       护心镜  ：被动，无需勾选；仅在失败时消耗 1 个并返还 50% 反噬修为 */
    const useArray = !!opts.useArray && (S.guardArray | 0) > 0;
    const useTianji = !!opts.useTianji && (S.tianji | 0) > 0;
    if(opts.useArray && !useArray){ log('没有护道阵法，可去天机阁兑换。', 'bad'); return; }
    if(opts.useTianji && !useTianji){ log('没有天机令，可去天机阁兑换。', 'bad'); return; }

    /* ---- 3. 结算成功概率：天机令 / 顿悟圆满 → 必定成功；护道阵法独立 +15%（不与丹药叠加翻倍） ---- */
    const epiphany = (S.insight || 0) >= WISDOM.full;
    const guarantee = useTianji || epiphany;
    const p = guarantee ? 1 : breakChanceFinal(pillId, useArray);

    /* 护道阵法：本次突破一用即耗（无论成败） */
    if(useArray){
      S.guardArray--;
      log('🌀 护道阵法撑开，本次突破基础成功率固定 +' + Math.round(SHOP_CFG.guardArrayBonus * 100) + '%。', 'gold');
    }

    /* ---- 4. 掷判定 ---- */
    let done = false;
    if(Math.random() < p){
      done = true;
      const rateBefore = passiveRate();
      const powBefore = combatPower();
      const lifeBefore = lifeMax();
      S.exp -= need;
      S.rank += 1;
      try{ queueUnlocks(rankBefore, S.rank); }catch(e){}
      /* P1：跨大境界的世界通告（与聊天分开，限流在 announce 内） */
      try{
        if(breakTierOf(S.rank).from !== breakTierOf(rankBefore).from)
          announce('破境', (S.name || '一位道友') + ' 破入【' + RANK_NAMES[S.rank] + '】');
      }catch(e){}
      /* 路 3：跨大境界成功即落闸（失败不触发、不延长）；CD 从成功这一刻的墙钟起算。 */
      const gateMsNow = gateCdMs(rankBefore);
      if(gateMsNow > 0) S.secludeUntil = Date.now() + gateMsNow;
      if(typeof window.Guide !== 'undefined') window.Guide.complete('brk');
      S.life.brk = (S.life.brk | 0) + 1;     /* 第 97 轮：坐化结算卡记的是这一世突破了几次 */
      S.failBonus = 0;                       /* 突破成功，失败加成清零 */
      if(epiphany){
        S.insight = 0;
        log('🌟 顿悟圆满，一朝悟道天道，不破自明！', 'gold');
      }
      log('⚡ 突破成功！踏入【' + RANK_NAMES[S.rank] + '】', 'gold');
      /* 续命（第 96 轮）：寿元上限按大境界走，所以只有跨段的那一次突破才值得说一句。
         同段内的八次突破不刷屏——"每次突破都+寿元"会让这句话三天就变成噪音。 */
      if(lifeOn() && isFinite(lifeMax()) && lifeStage() !== lifeStageOf(S.rank - 1)){
        log('⏳ 境界拔高，寿元上限涨到 ' + lifeMax() + ' 年（' + STAGE_NAMES[lifeStage()] + '），还剩 ' + Math.floor(lifeLeft()) + ' 年。', 'gold');
      }
      if(gateMsNow > 0){
        log('🌫️ 新境初成，气机未固 —— 自此刻起须境界闭关 ' + fmtCd(gateMsNow) + '，出关后可再破【' + RANK_NAMES[S.rank + 1] + '】。下次可破：' + fmtWhen(S.secludeUntil) + '。', 'gold');
      }
      if(window.playLevelUpSound) playLevelUpSound();   /* 场景音效：突破成功（audio/levelup.wav） */
      sfx.win();
      const best = store.get(BEST_KEY, 0) || 0;
      if(S.rank > best){
        store.set(BEST_KEY, S.rank);
        log('🏆 刷新了自己的最高境界纪录。', 'gold');
      }
      if(S.rank >= TOP) log('🌈 你已飞升上界，可以「转世重修」，带着道韵再来一遍。', 'gold');
      /* 渡劫天象：演出收尾后再弹突破结算（异常/缺模块时兜底直接弹） */
      const rA = passiveRate();
      const bMeta = { rankBefore: rankBefore, powBefore: powBefore, lifeBefore: lifeBefore,
        unlocked: breakUnlocks(S.rank), gateMs: gateMsNow };
      if(window.TRIB) TRIB.play(true, { rank: RANK_NAMES[S.rank], onDone: () => showBreak(rateBefore, rA, bMeta) });
      else showBreak(rateBefore, rA, bMeta);
    }else{
      /* ---- 5. 失败：顿悟进度 + 失败加成 + 悟道值（产出途径之一） ---- */
      S.failBonus = Math.min(WISDOM.failCap, (S.failBonus || 0) + WISDOM.failStep);
      const iBefore = S.insight || 0;
      S.insight = Math.min(WISDOM.full, iBefore + WISDOM.perFail);
      const wGain = wisdomGain(WISDOM.wisdomPerFail);
      S.wisdom = moneyInt(S.wisdom) + wGain;
      /* 修为结算：护心镜被动挡一半反噬（失败才消耗，成功不消耗） */
      const loseRaw = Math.floor(need * t.lose);
      /* 阶段二 N3：失败反噬最多扣「被动 1.092 天」的修为，避免高段一次失败抹掉数天挂机 */
      const loseCap = Math.floor(expRate() * 86400 * BAL.breakLossCapDays);
      const lose = Math.min(loseRaw, loseCap);
      let back = 0;
      if((S.guardMirror | 0) > 0){
        back = Math.floor(lose * 0.5);
        S.exp = Math.max(0, S.exp - lose + back);
        S.guardMirror--;
        log('🛡️ 护心镜碎裂，替你挡下半数反噬：修为净损 ' + fmt(lose - back) + '（返还 50%）。', 'gold');
      }else{
        S.exp = Math.max(0, S.exp - lose);
        log('💥 突破失败，气机反噬，修为散去 ' + fmt(lose) + '（' + t.name + '段扣 ' + Math.round(t.lose * 100) + '%）。', 'bad');
      }
      log('🧘 顿悟进度 +' + (S.insight - iBefore) + '（' + S.insight + '/' + WISDOM.full + '）、悟道值 +' + wGain +
          '，下次突破成功率 +' + Math.round(Math.min(WISDOM.failCap, S.failBonus) * 100) + '%。', 'sys');
      if(S.insight >= WISDOM.full) log('✨ 顿悟进度已圆满，下次突破必定成功！', 'gold');
      sfx.lose();
      /* 渡劫天象（失败态）：余烬收尾后同样给一页结算（成功率 / 反噬 / 祝福进度） */
      const fMeta = { p: p, guarantee: guarantee, lose: lose, back: back,
        insight: S.insight || 0, failBonus: S.failBonus || 0 };
      if(window.TRIB) TRIB.play(false, { onDone: () => showBreakFail(fMeta) });
      else showBreakFail(fMeta);
    }

    /* ---- 6. 消耗丹药 / 天机令 ---- */
    if(pillId) removeItems(pillId, 1);
    if(useTianji){
      S.tianji--;
      log('🧿 天机令化作流光没入眉心，天机已断，下次须再寻一枚。', 'gold');
    }

    save(); render();
    sectAfter(done, rankBefore);
  }
  /* 当前段位该服哪一枚破境丹：优先「恰好够用」的最低品阶（精确匹配 seg），
     没有同阶的就返回 null —— 绝不拿大乘丹去打炼气突破。
     仅用于文案提示，不参与任何自动消耗。 */
  function autoPickBreakPill(){
    const t = breakTierOf(S.rank);
    const needSeg = breakPillMeta(t.pill).seg;
    const usable = BREAK_PILLS.filter(p => p.seg === needSeg && countItem(p.id) > 0);
    return usable.length ? usable[0].id : null;
  }
  /* 兼容旧入口：从藏经阁 UI 的两个勾选框读取辅助道具，直接突破。
     注：破境丹不在这里自动吃 —— 它的生效路径是背包里「服食」（eatDan → pillBonus）。
     突破面板只负责把「该去服哪颗」写在提示里（pillUseText）。 */
  /* 旧入口直破（测试与内部用）：不弹确认，保留原有单步行为。 */
  function doBreakNow(){
    const a = document.getElementById('xx-use-array');
    const j = document.getElementById('xx-use-tianji');
    attemptBreakthrough({ useArray: !!(a && a.checked), useTianji: !!(j && j.checked) });
  }
  /* 阶段三 S2：UI 突破入口先出确认页。拆账、失败代价、闭关状态全部同一口径。 */
  function openBreakConfirm(){
    const m = document.getElementById('break-confirm-modal');
    if(!m){ doBreakNow(); return; }
    if(S.rank >= TOP){ doBreakNow(); return; }
    const a = document.getElementById('xx-use-array');
    const j = document.getElementById('xx-use-tianji');
    const useArray = !!(a && a.checked) && (S.guardArray | 0) > 0;
    const useTianji = !!(j && j.checked) && (S.tianji | 0) > 0;
    const need = needOf(S.rank), t = breakTierOf(S.rank);
    const epiphany = (S.insight || 0) >= WISDOM.full;
    const info = breakChanceParts(null, useArray, useTianji);
    const guarantee = useTianji || epiphany;
    const gate = gateCdMs(S.rank);
    const cdLeft = gate > 0 ? secludeLeftMs() : 0;
    const canBreak = S.exp >= need && cdLeft <= 0;
    const setTxt = function(id, v){ const el = document.getElementById(id); if(el) el.textContent = v; };
    setTxt('bc-title', '破境 · ' + (RANK_NAMES[S.rank] || '') + ' → ' + (RANK_NAMES[S.rank + 1] || '飞升'));
    setTxt('bc-sub', guarantee
      ? (useTianji ? '天机令已备：这一次，门是开的。' : '顿悟已圆：这一次，门是开的。')
      : '下面每一行都是你现在实有的底，逐项相加；最后一行就是这一枚骰子的真实面数——不含运气，只含你走过的路。');
    const partsEl = document.getElementById('bc-parts');
    if(partsEl){
      let rows = '';
      info.parts.forEach(function(p){
        if(p.v <= 0) return;
        rows += '<div class="bc-row"><span>' + p.n + '</span><b>+' +
          (Math.round(p.v * 1000) / 10) + '%</b></div>';
      });
      rows += '<div class="bc-row"><span>逐项相加</span><b>' + (Math.round(info.raw * 1000) / 10) + '%</b></div>';
      if(info.raw > 0.85 && !guarantee){
        rows += '<div class="bc-row"><span>超过 85% 后 · 超出部分只计 15%</span><b>' +
          (Math.round(info.final * 1000) / 10) + '%</b></div>';
      }
      rows += '<div class="bc-row"><span><b>这一次</b></span><b>' +
        (guarantee ? '成（必定成功）' : (Math.round(info.final * 1000) / 10) + '%') + '</b></div>';
      partsEl.innerHTML = rows;
    }
    const loseRaw = Math.floor(need * t.lose);
    const loseCap = Math.floor(expRate() * 86400 * BAL.breakLossCapDays);
    const lose = Math.min(loseRaw, loseCap);
    const back = (S.guardMirror | 0) > 0 ? Math.floor(lose * 0.5) : 0;
    setTxt('bc-cost', '失败也要往前走：修为 -' + fmt(lose - back) +
      (back > 0 ? '（反噬本为 ' + fmt(lose) + '，护心镜挡回一半，镜碎一枚）' : '') +
      '，顿悟进度 +' + WISDOM.perFail + '，下一次成功率 +' + Math.round(WISDOM.failStep * 100) + '%。' +
      '这一笔有顶：至多抵得上被动修行 ' + fmtCd(BAL.breakLossCapDays * 86400 * 1000) + ' 的所得——修得越久，失败越咬不动你。');
    if(cdLeft > 0){
      setTxt('bc-cd', '⏳ 境界闭关还剩 ' + fmtCd(cdLeft) + '，' + fmtWhen(Date.now() + cdLeft) + ' 之前，门上还压着一层。');
    }else if(gate > 0){
      setTxt('bc-cd', '🌫️ 这一步跨的是大境界：成功后须境界闭关 ' + fmtCd(gate) + '，' + fmtWhen(Date.now() + gate) + ' 再破下一境。');
    }else{
      setTxt('bc-cd', '这一步不闭关，出关即成。');
    }
    /* 阶段三收尾（制作人裁定）：丹药 buff 剩余时间单列一行，直读 S.pillUntil（到期时间戳），
       不再拼进闭关那行；没有药力时也如实写"当前无"。 */
    const pillMs = Math.max(0, (Number(S.pillUntil) || 0) - Date.now());
    const pillLeft = pillMs > 0 ? Math.ceil(pillMs / 60000) : 0;
    const pillEl = document.getElementById('bc-pill');
    if(pillEl){
      const hint = (typeof pillHintText === 'function') ? pillHintText() : '';
      pillEl.innerHTML = (pillLeft > 0
        ? '💊 丹药药力：还剩约 ' + pillLeft + ' 分钟（' + fmtWhen(Number(S.pillUntil) || Date.now()) + ' 到期）'
        : '💊 丹药药力：当前无（服食破境丹后，这里会写清剩余时间）') +
        (hint ? ' <button type="button" class="mat-go" data-mat-go="dong:xx-alchemy-sec">缺丹药？去炼丹房</button>' : '');
      const mb = pillEl.querySelector('[data-mat-go]');
      if(mb) mb.onclick = () => { closeBreakConfirm(); if(window.ROUTER) ROUTER.open('dong', 'xx-alchemy-sec'); };
    }
    const ok = document.getElementById('bc-ok');
    if(ok){
      ok.disabled = !canBreak;
      ok.textContent = cdLeft > 0 ? '门上还压着一层'
        : (S.exp < need ? fmt(need - S.exp) + ' 方可动手' : '破这一境');
    }
    m.classList.remove('hidden');
  }
  function closeBreakConfirm(){ const m = document.getElementById('break-confirm-modal'); if(m) m.classList.add('hidden'); }
  function confirmBreakNow(){
    /* R-S2-a（2026-11-14 制作人批准）：只认页上真开着的确认页。
       hidden / 弹窗节点缺失时，程序化 click 或直接调用一律不结算——UI 的 disabled 只是顺手一层，
       不能替代这里的状态校验。 */
    const m = document.getElementById('break-confirm-modal');
    if(!m || m.classList.contains('hidden')) return false;
    const a = document.getElementById('xx-use-array');
    const j = document.getElementById('xx-use-tianji');
    closeBreakConfirm();
    attemptBreakthrough({ useArray: !!(a && a.checked), useTianji: !!(j && j.checked) });
    return true;
  }
  /* UI 绑定用：先确认；测试/内部旧入口仍走 doBreakNow。 */
  function doBreak(){ openBreakConfirm(); }
  /* ============ 天机阁：限购 / 动态价格 / 购买（唯一入口） ============ */
  /* 周键：以周一 0 点为一周起点（本地时区）；跨周首点即惰性重置周限购 */
  function weekKey(){
    const d = new Date();
    const day = (d.getDay() + 6) % 7;                            /* 周一 = 0 … 周日 = 6 */
    const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
    return mon.getFullYear() + '-' + (mon.getMonth() + 1) + '-' + mon.getDate();
  }
  function resetShopWeek(){
    if(!S.shop || typeof S.shop !== 'object') S.shop = { week:'', heart_mirror:0, guard_array:0, tianjiTier:-1 };
    const k = weekKey();
    if(S.shop.week !== k){
      S.shop.week = k;
      S.shop.heart_mirror = 0;
      S.shop.guard_array = 0;
    }
    if(typeof S.shop.tianjiTier !== 'number' || !isFinite(S.shop.tianjiTier)) S.shop.tianjiTier = -1;
    return S.shop;
  }
  /* 天机阁动态价格（与坊市脱钩的另一个维度）：
     kind='stone'  → 当前总资产 × assetRatio（35%~45%），下限 = 境界需求 × assetAnchor；
     kind='wisdom' → baseWisdom × 1.15^境界（大额悟道值，与悟道值产出同系数缩放） */
  function shopPrice(id, kind){
    const it = SHOP_CFG.items[id];
    if(!it) return null;
    if(kind === 'wisdom'){
      return Math.max(1, Math.floor(it.baseWisdom * SHOP_CFG.rankMul(S.rank)));
    }
    const ratio  = SHOP_CFG.assetRatio[id]  != null ? SHOP_CFG.assetRatio[id]  : 0.4;
    const anchor = SHOP_CFG.assetAnchor[id] != null ? SHOP_CFG.assetAnchor[id] : 1;
    const byAsset = Math.floor(moneyInt(S.stone) * ratio);
    const byNeed  = Math.floor(needOf(S.rank) * anchor);
    return Math.max(1, byAsset, byNeed);
  }
  /* 限购状态：sold=售罄；left=剩余次数；txt=UI 文案
     week     → 本周计数（周一重置）
     rankTier → 以当前境界段的起始境界为 key，同段只可兑 1 次，突破后自动解锁 */
  function shopLimitState(id){
    resetShopWeek();
    const it = SHOP_CFG.items[id];
    if(!it) return { sold:true, left:0, txt:'—' };
    const L = it.limit;
    if(L.type === 'week'){
      const used = Math.max(0, S.shop[id] | 0);
      return { sold: used >= L.n, left: Math.max(0, L.n - used), txt: '本周 ' + Math.min(used, L.n) + '/' + L.n };
    }
    const tierFrom = breakTierOf(S.rank).from;
    const sold = S.shop.tianjiTier === tierFrom;
    return { sold, left: sold ? 0 : 1, txt: sold ? '本境已兑' : '本境 0/1' };
  }
  function shopSoldOut(id){ return shopLimitState(id).sold; }
  /* 道具发放（唯一发放点，数量只在这里 +1） */
  function grantGuard(id){
    if(id === 'heart_mirror') S.guardMirror = (S.guardMirror | 0) + 1;
    else if(id === 'guard_array') S.guardArray = (S.guardArray | 0) + 1;
    else if(id === 'tianji') S.tianji = (S.tianji | 0) + 1;
  }
  /* 购买统一入口（双扣制：灵石按总资产比例 + 大额悟道值，两种都必须付）
     校验顺序：商品合法 → 限购是否售罄 → 灵石是否足够 → 悟道值是否足够 → 扣款 → 记账 → 发放
     任何路径（新 UI / 旧 exchangeWisdom / 旧 buyGuard）都收敛到这里，无法绕过限购 */
  function doBuyShop(id, fromEl){
    const it = SHOP_CFG.items[id];
    if(!it){ log('天机阁没有此物。', 'bad'); return false; }
    const st = shopLimitState(id);
    if(st.sold){
      log('【' + it.name + '】' + (it.limit.type === 'rankTier' ? '本境界已兑换过，突破后下一境界再来。' : '本周已售罄，下周再来。'), 'bad');
      return false;
    }
    const ps = shopPrice(id, 'stone'), pw = shopPrice(id, 'wisdom');
    if(moneyInt(S.stone) < ps){
      const m='灵石不足，【' + it.name + '】要 ' + fmt(ps) + ' 灵石（总资产的 ' +
          Math.round((SHOP_CFG.assetRatio[id] || 0.4) * 100) + '%，差 ' + fmt(ps - moneyInt(S.stone)) + '）。';
      log(m, 'bad'); try{ if(window.toast) toast(m); }catch(e){}
      return false;
    }
    if(moneyInt(S.wisdom) < pw){
      log('悟道值不足，【' + it.name + '】要 ' + fmt(pw) + ' 点（现有 ' + moneyInt(S.wisdom) + '）。', 'bad');
      return false;
    }
    S.stone -= ps; S.wisdom -= pw;
    /* 记账：限购计数只在这里递增，天然防绕过 */
    if(it.limit.type === 'week') S.shop[id] = (S.shop[id] | 0) + 1;
    else S.shop.tianjiTier = breakTierOf(S.rank).from;
    grantGuard(id);
    log('🧿 花 ' + fmt(ps) + ' 灵石 + ' + fmt(pw) + ' 点悟道值，购得【' + it.name + '】——' +
        (BREAK_GUARDS[id] || {}).desc + '。', 'gold');
    sfx.win(); save(); render();
    /* 天机阁是稀缺大额消费（限购 + 双扣）：购得走珍宝揭晓 modal，对得起这笔花费 */
    showTreasure({ img: SHOP_IMG[id], name: it.name, cls: 'gold',
      desc: '耗费 ' + fmt(ps) + ' 灵石 + ' + fmt(pw) + ' 点悟道值 · ' + ((BREAK_GUARDS[id] || {}).desc || '') });
    /* 双扣也要看得见：灵石 + 悟道值两笔各自飘字（重绘后重新取按钮，锚点才不会脱钩） */
    {
      const box = document.getElementById('tj-goods');
      const row = box ? box.querySelector('.mk-row[data-buy-row="' + id + '"]') : null;
      const btn = box ? box.querySelector('[data-buy="' + id + '"]') : null;
      const anchor = btn || fromEl;
      if(anchor){
        /* 珍宝揭晓弹窗铺满全屏（z50），浮字默认 z45 会被压在下面 → 用 over 变体浮到弹窗之上 */
        if(ps > 0) spendFloat('-' + fmt(ps) + ' 灵石', anchor, 'over');
        if(pw > 0) setTimeout(() => spendFloat('-' + fmt(pw) + ' 悟道', anchor, 'over'), 90);
      }
      if(row) flashEl(row);
    }
    return true;
  }
  /* 阶段三 S2：天机阁是大额双扣（灵石占总资产 35%–45% + 大额悟道值），
     UI 先出确认页；确认页数字与真正扣款同源（shopPrice），不另算一份。
     测试/旧入口仍走 doBuyShop，不改变既有单步语义。 */
  function buyShop(id, fromEl){
    const it = SHOP_CFG.items[id];
    if(!it){ log('天机阁没有此物。', 'bad'); return false; }
    const st = shopLimitState(id);
    if(st.sold){ return doBuyShop(id, fromEl); }   /* 让 doBuyShop 出原有售罄文案 */
    const ps = shopPrice(id, 'stone'), pw = shopPrice(id, 'wisdom');
    if(moneyInt(S.stone) < ps || moneyInt(S.wisdom) < pw){ return doBuyShop(id, fromEl); }
    const own = id === 'heart_mirror' ? S.guardMirror : id === 'guard_array' ? S.guardArray : S.tianji;
    pickStance({
      icon: '🧿', title: '天机阁 · 兑换【' + it.name + '】',
      text: '将消耗 <b>' + fmt(ps) + '</b> 灵石（当前总资产的 ' +
        Math.round((SHOP_CFG.assetRatio[id] || 0.4) * 100) + '%）＋ <b>' + fmt(pw) + '</b> 悟道值。' +
        '<br>持有 ' + (own | 0) + ' · ' + st.txt + '。' + (BREAK_GUARDS[id] || {}).desc + '。',
      opts: [{ k: 'ok', n: '确认兑换', d: '双扣后立即生效' }],
      foot: '取消不会扣任何资源。'
    }, k => { if(k === 'ok') doBuyShop(id, fromEl); });
    return true;
  }
  /* 兼容旧入口：全部收敛到 doBuyShop，防止绕过限购 */
  function exchangeWisdom(id){ return doBuyShop(id); }
  function buyGuard(id){ return doBuyShop(id); }
  /* 商品列表（UI / 测试共用）：带动态价格、限购状态、余额是否足够 */
  function wisdomShop(){
    resetShopWeek();
    return Object.keys(SHOP_CFG.items).map(id => {
      const it = SHOP_CFG.items[id];
      const st = shopLimitState(id);
      const ps = shopPrice(id, 'stone');
      const pw = shopPrice(id, 'wisdom');
      return {
        id, meta: guardMeta(id), desc: (BREAK_GUARDS[id] || {}).desc || '',
        priceStone: ps, priceWisdom: pw,
        sold: st.sold, left: st.left, limitTxt: st.txt,
        enoughStone: ps != null && moneyInt(S.stone) >= ps,
        enoughWisdom: pw != null && moneyInt(S.wisdom) >= pw,
        enough: ps != null && pw != null && moneyInt(S.stone) >= ps && moneyInt(S.wisdom) >= pw
      };
    });
  }
  /* 悟道值获取唯一入口：base × 1.15^境界（与价格同系数，通胀同步）
     调用点仅三处：突破失败 / 每日签到 / 任务领奖 */
  function wisdomGain(base){
    return Math.max(1, Math.floor(base * SHOP_CFG.rankMul(S.rank)));
  }
  /* 突破演出（第三批 B6）：
     成功逐项明涨（境界、修炼速度、战力、寿元上限）＋ 本境新解锁点名；
     失败同样给一页（成功率、顿悟进度、下次加成、反噬），不再只有一行字。
     只读本轮结算前后的真实值，不新算任何数值。 */
  function breakUnlocks(newRank){
    const out = [];
    GONGS.forEach(g => { if((g.unlock | 0) === newRank) out.push('功法【' + g.name + '】可参'); });
    (typeof SECRET_CH !== 'undefined' ? SECRET_CH : []).forEach(ch => {
      if((ch.rank | 0) === newRank) out.push('秘境【' + ch.name + '】已开');
    });
    (typeof DONGTIAN !== 'undefined' ? DONGTIAN : []).forEach(c => {
      if(c.unlock && (c.unlock[0] | 0) === newRank) out.push('洞天【' + c.name + '】可辟');
    });
    return out;
  }
  function showBreak(rBefore, rAfter, info){
    const m = document.getElementById('break-modal');
    if(!m) return;
    info = info || {};
    const t = document.getElementById('b-title');
    const d = document.getElementById('b-desc');
    if(t) t.textContent = '⚡ 突破成功 · ' + RANK_NAMES[S.rank];
    if(d){
      let rows = '';
      rows += '<span class="brk-row"><span>境界</span><b>' + RANK_NAMES[info.rankBefore != null ? info.rankBefore : S.rank - 1] + ' → ' + RANK_NAMES[S.rank] + '</b></span>';
      rows += '<span class="brk-row"><span>修炼速度</span><b>' + fmt1(rBefore) + ' → ' + fmt1(rAfter) + ' / 秒</b></span>';
      if(info.powBefore != null) rows += '<span class="brk-row"><span>战力</span><b>' + fmt(info.powBefore) + ' → ' + fmt(combatPower()) + '</b></span>';
      if(info.lifeBefore != null && isFinite(info.lifeBefore) && lifeOn()){
        const lm = lifeMax();
        /* 本次境界未抬寿元上限时不重复刷一行；只展示真实变化。 */
        if(!isFinite(lm) || lm !== info.lifeBefore){
          rows += '<span class="brk-row"><span>寿元上限</span><b>' + info.lifeBefore + ' → ' + (isFinite(lm) ? lm : '无量') + ' 年</b></span>';
        }
      }
      const un = info.unlocked || [];
      rows += '<span class="brk-unlock"><b>' + (un.length ? '本境新解锁' : '本境新解锁') + '</b>' +
        (un.length ? un.map(x => '<i>・' + x + '</i>').join('') : '<i>・暂无新功能，继续攒修为</i>') + '</span>';
      if(info.gateMs > 0) rows += '<span class="brk-gate">🌫️ 新境初成，须境界闭关 ' + fmtCd(info.gateMs) + '</span>';
      d.innerHTML = rows;
    }
    m.classList.remove('hidden');
  }
  function showBreakFail(info){
    const m = document.getElementById('break-modal');
    if(!m) return;
    info = info || {};
    const t = document.getElementById('b-title');
    const d = document.getElementById('b-desc');
    const ico = document.getElementById('b-ico');
    if(ico) ico.innerHTML = '<img src="ui/icons/ic_bolt.png" alt="">';
    if(t) t.textContent = '💥 突破未成 · 道基未损';
    if(d){
      let rows = '';
      const fbPct = Math.round((info.failBonus || 0) * 1000) / 10;
      /* batch6：失败补偿印章，X 直读真实 failBonus；原大字安抚与拆账保留在下方 */
      rows += '<div class="brk-fail-seal"><span>道心淬炼</span><b>下次渡劫成功率 +' + fbPct + '%</b></div>';
      /* P0.5：第一行大字先安抚——保底收益用本次实际 failBonus */
      rows += '<span class="brk-boon">保底收益 · 下次成功率 +' + fbPct + '%</span>';
      rows += '<span class="brk-row"><span>这一次成功率</span><b>' + (info.guarantee ? '成（必定成功）' : (Math.round(info.p * 1000) / 10) + '%') + '</b></span>';
      rows += '<span class="brk-row"><span>修为反噬</span><b>-' + fmt(info.lose - (info.back || 0)) + (info.back ? '（护心镜挡回 ' + fmt(info.back) + '）' : '') + '</b></span>';
      rows += '<span class="brk-row"><span>顿悟进度</span><b>' + info.insight + ' / ' + WISDOM.full + '</b></span>';
      rows += '<span class="brk-row"><span>下次成功率加成</span><b>+' + fbPct + '%</b></span>';
      if(info.insight >= WISDOM.full) rows += '<span class="brk-unlock"><b>顿悟圆满</b><i>・下次突破必定成功</i></span>';
      else rows += '<span class="brk-unlock"><b>祝福进度</b><i>・再失败 ' + Math.max(1, Math.ceil((WISDOM.full - info.insight) / Math.max(1, WISDOM.perFail))) + ' 次即可顿悟圆满</i></span>';
      d.innerHTML = rows;
    }
    m.classList.remove('hidden');
  }

  /* ---------- 随机奇遇（挂机气泡 → 古风弹窗 → 选项结算） ----------
     流程：tickLoop 每 500ms 调 encTick()，每满 ENC.everySec 秒掷一次 ENC.chance；
     命中则 encSpawn() 生成 bubble → renderEncounter() 显示气泡 → 点气泡 openEncounter() 弹窗
     → 点选项 resolveEncounter(i)：先扣 costStone，再按 roll 掷分支，encApplyFx 统一结算
     → 无论结果如何都清空 bubble（气泡消失）+ 关弹窗 + 落盘 */
  const encBuff = () => (Date.now() < S.encBuff.until ? S.encBuff.mult : 0);
  const encMeta   = id => ENCOUNTERS[id] || null;

  /* 阶段四 C4-1：seen 账本清洗。键只认 ENCOUNTERS 里真实存在的 id（脏键进不来，条数天然有界
     ≤ 奇遇表条数），值只收非空短字符串（自然日键）。旧档无此键 → {}，等价于「今天还没遇过」，零破坏。 */
  function encSeenClean(raw){
    const out = {};
    if(!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    const ids = Object.keys(ENCOUNTERS);
    for(let i = 0; i < ids.length; i++){
      const v = raw[ids[i]];
      if(typeof v === 'string' && v.length > 0 && v.length <= 32) out[ids[i]] = v;
    }
    return out;
  }
  /* 存档清洗：旧档无 enc → 从不判定（t=0 时首次会自动补判定时间） */
  function encClean(o){
    const e = o.enc;
    S.enc = {
      t: isFinite(e && e.t) ? Number(e.t) : 0,
      lastId: typeof (e && e.lastId) === 'string' ? e.lastId : '',
      seen: encSeenClean(e && e.seen),   /* 阶段四 C4-1：跨天不清（值是日期串，比较即过期） */
      bubble: null   /* 气泡不跨会话保留：刷新即失效，避免回来发现错过的过期事件 */
    };
    /* ⚠️ 原写法 `if(!isFinite(e && e.bubble) || !encMeta(e.bubble.id)) S.enc.bubble = null;`
       有致命缺陷：bubble 为 null（绝大多数存档的常态）时 isFinite(null) === true → 短路到右边
       → `null.id` 抛 TypeError，被 load() 的 catch 静默吞成"读档失败"——
       存档里排在 encClean 之后的所有字段（背包/统计/道碑/信匣/主线…）每次刷新都读不回来。
       而两个分支本来就都赋 null（气泡不跨会话保留），条件纯属噪音，删掉。 */
    S.enc.bubble = null;
    const b = o.encBuff || {};
    S.encBuff = {
      mult: isFinite(b.mult) ? Math.max(0, Math.min(5, Number(b.mult))) : 0,
      until: isFinite(b.until) ? Number(b.until) : 0
    };
  }
  /* ============ 三族丹药 buff（第 89 节） ============
     聚灵 / 淬体 / 丰产各占一个槽，互不覆盖，也与奇遇 encBuff 互不覆盖：
     两个都是"独立叠乘"，所以同时吃到一枚聚灵丹和一次奇遇赐福，两层都在。 */
  const danExpBuff = () => (Date.now() < S.danExp.until  ? S.danExp.mult  : 0);
  const danPowPct  = () => (Date.now() < S.danPow.until  ? S.danPow.pct   : 0);
  const danGainPct = () => (Date.now() < S.danGain.until ? S.danGain.pct  : 0);
  function danClean(o){
    const src = (o && typeof o === 'object') ? o : {};
    const one = (raw, field, cap) => {
      const b = (raw && typeof raw === 'object') ? raw : {};
      const v = Number(b[field]);
      return {
        [field]: isFinite(v) ? Math.max(0, Math.min(cap, v)) : 0,
        until: isFinite(b.until) ? Number(b.until) : 0
      };
    };
    S.danExp  = one(src.danExp,  'mult', 5);
    S.danPow  = one(src.danPow,  'pct',  5);
    S.danGain = one(src.danGain, 'pct',  5);
  }
  /* 一炉一枚：服食即起效，BAL.pillDur 秒后自然消散（重新服食只刷新同一槽，不叠加层数） */
  function danTake(fam, d){
    const until = Date.now() + BAL.pillDur * 1000;
    if(fam === 'jl') S.danExp  = { mult: d.mult, until };
    if(fam === 'ct') S.danPow  = { pct:  d.pct,  until };
    if(fam === 'fc') S.danGain = { pct:  d.pct,  until };
  }
  /* 判定入口：每 500ms 调一次，内部自己控频（不足 ENC.everySec 秒直接返回） */
  function encTick(){
    if(!S.enc) encClean({});
    const now = Date.now();
    if(!S.enc.t) { S.enc.t = now; return; }        /* 首帧只对齐时间轴，不判定 */
    /* 已有气泡 → 只做 TTL 到期消散，不重复刷 */
    if(S.enc.bubble){
      if(now - S.enc.bubble.t0 >= ENC.ttlSec * 1000){
        S.enc.bubble = null;
        renderEncounter();
      }
      S.enc.t = now;
      return;
    }
    if(now - S.enc.t < ENC.everySec * 1000) return;
    S.enc.t = now;
    /* 2026-11-19 开局弹层调度：有覆盖层/引导/来访在场时不刷奇遇，等前一个退场 */
    if(document.querySelector('.modal:not(.hidden)')) return;
    try{
      const tb = document.getElementById('taixu-bubble');
      if(tb && tb.style.display !== 'none') return;
    }catch(e){}
    if(npcVisit) return;
    if(Math.random() >= ENC.chance) return;
    /* 阶段四 C4-1：相邻去重（lastId）之上再叠一层「同一自然日不重复」。
       日键取现成的 S.day.key（ensureDay 负责换日），不新增计数字段。
       拿不到日键时只保留相邻去重（fail-open）：宁可重复，也不把整池误锁死让奇遇彻底停摆。
       当天池子抽完 → ids 为空 → 本帧不出奇遇，隔天日键一换自动恢复。 */
    const dayKey = (S.day && typeof S.day.key === 'string') ? S.day.key : '';
    const seen = (S.enc.seen && typeof S.enc.seen === 'object') ? S.enc.seen : {};
    const all = Object.keys(ENCOUNTERS);
    const ids = all.filter(id => {
      if(id === S.enc.lastId && all.length >= 2) return false;
      if(dayKey && seen[id] === dayKey) return false;
      return true;
    });
    if(!ids.length) return;
    const id = ids[Math.floor(Math.random() * ids.length)];
    encSpawn(id);
  }
  /* 刷出一个指定/随机事件气泡（id 省略则随机；测试与调试走这个入口） */
  function encSpawn(id){
    if(!id){
      const ids = Object.keys(ENCOUNTERS);
      id = ids[Math.floor(Math.random() * ids.length)];
    }
    if(!encMeta(id)) return null;
    S.enc.lastId = id;
    /* 阶段四 C4-1：抽中即记当日账。测试/调试强制刷出的那条也记，口径一致（否则强制刷会绕过去重）。 */
    if(!S.enc.seen || typeof S.enc.seen !== 'object') S.enc.seen = {};
    const dk = (S.day && typeof S.day.key === 'string') ? S.day.key : '';
    if(dk) S.enc.seen[id] = dk;
    S.enc.bubble = { id, t0: Date.now() };
    const m = encMeta(id);
    log('❓ 天地间起了一丝异动……（' + m.name + '）', 'gold');
    sfx.score();
    renderEncounter();
    markAsyncDirty();                              /* R8：异步奇遇上屏，强制主面板下一 tick 刷新（日志等耦合态） */
    return S.enc.bubble;
  }
  /* 打开奇遇弹窗（气泡已被点掉，所以先把 bubble 置空防重复开） */
  function openEncounter(id){
    id = id || (S.enc.bubble && S.enc.bubble.id);
    const m = encMeta(id);
    if(!m) return null;
    S.enc.bubble = null;
    renderEncounter();
    const modal = document.getElementById('enc-modal');
    if(!modal) return null;
    document.getElementById('enc-icon').textContent = m.icon;
    document.getElementById('enc-name').textContent = m.name;
    document.getElementById('enc-text').textContent = m.text;
    const box = document.getElementById('enc-opts');
    box.innerHTML = m.opts.map((o, i) => {
      const cost = (o.fx && o.fx.costStone) || 0;
      const lack = cost > 0 && S.stone < cost;
      return '<button class="enc-opt' + (o.risk ? ' risk' : '') + '" data-i="' + i + '"' + (lack ? ' disabled' : '') + '>' +
        '<span>' + o.label + '</span>' +
        (cost ? '<small>' + (lack ? '灵石不足（需 ' + cost + '）' : '−' + cost + ' 灵石') + '</small>' : '<small>' + encOptHint(o) + '</small>') +
        '</button>';
    }).join('');
    if(!box.dataset.bound){
      box.dataset.bound = '1';
      box.addEventListener('click', ev => {
        const b = ev.target.closest('.enc-opt');
        if(!b || b.disabled) return;
        resolveEncounter(S.openEncId, +b.dataset.i);   /* 只管奇遇；历练按钮走内联 onclick（防双结算） */
      });
    }
    S.openEncId = id;
    modal.classList.remove('hidden');
    sfx.pop();
    return m;
  }
  /* 选项上的一句话预览（拿不到分支结果的给确定值） */
  function encOptHint(o){
    const f = o.fx || {};
    if(f.roll) return '结果未知';
    const p = [];
    if(f.wisdom) p.push('悟道值 +' + wisdomGain(f.wisdom));
    if(f.insight) p.push('顿悟 +' + f.insight);
    if(f.stone) p.push('灵石 +' + f.stone);
    if(f.boost) p.push('修炼 ×' + (1 + f.boost.mult).toFixed(2) + ' / ' + Math.round(f.boost.sec / 60) + ' 分');
    return p.join(' · ') || '只留一段见闻';
  }
  function closeEncounter(){
    const modal = document.getElementById('enc-modal');
    if(modal) modal.classList.add('hidden');
    S.openEncId = '';
    advEv = null;      /* 弹窗是历练与奇遇共用的，关窗即清冒险态 */
  }
  /* 结算：roll 分支先掷，再统一 encApplyFx，最后必然清气泡 + 关窗 */
  function resolveEncounter(id, i){
    const m = encMeta(id);
    if(!m) { closeEncounter(); return null; }
    const o = m.opts[i];
    if(!o) return null;
    let fx = Object.assign({}, o.fx || {});
    delete fx.roll;
    let detail = o.ok || '';
    if(o.fx && o.fx.roll && o.fx.roll.length){
      const total = o.fx.roll.reduce((a, b) => a + b.w, 0);
      let r = Math.random() * total, hit = o.fx.roll[o.fx.roll.length - 1];
      for(const br of o.fx.roll){ r -= br.w; if(r <= 0){ hit = br; break; } }
      fx = Object.assign({}, hit.fx || {});
      detail = hit.text || '';
    }
    S.enc.bubble = null;
    /* A11/A91：分支结果叙述（含反噬原因）此前只随返回值丢掉，玩家点完选项只看到
       几条数值日志、不知道发生了什么。这里把它也写进日志，与收益同屏可见。 */
    if(detail) log('📖 ' + detail, 'sys');
    const gained = encApplyFx(fx);
    closeEncounter();
    render();
    save();
    return { id, i, detail, gained };
  }
  /* 唯一结算出口：返回给前端/日志用的结果描述数组 */
  function encApplyFx(fx){
    fx = fx || {};
    const need = needOf(S.rank), out = [];
    if(fx.costStone){ S.stone = Math.max(0, S.stone - fx.costStone); out.push('灵石 −' + fx.costStone); }
    if(fx.stone){ S.stone += Math.floor(fx.stone); out.push('灵石 +' + Math.floor(fx.stone)); }
    if(fx.wisdom){ const w = wisdomGain(fx.wisdom); S.wisdom += w; out.push('悟道值 +' + w); }
    if(fx.insight){
      const before = S.insight;
      S.insight = Math.min(WISDOM.full, before + fx.insight);
      out.push('顿悟进度 +' + (S.insight - before));
      if(S.insight >= WISDOM.full) out.push('（已圆满，下次突破必成）');
    }
    if(fx.exp){ const e = need * fx.exp; const got = addActiveExp(e); out.push('修为 +' + fmt(got)); }
    if(fx.expLoss){
      const l = Math.min(S.exp, need * fx.expLoss);
      S.exp -= l;
      out.push('修为 −' + fmt(l));
      /* 反噬扣修为：若身上有护心镜，按突破失败同款口径返还一部分 */
      if(l > 0 && S.guardMirror > 0){
        S.guardMirror--; const back = Math.floor(l * 0.5);
        S.exp += back; out.push('护心镜挡下：修为返还 +' + fmt(back));
      }
    }
    if(fx.boost && fx.boost.mult){
      S.encBuff = { mult: fx.boost.mult, until: Date.now() + fx.boost.sec * 1000 };
      out.push('修炼 ×' + (1 + fx.boost.mult).toFixed(2) + ' 生效 ' + Math.round(fx.boost.sec / 60) + ' 分钟');
    }
    out.forEach(t => log(t, t.indexOf('−') >= 0 ? 'bad' : 'good'));
    return out;
  }
  /* 气泡显隐（随 render 走；弹窗本身只在 open/close 时动，避免被全量重绘打掉） */
  function renderEncounter(){
    const b = document.getElementById('enc-bubble');
    if(!b) return;
    const bub = S.enc.bubble;
    const m = bub && encMeta(bub.id);
    if(!m){ b.classList.add('hidden'); b.classList.remove('pulse'); return; }
    b.classList.remove('hidden');
    b.classList.add('pulse');          /* 重播涟漪动画（重绘时重置） */
    b.dataset.id = bub.id;
    const ic = b.querySelector('.enc-bubble-ico');
    if(ic) ic.textContent = m.icon;
    const nm = b.querySelector('.enc-bubble-name');
    if(nm) nm.textContent = m.name;
  }
  /* 绑定：气泡点击 + 遮罩/关闭键（一次性，dataset.bound 守卫） */
  function bindEncounterUI(){
    const b = document.getElementById('enc-bubble');
    if(b && !b.dataset.bound){
      b.dataset.bound = '1';
      b.addEventListener('click', () => { sfx.click(); openEncounter(); });
    }
    const modal = document.getElementById('enc-modal');
    if(modal && !modal.dataset.bound){
      modal.dataset.bound = '1';
      modal.addEventListener('click', ev => { if(ev.target === modal) closeEncounter(); });
    }
    const x = document.getElementById('enc-close');
    if(x && !x.dataset.bound){ x.dataset.bound = '1'; x.addEventListener('click', closeEncounter); }
  }

  /* ---------- 历练 · 文字冒险（复用奇遇古风弹窗 #enc-modal） ---------- */
  let advEv = null;     /* 当前抽中的事件对象（null = 弹窗当前不是冒险态） */
  let advFoeCur = null; /* batch6 补1：开事件时先定对手，选项前就能看到战力与差距 */
  let advStage = 0;     /* 0=选选项 1=已出结果（此时点「继续赶路」关窗） */
  let advResult = null; /* { text, detail } 结果页文案 */
  /* 对手：从玩家境界可达的妖兽里随机抽（BEASTS.power 已 ×POW_K，与战力同刻度） */
  function advFoe(){
    const can = BEASTS.filter(b => b.rank <= S.rank);
    return can[Math.floor(Math.random() * can.length)] || BEASTS[0];
  }
  /* 点【历练】（act('train')）：随机抽一个事件，弹古风对话框 */
  function openAdventure(){
    const ev = ADV_EVENTS[Math.floor(Math.random() * ADV_EVENTS.length)];
    if(!ev) return null;
    advEv = ev; advFoeCur = advFoe(); advStage = 0; advResult = null;
    S.enc.bubble = null;            /* 若奇遇气泡在场，先收掉，弹窗一次只讲一个故事 */
    renderEncounter();
    renderAdventure();
    const modal = document.getElementById('enc-modal');
    if(modal) modal.classList.remove('hidden');
    sfx.pop();
    return ev;
  }
  function renderAdventure(){
    const ev = advEv;
    if(!ev) return;
    /* 判空：四个元素任一缺失就直接放弃本次渲染，不要抛进 tickLoop
       （此前是本文件唯一未做判空的渲染函数，模板改名就会把异常抛到主循环） */
    const box = document.getElementById('enc-opts');
    const iconEl = document.getElementById('enc-icon');
    const nameEl = document.getElementById('enc-name');
    const textEl = document.getElementById('enc-text');
    if(!box || !textEl) return;
    if(iconEl) iconEl.innerHTML = inkIco('⚔️');
    if(nameEl) nameEl.textContent = '历练 · 山野遭逢';
    if(advStage === 0){
      const foe = advFoeCur || (advFoeCur = advFoe());
      const cp = combatPower();
      const gap = arenaGapText(cp, foe.power).replace(/<[^>]*>/g, '');
      const edge = cp >= foe.power ? '占优' : ('差 ' + fmt(foe.power - cp) + ' 战力');
      /* 补1：选项前明示敌方战力 + 差距解读（口径与论剑台同一函数） */
      textEl.textContent = ev.desc + ' 对手【' + foe.name + '】战力 ' + fmt(foe.power) + '；' + gap + '。';
      /* 内联 onclick 直连全局 handleAdventureChoice：不依赖 #enc-opts 的委托绑定
         （委托只在奇遇路径 openEncounter 里绑过，直接历练的玩家会踩漏绑，见 2026-10-20 修复） */
      box.innerHTML = ev.options.map((o, i) =>
        '<button class="enc-opt' + (o.action === 'battle' ? ' risk' : '') + '" data-i="' + i + '"' +
        ' onclick="handleAdventureChoice(' + i + ', event)">' +
        '<span>' + o.text + '</span>' +
        '<small>' + (o.action === 'battle'
          ? '对战 ' + foe.name + ' · 战力 ' + fmt(foe.power) + ' · ' + edge
          : '明哲保身 · 修为 +' + fmt(advEscapeExp())) + '</small>' +
        '</button>').join('');
    }else{
      textEl.textContent = advResult.text;
      box.innerHTML =
        '<button class="enc-opt" data-i="0" onclick="handleAdventureChoice(0, event)">' +
        '<span>继续赶路</span><small>' + advResult.detail + '</small></button>';
    }
  }
  /* 选项结算：battle = 战力对决（双方 ±15% 临场发挥，同论剑口径）；escape = 平安 */
  function resolveAdventure(i){
    const ev = advEv;
    if(!ev) return null;
    if(advStage === 1){ closeEncounter(); advEv = null; return null; }   /* 结果页点「继续赶路」= 关窗 */
    const opt = ev.options[i];
    if(!opt) return null;
    let text = '', detail = '', win = null;
    if(opt.action === 'battle'){
      const foe = advFoeCur || (advFoeCur = advFoe());
      const my = combatPower() * (0.85 + Math.random() * 0.30);   /* 临场发挥 ±15%，同论剑口径 */
      const op = foe.power * (0.85 + Math.random() * 0.30);
      win = my >= op;
      if(win){
        const winStone = advWinStone();
        S.stone += winStone;
        S.stats.stoneEarned += winStone;
        text = '⚔️ 斩获妖兽，获得 ' + winStone + ' 灵石！';
        detail = '力挫【' + foe.name + '】，拾其巢穴得灵石 +' + winStone;
        log('⚔️ 历练·' + ev.options[i].text + '：斩获【' + foe.name + '】，灵石 +' + winStone, 'good');
        const eqd = advEqDrop();
        if(eqd){
          text += ' 拾得【' + eqd.name + '】。';
          detail += ' · 拾得【' + eqd.name + '】（战力 +' + eqd.power + '）';
        }
        sfx.win();
      }else{
        const loss = Math.min(advLossExp(), Math.floor(S.exp));
        S.exp -= loss;
        text = '🩸 不敌妖兽，损失 ' + loss + ' 修为。';
        detail = '【' + foe.name + '】凶悍远超意料，拖伤而退';
        log('⚔️ 历练·' + ev.options[i].text + '：不敌【' + foe.name + '】，修为 −' + loss, 'bad');
        sfx.hit();
      }
    }else{
      const gotEsc = addActiveExp(advEscapeExp());
      text = '🌿 绕道而行，有惊无险。';
      detail = '避开锋芒，心境澄明（修为 +' + fmt(gotEsc) + '）';
      log('🌿 历练·' + ev.options[i].text + '：绕行避祸，修为 +' + fmt(gotEsc), 'sys');
      sfx.pop();
    }
    advStage = 1;
    advResult = { text, detail };
    render();        /* 刷新顶部资源栏（灵石/修为 chip） */
    save();
    renderAdventure();
    return { evId: ev.id, action: opt.action, win, text };
  }
  /* 全局点击入口（按钮内联 onclick 直连，杜绝委托漏绑）：
     - stopPropagation 防止冒泡到 #enc-opts 的旧委托（奇遇绑定过时会对同一击双结算）
     - try/catch 兜底：任何异常都记日志、清冒险态并强制关窗，绝不把玩家卡在弹窗里 */
  function handleAdventureChoice(i, ev){
    if(ev && ev.stopPropagation) ev.stopPropagation();
    try{
      resolveAdventure(i | 0);
    }catch(err){
      try{ log('历练结算异常：' + (err && err.message || err) + '，已为你关闭弹窗。', 'bad'); }catch(x){}
      advEv = null; advStage = 0; advResult = null;
      closeEncounter();
      save();
    }
  }
  window.handleAdventureChoice = handleAdventureChoice;   /* 内联 onclick 从全局作用域查找 */

  /* ---------- 炼丹 / 炼器 / 背包 ---------- */
  const BAG_BASE = 20;    /* 基础背包容量 */
  const BAG_CAP = 50;     /* 储物袋扩到上限 */
  const BAG_STEP = 5;     /* 每个储物袋 +5 格 */
  const BAG_BAG_COST = 2; /* 储物袋价格 = need × 2（随境界涨） */
  const ITEMS = {
    dan1:  { n: '下品破境丹', img: 'ui/icons/dan1.png',  cls: '',
      usage: '突破专用丹药：服食后自身突破成功率 +5%（10 分钟），并立得修为',
      source: '炼丹房炼就（灵草 5 + 灵石 20）或坊市购入',
      description: '草庐散修最常服食的寻常丹药，蕴一丝草木灵气，凡夫俗子食之可延年益寿，初入道者食之可添几分修为。' },
    dan_juqi: { n: '下品聚气丹', img: 'ui/icons/dan1.png', cls: '',
      /* 阶段二 N12-3：引导改赠 dan1 后，此丹不再发放；老档里留存的作纪念，明确不可服食 */
      usage: '旧日入门纪念丹药（现已不可服食，仅可丢弃）',
      source: '太虚真人旧日相赠（新档已改赠下品破境丹）',
      description: '一枚温润的青色丹丸，裹着极淡的草木清气。太虚真人说路上捡的，让你留着——尤其别跟后山那位提。' },
    dan2:  { n: '中品破境丹', img: 'ui/icons/dan2.png',  cls: 'good',
      usage: '突破专用丹药：服食后自身突破成功率 +10%（10 分钟），并立得修为',
      source: '炼丹房炼就（灵草 15 + 百年灵草 1 + 灵石 80），亦可猎妖得妖丹代灵草炼出',
      description: '丹成之时有淡淡灵光流转，入口即化，药力绵长。筑基期修士服之，可固本培元，于破境之时多添三分把握。' },
    dan3:  { n: '上品破境丹', img: 'ui/icons/dan3.png',  cls: 'gold',
      usage: '突破专用丹药：服食后自身突破成功率 +15%（10 分钟），并立得大量修为',
      source: '炼丹房炼就（灵草 40 + 百年灵草 2 + 灵石 300），亦可签到周大奖、坊市购入',
      description: '上品丹药出炉之际，常有异象伴生。药性醇厚雄浑，金丹期修士服之，可壮神魂、培道基，于闭关破境前服下，事半功倍。' },
    dan4:  { n: '极品破境丹', img: 'ui/icons/dan4.png', cls: 'gold',
      usage: '突破专用丹药：服食后自身突破成功率 +30%（10 分钟），并立得修为',
      source: '丹房炼就（万年灵草 1 + 魔晶 1 + 灵石 2000）',
      description: '取万年灵草之精，辅以高阶魔晶炼成，出炉时满室生辉。炼虚期修士服之，可抵数十年苦修，破境之机大增。' },
    dan5:  { n: '大乘破境丹', img: 'ui/icons/dan5.png', cls: 'gold',
      usage: '突破专用丹药：服食后自身突破成功率 +35%（10 分钟），并立得修为',
      source: '丹房炼就（万年灵草 2 + 九尾心 1 + 灵石 8000）',
      description: '此丹已成通灵之物，丹成之日有九霄雷鸣相助。大乘期真人闭关破境，非此丹不可，一枚可抵一世机缘。' },
    herb100:   { n: '百年灵草', img: 'ui/icons/herb100.png', cls: 'good',
      usage: '高阶炼丹材料，极品以上破境丹之基',
      source: '宗门探索秘境概率采得',
      description: '生于灵脉深处的百年老药，根须已如玉。散修偶得，便可换得数年修行资源。' },
    herb10000: { n: '万年灵草', img: 'ui/icons/herb10000.png', cls: 'gold',
      usage: '顶级炼丹材料，极品/大乘破境丹必用',
      source: '高境界探索秘境或大乘期秘境产出',
      description: '一株灵草吸尽一方灵脉之气，万年方成，有价无市。得之者，往往便是一段仙缘的开端。' },
    /* 妖兽材料：猎妖掉落，可卖灵石、可炼丹/炼器 */
    mat_core:    { n: '妖丹', img: 'ui/icons/mat_core.png',    cls: '',    sell: 30,
      usage: '炼丹材料（可代灵草炼中品丹药），亦可于坊市寄售换取灵石',
      source: '镇妖塔/灵兽园猎妖所得（炼气期低阶妖兽）',
      description: '低阶妖兽体内凝结的内丹，尚存一丝未散的灵气。可入丹入药，亦可直接变卖——是散修最易得的家当。' },
    mat_bone:    { n: '兽骨', img: 'ui/icons/mat_bone.png',    cls: '',    sell: 80,
      usage: '炼器/炼丹辅材，亦可寄售换灵石',
      source: '镇妖塔/灵兽园猎妖所得（筑基期灵兽）',
      description: '灵兽之骨，坚硬胜铁，内蕴精元。可为炼器添几分灵性，亦可入药为引，于坊市之中颇受散修青睐。' },
    mat_feather: { n: '仙羽', img: 'ui/icons/mat_feather.png', cls: 'good', sell: 200,
      usage: '炼器/炼丹珍稀辅材，亦可寄售',
      source: '镇妖塔/秘境挑战所得（金丹期灵禽）',
      description: '金丹期灵禽脱落的羽毛，轻若无物，浮而不沉。落入手中有清风拂面之感，乃炼器炼丹之上品辅材。' },
    mat_eye:     { n: '魔晶', img: 'ui/icons/mat_eye.png',     cls: 'gold', sell: 500,
      usage: '炼器/炼丹极珍辅材，亦可寄售（高价）',
      source: '镇妖塔高阶/九霄天域秘境（元婴期以上大妖）',
      description: '大妖目中所凝之晶，幽光内敛，望之令人神魂一凛。一枚可抵寻常散修半岁之资，炼器炼丹皆为上品。' },
    /* Boss 稀有材料：兽王掉落，为装备强化做准备 */
    boss_core:    { n: '兽王精魄', img: 'ui/icons/boss_core.png',    cls: 'gold', sell: 200,
      usage: '法宝强化 +5 起必用，亦可法宝洗练替代材料',
      source: '击杀炼气期 Boss「妖虎·兽王」首通掉落',
      description: '妖虎兽王身殒后残余的一缕精魄，犹带百兽之王之威。入器可令法宝灵性大增，炼化之难非寻常修士能解。' },
    boss_pearl:   { n: '蛟龙珠',   img: 'ui/icons/boss_pearl.png',    cls: 'gold', sell: 800,
      usage: '法宝强化 +10 起必用，亦可法宝洗练替代材料',
      source: '击杀筑基期 Boss「蛟龙·妖王」首通掉落',
      description: '蛟龙千年道行所凝之珠，内蕴水泽精华。持之可感江海之息，炼入法宝可使器物自生寒霜，灵异非常。' },
    boss_feather: { n: '朱雀羽',   img: 'ui/icons/boss_feather.png', cls: 'gold', sell: 3000,
      usage: '法宝强化 +15 起必用，亦可法宝洗练替代材料',
      source: '击杀金丹期 Boss「朱雀·仙灵」首通掉落',
      description: '南方朱雀一族之翎羽，色如朝霞，触之生温。炼入法宝可令器身自生南明离火之势，乃金丹修士梦寐以求之物。' },
    boss_heart:   { n: '九尾心',   img: 'ui/icons/boss_heart.png',     cls: 'gold', sell: 10000,
      usage: '法宝强化 +20 顶级材料，亦可法宝洗练替代材料',
      source: '击杀元婴期 Boss「九尾妖狐」首通掉落',
      description: '九尾妖狐千年修行之心，蕴含幻化万象之道。炼入法宝可使器物通灵，攻防之间自有神鬼莫测之机。' },
    mat_marrow:   { n: '神兽之髓', img: 'ui/icons/mat_marrow.png',    cls: 'gold', sell: 25000,
      usage: '法宝洗练顶级替代材料（1 抵 5 魔晶），亦可寄售（高价）',
      source: '猎杀合体期以上神兽掉落（镇妖塔深处）',
      description: '神兽骨髓中凝出的本源精华，温润如玉、坚逾金铁。握之可闻龙吟隐隐，一滴便可令顽铁生灵，乃炼器师梦寐以求的顶级宝材。' }

    /* ---- 装备：slot=槽位（weapon/armor/accessory），power=提供的战力（加法计入总战力） ---- */
    ,eq_qingfeng:  { n: '青锋剑', img: 'ui/icons/weapon1.png', cls: '', slot: 'weapon', power: 500, sell: 200,
      usage: '装备后总战力 +500（武器槽）',
      source: '匠道炼器所出，坊市亦有售',
      description: '寻常制式的青钢长剑，剑脊一道血槽，寒光凛凛。虽非神兵利器，却是散修行路防身的第一件家当。' },
    eq_chixiao:    { n: '赤霄剑', img: 'ui/icons/weapon2.png', cls: 'good', slot: 'weapon', power: 1800, sell: 900,
      usage: '装备后总战力 +1800（武器槽）',
      source: '匠道高阶炼制，需赤铁精英',
      description: '剑身隐隐透出赤色纹路，出鞘时有低沉龙吟。据说此剑曾斩过一头筑基期妖鳄，锋芒至今未减。' },
    eq_huxin:      { n: '照胆镜', img: 'ui/icons/mat_eye.png', cls: '', slot: 'armor', power: 400, sell: 180,
      usage: '装备后总战力 +400（防具槽）',
      source: '镇妖塔第 3 层首通掉落；历练亦有几率拾得',
      description: '一面巴掌大的铜镜，悬于胸前护住心口。镜面磨得发亮，据说能照出妖物原形，关键时刻可挡致命一击。' },
    eq_xuangui:    { n: '玄龟甲', img: 'ui/icons/ore.png', cls: 'good', slot: 'armor', power: 1500, sell: 800,
      usage: '装备后总战力 +1500（防具槽）',
      source: '取千年玄龟背甲炼制',
      description: '漆黑厚重的龟甲胸镜，表面天然生着水波纹路。披在身上沉如山岳，寻常刀剑砍上去只留一道白痕。' },
    eq_yupei:      { n: '养元玉佩', img: 'ui/icons/stone.png', cls: '', slot: 'accessory', power: 300, sell: 150,
      usage: '装备后总战力 +300（饰品槽）',
      source: '宗门长老所赐，坊市亦有售',
      description: '一枚温润的白玉佩，贴身佩戴久了会随体温微微发热。出入山野时可定心神，不至为瘴气所侵。' },
    eq_lingzhu:    { n: '聚灵珠', img: 'ui/icons/mat_feather.png', cls: 'good', slot: 'accessory', power: 1200, sell: 700,
      usage: '装备后总战力 +1200（饰品槽）',
      source: '灵兽内丹辅以聚灵阵炼成',
      description: '鸽卵大小的一颗灵珠，内里似有云雾流转不息。携之打坐，周遭灵气自会缓缓向体内汇聚，事半功倍。' }
  };
  /* rv4 新增六件装备：三槽各两件，沿用加法通道；固定寄售价按 power×0.5 四舍五入。
     独立表只做加法，不改旧六件装备、旧寄售额度与转世遗物候选。 */
  const RV4_EQUIP_ROWS = [
    { id:'eq_jiaoji', name:'蛟脊枪', slot:'weapon', power:9731, sell:4866, reqLv:5, reqM:3, rate:0.35, ore:200, stone:700,
      img:'ui/icons/weapon2.png', cls:'good', mats:[['matb_dragon',3],['matb_qilin',3]], desc:'蛟脊为杆，麒麟竭为锋，沉稳处自见杀意。' },
    { id:'eq_mangwen',name:'蟒纹甲', slot:'armor', power:73895, sell:36948, reqLv:5, reqM:3, rate:0.35, ore:200, stone:700,
      img:'ui/icons/ore.png', cls:'good', mats:[['matb_bat',3],['matb_snake',3]], desc:'蝠齿扣合，蛇蜕织纹，贴身如一层无声水幕。' },
    { id:'eq_zhusi', name:'蛛丝绦', slot:'accessory', power:73895, sell:36948, reqLv:5, reqM:3, rate:0.35, ore:200, stone:700,
      img:'ui/icons/mat_feather.png', cls:'good', mats:[['matb_spider',3],['matb_scorpion',3]], desc:'蛛丝为经，蝎针为坠，束住周身浮动的灵气。' },
    { id:'eq_yinglong',name:'应龙戟',slot:'weapon', power:841706,sell:420853,reqLv:8, reqM:5, rate:0.24, ore:700, stone:6000,
      img:'ui/icons/weapon3.png', cls:'gold', mats:[['matb_hundun',10],['matb_goldencrow',10]], desc:'混沌胚壳藏于戟脊，金乌翎燃起一线赤金。' },
    { id:'eq_molin', name:'墨麟铠', slot:'armor', power:841706,sell:420853,reqLv:8, reqM:5, rate:0.24, ore:700, stone:6000,
      img:'ui/icons/weapon1.png', cls:'gold', mats:[['matb_baize',8],['matb_xiezhi',8]], desc:'白泽毛理气息，獬豸角断邪祟，墨纹层层如夜山。' },
    { id:'eq_baize',name:'白泽佩', slot:'accessory',power:841706,sell:420853,reqLv:8, reqM:5, rate:0.24, ore:700, stone:6000,
      img:'ui/icons/stone.png', cls:'gold', mats:[['matb_taotie',10],['matb_zhulong',10]], desc:'饕餮齿为骨，烛龙睛为魂，通灵而不外露。' }
  ];
  const RV4_EQUIP_BY_ID = {};
  RV4_EQUIP_ROWS.forEach(e => {
    e.mats = [{ t:'ore', n:e.ore }].concat(e.mats.map(m => ({ t:m[0], n:m[1] })), [{ t:'stone', n:e.stone }]);
    e.tier = e.reqLv >= 8 ? 4 : 3;
    e.recipeId = e.id;
    RV4_EQUIP_BY_ID[e.id] = e;
    ITEMS[e.id] = { n:e.name, img:e.img, cls:e.cls, slot:e.slot, power:e.power, sell:e.sell, rv4Equip:true,
      usage:'装备后总战力 +' + fmt(e.power) + '（' + SLOT_NAME[e.slot] + '槽）',
      source:'炼器坊专属配方所出；可寄售，不进转世遗物候选',
      description:e.desc };
    RECIPES[e.id] = { recipeId:e.id, bld:'forge', name:e.name, reqLv:e.reqLv, reqM:e.reqM,
      rate:e.rate, out:e.id, img:e.img, cls:e.cls, mats:e.mats, note:e.desc,
      tier:e.tier, rv4:true, rv4Equip:true };
  });
  /* ---------- 交易反馈（2026-10-24）----------
     花钱要看得见：购买/升级原来只有日志一行 + 数字变化，刷新货架甚至没声音。
     三件套（全部复用既有模式，零新图片零数值改动）：
     ① 花费浮字 spendFloat：素墨「-N 灵石」从按钮飘起——花费不是收获，不上品质色；
     ② 行脉冲 flashEl：reflow 重触发技巧（同 btRestartAnim），坊市购入行 / 设施行金晕一次；
     ③ 天机阁购得走 showTreasure 珍宝揭晓（限购稀缺 + 双扣大额，对得起这笔花费）。 */
  /* 花费浮字：从花费按钮上方飘起的「-N 灵石」
     锚定跟随：点击后重绘会让内容/内层滚动位置变化，按钮随之位移，
     一次性算的固定坐标会让浮字脱钩飘到别的面板上。
     故监听捕获阶段的 scroll/resize 重定位（内层滚动不冒泡，必须用捕获），
     并用 rAF 做浏览器内的平滑跟随。 */
  /* 同一时刻只留一枚花费浮字。
     背景：buy() 一类动作会被连点，900ms 内连点 3 次就会同时挂 3 份 40ms 轮询
     与 6 个 document/window 级监听（都靠 900ms 后的 timeout 自清）。
     新的出现时先把上一枚就地结算掉，并发上限压到 1。 */
  let spendFloatCleanup = null;
  function spendFloat(txt, fromEl, cls){
    if(!fromEl || !fromEl.getBoundingClientRect) return;
    if(spendFloatCleanup){ try{ spendFloatCleanup(); }catch(e){} spendFloatCleanup = null; }
    const anchor = fromEl;
    const sp = document.createElement('div');
    sp.className = 'spend-float' + (cls ? ' ' + cls : '');
    sp.textContent = txt;
    document.body.appendChild(sp);
    const w = sp.offsetWidth || 80;
    let dead = false;
    const place = () => {
      if(dead) return;
      const r = anchor.getBoundingClientRect();
      if(!r || (!r.width && !r.height)){
        /* batch6 补单：锚点被面板/弹窗藏起来时（如背包页顶栏不可见），
           旧写法直接 display:none → 玩家看不到飘字。改为落在视口中上部，至少让反馈可见。 */
        sp.style.display = '';
        sp.style.left = ((window.innerWidth || 690) / 2) + 'px';
        sp.style.top = Math.max(84, (window.innerHeight || 900) * 0.30) + 'px';
        return;
      }
      sp.style.display = '';
      /* 贴边夹取：按钮常在面板右侧，浮字居中会溢出视口被裁掉 */
      let x = r.left + r.width / 2;
      x = Math.max(w / 2 + 6, Math.min(x, (window.innerWidth || 690) - w / 2 - 6));
      sp.style.left = x + 'px';
      sp.style.top = (r.top - 4) + 'px';
    };
    const onScroll = () => place();
    document.addEventListener('scroll', onScroll, true);   /* 捕获阶段：内层滚动也会触发 */
    window.addEventListener('resize', onScroll);
    /* 定时跟随：点击后重绘会让行高/内容变化（不一定伴随滚动事件），
       按钮随之位移；rAF 在无合成帧的环境（headless 截图）不触发，故用定时器兜底 */
    const timer = setInterval(place, 40);
    place();
    const cleanup = () => {
      if(dead) return;
      dead = true; clearInterval(timer);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      try{ sp.remove(); }catch(e){}
      if(spendFloatCleanup === cleanup) spendFloatCleanup = null;
    };
    spendFloatCleanup = cleanup;
    setTimeout(cleanup, 900);
  }
  /* batch6：正向飘字复用同一套浮字（服丹生效 / 喂食经验），只换一个颜色 class */
  function gainFloat(txt, fromEl){ spendFloat(txt, fromEl, 'gain'); }
  function flashEl(el, cls){
    if(!el) return;
    el.classList.remove(cls || 'flash');
    void el.offsetWidth;            /* 强制 reflow，让同名动画可重复触发 */
    el.classList.add(cls || 'flash');
  }
  /* ============ 坊市（每日货架 + 寄售行情，对标一念逍遥的交易行） ============ */
  /* 货架商品池：售价 = 当前境界需求 × k × 今日买入行情；rank = 解锁境界 */
  const MARKET_POOL = [
    { id:'herb',  kind:'res',  name:'灵草 ×20', img:'ui/icons/herb.png',            k:0.25, rank:0,  desc:'灵田产出不够时的补给' },
    { id:'ore',   kind:'res',  name:'矿石 ×20', img:'ui/icons/ore.png',             k:0.30, rank:0,  desc:'炼器缺料时的补给' },
    { id:'dan1',  kind:'item', name:'下品丹药', item:'dan1', img:'ui/icons/dan1.png', k:0.40, rank:0,  desc:'加修为、提升突破率' },
    { id:'dan2',  kind:'item', name:'中品丹药', item:'dan2', img:'ui/icons/dan2.png', k:1.00, rank:6,  desc:'加修为、提升突破率' },
    { id:'dan3',  kind:'item', name:'上品丹药', item:'dan3', img:'ui/icons/dan3.png', k:3.00, rank:12, desc:'加修为、提升突破率' },
    /* 第 89 节：三族新丹各上一枚中阶货，让「聚灵 / 淬体 / 丰产」在坊市里也认得出来。
       文案不写具体百分比——数值只有 DAN_FX 一处，面板上的数字由 ITEMS.usage 现取 */
    { id:'fc3',   kind:'item', name:'催生丹', item:'fc3', img:'ui/icons/dan_fc.png', k:1.60, rank:9,  desc:'丰产族三阶：一段时间内采药与矿产出大增' },
    { id:'jl3',   kind:'item', name:'灵犀丹', item:'jl3', img:'ui/icons/dan_jl.png', k:1.80, rank:12, desc:'聚灵族三阶：一段时间内修炼速度提升' },
    { id:'ct4',   kind:'item', name:'龙筋丹', item:'ct4', img:'ui/icons/dan_ct.png', k:2.40, rank:15, desc:'淬体族四阶：一段时间内战力提升' },
    { id:'mat_core',    kind:'item', name:'妖丹', item:'mat_core',    img:'ui/icons/mat_core.png',    k:0.60, rank:3,  desc:'可炼丹、可再卖' },
    { id:'mat_bone',    kind:'item', name:'兽骨', item:'mat_bone',    img:'ui/icons/mat_bone.png',    k:1.20, rank:9,  desc:'可炼丹、可再卖' },
    { id:'mat_feather', kind:'item', name:'仙羽', item:'mat_feather', img:'ui/icons/mat_feather.png', k:3.00, rank:12, desc:'可炼丹、可再卖' },
    { id:'mat_eye',     kind:'item', name:'魔晶', item:'mat_eye',     img:'ui/icons/mat_eye.png',     k:6.00, rank:15, desc:'可炼丹、可再卖' },
    { id:'bag',   kind:'bag',  name:'储物袋', ico:'🎒', k:2.00, rank:0, desc:'背包 +5 格（上限 50）' },
    { id:'egg',   kind:'egg',  name:'妖兽蛋', ico:'🥚', k:1.50, rank:0, desc:'随机一枚妖兽蛋' }
  ];
  /* 寄售基准价 = 需求 × k（丹药 / 妖兽材料 / Boss 稀有材料，越稀有越值钱） */
  const SELL_K = { dan1:0.20, dan2:0.50, dan3:1.20,
    mat_core:0.30, mat_bone:0.60, mat_feather:1.50, mat_eye:3.00, mat_marrow:8.00,
    boss_core:1.00, boss_pearl:2.50, boss_feather:6.00, boss_heart:12.0 };

  /* rv4 数据层：43 味妖兽专属料。名称逐字取 B 稿终表；旧通用料/Boss 料与旧掉落表不动。
     本批先落物品与寄售元数据，不改背包容量、坊市货架或存档结构。 */
  const RV4_MATS = [
    { id:'matb_rat', beast:'rat', tier:1, n:'鼠须', img:'ui/icons/beast_rat.png', rate:0.06, sellK:0.18,
      desc:'妖鼠颊边两根长须，夜行不触一物。分捻入药，可行气于精微之处。' },
    { id:'matb_crow', beast:'crow', tier:1, n:'鸦翎', img:'ui/icons/beast_crow.png', rate:0.06, sellK:0.18,
      desc:'妖鸦尾上一根黑翎，向日不反光。修士用它扫丹炉浮灰，也用它写没人认得的符。' },
    { id:'matb_toad', beast:'toad', tier:1, n:'蟾酥', img:'ui/icons/mat_core.png', rate:0.06, sellK:0.18,
      desc:'妖蟾眉间凝出的一层白霜，舔之舌麻。入药能镇心安神，用多了便是毒。' },
    { id:'matb_boar', beast:'boar', tier:1, n:'豕牙', img:'ui/icons/beast_boar.png', rate:0.06, sellK:0.18,
      desc:'妖豕拱山的两颗獠牙，牙根还带着泥。磨粉可引气下行，入器添一分蛮力。' },
    { id:'matb_ox', beast:'ox', tier:1, n:'牛黄', img:'ui/icons/beast_ox.png', rate:0.06, sellK:0.18,
      desc:'妖牛胆囊里结成的一块黄垢，一具只得一指许。镇惊开窍，是低阶丹里最稳的佐使。' },
    { id:'matb_croc', beast:'croc', tier:1, n:'鳄甲', img:'ui/icons/beast_croc.png', rate:0.06, sellK:0.18,
      desc:'妖鳄脊上脱落的一片冷甲，纹路如水。炼入器胎可挡一击，入药取其沉。' },
    { id:'matb_wolf', beast:'wolf', tier:1, n:'狼毫', img:'ui/icons/beast_wolf.png', rate:0.06, sellK:0.18,
      desc:'妖狼颈后一撮硬毫，月满时最盛。束而为笔能画符，入药可提气破滞。' },
    { id:'matb_leopard', beast:'leopard', tier:1, n:'豹胆', img:'ui/icons/beast_leopard.png', rate:0.06, sellK:0.18,
      desc:'妖豹一身精气聚在一只胆上，小如豆，苦入骨。服之胆壮，出手也沉。' },
    { id:'matb_eagle', beast:'eagle', tier:1, n:'鹰爪', img:'ui/icons/beast_eagle.png', rate:0.06, sellK:0.18,
      desc:'妖鹰搏石留下的四枚爪尖，风干了仍带腥。研末可强筋，炼器取其透。' },
    { id:'matb_bear', beast:'bear', tier:1, n:'熊髓', img:'ui/icons/beast_bear.png', rate:0.06, sellK:0.18,
      desc:'妖熊冬眠一季养出的白髓，一具刮得数滴。最善淬体，也最脏手。' },
    { id:'matb_lion', beast:'lion', tier:1, n:'狮鬃', img:'ui/icons/beast_lion.png', rate:0.06, sellK:0.18,
      desc:'妖狮颈间一圈鬃毛，吼时根根倒竖。编为索可缚低阶妖物，入药取其威。' },
    { id:'matb_tiger', beast:'tiger', tier:1, n:'虎斑皮', img:'ui/icons/beast_tiger.png', rate:0.09, sellK:0.18,
      desc:'兽王额后一片斑纹皮，「王」字天成。与稀有料「兽王精魄」是两物：魄存其威，皮存其形。' },
    { id:'matb_horse', beast:'horse', tier:2, n:'骏骨', img:'ui/icons/beast_horse.png', rate:0.06, sellK:0.36,
      desc:'妖马跑到底后留下的一节腿骨，轻如竹、坚如铁。古来千金买它，只为寻得同类。' },
    { id:'matb_hound', beast:'hound', tier:2, n:'犬牙', img:'ui/icons/beast_hound.png', rate:0.06, sellK:0.36,
      desc:'灵犬守主一生只换一次的那颗牙，牙尖已钝。含之行路不迷，入药可安神。' },
    { id:'matb_monkey', beast:'monkey', tier:2, n:'猴枣', img:'ui/icons/beast_monkey.png', rate:0.06, sellK:0.36,
      desc:'灵猴咽下不化的果核结成的结石，纹如小桃。清热化痰，亦解低阶丹毒。' },
    { id:'matb_rabbit', beast:'rabbit', tier:2, n:'兔毫', img:'ui/icons/beast_rabbit.png', rate:0.06, sellK:0.36,
      desc:'玉兔身上落下的一根细毫，软得立不住。蘸朱砂写符最灵，制笔之人名之为紫毫。' },
    { id:'matb_deer', beast:'deer', tier:2, n:'鹿茸', img:'ui/icons/beast_deer.png', rate:0.06, sellK:0.36,
      desc:'灵鹿初生的一对嫩角，尚未骨化，按之温热。大补精血，淬体一类丹方常用。' },
    { id:'matb_moth', beast:'moth', tier:2, n:'蝶粉', img:'ui/icons/beast_moth.png', rate:0.06, sellK:0.36,
      desc:'灵蝶翅上抖落的一层鳞粉，见光即散。掺入药里可引神，落在纸上能封住一行字。' },
    { id:'matb_jiao', beast:'jiao', tier:2, n:'蛟脊鳞', img:'ui/icons/beast_jiao.png', rate:0.09, sellK:0.36,
      desc:'蛟龙脊上一列倒生的鳞，取之必遭其反噬。与稀有料「蛟龙珠」是两物：珠是其千年道行，鳞是其护身之硬。' },
    { id:'matb_crane', beast:'crane', tier:3, n:'鹤顶砂', img:'ui/icons/beast_crane.png', rate:0.06, sellK:0.90,
      desc:'灵鹤顶上一点丹红，凝成细砂。服之轻身，亦是丹房里最不打眼的一味镇浮阳之药。' },
    { id:'matb_dragon', beast:'dragon', tier:3, n:'龙须', img:'ui/icons/beast_dragon.png', rate:0.06, sellK:0.90,
      desc:'妖龙颔下两根长须，离体犹自动。研粉可通灵窍，入药最能引气上行。' },
    { id:'matb_qilin', beast:'qilin', tier:3, n:'麒麟竭', img:'ui/icons/beast_qilin.png', rate:0.06, sellK:0.90,
      desc:'麒麟行走所伤之血凝成的赤块，旧名血竭。仁兽之血不作杀伐，反能续筋接骨。' },
    { id:'matb_tortoise', beast:'tortoise', tier:3, n:'玄武屏', img:'ui/icons/beast_tortoise.png', rate:0.06, sellK:0.90,
      desc:'玄武千年一换的一片腹甲，展开如水纹屏山。与防具「玄龟甲」并非一物：此为材，彼为器。' },
    { id:'matb_phoenix', beast:'phoenix', tier:3, n:'离火砂', img:'ui/icons/beast_phoenix.png', rate:0.09, sellK:0.90,
      desc:'朱雀浴火落灰中拣出的一粒赤砂，握久不退温。与稀有料「朱雀羽」是两物：羽取其势，砂取其温。' },
    { id:'matb_bat', beast:'bat', tier:4, n:'蝠齿', img:'ui/icons/beast_bat.png', rate:0.06, sellK:1.80,
      desc:'妖蝠口内一排细齿，齿根中空。古方称其类为伏翼，入药多用它散瘀通窍。' },
    { id:'matb_snake', beast:'snake', tier:4, n:'蛇蜕', img:'ui/icons/beast_snake.png', rate:0.06, sellK:1.80,
      desc:'蛇妖蜕下的一张整皮，连眼膜也在。洗净后白如绢，贴疮生肌，入药退翳。' },
    { id:'matb_spider', beast:'spider', tier:4, n:'蛛丝', img:'ui/icons/beast_spider.png', rate:0.06, sellK:1.80,
      desc:'妖蛛结网时最粗的那一根丝，韧得能吊起一人。织可为索，入药取其收摄。' },
    { id:'matb_scorpion', beast:'scorpion', tier:4, n:'蝎尾针', img:'ui/icons/beast_scorpion.png', rate:0.06, sellK:1.80,
      desc:'妖蝎尾末那节毒针，离体犹自蜷。以毒攻毒，是破幻祛风的一味猛药。' },
    { id:'matb_rakshasa', beast:'rakshasa', tier:4, n:'罗刹角', img:'ui/icons/beast_rakshasa.png', rate:0.06, sellK:1.80,
      desc:'罗刹额间独角，皮糙如老树。此兽不识药性，其角却被修士奉为定惊之品。' },
    { id:'matb_ghoul', beast:'ghoul', tier:4, n:'魈骨', img:'ui/icons/beast_ghoul.png', rate:0.06, sellK:1.80,
      desc:'尸魈指上的一节黑骨，阴气所钟。入药必先以火炼，否则反噬其身。' },
    { id:'matb_python', beast:'python', tier:4, n:'蟒胆', img:'ui/icons/beast_python.png', rate:0.06, sellK:1.80,
      desc:'蟒妖一吞一化养出的胆，大如鸡子。俗传胆有「斗」量，服之可壮气力。' },
    { id:'matb_bonejiao', beast:'bonejiao', tier:4, n:'骨蛟逆鳞', img:'ui/icons/beast_bonejiao.png', rate:0.06, sellK:1.80,
      desc:'骨蛟身上一片逆生之鳞，肉连着骨、骨连着魂。取鳞者必为其所噬，故价高。' },
    { id:'matb_nethpython', beast:'nethpython', tier:4, n:'冥蟒涎', img:'ui/icons/beast_nethpython.png', rate:0.06, sellK:1.80,
      desc:'幽冥蟒咽下的涎，入器即凝成黑筋。此物不见光，须以玉瓶盛，不可与阳药同炉。' },
    { id:'matb_fox', beast:'fox', tier:4, n:'狐绒', img:'ui/icons/beast_fox.png', rate:0.09, sellK:1.80,
      desc:'狐尾尖端一撮白绒，幻术自此处生。与稀有料「九尾心」是两物：心主其道行，绒主其幻。' },
    { id:'matb_goldencrow', beast:'goldenCrow', tier:5, n:'金乌翎', img:'ui/icons/beast_goldenCrow.png', rate:0.04, sellK:4.80,
      desc:'金乌振翅坠下的一根赤翎，翎影之中另有一日。炼入火器可增其烈，寒体者入药须辨。' },
    { id:'matb_baize', beast:'baize', tier:5, n:'白泽毛', img:'ui/icons/beast_baize.png', rate:0.04, sellK:4.80,
      desc:'白泽身上一寸之毛，毛端自然成文，识兽者争之——据说认全一册谱，靠的就是它。' },
    { id:'matb_xiezhi', beast:'xiezhi', tier:5, n:'獬豸角', img:'ui/icons/beast_xiezhi.png', rate:0.04, sellK:4.80,
      desc:'獬豸额上一角，能触不直者。修士佩之不为增力，只为心口那点不敢妄语的忌。' },
    { id:'matb_taotie', beast:'taotie', tier:5, n:'饕餮齿', img:'ui/icons/beast_taotie.png', rate:0.06, sellK:4.80,
      desc:'凶兽王口中一枚齿，齿纹如古鼎之饕。它掉落的稀有料仍是「九尾心」，此齿另是一物。' },
    { id:'matb_zhulong', beast:'zhulong', tier:5, n:'烛龙睛', img:'ui/icons/beast_snake.png', rate:0.04, sellK:4.80,
      desc:'烛龙一睁为昼、一闭为夜，其睛离体仍明。入药可安神魂之游，切勿多服。' },
    { id:'matb_kunpeng', beast:'kunpeng', tier:5, n:'鲲鹏之羽', img:'ui/icons/beast_crane.png', rate:0.04, sellK:4.80,
      desc:'鲲鹏徙南冥时振落的一羽，落地便堆成丘。此羽不受轻，反压舟——非风不能举。' },
    { id:'matb_yinglong', beast:'yinglong', tier:5, n:'应龙鳞', img:'ui/icons/beast_dragon.png', rate:0.06, sellK:4.80,
      desc:'应龙行雨时褪下的一鳞，鳞背犹带水痕。祖龙之裔，最善引水中之气。' },
    { id:'matb_moqilin', beast:'moqilin', tier:5, n:'墨玉麟甲', img:'ui/icons/beast_qilin.png', rate:0.04, sellK:4.80,
      desc:'墨玉麒麟身上一片甲，色如墨而温润胜玉。仁兽之甲不伤兵，只堪镇器、安神。' },
    { id:'matb_hundun', beast:'hundun', tier:5, n:'混沌胚壳', img:'ui/icons/beast_fox.png', rate:0.06, sellK:4.80,
      desc:'混沌无面目，七窍未开，其壳如卵膜。此物不受纹饰，炼之每坏三炉。' }
  ];
  const RV4_MAT_BY_ID = {}, RV4_MAT_BY_BEAST = {};
  RV4_MATS.forEach(m => {
    RV4_MAT_BY_ID[m.id] = m;
    RV4_MAT_BY_BEAST[m.beast] = m;
    const beast = BEASTS.find(b => b.id === m.beast);
    ITEMS[m.id] = {
      n: m.n, img: m.img, cls: m.tier >= 4 ? 'gold' : (m.tier === 3 ? 'good' : ''),
      usage: '妖兽专属材料：可堆叠、可寄售卖出；坊市买入货架不收录',
      source: '猎杀【' + (beast ? beast.name : m.beast) + '】所得，与同段通用料并行掉落',
      description: m.desc
    };
    SELL_K[m.id] = m.sellK;
  });
  danFillBagMeta();   /* 三十一枚新丹的背包元数据与寄售价：必须等 ITEMS / SELL_K 起栈后再写 */
  const marketItem = id => MARKET_POOL.find(x => x.id === id);
  /* batch10：坊市货架与背包扩容共用同一买入价公式；k 与当日 buyRate 均只读既有锚点。 */
  function marketBuyPrice(g){
    return Math.max(1, Math.floor(needOf(S.rank) * g.k * S.market.buyRate));
  }
  /* 跨天自动换一批货架 + 重掷行情（买价和卖价分开，今天适合买还是卖由行情决定） */
  function resetMarket(){
    const k = todayKey();
    if(dayNo(S.market.day) >= todayNo() && S.market.goods && S.market.goods.length) return;
    S.market.day = k;
    S.market.buyRate = 0.85 + Math.random() * 0.35;    /* 0.85 ~ 1.20 */
    S.market.sellRate = 0.80 + Math.random() * 0.45;   /* 0.80 ~ 1.25 */
    S.market.sold = 0;
    S.market.freeRefresh = 1;
    rollMarket();
  }
  function rollMarket(){
    const src = MARKET_POOL.filter(g => S.rank >= g.rank).slice();
    const picked = [];
    while(picked.length < BAL.marketSlots && src.length){
      picked.push(src.splice(Math.floor(Math.random() * src.length), 1)[0]);
    }
    S.market.goods = picked.map(g => ({ id: g.id, price: marketBuyPrice(g), bought: false }));
  }
  function refreshMarket(fromEl){
    resetMarket();
    const cost = Math.floor(needOf(S.rank) * BAL.marketRefreshK);
    let paid = false;
    if(S.market.freeRefresh > 0) S.market.freeRefresh--;
    else{
      if(S.stone < cost){ log('灵石不足，刷新货架要 ' + fmt(cost) + ' 灵石。', 'bad'); return; }
      S.stone -= cost;
      paid = true;
    }
    rollMarket();
    log('🔄 坊市换了一批新货。', 'sys');
    sfx.click();                    /* 换货原本没声音，补一声 */
    save(); render(); renderMarket();
    /* 付费刷新也要看得到花费：换货按钮会被行情区重绘顶掉，重绘后重新取一次 */
    if(paid){
      const rb2 = document.querySelector('#mk-rate [data-mk="refresh"]') || fromEl;
      if(rb2) spendFloat('-' + fmt(cost) + ' 灵石', rb2);
    }
  }
  /* 第三批 P0：坊市购买二次确认（物品/数量/单价/余额/买后余额）；真正扣款下沉到 doBuyMarket */
  function buyMarket(idx, fromEl){
    resetMarket();
    const slot = S.market.goods[idx];
    if(!slot || slot.bought){ log('这格货已经售出或换新了，刷新货架再看。', 'bad'); return; }
    const g = marketItem(slot.id);
    if(!g){ log('这格货的数据缺失，已为你换新货。', 'bad'); rollMarket(); renderMarket(); return; }
    if(S.stone < slot.price){ const m='灵石不足，买【' + g.name + '】要 ' + fmt(slot.price) + ' 灵石（差 ' + fmt(slot.price - S.stone) + '）。'; log(m, 'bad'); try{ if(window.toast) toast(m); }catch(e){} return; }
    if(g.kind === 'item' && !bagCanAccept(g.item || g.id)){
      const m = '背包已满（' + bagCap() + ' 格），先卖掉或扩个储物袋再买。';
      log(m, 'bad'); try{ if(window.toast) toast(m); }catch(e){}
      return;
    }
    if(g.kind === 'egg' && S.eggs.length >= BAL.petEggMax){ log('蛋篓已满（' + BAL.petEggMax + ' 枚），先去灵兽园孵化。', 'bad'); return; }
    if(g.kind === 'bag' && S.bagSize >= BAG_CAP){ log('背包已到 ' + BAG_CAP + ' 格，装不下了。', 'bad'); return; }
    const qty = g.kind === 'res' ? 20 : g.kind === 'bag' ? BAG_STEP : 1;
    const qtyTxt = /[×x]\s*\d+/.test(g.name) ? '' : ' ×' + qty;   /* 货名自带数量时不再重复 */
    const after = S.stone - slot.price;
    pickStance({
      icon: '🛒', title: '坊市 · 确认购买',
      text: '物品：<b>' + escHTML(g.name) + '</b>' + qtyTxt +
        '<br>单价：<b>' + fmt(slot.price) + '</b> 灵石' +
        '<br>余额：' + fmt(S.stone) + ' → 买后 <b>' + fmt(after) + '</b>',
      opts: [{ k: 'ok', n: '确认购买', d: '灵石 -' + fmt(slot.price) }],
      foot: '取消不会扣任何资源，货格保留。'
    }, k => { if(k === 'ok') doBuyMarket(idx, fromEl); });
  }
  function doBuyMarket(idx, fromEl){
    resetMarket();
    const slot = S.market.goods[idx];
    if(!slot || slot.bought){ log('这格货已经售出或换新了，刷新货架再看。', 'bad'); return; }
    const g = marketItem(slot.id);
    if(!g){ log('这格货的数据缺失，已为你换新货。', 'bad'); rollMarket(); renderMarket(); return; }
    if(S.stone < slot.price){ const m='灵石不足，买【' + g.name + '】要 ' + fmt(slot.price) + ' 灵石（差 ' + fmt(slot.price - S.stone) + '）。'; log(m, 'bad'); try{ if(window.toast) toast(m); }catch(e){} return; }
    if(g.kind === 'item' && !bagCanAccept(g.item || g.id)){
      const m = '背包已满（' + bagCap() + ' 格），先卖掉或扩个储物袋再买。';
      log(m, 'bad'); try{ if(window.toast) toast(m); }catch(e){}
      return;
    }
    if(g.kind === 'egg' && S.eggs.length >= BAL.petEggMax){ log('蛋篓已满（' + BAL.petEggMax + ' 枚），先去灵兽园孵化。', 'bad'); return; }
    if(g.kind === 'bag' && S.bagSize >= BAG_CAP){ log('背包已到 ' + BAG_CAP + ' 格，装不下了。', 'bad'); return; }
    S.stone -= slot.price;
    if(g.kind === 'res'){
      if(g.id === 'herb'){ S.herb += 20; log('🛒 坊市买得灵草 ×20。', 'good'); }
      else{ S.ore += 20; log('🛒 坊市买得矿石 ×20。', 'good'); }
    }else if(g.kind === 'item'){
      addItem(g.item, g.name);
      log('🛒 坊市买得【' + g.name + '】。', 'good');
    }else if(g.kind === 'egg'){
      const can = BEASTS.filter(b => S.rank >= b.rank - 1);
      const b = can[Math.floor(Math.random() * can.length)] || BEASTS[0];
      S.eggs.push({ bid: b.id });
      log('🛒 坊市买得一枚妖兽蛋（' + b.name + '）。', 'good');
    }else if(g.kind === 'bag'){
      S.bagSize = Math.min(BAG_CAP, S.bagSize + BAG_STEP);
      log('🛒 坊市买得储物袋，背包扩到 ' + S.bagSize + ' 格。', 'good');
    }
    slot.bought = true;
    sfx.pop();
    save(); render(); renderMarket(); renderBag();
    /* 购入行墨晕 + 花费浮字：等重绘之后再定位——买入会往寄售列表多塞一行，
       货架整体下移约 34px，先算位置会让浮字与按钮错位 */
    mkFlash = idx;                                 /* 墨晕标记：下一次 renderMarket 打上 */
    save(); render(); renderMarket(); renderBag();
    const gBox = document.getElementById('mk-goods');
    /* 同样按 data-slot 定位：缺货槽位不生成行时，行序与 goods 下标会错开 */
    const row = gBox ? gBox.querySelector('.mk-row[data-slot="' + idx + '"]') : null;
    if(row){
      spendFloat('-' + fmt(slot.price) + ' 灵石', row.querySelector('[data-buy]') || row);
    }else if(fromEl){
      spendFloat('-' + fmt(slot.price) + ' 灵石', fromEl);
    }
  }
  /* 寄售价：超过每日额度后坊市压价（防无限刷灵石） */
  function sellPriceAt(t, sold){
    const meta = ITEMS[t] || {};
    if(meta.rv4Equip) return meta.sell || 0;   /* 新六装备固定半价；旧装备与旧材料价格不动 */
    const k = SELL_K[t] || 0;
    if(!k) return 0;
    const over = sold >= BAL.marketSellMax;
    return Math.max(1, Math.floor(needOf(S.rank) * k * S.market.sellRate * (over ? BAL.marketSellDown : 1)));
  }
  function sellPrice(t){ return sellPriceAt(t, S.market.sold); }
  function sellMarket(idx){
    resetMarket();
    const it = S.bag[idx];
    if(!it){ log('这件东西已经不在背包里了，请重新打开背包再看。', 'bad'); return; }
    const p = sellPrice(it.t);
    if(!p){ log('坊市不收「' + it.n + '」（只收丹药和妖兽材料）。', 'bad'); return; }
    confirmAction({
      icon:'💰', title:'坊市 · 确认寄售', okText:'确认寄售',
      text:'物品：<b>' + escHTML(it.n) + '</b><br>数量：<b>1</b> 件' +
        '<br>单价：<b>' + fmt(p) + '</b> 灵石<br>总价：<b>' + fmt(p) + '</b> 灵石',
      foot:'确认后才扣除物品并发放灵石。'
    }, ok => { if(ok) doSellMarket(idx); });
  }
  function doSellMarket(idx){
    resetMarket();
    const it = S.bag[idx];
    if(!it){ log('这件东西已经不在背包里了，请重新打开背包再看。', 'bad'); return; }
    const p = sellPrice(it.t);
    if(!p){ log('坊市不收「' + it.n + '」（只收丹药和妖兽材料）。', 'bad'); return; }
    bagConsumeIdx(idx, 1);   /* 堆叠格卖 1 件，单价不变 */
    S.stone += p;
    S.stats.stoneEarned += p;
    S.market.sold++;
    log('💰 寄售「' + it.n + '」，灵石 +' + fmt(p) + '（今日 ' + S.market.sold + '/' + BAL.marketSellMax + '）', 'good');
    sfx.pop();
    save(); render(); renderMarket(); renderBag();
  }
  /* 一键寄售预览与执行共用同一计划，确认页显示的件数/总价就是实际成交值。 */
  function sellAllPlan(){
    resetMarket();
    const rows = [];
    let n = 0, sum = 0;
    for(let i = S.bag.length - 1; i >= 0; i--){
      const left = BAL.marketSellMax * 2 - S.market.sold - n;
      if(left <= 0) break;
      const it = S.bag[i];
      if(!it || (ITEMS[it.t] && ITEMS[it.t].slot)) continue;   /* 一键寄售只处理材料/丹药，不卖装备 */
      const p = sellPriceAt(it.t, S.market.sold + n);
      if(!p) continue;
      const q = bagQtyOf(it);
      const take = Math.min(q, left);
      rows.push({ i, name:it.n, q, take, p, total:p * take });
      sum += p * take; n += take;
    }
    return { rows, n, sum };
  }
  function sellAllMats(){
    const plan = sellAllPlan();
    if(!plan.n){ log('背包里没有坊市收的东西。', 'bad'); return; }
    const detail = plan.rows.map(r => escHTML(r.name) + ' ×' + r.take + '（' + fmt(r.p) + ' 灵石/件）').join('<br>');
    confirmAction({
      icon:'💰', title:'坊市 · 确认一键寄售', okText:'确认全部寄售',
      text:'物品：<br><b>' + detail + '</b><br>数量：<b>' + plan.n + '</b> 件' +
        '<br>总价：<b>' + fmt(plan.sum) + '</b> 灵石',
      foot:'确认后才扣除物品并发放灵石；受今日寄售额度限制。'
    }, ok => { if(ok) doSellAllMats(); });
  }
  function doSellAllMats(){
    const plan = sellAllPlan();
    if(!plan.n){ log('背包里没有坊市收的东西。', 'bad'); return; }
    plan.rows.forEach(r => bagConsumeIdx(r.i, r.take));
    S.stone += plan.sum; S.stats.stoneEarned += plan.sum; S.market.sold += plan.n;
    log('💰 一键寄售 ' + plan.n + ' 件，灵石 +' + fmt(plan.sum) + '。', 'gold');
    sfx.win();
    save(); render(); renderMarket(); renderBag();
  }
  /* 货架 DOM 缓存：内容没变就不重建。
     原因：货架行每 500ms 被整表重绘重建，购入行的金墨晕会被中途打断；
     缓存后行元素得以存活，脉冲才能放完（顺带少一次 DOM churn）。 */
  let mkBox = null, mkSig = '', mkFlash = -1;
  /* 寄售页（#mk-sell）是另一份独立子树，单独缓存，避免整表重建吞掉点击 */
  let sellBox = null, sellSig = '';
  function renderMarket(){
    resetMarket();
    const rateBox = document.getElementById('mk-rate');
    if(rateBox){
      const br = S.market.buyRate, sr = S.market.sellRate;
      rateBox.innerHTML =
        '<div class="mk-line"><span>买入行情</span><b class="' + (br > 1.05 ? 'bad' : br < 0.95 ? 'good' : '') + '">×' + br.toFixed(2) + '</b></div>' +
        '<div class="mk-line"><span>收购行情</span><b class="' + (sr > 1.05 ? 'good' : sr < 0.95 ? 'bad' : '') + '">×' + sr.toFixed(2) + '</b></div>' +
        '<div class="mk-line"><span>今日已寄售</span><b>' + S.market.sold + ' / ' + BAL.marketSellMax + '</b></div>' +
        '<div class="mk-line"><span>整架补货</span><b>' + fmtCd(nextDayResetMs()) + ' 后（08:00）</b></div>' +
        '<div class="mk-line"><span>免费刷新</span><b>' + (S.market.freeRefresh | 0) + ' / 1</b></div>' +
        '<button class="mk-refresh" data-mk="refresh">🔄 换新货' +
          (S.market.freeRefresh > 0 ? '（今日免费）' : ' · ' + fmt(Math.floor(needOf(S.rank) * BAL.marketRefreshK)) + ' 灵石') + '</button>' +
        '<p class="hint">货架每日 08:00 整架补货 · 每格限购 1 件 · 价格随境界水涨船高 · 寄售超额后坊市压价 ' + (BAL.marketSellDown * 10) + ' 折</p>';
      const rb = rateBox.querySelector('[data-mk="refresh"]');
      if(rb) rb.addEventListener('click', ev => refreshMarket(ev.currentTarget));
    }
    const gBox = document.getElementById('mk-goods');
    if(!gBox){ mkBox = null; mkSig = ''; sellBox = null; sellSig = ''; }   /* 离开坊市：router 已清空 #panel-host，缓存不得继续持有游离子树 */
    if(gBox){
      let html = '';
      S.market.goods.forEach((slot, i) => {
        const g = marketItem(slot.id);
        if(!g) return;
        const ico = g.img ? '<img src="' + g.img + '" alt="">' : '<img class="mk-emo" src="ui/icons/ic_box.png" alt="">';
        /* data-slot 记的是**槽位下标**（不是行序）。marketItem 取不到货时这一行不生成，
           行序就会与 goods 下标错开；墨晕若按行序定位会闪到相邻那一行。 */
        html += '<div class="mk-row' + (slot.bought ? ' done' : '') + '" data-slot="' + i + '">' + ico +
          '<div class="mk-main"><b>' + g.name + '</b><small>' + (g.desc || '') + '</small></div>' +
          '<button class="mk-buy" data-buy="' + i + '"' + (slot.bought || S.stone < slot.price ? ' disabled' : '') + '>' +
          (slot.bought ? '已购' : fmt(slot.price) + ' 灵石') + '</button></div>';
      });
      const body = html || '<p class="pet-empty">今天没进货。</p>';
      if(mkBox !== gBox || mkSig !== body){        /* 内容变才重建（见上方 mkBox 缓存说明） */
        mkBox = gBox; mkSig = body;
        gBox.innerHTML = body;
      }
      if(mkFlash >= 0){                            /* 购入行金墨晕：一次性，打在存活的行元素上 */
        /* 按 data-slot 精确匹配槽位，不用 querySelectorAll 的行序——
           缺货槽位不生成行时，行序与 goods 下标会错位，按行序会闪错行。 */
        const r = gBox.querySelector('.mk-row[data-slot="' + mkFlash + '"]');
        if(r) flashEl(r);
        mkFlash = -1;
      }
      if (!gBox.dataset.d_binded) {
        gBox.dataset.d_binded = '1';
        gBox.addEventListener('click', ev => {
          const b = ev.target.closest('[data-buy]');
          if (b) { ev.stopPropagation(); buyMarket(Number(b.dataset.buy), b); }
        });
      }
    }
    const sBox = document.getElementById('mk-sell');
    if(sBox){
      const sellable = S.bag.map((it, i) => ({ it, i, p: sellPrice(it.t) })).filter(x => x.p > 0);
      let html = '';
      sellable.slice(0, 12).forEach(({ it, i, p }) => {
        const meta = ITEMS[it.t] || {};
        const q = bagQtyOf(it);
        const ico = meta.img ? '<img src="' + meta.img + '" alt="">' : '<img class="mk-emo" src="ui/icons/ic_box.png" alt="">';
        html += '<div class="mk-row">' + ico + '<div class="mk-main"><b>' + it.n + (q > 1 ? ' ×' + q : '') + '</b></div>' +
          '<button class="mk-buy sell" data-sell="' + i + '">' + fmt(p) + ' 灵石</button></div>';
      });
      const sellTotal = sellable.reduce((a, x) => a + bagQtyOf(x.it), 0);
      html += '<button class="mk-all"' + (sellable.length ? '' : ' disabled') + '>' + inkIco('💰') + '一键寄售全部（' + sellTotal + ' 件可卖）</button>';
      html += '<p class="hint">上面只列出前 12 件；一键寄售会卖出背包里全部可卖材料（受今日寄售额度限制）· 点单件可单独卖 · 丹药也能卖，但吃了更划算</p>';
      if(sBox !== sellBox || html !== sellSig){
        sellBox = sBox; sellSig = html;
        sBox.innerHTML = html;
      }
      if (!sBox.dataset.d_binded) {
        sBox.dataset.d_binded = '1';
        sBox.addEventListener('click', ev => {
          const sb = ev.target.closest('[data-sell]');
          if (sb) { ev.stopPropagation(); sellMarket(Number(sb.dataset.sell)); return; }
          const abtn = ev.target.closest('.mk-all');
          if (abtn) { ev.stopPropagation(); sellAllMats(); }
        });
      }
    }
  }
  /* 天机阁（坊市内的保底道具店，定价与坊市脱钩）：
     灵石 = 当前总资产 × 35%~45%（shopPrice）；悟道值 = 大额基础价 × 境界系数；
     一次兑换双扣（灵石 + 悟道值同时付）；限购由 shopLimitState 统一判定；
     售罄按钮置灰（disabled + dis）并显示「本周售罄 / 本境已兑」 */
  const SHOP_ICON = { heart_mirror:'🛡️', guard_array:'🌀', tianji:'🧿' };
  /* 珍宝 modal 的 64px 大图位放不下彩色 emoji，同一件货另给水墨图（第 83 轮把行内小图一起换掉） */
  const SHOP_IMG  = { heart_mirror:'ui/icons/ic_taiji.png', guard_array:'ui/icons/ic_gate.png', tianji:'ui/icons/ic_bolt.png' };
  function renderShop(){
    resetShopWeek();
    const w = document.getElementById('tj-wisdom');
    if(w) w.textContent = fmt(S.wisdom || 0);
    const mul = document.getElementById('tj-mul');
    if(mul) mul.textContent = '×' + SHOP_CFG.rankMul(S.rank).toFixed(2);
    const box = document.getElementById('tj-goods');
    if(!box) return;
    const rows = wisdomShop();
    let html = '';
    rows.forEach(s => {
      const g = guardMeta(s.id);
      /* S3：持有数必须读主状态 S，不能读 wisdomShop() 的返回项（那里没有 tianji 字段，
         旧写法让天机令永远显示「持有 0」，主线发了也像没到账）。 */
      const own = s.id === 'heart_mirror' ? S.guardMirror : s.id === 'guard_array' ? S.guardArray : S.tianji;
      /* 单按钮双扣展示：售罄 → 置灰 + 「本周售罄/本境已兑」；否则显示 灵石 + 悟道 两种价 */
      const btnTxt = s.sold ? (s.id === 'tianji' ? '本境已兑' : '本周售罄')
                            : '💰 ' + fmt(s.priceStone) + ' · ✨ ' + fmt(s.priceWisdom);
      const btn = '<button class="btn-mini' + (s.sold || !s.enough ? ' dis' : '') + '" data-buy="' + s.id + '"' +
        (s.sold ? ' disabled' : '') + ' title="灵石 ' + fmt(s.priceStone) + ' + 悟道值 ' + fmt(s.priceWisdom) + '">' + btnTxt + '</button>';
      html += '<div class="mk-row' + (s.sold ? ' sold' : '') + '" data-buy-row="' + s.id + '"><span class="mk-emo">' + (SHOP_ICON[s.id] || '🧿') + '</span>' +
        '<div class="mk-main"><b>' + g.name + '</b>' +
        '<small>' + s.desc + ' · 持有 ' + (own || 0) + ' · <em class="tj-limit">' + s.limitTxt + '</em>' +
        ' · <b class="tj-ratio">灵石价 = 总资产 ' + Math.round((SHOP_CFG.assetRatio[s.id] || 0.4) * 100) + '%</b></small></div>' +
        '<div class="mk-btns">' + btn + '</div></div>';
    });
    box.innerHTML = html;
    if (!box.dataset.d_binded) {
      box.dataset.d_binded = '1';
      box.addEventListener('click', ev => {
        const b = ev.target.closest('[data-buy]');
        if (b && !b.disabled) { ev.stopPropagation(); buyShop(b.dataset.buy, b); }
      });
    }
    renderBpShop();
  }
  /* batch5 图纸定向锻造 · 天机阁周限购自选图：
     价格 = 当前一层需求 ×3 灵石 + 500 悟道值（不随境界系数放大悟道价）；
     每周限 1 张，与现有周限购同口径（周一 0 点跨周重置，状态存 S.bpShop）。 */
  const BP_SHOP_STONE_MULT = 3;
  const BP_SHOP_WISDOM = 500;
  function resetBpShopWeek(){
    if(!S.bpShop || typeof S.bpShop !== 'object') S.bpShop = { week: '', bought: 0 };
    const k = weekKey();
    if(S.bpShop.week !== k){ S.bpShop.week = k; S.bpShop.bought = 0; }
    return S.bpShop;
  }
  function bpShopState(){
    resetBpShopWeek();
    const bought = Math.max(0, Math.min(1, S.bpShop.bought | 0));
    return {
      sold: bought >= 1, left: 1 - bought,
      stone: Math.max(1, Math.floor(needOf(S.rank) * BP_SHOP_STONE_MULT)),
      wisdom: BP_SHOP_WISDOM,
      txt: '本周 ' + bought + '/1'
    };
  }
  function doBuyBlueprint(id){
    const b = BP_BY_ID[id];
    if(!b){ log('天机阁没有这张图纸。', 'bad'); return false; }
    const st = bpShopState();
    if(st.sold){ log('本周的图纸已选过，下周再来。', 'bad'); return false; }
    if(moneyInt(S.stone) < st.stone){
      log('灵石不足，【' + b.name + '】要 ' + fmt(st.stone) + ' 灵石。', 'bad'); return false;
    }
    if(moneyInt(S.wisdom) < st.wisdom){
      log('悟道值不足，【' + b.name + '】要 ' + fmt(st.wisdom) + ' 点（现有 ' + moneyInt(S.wisdom) + '）。', 'bad'); return false;
    }
    S.stone -= st.stone; S.wisdom -= st.wisdom;
    S.bpShop.bought = 1;
    bpGive(id);
    log('📜 花 ' + fmt(st.stone) + ' 灵石 + ' + fmt(st.wisdom) + ' 点悟道值，自选【' + b.name + '】。', 'gold');
    sfx.win(); save(); render();
    showSettle({
      icon: '📜', title: '天机阁 · 图纸', sub: '已放入图纸夹 · 去炼器坊查看',
      rows: [settleLine(b.name, '+1', 'good')],
      note: '图纸锻造只跳炼器坊等级与器师阶两道门槛，材料与成功率照卡。'
    });
    return true;
  }
  function buyBlueprint(id, fromEl){
    const b = BP_BY_ID[id];
    if(!b){ log('天机阁没有这张图纸。', 'bad'); return false; }
    const st = bpShopState();
    if(st.sold) return doBuyBlueprint(id);
    if(moneyInt(S.stone) < st.stone || moneyInt(S.wisdom) < st.wisdom) return doBuyBlueprint(id);
    pickStance({
      icon: '📜', title: '天机阁 · 自选图纸【' + b.name + '】',
      text: '将消耗 <b>' + fmt(st.stone) + '</b> 灵石（当前一层需求 ×' + BP_SHOP_STONE_MULT + '）＋ <b>' +
        fmt(st.wisdom) + '</b> 悟道值。<br>本周限 1 张 · ' + st.txt + '。',
      opts: [{ k: 'ok', n: '确认选图', d: '图纸入图纸夹' }],
      foot: '取消不会扣任何资源。'
    }, k => { if(k === 'ok') doBuyBlueprint(id); });
    return true;
  }
  function renderBpShop(){
    const box = document.getElementById('tj-bp');
    if(!box) return;
    const st = bpShopState();
    const stateEl = document.getElementById('tj-bp-state');
    if(stateEl) stateEl.textContent = st.txt;
    const enoughStone = moneyInt(S.stone) >= st.stone;
    const enoughWisdom = moneyInt(S.wisdom) >= st.wisdom;
    box.innerHTML = BLUEPRINTS.map(b => {
      const n = bpCount(b.id);
      const btnTxt = st.sold ? '本周已选' : '选此图';
      const dis = st.sold || !enoughStone || !enoughWisdom;
      return '<div class="mk-row' + (st.sold ? ' sold' : '') + '">' +
        '<span class="mk-emo">📜</span>' +
        '<div class="mk-main"><b>' + b.name + '</b>' +
        '<small>' + ART_FAM[b.fam].name + '第 ' + b.seg + ' 阶 · 持有图纸 ' + n + ' 张</small></div>' +
        '<div class="mk-btns"><button class="btn-mini' + (dis ? ' dis' : '') + '" data-buy-bp="' + b.id + '"' +
        (st.sold ? ' disabled' : '') + ' title="灵石 ' + fmt(st.stone) + ' + 悟道值 ' + fmt(st.wisdom) + '">' +
        btnTxt + '</button></div></div>';
    }).join('') +
      '<p class="hint">图纸定价：<b>' + fmt(st.stone) + '</b> 灵石（当前一层需求 ×' + BP_SHOP_STONE_MULT +
      '）＋ <b>' + fmt(st.wisdom) + '</b> 悟道值 · 每周限 1 张。</p>';
    if(!box.dataset.bp_binded){
      box.dataset.bp_binded = '1';
      box.addEventListener('click', ev => {
        const b = ev.target.closest('[data-buy-bp]');
        if(b && !b.disabled){ ev.stopPropagation(); buyBlueprint(b.dataset.buyBp, b); }
      });
    }
  }
  function bagCap(){ return S.bagSize + dtBagN(); }
  /* 合法上限：储物袋满级 + 所有洞天加格（含主洞 ×1.5）。读档只按这个兜底，防止改档塞爆 DOM */
  function bagMaxCap(){
    const sum = DONGTIAN.reduce((a, c) => a + (c.eff.bag ? c.eff.bag[DT_MAX] : 0), 0);
    return BAG_CAP + Math.round(sum * 1.5);
  }
  function bagCost(){
    resetMarket();
    return marketBuyPrice(marketItem('bag'));
  }
  /* 满包暂存（阶段三 S1）：不新增存档字段，复用 S.letters 的既有形状。
     信匣里的一封「待领信」用 kind = 'overflow:itemId:count;...' 记录暂存物，
     text 是给人看的明细；拆信/背包页取回时才真正进背包。
     这样即使玩家不立刻腾格子，奖励也不会消失，且读档后仍在（load 已保留 kind/text）。 */
  const OV_PREFIX = 'overflow:';
  function ovName(t){ return (ITEMS[t] || {}).n || t; }
  function ovEntries(letter){
    const s = String((letter && letter.kind) || '');
    if(s.indexOf(OV_PREFIX) !== 0) return [];
    return s.slice(OV_PREFIX.length).split(';').filter(Boolean).map(function(p){
      const i = p.lastIndexOf(':');
      const t = p.slice(0, i), n = Math.max(0, Math.floor(Number(p.slice(i + 1)) || 0));
      return (t && n > 0) ? { t: t, n: n } : null;
    }).filter(Boolean);
  }
  function ovSerialize(list){ return OV_PREFIX + (list || []).map(function(e){ return e.t + ':' + e.n; }).join(';'); }
  function ovText(list){
    return '背包已满，暂存：' + (list || []).map(function(e){ return ovName(e.t) + ' ×' + e.n; }).join('、');
  }
  function ovPending(){ return (S.letters || []).filter(function(x){ return !x.open && ovEntries(x).length; }).length; }
  function ovLetter(){
    let l = (S.letters || []).find(function(x){ return !x.open && ovEntries(x).length; });
    if(l) return l;
    l = { id: 'O' + Date.now().toString(36) + (S.letters || []).length, kind: OV_PREFIX,
          day: '信匣 · 待领', text: '背包已满，暂存物在匣子里。', rw: null, open: false, at: Date.now() };
    S.letters = [l].concat(S.letters || []);
    return l;
  }
  function stashOverflow(t, count){
    if(!ITEMS[t]) return false;
    const l = ovLetter();
    const list = ovEntries(l);
    const hit = list.find(function(e){ return e.t === t; });
    if(hit) hit.n += count; else list.push({ t: t, n: count });
    l.kind = ovSerialize(list);
    l.text = ovText(list);
    /* 待领信永远排最前；最多 6 封的旧上限保留，但绝不因为上限丢掉待领信。 */
    S.letters = [l].concat((S.letters || []).filter(function(x){ return x !== l; }));
    while(S.letters.length > 6){
      let drop = -1;
      for(let i = S.letters.length - 1; i >= 0; i--){
        const x = S.letters[i];
        if(x !== l && !x.open){ drop = i; break; }
      }
      if(drop < 0) break;
      S.letters.splice(drop, 1);
    }
    save();
    return true;
  }
  /* addItemEx：ok=进背包；mail=已暂存信匣；两者都算“奖励没有丢”。 */
  function addItemEx(t, n){
    n = n || (ITEMS[t] || {}).n || t;
    const r = bagAddQty(t, n, 1);
    if(!r.ok){
      if(r.mail){
        log('背包已满（' + bagCap() + ' 格），「' + n + '」已暂存信匣（打开背包可领）。', 'bad');
        return { ok: false, mail: true };
      }
      log('背包已满（' + bagCap() + ' 格），装不下「' + n + '」了。', 'bad');
      return { ok: false, mail: false };
    }
    renderBag();
    return { ok: true, mail: false };
  }
  function addItem(t, n){ return addItemEx(t, n).ok; }
  /* 从信匣取回：能塞几件塞几件，塞不下的继续留在信匣里；不会因为背包又满而丢。 */
  function claimOverflow(id){
    const l = (S.letters || []).find(function(x){ return x.id === id; });
    if(!l || l.open) return null;
    const list = ovEntries(l);
    if(!list.length){ l.open = true; save(); renderOverflow(); return null; }
    const got = [], left = [], srows = [];
    list.forEach(function(e){
      let added = 0;
      while(added < e.n){
        const one = bagAddQty(e.t, ovName(e.t), 1, true);   /* 领取不再往信匣回塞 */
        if(!one.ok) break;
        added++;
      }
      if(added > 0){ got.push(ovName(e.t) + ' ×' + added); srows.push(settleLine('取回 · ' + ovName(e.t), '+' + added, 'good')); }
      if(added < e.n) left.push({ t: e.t, n: e.n - added });
    });
    if(left.length){
      l.kind = ovSerialize(left);
      l.text = ovText(left);
      log('背包仍满（' + bagCap() + ' 格），先取回 ' + (got.length ? got.join('、') : '0 件') +
          '；剩余 ' + left.map(function(e){ return ovName(e.t) + ' ×' + e.n; }).join('、') + ' 继续留在信匣。', 'bad');
    }else{
      l.open = true;
      log('✉️ 从信匣取回：' + got.join('、') + '。', 'good');
    }
    sfx.pop();
    showSettle({
      icon: '✉️', title: '信匣取回', sub: left.length ? '背包仍满 · 只取回一部分' : '已全部取回',
      rows: srows,
      note: left.length ? '剩下的仍在信匣，腾出格子再来取；不会被吞。' : '逐项按实际入包数列账。'
    });
    save(); render(); renderBag();
    return got.length ? got.join('、') : null;
  }
  function renderOverflow(){
    const box = document.getElementById('xx-overflow');
    const card = document.getElementById('xx-overflow-card');
    if(!box || !card) return;
    const list = (S.letters || []).filter(function(x){ return !x.open && ovEntries(x).length; });
    if(!list.length){ card.hidden = true; box.innerHTML = ''; return; }
    card.hidden = false;
    box.innerHTML = list.map(function(l){
      const es = ovEntries(l);
      return '<div class="ov-row"><span>' + es.map(function(e){
        return escHTML(ovName(e.t)) + ' ×' + e.n;
      }).join('、') + '</span><button class="btn-mini" data-ov="' + l.id + '">取回</button></div>';
    }).join('');
    if(!box.dataset.bound){
      box.dataset.bound = '1';
      box.addEventListener('click', function(ev){
        const b = ev.target.closest('[data-ov]');
        if(b) claimOverflow(b.dataset.ov);
      });
    }
  }
  function syncBagDot(){
    const d = document.getElementById('sc-bag-dot');
    if(d) d.hidden = ovPending() === 0;
  }
  /* ---------- 装备系统：三槽穿戴 / 卸下，穿好自动重算总战力 ---------- */
  /* 按 id 在背包里找第一件（不用 findIndex，保守写法） */
  function bagIndexOf(itemId){
    for(let i = 0; i < S.bag.length; i++){ if(S.bag[i] && S.bag[i].t === itemId) return i; }
    return -1;
  }
  /* 装备持有判定（掉落去重）：身上三槽 + 背包 + 信匣待领都算已持有。
     2026-11-19 数值表：塔固定件一次性、历练池剔除已持有，不做重复折灵石。 */
  function ownsEquip(id){
    const eq = S.equipment || {};
    if(eq.weapon === id || eq.armor === id || eq.accessory === id) return true;
    if(bagIndexOf(id) >= 0) return true;
    try{
      for(let i = 0; i < (S.letters || []).length; i++){
        const es = ovEntries(S.letters[i]);
        for(let j = 0; j < es.length; j++){ if(es[j].t === id) return true; }
      }
    }catch(e){}
    return false;
  }
  /* 穿上：背包取出 → 入槽 → 同槽旧装备退回背包 → 重算战力。
     返回 { ok, slot, before, after, delta, replaced }，UI 层拿 delta 显示「战力提升 XXX」 */
  function equipItem(itemId){
    const meta = ITEMS[itemId];
    if(!meta || !meta.slot || EQUIP_SLOTS.indexOf(meta.slot) < 0){
      log('「' + ((meta && meta.n) || itemId) + '」不是可装备的法宝。', 'bad');
      return { ok: false, reason: 'not-equip' };
    }
    const idx = bagIndexOf(itemId);
    if(idx < 0){
      log('背包里没有【' + meta.n + '】。', 'bad');
      return { ok: false, reason: 'not-in-bag' };
    }
    const before = combatPower();
    const oldId = S.equipment[meta.slot];
    bagConsumeIdx(idx, 1);                      /* 从背包取出（装备单件，不并格） */
    S.equipment[meta.slot] = itemId;            /* 放入对应槽 */
    let returned = { ok: true, mail: false };
    if(oldId) returned = addItemEx(oldId, (ITEMS[oldId] || {}).n || oldId);   /* 换下来的退回背包/信匣 */
    if(!returned.ok && !returned.mail){
      /* 连信匣都写不进去：回滚，不让旧装备凭空消失 */
      S.equipment[meta.slot] = oldId || null;
      S.bag.unshift({ t: itemId, n: meta.n, q: 1 });   /* 装备单件身份，不并格 */
      save(); render(); renderBag();
      log('换下的旧装备无处安放，本次换装已取消。', 'bad');
      return { ok: false, reason: 'stash-fail' };
    }
    save(); render(); renderBag();
    const after = combatPower();
    const delta = after - before;
    log('⚔️ 装备【' + meta.n + '】（' + SLOT_NAME[meta.slot] + '），战力 ' +
        (delta >= 0 ? '+' : '-') + fmt(Math.abs(delta)) + '。', delta >= 0 ? 'gold' : 'bad');
    sfx.pop();
    if(returned.mail) log('换下的旧装备背包放不下，已暂存信匣。', 'bad');
    else if(!returned.ok) log('换下的旧装备连信匣都写不进去，本次操作已取消。', 'bad');
    /* 槽位发光：面板开着就直接脉冲，没开则记号留给 renderRole 补 */
    roleGlowSlot = meta.slot;
    const glowEl = document.querySelector('.equip-slot[data-slot="' + meta.slot + '"]');
    if(glowEl){ glowEl.classList.remove('glow'); void glowEl.offsetWidth; glowEl.classList.add('glow'); roleGlowSlot = null; }
    return { ok: true, slot: meta.slot, item: itemId, replaced: oldId || null,
             before: before, after: after, delta: delta };
  }
  /* 卸下：退回背包 → 清空槽位 → 重算战力 */
  function unequipItem(slot){
    if(EQUIP_SLOTS.indexOf(slot) < 0) return { ok: false, reason: 'bad-slot' };
    const id = S.equipment[slot];
    if(!id){
      log(SLOT_NAME[slot] + '槽还是空的。', '');
      return { ok: false, reason: 'empty' };
    }
    const meta = ITEMS[id] || {};
    const before = combatPower();
    const put = addItemEx(id, meta.n || id);
    if(!put.ok && !put.mail){
      log('背包和信匣都写不进去，卸不下来。', 'bad');
      return { ok: false, reason: 'bag-full' };
    }
    S.equipment[slot] = null;
    save(); render(); renderBag();
    const delta = combatPower() - before;
    log('📦 卸下【' + (meta.n || id) + '】' + (put.mail ? '（背包已满，已暂存信匣）' : '') +
        '，战力 ' + fmt(Math.abs(delta)) + '。', put.mail ? 'bad' : '');
    sfx.pop();
    return { ok: true, slot: slot, item: id, before: before, after: combatPower(), delta: delta };
  }
  /* 槽位当前穿戴的物品名（供界面显示，空槽返回 null） */
  const equippedId = slot => (S.equipment && S.equipment[slot]) || null;
  const equippedMeta = slot => { const id = equippedId(slot); return id ? (ITEMS[id] || null) : null; };
  /* 第 95 轮 · 空槽要有话可说：背包里这个槽能装几件、最好的一件加多少战力。
     只读 S.bag 和 ITEMS，不新增任何结算口径。 */
  const SLOT_GLYPH = { weapon:'eq_qingfeng', armor:'eq_huxin', accessory:'eq_yupei' };  /* 一件都没有时借本门基础法宝的图当影子 */
  function equipCands(slot){
    let n = 0, top = null;
    for(let i = 0; i < S.bag.length; i++){
      const id = S.bag[i] && S.bag[i].t, m = ITEMS[id];
      if(m && m.slot === slot){
        n++;
        if(!top || (m.power || 0) > top.power) top = { id:id, n:m.n, img:m.img, power:m.power || 0, cls:m.cls };
      }
    }
    return { n:n, top:top };
  }
  /* 三个圈的点击落点：已穿 → 卸下；空着且背包有货 → 直接穿上最好的那件。
     卸下前那句 confirm 在 router 的监听里，这里是不弹框的纯逻辑口（测试也走这条）。 */
  function slotTap(slot){
    if(EQUIP_SLOTS.indexOf(slot) < 0) return { ok:false, reason:'bad-slot' };
    if(equippedId(slot)) return unequipItem(slot);
    const c = equipCands(slot);
    if(!c.top){
      const msg = SLOT_NAME[slot] + '槽尚无装备；可去城镇坊市购买，或洞府炼器坊炼制。';
      log(msg, ''); try{ if(window.toast) toast(msg); }catch(e){}
      return { ok:false, reason:'empty-slot' };
    }
    return equipItem(c.top.id);
  }
  /* 第三批 B2：一键装备——只把「空槽 + 背包里该槽最好的一件」穿上，复用 slotTap，不新造数值。
     已穿的槽不自动替换（避免替玩家做取舍）；返回本次穿上几件。 */
  function autoEquip(){
    let n = 0, slots = [];
    EQUIP_SLOTS.forEach(k => {
      if(equippedId(k)) return;
      const c = equipCands(k);
      if(!c.top) return;
      const r = equipItem(c.top.id);
      if(r && r.ok){ n++; slots.push(SLOT_NAME[k]); }
    });
    return { ok:n > 0, n, slots };
  }
  /* 刚装备的槽位记号：装备时面板可能没开 → renderRole 渲染到该槽时补一次发光 */
  let roleGlowSlot = null;
  /* ---------- 人物 · 装备面板 ---------- */
  /* ---------- 仙途道碑 · 里程碑（2026-10-25，逆向爆款共性补的"长线目标感"）----------
     参照样本：一念逍遥（多线养成 + 高频细碎数值刺激）、闲人修仙（未至之境不可见）、
     我的放置仙途（成就系统）。三者共有的、本作此前缺的一环是：**一串看得见、够得着的碑**。
     设计取舍：
     ① 自动发奖，不做"领取"按钮——放置游戏不该给玩家添操作负担
       （一念逍遥主策口径：日常 20 分钟解决，重复劳动一键化）；
     ② 未达成的一律遮为「？？？」只留一句暗示（闲人修仙"防剧透"），保住神秘感，
        也避免一进面板被二十几条目标压垮；
     ③ 奖励一律小额一次性（灵石/修为），不动数值框架、不产生每日可刷的收益。 */
  const MILES = [
    /* 卷一 · 道途（境界）*/
    { id:'m_qi3',  g:'道途', n:'引气入体', h:'吐纳满二十次，气自丹田生', t:() => (S.stats.sit | 0) >= 20,           rw:() => ({ exp: needOf(S.rank) * 0.5 }) },
    { id:'m_zhu',  g:'道途', n:'筑基成台', h:'气化为液，方谈筑基',       t:() => S.rank >= 9,                        rw:() => ({ stone: needOf(S.rank) * 1.0 }) },
    { id:'m_dan',  g:'道途', n:'金丹凝结', h:'丹成九转，寿元自增',       t:() => S.rank >= 12,                       rw:() => ({ stone: needOf(S.rank) * 1.5 }) },
    { id:'m_yuan', g:'道途', n:'元婴显化', h:'婴成于顶，可弃肉身',       t:() => S.rank >= 15,                       rw:() => ({ stone: needOf(S.rank) * 2.0 }) },
    { id:'m_hua',  g:'道途', n:'化神通达', h:'神游太虚，一念千里',       t:() => S.rank >= 18,                       rw:() => ({ stone: needOf(S.rank) * 3.0 }) },
    { id:'m_fei',  g:'道途', n:'飞升在望', h:'此去灵界，不问凡尘',       t:() => S.rank >= 25,                       rw:() => ({ stone: needOf(S.rank) * 6.0 }) },
    /* 卷二 · 道行（积累行为）*/
    { id:'m_sit',  g:'道行', n:'静坐百次', h:'坐得住，才修得成',         t:() => (S.stats.sit | 0) >= 100,           rw:() => ({ exp: needOf(S.rank) * 1.0 }) },
    { id:'m_hunt', g:'道行', n:'镇妖卅五', h:'塔高卅五，妖兽见你便绕道',     t:() => (S.towerMax | 0) >= 35,             rw:() => ({ stone: needOf(S.rank) * 1.0 }) },
    { id:'m_pill', g:'道行', n:'开炉三十', h:'丹炉不冷，道心不散',       t:() => (S.stats.craftPill | 0) >= 30,      rw:() => ({ stone: needOf(S.rank) * 1.0 }) },
    { id:'m_recipe',g:'道行', n:'丹方五卷', h:'五张旁方，皆从炉火里来',   t:() => variantCount() >= DAN_VARIANT_COUNT, rw:() => ({ stone: needOf(S.rank) * 2.0 }) },
    { id:'m_exp',  g:'道行', n:'秘境三十', h:'三十次探秘，还活着',       t:() => (S.stats.explore | 0) >= 30,        rw:() => ({ stone: needOf(S.rank) * 1.0 }) },
    { id:'m_gold', g:'道行', n:'灵石百万', h:'富家翁亦可为散修',         t:() => moneyInt(S.stats.stoneEarned) >= 1e6,   rw:() => ({ stone: needOf(S.rank) * 2.0 }) },
    /* 卷三 · 家业（洞府产业）*/
    { id:'m_field',g:'家业', n:'灵田十畦', h:'十畦灵田，自给自足',       t:() => S.field >= 10,                      rw:() => ({ stone: needOf(S.rank) * 1.0 }) },
    { id:'m_cave', g:'家业', n:'洞府五进', h:'五进庭院，可待客',         t:() => S.cave >= 5,                        rw:() => ({ stone: needOf(S.rank) * 1.0 }) },
    { id:'m_mine', g:'家业', n:'矿脉五道', h:'五道矿脉，取之不尽',       t:() => S.mine >= 5,                        rw:() => ({ stone: needOf(S.rank) * 1.0 }) },
    { id:'m_forge',g:'家业', n:'器坊三进', h:'炉火不熄，器自成',         t:() => S.forge >= 3,                       rw:() => ({ stone: needOf(S.rank) * 0.8 }) },
    /* 卷四 · 斗法 */
    { id:'m_tow10',g:'斗法', n:'镇妖十层', h:'入塔十层，方见真妖',       t:() => (S.towerMax | 0) >= 10,             rw:() => ({ stone: needOf(S.rank) * 1.0 }) },
    { id:'m_tow25',g:'斗法', n:'镇妖廿五层', h:'塔高廿五，妖王在望',     t:() => (S.towerMax | 0) >= 25,             rw:() => ({ stone: needOf(S.rank) * 2.0 }) },
    { id:'m_enh',  g:'斗法', n:'法宝十炼', h:'十次淬炼，器有灵',         t:() => (S.stats.enhance | 0) >= 10,        rw:() => ({ stone: needOf(S.rank) * 1.0 }) },
    { id:'m_pow',  g:'斗法', n:'战力十万', h:'一击之力，可裂山石',       t:() => combatPower() >= 1e5,               rw:() => ({ stone: needOf(S.rank) * 2.0 }) },
    { id:'m_rep',  g:'斗法', n:'论剑扬名', h:'论剑台上，有人记得你',     t:() => (S.arena.rep | 0) >= 100,           rw:() => ({ stone: needOf(S.rank) * 1.5 }) },
    /* 卷五 · 灵兽 */
    { id:'m_pet1', g:'灵兽', n:'初得灵兽', h:'有兽相伴，路途不孤',       t:() => (S.pets || []).length >= 1,         rw:() => ({ stone: needOf(S.rank) * 0.8 }) },
    { id:'m_pet3', g:'灵兽', n:'灵兽三头', h:'三头并进，声势不小',       t:() => (S.pets || []).length >= 3,         rw:() => ({ stone: needOf(S.rank) * 1.5 }) },
    { id:'m_petlv',g:'灵兽', n:'灵兽五阶', h:'养到五阶，才算入门',       t:() => (S.pets || []).some(p => (p.lv | 0) >= 5), rw:() => ({ stone: needOf(S.rank) * 2.0 }) },
    /* 卷六 · 宗门 */
    { id:'m_merit',g:'宗门', n:'仙盟立功', h:'为宗门出过一次力',         t:() => ((S.union || {}).merit | 0) >= 100, rw:() => ({ stone: needOf(S.rank) * 1.0 }) },
    { id:'m_merit2',g:'宗门',n:'功勋卓著', h:'宗门碑上，刻了你的字',     t:() => ((S.union || {}).merit | 0) >= 600, rw:() => ({ stone: needOf(S.rank) * 3.0 }) },
    /* 山门 · 弟子（第 61 节）：给这个新系统一块碑，长线目标里就有它的位置 */
    { id:'m_gate', g:'宗门', n:'开山立派', h:'在后山立起自己的山门',     t:() => ((S.gate || {}).lv | 0) >= 1, rw:() => ({ stone: needOf(S.rank) * 2.0 }) },
    { id:'m_gate2',g:'宗门', n:'桃李盈门', h:'山门里有八名弟子',         t:() => (((S.gate || {}).disciples) || []).length >= 8, rw:() => ({ stone: needOf(S.rank) * 4.0 }) },
    /* 弟子成长（第 62 节）：出师是一件"人会走"的事，值得一块碑 */
    { id:'m_gate3',g:'宗门', n:'薪火相传', h:'门下出师十人',             t:() => (((S.gate || {}).grad) | 0) >= 10, rw:() => ({ stone: needOf(S.rank) * 5.0 }) },
    /* 洞天开辟（第 70 节）：后期的长期横向项目，两块碑 */
    { id:'m_dt1',  g:'家业', n:'洞天初开', h:'于五方之外，辟一洞天',       t:() => DONGTIAN.some(c => dtLv(c.id) > 0),       rw:() => ({ stone: needOf(S.rank) * 1.0 }) },
    { id:'m_dt2',  g:'家业', n:'五方洞天', h:'五方洞天，皆成三重',         t:() => DONGTIAN.every(c => dtLv(c.id) >= DT_MAX), rw:() => ({ stone: needOf(S.rank) * 3.0 }) },
    /* W1「塔底」（第 109 轮）：三条分支共用同一方碑。碑记的是「这件事在世上立过」，
       分支差异只由 S.worldFoot 派生，绝不在道碑里再存一份事实（否则三块互斥碑永远有两块点不亮）。 */
    { id:'m_foot', g:'斗法', n:'塔下一线', h:'塔底那块石，被人翻过',       t:() => worldFootDone(),                       rw:() => ({ stone: needOf(S.rank) * 0.5 }) },
    /* W2「塔底余波」（第 110 轮）：三条路线各一方后续碑。判据一律写 false——
       这三块碑**只能由玩家在塔里亲手做出来**（worldAfterMark 直接写 S.miles 账本），
       自动扫描永远点不亮它们。于是既不动 checkMiles、也不会牵连任何一条既有"连立 N 碑"计数。 */
    { id:'m_foot_open', g:'斗法', n:'碑背同字', h:'两个人一起下过的塔，才算有人证', t:() => false, rw:() => ({}) },
    { id:'m_foot_self', g:'斗法', n:'袖里半枚', h:'没人看见的那一夜，留了个证据',   t:() => false, rw:() => ({}) },
    { id:'m_foot_seal', g:'斗法', n:'三下回声', h:'你封的石头，敲三下有回声',       t:() => false, rw:() => ({}) }
  ];
  const MILE_TOTAL = MILES.length;
  function milesDone(){ return MILES.filter(m => S.miles && S.miles[m.id]).length; }
  function milesNew(){ return (S.milesNew || []).length; }
  /* 检测：低频（3s 节流）扫一遍未达成的判据，命中即发奖 + 记一笔 */
  let lastMileAt = 0;
  function checkMiles(force){
    const now = Date.now();
    if(!force && now - lastMileAt < 3000) return 0;
    lastMileAt = now;
    let got = [];
    MILES.forEach(m => {
      if(S.miles[m.id]) return;
      let ok = false;
      try{ ok = !!m.t(); }catch(e){ return; }
      if(!ok) return;
      S.miles[m.id] = now;
      const rw = (typeof m.rw === 'function') ? (m.rw() || {}) : (m.rw || {});
      if(rw.stone > 0){ S.stone += rw.stone; S.stats.stoneEarned += rw.stone; }
      const gotMil = rw.exp > 0 ? addActiveExp(rw.exp) : 0;
      S.milesNew.push(m.id);
      got.push(m);
      log('✦ 道碑【' + m.n + '】—— 赏 ' + fmt(rw.stone || 0) + ' 灵石' +
          (gotMil > 0 ? ' + ' + fmt(gotMil) + ' 修为' : '') + '。', 'gold');
    });
    if(!got.length) return 0;
    save(); sfx.win();
    mileToast(got);
    renderMileDot();
    renderMiles();
    return got.length;
  }
  /* 达成提示：复用全局 #toast，不新增 DOM；多条合并为一条。
     连立多碑（新档/搬档瞬间全达成）时碑名全列出来会横贯整块屏幕 → 只报前三个 + 总数 */
  function mileToast(list){
    const t = document.getElementById('toast');
    if(!t) return;
    const names = list.map(m => m.n);
    t.textContent = list.length > 3
      ? '✦ 连立 ' + list.length + ' 道碑 · ' + names.slice(0, 3).join('、') + ' 等'
      : list.length > 1
        ? '✦ 连立 ' + list.length + ' 道碑 · ' + names.join('、')
        : '✦ 道碑 · ' + names[0];
    t.classList.add('show');
    clearTimeout(mileToast._t);
    mileToast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function milesMarkSeen(){
    if(!(S.milesNew || []).length) return;
    S.milesNew = [];
    save(); renderMileDot();
  }
  /* 碑脚落款用汉字日期（"十月廿五立"），比 "10月25日立" 短两字、也更像刻上去的 */
  function cnNum(n){
    const d = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
    if(n <= 10) return d[n] || '';
    if(n < 20) return '十' + d[n - 10];
    if(n === 20) return '二十';
    if(n < 30) return '廿' + d[n - 20];
    return '三十';
  }
  function fmtDay(ts){
    const d = new Date(ts || Date.now());
    return cnNum(d.getMonth() + 1) + '月' + cnNum(d.getDate());
  }
  /* 悟道树：人物面板里的一节。三路并排、每路五层；点了的节点亮起来，没点的留一个点。 */
  function renderWu(){
    const box = document.getElementById('xx-role-wu');
    if(!box) return;
    let html = '';
    Object.keys(WU_TREE).forEach(k => {
      const t = WU_TREE[k], lv = wuOf(k), c = wuCostOf(k);
      const cells = t.name3.map((n, i) => {
        const on = i < lv, cur = i === lv;
        return '<i class="wu-node' + (on ? ' on' : '') + (cur ? ' cur' : '') + '">'
          + '<b>' + (on ? n : '·') + '</b><small>+' + t.pct[i] + '%</small></i>';
      }).join('<span class="wu-line"></span>');
      html += '<div class="wu-row">'
        + '<div class="wu-name"><b><img class="wu-ic" src="' + t.icon + '" alt=""> ' + t.name + '</b>'
        + '<small>' + t.desc + ' +' + wuPct(k) + '%</small></div>'
        + '<div class="wu-nodes">' + cells + '</div>'
        + (lv >= WU_MAX
            ? '<em class="wu-full">已悟尽</em>'
            : '<button class="wu-btn" data-wu="' + k + '">' + fmt(c) + '</button>')
        + '</div>';
    });
    html += '<div class="wu-foot"><span>悟道值 <b>' + fmt(moneyInt(S.wisdom)) + '</b></span>'
      + '<span class="wu-note">天机阁与这里花的是同一笔</span>'
      + '<button class="wu-respec" data-wu-respec="1">洗点 · 返八成</button></div>';
    box.innerHTML = html;
    if(!box.dataset.d_binded){
      box.dataset.d_binded = '1';
      box.addEventListener('click', ev => {
        const b = ev.target.closest('[data-wu]');
        if(b){ ev.stopPropagation(); wuBuy(b.dataset.wu); }
        const rb = ev.target.closest('[data-wu-respec]');
        if(rb){ ev.stopPropagation(); wuRespec(); }
      });
    }
  }

  /* 2026-11-19 UI 第二批：道碑 31 条只读进度 + 3 块隐藏碑。
     只读 S 现成字段，不写存档、不改 MILES 判定；hidden 三块仍显示「？？？」。 */
  const MILE_HIDDEN = ['m_foot_open', 'm_foot_self', 'm_foot_seal'];
  const MILE_PROG = {
    m_qi3: () => [S.stats.sit | 0, 20],
    m_zhu: () => [S.rank | 0, 9], m_dan: () => [S.rank | 0, 12], m_yuan: () => [S.rank | 0, 15],
    m_hua: () => [S.rank | 0, 18], m_fei: () => [S.rank | 0, 25],
    m_sit: () => [S.stats.sit | 0, 100], m_hunt: () => [S.towerMax | 0, 35],
    m_pill: () => [S.stats.craftPill | 0, 30], m_recipe: () => [variantCount(), DAN_VARIANT_COUNT],
    m_exp: () => [S.stats.explore | 0, 30], m_gold: () => [moneyInt(S.stats.stoneEarned), 1e6],
    m_field: () => [S.field | 0, 10], m_cave: () => [S.cave | 0, 5],
    m_mine: () => [S.mine | 0, 5], m_forge: () => [S.forge | 0, 3],
    m_dt1: () => [DONGTIAN.some(c => dtLv(c.id) > 0) ? 1 : 0, 1],
    m_dt2: () => [DONGTIAN.filter(c => dtLv(c.id) > 0).length, 5],
    m_tow10: () => [S.towerMax | 0, 10], m_tow25: () => [S.towerMax | 0, 25],
    m_enh: () => [S.stats.enhance | 0, 10], m_pow: () => [combatPower(), 1e5],
    m_rep: () => [S.arena.rep | 0, 100],
    m_pet1: () => [(S.pets || []).length, 1], m_pet3: () => [(S.pets || []).length, 3],
    m_petlv: () => [Math.max(0, ...(S.pets || []).map(p => p.lv | 0)), 5],
    m_merit: () => [(S.union.merit | 0), 100], m_merit2: () => [(S.union.merit | 0), 600],
    m_gate: () => [((S.gate || {}).lv | 0), 1], m_gate2: () => [(((S.gate || {}).disciples) || []).length, 8],
    m_gate3: () => [(((S.gate || {}).grad) | 0), 10]
  };
  function renderMiles(){
    const box = document.getElementById('xx-role-miles');
    if(!box) return;
    const head = document.getElementById('xx-role-miles-sub');
    if(head) head.textContent = '已立 ' + milesDone() + ' / ' + MILE_TOTAL + ' 碑';
    const mEsc = s => String(s == null ? '' : s).replace(/[&<>"]/g,
      c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
    /* 2026-11-19 UI 第二批：未立碑不再一律「？？？」——显示碑名 + h 暗示 + 4px 进度；
       只有三块隐藏碑保留「？？？」。已立碑显示碑名 + 日期 + 满条。 */
    const groups = {};
    MILES.forEach(m => { (groups[m.g] = groups[m.g] || []).push(m); });
    let html = '';
    Object.keys(groups).forEach(g => {
      const arr = groups[g];
      const doneN = arr.filter(m => S.miles[m.id]).length;
      html += '<div class="miles-group">' + mEsc(g) + '<span>已立 ' + doneN + ' / ' + arr.length + '</span></div>';
      arr.forEach(m => {
        const at = S.miles[m.id];
        const hidden = !at && MILE_HIDDEN.indexOf(m.id) >= 0;
        const name = hidden ? '？？？' : m.n;
        const sub = at ? (fmtDay(at) + '立') : (hidden ? '碑面未显' : m.h);
        let bar = '';
        if(at){
          bar = '<div class="mile-bar"><i style="width:100%"></i></div>';
        }else if(!hidden && MILE_PROG[m.id]){
          const pr = MILE_PROG[m.id]();
          const goal = Math.max(1, Number(pr[1]) || 1);
          const cur = Math.max(0, Math.min(goal, Number(pr[0]) || 0));
          if(cur > 0){
            bar = '<div class="mile-bar"><i style="width:' + (cur / goal * 100).toFixed(1) + '%"></i></div>' +
              '<div class="mile-prog">' + fmt(cur) + ' / ' + fmt(goal) + '</div>';
          }
        }
        html += '<div class="mile ' + (at ? 'done' : 'lock') + '" title="' + mEsc(m.n + ' · ' + m.h) + '">' +
          '<i class="m-cap"></i><b>' + mEsc(name) + '</b><em>' + mEsc(sub) + '</em>' + bar + '</div>';
      });
    });
    box.innerHTML = html;
  }

  /* ===== 第三批 P0 · C1：今日清单（只聚合现有每日系统，不新造玩法/数值） ===== */
  function todayCountRows(){
    const rows = [];
    const reset = '08:00 重置';
    /* 七日签到 */
    rows.push({ name: '七日签到', icon: '🎁', sub: '第 ' + signDayLabel() + ' 天 · ' + reset,
      done: !signCanClaim(), state: signCanClaim() ? '可签' : '已签',
      claim: signCanClaim() ? 'sign' : '', go: '' });
    /* 日课 3 项 */
    try{
      (Daily.list() || []).forEach(t => {
        rows.push({ name: t.name, icon: t.icon || '📜',
          sub: '进度 ' + t.prog + ' / ' + t.goal + ' · ' + reset,
          done: !!t.claimed, state: t.claimed ? '已领' : (t.done ? '可领' : '进行中'),
          claim: (!t.claimed && t.done) ? ('daily:' + t.id) : '', go: '' });
      });
    }catch(e){}
    /* 行动次数 */
    const actName = { sit:'打坐', herb:'采药', train:'历练', enlight:'顿悟', ponder:'参悟' };
    Object.keys(BAL.actLimit || {}).forEach(k => {
      const lim = BAL.actLimit[k] | 0, used = (S.acts && S.acts[k]) | 0;
      const left = Math.max(0, lim - used);
      rows.push({ name: actName[k] || k, icon: '🧘', sub: '今日已用 ' + used + ' / ' + lim + ' 次 · ' + reset,
        done: left <= 0, state: left > 0 ? ('剩 ' + left + ' 次') : '今日已用完',
        claim: '', go: 'xiu:xx-acts' });
    });
    /* 灵田待收（非每日，但属于“现在就能做”的可见进展） */
    const ripe = ripeCount();
    rows.push({ name: '灵田待收', icon: '🌾', sub: ripe > 0 ? (ripe + ' 株成熟 · 随时可收') : '暂无成熟作物',
      done: ripe <= 0, state: ripe > 0 ? ('可收 ' + ripe + ' 株') : '等待生长',
      claim: '', go: 'dong:xx-field' });
    /* 坊市：免费刷新 / 寄售额度（B1 只显形现有规则） */
    rows.push({ name: '坊市免费刷新', icon: '🛒', sub: '剩 ' + (S.market.freeRefresh | 0) + ' / 1 次 · ' + reset,
      done: (S.market.freeRefresh | 0) <= 0, state: (S.market.freeRefresh | 0) > 0 ? '可用' : '已用完',
      claim: '', go: 'market' });
    rows.push({ name: '坊市寄售额度', icon: '💰', sub: (S.market.sold | 0) + ' / ' + BAL.marketSellMax + ' 件 · ' + reset,
      done: (S.market.sold | 0) >= BAL.marketSellMax, state: (BAL.marketSellMax - (S.market.sold | 0)) + ' 件余量',
      claim: '', go: 'market' });
    /* 秘境扫荡 */
    const secTotal = secretTotal();
    rows.push({ name: '秘境扫荡', icon: '🌀', sub: secTotal > 0 ? ('已通 ' + secTotal + ' 层 · ' + reset) : '尚未通关任何秘境',
      done: secTotal <= 0 || !!S.secret.swept, state: S.secret.swept ? '已扫荡' : (secTotal > 0 ? '可扫荡' : '未解锁'),
      claim: '', go: 'secret' });
    /* 塔扫荡 */
    const twCan = S.towerMax | 0, twDone = S.towerSwept | 0;
    rows.push({ name: '镇妖塔扫荡', icon: '🏯', sub: '已扫 ' + Math.min(twDone, twCan) + ' / ' + twCan + ' 层 · ' + reset,
      done: twCan <= 0 || twDone >= twCan, state: twDone >= twCan ? '已扫完' : ((twCan - twDone) + ' 层可扫'),
      claim: '', go: 'tower' });
    /* 论剑 */
    rows.push({ name: '论剑台', icon: '⚔️', sub: '今日剩 ' + (S.arena.left | 0) + ' 次 · ' + reset,
      done: (S.arena.left | 0) <= 0, state: (S.arena.left | 0) > 0 ? '可挑战' : '次数用尽',
      claim: '', go: 'arena' });
    /* 仙盟出战 */
    rows.push({ name: '仙盟出战', icon: '🏳️', sub: '今日剩 ' + (S.union.left | 0) + ' 次 · ' + reset,
      done: (S.union.left | 0) <= 0, state: (S.union.left | 0) > 0 ? '可出战' : '已出战',
      claim: '', go: 'event' });
    /* 山门议事 */
    rows.push({ name: '山门议事', icon: '📜', sub: '今日一条 · ' + reset,
      done: councilDone(), state: councilDone() ? '已议' : '待议',
      claim: '', go: 'zong:xx-council' });
    /* P2：宗门协力 Boss 入口 */
    if(gateLv()){
      const b = coopBossEnsure();
      rows.push({ name: '镇山妖王 · 协力', icon: '🐲', sub: '累计 ' + fmt(b.dmg) + ' / ' + fmt(b.hpMax) + ' · 周一 08:00 重置',
        done: b.dmg >= b.hpMax, state: Math.floor(b.dmg / b.hpMax * 100) + '%',
        claim: '', go: 'zong:xx-gate' });
    }
    return rows;
  }
  function renderToday(){
    const list = document.getElementById('today-list');
    const cd = document.getElementById('today-reset');
    if(cd){
      let doneN = 0, allN = 3;
      try{ const ts = Daily.list(); doneN = ts.filter(t => t.done).length; allN = ts.length; }catch(e){}
      cd.textContent = '已达成 ' + doneN + ' / ' + allN + ' 项 · 距重置 ' + fmtCd(nextDayResetMs());
    }
    if(!list) return;
    const rows = todayCountRows();
    list.innerHTML = lingchaoHtmlRow() + rows.map(r => {
      let btn = '<span></span>';
      if(r.claim){
        const attr = r.claim === 'sign' ? 'data-today-claim="sign"' : 'data-today-claim="' + r.claim + '"';
        btn = '<button type="button" ' + attr + '>领取</button>';
      }else if(r.go){
        btn = '<button type="button" class="ghost" data-today-go="' + r.go + '">去</button>';
      }
      return '<div class="today-row' + (r.done ? ' done' : '') + '">' +
        '<div class="tr-main"><b>' + (r.icon ? r.icon + ' ' : '') + r.name + '</b><small>' + r.sub + '</small></div>' +
        '<span class="tr-state">' + r.state + '</span>' + btn + '</div>';
    }).join('');
    renderTodayDot();
  }
  function renderTodayDot(){
    const d = document.getElementById('sc-today-dot');
    if(!d) return;
    let on = false;
    try{ on = signCanClaim() || dailyClaimable(); }catch(e){}
    d.classList.toggle('on', on);
  }
  function claimDailyToday(id){
    if(typeof Daily === 'undefined' || !Daily.claim) return;
    return Promise.resolve(Daily.claim(id)).then(r => {
      if(r && r.ok){ sfx.win(); settleDailyClaim(r); render(); renderToday(); }
      else log((r && r.msg) || '领取失败', 'bad');
    }, () => log('领取失败，请重试。', 'bad'));
  }
  function renderRole(){
    /* 页眉战力先写：拆页后札记/道碑/悟道三页没有属性表，也得照样填 */
    const powEl = document.getElementById('xx-role-pow');
    if(powEl) powEl.textContent = '战力 ' + fmt(combatPower());
    /* 第 88 轮 B：人物五页各自成页。这里不再「没属性表就整段早退」，
       每段只认自己那一页的元素在不在，进哪页就把哪页填满。 */
    const stats = document.getElementById('xx-role-stats');
    if(stats){
      const rows = [
        ['道号', S.name || '无名散修'],
        ['境界', RANK_NAMES[S.rank]],
        ['总战力', fmt(combatPower())],
        ['修为产出', fmt1(passiveRate()) + ' / 秒'],
        ['装备加成', '+' + fmt(equipPowerSum())]
      ];
      stats.innerHTML = rows.map(r =>
        '<div class="role-row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
    }
    /* 修行札记：累计统计（放置游戏的"这些年"） */
    const jr = document.getElementById('xx-role-journal');
    if(jr){
      const st = S.stats || {};
      const jRows = [
        ['打坐', fmt(st.sit || 0) + ' 次'],
        ['采药', fmt(st.herb || 0) + ' 次'],
        ['历练', fmt(st.train || 0) + ' 次'],
        ['顿悟', fmt(st.enlight || 0) + ' 次'],
        ['猎妖', fmt(st.hunt || 0) + ' 只'],
        ['炼丹', fmt(st.craftPill || 0) + ' 炉'],
        ['秘境探索', fmt(st.explore || 0) + ' 次'],
        ['法宝强化', fmt(st.enhance || 0) + ' 次'],
        ['灵石总收入', fmt(st.stoneEarned || 0)],
        ['镇妖塔最高', '第 ' + fmt(S.towerMax || 0) + ' 层']
      ];
      jr.innerHTML = jRows.map(r =>
        '<div class="stat"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
    }
    renderWu();        /* 悟道树（人物面板，在道碑之前） */
    renderMiles();     /* 仙途道碑（人物面板下半段） */
    if(typeof Story !== 'undefined') Story.renderInto();   /* 主线《断天门》履历（只回看，不是入口） */
    EQUIP_SLOTS.forEach(k => {
      const body = document.getElementById('es-' + k);
      if(!body) return;
      const slotEl = body.closest('.equip-slot');
      const id = equippedId(k);
      if(id){
        const m = ITEMS[id] || {};
        body.innerHTML = (m.img ? '<img src="' + m.img + '" alt="">' : '') +
          '<span class="es-name ' + (m.cls || '') + '">' + (m.n || id) + '</span>' +
          '<span class="es-pow">+' + fmt(m.power || 0) + '</span>';
        if(slotEl){
          slotEl.classList.add('filled'); slotEl.classList.remove('can-up');
          slotEl.title = '点击卸下【' + (m.n || id) + '】';
          if(roleGlowSlot === k){                     /* 刚穿上：亮起 + 发光脉冲 */
            slotEl.classList.remove('glow'); void slotEl.offsetWidth; slotEl.classList.add('glow');
          }
        }
      }else{
        /* 第 95 轮：旧版这里只有一个 rgba(.34) 的「空」字，落在 86px 的白圈里等于没写。
           现在圈里说三件事——这里收什么（淡墨影）、背包里有几件能装、最好的一件加多少战力。 */
        const c = equipCands(k);
        const glyph = (c.top && c.top.img) || (ITEMS[SLOT_GLYPH[k]] || {}).img || '';
        body.innerHTML = (glyph ? '<img class="es-ghost" src="' + glyph + '" alt="">' : '') +
          '<span class="es-empty">' + (c.top ? '可装 ' + c.n + ' 件' : '尚未到手') + '</span>' +
          '<span class="es-tip">' + (c.top ? '最好 +' + fmt(c.top.power) : SLOT_NAME[k] + '槽') + '</span>';
        if(slotEl){
          slotEl.classList.remove('filled', 'glow');
          slotEl.classList.toggle('can-up', !!c.top);
          slotEl.title = c.top ? '点击穿上【' + c.top.n + '】' : SLOT_NAME[k] + '槽还空着';
        }
      }
    });
    roleGlowSlot = null;
    renderCharSheet();
  }
  /* 第三批 B2：人物页（左立绘 / 右装备与四族法宝 / 下修为与寿元条）
     只读现有状态；法宝位点进去由 router 转炼制/强化页，动作不在此页办。 */
  function renderRoleArts(){
    const box = document.getElementById('xx-role-arts');
    if(!box) return;
    const forgeLv = bldLevel('forge');
    box.innerHTML = ART_FAMS.map(fam => {
      const f = ART_FAM[fam], seg = artSeg(fam), soul = rv4SoulAt(fam);
      const owned = seg > 0;
      let sub, badge;
      if(owned){
        sub = artEffectText(fam, seg) || f.lead;
        badge = '第 ' + seg + ' 阶' + (soul && soul.seg >= oldArtSeg(fam) ? ' · 兽魂' : '');
      }else{
        sub = f.lead;
        const rec = artById(fam, 1);
        badge = (rec && rec.reqLv > forgeLv) ? ('炼器坊差 ' + (rec.reqLv - forgeLv) + ' 级') : '尚未炼制';
      }
      return '<button type="button" class="art-slot ' + (owned ? 'owned' : 'locked') + '" data-art="' + fam + '" data-owned="' + (owned ? 1 : 0) + '"' +
        ' title="' + (owned ? (f.name + '第 ' + seg + ' 阶 · ' + sub + ' · 点击查看说明') : (f.name + ' · 尚未持有 · 点击查看说明')) + '">' +
        '<img src="' + f.img + '" alt="">' +
        '<b>' + f.name + '</b>' +
        '<small>' + sub + '</small>' +
        '<span class="as-badge">' + badge + '</span>' +
        '</button>';
    }).join('');
  }
  function renderCharSheet(){
    const sheet = document.getElementById('char-sheet');
    if(!sheet) return;
    const fig = document.getElementById('xx-role-figure');
    if(fig){
      const src = heroImg(S.sex || 'm');
      const key = src + ':' + (S.robe || '');
      if(fig.dataset.k !== key){ fig.dataset.k = key; fig.innerHTML = '<img src="' + src + '" alt="">'; }
    }
    setTxt('cs-name', S.name || '无名散修');
    setTxt('cs-rank', RANK_NAMES[S.rank]);
    const need = needOf(S.rank);
    const eb = document.getElementById('cs-expbar');
    if(eb) eb.style.width = Math.max(0, Math.min(100, S.exp / need * 100)).toFixed(1) + '%';
    const et = document.getElementById('cs-exptxt');
    if(et) et.textContent = (S.exp >= need && secludeLeftMs() <= 0)
      ? Math.round(S.exp / need * 100) + '% · 溢出 ' + fmt(S.exp - need)
      : fmt(S.exp) + ' / ' + fmt(need);
    const lb = document.getElementById('cs-lifebar');
    const lt = document.getElementById('cs-lifetxt');
    if(lt){
      if(isZuo()){ lt.textContent = '坐化'; if(lb) lb.style.width = '0%'; }
      else if(!lifeOn()){ lt.textContent = '未开'; if(lb) lb.style.width = '0%'; }
      else{
        const m = lifeMax();
        if(!isFinite(m)){ lt.textContent = '无量'; if(lb) lb.style.width = '100%'; }
        else{
          lt.textContent = '余 ' + Math.floor(lifeLeft()) + ' / ' + m + ' 年';
          if(lb) lb.style.width = Math.max(0, Math.min(100, lifeLeft() / m * 100)).toFixed(1) + '%';
        }
      }
    }
    renderRoleArts();
    const ab = document.getElementById('xx-role-auto');
    if(ab){
      let n = 0;
      EQUIP_SLOTS.forEach(k => { if(!equippedId(k) && equipCands(k).top) n++; });
      ab.textContent = n ? ('一键装备 · ' + n + ' 件可换') : '一键装备';
      ab.disabled = !n;
    }
  }
  /* ============ 道行拆账（第 77 节）：战力 / 修为 / 灵石逐项拆开，只读 ============ */
  function statBreakdown(){
    const powBase = 10 * POW_K * Math.pow(1.5, S.rank);
    const powMults = [
      { label: '功法', v: gongMult() },
      { label: '灵器 · ' + weaponName(S.weapon), v: weaponMult() },
      { label: '强化 +' + S.weaponLv, v: enhancePowMult() },
      { label: '洗练词条', v: affixPowMult() },
      { label: '悟道 · 锋芒', v: wuPowMult() },
      { label: '丹药 · 淬体', v: 1 + danPowPct() },
      { label: '战器 · ' + artName('bg'), v: 1 + artPowPct() },
      { label: '洞天', v: 1 + dtPowPct() / 100 }
    ];
    const expMults = [
      { label: '灵根 · ' + rootOf().name, v: rootOf().mult },
      { label: '境界', v: Math.pow(BAL.rankH, S.rank) },
      { label: '功法', v: gongMult() },
      { label: '灵器 · ' + weaponName(S.weapon), v: weaponMult() },
      { label: '强化 +' + S.weaponLv, v: enhanceExpMult() },
      { label: '洗练词条', v: affixExpMult() },
      { label: '道韵' + ((S.dao | 0) > 5 ? '（5 点后每点 +10%）' : ''), v: daoExpMult() },
      { label: '道统 · ' + (gens() > 0 ? '第' + gens() + '世' : '初世'), v: legacyMult() },
      { label: '转世印记', v: imprintExpMult() },
      { label: '道心 · 照镜 ' + Math.min(mirrorWins(), MIRROR.winCap) + ' 胜', v: mirrorExpMult() },
      { label: '奇遇', v: 1 + encBuff() },
      { label: '丹药 · 聚灵', v: 1 + danExpBuff() },
      { label: '悟道 · 归一', v: wuExpMult() },
      { label: '洞天', v: 1 + dtExpPct() / 100 }
    ];
    /* 道韵 × 道统 × 印记三条永久线合流后封顶 ×6.0，拆账里把「封顶折算」单独列一行，
       保证逐项相乘等于实际 total，不会出现「拆账乘出来比顶栏大」的假账。 */
    const chainRaw = daoExpMult() * legacyMult() * imprintExpMult();
    if(chainRaw > 6.0 + 1e-9) expMults.push({ label: '道统合流 · 封顶折算', v: 6.0 / chainRaw });
    /* 阶段二 N2：r18 起挂机被动另乘一档，拆账单独列一行，保证逐项相乘 = 实际被动速率 */
    if((S.rank | 0) >= 18) expMults.push({ label: '后期被动', v: latePassiveMult() });
    const stoneMults = [
      { label: '境界', v: Math.pow(BAL.stoneRankH, S.rank) },
      { label: '洞府 · 聚灵阵', v: Math.pow(BAL.caveR, caveLv()) },
      { label: '洗练词条', v: affixStoneMult() },
      { label: '道韵' + ((S.dao | 0) > 5 ? '（5 点后每点 +10%）' : ''), v: daoStoneMult() },
      { label: '悟道 · 地脉', v: wuStoneMult() },
      { label: '财器 · ' + artName('cai'), v: 1 + artStonePct() },
      { label: '洞天', v: 1 + dtStonePct() / 100 }
    ];
    return {
      power: {
        base: powBase, mults: powMults,
        flats: [{ label: '灵兽', v: petPowerSum() }, { label: '装备', v: equipPowerSum() }],
        total: combatPower()
      },
      exp: { base: BAL.v0, mults: expMults, total: passiveRate() },
      stone: { base: BAL.stone0, mults: stoneMults, total: stoneRate(), field: fieldPerSec() }
    };
  }
  function pwRow(k, v, cls){
    return '<div class="pw-row' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b>' + v + '</b></div>';
  }
  function pwSec(badge, title, total, rows, note){
    return '<section class="pw-sec">' +
      '<div class="pw-head"><span class="pw-badge">' + badge + '</span><h3>' + title + '</h3><b>' + total + '</b></div>' +
      rows + (note ? '<p class="pw-note">' + note + '</p>' : '') + '</section>';
  }
  function renderPower(){
    const body = document.getElementById('pw-body');
    if(!body) return;
    const b = statBreakdown();
    const sub = document.getElementById('pw-sub');
    if(sub) sub.textContent = (S.name || '无名散修') + ' · ' + RANK_NAMES[S.rank];
    const multRows = list => list
      .filter(m => Math.abs(m.v - 1) > 1e-6)
      .map(m => pwRow(m.label, '×' + m.v.toFixed(2))).join('');
    /* 战力 */
    let pRows = pwRow('境界底子 · ' + RANK_NAMES[S.rank], fmt(b.power.base), 'base') +
      multRows(b.power.mults);
    b.power.flats.forEach(f => { if(f.v > 0) pRows += pwRow(f.label, '+' + fmt(f.v), 'flat'); });
    const pNote = '功法 / 法宝 / 强化 / 词条 / 悟道 / 洞天都是乘区，灵兽与装备最后直接加。' +
      '战力影响斗法、镇妖塔与秘境守关，不直接产修为。';
    /* 修为 */
    let eRows = pwRow('基础 · 每秒修为', fmt1(b.exp.base), 'base') + multRows(b.exp.mults);
    const need = needOf(S.rank);
    const left = Math.max(0, need - S.exp);
    const secs = left / Math.max(1e-6, b.exp.total);
    const eNote = (secludeLeftMs() > 0)
      ? gateLockNote() + '。可做：' + gateGoals().join('、') + '。'
      : ((S.rank < TOP && left > 0)
        ? '距【' + RANK_NAMES[S.rank + 1] + '】还需 ' + fmt(left) + ' 修为，约 ' + fmtDur(secs) + '。'
        : (S.rank >= TOP ? '已到最高境界，修为只用于转世。' : '本层修为已满，去突破吧。'));
    /* 灵石 */
    const sRows = pwRow('基础 · 每秒灵石', fmt1(b.stone.base), 'base') + multRows(b.stone.mults) +
      (b.stone.field > 0 ? pwRow('灵田（独立加法）', '+' + fmt1(b.stone.field) + '/秒', 'flat') : '');
    const layerSec = need / Math.max(1e-6, b.exp.total);
    const sNote = '洞府聚灵阵每级 ×1.06；洗练的灵石词条、悟道地脉、洞天都在乘区里，灵田另算。' +
      '攒一层修为的工夫（约 ' + fmtDur(layerSec) + '）灵石进账约 ' + fmt(b.stone.total * layerSec) + '。';
    body.innerHTML =
      pwSec('力', '战力', fmt(b.power.total), pRows, pNote) +
      pwSec('修', '修为 / 秒', fmt1(b.exp.total) + '/秒', eRows, eNote) +
      pwSec('石', '灵石 / 秒', fmt1(b.stone.total) + '/秒', sRows, sNote);
  }
  function openPower(){
    const m = document.getElementById('power-modal');
    if(!m) return;
    renderPower();
    m.classList.remove('hidden');
  }
  function closePower(){
    const m = document.getElementById('power-modal');
    if(m) m.classList.add('hidden');
  }
  /* ===== 背包堆叠（batch7 跟进单）=====
     一格一件 → 一格一叠：同 id + 全部变型属性（除数量 q 外）完全相同才并。
     带个体身份的品类明确不并：装备/法宝（eg_/art_ 前缀或有装备槽的 ITEMS 条目）。
     容量仍按格算（S.bag.length），一格叠多少件都只占一格；数量只体现在 q 上。 */
  const BAG_STACK_NO_T = /^(eq_|art_)/;
  function bagQtyOf(it){ const q = it && Number(it.q); return (isFinite(q) && q > 0) ? Math.floor(q) : 1; }
  function bagStackKey(it){
    if(!it || !it.t) return null;
    if(BAG_STACK_NO_T.test(String(it.t))) return null;
    const meta = ITEMS[it.t];
    if(meta && (meta.slot || meta.type === 'equip')) return null;
    /* 键 = id + 除数量 q 外的全部字段（排序后序列化）；n 也参与，名字不同宁可不并 */
    const keys = Object.keys(it).filter(k => k !== 'q').sort();
    return keys.map(k => k + '=' + String(it[k])).join('\u0001');
  }
  /* 往背包加 qty 件：能并先并；不能并且满格 → 信匣（与 addItemEx 同口径，不丢） */
  function bagAddQty(t, n, qty, noMail){
    qty = Math.max(1, Math.floor(Number(qty) || 1));
    n = n || (ITEMS[t] || {}).n || t;
    const key = bagStackKey({ t: t, n: n });
    if(key){
      for(let i = 0; i < S.bag.length; i++){
        const it = S.bag[i];
        if(bagStackKey(it) === key){ it.q = bagQtyOf(it) + qty; return { ok: true, mail: false, merged: true }; }
      }
    }
    if(S.bag.length >= bagCap()){
      if(!noMail && stashOverflow(t, qty)) return { ok: false, mail: true };
      return { ok: false, mail: false };
    }
    const slot = { t: t, n: n, q: qty };
    S.bag.push(slot);
    return { ok: true, mail: false, merged: false };
  }
  /* 还能不能收下 1 件某物：已有同键叠格即使满格也能并；否则看剩余格数 */
  function bagCanAccept(t, n){
    n = n || (ITEMS[t] || {}).n || t;
    const key = bagStackKey({ t: t, n: n });
    if(key){
      for(let i = 0; i < S.bag.length; i++) if(bagStackKey(S.bag[i]) === key) return true;
    }
    return S.bag.length < bagCap();
  }
  /* 从某一格扣 qty 件；扣空即删格。返回实际扣掉的件数。 */
  function bagConsumeIdx(idx, qty){
    const it = S.bag[idx];
    if(!it) return 0;
    const have = bagQtyOf(it);
    const take = Math.min(have, Math.max(1, Math.floor(Number(qty) || 1)));
    if(have <= take) S.bag.splice(idx, 1);
    else it.q = have - take;
    return take;
  }
  /* 背包里某类物品的总件数（按 q 累加，不是格数） */
  function countItem(t){
    let n = 0;
    for(let i = 0; i < S.bag.length; i++){ const it = S.bag[i]; if(it && it.t === t) n += bagQtyOf(it); }
    return n;
  }
  function removeItems(t, n){
    n = Math.max(0, Math.floor(Number(n) || 0));
    for(let i = S.bag.length - 1; i >= 0 && n > 0; i--){
      const it = S.bag[i];
      if(!it || it.t !== t) continue;
      const q = bagQtyOf(it);
      if(q <= n){ n -= q; S.bag.splice(i, 1); }
      else { it.q = q - n; n = 0; }
    }
  }
  /* 储物袋扩容：+5 格，最多 50 */
  function buyBag(fromEl){
    if(S.bagSize >= BAG_CAP){ log('背包已扩到 ' + BAG_CAP + ' 格，装得下半个宗门了。', 'gold'); return; }
    const cost = bagCost();
    if(S.stone < cost){ const m='灵石不足，储物袋要 ' + fmt(cost) + ' 灵石（差 ' + fmt(cost - S.stone) + '）。'; log(m, 'bad'); try{ if(window.toast) toast(m); }catch(e){} return; }
    S.stone -= cost;
    S.bagSize = Math.min(BAG_CAP, S.bagSize + BAG_STEP);
    log('🎒 得储物袋一只，背包扩到 ' + S.bagSize + ' 格。', 'good');
    sfx.click(); save(); render(); renderBag();
    if(fromEl) spendFloat('-' + fmt(cost) + ' 灵石', fromEl);   /* 重绘后再定位：背包格子变多，按钮会下移 */
  }
  /* ============================================================
   * 生产建筑核心逻辑：升级（upgradeBuilding） + 炼制（craftItem）
   * 材料解析：stone/herb/ore/herb100/herb10000 走 S 计数器，其余走背包
   * ============================================================ */
  const MAT_COUNTERS = { stone: 'stone', herb: 'herb', ore: 'ore', herb100: 'herb100', herb10000: 'herb10000' };
  function matName(t){
    if(MAT_COUNTERS[t]) return { stone: '灵石', herb: '灵草', ore: '矿石', herb100: '百年灵草', herb10000: '万年灵草' }[t];
    return (ITEMS[t] || {}).n || t;
  }
  function matCount(t){ return MAT_COUNTERS[t] ? (S[MAT_COUNTERS[t]] || 0) : countItem(t); }
  function matHas(t, n){ return matCount(t) >= n; }
  /* 材料账统一口径（第 73 节）：灵石只写价格、不够标「不足」；其余材料写「名称 持有/所需」。
     洞天 / 炼丹 / 炼器 / 建筑升级 / 强化共用这一处，免得五套面板各说各话。 */
  function matLedger(list){
    return (list || []).map(m => m.t === 'stone'
      ? '灵石 ' + fmt(m.n) + (S.stone < m.n ? '（不足）' : '')
      : matName(m.t) + ' ' + Math.floor(matCount(m.t)) + '/' + m.n).join(' · ');
  }
  function matTake(t, n){ if(MAT_COUNTERS[t]) S[MAT_COUNTERS[t]] -= n; else removeItems(t, n); }
  function matGive(t, n){
    n = Math.max(0, Math.floor(Number(n) || 0));
    if(MAT_COUNTERS[t]) S[MAT_COUNTERS[t]] += n;
    else for(let i = 0; i < n; i++) addItem(t, (ITEMS[t] || {}).n || t);
  }

  /* 建筑当前等级 */
  function bldLevel(bld){ const m = BUILDINGS[bld]; return m ? Math.max(0, S[m.stateKey] | 0) : 0; }
  /* 建筑升级消耗：灵石（锚定境界需求 × K × R^级）+ 基础材料 */
  function bldUpgradeCost(bld){
    const m = BUILDINGS[bld];
    if(!m) return null;
    const lv = bldLevel(bld);
    return {
      stone: Math.floor(needOf(S.rank) * m.stoneK * Math.pow(m.costR, lv)),
      mats: m.upgradeMats(lv)
    };
  }
  /*
   * 建筑升级：1. 满级拦截 2. 材料校验 3. 扣除并 +1 级 4. 解锁新配方并提示
   * 等级收益：每级炼制成功率 +2%（炼丹房另带突破成功率 +2%）
   */
  function upgradeBuilding(bld, fromEl){
    const m = BUILDINGS[bld];
    if(!m) return { ok:false, reason:'建筑不存在' };
    const lv = bldLevel(bld);
    if(lv >= m.maxLevel){ log(m.name + '已到 ' + m.maxLevel + ' 级，炉火纯青，无可再升。', 'gold'); return { ok:false, reason:'已满级' }; }
    const cost = bldUpgradeCost(bld);
    /* P0/P1：资源不足时一次列全差什么（房内页与调用方据此给可见提示） */
    const miss = [];
    if(S.stone < cost.stone) miss.push('灵石差 ' + fmt(cost.stone - S.stone));
    for(const mm of cost.mats){
      if(!matHas(mm.t, mm.n)) miss.push(matName(mm.t) + '差 ' + (mm.n - Math.floor(matCount(mm.t))));
    }
    if(miss.length){
      const msg = '资源不足，升级' + m.name + '：' + miss.join('、') + '。';
      log(msg, 'bad');
      return { ok:false, reason: miss.join('、') };
    }
    S.stone -= cost.stone;
    cost.mats.forEach(mm => matTake(mm.t, mm.n));
    S[m.stateKey] = lv + 1;
    const unlocked = Object.keys(RECIPES).filter(k => RECIPES[k].bld === bld && RECIPES[k].reqLv === lv + 1);
    log('🏗️ ' + m.name + '升到 ' + (lv + 1) + ' 级（炼制成功率 +' + Math.round(CRAFT.ratePerLv * 100) + '%）' +
      (unlocked.length ? '，解锁配方：' + unlocked.map(k => RECIPES[k].name).join('、') : '') + '。', 'gold');
    sfx.win(); save(); render(); renderUps(); renderAlchemy(); renderForge();
    if(fromEl){ spendFloat('-' + fmt(cost.stone) + ' 灵石', fromEl); flashEl(fromEl.closest('.upg')); }
    return { ok:true, lv: lv + 1 };
  }
  /* P0（2026-11-20 修复单）：炼丹房/炼器坊升级改为本房页内办（B5 口径提前）；
     设施页只留镜像与进房入口，不再有第二套升级动作。 */
  function renderRoomUp(bld){
    const upId = bld === 'alchemy' ? 'xx-alchemy-up' : 'xx-forge-up';
    const btnId = bld === 'alchemy' ? 'xx-alchemy-upbtn' : 'xx-forge-upbtn';
    const upEl = document.getElementById(upId), btn = document.getElementById(btnId);
    const m = BUILDINGS[bld];
    if(!m || !upEl) return;
    const lv = bldLevel(bld);
    if(lv >= m.maxLevel){
      upEl.textContent = m.name + ' Lv.' + lv + ' · 已满级';
      if(btn){ btn.textContent = '已满级'; btn.disabled = true; btn.onclick = null; }
      return;
    }
    upEl.textContent = craftUpText(bld);
    if(btn){ btn.textContent = '升级'; btn.disabled = false; btn.onclick = function(){ roomUpgrade(bld); }; }
  }
  function roomUpgrade(bld){
    const r = upgradeBuilding(bld);
    const msg = document.getElementById(bld === 'alchemy' ? 'xx-alchemy-upmsg' : 'xx-forge-upmsg');
    if(msg){
      msg.textContent = (r && r.ok) ? ('升至 Lv.' + r.lv + '。') : ('未能升级：' + ((r && r.reason) || '原因未知'));
      msg.className = 'farm-msg ' + ((r && r.ok) ? 'good' : 'bad');
      if(msg._t) clearTimeout(msg._t);
      msg._t = setTimeout(function(){ msg.textContent = ''; msg.className = 'farm-msg'; }, 3600);
    }
  }  /* 配方灵石消耗：stoneK 优先（法宝 = need × K），否则取 mats 里的 stone */
  function recipeStoneCost(rec){
    if(rec.stoneK != null) return Math.floor(needOf(S.rank) * rec.stoneK);
    const s = (rec.mats || []).find(m => m.t === 'stone');
    return s ? s.n : 0;
  }
  /* 匠道修为读取：阶位 / 经验 / 升阶所需经验（九阶后 Infinity） */
  const masteryOf = bld => S.mastery[bld === 'alchemy' ? 'alchemyLv' : 'forgeLv'] || 1;
  const masteryExp = bld => S.mastery[bld === 'alchemy' ? 'alchemyExp' : 'forgeExp'] || 0;
  const masteryNeed = bld => MASTERY_EXP[masteryOf(bld) - 1] || Infinity;
  const masteryName = bld => (bld === 'alchemy' ? '丹师' : '器师');
  /* 炼制涨经验并尝试升阶：成功全额、失败 30%；升阶清余量、记日志（可连升） */
  function gainMasteryExp(bld, rec, success){
    const lvKey = bld === 'alchemy' ? 'alchemyLv' : 'forgeLv';
    const expKey = bld === 'alchemy' ? 'alchemyExp' : 'forgeExp';
    S.mastery[expKey] += MASTERY.expBase * rec.tier * (success ? 1 : MASTERY.failKeep);
    while(S.mastery[lvKey] < MASTERY.max && S.mastery[expKey] >= masteryNeed(bld)){
      S.mastery[expKey] -= masteryNeed(bld);
      S.mastery[lvKey]++;
      log('🎊 匠心凝练，' + masteryName(bld) + '修为升至【' + S.mastery[lvKey] + ' 阶】！' +
        masteryName(bld) + '所有炼制成功率 +' + Math.round(MASTERY.perTierRate * 100) + '%。', 'gold');
    }
    if(S.mastery[lvKey] >= MASTERY.max) S.mastery[expKey] = 0;   /* 九阶圆满，经验清零 */
  }
  /* 丹方旁支：正方与旁方共用一套炼制/成功率；旁方按正方炉数解锁 */
  function recipeById(recipeId){ return RECIPES[recipeId] || DAN_VARIANT_BY_ID[recipeId] || null; }
  function recipeNOf(baseId){ return Math.max(0, ((S.recipeN || {})[baseId] | 0)); }
  function variantUnlocked(baseId){
    const v = DAN_VARIANTS[baseId];
    return !!v && recipeNOf(baseId) >= v.need;
  }
  function variantCount(){ return DAN_VARIANT_LIST.filter(v => variantUnlocked(v.of)).length; }
  function variantNext(){
    for(const k of Object.keys(DAN_VARIANTS)){
      if(!variantUnlocked(k)) return { base: k, v: DAN_VARIANTS[k], n: recipeNOf(k) };
    }
    return null;
  }
  /* 同一枚丹药的任一传统配方都算正方炉数（含早于本节就存在的 dan2_core）；旁方本身不计数 */
  function variantBaseOf(rec){
    if(!rec || rec.bld !== 'alchemy') return null;
    if(DAN_VARIANT_BY_ID[rec.recipeId]) return null;   /* 旁方本身不反向计入正方炉数 */
    if(DAN_VARIANTS[rec.recipeId]) return rec.recipeId;
    const k = Object.keys(DAN_VARIANTS).find(id => DAN_VARIANTS[id].out === rec.out);
    return k || null;
  }
  /* 最终成功率 = 配方基础 + 建筑等级 × 2% + 匠道（阶位-1）× 1% + 青华洞天（仅炼丹），硬上限 95% */
  function craftRate(rec){
    const lv = bldLevel(rec.bld);
    const mst = masteryOf(rec.bld);
    const dt = rec.bld === 'alchemy' ? dtCraftPct() / 100 : 0;
    return Math.min(CRAFT.rateCap, rec.rate + lv * CRAFT.ratePerLv + (mst - 1) * MASTERY.perTierRate + dt);
  }
  /*
   * 核心炼制：1. 建筑等级门槛 + 匠道阶位门槛 2. 材料校验（含灵石、背包容量预检）3. 扣除
   *            4. 成功率判定 5. 成功产出（丹药入背包 / 法宝装备并重掷词条）/ 失败返还 30% 材料
   *            6. 无论成败均涨匠道经验（阶梯式成长的核心来源）
   */
  function craftItem(bld, recipeId, opts){
    opts = opts || {};
    const meta = BUILDINGS[bld];
    const rec = recipeById(recipeId);
    if(!meta || !rec || rec.bld !== bld){ log('配方有误。', 'bad'); return; }
    /* 旁方是"参透"出来的：没参透时即使拿到 id 也不许炼 */
    if(rec.of && !variantUnlocked(rec.of)){ log('这张旁方尚未参透。', 'bad'); return; }
    const lv = bldLevel(bld);
    /* batch5 图纸：只跳过炼器坊等级 + 器师阶位两条门槛，其余照卡 */
    if(opts.blueprint && !bpCount(opts.bpId)){ log('没有这张图纸了。', 'bad'); return; }
    /* 1a. 建筑等级门槛（高阶配方锁死在建筑等级上） */
    if(!opts.blueprint && lv < rec.reqLv){
      log('【' + rec.name + '】需' + meta.name + ' ' + rec.reqLv + ' 级（当前 ' + lv + ' 级），先去升级' + meta.name + '。', 'bad'); return;
    }
    /* 1b. 匠道阶位门槛：手艺不到，丹不成器不就 */
    const reqM = rec.reqM || 1;
    if(!opts.blueprint && masteryOf(bld) < reqM){
      log('【' + rec.name + '】需' + masteryName(bld) + ' ' + reqM + ' 阶（当前 ' + masteryOf(bld) + ' 阶）：多炼低阶积累匠道经验。', 'bad'); return;
    }
    /* 兽魂唯一持有：重复炼制在扣料/随机/涨经验之前直接拒绝。 */
    if(rec.soul && rv4HasSoul(rec.out)){
      log('已持有兽魂【' + rec.name + '】，无需重复炼制。', 'bad'); return;
    }
    /* 旧法器仍按旧法宝自己的阶位逐阶炼制；兽魂是独立旁挂，不受旧阶位拦截。 */
    if(rec.bld === 'forge' && rec.outLv && !rec.rv4 && oldArtSeg(rec.fam || 'lq') >= rec.outLv){
      log('已持有【' + artName(rec.fam || 'lq') + '】，无需回炉同阶或低阶。', 'bad'); return;
    }
    /* 2. 材料校验 */
    const stoneCost = recipeStoneCost(rec);
    if(S.stone < stoneCost){ log('灵石不足，炼【' + rec.name + '】要 ' + fmt(stoneCost) + ' 灵石。', 'bad'); return; }
    for(const m of rec.mats){
      if(m.t === 'stone') continue;
      if(!matHas(m.t, m.n)){
        log(matName(m.t) + '不足，炼【' + rec.name + '】要 ' + m.n + ' 个。', 'bad'); return;
      }
    }
    if(!rec.soul && rec.out !== 'weapon' && rec.out !== 'art' && !bagCanAccept(rec.out)){
      const m = '背包已满（' + bagCap() + ' 格），先腾地方或扩个储物袋再炼。';
      log(m, 'bad'); try{ if(window.toast) toast(m); }catch(e){}
      return;
    }
    /* A1 结算（2026-11-20）：扣料前拍快照，结算层每个数字都用「实际差值」回填，不看文案推测 */
    const stoneBefore = S.stone;
    const matBefore = {};
    rec.mats.forEach(m => { if(m.t !== 'stone') matBefore[m.t] = matCount(m.t); });
    const expBefore = masteryExp(bld), lvBefore = masteryOf(bld);
    /* 3. 扣除材料与灵石；图纸定向额外消耗 1 张图纸（成败都耗） */
    S.stone -= stoneCost;
    rec.mats.forEach(m => { if(m.t !== 'stone') matTake(m.t, m.n); });
    if(opts.blueprint && opts.bpId) S.blueprints[opts.bpId] = Math.max(0, bpCount(opts.bpId) - 1);
    /* 3b. 正方记炉数（旁方不反向计数）；失败也算练过——"炼废的也是经验" */
    let unlockedNow = null;
    const baseId = variantBaseOf(rec);
    if(baseId){
      if(!S.recipeN) S.recipeN = {};
      const n = recipeNOf(baseId) + 1;
      S.recipeN[baseId] = n;
      if(n === DAN_VARIANTS[baseId].need) unlockedNow = DAN_VARIANTS[baseId];
    }
    /* 4-6. 判定 + 结算 + 匠道经验 */
    const rate = craftRate(rec);
    const success = Math.random() < rate;
    let settleProduct = '';
    let settleBack = [];
    if(success){
      if(rec.soul){
        const fam = rec.fam, before = artSeg(fam);
        ensureRv4().souls.push(rec.out);
        const after = artSeg(fam);
        const effect = after > before
          ? '本族有效阶 ' + before + ' → ' + after + '，' + artEffectText(fam, after)
          : '旧法宝阶位更高，本族仍按第 ' + after + ' 阶生效，不叠加';
        log('⚒️ 兽魂【' + rec.name + '】炼成入魂；' + effect + '。', 'gold');
        settleProduct = rec.name + ' ×1（兽魂已收 · ' + effect + '）';
      }else if(rec.out === 'weapon' || rec.out === 'art'){
        const fam = rec.fam || 'lq';
        if(fam === 'lq'){
          const oldMult = weaponMult();
          S.weapon = rec.outLv;
          S.affix = rollAffix();               /* 换更高阶法宝：词条条数变多，一并重掷 */
          log('⚒️ 炼制成功！【' + rec.name + '】出炉，修炼速度 ×' + oldMult.toFixed(2) + ' → ×' + weaponMult().toFixed(2) + '。', 'gold');
          log('🎲 新法宝词条：' + affixText(S.affix), 'sys');
          settleProduct = rec.name + ' ×1（已佩戴 · 修炼速度 ×' + oldMult.toFixed(2) + ' → ×' + weaponMult().toFixed(2) + '）';
        }else{
          S.art[fam] = rec.outLv;              /* 三族各占一槽，换新的不重掷灵器词条 */
          log('⚒️ 炼制成功！【' + rec.name + '】佩戴上身，' + ART_FAM[fam].name + '第 ' + rec.outLv + ' 阶：' + artEffectText(fam, rec.outLv) + '。', 'gold');
          settleProduct = rec.name + ' ×1（已佩戴 · ' + ART_FAM[fam].name + '第 ' + rec.outLv + ' 阶）';
        }
      }else{
        addItem(rec.out, (ITEMS[rec.out] || {}).n || rec.name);
        if(bld === 'alchemy') S.stats.craftPill = (S.stats.craftPill || 0) + 1;   /* 炼丹次数（任务进度） */
        log('🧪 炼制成功！获得【' + rec.name + '】（成功率 ' + Math.round(rate * 100) + '%）。', 'gold');
        settleProduct = rec.name + ' ×1（已入背包）';
      }
      /* P1：高阶大成上世界通告（三阶及以上；沿用现有 tier，不另设阈值） */
      if((rec.tier | 0) >= 3){
        announce(rec.bld === 'alchemy' ? '炼丹大成' : '炼器大成',
          (S.name || '一位道友') + ' 炼成【' + rec.name + '】');
      }
      sfx.win();
    }else{
      /* 失败：返还 30% 材料（灵石不退）；青华洞天只加炼丹的返还，最高 100% */
      const refundRate = bld === 'alchemy'
        ? Math.min(1, CRAFT.failRefund + dtRefundPct() / 100)
        : CRAFT.failRefund;
      const back = [];
      rec.mats.forEach(m => {
        if(m.t === 'stone') return;
        const n = Math.floor(m.n * refundRate);
        if(n > 0){ matGive(m.t, n); back.push(matName(m.t) + '×' + n); settleBack.push({ t: m.t, n: n }); }
      });
      log('💨 炼制失败，炉火失控' + (back.length ? '，抢回部分材料：' + back.join('、') : '，材料尽化灰烬') + '。', 'bad');
      sfx.lose();
    }
    if(unlockedNow){
      log('📜 炉火之间，你参透了旁方【' + unlockedNow.name + '】——同丹同效，只换材料。', 'gold');
    }
    gainMasteryExp(bld, rec, success);
    /* A1：成败都必须有可对账的结算层（手动关闭，不自动消失；灵石不返还明写） */
    try{
      showCraftSettle({
        bld: bld, rec: rec, rate: rate, success: success,
        bpName: opts.blueprint ? ((BP_BY_ID[opts.bpId] || {}).name || '定向图纸') : '',
        stoneSpent: stoneBefore - S.stone,
        matBefore: matBefore, settleProduct: settleProduct, settleBack: settleBack,
        expBefore: expBefore, lvBefore: lvBefore,
        expRaw: Math.max(0, Math.round(MASTERY.expBase * rec.tier * (success ? 1 : MASTERY.failKeep)))
      });
    }catch(e){}
    save(); render(); renderBag(); renderAlchemy(); renderForge();
  }
  /* A1 结算层（炼器 / 炼丹先行版）：列账全部由底层状态差值回填。
     失败：消耗明细 + 返还明细 + 经验 + 灵石不返还声明；成功：消耗明细 + 成品 + 经验。
     只手动关闭（确认钮或点背板），绝不自动消失——这是玩家对账的唯一凭证。 */
  /* 第三批 B6：共用结算层（复用炼制结算的 DOM）。
     软结算：遮罩不吃点击（pointer-events:none），卡片自己可关——
     这样挂机途中弹结算不会挡住下一步操作；逐项列出本轮真实增减。 */
  function showSettle(d){
    const m = document.getElementById('craft-settle');
    if(!m || !d) return;
    const title = document.getElementById('cs-title');
    const sub = document.getElementById('cs-sub');
    const ico = document.getElementById('cs-ico');
    const box = document.getElementById('cs-rows');
    const note = document.getElementById('cs-note');
    if(ico) ico.textContent = d.icon || '📜';
    if(title) title.textContent = d.title || '结算';
    if(sub) sub.textContent = d.sub || '';
    if(box) box.innerHTML = (d.rows || []).join('');
    if(note) note.textContent = d.note || '逐项按实际状态列账；点「记下了」收起。';
    m.classList.toggle('soft', d.soft !== false);
    m.classList.remove('hidden');
  }
  const settleLine = (k, v, cls) => '<div class="cs-row' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b>' + v + '</b></div>';
  function settleDailyClaim(r){
    if(!(r && r.ok)) return;
    const rows = [];
    if(r.stone) rows.push(settleLine('灵石', '+' + fmt(r.stone), 'good'));
    if(r.wisdom) rows.push(settleLine('悟道值', '+' + fmt(r.wisdom), 'good'));
    if(!rows.length) rows.push(settleLine('奖励', '已按任务配置入账', 'good'));
    showSettle({ icon: '✅', title: '日课结算', sub: '今日任务达成 · 逐项列账', rows,
      note: '奖励按今日任务计算；领取记录与奖励一起保存。' });
  }
  function showCraftSettle(d){
    const m = document.getElementById('craft-settle');
    if(!m || !d || !d.rec) return;
    m.classList.remove('soft');
    const rec = d.rec;
    const rows = [];
    const line = (k, v, cls) => '<div class="cs-row' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b>' + v + '</b></div>';
    rows.push(line('消耗 · 灵石', '−' + fmt(d.stoneSpent) + '（不返还）', 'bad'));
    if(d.bpName) rows.push(line('消耗 · ' + d.bpName, '−1', 'bad'));
    rec.mats.forEach(mm => {
      if(mm.t === 'stone') return;
      rows.push(line('消耗 · ' + matName(mm.t), '−' + fmt(mm.n)));
    });
    if(!d.success){
      if(d.settleBack && d.settleBack.length){
        d.settleBack.forEach(b => rows.push(line('返还 · ' + matName(b.t), '+' + fmt(b.n) + '（按三成返还）', 'good')));
      }else{
        rows.push(line('返还', '无（材料尽化灰烬）', 'bad'));
      }
    }
    if(d.success && d.settleProduct){
      rows.push(line('成品', d.settleProduct, 'good'));
    }
    /* 匠道经验：原始增量如实给；发生升阶时附注（经验按阶消耗，属既有规则） */
    const lvAfter = masteryOf(d.bld);
    const maxed = lvAfter >= MASTERY.max;
    rows.push(line('匠道经验', (maxed ? '+0（' + masteryName(d.bld) + '九阶圆满）' : '+' + d.expRaw + (lvAfter > d.lvBefore ? '（升阶 ' + d.lvBefore + ' → ' + lvAfter + '）' : ''))));
    const title = document.getElementById('cs-title');
    const sub = document.getElementById('cs-sub');
    const ico = document.getElementById('cs-ico');
    const box = document.getElementById('cs-rows');
    const note = document.getElementById('cs-note');
    if(ico) ico.textContent = d.success ? '⚒️' : '💨';
    if(title) title.textContent = d.success ? '炼制成功' : '炼制失败';
    if(sub) sub.textContent = '【' + rec.name + '】 · 本次成功率 ' + Math.round(d.rate * 100) + '%';
    if(box) box.innerHTML = rows.join('');
    if(note) note.textContent = d.success ? '消耗与产出已按实际状态逐项列账。' : '灵石不返还；失败时已返还的部分材料逐项列明。';
    m.classList.remove('hidden');
  }
  /* 法宝名（灵器族按持有阶查表；wp1..wp4 与 wp5..wp9 同走这一处） */
  function weaponName(lv){
    const d = artById('lq', lv | 0);
    return d ? d.name : '无';
  }
  /* 法器名（按族查当前持有阶） */
  function artName(fam){
    const d = artById(fam, artSeg(fam));
    return d ? d.name : '无';
  }
  /* 建筑状态总览（UI 与测试用）：等级 / 上限 / 升级消耗 / 已解锁配方 */
  function buildingStates(){
    const out = {};
    Object.keys(BUILDINGS).forEach(k => {
      const m = BUILDINGS[k], lv = bldLevel(k);
      out[k] = {
        id: k, name: m.name, level: lv, maxLevel: m.maxLevel,
        upgradeCost: bldUpgradeCost(k),
        unlockedRecipes: Object.keys(RECIPES).filter(r => RECIPES[r].bld === k && RECIPES[r].reqLv <= lv)
      };
    });
    return out;
  }
  /* 可服食的丹药（详情弹窗据此决定显示「服食」还是「寄售」）：旧 36 枚 + rv4 专属 12 枚 */
  const EATABLE = DAN_LIST.concat(RV4_DAN_LIST).reduce((a, d) => { a[d.id] = 1; return a; }, {});
  /* 服食分派（第 89 节）：四族四种结算写成一张表，加一族只加一个分支而不是五段 if-else。
     老五枚（dan1..dan5）的结算语义与文案格式一字不改，只是把数字挪进了 DAN_FX。 */
  function eatDan(id, fromEl){
    const d = DAN_BY_ID[id] || RV4_DAN_BY_ID[id];
    if(!d) return false;
    const min = Math.round(BAL.pillDur / 60);
    const until = Date.now() + BAL.pillDur * 1000;
    if(d.fam === 'po'){
      const v = expRate() * d.exp;
      const got = addActiveExp(v);
      S.pillUntil = until; S.pillBonus = d.buff;
      log('💊 服下' + d.name + '，修为 +' + fmt(got) +
        '，突破成功率 +' + danPct(d.buff) + '（' + min + ' 分钟）', d.tier >= 2 ? 'gold' : 'good');
      gainFloat('+ ' + fmt(got) + ' 修为', fromEl || document.getElementById('sc-exp-num'));
    }else{
      danTake(d.fam, d);
      log('💊 服食「' + d.name + '」，' + danEffectText(d) + '。', d.tier >= 3 ? 'gold' : 'good');
      gainFloat('已生效 · ' + danEffectText(d), fromEl || document.getElementById('sc-exp-num'));
    }
    if(d.tier >= 2) sfx.win(); else sfx.score();
    markDayDec('grow');   /* 阶段三收尾：今日四类决策 · 成长投资（服食丹药） */
    return true;
  }
  function dropBagItem(idx){
    const it = S.bag[idx];
    if(!it) return;
    log('🗑️ 丢掉了「' + it.n + '」。', '');
    bagConsumeIdx(idx, 1);
    save(); render(); renderBag();
  }
  function eatItem(idx, force){
    const it = S.bag[idx];
    if(!it){ log('这件东西已经不在背包里了，请重新打开背包。', 'bad'); return; }
    /* force 由背包详情弹窗传入：'sell' 寄售 / 'drop' 丢弃 / 'eat' 服食。
       不传时按原规则自动判断（丹药服食、材料卖出），保证旧调用点行为不变。 */
    if(force === 'sell' || force === 'drop'){
      const m0 = ITEMS[it.t] || {};
      if(force === 'sell'){
        const sell = m0.sell || 0;
        if(!sell){ log('「' + it.n + '」无法寄售。', 'bad'); return; }
        S.stone += sell;
        log('💰 寄售「' + it.n + '」，灵石 +' + fmt(sell) + '。', 'good');
        sfx.pop();
      }else{
        confirmAction({
          icon:'🗑️', title:'背包 · 确认丢弃', okText:'确认丢弃',
          text:'物品：<b>' + escHTML(it.n) + '</b><br>数量：<b>1</b> 件',
          foot:'丢弃后不可找回。'
        }, ok => { if(ok) dropBagItem(idx); });
        return;
      }
      bagConsumeIdx(idx, 1);
      save(); render(); renderBag();
      return;
    }
    if(EATABLE[it.t]){
      eatDan(it.t);
    }else{
      /* 妖兽材料：点一下卖成灵石 */
      const meta = ITEMS[it.t];
      const sell = meta && meta.sell ? meta.sell : 0;
      if(sell){
        S.stone += sell;
        log('💰 卖掉「' + it.n + '」，灵石 +' + sell + '。', 'good');
        sfx.pop();
      }else{
        confirmAction({
          icon:'🗑️', title:'背包 · 确认丢弃', okText:'确认丢弃',
          text:'物品：<b>' + escHTML(it.n) + '</b><br>数量：<b>1</b> 件',
          foot:'此物暂时无用；丢弃后不可找回。'
        }, ok => { if(ok) dropBagItem(idx); });
        return;
      }
    }
    bagConsumeIdx(idx, 1);
    save(); render(); renderBag();
  }
  /* ---------- 背包物品详情弹窗 ----------
     点背包格子先弹详情（名称/图标/古风描述/用途/来历/寄售价），
     再由玩家决定服食、寄售还是丢弃——避免「想看一眼却被直接卖掉」。 */
  /* 当前详情窗指向的物品**对象**（不是下标）。
     `#it-acts` 是 index.html 里的静态节点，容器级委托只能挂一次（d_binded 锁），
     所以闭包里绝不能捕获 it/idx——否则第二次开窗后点「寄售/丢弃/装备」作用的仍是第一件物品。
     只用对象引用：点击时以 S.bag.indexOf(cur) 现取下标，这样即使详情窗开着期间背包被改动、
     物品位置变了，也不会误操作到别人身上。 */
  let itemCurIt = null;
  function showItemDetail(idx){
    const it = S.bag[idx];
    if(!it){ log('这件东西已经不在背包里了，请重新打开背包。', 'bad'); return; }
    const m = document.getElementById('item-modal');
    if(!m){ log('物品详情窗未加载，请刷新页面后再试。', 'bad'); return; }
    itemCurIt = it;
    const meta = ITEMS[it.t] || {};
    const setTxt = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    /* A31：详情里写的价必须与实际成交同源。旧代码显示 ITEMS 的固定 sell（如妖丹 30），
       而 sellMarket() 用的是随境界 / 行情 / 今日额度浮动的 sellPrice()，两者差了几个数量级。
       先 resetMarket() 把当日行情同步好（与坊市页同一入口、幂等），售价行与按钮都用这一份。 */
    resetMarket();
    const sellP = sellPrice(it.t);
    const ico = document.getElementById('it-ico');
    if(ico) ico.innerHTML = '<img src="' + (meta.img || 'ui/icons/ic_box.png') + '" alt="' + it.n + '">';
    const nm = document.getElementById('it-name');
    const itQ = bagQtyOf(it);
    if(nm){ nm.textContent = it.n + (itQ > 1 ? ' ×' + itQ : ''); nm.className = meta.cls || ''; }
    setTxt('it-desc',   meta.description || '此物来历不明，典籍未见记载。');
    setTxt('it-usage',  meta.usage       || '暂无用途记载');
    setTxt('it-source', meta.source      || '来历不明');
    setTxt('it-sell',   sellP ? (fmt(sellP) + ' 灵石（' + (meta.rv4Equip ? '固定寄售价' : '坊市实收，随行情浮动') + '）') : '不可寄售');
    /* 操作按钮：法宝给「装备」（置顶主按钮），丹药给「服食」，有售价的给「寄售」，任何物品都可「丢弃」 */
    const acts = document.getElementById('it-acts');
    if(acts){
      let html = '';
      if(meta.slot)     html += '<button class="btn-main" data-do="equip">' + inkIco('⚔️') + '装备（' + (SLOT_NAME[meta.slot] || '') + ' · 战力 +' + fmt(meta.power || 0) + '）</button>';
      if(EATABLE[it.t]) html += '<button class="btn-sub" data-do="eat">' + inkIco('💊') + '服食</button>';
      if(sellP)     html += '<button class="btn-sub" data-do="sell">' + inkIco('💰') + '寄售 ' + fmt(sellP) + ' 灵石</button>';
      html += '<button class="btn-ghost" data-do="drop">' + inkIco('🗑️') + '丢弃</button>';
      acts.innerHTML = html;
      if(!acts.dataset.d_binded){
        acts.dataset.d_binded = '1';
        acts.addEventListener('click', ev => {
          const b = ev.target.closest('[data-do]');
          if(!b) return;
          ev.stopPropagation();
          const act = b.dataset.do;
          /* 按**对象身份**重新定位索引，而不是信任打开详情那一刻的下标：
             详情窗开着期间 S.bag 可能被其它路径改动（获得/消耗/整理），
             旧下标会指向另一件物品。indexOf 找不到就说明这件已经没了，直接放弃。 */
          const cur = itemCurIt;
          closeItemDetail();
          if(!cur) return;
          const curIdx = S.bag.indexOf(cur);
          if(curIdx < 0){ log('这件物品已经不在了（可能已被用掉或卖掉）。', 'bad'); return; }
          if(act === 'equip'){
            const r = equipItem(cur.t);
            if(r.ok) showTreasure({ img: 'ui/icons/ic_train.png', name: '装备成功',
              desc: '战力提升了 ' + (r.delta >= 0 ? '+' : '') + fmt(r.delta) +
                    '，当前总战力 ' + fmt(r.after) + '。' + (r.replaced ? '（已换下旧装备）' : '') });
            return;
          }
          eatItem(curIdx, act);
        });
      }
    }
    const closeBtn = document.getElementById('it-close');
    if(closeBtn) closeBtn.onclick = closeItemDetail;
    m.classList.remove('hidden');
    sfx.pop();
  }
  function closeItemDetail(){
    /* 关窗即清游标：避免"上一件物品"在窗口关闭后仍被后续点击引用 */
    itemCurIt = null;
    const m = document.getElementById('item-modal');
    if(m) m.classList.add('hidden');
  }
  function buyField(fromEl){
    if(S.field >= BAL.fieldMax){ log('灵田已到 ' + BAL.fieldMax + ' 级，沃土千里。', 'gold'); return; }
    const cost = fieldCost();
    if(S.stone < cost){ const m='灵石不足，开垦灵田要 ' + fmt(cost) + ' 灵石（差 ' + fmt(cost - S.stone) + '）。'; log(m, 'bad'); try{ if(window.toast) toast(m); }catch(e){} return; }
    S.stone -= cost;
    S.field += 1;
    log('🌾 灵田开垦到 ' + S.field + ' 级' +
      (S.field <= BAL.plotCap
        ? '，田块开至 ' + S.field + '/' + BAL.plotCap + ' 块'
        : '，收获产量 +' + Math.round(S.field * BAL.plotYieldLv * 100) + '%') +
      '，每分钟自动凝 ' + (S.field * BAL.fieldPer) + ' 灵石。', 'good');
    sfx.click(); save(); render(); renderField();
    if(fromEl) spendFloat('-' + fmt(cost) + ' 灵石', fromEl);
  }
  function buyMine(fromEl){
    if(S.mine >= BAL.mineMax){ log('矿脉已到 ' + BAL.mineMax + ' 级，矿藏丰富。', 'gold'); return; }
    const cost = mineCost();
    if(S.stone < cost){ const m='灵石不足，开辟矿脉要 ' + fmt(cost) + ' 灵石（差 ' + fmt(cost - S.stone) + '）。'; log(m, 'bad'); try{ if(window.toast) toast(m); }catch(e){} return; }
    S.stone -= cost;
    S.mine += 1;
    log('⛏️ 矿脉开辟到 ' + S.mine + ' 级，每分钟产 ' + (S.mine * BAL.minePer) + ' 块矿石。', 'good');
    sfx.click(); save(); render(); renderMine();
    if(fromEl) spendFloat('-' + fmt(cost) + ' 灵石', fromEl);
  }

  /* ---------- 种田闭环：播种 → 生长 → 收获 → 直通炼丹房 ---------- */
  let farmSel = 'herb';                                     /* 面板上选中的作物（UI 态，不进存档） */
  const plotActAt = {};                                     /* A3：连点防重复（内存态，不进存档） */
  let farmMsgT = 0;
  /* A3（2026-11-20）：播种/收获的可见结果（田头浮字之外，再留一行文字结果，3 秒后收起） */
  function farmSay(text, bad){
    const el = document.getElementById('xx-farm-msg');
    if(!el) return;
    el.textContent = text || '';
    el.className = 'farm-msg' + (text ? (bad ? ' bad' : ' good') : '');
    if(farmMsgT) clearTimeout(farmMsgT);
    if(text) farmMsgT = setTimeout(function(){
      const e = document.getElementById('xx-farm-msg');
      if(e){ e.textContent = ''; e.className = 'farm-msg'; }
      farmMsgT = 0;
    }, 3200);
  }
  const plotCount = () => Math.min(S.field, BAL.plotCap);   /* 田块数 = 灵田等级（封顶 3×3） */
  const cropYield = c => Math.max(1, Math.round(c.yield * (1 + S.field * BAL.plotYieldLv)));
  const plotRipe  = p => !!p && (Date.now() - p.t0) >= p.need * 1000;
  const ripeCount = () => S.plots.reduce((n, p) => n + (plotRipe(p) ? 1 : 0), 0);
  const growingCount = () => S.plots.reduce((n, p) => n + (p && !plotRipe(p) ? 1 : 0), 0);
  const plotLeftTxt = p => fmtDur(p.need - (Date.now() - p.t0) / 1000);

  function plantPlot(i, cropId){
    const c = CROPS[cropId];
    if(!c){ farmSay('作物有误，未播种。', true); return; }
    if(i < 0 || i >= plotCount()){
      const m = '没有这块田，先去洞府面板开垦灵田吧。';
      farmSay(m, true); log(m, 'bad'); return;
    }
    if(S.plots[i]){
      const m = '这块田已经种下了。';
      farmSay(m, true); log(m, ''); return;
    }
    if(S.field < c.reqLv){
      const m = '【' + c.name + '】需灵田 ' + c.reqLv + ' 级才能播种（当前 ' + S.field + ' 级）。';
      farmSay(m, true); log(m, 'bad'); farmFxPop(i, '灵田 ' + c.reqLv + ' 级才可种'); return;
    }
    S.plots[i] = { crop: c.id, t0: Date.now(), need: c.grow };
    if(typeof window.Guide !== 'undefined') window.Guide.complete('field');
    log('🌱 第 ' + (i + 1) + ' 块田播下【' + c.name + '】，' + fmtDur(c.grow) + '后成熟。', 'sys');
    farmSay('第 ' + (i + 1) + ' 块田已播下【' + c.name + '】，' + fmtDur(c.grow) + '后成熟。', false);
    farmFxPop(i, '🌱 ' + c.name);
    sfx.pop(); save(); renderField();
  }
  function plantAll(cropId){
    const c = CROPS[cropId];
    if(!c){ farmSay('作物有误，未播种。', true); return; }
    if(S.field < c.reqLv){
      const m = '【' + c.name + '】需灵田 ' + c.reqLv + ' 级才能播种（当前 ' + S.field + ' 级）。';
      farmSay(m, true); log(m, 'bad'); return;
    }
    let n = 0; const skipped = [];
    for(let i = 0; i < plotCount(); i++){
      if(S.plots[i]){ skipped.push('第 ' + (i + 1) + ' 块已占用'); continue; }
      S.plots[i] = { crop: c.id, t0: Date.now(), need: c.grow };
      n++;
    }
    if(!n){
      const m = '没有空田可播' + (skipped.length ? '（' + skipped.join('、') + '）' : '') + '。';
      farmSay(m, true); log(m, '');
    }else{
      const m = '一键播种：' + n + ' 块种下【' + c.name + '】' + (skipped.length ? '；未种：' + skipped.join('、') : '') + '。';
      farmSay(m, false); log('🌱 ' + m, 'sys'); sfx.pop();
    }
    save(); renderField();
  }
  function harvestPlot(i){
    const p = S.plots[i];
    if(!p){ farmSay('这块田还是空的。', true); log('这块田还是空的。', ''); return; }
    if(!plotRipe(p)){
      const m = '【' + CROPS[p.crop].name + '】还在生长（剩 ' + plotLeftTxt(p) + '）。';
      farmSay(m, true); log(m, ''); return;
    }
    const c = CROPS[p.crop];
    const y = cropYield(c);
    S[c.out] += y;
    S.plots[i] = null;
    S.stats.farmN = (S.stats.farmN || 0) + 1;   /* 主线 2-2「田里第一茬」的进度（按畦计） */
    log('🌾 收获【' + c.name + '】×' + y + '，直入炼丹房料仓。', 'good');
    farmSay('收获【' + c.name + '】×' + y + '，已入炼丹房料仓。', false);
    sfx.pop(); save(); renderField(); farmFxPop(i, '+' + y + ' ' + c.name); renderResources();
  }
  function harvestAll(){
    const got = {}; let n = 0;
    S.plots.forEach((p, i) => {
      if(!p || !plotRipe(p)) return;
      const c = CROPS[p.crop];
      const y = cropYield(c);
      S[c.out] += y;
      got[c.name] = (got[c.name] || 0) + y;
      S.plots[i] = null;
      farmFxPop(i, '+' + y + ' ' + c.name);
      n++;
    });
    if(!n){ farmSay('田里还没有成熟的作物，再等等。', true); log('田里还没有成熟的作物，再等等。', ''); return; }
    S.stats.farmN = (S.stats.farmN || 0) + n;   /* 主线 2-2：一键收获同样按畦计入 */
    const txt = Object.keys(got).map(k => k + ' ×' + got[k]).join('、');
    log('🌾 一键收获 ' + txt + '，直入炼丹房料仓。', 'good');
    farmSay('一键收获：' + txt + '，已入炼丹房料仓。', false);
    showSettle({
      icon: '🌾', title: '收获结算', sub: '一键收获 ' + n + ' 畦 · 直入炼丹房料仓',
      rows: Object.keys(got).map(k => settleLine('产出 · ' + k, '+' + got[k], 'good')),
      note: '以上为本次实际入仓数；灵田按成熟作物照常收获。'
    });
    if(bldLevel('alchemy') >= 1 && S.herb >= RECIPES.dan1.mats[0].n)
      log('💡 料仓灵草已够开炉，去炼丹房炼【下品破境丹】吧。', 'sys');
    sfx.win(); save(); renderField(); renderResources();
  }
  function treasure(){
    const cost = treasureCost();
    if(S.stone < cost){ log('灵石不足，探索一次要 ' + fmt(cost) + ' 灵石。', 'bad'); return; }
    S.stone -= cost;
    const herb = 5 + Math.floor(Math.random() * 16);   /* 5~20 株灵草 */
    const ore = 5 + Math.floor(Math.random() * 16);    /* 5~20 块矿石 */
    S.herb += herb;
    S.ore += ore;
    S.stats.explore = (S.stats.explore || 0) + 1;   /* 探索次数（任务进度） */
    let extra = '灵草 +' + herb + ' 株 · 矿石 +' + ore + ' 块';
    log('🗺️ 探索秘境，采得灵草 +' + herb + ' 株、矿石 +' + ore + ' 块。', 'good');
    /* 高阶产出：百年/万年灵草（高阶破境丹的材料门槛，绑定探索这一高级来源） */
    if(Math.random() < 0.35){
      const n = 1 + Math.floor(Math.random() * 2);
      S.herb100 += n;
      extra += ' · 百年灵草 +' + n;
      log('🌿 灵脉深处竟有百年老药，采得百年灵草 ×' + n + '！', 'gold');
    }
    if(S.rank >= 15 && Math.random() < 0.15){
      S.herb10000 += 1;
      extra += ' · 万年灵草 +1';
      log('🌳 万载难逢的机缘！寻得万年灵草一株。', 'gold');
    }
    sfx.pop();
    save(); render(); renderResources();
    showTreasure({ name: '探索收获', img: 'ui/icons/herb.png', cls: 'good', desc: extra });
  }
  /* ---------- 猎妖（一念逍遥式：自动战斗挂机） ---------- */
  function startHunt(beastId){
    const beast = BEASTS.find(x => x.id === beastId);
    if(!beast) return;
    if(combatPower() < beast.power){ log('战力不足，打不过【' + beast.name + '】。' + powerGapAdvice(combatPower(), beast.power), 'bad'); return; }
    S.huntBeast = beastId;
    S.huntProg = 0;
    trace = null; traceT = 0; traceGap = TRACE.first;   /* 换猎场就重新等妖踪 */
    log('⚔️ 开始历练，狩猎【' + beast.name + '】。', 'good');
    sfx.click(); save(); render(); renderHunt(); renderTrace();
  }
  function stopHunt(){
    if(!S.huntBeast) return;
    S.huntBeast = null;
    S.huntProg = 0;
    trace = null; traceT = 0; traceGap = TRACE.first;
    log('收功，结束历练。', '');
    save(); render(); renderHunt(); renderTrace();
  }
  /* 一键最强：自动切到当前战力能打的最强妖兽（护肝） */
  function huntStrongest(){
    const cp = combatPower();
    let best = null;
    BEASTS.forEach(b => {
      if(S.rank >= b.rank && cp >= b.power){      /* 境界解锁 + 战力足够 */
        if(!best || b.power > best.power) best = b;
      }
    });
    if(!best){ log('暂无战力可打的妖兽，先去修炼提升境界吧。', 'bad'); return; }
    startHunt(best.id);
  }
  function huntTick(dt){
    if(!S.huntBeast || dt <= 0) return;
    const beast = BEASTS.find(x => x.id === S.huntBeast);
    if(!beast){ S.huntBeast = null; return; }
    if(combatPower() < beast.power){
      S.huntBeast = null; S.huntProg = 0;
      log('⚠️ 战力已不足以猎杀【' + beast.name + '】，自动猎杀已停止。', 'bad');
      return;
    }  /* 转世掉战力则停：明确告诉玩家「停了」，不再静默 */
    S.huntProg += dt * affixHuntMult();          /* 猎妖速度词条：加快击杀进度 */
    const kt = killTime(beast);
    let killed = 0;
    while(S.huntProg >= kt){ S.huntProg -= kt; killed++; }
    if(killed > 0){
      const meta = ITEMS[beast.drop];
      let bossCount = 0, added = 0;
      /* Boss 稀有材料优先掉落（每次击杀 1 个，稀有更有价值） */
      if(beast.boss && beast.bossDrop){
        const bmeta = ITEMS[beast.bossDrop];
        for(let i = 0; i < killed; i++){
          const r = bagAddQty(beast.bossDrop, bmeta ? bmeta.n : beast.bossDrop, 1, true);
          if(!r.ok) break;
          bossCount++;
        }
      }
      /* 普通材料填剩余空间（每次击杀 1 个） */
      for(let i = 0; i < killed; i++){
        const r = bagAddQty(beast.drop, meta ? meta.n : beast.drop, 1, true);
        if(!r.ok) break;
        added++;
      }
      /* 猎妖拾蛋（普通妖兽按品阶概率掉蛋；Boss 走首通必掉，不随机） */
      let eggGot = 0;
      if(!beast.boss){
        const rate = EGG_RATE[beast.tier] || 0.05;
        for(let i = 0; i < killed && S.eggs.length < BAL.petEggMax; i++){
          if(Math.random() < rate){ S.eggs.push({ bid: beast.id }); eggGot++; }
        }
      }
      /* Boss 首通奖励 */
      let first = false;
      if(beast.boss && !S.bossKilled[beast.id]){
        S.bossKilled[beast.id] = 1;
        first = true;
      }
      /* rv4 专属料：每次击杀按本兽系数独立试掉落；旧 Boss/通用料的 added、bossCount 与停猎判定不动。
         满格且不能并叠时整批转信匣，专属料本身绝不触发停猎，也不占新增背包容量。 */
      const rv4 = RV4_MAT_BY_BEAST[beast.id];
      let rv4Got = 0, rv4Mail = 0, rv4AutoMail = 0;
      if(rv4){
        for(let i = 0; i < killed; i++){
          if(Math.random() >= rv4.rate) continue;
          if(!bagCanAccept(rv4.id, rv4.n)){ rv4Mail++; continue; }
          const r = bagAddQty(rv4.id, rv4.n, 1);
          if(r.ok) rv4Got++; else if(r.mail){ rv4Mail++; rv4AutoMail++; }
        }
        if(rv4Mail > rv4AutoMail) stashOverflow(rv4.id, rv4Mail - rv4AutoMail);
        if(rv4Got > 0 || rv4Mail > 0) rv4Found(rv4.id);   /* 入包或入信都算真正取得；未命中不入谱 */
      }
      if(rv4Got > 0 || rv4Mail > 0){
        const text = rv4Got > 0
          ? '🧪 猎杀【' + beast.name + '】所得专属料「' + rv4.n + '」×' + rv4Got + ' 已入背包。'
          : '🧪 猎杀【' + beast.name + '】所得专属料「' + rv4.n + '」×' + rv4Mail + ' 已暂存信匣。';
        if(rv4Got > 0 && rv4Mail > 0)
          log(text.slice(0, -1) + '，另有 ×' + rv4Mail + ' 暂存信匣。', 'good');
        else log(text, rv4Got > 0 ? 'good' : '');
        renderBag();
        if(rv4Got > 0) lootFloat(rv4.id, rv4Got);
      }
      if(added > 0 || bossCount > 0){
        S.stats.hunt = (S.stats.hunt || 0) + killed;
        if(bossCount > 0){
          log('💎 猎杀【' + beast.name + '】×' + killed + '，掉落稀有「' + (ITEMS[beast.bossDrop] || {}).n + '」×' + bossCount + '。', 'gold');
        }else{
          log('🐾 猎杀【' + beast.name + '】×' + added + '，掉落「' + (meta ? meta.n : '') + '」×' + added + '。', 'good');
        }
        sfx.pop();
        renderBag();
        if(bossCount > 0) lootFloat(beast.bossDrop, bossCount);   /* 稀有先飘，普通后飘 */
        if(added > 0) lootFloat(beast.drop, added);
      }else{
        log('背包满了，妖兽材料放不下，自动猎杀已停止，先清理一下再来。', 'bad');
        S.huntBeast = null; S.huntProg = 0;
      }
      if(first){
        const bonus = needOf(S.rank) * 5;
        S.stone += bonus;
        S.stats.stoneEarned += bonus;
        log('🏆 首次击杀【' + beast.name + '】，首通奖励灵石 +' + fmt(bonus) + '！', 'gold');
        sfx.win();
        /* Boss 首通必掉其专属灵兽蛋 */
        if(S.eggs.length < BAL.petEggMax){
          S.eggs.push({ bid: beast.id });
          eggGot++;
          log('🥚 首杀【' + beast.name + '】，拾得其灵兽蛋一枚！', 'gold');
        }
      }
      if(eggGot > 0) log('🥚 猎杀中拾得【' + beast.name + '】妖兽蛋 ×' + eggGot + '。', 'gold');
      save();
    }
    /* 妖踪只在活体挂机里现身：离线补算的 dt 很大，不能在路上给玩家生一只已经过期的 */
    if(S.huntBeast && dt < 2) traceLiveTick(dt);
  }
  /* ---------- 妖踪（第 102 轮）----------
     猎妖是唯一「有收益但零输入」的挂机口：自动杀、材料自己进包，玩家可以完全不看。
     这里给它一只手——活体挂机每 70~130 秒偶尔现身一只「异种」，右下角浮出一块纸牌，
     十五息内可「追击」（高于当前妖兽 1.35 战力，掷骰定胜负：胜得灵石 + 稀有材料 + 概率蛋，
     败则猎场被搅、当前猎杀进度清零）或「放过」（拾得它留下的一缕灵纹，小份灵石）。
     不追、过期都只是遁走，不扣任何东西；离线补算（dt≥2s）不生成，纯活体事件。
     状态只在内存里（trace / traceT / traceGap），不入档、不参与离线结算。 */
  const TRACE = { life: 15, first: 70, gap: [80, 130], powerK: 1.35,
                  winStoneK: 0.18, letStoneK: 0.02, eggRate: 0.25, minK: 0.8 };
  let trace = null;          /* { bid, name, power, until } */
  let traceT = 0;            /* 本段猎妖累计的活体秒数 */
  let traceGap = TRACE.first; /* 下一只现身还差多少秒 */

  function traceLiveTick(dt){
    if(trace || document.hidden) return;
    if(!S.huntBeast){ traceT = 0; return; }
    traceT += dt;
    if(traceT >= traceGap) traceSpawn();
  }
  function traceSpawn(){
    const beast = BEASTS.find(x => x.id === S.huntBeast);
    if(!beast || trace) return false;
    traceT = 0;
    traceGap = TRACE.gap[0] + Math.random() * (TRACE.gap[1] - TRACE.gap[0]);
    trace = {
      bid: beast.id,
      name: '异种 · ' + beast.name,
      power: Math.max(1, Math.round(beast.power * TRACE.powerK)),
      until: Date.now() + TRACE.life * 1000
    };
    log('👣 林间有异动——一只「' + trace.name + '」现了身形，十五息内可追。', 'gold');
    sfx.pop();
    renderTrace();
    return true;
  }
  /* 倒计时与过期：挂在 tickLoop 每 500ms 一次；过期只是遁走，不扣东西 */
  function traceUiTick(){
    if(!trace) return;
    if(!S.huntBeast){ trace = null; renderTrace(); return; }
    if(Date.now() >= trace.until){
      const nm = trace.name;
      trace = null;
      log('👣 你慢了半息，「' + nm + '」遁入林雾。', '');
      renderTrace();
      return;
    }
    tracePaint();
  }
  function tracePaint(){
    if(!trace) return;
    const left = Math.max(0, trace.until - Date.now());
    const t = document.getElementById('tb-t'), fill = document.getElementById('tb-fill');
    if(t) t.textContent = Math.ceil(left / 1000) + 's';
    if(fill) fill.style.width = (left / (TRACE.life * 1000) * 100).toFixed(1) + '%';
  }
  function renderTrace(){
    const bar = document.getElementById('trace-bar');
    if(!bar) return;
    if(!trace || !S.huntBeast){ bar.classList.add('hidden'); return; }
    const beast = BEASTS.find(x => x.id === trace.bid);
    const img = document.getElementById('tb-img');
    if(img && beast && img.getAttribute('src') !== beast.img) img.src = beast.img;
    document.getElementById('tb-name').textContent = trace.name;
    const cp = combatPower(), ratio = cp / Math.max(1, trace.power);
    document.getElementById('tb-desc').textContent = '战力 ' + fmt(trace.power) +
      (ratio >= 1.2 ? ' · 你压得住' : ratio >= 0.9 ? ' · 胜负难料' : ' · 差 ' + fmt(trace.power - cp));
    const go = document.getElementById('tb-chase'), can = ratio >= TRACE.minK;
    if(go){ go.disabled = !can; go.textContent = can ? '追击' : '差得远'; }
    bar.classList.remove('hidden');
    tracePaint();
  }
  function traceChase(){
    if(!trace) return;
    const t0 = trace;
    trace = null;
    renderTrace();
    const beast = BEASTS.find(x => x.id === t0.bid);
    const my = combatPower() * (0.90 + Math.random() * 0.20);
    const op = t0.power * (0.90 + Math.random() * 0.20);
    const win = my >= op;
    let stone = 0, mat = null, matN = 0, egg = false;
    if(win){
      stone = Math.round(needOf(S.rank) * TRACE.winStoneK);
      S.stone += stone; S.stats.stoneEarned += stone;
      mat = beast ? (beast.boss && beast.bossDrop ? beast.bossDrop : beast.drop) : null;
      if(mat){
        const r = bagAddQty(mat, (ITEMS[mat] || {}).n || mat, 1, true);
        if(r.ok) matN = 1;
      }
      if(beast && !beast.boss && S.eggs.length < BAL.petEggMax && Math.random() < TRACE.eggRate){
        S.eggs.push({ bid: beast.id });
        egg = true;
      }
      log('👣 追击得手！「' + t0.name + '」伏诛，灵石 +' + fmt(stone) +
        (matN ? '、得「' + ((ITEMS[mat] || {}).n || mat) + '」' : '') + (egg ? '、拾得妖兽蛋一枚' : '') + '。', 'gold');
      gainChip('👣 妖踪得手 · 灵石 +' + fmt(stone), 'gold');
      sfx.win();
    }else{
      S.huntProg = 0;                                /* 落空：猎物搅了猎场，这一只从头再猎 */
      log('👣 追击落空，「' + t0.name + '」搅乱猎场遁走，猎杀进度从头再来。', 'bad');
      sfx.click();
    }
    save(); render(); renderHunt(); renderBag();
    if(battleAnim && document.getElementById('battle-modal') && beast){
      openBattleAnim(0, () => { render(); renderHunt(); renderBag(); }, {
        title: '妖踪 · <b>' + (beast ? beast.name : t0.name) + '</b>',
        mob: { name: t0.name, img: beast.img, hue: beast.hue || 0, boss: !!beast.boss },
        mobPower: t0.power,
        script: { win: win, rounds: 3 },
        loot: win ? { stone: stone, mat: matN ? mat : null, matN: matN }
                  : { text: '妖踪遁走，这一趟空手而归。' }
      });
    }
  }
  function traceLet(){
    if(!trace) return;
    const t0 = trace;
    trace = null;
    const stone = Math.round(needOf(S.rank) * TRACE.letStoneK);
    S.stone += stone; S.stats.stoneEarned += stone;
    log('👣 你按剑不动，「' + t0.name + '」走远了。循它留下的灵纹，拾得灵石 +' + fmt(stone) + '。', '');
    sfx.click(); save(); render(); renderTrace();
  }
  function initTrace(){
    const go = document.getElementById('tb-chase'), let_ = document.getElementById('tb-let');
    if(go) go.addEventListener('click', traceChase);
    if(let_) let_.addEventListener('click', traceLet);
  }

  /* ---------------- 沈碑主动来访（切片 2a：只展示，不接点击） ----------------
     npcTick 是「判定即消费」——一调用就可能写掉 cur.lastRank / promptTale / nudgeAt。
     所以这里先把「此刻能否立刻上屏」问完（npcVisitBlocked），全都过了才允许判定；
     判定出 fired 就当场摆上屏幕并立即落盘，中途不再有任何"算了不弹"的分支。
     60 秒节流的时间戳只在真正执行判定的那一行推进：界面被占用不算一次判定。 */
  const NPC_VISIT_MS = 15000;     /* 浮片存活 15 秒 */
  const NPC_TICK_MS  = 60000;     /* 冻结规格：60 秒最多判定一次 */
  let npcVisit  = null;           /* { type, until } —— 只活内存，不入档 */
  let npcVisitT = 0;              /* 15 秒自灭的定时器句柄（0=没挂） */
  let npcTickAt = 0;              /* 上次真正执行判定的时刻 */

  /* 八道门：任何一道没过就不许调 Npc.npcTick */
  function npcVisitBlocked(){
    const scene = document.getElementById('page-scene');
    if(!scene || !scene.classList.contains('active')) return true;   /* 面板页一律不弹 */
    if(document.hidden) return true;                                  /* 后台标签 */
    if(document.querySelector('.modal:not(.hidden)')) return true;    /* 全部覆盖层（含战斗/渡劫/剧情卡） */
    /* 2026-11-19 开局弹层调度：引导气泡、奇遇气泡在场时，来访也排队，不叠层 */
    try{
      const tb = document.getElementById('taixu-bubble');
      if(tb && tb.style.display !== 'none') return true;
      const eb = document.getElementById('enc-bubble');
      if(eb && !eb.classList.contains('hidden')) return true;
    }catch(e){}
    if(trace) return true;                                            /* 妖踪占同一角，先让它走完 */
    try{
      const st = window.Tutorial && Tutorial._state ? Tutorial._state() : null;
      if(st && st.step > 0 && !st.finished) return true;              /* 新手引导没走完 */
    }catch(e){}
    try{ if(window.TRIB && TRIB.busy) return true; }catch(e){}        /* 渡劫演出 */
    if(npcVisit) return true;                                         /* 同屏只留一张 */
    if(!document.getElementById('npc-visit')) return true;            /* 宿主 DOM 不在位 */
    return false;
  }
  function npcVisitPaint(){
    if(!npcVisit) return;
    const left = Math.max(0, npcVisit.until - Date.now());
    const t = document.getElementById('nv-t'), fill = document.getElementById('nv-fill');
    if(t) t.textContent = Math.ceil(left / 1000) + 's';
    if(fill) fill.style.width = (left / NPC_VISIT_MS * 100).toFixed(1) + '%';
  }
  /* 上屏：调用方已确认门控通过，这里只做 DOM 写入 */
  function npcVisitShow(d){
    const bar = document.getElementById('npc-visit'), txt = document.getElementById('nv-text');
    if(!bar || !txt) return false;
    txt.textContent = (d && d.text) || '';
    npcVisit = { type: (d && d.type) || '', until: Date.now() + NPC_VISIT_MS };
    bar.classList.remove('hidden');
    npcVisitPaint();
    markAsyncDirty();                              /* R8：异步来访上屏，强制主面板下一 tick 刷新 */
    if(npcVisitT) clearTimeout(npcVisitT);
    npcVisitT = setTimeout(npcVisitHide, NPC_VISIT_MS);
    return true;
  }
  function npcVisitHide(){
    if(npcVisitT){ clearTimeout(npcVisitT); npcVisitT = 0; }
    npcVisit = null;
    const bar = document.getElementById('npc-visit');
    if(bar) bar.classList.add('hidden');
  }
  /* 重开 / 转世：只收浮片与 15 秒定时器；60 秒节流保留——
     否则清档后的下一拍就会立刻再判一次，转世动画里凭空冒出一张新浮片。
     跨世 NPC 数据不在这里动（cur 由 resetForNewLife 自己清）。 */
  function npcVisitReset(){
    npcVisitHide();
  }
  /* 挂在 tickLoop（500ms）：有浮片只重绘倒计时；无浮片才节流判定 */
  function npcVisitTick(){
    if(!window.Npc || !S.npcs || !S.npcs.stele) return;
    if(npcVisit){
      /* 面板页一律不显示：浮片还在屏上时玩家进了人物/背包等面板，当场收掉 */
      const sc = document.getElementById('page-scene');
      if(!sc || !sc.classList.contains('active')){ npcVisitHide(); return; }
      npcVisitPaint();
      return;
    }
    const now = Date.now();
    if(now - npcTickAt < NPC_TICK_MS) return;
    if(npcVisitBlocked()) return;                 /* ★ 不推进节流：界面让开后再判 */
    npcTickAt = now;                              /* ★ 只有真判定才推进 */
    /* 记忆 NPC 框架第一步（改法一）：四类节点（转世／大境界／塔创新高／久未回归）统一调度，
       全局日额度 S.npcAct（制作人批 Q-1 甲）；台词里的 {rankName}/{prevName} 由真实存档填。
       **先判本层、再回落旧 npcTick**：大境界跨越由本层给「引用现境界+上次境界」的新台词；
       旧层保留 tale（旧事）等不在四类里的节点，避免功能倒退。两层同一拍只出一张浮片。 */
    if(window.NpcAct && S.npcAct && S.npcs.stele){
      const ctx = Object.assign(npcCtx(), {
        rankName: (typeof RANK_NAMES !== 'undefined' && RANK_NAMES[S.rank]) || '',
        prevName: (typeof RANK_NAMES !== 'undefined' && RANK_NAMES[(S.npcs.stele.cur && S.npcs.stele.cur.lastRank) | 0]) || ''
      });
      const d = NpcAct.pick(S.npcs.stele, ctx, S.npcAct);
      if(d){
        NpcAct.mark(S.npcs.stele, S.npcAct, d, ctx);
        /* 三条投递通道：现身/偶遇走右下角非模态浮片（现有 #npc-visit），
           塔创新高走信匣（复用 S.letters，见 pushNpcLetter）。 */
        if(d.channel === 'letter') pushNpcLetter(d.text);
        else npcVisitShow({ type: d.kind, text: d.text });
        save();
        return;
      }
    }
    const r = Npc.npcTick(S.npcs.stele, { now: now, gens: gens(), rank: S.rank });
    if(r && r.fired){ npcVisitShow(r.fired); save(); }
  }

  /* 切片 2c：点来访气泡 → 识人页。监听只在 boot 里绑一次（静态 DOM），
     不进 tick、不进 enter()；点击先收气泡并清掉 15s 定时器，再交给路由。
     进页后的重逢 / 见面 / 存档全部由 2b 的 npcPageEnter 生命周期负责，这里不重复调。 */
  function npcVisitOpen(){
    const bar = document.getElementById('npc-visit');
    if(!bar || bar.classList.contains('hidden') || !npcVisit) return;   /* 隐藏后不可点 / 防重复点击 */
    if(!window.ROUTER || !ROUTER.open) return;                          /* 路由未就绪：气泡原样留着 */
    npcVisitHide();                                                     /* 先收气泡 + 清 15s 定时器 */
    ROUTER.open('role', 'xx-role-npc');
  }
  function initNpcVisit(){
    const bar = document.getElementById('npc-visit');
    if(!bar || bar.dataset.bound) return;
    bar.dataset.bound = '1';
    bar.addEventListener('click', npcVisitOpen);
    bar.addEventListener('keydown', ev => {
      if(ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      npcVisitOpen();
    });
  }

  /* ---------------- 沈碑识人页（切片 2b：独立子页面，事件驱动渲染） ----------------
     渲染只发生在两个时机：进入页面（npcPageEnter）、玩家点选项（npcChoose）。
     绝不挂进 500ms 的 render() —— 对话页是"读"的地方，不该被 tick 反复重写整页 DOM。
     npcUi 是页面临时态：进入时的开场白快照、当前打开的话题、本次回复；
     只活内存、不落档，路由切到别的 view 即由 npcPageSync 清空。
     结算一律走 js/npc.js 的真实导出，这里不写任何关系/stage 规则。 */
  let npcUi = null;
  let npcStageShown = -1;   /* A5：沈碑关系阶段的 UI 侧记忆（只用于「关系动了」的一次信号，不落档） */
  const NPC_STAGE_NAME = ['初识', '已听碑史', '已信三千年', '已承诺'];
  function npcCtx(){
    const h = (S.legacy && S.legacy.hist && S.legacy.hist[0]) || null;
    /* 记忆 NPC 框架第一步：只多带三个「现成真值」供三态过期条件与主动节点引用，
       不新增存档字段、不派生新数字。
         worldFoot → 话题过期条件（塔底那条线动过没有）
         towerMax  → 主动节点「塔创新高」的引用槽位
         dayKey    → 主动触发日额度（S.day.key 的既有键） */
    return { now: Date.now(), gens: gens(), rank: S.rank,
      pastRankName: h ? (RANK_NAMES[h.rank] || '') : '',
      pastAge: h ? (h.age | 0) : 0,
      worldFoot: S.worldFoot || '',
      towerMax: S.towerMax | 0,
      /* 第二样本：关系事件挂主线已有节点；只传现成真值，不派生、不落档。 */
      storyClaimed: (S.story && S.story.claimed) || {},
      dayKey: (S.day && S.day.key) || '',
      dayNum: (function(){ const k = (S.day && S.day.key) || ''; return /^\d{4}-\d{2}-\d{2}$/.test(k) ? parseInt(k.slice(8), 10) : 0; })() };
  }
  /* 路由每次 enter / back 都过这里：进识人页走进入时序，切走就清页面临时态；
     进塔页走崔九进入时序（第 113 轮），切走同样清临时态 */
  /* ============ 组队秘境 · 联机（第 115 轮 T-704：真人组队副本，协议层 js/net.js，服务 server/server.mjs） ============
     事件驱动：multiEnter 只在进入/离开页面时机调，与崔九卡同一纪律；
     run_settle 的奖励入账不依赖页面（全局订阅挂一次），页面在就顺手刷。 */
  const MULTI_SRV_KEY = 'jxwd_multi_srv_v1';   /* 上次用的服务地址（独立键，不进主存档） */
  const MULTI_PATH_KEY = 'jxwd_multi_path_v1'; /* P1-A：上次选的道途（独立键，不进主存档；服务器登记值才是权威） */
  const MULTI_CREDITED_KEY = 'jxwd_multi_credited_v1';   /* 已入账的最近一局 runId（独立键，不动主存档结构；第 116 轮 P0-A 幂等） */
  function multiCreditedRun(){ try{ return localStorage.getItem(MULTI_CREDITED_KEY) || ''; }catch(e){ return ''; } }
  function multiMarkCredited(id){ try{ localStorage.setItem(MULTI_CREDITED_KEY, String(id || '')); }catch(e){} }
  let multiBound = false;                       /* 页面按钮是否已绑（DOM 重注入后要重绑） */

  function multiSrvDefault(){
    try{
      const raw = localStorage.getItem(MULTI_SRV_KEY) || '';
      const clean = window.SECT && typeof SECT._safeHost === 'function' ? SECT._safeHost(raw) : '';
      if(raw && !clean) localStorage.removeItem(MULTI_SRV_KEY);
      return clean;
    }catch(e){ return ''; }
  }
  function multiSrvRemember(addr){
    try{ addr ? localStorage.setItem(MULTI_SRV_KEY, addr) : localStorage.removeItem(MULTI_SRV_KEY); }catch(e){}
  }
  /* 红线①（2026-11-13 安全加固，客户端侧）：联机会话持久化（独立键，不进主存档）。
     刷新后能凭 token 回原队；只在 connect 成功与进出房间时落地；主动离开/转世/重开清空。
     安全约束（依据 evidence/TOKEN_SECURITY_DESIGN_20261112.md，客户端侧可落地部分）：
       - savedAt + TTL：写入带时间戳，超过最大重连窗口（30 天）视为失效，不再发死 token、不无限重试。
       - 重连失败区分网络错误（TIMEOUT/NETWORK/STREAM_FAIL）与 token 失效：网络错不清登录状态、允许稍后重试；
         token 失效才清键并提示重登（防「死 token 无限重试」循环，Muse 原件点名）。
       - 登出清理顺序：先 post leave 通知服务端，再清本地键（disconnect/多标签一致）；绝不删除游戏主存档/角色数据（红线③）。
       - 多标签竞态：监听 storage 事件，任一标签清键后其它标签同步断连，避免死 token 被另一标签续上。
       - 不把 token 写进日志/调试输出（XSS 防护：localStorage 本身仍可被注入读走，属已知缺口，待服务端会话失效+HttpOnly 迁移）。 */
  const MULTI_SESSION_KEY = 'jxwd_multi_session_v1';
  const MULTI_SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 天最大重连窗口（红线①）
  function multiLoadSession(){
    try{
      const s = localStorage.getItem(MULTI_SESSION_KEY);
      if(!s) return null;
      const o = JSON.parse(s);
      if(!o || typeof o !== 'object') return null;
      /* 红线① TTL fail-closed（GPT 独立审查阻断项修正）：
         缺失 / 非安全整数 / 非正数 / 未来时间戳 / 达到或超过 30 天，一律不重连并清键。
         旧格式（无 savedAt）会话直接作失效、要求重新登录——不让旧记录无限期绕过最大重连窗口。 */
      const now = Date.now();
      if(!Number.isSafeInteger(o.savedAt) || o.savedAt <= 0 || o.savedAt > now || now - o.savedAt >= MULTI_SESSION_TTL){
        try{ localStorage.removeItem(MULTI_SESSION_KEY); }catch(e){}
        return null;
      }
      return o;
    }catch(e){ return null; }
  }
  function multiSaveSession(partial){
    try{
      const s = multiLoadSession() || {};
      if(partial.token !== undefined) s.token = partial.token;
      if(partial.name !== undefined) s.name = partial.name;
      if(partial.base !== undefined) s.base = partial.base;
      if(partial.roomId !== undefined) s.roomId = partial.roomId;
      s.savedAt = Date.now();   // 每次落地刷新时间戳（红线① TTL）
      localStorage.setItem(MULTI_SESSION_KEY, JSON.stringify(s));
    }catch(e){}
  }
  function multiClearSession(){
    try{ localStorage.removeItem(MULTI_SESSION_KEY); }catch(e){}
  }
  /* 明确的登录状态/身份失效（服务器权威判定）——只有这些才清键要求重登。
     依据 server/server.mjs 实际返回码：join 重连 token 校验失败 = BAD_TOKEN；
     档案缺失 = NO_PROFILE；被顶号 = SUPERSEDED。其余一律不视为登录状态失效。 */
  function multiIsCredentialFailure(r){
    if(!r) return false;
    const c = r.code;
    if(c === 'BAD_TOKEN' || c === 'NO_PROFILE' || c === 'SUPERSEDED' ||
       c === 'TOKEN_EXPIRED' || c === 'AUTH_FAILED' || c === 'REVOKED' || c === 'KICKED') return true;
    return false;
  }
  /* 重连失败是否属可恢复的临时故障（保留登录状态、允许稍后重试）。
     依据 js/net.js 真实契约：TIMEOUT/NETWORK 在 code，STREAM_FAIL/流连接失败在 error 字段；
     环境缺 fetch、服务没响应等文本也在此列。 */
  function multiIsNetworkError(r){
    if(!r) return false;
    const c = r.code;
    if(c === 'TIMEOUT' || c === 'NETWORK' || c === 'STREAM_FAIL') return true;
    const e = (typeof r.error === 'string') ? r.error : '';
    if(e.indexOf('超时') >= 0 || e.indexOf('没响应') >= 0 || e === 'STREAM_FAIL' ||
       e.indexOf('流连接') >= 0 || e.indexOf('环境缺') >= 0 || e === 'NETWORK') return true;
    return false;
  }
  /* 红线①：登出/清会话统一入口，按原因区分但不混为同一种清理。
     顺序：先通知服务端 leave（若在线），再清本地键；绝不删游戏主存档/角色数据。
     reason: 'logout'(主动登出) | 'expired'(过期) | 'revoked'(被撤销) | 'lifecycle'(转世/重开) */
  function multiLogout(reason){
    reason = reason || 'logout';
    const finish = function(){ try{ multiClearSession(); }catch(e){} };
    if(window.Net && Net.state && Net.state() !== 'offline' && Net.me && Net.me()){
      try{
        /* 先 leave 通知服务端，再清本地（顺序约束）；leave 失败不阻塞清理 */
        Net.api('/api/room/leave').catch(function(){}).then(function(){ finish(); });
        return;
      }catch(e){ /* 落到 finish */ }
    }
    finish();
  }
  /* 红线①：多标签竞态保护。任一标签登出/清会话后，其它标签同步断连，
     避免「死 token 被另一未察觉的标签续上」。storage 事件只在发生变更的"其它"标签触发。 */
  let multiStorageHooked = false;
  function hookMultiStorage(){
    if(multiStorageHooked || typeof window === 'undefined' || !window.addEventListener) return;
    multiStorageHooked = true;
    window.addEventListener('storage', function(e){
      if(e && e.key === MULTI_SESSION_KEY && (!e.newValue || e.newValue === '')){
        if(window.Net && Net.state && Net.state() !== 'offline'){
          try{ Net.disconnect(); }catch(_){}
        }
      }
    });
  }
  /* P1-A：道途偏好（只是"下次连服务时报哪个"，不是权威值；权威在服务器 player.path） */
  function multiLoadPath(){
    // P1-C：本源为 S.path；未选('')返回 ''（触发补选），不回退旧缓存、不默认 sword（GPT 审查矛盾 A）
    return (typeof S.path === 'string' && PATH_IDS.indexOf(S.path) >= 0) ? S.path : '';
  }
  function multiSavePath(id){
    try{ if(id) localStorage.setItem(MULTI_PATH_KEY, String(id)); }catch(e){}
  }
  /* 服务器没给 play 时客户端报自己的战力（副本判定在服务器，这里只是快照） */
  function multiPower(){ try{ return Math.max(1, Math.floor(combatPower())); }catch(e){ return 100; } }
  /* P0-B（第 118 轮）：构造"受钳制养成快照"——原始养成输入，服务器据此重算破层战力。
     核心输入（rank/gong/weapon/weaponLv）送原始值由服务器钳制后重算；其余乘/加项送客户端已算好的
     百分比/分数/加和，服务器按对应单位钳制后代入 combatPower 公式。异常时返回 null → 服务器走 legacy。 */
  function multiSnapshot(){
    try{
      const gongLvs = GONGS.map(g => Math.max(0, Math.min(S[g.id] | 0, g.max)));
      return {
        rank: Math.max(0, S.rank | 0),
        gongLvs: gongLvs,
        weapon: Math.max(0, Math.min(9, S.weapon | 0)),
        weaponLv: Math.max(0, Math.min(BAL.enhanceMax, S.weaponLv | 0)),
        affixPct: affixSum('pow') || 0,     // 百分比制
        wuPct: wuPct('sword') || 0,         // 百分比制
        artBgPct: artPowPct() || 0,         // 分数制（ART_FX.bg[seg]）
        danPowPct: danPowPct() || 0,        // 分数制（淬体丹，过期为 0）
        dtPowPct: dtPowPct() || 0,          // 百分比制（洞天）
        petPower: petPowerSum() || 0,        // 加区：出战灵兽总战力
        equipPower: equipPowerSum() || 0     // 加区：装备三槽总战力
      };
    }catch(e){
      /* #75：这里不再返回 null。服务器 legacy 回退已默认关闭，空快照会被直接拒绝，
         用户将完全进不了联机。改为回报"零养成"快照：服务器重算≈1000，既保证能进，
         又不把客户端自报战力当真相（防作弊边界不变）。 */
      try{ log('⚠️ 读取养成状态失败，本次联机按最低战力同步。', 'note'); }catch(_e){}
      return { rank: 0, gongLvs: [0, 0, 0], weapon: 0, weaponLv: 0, affixPct: 0, wuPct: 0, artBgPct: 0, danPowPct: 0, dtPowPct: 0, petPower: 0, equipPower: 0 };
    }
  }

  function multiEnter(){
    hookMultiStorage();   // 红线①：多标签竞态保护（幂等注册；存储变更在其它标签触发）
    if(window.Net && Net.state() !== 'offline' && !multiNetHooked){ hookMultiNet(); }
    /* P0-C：刷新后若仍有"在房间内"的上次联机会话，自动重连回原队（不再让用户重登重进） */
    if(window.Net && Net.state() === 'offline'){
      /* 红线①：区分「本来就没有会话」与「旧会话被 TTL fail-closed 清掉」，
         后者必须提示重新登录，并明确说明角色/存档数据不受影响（GPT 独立审查意见）。 */
      let hadSession = false;
      try{ hadSession = !!localStorage.getItem(MULTI_SESSION_KEY); }catch(e){}
      const s = multiLoadSession();
      if(hadSession && !s){
        log('📡 上次联机记录已过期（超过 30 天），请重新登录；角色与存档数据不受影响。', 'note');
      }
      if(s && s.token && s.base && s.roomId){
        log('📡 正在重接连机服务，回到上次的队伍…', 'note');
        Net.connect(s.base, s.name || '道友', multiPower(), s.token, multiSnapshot(), multiLoadPath()).then(r => {
          if(!r.ok){
            /* 红线①：三类区分（GPT 独立审查补正）。
               ① 明确登录状态失效（BAD_TOKEN/NO_PROFILE/SUPERSEDED 等服务器权威判定）→ 清键、要求重登；
               ② 可恢复临时故障（TIMEOUT/NETWORK/STREAM_FAIL/超时文本）→ 保留登录状态、稍后重试；
               ③ 其余未知错误 → 保守保留登录状态，不误清有效 token，只提示暂未接受。 */
            if(multiIsCredentialFailure(r)){
              multiClearSession();
              log('📡 联机会话已失效，请重新登录。', 'bad');
            } else if(multiIsNetworkError(r)){
              log('📡 重连未成功（网络/服务暂不可达）：' + (r.error || '服务没响应') + '，稍后再试。', 'note');
            } else {
              log('📡 服务器暂未接受重连（' + (r.code || '未知原因') + '），登录状态已保留，可稍后重试。', 'note');
            }
            renderMulti(); bindMultiDom(); return;
          }
          hookMultiNet();
          if(r.me && r.me.path){
            /* GPT 代码审查③：r.me.path 先白名单校验；冲突须实际登记、不污染缓存 */
            const sp = (typeof r.me.path === 'string' && PATH_IDS.indexOf(r.me.path) >= 0) ? r.me.path : '';
            if(!sp){
              /* 服务器道途非法：不动本源、不写缓存 */
            } else if(typeof S.path !== 'string' || PATH_IDS.indexOf(S.path) < 0){
              S.path = sp; multiSavePath(sp);        // 本地未选才补全本源 + 缓存
            } else if(S.path !== sp){
              /* 本地与服务器均有效但不一致：保留本地、登记冲突、停覆盖、不污染缓存 */
              log('⚠️ 道途冲突：本地【' + pathName(S.path) + '】与服务器【' + pathName(sp) + '】不一致，保留本地道途。', 'bad');
            } else {
              multiSavePath(sp);                      // 一致：同步缓存
            }
          }
          if(r.resumed){
            log('📡 已连回原队伍（' + (Net.data().room ? Net.data().room.name : '进行中') + '）。', 'good');
          } else {
            /* token 失效（服务器重启/被踢）：清会话，正常登录 */
            multiClearSession();
          }
          renderMulti(); bindMultiDom();
        }).catch(function(){
          /* 红线①：Net.connect 契约上返回 {ok:false}，但流/依赖异常仍可能 reject；
             兜底为「临时故障」保留登录状态、不清键，避免未处理 Promise rejection 与误登出。 */
          log('📡 重连异常中断（连接未完成），登录状态已保留，可稍后重试。', 'note');
          renderMulti(); bindMultiDom();
        });
        return;
      }
    }
    renderMulti();
    bindMultiDom();
  }
  function multiExit(){
    /* 离开页面不清连接（后台仍在线、结算照常入账），只把页面引用放下 */
  }

  let multiNetHooked = false;
  /* 旧版把"已入账 runId"存在独立键里（第 116 轮），第 123 轮改为存进主存档。
     老档升级时把那条遗留标记搬进新表，避免升级后重投一次旧局。 */
  let multiCreditSeeded = false;
  function multiSeedLegacyCredit(){
    if(multiCreditSeeded) return;
    multiCreditSeeded = true;
    try{
      const old = multiCreditedRun();
      if(old && window.MultiLedger) window.MultiLedger.claim(S, old);
    }catch(e){}
  }
  /* 保存失败的后备重试（第 124 轮）：内存里已经记了账，本机存档没写进去。
     不回滚——回滚等于把这次结算直接抹掉，事件若不重投就永久丢奖；
     保留内存态 + 稍后重试保存，最坏情况是玩家刷新后由重投补一次（至多补一次，不会丢）。
     第 125 轮复核意见 H3：重试用尽后必须留一条明确的失败记录（含 runId），
     否则"没写进去"这件事在日志里彻底消失，事后无从追。 */
  function multiSaveRetry(times, rid){
    let n = 0;
    const tick = () => {
      n++;
      if(save()) return;
      if(n < times){ setTimeout(tick, 1200 * n); return; }
      log('❌ 存档连续 ' + times + ' 次保存失败，本次结算（本局编号 ' + (rid || '未知') + '）尚未保存。刷新页面后可重新结算；若仍未到账，请保留这条记录。', 'bad');
      try{ console.warn('[multi] settle save failed after retries, runId=' + (rid || 'unknown')); }catch(e){}
    };
    setTimeout(tick, 1200);
  }
  let multiLastFailLogRid = '';   /* 仅内存：防止"止步第 N 层"日志被重投刷屏 */
  /* 阶段四 C3（制作人 D6 批甲）：结算入账链抽成一处，真人局与本地陪练局共用同一条。
     抽出的动机就是 D6 的「复用」——幂等表 S.multiCreditedRuns、S.multiWins、崔九首次全通钩子、
     保存失败重试，这四件事只许有一份实现，否则本地局与真人局的口径会分叉。
     函数体逐行照搬原 Net.on('run_settle') 回调，唯一改动是把「我是谁」从 Net.me() 改为入参 meId：
     本地局没有 Net.me()，其成员 id 固定为 'local-me'（js/multi-local.js）。
     meId 为空时 mine 恒为 null，与原先 me 为空时 find 返 undefined 等价（都是 falsy）。 */
  function multiApplySettle(r, meId){
    if(!r) return;
    const mine = meId ? (r.rewards || []).find(x => x.id === meId) : null;
    const rid = r.runId ? String(r.runId) : '';
    multiSeedLegacyCredit();
    /* 幂等（第 123 轮修 H1/H2；第 124 轮按复核意见调整顺序）：
       幂等表就是主存档里的 S.multiCreditedRuns，claim 只改内存，随后与灵石一起 save() 落盘。
       localStorage 对单键原子 → 「奖励在」与「标记在」永远同真同假。
       **认领必须发生在"确认有我的奖励"之后**：否则本事件暂时没有我的份额时 runId 已被标记，
       同一局补发的有效奖励会被当成重复而丢掉（第 124 轮复核 E4）。 */
    if(mine && mine.stone > 0){
      const ML = window.MultiLedger;
      /* 正式结算 fail-closed（ChatGPT #63 收口①）：ML 缺失时一律拒绝入账，
         不再退回会放行非法/缺失 runId 的旧逻辑；ML 存在时委托 strict 认领 */
      const settleClaim = ML ? ML.claimSettlement(S, rid) : { first: false, reason: 'LEDGER_UNAVAILABLE' };
      const first = settleClaim.first;
      if(!first){
        log('🌀 这一局的结算已经入过账，重复通知已忽略。', 'note');
      } else {
        S.stone += mine.stone; S.stats.stoneEarned += mine.stone;
        log('🌀 组队秘境结算：灵石 +' + fmt(mine.stone) + (r.cleared ? '（全境打通！）' : ''), r.cleared ? 'gold' : 'good');
        if(r.cleared){
          S.multiWins = (S.multiWins || 0) + 1;
          /* 收尾批二批复第 2 项（甲）：道贺位不许被本地局吃掉。
             本地局 runId 带 local- 前缀（D6 口径），真人首通可由 **现有的** S.multiCreditedRuns
             推导 —— 零新字段、S.multiWins 记数口径一字不动（仍含本地局）。
             判据两条件取并（都要 !isLocalSettle）：
               ① S.multiWins === 1：至今首次全通。保留它是因为「真人先撤退（≥1 层会进幂等表）、
                  再首次全通」这条常见路径若只按 ② 判会丢失道贺（批二关的正是这个回归）。
               ② 除本局外，幂等表里没有任何非本地条目：覆盖「本地局先全通 → 真人首通」。
             已知边界（无新字段不可消除，与修复前行为相同、未变差）：
               「本地局全通 → 真人先撤退 → 真人首通」三连，② 被那条撤退条目挡住、① 也不成立。
             修复前实证见 probe_batch2_ui 的 g9Mem / g9Visit（逐字留档）。 */
          const isLocalSettle = rid.indexOf('local-') === 0;
          const priorRealCredit = (S.multiCreditedRuns || []).some(x =>
            typeof x === 'string' && x.indexOf('local-') !== 0 && x !== rid);
          const firstRealClear = !isLocalSettle && (S.multiWins === 1 || !priorRealCredit);
          if(firstRealClear){
            /* 崔九听闻你的组队事迹（只记头一回，老卒不重复道贺） */
            try{ if(window.NpcMemory) NpcMemory.record('cuijiu', '你与道友们合力闯通了组队秘境五层', 'story'); }catch(e){}
            try{ if(window.NpcVisitQueue) NpcVisitQueue.push('cuijiu', 'multi_first', '听说你带了道友闯那道封门？好，妖物再多，也怕人多。'); }catch(e){}
          }
        }
        if(!save()){
          multiSaveRetry(3, rid);
          log('⚠️ 存档保存失败，本次结果尚未保存，会自动重试；若此时刷新页面，请留意灵石是否到账。', 'bad');
        }
        render();   /* 奖励 + 幂等标记：同一次写入 */
      }
    } else if(!r.cleared && rid !== multiLastFailLogRid){
      multiLastFailLogRid = rid;
      log('🌀 组队秘境止步于第 ' + (r.layers || 0) + ' 层，奖励已按贡献落袋。', 'note');
    }
    const sc = document.getElementById('xx-multi-settle');
    if(sc) renderMulti();   /* 在联机页上就顺手刷新（含结算卡） */
  }
  function hookMultiNet(){
    if(multiNetHooked || !window.Net) return;
    multiNetHooked = true;
    Net.on('run_settle', r => { const me = Net.me(); multiApplySettle(r, me ? me.id : ''); });
    Net.on('lost', () => { log('📡 联机连接断开了。', 'bad'); renderMulti(); });
  }

  /* HTML 转义：联机面板把他人道号/聊天拼进 innerHTML，必须转义（第 116 轮 P0-A，堵 XSS） */
  function escHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ===================== 阶段四 C3 · 本地陪练（制作人 D4/D5/D6/D7 批甲 · A2-LOCAL） =====================
     空服时「塔后封门」内容不可达，人门在权威服务器里（server/server.mjs:1061-1062），本单不动 server/。
     D4 批准的形态：客户端本地陪练，五层推层在本地判定，常量逐项抄自服务器现值（js/multi-local.js）。
     D5：奖励沿用原值、单人独占池（逐层 400/800/1600/3200/9600，全通 16000 灵石），不做人数折算。
     D6：runId 加 local- 前缀写进既有 S.multiCreditedRuns，复用 S.multiWins，**零新存档字段**——
         所以下面两个变量都只是内存态，刷新即散；本地局进行中刷新页面等于放弃该局（未结算不入账）。
     D7：陪练零战力贡献，队伍里只有玩家一个人；陪练同伴只是呈现层的事，引擎不持有它。
     入账走 multiApplySettle —— 与真人局**同一条链**（幂等表 / multiWins / 崔九首次全通钩子 / 保存重试）。 */
  let multiLocalRun = null;      /* 当前本地局（js/multi-local.js 的 run 对象），仅内存 */
  let multiLocalSettle = null;   /* 本地局结算卡数据，形状同 Net.data().lastSettle，仅内存 */
  /* 本地局只在没连服务器时成立：真人局在线时不许并行开一局，免得两条结算链同时入账。 */
  function multiLocalActive(){
    return !!(multiLocalRun && (!window.Net || Net.state() === 'offline'));
  }
  function multiLocalStart(){
    if(!window.MultiLocal || !window.MultiLedger) return false;
    if(window.Net && Net.state() !== 'offline') return false;
    multiLocalRun = MultiLocal.newRun({
      power: multiPower(), snapshot: multiSnapshot(),
      path: multiLoadPath(), name: S.name || '道友'
    });
    multiLocalSettle = null;
    renderMulti();
    return true;
  }
  function multiLocalAct(act){
    if(act === 'settled'){ multiLocalSettle = null; multiLocalRun = null; renderMulti(); return true; }
    const run = multiLocalRun;
    if(!run || !window.MultiLocal) return false;
    let r = null;
    if(act === 'skill') r = MultiLocal.skill(run);
    else if(act === 'strike') r = MultiLocal.strike(run);
    else if(act === 'leave') r = MultiLocal.leave(run);
    else return false;
    if(r && r.ok === false){ multiToastErr(r); renderMulti(); return false; }
    if(run.phase === 'settled' && run.settle){
      multiLocalSettle = run.settle;
      /* D6：与真人局同一条入账链。成员 id 固定 'local-me'（MultiLocal.view/settle 同口径）。 */
      multiApplySettle(run.settle, 'local-me');
    }
    renderMulti();
    return true;
  }
  /* 入口按钮：动态注入既有离线说明壳（照 renderPathPreview 的做法，不改 js/views/multi.js 模板）。
     文本逐字照抄「九霄问道文案」交稿 C3_local_text.md 的 C3-1 / C3-2（本轮 C3 不在文案白名单，
     故由负责人落盘；文案只交稿）。落点与文案建议等价：渲染顺序为
     既有 <p class="hint">（views/multi.js:69）→ 本地说明 → 入口按钮，都在 #xx-multi-offline 内。
     与文案建议的差别只在实现位置（动态注入 vs 改模板），DOM 结果一致，登记在总报告。 */
  const MULTI_LOCAL_ENTRY_LABEL = '不连服务，一人试走五层';
  const MULTI_LOCAL_ENTRY_HINT = '陪你走这一趟的是你自己的影子——它不出战力，也不分灵石；五层所得与真人局同一档。这是本地局，不连服务器，也不算联机。';
  /* C3-3 陪练同伴：称呼「碑影」取自既有章回 1-5（js/story.js:107-108 的碑面影子），不新立设定。
     C3-4 开场行：只在本地局呈现，不进 run.log 持久队列（文案 C3-4 明确要求）。 */
  const MULTI_LOCAL_MATE_LINE = '碑影 · 它不报号，也不应声——碑上慢了半息的那道影子，只跟你，不占位。';
  const MULTI_LOCAL_OPEN_LINE = '这一趟没有别人。封门替你推开，影子跟进来——它不算人数。';
  function multiLocalEntry(){
    const off = document.getElementById('xx-multi-offline');
    if(!off) return;
    let box = document.getElementById('xx-multi-localrow');
    if(!box){
      box = document.createElement('div');
      box.id = 'xx-multi-localrow';
      box.className = 'mc-opts npc-opts';
      off.appendChild(box);
    }
    /* 连上服务器后本地入口收起：真人局与本地局不并存 */
    const on = !!(window.MultiLocal && window.MultiLedger) && (!window.Net || Net.state() === 'offline');
    box.hidden = !on;
    if(!on){ box.textContent = ''; return; }
    if(!box.childElementCount){
      /* 说明行在前、按钮在后（文案 C3-2 建议落点：既有 hint 之后） */
      const h = document.createElement('p');
      h.className = 'hint';
      h.id = 'xx-multi-localhint';
      h.textContent = MULTI_LOCAL_ENTRY_HINT;
      box.appendChild(h);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'npc-opt';
      b.id = 'xx-multi-localgo';
      b.dataset.local = 'start';
      b.textContent = MULTI_LOCAL_ENTRY_LABEL;
      box.appendChild(b);
      box.addEventListener('click', ev => {
        const t = ev.target.closest('[data-local]');
        if(t && t.dataset.local === 'start'){ ev.stopPropagation(); multiLocalStart(); }
      });
    }
  }

  function multiStateLine(){
    const d = Net.data();
    const on = (d.players || []).filter(p => p.online).length;
    return '在线 ' + on + ' 人 · 房间 ' + (d.rooms || []).length + ' 个';
  }

  /* P1-A：道途目录只认服务器下发的（hello.paths），客户端不硬编码名称、更不持有系数 */
  function multiPathCatalog(){ try{ return (window.Net && Net.data().paths) || []; }catch(e){ return []; } }
  function multiPathName(id){
    const c = multiPathCatalog().find(p => p.id === id);
    return c ? (c.name + '·' + c.role) : '';
  }
  function multiRenderPathRow(box, cur){
    if(!box) return;
    const cat = multiPathCatalog();
    if(!cat.length){ box.hidden = true; return; }
    box.hidden = false;
    /* P1-B：道途卡片展示"专注轴"与共鸣说明（数值仅展示，系数只在服务器）。
       SYNERGY_DISPLAY 是展示用上限文案，须与 server.mjs 的 SYNERGY_GAIN(0.15) 保持一致。 */
    const SYNERGY_DISPLAY = '15%';
    box.innerHTML = cat.map(p => {
      const axisName = p.axisName || '';
      const synergyLine = axisName ? ('专注【' + escHtml(axisName) + '】· 养成契合可共鸣（上限 +' + SYNERGY_DISPLAY +
        '，按该轴投入比例实际可能更低）') : '';
      return '<button class="mc-opt" data-path="' + escHtml(p.id) + '">' +
        '<span>' + (p.id === cur ? '✔ ' : '') + escHtml(p.name) + '·' + escHtml(p.role) + '</span>' +
        (synergyLine ? '<small>' + escHtml(synergyLine) + '</small>' : '') +
        '<small>' + escHtml(p.blurb || (p.skill && p.skill.name) || '') + '</small>' +
      '</button>';
    }).join('');
    if(!box.dataset.d_binded){
      box.dataset.d_binded = '1';
      box.addEventListener('click', ev => {
        const b = ev.target.closest('[data-path]');
        if(b && !b.disabled) { ev.stopPropagation(); multiAct('path', b.dataset.path); }
      });
    }
  }

  /* 阶段四 C3：副本态渲染抽成一处，真人局与本地陪练局共用同一段代码。
     逐行照搬原 renderMulti 的 st==='run' 分支，只把 Net.me() 换成入参 meId；
     动作分派按 multiLocalActive() 动态判定（不捕获渲染时的快照，避免同一 DOM 节点
     先渲染真人局、后渲染本地局时闭包串台）。本地局的 run 视图由 MultiLocal.view() 产出，
     字段形状与服务器 runView（server/server.mjs:497-534）逐字段对齐，故这里零本地特例。 */
  function multiRenderRun(run, meId){
    const sub = document.getElementById('xx-multi-runsub');
    const info = document.getElementById('xx-multi-runinfo');
    const opts = document.getElementById('xx-multi-runopts');
    const logBox = document.getElementById('xx-multi-runlog');
    const struck = (run.struck || []);
    const iStruck = meId && struck.indexOf(meId) >= 0;
    /* 本地陪练局（D7 陪练不计人数 ⇒ 队里只有玩家一个人）：文案 C3-3/C3-4 与风险③的称谓候选。
       真人局这三处原串一字不动，只在 isLocal 为真时换称呼——「队伍／道友」在本地局是事实错误。 */
    const isLocal = multiLocalActive();
    if(sub) sub.textContent = '第 ' + run.layer + ' / ' + run.totalLayers + ' 层';
    const mySkill = (run.skills || []).find(s => meId && s.id === meId) || null;
    if(info){
      const gates = run.arrayActive
        ? '这一层要 <b>' + fmt(run.needPower) + '</b>（点阵已开·原 ' + fmt(run.baseNeedPower) + '）'
        : '这一层要 <b>' + fmt(run.needPower) + '</b>';
      let buffs = [];
      if(run.warm > 0) buffs.push('温养 ' + run.warm + '/' + run.warmMax + '（队伍 +' + (run.warm * run.warmPct) + '%）');
      if(run.guard > 0) buffs.push('护持 ' + run.guard + ' 次');
      if(run.arrayActive) buffs.push('点阵已开');
      const bursters = (run.skills || []).filter(s => s.burst).map(s => s.name);
      if(bursters.length) buffs.push('破军斩：' + bursters.join('、'));
      /* P1-B：流派共鸣展示（数值来自服务器 run.skills[].synergyPct，客户端只展示） */
      const synList = (run.skills || []).filter(s => s.synergyPct > 0)
        .map(s => escHtml(s.name) + ' +' + s.synergyPct + '%（' + escHtml(s.axisName || '') + '）');
      info.innerHTML =
        (isLocal ? '<p class="npc-greet-line">' + escHtml(MULTI_LOCAL_MATE_LINE) + '</p>' : '') +
        '<p class="npc-greet-line">' + (isLocal ? '你的战力' : '队伍战力') + ' <b>' + fmt(run.teamPower) + '</b> · ' + gates + '</p>' +
        (buffs.length ? '<p class="npc-greet-line">' + escHtml(buffs.join(' · ')) + '</p>' : '') +
        (synList.length ? '<p class="npc-greet-line">流派共鸣：' + synList.join(' · ') + '</p>' : '') +
        (mySkill ? '<p class="npc-greet-line">我的道途：' + escHtml(mySkill.pathName) + ' · ' + escHtml(mySkill.skillName) + ' 剩 ' + mySkill.usesLeft + ' 次' +
          (mySkill.synergyPct > 0 ? ' · 共鸣 +' + mySkill.synergyPct + '%（' + escHtml(mySkill.axisName || '') + '）' : '') + '</p>' : '') +
        '<p class="npc-greet-line">' + (isLocal
          ? '出手：只你一个'
          : '已出手的道友：' + (struck.length ? struck.length + ' 人' : '还没有') + (run.allStruck ? ' · 全员到位' : '')) + '</p>' +
        ((run.stones || []).some(s => s.stone > 0)
          ? '<p class="npc-greet-line">本局已得：' + (run.stones || []).map(s => escHtml(s.name) + ' ' + fmt(s.stone)).join(' · ') + '</p>'
          : '');
    }
    if(opts){
      const canSkill = mySkill && !iStruck && mySkill.usesLeft > 0;
      opts.innerHTML =
        (canSkill ? '<button class="npc-opt" data-act="skill" title="' + escHtml(mySkill.skillHint || '') + '">✦ ' + escHtml(mySkill.skillName) + '（剩 ' + mySkill.usesLeft + '）</button>' : '') +
        '<button class="npc-opt' + (iStruck ? ' off' : '') + '" data-act="strike">' + (iStruck ? '已出手 · 等道友们' : '⚔️ 出手') + '</button>' +
        '<button class="npc-opt" data-act="leave">撤退（保住已得的）</button>';
      if(!opts.dataset.d_binded){
        opts.dataset.d_binded = '1';
        opts.addEventListener('click', ev => {
          const b = ev.target.closest('[data-act]');
          if(b && !b.disabled) { ev.stopPropagation(); (multiLocalActive() ? multiLocalAct : multiAct)(b.dataset.act); }
        });
      }
    }
    /* run.log 的每条都含玩家自填道号（服务器 server.mjs 的 apiJoin 只校验长度、不过滤字符集），
       这里直拼 innerHTML 就是一个未转义的 sink。房间成员列表与聊天都已走 escHtml，只漏了这一处。
       本地局在最前面固定加一行开场（文案 C3-4）：每帧都置于首行，与「只在首帧写入」视觉等价，
       且重渲染不丢；该行不进 run.log，所以不会被持久化、也不会被 log 截 5 条挤掉。 */
    if(logBox) logBox.innerHTML =
      (isLocal ? '<p class="npc-greet-line">' + escHtml(MULTI_LOCAL_OPEN_LINE) + '</p>' : '') +
      (run.log || []).map(t => '<p class="npc-greet-line">' + escHtml(t) + '</p>').join('');
  }

  /* 阶段四 C3：结算卡渲染同样抽成一处。s 的形状真人局与本地局一致（MultiLocal.settle 对齐服务器 result）。
     「知道了」的收卡动作按 multiLocalSettle 动态判定，理由同 multiRenderRun。 */
  function multiRenderSettle(settleC, s){
    if(!settleC) return;
    if(s){
      settleC.hidden = false;
      const body = document.getElementById('xx-multi-settlebody');
      if(body){
        body.innerHTML = '<p class="npc-greet-line">' + (s.cleared ? '五层尽通，封门后的妖物伏诛了。' : '止步于第 ' + (s.layers || 0) + ' 层。') + '</p>' +
          (s.rewards || []).map(r => '<p class="npc-greet-line">' + escHtml(r.name) + ' · 灵石 +' + fmt(r.stone) + '</p>').join('');
      }
      const so = document.getElementById('xx-multi-settleopts');
      if(so && !so.childElementCount){
        so.innerHTML = '<button class="npc-opt" data-act="settled">知道了</button>';
        so.querySelector('[data-act]').addEventListener('click', () => {
          if(multiLocalSettle){ multiLocalAct('settled'); return; }
          const d2 = Net.data();
          d2.lastSettle = null;
          renderMulti();
        });
      }
    } else settleC.hidden = true;
  }

  function renderMulti(){
    const hall = document.getElementById('xx-multi-hall');
    const roomC = document.getElementById('xx-multi-roomcard');
    const runC = document.getElementById('xx-multi-runcard');
    const offC = document.getElementById('xx-multi-offline');
    const settleC = document.getElementById('xx-multi-settle');
    if(!hall || !roomC || !runC || !offC) return;
    const st = window.Net ? Net.state() : 'offline';
    const me = window.Net ? Net.me() : null;
    /* 阶段四 C3（D4 A2-LOCAL）：本地陪练局接管面板，只在 offline 态成立。
       复用既有副本卡与结算卡两张壳，零新增 DOM 结构、零新增 CSS。
       离线说明壳此时收起——它讲的是「真人联机要起服务」，与本地局同屏会互相打脸。 */
    if(multiLocalActive()){
      offC.hidden = true; hall.hidden = true; roomC.hidden = true;
      if(multiLocalRun.phase === 'run'){
        runC.hidden = false;
        multiRenderRun(MultiLocal.view(multiLocalRun), 'local-me');
        multiRenderSettle(settleC, null);
      }else{
        runC.hidden = true;
        multiRenderSettle(settleC, multiLocalSettle);
      }
      return;
    }
    if(!window.Net){ offC.hidden = false; hall.hidden = true; roomC.hidden = true; runC.hidden = true; if(settleC) settleC.hidden = true; multiLocalEntry(); return; }
    offC.hidden = st !== 'offline';
    /* 大厅（服务地址/报号/进入）只在还没进屋时才有用；进了队伍或副本就收起，别把首屏让给登录表单。
       ⚠️ offline 也必须露出大厅卡：全库唯一能填服务地址的输入框（#xx-multi-srv）就在这张卡里，
       而 state 只会被 Net.connect 改成 lobby、connect 又只由卡内的 #xx-multi-join 触发。
       原先这里写 `st !== 'lobby'` → offline 把整张卡藏掉 → 玩家能看到的只有纯文字说明卡，
       填不了地址、点不到登入 → 新玩家永远进不去联机（闭环死锁，且 online 态自洽所以没人报错）。
       下面 offline 分支还会主动给 #xx-multi-srv 填默认值，也正说明这张卡本该可见。 */
    hall.hidden = !(st === 'lobby' || st === 'offline');
    roomC.hidden = !(st === 'room');
    runC.hidden = st !== 'run';
    if(st === 'offline'){
      const srv = document.getElementById('xx-multi-srv');
      if(srv && !srv.value) srv.value = multiSrvDefault();
      multiLocalEntry();   /* 阶段四 C3：空服兜底入口（本地陪练） */
      return;
    }
    if(st === 'lobby'){
      const who = document.getElementById('xx-multi-who');
      const msg = document.getElementById('xx-multi-hallmsg');
      const list = document.getElementById('xx-multi-roomlist');
      const line = document.getElementById('xx-multi-onlineline');
      const namerow = document.getElementById('xx-multi-namerow');
      const connrow = document.getElementById('xx-multi-connrow');
      if(namerow) namerow.hidden = !!me;
      if(connrow) connrow.hidden = !!me;
      if(who) who.textContent = me ? (me.name + ' · ' + (multiPathName(me.path) || '剑修') + ' · 战力 ' + fmt(multiPower())) : '';
      if(msg) msg.textContent = me ? '山门开着。等几位道友，就能进秘境了。' : '';
      multiRenderPathRow(document.getElementById('xx-multi-pathrow'), (me && me.path) || multiLoadPath());
      if(list){
        const rooms = Net.data().rooms || [];
        /* 第 123 轮：属性值也必须转义（第 117 轮审查 H5）。r.id 目前是服务器生成的 8 位 hex，
           但"服务器现在只发 hex"不是安全边界——一旦房间 id/名字的来源变了，等同直接开 XSS 口子。 */
        list.innerHTML = rooms.length
          ? rooms.map(r => '<button class="npc-opt" data-room="' + escHtml(r.id) + '">' + escHtml(r.name) + '（' + escHtml(r.count) + '/' + escHtml(r.max) + '人' + (r.phase !== 'lobby' ? ' · 进行中' : '') + '）</button>').join('')
          : '<button class="npc-opt" data-room="new">自己开一间（当队首）</button>';
        if(!list.dataset.d_binded){
          list.dataset.d_binded = '1';
          list.addEventListener('click', ev => {
            const b = ev.target.closest('[data-room]');
            if(b && !b.disabled) { ev.stopPropagation(); const id = b.dataset.room; (id === 'new' ? multiAct('create') : multiAct('join', id)); }
          });
        }
      }
      if(line) line.textContent = multiStateLine();
    }
    if(st === 'room'){
      const d = Net.data();
      const room = d.room;
      if(!room){ roomC.hidden = true; hall.hidden = false; return; }
      const sub = document.getElementById('xx-multi-roomsub');
      const mem = document.getElementById('xx-multi-members');
      const opts = document.getElementById('xx-multi-roomopts');
      if(sub) sub.textContent = room.name || '';
      if(mem){
        mem.innerHTML = (room.members || []).map(m =>
          '<p class="npc-greet-line">' + (m.ready ? '✔ ' : '· ') + escHtml(m.name) +
            '（' + (m.pathName ? escHtml(m.pathName) + ' · ' : '') + '战力 ' + fmt(m.power) + '）' +
            (m.id === room.hostId ? ' · 队首' : '') + '</p>'
        ).join('');
      }
      multiRenderPathRow(document.getElementById('xx-multi-roompath'), (me && me.path) || multiLoadPath());
      if(opts){
        const isHost = me && room.hostId === me.id;
        const mine = (room.members || []).find(m => me && m.id === me.id) || {};
        const canStart = isHost && (room.members || []).length >= 2 && (room.members || []).every(m => m.ready);
        opts.innerHTML =
          '<button class="npc-opt" data-act="ready">' + (mine.ready ? '先缓缓（取消准备）' : '我备好了') + '</button>' +
          (isHost ? '<button class="npc-opt' + (canStart ? '' : ' off') + '" data-act="start">推门进秘境' + (canStart ? '' : '（等人都备好）') + '</button>' : '') +
          '<button class="npc-opt" data-act="leaveroom">回大厅</button>';
        if(!opts.dataset.d_binded){
          opts.dataset.d_binded = '1';
          opts.addEventListener('click', ev => {
            const b = ev.target.closest('[data-act]');
            if(b && !b.disabled) { ev.stopPropagation(); multiAct(b.dataset.act); }
          });
        }
      }
      const logBox = document.getElementById('xx-multi-chatlog');
      if(logBox){
        logBox.innerHTML = (d.chats || []).slice(-8).map(c => '<p class="npc-greet-line">' + escHtml(c.name) + '：' + escHtml(c.text) + '</p>').join('');
      }
    }
    if(st === 'run'){
      const d = Net.data();
      const run = d.run;
      if(!run){ runC.hidden = true; roomC.hidden = false; return; }
      multiRenderRun(run, me ? me.id : '');
    }
    multiRenderSettle(settleC, Net.data().lastSettle);
  }

  function bindMultiDom(){
    if(multiBound) return;
    const go = document.getElementById('xx-multi-go');
    const jn = document.getElementById('xx-multi-join');
    const cs = document.getElementById('xx-multi-chatsend');
    if(!go) return;
    go.addEventListener('click', () => multiAct('go'));
    if(jn) jn.addEventListener('click', () => multiAct('login'));
    if(cs) cs.addEventListener('click', () => multiAct('chat'));
    const ci = document.getElementById('xx-multi-chatin');
    if(ci) ci.addEventListener('keydown', e => { if(e.key === 'Enter') multiAct('chat'); });
    multiBound = true;
  }

  function multiAct(act, arg){
    if(!window.Net) return;
    const st = Net.state();
    if(act === 'go'){
      const srv = (document.getElementById('xx-multi-srv') || {}).value || '';
      multiSrvRemember(srv.trim());
      /* 先记地址再等道号：地址合法就切到道号行（connect 放到 login 一步） */
      const addr = srv.trim();
      if(!addr){
        const msg = document.getElementById('xx-multi-hallmsg');
        if(msg){ msg.hidden = false; msg.textContent = '先填写房主提供的联机入口。'; }
        return;
      }
      multiCheckAddr(addr);
      /* 注释承诺的"切到道号行"必须真的做（原先只探活）：否则玩家点「进入」后屏幕毫无变化，
         因为 multiCheckAddr 的反馈写进了 S.log，而 S.log 只在修行日志页可见。
         这里把地址行收起、道号行展开，并给一句确认文案。 */
      const cr = document.getElementById('xx-multi-connrow');
      const nr = document.getElementById('xx-multi-namerow');
      if(cr) cr.hidden = true;
      if(nr) nr.hidden = false;
      const msg = document.getElementById('xx-multi-hallmsg');
      if(msg){ msg.hidden = false; msg.textContent = '地址记下了（' + addr + '）。报个道号，就推门。'; }
      const nm = document.getElementById('xx-multi-name');
      if(nm && nm.focus){ try{ nm.focus(); }catch(e){} }
      return;
    }
    if(act === 'login'){
      const addr = (document.getElementById('xx-multi-srv') || {}).value || multiSrvDefault();
      const name = ((document.getElementById('xx-multi-name') || {}).value || '').trim();
      if(!addr){
        const m = document.getElementById('xx-multi-hallmsg');
        if(m) m.textContent = '先填写房主提供的联机入口。';
        return;
      }
      if(!name){ const m = document.getElementById('xx-multi-hallmsg'); if(m) m.textContent = '总得有个称呼。报上道号再来。'; return; }
      Net.connect(addr.trim(), name, multiPower(), null, multiSnapshot(), multiLoadPath()).then(r => {
        if(!r.ok){ const m = document.getElementById('xx-multi-hallmsg'); if(m) m.textContent = '连不上：' + (r.error || '服务没响应'); return; }
        hookMultiNet();
        if(r.me && r.me.path) multiSavePath(r.me.path);
        /* P0-C：记下会话，便于刷新重连（token/name/base；roomId 在进出房间时补） */
        multiSaveSession({ token: r.me.token, name: name, base: addr.trim(), roomId: null });
        log(r.resumed ? '📡 已连回原队伍。' : '📡 已连上联机服务。', 'good');
        renderMulti(); bindMultiDom();
      });
      return;
    }
    if(act === 'create'){ Net.api('/api/room/create').then(r => { if(!r.ok) multiToastErr(r); else multiSaveSession({ roomId: (r.room && r.room.id) || null }); renderMulti(); bindMultiDom(); }); return; }
    /* P1-A：选道途。只提交枚举 id；服务器校验并登记，失败（非法/开战中）如实回报。
       本地这份只是"下次连接时报哪个"的偏好，不参与任何数值计算。 */
    if(act === 'path'){
      const id = String(arg || '');
      if(!id) return;
      if(PATH_IDS.indexOf(id) < 0){ log('⚠️ 道途选项无效。', 'bad'); renderMulti(); return; } /* 白名单校验（GPT 代码审查③） */
      /* 终身道途：联机道途选择入口不得改写已确定的本源 S.path。未选时可经此补选；已选则锁定。 */
      if(typeof S.path === 'string' && PATH_IDS.indexOf(S.path) >= 0){
        log('🧭 道途【' + pathName(S.path) + '】为终身道途（伤害 ' + pathBonusPct(S.path) + '），不可在联机界面更改。', 'bad');
        renderMulti(); return;
      }
      if(Net.state() === 'offline'){
        S.path = id; multiSavePath(id);              /* 离线补选：写入本源 + 缓存（id 已白名单校验） */
        log('🧭 道途定为：' + pathName(id) + '（伤害 ' + pathBonusPct(id) + '，离线）。', 'note');
        renderMulti(); return;
      }
      Net.api('/api/path', { path: id }).then(r => {
        if(!r.ok){ multiToastErr(r); renderMulti(); return; }
        const rp = (typeof r.path === 'string' && PATH_IDS.indexOf(r.path) >= 0) ? r.path : id; /* 服务器回值亦须白名单校验 */
        S.path = rp; multiSavePath(rp);
        log('🧭 道途定为：' + pathName(rp) + '（伤害 ' + pathBonusPct(rp) + '）。', 'note');
        renderMulti();
      });
      renderMulti();
      return;
    }
    /* P1-A：声明道途技能。次数/效果全在服务器算；这里只发"我要用"这个意图。 */
    if(act === 'skill'){
      Net.api('/api/run/skill').then(r => {
        if(!r.ok){
          const M = { NO_SKILL_USES: '这一招本局用尽了。', ALREADY_STRUCK: '已经出手了，下一层再来。', BAD_PHASE: '现在不是用这个的时候。' };
          log('✦ ' + (M[r.code] || ('没用出来：' + (r.code || '未知原因'))), 'note');
        }
        renderMulti();
      });
      return;
    }
    if(act === 'join'){ Net.api('/api/room/join', { roomId: arg }).then(r => { if(!r.ok) multiToastErr(r); else multiSaveSession({ roomId: (r.room && r.room.id) || null }); renderMulti(); bindMultiDom(); }); return; }
    if(act === 'ready'){
      const room = Net.data().room || {};
      const mineReady = ((room.members || [])).find(m => { const me = Net.me(); return me && m.id === me.id; });
      multiCall('/api/room/ready', { ready: !(mineReady && mineReady.ready) });
      return;
    }
    if(act === 'start'){ multiCall('/api/room/start'); return; }
    if(act === 'strike'){ multiCall('/api/run/strike'); return; }
    if(act === 'leave'){ multiCall('/api/run/leave'); return; }
    if(act === 'leaveroom'){
      multiCall('/api/room/leave', null, r => {
        if(!r || !r.ok) return;
        multiSaveSession({ roomId: null });
        /* 服务器不会给自己发 room:null（它先把自己从 members 移除，再只广播 lobby），
           而 net.js 的 lobby 事件既不清 data.room 也不改 state →
           玩家点完「回大厅」后仍停在房间态，看到一张成员已不存在的房间卡，点什么都报 NOT_IN_ROOM。
           确认成功后在此本地归位。 */
        if(window.Net && typeof Net.clearRoom === 'function') Net.clearRoom();
      });
      return;
    }
    if(act === 'chat'){
      const inp = document.getElementById('xx-multi-chatin');
      const text = ((inp || {}).value || '').trim();
      if(!text) return;
      if(inp) inp.value = '';
      /* 发失败把原话填回去，别让玩家白打一遍 */
      multiCall('/api/room/chat', { text }, r => { if((!r || !r.ok) && inp) inp.value = text; });
      return;
    }
  }
  function multiCheckAddr(addr){
    /* 轻探活：失败也放行（用户可能后面才起服务），只提示 */
    try{
      fetch(addr.replace(/\/+$/, '') + '/api/health').then(r => r.json()).then(j => {
        if(!j || !j.ok) log('📡 这个入口暂时没有响应，先试一试也无妨。', 'note');
      }).catch(() => { log('📡 探不到这个地址（服务还没起？），可以直接填道号试。', 'note'); });
    }catch(e){}
  }
  /* 联机动作统一出口（ready/strike/leave/leaveroom/chat）。
     这五个动作原先各自 `.then(() => renderMulti())`，完全不看 r.ok / r.code ——
     服务器拒绝（BAD_PHASE / ALREADY_STRUCK / NOT_IN_ROOM）与传输失败
     （NOT_CONNECTED / NETWORK / TIMEOUT）全部静默：玩家只看到"重绘一下，什么都没变"，
     既不知道被拒也不愿意重试。统一到这里：失败一律提示，成功才重绘。 */
  function multiCall(path, body, after){
    return Net.api(path, body).then(r => {
      if(!r || !r.ok) multiToastErr(r);
      if(typeof after === 'function'){ try{ after(r); }catch(e){} }
      renderMulti(); bindMultiDom();
      return r;
    });
  }
  function multiToastErr(r){
    const MSG = { ROOM_FULL: '那间队伍满了。', ROOM_RUNNING: '他们已经在秘境里了。', ROOM_NOT_FOUND: '没找到那间队伍（可能刚散了）。', MIN_PLAYERS: '至少要两位道友同行。', READY_MISSING: '还有道友没备好。', NOT_HOST: '只有队首能推门。', BAD_PHASE: '现在不是做这个的时候。', BAD_PATH: '没有这条道途。', NOT_IN_ROOM: '你还没进队伍。',
      /* 传输层失败码：原先没有对应文案 → 一律落到"没成：NETWORK"这种玩家看不懂的兜底 */
      NOT_CONNECTED: '还没连上服务，先在大厅填地址登入。', NETWORK: '网络断了，这条没发出去。', TIMEOUT: '服务没响应（超时），过会儿再试。', ALREADY_STRUCK: '这一层你已经出手了，等队友。', NO_SKILL_USES: '这一招本局用尽了。' };
    const txt = MSG[r && r.code] || ('没成：' + ((r && r.code) || '未知原因'));
    /* 容器必须按当前状态挑：房间卡/副本卡显示时 #xx-multi-hallmsg 与 #xx-multi-roommsg
       都被 hidden 掉了，原先只写这两个 → 在副本里点出错的按钮，屏幕上一个字都不出现。
       阶段四 C3：本地陪练局时 Net.state() 仍是 offline，但屏幕上显示的是副本卡，
       所以这里把「本地局进行中」也算进 run 档，否则 ALREADY_STRUCK / NO_SKILL_USES
       这两条既有提示会被写进隐藏的大厅消息位，玩家一个字都看不到。 */
    const st = (window.Net ? Net.state() : 'offline');
    const inRun = (st === 'run') || (multiLocalActive() && multiLocalRun.phase === 'run');
    const id = inRun ? 'xx-multi-runinfo' : (st === 'room' ? 'xx-multi-roommsg' : 'xx-multi-hallmsg');
    const m = document.getElementById(id) || document.getElementById('xx-multi-hallmsg');
    if(m){
      m.hidden = false;
      if(id === 'xx-multi-runinfo'){
        /* runinfo 是整块信息区（renderMulti 每次重写），所以追加一行而不是覆盖整段 */
        const line = document.createElement('div');
        line.className = 'npc-greet-line';
        line.style.color = '#a33';
        line.textContent = '⚠️ ' + txt;
        m.appendChild(line);
      }else{
        m.textContent = txt;
      }
    }
    try{ log('📡 ' + txt, 'bad'); }catch(e){}
  }
  /* 顶层即挂：结算入账/崔九记忆不依赖玩家进过联机页（net.js 先于本文件加载） */
  try{ hookMultiNet(); }catch(e){ try{ window.__hookErr = e.message; }catch(e2){} }

  function npcPageSync(name){
    if(name === 'role_npc') npcPageEnter();
    else npcUi = null;
    if(name === 'tower') cuijiuEnter();
    else cuijiuUi = null;
    if(name === 'multi'){ multiBound = false; multiEnter(); }   /* 联机页：DOM 重注入后按钮要重绑 */
    else multiExit();
  }
  /* 冻结时序：① npcSay 取开场白快照 → ② npcMarkReunion → ③ npcArrive → ④ save → ⑤ 渲染。
     快照存进 npcUi.greet，之后 markReunion 改了 seenGens 也不会把重逢开场白刷掉。 */
  function npcPageEnter(){
    const stele = S.npcs && S.npcs.stele;
    if(!stele || typeof stele !== 'object') return;
    const ctx = npcCtx();
    /* P3（制作人 2026-11-16 批）：长期冷落必须在真实入口、lastSeen 刷新之前结算。
       原先 renderNpcPage 里判 decay 时，npcArrive 已把 lastSeen 刷成 now → 永不触发；
       这里放在 npcSay/npcArrive 之前，修的是接线时序，不改引擎口径。 */
    try{ if(window.NpcRel) window.NpcRel.decay(stele, ctx); }catch(e){}
    const say = Npc.npcSay(stele, ctx);
    /* D3（甲案，2026-11-16 批）：先判弥合、再消费 seenGens。
       原先 renderNpcPage 里判 echo 时，npcMarkReunion 已把 seenGens 对齐 → 恒 null；
       这里在真实入口判定一次，结果存进 npcUi.echo，render 只取本次进页的快照。 */
    let echo = '';
    try{ if(window.NpcRel) echo = window.NpcRel.rebornEcho(stele, ctx) || ''; }catch(e){ echo = ''; }
    Npc.npcMarkReunion(stele, ctx);
    Npc.npcArrive(stele, ctx);
    save();
    if(typeof window.Guide !== 'undefined') window.Guide.complete('handoff');
    /* 太虚真人·跳过者补讲（首次进入识人/沈碑页；tellSystem 内部已判 skipped 与去重） */
    if(typeof window.Guide !== 'undefined') window.Guide.tellSystem('npc');
    npcUi = {
      greet: (say && Array.isArray(say.lines) ? say.lines : []).slice(),
      first: !!(say && say.first),
      topic: null,
      reply: null,
      echo: echo
    };
    renderNpcPage();
  }
  /* 打开一个话题（只改页面临时态，不碰存档） */
  function npcOpenTopic(topicId){
    if(!npcUi) return;
    npcUi.topic = topicId;
    npcUi.reply = null;
    renderNpcPage();
  }
  /* 点选项：npcPick 结算 → 成功才 save；失败只给一句提示，不写档不结算 */
  function npcChoose(topicId, optionId){
    const stele = S.npcs && S.npcs.stele;
    if(!npcUi || !stele || typeof stele !== 'object') return false;
    /* 记忆 NPC 框架第二步：事件对话（data-topic="__event"）走 NpcRel.applyEvent；
       一次性（st.events）、不可重开；选项只记类别，不存原文。 */
    if(topicId === '__event'){
      try{
        const evId = npcUi.event && npcUi.event.id;
        const r2 = (window.NpcRel && evId) ? NpcRel.applyEvent(stele, Npc.NPC_STELE.events2, evId, optionId, npcCtx()) : null;
        if(!r2){ npcUi.reply = { ok: false }; renderNpcPage(); return false; }
        markDayDec('social');
        save();
        npcUi.reply = { ok: true, topic: '__event', option: optionId, text: r2.text, relDelta: 0,
                        rel: stele.rel, stage: stele.stage, firstTime: false, memWarn: false };
        npcUi.event = null;
        renderNpcPage();
        return true;
      }catch(e){ return false; }
    }
    const r = Npc.npcPick(stele, npcCtx(), topicId, optionId);
    if(!r || !r.ok){
      npcUi.reply = { ok: false, error: (r && r.error) || 'bad_option', topic: topicId, option: optionId };
      renderNpcPage();
      return false;
    }
    markDayDec('social');   /* 阶段三收尾：今日四类决策 · 事件社交（沈碑对话成功） */
    save();
    if(topicId === 'first') npcUi.first = false;   /* 初见结算完就切到话题视图 */
    else npcUi.topic = topicId;
    /* D-006 M 项：把"这段记忆没落盘"如实告诉玩家（低干扰：一行小字 + 一条日志）。
       不改台词、不拦对话 —— 只是不把"只存在内存里"说成"永久记住了"。 */
    const memWarn = (r.memPersisted === false);
    if(memWarn) log('⚠️ 这段记忆只留在本次会话里（本机存储写入失败），刷新后会淡去。', 'bad');
    npcUi.reply = {
      ok: true, topic: topicId, option: optionId, text: r.reply,
      relDelta: r.relDelta, rel: r.rel, stage: r.stage, firstTime: r.firstTime,
      memWarn: memWarn
    };
    renderNpcPage();
    /* 回复在选项下方：窄屏点完可能刚好落在视口外，顺手带到眼前（已在视野内则不动） */
    const rep = document.getElementById('npc-reply');
    if(rep && !rep.hidden && rep.scrollIntoView){ try{ rep.scrollIntoView({ block:'nearest' }); }catch(e){} }
    return true;
  }
  function npcNode(tag, cls, txt){
    const e = document.createElement(tag);
    if(cls) e.className = cls;
    if(txt != null) e.textContent = txt;
    return e;
  }
  /* 「碑外一线」壳（切片 2f）：只建一次，重复调用拿回同一个节点。
     插在 #npc-reply 之后、页脚提示之前——落点在 .npc-stage.npc-hero 网格之外，
     不参与立绘那套两列栅格；面板被路由重新注入时壳会跟着抹掉，这里再补一个。 */
  function npcCluesShell(){
    const root = document.getElementById('xx-role-npc-root');
    if(!root) return null;
    const old = document.getElementById('npc-clues');
    if(old && old.parentNode === root) return old;
    const box = npcNode('div', '');
    box.id = 'npc-clues';
    const reply = document.getElementById('npc-reply');
    if(reply && reply.parentNode === root) root.insertBefore(box, reply.nextSibling);
    else root.appendChild(box);
    return box;
  }
  /* 识人页只读清单（切片 2f）：四条恒定，解没解只认 Npc.npcClues 的 heard 判定。
     未解那行留白「——」，且绝不把 lore 写进 DOM——沈碑的话只能听过之后才落到页面上。 */
  function renderNpcClues(stele){
    const box = npcCluesShell();
    if(!box) return;
    const clues = Npc.npcClues(stele);
    box.textContent = '';
    const h = npcNode('h2', 'npc-h');
    h.appendChild(document.createTextNode('碑外一线 '));
    const sub = npcNode('span', 'npc-h-sub',
      clues.filter(c => c.open).length + '/' + clues.length);
    sub.id = 'npc-clues-sub';
    h.appendChild(sub);
    box.appendChild(h);
    const list = npcNode('div', 'sto-log');
    clues.forEach(c => {
      const row = npcNode('div', 'sto-item' + (c.open ? '' : ' lock'));
      row.dataset.clue = c.id;
      row.dataset.topic = c.topicId;
      row.dataset.open = c.open ? '1' : '0';
      const head = npcNode('div', 'sto-h');
      head.appendChild(npcNode('b', '', c.name));
      /* em 位三态：未解 / 已解 / 已印证。第三态只由世界事件终态派生，
         data-open 的判定（只认 heard）一字未改，切片 2f 的断言原样成立。 */
      head.appendChild(npcNode('em', '',
        c.open ? (worldFootVerified(c.topicId) ? '已印证' : '已解') : '未解'));
      row.appendChild(head);
      row.appendChild(npcNode('p', c.open ? 'npc-topic-line' : 'sto-hint', c.open ? c.line : '——他还没讲到这一节。'));
      list.appendChild(row);
    });
    box.appendChild(list);
  }
  /* 世界回声题注（切片 2f）：塔页一条、寿元页一条，文案仍是沈碑原话（配置 lore 引用）。
     两页都挂在 500ms 的 render() 上，所以每次渲染现算现填：节点恒在，未解锁时 hidden
     且清空文本，解锁才填字显形——重绘不会把它留在上一态，也不会提前漏出台词。 */
  function npcEcho(id, topicId){
    const el = document.getElementById(id);
    if(!el) return;
    const stele = S.npcs && S.npcs.stele;
    const hit = (stele && typeof stele === 'object')
      ? Npc.npcClues(stele).filter(c => c.topicId === topicId)[0] : null;
    const open = !!(hit && hit.open);
    /* B3 呈现位之四：碑文题记落款加小头像（与主页卡/对话页/来访浮片同一图源与缓存）。
       open 才填内容；未解锁时整条 hidden，不留任何头像残影。 */
    if(open){
      el.innerHTML = '<img class="echo-ava" data-npc-art="stele" src="ui/avatar/npc_stele_full.jpg" alt="">' +
        '<span>' + Npc.NPC_STELE.name + '题记 ·「' + hit.line + '」</span>';
    }else{
      el.textContent = '';
    }
    el.hidden = !open;
  }

  /* ============ W1「塔底」：一条线索换来的世界事件（第 109 轮） ============
     链：识人页听「山外」→ 塔页题记（切片 2f）→ 俯身看脚下 → 契机 → 三选一 → 终态 + 公共道碑 → 常驻回响。
     唯一真值 S.worldFoot；唯一写口 worldFootDig / worldFootChoose；
     数值只走 encApplyFx 这一个既有出口；回响全部现算派生，不落第二份事实。 */
  const WORLD_FOOT = {
    digLabel: '俯身看脚下',
    digHint: '题记里那句「塔底有东西」，说的就是脚下这一块石。',
    digLog: '你俯身贴近塔底那块石——缝里是热的，风从下面往上走。',
    chooseHint: '石缝里有风。三种法子，只能挑一种。',
    opts: [
      { k:'open', n:'请沈碑下来', tag:'两个人，一双手', d:'他得肯信你', needRel: 15,
        gain:'顿悟 +12',
        tower:'脚下那块石被人翻过又按回去，缝里透下一线光。',
        npc:'他下去了。他没让你看，他自己在碑座背面按了一下。',
        log:'🪨 沈碑下了塔。他没让你看，自己伸手在碑座背面按了一下。' },
      { k:'self', n:'自己撬', tag:'不惊动任何人', d:'横财到手，反噬自己吃',
        gain:'灵石 · 修为反噬',
        tower:'缝里漏风，石屑扫不净。',
        npc:'他扫地的动作停了一下，看了看你的鞋底，什么也没说。',
        log:'🪨 你一个人把石撬开一条缝。取了什么，塔里没人看见。' },
      { k:'seal', n:'封好，回去说清楚', tag:'它还在下面', d:'所得最少，路留得最长',
        gain:'悟道值 +40（×境界系数）',
        tower:'一道封条。条子是旧的，灰是新的。',
        npc:'他把封条按得很平，说：「你再下来时，先敲三下。」',
        log:'🪨 你把石头按回原处，回观前把这一趟说给了他听。' }
    ],
    done: ['open', 'self', 'seal']
  };
  /* 只读：stele4 那句听过没有。判定口径不动——仍只认 Npc.npcClues 的 heard。 */
  function worldFootStele4(){
    const st = S.npcs && S.npcs.stele;
    if(!st || typeof st !== 'object' || !window.Npc) return false;
    const hit = Npc.npcClues(st).filter(c => c.topicId === 'stele4')[0];
    return !!(hit && hit.open);
  }
  const worldFootRel = () => { const st = S.npcs && S.npcs.stele; return (st && typeof st === 'object') ? (st.rel | 0) : 0; };
  function worldFootDone(){ return WORLD_FOOT.done.indexOf(S.worldFoot) >= 0; }
  function worldFootOpt(k){ return WORLD_FOOT.opts.filter(o => o.k === k)[0]; }
  /* 发现入口三闸门：线索已听 + 真进过塔 + 这件事还没开过 */
  function worldFootCanDig(){
    return S.worldFoot === '' && worldFootStele4() && (S.towerMax | 0) >= 1;
  }
  /* 契机 = 纯派生，不占存档值：带着一面镜（反噬挡得半）或塔打通到第 3 层（与主线 1-4 同门槛） */
  function worldFootCanChoose(){
    return S.worldFoot === 'dug' && (((S.guardMirror | 0) > 0) || (S.towerMax | 0) >= 3);
  }
  function worldFootWaitHint(){
    return '石缝太窄。带一面护心镜下来，或把镇妖塔打通到第 3 层（现在历史最高 ' + (S.towerMax | 0) + ' 层）。';
  }
  function worldFootVerified(topicId){ return topicId === 'stele4' && worldFootDone(); }
  function worldFootTowerEcho(){ const o = worldFootOpt(S.worldFoot); return o ? o.tower : ''; }
  function worldFootNpcEcho(){ const o = worldFootOpt(S.worldFoot); return o ? o.npc : ''; }
  /* ============ W2「塔底余波」：三条终态各留一段后续（第 110 轮） ============
     只读 S.worldFoot + S.towerMax + S.miles，零新存档字段；三条各写各的痕迹、
     各给各的奖励渠道（悟道 / 顿悟 / 悟道），各立各的碑。玩家必须在塔里真点一下才成立。
     门槛取塔历史最高层：无装备下界 r=5→5 层（8.5 分）、r=6→6 层（13.6 分）、r=7→8 层（21.7 分），
     而 W1 那一跳发生在 r=4…6，所以三条都是"之后再往下走几层"才撞见的后续，不是当场续集。 */
  const WORLD_AFTER = {
    open: { k:'open', mile:'m_foot_open', needTower: 6,
      trace:'碑座背面有一道新刻的浅痕，刻的是「同来」两个字——他刻的。',
      act:'替他描完那个「同」字',
      after:'碑背上那两个字描完了，笔画里还留着新石粉。',
      npc:'他把描完的字看了一遍，说：「碑认得两只手。往后它替你记着。」',
      log:'✍️ 你替他描完那道「同」字。两个人一起下过的塔，才算有人证。',
      fx:{ wisdom: 30 } },
    self: { k:'self', mile:'m_foot_self', needTower: 7,
      trace:'石缝边压着半枚崩掉的石屑，断口是新的——是你那一晚崩的。',
      act:'把半枚石屑收进袖里',
      after:'缝边少了一半石屑。你袖里多了一样没人见过的东西。',
      npc:'他把扫帚靠在碑上，指了指你的袖口：「塔里捡的东西，别在观前掏。」',
      log:'🪨 你把半枚石屑收进袖里。塔里没人替你记，你自己记。',
      fx:{ insight: 6 } },
    seal: { k:'seal', mile:'m_foot_seal', needTower: 5,
      trace:'封条的灰是新扫的，条子底下还在漏风。你想起他说过的话。',
      act:'按他说的，敲三下',
      after:'封条按得很平。条子底下那阵风，比上回慢了些。',
      npc:'「三下。」他说，「你数得比我准。它记住你了。」',
      log:'🔔 你按他说的敲了三下。第三下，底下有人应了一声。',
      fx:{ wisdom: 20 } }
  };
  function worldAfterOpt(k){ return WORLD_AFTER[k] || null; }
  /* 三条互斥：只认自己那条终态，别的路线一个字都不出现 */
  function worldAfterCan(k){
    const o = worldAfterOpt(k);
    return !!(o && S.worldFoot === k && (S.towerMax | 0) >= o.needTower);
  }
  function worldAfterLit(k){
    const o = worldAfterOpt(k);
    return !!(o && S.miles && S.miles[o.mile]);
  }
  /* 主动参与的那一下：账本仍用现成的 S.miles[id]（跨世保留、resetAll 归零、天然幂等），
     数值只走 encApplyFx 这一个既有出口。立完碑补上道碑自己的红点与提示，不新造 UI。 */
  function worldAfterMark(k){
    const o = worldAfterOpt(k);
    if(!o || !worldAfterCan(k)) return false;
    if(!S.miles || S.miles[o.mile]) return false;      /* 重复进入 / 重复点击：零结算 */
    const m = MILES.filter(x => x.id === o.mile)[0];
    if(!m) return false;
    encApplyFx(o.fx);
    S.miles[o.mile] = Date.now();
    if(S.milesNew) S.milesNew.push(o.mile);
    /* NPC 记忆（T-506 接入）：W2 三线收尾各自落账；缺失/异常一律静默 */
    try{ if(window.NpcMemory) NpcMemory.record('shen_bei', k === 'open' ? '你描完了碑背那个「同」字' : (k === 'self' ? '你把那半枚石屑收进了袖中' : '你按约定敲了三下，底下有人应声'), 'story'); }catch(e){}
    log(o.log, 'gold');
    if(m) mileToast([m]);
    renderMileDot();
    save(); render(); renderTower();
    return true;
  }
  /* 塔页内联：痕迹 + 一枚主动按钮；立过碑之后换成常驻收尾句（按钮不再出现，也就无从重发）。
     两块都挂 id：塔页上 .tw-rew 不止一处（镇守门结算、W1 的提示），测试与实拍要量的是这一条。 */
  function worldAfterHtml(){
    const k = S.worldFoot, o = worldAfterOpt(k);
    if(!o) return '';
    /* 阶段四 C1-3 修法甲（断点 A：信息真空）：选完 seal 之后 worldFootDone() 为真 →
       识人页「下一步」指引整块早退，而这里原先因 towerMax < needTower 直接返回空串，
       于是两页都不再提这件事，needTower 只活在数据里、从未被渲染，玩家会以为剧情坏了。
       现在不够格也给一句，把门槛与 live 进度写在同一句里（口径照 worldFootWaitHint 的既有先例）。
       只解 seal：open／self 两条路线文案未给定稿，保持返空，登记为未覆盖。
       立碑后不再出现（下面 worldAfterLit 分支已有终态句）。零新字段、零数值、不碰 worldAfterMark。 */
    if(!worldAfterCan(k)){
      if(k !== 'seal') return '';
      return '<div class="tw-rew" id="world-after-wait">' +
        escHTML('封条底下的风还没停。要应他那三下，你得先把镇妖塔打到第 ' + o.needTower +
                ' 层（现在历史最高 ' + (S.towerMax | 0) + ' 层）。') + '</div>';
    }
    if(worldAfterLit(k)){
      return '<div class="tw-rew" id="world-after">' + escHTML(o.after) + '</div>';
    }
    return '<div class="tw-rew" id="world-after">' + escHTML(o.trace) + '</div>' +
      '<button class="tw-btn" data-w2="' + k + '">' + escHTML(o.act) + '</button>';
  }
  function worldFootDig(){
    if(!worldFootCanDig()) return false;
    S.worldFoot = 'dug';
    log(WORLD_FOOT.digLog, 'sys');
    save(); render(); renderTower();
    return true;
  }
  /* 结算顺序钉死：数值 → 写终态 → 落盘 → 重绘。
     数值全走 encApplyFx：insight 受 100 封顶（实际到账 = min(12, 100−before)）、
     expLoss 走 min(S.exp, ·) 且护心镜按既有规则自动挡一半并消耗一枚、
     stone 是绝对值口径（与既有奇遇一致，不计入 stats.stoneEarned）。
     ② 不发护心镜，所以不存在"新发的镜当场替新伤买单"；镜数只可能因旧镜抵扣而 −1 或持平。 */
  function worldFootChoose(k){
    if(S.worldFoot !== 'dug') return null;          /* 幂等闸：非 dug（含三个终态）一律零结算 */
    const o = worldFootOpt(k);
    if(!o || !worldFootCanChoose()) return null;
    if(o.needRel && worldFootRel() < o.needRel) return null;
    const fx = {};
    if(k === 'open') fx.insight = 12;
    else if(k === 'self'){ fx.stone = Math.round(needOf(S.rank) * 0.6); fx.expLoss = 0.04; }
    else fx.wisdom = 40;
    const gained = encApplyFx(fx);
    S.worldFoot = k;
    /* NPC 记忆（T-506 接入）：塔底碑座是沈碑的线，三种终态各自落账；缺失/异常一律静默 */
    try{ if(window.NpcMemory) NpcMemory.record('shen_bei', k === 'open' ? '你请他亲手开了塔底的碑座' : (k === 'self' ? '你自己撬开了塔底的石头' : '你封好石头，把这一趟如实说了'), 'story'); }catch(e){}
    log(o.log, 'gold');
    save(); render(); renderTower();
    return { k, gained };
  }
  /* 塔页内联（刻意不用覆盖层）：不与剧情卡 / 新手引导 / 渡劫演出抢同一块台面，
     也不碰 #stance-modal 那个单闭包回调（再调一次会把秘境/论剑的未决回调覆盖掉）。 */
  function worldFootHtml(){
    if(worldFootCanDig()){
      /* 不给这枚按钮配图标：🪨 不在 INK_ICON 里（game.js:84 起那张水墨表），
         落回 emoji 会在一片水墨里跳出一个彩色石头——宁可不带（同 .tw-btn.quit 的纯文字写法）。 */
      return '<button class="tw-btn" data-foot="dig">' + WORLD_FOOT.digLabel + '</button>' +
        '<div class="tw-rew">' + escHTML(WORLD_FOOT.digHint) + '</div>';
    }
    if(worldFootCanChoose()){
      let h = '<div class="tw-rew">' + escHTML(WORLD_FOOT.chooseHint) + '</div><div class="tw-doors">';
      WORLD_FOOT.opts.forEach(o => {
        const off = !!o.needRel && worldFootRel() < o.needRel;
        h += '<button class="tw-door' + (off ? ' off' : '') + '" data-foot="' + o.k + '"' +
          (off ? ' disabled' : '') + '>' +
          '<i>' + escHTML(o.n) + '</i>' +
          '<b>' + escHTML(off ? ('他还不肯信你 · 关系 ' + worldFootRel() + '/' + o.needRel) : o.tag) + '</b>' +
          '<span>' + escHTML(o.d) + '</span>' +
          '<em>' + escHTML(o.gain) + '</em></button>';
      });
      return h + '</div>';
    }
    if(S.worldFoot === 'dug'){
      return '<div class="tw-rew">' + escHTML(worldFootWaitHint()) + '</div>';
    }
    if(worldFootDone()){
      return '<p class="hint" id="world-echo-tower">' + escHTML(worldFootTowerEcho()) + '</p>' + worldAfterHtml();
    }
    /* W3 补桥：世界线尚未开时，塔页原本整片空白。
       玩家被纸签「登镇妖塔一层」带进来，却看不到任何指向观前的路；红点又要等
       听过沈碑④「山外」才亮，等于这条线对新手根本不存在。这里只在局外补一枚
       可见线索 + 一个可点入口，让目标随进度连续变化：
         未见线索 → 去观前问守碑人 → 听过但未登塔 → 先登一层 → 俯身 → 三选一 → 回响。
       零新存档字段、零数值、不改 worldFootCanDig 判据；刻意用 data-w3 独立属性，
       不复用 data-foot/data-w2（W1「终态零入口」「三扇门消失」都按 [data-foot] 计数）。 */
    if(!worldFootStele4()){
      return '<div class="tw-rew">塔底那块石，缝里有风往上走。观前守碑的老吏，似乎知道底下压着什么。</div>' +
        '<button class="tw-btn" data-w3="go-stele">去观前 · 问守碑人</button>';
    }
    return '<div class="tw-rew">他提过脚下的事。先把这塔登上一层，再回来看那块石。</div>';
  }
  /* ============ W3 补桥 · 切片 B：识人页「下一步」指引 ============
     切片 A 把玩家从塔页送到了识人页，可这一页原本没有一句说明来意：不知道
     要听到哪一段才算够，听完也不知道该回塔底。这里补一块随进度换话的指引，
     把「来意 → 听哪段 → 回塔底」接成一条能点着走的线。

     纯派生：只读 S.worldFoot / worldFootStele4() / S.towerMax / worldFootCanChoose()，
     零新存档字段、零数值、不碰 Npc 对话状态机（话题仍要玩家自己点）。
     独立 id + data-w3g：不进 #npc-topics / #npc-clues / #npc-world-echo，
     W1「未解不漏文」、W3·S3「话题区无数字」那批断言量的仍是原来那几块。 */
  function npcW3Shell(){
    const root = document.getElementById('xx-role-npc-root');
    if(!root) return null;
    const old = document.getElementById('npc-w3-guide');
    if(old && old.parentNode === root) return old;
    const box = npcNode('div', '');
    box.id = 'npc-w3-guide';
    /* 落在开场白之后、「话题」标题之前：一进页面就看得见，又不插进话题列表里 */
    const greet = document.getElementById('npc-greet');
    const topics = document.getElementById('npc-topics');
    if(greet && greet.parentNode === root) root.insertBefore(box, greet.nextSibling);
    else if(topics && topics.parentNode === root) root.insertBefore(box, topics);
    else root.appendChild(box);
    return box;
  }
  function npcW3ShowClue(){
    const row = document.querySelector('#npc-clues .sto-item[data-clue="clue3"]');
    if(!row) return;
    if(row.scrollIntoView) try{ row.scrollIntoView({ behavior:'smooth', block:'center' }); }catch(e){}
    row.classList.remove('trail-ring');
    void row.offsetWidth;
    row.classList.add('trail-ring');
    setTimeout(() => row.classList.remove('trail-ring'), 3200);
  }
  function renderNpcW3Guide(){
    const box = npcW3Shell();
    if(!box) return;
    box.textContent = '';
    if(worldFootDone()) return;               /* 终态交给 #npc-world-echo，这一块不再插话 */
    /* 还没听他说过任何一段：此刻指「山外」既提前点名了一个还锁着的话题，
       「往下翻，碑外一线里还空着的那条」也指不到东西（四条全空）。
       初见时选项就在下面，这一块整段不出现。 */
    const stele = S.npcs && S.npcs.stele;
    if(!stele || !Array.isArray(stele.heard) || !stele.heard.length) return;
    let text, btn, act;
    if(S.worldFoot === 'dug'){
      text = worldFootCanChoose() ? '石头撬开了，底下的事还等你拿个主意。'
                                  : '石头撬开了，缝还太窄。带面护心镜，或把塔再往上打两层。';
      btn = '回塔底'; act = 'tower';
    }else if(!worldFootStele4()){
      text = '塔底那阵风，得先听他讲「山外」。往下翻，碑外一线里还空着的那条。';
      btn = '看还空着的那条'; act = 'clue';
    }else if((S.towerMax | 0) < 1){
      text = '他提过脚下了。塔还没上过，先去镇妖塔走一层，再回来看那块石。';
      btn = '去镇妖塔'; act = 'tower';
    }else{
      text = '该听的听了，塔也上过了。塔底那块石，现在动得了。';
      btn = '回塔底 · 俯身看脚下'; act = 'tower';
    }
    /* 叠 .tw-rew 的青绿（与塔页那条线索同色），从沈碑的黑色台词里跳出来；
       留 .npc-topic-line 的行高与下边距。零新 CSS，玩家一眼认得这是「下一步」。 */
    box.appendChild(npcNode('p', 'npc-topic-line tw-rew', '下一步 · ' + text));
    const b = npcNode('button', 'tw-btn', btn);
    b.type = 'button';
    b.dataset.w3g = act;
    b.addEventListener('click', () => {
      if(act === 'clue') npcW3ShowClue();
      else if(window.ROUTER && ROUTER.open) ROUTER.open('tower');
    });
    box.appendChild(b);
  }
  /* 识人页回响壳：建在 #npc-clues 之后（回复区之后），与线索清单各占一枚独立节点。
     非终态：壳在而文本为空——沈碑的那三句结果话绝不提前落 DOM。 */
  function worldEchoShell(){
    const root = document.getElementById('xx-role-npc-root');
    if(!root) return null;
    const old = document.getElementById('npc-world-echo');
    if(old && old.parentNode === root) return old;
    const box = npcNode('div', '');
    box.id = 'npc-world-echo';
    const clues = document.getElementById('npc-clues');
    const reply = document.getElementById('npc-reply');
    if(clues && clues.parentNode === root) root.insertBefore(box, clues.nextSibling);
    else if(reply && reply.parentNode === root) root.insertBefore(box, reply.nextSibling);
    else root.appendChild(box);
    return box;
  }
  function renderWorldEcho(){
    const box = worldEchoShell();
    if(!box) return;
    box.textContent = '';
    if(!worldFootDone()) return;
    const head = npcNode('div', 'sto-h');
    head.appendChild(npcNode('b', '', Npc.NPC_STELE.name + ' · 塔底之后'));
    box.appendChild(head);
    box.appendChild(npcNode('p', 'npc-topic-line', worldFootNpcEcho()));
    /* 阶段四 C1-3 断点 B：「先敲三下」这句台词在识人页，而那枚按钮只在塔页，两页之间
       原先没有一句交叉指路。这里补一句沈碑口吻的地点指路 + 一枚复用现成串的导航按钮。
       分工：本句只回答「去哪儿点」（零数字）；「够不够格」归塔页 worldAfterHtml（修法甲）。
       按钮只导航不结算，不碰 worldAfterMark，故不可能重发 fx.wisdom 或补写 S.miles。
       与 #npc-w3-guide 天然互斥：那块在 worldFootDone() 时早退，而 'seal' ∈ done。
       data-w2go 刻意不复用 data-w2／data-foot／data-w3g，避免撞按属性计数的既有断言。 */
    if(S.worldFoot === 'seal' && !worldAfterLit('seal')){
      box.appendChild(npcNode('p', 'npc-topic-line',
        '他说的那三下，不在观前敲。回塔底，站到你自己封的那块石头跟前去。'));
      const go = npcNode('button', 'tw-btn', '回塔底');
      go.type = 'button';
      go.dataset.w2go = 'tower';
      go.addEventListener('click', () => { if(window.ROUTER && ROUTER.open) ROUTER.open('tower'); });
      box.appendChild(go);
    }
    /* W2：这条路线的后续做完之后，沈碑再给一句——同一块节点内追加，不另立壳，
       所以 W1 那批「回响壳唯一 / 非终态不漏文」的断言量的还是同一件事。 */
    const after = worldAfterOpt(S.worldFoot);
    if(after && worldAfterLit(S.worldFoot)){
      box.appendChild(npcNode('p', 'npc-topic-line', after.npc));
    }
  }
  /* 整页重填：全部动态文本走 textContent / createElement，不拼 innerHTML */
  /* 沈碑「已听」分母：话题表里除 noHear（道别）之外的数量。
     原先四处都写死 /6，但 stele6 是 noHear、heard 永远不会包含它 →
     玩家最好也只能看到 5/6，像是漏做了一段内容。按真实可听话题数算，增删话题自动跟上。 */
  function npcHeardTotal(){
    try{
      const ts = (window.Npc && Npc.NPC_STELE && Npc.NPC_STELE.topics) || [];
      const n = ts.filter(t => t && !t.noHear).length;
      return n > 0 ? n : 6;
    }catch(e){ return 6; }
  }
  /* 阶段四 C1-1②（D2 批甲）：未解锁话题的差额，只进状态位那个 <em>，lockHint 一字不动
     （js/npc.js 的冻结口径是「只指方向、不写条件、不含数字」，两条纪律各守其位）。
     单位用「分」(rel) 与「段」(stage)：源码里谈话次数与解锁之间没有确定映射
     （首次按选项原值，重复时 pos/neu 只 +1、neg/none 不涨），所以「还差 N 次」是假数字，不写。
     need 直读 NPC_STELE.topics[].unlock.min，差值口径 max(0, need - 现值)，不另立数字。
     npcSay 返回的 topics 项不带 unlock，故按 id 回查配置表。畸形输入一律返空串（静默兜底）。 */
  function npcTopicGap(t, st){
    /* 记忆 NPC 框架第一步（界面去计数）：验收 3 要求「沈碑页无话题计数、无 rel 数字外露」，
       上一阶段 D2 落在这里的「还差 N 分／N 段」属于数字外露，本步按新单覆盖为不显示。
       解锁方向仍由话题行的 lockHint（不含数字、不含条件名）承担。 */
    return '';
  }
  function renderNpcPage(){
    const root = document.getElementById('xx-role-npc-root');
    if(!root || !npcUi) return;
    const stele = S.npcs && S.npcs.stele;
    if(!stele || typeof stele !== 'object') return;
    const st = Npc.npcState(stele);
    let say = Npc.npcSay(stele, npcCtx());
    setTxt('npc-name', Npc.NPC_STELE.name);
    setTxt('npc-title', Npc.NPC_STELE.title);
    /* 记忆 NPC 框架第二步（D2 批甲）：关系行移除阶段名——界面上不再有任何阶段字样；
       met=0 一行原样保留（那是「还没见过」，不是阶段）。四通道感知深浅。 */
    /* A5（2026-11-20）：关系只给定性行，不显示 rel 数字、不做数字进度条；
       阶段门槛仍只认 NpcRel 的 15/30/60（判定不动）。 */
    const relFloorOf = r => r >= 60 ? 3 : r >= 30 ? 2 : r >= 15 ? 1 : 0;
    const STAGE_LINES = [
      '他认生，话少。多来坐坐。',
      '他认得你了，肯多说你两句。',
      '他肯跟你说碑面之外的事了。',
      '他把碑后的事，也肯交给你了。'
    ];
    const stageNow = st.met ? relFloorOf(st.rel | 0) : -1;
    setTxt('npc-rel', st.met ? STAGE_LINES[stageNow] : '未识 · 观前的碑就是他');
    /* 阶段变化时给一次可见信号（新称呼/新话题亮起之外，关系行闪一下 + 一句旁白） */
    if(st.met && stageNow !== npcStageShown){
      if(npcStageShown >= 0 && stageNow > npcStageShown){
        const relEl = document.getElementById('npc-rel');
        if(relEl){ relEl.classList.remove('npc-stage-up'); void relEl.offsetWidth; relEl.classList.add('npc-stage-up'); }
        try{ log('（沈碑）他看你的眼神，比上回近了些。', 'sys'); }catch(e){}
      }
      npcStageShown = stageNow;
    }
    /* 记忆摘要（去计数）：只列他记得的旧事名目；不显示分母、不显示选择次数。 */
    const mem = document.getElementById('npc-mem');
    if(mem){
      mem.textContent = '';
      const heardNames = Npc.NPC_STELE.topics
        .filter(t => st.heard.indexOf(t.id) >= 0).map(t => t.name);
      mem.appendChild(npcNode('b', 'npc-mem-k', '记忆 '));
      mem.appendChild(npcNode('span', 'npc-mem-v',
        heardNames.length ? ('他记得：' + heardNames.join('、')) : '还没听他讲过旧事'));
      /* 阶段三 S6：W2「敲三下」已立碑后，识人页给终态，不再让玩家对着消失的入口找 */
      if(worldAfterLit('seal')){
        mem.appendChild(npcNode('p', 'sto-hint',
          '你按他说的敲过三下。封条按得很平，条子底下那阵风，比上回慢了些。三下的事，只做过一次。'));
      }
      /* 阶段四 C1-1③：来访三类里只把 tale 做成一条指路，break／idle 一律静默——
         后两类的完成标记（cur.lastRank／nudgeAt）表达的是「事件已消费」，不是玩家可追求的目标，
         做成计数会诱导刷境界刷来访，与沈碑「纯信息+情感、零数值产出」的定位相反。
         判据内联自 js/npc.js 的 evTaleReady（冻结口径，无 talk 条件）：
           cur.promptTale === 0 && stage >= 1 && heard 不含 TALE_ID('stele3')。
         evTaleReady 未导出（js/npc.js 的 return 面只有 npcTick 等），故此处照抄同三条，
         不新增导出、不改逻辑层。不满足时整行不出现（静默兜底）。零新字段、零数值。 */
      if(st.cur.promptTale === 0 && st.stage >= 1 && st.heard.indexOf('stele3') < 0){
        mem.appendChild(npcNode('p', 'sto-hint',
          '他还有半截旧事没说。（听他把「碑」讲完，他就会开口。）'));
      }
    }
    /* 记忆 NPC 框架第二步（关系事件化 / 可失去 / 状态机 / 托付）：
       阶段只认里程碑（NpcRel），cur.talk 不参与；老档映射 max；冷落 30 日扣一次；
       托付结算与奖励在此落（实物仅材料/消耗品）；事件在「在」态才出。 */
    let relState = 'in', relEvent = null, relEcho = '';
    try{
      if(window.NpcRel){
        const c = npcCtx();
        const rs = stele;                       /* 写回必须打在存档对象上：npcState 是只读副本 */
        NpcRel.migrateStage(rs);
        NpcRel.decay(rs, c);
        const qt = NpcRel.questTick(rs, c);
        qt.done.forEach(id => {
          if(id === 'T1'){ S.herb += 3; log('📜 托付办成 · 灵草 +3', 'good'); }
          else if(id === 'T2'){ S.ore += 2; log('📜 托付办成 · 矿石 +2', 'good'); }
          else if(id === 'T3'){ addItemEx('mat_bone', 1); log('📜 托付办成 · 兽骨 +1', 'good'); }
        });
        qt.failed.forEach(() => log('📜 托付失约 · 他记住了。', 'bad'));
        if(qt.done.length || qt.failed.length) save();
        relState = NpcRel.stateOf(rs, c);
        /* D3 甲案：弥合句已在 npcPageEnter 判定并标记，这里只取本次进页的快照；
           再调一次会被 seenGens 挡掉（原缺陷）。 */
        relEcho = (npcUi && typeof npcUi.echo === 'string') ? npcUi.echo : '';
        if(relState === 'in') relEvent = NpcRel.nextEvent(rs, c, (Npc.NPC_STELE && Npc.NPC_STELE.events2) || null);
        /* 引擎改过 stage/quest/attitude：重算只读视图与话题表，避免本帧用旧副本 */
        st = Npc.npcState(stele);
        say = Npc.npcSay(stele, npcCtx());
      }
    }catch(e){}
    npcUi.relState = relState; npcUi.event = relEvent;
    /* 开场白：进入页面那一刻的快照，本次停留期间不被任何状态变化覆盖 */
    const gr = document.getElementById('npc-greet');
    if(gr){
      gr.textContent = '';
      npcUi.greet.forEach(line => gr.appendChild(npcNode('p', 'npc-greet-line', line)));
      /* D3 尾巴：转世后「弥合一句」——新写的带出句，不重放过期原文。 */
      if(relEcho) gr.appendChild(npcNode('p', 'npc-greet-line', relEcho));
      /* 记忆 NPC 框架第二步：画像翻旧账——只按类别，不存原话。
         rude 优先（他记着那句重话）；其次 open（坦诚过，多漏半句）。 */
      try{
        const att = stele.attitude || {};
        if((att.rude | 0) > 0) gr.appendChild(npcNode('p', 'npc-greet-line', '有些话，老朽记着。'));
        else if((att.open | 0) >= 2) gr.appendChild(npcNode('p', 'npc-greet-line', '你说的，老朽都记着。'));
      }catch(e){}
    }
    /* 话题列表：已听打「已听」，未解锁置灰不可点 */
    const box = document.getElementById('npc-topics');
    if(box){
      box.textContent = '';
      /* 记忆 NPC 框架第二步（状态机）：不在/闭关 → 话题整组收起，只留一句话。 */
      const hideTopics = (relState === 'away' || relState === 'seclusion');
      if(hideTopics){
        box.appendChild(npcNode('p', 'sto-hint', relState === 'away' ? '后山。扫碑。' : '碑上的字，你先看。'));
      }else{
      (say.topics || []).forEach(t => {
        const deep = (t.id === 'stele3' || t.id === 'stele5');
        const badBlock = (relState === 'bad' && deep);   /* 心情差：拒深谈 */
        const open = t.unlocked && !badBlock;
        const row = npcNode('div', 'sto-item npc-topic' + (open ? '' : ' lock'));
        const head = npcNode('div', 'sto-h');
        head.appendChild(npcNode('b', '', t.name));
        head.appendChild(npcNode('em', '', open ? (t.heard ? '已听' : '可谈')
                                                : (badBlock ? '他今天不想说' : '未解锁')));
        row.appendChild(head);
        if(open){
          row.dataset.topic = t.id;
          row.setAttribute('role', 'button');
          row.setAttribute('tabindex', '0');
        }else if(!badBlock && t.lockHint){
          /* W3·S3：锁着的行补一句「怎么让他肯讲」，不含数字、不含条件名。 */
          row.appendChild(npcNode('p', 'sto-hint', t.lockHint));
        }
        box.appendChild(row);
      });
      }
    }
    /* 记忆 NPC 框架第一步（界面去计数）：话题完成度分母整段移除，只留 id 供模板占位。 */
    setTxt('npc-topics-sub', '');
    /* 当前话题正文 + 选项：初见没有话题，直接给三个初见选项 */
    const lines = document.getElementById('npc-topic-lines');
    const opts = document.getElementById('npc-opts');
    if(lines) lines.textContent = '';
    if(opts) opts.textContent = '';
    if(npcUi.first){
      if(lines) lines.appendChild(npcNode('p', 'npc-first-tip', '你还没和他说过话。选一句开场：'));
      ((say && say.options) || []).forEach(o => {
        const b = npcNode('button', 'mc-opt npc-opt', o.label);
        b.type = 'button';
        b.dataset.topic = 'first';
        b.dataset.opt = o.id;
        if(opts) opts.appendChild(b);
      });
    }else if(npcUi.topic){
      const t = (say.topics || []).filter(x => x.id === npcUi.topic)[0];
      if(t && t.unlocked){
        if(lines){
          lines.appendChild(npcNode('p', 'npc-topic-name',
            t.name + (t.heard ? ' · 回忆' : '')));
          (t.lines || []).forEach(l => lines.appendChild(npcNode('p', 'npc-topic-line', l)));
        }
        (t.options || []).forEach(o => {
          const b = npcNode('button', 'mc-opt npc-opt', o.label);
          b.type = 'button';
          b.dataset.topic = t.id;
          b.dataset.opt = o.id;
          if(opts) opts.appendChild(b);
        });
      }else{
        npcUi.topic = null;
      }
    }else if(relEvent){
      /* 记忆 NPC 框架第二步：事件对话——他先说事，玩家回态度；选项一次性（st.events）。 */
      if(lines) lines.appendChild(npcNode('p', 'npc-topic-name', relEvent.line));
      (relEvent.options || []).forEach(o => {
        const b = npcNode('button', 'mc-opt npc-opt', o.label);
        b.type = 'button';
        b.dataset.topic = '__event';
        b.dataset.opt = o.id;
        if(opts) opts.appendChild(b);
      });
    }
    /* 回复区：只活在这一页 */
    const rep = document.getElementById('npc-reply');
    if(rep){
      rep.textContent = '';
      if(npcUi.reply && npcUi.reply.ok){
        rep.hidden = false;
        rep.classList.remove('bad');
        rep.appendChild(npcNode('b', 'npc-reply-k', Npc.NPC_STELE.name + '：'));
        rep.appendChild(npcNode('span', 'npc-reply-v', npcUi.reply.text));
        /* 记忆 NPC 框架第二步（D2）：回复区也不再露阶段名。 */
        /* 记忆没落盘时补一行小字：不打断对话，也不谎称"已经记住了" */
        if(npcUi.reply.memWarn){
          const warn = npcNode('small', 'npc-reply-d', '（这段记忆未能留存 · 本机存储写入失败）');
          warn.style.color = '#a33';
          rep.appendChild(warn);
        }
      }else if(npcUi.reply){
        rep.hidden = false;
        rep.classList.add('bad');
        rep.appendChild(npcNode('span', 'npc-reply-v', '（他没有接这句话。）'));
      }else{
        rep.hidden = true;
        rep.classList.remove('bad');
      }
    }
    /* 碑外一线：本页最后一块，只读，随进入 / 点选项 / 切话题一起刷新（不挂 500ms 常规渲染） */
    renderNpcClues(stele);
    renderWorldEcho();          /* W1「塔底」回响：同样只随本页渲染，非终态时壳在而文本空 */
    renderNpcW3Guide();         /* W3 补桥：本页「下一步」，随听没听过 / 上没上过塔当场换话 */
  }

  function showTreasure(res){
    const m = document.getElementById('treasure-modal');
    if(!m) return;
    const ico = document.getElementById('t-ico');
    const nm = document.getElementById('t-name');
    const ds = document.getElementById('t-desc');
    if(ico) ico.innerHTML = '<img src="' + (res.img || 'ui/icons/ic_gift.png') + '" alt="' + res.name + '">';
    if(nm){ nm.textContent = res.name; nm.className = res.cls || ''; }
    if(ds) ds.textContent = res.desc;
    m.classList.remove('hidden');
  }

  function buy(which, fromEl){
    /* 三种功法（逐步进阶） */
    const g = GONGS.find(x => x.id === which);
    if(g){
      if(!gongUnlocked(g)){ log('境界不够，还参悟不了【' + g.name + '】。', 'bad'); return { ok:false, reason:'locked' }; }
      if(S[g.id] >= g.max){ log('【' + g.name + '】已修至圆满。', 'gold'); return { ok:false, reason:'full' }; }
      const cost = gongCost(g);
      if(S.stone < cost){ log('灵石不足，参悟【' + g.name + '】要 ' + fmt(cost) + ' 灵石。', 'bad'); return { ok:false, reason:'stone', need:cost }; }
      S.stone -= cost;
      S[g.id] += 1;
      log('📖 【' + g.name + '】精进到第 ' + S[g.id] + ' 层。', 'good');
      sfx.click(); save(); render();
      if(fromEl){ spendFloat('-' + fmt(cost) + ' 灵石', fromEl); flashEl(fromEl.closest('.upg')); }
      return { ok:true, lv:S[g.id], cost };
    }
    if(which === 'cave'){
      if(S.cave >= BAL.caveMax){ log('洞府已到 ' + BAL.caveMax + ' 级，登峰造极。', 'gold'); return { ok:false, reason:'full' }; }
      const cost = caveCost();
      if(S.stone < cost) return { ok:false, reason:'stone', need:cost };
      S.stone -= cost;
      S.cave += 1;
      log('🏔️ 洞府扩建到 ' + S.cave + ' 级。', 'good');
      sfx.click(); save(); render();
      if(fromEl){ spendFloat('-' + fmt(cost) + ' 灵石', fromEl); flashEl(fromEl.closest('.upg')); }
      return { ok:true, lv:S.cave, cost };
    }
    if(which === 'dan' || which === 'forge'){
      upgradeBuilding(which === 'dan' ? 'alchemy' : 'forge', fromEl);
      return;
    }
  }
  /* ---------- 任务系统（主线 + 支线） ---------- */
  function questProgress(q){
    const g = q.goal;
    if(!g) return 0;
    if(g.kind === 'stoneEarned') return S.stats.stoneEarned;
    if(g.kind === 'craftPill' || g.kind === 'explore' || g.kind === 'hunt') return S.stats[g.kind] || 0;
    if(g.kind === 'sit' || g.kind === 'herb' || g.kind === 'train' || g.kind === 'enlight') return S.stats[g.kind] || 0;
    return S[g.kind] || 0;   /* rank/field/mine/cave/dan/gong1/gong2/gong3/weapon */
  }
  function questDone(q){ return questProgress(q) >= q.goal.n; }
  /* 当前可见的任务：当前主线（第一个未完成）+ 可领取的支线 */
  function questList(){
    const out = [];
    const mains = QUESTS.filter(q => q.type === 'main');
    for(const q of mains){
      if(!S.questsDone.includes(q.id)){ out.push({ q, main: true }); break; }
    }
    QUESTS.filter(q => q.type === 'side').forEach(q => {
      if(!S.questsDone.includes(q.id) && questDone(q)) out.push({ q, main: false });
    });
    return out;
  }
  function applyReward(r){
    if(!r) return 0;
    if(r.stone){ S.stone += r.stone; S.stats.stoneEarned += r.stone; }
    if(r.exp) addActiveExp(r.exp);
    if(r.herb) S.herb += r.herb;
    if(r.ore) S.ore += r.ore;
    if(r.dao) S.dao += r.dao;
    if(r.bag) S.bagSize = Math.min(BAG_CAP, S.bagSize + BAG_STEP);
    let mailN = 0;
    if(r.dan1){ const x = addItemEx('dan1', '下品破境丹'); if(x.mail) mailN++; }
    if(r.dan2){ const x = addItemEx('dan2', '中品破境丹'); if(x.mail) mailN++; }
    if(r.dan3){ const x = addItemEx('dan3', '上品破境丹'); if(x.mail) mailN++; }
    return mailN;
  }
  function claimQuest(id){
    const q = QUESTS.find(x => x.id === id);
    if(!q){ log('任务不存在，请刷新后重试。', 'bad'); return; } // P0-3 死键反馈（2026-11-13 收口；原型 claimQuestFeedback 经 GPT V3 + Muse 第四方确认）
    if(S.questsDone.includes(id)){ log('「' + q.title + '」奖励已领取过。', 'bad'); return; }
    if(!questDone(q)){ log('「' + q.title + '」尚未达成（' + fmt(questProgress(q)) + ' / ' + fmt(q.goal.n) + '）。', 'bad'); return; }
    const mailN = applyReward(q.reward);
    S.questsDone.push(id);
    /* 悟道值产出途径之二：任务领奖（×境界系数） */
    const wg = wisdomGain(WISDOM.wisdomQuest);
    S.wisdom = moneyInt(S.wisdom) + wg;
    log('✅ 任务完成：「' + q.title + '」 ' + q.rtxt + '，悟道值 +' + wg +
        (mailN > 0 ? '（背包已满，' + mailN + ' 件丹药暂存信匣）' : ''), 'gold');
    sfx.win();
    save(); render(); renderQuest();
  }
  /* 转世的重置清单：原先只写在 reincarnate() 里，第 96 轮坐化转世要复用同一份。
     两处各写一份必然有一天漏字段（漏一个 = 转世后白拿一份旧进度），所以抽出来，两条路都走它。
     ⚠️ 这里只管「一世之内的东西」；跨世的账（S.dao / S.legacy / S.life / S.miles）不许动。 */
  function resetForNewLife(){
    S.rank = 0; S.exp = 0; S.stone = 0;
    S.cave = 0; S.dan = 0; S.forge = 0; S.field = 0; S.mine = 0;
    S.mastery = { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 };   /* 匠道修为从头修 */
    S.herb = 0; S.ore = 0; S.weapon = 0;
    S.art = { bg: 0, brk: 0, cai: 0 };   /* 三族法器随转世归零（灵器已在上面的 S.weapon） */
    ensureRv4().souls = [];                 /* 兽魂随转世归零；万兽谱 found/claimed 跨世保留 */
    S.plots = [];   /* 灵田作物、奇遇机缘一并归零 */
    S.equipment = { weapon: null, armor: null, accessory: null };   /* 装备三槽一并清空 */
    S.enc = { t: 0, bubble: null, lastId: '', seen: {} };   /* 阶段四 C4-1：转世连当日去重账一并归零 */
    S.encBuff = { mult: 0, until: 0 };
    S.weaponLv = 0; S.weaponBless = 0; S.affix = [];   /* 法宝强化归零（转世从头炼） */
    S.huntBeast = null; S.huntProg = 0;
    S.bossKilled = {};   /* 转世后 Boss 首通重新计 */
    S.eggs = []; S.pets = []; S.petSlots = 1;   /* 灵兽归山，重新捕捉 */
    S.tower = 1;                                 /* 镇妖塔当前层重置（战力归零），保留历史最高 */
    S.trun = null;                               /* 转世不问塔里那一局：局随这一世一起散 */
    S.secret.prog = S.secret.prog.slice(); S.secret.day = ''; S.secret.swept = 0;   /* 秘境进度保留，扫荡重置 */
    S.arena.foes = []; S.arena.day = ''; S.arena.left = BAL.arenaDaily; S.arena.proxyDay = '';   /* 论剑榜重排（段位声望保留） */
    S.market = { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 };   /* 坊市重新进货 */
    S.coopBoss = { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 };   /* 转世：协力进度从头 */
    S.lingchao = { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 };
    GONGS.forEach(x => { S[x.id] = 0; });
    S.pillUntil = 0; S.pillBonus = 0;
    danClean({});   /* 三族丹药 buff 也是时间戳状态：转世 / 重开一并消散 */
    resetActs();
    /* 沈碑（第 108 轮）：转世 = 换一世人 → 本世经历 cur 清零；
       跨世记忆（met/rel/stage/seenGens/lastSeen/nudgeAt/heard/choice）一律保留，不清。 */
    S.npcs.stele.cur = { lastRank: 0, talk: 0, promptTale: 0 };
    /* 记忆 NPC 框架第二步（状态机）：转世首日闭关——深谈与托付全关，只留碑面留言。 */
    S.npcs.stele.state = { kind: 'seclusion', until: Date.now() + 86400000 };
    /* 崔九（第 113 轮）：转世 = 换一世人 → 本世对话计数清零；met/rel/heard/choice/lastSeen 保留 */
    if(S.npcs.cuijiu) S.npcs.cuijiu.cur = { talk: 0 };
    npcVisitReset();   /* 访客浮片属于上一世：连倒计时一起收掉，别让旧文案留在屏幕上 */
    try{ if(window.NpcVisitQueue) NpcVisitQueue.clear(); }catch(e){}   /* 崔九主动事件同样属于上一世（第 114 轮）；与上方 npcVisitReset（沈碑气泡）无关 */
    try{ if(window.Net) Net.disconnect(); }catch(e){}   /* 联机会话属于这一世：转世即下线（第 115 轮） */
    try{ multiClearSession(); }catch(e){}   /* P0-C：转世清空联机会话（刷新重连只针对同一世内） */
    /* UI 态不属于任何一世，但它们的**取值**来自上一世的法宝/灵田：
       洗练锁记的是槽位号，转世后 affix 清空 → 残留的锁号会拼出"锁 2 条"这种不存在的状态；
       灵田选中作物同理（上一世种的可能这一世还没解锁）。一并归零。 */
    try{ rrLocks.clear(); }catch(e){}
    farmSel = 'herb';
    S.rootIdx = pickRoot();
    /* 阶段一（路3）：闭关闸门与当日主动计数都属一世之内，转世/坐化转世都不许带进新世。 */
    S.secludeUntil = 0;
    S.day = { key: '', expGain: 0, sweepExp: 0, dec: { res: 0, risk: 0, grow: 0, social: 0 } };
    S.log = [];
    S.last = Date.now();
  }

  /* 遗物候选（第 97 轮）：死前最强的三件法宝，按战力从高到低。
     先看身上穿的三槽，再看背包里能穿的；战力相同取先找到的那件——不做随机，
     转世这种大事上不该有"再死一次试试手气"。第一件就是默认选择（老朋友 strongestRelic 的口径）。 */
  function relicCandidates(){
    const seen = {}, list = [];
    const take = id => {
      const m = ITEMS[id];
      if(!m || !m.slot || EQUIP_SLOTS.indexOf(m.slot) < 0 || seen[id]) return;
      if(m.rv4Equip) return;                 /* rv4 新增六件暂不进转世遗物候选 */
      if(!(equipPowerOf(id) > 0)) return;
      seen[id] = 1;
      list.push({ id: id, p: equipPowerOf(id) });
    };
    EQUIP_SLOTS.forEach(k => take(S.equipment && S.equipment[k]));
    S.bag.forEach(it => { if(it && it.t){ const q = bagQtyOf(it); for(let i = 0; i < q; i++) take(it.t); } });
    list.sort((a, b) => b.p - a.p);
    return list.slice(0, 3).map(x => x.id);
  }
  function strongestRelic(){
    const c = relicCandidates();
    return c.length ? c[0] : null;
  }
  /* 坐化时挑遗物（第 97 轮）：只有死在蒲团上才有的待遇，飞升转世按最强自动带走 */
  function pickRelic(id){
    if(!isZuo() || !id || relicCandidates().indexOf(id) < 0) return false;
    S.legacy.pick = id;
    save(); renderLife();
    return true;
  }

  /* 开新一世（飞升转世 / 坐化转世共用）：道统 +1 世、记一条世系、把遗物塞回背包、寿元归零、复活 */
  function startNewLife(want){
    const cands = relicCandidates();
    const relic = (want && cands.indexOf(want) >= 0) ? want : (cands.length ? cands[0] : null);
    /* 装备处置：只做一件事——把三槽里的东西**全部**搬进背包，背包原样不动。
       这样天然恒等：转世前有 (背包 B 件 + 三槽 S 件)，转世后背包 = B + S 件，
       既不丢、也不复制，且不必对「遗物是不是同一件」做任何特判。
       （旧写法先把遗物从背包 splice 出来再 push 回去：同一件既穿着又在包里时会净丢一件。）
       resetForNewLife 会清空 equipment，所以这里先把 id 取出来，reset 之后再写回背包。
       背包允许超容（界面本来就有「超 N 格」的显示口径），故不做容量判断——宁可超容也不丢。 */
    const slotItems = [];
    EQUIP_SLOTS.forEach(k => {
      const id = S.equipment && S.equipment[k];
      if(id) slotItems.push(id);
    });
    /* 世系要在 reset 之前记：reset 会清掉境界与装备三槽 */
    S.legacy.hist.unshift({ gen: gens() + 1, rank: S.rank, age: lifeAge(), relic: relic });
    if(S.legacy.hist.length > 12) S.legacy.hist.length = 12;
    /* 心魔照镜（第 99 轮）：上一世的你在死的那一刻定形——战力也要在 reset 之前读 */
    S.mirror = {
      gen: gens() + 1, rank: S.rank, age: lifeAge(), brk: (S.life.brk | 0),
      pow: combatPower(), wins: mirrorWins(), done: 0, calm: 0, calmStep: 0
    };
    resetForNewLife();
    S.legacy.gens = gens() + 1;
    S.trail3 = { i: 0, gen: S.legacy.gens };   /* 轮回三关随这一世重走（第 107 轮） */
    S.legacy.relic = relic || null;
    S.legacy.pick = null;
    S.life = { age: 0, on: true, brk: 0 };
    S.zuo = 0;
    /* 把三槽搬进背包（resetForNewLife 已清空 equipment，此处 S.bag 仍是活的、内容未被重置）。
       注意：遗物本身也在这批里（它若穿在身上就在这里；若本来在背包则原样留着），
       所以不需要再单独 push 一次 relic —— 那正是旧写法重复/丢失的根源。 */
    slotItems.forEach(id => {
      S.bag.push({ t: id, n: (ITEMS[id] || {}).n || id, q: 1 });
    });
    if(slotItems.length){
      try{ log('🎒 前世的 ' + slotItems.length + ' 件装备已收回背包。', 'sys'); }catch(e){}
    }
    return relic;
  }

  function reincarnate(){
    if(S.rank < TOP) return;
    confirmAction({
      icon:'♻️', title:'修行 · 确认转世', okText:'确认转世重修',
      text:'转世后境界、功法、灵石、法宝全部归零。<br>换取 <b>1 点道韵</b>（永久 +45% 修炼速度）。',
      foot:'坐化转世是寿元耗尽后的唯一出路；此处确认才会结算。'
    }, ok => { if(ok) doReincarnate(); });
  }
  function doReincarnate(){
    if(S.rank < TOP) return;
    S.dao += 1;
    const relic = startNewLife();
    log('♻️ 转世重修，新灵根【' + rootOf().name + '】，道韵 ' + S.dao + ' 点。', 'gold');
    if(relic) log('🗡️ 前世遗物【' + ((ITEMS[relic] || {}).n || relic) + '】随你入了新世。', 'gold');
    sfx.win(); save(); render();
  }

  /* 坐化（第 96 轮）：寿元耗尽的唯一结局。
     不弹 confirm、不弹 modal——这一刻玩家没有第二种选择，弹框只是在拖延。
     只置状态 + 落一条札记 + 把寿元页推到眼前。 */
  function zuohua(){
    if(S.zuo) return;
    S.zuo = Date.now();
    if(isFinite(lifeMax())) S.life.age = lifeMax();
    /* 第 97 轮：结算卡要有个默认选择——最强那件先点亮，玩家不挑就直接带走 */
    const cands = relicCandidates();
    S.legacy.pick = cands.length ? cands[0] : null;
    log('🪷 寿元已尽。你于蒲团上坐化，这一世修行到此为止。', 'bad');
    sfx.lose();
    save();
    try{ if(window.ROUTER && ROUTER.open) ROUTER.open('life', 'xx-life-now'); }catch(e){}   /* 开屏时路由还没挂上就算了，chip 也会指过来 */
  }

  /* 照镜（第 99 轮）：打赢上一世的自己。胜负不掷骰——战力到线就能赢，没到就点不动。
     结果先入账、动画后开演（沿用第 93 轮的口径：演只管演，不参与结算）。 */
  function mirrorFight(){
    if(!mirrorReady()) return false;
    const foe = mirrorPower(), need = mirrorNeed();
    if(combatPower() < need) return false;
    S.mirror.done = 1;
    S.mirror.wins = mirrorWins() + 1;
    log('🪞 你照见第 ' + S.mirror.gen + ' 世的自己（战力 ' + fmt(foe) + '），一剑破了心魔。道心 +1（修炼 ×' +
      mirrorExpMult().toFixed(2) + '）。' + (calmCount() ? '（守心 ' + calmCount() + '/3，破镜线 ×' + mirrorCalmK().toFixed(3) + '）' : ''), 'gold');
    sfx.win();
    save(); render();
    if(battleAnim && document.getElementById('battle-modal')){
      openBattleAnim(0, () => { render(); }, {
        title: '心魔照镜 · <b>第 ' + S.mirror.gen + ' 世</b>',
        mob: { name: '心魔 · ' + (S.name || '散修'), img: heroImg(), boss: true, mirror: true },
        mobPower: foe,
        script: { win: true, rounds: 3 },
        loot: { text: '道心 +1 · 修炼 ×' + mirrorExpMult().toFixed(2) }
      });
    }
    return true;
  }

  /* 坐化转世：不需要飞升，死了就能再来一世，道统照涨 */
  function reincarnateFromZuohua(){
    if(!isZuo()) return false;
    const relic = startNewLife(S.legacy.pick);
    log('🪷 第 ' + gens() + ' 世。你在同一座山头重新睁眼，新灵根【' + rootOf().name + '】。', 'gold');
    log('📜 道统 ' + gens() + ' 世：修炼速度永久 ×' + legacyMult().toFixed(2) + '。', 'gold');
    if(relic) log('🗡️ 前世遗物【' + ((ITEMS[relic] || {}).n || relic) + '】随你入了新世。', 'gold');
    sfx.win(); save(); render();
    return true;
  }

  /* 老档开寿元（不可逆）：只在寿元页那个按钮里调，绝不在 load() 里替玩家决定 */
  function enableLife(){
    if(lifeOn()) return false;
    S.life = { age: 0, on: true, brk: 0 };
    log('⏳ 你开始数自己的寿元：' + lifeAge() + ' / ' + lifeMax() + ' 年（' + STAGE_NAMES[lifeStage()] + '）。', 'sys');
    save(); render();
    return true;
  }

  /* 渲染 */
  function setTxt(id, v){ const e = document.getElementById(id); if(e) e.textContent = v; }
  /* ===== 立绘素材（透明 PNG，按性别两套） =====
     男女各一张 1080px 宽的手绘立绘。heroImg() 是唯一读取入口：
     路径写这里，缺图自动退回旧的 av_main.png（不会白屏）。 */
  const HERO_IMGS = { m: 'ui/avatar/hero_male.png', f: 'ui/avatar/hero_female.png' };
  const HERO_FALLBACK = 'ui/avatar/av_main.png';
  const heroImg = sex => HERO_IMGS[sex || S.sex] || HERO_IMGS.m || HERO_FALLBACK;
  /* 中央玩家形象：打坐黑色剪影 + 旋转发光阵法（神秘修仙高人感） */
  const figureColor = robe => (robeOf(robe || S.robe) || ROBES[0]).color;
  function silSVG(c){
    return '<svg viewBox="0 0 104 118" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="52" cy="113" rx="40" ry="5" fill="rgba(0,0,0,.45)"/>' +
      '<path d="M52 14 C30 14 24 34 26 52 C10 70 8 96 14 110 C40 118 64 118 90 110 C96 96 94 70 78 52 C80 34 74 14 52 14 Z" fill="#0a0a14"/>' +
      '<path d="M40 40 C44 30 60 30 64 40 C62 54 44 54 40 40 Z" fill="#04040a"/>' +
      '<circle cx="24" cy="100" r="13" fill="#0a0a14"/><circle cx="80" cy="100" r="13" fill="#0a0a14"/>' +
      '<path d="M46 64 C30 78 24 92 22 100" stroke="#0a0a14" stroke-width="11" fill="none" stroke-linecap="round"/>' +
      '<path d="M58 64 C74 78 80 92 82 100" stroke="#0a0a14" stroke-width="11" fill="none" stroke-linecap="round"/>' +
      '<path d="M52 14 C30 14 24 34 26 52 C10 70 8 96 14 110 C40 118 64 118 90 110 C96 96 94 70 78 52 C80 34 74 14 52 14 Z" fill="none" stroke="'+c+'" stroke-opacity=".5" stroke-width="1.5"/>' +
      '<circle cx="52" cy="10" r="3.5" fill="'+c+'" opacity=".85"/>' +
      '</svg>';
  }
  function formSVG(c){
    let t=''; for(let i=0;i<12;i++){ const a=i*Math.PI/6, x1=(100+80*Math.cos(a)).toFixed(1), y1=(100+80*Math.sin(a)).toFixed(1), x2=(100+92*Math.cos(a)).toFixed(1), y2=(100+92*Math.sin(a)).toFixed(1);
      t+='<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"/>'; }
    return '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">' +
      '<g fill="none" stroke="'+c+'"><circle cx="100" cy="100" r="92" stroke-width="2" opacity=".85"/>' +
      '<circle cx="100" cy="100" r="78" stroke-width="1" stroke-dasharray="2 9" opacity=".7"/>' +
      '<circle cx="100" cy="100" r="60" stroke-width="1.2" opacity=".5"/></g>' +
      '<g stroke="'+c+'" stroke-width="2" opacity=".8">'+t+'</g>' +
      '<g transform="translate(100,100)"><circle r="20" fill="none" stroke="'+c+'" stroke-width="1.5" opacity=".75"/>' +
      '<path d="M0 -20 A20 20 0 0 1 0 20 A10 10 0 0 1 0 0 A10 10 0 0 0 0 -20 Z" fill="'+c+'" opacity=".85"/>' +
      '<circle cx="0" cy="-10" r="3" fill="#0a0a14"/><circle cx="0" cy="10" r="3" fill="'+c+'"/></g></svg>';
  }
  function auraSVG(c){
    let t=''; for(let i=0;i<12;i++){ const a=i*Math.PI/6, x1=(100+74*Math.cos(a)).toFixed(1), y1=(100+74*Math.sin(a)).toFixed(1), x2=(100+90*Math.cos(a)).toFixed(1), y2=(100+90*Math.sin(a)).toFixed(1);
      t+='<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"/>'; }
    const arcs='<path d="M100 16 A84 84 0 0 1 158 58"/><path d="M184 100 A84 84 0 0 1 142 158"/><path d="M100 184 A84 84 0 0 1 42 142"/><path d="M16 100 A84 84 0 0 1 58 42"/>';
    return '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">' +
      '<g fill="none" stroke="'+c+'"><circle cx="100" cy="100" r="90" stroke-width="1.4" stroke-dasharray="1 7" opacity=".55"/>' +
      '<circle cx="100" cy="100" r="68" stroke-width="1" opacity=".4"/></g>' +
      '<g stroke="'+c+'" stroke-width="2" opacity=".6">'+t+'</g>' +
      '<g fill="none" stroke="'+c+'" stroke-width="2.5" opacity=".7">'+arcs+'</g></svg>';
  }
  /* 渲染玩家形象：中央=立绘+阵法，其余=剪影小头像。sex 决定立绘，robe 决定阵法/光晕配色 */
  function renderFigureInto(el, mode, sex, robe){
    if(!el) return;
    sex = sex || S.sex || 'm';
    const c = figureColor(robe);
    const src = heroImg(sex);
    const key = (mode || 'card') + ':' + c + ':' + sex + ':' + src;
    if(el.dataset.k === key) return;
    el.dataset.k = key;
    if(mode === 'scene'){
      el.innerHTML =
        '<div class="xx-halo" style="color:'+c+'30"></div>' +
        '<div class="xx-aura-wrap"><div class="xx-aura" style="color:'+c+'55">'+auraSVG(c)+'</div></div>' +
        '<div class="xx-form-wrap"><div class="xx-form" style="color:'+c+'55">'+formSVG(c)+'</div></div>' +
        /* 立绘：脚下升起的光柱 + 淡入，让角色像从阵法里降临 */
        '<div class="sc-hero-beam" style="--beam:'+c+'"></div>' +
        '<img class="sc-hero" src="' + src + '" alt="">' +
        '<div class="sc-shadow"></div>';
      /* 切性别时重播一次「降临」动画（首次渲染不播，避免进场就闪一下） */
      if(el.dataset.was){
        el.classList.remove('hero-descend');
        void el.offsetWidth;             /* 强制回流，让动画能重新触发 */
        el.classList.add('hero-descend');
      } else {
        el.dataset.was = '1';
      }
    } else if(mode === 'mini' || mode === 'card'){
      /* 顶栏 / 身份卡小头像：用同一张立绘放大裁头部，比剪影更能认出玩家 */
      el.innerHTML = '<img class="xx-mini" src="' + src + '" alt="">';
    } else {
      el.innerHTML = silSVG(c);
    }
  }
  /* 背景粒子：上升的金色光点 + 飘落的树叶（一次性生成，之后由 CSS @keyframes 驱动） */
  function buildSceneFX(){
    const box = document.getElementById('scene-particles');
    if(!box || box.childElementCount) return;
    const rnd = (a, b) => a + Math.random() * (b - a);
    let html = '';
    for(let i = 0; i < 13; i++){                       /* 上升的金色光点（灵气） */
      const left = rnd(3, 97), size = rnd(4, 9), dur = rnd(9, 19), delay = rnd(0, 18), sx = rnd(-34, 34);
      html += '<span class="pt" style="left:' + left.toFixed(1) + '%;width:' + size.toFixed(1) + 'px;height:' + size.toFixed(1) +
              'px;animation-duration:' + dur.toFixed(1) + 's;animation-delay:-' + delay.toFixed(1) + 's;--sx:' + sx.toFixed(0) + 'px"></span>';
    }
    const leafCols = ['#caa84e', '#b9863f', '#8aa84a', '#9bbf5a'];   /* 飘落的树叶 */
    for(let i = 0; i < 6; i++){
      const left = rnd(6, 94), size = rnd(11, 18), dur = rnd(14, 25), delay = rnd(0, 22), sx = rnd(-70, 70);
      const col = leafCols[i % leafCols.length];
      html += '<span class="leaf" style="left:' + left.toFixed(1) + '%;width:' + size.toFixed(1) + 'px;height:' + size.toFixed(1) +
              'px;background:linear-gradient(140deg,' + col + ' 0%,rgba(20,30,18,.35) 100%);' +
              'animation-duration:' + dur.toFixed(1) + 's;animation-delay:-' + delay.toFixed(1) + 's;--sx:' + sx.toFixed(0) + 'px"></span>';
    }
    box.innerHTML = html;
  }
  function renderAvatar(){
    renderFigureInto(document.getElementById('sc-figure'), 'scene');
    renderFigureInto(document.getElementById('sc-avatar'), 'mini');
    renderFigureInto(document.getElementById('xx-avatar'), 'card');
    setTxt('xx-name', S.name || '无名散修');
    setTxt('sc-name', S.name || '无名散修');
    setTxt('sc-char-name', S.name || '无名散修');
  }
  /* batch6：子页常驻六项资源行（灵石/修为/寿元/灵草/矿石/战力），口径与主场景顶栏同源。
   只读 S 与 combatPower()，不新增字段；子页 DOM 每次重开由 views/kit.js 重建。 */
  function renderPageRes(){
    const boxes = document.querySelectorAll('.page-res');
    if(!boxes.length) return;
    const need = needOf(S.rank);
    const full = S.exp >= need && secludeLeftMs() <= 0;
    const expTxt = full ? Math.round(S.exp / need * 100) + '%' : fmt(S.exp);
    const lifeTxt = isZuo() ? '坐化' : !lifeOn() ? '未开'
      : (!isFinite(lifeMax()) ? '无量' : '余 ' + Math.floor(lifeLeft()));
    boxes.forEach(box => {
      const put = (k, v) => { const e = box.querySelector('[data-pr="' + k + '"]'); if(e) e.textContent = v; };
      put('stone', fmt(S.stone));
      put('exp', expTxt);
      put('life', lifeTxt);
      put('herb', fmt(S.herb));
      put('ore', fmt(S.ore));
      put('power', fmt(combatPower()));
    });
  }
  /* 场景顶部资源栏 + 中央角色铭牌 + 顶部修为条/突破按钮（一念逍遥式） */
  function renderScene(){
    setTxt('sc-rank', RANK_NAMES[S.rank]);
    setTxt('sc-char-rank', RANK_NAMES[S.rank]);
    setTxt('sc-stone', fmt(S.stone));
    setTxt('sc-herb', fmt(S.herb));
    setTxt('sc-ore', fmt(S.ore));
    setTxt('sc-power', fmt(combatPower()));
    /* 顶部修为进度条 */
    const need = needOf(S.rank);
    const eb = document.getElementById('sc-expbar');
    if(eb) eb.style.width = Math.max(0, Math.min(100, S.exp / need * 100)).toFixed(1) + '%';
    if(eb) eb.title = expReadout(S.exp, need).title;
    /* 第三批 B4：资源行常驻修为数字；满时与修为页同口径写「溢出 N」，闭关时仍报存量 */
    const en = document.getElementById('sc-exp-num');
    if(en){
      const full = S.exp >= need && secludeLeftMs() <= 0;
      const pct = need > 0 ? Math.round(S.exp / need * 100) : 0;
      en.textContent = full
        ? pct + '% · ' + fmt(expInt(S.exp)) + ' / ' + fmt(expInt(need))
        : fmt(expInt(S.exp));
      en.classList.toggle('warn', full);
      en.title = (S.exp >= need ? '灵气已满溢，宜速突破；破境只耗本境所需，余下修为仍在。' : '') + expReadout(S.exp, need).title;
      en.setAttribute('aria-label', '修为 ' + en.textContent + (S.exp >= need ? '，灵气已满溢，宜速突破' : ''));
    }
    /* 顶部突破按钮：修为满即可点（缺丹药时 attemptBreakthrough 会指路炼丹房） */
    const b = document.getElementById('sc-break');
    if(b){
      const nb = breakButtonLabel({ rank: S.rank, exp: S.exp, need: need, top: TOP, nextRankName: RANK_NAMES[S.rank + 1], chancePct: Math.round(breakChance() * 1000) / 10, cdLeft: gateCdMs(S.rank) > 0 ? secludeLeftMs() : 0 });
      b.disabled = nb.disabled;
      b.textContent = nb.text;
      b.title = nb.title;
      b.onclick = nb.action === 'reincarnate' ? reincarnate : (nb.action === 'doBreak' ? doBreak : null);
    }
    renderLifeChip();
    renderBreakReady();
  }
  /* P1：可破境时给顶栏突破按钮挂「下次 +X%」小徽记（入口本身常驻，不另起浮层） */
  function renderBreakReady(){
    /* 突破按钮每拍 set textContent 会把徽记子节点冲掉：这里缺了就补回来 */
    const b0 = document.getElementById('sc-break');
    let el = document.getElementById('sc-break-badge');
    if(!el && b0){
      el = document.createElement('i');
      el.id = 'sc-break-badge';
      el.className = 'tb-break-badge hidden';
      b0.appendChild(el);
    }
    if(!el) return;
    const need = needOf(S.rank);
    const cdLeft = gateCdMs(S.rank) > 0 ? secludeLeftMs() : 0;
    const ready = S.rank < TOP && S.exp >= need && cdLeft <= 0;
    const fb = Math.min(WISDOM.failCap, S.failBonus || 0);
    /* 失败加成只要有，就在破境入口上露出来——不再等修为攒满才显示；
       用户先看到「下次 +X%」，才知道这次失败留下了什么。 */
    const showFb = S.rank < TOP && fb > 0;
    el.classList.toggle('hidden', !showFb);
    if(showFb) el.textContent = '下次 +' + (Math.round(fb * 1000) / 10) + '%';
    const b = document.getElementById('sc-break');
    if(b) b.title = expReadout(S.exp, need).title + (fb > 0 ? ' · 下次成功率 +' + (Math.round(fb * 1000) / 10) + '%' : '');
  }
  /* 顶栏寿元 chip（第 96 轮）：一眼看到"还剩几年"，告急转朱砂，坐化变成一颗按钮。
     四种态写死在这里，UI 不许自己判——不然 chip 和寿元页迟早说出两个不同的数。 */
  function renderLifeChip(){
    const c = document.getElementById('sc-life-chip');
    if(!c) return;
    const v = document.getElementById('sc-life');
    c.classList.remove('low', 'zuo', 'off');
    if(isZuo()){
      c.classList.add('zuo');
      if(v) v.textContent = '坐化';
      c.title = '寿元已尽 · 点开转世续道统';
      return;
    }
    if(!lifeOn()){
      c.classList.add('off');
      if(v) v.textContent = '未开';
      c.title = '这一世还没开始数寿元 · 点开看看';
      return;
    }
    const m = lifeMax();
    if(!isFinite(m)){
      if(v) v.textContent = '无量';
      c.title = '已飞升 · 寿元无量';
      return;
    }
    if(v) v.textContent = '余 ' + Math.floor(lifeLeft());
    if(lifeLeft() / m < BAL.lifeLow) c.classList.add('low');
    c.title = '寿元还剩 ' + Math.floor(lifeLeft()) + ' 年 / 上限 ' + m + ' 年（' + STAGE_NAMES[lifeStage()] + '）· 点开看这一世';
  }
  /* 寿元页（第 96 轮）：两页共用一个 render，元素不在场就自己跳过。
     十段寿元表每次重画——只有十格，不值得为它做增量 diff。 */
  function renderLife(){
    const ageEl = document.getElementById('xx-life-age');
    const on = lifeOn(), zuo = isZuo(), m = lifeMax(), st = lifeStage();
    if(ageEl){
      const finite = isFinite(m);
      setTxt('xx-life-age', zuo ? '终' : String(lifeAge()));
      setTxt('xx-life-max', finite ? String(m) : '无量');
      const bar = document.getElementById('xx-life-barfill');
      if(bar){
        const pct = finite ? Math.max(0, Math.min(100, lifeLeft() / m * 100)) : 100;
        bar.style.width = pct.toFixed(1) + '%';
        bar.parentNode.classList.toggle('low', finite && pct < BAL.lifeLow * 100);
        bar.parentNode.classList.toggle('zuo', zuo);
        bar.parentNode.setAttribute('aria-label', finite ? '寿元还剩 ' + pct.toFixed(0) + '%' : '寿元无量');
        /* 寿烛：火苗高度就是余命，坐化了灯灭。数字之外还得有一眼能看懂的东西。 */
        const wk = document.getElementById('xx-life-wick');
        if(wk){
          wk.style.setProperty('--wick', (finite && !zuo ? pct / 100 : (zuo ? 0 : 1)).toFixed(3));
          wk.classList.toggle('zuo', zuo);
        }
      }
      const yrs = finite ? lifeLeft() : 0;
      setTxt('xx-life-left', zuo
        ? '这一世已经走完：' + lifeAge() + ' 年。'
        : (finite
            ? '还剩 ' + yrs + ' 年（' + STAGE_NAMES[st] + '）· 折算真实时间 ' + fmtDur(yrs * BAL.lifeYearSec)
            : '已飞升，寿元无量——转世是你自己的选择，不是被死逼的。'));
      const sg = document.getElementById('xx-life-stages');
      if(sg){
        sg.innerHTML = LIFE_MAX.map((v, i) =>
          '<span class="ls' + (i === st ? ' now' : (i < st ? ' past' : '')) + '"><b>' + STAGE_NAMES[i] +
          '</b><i>' + (isFinite(v) ? v : '∞') + '</i></span>').join('');
      }
      const en = document.getElementById('xx-life-enable');
      if(en) en.hidden = on;
      const rb = document.getElementById('xx-life-reborn');
      if(rb) rb.hidden = !zuo;
      setTxt('xx-life-hint', zuo
        ? '坐化不是失败：道统会记着这一世修到哪儿，转世之后修炼速度永久更快。'
        : (on
            ? '寿元随境界涨：跨一个大境界，上限就换一格。挂机与闭关都在数年头，所以别在一层上耗太久。'
            : '这一档还没开寿元。开了就回不去——你会老，会死，会转世。要开想清楚。'));
      /* 坐化结算卡（第 97 轮）：享年 / 止步境界 / 突破次数 + 遗物三选一 */
      const sm = document.getElementById('xx-life-sum');
      if(sm){
        sm.hidden = !zuo;
        if(zuo){
          setTxt('xx-sum-age', lifeAge() + ' 年');
          setTxt('xx-sum-rank', RANK_NAMES[S.rank] || '—');
          setTxt('xx-sum-brk', (S.life.brk | 0) + ' 次');
        }
      }
      const pk = document.getElementById('xx-life-picks');
      if(pk){
        const cands = zuo ? relicCandidates() : [];
        const sel = (S.legacy && S.legacy.pick) || null;
        pk.innerHTML = cands.length
          ? cands.map((id, i) => {
              const m2 = ITEMS[id] || {};
              return '<button type="button" class="pick' + (id === sel ? ' on' : '') + '" data-relic="' + id + '">' +
                '<b>' + (m2.n || id) + '</b><i>' + (i === 0 ? '最强' : '备选') + ' · 战力 ' + fmt(equipPowerOf(id)) + '</i></button>';
            }).join('')
          : '<p class="sum-empty">两手空空，这一世带不走任何法宝。</p>';
        pk.querySelectorAll('.pick').forEach(b => { b.onclick = () => pickRelic(b.dataset.relic); });
      }
      setTxt('xx-life-picktip', zuo
        ? ((S.legacy && S.legacy.pick)
            ? '带【' + ((ITEMS[S.legacy.pick] || {}).n || S.legacy.pick) + '】入新世，其余两件随这一世埋进土里。'
            : '点一件带走；都不带就空手转世。')
        : '');
      /* 切片 2f：沈碑「他为何守着」那句听过之后，寿元页落一条题记（节点在 views/life.js 骨架里，恒 hidden 起步） */
      npcEcho('npc-echo-life', 'stele5');
    }
    /* hub 的两颗朱砂印 + 子页页眉的账条 */
    setTxt('xx-hub-life-now', zuo ? '坐化' : (on ? (isFinite(m) ? lifeAge() + '/' + m : '无量') : '未开'));
    setTxt('xx-hub-life-legacy', gens() > 0 ? '第' + gens() + '世' : '初世');
    setTxt('xx-life-now-tag', zuo ? '坐化' : (on ? (isFinite(m) ? '寿元 ' + lifeAge() + ' / ' + m : '飞升') : '未开寿元'));
    setTxt('xx-life-legacy-tag', '道统 ×' + legacyMult().toFixed(2));
    const mst = mirrorState();
    setTxt('xx-hub-life-mirror', mst === 'ready' ? '可照' : mst === 'done' ? '已破'
      : mst === 'short' ? '还差' : '初世');
    setTxt('xx-life-mirror-tag', mirrorWins() > 0 ? '道心 ' + mirrorWins() + ' 胜' : '未照');
    const gl = document.getElementById('xx-life-gens');
    if(gl) gl.textContent = gens() > 0 ? '第 ' + gens() + ' 世 · 修炼 ×' + legacyMult().toFixed(2) : '初世 · 还没转过世';
    const ll = document.getElementById('xx-life-leglist');
    if(ll){
      const relic = (S.legacy && S.legacy.relic) || null;
      ll.innerHTML =
        '<div class="leg-row"><i>转世</i><b>' + gens() + ' 世</b></div>' +
        '<div class="leg-row"><i>道统加成</i><b>修炼速度 ×' + legacyMult().toFixed(2) + '</b></div>' +
        '<div class="leg-row"><i>前世遗物</i><b>' + (relic ? ((ITEMS[relic] || {}).n || relic) : '无') + '</b></div>' +
        '<div class="leg-row"><i>道心</i><b>照镜 ' + Math.min(mirrorWins(), MIRROR.winCap) + ' 胜 · 修炼 ×' +
          mirrorExpMult().toFixed(2) + '</b></div>';
    }
    /* 历代世系（第 97 轮）：最近 12 世，最新的排最上面 */
    const hs = document.getElementById('xx-life-hist');
    if(hs){
      const h = (S.legacy && S.legacy.hist) || [];
      hs.innerHTML = h.length
        ? h.map(x => '<div class="leg-row"><i>第 ' + x.gen + ' 世</i><b>' +
            RANK_NAMES[x.rank] + ' · 享年 ' + x.age + ' 年 · ' +
            (x.relic ? ((ITEMS[x.relic] || {}).n || x.relic) : '未留遗物') + '</b></div>').join('')
        : '<div class="leg-row empty"><i>历代世系</i><b>这一世是初世，往后每转一世人都会记在这儿</b></div>';
    }
    renderMirror();
  }
  /* 心魔照镜（第 99 轮）· 镜里站着上一世的你。
     战力取他坐化那一刻的 combatPower()，不削弱、不放水——比的是「这一世有没有越过上一世」。
     五态（初世 / 镜中无人 / 已破 / 还差 / 可照）写死在这里，按钮与文案都读这个函数。 */
  function mirrorState(){
    if(!gens()) return 'none';
    if(S.mirror && S.mirror.done) return 'done';
    if(!mirrorReady()) return 'empty';
    return combatPower() >= mirrorNeed() ? 'ready' : 'short';
  }
  function renderMirror(){
    const nm = document.getElementById('xx-mf-name');
    if(!nm) return;
    const mr = S.mirror || {};
    const st = mirrorState();
    const foe = mirrorPower(), me = combatPower(), need = mirrorNeed();
    const gen = mr.gen | 0;
    setTxt('xx-mf-name', st === 'none' ? '心魔 · 尚未成形' : '心魔 · 第 ' + gen + ' 世的你');
    setTxt('xx-mf-sub', st === 'none'
      ? '初世没有心魔：转过一世，上一世的你才会在镜里站起来'
      : (RANK_NAMES[mr.rank] || '—') + ' · 享年 ' + (mr.age | 0) + ' 年 · 突破 ' + (mr.brk | 0) + ' 次');
    setTxt('xx-mf-you', fmt(me));
    setTxt('xx-mf-foe', fmt(foe));
    /* 守心降的是门槛不是心魔的战力：两行分开写，免得玩家以为数值前后不一 */
    setTxt('xx-mf-need', calmCount() > 0 ? '守心 −' + (CALM_K * calmCount() * 100).toFixed(1) + '% · 照镜线 ' + fmt(need) : '');
    /* 两根条不好用绝对战力画（差一个数量级就没法看），按两边较大值归一到 4%–100% */
    const mxs = Math.max(me, foe, 1);
    const yb = document.getElementById('xx-mf-youbar'), fb = document.getElementById('xx-mf-foebar');
    if(yb) yb.style.width = Math.max(4, me / mxs * 100).toFixed(1) + '%';
    if(fb) fb.style.width = Math.max(4, foe / mxs * 100).toFixed(1) + '%';
    const vs = document.getElementById('xx-mf-vs');
    if(vs) vs.dataset.state = st;
    const pt = document.getElementById('xx-mf-portrait');
    if(pt) pt.dataset.state = st;
    const bt = document.getElementById('xx-mf-fight');
    if(bt){
      bt.disabled = st !== 'ready';
      bt.dataset.state = st;
      bt.textContent = st === 'ready' ? '照镜 · 破心魔'
        : st === 'done' ? '本世已破镜'
        : st === 'none' ? '尚无前世'
        : st === 'empty' ? '镜中无人'
        : '还差 ' + fmt(need - me) + ' 战力';
      bt.onclick = () => mirrorFight();
    }
    const w = Math.min(mirrorWins(), MIRROR.winCap);
    setTxt('xx-mf-dao', '道心 · 照镜 ' + w + '/' + MIRROR.winCap + ' 胜 · 修炼 ×' + mirrorExpMult().toFixed(2));
    const img = document.getElementById('xx-mf-img');
    if(img && !img.getAttribute('src')) img.src = heroImg();
    setTxt('xx-mf-tip', st === 'none'
      ? '心魔就是上一世的你。先走完这一世——坐化、转世之后，镜里就会站起一个人。'
      : st === 'empty'
        ? '这一世的心魔没有留下战力（老档转世时还没有照镜这一页）。下一次转世他就会补上。'
        : st === 'done'
          ? '这一世已经破镜。同一个心魔一世只照一次——想再照，就再转一世。'
          : st === 'short'
            ? '心魔是上一世坐化那一刻的战力，不削弱也不放水。还差 ' + fmt(need - me) +
              '，先把功法、灵器、法宝补一补。'
            : '你已经越过上一世的自己。照镜一战，赢了道心 +1（每胜修炼 +2%，最多算 ' + MIRROR.winCap + ' 胜）。');
    renderCalm(st);
  }
  /* 守心三息（第 104 轮）：面板只在这里落字，状态全从 S.mirror.calm/calmStep 读，
     所以刷新、切页、重开都停在原来的那一息上。 */
  function renderCalm(st){
    const box = document.getElementById('xx-mf-calm');
    if(!box) return;
    const live = st === 'short' || st === 'ready';
    box.dataset.state = live ? (calmDone() ? 'over' : 'ask') : 'none';
    if(!live) return;
    if(!box.dataset.bound){
      box.dataset.bound = '1';
      box.addEventListener('click', ev => {
        const b = ev.target && ev.target.closest ? ev.target.closest('[data-calm]') : null;
        if(!b || b.disabled) return;
        calmPick(b.getAttribute('data-calm'));
      });
    }
    const n = calmStep(), kept = calmCount();
    setTxt('xx-mf-calm-tag', calmDone() ? '已守心 · ' + kept + '/3' : '第 ' + (n + 1) + ' 息 · 心念 ' + kept + '/3');
    /* 收签后把三息摆成三颗墨点：实心 = 那一息默守，朱砂圈 = 那一息断喝 */
    const pips = document.getElementById('xx-mf-calm-pips');
    if(pips){
      const on = calmDone() ? '1' : '';
      if(pips.dataset.on !== on){
        pips.dataset.on = on;
        pips.innerHTML = on
          ? '<i data-k="hold"></i>'.repeat(kept) + '<i data-k="break"></i>'.repeat(CALM.length - kept)
          : '';
      }
    }
    if(!calmDone()){
      setTxt('xx-mf-calm-ask', CALM[n].ask);
      setTxt('xx-mf-calm-note', '默守得心念，断喝得修为——三息过后心念留在这一世，断喝的修为也不退。');
      const bh = box.querySelector('[data-calm="hold"] small');
      const bb = box.querySelector('[data-calm="break"] small');
      if(bh) bh.textContent = '心念 +1 · 破镜线再降 ' + (CALM_K * 100).toFixed(1) + '%';
      if(bb) bb.textContent = '修为 +' + fmt(calmExpGain()) + ' · 心念不进';
    }else{
      setTxt('xx-mf-calm-ask', '「……」心魔不再出声。');
      setTxt('xx-mf-calm-note', '三息已过：心念 ' + kept + '/3，照镜线 ×' + mirrorCalmK().toFixed(3) +
        '——' + (kept === 3 ? '一声未应，他撼不动你了。' : kept === 0 ? '每一息都还了手，他也记住了你。' : '半守半喝，心还稳着。'));
    }
  }
  /* ============================================================
   * 入门八事（第 105 轮）：第一局该做什么，直接写在场景上
   * ------------------------------------------------------------
   * 为什么要有它：新号 20 分钟的实测（DEV_NOTES §105.1）——修为一路涨到筑基，
   * 镇妖塔 / 秘境 / 猎妖 / 炼丹一次都没碰过。不是长得慢，是游戏从头到尾
   * 没要求过玩家做任何事；而第 100~104 轮做的四处交互，全都埋在第一次会话够不着的地方。
   *
   * 口径：
   *   · 达成条件只读现成字段（stats.sit / rank / cave / towerMax / 秘境进度 / craftPill…），
   *     不新增计数器，也不改任何产出公式。
   *   · 每了结一事当场入账：修为 = need×0.10、灵石 = need×0.12（按当下的境界算），
   *     另有几笔材料是「下一事要用的量」——采药给灵草、塔与秘境给丹房开炉的本钱。
   *   · 第八事（猎妖）了了就是最后一笔：赠一枚下品破境丹，纸签自动收起。
   *   · 没有 trail 字段的老档 = 已了（i=8），永不出现。
   * ============================================================ */
  const TRAIL_CN = '一二三四五六七八';
  const TRAIL = [
    { key: 'sit', name: '打坐三炷香', hint: '点下方【打坐】三次，先把气感养出来',
      go: 'scene:sit', done: () => (S.stats.sit | 0) >= 3 },
    { key: 'herb', name: '采两把灵草', hint: '藏经阁 · 日课里点【采药】两次，炼丹要用它',
      go: 'xiu:xx-acts', done: () => (S.stats.herb | 0) >= 2, rw: { herb: 6 } },
    { key: 'brk', name: '破境至炼气三层', hint: '修为满了点顶上【突破】，失败也别停手',
      go: 'scene:break', done: () => (S.rank | 0) >= 2 },
    { key: 'array', name: '聚灵阵升一级', hint: '洞府 · 聚灵阵，灵石产出跟着涨',
      go: 'dong:xx-array-sec', done: () => (S.cave | 0) >= 1 },
    { key: 'tower', name: '登镇妖塔一层', hint: '城镇 · 镇妖塔，挑战当前层妖兽，胜则上一层',
      go: 'tower', done: () => (S.towerMax | 0) >= 1, rw: { herb: 10 } },
    { key: 'secret', name: '探上古秘境一层', hint: '城镇 · 上古秘境，选一式再掷骰；打不过就先破境',
      go: 'secret', done: () => secretTotal() >= 1, rw: { herb: 14, ore: 12 } },
    { key: 'alchemy', name: '炼丹房开炉', hint: '洞府 · 炼丹房：丹房先升一级，再炼一枚破境丹',
      go: 'dong:xx-alchemy-sec', done: () => (S.stats.craftPill | 0) >= 1 },
    { key: 'hunt', name: '猎一只妖兽', hint: '镇妖塔 · 击杀当前层妖兽（登一层也算）',
      go: 'tower', done: () => (S.stats.hunt | 0) >= 1 || (S.towerMax | 0) >= 1, last: true }
  ];
  /* 旧档没有 trail 字段 → 八事已了；有则夹进 0~8（脏值不许把纸签顶过表长） */
  function trailMigrate(t){
    if(t && typeof t === 'object' && isFinite(t.i)) return Math.max(0, Math.min(TRAIL.length, t.i | 0));
    return TRAIL.length;
  }
  function trailIdx(){ return trailMigrate(S.trail); }
  function trailActive(){ return trailIdx() < TRAIL.length; }
  /* 进度小字（纸签右侧）：显示的是「现在到哪儿了」，不是「还差多少」，读着才不催命 */
  function trailProg(i){
    const st = TRAIL[i];
    if(!st) return '';
    switch(st.key){
      case 'sit':     return (S.stats.sit | 0) + '/3';
      case 'herb':    return (S.stats.herb | 0) + '/2';
      case 'brk':     return ((S.rank | 0) + 1) + '/3 层';
      case 'array':   return 'Lv.' + (S.cave | 0) + '/1';
      case 'tower':   return (S.towerMax | 0) + '/1 层';
      case 'secret':  return secretTotal() + '/1 层';
      case 'alchemy': return (S.stats.craftPill | 0) + '/1 炉';
      case 'hunt':    return (S.stats.hunt | 0) + '/1 只';
    }
    return '';
  }
  function trailAward(st, i){
    const need = needOf(S.rank);
    const stone = Math.round(need * 0.12), exp = Math.round(need * 0.10);
    const rw = st.rw || {};
    let mailN = applyReward({ stone: stone, exp: exp, herb: rw.herb || 0, ore: rw.ore || 0 });
    if(st.last) mailN += applyReward({ dan1: 1 });
    const bits = ['修为 +' + fmt(exp), '灵石 +' + fmt(stone)];
    if(rw.herb) bits.push('灵草 +' + rw.herb);
    if(rw.ore) bits.push('矿石 +' + rw.ore);
    if(st.last) bits.push('下品破境丹 ×1');
    if(mailN > 0) bits.push(mailN + ' 件暂存信匣');
    log('📜 入门第' + TRAIL_CN.charAt(i) + '事 · ' + st.name + '：' + bits.join('，') + '。', 'gold');
    /* batch6：任务卡完成/收起必须有可见结算，不许无声消失 */
    try{ gainChip('📜 入门第' + TRAIL_CN.charAt(i) + '事完成 · ' + st.name, 'gold'); }catch(e){}
    if(st.last){
      log('🧭 入门八事已了。往后：山门每日有事可议，塔每日可扫，论剑、猎场、秘境也都开着。', 'sys');
      try{
        showSettle({ icon: '📜', title: '入门八事 · 完成', sub: '任务卡到此收起',
          rows: [settleLine('已入账', bits.join('、'), 'good')],
          note: '八事奖励逐项入账；纸签收起后，往后每日可做的事在「今日」清单里。' });
      }catch(e){}
      sfx.win();
    }else{
      sfx.pop();
    }
  }
  /* 一帧最多把能了的事一路了完（比如离线回来境界已经涨到位），每件只发一次奖。
     八事没走完不接道途：两条轨同时发账，日志会打架，纸签也说不清自己在报哪一条。 */
  function trailTick(){
    let moved = 0;
    while(trailActive()){
      const i = trailIdx(), st = TRAIL[i];
      if(!st.done()) break;
      S.trail.i = i + 1;
      trailAward(st, i);
      moved++;
    }
    if(!trailActive()){
      /* 轮回在纸签上排在道途前面（第二世先过三关），推进顺序跟显示顺序一致 ——
         不然道途会在看不见的地方默默发账 */
      while(trail3Active()){
        const i = trail3Idx(), st = TRAIL3[i];
        if(!st.done()) break;
        S.trail3.i = i + 1;
        trail3Award(st, i);
        moved++;
      }
      if(!trail3Active()){
        while(trail2Active()){
          const i = trail2Idx(), st = TRAIL2[i];
          if(!st.done()) break;
          S.trail2.i = i + 1;
          trail2Award(st, i);
          moved++;
        }
      }
    }
    if(moved){ save(); renderTrail(); }
    return moved;
  }
  /* 纸签：教程在台上时让位（两套引导同屏会互相指），两轨都了永久收起。
     模式只有两种：入门八事（seal = 第几事）/ 道途（seal 固定「道」，右上角报第几程）。 */
  function renderTrail(){
    const el = document.getElementById('sc-trail');
    if(!el) return;
    const i1 = trailIdx(), i2 = trail2Idx(), i3 = trail3Idx();
    /* 轮回排在道途之前：第二世睁眼该看到的是"重修 → 心魔"，不是上一世停下的那一程 */
    const mode = i1 < TRAIL.length ? 1 : (trail3Active() ? 3 : (i2 < TRAIL2.length ? 2 : 0));
    if(!mode){ if(!el.hidden) el.hidden = true; return; }
    /* R-3（2026-11-14 阶段一）：旧引导节点（tut-mask / tut-tip）在换代后已不再生成，
       只认它们会让太虚气泡与纸签同屏互指。这里补认现行引导：
       body.guide-active 是 Guide.render() 的唯一上台标记，#taixu-bubble 可见作为兜底。 */
    const tm = document.getElementById('tut-mask'), tt = document.getElementById('tut-tip');
    const tb = document.getElementById('taixu-bubble');
    const guideOn = document.body.classList.contains('guide-active') ||
                    !!(tb && tb.style.display && tb.style.display !== 'none');
    const tutOn = (tm && tm.classList.contains('show')) || (tt && tt.classList.contains('show')) || guideOn;
    el.hidden = !!tutOn;
    if(tutOn) return;
    const idx = mode === 1 ? i1 : (mode === 3 ? i3 : i2);
    const total = mode === 1 ? TRAIL.length : (mode === 3 ? TRAIL3.length : TRAIL2.length);
    const st = mode === 1 ? TRAIL[idx] : (mode === 3 ? TRAIL3[idx] : TRAIL2[idx]);
    setTxt('st-kicker', mode === 1 ? '入门八事' : (mode === 3 ? '轮回 · 第' + gens() + '世 · ' + (idx + 1) + '/' + total : '道途 · ' + (idx + 1) + '/' + total));
    setTxt('st-seal', mode === 1 ? TRAIL_CN.charAt(idx) : (mode === 3 ? '轮' : '道'));
    setTxt('st-name', st.name);
    let hintTxt = (secludeLeftMs() > 0 && /突破|破境/.test(st.hint || ''))
      ? gateLockNote() + '；可做：' + gateGoals().join('、')
      : st.hint;
    /* P0.5：灵草生长期不让玩家空等——倒计时与“可先去做”同屏写清 */
    try{
      const grow = (S.plots || []).filter(p => p && !plotRipe(p)).sort((a, b) =>
        (a.need - (Date.now() - a.t0) / 1000) - (b.need - (Date.now() - b.t0) / 1000))[0];
      if(grow){
        const c = CROPS[grow.crop] || { name: '灵草' };
        hintTxt += ' ｜ ' + c.name + '约 ' + plotLeftTxt(grow) + '后成熟；可先去做：打坐 / 采药 / 爬塔';
      }
    }catch(e){}
    setTxt('st-hint', hintTxt);
    setTxt('st-prog', mode === 1 ? trailProg(idx) : (mode === 3 ? trail3Prog(idx) : trail2Prog(idx)));
    el.dataset.k = st.key;
    el.dataset.mode = mode === 1 ? 'ru' : (mode === 3 ? 'lun' : 'dao');
    const pips = document.getElementById('st-pips');
    if(pips){
      if(pips.children.length !== total){
        let h = '';
        for(let k = 0; k < total; k++) h += '<i></i>';
        pips.innerHTML = h;
      }
      for(let k = 0; k < total; k++){
        const cls = k < idx ? 'done' : (k === idx ? 'now' : '');
        if(pips.children[k].className !== cls) pips.children[k].className = cls;
      }
    }
  }
  /* 点纸签：本页就能做的事（打坐 / 突破）改成圈那个钮，别的直接路由到那一页 */
  function trailGo(){
    const i1 = trailIdx(), i2 = trail2Idx();
    const st = i1 < TRAIL.length ? TRAIL[i1]
      : (trail3Active() ? TRAIL3[trail3Idx()] : (i2 < TRAIL2.length ? TRAIL2[i2] : null));
    if(!st) return false;
    if(st.go.indexOf('scene:') === 0){
      const k = st.go.slice(6);
      const el = k === 'sit'
        ? document.querySelector('#sc-acts .cave-act[data-k="sit"]')
        : document.getElementById('sc-break');
      if(el){
        el.classList.remove('trail-ring');
        void el.offsetWidth;
        el.classList.add('trail-ring');
        setTimeout(() => el.classList.remove('trail-ring'), 3200);
      }
      return true;
    }
    const parts = st.go.split(':');
    try{
      if(window.ROUTER && ROUTER.open) ROUTER.open(parts[0], parts[1] || undefined);
    }catch(e){}
    return true;
  }

  /* ============================================================
   * 道途（第 106 轮）：入门八事之后，那张纸签不收起，换成长线
   * ------------------------------------------------------------
   * 为什么：八事只够撑住前 20 分钟（§105.1），而 _curve 量出来的单层挂机时长
   * 从第 9 层 24 分钟一路涨到第 15 层 5.9 小时、第 18 层 22.7 小时 —— 界面上
   * 却再没有一个"下一件该做的事"，玩家只能在一堆已解锁的按钮里自己找意义。
   * 道途就是那条"下一件"：一次只亮一程，够得着、看得见进度、成了当场有账。
   *
   * 口径与八事完全一致：只读现成字段（rank / towerMax / secretTotal / gate / dt / wu），
   * 不新增计数器、不改任何产出公式。每成一程：修为 + 灵石 = 当前层需求 × 0.15；
   * 跨大境界的那一程再送一枚"对得上段"的破境丹（段表 BREAK_TIERS 的 pill 字段）。
   * 十二程：筑基 → 塔五层 → 秘境五层 → 金丹 → 开山立派 → 元婴 → 洞天 →
   *         化神 → 悟道一路 → 炼虚 → 大乘 → 渡劫飞升。
   * ============================================================ */
  const TRAIL2_CN = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];
  const TRAIL2_K = 0.15;                       /* 一程 = 当前层需求的 15%（修为与灵石各一份） */
  const dtLvSum = () => Object.keys(S.dt || {}).reduce((a, k) => a + (S.dt[k] | 0), 0);
  const wuAnyMax = () => ['sword', 'dan', 'array'].some(k => wuOf(k) >= WU_MAX);
  const brkProg = () => Math.round(Math.min(1, S.exp / needOf(S.rank)) * 100) + '%';
  const TRAIL2 = [
    { key:'brk9', name:'筑基', hint:'修为攒满就点顶上【突破】：筑基之后，山门才肯收你',
      go:'scene:break', done:() => (S.rank | 0) >= 9, prog: brkProg, dan:'dan2' },
    { key:'tower5', name:'登镇妖塔五层', hint:'城镇 · 镇妖塔：每步三扇门，要往深处先问观前守碑人',
      go:'tower', done:() => (S.towerMax | 0) >= 5, prog:() => (S.towerMax | 0) + ' / 5' },
    { key:'secret5', name:'秘境五层', hint:'城镇 · 上古秘境：掷骰之前先选一式（取财 / 取料）',
      go:'secret', done:() => secretTotal() >= 5, prog:() => secretTotal() + ' / 5' },
    { key:'brk12', name:'金丹', hint:'攒满就点顶上【突破】：金丹一成，寿元与产出都上台阶',
      go:'scene:break', done:() => (S.rank | 0) >= 12, prog: brkProg, dan:'dan_jindan' },
    { key:'gate', name:'开山立派', hint:'宗门 · 山门：花约一层灵石收入，收第一个弟子替你做事',
      go:'zong_gate', done:() => ((S.gate && S.gate.lv) | 0) >= 1, prog:() => '山门 ' + (((S.gate && S.gate.lv) | 0) || '未立') },
    { key:'brk15', name:'元婴', hint:'元婴之后一层要挂几个时辰 —— 洞天与法器该一起养起来了',
      go:'scene:break', done:() => (S.rank | 0) >= 15, prog: brkProg, dan:'dan3' },
    { key:'dt1', name:'开辟洞天', hint:'洞府 · 洞天开辟：五方洞天全开是平线加成，越早越赚',
      go:'dong_dongtian', done:() => dtLvSum() >= 1, prog:() => '已开 ' + dtLvSum() + ' 重' },
    { key:'brk18', name:'化神', hint:'化神这一破最难：丹药、护道阵法、顿悟进度备齐再点',
      go:'scene:break', done:() => (S.rank | 0) >= 18, prog: brkProg, dan:'dan_huashen' },
    { key:'wu5', name:'悟道一路点满', hint:'人物 · 悟道：锋芒 / 归一 / 地脉，挑一路走到头',
      go:'role_wu', done:() => wuAnyMax(), prog:() => '锋芒 ' + wuOf('sword') + ' · 归一 ' + wuOf('dan') + ' · 地脉 ' + wuOf('array') },
    { key:'brk21', name:'炼虚', hint:'炼虚之后一层要挂两三天：塔、秘境、猎场每天的账不能断',
      go:'scene:break', done:() => (S.rank | 0) >= 21, prog: brkProg, dan:'dan4' },
    { key:'brk23', name:'大乘', hint:'还是一样：攒满点顶上【突破】——大乘是人间最后几层',
      go:'scene:break', done:() => (S.rank | 0) >= 23, prog: brkProg, dan:'dan5' },
    { key:'brk25', name:'渡劫飞升', hint:'渡劫一过，人间再无可破之境 —— 剩下的路靠自己转世',
      go:'scene:break', done:() => (S.rank | 0) >= TOP, prog: brkProg, last:true }
  ];
  /* 老档没有 trail2：定位到第一件还没做成的（一件都没漏就 = 全了），不补发奖励 */
  function trail2Migrate(t){
    if(t && typeof t === 'object' && isFinite(t.i)) return Math.max(0, Math.min(TRAIL2.length, t.i | 0));
    for(let i = 0; i < TRAIL2.length; i++){ if(!TRAIL2[i].done()) return i; }
    return TRAIL2.length;
  }
  function trail2Idx(){ return trail2Migrate(S.trail2); }
  function trail2Active(){ return trail2Idx() < TRAIL2.length; }
  function trail2Prog(i){
    const st = TRAIL2[i];
    if(!st) return '';
    try{ return st.prog ? st.prog() : ''; }catch(e){ return ''; }
  }
  function trail2Award(st, i){
    const need = needOf(S.rank);
    const stone = Math.round(need * TRAIL2_K), exp = Math.round(need * TRAIL2_K);
    let mailN = applyReward({ stone: stone, exp: exp });
    /* 破境丹不走 applyReward：那张表只认 dan1~dan3，九阶里的另外四枚会被静默吞掉 */
    if(st.dan){ const r = addItemEx(st.dan, breakPillMeta(st.dan).name); if(r.mail) mailN++; }
    const bits = ['修为 +' + fmt(exp), '灵石 +' + fmt(stone)];
    if(st.dan) bits.push(breakPillMeta(st.dan).name + ' ×1');
    if(mailN > 0) bits.push(mailN + ' 件暂存信匣');
    log('🧭 道途第' + TRAIL2_CN[i] + '程 · ' + st.name + '：' + bits.join('，') + '。', 'gold');
    if(st.last){
      log('🌌 十二程走尽，人间再无可破之境。往后：转世重修，把这一世的战力留给下一世的自己去越。', 'sys');
      sfx.win();
    }else{
      sfx.pop();
    }
  }
  /* ============================================================
   * 轮回之途（第 107 轮）：第二世起，纸签也不空着
   * ------------------------------------------------------------
   * 为什么：十二程写的是"一世怎么走完"；转世之后境界归零，纸签却还停在上一世那一程，
   * 而塔 / 洞天 / 山门都是跨世保留的 —— 玩家睁眼看到的是一条已经走完的路。
   * 三关：重修回金丹 → 照见心魔 → 战力逾过坐化那一刻的自己。
   * gen 绑这一世：换世整张重走；旧世的账已经结过，不补发。
   * ============================================================ */
  const TRAIL3_CN = ['一', '二', '三'];
  const TRAIL3 = [
    { key:'lun12', name:'重修 · 结丹', hint:'这一世从头再来：先修回金丹，前世的修为才接得上',
      go:'scene:break', done:() => (S.rank | 0) >= 12, prog: brkProg },
    { key:'lunMirror', name:'照见心魔', hint:'寿元 · 心魔：战力到线，才破得了镜里那个人',
      go:'life', done:() => !mirrorReady() || !!(S.mirror && S.mirror.done),
      prog:() => (S.mirror && S.mirror.done) ? '已破' : '需战力 ' + fmt(mirrorNeed()) },
    { key:'lunPass', name:'逾过前世', hint:'战力越过坐化那一刻的自己，这一世才算没白来',
      go:'life', last:true,
      done:() => !(mirrorPower() > 10 * POW_K) || combatPower() >= mirrorPower(),
      prog:() => '眼前 ' + fmt(combatPower()) + ' / 前世 ' + fmt(mirrorPower()) }
  ];
  /* 字段属于当前世才认；换过世 / 老档一律定位到这一世第一件还没做成的（不补发） */
  function trail3Migrate(t, g){
    const cur = (typeof g === 'number' && isFinite(g)) ? (g | 0) : gens();
    if(t && typeof t === 'object' && isFinite(t.i) && (t.gen | 0) === cur){
      return Math.max(0, Math.min(TRAIL3.length, t.i | 0));
    }
    for(let i = 0; i < TRAIL3.length; i++){ if(!TRAIL3[i].done()) return i; }
    return TRAIL3.length;
  }
  function trail3Idx(){
    const t = S.trail3;
    if(!t || typeof t !== 'object' || (t.gen | 0) !== gens()) return 0;
    return Math.max(0, Math.min(TRAIL3.length, t.i | 0));
  }
  function trail3Active(){ return gens() > 0 && trail3Idx() < TRAIL3.length; }
  function trail3Prog(i){
    const st = TRAIL3[i];
    if(!st) return '';
    try{ return st.prog ? st.prog() : ''; }catch(e){ return ''; }
  }
  function trail3Award(st, i){
    const need = needOf(S.rank);
    const k = st.last ? TRAIL2_K * 2 : TRAIL2_K;   /* 逾过前世是这一世的收口，给双份 */
    const stone = Math.round(need * k), exp = Math.round(need * k);
    applyReward({ stone: stone, exp: exp });
    log('♻️ 轮回第' + TRAIL3_CN[i] + '关 · ' + st.name + '：修为 +' + fmt(exp) + '，灵石 +' + fmt(stone) + '。', 'gold');
    if(st.last){
      log('🌗 三关已过：这一世已经站到上一世前面。往后照镜、转世、再走一遍都随你。', 'sys');
      sfx.win();
    }else{
      sfx.pop();
    }
  }
  /* hub 卷尾题跋（第 106 轮）：城镇 8 个 hub 的格子只有 2~4 行，下半截空 37%~83%，
     但空着不是"大气"是"没说完"。题跋只写一行此刻走到哪儿（八事 / 道途），
     原地改字不重建节点 —— 500ms 一跳的整体重绘会把鼠标按到一半的格子换掉。 */
  function renderHubScroll(){
    const els = document.querySelectorAll('.hub-scroll');
    if(!els.length) return;
    const i1 = trailIdx(), i2 = trail2Idx(), i3 = trail3Idx();
    let title, sub, idx;
    if(i1 < TRAIL.length){
      const st = TRAIL[i1];
      title = '入门 · ' + st.name;
      sub = st.hint;
      idx = i1 + ' / ' + TRAIL.length;
    }else if(trail3Active()){
      const st = TRAIL3[i3];
      title = '轮回 · 第' + gens() + '世 · ' + st.name;
      sub = st.prog ? trail3Prog(i3) : st.hint;
      idx = (i3 + 1) + ' / ' + TRAIL3.length;
    }else if(i2 < TRAIL2.length){
      title = '道途 · ' + TRAIL2[i2].name;
      sub = '第' + TRAIL2_CN[i2] + '程 · ' + trail2Prog(i2);
      idx = (i2 + 1) + ' / ' + TRAIL2.length;
    }else{
      title = gens() > 0 ? '轮回三关已过' : '道途已尽';
      sub = gens() > 0
        ? '这一世已站到上一世前面：接下来的境界，是你自己新走出来的。'
        : '人间再无可破之境：转世重修，或者去照一照心魔。';
      idx = (gens() > 0 ? TRAIL3.length : TRAIL2.length) + ' / ' + (gens() > 0 ? TRAIL3.length : TRAIL2.length);
    }
    els.forEach(el => {
      const t = el.querySelector('.hs-title');
      if(t && t.textContent !== title) t.textContent = title;
      const s = el.querySelector('.hs-sub');
      if(s && s.textContent !== sub) s.textContent = sub;
      const n = el.querySelector('.hs-idx');
      if(n && n.textContent !== idx) n.textContent = idx;
    });
  }
  /* 2026-11-18 制作人批复：沈碑横幅读现有记忆，只读不写、零新字段 */
  function renderSteleBanner(){
    const el = document.getElementById('sc-npc-banner-text');
    if(!el) return;
    let text = '';
    try{
      /* 优先用记忆桶里“最后写入”的一条（现有接口 _state 只读，不新增字段）；
         没有桶/为空时回退 mention 的最强记忆。 */
      if(window.NpcMemory){
        const stt = (typeof NpcMemory._state === 'function') ? NpcMemory._state() : null;
        const bucket = stt && stt.mem && stt.mem['shen_bei'];
        if(Array.isArray(bucket) && bucket.length){
          const latest = bucket[bucket.length - 1];
          if(latest && typeof latest.text === 'string' && latest.text) text = latest.text;
        }
        if(!text && typeof NpcMemory.mention === 'function'){
          const m = NpcMemory.mention('shen_bei');
          if(m && m.knowsPlayer && m.top) text = String(m.top);
        }
      }
    }catch(e){}
    if(!text){
      const st = S.npcs && S.npcs.stele;
      text = (st && st.met) ? '他还在观前守着那块碑。你上回说的话，他记着。' : '山外有山。你登过的塔、走过的路，我都记在碑后。';
    }
    const line = '碑文 · ' + text;
    if(el.textContent !== line) el.textContent = line;
  }
  /* 2026-11-18 制作人批复：头像整格可点。只加 UI 监听；优先走原 #sc-break 突破，不可破时进人物页 */
  function bindTopbarTap(){
    const tb = document.querySelector('.topbar .tb-char');
    if(!tb || tb.dataset.tbTap) return;
    tb.dataset.tbTap = '1';
    tb.style.cursor = 'pointer';
    tb.addEventListener('click', ev => {
      if(ev.target && ev.target.closest && ev.target.closest('#sc-break')) return;
      const brk = document.getElementById('sc-break');
      if(brk && !brk.disabled){ brk.click(); return; }
      const role = document.querySelector('.scene-tab[data-tab="role"]');
      if(role) role.click();
    });
  }
  /* 线上终验（2026-11-18）：手札/更多清单是跨页常驻的 details，切页面不关就会盖住丹房圆钮、
     沈碑横幅与打坐按钮。任何导航类点击（场景/面板/返回/底部签）先把手札收起。 */
  function bindNavClose(){
    if(document.documentElement.dataset.navClose) return;
    document.documentElement.dataset.navClose = '1';
    document.addEventListener('click', ev => {
      const t = ev.target;
      if(!t || !t.closest) return;
      if(!t.closest('[data-bld],.scene-tab,.scene-tab *,[data-scene],.hub-cell,.panel-back')) return;
      const hb = document.getElementById('sc-handbook');
      if(hb && hb.open) hb.open = false;
      const tm = document.querySelector('.tb-more');
      if(tm && tm.open) tm.open = false;
    }, true);
  }
  function render(){
    /* 动态路由下只有当前 view 在 DOM，各子函数自带判空会跳过不在场的元素 */
    syncBagDot();
    renderSteleBanner();
    const need = needOf(S.rank);
    /* A57：探索秘境按钮实时标价，与 treasure() 实际扣费同源（境界涨了价跟着涨） */
    setTxt('xx-treasure', '🗺️ 探索秘境 · 灵石 ' + fmt(treasureCost()));
    renderAvatar();
    renderScene();
    renderPageRes();   /* batch6：子页常驻六项资源行 */
    setTxt('xx-rank', RANK_NAMES[S.rank]);
    const rb = document.getElementById('xx-root');
    if(rb){ rb.textContent = rootOf().name; rb.dataset.tone = rootOf().name; }
    setTxt('xx-stone', fmt(S.stone));
    setTxt('xx-rate', fmt1(passiveRate()) + '/秒');
    setTxt('xx-id-pow', fmt(combatPower()));
    const idPath = document.getElementById('xx-id-path');
    if(idPath){
      const pn = (typeof S.path === 'string' && S.path && typeof pathName === 'function') ? pathName(S.path) : '未定';
      const pb = (typeof S.path === 'string' && S.path && typeof pathBonusPct === 'function') ? pathBonusPct(S.path) : '';
      idPath.textContent = '道途 · ' + pn + (pb && pb !== '基准' ? '（' + pb + '）' : '') + ' ｜ 灵根 · ' + rootOf().name;
    }
    /* 第 72 节：离线提示跟着实际封顶走（境界 ×1.12 + 洞天加时），不再写死 8 小时 */
    const offTip = document.getElementById('xx-offline-tip');
    if(offTip){
      const hrs = Math.round(offlineCapSec() / 360) / 10;
      const t = '开着页面修为就一直涨 · 关掉也算离线收益（最多 ' + dtNum(hrs) + ' 小时）';
      if(offTip.textContent !== t) offTip.textContent = t;
    }
    setTxt('xx-rank-bonus', S.rank >= TOP
      ? '境界加成 修炼 ×' + rankMult().toFixed(2)
      : '境界加成 修炼 ×' + rankMult().toFixed(2) + ' · 突破后 ×' + (rankMult() * BAL.rankH).toFixed(2));
    setTxt('xx-dao', S.dao);
    /* 2026-11-19 第 9 条（呆呆已确认口径）：修为溢出只改显示，不动数值。
       exp ≥ need 时进度条锁 100%，文字改「可突破 · 溢出 N」，不再出现 1249/40。 */
    const expFull = S.exp >= need;
    /* A2：闭关锁定期内，溢出/可突破文案一律让位于「闭关中」 */
    if(secludeLeftMs() > 0){
      setTxt('xx-exptxt', '闭关中 · 余 ' + fmtCd(secludeLeftMs()));
      setTxt('xx-expgap', gateLockNote() + '。可做：' + gateGoals().join('、') + '。');
    }else{
      const expPct = need > 0 ? Math.round(S.exp / need * 100) : 0;
      const overflow = fmt(Math.max(0, expInt(S.exp) - expInt(need)));
      setTxt('xx-exptxt', expFull
        ? expPct + '% · 溢出 ' + overflow
        : fmt(expInt(S.exp)) + ' / ' + fmt(expInt(need)));
      setTxt('xx-expgap', expFull
        ? '修为已满（真实进度 ' + expPct + '%）· 溢出 ' + overflow
        : '距下一境还差 ' + fmt(expGapInt(S.exp, need)) + '（本行是当前存量，不是今日所得）');
    }
    const bar = document.getElementById('xx-expbar');
    if(bar) bar.style.width = expFull ? '100%' : Math.max(0, Math.min(100, S.exp / need * 100)).toFixed(1) + '%';

    const b = document.getElementById('xx-break');
    /* 辅助道具勾选框：可用性/数量同步（无道具置灰，避免误勾） */
    const arrBox = document.getElementById('xx-use-array');
    const tjBox = document.getElementById('xx-use-tianji');
    const arrN = document.getElementById('xx-arr-n');
    const tjN = document.getElementById('xx-tj-n');
    if(arrN) arrN.textContent = '×' + (S.guardArray | 0);
    if(tjN) tjN.textContent = '×' + (S.tianji | 0);
    if(arrBox){
      arrBox.disabled = (S.guardArray | 0) <= 0;
      if(arrBox.disabled) arrBox.checked = false;
    }
    if(tjBox){
      tjBox.disabled = (S.tianji | 0) <= 0;
      if(tjBox.disabled) tjBox.checked = false;
    }
    const useArray = !!(arrBox && arrBox.checked);
    /* A47/B49：勾选天机令或顿悟圆满时 attemptBreakthrough 走 guarantee（必成），按钮不该再报成功率 */
    const useTianji = !!(tjBox && tjBox.checked) && (S.tianji | 0) > 0;
    const epiphanyFull = (S.insight || 0) >= WISDOM.full;
    const gateLeft = gateCdMs(S.rank) > 0 ? secludeLeftMs() : 0;
    if(b){
      if(S.rank >= TOP){
        b.disabled = false;
        b.textContent = '♻️ 转世重修（道韵 ' + S.dao + '）';
        b.onclick = reincarnate;
      }else if(gateLeft > 0){
        b.disabled = true;
        b.textContent = '⏳ 闭关中 · 余 ' + fmtCd(gateLeft) + ' · 解禁 ' + fmtWhen(Date.now() + gateLeft);
        b.title = gateLockNote() + ' · 可做：' + gateGoals().join('、');
        b.onclick = null;
      }else if(S.exp >= need){
        const sb = sectBonus();
        const pb = pillBonus();
        const arrBonus = useArray ? SHOP_CFG.guardArrayBonus : 0;
        b.disabled = false;
        b.textContent = '⚡ 突破 ' + RANK_NAMES[S.rank + 1] +
          (useTianji || epiphanyFull
            ? '（必定成功 100%）'
            : '（成功率 ' + pct1(breakChanceFinal(null, useArray)) + '%' +
              (sb > 0 ? ' · 护法 +' + Math.round(sb * 100) + '%' : '') +
              (pb > 0 ? ' · 丹药 +' + Math.round(pb * 100) + '%' : '') +
              (arrBonus > 0 ? ' · 阵法 +' + Math.round(arrBonus * 100) + '%' : '') + '）');
        b.onclick = doBreak;
      }else{
        b.disabled = true;
        b.textContent = '修为不足，还差 ' + fmt(expGapInt(S.exp, need));
        b.onclick = null;
      }
    }
    /* 突破进度提示：段表基础概率 / 需求丹药 / 顿悟进度 / 悟道值 / 持有道具 */
    const tip = document.getElementById('xx-break-tip');
    if(tip && gateLeft > 0){
      /* A2：锁定期不再讲段位概率，先讲清锁对象 + 当下可做的三件事 */
      tip.textContent = gateLockNote() + '。可做：' + gateGoals().join('、') + '。';
    }else if(tip && S.rank < TOP){
      const t2 = breakTierOf(S.rank);
      const fb = Math.min(WISDOM.failCap, S.failBonus || 0);
      const ins = S.insight || 0;
      let s = t2.name + '段 · 基础成功率 ' + Math.round(t2.base * 100) + '% · 可服【' + breakPillMeta(t2.pill).name + '】提成功率，不带也能破';
      if(ins >= WISDOM.full) s = '✨ 顿悟进度已圆满，下次突破必定成功（100%）';
      else if(ins > 0 || fb > 0) s += ' · 顿悟进度 ' + ins + '/' + WISDOM.full + (fb > 0 ? '（下次 +' + Math.round(fb * 100) + '%）' : '');
      s += ' · 悟道值 ' + fmt(S.wisdom || 0);
      if(S.guardArray > 0) s += ' · 🌀 护道阵法 ×' + S.guardArray;
      if(S.guardMirror > 0) s += ' · 🛡️ 护心镜 ×' + S.guardMirror;
      if(S.tianji > 0) s += ' · 🧿 天机令 ×' + S.tianji;
      const ph = pillHintText();
      if(ph) s += ' · ' + ph;
      else {
        const pu = pillUseText();
        if(pu) s += ' · ' + pu;
        else {
          const wh = weaponHintText();
          if(wh) s += ' · ' + wh;
        }
      }
      tip.textContent = s;
    }
    /* batch6：修为满溢的人话提示（只加提示，不改溢出百分比显示）。
       注意：实测满溢后修为收益并不折半（折半的是「今日主动预算」），提示按事实写，
       不用示例里的「收益折半」；最终文案待呆呆审。 */
    if(tip && S.rank < TOP && S.exp >= needOf(S.rank) && tip.textContent.indexOf('灵气已满溢') < 0){
      tip.textContent = '灵气已满溢，宜速突破。破境只扣本境所需修为，溢出部分仍在。' + tip.textContent;
    }
    renderActs();
    renderUps();
    renderGongs();
    renderArray();
    renderField();
    renderMine();
    renderResources();
    renderCaveHub();
    renderTownHub();
    renderAlchemy();
    renderForge();
    renderBlueprintBox();
    renderCodex();
    renderBestiary();
    renderEnhance();
    renderHunt();
    renderQuest();
    renderBag();
    renderRole();
    renderPets();
    renderTower();
    renderRank();
    renderMarket();
    renderShop();
    renderSecret();
    renderArena();
    renderEvent();
    renderToday();       /* 今日清单（P0）：不在场自动跳过；顶栏/主界面小钮红点同步 */
    unlockTick();        /* batch5：功能解锁插屏（一次一条，已弹过不重复） */
    renderEncounter();   /* 奇遇气泡：在场就显隐（弹窗不受影响，避免被全量重绘打掉） */
    renderGate();        /* 山门名册（不在宗门面板时自动跳过） */
    renderCouncil();     /* 山门议事（第 103 轮，不在场自动跳过） */
    renderDongtian();    /* 洞天开辟（不在洞府面板时自动跳过） */
    renderLife();        /* 寿元页（第 96 轮，不在场自动跳过；顶栏 chip 由 renderScene 画） */
    renderTrail();       /* 入门八事 / 道途纸签（第 105/106 轮，两轨都了/教程在台上自动收起） */
    renderHubScroll();   /* hub 卷尾题跋：同一句话，填住格子少的面板下半截 */
    renderDots();        /* 入口红点：内部 1s 节流 */
  }
  function renderActs(){
    const box = document.getElementById('xx-actions');
    if(!box || box.children.length) return;
    [['sit', '🧘', '打坐', '修为按当前境界结算'],
     ['herb', '🌿', '采药', '灵草 +3'],
     ['train', '⚔️', '历练', '有风险'],
     ['enlight', '✨', '顿悟', '大额修为'],
     /* 参悟是唯一"花灵石"的动作：单独占一整行，视觉上就和四个免费日课分开 */
     ['ponder', '🪙', '参悟', '灵石 → 修为']].forEach(([k, ico, name, sub]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'act' + (k === 'ponder' ? ' wide' : '');
      btn.dataset.k = k;
      btn.innerHTML = '<span class="ico">' + ico + '</span>' + name + '<small data-base="' + sub + '">' + sub + '</small>';
      btn.addEventListener('click', () => act(k));
      box.appendChild(btn);
    });
  }
  /* 外部评审 2026-11-23 第 7 项：列表卡统一视觉锚点。
     locked：未解锁/不可点 —— 置灰 + 左侧小锁（原因小字仍由各行 sub 自带）；
     ready ：可升级/可领取 —— 淡金内框 + 右上朱砂红点。
     只切 class，不动各行既有文案与动作。 */
  function anchorState(el, state){
    if(!el) return;
    el.classList.toggle('anchor-locked', state === 'locked');
    el.classList.toggle('anchor-ready', state === 'ready');
    const old = el.querySelector(':scope > .anchor-lock');
    if(state === 'locked'){
      if(!old){
        const i = document.createElement('i');
        i.className = 'anchor-lock';
        i.setAttribute('aria-hidden', 'true');
        el.appendChild(i);
      }
    }else if(old) old.remove();
  }
  function renderUps(){
    const box = document.getElementById('xx-ups');
    if(!box) return;
    /* 动态行：三种功法（逐步进阶）+ 洞府 + 炼丹房 + 炼器坊 */
    const rows = [];
    GONGS.forEach(g => {
      const unlocked = gongUnlocked(g);
      const lv = gongLvOf(g), full = lv >= g.max;
      const cur = Math.pow(g.rate, lv);
      const next = Math.pow(g.rate, Math.min(g.max, lv + 1));
      rows.push({
        k: g.id, unlocked, mirror: true, target: ['xiu', 'xx-gong-sec'],
        name: '功法 · ' + g.name,
        sub: unlocked
          ? '修炼速度 ×' + cur.toFixed(2) + (full
              ? ' · 已圆满'
              : ' → ×' + next.toFixed(2) + '（+' + Math.round((g.rate - 1) * 100) + '%/级）')
          : '境界【' + RANK_NAMES[g.unlock] + '】解锁',
        cost: unlocked ? gongCost(g) : 0, max: g.max, lv: S[g.id]
      });
      if(g.id === 'gong2' && unlocked && (S.gong2 | 0) < 5 && S.rank >= 9 &&
         (S.questsDone || []).indexOf('m6') < 0){
        rows[rows.length - 1].sub += '（凝神这一课要修到五级）';
      }
    });
    const caveCur = Math.pow(BAL.caveR, caveLv());
    const caveNext = Math.pow(BAL.caveR, Math.min(BAL.caveMax, caveLv() + 1));
    rows.push({ k: 'cave', unlocked: true, mirror: true, target: ['dong', 'xx-array-sec'], name: '洞府 · 聚灵阵',
      sub: '灵石产出 ×' + caveCur.toFixed(2) + (S.cave >= BAL.caveMax
        ? ' · 已圆满'
        : ' → ×' + caveNext.toFixed(2) + '（+' + Math.round((BAL.caveR - 1) * 100) + '%/级）'),
      cost: caveCost(), max: BAL.caveMax, lv: S.cave });
    /* 炼丹房 / 炼器坊：灵石 + 基础材料升级，等级解锁配方并加成炼制成功率；sub 附匠道阶位 */
    [['dan', 'alchemy'], ['forge', 'forge']].forEach(([k, bld]) => {
      const m = BUILDINGS[bld], cost = bldUpgradeCost(bld);
      const lv = bldLevel(bld), full = lv >= m.maxLevel;
      const nlv = Math.min(m.maxLevel, lv + 1);
      const pct = v => Math.round(v * 100);
      let sub = '炼制 +' + pct(lv * CRAFT.ratePerLv) + '%' +
        (full ? '' : ' → +' + pct(nlv * CRAFT.ratePerLv) + '%');
      if(bld === 'alchemy'){
        sub += ' · 突破 +' + (danLv() * BAL.danR).toFixed(0) + '%' +
          (full ? '' : ' → +' + (Math.min(m.maxLevel, danLv() + 1) * BAL.danR).toFixed(0) + '%');
      }
      sub += ' · ' + masteryName(bld) + ' ' + masteryOf(bld) + ' 阶' + (full ? ' · 已圆满' : '');
      rows.push({
        k, unlocked: true, bld, mirror: true, target: ['dong', bld === 'alchemy' ? 'xx-alchemy-sec' : 'xx-forge-sec'],
        name: m.name + (bld === 'alchemy' ? ' · 玄阳炉' : ' · 乾火炉'),
        sub: sub,
        cost: cost.stone, mats: cost.mats, max: m.maxLevel, lv: bldLevel(bld)
      });
    });

    if(!upsBuilt || !box.children.length){
      box.innerHTML = '';
      /* 外部评审 2026-11-23 第 8 项：设施汇总改纯数据面板——不再生成按钮，整行不可点。 */
      rows.forEach(() => {
        const row = document.createElement('div');
        row.className = 'upg upg-mirror';
        row.innerHTML = '<div class="t"></div><span class="upg-state"></span>';
        box.appendChild(row);
      });
      upsBuilt = true;
    }
    rows.forEach((r, i) => {
      const row = box.children[i];
      if(!row) return;
      const t = row.querySelector('.t');
      if(t) t.innerHTML = '<b>' + r.name + '</b><small>' + r.sub + '</small>';
      const st = row.querySelector('.upg-state');
      /* 汇总页只报等级：不生成红点、锁标或「可升级」胶囊。 */
      let txt;
      if(!r.unlocked) txt = '未解锁';
      else if(r.lv >= r.max) txt = '已圆满';
      else if(String(r.k).indexOf('gong') === 0) txt = '第 ' + (r.lv | 0) + ' / ' + r.max + ' 层';
      else txt = 'Lv.' + (r.lv | 0) + ' / ' + r.max;
      if(st) st.textContent = txt;
      row.classList.remove('anchor-ready', 'anchor-locked');
      const lock = row.querySelector(':scope > .anchor-lock');
      if(lock) lock.remove();
    });
  }
  /* ===== 第三批 B5：功法 / 聚灵阵升级动作搬回各自页 ===== */
  function gongSay(msg, tone){
    const el = document.getElementById('xx-gong-msg');
    if(!el) return;
    el.textContent = msg || '';
    el.className = 'farm-msg' + (tone ? ' ' + tone : '');
  }
  function gongUp(k, btn){
    const g = GONGS.find(x => x.id === k);
    if(!g) return;
    const r = buy(k, btn);
    if(r && r.ok){ gongSay('【' + g.name + '】已参到第 ' + r.lv + ' 层 · 灵石 -' + fmt(r.cost), 'good'); return; }
    if(r && r.reason === 'stone'){ gongSay('灵石不足：参悟【' + g.name + '】还差 ' + fmt(r.need - S.stone) + ' 灵石', 'bad'); return; }
    if(r && r.reason === 'locked'){ gongSay('境界不足：【' + g.name + '】要' + RANK_NAMES[g.unlock] + '才参得动', 'bad'); return; }
    if(r && r.reason === 'full'){ gongSay('【' + g.name + '】已修至圆满', 'bad'); return; }
  }
  function renderGongs(){
    const box = document.getElementById('xx-gong-list');
    if(!box) return;
    if(box.children.length !== GONGS.length){
      box.innerHTML = '';
      GONGS.forEach(() => {
        const row = document.createElement('div');
        row.className = 'upg';
        row.innerHTML = '<div class="t"></div><button type="button"></button>';
        box.appendChild(row);
      });
    }
    GONGS.forEach((g, i) => {
      const row = box.children[i];
      if(!row) return;
      const unlocked = gongUnlocked(g);
      const lv = S[g.id] | 0, full = lv >= g.max, cost = gongCost(g);
      const cur = Math.pow(g.rate, lv);
      const next = Math.pow(g.rate, Math.min(g.max, lv + 1));
      const t = row.querySelector('.t');
      if(t){
        let sub;
        if(!unlocked) sub = '境界【' + RANK_NAMES[g.unlock] + '】解锁 · 还差 ' + Math.max(0, g.unlock - S.rank) + ' 境';
        else{
          sub = '第 ' + lv + ' 层 · 修炼 ×' + cur.toFixed(2) + (full
            ? ' · 已圆满'
            : ' → ×' + next.toFixed(2) + '（+' + Math.round((g.rate - 1) * 100) + '%/级）');
          if(!full && S.stone < cost) sub += ' · 灵石差 ' + fmt(cost - S.stone);
        }
        const costTxt = full ? '已圆满' : ('灵石 ' + fmt(cost));
        const detail = '<div class="gong-detail">' +
          '<span>当前效果：修炼 ×' + cur.toFixed(2) + '</span>' +
          '<span>功法倍率同时计入战力</span>' +
          '<span>下一级：' + (full ? '—' : '×' + next.toFixed(2) + '（+' + Math.round((g.rate - 1) * 100) + '%）') + '</span>' +
          '<span>领悟条件：境界【' + RANK_NAMES[g.unlock] + '】' + (full ? '' : ' · ' + costTxt) + '</span>' +
          '<span>类型：被动功法 · 无需主动施放 · 不直接造成伤害</span>' +
          '<span>学习顺序：' + (i === 0 ? '无（入门）' : '按境界逐门解锁，不要求先学其他功法') + '</span>' +
          '<span>获取方式：境界达标后，在藏经阁参悟</span>' +
          '</div>';
        t.innerHTML = '<b><img class="upg-ico" src="' + g.img + '" alt=""> ' + g.name + '</b><small>' + sub + '</small>' + detail;
      }
      const btn = row.querySelector('button');
      if(!btn) return;
      if(!unlocked){ btn.textContent = '未解锁'; btn.disabled = true; btn.onclick = null; }
      else if(full){ btn.textContent = '已圆满'; btn.disabled = true; btn.onclick = null; }
      else{
        btn.textContent = '参悟 · 灵石 ' + fmt(cost);
        btn.disabled = S.stone < cost;
        btn.onclick = () => gongUp(g.id, btn);
      }
      /* 外部评审 2026-11-23 第 7 项：未解锁置灰加锁；灵石够且未满级 → 淡金边 + 红点 */
      anchorState(row, !unlocked ? 'locked' : (full ? '' : (S.stone >= cost ? 'ready' : '')));
    });
  }
  /* 聚灵阵：升级动作落在洞府 · 聚灵阵页，设施页只留镜像 */
  function arrayUp(btn){
    const r = buy('cave', btn);
    const msg = document.getElementById('xx-array-msg');
    if(!msg) return;
    if(r && r.ok){ msg.className = 'farm-msg good'; msg.textContent = '聚灵阵已升到 Lv.' + r.lv + ' · 灵石 -' + fmt(r.cost); return; }
    if(r && r.reason === 'stone'){ msg.className = 'farm-msg bad'; msg.textContent = '灵石不足：升级还差 ' + fmt(r.need - S.stone); return; }
    if(r && r.reason === 'full'){ msg.className = 'farm-msg bad'; msg.textContent = '聚灵阵已到 ' + BAL.caveMax + ' 级，登峰造极'; }
  }
  function renderArray(){
    const btn = document.getElementById('xx-array-upbtn');
    if(!btn) return;
    const lv = caveLv(), full = S.cave >= BAL.caveMax, cost = caveCost();
    const set = (id, t) => { const e = document.getElementById(id); if(e) e.textContent = t; };
    set('xx-array-lv', 'Lv.' + lv);
    set('xx-array-cur', '×' + Math.pow(BAL.caveR, lv).toFixed(2));
    set('xx-array-next', full ? '已满级' : '×' + Math.pow(BAL.caveR, Math.min(BAL.caveMax, lv + 1)).toFixed(2));
    if(full){
      set('xx-array-cost', '已到 ' + BAL.caveMax + ' 级');
      btn.textContent = '已满级'; btn.disabled = true; btn.onclick = null;
      return;
    }
    set('xx-array-cost', '升级 · 灵石 ' + fmt(cost) + (S.stone < cost ? '（差 ' + fmt(cost - S.stone) + '）' : ''));
    btn.textContent = '升级';
    btn.disabled = S.stone < cost;
    btn.onclick = () => arrayUp(btn);
  }
  /* 收获飘字（挂在田块容器外的覆盖层上，不被 500ms 重绘清掉） */
  function farmFxPop(i, txt){
    const wrap = document.getElementById('xx-plot-wrap');
    if(!wrap) return;
    const tile = wrap.querySelector('[data-i="' + i + '"]');
    if(!tile) return;
    const sp = document.createElement('span');
    sp.className = 'farm-pop';
    sp.textContent = txt;
    sp.style.left = (tile.offsetLeft + tile.offsetWidth / 2) + 'px';
    sp.style.top = (tile.offsetTop + 10) + 'px';
    wrap.appendChild(sp);
    setTimeout(() => sp.remove(), 950);
  }
  const cropGrowTxt = c => c.grow >= 3600 ? (c.grow / 3600) + ' 小时' : Math.round(c.grow / 60) + ' 分钟';
  /* hub 格的朱砂印：一格一行现状，进页前就知道哪头有活要干 */
  function renderCaveHub(){
    const seal = (id, txt) => { const e = document.getElementById(id); if(e) e.textContent = txt; };
    if(!document.getElementById('xx-hub-field')) return;
    seal('xx-hub-field', 'Lv.' + S.field);
    seal('xx-hub-mine', 'Lv.' + S.mine);
    seal('xx-hub-alchemy', 'Lv.' + bldLevel('alchemy'));
    seal('xx-hub-forge', 'Lv.' + bldLevel('forge'));
    seal('xx-hub-enhance', S.weapon > 0 ? '+' + S.weaponLv : '无');
    seal('xx-hub-dongtian', DONGTIAN.filter(c => dtLv(c.id) > 0).length + '/' + DONGTIAN.length);
    seal('xx-hub-array', 'Lv.' + S.cave);
    seal('xx-hub-ups', '汇总');
  }
  /* 城镇 hub 的朱砂印（第 88 轮 B）：坊市 / 论剑台 / 限时活动拆页后，一格一句现状，
     进哪一页之前就知道手头有什么、今天还剩几次。判空同 renderCaveHub：不在场的印不管。 */
  function renderTownHub(){
    const seal = (id, txt) => { const e = document.getElementById(id); if(e) e.textContent = txt; };
    if(document.getElementById('xx-hub-mk-rate')){
      const m = S.market;
      seal('xx-hub-mk-rate', '×' + (m.buyRate || 1).toFixed(2));
      seal('xx-hub-mk-sell', S.bag.reduce((a, it) => a + (sellPrice(it.t) > 0 ? bagQtyOf(it) : 0), 0) + ' 件');
      seal('xx-hub-mk-goods', (m.goods || []).filter(g => !g.bought).length + ' 件');
      seal('xx-hub-tj', fmt(S.wisdom || 0) + ' 悟');
    }
    if(document.getElementById('xx-hub-ar-me')){
      const t = ARENA_TIERS[tierOf()];
      seal('xx-hub-ar-me', t ? t.name : '—');
      seal('xx-hub-ar-board', S.arena.left + ' 次');
      seal('xx-hub-ar-shop', fmt(S.arena.rep) + ' 望');
    }
    if(document.getElementById('xx-hub-ev-daily')){
      const tasks = (typeof Daily !== 'undefined') ? Daily.list() : [];
      seal('xx-hub-ev-daily', tasks.filter(t => t.done && !t.claimed).length + ' 可领');
      seal('xx-hub-ev-sign', '第' + signDayLabel() + '天');
      seal('xx-hub-ev-union', (S.union.merit | 0) + ' 功');
      seal('xx-hub-ev-rew', (S.union.claimed || []).length + '/' + UNION_REWARD.length);
    }
    if(document.getElementById('xx-hub-xiu-id')){
      const need = needOf(S.rank);
      seal('xx-hub-xiu-id', RANK_NAMES[S.rank]);
      seal('xx-hub-gong', 'Lv.' + Math.max(S.gong1 | 0, S.gong2 | 0, S.gong3 | 0));
      seal('xx-hub-xiu-cult', secludeLeftMs() > 0 ? '闭关中' : (S.exp >= need ? '可破境' : Math.floor(S.exp / need * 100) + '%'));
      seal('xx-hub-xiu-quest', questList().filter(x => questDone(x.q)).length + ' 可领');
      seal('xx-hub-xiu-log', S.log.length + ' 条');
    }
    if(document.getElementById('xx-hub-role-equip')){
      seal('xx-hub-role-equip', EQUIP_SLOTS.filter(k => equippedId(k)).length + '/' + EQUIP_SLOTS.length);
      seal('xx-hub-role-miles', milesDone() + '/' + MILE_TOTAL + ' 碑');
      seal('xx-hub-role-wu', fmt(moneyInt(S.wisdom || 0)) + ' 悟');
      seal('xx-hub-role-story', (typeof Story !== 'undefined' ? Story._done() : 0) + ' 段');
      /* 识人 · 沈碑（切片 2b）：印章 = 已听话题数 n / 可听话题数（原写死 /6） */
      seal('xx-hub-role-npc', ((S.npcs && S.npcs.stele && S.npcs.stele.heard) || []).length + '/' + npcHeardTotal());
    }
    if(document.getElementById('xx-hub-zong-gate')){
      const gl = gateLv();
      seal('xx-hub-zong-gate', (gl ? GATE_LV_NAME[gl - 1] : '未立') + ' · ' + gateList().length + '/' + gateCap());
      seal('xx-hub-zong-council', gl <= 0 ? '未立' : councilDone() ? '已议' : '待议');
    }
  }
  function renderField(){
    /* 主场景田地小景：成熟数徽标 + 发光（面板不在场也照常更新） */
    const vista = document.getElementById('sc-field');
    if(vista){
      const rN = ripeCount();
      const badge = document.getElementById('sc-field-badge');
      if(badge) badge.textContent = rN > 0 ? '成熟 ×' + rN : (growingCount() > 0 ? '生长中' : '');
      vista.classList.toggle('ready', rN > 0);
    }
    const lv = document.getElementById('xx-field-lv');
    if(!lv) return;
    lv.textContent = S.field;
    const rate = document.getElementById('xx-field-rate');
    if(rate) rate.textContent = (S.field * BAL.fieldPer) + ' 灵石/分';
    const plotsTxt = document.getElementById('xx-field-plots');
    if(plotsTxt) plotsTxt.textContent = plotCount() + '/' + BAL.plotCap;
    const btn = document.getElementById('xx-field-buy');
    if(btn){
      if(S.field >= BAL.fieldMax){ btn.disabled = true; btn.textContent = '灵田已满级'; }
      else{ btn.disabled = S.stone < fieldCost(); btn.textContent = '开垦 · 灵石 ' + fmt(fieldCost()); }
    }
    const state = document.getElementById('xx-field-state');
    if(state){
      const r = ripeCount(), g = growingCount();
      state.textContent = S.field <= 0 ? '尚未开垦'
        : '成熟 ' + r + ' · 生长中 ' + g + ' · 空田 ' + Math.max(0, plotCount() - r - g);
    }
    /* P0.5：生长期不空等——倒计时与可做的事同屏 */
    const waitEl = document.getElementById('xx-field-wait');
    if(waitEl){
      const grow = (S.plots || []).filter(p => p && !plotRipe(p)).sort((a, b) =>
        (a.need - (Date.now() - a.t0) / 1000) - (b.need - (Date.now() - b.t0) / 1000))[0];
      waitEl.textContent = grow
        ? '⏳ ' + (CROPS[grow.crop] || { name: '灵草' }).name + '约 ' + plotLeftTxt(grow) +
          ' 后成熟；等待时可先去做：打坐 / 采药 / 爬塔（不必守在这页）'
        : '';
    }
    /* 作物选择条（事件委托绑一次，重绘只换 innerHTML） */
    const bar = document.getElementById('xx-farm-bar');
    if(bar){
      if(!bar.dataset.bound){
        bar.dataset.bound = '1';
        /* A3：pointerdown 与 click 双绑定（防 500ms 重绘吞点击；测试/键盘走 click 同样可达），
         同一次操作在 600ms 内只执行一次。 */
        function farmBarAct(ev){
          const chip = ev.target.closest('[data-crop]');
          if(chip){
            const c = CROPS[chip.dataset.crop];
            if(!c) return;
            if(S.field < c.reqLv){
              const m = '【' + c.name + '】需灵田 ' + c.reqLv + ' 级解锁（当前 ' + S.field + ' 级）。';
              farmSay(m, true); log(m, 'bad'); return;
            }
            farmSel = chip.dataset.crop;
            renderField();
            return;
          }
          const act = ev.target.closest('[data-fact]');
          if(!act) return;
          const now = Date.now();
          if(now - (bar._lastAct || 0) < 500) return;
          bar._lastAct = now;
          if(act.dataset.fact === 'plant') plantAll(farmSel);
          else harvestAll();
        }
        bar.addEventListener('pointerdown', farmBarAct);
        bar.addEventListener('click', farmBarAct);
      }
      let html = '';
      Object.keys(CROPS).forEach(k => {
        const c = CROPS[k];
        const locked = S.field < c.reqLv;
        html += '<button type="button" class="crop-chip' + (farmSel === k ? ' active' : '') + (locked ? ' locked' : '') + '" data-crop="' + k + '">' +
          c.name + '<small>' + (locked ? inkIco('🔒') + '灵田 ' + c.reqLv + ' 级' : cropGrowTxt(c) + ' · 产 ' + cropYield(c)) + '</small></button>';
      });
      html += '<span class="farm-spacer"></span>' +
        '<button type="button" class="farm-act" data-fact="plant">播种</button>' +
        '<button type="button" class="farm-act" data-fact="harvest"' + (ripeCount() <= 0 ? ' disabled' : '') + '>收获</button>';
      bar.innerHTML = html;
    }
    /* 田块网格 */
    const grid = document.getElementById('xx-plots');
    if(grid){
      if(!grid.dataset.bound){
        grid.dataset.bound = '1';
        function farmTileAct(t){
          const i = Number(t.dataset.i);
          /* A3：连点防重复——同一块田 600ms 内的后续点击只算一次（收获连点 3 次只收 1 次） */
          const now = Date.now();
          if(now - (plotActAt[i] || 0) < 600) return;
          plotActAt[i] = now;
          if(t.classList.contains('ripe')) harvestPlot(i);
          else if(t.classList.contains('empty')) plantPlot(i, farmSel);
          else if(t.classList.contains('grow')){
            const p = S.plots[i];
            if(p){
              const m = '【' + CROPS[p.crop].name + '】还在生长（剩 ' + plotLeftTxt(p) + '）。';
              farmSay(m, false); log(m, '');
            }
          }
        }
        function farmTileEv(ev){
          const t = ev.target.closest('[data-i]');
          if(t) farmTileAct(t);
        }
        grid.addEventListener('pointerdown', farmTileEv);
        grid.addEventListener('click', farmTileEv);
      }
      let html = '';
      for(let i = 0; i < plotCount(); i++){
        const p = S.plots[i];
        if(!p){
          html += '<button type="button" class="plot empty" data-i="' + i + '" title="播种">＋</button>';
        }else{
          const c = CROPS[p.crop];
          if(plotRipe(p)){
            html += '<button type="button" class="plot ripe" data-i="' + i + '"><img class="plot-img" src="' + c.img + '" alt="">' +
              '<b>收获</b><small>×' + cropYield(c) + '</small></button>';
          }else{
            const pct = Math.min(100, (Date.now() - p.t0) / (p.need * 1000) * 100);
            html += '<div class="plot grow" data-i="' + i + '"><img class="plot-img" src="' + c.img + '" alt="">' +
              '<span class="plot-name">' + c.name + '</span>' +
              '<div class="plot-bar"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
              '<small class="plot-timer">剩 ' + plotLeftTxt(p) + '</small></div>';
          }
        }
      }
      grid.innerHTML = html;
    }
  }
  function renderMine(){
    const lv = document.getElementById('xx-mine-lv');
    if(!lv) return;
    lv.textContent = S.mine;
    const rate = document.getElementById('xx-mine-rate');
    if(rate) rate.textContent = Math.min(S.mine, BAL.mineMax) * BAL.minePer;
    /* 2026-11-19 UI 第二批：首屏三格摘要（当前库存/每分钟/满级产量），不动产出公式 */
    const oreEl = document.getElementById('xx-mine-ore');
    if(oreEl) oreEl.textContent = fmt(Math.floor(S.ore));
    const perEl = document.getElementById('xx-mine-per');
    if(perEl) perEl.textContent = Math.min(S.mine, BAL.mineMax) * BAL.minePer;
    const maxEl = document.getElementById('xx-mine-max');
    if(maxEl) maxEl.textContent = BAL.mineMax * BAL.minePer;
    const btn = document.getElementById('xx-mine-buy');
    if(btn){
      if(S.mine >= BAL.mineMax){ btn.disabled = true; btn.textContent = '矿脉已满级'; }
      else{ btn.disabled = S.stone < mineCost(); btn.textContent = '开辟 · 灵石 ' + fmt(mineCost()); }
    }
    /* A54：升级后的产量写在按钮外那行独立说明里，不塞进按钮。
       按钮是 .field 里的定宽 flex 项，把长文案塞进去会把左侧「矿脉 Lv.N / 每分钟产」
       在 393 窄屏挤成一列竖排单字（已用改前基线对照确认），故只改下方 hint（块级、自动折行）。 */
    const hint = document.querySelector('#xx-mine .hint');
    if(hint){
      const nowOut = Math.min(S.mine, BAL.mineMax) * BAL.minePer;
      hint.textContent = S.mine >= BAL.mineMax
        ? '矿脉自动产矿石，炼器材料，关页面也算。已达满级，每分钟产 ' + nowOut + ' 矿石。'
        : '矿脉自动产矿石，炼器材料，关页面也算。开辟后每分钟产 ' +
          (Math.min(S.mine + 1, BAL.mineMax) * BAL.minePer) + ' 矿石（当前 ' + nowOut + '）。';
    }
  }
  function renderResources(){
    const h = document.getElementById('xx-herb');
    if(h) h.textContent = fmt(Math.floor(S.herb));
    const o = document.getElementById('xx-ore');
    if(o) o.textContent = fmt(Math.floor(S.ore));
    const h100 = document.getElementById('xx-herb100');
    if(h100) h100.textContent = fmt(S.herb100 || 0);
    const h10000 = document.getElementById('xx-herb10000');
    if(h10000) h10000.textContent = fmt(S.herb10000 || 0);
    const w = document.getElementById('xx-weapon');
    if(w) w.textContent = S.weapon > 0 ? weaponName(S.weapon) : '无';
  }
  /* 匠道修为进度行（炼丹房 / 炼器坊面板顶部共用） */
  function masteryLineHtml(bld){
    const lv = masteryOf(bld), exp = masteryExp(bld), need = masteryNeed(bld);
    const pct = lv >= MASTERY.max ? 100 : Math.min(100, Math.round(exp / need * 100));
    return '<div class="mastery-line"><b>' + inkIco('🕯️') + masteryName(bld) + ' · ' + lv + ' 阶</b>' +
      (lv >= MASTERY.max ? '<small>已至九阶圆满（炼制成功率 +' + Math.round((MASTERY.max - 1) * MASTERY.perTierRate * 100) + '%）</small>'
        : '<small>炼制成功率 +' + Math.round((lv - 1) * MASTERY.perTierRate * 100) + '% · 经验 ' + fmt(Math.floor(exp)) + ' / ' + fmt(need) + '</small>') +
      '<div class="mastery-track"><i style="width:' + pct + '%"></i></div></div>';
  }
  /* 炼丹房面板：匠道线 + 丹方收集条 + 「阶位签」分阶折叠（2026-11-18）。
     条目按现有九阶分组，默认只展开玩家当前能炼的最高一阶；其余阶收起，
     未解锁阶点开可看条目与用途，行内按钮沿用 craftRow 的禁用与解锁说明。
     只收放呈现：配方数据、成本、成功率、炼制事件与行 id 一律原样。 */
  /* 2026-11-19 第 4 条：炼丹/炼器页内升级入口的「差什么」文案（只读现有成本） */
  function craftUpText(bld){
    const meta = BUILDINGS[bld] || {};
    const lv = bldLevel(bld);
    const c = bldUpgradeCost(bld) || { stone: 0, mats: [] };
    let s = (meta.name || bld) + ' Lv.' + lv + ' / 下一级 灵石 ' + fmt(c.stone || 0);
    if(c.mats && c.mats.length) s += ' · ' + matLedger(c.mats);
    if(S.stone < (c.stone || 0)) s += '（灵石差 ' + fmt((c.stone || 0) - S.stone) + '）';
    return s;
  }
  function renderAlchemy(){
    const box = document.getElementById('xx-alchemy');
    if(!box) return;
    renderRoomUp('alchemy');
    box.innerHTML = masteryLineHtml('alchemy') + recipeCodexHtml();
    /* 族况收进一条可展开摘要：默认不占条目区；在身丹效直接写在摘要行，收起也看得见。
       条目本身按阶折叠，页顶只留一排阶位签。 */
    const famFold = document.createElement('details');
    famFold.className = 'dan-fam-fold';
    famFold.open = !!craftFold.alchemy.famOpen;
    const inBody = DAN_FAMS.map(fam => {
      const t = danBuffLeft(fam);
      return t ? DAN_FAM[fam].name + t.replace(/^ · /, '') : '';
    }).filter(Boolean).join(' · ');
    famFold.innerHTML = '<summary><b>族况</b><small>' + (inBody || '四族可炼 · 持有 · 功效') + '</small></summary>';
    const strip = document.createElement('div');
    strip.className = 'dan-fam-strip';
    DAN_FAMS.forEach(fam => strip.appendChild(danFamHead(fam)));
    famFold.appendChild(strip);
    famFold.addEventListener('toggle', () => { craftFold.alchemy.famOpen = famFold.open; });
    box.appendChild(famFold);
    const nx = variantNext();
    const items = [];
    DAN_FAMS.forEach(fam => {
      danRowsOf(fam).forEach(item => {
        const hint = (nx && nx.base === item.rec.recipeId) ? ' · 旁方 ' + nx.n + '/' + nx.v.need + ' 炉' : '';
        items.push({ rec: item.rec, alt: item.alt, hint: hint });
      });
    });
    renderCraftFold(box, 'alchemy', items, craftSegOf, it => craftRow(it.rec, it.alt, it.hint));
  }
  /* 一族之内：九阶按段升序，正方之后挂它自己的旁方与旧妖丹方（同一枚丹的两条路要挨着看） */
  function danRowsOf(fam){
    const extra = {};
    Object.keys(RECIPES).forEach(k => {
      const rec = RECIPES[k];
      if(rec.bld !== 'alchemy' || rec.fam !== fam || DAN_BY_ID[k] || RV4_DAN_BY_ID[k]) return;
      if(!extra[rec.seg]) extra[rec.seg] = [];
      extra[rec.seg].push(rec);
    });
    const out = [];
    DAN_IDS[fam].forEach((id, i) => {
      const rec = RECIPES[id];
      out.push({ rec, alt: false });
      (extra[i + 1] || []).forEach(x => out.push({ rec: x, alt: false }));
      if(variantUnlocked(id)) out.push({ rec: DAN_VARIANTS[id], alt: true });
    });
    RV4_DAN_LIST.filter(d => d.fam === fam).forEach(d => out.push({ rec:RECIPES[d.id], alt:false }));
    return out;
  }
  /* 丹药 buff 的剩余时间（第 106 轮清旧账）：三族各一槽、各 600 秒，此前只有拆账弹窗里
     两行倍率（丰产连那两行都没有），玩家根本看不见"还剩几分钟"。族头这行是最近的落点。 */
  function danBuffLeft(fam){
    const b = fam === 'jl' ? S.danExp : fam === 'ct' ? S.danPow : fam === 'fc' ? S.danGain : null;
    if(!b || !(b.until > Date.now())) return '';
    const s = Math.max(0, Math.ceil((b.until - Date.now()) / 1000));
    /* 返 HTML：这行是 innerHTML 拼进去的，倒计时单独上朱砂色才看得见 */
    return ' · <em class="dan-buff-l">剩 ' + Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒</em>';
  }
  function danFamHead(fam){
    const f = DAN_FAM[fam];
    const lv = bldLevel('alchemy'), mst = masteryOf('alchemy');
    let open = 0, own = 0;
    DAN_IDS[fam].forEach(id => {
      const r = RECIPES[id];
      if(lv >= r.reqLv && mst >= (r.reqM || 1)) open++;
      own += countItem(id);
    });
    const el = document.createElement('div');
    el.className = 'dan-fam';
    el.innerHTML = '<img src="' + f.img + '" alt=""><b>' + f.name + '族 · 九阶</b>' +
      '<small>' + f.lead + '</small>' +
      '<i class="dan-fam-n">可炼 ' + open + ' / 9 · 持有 ' + own + danBuffLeft(fam) + '</i>';
    return el;
  }
  /* 丹方收集条：只报总数与"下一卷"，炉数进度挂在对应那一行上，不重复 */
  function recipeCodexHtml(){
    const got = variantCount();
    let tip = '五卷皆已参透，丹道旁支尽在掌中。';
    if(got < DAN_VARIANT_COUNT){
      const nx = variantNext();
      tip = '下一卷：' + nx.v.name.replace(/^.*· /, '');
    }
    return '<div class="recipe-codex"><b>' + inkIco('📜') + '丹方 <span>' + got + ' / ' + DAN_VARIANT_COUNT + '</span></b>' +
      '<small>' + tip + '</small></div>';
  }
  /* P0.5：战力差距说人话——只读现有装备/修为状态，不新造阈值 */
  function powerGapAdvice(cp, need){
    cp = Number(cp) || 0; need = Number(need) || 0;
    if(cp >= need) return '';
    const gap = need - cp;
    const pct = need > 0 ? Math.round(gap / need * 100) : 0;
    const empty = EQUIP_SLOTS.filter(k => !equippedId(k)).length;
    let better = false;
    EQUIP_SLOTS.forEach(k => {
      const c = equipCands(k);
      if(!c || !c.top) return;
      const cur = equippedId(k) ? (ITEMS[equippedId(k)] || {}) : null;
      if(!cur || c.top.power > (cur.power || 0)) better = true;
    });
    let act;
    if(empty || better) act = '先补装备' + (empty ? '（还有 ' + empty + ' 个空槽）' : '（背包里有更好的）');
    else if(S.exp >= needOf(S.rank)) act = '修为已满，先破境';
    else act = '先补装备/法宝，或攒满修为破境';
    return '差 ' + fmt(gap) + ' 战力（约 ' + pct + '%）· 建议' + act;
  }
  /* 第三批 P0：缺料「去哪弄」映射（只指路，不新增产出/数值） */
  const MAT_GO = {
    herb: ['dong', 'xx-field'], herb100: ['dong', 'xx-field'], herb10000: ['dong', 'xx-field'],
    ore: ['dong', 'xx-mine'],
    mat_core: ['tower'], mat_bone: ['tower'], mat_feather: ['tower'], mat_eye: ['tower'], mat_marrow: ['tower'],
    boss_core: ['tower'], boss_pearl: ['tower'], boss_feather: ['tower'], boss_heart: ['tower']
  };
  function matGoHtml(t){
    const go = MAT_GO[t];
    if(!go) return '';
    const label = go[0] === 'tower' ? '去镇妖塔' : go[0] === 'dong' ? '去洞府' : '去';
    return ' <button type="button" class="mat-go" data-mat-go="' + go.join(':') + '">' + label + '</button>';
  }
  function craftRow(rec, isAlt, hint){
    const lv = bldLevel(rec.bld);
    const reqM = rec.reqM || 1;
    const locked = lv < rec.reqLv || masteryOf(rec.bld) < reqM;
    const dd = rec.fam ? (DAN_BY_ID[rec.out] || RV4_DAN_BY_ID[rec.out]) : null;   /* 丹药行才有「阶」与功效，法宝行照旧 */
    const row = document.createElement('div');
    row.className = 'craft' + (rec.cls ? ' ' + rec.cls : '') + (isAlt ? ' alt' : '') + (dd ? ' dan t' + dd.tier : '');
    const mats = matLedger(rec.mats);
    const stoneOk = S.stone >= recipeStoneCost(rec);
    const matOk = rec.mats.every(m => matHas(m.t, m.n));
    /* P1：缺料时把差什么、差多少写进行内（不只按钮置灰） */
    const miss = [];
    if(!stoneOk) miss.push('灵石差 ' + fmt(recipeStoneCost(rec) - S.stone));
    rec.mats.forEach(m => { if(m.t !== 'stone' && !matHas(m.t, m.n)) miss.push(matName(m.t) + '差 ' + (m.n - Math.floor(matCount(m.t))) + matGoHtml(m.t)); });
    const missTxt = (!locked && miss.length) ? ' · 缺：' + miss.join('、') : '';
    const bagOk = bagCanAccept(rec.out);
    const canDo = !locked && stoneOk && matOk && bagOk;
    const rate = craftRate(rec);
    /* 面板上的成功率与失败返还都必须把洞天算进去，否则显示的数和实际结算对不上 */
    const dtNote = rec.bld === 'alchemy' && dtCraftPct() > 0 ? '＋洞天 +' + dtNum(dtCraftPct()) + '%' : '';
    const refundPct = rec.bld === 'alchemy'
      ? Math.round(Math.min(1, CRAFT.failRefund + dtRefundPct() / 100) * 100)
      : Math.round(CRAFT.failRefund * 100);
    const lockTxt = lv < rec.reqLv
      ? inkIco('🔒') + '需炼丹房 ' + rec.reqLv + ' 级解锁（当前 ' + lv + ' 级）'
      : inkIco('🔒') + '需丹师 ' + reqM + ' 阶（当前 ' + masteryOf(rec.bld) + ' 阶）：多炼低阶丹涨经验';
    row.innerHTML = '<div class="craft-main"><b>' + (isAlt ? '<i class="vtag">旁方</i>' : rec.rv4 ? '<i class="vtag">专属</i>' : '') +
      (dd ? '<i class="dan-seg">' + dd.seg + ' 阶</i>' : '') +
      '<img src="' + rec.img + '" alt=""> ' + rec.name + '</b>' +
      (dd && !locked ? '<span class="craft-eff">' + danEffectText(dd) + '</span>' : '') +
      '<small>' + (locked
        ? lockTxt
        : mats + ' · 成功率 ' + Math.round(rate * 100) + '%（基础 ' + Math.round(rec.rate * 100) + '%＋炉火×' + Math.round(CRAFT.ratePerLv * 100) + '%＋丹师×' + Math.round(MASTERY.perTierRate * 100) + '%）' + dtNote +
          ' · <span class="alt-hint">失败返还 ' + refundPct + '% 材料（灵石不退）</span>' +
          (bagOk ? '' : ' · 背包已满') +
          (hint ? '<span class="alt-hint">' + hint + '</span>' : '') + missTxt) + '</small></div>' +
      '<button type="button">' + (locked ? '未解锁' : (!stoneOk || !matOk) ? '缺料' : bagOk ? '炼制' : '背包满') + '</button>';
    /* 行内还有「去哪弄」小钮；必须取行尾那颗动作按钮，不能用 querySelector('button') 误取第一颗 */
    const btn = row.querySelector(':scope > button');
    btn.disabled = !canDo;
    if(!locked) btn.addEventListener('click', () => craftItem(rec.bld, rec.recipeId));
    /* 外部评审 2026-11-23 第 7 项：可炼 → 淡金边 + 红点；未解锁/缺料/背包满 → 置灰 + 小锁 */
    anchorState(row, canDo ? 'ready' : 'locked');
    row.dataset.recipe = rec.recipeId;
    return row;
  }
  /* 炼器坊面板：匠道线 + 「阶位签」分阶折叠（2026-11-18）。
     四族同阶并在一签里，默认展开当前能炼的最高一阶；族别仍由行内纹色与图标区分。
     行构造仍走 forgeRow：已装备/未解锁/缺料与点击绑定原样。 */
  /* 万兽谱：只读曾取得 found；五段独立领取，跨世保留、每段仅一次。 */
  function renderBestiary(){
    const box = document.getElementById('xx-bestiary');
    if(!box) return;
    const r = ensureRv4();
    const total = RV4_MATS.filter(m => r.found.indexOf(m.id) >= 0).length;
    const prog = document.getElementById('bestiary-progress');
    if(prog) prog.textContent = total + ' / ' + RV4_MATS.length;
    box.innerHTML = RV4_BESTIARY_TIERS.map((t, i) => {
      const tier = i + 1, mats = RV4_MATS.filter(m => m.tier === tier);
      const got = bestiaryProgress(tier), done = got >= mats.length, claimed = r.claimed.indexOf(t.id) >= 0;
      return '<section class="bestiary-tier' + (done ? ' done' : '') + '">' +
        '<header><b>' + t.name + '</b><small>' + got + ' / ' + mats.length + ' · 集齐奖 ' + fmt(needOf(S.rank) * t.K) + ' 灵石</small>' +
        '<button type="button" data-bestiary-claim="' + t.id + '"' + (!done || claimed ? ' disabled' : '') + '>' +
        (claimed ? '已领取' : done ? '领取' : '未集齐') + '</button></header>' +
        '<div class="bestiary-grid">' + mats.map(m => {
          const found = r.found.indexOf(m.id) >= 0, beast = BEASTS.find(b => b.id === m.beast);
          return '<div class="bestiary-card' + (found ? ' found' : '') + '"><img src="' + m.img + '" alt="">' +
            '<b>' + m.n + '</b><small>' + (found ? '已收录' : '待寻 · ' + (beast ? beast.name : '')) + '</small></div>';
        }).join('') + '</div></section>';
    }).join('');
    if(!box.dataset.bound){
      box.dataset.bound = '1';
      box.addEventListener('click', ev => {
        const b = ev.target.closest ? ev.target.closest('[data-bestiary-claim]') : null;
        if(b && !b.disabled) claimBestiary(b.dataset.bestiaryClaim);
      });
    }
  }
  /* batch5：法宝图鉴（旧四族 36 件）；rv4 同页增兽魂页签，持有来源各自独立。 */
  let codexTab = 'art';
  function renderCodex(){
    const box = document.getElementById('xx-codex');
    if(!box) return;
    const tabs = document.getElementById('codex-tabs');
    if(tabs && !tabs.dataset.bound){
      tabs.dataset.bound = '1';
      tabs.addEventListener('click', ev => {
        const b = ev.target.closest ? ev.target.closest('[data-codex-tab]') : null;
        if(!b || (b.dataset.codexTab !== 'art' && b.dataset.codexTab !== 'soul')) return;
        codexTab = b.dataset.codexTab; renderCodex();
      });
    }
    if(tabs) tabs.querySelectorAll('[data-codex-tab]').forEach(b => {
      const on = b.dataset.codexTab === codexTab;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    const prog = document.getElementById('codex-progress');
    const bar = document.getElementById('codex-bar');
    const fams = document.getElementById('codex-fams');
    if(codexTab === 'soul'){
      const ownedN = RV4_SOUL_ROWS.filter(s => rv4HasSoul(s.id)).length, total = RV4_SOUL_ROWS.length;
      if(prog) prog.textContent = ownedN + ' / ' + total;
      if(bar) bar.style.width = (ownedN / total * 100).toFixed(1) + '%';
      if(fams) fams.textContent = ART_FAMS.map(f => ART_FAM[f].name + '有效 ' + artSeg(f) + ' 阶').join(' · ');
      box.innerHTML = RV4_SOUL_ROWS.map(s => {
        const owned = rv4HasSoul(s.id), rec = RECIPES[s.id];
        return '<div class="codex-card' + (owned ? ' owned' : ' locked') + '" data-fam="' + s.fam + '">' +
          '<div class="cc-img"><img src="' + s.img + '" alt=""></div><b>' + s.name + '</b>' +
          '<small>兽魂 · ' + ART_FAM[s.fam].name + '第 ' + s.seg + ' 阶</small>' +
          (owned ? '<span class="cc-owned">已入魂 · ' + artEffectText(s.fam, s.seg) + '</span>'
            : '<span class="cc-src">出处：炼器坊 Lv.' + rec.reqLv + ' · 器师 ' + rec.reqM + ' 阶 · ' + matLedger(rec.mats) + '</span>') +
          '</div>';
      }).join('');
      return;
    }
    const total = ART_LIST.length;
    const ownedN = ART_LIST.filter(d => oldArtSeg(d.fam) >= d.seg).length;
    if(prog) prog.textContent = ownedN + ' / ' + total;
    if(bar) bar.style.width = (total ? ownedN / total * 100 : 0).toFixed(1) + '%';
    if(fams){
      fams.textContent = ART_FAMS.map(f => {
        const n = ART_LIST.filter(d => d.fam === f && oldArtSeg(f) >= d.seg).length;
        return ART_FAM[f].name + ' ' + n + '/9';
      }).join(' · ');
    }
    box.innerHTML = ART_LIST.map(d => {
      const owned = oldArtSeg(d.fam) >= d.seg;
      const rec = RECIPES[d.id] || null;
      const src = rec
        ? ('炼器坊 Lv.' + rec.reqLv + (rec.reqM && rec.reqM > 1 ? ' · 器师 ' + rec.reqM + ' 阶' : '') +
           ' · ' + matLedger(rec.mats))
        : '炼器坊图谱';
      return '<div class="codex-card' + (owned ? ' owned' : ' locked') + '" data-fam="' + d.fam + '">' +
        '<div class="cc-img"><img src="' + d.img + '" alt=""></div>' +
        '<b>' + d.name + '</b>' +
        '<small>' + ART_FAM[d.fam].name + ' · 第 ' + d.seg + ' 阶</small>' +
        (owned
          ? '<span class="cc-owned">已得 · ' + artEffectText(d.fam, d.seg) + '</span>'
          : '<span class="cc-src">出处：' + src + '</span>') +
        '</div>';
    }).join('');
  }
  /* batch5：图纸定向锻造 */
  function craftByBlueprint(bpId, fromEl){
    const b = BP_BY_ID[bpId];
    if(!b){ log('图纸不存在。', 'bad'); return; }
    if(!bpCount(bpId)){ log('没有【' + b.name + '】了；图纸可从秘境 Boss 或天机阁获得。', 'bad'); return; }
    const rec = RECIPES[b.fam + b.seg];
    if(!rec){ log('图纸对应的图谱缺失。', 'bad'); return; }
    craftItem('forge', rec.recipeId, { blueprint: true, bpId: bpId });
  }
  function renderBlueprintBox(){
    const box = document.getElementById('xx-bp-box');
    if(!box) return;
    if(!Object.keys(S.blueprints || {}).length){
      box.innerHTML = '<p class="bp-empty">暂无图纸。图纸可由秘境 10 层 Boss 掉落，或天机阁每周自选。</p>';
      return;
    }
    box.innerHTML = BLUEPRINTS.filter(b => bpCount(b.id) > 0).map(b => {
      const rec = RECIPES[b.fam + b.seg];
      const owned = oldArtSeg(b.fam) >= b.seg;
      const n = bpCount(b.id);
      const rate = rec ? Math.round(craftRate(rec) * 100) : 0;
      return '<div class="bp-row">' +
        '<div class="bp-main"><b>' + b.name + ' ×' + n + '</b>' +
        '<small>' + ART_FAM[b.fam].name + '第 ' + b.seg + ' 阶 · ' + (rec ? matLedger(rec.mats) : '') +
        ' · 当前成功率 ' + rate + '%</small></div>' +
        '<button type="button" class="bp-btn" data-bp="' + b.id + '"' + (owned ? ' disabled' : '') + '>' +
        (owned ? '已持有' : '图纸锻造') + '</button></div>';
    }).join('');
    if(!box.dataset.bound){
      box.dataset.bound = '1';
      box.addEventListener('click', ev => {
        const b = ev.target && ev.target.closest ? ev.target.closest('[data-bp]') : null;
        if(b && !b.disabled) craftByBlueprint(b.dataset.bp, b);
      });
    }
  }
  function renderForge(){
    const box = document.getElementById('xx-forge');
    if(!box) return;
    renderRoomUp('forge');
    box.innerHTML = masteryLineHtml('forge');
    /* 族况摘要：持有阶直接写在摘要行；展开可看四族可炼数与当前效果 */
    const famFold = document.createElement('details');
    famFold.className = 'dan-fam-fold';
    famFold.open = !!craftFold.forge.famOpen;
    const ownTxt = ART_FAMS.map(fam => {
      const seg = artSeg(fam);
      return ART_FAM[fam].name + ' ' + (seg ? seg + ' 阶' : '无');
    }).join(' · ');
    famFold.innerHTML = '<summary><b>族况</b><small>' + ownTxt + '</small></summary>';
    const strip = document.createElement('div');
    strip.className = 'dan-fam-strip';
    ART_FAMS.forEach(fam => strip.appendChild(artFamHead(fam)));
    famFold.appendChild(strip);
    famFold.addEventListener('toggle', () => { craftFold.forge.famOpen = famFold.open; });
    box.appendChild(famFold);
    const items = [];
    ART_FAMS.forEach(fam => {
      artRowsOf(fam).forEach(rec => items.push({ rec: rec }));
    });
    renderCraftFold(box, 'forge', items, craftSegOf, it => forgeRow(it.rec));
    const soulFold = document.createElement('details');
    soulFold.className = 'rv4-forge-fold';
    soulFold.open = true;
    soulFold.innerHTML = '<summary><b>兽魂 · 十件</b><small>全部被动；与旧法宝同族共同取最高，只生效一个</small></summary>';
    const soulList = document.createElement('div');
    soulList.className = 'craft-list rv4-craft-list';
    RV4_SOUL_ROWS.forEach(s => soulList.appendChild(rv4ForgeRow(RECIPES[s.id])));
    soulFold.appendChild(soulList); box.appendChild(soulFold);
    const equipFold = document.createElement('details');
    equipFold.className = 'rv4-forge-fold';
    equipFold.open = true;
    equipFold.innerHTML = '<summary><b>专属装备 · 六件</b><small>三槽各两件；可重复炼制、穿戴与寄售</small></summary>';
    const equipList = document.createElement('div');
    equipList.className = 'craft-list rv4-craft-list';
    RV4_EQUIP_ROWS.forEach(e => equipList.appendChild(rv4ForgeRow(RECIPES[e.id])));
    equipFold.appendChild(equipList); box.appendChild(equipFold);
  }
  function rv4ForgeRow(rec){
    const soul = RV4_SOUL_BY_ID[rec.out], equip = RV4_EQUIP_BY_ID[rec.out];
    const lv = bldLevel('forge'), reqM = rec.reqM || 1;
    const locked = lv < rec.reqLv || masteryOf('forge') < reqM;
    const owned = !!(soul && rv4HasSoul(soul.id));
    const stoneCost = recipeStoneCost(rec);
    const stoneOk = S.stone >= stoneCost;
    const matOk = rec.mats.every(m => matHas(m.t, m.n));
    const bagOk = !equip || bagCanAccept(equip.id);
    const miss = [];
    if(!stoneOk) miss.push('灵石差 ' + fmt(stoneCost - S.stone));
    rec.mats.forEach(m => { if(m.t !== 'stone' && !matHas(m.t, m.n)) miss.push(matName(m.t) + '差 ' + (m.n - Math.floor(matCount(m.t)))); });
    const missTxt = (!locked && miss.length) ? ' · 缺：' + miss.join('、') : '';
    const rate = craftRate(rec);
    const lockTxt = lv < rec.reqLv
      ? inkIco('🔒') + '需炼器坊 ' + rec.reqLv + ' 级解锁（当前 ' + lv + ' 级）'
      : inkIco('🔒') + '需器师 ' + reqM + ' 阶（当前 ' + masteryOf('forge') + ' 阶）';
    const tag = soul ? '<i class="dan-seg">' + soul.seg + ' 阶兽魂</i>'
      : '<i class="dan-seg">' + SLOT_NAME[equip.slot] + '</i>';
    const effect = soul ? artEffectText(soul.fam, soul.seg) : '装备后战力 +' + fmt(equip.power);
    const row = document.createElement('div');
    row.className = 'craft rv4-craft' + (rec.cls ? ' ' + rec.cls : '');
    row.innerHTML = '<div class="craft-main"><b>' + tag + '<img src="' + rec.img + '" alt=""> ' + rec.name + '</b>' +
      (locked ? '' : '<span class="craft-eff">' + effect + '</span>') +
      '<small>' + (locked ? lockTxt
        : matLedger(rec.mats) + ' · 成功率 ' + Math.round(rate * 100) + '% · <span class="alt-hint">失败返还 ' + Math.round(CRAFT.failRefund * 100) + '% 材料（灵石不退）</span>' + missTxt +
          (equip && !bagOk ? ' · 背包已满' : '')) + '</small></div>' +
      '<button type="button">' + (owned ? '已入魂' : locked ? '未解锁' : (!stoneOk || !matOk) ? '缺料' : bagOk ? '炼制' : '背包满') + '</button>';
    const btn = row.querySelector(':scope > button');
    const canDo = !owned && !locked && stoneOk && matOk && bagOk;
    btn.disabled = !canDo;
    if(canDo) btn.addEventListener('click', () => craftItem('forge', rec.recipeId));
    anchorState(row, canDo ? 'ready' : 'locked');
    row.dataset.recipe = rec.recipeId;
    return row;
  }
  /* ---- 分阶折叠共用件（炼丹 / 炼器）----
     展开状态只存内存：自动态跟着「当前能炼的最高一阶」走，玩家点过签后改为手动态；
     点同一签可收起，允许全收起。不写存档字段、不改配方与事件。 */
  const CRAFT_CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const craftFold = { alchemy: { seg: 0, auto: true, bar: 0, shown: 0 }, forge: { seg: 0, auto: true, bar: 0, shown: 0 } };
  function craftSegOf(rec){
    if(rec.seg) return rec.seg;
    const d = DAN_BY_ID[rec.out];
    return (d && d.seg) || rec.outLv || 1;
  }
  function craftUnlocked(rec){
    return bldLevel(rec.bld) >= rec.reqLv && masteryOf(rec.bld) >= (rec.reqM || 1);
  }
  function renderCraftFold(box, room, items, tierOf, makeRow){
    const bySeg = {};
    items.forEach(it => {
      const seg = Math.max(1, tierOf(it.rec) | 0);
      (bySeg[seg] = bySeg[seg] || []).push(it);
    });
    const segs = Object.keys(bySeg).map(Number).sort((a, b) => a - b);
    if(!segs.length) return;
    const lv = bldLevel(room);
    const st = craftFold[room];
    let cur = 0;
    const meta = segs.map(seg => {
      const rows = bySeg[seg];
      const open = rows.some(it => craftUnlocked(it.rec));
      if(open) cur = seg;                          /* 升序扫：最后一个可炼阶即当前阶 */
      let needLv = 99, needM = 99;
      rows.forEach(it => {
        needLv = Math.min(needLv, it.rec.reqLv || 1);
        needM = Math.min(needM, it.rec.reqM || 1);
      });
      return { seg: seg, rows: rows, open: open, needLv: needLv, needM: needM };
    });
    if(st.auto) st.seg = cur || segs[0];
    else if(st.seg && segs.indexOf(st.seg) < 0) st.seg = cur || segs[0];   /* 0＝全收起，重绘也不替玩家打开 */
    const segChanged = st.shown !== st.seg;
    st.shown = st.seg;
    const bar = document.createElement('div');
    bar.className = 'craft-tiers';
    const secs = document.createElement('div');
    secs.className = 'craft-secs';
    meta.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'craft-tier' + (m.open ? '' : ' locked') + (m.seg === st.seg ? ' on' : '');
      b.dataset.seg = m.seg;
      b.setAttribute('aria-expanded', m.seg === st.seg ? 'true' : 'false');
      const cond = lv < m.needLv
        ? (room === 'alchemy' ? '丹房' : '器坊') + m.needLv + '级'
        : (room === 'alchemy' ? '丹师' : '器师') + m.needM + '阶';
      const on = m.seg === st.seg;
      b.innerHTML = '<b>' + (CRAFT_CN[m.seg - 1] || m.seg) + '阶<i>' + m.rows.length + '</i></b>' +
        '<small>' + (m.open ? (on ? '当前' : '可炼') : cond) + '</small>';
      bar.appendChild(b);
      const sec = document.createElement('div');
      sec.className = 'craft-sec' + (m.seg === st.seg ? ' open' : '');
      sec.dataset.seg = m.seg;
      m.rows.forEach(it => sec.appendChild(makeRow(it)));
      secs.appendChild(sec);
    });
    box.appendChild(bar);
    box.appendChild(secs);
    /* 每次重绘都会重建签条：恢复玩家横滑位置；当前阶变了才把它滚进视野 */
    bar.scrollLeft = st.bar || 0;
    if(segChanged && st.seg){
      const act = bar.querySelector('.craft-tier.on');
      if(act) bar.scrollLeft = Math.max(0, act.offsetLeft - 6);
      st.bar = bar.scrollLeft;
    }
    bar.addEventListener('scroll', () => {
      craftFold[room].bar = bar.scrollLeft;
    }, { passive: true });
    /* 事件只绑一次在静态容器上；重建 innerHTML 不会丢，也不会重复绑 */
    if(!box.dataset.craftFold){
      box.dataset.craftFold = room;
      box.addEventListener('click', ev => {
        const t = ev.target && ev.target.closest ? ev.target.closest('.craft-tier') : null;
        if(!t || !box.contains(t)) return;
        const seg = Number(t.dataset.seg) || 0;
        const s = craftFold[room];
        s.auto = false;
        s.seg = s.seg === seg ? 0 : seg;
        Array.prototype.forEach.call(box.querySelectorAll('.craft-tier'), x => {
          const on = Number(x.dataset.seg) === s.seg;
          x.classList.toggle('on', on);
          x.setAttribute('aria-expanded', on ? 'true' : 'false');
        });
        Array.prototype.forEach.call(box.querySelectorAll('.craft-sec'), x => {
          x.classList.toggle('open', Number(x.dataset.seg) === s.seg);
        });
      });
    }
  }
  function artRowsOf(fam){
    return (ART_IDS[fam] || []).map(id => RECIPES[id]).filter(Boolean);
  }
  function artFamHead(fam){
    const f = ART_FAM[fam];
    const lv = bldLevel('forge'), mst = masteryOf('forge');
    let open = 0;
    artRowsOf(fam).forEach(r => { if(lv >= r.reqLv && mst >= (r.reqM || 1)) open++; });
    const seg = artSeg(fam);
    const el = document.createElement('div');
    el.className = 'dan-fam art-fam';
    const SHARE = { bg: '战力 +1.5%/级', brk: '突破成功率 +0.15pp/级', cai: '灵石 +0.6%/级' };
    el.innerHTML = '<img src="' + f.img + '" alt=""><b>' + f.name + '族 · 九阶</b>' +
      '<small>' + f.lead + '</small>' +
      '<i class="dan-fam-n">可炼 ' + open + ' / 9 · 持有 ' + (seg ? seg + ' 阶' : '无') + ' · ' + artEffectText(fam, seg) + '</i>' +
      (fam === 'lq' ? '' : '<i class="art-fam-noenh">强化随主器共用：' + SHARE[fam] + '（点此看说明）</i>');
    /* A4b：另三族随主器共用强化档（30% 系数），入口点击给同一说明 */
    if(fam !== 'lq'){
      el.classList.add('art-fam-click');
      el.addEventListener('click', function(){
        showTreasure({
          img: f.img,
          name: f.name + '族 · 强化随主器共用',
          desc: '强化档四族共用：灵器全额，' + f.name + '族按 30% 系数受益（' + SHARE[fam] + '）。' +
            '当前主器强化 +' + S.weaponLv + '，本族' + (seg ? '已获得 ' + seg + ' 阶，效果：' + artEffectText(fam, seg) : '尚未获得，先炼一件才吃强化') + '。'
        });
      });
    }
    return el;
  }
  function forgeRow(rec){
    const fam = rec.fam || 'lq';
    const lv = bldLevel('forge');
    const reqM = rec.reqM || 1;
    const locked = lv < rec.reqLv || masteryOf('forge') < reqM;
    const owned = oldArtSeg(fam) >= rec.outLv;
    const row = document.createElement('div');
    row.className = 'craft art f-' + fam + (rec.cls ? ' ' + rec.cls : '');
    const sCost = recipeStoneCost(rec);
    /* 新图谱的灵石就写在 mats 里，老四条走 stoneK —— 哪种都只列一次灵石 */
    const ledger = rec.mats.some(m => m.t === 'stone') ? rec.mats
      : (sCost > 0 ? rec.mats.concat([{ t: 'stone', n: sCost }]) : rec.mats);
    const mats = matLedger(ledger);
    const stoneOk = S.stone >= sCost;
    const matOk = rec.mats.every(m => matHas(m.t, m.n));
    /* P1：缺料时把差什么、差多少写进行内 */
    const miss = [];
    if(!stoneOk) miss.push('灵石差 ' + fmt(sCost - S.stone));
    rec.mats.forEach(m => { if(m.t !== 'stone' && !matHas(m.t, m.n)) miss.push(matName(m.t) + '差 ' + (m.n - Math.floor(matCount(m.t))) + matGoHtml(m.t)); });
    const missTxt = (!locked && miss.length) ? ' · 缺：' + miss.join('、') : '';
    const rate = craftRate(rec);
    const lockTxt = lv < rec.reqLv
      ? inkIco('🔒') + '需炼器坊 ' + rec.reqLv + ' 级解锁（当前 ' + lv + ' 级）'
      : inkIco('🔒') + '需器师 ' + reqM + ' 阶（当前 ' + masteryOf('forge') + ' 阶）：多炼低阶法宝涨经验';
    row.innerHTML = '<div class="craft-main"><b><i class="dan-seg">' + rec.outLv + ' 阶</i><img src="' + rec.img + '" alt=""> ' + rec.name + '</b>' +
      (locked ? '' : '<span class="craft-eff">' + artEffectText(fam, rec.outLv) + '</span>') +
      '<small>' + (locked
        ? lockTxt
        : mats + ' · 成功率 ' + Math.round(rate * 100) + '% · <span class="alt-hint">失败返还 ' + Math.round(CRAFT.failRefund * 100) + '% 材料（灵石不退）</span>' + missTxt) + '</small></div>' +
      '<button type="button">' + (owned ? '已装备' : locked ? '未解锁' : (stoneOk && matOk ? '炼制' : '缺料')) + '</button>';
    const btn = row.querySelector(':scope > button');
    btn.disabled = owned || locked || !stoneOk || !matOk;
    if(!locked && !owned) btn.addEventListener('click', () => craftItem('forge', rec.recipeId));
    /* 外部评审 2026-11-23 第 7 项：与炼丹折叠单同一口径 */
    anchorState(row, (!owned && !locked && stoneOk && matOk) ? 'ready' : 'locked');
    row.dataset.recipe = rec.recipeId;
    return row;
  }
  /* ---------- 灵兽养成（猎妖掉蛋 → 孵化 → 喂养 → 出战加战力） ---------- */
  const petExpNeed = lv => BAL.petExpBase * lv;
  function hatchEgg(idx){
    const egg = S.eggs[idx];
    if(!egg) return;
    if(S.pets.length >= S.petSlots){ log('灵兽槽已满（' + S.petSlots + ' 只），本次孵化未进行，先放生一只或新开一个灵兽槽。', 'bad'); return; }
    const cost = Math.floor(needOf(S.rank) * BAL.petHatchK);
    if(S.stone < cost){ log('灵石不足，孵化要 ' + fmt(cost) + ' 灵石。', 'bad'); return; }
    S.stone -= cost;
    S.eggs.splice(idx, 1);
    const b = BEASTS.find(x => x.id === egg.bid);
    S.pets.push({ bid: egg.bid, lv: 1, exp: 0 });
    log('🐣 孵化成功！获得灵兽【' + (b ? b.name : egg.bid) + '】，它的战力归你了。', 'gold');
    /* 孵化演出：蛋壳摇晃 → 550ms 裂壳 → 950ms 灵兽亮相（sfx 随之，不再在这里响 win） */
    const np = S.pets[S.pets.length - 1];
    showHatchCeremony(egg.bid, np ? petPowerOf(np) : 0);
    save(); render(); renderPets();
  }
  /* 灵兽诞生演出（蛋行本就显示妖兽长相 → 不是盲盒揭示，是「迎新」：
     纯 CSS 蛋壳 + 复用妖兽 PNG；reduced-motion 直通终态；连孵多蛋不超 1.5s） */
  const hatchTimers = [];
  /* 关窗时清掉未走完的演出时序：否则玩家在 550/950ms 内点关闭，
     关窗后仍会听到 crack / born 的音效（stage 还在，不会报错，但是明显的体验瑕疵）。 */
  function hatchCeremonyClear(){
    hatchTimers.forEach(clearTimeout);
    hatchTimers.length = 0;
  }
  if(typeof window !== 'undefined') window.hatchCeremonyClear = hatchCeremonyClear;
  function showHatchCeremony(bid, pow){
    const m = document.getElementById('hatch-modal');
    const b = BEASTS.find(x => x.id === bid);
    if(!m || !b) return;
    hatchTimers.forEach(clearTimeout); hatchTimers.length = 0;   /* 连孵：清掉上一枚的未完时序 */
    const stage = document.getElementById('hatch-stage');
    const img = document.getElementById('hatch-beast');
    const nameEl = document.getElementById('hatch-name');
    const descEl = document.getElementById('hatch-desc');
    if(!stage) return;                     /* 判空要判真正被解引用的对象：stage 下面被无条件用 */
    stage.classList.remove('crack', 'born');
    if(img){
      img.src = b.img;
      img.setAttribute('style', beastImgStyle(b).replace(/^ style="/, '').replace(/"$/, ''));
    }
    if(nameEl) nameEl.textContent = '【' + b.name + '】· 诞生';
    if(descEl) descEl.textContent = BEAST_TIER_NAME[b.tier] + ' · 战力 +' + fmt(pow) + ' · 喂食可继续升级';
    m.classList.remove('hidden');
    const calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const step = (cls, ms, snd) => {
      if(calm){ stage.classList.add(cls); if(snd) snd(); return; }
      hatchTimers.push(setTimeout(() => { stage.classList.add(cls); if(snd) snd(); }, ms));
    };
    step('crack', 550, () => sfx.pop());
    step('born', 950, () => sfx.win());
  }
  function feedPet(idx){
    const p = S.pets[idx];
    if(!p) return;
    if(p.lv >= BAL.petMaxLv){ log('灵兽已到 ' + BAL.petMaxLv + ' 级，登峰造极。', 'gold'); return; }
    const herbCost = BAL.petFeedHerb;
    const stoneCost = petFeedStoneCost();
    if(S.herb < herbCost){ log('灵草不足，喂食要 ' + herbCost + ' 株灵草（灵田产）。', 'bad'); return; }
    if(S.stone < stoneCost){ log('灵石不足，喂食要 ' + stoneCost + ' 灵石。', 'bad'); return; }
    S.herb -= herbCost; S.stone -= stoneCost;
    p.exp += BAL.petExpPerFeed;
    let ups = 0;
    while(p.exp >= petExpNeed(p.lv) && p.lv < BAL.petMaxLv){ p.exp -= petExpNeed(p.lv); p.lv++; ups++; }
    const b = BEASTS.find(x => x.id === p.bid);
    markDayDec('grow');   /* 阶段三收尾：今日四类决策 · 成长投资（喂食灵兽） */
    log('🍖 喂食灵兽【' + (b ? b.name : p.bid) + '】（灵草 −' + herbCost + '、灵石 −' + fmt(stoneCost) + '），' + (ups > 0 ? '灵兽升到 ' + p.lv + ' 级！' : '经验 +' + BAL.petExpPerFeed + '。'), ups > 0 ? 'gold' : 'good');
    gainFloat('+ ' + BAL.petExpPerFeed + ' 经验' + (ups > 0 ? ' · Lv.' + p.lv : ''), document.getElementById('xx-pet-cond'));
    sfx.pop(); save(); render(); renderPets();
  }
  function releasePet(idx){
    const p = S.pets[idx];
    if(!p) return;
    const b = BEASTS.find(x => x.id === p.bid);
    confirmAction({
      icon:'🕊️', title:'灵兽园 · 确认放生', okText:'确认放生',
      text:'灵兽：<b>' + escHTML(b ? b.name : p.bid) + '</b><br>放生后会离开，并腾出一个灵兽槽。',
      foot:'确认后才放生。'
    }, ok => {
      if(!ok || !S.pets[idx]) return;
      S.pets.splice(idx, 1);
      log('🕊️ 放生了灵兽，祝它山野自在。', '');
      save(); render(); renderPets();
    });
  }
  function buyPetSlot(){
    const n = S.petSlots;
    if(n >= BAL.petMaxSlots){ log('灵兽槽已开满 ' + BAL.petMaxSlots + ' 个。', 'gold'); return; }
    const cost = Math.floor(needOf(S.rank) * BAL.petSlotCost[n - 1]);
    if(S.stone < cost){ log('灵石不足，开灵兽槽要 ' + fmt(cost) + ' 灵石。', 'bad'); return; }
    S.stone -= cost;
    S.petSlots += 1;
    log('🔮 灵兽槽开到 ' + S.petSlots + ' 个，可同时养 ' + S.petSlots + ' 只灵兽。', 'good');
    sfx.click(); save(); render(); renderPets();
  }
  /* A77：灵兽园每秒被无条件重建，按钮 mousedown/mouseup 常被中途打断 → 表现为「点了没反应」。
     内容签名守卫：状态没变就留着行元素，一次点击才能完整走完。 */
  let petBox = null, petSig = '';
  /* batch5 第 6 项（甲案）：灵兽资质鉴定——纯展示，不新增存档字段、不改战力/产出。
     评级由现有品阶与等级现算；同一只灵兽在升级前每次鉴定结果一致。 */
  const PET_APT_NAMES = ['凡品', '灵品', '仙品', '神品', '祖品'];
  const PET_APT_LINES = [
    ['根骨单薄', '灵性未开', '凶性潜藏'],
    ['根骨尚可', '灵性初显', '凶性温顺'],
    ['根骨清奇', '灵性通透', '凶性有度'],
    ['根骨如铁', '灵性近道', '凶性慑人'],
    ['根骨通玄', '灵性通神', '凶性如渊']
  ];
  function petAptitude(p){
    const b = p && BEASTS.find(x => x.id === p.bid);
    if(!b) return null;
    const lv = Math.max(1, p.lv | 0), tier = b.tier | 0;
    const score = (tier - 1) * 2 + Math.floor((lv - 1) / 6);
    const grade = score >= 10 ? 4 : score >= 8 ? 3 : score >= 6 ? 2 : score >= 4 ? 1 : 0;
    return { grade, name: PET_APT_NAMES[grade], score, lines: PET_APT_LINES[grade], tier, lv, beast: b };
  }
  function showPetApt(i){
    const a = petAptitude(S.pets[i]);
    if(!a){ log('灵兽不存在。', 'bad'); return; }
    showSettle({
      icon: '🔮', title: '灵兽鉴定 · ' + a.beast.name, sub: '仅作评鉴，不影响战力与产出',
      rows: [
        settleLine('评级', a.name, 'good'),
        settleLine('根骨', a.lines[0]),
        settleLine('灵性', a.lines[1]),
        settleLine('凶性', a.lines[2]),
        settleLine('依据', BEAST_TIER_NAME[a.tier] + ' · Lv.' + a.lv)
      ],
      note: '免费鉴定，按当前品阶与等级计算；不写入存档，不改变战力/产出。升级后评级会随当前情况变化。'
    });
  }
  function renderPetBadge(){
    const b = document.getElementById('sc-pet-badge');
    if(!b) return;
    if(S.pets.length > 0){ b.textContent = ''; b.style.display = 'none'; return; }
    b.style.display = '';
    b.textContent = S.eggs.length > 0 ? ('蛋 ' + S.eggs.length) : '差蛋';
  }
  function renderPets(){
    const box = document.getElementById('xx-pets');
    if(!box){ petBox = null; petSig = ''; renderPetBadge(); return; }
    renderPetBadge();
    /* P0.5：入口先定性——解锁条件与当前差什么写在同一页顶部 */
    const cond = document.getElementById('xx-pet-cond');
    if(cond){
      let s;
      if(S.pets.length > 0) s = '已解锁 · 现有 ' + S.pets.length + ' 只灵兽（' + S.pets.length + ' / ' + S.petSlots + ' 槽）';
      else if(S.eggs.length > 0){
        const cost = Math.floor(needOf(S.rank) * BAL.petHatchK);
        s = '已解锁 · 有 ' + S.eggs.length + ' 枚妖兽蛋待孵化；孵化需灵石 ' + fmt(cost) +
          (S.stone < cost ? '（差 ' + fmt(cost - S.stone) + '）' : '（足够）');
      }else{
        s = '尚未拥有灵兽 · 解锁条件：获得 1 枚妖兽蛋（坊市货架可买；签到第 6 天、仙盟战功、论剑台声望也可换）';
      }
      cond.textContent = s;
    }
    const cp = combatPower();
    const petSum = petPowerSum();
    let html = '<div class="pet-power">' + inkIco('⚔️') + '战力 <b>' + fmt(cp) + '</b>' +
      (petSum > 0 ? '<span class="pet-bonus">灵兽 +' + fmt(petSum) + '</span>' : '') + '</div>';
    /* 我的灵兽 */
    html += '<div class="pet-sub">' + inkIco('🐉') + '我的灵兽（' + S.pets.length + ' / ' + S.petSlots + '）</div>';
    if(S.pets.length){
      html += '<div class="pet-list">';
      S.pets.forEach((p, i) => {
        const b = BEASTS.find(x => x.id === p.bid);
        if(!b) return;
        const pp = petPowerOf(p);
        const need = petExpNeed(p.lv);
        const pct = p.lv >= BAL.petMaxLv ? 100 : Math.round(p.exp / need * 100);
        html += '<div class="pet-row">' +
          '<img src="' + b.img + '"' + beastImgStyle(b) + ' alt=""><div class="pet-main">' +
          '<b>' + b.name + ' <small>Lv.' + p.lv + '</small></b>' +
          '<span class="pet-subline">' + BEAST_TIER_NAME[b.tier] + ' · 战力 +' + fmt(pp) + '</span>' +
          (p.lv < BAL.petMaxLv ? '<span class="pet-subline">喂食成本：灵草 ×' + BAL.petFeedHerb +
            ' · 灵石 ×' + fmt(petFeedStoneCost()) + '（经验 +' + BAL.petExpPerFeed + '）</span>' : '') +
          (p.lv < BAL.petMaxLv ? '<div class="pet-track"><i style="width:' + pct + '%"></i></div>' : '') +
          '</div><div class="pet-ops">' +
          (p.lv < BAL.petMaxLv ? '<button data-feed="' + i + '" title="每次喂食：灵草 ×' + BAL.petFeedHerb +
            '、灵石 ×' + fmt(petFeedStoneCost()) + '（经验 +' + BAL.petExpPerFeed + '）">喂食</button>' : '') +
          '<button class="ghost" data-apt="' + i + '">鉴定</button>' +
          '<button class="ghost" data-release="' + i + '">放生</button>' +
          '</div></div>';
      });
      html += '</div>';
    }else{
      html += '<p class="pet-empty">还没有灵兽。妖兽蛋在坊市货架上能买到，签到第 6 天、仙盟战功、论剑台声望也都能换到——带一枚回来，在这页孵化就有伴了。</p>';
    }
    if(S.petSlots < BAL.petMaxSlots){
      const cost = Math.floor(needOf(S.rank) * BAL.petSlotCost[S.petSlots - 1]);
      html += '<button class="pet-buy" data-slot="1">🔮 开灵兽槽 · 灵石 ' + fmt(cost) + '</button>';
    }
    /* 妖兽蛋 */
    if(S.eggs.length){
      html += '<div class="pet-sub">' + inkIco('🥚') + '妖兽蛋（' + S.eggs.length + '）</div><div class="pet-eggs">';
      S.eggs.forEach((e, i) => {
        const b = BEASTS.find(x => x.id === e.bid);
        html += '<div class="egg-row">' +
          '<img src="' + (b ? b.img : 'ui/icons/herb.png') + '"' + beastImgStyle(b) + ' alt="">' +
          '<span>' + (b ? b.name : '?') + '蛋</span>' +
          '<button data-hatch="' + i + '">孵化 · ' + fmt(Math.floor(needOf(S.rank) * BAL.petHatchK)) + '</button></div>';
      });
      html += '</div>';
    }
    if(box !== petBox || html !== petSig){
      petBox = box; petSig = html;
      box.innerHTML = html;
    }
    if(!box.dataset.d_binded){
      box.dataset.d_binded = '1';
      box.addEventListener('click', ev => {
        const b = ev.target.closest('[data-feed]');
        if(b){ ev.stopPropagation(); feedPet(Number(b.dataset.feed)); }
        const br = ev.target.closest('[data-release]');
        if(br){ ev.stopPropagation(); releasePet(Number(br.dataset.release)); }
        const ba = ev.target.closest('[data-apt]');
        if(ba){ ev.stopPropagation(); showPetApt(Number(ba.dataset.apt)); }
        const bh = ev.target.closest('[data-hatch]');
        if(bh){ ev.stopPropagation(); hatchEgg(Number(bh.dataset.hatch)); }
        const sb = ev.target.closest('[data-slot]');
        if(sb){ ev.stopPropagation(); buyPetSlot(); }
      });
    }
  }

  /* ---------- 镇妖塔（无限层爬塔，战力够了自动通关） ---------- */
  /* 第 n 层守卫战力 = towerBase × towerG^(n-1)
     制作人 2026-11-19 批：只把第 1 层门槛降到 12×POW_K（1200），其余层数与掉落一律不动。 */
  const TOWER1_POWER = 12 * POW_K;
  const towerPower = n => n === 1 ? TOWER1_POWER : Math.floor(BAL.towerBase * Math.pow(BAL.towerG, n - 1));
  /* 当前应挑战层：旧档 S.tower 可能落后于 towerMax（中途出塔/旧一局五步），
     逐层爬塔一律从 towerMax+1 接上，避免回头刷已通关层。 */
  const towerNow = () => Math.max(1, S.tower | 0, (S.towerMax | 0) + 1);
  /* 第 n 层首通奖励：灵石（锚定 need）+ 妖兽材料 */
  const towerReward = n => ({
    stone: Math.floor(needOf(S.rank) * (0.6 + n * 0.08)),
    mat: n % 5 === 0 ? 'mat_core' : 'mat_bone'   /* 每 5 层给妖丹，其余给兽骨 */
  });
  /* 2026-11-17 制作人批复六条：每 10 层 Boss 额外掉本阶稀有材料（甲案）。
     不给 boss_*：boss_feather/heart 当量分别是 Boss 层双倍灵石的 100%/157.9%，
     会稀释 dan5/渡劫丹；甲案量小，走本阶普通稀有料。 */
  const TOWER_BOSS_DROP = {
    1: { id: 'mat_core',    n: 2 },   /* 妖兽 · 妖丹 */
    2: { id: 'mat_bone',    n: 2 },   /* 灵兽 · 兽骨 */
    3: { id: 'mat_feather', n: 2 },   /* 仙兽 · 仙羽 */
    4: { id: 'mat_eye',     n: 1 },   /* 魔兽 · 魔晶 */
    5: { id: 'mat_marrow',  n: 1 }    /* 神兽 · 神兽之髓 */
  };
  /* 2026-11-19 制作人批：六件装备补掉落（只补产出路径，不动战力公式/needG/既有掉落）。
     塔 = 固定件、首通必掉、只掉一次；历练 = 低三件随机口（12%/胜，第 8 胜起保底），
     池内剔除已持有。数值表见 D:/xx-scratch/log/eq_drop_20261119/六件装备掉落表_方案.md。 */
  const TOWER_EQ_DROP = {
    1: 'eq_qingfeng', 2: 'eq_yupei', 3: 'eq_huxin',
    5: 'eq_chixiao', 8: 'eq_xuangui', 10: 'eq_lingzhu'
  };
  const ADV_EQ_POOL = ['eq_qingfeng', 'eq_yupei', 'eq_huxin'];
  /* 每日扫荡重置。用 dayNo() 严格递减判定（原为 `!==`）：
     只要"日期没往后走"就不重置，改系统时间刷不出新的扫荡次数与每日行动次数。 */
  function resetTowerDay(){
    const tk = todayKey();
    if(dayNo(S.towerDay) < todayNo()){ S.towerDay = tk; S.towerSwept = 0; }
  }

  /* ---------- 镇妖塔 · 一局五步（第 100 轮：把「点一下自动赢」换成每次都要选） ----------
     以前一层一次输入、零决策。现在入塔是一局五步，每步三扇门里挑一扇：
       镇守门  战力 = 本层守卫，通了推进一层，拿常规奖励
       精锐门  战力 ×1.35，通了推进一层，灵石 ×1.6、材料 ×2、再得一枚塔内符
       藏宝室  不打，直接拿灵石 + 灵草 + 矿石 + 一枚塔内符，但不推进层数
     塔内符只在本局有效（出塔即散），而且只改「奖励」不改战力与修炼倍率，
     所以 needG=1.85 与塔层战力曲线一动不动。
     战斗演出里还有两次主动输入：剑势（每层 3 次，每次本层灵石 +10%）、
     破防（每局 1 次，战力差 15% 以内时按下去直接破关，不按就输）。
     两步之外的取巧都不做：层的推进仍然只由战力判定决定。 */
  const TRUN = { steps: 5, eliteK: 1.35, eliteMin: 0.85, eliteStone: 1.6, swordMax: 3, swordK: 0.1 };
  const TDOOR = {
    fight: { n: '镇守门', d: '打穿本层守卫' },
    elite: { n: '精锐门', d: '守卫更凶，战利更厚' },
    vault: { n: '藏宝室', d: '不打，取灵石与灵材' }
  };
  const TCHARMS = [
    { id: 'feng', n: '锋符', d: '本局战利灵石 +15%' },
    { id: 'wu',   n: '悟符', d: '即刻化为修为' },
    { id: 'hu',   n: '护符', d: '战败时抵掉一次' }
  ];
  const trunOn   = () => !!(S.trun && !S.trun.end);
  const trunNeed = (k, floor) => Math.round(towerPower(floor) * (k === 'elite' ? TRUN.eliteK : 1));
  const trunFeng = () => (S.trun && S.trun.charms.feng) | 0;
  const trunStone = v => Math.round(v * (1 + 0.15 * trunFeng()));
  function trunRollDoors(){
    const a = ['fight', 'elite', 'vault'];
    for(let i = a.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  const trunMatN = (floor, k) => k === 'elite' ? 2 : 1;
  const trunMat  = floor => floor % 5 === 0 ? 'mat_core' : 'mat_bone';
  function trunGainCharm(){
    const c = TCHARMS[Math.floor(Math.random() * TCHARMS.length)];
    S.trun.res.charm++;
    if(c.id === 'wu'){
      const e = Math.max(1, Math.floor(needOf(S.rank) * 0.2));
      const got = addActiveExp(e);
      log('🀄 得「悟符」，当即化为修为 +' + fmt(got) + '。', 'good');
      return c;
    }
    S.trun.charms[c.id] = (S.trun.charms[c.id] | 0) + 1;
    log('🀄 得「' + c.n + '」· ' + c.d + '。', 'good');
    return c;
  }
  /* 入塔：战力门槛与从前一致（第一层守卫），门一开就占着——出塔或走完五步才散 */
  function towerRunStart(){
    resetTowerDay();
    if(trunOn()) return false;
    const need = towerPower(S.tower), cp = combatPower();
    if(cp < need){
      log('⚔️ 实力不济，请先去提升（第 ' + S.tower + ' 层守卫战力 ' + fmt(need) +
          '，你 ' + fmt(cp) + '，' + powerGapAdvice(cp, need) + '）。', 'bad');
      save(); render(); renderTower();
      return false;
    }
    S.trun = {
      f0: S.tower, step: 0, doors: trunRollDoors(),
      charms: { feng: 0, hu: 0 }, brk: 1, end: 0,
      res: { f: 0, stone: 0, herb: 0, ore: 0, mat: 0, charm: 0 }
    };
    S.trunLast = null;
    markDayDec('risk');   /* 阶段三收尾：今日四类决策 · 风险推进（入塔） */
    log('🏯 入塔 · 一局五步。每步三选一，出塔符散。', 'gold');
    sfx.pop(); save(); render(); renderTower();
    return true;
  }
  /* 选一扇门 */
  function towerRunDoor(k){
    const run = S.trun;
    if(!trunOn()){ log('这一局已经结束，请重新入塔。', 'bad'); return false; }
    if(run.doors.indexOf(k) < 0){ log('这扇门已经变了，请按当前三扇门重选。', 'bad'); return false; }
    const floor = S.tower;
    if(k === 'vault'){
      const stone = trunStone(Math.floor(needOf(S.rank) * 0.2));
      const herb = 20 + S.rank * 2, ore = 20 + S.rank * 2;
      S.stone += stone; S.stats.stoneEarned += stone;
      S.herb += herb; S.ore += ore;
      run.res.stone += stone; run.res.herb += herb; run.res.ore += ore;
      log('💎 藏宝室：灵石 +' + fmt(stone) + '，灵草 +' + herb + '，矿石 +' + ore + '。', 'good');
      trunGainCharm();
      run.step += 1;
      trunAdvance();
      return true;
    }
    const need = trunNeed(k, floor), cp = combatPower();
    const short = cp < need;
    if(short && cp < need * TRUN.eliteMin){
      log('⚔️ 战力不够，这扇门推不开（差 ' + fmt(need - cp) + '）。', 'bad');
      renderTower();
      return false;
    }
    const base = k === 'elite' ? Math.round(towerReward(floor).stone * TRUN.eliteStone) : towerReward(floor).stone;
    const loot = { stone: trunStone(base), mat: trunMat(floor), matN: trunMatN(floor, k) };
    if(btBusy) return false;
    if(!battleAnim || !document.getElementById('battle-modal')){
      trunSettle(k, floor, !short, loot);                       /* CI / 关演出：直接结 */
      return true;
    }
    const skills = [{ k: 'sword', label: '剑势', left: TRUN.swordMax }];
    if(short && run.brk > 0) skills.push({ k: 'break', label: '破防', left: run.brk });
    openBattleAnim(floor, win => trunSettle(k, floor, win, loot), {
      title: '镇妖塔 · 第 <b id="bt-floor">' + floor + '</b> 层 · ' + TDOOR[k].n,
      mob: towerBeast(floor),
      mobPower: need,
      /* 临界门：先按破防才赢，不按就照剧本输——胜负在玩家手上 */
      script: short ? { win: false, rounds: 3 } : undefined,
      loot: loot,
      skills: skills,
      onSkill(sk, api, left){
        if(sk === 'sword'){
          loot.stone = trunStone(Math.round(base * (1 + TRUN.swordK * (TRUN.swordMax - left))));
          api.say('剑势叠起 · 本层灵石 +' + Math.round(TRUN.swordK * (TRUN.swordMax - left) * 100) + '%');
          sfx.pop();
        } else if(sk === 'break'){
          run.brk -= 1;
          api.say('破防 · 一剑破关');
          api.win();
        }
      }
    });
    return true;
  }
  /* 一层结算：胜则发奖推层，败则先看护符（本局唯一的安全网），再败就出塔 */
  function trunSettle(k, floor, win, loot){
    const run = S.trun;
    if(!trunOn()) return;
    if(!win && (run.charms.hu | 0) > 0){
      run.charms.hu -= 1;
      log('🛡 护符替你挡下这一击，第 ' + floor + ' 层还是通了。', 'gold');
      win = true;
    }
    if(!win){ trunEnd('lose'); return; }
    S.stone += loot.stone; S.stats.stoneEarned += loot.stone;
    run.res.stone += loot.stone;
    const meta = ITEMS[loot.mat] || {};
    let got = 0, mailed = 0;
    for(let i = 0; i < loot.matN; i++){
      const r = addItemEx(loot.mat, meta.n || loot.mat);
      if(r.ok || r.mail){ got++; run.res.mat++; if(r.mail) mailed++; }
      else break;   /* 只有连信匣都写不进去才会失败；不再折成灵石，奖励不缩水 */
    }
    log('⚔️ 第 ' + floor + ' 层通关 · 灵石 +' + fmt(loot.stone) +
        (got > 0 ? '，' + meta.n + ' ×' + got : '') +
        (mailed > 0 ? '（其中 ' + mailed + ' 枚背包已满，暂存信匣）' : '') + '。',
        mailed > 0 ? 'bad' : 'gold');
    if(window.playLevelUpSound) playLevelUpSound();
    if(typeof Daily !== 'undefined') dailyBump('tower');     /* 每日任务：爬塔 1 次 */
    sfx.win();
    S.tower += 1;
    if(S.tower - 1 > S.towerMax){
      S.towerMax = S.tower - 1;
      towerEqGrant(S.tower - 1);
      /* NPC 记忆（T-506 接入）：崔九守塔人视角，只在破纪录层落账（不逐层刷屏）；缺失/异常一律静默 */
      try{ if(window.NpcMemory) NpcMemory.record('cuijiu', '你登塔破了第 ' + S.towerMax + ' 层', 'combat'); }catch(e){}
      /* 主动事件（第 114 轮）：破纪录当口老卒贺喜；NpcVisitQueue 按 npc+id 幂等，重复破纪录不堆叠 */
      try{ if(window.NpcVisitQueue) NpcVisitQueue.push('cuijiu', 'congrats_max', '听闻你破了塔中纪录。老朽守塔几十年，少见这样的身手。'); }catch(e){}
    }
    run.res.f += 1;
    run.step += 1;
    if(k === 'elite') trunGainCharm();
    trunAdvance();
  }
  function trunAdvance(){
    const run = S.trun;
    if(!run) return;
    if(run.step >= TRUN.steps){ trunEnd('done'); return; }
    run.doors = trunRollDoors();
    save(); render(); renderTower();
  }
  function trunEnd(why){
    const run = S.trun;
    if(!run) return;
    run.end = 1;
    S.trunLast = { why: why, steps: run.step, f: run.res.f, stone: run.res.stone, herb: run.res.herb,
                   ore: run.res.ore, mat: run.res.mat, charm: run.res.charm };
    S.trun = null;
    log(why === 'done'
      ? '🏯 五步走完，出塔。本局推进 ' + run.res.f + ' 层，灵石 +' + fmt(run.res.stone) + '。'
      : '🏯 第 ' + (run.step + 1) + ' 步折了，出塔休整。本局推进 ' + run.res.f + ' 层。',
      why === 'done' ? 'gold' : 'bad');
    save(); render(); renderTower();
  }
  /* 出塔 = 主动收手：已得的都留着，剩下的步数作废 */
  function towerRunQuit(){
    if(!trunOn()) return false;
    trunEnd('quit');
    return true;
  }

  /* ---------- 回合制战斗演出（镇妖塔 / 论剑台 / 秘境共用，第 93 轮起） ----------
     纯 DOM + CSS 动画：突进/受击红闪/飘伤害数字/血条扣减/全屏震动，
     setTimeout 队列驱动回合，结束后回调结算（不引任何引擎）。 */
  let battleAnim = true;      /* 演出开关（verify/CI 可关：直接结算） */
  let btTimers = [];          /* 本场演出的全部定时器，跳过/收尾时统一清 */
  let btBusy = false;         /* 演出进行中，防连点 */
  let btPending = null;       /* 上一场没走完就被强行接管时的收尾回调，见 openBattleAnim 头部 */
  function btWait(fn, ms){ btTimers.push(setTimeout(fn, ms)); }
  function btClear(){ btTimers.forEach(clearTimeout); btTimers = []; }
  /* 战斗演出时序（毫秒），btWait 的每一段都从这里取。
     ⚠️ 必须是「单行 + 键带引号」的字面量：shot/shot_battle.js 在 Node 侧 JSON.parse 这一行来算
     截图点位（拍哪一帧 = 这些数加起来）。以前那些 1660/2760 是硬编码在截图脚本里的，
     谁改这里的时序，脚本不报错、只拍到错的相位，而且拍出来"看着也挺对"。
     解析不到脚本会直接抛，不会再静默拍错。 */
  const BT_TL = { "open": 420, "wind": 90, "lunge": 170, "slash": 400, "impact": 110, "tail": 620, "mobGap": 120, "plyGap": 140, "loot": 360, "hold": 1950 };
  /* 第 n 层守卫：每 4 层升一档妖兽等阶，段内轮换，演出不重样 */
  function towerBeast(n){
    /* 2026-11-17 制作人批复：品阶每 10 层一档（1–10 妖兽、11–20 灵兽、21–30 仙兽、
       31–40 魔兽、41–50 神兽、51+ 神兽循环）；每 10 层必是本章 Boss，按本阶 Boss 表
       固定顺序轮换（10 妖虎→20 蛟龙→30 朱雀→40 九尾→50 饕餮→60 应龙→70 混沌→80 饕餮…）。
       非 10 层只出本阶非 Boss。 */
    const tier = Math.min(5, Math.max(1, Math.ceil(n / 10)));
    const pool = BEASTS.filter(b => b.tier === tier);
    if(!pool.length) return BEASTS[0];
    if(n % 10 === 0){
      const bosses = pool.filter(b => b.boss);
      if(bosses.length){
        const first = tier === 5 ? 5 : tier;         /* 本阶首个十年：t5 从 50 起算 */
        const k = Math.floor(n / 10) - first;
        return bosses[((k % bosses.length) + bosses.length) % bosses.length];
      }
    }
    const normal = pool.filter(b => !b.boss);
    const use = normal.length ? normal : pool;
    return use[(n - 1) % use.length];
  }
  /* 论剑台的对手是同门修士，不在 BEASTS 表里，没有现成立绘。
     第 93 轮：两张真立绘（男/女）按道号做稳定哈希挑选 + 一小圈色相偏移，
     同一个对手每次打都长一个样（用随机就会每刀换脸）。 */
  const RIVAL_IMGS = ['ui/avatar/hero_male.png', 'ui/avatar/hero_female.png'];
  function rivalLook(name){
    const n = String(name || '无名修士');
    let h = 0;
    for(let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
    return { name: n, img: RIVAL_IMGS[h % 2], hue: ((h >> 3) % 4) * 12 };
  }
  /* 剑意流派：中央剑气弧的三套配色，点击战斗界面中央的弧即可循环切换（存盘记忆） */
  const AURA_CLS = ['', 'arc-zixiao', 'arc-chiyan'];
  const AURA_NAME = ['青莲剑意', '紫霄神雷', '赤炎流光'];
  function applyAura(){
    const arena = document.getElementById('bt-arena');
    if(!arena) return;
    arena.classList.remove('arc-zixiao', 'arc-chiyan');
    const c = AURA_CLS[S.swordAura | 0];
    if(c) arena.classList.add(c);
  }
  function cycleAura(){
    S.swordAura = ((S.swordAura | 0) + 1) % 3;
    applyAura(); save();
    log('剑意已切换：' + AURA_NAME[S.swordAura], 'gold');
  }
  function btRestartAnim(el, cls){
    el.classList.remove('lunge', 'hit', 'fade', 'fly', 'strike', 'wind');
    void el.offsetWidth;          /* 强制 reflow，让同名动画可重复触发 */
    el.classList.add(cls);
  }
  function btFloatDmg(side, dmg, crit){
    const host = document.querySelector('#' + (side === 'p' ? 'bt-pside' : 'bt-mside') + ' .bt-figure');
    if(!host) return;
    const sp = document.createElement('span');
    /* 挂在 .bt-figure 而不是 .bt-side 上：伤害数字要压在受击的那具身子上，
       挂在整侧容器里会按 30% 飘到道号/妖名那一行，看着像给对方名字掉血 */
    sp.className = 'bt-dmg-float' + (crit ? ' crit' : '') + (side === 'p' ? ' me' : '');
    sp.textContent = '-' + fmt(dmg);
    sp.style.left = (40 + Math.random() * 20) + '%';
    host.appendChild(sp);
    setTimeout(() => sp.remove(), 1000);
  }
  /* ---------- 战利品浮现（2026-10-24）----------
     掉落是 RPG 的峰值时刻：塔胜利掉落行（图标+品质色+错峰 110ms 滑入）
     + 猎妖挂机飘字（右上角 toast，堆叠上限 3，1.5s 自灭）。
     品质色复用既有 .good/.gold，零新图片；挂机是高频被动事件，只做轻飘字不上演出。 */
  function lootRowHTML(id, n, delay, withCoin){
    const m = ITEMS[id] || {};
    return '<div class="bt-loot-row" style="animation-delay:' + delay + 'ms">' +
      (withCoin ? '<i class="lr-coin"></i>' : (m.img ? '<img src="' + m.img + '" alt="">' : '')) +
      (withCoin ? '<span class="lr-stone">灵石 +' + fmt(n) + '</span>'
                : '<span class="lr-name ' + (m.cls || '') + '">' + (m.n || id) + '</span>' +
                  (n > 1 ? '<b>×' + n + '</b>' : '')) +
      '</div>';
  }
  function showBattleLoot(rw){
    const box = document.getElementById('bt-loot');
    if(!box) return;
    /* 第 93 轮：三个场子的结算不一样——塔掉材料+灵石，论剑掉灵石+声望，秘境材料可能是空的。
       以前无条件渲染材料行，rw.mat 为空时会印出一行「undefined」。 */
    let d = 0;
    let h = '';
    if(rw.mat)      { h += lootRowHTML(rw.mat, rw.matN || 1, d); d += 110; }
    if(rw.stone)    { h += lootRowHTML(null, rw.stone, d, true); d += 110; }
    if(rw.rep)      { h += '<div class="bt-loot-row" style="animation-delay:' + d +
                        'ms"><span class="lr-name">声望 +' + rw.rep + '</span></div>'; d += 110; }
    /* 第 99 轮：一句话结算（心魔照镜走这条——不掉材料不掉灵石，只有道心） */
    if(rw.text)     { h += '<div class="bt-loot-row" style="animation-delay:' + d +
                        'ms"><span class="lr-name">' + rw.text + '</span></div>'; }
    box.innerHTML = h;
  }
  function lootFloat(id, n){
    const host = document.getElementById('loot-toast');
    if(!host) return;
    while(host.children.length >= 3) host.firstElementChild.remove();   /* 堆叠上限 3：防挂机刷屏 */
    const m = ITEMS[id] || {};
    const chip = document.createElement('div');
    chip.className = 'loot-chip ' + (m.cls || '');
    chip.innerHTML = (m.img ? '<img src="' + m.img + '" alt="">' : '') +
      '<span>获得</span><b>' + (m.n || id) + (n > 1 ? ' ×' + n : '') + '</b>';
    host.appendChild(chip);
    setTimeout(() => chip.remove(), 1500);
  }
  /* 战斗结算浮字（2026-10-25）：同一件事——"打赢了"——不管在哪打，都该有同一种反馈。
     第 93 轮起镇妖塔/论剑/秘境三处都上整场演出 + 战利品行（见 openBattleAnim 的 opts）；
     chip 仍然留着——扫荡这类一次结十层的高频操作只飘字，verify 也靠它做即时反馈断言。 */
  /* P1：世界通告——独立条，与传音聊天分开；一次一条，6 秒限流，队列最多 5 条 */
  const annQueue = [];
  let annBusy = false, annLastAt = 0, annTimer = 0;
  function announce(kind, text){
    if(!kind || !text) return;
    if(annQueue.length >= 5) annQueue.shift();
    annQueue.push({ kind, text });
    annTick();
  }
  function annTick(){
    const el = document.getElementById('world-ann');
    const tx = document.getElementById('world-ann-text');
    if(!el || !tx) return;
    if(annBusy || !annQueue.length) return;
    const now = Date.now();
    if(now - annLastAt < 6000){
      if(annTimer) clearTimeout(annTimer);
      annTimer = setTimeout(annTick, 6000 - (now - annLastAt));
      return;
    }
    const a = annQueue.shift();
    annBusy = true; annLastAt = now;
    tx.textContent = '【' + a.kind + '】' + a.text;
    el.classList.remove('hidden');
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    annTimer = setTimeout(() => {
      el.classList.add('hidden'); el.classList.remove('show');
      annBusy = false; annTick();
    }, 4200);
  }
  function gainChip(txt, cls){
    const host = document.getElementById('loot-toast');
    if(!host) return;
    while(host.children.length >= 3) host.firstElementChild.remove();   /* 与猎妖飘字共用堆叠上限 3 */
    const chip = document.createElement('div');
    chip.className = 'loot-chip one ' + (cls || '');
    chip.innerHTML = '<b>' + txt + '</b>';
    host.appendChild(chip);
    setTimeout(() => chip.remove(), 1500);
  }

  function openBattleAnim(floor, onEnd, opts){
    /* 第 93 轮：一场演出，三个场子。镇妖塔一直是整场演出；论剑台、秘境以前只有右上角一枚 chip，
       玩家点了「挑战」等于对着日志盲掷骰子。现在它们共用这台机器，靠 opts 换皮：
         opts.title     —— 顶部题签（默认「镇妖塔 · 第 N 层」，会重写 #bt-title）
         opts.mob        —— 对手 {name,img,hue,boss}（默认按层数选妖兽）
         opts.mobPower   —— 对手血量（默认 towerPower(floor)）
         opts.loot       —— 结算掉落行（默认 towerReward(floor)）
         opts.script     —— {win, rounds}：胜负已经掷好了，血条照着这个回合数掉下去
       ⚠️ script 是给「结果先于动画」的场子用的（论剑 ±15% 临场发挥会输）。奖励数值一律按掷好的
          结果先入账，动画只管演，不参与结算——不然为了好看改经济，第 42 节的平衡就白钉了。
       ⚠️ 连点保护：上一场没走完就再开，先把它的 onEnd 补掉。以前 btClear() 直接把 finish 的定时器
          清了，btBusy 永远留 true，之后所有挑战都点不动（论剑连点五下就能撞上）。 */
    opts = opts || {};
    const m = document.getElementById('battle-modal');
    if(!m){ onEnd(true); return; }
    btClear();
    if(btPending){ const prev = btPending; btPending = null; prev(true); }
    btBusy = true;
    btPending = onEnd;
    const stage = document.getElementById('bt-stage');
    const pSide = document.getElementById('bt-pside'), mSide = document.getElementById('bt-mside');
    const pAv = document.getElementById('bt-pavatar'), mAv = document.getElementById('bt-mavatar');
    const mWrap = document.getElementById('bt-mwrap');   /* 换色皮的 --hue 挂在壳上，见下方注释 */
    const slash = document.getElementById('bt-slash');
    const arena = document.getElementById('bt-arena'), vsEl = document.getElementById('bt-vs');
    applyAura();                                  /* 应用玩家选定的剑意流派配色 */
    if(vsEl) vsEl.onclick = cycleAura;            /* 点中央剑气弧 = 切换流派 */
    const pBar = document.getElementById('bt-php'),  mBar = document.getElementById('bt-mhp');
    const pTrail = document.getElementById('bt-ptrail'), mTrail = document.getElementById('bt-mtrail');
    const pNum = document.getElementById('bt-phpn'), mNum = document.getElementById('bt-mhpn');
    const logEl = document.getElementById('bt-log');
    const rwrap = document.getElementById('bt-rwrap'), rMain = document.getElementById('bt-result');
    const beast = opts.mob || towerBeast(floor);
    const script = opts.script || null;
    /* 玩家满血 = 战力，怪物满血 = 守卫战力；玩家先手且伤害吃战力比放大 → 战力过线即必胜
       （最低配每刀 26-34% 妖兽血，理论上限 4 回合；妖兽每刀最多 14-20% 玩家血），
       血量归零分支纯兜底 */
    const pMax = combatPower(), mMax = opts.mobPower || towerPower(floor);
    /* 洗练 / 装备接入：combatPower() 已含战力词条（affixPowMult）+ 法宝强化 + 宠物装备；
       战力比 → 玩家伤害指数放大（洗完装备打同层明显更快，碾压可一刀秒）；
       暴击率 = 基础 + 洗练暴击率词条，开战时读取一次 */
    const powRatio = pMax / mMax;              /* 塔里 ≥1（不足在 challengeTower 已拦截）；带 script 的场子不用它 */
    const pathBonus = script ? 1 : pathBonusFor(S.path); // P1-C：开战算定一次；script 场不调用取值函数（GPT 审查⑤）
    if (!script && S.path) log('⚔️ 本场道途加成：' + pathBonusLabel(S.path), 'sys');  // 议程4 可见化：仅呈现来源与幅度，不动伤害计算（数据源 PATH_BONUS）
    const critRate = affixCritRate();
    let pHP = pMax, mHP = mMax;
    const titleEl = document.getElementById('bt-title');
    if(titleEl) titleEl.innerHTML = opts.title || ('镇妖塔 · 第 <b id="bt-floor">' + floor + '</b> 层');
    document.getElementById('bt-pname').textContent = S.name || '散修';
    document.getElementById('bt-mname').textContent = beast.name;
    /* 第 84 轮：文字占位框换成真形象。玩家按性别取立绘，妖兽用 BEASTS[].img。
       换色皮（zhulong/kunpeng… 复用同一张底图）的 hue 角度写在外层「壳」的 --hue 上，
       不写图片本体：图片那一层要跑受击/突进动画，动画的 filter 会整条顶掉同层样式。 */
    pAv.src = heroImg();
    pAv.alt = S.name || '仙';
    mAv.src = beast.img;
    mAv.alt = beast.name;
    mAv.classList.toggle('boss', !!beast.boss);
    /* 心魔照镜（第 99 轮）：对手就是自己的立绘。翻面/褪色挂在「壳」#bt-mwrap 上——
       图片本体要跑受击/突进 keyframes，同层 transform 会被逐帧顶掉（见 style.css 的分层注释） */
    mWrap.classList.toggle('mirror', !!beast.mirror);
    mWrap.style.setProperty('--hue', (beast.hue || 0) + 'deg');
    pBar.style.width = '100%'; mBar.style.width = '100%';
    /* 残影没有 transition-delay 的「归零」路径：上一场留下的窄宽度要先无动画地拉回满血，
       否则开场会看到两条暗红从上次的位置慢慢爬回来 */
    [pTrail, mTrail].forEach(t => {
      if(!t) return;
      t.style.transition = 'none'; t.style.width = '100%';
      void t.offsetWidth; t.style.transition = '';
    });
    pNum.textContent = fmt(pMax) + ' / ' + fmt(pMax);
    mNum.textContent = fmt(mMax) + ' / ' + fmt(mMax);
    logEl.innerHTML = '&nbsp;';
    rwrap.classList.add('hidden');
    [pSide, mSide].forEach(s => s.classList.remove('lunge', 'hit', 'fade', 'hurt'));
    slash.classList.remove('fly');
    m.classList.remove('hidden');
    const shake = () => {
      stage.classList.remove('shaking'); void stage.offsetWidth; stage.classList.add('shaking');
    };
    const setHP = (side, hp, max) => {
      const pct = Math.max(0, Math.round(hp / max * 100));
      const bar = side === 'p' ? pBar : mBar;
      const num = side === 'p' ? pNum : mNum;
      const trail = side === 'p' ? pTrail : mTrail;
      const sideEl = side === 'p' ? pSide : mSide;
      bar.style.width = pct + '%';
      num.textContent = fmt(Math.max(0, hp)) + ' / ' + fmt(max);
      /* 残影晚 0.26s 才追上来（延迟写在 CSS 里），这里只负责把目标宽度交出去 */
      if(trail) trail.style.width = pct + '%';
      bar.parentNode.classList.toggle('low', pct > 0 && pct <= 30);
      sideEl.classList.toggle('hurt', pct > 0 && pct <= 30);
    };
    const finish = win => {
      btClear();
      btBusy = false;
      btPending = null;
      m.classList.add('hidden');
      onEnd(win);
    };
    /* 跳过 = 认定战力已过判定、直接打完：照常结算奖励 */
    document.getElementById('bt-skip').onclick = () => finish(true);
    /* 主动技（第 100 轮）：opts.skills = [{k,label,left}]，点一次减一，交回 opts.onSkill(k, api, left)。
       api.win() 立刻走胜利结算（破防用），api.say() 只改战斗日志那一行。
       注意 winShow/finish 都在本函数内：winShow 是函数声明（提升），finish 是 const（不提升），
       所以这段必须放在 finish 定义之后。 */
    const skEl = document.getElementById('bt-skills');
    if(skEl){
      const skills = (opts.skills || []).slice();
      skEl.innerHTML = skills.map(s => '<button class="bt-skill' + (s.k === 'break' ? ' brk' : '') +
        '" data-sk="' + s.k + '">' + s.label + '<i>' + s.left + '</i></button>').join('');
      skEl.classList.toggle('hidden', skills.length === 0);
      skEl.querySelectorAll('[data-sk]').forEach(b => {
        b.onclick = () => {
          const s = skills.find(x => x.k === b.dataset.sk);
          if(!s || s.left <= 0 || !opts.onSkill || !btBusy) return;   /* 演出结束后不再受理 */
          if(!rwrap.classList.contains('hidden')) return;             /* 结果已亮：不能再把败局按成胜局 */
          s.left -= 1;
          b.querySelector('i').textContent = s.left;
          b.classList.toggle('used', s.left <= 0);
          opts.onSkill(s.k, { win: () => winShow(), say: t => { if(logEl) logEl.textContent = t; } }, s.left);
        };
      });
    }
    function playerTurn(){
      btRestartAnim(pSide, 'wind');            /* 起手：先沉半步，突进才有回摆 */
      btWait(() => {
        btRestartAnim(pSide, 'lunge');
        btWait(() => {
          /* 半月剑光出鞘：飞 0.52s，命中瞬间定格 110ms 再结算伤害 */
          btRestartAnim(slash, 'fly');
          btWait(() => {
            stage.classList.add('impact');
            btWait(() => {
              stage.classList.remove('impact');
              /* 玩家伤害 = 妖兽血量 × 基准(26-34%) × 战力比^1.3 × 暴击倍率
                 战力刚好够 → 3~4 回合；超线 50% → 2 回合；3 倍以上 → 一刀秒杀
                 带 script 的场子（论剑/秘境）改走定速掉血：每刀 ceil(上限/回合数)，
                 掷输的场子多留两回合血，保证撑到妖兽把玩家打死、不会反过来先秒对方 */
              const crit = !script && Math.random() < critRate;
              const raw = script
                ? mMax / (script.win ? script.rounds : script.rounds + 2)
                : mMax * (0.26 + Math.random() * 0.08) * Math.max(1, Math.pow(powRatio, 1.3)) * pathBonus;
              const dmg = script ? Math.max(1, Math.ceil(raw))          /* 定速：不受战力比影响 */
                                 : Math.round(raw * (crit ? 2 : 1));    /* 暴击翻倍；道途乘子已含于 raw */
              const applied = Math.min(dmg, mHP);             /* 秒杀时不超过剩余血量 */
              mHP -= applied;
              btRestartAnim(mSide, 'hit');
              if(vsEl){ btRestartAnim(vsEl, 'strike'); btWait(() => vsEl.classList.remove('strike'), 470); }
              btFloatDmg('m', applied, crit);
              setHP('m', mHP, mMax);
              shake(); sfx.hit();
              logEl.textContent = (crit ? '会心一击！剑光贯体，' : '剑光掠过，') + beast.name + ' -' + fmt(applied);
              btWait(() => {
                if(mHP <= 0){ winShow(); return; }
                btWait(mobTurn, BT_TL.mobGap);
              }, BT_TL.tail);
            }, BT_TL.impact);
          }, BT_TL.slash);
        }, BT_TL.lunge);
      }, BT_TL.wind);
    }
    function mobTurn(){
      btRestartAnim(mSide, 'wind');
      btWait(() => {
        btRestartAnim(mSide, 'lunge');
        btWait(() => {
          /* 妖兽伤害 = 玩家血量 × 基准(14-20%) ÷ 战力比^0.9：玩家碾压时妖兽挠痒，回合更短
             带 script：赢的场子只挠固定 9%（三回合掉三成，看着有来有回又死不了）；
             输的场子 ceil(玩家血/回合数)，第 rounds 刀正好把玩家放倒 */
          const dmg = script
            ? (script.win ? Math.max(1, Math.round(pMax * 0.09))
                          : Math.max(1, Math.ceil(pMax / script.rounds)))
            : Math.max(1, Math.round(pMax * (0.14 + Math.random() * 0.06) / Math.max(1, Math.pow(powRatio, 0.9))));
          pHP = Math.max(0, pHP - dmg);
          btRestartAnim(pSide, 'hit');
          btFloatDmg('p', dmg, false);
          setHP('p', pHP, pMax);
          shake(); sfx.hit();
          logEl.textContent = beast.name + '反扑而来，你 -' + fmt(dmg);
          btWait(() => {
            if(pHP <= 0){ loseShow(); return; }
            btWait(playerTurn, BT_TL.plyGap);
          }, BT_TL.tail);
        }, BT_TL.lunge);
      }, BT_TL.wind);
    }
    function winShow(){
      btClear();
      mSide.classList.remove('lunge', 'hit', 'wind');
      void mSide.offsetWidth;
      mSide.classList.add('fade');
      sfx.win();
      const rw = opts.loot || towerReward(floor);
      btWait(() => {
        rMain.textContent = beast.boss ? '妖王伏诛 · 战斗胜利' : '战斗胜利';
        rMain.classList.remove('bad');
        rMain.classList.toggle('boss', !!beast.boss);
        showBattleLoot(rw);                       /* 掉落行组件：图标 + 品质色 + 错峰 110ms 滑入 */
        rwrap.classList.remove('hidden');
      }, BT_TL.loot);
      btWait(() => finish(true), BT_TL.hold);
    }
    function loseShow(){
      btClear();
      pSide.classList.remove('lunge', 'hit', 'wind');
      void pSide.offsetWidth;
      pSide.classList.add('fade');
      sfx.lose();
      btWait(() => {
        rMain.textContent = '挑战失败';
        rMain.classList.add('bad');
        const lbox = document.getElementById('bt-loot');
        if(lbox) lbox.innerHTML = '<div class="bt-loot-row"><span class="lr-name">修为受损，请先去提升战力</span></div>';
        rwrap.classList.remove('hidden');
      }, BT_TL.loot);
      btWait(() => finish(false), BT_TL.hold);
    }
    btWait(playerTurn, BT_TL.open);
  }
  /* 扫荡：一键清掉已通关的层，拿 towerSweepRatio 比例的挂机收益 */
  function sweepTower(){
    resetTowerDay();
    const can = Math.max(0, S.towerMax);
    if(can <= 0){ log('还没有通关记录，先去挑战第 1 层。', 'bad'); return; }
    if(S.towerSwept >= can){ log('今日已扫荡过 ' + S.towerSwept + ' 层，明天再来。', 'bad'); return; }
    let stone = 0, matCount = 0;
    for(let n = 1; n <= can; n++){
      const rw = towerReward(n);
      stone += Math.floor(rw.stone * BAL.towerSweepRatio);
      if(n % 3 === 0) matCount++;   /* 每 3 层给 1 个材料，避免背包爆炸 */
    }
    S.stone += stone;
    S.stats.stoneEarned += stone;
    const meta = ITEMS['mat_bone'];
    let got = 0;
    for(let i = 0; i < matCount; i++){
      const r = bagAddQty('mat_bone', meta ? meta.n : '兽骨', 1, true);
      if(!r.ok) break;
      got++;
    }
    S.towerSwept = can;
    log('🏯 扫荡镇妖塔 ' + can + ' 层，灵石 +' + fmt(stone) + (got > 0 ? '，兽骨 ×' + got : '') + '。', 'good');
    {
      const srows = [settleLine('灵石', '+' + fmt(stone), 'good')];
      if(got > 0) srows.push(settleLine('兽骨', '+' + got, 'good'));
      showSettle({ icon: '🏯', title: '塔层扫荡结算', sub: '已扫荡 ' + can + ' 层 · 按 ' + Math.round(BAL.towerSweepRatio * 100) + '% 收益',
        rows: srows, note: '按已通关层的扫荡比例结算；每 3 层另得 1 份材料。' });
    }
    sfx.pop();
    save(); render(); renderTower(); renderBag();
  }
  /* ============ 逐层爬塔（2026-11-17 制作人改单） ============
     一层一只妖：战力够就挑战，胜则上一层；每层首通给 towerReward；
     每 10 层额外再给一份本层奖励（= 本层奖励 ×2，不新增数值）。
     旧「一局五步」的 trun* 仅留旧档/旧测试兼容，新 UI 不再入口。 */
  function towerFloorGrant(floor, times){
    const rw = towerReward(floor);
    const meta = ITEMS[rw.mat] || {};
    let stone = 0, got = 0, mailed = 0;
    for(let i = 0; i < times; i++){
      stone += rw.stone;
      const r = addItemEx(rw.mat, meta.n || rw.mat);
      if(r.ok || r.mail){ got++; if(r.mail) mailed++; } else break;
    }
    S.stone += stone; S.stats.stoneEarned += stone;
    return { stone: stone, got: got, mailed: mailed, matName: meta.n || rw.mat };
  }
  /* 每 10 层 Boss 专属：按“章节品阶”发本阶稀有材料（甲案），背包满走信匣 */
  function towerBossGrant(floor){
    const tier = Math.min(5, Math.max(1, Math.ceil(floor / 10)));
    const d = TOWER_BOSS_DROP[tier];
    if(!d) return null;
    const meta = ITEMS[d.id] || {};
    let got = 0, mailed = 0;
    for(let i = 0; i < d.n; i++){
      const r = addItemEx(d.id, meta.n || d.id);
      if(r.ok || r.mail){ got++; if(r.mail) mailed++; }
    }
    return got ? { name: meta.n || d.id, n: got, mailed: mailed } : null;
  }
  /* 塔装备：只在破纪录那一次掉（两条通关路径都调），已持有/信匣待领则不再掉。
     不进 towerReward：扫荡共用那函数，会把装备当常规收益刷出来。 */
  /* P0.5：装备掉落结算——与当前所穿逐项对比，并提供「立即穿戴」 */
  function equipDropInfo(id){
    const meta = ITEMS[id] || {};
    const slot = meta.slot;
    if(!slot) return null;
    const curId = equippedId(slot);
    const cur = curId ? (ITEMS[curId] || null) : null;
    const curPow = cur ? (cur.power || 0) : 0;
    const newPow = meta.power || 0;
    const rows = [
      settleLine('新装备 · ' + (meta.n || id), '+' + fmt(newPow) + ' 战力', 'good'),
      settleLine('当前' + (SLOT_NAME[slot] || '') + '槽', cur ? ('【' + (cur.n || curId) + '】+' + fmt(curPow)) : '空槽'),
      settleLine('对比', newPow > curPow ? ('高 ' + fmt(newPow - curPow) + ' 战力') : newPow === curPow ? '持平' : ('低 ' + fmt(curPow - newPow) + ' 战力'), newPow > curPow ? 'good' : 'bad')
    ];
    return { id, meta, slot, rows, better: newPow > curPow, mailed: false };
  }
  function appendEquipAction(drop){
    if(!drop || drop.mailed) return;
    const box = document.getElementById('cs-rows');
    if(!box) return;
    const id = drop.id;
    const meta = ITEMS[id] || {};
    if(!meta.slot) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-main settle-act';
    b.textContent = '立即穿戴';
    b.onclick = () => {
      const r = equipItem(id);
      if(r && r.ok){ document.getElementById('craft-settle').classList.add('hidden'); }
    };
    box.appendChild(b);
  }
  function showEquipDrop(drop){
    if(!drop) return;
    const info = equipDropInfo(drop.id);
    if(!info) return;
    if(drop.mailed){
      info.rows.push(settleLine('备注', '背包已满，已暂存信匣；取回后可穿戴', 'bad'));
    }
    showSettle({ icon: '🗡️', title: '装备掉落', sub: (info.meta.n || drop.id) + ' · ' + (SLOT_NAME[info.slot] || ''),
      rows: info.rows,
      note: info.mailed ? '信匣取回后再穿戴。' : (info.better ? '比当前所穿更好，可直接穿戴。' : '当前所穿更好；已放入背包，需要时再换。') });
    if(!drop.mailed) appendEquipAction({ id: drop.id, mailed: false });
  }
  function towerEqGrant(floor){
    const id = TOWER_EQ_DROP[floor];
    if(!id || ownsEquip(id)) return null;
    const meta = ITEMS[id] || {};
    const r = addItemEx(id, meta.n || id);
    if(!(r.ok || r.mail)) return null;
    log('🗡️ 第 ' + floor + ' 层 · 掉落【' + (meta.n || id) + '】（战力 +' + fmt(meta.power || 0) + '）' +
      (r.mail ? '，背包已满暂存信匣' : '') + '。', 'gold');
    return { id: id, name: meta.n || id, power: meta.power || 0, mailed: !!r.mail };
  }
  /* 历练装备：低三件随机口；12%/胜，第 8 胜起若池内还有未持有件则必掉一件。
     池空静默不掉，不折灵石（数值表 §2）。 */
  function advEqDrop(){
    const pool = ADV_EQ_POOL.filter(id => !ownsEquip(id));
    if(!pool.length) return null;
    const pity = (S.acts.train | 0) >= 8;
    if(!pity && Math.random() >= 0.12) return null;
    const id = pool[Math.floor(Math.random() * pool.length)];
    const meta = ITEMS[id] || {};
    const r = addItemEx(id, meta.n || id);
    if(!(r.ok || r.mail)) return null;
    log('🗡️ 历练拾得【' + (meta.n || id) + '】（战力 +' + fmt(meta.power || 0) + '）' +
      (r.mail ? '，背包已满暂存信匣' : '') + '。', 'gold');
    const drop = { id: id, name: meta.n || id, power: meta.power || 0, mailed: !!r.mail };
    showEquipDrop(drop);
    return drop;
  }
  function towerFloorSettle(floor, win){
    if(!win){
      log('⚔️ 第 ' + floor + ' 层没过，留在原地，提升战力再来。', 'bad');
      save(); render(); renderTower();
      return;
    }
    const first = floor > S.towerMax;
    const isBoss = floor % 10 === 0;
    coopBossHit();   /* P2：塔胜计入宗门协力伤害（按当次战力） */
    const base = towerFloorGrant(floor, 1);
    const srows = [settleLine('灵石', '+' + fmt(base.stone), 'good')];
    if(base.got) srows.push(settleLine('掉落 · ' + base.matName, '+' + base.got + (base.mailed ? '（部分入信匣）' : ''), base.mailed ? 'bad' : 'good'));
    log('⚔️ 第 ' + floor + ' 层通关 · 灵石 +' + fmt(base.stone) +
      (base.got ? '，' + base.matName + ' ×' + base.got : '') +
      (base.mailed ? '（其中 ' + base.mailed + ' 枚背包已满，暂存信匣）' : '') + '。',
      base.mailed ? 'bad' : 'gold');
    if(floor % 10 === 0){
      const bonus = towerFloorGrant(floor, 1);
      log('🎁 第 ' + floor + ' 层层奖：再得一份本层奖励 · 灵石 +' + fmt(bonus.stone) +
        (bonus.got ? '，' + bonus.matName + ' ×' + bonus.got : '') +
        (bonus.mailed ? '（其中 ' + bonus.mailed + ' 枚暂存信匣）' : '') + '。', 'gold');
      srows.push(settleLine('层奖 · 灵石', '+' + fmt(bonus.stone), 'good'));
      if(bonus.got) srows.push(settleLine('层奖 · ' + bonus.matName, '+' + bonus.got, 'good'));
      const bd = towerBossGrant(floor);
      if(bd){
        log('👑 第 ' + floor + ' 层 Boss 专属 · ' + bd.name + ' ×' + bd.n +
          (bd.mailed ? '（其中 ' + bd.mailed + ' 枚暂存信匣）' : '') + '。', 'gold');
        srows.push(settleLine('Boss 专属 · ' + bd.name, '+' + bd.n + (bd.mailed ? '（部分入信匣）' : ''), 'good'));
        announce('稀有掉落', bd.name + ' ×' + bd.n);
      }
    }
    if(window.playLevelUpSound) playLevelUpSound();
    if(typeof Daily !== 'undefined') dailyBump('tower');
    sfx.win();
    S.tower = floor + 1;
    let eq = null;
    if(floor > S.towerMax){
      S.towerMax = floor;
      announce('塔层首通', (S.name || '一位道友') + ' 首通镇妖塔第 ' + floor + ' 层');
      eq = towerEqGrant(floor);
      if(eq) srows.push(settleLine('首通装备 · ' + eq.name, '战力 +' + fmt(eq.power || 0), 'good'));
      try{ if(window.NpcMemory) NpcMemory.record('cuijiu', '你登塔破了第 ' + S.towerMax + ' 层', 'combat'); }catch(e){}
      try{ if(window.NpcVisitQueue) NpcVisitQueue.push('cuijiu', 'congrats_max', '听闻你破了塔中纪录。老朽守塔几十年，少见这样的身手。'); }catch(e){}
    }
    showSettle({
      icon: isBoss ? '👑' : '⚔️',
      title: isBoss ? ('妖王伏诛 · 第 ' + floor + ' 层') : ('第 ' + floor + ' 层通关'),
      sub: first ? '首通 · 掉落逐项列账' : '再战 · 掉落逐项列账',
      rows: srows,
      note: '本层掉落逐项列明；背包满的部分已转入信匣。'
    });
    if(eq) appendEquipAction(eq);
    save(); render(); renderTower(); renderBag();
  }
  function towerFightCurrent(){
    resetTowerDay();
    const floor = towerNow();
    const need = towerPower(floor), cp = combatPower();
    if(cp < need){
      log('⚔️ 实力不济，请先去提升（第 ' + floor + ' 层守卫战力 ' + fmt(need) +
          '，你 ' + fmt(cp) + '，' + powerGapAdvice(cp, need) + '）。', 'bad');
      save(); render(); renderTower();
      return false;
    }
    if(btBusy) return false;
    markDayDec('risk');
    const rw = towerReward(floor);
    if(!battleAnim || !document.getElementById('battle-modal')){
      towerFloorSettle(floor, true);                 /* CI / 关演出：直接结 */
      return true;
    }
    const boss = floor % 10 === 0;
    const first = floor > S.towerMax;
    const mob = towerBeast(floor);
    openBattleAnim(floor, win => towerFloorSettle(floor, win), {
      title: '镇妖塔 · 第 <b id="bt-floor">' + floor + '</b> 层' +
        (boss ? ' · <span class="bt-boss-tag">妖王</span>' : '') + (first ? ' · 首战' : ' · 再战'),
      mob: boss ? Object.assign({}, mob, { name: '妖王 · ' + mob.name, boss: true }) : mob,
      mobPower: need,
      loot: { stone: rw.stone, mat: rw.mat, matN: 1 }
    });
    return true;
  }
  /* 门卡：一眼看出「打谁 / 差多少 / 给什么」。
     精锐门在战力不够时会「亮着但写清楚差多少」——这是本局唯一能按破防硬过的门，
     藏起来玩家就永远不知道还有这条路。 */
  function trunDoorHtml(k, floor, cp){
    const need = trunNeed(k, floor);
    const t = TDOOR[k];
    if(k === 'vault'){
      const herb = 20 + S.rank * 2;
      return '<button class="tw-door vault" data-door="vault">' +
        '<i>' + t.n + '</i>' +
        '<b>无需一战</b>' +
        '<span>灵石 ' + fmt(trunStone(Math.floor(needOf(S.rank) * 0.2))) + ' · 灵草/矿石 +' + herb + '</span>' +
        '<em>符 ×1 · 不推层</em></button>';
    }
    const short = cp < need;
    const can = cp >= need * TRUN.eliteMin;
    const brk = short && ((S.trun && S.trun.brk) | 0) > 0;
    const meta = ITEMS[trunMat(floor)] || {};
    const stone = trunStone(k === 'elite' ? Math.round(towerReward(floor).stone * TRUN.eliteStone) : towerReward(floor).stone);
    return '<button class="tw-door' + (can ? '' : ' off') + (k === 'elite' ? ' elite' : '') + '" data-door="' + k + '"' +
      (can ? '' : ' disabled') + '>' +
      '<i>' + t.n + '</i>' +
      '<b>' + (short ? '差 ' + fmt(need - cp) : '战力够') + '</b>' +
      '<span>灵石 ' + fmt(stone) + ' · ' + (meta.n || '材料') + ' ×' + trunMatN(floor, k) + '</span>' +
      '<em>' + (short ? (brk ? '需按破防' : '战力不足') : '推进一层') + (k === 'elite' ? ' · 符 ×1' : '') + '</em></button>';
  }
  function trunRunHtml(){
    const run = S.trun, floor = S.tower, cp = combatPower();
    const feng = run.charms.feng | 0, hu = run.charms.hu | 0;
    let h = '<div class="tw-run">';
    h += '<div class="tw-run-head"><span>入塔 · 第 <b>' + Math.min(run.step + 1, TRUN.steps) + '</b>/' + TRUN.steps + ' 步</span>' +
      '<span class="tw-charm">' + (feng ? '锋×' + feng + ' ' : '') + (hu ? '护×' + hu + ' ' : '') +
      (run.brk ? '破防×' + run.brk : (feng || hu ? '' : '无符')) + '</span></div>';
    h += '<div class="tw-doors">' + run.doors.map(k => trunDoorHtml(k, floor, cp)).join('') + '</div>';
    h += '<button class="tw-btn quit" data-act="quit">出塔 · 已得的留着</button>';
    h += '</div>';
    return h;
  }
  function trunLastHtml(){
    const L = S.trunLast;
    if(!L) return '';
    const why = L.why === 'done' ? '五步走完' : L.why === 'quit' ? '主动出塔' : '中道折戟';
    return '<div class="tw-last"><b>上一局 · ' + why + '</b>' +
      '<span>推进 ' + L.f + ' 层 · 灵石 ' + fmt(L.stone) + ' · 灵草 ' + fmt(L.herb) + ' · 矿石 ' + fmt(L.ore) +
      (L.mat ? ' · 材料 ×' + L.mat : '') + ' · 符 ×' + L.charm + '</span></div>';
  }
  /* ---------------- 崔九（守塔老卒，第 113 轮）：塔页内联对话 ----------------
     渲染只发生在两个时机：进塔页（cuijiuEnter，经 npcPageSync 路由钩子）、点话题（cuijiuPick）。
     绝不挂进 500ms 的 render() —— 与沈碑识人页同一纪律：对话是"读"的地方。
     cuijiuUi 是页面临时态：进入时的开场白快照、本次回复；只活内存、不落档，切走即清。
     结算一律走 js/npc_tower.js 的真实导出，这里不写任何关系/记忆规则；
     NpcTower 缺失（脚本被拦/加载失败）时整块静默收起，塔页其余功能不受影响。 */
  let cuijiuUi = null;
  /* 阶段四 C2-1（D3 批甲）：初见触发＝met===0 且主线 1-4「塔底有异」已记。
     两个条件都直读现有字段（S.npcs.cuijiu.met／S.story.claimed），零新增存档字段。
     与 W1 的两处门槛同源（worldFootCanDig 要 towerMax≥1、worldFootCanChoose 要 towerMax≥3
     或带护心镜），所以初见与「塔底那条线」在同一条进度带上，不会越序替人记数。
     逻辑层缺件（FIRST／npcFirstPick）时返 false，退回旧行为，不留死路。 */
  function cuijiuFirstOn(st){
    try{
      if(!st || !window.NpcTower || !NpcTower.FIRST || !NpcTower.npcFirstPick) return false;
      if((st.met | 0) !== 0) return false;
      return !!(S.story && S.story.claimed && S.story.claimed['1-4']);
    }catch(e){ return false; }
  }
  function cuijiuEnter(){
    const st = S.npcs && S.npcs.cuijiu;
    if(!st || !window.NpcTower){ cuijiuUi = null; renderCuijiu(); return; }
    const ctx = npcCtx();
    /* 关系引擎「进场前」结算（必须在 npcArrive 刷新 lastSeen 之前）：
       · decay：30 日冷落扣一次（P3 口径；真实入口触发）；
       · rebornEcho：转世弥合一句（P8；崔九没有 told，用 heard 判定，文案走 TEXT.REBORN）；
       · 塔纪录沿用既有 congrats_max 队列，不再新增 lastTower / RECORD_LINE（字段 8→7）。 */
    let echo = '';
    try{
      if(window.NpcRel){
        window.NpcRel.decay(st, ctx);
        echo = window.NpcRel.rebornEcho(st, ctx,
          { field: 'heard', text: (NpcTower.TEXT && NpcTower.TEXT.REBORN) || '' }) || '';
        /* 崔九没有 npcMarkReunion：弥合消费后把 seenGens 对齐到本世，
           否则每次进页都要靠 events 兜一次，状态也不一致。 */
        if(echo) st.seenGens = ctx.gens | 0;
      }
    }catch(e){ echo = ''; }
    /* 托付线进场结算：次日起 done、超 3 天 failed（先判失约，钉死第 3/4 天边界）。
       完成零数值；失约只 rel−8/冷 1 天，不增 attitude.rude。 */
    let questLine = '';
    try{
      if(window.NpcTower && typeof NpcTower.questTick === 'function'){
        const qr = NpcTower.questTick(st, ctx);
        if(qr && qr.done){
          questLine = 'done';
          log('📜 托付办成 · 他在册子后头另起了一页', 'good');
        }else if(qr && qr.failed){
          questLine = 'failed';
          try{ if(window.NpcRel) window.NpcRel.reprimand(st, 'rude', ctx); }catch(e){}
          log('📜 托付失约 · 他记住了。', 'bad');
        }
      }
    }catch(e){ questLine = ''; }
    /* 主动事件（第 114 轮）①触发：隔了 ≥3 天再来，老卒念叨一句。
       必须在 npcArrive 刷新 lastSeen 之前判断，否则永远不触发。 */
    try{
      if(window.NpcVisitQueue && st.lastSeen && (Date.now() - st.lastSeen >= 3*86400000)){
        NpcVisitQueue.push('cuijiu', 'back_days', '好些日子没见你上塔了。塔还是那座塔。');
      }
    }catch(e){}
    NpcTower.npcArrive(st, ctx) && save();   /* 到访即刷新 lastSeen；上面的 decay/reborn 一并落盘 */
    /* 主动事件（第 114 轮）②消费：进塔页时机 take 全部，文案快照进临时态；
       只在 enter 取，点话题（cuijiuPick）不重 take——与对话渲染同一事件驱动纪律。
       消费确认（审查 T-114 A1）：塔页模板未注入（greet 壳不在）就不 take，
       事件留在队列等下次真正渲染时消费——take 先于渲染失败会丢事件。 */
    let visits = [];
    try{
      const hostOk = !!document.getElementById('xx-cuijiu-greet');
      visits = (hostOk && window.NpcVisitQueue && NpcVisitQueue.pending('cuijiu').length) ? NpcVisitQueue.take('cuijiu').map(v => v.text) : [];
    }catch(e){ visits = []; }
    cuijiuUi = { greet: NpcTower.npcSay(st, ctx).greeting, visits: visits, reply: null, echo: echo, event: null, questLine: questLine };
    renderCuijiu();
    /* 塔页模板每次进页都是新 DOM：话题点击用容器级事件委托，绑一次。
       C2-1：初见选项走同一枚委托，按 data-cuijiu-first 分流（与 data-cuijiu 互不匹配）。 */
    const host = document.getElementById('xx-cuijiu-topics');
    if(host && !host.dataset.bound){
      host.dataset.bound = '1';
      host.addEventListener('click', ev => {
        const f = ev.target.closest('[data-cuijiu-first]');
        if(f){ cuijiuFirstPick(f.dataset.cuijiuFirst); return; }
        /* 关系事件选项：另起 data-cuijiu-event，不撞 [data-cuijiu] 计数断言。 */
        const e = ev.target.closest('[data-cuijiu-event]');
        if(e){ cuijiuEventChoose(e.dataset.cuijiuOpt); return; }
        const b = ev.target.closest('[data-cuijiu]');
        if(b) cuijiuPick(b.dataset.cuijiu);
      });
    }
  }
  /* 点话题：npcPick 结算 → 成功才 save 并刷新开场白快照（话题落账后旧事行立即生效） */
  function cuijiuPick(topicId){
    const st = S.npcs && S.npcs.cuijiu;
    if(!cuijiuUi || !st || !window.NpcTower) return false;
    const r = NpcTower.npcPick(st, topicId, npcCtx());
    if(!r || !r.ok) return false;
    save();
    cuijiuUi.greet = NpcTower.npcSay(st, npcCtx()).greeting;
    cuijiuUi.reply = r.text;   /* D2/P10：界面去计数，不再挂「（关系 +N）」 */
    /* D-006 M 项：记忆只进内存没落盘时如实说明（与沈碑同一口径，不改台词） */
    cuijiuUi.replyWarn = (r.memPersisted === false);
    if(cuijiuUi.replyWarn) log('⚠️ 这段记忆只留在本次会话里（本机存储写入失败），刷新后会淡去。', 'bad');
    renderCuijiu();
    const rep = document.getElementById('xx-cuijiu-reply');
    if(rep && !rep.hidden && rep.scrollIntoView){ try{ rep.scrollIntoView({ block:'nearest' }); }catch(e){} }
    return true;
  }
  /* 阶段四 C2-1（D3 批甲）：点初见选项。结算一律走 NpcTower.npcFirstPick，
     这里不写任何关系规则；成功后 met 已置 1，下一次 render 自然切回话题视图。
     D2（去计数）：回复只留台词，不再挂「（关系 +N）」。
     初见不落记忆（逻辑层已说明），故不产生 replyWarn。 */
  function cuijiuFirstPick(optionId){
    const st = S.npcs && S.npcs.cuijiu;
    if(!cuijiuUi || !st || !window.NpcTower || !NpcTower.npcFirstPick) return false;
    const r = NpcTower.npcFirstPick(st, optionId, npcCtx());
    if(!r || !r.ok) return false;
    save();
    cuijiuUi.greet = NpcTower.npcSay(st, npcCtx()).greeting;
    cuijiuUi.reply = r.text;   /* D2/P10：界面去计数，不再挂「（关系 +N）」 */
    cuijiuUi.replyWarn = false;
    renderCuijiu();
    const rep = document.getElementById('xx-cuijiu-reply');
    if(rep && !rep.hidden && rep.scrollIntoView){ try{ rep.scrollIntoView({ block:'nearest' }); }catch(e){} }
    return true;
  }
  /* 关系事件选项（E1–E3）：一次性结算走 NpcRel.applyEvent；成功后 stage/attitude/
     coldUntil/state 由引擎写，这里只负责存档、刷新开场白快照、重渲染。
     不写记忆、不计「今日社交」（P6 明定不动）、不给任何数值产出（崔九纪律）。 */
  function cuijiuEventChoose(optionId){
    const st = S.npcs && S.npcs.cuijiu;
    const ev = cuijiuUi && cuijiuUi.event;
    if(!cuijiuUi || !st || !ev || !window.NpcTower || !window.NpcRel) return false;
    const r = NpcRel.applyEvent(st, NpcTower.EVENTS3, ev.id, optionId, npcCtx());
    if(!r){
      cuijiuUi.reply = '（他没有接这句话。）';
      cuijiuUi.replyWarn = false;
      renderCuijiu();
      return false;
    }
    save();
    cuijiuUi.greet = NpcTower.npcSay(st, npcCtx()).greeting;
    cuijiuUi.reply = r.text;
    cuijiuUi.replyWarn = false;
    cuijiuUi.event = null;
    renderCuijiu();
    const rep = document.getElementById('xx-cuijiu-reply');
    if(rep && !rep.hidden && rep.scrollIntoView){ try{ rep.scrollIntoView({ block:'nearest' }); }catch(e){} }
    return true;
  }
  function renderCuijiu(){
    const st = S.npcs && S.npcs.cuijiu;
    const root = document.getElementById('xx-cuijiu-root');
    const g = document.getElementById('xx-cuijiu-greet');
    const topics = document.getElementById('xx-cuijiu-topics');
    const rep = document.getElementById('xx-cuijiu-reply');
    const vis = document.getElementById('xx-cuijiu-visit');
    const sub = document.getElementById('xx-cuijiu-sub');
    const lines = document.getElementById('xx-cuijiu-lines');
    if(!g || !topics || !rep) return;
    if(!st || !window.NpcTower){
      /* 整块收起（审查 T-113 第 1 条）：脚本缺失时不只清空内容，标题/hint 也不该露着 */
      if(root) root.hidden = true;
      g.textContent = ''; topics.textContent = ''; rep.hidden = true;
      if(vis){ vis.hidden = true; vis.textContent = ''; }
      if(sub) sub.textContent = '';
      if(lines) lines.textContent = '';
      return;
    }
    if(root) root.hidden = false;
    cuijiuUi = cuijiuUi || {};
    /* 阶段四 C2-1（D3 批甲）：初见上台时，开场白位改放两行底句，话题按钮整组让位给三个初见选项。
       NpcTower.FIRST / npcFirstPick 任一缺失就退回旧行为（话题可点），不留死路。 */
    const firstOn = cuijiuFirstOn(st);
    const firstCfg = firstOn ? NpcTower.FIRST : null;
    const ctx = npcCtx();
    /* 关系引擎（第二样本）：状态机 + 事件。初见与「还没见过」的指路态不受 away/seclusion
       影响——主线让人来，页面不能说他不在；状态机只作用于初见之后的日常对话。 */
    let relState = 'in', relEvent = null;
    try{
      if(window.NpcRel){
        relState = window.NpcRel.stateOf(st, ctx);
        if(relState === 'in') relEvent = window.NpcRel.nextEvent(st, ctx, NpcTower.EVENTS3 || null);
      }
    }catch(e){ relState = 'in'; relEvent = null; }
    const gate = (!firstCfg && (st.met | 0) >= 1) ? relState : 'in';
    cuijiuUi.event = relEvent;

    if(firstCfg){
      g.textContent = '';
      (firstCfg.lines || []).forEach(t => g.appendChild(npcNode('p', 'npc-greet-line', t)));
    }else if(gate === 'away' && NpcTower.TEXT){
      g.textContent = NpcTower.TEXT.AWAY;
    }else if(gate === 'seclusion' && NpcTower.TEXT){
      g.textContent = NpcTower.TEXT.SECLUSION;
    }else if(gate === 'bad' && NpcTower.TEXT){
      g.textContent = NpcTower.TEXT.BAD;
    }else{
      g.textContent = (cuijiuUi && cuijiuUi.greet) || '';
      /* 转世弥合（P8）：本页一次；翻旧账只按类别，不存原话。 */
      if(cuijiuUi.echo) g.textContent += ' ' + cuijiuUi.echo;
      try{
        const att = st.attitude || {};
        if((att.rude | 0) > 0) g.textContent += ' ' + ((NpcTower.TEXT && NpcTower.TEXT.ECHO_RUDE) || '');
        else if((att.open | 0) >= 2) g.textContent += ' ' + ((NpcTower.TEXT && NpcTower.TEXT.ECHO_OPEN) || '');
      }catch(e){}
    }
    /* 托付线（2026-11-16 批）：open 每次进页提醒；done/failed 只在结算当次出一句；
       不在/闭关时不追着说（等他人回来）。done 后的称呼变体由 npcSay 的 QUEST_ADDR 承担。 */
    if(!firstCfg && gate !== 'away' && gate !== 'seclusion' &&
       st.quest && st.quest.id === 'CQ_T1' && NpcTower.TEXT){
      if(st.quest.state === 'open'){
        g.textContent += ' ' + NpcTower.TEXT.QUEST_OPEN;
      }else if(cuijiuUi.questLine === 'done'){
        g.textContent += ' ' + NpcTower.TEXT.QUEST_DONE;
        cuijiuUi.questLine = '';          /* 当次一句，之后只留称呼变体 */
      }else if(cuijiuUi.questLine === 'failed'){
        g.textContent += ' ' + NpcTower.TEXT.QUEST_FAIL;
        cuijiuUi.questLine = '';
      }
    }
    /* 主动搭话行（第 114 轮）：仅展示 enter 时 take 到的快照，不重复消费队列 */
    if(vis){
      const list = (cuijiuUi && Array.isArray(cuijiuUi.visits)) ? cuijiuUi.visits : [];
      vis.textContent = '';
      list.forEach(t => {
        const p = npcNode('p', 'npc-greet-line', '（老卒朝你招了招手）' + t);
        vis.appendChild(p);
      });
      vis.hidden = list.length === 0;
    }
    /* D2/P10：界面去计数——副题整段移除。 */
    if(sub) sub.textContent = '';
    /* 收尾批二第 4 项：met=0 且主线 1-4 未记时的指路句。
       落点照旧（greet 之下、topics 之上的独立节点），刻意不塞进 greet 快照；
       状态收起时让位，避免「人不在还让你上塔」。 */
    if(topics && topics.parentNode){
      const oldGuide = document.getElementById('xx-cuijiu-guide');
      if(oldGuide) oldGuide.remove();
      if(!firstCfg && gate === 'in' && (st.met | 0) < 1 && !(S.story && S.story.claimed && S.story.claimed['1-4'])){
        const guide = npcNode('p', 'npc-greet-line', '先上塔，打到第三层。下来了，老朽就跟你说话。');
        guide.id = 'xx-cuijiu-guide';
        topics.parentNode.insertBefore(guide, topics);
      }
    }
    /* 事件行：独立容器，不污染 greet 快照；一次性由 NpcRel 守。 */
    if(lines){
      lines.textContent = '';
      if(relEvent && !firstCfg){
        lines.appendChild(npcNode('p', 'npc-topic-name', relEvent.line));
      }
    }
    topics.textContent = '';
    if(firstCfg){
      /* 初见三选项：另起 data-cuijiu-first，刻意不复用 data-cuijiu，免得撞话题计数断言。 */
      (firstCfg.options || []).forEach(o => {
        const b = npcNode('button', 'mc-opt npc-opt', o.label);
        b.type = 'button';
        b.dataset.cuijiuFirst = o.id;
        topics.appendChild(b);
      });
    }else if(gate === 'away' || gate === 'seclusion'){
      /* 人不在/闭关：话题整组收起，只留开场那句（上面已写）。 */
    }else{
      const say = NpcTower.npcSay(st, ctx);
      /* 事件选项：另起 data-cuijiu-event / data-cuijiu-opt，不撞 [data-cuijiu] 计数。 */
      if(relEvent){
        (relEvent.options || []).forEach(o => {
          const b = npcNode('button', 'mc-opt npc-opt', o.label);
          b.type = 'button';
          b.dataset.cuijiuEvent = '1';
          b.dataset.cuijiuOpt = o.id;
          topics.appendChild(b);
        });
      }
      (say.topics || []).forEach(t => {
        const heard = (st.heard || []).indexOf(t.id) >= 0;
        const locked = (t.unlocked === false);
        /* 冷脸只关深话（ct3 旧年 / ct6 断剑）；ct1/ct2 仍可谈，别把「可失去」写成「翻脸」。 */
        const badBlock = (gate === 'bad' && (t.id === 'ct3' || t.id === 'ct6'));
        const tail = badBlock ? '（他今天不想说）' : (locked ? (t.lockHint || '') : '');
        const b = npcNode('button', 'mc-opt npc-opt',
          t.text + (heard ? ' · 回忆' : '') + tail);
        b.type = 'button';
        b.dataset.cuijiu = t.id;
        if(locked || badBlock || (st.met | 0) < 1) b.disabled = true;
        topics.appendChild(b);
      });
    }
    if(cuijiuUi && typeof cuijiuUi.reply === 'string' && cuijiuUi.reply){
      rep.hidden = false;
      rep.textContent = cuijiuUi.reply;
      if(cuijiuUi.replyWarn){
        const warn = npcNode('small', 'npc-reply-d', '（这段记忆未能留存 · 本机存储写入失败）');
        warn.style.color = '#a33';
        rep.appendChild(warn);
      }
    } else {
      rep.hidden = true;
      rep.textContent = '';
    }
  }

  function renderTower(){
    const box = document.getElementById('xx-tower');
    if(!box) return;
    resetTowerDay();
    const cp = combatPower();
    const running = trunOn();                       /* 旧档/旧测试兼容：仅旧局进行中才走五步 */
    const floorNow = running ? S.tower : towerNow();
    const needShown = towerPower(floorNow);
    const canSweep = Math.max(0, S.towerMax);
    let html = '<div class="tw-head">' + inkIco('⚔️') + '战力 <b>' + fmt(cp) + '</b> · 第 <b>' + floorNow + '</b> 层</div>';
    html += '<div class="tw-floor">' +
      '<div class="tw-fl"><span>当前层</span><b>' + floorNow + '</b></div>' +
      '<div class="tw-fl"><span>守卫战力</span><b>' + fmt(needShown) + '</b></div>' +
      '<div class="tw-fl"><span>已通关最高</span><b>' + S.towerMax + '</b></div>' +
      '</div>';
    if(running){
      html += trunRunHtml();
    } else {
      const mob = towerBeast(floorNow);
      const rw = towerReward(floorNow);
      const canWin = cp >= needShown;
      html += '<div class="tw-mob">' +
        '<img src="' + mob.img + '"' + beastImgStyle(mob) + ' alt="">' +
        '<div class="tw-mob-main"><span class="tw-mob-tier">' + (BEAST_TIER_NAME[mob.tier] || '') + '</span>' +
        '<b>' + mob.name + '</b></div>' +
        (floorNow % 10 === 0 ? '<span class="tw-mob-bonus">10 层层奖</span>' : '') + '</div>';
      html += '<div class="tw-rew">本层奖励：灵石 ' + fmt(rw.stone) + ' + ' + ((ITEMS[rw.mat] || {}).n || '') + ' ×1' +
        (floorNow % 10 === 0 ? ' · 另加一份层奖' : '') + '</div>';
      if(floorNow % 10 === 0){
        const bd = TOWER_BOSS_DROP[Math.min(5, Math.max(1, Math.ceil(floorNow / 10)))];
        if(bd) html += '<div class="tw-rew tw-boss-drop">Boss 专属：' + ((ITEMS[bd.id] || {}).n || bd.id) + ' ×' + bd.n + '</div>';
      }
      html += '<button class="tw-btn' + (canWin ? '' : ' off') + '" data-act="fight"' + (canWin ? '' : ' disabled') + '>' +
        (canWin ? inkIco('⚔️') + '挑战第 ' + floorNow + ' 层' : inkIco('⚔️') + '战力不足（差 ' + fmt(needShown - cp) + '）') + '</button>';
    }
    html += '<button class="tw-btn sweep" data-act="sweep"' + (canSweep <= 0 || S.towerSwept >= canSweep ? ' disabled' : '') + '>' +
      (canSweep <= 0 ? '🏯 暂无可扫层'
        : (S.towerSwept >= canSweep ? '🏯 今日已扫完（' + canSweep + ' 层）' : '🏯 扫荡 ' + canSweep + ' 层')) + '</button>';
    /* 切片 2f：沈碑「山外」那句听过之后，塔底这件事在塔页也留一条题记（节点恒在，hidden 由 npcEcho 现算） */
    html += '<p class="hint" id="npc-echo-tower" hidden></p>';
    /* W1「塔底」：局外才给发现入口与抉择（正在塔里五步时不插队，免得和门挤在同一屏） */
    if(!running) html += worldFootHtml();
    html += running
      ? '<p class="hint">旧局进行中：一局五步，每步三扇门；出塔后转为逐层挑战。</p>'
      : '<p class="hint">逐层向上：胜则进一层，败则原地 · 每层首通给灵石＋材料 · 每 10 层额外再给一份本层奖励 · 每日可扫荡已通关层，拿 ' +
        Math.round(BAL.towerSweepRatio * 100) + '% 首通奖励</p>';
    if(box.dataset.sig !== html){
      box.dataset.sig = html;
      box.innerHTML = html;
      npcEcho('npc-echo-tower', 'stele4');
    }
    // D-003: 塔楼区容器级事件委托
    if (!box.dataset.d_binded) {
      box.dataset.d_binded = '1';
      box.addEventListener('click', ev => {
        const t = ev.target.closest('[data-act]');
        if (t) {
          if (t.dataset.act === 'fight') towerFightCurrent();
          else if (t.dataset.act === 'sweep') sweepTower();
          else if (t.dataset.act === 'run') towerRunStart();     /* 旧档兼容，新 UI 无此入口 */
          else if (t.dataset.act === 'quit') towerRunQuit();
          return;
        }
        const f = ev.target.closest('[data-foot]');
        if (f) { ev.stopPropagation(); f.dataset.foot === 'dig' ? worldFootDig() : worldFootChoose(f.dataset.foot); return; }
        const w2 = ev.target.closest('[data-w2]');
        if (w2) { ev.stopPropagation(); worldAfterMark(w2.dataset.w2); return; }
        const d = ev.target.closest('[data-door]');
        if (d) { ev.stopPropagation(); towerRunDoor(d.dataset.door); return; }
        const w3 = ev.target.closest('[data-w3]');
        if (w3) { ev.stopPropagation(); if (w3.dataset.w3 === 'go-stele' && window.ROUTER && ROUTER.open) ROUTER.open('role', 'xx-role-npc'); return; }
      });
    }
  }

  /* 猎妖/任务列表的内容签名缓存。
     背景：tickLoop 的渲染门控有「uiIdleTicks >= 2」兜底，即使画面完全静止也至少每 1 秒
     跑一次 render()，而 renderHunt/renderQuest 都是整表 innerHTML 重建 +
     给每个新按钮挂监听 → 每秒产生数百个 DOM 节点与等量闭包，持续 GC 与样式重算。
     守卫用「容器元素身份 + 内容签名」双条件（照抄 renderMarket 的 mkBox 口径）：
     只判 firstChild 不够——容器里若有任何不相干子节点就会误判成"已渲染"而跳过。 */
  let huntSig = '', questSig = '', huntBox = null, questBox = null;
  function renderHunt(){
    const box = document.getElementById('xx-hunt');
    if(!box) return;
    const cp = combatPower();
    /* 逐境显妖（2026-11-17 制作人反馈）：只把「本境可猎」摆出来，往期收进折叠、
       未来境界不进画面。DOM 仍保留全表 43 只（既有测试与一键最强按全表口径），
       只是未来段 hidden、本境里境界未到的行加 .rank-future 由 CSS 隐藏。
       零数值/零存档改动；curTier 由 BEASTS 表各 tier 的最低 rank 推出来。 */
    const tierMin = t => BEASTS.reduce((m, b) => (b.tier === t && b.rank < m ? b.rank : m), 99);
    let curTier = 1;
    for(let t = 2; t <= 5; t++){ if(S.rank >= tierMin(t)) curTier = t; }
    const active = S.huntBeast ? BEASTS.find(b => b.id === S.huntBeast) : null;
    const openPast = !!(active && active.tier < curTier);   /* 正在猎往期兽：自动展开，保证能看到「停止」 */
    const rowHtml = b => {
      const unlocked = S.rank >= b.rank;
      const canHunt = unlocked && cp >= b.power;
      const hunting = S.huntBeast === b.id;
      const bossTag = b.boss ? '<span class="hunt-boss">BOSS</span>' : '';
      const firstDone = b.boss && S.bossKilled[b.id];
      const imgStyle = beastImgStyle(b);
      const rv4Drop = RV4_MAT_BY_BEAST[b.id];
      const dropTxt = ((ITEMS[b.drop] || {}).n || '') +
        (rv4Drop ? ' · 专属「' + rv4Drop.n + '」' + Math.round(rv4Drop.rate * 100) + '%' : '');
      return '<div class="hunt-row' + (hunting ? ' hunting' : '') + (b.boss ? ' boss' : '') +
        (unlocked ? '' : ' rank-future') + (unlocked && !canHunt && !hunting ? ' power-future' : '') + '">' +
        '<img src="' + b.img + '"' + imgStyle + ' alt=""><div class="hunt-main"><b>' + b.name + '</b>' + bossTag +
        '<small>战力 ' + fmt(b.power) + ' · 掉' + dropTxt + (b.boss ? ' · 稀有' : '') + (firstDone ? ' · 已首通' : '') + '</small></div>' +
        (hunting ? '<button class="hunt-btn stop" data-hunt="stop">停止</button>'
          : unlocked ? '<button class="hunt-btn" data-hunt="' + b.id + '"' + (canHunt ? '' : ' disabled') + '>' + (canHunt ? '猎杀' : '战力不足') + '</button>'
          : '<span class="hunt-lock">' + RANK_NAMES[b.rank] + '解锁</span>') +
        '</div>';
    };
    const tierBlock = t => {
      const list = BEASTS.filter(b => b.tier === t);
      if(!list.length) return '';
      return '<div class="hunt-tier' + (t >= 5 ? ' t5' : '') + '">' + BEAST_TIER_NAME[t] + '</div>' + list.map(rowHtml).join('');
    };

    let html = '<div class="hunt-power"><span>⚔️ 战力 <b>' + fmt(cp) + '</b></span>' +
      '<button class="hunt-best" data-best="1">' + inkIco('⚡') + '一键最强</button>' +
      (S.huntBeast ? '<span class="hunt-now">历练中</span>' : '') + '</div>';

    /* 本境：只露「境界已到 + 战力稳胜」的行；未到的行留在 DOM（.rank-future /
       .power-future）但不显示。一只都打不过时，只给一句最近目标，不铺一排“战力不足”。 */
    const curList = BEASTS.filter(b => b.tier === curTier);
    const curReady = curList.filter(b => S.rank >= b.rank && cp >= b.power);
    html += '<div class="hunt-tier current' + (curTier >= 5 ? ' t5' : '') + '">' + BEAST_TIER_NAME[curTier] + '</div>';
    if(!curReady.length){
      const target = curList.filter(b => S.rank >= b.rank).sort((a, b) => a.power - b.power)[0] || curList[0];
      if(target){
        html += '<div class="hunt-target">本境暂无可稳胜妖兽 · 最近目标：<b>' + target.name +
          '</b>（战力 ' + fmt(target.power) + '，差 ' + fmt(Math.max(0, target.power - cp)) + '）</div>';
      }
    }
    html += curList.map(rowHtml).join('');

    /* 往期：默认折叠成一句；点开可回猎旧材料 */
    const pastList = BEASTS.filter(b => b.tier < curTier);
    if(pastList.length){
      html += '<details class="hunt-past"' + (openPast ? ' open' : '') + '><summary>往期妖兽 · ' + pastList.length + ' 只（点开可猎旧材料）</summary>';
      for(let t = 1; t < curTier; t++) html += tierBlock(t);
      html += '</details>';
    }

    /* 未来：只留一句「下一境」；全表仍渲染在 hidden 容器里供测试/一键最强读全表 */
    if(curTier < 5){
      const nt = curTier + 1, nr = tierMin(nt);
      html += '<div class="hunt-next"><b>下一境 · ' + BEAST_TIER_NAME[nt] + '</b><span>' + (RANK_NAMES[nr] || ('第 ' + nr + ' 境')) + '解锁</span></div>';
      html += '<div class="hunt-future" hidden>';
      for(let t = nt; t <= 5; t++) html += tierBlock(t);
      html += '</div>';
    }

    if(html === huntSig && box === huntBox && box.firstChild) return;   /* 内容与容器都没变：保留原节点与已绑监听 */
    huntSig = html; huntBox = box;
    box.innerHTML = html;
    const bestBtn = box.querySelector('.hunt-best');
    if(bestBtn) bestBtn.addEventListener('click', huntStrongest);
    box.querySelectorAll('.hunt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if(btn.dataset.hunt === 'stop') stopHunt();
        else startHunt(btn.dataset.hunt);
      });
    });
  }
  function renderQuest(){
    const box = document.getElementById('xx-quest');
    if(!box) return;
    const list = questList();
    let html = '';
    /* 2026-11-19 UI 第二批：主线 + 今日日课 + 长线道碑三段，不再是“只有一条主线”。 */
    html += '<div class="q-sec-h">主线 · 断天门<span>' + (list.length ? '进行中' : '已走完') + '</span></div>';
    if(!list.length){
      html += '<p class="quest-none">主线已全部完成。飞升之后，可转世重修，再走一遭。</p>';
    }else{
      list.forEach(({ q, main }) => {
        const done = questDone(q);
        const prog = questProgress(q);
        const pct = Math.max(0, Math.min(100, prog / q.goal.n * 100));
        const ql = questProgressLabel(q, prog, { rank: S.rank });
        html += '<div class="quest' + (main ? ' quest-main' : ' quest-side') + (done ? ' anchor-ready' : '') + '">' +
          '<div class="q-head"><b>' + (main ? inkIco('📜') + '主线' : '🎋 支线') + ' · ' + q.title + '</b>' +
          '<span class="q-reward">' + q.rtxt + '</span></div>' +
          (q.story ? '<p class="q-story">' + q.story.replace(/\n/g, '<br>') + '</p>' : '') +
          '<div class="q-prog"><div class="q-track"><i style="width:' + pct + '%"></i></div>' +
          '<span>' + fmt(prog) + ' / ' + fmt(q.goal.n) + (ql.unit ? ' ' + ql.unit : '') + '</span></div>' +
          (ql.hint ? '<div class="q-hint">' + ql.hint + '</div>' : '') +
          (done ? '<button class="q-btn" data-q="' + q.id + '">领取奖励</button>' : '') +
          '</div>';
      });
    }
    /* 今日 · 日课 */
    if(typeof Daily !== 'undefined' && Daily.list){
      const tasks = Daily.list();
      html += '<div class="q-sec-h">今日 · 日课<span>' +
        '已达成 ' + tasks.filter(t => t.done).length + ' / ' + tasks.length + ' 项 · 满进度算 1 项</span></div>';
      tasks.forEach(t => {
        const pct = Math.max(0, Math.min(100, t.prog / t.goal * 100));
        html += '<div class="q-mile' + (t.claimed ? ' got' : '') + (t.done && !t.claimed ? ' anchor-ready' : '') + '">' +
          '<div class="q-mile-main"><b>' + t.icon + ' ' + t.name + '</b>' +
          '<div class="q-track"><i style="width:' + pct.toFixed(1) + '%"></i></div></div>' +
          (t.claimed ? '<span class="q-mile-p">已领</span>'
            : (t.done ? '<button class="q-btn small" data-daily="' + t.id + '">领取</button>'
              : '<span class="q-mile-p">' + fmt(t.prog) + ' / ' + fmt(t.goal) + '</span>')) +
          '</div>';
      });
    }
    /* 长线 · 道碑（最近三块未立） */
    if(typeof MILES !== 'undefined' && MILES.length){
      const left = MILES.filter(m => !(S.miles && S.miles[m.id]));
      if(left.length){
        html += '<div class="q-sec-h">长线 · 道碑<span>未立 ' + left.length + ' 块</span></div>';
        left.slice(0, 3).forEach(m => {
          html += '<div class="q-mile"><div class="q-mile-main"><b>' + m.n + '</b>' +
            '<small class="q-mile-h">' + m.h + '</small></div><span class="q-mile-p">未立</span></div>';
        });
      }
    }
    if(html === questSig && box === questBox && box.firstChild) return;   /* 内容与容器都没变：保留原节点与已绑监听 */
    questSig = html; questBox = box;
    box.innerHTML = html;
    box.querySelectorAll('.q-btn[data-q]').forEach(b => {
      b.addEventListener('click', () => claimQuest(b.dataset.q));
    });
    box.querySelectorAll('[data-daily]').forEach(b => {
      b.addEventListener('click', ev => {
        ev.stopPropagation();
        if(b.disabled) return;
        b.disabled = true;
        Promise.resolve(Daily.claim(b.dataset.daily)).then(r => {
          b.disabled = false;
          if(r && r.ok){ sfx.win(); settleDailyClaim(r); render(); renderQuest(); try{ renderEvent(); }catch(e){} renderBag(); }
          else log((r && r.msg) || '领取失败', 'bad');
        }, () => { b.disabled = false; log('领取失败，请重试。', 'bad'); });
      });
    });
  }
  /* A61：背包格子每 500ms 被整表重绘，mousedown/mouseup 跨一次重建会吞掉点击。
     内容没变就不重建（与 renderMarket 的 mkBox/mkSig 同款范式）。 */
  let bagBox = null, bagSig = '';
  function renderBag(){
    const box = document.getElementById('xx-bag');
    if(!box){ bagBox = null; bagSig = ''; return; }
    let html = '';
    const cap = bagCap();
    /* 主洞改奉后容量可能变小，已有物品不能从格子里消失（读档与显示口径一致） */
    const slots = Math.max(cap, S.bag.length);
    for(let i = 0; i < slots; i++){
      const it = S.bag[i];
      if(it){
        const meta = ITEMS[it.t] || {};
        const icoHtml = '<img src="' + (meta.img || 'ui/icons/ic_box.png') + '" alt="' + it.n + '">';
        const q = bagQtyOf(it);
        html += '<div class="bag-cell" data-i="' + i + '">' +
          '<span class="bag-ico">' + icoHtml + (q > 1 ? '<i class="bag-qty">×' + q + '</i>' : '') + '</span>' +
          '<span class="bag-name' + (meta.cls ? ' ' + meta.cls : '') + '">' + it.n + '</span></div>';
      }else{
        html += '<div class="bag-cell empty"></div>';
      }
    }
    if(box !== bagBox || html !== bagSig){
      bagBox = box; bagSig = html;
      box.innerHTML = html;
    }
    box.classList.toggle('bag-empty', S.bag.length === 0);
    const capEl = document.getElementById('xx-bag-cap');
    if(capEl){
      const bonus = Math.round(dtBagN());
      const over = Math.max(0, S.bag.length - cap);
      let totalItems = 0;
      for(let i = 0; i < S.bag.length; i++) totalItems += bagQtyOf(S.bag[i]);
      capEl.textContent = '已用 ' + S.bag.length + ' / 容量 ' + cap +
        (bonus > 0 ? '（洞天 +' + bonus + '）' : '') +
        (over > 0 ? '（超 ' + over + ' 格）' : '') +
        ' · 共 ' + totalItems + ' 件';
      capEl.classList.toggle('over', over > 0);
    }
    const buyEl = document.getElementById('xx-bag-buy');
    if(buyEl){
      if(S.bagSize >= BAG_CAP){ buyEl.disabled = true; buyEl.textContent = '背包已满级'; }
      else{ buyEl.disabled = S.stone < bagCost(); buyEl.textContent = '储物袋 +' + BAG_STEP + ' 格 · 灵石 ' + fmt(bagCost()); }
    }
    renderOverflow();
    syncBagDot();
  }
  function renderCd(){
    /* 藏经阁行动区 + 洞府场景行动区共用一套冷却/次数刷新 */
    [document.getElementById('xx-actions'), document.getElementById('sc-acts')].forEach(box => {
      if(!box) return;
      ensureActs();
      ensureDay();
      Array.from(box.children).forEach(btn => {
        const k = btn.dataset.k;
        const left = cdLeft(k);
        const limit = BAL.actLimit[k] || 0;
        const leftN = Math.max(0, limit - S.acts[k]);
        btn.disabled = left > 0 || leftN <= 0;   /* 冷却中 或 今日次数用完 都禁用 */
        const small = btn.querySelector('small');
        let cdEl = btn.querySelector('.cd');
        if(left > 0){
          if(!cdEl){
            cdEl = document.createElement('span');
            cdEl.className = 'cd';
            btn.appendChild(cdEl);
          }
          cdEl.textContent = '冷却 ' + Math.ceil(left / 1000) + 's';
        }else if(cdEl){
          cdEl.remove();
        }
        if(small){
          if(k === 'sit'){
            /* W1 修 B：打坐副文显示本次实得与今日档位，避免降档后仍写「+10 秒」。 */
            ensureDay();
            const eff = activeEff();
            const got = Math.max(expRate() * 10, needOf(S.rank) * 0.002) * eff;
            const pct = Math.round(Math.min(999, (S.day.expGain / Math.max(1, activeBudget())) * 100));
            small.dataset.base = '修为 +' + fmt(got) + '（今日主动 ' + pct + '% · 效率 ' + Math.round(eff * 100) + '%）';
          }
          if(k === 'ponder') small.dataset.base = '灵石 ' + fmt(ponderCost());
          /* A16：冷却中不再清空副文——基础说明与今日剩余次数仍应可见，倒计时由 .cd 单独显示 */
          const sub = cdSubtitle({ base: small.dataset.base, limit: limit, acts: S.acts[k], k: k });
          small.textContent = sub.text;
        }
      });
    });
  }
  /* 随机事件 */
  let nextEvent = 0;
  function maybeEvent(){
    const now = Date.now();
    if(!nextEvent) nextEvent = now + 25000;
    if(now < nextEvent) return;
    nextEvent = now + 22000 + Math.random() * 20000;
    const roll = Math.random();
    if(roll < 0.30){
      const v = expRate() * (60 + Math.random() * 120);
      S.exp += v;
      log('🌸 后山落下灵雨，修为 +' + fmt(v), 'good');
    }else if(roll < 0.55){
      const v = stoneRate() * (80 + Math.random() * 160) + 5;
      S.stone += v;
      log('💰 山道捡到一只储物袋，灵石 +' + fmt(v), 'good');
    }else if(roll < 0.72){
      const v = expRate() * 45;
      S.exp += v;
      log('📜 云游老道指点两句，瓶颈松动了些，修为 +' + fmt(v), 'sys');
    }else if(roll < 0.90){
      const lose = Math.min(S.stone * 0.15, stoneRate() * 120);
      S.stone = Math.max(0, S.stone - lose);
      log('🩸 魔修劫道，灵石被抢走 ' + fmt(lose), 'bad');
    }else{
      S.exp += expRate() * 40 * (1 + S.dao * 0.3);
      log('🌀 天有异象，你隐约看见前世一角……', 'gold');
    }
    save();
  }

  /* 生命周期 */
  /* D 阶段 · 渲染节流辅助（集群1）：仅作周期性渲染门控，不改动任何业务渲染逻辑。
     uiSignature 覆盖主要易变数值/计数；非签名状态靠 uiIdleTicks>=2（~1 秒）兜底刷新，杜绝卡死/久滞。
     requestRender 供异步路径（NPC 来访、主线红点等）强制下次 tick 渲染，避免遗漏。 */
  function uiSignature(){
    try{
      /* R2/R3：明确数值规范化，避免 |0 截断（小数/超 32 位）与对象 join 碰撞 */
      const sigNum = x => {
        if(typeof x !== 'number' || !isFinite(x)) return (x == null ? 0 : (typeof x === 'object' ? 'O' : String(x)));
        if(x > 1e15 || x < -1e15) return 'B';          /* 超大数用粗桶，保证变化可被感知 */
        return Math.round(x);
      };
      /* R1：签名纳入数组“内容”信号，而非仅长度——背包总数量、信件未读数、灵兽等级+经验和 */
      let bagQty = 0; for(let i = 0; i < S.bag.length; i++) bagQty += bagQtyOf(S.bag[i]);
      let letterUnread = 0; if(S.letters) for(let i = 0; i < S.letters.length; i++) if(!S.letters[i].open) letterUnread++;
      let petSum = 0; for(let i = 0; i < S.pets.length; i++) petSum += (S.pets[i] ? sigNum(S.pets[i].lv) + sigNum(S.pets[i].exp) : 0);  /* R2 残留闭合：与 sigNum 统一归一，避免 |0 截断/溢出 */
      return [ S.rank, sigNum(S.exp), sigNum(S.stone), sigNum(S.cave), sigNum(S.dan), sigNum(S.forge),
               S.bag.length, bagQty, S.eggs.length, S.pets.length, petSum,
               (S.sign ? S.sign.days : 0), sigNum(S.wisdom), S.petSlots, S.bagSize,
               (S.union ? S.union.left : 0), (S.shop ? S.shop.heart_mirror : 0), letterUnread ].join('|');
    }catch(e){
      /* R4：稳定错误标记（非随机），异常期间退化为“每 ~1 秒兜底渲染”，不会每 tick 高频重绘 */
      if(!uiSigErr){ uiSigErr = true; try{ console.warn('[uiSignature] 异常，已退化为兜底渲染:', e && e.message); }catch(_){} }
      return 'UI_SIG_ERR';
    }
  }
  function requestRender(){ uiSig = ''; uiIdleTicks = 99; }
  /* R8：异步 UI 变更（NPC 来访 / 奇遇气泡 / 主线结算等）显式打标，
     强制下一 tick 多渲染一次——只多一次，不破坏"状态签名 / 1 秒兜底"的节流。
     R5 取舍：requestRender / markAsyncDirty 作为全局 escape hatch，而非全量事件委托；
     模块局部状态由全局写属可控（tickLoop 单线程持有渲染门控），全量委托留待后续 Wave。 */
  function markAsyncDirty(){ asyncDirty = true; }
  if(typeof window !== 'undefined'){ window.requestRender = requestRender; window.markAsyncDirty = markAsyncDirty; }
  /* 主循环错误隔离（双层）。
     背景：setInterval(tickLoop,500) 原先没有任何 try/catch，
     tick/render/checkMiles 任一抛异常会让后续逻辑（含末尾 save）全部跳过，
     且每 500ms 复现 → 界面永久静止、存档停摆，玩家只能刷新。
     第一层 loopSafe：子系统级——一个子系统坏了不影响其他子系统。
     第二层 tickLoop 外层 try/finally：连**循环头**（Date.now / offlineCapSec / S.last）抛错
     也有人兜，并且 finally 里仍然尝试存档，保证"业务失败也不 quiet 掉玩家进度"。
     ⚠️ save 必须在业务之后：不能提到最前，否则存的是本轮变更之前的旧状态。 */
  function loopSafe(tag, fn){
    try{ return fn(); }
    catch(e){ try{ console.error('[tickLoop]', tag, e); }catch(_){} return undefined; }
  }
  function tickLoop(){
    try{
      tickLoopBody();
    }catch(e){
      try{ console.error('[tickLoop:fatal]', e); }catch(_){}
    }finally{
      /* 尽力存档：即使本轮业务整段炸掉，也要把已经发生的状态变更落盘。
         lastSave 只在**保存成功**之后才推进——否则一次保存失败会被记成"已保存"，
         3 秒节流就会一直空转。 */
      try{
        const now2 = Date.now();
        if(now2 - lastSave > 3000){
          if(save() !== false) lastSave = now2;
        }
      }catch(e){
        try{ console.error('[tickLoop:save]', e); }catch(_){}
      }
    }
  }
  /* 第三批 B6：被动产出的低频合并飘字（8 秒一窗，最多一条；不逐 tick 刷屏） */
  let passFloatAt = 0, lastRipe = 0;
  const passAcc = { exp: 0, stone: 0, ore: 0 };
  function passFloatTick(){
    const now = Date.now();
    if(document.hidden) return;
    if(now - passFloatAt < 8000) return;
    const e = Math.floor(passAcc.exp), s = Math.floor(passAcc.stone), o = Math.floor(passAcc.ore);
    const ripe = ripeCount();
    const ripeNew = ripe > lastRipe;         /* P0：灵田由「不可收」变「可收」时才提示一次 */
    if(e + s + o <= 0 && !ripeNew){ lastRipe = ripe; return; }
    passFloatAt = now;
    passAcc.exp = 0; passAcc.stone = 0; passAcc.ore = 0;
    const parts = [];
    if(e > 0) parts.push('修为 +' + fmt(e));
    if(s > 0) parts.push('灵石 +' + fmt(s));
    if(o > 0) parts.push('矿石 +' + fmt(o));
    if(ripeNew) parts.push('灵田 ' + ripe + ' 株可收');
    lastRipe = ripe;
    gainChip('🌿 ' + parts.join(' · '), '');
  }
  function tickLoopBody(){
    const now = Date.now();
    let dt = (now - S.last) / 1000;
    if(!isFinite(dt) || dt < 0) dt = 0;
    /* 第 71 节：挂回来的时长与 offline() 用同一条封顶线，否则开着页面挂一夜，
       反而不如关掉重开收得多 */
    const cap = offlineCapSec();
    if(dt > cap) dt = cap;
    S.last = now;
    loopSafe('tick', () => tick(dt));
    loopSafe('passFloat', passFloatTick);
    loopSafe('lingchao', lingchaoTick);
    loopSafe('trail', trailTick);                      /* 入门八事：条件可能由挂机本身满足（猎妖/破境） */
    loopSafe('trace', traceUiTick);                    /* 妖踪倒计时/过期（只活体） */
    loopSafe('miles', checkMiles);
    loopSafe('story', () => { if(typeof Story !== 'undefined') Story.tick(); });  /* 主线红点/面板联动（内部 3 秒节流） */
    loopSafe('npcVisit', npcVisitTick);                /* 沈碑主动来访：门控全过才判定（60 秒节流） */
    loopSafe('event', maybeEvent);
    loopSafe('enc', encTick);
    loopSafe('render', () => {
      if(!document.hidden){
        uiIdleTicks++;
        const sig = uiSignature();
        if(sig !== uiSig || uiIdleTicks >= 2 || asyncDirty){   /* 状态变了 / 兜底每 ~1 秒 / 异步显式请求，削减空转重建 → 缓解吞点击 */
          uiSig = sig; uiIdleTicks = 0; asyncDirty = false;
          render(); renderCd();
        }
      }
    });
    /* 注：周期性落盘已移交给 tickLoop 的 finally（保存成功才推进 lastSave），
       这里不再重复 save —— 否则一轮会写两次盘，且 lastSave 的推进语义会分裂。 */
  }
  /* ---------- 角色创建（立绘选性别） ---------- */
  let charSex = 'm', needNewGame = false;
  let charPath = '';          /* P1-C：创角/编辑时暂存的道途选择（D1=(a) 创角必选） */
  let charEditing = false;    /* P1-C：区分创角必选与老档补选的提示文案 */
  let pathLocked = false;     /* P1-C：编辑已有合法道途时为 true，道途选择器只读（终身道途，禁止转职） */
  const CHAR_ACT_TITLE = { '1':'序章 · 测灵台', '2':'黑碑异象', '3':'问心择道', edit:'更改角色' };
  /* 三幕只切显隐；姓名/性别/道途仍只 confirmChar 落档，返回上一幕不写任何字段。 */
  function setCharAct(act){
    const modal = document.getElementById('char-modal');
    if(!modal) return;
    modal.dataset.act = act;
    const title = modal.querySelector('.char-title');
    if(title) title.textContent = CHAR_ACT_TITLE[act] || CHAR_ACT_TITLE['1'];
    if(act === '2'){
      const card = modal.querySelector('.char-card');
      if(card){
        card.classList.remove('char-omen-enter');
        void card.offsetWidth;                 /* 重触发一次克制微震动，不循环 */
        card.classList.add('char-omen-enter');
      }
    }
  }
  /* 性别键与展示名。sex 是存档里的旧值（m/f），gender 是新的显式字段（male/female），两者同源 */
  const SEX_OPTS = [
    { sex: 'm', gender: 'male', name: '男修', hint: '剑眉星目，青竹般挺拔' },
    { sex: 'f', gender: 'female', name: '女修', hint: '云鬓花颜，一袭水青' }
  ];
  /* P1-C（D1=(a)）：四道途，id 对齐联机枚举（PATH_IDS）。创角只露定位与一句话；
     九段成长系数收进「?」详情，避免把数值表当新手说明。 */
  const PATH_OPTS = [
    { id: 'sword', name: '剑修', tag: '前中段凌厉 · 后段平稳', hint: '前半程剑不肯收，后半程它自己收锋。' },
    { id: 'body',  name: '体修', tag: '前中段稳健 · 后段平稳', hint: '这一世先靠这副骨头撑住，往后才轮到骨头靠你。' },
    { id: 'dan',   name: '丹修', tag: '中后段见长 · 前段平稳', hint: '火是慢热的，烧到后半夜才认人。' },
    { id: 'array', name: '阵修', tag: '前后段见长 · 中段稍缓', hint: '首尾都有落子处，最难熬的是中间那段空盘。' }
  ];
  const PATH_MARK = { sword: '剑', body: '岳', dan: '炉', array: '卦' };
  /* 道号随机池：放置玩家通常懒得取名，给一个一键可用的入口（不改存档结构） */
  const CHAR_NAME_POOL = [
    '青玄子', '无涯客', '寒山雪', '听雪', '问心', '太乙', '长风', '归墟', '孤鸿',
    '不夜天', '摸鱼真人', '先躺一步', '明天再练', '睡到自然醒', '云间散人'
  ];
  const pathName = id => { const p = PATH_OPTS.find(x => x.id === id); return p ? p.name : ''; };
  /* m/f 与 male/female 互认，方便老档与外部读写 */
  const genderOf = sex => (sex === 'f' || sex === 'female' ? 'female' : 'male');
  const sexOf    = g   => (g === 'female' || g === 'f' ? 'f' : 'm');
  function initCharUI(){
    const cf = document.getElementById('char-confirm');
    if(cf) cf.addEventListener('click', confirmChar);
    const bindAct = (id, fn) => { const b = document.getElementById(id); if(b) b.addEventListener('click', fn); };
    bindAct('char-act1-next', () => setCharAct('2'));
    bindAct('char-act2-next', () => setCharAct('3'));
    bindAct('char-act2-back', () => setCharAct('1'));
    bindAct('char-act3-back', () => setCharAct('2'));
    const dice = document.getElementById('char-dice');
    if(dice) dice.addEventListener('click', () => {
      const input = document.getElementById('char-name');
      if(!input) return;
      const n = CHAR_NAME_POOL[Math.floor(Math.random() * CHAR_NAME_POOL.length)];
      input.value = n;
      input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    /* P2b：关闭入口（×、Esc、点背板）；仅编辑态生效，不保存未确认改动 */
    const cc = document.getElementById('char-close');
    if(cc) cc.addEventListener('click', closeCharModal);
    const cmEl = document.getElementById('char-modal');
    if(cmEl) cmEl.addEventListener('click', ev => { if(ev.target === cmEl) closeCharModal(); });
    if(!document.documentElement.dataset.charEsc){
      document.documentElement.dataset.charEsc = '1';
      document.addEventListener('keydown', ev => {
        if(ev.key !== 'Escape') return;
        const m = document.getElementById('char-modal');
        if(m && !m.classList.contains('hidden')) closeCharModal();
      });
    }
    const edit = document.getElementById('m-char');
    if(edit) edit.addEventListener('click', () => showCharModal(false));
  }
  /* 渲染两张立绘并挂点击（每次 open 重绘，靠 dataset.bound 防重复绑定） */
  function renderCharPreview(){
    const box = document.getElementById('char-picks');
    if(!box) return;
    box.innerHTML = SEX_OPTS.map(o =>
      '<button type="button" class="char-pick' + (o.sex === charSex ? ' active' : '') + '" data-sex="' + o.sex + '" aria-pressed="' + (o.sex === charSex) + '">' +
        '<span class="cp-glow"></span>' +
        (o.sex === charSex ? '<span class="cp-seal">已选</span>' : '') +
        '<img class="cp-img" src="' + heroImg(o.sex) + '" alt="' + o.name + '">' +
        '<span class="cp-name">' + o.name + '</span>' +
        '<span class="cp-hint">' + o.hint + '</span>' +
      '</button>'
    ).join('');
    if(!box.dataset.bound){
      box.dataset.bound = '1';
      box.addEventListener('click', ev => {
        const b = ev.target.closest('.char-pick');
        if(!b) return;
        charSex = b.dataset.sex;
        renderCharPreview();
      });
    }
  }
  /* 道途详情：创角卡只留定位；九段系数与当前段在点击「?」后再展开 */
  function showPathInfo(id){
    const o = PATH_OPTS.find(x => x.id === id);
    if(!o) return;
    const cur = pathSegIndex();
    const rows = BREAK_TIERS.map((t, i) => settleLine(
      t.name,
      pathBonusPct(id, i) + (i === cur ? ' · 当前' : ''),
      i === cur ? 'good' : ''
    ));
    showSettle({
      icon: '☯', title: o.name + ' · 道途详情', sub: o.tag,
      rows,
      note: '道途只影响对战斗伤害的侧重；修行速度、资源产出与存档规则不变。'
    });
  }
  /* P1-C（D1=(a)）：道途选择预览。容器动态生成，样式统一收口在 style.css；
     无障碍：文字名称 + aria-pressed 选中态。 */
  function renderPathPreview(){
    let box = document.getElementById('char-path-picks');
    if(!box){
      box = document.createElement('div');
      box.id = 'char-path-picks';
      box.className = 'char-path-picks';
      const modal = document.getElementById('char-modal');
      const cf = document.getElementById('char-confirm');
      /* 真实浏览器实测修复：#char-confirm 是 .m-card 的子节点、不是 #char-modal 的直接子节点，
         用 modal.insertBefore(box, cf) 会抛 NotFoundError 使弹窗打不开。改插到 cf 的真正父节点。 */
      if(cf && cf.parentNode) cf.parentNode.insertBefore(box, cf);
      else if(modal) modal.appendChild(box);
    }
    const readonly = pathLocked;
    box.innerHTML = PATH_OPTS.map(o => {
      const sel = (o.id === charPath);
      const mark = PATH_MARK[o.id] || '';
      if(readonly){
        /* 终身道途编辑态：只读展示，当前道途高亮、其余灰显，不可点（禁止转职，GPT 代码审查②） */
        return '<div class="char-pick' + (sel ? ' active' : '') + ' readonly" data-path="' + o.id + '" data-mark="' + mark + '">' +
                 (sel ? '<span class="cp-seal">已选</span>' : '') +
                 '<span class="cp-name">' + o.name + '</span>' +
                 '<span class="cp-tag">' + o.tag + '</span>' +
                 '<span class="cp-hint">' + o.hint + '</span>' +
                 '<span class="cp-info" data-pathinfo="' + o.id + '" role="button" tabindex="0" aria-label="' + o.name + '道途详情">?</span>' +
               '</div>';
      }
      return '<button type="button" class="char-pick' + (sel ? ' active' : '') + '" data-path="' + o.id + '" data-mark="' + mark + '" aria-pressed="' + sel + '">' +
               (sel ? '<span class="cp-seal">已选</span>' : '') +
               '<span class="cp-name">' + o.name + '</span>' +
               '<span class="cp-tag">' + o.tag + '</span>' +
               '<span class="cp-hint">' + o.hint + '</span>' +
               '<span class="cp-info" data-pathinfo="' + o.id + '" role="button" tabindex="0" aria-label="' + o.name + '道途详情">?</span>' +
             '</button>';
    }).join('');
    let label = document.getElementById('char-path-label');
    if(!label){
      label = document.createElement('div');
      label.id = 'char-path-label';
      label.className = 'char-path-label';
      if(box.parentNode) box.parentNode.insertBefore(label, box);
    }
    label.textContent = pathLocked
      ? ('道途·' + pathName(charPath) + '（终身道途，不可更改）')
      : (charPath
          ? ('已选道途：' + pathName(charPath))
          : ('请选择道途' + (charEditing ? '（老档补选）' : '（创角必选）')));
    /* 编辑态同屏展示：已有道途只读，未选老档可补选；显隐交给 #char-modal[data-act]。 */
    label.style.display = '';
    box.style.display = '';
    if(!box.dataset.bound){
      box.dataset.bound = '1';
      box.addEventListener('click', ev => {
        const info = ev.target.closest('[data-pathinfo]');
        if(info){ ev.stopPropagation(); showPathInfo(info.getAttribute('data-pathinfo')); return; }
        if(pathLocked) return;                 /* 终身道途：编辑态只读，不接受点击改选 */
        const b = ev.target.closest('.char-pick');
        if(!b) return;
        charPath = b.dataset.path;
        renderPathPreview();
      });
    }
  }
  function showCharModal(editing){
    charSex = sexOf(S.gender || S.sex);
    /* P1-C 真实浏览器实测修复：#m-char（改名/换装，真实编辑入口）绑定 showCharModal(false)，
       而 showCharModal(true) 只在「重开」时调用 —— 调用方的 editing 参数不可靠，
       用它判定锁定会让真实编辑入口绕过终身道途。改以存档状态本身判定：
         · needNewGame（新档/重开，S.path 已重置为 ''）→ 四选一必选；
         · 已有合法 S.path 且非新档 → 只读锁定，禁止转职；
         · S.path 为空且非新档 → 老档补选。
       editing 形参保留仅为兼容既有调用点，不参与判定。 */
    charEditing = !needNewGame;
    const existing = (typeof S.path === 'string' && PATH_IDS.indexOf(S.path) >= 0);
    charPath = existing ? S.path : '';             /* 已有道途预选；新档/未选不预选 */
    pathLocked = existing && !needNewGame;         /* 已选道途的编辑态：终身道途只读 */
    const nameInput = document.getElementById('char-name');
    if(nameInput) nameInput.value = S.name || '';
    renderCharPreview();
    renderPathPreview();
    /* 线上终验（2026-11-18）：创角页是最高优先级的一层。
       清档/改名入口可能从设置弹窗里来，弹窗不关就会叠在创角页上；太虚气泡也不许在这时上台。 */
    try{
      /* 2026-11-19 制作人批：只要创角弹窗在场，引导一步都不许弹、不许留 DOM。
         优先走 Guide.teardown（停定时器 + 摘节点 + 清 guide-active）；模块缺失时至少摘掉节点。 */
      if(typeof window.Guide !== 'undefined' && typeof window.Guide.teardown === 'function'){
        window.Guide.teardown();
      }else{
        const tb = document.getElementById('taixu-bubble'); if(tb && tb.parentNode) tb.parentNode.removeChild(tb);
        document.body.classList.remove('guide-active');
      }
      ['settings-modal', 'save-modal'].forEach(id => {
        const m = document.getElementById(id); if(m) m.classList.add('hidden');
      });
    }catch(e){}
    setCharAct(charEditing ? 'edit' : '1');
    document.getElementById('char-modal').classList.remove('hidden');
    /* P2b：改名/换装（编辑态）给明确关闭；新档创角必须确认，不提供关闭 */
    const cc = document.getElementById('char-close');
    if(cc) cc.style.display = charEditing ? '' : 'none';
    const cf = document.getElementById('char-confirm');
    if(cf) cf.textContent = charEditing ? '保存更改' : '隐入后山';
  }
  function closeCharModal(){
    if(!charEditing) return;   /* 新档创角：必须确认后才可进入 */
    const m = document.getElementById('char-modal');
    if(m) m.classList.add('hidden');
    /* 关窗不落任何未确认改动：姓名/性别/道途只在 confirmChar 时写档 */
    try{ if(typeof window.Guide !== 'undefined') window.Guide.init(); }catch(e){}
  }
  function confirmChar(){
    const nameInput = document.getElementById('char-name');
    let name = (nameInput ? nameInput.value : '').trim().slice(0, 12);
    if(!name) name = '无名散修';
    if(needNewGame && !charPath){
      setCharAct('3');
      log('请先选择道途，再确认创角。', 'bad');
      return;
    } /* 创角必选（GPT 审查④） */
    /* 终身道途：仅当本源尚未确定（创角/老档补选）才写入；已选道途不可被普通编辑覆盖（禁止转职，GPT 代码审查②）。
       P1-C GPT 终审阻断项①修正：写入前先校验 incoming charPath 本身属 PATH_IDS（数据完整性守卫，防非法/越界值落入本源）。 */
    if(PATH_IDS.indexOf(charPath) >= 0 && (typeof S.path !== 'string' || PATH_IDS.indexOf(S.path) < 0)) S.path = charPath;
    S.name = name;
    S.sex = charSex;                              /* 落进playerState.sex（老字段，主界面读它） */
    S.gender = genderOf(charSex);/* 显式字段：'male' / 'female' */
    save();
    document.getElementById('char-modal').classList.add('hidden');
    render();
    if(needNewGame){
      needNewGame = false;
      finalizeNewGame();
    }else{
      log('道号已定：' + name + (S.path ? ('，道途·' + pathName(S.path)) : '') + '，衣袂如新。', 'gold');
      /* 改名/换装（非新档）：创角弹窗关闭后，把被 teardown 的引导按原状态接回来 */
      try{ if(typeof window.Guide !== 'undefined') window.Guide.init(); }catch(e){}
      try{ if(typeof SECT !== 'undefined' && SECT.refreshNick) SECT.refreshNick(); }catch(e){}
    }
  }
  function finalizeNewGame(){
    S.rootIdx = pickRoot();
    S.last = Date.now();
    log('你睁开眼，山风还在测灵台前打转；那块被你碰黑的碑没有再亮——灵根：' + rootOf().name, 'sys');
    if(rootOf().name === '废灵根'){
      log('灵根定的是这一世走路快慢：废灵根修得慢些，战力不打折。要再掷一次，得等这一世走到头。', 'note');
    }
    log('道号「' + S.name + '」，从今日起，开始修行。点「打坐」攒第一份修为。', '');
    save();
    finishBoot();
  }
  /* M-1：NPC 记忆启动接入守卫。boot() 已有 inited 守卫，但 finishBoot() 是新档 /
     老档 / 导入三条路径的汇聚点，这里再加一道，确保 init() 全程只执行一次，
     不重复 load()、不重复 ensureDay()。 */
  let npcMemInited = false;
  function finishBoot(){
    /* M-1（P-01）：jxwd_npc_memory_v1 此前全项目 0 个 init/load 调用点，
       内存态恒为 blank()，首次 record() 会把「空态 + 本次新记忆」写回并覆盖旧记忆。
       放在 finishBoot 最开头：此刻 window.NpcMemory 已加载（boot 由 router.js 末尾触发），
       且早于 Story.init / Tutorial.start / tickLoop 定时器 / 任何 NPC 交互，
       保证「旧记忆先读回，再允许新记录写入」。失败只吞异常、不做任何补偿写入，
       因此初始化失败不会用空数据覆盖旧数据。 */
    if(!npcMemInited && window.NpcMemory && typeof window.NpcMemory.init === 'function'){
      try{ window.NpcMemory.init(); npcMemInited = true; }catch(e){}
    }
    S.last = Date.now();
    /* B3 沈碑必达：创角完成后（新档/老档/导入三路汇聚点）后台预加载立绘，
       四呈现位共用同一缓存；3 秒超时重试一次，再失败露出「碑」字块兜底。
       同处预加载玩家立绘，治女修立绘首载慢。 */
    try {
      if(window.NpcArt) {
        if(typeof NpcArt.preloadAll === 'function') NpcArt.preloadAll();
        if(typeof NpcArt.preloadHero === 'function') NpcArt.preloadHero(S.sex);
      }
    } catch(e) {}
    renderLog();
    render();
    bindTopbarTap();
    bindNavClose();
    /* 联机身份跟角色名：读档/创角完成后再同步一次 */
    try{ if(typeof SECT !== 'undefined' && SECT.refreshNick) SECT.refreshNick(); }catch(e){}
    renderCd();
    /* 主线《断天门》：挂在这里而不是 boot() 里 Daily.init 之后——load() 在 boot 中段才跑，
       早于此注入依赖的话老档的 S.story 读不回来，每次刷新进度都会归零。
       finishBoot 是新档 / 老档 / 导入三条路的汇聚点，此刻存档一定已就位。 */
    if(typeof Story !== 'undefined'){
      try{
        Story.init({
          s: () => S,
          needOf: r => needOf(r),
          wisdom: n => wisdomGain(n),
          heroRank: () => { const l = rankList(); const i = l.findIndex(r => r.me); return i < 0 ? 99 : i + 1; },
          log: (t, k) => log(t, k),
          save: () => save(),
          render: () => render()
        });
        /* 2026-11-19 开局弹层调度：先把已达成的主线段排出来（剧情第一优先），
           随后 Guide.init 看到剧情在场会自动排队，不再互相抢层。 */
        try{ Story._tick(); }catch(e){}
      }catch(e){}
    }
    /* 新手引导（tutorial.js）：boot 全部路径汇聚点；老玩家在 start() 内自动跳过并补写标记 */
    if(window.Tutorial) window.Tutorial.start();
    /* 太虚真人引导 V1（2026-11-11）：与 Tutorial 同汇聚点；老玩家在 init 内自动跳过 */
    if(typeof window.Guide !== 'undefined') window.Guide.init();
    /* R-3 收口（2026-11-14）：Guide.init() 在当前调用栈让气泡上台，但纸签要等下一次 render 才让位；
       同帧补一次 renderTrail()，否则起页面 400/600ms 两拍仍会同屏（实测 bothOn=2）。 */
    try{ renderTrail(); }catch(e){}
    if(timer) clearInterval(timer);
    timer = setInterval(tickLoop, 500);
    window.addEventListener('pagehide', () => save());
    /* 导入冻结期离开页面：浏览器不保证能弹确认框，但 try 一下总比什么都不做强 */
    window.addEventListener('beforeunload', ev => {
      if(!frozenForImport) return;
      try{ ev.preventDefault(); ev.returnValue = '已导入新存档但尚未重新载入，当前进度不会保存。确定离开？'; }catch(e){}
      return ev.returnValue;
    });
    document.addEventListener('visibilitychange', () => { if(document.hidden) save(); });
    /* P1-C（D1=(a)）：老档补选入口提示。finishBoot 是老档/导入档汇聚点，全新开局不经此（走 showCharModal）。
       S.path 为空说明该老档在道途系统上线前创建，提示玩家到角色面板「编辑角色」即可补选，不影响已有进度。 */
    if(!needNewGame && typeof S.path === 'string' && S.path === ''){
      try{ log('🧭 你尚未选择道途（单机道途系统上线前的旧档）。点开角色面板「编辑角色」即可补选，不影响已有进度。', 'note'); }catch(e){}
    }
  }
  function boot(){
    if(inited) return;
    inited = true;
    initCharUI();
    bindEncounterUI();
    initTrace();       /* 妖踪浮片的两只按钮：动作在 body 上，boot 时绑一次 */
    initNpcVisit();    /* 沈碑来访气泡：点击 / Enter / Space 进识人页，同样只在 boot 绑一次 */
    initEntryDots();   /* 入口红点：场景入口常驻主 DOM，boot 时插一次 */
    /* 突破辅助道具勾选框（藏经阁动态注入）→ 勾选变化重算按钮成功率文案 */
    if(!document.documentElement.dataset.guardBound){
      document.documentElement.dataset.guardBound = '1';
      document.addEventListener('change', ev => {
        const id = ev.target && ev.target.id;
        if(id === 'xx-use-array' || id === 'xx-use-tianji') render();
      });
    }
    /* 注：此前这里给 #xx-reset 绑了 resetAll，但该 id 在 index.html / 所有 views 中
       都不存在（全库仅此一处引用），属死绑定，已删除。真正的「重开」入口是设置浮层里的 #m-wipe。 */
    /* 每日任务模块：注入依赖（灵石/悟道值发放走主存档通道，与 wisdomGain 同系数） */
    if(typeof Daily !== 'undefined'){
      Daily.init({
        rank: () => S.rank,
        needOf: r => needOf(r),
        wisdomGain: b => wisdomGain(b),
        grant: rw => {
          /* ⚠️ 先存旧值，保存失败必须把**内存**也回滚。
             否则 isApplied() 读到的是内存里那份被改过的 S.dailyApplied（已含这笔 claimId），
             同一个会话里再跑 recoverPending 就会误判"已入账" → 删掉 pending，
             而本机存档上根本没有这笔奖励 —— 那是静默丢奖，比不补发更糟。 */
          const oldStone  = S.stone;
          const oldEarned = S.stats.stoneEarned;
          const oldWisdom = S.wisdom;
          const oldApplied = Array.isArray(S.dailyApplied) ? S.dailyApplied.slice() : [];
          if(rw.stone){ S.stone += rw.stone; S.stats.stoneEarned += rw.stone; }
          if(rw.wisdom){ S.wisdom = moneyInt(S.wisdom) + rw.wisdom; }
          /* D-006 J-1：奖励与「这笔发过没有」的登录状态落在同一次 save() 里 */
          if(rw.claimId && typeof rw.claimId === 'string'){
            if(!Array.isArray(S.dailyApplied)) S.dailyApplied = [];
            if(S.dailyApplied.indexOf(rw.claimId) < 0){
              S.dailyApplied.push(rw.claimId);
              if(S.dailyApplied.length > 40) S.dailyApplied = S.dailyApplied.slice(-40);
            }
          }
          if(save() === false){
            S.stone = oldStone;
            S.stats.stoneEarned = oldEarned;
            S.wisdom = oldWisdom;
            S.dailyApplied = oldApplied;
            return false;
          }
          return true;
        },
        /* 查询某笔领取是否已真的入账（跨崩溃恢复时用，避免重复发奖） */
        isApplied: claimId => Array.isArray(S.dailyApplied) && S.dailyApplied.indexOf(claimId) >= 0,
        log: (t, k) => log(t, k)
      });
    }
    const had = load();
    if(!had){
      /* 存档损坏保护：读取失败但主键里确实有数据 → 不进创角（创角会覆盖它），
         直接告知玩家并提供取回入口。这是"读档失败 ≠ 没有存档"的落地。 */
      if(saveBlocked){
        needNewGame = false;
        render();
        log('⚠️ 你的存档读不出来了（不是没有存档）。原始数据已原样留在本地，未被覆盖。', 'bad');
        log('👉 请打开「设置 → 存档备份」点「取回这份存档」，按提示写入即可恢复。' +
            (corruptRawCache ? '（注意：备份没能写入，原文只留在当前页面，刷新前务必导出。）' : ''), 'sys');
        try{ if(typeof window.showToast === 'function') window.showToast('⚠️ 存档读取失败，请到设置里取回备份'); }catch(e){}
        finishBoot();
        return;
      }
      const arcade = readArcadeImport();
      if(arcade){
        askArcadeImport(arcade, imported => {
          if(!imported){
            needNewGame = true; render(); showCharModal(false); return;
          }
          offline();
          log('回到洞府，继续修炼。（灵根：' + rootOf().name + '）', 'sys');
          save(); finishBoot();
        });
        return;
      }
      /* 全新开局：先创立角色，确认后才正式开局 */
      needNewGame = true;
      render();
      showCharModal(false);
    }else{
      offline();
      checkMiles(true);        /* 离线期间攒下的进度，回来先立碑再说话 */
      log('回到洞府，继续修炼。（灵根：' + rootOf().name + '）', 'sys');
      save();
      finishBoot();
    }
  }
  function resetAll(skipConfirm){
    if(!skipConfirm){
      confirmAction({
        icon:'⚠️', title:'设置 · 确认重开', okText:'确认重开',
        text:'当前境界、灵石、功法、法宝等全部清空。<br><b>此操作不可撤销。</b>',
        foot:'取消会保留当前存档。'
      }, ok => { if(ok) resetAll(true); });
      return;
    }
    try{ localStorage.removeItem(SAVE_KEY); }catch(e){}
    /* 玩家明确选择重开 = 主动放弃旧档：解除保护闸门并顺手清掉毁档备份，
       否则「清空存档」之后本地还留着一份完整旧档 JSON（隐私/一致性缺口）。 */
    saveBlocked = false;
    try{ localStorage.removeItem('xiuxian_save_corrupt'); }catch(e){}
    /* 重开 = 从头开始：引导完成标记（tutorial.js 的 KEY）也必须清，否则新角色直接被丢进
       空档、新手引导不重播。此处早于 tutorial.js 加载（boot 在 router.js 末尾），只能直接删 key。 */
    clearTutorialMark();
    S.rank = 0; S.exp = 0; S.stone = 0;
    S.cave = 0; S.dan = 0; S.forge = 0; S.field = 0; S.mine = 0;
    S.mastery = { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 };
    S.recipeN = {};
    S.herb = 0; S.ore = 0; S.weapon = 0; S.art = { bg: 0, brk: 0, cai: 0 }; S.plots = []; S.enc = { t: 0, bubble: null, lastId: '', seen: {} };   /* 阶段四 C4-1：重开同样清当日去重账 */
    S.rv4 = emptyRv4();                       /* 重开＝新档：兽魂、万兽谱进度与领奖记录全清 */
    S.equipment = { weapon: null, armor: null, accessory: null };   /* 装备三槽一并清空 */
    S.encBuff = { mult: 0, until: 0 };
    S.bag = [];
    S.herb100 = 0; S.herb10000 = 0;
    S.wisdom = 0; S.insight = 0; S.failBonus = 0; S.guardMirror = 0; S.guardArray = 0; S.tianji = 0;
    /* 悟道树跟着重开一起清（不单清 wu 会是"洗点返八成"的漏洞：重开一次白赚八成悟道值放在 wuPaid 里） */
    S.wu = { sword: 0, dan: 0, array: 0 }; S.wuPaid = { sword: 0, dan: 0, array: 0 };
    S.shop = { week:'', heart_mirror:0, guard_array:0, tianjiTier:-1 };
    S.weaponLv = 0; S.weaponBless = 0; S.affix = [];
    S.huntBeast = null; S.huntProg = 0;
    S.bossKilled = {};
    S.eggs = []; S.pets = []; S.petSlots = 1;
    S.tower = 1; S.towerMax = 0; S.towerDay = ''; S.towerSwept = 0;
    S.towerBossMail = 0;                              /* 重开 = 新档，旧档补发标记一并清零 */
    S.trun = null; S.trunLast = null;                 /* 塔里那一局与上一局账本一并作废 */
    S.secret = { prog: [0, 0, 0, 0], day: '', swept: 0 };
    S.arena = { day: '', left: 0, foes: [], tier: 0, win: 0, lose: 0, rep: 0, proxyDay: '' };
    S.sign = { days: 0, last: '' };
    S.union = { start: Date.now(), day: '', left: 0, merit: 0, claimed: [], season: 1 };
    S.gate = { lv: 0, disciples: [], grad: 0 };         /* 山门弟子一并散尽（重开 = 一无所有） */
    S.dt = { qing: 0, zhu: 0, su: 0, xuan: 0, huang: 0 }; S.dtMain = '';
    S.market = { day: '', goods: [], buyRate: 1, sellRate: 1, sold: 0, freeRefresh: 1 };
    S.coopBoss = { week: '', hpMax: 0, dmg: 0, claimed: [], parts: 0 };
    S.lingchao = { week: '', started: 0, startedAt: 0, kills: 0, claimed: [], pv: 0 };
    S.unlocks = [];
    S.blueprints = {}; S.bpShop = { week: '', bought: 0 };
    /* 寿元 / 道统（第 96 轮）：重开 = 换一个全新的人，连"转世过几世"都不该记得。
       新档寿元是开着的（on=true），所以重开之后也开着。 */
    S.life = { age: 0, on: true, brk: 0 }; S.zuo = 0; S.legacy = { gens: 0, relic: null, hist: [], pick: null };
    S.mirror = { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0, calm: 0, calmStep: 0 };   /* 心魔也随这个人一起消失 */
    S.npcs = { stele: { met: 0, rel: 0, stage: 0, seenGens: 0, lastSeen: 0, nudgeAt: 0,
                        heard: [], told: [], keyLogged: [], lastTower: 0,
                        trust: 0, coldUntil: 0, quest: null,
                        attitude: { open: 0, guarded: 0, rude: 0, cost: 0 },
                        events: [], state: { kind: 'in', until: 0 }, lastDecayAt: 0,
                        choice: { listened: 0, showoff: 0, promise: 0 },
                        cur: { lastRank: 0, talk: 0, promptTale: 0 } },
               /* 崔九：重开=换一个全新的人，不认得你（13 键；无 lastTower） */
               cuijiu: { met: 0, rel: 0, stage: 0, lastSeen: 0, heard: [],
                         coldUntil: 0, attitude: { open: 0, guarded: 0, rude: 0 },
                         events: [], state: { kind: 'in', until: 0 },
                         lastDecayAt: 0, seenGens: 0,
                         quest: null,
                         choice: { climb: 0, chat: 0, listen: 0 },
                         cur: { talk: 0 } } };
      /* 记忆 NPC 框架第二步（D1 批甲）：老档一次性映射 stage=max(旧 stage, relFloor(rel))。
         只升不降；重复 load 幂等（max 之后不会再降）。 */
      try{ if(window.NpcRel) window.NpcRel.migrateStage(S.npcs.stele); }catch(e){}   /* 沈碑：重开=换一个全新的人，不认得你 */
    S.npcAct = { day: '', n: 0 };                       /* 记忆 NPC 框架第一步：重开清空日额度 */
    npcVisitReset();                                    /* 沈碑浮片：重开时一并收掉，不留上一局的文案 */
    /* UI 态残留：洗练锁的槽位号、灵田选中的作物，都属于"上一个人"的操作痕迹。
       不重新赋值的话会跨档带进新角色（虽然各有自愈逻辑，但一开始就显示错的状态更糟）。 */
    try{ rrLocks.clear(); }catch(e){}
    farmSel = 'herb';
    /* NPC 侧车记忆（js/npc_memory.js 的独立 localStorage 键）也必须清：
       S.npcs 被清零了，但记忆库还记着上一档"在论剑台赢过""破了第 N 层"——
       不清的话，新角色一睁眼守碑老吏就认得他，与「重开=换一个全新的人」自相矛盾。
       注：转世（resetForNewLife）**不清**，跨世记忆是设计。 */
    try{ if(window.NpcMemory && window.NpcMemory._reset) window.NpcMemory._reset(); }catch(e){}
    /* 长线记录一并清空（此前漏了：重开后道碑仍全亮着、信匣还留着旧信） */
    S.miles = {}; S.milesNew = []; S.letters = [];
    S.worldFoot = '';                             /* W1「塔底」：重开 = 没进过那座塔，碑也不立、回响也不留 */
    S.day = { key: '', expGain: 0, sweepExp: 0, dec: { res: 0, risk: 0, grow: 0, social: 0 } }; /* 阶段一：新角色没有当日主动计数；阶段三收尾：四类决策也归零 */
    S.secludeUntil = 0;                           /* 阶段一：新角色没有闭关闸门 */
    S.story = { claimed: {} };                          /* 主线《断天门》从第一段重走 */
    S.trail = { i: 0 };                                 /* 入门八事：重开 = 重新走一遍第一局 */
    S.trail2 = { i: 0 };                                /* 道途：同样从第一程重新走 */
    S.trail3 = { i: 0, gen: 0 };                        /* 轮回：重开 = 又变回初世，这张纸签不该出现 */
    S.bagSize = BAG_BASE;
    Object.keys(S.stats).forEach(k => { S.stats[k] = 0; });
    S.questsDone = [];
    GONGS.forEach(x => { S[x.id] = 0; });
    S.pillUntil = 0; S.pillBonus = 0;
    danClean({});   /* 三族丹药 buff 也是时间戳状态：转世 / 重开一并消散 */
    /* 联机账本一并归零：multiWins 若留着旧值，新角色首通关时是 N+1 而不是 1，
       「崔九首次闯通」的叙事永远不再触发（把上面 NpcMemory._reset 的效果抵消掉）；
       multiCreditedRuns 留着旧 runId 属残留，也一并清。 */
    S.multiWins = 0; S.multiCreditedRuns = [];
    S.dailyApplied = [];        /* 每日任务入账登录状态也是本世数据，重开一并清 */
    resetActs();
    S.dao = 0; S.log = [];
    S.name = ''; S.sex = 'm'; S.gender = 'male'; S.robe = 'bai'; S.path = '';
    S.swordAura = 0;                                    /* 剑意流派也回到初始的青莲剑意 */
    S.rootIdx = 1;
    S.last = Date.now();
    S.guide = { step: 0, done: false, skipped: false, flags: {}, rewardClaims: {}, toldSystems: {} };  /* 重开 = 引导从头走一遍（与 tutorial.js 清 hasFinishedTutorial 同理） */
    if (typeof window.Guide !== 'undefined' && typeof window.Guide.reset === 'function') window.Guide.reset(); /* C5：重绑定引导控制器到新 S.guide（避免旧 state 引用） */
    if(typeof Daily !== 'undefined') Daily._reset();   /* 每日任务进度一并重开 */
    try{ if(window.NpcVisitQueue) NpcVisitQueue.clear(); }catch(e){}   /* 重开 = 新的一生，崔九的主动事件一并清（第 114 轮） */
    try{ if(window.Net) Net.disconnect(); }catch(e){}   /* 重开同样下线（第 115 轮） */
    try{ multiClearSession(); }catch(e){}   /* P0-C：重开清空联机会话（刷新重连只针对同一世内） */
    /* 重开 = 重新创立角色 */
    needNewGame = true;
    render();
    showCharModal(true);
  }

  /* ============================================================
   * 存档备份（第 78 节）：导出成文件/文本，或把别的设备上的存档搬回来
   *   校验只认「像本游戏的存档」：rank 0~25、exp 是数、至少 3 个系统字段；
   *   导入后把 last 改成此刻，避免反复导入旧档刷离线收益。
   * ============================================================ */
  const SAVE_TEXT_MAX = 2 * 1024 * 1024;
  const SAVE_SIG_KEYS = ['bag', 'stats', 'cave', 'weapon', 'gong1', 'plots', 'story', 'miles', 'dt', 'gate'];
  function svEsc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g,
      c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  }
  function byteLen(s){
    s = String(s || '');
    try{ return new TextEncoder().encode(s).length; }catch(e){ return s.length; }
  }
  function fmtSize(n){
    n = Math.max(0, n | 0);
    return n < 1024 ? n + ' B' : (n / 1024).toFixed(n < 102400 ? 1 : 0) + ' KB';
  }
  function pad2(n){ return (n < 10 ? '0' : '') + n; }
  function stampOf(ms){
    const d = new Date(Number(ms));
    if(!isFinite(d.getTime())) return '—';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' +
      pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function saveMeta(o){
    o = (o && typeof o === 'object') ? o : {};
    const rank = Math.max(0, Math.min(TOP, o.rank | 0));
    const last = Number(o.last);
    return {
      name: (typeof o.name === 'string' && o.name.trim()) ? o.name.trim().slice(0, 12) : '无名散修',
      rank: RANK_NAMES[rank] || '?',
      stone: (typeof o.stone === 'number' && isFinite(o.stone)) ? Math.max(0, o.stone) : 0,
      wisdom: (typeof o.wisdom === 'number' && isFinite(o.wisdom)) ? Math.max(0, o.wisdom) : 0,
      last: isFinite(last) && last > 0 ? last : 0,
      bytes: 0
    };
  }
  function parseSaveText(text){
    if(typeof text !== 'string') return { ok:false, err:'没有读到文本' };
    let t = text.trim().replace(/^\uFEFF/, '');
    if(!t) return { ok:false, err:'存档文本是空的' };
    if(t.length > SAVE_TEXT_MAX) return { ok:false, err:'文件过大（超过 2MB），不像是本游戏的存档' };
    let o;
    try{ o = JSON.parse(t); }catch(e){ return { ok:false, err:'不是有效的游戏存档' }; }
    /* 有人会把存档当普通字符串再包一层 → 拆一层 */
    if(typeof o === 'string'){
      try{ o = JSON.parse(o); }catch(e){ return { ok:false, err:'存档内容不是对象' }; }
    }
    if(!o || typeof o !== 'object' || Array.isArray(o)) return { ok:false, err:'存档内容格式不正确' };
    if(typeof o.rank !== 'number' || !isFinite(o.rank) || o.rank < 0 || o.rank > TOP)
      return { ok:false, err:'缺少境界或数值越界' };
    if(typeof o.exp !== 'number' || !isFinite(o.exp) || o.exp < 0)
      return { ok:false, err:'修为缺失或不是有效数字' };
    const sig = SAVE_SIG_KEYS.filter(k => k in o).length;
    if(sig < 3) return { ok:false, err:'缺少角色记录，不像是《九霄问道》的存档' };
    const meta = saveMeta(o);
    meta.bytes = byteLen(t);
    return { ok:true, obj:o, text:t, meta };
  }
  function showImportError(msg){
    const box = document.getElementById('sv-prev');
    if(box){ box.className = 'sv-prev show bad'; box.textContent = '✗ ' + msg; }
    const ap = document.getElementById('sv-apply'); if(ap) ap.disabled = true;
    return false;
  }
  function resetImportPreview(){
    const box = document.getElementById('sv-prev');
    if(box){ box.className = 'sv-prev'; box.textContent = ''; }
    const ap = document.getElementById('sv-apply'); if(ap) ap.disabled = true;
  }
  /* 侧车数据：与本机其他功能各自独立的 localStorage 键。
     导出时一起打包，否则换设备/清缓存后，NPC 记忆、签到进度、最高纪录全部丢失
     （玩家视角是"备份没备全"）。导入时按 key 写回，写不进去不阻断主档恢复。
     ⚠️ 必须声明在 previewSaveText 之前使用（const 有 TDZ，不会像 function 那样提升）。 */
  const SIDECAR_KEYS = ['jxwd_daily_v1', 'jxwd_npc_memory_v1', 'jxwd_npc_visit_v1', 'hasFinishedTutorial', 'xiuxian_best'];
  const SIDECAR_FIELD = '__sidecar';       /* 打包后放在主档对象的这个字段里 */
  function previewSaveText(text){
    if(frozenForImport) return showImportError('新存档已写入，请先重新载入');
    const r = parseSaveText(text);
    if(!r.ok) return showImportError(r.err);
    const box = document.getElementById('sv-prev');
    if(box){
      box.className = 'sv-prev show ok';
      box.innerHTML = '✓ <b>' + svEsc(r.meta.name) + '</b> · ' + svEsc(r.meta.rank) +
        '<span>灵石 ' + fmt(r.meta.stone) + ' · ' + fmtSize(r.meta.bytes) +
        (r.meta.last ? ' · 最后活动 ' + stampOf(r.meta.last) : '') + '</span>';
    }
    const ap = document.getElementById('sv-apply'); if(ap) ap.disabled = false;
    /* 预览里说明这份文件带不带侧车，玩家能预期"换设备后记忆/签到会不会一起过来" */
    const box2 = document.getElementById('sv-prev');
    if(box2 && r.obj && r.obj[SIDECAR_FIELD]){
      const n = Object.keys(r.obj[SIDECAR_FIELD] || {}).length;
      box2.innerHTML += '<span> · 含本机记录 ' + n + ' 项（签到 / NPC 记忆 / 最高境界）</span>';
    }
    return true;
  }
  function renderSaveCurrent(){
    const box = document.getElementById('sv-cur');
    if(!box) return;
    /* 毁档原文的来源要按 corruptRawSource() 区分，不能一律当成"本次原文"：
       - current：本次读档失败的那份（内存里，刷新即丢）——最该立刻导出
       - backup ：历史上某次失败留下的自动备份（可能不是本次坏掉的那份）
       顺序也按这个优先级渲染：先本次、再历史，避免玩家把旧备份误当本次原文。 */
    const src = corruptRawSource();
    const curRaw = src === 'current' ? corruptRawCache : '';
    let bakRaw = '';
    if(src !== 'current'){
      try{ bakRaw = localStorage.getItem('xiuxian_save_corrupt') || ''; }catch(e){}
    }
    let corruptHtml = '';
    if(curRaw){
      corruptHtml = '<div class="sv-corrupt" style="margin-top:6px">⚠️ <b>本次</b>读档失败，备份键写不进去（存储可能已满或被禁用）。' +
        '本次原文（' + fmtSize(byteLen(curRaw)) + '）只留在当前页面，<b>刷新即丢</b>，请立刻导出：' +
        '<button class="btn-main" type="button" data-sv-recover="3" style="margin-left:6px">下载本次原文</button>' +
        '<button class="btn-plain" type="button" data-sv-recover="4" style="margin-left:6px">复制本次原文</button>' +
        '<button class="btn-ghost" type="button" data-sv-recover="2" style="margin-left:6px">载入到导入框</button></div>';
      if(bakRaw){
        corruptHtml += '<div class="sv-corrupt" style="margin-top:6px">另有一份<b>更早</b>的自动备份（' + fmtSize(byteLen(bakRaw)) + '），不是本次的：' +
          '<button class="btn-ghost" type="button" data-sv-recover="1" style="margin-left:6px">取回那份旧备份</button></div>';
      }
    }else if(bakRaw){
      corruptHtml = '<div class="sv-corrupt" style="margin-top:6px">⚠️ 发现一份<b>历史</b>「读档失败时自动备份」的旧存档（' + fmtSize(byteLen(bakRaw)) + '）。' +
        '这是以前某次失败留下的，不一定是本次的原文。' +
        '<button class="btn-ghost" type="button" data-sv-recover="1" style="margin-left:6px">取回这份存档</button>' +
        '<button class="btn-plain" type="button" data-sv-recover="3" style="margin-left:6px">下载原文</button>' +
        '<button class="btn-plain" type="button" data-sv-recover="4" style="margin-left:6px">复制原文</button></div>';
    }else if(saveBlocked){
      corruptHtml = '<div class="sv-corrupt" style="margin-top:6px">⚠️ 上次读档失败，且没有留下可恢复的原文。' +
        '原始数据可能仍在浏览器本地存储里（本游戏不会覆盖它）。' +
        '可尝试用浏览器的「开发者工具 → Application → Local Storage」查看 <code>xiuxian_save</code>。</div>';
    }
    if(frozenForImport){
      box.innerHTML = '<b>新存档已写入</b><br><span>重新载入后生效；重新载入前不会再自动保存。</span>' + corruptHtml;
      return;
    }
    save();
    let raw = '';
    try{ raw = localStorage.getItem(SAVE_KEY) || ''; }catch(e){}
    box.innerHTML = '<b>' + svEsc(S.name || '无名散修') + '</b> · ' + svEsc(RANK_NAMES[S.rank] || '?') +
      '<br><span>灵石 ' + fmt(S.stone) + ' · 悟道 ' + fmt(S.wisdom) + ' · 存档 ' + fmtSize(byteLen(raw)) + '</span>' +
      '<br><span>最后活动 ' + stampOf(S.last) + '</span>' + corruptHtml;
  }
  /* 取回毁档原文：优先备份键，其次内存缓存。放进导入框走同一条校验/预览通道，
     不绕过 parseSaveText 直接写主键。 */
  function recoverCorruptSave(){
    let txt = '';
    try{ txt = localStorage.getItem('xiuxian_save_corrupt') || ''; }catch(e){}
    if(!txt) txt = corruptRawCache || '';
    if(!txt){ log('没有可取回的原文（备份和当前页面里都没有）。', 'bad'); return; }
    const inp = document.getElementById('sv-in');
    if(inp){
      inp.value = txt;
      previewSaveText(txt);
      log('📥 原文已放入下方预览框，确认无误后点「写入存档」。', 'sys');
    }else{
      log('找不到导入框，无法取回。', 'bad');
    }
  }
  /* 导入后内存里仍是旧进度，再导出会拿到旧档 → 两个导出按钮一并锁住，重载后自然恢复 */
  function saveExportLock(on){
    ['sv-download','sv-copy'].forEach(id => {
      const b = document.getElementById(id);
      if(b) b.disabled = !!on;
    });
  }
  function openSave(){
    const m = document.getElementById('save-modal');
    if(!m) return;
    const st = document.getElementById('settings-modal');
    if(st) st.classList.add('hidden');
    if(!frozenForImport){
      const tin = document.getElementById('sv-in'); if(tin) tin.value = '';
      const tout = document.getElementById('sv-out'); if(tout){ tout.value = ''; tout.classList.add('hidden'); }
      const hint = document.getElementById('sv-copy-hint'); if(hint) hint.textContent = '';
      const done = document.getElementById('sv-done'); if(done) done.classList.remove('show');
      const card = document.querySelector('#save-modal .m-card');
      if(card) card.classList.remove('sv-frozen');
      resetImportPreview();
    }
    renderSaveCurrent();
    saveExportLock(frozenForImport);
    /* 毁档原文的四个动作由 renderSaveCurrent 动态生成，容器 #sv-cur 常驻 → 用委托绑一次。
       1=取回（放进导入框走校验） 2=载入到导入框 3=下载原文 4=复制原文 */
    const curBox = document.getElementById('sv-cur');
    if(curBox && !curBox.dataset.d_binded){
      curBox.dataset.d_binded = '1';
      curBox.addEventListener('click', ev => {
        const b = ev.target.closest('[data-sv-recover]');
        if(!b) return;
        ev.stopPropagation();
        const act = b.dataset.svRecover;
        if(act === '3') downloadCorruptRaw();
        else if(act === '4') copyCorruptRaw();
        else recoverCorruptSave();
      });
    }
    if(frozenForImport){
      const hint = document.getElementById('sv-copy-hint');
      if(hint) hint.textContent = '新存档已写入，重新载入后才能导出备份。';
    }
    m.classList.remove('hidden');
  }
  function closeSave(){
    const m = document.getElementById('save-modal');
    if(m) m.classList.add('hidden');
  }
  /* 通用导出通道：把任意文本落成文件 / 复制到剪贴板。
     抽出来是为了让「当前存档」和「读档失败时的原始原文」共用同一条路径——
     原文已经解析失败，绝不能再走 JSON.stringify(S) 导出（那会导出一份新的空档）。 */
  function downloadTextAsFile(text, baseName){
    const d = new Date();
    const safe = String(baseName || '九霄问道').replace(/[\\/:*?"<>|]/g, '');
    const fn = safe + '-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) +
      '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.json';
    try{
      const blob = new Blob([text], { type:'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fn;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => { try{ URL.revokeObjectURL(url); }catch(e){} }, 5000);
      return { ok: true, fn: fn };
    }catch(e){ return { ok: false, fn: fn }; }
  }
  function copyTextToClipboard(text){
    const out = document.getElementById('sv-out');
    if(out){ out.value = text; out.classList.remove('hidden'); out.focus(); out.select(); }
    let ok = false;
    try{ ok = document.execCommand('copy'); }catch(e){ ok = false; }
    try{ if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text); }catch(e){}
    return ok;
  }
  /* 侧车收集/恢复（常量声明在 previewSaveText 之前） */
  function collectSidecar(){
    const out = {};
    let n = 0;
    SIDECAR_KEYS.forEach(k => {
      let v = null;
      try{ v = localStorage.getItem(k); }catch(e){ v = null; }
      if(typeof v === 'string' && v.length && v.length <= 512 * 1024){ out[k] = v; n++; }
    });
    return n ? out : null;
  }
  /* 导出文本：主档 + 侧车。保持向后兼容——旧版游戏读到这个 JSON 只是多一个未知字段，
     会被 load() 的逐字段白名单忽略，不会因此报错。 */
  function buildSaveBundle(){
    const o = JSON.parse(JSON.stringify(S));
    const side = collectSidecar();
    if(side) o[SIDECAR_FIELD] = side;
    return JSON.stringify(o);
  }
  function restoreSidecar(side){
    if(!side || typeof side !== 'object') return 0;
    let n = 0;
    SIDECAR_KEYS.forEach(k => {
      const v = side[k];
      if(typeof v !== 'string' || !v.length || v.length > 512 * 1024) return;
      try{ localStorage.setItem(k, v); n++; }catch(e){ /* 配额满等：跳过，不阻断主档恢复 */ }
    });
    /* 本机存档变了，常驻内存必须跟着重读：
       NpcMemory 的 st 与 NpcVisitQueue 的 st.q 都是加载时读一次的模块级状态，
       上面只改了 localStorage。若不重读，玩家导入后继续玩时任何一次 record()/push()
       都会用"导入前的旧内存"整体覆盖刚写进来的记忆 —— D-005 侧车打包等于白做。
       load() 各自带 fail-closed 保护，失败只会禁写、不会用空态覆盖本机存档。 */
    if(n){
      try{ if(window.NpcMemory && typeof window.NpcMemory.load === 'function') window.NpcMemory.load(); }catch(e){}
      try{ if(window.NpcVisitQueue && typeof window.NpcVisitQueue.load === 'function') window.NpcVisitQueue.load(); }catch(e){}
    }
    return n;
  }
  function downloadSave(){
    if(frozenForImport) return;
    save();
    const r = downloadTextAsFile(buildSaveBundle(), '九霄问道-' + String(S.name || '无名散修'));
    const hint = document.getElementById('sv-copy-hint');
    if(hint) hint.textContent = r.ok
      ? '已生成 ' + r.fn + '（看浏览器的下载列表）。含角色主档与本机记录（签到/记忆/最高境界）。'
      : '这个浏览器拦住了下载，请改用「复制存档文本」。';
  }
  function copySave(){
    if(frozenForImport) return;
    save();
    const ok = copyTextToClipboard(buildSaveBundle());
    const hint = document.getElementById('sv-copy-hint');
    if(hint) hint.textContent = ok
      ? '已复制（含角色主档与本机记录）。也可以从下面的文本手动复制。'
      : '已把存档填到下面的文本里，请全选复制。';
  }
  /* 导出「读档失败时留下的原始原文」。
     与上面两个函数的区别：source 是那段**没能解析成功**的原文，不是内存里的 S。
     ⚠️ 优先级必须是「本次会话的缓存」>「备份键」：
     备份键里可能是**上一次**失败留下的旧存档 A，而本次损坏的是 B（且备份写入失败，
     键里仍是 A）。若先读键，玩家会以为导出的是刚坏的那份，实际拿到旧档 A。
     历史备份只在当前页面没有本次原文时作为后备。 */
  function corruptRawText(){
    if(corruptRawCache) return corruptRawCache;          /* 本次失败的原文优先 */
    try{ return localStorage.getItem('xiuxian_save_corrupt') || ''; }
    catch(e){ return ''; }
  }
  /* 当前可取原文的来源，用于界面区分措辞（避免把旧备份说成本次原文）。 */
  function corruptRawSource(){
    if(corruptRawCache) return 'current';                 /* 本次读档失败的原文 */
    let v = '';
    try{ v = localStorage.getItem('xiuxian_save_corrupt') || ''; }catch(e){ v = ''; }
    return v ? 'backup' : '';                             /* 历史自动备份 */
  }
  function downloadCorruptRaw(){
    const txt = corruptRawText();
    const hint = document.getElementById('sv-copy-hint');
    if(!txt){ if(hint) hint.textContent = '没有可导出的原文。'; return false; }
    const r = downloadTextAsFile(txt, '九霄问道-损坏存档原文');
    if(hint) hint.textContent = r.ok
      ? '已生成 ' + r.fn + '（原文 ' + fmtSize(byteLen(txt)) + '）。请妥善保存，可交给维护者或稍后重新导入。'
      : '浏览器拦住了下载，请改用「复制原文」。';
    return r.ok;
  }
  function copyCorruptRaw(){
    const txt = corruptRawText();
    const hint = document.getElementById('sv-copy-hint');
    if(!txt){ if(hint) hint.textContent = '没有可复制的原文。'; return false; }
    const ok = copyTextToClipboard(txt);
    if(hint) hint.textContent = ok
      ? '原文已复制到剪贴板（' + fmtSize(byteLen(txt)) + '）。也可以从下面的文本框手动复制。'
      : '已把原文填到下面的文本框，请全选复制。';
    return ok;
  }
  function readSaveFile(file){
    if(!file) return;
    if(file.size > SAVE_TEXT_MAX){
      const inp = document.getElementById('sv-in');
      if(inp) inp.value = '';
      return showImportError('文件超过 2MB，不像是本游戏的存档');
    }
    const fr = new FileReader();
    fr.onload = () => {
      const text = String(fr.result || '');
      const inp = document.getElementById('sv-in');
      if(inp) inp.value = text;
      previewSaveText(text);
    };
    fr.onerror = () => showImportError('读取文件失败');
    fr.readAsText(file);
  }
  /* 导入核心：把"主档写入"与"侧车恢复"显式分开，并有真实落盘断言守护。
     ⚠️ 关键点：__sidecar 必须从**要被序列化的那个对象**里摘掉，
     先摘再 stringify，落进 SAVE_KEY 的才是纯主档；
     如果先 stringify 再 delete，raw 里仍带着侧车（会随每次 save() 滚回去）。
     返回值：{ raw: 实际写进 SAVE_KEY 的字符串, sideN: 成功恢复的侧车项数 } */
  function writeImportedSave(obj){
    if(!obj || typeof obj !== 'object') return { raw: '', sideN: 0 };
    const side = obj[SIDECAR_FIELD];
    if(side !== undefined){ try{ delete obj[SIDECAR_FIELD]; }catch(e){} }
    const saveObj = Object.assign({}, obj);        /* 再拷一层，确保落盘对象里没有该键 */
    delete saveObj[SIDECAR_FIELD];
    const raw = JSON.stringify(saveObj);
    localStorage.setItem(SAVE_KEY, raw);           /* 失败由调用方 catch */
    const sideN = restoreSidecar(side);            /* 主档写成功后才恢复 */
    return { raw: raw, sideN: sideN };
  }
  function applySaveText(text){
    if(frozenForImport) return showImportError('新存档已写入，请先重新载入');
    const r = parseSaveText(text);
    if(!r.ok) return showImportError(r.err);
    /* 导入不等于离线：把 last 改成此刻，反复导入同一份旧档也刷不到离线收益 */
    r.obj.last = Date.now();
    let wrote = null;
    try{ wrote = writeImportedSave(r.obj); }
    catch(e){ return showImportError('写入本机存档失败（可能空间不足）'); }
    const raw = wrote.raw, sideN = wrote.sideN;
    frozenForImport = true;
    frozenWarned = false;      /* 新一轮冻结：允许再提醒一次 */
    /* 备份已被玩家确认写入主键 → 解除损坏保护闸门（否则重载后仍写不进任何东西）。
       注意 frozenForImport 仍然生效：重载前不自动保存，这是既有设计。 */
    saveBlocked = false;
    frozenBannerShow();        /* 立刻挂常驻横幅：不等第一次 save 触发才提示 */
    const done = document.getElementById('sv-done');
    if(done){
      const meta = saveMeta(r.obj);
      const line = document.getElementById('sv-done-meta');
      if(line) line.textContent = meta.name + ' · ' + meta.rank + ' · 灵石 ' + fmt(meta.stone) + ' · ' + fmtSize(byteLen(raw)) +
        (sideN ? ' · 已恢复本机记录 ' + sideN + ' 项' : '');
      done.classList.add('show');
    }
    const ap = document.getElementById('sv-apply'); if(ap) ap.disabled = true;
    const tin = document.getElementById('sv-in'); if(tin) tin.value = '';
    resetImportPreview();
    saveExportLock(true);
    const hint = document.getElementById('sv-copy-hint');
    if(hint) hint.textContent = '新存档已写入，重新载入后才能导出备份。';
    const card = document.querySelector('#save-modal .m-card');
    if(card) card.classList.add('sv-frozen');
    renderSaveCurrent();
    return true;
  }

  /* 太虚真人引导 V1（2026-11-11）：向引导模块暴露游戏内核接口（读档、发丹、存档、日志都走这里） */
  window.S = S;
  window.addItem = addItem;
  window.saveGame = save;
  window.log = log;

  return {
    boot, reset: resetAll, save,
    /* M-2：只读诊断接口，仅供专项诊断与测试读取（产品业务未消费）。
       failing 只表示「最近一次真实保存结果」，不代表备份是否存在/有效，
       也不代表业务已阻止失败后推进；不新增 window 全局。 */
    _saveHealth: () => ({ failing: saveFailActive, failures: saveFailCount, firstAt: saveFailFirstAt, inited: inited, frozen: frozenForImport }),
    ranks: RANK_NAMES,
    _s: S, _need: needOf, _rate: expRate, _passiveRate: passiveRate, _latePassiveMult: latePassiveMult, _break: doBreakNow, _openBreakConfirm: openBreakConfirm, _confirmBreak: confirmBreakNow,
    _bagMerge: () => lastBagMerge, _bagQty: bagQtyOf, _bagAdd: bagAddQty, _bagCanAccept: bagCanAccept, _countItem: countItem, _removeItems: removeItems,
    _closeBreakConfirm: closeBreakConfirm, _breakParts: breakChanceParts,
    _expGapInt: expGapInt,
    _sign: act, _act: act,
    /* 成本曲线（纯函数）：等级曲线/经济体检的工具要用，导出以免工具自己抄一遍公式 */
    _caveCost: caveCost, _gongCost: gongCost, _fieldCost: fieldCost, _mineCost: mineCost,
    _ponderCost: ponderCost, _ponderPct: () => BAL.ponderPct,
    _wu: () => S.wu, _wuBuy: wuBuy, _wuRespec: wuRespec, _wuCost: wuCostOf, _wuPct: wuPct,
    _wuTree: WU_TREE, _wuMax: WU_MAX, _wuMult: () => ({ exp: wuExpMult(), stone: wuStoneMult(), pow: wuPowMult() }),
    _buy: buy, _offline: offline, _chance: breakChance,
    _grant: grant, _render: render, _renderLog: renderLog, _renderCd: renderCd,
    _buyField: buyField, _buyMine: buyMine, _treasure: treasure, _eat: eatItem,
    _itemDetail: showItemDetail, _itemClose: closeItemDetail,
    _plantPlot: plantPlot, _plantAll: plantAll, _harvestAll: harvestAll,
    _crops: CROPS, _plotCount: plotCount, _ripeCount: ripeCount,
    _craftItem: craftItem, _upgradeBuilding: upgradeBuilding, _buyBag: buyBag,
    _bldLevel: bldLevel, _bldUpgradeCost: bldUpgradeCost, _craftRate: craftRate, _recipeStoneCost: recipeStoneCost,
    _buildings: buildingStates, _recipes: RECIPES, _weaponName: weaponName, _items: ITEMS,
    _variants: DAN_VARIANTS, _variantList: DAN_VARIANT_LIST, _recipeById: recipeById,
    _recipeN: () => S.recipeN, _variantUnlocked: variantUnlocked, _variantCount: variantCount,
    _variantNext: variantNext, _recipeCodex: recipeCodexHtml,
    /* 第 89 节 · 丹药四族九阶：表、派生记录、三个 buff 槽与族内行序，全部只读出给测试 */
    _dan: { all: DAN_BY_ID, list: DAN_LIST, ids: DAN_IDS, fam: DAN_FAM, curve: DAN_CURVE,
      rv4: { list: RV4_DAN_LIST, all: RV4_DAN_BY_ID },
      fx: DAN_FX, segName: DAN_SEG_NAME, sellTier: DAN_SELL_TIER, rowsOf: danRowsOf,
      effect: danEffectText, eat: eatDan, head: danFamHead,
      mineRate: () => minePerSec(),
      buff: () => ({ exp: danExpBuff(), pow: danPowPct(), gain: danGainPct() }),
      state: () => ({ danExp: S.danExp, danPow: S.danPow, danGain: S.danGain }) },
    /* 第 90 节 · 法器四族九阶：表、族内行序、当前阶与三个 hook 现值，全部只读出给测试 */
    _art: { fams: ART_FAMS, fam: ART_FAM, all: ART_BY_ID, ids: ART_IDS, list: ART_LIST,
      curve: ART_CURVE, fx: ART_FX, ore: ART_ORE, mats: ART_MATS, bossN: ART_BOSS_N,
      rowsOf: artRowsOf, effect: artEffectText, name: artName, seg: artSeg,
      powPct: artPowPct, brkPct: artBrkPct, stonePct: artStonePct,
      state: () => S.art },
    _masteryOf: masteryOf, _masteryExp: masteryExp, _masteryNeed: masteryNeed, _masteryCfg: MASTERY,
    _beasts: BEASTS, _eggRate: EGG_RATE, _masteryExpCfg: MASTERY_EXP, _powK: POW_K,
    _rv4Mats: RV4_MATS, _rv4MatById: RV4_MAT_BY_ID, _rv4MatByBeast: RV4_MAT_BY_BEAST,
    _claimQuest: claimQuest, _quests: questList,
    _hunt: startHunt, _stopHunt: stopHunt, _huntTick: huntTick, _killTime: killTime, _power: combatPower,
    _powerSnapshot: multiSnapshot,   /* batch5：服务端战力重算的同一份养成快照 */
    _trace: () => trace, _traceSpawn: traceSpawn, _traceChase: traceChase, _traceLet: traceLet,
    _renderTrace: renderTrace, _tracePaint: tracePaint, _traceTick: traceUiTick,
    _traceReset: () => { trace = null; traceT = 0; traceGap = TRACE.first; renderTrace(); },
    _statBreakdown: statBreakdown, _openPower: openPower, _closePower: closePower,
    /* ===== 存档备份（第 78 节） ===== */
    _saveText: () => { save(); return JSON.stringify(S); },
    _parseSaveText: parseSaveText, _saveMeta: saveMeta,
    _openSave: openSave, _closeSave: closeSave, _renderSave: renderSaveCurrent,
    _previewSave: previewSaveText, _resetImport: resetImportPreview,
    _applySaveText: applySaveText, _readSaveFile: readSaveFile,
    _downloadSave: downloadSave, _copySave: copySave,
    _importFrozen: () => frozenForImport,
    _equipItem: equipItem, _unequipItem: unequipItem, _equipSum: equipPowerSum,
    _equipSlots: EQUIP_SLOTS, _slotName: SLOT_NAME, _equippedId: equippedId, _equippedMeta: equippedMeta,
    _equipCands: equipCands, _slotTap: slotTap, _autoEquip: autoEquip,
    /* 寿元 / 坐化 / 道统（第 96 轮）：UI 与断言一律走这些口，不许自己读 S.life 算 */
    _life: { stage: lifeStage, max: lifeMax, age: lifeAge, left: lifeLeft, on: lifeOn,
             roomSec: lifeRoomSec, stageName: i => STAGE_NAMES[i], names: STAGE_NAMES, table: LIFE_MAX },
    _zuo: isZuo, _zuohua: zuohua, _reborn: reincarnateFromZuohua, _enableLife: enableLife,
    _legacy: { gens: gens, mult: legacyMult, relic: () => (S.legacy && S.legacy.relic) || null,
      pick: () => (S.legacy && S.legacy.pick) || null, hist: () => (S.legacy && S.legacy.hist) || [] },
    _relic: strongestRelic, _relicPicks: relicCandidates, _pickRelic: pickRelic,
    /* 心魔照镜（第 99 轮）：状态 / 心魔战力 / 道心倍率 / 开打 / 是否可开 */
    _mirror: { state: mirrorState, power: mirrorPower, bonus: mirrorExpMult, wins: mirrorWins,
               fight: mirrorFight, ready: mirrorReady, cfg: MIRROR, data: () => S.mirror,
               need: mirrorNeed, calmK: mirrorCalmK,
               calm: { step: calmStep, done: calmDone, count: calmCount, gain: calmExpGain, pick: calmPick, lines: CALM } },
    _renderMirror: renderMirror,
    _renderLifeChip: renderLifeChip, _tick: tick, _load: load,
    _hatch: hatchEgg, _feedPet: feedPet, _petPower: petPowerOf, _petPowerSum: petPowerSum, _petFeedStone: petFeedStoneCost,
    _petApt: petAptitude, _showPetApt: showPetApt,
    _pets: () => S.pets, _eggs: () => S.eggs,
    _sceneFX: buildSceneFX,
    _towerEnter: towerRunStart, _towerDoor: towerRunDoor, _towerQuit: towerRunQuit, _trunSettle: trunSettle,
    /* 截图脚本 / 小黑屋用的「入塔并直接挑镇守门」快捷入口（XX 专用，UI 上没有这个按钮） */
    _challengeTower: () => { if(!trunOn()) towerRunStart(); return towerRunDoor('fight'); },
    _towerRun: () => S.trun, _towerLast: () => S.trunLast, _trunCfg: TRUN, _trunCharms: TCHARMS,
    _sweepTower: sweepTower, _towerPower: towerPower,
    _towerBeast: towerBeast, _openBattleAnim: openBattleAnim, _btTimeline: BT_TL,
    _battleAnim: () => battleAnim, _setBattleAnim: v => { battleAnim = !!v; },
    _cycleAura: cycleAura, _auraCls: () => AURA_CLS[S.swordAura | 0], _auraIdx: () => S.swordAura | 0,
    _enhance: enhanceWeapon, _reroll: rerollAffix, _enhanceCost: enhanceCost, _enhanceChance: enhanceChance,
    _openReroll: openReroll, _rerollSpin: doRerollSpin, _rrCost: RR_COST, _rrCostN: rrCost,
    _rrLocks: () => Array.from(rrLocks), _rankList: rankList,
    _affix: () => S.affix, _enhExpMult: enhanceExpMult, _enhPowMult: enhancePowMult, _affixExpMult: affixExpMult,
    _sign: claimSign, _unionFight: unionFight, _claimUnion: claimUnion,
    _signState: () => S.sign, _union: () => S.union, _unionDay: unionDay, _unionReset: resetUnion,
    /* ===== 山门 · 弟子（第 61 节） ===== */
    _gate: () => S.gate, _gateList: gateList, _gateLv: gateLv, _gateCap: gateCap,
    _gateBuild: gateBuild, _gateUp: gateUp, _gateRecruit: gateRecruit, _gateAssign: gateAssign,
    _gateSettle: gateSettle, _gateBusy: gateBusy, _gateLeft: gateLeft, _gateIdleN: gateIdleN,
    _coopBoss: () => coopBossEnsure(), _coopHit: coopBossHit, _coopClaim: coopBossClaim, _coopWeek: coopWeekKey,
    _coopSum: coopBossSum, _coopServerPower: coopServerPower,
    /* batch5 第 4 项：图纸锻造/周店 + 战力快照（测试出口） */
    _bpList: BLUEPRINTS, _bp: () => Object.assign({}, S.blueprints), _bpGive: bpGive,
    _bpShop: bpShopState, _resetBpShopWeek: resetBpShopWeek, _craftByBlueprint: craftByBlueprint,
    _lingchaoStart: lingchaoStart, _lingchaoTick: lingchaoTick, _lingchaoWindow: lingchaoWindow,
    _lingchaoState: () => S.lingchao,
    _gateBuildCost: gateBuildCost, _gateLvCost: gateLvCost, _gateRecruitCost: gateRecruitCost,
    _gateTasks: GATE_TASKS, _gateApts: GATE_APTS, _gateYieldMult: gateYieldMult,
    /* 弟子成长（第 62 节） */
    _gateApt: gateApt, _gateGraduate: gateGraduate, _gateAptCost: gateAptCost,
    _gateGradN: gateGradN, _gateGradGain: gateGradGain, _gateGradReady: gateGradReady,
    /* 弟子的话（第 63 节） */
    _gateVoice: gateVoice, _gateVoiceTier: gateVoiceTier, _gateVoiceLib: GATE_VOICE,
    _gateVoiceTaskLib: GATE_VOICE_TASK, _gateLast: gateLast, _gateRun: gateRun, _gateRunBand: gateRunBand,
    _gateVoiceHomeLib: GATE_VOICE_HOME, _gateHomeBand: gateHomeBand,
    _gateVoiceBlessLib: GATE_VOICE_BLESS, _gateVoiceFarewellLib: GATE_VOICE_FAREWELL,
    _gateFeng: gateFeng, _gateSvc: gateSvc, _gateAptOf: gateAptOf,
    /* ===== 山门议事（第 103 轮） ===== */
    _council: () => S.council, _councilIssues: COUNCIL, _councilIssue: councilIssue,
    _councilDone: councilDone, _councilIdle: councilIdle, _councilPick: councilPick,
    _councilBlocked: councilBlocked, _councilFx: councilFxText, _councilCostOf: councilCostOf,
    /* ===== 入门八事（第 105 轮）：表 / 进度 / 推进 / 跳转 / 迁移，全给测试留读档口 ===== */
    _trail: { list: TRAIL, max: TRAIL.length, idx: trailIdx, active: trailActive,
      prog: trailProg, tick: trailTick, go: trailGo, render: renderTrail,
      migrate: trailMigrate, cn: TRAIL_CN },
    /* ===== 道途（第 106 轮）：八事之后的长线，与 _trail 同一套口径 ===== */
    _trail2: { list: TRAIL2, max: TRAIL2.length, idx: trail2Idx, active: trail2Active,
      prog: trail2Prog, award: trail2Award, migrate: trail2Migrate, k: TRAIL2_K, cn: TRAIL2_CN },
    /* ===== 轮回（第 107 轮）：第二世起的三关，gen 绑当前世 ===== */
    _trail3: { list: TRAIL3, max: TRAIL3.length, idx: trail3Idx, active: trail3Active,
      prog: trail3Prog, award: trail3Award, migrate: trail3Migrate, cn: TRAIL3_CN },
    /* ===== 洞天开辟（第 70 节） ===== */
    _dt: () => S.dt, _dtMain: () => dtMainId(), _dtMainSet: dtMainSet,
    _dtLv: dtLv, _dtCost: dtCost, _dtMats: dtMats, _dtBonus: dtBonus, _dtEff: dtEff,
    _dtTotals: dtTotals, _dtOpen: dtOpen, _dtCaves: DONGTIAN, _dtK: DT_K, _dtLevels: DT_LV_NAME,
    _bagCap: bagCap, _offlineCap: offlineCapSec,
    _addItem: addItem, _addItemEx: addItemEx, _claimOverflow: claimOverflow,
    _showSettle: showSettle, _claimSign: claimSign, _claimDailyToday: claimDailyToday,
    _showEquipDrop: showEquipDrop, _equipDropInfo: equipDropInfo, _powerGapAdvice: powerGapAdvice,
    _renderToday: renderToday, _nextResetMs: nextDayResetMs, _todayKey: todayKey, _todayNo: todayNo,
    _unlockPoints: UNLOCK_POINTS, _unlockTick: unlockTick, _unlockSeen: unlockSeen, _queueUnlocks: queueUnlocks,
    _renderCodex: renderCodex, _artList: ART_LIST,
    _announce: announce, _annState: () => ({ q: annQueue.length, busy: annBusy, last: annLastAt }),
    _todayKeyAt: todayKeyAt, _todayNoAt: todayNoAt,
    _passFloatState: () => ({ at: passFloatAt, acc: { exp: passAcc.exp, stone: passAcc.stone, ore: passAcc.ore } }),
    _ovEntries: ovEntries, _ovPending: ovPending, _ovLetter: () => (S.letters || []).filter(x => !x.open && ovEntries(x).length)[0] || null,
    _arena: () => S.arena, _challengeArena: challengeArena, _arenaPick: arenaPick, _buyRep: buyRep, _doBuyRep: doBuyRep, _tierOf: tierOf,
    _arenaProxy: arenaProxyPick, _arenaProxyCost: arenaProxyCost, _arenaProxyEligible: arenaProxyEligible,
    _arenaShop: ARENA_SHOP, _towerFight: towerFightCurrent, _towerBossCompLetter: towerBossCompLetter,
    _closeStance: closeStance,
    _confirmAction: confirmAction, _setConfirmHandler: fn => { confirmHandler = typeof fn === 'function' ? fn : null; },
    _stanceOpen: () => { const m = document.getElementById('stance-modal'); return !!m && !m.classList.contains('hidden'); },
    _secretProg: secretProg, _secretReward: secretReward, _challengeSecret: challengeSecret, _secretPick: secretPick, _sweepSecret: sweepSecret,
    _secretTotal: secretTotal, _secretPower: secretPower,
    _market: () => S.market, _buyMarket: buyMarket, _doBuyMarket: doBuyMarket, _sellMarket: sellMarket, _doSellMarket: doSellMarket,
    _sellAll: sellAllMats, _doSellAll: doSellAllMats, _sellAllPlan: sellAllPlan, _refreshMarket: refreshMarket, _sellPrice: sellPrice,
    _spendFloat: spendFloat, _flashEl: flashEl, _chip: gainChip,
    /* ===== 仙途道碑（里程碑） ===== */
    _miles: () => MILES.map(m => ({ id: m.id, g: m.g, n: m.n, h: m.h, at: S.miles[m.id] || 0 })),
    _milesTotal: () => MILE_TOTAL, _milesDone: milesDone, _milesNew: milesNew,
    _checkMiles: checkMiles, _milesSeen: milesMarkSeen, _milesState: () => ({ miles: S.miles, new: S.milesNew }),
    /* ===== 主线《断天门》（表与结算都在 js/story.js，这里只给测试留读档口） ===== */
    _story: () => (S.story && S.story.claimed) || {},
    _heroRank: () => { const l = rankList(); const i = l.findIndex(r => r.me); return i < 0 ? 99 : i + 1; },
    /* ===== 沈碑 NPC（识人 · 守碑老吏，第 108 轮）：纯信息+情感，零数值产出 ===== */
    _npc: () => S.npcs, _npcStele: () => S.npcs.stele,
    /* 识人页（切片 2b）：路由钩子与选项委托走这里；_npcUi 只给测试读页面临时态 */
    _npcPageSync: npcPageSync, _npcChoose: npcChoose, _npcOpenTopic: npcOpenTopic,
    _cuijiu: { enter: cuijiuEnter, pick: cuijiuPick, render: renderCuijiu, event: cuijiuEventChoose,
               rel: () => (S.npcs && S.npcs.cuijiu) || null,
               visits: () => (cuijiuUi && Array.isArray(cuijiuUi.visits)) ? cuijiuUi.visits.slice() : [],
               echo: () => (cuijiuUi && cuijiuUi.echo) || '' },   /* 崔九：enter/pick/event/render + 只读快照（第 5 阶段） */
    _multi: { enter: multiEnter, render: renderMulti, act: multiAct },   /* 联机（115 轮）：测试出口——enter/render/动作都从这走 */
    /* 阶段四 C3（D4 A2-LOCAL）：本地陪练测试出口。引擎本体在 js/multi-local.js（纯逻辑、可 node --test），
       这里只暴露装配层的开局/动作/读态，供专项实测「单人走通五层 + 16000 灵石入账 + 幂等 + 崔九钩子」。 */
    _multiLocal: {
      start: multiLocalStart, act: multiLocalAct, active: multiLocalActive,
      run: () => multiLocalRun, settle: () => multiLocalSettle,
      view: () => (multiLocalRun && window.MultiLocal) ? MultiLocal.view(multiLocalRun) : null,
      applySettle: multiApplySettle
    },
    _npcUi: () => npcUi, _npcHeardTotal: npcHeardTotal,
    _resetAll: resetAll, _resetForNewLife: resetForNewLife,
    /* ===== rv4 扩展：唯一容器 / 四表 / 共同最高 / 万兽谱 / 猎妖（旁挂测试同源） ===== */
    _rv4: {
      state: () => ensureRv4(), mats: RV4_MATS, matById: RV4_MAT_BY_ID, matByBeast: RV4_MAT_BY_BEAST,
      souls: RV4_SOUL_ROWS, soulById: RV4_SOUL_BY_ID,
      equips: RV4_EQUIP_ROWS, equipById: RV4_EQUIP_BY_ID,
      tiers: RV4_BESTIARY_TIERS, hasSoul: rv4HasSoul, soulMax: rv4SoulMax, soulAt: rv4SoulAt,
      oldArtSeg: oldArtSeg, artSeg: artSeg, found: rv4Found, progress: bestiaryProgress,
      claim: claimBestiary, render: renderBestiary, empty: emptyRv4
    },
    _startHunt: startHunt, _stopHunt: stopHunt, _huntTick: huntTick, _renderHunt: renderHunt,
    _renderBestiary: renderBestiary,
    /* ===== 信匣（离线见闻） ===== */
    _letters: () => (S.letters || []).map(x => ({ id: x.id, kind: x.kind, day: x.day, text: x.text, rw: x.rw, open: x.open })),
    _letterCount: letterCount, _openLetter: openLetter, _makeLetters: makeLetters, _pushLetters: pushLetters,
    _renderLetters: renderLetters,
    _sellAll: sellAllMats, _doSellAll: doSellAllMats, _sellAllPlan: sellAllPlan, _refreshMarket: refreshMarket, _sellPrice: sellPrice,
    _marketGoods: () => { resetMarket(); return S.market.goods.map(s => ({ g: marketItem(s.id), price: s.price, bought: s.bought })); },
    _marketPoolIds: () => MARKET_POOL.map(g => g.id),
    /* ===== 全局突破系统（配置表 + 顿悟进度/悟道值双轨 + 丹药分级 + 辅助道具） ===== */
    _attemptBreak: attemptBreakthrough, _breakState: breakState, _breakChanceWith: breakChanceWith, _breakChanceFinal: breakChanceFinal, _breakSoftKnee: breakSoftKnee,
    _pillValid: pillValid, _wisdomShop: wisdomShop, _exchangeWisdom: exchangeWisdom, _buyGuard: buyGuard,
    /* ===== 天机阁（限购 / 动态价格 / 购买统一入口） ===== */
    _shopCfg: SHOP_CFG, _shopPrice: shopPrice, _shopLimit: shopLimitState, _shopSoldOut: shopSoldOut,
    _buyShop: doBuyShop, _buyShopConfirm: buyShop, _resetShopWeek: resetShopWeek, _weekKey: weekKey, _wisdomGain: wisdomGain,
    _stoneRate: stoneRate, _needOf: needOf, _offline: offline, _bal: BAL,
    _breakTiers: BREAK_TIERS, _wisdomCfg: WISDOM, _breakPills: BREAK_PILLS, _breakGuards: BREAK_GUARDS,
    /* 阶段一（路3）只读口：闸门表 / 当日主动预算与折算，供测试用模拟时钟逐门核对 */
    _breakGates: BREAK_GATES, _breakCd: BREAK_CD, _gateCdMs: gateCdMs,
    _secludeTs: secludeTs, _secludeLeftMs: secludeLeftMs,
    _activeBudget: activeBudget, _activeEff: activeEff, _addActiveExp: addActiveExp,
    _sweepExpCap: sweepExpCap, _ensureDay: ensureDay, _daoExpMult: daoExpMult,
    _daoStoneMult: daoStoneMult, _imprintExpMult: imprintExpMult, _legacyChainMult: legacyChainMult,
    _breakImprintK: breakImprintK, _imprintCfg: IMPRINT,
    _wisdomShopCfg: SHOP_CFG.items,
    _pillHint: pillHintText, _weaponHint: weaponHintText, _craftCfg: CRAFT,
    /* ===== 随机奇遇（挂机气泡 / 古风弹窗 / 选项结算） ===== */
    _encCfg: ENC, _encounters: ENCOUNTERS, _encState: () => S.enc, _encBuff: encBuff,
    _advEvents: ADV_EVENTS, _openAdventure: openAdventure, _resolveAdventure: resolveAdventure, _advFoeCur: () => advFoeCur,
    _advWinStone: advWinStone, _advLossExp: advLossExp, _advEscapeExp: advEscapeExp,
    _rankByPower: rankByPower,
    _resetCd: () => { Object.keys(CD).forEach(k => { CD[k] = 0; }); },
    _encTick: encTick, _encSpawn: encSpawn, _openEncounter: openEncounter,
    _closeEncounter: closeEncounter, _resolveEncounter: resolveEncounter, _encApplyFx: encApplyFx,
    /* ===== 立绘选角（创角界面 / 性别立绘切换） ===== */
    _heroImgs: HERO_IMGS, _heroImg: heroImg, _sexOpts: SEX_OPTS,
    /* 阶段二 N11：道途九段矩阵只读口（测试/呈现同源） */
    _pathIds: PATH_IDS, _pathNames: PATH_NAMES, _pathBonus: PATH_BONUS,
    _pathSegIndex: pathSegIndex, _pathBonusFor: pathBonusFor, _pathBonusPct: pathBonusPct,
    _pathBonusLabel: pathBonusLabel, _pathBonusTable: pathBonusTable, _pathBonusSegText: pathBonusSegText,
    _assertPathBonusNoDrift: assertPathBonusNoDrift,
    _renderCharPreview: renderCharPreview, _confirmChar: confirmChar,
    _renderPathPreview: renderPathPreview, _showPathInfo: showPathInfo, _pathOpts: PATH_OPTS,
    _showCharModal: showCharModal,
    _genderOf: genderOf, _sexOf: sexOf,
    /* ===== 闭关归来弹窗 + 入口红点（2026-10-24）===== */
    _offlineModal: showOffline, _lastOffline: () => lastOfflineInfo, _initDots: initEntryDots, _dots: renderDots,
    _dailyClaimable: dailyClaimable,
    /* ===== 战利品浮现（2026-10-24）===== */
    _lootRowHTML: lootRowHTML, _showBattleLoot: showBattleLoot, _lootFloat: lootFloat,
    /* ===== 灵兽诞生 · 孵化演出（2026-10-25）===== */
    _hatchCeremony: showHatchCeremony
  };
})();

/* ============================================================
 * 宗门互助（可选；依赖 server/sect-server.js，连不上自动降级）
 * ============================================================ */
const SECT = (function(){
  const PID_KEY = 'arcade_sect_pid';
  const HOST_KEY = 'arcade_sect_host';
  const NICK_KEY = 'arcade_nick';
  const POLL_MS = 25000;

  let host = '', pid = '', nick = '';
  let online = false, ready = false, booting = false, connecting = false, busy = false;
  let me = null, list = [], req = null;
  let bonus = 0.07, bonusNow = 0;
  let stats = null;                 /* 山门气象：全服活跃度快照 */
  let powerBoard = null, powerBoardAt = 0;   /* batch5：战力榜缓存（25 秒轮询刷新） */
  let powerShown = -1, powerDebounce = 0, powerWatchTimer = 0, powerHeartTimer = 0;
  let timer = 0, noteTxt = '', noteCls = '';

  function ensurePid(){
    try{
      let v = localStorage.getItem(PID_KEY);
      if(!v || !/^p[0-9a-zA-Z_-]{8,40}$/.test(v)){
        const rnd = [];
        const chars = '0123456789abcdefghijkmnpqrstuvwxyz';
        for(let i = 0; i < 12; i++) rnd.push(chars[Math.floor(Math.random() * chars.length)]);
        v = 'p' + rnd.join('');
        localStorage.setItem(PID_KEY, v);
      }
      pid = v;
    }catch(e){ pid = 'plocalguest00'; }
  }
  function readNick(){
    let n = '';
    try{ n = localStorage.getItem(NICK_KEY) || ''; }catch(e){}
    /* 2026-11-19 第 15 条：没手填时，联机身份跟当前角色名一致，不再默认「散修xxx」 */
    if(!n){
      try{ if(typeof XX !== 'undefined' && XX._s && XX._s.name) n = XX._s.name; }catch(e){}
    }
    n = (n || '').replace(/[<>]/g, '').trim();
    if(!n) n = '散修' + pid.slice(-3);
    nick = n.slice(0, 12);
  }
  function refreshNick(){ readNick(); render(); }

  /* 只接受远程 http(s) 地址；旧档残留的本机地址一律清空，默认走部署站点同源服务。 */
  function safeHost(h){
    try{
      const raw = String(h || '').trim();
      if(!raw) return '';
      const u = new URL(raw);
      if(u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      if(['localhost','127.0.0.1','0.0.0.0','[::1]','::1'].indexOf(u.hostname) >= 0) return '';
      return u.href.replace(/\/+$/, '');
    }catch(e){ return ''; }
  }

  /* 候选优先级：分享地址 > 已保存的远程地址 > 本站同源；不再探测本机服务。 */
  function candidates(env){
    const real = !env;
    const out = [];
    const push = h => { h = safeHost(h); if(h && out.indexOf(h) < 0) out.push(h); };
    let search = '', proto = '', origin = '', stored = '';
    try{
      search = real ? location.search : (env.search || '');
      proto = real ? location.protocol : (env.protocol || '');
      origin = real ? location.origin : (env.origin || '');
      stored = safeHost(real ? (localStorage.getItem(HOST_KEY) || '') : (env.stored || ''));
      if(real && localStorage.getItem(HOST_KEY) && !stored) localStorage.removeItem(HOST_KEY);
    }catch(e){}
    let q = '';
    try{
      q = safeHost(new URLSearchParams(search).get('sect'));
      if(q){ push(q); if(real){ try{ localStorage.setItem(HOST_KEY, q); }catch(e){} } }
      push(stored);
    }catch(e){}
    /* file:// 无远程配置时不探活；http(s) 部署默认认同源。 */
    if(proto === 'file:' && !q && !stored) return out;
    if(proto === 'http:' || proto === 'https:') push(origin);
    return out;
  }

  function withTimeout(p, ms){
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timeout')), ms || 4000);
      p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
    });
  }
  async function ping(h){
    try{
      const r = await withTimeout(fetch(h + '/api/sect/health', { cache: 'no-store' }), 2500);
      const j = await r.json();
      return !!(j && j.ok);
    }catch(e){ return false; }
  }
  /* 并发探活，等全部落定后取「序号最小的活口」：优先级不丢，
     又不会像串行那样把每个死地址的 2.5 秒超时累加起来（候选一多，玩家要干等十几秒才认输）。 */
  async function firstAlive(list){
    const hit = await Promise.all((list || []).map(h => ping(h).then(ok => (ok ? h : ''))));
    for(let i = 0; i < hit.length; i++) if(hit[i]) return hit[i];
    return '';
  }

  function qs(o){
    const p = new URLSearchParams();
    Object.keys(o).forEach(k => { if(o[k] != null) p.set(k, String(o[k])); });
    return p.toString();
  }
  async function readJson(r){
    if(!r || !r.ok) throw new Error('HTTP ' + (r ? r.status : '?'));
    try{ return await r.json(); }catch(e){ throw new Error('BAD_JSON'); }
  }
  function errTag(e){
    const m = e && /HTTP \d+/.exec(String(e.message || ''));
    return m ? '（' + m[0] + '）' : '';
  }
  async function get(name, params){
    const r = await withTimeout(fetch(host + '/api/sect/' + name + '?' + qs(Object.assign({ pid, nick }, params || {})), { cache: 'no-store' }), 6000);
    return readJson(r);
  }
  async function post(name, body){
    /* 服务端对所有请求（含 POST）都要求 URL query 上带合法 pid，且 body.pid 必须与 query.pid 相等
       （防冒充：光有 body 不够，谁截到别人 pid 也没法只在 body 里伪造）。以前只在 body 里带 pid，
       query 为空 → 服务端 196 行直接拒「玩家标识无效」→ 发起求助/护法/结算/领取这些 POST 动作全废。
       与 get() 一致：query 带 pid/nick，body 也带，两边相等。 */
    const r = await withTimeout(fetch(host + '/api/sect/' + name + '?' + qs({ pid, nick }), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ pid, nick }, body || {}))
    }), 6000);
    return readJson(r);
  }

  function rankNo(){ try{ return XX._s.rank | 0; }catch(e){ return 0; } }
  function rankName(i){ return XX.ranks[i] || ('第 ' + i + ' 层'); }
  function fmt(n){
    n = Math.floor(n || 0);
    if(n < 10000) return String(n);
    if(n < 1e8) return (n / 1e4).toFixed(n < 1e6 ? 2 : 1) + '万';
    return (n / 1e8).toFixed(2) + '亿';
  }
  function fmtDur(ms){
    const s = Math.max(0, Math.round(ms / 1000));
    if(s < 60) return s + ' 秒';
    return Math.floor(s / 60) + ' 分';
  }
  function note(t, cls){ noteTxt = t || ''; noteCls = cls || ''; }
  function el(id){ return document.getElementById(id); }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  function render(){
    /* 第 88 轮 B 拆页：山门气象自成一页，互助那页没有 sc-box。
       气象先写，否则「没 sc-box 就早退」会把降级文案一起吞掉。 */
    renderWeather();
    renderPower();
    const box = el('sc-box');
    if(!box) return;
    const quota = el('sc-quota');
    if(quota){
      quota.textContent = online && me
        ? '护法 ' + me.guard + '/' + me.guardMax + ' · 求助 ' + me.pub + '/' + me.pubMax
        : (connecting ? '连接中…' : '未连接');
      quota.className = 'sc-quota' + (online ? '' : ' off');
    }
    const mine = el('sc-mine');
    if(mine) mine.innerHTML = viewMine();
    const li = el('sc-list');
    if(li) li.innerHTML = viewList();
    const nt = el('sc-note');
    if(nt){ nt.textContent = noteTxt; nt.className = 'sc-note' + (noteCls ? ' ' + noteCls : ''); }
    XX._render();
  }

  /* ---- 山门气象：全服活跃度 ----
     stats = { members, online, active, todayGuard, todayPub, requests, events[], roster[] } */
  function renderWeather(){
    const wq = el('sc-wq');
    const sb = el('sc-stats');
    const rb = el('sc-roster');
    const eb = el('sc-events');
    if(!sb) return;
    if(!stats || !online){
      if(wq){
        wq.textContent = connecting ? '连接中…' : (online ? '读取中…' : '未连接');
        wq.className = 'sc-quota' + (connecting ? '' : ' off');
      }
      sb.innerHTML = '<div class="sc-none">' + (connecting ? '正在连接互助服务…' : '山门气象需连上互助服务。') + '</div>' +
        (noteTxt ? '<p class="sc-note ' + esc(noteCls) + '">' + esc(noteTxt) + '</p>' : '') +
        '<button type="button" class="btn-sub" data-sect-retry>重新连接</button>';
      if(rb) rb.innerHTML = '';
      if(eb) eb.innerHTML = '';
      return;
    }
    if(wq){ wq.textContent = '此刻在场 ' + stats.online + ' 人'; wq.className = 'sc-quota'; }
    sb.innerHTML =
      '<div class="sc-stat"><b>' + stats.active + '</b><span>今日活跃</span></div>' +
      '<div class="sc-stat"><b>' + stats.todayGuard + '</b><span>今日护法</span></div>' +
      '<div class="sc-stat"><b>' + stats.todayPub + '</b><span>今日求助</span></div>' +
      '<div class="sc-stat"><b>' + stats.members + '</b><span>在册同门</span></div>';
    /* 在场名录：境界高者在前，最多 8 人 */
    if(rb){
      const rs = stats.roster || [];
      if(!rs.length){ rb.innerHTML = '<div class="sc-none">此刻山门空寂，暂无同门在场。</div>'; }
      else{
        rb.innerHTML = '<div class="sc-listhead"><span>在场同门</span><span>共 ' + stats.online + ' 人</span></div>' +
          '<div class="sc-rlist">' + rs.slice(0, 8).map(x =>
            '<span class="sc-rchip">' + esc(x.nick) + '<em>' + rankName(x.rank) + '</em></span>').join('') + '</div>';
      }
    }
    /* 动态时间轴：最近 8 条同门动向 */
    if(eb){
      const evs = stats.events || [];
      if(!evs.length){ eb.innerHTML = '<div class="sc-none">山门尚无动静。</div>'; }
      else{
        eb.innerHTML = '<div class="sc-listhead"><span>山门动向</span></div>' +
          '<div class="sc-elist">' + evs.slice(0, 8).map(e =>
            '<div class="sc-ev sc-ev-' + esc(e.kind) + '"><i></i><span>' + esc(e.text) + '</span><em>' + fmtAgo(e.t) + '</em></div>').join('') + '</div>';
      }
    }
  }
  /* 动态时间戳；缺失/非法时间不按 Unix 纪元计算。 */
  function fmtAgo(t){
    const at = Number(t);
    if(!Number.isFinite(at) || at <= 0) return '—';
    const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
    if(s < 60) return '刚刚';
    if(s < 3600) return Math.floor(s / 60) + ' 分前';
    if(s < 86400) return Math.floor(s / 3600) + ' 时前';
    return Math.floor(s / 86400) + ' 日前';
  }

  /* ---- 战力榜（batch5 第 4 项 · 乙案） ----
     客户端每 2 秒防抖同步一次养成快照，60 秒心跳；服务端重算后回 power/at。
     榜单上限 50，只显示服务端认可的战力，不显示 pid。 */
  async function powerReport(){
    if(!ready || !online) return null;
    let snap = null;
    try{ snap = XX._powerSnapshot ? XX._powerSnapshot() : null; }catch(e){}
    if(!snap) return null;
    try{
      const r = await post('power', { snapshot: snap, ver: 1 });
      if(r && r.ok){
        if(powerBoard && powerBoard.me){
          powerBoard.me.power = r.power; powerBoard.me.at = r.at; powerBoard.me.fresh = true;
        }
        return r;
      }
    }catch(e){}
    return null;
  }
  /* 战力变化 → 2 秒防抖；心跳 60 秒。计时器只挂一次，断开连接时自然跳过。 */
  function powerWatch(){
    if(powerWatchTimer) return;
    powerWatchTimer = setInterval(() => {
      if(!online || !ready) return;
      let cur = 0;
      try{ cur = XX._power ? Math.floor(XX._power()) : 0; }catch(e){ return; }
      if(cur === powerShown) return;
      powerShown = cur;
      if(powerDebounce) clearTimeout(powerDebounce);
      powerDebounce = setTimeout(() => { powerDebounce = 0; powerReport(); }, 2000);
    }, 1000);
    powerHeartTimer = setInterval(() => { if(online && ready) powerReport(); }, 60000);
  }
  async function fetchPowerBoard(){
    try{
      const pb = await get('powerboard', {});
      if(pb && pb.ok){ powerBoard = pb; powerBoardAt = Date.now(); renderPower(); return pb; }
    }catch(e){}
    return null;
  }
  function renderPower(){
    const box = el('sc-pw-list');
    if(!box) return;
    const st = el('sc-pw-state');
    if(!online){
      if(st){ st.textContent = connecting ? '连接中…' : '未连接'; st.className = 'sc-quota' + (connecting ? '' : ' off'); }
      box.innerHTML = '<div class="sc-none">' + (connecting ? '正在连接互助服务…' : '战力榜需连上互助服务。') + '</div>';
      return;
    }
    const pb = powerBoard;
    if(!pb || !pb.ok){
      if(st){ st.textContent = '读取中…'; st.className = 'sc-quota'; }
      box.innerHTML = '<div class="sc-none">榜单读取中…</div>';
      return;
    }
    if(st){ st.textContent = '已同步 ' + pb.total + ' 人 · 每 25 秒刷新'; st.className = 'sc-quota'; }
    const list = pb.list || [];
    let h = '<div class="sc-listhead"><span>名次 · 道号</span><span>战力</span></div>';
    if(!list.length){
      h += '<div class="sc-none">尚无同门同步战力。进入宗门后会自动同步。</div>';
    }else{
      h += list.map(x => '<div class="sc-pw-row' + (x.me ? ' me' : '') + '">' +
        '<span class="sc-pw-no">' + x.no + '</span>' +
        '<b class="sc-pw-nick">' + esc(x.nick) + '</b>' +
        '<em class="sc-pw-rank">' + rankName(x.rank) + '</em>' +
        '<span class="sc-pw-val">' + fmt(x.power) + '</span>' +
        '<small class="sc-pw-ago">' + fmtAgo(x.at) + '</small></div>').join('');
    }
    h += '<p class="sc-hint">' + ((pb.me && pb.me.fresh)
      ? '你的战力：' + fmt(pb.me.power) + ' · ' + fmtAgo(pb.me.at) + (pb.me.rank ? ' · 第 ' + pb.me.rank + ' 名' : '')
      : '你的战力尚未同步，稍后自动同步。') + '</p>';
    box.innerHTML = h;
  }

  function viewMine(){
    if(!online){
      return '<div class="sc-off">' +
        '<b>' + inkIco('⛩️') + '山门未开</b>' +
        '<p>互助得有人记住「谁帮了谁」，所以要连上山门服务。连不上时游戏照常挂机，进度一点不少。</p>' +
        '<p>每 25 秒会自己再试一次；默认连接本站山门。需要其他入口时，可在「设置 · 宗门连接」填写。</p>' +
        '<button type="button" class="btn-sub" data-act="retry">重新连接</button>' +
        '</div>';
    }
    if(req){
      const n = req.guards, full = n >= req.slots;
      return '<div class="sc-req">' +
        '<div class="sc-req-top"><b>求助已贴出</b><span>剩 ' + fmtDur(req.leftMs) + '</span></div>' +
        '<div class="sc-req-mid">' +
          '<span class="sc-pips">' + pips(n, req.slots) + '</span>' +
          '<span>' + (n ? '护法 +' + Math.round(n * bonus * 100) + '% 成功率' : '还没有人来') + '</span>' +
        '</div>' +
        '<div class="sc-req-bot">' +
          '<button type="button" class="sc-mini" data-act="cancel">撤回</button>' +
          '<span class="sc-hint">' + (full ? '人满了，点上面的「突破」结算' : '可以边等边攒，点「突破」时一起结算') + '</span>' +
        '</div>' +
        '</div>';
    }
    let can = false;
    try{ can = XX._s.exp >= XX._need(XX._s.rank) && XX._s.rank < XX.ranks.length - 1; }catch(e){}
    const left = me ? (me.pubMax - me.pub) : 0;
    const dis = (!can || left <= 0 || busy) ? ' disabled' : '';
    let tip;
    if(left <= 0) tip = '今天的求助次数用完了，明天再来';
    else if(!can) tip = '修为攒满一条突破进度才能求助';
    else tip = '贴出求助后，同门护法能让你突破成功率最高 +21%';
    return '<div class="sc-empty">' +
      '<button type="button" class="sc-pub" data-act="pub"' + dis + '>📣 发起求助 · 突破' + rankName(rankNo() + 1) + '</button>' +
      '<p class="sc-hint">' + tip + '</p>' +
      '</div>';
  }
  function pips(n, max){
    let s = '';
    for(let i = 0; i < max; i++) s += '<i class="' + (i < n ? 'on' : '') + '"></i>';
    return s;
  }
  function viewList(){
    if(!online) return '';
    if(!list.length) return '<div class="sc-none">求援榜空空如也。挂一会儿，或者自己发一个。</div>';
    const out = list.map(it => {
      const full = it.guards >= it.slots;
      return '<div class="sc-item">' +
        '<div class="sc-it-main">' +
          '<div class="sc-it-name">' + esc(it.nick) + '<em>' + rankName(it.rank) + '</em></div>' +
          '<div class="sc-it-sub">护法 ' + it.guards + '/' + it.slots + ' · 剩 ' + fmtDur(it.leftMs) + '</div>' +
        '</div>' +
        '<button type="button" class="sc-go" data-act="guard" data-id="' + esc(it.id) + '"' +
          (full || busy ? ' disabled' : '') + '>护法<br><small>+' + fmt(it.stone) + ' 灵石</small></button>' +
        '</div>';
    }).join('');
    const left = me ? (me.guardMax - me.guard) : 0;
    return '<div class="sc-listhead"><span>求援榜</span><span>今日还可护法 ' + Math.max(0, left) + ' 次</span></div>' + out;
  }

  async function publish(){
    if(!online || busy) return;
    let s, need;
    try{ s = XX._s; need = XX._need(s.rank); }catch(e){ return; }
    if(s.rank >= XX.ranks.length - 1){ note('已经飞升，没有能求助的境界了。', 'bad'); render(); return; }
    if(s.exp < need){ note('修为还没攒满，先攒满再求助。', 'bad'); render(); return; }
    busy = true; note('正在贴求助…'); render();
    let r;
    try{ r = await post('publish', { rank: s.rank, ready: true }); }
    catch(e){ online = false; busy = false; note('连不上互助服务' + errTag(e) + '，可点「重新连接」重试。', 'bad'); render(); return; }
    busy = false;
    if(r.ok){
      req = r.req; me = r.me; bonus = r.bonus; bonusNow = 0;
      /* 有效期直接用服务端返回的 leftMs 派生，别硬编码分钟数——服务端 REQUEST_MS 一旦调整
         （2026-10-27 由 10 分钟改为 30 分钟），写死的文案就会和面板上的「剩 N 分」自相矛盾。 */
      note('求助已贴出，等同门来护法。' + fmtDur(req && req.leftMs || 0) + '内有效。', 'good');
      sfx.click();
      refreshSoon();
    }else{
      note(r.msg || '发布失败', 'bad');
    }
    render();
  }
  async function guard(id){
    if(!online || busy || !id) return;
    busy = true; note('护法中…'); render();
    let r;
    try{ r = await post('guard', { reqId: id }); }
    catch(e){ online = false; busy = false; note('连不上互助服务' + errTag(e) + '，可点「重新连接」重试。', 'bad'); render(); return; }
    busy = false;
    if(r.ok){
      me = r.me;
      note((r.note || '护法成功') + '，预计得 ' + fmt(r.preview) + ' 灵石。', 'good');
      sfx.pop();
      const rm = list.findIndex(x => x.id === id);
      if(rm >= 0) list.splice(rm, 1);
    }else{
      note(r.msg || '护法失败', 'bad');
    }
    render();
  }
  async function cancelReq(){
    if(!online || !req || busy) return;
    confirmAction({
      icon:'📮', title:'宗门互助 · 确认撤回', okText:'确认撤回',
      text:'撤回当前求助？<br>今天已经用掉的发布次数不会退。',
      foot:'确认后才向互助服务发送撤回请求。'
    }, async ok => {
      if(!ok || !online || !req || busy) return;
      busy = true;
      let r;
      try{ r = await post('cancel', { reqId: req.id }); }
      catch(e){ online = false; busy = false; note('连不上互助服务' + errTag(e) + '，可点「重新连接」重试。', 'bad'); render(); return; }
      busy = false;
      if(r.ok){ req = null; me = r.me; note('求助已撤回。', ''); }
      else note(r.msg || '撤回失败', 'bad');
      render();
    });
  }
  async function claim(){
    if(!online) return null;
    let r;
    try{ r = await post('claim', {}); }catch(e){ note('领取暂时失败' + errTag(e) + '，稍后自动重试。', 'bad'); return null; }
    if(!r || !r.ok) return null;
    if(r.stone > 0 || r.exp > 0){
      XX._grant(r.exp, r.stone);
      note('领取：' + (r.exp ? '修为 +' + fmt(r.exp) + ' ' : '') + (r.stone ? '灵石 +' + fmt(r.stone) : ''), 'good');
    }
    if(me){ me.pendStone = 0; me.pendExp = 0; }
    return r;
  }

  function bonusRate(){
    if(!online || !req) return 0;
    return Math.min(3, req.guards) * bonus;
  }
  async function afterBreak(success, rankBefore){
    if(!online || !req) return;
    const id = req.id;
    try{
      const r = await post('settle', { reqId: id, rank: rankBefore, success: !!success });
      if(r.ok){
        req = null; me = r.me; bonusNow = 0;
        if(r.guards > 0){
          note('结算：' + r.guards + ' 位同门护法，修为 +' + fmt(r.expGain) + (r.expCapped ? '（已到今日上限）' : ''), 'good');
        }else{
          note('这次没人护法，求助已自动关闭。', '');
        }
        await claim();
        refreshSoon();
      }else if(r.err === 'gone'){ req = null; }
    }catch(e){ note('结算结果暂时失败' + errTag(e) + '，可稍后重试。', 'bad'); }
    try{ render(); }catch(e){}
  }

  function refreshSoon(){ setTimeout(() => { refresh(); }, 1200); }
  async function refresh(){
    if(!ready) return;
    const rk = rankNo();
    try{
      const a = await get('me', { rank: rk });
      if(!a || !a.ok) throw new Error('bad');
      online = true;
      me = a.me; req = a.req; bonus = a.bonus || 0.07; bonusNow = a.bonusNow || 0;
      nick = a.nick || nick;
      if(me && (me.pendStone > 0 || me.pendExp > 0)) await claim();
      const b = await get('board', { rank: rk });
      if(b && b.ok){ list = b.list || []; if(b.me) me = b.me; }
      /* 山门气象：全服聚合（失败不拖累互助主流程） */
      try{
        const st = await get('stats', { rank: rk });
        if(st && st.ok) stats = st;
      }catch(e){}
      /* 战力榜：进页面拉一次 + 25 秒轮询（与互助主流程同频） */
      await fetchPowerBoard();
      render();
    }catch(e){
      if(online) note('互助服务连不上了' + errTag(e) + '，先挂机，等会儿自动重连；也可点「重新连接」。', 'bad');
      online = false;
      render();
    }
  }
  function pollTick(){
    if(document.hidden) return;
    if(!ready){ boot(); return; }
    refresh();
    chatPull();
  }
  function startPoll(){
    if(timer) clearInterval(timer);
    timer = setInterval(pollTick, POLL_MS);
  }

  async function boot(){
    try{ await bootInner(); }catch(e){ booting = false; connecting = false; online = false; note('山门服务连接失败' + errTag(e) + '，可点「重新连接」。', 'bad'); try{ render(); }catch(x){} }
  }
  async function bootInner(){
    if(booting) return;
    if(ready){ refresh(); return; }
    booting = true; connecting = true;
    /* ⚠️ buildSceneFX 是 XX 模块私有函数，SECT 里裸调会 ReferenceError 把整个 boot 炸掉
       （历史 bug：宗门服务因此从来没连上过、背景粒子层也一直是空的）→ 必须经 XX 调 */
    ensurePid(); readNick(); bindUI(); render();
    try{ if(XX._sceneFX) XX._sceneFX(); }catch(e){}
    const cands = candidates();
    const okHost = await firstAlive(cands);
    booting = false; connecting = false;
    /* 探活全灭也要把轮询挂上：pollTick 见到 !ready 就会重新 boot。
       否则首屏没连上的页面永远不会自己重试（服务后起来、隧道刚开都得玩家手点「重新连接」）。 */
    if(!okHost){ ready = false; online = false; render(); startPoll(); return; }
    host = okHost;
    ready = true; online = true;
    powerWatch();
    await powerReport();          /* 登入/进入宗门：先报一次快照 */
    try{ powerShown = Math.floor(XX._power()); }catch(e){}
    await refresh();
    startPoll();
  }
  /* 设置里改完服务地址后重连 */
  function reconnect(){
    ready = false; online = false; booting = false;
    boot();
  }

  function bindUI(){
    /* 气象页的「重新连接」也要生效（该页没有 sc-box，单靠下面的委托绑不到） */
    if(!document.documentElement.dataset.sectRetry){
      document.documentElement.dataset.sectRetry = '1';
      document.addEventListener('click', ev => {
        const b = ev.target && ev.target.closest ? ev.target.closest('[data-sect-retry]') : null;
        if(!b) return;
        ready = false; boot();
      });
    }
    const box = el('sc-box');
    if(!box || box.dataset.bound) return;
    box.dataset.bound = '1';
    box.addEventListener('click', ev => {
      const t = ev.target;
      const btn = t && t.closest ? t.closest('[data-act]') : null;
      if(!btn || btn.disabled) return;
      const act = btn.getAttribute('data-act');
      if(act === 'pub') publish();
      else if(act === 'guard') guard(btn.getAttribute('data-id'));
      else if(act === 'cancel') cancelReq();
      else if(act === 'retry'){ ready = false; boot(); }
    });
  }

  /* ---- 世界频道（传音）：seq 增量追更，未读计数驱动侧栏红点 ---- */
  let chatSince = 0, chatMsgs = [], chatUnread = 0, chatTimer = 0, chatLive = false, chatSending = false;

  function chatMerge(list){
    (list || []).forEach(m => {
      if(m.seq > chatSince) chatSince = m.seq;
      chatMsgs.push(m);
    });
    if(chatMsgs.length > 200) chatMsgs = chatMsgs.slice(-200);
  }
  async function chatPull(){
    if(!ready) return;
    try{
      const r = await withTimeout(fetch(host + '/api/chat/history?since=' + chatSince + '&' + qs({ pid, nick }), { cache: 'no-store' }), 6000);
      const j = await r.json();
      if(j && j.ok){
        const fresh = (j.list || []).filter(m => !m.sys && !m.mine);
        chatMerge(j.list);
        if(fresh.length && !chatLive) chatUnread += fresh.length;
        chatRender();
      }
    }catch(e){}
  }
  async function chatSend(text){
    if(!ready) return '传音阵未启';
    if(chatSending) return '';
    text = String(text || '').trim();
    if(!text) return '说点什么再发';
    chatSending = true;
    let out = '连不上传音阵';
    try{
      const r = await withTimeout(fetch(host + '/api/chat/send?' + qs({ pid, nick }), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid, nick, text: text.slice(0, 60), since: chatSince })
      }), 6000);
      const j = await r.json();
      if(j && j.ok){ chatMerge(j.list); chatRender(); out = ''; }
      else out = (j && j.msg) || '发送失败';
    }catch(e){}
    chatSending = false;
    return out;
  }
  function chatRender(){
    const box = el('ch-list');
    if(!box) return;
    const q = el('ch-quota');
    if(q){
      q.textContent = online ? '已连通 · ' + (nick || '散修') : '未连接';
      q.className = 'sc-quota' + (online ? '' : ' off');
    }
    const off = el('ch-off');
    if(off) off.classList.toggle('hidden', !!online);
    if(!chatMsgs.length){
      box.innerHTML = '<div class="ch-none">频道还很安静，说点什么打破沉默吧。</div>';
      chatDot();
      return;
    }
    const stick = box.scrollTop + box.clientHeight >= box.scrollHeight - 40;
    box.innerHTML = chatMsgs.map(m => {
      if(m.sys) return '<div class="ch-sys">' + esc(m.text) + '</div>';
      return '<div class="ch-msg' + (m.mine ? ' mine' : '') + '">' +
        (m.mine ? '' : '<b>' + esc(m.nick) + '</b>') +
        '<span>' + esc(m.text) + '</span></div>';
    }).join('');
    if(stick) box.scrollTop = box.scrollHeight;
    chatDot();
  }
  function chatDot(){
    const d = el('sc-chat-dot');
    if(d) d.hidden = chatUnread <= 0;
  }
  function chatBind(){
    const btn = el('ch-send'), inp = el('ch-text'), nt = el('ch-note');
    if(!btn || !inp) return;
    const send = async () => {
      const err = await chatSend(inp.value);
      if(nt){ nt.textContent = err; nt.className = 'sc-note' + (err ? ' bad' : ''); }
      if(!err){ inp.value = ''; sfx.click(); }
    };
    btn.addEventListener('click', send);
    inp.addEventListener('keydown', ev => { if(ev.key === 'Enter') send(); });
    chatRender();
  }
  function chatOpen(){
    chatLive = true; chatUnread = 0; chatDot();
    chatPull();
    if(chatTimer) clearInterval(chatTimer);
    chatTimer = setInterval(() => { if(!document.hidden) chatPull(); }, 4000);
  }
  function chatClose(){
    chatLive = false;
    if(chatTimer){ clearInterval(chatTimer); chatTimer = 0; }
  }

  /* 打开宗门面板时调用：面板是动态注入的（#sc-weather 等元素此刻才存在），
     故要现渲染一次并立即拉一份山门气象，别等 25s 轮询 */
  async function panelOpen(){
    /* sc-box 每次开面板都被 router 用 innerHTML 整体重建 → 是全新元素，旧监听器随旧节点一起没了。
       bindUI 只在 bootInner 里绑一次，靠「首次打开时 !ready 触发 boot」侥幸生效；一旦离开再回来，
       ready 已 true、boot 不再跑，新 sc-box 就没监听器 → 面板按钮全失灵。所以每次开面板都重绑。 */
    bindUI();
    render();
    if(!ready){ await boot(); return; }   /* 打开面板立刻重试一次，探测结束后再画状态 */
    if(!online) return;
    try{
      const st = await get('stats', { rank: rankNo() });
      if(st && st.ok){ stats = st; renderWeather(); }
    }catch(e){}
    powerReport();
    await fetchPowerBoard();
    renderPower();
  }

  return {
    boot, refresh, refreshNick, publish, guard, cancel: cancelReq, claim, reconnect,
    bonusRate, afterBreak, panelOpen,
    chatBind, chatOpen, chatClose, chatSend,
    powerReport, powerBoard: () => powerBoard, powerBoardAt: () => powerBoardAt,
    host: () => host,
    _candidates: candidates, _firstAlive: firstAlive, _readJson: readJson, _errTag: errTag, _fmtAgo: fmtAgo,
    _safeHost: safeHost,
    _state: () => ({ online, ready, host, pid, nick, me, list, req, bonus, bonusNow, noteTxt,
      stats, timer: !!timer,
      chatUnread, chatMsgs: chatMsgs.length })
  };
})();

/* ============================================================
 * 设置浮层
 * ============================================================ */
(function(){
  const modal = document.getElementById('settings-modal');
  function open(){
    modal.classList.remove('hidden');
    const sectInput = document.getElementById('m-sect');
    let rawHost = '';
    try{ rawHost = localStorage.getItem('arcade_sect_host') || ''; }catch(e){}
    const cleanHost = SECT._safeHost(rawHost);
    if(sectInput) sectInput.value = cleanHost;
    if(rawHost && !cleanHost){
      try{ localStorage.removeItem('arcade_sect_host'); }catch(e){}
      SECT.reconnect();
    }
    document.getElementById('m-nick').value = (() => {
      try{ return localStorage.getItem('arcade_nick') || ''; }catch(e){ return ''; }
    })();
    /* 设置与宗门页共用同一连接状态；打开设置也主动探测，不等待下一轮。 */
    const paint = () => {
      const ss = document.getElementById('m-sect-state');
      if(!ss) return;
      const st = (() => { try{ return SECT._state(); }catch(e){ return null; } })();
      if(st && st.online){ ss.textContent = '已连上'; ss.className = 'on'; }
      else if(st && st.ready){ ss.textContent = '连接中…'; ss.className = ''; }
      else { ss.textContent = '未连接（每 25 秒自动重试）'; ss.className = ''; }
      const ni = document.getElementById('m-nick');
      if(ni && st && st.nick) ni.placeholder = st.nick;
    };
    paint();
    try{ Promise.resolve(SECT.panelOpen()).then(paint, paint); }catch(e){}
  }
  function close(){ modal.classList.add('hidden'); }
  document.getElementById('sc-settings').addEventListener('click', open);
  document.getElementById('m-close').addEventListener('click', close);
  document.getElementById('m-cancel').addEventListener('click', close);
  document.getElementById('m-save').addEventListener('click', () => {
    const requested = document.getElementById('m-sect').value.trim();
    const host = SECT._safeHost(requested);
    const nick = document.getElementById('m-nick').value.trim().slice(0, 12);
    if(requested && !host){
      const ss = document.getElementById('m-sect-state');
      if(ss){ ss.textContent = '地址无效，请留空自动连接'; ss.className = ''; }
      return;
    }
    try{
      if(host) localStorage.setItem('arcade_sect_host', host);
      else localStorage.removeItem('arcade_sect_host');
      if(nick) localStorage.setItem('arcade_nick', nick);
    }catch(e){}
    close();
    SECT.reconnect();
  });
  document.getElementById('m-wipe').addEventListener('click', () => {
    /* 2026-11-19 第 3 条：清档先弹独立确认层（危险样式），不再用浏览器 confirm 一闪而过 */
    const wm = document.getElementById('wipe-modal');
    if(wm) wm.classList.remove('hidden');
  });
  ['wipe-cancel', 'wipe-cancel-x'].forEach(id => {
    const b = document.getElementById(id);
    if(b) b.addEventListener('click', () => {
      const wm = document.getElementById('wipe-modal');
      if(wm) wm.classList.add('hidden');
    });
  });
  const wipeOk = document.getElementById('wipe-ok');
  if(wipeOk) wipeOk.addEventListener('click', () => {
    const wm = document.getElementById('wipe-modal');
    if(wm) wm.classList.add('hidden');
    /* 二次确认已在弹层里完成：跳过 resetAll 内的浏览器 confirm */
    try{ XX.reset(true); }catch(e){}
  });
  const mBackup = document.getElementById('m-backup');
  if(mBackup) mBackup.addEventListener('click', () => { try{ XX._openSave(); }catch(e){} });
  /* B1 引导形态（2026-11-20）：重开引导入口留在设置里（跳过/走完的玩家可重看） */
  const mGuideReplay = document.getElementById('m-guide-replay');
  if(mGuideReplay) mGuideReplay.addEventListener('click', () => {
    try {
      const sm = document.getElementById('settings-modal');
      if(sm) sm.classList.add('hidden');
      /* P1b：重看只重播引导（会话内），不动奖励与进度标记。
         修复小单（2026-11-20）：模块缺失/旧版时必须显式提示，不许再静默 reset()
         （旧 guide 无 replay、旧 game.js 只调 reset → 完成态下 reset 是无气泡的空操作）。 */
      if(window.Guide && typeof Guide.replay === 'function'){
        try{ Guide.replay(); }
        catch(e){ try{ if(window.toast) toast('引导重播失败：' + (e && e.message ? e.message : e)); }catch(_){} }
      }else{
        const m = '引导模块未更新：请强制刷新页面（Ctrl+F5）后再试。';
        try{ if(window.toast) toast(m); }catch(e){}
        try{ console.warn('[guide] replay unavailable: guide module not loaded/updated'); }catch(e){}
      }
    } catch(e) {}
  });
  document.getElementById('sc-sfx').addEventListener('click', () => {
    if (window.GameAudio) GameAudio.toggle();   /* 文件音频开关（合成音已退役） */
    renderSfxBtn();
  });
  renderSfxBtn();

})();

/* ============================================================
 * 主界面导航 / 按钮绑定 / 启动 —— 已抽离到 js/router.js
 * （中央路由：点木牌 → ROUTER.open(name) 动态注入 view 到 #panel-host，
 *  离开即清空，不再用 display:none 硬切所有 panel-page）
 * ============================================================ */
