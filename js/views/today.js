// views/today.js — 「今日」清单页（第三批 P0 · 主界面常驻小钮进入）
// 只聚合现有每日系统的次数/状态，不新造玩法与数值；重置时点统一为本地 08:00（A1 拍板）。
window.VIEWS = window.VIEWS || {};
VIEWS.today = {
  title: "今日",
  html: `  <section class="panel-page ink-page" id="page-today">
    <header class="panel-head">
      <button class="panel-back" data-back>←</button>
      <h2>今日</h2>
      <span class="panel-sub" id="today-reset">距下次重置 —</span>
    </header>
    <div class="panel-body">
      <section class="card wide">
        <h2>今日清单</h2>
        <div class="today-list" id="today-list"></div>
        <p class="hint">每日 08:00 统一重置；这里汇总今天还能做的事。打勾＝已完成/已领取。</p>
      </section>
    </div>
  </section>`
};