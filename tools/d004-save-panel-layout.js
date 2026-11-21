'use strict';
/* 存档备份面板布局体检（D-004）
 *
 * 为什么需要：本轮给导出区/导入区各加了一段说明文字。
 * 文字变长会改变面板高度、可能挤出可视区或挤压按钮，必须实测而不是肉眼看。
 *
 * 做法与 _layout_check.js 完全一致：把真实 index.html 注入一段探针脚本，
 * 用 headless Edge 打开，量真实矩形（重叠 / 出屏 / 按钮可见性 / 文字横向溢出）。
 *
 * 用法：node tools/d004-save-panel-layout.mjs
 */
const { execFileSync } = require('node:child_process');
const { execEdge } = require('./edge-run');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const SCRATCH = (function(){ try{ const p = 'D:/xx-scratch'; fs.mkdirSync(p, { recursive: true }); return p; }catch(e){ return os.tmpdir(); } })();
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const PROBE = '<script>setTimeout(()=>{' +
  'const d=document.createElement("pre");d.id="svprobe";document.body.appendChild(d);' +
  'try{' +
  'const m=document.getElementById("save-modal");' +
  'if(!m){d.textContent="ERR no save-modal";return;}' +
  'm.classList.remove("hidden");' +
  'const card=m.querySelector(".m-card");' +
  'const cr=card.getBoundingClientRect();' +
  'const hints=Array.prototype.slice.call(card.querySelectorAll(".sv-hint"));' +
  'let ovf=0;hints.forEach(h=>{if(h.scrollWidth>h.clientWidth+1)ovf++;});' +
  'const btns=Array.prototype.slice.call(card.querySelectorAll(".m-btns button"));' +
  'let outBtn=0;const badBtns=[];' +
  'btns.forEach(b=>{const r=b.getBoundingClientRect();' +
  'if(!(r.width>0&&r.height>0)||r.right>innerWidth+1||r.left<-1){outBtn++;badBtns.push((b.textContent||"").trim().slice(0,6));}});' +
  '/* 说明文字与其直接上一个兄弟是否重叠 */' +
  'let ov=0;const ovList=[];' +
  'hints.forEach((h,i)=>{const p=h.previousElementSibling;if(!p)return;' +
  'const a=p.getBoundingClientRect(),b=h.getBoundingClientRect();' +
  'if(b.top<a.bottom-1&&b.bottom>a.top+1&&b.left<a.right-1&&b.right>a.left+1){ov++;ovList.push("hint"+i+"x"+p.tagName);}});' +
  'const cardOut=(cr.right>innerWidth+1||cr.left<-1)?"yes":"no";' +
  'const noScroll=m.scrollHeight>m.clientHeight+2?"yes":"no";' +
  /* 最坏情况：把「仅内存」那一档的真实结构（3 个按钮）注入进去再量一次。
     这一档文字最长、按钮最多，是最容易被挤爆的布局。 */
  'const probeBox=document.createElement("div");' +
  'probeBox.className="sv-corrupt";probeBox.style.marginTop="6px";' +
  'probeBox.innerHTML="⚠️ 上次读档失败，备份键写不进去（存储可能已满或被禁用）。原文（12.3 KB）仍暂存在本页内存里，<b>刷新即丢</b>，请立刻导出：" +' +
  '"<button class=\\"btn-main\\" type=\\"button\\" data-sv-recover=\\"3\\" style=\\"margin-left:6px\\">下载原文</button>" +' +
  '"<button class=\\"btn-plain\\" type=\\"button\\" data-sv-recover=\\"4\\" style=\\"margin-left:6px\\">复制原文</button>" +' +
  '"<button class=\\"btn-ghost\\" type=\\"button\\" data-sv-recover=\\"2\\" style=\\"margin-left:6px\\">载入到导入框</button>";' +
  'card.appendChild(probeBox);' +
  'const cb=cr.bottom;const nb=probeBox.getBoundingClientRect();' +
  'const pBtns=Array.prototype.slice.call(probeBox.querySelectorAll("button"));' +
  'const btnInside=pBtns.every(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>0&&r.right<=innerWidth+1&&r.left>=-1;});' +
  'const btnWrap=pBtns.length===3;' +
  'd.textContent=innerWidth+"x"+innerHeight+" cardW="+Math.round(cr.width)+" cardH="+Math.round(cr.height)+" hints="+hints.length+" hintOvf="+ovf+" btnOut="+outBtn+(badBtns.length?"("+badBtns.join(",")+")":"")+" overlap="+ov+(ovList.length?"("+ovList.join(",")+")":"")+" cardOut="+cardOut+" modalScroll="+noScroll+' +
  '" corruptH="+Math.round(nb.height)+" corruptBtnN="+pBtns.length+" corruptBtnsInside="+(btnInside?"yes":"no")+" corruptTextOvf="+(probeBox.scrollWidth>probeBox.clientWidth+1?"yes":"no");' +
  '}catch(err){d.textContent="ERR "+err.message;}' +
  '},600);</script>';

const PAGE = require('./page');
PAGE.use(ROOT);
const f = path.join(SCRATCH, '._svpanel.html');
PAGE.writePage(f, html.replace('</body>', PROBE + '</body>'), 'utf8');

const SIZES = [['360','740'],['414','896'],['768','1024'],['1280','900']];
let pass = 0, fail = 0;
const ok = (c, label, extra) => { if (c) { pass++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label + (extra ? '  → ' + extra : '')); } };

SIZES.forEach(([w, h]) => {
  const ud = path.join(SCRATCH, 'xxsv' + Date.now() + Math.random().toString(36).slice(2, 6));
  let dom = '';
  try {
    dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--user-data-dir=' + ud, '--virtual-time-budget=6000',
      '--window-size=' + w + ',' + h, '--dump-dom', 'file:///' + f.replace(/\\/g, '/')],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { dom = (e.stdout || '') + ''; }
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}

  const m = dom.match(/<pre id="svprobe">([\s\S]*?)<\/pre>/);
  const line = m ? m[1].trim() : 'NO_PROBE';
  console.log('  [' + w + 'x' + h + '] ' + line);

  ok(m && !/^ERR/.test(line) && line !== 'NO_PROBE', w + 'x' + h + ': 探针正常执行', line);
  if (!m || /^ERR/.test(line)) return;
  ok(/hintOvf=0/.test(line), w + 'x' + h + ': 说明文字无横向溢出');
  ok(/btnOut=0/.test(line), w + 'x' + h + ': 所有按钮都在可视区内并可见');
  ok(/overlap=0/.test(line), w + 'x' + h + ': 说明文字不与相邻元素重叠');
  ok(/cardOut=no/.test(line), w + 'x' + h + ': 面板未横向出屏');
  const hintsN = Number((line.match(/hints=(\d+)/) || [])[1] || 0);
  ok(hintsN >= 3, w + 'x' + h + ': 三段说明文字都在位', String(hintsN));
  /* 最坏情况（仅内存档：3 个按钮 + 最长文案） */
  ok(/corruptBtnN=3/.test(line), w + 'x' + h + ': 毁档提示的三个按钮都渲染出来');
  ok(/corruptBtnsInside=yes/.test(line), w + 'x' + h + ': 三按钮全部在可视区内');
  ok(/corruptTextOvf=no/.test(line), w + 'x' + h + ': 毁档提示文字无横向溢出');
});

console.log('\n通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);
