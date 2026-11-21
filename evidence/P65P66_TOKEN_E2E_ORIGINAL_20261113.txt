// 红线① · token 客户端侧安全加固 · 第四方验收 E2E 校验件（headless，无需浏览器）
// 用途：Muse 在本机 `node TOKEN_HARDEN_E2E.mjs` 真实运行，回传完整输出作原件。
// 机制：以文本方式读取真实 js/game.js，提取 MULTI_SESSION_TTL / multiIsNetworkError /
//       multiLogout / hookMultiStorage 及 multiEnter 续接分支，还原后跑断言。
// 注意：本件只读源文件文本 + 还原局部函数，不加载整份 game.js（避免 DOM 依赖），不修改任何文件。
import fs from 'fs';

const PATH = 'D:/xx-scratch/jiuxiao-analysis/九霄问道/js/game.js';
const code = fs.readFileSync(PATH, 'utf8');

function extract(re, label) {
  const m = code.match(re);
  if (!m) { console.log(`!! 未匹配到 ${label}`); return null; }
  return m[0];
}

console.log('===== 红线① · token 客户端侧加固 · 源值提取（来自真实 js/game.js） =====');

// 1) MULTI_SESSION_TTL 常量
const ttlLit = extract(/const MULTI_SESSION_TTL\s*=\s*[^;]+;/, 'MULTI_SESSION_TTL');
console.log('\n[1] MULTI_SESSION_TTL 源码行：');
console.log('    ' + ttlLit);
const MULTI_SESSION_TTL = eval(ttlLit.replace('const MULTI_SESSION_TTL =', '').replace(/;$/, ''));
console.log('    解析值(ms) =', MULTI_SESSION_TTL, ' ≈', (MULTI_SESSION_TTL / 86400000), '天');

// 2) multiIsNetworkError 函数
const netFn = extract(/function multiIsNetworkError\(r\)\s*\{[\s\S]*?\n  \}/, 'multiIsNetworkError');
console.log('\n[2] multiIsNetworkError 源码：');
console.log('    ' + netFn);
const multiIsNetworkError = eval('(' + netFn + ')');

// 3) multiLogout / hookMultiStorage 存在性
const hasLogout = /function multiLogout\(reason\)/.test(code);
const hasStorage = /function hookMultiStorage\(\)/.test(code);
console.log('\n[3] 统一登出入口 / 多标签钩子：');
console.log('    multiLogout 已定义 =', hasLogout, '； hookMultiStorage 已定义 =', hasStorage);

// 4) multiEnter 续接分支（从 multiEnter 到紧邻的 multiExit）
const enterBlock = extract(/function multiEnter\(\)\{[\s\S]*?\n  function multiExit\(\)/, 'multiEnter');
console.log('\n[4] multiEnter 续接分支关键标记：');
const hasNetDistinction = enterBlock && enterBlock.indexOf('multiIsNetworkError(r)') >= 0;
const hasNetBranch = enterBlock && enterBlock.indexOf('📡 重连未成功（网络/服务暂不可达）') >= 0;
const hasTokenBranch = enterBlock && enterBlock.indexOf('📡 联机会话已失效，请重新登录。') >= 0;
console.log('    含网络/token 区分调用 =', hasNetDistinction, '； 网络分支文案 =', hasNetBranch, '； token 失效分支文案 =', hasTokenBranch);

// 5) multiLoadSession 含 TTL 过期判定
const hasTtlInLoad = code.indexOf('MULTI_SESSION_TTL') >= 0 && /multiLoadSession[\s\S]*?MULTI_SESSION_TTL/.test(code);
console.log('\n[5] multiLoadSession 含 TTL 过期判定 =', hasTtlInLoad);

// 6) XSS：续接失败分支日志不得泄漏 token（不在 log 实参中出现 .token）
let tokenLeak = false;
if (enterBlock) {
  const logCalls = enterBlock.match(/log\([^)]*\)/g) || [];
  for (const lc of logCalls) { if (lc.indexOf('token') >= 0) { tokenLeak = true; break; } }
}
console.log('\n[6] 续接分支 log 实参不含 token（XSS 防护）=', !tokenLeak);

console.log('\n===== 断言（真实求值） =====');
let pass = 0, fail = 0;
function check(name, cond, got) {
  if (cond) { console.log(`  ✓ ${name} = ${JSON.stringify(got)}`); pass++; }
  else { console.log(`  ✗ ${name} = ${JSON.stringify(got)} （期望不符）`); fail++; }
}

check('TTL = 30 天 (2592000000ms)', MULTI_SESSION_TTL === 30 * 24 * 60 * 60 * 1000, MULTI_SESSION_TTL);
check("multiIsNetworkError({code:'TIMEOUT'}) === true", multiIsNetworkError({ code: 'TIMEOUT' }) === true, multiIsNetworkError({ code: 'TIMEOUT' }));
check("multiIsNetworkError({code:'NETWORK'}) === true", multiIsNetworkError({ code: 'NETWORK' }) === true, multiIsNetworkError({ code: 'NETWORK' }));
check("multiIsNetworkError({code:'STREAM_FAIL'}) === true", multiIsNetworkError({ code: 'STREAM_FAIL' }) === true, multiIsNetworkError({ code: 'STREAM_FAIL' }));
check("multiIsNetworkError({code:'JOIN_FAIL'}) === false（服务器拒绝≠网络）", multiIsNetworkError({ code: 'JOIN_FAIL' }) === false, multiIsNetworkError({ code: 'JOIN_FAIL' }));
check("multiIsNetworkError({code:'LEGACY_DISABLED'}) === false（服务器拒登≠网络）", multiIsNetworkError({ code: 'LEGACY_DISABLED' }) === false, multiIsNetworkError({ code: 'LEGACY_DISABLED' }));
check("multiIsNetworkError({error:'服务没响应（超时）'}) === true", multiIsNetworkError({ error: '服务没响应（超时）' }) === true, multiIsNetworkError({ error: '服务没响应（超时）' }));
check('multiIsNetworkError(null) === false', multiIsNetworkError(null) === false, multiIsNetworkError(null));
check('multiLogout 已定义', hasLogout === true, hasLogout);
check('hookMultiStorage 已定义', hasStorage === true, hasStorage);
check('multiEnter 含 网络/token 区分调用', hasNetDistinction === true, hasNetDistinction);
check('multiEnter 含 网络分支文案', hasNetBranch === true, hasNetBranch);
check('multiEnter 含 token 失效分支文案', hasTokenBranch === true, hasTokenBranch);
check('multiLoadSession 含 TTL 过期判定', hasTtlInLoad === true, hasTtlInLoad);
check('续接分支日志不泄漏 token（XSS）', tokenLeak === false, !tokenLeak);

console.log(`\n===== E2E 结果：PASS=${pass}  FAIL=${fail} =====`);
if (fail > 0) { console.log('存在不符项，请结合 game.js 源码与 GPT 终审核对。'); process.exit(1); }
else { console.log('全部 token 客户端侧加固断言通过。说明：localStorage 注入可读风险属已知缺口，待服务端会话失效+HttpOnly 迁移（红线①服务端侧，另排期）。'); }
