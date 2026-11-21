// views/beast.js — 灵兽园 面板模板（由 router 动态注入 #panel-host，不再预置在 DOM）
window.VIEWS = window.VIEWS || {};
VIEWS.chong = {
  title: "灵兽园",
  html: `  <section class="panel-page" id="page-chong">
    <header class="panel-head">
      <button class="panel-back" data-back>←</button>
      <h2>灵兽园</h2>
    </header>
    <div class="panel-body">
    <section class="card wide">
      <h2>灵兽</h2>
      <div class="pet-list" id="xx-pets"></div>
      <p class="hint">猎妖拾「妖兽蛋」→ 孵化成灵兽 → 喂养升级 → 出战加战力。灵兽越强，能打的妖兽越高级。</p>
    </section>
    </div>
  </section>`
};
