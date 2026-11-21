/* server/multi-p0c.test.mjs — P0-C 独立验收测试（第 117 轮）
 *
 * 纪律：不 mock 服务器、不伪造事件——真子进程 + 真 HTTP/SSE。
 * 覆盖（P0-C：刷新/断线重连回原队）：
 *   T1 续接成功：玩家断流（关 SSE，不离开房间）后，用同一 token 重新 join → resumed:true 且带回 roomId；
 *      重连 SSE 后服务器主动推送 room 事件（apiStream 推房间状态）。
 *   T2 续接后玩家在线、仍在该房间（第二个客户端可见其 online）。
 *   T3 失效 token 回落：携带未知 token + 名字 → 不续接、正常新建（resumed:false）。
 *   T4 已离场回落：玩家主动离开房间（roomId 清空）后，用同一 token 重连 → 不续接（resumed:false）。
 *
 * 运行：node --test server/multi-p0c.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = 9002;
const BASE = 'http://127.0.0.1:' + PORT;
const KICK_MS = 8000;   /* 长窗口：保证续接发生在踢人之前 */
const SETTLE_MS = 100;

let child = null;
const streams = [];
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function post(p, body) {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  return r.json();
}
function openSse(u) {
  const ac = new AbortController();
  const p = fetch(u, { signal: ac.signal }).then(async (res) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const queue = [];
    let waiter = null;
    let closed = false;
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, i);
            buf = buf.slice(i + 2);
            let ev = 'message'; let data = '';
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) ev = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            let parsed = null; try { parsed = JSON.parse(data); } catch { parsed = null; }
            const item = { event: ev, data: parsed };
            if (waiter) { const w = waiter; waiter = null; w(item); } else queue.push(item);
          }
        }
      } catch { /* aborted */ }
      closed = true;
      if (waiter) { const w = waiter; waiter = null; w(null); }
    })();
    return {
      next: () => new Promise((resolve) => {
        if (queue.length) return resolve(queue.shift());
        if (closed) return resolve(null);
        waiter = resolve;
      }),
      drain: () => queue.splice(0),
      close: () => { try { ac.abort(); } catch { /* noop */ } }
    };
  });
  p.then(s => streams.push(s));
  return p;
}
function waitFor(sse, evName, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting ' + evName)), timeoutMs);
    (async () => {
      for (;;) {
        const ev = await sse.next();
        if (!ev) { clearTimeout(t); reject(new Error('stream closed while waiting ' + evName)); return; }
        if (ev.event === evName) { clearTimeout(t); resolve(ev.data); return; }
      }
    })();
  });
}
async function join(name, power) {
  const j = await post('/api/join', { name, power });
  assert.equal(j.ok, true, 'join 应成功：' + JSON.stringify(j));
  return j.player;
}

before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    /* #75：本套关注断线续接，登录用 legacy body.power（无快照），故显式开启闸门 */
    env: { ...process.env, SERVER_PORT: String(PORT), SERVER_OFFLINE_KICK_MS: String(KICK_MS), SERVER_SETTLE_HOLD_MS: String(SETTLE_MS), SERVER_LEGACY_POWER: '1' },
    stdio: 'ignore'
  });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE + '/api/health'); if ((await r.json()).ok) return; } catch { /* 未起 */ }
    await sleep(150);
  }
  throw new Error('server did not start');
});
after(() => { streams.forEach(s => { try { s.close(); } catch { /* noop */ } }); if (child) child.kill(); });

test('T1 断流后用同一 token 续接回原队（resumed:true + 推房间状态）', async () => {
  const A = await join('甲' + Math.floor(Math.random() * 900 + 100), 1200);
  const sseA = await openSse(BASE + '/api/stream?token=' + encodeURIComponent(A.token));
  streams.push(sseA);
  await waitFor(sseA, 'hello');
  const cr = await post('/api/room/create', { token: A.token });
  assert.equal(cr.ok, true);
  const roomId = cr.room.id;
  /* 模拟刷新：关掉 SSE（不离开房间） */
  sseA.close();
  await sleep(200);   /* 等服务器 cleanup 把 online 置 false */
  /* 用同一 token 重新 join → 应续接 */
  const rj = await post('/api/join', { name: A.name, power: A.power, token: A.token });
  assert.equal(rj.ok, true, '续接应成功：' + JSON.stringify(rj));
  assert.equal(rj.resumed, true, '应标记 resumed');
  assert.equal(rj.roomId, roomId, '应带回原 roomId');
  /* 重连 SSE → 服务器应主动推送 room 事件（无需再调 room/join） */
  const sseA2 = await openSse(BASE + '/api/stream?token=' + encodeURIComponent(A.token));
  streams.push(sseA2);
  const roomEv = await waitFor(sseA2, 'room', 4000);
  assert.ok(roomEv && roomEv.room, '续接后服务器应推送 room 事件');
  assert.equal(roomEv.room.id, roomId, '推送的 room 应为原房间');
  assert.equal(roomEv.room.phase, 'lobby', '房间应仍在 lobby 相位');
});

test('T2 续接后玩家在线、仍在房间（第二客户端可见）', async () => {
  const A = await join('乙' + Math.floor(Math.random() * 900 + 100), 1500);
  const sseA = await openSse(BASE + '/api/stream?token=' + encodeURIComponent(A.token));
  streams.push(sseA);
  await waitFor(sseA, 'hello');
  await post('/api/room/create', { token: A.token });
  sseA.close();
  await sleep(200);
  /* 第二玩家 B 进大厅，确认能看到 A 在线且在房间里 */
  const B = await join('丙' + Math.floor(Math.random() * 900 + 100), 1500);
  const sseB = await openSse(BASE + '/api/stream?token=' + encodeURIComponent(B.token));
  streams.push(sseB);
  await waitFor(sseB, 'hello');
  /* 此时 A 已断流 200ms 但仍在踢人窗口内 → A 应 offline（尚未被踢）。
     续接 A 后，A 才 online；服务器会向 B 广播更新后的 lobby。 */
  const rj = await post('/api/join', { name: A.name, power: A.power, token: A.token });
  assert.equal(rj.resumed, true);
  /* 等服务器把"续接后 A 在线"的 lobby 广播给 B */
  let Aonline = false;
  for (let i = 0; i < 20; i++) {
    const lob = await waitFor(sseB, 'lobby', 4000).catch(() => null);
    if (!lob) break;
    if ((lob.players || []).some(p => p.name === A.name && p.online)) { Aonline = true; break; }
  }
  assert.equal(Aonline, true, '续接后 A 应在大厅可见为 online');
});

test('T3 失效 token 回落到正常新建（resumed:false）', async () => {
  const rj = await post('/api/join', { name: '丁', power: 900, token: 'nonexistent-token-xyz' });
  assert.equal(rj.ok, true, '带未知 token + 名字 应正常新建：' + JSON.stringify(rj));
  assert.notEqual(rj.resumed, true, '未知 token 不应续接');
  assert.ok(rj.player && rj.player.token && rj.player.token !== 'nonexistent-token-xyz', '应分配新 token');
});

test('T4 已离开房间后用同一 token 重连不续接（resumed:false）', async () => {
  const A = await join('戊' + Math.floor(Math.random() * 900 + 100), 1300);
  const sseA = await openSse(BASE + '/api/stream?token=' + encodeURIComponent(A.token));
  streams.push(sseA);
  await waitFor(sseA, 'hello');
  await post('/api/room/create', { token: A.token });
  await post('/api/room/leave', { token: A.token });
  sseA.close();
  await sleep(150);
  /* A 已离场（roomId 清空）→ 同一 token 重连不应续接 */
  const rj = await post('/api/join', { name: A.name, power: A.power, token: A.token });
  assert.equal(rj.ok, true);
  assert.notEqual(rj.resumed, true, '已离场不应续接');
  assert.ok(rj.player && rj.player.token, '应正常新建身份');
});
