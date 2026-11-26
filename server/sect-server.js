'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_MS = 30 * 60 * 1000;   /* 求助有效期：制作人 2026-10-27 定为 30 分钟（面板文案由 leftMs 派生，不用改） */
const BONUS_PER_GUARD = 0.07;
const GUARD_SLOTS = 3;
const PUB_MAX = 3;
const GUARD_MAX = 10;
const BODY_MAX = 16 * 1024;
const MAX_RANK = 25;
const MAX_PLAYERS = 20_000;
/* batch5 第 4 项（拍板乙案）：服务端战力字段与战力榜。
 * 客户端只上报养成快照，服务端按 combatPower 同口径重算；不采信客户端最终数字。
 * 公式副本与 server/server.mjs 的 recomputePower 同源；改战力公式须制作人批准。 */
const POWER_VER = 1;
const POWER_MAX = 1e10;                 /* 与 server/server.mjs MAX_POWER 一致 */
const POWER_FRESH_MS = 7 * DAY_MS;      /* 榜单/协力只认近 7 天上报 */
const POWER_BOARD_CAP = 50;
const CHAT_MAX = 200;        /* 世界频道环形缓冲上限（纯内存态，重启清空——聊天是瞬态数据，不值得落盘） */
const CHAT_LEN = 60;         /* 单条消息字数上限 */
const CHAT_CD = 2500;        /* 发言冷却 ms */
const EVENT_MAX = 60;        /* 宗门动态流保留条数（落盘，重启后仍在——是"山门气象"的历史） */
const SEEN_ONLINE_MS = 10 * 60 * 1000;   /* 在场判定：10 分钟内有访问 */
const SEEN_ACTIVE_MS = 24 * 60 * 60 * 1000; /* 今日活跃判定：24 小时内有访问 */

function today(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function safeText(value, max) {
  return String(value == null ? '' : value).replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
}

/* ===================== 服务端战力重算（batch5 第 4 项 · 乙案） =====================
 * 客户端上报"受钳制养成快照"，服务端逐项钳制后按 game.js combatPower() 同口径重算。
 * 钳制常量都能在客户端源码指到出处，只取"合法满级"上限（与 server/server.mjs 的
 * recomputePower 同一套；此处 ART_BG_CAP 取 0.86 = ART_FX.bg 最高 0.56 + 强化 20 级 ×1.5%，
 * 因为客户端 artPowPct() 把强化加成算在同一分数里 —— server.mjs 旧副本只取 0.56，
 * 会低估满强化角色，本服务按客户端实际合法最大值对齐）。 */
const SECT_POW_K = 100;                          /* game.js:152 */
const SECT_GONGS = [                             /* game.js:689-693 rate/max */
  { rate: 1.03, max: 10 }, { rate: 1.04, max: 10 }, { rate: 1.05, max: 10 }
];
const SECT_WEAPON_MULT = [1.0, 1.05, 1.10, 1.20, 1.35, 1.44, 1.53, 1.63, 1.73, 1.85]; /* game.js:400 */
const SECT_ENHANCE_RATE = 0.05;                  /* BAL.enhancePowRate */
const SECT_ENHANCE_MAX = 20;                     /* BAL.enhanceMax */
const SECT_RANK_CAP = 25;                        /* 飞升 rank 25 */
const SECT_GONG_CAP = 10;
const SECT_WU_CAP_PCT = 52;                      /* game.js WU_TREE.sword 全满 */
const SECT_AFFIX_CAP_PCT = 22;                   /* 单法宝战力词条最高 22 */
const SECT_DAN_CAP_FRAC = 0.55;                  /* 淬体丹最高档 */
const SECT_DT_CAP_PCT = 22.5;                    /* 洞天 pow 满级 + 主洞 ×1.5 */
const SECT_PET_TOTAL_CAP = 0.40;                 /* 灵兽总战力 = 40% × 境界基础战力（game.js:2938,2956） */
const SECT_EQUIP_CAP = 4500;                     /* 三槽最强 1800+1500+1200 */
const SECT_ART_BG_CAP = 0.86;                    /* ART_FX.bg 0.56 + 0.015×20 */

function sectClamp(v, lo, hi, dflt) {
  const n = (typeof v === 'number' && Number.isFinite(v)) ? v : dflt;
  return Math.min(hi, Math.max(lo, n));
}
/* 返回 { power, source } 或 null（无有效快照）。 */
function recomputePower(snap) {
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return null;
  const rank = sectClamp(snap.rank, 0, SECT_RANK_CAP, 0);
  const gLv = Array.isArray(snap.gongLvs) ? snap.gongLvs : [];
  const gongMult = SECT_GONGS.reduce((a, g, i) => a * Math.pow(g.rate, sectClamp(gLv[i], 0, SECT_GONG_CAP, 0)), 1);
  const weapon = sectClamp(snap.weapon, 0, SECT_WEAPON_MULT.length - 1, 0);
  const weaponMult = SECT_WEAPON_MULT[weapon] || 1;
  const weaponLv = sectClamp(snap.weaponLv, 0, SECT_ENHANCE_MAX, 0);
  const core = 10 * SECT_POW_K * Math.pow(1.5, rank) * gongMult * weaponMult * (1 + weaponLv * SECT_ENHANCE_RATE);
  const affixPct = sectClamp(snap.affixPct, 0, SECT_AFFIX_CAP_PCT, 0);
  const wuPct = sectClamp(snap.wuPct, 0, SECT_WU_CAP_PCT, 0);
  const artBgPct = sectClamp(snap.artBgPct, 0, SECT_ART_BG_CAP, 0);
  const danPowPct = sectClamp(snap.danPowPct, 0, SECT_DAN_CAP_FRAC, 0);
  const dtPowPct = sectClamp(snap.dtPowPct, 0, SECT_DT_CAP_PCT, 0);
  const mult = (1 + affixPct / 100) * (1 + wuPct / 100) * (1 + artBgPct) * (1 + danPowPct) * (1 + dtPowPct / 100);
  /* 灵兽合计封顶随境界走（40% × 10×POW_K×1.5^rank），与客户端 petPowerSum 同口径；
     固定上限会低估高境界合法灵兽（旧 server.mjs 的 2,160,000 已落后于 N7 的 ×POW_K 刻度）。 */
  const petCap = Math.floor(SECT_PET_TOTAL_CAP * 10 * SECT_POW_K * Math.pow(1.5, rank));
  const petPower = Math.min(sectClamp(snap.petPower, 0, Number.MAX_SAFE_INTEGER, 0), petCap);
  const equipPower = sectClamp(snap.equipPower, 0, SECT_EQUIP_CAP, 0);
  const power = sectClamp(Math.floor(core * mult) + petPower + equipPower, 1, POWER_MAX);
  return { power, source: 'snapshot' };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let tooLarge = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > BODY_MAX) {
        if (!tooLarge) reject(Object.assign(new Error('请求内容过大'), { status: 413 }));
        tooLarge = true;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('请求格式无效'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function createSectServer(options = {}) {
  const dataFile = path.resolve(options.dataFile || path.join(__dirname, 'data', 'sect.json'));
  const now = options.now || (() => Date.now());
  const state = loadState(dataFile);
  const limits = new Map();
  /* 世界频道（传音）：内存环形缓冲，不随宗门数据落盘 */
  const chatLog = [];
  let chatSeq = 0;
  const chatCd = new Map();

  function chatPush(msg) {
    chatSeq++;
    chatLog.push(msg.seq === undefined ? Object.assign({ seq: chatSeq, ts: now() }, msg) : msg);
    if (chatLog.length > CHAT_MAX) chatLog.splice(0, chatLog.length - CHAT_MAX);
  }
  function chatPushSys(text) { chatPush({ sys: true, text: safeText(text, 80) }); }

  function loadState(file) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        players: parsed.players && typeof parsed.players === 'object' ? parsed.players : {},
        requests: Array.isArray(parsed.requests) ? parsed.requests.filter(validSavedRequest) : [],
        events: Array.isArray(parsed.events) ? parsed.events.filter(validSavedEvent) : []
      };
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('宗门数据无法读取，将使用空数据：', e.message);
      return { players: {}, requests: [], events: [] };
    }
  }

  function validSavedRequest(r) {
    return r && typeof r.id === 'string' && typeof r.owner === 'string' &&
      Number.isInteger(r.rank) && Array.isArray(r.guards) && Number.isFinite(r.createdAt) && Number.isFinite(r.expiresAt);
  }

  function validSavedEvent(e) {
    return e && typeof e.id === 'string' && typeof e.kind === 'string' &&
      typeof e.nick === 'string' && Number.isFinite(e.t);
  }

  function persist() {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const temp = `${dataFile}.${process.pid}.tmp`;
    const fd = fs.openSync(temp, 'w');
    try {
      fs.writeFileSync(fd, JSON.stringify(state));
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(temp, dataFile);
  }

  function player(pid, nick) {
    if (!state.players[pid]) {
      if (Object.keys(state.players).length >= MAX_PLAYERS) throw Object.assign(new Error('宗门名册已满'), { status: 503 });
      state.players[pid] = { nick, guardDay: '', guard: 0, pubDay: '', pub: 0, pendStone: 0, pendExp: 0,
        seen: 0, rank: 0, joined: now(), guardsAll: 0, pubsAll: 0,
        power: 0, powerAt: 0, powerSource: 'none', powerVer: 0 };
    }
    const p = state.players[pid];
    if (p.guardDay !== today(now())) { p.guardDay = today(now()); p.guard = 0; }
    if (p.pubDay !== today(now())) { p.pubDay = today(now()); p.pub = 0; }
    p.nick = nick || p.nick || `散修${pid.slice(-3)}`;
    if (!Number.isFinite(p.seen)) p.seen = 0;
    if (!Number.isInteger(p.rank)) p.rank = 0;
    if (!Number.isFinite(p.joined)) p.joined = now();
    if (!Number.isFinite(p.guardsAll)) p.guardsAll = 0;
    if (!Number.isFinite(p.pubsAll)) p.pubsAll = 0;
    /* 旧档补字段（additive，不改客户端存档结构）：缺失/损坏一律归 0/none，不上榜、不报错 */
    if (!Number.isFinite(p.power) || p.power < 0) p.power = 0;
    p.power = Math.min(POWER_MAX, Math.floor(p.power));
    if (!Number.isFinite(p.powerAt) || p.powerAt < 0) p.powerAt = 0;
    if (p.powerSource !== 'snapshot' && p.powerSource !== 'reported' && p.powerSource !== 'none') p.powerSource = 'none';
    if (!Number.isInteger(p.powerVer) || p.powerVer < 0) p.powerVer = 0;
    return p;
  }

  /* 同门动态流：护法/求助/突破等事件留痕，是"山门气象"的时间轴 */
  function pushEvent(kind, text, extra){
    const ev = Object.assign({ id: crypto.randomUUID(), kind, nick: '', text: safeText(text, 60), t: now() }, extra || {});
    state.events.push(ev);
    if (state.events.length > EVENT_MAX) state.events.splice(0, state.events.length - EVENT_MAX);
    return ev;
  }

  function activeRequest(pid) { return state.requests.find(r => r.owner === pid) || null; }

  function publicRequest(r) {
    return {
      id: r.id, nick: r.nick, rank: r.rank, guards: r.guards.length, slots: GUARD_SLOTS,
      leftMs: Math.max(0, r.expiresAt - now()), stone: r.stone
    };
  }

  function quota(p) {
    return { guard: p.guard, guardMax: GUARD_MAX, pub: p.pub, pubMax: PUB_MAX,
      pendStone: p.pendStone, pendExp: p.pendExp };
  }

  function cleanup() {
    const before = state.requests.length;
    state.requests = state.requests.filter(r => r.expiresAt > now());
    return before !== state.requests.length;
  }

  function response(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  }

  function cors(req, res) {
    const origin = req.headers.origin;
    if (!origin) return true;
    const local = origin === 'null' || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const allowed = options.allowedOrigins || [];
    if (!local && !allowed.includes(origin)) return false;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return true;
  }

  function rateLimit(req) {
    const key = req.socket.remoteAddress || 'unknown';
    const stamp = now();
    const item = limits.get(key);
    if (!item || stamp - item.start >= 60_000) {
      if (limits.size > 10_000) for (const [ip, entry] of limits) if (stamp - entry.start >= 60_000) limits.delete(ip);
      limits.set(key, { start: stamp, count: 1 }); return true;
    }
    item.count++;
    return item.count <= 180;
  }

  async function handle(req, res) {
    if (!cors(req, res)) return response(res, 403, { ok: false, msg: '来源未获允许' });
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (!rateLimit(req)) return response(res, 429, { ok: false, msg: '请求过于频繁，请稍后再试' });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/sect/health' && req.method === 'GET') return response(res, 200, { ok: true });
    const isChat = url.pathname.startsWith('/api/chat/');
    if (!isChat && !url.pathname.startsWith('/api/sect/')) return response(res, 404, { ok: false, msg: '接口不存在' });

    const pid = safeText(url.searchParams.get('pid') || '', 48);
    const nick = safeText(url.searchParams.get('nick') || '', 12);
    if (!/^p[\w-]{8,40}$/.test(pid)) return response(res, 400, { ok: false, msg: '玩家标识无效' });
    const p = player(pid, nick);
    if (cleanup()) persist();
    const action = isChat ? url.pathname.slice('/api/chat/'.length) : url.pathname.slice('/api/sect/'.length);

    /* 世界频道 · 拉取：返回 since 之后的全部消息（含系统播报），前端靠 seq 增量追更；
       mine 标记让前端能把自己的消息排到右侧（pid 本身不下发） */
    if (isChat && action === 'history' && req.method === 'GET') {
      const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
      return response(res, 200, { ok: true, list: chatLog.filter(m => m.seq > since).map(m => ({
        seq: m.seq, sys: m.sys, nick: m.nick, text: m.text, ts: m.ts, mine: m.pid === pid
      })) });
    }

    if (req.method === 'GET' && action === 'me') {
      const r = activeRequest(pid);
      p.seen = now();
      return response(res, 200, { ok: true, me: quota(p), req: r ? publicRequest(r) : null,
        bonus: BONUS_PER_GUARD, bonusNow: r ? r.guards.length * BONUS_PER_GUARD : 0, nick: p.nick });
    }
    /* 山门气象：全服活跃度统计（只读聚合，不泄露他人 pid）
       members 在线册数 / online 近 10 分钟在场 / active 今日活跃 / today 今日护法与求助 / events 动态流 */
    if (req.method === 'GET' && action === 'stats') {
      const stamp = now();
      p.seen = stamp;                     /* 查气象本身就是"在场"行为 */
      const players = Object.values(state.players);
      const online = players.filter(x => stamp - (x.seen || 0) <= SEEN_ONLINE_MS);
      const active = players.filter(x => stamp - (x.seen || 0) <= SEEN_ACTIVE_MS);
      const todayGuard = players.reduce((s, x) => s + (x.guardDay === today(stamp) ? (x.guard | 0) : 0), 0);
      const todayPub = players.reduce((s, x) => s + (x.pubDay === today(stamp) ? (x.pub | 0) : 0), 0);
      /* 在场名录按境界高者在前，同境界按最近活跃在前；最多 12 人 */
      const roster = online.slice()
        .sort((a, b) => (b.rank | 0) - (a.rank | 0) || (b.seen || 0) - (a.seen || 0))
        .slice(0, 12)
        .map(x => ({ nick: x.nick, rank: x.rank | 0, ago: Math.max(0, Math.round((stamp - (x.seen || 0)) / 1000)) }));
      const events = state.events.slice(-12).reverse().map(e => ({ id: e.id, kind: e.kind, nick: e.nick, text: e.text, t: e.t }));
      return response(res, 200, { ok: true,
        members: players.length, online: online.length, active: active.length,
        todayGuard, todayPub, requests: state.requests.length,
        events, roster, meRank: p.rank | 0 });
    }
    if (req.method === 'GET' && action === 'board') {
      const rank = Number(url.searchParams.get('rank'));
      if (!Number.isInteger(rank) || rank < 0 || rank >= MAX_RANK) return response(res, 400, { ok: false, msg: '境界无效' });
      p.seen = now();
      if (rank > (p.rank | 0)) p.rank = rank;
      const list = state.requests.filter(r => r.owner !== pid && r.rank === rank && r.guards.length < GUARD_SLOTS)
        .sort((a, b) => a.createdAt - b.createdAt).slice(0, 50).map(publicRequest);
      return response(res, 200, { ok: true, list, me: quota(p) });
    }
    /* 战力榜（batch5 第 4 项）：只返回道号/境界/战力/上报时间，不下发 pid/IP；
       最多 50 名，按 power 降序、同战力最近上报者在前；sum/fresh 供宗门协力迁移用（近 7 天）。 */
    if (req.method === 'GET' && action === 'powerboard') {
      const stamp = now();
      const atOf = x => Number.isFinite(x.powerAt) && x.powerAt > 0 ? x.powerAt : 0;
      p.seen = stamp;
      const all = Object.values(state.players).filter(x => (x.power | 0) > 0);
      all.sort((a, b) => (b.power | 0) - (a.power | 0) || atOf(b) - atOf(a) ||
        String(a.nick).localeCompare(String(b.nick)));
      const list = all.slice(0, POWER_BOARD_CAP).map((x, i) => ({
        no: i + 1, nick: x.nick, rank: x.rank | 0, power: x.power | 0, at: atOf(x), me: x === p
      }));
      const fresh = all.filter(x => stamp - atOf(x) <= POWER_FRESH_MS);
      const freshSum = fresh.reduce((s, x) => s + (x.power | 0), 0);
      const myIndex = all.indexOf(p);
      return response(res, 200, { ok: true, list, total: all.length, cap: POWER_BOARD_CAP,
        sum: freshSum, fresh: fresh.length,
        me: { power: p.power | 0, at: atOf(p),
          fresh: (p.power | 0) > 0 && stamp - (p.powerAt || 0) <= POWER_FRESH_MS,
          rank: myIndex >= 0 ? myIndex + 1 : 0 } });
    }
    if (req.method !== 'POST') return response(res, 405, { ok: false, msg: '请求方法不支持' });
    const body = await readBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return response(res, 400, { ok: false, msg: '请求内容无效' });
    const bodyPid = safeText(body.pid || '', 48);
    const bodyNick = safeText(body.nick || '', 12);
    if (bodyPid !== pid || !bodyNick) return response(res, 400, { ok: false, msg: '玩家信息无效' });
    p.nick = bodyNick;

    /* 战报（batch5 第 4 项）：客户端只报养成快照，服务端重算后落 power 字段。
       旧客户端不报 → 保持 0/none；直接报 power 数字的请求在这里不读。 */
    if (action === 'power') {
      const rp = recomputePower(body.snapshot);
      if (!rp) return response(res, 400, { ok: false, msg: '战力快照无效' });
      p.power = rp.power;
      p.powerAt = now();
      p.powerSource = rp.source;
      p.powerVer = Number.isInteger(body.ver) && body.ver > 0 ? Math.min(body.ver, POWER_VER) : POWER_VER;
      p.seen = p.powerAt;
      if (Number.isInteger(body.snapshot.rank) && body.snapshot.rank > (p.rank | 0) && body.snapshot.rank < MAX_RANK) {
        p.rank = body.snapshot.rank;
      }
      persist();
      return response(res, 200, { ok: true, power: p.power, at: p.powerAt, source: p.powerSource, ver: p.powerVer });
    }

    if (action === 'publish') {
      const rank = Number(body.rank);
      if (body.ready !== true || !Number.isInteger(rank) || rank < 0 || rank >= MAX_RANK)
        return response(res, 400, { ok: false, msg: '尚未达到求助条件' });
      if (activeRequest(pid)) return response(res, 409, { ok: false, msg: '已有进行中的求助' });
      if (p.pub >= PUB_MAX) return response(res, 409, { ok: false, msg: '今日求助次数已用完' });
      const r = { id: crypto.randomUUID(), owner: pid, nick: p.nick, rank, createdAt: now(), expiresAt: now() + REQUEST_MS,
        guards: [], stone: Math.max(10, Math.min(500, 20 + rank * 8)) };
      state.requests.push(r); p.pub++; p.pubsAll++; p.seen = now(); if (rank > (p.rank | 0)) p.rank = rank;
      pushEvent('pub', p.nick + ' 贴出求助，求同门护法', { nick: p.nick, rank });
      persist();
      return response(res, 200, { ok: true, req: publicRequest(r), me: quota(p), bonus: BONUS_PER_GUARD });
    }
    if (action === 'guard') {
      const id = safeText(body.reqId || '', 64);
      const r = state.requests.find(x => x.id === id);
      if (!r || r.expiresAt <= now()) return response(res, 404, { ok: false, msg: '求助已结束或不存在' });
      if (r.owner === pid) return response(res, 403, { ok: false, msg: '不能为自己的求助护法' });
      if (r.guards.includes(pid)) return response(res, 409, { ok: false, msg: '你已经为这次求助护法' });
      if (r.guards.length >= GUARD_SLOTS) return response(res, 409, { ok: false, msg: '护法名额已满' });
      if (p.guard >= GUARD_MAX) return response(res, 409, { ok: false, msg: '今日护法次数已用完' });
      r.guards.push(pid); p.guard++; p.guardsAll++; p.pendStone += r.stone; p.seen = now();
      pushEvent('guard', p.nick + ' 为 ' + r.nick + ' 护法，得 ' + r.stone + ' 灵石', { nick: p.nick, rank: p.rank | 0 });
      persist();
      chatPushSys(r.nick + ' 得 ' + p.nick + ' 护法，破境有望');
      return response(res, 200, { ok: true, me: quota(p), preview: r.stone, note: '护法成功，奖励已记入待领取' });
    }
    if (action === 'cancel') {
      const id = safeText(body.reqId || '', 64);
      const index = state.requests.findIndex(r => r.id === id && r.owner === pid);
      if (index < 0) return response(res, 404, { ok: false, msg: '求助已结束或不存在' });
      state.requests.splice(index, 1); persist();
      return response(res, 200, { ok: true, me: quota(p) });
    }
    if (action === 'settle') {
      const id = safeText(body.reqId || '', 64);
      const index = state.requests.findIndex(r => r.id === id && r.owner === pid);
      if (index < 0) return response(res, 404, { ok: false, err: 'gone', msg: '求助已结束' });
      const r = state.requests[index];
      if (!Number.isInteger(body.rank) || body.rank !== r.rank || typeof body.success !== 'boolean')
        return response(res, 400, { ok: false, msg: '突破结算信息无效' });
      const expGain = body.success ? Math.floor(Math.min(3, r.guards.length) * Math.max(100, 1000 + r.rank * 250)) : 0;
      p.pendExp += expGain; p.seen = now();
      pushEvent('settle', r.nick + (body.success ? ' 破境成功，得同门护法 ' + r.guards.length + ' 人' : ' 破境未成'), { nick: r.nick, rank: r.rank });
      state.requests.splice(index, 1); persist();
      return response(res, 200, { ok: true, guards: r.guards.length, expGain, expCapped: false, me: quota(p) });
    }
    if (action === 'claim') {
      const stone = p.pendStone, exp = p.pendExp;
      p.pendStone = 0; p.pendExp = 0; persist();
      return response(res, 200, { ok: true, stone, exp });
    }
    if (action === 'send') {
      const text = safeText(body.text, CHAT_LEN);
      if (!text) return response(res, 400, { ok: false, msg: '说点什么再发' });
      const stamp = now();
      const last = chatCd.get(pid) || 0;
      if (stamp - last < CHAT_CD) return response(res, 429, { ok: false, msg: '道友慢些，言多必失' });
      if (chatCd.size > 5000) for (const [k, v] of chatCd) if (stamp - v >= 60_000) chatCd.delete(k);
      chatCd.set(pid, stamp);
      chatPush({ nick: p.nick, pid, text });
      const since = Math.max(0, Number(body.since) || 0);
      return response(res, 200, { ok: true, me: quota(p), list: chatLog.filter(m => m.seq > since).map(m => ({
        seq: m.seq, sys: m.sys, nick: m.nick, text: m.text, ts: m.ts, mine: m.pid === pid
      })) });
    }
    return response(res, 404, { ok: false, msg: '接口不存在' });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(err => {
      if (!res.headersSent) response(res, err.status || 500, { ok: false, msg: err.status ? err.message : '服务暂时不可用' });
      else res.destroy();
      if (!err.status) console.error('宗门 API 请求失败：', err);
    });
  });
  return server;
}

if (require.main === module) {
  const host = process.env.SECT_HOST || '127.0.0.1';
  const port = Math.max(1, Math.min(65535, Number(process.env.SECT_PORT) || 8787));
  const origins = (process.env.SECT_ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  const server = createSectServer({ allowedOrigins: origins });
  server.listen(port, host, () => console.log(`宗门互助服务已启动：http://${host}:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}

module.exports = { createSectServer, recomputePower, POWER_VER, POWER_FRESH_MS };
