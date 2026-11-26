/* js/net.js — 联机客户端模块（第 115 轮 · T-703，总控直写：协议作者直译）
 *
 * 定位：与服务器（server/server.mjs，REST+SSE 协议）配对的客户端协议层——
 *   join 登入 → SSE 事件流 → 状态机（offline/lobby/room/run）→ 事件订阅。
 * 纯协议层：不碰 DOM、不碰存档；UI 装配层（game.js）负责渲染与入账。
 *
 * 存储键：无（token 只在内存，刷新页面重新 connect——联机会话本就短生命）。
 * API：
 *   connect(baseUrl, name, power, resumeToken?, snapshot?, path?)：登入并挂事件流 → {ok} / {ok:false, error}
 *   api(path, body?)：带 token 的 POST（/api/room/create 等）→ 服务器 JSON 原样
 *   disconnect()：主动断流并清状态
 *   state()：'offline' | 'lobby' | 'room' | 'run'
 *   me()：{id, name, token, power, path} 或 null
 *   data()：{players, rooms, room, run, lastSettle, chats, paths} 最新快照（只读用途）
 *   on(type, cb)：订阅 hello/lobby/room/run/run_settle/chat/lost/bye → 返回退订函数
 *   _deps：{fetch, EventSource, URL} 测试注入点（沙箱默认用全局）
 */
(function () {
  'use strict';

  var deps = {
    /* fetch 必须包一层：页面里 window.fetch 是绑定方法，裸引用脱窗调用会
       Illegal invocation（vm 沙箱/node 下 fetch 是独立函数，测不出来——E2E 抓到） */
    fetch: (typeof fetch === 'function') ? function (u, o) { return fetch(u, o); } : null,
    EventSource: (typeof EventSource === 'function') ? EventSource : null,
    URL: (typeof URL === 'function') ? URL : null,
    /* Stream(url, {onEvent(name, dataObj), onClose()}) → {close()}：流连接抽象。
       浏览器缺省用 EventSource 包装；非浏览器环境（测试）可注入等价实现。 */
    Stream: null
  };

  function defaultStream(url, handlers) {
    var es = new deps.EventSource(url);
    var NAMES = ['hello', 'lobby', 'room', 'run', 'run_settle', 'chat', 'bye'];
    NAMES.forEach(function (n) {
      es.addEventListener(n, function (e) {
        var d = null;
        try { d = JSON.parse(e.data); } catch (er) { d = null; }
        handlers.onEvent(n, d);
      });
    });
    es.onerror = function () { handlers.onError(es.readyState); };
    return { close: function () { try { es.close(); } catch (e) {} } };
  }

  function openStream(url, handlers) {
    if (deps.Stream) return deps.Stream(url, handlers);
    if (deps.EventSource) return defaultStream(url, handlers);
    return null;
  }

  var me = null;            /* {id, name, token, power, path} */
  var base = '';            /* 服务器根（不含尾斜杠） */
  var es = null;            /* EventSource 连接 */
  var state = 'offline';    /* offline | lobby | room | run */
  var data = { players: [], rooms: [], room: null, run: null, lastSettle: null, chats: [], paths: [] };
  var listeners = {};       /* type → [cb] */

  function emit(type, payload) {
    var arr = listeners[type];
    if (!arr) return;
    arr = arr.slice();
    for (var i = 0; i < arr.length; i++) {
      /* 订阅者异常不拖垮协议层——但也不能彻底吞掉：
         结算入账回调里若抛错（S.stats 未定义 / save 抛错 / render 抛错），
         原先连 console 都没有一行，玩家看到"结算卡出来了但灵石没到账"，
         维护者事后完全无从追查。这里至少留一条控制台记录。 */
      try { arr[i](payload); } catch (e) {
        try { console.error('[net] listener error @' + type, e); } catch (_) {}
      }
    }
  }

  /* 请求超时护栏：服务器假死 / NAT 半开时 fetch 既不 resolve 也不 reject，
     调用方的 .then/.catch 全都永远等不到 → 玩家点「出手/备好/登入」后
     界面毫无反应也没有报错，只能刷新。4.5 秒（join 6 秒）无响应即判超时并 abort。 */
  function fetchJson(url, opts, ms) {
    var D = deps;
    var ctrl = (typeof AbortController === 'function') ? new AbortController() : null;
    var o = {};
    if (opts) { for (var k in opts) o[k] = opts[k]; }
    if (ctrl) o.signal = ctrl.signal;
    var timedOut = false;
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        timedOut = true;
        if (ctrl) { try { ctrl.abort(); } catch (e) {} }
        reject(new Error('TIMEOUT'));
      }, ms || 4500);
      D.fetch(url, o).then(function (r) {
        clearTimeout(timer); resolve(r);
      }, function (e) {
        clearTimeout(timer); reject(timedOut ? new Error('TIMEOUT') : e);
      });
    });
  }

  function setState(s) {
    if (state === s) return;
    state = s;
    emit('state', s);
  }

  function resetData() {
    data = { players: [], rooms: [], room: null, run: null, lastSettle: null, chats: [], paths: [] };
  }

  /* ---- SSE 事件 → 状态机 ---- */
  function applyEvent(ev, d) {
    if (!d || typeof d !== 'object') d = {};
    if (ev === 'hello') {
      data.players = d.players || [];
      data.rooms = d.rooms || [];
      data.paths = d.paths || [];    /* P1-A：道途目录（服务器下发，客户端不硬编码） */
      if (me && d.you && d.you.path) me.path = d.you.path;
      setState('lobby');
    } else if (ev === 'lobby') {
      data.players = d.players || [];
      data.rooms = d.rooms || [];
    } else if (ev === 'room') {
      data.room = d.room || null;
      if (d.room) {
        /* run 阶段由 run 事件主导；room 事件只同步 phase */
        if (d.room.phase === 'run') setState('run');
        else setState('room');
      } else setState('lobby');
    } else if (ev === 'run') {
      data.run = d.run || null;
      setState('run');
    } else if (ev === 'run_settle') {
      data.lastSettle = d.result || null;
      data.run = null;
      setState('room');   /* 服务器 phase=settled→3 秒回 lobby；room 事件随后同步 */
    } else if (ev === 'chat') {
      data.chats.push(d);
      if (data.chats.length > 30) data.chats.shift();
    } else if (ev === 'bye') {
      hardReset();
    }
    /* run_settle 给订阅者的是解包后的 result 本体（奖励/胜负直接可读）——
       裸 emit 会把 SSE 包裹层 {result:{...}} 一起递出去，订阅方按 r.rewards 读必空 */
    emit(ev, ev === 'run_settle' ? (d && d.result ? d.result : d) : d);
  }

  function hardReset() {
    if (es) { try { es.close(); } catch (e) {} es = null; }
    me = null;
    base = '';
    resetData();
    setState('offline');
  }

  function post(path, body) {
    var D = deps;
    var payload = {};
    if (me && me.token) payload.token = me.token;
    if (body) { for (var k in body) payload[k] = body[k]; }
    return fetchJson(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); })
      .catch(function (e) {
        var msg = String(e && e.message || e);
        return { ok: false, code: (msg === 'TIMEOUT' ? 'TIMEOUT' : 'NETWORK'), error: msg };
      });
  }

  window.Net = {
    /* 登入：POST /api/join + 挂 SSE。connect 失败不抛异常，返回 {ok:false, error}。
       resumeToken：非空时作为续接令牌发给服务器（P0-C 刷新回原队）；服务器认则复用身份。
       path（P1-A）：道途枚举 id（'sword'|'body'|'dan'|'array'）。只送 id，不送任何倍率——
       服务器端系数表是唯一真相；续接时服务器沿用已登记道途，忽略此参数。 */
    connect: function (baseUrl, name, power, resumeToken, snapshot, path) {
      var D = deps;
      if (!D.fetch) return Promise.resolve({ ok: false, error: '环境缺 fetch' });
      if (!D.Stream && !D.EventSource) return Promise.resolve({ ok: false, error: '环境缺流连接能力' });
      if (typeof name !== 'string' || !name.trim()) return Promise.resolve({ ok: false, error: '名字不能为空' });
      var b = String(baseUrl || '').replace(/\/+$/, '');
      var joinBody = { name: name.trim(), power: power };
      if (resumeToken) joinBody.token = String(resumeToken);
      if (path) joinBody.path = String(path);
      /* P0-B（第 118 轮）：携带"受钳制养成快照"，服务器据此重算破层战力而非采信 body.power。
         #75（第 122 轮）：服务器 legacy 回退**默认关闭**，无快照会被拒（LEGACY_DISABLED）；
         因此正式客户端必须始终带快照。power 字段仍照旧发送，仅 legacy 模式(显式开启)才被读取。 */
      if (snapshot && typeof snapshot === 'object') joinBody.snapshot = snapshot;
      return fetchJson(b + '/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(joinBody)
      }, 6000).then(function (r) { return r.json(); }).then(function (j) {
        /* 优先用服务器给的可读 error（如 LEGACY_DISABLED 的中文提示），退回错误码 */
        if (!j || !j.ok) return { ok: false, code: (j && j.code) || 'JOIN_FAIL', error: (j && (j.error || j.code)) || 'JOIN_FAIL' };
        me = j.player;
        base = b;
        resetData();
        var resumed = !!j.resumed;
        var roomId = j.roomId || null;
        var url = b + '/api/stream?token=' + encodeURIComponent(me.token);
        es = openStream(url, {
          onEvent: function (n, d) { applyEvent(n, d); },
          onError: function (readyState) {
            /* EventSource 原生自动重连；只有彻底 CLOSED 才宣判掉线 */
            if (me && (readyState === undefined || readyState === null || readyState === 2)) {
              var wasMe = me;
              hardReset();
              emit('lost', { id: wasMe.id, name: wasMe.name });
            }
          }
        });
        if (!es) return { ok: false, error: '流连接创建失败' };
        /* hello 到达即视为就绪（最多等 5 秒防挂死） */
        return new Promise(function (resolve) {
          var done = false;
          var off = window.Net.on('hello', function () {
            if (done) return;
            done = true; off();
            resolve({ ok: true, me: me, resumed: resumed, roomId: roomId });
          });
          setTimeout(function () {
            if (done) return;
            done = true; off();
            if (window.Net.state() === 'offline') { hardReset(); resolve({ ok: false, error: 'STREAM_FAIL' }); }
            else resolve({ ok: true, me: me, resumed: resumed, roomId: roomId });
          }, 5000);
        });
      }).catch(function (e) {
        var msg = String(e && e.message || e);
        return { ok: false, code: (msg === 'TIMEOUT' ? 'TIMEOUT' : 'JOIN_FAIL'), error: (msg === 'TIMEOUT' ? '服务没响应（超时）' : msg) };
      });
    },
    api: function (path, body) {
      if (!me) return Promise.resolve({ ok: false, code: 'NOT_CONNECTED' });
      return post(path, body).then(function (resp) {
        /* 权威确认：create/join 等响应自带 room 视图——直接应用，不等广播
          （服务器只在成员变化时广播 room，create 时 host 无 room 事件） */
        if (resp && resp.ok && resp.room) applyEvent('room', { room: resp.room });
        /* P1-A：改道途的响应自带服务器登记值——同步到 me，
           否则界面上的选中标记会停在旧道途（/api/path 不广播 hello） */
        if (resp && resp.ok && resp.path && me) me.path = resp.path;
        return resp;
      });
    },
    disconnect: function () {
      /* post 返回 Promise，永远不会同步抛异常——原来的 try/catch 抓不到任何东西
         （包括 deps.fetch 缺失那种异步 reject），最终变成无人处理的静默失败。
         这里用 .catch 兜住，且不断言"服务端一定收到"（发不出去时服务端会走 60 秒离线踢人）。 */
      if (me && me.token) { try { post('/api/room/leave').catch(function () {}); } catch (e) {} }
      hardReset();
    },
    /* 主动离开房间后的本地归位。服务器不会给离场者本人发 room:null
       （它先把自己从 members 移除，再只广播 lobby），而 applyEvent 的 lobby 分支
       既不清 data.room 也不改 state → 客户端会永久卡在房间态。
       由 UI 在 /api/room/leave 确认成功后调用。 */
    clearRoom: function () {
      data.room = null;
      data.run = null;
      setState('lobby');
    },
    state: function () { return state; },
    me: function () { return me ? { id: me.id, name: me.name, token: me.token, power: me.power, path: me.path } : null; },
    data: function () { return data; },
    on: function (type, cb) {
      if (typeof cb !== 'function') return function () {};
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(cb);
      var arr = listeners[type];
      return function () {
        var i = arr.indexOf(cb);
        if (i >= 0) arr.splice(i, 1);
      };
    },
    /* 测试注入点：替换传输依赖（必须在 connect 前调用） */
    set deps(v) { if (v && v.fetch && (v.EventSource || v.Stream)) deps = v; },
    get deps() { return deps; }
  };
})();
