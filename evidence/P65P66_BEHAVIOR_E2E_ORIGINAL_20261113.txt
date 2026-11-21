// 红线① · token 客户端侧安全加固 · 行为级 E2E（GPT 独立审查补正件）
// 与 TOKEN_HARDEN_E2E.mjs 的区别：本件不做「函数已定义 / 含 TTL 判定」的正则结构检查，
// 而是从真实 js/game.js 提取函数源码，注入 localStorage / Date / Net 桩后在 vm 沙箱里真实调用，
// 覆盖 TTL 边界、缺失/非法/未来时间戳、错误分类、登出顺序等实际行为。
// 只读源文件文本，不修改任何文件、不加载整份 game.js（避免 DOM 依赖）。
import fs from 'node:fs';
import vm from 'node:vm';

const PATH = 'D:/xx-scratch/jiuxiao-analysis/九霄问道/js/game.js';
const code = fs.readFileSync(PATH, 'utf8');
const START = code.indexOf("  const MULTI_SESSION_KEY = 'jxwd_multi_session_v1';");
const END = code.indexOf('  let multiStorageHooked = false;');
if (START < 0 || END < 0 || END <= START) {
  console.log('!! 未能从真实 game.js 提取会话函数块'); process.exit(1);
}
const BLOCK = code.slice(START, END);

const KEY = 'jxwd_multi_session_v1';
const DAY = 86400000;
const NOW = 1770000000000; // 固定时钟，保证断言可复现

// 建立沙箱：真实函数源码 + 可观测的 localStorage/Date/Net 桩
function makeEnv(opts = {}) {
  const store = new Map();
  if (opts.session !== undefined) store.set(KEY, typeof opts.session === 'string' ? opts.session : JSON.stringify(opts.session));
  if (opts.mainSave) store.set('jxwd_save_v1', JSON.stringify({ hero: '不应被删除' }));
  const calls = { order: [], removed: [], set: [], api: [] };
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { calls.set.push([k, String(v)]); store.set(k, String(v)); },
    removeItem: k => { calls.removed.push(k); calls.order.push('remove'); store.delete(k); }
  };
  const Net = {
    state: () => (opts.state || 'offline'),
    me: () => (opts.me || null),
    api: p => {
      calls.api.push(p); calls.order.push('api');
      return opts.apiReject ? Promise.reject(new Error('leave failed')) : Promise.resolve({ ok: true });
    }
  };
  const ctx = {
    localStorage, Date: { now: () => (opts.now === undefined ? NOW : opts.now) },
    window: { Net }, Net, Number, JSON, console, Promise
  };
  vm.runInNewContext(
    BLOCK + '\n;globalThis.__X = { multiLoadSession, multiSaveSession, multiClearSession, multiIsCredentialFailure, multiIsNetworkError, multiLogout };',
    ctx
  );
  return { X: ctx.__X, calls, store };
}

let pass = 0, fail = 0;
const check = (name, cond, got) => {
  if (cond) { console.log(`  ✓ ${name} = ${JSON.stringify(got)}`); pass++; }
  else { console.log(`  ✗ ${name} = ${JSON.stringify(got)} （期望不符）`); fail++; }
};
const base = () => ({ token: 'T', name: '道友', base: 'http://s', roomId: 'R', savedAt: NOW - DAY });
const tick = () => new Promise(r => setTimeout(r, 0));

console.log('===== 红线① · 行为级 E2E（真实函数源码，vm 沙箱） =====');
console.log('源块字节 =', Buffer.byteLength(BLOCK, 'utf8'), '（从真实 js/game.js 提取）\n');

console.log('--- A. TTL / savedAt fail-closed（GPT 阻断项①）---');
{
  const cases = [
    ['savedAt 缺失（旧格式会话）', { token: 'T', base: 'http://s', roomId: 'R' }],
    ['savedAt = null', { ...base(), savedAt: null }],
    ['savedAt = 字符串', { ...base(), savedAt: String(NOW - DAY) }],
    ['savedAt = NaN（JSON 里变 null）', { ...base(), savedAt: NaN }],
    ['savedAt = 0', { ...base(), savedAt: 0 }],
    ['savedAt = 负数', { ...base(), savedAt: -1 }],
    ['savedAt = 未来时间', { ...base(), savedAt: NOW + DAY }],
    ['savedAt = 非安全整数', { ...base(), savedAt: Number.MAX_SAFE_INTEGER + 10 }],
    ['恰好 30 天（>= 边界）', { ...base(), savedAt: NOW - 30 * DAY }],
    ['超过 30 天', { ...base(), savedAt: NOW - 31 * DAY }]
  ];
  for (const [name, session] of cases) {
    const e = makeEnv({ session });
    const got = e.X.multiLoadSession();
    check(`${name} → 不续接且清键`, got === null && e.calls.removed.includes(KEY), { ret: got, removed: e.calls.removed });
  }
  const eOk = makeEnv({ session: { ...base(), savedAt: NOW - 29 * DAY } });
  const okRet = eOk.X.multiLoadSession();
  check('29 天前 → 允许续接', !!okRet && okRet.token === 'T', okRet && okRet.token);
  const eBad = makeEnv({ session: '{broken json' });
  check('JSON 损坏 → null（不抛）', eBad.X.multiLoadSession() === null, null);
  const eNull = makeEnv({ session: 'null' });
  check('存储值为 null → null', eNull.X.multiLoadSession() === null, null);
  const eSave = makeEnv({});
  eSave.X.multiSaveSession({ token: 'NEW', name: 'N', base: 'B', roomId: 'RM' });
  const saved = eSave.store.get(KEY);
  const savedObj = saved ? JSON.parse(saved) : null;
  check('multiSaveSession 写入 savedAt = 当前时间', !!savedObj && savedObj.savedAt === NOW, savedObj && savedObj.savedAt);
  check('multiSaveSession 只写独立会话键', eSave.calls.set.every(x => x[0] === KEY), eSave.calls.set.map(x => x[0]));
}

console.log('\n--- B. 错误分类（GPT 补正②：未知错误不得误判凭据失效）---');
{
  const X = makeEnv().X;
  const cred = ['BAD_TOKEN', 'NO_PROFILE', 'SUPERSEDED', 'TOKEN_EXPIRED', 'AUTH_FAILED', 'REVOKED', 'KICKED'];
  for (const c of cred) check(`凭据失效码 ${c} → 清键`, X.multiIsCredentialFailure({ code: c }) === true && X.multiIsNetworkError({ code: c }) === false, c);
  const netCodes = ['TIMEOUT', 'NETWORK', 'STREAM_FAIL'];
  for (const c of netCodes) check(`临时故障码 ${c} → 保留凭据`, X.multiIsNetworkError({ code: c }) === true && X.multiIsCredentialFailure({ code: c }) === false, c);
  const netErrors = ['STREAM_FAIL', '服务没响应（超时）', '流连接创建失败', '环境缺 fetch', 'NETWORK'];
  for (const e of netErrors) check(`error="${e}" → 保留凭据`, X.multiIsNetworkError({ error: e }) === true, e);
  const unknown = ['JOIN_FAIL', 'LEGACY_DISABLED', 'ROOM_FULL', 'BAD_SNAPSHOT', 'ROOM_RUNNING', 'INTERNAL', 'HTTP_500', 'RATE_LIMITED'];
  for (const c of unknown) {
    const isCred = X.multiIsCredentialFailure({ code: c });
    check(`未知/服务器拒绝 ${c} → 不误清凭据`, isCred === false, { cred: isCred, net: X.multiIsNetworkError({ code: c }) });
  }
  check('null 响应 → 非凭据失效', X.multiIsCredentialFailure(null) === false, false);
}

console.log('\n--- C. multiLogout 顺序与失败兜底（GPT 补正③）---');
{
  const online = makeEnv({ state: 'online', me: { id: 'P', token: 'T' }, mainSave: true });
  online.X.multiLogout('logout'); await tick();
  check('在线：先请求 leave，再清本地键', online.calls.order.join(',') === 'api,remove', online.calls.order);
  check('在线：leave 路径正确', online.calls.api[0] === '/api/room/leave', online.calls.api);
  check('在线：只删会话键、不删主存档', online.calls.removed.join(',') === KEY && online.store.has('jxwd_save_v1'), online.calls.removed);

  const rejected = makeEnv({ state: 'online', me: { id: 'P', token: 'T' }, apiReject: true });
  rejected.X.multiLogout('logout'); await tick();
  check('leave 失败：仍完成清键（不阻塞）', rejected.calls.removed.includes(KEY), rejected.calls.removed);

  const offline = makeEnv({ state: 'offline', me: null });
  offline.X.multiLogout('lifecycle'); await tick();
  check('离线：不发 leave、直接清键', offline.calls.api.length === 0 && offline.calls.removed.includes(KEY), offline.calls.order);

  for (const reason of ['logout', 'expired', 'revoked', 'lifecycle']) {
    const e = makeEnv({ state: 'offline' });
    e.X.multiLogout(reason); await tick();
    check(`reason=${reason} 均能清键`, e.calls.removed.includes(KEY), reason);
  }
}

console.log('\n--- D. multiEnter 分支与契约防护（静态核对，配合上面行为断言）---');
{
  const enterStart = code.indexOf('  function multiEnter(){');
  const enterEnd = code.indexOf('  function multiExit(){');
  const enter = enterStart >= 0 && enterEnd > enterStart ? code.slice(enterStart, enterEnd) : '';
  check('续接失败先判凭据失效', enter.indexOf('multiIsCredentialFailure(r)') >= 0, true);
  check('再判临时故障', enter.indexOf('multiIsNetworkError(r)') >= 0, true);
  check('未知错误有独立保留分支', enter.indexOf('凭据已保留，可稍后重试') >= 0, true);
  check('Net.connect Promise 有 .catch 兜底', /\}\)\.catch\(function\(\)/.test(enter), true);
  const logCalls = enter.match(/log\([^)]*\)/g) || [];
  check('续接分支日志不泄漏 token', !logCalls.some(l => l.indexOf('token') >= 0), logCalls.filter(l => l.indexOf('token') >= 0));
  check('TTL 常量仍为 30 天', /const MULTI_SESSION_TTL\s*=\s*30 \* 24 \* 60 \* 60 \* 1000/.test(code), true);
  check('fail-closed 使用 >= 边界', /now - o\.savedAt >= MULTI_SESSION_TTL/.test(code), true);
  check('P66 数值未改', /sword:\s*1\.00[\s\S]{0,80}body:\s*1\.05[\s\S]{0,80}dan:\s*1\.04[\s\S]{0,80}array:\s*1\.06/.test(code), true);
}

console.log(`\n===== 行为级 E2E 结果：PASS=${pass}  FAIL=${fail} =====`);
if (fail > 0) { console.log('存在不符项，不得据此签发 PASS。'); process.exit(1); }
console.log('全部行为断言通过。仍需 GPT 复核 js/net.js 契约与 multiLogout 接线决策；');
console.log('localStorage token 可被 XSS 读取属已知缺口，待服务端会话失效 + HttpOnly 迁移（红线①服务端侧，另排期）。');
