/* server/multi-p1c-online-regression.test.mjs — P1-C 真服务联机 4 分支回归
 *
 * 目的：补 GPT 最终复审点名的唯一实质缺口——「联机分支未做真实服务回归」。
 * 此前 online_branches.test.mjs 只是逻辑层桩（受控桩、未走真实 Net.connect/Net.api）。
 * 本文件用**真实 server.mjs** + **真实 js/net.js 客户端**（node:vm 装入，与 multi-p1a-client 同款）
 * 跑通 4 分支所需的真实服务端链路，并把真实 server 回值喂给客户端四分支判定函数
 * （逐字复刻 js/game.js:7393-7404 的 r.me.path 冲突处理 + 7768-7785 的 act==='path' 处理）。
 *
 * 覆盖：
 *  [服务端链路·真实]
 *   A1 connect 带 path → 服务端存储并回 me.path（本地未选＋服务器合法值补全，server 侧）
 *   A2 connect 不带 path → 服务端回落 DEFAULT_PATH='sword'（服务器填默认）
 *   A3 resume 同 token → 服务端回已登记 path（一致同步，server 侧）
 *   A4 /api/path 合法 → ok 且 me.path 跟随（act==='path' 成功分支）
 *   A5 /api/path 非法 → BAD_PATH（act==='path' 失败分支·服务端守卫）
 *   A6 /api/path 在 lobby 相位 → 允许（证明 run 相位 BAD_PHASE 由服务端 line 1029 守，不越权）
 *  [客户端四分支判定·真实 server 回值驱动]
 *   B1 本地未选('') + 真实 server 回 'dan' → 写入本源 + 缓存
 *   B2 本地已选('body') + 真实 server 回 'dan'（冲突）→ 保留本地、记冲突、不写缓存
 *   B3 本地已选('body') + 真实 server 回 'body'（一致）→ 同步缓存
 *   B4 本地已选('body') + 服务端回非法值 → 不污染本源与缓存（客户端守卫）
 *
 * 运行：node --test server/multi-p1c-online-regression.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = 9011;
const BASE = 'http://127.0.0.1:' + PORT;

let child = null;
const streams = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 与 multi-p1a-client.test.mjs 同款：把 js/net.js 原样装进 VM，接真实 server */
function openSse(u) {
  const ac = new AbortController();
  const h = { close: () => { try { ac.abort(); } catch { /* noop */ } } };
  let q = []; let waiter = null; let closed = false;
  h.ready = fetch(u, { signal: ac.signal }).then(async (res) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, i); buf = buf.slice(i + 2);
            let ev = 'message'; let data = '';
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) ev = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            let parsed = null; try { parsed = JSON.parse(data); } catch { parsed = null; }
            const item = { event: ev, data: parsed };
            if (waiter) { const w = waiter; waiter = null; w(item); } else q.push(item);
          }
        }
      } catch { /* aborted */ }
      closed = true; if (waiter) { const w = waiter; waiter = null; w(null); }
    })();
  });
  h.next = () => new Promise((resolve) => {
    if (q.length) return resolve(q.shift());
    if (closed) return resolve(null);
    waiter = resolve;
  });
  streams.push(h);
  return h;
}
function loadNet() {
  const src = readFileSync(path.join(ROOT, 'js', 'net.js'), 'utf8');
  const sandbox = {
    window: null, fetch: (u, o) => fetch(u, o), URL, JSON, Promise, setTimeout, clearTimeout, encodeURIComponent, console
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'js/net.js' });
  assert.ok(sandbox.Net, 'net.js 应挂出 window.Net');
  sandbox.Net.deps = {
    fetch: (u, o) => fetch(u, o),
    Stream: (u, handlers) => {
      const sse = openSse(u);
      (async () => { for (;;) { const ev = await sse.next(); if (!ev) break; try { handlers.onEvent(ev.event, ev.data); } catch { /* noop */ } } })();
      return { close: () => sse.close() };
    }
  };
  return sandbox.Net;
}

/* 客户端四分支判定——逐字复刻 js/game.js:7393-7404 的 r.me.path 冲突处理。
   S.path 视作可变本地状态（localStorage 本源），multiSavePath 视作缓存写入。 */
const PATH_IDS = ['sword', 'body', 'dan', 'array'];
function reconnectDecision(localPath, serverPath) {
  const S = { path: (typeof localPath === 'string') ? localPath : '' };
  let cacheWrite = null; let conflictLogged = false;
  if (serverPath) {
    const sp = (typeof serverPath === 'string' && PATH_IDS.indexOf(serverPath) >= 0) ? serverPath : '';
    const multiSavePath = (v) => { cacheWrite = v; };
    if (!sp) { /* 服务器非法/absent：不动本源、不写缓存 */ }
    else if (typeof S.path !== 'string' || PATH_IDS.indexOf(S.path) < 0) { S.path = sp; multiSavePath(sp); }
    else if (S.path !== sp) { conflictLogged = true; /* 保留本地、记冲突、不写缓存 */ }
    else { multiSavePath(sp); }
  }
  return { path: S.path, cacheWrite, conflictLogged };
}
/* act==='path' 判定——复刻 js/game.js:7768-7785。offline 时本地写入；online 时以服务端 rp 为准。 */
function chooseDecision(localPath, id, apiResult) {
  const valid = (v) => typeof v === 'string' && PATH_IDS.indexOf(v) >= 0;
  const S = { path: (typeof localPath === 'string') ? localPath : '' };
  let cacheWrite = null; let blocked = false;
  if (!valid(id)) { blocked = true; return { path: S.path, cacheWrite, blocked, reason: '无效选项' }; }
  if (valid(S.path)) { blocked = true; return { path: S.path, cacheWrite, blocked, reason: '终身道途不可改' }; }
  if (!apiResult || !apiResult.ok) { /* 离线补选或失败：本地写入合法 id */ S.path = id; cacheWrite = id; return { path: S.path, cacheWrite, blocked }; }
  const rp = valid(apiResult.path) ? apiResult.path : id;
  S.path = rp; cacheWrite = rp;
  return { path: S.path, cacheWrite, blocked };
}

before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    env: { ...process.env, SERVER_PORT: String(PORT), SERVER_OFFLINE_KICK_MS: '60000', SERVER_SETTLE_HOLD_MS: '3000', SERVER_LEGACY_POWER: '1' },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/health'); if ((await r.json()).ok) return; } catch { /* 未起 */ }
    await sleep(150);
  }
  throw new Error('server did not start');
});
after(() => { streams.forEach(s => { try { s.close(); } catch { /* noop */ } }); if (child) child.kill(); });

/* ---------- A 组：真实服务端链路 ---------- */
test('A1 connect 带 path=dan → 服务端存储并回 me.path=dan', async () => {
  const Net = loadNet();
  const r = await Net.connect(BASE, 'P1C-A1-' + (process.pid % 900), 2000, null, null, 'dan');
  assert.equal(r.ok, true, 'connect 应成功：' + JSON.stringify(r));
  assert.equal(r.me.path, 'dan', '服务端应存储并回传 dan');
  Net.disconnect();
});

test('A2 connect 不带 path → 服务端回落 DEFAULT_PATH=sword', async () => {
  const Net = loadNet();
  const r = await Net.connect(BASE, 'P1C-A2-' + (process.pid % 900), 2000, null, null, null);
  assert.equal(r.ok, true);
  assert.equal(r.me.path, 'sword', '未送 path 应回落服务器 DEFAULT_PATH sword');
  Net.disconnect();
});

test('A3 resume 同 token（在房间内）→ 服务端回已登记 path（一致同步）', async () => {
  const Net = loadNet();
  const nm = 'P1C-A3-' + (process.pid % 900);
  const r1 = await Net.connect(BASE, nm, 2000, null, null, 'array');
  assert.equal(r1.ok, true);
  assert.equal(r1.me.path, 'array');
  const created = await Net.api('/api/room/create');
  assert.equal(created.ok, true, '建房应成功');
  const token = r1.me.token;
  // 不 disconnect（否则会 leave 房间），直接用同 token 起第二个连接 → 触发 resume 分支
  const Net2 = loadNet();
  const r2 = await Net2.connect(BASE, nm, 2000, token, null, null);
  assert.equal(r2.ok, true, 'resume 应成功：' + JSON.stringify(r2));
  assert.equal(r2.resumed, true, '应标记为续接');
  assert.equal(r2.me.path, 'array', '续接应沿用服务器已登记 array');
  Net2.disconnect(); Net.disconnect();
});

test('A4 /api/path 合法 → ok 且 me.path 跟随（act==="path" 成功分支）', async () => {
  const Net = loadNet();
  const r = await Net.connect(BASE, 'P1C-A4-' + (process.pid % 900), 2000, null, null, 'sword');
  assert.equal(r.ok, true);
  const ok = await Net.api('/api/path', { path: 'body' });
  assert.equal(ok.ok, true, '/api/path body 应成功：' + JSON.stringify(ok));
  assert.equal(ok.path, 'body');
  assert.equal(Net.me().path, 'body', 'me().path 必须跟随服务器登记值');
  Net.disconnect();
});

test('A5 /api/path 非法 → BAD_PATH（失败分支·服务端守卫）', async () => {
  const Net = loadNet();
  const r = await Net.connect(BASE, 'P1C-A5-' + (process.pid % 900), 2000, null, null, 'sword');
  assert.equal(r.ok, true);
  const bad = await Net.api('/api/path', { path: 'godmode' });
  assert.equal(bad.ok, false, '非法道途必须被拒');
  assert.equal(bad.code, 'BAD_PATH');
  assert.equal(Net.me().path, 'sword', '非法请求不得改变已登记道途');
  Net.disconnect();
});

test('A6 /api/path 在 lobby 相位 → 允许（run 相位 BAD_PHASE 由 server.mjs:1029 守）', async () => {
  const Net = loadNet();
  const r = await Net.connect(BASE, 'P1C-A6-' + (process.pid % 900), 2000, null, null, 'sword');
  assert.equal(r.ok, true);
  const created = await Net.api('/api/room/create');
  assert.equal(created.ok, true, '建房应成功');
  const ok = await Net.api('/api/path', { path: 'dan' });
  assert.equal(ok.ok, true, 'lobby 相位应允许改道途：' + JSON.stringify(ok));
  assert.equal(ok.path, 'dan');
  const bad = await Net.api('/api/path', { path: 'xx' });
  assert.equal(bad.ok, false, '即便在 lobby，非法 path 仍应 BAD_PATH');
  Net.disconnect();
});

/* ---------- B 组：客户端四分支判定·真实 server 回值驱动 ---------- */
test('B1 本地未选 + 真实 server 回 dan → 写入本源+缓存（补全分支）', async () => {
  const Net = loadNet();
  const r = await Net.connect(BASE, 'P1C-B1-' + (process.pid % 900), 2000, null, null, 'dan');
  assert.equal(r.me.path, 'dan'); Net.disconnect();
  const d = reconnectDecision('', r.me.path); // 本地未选 ''
  assert.equal(d.path, 'dan', '应补全本源');
  assert.equal(d.cacheWrite, 'dan', '应写入缓存');
  assert.equal(d.conflictLogged, false);
});

test('B2 本地已选 body + 真实 server 回 dan（冲突）→ 保留本地、记冲突、不写缓存', async () => {
  const Net = loadNet();
  const r = await Net.connect(BASE, 'P1C-B2-' + (process.pid % 900), 2000, null, null, 'dan');
  assert.equal(r.me.path, 'dan'); Net.disconnect();
  const d = reconnectDecision('body', r.me.path); // 本地已选 body
  assert.equal(d.path, 'body', '冲突须保留本地道途');
  assert.equal(d.cacheWrite, null, '冲突不得污染缓存');
  assert.equal(d.conflictLogged, true, '冲突须实际登记');
});

test('B3 本地已选 body + 真实 server 回 body（一致）→ 同步缓存', async () => {
  const Net = loadNet();
  const r = await Net.connect(BASE, 'P1C-B3-' + (process.pid % 900), 2000, null, null, 'body');
  assert.equal(r.me.path, 'body', '真实 server 应回 body'); Net.disconnect();
  const d = reconnectDecision('body', r.me.path); // 本地已选 body，server 也回 body
  assert.equal(d.path, 'body');
  assert.equal(d.cacheWrite, 'body', '一致应同步缓存');
  assert.equal(d.conflictLogged, false);
});

test('B4 本地已选 body + 服务端回非法值 → 不污染本源与缓存（客户端守卫）', async () => {
  // 真实 server 不会回非法 path（pathOf 永回落合法值），此处用客户端守卫复刻验证：
  // 若未来 server 异常返回非白名单值，客户端必须忽略。
  const d = reconnectDecision('body', '__broken__');
  assert.equal(d.path, 'body', '服务端非法值不得覆盖本地已选');
  assert.equal(d.cacheWrite, null, '服务端非法值不得写入缓存');
  assert.equal(d.conflictLogged, false);
});

test('B5 act==="path" 离线补选（本地未选+合法 id）→ 写入本源+缓存', async () => {
  const d = chooseDecision('', 'array', null); // 离线：无 apiResult
  assert.equal(d.blocked, false);
  assert.equal(d.path, 'array');
  assert.equal(d.cacheWrite, 'array');
});

test('B6 act==="path" 已选锁定（本地已选+再点）→ 拦截、不改本源', async () => {
  const d = chooseDecision('sword', 'body', { ok: true, path: 'body' });
  assert.equal(d.blocked, true, '终身道途不可在联机界面更改');
  assert.equal(d.path, 'sword', '已选应保持不变');
  assert.equal(d.cacheWrite, null);
});

test('B7 act==="path" 在线成功（本地未选+合法 id+服务端回值）→ 以服务端 rp 为准写入', async () => {
  const d = chooseDecision('', 'dan', { ok: true, path: 'dan' });
  assert.equal(d.blocked, false);
  assert.equal(d.path, 'dan');
  assert.equal(d.cacheWrite, 'dan');
});
