// views/life.js — 寿元 · 坐化 · 转世（第 96 轮：骨架）
// 由 router 动态注入 #panel-host；骨架见 views/kit.js。
// 入口是顶栏那颗寿元 chip（router 里绑的），不进城镇建筑表——寿元跟着人走，不跟着地方走。
// 数字全部由 game.js 的 renderLife() 现填，这里只搭空壳。
window.VIEWS = window.VIEWS || {};

HUBKIT.define({
  panel: 'life',
  title: '寿元 · 转世',
  sub: '这一世还剩几年 · 前几世留下了什么',
  crumb: '寿元',
  foot: '寿元尽了就是坐化，坐化了就转世——道统一世一世往下传。',
  secs: [
    { key: 'xx-life-now', view: 'life_now', name: '本世寿元', note: '还剩几年 · 坐化与转世',
      ico: 'ic_candle.png', tag: 'xx-life-now-tag', sealId: 'xx-hub-life-now', sealTxt: '—',
      body: `      <section class="card wide life-card">
        <div class="life-wick" id="xx-life-wick" aria-hidden="true"><i class="lw-flame"></i><i class="lw-body"></i></div>
        <div class="life-nums">
          <b id="xx-life-age">0</b>
          <span class="ln-cap">岁 · 上限 <i id="xx-life-max">120</i> 年</span>
          <small id="xx-life-left"></small>
        </div>
        <div class="life-bar" role="img" aria-label="寿元余量"><i id="xx-life-barfill"></i></div>
        <div class="life-stages" id="xx-life-stages"></div>
        <div class="life-acts">
          <button class="life-btn" id="xx-life-enable" type="button" hidden>开启寿元</button>
          <button class="life-btn zuo" id="xx-life-reborn" type="button" hidden>转世续道统</button>
        </div>
        <div class="life-sum" id="xx-life-sum" hidden>
          <h3>坐化结算 <small>这一世的账</small></h3>
          <div class="sum-row"><i>享年</i><b id="xx-sum-age">—</b></div>
          <div class="sum-row"><i>止步境界</i><b id="xx-sum-rank">—</b></div>
          <div class="sum-row"><i>突破次数</i><b id="xx-sum-brk">—</b></div>
          <div class="sum-picks" id="xx-life-picks"></div>
          <p class="sum-tip" id="xx-life-picktip"></p>
        </div>
        <p class="hint" id="xx-life-hint"></p>
        <!-- 切片 2f「碑外一线」：沈碑那句话听过之后才由 renderLife() 填字显形，起步恒 hidden -->
        <p class="hint" id="npc-echo-life" hidden></p>
      </section>` },
    /* 心魔照镜（第 99 轮）：镜里站着上一世的你。战力、文案、能不能打全由 renderMirror() 现填 */
    { key: 'xx-life-mirror', view: 'life_mirror', name: '心魔照镜', note: '与上一世的你一战',
      ico: 'ic_taiji.png', tag: 'xx-life-mirror-tag', sealId: 'xx-hub-life-mirror', sealTxt: '初世',
      body: `      <section class="card wide mf-card">
        <div class="mf-stage">
          <div class="mf-portrait" id="xx-mf-portrait" data-state="none" aria-hidden="true">
            <img id="xx-mf-img" alt="">
            <span class="mf-mask">心魔</span>
          </div>
          <div class="mf-head">
            <h2 id="xx-mf-name">心魔 · 尚未成形</h2>
            <small id="xx-mf-sub">初世没有心魔</small>
            <b class="mf-dao" id="xx-mf-dao">道心 · 照镜 0/5 胜 · 修炼 ×1.00</b>
          </div>
        </div>
        <div class="mf-vs" id="xx-mf-vs" data-state="none">
          <div class="mf-side you">
            <i>你</i><b id="xx-mf-you">0</b>
            <span class="mf-bar"><i id="xx-mf-youbar"></i></span>
          </div>
          <div class="mf-mark">对</div>
          <div class="mf-side foe">
            <i>心魔</i><b id="xx-mf-foe">0</b>
            <span class="mf-bar"><i id="xx-mf-foebar"></i></span>
            <small class="mf-need" id="xx-mf-need"></small>
          </div>
        </div>
        <!-- 守心三息（第 104 轮）：照镜之前的三次抉择，文案与状态由 renderCalm() 现填 -->
        <div class="mf-calm" id="xx-mf-calm" data-state="none">
          <div class="mc-head"><b>守心 · 三息</b><small id="xx-mf-calm-tag">第 1 息</small></div>
          <p class="mc-ask" id="xx-mf-calm-ask"></p>
          <div class="mc-pips" id="xx-mf-calm-pips" aria-hidden="true"></div>
          <div class="mc-opts" id="xx-mf-calm-opts">
            <button type="button" class="mc-opt" data-calm="hold"><span>默守</span><small></small></button>
            <button type="button" class="mc-opt" data-calm="break"><span>断喝</span><small></small></button>
          </div>
          <p class="mc-note" id="xx-mf-calm-note"></p>
        </div>
        <button class="mf-fight" id="xx-mf-fight" type="button" data-state="none">尚无前世</button>
        <p class="hint" id="xx-mf-tip"></p>
      </section>` },
    { key: 'xx-life-legacy', view: 'life_legacy', name: '道统世系', note: '转过几世 · 留下什么',
      ico: 'ic_scroll.png', tag: 'xx-life-legacy-tag', sealId: 'xx-hub-life-legacy', sealTxt: '初世',
      body: `      <section class="card wide">
        <h2>道统 <span class="leg-sub" id="xx-life-gens"></span></h2>
        <div class="leg-list" id="xx-life-leglist"></div>
        <p class="hint">每转一世，修炼速度永久 +10%（与道韵各算一路）。坐化时挑中的那件法宝会作为遗物随你入新世。</p>
        <h2 class="leg-h">历代世系 <span class="leg-sub">最近 12 世</span></h2>
        <div class="leg-list leg-hist" id="xx-life-hist"></div>
        <p class="hint">坐化时从三件遗物里挑一件带走；其余两件随那一世埋掉。每行记的是那一世的止步境界、享年与遗物。</p>
      </section>` }
  ]
});
