'use strict';
/* ============================================================
 * trib.js — 渡劫天象（突破全屏演出，对标一念逍遥的破境瞬间）
 * 挂载：game.js attemptBreakthrough 掷判定后调用
 *        成功 → TRIB.play(true,  { onDone: 弹出突破结算 })
 *        失败 → TRIB.play(false)（余烬收尾，日志已先行）
 * 时间轴（成功 ~4.6s / 失败 ~3.9s，右上角可跳过）：
 *   0.0s 乌云汇聚（墨云自四面向中央合围，天地骤然暗）
 *   1.2 / 1.75 / 2.3s 三道劫雷（白练裂空 + 墨色残影）
 *   2.9s 成功 → 云开金霄（金光破晓 + 霞光缓转）；失败 → 余烬飘零
 *   收尾：隐藏遮罩 → onDone()（成功才传）
 * 克制原则（红线审美）：
 *   · 纯 CSS 无图片；不碰任何数值与突破逻辑，只做演出编排；
 *   · prefers-reduced-motion → 直接跳过演出走 onDone；
 *   · 演出期间 TRIB.busy = true；期间的重复 play 按幂等契约忽略（不叠播、不调其 onDone）。
 *     已知缺口：遮罩 pointer-events:none 不挡点击，连破两层时第二次的结算卡不会出现，
 *     属待裁定项（放行补发 / 禁止连破），见 play() 内的详细说明；
 *   · 异常一律兜底（try/catch + onDone 必达），绝卡死突破流程。
 * ============================================================ */
(function(){
  var timers = [], busy = false, phase = '', lastOk = null, onDone = null;

  function el(){ return document.getElementById('trib-modal'); }
  function cap(){ return document.getElementById('trib-cap'); }
  function reduced(){
    try{ return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
    catch(e){ return false; }
  }
  function after(ms, fn){ timers.push(setTimeout(fn, ms)); }
  function clearTimers(){ timers.forEach(clearTimeout); timers = []; }
  function setPhase(p){
    phase = p;
    var m = el();
    if(m) m.setAttribute('data-phase', p);
  }
  /* 劫雷：移除 class → 强制回流 → 加回，重启 CSS 动画（三道轮流劈） */
  function strike(i){
    var bolts = document.querySelectorAll('.trib-bolt');
    var b = bolts && bolts[i];
    if(!b) return;
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
  }
  function caption(txt){
    var c = cap();
    if(!c) return;
    c.classList.remove('in');
    void c.offsetWidth;
    c.textContent = txt;
    c.classList.add('in');
  }
  function hide(){
    var m = el();
    if(m){ m.classList.add('hidden'); m.setAttribute('data-phase', ''); }
    document.querySelectorAll('.trib-bolt').forEach(function(b){ b.classList.remove('on'); });
    var rn = document.getElementById('trib-realm-name');
    if(rn) rn.textContent = '';
  }
  function finish(){
    clearTimers();
    var done = onDone;
    onDone = null;
    busy = false;
    setPhase('');
    hide();
    if(done){ try{ done(); }catch(e){} }
  }

  /* 主入口：ok = 是否渡劫成功；opt.onDone = 演出收尾回调（成功结算弹窗） */
  function play(ok, opt){
    opt = opt || {};
    var m = el();
    if(!m){ if(opt.onDone) opt.onDone(); return { playing:false }; }
    if(reduced()){                       /* 少动效用户：不看演出，直接走结算 */
      if(opt.onDone) opt.onDone();
      return { playing:false };
    }
    if(busy){
      /* 幂等契约（verify.js「演出中重复触发不叠播、不重复收尾」守护着这条）：
         演出期间的重复 play 一律不叠播、也不调它的 onDone。
         ⚠️ 已知缺口（待制作人裁定，不擅自改）：遮罩是 pointer-events:none，
         玩家确实能在 4.6 秒演出里再破一次境（verify_break 又要求连续突破必须允许），
         那一次的结算卡因此不会出现 —— 境界跳了两级、只看到一张卡。
         要修必须二选一：允许补发结算卡（改本文件的幂等契约），
         或禁止演出期间突破（等于给突破加 4.6 秒冷却，属玩法变更）。
         这里只留一条控制台记录以便事后追查，不改变任何既有行为。 */
      try{ console.warn('[TRIB] 演出中重复触发，已按幂等契约忽略其 onDone（该次结算不会弹卡）'); }catch(e){}
      return { playing:false, dropped:!!opt.onDone };
    }
    busy = true; lastOk = !!ok; onDone = opt.onDone || null;
    m.classList.remove('hidden');
    setPhase('cloud');   /* 阶段只走 data-phase 属性：绝不与 .trib-cloud 等元素类撞名 */
    caption(ok ? '天劫降临 · 冲击' + (opt.rank || '新境') : '天劫降临 · 道心蒙尘');
    var rn = document.getElementById('trib-realm-name');
    if(rn) rn.textContent = ok ? (opt.rank || '新境') : '';
    after(1200, function(){ strike(0); });
    after(1750, function(){ strike(1); });
    after(2300, function(){ strike(2); });
    after(2900, function(){
      if(ok){ setPhase('dawn'); caption('祥瑞破晓 · ' + (opt.rank || '')); }
      else  { setPhase('ash');  caption('劫火余烬 · 道心蒙尘'); }
    });
    after(ok ? 4600 : 3900, finish);
    return { playing:true };
  }
  /* 跳过：立刻收尾并触发 onDone（成功时照常弹结算） */
  function skip(){
    if(!busy) return false;
    finish();
    return true;
  }

  window.TRIB = {
    play: play,
    skip: skip,
    get busy(){ return busy; },
    /* 只读探针（测试/调试用） */
    _probe: function(){ return { busy: busy, phase: phase, ok: lastOk }; }
  };

  /* 跳过按钮（DOM 就绪后绑；脚本在 body 尾部加载，直接绑即可） */
  var sb = document.getElementById('trib-skip');
  if(sb) sb.addEventListener('click', function(){ skip(); });
})();
