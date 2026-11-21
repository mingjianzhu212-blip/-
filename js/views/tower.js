// views/tower.js — 镇妖塔 面板模板（由 router 动态注入 #panel-host，不再预置在 DOM）
window.VIEWS = window.VIEWS || {};
VIEWS.tower = {
  title: "镇妖塔",
  html: `  <section class="panel-page" id="page-tower">
    <header class="panel-head">
      <button class="panel-back" data-back>←</button>
      <h2>镇妖塔</h2>
    </header>
    <div class="panel-body">
    <section class="card wide">
      <h2>镇妖塔</h2>
      <div class="tower" id="xx-tower"></div>
    </section>

    <!-- 塔门口的老卒 · 崔九（第 113 轮）：空壳 + id，内容由 game.js 的 cuijiuEnter()/renderCuijiu()
         现填（进塔页与点话题两个时机，事件驱动，不挂 500ms 常规 render，与沈碑识人页同一纪律）。
         复用识人页现成类（npc-greet / mc-opts / npc-opt / npc-reply），零新增 CSS。
         xx-cuijiu-visit（第 114 轮）：老卒主动搭话行——NpcVisitQueue 队列 take 后渲染，
         与全局既有 #npc-visit（沈碑来访气泡 DOM id）无关，名字刻意错开。 -->
    <section class="card wide npc-card" id="xx-cuijiu-root">
      <h2>塔门口的老卒 <span class="npc-h-sub" id="xx-cuijiu-sub"></span></h2>
      <div class="npc-greet" id="xx-cuijiu-greet"></div>
      <div class="npc-greet" id="xx-cuijiu-visit" hidden></div>
      <div class="npc-topic-lines" id="xx-cuijiu-lines"></div>
      <div class="mc-opts npc-opts" id="xx-cuijiu-topics"></div>
      <div class="npc-reply" id="xx-cuijiu-reply" hidden></div>
      <p class="hint">他在塔门口守了几十年。你常来，他就记得你。</p>
    </section>

    <!-- 组队秘境 · 联机入口（第 115 轮）：真人组队副本，面板见 views/multi.js -->
    <section class="card wide">
      <h2>组队秘境 <span class="npc-h-sub">真人联机</span></h2>
      <div class="mc-opts npc-opts">
        <button class="npc-opt" id="xx-multi-open">去塔后的封门看看（2～4 人同行）</button>
      </div>
      <p class="hint">老卒说，那门后一个人走不深。得找几位道友同行——联机要有人起服务，见面板内说明。</p>
    </section>

    </div>
  </section>`
};
