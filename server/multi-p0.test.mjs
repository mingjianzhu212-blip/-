/* server/multi-p0.test.mjs — P0-A 独立验收测试（第 116 轮）
 *
 * 纪律：不 mock 服务器、不伪造事件——真子进程 + 真 HTTP/SSE。
 * 覆盖：
 *   T1 战力硬上界：荒谬战力（1e12）被 BAD_POWER 拒绝，正常战力放行。
 *   T2 完整一局：2 真人 join/create/join/ready/start/5 层出手 → run_settle 带唯一 runId + 奖励。
 *   T3 结算不可重复：settle 后再 strike 返回 ok:false；同一 sse 不再收到第二条 run_settle。
 *   T4 断线踢人（lobby）：一名玩家断流后，超时被移出房间（房间人数下降）。
 *   T5 断线僵尸修复（run）：副本中断流不立即踢；副本结束后才移除（验证定时器重排程）。
 *   T6 客户端转义静态守卫：conn(联机)面板不给未转义的他人名/聊天留口子。
 *
 * 运行：node --test server/multi-p0.test.mjs
 * 依赖：Node 18+（fetch + ReadableStream）。零第三方依赖。
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = 9000;
const BASE = 'http://127.0.0.1:' + PORT;
const KICK_MS = 150;
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

/* 极简 SSE 客户端：把 `event:` / `data:` 帧解析成 {event, data}，顺序入队 */
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
            let ev = 'message';
            let data = '';
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) ev = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            let parsed = null;
            try { parsed = JSON.parse(data); } catch { parsed = null; }
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

/* 依次消费 sse，直到收到指定事件 */
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

async function joinAndStream(name, power) {
  const j = await post('/api/join', { name, power });
  assert.equal(j.ok, true, 'join 应成功：' + JSON.stringify(j));
  const sse = await openSse(BASE + '/api/stream?token=' + encodeURIComponent(j.player.token));
  streams.push(sse);
  return { token: j.player.token, id: j.player.id, sse };
}

/* 两人建房 → 都准备 → 开战；返回 {roomId, A, B} */
async function setupRoom(power) {
  const A = await joinAndStream('甲' + Math.floor(Math.random() * 900 + 100), power);
  const B = await joinAndStream('乙' + Math.floor(Math.random() * 900 + 100), power);
  await waitFor(A.sse, 'hello');
  await waitFor(B.sse, 'hello');
  const cr = await post('/api/room/create', { token: A.token });
  assert.equal(cr.ok, true, 'create 应成功');
  const roomId = cr.room.id;
  const jr = await post('/api/room/join', { token: B.token, roomId });
  assert.equal(jr.ok, true, 'join 应成功：' + JSON.stringify(jr));
  return { A, B, roomId };
}

before(async () => {
  child = spawn(process.execPath, [path.join(HERE, 'server.mjs')], {
    env: {
      ...process.env,
      SERVER_PORT: String(PORT),
      SERVER_ROOT: ROOT,
      SERVER_OFFLINE_KICK_MS: String(KICK_MS),
      SERVER_SETTLE_HOLD_MS: String(SETTLE_MS),
      /* #75（第 122 轮）：本套测的是 legacy 路径（无快照的 body.power 校验/拒绝），
         legacy 闸门已默认关闭，故必须显式开启才能测这条路径。默认关闭的行为由 multi-p0d 覆盖。 */
      SERVER_LEGACY_POWER: '1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    let out = '';
    const t = setTimeout(() => reject(new Error('服务器启动超时：' + out)), 6000);
    child.stdout.on('data', d => {
      out += d.toString();
      if (out.includes('listening on')) { clearTimeout(t); resolve(); }
    });
    child.stderr.on('data', d => { out += d.toString(); });
    child.on('exit', c => { clearTimeout(t); reject(new Error('服务器提前退出 ' + c + '：' + out)); });
  });
});

after(() => {
  for (const s of streams) { try { s.close(); } catch { /* noop */ } }
  if (child) { try { child.kill(); } catch { /* noop */ } }
});

test('T1 战力硬上界：荒谬战力被拒，正常战力放行', async () => {
  const bad = await post('/api/join', { name: '伪战力', power: 1e12 });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, 'BAD_POWER');

  const zero = await post('/api/join', { name: '零战力', power: 0 });
  assert.equal(zero.code, 'BAD_POWER');

  const ok = await post('/api/join', { name: '老实人', power: 7000 });
  assert.equal(ok.ok, true);
  assert.equal(ok.player.power, 7000);
});

test('T2 完整一局：run_settle 带唯一 runId 与按贡献奖励', async () => {
  const { A, B } = await setupRoom(7000);
  assert.equal((await post('/api/room/ready', { token: A.token, ready: true })).ok, true);
  assert.equal((await post('/api/room/ready', { token: B.token, ready: true })).ok, true);
  assert.equal((await post('/api/room/start', { token: A.token })).ok, true);

  // 五层：每层两人各出手一次（服务器全 struck 才结算本层）
  for (let layer = 1; layer <= 5; layer++) {
    const ra = await post('/api/run/strike', { token: A.token });
    assert.equal(ra.ok, true, '第' + layer + '层 A 出手应成功');
    const rb = await post('/api/run/strike', { token: B.token });
    assert.equal(rb.ok, true, '第' + layer + '层 B 出手应成功');
  }

  const settle = await waitFor(A.sse, 'run_settle', 5000);
  assert.ok(settle && settle.result, 'run_settle 应带 result');
  const r = settle.result;
  assert.equal(typeof r.runId, 'string');
  assert.ok(r.runId.length >= 8, 'runId 应为非空唯一串，实得 ' + r.runId);
  /* 第 125 轮复核意见 H2：客户端的幂等依赖 runId 格式稳定（它按 8-4-4-4-12 小写十六进制规范化）。
     这条把"服务器契约"变成可执行断言——服务器若改 ID 格式，客户端会悄悄退化成不去重，这里先红。 */
  assert.match(r.runId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    'runId 必须是 crypto.randomUUID() 的小写 UUID 形式，客户端按此格式去重，实得 ' + r.runId);
  assert.equal(r.cleared, true, '7000×2 队伍应通五层');
  assert.equal(r.rewards.length, 2);
  for (const rw of r.rewards) assert.ok(rw.stone > 0, '每人应有灵石奖励');
});

test('T3 结算不可重复：settle 后再出手被拒，且不出现第二条 run_settle', async () => {
  const { A, B } = await setupRoom(7000);
  await post('/api/room/ready', { token: A.token, ready: true });
  await post('/api/room/ready', { token: B.token, ready: true });
  await post('/api/room/start', { token: A.token });
  for (let layer = 1; layer <= 5; layer++) {
    await post('/api/run/strike', { token: A.token });
    await post('/api/run/strike', { token: B.token });
  }
  const first = await waitFor(A.sse, 'run_settle', 5000);
  const firstId = first.result.runId;

  // 结算后再出手：服务器已离开 run 相位，必须拒绝
  const again = await post('/api/run/strike', { token: A.token });
  assert.equal(again.ok, false);

  // 观察一段时间：不应再收到任何 run_settle（服务端 settle 只发一次）
  await sleep(400);
  const leftovers = A.sse.drain().filter(e => e.event === 'run_settle');
  assert.equal(leftovers.length, 0, 'settle 后不应再出现 run_settle');
});

test('T4 断线踢人（lobby）：断流者超时被移出房间', async () => {
  const { A, B, roomId } = await setupRoom(5000);
  // B 断流
  B.sse.close();
  // 轮询房间人数：超时后应从 2 降到 1
  let count = 2;
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) {
    const snap = await post('/api/lobby', { token: A.token });
    const room = (snap.rooms || []).find(r => r.id === roomId);
    if (room) count = room.count;
    if (count <= 1) break;
    await sleep(80);
  }
  assert.ok(count <= 1, '断流者应被移出房间（当前人数 ' + count + '）');
});

test('T5 断线僵尸修复（run）：副本中断流不立即踢，副本结束后才移除', async () => {
  const { A, B, roomId } = await setupRoom(7000);
  await post('/api/room/ready', { token: A.token, ready: true });
  await post('/api/room/ready', { token: B.token, ready: true });
  await post('/api/room/start', { token: A.token });

  // 副本进行中 B 断流，等超过踢人阈值
  B.sse.close();
  await sleep(KICK_MS * 2);
  let snap = await post('/api/lobby', { token: A.token });
  let room = (snap.rooms || []).find(r => r.id === roomId);
  assert.ok(room, '副本中不应该房间直接消失');
  assert.equal(room.count, 2, '副本进行中，离线者不应被立即踢（放置风自动补出手）');

  // A 独自推进五层（B 离线视为已出手）
  for (let layer = 1; layer <= 5; layer++) {
    await post('/api/run/strike', { token: A.token });
  }
  await waitFor(A.sse, 'run_settle', 5000);

  // 副本结束（settled→lobby）后，离线者应在重排程的踢人下被移除
  let after = 2;
  const t0 = Date.now();
  while (Date.now() - t0 < 2500) {
    const s2 = await post('/api/lobby', { token: A.token });
    const r2 = (s2.rooms || []).find(r => r.id === roomId);
    after = r2 ? r2.count : 0;
    if (after <= 1) break;
    await sleep(80);
  }
  assert.ok(after <= 1, '副本结束后离线者应被移除（僵尸修复），当前人数 ' + after);
});

test('T6 客户端转义静态守卫：联机面板不裸拼他人名/聊天', async () => {
  const game = fs.readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8');
  assert.ok(game.includes('function escHtml'), 'game.js 应有 escHtml 转义函数');
  // 四处不可信插值必须已转义
  assert.ok(game.includes('escHtml(m.name)'), '队员名应转义');
  assert.ok(game.includes('escHtml(c.name)'), '聊天发送者名应转义');
  assert.ok(game.includes('escHtml(c.text)'), '聊天正文应转义');
  const roomNameEsc = (game.match(/escHtml\(r\.name\)/g) || []).length;
  assert.ok(roomNameEsc >= 2, '房间名与结算名都应转义（实得 ' + roomNameEsc + ' 处）');
  // 反向守卫：innerHTML 里不得再出现裸拼
  assert.ok(!/innerHTML\s*=.*\+\s*m\.name\s*\+/.test(game), 'innerHTML 不应裸拼 m.name');
  assert.ok(!/innerHTML\s*=.*\+\s*c\.text\s*\+/.test(game), 'innerHTML 不应裸拼 c.text');
});
