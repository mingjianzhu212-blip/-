'use strict';
/* 九霄问道 · 沈碑识人页专项验证（切片 2b）
   只测 UI 接线：第 6 格 / 进入子页 / 初见 / 结算落盘 / 解锁 / 回忆版 / 重复交谈 /
   stage 推进 / 重逢快照不被刷新覆盖 / npcArrive 调用点 / 单次结算 / 离页清回复 /
   读档与转世后读取 / 2a 浮片门控·15s·落盘不退化 / 2f 碑外一线清单与两页题注 /
   W1 塔底：三闸门 · 三分支真实点击到账 · 公共道碑 · 两页回响 · 转世与重开。
   W3·S3：识人页锁行的口吻提示（只在 lock 行 · 逐字取配置 · 随解锁消失 · 锁行仍不可点）。
   布局另跑 393 / 900 两遍量几何。
   运行：node verify_npc_ui.js   （依赖无头 Edge；临时页写 D 盘） */
const { execEdge } = require('./tools/edge-run');
const page = require('./tools/page.js');
const fs = require('node:fs');
const path = require('node:path');

const SCRATCH = page.SCRATCH;
const ROOT = path.resolve(__dirname);
page.use(ROOT);
const SRC = path.join(ROOT, 'index.html');

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (e ? '  →  ' + e : '')); } };

const DIAG = `
<script>
(async function(){
  const out=[]; const L=(k,v)=>out.push(k+'='+v);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const q=id=>document.getElementById(id);
  const txt=id=>(q(id)||{}).textContent||'';
  const ST=()=>XX._npcStele();
  /* 分母必须取真实话题数：沈碑 6 个话题里有 1 个 noHear 的道别（永不计入 heard），崔九只有 3 个 */
  const NPCT=()=>((window.Npc&&Npc.NPC_STELE)?Npc.NPC_STELE.topics.filter(t=>!t.noHear).length:0);
  const CQT=()=>((window.NpcTower&&NpcTower.TOPICS)?NpcTower.TOPICS.length:0);
  const saved=()=>{ try{ return JSON.parse(localStorage.getItem('xiuxian_save')||'{}'); }catch(e){ return {}; } };
  let arriveCalls=0, pickCalls=0;
  await sleep(300);
  try{
    const c=q('char-confirm'); if(c) c.click();
    await sleep(600);
    const oa=Npc.npcArrive, op=Npc.npcPick;
    Npc.npcArrive=function(){ arriveCalls++; return oa.apply(this, arguments); };
    Npc.npcPick=function(){ pickCalls++; return op.apply(this, arguments); };
    try{ Tutorial.finish(); }catch(e){}
    try{ Story._STORY.forEach(x=>{ XX._s.story.claimed[x.id]=1; }); Story.closeCard(); }catch(e){}
    document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));

    /* 1) 第 6 格 */
    ROUTER.open('role');
    await sleep(600);
    L('hubCell', !!document.querySelector('#page-role [data-jump="xx-role-npc"]') ? 'ok':'bad');
    L('hubSeal', txt('xx-hub-role-npc'));
    /* 分母必须是「真实可听话题数」（沈碑 6 个话题里有 1 个是 noHear 的道别） */
    L('npcTotal', String(NPCT()));
    L('hubSealOK', txt('xx-hub-role-npc') === '0/' + NPCT() ? 'ok' : 'bad:' + txt('xx-hub-role-npc'));

    /* 2) 初见 */
    ROUTER.open('role','xx-role-npc');
    await sleep(600);
    L('root', !!q('xx-role-npc-root') ? 'ok':'bad');
    L('sceneOff', q('page-scene').classList.contains('active') ? 'bad':'ok');
    L('greet2', q('npc-greet').children.length === 2 ? 'ok':'bad:'+q('npc-greet').children.length);
    L('greetTxt', q('npc-greet').children[0].textContent === Npc.NPC_STELE.first.lines[0] ? 'ok':'bad');
    L('firstOpts', q('npc-opts').querySelectorAll('button').length === 3 ? 'ok':'bad');
    L('topics0', q('npc-topics').children.length === 0 ? 'ok':'bad');
    L('name', txt('npc-name') === '沈碑' ? 'ok':'bad');
    L('title', txt('npc-title') === '守碑老吏' ? 'ok':'bad');
    /* 记忆 NPC 框架第一步（界面去计数）：met=0 时关系行固定为这一句，不再有「关系 0」数字 */
    L('rel0', txt('npc-rel') === '未识 · 观前的碑就是他' ? 'ok':'bad:'+txt('npc-rel'));
    L('arrive1', arriveCalls === 1 ? 'ok':'bad:'+arriveCalls);

    /* 3) 初见结算（真实 DOM 点击走委托） */
    q('npc-opts').querySelector('[data-opt="ask_black"]').click();
    await sleep(500);
    let st=ST();
    L('met1', st.met===1 ? 'ok':'bad');
    L('rel2', st.rel===2 ? 'ok':'bad:'+st.rel);
    L('talk1', st.cur.talk===1 ? 'ok':'bad:'+st.cur.talk);
    L('lastSeen', st.lastSeen>0 ? 'ok':'bad');
    L('savedRel', (saved().npcs||{}).stele && saved().npcs.stele.rel===2 ? 'ok':'bad');
    L('pick1', pickCalls===1 ? 'ok':'bad:'+pickCalls);
    L('replyOn', !q('npc-reply').hidden && txt('npc-reply').indexOf('黑不是脏')>=0 ? 'ok':'bad:'+txt('npc-reply'));
    L('greetKeep', q('npc-greet').children.length===2 && q('npc-greet').children[0].textContent===Npc.NPC_STELE.first.lines[0] ? 'ok':'bad');
    const marks=Array.prototype.map.call(q('npc-topics').querySelectorAll('.sto-h em'), e=>e.textContent).join(',');
    L('marks6', q('npc-topics').children.length===6 ? 'ok':'bad');
    L('marksLock', marks==='可谈,可谈,未解锁,未解锁,未解锁,可谈' ? 'ok':'bad:'+marks);

    /* 3b) W3·S3：锁着的三行各带一句提示，且只在 lock 行里；行仍可点数=6、锁行依然不可点 */
    const hintRows = Array.prototype.slice.call(q('npc-topics').querySelectorAll('.npc-topic'));
    L('s3Rows6', hintRows.length === 6 ? 'ok':'bad:'+hintRows.length);
    L('s3HintN', q('npc-topics').querySelectorAll('.npc-topic > p.sto-hint').length === 3 ? 'ok'
      : 'bad:'+q('npc-topics').querySelectorAll('.npc-topic > p.sto-hint').length);
    L('s3HintWhere', hintRows.map(r => (r.className.indexOf('lock') >= 0) === !!r.querySelector('p.sto-hint') ? '1':'0').join('') === '111111' ? 'ok'
      : 'bad:'+hintRows.map(r => r.className + ':' + (r.querySelector('p.sto-hint') ? 'h':'-')).join('#'));
    const cfgHints = ['stele3','stele4','stele5'].map(id =>
      Npc.NPC_STELE.topics.filter(t => t.id === id)[0].lockHint);
    L('s3HintText', Array.prototype.map.call(q('npc-topics').querySelectorAll('.npc-topic > p.sto-hint'),
      p => p.textContent).join('#') === cfgHints.join('#') ? 'ok'
      : 'bad:' + Array.prototype.map.call(q('npc-topics').querySelectorAll('.npc-topic > p.sto-hint'), p => p.textContent).join('#'));
    /* 提示是 textContent 写进去的：整行文本里不得混进 stage / rel / 数字 */
    L('s3HintNoLeak', /stage|rel|[0-9]/.test(q('npc-topics').textContent) ? 'bad:'+q('npc-topics').textContent.slice(0,40) : 'ok');
    /* 锁行加了子节点后依旧不可点（没有 role=button、没有 data-topic） */
    L('s3LockStillDead', q('npc-topics').querySelectorAll('.npc-topic.lock[role="button"], .npc-topic.lock[data-topic]').length === 0 ? 'ok':'bad');

    /* 4)+5) 打开话题 → 回忆版 */
    q('npc-topics').querySelector('[data-topic="stele1"]').click();
    await sleep(400);
    L('lore', txt('npc-topic-lines').indexOf(Npc.NPC_STELE.topics[0].lore)>=0 ? 'ok':'bad');
    L('opts3', q('npc-opts').querySelectorAll('button').length===3 ? 'ok':'bad');
    L('replyOffOnSwitch', q('npc-reply').hidden ? 'ok':'bad');
    q('npc-opts').querySelector('[data-opt="listen"]').click();
    await sleep(400);
    st=ST();
    L('stage1', st.stage===1 ? 'ok':'bad:'+st.stage);
    L('rel5', st.rel===5 ? 'ok':'bad:'+st.rel);
    L('heard1', st.heard.length===1 && st.heard[0]==='stele1' ? 'ok':'bad');
    L('listened1', st.choice.listened===1 ? 'ok':'bad');
    L('recallMark', txt('npc-topic-lines').indexOf('回忆')>=0 ? 'ok':'bad:'+txt('npc-topic-lines').slice(0,24));
    L('recallNotLore', txt('npc-topic-lines').indexOf(Npc.NPC_STELE.topics[0].lore)<0 ? 'ok':'bad');

    /* 6) 重复交谈 +1 */
    q('npc-opts').querySelector('[data-opt="press"]').click();
    await sleep(400);
    st=ST();
    L('rel6', st.rel===6 ? 'ok':'bad:'+st.rel);
    L('talk3', st.cur.talk===3 ? 'ok':'bad:'+st.cur.talk);

    /* 7) stage 推进链 */
    q('npc-topics').querySelector('[data-topic="stele3"]').click();
    await sleep(300);
    q('npc-opts').querySelector('[data-opt="believe"]').click();
    await sleep(400);
    st=ST();
    L('stage2', st.stage===2 ? 'ok':'bad:'+st.stage);
    let marks2=Array.prototype.map.call(q('npc-topics').querySelectorAll('.sto-h em'), e=>e.textContent).join(',');
    L('stele4Open', marks2==='已听,可谈,已听,可谈,未解锁,可谈' ? 'ok':'bad:'+marks2);
    /* W3·S3：③④ 一路解锁过来，锁行只剩⑤，提示也跟着只剩一句（重绘不留旧态） */
    L('s3HintShrinks', q('npc-topics').querySelectorAll('.npc-topic > p.sto-hint').length === 1 ? 'ok'
      : 'bad:'+q('npc-topics').querySelectorAll('.npc-topic > p.sto-hint').length);

    /* rel≥15 解锁⑤：重进页面读最新状态 */
    ST().rel=15;
    ROUTER.open('role','xx-role-npc');
    await sleep(500);
    let marks3=Array.prototype.map.call(q('npc-topics').querySelectorAll('.sto-h em'), e=>e.textContent).join(',');
    L('stele5Open', marks3.indexOf('未解锁')<0 ? 'ok':'bad:'+marks3);
    /* W3·S3：六行全解锁 → 提示归零，不留下一句废话 */
    L('s3HintZero', q('npc-topics').querySelectorAll('.npc-topic > p.sto-hint').length === 0 ? 'ok'
      : 'bad:'+q('npc-topics').querySelectorAll('.npc-topic > p.sto-hint').length);
    L('arrive2', arriveCalls===2 ? 'ok':'bad:'+arriveCalls);

    /* 8) 重逢快照不被普通刷新覆盖 */
    XX._s.legacy.gens=1; ST().seenGens=0;
    ROUTER.open('role');
    await sleep(300);
    ROUTER.open('role','xx-role-npc');
    await sleep(500);
    const g0=txt('npc-greet');
    const g0base = String(g0).replace(/（他顿了顿，像是想起了.*。）$/,'');   /* T-506 记忆接入：旧事行后缀按设计放行 */
    const isReunion = Npc.NPC_STELE.greetings.reunion.some(g => g0base.endsWith(g));   /* 底句守卫不变；NpcVoice 语气前缀按设计放行 */
    L('reunionGreet', isReunion ? 'ok':'bad:'+g0);
    L('seenGens1', ST().seenGens===1 ? 'ok':'bad:'+ST().seenGens);
    L('arrive3', arriveCalls===3 ? 'ok':'bad:'+arriveCalls);
    await sleep(1500);   /* 跨过若干 tick + 一次 render */
    L('greetStable', txt('npc-greet')===g0 ? 'ok':'bad:'+txt('npc-greet'));
    XX._render(); XX._render();
    await sleep(300);
    L('greetStable2', txt('npc-greet')===g0 ? 'ok':'bad');

    /* 11) 离页清回复 */
    ROUTER.open('role');
    await sleep(300);
    ROUTER.open('role','xx-role-npc');
    await sleep(500);
    L('replyCleared', q('npc-reply').hidden ? 'ok':'bad');
    const gd = String(txt('npc-greet')).replace(/（他顿了顿，像是想起了.*。）$/,'');   /* T-506 记忆接入：旧事行后缀按设计放行 */
    L('greetDef', gd.endsWith(Npc.NPC_STELE.greetings.def) ? 'ok':'bad:'+txt('npc-greet'));   /* 底句守卫不变；NpcVoice 语气前缀按设计放行 */

    /* 12) 读档后读最新存档 */
    XX._save ? XX._save() : null;
    try{ XX._s.last=Date.now(); }catch(e){}
    XX._load();
    ROUTER.open('role');
    await sleep(300);
    ROUTER.open('role','xx-role-npc');
    await sleep(500);
    /* 记忆 NPC 框架第一步（界面去计数）：完成度分母整段移除（原断言找「/N 已听」） */
    L('subHeard', txt('npc-topics-sub') === '' ? 'ok':'bad:'+txt('npc-topics-sub'));
    /* 去计数三条硬判据：话题完成度、记忆分母/次数、rel 数字一律不出现 */
    L('noCounts', (txt('npc-mem').indexOf('（') < 0 && txt('npc-mem').indexOf('×') < 0 &&
                   txt('npc-topics-sub').indexOf('已听') < 0) ? 'ok':'bad:'+txt('npc-mem'));
    L('noRelDigits', /\d/.test(txt('npc-rel')) ? 'bad:'+txt('npc-rel') : 'ok');
    const heardMarks=Array.prototype.filter.call(q('npc-topics').querySelectorAll('.sto-h em'), e=>e.textContent==='已听').length;
    L('heardMarks2', heardMarks===2 ? 'ok':'bad:'+heardMarks);

    /* 13) 转世后跨世保留 / 本世清零 */
    const relBefore=ST().rel;
    XX._resetForNewLife();
    ROUTER.open('role');
    await sleep(300);
    ROUTER.open('role','xx-role-npc');
    await sleep(500);
    st=ST();
    L('rebornTalk0', st.cur.talk===0 ? 'ok':'bad:'+st.cur.talk);
    L('rebornHeard', st.heard.length===2 ? 'ok':'bad:'+st.heard.length);
    L('rebornRel', st.rel===relBefore ? 'ok':'bad:'+st.rel+'/'+relBefore);
    /* 记忆 NPC 框架第二步（D2）：关系行移除阶段名后 met=1 时整行为空——只锁「rel 未变 + 行内无数字」。 */
    L('rebornRelLine', (st.rel===relBefore && !/\d/.test(txt('npc-rel'))) ? 'ok':'bad:'+txt('npc-rel'));

    /* 15) 2a 浮片回归：面板门控 / 回场景即弹 / 落盘 / 15s 自灭 */
    XX._s.rank=3; st=ST(); st.cur.lastRank=0; st.cur.promptTale=1; st.stage=0; st.heard=[];
    ROUTER.open('role');
    await sleep(700);
    L('floatPanelHidden', q('npc-visit').classList.contains('hidden') ? 'ok':'bad');
    L('floatNotConsumed', ST().cur.lastRank===0 ? 'ok':'bad');
    ROUTER.back();
    await sleep(800);
    L('floatShown', !q('npc-visit').classList.contains('hidden') ? 'ok':'bad');
    L('floatSaved', ((saved().npcs||{}).stele||{}).cur && saved().npcs.stele.cur.lastRank===3 ? 'ok':'bad');
    await sleep(16000);
    L('floatGone', q('npc-visit').classList.contains('hidden') ? 'ok':'bad');
  }catch(e){ L('EXC', e.message); }
  const d=document.createElement('pre'); d.id='diag'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>
</body>`;

const LAYOUT = `
<style>.panel-page,.panel-page *{animation:none!important;transition:none!important;}</style>
<script>
setTimeout(function(){
  try{ var c=document.getElementById('char-confirm'); if(c) c.click(); }catch(e){}
  setTimeout(function(){
    try{ Tutorial.finish(); }catch(e){}
    try{ Story._STORY.forEach(function(x){ XX._s.story.claimed[x.id]=1; }); Story.closeCard(); }catch(e){}
    document.querySelectorAll('.modal').forEach(function(m){ m.classList.add('hidden'); });
    var st=XX._npcStele();
    st.met=1; st.rel=16; st.stage=2; st.heard=['stele1','stele3'];
    st.cur={ lastRank:0, talk:4, promptTale:1 };
    ROUTER.open('role','xx-role-npc');
    setTimeout(function(){
      try{
        document.querySelector('#npc-topics [data-topic="stele2"]').click();
      }catch(e){}
      setTimeout(function(){
        var d=document.createElement('pre'); d.id='lay';
        /* 立绘是本地文件，但断言必须在图片解码完成后再量，否则 naturalWidth 仍是 0 */
        var tries=0;
        function waitPic(){
          tries++;
          var pic=document.querySelector('#npc-portrait img');
          if((pic && pic.complete && pic.naturalWidth>0) || tries>30){ measure(); document.body.appendChild(d); return; }
          setTimeout(waitPic, 100);
        }
        function measure(){
        try{
          var iw=innerWidth, ih=innerHeight;
          var root=document.getElementById('xx-role-npc-root');
          var els=root.querySelectorAll('*');
          var over=0, list=[];
          Array.prototype.forEach.call(els, function(el){
            var r=el.getBoundingClientRect();
            if(r.width===0 && r.height===0) return;
            if(r.right>iw+1 || r.left<-1){ over++; if(list.length<3) list.push(el.className+':'+Math.round(r.left)+'..'+Math.round(r.right)); }
          });
          var btns=Array.prototype.slice.call(document.querySelectorAll('#npc-opts button'));
          var ov=0;
          for(var i=0;i<btns.length;i++)for(var j=i+1;j<btns.length;j++){
            var a=btns[i].getBoundingClientRect(), b=btns[j].getBoundingClientRect();
            if(a.left<b.right-2 && b.left<a.right-2 && a.top<b.bottom-2 && b.top<a.bottom-2) ov++;
          }
          var pr=document.getElementById('npc-portrait').getBoundingClientRect();
          var rr=root.getBoundingClientRect();
          var pic=document.querySelector('#npc-portrait img');
          var pcs=pic?getComputedStyle(pic):null;
          d.textContent=iw+'x'+ih+' 溢出='+over+(list.length?'('+list.join('/')+')':'')+' 按钮重叠='+ov+
            ' 立绘='+Math.round(pr.width)+' 根宽='+Math.round(rr.width)+
            ' 话题行='+document.querySelectorAll('#npc-topics .sto-item').length+
            ' 开场白行='+document.getElementById('npc-greet').children.length+
            ' 图='+(pic?'yes':'no')+
            ' 自然宽='+(pic?pic.naturalWidth:0)+
            ' fit='+(pcs?pcs.objectFit:'-')+
            ' 变换='+(pcs?pcs.transform:'-')+
            ' 定位='+(pcs?pcs.objectPosition:'-');
        }catch(err){ d.textContent='ERR '+err.message; }
        }
        waitPic();
      }, 400);
    }, 700);
  }, 700);
}, 300);
</script>
</body>`;

/* 初见成功切换：全新一页（干净 S）→ 初见视图 → 点 ask_black → 必须切到话题视图 */
const DIAG_FIRST_OK = `
<script>
(async function(){
  const out=[]; const L=(k,v)=>out.push(k+'='+v);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const q=id=>document.getElementById(id);
  const saved=()=>{ try{ return JSON.parse(localStorage.getItem('xiuxian_save')||'{}'); }catch(e){ return {}; } };
  let picks=0;
  await sleep(300);
  try{
    const c=q('char-confirm'); if(c) c.click();
    await sleep(600);
    const op=Npc.npcPick;
    Npc.npcPick=function(){ picks++; return op.apply(this, arguments); };
    try{ Tutorial.finish(); }catch(e){}
    try{ Story._STORY.forEach(x=>{ XX._s.story.claimed[x.id]=1; }); Story.closeCard(); }catch(e){}
    document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
    ROUTER.open('role','xx-role-npc');
    await sleep(600);
    L('beforeFirst', XX._npcUi() && XX._npcUi().first === true ? 'yes':'no');
    L('beforeOpts', q('npc-opts').querySelectorAll('[data-topic="first"]').length);
    q('npc-opts').querySelector('[data-opt="ask_black"]').click();
    await sleep(500);
    const ui=XX._npcUi(), st=XX._npcStele();
    L('afterFirstFalse', ui && ui.first === false ? 'yes':'no');
    L('afterTopicNull', ui && ui.topic === null ? 'yes':'no');
    L('tipGone', q('npc-topic-lines').querySelectorAll('.npc-first-tip').length===0 &&
                 (q('npc-topic-lines').textContent||'').indexOf('你还没和他说过话')<0 ? 'yes':'no');
    L('firstOptsGone', q('npc-opts').querySelectorAll('[data-topic="first"]').length===0 ? 'yes':'no');
    L('topics6', q('npc-topics').children.length===6 ? 'yes':'no');
    L('picks1', picks===1 ? 'yes':'no');
    L('state1', st.met===1 && st.rel===2 && st.cur.talk===1 ? 'yes':'no');
    L('saved1', ((saved().npcs||{}).stele||{}).rel===2 ? 'yes':'no');
  }catch(e){ L('EXC', e.message); }
  const d=document.createElement('pre'); d.id='diagA'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>
</body>`;

/* 初见失败不切换：页面停在初见视图，真实调用 npcPick 失败（bad_option / already_met）→ 不切视图、不结算 */
const DIAG_FIRST_FAIL = `
<script>
(async function(){
  const out=[]; const L=(k,v)=>out.push(k+'='+v);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const q=id=>document.getElementById(id);
  const saved=()=>{ try{ return JSON.parse(localStorage.getItem('xiuxian_save')||'{}'); }catch(e){ return {}; } };
  const npcSnap=()=>{ const n=(saved().npcs||{}).stele||{}; return JSON.stringify({met:n.met,rel:n.rel,stage:n.stage,talk:(n.cur||{}).talk,lastSeen:n.lastSeen}); };
  let lastOk=null,lastErr='',picks=0;
  await sleep(300);
  try{
    const c=q('char-confirm'); if(c) c.click();
    await sleep(600);
    const op=Npc.npcPick;
    Npc.npcPick=function(){ picks++; const r=op.apply(this, arguments); lastOk=!!(r&&r.ok); lastErr=(r&&r.error)||''; return r; };
    try{ Tutorial.finish(); }catch(e){}
    try{ Story._STORY.forEach(x=>{ XX._s.story.claimed[x.id]=1; }); Story.closeCard(); }catch(e){}
    document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
    ROUTER.open('role','xx-role-npc');
    await sleep(600);
    const snap0=npcSnap();
    L('openFirst', XX._npcUi() && XX._npcUi().first === true ? 'yes':'no');
    L('openOpts', q('npc-opts').querySelectorAll('[data-topic="first"]').length);
    /* 第一路失败：真实点一个「已失效」的初见选项 → npcPick('first','__gone__') → bad_option，底层 met 不动 */
    const btn=q('npc-opts').querySelector('[data-topic="first"]');
    btn.dataset.opt='__gone__';
    btn.click();
    await sleep(500);
    L('failOk', lastOk===false ? 'yes':'no');
    L('failErr', lastErr);
    L('failFirstKept', XX._npcUi() && XX._npcUi().first === true ? 'yes':'no');
    L('failOptsStill', q('npc-opts').querySelectorAll('[data-topic="first"]').length);
    L('failNoSave', npcSnap()===snap0 ? 'yes':'no');
    L('failNoState', (function(){ const s=XX._npcStele(); return s.met===0 && s.rel===0 && s.cur.talk===0; })() ? 'yes':'no');
    L('failTopicNull', XX._npcUi() && XX._npcUi().topic === null ? 'yes':'no');
    L('failReply', !q('npc-reply').hidden && q('npc-reply').classList.contains('bad') ? 'yes':'no');
    /* 第二路失败：底层已 met=1（页面仍是初见态）→ npcPick 返回 already_met；仍不切视图、不结算 */
    XX._npcStele().met=1;
    const snap1=npcSnap();
    q('npc-opts').querySelector('[data-opt="ask_who"]').click();
    await sleep(500);
    L('alreadyOk', lastOk===false ? 'yes':'no');
    L('alreadyErr', lastErr);
    L('alreadyFirstKept', XX._npcUi() && XX._npcUi().first === true ? 'yes':'no');
    L('alreadyTopicNull', XX._npcUi() && XX._npcUi().topic === null ? 'yes':'no');
    L('alreadyNoSave', npcSnap()===snap1 ? 'yes':'no');
    L('alreadyTalk', XX._npcStele().cur.talk);
    L('picks2', picks===2 ? 'yes':'no');
  }catch(e){ L('EXC', e.message); }
  const d=document.createElement('pre'); d.id='diagB'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>
</body>`;

/* 切片 2c：来访气泡点击 → 识人页。全程真实 DOM 交互（click / KeyboardEvent），不调私有函数 */
const DIAG_VISIT = `
<script>
(async function(){
  const out=[]; const L=(k,v)=>out.push(k+'='+v);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const q=id=>document.getElementById(id);
  const pageOpen=()=>!!document.querySelector('#panel-host [data-sec="xx-role-npc"]');
  const savedLR=()=>{ try{ const s=JSON.parse(localStorage.getItem('xiuxian_save')||'{}'); const n=(s.npcs||{}).stele||{}; return n.cur?String(n.cur.lastRank):'none'; }catch(e){ return 'ERR'; } };
  let arrive=0, mark=0;
  const timers={}, tset=[];
  const _st=window.setTimeout, _ct=window.clearTimeout;
  window.setTimeout=function(fn,d){ const h=_st(fn,d); if(d===15000){ timers[h]='set'; tset.push(h); } return h; };
  window.clearTimeout=function(h){ if(Object.prototype.hasOwnProperty.call(timers,h)) timers[h]='cleared'; return _ct(h); };
  await sleep(300);
  try{
    const c=q('char-confirm'); if(c) c.click();
    await sleep(600);
    const oa=Npc.npcArrive, om=Npc.npcMarkReunion;
    Npc.npcArrive=function(){ arrive++; return oa.apply(this, arguments); };
    Npc.npcMarkReunion=function(){ mark++; return om.apply(this, arguments); };
    try{ Tutorial.finish(); }catch(e){}
    try{ Story._STORY.forEach(x=>{ XX._s.story.claimed[x.id]=1; }); Story.closeCard(); }catch(e){}
    document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
    XX._s.rank=3; XX._s.last=Date.now();
    const st=XX._npcStele();
    st.met=0; st.stage=0; st.lastSeen=0; st.nudgeAt=0; st.heard=[];
    st.cur={lastRank:0,talk:0,promptTale:0};
    await sleep(1200);
    L('p0_visible', !q('npc-visit').classList.contains('hidden') ? 'yes':'no');
    L('p0_timerSet', tset.length>0 ? 'yes':'no');
    await sleep(16000);
    L('p0_autohide', q('npc-visit').classList.contains('hidden') ? 'yes':'no');
    /* 事件 B 就绪（已听碑史、还没讲三千年） */
    st.met=1; st.stage=1; st.heard=[]; st.cur={lastRank:3,talk:0,promptTale:0};
    await sleep(46000);
    L('p1_visible', !q('npc-visit').classList.contains('hidden') ? 'yes':'no');
    const bar=q('npc-visit');
    const _open=ROUTER.open; let openN=0;
    ROUTER.open=function(){ openN++; return _open.apply(this, arguments); };  /* 保留原行为，只计数 */
    bar.click(); bar.click();                       /* 快速双击：第二次应被防重复挡掉 */
    L('p1_open', openN);                            /* 记录 ROUTER.open 实际调用次数 */
    ROUTER.open=_open;                              /* 恢复原函数 */
    await sleep(700);
    L('p1_page', pageOpen() ? 'yes':'no');
    L('p1_sceneOff', q('page-scene').classList.contains('active') ? 'bad':'ok');
    L('p1_hidden', bar.classList.contains('hidden') ? 'yes':'no');
    L('p1_timerCleared', tset.length>0 && timers[tset[tset.length-1]]==='cleared' ? 'yes':'no');
    L('p1_arrive', arrive);
    L('p1_mark', mark);
    L('p1_single', document.querySelectorAll('#panel-host .panel-page').length===1 ? 'yes':'no');
    L('p1_lastRank', XX._npcStele().cur.lastRank);
    L('p1_saved', savedLR());
    ROUTER.back(); ROUTER.back();
    await sleep(600);
    L('p1_scene', q('page-scene').classList.contains('active') ? 'yes':'no');
    /* 事件 C 就绪（久未见面） */
    const s2=XX._npcStele();
    s2.stage=1; s2.lastSeen=Date.now()-73*3600*1000; s2.nudgeAt=0;
    s2.cur={lastRank:3,talk:0,promptTale:1};
    await sleep(62000);
    L('p2_visible', !q('npc-visit').classList.contains('hidden') ? 'yes':'no');
    bar.dispatchEvent(new KeyboardEvent('keydown',{ key:'Enter', bubbles:true }));
    await sleep(700);
    L('p2_page', pageOpen() ? 'yes':'no');
    L('p2_arrive', arrive);
    ROUTER.back(); ROUTER.back();
    await sleep(600);
    /* 事件 A 再就绪（破境） */
    XX._s.rank=4;
    const s3=XX._npcStele();
    s3.stage=1; s3.lastSeen=Date.now(); s3.nudgeAt=0;
    s3.cur={lastRank:0,talk:0,promptTale:1};
    await sleep(62000);
    L('p3_visible', !q('npc-visit').classList.contains('hidden') ? 'yes':'no');
    bar.dispatchEvent(new KeyboardEvent('keydown',{ key:' ', bubbles:true }));
    await sleep(700);
    L('p3_page', pageOpen() ? 'yes':'no');
    L('p3_arrive', arrive);
    ROUTER.back(); ROUTER.back();
    await sleep(2500);
    L('p4_hidden', bar.classList.contains('hidden') ? 'yes':'no');
    L('p4_lastRank', XX._npcStele().cur.lastRank);
  }catch(e){ L('EXC', e.message); }
  const d=document.createElement('pre'); d.id='diagV'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>
</body>`;

/* 切片 2c：门控回归（弹窗 / 妖踪）。被门控时不判定、不消费，让开后立即判 */
const DIAG_VISIT_GATES = `
<script>
(async function(){
  const out=[]; const L=(k,v)=>out.push(k+'='+v);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const q=id=>document.getElementById(id);
  await sleep(300);
  try{
    const c=q('char-confirm'); if(c) c.click();
    await sleep(600);
    try{ Tutorial.finish(); }catch(e){}
    try{ Story._STORY.forEach(x=>{ XX._s.story.claimed[x.id]=1; }); Story.closeCard(); }catch(e){}
    document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
    XX._s.rank=3; XX._s.last=Date.now();
    const st=XX._npcStele();
    st.met=0; st.stage=0; st.lastSeen=0; st.nudgeAt=0; st.heard=[]; st.cur={lastRank:0,talk:0,promptTale:0};
    q('settings-modal').classList.remove('hidden');
    await sleep(62000);
    L('g1_hidden', q('npc-visit').classList.contains('hidden') ? 'yes':'no');
    L('g1_lastRank', XX._npcStele().cur.lastRank);
    q('settings-modal').classList.add('hidden');
    await sleep(900);
    L('g1_after', !q('npc-visit').classList.contains('hidden') ? 'yes':'no');
    await sleep(16000);
    const s2=XX._npcStele();
    s2.met=1; s2.stage=1; s2.heard=[]; s2.cur={lastRank:3,talk:0,promptTale:0};
    XX._s.huntBeast='rat'; XX._traceSpawn();
    const tr=XX._trace(); if(tr) tr.until=Date.now()+180000;
    await sleep(62000);
    L('g2_hidden', q('npc-visit').classList.contains('hidden') ? 'yes':'no');
    L('g2_promptTale', XX._npcStele().cur.promptTale);
    L('g2_trace', !!q('trace-bar') && !q('trace-bar').classList.contains('hidden') ? 'yes':'no');
    XX._traceReset();
    await sleep(900);
    L('g2_after', !q('npc-visit').classList.contains('hidden') ? 'yes':'no');
    L('g2_text', (q('nv-text')||{}).textContent);
  }catch(e){ L('EXC', e.message); }
  const d=document.createElement('pre'); d.id='diagG'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>
</body>`;

/* 切片 2c：气泡几何——可点、不压底栏/系统栏 */
const DIAG_VISIT_LAYOUT = `
<style>.panel-page,.panel-page *{animation:none!important;transition:none!important;}
.npc-visit{animation:none!important;}</style>
<script>
setTimeout(function(){
  try{ var c=document.getElementById('char-confirm'); if(c) c.click(); }catch(e){}
  setTimeout(function(){
    try{ Tutorial.finish(); }catch(e){}
    try{ Story._STORY.forEach(function(x){ XX._s.story.claimed[x.id]=1; }); Story.closeCard(); }catch(e){}
    document.querySelectorAll('.modal').forEach(function(m){ m.classList.add('hidden'); });
    XX._s.rank=3;
    var st=XX._npcStele(); st.met=0; st.stage=0; st.lastSeen=0; st.nudgeAt=0; st.heard=[];
    st.cur={lastRank:0,talk:0,promptTale:0};
    setTimeout(function(){
      var d=document.createElement('pre'); d.id='layV';
      try{
        var bar=document.getElementById('npc-visit');
        var br=bar.getBoundingClientRect();
        var tabs=document.querySelector('.scene-tabs').getBoundingClientRect();
        var rail=document.querySelector('.sys-rail').getBoundingClientRect();
        var ov=function(a,b){ return !(a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1); };
        var cs=getComputedStyle(bar);
        var el=document.elementFromPoint(br.left+br.width/2, br.top+br.height/2);
        var hit=el && (el===bar || bar.contains(el)) ? 'yes':'no';
        d.textContent=innerWidth+'x'+innerHeight+' 可见='+(bar.classList.contains('hidden')?'no':'yes')+
          ' 压Tab='+(ov(br,tabs)?'yes':'no')+' 压系统栏='+(ov(br,rail)?'yes':'no')+
          ' 区域='+Math.round(br.left)+','+Math.round(br.top)+','+Math.round(br.width)+','+Math.round(br.height)+
          ' pe='+cs.pointerEvents+' cursor='+cs.cursor+' 命中='+hit;
      }catch(err){ d.textContent='ERR '+err.message; }
      document.body.appendChild(d);
    }, 1800);
  }, 700);
}, 300);
</script>
</body>`;

/* 切片 2f「碑外一线」UI 接线：识人页 #npc-clues 只读清单 + 塔页 / 寿元页题注。
   测接线本身：壳只有一枚且落在 .npc-hero 网格之外、四条恒定与顺序、未解不漏台词、
   重复渲染幂等、跨 500ms 常规渲染保持、题注只在 heard 命中后显形、转世不回锁、
   重开归零、渲染与真实点击零数值。 */
const DIAG_ECHO = `
<script>
(async function(){
  const out=[]; const L=(k,v)=>out.push(k+'='+v);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const q=id=>document.getElementById(id);
  const txt=id=>(q(id)||{}).textContent||'';
  const ST=()=>XX._npcStele();
  const lore=id=>Npc.NPC_STELE.topics.filter(t=>t.id===id)[0].lore;
  const echoTxt=id=>Npc.NPC_STELE.name+'题记 ·「'+lore(id)+'」';
  const rows=()=>Array.prototype.slice.call(document.querySelectorAll('#npc-clues .sto-item'));
  const bits=()=>rows().map(r=>r.dataset.open).join('');
  const shellN=()=>document.querySelectorAll('#npc-clues').length;
  const boxTxt=()=>(q('npc-clues')||{}).textContent||'';
  const enterNpc=async()=>{ ROUTER.open('role'); await sleep(250); ROUTER.open('role','xx-role-npc'); await sleep(450); };
  const openPage=async(p,s)=>{ ROUTER.open(p,s); await sleep(350); XX._render(); await sleep(150); };
  await sleep(300);
  try{
    const c=q('char-confirm'); if(c) c.click();
    await sleep(600);
    try{ Tutorial.finish(); }catch(e){}
    try{ Story._STORY.forEach(x=>{ XX._s.story.claimed[x.id]=1; }); Story.closeCard(); }catch(e){}
    document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
    /* 起底：一条都没听过的沈碑（heard 空） */
    XX._s.npcs={ stele:{ met:1, rel:0, stage:0, seenGens:0, lastSeen:0, nudgeAt:0,
      heard:[], choice:{ listened:0, showoff:0, promise:0 }, cur:{ lastRank:0, talk:0, promptTale:0 } } };

    /* A) 壳：唯一、挂在识人卡片直下、且在立绘网格之外 */
    await enterNpc();
    const box0=q('npc-clues');
    const hero=document.querySelector('#xx-role-npc-root .npc-hero');
    L('e2fShell', box0 && box0.parentNode.id==='xx-role-npc-root' && box0.querySelector('.sto-log') ? 'ok':'bad:'+(box0?box0.parentNode.id:'null'));
    L('e2fOutsideHero', box0 && hero && !hero.contains(box0) ? 'ok':'bad');
    L('e2fShellOne', shellN()===1 ? 'ok':'bad:'+shellN());
    L('e2fFour', rows().length===4 ? 'ok':'bad:'+rows().length);
    L('e2fOrder', rows().map(r=>r.dataset.clue+':'+r.dataset.topic).join(',')==='clue1:stele1,clue2:stele3,clue3:stele4,clue4:stele5' ? 'ok':'bad:'+rows().map(r=>r.dataset.clue).join(','));
    L('e2fAllLock', bits()==='0000' && txt('npc-clues-sub')==='0/4' ? 'ok':'bad:'+bits()+'/'+txt('npc-clues-sub'));
    L('e2fNoLeak', ['stele1','stele3','stele4','stele5'].every(id=>boxTxt().indexOf(lore(id))<0) &&
      rows().every(r=>r.textContent.indexOf('——')>=0 && !r.querySelector('.npc-topic-line')) ? 'ok':'bad:'+boxTxt().slice(0,40));

    /* B) 幂等：同一状态下走真实点击委托（#npc-topics 行 → 整页重填）两次，壳与内容不变 */
    const t1=boxTxt();
    q('npc-topics').querySelector('[data-topic="stele2"]').click(); await sleep(200);
    q('npc-topics').querySelector('[data-topic="stele6"]').click(); await sleep(200);
    L('e2fIdem', shellN()===1 && boxTxt()===t1 && rows().length===4 ? 'ok':'bad:'+shellN()+'/'+rows().length);

    /* C) 跨常规渲染：识人页不挂 500ms，但全局 render() 也不许抹掉或复制这枚壳 */
    XX._render(); XX._render(); await sleep(1200);
    L('e2fTickKeep', shellN()===1 && boxTxt()===t1 && rows().length===4 ? 'ok':'bad:'+shellN()+'/'+rows().length);

    /* D) 未解锁：两页题注节点恒在，但 hidden 且文本为空（台词不落 DOM） */
    await openPage('tower');
    const tw=q('npc-echo-tower');
    L('e2fTowerLock', tw && tw.hidden===true && tw.textContent==='' ? 'ok':'bad:'+(tw?tw.hidden+'/'+tw.textContent:'null'));
    await openPage('life','xx-life-now');
    const lf=q('npc-echo-life');
    L('e2fLifeLock', lf && lf.hidden===true && lf.textContent==='' ? 'ok':'bad:'+(lf?lf.hidden+'/'+lf.textContent:'null'));
    L('e2fLifeInNow', lf && lf.closest('[data-sec="xx-life-now"]') ? 'ok':'bad');

    /* E) 阶梯点亮（识人页）：只认 heard，逐条点亮 */
    ST().heard=['stele1'];
    await enterNpc();
    L('e2fL1', bits()==='1000' && txt('npc-clues-sub')==='1/4' &&
      rows()[0].querySelector('.npc-topic-line').textContent===lore('stele1') &&
      rows().slice(1).every(r=>r.textContent.indexOf('——')>=0) ? 'ok':'bad:'+bits()+'/'+txt('npc-clues-sub'));
    /* 反例：stage=2 / rel=20、话题④已可点开，但没听过 → 线索③④必须仍是未解 */
    ST().heard=['stele1','stele3']; ST().stage=2; ST().rel=20;
    await enterNpc();
    L('e2fNotStage', bits()==='1100' && !!document.querySelector('#npc-topics [data-topic="stele4"]') ? 'ok':'bad:'+bits());

    /* F) 塔页解锁与跨渲染同步：条件只取 heard 里的 stele4 */
    ST().heard=['stele1','stele3','stele4'];
    await openPage('tower');
    const tw2=q('npc-echo-tower');
    L('e2fTowerOpen', tw2 && tw2.hidden===false && tw2.textContent===echoTxt('stele4') ? 'ok':'bad:'+(tw2?tw2.hidden+'/'+tw2.textContent:'null'));
    XX._render(); XX._render(); await sleep(1200);
    const tw2b=q('npc-echo-tower');
    L('e2fTowerSync', tw2b && tw2b.hidden===false && tw2b.textContent===echoTxt('stele4') &&
      document.querySelectorAll('#npc-echo-tower').length===1 ? 'ok':'bad:'+(tw2b?tw2b.hidden+'/'+tw2b.textContent:'null'));

    /* G) 寿元页解锁与跨渲染同步：条件只取 heard 里的 stele5 */
    ST().heard=['stele1','stele3','stele4','stele5'];
    await openPage('life','xx-life-now');
    const lf2=q('npc-echo-life');
    L('e2fLifeOpen', lf2 && lf2.hidden===false && lf2.textContent===echoTxt('stele5') ? 'ok':'bad:'+(lf2?lf2.hidden+'/'+lf2.textContent:'null'));
    XX._render(); XX._render(); await sleep(1200);
    const lf2b=q('npc-echo-life');
    L('e2fLifeSync', lf2b && lf2b.hidden===false && lf2b.textContent===echoTxt('stele5') &&
      document.querySelectorAll('#npc-echo-life').length===1 ? 'ok':'bad:'+(lf2b?lf2b.hidden+'/'+lf2b.textContent:'null'));

    /* H) 识人页四条全亮 + 零数值：两次全局渲染与一次真实点话题都不产生灵石/修为 */
    await enterNpc();
    L('e2fAllOpen', bits()==='1111' && txt('npc-clues-sub')==='4/4' &&
      rows().every((r,i)=>r.querySelector('.npc-topic-line').textContent===lore(['stele1','stele3','stele4','stele5'][i])) ? 'ok':'bad:'+bits());
    const s0=XX._s.stone, e0=XX._s.exp;
    XX._render(); XX._render();
    q('npc-topics').querySelector('[data-topic="stele2"]').click();
    L('e2fNoNumeric', XX._s.stone===s0 && XX._s.exp===e0 ? 'ok':'bad:'+s0+'/'+XX._s.stone+'/'+e0+'/'+XX._s.exp);

    /* I) 转世：线索跨世保留，题注不回锁 */
    XX._resetForNewLife();
    await enterNpc();
    L('e2fRebornKeep', bits()==='1111' ? 'ok':'bad:'+bits());
    await openPage('tower');
    L('e2fRebornTower', q('npc-echo-tower') && q('npc-echo-tower').hidden===false ? 'ok':'bad');
    await openPage('life','xx-life-now');
    L('e2fRebornLife', q('npc-echo-life') && q('npc-echo-life').hidden===false ? 'ok':'bad');

    /* J) 重开：清到默认态，两页题注回到 hidden 空文本、清单回到 0/4
          （resetAll 只 render 当前面板，所以每题注都得先把那一页重新开出来再断言） */
    const _cf=window.confirm; window.confirm=()=>true;
    try{ XX._resetAll(); }catch(e){ L('resetAllExc', e.message); }
    window.confirm=_cf;
    await openPage('tower');
    const tw3=q('npc-echo-tower');
    L('e2fResetTower', tw3 && tw3.hidden===true && tw3.textContent==='' ? 'ok':'bad:'+(tw3?tw3.hidden+'/'+tw3.textContent:'null'));
    await openPage('life','xx-life-now');
    const lf3=q('npc-echo-life');
    L('e2fResetLife', lf3 && lf3.hidden===true && lf3.textContent==='' ? 'ok':'bad:'+(lf3?lf3.hidden+'/'+lf3.textContent:'null'));
    await enterNpc();
    L('e2fResetClues', bits()==='0000' && txt('npc-clues-sub')==='0/4' ? 'ok':'bad:'+bits()+'/'+txt('npc-clues-sub'));
  }catch(e){ L('EXC', e.message); }
  const d=document.createElement('pre'); d.id='diagE'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>
</body>`;

/* ============ W1「塔底」：线索 → 发现 → 契机 → 三选一 → 终态 + 公共道碑 + 常驻回响 ============
   只测接线与状态机：三闸门、真实点击三分支的到账与代价、回响派生、非终态不漏文、
   道碑只立一方、老档/重开/转世。期望文案不硬编码——先各跑一条分支把页面文案抓下来，
   再用它反证「别的态里这句话不出现」，这样改字不会假红、漏文一定假红。 */
const DIAG_W1 = `
<script>
(async function(){
  const out=[]; const L=(k,v)=>out.push(k+'='+v);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const q=id=>document.getElementById(id);
  const txt=id=>(q(id)||{}).textContent||'';
  const S=XX._s, need=XX._need;
  const ST=()=>XX._npcStele();
  /* 崔九副题分母必须取真实话题数（写死 6 时玩家永远停在 3/6） */
  const CQT=()=>((window.NpcTower&&NpcTower.TOPICS)?NpcTower.TOPICS.length:0);
  const saved=()=>{ try{ return JSON.parse(localStorage.getItem('xiuxian_save')||'{}'); }catch(e){ return {}; } };
  const bodyTxt=()=>document.body.textContent||'';
  const footAll=()=>Array.prototype.slice.call(document.querySelectorAll('#xx-tower [data-foot]'));
  const footIds=()=>footAll().map(b=>b.dataset.foot).join(',');
  const twEcho=()=>q('world-echo-tower');
  const echoN=()=>document.querySelectorAll('#npc-world-echo').length;
  const echoTxt=()=>txt('npc-world-echo');
  const rows=()=>Array.prototype.slice.call(document.querySelectorAll('#npc-clues .sto-item'));
  const emAt=i=>{ const r=rows()[i]; const e=r&&r.querySelector('.sto-h em'); return e?e.textContent:''; };
  const setStele=(rel,heard)=>{ S.npcs={ stele:{ met:1, rel:rel, stage:2, seenGens:(S.legacy.gens|0),
      lastSeen:Date.now(), nudgeAt:0, heard:heard.slice(),
      choice:{ listened:1, showoff:0, promise:0 }, cur:{ lastRank:S.rank|0, talk:1, promptTale:0 } } }; };
  const openTower=async()=>{ ROUTER.open('tower'); await sleep(320); XX._render(); await sleep(120); };
  const enterNpc=async()=>{ ROUTER.open('role'); await sleep(250); ROUTER.open('role','xx-role-npc'); await sleep(450); };
  const snap=()=>({ ins:S.insight|0, wis:S.wisdom|0, st:S.stone, exp:S.exp, gd:S.guardMirror|0,
                    foot:S.worldFoot, ear:(S.stats&&S.stats.stoneEarned)|0, mile:(S.miles&&S.miles.m_foot)?1:0 });
  const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  await sleep(300);
  try{
    const c=q('char-confirm'); if(c) c.click();
    await sleep(600);
    try{ Tutorial.finish(); }catch(e){}
    try{ Story._STORY.forEach(x=>{ S.story.claimed[x.id]=1; }); Story.closeCard(); }catch(e){}
    document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
    L('boot', S.name ? 'ok' : 'bad:' + S.name);
    /* A) 新档起点：foot 空、道碑不误亮、无入口 */
    L('w1InitFoot', S.worldFoot==='' ? 'ok' : 'bad:' + S.worldFoot);
    XX._checkMiles(true);
    L('w1MileOffFresh', (!S.miles || !S.miles.m_foot) ? 'ok' : 'bad:空档就立碑');
    await openTower();
    L('w1NoEntryFresh', footAll().length === 0 ? 'ok' : 'bad:' + footIds());
    L('w1MilesTotal', String(XX._milesTotal()));
    /* B) 识人页回响壳：非终态在而文本空，且全页唯一 */
    await enterNpc();
    L('w1ShellOne', echoN() === 1 ? 'ok' : 'bad:' + echoN());
    L('w1ShellEmpty', echoTxt() === '' ? 'ok' : 'bad:' + echoTxt().slice(0,30));
    L('w1EmLock', emAt(2) === '未解' ? 'ok' : 'bad:' + emAt(2));
    /* C) 闸门①：没听过「山外」→ 不给入口 */
    S.towerMax = 5; S.worldFoot = ''; setStele(20, []);
    await openTower();
    L('w1G1Clue', document.querySelector('#xx-tower [data-foot="dig"]') ? 'bad:未听线索也给入口' : 'ok');
    /* D) 闸门②：听过但没进过塔 → 不给入口 */
    setStele(20, ['stele4']); S.towerMax = 0;
    await openTower();
    L('w1G2Tower', document.querySelector('#xx-tower [data-foot="dig"]') ? 'bad:towerMax=0 也给入口' : 'ok');
    /* E) 两闸门都过 → 只给「俯身」，不给三枚抉择 */
    S.towerMax = 1;
    await openTower();
    const dig = document.querySelector('#xx-tower [data-foot="dig"]');
    L('w1DigShown', dig ? 'ok' : 'bad:入口没出现');
    L('w1NoDoorsYet', footIds() === 'dig' ? 'ok' : 'bad:' + footIds());
    /* F) 真实点击俯身 → dug 且落盘；契机未满足时只有一句等头，没有三枚 */
    /* F) 真实点击俯身 → dug 且落盘；契机未满足时只有一句等头，没有三枚。
       俯身本身不给任何奖励：顿悟/悟道值/护心镜三项一项未动，
       灵石与修为只允许有挂机自然量（< 一层需求的 1%）——否则就是事件在偷偷发钱。 */
    const b0 = snap(); if(dig) dig.click(); const a0 = snap();
    const drift = Math.max(a0.st - b0.st, a0.exp - b0.exp);
    L('w1DugState', a0.foot === 'dug' ? 'ok' : 'bad:' + a0.foot);
    L('w1DugSaved', saved().worldFoot === 'dug' ? 'ok' : 'bad:' + saved().worldFoot);
    L('w1DugNoNumeric', (a0.ins === b0.ins && a0.wis === b0.wis && a0.gd === b0.gd &&
      drift < need(S.rank) * 0.01) ? 'ok' : 'bad:' + JSON.stringify(a0) + '/' + drift);
    await openTower();
    L('w1WaitNoDoors', footIds() === '' ? 'ok' : 'bad:' + footIds());
    L('w1WaitHint', txt('xx-tower').indexOf('护心镜') >= 0 ? 'ok' : 'bad:等头没指路');
    /* G) 契机满足（塔到第 3 层）→ 三枚抉择出现；关系不足那条置灰但仍在 DOM */
    S.towerMax = 3; setStele(14, ['stele4']);
    await openTower();
    L('w1ThreeDoors', footIds() === 'open,self,seal' ? 'ok' : 'bad:' + footIds());
    const op14 = document.querySelector('#xx-tower [data-foot="open"]');
    L('w1RelGate', op14 && op14.disabled === true ? 'ok' : 'bad:rel=14 竟可点');
    L('w1RelVisible', op14 && (op14.textContent || '').indexOf('14/15') >= 0 ? 'ok' : 'bad:' + (op14 ? op14.textContent : 'null'));
    setStele(15, ['stele4']);
    await openTower();
    const op15 = document.querySelector('#xx-tower [data-foot="open"]');
    L('w1RelOk', op15 && op15.disabled === false ? 'ok' : 'bad:rel=15 仍置灰');
    /* H) 分支①「请沈碑」：顿悟按 100 封顶实际到账，别的资源分文不动 */
    S.insight = 0; S.guardMirror = 0;
    await openTower();
    const b1 = snap(); const btn1 = document.querySelector('#xx-tower [data-foot="open"]'); if(btn1) btn1.click(); const a1 = snap();
    L('w1OpenState', a1.foot === 'open' ? 'ok' : 'bad:' + a1.foot);
    L('w1OpenInsight', a1.ins - b1.ins === 12 ? 'ok' : 'bad:' + (a1.ins - b1.ins));
    L('w1OpenOnly', a1.st === b1.st && a1.exp === b1.exp && a1.gd === b1.gd && a1.wis === b1.wis ? 'ok'
      : 'bad:' + JSON.stringify(a1));
    L('w1OpenSaved', saved().worldFoot === 'open' ? 'ok' : 'bad:' + saved().worldFoot);
    await openTower();
    L('w1OpenDoorsGone', footAll().length === 0 ? 'ok' : 'bad:' + footIds());
    const T1 = twEcho() ? twEcho().textContent : '';
    L('w1OpenTowerEcho', T1.length > 6 ? 'ok' : 'bad:塔页回响空');
    await enterNpc();
    const N1 = echoTxt();
    L('w1OpenNpcEcho', N1.indexOf('沈碑') >= 0 || N1.length > 6 ? 'ok' : 'bad:' + N1.slice(0,20));
    L('w1OpenEm', emAt(2) === '已印证' ? 'ok' : 'bad:' + emAt(2));
    /* I) 终态不可逆：再点一次什么都找不到，数值零变化 */
    await openTower();
    const b2 = snap(); footAll().forEach(x => x.click()); const a2 = snap();
    L('w1Idem', footAll().length === 0 && eq(b2, a2) ? 'ok' : 'bad:' + JSON.stringify(a2));
    /* J) 道碑：终态后 checkMiles 立起 m_foot，且只立这一方新碑 */
    const before = XX._milesDone(); XX._checkMiles(true);
    L('w1MileLit', (S.miles && S.miles.m_foot) ? 'ok' : 'bad:没立碑');
    L('w1MileOne', XX._milesDone() - before === 1 ? 'ok' : 'bad:' + (XX._milesDone() - before));
    ROUTER.open('role'); await sleep(300); ROUTER.open('role', 'xx-role-miles'); await sleep(400);
    L('w1MileName', txt('xx-role-miles').indexOf('塔下一线') >= 0 ? 'ok' : 'bad:碑文不在面板');
    /* K) 分支②「自己撬」：灵石按 needOf×0.6 到账且不进 earned，反噬按 need×0.04 扣，镜不变 */
    ROUTER.open('tower'); await sleep(300);
    S.worldFoot = 'dug'; S.guardMirror = 0; S.stone = 100000000; S.exp = need(S.rank) * 2; S.insight = 40;
    await openTower();
    const b3 = snap(); const btn3 = document.querySelector('#xx-tower [data-foot="self"]'); if(btn3) btn3.click(); const a3 = snap();
    const want = Math.round(need(S.rank) * 0.6);
    L('w1SelfState', a3.foot === 'self' ? 'ok' : 'bad:' + a3.foot);
    L('w1SelfStone', a3.st - b3.st === want ? 'ok' : 'bad:' + (a3.st - b3.st) + '/' + want);
    L('w1SelfEarnedFlat', a3.ear === b3.ear ? 'ok' : 'bad:' + (a3.ear - b3.ear));
    L('w1SelfLoss', Math.abs((b3.exp - a3.exp) - need(S.rank) * 0.04) < 1.5 ? 'ok'
      : 'bad:' + (b3.exp - a3.exp) + '/' + (need(S.rank) * 0.04));
    L('w1SelfInsightFlat', a3.ins === b3.ins && a3.wis === b3.wis ? 'ok' : 'bad:' + JSON.stringify(a3));
    await openTower();
    const T2 = twEcho() ? twEcho().textContent : '';
    L('w1SelfEchoDiff', T2 && T2 !== T1 ? 'ok' : 'bad:与①同文');
    /* L) 分支②有旧镜：按既有规则自动挡一半并吃掉一枚（镜只可能 −1 或持平，绝不 +1） */
    S.worldFoot = 'dug'; S.guardMirror = 2; S.exp = need(S.rank) * 2;
    await openTower();
    const b4 = snap(); const btn4 = document.querySelector('#xx-tower [data-foot="self"]'); if(btn4) btn4.click(); const a4 = snap();
    L('w1MirrorMinusOne', a4.gd === b4.gd - 1 ? 'ok' : 'bad:' + b4.gd + '→' + a4.gd);
    L('w1MirrorHalved', Math.abs((b4.exp - a4.exp) - need(S.rank) * 0.02) < 1.5 ? 'ok'
      : 'bad:' + (b4.exp - a4.exp));
    /* M) 分支③「封好回说」：只发悟道值，走 wisdomGain 的境界系数；顿悟/灵石/修为/镜全平 */
    S.worldFoot = 'dug'; S.guardMirror = 0; S.insight = 40; S.stone = 5000000; S.exp = need(S.rank);
    await openTower();
    const rk = S.rank | 0;
    const b5 = snap(); const btn5 = document.querySelector('#xx-tower [data-foot="seal"]'); if(btn5) btn5.click(); const a5 = snap();
    const wWant = Math.max(1, Math.floor(40 * Math.pow(1.15, rk)));
    L('w1SealState', a5.foot === 'seal' ? 'ok' : 'bad:' + a5.foot);
    L('w1SealWisdom', a5.wis - b5.wis === wWant ? 'ok' : 'bad:' + (a5.wis - b5.wis) + '/' + wWant);
    L('w1SealFlat', a5.st === b5.st && a5.exp === b5.exp && a5.gd === b5.gd && a5.ins === b5.ins ? 'ok'
      : 'bad:' + JSON.stringify(a5));
    await openTower();
    const T3 = twEcho() ? twEcho().textContent : '';
    L('w1ThreeEchoDistinct', (T1 && T2 && T3 && T1 !== T2 && T2 !== T3 && T1 !== T3) ? 'ok' : 'bad:三态文案有重复');
    /* N) 非终态不漏文：把态退回 dug，另两条结果话都不该在页面上 */
    S.worldFoot = 'dug'; S.towerMax = 3;
    await openTower();
    const bt = bodyTxt();
    L('w1NoLeakTower', (bt.indexOf(T1) < 0 && bt.indexOf(T3) < 0) ? 'ok' : 'bad:塔页提前漏文');
    await enterNpc();
    L('w1NoLeakNpc', echoTxt() === '' ? 'ok' : 'bad:' + echoTxt().slice(0, 20));
    L('w1EmBackToOpen', emAt(2) === '已解' ? 'ok' : 'bad:' + emAt(2));
    /* O) 转世：foot / 道碑 / 两页回响全部跨世保留（塔回到第 1 层不影响它） */
    S.worldFoot = 'open'; setStele(15, ['stele4']);
    XX._resetForNewLife();
    L('w1RebornKeep', S.worldFoot === 'open' ? 'ok' : 'bad:' + S.worldFoot);
    /* resetForNewLife 只改内存，落盘由 tickLoop 的 3 秒节流完成 → 等一拍再验盘 */
    await sleep(3600);
    L('w1RebornSaved', saved().worldFoot === 'open' ? 'ok' : 'bad:' + saved().worldFoot);
    XX._checkMiles(true);
    L('w1RebornMile', (S.miles && S.miles.m_foot) ? 'ok' : 'bad:碑倒了');
    await openTower();
    L('w1RebornTowerEcho', (twEcho() && twEcho().textContent === T1) ? 'ok' : 'bad:' + (twEcho() ? twEcho().textContent : 'null'));
    await enterNpc();
    L('w1RebornNpcEcho', echoTxt().length > 6 ? 'ok' : 'bad:回响空');
    /* P) 连续三次全局渲染 + 跨过 500ms 节拍：塔页回响节点不翻倍、文本不变、
       事件类资源（顿悟/悟道值/镜/碑）一项不动（灵石与修为允许挂机自然量） */
    await openTower();
    const b6 = snap(); XX._render(); XX._render(); XX._render(); await sleep(620); const a6 = snap();
    L('w1RenderIdem', (a6.ins === b6.ins && a6.wis === b6.wis && a6.gd === b6.gd && a6.foot === b6.foot &&
      a6.mile === 1 && document.querySelectorAll('#world-echo-tower').length === 1 &&
      twEcho().textContent === T1) ? 'ok'
      : 'bad:' + JSON.stringify(a6) + '/' + document.querySelectorAll('#world-echo-tower').length);
    await enterNpc();
    L('w1ShellOneAfterRender', echoN() === 1 ? 'ok' : 'bad:' + echoN());
    /* Q) 彻底重开：foot 归零、碑灭、两页回响消失、em 回未解 */
    const _cf = window.confirm; window.confirm = () => true;
    XX._resetAll();
    window.confirm = _cf;
    await sleep(200);
    L('w1ResetFoot', S.worldFoot === '' ? 'ok' : 'bad:' + S.worldFoot);
    L('w1ResetMile', (!S.miles || !S.miles.m_foot) ? 'ok' : 'bad:碑没跟着灭');
    await openTower();
    L('w1ResetEcho', !twEcho() ? 'ok' : 'bad:' + twEcho().textContent.slice(0, 20));
    await enterNpc();
    L('w1ResetNpcEcho', echoTxt() === '' ? 'ok' : 'bad:' + echoTxt().slice(0, 20));
    L('w1ResetEm', emAt(2) === '未解' ? 'ok' : 'bad:' + emAt(2));

    /* ============ 崔九（守塔老卒，第 113 轮）：塔页内联对话 UI 专项 ============
       壳/默认开场白/三话题/点话题结算/听过后标记/落盘/离页回页/记忆联动（语气前缀）。 */
    /* 本块固定崔九状态与日期：避免前面 W1 用例残留 met=0（按钮全灰、点了不结算）
       与真实日期撞上 7 的倍数（巡塔收起）。这是测试夹具，不改玩法。 */
    S.npcs.cuijiu = { met: 1, rel: 0, stage: 0, lastSeen: Date.now(), heard: [],
                      coldUntil: 0, attitude: { open: 0, guarded: 0, rude: 0 },
                      events: [], state: { kind: 'in', until: 0 },
                      lastDecayAt: 0, seenGens: 0,
                      choice: { climb: 0, chat: 0, listen: 0 }, cur: { talk: 0 } };
    S.day.key = '2026-11-16';
    await openTower();
    XX._cuijiu.enter();   /* 用固定日重渲染一次，避开 ensureDay 的日期漂移 */
    const cqg = q('xx-cuijiu-greet'), cqt = q('xx-cuijiu-topics'), cqr = q('xx-cuijiu-reply'), cqs = q('xx-cuijiu-sub');
    L('cqShell', !!cqg && !!cqt && !!cqr && !!cqs ? 'ok' : 'bad:缺壳');
    L('cqGreetDefault', cqg.textContent === '这位朋友，老朽崔九，守着这塔。客从何来？' ? 'ok' : 'bad:' + cqg.textContent);
    const cqBtns = Array.prototype.slice.call(cqt.querySelectorAll('[data-cuijiu]'));
    /* C2-2 后真实话题数是 6（3 解锁 + 3 锁），旧断言「3 个」已陈旧。 */
    L('cqTopics6', cqBtns.length === 6 && cqBtns.map(b => b.dataset.cuijiu).join(',') === 'ct1,ct2,ct3,ct4,ct5,ct6' ? 'ok' : 'bad:' + cqBtns.length);
    L('cqTopicNoHeardMark', cqBtns.every(b => b.textContent.indexOf('· 回忆') < 0) ? 'ok' : 'bad');
    L('cqTotal', String(CQT()));
    /* D2/P10：副题整段移除，不再有「x/y 已听 · 关系 N」。 */
    L('cqSubZero', cqs.textContent === '' ? 'ok' : 'bad:' + cqs.textContent);
    cqBtns[0].click();
    await sleep(250);
    L('cqReplyShown', !cqr.hidden && cqr.textContent.length > 0 && cqr.textContent.indexOf('（关系') < 0 && !/[0-9０-９]/.test(cqr.textContent) ? 'ok' : 'bad:' + cqr.textContent);
    L('cqHeardMark', cqt.querySelector('[data-cuijiu="ct1"]').textContent.indexOf('· 回忆') > 0 ? 'ok' : 'bad');
    L('cqSubAfter', cqs.textContent === '' ? 'ok' : 'bad:' + cqs.textContent);
    const cqSaved = (JSON.parse(localStorage.getItem('xiuxian_save')).npcs || {}).cuijiu || {};
    L('cqSavedPick', cqSaved.met === 1 && cqSaved.rel === 2 && cqSaved.heard[0] === 'ct1' ? 'ok' : 'bad:' + JSON.stringify(cqSaved));
    ROUTER.open('role');
    await sleep(250);
    ROUTER.open('tower');
    await sleep(320); XX._render(); await sleep(120);
    L('cqReenterGreet', q('xx-cuijiu-greet').textContent.length > 0 ? 'ok' : 'bad:空');
    L('cqReenterReplyGone', q('xx-cuijiu-reply').hidden ? 'ok' : 'bad:回复跨页残留');
    L('cqVoicePrefix', q('xx-cuijiu-greet').textContent.indexOf('是你啊。') === 0 ? 'ok' : 'bad:' + q('xx-cuijiu-greet').textContent);
    /* 依赖缺失降级（审查 T-113 第 1 条）：NpcTower 缺失 → 整张卡片 hidden；恢复 → 重新显示 */
    const _NT = window.NpcTower;
    try{ delete window.NpcTower; }catch(e){}
    XX._cuijiu.render();
    L('cqHideNoTower', q('xx-cuijiu-root').hidden === true ? 'ok' : 'bad:未整块收起');
    window.NpcTower = _NT;
    XX._cuijiu.render();
    L('cqShowBackTower', q('xx-cuijiu-root').hidden === false && q('xx-cuijiu-greet').textContent.length > 0 ? 'ok' : 'bad');
    /* ============ 崔九主动事件（NpcVisitQueue，第 114 轮）：UI 专项 ============
       队列空 → 主动搭话行 hidden；push 后重进塔页（cuijiuEnter take）→ 显示；消费后不残留；模块缺失降级不炸。 */
    const cqv0 = q('xx-cuijiu-visit');
    L('cqVisitShell', !!cqv0 ? 'ok' : 'bad:缺 xx-cuijiu-visit 壳');
    L('cqVisitHiddenEmpty', cqv0.hidden === true ? 'ok' : 'bad:空队列不该显示');
    NpcVisitQueue.push('cuijiu', 'ui_probe', '听闻你破了塔中纪录。老朽守塔几十年，少见这样的身手。');
    ROUTER.open('role'); await sleep(250);
    ROUTER.open('tower'); await sleep(320); XX._render(); await sleep(120);
    /* 塔页模板重注入后节点是新的：断言必须现场重查，不能用旧引用（与 cqReenterGreet 同款处理） */
    const cqv1 = q('xx-cuijiu-visit');
    L('cqVisitShown', cqv1 && !cqv1.hidden && cqv1.textContent.indexOf('（老卒朝你招了招手）') === 0 &&
      cqv1.textContent.indexOf('听闻你破了塔中纪录') > 0 ? 'ok' : 'bad:' + (cqv1 ? cqv1.textContent.slice(0, 40) : 'null'));
    L('cqVisitQueueDrained', NpcVisitQueue.pending('cuijiu').length === 0 ? 'ok' : 'bad:enter 应已消费');
    ROUTER.open('role'); await sleep(250);
    ROUTER.open('tower'); await sleep(320); XX._render(); await sleep(120);
    const cqv2 = q('xx-cuijiu-visit');
    L('cqVisitGoneAfterConsume', cqv2 && cqv2.hidden === true && cqv2.textContent === '' ? 'ok' : 'bad:消费后不该残留');
    /* 降级：NpcVisitQueue 缺失 → 塔页照常、搭话行隐藏、不抛异常 */
    const _NVQ = window.NpcVisitQueue;
    try{ delete window.NpcVisitQueue; }catch(e){}
    ROUTER.open('role'); await sleep(250);
    ROUTER.open('tower'); await sleep(320); XX._render(); await sleep(120);
    const cqv3 = q('xx-cuijiu-visit');
    L('cqVisitNoQueueDegraded', q('xx-cuijiu-root').hidden === false &&
      q('xx-cuijiu-greet').textContent.length > 0 && cqv3 && cqv3.hidden === true ? 'ok' : 'bad:降级失败');
    window.NpcVisitQueue = _NVQ;
    /* 托付线 UI（2026-11-16 批）：open 提示 / done 称呼+册子 / failed 冷脸+失约句；无计数。 */
    const cqq = S.npcs.cuijiu;
    S.story.claimed = {'3-2':1,'4-2':1};
    cqq.events = ['cq_e1','cq_e2']; cqq.coldUntil = 0; cqq.state = {kind:'in',until:0};
    cqq.quest = { id:'CQ_T1', state:'open', at: Date.now() };
    S.day.key = '2026-11-16';
    ROUTER.open('role'); await sleep(250);
    ROUTER.open('tower'); await sleep(320); XX._render(); await sleep(120);
    L('cqQuestOpenLine', q('xx-cuijiu-greet').textContent.indexOf('明天这个时候，再上塔一趟') >= 0 &&
      q('xx-cuijiu-sub').textContent === '' ? 'ok' : 'bad:' + q('xx-cuijiu-greet').textContent);
    cqq.quest = { id:'CQ_T1', state:'open', at: Date.now() - 2*86400000 };
    XX._cuijiu.enter();
    L('cqQuestDone', q('xx-cuijiu-greet').textContent.indexOf('守夜人来了。塔还亮着。') === 0 &&
      q('xx-cuijiu-greet').textContent.indexOf('册子后头，另起一页') > 0
      ? 'ok' : 'bad:' + q('xx-cuijiu-greet').textContent);
    cqq.quest = { id:'CQ_T1', state:'open', at: Date.now() - 4*86400000 };
    cqq.rel = 40; cqq.coldUntil = 0; cqq.events = ['cq_e1','cq_e2'];
    XX._cuijiu.enter();
    L('cqQuestFail', q('xx-cuijiu-greet').textContent.indexOf('灯，老朽自己看过了。') > 0 &&
      cqq.rel === 32 && cqq.coldUntil > Date.now()
      ? 'ok' : 'bad:' + q('xx-cuijiu-greet').textContent + '/' + cqq.rel);
    cqq.quest = null; cqq.coldUntil = 0; cqq.rel = 2;
  }catch(e){ L('EXC', e.message); }
  const d=document.createElement('pre'); d.id='diagW'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>
</body>`;

/* W1 三枚抉择按钮的几何：393 与 900 两档各量一遍（无头 CSS 视口会被钳到约 504，
   窄屏另以 shot/shot_w1.js 的真实截图 + style.css 断点文本核对，见 DEV_NOTES 第 108 节坑）。 */
const DIAG_W1_LAYOUT = `
<script>
(async function(){
  const out=[]; const L=(k,v)=>out.push(k+'='+v);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const S=XX._s;
  const st=document.createElement('style');
  st.textContent='.panel-page,.panel-page *{animation:none!important;transition:none!important}';
  document.head.appendChild(st);
  await sleep(300);
  try{
    const c=document.getElementById('char-confirm'); if(c) c.click();
    await sleep(600);
    try{ Tutorial.finish(); }catch(e){}
    try{ Story._STORY.forEach(x=>{ S.story.claimed[x.id]=1; }); Story.closeCard(); }catch(e){}
    document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));
    S.npcs={ stele:{ met:1, rel:15, stage:2, seenGens:0, lastSeen:Date.now(), nudgeAt:0,
      heard:['stele4'], choice:{ listened:1, showoff:0, promise:0 }, cur:{ lastRank:0, talk:1, promptTale:0 } } };
    S.towerMax=3; S.worldFoot='dug';
    ROUTER.open('tower'); await sleep(320); XX._render(); await sleep(150);
    let bs=Array.prototype.slice.call(document.querySelectorAll('#xx-tower [data-foot]'));
    const doors=document.querySelector('#xx-tower .tw-doors');
    const cols=doors?getComputedStyle(doors).gridTemplateColumns.split(' ').length:0;
    /* 折叠线下的按钮要滚进视口再量命中（窄屏 ≤560 会把三扇并排改成单列堆叠，
       单列必然有按钮落在首屏之外，那是可滚动，不是出屏缺陷） */
    if(bs[0]) bs[0].scrollIntoView({block:'center'});
    await sleep(120);
    bs=Array.prototype.slice.call(document.querySelectorAll('#xx-tower [data-foot]'));
    const rs=bs.map(b=>b.getBoundingClientRect());
    let ov='no';
    for(let i=0;i<rs.length;i++) for(let j=i+1;j<rs.length;j++){
      const a=rs[i], b=rs[j];
      if(a.left < b.right-1 && b.left < a.right-1 && a.top < b.bottom-1 && b.top < a.bottom-1) ov='yes';
    }
    const vw=window.innerWidth, vh=window.innerHeight;
    const off=rs.filter(r=>r.left<0||r.top<0||r.right>vw+1||r.bottom>vh+1).length;
    const hit=bs.map((b,i)=>{ const r=rs[i]; const el=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);
      return b.contains(el) || el===b; }).filter(Boolean).length;
    L('n', bs.length);
    L('几何', '重叠=' + ov + ' 出屏=' + off + ' 命中=' + hit + '/' + bs.length + ' 视口=' + vw + 'x' + vh +
      ' 列=' + cols + ' 宽=' + (rs[0] ? Math.round(rs[0].width) : 0));
  }catch(e){ L('几何', 'EXC:' + e.message); }
  const d=document.createElement('pre'); d.id='layW'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>
</body>`;

function run(html, probe, tag, w, h, budget, preId){
  const f = path.join(SCRATCH, '._verify_npc_ui_' + tag + '.html');
  page.writePage(f, html.replace('</body>', probe), 'utf8');
  const ud = path.join(SCRATCH, 'xxnpcui' + tag + process.pid);
  let dom = '';
  try {
    dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
      '--user-data-dir=' + ud, '--virtual-time-budget=' + budget, '--window-size=' + w + ',' + h,
      '--dump-dom', page.fileUrl(f)],
      { encoding: 'utf8', timeout: 240000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (e) { dom = (e.stdout || '') + ''; }
  try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
  fs.rmSync(f, { force: true });
  const m = dom.match(new RegExp('<pre id="' + preId + '">([\\s\\S]*?)</pre>'));
  return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : '';
}

(async () => {
  const html = fs.readFileSync(SRC, 'utf8');
  console.log('\n=== 九霄问道 · 沈碑识人页专项（切片 2b） ===');
  const raw = run(html, DIAG, 'main', 900, 1200, 40000, 'diag');
  if (!raw) { ok(false, '注入脚本跑完'); console.log('\n通过 ' + pass + ' / 失败 ' + fail); process.exit(1); }
  const F = {};
  raw.split('|').forEach(seg => { const i = seg.indexOf('='); if (i > 0) F[seg.slice(0, i).trim()] = seg.slice(i + 1).trim(); });
  ok(F.EXC === undefined, '无异常', F.EXC);
  const CASES = [
    ['hubCell', '人物 hub 有第 6 格 data-jump=xx-role-npc'],
    ['hubSealOK', '第 6 格印章为 0/真实可听话题数'],
    ['root', '进入独立子页面（#xx-role-npc-root 在场）'],
    ['sceneOff', '进入子页后场景页去 active'],
    ['greet2', '初见两句开场白'],
    ['greetTxt', '初见首句与 NPC_STELE.first.lines[0] 一致'],
    ['firstOpts', '初见三个选项'],
    ['topics0', '初见不显示话题'],
    ['name', '姓名=沈碑'],
    ['title', '身份=守碑老吏'],
    ['rel0', '关系摘要起笔为 关系 0'],
    ['arrive1', '进入页面 npcArrive 调用 1 次'],
    ['met1', '初见选项结算 met=1'],
    ['rel2', '初见 ask_black rel=+2'],
    ['talk1', 'cur.talk=1'],
    ['lastSeen', 'lastSeen 已刷新'],
    ['savedRel', '结算已落盘（localStorage rel=2）'],
    ['pick1', '一次点击只结算一次（npcPick 调用 1）'],
    ['replyOn', '回复显示在页面内且文案正确'],
    ['greetKeep', '结算后开场白快照不被覆盖'],
    ['marks6', '初见后六个话题行'],
    ['marksLock', '解锁标记=可谈,可谈,未解锁,未解锁,未解锁,可谈'],
    ['s3Rows6', 'W3·S3：话题行数仍是 6（提示行内子节点不加行）'],
    ['s3HintN', 'W3·S3：三个锁行各有一句提示（共 3 枚 p.sto-hint）'],
    ['s3HintWhere', 'W3·S3：提示恰好只出现在 lock 行，可谈行一句都没有'],
    ['s3HintText', 'W3·S3：三句提示逐字等于配置（页内没另写一套）'],
    ['s3HintNoLeak', 'W3·S3：话题区整段文本不含 stage/rel/数字（反剧透）'],
    ['s3LockStillDead', 'W3·S3：加了提示的锁行依旧不可点（无 role=button、无 data-topic）'],
    ['lore', '打开话题显示 lore 正文'],
    ['opts3', '话题①三个选项'],
    ['replyOffOnSwitch', '切换话题清掉上一条回复'],
    ['stage1', '耐心听推进 stage=1'],
    ['rel5', '首次结算 rel=+3 → 5'],
    ['heard1', 'heard 推入 stele1'],
    ['listened1', 'choice.listened=1'],
    ['recallMark', '已听话题标「回忆」'],
    ['recallNotLore', '已听话题显示回忆版而非 lore'],
    ['rel6', '重复交谈 rel 只 +1 → 6'],
    ['talk3', 'cur.talk 累计 3'],
    ['stage2', '信推进 stage=2'],
    ['stele4Open', 'stage2 后④解锁、①③标已听'],
    ['s3HintShrinks', 'W3·S3：③④ 解锁后提示只剩⑤那一句（重绘不留旧态）'],
    ['stele5Open', 'rel≥15 重进后⑤解锁'],
    ['s3HintZero', 'W3·S3：全解锁后提示归零'],
    ['arrive2', '第二次进入 npcArrive 累计 2'],
    ['reunionGreet', '重逢开场白为 reunion 句'],
    ['seenGens1', 'npcMarkReunion 同步 seenGens=1'],
    ['arrive3', '第三次进入 npcArrive 累计 3'],
    ['greetStable', '重逢开场白跨过 tick 不被覆盖'],
    ['greetStable2', '手动 XX._render() 两次后仍不覆盖'],
    ['replyCleared', '离开再进入回复已清除'],
    ['greetDef', '重逢消费后开场白回到默认句'],
    ['subHeard', '话题小计为 n/真实可听话题数 已听'],
    ['heardMarks2', '读档后已听标记 2 个'],
    ['rebornTalk0', '转世后本世 cur.talk=0'],
    ['rebornHeard', '转世后跨世 heard 保留 2'],
    ['rebornRel', '转世后跨世 rel 保留'],
    ['rebornRelLine', '转世后关系摘要读跨世 rel'],
    ['floatPanelHidden', '2a：面板页不弹浮片'],
    ['floatNotConsumed', '2a：被门控时不消费事件'],
    ['floatShown', '2a：回场景立即弹'],
    ['floatSaved', '2a：消费标记落盘'],
    ['floatGone', '2a：15 秒自灭']
  ];
  for (const [k, label, extra] of CASES) {
    const v = F[k];
    ok(v === 'ok' || (extra && v !== undefined && extra(v)), label + '（' + k + '=' + v + '）');
  }

  console.log('\n--- 布局量测 ---');
  const l393 = run(html, LAYOUT, 'w393', 393, 720, 6000, 'lay');
  const l900 = run(html, LAYOUT, 'w900', 900, 1200, 6000, 'lay');
  console.log('  393: ' + (l393 || 'NOT FOUND'));
  console.log('  900: ' + (l900 || 'NOT FOUND'));
  const parse = s => {
    const m = s && s.match(/溢出=(\d+).*按钮重叠=(\d+).*立绘=(\d+).*图=(\S+) 自然宽=(\d+) fit=(\S+) 变换=(.+?) 定位=(.*)$/);
    return m ? { over: +m[1], ov: +m[2], pw: +m[3], img: m[4], nw: +m[5], fit: m[6], tf: m[7], pos: m[8] } : null;
  };
  const a = parse(l393), b = parse(l900);
  ok(!!a && a.over === 0 && a.ov === 0, '393 窗口无出屏/无按钮重叠', l393);
  /* 2026-11-06 窄屏首屏改版：≤560 断点立绘由「240×520 独占整屏」改为「112 宽 + 右侧身份并排」，
     原因见 style.css 该断点注释（393×780 实测原版要滚一屏半才见到第一句台词）。
     断言随之收紧：宽度必须正好落到新档 112，且原比例（540:1170）与不裁切特性仍要成立。 */
  const cssNpcTxt = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ok(!!a && a.pw === 112, '504 档（≤560 断点）立绘收 112px、与右侧身份并排（窄屏首屏可读到台词）', l393);
  ok(cssNpcTxt.indexOf('aspect-ratio:540/1170') >= 0, '窄屏立绘保持 540:1170 原比例（CSS 在表内，不裁头脚）');
  ok(cssNpcTxt.indexOf('grid-template-columns:112px minmax(0,1fr)') >= 0, '窄屏 hero 走「立绘 + 身份」两列（CSS 在表内）');
  ok(!!b && b.over === 0 && b.ov === 0, '900 桌面无出屏/无按钮重叠', l900);
  ok(!!b && b.pw === 240, '900 立绘 240px（切片 2d）', l900);
  /* 切片 2d 新增（严格）：立绘必须是真图、解码完成、contain 完整展示、不被照镜页的镜像/滤镜污染、不引起横向溢出 */
  [['393', a], ['900', b]].forEach(([tag, v]) => {
    ok(!!v, tag + ' 布局探针有输出', v);
    ok(!!v && v.img === 'yes', tag + ' #npc-portrait img 存在（图=' + (v && v.img) + '）');
    ok(!!v && v.nw >= 500, tag + ' 立绘加载完成且 naturalWidth ≥ 500（自然宽=' + (v && v.nw) + '）');
    ok(!!v && v.fit === 'contain', tag + ' object-fit 必须 contain（fit=' + (v && v.fit) + '）');
    ok(!!v && (v.tf === 'none' || v.tf === 'matrix(1, 0, 0, 1, 0, 0)'), tag + ' 立绘未被镜像翻转（变换=' + (v && v.tf) + '）');
    ok(!!v && v.over === 0, tag + ' 立绘未造成横向溢出（溢出=' + (v && v.over) + '）');
  });
  /* 无头 Edge 的 CSS 视口下限约 504px，max-width:430 断点跑不进去（历轮 layout 同限制）。
     窄屏适配改为静态核对断点规则在表内 + 运行时 504 档无溢出。 */
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ok(css.indexOf('@media (max-width:430px){') >= 0 && css.indexOf('.mf-portrait{ width:74px') >= 0,
     '430 断点内立绘收 74px 规则在表内');
  ok(css.indexOf('.npc-portrait .npc-seal{ font-size:28px') >= 0, '430 断点内 .npc- 印字收窄规则在表内');

  console.log('\n--- 初见切换 / 失败不切换 ---');
  const rawA = run(html, DIAG_FIRST_OK, 'firstok', 900, 1200, 9000, 'diagA');
  const rawB = run(html, DIAG_FIRST_FAIL, 'firstfail', 900, 1200, 9000, 'diagB');
  const FA = {}, FB = {};
  (rawA || '').split('|').forEach(seg => { const i = seg.indexOf('='); if (i > 0) FA[seg.slice(0, i).trim()] = seg.slice(i + 1).trim(); });
  (rawB || '').split('|').forEach(seg => { const i = seg.indexOf('='); if (i > 0) FB[seg.slice(0, i).trim()] = seg.slice(i + 1).trim(); });
  ok(FA.EXC === undefined, '初见成功组无异常', FA.EXC);
  [
    ['beforeFirst', 'yes', '进入时 npcUi.first 为 true'],
    ['beforeOpts', '3', '进入时有 3 个初见选项'],
    ['afterFirstFalse', 'yes', '结算后 npcUi.first === false'],
    ['afterTopicNull', 'yes', '结算后未选中话题（话题视图待选）'],
    ['tipGone', 'yes', '初见提示行已消失'],
    ['firstOptsGone', 'yes', '初见选项按钮已消失'],
    ['topics6', 'yes', '正式话题列表 6 行'],
    ['picks1', 'yes', '只结算一次（npcPick 调用 1 次）'],
    ['state1', 'yes', 'met=1 / rel=2 / cur.talk=1'],
    ['saved1', 'yes', '结算已落盘']
  ].forEach(([k, exp, label]) => ok(FA[k] === exp, label + '（' + k + '=' + FA[k] + '）'));
  ok(FB.EXC === undefined, '初见失败组无异常', FB.EXC);
  ok(FB.openFirst === 'yes', '失败组起点：页面停在初见视图（' + FB.openFirst + '）');
  ok(FB.openOpts === '3', '失败组起点：3 个初见选项（' + FB.openOpts + '）');
  ok(FB.failOk === 'yes' && FB.failErr === 'bad_option', '失效选项：npcPick 返回失败 bad_option（' + FB.failErr + '）');
  ok(FB.failFirstKept === 'yes', '失败后 npcUi.first 仍为 true');
  ok(FB.failOptsStill === '3', '失败后初见选项仍存在（' + FB.failOptsStill + '）');
  ok(FB.failNoSave === 'yes', '失败后没有错误存档（npc 字段快照不变）');
  ok(FB.failNoState === 'yes', '失败后 met/rel/cur.talk 均未变化');
  ok(FB.failTopicNull === 'yes', '失败后没有进入话题视图（topic 仍为 null）');
  ok(FB.failReply === 'yes', '失败后在页内给出中性提示（bad 样式）');
  ok(FB.alreadyOk === 'yes' && FB.alreadyErr === 'already_met', '底层已 met=1：npcPick 返回 already_met（' + FB.alreadyErr + '）');
  ok(FB.alreadyFirstKept === 'yes', 'already_met 后 npcUi.first 仍为 true');
  ok(FB.alreadyTopicNull === 'yes', 'already_met 后未进入话题视图');
  ok(FB.alreadyNoSave === 'yes', 'already_met 后没有错误存档');
  ok(FB.alreadyTalk === '0', 'already_met 后 cur.talk 仍为 0');
  ok(FB.picks2 === 'yes', '两次失败各调用 npcPick 一次（合计 2）');

  console.log('\n--- 2c 来访气泡：点击进识人页 / 门控 / 几何 ---');
  const rawV = run(html, DIAG_VISIT, 'visit', 900, 1200, 210000, 'diagV');
  const rawG = run(html, DIAG_VISIT_GATES, 'visitgates', 900, 1200, 160000, 'diagG');
  const FV = {}, FG = {};
  (rawV || '').split('|').forEach(seg => { const i = seg.indexOf('='); if (i > 0) FV[seg.slice(0, i).trim()] = seg.slice(i + 1).trim(); });
  (rawG || '').split('|').forEach(seg => { const i = seg.indexOf('='); if (i > 0) FG[seg.slice(0, i).trim()] = seg.slice(i + 1).trim(); });
  ok(FV.EXC === undefined, '气泡点击组无异常', FV.EXC);
  [
    ['p0_visible', 'yes', '2a 回归：首次判定后气泡上屏'],
    ['p0_timerSet', 'yes', '2a 回归：挂上 15 秒定时器'],
    ['p0_autohide', 'yes', '2a 回归：15 秒后自动收起'],
    ['p1_visible', 'yes', '事件 B 到访气泡上屏'],
    ['p1_page', 'yes', '点击气泡进入识人页（role_npc）'],
    ['p1_sceneOff', 'ok', '进页后场景页去 active'],
    ['p1_hidden', 'yes', '点击后气泡立即收起'],
    ['p1_timerCleared', 'yes', '点击后 15 秒定时器被清掉'],
    ['p1_arrive', '1', '进入只调用一次 npcArrive（无重复生命周期）'],
    ['p1_mark', '1', '进入只调用一次 npcMarkReunion'],
    ['p1_single', 'yes', '只开出单张面板页（快速双击被挡）'],
    ['p1_open', '1', '两次快速点击只调用一次 ROUTER.open'],
    ['p1_lastRank', '3', '事件 B 不误写 lastRank（仍为 3）'],
    ['p1_saved', '3', '2a 消费标记已落盘（localStorage lastRank=3）'],
    ['p1_scene', 'yes', '连按返回先回人物 hub 再回场景'],
    ['p2_visible', 'yes', '事件 C 到访气泡上屏'],
    ['p2_page', 'yes', 'Enter 键进入识人页'],
    ['p2_arrive', '2', 'Enter 进入累计 npcArrive=2'],
    ['p3_visible', 'yes', '事件 A 到访气泡上屏'],
    ['p3_page', 'yes', 'Space 键进入识人页'],
    ['p3_arrive', '3', 'Space 进入累计 npcArrive=3'],
    ['p4_hidden', 'yes', '返回场景后气泡仍保持收起（不复活）'],
    ['p4_lastRank', '4', '事件 A 消费 lastRank 落为 4']
  ].forEach(([k, exp, label]) => ok(FV[k] === exp, label + '（' + k + '=' + FV[k] + '）'));
  ok(FG.EXC === undefined, '气泡门控组无异常', FG.EXC);
  [
    ['g1_hidden', 'yes', '弹窗在场时气泡不弹（62 秒）'],
    ['g1_lastRank', '0', '门控期间不判定不消费（lastRank 仍 0）'],
    ['g1_after', 'yes', '弹窗关掉后立即判定上屏'],
    ['g2_hidden', 'yes', '妖踪在场时气泡不弹'],
    ['g2_promptTale', '0', '妖踪门控期间不消费事件 B'],
    ['g2_trace', 'yes', '对照组：妖踪条确实在屏上'],
    ['g2_after', 'yes', '妖踪退场后立即判定上屏']
  ].forEach(([k, exp, label]) => ok(FG[k] === exp, label + '（' + k + '=' + FG[k] + '）'));
  const parseV = s => {
    const m = s && s.match(/可见=(\S+) 压Tab=(\S+) 压系统栏=(\S+).*pe=(\S+) cursor=(\S+) 命中=(\S+)/);
    return m ? { vis: m[1], tab: m[2], rail: m[3], pe: m[4], cur: m[5], hit: m[6] } : null;
  };
  const v393 = parseV(run(html, DIAG_VISIT_LAYOUT, 'visitw393', 393, 720, 6000, 'layV'));
  const v900 = parseV(run(html, DIAG_VISIT_LAYOUT, 'visitw900', 900, 1200, 6000, 'layV'));
  console.log('  393: ' + JSON.stringify(v393));
  console.log('  900: ' + JSON.stringify(v900));
  ok(!!v393 && v393.vis === 'yes' && v393.tab === 'no' && v393.rail === 'no', '393 气泡在屏、不压底栏/系统栏', v393);
  ok(!!v393 && v393.pe === 'auto' && v393.cur === 'pointer' && v393.hit === 'yes', '393 气泡可点（pointer-events/cursor/命中）', v393);
  ok(!!v900 && v900.vis === 'yes' && v900.tab === 'no' && v900.rail === 'no', '900 气泡在屏、不压底栏/系统栏', v900);
  ok(!!v900 && v900.pe === 'auto' && v900.cur === 'pointer' && v900.hit === 'yes', '900 气泡可点（pointer-events/cursor/命中）', v900);

  console.log('\n--- 2f 碑外一线：识人页清单 + 塔页/寿元页题注 ---');
  const rawE = run(html, DIAG_ECHO, 'echo', 900, 1200, 30000, 'diagE');
  const FE = {};
  (rawE || '').split('|').forEach(seg => { const i = seg.indexOf('='); if (i > 0) FE[seg.slice(0, i).trim()] = seg.slice(i + 1).trim(); });
  ok(FE.EXC === undefined, '2f 接线组无异常', FE.EXC);
  [
    ['e2fShell', '壳节点在识人卡片直下且含清单容器'],
    ['e2fOutsideHero', '壳落在 .npc-stage.npc-hero 网格之外'],
    ['e2fShellOne', '#npc-clues 全页只有一枚'],
    ['e2fFour', '清单恒定四行'],
    ['e2fOrder', '四行顺序 clue1-4 / stele1·3·4·5'],
    ['e2fAllLock', '新档四行全未解、副标 0/4'],
    ['e2fNoLeak', '未解行只留白「——」，四条台词一条都不落 DOM'],
    ['e2fIdem', '真实点击切话题两次：壳不复制、内容逐字不变'],
    ['e2fTickKeep', '两次全局 render + 跨过 500ms 节拍后壳仍唯一、内容不变'],
    ['e2fTowerLock', '塔页题注未解锁：节点在、hidden、文本为空'],
    ['e2fLifeLock', '寿元页题注未解锁：节点在、hidden、文本为空'],
    ['e2fLifeInNow', '寿元题注落在 xx-life-now 那一页'],
    ['e2fL1', '只听① → 清单 1000、副标 1/4、首行显 lore 原文'],
    ['e2fNotStage', 'stage=2/rel=20 且话题④可点开但未听 → 线索③④仍未解（条件不取 stage/rel）'],
    ['e2fTowerOpen', '听过山外 → 塔页题注显形且文案等于配置 lore'],
    ['e2fTowerSync', '塔页题注跨 500ms 重绘保持正确、节点不翻倍'],
    ['e2fLifeOpen', '听过他为何守着 → 寿元页题注显形且文案等于配置 lore'],
    ['e2fLifeSync', '寿元页题注跨 500ms 重绘保持正确、节点不翻倍'],
    ['e2fAllOpen', '四条全解：1111 + 4/4 + 逐行等于配置 lore'],
    ['e2fNoNumeric', '零数值：两次渲染 + 真实点话题不改 stone/exp'],
    ['e2fRebornKeep', '转世后清单仍 1111（跨世保留）'],
    ['e2fRebornTower', '转世后塔页题注不回锁'],
    ['e2fRebornLife', '转世后寿元页题注不回锁'],
    ['e2fResetTower', '重开后塔页题注回到 hidden 空文本'],
    ['e2fResetLife', '重开后寿元页题注回到 hidden 空文本'],
    ['e2fResetClues', '重开后清单回到 0000 / 0/4']
  ].forEach(([k, label]) => ok(FE[k] === 'ok', label + '（' + k + '=' + FE[k] + '）'));

  console.log('\n--- W1 塔底：三闸门 · 三分支结算 · 公共道碑 · 回响与生命周期 ---');
  const rawW = run(html, DIAG_W1, 'w1', 900, 1300, 120000, 'diagW');
  const FW = {};
  (rawW || '').split('|').forEach(seg => { const i = seg.indexOf('='); if (i > 0) FW[seg.slice(0, i).trim()] = seg.slice(i + 1).trim(); });
  ok(!!rawW, 'W1 组探针跑完（Edge 交出 diagW）', rawW ? '' : '空');
  ok(FW.EXC === undefined, 'W1 组无异常', FW.EXC);
  [
    ['boot', '创角后进探针（引导/主线全部让路）'],
    ['w1InitFoot', '新档 worldFoot 起于空串'],
    ['w1MileOffFresh', '空档态 checkMiles 不误立 m_foot（谓词对老档为假）'],
    ['w1NoEntryFresh', '新档塔页一枚 data-foot 都没有'],
    ['w1ShellOne', '#npc-world-echo 全页只有一枚'],
    ['w1ShellEmpty', '非终态：识人页回响壳在而文本为空'],
    ['w1EmLock', '清单第 3 行起于「未解」'],
    ['w1G1Clue', '闸门①：没听过「山外」→ 不给俯身入口'],
    ['w1G2Tower', '闸门②：towerMax=0（没进过塔）→ 不给俯身入口'],
    ['w1DigShown', '两闸门齐 → 俯身入口出现'],
    ['w1NoDoorsYet', '还没俯身时只有 dig，不出三枚抉择'],
    ['w1DugState', '真实点击俯身 → worldFoot=dug'],
    ['w1DugSaved', '俯身即落盘（localStorage worldFoot=dug）'],
    ['w1DugNoNumeric', '俯身零数值：六项资源一项未动'],
    ['w1WaitNoDoors', '契机未满足 → 三枚抉择不出现'],
    ['w1WaitHint', '等头给出指路（护心镜 / 第 3 层）'],
    ['w1ThreeDoors', '契机达成 → 三枚抉择按 open,self,seal 出现'],
    ['w1RelGate', 'rel=14 时「请沈碑」置灰（disabled）'],
    ['w1RelVisible', '置灰那条仍在 DOM 且写明 14/15'],
    ['w1RelOk', 'rel=15 时可点'],
    ['w1OpenState', '① 真实点击 → worldFoot=open'],
    ['w1OpenInsight', '① 顿悟实际到账 = 12（未触顶）'],
    ['w1OpenOnly', '① 只动顿悟：灵石/修为/镜/悟道值全平'],
    ['w1OpenSaved', '① 终态落盘'],
    ['w1OpenDoorsGone', '终态后三枚抉择从 DOM 消失'],
    ['w1OpenTowerEcho', '① 塔页回响行出现且非空'],
    ['w1OpenNpcEcho', '① 识人页回响出现且非空'],
    ['w1OpenEm', '① 终态后清单第 3 行升「已印证」'],
    ['w1Idem', '终态不可逆：再点无按钮、六项资源零变化'],
    ['w1MileLit', '终态后 checkMiles 立起 m_foot'],
    ['w1MileOne', '这一次只立起一方碑（不牵连别的碑）'],
    ['w1MileName', '碑名「塔下一线」进道碑面板'],
    ['w1SelfState', '② 真实点击 → worldFoot=self'],
    ['w1SelfStone', '② 灵石到账 = round(needOf×0.6)'],
    ['w1SelfEarnedFlat', '② 灵石不计入 stats.stoneEarned（与既有奇遇同口径）'],
    ['w1SelfLoss', '② 反噬 = needOf×0.04（无镜时全额）'],
    ['w1SelfInsightFlat', '② 不动顿悟与悟道值'],
    ['w1SelfEchoDiff', '② 塔页回响与①不同文'],
    ['w1MirrorMinusOne', '② 有旧镜：镜数 -1（既有抵扣规则，绝不 +1）'],
    ['w1MirrorHalved', '② 有旧镜：反噬按规则减半'],
    ['w1SealState', '③ 真实点击 → worldFoot=seal'],
    ['w1SealWisdom', '③ 悟道值到账 = wisdomGain(40) 含境界系数'],
    ['w1SealFlat', '③ 只动悟道值：灵石/修为/镜/顿悟全平'],
    ['w1ThreeEchoDistinct', '三条终态的塔页回响互不相同'],
    ['w1NoLeakTower', '退回 dug：另两条结果话一条都不在 DOM'],
    ['w1NoLeakNpc', '退回 dug：识人页回响重新为空'],
    ['w1EmBackToOpen', '退回 dug：清单第 3 行回到「已解」而非「已印证」'],
    ['w1RebornKeep', '转世后 worldFoot 保留'],
    ['w1RebornSaved', '转世落盘仍是终态'],
    ['w1RebornMile', '转世后道碑不倒（miles 跨世保留）'],
    ['w1RebornTowerEcho', '转世后塔页回响逐字不变'],
    ['w1RebornNpcEcho', '转世后识人页回响仍在'],
    ['w1RenderIdem', '连续三次全局 render + 跨过 500ms：事件资源不动、塔页回响节点不翻倍且文本不变'],
    ['w1ShellOneAfterRender', '跨节拍后回识人页：回响壳仍唯一'],
    ['w1ResetFoot', '重开后 worldFoot 归空串'],
    ['w1ResetMile', '重开后 m_foot 随 miles 一起灭'],
    ['w1ResetEcho', '重开后塔页回响节点消失'],
    ['w1ResetNpcEcho', '重开后识人页回响为空'],
    ['w1ResetEm', '重开后清单第 3 行回「未解」'],
    ['cqShell', '崔九：塔页四件壳（问候/话题/回复/副题）都在'],
    ['cqGreetDefault', '崔九：默认开场白逐字（stranger 档带「这位朋友，」前缀 + 底句，无旧事行）'],
    ['cqTopics6', '崔九：六话题按钮 ct1-ct6（3 解锁 + 3 锁）'],
    ['cqTopicNoHeardMark', '崔九：没聊过的话题不带「· 回忆」'],
    ['cqSubZero', '崔九：副题为空（去计数）'],
    ['cqReplyShown', '崔九：点话题 → 回复出现且不带关系数字'],
    ['cqHeardMark', '崔九：聊过的话题加「· 回忆」'],
    ['cqSubAfter', '崔九：点完后副题仍为空'],
    ['cqSavedPick', '崔九：结算落盘（met/rel/heard）'],
    ['cqReenterGreet', '崔九：离页再回，开场白快照重建'],
    ['cqReenterReplyGone', '崔九：回复不跨页残留'],
    ['cqVoicePrefix', '崔九：聊过一轮 → 问候带语气前缀「是你啊。」（记忆联动）'],
    ['cqHideNoTower', '崔九：NpcTower 缺失 → 整张卡片 hidden（不只清空内容）'],
    ['cqShowBackTower', '崔九：依赖恢复 → 卡片重新显示且内容重建'],
    ['cqVisitShell', '崔九主动事件：搭话行壳 xx-cuijiu-visit 存在'],
    ['cqVisitHiddenEmpty', '崔九主动事件：队列空时搭话行隐藏'],
    ['cqVisitShown', '崔九主动事件：push 后重进塔页 → 搭话行渲染（招手前缀 + 文案）'],
    ['cqVisitQueueDrained', '崔九主动事件：enter 时机消费完毕，队列不留存'],
    ['cqVisitGoneAfterConsume', '崔九主动事件：消费后再进页不残留'],
    ['cqVisitNoQueueDegraded', '崔九主动事件：NpcVisitQueue 缺失 → 塔页照常、搭话行隐藏（降级）'],
    ['cqQuestOpenLine', '崔九托付：open 进页提示，副题仍空'],
    ['cqQuestDone', '崔九托付：done 称呼变体＋册子/灯，一次'],
    ['cqQuestFail', '崔九托付：failed 冷脸＋失约句，rel−8']
  ].forEach(([k, label]) => ok(FW[k] === 'ok', label + '（' + k + '=' + FW[k] + '）'));
  ok(FW.w1MilesTotal === '35', '道碑总数 = 35（W1 加公共碑「塔下一线」一块，W2 加三条后续碑，共 32→35）（' + FW.w1MilesTotal + '）');
  const parseW = s => {
    const m = s && s.match(/重叠=(\S+) 出屏=(\d+) 命中=(\S+) 视口=(\S+?) 列=(\d+)/);
    return m ? { ov: m[1], off: m[2], hit: m[3], vw: m[4], cols: m[5] } : null;
  };
  const w393 = parseW(run(html, DIAG_W1_LAYOUT, 'w1w393', 393, 720, 25000, 'layW'));
  const w900 = parseW(run(html, DIAG_W1_LAYOUT, 'w1w900', 900, 1200, 25000, 'layW'));
  console.log('  W1 393: ' + JSON.stringify(w393));
  console.log('  W1 900: ' + JSON.stringify(w900));
  ok(!!w393 && w393.ov === 'no' && w393.off === '0' && w393.hit === '3/3', 'W1 三枚按钮 393 档：不重叠、不出屏、全可命中', w393);
  ok(!!w393 && w393.cols === '1', 'W1 窄屏（≤560）三枚按钮走单列堆叠（复用 style.css:2645 现成规则，未加一条 CSS）', w393 && w393.cols);
  ok(!!w900 && w900.ov === 'no' && w900.off === '0' && w900.hit === '3/3', 'W1 三枚按钮 900 档：不重叠、不出屏、全可命中', w900);
  ok(!!w900 && w900.cols === '3', 'W1 桌面档三枚并排（grid 三列）', w900 && w900.cols);

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
