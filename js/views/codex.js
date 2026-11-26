// views/codex.js — 法宝图鉴（旧四族 36 件 + rv4 兽魂 10 件）与万兽谱
window.VIEWS = window.VIEWS || {};
VIEWS.codex = {
  title: "法宝图鉴",
  html: `  <section class="panel-page ink-page" id="page-codex">
    <header class="panel-head">
      <button class="panel-back" data-back>←</button>
      <h2>法宝图鉴</h2>
      <span class="panel-sub" id="codex-progress">0 / 36</span>
    </header>
    <div class="panel-body">
      <section class="card wide">
        <div class="codex-tabs" id="codex-tabs" role="tablist" aria-label="图鉴分类">
          <button type="button" data-codex-tab="art" role="tab" aria-selected="true">四族法宝</button>
          <button type="button" data-codex-tab="soul" role="tab" aria-selected="false">兽魂</button>
        </div>
        <div class="codex-top">
          <div class="codex-bar"><i id="codex-bar"></i></div>
          <span id="codex-fams"></span>
        </div>
        <div class="codex-grid" id="xx-codex"></div>
        <p class="hint">旧法宝与兽魂分别记录持有来源；同族效果只取最高阶，不叠加。未得的显示灰影与炼器出处。</p>
      </section>
    </div>
  </section>`
};

VIEWS.bestiary = {
  title: "万兽谱",
  html: `  <section class="panel-page ink-page" id="page-bestiary">
    <header class="panel-head">
      <button class="panel-back" data-back>←</button>
      <h2>万兽谱</h2>
      <span class="panel-sub" id="bestiary-progress">0 / 43</span>
    </header>
    <div class="panel-body">
      <section class="card wide bestiary-scroll">
        <div class="bestiary-head">
          <b>万兽谱</b>
          <small>记曾取得，不记现货；卖料、耗料不回退。进度跨世保留，每段奖励只领一次。</small>
        </div>
        <div id="xx-bestiary"></div>
      </section>
    </div>
  </section>`
};
