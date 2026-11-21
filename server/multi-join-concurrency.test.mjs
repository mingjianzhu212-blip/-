/* server/multi-join-concurrency.test.mjs — #64-R2 并发 join / 道途登记专项（2026-11-10）
 *
 * 来源：ChatGPT 任务单 #64-R2 增量复审原件 §一「具体需要补正的三处」第 2 条、
 *       §二「意见 2」建议的专项测试步骤，以及本方案 §4.2.1 验收条件 C1/C2/C3。
 *
 * 纪律：不 mock 服务器、不伪造事件——**真子进程 + 真 HTTP**（与 multi-p2a.test.mjs 同款）。
 *       断言一律取**服务器原始登记值**（`/api/lobby` 的 playerSummary.path），
 *       不以客户端返回值或文档表格自证（#64 意见 6：避免 E2E 自我循环证明）。
 *
 * 覆盖：
 *   J1 重连换道途（#64-R2 建议步骤 1）：join 登记剑修 → resume 伪造丹修 → 仍剑修。
 *   J2 并发 join（C1/C2）：8 路并发 resume 携带不同伪造道途 → 登记值唯一且不被覆盖。
 *   J3 run 相位冻结（#64-R2 建议步骤 2）：开战后 /api/path → BAD_PHASE。
 *   J4 新局重选与旧局隔离（建议步骤 3 + C3 近似）：旧局 retreat 后大厅可重选，
 *      重选值受保护、resume 伪造无效，且无旧局 run 残留。
 *   J5 唯一胜出规则的**确定性**（#64-R3 补测 A）：反转并发请求释放顺序、多轮重复，
 *      每轮都从服务器最终登记值判定，证明不是碰巧由某次执行顺序决定。
 *   J6 C3 **严格生命周期竞态**（#64-R3 补测 B）：旧局进入结算的边界时刻，
 *      同时触发新局 join/resume 与道途变更，断言不变量在多轮下恒成立。
 *   J7 **写-写竞态**（Qoder #65 意见 6）：lobby 相位并发 /api/path（会真的写 p.path），
 *      客观记录「最后写入者胜出」，并验证「玩家不在房间」时的行为；不自证唯一规则。
 *   J8 **真正的新局**（Qoder #65 意见 6）：旧局结算 → 回 lobby → 重新 ready → 开第二局，
 *      断言第二局相位/登记值/拒绝改道途，以及旧局不产生第二个 run。
 *   J9 **首次登记并发**（#64-R5-REV 裁定 Q2(a)，裁定中称「J7」）：8 路首次 join 经同步屏障
 *      集中发出，客观记录请求/响应时刻、是否 resume、服务器最终登记值与档案共享事实；
 *      **不预设唯一胜出规则**，不把客户端并发说成服务端指令级重叠。
 *   J10 **结算与奖励隔离**（#64-R5-REV 裁定 Q2(b)，裁定中称「J8」）：用真实 SSE
 *      `run_settle` 事件的 `result.runId` 作事件级证据，配合 profile 固定初始状态 +
 *      分阶段快照 + 精确预期增量，断言结算只执行一次、奖励不重复、新局不污染旧局。
 *   J11 **重复结算幂等性**（#64-R6 裁定唯一阻断缺口的定向补正）：独立隔离房间，
 *      对同一旧局**再次提交实际结算入口** `/api/run/leave`（不是 strike），核对真实响应、
 *      两路 SSE 均无第二条 `run_settle`、profile 三项无重复增量；接受该端点在非 run 相位
 *      `removeFromRoom` 的副作用，因本用例独立、不影响 J10 的第二局场景。
 *
 * 已知边界（如实登记，不伪装成全覆盖）：
 *   - Node 单线程 HTTP 服务器对请求本就串行处理；`Promise.all` 只保证客户端并发发起，
 *     **不存在服务端指令级写-写重叠**。J7 用不同 body 大小与延迟注入制造到达差异，
 *     但**不声称**证明了指令级原子性。
 *   - J1–J8 未解析 SSE，其「旧局结算数值不变」仅以「第二局正常开打 + 房间相位确定 +
 *     登记值生效」间接佐证，**不冒充直接断言**（Qoder #65 意见 6 第 4 点）。
 *     **J10 已补齐直接证据**：接真 `GET /api/stream` 读服务器下发的 `run_settle` 事件，
 *     用其 `result.runId` / `layers` / `rewards` 作事件级证据，并与 profile 分阶段快照交叉核对；
 *     不伪造测试侧事件，不以 profile 汇总值冒充 runId 归属（#64-R5-REV 裁定 Q2(b)）。
 *   - 端口 `8070 + pid%40` 有碰撞可能、`SETTLE_HOLD_MS` 等待在重负载下有抖动风险；
 *     J4/J8 已改为**轮询等待相位**而非固定 sleep，端口风险登记为执行层局限。
 *   - 服务端重启后状态恢复不在本测试范围（#63 PASS 已知边界：档案为内存态）。
 *
 * 运行：node --test server/multi-join-concurrency.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PORT = 9012;
const BASE = 'http://127.0.0.1:' + PORT;

let child = null;
let seq = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* server.mjs NAME_MAX=12：名字必须 ≤12 字符，否则 join 返回 BAD_NAME。
   本文件单进程，不需要 pid 后缀；统一截断保证所有轮次/tag 都合法。 */
const uniq = p => { seq += 1; return (p + '_' + seq).slice(0, 12); };

function post(p, body) {
  return fetch(BASE + p, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  }).then(r => r.json());
}

before(async () => {
  child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.mjs')], {
    env: {
      ...process.env,
      SERVER_PORT: String(PORT),
      SERVER_PROFILE_MODE: 'enforce',
      SERVER_OFFLINE_KICK_MS: '60000',
      SERVER_SETTLE_HOLD_MS: '50'
    },
    stdio: 'ignore'
  });
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      const j = await r.json();
      if (j.ok) {
        assert.equal(j.profileMode, 'enforce');
        return;
      }
    } catch { /* 未起 */ }
    await sleep(150);
  }
  throw new Error('server did not start');
});

after(() => { if (child) { try { child.kill(); } catch { /* noop */ } } });

/* 建一个已登记道途、且已在房间里的玩家（resume 分支要求 existing.roomId 有效） */
async function mkPlayer(tag, pathId) {
  const j = await post('/api/join', { name: uniq(tag), path: pathId });
  assert.equal(j.ok, true, 'join 应成功：' + JSON.stringify(j));
  const r = await post('/api/room/create', { token: j.player.token });
  assert.equal(r.ok, true, 'room/create 应成功：' + JSON.stringify(r));
  return { token: j.player.token, id: j.player.id, name: j.player.name, path: j.player.path, roomId: r.room.id };
}

/* apiRoomStart 要求 2~4 人且全员 ready（server.mjs:1051-1053 MIN_PLAYERS）。
   补一个真实队友走真 HTTP，不绕过、不 mock。 */
async function fillRoom(host) {
  const j = await post('/api/join', { name: uniq('队友'), path: 'sword' });
  assert.equal(j.ok, true, '队友 join 应成功：' + JSON.stringify(j));
  const rj = await post('/api/room/join', { token: j.player.token, roomId: host.roomId });
  assert.equal(rj.ok, true, '队友入房应成功：' + JSON.stringify(rj));
  const rr = await post('/api/room/ready', { token: j.player.token, ready: true });
  assert.equal(rr.ok, true, '队友 ready 应成功：' + JSON.stringify(rr));
  return { token: j.player.token, id: j.player.id };
}

/* 服务器原始登记值：取自 /api/lobby 的 playerSummary.path（服务端视图，非客户端自称） */
async function serverPathOf(token, id) {
  const l = await post('/api/lobby', { token });
  assert.equal(l.ok, true, '/api/lobby 应成功：' + JSON.stringify(l));
  const hit = (l.players || []).find(p => p.id === id);
  assert.ok(hit, 'lobby 里应能找到该玩家（服务器登记视图）');
  return hit.path;
}

/* ---- #64-R5-REV 定向补测辅助：真 HTTP / 真 SSE，不 mock、不伪造事件 ---- */

/* 只读档案快照（GET /api/profile?token= → profiles.summary，含 stones/layersCleared/runs）。 */
async function profileOf(token) {
  const r = await fetch(BASE + '/api/profile?token=' + encodeURIComponent(token));
  const j = await r.json();
  assert.equal(j.ok, true, 'GET /api/profile 应成功：' + JSON.stringify(j));
  return j.profile;
}

/* 极简 SSE 客户端（与 multi-p0.test.mjs 同款真实现，仅去掉全局 streams 登记表）。
   把 event:/data: 帧解析成 {event,data} 顺序入队；用例内必须 try/finally close。 */
function openSse(u) {
  const ac = new AbortController();
  return fetch(u, { signal: ac.signal }).then(async (res) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const queue = [];
    let waiter = null;
    let closed = false;
    const LF = String.fromCharCode(10);
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf(LF + LF)) >= 0) {
            const frame = buf.slice(0, i);
            buf = buf.slice(i + 2);
            let ev = 'message';
            let data = '';
            for (const line of frame.split(LF)) {
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
      next: () => new Promise(resolve => {
        if (queue.length) return resolve(queue.shift());
        if (closed) return resolve(null);
        waiter = resolve;
      }),
      drain: () => queue.splice(0),
      close: () => { try { ac.abort(); } catch { /* noop */ } }
    };
  });
}

/* 依次消费 SSE，直到收到指定事件；超时直接失败，不吞异常。 */
function waitFor(sse, evName, timeoutMs = 6000) {
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

/* 只 join、不建房：用于验证「玩家不在房间时 /api/path 的行为」（Qoder #65 意见 2 边界）。 */
async function mkLone(tag, pathId) {
  const j = await post('/api/join', { name: uniq(tag), path: pathId });
  assert.equal(j.ok, true, 'lone join 应成功：' + JSON.stringify(j));
  return { token: j.player.token, id: j.player.id, path: j.player.path };
}

/* 轮询等待房间回到 lobby（替代固定 sleep，规避重负载下 SETTLE_HOLD_MS 抖动）。 */
async function waitPhase(token, roomId, want, maxTry = 20) {
  for (let i = 0; i < maxTry; i++) {
    const l = await post('/api/lobby', { token });
    const r = (l.rooms || []).find(x => x.id === roomId);
    if (r && r.phase === want) return r;
    await sleep(60);
  }
  const l = await post('/api/lobby', { token });
  const r = (l.rooms || []).find(x => x.id === roomId);
  throw new Error('等待房间相位 ' + want + ' 超时，实得 ' + (r ? r.phase : 'ROOM_MISSING'));
}

/* 重新 ready 并开下一局（settle 后全员 ready=false，必须重新声明）。 */
async function startNextRun(p, mate) {
  for (const t of [p.token, mate.token]) {
    const rr = await post('/api/room/ready', { token: t, ready: true });
    assert.equal(rr.ok, true, '重新 ready 应成功：' + JSON.stringify(rr));
  }
  const st = await post('/api/room/start', { token: p.token });
  assert.equal(st.ok, true, '开下一局应成功：' + JSON.stringify(st));
}

/* ------------------------------------------------------------------ */
test('J1 重连换道途：resume 携带伪造丹修，服务器仍使用首次登记的剑修', async () => {
  const p = await mkPlayer('J1', 'sword');
  assert.equal(p.path, 'sword', '首次登记应为剑修');

  const resume = await post('/api/join', {
    token: p.token,
    name: '改名也无效',
    power: 999999,          /* enforce 档对**所有** join 都忽略 body.power；不把此项当作 resume 专属证据（Qoder #65 意见 6 第 5 点） */
    path: 'dan'             /* 伪造换道途 */
  });
  assert.equal(resume.ok, true, 'resume 应成功：' + JSON.stringify(resume));
  assert.equal(resume.resumed, true, '必须命中 resume 分支（否则本例没测到重连）');
  assert.equal(resume.player.path, 'sword', 'resume 响应必须沿用服务器已登记道途');
  assert.equal(await serverPathOf(p.token, p.id), 'sword', '服务器原始登记值不得被 body.path 覆盖');
});

test('J2 并发 join（C1/C2）：8 路并发携带不同伪造道途，最终登记值唯一且不被覆盖', async () => {
  const p = await mkPlayer('J2', 'sword');
  const fakes = ['dan', 'array', 'body', 'dan', 'array', 'body', 'sword', 'dan'];
  const rs = await Promise.all(fakes.map(pathId => post('/api/join', {
    token: p.token, name: uniq('并发'), power: 12345, path: pathId
  })));

  for (const r of rs) {
    assert.equal(r.ok, true, '并发 join 应成功：' + JSON.stringify(r));
    assert.equal(r.resumed, true, '并发请求都应命中 resume 分支');
    assert.equal(r.player.path, 'sword', '任一并发请求都不得改写已确认道途（C1）');
  }
  const distinct = new Set(rs.map(r => r.player.path));
  assert.equal(distinct.size, 1, '最终登记值必须唯一、可预测，不随到达顺序漂移（C2）');
  assert.equal(await serverPathOf(p.token, p.id), 'sword', '竞态后服务器原始登记值仍是首次确认值');
});

test('J3 run 相位冻结：开战后 /api/path 返回 BAD_PHASE，登记值不变', async () => {
  const p = await mkPlayer('J3', 'sword');
  await fillRoom(p);
  const ready = await post('/api/room/ready', { token: p.token, ready: true });
  assert.equal(ready.ok, true, 'ready 应成功：' + JSON.stringify(ready));
  const st = await post('/api/room/start', { token: p.token });
  assert.equal(st.ok, true, 'start 应成功（断言真实开战，而非仅看注释）：' + JSON.stringify(st));

  const bad = await post('/api/path', { token: p.token, path: 'dan' });
  assert.equal(bad.ok, false, 'run 相位不得允许改道途：' + JSON.stringify(bad));
  assert.equal(bad.code, 'BAD_PHASE', '须以 BAD_PHASE 明确拒绝');
  assert.equal(await serverPathOf(p.token, p.id), 'sword', '服务器登记值在 run 相位保持不变');
});

test('J4 新局重选与旧局隔离（步骤 3 + C3 近似）：重选值受保护，无旧局 run 残留', async () => {
  const p = await mkPlayer('J4', 'sword');
  await fillRoom(p);
  const ready = await post('/api/room/ready', { token: p.token, ready: true });
  assert.equal(ready.ok, true, 'ready 应成功');
  const st = await post('/api/room/start', { token: p.token });
  assert.equal(st.ok, true, '旧局开战应成功：' + JSON.stringify(st));
  /* 撤退结算，结束旧局 run */
  const leave = await post('/api/run/leave', { token: p.token });
  assert.equal(leave.ok, true, 'retreat 应成功：' + JSON.stringify(leave));

  /* 新局边界：大厅允许重新选择道途 */
  const sel = await post('/api/path', { token: p.token, path: 'array' });
  assert.equal(sel.ok, true, '旧局结束后大厅应允许重选：' + JSON.stringify(sel));
  assert.equal(sel.path, 'array', '重选应在服务器明确边界上生效');
  assert.equal(await serverPathOf(p.token, p.id), 'array', '服务器登记值应更新为新局重选值');

  /* 重连 + 伪造换道途，不得把新登记值改回旧值（也不得把旧局状态带回） */
  const resume = await post('/api/join', { token: p.token, path: 'dan' });
  assert.equal(resume.resumed, true, '应命中 resume 分支');
  assert.equal(resume.player.path, 'array', 'resume 不得覆盖新局已确认的登记值');
  assert.equal(await serverPathOf(p.token, p.id), 'array', '服务器原始登记值仍为新局重选值');

  /* 轮询等待 settled → lobby（替代固定 sleep，规避重负载抖动）。
     注：本文件多个测试共用一个服务器进程，/api/lobby 的全局 rooms 里会有
     其他测试遗留的 run 房间；C3 判定只针对**本局自己的房间**，避免误判。 */
  const back = await waitPhase(p.token, p.roomId, 'lobby');
  assert.equal(back.phase, 'lobby', '旧局 run 状态不得残留到新局视图（C3 隔离）');
});

/* ---- #64-R3 补测 A：唯一胜出规则的确定性 ----
 * 服务器实际采用的原子登记规则：resume 分支（server.mjs:751-771）**根本不读 body.path**，
 * 一律沿用首次登记值 → 「首次成功登记者胜出」。失败/伪造请求不能覆盖成功登记值。
 * 用两种**相反的释放顺序** × 多轮，逐轮从服务器 /api/lobby 原始登记值判定，
 * 证明结果可预测、不是碰巧由某次执行顺序决定。 */
test('J5 唯一胜出规则确定性（补测 A）：反转释放顺序 × 3 轮，服务器登记值恒为首次确认值', async () => {
  const p = await mkPlayer('J5', 'sword');
  const fakes = ['dan', 'array', 'body', 'dan', 'array', 'body', 'sword', 'dan'];
  for (let round = 0; round < 3; round++) {
    for (const order of [fakes, [...fakes].reverse()]) {
      const rs = await Promise.all(order.map(pathId => post('/api/join', {
        token: p.token, name: 'J5_' + round, power: 10000 + round, path: pathId
      })));
      for (const r of rs) {
        assert.equal(r.ok, true, '第 ' + round + ' 轮并发 join 应成功：' + JSON.stringify(r));
        assert.equal(r.resumed, true, '第 ' + round + ' 轮应命中 resume');
        assert.equal(r.player.path, 'sword', '第 ' + round + ' 轮：失败/伪造请求不得覆盖首次成功登记值');
      }
      const finalPath = await serverPathOf(p.token, p.id);
      assert.equal(finalPath, 'sword', '第 ' + round + ' 轮：服务器最终登记值必须符合唯一胜出规则（首次登记者胜出）');
    }
  }
});

/* ---- #64-R3 补测 B：C3 严格生命周期竞态 ----
 * 在旧局**进入结算的边界时刻**，用 Promise.all 同时触发：
 *   /api/run/leave（触发 settle） + /api/join（resume 伪造丹修） + /api/path（试图改阵修）。
 * 不预设「应该拒绝」；只断言多轮下恒成立的**不变量**：
 *   I1 无异常 500、所有请求都有明确 ok/code；
 *   I2 服务器登记值**绝不等于伪造的 dan**（resume 不得把旧局/伪造请求带进新局）；
 *   I3 旧局 run 不残留、房间最终相位确定（settled → lobby）；
 *   I4 结算只作用于旧局：新局视图里不存在第二个活跃 run。
 * 观察项（如实登记）：若 /api/path 在 settled 相位成功，说明结算保持期允许为下一局重选，
 *   这是产品行为而非本测试判定的缺陷；登记值因此可能为 sword 或 array，但不得为 dan。 */
test('J6 C3 严格生命周期竞态（补测 B）：结算边界同时触发新局 join/resume，不变量多轮恒成立', async () => {
  for (let round = 0; round < 3; round++) {
    const p = await mkPlayer('J6_' + round, 'sword');
    await fillRoom(p);
    const ready = await post('/api/room/ready', { token: p.token, ready: true });
    assert.equal(ready.ok, true, '第 ' + round + ' 轮 ready 应成功');
    const st = await post('/api/room/start', { token: p.token });
    assert.equal(st.ok, true, '第 ' + round + ' 轮开战应成功：' + JSON.stringify(st));

    /* 结算边界：三个请求真并发，不人为排序 */
    const [leave, resume, change] = await Promise.all([
      post('/api/run/leave', { token: p.token }),
      post('/api/join', { token: p.token, path: 'dan' }),
      post('/api/path', { token: p.token, path: 'array' })
    ]);
    /* I1：无异常、响应明确 */
    for (const [name, r] of [['leave', leave], ['resume', resume], ['change', change]]) {
      assert.ok(r && typeof r === 'object' && ('ok' in r), '第 ' + round + ' 轮 ' + name + ' 应有明确响应：' + JSON.stringify(r));
    }
    assert.equal(resume.resumed, true, '第 ' + round + ' 轮并发 resume 应命中 resume 分支');

    /* I2：伪造值不得污染服务器登记（无论竞态时序） */
    const finalPath = await serverPathOf(p.token, p.id);
    assert.notEqual(finalPath, 'dan', '第 ' + round + ' 轮：伪造丹修不得进入服务器登记值');
    assert.ok(['sword', 'array'].includes(finalPath),
      '第 ' + round + ' 轮：登记值只能是首次值或大厅合法重选值，实得 ' + finalPath);

    /* I3/I4：轮询到旧局 run 不再活跃、房间相位确定（不固定 sleep） */
    let l = null, mine = null;
    for (let k = 0; k < 20; k++) {
      l = await post('/api/lobby', { token: p.token });
      mine = (l.rooms || []).filter(r => r.id === p.roomId);
      if (mine.length === 1 && mine[0].phase !== 'run') break;
      await sleep(60);
    }
    assert.equal(mine.length, 1, '第 ' + round + ' 轮应能找到本局房间');
    assert.notEqual(mine[0].phase, 'run', '第 ' + round + ' 轮：旧局 run 不得残留');
    assert.ok(['settled', 'lobby'].includes(mine[0].phase),
      '第 ' + round + ' 轮：房间最终相位应确定（settled/lobby），实得 ' + mine[0].phase);
    const activeRuns = (l.rooms || []).filter(r => r.phase === 'run');
    /* 本文件其他测试可能遗留 run 房间；只断言本轮没有新增第二个属于本局的活跃 run */
    assert.equal(activeRuns.filter(r => r.id === p.roomId).length, 0,
      '第 ' + round + ' 轮：结算只作用于旧局，不得产生第二个活跃 run');
  }
});

/* ---- Qoder #65 意见 6：写-写竞态与「不在房间」边界 ----
 * J2/J5 全部命中 resume（该分支根本不写 path），不能证明写-写竞态下原子性；
 * C2 所谓「唯一胜出规则」在现行代码里并不存在（apiPath 直接 p.path = body.path，
 * server.mjs:1020 → 最后写入者胜出）。J7 客观记录这一事实，不自证规则。 */
test('J7 lobby 并发 /api/path 写-写竞态：客观记录「最后写入者胜出」，不声称唯一规则', async () => {
  const p = await mkPlayer('J7', 'sword');
  const cands = ['dan', 'array', 'body', 'sword', 'dan', 'array'];
  /* 不同 body 大小 + 微小错峰，制造到达顺序差异（Node 服务端仍串行处理，不伪称指令级重叠） */
  const rs = await Promise.all(cands.map((pathId, i) => new Promise(resolve => {
    setTimeout(() => resolve(post('/api/path', { token: p.token, path: pathId, pad: 'x'.repeat(i * 200) })), i * 3);
  })));
  for (const r of rs) assert.equal(r.ok, true, 'lobby 相位 /api/path 应允许改道途：' + JSON.stringify(r));
  const finalPath = await serverPathOf(p.token, p.id);
  assert.ok(cands.includes(finalPath), '最终登记值必须来自本次合法写入集合（证明确有写发生）');
  assert.ok(rs.some(r => r.path === finalPath), '最终登记值必须与某次成功写入的返回值一致（服务器视图自洽）');
  /* 确定性写路径：单独一次串行请求，最终值必须精确等于该次写入 */
  const one = await post('/api/path', { token: p.token, path: 'body' });
  assert.equal(one.ok, true, '串行改写应成功');
  assert.equal(await serverPathOf(p.token, p.id), 'body', '串行写入结果应确定');
  /* 边界：玩家不在房间时 /api/path 同样允许改（Qoder #65 意见 2 第 2 点） */
  const lone = await mkLone('L7', 'sword');
  const lr = await post('/api/path', { token: lone.token, path: 'array' });
  assert.equal(lr.ok, true, '不在房间时应允许改道途（apiPath 的 room 判据为假）');
  assert.equal(await serverPathOf(lone.token, lone.id), 'array', '不在房间的登记值同样更新');
});

/* ---- Qoder #65 意见 6：真正开第二局，替代 J4/J6 的「近似」 ---- */
test('J8 真正的新局：旧局结算 → 回 lobby → 重选 → 开第二局，登记值与相位隔离', async () => {
  const p = await mkPlayer('J8', 'sword');
  const mate = await fillRoom(p);
  /* 旧局 */
  await startNextRun(p, mate);
  const oldLeave = await post('/api/run/leave', { token: p.token });
  assert.equal(oldLeave.ok, true, '旧局 retreat 应成功：' + JSON.stringify(oldLeave));
  await waitPhase(p.token, p.roomId, 'lobby');

  /* 新局边界：重选道途（大厅允许，Qoder #65 意见 2 已核实的 settled/lobby 行为） */
  const sel = await post('/api/path', { token: p.token, path: 'array' });
  assert.equal(sel.ok, true, '大厅重选应成功：' + JSON.stringify(sel));
  assert.equal(await serverPathOf(p.token, p.id), 'array', '新局登记值应为重选值');

  /* 真正开第二局 */
  await startNextRun(p, mate);
  const l = await post('/api/lobby', { token: p.token });
  const mine = (l.rooms || []).filter(r => r.id === p.roomId);
  assert.equal(mine.length, 1, '应只有一个本局房间');
  assert.equal(mine[0].phase, 'run', '第二局必须真的进入 run 相位（J4/J6 未覆盖）');
  assert.equal((l.rooms || []).filter(r => r.phase === 'run' && r.id === p.roomId).length, 1,
    '旧局不得残留为额外的活跃 run（C3 隔离）');
  assert.equal(await serverPathOf(p.token, p.id), 'array', '第二局仍沿用新局合法登记值');
  const bad = await post('/api/path', { token: p.token, path: 'dan' });
  assert.equal(bad.code, 'BAD_PHASE', '第二局 run 相位仍须拒绝改道途');

  /* 第二局也能正常结算，证明旧局结算未破坏生命周期 */
  const leave2 = await post('/api/run/leave', { token: p.token });
  assert.equal(leave2.ok, true, '第二局 retreat 应成功：' + JSON.stringify(leave2));
  const back = await waitPhase(p.token, p.roomId, 'lobby');
  assert.equal(back.phase, 'lobby', '第二局结算后正常回到 lobby');
});

/* ================= #64-R5-REV 定向补测（ChatGPT 裁定 Q2(a)/Q2(b)） =================
 * 裁定 #64-R5-REV 中称「J7 首次登记并发测试」「J8 生命周期结算隔离测试」；
 * 本文件 J7/J8 已被 Qoder #65 意见 6 的用例占用，故新增 J9 / J10 承载同一补测内容，
 * 不覆盖既有用例、不改运行代码、不改方案。
 *
 * 证据边界（如实声明，不夸大）：
 *  - 同步屏障只证明「客户端集中发出请求」。Node 单线程 HTTP 服务器串行处理各请求，
 *    本用例**不声称**证明服务端指令级写-写重叠或原子性。
 *  - 不预设「首次成功登记者胜出」或其他唯一胜出规则；不把数组顺序当作服务器处理顺序。
 *  - 结算记录证据取自服务器真实 SSE `run_settle` 事件（server.mjs:720 发的 result.runId），
 *    **不是**测试侧伪造事件，也不以 profile 汇总值冒充 runId 归属。
 *  - profile 是汇总值，故采用「固定初始状态 + 分阶段快照 + 精确预期增量」，不只比最终数值。
 */

/* J9 = 裁定 Q2(a)「首次登记并发用例」：8 路首次 join，同一身份 hint，客观记录实际行为。 */
test('J9（裁定 J7）首次登记并发：同步屏障 8 路首次 join，客观记录服务器实际行为，不预设唯一胜出规则', async () => {
  const hint = 'wbj9_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const name = uniq('J9');
  const cands = ['sword', 'dan', 'array', 'body', 'sword', 'dan', 'array', 'body'];

  /* 前置：服务器侧确认该身份没有既有档案/道途登记（不靠测试自称）。 */
  const pre = await fetch(BASE + '/api/profile?token=' + encodeURIComponent(hint)).then(r => r.json());
  assert.equal(pre.ok, false, '前置：该身份在服务器上不应有既有档案');
  assert.equal(pre.code, 'NO_PROFILE', '前置：应明确返回 NO_PROFILE，实得 ' + JSON.stringify(pre));

  /* 同步屏障：8 个请求在同一微任务批次集中发出；pad 制造 body 大小差异（不预设到达顺序）。 */
  let release;
  const gate = new Promise(r => { release = r; });
  const jobs = cands.map((pathId, i) => (async () => {
    await gate;
    const t0 = Date.now();
    const r = await post('/api/join', {
      name, path: pathId, token: hint, pad: 'x'.repeat(i * 37)
    });
    return { i, pathId, t0, t1: Date.now(), r };
  })());
  release();
  const rs = await Promise.all(jobs);

  /* 记录请求发出/响应时刻，验证屏障确实让 8 路集中在同一时间窗内发出。 */
  const sent = rs.map(x => x.t0);
  assert.ok(Math.max(...sent) - Math.min(...sent) < 250,
    '同步屏障应使 8 路集中在同一时间窗发出（客户端并发，非服务端指令级重叠）');
  for (const x of rs) {
    assert.ok(x.t1 >= x.t0, '每路应记录到响应时刻');
    assert.equal(x.r.ok, true, '第 ' + x.i + ' 路首次 join 应成功：' + JSON.stringify(x.r));
    assert.notEqual(x.r.resumed, true, '第 ' + x.i + ' 路必须是首次登记，不得命中 resume 分支');
    assert.equal(x.r.player.path, x.pathId, '第 ' + x.i + ' 路返回值应等于各自提交的首次道途');
  }

  /* 事实记录：现行实现为每路 join 各自新建玩家，不存在跨请求「唯一首次登记胜出」语义。
     不把它包装成「首次成功登记者胜出」，也不擅自改成产品设计规则（裁定 Q2(a) 要求）。 */
  const ids = rs.map(x => x.r.player.id);
  const toks = rs.map(x => x.r.player.token);
  assert.equal(new Set(ids).size, 8, '事实：8 路首次登记生成 8 个独立玩家 id');
  assert.equal(new Set(toks).size, 8, '事实：8 路首次登记生成 8 个独立 token');

  /* 最终登记值以服务器实际状态（/api/lobby 的 playerSummary.path）确认，不用客户端返回自证。 */
  for (const x of rs) {
    const l = await post('/api/lobby', { token: x.r.player.token });
    assert.equal(l.ok, true, '/api/lobby 应成功');
    const hit = (l.players || []).find(p => p.id === x.r.player.id);
    assert.ok(hit, '服务器视图应能找到第 ' + x.i + ' 路玩家');
    assert.equal(hit.path, x.pathId, '第 ' + x.i + ' 路服务器最终登记值应与各自首次提交一致');
  }

  /* 同一身份 hint 在档案层确实共享（profiles.ensure/bind，server.mjs:796/845），
     但道途登记是 player 级字段、各自独立 —— 这正是「首次登记竞争」事实的完整刻画。 */
  const profIds = [];
  for (const x of rs) profIds.push((await profileOf(x.r.player.token)).id);
  assert.equal(new Set(profIds).size, 1, '同一身份 hint 下 8 个玩家应共享同一份服务器档案');
});

/* J10 = 裁定 Q2(b)「旧局结算与奖励隔离」：真实 run_settle 事件 + profile 分阶段快照。 */
test('J10（裁定 J8）旧局结算与奖励隔离：真实 run_settle runId + profile 精确增量，不伪造事件', async () => {
  const p = await mkPlayer('J10', 'sword');
  const mate = await fillRoom(p);
  /* 两人都开真 SSE：既保证 online 参与战力判定，也保证 settle 事件能下发到监听方。 */
  const sseA = await openSse(BASE + '/api/stream?token=' + encodeURIComponent(p.token));
  const sseB = await openSse(BASE + '/api/stream?token=' + encodeURIComponent(mate.token));
  try {
    /* ① 固定初始状态（新档案：0 石 / 0 层 / 0 局），作为分阶段快照基线。 */
    const snap0 = await profileOf(p.token);
    assert.equal(snap0.stones, 0, '新档案初始灵石应为 0');
    assert.equal(snap0.layersCleared, 0, '新档案初始层数应为 0');
    assert.equal(snap0.runs, 0, '新档案初始局数应为 0');

    await startNextRun(p, mate);
    /* 打第 1 层：两人各出手一次 → 服务器判定通过并落袋非零灵石、layer 推进到 2。
       基础档案战力 1000/人，队伍 ≈2200 > NEED[0]=800，故必有非零奖励（避免空断言）。 */
    const sa = await post('/api/run/strike', { token: p.token });
    const sb = await post('/api/run/strike', { token: mate.token });
    assert.equal(sa.ok, true, '旧局 A 出手应成功');
    assert.equal(sb.ok, true, '旧局 B 出手应成功');

    /* 触发旧局结算（retreat）。 */
    const leave = await post('/api/run/leave', { token: p.token });
    assert.equal(leave.ok, true, '旧局 retreat 应成功：' + JSON.stringify(leave));

    /* ② 结算记录关联旧局 runId：证据是服务器真实 SSE 事件，不是测试侧构造。 */
    const old = await waitFor(sseA, 'run_settle', 6000);
    assert.ok(old && old.result, '应收到真实 run_settle 事件');
    const oldId = old.result.runId;
    assert.match(oldId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      '旧局 runId 应为服务器生成的小写 UUID，实得 ' + oldId);
    assert.equal(old.result.reason, 'retreat', '旧局结算原因应为 retreat');
    assert.equal(old.result.layers, 1, '旧局应结算 1 层（打过第 1 层后撤退）');
    const oldReward = (old.result.rewards || []).find(r => r.id === p.id);
    assert.ok(oldReward && oldReward.stone > 0, '旧局须有非零灵石奖励，否则奖励隔离断言为空断言');

    /* ③ 奖励隔离：profile 分阶段快照 + 精确预期增量（grantRun: stones/layersCleared/runs）。 */
    const snap1 = await profileOf(p.token);
    assert.equal(snap1.stones - snap0.stones, Math.floor(oldReward.stone),
      '旧局奖励只应发放一次，灵石增量须精确等于真实结算事件的奖励');
    assert.equal(snap1.layersCleared - snap0.layersCleared, old.result.layers,
      '层数增量须精确等于真实结算事件的 layers');
    assert.equal(snap1.runs - snap0.runs, 1, '旧局结算应只记 1 局');

    /* ④ 结算只执行一次：重放 strike 不得再发事件、不得重复发奖。
       注意：不重放 /api/run/leave —— 它在非 run 相位会 removeFromRoom（server.mjs:1118），
       那不是「结算重放」而是改房间成员，会把后续第二局的场景破坏掉。 */
    const replayStrike = await post('/api/run/strike', { token: p.token });
    assert.equal(replayStrike.ok, false, '结算后重放出手的服务器响应应明确拒绝');
    await sleep(300);
    assert.equal(sseA.drain().filter(e => e.event === 'run_settle').length, 0,
      '结算重放不得产生第二条 run_settle');
    const snapReplay = await profileOf(p.token);
    assert.equal(snapReplay.stones, snap1.stones, '重放结算不得重复增加灵石');
    assert.equal(snapReplay.layersCleared, snap1.layersCleared, '重放结算不得重复增加层数');
    assert.equal(snapReplay.runs, snap1.runs, '重放结算不得重复增加局数');

    /* ⑤ 新局登记不污染旧局奖励结果。 */
    await waitPhase(p.token, p.roomId, 'lobby');
    const sel = await post('/api/path', { token: p.token, path: 'array' });
    assert.equal(sel.ok, true, '大厅重选道途应成功：' + JSON.stringify(sel));
    const snapNewPre = await profileOf(p.token);
    assert.equal(snapNewPre.stones, snap1.stones, '仅重选道途/进大厅不得改变档案');
    assert.equal(snapNewPre.runs, snap1.runs, '仅重选道途/进大厅不得记新局');

    /* 真开第二局并立即撤退（未出手 → layers=0、无奖励），拿第二个真实 runId。 */
    await startNextRun(p, mate);
    const leave2 = await post('/api/run/leave', { token: p.token });
    assert.equal(leave2.ok, true, '第二局 retreat 应成功：' + JSON.stringify(leave2));
    const fresh = await waitFor(sseA, 'run_settle', 6000);
    assert.ok(fresh && fresh.result, '第二局应有自己的真实结算事件');
    const newId = fresh.result.runId;
    assert.notEqual(newId, oldId, '新局 runId 必须与旧局不同（结算记录归属隔离）');
    assert.equal(fresh.result.layers, 0, '第二局未出手即撤退，结算层数应为 0');

    const snap2 = await profileOf(p.token);
    assert.equal(snap2.stones, snap1.stones, '新局不得重复获得旧局奖励');
    assert.equal(snap2.layersCleared, snap1.layersCleared, '新局不得把旧局层数计入自己');
    assert.equal(snap2.runs, snap1.runs, '新局无层数结算不得记新局');
  } finally {
    sseB.close();
    sseA.close();
  }
});

/* ================= #64-R6 定向补正：重复结算幂等性（独立隔离用例） =================
 * ChatGPT #64-R6 裁定指出：J10 在结算后重放的是 `/api/run/strike`，**不是实际结算入口**，
 * 因此「strike 被拒」不能推出「重复结算请求不会重复发奖」。
 * 本用例按裁定建议做单独隔离验证：一次性玩家 + 独立房间，重放真实 `/api/run/leave`，
 * 并如实接受该端点在非 run 相位会 `removeFromRoom(p)`（server.mjs:1118）的副作用——
 * 本用例是文件最后一个用例、使用自己独立的房间，不破坏 J10 的第二局场景。
 * 不改运行代码、不改 J9/J10 逻辑、不重开 1.1 方案审查。
 */
test('J11（R6 补正）重复结算幂等性：真实二次 /api/run/leave 不重复发奖（独立隔离房间）', async () => {
  const p = await mkPlayer('J11', 'sword');
  const mate = await fillRoom(p);
  /* 两路都监听：p 在第二次 leave 后会被移出房间，此时若服务器错误地再次结算，
     事件只会发给仍在房间内的 mate，故必须同时检查 B 路，不能只 drain A 路。 */
  const sseA = await openSse(BASE + '/api/stream?token=' + encodeURIComponent(p.token));
  const sseB = await openSse(BASE + '/api/stream?token=' + encodeURIComponent(mate.token));
  try {
    const snap0 = await profileOf(p.token);
    assert.equal(snap0.stones, 0, '新档案初始灵石应为 0');
    assert.equal(snap0.layersCleared, 0, '新档案初始层数应为 0');
    assert.equal(snap0.runs, 0, '新档案初始局数应为 0');

    await startNextRun(p, mate);
    /* 打第 1 层制造非零奖励（基础战力 1000/人 → 队伍≈2200 > NEED[0]=800），避免空断言。 */
    assert.equal((await post('/api/run/strike', { token: p.token })).ok, true, 'A 出手应成功');
    assert.equal((await post('/api/run/strike', { token: mate.token })).ok, true, 'B 出手应成功');

    /* 第一次：真实结算入口。 */
    const first = await post('/api/run/leave', { token: p.token });
    assert.equal(first.ok, true, '第一次真实结算入口应成功：' + JSON.stringify(first));
    const ev1 = await waitFor(sseA, 'run_settle', 6000);
    assert.ok(ev1 && ev1.result, '应收到第一条真实 run_settle 事件');
    const runId1 = ev1.result.runId;
    assert.match(runId1, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      '旧局 runId 应为服务器生成的小写 UUID，实得 ' + runId1);
    assert.equal(ev1.result.reason, 'retreat', '结算原因应为 retreat');
    assert.ok(ev1.result.layers >= 1, '旧局应有非零结算层数');
    const reward = (ev1.result.rewards || []).find(r => r.id === p.id);
    assert.ok(reward && reward.stone > 0, '旧局须有非零灵石奖励，否则幂等断言为空断言');

    const snap1 = await profileOf(p.token);
    assert.equal(snap1.stones - snap0.stones, Math.floor(reward.stone), '第一次结算灵石增量应精确');
    assert.equal(snap1.layersCleared - snap0.layersCleared, ev1.result.layers, '第一次结算层数增量应精确');
    assert.equal(snap1.runs - snap0.runs, 1, '第一次结算应只记 1 局');

    /* 清掉第一次结算在两路 SSE 上的残留事件，作为「重复结算」检查的干净基线。 */
    sseA.drain();
    sseB.drain();

    /* 第二次：同一旧局、同一 token，**再次提交实际结算入口**（不是 strike）。 */
    const second = await post('/api/run/leave', { token: p.token });
    assert.ok(second && typeof second === 'object' && ('ok' in second),
      '重复结算请求应有明确的服务器真实响应：' + JSON.stringify(second));
    await sleep(300);
    const dupA = sseA.drain().filter(e => e.event === 'run_settle');
    const dupB = sseB.drain().filter(e => e.event === 'run_settle');
    assert.equal(dupA.length, 0, '重复结算不得产生第二条同一旧局 run_settle（A 路）');
    assert.equal(dupB.length, 0, '重复结算不得产生第二条同一旧局 run_settle（B 路，仍在房间内）');

    const snap2 = await profileOf(p.token);
    assert.equal(snap2.stones, snap1.stones, '重复结算不得重复增加灵石');
    assert.equal(snap2.layersCleared, snap1.layersCleared, '重复结算不得重复增加层数');
    assert.equal(snap2.runs, snap1.runs, '重复结算不得重复增加局数');
    assert.equal(snap2.id, snap0.id, '重复结算不得改变档案身份');

    /* 第三次：另一位仍在房间内的成员也提交实际结算入口，覆盖「两个客户端都点撤退」。 */
    const third = await post('/api/run/leave', { token: mate.token });
    assert.ok(third && typeof third === 'object' && ('ok' in third),
      '第二位成员的重复结算请求也应有真实响应：' + JSON.stringify(third));
    await sleep(300);
    assert.equal(sseB.drain().filter(e => e.event === 'run_settle').length, 0,
      '第二位成员的重复结算同样不得产生新结算事件');
    const snap3 = await profileOf(p.token);
    assert.equal(snap3.stones, snap1.stones, '第三次的重复结算不得重复增加灵石');
    assert.equal(snap3.layersCleared, snap1.layersCleared, '第三次的重复结算不得重复增加层数');
    assert.equal(snap3.runs, snap1.runs, '第三次的重复结算不得重复增加局数');

    /* 隔离性确认：removeFromRoom 副作用仅限本用例房间，档案读取不受影响。 */
    const l = await post('/api/lobby', { token: p.token });
    assert.equal(l.ok, true, '被移出房间后 /api/lobby 仍应可查（档案与身份不受影响）');
  } finally {
    sseB.close();
    sseA.close();
  }
});
