'use strict';
/* 修复小单探针：重看引导真实点击链（不许直调 Guide.replay）
   A 完成态：DOM 点设置 → 点「重看新手引导」→ 第 1 拍在位 → 点气泡进第 2 拍 → 点「先别唠叨」DOM=0
   B 剧情在场：重看被排队（气泡 0、剧情开）→ 关剧情 → 第 1 拍出现
   C 新号首进：创角真实入口确认 → 关剧情 → 第 1 拍出现
   用法：ELECTRON_RUN_AS_NODE=1 ... _fix_replay_real_check.js */
const fs = require('node:fs'), path = require('node:path');
const ROOT = __dirname;
const PAGE = require('./tools/page.js');
const { execEdge } = require('./tools/edge-run.js');
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const base = {name:'复验散人',sex:'m',gender:'male',robe:'bai',rank:3,exp:0,stone:500,cave:0,dan:1,forge:1,dao:0,rootIdx:1,gong1:0,gong2:0,gong3:0,field:0,mine:0,herb:10,ore:10,weapon:0,weaponLv:0,bagSize:20,tower:1,towerMax:1,petSlots:1,wisdom:0,insight:0,failBonus:0,guardMirror:0,guardArray:0,tianji:0,herb100:0,herb10000:0,log:[],bag:[{t:'dan1',n:'下品破境丹'}],recipeN:{},mastery:{alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0},stats:{sit:9,herb:3,train:2,enlight:1,craftPill:1,explore:0,hunt:0,enhance:0,stoneEarned:100,farmN:0},plots:[],pets:[],eggs:[],arena:{day:'',left:0,tier:1,win:0,lose:0,rep:0,foes:[]},union:{start:t,day:'',left:0,merit:0,claimed:[],season:1},sign:{days:0,last:''},secret:{prog:[0,0,0,0],day:'',swept:0},towerDay:'',towerSwept:0,enc:{t:0,bubble:null,lastId:''},encBuff:{mult:0,until:0},miles:{},milesNew:[],letters:[],story:{claimed:claimed},equipment:{weapon:null,armor:null,accessory:null},shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},questsDone:[],bossKilled:{},acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},actDay:'',gate:{lv:0,grad:0,disciples:[]},council:{day:'',n:0,last:''},trail:{i:8},trail2:{i:0},life:{age:0,on:true,brk:0},legacy:{gens:0,relic:null,hist:[],pick:null},mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},guide:{step:14,done:true,skipped:false,started:true,flags:{c_enter:true,c_sit:true,c_brk:true,c_field:true},rewardClaims:{taixu_intro_dan_v1:true},toldSystems:{}},last:t};
function seedOf(save) { return '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>'; }
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';

function runCase(name, seedHtml, script, wait) {
  const DIAG = `(async function(){
    var o={ok:true,errs:[]}; var sleep=ms=>new Promise(r=>setTimeout(r,ms));
    try{ ${script} }catch(e){ o.ok=false; o.errs.push(String(e&&e.stack||e)); }
    setTimeout(function(){ document.getElementById('diag').textContent='G='+JSON.stringify(o); }, ${wait});
  })();`;
  const f = path.join(PAGE.SCRATCH, '._realreplay_' + name + '.html');
  PAGE.writePage(f, html.replace('</head>', seedHtml + '\n</head>').replace('</body>', FREEZE +
    '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
    '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},900);});</script></body>'));
  const ud = path.join('D:/xx-scratch', 'xxrr' + Date.now() + name);
  try {
    const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
      '--virtual-time-budget=16000','--window-size=900,1200','--dump-dom','file:///' + f.replace(/\\/g, '/')],
      { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
    const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
    return m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  } catch (e) { return 'G={"ok":false,"errs":["' + e.message + '"]}'; }
  finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
}

let failed = 0;
/* A 完成态：真实点击链 */
{
  const r = runCase('A', seedOf(base), `
    await sleep(300);
    var sm=document.getElementById('story-modal'); if(sm && !sm.classList.contains('hidden')) document.getElementById('sto-close').click();
    await sleep(400);
    var snap=JSON.stringify(window.S.guide);
    var src=document.querySelector('script[src*="guide_taixu"]');
    o.ver={src:src?src.getAttribute('src'):'', hasReplay:typeof window.Guide.replay==='function'};
    if(!o.ver.hasReplay || o.ver.src.indexOf('fix2')<0) o.errs.push('guide 模块非 fix2/无 replay: '+JSON.stringify(o.ver));
    document.getElementById('sc-settings').click(); await sleep(300);
    o.settingsOpen=!document.getElementById('settings-modal').classList.contains('hidden');
    var rb=document.getElementById('m-guide-replay'); if(rb) rb.click();
    await sleep(800);
    var b=document.getElementById('taixu-bubble');
    o.first={hasB:!!b, step:(window.S.guide||{}).step, text:(b&&b.querySelector('.tb-text')||{}).textContent, skip:!!document.getElementById('taixu-skip'), settingsHidden:document.getElementById('settings-modal').classList.contains('hidden')};
    if(!(o.first.hasB && o.first.step===0 && /站住/.test(o.first.text) && o.first.skip && o.first.settingsHidden)) o.errs.push('第 1 拍异常: '+JSON.stringify(o.first));
    if(b) b.click();
    await sleep(300);
    var b2=document.getElementById('taixu-bubble');
    o.second={step:(window.S.guide||{}).step, text:(b2&&b2.querySelector('.tb-text')||{}).textContent};
    if(!(o.second.step===1 && /太虚真人/.test(o.second.text))) o.errs.push('第 2 拍异常');
    var sk=document.getElementById('taixu-skip'); if(sk) sk.click();
    await sleep(400);
    o.end={hasB:!!document.getElementById('taixu-bubble'), skip:!!document.getElementById('taixu-skip'), same:JSON.stringify(window.S.guide)===snap};
    if(!(o.end.same && !o.end.hasB && !o.end.skip)) o.errs.push('结束未恢复/有残留');
  `, 3200);
  console.log('A ' + r);
  let o=null; try{o=JSON.parse(r.replace(/^G=/,''));}catch(e){}
  if(!(o&&o.ok&&o.errs.length===0)) failed++;
}
/* B 剧情在场：重看排队，关剧情后起泡 */
{
  const s2 = JSON.parse(JSON.stringify(base)); s2.story = { claimed: {} };
  const r = runCase('B', seedOf(s2), `
    await sleep(1200);
    var story=document.getElementById('story-modal');
    o.storyOpen0=!!(story && !story.classList.contains('hidden'));
    document.getElementById('sc-settings').click(); await sleep(300);
    var rb=document.getElementById('m-guide-replay'); if(rb) rb.click();
    await sleep(800);
    o.queued={hasB:!!document.getElementById('taixu-bubble'), storyOpen:!!(story && !story.classList.contains('hidden'))};
    if(o.queued.hasB) o.errs.push('剧情在场时气泡抢先出场');
    if(o.queued.storyOpen){ document.getElementById('sto-close').click(); }
    await sleep(1200);
    var b=document.getElementById('taixu-bubble');
    o.after={hasB:!!b, step:(window.S.guide||{}).step, text:(b&&b.querySelector('.tb-text')||{}).textContent};
    if(!(o.after.hasB && o.after.step===0 && /站住/.test(o.after.text))) o.errs.push('关剧情后第 1 拍未出现: '+JSON.stringify(o.after));
    var sk=document.getElementById('taixu-skip'); if(sk) sk.click(); await sleep(300);
  `, 3200);
  console.log('B ' + r);
  let o=null; try{o=JSON.parse(r.replace(/^G=/,''));}catch(e){}
  if(!(o&&o.ok&&o.errs.length===0)) failed++;
}
/* C 新号首进：创角真实入口 → 关剧情 → 第 1 拍 */
{
  const r = runCase('C', '<script>try{localStorage.clear();}catch(e){}</scr' + 'ipt>', `
    await sleep(1200);
    var cm=document.getElementById('char-modal');
    o.charOpen=!!(cm && !cm.classList.contains('hidden'));
    if(!o.charOpen){ o.errs.push('创角弹窗未开'); }
    else{
      var pick=document.querySelector('#char-path-picks .char-pick[data-path]') || document.querySelector('.char-pick[data-path]');
      if(pick) pick.click();
      var ni=document.getElementById('char-name'); if(ni) ni.value='问心';
      document.getElementById('char-confirm').click();
    }
    await sleep(1500);
    var story=document.getElementById('story-modal');
    o.afterChar={charOpen:!document.getElementById('char-modal').classList.contains('hidden'), storyOpen:!!(story && !story.classList.contains('hidden')), hasB:!!document.getElementById('taixu-bubble')};
    if(o.afterChar.storyOpen){ document.getElementById('sto-close').click(); }
    await sleep(1500);
    var b=document.getElementById('taixu-bubble');
    o.first={hasB:!!b, step:(window.S.guide||{}).step, text:(b&&b.querySelector('.tb-text')||{}).textContent, skip:!!document.getElementById('taixu-skip')};
    if(!(o.first.hasB && o.first.step===0 && /站住/.test(o.first.text))) o.errs.push('新号第 1 拍未出现: '+JSON.stringify(o.first));
  `, 4500);
  console.log('C ' + r);
  let o=null; try{o=JSON.parse(r.replace(/^G=/,''));}catch(e){}
  if(!(o&&o.ok&&o.errs.length===0)) failed++;
}
console.log('—— 重看引导真实点击链 · ' + (failed ? ('失败 ' + failed) : '全绿') + ' ——');
process.exit(failed ? 1 : 0);