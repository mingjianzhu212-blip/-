// views/multi.js — 组队秘境 · 联机面板模板（第 115 轮 T-704）
// 由 router 动态注入 #panel-host；三态（大厅/房间/副本）内容全部由 game.js 的
// multiEnter()/renderMulti() 按当前 Net 状态现填——与崔九卡同一事件驱动纪律，
// 不挂 500ms 常规 render。复用现成类（card / hint / ch-input / npc-opt），零新增 CSS。
window.VIEWS = window.VIEWS || {};

VIEWS.multi = {
  title: "组队秘境",
  html: `  <section class="panel-page" id="page-multi">
    <header class="panel-head">
      <button class="panel-back" data-back>←</button>
      <h2>组队秘境 · 联机</h2>
    </header>
    <div class="panel-body">

    <!-- 大厅态：连服务器 → 建房/进房 -->
    <section class="card wide" id="xx-multi-hall" hidden>
      <h2>大厅 <span class="npc-h-sub" id="xx-multi-who"></span></h2>
      <p class="hint" id="xx-multi-srvline">联机要有一个真人开服务：本机跑 <code>node server/server.mjs</code>，同 WiFi 的道友在各自浏览器里填同一个地址。</p>
      <div class="ch-input" id="xx-multi-connrow">
        <input id="xx-multi-srv" type="text" placeholder="服务地址，例如 http://192.168.1.5:7730" autocomplete="off">
        <button type="button" id="xx-multi-go">进入</button>
      </div>
      <div class="ch-input" id="xx-multi-namerow" hidden>
        <input id="xx-multi-name" type="text" maxlength="12" placeholder="报上道号（12 字以内）" autocomplete="off">
        <button type="button" id="xx-multi-join">登入</button>
      </div>
      <div class="npc-greet" id="xx-multi-hallmsg"></div>
      <!-- 道途（P1-A）：四选一，服务器登记；连上服务后按服务器下发的目录渲染 -->
      <div class="mc-opts" id="xx-multi-pathrow" hidden></div>
      <div class="mc-opts npc-opts" id="xx-multi-roomlist"></div>
      <p class="hint" id="xx-multi-onlineline"></p>
    </section>

    <!-- 房间态：成员/准备/开战/聊天 -->
    <section class="card wide" id="xx-multi-roomcard" hidden>
      <h2>队伍 <span class="npc-h-sub" id="xx-multi-roomsub"></span></h2>
      <div class="npc-greet" id="xx-multi-members"></div>
      <!-- 道途可在开战前改（开战后服务器一律拒绝） -->
      <div class="mc-opts" id="xx-multi-roompath" hidden></div>
      <div class="mc-opts npc-opts" id="xx-multi-roomopts"></div>
      <div class="npc-reply" id="xx-multi-roommsg" hidden></div>
      <div class="ch-input">
        <input id="xx-multi-chatin" type="text" maxlength="60" placeholder="跟道友说点什么…（60 字以内）" autocomplete="off">
        <button type="button" id="xx-multi-chatsend">传音</button>
      </div>
      <div class="npc-greet" id="xx-multi-chatlog"></div>
      <p class="hint">组队秘境共五层，队伍合力推进；人越多，队伍战力越足。人人点头才开得动。</p>
    </section>

    <!-- 副本态：推层 -->
    <section class="card wide" id="xx-multi-runcard" hidden>
      <h2>秘境深处 <span class="npc-h-sub" id="xx-multi-runsub"></span></h2>
      <div class="npc-greet" id="xx-multi-runinfo"></div>
      <div class="mc-opts npc-opts" id="xx-multi-runopts"></div>
      <div class="npc-greet" id="xx-multi-runlog"></div>
    </section>

    <!-- 结算：独立卡，出现一次，看完手点关闭 -->
    <section class="card wide" id="xx-multi-settle" hidden>
      <h2>此行结算</h2>
      <div class="npc-greet" id="xx-multi-settlebody"></div>
      <div class="mc-opts npc-opts" id="xx-multi-settleopts"></div>
    </section>

    <section class="card wide" id="xx-multi-offline">
      <h2>组队秘境 · 联机</h2>
      <div class="npc-greet">镇妖塔后头有一道封着的山门，门后是更凶的妖物，一个人走不深。</div>
      <p class="hint">这是真人联机玩法：需要一位道友起服务（<code>node server/server.mjs</code>），大家填同一个地址进来，2～4 人组队闯秘境。</p>
    </section>
    </div>
  </section>`
};
