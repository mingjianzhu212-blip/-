'use strict';
/* 把宗门服务跑在独立子进程里，供 _playtest.js 的 sect 场景连。
   为什么不在 _playtest.js 进程内 createSectServer().listen()：
   测试跑页面用的是 execFileSync（同步阻塞），整个 Node 事件循环在 Edge 运行期间被冻住，
   in-process 的 http server 根本没机会 accept/响应 → 页面 fetch 永远挂起。
   子进程有自己独立的事件循环，父进程阻塞时它照常服务，链路才验得了。
   就绪后往 stdout 打一行 `SECT_READY <url>`，父进程读到即开跑；退出时父进程 kill 掉。 */
const path = require('node:path');
const os = require('node:os');
const { createSectServer } = require(path.join(__dirname, '..', 'server', 'sect-server.js'));

const dataFile = process.env.SECT_DATA || path.join(__dirname, '..', 'server', 'data', 'pt_sect.json');
const server = createSectServer({ dataFile, allowedOrigins: [] });
server.on('error', e => {
  process.stdout.write('SECT_ERR ' + String((e && e.message) || e) + '\n');
  process.exit(1);
});
/* 端口 0：让系统挑一个空闲端口，避免与真在跑的 8787 撞车。
   玩家端已禁止把回环地址当默认/手填入口；巡检服务因此绑定本机网卡并播报非回环 IPv4，
   仍只供本机测试访问，不改变生产服务候选逻辑。 */
const lan = Object.values(os.networkInterfaces()).flat()
  .find(x => x && x.family === 'IPv4' && !x.internal);
if (!lan) { process.stdout.write('SECT_ERR 没有可用的非回环 IPv4 网卡\n'); process.exit(1); }
server.listen(0, lan.address, () => {
  process.stdout.write('SECT_READY http://' + lan.address + ':' + server.address().port + '\n');
});
