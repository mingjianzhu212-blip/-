/* ============================================================
 * router.js — 中央路由
 * 点建筑木牌 → 动态把对应 view 模板注入 #panel-host，离开即清空。
 * 不再预置所有 panel 用 display:none 硬切；DOM 里始终只有当前页面。
 * 依赖：XX（game.js）、VIEWS（views/*.js）需先于本文件加载。
 * ============================================================ */
(function(){
  const host = () => document.getElementById('panel-host');
  const scene = () => document.getElementById('page-scene');
  let cur = 'scene';

  /* ---- 二级路由（第 87 轮洞府试用，第 88 轮 B 铺到城镇七面板）----
     一个功能一屏：hub 页只放入口格，点格进各自的 view。
     stack 栈顶就是当前页，back() 先弹回上一层（子页 → hub → 场景），
     不再是「一个长页里上下堆八个分区」。 */
  const stack = [];
  /* 分区锚点 → 独立页 view 名、view → 所属面板名：两张表都由 views/kit.js 的 define() 生成，
     场景木牌带的 data-scroll 也走同一张表直达（老写法别名在 define 的 also 里登记）。 */
  const subView = k => (k && window.HUBKIT) ? HUBKIT.subViewOf(k) : null;
  /* 还没迁到 kit 的老面板没有登记表，view 名本身就是面板名 —— 兜这一手，拆一块少一块特例 */
  const panelOf = v => { const p = (v && window.HUBKIT) ? HUBKIT.panelOf(v) : null; return p || v; };

  function toast(msg){
    const t = document.getElementById('toast');
    if(!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 1700);
  }
  /* 修复单 P1：给游戏侧购买/升级失败用同一个可见提示 */
  try{ window.toast = toast; }catch(e){}

  /* 绑定当前 view 内的按钮：下一秒重新 open 时 DOM 整体替换，旧监听随元素回收 */
  function bindPanel(){
    const h = host(); if(!h) return;
    h.querySelectorAll('.panel-back').forEach(b => b.addEventListener('click', back));
    const fb = h.querySelector('#xx-field-buy'); if(fb) fb.addEventListener('click', () => XX._buyField(fb));
    const mb = h.querySelector('#xx-mine-buy');   if(mb) mb.addEventListener('click', () => XX._buyMine(mb));
    /* 人物面板：道行拆账入口（弹窗在 #power-modal，主 DOM 静态元素） */
    const pb = h.querySelector('#xx-role-break');  if(pb) pb.addEventListener('click', () => XX._openPower());
    /* hub 页的入口格：点一格进一个独立页（不是在同页里跳锚点） */
    const cn = h.querySelector('.hub-nav');
    if(cn) cn.addEventListener('click', ev => {
      const b = ev.target.closest ? ev.target.closest('[data-jump]') : null;
      if(!b) return;
      const sub = subView(b.dataset.jump);
      if(sub) openSub(sub);
    });
    /* 子页页眉的面包屑：回 hub */
    const hb = h.querySelector('[data-go-hub]');
    if(hb) hb.addEventListener('click', () => back());
    const tr = h.querySelector('#xx-treasure');   if(tr) tr.addEventListener('click', () => XX._treasure());
    const mub = h.querySelector('#xx-multi-open'); if(mub) mub.addEventListener('click', () => open('multi'));   /* 组队秘境 · 联机（115 轮） */
    const bag = h.querySelector('#xx-bag');
    if(bag) bag.addEventListener('click', ev => {
      const c = ev.target && ev.target.closest ? ev.target.closest('.bag-cell') : null;
      if(!c || c.classList.contains('empty')) return;
      /* 点格子先弹物品详情框，框内再选服食/寄售/丢弃（不再一点就直接吃掉或卖掉） */
      XX._itemDetail(Number(c.dataset.i));
    });
    const im = document.getElementById('item-modal');
    if(im) im.onclick = ev => { if(ev.target === im) XX._itemClose(); };
    const bb = h.querySelector('#xx-bag-buy'); if(bb) bb.addEventListener('click', () => XX._buyBag(bb));
    /* 世界频道（传音）面板：DOM 每次整体替换，绑定随元素回收，在此重绑 */
    try{ SECT.chatBind(); }catch(e){}
    /* 人物面板的三个圈（第 95 轮）：已穿 → 问一句再卸下；空着 → 背包里有能装的就穿上最好的一件。
       只此一处绑监听：上一轮加过第二条监听，两条同挂一个元素，第二条点空圈时也会走到这里的 confirm。 */
    h.querySelectorAll('.equip-slot').forEach(sl => sl.addEventListener('click', () => {
      const k = sl.dataset.slot;
      if(XX._equippedId(k)){
        const m = XX._equippedMeta(k);
        if(confirm('卸下【' + (m && m.n || '') + '】？')) XX._unequipItem(k);
        return;
      }
      XX._slotTap(k);
    }));
    /* 寿元页（第 96 轮）：开寿元不可逆 → 问一句；坐化转世是死后唯一的出路 → 不问。
       ⚠️ 这条 confirm 是原生框：headless Edge 在 virtual-time 下不会作答，
       测试与截图脚本点这个按钮前必须先把 window.confirm 换成 () => true（见 DEV_NOTES §95.3）。 */
    /* 第三批 B2：四族法宝位 → 已持有去强化页，未持有去炼器页（动作不在人物页办）。
      法宝格由 renderCharSheet 在 bindPanel 之后才填，所以用委托挂在容器上。 */
    const artsBox = h.querySelector('#xx-role-arts');
    if(artsBox) artsBox.addEventListener('click', ev => {
      const sl = ev.target && ev.target.closest ? ev.target.closest('.art-slot') : null;
      if(!sl) return;
      ROUTER.open('dong', sl.dataset.owned === '1' ? 'xx-enhance-sec' : 'xx-forge-sec');
    });
    /* 人物页：一键装备（只填空槽，复用现有 slotTap / equipItem） */
    const ae = h.querySelector('#xx-role-auto');
    if(ae) ae.addEventListener('click', () => {
      let r = null;
      try{ r = XX._autoEquip(); }catch(e){}
      if(r && r.ok) toast('已换上 ' + r.n + ' 件（' + r.slots.join(' / ') + '）');
      else toast('没有可换的空槽装备');
    });
    /* 人物页内页签：札记 / 道碑 / 悟道 / 断天门 / 识人（都属人物自己的东西） */
    h.querySelectorAll('[data-role-jump]').forEach(b => b.addEventListener('click', () => {
      open('role', b.dataset.roleJump);
    }));
    /* P0.5：料仓 ↔ 背包互指 */
    h.querySelectorAll('[data-cross]').forEach(b => b.addEventListener('click', () => {
      const p = b.dataset.cross;
      if(p) open(p);
    }));
    /* 第三批 P0：缺料「去哪弄」跳转（炼丹/炼器行内的 .mat-go） */
    ['#xx-alchemy', '#xx-forge'].forEach(sel => {
      const box = h.querySelector(sel);
      if(!box) return;
      box.addEventListener('click', ev => {
        const b = ev.target.closest ? ev.target.closest('[data-mat-go]') : null;
        if(!b) return;
        ev.preventDefault(); ev.stopPropagation();
        const parts = String(b.dataset.matGo || '').split(':');
        if(parts[0]) open(parts[0], parts[1] || undefined);
      });
    });
    /* 第三批 P0：今日清单的领取/跳转（清单行由 renderToday 现建） */
    const tl = h.querySelector('#today-list');
    if(tl) tl.addEventListener('click', ev => {
      const c = ev.target.closest ? ev.target.closest('[data-today-claim]') : null;
      if(c){
        const v = c.dataset.todayClaim;
        if(v === 'sign'){ try{ XX._claimSign(); }catch(e){} }
        else if(v.indexOf('daily:') === 0){ try{ XX._claimDailyToday(v.slice(6)); }catch(e){} }
        return;
      }
      const g = ev.target.closest ? ev.target.closest('[data-today-go]') : null;
      if(g){
        const parts = String(g.dataset.todayGo || '').split(':');
        if(parts[0]) open(parts[0], parts[1] || undefined);
      }
    });
    const le = h.querySelector('#xx-life-enable');
    if(le) le.addEventListener('click', () => {
      if(confirm('开启寿元？开了就关不掉：这一世会老、会坐化，只能转世续道统。')) XX._enableLife();
    });
    const lr = h.querySelector('#xx-life-reborn');
    if(lr) lr.addEventListener('click', () => XX._reborn());
    /* 沈碑识人页（切片 2b）：话题行与选项按钮都是 renderNpcPage 现建的，
       委托挂在这两个容器上；enter 每次整体替换 innerHTML，旧监听随节点回收，不叠加 */
    const npt = h.querySelector('#npc-topics');
    if(npt){
      npt.addEventListener('click', ev => {
        const b = ev.target.closest ? ev.target.closest('[data-topic]') : null;
        if(!b) return;
        try{ XX._npcOpenTopic(b.dataset.topic); }catch(e){}
      });
      npt.addEventListener('keydown', ev => {
        if(ev.key !== 'Enter' && ev.key !== ' ') return;
        const b = ev.target.closest ? ev.target.closest('[data-topic]') : null;
        if(!b) return;
        ev.preventDefault();
        try{ XX._npcOpenTopic(b.dataset.topic); }catch(e){}
      });
    }
    const npo = h.querySelector('#npc-opts');
    if(npo) npo.addEventListener('click', ev => {
      const b = ev.target.closest ? ev.target.closest('[data-opt]') : null;
      if(!b) return;
      try{ XX._npcChoose(b.dataset.topic, b.dataset.opt); }catch(e){}
    });
  }

  /* 注入一个 view 并绑好它的按钮 —— 不动栈，由 open / openSub / back 决定层级 */
  function enter(name, scrollTo){
    if(!window.VIEWS || !VIEWS[name]) return;
    const h = host(); if(!h) return;
    h.innerHTML = VIEWS[name].html;
    const p = h.firstElementChild;
    if(p){ p.classList.add('active'); p.scrollTop = 0; }
    const sc = scene(); if(sc) sc.classList.remove('active');
    cur = name;
    try{ SECT.chatClose(); }catch(e){}
    if(name === 'chat'){ try{ SECT.chatOpen(); }catch(e){} }
    /* 宗门四页（气象要拉全服名录、互助要重绑按钮）——按所属面板判定，不再只认 hub 的 view 名 */
    if(panelOf(name) === 'zong'){ try{ SECT.panelOpen(); }catch(e){} }
    /* 人物：进了面板就算看过新立的道碑（清红点）——道碑页在拆页后才是它的一页 */
    if(panelOf(name) === 'role'){ try{ XX._milesSeen(); }catch(e){} }
    /* 沈碑识人页（切片 2b）：进入即按冻结时序取开场白快照 / 记重逢 / 记见面；
       切到别的 view 就清页面临时态（回复不跨页残留）。放在 bindPanel 之前，
       这样委托绑定时选项按钮已经在 DOM 里。 */
    try{ XX._npcPageSync(name); }catch(e){}
    bindPanel();
    try{ XX._render(); }catch(e){}
    /* 面板整体替换后 #xx-log 是新元素，render() 不覆盖日志——不补这一笔，
       每次打开面板日志区都是空的，直到下一条新日志事件才出现（第 67 节顺带修） */
    try{ XX._renderLog(); }catch(e){}
    syncTabs();
    if(scrollTo){
      setTimeout(() => {
        const t = document.getElementById(scrollTo);
        if(t) t.scrollIntoView({ behavior:'smooth', block:'center' });
      }, 80);
    }
  }

  /* 从场景进面板 = 新的一层，栈清空。
     木牌带的 data-scroll 若是某个分区的锚点，直接落到那一个功能的独立页，
     不再「先进长页再滚到那一节」；底下仍压着 hub 一页，所以 ← 先回 hub。 */
  function open(name, scrollTo){
    /* 只认同一个面板的分区：木牌写错了（锚点属于别家）就当没有，落回 hub 本身 */
    const sub = subView(scrollTo);
    const hop = sub && panelOf(sub) === name ? sub : null;
    stack.length = 0;
    if(hop){ stack.push(name, hop); enter(hop); }
    else { stack.push(name); enter(name, scrollTo); }
    /* 太虚真人·跳过者补讲（tellSystem 内部已判 skipped 与去重；window.Guide 守卫避免加载时序问题） */
    if (typeof window.Guide !== 'undefined') {
      var _tsKey = null;
      if (name === 'tower') _tsKey = 'tower';
      else if (name === 'bag') _tsKey = 'bag';
      else if (name === 'dong' && scrollTo === 'xx-field') _tsKey = 'field';
      if (_tsKey) window.Guide.tellSystem(_tsKey);
    }
  }

  /* hub → 子页 = 压一层；返回先回到 hub */
  function openSub(name){
    if(stack[stack.length - 1] === name) return;
    stack.push(name);
    enter(name);
  }

  function back(){
    if(stack.length > 1){ stack.pop(); enter(stack[stack.length - 1]); return; }
    stack.length = 0;
    const h = host(); if(h) h.innerHTML = '';
    const sc = scene(); if(sc) sc.classList.add('active');
    cur = 'scene';
    /* 回场景也算离开识人页：页面临时态（开场白快照 / 回复）一并清掉 */
    try{ XX._npcPageSync('scene'); }catch(e){}
    try{ SECT.chatClose(); }catch(e){}
    try{ XX._render(); }catch(e){}
    syncTabs();
  }

  function current(){ return cur; }
  function depth(){ return stack.length; }

  /* 第三批 B2：底栏高亮跟当前落点走（场景分洞府/城镇；面板按所属 panel 认） */
  function tabOfCur(){
    if(cur === 'scene'){
      const ps = scene();
      return ps && ps.classList.contains('in-town') ? 'town' : 'cave';
    }
    const p = panelOf(cur);
    return (p === 'role' || p === 'zong' || p === 'bag') ? p : null;
  }
  function syncTabs(){
    const on = tabOfCur();
    document.querySelectorAll('.scene-tab[data-tab]').forEach(t => {
      const hit = t.dataset.tab === on;
      t.classList.toggle('active', hit);
      t.setAttribute('aria-pressed', String(hit));
    });
  }
  /* 底栏洞府/城镇：清掉面板栈，回场景并切子场景 */
  function toScene(which){
    stack.length = 0;
    const h = host(); if(h) h.innerHTML = '';
    const sc = scene(); if(sc) sc.classList.add('active');
    cur = 'scene';
    showScene(which);
    try{ XX._npcPageSync('scene'); }catch(e){}
    try{ SECT.chatClose(); }catch(e){}
    try{ XX._render(); }catch(e){}
    syncTabs();
  }

  /* 场景上的建筑/系统按钮 → 打开 view（绑一次，元素在主 DOM 不变） */
  function bindScene(){
    document.querySelectorAll('[data-bld]').forEach(b => {
      b.addEventListener('click', () => {
        open(b.dataset.bld, b.dataset.scroll);
      });
    });
    /* 底部五签（第三批 B2）：人物 / 洞府 / 城镇 / 宗门 / 背包 */
    document.querySelectorAll('.scene-tab[data-tab]').forEach(t => {
      t.addEventListener('click', () => {
        const k = t.dataset.tab;
        if(k === 'cave' || k === 'town'){ toScene(k); return; }
        if(k === 'role'){ open('role', 'xx-role-equip'); return; }
        if(k === 'zong'){ open('zong'); return; }
        if(k === 'bag'){ open('bag'); return; }
      });
    });
    /* 洞府修炼行动：打坐 / 采药 / 历练 / 顿悟 */
    document.querySelectorAll('.cave-act').forEach(b => {
      b.addEventListener('click', () => { try{ XX._act(b.dataset.k); }catch(e){} });
    });
    document.querySelectorAll('[data-soon]').forEach(b => {
      b.addEventListener('click', () => toast('「' + b.dataset.soon + '」建设中，敬请期待'));
    });
    /* 顶栏战力 chip → 道行拆账（静态元素，只绑一次） */
    const pc = document.getElementById('sc-power-chip');
    if(pc) pc.addEventListener('click', () => XX._openPower());
    /* 顶栏寿元 chip → 寿元 hub（第 96 轮，同为静态元素） */
    const lc = document.getElementById('sc-life-chip');
    if(lc) lc.addEventListener('click', () => open('life'));
    /* 第三批 P0：主界面「今日」小钮 → 今日清单 */
    const td = document.getElementById('sc-today');
    if(td) td.addEventListener('click', () => open('today'));
    /* 入门八事纸签（第 105 轮）：同样常驻主 DOM，只绑一次 */
    const tr = document.getElementById('sc-trail');
    if(tr) tr.addEventListener('click', () => { try{ XX._trail.go(); }catch(e){} });
  }

  /* 切换主场景子页（cave=洞府 / town=城镇） */
  function showScene(which){
    document.querySelectorAll('.sub-scene').forEach(s => s.classList.toggle('active', s.id === 'scene-' + which));
    document.querySelectorAll('.scene-tab').forEach(t => t.classList.toggle('active', t.dataset.scene === which));
    document.querySelectorAll('.scene-tab').forEach(t => t.setAttribute('aria-pressed', String(t.dataset.scene === which)));
    /* 洞府（天地大阵）用暗青水墨渐变背景，城镇保留楼阁图 */
    const ps = document.getElementById('page-scene');
    if(ps) ps.classList.toggle('in-town', which === 'town');
    syncTabs();
  }

  /* 模态框关闭（模态框在主 DOM，绑一次）。
     判空必须覆盖**真正被解引用**的对象：先取 modal 再取其关闭按钮，
     否则老写法「if(关闭按钮) 才绑，回调里却改 modal」在 modal 缺失时仍会抛错。 */
  function bindModals(){
    const tm = document.getElementById('treasure-modal');
    const tc = document.getElementById('t-close');
    if(tc && tm) tc.addEventListener('click', () => tm.classList.add('hidden'));
    if(tm) tm.addEventListener('click', ev => { if(ev.target === tm) tm.classList.add('hidden'); });
    const bm = document.getElementById('break-modal');
    const bc = document.getElementById('b-close');
    if(bc && bm) bc.addEventListener('click', () => bm.classList.add('hidden'));
    if(bm) bm.addEventListener('click', ev => { if(ev.target === bm) bm.classList.add('hidden'); });
    /* A1 炼制结算（炼器/炼丹）：只手动关闭，不自动消失 */
    const csm = document.getElementById('craft-settle');
    const csc = document.getElementById('cs-close');
    if(csc && csm) csc.addEventListener('click', () => csm.classList.add('hidden'));
    if(csm) csm.addEventListener('click', ev => { if(ev.target === csm) csm.classList.add('hidden'); });
    /* 阶段三 S2：突破确认页 */
    const bcm = document.getElementById('break-confirm-modal');
    const bcok = document.getElementById('bc-ok');
    const bcc = document.getElementById('bc-cancel');
    if(bcok) bcok.addEventListener('click', () => { try{ XX._confirmBreak(); }catch(e){} });
    if(bcc) bcc.addEventListener('click', () => { try{ XX._closeBreakConfirm(); }catch(e){} });
    if(bcm) bcm.addEventListener('click', ev => { if(ev.target === bcm) bcm.classList.add('hidden'); });
    const om = document.getElementById('off-modal');
    const oc = document.getElementById('off-close');
    if(oc && om) oc.addEventListener('click', () => om.classList.add('hidden'));
    if(om) om.addEventListener('click', ev => { if(ev.target === om) om.classList.add('hidden'); });
    const hm = document.getElementById('hatch-modal');
    const hc = document.getElementById('hatch-close');
    if(hc && hm) hc.addEventListener('click', () => { hm.classList.add('hidden'); if(window.hatchCeremonyClear) window.hatchCeremonyClear(); });
    if(hm) hm.addEventListener('click', ev => { if(ev.target === hm){ hm.classList.add('hidden'); if(window.hatchCeremonyClear) window.hatchCeremonyClear(); } });
    /* 道行拆账：关闭按钮 + 点遮罩关闭 */
    const wc = document.getElementById('pw-close');
    if(wc) wc.addEventListener('click', () => XX._closePower());
    const wm = document.getElementById('power-modal');
    if(wm) wm.addEventListener('click', ev => { if(ev.target === wm) XX._closePower(); });
    /* 存档备份（第 78 节）：导出 / 选择文件 / 粘贴预览 / 写入 / 重载 */
    const svc = document.getElementById('sv-close');
    if(svc) svc.addEventListener('click', () => XX._closeSave());
    const svm = document.getElementById('save-modal');
    if(svm) svm.addEventListener('click', ev => { if(ev.target === svm) XX._closeSave(); });
    const svd = document.getElementById('sv-download');
    if(svd) svd.addEventListener('click', () => XX._downloadSave());
    const svp = document.getElementById('sv-copy');
    if(svp) svp.addEventListener('click', () => XX._copySave());
    const svpick = document.getElementById('sv-pick');
    if(svpick) svpick.addEventListener('click', () => {
      const f = document.getElementById('sv-file'); if(f) f.click();
    });
    const svfile = document.getElementById('sv-file');
    if(svfile) svfile.addEventListener('change', () => {
      XX._readSaveFile(svfile.files && svfile.files[0]);
      svfile.value = '';
    });
    const svin = document.getElementById('sv-in');
    if(svin) svin.addEventListener('input', () => XX._resetImport());
    const svcheck = document.getElementById('sv-check');
    if(svcheck) svcheck.addEventListener('click', () => {
      const t = document.getElementById('sv-in');
      XX._previewSave(t ? t.value : '');
    });
    const svapply = document.getElementById('sv-apply');
    if(svapply) svapply.addEventListener('click', () => {
      const t = document.getElementById('sv-in');
      XX._applySaveText(t ? t.value : '');
    });
    const svcancel = document.getElementById('sv-cancel');
    if(svcancel) svcancel.addEventListener('click', () => XX._closeSave());
    const svreload = document.getElementById('sv-reload');
    if(svreload) svreload.addEventListener('click', () => location.reload());
  }

  window.ROUTER = { open, openSub, back, current, depth, bindScene, bindModals, showScene, toScene, syncTabs };
  window.switchTab = (n, s) => open(n, s);   /* 兼容 verify.js / 截图脚本旧调用 */
  window.backToScene = back;
  window.showToast = toast;
})();

/* ============================================================
 * 启动：先初始化游戏核心与宗门模块，再绑定场景路由 + 模态框。
 * （panel 内按钮由 ROUTER.open 每次动态绑定，无需在此处理）
 * ============================================================ */
XX.boot();
SECT.boot();
ROUTER.bindScene();
ROUTER.bindModals();
