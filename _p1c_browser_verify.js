'use strict';
/* P1-C（D1=(a) S.path）真实浏览器专项验证 · 2026-11-12
 * 复用项目既有脚手架 tools/edge-run + tools/page（headless Edge + CDP 薄壳）。
 * 三场景：A 新档创角必选 / B 老档补选 / C 已选道途不可修改
 * 双视口实拍：360x780、1280x900（创角弹窗 + 只读编辑弹窗）
 * 诚实披露：页内状态断言沿用项目 _playtest.js 惯例的 el.click()（模拟点击），
 *           未覆盖命中测试；另由 CDP 真实鼠标点击补验（见 p1c_real_click.mjs）。
 */
const { execEdge } = require('./tools/edge-run');
const fs = require('node:fs'), path = require('node:path');
const PAGE = require('./tools/page');
const ROOT = __dirname;
PAGE.use(ROOT);
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SHOT_DIR = path.join(ROOT, 'screenshot');
if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });

const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const HELPERS = `
window.__ptDone=function(o){var p=document.getElementById('__pt');if(!p){p=document.createElement('pre');p.id='__pt';p.style.display='none';document.body.appendChild(p);}p.textContent=JSON.stringify(o).replace(/</g,'\\u003c');};
window.onerror=function(m,u,l){try{__ptDone({__err:String(m)+' @'+l});}catch(e){}return false;};
function __vis(id){var e=document.getElementById(id);if(!e)return false;if(e.classList.contains('hidden'))return false;var cs=getComputedStyle(e);return cs.display!=='none'&&cs.visibility!=='hidden';}
function __logHas(t){try{return JSON.stringify(XX._s.log||[]).indexOf(t)>=0;}catch(e){return false;}}
`;

function baseSave(withPath) {
  const t = Date.now();
  const s = {
    name: '巡检', sex: 'm', gender: 'male', robe: 'bai',
    rank: 1, exp: 260, stone: 8600, cave: 2, dan: 1, forge: 0, dao: 0, rootIdx: 2,
    gong1: 1, gong2: 0, gong3: 0, field: 3, mine: 1, herb: 66, ore: 14,
    weapon: 1, weaponLv: 0, bagSize: 20, tower: 1, towerMax: 1, petSlots: 1,
    wisdom: 120, insight: 0, failBonus: 0, guardMirror: 0, guardArray: 0, tianji: 0,
    herb100: 0, herb10000: 0, log: [], bag: [], recipeN: {},
    mastery: { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 },
    stats: { sit: 1, herb: 0, train: 0, enlight: 0, craftPill: 0, explore: 0, hunt: 0,
             enhance: 0, stoneEarned: 0, farmN: 0 },
    pets: [], eggs: [], plots: [],
    arena: { day: '', left: 2, tier: 1, win: 0, lose: 0, rep: 0, foes: [] },
    enc: { t: 0, bubble: null, lastId: '' }, encBuff: { mult: 0, until: 0 },
    miles: {}, milesNew: [], letters: [], story: { claimed: {} },
    equipment: { weapon: null, armor: null, accessory: null },
    acts: { sit: 1, herb: 0, train: 0, enlight: 0, ponder: 0 }, actDay: '', last: t
  };
  if (withPath) s.path = 'sword';
  return s;
}

/* 场景 A：全新档，创角必选拦截 */
const BODY_A = `
setTimeout(function(){
  var box=document.getElementById('char-path-picks'), lab=document.getElementById('char-path-label');
  var btns=box?box.querySelectorAll('button.char-pick'):[];
  var before={modal:__vis('char-modal'),picks:btns.length,label:lab?lab.textContent:'',path:XX._s.path};
  var cf=document.getElementById('char-confirm'); if(cf) cf.click();
  setTimeout(function(){
    __ptDone({scene:'A',before:before,
      blocked_modalStillVisible:__vis('char-modal'),
      blocked_pathStillEmpty:XX._s.path==='',
      blocked_logHasPrompt:__logHas('请先选择道途')});
  },250);
},700);`;

/* 场景 B：老档无 path —— 补选入口提示 + 补选可写本源 */
const BODY_B = `
setTimeout(function(){
  var hint=__logHas('你尚未选择道途');
  var ed=document.getElementById('m-char'); if(ed) ed.click();
  setTimeout(function(){
    var box=document.getElementById('char-path-picks'), lab=document.getElementById('char-path-label');
    var btns=box?box.querySelectorAll('button.char-pick'):[];
    var ro=box?box.querySelectorAll('div.char-pick.readonly'):[];
    var snap={picks:btns.length,readonly:ro.length,label:lab?lab.textContent:'',pathBefore:XX._s.path};
    var pick=box?box.querySelector('button.char-pick[data-path="body"]'):null; if(pick) pick.click();
    setTimeout(function(){
      var lab2=document.getElementById('char-path-label');
      var cf=document.getElementById('char-confirm'); if(cf) cf.click();
      setTimeout(function(){
        __ptDone({scene:'B',hintAtBoot:hint,opened:snap,
          labelAfterPick:lab2?lab2.textContent:'',
          pathAfterConfirm:XX._s.path,
          modalHiddenAfterConfirm:!__vis('char-modal')});
      },250);
    },250);
  },250);
},700);`;

/* 场景 C：老档已有 path='sword' —— 只读、不可转职 */
const BODY_C = `
setTimeout(function(){
  var p0=XX._s.path;
  var ed=document.getElementById('m-char'); if(ed) ed.click();
  setTimeout(function(){
    var box=document.getElementById('char-path-picks'), lab=document.getElementById('char-path-label');
    var btns=box?box.querySelectorAll('button.char-pick'):[];
    var ro=box?box.querySelectorAll('div.char-pick.readonly'):[];
    var snap={picks:btns.length,readonly:ro.length,label:lab?lab.textContent:'',labelLocked:/终身道途/.test(lab?lab.textContent:'')};
    var d=box?box.querySelector('div.char-pick.readonly[data-path="array"]'):null; if(d) d.click();
    var cf=document.getElementById('char-confirm'); if(cf) cf.click();
    setTimeout(function(){
      __ptDone({scene:'C',opened:snap,pathBefore:p0,pathAfterEdit:XX._s.path,
        unchanged:XX._s.path===p0});
    },250);
  },250);
},700);`;

const SCENES = [
  { id:'A', body:BODY_A, save:null },
  { id:'B', body:BODY_B, save:()=>baseSave(false) },
  { id:'C', body:BODY_C, save:()=>baseSave(true) }
];

function buildPage(sc, extraCss) {
  const file = path.join(PAGE.SCRATCH, '._p1c_' + sc.id + '_' + process.pid + '.html');
  const seed = sc.save
    ? '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(sc.save())) +
      ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>'
    : '';
  const tail = '<script>' + HELPERS + '\nsetTimeout(function(){try{\n' + sc.body +
    '\n}catch(e){__ptDone({__err:String((e&&e.stack)||e)});}},400);' +
    '\nsetTimeout(function(){if(!document.getElementById("__pt"))__ptDone({__timeout:true});},9000);' +
    '</scr' + 'ipt>';
  PAGE.writePage(file, HTML
    .replace('</head>', seed + '\n</head>')
    .replace('</body>', FREEZE + (extraCss || '') + tail + '\n</body>'));
  return file;
}

function runProbe(sc) {
  const file = buildPage(sc);
  const ud = path.join(PAGE.SCRATCH, 'p1cud' + process.pid + '_' + sc.id + '_' + Date.now());
  let dom = '';
  try {
    dom = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars',
      '--user-data-dir=' + ud, '--virtual-time-budget=11000', '--window-size=900,1200',
      '--dump-dom', 'file:///' + file.replace(/\\/g,'/')],
      { encoding:'utf8', timeout:120000, maxBuffer:1<<26, stdio:['ignore','pipe','ignore'] });
  } catch(e) { dom = String((e&&e.stdout)||''); }
  finally {
    try{ fs.rmSync(file,{force:true}); }catch(e){}
    try{ fs.rmSync(ud,{recursive:true,force:true}); }catch(e){}
  }
  const m = dom.match(/<pre id="__pt"[^>]*>([\s\S]*?)<\/pre>/);
  if(!m) return { err:'探针无回报' };
  try { return JSON.parse(m[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')); }
  catch(e){ return { err:'解析失败: '+m[1].slice(0,120) }; }
}

function shot(id, sc, size, extraCss) {
  const file = buildPage(sc, extraCss);
  const out = path.join(SHOT_DIR, 'p1c_' + id + '_' + size.split(',')[0] + '.png');
  const ud = path.join(PAGE.SCRATCH, 'p1csh' + process.pid + '_' + id + '_' + Date.now());
  try {
    execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars',
      '--user-data-dir='+ud, '--virtual-time-budget=6000', '--window-size='+size,
      '--screenshot='+out, 'file:///'+file.replace(/\\/g,'/')],
      { encoding:'utf8', timeout:120000, maxBuffer:1<<26, stdio:['ignore','pipe','ignore'] });
  } catch(e) { /* 截图失败由下方检查文件 */ }
  finally {
    try{ fs.rmSync(file,{force:true}); }catch(e){}
    try{ fs.rmSync(ud,{recursive:true,force:true}); }catch(e){}
  }
  return { out, ok: fs.existsSync(out), bytes: fs.existsSync(out)?fs.statSync(out).size:0 };
}

/* 截图页：打开弹窗后停在弹窗上（不确认），用于目视 */
const SHOT_NEW = { id:'SN', save:null, body:`setTimeout(function(){ document.getElementById('__pt'); },100);` };
/* 老档会触发 #story-modal 剧情卡遮挡编辑弹窗：先真实点其「继续」按钮清空队列（不屏蔽任何 DOM），
   再打开 #m-char 编辑弹窗。页内 .click() 沿用项目 _playtest.js 惯例，已在文件头披露。 */
const SHOT_EDIT = { id:'SE', save:()=>baseSave(true), body:`
  var n=0; var iv=setInterval(function(){
    n++; var sm=document.getElementById('story-modal');
    if(sm && !sm.classList.contains('hidden')){ var b=document.getElementById('sto-close'); if(b) b.click(); }
    if(n>10) clearInterval(iv);
  },260);
  setTimeout(function(){ var e=document.getElementById('m-char'); if(e) e.click(); },2800);
` };

function main(){
  console.log('=== P1-C 真实浏览器专项验证 ===\n');
  let pass=0, fail=0;
  const chk=(ok,label,detail)=>{ if(ok)pass++;else fail++; console.log('  '+(ok?'✓':'✗')+' '+label+(detail?'   ['+detail+']':'')); };
  SCENES.forEach(sc=>{
    const d = runProbe(sc);
    console.log('▶ 场景 '+sc.id+'  '+JSON.stringify(d).slice(0,420));
    if(d.err){ chk(false,'探针可运行',d.err); return; }
    if(d.__err){ chk(false,'无页面异常',d.__err); return; }
    if(sc.id==='A'){
      chk(d.before.modal===true,'新档自动弹出创角弹窗');
      chk(d.before.picks===4,'道途选择器 4 个可点按钮','picks='+d.before.picks);
      chk(/创角必选/.test(d.before.label),'标签标注「创角必选」',d.before.label);
      chk(d.blocked_modalStillVisible===true,'未选道途时确认被拦截（弹窗不关）');
      chk(d.blocked_pathStillEmpty===true,'拦截后 S.path 仍为空');
      chk(d.blocked_logHasPrompt===true,'输出「请先选择道途」提示');
    }
    if(sc.id==='B'){
      chk(d.hintAtBoot===true,'老档开局输出补选提示');
      chk(d.opened.picks===4,'补选界面 4 个可点按钮','picks='+d.opened.picks);
      chk(d.opened.readonly===0,'补选界面无只读项','readonly='+d.opened.readonly);
      chk(/老档补选/.test(d.opened.label),'标签标注「老档补选」',d.opened.label);
      chk(/已选道途/.test(d.labelAfterPick),'点选后标签更新为已选',d.labelAfterPick);
      chk(d.pathAfterConfirm==='body','确认后本源写入 body','path='+d.pathAfterConfirm);
      chk(d.modalHiddenAfterConfirm===true,'确认后弹窗关闭');
    }
    if(sc.id==='C'){
      chk(d.opened.picks===0,'已选道途编辑态无可点按钮','picks='+d.opened.picks);
      chk(d.opened.readonly===4,'渲染 4 个只读 div','readonly='+d.opened.readonly);
      chk(d.opened.labelLocked===true,'标签显示「终身道途，不可更改」',d.opened.label);
      chk(d.pathBefore==='sword','初始 S.path=sword');
      chk(d.unchanged===true,'点击只读项并确认后 S.path 不变（禁止转职）','path='+d.pathAfterEdit);
    }
  });
  console.log('\n=== 双视口实拍 ===');
  [['new360',SHOT_NEW,'360,780'],['new1280',SHOT_NEW,'1280,900'],
   ['edit360',SHOT_EDIT,'360,780'],['edit1280',SHOT_EDIT,'1280,900']].forEach(([id,sc,size])=>{
    const r = shot(id,sc,size);
    chk(r.ok && r.bytes>1000, id+' 截图生成', r.out+' '+(r.bytes||0)+'B');
  });
  console.log('\n—— '+(pass+fail)+' 项断言 · 通过 '+pass+' / 失败 '+fail);
  return fail?1:0;
}
process.exit(main());
