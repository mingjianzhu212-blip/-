// views/secret.js — 秘境 · 副本（第 88 轮 B：卷首给总览，四章各一页）
// 由 router 动态注入 #panel-host；骨架见 views/kit.js。
window.VIEWS = window.VIEWS || {};

/* 卷首：已通层数 + 今日扫荡（game.js renderSecret() 填 #xx-secret-top） */
const SEC_TOP = `    <section class="card wide" id="sec-overview">
      <h2>秘境</h2>
      <div class="sec-top" id="xx-secret-top"></div>
    </section>`;

HUBKIT.define({
  panel: 'secret',
  title: '秘境 · 副本',
  sub: '四章十层 · 每日扫荡一次',
  crumb: '秘境',
  lead: SEC_TOP,
  secs: [
    { key: 'sec-ch-0', view: 'secret_ch0', name: '荒山古洞', note: '炼气可入 · 掉妖丹',
      ico: 'mat_core.png', sealId: 'xx-hub-sec-0', sealTxt: '0/10 层',
      body: `      <section class="card wide" id="sec-ch-0-sec">
        <div class="sec-ch" data-ch="0"></div>
      </section>` },
    { key: 'sec-ch-1', view: 'secret_ch1', name: '幽谷秘境', note: '炼气七层 · 掉兽骨',
      ico: 'mat_bone.png', sealId: 'xx-hub-sec-1', sealTxt: '0/10 层',
      body: `      <section class="card wide" id="sec-ch-1-sec">
        <div class="sec-ch" data-ch="1"></div>
      </section>` },
    { key: 'sec-ch-2', view: 'secret_ch2', name: '北冥玄境', note: '金丹初期 · 掉仙羽',
      ico: 'mat_feather.png', sealId: 'xx-hub-sec-2', sealTxt: '0/10 层',
      body: `      <section class="card wide" id="sec-ch-2-sec">
        <div class="sec-ch" data-ch="2"></div>
      </section>` },
    { key: 'sec-ch-3', view: 'secret_ch3', name: '九霄天域', note: '化神初期 · 掉魔晶',
      ico: 'mat_eye.png', sealId: 'xx-hub-sec-3', sealTxt: '0/10 层',
      body: `      <section class="card wide" id="sec-ch-3-sec">
        <div class="sec-ch" data-ch="3"></div>
      </section>` }
  ]
});
