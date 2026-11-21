/* server/multi-p1a-client.test.mjs — P1-A 客户端协议层联调（第 120 轮）
 *
 * 目的：A8 只是"静态守卫"（字符串在不在）。本文件把 `js/net.js` **原样**加载进
 * node:vm，接**真实** server.mjs，走真实 join / SSE / /api/path，验证客户端这一层
 * 真的把道途送出去了、也真的把服务器下发的目录收下来了。
 *
 * 覆盖：
 *   C1 connect 第 6 参 path 生效：服务器登记的道途 == 客户端报的
 *   C2 hello.paths 落到 data().paths；me().path 同步
 *   C3 Net.api('/api/path') 改道途：返回新值且 me().path 跟随
 *
 * 运行：node --test server/multi-p1a-client.test.mjs
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
const PORT = 9008;
const BASE = 'http://127.0.0.1:' + PORT;

let child = null;
const streams = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function openSse(u) {
  const ac = new AbortController();
  const h = { close: () => { try { ac.abort(); } catch { /* noop */ } } };
  let q = [];
  let waiter = null;
  let closed = false;
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
            const frame = buf.slice(0, i);
            buf = buf.slice(i + 2);
            let ev = 'message'; let data = '';
            for (const line of frame.split('\n')) {
              if (line.startsWith('event:')) ev = line.slice(6).trim();
              else if (line.startsWith('data:')) data += line.slice(5).trim();
            }
            let parsed = null;
            try { parsed = JSON.parse(data); } catch { parsed = null; }
            const item = { event: ev, data: parsed };
            if (waiter) { const w = waiter; waiter = null; w(item); } else q.push(item);
          }
        }
      } catch { /* aborted */ }
      closed = true;
      if (waiter) { const w = waiter; waiter = null; w(null); }
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

/* 把 js/net.js 装进 VM，只注入 fetch / Stream（项目自带的 deps 注入点） */
function loadNet() {
  const src = readFileSync(path.join(ROOT, 'js', 'net.js'), 'utf8');
  const sandbox = {
    window: null,
    fetch: (u, o) => fetch(u, o),
    URL,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    encodeURIComponent,
    console
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'js/net.js' });
  assert.ok(sandbox.Net, 'net.js 应挂出 window.Net');
  sandbox.Net.deps = {
    fetch: (u, o) => fetch(u, o),
    Stream: (u, handlers) => {
      const sse = openSse(u);
      (async () => {
        for (;;) {
          const ev = await sse.next();
          if (!ev) break;
          try { handlers.onEvent(ev.event, ev.data); } catch { /* 订阅者异常不拖垮流 */ }
        }
      })();
      return { close: () => sse.close() };
    }
  };
  return sandbox.Net;
}

before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    /* #75：本套只测客户端协议接线（Net.connect 无快照），故显式开启 legacy 闸门 */
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

test('C1/C2 connect 第 6 参把道途送到服务器；hello.paths 落到 data().paths', async () => {
  const Net = loadNet();
  const r = await Net.connect(BASE, '客端甲' + (process.pid % 900), 2000, null, null, 'dan');
  assert.equal(r.ok, true, 'connect 应成功：' + JSON.stringify(r));
  assert.equal(r.me.path, 'dan', '服务器登记的道途应 == 客户端报的 dan');
  assert.equal(Net.me().path, 'dan', 'me() 应带 path');

  const d = Net.data();
  assert.equal(Array.isArray(d.paths), true, 'data().paths 必须是数组');
  assert.equal(d.paths.length, 4, 'hello 下发的道途目录应有 4 条');
  assert.deepEqual(d.paths.map(p => p.id).sort(), ['array', 'body', 'dan', 'sword']);
  Net.disconnect();
});

test('C3 Net.api("/api/path") 改道途并同步 me().path', async () => {
  const Net = loadNet();
  const r = await Net.connect(BASE, '客端乙' + (process.pid % 900), 2000, null, null, 'sword');
  assert.equal(r.ok, true);
  assert.equal(Net.me().path, 'sword');

  const ok = await Net.api('/api/path', { path: 'body' });
  assert.equal(ok.ok, true, '改道途应成功：' + JSON.stringify(ok));
  assert.equal(ok.path, 'body');
  assert.equal(ok.pathName, '体修');
  assert.equal(Net.me().path, 'body', 'me().path 必须跟随服务器登记值（否则界面选中标记停在旧道途）');

  const bad = await Net.api('/api/path', { path: 'godmode' });
  assert.equal(bad.ok, false, '非法道途必须被拒');
  assert.equal(bad.code, 'BAD_PATH');
  Net.disconnect();
});
