/* server.mjs — 《九霄问道》联机服务器（单文件 ESM，零第三方依赖）
 * 一轮协议：POST /api/join → GET /api/stream（SSE）→ room create/join/ready/chat
 * → room start（开战）→ run strike（出手，struck 覆盖全员即结算本层）→ run_settle（发奖）→ 3 秒后回 lobby。
 * 服务器是唯一权威：房间、副本进度、战斗判定、奖励全部在这里算，客户端只渲染。
 * SSE 事件：hello / lobby / room / run / run_settle / chat / bye（单连接语义，最新流有效）。
 * 启动：node server.mjs；env SERVER_PORT / SERVER_ROOT > 同目录 config.json > 缺省（0.0.0.0:7730，上一级游戏目录）。
 * 战力通道 env：SERVER_LEGACY_POWER（默认 0=关闭，仅 '1' 开启旧客户端无快照自报战力）、
 *   LEGACY_POWER_CAP（开闸后的自报上限，默认 3e9，与 MAX_POWER 解耦）。
 *   **默认配置即生产配置**：不带快照的登录一律 LEGACY_DISABLED。详见 #75 注释块。
 * 角色档案 env：SERVER_PROFILE_MODE（默认 off=不建档；observe=建档但战力仍按快照；
 *   enforce=档案即权威，忽略客户端快照——P2-A 根治边界②的那一档）。详见 SERVER_PROFILE_P2.md。
 * 静态托管与 /api 同源；除启动那一行外，每个请求静默不打日志。
 * 任何异常一律兜底 500，绝不打崩进程；状态全在内存 Map，进程重启即清空（设计允许）。
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { ProfileStore, profileSnapshot, resolveProfileMode, PROFILE_RANK_STEP } from './profile.mjs';
import { AssetLedger } from './asset-ledger.mjs';
import { TradeDesk, publicListing, publicBuyResult } from './k11-trade.mjs';

/* ===================== 常量（副本规则 + 心跳/超时） ===================== */
const TOTAL_LAYERS = 5;
const NEED = [800, 1600, 3200, 6400, 12800];
const BOSS_LAYER = 5;
const TEAM_BONUS = 0.1;
const PING_MS = 15000;
/* 离线踢人 / 结算驻留：允许用 env 覆盖（便于多客户端异常场景测试，不改线上默认） */
const OFFLINE_KICK_MS = Number(process.env.SERVER_OFFLINE_KICK_MS) > 0 ? Number(process.env.SERVER_OFFLINE_KICK_MS) : 60000;
const SETTLE_HOLD_MS = Number(process.env.SERVER_SETTLE_HOLD_MS) >= 0 ? Number(process.env.SERVER_SETTLE_HOLD_MS) : 3000;
/* 战力硬上界（1e10）：只挡"1e12 这种荒谬篡改"，并给 26 层满级满乘子留足余量；
   公平性权威见 P0-B（服务器重算/档案），本值不是公平解 */
const MAX_POWER = 1e10;

/* ===================== #75 legacy 战力回退闸门（第 122 轮） =====================
 * 背景（第 120 轮探针实测）：无 snapshot 时服务器接受客户端自报 body.power，
 * 自报 9.99e9 是满级真号（实测 2.78e9）的 3.6 倍；一个自报号带一个正常号，
 * 不放任何技能即可走完五层。这条路径是"无限期信任回退"，必须加闸门。
 *
 * 闸门语义：**默认关闭**。只有显式 SERVER_LEGACY_POWER=1 才允许无快照登录，
 * 仅供局域网迁移旧客户端临时开启。
 *
 * LEGACY_POWER_CAP 语义 = "合法角色战力上界"（实测满级 2.78e9 之上留余量取 3e9）。
 * 它是**爆炸半径旋钮，不是信任边界**：即便开了 legacy，作弊者最多也就能报成
 * "一个满级真号"，拿不到超出合法上限的额外优势。根治仍在 P2（服务器持有角色档案）。
 */
const LEGACY_POWER = String(process.env.SERVER_LEGACY_POWER ?? '0') === '1';
const LEGACY_POWER_CAP = Number(process.env.LEGACY_POWER_CAP) > 0 ? Number(process.env.LEGACY_POWER_CAP) : 3e9;
/* legacy 闸门关闭时给客户端的可读提示（客户端 net.js 优先展示 error 字段） */
const LEGACY_OFF_MSG = '客户端未上报养成快照，服务器已关闭旧的战力上报通道。请刷新页面后重试。';

/* ===================== P2-A 服务器权威角色档案闸门（第 130 轮） =====================
 * 背景：P0-B 的**边界②**——recomputePower 只保证"数字是服务器按公式算的"，
 *   不保证"输入是真的"；实测空号提交满级快照可得与满级真号完全相同的战力（比值 1.0000）。
 *   根治办法：让**服务器自己持有角色档案**，战力由档案派生，客户端快照一律不读。
 *
 * 三态（与本项目 BRIDGE_LEDGER_MODE 的三态先例同形）：
 *   off（默认）——完全保持现状：join 走快照重算，不建档、不推进档案。
 *                 默认保持现状是为了不破坏既有 63 项联机测试与旧客户端。
 *   observe    ——战力仍按快照算（现状不变），但**同时**建档并按服务器规则推进档案；
 *                 GET /api/profile 可对比"档案算出多少 vs 你报的多少"。
 *   enforce    ——**忽略** body.snapshot：join 用档案派生战力，结算推进档案。
 *                 这一档里"伪造满级快照"没有任何效果（伪造路径被物理删除）。
 *
 * 边界（诚实）：档案是服务器**内存**态，重启即清空；且联机档案与单机 localStorage
 *   养成**目前是两条线**（单机练到大乘的人，进 enforce 联机仍从档案初始战力起步）。
 *   两件事的处置见 SERVER_PROFILE_P2.md §10（未决问题，交制作人裁定）。
 */
const PROFILE_MODE = resolveProfileMode(process.env.SERVER_PROFILE_MODE);

/* ===================== P1-A 道途（第 120 轮） =====================
 * 道途是**服务器权威状态**：客户端只能提交枚举 id（join 时或 POST /api/path），
 * 一切倍率/系数由本文件常量表决定。客户端提交的任何 *Mult / *Pct / 系数字段
 * 一律不读——"客户端伪造道途倍率"在本实现里没有任何入口。
 *
 * 时序规则（防中途换道途适配层数）：
 *   · 未开战（不在 run 相位）可随时改道途；
 *   · 房间进入 run 相位后 /api/path 一律 BAD_PHASE；
 *   · 断线续接（resume）**沿用内存里已登记的道途**，忽略 body.path。
 *
 * 技能模型：四道途各一招，出手前声明，每局次数有限；除丹修温养外均为"本层有效"，
 * 换层即清（burst/arrayActive/guard），温养（warm）本局累计。
 */
const PATHS = {
  sword: {
    id: 'sword', name: '剑修', role: '破军', contribMult: 1.15, axis: 'weapon',
    blurb: '一剑破军：破军斩令本层个人战力 ×1.5；分奖权重 ×1.15。',
    skill: { id: 'burst', name: '破军斩', uses: 2, hint: '本层个人战力 ×1.5（出手前）' }
  },
  body: {
    id: 'body', name: '体修', role: '守拙', contribMult: 1.0, axis: 'guard',
    blurb: '守拙护持：战力不足时可硬撑过层，但此层无灵石。',
    skill: { id: 'guard', name: '护持', uses: 1, hint: '本层战力不足也能过，此层无灵石' }
  },
  dan: {
    id: 'dan', name: '丹修', role: '济世', contribMult: 1.0, axis: 'dan',
    blurb: '济世温养：催丹为全队叠温养，每层 +8%（上限 3 层），本局持续。',
    skill: { id: 'brew', name: '催丹', uses: 3, hint: '全队温养 +1 层（每层 +8% 队伍战力）' }
  },
  array: {
    id: 'array', name: '阵修', role: '布阵', contribMult: 1.0, axis: 'wu',
    blurb: '布阵点阵：本层破层门槛降至 85%。',
    skill: { id: 'array', name: '点阵', uses: 2, hint: '本层门槛 ×0.85' }
  }
};
const DEFAULT_PATH = 'sword';
/* 道途专注轴的展示名（仅下发客户端做展示，不参与任何计算；系数一律不出服务器） */
const AXIS_NAMES = {
  weapon: '法宝·强化',
  guard: '装备·护体',
  dan: '淬丹·丹元',
  wu: '悟道·阵理'
};

/* ===================== P1-B 流派共鸣（道途 × 功法/装备联动，第 126 轮） =====================
 * 让"道途"从"一层一招"长成"流派"：每条道途专精一个养成轴，服务器按玩家养成快照
 * 在该轴的"已钳制投入比例"给一个**有上限**的共鸣乘子，只作用于联机副本内的有效战力，
 * 不改动 recomputePower 的权威标量（P0-B 上限口径与探针 1.0000 不变）。
 *
 * 安全要点（沿用 P0-B / P1-A 的服务器权威边界）：
 *   · 乘子完全由服务器用已钳制的快照值算，客户端任何 *Synergy / *Axis / synergyGain 字段一律不读；
 *   · 乘子上限 SYNERGY_GAIN（默认 0.15），即使满投入也只 +15%，不突破"合法满级"数量级；
 *   · 轴心由服务器登记道途决定，客户端改内存/重连都改不了（沿用 P1-A 的 path 登记）；
 *   · 作用在 memberPowerInRoom（团队有效战力）而非 base power，因此 recomputePower 的标量、
 *     既有 P0-B 探针比值都不受它影响——探针测的是重算标量，不测共鸣。
 *
 * 设计意图（对应"道途决定功法收益侧重"）：
 *   · 剑修·剑意  → 法宝/强化轴（呼应"一剑破军"靠锋锐）；
 *   · 体修·护体  → 装备/词缀轴（呼应"守拙承伤"靠硬抗）；
 *   · 丹修·丹道  → 淬丹轴（呼应"济世"靠丹元温养）；
 *   · 阵修·阵法  → 悟道/图录轴（呼应"布阵"靠阵理）。
 * 玩家选"契合自己养成"的道途才有共鸣加成，初步实现"流派"语义。
 */
const SYNERGY_GAIN = 0.15;            /* 共鸣乘子上限（满投入 = base × 1.15） */
/* 轴心"投入比例"∈[0,1]：用该轴已钳制贡献占其合法上限的比例（均为 recomputePower 同名的已钳制字段）。
   各轴取最能代表该道途的快照分量，保证上限 = 1（不会因 snapshot 超界而放大）。 */
function pathAxisScore(snap, axis) {
  if (!snap || typeof snap !== 'object') return 0;
  switch (axis) {
    case 'weapon': {
      const lv = clampNum(snap.weaponLv, 0, ENHANCE_MAX, 0);
      const wm = clampNum(snap.weapon, 0, WEAPON_MULT.length - 1, 0);
      return Math.min(1, (lv / ENHANCE_MAX) * 0.6 + (wm / (WEAPON_MULT.length - 1)) * 0.4);
    }
    case 'guard': {
      const eq = clampNum(snap.equipPower, 0, EQUIP_POWER_CAP, 0);
      const af = clampNum(snap.affixPct, 0, AFFIX_POW_CAP_PCT, 0);
      return Math.min(1, (eq / EQUIP_POWER_CAP) * 0.7 + (af / AFFIX_POW_CAP_PCT) * 0.3);
    }
    case 'dan': {
      const dp = clampNum(snap.danPowPct, 0, DAN_POW_CAP_FRAC, 0);
      return Math.min(1, dp / DAN_POW_CAP_FRAC);
    }
    case 'wu': {
      const wp = clampNum(snap.wuPct, 0, WU_POW_CAP_PCT, 0);
      const ab = clampNum(snap.artBgPct, 0, ART_BG_MAX, 0);
      return Math.min(1, (wp / WU_POW_CAP_PCT) * 0.7 + (ab / ART_BG_MAX) * 0.3);
    }
    default: return 0;
  }
}
/* 副本内有效战力乘子：base × 流派共鸣。recomputePower 的标量不动。 */
function pathSynergyMult(snap, pathId) {
  const axis = (PATHS[pathId] && PATHS[pathId].axis) || null;
  if (!axis) return 1;
  return 1 + SYNERGY_GAIN * pathAxisScore(snap, axis);
}
const BURST_MULT = 1.5;              /* 剑修破军斩：本层个人战力倍率 */
const WARM_PCT = 0.08;               /* 丹修温养：每层队伍战力加成 */
const WARM_MAX = 3;
const ARRAY_PCT = 0.85;              /* 阵修点阵：本层门槛折扣 */

function isPathId(v) {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(PATHS, v);
}
function pathOf(p) {
  return (p && isPathId(p.path)) ? PATHS[p.path] : PATHS[DEFAULT_PATH];
}
/* 下发给客户端的道途目录：只给展示与技能文案，**不含任何系数**（系数永不出服务器） */
function pathCatalog() {
  const out = [];
  for (const k of Object.keys(PATHS)) {
    const p = PATHS[k];
    out.push({ id: p.id, name: p.name, role: p.role, blurb: p.blurb, axis: p.axis, axisName: AXIS_NAMES[p.axis] || p.axis,
      skill: { name: p.skill.name, uses: p.skill.uses, hint: p.skill.hint } });
  }
  return out;
}

/* ===================== P0-B 服务器权威战力（第 118 轮） =====================
 * 客户端上报"受钳制养成快照"（原始养成输入），服务器按与 game.js:2238 combatPower()
 * 完全相同的公式 + 各输入钳制到合法上限 重算破层战力，不再采信客户端最终数字。
 * 局域网阶段定位（总纲/ROADMAP）：服务器公式重算 + 范围钳制 + 记账审计；
 * 客户端仍可伪造养成数值本身，但任何值都被钳制到"合法满级玩家"上限，且 trivial 的
 * 「body.power=1e12」直接被忽略（快照路径不读 body.power）。最终仍受 MAX_POWER 兜底。
 * 约束：保持与 game.js 公式逐项一致；改战力公式须制作人批准（AGENTS.md §1）。
 */
const POW_K = 100;                              // 与 game.js:152 一致
const GONGS_AUTH = [                            // 与 game.js:609 GONGS 的 rate/max 一致
  { rate: 1.03, max: 10 }, { rate: 1.04, max: 10 }, { rate: 1.05, max: 10 }
];
const WEAPON_MULT = [1.0, 1.05, 1.10, 1.20, 1.35, 1.44, 1.53, 1.63, 1.73, 1.85]; // game.js:355
const ENHANCE_POW_RATE = 0.05;                  // BAL.enhancePowRate
const ENHANCE_MAX = 20;                         // BAL.enhanceMax
const RANK_CAP = 25;                            // 飞升 = rank 25（RANK_NAMES 共 26 项，game.js:119-126）
const GONG_CAP = 10;                            // GONGS[].max
const ART_BG_MAX = 0.56;                        // ART_FX.bg 最高档（game.js:954）
/* ---------------- 汇总项上限：一律取"客户端合法最大值"，不是"留余量" ----------------
 * 第 123 轮 ChatGPT 独立审查的核心发现：原来这些上限比真实满级宽 1.9~66 万倍，
 * 攻击者不用碰 body.power，只构造一个"各项都填到服务端上限"的快照就能拿到 1e10
 * ＝实测满级 2.78e9 的 3.6 倍——等于把刚用 #75 关掉的 legacy 口子换个入口重开。
 * 下面每个值都能在客户端源码里指到出处的"理论最大"，不留想象力空间。
 * 诚实声明：这仍然只是把作弊天花板压到"合法满级"。输入真实性只能等 P2 服务器持有角色档案。
 */
const WU_POW_CAP_PCT = 52;                      // 悟道·锋芒 pct:[8,8,10,12,14] 全满 = 52（game.js:453）
const AFFIX_POW_CAP_PCT = 22;                   // 词缀条数 = min(4,法宝阶)，且 rollAffix 保证同一法宝不重复词条
                                                //   → 战力图条最多 1 条、最高品阶 22（game.js:1175,1185,1193-1203）
                                                //   第 124 轮按复核意见从 88 收到 22：历史备份里 rollAffix 一直去重，
                                                //   没有任何"可合法产生重复词条"的证据，留 88 等于白送 1.54 倍乘区。
const DAN_POW_CAP_FRAC = 0.55;                  // 淬体丹 ct.pct 最高档 0.55（DAN_FX，game.js:780）
const DT_POW_CAP_PCT = 22.5;                    // 朱明洞天 pow 满级 15，主洞 ×1.5 = 22.5（DONGTIAN，game.js:2401）
const PET_POWER_CAP = 2160000;                  // 3 槽 × 满级 30：最强妖兽 900000 × 0.2 × (1+3.0) × 3（game.js:2221,364）
const EQUIP_POWER_CAP = 4500;                   // 三槽最强 1800+1500+1200（ITEMS，game.js:4809-4829）

function clampNum(v, lo, hi, dflt) {
  const n = (typeof v === 'number' && Number.isFinite(v)) ? v : dflt;
  return Math.min(hi, Math.max(lo, n));
}
/* 服务器重算破层战力：输入客户端上报的养成快照，逐项钳制后按 combatPower 公式重算。
 * 返回 { power, source } —— source 标记 'snapshot'（权威重算）或 null（无快照，走 legacy）。 */
function recomputePower(snap) {
  if (!snap || typeof snap !== 'object') return null;   // 无快照 → 调者走 legacy
  const rank = clampNum(snap.rank, 0, RANK_CAP, 0);
  const gLv = Array.isArray(snap.gongLvs) ? snap.gongLvs : [];
  const gongMult = GONGS_AUTH.reduce((a, g, i) => a * Math.pow(g.rate, clampNum(gLv[i], 0, GONG_CAP, 0)), 1);
  const weapon = clampNum(snap.weapon, 0, WEAPON_MULT.length - 1, 0);
  const weaponMult = WEAPON_MULT[weapon] || 1;
  const weaponLv = clampNum(snap.weaponLv, 0, ENHANCE_MAX, 0);
  const enhance = 1 + weaponLv * ENHANCE_POW_RATE;
  const core = 10 * POW_K * Math.pow(1.5, rank) * gongMult * weaponMult * enhance;
  const affixPct = clampNum(snap.affixPct, 0, AFFIX_POW_CAP_PCT, 0);   // 百分比制
  const wuPct = clampNum(snap.wuPct, 0, WU_POW_CAP_PCT, 0);             // 百分比制
  const artBgPct = clampNum(snap.artBgPct, 0, ART_BG_MAX, 0);           // 分数制
  const danPowPct = clampNum(snap.danPowPct, 0, DAN_POW_CAP_FRAC, 0);   // 分数制
  const dtPowPct = clampNum(snap.dtPowPct, 0, DT_POW_CAP_PCT, 0);       // 百分比制
  const mult = (1 + affixPct / 100) * (1 + wuPct / 100) * (1 + artBgPct) * (1 + danPowPct) * (1 + dtPowPct / 100);
  const petPower = clampNum(snap.petPower, 0, PET_POWER_CAP, 0);
  const equipPower = clampNum(snap.equipPower, 0, EQUIP_POWER_CAP, 0);
  const power = clampNum(Math.floor(core * mult) + petPower + equipPower, 1, MAX_POWER);
  return { power, source: 'snapshot' };
}
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 7730;
const MAX_BODY = 64 * 1024;
const NAME_MIN = 1;
const NAME_MAX = 12;
const CHAT_MAX = 60;
const ROOM_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8'
};

/* ===================== 配置 ===================== */
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');

function loadConfig() {
  let cfg = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(HERE, 'config.json'), 'utf8'));
    if (parsed && typeof parsed === 'object') cfg = parsed;
  } catch {
    cfg = {};
  }
  let port = Number(process.env.SERVER_PORT !== undefined ? process.env.SERVER_PORT : cfg.port);
  if (!Number.isFinite(port) || port <= 0) port = DEFAULT_PORT;
  const rootRaw = process.env.SERVER_ROOT || cfg.root || DEFAULT_ROOT;
  const host = (cfg.host && typeof cfg.host === 'string') ? cfg.host : DEFAULT_HOST;
  return { host, port, root: path.resolve(String(rootRaw)) };
}

const CFG = loadConfig();

/* ===================== 内存状态 ===================== */
const players = new Map();
const byId = new Map();
const rooms = new Map();
/* P2-A：服务器权威角色档案（token → 档案）。off 档下这张表永远是空的。 */
const profiles = new ProfileStore(PROFILE_MODE, {
  need: NEED,
  maxLayers: NEED.length,   /* 与养成门槛表同源；grantRun 的层数上限也以此为界（ChatGPT #63 审查意见②） */
  rankCap: RANK_CAP,
  enhanceMax: ENHANCE_MAX,
  rankStep: PROFILE_RANK_STEP,
  equipCap: EQUIP_POWER_CAP,
  affixCap: AFFIX_POW_CAP_PCT,
  danCap: DAN_POW_CAP_FRAC,
  wuCap: WU_POW_CAP_PCT,
  artBgCap: ART_BG_MAX
});

/* K11：真实跨玩家交易账本与交易台（纯内存态，重启清空；持久化是 P2 后续切片）。 */
const assetLedger = new AssetLedger();
const tradeDesk = new TradeDesk(assetLedger, {
  balance: (token) => (profiles.find(token)?.stones) || 0,
  debit: (token, amt) => profiles.addStones(token, -amt),
  credit: (token, amt) => profiles.addStones(token, amt)
});

/* 档案 → 战力：一律回到 recomputePower 走（同一套钳制常量，不新增公式）。 */
function profilePowerOf(p) {
  if (!p) return 0;
  const rp = recomputePower(profileSnapshot(p));
  return rp ? rp.power : 0;
}

/* ===================== 小工具 ===================== */
function hex(n) {
  return crypto.randomBytes(n).toString('hex');
}

function isObj(v) {
  return !!v && typeof v === 'object';
}

function sendJson(res, status, obj) {
  if (res.writableEnded || res.headersSent) return;
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function badToken(res) {
  sendJson(res, 200, { ok: false, code: 'BAD_TOKEN' });
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    req.on('data', (c) => {
      if (done) return;
      size += c.length;
      if (size > MAX_BODY) {
        finish(null);
        try { req.destroy(); } catch { /* 忽略 */ }
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (done) return;
      if (!chunks.length) return finish({});
      let parsed;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return finish(null);
      }
      finish(isObj(parsed) ? parsed : null);
    });
    req.on('error', () => finish(null));
  });
}

async function bodyOf(req, res) {
  const b = await readBody(req);
  if (b === null) sendJson(res, 400, { ok: false, code: 'BAD_BODY' });
  return b;
}

function playerOf(body) {
  if (!isObj(body)) return null;
  const token = body.token;
  if (typeof token !== 'string' || !token) return null;
  return players.get(token) || null;
}

/* ===================== 视图投影 ===================== */
/* P0-B：大厅广播必须带服务器权威战力（power + powerSource），
   旁观者看到的才是服务器重算值，而非客户端自报数字。
   P1-A：道途同样是服务器登记值，大厅/房间一并广播。 */
function playerSummary(p) {
  const ph = pathOf(p);
  return {
    id: p.id, name: p.name, online: !!p.online,
    power: p.power, powerSource: p.powerSource || 'legacy',
    path: ph.id, pathName: ph.name
  };
}

function memberView(m) {
  const ph = pathOf(m);
  return {
    id: m.id, name: m.name, ready: !!m.ready,
    power: m.power, powerSource: m.powerSource || 'legacy',
    path: ph.id, pathName: ph.name
  };
}

function roomBrief(r) {
  return { id: r.id, hostId: r.hostId, host: r.host, name: r.name, count: r.members.length, max: r.max, phase: r.phase };
}

function roomPublic(r) {
  return {
    id: r.id,
    hostId: r.hostId,
    host: r.host,
    name: r.name,
    members: r.members.map(memberView),
    max: r.max,
    phase: r.phase
  };
}

function lobbyPlayers() {
  const out = [];
  for (const p of byId.values()) out.push(playerSummary(p));
  return out;
}

function lobbyRooms() {
  const out = [];
  for (const r of rooms.values()) out.push(roomBrief(r));
  return out;
}

/* ---- 副本战力与门槛（P1-A：道途只在这里生效，服务器算，客户端只报枚举） ---- */
/* 本层个人战力：剑修破军斩只在本层生效（run.burst 由服务器维护，客户端改不了）。
   P1-B：再叠"流派共鸣"——按登记道途与已钳制养成快照给上限 15% 的乘子（见 pathSynergyMult）。 */
function memberPowerInRoom(room, m) {
  const run = room.run;
  const burst = (run && Array.isArray(run.burst) && run.burst.indexOf(m.id) >= 0) ? BURST_MULT : 1;
  const syn = (m.snapshot) ? pathSynergyMult(m.snapshot, m.path) : 1;
  return m.power * burst * syn;
}

function totalPower(room) {
  let sum = 0;
  for (const m of room.members) sum += memberPowerInRoom(room, m);
  return sum;
}

/* 丹修温养：本局累计层数，全队战力加成 */
function warmMult(room) {
  const run = room.run;
  const stacks = run && Number.isFinite(run.warm) ? Math.min(run.warm, WARM_MAX) : 0;
  return 1 + WARM_PCT * stacks;
}

/* 本层实际门槛：阵修点阵只在本层生效 */
function needOf(room, layer) {
  const base = NEED[layer - 1];
  const on = room.run && room.run.arrayActive === true;
  return on ? Math.floor(base * ARRAY_PCT) : base;
}

function teamPowerOf(room) {
  const n = room.members.length;
  return Math.floor(totalPower(room) * (1 + TEAM_BONUS * Math.max(n - 1, 0)) * warmMult(room));
}

/* 分奖权重：剑修 1.15（池子总量不变，只是切法变了） */
function weightedShare(room, m) {
  return memberPowerInRoom(room, m) * pathOf(m).contribMult;
}

function isAllStruck(room) {
  const run = room.run;
  if (!run) return false;
  return room.members.every((m) => run.struck.indexOf(m.id) >= 0 || !m.online);   /* 离线自动视为已出手（放置风，规格 run 规则第 7 条） */
}

function runView(room) {
  const run = room.run;
  const skills = room.members.map((m) => {
    const ph = pathOf(m);
    const used = (run.skillsUsed && run.skillsUsed[m.id]) || 0;
    const syn = (m.snapshot) ? pathSynergyMult(m.snapshot, m.path) : 1;
    return {
      id: m.id,
      name: m.name,
      path: ph.id,
      pathName: ph.name,
      axisName: AXIS_NAMES[ph.axis] || ph.axis,
      synergyPct: Math.round((syn - 1) * 1000) / 10,
      skillName: ph.skill.name,
      skillHint: ph.skill.hint,
      usesLeft: Math.max(0, ph.skill.uses - used),
      struck: run.struck.indexOf(m.id) >= 0,
      burst: (run.burst || []).indexOf(m.id) >= 0,
      online: !!m.online
    };
  });
  return {
    layer: run.layer,
    totalLayers: TOTAL_LAYERS,
    needPower: needOf(room, run.layer),
    baseNeedPower: NEED[run.layer - 1],
    teamPower: teamPowerOf(room),
    struck: run.struck.slice(),
    allStruck: isAllStruck(room),
    log: run.log.slice(0, 5),
    warm: run.warm || 0,
    warmMax: WARM_MAX,
    warmPct: Math.round(WARM_PCT * 100),
    arrayActive: run.arrayActive === true,
    guard: run.guard || 0,
    skills,
    stones: room.members.map((m) => ({ id: m.id, name: m.name, stone: run.rewards.get(m.id) || 0 }))
  };
}

/* ===================== SSE 广播 ===================== */
function writeEvent(res, name, data) {
  if (!res || res.writableEnded) return;
  try {
    res.write('event: ' + name + '\ndata: ' + JSON.stringify(data) + '\n\n');
  } catch {
    /* 连接已断，交给 close 清理 */
  }
}

function eachOnlineRoomMember(room, fn) {
  for (const m of room.members) {
    if (m.online && m.sse) fn(m.sse.res);
  }
}

function broadcastLobby() {
  const payload = { players: lobbyPlayers(), rooms: lobbyRooms() };
  for (const p of players.values()) {
    if (p.online && p.sse) writeEvent(p.sse.res, 'lobby', payload);
  }
}

function broadcastRoom(room) {
  const payload = { room: roomPublic(room) };
  eachOnlineRoomMember(room, (res) => writeEvent(res, 'room', payload));
}

function broadcastRun(room) {
  if (!room.run) return;
  const payload = { run: runView(room) };
  eachOnlineRoomMember(room, (res) => writeEvent(res, 'run', payload));
}

/* ===================== 房间进出 / 房主转让 / 解散 ===================== */
function removeFromRoom(p) {
  const room = rooms.get(p.roomId);
  p.roomId = null;
  p.ready = false;
  if (!room) return null;
  const i = room.members.indexOf(p);
  if (i >= 0) room.members.splice(i, 1);
  if (room.run) {
    const j = room.run.struck.indexOf(p.id);
    if (j >= 0) room.run.struck.splice(j, 1);
  }
  if (room.members.length === 0) {
    if (room.settleTimer) {
      clearTimeout(room.settleTimer);
      room.settleTimer = null;
    }
    rooms.delete(room.id);
    return { room, disbanded: true };
  }
  if (room.hostId === p.id) {
    room.hostId = room.members[0].id;
    room.host = room.members[0].name;
  }
  return { room, disbanded: false };
}

function announceRoomChange(out) {
  if (out && out.room && !out.disbanded) broadcastRoom(out.room);
  broadcastLobby();
}

function newRoomId() {
  for (let tries = 0; tries < 200; tries++) {
    const bytes = crypto.randomBytes(4);
    let s = '';
    for (let i = 0; i < 4; i++) s += ROOM_ID_CHARS[bytes[i] % ROOM_ID_CHARS.length];
    if (!rooms.has(s)) return s;
  }
  return ('R' + Date.now().toString(36)).toUpperCase().slice(0, 4);
}

function uniqueName(base) {
  const taken = new Set();
  for (const p of byId.values()) taken.add(p.name);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(base + ' ·' + n)) n++;
  return base + ' ·' + n;
}

/* ===================== 副本推进（服务器权威判定） ===================== */
function startRun(room) {
  room.phase = 'run';
  const rewards = new Map();
  for (const m of room.members) rewards.set(m.id, 0);
  room.run = {
    id: crypto.randomUUID(),
    layer: 1,
    struck: [],
    rewards,
    log: [],
    warm: 0,                 /* 丹修温养层数（本局累计，跨层不清） */
    burst: [],               /* 剑修破军斩受益者（本层） */
    arrayActive: false,      /* 阵修点阵（本层） */
    guard: 0,                /* 体修护持剩余次数（本层） */
    skillsUsed: {}           /* memberId → 本局已用技能次数 */
  };
  broadcastRoom(room);
  broadcastRun(room);
}

function resolveLayer(room) {
  const run = room.run;
  if (!run || room.phase !== 'run') return;
  const need = needOf(room, run.layer);
  const teamPower = teamPowerOf(room);
  let pass = teamPower >= need;
  let shielded = false;
  /* 体修护持：战力不足时不团灭，硬撑过层（此层无灵石）。次数由服务器记账。 */
  if (!pass && run.guard > 0) {
    run.guard -= 1;
    pass = true;
    shielded = true;
  }
  if (!pass) {
    settle(room, { cleared: false, layers: run.layer - 1, reason: 'wipe' });
    return;
  }
  if (shielded) {
    run.log.unshift('体修护持：第' + run.layer + '层硬撑过去，此层无灵石');
  } else {
    const pool = Math.floor(need * 0.5 * (run.layer === BOSS_LAYER ? 1.5 : 1));
    let wsum = 0;
    for (const m of room.members) wsum += weightedShare(room, m);
    for (const m of room.members) {
      const w = weightedShare(room, m);
      const stone = Math.max(wsum > 0 ? Math.floor((pool * w) / wsum) : 1, 1);
      run.rewards.set(m.id, (run.rewards.get(m.id) || 0) + stone);
    }
    run.log.unshift('第' + run.layer + '层突破，灵石按贡献落袋');
  }
  if (run.layer < TOTAL_LAYERS) {
    run.layer += 1;
    run.struck = [];
    run.burst = [];            /* 破军斩/点阵/护持都是"本层"效果，换层即清 */
    run.arrayActive = false;
    run.guard = 0;
    broadcastRun(room);
  } else {
    settle(room, { cleared: true, layers: TOTAL_LAYERS, reason: 'clear' });
  }
}

function settle(room, outcome) {
  const run = room.run;
  if (!run || room.phase !== 'run') return;
  const rewards = room.members.map((m) => ({
    id: m.id,
    name: m.name,
    stone: outcome.layers === 0 ? 0 : (run.rewards.get(m.id) || 0)
  }));
  /* P2-A：按服务器自己的判定结果推进角色档案（唯一写档案的入口）。
     档案推进只依据 outcome.layers 与服务器记的灵石，客户端无从干预。 */
  if (profiles.enabled) {
    for (const m of room.members) {
      const stone = outcome.layers === 0 ? 0 : (run.rewards.get(m.id) || 0);
      const prof = profiles.find(m.token);
      if (prof) {
        /* P2-A-2：按**服务器登记的道途**把产出投到该道途的养成轴（其余轴为 0），
           于是"道途=流派"在根治档下依然成立（剑修法宝强化 / 体修装备护体 / 丹修淬丹 / 阵修悟道）。 */
        profiles.grant(m.token, outcome.layers || 0, stone, m.path);
        if (PROFILE_MODE === 'enforce') {
          m.power = profilePowerOf(prof);
          m.powerSource = 'profile';
          m.snapshot = profileSnapshot(prof);
        }
      }
    }
  }
  const result = { runId: run.id || null, cleared: !!outcome.cleared, layers: outcome.layers, reason: outcome.reason, rewards };
  room.phase = 'settled';
  writeEventToRoomSettle(room, result);
  broadcastRoom(room);
  if (room.settleTimer) clearTimeout(room.settleTimer);
  room.settleTimer = setTimeout(() => {
    room.settleTimer = null;
    if (!rooms.has(room.id) || room.phase !== 'settled') return;
    room.phase = 'lobby';
    room.run = null;
    for (const m of room.members) m.ready = false;
    broadcastRoom(room);
    broadcastLobby();
  }, SETTLE_HOLD_MS);
  if (room.settleTimer.unref) room.settleTimer.unref();
}

function writeEventToRoomSettle(room, result) {
  const payload = { result };
  eachOnlineRoomMember(room, (res) => writeEvent(res, 'run_settle', payload));
}

/* ===================== API 处理 ===================== */
function apiHealth(req, res) {
  let online = 0;
  for (const p of players.values()) if (p.online) online++;
  /* legacyPower 暴露当前闸门档位：false=仅接受快照（默认/生产），true=兼容旧客户端（局域网迁移） */
  sendJson(res, 200, { ok: true, players: online, rooms: rooms.size, legacyPower: LEGACY_POWER, profileMode: PROFILE_MODE });
}

/* P2-A：只读档案接口。客户端没有任何写档案的入口（POST /api/profile 不存在）。
   power = 当前生效战力；profilePower = 档案派生战力（observe 档下两者的差 = 你报的 vs 档案算的）。 */
function apiProfile(req, res, u) {
  const token = u.searchParams.get('token');
  if (!token) return sendJson(res, 200, { ok: false, code: 'BAD_TOKEN' });
  const prof = profiles.find(token);
  if (!prof) return sendJson(res, 200, { ok: false, code: 'NO_PROFILE', mode: PROFILE_MODE });
  const p = players.get(token);
  const derived = profilePowerOf(prof);
  const power = PROFILE_MODE === 'enforce' ? derived : (p ? p.power : derived);
  const powerSource = PROFILE_MODE === 'enforce' ? 'profile' : (p ? (p.powerSource || 'snapshot') : 'profile');
  sendJson(res, 200, { ok: true, profile: profiles.summary(prof, power, powerSource, derived) });
}

async function apiJoin(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  /* P0-C 续接：携带合法 token 且该玩家仍在某房间 → 复用身份（刷新/断线重连回原队）。
     玩家对象在内存里不因 SSE 断开而删除（只置 offline + 挂踢人定时器），故可复用。 */
  if (typeof body.token === 'string' && body.token) {
    const existing = players.get(body.token);
    if (existing && existing.roomId && rooms.has(existing.roomId)) {
      existing.online = true;
      if (existing.kickTimer) { clearTimeout(existing.kickTimer); existing.kickTimer = null; }
      /* P2-A：档案在离线期间也可能被结算推进过（续接的是同一份档案）→ 续接时按档案刷新战力。 */
      if (PROFILE_MODE === 'enforce' && existing.profileId) {
        const prof = profiles.byProfileId(existing.profileId);
        if (prof) { existing.power = profilePowerOf(prof); existing.powerSource = 'profile'; existing.snapshot = profileSnapshot(prof); }
      }
      const ph = pathOf(existing);
      sendJson(res, 200, {
        ok: true,
        player: {
          id: existing.id, token: existing.token, name: existing.name,
          power: existing.power, powerSource: existing.powerSource || 'legacy',
          path: ph.id, pathName: ph.name
        },
        resumed: true,
        roomId: existing.roomId
      });
      broadcastLobby();   /* 续接上线要广播，让其他在线玩家看到其 online 状态刷新 */
      return;
    }
  }
  const rawName = body.name;
  if (typeof rawName !== 'string') return sendJson(res, 200, { ok: false, code: 'BAD_NAME' });
  const name = rawName.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) return sendJson(res, 200, { ok: false, code: 'BAD_NAME' });
  /* P1-A：道途只接受枚举 id；非法一律拒绝（不静默回落，避免"以为选上了其实没选"）。
     不传 path 的旧客户端走缺省剑修。 */
  let path = DEFAULT_PATH;
  if (body.path !== undefined) {
    if (!isPathId(body.path)) return sendJson(res, 200, { ok: false, code: 'BAD_PATH' });
    path = body.path;
  }
  let power = 0;
  let powerSource = 'snapshot';
  /* P2-A：档案闸门。
     enforce —— 忽略 body.snapshot（连同 body.power 一律不读）：战力来自服务器自己的档案。
                客户端没有任何写档案的入口，伪造满级快照在这里没有任何效果。
     observe —— 战力仍按快照算（现状不变），但同时建档并按服务器规则推进档案。 */
  var joinedProfile = null;
  if (PROFILE_MODE === 'enforce') {
    const hint = (typeof body.token === 'string' && body.token) ? body.token : '';
    joinedProfile = profiles.ensure(hint, name);
    power = profilePowerOf(joinedProfile);
    powerSource = 'profile';
    /* 共鸣用的快照也来自档案（服务器生成），客户端注入的数值无处可去。 */
    var joinedSnapshot = profileSnapshot(joinedProfile);
  } else if (body.snapshot !== undefined) {
    /* P0-B：携带养成快照 → 服务器重算破力，忽略 body.power（防「直接报 1e12」）。
       #75：无快照 → legacy 回退，**默认关闭**（LEGACY_POWER=1 才开）。
       快照是对象却算不出结果时不再静默回落成 100（那是隐形的 legacy 信任回退），一律 BAD_SNAPSHOT。 */
    if (!body.snapshot || typeof body.snapshot !== 'object' || Array.isArray(body.snapshot)) {
      return sendJson(res, 200, { ok: false, code: 'BAD_SNAPSHOT', error: '养成快照格式不对，请刷新页面重试。' });
    }
    const rp = recomputePower(body.snapshot);
    if (!rp) return sendJson(res, 200, { ok: false, code: 'BAD_SNAPSHOT', error: '养成快照无法解析，请刷新页面重试。' });
    power = rp.power;
    powerSource = rp.source;
    /* P1-B：暂存已校验的养成快照，副本内算"流派共鸣"时按登记道途引用（player 创建后赋值）。 */
    var joinedSnapshot = body.snapshot;
    /* observe 档：档案照建照推，但战力仍以快照为准（用于对比"档案算出多少 vs 你报了多少"）。 */
    if (PROFILE_MODE === 'observe') {
      joinedProfile = profiles.ensure((typeof body.token === 'string' && body.token) ? body.token : '', name);
    }
  } else {
    if (!LEGACY_POWER) return sendJson(res, 200, { ok: false, code: 'LEGACY_DISABLED', error: LEGACY_OFF_MSG });
    if (typeof body.power !== 'number' || !Number.isFinite(body.power) || body.power <= 0 || body.power > LEGACY_POWER_CAP) {
      return sendJson(res, 200, { ok: false, code: 'BAD_POWER', error: '战力上报值不合法。' });
    }
    power = body.power;
    powerSource = 'legacy';
    if (PROFILE_MODE === 'observe') {
      joinedProfile = profiles.ensure((typeof body.token === 'string' && body.token) ? body.token : '', name);
    }
  }
  const finalName = uniqueName(name);
  const player = {
    id: hex(8).slice(0, 8),
    token: hex(24).slice(0, 24),
    name: finalName,
    power,
    powerSource,
    path,
    snapshot: (typeof joinedSnapshot !== 'undefined') ? joinedSnapshot : undefined,
    profileId: joinedProfile ? joinedProfile.id : undefined,
    online: false,
    roomId: null,
    ready: false,
    sse: null,
    kickTimer: null
  };
  /* 档案绑到新 token（换 token 不换档案，续接/结算都找得到）。 */
  if (joinedProfile) profiles.bind(player.token, joinedProfile);
  players.set(player.token, player);
  byId.set(player.id, player);
  sendJson(res, 200, {
    ok: true,
    player: {
      id: player.id, token: player.token, name: player.name,
      power: player.power, powerSource: player.powerSource,
      path: player.path, pathName: PATHS[player.path].name
    }
  });
}

function apiStream(req, res, u) {
  const token = u.searchParams.get('token');
  const p = typeof token === 'string' ? players.get(token) : null;
  if (!p) return sendJson(res, 403, { ok: false, code: 'BAD_TOKEN' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.flushHeaders();
  const conn = { res, pingTimer: null, alive: true };
  if (p.sse && p.sse !== conn) {
    const old = p.sse;
    old.alive = false;
    if (old.pingTimer) {
      clearInterval(old.pingTimer);
      old.pingTimer = null;
    }
    writeEvent(old.res, 'bye', { code: 'SUPERSEDED' });
    try { old.res.end(); } catch { /* 已断 */ }
  }
  p.sse = conn;
  p.online = true;
  if (p.kickTimer) {
    clearTimeout(p.kickTimer);
    p.kickTimer = null;
  }
  writeEvent(res, 'hello', {
    you: { id: p.id, name: p.name, path: pathOf(p).id },
    paths: pathCatalog(),
    players: lobbyPlayers(),
    rooms: lobbyRooms()
  });
  /* P0-C 续接：若玩家已在某房间（刷新/重连），把房间与副本状态推回去，客户端无需再轮询 */
  if (p.roomId && rooms.has(p.roomId)) {
    const rm = rooms.get(p.roomId);
    writeEvent(res, 'room', { room: roomPublic(rm) });
    if (rm.run) writeEvent(res, 'run', { run: runView(rm) });
  }
  broadcastLobby();
  conn.pingTimer = setInterval(() => {
    if (!conn.alive || res.writableEnded) return;
    try {
      res.write(': ping\n\n');
    } catch {
      cleanup();
    }
  }, PING_MS);
  if (conn.pingTimer.unref) conn.pingTimer.unref();
  function cleanup() {
    if (!conn.alive) return;
    conn.alive = false;
    if (conn.pingTimer) {
      clearInterval(conn.pingTimer);
      conn.pingTimer = null;
    }
    if (p.sse !== conn) return;
    p.sse = null;
    p.online = false;
    broadcastLobby();
    if (p.kickTimer) clearTimeout(p.kickTimer);
    /* 副本进行中先不踢：此时离线按"放置风"自动补出手；结束后再判，且必须重排程——
       否则单次定时器在 run 相位 return 后，幽灵成员永不被清理（第 116 轮审查 P0-A） */
    const armKick = () => {
      p.kickTimer = setTimeout(() => {
        p.kickTimer = null;
        if (p.online) return;
        const room = rooms.get(p.roomId);
        if (!room) return;
        if (room.phase === 'run') { armKick(); return; }
        announceRoomChange(removeFromRoom(p));
      }, OFFLINE_KICK_MS);
      if (p.kickTimer.unref) p.kickTimer.unref();
    };
    armKick();
  }
  req.on('close', cleanup);
  req.on('aborted', cleanup);
  req.on('error', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
}

async function apiRoomCreate(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  const existing = rooms.get(p.roomId);
  if (existing) return sendJson(res, 200, { ok: true, room: roomPublic(existing) });
  const room = {
    id: newRoomId(),
    hostId: p.id,
    host: p.name,
    name: p.name + '的队伍',
    members: [p],
    max: 4,
    phase: 'lobby',
    run: null,
    settleTimer: null
  };
  p.roomId = room.id;
  p.ready = false;
  rooms.set(room.id, room);
  broadcastLobby();
  sendJson(res, 200, { ok: true, room: roomPublic(room) });
}

async function apiRoomJoin(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  const roomId = body.roomId;
  const room = typeof roomId === 'string' ? rooms.get(roomId) : null;
  if (!room) return sendJson(res, 200, { ok: false, code: 'ROOM_NOT_FOUND' });
  if (p.roomId === room.id) return sendJson(res, 200, { ok: true, room: roomPublic(room) });
  if (room.phase !== 'lobby') return sendJson(res, 200, { ok: false, code: 'ROOM_RUNNING' });
  if (room.members.length >= room.max) return sendJson(res, 200, { ok: false, code: 'ROOM_FULL' });
  if (p.roomId) announceRoomChange(removeFromRoom(p));
  room.members.push(p);
  p.roomId = room.id;
  p.ready = false;
  broadcastRoom(room);
  broadcastLobby();
  sendJson(res, 200, { ok: true, room: roomPublic(room) });
}

async function apiRoomLeave(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  if (!p.roomId) return sendJson(res, 200, { ok: true });
  announceRoomChange(removeFromRoom(p));
  sendJson(res, 200, { ok: true });
}

async function apiRoomReady(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  if (typeof body.ready !== 'boolean') return sendJson(res, 200, { ok: false, code: 'BAD_READY' });
  const room = rooms.get(p.roomId);
  if (!room) return sendJson(res, 200, { ok: false, code: 'NOT_IN_ROOM' });
  if (room.phase !== 'lobby') return sendJson(res, 200, { ok: false, code: 'BAD_PHASE' });
  p.ready = body.ready;
  broadcastRoom(room);
  sendJson(res, 200, { ok: true, room: roomPublic(room) });
}

/* P1-A：改道途。只收枚举 id；开战后冻结（防中途换道途适配层数）。
   客户端即便在 body 里塞 pathMult/contribMult 之类，本函数也只读 body.path。 */
async function apiPath(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  if (!isPathId(body.path)) return sendJson(res, 200, { ok: false, code: 'BAD_PATH' });
  const room = rooms.get(p.roomId);
  if (room && room.phase === 'run') return sendJson(res, 200, { ok: false, code: 'BAD_PHASE' });
  p.path = body.path;
  if (room) broadcastRoom(room);
  broadcastLobby();
  sendJson(res, 200, { ok: true, path: p.path, pathName: PATHS[p.path].name });
}

async function apiRoomChat(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  const room = rooms.get(p.roomId);
  if (!room) return sendJson(res, 200, { ok: false, code: 'NOT_IN_ROOM' });
  const raw = body.text;
  if (typeof raw !== 'string') return sendJson(res, 200, { ok: false, code: 'BAD_TEXT' });
  const text = raw.trim();
  if (text.length < 1 || text.length > CHAT_MAX) return sendJson(res, 200, { ok: false, code: 'BAD_TEXT' });
  const payload = { from: p.id, name: p.name, text, ts: Date.now() };
  eachOnlineRoomMember(room, (r) => writeEvent(r, 'chat', payload));
  sendJson(res, 200, { ok: true });
}

async function apiRoomStart(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  const room = rooms.get(p.roomId);
  if (!room) return sendJson(res, 200, { ok: false, code: 'NOT_IN_ROOM' });
  if (room.hostId !== p.id) return sendJson(res, 200, { ok: false, code: 'NOT_HOST' });
  if (room.phase !== 'lobby') return sendJson(res, 200, { ok: false, code: 'BAD_PHASE' });
  const n = room.members.length;
  if (n < 2 || n > room.max) return sendJson(res, 200, { ok: false, code: 'MIN_PLAYERS' });
  if (!room.members.every((m) => m.ready === true)) return sendJson(res, 200, { ok: false, code: 'READY_MISSING' });
  startRun(room);
  sendJson(res, 200, { ok: true });
}

async function apiRunStrike(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  const room = rooms.get(p.roomId);
  if (!room) return sendJson(res, 200, { ok: false, code: 'NOT_IN_ROOM' });
  if (room.phase !== 'run' || !room.run) return sendJson(res, 200, { ok: false, code: 'BAD_PHASE' });
  if (room.run.struck.indexOf(p.id) < 0) room.run.struck.push(p.id);
  if (isAllStruck(room)) resolveLayer(room);
  else broadcastRun(room);
  sendJson(res, 200, { ok: true, layer: room.run ? room.run.layer : NEED.length });
}

/* P1-A：声明道途技能（出手前）。效果全由服务器按登记道途施加：
 *   burst → 本层个人战力 ×1.5；guard → 本层战力不足也可过层（无灵石）；
 *   brew  → 全队温养 +1（上限 3）；array → 本层门槛 ×0.85。
 * 已出手的人不能再声明（ALREADY_STRUCK）；次数用尽 NO_SKILL_USES。 */
async function apiRunSkill(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  const room = rooms.get(p.roomId);
  if (!room) return sendJson(res, 200, { ok: false, code: 'NOT_IN_ROOM' });
  if (room.phase !== 'run' || !room.run) return sendJson(res, 200, { ok: false, code: 'BAD_PHASE' });
  const run = room.run;
  if (run.struck.indexOf(p.id) >= 0) return sendJson(res, 200, { ok: false, code: 'ALREADY_STRUCK' });
  const ph = pathOf(p);
  if (!run.skillsUsed) run.skillsUsed = {};
  const used = run.skillsUsed[p.id] || 0;
  if (used >= ph.skill.uses) return sendJson(res, 200, { ok: false, code: 'NO_SKILL_USES' });
  const sid = ph.skill.id;
  if (sid === 'burst') {
    if (run.burst.indexOf(p.id) < 0) run.burst.push(p.id);
  } else if (sid === 'guard') {
    run.guard = Math.min((run.guard || 0) + 1, 4);
  } else if (sid === 'brew') {
    run.warm = Math.min((run.warm || 0) + 1, WARM_MAX);
  } else if (sid === 'array') {
    run.arrayActive = true;
  }
  run.skillsUsed[p.id] = used + 1;
  run.log.unshift(p.name + ' · ' + ph.skill.name);
  broadcastRun(room);
  sendJson(res, 200, { ok: true, path: ph.id, skill: sid, usesLeft: ph.skill.uses - used - 1 });
}

async function apiRunLeave(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  const room = rooms.get(p.roomId);
  if (!room) return sendJson(res, 200, { ok: true });
  if (room.phase === 'run' && room.run) {
    settle(room, { cleared: false, layers: room.run.layer - 1, reason: 'retreat' });
    return sendJson(res, 200, { ok: true });
  }
  announceRoomChange(removeFromRoom(p));
  sendJson(res, 200, { ok: true });
}

async function apiLobbySnapshot(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  sendJson(res, 200, { ok: true, players: lobbyPlayers(), rooms: lobbyRooms() });
}

/* ===================== K11 真实跨玩家交易 ===================== */
/* 测试态开关：仅 SERVER_TEST_MODE=1/true 时开放内部 seed/ownership 路由，供真实 HTTP 端到端测试注入物品/灵石与核对真实归属。
   生产环境（不设置该变量）下这些路由一律返回 404，绝不泄露任何内部能力。
   生产环境部署 MUST 不设置 SERVER_TEST_MODE，否则等于把"资产铸造接口"暴露给任意持有有效 token 的调用者。 */
const TEST_MODE = String(process.env.SERVER_TEST_MODE) === '1' || String(process.env.SERVER_TEST_MODE) === 'true';
if (TEST_MODE) {
  console.warn('[K11] WARNING: SERVER_TEST_MODE is ON — test seed/ownership routes are LIVE. MUST be disabled in production (set SERVER_TEST_MODE off).');
}

async function apiK11Consign(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  try {
    const listing = tradeDesk.consign(body.itemId, p.token, body.price, body.qty);
    sendJson(res, 200, { ok: true, listing: publicListing(listing) });
  } catch (e) {
    sendJson(res, 200, { ok: false, code: 'CONSIGN_FAIL', message: e.message });
  }
}

async function apiK11Buy(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  try {
    const r = tradeDesk.buy(body.listingId, p.token, body.idempotencyId);
    sendJson(res, 200, { ok: true, replayed: r.replayed, result: publicBuyResult(r.result) });
  } catch (e) {
    sendJson(res, 200, { ok: false, code: 'BUY_FAIL', message: e.message });
  }
}

async function apiK11Cancel(req, res) {
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  try {
    const listing = tradeDesk.cancel(body.listingId, p.token);
    sendJson(res, 200, { ok: true, listing: publicListing(listing) });
  } catch (e) {
    sendJson(res, 200, { ok: false, code: 'CANCEL_FAIL', message: e.message });
  }
}

async function apiK11Listings(req, res) {
  sendJson(res, 200, { ok: true, listings: tradeDesk.listings().map(publicListing) });
}

/* —— 测试态专用 seed 路由（仅 TEST_MODE 开放，供 P1-4 真实 HTTP 端到端测试注入物品/灵石） —— */
async function apiTestSeedItem(req, res) {
  if (!TEST_MODE) return notFound(res);
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  try {
    const qty = Math.max(1, Math.floor(Number(body.qty) || 1));
    const item = assetLedger.register(String(body.itemId), p.token, qty);
    sendJson(res, 200, { ok: true, item: { itemId: item.itemId, ownerToken: item.ownerToken, qty: item.qty, status: item.status } });
  } catch (e) {
    sendJson(res, 200, { ok: false, code: 'SEED_FAIL', message: e.message });
  }
}

async function apiTestGrantStones(req, res) {
  if (!TEST_MODE) return notFound(res);
  const body = await bodyOf(req, res);
  if (body === null) return;
  const p = playerOf(body);
  if (!p) return badToken(res);
  try {
    const amt = Number(body.amount);
    if (!Number.isFinite(amt) || amt === 0) throw new Error('amount 必须为非零有限数');
    const next = profiles.addStones(p.token, amt);
    sendJson(res, 200, { ok: true, stones: next });
  } catch (e) {
    sendJson(res, 200, { ok: false, code: 'GRANT_FAIL', message: e.message });
  }
}

/* 测试态：读取真实账本中某物品的所有权（仅 TEST_MODE 开放，供 P1-4 独立核验购买后真实归属）。
   生产环境返回 404（不暴露任何内部能力）。 */
async function apiTestOwnership(req, res) {
  if (!TEST_MODE) return notFound(res);
  const u = new URL(req.url, 'http://localhost');
  const itemId = u.searchParams.get('itemId');
  if (!itemId) return sendJson(res, 200, { ok: false, code: 'BAD_PARAM' });
  const it = assetLedger.query(itemId);
  if (!it) return sendJson(res, 200, { ok: false, code: 'NO_ITEM' });
  sendJson(res, 200, { ok: true, item: { itemId: it.itemId, ownerToken: it.ownerToken, status: it.status, qty: it.qty } });
}

/* ===================== 路由 ===================== */
const ROUTES = [
  ['GET', '/api/health', apiHealth],
  ['GET', '/api/profile', apiProfile],
  ['POST', '/api/join', apiJoin],
  ['GET', '/api/stream', apiStream],
  ['POST', '/api/room/create', apiRoomCreate],
  ['POST', '/api/room/join', apiRoomJoin],
  ['POST', '/api/room/leave', apiRoomLeave],
  ['POST', '/api/room/ready', apiRoomReady],
  ['POST', '/api/path', apiPath],
  ['POST', '/api/room/chat', apiRoomChat],
  ['POST', '/api/room/start', apiRoomStart],
  ['POST', '/api/run/strike', apiRunStrike],
  ['POST', '/api/run/skill', apiRunSkill],
  ['POST', '/api/run/leave', apiRunLeave],
  ['POST', '/api/lobby', apiLobbySnapshot],
  ['POST', '/api/k11/consign', apiK11Consign],
  ['POST', '/api/k11/buy', apiK11Buy],
  ['POST', '/api/k11/cancel', apiK11Cancel],
  ['GET', '/api/k11/listings', apiK11Listings],
  ['POST', '/api/_test/seed-item', apiTestSeedItem],
  ['POST', '/api/_test/grant-stones', apiTestGrantStones],
  ['GET', '/api/_test/ownership', apiTestOwnership]
];

function findRoute(method, pathname) {
  for (const r of ROUTES) {
    if (r[0] === method && r[1] === pathname) return r[2];
  }
  return null;
}

/* ===================== 静态托管 ===================== */
function forbidden(res) {
  sendJson(res, 403, { ok: false, code: 'FORBIDDEN' });
}

function notFound(res) {
  sendJson(res, 404, { ok: false, code: 'NOT_FOUND' });
}

function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return forbidden(res);
  }
  if (decoded.indexOf('..') >= 0) return forbidden(res);
  const root = CFG.root;
  const target = path.resolve(root, '.' + (decoded.startsWith('/') ? decoded : '/' + decoded));
  if (target !== root && target.startsWith(root + path.sep) === false) return forbidden(res);
  let file = target;
  let st;
  try {
    st = fs.statSync(target);
  } catch {
    return notFound(res);
  }
  if (st.isDirectory()) {
    file = path.join(target, 'index.html');
    try {
      st = fs.statSync(file);
    } catch {
      return notFound(res);
    }
  }
  if (!st.isFile()) return notFound(res);
  const data = fs.readFileSync(file);
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Content-Length': data.length
  });
  if (req.method === 'HEAD') return res.end();
  res.end(data);
}

/* ===================== 服务器主体 ===================== */
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const pathname = u.pathname;
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      const handler = findRoute(req.method, pathname);
      if (!handler) return sendJson(res, 404, { ok: false, code: 'NOT_FOUND' });
      await handler(req, res, u);
      if (!res.writableEnded && res.headersSent === false) sendJson(res, 500, { ok: false, code: 'INTERNAL' });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { ok: false, code: 'BAD_METHOD' });
    }
    serveStatic(req, res, pathname);
  } catch {
    try {
      if (!res.writableEnded && !res.headersSent) {
        sendJson(res, 500, { ok: false, code: 'INTERNAL' });
      } else if (!res.writableEnded) {
        res.end();
      }
    } catch {
      /* 兜底：连 500 都发不出去也不能崩 */
    }
  }
});

/* SSE 长连接不受请求超时约束 */
server.requestTimeout = 0;
server.headersTimeout = 60000;
server.keepAliveTimeout = 5000;

process.on('uncaughtException', () => {
  /* 任何异步漏网异常都不打崩进程 */
});

server.listen(CFG.port, CFG.host, () => {
  console.log('listening on http://' + CFG.host + ':' + CFG.port + ' static root ' + CFG.root
    + ' | legacyPower=' + (LEGACY_POWER ? 'ON(cap=' + LEGACY_POWER_CAP + ')' : 'OFF')
    + ' | profileMode=' + PROFILE_MODE);
});
