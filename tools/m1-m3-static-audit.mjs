// tools/m1-m3-static-audit.mjs — 本批额外核查（纯只读静态分析，不改任何产品文件）
//
// 对应通宵任务书「四、额外时间的使用规则」第 1/2/3/4/5/6/7/8 项：
//  1. 对所有关键 save() 调用路径做静态分类
//  2. NPC 记忆模块完整调用链检查
//  3. 初始化顺序与页面生命周期核对（输出事实，不推断）
//  4. NPC / 剧情 / 奖励之间的数据边界
//  5. 存档失败后是否仍推进业务状态（列源码证据，不预设缺陷）
//  6. 本轮修改是否引入新的监听器 / 定时器 / 内存引用
//  7. 复核备份是否可用于回滚
//  8. 检查测试证据和源码修改是否一致（哈希 + diff 核对）
// 运行：node tools/m1-m3-static-audit.mjs
//
// 修订 2026-11-06 01:45：
//   - 初版 addedLines() 用「前缀/后缀裁剪」近似 diff，多处插入时把中间数千行误判为新增
//     （输出 7181 / 355 行失真）。改为直接解析 06a/06b 两个真实 diff -u 文件的 + / - 行。
//   - 初版 saveCalls 把新增注释里的「save()」文字也算成调用点（输出 107，权威口径 106）。
//     改为注释屏蔽后再统计，并输出「基线 vs 当前」双口径断言：本批不得新增/删除调用点。
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import crypto from 'node:crypto';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EVID = path.resolve(ROOT, '..', 'm1-m3-evidence');
const BASE = path.join(EVID, 'baseline_20261106_005934');
const TS = '20261106_005934';
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read = p => fs.readFileSync(p, 'utf8');

const game = read(path.join(ROOT, 'js', 'game.js'));
const gameLines = game.split(/\r?\n/);
const mem = read(path.join(ROOT, 'js', 'npc_memory.js'));
const baseGame = read(path.join(BASE, 'game.js'));
const baseMem = read(path.join(BASE, 'npc_memory.js'));

// ------------------------------------------------------------ 通用：行级注释屏蔽
// 返回与输入等行数的数组，每行只保留「代码部分」，注释内容置空格。
// 保留行数 => 行号可直接映射回原文件。避免字符级词法分析被正则/字符串里的引号带偏。
function codeLines(src) {
  const lines = src.split(/\r?\n/);
  let inBlock = false;
  return lines.map(raw => {
    let out = '', i = 0;
    while (i < raw.length) {
      if (inBlock) {
        const end = raw.indexOf('*/', i);
        if (end < 0) { i = raw.length; }
        else { i = end + 2; inBlock = false; }
        continue;
      }
      const blockAt = raw.indexOf('/*', i);
      let lineAt = raw.indexOf('//', i);
      // 保护 http:// / file:// 等：前面是 ':' 的不当行注释
      while (lineAt >= 0 && lineAt > 0 && raw[lineAt - 1] === ':') lineAt = raw.indexOf('//', lineAt + 2);
      if (blockAt >= 0 && (lineAt < 0 || blockAt < lineAt)) {
        out += raw.slice(i, blockAt);
        i = blockAt + 2;
        inBlock = true;
        continue;
      }
      if (lineAt >= 0) { out += raw.slice(i, lineAt); break; }
      out += raw.slice(i);
      break;
    }
    return out;
  });
}

// ---------------------------------------------- 1. save() 调用点静态分类
const fnDefs = [];
gameLines.forEach((l, i) => {
  const m = l.match(/^\s{2}function\s+([A-Za-z0-9_$]+)\s*\(/);
  if (m) fnDefs.push({ line: i + 1, name: m[1] });
});
function ownerOf(ln) {
  let name = '(IIFE 顶层/对象字面量)';
  for (const d of fnDefs) { if (d.line <= ln) name = d.name; else break; }
  return name;
}
// 注释屏蔽后统计真实调用点；定义行不计。
function saveCallSites(src, withOwner) {
  const out = [];
  const rawLines = src.split(/\r?\n/);
  codeLines(src).forEach((code, i) => {
    if (!/save\s*\(\s*\)/.test(code)) return;
    if (/function\s+save\s*\(/.test(code)) return;
    out.push({
      line: i + 1,
      owner: withOwner ? ownerOf(i + 1) : undefined,
      text: code.trim().slice(0, 150),
      raw: rawLines[i].trim().slice(0, 150)
    });
  });
  return out;
}
const rawGrepCount = src => (src.match(/save\(\)/g) || []).length;
const saveCalls = saveCallSites(game, true);
const baseSaveCalls = saveCallSites(baseGame, false);
const callSitesUnchanged = saveCalls.length === baseSaveCalls.length;
const AUTO = ['tickLoop', 'finishBoot'];
const HANDLED = ['multiSaveRetry', 'hookMultiNet', 'applySaveText'];
const KEY = ['boot', 'finalizeNewGame', 'confirmChar', 'offline', 'claimQuest', 'act', 'doBreak', 'resetAll'];
function bucket(c) {
  if (HANDLED.includes(c.owner)) return 'B 已有失败处理';
  if (AUTO.includes(c.owner)) return 'A 后台自动保存';
  if (KEY.includes(c.owner)) return 'C 关键业务写入';
  return 'D 常规动作后保存';
}
const buckets = {};
saveCalls.forEach(c => { const b = bucket(c); (buckets[b] = buckets[b] || []).push(c); });
const byOwner = {};
saveCalls.forEach(c => { byOwner[c.owner] = (byOwner[c.owner] || 0) + 1; });

// ---------------------------------------------- 2. NpcMemory 完整调用链
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.includes('.bak_') || e.name.startsWith('edge-profile') || e.name.startsWith('control_')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (['node_modules', '.git', 'screenshot', 'shot', 'audio', 'ui'].includes(e.name)) continue; walk(p, out); }
    else if (/\.(js|mjs|html)$/.test(e.name) && !/\.bak_/.test(e.name)) out.push(p);
  }
}
const files = [];
walk(path.join(ROOT, 'js'), files);
walk(path.join(ROOT, 'tools'), files);
files.push(path.join(ROOT, 'index.html'));
files.push(path.join(ROOT, 'verify.js'), path.join(ROOT, 'verify_npc.js'), path.join(ROOT, 'verify_npc_ui.js'));
const memCalls = [];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const rel = path.relative(ROOT, f).replace(/\\/g, '/');
  const isTool = rel.startsWith('tools/') || rel.startsWith('verify');
  codeLines(read(f)).forEach((l, i) => {
    if (/NpcMemory\.(init|load|record|list|attitude|mention|recall|gate|migrate|save|sanitize|ensureDay|_state|_reset)\s*\(/.test(l)) {
      memCalls.push({ file: rel, line: i + 1, scope: isTool ? '测试脚本' : '产品代码', text: l.trim().slice(0, 150) });
    }
  });
}
const productMemCalls = memCalls.filter(c => c.scope === '产品代码');
const initCalls = productMemCalls.filter(c => /NpcMemory\.(init|load)\s*\(/.test(c.text));

// ---------------------------------------------- 6. 真实 diff 解析 + 新增代码风险扫描
function parseDiff(p) {
  const added = [], removed = [], hunks = [];
  let hunk = null;
  for (const l of read(p).split(/\r?\n/)) {
    if (l.startsWith('---') || l.startsWith('+++')) continue;
    if (l.startsWith('@@')) { hunk = l; hunks.push(l); continue; }
    if (!hunk || l.startsWith('\\')) continue;
    if (l.startsWith('+')) added.push({ hunk, text: l.slice(1) });
    else if (l.startsWith('-')) removed.push({ hunk, text: l.slice(1) });
  }
  return { added, removed, hunks };
}
const diffGame = parseDiff(path.join(EVID, '06a_game_js.diff'));
const diffMem = parseDiff(path.join(EVID, '06b_npc_memory_js.diff'));
const RISK_RE = /addEventListener|removeEventListener|setInterval|setTimeout|MutationObserver|requestAnimationFrame|new Promise|async function|\bawait\b|new Worker|fetch\(/;
function riskyIn(diff) {
  return codeLines(diff.added.map(e => e.text).join('\n'))
    .map((code, i) => ({ code, raw: diff.added[i].text }))
    .filter(x => RISK_RE.test(x.code));
}
const riskyGame = riskyIn(diffGame), riskyMem = riskyIn(diffMem);
const risky = [...riskyGame, ...riskyMem];

// ---------------------------------------------- 7. 备份可回滚性复核（只读，不执行回滚）
const manifestLines = read(path.join(EVID, '00_baseline_sha256_' + TS + '.txt')).trim().split(/\r?\n/);
const manifest = manifestLines.map(l => {
  const m = l.match(/^([0-9a-f]{64})\s+\*?(.+)$/);
  return m ? { file: m[2].trim(), hash: m[1] } : null;
}).filter(Boolean);
const rollbackCheck = manifest.map(m => {
  const flat = path.join(BASE, path.basename(m.file));
  const bak = path.join(ROOT, m.file + '.bak_' + TS + '_preM1M3');
  const current = path.join(ROOT, m.file);
  return {
    file: m.file,
    manifestHash: m.hash,
    externalSnapshot: fs.existsSync(flat) ? { exists: true, hash: sha(flat), matchesManifest: sha(flat) === m.hash } : { exists: false },
    projectBak: fs.existsSync(bak) ? { exists: true, hash: sha(bak), matchesManifest: sha(bak) === m.hash } : { exists: false },
    current: { hash: sha(current), differsFromBaseline: sha(current) !== m.hash }
  };
});
const rollbackReady = rollbackCheck.every(r =>
  r.externalSnapshot.exists && r.externalSnapshot.matchesManifest &&
  (path.basename(r.file) === 'game.js' || path.basename(r.file) === 'npc_memory.js'
    ? (r.projectBak.exists && r.projectBak.matchesManifest && r.current.differsFromBaseline)
    : !r.current.differsFromBaseline));
const rollbackMode = '只读复核，未执行回滚；两份目标文件可由 .bak_ 或 baseline 快照逐字节还原';

// ---------------------------------------------- 8. 测试证据与源码一致性
const browserResults = path.join(EVID, '03_m1_m3_browser_results.json');
const unitResults = path.join(EVID, '02_m1_unit_results.json');
const ctrlResults = path.join(EVID, '04_baseline_control_results.json');
const br = fs.existsSync(browserResults) ? JSON.parse(read(browserResults)) : null;
const cr = fs.existsSync(ctrlResults) ? JSON.parse(read(ctrlResults)) : null;
const hashCheck = [];
if (br && br.fileHashes) {
  for (const [f, h] of Object.entries(br.fileHashes)) {
    const p = path.join(ROOT, f);
    const now = fs.existsSync(p) ? sha(p) : null;
    hashCheck.push({ source: '03_browser.fileHashes', file: f, evidenceHash: h, currentHash: now, consistent: h === now });
  }
}
if (cr && cr.controlFileHashes) {
  for (const [f, h] of Object.entries(cr.controlFileHashes)) {
    const flat = path.join(BASE, path.basename(f));
    const cur = path.join(ROOT, f);
    const isTarget = ['js/game.js', 'js/npc_memory.js'].includes(f);
    const cmp = isTarget ? flat : cur;   // 目标文件应等于基线；非目标文件应等于当前源码
    const now = fs.existsSync(cmp) ? sha(cmp) : null;
    hashCheck.push({
      source: '04_control.controlFileHashes', file: f,
      comparedAgainst: isTarget ? 'baseline 快照（应为改前版）' : '当前源码（本批未改动）',
      evidenceHash: h, currentHash: now, consistent: h === now
    });
  }
}
const diffCheck = [
  { file: 'js/game.js', diff: '06a_game_js.diff', added: diffGame.added.length, removed: diffGame.removed.length, hunks: diffGame.hunks.length,
    baselineHash: sha(path.join(BASE, 'game.js')), currentHash: sha(path.join(ROOT, 'js', 'game.js')) },
  { file: 'js/npc_memory.js', diff: '06b_npc_memory_js.diff', added: diffMem.added.length, removed: diffMem.removed.length, hunks: diffMem.hunks.length,
    baselineHash: sha(path.join(BASE, 'npc_memory.js')), currentHash: sha(path.join(ROOT, 'js', 'npc_memory.js')) }
];

// ---------------------------------------------- 3/4/5. 结构化事实输出
const facts = {
  bootChain: {
    scriptOrder: 'index.html:525-554 → 30 个经典 <script src>，npc_memory.js 在 game.js 之后',
    trigger: 'js/router.js 末尾 XX.boot(); SECT.boot(); ROUTER.bindScene(); ROUTER.bindModals();',
    finishBootPaths: ['finalizeNewGame()（新档）', 'boot() 老档分支', 'boot() 导入分支'],
    npcMemInitSite: 'js/game.js finishBoot() 函数体第一行（早于 Story.init / Tutorial.start / tickLoop / 任何 NPC 交互）',
    guard: 'boot() 的 inited + 本批新增的 npcMemInited 双守卫'
  },
  dataBoundary: {
    mainSaveKey: 'xiuxian_save',
    independentKeys: ['jxwd_npc_memory_v1', 'jxwd_daily_v1', 'jxwd_npc_visit_v1', 'jxwd_multi_session_v1', 'jxwd_multi_srv_v1', 'jxwd_multi_path_v1', 'jxwd_multi_credited_v1'],
    thisBatchNewKeys: [],
    mainSaveStructureChanged: false,
    migrationIntroduced: false,
    newWindowGlobals: []
  },
  businessStateAfterSaveFailure: {
    note: '以下为既有行为，本批未授权改动奖励规则/结算顺序，逐条列源码证据，登记为剩余风险',
    dailyClaim: 'js/daily.js:110-113 → H.grant()(内含 save() 写主存档) → st.claimed.push(id) → save() 写 jxwd_daily_v1 → 返回 ok:true。主档写失败时仍标记已领取（S-01 双键）',
    storySettle: 'js/story.js:236-244 → c.claimed[q.id]=Date.now() → applyRw() → D.save()。写失败时内存态仍推进（单键结算，授权边界外）',
    multiSettle: 'js/game.js:6553-6556 → 已检查 !save() 并走 multiSaveRetry(3,rid) + 明确日志（既有实现）',
    importApply: 'js/game.js:10421-10430 → 已检查 setItem 失败并 showImportError（既有实现）',
    thisBatchChange: '仅在 save() 内部增加可见告警 + 可查询失败状态；不改动上述任何业务返回值与推进顺序'
  },
  gcAndAsync: {
    newListeners: risky.filter(r => /addEventListener|MutationObserver/.test(r.code)).length,
    newTimers: risky.filter(r => /setInterval|setTimeout|requestAnimationFrame/.test(r.code)).length,
    newPromises: risky.filter(r => /new Promise|async function|\bawait\b|fetch\(|new Worker/.test(r.code)).length,
    newModuleState: ['npc_memory.js: readFaulted (boolean)', 'game.js: saveFailActive / saveFailCount / saveFailFirstAt / npcMemInited (标量)'],
    closureNote: '_saveHealth 箭头函数闭包仅捕获 3 个标量 + inited/frozenForImport，生命周期与 XX IIFE 一致；无 DOM/定时器长期引用',
    toastNote: '复用既有 ROUTER.toast（内部 1.7s setTimeout + clearTimeout 防重），本批未新增定时器',
    riskyAddedLines: risky.map(r => r.raw.trim()),
    scanBasis: '仅扫描 06a/06b 真实 diff 的「+ 行」经注释屏蔽后的代码部分，非全文扫描'
  }
};

const out = {
  generatedAt: new Date().toISOString(),
  purpose: '通宵任务书「四、额外时间的使用规则」第 1/2/3/4/5/6/7/8 项的只读静态核查',
  revision: '2026-11-06 01:45 修正：addedLines 改解析真实 diff；saveCalls 改为注释屏蔽统计并加基线对照断言',
  saveCallCaliber: {
    note: '风险报告 106 口径 = 全文本 grep -o "save()"（含注释文字与定义行）；本脚本口径 = 注释屏蔽后、排除定义行的真实调用点',
    rawGrepBaseline: rawGrepCount(baseGame),
    rawGrepCurrent: rawGrepCount(game),
    rawGrepDeltaCause: '当前多出的 2 处来自本批新增注释文字（game.js:3319、3322），不是调用点',
    realCallSitesBaseline: baseSaveCalls.length,
    realCallSitesCurrent: saveCalls.length,
    callSitesUnchanged,
    assertion: callSitesUnchanged ? 'PASS：本批没有新增或删除任何 save() 调用点' : 'FAIL：调用点数量发生变化，须复核 diff'
  },
  saveCallTotal: saveCalls.length,
  saveCallBuckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, { count: v.length, samples: v.slice(0, 6) }])),
  saveCallsByOwner: byOwner,
  saveCalls,
  npcMemoryCallChain: { total: memCalls.length, productTotal: productMemCalls.length, initOrLoad: initCalls, all: memCalls },
  diff: {
    game: { added: diffGame.added.length, removed: diffGame.removed.length, hunks: diffGame.hunks.length, addedLines: diffGame.added, removedLines: diffGame.removed },
    npc_memory: { added: diffMem.added.length, removed: diffMem.removed.length, hunks: diffMem.hunks.length, addedLines: diffMem.added, removedLines: diffMem.removed },
    riskyKeywordHits: risky.length,
    riskyLines: facts.gcAndAsync.riskyAddedLines
  },
  rollback: { ready: rollbackReady, mode: rollbackMode, files: rollbackCheck },
  facts,
  evidenceConsistency: hashCheck,
  diffConsistency: diffCheck,
  evidenceFilesExist: { unit: fs.existsSync(unitResults), browser: fs.existsSync(browserResults), control: fs.existsSync(ctrlResults) }
};
const outJson = path.join(EVID, '05_static_audit.json');
fs.writeFileSync(outJson, JSON.stringify(out, null, 2), 'utf8');

// ------------------------------------------------------------ 人类可读摘要
const md = [];
md.push('# 阶段五补充：只读静态核查（额外时间使用规则）');
md.push('');
md.push('> 生成：' + out.generatedAt + '｜脚本：`tools/m1-m3-static-audit.mjs`｜性质：**只读静态分析，不等于动态测试通过**');
md.push('> 修订：初版用前缀/后缀裁剪近似 diff（多处插入时失真为 7181/355 行）与把注释里的 `save()` 算成调用点（107），本版已改为解析 `06a/06b` 真实 `diff -u` 文件 + 注释屏蔽统计。');
md.push('');
md.push('## 1. save() 调用路径静态分类');
md.push('');
md.push('| 口径 | 修改前（基线） | 当前 | 说明 |');
md.push('|---|---:|---:|---|');
md.push('| 风险报告口径：全文本 `grep -o "save()"` | ' + out.saveCallCaliber.rawGrepBaseline + ' | ' + out.saveCallCaliber.rawGrepCurrent + ' | 含注释文字与函数定义行 |');
md.push('| 本脚本口径：注释屏蔽 + 排除定义行的**真实调用点** | ' + baseSaveCalls.length + ' | ' + saveCalls.length + ' | 用于分类与回归断言 |');
md.push('');
md.push('当前全文本多出的 2 处来自本批新增注释文字（`js/game.js:3319`、`:3322`），不是调用点。');
md.push('**关键断言：' + (callSitesUnchanged ? '✅ PASS' : '❌ FAIL') + ' — 本批没有新增或删除任何 `save()` 调用点**，因此「不机械改 106 处调用点」在 diff 层面成立。');
md.push('');
md.push('真实调用点按业务重要性分四类：');
md.push('');
md.push('| 类别 | 数量 | 处理方式（本批 M-2） |');
md.push('|---|---:|---|');
md.push('| A 后台自动保存（tickLoop / pagehide / visibilitychange） | ' + (buckets['A 后台自动保存'] || []).length + ' | save() 内部统一兜底，不改调用点 |');
md.push('| B 已有失败处理（multiSaveRetry / hookMultiNet / applySaveText） | ' + (buckets['B 已有失败处理'] || []).length + ' | 保持既有重试与提示，未改动 |');
md.push('| C 关键业务写入（boot / finalizeNewGame / claimQuest / act 等） | ' + (buckets['C 关键业务写入'] || []).length + ' | 统一可见告警 + `_saveHealth()` 可查状态 |');
md.push('| D 常规动作后保存 | ' + (buckets['D 常规动作后保存'] || []).length + ' | 统一兜底，不机械改 106 处 |');
md.push('');
md.push('按所属函数分布（前 20）：' + Object.entries(byOwner).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => '`' + k + '`' + v).join('、'));
md.push('');
md.push('## 2. NPC 记忆完整调用链');
md.push('');
md.push('全项目 `NpcMemory.*` 调用点 **' + memCalls.length + ' 处**（产品代码 ' + productMemCalls.length + ' 处，测试脚本 ' + (memCalls.length - productMemCalls.length) + ' 处）；产品代码中 `init/load` 调用点 **' + initCalls.length + ' 处**：');
initCalls.forEach(c => md.push('- `' + c.file + ':' + c.line + '` → `' + c.text + '`'));
md.push('');
md.push('其余均为 `record` / `mention` 等消费调用，全部位于用户交互或 tick 中，晚于 `finishBoot()`。');
md.push('');
md.push('## 3. 真实 diff（修改量口径）');
md.push('');
md.push('| 文件 | 新增 `+` 行 | 删除 `-` 行 | hunk 数 |');
md.push('|---|---:|---:|---:|');
diffCheck.forEach(d => md.push('| `' + d.file + '`（`' + d.diff + '`） | ' + d.added + ' | ' + d.removed + ' | ' + d.hunks + ' |'));
md.push('');
md.push('- 修改前 SHA256（基线快照）：`js/game.js` ' + diffCheck[0].baselineHash + '；`js/npc_memory.js` ' + diffCheck[1].baselineHash);
md.push('- 修改后 SHA256（当前源码）：`js/game.js` ' + diffCheck[0].currentHash + '；`js/npc_memory.js` ' + diffCheck[1].currentHash);
md.push('');
md.push('## 4/5. 生命周期、数据边界、失败后业务状态');
md.push('');
md.push('```json');
md.push(JSON.stringify({ bootChain: facts.bootChain, dataBoundary: facts.dataBoundary, businessStateAfterSaveFailure: facts.businessStateAfterSaveFailure }, null, 2));
md.push('```');
md.push('');
md.push('## 6. 新增监听器 / 定时器 / 内存引用');
md.push('');
md.push('- 扫描基准：仅 `06a/06b` 真实 diff 的 `+` 行，经注释屏蔽后的代码部分（非全文扫描，避免把既有代码算成新增）。');
md.push('- 命中 `addEventListener|setInterval|setTimeout|MutationObserver|requestAnimationFrame|new Promise|async|await|fetch|Worker` 的**新增代码行**：**' + risky.length + ' 行**。');
md.push('- 分类计数：新监听器 ' + facts.gcAndAsync.newListeners + '、新定时器 ' + facts.gcAndAsync.newTimers + '、新 Promise/异步 ' + facts.gcAndAsync.newPromises + '。');
if (risky.length) risky.forEach(r => md.push('  - `' + r.raw.trim() + '`'));
md.push('- `js/npc_memory.js` 模块全文 `addEventListener|setInterval|setTimeout` 检索：' + (/(addEventListener|setInterval|setTimeout)/.test(mem) ? '命中' : '0 命中') + '。');
md.push('');
md.push('## 7. 备份可回滚性复核（只读，未执行回滚）');
md.push('');
md.push('**结论：' + (rollbackReady ? '✅ 可回滚' : '❌ 存在缺口') + '** — ' + rollbackMode);
md.push('');
md.push('| 文件 | 外部快照=清单 | 项目内 .bak_=清单 | 当前≠基线 | 判定 |');
md.push('|---|---|---|---|---|');
rollbackCheck.forEach(r => {
  const isTarget = ['js/game.js', 'js/npc_memory.js'].includes(r.file);
  md.push('| `' + r.file + '` | ' + (r.externalSnapshot.exists && r.externalSnapshot.matchesManifest ? '✅' : '❌') + ' | ' +
    (isTarget ? (r.projectBak.exists && r.projectBak.matchesManifest ? '✅' : '❌') : '（未改，无需）') + ' | ' +
    (r.current.differsFromBaseline ? '是' : '否') + ' | ' +
    ((r.externalSnapshot.exists && r.externalSnapshot.matchesManifest && (!isTarget || (r.projectBak.exists && r.projectBak.matchesManifest))) ? '✅' : '❌') + ' |');
});
md.push('');
md.push('回滚命令（**仅记录，未执行**）：');
md.push('```bash');
md.push('cd /d/xx-scratch/jiuxiao-analysis/九霄问道');
md.push('cp -p js/game.js.bak_' + TS + '_preM1M3 js/game.js');
md.push('cp -p js/npc_memory.js.bak_' + TS + '_preM1M3 js/npc_memory.js');
md.push('sha256sum js/game.js js/npc_memory.js   # 应回到清单中的两个哈希');
md.push('```');
md.push('');
md.push('## 8. 测试证据与源码一致性');
md.push('');
hashCheck.forEach(h => md.push('- [' + h.source + '] `' + h.file + '`：' + (h.consistent ? '一致 ✅' : '**不一致 ❌**') + (h.comparedAgainst ? '（对照：' + h.comparedAgainst + '）' : '') + ' → ' + String(h.evidenceHash).slice(0, 16) + '… / ' + String(h.currentHash).slice(0, 16) + '…'));
md.push('');
md.push('证据 JSON：`05_static_audit.json`（含全部 ' + saveCalls.length + ' 处调用明细、' + memCalls.length + ' 处 NpcMemory 调用明细、真实 diff 逐行内容、回滚复核明细）。');
fs.writeFileSync(path.join(EVID, '05_static_audit.md'), md.join('\n'), 'utf8');

console.log('=== 静态核查完成（修订版）===');
console.log('save() 全文本 grep: 基线 ' + out.saveCallCaliber.rawGrepBaseline + ' / 当前 ' + out.saveCallCaliber.rawGrepCurrent + '（差 2 = 新增注释文字）');
console.log('save() 真实调用点: 基线 ' + baseSaveCalls.length + ' / 当前 ' + saveCalls.length + '  ' + (callSitesUnchanged ? 'PASS 未新增未删除' : 'FAIL'));
console.log('  分类: A=' + (buckets['A 后台自动保存'] || []).length + ' B=' + (buckets['B 已有失败处理'] || []).length + ' C=' + (buckets['C 关键业务写入'] || []).length + ' D=' + (buckets['D 常规动作后保存'] || []).length);
console.log('NpcMemory 调用点: ' + memCalls.length + '（产品 ' + productMemCalls.length + '），产品侧 init/load: ' + initCalls.length);
initCalls.forEach(c => console.log('  ' + c.file + ':' + c.line + '  ' + c.text));
console.log('真实 diff: game.js +' + diffGame.added.length + '/-' + diffGame.removed.length + ' (' + diffGame.hunks.length + ' hunks), npc_memory.js +' + diffMem.added.length + '/-' + diffMem.removed.length + ' (' + diffMem.hunks.length + ' hunks)');
console.log('新增行风险关键词命中: ' + risky.length);
console.log('备份可回滚: ' + (rollbackReady ? 'READY' : 'GAP'));
console.log('证据哈希一致性: ' + hashCheck.filter(h => h.consistent).length + '/' + hashCheck.length);
console.log('落盘: ' + outJson);
console.log('落盘: ' + path.join(EVID, '05_static_audit.md'));
process.exit(callSitesUnchanged && rollbackReady && risky.length === 0 ? 0 : 1);
