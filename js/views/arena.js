// views/arena.js — 论剑台（第 88 轮 B：一格一页，hub + 三个独立页）
// 由 router 动态注入 #panel-host；骨架见 views/kit.js。
window.VIEWS = window.VIEWS || {};

HUBKIT.define({
  panel: 'arena',
  title: '论剑台',
  sub: '每日切磋 · 声望兑奖',
  crumb: '论剑台',
  secs: [
    { key: 'ar-me', view: 'arena_me', name: '我的战绩', note: '胜败 / 声望 / 段位',
      ico: 'ic_blade.png', sealId: 'xx-hub-ar-me', sealTxt: '第1组',
      body: `      <section class="card wide" id="ar-me-sec">
        <h2>我的战绩</h2>
        <div class="ar-me" id="xx-arena-me"></div>
        <p class="hint">胜一场涨声望、连负掉段位 · 声望在这里攒，去「声望兑换」花。</p>
      </section>` },
    { key: 'ar-board', view: 'arena_board', name: '今日论剑榜', note: '五个对手 · 每日一换',
      ico: 'bld_rank.png', sealId: 'xx-hub-ar-board', sealTxt: '5 次',
      body: `      <section class="card wide" id="ar-board-sec">
        <h2>今日论剑榜</h2>
        <div class="ar-foes" id="xx-arena-foes"></div>
        <p class="hint">每日 5 次切磋，胜负看战力也看临场发挥（±15%）· 榜每日一换 · 代打每日 1 场：今日未出手时可用，花 需求×0.6 灵石，占 1 次出战，胜负随机。</p>
      </section>` },
    { key: 'ar-shop', view: 'arena_shop', name: '声望兑换', note: '声望换丹 · 换材料',
      ico: 'ic_gift.png', sealId: 'xx-hub-ar-shop',
      body: `      <section class="card wide" id="ar-shop-sec">
        <h2>声望兑换</h2>
        <div class="ar-shop" id="xx-arena-shop"></div>
        <p class="hint">切磋攒下的声望在这里花 · 档位由低到高，换过不退款。</p>
      </section>` }
  ]
});
