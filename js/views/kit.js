/* ============================================================
 * views/kit.js — 「一格一页」面板骨架
 * 第 87 轮在洞府试用的做法（hub 页一格一个功能，点格子才渲染那一页），
 * 第 88 轮 B 铺到城镇七个面板。一个 define() 调用同时产出：
 *   · hub view（view 名 = 面板名，DOM 里那一页的 id = page-<面板名>）
 *   · 每个分区一个独立 view（各自 VIEWS[<view>]，同一 id 复用——DOM 里永远只挂一页）
 *   · 路由表：锚点 → 独立页 view（场景木牌的 data-scroll 直达也走这张表）
 *   · 面板归属表：view → 面板名（router 的 per-panel 钩子按它判定，不再写死 view 名）
 * 皮肤：hub 与 sub 都带 .ink-page —— 第 86 轮那套洞府墨皮整段限定在 #page-dong 之下，
 * 由 style.css 里的 :is(#page-dong, .ink-page) 扩到全部八块面板，特异性不变。
 * 依赖：window.VIEWS 已由 router 之前的 views/*.js 建好；本文件必须先于各 views/*.js 加载。
 * ============================================================ */
window.VIEWS = window.VIEWS || {};
(function(){
  const SUBVIEW = {};     /* 分区锚点（含场景老写法别名）→ 独立页 view 名 */
  const PANEL_OF = {};    /* view 名 → 所属面板名 */
  const SECS = {};        /* 面板名 → 分区清单（测试与 render 取用） */

  /* hub 的一个格子：图标 + 名称 + 一句现状 + 右上角朱砂印。
     sealId 给了就由 game.js 每次 render 现填，不给就停在写死的 sealTxt 上。 */
  function cellHtml(s){
    return `      <button type="button" class="hub-cell" data-jump="${s.key}">
        <img class="hc-ic" src="ui/icons/${s.ico}" alt="">
        <span class="hc-t"><b>${s.name}</b><small>${s.note}</small></span>
        <span class="hc-seal"${s.sealId ? ` id="${s.sealId}"` : ''}>${s.sealTxt || '—'}</span>
      </button>`;
  }

  function hubHtml(cfg){
    return `  <section class="panel-page ink-page" id="page-${cfg.panel}" data-panel="${cfg.panel}" data-sec="hub">
    <header class="panel-head">
      <button class="panel-back" data-back>←</button>
      <h2>${cfg.title}</h2>${cfg.sub ? `\n      <span class="panel-sub">${cfg.sub}</span>` : ''}
    </header>
    <div class="panel-body">
${cfg.lead ? cfg.lead + '\n' : ''}    <nav class="hub-nav" aria-label="${cfg.title}">
${cfg.secs.map(cellHtml).join('\n')}
    </nav>
    <!-- 卷尾题跋（第 106 轮）：格子少的面板下半截原来空到 83%，硬塞功能格又会喧宾夺主。
         这里只写一行「此刻走到哪儿」（入门八事 / 道途），由 game.js 的 renderHubScroll 现填。 -->
    <div class="hub-scroll" id="hub-scroll-${cfg.panel}">
      <span class="hs-seal">道</span>
      <span class="hs-main"><b class="hs-title">道途</b><small class="hs-sub"></small></span>
      <span class="hs-idx">—</span>
    </div>
    <p class="hint hub-foot">${cfg.foot || '一处一格：点格子进它自己那一页，看完从左上角 ← 回这里。'}</p>
    </div>
  </section>`;
  }

  /* 子页：← 回 hub（栈弹一层）、面包屑也回 hub、标题带题签图，简版账条（strip）可选。
     s.tag = 页眉右侧那个由 game.js 现填的数字位（如人物的「战力 1500」），空着等 render。 */
  function subHtml(cfg, s){
    return `  <section class="panel-page ink-page hub-sub" id="page-${cfg.panel}" data-panel="${cfg.panel}" data-sec="${s.key}">
    <header class="panel-head">
      <button class="panel-back" data-back>←</button>
      <h2><img class="tag-ic" src="ui/icons/${s.ico}" alt="">${s.name}</h2>
${s.tag ? `      <span class="panel-sub" id="${s.tag}"></span>\n` : ''}      <button class="crumb" data-go-hub>${cfg.crumb || cfg.title}</button>
    </header>
${cfg.strip ? `    <div class="res-bar">${cfg.strip}</div>\n` : ''}    <div class="panel-body">
${s.body}
    </div>
  </section>`;
  }

  function define(cfg){
    if(!cfg || !cfg.panel || !Array.isArray(cfg.secs)) return;
    cfg.secs.forEach(s => {
      SUBVIEW[s.key] = s.view;
      (s.also || []).forEach(a => { SUBVIEW[a] = s.view; });
      PANEL_OF[s.view] = cfg.panel;
      VIEWS[s.view] = { title: s.name, html: subHtml(cfg, s) };
    });
    PANEL_OF[cfg.panel] = cfg.panel;
    SECS[cfg.panel] = cfg.secs;
    VIEWS[cfg.panel] = { title: cfg.title, html: hubHtml(cfg) };
  }

  window.HUBKIT = {
    define,
    subViewOf: k => SUBVIEW[k],
    panelOf: v => PANEL_OF[v],
    secsOf: p => SECS[p] || []
  };
})();
