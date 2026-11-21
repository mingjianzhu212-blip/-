'use strict';
/* 联机页离线态可用性体检（D-006-A）
 *
 * 为什么要单独测：修的是一个"闭环死锁"——
 *   renderMulti 原先把 #xx-multi-hall 的 hidden 设成 `st !== 'lobby'`，
 *   而全库唯一能填服务地址的输入框（#xx-multi-srv）就在那张卡里；
 *   state 只能由 Net.connect 改成 lobby，connect 又只由卡内的 #xx-multi-join 触发。
 *   → offline 把卡藏起来 = 玩家永远进不去，且因为 online 态自洽所以没人报错。
 * 这个脚本用真实 headless Edge 打开真实 index.html，进联机页量真实矩形：
 *   地址框是否可见、是否在视口内、是否真的能点到（elementFromPoint 命中测试）、
 *   点「进入」后地址行是否收起、道号行是否展开。
 *
 * 用法：node tools/d006-multi-offline-probe.js
 */
const { execEdge } = require('./edge-run');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const SCRATCH = (function(){ try{ const p = 'D:/xx-scratch'; fs.mkdirSync(p, { recursive: true }); return p; }catch(e){ return os.tmpdir(); } })();
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const PROBE = '<script>setTimeout(function(){' +
  'var d=document.createElement("pre");d.id="muprobe";document.body.appendChild(d);' +
  'var out=[];' +
  '/* 可见判定：missing / zero（display:none 或零尺寸）/ outx（横向出屏）/ ok。' +
  '   纵向不判"出屏"——面板本身可滚动，内容在折叠线下方是正常的。 */' +
  'function vis(el){if(!el)return "missing";var r=el.getBoundingClientRect();' +
  'if(!(r.width>0&&r.height>0))return "zero";' +
  'if(r.right>innerWidth+1||r.left<-1)return "outx";' +
  'return "ok";}' +
  'try{' +
  'RT.open("multi");' +
  'setTimeout(function(){' +
  '/* ⚠️ 测试让步（如实标注）：本探针用 file:// 打开、没有存档，boot 会弹创角窗并盖住整屏，' +
  '   导致 elementFromPoint 命中测试必然 covered。这里程序化关掉创角窗以模拟"已有存档的玩家"，' +
  '   除此之外不做任何 DOM 干预（不改 hidden、不改样式）。 */' +
  'var cm=document.getElementById("char-modal");' +
  'if(cm)cm.classList.add("hidden");' +
  'try{window.scrollTo(0,0);}catch(e){}' +
  '/* ⚠️ 第二条测试让步：.panel-page.active 有 panelSlide 入场动画（translateX(76px)→none），' +
  '   headless + --virtual-time-budget 不推进 CSS 动画，元素会停在起始帧 → 被误判成横向出屏。' +
  '   这里直接关掉该动画以量最终布局；这不是修样式，只是绕开 headless 的环境限制。 */' +
  'var pgm=document.getElementById("page-multi");if(pgm)pgm.style.animation="none";' +
  '/* ⚠️ 第二条测试让步：.panel-page.active 有 panelSlide 入场动画（translateX(76px)→none），' +
  '   headless + --virtual-time-budget 不推进 CSS 动画，元素会停在起始帧 → 被误判成横向出屏。' +
  '   这里直接关掉该动画以量最终布局；这不是修样式，只是绕开 headless 的环境限制。 */' +
  'var pgm=document.getElementById("page-multi");if(pgm)pgm.style.animation="none";' +
  'var srv=document.getElementById("xx-multi-srv"),go=document.getElementById("xx-multi-go"),' +
  'hall=document.getElementById("xx-multi-hall"),off=document.getElementById("xx-multi-offline"),' +
  'cr=document.getElementById("xx-multi-connrow"),nr=document.getElementById("xx-multi-namerow");' +
  'out.push("hall="+vis(hall));' +
  'out.push("offlineCard="+vis(off));' +
  'out.push("srv="+vis(srv));' +
  'out.push("go="+vis(go));' +
  '/* 先滚到按钮再判定，避免"在折叠线以下"被误判成不可见 */' +
  'if(go&&go.scrollIntoView){try{go.scrollIntoView({block:"center"});}catch(e){}}' +
  'out.push("goAfterScroll="+vis(go));' +
  'out.push("namerowBefore="+vis(nr));' +
  '/* 命中测试：按钮中心点的最顶层元素必须是它自己（没被别的层盖住） */' +
  'var hit="nohit";' +
  'if(go){var r=go.getBoundingClientRect();var t=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);' +
  'hit=(t===go||(t&&go.contains(t)))?"ok":("covered:"+(t?(t.id||t.tagName):"null"));}' +
  'out.push("goHit="+hit);' +
  '/* 程序化点击：只用于验证「进入 → 切到道号行」这条 DOM 逻辑，不等同于真实点击。' +
  '   真实可点性由上面的 elementFromPoint 单独保证。 */' +
  'if(go)go.click();' +
  'setTimeout(function(){' +
  'out.push("connrowAfter="+vis(cr));' +
  'out.push("namerowAfter="+vis(nr));' +
  'var msg=document.getElementById("xx-multi-hallmsg");' +
  'out.push("hallmsg="+(msg&&(msg.textContent||"").trim()?"ok":"empty"));' +
  'function R(el){if(!el)return "nil";var r=el.getBoundingClientRect();return Math.round(r.left)+","+Math.round(r.right);}' +
  'd.textContent=innerWidth+"x"+innerHeight+" "+out.join(" ")+" hallRect="+R(hall)+" goRect="+R(go)+" scrollW="+document.documentElement.scrollWidth;' +
  '},260);' +
  '},520);' +
  '}catch(err){d.textContent="ERR "+err.message;}' +
  '},700);</script>';

const PAGE = require('./page');
PAGE.use(ROOT);
const f = path.join(SCRATCH, '._multiprobe.html');
/* router 暴露的是 window.ROUTER；探针里用 RT 这个短名，避免与页面内变量重名 */
PAGE.writePage(f, html.replace('</body>', PROBE.replace('RT.open', 'ROUTER.open') + '</body>'), 'utf8');

const SIZES = [['360', '740'], ['414', '896'], ['768', '1024'], ['1280', '900']];
let pass = 0, fail = 0;
const ok = (c, label, extra) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); } };

SIZES.forEach(([w, h]) => {
  const ud = path.join(SCRATCH, 'xxmu' + Date.now() + Math.random().toString(36).slice(2, 6));
  let dom = '';
  try {
    dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--user-data-dir=' + ud, '--virtual-time-budget=9000',
      '--window-size=' + w + ',' + h, '--dump-dom', 'file:///' + f.replace(/\\/g, '/')],
      { encoding: 'utf8', timeout: 90000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { dom = (e.stdout || '') + ''; }
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}

  const m = dom.match(/<pre id="muprobe">([\s\S]*?)<\/pre>/);
  const line = m ? m[1].replace(/<[^>]+>/g, '').trim() : 'NO_PROBE';
  console.log('  [' + w + 'x' + h + '] ' + line);

  ok(!!m && !/^ERR/.test(line) && line !== 'NO_PROBE', w + 'x' + h + ': 探针正常执行', line);
  if (!m || /^ERR/.test(line)) return;
  ok(/hall=ok/.test(line), w + 'x' + h + ': 离线态大厅卡可见（死锁根因）');
  ok(/srv=ok/.test(line), w + 'x' + h + ': 服务地址输入框可见且未出屏');
  ok(/goAfterScroll=ok/.test(line), w + 'x' + h + ': 「进入」按钮滚动到可见后仍在视口内');
  ok(/goHit=ok/.test(line), w + 'x' + h + ': 「进入」按钮真实可点（elementFromPoint 命中）');
  ok(/namerowBefore=zero/.test(line), w + 'x' + h + ': 点之前道号行是收起的（[hidden] 真的压住了 display）');
  ok(/connrowAfter=zero/.test(line), w + 'x' + h + ': 点「进入」后地址行收起');
  ok(/namerowAfter=ok/.test(line), w + 'x' + h + ': 点「进入」后道号行展开');
  ok(/hallmsg=ok/.test(line), w + 'x' + h + ': 点「进入」后有可见反馈文案');
});

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
