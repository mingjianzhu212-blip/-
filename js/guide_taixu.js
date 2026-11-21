/* 《九霄问道》太虚真人新手引导 V1
 * 独立垂直切片：新增引导模块，少量接入 game.js 业务成功状态，不重构主程序。
 *
 * 架构（经 ChatGPT 独立评审修正后定稿）：
 *   GuideState  —— 只存引导进度 / 完成标记 / 跳过标记 / 补讲记录 / 奖励凭证。
 *                  挂在 window.S.guide 上，随主存档同一事务提交（丹药发放与进度天然原子）。
 *   GuideView   —— #taixu-bubble 直接挂 document.body，不参与 game.js 的 render() 生命周期。
 *                  主循环重绘不会删除/重建它；定位用目标元素的 getBoundingClientRect()。
 *   GuideController —— 不接管玩家点击，不监听全局捕获点击。
 *                  完成判定：读权威业务状态（window.S），或业务成功后调 Guide.complete(stepId)。
 *
 * 技术军规：
 *   1. 气泡层活在渲染外状态层（本文件即该层）。
 *   2. 点击成功率以实机 E2E 验（见任务单验收口径 / Muse 侧聊）。
 *   3. 断点续走：state 在 S.guide，刷新/重进自动恢复。
 *   4. 跳过路径：点「先别唠叨」立即解除引导限制、无残留气泡；跳过者各系统首次打开补讲一次。
 *   5. 台词零开发残留：SCAN_PATTERNS 全量扫描，命中必须为 0。
 */
(function () {
  'use strict';

  /* 阶段二 N12-3：原赠「下品聚气丹 dan_juqi」不在 DAN_LIST/EATABLE，背包只能丢弃；
     改赠等值现有丹药 dan1（下品破境丹，服食 +5% / +60 exp），不新增丹药条目。 */
  var DAN_ID = 'dan1';            // 下品破境丹（阶段二 N12-3 改赠）
  var DAN_NAME = '下品破境丹';
  var DAN_CLAIM = 'taixu_intro_dan_v1'; // 唯一领取凭证（永久幂等）
  var FINISH_MSG = '（太虚真人）去吧。后山那位，记得替我问好。'; // 收尾旁白（玩家可见）
  var SKIP_MSG = '（太虚真人）罢了罢了，你自己逛吧。';            // 跳过旁白（玩家可见）
  var TELL_DEFAULT = '这处自家瞧瞧。';                            // 补讲兜底文案（玩家可见）

  /* 太虚真人台词：全部来自 spec 草稿 v1，逐字录入，零开发残留。
     2026-11-20 呆呆审结论（B1 乙案 14 拍）：台词拍点击推进、动作拍读状态推进；
     必补「它自己会涨」「炖出一锅寂寞」；brk 追叙用 26 字版；拍 12 删「能」加句号；
     flash.b 采问句版保住「听课不专心」（非阻塞建议，一并落实）。 */
  var SCRIPT = [
    { id: 'enter.a', text: '站住！……哦，新来的啊。',
      target: '.tb-char', click: true, fallbackApp: true },
    { id: 'enter.b', text: '本座太虚真人，跟紧了——灵气不咬人，阵法咬。',
      target: '.tb-char', click: true, fallbackApp: true },
    { id: 'sit', text: '盘腿，闭眼，啥也别想。想晚饭也行，灵气不挑食。',
      target: '#sc-acts .cave-act[data-k="sit"]' },
    { id: 'sit.b1', text: '瞧见没，它自己会涨，不用你盯着。',
      target: '#sc-acts .cave-act[data-k="sit"]', click: true },
    { id: 'sit.b2', text: '修仙先学偷懒，这叫顺应天道。',
      target: '#sc-acts .cave-act[data-k="sit"]', click: true },
    { id: 'brk.pre', text: '怕爆体？爆了本座给你拼；拼不齐，就说你练的是散功重修。',
      target: '#sc-break', click: true },
    { id: 'brk', text: '攒够了？点。犹犹豫豫，灵气都凉了。',
      after: '完完整整。拼人的那句，吓唬你的——先吓后教，记得牢。',
      target: '#sc-break' },
    { id: 'field.intro', text: '这块地归你了。种什么收什么。',
      target: '#sc-field', click: true },
    { id: 'field.joke', text: '别学隔壁老王，种灵芝炖自己——炖出一锅寂寞。',
      target: '#sc-field', click: true },
    { id: 'field', text: '种子先赊你，回头扣。本座就是那种人。',
      target: '#sc-field' },
    { id: 'bag', text: '背包里那颗丹你留着；别谢，谢就俗了——别跟后山那位提。',
      target: '.scene-tab[data-tab="bag"]', dan: true, click: true },
    { id: 'flash.a', text: '……塔里的小东西闹脾气，这叫举重若轻。',
      target: '.bld[data-bld="tower"]', click: true },
    { id: 'flash.b', text: '不像炼气期？听课不专心——罚你去见个人。',
      target: '.bld[data-bld="tower"]', click: true },
    { id: 'handoff', text: '后山有块碑，守碑老头记性好，记三百年；名号别报，报了不理你。',
      target: '.scene-tab[data-tab="role"]' }
  ];

  /* 完成判定：读权威业务状态（window.S）。不是点击猜测，是“业务成功后的状态验证”。 */
  var POLL = {
    sit: function (S) { return (S.stats && S.stats.sit | 0) >= 1; },
    brk: function (S) { return (S.rank | 0) >= 1; },
    field: function (S) { return (S.plots && S.plots.length) >= 1; },
    handoff: function (S) { return !!(S.npcs && S.npcs.stele && S.npcs.stele.met === 1); }
    /* enter / flash 用 auto 定时器推进（脚本化演出，非玩家操作） */
  };

  var state = null;
  var view = null;
  var skipView = null;        /* B1：跳过入口外置（气泡外小字），保持气泡 1~2 行 */
  var timer = null;
  var autoTimer = null;
  var pendingAfter = false;   /* 追叙播放中：tick 暂停判定，等其结束再进下一步 */
  var replaySnap = null;      /* P1b：设置里「重看引导」的会话快照；非空即重播态（不落盘、不重发奖励） */

  function getS() { return (typeof window !== 'undefined' && window.S) || null; }
  function getGuide() { var S = getS(); return S && S.guide; }

  function load() {
    state = getGuide();
    if (!state) {
      state = { step: 0, done: false, skipped: false, started: false, flags: {}, rewardClaims: {}, toldSystems: {} };
      var S = getS(); if (S) S.guide = state;
    }
    return state;
  }

  function persist() { if (replaySnap) return; /* 重播态不落盘：结束后恢复原状态再存 */ try { if (typeof window.saveGame === 'function') window.saveGame(); } catch (e) {} }

  function def(i) { return SCRIPT[i]; }

  /* 丹药发放：与引导进度同一 save 事务（bag 变动 + 凭证标记都进同一个 S，save() 一次序列化）。
     原子性保障（R2/R3）：仅当 addItem 真正成功（返回 true）才写领取凭证；
     发放失败（背包满/接口缺失）绝不写凭证，否则永久无法补发。已核对 game.js addItem 内部不自行 save。 */
  function claimDan() {
    if (replaySnap) return;   /* 重播不重发/不补发奖励，避免改存档 */
    var S = getS(); if (!S || state.rewardClaims[DAN_CLAIM]) return; // 幂等：凭证已存在则绝不重发
    if (typeof window.addItem !== 'function') return;              // 接口缺失：不写凭证、不谎称已发
    var ok = window.addItem(DAN_ID, DAN_NAME);
    if (!ok) return;                                              // 背包满等失败：不写凭证
    state.rewardClaims[DAN_CLAIM] = true;
    persist(); // 关键：加丹 + 写凭证 在同一次存档提交内完成
  }

  function advance() {
    if (!state || state.done || state.skipped) return;
    state.step = state.step + 1;
    if (state.step >= SCRIPT.length) { finish(); return; }
    persist();
    render();
  }

  /* 业务成功后调用（ChatGPT 要求的公共 API）。四道保护：done/skipped、step 身份、幂等。 */
  function complete(stepId) {
    if (!state || state.done || state.skipped) return false;
    var idx = -1;
    for (var i = 0; i < SCRIPT.length; i++) if (SCRIPT[i].id === stepId) idx = i;
    if (idx < 0 || state.step !== idx) return false;       // 仅当前步可推进
    if (state.flags['c_' + stepId]) return false;          // 幂等
    state.flags['c_' + stepId] = true;
    persist();                                             // R4：立即持久化完成标记，避免追叙窗口内刷新丢失
    var d = def(state.step);
    if (d && d.after) {
      /* 业务成功后有追叙一句：先播追叙，延时再进下一步（等播完 tick 才再判定） */
      pendingAfter = true;
      flashAfter(d.after);
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
      autoTimer = setTimeout(function () {
        autoTimer = null; pendingAfter = false;
        /* R5：回调里二次校验，避免刷新/跳过/跳步后误推进 */
        if (state && !state.done && !state.skipped && state.step === idx) advance();
      }, 2600);
    } else {
      advance();
    }
    return true;
  }

  function tick() {
    if (!state || state.done || state.skipped) return;
    // C2：每轮重定位（主游戏重绘/切页后目标可能移动）；目标暂时不在时整组隐藏、回来自动复出
    if (view) { positionBubble(); applyLocks(); }
    if (pendingAfter) return;   /* 追叙播放中，等其结束再判定 */
    var S = getS(); if (!S) return;
    var d = def(state.step); if (!d) return;
    if (POLL[d.id] && POLL[d.id](S)) advance();
  }

  function stopTimer(){ if (timer) { clearInterval(timer); timer = null; } }

  /* C1：目标可见性判定。除宽高为零外，还需识别 visibility:hidden / opacity:0 / 隐藏容器中的目标，
     否则它们仍会被当作有效定位目标，气泡卡在不可见元素上。 */
  function isVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) return false;
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      var node = el;
      while (node && node.nodeType === 1) {
        var cs = window.getComputedStyle(node);
        if (cs && (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0' || cs.visibility === 'collapse')) return false;
        node = node.parentElement || node.parentNode;
        if (!node || node.nodeType !== 1) break;
      }
    }
    return true;
  }

  function positionBubble() {
    if (!view) return;
    var d = state ? def(state.step) : null;
    if (!d || !d.target) { setGuideHidden(); return; }
    var el = null;
    try { el = document.querySelector(d.target); } catch (e) { el = null; }
    /* 入场拍目标在非场景页不可见时退回整页锚点（顶栏在面板页会藏起来），不把引导整段憋掉 */
    if (!isVisible(el) && d.fallbackApp) { try { el = document.querySelector('.app'); } catch (e) { el = null; } }
    /* 目标缺失/不可见：整组隐藏等待（不留顶部常驻位）；目标回来 tick 会自动复出 */
    if (!isVisible(el)) { setGuideHidden(); return; }
    var r = el.getBoundingClientRect();
    view.style.display = 'block';
    var vw = window.innerWidth, vh = window.innerHeight;
    var bw = view.offsetWidth, bh = view.offsetHeight;
    var gap = 12;
    /* 水平钳在视口内，不遮主按钮：气泡与目标同水平中心 */
    var left = Math.max(8, Math.min(vw - bw - 8, r.left + r.width / 2 - bw / 2));
    /* 垂直：优先目标上方；放不下放下方；都放不下取空间大的一侧并钳制 */
    var spaceAbove = r.top, spaceBelow = vh - r.bottom;
    var place;
    if (spaceAbove >= bh + gap + 8) place = 'top';
    else if (spaceBelow >= bh + gap + 8) place = 'bottom';
    else place = (spaceAbove >= spaceBelow) ? 'top' : 'bottom';
    var top = place === 'top' ? r.top - bh - gap : r.bottom + gap;
    top = Math.max(8, Math.min(vh - bh - 8, top));
    view.classList.add('tb-anchored');
    view.classList.remove('tb-top', 'tb-bottom', 'tb-left', 'tb-right');
    view.classList.add(place === 'top' ? 'tb-top' : 'tb-bottom');
    view.style.left = left + 'px';
    view.style.top = top + 'px';
    /* 尾巴指向目标中心（钳在气泡内，避免越过圆角） */
    var tail = view.querySelector('.tb-tail');
    if (tail) {
      var tx = Math.max(12, Math.min(bw - 22, r.left + r.width / 2 - left - 5));
      tail.style.left = tx + 'px';
    }
    positionSkip();
  }
  function setGuideHidden() {
    if (view) view.style.display = 'none';
    if (skipView) skipView.hidden = true;
  }
  function positionSkip() {
    if (!skipView) return;
    if (!view || view.style.display === 'none') { skipView.hidden = true; return; }
    skipView.hidden = false;
    var br = view.getBoundingClientRect();
    var sw = skipView.offsetWidth || 84;
    skipView.style.left = Math.max(8, Math.min(window.innerWidth - sw - 8, br.left + br.width - sw)) + 'px';
    var top = br.bottom + 6;
    if (top + 30 > window.innerHeight) top = Math.max(8, br.top - 30);
    skipView.style.top = top + 'px';
  }
  function fallbackPosition() {
    /* 仅留着兼容旧调用：不再回顶部常驻位，宁可不显示也不违规遮挡 */
    setGuideHidden();
  }

  function render() {
    if (!state || state.done || state.skipped || !view) { hideBubble(); return; }
    var d = def(state.step); if (!d) { hideBubble(); return; }
    view.querySelector('.tb-text').textContent = d.text;
    if (d.dan && !state.rewardClaims[DAN_CLAIM]) claimDan();  /* 进入背包步即发丹（幂等，随主存档同事务） */
    if (d.click) view.classList.add('tb-click'); else view.classList.remove('tb-click');
    /* 非点击拍不吞点击：气泡若压到灵兽园等入口，点下去仍能进页（治“点灵兽园只弹气泡”） */
    view.classList.toggle('tb-pass', !d.click);
    view.style.display = 'block';
    /* 纸签让位立即生效（不等下一次 game render，消除同屏 1 拍窗口） */
    var trEl = document.getElementById('sc-trail');
    if (trEl && !trEl.hidden) trEl.hidden = true;
    document.body.classList.add('guide-active');
    document.body.dataset.guideStep = String(state.step);
    positionBubble();
    applyLocks();
    if (d.auto && !autoTimer) {
      autoTimer = setTimeout(function () { autoTimer = null; advance(); }, d.auto);
    }
  }

  function flashAfter(text) {
    if (!view) return;
    var el = view.querySelector('.tb-text');
    if (el) el.textContent = text;
    positionBubble();
  }

  function hideBubble() {
    if (view) view.style.display = 'none';
    if (skipView) skipView.hidden = true;
    document.body.classList.remove('guide-active');
    clearLocks();
    if (document.body.dataset) document.body.dataset.guideStep = ''; // C4：清理步骤标记，避免残留
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    pendingAfter = false;
  }

  function finish() {
    /* P1b：重播态走完 → 恢复点之前的状态，不写日志、不落引导进度变更 */
    if (replaySnap) { endReplay(); return; }
    state.done = true;
    persist();
    /* B1：走完即整组摘除（不留收起态/悬浮条/角标） */
    teardown();
    if (typeof window.log === 'function') window.log(FINISH_MSG, 'sys');
  }

  function skip() {
    if (!state || state.done) return;
    /* P1b：重播态跳过 → 同样恢复原状态 */
    if (replaySnap) { endReplay(); return; }
    state.skipped = true; state.done = true; // 解除引导施加的限制，原生解锁规则照常
    persist();
    teardown();
    if (typeof window.log === 'function') window.log(SKIP_MSG, 'sys');
  }

  /* P1b：设置里「重看新手引导」——只重播，不动已领奖励与进度标记 */
  function replay() {
    var S = getS();
    if (!S) return false;
    load();
    if (!state) return false;
    teardown();
    replaySnap = {
      step: state.step | 0,
      done: !!state.done,
      skipped: !!state.skipped,
      started: !!state.started,
      flags: Object.assign({}, state.flags || {})
    };
    state.step = 0;
    state.done = false;
    state.skipped = false;
    state.started = true;
    state.flags = {};
    init();
    return true;
  }
  function endReplay() {
    if (replaySnap && state) {
      state.step = replaySnap.step;
      state.done = replaySnap.done;
      state.skipped = replaySnap.skipped;
      state.started = replaySnap.started;
      state.flags = Object.assign({}, replaySnap.flags);
    }
    replaySnap = null;
    try { persist(); } catch (e) {}
    teardown();
  }

  /* C5：重开/重置后，game.js 的 resetAll() 会把 S.guide 替换成全新对象，
     但模块内部 state 仍持有旧对象引用（init() 首行 getElementById 提前 return，
     load() 不重跑）。此处显式重绑定到当前 S.guide 并清掉旧气泡/定时器，
     再 restart 引导（init 自带幂等保护），确保控制器与存档指向同一对象。 */
  /* 2026-11-19 制作人批：创角弹窗在场时，引导不仅不显示，连 DOM 都不许留。
     teardown 停定时器 + 摘节点 + 清 guide-active；showCharModal 打开即调用。 */
  function teardown() {
    stopTimer();
    if (waitT) { clearTimeout(waitT); waitT = 0; }
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    if (view && view.parentNode) { try { view.parentNode.removeChild(view); } catch (e) {} }
    if (skipView && skipView.parentNode) { try { skipView.parentNode.removeChild(skipView); } catch (e) {} }
    view = null;
    skipView = null;
    clearLocks();
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('guide-active');
      if (document.body.dataset) document.body.dataset.guideStep = '';
    }
  }
  /* 开局弹层调度：剧情/沈碑浮片/奇遇气泡在场时，引导先排队，前一个退场才上台。 */
  var waitT = 0;
  function storyOpen(){
    var m = document.getElementById('story-modal');
    return !!(m && !m.classList.contains('hidden'));
  }
  function visitOpen(){
    var b = document.getElementById('npc-visit');
    return !!(b && !b.classList.contains('hidden'));
  }
  function encOpen(){
    var b = document.getElementById('enc-bubble');
    return !!(b && !b.classList.contains('hidden'));
  }
  function tutBusy(){
    try{
      var st = window.Tutorial && Tutorial._state ? Tutorial._state() : null;
      return !!(st && st.step > 0 && !st.finished);
    }catch(e){ return false; }
  }
  function waitForClear(){
    if (waitT) return;
    /* 用有上限的 setTimeout 链，不用 setInterval：虚拟时间跑测试时无限 interval 会把预算烧干。 */
    var tries = 0;
    (function step(){
      if (storyOpen() || visitOpen() || encOpen() || tutBusy()) {
        if (++tries < 15) { waitT = setTimeout(step, 400); return; }
        waitT = 0; return;
      }
      waitT = 0;
      init();
    })();
  }
  function reset() {
    teardown();
    state = null;
    load();              // 重新绑定到当前 S.guide（resetAll 已重置为全新对象）
    /* 重开 = 引导从头走一遍；若创角页已开着，init 内的闸门会拦下，showCharModal 也会再摘一次气泡 */
    init();
  }

  /* 跳过者：各系统首次打开补讲一次（由 game 在打开系统时调用 Guide.tellSystem(name)）。 */
  function tellSystem(name) {
    if (!state || !state.skipped || state.toldSystems[name]) return;
    state.toldSystems[name] = true; persist();
    if (typeof window.log === 'function') window.log('（太虚真人）' + (SYSTEM_TIP[name] || TELL_DEFAULT), 'sys');
  }
  var SYSTEM_TIP = {
    field: '灵田这处，种下便等它自己长，莫心急。',
    tower: '镇妖塔随你爬，战力够了自个儿就通了。',
    npc: '后山那块碑，守碑的老头记性极好，去了便知。',
    bag: '背包里的物件，用时自取，不必客气。',
    brk: '突破这桩事，攒够修为点下去便是。'
  };

  /* 渐进解锁：仅做视觉提示（未教系统轻微变灰），不阻断点击、不覆盖原生解锁逻辑。
     依据 state.step：index<=step 的系统视为已教（去灰），index>step 视为未教（变灰）。
     enter 步（target=.app）不纳入，避免整页灰置；变灰只用 filter/opacity，不改 pointer-events。 */
  function applyLocks() {
    if (!state) return;
    /* 同一目标可能被多拍引用（台词拍/动作拍共用按钮）：以首次出现的拍为准，
       否则后面的未到拍会把已教目标重新变灰。 */
    var first = {};
    for (var i = 0; i < SCRIPT.length; i++) {
      var t = SCRIPT[i].target;
      if (!t || t === '.app' || t === '.tb-char') continue;
      if (!Object.prototype.hasOwnProperty.call(first, t)) first[t] = i;
    }
    for (var key in first) {
      if (!Object.prototype.hasOwnProperty.call(first, key)) continue;
      var el = null;
      try { el = document.querySelector(key); } catch (e) { el = null; }
      if (!el) continue;
      if (first[key] <= state.step) el.classList.remove('guide-locked');
      else el.classList.add('guide-locked');
    }
  }
  function clearLocks() {
    var els = null;
    try { els = document.querySelectorAll('.guide-locked'); } catch (e) { els = null; }
    if (!els) return;
    for (var i = 0; i < els.length; i++) els[i].classList.remove('guide-locked');
  }

  function injectStyle() {
    if (document.getElementById('taixu-guide-style')) return;
    var s = document.createElement('style');
    s.id = 'taixu-guide-style';
    s.textContent =
      /* B1 形态（2026-11-20）：真气泡——圆角＋小尾巴、贴目标、浮层不挤布局、
         宽 ≤ 屏宽 70%（小屏不再吃满）、高度一到两行 */
      '#taixu-bubble{position:fixed;z-index:9000;max-width:min(280px,70vw);background:#1c1726;color:#f3e9d8;' +
      'border:1px solid #6b4f8a;border-radius:14px;padding:9px 12px;font:14px/1.5 "PingFang SC","Microsoft YaHei",sans-serif;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.4);pointer-events:auto;}' +
      '#taixu-bubble .tb-text{white-space:pre-wrap;}' +
      /* 文案定稿（12 拍）落码前不裁字：现行长文案若强行两行会被截断，等定稿后自然 1~2 行 */
      '#taixu-bubble .tb-tail{position:absolute;width:10px;height:10px;background:#1c1726;' +
      'border:1px solid #6b4f8a;transform:rotate(45deg);}' +
      '#taixu-bubble.tb-top .tb-tail{bottom:-6px;border-top:0;border-left:0;}' +
      '#taixu-bubble.tb-bottom .tb-tail{top:-6px;border-bottom:0;border-right:0;}' +
      '#taixu-bubble.tb-left .tb-tail{right:-6px;border-bottom:0;border-left:0;}' +
      '#taixu-bubble.tb-right .tb-tail{left:-6px;border-top:0;border-right:0;}' +
      '#taixu-bubble.tb-pass{pointer-events:none;}' +
      '#taixu-bubble.tb-pass .tb-tail{pointer-events:none;}' +
      '#taixu-bubble.tb-click{cursor:pointer;}' +
      '#taixu-bubble.tb-click .tb-text::after{content:"  ›";color:#b9a7d6;}' +
      '#taixu-skip{position:fixed;z-index:9000;font:12px/1.2 "PingFang SC","Microsoft YaHei",sans-serif;' +
      'color:#b9a7d6;background:rgba(28,23,38,.82);border:1px solid #6b4f8a;border-radius:8px;' +
      'padding:3px 8px;cursor:pointer;}' +
      '#taixu-skip:hover{color:#fff;}' +
      '#taixu-skip[hidden]{display:none;}' +
      'body.guide-active .guide-locked{filter:grayscale(.75);opacity:.5;transition:filter .3s,opacity .3s;}';
    document.head.appendChild(s);
  }

  function init() {
    if (document.getElementById('taixu-bubble')) return;
    /* 线上终验（2026-11-18）：创角页还开着时不许上台——气泡会盖住道号输入/道途卡并吞点击。
       角色落定后 finishBoot 会再调一次 init，那时再按老玩家/新档规则决定是否出现。 */
    var cm = document.getElementById('char-modal');
    if (cm && !cm.classList.contains('hidden')) return;
    /* 开局排队：剧情、沈碑浮片、奇遇气泡任一场，引导都不抢；前一个退场后自动重试 */
    if (storyOpen() || visitOpen() || encOpen() || tutBusy()) { waitForClear(); return; }
    var S = getS();
    var g = S && S.guide;
    /* R1：区分「引导进行中」与「真·老玩家」。
       已启动过引导（started/step>0/done/skipped 任一）视为恢复，不误判老玩家；
       仅当「从未启动引导 且 已有业务进度」才跳过（旧档）。 */
    var alreadyStarted = !!(g && (g.started || g.step > 0 || g.done || g.skipped));
    if (!alreadyStarted && S && ((S.rank | 0) > 0 || (S.stats && S.stats.sit | 0) > 0 || (S.plots && S.plots.length) > 0)) {
      return;
    }
    injectStyle();
    load();
    /* B1：已走完/已跳过的档，不建任何节点（页面上不许有引导残留）；
       顺手清掉可能被外部摘节点时留下的场上标记，保证「再进不复发」 */
    if (state.done || state.skipped) {
      if (typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('guide-active');
        if (document.body.dataset) document.body.dataset.guideStep = '';
      }
      clearLocks();
      return;
    }
    /* 测试/路由会手动摘气泡后再 init：先把可能残留的旧跳过钮清掉，避免重复 id */
    var staleSkip = document.getElementById('taixu-skip');
    if (staleSkip && staleSkip.parentNode) { try { staleSkip.parentNode.removeChild(staleSkip); } catch (e) {} }
    state.started = true; persist(); // 标记已启动并即时落盘，刷新后据此恢复而非误判老玩家
    view = document.createElement('div');
    view.id = 'taixu-bubble';
    view.style.display = 'none';
    view.innerHTML = '<div class="tb-text"></div><span class="tb-tail" aria-hidden="true"></span>';
    skipView = document.createElement('button');
    skipView.id = 'taixu-skip';
    skipView.type = 'button';
    skipView.textContent = '先别唠叨';
    skipView.hidden = true;
    document.body.appendChild(view);
    document.body.appendChild(skipView);
    /* 台词拍：点气泡即进下一步（动作拍不响应，等业务状态推进） */
    view.addEventListener('click', function (e) {
      if (!state || state.done || state.skipped) return;
      if (skipView && e.target === skipView) return;
      var d = def(state.step);
      if (d && d.click) { e.stopPropagation(); advance(); }
    });
    skipView.addEventListener('click', function (e) { e.stopPropagation(); skip(); });
    render();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 400); // 自有定时器，独立于 game.js render
    window.addEventListener('resize', positionBubble);
    window.addEventListener('scroll', positionBubble, true);
  }

  /* 文案全量扫描：开发者指令类文本命中数必须为 0（军规5）。 */
  var SCAN_PATTERNS = [
    /\bTODO\b/i, /\bFIXME\b/i, /console\./, /debugger/,
    /点击这里/, /调用.*函数/, /触发.*事件/, /测试一下/, /开发者提示/, /占位/, /临时/
  ];
  function scanResidue() {
    var hits = 0, lines = [];
    var i, j;
    for (i = 0; i < SCRIPT.length; i++) {
      for (j = 0; j < SCAN_PATTERNS.length; j++) {
        if (SCAN_PATTERNS[j].test(SCRIPT[i].text) || (SCRIPT[i].after && SCAN_PATTERNS[j].test(SCRIPT[i].after))) {
          hits++; lines.push(SCRIPT[i].id); break;
        }
      }
    }
    /* R6 补全：跳过者补讲文案（SYSTEM_TIP）与收尾/跳过旁白（FINISH_MSG/SKIP_MSG）
       同样属玩家可见的太虚真人台词，全量纳入零残留扫描。 */
    var tips = (typeof SYSTEM_TIP !== 'undefined') ? SYSTEM_TIP : {};
    for (var k in tips) {
      if (!Object.prototype.hasOwnProperty.call(tips, k)) continue;
      for (j = 0; j < SCAN_PATTERNS.length; j++) {
        if (SCAN_PATTERNS[j].test(tips[k])) { hits++; lines.push('tip:' + k); break; }
      }
    }
    var outro = [FINISH_MSG, SKIP_MSG, TELL_DEFAULT];
    for (i = 0; i < outro.length; i++) {
      for (j = 0; j < SCAN_PATTERNS.length; j++) {
        if (SCAN_PATTERNS[j].test(outro[i])) { hits++; lines.push('outro:' + i); break; }
      }
    }
    return { hits: hits, lines: lines };
  }

  /* 剧情优先：剧情卡上台即摘引导（DOM=0）；剧情退场后引导再按状态续上 */
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('jx:story-open', function () { teardown(); });
    document.addEventListener('jx:story-close', function () {
      if (state && !state.done && !state.skipped) init();
    });
  }
  window.Guide = {
    init: init,
    teardown: teardown,
    complete: complete,
    skip: skip,
    tellSystem: tellSystem,
    scanResidue: scanResidue,
    reset: reset,
    replay: replay,
    _state: function () { return state; },
    _replaying: function () { return !!replaySnap; }
  };
})();
