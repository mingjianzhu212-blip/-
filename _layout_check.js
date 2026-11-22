'use strict';
/* 布局体检：在多种窗口尺寸下量印章几何（重叠 / 出屏 / 撞栏），比肉眼看图靠谱。
   用法：node _layout_check.js   （尺寸表在下面 SIZES 里改） */
const { execFileSync } = require('node:child_process');
const { execEdge } = require('./tools/edge-run');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
/* 2026-10-26 用户要求：临时产物（浏览器 profile / 截图 / 中间 HTML）一律落 D 盘，不写 C 盘；D 不可用时退回系统 temp。 */
const SCRATCH = (function(){ try{ const p = 'D:/xx-scratch'; fs.mkdirSync(p, { recursive: true }); return p; }catch(e){ return os.tmpdir(); } })();
const ROOT = __dirname;
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const PROBE = '<style>#char-modal{display:none!important}</style>' +
  '<script>setTimeout(()=>{' +
  'const d=document.createElement("pre");d.id="x";document.body.appendChild(d);' +
  'try{' +
  'ROUTER.showScene("town");' +
  'const E=Array.prototype.slice.call(document.querySelectorAll(".town-blds .bld.art"));' +
  'const R=E.map(e=>e.getBoundingClientRect());' +
  'let ov=0;for(let i=0;i<R.length;i++)for(let j=i+1;j<R.length;j++){const a=R[i],b=R[j];' +
  'if(a.left<b.right-4&&b.left<a.right-4&&a.top<b.bottom-4&&b.top<a.bottom-4)ov++;}' +
  'const out=R.filter(r=>r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight).length;' +
  'const BE=Array.prototype.slice.call(document.querySelectorAll(".topbar,.scene-tabs,.act-rail,.sys-rail"));' +
  'const bk=BE.map(e=>e.className.split(" ")[0]);' +
  'const B=BE.map(e=>e.getBoundingClientRect());' +
  'let hit=0,hd=[];R.forEach((s,i)=>B.forEach((b,k)=>{if(s.left<b.right-4&&b.left<s.right-4&&s.top<b.bottom-4&&b.top<s.bottom-4){hit++;hd.push(E[i].textContent.trim().slice(0,4)+"x"+bk[k]+" [btn "+[s.left,s.top,s.right,s.bottom].map(v=>Math.round(v))+" vs "+bk[k]+" "+[b.left,b.top,b.right,b.bottom].map(v=>Math.round(v))+"]");}}));' +
  'let bad=0,bd=[];E.forEach(e=>{const er=e.getBoundingClientRect();const lv=[];const t=e.querySelector(".bld-title");' +
  'if(t){const is=t.querySelectorAll("i");if(is.length){is.forEach(x=>lv.push(x));}else lv.push(t);}' +
  'e.querySelectorAll(".bld-sub").forEach(x=>lv.push(x));' +
  'lv.forEach(x=>{const r=x.getBoundingClientRect();if(r.height>er.height*0.88||r.width>er.width*0.88){bad++;bd.push(x.textContent.trim().slice(0,4)+" "+Math.round(r.width)+"x"+Math.round(r.height)+" in "+Math.round(er.width)+"x"+Math.round(er.height));}});});' +
  'const sz=Array.from(new Set(E.map(e=>Math.round(e.offsetWidth)))).sort((a,b)=>a-b).join("/");' +
  'd.textContent=innerWidth+"x"+innerHeight+"  n="+R.length+"  重叠="+ov+"  出屏="+out+"  撞栏="+hit+(hd.length?"("+hd.join(",")+")":"")+"  印文越界="+bad+(bd.length?"("+bd.join(",")+")":"")+"  尺寸="+sz;' +
  '}catch(err){d.textContent="ERR "+err.message;}' +
  '},500);</script>';

const PAGE = require('./tools/page');
PAGE.use(ROOT);
const f = path.join(SCRATCH, '._layout.html');
PAGE.writePage(f, html.replace('</body>', PROBE + '</body>'), 'utf8');

[['360','640'],['393','720'],['430','900'],['720','1100'],['1100','720'],['1280','800']].forEach(([w, h]) => {
  const ud = path.join(SCRATCH, 'xxlay' + Date.now() + Math.random().toString(36).slice(2, 6));
  let dom = '';
  try {
    dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
      '--user-data-dir=' + ud, '--virtual-time-budget=4000', '--window-size=' + w + ',' + h,
      '--dump-dom', 'file:///' + f.replace(/\\/g, '/')],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { dom = (e.stdout || '') + ''; }
  const m = dom.match(/<pre id="x">([\s\S]*?)<\/pre>/);
  console.log(m ? m[1] : (w + 'x' + h + '  NOT FOUND'));
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
});

/* 第 98 轮：洞府子页账条排布。宽度 ≥760 必须一条五格；不足 760 走 3 列两行且末格跨两列补位，
   末行右缘要贴到网格右边（留白 = 有一格空着，第 98 轮之前子页账条就是这样 3+2 空一格）。 */
const STRIP = '<style>#char-modal{display:none!important}</style>' +
  '<script>setTimeout(()=>{' +
  'try{Guide.skip();XX._s.name="青玄子";XX._s.sex="m";XX._render();ROUTER.open("dong","xx-dongtian-sec");}catch(e){}' +
  'setTimeout(()=>{const d=document.createElement("pre");d.id="st";try{' +
  'const g=document.querySelector("#page-dong.hub-sub .page-res");' +
  'const gr=g.getBoundingClientRect(),cr=g.children[0].getBoundingClientRect();' +
  'const cols=Math.round((gr.width+7)/(cr.width+7));' +
  'const tops=Array.from(new Set(Array.prototype.map.call(g.children,c=>Math.round(c.getBoundingClientRect().top))));' +
  'const lc=g.children[g.children.length-1].getBoundingClientRect();' +
  'd.textContent=innerWidth+"  列="+cols+"  行="+tops.length+"  末行"+(gr.right-lc.right<3?"补满":"留白"+Math.round(gr.right-lc.right));' +
  '}catch(err){d.textContent="ERR "+err.message;}' +
  'document.body.appendChild(d);},800);},400);</script>';
PAGE.writePage(f, html.replace('</body>', STRIP + '</body>'), 'utf8');
[['900','1200'],['720','900']].forEach(([w, h]) => {
  const ud = path.join(SCRATCH, 'xxst' + Date.now() + Math.random().toString(36).slice(2, 6));
  let dom = '';
  try {
    dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
      '--user-data-dir=' + ud, '--virtual-time-budget=4000', '--window-size=' + w + ',' + h,
      '--dump-dom', 'file:///' + f.replace(/\\/g, '/')],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { dom = (e.stdout || '') + ''; }
  const m = dom.match(/<pre id="st">([\s\S]*?)<\/pre>/);
  console.log('账条  ' + (m ? m[1] : w + 'x' + h + '  NOT FOUND'));
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
});

/* 第 85 轮补：减少动效兜底实测。Edge 不吃 --force-prefers-reduced-motion（matchMedia 仍是 false），
   走 edge-cdp 的 --reduced-motion（CDP Emulation.setEmulatedMedia）才有用。
   同一页跑两遍，逐元素量「还在动」的动画与过渡；降级后应当都是 0。 */
const RM = '<style>#char-modal{display:none!important}</style>' +
  '<script>setTimeout(()=>{' +
  'try{Guide.skip();XX._s.name="青玄子";XX._s.sex="m";XX._render();ROUTER.open("dong");}catch(e){}' +
  'setTimeout(()=>{let a=0,t=0;document.querySelectorAll("*").forEach(el=>{const cs=getComputedStyle(el);' +
  'if(cs.animationName!=="none"){cs.animationDuration.split(",").forEach(d=>{if(parseFloat(d)>0.01)a++;});}' +
  'cs.transitionDuration.split(",").forEach(d=>{if(parseFloat(d)>0.01)t++;});});' +
  'const d=document.createElement("pre");d.id="rm";' +
  'd.textContent=(matchMedia("(prefers-reduced-motion: reduce)").matches?"reduce":"normal")+"  动画="+a+"  过渡="+t;' +
  'document.body.appendChild(d);},700);},400);</script>';
PAGE.writePage(f, html.replace('</body>', RM + '</body>'), 'utf8');
[false, true].forEach(rm => {
  const ud = path.join(SCRATCH, 'xxrm' + Date.now() + '_' + (rm ? 'reduce' : 'normal'));
  let dom = '';
  try {
    dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
      '--user-data-dir=' + ud, '--virtual-time-budget=4000', '--window-size=900,1200']
      .concat(rm ? ['--reduced-motion'] : [])
      .concat(['--dump-dom', 'file:///' + f.replace(/\\/g, '/')]),
      { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { dom = (e.stdout || '') + ''; }
  const m = dom.match(/<pre id="rm">([\s\S]*?)<\/pre>/);
  console.log('动效  ' + (m ? m[1] : 'NOT FOUND'));
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
});
fs.rmSync(f, { force: true });
