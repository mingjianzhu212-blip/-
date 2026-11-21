# 任务交接：纸签提示文字 360px 窄屏截断修复

> 本文件是 WorkBuddy 交给 **Qoder CN** 的一次垂直切片任务交接。
> 执行前请先完整阅读项目根目录 `AGENTS.md`（项目总控规则），本任务所有约束以 `AGENTS.md` 为底线，冲突时先报告、不自行猜测。
> 本任务只做方案已确认的最小修改，**不扩大范围、不顺手重构**。

---

## 0. 一句话目标

在 `≤430px` 窄屏下，纸签提示 `.st-hint` 不再用省略号截断，改为**允许折行完整显示**；并**新增真正覆盖 360px 内容宽度的自动化测试**，同时保留原有 `s1HintFit` 断言。

---

## 1. 任务目标与玩家体验

- **玩家体验目标**：用 360px 宽的真机（或等效窄视口）打开游戏时，纸签上每条新手/道途提示都能**完整看见**，不再被「…」吃掉尾部文字；桌面端显示与现在完全一致。
- **当前实现事实**（现场已读，见 §2 证据）：`.st-hint` 是 `nowrap + ellipsis`，窄屏只降字号、不解除省略号；360px 实机下纸签可用宽度约 225px，最长提示约 27 字（≈260px）超出后被截断。
- **现状与目标差距**：W3 已修复"无头 504 档截断 + 假绿闸门"，但 360px 真机残留未处理（HANDOVER §10.15⑤ 明列为待办）。
- **兼容性分析**：纯 CSS 显示规则变更，不动存档、不动文案、不动数值；折行使纸签高度略增，需验收不压到其他元素。

---

## 2. 问题证据（现场读取，非推测）

### 2.1 已修复的 W3 核心问题（本次**不重复**做）
- `HANDOVER.md:609`：W3 第一版 45 字新文案在 283px 实测宽度下被截成「要往更…」而八套全绿；随后压到 25–26 字，并加 `s1HintFit` 几何闸门（`cap>150` 防假绿）。
- `verify.js:3001–3015` + `3507–3508`：已断言 23 条提示在"可测宽度"下一条不截——但该修复针对**桌面/无头 504px 钳制档**，八套全绿已验证。

### 2.2 本次待解决的 360px 残留（HANDOVER §10.15⑤，未开工）
- `style.css:1131`：`.st-hint{ … white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }`（省略号截断）。
- `style.css:1150–1154`：`@media (max-width:430px)` 内**只把字号降到 `10px`，未解除 `nowrap`/`ellipsis`**。
- `style.css:1151`：`≤430px` 时 `.sc-trail{ width:calc(100vw - 120px); … }` → 360px 实机下 = **240px**，减内边距（7/8px）后文案区约 **225px**。
- `js/game.js:7611–7633`（道途十二程等）多条提示较长：`brk15`、`brk21` 约 **27 字**，`brk25` 约 25 字，`gate`/`brk18`/`brk23` 约 24 字（中文 10px ≈ 10px/字 → 26 字 ≈ 260px > 225px → **仍被省略号吃掉**）。
- `HANDOVER.md:612`⑤ 原文记录："真机 360 宽下纸签容量比本机无头（钳 504）更小，长文案可能截——需单独一轮处理。"
- 根因：`s1HintFit` 量的是无头 504 档下的 `cap`（`verify.js:3008`），**从不设 360px 视口**，故该闸门对 360px 残留是盲的。

---

## 3. 修改文件白名单（仅此两项）

| 文件 | 允许改动 |
| --- | --- |
| `style.css` | 仅 `@media (max-width:430px)` 内 `.st-hint` 规则 |
| `verify.js` | 仅**新增** `s1HintFit360` 断言；原 `s1HintFit` 不动 |

白名单以外文件一律禁止修改（见 §4、§10）。

---

## 4. 明确禁止范围（硬约束）

1. 不修改 `js/game.js` 内的任何提示文案（`hint` 字符串）——长度问题靠折行解决，不缩改文案。
2. 不修改桌面端（>430px）`.st-hint` 原有显示规则（`style.css:1131` 一字不动）。
3. 不重做纸签 UI、不改动 `.sc-trail` 其他属性、不扩大到其他页面或其他 UI 问题。
4. 不删除、不削弱原有 `s1HintFit` 断言（`verify.js:3001–3015`、`3507–3508`）。
5. 不改变 `needG=1.85` 与战力公式。
6. 不破坏 `localStorage` 存档结构与旧档兼容。
7. 不触碰联机安全边界、不部署公网。
8. 不修改 `AGENTS.md`。
9. 不同步主力版、不改动 C 盘旧副本。
10. 不顺手格式化 / 重构 / 清理无关代码。

---

## 5. 主方案与 CSS 修改要求

### 5.1 CSS 改动（最小）
在 `style.css` 的 `@media (max-width:430px)` 块内，将现有这一行：
```css
.st-hint{ font-size:10px; }
```
改为：
```css
.st-hint{ font-size:9.5px; line-height:1.3; white-space:normal; overflow:visible; text-overflow:clip; }
```
**要求**：
- 改动**只发生在 `≤430px` 媒体查询内**；桌面端 `.st-hint` 原规则（`style.css:1131`）**一字不动**。
- `white-space:normal` + `overflow:visible` + `text-overflow:clip` = 长提示在窄屏**折行完整显示**，不再出省略号。
- 不重做纸签 UI、不改 `.sc-trail` 其他属性、不改其他页面。

### 5.2 行为预期
- 长提示在 360px 下折成 2 行显示，尾部文字完整可见。
- 纸签高度因折行略增，**不得压到下方/上方元素**（见 §7 验收第 3 条）。

---

## 6. 新增测试 `s1HintFit360`（写进 `verify.js`）

### 6.1 硬性要求（制作人明确）
- **真正覆盖 360px 内容宽度**：在页内把 `.sc-trail` 强制宽 `240px`、`.st-hint` 字号 `10px`（精确复刻 `≤430` 媒体查询状态），逐条量 **全部 23 条提示**（`T.list` + `XX._trail2.list` + `XX._trail3.list`，同 `s1HintFit` 的遍历来源）。
- **不能只依赖 `scrollWidth <= clientWidth`**，必须同时检查三项：
  1. **文字完整显示（无省略号）**：比对元素 `textContent`（去空白）与源 `hint` 字符串长度/内容一致，且未出现 `…` 收尾；
  2. **未被容器高度裁切**：`hintBox.scrollHeight <= hintBox.clientHeight + 1`（折行后不得被父容器 `overflow:hidden` 竖向裁掉）；
  3. **360px 实际截图复核**：用 `tools/edge-cdp.js` **截图模式**（该模式会调 `Emulation.setDeviceMetricsOverride` 把视口精确钉死为 `--window-size`，见 `edge-cdp.js:172–175`）在 `360px` 视口实拍纸签可见态，逐张检查无截尾、无溢出、无遮挡。
- **保留原 `s1HintFit` 完全不动**（不得删除或削弱）；新增断言 `s1HintFit360` 必须返回 `'ok'` 才算通过。

### 6.2 实现建议（参考既有 `s1HintFit` 写法，verify.js:3001–3015）
```js
/* ===== 新增：360px 真机窄屏残留闸门（不改动原 s1HintFit） ===== */
for (var z0 = 0; z0 < 6 && window.ROUTER.depth() > 0; z0++) window.ROUTER.back();
const tBox2 = document.getElementById('sc-trail');
const hintBox2 = document.getElementById('st-hint');
const wasHidden2 = tBox2.hidden; tBox2.hidden = false;
const savedW = tBox2.style.width, savedF = hintBox2.style.fontSize;
tBox2.style.width = '240px'; hintBox2.style.fontSize = '10px';   // 复刻 ≤430 媒体查询状态
const clip360 = [];
[].concat(T.list, XX._trail2.list, XX._trail3.list).forEach(function(st){
  hintBox2.textContent = st.hint;
  const hClipped = hintBox2.scrollWidth > hintBox2.clientWidth + 1;       // 宽度裁切
  const vClipped = hintBox2.scrollHeight > hintBox2.clientHeight + 1;     // 高度裁切
  const textOk   = (hintBox2.textContent.replace(/\s/g,'')).length === (st.hint.replace(/\s/g,'')).length
                   && hintBox2.textContent.indexOf('…') < 0;             // 文字完整、无省略号
  if (hClipped || vClipped || !textOk) clip360.push(st.key + '(w='+hClipped+',v='+vClipped+',t='+textOk+')');
});
L('s1HintFit360', clip360.length === 0 ? 'ok' : 'bad:' + clip360.join(','));
tBox2.style.width = savedW; hintBox2.style.fontSize = savedF; tBox2.hidden = wasHidden2;
```
> 说明：`overflow:visible` 下 `scrollHeight` 仍如实反映内容高度，`vClipped` 用于捕获"父容器高度不够导致折行后底部被吞"的情况，弥补单纯 `scrollWidth` 的盲区。

### 6.3 360px 截图复核（可视化兜底）
- 用 `tools/edge-cdp.js` 截图模式，例如：
  `node tools/edge-run.js … --screenshot=shot/wb-qc-360-sthint.png --window-size=360,800 file://<项目>/index.html`
- 驱动到纸签可见态（参考 `shot/` 下既有截图脚本的"退到场景根 + 解除 `.sc-trail.hidden`"手法），拍下 360px 纸签帧。
- 由接手方**逐张读图**确认无截尾、无出屏、无遮挡（AGENTS.md §7 要求 UI 改动必须按约定视口查截图）。

---

## 7. 360px 验收标准（逐条可判定）

1. **完整显示**：360px 视口下，全部 23 条提示文字完整可见——无省略号、无高度裁切（`s1HintFit360` 断言通过）。
2. **桌面无回归**：`>430px` 显示与修改前一致；原 `s1HintFit` 断言仍 `ok`。
3. **布局无溢出**：纸签在 360px 下不与其他元素重叠 / 不出屏（`_layout_check` 六视口 + 360 截图复核通过）。
4. **测试全绿**：新增 `s1HintFit360` 通过；原 `s1HintFit` 仍通过；相关回归套件不破。

---

## 8. 回归测试要求（AGENTS.md §7）

**必跑**：
- `node verify`（含 `s1HintFit` + 新增 `s1HintFit360` 全绿）
- `node _layout_check`（六视口 重叠 / 出屏 / 撞栏 / 印文越界）

**建议跑**：
- `node verify_npc_ui`（纸签相关断言）
- `node _playtest`（33 场景回归）

**测试报告须含**（AGENTS.md §7）：实际工作目录、真实执行的命令、完整通过/失败数量、退出码、失败用例与原因、未执行测试及原因。
**禁止**：伪造结果、只贴末几行、删断言/跳用例/降预期制造全绿、把"脚本写好"说成"测试通过"。

---

## 9. 备份与回滚要求（AGENTS.md §8）

- **开工前**：对白名单两文件（`style.css`、`verify.js`）各存一份**带时间戳副本**到 `D:\九霄问道备份\` 下新建目录，并记录 **SHA-256**。
- 仅在**开发版**（当前 D 盘工作区 `D:\xx-scratch\jiuxiao-analysis\九霄问道\`）修改；**未经授权不同步主力版**、不动 C 盘旧副本。
- 修改后列出文件差异，确认**只包含白名单两文件**。
- 回滚 = 用备份副本覆盖该两文件（零副作用）。

---

## 10. 保护红线（AGENTS.md 底线，违反即停）

- 不改变 `needG=1.85` 与战力公式（§1、§5）。
- 不破坏 `localStorage` 存档结构与兼容性（§6）。
- 不触碰联机安全边界、不部署公网（§1）。
- 不修改游戏提示文案（`game.js` 内 `hint` 不动）、不扩大到其他 UI/页面（§4）。
- 不修改 `AGENTS.md`。

---

## 11. 执行顺序（建议）

1. 按 §9 备份两文件并记录哈希。
2. 改 `style.css`（仅 §5.1 一行规则）。
3. 在 `verify.js` 新增 §6 的 `s1HintFit360`（原 `s1HintFit` 不动）。
4. 跑 §8 必跑 + 建议套件，确认全绿、无白名单外差异。
5. 做 §6.3 的 360px 截图复核，读图确认无截尾/溢出。
6. 按 AGENTS.md §11 交付报告格式输出结果，交 WorkBuddy 复查。

---

## 12. 未决 / 备注

- 折行后纸签高度变化已纳入验收（§7.3）。若 360 截图实测发现压到其他元素，**优先微调** `.st-hint` 的 `line-height`/字号或 `.sc-trail` 间距——仍只在白名单（`style.css`）内调整，不扩大。
- 备选"单行收窄方案"（窄化 `.sc-trail` + 缩字号）已被制作人否决，本任务采用**折行主方案**。
- 本交接文件由 WorkBuddy 生成，仅作任务说明；代码修改由 Qoder CN 在开发版执行，WorkBuddy 负责后续复查与交付审核。

---

*生成时间：2026-11-01｜生成方：WorkBuddy｜交接对象：Qoder CN｜状态：待 Qoder CN 接手执行*
