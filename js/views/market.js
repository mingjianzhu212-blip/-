// views/market.js — 坊市 · 交易（第 88 轮 B：一格一页，hub + 四个独立页）
// 由 router 动态注入 #panel-host；骨架见 views/kit.js。
window.VIEWS = window.VIEWS || {};

HUBKIT.define({
  panel: 'market',
  title: '坊市 · 交易',
  sub: '价格随境界水涨船高',
  crumb: '坊市',
  secs: [
    { key: 'mk-rate', view: 'market_rate', name: '今日行情', note: '买卖两档水位 · 每日换',
      ico: 'ic_scroll.png', sealId: 'xx-hub-mk-rate', sealTxt: '×1.00',
      body: `      <section class="card wide" id="mk-rate-sec">
        <h2>今日行情</h2>
        <div class="mk-rate" id="mk-rate"></div>
      </section>` },
    { key: 'mk-sell', view: 'market_sell', name: '寄售', note: '背包存货换灵石',
      ico: 'ic_box.png', sealId: 'xx-hub-mk-sell',
      body: `      <section class="card wide" id="mk-sell-sec">
        <h2>寄售</h2>
        <div class="mk-sell" id="mk-sell"></div>
      </section>` },
    { key: 'mk-goods', view: 'market_goods', name: '今日货架', note: '限量来货 · 买定即止',
      ico: 'bld_market.png', sealId: 'xx-hub-mk-goods',
      body: `      <section class="card wide" id="mk-goods-sec">
        <h2>今日货架</h2>
        <div class="mk-goods" id="mk-goods"></div>
        <p class="hint">货架按境界上货，价随境界水涨船高 · 每日重新开张。</p>
      </section>` },
    { key: 'mk-tianji', also: ['xx-tianji'], view: 'market_tianji', name: '天机阁',
      note: '保底道具 · 榨走三成五资产',
      ico: 'bld_tianji.png', sealId: 'xx-hub-tj',
      body: `      <section class="card wide" id="xx-tianji">
        <h2>天机阁</h2>
        <p class="hint">悟道值 <b id="tj-wisdom">0</b> · 此处与坊市<b>不在一个维度</b>：保底道具按
          <b>当前总资产 35%~45% 的灵石 + 大额悟道值</b>双扣（悟道价随境界 ×<b id="tj-mul">1.00</b>）——囤多少灵石都一口榨走三到五成。
          悟道值仅由<span class="tj-src">任务、签到、突破失败</span>获得。护心镜每周限购 2 次；护道阵法每周限购 1 次；天机令每大境界限 1 次。</p>
        <div class="mk-goods" id="tj-goods"></div>
        <h2 class="tj-bp-title">图纸 · 每周自选 <small id="tj-bp-state">本周 0/1</small></h2>
        <p class="hint">每周可自选 1 张图纸，价格 = 当前一层需求 ×3 灵石 + 500 悟道值；图纸锻造只跳炼器坊等级与器师阶，材料与成功率照卡。</p>
        <div class="mk-goods" id="tj-bp"></div>
      </section>` }
  ]
});
