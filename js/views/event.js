// views/event.js — 限时活动（第 88 轮 B：一格一页，hub + 四个独立页）
// 由 router 动态注入 #panel-host；骨架见 views/kit.js。
window.VIEWS = window.VIEWS || {};

HUBKIT.define({
  panel: 'event',
  title: '限时活动',
  sub: '日常 · 签到 · 仙盟',
  crumb: '限时活动',
  secs: [
    { key: 'ev-daily', view: 'event_daily', name: '日常任务', note: '打坐历练爬塔自动计入',
      ico: 'rail_quest.png', sealId: 'xx-hub-ev-daily',
      body: `      <section class="card wide" id="ev-daily-sec">
        <h2>日常任务</h2>
        <div class="ev-daily" id="xx-daily"></div>
      </section>` },
    { key: 'ev-sign', view: 'event_sign', name: '七日签到', note: '连续七日 · 第七天极品丹',
      ico: 'ic_gift.png', sealId: 'xx-hub-ev-sign', sealTxt: '第1天',
      body: `      <section class="card wide" id="ev-sign-sec">
        <h2>七日签到</h2>
        <div class="ev-sign" id="xx-sign"></div>
      </section>` },
    { key: 'ev-union', also: ['xx-union'], view: 'event_union', name: '仙盟争霸', note: '每日出战 · 战功为凭',
      ico: 'ic_swords.png', sealId: 'xx-hub-ev-union', sealTxt: '0 功',
      body: `      <section class="card wide" id="ev-union-sec">
        <h2>仙盟争霸</h2>
        <div class="ev-union" id="xx-union"></div>
      </section>` },
    { key: 'ev-rew', view: 'event_rew', name: '战功兑奖', note: '赛季清零前先领干净',
      ico: 'ic_stonebag.png', sealId: 'xx-hub-ev-rew',
      body: `      <section class="card wide" id="ev-rew-sec">
        <h2>战功兑奖</h2>
        <div class="ev-rew-list" id="xx-union-rew"></div>
      </section>` }
  ]
});
