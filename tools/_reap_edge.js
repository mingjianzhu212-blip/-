'use strict';
/* 残留的无头 Edge 清扫器（第 91 轮）。
   为什么要它：edge-cdp.js 收尾已经按进程树杀（taskkill /T /F），但脚本被 Ctrl-C、
   被 timeout 杀掉、或机器休眠时，仍会留下没爹的 gpu / renderer 子进程。实测这些僵尸
   会跟下一次启动抢 CPU，把虚拟时间饿死——症状是「diag 永远不出来」，看起来像页面 bug。

   只杀「命令行里带我们自己的 profile 路径」的 msedge.exe：
     D:/xx-scratch 下的 profile、xxcdp<pid>_<ts> 临时 profile。
   用户日常那个 Edge（profile 在 AppData\Local\Microsoft\Edge\User Data）一个都不碰。

   用法：
     node tools/_reap_edge.js          清扫并打印
     node tools/_reap_edge.js --dry    只列不杀
*/
const { execFileSync } = require('node:child_process');

const MARKERS = ['xx-scratch', 'xxcdp', 'edge-profile'];
const dry = process.argv.includes('--dry');

function list() {
  const ps = "Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | " +
    "Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress";
  let out = '';
  try {
    out = execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 1 << 24 });
  } catch (e) { return { err: e && e.message || String(e), rows: [] }; }
  if (!out.trim()) return { rows: [] };
  let rows;
  try { rows = JSON.parse(out); } catch (e) { return { err: '解析失败', rows: [] }; }
  return { rows: Array.isArray(rows) ? rows : [rows] };
}

const { err, rows } = list();
if (err) { console.error('清扫器跑不起来：' + err); process.exit(2); }
const hits = rows.filter(r => r && r.CommandLine &&
  MARKERS.some(m => r.CommandLine.indexOf(m) >= 0));

if (!hits.length) { console.log('残留无头 Edge：0 个'); process.exit(0); }
hits.forEach(r => console.log((dry ? '[dry] ' : '[kill] ') + 'pid=' + r.ProcessId + '  ' +
  String(r.CommandLine).slice(0, 120)));
if (dry) process.exit(0);
let dead = 0;
hits.forEach(r => {
  try {
    execFileSync('taskkill', ['/PID', String(r.ProcessId), '/T', '/F'],
      { stdio: 'ignore', timeout: 8000 });
    dead++;
  } catch (e) {}
});
console.log('残留无头 Edge：' + hits.length + ' 个，清掉 ' + dead + ' 个');
