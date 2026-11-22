// views/codex.js — 法宝图鉴（batch5）：四族 36 件，已得点亮、未得灰影加出处
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
        <div class="codex-top">
          <div class="codex-bar"><i id="codex-bar"></i></div>
          <span id="codex-fams"></span>
        </div>
        <div class="codex-grid" id="xx-codex"></div>
        <p class="hint">已得的法宝点亮并按当前阶位显示效果；未得的显示灰影与炼器出处。出处以现有炼器与掉落为准。</p>
      </section>
    </div>
  </section>`
};