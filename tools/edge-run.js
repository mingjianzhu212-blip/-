'use strict';
/* 测试脚本的统一 Edge 入口：参数与原来的 msedge 命令行完全一致。
   Edge 155 的 --dump-dom / --screenshot 在本机静默失效（详见 edge-cdp.js 头注），
   这里改用同一个 Node 可执行文件去跑 CDP 薄壳，调用方只需把 execFileSync(EDGE, args)
   换成 execEdge(args)。
   重试一次：同一 profile 连续起停时偶尔会撞上上一进程还没完全退出（profile 锁），
   失败后等 1.2 秒再来一遍即可；测试脚本本身不并发，重试不会掩盖页面内的真错误。 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const CLI = path.join(__dirname, 'edge-cdp.js');
const ENV = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
const sleepSync = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/* 调用方常把 stdio 整个设成 ignore（截图不需要 stdout），这会把薄壳的错误信息一起吞掉。
   stdout 按调用方给的来，stderr 一律改成 pipe，只用于失败时回读。 */
function withStderrPiped(stdio){
  if (!stdio) return ['ignore', 'pipe', 'pipe'];
  if (typeof stdio === 'string') return [stdio, stdio, 'pipe'];
  const s = stdio.slice();
  if (!s[2] || s[2] === 'ignore') s[2] = 'pipe';
  return s;
}

function run(args, opts) {
  const o = Object.assign({}, opts, { env: ENV, stdio: withStderrPiped(opts && opts.stdio) });
  return execFileSync(process.execPath, [CLI].concat(args), o);
}

function execEdge(args, opts) {
  try {
    return run(args, opts);
  } catch (e) {
    /* 截图类调用把 stderr 设成了 ignore，薄壳的失败原因就凭空消失了，只剩一个 status=1。
       重试前把 stderr 尾巴补到本进程 stderr，排查时看得见是端口没起来还是页面报错。 */
    if (e && e.stderr) process.stderr.write('[edge-run] ' + String(e.stderr).slice(-400) + '\n');
    sleepSync(1200);
    return run(args, opts);
  }
}

module.exports = { execEdge };
