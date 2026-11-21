# B-34 / B-35 批 1 实施与验收对照报告

> 依据制作人裁定「批 1：有条件批准实施准备与实施」第 1–4 条。
> 状态：✅ 已完成实施 + 真实浏览器验收。未修改任何 H3 结算代码，未扩大文件白名单。

## 一、裁定要求 vs 落地情况

| 裁定条款 | 落地情况 | 结论 |
|---|---|---|
| 1. 优先用现有经核验音频资源，不得引用不存在的 wav | B-34：`audio.js` 的 `click.wav`/`levelup.wav` 替换为既有 `audio/kenney/metal_click.ogg`、`audio/kenney/chop.ogg`（OGG 魔法字节 `OggS` 已核验） | ✅ |
| 2. 无配置的 file:// 不发起宗门探活；部署环境保留连接能力 | B-35：`SECT.candidates()` 在 `file://` 且无 `?sect`/已存地址/官方常驻地址时返回 `[]`；http(s)/已配置路径保持原探活 | ✅ |
| 3. 不得顺手改 H3 结算代码、不得扩大白名单 | diff 仅触及 `candidates()` 一处 early-return 与 `audio.js` 音频对象，未触碰结算代码，未新增任何地址白名单 | ✅ |
| 4. 针对性浏览器验收，提交实际错误记录及修改前后对照 | 见第三节真实 Edge CDP 采集（`before.json` / `after.json`） | ✅ |

## 二、改动文件与最小化 diff

### `js/audio.js`（B-34）
```
 5,6c5,6
 <  *           audio/click.wav（按钮点击声）
 <  *           audio/levelup.wav（突破 / 镇妖塔胜利提示声）
 ---
 >  *           audio/kenney/metal_click.ogg（按钮点击声，既有经核验资源，替换原不存在的 click.wav）
 >  *           audio/kenney/chop.ogg（突破 / 镇妖塔胜利提示声，既有经核验资源，替换原不存在的 levelup.wav）
 17,19c17,19
 <     bgm:     new Audio('audio/bgm.mp3'),       /* 古风背景音乐 */
 <     click:   new Audio('audio/click.wav'),     /* 按钮点击声 */
 <     levelup: new Audio('audio/levelup.wav'),   /* 突破 / 镇妖塔胜利 */
 ---
 >     bgm:     new Audio('audio/bgm.mp3'),                 /* 古风背景音乐 */
 >     click:   new Audio('audio/kenney/metal_click.ogg'),  /* 按钮点击声（既有经核验资源） */
 >     levelup: new Audio('audio/kenney/chop.ogg'),         /* 突破 / 镇妖塔胜利（既有经核验资源） */
```
> 仅 `new Audio(...)` 资源路径与头注释变更；`playClick`/`playLevelUp`/`applyMute` 等引用 `this.click`/`this.levelup`，无硬编码 wav，无需改动。

### `js/game.js`（B-35，位于 `SECT.candidates()`）
```
 10736a10737
 >     let q = '';
 10738c10739
 <       const q = new URLSearchParams(search).get('sect');
 ---
 >       q = new URLSearchParams(search).get('sect');
 10741a10743,10748
 >     /* B-35 裁定：无配置的 file:// 环境不发起宗门服务探活。
 >        仅当 协议为 file: 且 无 ?sect、无已存地址、无官方常驻地址 时，返回空候选（不探活）。
 >        - 已配置地址（?sect 或手填地址）仍按优先级探活；
 >        - http(s) 部署保持原有同源 + DEF_HOST 探活能力；
 >        - 不扩大白名单、不改 H3 结算代码。 */
 >     if(proto === 'file:' && !q && !stored && !PUB_HOST) return out;
```
> 仅提升 `q` 作用域 + 新增一处 early-return；未改动 `ping`/`firstAlive`/`bootInner` 等；空候选经既有 `if(!okHost){ ready=false; online=false; render(); startPoll(); return; }` 降级路径安全处理（不发起任何 `fetch('/api/sect/health')`，无报错）。

## 三、真实浏览器验收（修改前后对照）

方法：独立 `--user-data-dir` 启动无头 Edge（155），CDP 捕获 `Runtime.exceptionThrown`、`Log.entryAdded`(level=error)、`Network.loadingFailed`、`Network.responseReceived`(status≥400)，导航到 `file://index.html`（双击运行路径），捕获窗口 6s。脚本：`tools/b34b35-accept.mjs`。

### before（修复前，备份状态）
- pageErrors = **0**
- consoleErrors = **3**：`audio/click.wav` 与 `audio/levelup.wav` 的 `net::ERR_FILE_NOT_FOUND`，以及 `http://localhost:8787/api/sect/health` 的 `net::ERR_CONNECTION_REFUSED`
- failedRequests = **3**：同上两类失败（2 个 `Media` wav + 1 个 `Fetch` 宗门探活）
- 即 file:// 双击时**唯一**的报错正是 B-34 与 B-35 所指问题，无其他噪音。

### after（修复后，当前落盘）
- pageErrors = **0**；consoleErrors = **0**；failedRequests = **0**；badResponses = **0**
- wav = **0**；sect = **0**；other = **0**
- 原始 JSON：`tools/evidence/b34b35/before.json`、`tools/evidence/b34b35/after.json`

## 四、部署连接能力保留（candidates 单测）

直接从真实 `js/game.js` 抽取 `candidates()` 源码运行（`tools/b34b35-candidates-test.mjs`），合成各类环境：

| 场景 | 候选结果 | 结论 |
|---|---|---|
| file:// 无配置 | `[]` | ✅ B-35：不探活 |
| http 部署 | `["http://localhost:9000","http://localhost:8787"]` | ✅ 保留同源+DEF_HOST |
| https 部署 | `["https://play.example.com","http://localhost:8787"]` | ✅ 保留同源+DEF_HOST |
| file:// + `?sect=` | `["http://sect.test/gate","http://localhost:8787"]` | ✅ 已配置优先 |
| file:// + 已存地址 | `["http://saved.host/sect","http://localhost:8787"]` | ✅ 已存地址优先 |

5/5 通过：修复**仅**收窄了 file:// 无配置这一条路径，未削弱任何部署/已配置场景的探活能力。

## 五、资源核验
- `audio/kenney/metal_click.ogg`（13615 字节）、`audio/kenney/chop.ogg`（9370 字节）均存在，头部 `OggS` 有效。
- `audio/bgm.mp3`（8500453 字节）不受影响，仍原样加载。

## 六、回滚点
- `js/audio.js.bak_20261106_145501`
- `js/game.js.bak_20261106_145501`
- `tools/evidence/b34b35/fixed_audio.js`、`tools/evidence/b34b35/fixed_game.js`（修复版 LF 副本，用作对照基准）

## 七、结论
B-34、B-35 已按裁定实施并**通过真实浏览器验收**：file:// 无配置双击运行路径下，既不再引用不存在的 wav（改用既有经核验 ogg），也不再向 `localhost:8787` 发起宗门探活；部署环境/已配置地址的原有连接能力完整保留。未触碰 H3 结算代码、未扩大白名单。
