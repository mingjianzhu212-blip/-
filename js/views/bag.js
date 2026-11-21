// views/bag.js — 储物袋 · 背包 面板模板（由 router 动态注入 #panel-host，不再预置在 DOM）
window.VIEWS = window.VIEWS || {};
VIEWS.bag = {
  title: "储物袋 · 背包",
  html: `  <section class="panel-page" id="page-bag">
    <header class="panel-head">
      <button class="panel-back" data-back>←</button>
      <h2>储物袋 · 背包</h2>
      <span class="panel-sub" id="xx-bag-cap">0 / 20</span>
    </header>
    <div class="panel-body">
    <section class="card wide" id="xx-overflow-card" hidden>
      <h2>信匣 · 满包暂存</h2>
      <div id="xx-overflow"></div>
      <p class="hint">背包满时获得的丹药/材料先收在这里；腾出格子后点「取回」，不会丢失。</p>
    </section>
    <section class="card wide">
      <h2>背包</h2>
      <div class="bag-grid" id="xx-bag"></div>
      <button class="bag-buy" id="xx-bag-buy">储物袋 +5 格</button>
      <p class="hint">炼丹房炼出的丹药放在这里 · 点物品看详情，再选服食 / 寄售 / 丢弃 · 储物袋可扩容量</p>
      <p class="hint">灵草 / 矿石等炼器炼丹原料在洞府料仓，不占背包格。<button class="xlink" type="button" data-cross="dong">去洞府料仓看原料 ›</button></p>
    </section>
    </div>
  </section>`
};
