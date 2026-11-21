# js/views/*.js 逐文件审查清单（D-006）

> 自动生成：`node tools/d006-views-audit.mjs --md`
> 说明：本表只覆盖**可自动化**的部分（语法 / id 宿主链 / 死模板 / 注册一致性 / 内联事件）。
> 逻辑类检查（判空、错对象、数据写入路径）见每文件「人工结论」一栏，由逐文件阅读得出。

## 1. 逐文件表

| 文件 | 行数 | 声明 id | 动态 id | 被外部引用 | 无引用 id | 内联事件 | data-* 钩子 | 语法 |
|---|---|---|---|---|---|---|---|---|
| `arena.js` | 34 | 6 | 0 | 3 | 3（ar-me-sec / ar-board-sec / ar-shop-sec） | 0 | 0 | ok |
| `bag.js` | 21 | 4 | 0 | 3 | 1（page-bag） | 0 | 0 | ok |
| `beast.js` | 19 | 2 | 0 | 1 | 1（page-chong） | 0 | 0 | ok |
| `cave.js` | 95 | 28 | 0 | 25 | 3（xx-forge-sec / xx-enhance-sec / xx-dongtian-sec） | 0 | 0 | ok |
| `chat.js` | 30 | 7 | 0 | 6 | 1（page-chat） | 0 | 0 | ok |
| `event.js` | 37 | 8 | 0 | 4 | 4（ev-daily-sec / ev-sign-sec / ev-union-sec / ev-rew-sec） | 0 | 0 | ok |
| `kit.js` | 86 | 0 | 5 | 0 | 0 | 0 | 5 | ok |
| `life.js` | 94 | 38 | 0 | 37 | 1（xx-mf-calm-opts） | 0 | 6 | ok |
| `market.js` | 42 | 10 | 0 | 6 | 4（mk-rate-sec / mk-sell-sec / mk-goods-sec / xx-tianji） | 0 | 0 | ok |
| `multi.js` | 74 | 32 | 0 | 30 | 2（page-multi / xx-multi-srvline） | 0 | 0 | ok |
| `rank.js` | 19 | 3 | 0 | 2 | 1（page-rank） | 0 | 0 | ok |
| `role.js` | 91 | 23 | 0 | 19 | 4（es-weapon / es-armor / es-accessory / npc-portrait） | 0 | 3 | ok |
| `scripture.js` | 67 | 21 | 0 | 20 | 1（xx-guards） | 0 | 1 | ok |
| `secret.js` | 40 | 6 | 0 | 1 | 5（sec-overview / sec-ch-0-sec / sec-ch-1-sec / sec-ch-2-sec / sec-ch-3-sec） | 0 | 4 | ok |
| `sect.js` | 64 | 17 | 0 | 15 | 2（sc-gate-card / sc-council） | 0 | 0 | ok |
| `tower.js` | 48 | 10 | 0 | 9 | 1（page-tower） | 0 | 0 | ok |

## 2. 全库反向检查：consumer 有、宿主没有

**0 条。** game.js 等文件里 `getElementById` / `querySelector(井号+x)` / `setTxt` / `seal` / `el` 用到的每一个静态 id，
都能在 `index.html` 或某个视图里找到宿主（动态族 `page-*` / `hub-scroll-*` / `xx-hub-sec-*` / `es-*` / `rr-slot-*` 已按前缀放行）。

## 3. 视图注册一致性

- 已注册的 view key：arena_board、arena_me、arena_shop、bag、chat、chong、dong_alchemy、dong_dongtian、dong_enhance、dong_field、dong_forge、dong_mine、dong_ups、event_daily、event_rew、event_sign、event_union、life_legacy、life_mirror、life_now、market_goods、market_rate、market_sell、market_tianji、multi、rank、role_equip、role_journal、role_miles、role_npc、role_story、role_wu、secret_ch0、secret_ch1、secret_ch2、secret_ch3、tower、xiu_acts、xiu_cult、xiu_identity、xiu_log、xiu_quest、xx-alchemy、xx-dongtian、xx-forge、xx-tianji、xx-union、xx-ups、zong_council、zong_gate、zong_help、zong_seek、zong_weather
- 每个文件注册的 view 数：arena=6 / bag=1 / beast=1 / cave=14 / chat=1 / event=8 / kit=0 / life=6 / market=8 / multi=1 / rank=1 / role=12 / scripture=10 / secret=8 / sect=10 / tower=1
- 有文件但一个 view 都没注册：无

## 4. 结论

- 16 个视图全部通过 `node --check`。
- 全部无内联 `on*=` 事件，交互一律 `data-*` + 容器级委托（与 D-003 的架构一致）。
- 无「consumer 有、宿主无」的孤儿 id → 不存在"运行时一定 null"的取值。
- 「无引用 id」都是结构性/装饰性节点（列表见上表），没有一个可交互控件（按钮/input/select 全部有消费方）。
- 逻辑类检查结论逐文件如下（判空 / 错对象 / 数据写入）。

## 5. 逐文件结论（本轮实际检查范围）

| 文件 | 检查范围 | 结论 |
|---|---|---|
| `arena.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题。论剑台面板只提供容器，数据由 game.js renderArena 填；无内联事件。本轮未发现问题。 |
| `bag.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题。背包格与详情弹窗的容器都有人消费；弹窗按钮走 #it-acts 的委托（D-004 修过闭包锁死）。本轮未发现问题。 |
| `beast.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题。灵兽页容器由 renderBeast 填；#xx-feed/#xx-release/#xx-hatch 走委托（D-003）。本轮未发现问题。 |
| `cave.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题（28 个 id / 25 个被引用）。CAVE_RES 在同一文件被两处引用（hub 的 lead 与子页 strip），两处互斥不同屏，当前安全；已在此记录为若将来同屏会只写第一个的脆弱点。本轮未发现需要改的缺陷。 |
| `chat.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题。传音面板容器由 SECT 模块填；无内联事件。本轮未发现问题。 |
| `event.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题。签到/仙盟/日常三块容器都在 game.js 有渲染函数；本轮修的是它们背后的日期判定（daily.js / game.js 的 dayNo），不在本文件。 |
| `kit.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | 共享工具库（HUBKIT.define / panel 生成器），本身不注册 view，属设计如此。它会在运行时拼出 page-/hub-scroll-/xx-hub-sec- 等 id，已在本脚本里按前缀放行，避免误报。本轮未发现问题。 |
| `life.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题。#xx-mf-calm-opts 无人引用（renderCalm 用父容器 #xx-mf-calm 上的委托 + [data-calm] 取按钮），属装饰性 id，保留。本轮未发现问题。 |
| `market.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题。命名有两套前缀（三个子页 mk-*-sec，天机阁子页写成 xx-tianji），不一致但不影响功能；本轮只记观察，不改（改名要动 index.html 的 data-scroll 与 game.js 两处，收益为零）。本轮修的墨晕按 data-slot 定位在 game.js。 |
| `multi.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | **本轮发现并修复**：整张 #xx-multi-hall 在 offline 态被 game.js 藏起，而全库唯一的服务地址输入框在里面 → 联机入口死锁。另有 .ch-input[hidden]/.mc-opts[hidden] 被作者 display 覆盖。已在 style.css / game.js 修，并加真实浏览器探针（tools/d006-multi-offline-probe.js）四视口 36 断言守护。 |
| `rank.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题。#xx-hero-rank 与 game.js 的 renderRank 一致（D-004 曾把这里错写成 #xx-rank 并被抓回）。本轮未发现问题。 |
| `role.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题。es-weapon/es-armor/es-accessory 与 EQUIP_SLOTS 对齐；#npc-portrait 无人引用（立绘纯样式，无 JS 状态钩子），属装饰性 id。本轮未发现问题。 |
| `scripture.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题。#xx-guards 无人引用（只有两个子 checkbox 的 id 被读），属装饰性 id。本轮未发现问题。 |
| `secret.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题。5 个未引用 id 都是章节容器（sec-overview / sec-ch-N-sec），内容由 renderSecret 按 data 属性填。本轮修的秘境扫荡日期判定在 game.js。 |
| `sect.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题。sc-gate-card / sc-council 无人引用（内容由 renderSect 填父容器），属装饰性 id。前缀 sc- 与主场景同名族但当前无重名（已实测）。本轮未发现问题。 |
| `tower.js` | 语法 + 全部静态 id 的宿主/引用链 + 内联事件 + 数据写入路径 | id 层无问题。#page-tower 是页面壳；#xx-multi-open 通往联机页（本轮修的就是它跳过去之后进不去的死锁）。本轮未发现问题。 |

### 说明

- 上表第 2 列是**每个文件都跑了**的自动项，第 3 列是本轮针对该文件的结论。
- 逐文件阅读由四路并行只读审查完成；本脚本复核了其中**所有可自动化的部分**，并逐条核对了它报出的每个问题在源码里的位置。
- 「未发现问题」指本轮这轮检查（id 链 / 判空 / 内联事件 / 数据写入）没有发现缺陷，不等于该文件永久免疫。

