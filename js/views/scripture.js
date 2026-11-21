// views/scripture.js — 藏经阁 · 修炼（第 88 轮 B：五页各管一事）
// 由 router 动态注入 #panel-host；骨架见 views/kit.js。
window.VIEWS = window.VIEWS || {};

HUBKIT.define({
  panel: 'xiu',
  title: '藏经阁 · 修炼',
  sub: '身份 · 修为 · 修炼 · 任务 · 日志',
  crumb: '藏经阁',
  secs: [
    { key: 'xx-identity', view: 'xiu_identity', name: '道体身份', note: '道号 · 境界 · 灵石',
      ico: 'ic_sit.png', sealId: 'xx-hub-xiu-id', sealTxt: '炼气一层',
      body: `      <section class="card identity wide">
        <div class="id-top">
          <div class="id-avatar" id="xx-avatar"></div>
          <div class="id-main">
            <div class="id-name" id="xx-name">无名散修</div>
            <div class="realm">
              <div class="realm-name" id="xx-rank">炼气一层</div>
              <div class="root-badge" id="xx-root" data-tone="杂灵根">杂灵根</div>
            </div>
          </div>
        </div>
        <div class="stats">
          <div class="stat"><span>灵石</span><b class="gold" id="xx-stone">0</b></div>
          <div class="stat"><span>修炼速度</span><b class="teal" id="xx-rate">0/秒</b></div>
          <div class="stat"><span>道韵</span><b class="purple" id="xx-dao">0</b></div>
          <div class="stat"><span>战力</span><b id="xx-id-pow">0</b></div>
        </div>
        <div class="id-path" id="xx-id-path"></div>
      </section>` },
    { key: 'xx-gong-sec', view: 'xiu_gong', name: '功法', note: '引气 · 凝神 · 化神',
      ico: 'gong1.png', sealId: 'xx-hub-gong', sealTxt: 'Lv.0',
      body: `      <section class="card wide" id="xx-gong-sec">
        <h2>功法参悟</h2>
        <div class="ups" id="xx-gong-list"></div>
        <p class="farm-msg" id="xx-gong-msg" aria-live="polite"></p>
        <p class="hint">每门功法每级让修炼速度按自身倍率上浮；境界到了才参得动下一门。</p>
      </section>` },
    { key: 'xx-cult', view: 'xiu_cult', name: '修为 · 突破', note: '行功圆满，方可破境',
      ico: 'ic_taiji.png', sealId: 'xx-hub-xiu-cult', sealTxt: '0%',
      body: `      <section class="card wide">
        <div class="p-head"><span>本境修为（存量）</span><b id="xx-exptxt">0 / 40</b></div>
        <div class="p-sub" id="xx-expgap">距下一境还差 40</div>
        <div class="p-sub" id="xx-rank-bonus">境界加成 修炼 ×1.00</div>
        <div class="bar"><i id="xx-expbar"></i></div>
        <button class="btn-break" id="xx-break" disabled>修为不足</button>
        <!-- 突破辅助道具（护道阵法主动勾选 +15%；天机令必定成功；护心镜被动，失败自动返还 50%） -->
        <div class="break-guards" id="xx-guards">
          <label class="bg-item" title="本次突破基础成功率固定 +15%，一用即耗">
            <input type="checkbox" id="xx-use-array"><span>🌀 护道阵法 <small id="xx-arr-n">×0</small> <em>+15%</em></span>
          </label>
          <label class="bg-item" title="本次突破必定成功（每大境界限兑 1 次）">
            <input type="checkbox" id="xx-use-tianji"><span>🧿 天机令 <small id="xx-tj-n">×0</small> <em>必成</em></span>
          </label>
          <span class="bg-passive">🛡️ 护心镜：失败自动返还 50% 反噬修为</span>
        </div>
        <p class="hint" id="xx-break-tip"></p>
      </section>
      <p class="offline-tip" id="xx-offline-tip"></p>` },
    { key: 'xx-acts', view: 'xiu_acts', name: '修炼', note: '打坐 · 采药 · 历练 · 顿悟',
      ico: 'ic_train.png', sealTxt: '日课',
      body: `      <section class="card wide">
        <div class="acts" id="xx-actions"></div>
      </section>` },
    { key: 'xx-quest', view: 'xiu_quest', name: '任务', note: '主线与支线 · 领赏在这里',
      ico: 'rail_quest.png', sealId: 'xx-hub-xiu-quest', sealTxt: '待领',
      body: `      <section class="card wide">
        <div class="quest-list" id="xx-quest"></div>
      </section>` },
    { key: 'xx-log', view: 'xiu_log', name: '修行日志', note: '近来的事，一件一件记着',
      ico: 'ic_scroll.png', sealId: 'xx-hub-xiu-log', sealTxt: '近事',
      body: `      <section class="card wide">
        <div class="log" id="xx-log"></div>
      </section>` }
  ]
});
