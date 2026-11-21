/* ============================================================
 * 新手引导 tutorial.js —— 极简四步（原生 JS，独立于 game.js）
 *   step 1 欢迎对话框 → step 2 引导【打坐】 → step 3 引导【突破】
 *   → step 4 完成弹窗（赠 100 灵石，指路坊市）→ 写入标记，永不再弹
 * 约定：
 *   · localStorage 标记 hasFinishedTutorial = '1'：完成/跳过/老玩家，刷新一律不再弹
 *   · 老玩家保护：境界已过炼气一层 / 已转世 / 修为 ≥ 100 → 直接补写标记并跳过
 *   · 引导中点击锁定（capture 拦截）：只放行【打坐】按钮与引导自身 UI
 *   · 只通过 window.XX 的导出读写状态（_s / save / _render），350ms 轮询推进
 * ============================================================ */
(function(){
  'use strict';
  var KEY = 'hasFinishedTutorial';
  var SIT_SEL  = '.cave-act[data-k="sit"], .act[data-k="sit"]';   /* 主界面按钮 + 侧边栏行动卡 */
  var BRK_SEL  = '#sc-break, #xx-break';                          /* 突破按钮（场景/侧栏各一份） */
  var step = 0;        /* 0=未激活 1=欢迎 2=打坐 3=突破 4=完成弹窗 */
  var finished = false;
  var timer = null;
  var game = null;

  function flag(){ try{ return localStorage.getItem(KEY) === '1'; }catch(e){ return false; } }
  function mark(){ try{ localStorage.setItem(KEY, '1'); }catch(e){} }

  /* 新手判定：炼气一层且未转世且修为未满 100（超过即视为老玩家） */
  function isRookie(){
    var s = game && game._s;
    if(!s) return false;
    return (s.rank | 0) === 0 && !(s.reborn > 0) && (s.exp | 0) < 100;
  }

  /* ---------------- UI：提示条（带 × 跳过） ---------------- */
  function ensureTip(){
    var tip = document.getElementById('tut-tip');
    if(tip) return tip;
    tip = document.createElement('div');
    tip.id = 'tut-tip';
    tip.innerHTML = '<span class="tut-msg"></span><button class="tut-x" type="button" title="跳过引导">×</button>';
    document.body.appendChild(tip);
    tip.querySelector('.tut-x').addEventListener('click', function(){ finish(); });
    return tip;
  }
  function showTip(msg, sel){
    var tip = ensureTip();
    tip.querySelector('.tut-msg').textContent = msg;
    tip.classList.add('show');
    var all = document.querySelectorAll(sel), anchor = null, i, el;
    for(i = 0; i < all.length; i++){                 /* 挑屏幕上可见的那份 */
      el = all[i];
      if(el.getBoundingClientRect().width > 0){ anchor = el; break; }
    }
    document.querySelectorAll('.tut-target').forEach(function(e){ e.classList.remove('tut-target'); });
    if(!anchor){                                     /* 目标暂时不可见：贴顶居中，不挡头像 */
      tip.style.left = 'calc(50% - 130px)';
      tip.style.top = '76px';
      return;
    }
    anchor.classList.add('tut-target');
    var r = anchor.getBoundingClientRect();
    tip.style.left = Math.max(8, Math.min(window.innerWidth - 268, r.left + r.width / 2 - 130)) + 'px';
    tip.style.top  = Math.max(8, r.top - 66) + 'px';
  }
  function hideTip(){
    var tip = document.getElementById('tut-tip');
    if(tip) tip.classList.remove('show');
    document.querySelectorAll('.tut-target').forEach(function(e){ e.classList.remove('tut-target'); });
  }

  /* ---------------- UI：居中对话框（遮罩 + 卡片 + 主按钮 + 右上 ×） ---------------- */
  function ensureModal(){
    var mask = document.getElementById('tut-mask');
    if(mask) return mask;
    mask = document.createElement('div');
    mask.id = 'tut-mask';
    mask.innerHTML =
      '<div id="tut-card" role="dialog" aria-modal="true">' +
        '<button class="tut-x" type="button" title="跳过引导">×</button>' +
        '<h3 id="tut-title"></h3>' +
        '<p id="tut-text"></p>' +
        '<button id="tut-btn" type="button"></button>' +
      '</div>';
    document.body.appendChild(mask);
    mask.querySelector('.tut-x').addEventListener('click', function(){ finish(); });
    return mask;
  }
  function showModal(title, text, btn, onGo){
    var mask = ensureModal();
    document.getElementById('tut-title').textContent = title;
    document.getElementById('tut-text').textContent = text;
    var b = document.getElementById('tut-btn');
    b.textContent = btn;
    b.onclick = function(){ onGo && onGo(); };
    mask.classList.add('show');
  }
  function hideModal(){
    var mask = document.getElementById('tut-mask');
    if(mask) mask.classList.remove('show');
  }

  /* ---------------- 点击锁定：引导中只放行"引导指定的目标"与引导 UI ----------------
     ⚠️ 2026-10-25 修：原版只放行【打坐】，而 step 3 的文案是"请点击【突破】"——
     于是玩家修为满了、按钮亮着、点下去被自己这层 capture 锁拦住，rank 永远是 0，
     tutorial 停死在 step 3，「完成标记」也写不上，刷新回来继续卡。
     引导让你点哪儿，就必须放行哪儿：把 BRK_SEL 一并放行。 */
  function guard(ev){
    var t = ev.target;
    if(!t || !t.closest) return;
    if(t.closest('#tut-tip') || t.closest('#tut-mask')) return;
    /* 任何正在显示的弹窗内部都放行。弹窗冒出来就是因为要玩家点它
       （突破结算、渡劫跳过、剧情浮片…），锁住它等于把玩家关在门外——
       2026-10-25 的实测就是：突破成功后「继续修行」点不动，整局卡死。 */
    if(t.closest('.modal')) return;
    if(t.closest(SIT_SEL) || t.closest(BRK_SEL)) return;
    ev.preventDefault();
    ev.stopPropagation();
  }
  function lock(){ document.addEventListener('click', guard, true); }
  function unlock(){ document.removeEventListener('click', guard, true); }

  /* ---------------- 完结：写标记 + 拆 UI + 停轮询 ---------------- */
  function finish(){
    if(finished) return;
    finished = true;
    mark();
    unlock();
    hideTip();
    hideModal();
    if(timer){ clearInterval(timer); timer = null; }
    if(game && game._render) game._render();
  }

  /* 台上有人时先别动：渡劫天象（z80）演到一半时如果弹「踏入练气」（z50），
     玩家看不到它（被劫云压着），却点得到它（TRIB 遮罩 pointer-events:none）；
     演出收场后它又跟突破结算（同为 z50、后插入者在上）叠在一起，把结算吞掉。
     所以引导跟剧情一样：演出/别的弹窗在台上时一律让路，等收场再说话。 */
  function stageBusy(){
    try{
      if(window.TRIB && TRIB.busy) return true;
      var ids = ['battle-modal','break-modal','story-modal','off-modal','hatch-modal','enc-modal'];
      for(var i = 0; i < ids.length; i++){
        var e = document.getElementById(ids[i]);
        if(e && !e.classList.contains('hidden')) return true;
      }
    }catch(e){}
    return false;
  }

  /* ---------------- 轮询推进 ---------------- */
  function tick(){
    if(finished || !game) return;
    var s = game._s;
    if(!s) return;
    if(stageBusy()) return;
    /* 兜底：引导途中境界已过炼气一层（任何途径），直接走完成流程，绝不卡死 */
    if((s.rank | 0) >= 1 && step >= 1 && step <= 3){
      if(step >= 2) hideTip();
      s.stone = Math.floor(s.stone || 0) + 100;   /* 不用 | 0：大额灵石会被折成负数 */
      mark();                              /* 完成即写标记：哪怕不点主按钮直接刷新也不再弹 */
      game.save && game.save();
      step = 4;
      showModal('踏入练气', '恭喜踏入练气期！\n系统赠送你 100 灵石，去【坊市】看看吧。\n回去后盯着底下那张纸签：它会一件件写着你接下来该做什么。', '去坊市看看', function(){
        finish();
        if(window.ROUTER && window.ROUTER.open) window.ROUTER.open('market');
      });
      return;
    }
    if(step === 2){
      if((s.exp | 0) >= 100){
        step = 3;
        showTip('修为已满，请点击【突破】逆天改命！', BRK_SEL);
      }else{
        showTip('道友，你终于醒了。修行之路漫长，请先点击【打坐】获取修为。', SIT_SEL);
      }
    }else if(step === 3){
      showTip('修为已满，请点击【突破】逆天改命！', BRK_SEL);   /* 重绘后重定位 + 重播高亮 */
    }
  }

  /* ---------------- 启动入口（game.js boot 完成后调用） ---------------- */
  function start(){
    /* game.js 用 const XX = (function(){...})() 导出：词法全局，不挂 window，必须用裸标识符探测 */
    try{ game = (typeof XX !== 'undefined') ? XX : null; }catch(e){ game = null; }
    if(!game || flag()){ return; }
    if(!isRookie()){ mark(); return; }     /* 老玩家：境界/修为已超新手范围 → 补标记，永不再弹 */
    finished = false;                       /* 支持重新激活（真实玩家 flag='1' 时上面已拦，不会走到这） */
    step = 1;
    /* 欢迎弹窗自带全屏遮罩，天然挡住底层点击；点击锁等到进入打坐引导（step 2）才启用 */
    showModal('初入仙途',
      '道友，你终于醒了。\n修行之路漫长，请先点击【打坐】获取修为。',
      '继续',
      function(){
        if(finished) return;
        step = 2;
        lock();                              /* 从现在起只放行【打坐】与引导 UI */
        hideModal();
        showTip('道友，你终于醒了。修行之路漫长，请先点击【打坐】获取修为。', SIT_SEL);
      });
    timer = setInterval(tick, 350);
  }

  window.Tutorial = { start: start, finish: finish, _state: function(){ return { step: step, finished: finished }; } };
})();
