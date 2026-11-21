// views/sect.js — 宗门 · 互助（第 88 轮 B：四页各管一事）
// 由 router 动态注入 #panel-host；骨架见 views/kit.js。
window.VIEWS = window.VIEWS || {};

HUBKIT.define({
  panel: 'zong',
  title: '宗门',
  sub: '山门 · 议事 · 气象 · 探索 · 互助',
  crumb: '宗门',
  secs: [
    /* 山门 · 弟子：自己的一方道场（花灵石收徒、派差事，单机也能玩） */
    { key: 'xx-gate', view: 'zong_gate', name: '山门 · 弟子', note: '收徒 · 派差事 · 出师',
      ico: 'ic_gate.png', sealId: 'xx-hub-zong-gate', sealTxt: '五品',
      body: `      <section class="card wide" id="sc-gate-card">
        <div class="sect-head">
          <h2>弟子名册</h2>
          <span class="gate-lv" id="sc-gate-lv"></span>
        </div>
        <div id="sc-gate"></div>
      </section>` },
    /* 山门议事（第 103 轮）：每天一条琐事三选一，选完封卷到明日 */
    { key: 'xx-council', view: 'zong_council', name: '山门议事', note: '今日一条 · 三选一',
      ico: 'ic_scroll.png', sealId: 'xx-hub-zong-council', sealTxt: '待议',
      body: `      <section class="card wide" id="sc-council">
        <div class="sect-head">
          <h2>今日议事</h2>
          <span class="co-day muted" id="sc-co-day">今日待议</span>
        </div>
        <div id="xx-council"></div>
      </section>` },
    /* 山门气象：全服活跃度（在场名录 / 动态时间轴），需连互助服务 */
    { key: 'xx-weather', view: 'zong_weather', name: '山门气象', note: '此刻同门 · 山门动向',
      ico: 'ic_river.png', sealTxt: '同门',
      body: `      <section class="card wide" id="sc-weather">
        <div class="sect-head">
          <h2>全服同门</h2>
          <span class="sc-quota off" id="sc-wq">未连接</span>
        </div>
        <div class="sc-stats" id="sc-stats"></div>
        <div class="sc-roster" id="sc-roster"></div>
        <div class="sc-events" id="sc-events"></div>
      </section>` },
    /* 探索：花灵石进秘境采材料 */
    { key: 'xx-treasure', view: 'zong_seek', name: '探索秘境', note: '采灵草 · 挖矿石',
      ico: 'bld_secret.png', sealTxt: '采集',
      body: `      <section class="card wide">
        <button class="treasure-btn" id="xx-treasure">🗺️ 探索秘境</button>
        <p class="hint">按钮上标的是本次探索所需灵石（随境界递增，与实扣同源）；可采得灵草与矿石各 5~20 份（炼丹、炼器材料），机缘好时另有百年／万年灵草。</p>
      </section>` },
    /* 宗门互助：发求助、替同门护法 */
    { key: 'xx-help', view: 'zong_help', name: '宗门互助', note: '求助 · 护法 · 领赏',
      ico: 'rail_chat.png', sealTxt: '护法',
      body: `      <section class="card wide" id="sc-box">
        <div class="sect-head">
          <h2>同门之事</h2>
          <span class="sc-quota off" id="sc-quota">未连接</span>
        </div>
        <div class="sc-mine" id="sc-mine"></div>
        <div class="sc-list" id="sc-list"></div>
        <p class="sc-note" id="sc-note"></p>
      </section>` }
  ]
});
