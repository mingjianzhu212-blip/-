# 宗门服务上线 runbook（A 方案 · Cloudflare 隧道验证）

> 目的：让**第二个真人**能连上你的山门，验证「宗门互助」这条联网链路真的通。
> 这是**验证**，不是长期部署——隧道地址每次重启都会变、你关机就断。
> 验证 OK 后再决定要不要转 B 方案（租 VPS 常驻，见文末）。
>
> 全程免费、不用注册 Cloudflare 账号、不用租服务器。

---

## 0. 先搞清楚：要暴露的是什么

只暴露**服务端**（本机 8787 那个 API）。游戏本身各人在自己电脑上用 `file://` 打开就行——
`file://` 页面的 origin 是 `null`，服务端 CORS 对 `null` 恒放行，所以不用额外托管游戏、也不用改白名单。

- 服务端入口：`server/sect-server.js`，默认监听 `127.0.0.1:8787`。
- 客户端默认地址：`js/game.js` 里 `DEF_HOST = 'http://localhost:8787'`（各人连自己本机，等于单机）。
- 官方常驻地址：`js/game.js:6971` 的 `PUB_HOST = ''`（**现在是空的**，所以没人能自动连到公共服务）。
  隧道地址是临时的、每次会变，**不要**写死进 `PUB_HOST`；等 B 方案定了固定地址再填那一行。

---

## 1. 下载 cloudflared（放 D 盘）

Git Bash 里执行：

```bash
mkdir -p /d/九霄问道工具
curl -L -o /d/九霄问道工具/cloudflared.exe \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
```

确认下好了（应有几十 MB）：

```bash
ls -la /d/九霄问道工具/cloudflared.exe
```

---

## 2. 起宗门服务（终端 A，全程别关）

```bash
cd "D:/xx-scratch/jiuxiao-analysis/九霄问道"
ELECTRON_RUN_AS_NODE=1 "/d/Microsoft VS Code/Code.exe" server/sect-server.js
```

看到这一行就对了：

```
宗门互助服务已启动：http://127.0.0.1:8787
```

> 说明：本机 Node 不在 PATH，一律借 VS Code 自带的 Electron 当 Node 跑（`ELECTRON_RUN_AS_NODE=1`）。
> 数据落在 `server/data/sect.json`。**这个终端保持开着**，关了服务就没了。

---

## 3. 起隧道（终端 B，全程别关）

**另开一个** Git Bash 终端：

```bash
/d/九霄问道工具/cloudflared.exe tunnel --url http://localhost:8787
```

它会刷一堆日志，其中有一行是给你的公网地址：

```
Your quick Tunnel has been created! Visit it at:
https://<随机一串>.trycloudflare.com
```

**把这条 `https://<随机一串>.trycloudflare.com` 整条复制下来。** 这就是所有人都能连的山门地址。
**这个终端也保持开着。**

---

## 4. 你自己先连上验证

1. 双击 `index.html` 打开游戏。
2. 进 **设置**，找到「宗门服务地址」那一栏。
3. 把刚复制的 `https://<随机一串>.trycloudflare.com` 粘进去，点 **重新连接**。
4. 看那行状态字：应变成绿色的 **「已连上：https://<随机一串>.trycloudflare.com」**。

> 这行状态是专门给你验证用的：连没连上、连的是哪个地址，一眼可见，不用开控制台猜。
> 若显示「未连接（每 25 秒自动重试）」，检查终端 A/B 是否都还开着、地址有没有粘错（别带多余空格）。

---

## 5. 把游戏给朋友

1. 把整个 `xiuxian` 文件夹压成 zip 发给朋友（微信/网盘都行）。
2. 朋友解压后双击 `index.html` 打开游戏。
3. 朋友进 **设置** → 「宗门服务地址」填**同一条** `https://<随机一串>.trycloudflare.com` → 点 **重新连接**。

> 省事版：如果朋友的游戏是从某个网址打开的（不是本地文件），可以在网址后面加
> `?sect=https://<随机一串>.trycloudflare.com`，游戏会自动连、不用手填。
> 但**本地 `file://` 打开不支持带 URL 参数**，所以本地玩还是走「设置里手填」这条路。

---

## 6. 验证清单（这几条都成立 = 链路通了）

- [ ] 你和朋友的设置里都显示绿色「已连上：https://…trycloudflare.com」
- [ ] 宗门面板「山门气象 · 在册同门」≥ 2；「在场同门」名录里能看到你俩的道号
- [ ] 一方点【发起求助】，另一方的求援榜里出现这条
- [ ] 另一方点【护法】成功，事后能在面板领到灵石
- [ ] 发起方突破时结算到护法加成（面板写「护法 +7% 成功率」这类）
- [ ] 世界频道（传音）里能看到护法播报

> 这套清单的**机器版判据**已经常驻在自动化测试里：`node _playtest.js sect`
> （在 Node 侧起一个真 sect-server 子进程，两个 pid 真发 HTTP 互相护法、结算、领取，9 项断言）。
> 手动验证前可以先跑它确认代码侧没问题。

---

## 7. 三个必须知道的风险

1. **地址公开 + 本轮没鉴权**：谁拿到这条 `trycloudflare.com` 就能读写这个山门，
   甚至冒充别人（服务端目前只校验 pid 格式，不验明身份）。
   **只发给信得过的朋友，绝对别贴到论坛/群/直播间。**
   → 鉴权是**已知待办**，等定了常驻方案后紧接着补（见 HANDOVER §10）。
2. **临时隧道，你关机就断**：`trycloudflare.com` 地址每次重启 `cloudflared` 都会变，
   你电脑或任一终端一关，所有人掉线。只适合验证，不适合长期。
3. **别把隧道地址写进 `PUB_HOST`**：它会变，写死了下次就失效。`PUB_HOST` 只填 B 方案的固定地址。

---

## 8. 验证成功后 → B 方案（常驻，可选）

如果你希望「以后所有玩家打开游戏就自动在山门里，你不用天天开着电脑」：

1. 租一台最便宜的 VPS（阿里云轻量 ~38–68 元/年，24/7 在线、有固定公网地址）。
2. 把 `server/sect-server.js` 部署上去常驻（`SECT_HOST=0.0.0.0`、固定 `SECT_PORT`，配好开机自启）。
3. 拿到固定地址后，把它填进 `js/game.js:6971` 的 `PUB_HOST` **那一行**——
   从此所有玩家零配置自动直连山门，不用每个人手填。
4. **紧接着补鉴权**（公开常驻前必须做）。

> 备选 C 方案：重写托管到 Qoder Sites。但 Sites 只能跑 Deno 边缘函数 + PostgreSQL，
> 跑不了现在这个 Node 长进程，得把服务端整个重写，工作量大、不划算，除非你完全不想碰 VPS。
