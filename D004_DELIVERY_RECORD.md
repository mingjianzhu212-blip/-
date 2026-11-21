# D-004 交付记录（独立审查已通过）

> 记录时间：2026-11-08
> 结论：**D-004 审查通过，可交付。**
> 独立审查方：ChatGPT 网页版（六轮往返，每轮均真实取回正文；正文落盘见 §6）
> 本文件是交付留痕，不是新功能的方案文档。

---

## 1. 最终产物与回滚点

### 1.1 送审版本 SHA256

| 文件 | SHA256 | 说明 |
|---|---|---|
| `js/game.js` | `7b0e3fab36c4500cfd3978d423ffd62c81757eb99bfc80a2c09e6a8184046b22` | 主改动 |
| `js/router.js` | `07341d3fee79fe82b0ae8dc3b6ad23a8dd758a330d663c3439149bccb942d17f` | 模态关闭判空 + 孵化清理 |
| `index.html` | `fc4009ee410a344e94c3292a63f3360c0e4b24df8116b417ebb59e1e8c664ff0` | 存档备份面板文案说明 |
| `verify.js` | `5476b2eaf953b08eaa4b23ceab1642a01bea0f438637de2ce60ae17a31dd4666` | 陈旧断言对齐 B-35 |
| `tools/d004-audit-fixes.test.mjs` | `5164e75de3a5afb23930d2702149dd3aeee8d3bfcb4f6df12f7197a1397cf438` | 新增专项（28 项） |
| `tools/d004-reincarnate-conservation.test.mjs` | `fbd8baadca6a1e329c5bddf2708b060f7325c6a48829d1cd5ba24b433f8cca82` | 新增专项（4 项） |
| `tools/d004-corrupt-export.test.mjs` | `041db72a3e7a33f1777be81802b842b4ffc6ac5c5234f09b9706aaceb148a04d` | 新增专项（12 项） |
| `tools/d004-save-panel-layout.js` | `2cf201d743233ba48ab818a36f3776873127cd619101d5b7cf4d14fa11ff22e4` | 新增布局检查（36 项） |

### 1.2 回滚点（改前备份，`cp -p` 原样保留 mtime）

- `js/game.js.bak_20261108_160625_preD004`（基线 SHA `eed09e42…`，661,916 字节）
- `js/router.js.bak_20261108_160625_preD004`（基线 SHA `4b63a69d…`）

回滚方式：把这两个文件覆盖回原位即可；`verify`/`verify_break`/`_playtest` 均不依赖本轮新增文件。

---

## 2. 五项交付门禁与最终裁定

| 门禁 | 内容 | 终审裁定 |
|---|---|---|
| P0-1 | 主循环异常隔离（双层 try/finally + 保存成功才推进 lastSave） | **通过** |
| P0-2 | 存档读取异常保护 + 原文恢复/导出（含来源优先级） | **通过** |
| P0-3 | 转世装备跨刷新守恒（满包 + 三槽 → 转世 → 存盘 → 读档） | **通过** |
| P0-4 | 数字字段合法性 + `last` 时间戳校验 | **通过** |
| P0-5 | 导入冻结期的可靠保护（常驻横幅 + 离开提醒） | **通过** |

---

## 3. 本轮实际改了什么

### 3.1 与原计划一致的部分（修真实缺陷）

| # | 缺陷 | 性质 |
|---|---|---|
| 1 | `showItemDetail` 的 `#it-acts` 静态节点 + `d_binded` 一次性绑定 + 闭包捕获首次 `it/idx` → 打开第二件物品后寄售/丢弃/装备作用到**错误物品** | 数据破坏级 |
| 2 | D-003 重构误删 `renderMarket` 的 `mkFlash` 消费段 → 坊市购入墨晕高亮消失 | 我上一轮引入的回归 |
| 3 | `tickLoop` 无错误边界 → 任一子系统抛错导致 UI 永久冻结 + 存档停摆 | 高 |
| 4 | `load()` 迁移抛错 → `return false` → boot 判"无存档" → 创角 `save()` 覆盖唯一存档 | 一次 bug 永久毁档 |
| 5 | 转世 `resetForNewLife` 清空三槽，除遗物外两件已装备法宝凭空销毁 | 不可恢复的数据丢失 |
| 6 | `resetAll` 漏清 `multiWins`/`multiCreditedRuns`/`NpcMemory` → 重开后崔九"首次闯通"永不触发、NPC 仍认得上一档 | 跨档污染 |
| 7 | `S.multiWins` 不持久化 → 每次刷新重放"首次通关"事件 | 叙事重复 |
| 8 | 七日签到第 6 天蛋篓满 → 既丢蛋又打印"签到成功：妖兽蛋×1"的假日志 | 体验 + 误导 |
| 9 | `S.affix` 读档不去重 → 客户端词条可超服务器 `AFFIX_POW_CAP_PCT=22` 口径 | 单机/联机口径分叉 |
| 10 | 数字白名单只校验 `isFinite` 不钳负值（`dao` 为负 → `expRate()` 变负 → 挂机修为倒退） | 数值异常 |
| 11 | 死代码：重复 `bindRerollModal`、`#xx-reset` 死绑定（全库无此 id） | 清理 |
| 12 | 判空判错对象：`renderAdventure` 4 元素、`showHatchCeremony` 的 `stage`、`router.bindModals` 判按钮却用 modal | 潜在崩溃 |
| 13 | 洗练 `result[i]` 未判空 → 抛在 setTimeout 里 → `rrFinish` 不执行 → 洗练按钮永久锁死 | 功能死锁 |
| 14 | 关窗不清孵化定时器 → 关窗后仍响音效 | 体验瑕疵 |

### 3.2 过程中**主动撤销**的改动（重要留痕）

- **破境丹"点突破自动吃丹"**：我一度按"提示与机制矛盾"把它改成自动消耗。独立审查判定为**未经授权的玩法变更**，且带 3 个真实 bug（必定成功时白吃、`>=` 会吃掉高阶丹、无 opt-out）。**已全部撤销**，改为纯文案桥接（提示"点开背包服食"），`autoPickBreakPill` 仅用于文案且改为精确 `seg === needSeg` 匹配，不参与任何消耗。
- **我自己引入又被审查抓回的新 bug**：`renderRank` 自动滚动把容器写成 `#xx-rank`（那是境界名），实际是 `#xx-hero-rank` → 已改。

### 3.3 未做的（按审查裁定属后续事项，不塞回本批次）

1. 侧车键登记清单（键名→模块→生命周期→resetAll→导入导出策略）—— 审查判"不阻断，后续治理"。
2. 客户端词条上限是否显式对齐服务器 22% —— 审查判"单机交付不阻断；多人战力正式开放前必须做跨端对拍"。
3. 导出/导入不搬运 5 个侧车键（`jxwd_daily_v1` / `jxwd_npc_memory_v1` / `jxwd_npc_visit_v1` / `hasFinishedTutorial` / `xiuxian_best`）—— 已在 `index.html` 面板里**明确告知玩家**，属审查接受的处理方式。
4. `rank` 那行的 `|0` —— 审查判"先限幅再取整，不构成溢出，不要求统一"。
5. 负数字段的诊断日志（当前只钳制不记录）—— 审查判"钳制正确即可，日志后续补"。

---

## 4. 测试证据（全部真实执行）

| 套件 | 命令 | 结果 |
|---|---|---|
| 语法 | `node --check js/game.js` / `js/router.js` / `verify.js` | 全部 exit 0 |
| 端到端 | `node verify.js` | **896 / 0** |
| 边界异常 | `node verify_break.js` | **120 / 0** |
| 沈碑数据层 | `node verify_npc.js` | **60 / 0** |
| 沈碑 UI | `node verify_npc_ui.js` | **260 / 0** |
| 真人点击 | `node _playtest.js` | **253 / 0**（33 场景） |
| 六视口布局 | `node _layout_check.js` | 六视口 重叠=0 出屏=0 撞栏=0 印文越界=0 |
| 专项 A | `node --test tools/d004-audit-fixes.test.mjs` | **28 / 0** |
| 专项 B | `node --test tools/d004-reincarnate-conservation.test.mjs` | **4 / 0** |
| 专项 C | `node --test tools/d004-corrupt-export.test.mjs` | **12 / 0** |
| 专项 D | `node tools/d004-save-panel-layout.js` | **36 / 0** |
| B-35 专项 | `node tools/b34b35-candidates-test.mjs` | 5 / 0 |

### 4.1 三个新增测试的测法（避免"测试≠覆盖故障路径"）

- **专项 A（28 项）**：把 `game.js` 里目标函数的**真实源码**按大括号配平截出来，灌进 `node:vm` 执行；断言行为而不是断言"代码里写了这句话"。
- **专项 B（4 项）**：满背包 + 三槽全装备 → 转世 → `JSON.stringify` 存盘 → 按真实截断表达式读档，**按物品 id 的 multiple-set 做 `deepStrictEqual`**（不是比长度）；另有一条**反证**：用旧上限跑同组数据，断言恰好丢 `EQUIP_SLOTS.length` 件。
- **专项 C（12 项）**：`localStorage.setItem` 一律抛 `QuotaExceededError` 模拟"备份键写不进"，验证原文留在内存、导出内容与原始 raw **逐字节一致**、且"A 旧备份 vs B 本次原文"时导出的是 **B**。
- **专项 D（36 项）**：注入探针 → headless Edge → 量真实 `getBoundingClientRect`，四个视口 × 六条断言，含"三个按钮 + 最长文案"的最坏情况。

---

## 5. 独立审查记录（六轮，每轮均取回正文）

| 轮次 | 判定 | 主要意见 → 处置 |
|---|---|---|
| 1 | 需修改后交付（P0×5 / P1×4 / P2×4） | 全部核实；其中"破境丹应自动吃"被我误判为改进，后续被纠正 |
| 2 | 仍需修改（4 项门禁） | `getItem()` 抛异常时 `if(raw)` 漏保护 / `\|0` 溢出 / 一次性 toast 不够 / 需逐物品比对 → 全部成立，全改 |
| 3 | 仍需修改（2 项） | 备份键也失败时无可用恢复路径 / `last` 无校验 → 全改 |
| 4 | 仍需修改（1 项） | 需证明"能真正导出原文" → 新增通用导出通道 + 12 项测试 |
| 5 | 仍需修改（1 项） | **原文来源优先级错误**：会导出旧备份 A 而非本次 B → 我的实现错误，已改 |
| 6 | **可交付** | 五项门禁全部通过 |

审查正文落盘目录：`C:/Users/35695/WorkBuddy/2026-10-25-12-47-31/chatgpt-link-verify/`
- `d004-review-body.md`（第 1 轮）
- `d004_rereview_reply.txt`（第 2 轮）
- `d004_final_reply.txt`（第 3 轮）
- `d004_r4_reply.txt`（第 4 轮）
- `d004_r5_reply.txt`（第 5 轮）
- `d004_r6_reply.txt`（第 6 轮，可交付）

会话：`https://chatgpt.com/c/6af034cd-9c74-83ee-879f-de93f77d5dea`

**证据边界（审查方自己声明，如实转述）**：审查方未在本地重算 SHA256、未亲自运行测试；其裁定基于我提交的代码片段与测试结果。SHA 与测试输出以本文件 §1.1 与 §4 为准。

---

## 6. 本轮的方法论教训（写给后续接手的人）

1. **`dataset.d_binded` 式的一次性绑定，绝不能捕获当次参数。** 全库排查结论：`showItemDetail` 是该模式**唯一实例**（`index.html` 常驻容器只有 8 个，其余 `#xx-*` 随 `router.enter()` 重建，守卫生命周期 = 一次进页）。
2. **改延时回调里取节点时，必须核对真实 id。** 我把榜单容器写成 `#xx-rank`（境界名）而实际是 `#xx-hero-rank`，功能静默失效。
3. **不要"顺手"把玩法改好。** 破境丹事件：提示与机制矛盾是事实，但"自动吃丹"是玩法变更，需要授权；正确做法是改文案。
4. **测试断言也会陈旧。** `verify.js` 的 `candFile` 期望值停在 B-35 之前，长期假红；对齐裁定后 896/0。
5. **"只写不读"等于没做。** `xiuxian_save_corrupt` 第一版写完没人读，等于死库存；必须同时给出消费路径与测试。

---

## 7. 下一步（单一建议，不自动执行）

D-004 已收口。审查方明确建议：**把精力转回玩家体验与留存**，不要让审计本身变成主要工作。
下一个可选方向见 `GAME_ROADMAP.md` 的"下一步任务队列"，其中与玩家体验直接相关的是 **P2 镇妖塔玩法升级（随机事件/机关/分支/Boss）** —— 但这属于玩法范围，需制作人定方向。

---

# D-005 交付记录（独立审查已通过）

> 记录时间：2026-11-08
> 结论：**D-005 审查通过，可交付。**
> 定位：D-004 收口后，继续修「审查判不阻断但确实存在」的一批问题。未回头改动 D-004 已通过的门禁。

## 1. 最终 SHA256

| 文件 | SHA256 |
|---|---|
| `js/game.js` | `d5a53938e5fb1cf03107a1c4761170e09b7abdd9fd807792f5fb70941fcb49ab` |
| `js/router.js` | `07341d3fee79fe82b0ae8dc3b6ad23a8dd758a330d663c3439149bccb942d17f` |
| `index.html` | `088093e5d20db5807e485022895820aed1d28912dd0d96ecfc60c1d20abd304d` |
| `verify.js` | `5476b2eaf953b08eaa4b23ceab1642a01bea0f438637de2ce60ae17a31dd4666` |
| `tools/d005-followup.test.mjs` | `5523dfc5576581509a212bd5044ff86d96206b3c137e4fc502b19b67ebf28237` |
| `tools/d004-audit-fixes.test.mjs` | `5164e75de3a5afb23930d2702149dd3aeee8d3bfcb4f6df12f7197a1397cf438` |
| `tools/d004-corrupt-export.test.mjs` | `041db72a3e7a33f1777be81802b842b4ffc6ac5c5234f09b9706aaceb148a04d` |
| `tools/d004-reincarnate-conservation.test.mjs` | `fbd8baadca6a1e329c5bddf2708b060f7325c6a48829d1cd5ba24b433f8cca82` |
| `tools/d004-save-panel-layout.js` | `2cf201d743233ba48ab818a36f3776873127cd619101d5b7cf4d14fa11ff22e4` |

回滚点不变：`js/game.js.bak_20261108_160625_preD004`（基线 `eed09e42…`）、`js/router.js.bak_20261108_160625_preD004`。

## 2. 八项改动

| 项 | 内容 | 性质 |
|---|---|---|
| A | `tryImport()` 搬完删源键（原先每次无存档开局都弹"检测到游戏厅存档"） | 真实体验 bug |
| B | `bossKilled` 只收 `BEASTS` 表里的 id（原先数组与任意键名都收） | 脏档面 |
| C | `acts` **白名单化**（只保留 5 个正式键）+ 非负整数钳制；`wuPaid` 钳制 | 脏数据 / 免费悟道值口子 |
| D | `letters[].rw` 奖励钳制（`wisdom ≤ 200 / stone ≤ 3 / herb ≤ 9`） | 手改档可白拿灵石 |
| E | 转世 / 重开清 `rrLocks`、`farmSel` | UI 态跨世残留 |
| F | `spendFloat` 并发上限 1（新的出现先结算旧的） | 资源生命周期 |
| H | 坊市墨晕按 `data-slot` 定位（原先按行序，缺货会闪错行） | 视觉错位 |
| J | 导出/导入搬运 5 个侧车键（`__sidecar` 携带字段） | **换设备丢数据** |

## 3. J 项关键实现：主档与侧车显式分离

```js
function writeImportedSave(obj){
  if(!obj || typeof obj !== 'object') return { raw: '', sideN: 0 };
  const side = obj[SIDECAR_FIELD];
  if(side !== undefined){ try{ delete obj[SIDECAR_FIELD]; }catch(e){} }
  const saveObj = Object.assign({}, obj);        /* 再拷一层，确保落盘对象里没有该键 */
  delete saveObj[SIDECAR_FIELD];
  const raw = JSON.stringify(saveObj);           /* 先摘键、后序列化 */
  localStorage.setItem(SAVE_KEY, raw);           /* 失败由调用方 catch */
  const sideN = restoreSidecar(side);            /* 主档写成功后才恢复 */
  return { raw: raw, sideN: sideN };
}
```

顺序是硬要求：**先摘键、再 stringify、再 setItem、最后恢复侧车**。
反过来（先 stringify 再 delete）会让 `raw` 仍带侧车，随每次 `save()` 滚回主档。

`__sidecar` 是主档对象上的额外键，旧版 `load()` 逐字段白名单会忽略它 → 旧版读新备份不报错；
新版读旧备份（无该字段）时 `restoreSidecar(undefined)` 返回 0，本机记录保持不动。

## 4. 测试证据（全部真实执行）

| 套件 | 结果 |
|---|---|
| `node --check js/game.js` / `router.js` / `verify.js` | exit 0 |
| `node verify.js` | **896 / 0** |
| `node verify_break.js` | **120 / 0** |
| `node verify_npc.js` | **60 / 0** |
| `node verify_npc_ui.js` | **260 / 0** |
| `node _playtest.js` | **253 / 0**（33 场景） |
| `node tools/d004-save-panel-layout.js` | **36 / 0**（四视口，含三按钮最坏情况） |
| `node --test tools/d005-followup.test.mjs` | **26 / 0** |
| `node --test tools/d004-audit-fixes.test.mjs` | **28 / 0** |
| `node --test tools/d004-corrupt-export.test.mjs` | **12 / 0** |
| `node --test tools/d004-reincarnate-conservation.test.mjs` | **4 / 0** |

### 4.1 两条最关键的断言（不是查字符串，是真跑）

**J-1 落盘隔离**：抽出 `js/game.js` 里真实的 `save()` 函数本体，配齐 `inited=true / saveBlocked=false / frozenForImport=false`，
在 vm 里真正调用，然后读 `localStorage` 实际写入的字符串：
```js
assert.strictEqual(ok, true, '真实 save() 必须成功');
assert.strictEqual(parsed.__sidecar, undefined);
assert.strictEqual(Object.prototype.hasOwnProperty.call(parsed, '__sidecar'), false);
assert.strictEqual(persisted.indexOf('__sidecar'), -1, '落盘字符串里连这个字串都不该有');
assert.strictEqual(store.xiuxian_best, '9', '侧车本身仍在自己的键里');
```
（`frozenForImport` 的桩会主动抛错 —— 若真实 save 走进冻结分支，测试立即失败而不是静默 false。）

**C 项白名单化**：跑行为而不是查源码：
```js
const r = readActs({ sit: 3, herb: 'x', train: -5, enlight: 10, ponder: 1.7, hacker: 999 });
// → 只有 5 个正式键；字符串归零；负数归零；小数取整；未知键丢弃
```

## 5. 一处**主动放弃**的改动（诚实留痕）

审查代理曾提 `renderForge` 每秒重建 36 行是"性能/GC 压力"。
我写性能探针实测，但 headless + `--virtual-time-budget` 下 `performance.now()` 不可信（跑 600 次仍报 `0.00ms/call`，虚拟时间把计时器跳过），拿不到可信数字。
因此**没有改** `renderForge`：它是性能优化不是 bug，且只在炼器页可见时执行，`_playtest` 253 项交互全过无卡顿。
在没有可信测量的前提下改渲染结构，风险大于收益。探针脚本已删除，不留半成品。
（审查方认可该判断，并给了后续可信测法：真机 DevTools Performance + 4× CPU Throttling，看 Long Task 与主循环累计占比。）

## 6. 独立审查记录

| 轮次 | 判定 | 主要意见 → 处置 |
|---|---|---|
| D-005 第 1 轮 | 仍需修改（1 项阻断） | J 项"delete 后仍写原始 raw" → 实际是我送审材料漏贴了 `raw = JSON.stringify(r.obj)` 一行；但**没有落盘断言就等于没做到**，按建议重构为显式 `writeImportedSave` |
| D-005 第 2 轮 | 有条件通过（1 项待补证） | 测试 22 只是"再序列化一次"，未调用真实 `save()` → 改为抽真实 `save()` 执行；同时按建议做 C 项 `acts` 白名单化 |
| D-005 第 3 轮 | **审查通过 · 可交付** | J-1 闭环、C 项通过、其余七项维持通过、无新增阻断项 |

正文：`d005_reply.txt`（第 1 轮）、`d005j1_reply.txt`（第 2 轮）、`d005f_reply.txt`（第 3 轮，可交付）
会话：`https://chatgpt.com/c/6af034cd-9c74-83ee-879f-de93f77d5dea`

**证据边界（审查方声明，如实转述）**：未在本地重算 SHA、未亲自执行命令；其裁定基于我提交的源码摘录与测试报告。

## 7. 审查方的收口意见（原话要点）

> 「建议现在冻结 D-005，不要再围绕这批已经通过的存档治理问题反复审计。把开发精力转回《九霄问道》的 NPC 互动、世界事件和玩家留存体验。」

## 8. 仍未做（审查判不阻断，属后续治理）

1. 客户端词条上限是否显式对齐服务器 `AFFIX_POW_CAP_PCT = 22` —— 多人战力正式开放前必须做跨端对拍。
2. 侧车内容不做结构校验（`restoreSidecar` 只校验字符串类型/长度/键名）—— 各读取方需能容忍损坏数据。
3. `renderForge` 的渲染开销 —— 需可信测量后再定。
4. `rank` 那行的 `|0` —— 审查判"先限幅再取整，无溢出风险，不要求统一"。

---

# D-006 交付记录（独立审查已通过 · 可交付）

> 记录时间：2026-11-08
> 结论：**D-006 审查通过，可交付。** 审查方第十轮原话：「我签发 D-006：审查通过，可交付」「不要再为了追求审查轮数而重开已通过的项目」。
> 独立审查方：ChatGPT 网页版，**十轮往返，每轮均真实取回正文**（正文落盘见 §6）。
> 定位：转向"从未被审查过的模块"清扫——`js/views/*`(16)、`js/net.js`、`js/npc*`(5)、`js/story.js`、`js/daily.js`、`js/tutorial.js`、`js/trib.js`；四路并行只读审查起步，随后十轮定点复审收敛"共享日常状态并发边界"。

## 1. 最终产物与回滚点

### 1.1 送审版本 SHA256（第十轮冻结版，产品文件）

| 文件 | SHA256 |
|---|---|
| `js/daily.js` | `9d71c0ddfff5e3fe7606f66819c567a768afe98355d9ca918ecbe8118dca5c4d` |
| `js/game.js` | `2cc1705e0dd8a9f2332eefded86cc7a1a815c0f0ac717102b0b9f9d6764ffd8b` |
| `js/net.js` | `419154bbea7050773d95522e3fa076ff9cb655e602eec375a2079fdd6f98d6ce` |
| `js/npc.js` | `43de02877bf10ea05d803439160ea2f90c68642d13381fbe955aea51d6a7f035` |
| `js/npc_memory.js` | `00ea68686628c608b2caeedf0ab9c07240ae031cab68061a053bc9f2c015c0c9` |
| `js/npc_tower.js` | `65dda4dc64d6bbd24dc31d8ed611bcf39efed7669ff914aeeadbaa4d0f81177c` |
| `js/npc_visit.js` | `390a64a4df6acd76cd4b8635b28edf9a40a5902c2162104c2cdb9f15fc307add` |
| `js/story.js` | `c7448859cef1b274711b02f99f50f0bf2923c14a537e3b0c14bdcc25a67953d8` |
| `js/trib.js` | `bb75459b69cbd2b100e2a0959eacda369298337e5e7487120db09917e01d27ee` |
| `index.html` | `f67d9ac3d1e71ff4405b92c05f4b8d2ff5d00a672448e96ffcf35b115d4536c1` |
| `style.css` | `95b78ce8ac6f9ae9cf109da35a2509cb0e1ef2494a8bf644cbd6ced53d06cc8f` |
| `verify_npc_ui.js` | `fb4abc2886adfb009e197a46df8f7a92c74e99bf1c74fee88749dd6324d843c0` |

新增/改动工具：`tools/d006-viewsnet.test.mjs` `96db88ec3a05bfa5eebca08cbff4f9be64326774e076b6c7251da7569a125e44`（57 项）、`tools/d006-multi-offline-probe.js` `7e6b5ae3e4ba37b733c5070a6b2ef232e2d5a0c263bab39c47745f271a469822`（36 项）、`tools/d006-views-audit.js` `77a254db9511572763bd0b49ca47953f5bb0388cc779037cabfa8d46a9b9a326`。

### 1.2 回滚点与 diff

- 全批次基线：`*.bak_20261108_182924_preD006`（D-006 开工前完整快照）。
- 第九轮定点修复改前备份：`*.bak_20261108_211215_preR9fix`（daily.js / game.js / 测试）。
- 完整 diff 落盘：`evidence/d006_full.diff`（preD006→交付版，11 文件，1381 行）、`evidence/d006_r9fix.diff`（r9→r10 定点，3 文件，123 行）。
- 逐文件审查清单：`D006_VIEWS_AUDIT.md`（16 视图逐文件结论 + 全库反向检查）。

## 2. 本轮实际改了什么

### 2.1 起始批次修的缺陷（13 组）

| 组 | 缺陷 | 性质 |
|---|---|---|
| 1 | 联机页 offline 死锁：`hall.hidden = st!=='lobby'` 把全库唯一服务地址输入框藏了 → 新玩家永远进不去 | 高 |
| 2 | `[hidden]` 被作者样式 `.mc-opts{display:grid}` / `.ch-input{display:flex}` 盖掉 | UI |
| 3 | 「进入」按钮空实现（只探活不切行）→ 兑现注释 | 功能 |
| 4 | 五个联机动作失败全静默 → `multiCall` + `multiToastErr` + 中文失败码 | 体验 |
| 5 | 离开房间卡在房间态 → `net.js clearRoom()` | 状态 |
| 6 | `net.js` 无 timeout → `fetchJson` + AbortController（post 4.5s / join 6s） | 健壮 |
| 7 | `emit()` 吞订阅者异常不打日志 → console.error | 可观测 |
| 8 | `run.log` 未转义 → escHtml | 注入 |
| 9 | `tutorial.js` 加载顺序（router.js 末尾同步 XX.boot）→ 引导中途刷新永久丢失 + 100 灵石 | 数据 |
| 10 | 每日奖励可无限刷（todayKey 不补零 + `!==` 判定 + 1e999→Infinity + claimed 不去重 + claim 不重读） | 经济 |
| 11 | 主档同类日期洞（S.sign.last / actDay / towerDay / union.day / arena.day / secret.day / council.day）全改 `dayNo` 严格判定 | 经济 |
| 12 | NPC 侧车导入被静默覆盖（restoreSidecar 只写盘，常驻内存未 reload） | 数据 |
| 13 | NPC 写盘静默（record 返回 persisted / _reset fail-closed / _state 深拷贝 / 损坏原文备份） | 一致性 |
| 14 | 文案演出（崔九双冒号病句、记忆掺 now 去重失效、沈碑漏 UI 术语、已听分母写死 /6、story.pump 遮挡复查、MERGE 丢排队段） | 文案 |

### 2.2 十轮审查收敛的"共享日常状态并发边界"（最终形态）

Web Locks 统一互斥；`init / claim / bump` 三个写路径共用同一把 `CLAIM_LOCK`，读改写整段在锁内；`list / allClaimed` 渲染路径**一律只读**（`dayRolled()` 只读判定，绝不调会 `save()` 的 `ensureDay()`）；跨天重置只在锁内路径发生，展示按今日口径、落盘延后到第一个动作（有意取舍，已披露）。

三条**明确拒绝**（fail-closed，不假装成功）+ 各自一次性 UI 提示：
- 无 Web Locks → `claim` 与 `bump` 都拒绝写入，返回 `NO_LOCK`；
- 有锁但 `save()` 返回 false → `bump` 回滚内存进度、返回 `SAVE_FAILED`；`doClaim` 早有同类回滚；
- 锁异常 → `BUMP_FAILED`。
- 普通失败提示用**白名单**（只认 `SAVE_FAILED`/`BUMP_FAILED`），`UNKNOWN_TASK`（采药/顿悟/参悟等正常动作）静默忽略，避免误报。

### 2.3 过程中主动撤销 / 刻意不做的（诚实留痕）

- **破境丹自动吃丹**（D-004）、**`attemptBreakthrough` 加天劫锁**（本批次）：均属未经授权的玩法变更或会红 16 项既有规格，已撤销，只留纯文案 / 结算卡修复。
- **`trib.play` busy 分支规格冲突**：`verify.js` 守「不重复收尾」、`verify_break` 16 项要求连续突破——两条既有规格互斥，退回原状 + 注释 + console.warn，等制作人裁定。
- **刻意不做（需制作人裁定）**：PROFILE_MODE off→enforce、任意队员 leave 结算全队、宗门裸 pid 认证、联机灵石双账本、`renderForge` 每秒 36 行（headless 无可信测量）。

## 3. 关键实现（第十轮定点修复，相对 r9）

```js
// js/daily.js bump 的 doBump：写盘失败不再虚报成功
const before = st.prog[kind];
st.prog[kind] = Math.min(t.goal, (before || 0) + add);
if(!save()){
  st.prog[kind] = before;                 // 回滚：list() 不显示没落盘的进度
  return { ok:false, code:'SAVE_FAILED', msg:'本次进度未记下。' };
}
return { ok:true, prog: st.prog[kind] };
```
`bump` 返回值统一为对象（成功 `{ok,prog}` / 失败 `{ok:false,code,msg}`，无锁 `NO_LOCK`）；活跃代码里只有 `game.js dailyBump` 消费它，`claim` UI 是独立路径——契约变更已全库核查无遗漏。`dailyBump` 用两个独立 warned 标志分别限次提示 NO_LOCK 与写盘失败，互不抢占、不刷屏。

## 4. 测试证据（第十轮冻结版改后真实执行，浏览器套件严格串行）

| 套件 | 结果 |
|---|---|
| `node --check` × 11 个 js/mjs | 全 OK |
| `node verify.js` | **896 / 0** |
| `node verify_break.js` | **120 / 0** |
| `node verify_npc.js` | **60 / 0** |
| `node verify_npc_ui.js` | **260 / 0**（单独串行，见 §4.2） |
| `node _playtest.js` | **253 / 0**（33 场景，真人点击） |
| `node --test tools/d004-audit-fixes.test.mjs` | **28 / 0** |
| `node --test tools/d004-reincarnate-conservation.test.mjs` | **4 / 0** |
| `node --test tools/d004-corrupt-export.test.mjs` | **12 / 0** |
| `node --test tools/d005-followup.test.mjs` | **26 / 0** |
| `node --test tools/d006-viewsnet.test.mjs` | **57 / 0**（+2 写盘失败补测） |
| `node tools/d004-save-panel-layout.js` | **36 / 0** |
| `node tools/d006-multi-offline-probe.js` | **36 / 0**（四视口真实矩形 + elementFromPoint 命中） |

原始日志：`evidence/d006_r9fix_regression.log`、`evidence/d006_r9fix_npcui_rerun.log`（第九轮批量：`d006_r9_regression.log` / `d006_r9_npcui_rerun.log`）。

### 4.1 两条最关键的补测（真跑源码，不是查字符串）

- **写盘失败回滚**：注入让真实 `localStorage.setItem` 抛 `QuotaExceededError`，触发 daily.js 里**真实的 `save()`**（try/catch 返回 false 那条），断言 `bump` 返回 `SAVE_FAILED`、`_state().prog` 回滚到 `before`、`list()` 不虚报、磁盘逐字节不变。
- **UI 提示链路**：`extractFn(GAME,'dailyBump')` 抽出真实函数在 vm 里配 `Daily.bump`/`log` 桩跑，断言 `SAVE_FAILED` 只提示一次、重复失败不刷屏、`UNKNOWN_TASK` 不误报、`NO_LOCK` 仍走独立提示。

### 4.2 一处环境异常（如实披露，非产品缺陷）

`verify_npc_ui.js` 在"多套件连续批量"里会被宿主注入的 `node-safe-delete-shim` 批量删除守卫（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`, count=50/threshold=50, scope=turn）在脚手架清临时 html 时中断；中断前 1256 行断言全绿。按门禁"不绕过护栏、不屏蔽产品行为、做真实环境对照补验"，把该套件移出批量、删除计数重置后**单独串行跑得 260/0**。两份原始日志都留盘，未改产品代码/断言、未跳过任何测试。

### 4.3 三类证据分别记录

测试全绿 ≠ 独立审查通过 ≠ 真实运行验收通过。真实运行验收：`_playtest` 253/0、联机页四视口探针 36/36、存档面板布局 36/36（headless Edge 真实矩形与命中测试）。审查方按提交的冻结材料采信 SHA 与测试输出，未在本地独立复算或运行——此证据边界如实转述。

## 5. 独立审查记录（十轮，每轮均真实取回正文）

| 轮次 | 判定 | 主要意见 → 处置 |
|---|---|---|
| 1 | 仍需修改，暂不交付（3 阻断） | 优先修每日奖励并发与时间可信度；补 16 视图逐文件清单 → 出 `D006_VIEWS_AUDIT.md` |
| 2 | 仍需修改 | J/K-1 闭环；但 J-1 补 Web Locks 后留下"奖励一致性"新问题；要求补完整报告/脚本正文 |
| 3 | 仍需修改 | 视图清单阻断关闭；收敛到"核心一致性 + 兼容性策略" |
| 4 | 暂不签发 | 两项原定修复闭环；确认 `dailyApplied` 只留 40 条时旧 pending 凭据不被淘汰 |
| 5 | 暂不签发最终通过 | 幂等凭据与 pending 生命周期 |
| 6 | CONDITIONAL · 仅剩一项 | 缓通过；只需修"无锁分支 ensureDay() 写盘"，不重开其他项 |
| 7 | CONDITIONAL · 暂不签发 | 发现两个新并发边界：`hasLock()`≠当前持锁；`bump()` 与领取交错 |
| 8 | CONDITIONAL · 仅剩一项 | 渲染只读 + bump 进锁通过；仅剩"无锁环境 bump 跨标签页写入安全" |
| 9 | CONDITIONAL · 暂缓整体签发 | r8 阻断闭环；但发现**新阻断**：有锁 `save()` 失败仍报成功 |
| 10 | **通过 · 可交付** | 四项要求全部达标、两条补测有效、UNKNOWN_TASK 白名单接受；签发 D-006 |

审查正文落盘目录：`C:/Users/35695/WorkBuddy/2026-10-25-12-47-31/chatgpt-link-verify/`
- 第 1–8 轮：`d006_reply.txt`、`d006_r2_reply.txt` … `d006_r8_reply.txt`
- 第 9 轮：`d006_r9_reply.txt`（CONDITIONAL，新阻断）
- 第 10 轮：`d006_r10_reply.txt`（**通过 · 可交付**）
- 送审材料：`d006-r9.md`、`d006-r10.md`；会话 `https://chatgpt.com/c/6af034cd-9c74-83ee-879f-de93f77d5dea`

### 5.1 第九轮意见闭环登记（逐条核实 + 处置，符合门禁加固第 2 条）

| 意见 | 严重程度 | 判定 | 技术依据 | 复验结果 |
|---|---|---|---|---|
| r8 唯一阻断项（无锁 bump 裸写） | 阻断 | 成立，已闭环 | r9 已修 | 审查方第十轮复核"已闭环" |
| 有锁 `doBump()` 不检查 `save()` 返回值 → 虚报成功 | 阻断 | **成立** | daily.js:105 `save()` 返回布尔；`doClaim` 早有回滚防护，bump 缺一致性 | 已加 `if(!save())` 回滚，专项 57/0、全套 896/120/60/253 全绿 |
| ① 检查返回值 ② 失败回滚内存 + 返回失败 ③ UI 对普通失败提示 ④ 补测 | 阻断 4 子项 | 全部成立 | 审查方四点要求 | 逐项落实 + 2 条真跑补测；第十轮裁定"四项全部达标" |
| 测试 55 源码级守护不能证明真实 UI 上屏 | 观察 | 部分接受 | 审查方 r9 提出 | 新增第 2 条测试改为真跑 dailyBump（vm + log 桩），证据边界如实标注；审查方接受 |

### 5.2 第十轮三点保留意见（记录但不阻断，逐条判定）

| 保留意见 | 判定 | 处置 |
|---|---|---|
| 无 Web Locks 环境每日进度明确不记录，是安全取舍，提示已补齐 | 成立，接受 | 已在 §2.2 / §4 披露，作为交付行为记录保留 |
| `verify_npc_ui.js` 批量受宿主清理护栏影响，单独串行 260/0；保留两份日志，不把批量中断记成产品测试失败 | 成立，接受 | 已在 §4.2 如实记录，两份日志留盘 |
| `renderForge` 性能、PROFILE_MODE、联机结算与认证等刻意未处理事项仍属后续独立决策，不因 D-006 通过视为已解决 | 成立，接受 | 保留在 §6「未完成」，维持"未授权/待裁定"状态 |

## 6. 未完成 / 待制作人裁定（不因 D-006 通过而关闭）

1. PROFILE_MODE off→enforce（改所有玩家联机战力）、任意队员 leave 结算全队、宗门裸 pid 认证、联机灵石双账本——四项联机/战力敏感操作，**未授权**。
2. `trib.play` busy 分支规格冲突（两条既有测试规格互斥）——退回原状，待裁定。
3. `renderForge` 每秒 36 行渲染开销——需真机 DevTools Performance + 4× CPU Throttling 可信测量后再定。
4. 客户端词条 22% 跨端对拍（D-004/D-005 遗留）——多人战力正式开放前必做。
5. 侧车内容结构校验、`rank` 的 `|0`——历史遗留，审查判不阻断。

## 7. 审查方收口意见（原话要点）

> 「我签发 D-006：审查通过，可交付。」「制作总监结论：D-006 可以结束审查，进入交付。不要再为了追求审查轮数而重开已通过的项目。」

## 8. 方法论教训（写给后续接手的人）

1. **写盘函数的布尔返回值必须被消费。** `doClaim` 早就回滚 + 返回失败，`bump` 却调 `save()` 不检查 → 写盘失败静默虚报。审查方正是靠"同模块两条路径不一致"抓到的。
2. **给失败结果加提示时要用白名单码，不要 `if(!ok) 提示`。** 采药/顿悟/参悟本就不计入日常，若不区分 `UNKNOWN_TASK` 会每次动作误报"保存失败"。
3. **测试要跑真实源码路径**：用真实 `setItem` 抛错触发真实 `save()`，而不是 mock 一个 `save` 返回 false。
4. **浏览器套件必须串行，且注意宿主清理护栏**：多套件连续批量会累计触发 `node-safe-delete-shim` 的 50 次删除阈值，导致脚手架清临时文件时中断——这不是断言失败，须单独串行补验并如实披露，不得绕过护栏或藏。
5. **两条既有规格互斥时不单方面挑一边改**，退回原状 + 注释 + 上报等裁定（trib.play）。

---

# D-007 交付记录（GPT 独立审查已通过 · 可交付）

**来源**：用户指定《九霄问道-通宵深玩报告 (1).md》（A103 / B88 / C56 = 247 条），要求「看还有多少能修却没修的，赶紧修了」。该报告玩的是 2026-11-08 02:41–08:55 的 trycloudflare 旧隧道快照；`diff js/game.js.bak_20261108_160625_preD004 js/game.js` 证明 D-004~r9fix 的 1049 行改动集中在存档/签到/仙盟/论剑/NPC/主循环错误隔离，对渲染、镇妖塔、灵兽园、日志、福缘路径 0 行改动，故文案/显示/日志类问题确实仍在。

**本批口径（白名单）**：只修纯文案、显示口径、日志、排序、反馈、DOM 内容签名缓存；允许新增测试/截图工具资产。
**红线（零触碰）**：`needG=1.85`、战力公式、数值平衡、成功率/掉率/奖励/价格公式、解锁门槛、存档字段与语义、单机/联机养成合并、联机结算、公网放行、依赖；十项敏感操作零触碰。`tools/d007-ui-text.test.mjs` 有断言专门锁死 `if(S.log.length > 40)`、`sigNum(S.exp)`、`uiIdleTicks >= 2`、`confirm('放生【'`、`needG` 仍在。

## 1. 送审版本 SHA256（两轮冻结，交付时复核逐字节一致）

```
4b292703a8c16416e17911d00d936b99efd04b846583390248c857e568910dc6  js/game.js
646ea46bf64222ac938d749665b3d03d898953c07e1c317afa1a87875cdf600d  js/views/sect.js
c07dd32a42e201c20c8369cb212ff90120ad6018a0cf592b39009f4e0ba2c423  verify.js
e0f59863b5a44135264c34f91e0a7b7e82532841afc45fe17c8cc5f7868c926d  tools/d006-viewsnet.test.mjs
0e16558ed7361f4f6c8e6aad0f386f39c050f2e2fca39c138120d96c730015d7  tools/d007-ui-text.test.mjs（新增）
2c9a5a83085e2aee55488caa562f41a2365458b1b6ee6fcf348e26ccb3f6cfcb  tools/d007_verify_baseline.mjs（新增）
0878dbc86f7ef7bb66721d1f0a0ef5889db1b2f8bbbabe25888e538835209809  shot/shot_d007.js（新增）
e3cff72ed0ea07e44cad2a65cdb95ba010db27763c4dc1dd3f9f902da1e3e35e  shot/shot_d007_baseline.js（新增）
```

**改前基线** `js/D007_BACKUP_20261108_225456/`：`game.js 2cc1705e…`、`sect.js 1b0b8ca7…`、`verify.js 5476b2ea…`（脚本精确重建，见异常 5）、`tools/d006-viewsnet.test.mjs.bak_20261109_003600 96db88ec…`。
**完整 diff**：`evidence/d007_full.diff`（413 行 / 25,935 字节 / SHA256 `11dafa84…`）；分文件 `d007_game.diff` / `d007_sect.diff` / `d007_verify.diff` / `d007_d006test.diff`。核验：备份点后仅 8 个文件被改动，`style.css`、`index.html`、数值配置、存档模块、联机/公网模块零改动。

## 2. 本轮实际改了什么（29 处，均属白名单）

**第一批·文案/显示口径**：A24 强化「下一级 +N」成功率改与按钮同源的 `ch=enhanceChance()`（旧 `nCh` 用 `nlv` 重算是「下下级」概率，低约 3 个百分点）；A52 破境丹补修为折算说明；B38 签到格子已领当天时 `idx` 已是下一次待领，新增 `lastClaimed` 跨 7 天轮回取模，分离 `claimed/today`；A66/B40 `ARENA_SHOP` 按 rep 30/60/100/150/220 升序（只换顺序）；A47/B49 勾选天机令或顿悟圆满时按钮显示「必定成功 100%」；C39 括号配对；A97 云游老道日志补修为；A16 冷却中不再清空按钮副文；A65 去掉 `undefined` 的功法 ico 前缀；A73/B78 镇妖塔标签「当前层→待挑战层」「历史最高→已通关最高」。

**第二批·反馈/日志/动态标价**：A31 物品详情改显示 `sellPrice()` 坊市实收价（旧显示 `ITEMS` 固定 30，与成交差几个数量级），`verify.js` 断言从 `/30/` 升级为「与 `_sellPrice('mat_core')` 同源」；A33 坊市一键寄售口径与长 hint；A54 矿脉升级产量写入独立 `.hint`；A57 探索秘境按钮运行时动态标价，与 `treasure()` 实扣同源；A64 喂食日志补消耗；A75 自动猎杀两处静默停止改明确反馈；A11/A91 奇遇结果叙述写日志；A77 灵兽槽满孵化日志补「本次未进行」。

**第三批·A61 类 DOM 内容签名缓存**：给 `renderMarket()` 的 `#mk-sell`、`renderBag()`、`renderPets()` 加 `box !== cachedBox || html !== cachedSig` 守卫，沿用项目既有 `mkBox/mkSig` 范式。背景：`setInterval(tickLoop,500)` + `uiSignature()` 纳入 `sigNum(S.exp)` + `uiIdleTicks>=2` 兜底 → 稳态仍周期性全量 `render()`，无条件 `innerHTML=` 会在 mousedown/mouseup 间重建子树吞掉 click（报告里「第一次点击无反应 / 连点买不成 / 灵兽园按钮无反应」）。**刻意未改**主循环与 `uiSignature`（需真机测量），**未**用 DOM `.click()` 模拟绕过命中测试。

**刻意不做 / 未授权（如实登记）**：玩法数值与奖励缩放、背包堆叠改存档结构、奇遇池扩容、战斗演出、NPC 剧情推进、榜单规则、UI 大改版、需真机测量的性能项、A86「福缘」信息架构（复核 `index.html:125` 副标题本为「日常任务」且指向 `xx-quest`，B70/C46 判设计自洽；改标题/指向或新建页属玩法裁定）、日志上限 40、原生 confirm 替换、旧隧道快照与玩家误读类报告项。

## 3. 测试证据（最终交付版本真实执行，浏览器套件严格串行）

| 项 | 结果 | 日志 |
|---|---|---|
| `node --check` × 8 改动文件 | 全 OK | — |
| `node --test tools/*.test.mjs` | **148 / 148** | `evidence/d007_unit_v4.log` |
| `tools/d006-viewsnet.test.mjs` 单跑 | **57 / 57** | `d007_d006_fix.log` |
| `tools/d007-ui-text.test.mjs` 契约 | **21 / 21** | `d007_contract_v3.log` |
| `node verify.js` | **896 / 0** | `d007_final_verify.log` |
| `node verify_break.js` | **120 / 0** | `d007_final_verify_break.log` |
| `node verify_npc.js` | **60 / 0** | `d007_final_verify_npc.log` |
| `node _playtest.js` | **253 / 0**（33 场景） | `d007_final__playtest.log` |
| `node verify_npc_ui.js` | **260 / 0**（干净环境单独串行） | `d007_final_verify_npc_ui.log` |
| 真实 Edge 无头多视口截图 | 900 档 9 张 + 393 档 4 张重跑、逐张目视通过 | `screenshot/d007/`、`d007_shots_v3.log` |

**三类证据分别记录**（不互相替代）：
1. **测试全绿** = 上表 148/896/120/60/253/260 与语法检查；
2. **独立审查** = 下述两轮 GPT 网页端独立复审（真实发送 + 真实回取正文）；
3. **真实运行验收** = `_playtest` 253 场景真人路径 + 13 张真实浏览器截图逐张目视 + `verify_npc_ui` 393/900 两档几何测量。

截图目视结论：A24 下一级 91% = 按钮 91%；A47「必定成功 100%」+ C39 括号配对；A31 详情 289 = 按钮 289（浮动实收价，非旧硬编码 30）；A57 按钮「灵石 433」；A33「一键寄售全部（3 件可卖）」+ 长 hint 完整；A66 声望升序且无剧情弹窗遮挡；B38 第 3 天 1/2/3 已领、4~7 未领；A73 三标签语义明确；A54 393 窄屏左侧恢复横排、hint 完整写出「开辟后每分钟产 3 矿石（当前 2）」。

## 4. 已知异常（如实披露）

1. **F 测试跨午夜稳定失败（已修，非产品缺陷）**：`d006-viewsnet.test.mjs` F 用例硬编码 `day:'2026-11-01'`，`makeNpcMemory` 注入真实宿主 Date（不同于同文件 `makeDaily` 固定时钟）。跨到 11-09 后 `0.8^8=0.1678<0.2`，`init()` 内 `ensureDay()` 自然淡忘并回写磁盘，在断言前合法写没旧记忆 → 147/148。证据：改前产品 11-08 是 148/148；改前基线产品在 11-09 同样 56/1（`d007_d006_ISOLATION_BASELINE.log`），证明与 D-007 无关。**修复**：给 `makeNpcMemory` 注入与 `makeDaily` 同款 `FakeDate`（默认 2026-11-08），F 用例显式传 `{today:[2026,11,8]}`；**断言一字未改、产品代码零改动**。真实环境对照探针（`d007_npcmem_realdate_probe.log`）：注入真实 Date，`BEFORE` 含「旧记忆」→ `AFTER {"v":1,"day":"2026-11-9","mem":{}}`，确认自然淡忘是产品既定行为，不是被测试屏蔽。修后 57/57、全套 148/148。
2. **`verify_npc_ui.js` 批量环境假失败**：4 套件连续批量后曾 249/11（集中在「初见切换」一组，由一条 `null.click()` 连锁），改前基线 260/0、干净环境单跑 260/0。结论：宿主 `node-safe-delete-shim` 批量删除守卫（count=50/threshold=50）与前置套件临时 html 清理残留所致，非断言失败、非产品缺陷；未绕过护栏、未删失败断言、未并发跑浏览器套件。最终版按纪律单独串行 260/0。
3. **A54 引入过一次真实窄屏回归，已自行发现并修复**：初版把长文案塞进按钮，393 档 `10_mine_393.png` 显示左侧被挤成竖排单字；用改前基线对照图确认是 D-007 引入。改法：按钮恢复短文案、产量写入独立 `.hint`，契约测试加防回归断言 `absent(game,"（升级后每分钟 +'")`。修复后重跑 13 张截图逐张目视，回归消失。
4. **截图脚本初版取景错误（已修）**：`02_break_900` 误用 `ROUTER.open("xiu")` 只拍到 hub；`09_arena_shop_900` 被 `#story-modal` 遮罩。改 `xiu_cult` + 隐藏剧情弹窗后重拍。
5. **`verify.js` 改前基线是脚本精确重建**：改前未留副本，`tools/d007_verify_baseline.mjs` 按本批 2 处改动逐字反向替换重建（SHA `5476b2ea…`）。**审查限定（见 §5）**：只称「脚本精确重建的局部回归对照基线」，不称历史原件、不用于证明本批以外历史状态。
6. **A31 显示价与成交价存在时间差（审查员接受为既有行为）**：详情 `sellP` 是打开那一刻算的，`sellMarket()` 是点击时重算的；跨天行情重掷或 `sold` 越过 `BAL.marketSellMax=20` 触发 0.5 压价时两者不同。详情文案已用「坊市实收，随行情浮动」提示。未改额度/行情机制（红线）。
7. **证据边界**：源码契约测试不等价于真实浏览器运行时；`uiSignature` 性能项 headless 无法可信测量，刻意不做；审查方明确声明未访问磁盘、未复算 SHA、未重跑测试，测试与哈希按送审记录采信。

## 5. 独立审查记录（两轮，均真实发送并回取完整正文）

通道：独立 `--user-data-dir` 的 Edge + CDP 9222，ChatGPT 会话 `6af034cd`「独立代码审查」。脚本与正文在 `C:/Users/35695/WorkBuddy/2026-10-25-12-47-31/chatgpt-link-verify/`。
- 第一轮：送审 `d007-r1.md`（29,480 字符，含**完整 diff 逐字全文**作为附录 A + 哈希 + 原始测试结果 + 已知异常），`d007_r1_send.log` 记 `D007_R1_SENT / tooLong=false / draft=0`；回取 `d007_r1_reply.txt`（533 行）。结论 **CONDITIONAL · 暂不签发最终可交付**，要求补两项实现证据。
- 第二轮：`d007-r2.md`（18,271 字符，按行号从磁盘逐字抽取真实源码），`d007_r2_send.log` 记 `SENT / tooLong=false / draft=0`；回取 `d007_r2_reply.txt`（211 行）。结论 **PASS · 审查通过 · 可交付**。

### 5.1 第一轮意见闭环登记（逐条判定 + 处理）

| # | 意见 / 严重程度 | 判定 | 处理与复验 |
|---|---|---|---|
| 1 | A31 三函数实现待补证（重要·待补证） | **成立** | 第二轮提交 `resetMarket/rollMarket/sellPrice/sellMarket/showItemDetail/renderMarket/render` 逐字源码 + 三问逐答；审查判「三项闭环」 |
| 2 | A47 结算端判定与消耗待补证（重要·待补证） | **成立** | 第二轮提交 `attemptBreakthrough` 全链 + 逐项对齐表 + 前置 return 核实；审查判「闭环」 |
| 3 | 签名守卫「外部绕过渲染函数改写子树」剩余风险（提示·非阻断） | **接受并补核实** | 全库检索：`#xx-bag` 仅 `renderBag`(10556)、`#xx-pets` 仅 `renderPets`(9635)、`#mk-sell` 仅 `renderMarket`(5481) 持有；`router.js:164` 换容器被 `box!==cachedBox` 捕获；三处容器消失均清缓存。审查判「无此路径」 |
| 4/5/6 | B38 七日轮回 / A54 满级分支 / A16 与 `.cd` | **通过·接受** | 无需处理 |
| 7 | 「按钮不再展示 pb；普通成功率没把 pb 加入主体」（提示·非缺陷） | **部分不成立，给可复核依据，不据此改码** | ① 必成分支才不列 pb，非必成分支逐字保留 `(pb>0?' · 丹药 +…':'')`；② `breakChance()=breakChanceWith(null)`，后者体内 `+pillBonus()` 已计入 pb，`· 丹药 +X%` 只是分解标注；按字面补进主体会重复计算并抬高成功率（红线）。**审查第二轮「接受反驳，不要求改码」** |
| 8 | 异常 1 FakeDate 修复 | **接受** | 接受审查提醒：后续新增真正测跨日淡忘的用例必须显式传 `opts.today`，不依赖默认时钟——登记为后续约束 |
| 9 | 异常 5 基线重建「有条件接受」 | **接受该限定** | 一律称「脚本精确重建的局部回归对照基线」，不称历史原件、不证明本批以外历史状态 |
| 10 | 白名单越界 / 五维审查 | **通过·接受** | — |
| 11 | 最终裁定 CONDITIONAL，补齐后只做定点复核、不重开前三批、不要求全量重测 | **接受并执行** | 第二轮零产品代码改动，未重跑全量 |

### 5.2 第二轮裁定与附带边界

> 「D-007 第二轮定点复核 **PASS · 审查通过 · 可交付**」「A31：三项补证闭环。A47：天机令判定、扣除顺序及顿悟阈值闭环。第 7 条：接受反驳，不要求改码。异常 1、异常 5：接受所提交的限定。无新增阻断项。」

- 审查接受 §4.6 的 A31 时间差为既有行为，明确「不应为了消除这种正常浮动而擅自改变市场机制」；接受 A47 前置 return 核实，明确「连续破境不加锁属玩法取舍，不应扩大成冷却机制整改」。
- **审查员自设的证据边界（如实登记）**：① 未直接访问项目磁盘、未复算 `4b292703…` SHA、未重跑测试，测试与哈希按送审记录采信，不冒充本地独立复验；② 关于 `pillId` 是否恒为 null，第二轮展示的是调用参数而非该变量完整赋值语句，故不把「所有额外指定丹药加成路径均不存在」扩展为独立验证结论（不影响必成条件裁定）。我方事后只读核实 `const pillId = opts.pill || null;`（4514）且 `doBreak()` 不传 `pill`，但**按审查声明不将其升级为审查结论**，仅登记。
- **交付建议（审查原话）**：「保留本轮复核记录和原版本哈希，按已审查版本交付。不要为了增加审查轮数而重跑全量测试或重开已通过门禁。下一阶段应回到实际玩法与留存体验。」已遵守：第二轮后零产品代码改动，8 个文件哈希与送审逐字节一致。

## 6. 未完成 / 待制作人裁定（不因 D-007 通过而关闭）

承接 D-006 §6 的 5 项，另加本批识别但未授权项：玩法数值/奖励缩放、背包堆叠改存档结构、奇遇池扩容、战斗演出、NPC 剧情推进、榜单规则、UI 大改版、`uiSignature` 性能真机测量、A86 福缘信息架构、日志上限 40、原生 confirm 替换、A31 显示价与成交价时间差（如需锁定报价属玩法裁定）。**通宵深玩报告 247 条并未全部修复**——本批只收敛了白名单内「能修且不需改玩法/存档语义」的部分。

## 7. 方法论教训

1. **深玩报告是旧隧道快照**：动手前必须用 diff 证明「报告指向的路径确实没被后续批次改过」，否则会把已修问题重复修或误判玩家误读为缺陷。
2. **长文案塞进定宽 flex 按钮会在窄屏挤成竖排**：A54 初版就是这么引入回归的；信息应放块级 hint，且必须用改前基线截图做对照归因，再补防回归断言。
3. **测试夹具的时间依赖要固定**：`makeDaily` 有 FakeDate 而 `makeNpcMemory` 用真实宿主 Date，跨午夜就暴露成「日期依赖型假失败」；修夹具时钟不等于改断言，也不等于屏蔽产品行为，须附真实环境对照探针证明被淡忘确属产品既定行为。
4. **独立审查要求的是实现证据而非开发者断言**：第一轮「完全一致」的文字说明被判为不足以采信，补交按行号逐字抽取的源码后才闭环。送审材料必须含完整 diff 正文（审查方读不到本地磁盘，只给路径不合规）。
5. **审查意见要逐条判定，不是全盘接受**：第 7 条按字面改会引入重复加成 bug，给出可复核依据后被审查方接受「不要求改码」。
6. **浏览器套件严格串行 + 单独串行补验**，宿主 `node-safe-delete-shim` 的批量假失败须如实披露，不得绕过护栏。
