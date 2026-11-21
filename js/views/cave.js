// views/cave.js — 洞府（第 87 轮起：hub 页 + 七个功能各自独立的一页）
// 第 88 轮 B：这一家不再是特例——骨架交给 views/kit.js，七块面板共用同一套 hub / 子页 markup。
// 由 router 动态注入 #panel-host；同一时刻 DOM 里只有一页，所以各页可以复用同一批 id。
window.VIEWS = window.VIEWS || {};

/* ---- 共用料 ----
   资源账条：五个数字在 hub 是卷首大账，在子页压成一条，id 与 game.js 的 renderResources 同源 */
const CAVE_RES = `
      <div class="res-grid">
        <div class="res"><span class="res-l"><img class="res-ico" src="ui/icons/herb.png" alt="">灵草</span><b id="xx-herb">0</b></div>
        <div class="res"><span class="res-l"><img class="res-ico" src="ui/icons/ore.png" alt="">矿石</span><b id="xx-ore">0</b></div>
        <div class="res"><span class="res-l"><img class="res-ico" src="ui/icons/herb100.png" alt="">百年灵草</span><b id="xx-herb100">0</b></div>
        <div class="res"><span class="res-l"><img class="res-ico" src="ui/icons/herb10000.png" alt="">万年灵草</span><b id="xx-herb10000">0</b></div>
        <div class="res"><span class="res-l"><img class="res-ico" src="ui/icons/weapon1.png" alt="">灵器</span><b id="xx-weapon">无</b></div>
      </div>`;

/* 卷首小景（第 86 轮）：洞府水墨横卷铺底，资源栏压在画下缘的纸色渐隐带上 */
const CAVE_HERO = `    <section class="card wide hub-hero">
      <div class="hh-sp"></div>
      <div class="hh-cap">
        <span class="hh-s">灵田三畦 · 丹灶一炉 · 泉声入夜</span>
      </div>${CAVE_RES}
    </section>`;

HUBKIT.define({
  panel: 'dong',
  title: '洞府 · 产业',
  crumb: '洞府',
  lead: CAVE_HERO,
  strip: CAVE_RES,
  secs: [
    { key: 'xx-field', view: 'dong_field', name: '灵田', note: '播种 · 生长 · 收获入仓',
      ico: 'cave_tag_field.png', sealId: 'xx-hub-field', sealTxt: 'Lv.0',
      body: `      <section class="card wide" id="xx-field">
        <h2>耕种 <span class="farm-state" id="xx-field-state"></span></h2>
        <div class="farm-bar" id="xx-farm-bar"></div>
        <p class="farm-msg" id="xx-farm-msg" aria-live="polite"></p>
        <p class="farm-wait" id="xx-field-wait"></p>
        <div class="plot-wrap" id="xx-plot-wrap"><div class="plot-grid" id="xx-plots"></div></div>
        <div class="field">
          <div class="field-main">
            <div class="field-name"><img class="field-ico" src="ui/icons/herb.png" alt="">灵田 <b>Lv.<span id="xx-field-lv">0</span></b></div>
            <div class="field-sub">自动凝结 <b id="xx-field-rate">0</b> · 田块 <b id="xx-field-plots">0/9</b></div>
          </div>
          <button class="field-btn" id="xx-field-buy">开垦</button>
        </div>
        <p class="hint">田里种灵草，成熟一茬收一茬，收获直入炼丹房料仓；灵石仍由灵田自动凝结，关页面也算。</p>
      </section>` },
    { key: 'xx-mine', view: 'dong_mine', name: '矿脉', note: '自动产矿石 · 炼器之料',
      ico: 'cave_tag_mine.png', sealId: 'xx-hub-mine', sealTxt: 'Lv.0',
      body: `      <section class="card wide" id="xx-mine">
        <h2>开采</h2>
        <div class="stats" id="xx-mine-stats">
          <div class="stat"><span>当前矿石</span><b id="xx-mine-ore">0</b></div>
          <div class="stat"><span>每分钟</span><b id="xx-mine-per">0</b></div>
          <div class="stat"><span>满级产量</span><b id="xx-mine-max">0</b></div>
        </div>
        <div class="field">
          <div class="field-main">
            <div class="field-name">矿脉 <b>Lv.<span id="xx-mine-lv">0</span></b></div>
            <div class="field-sub">每分钟产 <b id="xx-mine-rate">0</b> 矿石</div>
          </div>
          <button class="field-btn" id="xx-mine-buy">开辟</button>
        </div>
        <p class="hint">矿脉自动产矿石，炼器材料，关页面也算。</p>
      </section>` },
    { key: 'xx-alchemy-sec', view: 'dong_alchemy', name: '炼丹房', note: '灵草炼丹 · 丹方收集',
      ico: 'cave_tag_alchemy.png', sealId: 'xx-hub-alchemy', sealTxt: 'Lv.0', also: ['xx-alchemy'],
      body: `      <section class="card wide" id="xx-alchemy-sec">
        <h2>丹炉</h2>
        <div class="craft-up"><span id="xx-alchemy-up"></span><button type="button" class="field-btn" id="xx-alchemy-upbtn">升级</button></div>
        <p class="farm-msg" id="xx-alchemy-upmsg" aria-live="polite"></p>
        <div class="craft-list" id="xx-alchemy"></div>
        <p class="hint">用灵草 + 灵石炼制丹药，吃了加修为、提升突破成功率。炼成的丹药与装备在背包。<button class="xlink" type="button" data-cross="bag">去背包看成品 ›</button></p>
      </section>` },
    { key: 'xx-forge-sec', view: 'dong_forge', name: '炼器房', note: '四族法器 · 各九阶',
      ico: 'cave_tag_forge.png', sealId: 'xx-hub-forge', sealTxt: 'Lv.0', also: ['xx-forge'],
      body: `      <section class="card wide" id="xx-forge-sec">
        <h2>器炉</h2>
        <div class="craft-up"><span id="xx-forge-up"></span><button type="button" class="field-btn" id="xx-forge-upbtn">升级</button></div>
        <p class="farm-msg" id="xx-forge-upmsg" aria-live="polite"></p>
        <div class="craft-list" id="xx-forge"></div>
        <p class="hint">灵器提修炼、战器加战力、破器助破境、财器添灵石——四族各占一个持有位，可以同时佩。炼成的法宝在背包与人物页。<button class="xlink" type="button" data-cross="bag">去背包看成品 ›</button></p>
      </section>` },
    { key: 'xx-enhance-sec', view: 'dong_enhance', name: '法宝强化', note: '强化 · 洗练词条',
      ico: 'ic_blade.png', sealId: 'xx-hub-enhance', sealTxt: '无',
      body: `      <section class="card wide" id="xx-enhance-sec">
        <h2>强化 · 洗练</h2>
        <div class="enh" id="xx-enhance"></div>
        <p class="farm-msg" id="xx-enh-msg" aria-live="polite"></p>
      </section>` },
    { key: 'xx-dongtian-sec', view: 'dong_dongtian', name: '洞天开辟', note: '五方洞天 · 奉主洞',
      ico: 'ic_cave2.png', sealId: 'xx-hub-dongtian', sealTxt: '0/5', also: ['xx-dongtian'],
      body: `      <section class="card wide" id="xx-dongtian-sec">
        <h2>五方洞天</h2>
        <div class="dt" id="xx-dongtian"></div>
        <p class="hint">五方洞天各三重（初辟 / 灵脉 / 洞天）；奉一座为主洞，其效 ×1.5，可随时改奉。</p>
      </section>` },
    { key: 'xx-array-sec', view: 'dong_array', name: '聚灵阵', note: '灵脉吐纳 · 灵石产出',
      ico: 'ic_cave2.png', sealId: 'xx-hub-array', sealTxt: 'Lv.0',
      body: `      <section class="card wide" id="xx-array-sec">
        <h2>聚灵阵</h2>
        <div class="stats">
          <div class="stat"><span>当前等级</span><b id="xx-array-lv">Lv.0</b></div>
          <div class="stat"><span>灵石产出</span><b id="xx-array-cur">×1.00</b></div>
          <div class="stat"><span>下一级</span><b id="xx-array-next">×1.06</b></div>
        </div>
        <div class="craft-up"><span id="xx-array-cost">—</span><button type="button" class="field-btn" id="xx-array-upbtn">升级</button></div>
        <p class="farm-msg" id="xx-array-msg" aria-live="polite"></p>
        <p class="hint">聚灵阵每级让洞府灵石产出 ×1.06，满级封顶；点一次升一级，费用随等级上浮。</p>
      </section>` },
    { key: 'xx-ups-sec', view: 'dong_ups', name: '洞府设施', note: '汇总镜像 · 点行进页',
      ico: 'ic_pagoda.png', sealId: 'xx-hub-ups', sealTxt: '汇总', also: ['xx-ups'],
      body: `      <section class="card wide" id="xx-ups-sec">
        <h2>洞府设施 · 汇总</h2>
        <div class="ups" id="xx-ups"></div>
        <p class="hint">这里只报等级与下一级收益；升级动作已搬回各自页面，点「进页」去办。</p>
      </section>` }
  ]
});
