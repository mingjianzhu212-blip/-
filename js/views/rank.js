// views/rank.js — 天骄榜 面板模板（由 router 动态注入 #panel-host，纯文字榜单）
window.VIEWS = window.VIEWS || {};
VIEWS.rank = {
  title: "天骄榜",
  html: `  <section class="panel-page" id="page-rank">
    <header class="panel-head">
      <button class="panel-back" data-back>←</button>
      <h2>天骄榜</h2>
    </header>
    <div class="panel-body">
    <section class="card wide">
      <h2>天骄榜</h2>
      <div class="rank-list" id="xx-hero-rank"></div>
      <p class="hint" id="xx-hero-rank-tip"></p>
    </section>
    </div>
  </section>`
};
