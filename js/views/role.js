// views/role.js — 人物 · 装备（第 88 轮 B：五页各管一事）
// 由 router 动态注入 #panel-host；骨架见 views/kit.js。
// 左侧属性区 + 右侧三个暗金圆形装备槽；槽位由 game.js 的 renderRole() 填充。
window.VIEWS = window.VIEWS || {};

HUBKIT.define({
  panel: 'role',
  title: '人物 · 装备',
  sub: '道体 · 装备',
  crumb: '人物',
  secs: [
    { key: 'xx-role-equip', view: 'role_equip', name: '道体 · 法宝', note: '立绘 · 装备 · 四族法宝',
      ico: 'ic_blade.png', tag: 'xx-role-pow', sealId: 'xx-hub-role-equip', sealTxt: '0/3',
      body: `      <section class="card wide char-sheet" id="char-sheet">
        <div class="cs-top">
          <div class="cs-portrait" id="xx-role-figure" aria-hidden="true"></div>
          <div class="cs-side">
            <div class="cs-id"><b id="cs-name">无名散修</b><span id="cs-rank">炼气一层</span></div>
            <div class="cs-slots">
              <div class="equip-wrap">
                <div class="equip-slot" data-slot="weapon"><span class="es-body" id="es-weapon"></span></div>
                <small class="es-cap">武器</small>
              </div>
              <div class="equip-wrap">
                <div class="equip-slot" data-slot="armor"><span class="es-body" id="es-armor"></span></div>
                <small class="es-cap">防具</small>
              </div>
              <div class="equip-wrap">
                <div class="equip-slot" data-slot="accessory"><span class="es-body" id="es-accessory"></span></div>
                <small class="es-cap">饰品</small>
              </div>
            </div>
            <div class="cs-arts" id="xx-role-arts"></div>
            <button class="cs-auto" id="xx-role-auto" type="button">一键装备</button>
          </div>
        </div>
        <div class="cs-bars">
          <div class="cs-bar"><span>修为</span><div class="bar"><i id="cs-expbar"></i></div><b id="cs-exptxt">0 / 0</b></div>
          <div class="cs-bar"><span>寿元</span><div class="bar"><i id="cs-lifebar"></i></div><b id="cs-lifetxt">—</b></div>
        </div>
        <p class="hint">装备点圈即可穿/卸；四族兽魂与旧法宝同族只取最高阶。法宝动作在洞府炼器坊，本页不设传送门。</p>
      </section>` },
    { key: 'xx-role-journal', view: 'role_journal', name: '修行札记', note: '这些年干过多少事',
      ico: 'ic_scroll.png', sealTxt: '历年',
      body: `      <section class="card wide">
        <div class="stats" id="xx-role-journal"></div>
        <p class="hint">点点滴滴，都记在这本册子上。</p>
      </section>` },
    { key: 'xx-role-miles', view: 'role_miles', name: '仙途道碑', note: '立碑自动记功',
      ico: 'ic_pagoda.png', sealId: 'xx-hub-role-miles', sealTxt: '0 碑',
      body: `      <section class="card wide">
        <h2>已立之碑 <span class="miles-sub" id="xx-role-miles-sub"></span></h2>
        <div class="miles" id="xx-role-miles"></div>
        <p class="hint">立碑自动记功，不必来领。未立的碑，只留一句暗示。</p>
      </section>` },
    { key: 'xx-role-wu', view: 'role_wu', name: '悟道', note: '与天机阁抢同一笔悟道值',
      ico: 'ic_candle.png', sealId: 'xx-hub-role-wu', sealTxt: '0 悟',
      body: `      <section class="card wide">
        <h2>悟道树 <span class="wu-sub">悟道值 · 天机阁与这里花的是同一笔</span></h2>
        <div class="wu-box" id="xx-role-wu"></div>
      </section>` },
    { key: 'xx-role-story', view: 'role_story', name: '断天门', note: '修行到某一步它自己会来',
      ico: 'ic_gate.png', sealId: 'xx-hub-role-story', sealTxt: '0 段',
      body: `      <section class="card wide">
        <h2>断天门 <span class="sto-sub" id="xx-role-story-sub"></span></h2>
        <div class="sto-log" id="xx-role-story"></div>
        <p class="hint">修行到某一步，它自己会来——不必来领。走过的段落记在这里。</p>
      </section>` },
    /* 识人 · 沈碑（切片 2b）：独立对话子页面。这里只搭空壳与 id，
       全部内容（开场白快照 / 话题 / 选项 / 回复）由 game.js 的 renderNpcPage() 现填，
       且只在「进入页面」与「点选项」两个时机渲染，不挂 500ms 的常规 render。
       立绘（切片 2d）：ui/avatar/npc_stele_full.jpg 是 540×1170 全身水墨图，
       容器同比例 240×520 完整展示；.npc-seal 留在图后作加载失败兜底。 */
    { key: 'xx-role-npc', view: 'role_npc', name: '识人 · 沈碑', note: '守碑老吏 · 他记得每一世',
      ico: 'ic_pagoda.png', sealId: 'xx-hub-role-npc', sealTxt: '0/5',
      body: `      <section class="card wide npc-card" id="xx-role-npc-root">
        <div class="mf-stage npc-stage npc-hero">
          <div class="mf-portrait npc-portrait" id="npc-portrait" aria-hidden="true">
            <img class="npc-pic" data-npc-art="stele" src="ui/avatar/npc_stele_full.jpg" alt="">
            <span class="npc-seal">碑</span>
          </div>
          <div class="mf-head npc-head">
            <h2 id="npc-name">沈碑</h2>
            <small id="npc-title">守碑老吏</small>
            <b class="mf-dao npc-rel" id="npc-rel"></b>
          </div>
        </div>
        <div class="npc-mem" id="npc-mem"></div>
        <div class="npc-greet" id="npc-greet"></div>
        <h2 class="npc-h">话题 <span class="npc-h-sub" id="npc-topics-sub"></span></h2>
        <div class="sto-log npc-topics" id="npc-topics"></div>
        <div class="npc-topic-lines" id="npc-topic-lines"></div>
        <div class="mc-opts npc-opts" id="npc-opts"></div>
        <div class="npc-reply" id="npc-reply" hidden></div>
        <p class="hint">他记得你说过的每一句话。离开这一页，回复就收回记忆里。<br>
        话题解锁：先听「碑」把话说开；「三千年」听完才轮到「山外」；关系到 15，「他为何守着」才开。<br>
        关系：第一次谈按选项给的分；重复谈同一件事时，积极/中性只 +1，负面与道别不涨。</p>
      </section>` }
  ]
});

/* batch10：人物装备直开页删掉名实不符的右上「人物」按钮，只保留左上明确返回。
   旧 role_equip 深链也同一处理；其余人物子页的面包屑仍回人物 hub。 */
VIEWS.role_equip.html = VIEWS.role_equip.html.replace(/<button class="crumb" data-go-hub>人物<\/button>/, '');
VIEWS.role = {
  title:'人物 · 装备',
  html:VIEWS.role_equip.html
};
