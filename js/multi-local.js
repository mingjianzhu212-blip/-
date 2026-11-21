/* 组队秘境 · 本地陪练（阶段四 C3 · 制作人 D4/D5/D6/D7 批甲 · A2-LOCAL）
 *
 * 为什么有这个文件：全服只有一个人时，组队秘境的「塔后封门」内容不可达——
 * 人门在权威服务器里（server/server.mjs:1061-1062 的 n < 2 → MIN_PLAYERS），
 * 放开它就是改服务器权威口径，本单明令不动。制作人 D4 批准的形态是 A2-LOCAL：
 * **客户端本地陪练，server/ 零改动**，让单人也能把封门后的五层走一遍。
 *
 * D4 的批准实质（原话）：「客户端出现第二份数值事实，仅限本地局」。
 * 因此下面 AUTH / PATHS / AXIS 三张表**只许从 server/server.mjs 现值逐项抄录，不许另定**，
 * 每一项都附来源行号备查（行号按 server.mjs SHA-256 ca5958aa… 那一版实测）。
 * 抄录值一旦与服务器漂移，就是两份真值打架——改服务器时必须同步改这里，反之亦然。
 *
 * D5：奖励沿用原值、单人独占池，不做人数折算。
 * D6：runId 用 local- 前缀写进既有 S.multiCreditedRuns，复用 S.multiWins，零新存档字段。
 * D7：陪练**零战力贡献**——不进人数 n、不进 totalPower、不进分奖权重。
 *     兜底目标是「内容可达」，不是战力代打。所以本模块里队伍只有玩家一个人，
 *     陪练同伴只是呈现层的事（由 game.js 渲染），本层根本不持有它。
 *
 * 纪律（照 js/multi-ledger.js 同一口径）：纯逻辑，不碰 DOM、不碰 localStorage、
 * 不读任何游戏状态；可被 node --test 直接 require。战力标量由调用方传入
 * （game.js 的 multiPower()，即客户端既有 combatPower()），本模块**不重算战力公式**——
 * 战力公式是制作人锁定项，这里一个字都不碰。
 */
(function (root) {
  'use strict';

  /* ===================== 抄录常量表（逐项附 server/server.mjs 来源行号） =====================
     只抄录、不另定。任何一项要改，必须先改服务器并同步这里，否则本地局与真人局口径分叉。 */
  var AUTH = {
    TOTAL_LAYERS: 5,                              /* server.mjs:25  const TOTAL_LAYERS = 5 */
    NEED: [800, 1600, 3200, 6400, 12800],         /* server.mjs:26  const NEED = [...] */
    BOSS_LAYER: 5,                                /* server.mjs:27  const BOSS_LAYER = 5 */
    TEAM_BONUS: 0.1,                              /* server.mjs:28  const TEAM_BONUS = 0.1 */
    SYNERGY_GAIN: 0.15,                           /* server.mjs:136 const SYNERGY_GAIN = 0.15 */
    BURST_MULT: 1.5,                              /* server.mjs:170 const BURST_MULT = 1.5 */
    WARM_PCT: 0.08,                               /* server.mjs:171 const WARM_PCT = 0.08 */
    WARM_MAX: 3,                                  /* server.mjs:172 const WARM_MAX = 3 */
    ARRAY_PCT: 0.85,                              /* server.mjs:173 const ARRAY_PCT = 0.85 */
    ENHANCE_MAX: 20,                              /* server.mjs:206 const ENHANCE_MAX = 20 */
    WEAPON_MAX_IDX: 9,                            /* server.mjs:204 WEAPON_MULT 共 10 项 → length-1 = 9 */
    ART_BG_MAX: 0.56,                             /* server.mjs:209 const ART_BG_MAX = 0.56 */
    WU_POW_CAP_PCT: 52,                           /* server.mjs:217 const WU_POW_CAP_PCT = 52 */
    AFFIX_POW_CAP_PCT: 22,                        /* server.mjs:218 const AFFIX_POW_CAP_PCT = 22 */
    DAN_POW_CAP_FRAC: 0.55,                       /* server.mjs:222 const DAN_POW_CAP_FRAC = 0.55 */
    EQUIP_POWER_CAP: 4500,                        /* server.mjs:225 const EQUIP_POWER_CAP = 4500 */
    GUARD_CAP: 4,                                 /* server.mjs:1104 run.guard = Math.min((run.guard||0)+1, 4) */
    POOL_PCT: 0.5,                                /* server.mjs:663 pool = floor(need * 0.5 * (...)) */
    BOSS_POOL_MULT: 1.5,                          /* server.mjs:663 (run.layer === BOSS_LAYER ? 1.5 : 1) */
    DEFAULT_PATH: 'sword'                         /* server.mjs:108 const DEFAULT_PATH = 'sword' */
  };

  /* 道途目录：name/role/contribMult/axis/skill 逐项抄自 server.mjs:86-107。
     blurb 不抄——那是服务器下发给客户端的展示文案，本地局不连服务器，
     展示文本由文案侧统一供稿（本轮 C3 文案已派给「九霄问道文案」，未回稿前不自行补写）。 */
  var PATHS = {
    sword: { id: 'sword', name: '剑修', role: '破军', contribMult: 1.15, axis: 'weapon',   /* server.mjs:88 */
             skill: { id: 'burst', name: '破军斩', uses: 2, hint: '本层个人战力 ×1.5（出手前）' } },  /* :90 */
    body:  { id: 'body',  name: '体修', role: '守拙', contribMult: 1.0,  axis: 'guard',    /* server.mjs:93 */
             skill: { id: 'guard', name: '护持', uses: 1, hint: '本层战力不足也能过，此层无灵石' } },  /* :95 */
    dan:   { id: 'dan',   name: '丹修', role: '济世', contribMult: 1.0,  axis: 'dan',      /* server.mjs:98 */
             skill: { id: 'brew',  name: '催丹', uses: 3, hint: '全队温养 +1 层（每层 +8% 队伍战力）' } }, /* :100 */
    array: { id: 'array', name: '阵修', role: '布阵', contribMult: 1.0,  axis: 'wu',       /* server.mjs:103 */
             skill: { id: 'array', name: '点阵', uses: 2, hint: '本层门槛 ×0.85' } }        /* :105 */
  };
  var AXIS_NAMES = {                              /* server.mjs:110-115（仅展示名，不参与计算） */
    weapon: '法宝·强化', guard: '装备·护体', dan: '淬丹·丹元', wu: '悟道·阵理'
  };

  function isPathId(v) {
    return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PATHS, v);
  }
  function pathOf(pathId) {                       /* 照 server.mjs:178-180：未知道途回落 DEFAULT_PATH */
    return isPathId(pathId) ? PATHS[pathId] : PATHS[AUTH.DEFAULT_PATH];
  }
  /* 照 server.mjs:227-230 clampNum：非有限数取默认值，再钳到 [lo,hi] */
  function clampNum(v, lo, hi, dflt) {
    var n = (typeof v === 'number' && isFinite(v)) ? v : dflt;
    return Math.min(hi, Math.max(lo, n));
  }

  /* ===================== 流派共鸣（照 server.mjs:139-169 逐项抄录） =====================
     轴心投入比例 ∈[0,1]，乘子上限 SYNERGY_GAIN。只作用于副本内有效战力，
     不碰战力标量（标量由调用方传入，公式锁定）。 */
  function pathAxisScore(snap, axis) {
    if (!snap || typeof snap !== 'object') return 0;
    switch (axis) {
      case 'weapon': {                            /* server.mjs:142-146 */
        var lv = clampNum(snap.weaponLv, 0, AUTH.ENHANCE_MAX, 0);
        var wm = clampNum(snap.weapon, 0, AUTH.WEAPON_MAX_IDX, 0);
        return Math.min(1, (lv / AUTH.ENHANCE_MAX) * 0.6 + (wm / AUTH.WEAPON_MAX_IDX) * 0.4);
      }
      case 'guard': {                             /* server.mjs:147-151 */
        var eq = clampNum(snap.equipPower, 0, AUTH.EQUIP_POWER_CAP, 0);
        var af = clampNum(snap.affixPct, 0, AUTH.AFFIX_POW_CAP_PCT, 0);
        return Math.min(1, (eq / AUTH.EQUIP_POWER_CAP) * 0.7 + (af / AUTH.AFFIX_POW_CAP_PCT) * 0.3);
      }
      case 'dan': {                               /* server.mjs:152-155 */
        var dp = clampNum(snap.danPowPct, 0, AUTH.DAN_POW_CAP_FRAC, 0);
        return Math.min(1, dp / AUTH.DAN_POW_CAP_FRAC);
      }
      case 'wu': {                                /* server.mjs:156-160 */
        var wp = clampNum(snap.wuPct, 0, AUTH.WU_POW_CAP_PCT, 0);
        var ab = clampNum(snap.artBgPct, 0, AUTH.ART_BG_MAX, 0);
        return Math.min(1, (wp / AUTH.WU_POW_CAP_PCT) * 0.7 + (ab / AUTH.ART_BG_MAX) * 0.3);
      }
      default: return 0;                          /* server.mjs:161 */
    }
  }
  function synergyMult(snap, pathId) {            /* server.mjs:165-169 pathSynergyMult */
    var axis = PATHS[pathId] ? PATHS[pathId].axis : null;
    if (!axis) return 1;
    return 1 + AUTH.SYNERGY_GAIN * pathAxisScore(snap, axis);
  }

  /* ===================== runId（D6：local- 前缀 + 既有 UUID 形状） =====================
     形状必须是 local- + 8-4-4-4-12 小写十六进制：MultiLedger.normRid 是严格白名单，
     长度与字符集都封顶（挡「导入存档塞超长串撑大存档」的既有边界不因本地局而放宽）。
     前缀保证本地局与真人局的 runId 永不碰撞，且读档清洗后仍可区分来源。 */
  function hex4() {
    var s = '';
    for (var i = 0; i < 4; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
  }
  function uuidv4() {
    try {
      if (root && root.crypto && typeof root.crypto.randomUUID === 'function') {
        var u = root.crypto.randomUUID();
        if (typeof u === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(u)) return u;
      }
    } catch (e) { /* 落到下面的手工拼装 */ }
    /* file:// 等非安全上下文里 crypto.randomUUID 可能不存在，手工拼 v4（仅用于本地局去重，不是安全令牌） */
    return hex4() + hex4() + '-' + hex4() + '-4' + hex4().slice(1) + '-' +
           (8 + Math.floor(Math.random() * 4)).toString(16) + hex4().slice(1) + '-' +
           hex4() + hex4() + hex4();
  }
  function newRunId() { return 'local-' + uuidv4(); }

  /* ===================== 建局 / 判定 / 结算 ===================== */
  /* o = { power, snapshot, path, name }。power 是客户端既有战力标量（multiPower()），
     本模块不重算、不钳制它——钳制口径属服务器权威，本地局只沿用客户端现成数字。 */
  function newRun(o) {
    o = o || {};
    var p = (typeof o.power === 'number' && isFinite(o.power)) ? Math.max(1, Math.floor(o.power)) : 1;
    return {
      id: newRunId(),
      local: true,                 /* 仅内存标记：本地局不进存档（D6 零新字段） */
      phase: 'run',                /* run → settled，照 server.mjs:624/712 的相位语义 */
      layer: 1,
      power: p,
      snapshot: (o.snapshot && typeof o.snapshot === 'object') ? o.snapshot : null,
      path: pathOf(o.path).id,
      name: String(o.name == null ? '' : o.name),
      struck: false,               /* 单人局：服务器那边是数组，这里只有一个成员，用布尔等价 */
      stone: 0,
      log: [],
      warm: 0,                     /* server.mjs:633 本局累计，跨层不清 */
      burst: false,                /* server.mjs:634 本层有效，换层即清 */
      arrayActive: false,          /* server.mjs:635 本层 */
      guard: 0,                    /* server.mjs:636 本层 */
      skillsUsed: 0,               /* server.mjs:637 memberId → 次数；单人局退化为标量 */
      settle: null
    };
  }

  /* 本层个人战力（照 server.mjs:454-459 memberPowerInRoom，单人版） */
  function memberPower(run) {
    var burst = run.burst ? AUTH.BURST_MULT : 1;
    var syn = run.snapshot ? synergyMult(run.snapshot, run.path) : 1;
    return run.power * burst * syn;
  }
  /* 丹修温养（照 server.mjs:468-472 warmMult） */
  function warmMult(run) {
    var stacks = (typeof run.warm === 'number' && isFinite(run.warm)) ? Math.min(run.warm, AUTH.WARM_MAX) : 0;
    return 1 + AUTH.WARM_PCT * stacks;
  }
  /* 本层门槛（照 server.mjs:475-479 needOf） */
  function needOf(run) {
    var base = AUTH.NEED[run.layer - 1];
    return run.arrayActive === true ? Math.floor(base * AUTH.ARRAY_PCT) : base;
  }
  /* 队伍战力（照 server.mjs:481-484 teamPowerOf）。
     **D7：n 恒为 1** —— 陪练不进 room.members，所以 (1 + TEAM_BONUS × max(n-1,0)) 恒为 ×1.00。
     TEAM_BONUS 照抄不删：它是服务器公式的一项，留着才能在口径核对时逐项对上；
     删掉它等于把公式改了形，日后服务器若调 n 的语义这里就对不上了。 */
  function teamPower(run) {
    var n = 1;
    return Math.floor(memberPower(run) * (1 + AUTH.TEAM_BONUS * Math.max(n - 1, 0)) * warmMult(run));
  }
  /* 每层奖励池（照 server.mjs:663）。与人数无关——这是 D5「不做人数折算」的数值依据。 */
  function poolOf(need, layer) {
    return Math.floor(need * AUTH.POOL_PCT * (layer === AUTH.BOSS_LAYER ? AUTH.BOSS_POOL_MULT : 1));
  }

  /* 结算（照 server.mjs:685-712 settle 的客户端等价物）。
     不推进任何服务器档案（profiles 那一段属服务器权威，本地局没有档案可推）。
     rewards 形状与服务器一致，好让 game.js 用同一条入账链（D6 复用幂等账与 multiWins）。 */
  function settle(run, outcome) {
    if (!run || run.phase !== 'run') return null;
    var stone = outcome.layers === 0 ? 0 : (run.stone || 0);   /* server.mjs:691 */
    run.phase = 'settled';
    run.settle = {
      runId: run.id,
      cleared: !!outcome.cleared,
      layers: outcome.layers,
      reason: outcome.reason,
      rewards: [{ id: 'local-me', name: run.name, stone: stone }]
    };
    return run.settle;
  }

  /* 推层（照 server.mjs:643-683 resolveLayer，单人版） */
  function resolveLayer(run) {
    if (!run || run.phase !== 'run') return;
    var need = needOf(run);
    var tp = teamPower(run);
    var pass = tp >= need;
    var shielded = false;
    /* 体修护持：战力不足时不团灭，硬撑过层（此层无灵石）。照 server.mjs:651-655 */
    if (!pass && run.guard > 0) { run.guard -= 1; pass = true; shielded = true; }
    if (!pass) { settle(run, { cleared: false, layers: run.layer - 1, reason: 'wipe' }); return; }
    if (shielded) {
      run.log.unshift('体修护持：第' + run.layer + '层硬撑过去，此层无灵石');   /* server.mjs:661 逐字 */
    } else {
      var pool = poolOf(need, run.layer);
      /* D5 单人独占池：服务器按 weightedShare 归一化切分（server.mjs:664-670），
         单人局 wsum === w，floor(pool*w/wsum) 数学上恒等于 pool，故直接取 pool。
         不写成除法是为了避开浮点误差把 400 算成 399——取值与服务器口径完全一致，不是另定数值。
         陪练不进权重（D7），所以不存在第二个分奖者。 */
      run.stone += pool;
      run.log.unshift('第' + run.layer + '层突破，灵石按贡献落袋');               /* server.mjs:671 逐字 */
    }
    if (run.layer < AUTH.TOTAL_LAYERS) {
      run.layer += 1;
      run.struck = false;
      run.burst = false;            /* server.mjs:676-678：破军斩/点阵/护持都是本层效果，换层即清 */
      run.arrayActive = false;
      run.guard = 0;
    } else {
      settle(run, { cleared: true, layers: AUTH.TOTAL_LAYERS, reason: 'clear' });
    }
  }

  /* 出手（照 server.mjs:1068-1080 apiRunStrike）。
     单人局 isAllStruck 恒真（陪练不算成员，server.mjs:491-495 的 !m.online 兜底在此不适用），
     所以出手即推层，不需要等第二个人。 */
  function strike(run) {
    if (!run || run.phase !== 'run') return { ok: false, code: 'BAD_PHASE' };
    run.struck = true;
    resolveLayer(run);
    return { ok: true, layer: run.phase === 'run' ? run.layer : AUTH.TOTAL_LAYERS };
  }

  /* 声明道途技能（照 server.mjs:1086-1114 apiRunSkill）。
     错误码逐字沿用：ALREADY_STRUCK / NO_SKILL_USES / BAD_PHASE。 */
  function skill(run) {
    if (!run || run.phase !== 'run') return { ok: false, code: 'BAD_PHASE' };
    if (run.struck) return { ok: false, code: 'ALREADY_STRUCK' };
    var ph = pathOf(run.path);
    var used = run.skillsUsed || 0;
    if (used >= ph.skill.uses) return { ok: false, code: 'NO_SKILL_USES' };
    var sid = ph.skill.id;
    if (sid === 'burst') run.burst = true;
    else if (sid === 'guard') run.guard = Math.min((run.guard || 0) + 1, AUTH.GUARD_CAP);
    else if (sid === 'brew') run.warm = Math.min((run.warm || 0) + 1, AUTH.WARM_MAX);
    else if (sid === 'array') run.arrayActive = true;
    run.skillsUsed = used + 1;
    run.log.unshift(run.name + ' · ' + ph.skill.name);      /* server.mjs:1111 同句式 */
    return { ok: true, path: ph.id, skill: sid, usesLeft: ph.skill.uses - used - 1 };
  }

  /* 撤退（照 server.mjs:1116-1129 apiRunLeave 的 run 分支）：保住已得的，按 layer-1 结算 */
  function leave(run) {
    if (!run) return { ok: true };
    if (run.phase === 'run') settle(run, { cleared: false, layers: run.layer - 1, reason: 'retreat' });
    return { ok: true };
  }

  /* 渲染视图：**形状照 server.mjs:497-534 runView 逐字段对齐**，
     好让 game.js 的 renderMulti 用同一段渲染代码，不另写一套本地版面板。 */
  function view(run) {
    if (!run) return null;
    var ph = pathOf(run.path);
    var syn = run.snapshot ? synergyMult(run.snapshot, run.path) : 1;
    var used = run.skillsUsed || 0;
    return {
      layer: run.layer,
      totalLayers: AUTH.TOTAL_LAYERS,
      needPower: needOf(run),
      baseNeedPower: AUTH.NEED[run.layer - 1],
      teamPower: teamPower(run),
      struck: run.struck ? ['local-me'] : [],
      allStruck: !!run.struck,
      log: run.log.slice(0, 5),
      warm: run.warm || 0,
      warmMax: AUTH.WARM_MAX,
      warmPct: Math.round(AUTH.WARM_PCT * 100),
      arrayActive: run.arrayActive === true,
      guard: run.guard || 0,
      skills: [{
        id: 'local-me', name: run.name, path: ph.id, pathName: ph.name,
        axisName: AXIS_NAMES[ph.axis] || ph.axis,
        synergyPct: Math.round((syn - 1) * 1000) / 10,
        skillName: ph.skill.name, skillHint: ph.skill.hint,
        usesLeft: Math.max(0, ph.skill.uses - used),
        struck: !!run.struck, burst: !!run.burst, online: true
      }],
      stones: [{ id: 'local-me', name: run.name, stone: run.stone || 0 }]
    };
  }

  var api = {
    AUTH: AUTH, PATHS: PATHS, AXIS_NAMES: AXIS_NAMES,
    pathOf: pathOf, pathAxisScore: pathAxisScore, synergyMult: synergyMult,
    newRunId: newRunId, newRun: newRun, view: view,
    memberPower: memberPower, warmMult: warmMult, needOf: needOf, teamPower: teamPower, poolOf: poolOf,
    skill: skill, strike: strike, leave: leave, settle: settle, resolveLayer: resolveLayer
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MultiLocal = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));