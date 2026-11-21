'use strict';
/* 修复单探针：P1b 重看引导（不落盘/不重发奖励/结束恢复） + P2b 创角弹窗关闭 */
const fs = require('node:fs'), path = require('node:path');
const ROOT = 'D:/xx-scratch/jiuxiao-analysis/九霄问道';
const PAGE = require(path.join(ROOT, 'tools/page.js'));
const { execEdge } = require(path.join(ROOT, 'tools/edge-run.js'));
PAGE.use(ROOT);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const t = Date.now(), claimed = {};
['1-1','1-2','1-3','1-4','1-5','2-1','2-2','2-3','2-4','2-5','3-1','3-2','3-3','3-4','3-5','4-1','4-2','4-3','4-4','5-1','5-2','5-3','5-4'].forEach(id => { claimed[id] = t; });
const save = {name:'复验散人',sex:'m',gender:'male',robe:'bai',rank:3,exp:0,stone:500,cave:0,dan:1,forge:1,dao:0,rootIdx:1,gong1:0,gong2:0,gong3:0,field:0,mine:0,herb:10,ore:10,weapon:0,weaponLv:0,bagSize:20,tower:1,towerMax:1,petSlots:1,wisdom:0,insight:0,failBonus:0,guardMirror:0,guardArray:0,tianji:0,herb100:0,herb10000:0,log:[],bag:[{t:'dan1',n:'下品破境丹'}],recipeN:{},mastery:{alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0},stats:{sit:9,herb:3,train:2,enlight:1,craftPill:1,explore:0,hunt:0,enhance:0,stoneEarned:100,farmN:0},plots:[],pets:[],eggs:[],arena:{day:'',left:0,tier:1,win:0,lose:0,rep:0,foes:[]},union:{start:t,day:'',left:0,merit:0,claimed:[],season:1},sign:{days:0,last:''},secret:{prog:[0,0,0,0],day:'',swept:0},towerDay:'',towerSwept:0,enc:{t:0,bubble:null,lastId:''},encBuff:{mult:0,until:0},miles:{},milesNew:[],letters:[],story:{claimed:claimed},equipment:{weapon:null,armor:null,accessory:null},shop:{week:'',heart_mirror:0,guard_array:0,tianjiTier:-1},market:{day:'',goods:[],buyRate:1,sellRate:1,sold:0,freeRefresh:1},questsDone:[],bossKilled:{},acts:{sit:0,herb:0,train:0,enlight:0,ponder:0},actDay:'',gate:{lv:0,grad:0,disciples:[]},council:{day:'',n:0,last:''},trail:{i:8},trail2:{i:0},life:{age:0,on:true,brk:0},legacy:{gens:0,relic:null,hist:[],pick:null},mirror:{gen:0,rank:0,age:0,brk:0,pow:0,wins:0,done:0,calm:0,calmStep:0},guide:{step:14,done:true,skipped:false,started:true,flags:{c_enter:true,c_sit:true,c_brk:true,c_field:true},rewardClaims:{taixu_intro_dan_v1:true},toldSystems:{}},last:t};
const seed = '<script>try{localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify(save)) + ');localStorage.setItem("hasFinishedTutorial","1");}catch(e){}</scr' + 'ipt>';
const FREEZE = '<style>*{animation-duration:0s!important;animation-delay:0s!important;transition:none!important}</style>';
const DIAG = `
(async function(){
  var o={ok:true,errs:[]}; var sleep=ms=>new Promise(r=>setTimeout(r,ms));
  function q(s){ try{ return document.querySelector(s); }catch(e){ return null; } }
  try{
    await sleep(1200);
    var sm=document.getElementById('story-modal'); if(sm && !sm.classList.contains('hidden')) document.getElementById('sto-close').click();
    await sleep(300);
    var S=window.S;
    var snap=JSON.stringify({g:S.guide, rc:S.guide.rewardClaims, logLen:(S.log||[]).length});
    /* P1b：设置里重看引导 */
    document.getElementById('sc-settings').click(); await sleep(300);
    var rb=document.getElementById('m-guide-replay'); o.replayBtn=!!rb;
    if(rb) rb.click();
    await sleep(700);
    var bub=document.getElementById('taixu-bubble');
    o.replayStart={hasB:!!bub, step:(S.guide||{}).step, text:(bub&&bub.querySelector('.tb-text')||{}).textContent, skip:!!document.getElementById('taixu-skip'), settingsHidden:document.getElementById('settings-modal').classList.contains('hidden')};
    if(!(o.replayStart.hasB && o.replayStart.step===0 && /站住/.test(o.replayStart.text) && o.replayStart.skip)) o.errs.push('重播首拍异常: '+JSON.stringify(o.replayStart));
    if(bub) bub.click();
    await sleep(300);
    var bub2=document.getElementById('taixu-bubble');
    o.replayStep2={step:(S.guide||{}).step, text:(bub2&&bub2.querySelector('.tb-text')||{}).textContent};
    if(!(o.replayStep2.step===1 && /太虚真人/.test(o.replayStep2.text))) o.errs.push('重播第二拍异常');
    var sk=document.getElementById('taixu-skip'); if(sk) sk.click();
    await sleep(400);
    var after=JSON.stringify({g:S.guide, rc:S.guide.rewardClaims, logLen:(S.log||[]).length});
    o.replayEnd={hasB:!!document.getElementById('taixu-bubble'), skip:!!document.getElementById('taixu-skip'), same:after===snap, logLen:(S.log||[]).length};
    if(!(o.replayEnd.same && !o.replayEnd.hasB && !o.replayEnd.skip)) o.errs.push('重播结束未恢复原状态');
    /* P2b：改名弹窗关闭 */
    document.getElementById('sc-settings').click(); await sleep(300);
    document.getElementById('m-char').click(); await sleep(500);
    var cm=document.getElementById('char-modal'), cc=document.getElementById('char-close');
    o.charOpen={open:cm && !cm.classList.contains('hidden'), closeShown:!!(cc && getComputedStyle(cc).display!=='none')};
    if(!(o.charOpen.open && o.charOpen.closeShown)) o.errs.push('创角弹窗/关闭入口异常');
    if(cc) cc.click();
    await sleep(300);
    o.charClosed={hidden:cm.classList.contains('hidden'), name:S.name};
    if(!(o.charClosed.hidden && o.charClosed.name==='复验散人')) o.errs.push('关闭未生效或改档');
    /* Esc 再测一次 */
    document.getElementById('sc-settings').click(); await sleep(200);
    document.getElementById('m-char').click(); await sleep(300);
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await sleep(200);
    o.escClosed=cm.classList.contains('hidden');
    if(!o.escClosed) o.errs.push('Esc 未关闭创角弹窗');
    o.ok=o.errs.length===0;
    document.getElementById('diag').textContent='R='+JSON.stringify(o);
  }catch(e){ document.getElementById('diag').textContent='R='+JSON.stringify({ok:false,err:String(e&&e.stack||e)}); }
})();`;
const f = path.join(PAGE.SCRATCH, '._fixrc.html');
PAGE.writePage(f, html.replace('</head>', seed + '\n</head>').replace('</body>', FREEZE +
  '<div id="diag" style="position:fixed;left:0;bottom:0;font:10px monospace;background:#000;color:#0f0;max-width:100%;word-break:break-all"></div>' +
  '<script>window.addEventListener("load",function(){setTimeout(function(){' + DIAG + '},900);});</script></body>'));
const ud = path.join('D:/xx-scratch', 'xxfixrc' + Date.now());
let failed = 0;
try {
  const out = execEdge(['--headless=new','--disable-gpu','--no-first-run','--hide-scrollbars','--user-data-dir=' + ud,
    '--virtual-time-budget=16000','--window-size=900,1200','--dump-dom','file:///' + f.replace(/\\/g, '/')],
    { timeout: 180000, encoding: 'utf8', maxBuffer: 1 << 26 });
  const m = /<div id="diag"[^>]*>([^<]*)<\/div>/.exec(out || '');
  const txt2 = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : 'NO-DIAG';
  console.log(txt2);
  let o = null; try { o = JSON.parse(txt2.replace(/^R=/, '')); } catch (e) {}
  if (!(o && o.ok === true)) failed++;
} catch (e) { console.log('ERR ' + e.message); failed++; }
finally { try { fs.rmSync(f, { force: true }); } catch (e) {} try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {} }
console.log('—— 修复单 P1b/P2b · ' + (failed ? '失败 1' : '全绿') + ' ——');
process.exit(failed ? 1 : 0);