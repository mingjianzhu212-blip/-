// views/chat.js — 世界频道 · 传音 面板模板（由 router 动态注入 #panel-host，不再预置在 DOM）
window.VIEWS = window.VIEWS || {};
VIEWS.chat = {
  title: "传音 · 世界频道",
  html: `  <section class="panel-page" id="page-chat">
    <header class="panel-head">
      <button class="panel-back" data-back>←</button>
      <h2>传音 · 世界频道</h2>
    </header>
    <div class="panel-body">
    <section class="card">
      <div class="ch-head">
        <h2>三界传音</h2>
        <span class="sc-quota off" id="ch-quota">未连接</span>
      </div>
      <div class="ch-list" id="ch-list"></div>
      <div class="ch-off" id="ch-off">
        <b><img class="btn-ic" src="ui/icons/ic_gate.png" alt="">传音阵未启</b>
        <p>世界频道需要连上山门服务。当前没有连上，游戏照常挂机；连上后会自动恢复，不必手动设置。</p>
      </div>
      <div class="ch-input">
        <input id="ch-text" type="text" maxlength="60" placeholder="说点什么…（60 字以内）" autocomplete="off">
        <button type="button" id="ch-send">传音</button>
      </div>
      <p class="sc-note" id="ch-note"></p>
    </section>
    </div>
  </section>`
};
