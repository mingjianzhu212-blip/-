/* server/profile.mjs —— P2-A · 服务器权威角色档案（第 130 轮）
 *
 * 目的：根治 P0-B 的**边界②**（客户端上报的养成快照可以伪造）。
 *   做法：联机实力由**服务器自己记的档案**派生，客户端只能读、不能写；
 *   于是「构造一份满级快照就变强」这条路，在 enforce 档位被物理删除。
 *
 * 纪律（来自 AGENTS.md / GAME_DEVELOPMENT_MASTER_PLAN.md）：
 *   · **不改战力公式**：档案战力一律回到 server.mjs 的 recomputePower 走（同一套钳制常量），
 *     本模块只负责"把档案翻译成 recomputePower 认识的快照形状"与"按服务器规则推进档案"。
 *   · **档案不来自客户端**：join 请求里带 profile 字段一律忽略（本模块不提供任何写入口）。
 *   · **档案是服务器内存态**：服务器重启即清空（沿用既有"重启即清空"语义）。持久化是 P2 后续切片。
 *
 * 档案身份 = token（token 就是本项目没有账号体系下的"身份凭证"）。
 *   注意：客户端 token 只在内存、刷新页面即丢（js/net.js:7），所以
 *   "刷新后仍认得同一份档案"需要客户端持久化 token —— 那是另一小步，本模块不代劳。
 */
import crypto from 'node:crypto';

/* 三态闸门（与本项目 BRIDGE_LEDGER_MODE 的三态先例同形） */
export const PROFILE_MODES = ['off', 'observe', 'enforce'];

export function resolveProfileMode(raw) {
  const s = String(raw ?? 'off').trim().toLowerCase();
  return PROFILE_MODES.includes(s) ? s : 'off';
}

/* 修为 → 境界的步长：每 8000 修为升 1 阶（与 NEED=[800,1600,3200,6400,12800] 对齐，
   大致"打满五层升一阶"）。 */
export const PROFILE_RANK_STEP = 8000;

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

/* 新建档案：全部字段由服务器决定，客户端无从干预。 */
export function createProfile(name, now) {
  return {
    id: newId(),
    name: String(name || '无名'),
    createdAt: (typeof now === 'number' ? now : Date.now()),
    cultivation: 0,   // 修为（服务器按通关层数给）
    stones: 0,        // 灵石累计（服务器记账）
    layersCleared: 0, // 历史突破层数
    runs: 0,          // 完成局数
    weaponLv: 0,      // 法宝强化等级（服务器发，cap = enhanceMax）
    equipPower: 0,    // 装备护体投入（服务器按道途发）
    affixPct: 0,      // 词缀投入（服务器按道途发）
    danPowPct: 0,     // 淬丹投入（服务器按道途发）
    wuPct: 0,         // 悟道投入（服务器按道途发）
    artBgPct: 0,      // 图录投入（档案暂不发）
    rank: 0,          // 境界（由修为派生，cap = rankCap）
    tokens: []        // 曾持有该档案的 token（续接用）
  };
}

/* 档案 → recomputePower 认识的快照形状。
   只填服务器档案里真实存在的字段，其余按 0（无）处理——
   这意味着档案里的"共鸣"只可能来自服务器发的养成轴，客户端注入的数值无处可去。 */
export function profileSnapshot(p) {
  return {
    rank: p.rank,
    gongLvs: [0, 0, 0],
    weapon: 0,          /* 档案暂不发法宝品阶（那是单机养成项），故剑修轴只走强化那 0.6 分 */
    weaponLv: p.weaponLv,
    affixPct: p.affixPct,
    wuPct: p.wuPct,
    artBgPct: p.artBgPct,
    danPowPct: p.danPowPct,
    dtPowPct: 0,
    petPower: 0,
    equipPower: p.equipPower
  };
}

/* ---- P2-A-2：按道途分配养成轴（第 131 轮）----
 * 缺口：档案原本只有 weaponLv 一条线 → 四个道途拿到**完全相同**的投入，
 *   只有剑修吃得到共鸣，P1-B 的"道途=流派"在根治档下被抹平。
 * 修法：服务器按**玩家登记的道途**把通关产出投到该道途的轴上（其余轴为 0）。
 *   · 每档投入的值域 = **该字段在单机里的合法上限**（weaponLv 20 / equipPower 4500 /
 *     affixPct 22 / danPowPct 0.55 / wuPct 52），所以档案满投入 == 单机该项满级，
 *     钳制常量与口径完全复用，**不新增任何战力公式**。
 *   · 共鸣仍由既有的 pathAxisScore 计算（档案 snapshot 喂进去），不引入第二套刻度。
 *   · 各轴满投入的共鸣（按既有权重）：丹修 1.0 → +15%；阵修 0.7 → +10.5%；
 *     剑修 0.6 → +9%；体修 0.7×装备占比 + 0.3×词缀占比 → 约 +5.6%。
 */
export const AXIS_GRANTS = {
  sword: { weaponLv: 2, equipPower: 0, affixPct: 0, danPowPct: 0, wuPct: 0 },
  body: { weaponLv: 0, equipPower: 45, affixPct: 2.2, danPowPct: 0, wuPct: 0 },
  dan: { weaponLv: 0, equipPower: 0, affixPct: 0, danPowPct: 0.055, wuPct: 0 },
  array: { weaponLv: 0, equipPower: 0, affixPct: 0, danPowPct: 0, wuPct: 5.2 }
};

/* 按服务器规则推进档案：突破 layers 层 + 分到 stone 灵石。
   修为 = 该层门槛之和；各道途轴按 AXIS_GRANTS 分配；境界由修为派生。 */
/* 按服务器规则推进档案：突破 layers 层 + 分到 stone 灵石。
   修为 = 该层门槛之和；各道途轴按 AXIS_GRANTS 分配；境界由修为派生。
   （第 134 轮整改：ChatGPT #63 审查意见② —— 加强输入边界校验）
   layers 必须是有限、非负整数，且不超过本局服务器允许的最大结算层数；
   stone 必须是有限、非负数值；pathId 必须来自服务器确认的角色道途
   （非法值回落剑修，不让越界值污染档案）。 */
export function grantRun(p, layers, stone, cfg, pathId) {
  const safeNum = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? v : d;
  const nRaw = safeNum(layers, 0);
  const n = Math.floor(nRaw);                                  // 有限非负整数（Infinity → 0）
  const stoneN = safeNum(stone, 0);                            // 有限非负数值（Infinity → 0）
  const need = (cfg && Array.isArray(cfg.need)) ? cfg.need : [];
  // 最大结算层数：优先用服务器显式上限，否则以养成门槛表长度为界
  // —— 防止"修为累加层数"与"轴投入层数"因超出 need 而产生不一致
  const maxLayers = (cfg && typeof cfg.maxLayers === 'number' && Number.isFinite(cfg.maxLayers) && cfg.maxLayers >= 0)
    ? cfg.maxLayers : need.length;
  const nCapped = Math.min(n, maxLayers);
  if (nCapped <= 0 && !(stoneN > 0)) return p;
  let cult = 0;
  const steps = Math.min(nCapped, need.length);
  for (let i = 0; i < steps; i++) cult += need[i];
  p.cultivation += cult;
  p.layersCleared += nCapped;
  if (stoneN > 0) p.stones += Math.floor(stoneN);
  // pathId 必须是已知道途；否则回落剑修（服务器应保证传入 m.path，此处为兜底，不让非法值越界）
  const g = AXIS_GRANTS.hasOwnProperty(pathId) ? AXIS_GRANTS[pathId] : AXIS_GRANTS.sword;
  const cap = {
    weaponLv: (cfg && typeof cfg.enhanceMax === 'number') ? cfg.enhanceMax : 20,
    equipPower: (cfg && typeof cfg.equipCap === 'number') ? cfg.equipCap : 4500,
    affixPct: (cfg && typeof cfg.affixCap === 'number') ? cfg.affixCap : 22,
    danPowPct: (cfg && typeof cfg.danCap === 'number') ? cfg.danCap : 0.55,
    wuPct: (cfg && typeof cfg.wuCap === 'number') ? cfg.wuCap : 52,
    artBgPct: (cfg && typeof cfg.artBgCap === 'number') ? cfg.artBgCap : 0.56
  };
  p.weaponLv = Math.min(cap.weaponLv, p.weaponLv + g.weaponLv * nCapped);
  p.equipPower = Math.min(cap.equipPower, p.equipPower + g.equipPower * nCapped);
  p.affixPct = Math.min(cap.affixPct, p.affixPct + g.affixPct * nCapped);
  p.danPowPct = Math.min(cap.danPowPct, p.danPowPct + g.danPowPct * nCapped);
  p.wuPct = Math.min(cap.wuPct, p.wuPct + g.wuPct * nCapped);
  const rankCap = (cfg && typeof cfg.rankCap === 'number') ? cfg.rankCap : 25;
  const step = (cfg && typeof cfg.rankStep === 'number') ? cfg.rankStep : PROFILE_RANK_STEP;
  p.rank = Math.min(rankCap, Math.floor(p.cultivation / step));
  if (nCapped > 0) p.runs += 1;
  return p;
}

/* 档案仓库：token → 档案。
   enforce/observe 档下 join 时 ensure()；结算时 grant()。 */
export class ProfileStore {
  constructor(mode, cfg) {
    this.mode = mode || 'off';
    this.cfg = cfg || {};
    this.byToken = new Map();   /* token → profile */
    this.byId = new Map();      /* profileId → profile */
  }

  get enabled() { return this.mode !== 'off'; }
  get enforcing() { return this.mode === 'enforce'; }

  find(token) {
    if (!token) return null;
    return this.byToken.get(String(token)) || null;
  }

  byProfileId(id) {
    if (!id) return null;
    return this.byId.get(String(id)) || null;
  }

  /* 取档案：命中 token 就复用，否则建档（新建的字段全部由服务器决定）。 */
  ensure(token, name) {
    const hit = this.find(token);
    if (hit) {
      if (token && !hit.tokens.includes(String(token))) hit.tokens.push(String(token));
      return hit;
    }
    const p = createProfile(name);
    if (token) { this.byToken.set(String(token), p); p.tokens.push(String(token)); }
    this.byId.set(p.id, p);
    return p;
  }

  /* 新玩家对象拿到新 token 后，把档案也绑到这个 token 上（这样续接/结算都找得到）。 */
  bind(token, p) {
    if (!token || !p) return p;
    const t = String(token);
    this.byToken.set(t, p);
    if (!p.tokens.includes(t)) p.tokens.push(t);
    if (!this.byId.has(p.id)) this.byId.set(p.id, p);
    return p;
  }

  /* 结算推进：按服务器自己的判定结果给档案记账（道途决定投到哪条轴）。 */
  grant(token, layers, stone, pathId) {
    const p = this.find(token);
    if (!p) return null;
    return grantRun(p, layers, stone, this.cfg, pathId);
  }

  /* K11 用：仅加减灵石，不涉 layers/path/战力。delta>0 入账，delta<0 扣付且不允许为负。
     返回更新后的 stones；余额不足或非有限数值抛错（整体不改动账本）。 */
  addStones(token, delta) {
    const p = this.find(token);
    if (!p) throw new Error('档案不存在');
    const d = Number(delta);
    if (!Number.isFinite(d)) throw new Error('灵石变动必须为有限数值');
    const next = Math.floor(p.stones + d);
    if (next < 0) throw new Error('灵石不足');
    p.stones = next;
    return p.stones;
  }

  /* 只读摘要（给 GET /api/profile）。
     power = 当前生效战力（observe 档 = 快照战力，enforce 档 = 档案派生）；
     profilePower = 档案派生战力（永远由服务器档案算出）——
     observe 档下这两个数的差就是"你报的 vs 档案算的"，可量化。 */
  summary(p, power, powerSource, profilePower) {
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      cultivation: p.cultivation,
      stones: p.stones,
      layersCleared: p.layersCleared,
      runs: p.runs,
      weaponLv: p.weaponLv,
      equipPower: p.equipPower,
      affixPct: p.affixPct,
      danPowPct: p.danPowPct,
      wuPct: p.wuPct,
      artBgPct: p.artBgPct,
      rank: p.rank,
      power,
      profilePower: (typeof profilePower === 'number') ? profilePower : power,
      powerSource: powerSource || 'profile',
      mode: this.mode
    };
  }
}
