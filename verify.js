'use strict';
/* 九霄问道 · 端到端验证 + 截图（验证后此脚本可删） */
const { execFileSync } = require('node:child_process');
const { execEdge } = require('./tools/edge-run');
const fs = require('node:fs');
const os = require('node:os');
/* 2026-10-26 用户要求：临时产物（浏览器 profile / 截图 / 中间 HTML）一律落 D 盘，不写 C 盘；D 不可用时退回系统 temp。 */
const SCRATCH = (function(){ try{ const p = 'D:/xx-scratch'; fs.mkdirSync(p, { recursive: true }); return p; }catch(e){ return os.tmpdir(); } })();
const path = require('node:path');
const PAGE = require('./tools/page');

const ROOT = path.resolve(__dirname);
const SRC = path.join(ROOT, 'index.html');
/* 探针页落 D 盘，靠 <base href> 把相对路径拉回项目根（见 tools/page.js 头注）。 */
const TMP = PAGE.SCRATCH;
PAGE.use(ROOT);
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find(p => fs.existsSync(p));

let pass = 0, fail = 0;
const ok = (c, l, e) => { if (c) { pass++; console.log('  ✓ ' + l); } else { fail++; console.log('  ✗ ' + l + (e ? '  →  ' + e : '')); } };

const DIAG = `
<script>
(async function(){
    const out=[]; const L=(k,v)=>out.push(k+'='+v);
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    await sleep(400);
    try{
    /* 测试档是全新存档，boot 会自动起「太虚真人」引导（气泡 + 400ms tick + 未教系统变灰）——
       先把台面撤掉，让其余用例在干净状态下跑；引导自己的流程在本段末尾（guide* 用例）单独重开。
       换代说明：旧 js/tutorial.js（tut-mask / tut-tip / localStorage.hasFinishedTutorial）已从
       index.html 卸载，现行引导是 js/guide_taixu.js 的 window.Guide，进度挂在 S.guide 随主存档走。
       撤台口径：把 S.guide 写成「已完结」再 Guide.reset()——reset 会停定时器、摘气泡、清灰置类，
       然后重绑到这份 done 档并 init()（init 首行幂等），全程不写日志、不留可见 UI。 */
    if (window.Guide) {
      try {
        XX._s.guide = { step: 7, done: true, skipped: false, started: true,
                        flags: {}, rewardClaims: { taixu_intro_dan_v1: true }, toldSystems: {} };
        Guide.reset();
      } catch (e) { L('guidePrewrap', String((e && e.message) || e).slice(0, 60)); }
    }
    /* tutorial 时代的旧钩子不得再被引用：留着就是换代没拆干净 */
    L('legacyTutorialApi', typeof window.Tutorial);
    /* 第 96 轮起新档寿元默认开：但老用例里那些「rank 24 + 30 小时离线」的合成账会一口气
       烧掉几百年寿元，回到低境界后下一个心跳就坐化、把路由拽去寿元页，中段用例全花。
       探针开头按老档语义关掉寿元；寿元自己的用例（lf*）再单独开。 */
    XX._s.life = { age: 0, on: false }; XX._s.zuo = 0;
    /* 第 105 轮：入门八事纸签会随最新一帧的统计自动推进、还带修为/灵石奖励。
       后面大量用例在精确比对 stone / exp / log[0]，先把八事标成「已了」让它们跑在原来的账上；
       纸签自己的用例（tr*）集中在 DIAG 末尾，各自重置。 */
    XX._s.trail = { i: XX._trail.max }; XX.save();
    /* 第 106 轮的「道途」同理会在一堆用例把 rank 直接拉到 22 时一路补发奖励，污染精确账。
       同样先标成已走完；道途自己的用例（dt2*）在 DIAG 末尾自己重置。 */
    XX._s.trail2 = { i: XX._trail2.max };
    L('blds', document.querySelectorAll('.bld').length);
    L('sceneActive', document.getElementById('page-scene').classList.contains('active'));
    // 动态注入路由：藏经阁元素需先进入藏经阁 view 才在 DOM 中
    /* ---- 第 88 轮 B · 藏经阁拆页：hub 五格，身份 / 修为 / 修炼 / 任务 / 日志各自一页 ---- */
    window.switchTab('xiu');
    L('xiuHubCells', document.querySelectorAll('#page-xiu .hub-nav [data-jump]').length);   // 6（第三批 B5：功法页独立一格）
    L('xiuHubCards', document.querySelectorAll('#page-xiu .panel-body > .card').length);     // 0
    L('xiuHubSealRank', document.getElementById('xx-hub-xiu-id').textContent);                 // 炼气一层
    window.switchTab('xiu', 'xx-quest');           /* 木牌带的 data-scroll 直达任务页 */
    L('questDeep', window.ROUTER.current());                                                   // xiu_quest
    L('questDeepDepth', window.ROUTER.depth());                                                // 2（底下压着 hub）
    L('questRows', document.querySelectorAll('#xx-quest .quest').length);
    window.switchTab('xiu_identity');
    L('rank', document.getElementById('xx-rank').textContent);
    window.switchTab('xiu_acts');
    L('acts', document.querySelectorAll('.act').length);

    // ---- 镇妖塔（[data-bld] 在 scene 常驻，querySelector 不受隐藏影响）----
    L('towerBld', !!document.querySelector('[data-bld="tower"]'));
    L('battleModalInDom', !!document.getElementById('battle-modal'));
    const rankBak = XX._s.rank;
    XX._setBattleAnim(false);   /* 本段先测结算数值：关演出，选门同步出结果 */
    /* 入塔门槛（与旧版一致）：境界压低 + 层数拉高 → 战力不足，层数不变、提示「实力不济」、
       而且不占着那一局（入塔失败不留 run） */
    XX._s.rank = 0; XX._s.tower = 5; XX._s.towerMax = 0; XX._s.log = [];
    XX._towerEnter();
    L('towerFailFloor', XX._s.tower);
    L('towerFailMsg', (XX._s.log[0] || {}).t || '');
    L('towerFailRun', XX._towerRun() ? 'yes' : 'no');
    /* 入塔：战力够 → 一局开张，三扇门各一扇 */
    XX._s.rank = 8; XX._s.tower = 1; XX._s.towerMax = 0;
    XX._s.bag = []; XX._s.stone = 0; XX._s.log = [];
    XX._towerEnter();
    const run0 = XX._towerRun() || { doors: [], step: -1 };
    L('trunOpen', run0.step + '/' + run0.doors.length);
    L('trunDoors', run0.doors.slice().sort().join(','));
    L('trunBrk', String(run0.brk));
    /* 镇守门：通关 → 层数+1、灵石与材料入账（背包 + 顶部资源栏同步） */
    XX._towerDoor('fight');
    L('towerAfterWin', XX._s.tower + 'of' + XX._s.towerMax);
    L('towerWinStone', XX._s.stone);
    L('towerWinBag', XX._s.bag.length);
    L('towerWinMsg', (XX._s.log[0] || {}).t || '');
    L('towerTopbar', (document.getElementById('sc-stone') || {}).textContent || '');
    L('trunStep1', String((XX._towerRun() || {}).step));
    /* 藏宝室：不推层，给灵草/矿石，并得一枚塔内符（跨步保留在本局账本里） */
    const rv = XX._towerRun(); rv.doors = ['vault', 'fight', 'elite']; XX._render();
    const fl0 = XX._s.tower, hb0 = XX._s.herb, ob0 = XX._s.ore, ch0 = (rv.res.charm | 0);
    XX._towerDoor('vault');
    L('vaultFloor', XX._s.tower === fl0 ? 'same' : 'moved');
    L('vaultHerb', XX._s.herb > hb0 ? 'up' : 'flat');
    L('vaultOre', XX._s.ore > ob0 ? 'up' : 'flat');
    L('vaultCharm', String(((XX._towerRun() || {}).res.charm | 0) - ch0));
    /* 精锐门：战力 ×1.35 照过 → 灵石更厚、材料 ×2、另得一符 */
    const re = XX._towerRun(); re.doors = ['elite', 'fight', 'vault']; XX._render();
    const stE = XX._s.stone, bgE = XX._s.bag.length;
    XX._towerDoor('elite');
    L('eliteStone', String(XX._s.stone - stE));
    L('eliteBag', String(XX._s.bag.length - bgE));
    /* 走满五步 → 出塔，账本落 trunLast，进行中的局清空 */
    XX._s.trun = null; XX._towerEnter();
    for(let i = 0; i < 5; i++){
      const rr = XX._towerRun(); if(!rr) break;
      rr.doors = ['vault', 'fight', 'elite']; XX._towerDoor('vault');
    }
    const tlA = XX._towerLast() || {};
    L('trunDone', XX._towerRun() ? 'open' : 'closed');
    L('trunLastWhy', tlA.why + '/' + tlA.steps);
    /* 战力远远不够的精锐门：按不动，但「差多少」照写在门里（不把这条路藏起来） */
    XX._s.trun = null; XX._towerEnter(); XX._s.tower = 200;
    ROUTER.open('tower');                      /* 门卡是塔页 DOM，得先把页开出来才量得到 */
    XX._render();
    const edEl = document.querySelector('.tw-door.elite');
    L('eliteLocked', edEl && edEl.disabled ? 'yes' : 'no');
    L('eliteLockedTxt', (edEl ? edEl.textContent : '').replace(/\s+/g, ''));
    /* 演出分支：开演出再入塔选门 → 弹窗打开、层数与守卫填充；点「跳过」照常结算 */
    XX._setBattleAnim(true);
    XX._s.trun = null; XX._s.tower = 3; XX._s.towerMax = 2; XX._s.stone = 0; XX._s.bag = []; XX._s.log = [];
    XX._towerEnter();
    XX._towerDoor('fight');
    L('battleShown', document.getElementById('battle-modal').classList.contains('hidden') ? 'no' : 'yes');
    L('battleFloor', document.getElementById('bt-floor').textContent);
    L('battleMobNamed', (document.getElementById('bt-mname').textContent || '').length > 0 ? 'yes' : 'no');
    /* 第 84 轮：两侧形象从「圆框 + 大字」换成真立绘 / 妖兽图，探针改查 img.src */
    const btP = document.getElementById('bt-pavatar'), btM = document.getElementById('bt-mavatar');
    L('btMobAvImg', btM && btM.tagName === 'IMG' && btM.src.indexOf('/beast_') >= 0 ? 'yes' : 'no');
    L('btPavImg', btP && btP.tagName === 'IMG' && btP.src.indexOf('/hero_') >= 0 ? 'yes' : 'no');
    L('btPavOfSex', btP ? btP.src.split('/').pop() : '');
    /* 壳/芯解耦（第 84 轮）：投影 + 换色皮挂外层壳 .bt-figwrap，动画只碰图片本体。
       这样受击动画播到中途时，壳上的基线滤镜必须还在——分层的全部意义就是这条。
       旧写法把两件事压在同一层，动画每帧都得重写整条 filter，漏一帧就掉阴影。 */
    const btWrap = document.getElementById('bt-mwrap');
    const btWrapF = btWrap ? getComputedStyle(btWrap).filter : '';
    L('btMHueVar', btWrapF.indexOf('hue-rotate') >= 0 ? 'yes' : 'no');
    L('btWrapShadow', btWrapF.indexOf('drop-shadow') >= 0 ? 'yes' : 'no');
    L('btBossCls', btM ? String(btM.classList.contains('boss')) : '');
    document.getElementById('bt-mside').classList.add('hit');
    L('btHitAnim', getComputedStyle(btM).animationName);
    L('btWrapWhileHit', (function(){ const f = getComputedStyle(btWrap).filter;
      return f.indexOf('hue-rotate') >= 0 && f.indexOf('drop-shadow') >= 0 ? 'yes' : 'no'; })());
    document.getElementById('bt-mside').classList.remove('hit');
    L('btHaloN', String(document.querySelectorAll('.bt-figure .bt-halo').length));
    L('btTrailN', String(document.querySelectorAll('.bt-bar .bt-trail').length));
    L('btBarLow', String(document.getElementById('bt-mhp').parentNode.className.indexOf('low') >= 0));
    /* 命中迸光是 .bt-side.hit 时 .bt-figure::before 上的一次性动画，截图拍不准它，
       就直接查计算样式：动画名 + 放射线背景 + 环形遮罩三样齐了才算真能亮 */
    document.getElementById('bt-mside').classList.add('hit');
    const btBurst = getComputedStyle(document.querySelector('#bt-mside .bt-figure'), '::before');
    L('btBurstAnim', btBurst.animationName);
    L('btBurstRays', /conic-gradient/.test(btBurst.backgroundImage) ? 'yes' : 'no');
    L('btBurstRing', /radial-gradient/.test(btBurst.maskImage || btBurst.webkitMaskImage || '') ? 'yes' : 'no');
    document.getElementById('bt-mside').classList.remove('hit');
    L('battleSlash', !!document.getElementById('bt-slash') ? 'yes' : 'no');                                  // 剑光元素就位
    /* 中央半月剑气弧 + 三流派配色 */
    L('btArc', !!document.querySelector('.bt-vs .bt-vs-arc') ? 'yes' : 'no');
    L('btVsTxt', (document.querySelector('.bt-vs-txt') || {}).textContent || '');
    L('btVsSealOp', (() => { const e = document.querySelector('.bt-vs-txt'); return e ? getComputedStyle(e).opacity : ''; })());
    L('aura0', XX._auraCls() || 'default');                                    // 默认青莲（无 class）
    L('auraArc0', document.getElementById('bt-arena').className);
    XX._cycleAura(); L('aura1', XX._auraCls() || 'default');
    L('auraArc1', document.getElementById('bt-arena').className);
    XX._cycleAura(); L('aura2', XX._auraCls() || 'default');
    XX._cycleAura(); L('aura3', XX._auraCls() || 'default');                   // 循环回青莲
    L('auraSaved', XX._s.swordAura);
    /* 第 94 轮 · 剑芒/剑气：三流派各给一档形状（旧版切档只换个色） */
    const arcRx = () => getComputedStyle(document.getElementById('bt-arena')).getPropertyValue('--arc-rx').trim();
    const arcRy = () => getComputedStyle(document.getElementById('bt-arena')).getPropertyValue('--arc-ry').trim();
    L('auraShape0', arcRx() + '/' + arcRy());
    XX._cycleAura(); L('auraShape1', arcRx() + '/' + arcRy());
    XX._cycleAura(); L('auraShape2', arcRx() + '/' + arcRy());
    XX._cycleAura();
    const arcB = document.querySelector('.bt-vs-arc');
    const arcMask = arcB ? (getComputedStyle(arcB, '::before').maskImage || getComputedStyle(arcB, '::before').webkitMaskImage || '') : '';
    const arcHead = arcMask.slice(arcMask.indexOf('radial-gradient(') + 16);
    /* 计算值会把「ellipse 38px 58px」归一化掉关键字，只剩两个长度——所以按「两个半径且不相等」判
       ⚠️ DIAG 是模板字符串，正则里的反斜杠会被字符串层吃掉，这里只用字符类不写 \d */
    const arcRR = /^([0-9.]+)px ([0-9.]+)px/.exec(arcHead) || [];
    L('arcEllipse', arcRR.length === 3 ? arcRR[1] + 'x' + arcRR[2] : 'none');   /* 环带是竖长椭圆，不是正圆 */
    L('arcBreatheDur', arcB ? getComputedStyle(arcB).animationDuration : '');    /* 三档呼吸速度不同 */
    const slashKid = document.querySelector('#bt-slash .bt-slash-b');
    const sl = document.getElementById('bt-slash');
    if (sl) sl.classList.add('fly');
    /* ⚠️ DIAG 的字段之间用 " | " 拼接，值里不能再出现竖线 */
    L('slashKid', !slashKid ? 'none' : (getComputedStyle(slashKid).animationName + '@'
      + Math.round(slashKid.getBoundingClientRect().width) + 'x' + Math.round(slashKid.getBoundingClientRect().height)));
    L('slashBorder', sl ? (getComputedStyle(sl, '::before').borderTopWidth + '/'
      + getComputedStyle(sl, '::before').borderRightWidth) : '');             /* 上厚右薄 = 收尖 */
    if (sl) sl.classList.remove('fly');
    /* 淡墨云雾背景层：三层纯 CSS 径向渐变晕染（禁止图片、禁止 filter:blur） */
    const mistEl = document.querySelector('.scene-mist');
    L('mist', !!mistEl ? 'yes' : 'no');
    const mcs = mistEl ? getComputedStyle(mistEl) : null;
    const mcb = mistEl ? getComputedStyle(mistEl, '::before') : null;
    const mca = mistEl ? getComputedStyle(mistEl, '::after') : null;
    L('mistZ', mcs ? mcs.zIndex : '');
    L('mistPe', mcs ? mcs.pointerEvents : '');
    L('mistFilter', mcs ? mcs.filter : '');
    L('mistAnim', mcs ? mcs.animationName : '');
    L('mistBeforeAnim', mcb ? mcb.animationName : '');
    L('mistAfterAnim', mca ? mca.animationName : '');
    L('mistDur', mcs ? mcs.animationDuration : '');
    /* 注意：DIAG 是模板字符串，反斜杠会被吃掉 → 正则里一律用字符类 [(] 代替 \( */
    L('mistUrl', mcs ? (/url[(]/.test(mcs.backgroundImage + mcb.backgroundImage + mca.backgroundImage) ? 'yes' : 'no') : '');
    let mistGradN = 0;
    if(mcs){ [mcs, mcb, mca].forEach(s => { mistGradN += (s.backgroundImage.match(/radial-gradient/g) || []).length; }); }
    L('mistGrad', String(mistGradN));
    L('mistOpCave', mcs ? mcs.opacity : '');                       // 洞府（当前场景）：整体压淡
    L('battleHpInit', document.getElementById('bt-mhpn').textContent);
    document.getElementById('bt-skip').click();
    L('battleClosedAfterSkip', document.getElementById('battle-modal').classList.contains('hidden') ? 'yes' : 'no');
    L('towerAfterSkip', XX._s.tower);
    L('battleLogWin', (XX._s.log[0] || {}).t || '');
    /* 主动技条（第 100 轮）：技能按钮按 opts.skills 渲染，点一次减一次；
       破防按下即刻走胜利分支——这条是「塔里能翻盘」的唯一入口 */
    let skBreak = 'no', skWin = 'no';
    XX._setBattleAnim(true);
    XX._openBattleAnim(1, w => { skWin = w ? 'yes' : 'no'; }, {
      skills: [{ k: 'sword', label: '剑势', left: 2 }, { k: 'break', label: '破防', left: 1 }],
      onSkill(k){ if(k === 'break') skBreak = 'yes'; }
    });
    L('skBtns', String(document.querySelectorAll('#bt-skills .bt-skill').length));
    L('skHidden', document.getElementById('bt-skills').classList.contains('hidden') ? 'yes' : 'no');
    document.querySelector('#bt-skills [data-sk="sword"]').click();
    L('skSwordLeft', document.querySelector('#bt-skills [data-sk="sword"] i').textContent);
    document.querySelector('#bt-skills [data-sk="break"]').click();
    L('skBreakCalled', skBreak);
    L('skBreakUsed', document.querySelector('#bt-skills [data-sk="break"]').classList.contains('used') ? 'yes' : 'no');
    document.getElementById('bt-skip').click();
    L('skSkipWin', skWin);
    /* 没给技能的场子：整条隐藏，不占高度（论剑/秘境/心魔都不该看见它） */
    XX._openBattleAnim(1, () => {}, {});
    L('skEmpty', document.getElementById('bt-skills').classList.contains('hidden') ? 'hidden' : 'shown');
    document.getElementById('bt-skip').click();
    XX._setBattleAnim(false);   /* 关演出，之后的所有用例不受演出定时器干扰 */
    XX._s.rank = rankBak;

    // ---- 双场景：洞府 / 城镇（对标一念逍遥） ----
    L('sceneTabs', document.querySelectorAll('.scene-tab').length);                  // 5（第三批 B2 五签）
    L('caveActive', document.getElementById('scene-cave').classList.contains('active') ? 'yes' : 'no');
    L('townHidden', document.getElementById('scene-town').classList.contains('active') ? 'no' : 'yes');
    /* ⚠️ 前面 switchTab('xiu') 打开了藏经阁面板 → ROUTER.open 会把 #page-scene 摘掉 active，
       此时场景里的元素 getBoundingClientRect 全是 0（几何测量必须先把面板关掉） */
    window.ROUTER.back();
    window.ROUTER.showScene('town');
    /* 修仙法宝功能入口：量出每件法宝的实际矩形，检查是否重叠 / 出屏 / 撞到顶栏与侧栏 */
    const sealEls = Array.prototype.slice.call(document.querySelectorAll('.town-blds .bld.art'));
    const sealR = sealEls.map(e => e.getBoundingClientRect());
    L('sealN', sealR.length);
    let sealOv = 0;
    for (let i = 0; i < sealR.length; i++) for (let j = i + 1; j < sealR.length; j++) {
      const a = sealR[i], b = sealR[j];
      if (a.left < b.right - 4 && b.left < a.right - 4 && a.top < b.bottom - 4 && b.top < a.bottom - 4) sealOv++;
    }
    L('sealOverlap', sealOv);
    L('sealInView', sealR.every(r => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight) ? 'ok' : 'bad');
    /* 用 offsetWidth：getBoundingClientRect 会把每件的倾角算进去（外接盒），同档也会差几像素 */
    const sealSz = sealEls.map(e => Math.round(e.offsetWidth));
    L('sealSizes', Array.from(new Set(sealSz)).sort((a, b) => a - b).join('/'));
    /* 主次两档：主功能法宝的最宽档必须大于次功能的最窄档（主次分明，不许倒挂） */
    const lgW = Array.prototype.slice.call(document.querySelectorAll('.town-blds .bld.art.btn-large')).map(e => e.offsetWidth);
    const smW = Array.prototype.slice.call(document.querySelectorAll('.town-blds .bld.art.btn-small')).map(e => e.offsetWidth);
    L('sealLarge', lgW.length);
    L('sealSmall', smW.length);
    L('sealTier', lgW.length && smW.length ? (Math.max.apply(null, lgW) > Math.min.apply(null, smW) ? 'ok' : 'bad') : 'none');
    /* 印文必须留在物件内：量「真正的文字叶子」的矩形（标题被 position:absolute 撑满
       容器时，量容器本身毫无意义——铜钱/玉璧就栽在这），每片叶子都要在物件 88% 内 */
    let sealBad = 0;
    sealEls.forEach(e => {
      const er = e.getBoundingClientRect();
      const leaves = [];
      const title = e.querySelector('.bld-title');
      if (title) {
        const is = title.querySelectorAll('i');
        if (is.length) Array.prototype.forEach.call(is, i => leaves.push(i));
        else leaves.push(title);
      }
      Array.prototype.forEach.call(e.querySelectorAll('.bld-sub'), s => leaves.push(s));
      leaves.forEach(t => {
        const r = t.getBoundingClientRect();
        if (r.height > er.height * 0.88 || r.width > er.width * 0.88) sealBad++;
      });
    });
    L('sealTxtFit', sealBad);
    const sealBlk = Array.prototype.slice.call(document.querySelectorAll('.topbar,.scene-tabs,.act-rail,.sys-rail'))
      .map(e => e.getBoundingClientRect());
    let sealHit = 0;
    sealR.forEach(s => sealBlk.forEach(b => {
      if (s.left < b.right - 4 && b.left < s.right - 4 && s.top < b.bottom - 4 && b.top < s.bottom - 4) sealHit++;
    }));
    L('sealBlockHit', sealHit);
    /* 立绘质感：楷体横排 / 十张水墨立绘各挂各的图 / 灵光 hover（全部读计算样式，不靠肉眼） */
    const t0 = document.querySelector('.town-blds .bld.art .bld-title');
    L('artFont', t0 ? getComputedStyle(t0).fontFamily.slice(0, 60) : '');
    L('artWriting', t0 ? getComputedStyle(t0).writingMode : '');
    /* 第 88 轮：物件本体从 CSS 画物换成 ui/icons/bld_*.png。
       十件必须各挂一张不同的图（同图 = --bimg 漏写或被压掉），而且真解码得出来。 */
    const artShapes = Array.prototype.slice.call(document.querySelectorAll('.town-blds .bld.art .art-shape'));
    const artBimgs = artShapes.map(s => String(getComputedStyle(s).backgroundImage));
    L('artShapeN', artShapes.length);
    L('artImgN', artBimgs.filter(u => u.indexOf('bld_') >= 0).length);
    /* ⚠️ 这段是模板字符串里的代码：正则的反斜杠要写两条，一条会被模板字面量吃掉 */
    const artUrls = Array.from(new Set(artBimgs.map(u => (u.match(/url\\(["']?([^"')]+)/) || [])[1]).filter(Boolean)));
    L('artUrlKinds', artUrls.length);
    /* 立绘能不能解码不在这里量：fresh Image() 的 10 次解码会把 virtual-time 预算吃干净，
       后面的洞府题签就等着 naturalWidth=0 假红（实测 3/7）。改由 Node 侧直接读 PNG 字节判。 */
    /* 纸签不许顶穿立绘（第 1 版就是竖排字从纸签里一路刻到画上）：
       量 offsetTop 系（布局坐标，不带倾角）；getBoundingClientRect 会把 --rot 算进外接盒，同档也差几像素 */
    let artLabelBad = 0;
    document.querySelectorAll('.town-blds .bld.art').forEach(e => {
      const band = e.querySelector('.art-txt'), shape = e.querySelector('.art-shape');
      if (!band || !shape) { artLabelBad++; return; }
      if (band.offsetTop < shape.offsetTop + shape.offsetHeight) artLabelBad++;   /* 纸签盖住了画 */
      if (band.offsetHeight > e.offsetHeight * 0.45) artLabelBad++;               /* 纸签吃掉大半张画 */
      Array.prototype.forEach.call(e.querySelectorAll('.bld-title,.bld-sub'), t => {
        if (t.scrollWidth > t.clientWidth + 1 || t.scrollHeight > t.clientHeight + 1) artLabelBad++;
      });
    });
    L('artLabelBad', artLabelBad);
    /* hover 灵光：file:// 下读不到 cssRules（安全限制），直接挂 demo-hover 类量计算样式 */
    const art0 = document.querySelector('.town-blds .bld.art');
    let artHover = 'no';
    if (art0) {
      art0.classList.add('demo-hover');
      artHover = String(getComputedStyle(art0).filter).indexOf('drop-shadow') >= 0 ? 'yes' : 'no';
      art0.classList.remove('demo-hover');
    }
    L('artHoverGlow', artHover);
    /* 背景遮罩：城镇 scene-bg 的 ::after 必须挂了半透明米色（降背景对比度，前景才立得住） */
    const townBg = document.querySelector('#page-scene .scene-bg');
    const ovG = townBg ? getComputedStyle(townBg, '::after') : null;
    L('overlayBg', ovG ? String(ovG.backgroundImage).slice(0, 160) : 'none');
    /* 浮动：周期必须都够慢，且不能只有一种（否则会同步上下、像在跳） */
    const sealDurs = sealEls.map(e => parseFloat(getComputedStyle(e).animationDuration) || 0);
    L('sealAnimName', sealEls[0] ? getComputedStyle(sealEls[0]).animationName : 'none');
    L('sealDurMin', Math.min.apply(null, sealDurs).toFixed(1));
    L('sealDurKinds', Array.from(new Set(sealDurs.map(d => d.toFixed(1)))).length);
    // ---- 世界频道（传音：联机任务 1）----
    window.ROUTER.open('chat');
    L('chatView', (window.VIEWS && window.VIEWS.chat && document.getElementById('ch-list')) ? 'yes' : 'no');
    L('chatInput', (document.getElementById('ch-text') && document.getElementById('ch-send')) ? 'yes' : 'no');
    L('chatRendered', document.querySelector('#ch-list .ch-none,#ch-list .ch-msg,#ch-list .ch-sys') ? 'yes' : 'no');
    L('chatDot', document.getElementById('sc-chat-dot') ? 'yes' : 'no');
    L('chatApi', (typeof SECT.chatBind === 'function' && typeof SECT.chatOpen === 'function' &&
                  typeof SECT.chatClose === 'function' && typeof SECT.chatSend === 'function') ? 'yes' : 'no');
    L('chatUnread', typeof SECT._state().chatUnread === 'number' ? 'yes' : 'no');
    window.ROUTER.back();
    // ---- 山门气象（宗门活跃度展示，2026-10-25）----
    /* 面板由 router 动态注入 → 必须先 open 才在 DOM 里 */
    /* 第 88 轮 B 拆页：气象四格在 zong_weather，求助名录在 zong_help，各开各的页 */
    window.ROUTER.open('zong_weather');
    await sleep(300);
    L('wxCard', !!document.getElementById('sc-weather') ? 'yes' : 'no');
    L('wxSlots', ['sc-stats','sc-roster','sc-events','sc-wq'].filter(id => !!document.getElementById(id)).length);
    /* 未连服务时应给出降级文案，而不是空白 */
    L('wxFallback', (document.getElementById('sc-stats')||{}).textContent || '');
    L('wxPanelApi', typeof SECT.panelOpen === 'function' ? 'yes' : 'no');
    L('wxStatsState', typeof SECT._state().stats === 'object' ? 'yes' : 'no');
    /* ---- 宗门服务地址解析（2026-10-26）：以前默认只连本机 8787，等于人人单机 ---- */
    window.ROUTER.open('zong_help');
    await sleep(200);
    L('sectOff', ((document.getElementById('sc-mine')||{}).textContent||'').slice(0, 120));
    L('sectOffIco', ((document.getElementById('sc-mine')||{}).innerHTML||'').indexOf('ic_gate.png') >= 0 ? 'ok' : 'bad');
    L('sectTimer', SECT._state().timer);            /* 探活全灭也要挂着轮询，服务后起来能自己连上 */
    L('candApi', (typeof SECT._candidates === 'function' && typeof SECT._firstAlive === 'function'));
    L('candFile', SECT._candidates());              /* 真实路径：file:// 打开，没有存过地址 */
    L('candQuery', SECT._candidates({ search: '?sect=https://t.example/aa/', stored: 'http://old.example',
      protocol: 'https:', origin: 'https://game.example' }));
    L('candSame', SECT._candidates({ search: '', stored: '', protocol: 'https:', origin: 'https://game.example' }));
    L('candDupe', SECT._candidates({ search: '?sect=http://localhost:8787', stored: 'http://localhost:8787/',
      protocol: 'file:', origin: 'null' }));
    L('aliveNone', await SECT._firstAlive(['http://127.0.0.1:1', 'http://127.0.0.1:2']));
    /* 设置里要看得见"连没连上、连的是谁"（换服务器/开隧道时不用开控制台猜） */
    document.getElementById('sc-settings').click();
    L('sectStateTxt', (document.getElementById('m-sect-state')||{}).textContent || 'NOEL');
    L('sectLabel', ((document.getElementById('m-sect').closest('.m-row')||{}).textContent || '').slice(0, 40));
    document.getElementById('m-cancel').click();
    window.ROUTER.back();
    L('mistOpTown', mcs ? getComputedStyle(document.querySelector('.scene-mist')).opacity : '');   // 城镇（楼阁暗底）：满浓度
    window.switchTab('xiu_acts');       /* 还原：后续用例依赖藏经阁「修炼」页的行动卡 */
    L('townActive', document.getElementById('scene-town').classList.contains('active') ? 'yes' : 'no');
    L('caveHiddenAfter', document.getElementById('scene-cave').classList.contains('active') ? 'no' : 'yes');
    window.ROUTER.showScene('cave');
    L('caveBack', document.getElementById('scene-cave').classList.contains('active') ? 'yes' : 'no');
    /* 洞天福地背景（2026-10-24）：洞府 scene-bg 铺 AI 水墨图 + 半透明宣纸 wash（不是实底渐变） */
    const caveBgCs = getComputedStyle(document.querySelector('#page-scene .scene-bg'));
    L('caveBgImg', String(caveBgCs.backgroundImage).indexOf('cave-bg.jpg') >= 0 ? 'yes' : 'no');
    L('caveBgWash', String(caveBgCs.backgroundImage).indexOf('0.44') >= 0 ? 'yes' : 'no');
    L('railIcons', document.querySelectorAll('.sys-rail .sys-btn .sys-ic').length);   // 侧栏 2 钮（功法/设置；人物/背包已收进五签）
    L('handbookIcons', document.querySelectorAll('#sc-handbook .sys-btn .sys-ic').length); // 手札 3 钮（低频）
    L('scBreak', !!document.getElementById('sc-break'));                             // 顶部突破按钮
    L('scActs', document.querySelectorAll('#sc-acts .cave-act').length);             // 2 个修炼行动（打坐+历练）
    L('noHerbBtn', !document.querySelector('#sc-acts [data-k="herb"]') &&
                  !document.querySelector('#sc-acts [data-k="enlight"]') ? 'ok' : 'bad'); // 采药/顿悟已从主界面删除
    L('sideActs', document.querySelectorAll('#xx-actions .act').length);             // 侧边栏行动卡保留
    L('qiMotes', document.querySelectorAll('#qi-field .qi-mote').length);            // 灵气光点 8 枚
    // ---- 天地大阵：法阵背景 + 符文玉简 ----
    L('grandArray', !!document.querySelector('#scene-cave .grand-array') &&
                    document.querySelectorAll('#scene-cave .ga-ring').length >= 3 &&
                    document.querySelectorAll('#scene-cave .ga-guas span').length === 8 ? 'ok' : 'bad');
    L('jadeNodes', document.querySelectorAll('#scene-cave .node-jade').length);      // 丹/器/田/兽 4 枚
    L('jadeGlyphs', ['丹','器','田','兽'].every(g =>
      Array.from(document.querySelectorAll('#scene-cave .nj-ring b')).some(b => b.textContent === g)) ? 'ok' : 'bad');
    L('jadeScroll', document.querySelectorAll('#scene-cave .node-jade[data-bld="dong"][data-scroll]').length); // 3 枚带直达分区
    L('jadeTips', document.querySelectorAll('#scene-cave .nj-tip').length);          // 4 条悬停介绍

    // ---- 立绘选角（创角界面 → playerState.gender → 主界面动态显示） ----
    L('heroImgs', Object.keys(XX._heroImgs).length);                            // 男/女两套立绘
    L('heroMalePath', XX._heroImgs.m.indexOf('hero_male') >= 0 ? 'ok' : XX._heroImgs.m);
    L('heroFemPath', XX._heroImgs.f.indexOf('hero_female') >= 0 ? 'ok' : XX._heroImgs.f);
    L('heroOfMale', XX._heroImg('m'));                                        // m → hero_male
    L('heroOfFemale', XX._heroImg('f'));                                      // f → hero_female
    L('genderOfM', XX._genderOf('m') + '/' + XX._genderOf('f'));              // male/female
    L('sexOfMale', XX._sexOf('male') + '/' + XX._sexOf('female'));            // m/f 互认
    // 创角界面：两张立绘并排
    XX._s.sex = 'm'; XX._s.gender = 'male';
    document.getElementById('char-modal').classList.remove('hidden');
    XX._renderCharPreview();
    L('pickN', document.querySelectorAll('#char-picks .char-pick').length);   // 2 张
    L('pickImgs', document.querySelectorAll('#char-picks .cp-img').length);   // 2 个 img
    L('pickMImg', document.querySelector('#char-picks [data-sex="m"] .cp-img').getAttribute('src'));
    L('pickFImg', document.querySelector('#char-picks [data-sex="f"] .cp-img').getAttribute('src'));
    L('pickActive0', document.querySelector('#char-picks .char-pick.active').dataset.sex);   // 默认男
    // 点女修 → 放大高亮（active 切过去）
    document.querySelector('#char-picks [data-sex="f"]').click();
    L('pickActive1', document.querySelector('#char-picks .char-pick.active').dataset.sex);   // 变女
    L('pickActiveN', document.querySelectorAll('#char-picks .char-pick.active').length);     // 只有 1 个 active
    /* 创角必选道途（组 A/B 五条红的根因，制作人拍板 2026-11-13）：
       少点这一下，confirmChar 会在 game.js:11579 那句「if(needNewGame && !charPath)」直接 return ——
       弹窗不关 → finalizeNewGame/finishBoot 不跑 → Story.init() 不跑 → story.js:25 D=null →
       cur() 返回 null → settle() 返回 null（主线发奖那条红跟着来）。
       ⚠️ 真实容器是 #char-path-picks（game.js:11511 动态注入，不依赖 index.html），
          任务单写的 #char-paths 在 DOM 里不存在，按实际 DOM 走。 */
    const pathBtn0 = document.querySelector('#char-path-picks .char-pick[data-path]');
    L('cargPathBtn', pathBtn0 ? pathBtn0.dataset.path : 'MISSING');
    if (pathBtn0) pathBtn0.click();
    const pathBtn1 = document.querySelector('#char-path-picks .char-pick[data-path].active');
    L('cargPathPicked', pathBtn1 ? pathBtn1.dataset.path : 'none');
    // 确认 → gender 落进 playerState
    document.getElementById('char-name').value = '碧落';
    XX._confirmChar();
    L('genderSaved', XX._s.gender);
    L('sexSaved', XX._s.sex);
    L('nameSaved', XX._s.name);
    L('modalClosed', document.getElementById('char-modal').classList.contains('hidden') ? 'hidden' : 'open');
    // 主界面：中心立绘跟着 gender 换
    L('sceneHeroSrc', document.querySelector('#sc-figure .sc-hero').getAttribute('src'));
    L('sceneBeam', !!document.querySelector('#sc-figure .sc-hero-beam'));   // 阵法光柱
    L('sceneForm', !!document.querySelector('#sc-figure .xx-form'));        // 发光太极盘
    // 切回男修 → 立绘跟着换
    XX._s.sex = 'm'; XX._s.gender = 'male'; XX._render();
    L('sceneHeroSrc2', document.querySelector('#sc-figure .sc-hero').getAttribute('src'));
    L('miniHeroSrc', document.querySelector('#sc-avatar .xx-mini').getAttribute('src'));  // 顶栏头像同源
    // 旧档迁移：只有 sex 没有 gender 的存档应补正
    L('genderFromSex', XX._genderOf(XX._s.sex));
    document.getElementById('char-modal').classList.add('hidden');

    window.switchTab('dong');
    L('dongShown', document.getElementById('page-dong').classList.contains('active') ? 'shown' : 'hidden');
    // ---- 第 87 轮 · 真二级路由：hub 只放七格入口，一格一个独立页 ----
    L('caveNavN', document.querySelectorAll('#page-dong .hub-nav [data-jump]').length);   // 8（第三批 B5：聚灵阵独立一格）
    L('hubCards', document.querySelectorAll('#page-dong .panel-body > .card').length);     // 1（只剩卷首小景）
    L('hubSealField', document.getElementById('xx-hub-field').textContent);                // Lv.0
    L('hubSealDT', document.getElementById('xx-hub-dongtian').textContent);                // 0/5
    document.querySelector('#page-dong .hub-nav [data-jump="xx-alchemy-sec"]').click();
    L('subRoute', window.ROUTER.current());                                               // dong_alchemy
    L('subDepth', window.ROUTER.depth());                                                 // 2
    L('subCards', document.querySelectorAll('#page-dong .panel-body > .card').length);    // 1
    L('subOnly', ['xx-field','xx-mine','xx-forge-sec','xx-enhance','xx-dongtian','xx-ups']
      .some(id => !!document.getElementById(id)) ? 'mixed' : 'alone');
    L('subHasAlch', !!document.getElementById('xx-alchemy-sec') && !!document.querySelector('#xx-alchemy .craft') ? 'yes' : 'no');
    // 返回栈：子页 ← 先回 hub，再 ← 才回场景
    window.backToScene();
    L('backHub', document.getElementById('page-dong').dataset.sec);                      // hub
    L('backSceneYet', document.getElementById('page-scene').classList.contains('active') ? 'yes' : 'no');
    window.backToScene();
    L('backScene', document.getElementById('page-scene').classList.contains('active') ? 'yes' : 'no');
    // 七页逐个开：每页只该渲染自己那一张卡，别的分区一张都不许漏进来
    (function(){
      var spec = [['dong_field', 'xx-field'], ['dong_mine', 'xx-mine'], ['dong_alchemy', 'xx-alchemy-sec'],
                  ['dong_forge', 'xx-forge-sec'], ['dong_enhance', 'xx-enhance-sec'],
                  ['dong_dongtian', 'xx-dongtian-sec'], ['dong_array', 'xx-array-sec'], ['dong_ups', 'xx-ups-sec']];
      var all = spec.map(function(p){ return p[1]; });
      var bad = [];
      spec.forEach(function(p){
        window.switchTab(p[0]);
        var body = document.querySelector('#page-dong .panel-body');
        if(!body || !document.getElementById(p[1])) { bad.push(p[0] + '=缺自己'); return; }
        if(body.querySelectorAll(':scope > .card').length !== 1) bad.push(p[0] + '=卡数' + body.querySelectorAll(':scope > .card').length);
        var others = all.filter(function(id){ return id !== p[1] && !!document.getElementById(id); });
        if(others.length) bad.push(p[0] + '=多了' + others.join('~'));
      });
      L('subPagesAlone', bad.length ? bad.join(',') : 'ok');
    })();

    // ---- 第 86/87 轮 · 洞府水墨册页皮肤（材质是否真的挂上，不看代码看计算样式） ----
    /* 题签是切页后才开始解码的 <img>：不等一下就会量到 naturalWidth=0 的中间态（假红）。
       ⚠️ 两个坑叠在一起：
       1) 只 sleep 轮询不够 —— --virtual-time-budget 下虚拟时间跑得比真机解码快，
          12×120ms 的"等"实测只相当于几十毫秒真时间（量到 3/7、4/7 就是这么来的）；
       2) 改纯 img.decode() 等待又踩第二个坑 —— 等解码期间一个 timer 都没挂，
          虚拟时间调度器会当成"页面 idle"当场 dump，注入脚本半路被丢下
          （症状是 stdout 十六万字节却缺 <pre id=diag>、F 整片 undefined）。
       所以两样一起等：sleep 保证始终有 timer 挂着（不让调度器提前 dump），
       decode 保证真解码完才放行；加载不上 decode 会 reject，照样红。
       ⚠️ 单趟别给太久：这个函数在洞府那几节里被调用七八次，400ms×6 趟就是 2.4 秒虚拟时间，
          七次一起能把 --virtual-time-budget 吃穿（实测 vtUsed 从 7.6s 飙到 22.8s、
          反被截断成「没有 diag」）。120ms×8 趟够真机解码用，最多 960ms。 */
    async function caveTagsReady(){
      for (var tw = 0; tw < 8; tw++) {
        var pend = [].slice.call(document.querySelectorAll('#page-dong .tag-ic, #page-dong .hc-ic'))
          .filter(function(t){ return t.naturalWidth === 0; });
        if (!pend.length) break;
        try { await Promise.all([sleep(120), Promise.all(pend.map(function(t){ return t.decode(); }))]); }
        catch (e) { break; }
      }
    }
    window.switchTab('dong');
    await caveTagsReady();
    (function(){
      var hero = document.querySelector('#page-dong .hub-hero');
      var hbg = hero ? getComputedStyle(hero).backgroundImage : '';
      L('caveHeroBg', hbg.indexOf('scene.jpg') >= 0 ? 'ok' : 'bad:' + hbg.slice(0, 60));
      L('caveHeroH', hero ? Math.round(hero.getBoundingClientRect().height) : 0);
      var res = document.querySelector('#page-dong .res');
      var rbw = res ? parseFloat(getComputedStyle(res).borderLeftWidth) : -1;
      L('caveResEdge', rbw >= 3 ? 'ok' : 'bad:' + (res ? rbw + '/' + getComputedStyle(res).borderLeftStyle : 'no .res'));
      /* 入口格：纸底 + 题签解码 + 朱砂印（原来挂在 .on 上，现在是格面上的等级印） */
      var cell = document.querySelector('#page-dong .hub-cell');
      var ccs = cell ? getComputedStyle(cell) : null;
      L('hubCellPaper', ccs && ccs.backgroundImage.indexOf('paper.jpg') >= 0 ? 'ok' : 'bad:' + (ccs ? ccs.backgroundImage.slice(0, 60) : 'none'));
      var ics = [].slice.call(document.querySelectorAll('#page-dong .hub-nav .hc-ic'));
      L('hubIcN', ics.length);
      L('hubIcLoaded', ics.filter(function(t){ return t.naturalWidth > 0; }).length);
      var seal = document.querySelector('#page-dong .hc-seal');
      L('caveNavSeal', seal && getComputedStyle(seal).backgroundImage.indexOf('gradient') >= 0 ? 'ok' : 'bad');
    })();
    window.switchTab('dong_field');
    await caveTagsReady();
    (function(){
      var card = document.getElementById('xx-field');
      var cs = card ? getComputedStyle(card) : null;
      L('caveCardPaper', cs && cs.backgroundImage.indexOf('paper.jpg') >= 0 ? 'ok' : 'bad:' + (cs ? cs.backgroundImage.slice(0, 60) : 'none'));
      L('caveCardEdge', cs && parseFloat(cs.borderTopWidth) >= 1 && parseFloat(cs.borderRadius) <= 18 ? 'ok' : 'bad:' + (cs ? cs.borderRadius + '/' + cs.borderTopWidth : 'none'));
      var tags = [].slice.call(document.querySelectorAll('#page-dong .tag-ic'));
      L('caveTagN', tags.length);
      L('caveTagLoaded', tags.filter(function(t){ return t.naturalWidth > 0; }).length);
      var h2 = card ? card.querySelector('h2') : null;
      L('caveH2Tick', h2 ? (getComputedStyle(h2, '::before').display === 'none' ? 'gone' : 'still') : 'none');
      var af = h2 ? getComputedStyle(h2, '::after') : null;
      var h2s = h2 ? getComputedStyle(h2) : null; L('caveH2Rule', h2s && parseFloat(h2s.borderBottomWidth) === 1 ? 'ok' : 'bad:' + (h2s ? h2s.borderBottomWidth : 'none'));
    })();

    // ---- 灵田（种田闭环：播种 → 生长倒计时 → 收获 → 直通炼丹房）独立页 ----
    L('field0', XX._s.field);
    L('fieldRate0', document.getElementById('xx-field-rate').textContent);
    XX._s.stone = 1000; XX._buyField();
    L('field1', XX._s.field);
    L('stoneAfterField', XX._s.stone);           // 炼气一层 灵田首级 = 40×0.20 = 8
    XX._s.field = 6; XX._render();
    L('fieldRate6', document.getElementById('xx-field-rate').textContent);   // 每分钟自动凝 12 灵石
    L('fieldPlots6', document.getElementById('xx-field-plots').textContent); // 田块 6/9
    L('plots6', document.querySelectorAll('#xx-plots .plot').length);        // 6 块田
    L('chipN', document.querySelectorAll('#xx-farm-bar .crop-chip').length); // 3 种作物
    const lockedChip = document.querySelector('#xx-farm-bar .crop-chip.locked');
    L('chipLocked', lockedChip ? lockedChip.dataset.crop : 'none');          // 百年灵草（需灵田 10 级）
    XX._plantAll('herb');
    L('planted', XX._s.plots.filter(Boolean).length);                        // 一键播种 6 块
    const nowF = Date.now();
    XX._s.plots.forEach(p => { p.t0 = nowF - p.need * 1000 - 1000; });       // 时间快进到成熟
    XX._render();
    L('ripeTiles', document.querySelectorAll('#xx-plots .plot.ripe').length); // 6 块成熟
    L('cavePlotSoil', (function(){ var p = document.querySelector('#xx-plots .plot');
      var bg = p ? getComputedStyle(p).backgroundImage : '';
      return p && bg.indexOf('soil.jpg') < 0 && bg.indexOf('data:image/svg') >= 0 ? 'ok' : 'bad:' + bg.slice(0, 60); })());
    L('caveRipeAnim', (function(){ var r = document.querySelector('#xx-plots .plot.ripe');
      return r ? getComputedStyle(r).animationName : 'none'; })());
    L('vistaBadge', document.getElementById('sc-field-badge').textContent);   // 主场景小景徽标
    XX._s.herb = 0;
    XX._harvestAll();
    L('harvestGain', XX._s.herb);                                            // 6 块 × 7 株 = 42
    L('plotsEmptyAfter', XX._s.plots.filter(Boolean).length);                // 收获后清空

    // ---- 随机奇遇（挂机气泡 → 古风弹窗 → 选项结算 → 气泡消失） ----
    window.ROUTER.showScene('cave');
    L('encCfgChance', XX._encCfg.chance);                                      // 0.3
    L('encCfgEvery', XX._encCfg.everySec);                                    // 60 秒
    L('encEvtN', Object.keys(XX._encounters).length);                         // D-008 后 34 个事件
    /* D-008：内容扩容后，把「内置 4 个事件」这种易碎魔数升级为运行时结构契约采集。
       在真实 XX._encounters 对象上逐条校验，供下方断言做复合判定（不是把 4 改成 34 了事）：
         每条都有 icon/name/text/opts[]；每个 opts 都有 label/fx/ok；fx 键只落在 encApplyFx
         支持的 8 类白名单内；新增条目用到的 fx 数值全部落在既有 4 条用过的档位集合里；
         roll 分支必须有 w/text/fx；text/label 不含 < （全部走 textContent）。 */
    (function(){
      const FXK = ['costStone','stone','wisdom','insight','exp','expLoss','boost','roll'];
      const NUMK = ['costStone','stone','wisdom','insight','exp','expLoss'];
      let meta = 0, html = 0, badKey = 0, badRoll = 0, badTier = 0, badShape = 0, badType = 0, evt = 0;
      /* 既有 4 条受红线「逐字未改」保护、引擎对缺省 ok 有兜底（o.ok || ''），祖父化豁免 ok 字段检查 */
      const ORIG = ['beggar','pouch','stele','amulet'];
      /* 既有 4 条用过的数值档位全集（来自改前 ENCOUNTERS，逐字核对过源码） */
      const ALLOW = {
        costStone:[10,30], stone:[180], wisdom:[50], insight:[12,5], exp:[], expLoss:[0.08],
        mult:[0.60,0.15], sec:[900], w:[6,4,5]
      };
      const inSet = (arr, v) => arr.indexOf(v) >= 0;
      /* fx 类型契约（D-008 第二轮审查定点补证）：fx 必须是「非 null、非数组、纯对象」；
         boost 仅允非数组对象且只含 mult/sec；roll 必须是数组，分支只允非数组对象且只含 w/text/fx，分支内 fx 同样须合法对象。
         与 tools/d008-content.test.mjs 中 validFx/validBoost/validRoll 逐字一致。 */
      const validFx = (fx) => fx !== null && typeof fx === 'object' && !Array.isArray(fx);
      const validBoost = (b) => b !== null && typeof b === 'object' && !Array.isArray(b)
        && Object.keys(b).every(k => k === 'mult' || k === 'sec')
        && typeof b.mult === 'number' && typeof b.sec === 'number';
      const validRoll = (r) => Array.isArray(r) && r.every(b =>
        b !== null && typeof b === 'object' && !Array.isArray(b)
        && Object.keys(b).every(k => k === 'w' || k === 'text' || k === 'fx')
        && typeof b.w === 'number' && typeof b.text === 'string' && validFx(b.fx));
      const chkFx = (fx) => {
        if(!validFx(fx)) { badType++; return; }   /* null/数组/字符串 冒充 fx 直接记坏类型 */
        Object.keys(fx).forEach(k => { if(FXK.indexOf(k) < 0) badKey++; });
        NUMK.forEach(k => { if(fx[k] !== undefined && !inSet(ALLOW[k], fx[k])) badTier++; });
        /* 必须用不等于 undefined 判断，而非真值判断；否则 boost:null 或 roll:null 等 falsy 非法值
           会被 if(fx.boost) 直接跳过，绕过 validBoost/validRoll（第三轮审查补证点）。 */
        if(fx.boost !== undefined){
          const bk = Object.keys(fx.boost || {});
          if(!validBoost(fx.boost)) badType++;
          else if(bk.some(k => k !== 'mult' && k !== 'sec')) badShape++;
          else if(!inSet(ALLOW.mult, fx.boost.mult) || !inSet(ALLOW.sec, fx.boost.sec)) badTier++;
        }
        if(fx.roll !== undefined){
          if(!validRoll(fx.roll)) badType++;
          else fx.roll.forEach(b => {
            if(Object.keys(b).some(k => k !== 'w' && k !== 'text' && k !== 'fx')) badShape++;
            if(typeof b.w === 'number' && !inSet(ALLOW.w, b.w)) badTier++;
            chkFx(b.fx);
          });
        }
      };
      Object.keys(XX._encounters).forEach(id => {
        const e = XX._encounters[id]; evt++;
        if(!e.icon || !e.name || !e.text || !Array.isArray(e.opts) || e.opts.length < 2) meta++;
        if(/</.test(e.text || '')) html++;
        (e.opts || []).forEach(o => {
          if(!o.label) meta++;
          if(!validFx(o.fx)) { meta++; badType++; }   /* fx 必须是合法对象（覆盖 undefined/null/数组/字符串） */
          /* ok 仅在非 roll 选项展示（roll 选项 detail 被分支 text 覆盖，见 resolveEncounter）；既有 4 条祖父化豁免 */
          if(ORIG.indexOf(id) < 0 && !(o.fx && o.fx.roll) && o.ok === undefined) meta++;
          if(/</.test(o.label || '')) html++;
          chkFx(o.fx);
        });
      });
      L('encStructEvt', evt);
      L('encStructMeta', meta);
      L('encStructHtml', html);
      L('encStructBadKey', badKey);
      L('encStructBadRoll', badRoll);
      L('encStructBadTier', badTier);
      L('encStructBadShape', badShape);
      L('encStructBadType', badType);
      /* 既有 4 条逐字未改：气泡名 + 首个选项文案 + 结算数值，下面原有断言已覆盖，这里补 id 存在性 */
      L('encStructOrig4', ['beggar','pouch','stele','amulet'].every(k => !!XX._encounters[k]) ? 'yes' : 'no');
    })();
    const bub = document.getElementById('enc-bubble');
    L('encBubbleHidden0', bub.classList.contains('hidden') ? 'hidden' : 'shown');
    XX._encSpawn('beggar');
    L('encBubbleShown', bub.classList.contains('hidden') ? 'hidden' : 'shown');
    L('encBubbleName', bub.querySelector('.enc-bubble-name').textContent);
    bub.click();                                                              // 点气泡开弹窗
    const em = document.getElementById('enc-modal');
    L('encModalOpen', em.classList.contains('hidden') ? 'hidden' : 'open');
    L('encBubbleAfterClick', bub.classList.contains('hidden') ? 'hidden' : 'shown');
    L('encOpts', document.querySelectorAll('#enc-opts .enc-opt').length);     // 2 个选项
    L('encOptLabel', document.querySelector('#enc-opts .enc-opt span').textContent);
    const stB = XX._s.stone, wdB = XX._s.wisdom;
    XX._s.stone = 500;
    document.querySelectorAll('#enc-opts .enc-opt')[0].click();               // 给他 10 灵石
    L('encStoneDown', 500 - XX._s.stone);                                      // −10
    L('encWisdomUp', XX._s.wisdom - wdB);                                     // 悟道值 +50×系数
    L('encModalClosed', em.classList.contains('hidden') ? 'hidden' : 'open');
    L('encBubbleGone', bub.classList.contains('hidden') ? 'hidden' : 'shown');
    L('encStateCleared', XX._encState().bubble ? 'left' : 'clear');
    L('stB', stB);
    // 风险事件：强行打开破囊，两个分支都要能结算（随机 6:4）
    XX._encSpawn('pouch');
    XX._openEncounter('pouch');
    L('pouchOpts', document.querySelectorAll('#enc-opts .enc-opt').length);
    L('pouchRisk', document.querySelectorAll('#enc-opts .enc-opt.risk').length); // 1 个风险项
    const stP = XX._s.stone, expP = XX._s.exp + 1000;
    XX._s.exp = expP;                       // 修为先垫够：反噬分支扣的是need 的百分比，修为为 0 时扣不动
    XX._resolveEncounter('pouch', 0);
    L('pouchChanged', (XX._s.stone !== stP || XX._s.exp !== expP) ? 'yes' : 'no');
    L('pouchCleared', XX._encState().bubble ? 'left' : 'clear');
    // 灵石不足时选项置灰
    XX._s.stone = 0;
    XX._openEncounter('amulet');
    L('amuletOpts', document.querySelectorAll('#enc-opts .enc-opt').length);
    L('amuletDisabled', document.querySelectorAll('#enc-opts .enc-opt:disabled').length); // 买符被禁用
    XX._closeEncounter();
    // 临时修炼倍率（聚气符）：生效中 expRate 抬升
    const rate0 = XX._rate();
    XX._encApplyFx({ boost:{ mult:0.6, sec:900 } });
    L('encBoostRate', XX._rate() > rate0 ? 'up' : 'flat');
    L('encBuffOn', XX._encBuff() > 0 ? 'on' : 'off');
    XX._encApplyFx({ boost:{ mult:0, sec:0 } });
    XX._s.encBuff = { mult:0, until:0 };
    // TTL 到期消散
    XX._encSpawn('stele');
    XX._encState().t = Date.now();// 首次调用只对齐时间轴，这里预置避免早退
    XX._encState().bubble.t0 = Date.now() - (XX._encCfg.ttlSec + 10) * 1000;
    XX._encTick();
    L('encTtlGone', XX._encState().bubble ? 'left' : 'gone');
    XX._s.stone = 0; XX._s.enc = { t:0, bubble:null, lastId:'' }; XX._render();

    // ---- 背包 ----
    window.switchTab('bag');
    L('bagCells', document.querySelectorAll('.bag-cell').length);            // 9
    XX._s.bag = [{t:'dan1',n:'下品丹药'},{t:'paper',n:'法宝图纸'}]; XX._render();
    L('bagItems', document.querySelectorAll('.bag-cell:not(.empty)').length); // 2
    const exp0 = XX._s.exp;
    XX._eat(0);
    L('eatExp', XX._s.exp > exp0 ? 'yes' : 'no');
    L('bagAfterEat', XX._s.bag.length);          // 1

    /* ---- 背包物品详情弹窗：点格子先弹详情，框内再选服食/寄售/丢弃 ---- */
    XX._s.bag = [{t:'dan1',n:'下品丹药'},{t:'mat_core',n:'妖丹'}]; XX._render();
    XX._itemDetail(0);
    L('itemModalShown', document.getElementById('item-modal').classList.contains('hidden') ? 'no' : 'yes');
    L('itemNameDan', document.getElementById('it-name').textContent);
    L('itemDescDan', (document.getElementById('it-desc').textContent || '').length > 10 ? 'yes' : 'no');
    L('itemHasEat', !!document.querySelector('#it-acts [data-do="eat"]'));
    XX._itemClose();
    L('itemModalClosed', document.getElementById('item-modal').classList.contains('hidden') ? 'yes' : 'no');
    /* 材料：应给「寄售」而不是「服食」 */
    XX._itemDetail(1);
    L('itemNameMat', document.getElementById('it-name').textContent);
    L('itemHasSell', !!document.querySelector('#it-acts [data-do="sell"]'));
    L('itemSellTxt', (document.querySelector('#it-acts [data-do="sell"]') || {}).textContent || '');
    L('itemSellDyn', XX._sellPrice('mat_core'));   /* A31：冻结打开详情那一刻的动态价，供后面同源校验 */
    L('itemHasNoEat', !document.querySelector('#it-acts [data-do="eat"]'));
    /* ---- 第 83 轮：物品详情四钮换水墨 PNG ----
       img 数量 ≥3（装备/服食/寄售/丢弃 里材料档有 3 个）且按钮文字里不再夹 emoji：
       emoji 是全彩的，压在宣纸底上跟水墨对不上，结构位一律走 INK_ICON 查表。
       ⚠️ 这段是塞进模板字符串里跑的，正则里的 \. 和 \/ 会被模板先吃掉一层，所以一律用 indexOf。 */
    const acts = document.getElementById('it-acts');
    L('itemActsImg', (acts.innerHTML.split('<img').length - 1));
    L('itemActsEmo', /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(acts.textContent) ? 'yes' : 'no');
    /* inkIco 的兜底契约：查得到给 img，查不到原样返回 emoji（补图就生效，漏图不渲染成空串） */
    L('inkFallback', window.inkIco('🎯') === '🎯' ? 'ok' : 'bad');
    L('inkMapped', (function(){ const s = window.inkIco('⚔️');
      return s.indexOf('<img') === 0 && s.indexOf('ic_blade.png') > 0 ? 'ok' : 'bad'; })());
    /* 侧栏图标的层序：玉面 ::after 是 z-index:1 的实心渐变，图标必须抬到 2 才盖在它上面
       （第 82 轮换 PNG 时漏了这条，六个钮整列被白盘糊住，肉眼看不出是代码问题） */
    const sysIc = document.querySelector('.sys-btn .sys-ic');
    L('sysIcZ', sysIc ? getComputedStyle(sysIc).zIndex : 'none');
    L('sysFaceZ', sysIc ? getComputedStyle(sysIc.parentElement, '::after').zIndex : 'none');
    /* 法阵玉简的常显符文刻度环（rest 态没有它就是一块白盘） */
    const njRing = document.querySelector('.nj-ring');
    L('njTick', njRing ? (getComputedStyle(njRing, '::after').backgroundImage.indexOf('conic') >= 0 ? 'ok' : 'bad') : 'none');
    XX._itemClose();
    /* 详情框点「服食」：丹药真的被吃掉，不再误卖 */
    XX._s.bag = [{t:'dan1',n:'下品丹药'},{t:'mat_core',n:'妖丹'}]; XX._render();
    XX._itemDetail(0);
    const exp1 = XX._s.exp;
    const eatBtn = document.querySelector('#it-acts [data-do="eat"]');
    if(eatBtn) eatBtn.click();
    L('itemEatWorks', (XX._s.exp > exp1 && XX._s.bag.length === 1) ? 'yes' : 'no');
    /* 第 89 节 · 新族丹走同一条真人路径：详情框认得它（给「服食」不是「寄售」），
       点下去进的是聚灵槽，不是老五枚那条 if-else。量完立刻清槽，别污染后面的用例。 */
    XX._s.bag = [{ t: 'jl1', n: '引气丹' }]; XX._render();
    XX._itemDetail(0);
    const jlName = document.getElementById('it-name').textContent;
    const jlActs = [].map.call(document.querySelectorAll('#it-acts [data-do]'), b => b.getAttribute('data-do')).join(',');
    const jlRate0 = XX._rate();
    const jlEat = document.querySelector('#it-acts [data-do="eat"]');
    if(jlEat) jlEat.click();
    L('danNewEat', [jlName, jlActs, XX._dan.buff().exp > 0 ? 'on' : 'off',
      XX._rate() > jlRate0 ? 'up' : 'same', XX._s.bag.length].join('/'));
    XX._s.danExp = { mult: 0, until: 0 };
    XX._itemClose();

    /* ---- 背包容量口径（第 74 节）：格子按有效容量画；主洞改奉后超出的物品不能消失 ---- */
    const bagSnap = { size: XX._s.bagSize, dt: JSON.parse(JSON.stringify(XX._s.dt)), main: XX._s.dtMain };
    XX._s.bagSize = 50; XX._s.dt = { qing:0, zhu:0, su:0, xuan:3, huang:0 }; XX._s.dtMain = 'xuan';
    XX._s.bag = new Array(60).fill(0).map(() => ({ t:'dan1', n:'下品丹药' })); XX._render();
    L('bagCapCells', document.querySelectorAll('.bag-cell').length);          // 80
    L('bagCapLabel', document.getElementById('xx-bag-cap').textContent);      // 60 / 80（洞天 +30）
    XX._s.dt.xuan = 0; XX._s.dtMain = ''; XX._render();
    L('bagOverLabel', document.getElementById('xx-bag-cap').textContent);     // 60 / 50（超 10 格）
    L('bagOverCells', document.querySelectorAll('.bag-cell').length);         // 60
    L('bagOverClass', document.getElementById('xx-bag-cap').classList.contains('over') ? 'yes' : 'no');
    XX._s.bagSize = bagSnap.size; XX._s.dt = bagSnap.dt; XX._s.dtMain = bagSnap.main;
    XX._s.bag = []; XX._render();

    /* ---- 装备三槽：加法计入总战力 / 换装退回 / 卸下回收 ---- */
    XX._s.equipment = { weapon:null, armor:null, accessory:null };
    XX._s.bag = [{t:'eq_qingfeng',n:'青锋剑'},{t:'eq_chixiao',n:'赤霄剑'},
                 {t:'eq_huxin',n:'照胆镜'},{t:'dan1',n:'下品丹药'}];
    XX._render();
    const cpBase = XX._power();
    const r1 = XX._equipItem('eq_qingfeng');
    L('equipOk', r1.ok ? 'yes' : 'no');
    L('equipDelta', r1.delta);                                    // 500
    L('equipSlot', XX._equippedId('weapon'));                     // eq_qingfeng
    L('equipBagAfter', XX._s.bag.length);                         // 3
    const r2 = XX._equipItem('eq_chixiao');                       // 换装
    L('equipSwapDelta', r2.delta);                                // 1800-500=1300
    L('equipReplaced', r2.replaced);                              // eq_qingfeng
    L('equipOldBack', XX._s.bag.some(x => x.t === 'eq_qingfeng') ? 'yes' : 'no');
    L('equipSum', XX._power() - cpBase);                          // 1800
    XX._equipItem('eq_huxin');                                    // 再穿防具
    L('multiSlotSum', XX._power() - cpBase);                      // 1800+400=2200
    const u1 = XX._unequipItem('armor');
    L('unequipOk', u1.ok ? 'yes' : 'no');
    L('unequipSlotEmpty', XX._equippedId('armor') === null ? 'yes' : 'no');
    L('unequipBack', XX._s.bag.some(x => x.t === 'eq_huxin') ? 'yes' : 'no');
    const bad = XX._equipItem('dan1');                            // 丹药不可装备
    L('equipReject', (bad.ok === false && bad.reason === 'not-equip') ? 'yes' : 'no');
    XX._s.equipment = { weapon:null, armor:null, accessory:null };   /* 复原，别污染后续用例 */

    /* ---- 人物 · 装备面板：属性区 + 三槽 + 背包「装备」按钮联动 ---- */
    /* 第 88 轮 B 拆页：hub 五格（道体法宝 / 札记 / 道碑 / 悟道 / 断天门），战力账落在法宝页页眉 */
    window.switchTab('role');
    L('roleHubCells', document.querySelectorAll('#page-role .hub-nav [data-jump]').length);   // 6（第 6 格：识人 · 沈碑）
    L('roleHubCards', document.querySelectorAll('#page-role .panel-body > .card').length);    // 0
    L('roleHubSealMiles', document.getElementById('xx-hub-role-miles').textContent);           // 0/N 碑
    window.switchTab('role_equip');
    L('roleShown', document.getElementById('page-role') ? 'yes' : 'no');
    L('roleStatsOk', (document.getElementById('xx-role-stats').textContent || '').indexOf('道号') >= 0 &&
                     (document.getElementById('xx-role-stats').textContent || '').indexOf('修为产出') >= 0 ? 'yes' : 'no');
    L('roleSlots', document.querySelectorAll('.equip-slot').length);
    L('roleAllEmpty', document.querySelectorAll('.equip-slot .es-empty').length);
    /* 第 95 轮 · 空槽不再只有一个「空」字：影子 + 一句状态 + 一行功效。
       这一档读的是「背包里一件法宝都没有」，所以先把包腾空、读完原样放回。 */
    const esList = (sel) => Array.prototype.map.call(document.querySelectorAll(sel), e => e.textContent).join(' / ');
    const bagKeep = XX._s.bag; XX._s.bag = []; XX._render();
    L('roleEmptyTxt', esList('.equip-slot .es-empty'));
    L('roleTipTxt', esList('.equip-slot .es-tip'));
    const ghosts = document.querySelectorAll('.equip-slot img.es-ghost');
    L('roleGhost', ghosts.length + '/' + (ghosts.length ? Array.prototype.every.call(ghosts, i => (i.getAttribute('src') || '').indexOf('ui/icons/') === 0) : 'na'));
    XX._s.bag = bagKeep; XX._render();
    L('slotRing', (() => { const b = getComputedStyle(document.querySelector('.equip-slot')); return /inset/.test(b.boxShadow) ? 'yes' : 'no'; })());
    window.switchTab('bag');
    XX._s.bag = [{t:'eq_qingfeng',n:'青锋剑'}]; XX._render();
    XX._itemDetail(0);
    L('itemEquipBtn', !!document.querySelector('#it-acts [data-do="equip"]') ? 'yes' : 'no');
    document.querySelector('#it-acts [data-do="equip"]').click();
    L('equipTreasureShown', document.getElementById('treasure-modal').classList.contains('hidden') ? 'no' : 'yes');
    L('equipTreasureTxt', document.getElementById('t-desc').textContent);
    window.switchTab('role_equip');
    const wSlot = document.querySelector('.equip-slot[data-slot="weapon"]');
    L('slotFilled', wSlot && wSlot.classList.contains('filled') ? 'yes' : 'no');
    L('slotGlow', wSlot && wSlot.classList.contains('glow') ? 'yes' : 'no');
    L('slotItemName', (document.querySelector('#es-weapon .es-name') || {}).textContent || '');
    L('rolePowTxt', (document.getElementById('xx-role-pow') || {}).textContent || '');
    /* 第 95 轮 · 三个圈真的点得动：空槽 + 背包有货 → 点一下就穿上；再点一下卸下退回背包。
       卸下那条问的是原生 confirm，headless 里它会挂死整页（第 95 轮就是这么撞上的），
       所以点之前先把 confirm 定成「确定」、点完再还原。 */
    XX._s.bag = [{ t: 'eq_huxin', n: '照胆镜' }, { t: 'eq_yupei', n: '养元玉佩' }]; XX._render();
    window.switchTab('role_equip');
    const aSlot = document.querySelector('.equip-slot[data-slot="armor"]');
    L('slotCanUp', aSlot.classList.contains('can-up') ? 'yes' : 'no');
    L('slotCandTxt', (aSlot.querySelector('.es-empty') || {}).textContent + ' ' + (aSlot.querySelector('.es-tip') || {}).textContent);
    L('slotCandTitle', aSlot.title || '');
    const cfOld = window.confirm; window.confirm = () => true;
    aSlot.click();
    const aSlot2 = document.querySelector('.equip-slot[data-slot="armor"]');
    L('slotTapFilled', aSlot2.classList.contains('filled') ? 'yes' : 'no');
    L('slotTapName', (aSlot2.querySelector('.es-name') || {}).textContent || '');
    aSlot2.click();
    const aSlot3 = document.querySelector('.equip-slot[data-slot="armor"]');
    L('slotTapDown', aSlot3.classList.contains('filled') ? 'no' : 'yes');
    L('slotTapBack', String(XX._s.bag.filter(b => b.t === 'eq_huxin').length));
    window.confirm = cfOld;
    L('slotTapNoCand', (function(){ XX._s.bag = []; XX._render(); window.switchTab('role_equip');
      const s = document.querySelector('.equip-slot[data-slot="accessory"]'); s.click();
      const r = s.classList.contains('filled') ? 'filled' : 'still-empty';
      return r + '/' + ((document.querySelector('#es-accessory .es-empty') || {}).textContent || ''); })());
    /* ---- 道行拆账（第 77 节）：人物面板入口 / 顶栏 chip → 弹窗；底×乘区+加区 = 面板值 ---- */
    L('pwBtn', !!document.getElementById('xx-role-break') ? 'yes' : 'no');
    document.getElementById('xx-role-break').click();
    L('pwOpen', document.getElementById('power-modal').classList.contains('hidden') ? 'no' : 'yes');
    L('pwSecs', document.querySelectorAll('#pw-body .pw-sec').length);
    L('pwRowN', document.querySelectorAll('#pw-body .pw-row').length);
    const pwTxt = (document.getElementById('pw-body') || {}).textContent || '';
    L('pwNoBad', /NaN|undefined|Infinity/.test(pwTxt) ? 'no' : 'yes');
    L('pwSubTxt', (document.getElementById('pw-sub') || {}).textContent || '');
    const bd = XX._statBreakdown();
    const pwProd = arr => arr.reduce((a, m) => a * m.v, 1);
    L('pwPowCalc', Math.floor(bd.power.base * pwProd(bd.power.mults)) + bd.power.flats.reduce((a, f) => a + f.v, 0));
    L('pwPowNow', XX._power());
    L('pwPowMatch', bd.power.total === XX._power() ? 'yes' : 'no');
    L('pwExpMatch', Math.abs(bd.exp.base * pwProd(bd.exp.mults) - bd.exp.total) <= bd.exp.total * 1e-9 ? 'yes' : 'no');
    L('pwStoneMatch', Math.abs(bd.stone.base * pwProd(bd.stone.mults) - bd.stone.total) <= bd.stone.total * 1e-9 ? 'yes' : 'no');
    L('pwEquipFlat', bd.power.flats.some(f => f.label === '装备' && f.v > 0) ? 'yes' : 'no');
    L('pwTxtHasPow', pwTxt.indexOf('战力') >= 0 && pwTxt.indexOf('灵石') >= 0 && pwTxt.indexOf('修为') >= 0 ? 'yes' : 'no');
    document.getElementById('pw-close').click();
    L('pwClosed', document.getElementById('power-modal').classList.contains('hidden') ? 'yes' : 'no');
    document.getElementById('sc-power-chip').click();
    L('pwChipOpen', document.getElementById('power-modal').classList.contains('hidden') ? 'no' : 'yes');
    L('pwChipTag', document.getElementById('sc-power-chip').tagName);
    XX._closePower();
    const u2 = XX._unequipItem('weapon');
    L('roleUnequipOk', u2.ok ? 'yes' : 'no');
    window.switchTab('role_equip');
    L('slotEmptyAfter', document.querySelector('.equip-slot[data-slot="weapon"]').classList.contains('filled') ? 'no' : 'yes');
    /* 仙途道碑（里程碑）：面板挂点 + 未达成遮「？？？」+ 达成自动发奖 + 红点随"已看"熄灭 */
    /* 第 88 轮 B 拆页：道碑自成一体，格子在 hub、碑在 role_miles */
    window.switchTab('role_miles');
    L('milesBox', !!document.getElementById('xx-role-miles') ? 'yes' : 'no');
    L('milesSub', (document.getElementById('xx-role-miles-sub') || {}).textContent || '');
    L('milesN', document.querySelectorAll('#xx-role-miles .mile').length);
    L('milesLockN', document.querySelectorAll('#xx-role-miles .mile.lock b').length);
    L('milesLockMask', (document.querySelector('#xx-role-miles .mile.lock b') || {}).textContent || '');
    L('milesHint', (document.querySelector('#xx-role-miles .mile.lock em') || {}).textContent || '');
    L('milesHiddenMask', Array.prototype.filter.call(document.querySelectorAll('#xx-role-miles .mile.lock b'), function(b){ return b.textContent === '？？？'; }).length);
    L('milesCap', document.querySelectorAll('#xx-role-miles .m-cap').length);        // 每方碑都有碑额
    L('milesUpright', (function(){                                                   // 碑名竖刻（不是横排列表）
      var b = document.querySelector('#xx-role-miles .mile b');
      return b ? getComputedStyle(b).writingMode : '';
    })());
    L('milesTotal', XX._milesTotal());
    L('milesDotEl', !!document.querySelector('[data-tab="role"] .e-dot') ? 'yes' : 'no');
    /* 造一个达成：打坐 20 次 → 立「引气入体」，自动发奖、亮红点 */
    const mStone0 = XX._s.stone, mExp0 = XX._s.exp;
    XX._s.miles = {}; XX._s.milesNew = [];
    XX._s.stats.sit = 20;
    L('milesHit', XX._checkMiles(true));
    L('milesGot', Object.keys(XX._s.miles).length);
    L('milesReward', (XX._s.stone > mStone0 || XX._s.exp > mExp0) ? 'yes' : 'no');
    L('milesNewN', XX._milesNew());
    L('milesDotOn', document.querySelector('[data-tab="role"] .e-dot').classList.contains('on') ? 'yes' : 'no');
    L('milesDoneTxt', (document.querySelector('#xx-role-miles .mile.done b') || {}).textContent || '');
    L('milesToast', (document.getElementById('toast') || {}).textContent || '');
    /* 进面板即"看过" → 红点灭 */
    XX._milesSeen();
    L('milesDotOff', document.querySelector('[data-tab="role"] .e-dot').classList.contains('on') ? 'no' : 'yes');
    /* 更漏防篡改：存档时间跑到未来 → 本次离线收益作废（堵"改系统时间刷离线"） */
    XX._s.last = Date.now() + 6 * 3600 * 1000;
    const ckB4 = XX._s.stone, ckE0 = XX._s.exp;
    XX._offline();
    L('clockSkip', XX._s.stone === ckB4 && XX._s.exp === ckE0 ? 'yes' : 'no');
    L('clockMsg', (XX._s.log[0] || {}).t || '');
    XX._s.last = Date.now();
    XX._s.miles = {}; XX._s.milesNew = []; XX._s.stats.sit = 0;
    /* 连立多碑（新档瞬间全达成）：toast 只报前三个碑名 + 总数，不许横贯屏幕 */
    const mMulExp0 = XX._s.exp, mMulStone0 = XX._s.stone;
    XX._s.stats.hunt = 300; XX._s.stats.craftPill = 99; XX._s.stats.explore = 99;
    XX._s.stats.stoneEarned = 9e6; XX._s.stats.enhance = 99;
    XX._s.field = 20; XX._s.cave = 8; XX._s.mine = 8; XX._s.forge = 5; XX._s.towerMax = 35;
    XX._s.pets = [{ bid: 'rat', lv: 6, exp: 0 }, { bid: 'wolf', lv: 6, exp: 0 }, { bid: 'tiger', lv: 6, exp: 0 }];
    XX._s.arena = { day: '', left: 0, rep: 300, foes: [] };
    XX._s.union = { start: Date.now(), day: '', left: 0, merit: 900, claimed: [], season: 1 };
    L('milesMultiHit', XX._checkMiles(true));
    L('milesToast2', (document.getElementById('toast') || {}).textContent || '');
    XX._s.miles = {}; XX._s.milesNew = []; XX._s.exp = mMulExp0; XX._s.stone = mMulStone0;
    XX._s.stats.hunt = 0; XX._s.stats.craftPill = 0; XX._s.stats.explore = 0;
    XX._s.stats.stoneEarned = 0; XX._s.stats.enhance = 0;
    XX._s.field = 0; XX._s.cave = 0; XX._s.mine = 0; XX._s.forge = 0; XX._s.towerMax = 0;
    XX._s.pets = []; XX._s.arena = { day: '', left: 0, rep: 0, foes: [] };
    XX._s.union = { start: Date.now(), day: '', left: 0, merit: 0, claimed: [], season: 1 };
    XX._s.bag = [];

    // ---- 寻宝 ----
    /* 第 88 轮 B 拆页：hub 五格（弟子 / 议事 / 气象 / 探索 / 互助），山门品阶落在弟子格朱砂印 */
    window.switchTab('zong');
    L('zongHubCells', document.querySelectorAll('#page-zong .hub-nav [data-jump]').length);   // 5
    L('zongHubCards', document.querySelectorAll('#page-zong .panel-body > .card').length);     // 0
    L('zongHubSealGate', document.getElementById('xx-hub-zong-gate').textContent);             // 未立 · 0/N
    window.switchTab('zong_seek');
    XX._s.stone = 100;
    XX._treasure();
    L('stoneAfterTreasure', XX._s.stone);        // 炼气一层 寻宝 = 40×0.5 = 20
    L('treasureModal', document.getElementById('treasure-modal').classList.contains('hidden') ? 'hidden' : 'shown');
    L('treasureName', document.getElementById('t-name').textContent);

    // ---- 坊市 ----
    L('marketBld', !!document.querySelector('[data-bld="market"]'));
    window.switchTab('market');
    L('marketShown', document.getElementById('page-market').classList.contains('active') ? 'shown' : 'hidden');
    // ---- 第 88 轮 B · 坊市拆页：hub 只放四格，行情 / 寄售 / 货架 / 天机阁各自一页 ----
    L('mkHubCells', document.querySelectorAll('#page-market .hub-nav [data-jump]').length);   // 4
    L('mkHubCards', document.querySelectorAll('#page-market .panel-body > .card').length);    // 0（一格一页，卷首不放卡）
    L('mkSealRate', document.getElementById('xx-hub-mk-rate').textContent);                   // ×1.00 起
    window.switchTab('market_goods');
    L('mkSubOn', document.getElementById('page-market').dataset.sec);                         // mk-goods
    L('mkSubDepth', window.ROUTER.depth());                                                   // 1（按 view 名直开，栈里只有它）
    L('mkSlots', XX._marketGoods().length);                       // 炼气期只解锁 5 种货
    L('mkRows', document.querySelectorAll('#mk-goods .mk-row').length);
    const rk = XX._s.rank; XX._s.rank = 15; XX._s.market.day = '';  // 提高境界 → 全部货解锁
    L('mkSlotsHigh', XX._marketGoods().length);                   // 6 个货架位
    XX._s.rank = rk; XX._s.market.day = '';
    XX._marketGoods();
    XX._s.stone = 100000; XX._render();
    const g0 = XX._marketGoods()[0];
    L('mkPrice', g0.price > 0 && g0.price < 200 ? 'ok' : g0.price);   // 价格锚定炼气一层需求
    const st1 = XX._s.stone;
    XX._buyMarket(0);
    L('mkBought', XX._s.market.goods[0].bought ? 'yes' : 'no');
    L('mkStoneDown', XX._s.stone < st1 ? 'yes' : 'no');
    // 交易反馈：购入浮字（-N 灵石）+ 购入行墨晕（一次性，重绘即失效）
    XX._s.market.goods = [{ id:'dan1', price:50, bought:false }];
    XX._render();
    const mkBuyBtn = document.querySelector('#mk-goods [data-buy]');
    L('mkBuyBtnLive', mkBuyBtn && !mkBuyBtn.disabled ? 'yes' : 'no');
    if(mkBuyBtn) mkBuyBtn.click();
    L('mkSpendFloat', document.querySelectorAll('.spend-float').length >= 1 ? 'yes' : 'no');
    const mkRow0 = document.querySelector('#mk-goods .mk-row');
    L('mkRowFlash', document.querySelectorAll('#mk-goods .mk-row.flash').length);
    XX._render();
    L('mkRowPersist', document.querySelector('#mk-goods .mk-row') === mkRow0 ? 'yes' : 'no');
    XX._s.bag = [{t:'mat_core',n:'妖丹'}]; XX._s.market.sold = 0; XX._render();
    const st2 = XX._s.stone, pNormal = XX._sellPrice('mat_core');
    XX._sellMarket(0);
    L('mkSoldGain', XX._s.stone > st2 ? 'yes' : 'no');
    L('mkSoldCount', XX._s.market.sold);                          // 1
    L('mkBagAfterSell', XX._s.bag.length);                        // 0
    XX._s.market.sold = 20;
    L('mkOverPrice', XX._sellPrice('mat_core') < pNormal ? 'yes' : 'no');   // 超额压价
    XX._s.market.sold = 0;
    XX._s.bag = [{t:'mat_core',n:'妖丹'},{t:'mat_bone',n:'兽骨'}]; XX._render();
    const st3 = XX._s.stone; XX._sellAll();
    L('mkSellAll', XX._s.stone > st3 && XX._s.bag.length === 0 ? 'yes' : 'no');

    // ---- 天机阁（资产比例 + 大额悟道值双扣；与坊市定价脱钩） ----
    /* 场景木牌「天机阁」带的还是老锚点 xx-tianji —— 深链要落到那一页，且 ← 先回坊市 hub */
    window.switchTab('market', 'xx-tianji');
    L('tjDeepLink', window.ROUTER.current());                                                 // market_tianji
    L('tjDeepDepth', window.ROUTER.depth());                                                  // 2（底下压着 hub）
    L('tjRows', document.querySelectorAll('#tj-goods .mk-row').length);              // 3 件
    XX._s.stone = 100000; XX._s.wisdom = 0; XX._s.rank = 0;
    XX._s.shop = { week:'', heart_mirror:0, guard_array:0, tianjiTier:-1 };
    XX._buyGuard('tianji');                                                          // 只有灵石 → 必须拒绝（双扣制）
    L('tjNoStone', XX._s.tianji === 0 && XX._s.stone === 100000 ? 'yes' : 'no');
    XX._s.wisdom = 800; XX._exchangeWisdom('heart_mirror');                          // 800 悟道 + 100000×35% = 35000 灵石
    L('tjExchange', XX._s.guardMirror === 1 && XX._s.wisdom === 0 && XX._s.stone === 65000 ? 'yes' : 'no');
    L('tjLimit', XX._shopLimit('heart_mirror').txt);                                 // 本周 1/2
    XX._s.tianji = 0; XX._s.guardMirror = 0;
    XX._s.shop = { week:'', heart_mirror:0, guard_array:0, tianjiTier:-1 };

    // ---- 经济重构：产出指数增长但远低于物价 / 离线 8 小时上限 / 天机阁按总资产比例 ----
    XX._s.rank = 0; XX._s.dao = 0;
    const inc0 = XX._stoneRate(), need0v = XX._needOf(0);
    XX._s.rank = 25;
    const inc25 = XX._stoneRate(), need25v = XX._needOf(25);
    L('ecoIncExp', inc25 > inc0 * 100 ? 'yes' : 'no:' + inc0 + '/' + inc25);          // 产出随境界指数增长
    L('ecoLag', (inc25 / need25v) < (inc0 / need0v) / 10 ? 'yes' : 'no');             // 25 层时「时产/物价」不足新手 1/10 → 越修越缺钱
    XX._s.rank = 20; XX._s.stone = 4e8; XX._s.wisdom = 0;
    XX._s.shop = { week:'', heart_mirror:0, guard_array:0, tianjiTier:-1 };
    const pmEco = XX._shopPrice('heart_mirror', 'stone');
    L('tjAssetRatio', Math.abs(pmEco - Math.floor(4e8 * 0.35)) <= 1 ? 'yes' : 'no:' + pmEco);   // 护心镜 = 总资产 35%
    XX._buyGuard('heart_mirror');
    L('tjAssetNoWisdom', XX._s.guardMirror === 0 && XX._s.stone === 4e8 ? 'yes' : 'no');        // 悟道值不足 → 双扣拦截，灵石分文未扣
    XX._s.wisdom = 1e6; XX._buyGuard('heart_mirror');
    L('tjReveal', document.getElementById('treasure-modal').classList.contains('hidden') ? 'hidden' : 'shown');
    L('tjRevealName', document.getElementById('t-name').textContent);
    document.getElementById('t-close').click();                     // 合上，别影响后续 DIAG
    L('tjRevealClosed', document.getElementById('treasure-modal').classList.contains('hidden') ? 'yes' : 'no');
    const pwEco = Math.floor(800 * Math.pow(1.15, 20));
    L('tjAssetBuy', XX._s.guardMirror === 1 && Math.abs(XX._s.stone - (4e8 - pmEco)) < 1 && XX._s.wisdom === 1e6 - pwEco ? 'yes' : 'no');
    /* ---- 大额灵石（>2^31）体检 ----
       位运算 | 0 把 30 亿折成 -1294967296：报价变成"买不起"、余额判定说"不够"、
       主线发奖把财富抹成负数。层 23 起一层灵石收入就是 30 亿量级（见 _curve.js），
       这不是理论边界，是玩家一定会走到的地方。
       两个方向都要查：3e9 → (|0) 翻负（有钱买不了）；9e9 → (|0) 得到 4.19 亿
       （报价被压低 7 倍，等于白送，是经济漏洞）。 */
    XX._s.rank = 24; XX._s.dao = 0; XX._s.stone = 3e9; XX._s.wisdom = 1e12;
    XX._s.shop = { week:'', heart_mirror:0, guard_array:0, tianjiTier:-1 }; XX._s.guardMirror = 0;
    const pmBig = XX._shopPrice('heart_mirror', 'stone');
    L('bigPrice', pmBig === Math.floor(3e9 * 0.35) ? 'yes' : 'no:' + pmBig);             // 报价按真实总资产
    L('bigEnough', (XX._wisdomShop().filter(function(x){ return x.id === 'heart_mirror'; })[0] || {}).enoughStone === true
      ? 'yes' : 'no');                                                                    // UI 必须说"够"
    const stMid = XX._s.stone;
    const buyBig = XX._buyShop('heart_mirror');
    L('bigBuy', buyBig === true && XX._s.stone === stMid - pmBig && XX._s.guardMirror === 1
      ? 'yes' : 'no:' + XX._s.stone + '/' + pmBig);
    XX._s.stone = 9e9; XX._s.wisdom = 1e12; XX._s.guardMirror = 0;
    XX._s.shop = { week:'', heart_mirror:0, guard_array:0, tianjiTier:-1 };
    const pmHuge = XX._shopPrice('heart_mirror', 'stone');
    L('hugePricePos', pmHuge > 2147483647 && pmHuge === Math.floor(9e9 * 0.35) ? 'yes' : 'no:' + pmHuge);   // 报价本身就超 2^31，旧代码只报 1.47 亿
    L('hugeEnough', (XX._wisdomShop().filter(function(x){ return x.id === 'heart_mirror'; })[0] || {}).enoughStone === true
      ? 'yes' : 'no');
    const stHuge = XX._s.stone;
    const buyHuge = XX._buyShop('heart_mirror');
    L('hugeBuy', buyHuge === true && XX._s.stone === stHuge - pmHuge ? 'yes' : 'no:' + XX._s.stone);
    L('hugeRest', XX._s.stone > 2147483647 ? 'yes' : 'no:' + XX._s.stone);               // 付完仍是正常大额
    /* 主线发奖（tick 里自动入账）：绝不能把财富抹成负数 */
    const segBig = (window.Story && Story._STORY ? Story._STORY : []).filter(function(q){
      return (q.rw || []).some(function(p){ return p[0] === 'stoneK'; });
    })[0];
    delete XX._s.story.claimed[segBig.id];
    const stStory = XX._s.stone;
    const gotBig = Story._settle(segBig) || [];
    const nBig = (gotBig.filter(function(g){ return g.k === 'stone'; })[0] || { n: 0 }).n;
    L('bigStory', nBig > 0 && XX._s.stone === stStory + nBig && XX._s.stone > 2147483647
      ? 'yes' : 'no:' + XX._s.stone + '/+' + nBig + '/from' + stStory);
    L('bigStorySeg', segBig.id);
    XX._s.story.claimed[segBig.id] = 0;                                  // 收尾复原，别影响后面的主线用例
    /* 发奖会弹窗：替玩家合上，别把后面的 DIAG 用例压在 modal 底下 */
    ['treasure-modal', 'story-modal'].forEach(function(mid){
      const m = document.getElementById(mid);
      if(m && !m.classList.contains('hidden')){
        const c = m.querySelector('.m-close') || document.getElementById('t-close');
        if(c) c.click();
        m.classList.add('hidden');
      }
    });
    XX._s.rank = 0; XX._s.stone = 100000; XX._s.wisdom = 0; XX._s.guardMirror = 0;
    XX._s.shop = { week:'', heart_mirror:0, guard_array:0, tianjiTier:-1 };
    // 离线封顶（W2 后 = max(12h, 8h×1.12^…)）：伪造 100 小时前上线 → 结算不超过封顶满额产出
    XX._s.rank = 10; XX._s.dao = 0; XX._s.field = 0; XX._s.mine = 0; XX._s.huntBeast = null;
    const capGain = XX._stoneRate() * XX._offlineCap();
    XX._s.last = Date.now() - 100 * 3600 * 1000;
    const stB4 = XX._s.stone;
    XX._offline();
    L('ecoOfflineCap', (XX._s.stone - stB4) <= capGain + 1 && (XX._s.stone - stB4) > capGain * 0.9 ? 'yes' : 'no:' + (XX._s.stone - stB4) + '/' + capGain);
    XX._s.rank = 0; XX._s.stone = 100000; XX._s.wisdom = 0;

    // ---- 法宝强化 / 洗练 ----
    window.switchTab('dong_enhance');
    XX._s.weapon = 1; XX._s.weaponLv = 0; XX._s.weaponBless = 0; XX._s.affix = [];
    XX._s.ore = 1000; XX._s.stone = 100000; XX._render();
    L('enhBox', document.getElementById('xx-enhance').textContent.indexOf('法宝') >= 0 ? 'yes' : 'no');
    L('enhNextTxt', (document.querySelector('#xx-enhance .enh-next') || {}).textContent || '');
    const pw0 = XX._power(), rt0 = XX._rate(), ore0 = XX._s.ore;
    XX._s.weaponBless = 5;                                  // 祝福值满 = 必成
    XX._enhance();
    L('enhLv', XX._s.weaponLv);                             // 1
    L('enhOreDown', XX._s.ore < ore0 ? 'yes' : 'no');
    L('enhPowUp', XX._power() > pw0 ? 'yes' : 'no');
    L('enhExpUp', XX._rate() > rt0 ? 'yes' : 'no');
    L('enhBlessReset', XX._s.weaponBless);                  // 0
    XX._s.weaponLv = 5; XX._s.bag = []; XX._render();
    L('enhNext6', ((document.querySelector('#xx-enhance .enh-next') || {}).textContent || '').indexOf('下一级 +6') >= 0 ? 'yes' : 'no');
    L('enhMat5', XX._enhanceCost().mat);                    // boss_core
    const lvBefore = XX._s.weaponLv;
    XX._enhance();
    L('enhBlocked', XX._s.weaponLv === lvBefore ? 'yes' : 'no');   // 缺稀有材料 → 强化不了
    XX._s.weaponLv = 0; XX._s.affix = [];
    XX._s.bag = [{t:'boss_core',n:'兽王精魄'}]; XX._s.stone = 100000; XX._render();
    const st4 = XX._s.stone;
    XX._reroll();
    L('affixN', XX._affix().length);                        // 1 条（下品法宝）
    L('rerollPay', XX._s.stone === st4 - XX._rrCost ? 'yes' : 'no');  // 固定扣 5000 灵石
    L('rerollNoMat', XX._s.bag.length === 1 ? 'yes' : 'no');          // 不再消耗稀有材料
    L('rrInsufficient', (function(){
      XX._s.stone = 10;                                     // 灵石不足
      const a0 = JSON.stringify(XX._affix());
      XX._reroll();
      const same = JSON.stringify(XX._affix()) === a0 && XX._s.stone === 10;
      XX._s.stone = 100000;
      return same ? 'yes' : 'no';
    })());
    // ---- 洗练弹窗（同步 UI 部分；老虎机演出为异步定时器，不在同步断言内） ----
    XX._openReroll();
    const rm = document.getElementById('reroll-modal');
    L('rrModal', rm && !rm.classList.contains('hidden') ? 'yes' : 'no');
    L('rrSlots', document.querySelectorAll('#reroll-modal .rr-slot').length);          // 4 槽
    L('rrSlot0', document.getElementById('rr-slot-0').textContent.indexOf('·') >= 0 ? 'yes' : 'no');
    L('rrLocked1', document.getElementById('rr-slot-1').textContent.indexOf('未开启') >= 0 ? 'yes' : 'no');
    L('rrGo', document.getElementById('rr-go').textContent.indexOf('5000') >= 0 ? 'yes' : 'no');
    L('rrLockNone', document.querySelectorAll('#reroll-modal .rr-lock').length);       // 只有 1 条词条 → 没有锁钮
    // 神品四条词条：四槽全开，可锁 1~3 条，价格按 2^锁数 翻倍
    XX._s.weapon = 4;
    XX._s.affix = [{id:'exp',q:4},{id:'pow',q:3},{id:'brk',q:2},{id:'stone',q:1}];
    XX._render(); XX._openReroll();
    L('rrSlots4On', document.querySelectorAll('#reroll-modal .rr-slot .rr-lock').length);  // 4
    L('rrSlot3', document.getElementById('rr-slot-3').textContent.indexOf('灵石产出') >= 0 ? 'yes' : 'no');
    document.querySelector('#rr-slot-0 .rr-lock').click();
    L('rrLockOn', document.getElementById('rr-slot-0').classList.contains('locked') ? 'yes' : 'no');
    L('rrCostLock1', document.getElementById('rr-go').textContent);
    document.querySelector('#rr-slot-1 .rr-lock').click();
    L('rrCostLock2', document.getElementById('rr-go').textContent);
    document.querySelector('#rr-slot-2 .rr-lock').click();
    document.querySelector('#rr-slot-3 .rr-lock').click();   // 第四条锁不上：至少留一条洗练
    L('rrLockMax', document.querySelectorAll('#reroll-modal .rr-slot.locked').length);    // 3
    L('rrCostLock3', document.getElementById('rr-go').textContent);
    [0,1,2].forEach(i => document.querySelector('#rr-slot-' + i + ' .rr-lock').click());
    L('rrCostBack', document.getElementById('rr-go').textContent);
    document.getElementById('rr-close').click();
    L('rrClosed', document.getElementById('reroll-modal').classList.contains('hidden') ? 'yes' : 'no');
    // 同步结算也要锁得住：保留 0/2 槽，只重掷 1/3 槽，扣 2 条锁的钱
    XX._s.weapon = 4; XX._s.weaponLv = 0; XX._s.stone = 100000;
    XX._s.affix = [{id:'exp',q:4},{id:'pow',q:3},{id:'brk',q:2},{id:'stone',q:1}];
    const stK = XX._s.stone;
    XX._reroll([0, 2]);
    L('rrKeepN', XX._s.affix.length);                        // 4
    L('rrKeep0', XX._s.affix[0].id === 'exp' && XX._s.affix[0].q === 4 ? 'yes' : 'no');
    L('rrKeep2', XX._s.affix[2].id === 'brk' && XX._s.affix[2].q === 2 ? 'yes' : 'no');
    L('rrKeepCost', stK - XX._s.stone);                      // 20000
    L('rrKeepUniq', new Set(XX._s.affix.map(a => a.id)).size === 4 ? 'yes' : 'no');
    XX._s.weapon = 1; XX._s.weaponLv = 0; XX._s.affix = []; XX._render();

    // ---- 生产建筑：炼丹房 / 炼器坊 + 匠道阶位 ----
    window.switchTab('dong_ups');
    L('ups', document.querySelectorAll('.upg').length);                          // 6（3 功法+洞府+炼丹房+炼器坊）
    XX._s.dan = 0; XX._s.forge = 0; XX._s.bag = [];
    XX._s.mastery = { alchemyLv: 1, alchemyExp: 0, forgeLv: 1, forgeExp: 0 };
    XX._s.stone = 100000; XX._s.herb = 9999; XX._s.ore = 9999; XX._s.herb100 = 5; XX._s.herb10000 = 2;
    XX._render();
    L('upsDanRow', document.querySelectorAll('#xx-ups .upg').length);          // 6（含炼丹房/炼器坊）
    L('upsMasteryTxt', Array.from(document.querySelectorAll('#xx-ups .upg small')).map(x => x.textContent).join(' ~ '));   // 含「丹师 1 阶」「器师 1 阶」
    L('upsArrowN', (function(){                                                          // 第 77 节：升级行带「当前 → 下一级」
      return (Array.from(document.querySelectorAll('#xx-ups .upg small')).map(x => x.textContent).join('').match(/→/g) || []).length;
    })());
    L('upsCaveArrow', document.querySelectorAll('#xx-ups .upg small')[3].textContent.indexOf('→ ×') >= 0 ? 'yes' : 'no');
    L('upsDanArrow', (function(){
      const s = document.querySelectorAll('#xx-ups .upg small')[4].textContent;
      return s.indexOf('炼制 +0% → +2%') >= 0 && s.indexOf('突破 +0% → +2%') >= 0 ? 'yes' : 'no';
    })());
    window.switchTab('dong_alchemy');
    L('masteryLine', (() => { const m = document.querySelector('.mastery-line'); return m ? (m.textContent.indexOf('丹师') >= 0 ? 'yes' : 'no') : 'none'; })());
    XX._upgradeBuilding('alchemy');
    L('upgDanLv', XX._s.dan);                                                   // 1
    XX._upgradeBuilding('forge');
    L('upgForgeLv', XX._s.forge);                                               // 1
    L('bldStates', Object.keys(XX._buildings()).length === 2 ? 'yes' : 'no');
    const realRnd = Math.random; Math.random = () => 0;                          // 必成
    XX._craftItem('alchemy', 'dan1');
    L('craftDan1', XX._s.bag.filter(x => x.t === 'dan1').length);               // 1
    L('masteryExp1', XX._s.mastery.alchemyExp);                                 // 10（tier1 × 10）
    L('craftRate', Math.round(XX._craftRate(XX._recipes.dan1) * 100));        // 92 = 90 + 1×2
    XX._s.mastery.alchemyLv = 3; XX._s.mastery.forgeLv = 3;
    XX._s.forge = 5; XX._s.ore = 200; XX._s.bag = [{t:'boss_core',n:'兽王精魄'}];
    XX._craftItem('forge', 'wp4');
    L('craftWp4', XX._s.weapon);                                                // 4
    Math.random = realRnd;

    // ---- 丹方收集（第 69 节）：炼满炉数参透旁方，同一丹药换材料 ----
    XX._s.dan = 7; XX._s.mastery = { alchemyLv: 5, alchemyExp: 0, forgeLv: 3, forgeExp: 0 };
    XX._s.recipeN = {}; XX._s.herb = 9999; XX._s.herb100 = 9; XX._s.herb10000 = 9;
    XX._s.stone = 1e6; XX._s.bag = [];
    XX._render();
    L('danCodex0', document.querySelector('.recipe-codex') ? document.querySelector('.recipe-codex').textContent : 'none');
    L('danAltRows0', document.querySelectorAll('#xx-alchemy .craft.alt').length);   // 0
    L('danHint0', (function(){ const r = document.querySelector('#xx-alchemy .craft');
      return r && r.querySelector('small').textContent.indexOf('旁方 0/5') >= 0 ? 'yes' : 'no'; })());
    L('danAltLocked', XX._variantUnlocked('dan1') ? 'yes' : 'no');                  // no
    const realRnd2 = Math.random; Math.random = () => 0;
    XX._craftItem('alchemy', 'dan1');
    L('recipeN1', XX._s.recipeN.dan1);                                              // 1
    XX._s.recipeN.dan1 = 4;
    XX._craftItem('alchemy', 'dan1');                                               // 第 5 炉 → 参透
    L('recipeN5', XX._s.recipeN.dan1);                                              // 5
    L('variantUnlocked1', XX._variantUnlocked('dan1') ? 'yes' : 'no');              // yes
    L('variantCount1', XX._variantCount());                                         // 1
    L('variantNextName', (XX._variantNext() || {}).base);                           // dan2
    XX._render();
    L('danAltRows1', document.querySelectorAll('#xx-alchemy .craft.alt').length);   // 1
    L('danCodex1', document.querySelector('.recipe-codex').textContent);
    XX._s.bag = [{ t: 'mat_core', n: '妖丹' }];
    XX._craftItem('alchemy', 'dan1_alt');
    L('altPillGain', XX._s.bag.filter(x => x.t === 'dan1').length);                 // 1
    L('altMatLeft', XX._s.bag.filter(x => x.t === 'mat_core').length);              // 0
    L('recipeNAfterAlt', XX._s.recipeN.dan1);                                       // 5（旁方不反向计数）
    L('altSameOut', XX._variants.dan1.out === XX._recipes.dan1.out ? 'yes' : 'no');
    L('altMatsDiff', JSON.stringify(XX._variants.dan1.mats) !== JSON.stringify(XX._recipes.dan1.mats) ? 'yes' : 'no');
    Math.random = realRnd2;
    /* 未参透的旁方：拿到 id 也不许炼，一格料都不扣 */
    XX._s.recipeN = {}; XX._s.bag = []; XX._s.herb = 99; XX._s.stone = 1e6;
    XX._craftItem('alchemy', 'dan1_alt');
    L('altLockedBag', XX._s.bag.length);                                            // 0
    /* 旧妖丹方（dan2_core）同样是中品丹的一条路：炼它也要记进 dan2 的炉数 */
    XX._s.recipeN = { dan2: 3 }; XX._s.herb = 9999; XX._s.stone = 1e6;
    XX._s.bag = [{ t: 'mat_core', n: '妖丹' }, { t: 'mat_core', n: '妖丹' }];
    Math.random = () => 0;
    XX._craftItem('alchemy', 'dan2_core');
    Math.random = realRnd2;
    L('dan2FamilyN', XX._s.recipeN.dan2);                                           // 4
    L('dan2AltUnlocked', XX._variantUnlocked('dan2') ? 'yes' : 'no');
    L('dan2UnlockLog', ((XX._s.log[0] || {}).t || '').indexOf('骨引方') >= 0 ? 'yes' : 'no');

    /* ---- 第 89 节 · 丹药四族九阶：表齐不齐、阶的闸门、三个槽接没接上钩子 ----
       老五枚（dan1..dan5）一个字段都不许动，新三十一枚只加不改，
       所以这一段既量新表，也回头量旧档与旧图标。 */
    const danBak = { rank: XX._s.rank, exp: XX._s.exp, log: XX._s.log, mine: XX._s.mine };
    XX._s.dan = 9; XX._s.mastery = { alchemyLv: 9, alchemyExp: 0, forgeLv: 3, forgeExp: 0 };
    XX._s.recipeN = {}; XX._s.bag = []; XX._s.mine = 5;
    XX._s.danExp = { mult: 0, until: 0 }; XX._s.danPow = { pct: 0, until: 0 }; XX._s.danGain = { pct: 0, until: 0 };
    XX._s.herb = 99999; XX._s.herb100 = 999; XX._s.herb10000 = 99; XX._s.ore = 9999; XX._s.stone = 1e6;
    window.switchTab('dong_alchemy'); XX._render();
    L('danTblN', Object.keys(XX._dan.all).length);
    L('danPerFam', ['po', 'jl', 'ct', 'fc'].map(f => XX._dan.list.filter(d => d.fam === f).length).join(','));
    L('danSegUniq', (function () { var s = {}; XX._dan.list.forEach(function (d) { s[d.fam + '-' + d.seg] = 1; }); return Object.keys(s).length; })());
    L('danLegacyFive', ['dan1', 'dan2', 'dan3', 'dan4', 'dan5'].map(id => XX._dan.all[id].legacy ? 1 : 0).join(''));
    L('danBreakMatch', XX._breakPills.every(function (bp) { var d = XX._dan.all[bp.id];
      return !!d && d.name === bp.name && d.seg === bp.seg && d.brk === bp.bonus; }) ? 'yes' : 'no');
    L('danRecipMatch', XX._dan.list.every(function (d) { var r = XX._recipes[d.id];
      return !!r && r.out === d.id && r.fam === d.fam && r.seg === d.seg && r.bld === 'alchemy'; }) ? 'yes' : 'no');
    L('danSellGate', XX._dan.list.filter(d => XX._sellPrice(d.id) > 0).length);
    L('danSellTier', XX._dan.list.filter(d => XX._sellPrice(d.id) > 0).every(d => d.tier <= 3) ? 'yes' : 'no');
    L('danHeads', document.querySelectorAll('#xx-alchemy .dan-fam').length);
    L('danHeadTxt', [].map.call(document.querySelectorAll('#xx-alchemy .dan-fam b'), b => b.textContent).join(','));
    L('danHeadArt', [].map.call(document.querySelectorAll('#xx-alchemy .dan-fam img'),
      i => (i.getAttribute('src') || '').replace('ui/icons/', '')).join(','));
    L('danRowsAll', document.querySelectorAll('#xx-alchemy .craft.dan').length);
    L('danSegTags', document.querySelectorAll('#xx-alchemy .dan-seg').length);
    L('danEffTags', document.querySelectorAll('#xx-alchemy .craft-eff').length);
    L('danBand', ['t1', 't2', 't3', 't4', 't5'].map(c => document.querySelectorAll('#xx-alchemy .craft.dan.' + c).length).join(','));
    L('danBagMeta', XX._dan.list.filter(d => !d.legacy && XX._items[d.id] && XX._items[d.id].usage && XX._items[d.id].source).length);
    L('danOldNames', ['dan1', 'dan2', 'dan3', 'dan4', 'dan5'].map(id => XX._items[id].n).join(','));
    L('danOldImgs', ['dan1', 'dan2', 'dan3', 'dan4', 'dan5'].map(id => XX._items[id].img).join(','));
    /* 阶 = 大境界段：金丹期要第 2 阶，九转金丹（第 3 阶）认、下品破境丹（第 1 阶）不认 */
    XX._s.rank = 12;
    L('danGate', [XX._pillValid('dan_jindan') ? 1 : 0, XX._pillValid('dan2') ? 1 : 0, XX._pillValid('dan1') ? 1 : 0].join(''));
    XX._s.rank = danBak.rank;
    /* 三槽各自独立、与奇遇叠乘：吃 5 阶聚灵 / 淬体 / 丰产，四个钩子里正好乘上 (1+x) */
    const danE0 = XX._rate(), danP0 = XX._power(), danM0 = XX._dan.mineRate();
    XX._resetCd(); XX._s.herb = 0; XX._act('herb');
    L('danHerb0', XX._s.herb);
    XX._dan.eat('jl5'); XX._dan.eat('ct5'); XX._dan.eat('fc5');
    L('danBuffs', [XX._dan.buff().exp, XX._dan.buff().pow, XX._dan.buff().gain].join(','));
    var danBd = XX._statBreakdown();
    /* 战力是「底 × 乘区 + 灵兽/装备」，取整在乘区之后 → 吃丹前后的比值不相乘，
       只能验乘区里那一档确实是 ×1.24，并且拆账式子重算出来等于实时战力 */
    var danPwRow = danBd.power.mults.filter(function (x) { return x.label.indexOf('淬体') >= 0; })[0];
    var danExPw = Math.floor(danBd.power.base * danBd.power.mults.reduce((a, x) => a * x.v, 1)) +
                  danBd.power.flats.reduce((a, x) => a + x.v, 0);
    L('danBdLabels', [danBd.exp.mults.some(x => x.label.indexOf('聚灵') >= 0) ? 1 : 0,
                      danBd.power.mults.some(x => x.label.indexOf('淬体') >= 0) ? 1 : 0].join(','));
    L('danHookExp', Math.abs(XX._rate() - danE0 * (1 + XX._dan.buff().exp)) < 1e-6 ? 'yes' : 'no');
    L('danHookPow', danPwRow && Math.abs(danPwRow.v - 1.24) < 1e-9 &&
      danExPw === XX._power() && XX._power() > danP0 ? 'yes' : 'no');
    L('danHookMine', Math.abs(XX._dan.mineRate() - danM0 * (1 + XX._dan.buff().gain)) < 1e-9 ? 'yes' : 'no');
    XX._resetCd(); XX._s.herb = 0; XX._act('herb');
    L('danHookHerb', XX._s.herb);
    L('danHerbLog', ((XX._s.log[0] || {}).t || '').indexOf('丰产丹效力之中') >= 0 ? 'yes' : 'no');
    L('danBdExpEq', Math.abs(danBd.exp.total - danBd.exp.base * danBd.exp.mults.reduce((a, x) => a * x.v, 1)) < 1e-6 ? 'yes' : 'no');
    L('danBdPowEq', danExPw === danBd.power.total ? 'yes' : 'no');
    /* 过期即失效：until 拧到过去，三个槽必须一起归 0 */
    XX._s.danExp.until = Date.now() - 1000; XX._s.danPow.until = Date.now() - 1000; XX._s.danGain.until = Date.now() - 1000;
    L('danExpire', [XX._dan.buff().exp, XX._dan.buff().pow, XX._dan.buff().gain].join(','));
    /* 破境族照旧：立得修为 + pillBonus，另外三个槽一格都不占 */
    XX._s.exp = 0; XX._s.pillUntil = 0; XX._s.pillBonus = 0;
    XX._dan.eat('dan_jindan');
    L('danPoExp', XX._s.exp > 0 ? 'yes' : 'no');
    L('danPoBonus', XX._s.pillBonus);
    L('danPoSlots', [XX._dan.buff().exp, XX._dan.buff().pow, XX._dan.buff().gain].join(','));
    L('danPoLog', ((XX._s.log[0] || {}).t || '').indexOf('九转金丹') >= 0 ? 'yes' : 'no');
    XX._s.rank = danBak.rank; XX._s.exp = danBak.exp; XX._s.log = danBak.log; XX._s.mine = danBak.mine;
    XX._s.danExp = { mult: 0, until: 0 }; XX._s.danPow = { pct: 0, until: 0 }; XX._s.danGain = { pct: 0, until: 0 };
    XX._s.pillUntil = 0; XX._s.pillBonus = 0;

    /* ---- 第 90 节 · 法器四族九阶：表齐不齐、四槽互不覆盖、三个钩子接没接上 ----
       老四条 wp1..wp4 的名称 / 材料 / 成功率 / 倍率一个字都不许动（老档按 outLv 反查名字），
       新三十二条只加不改；灵器仍走 S.weapon，另三族各占 S.art 一格。 */
    const artBak = { weapon: XX._s.weapon, art: JSON.parse(JSON.stringify(XX._s.art)),
      forge: XX._s.forge, mastery: JSON.parse(JSON.stringify(XX._s.mastery)),
      ore: XX._s.ore, stone: XX._s.stone, bag: XX._s.bag, log: XX._s.log,
      rank: XX._s.rank, dan: XX._s.dan, affix: XX._s.affix, weaponLv: XX._s.weaponLv, dao: XX._s.dao,
      failBonus: XX._s.failBonus, wuPaid: JSON.parse(JSON.stringify(XX._s.wuPaid)) };
    XX._s.forge = 10; XX._s.mastery = { alchemyLv: 9, alchemyExp: 0, forgeLv: 9, forgeExp: 0 };
    XX._s.weapon = 0; XX._s.art = { bg: 0, brk: 0, cai: 0 }; XX._s.affix = [];
    XX._s.bag = []; XX._s.bagSize = 20; XX._s.ore = 999999; XX._s.stone = 1e6;
    ['mat_bone', 'mat_eye', 'mat_core', 'mat_feather'].forEach(function (t) {
      for(var ai = 0; ai < 200; ai++) XX._s.bag.push({ t: t, n: t });
    });
    XX._s.rank = 0; XX._s.dan = 0; XX._s.dao = 0; XX._s.failBonus = 0;
    window.ROUTER.open('dong_forge'); XX._render();
    L('artTblN', Object.keys(XX._art.all).length);
    L('artPerFam', XX._art.fams.map(f => XX._art.list.filter(d => d.fam === f).length).join(','));
    L('artSegUniq', (function () { var s = {}; XX._art.list.forEach(function (d) { s[d.fam + '-' + d.seg] = 1; }); return Object.keys(s).length; })());
    L('artLegacyFour', ['wp1', 'wp2', 'wp3', 'wp4'].map(id => (XX._art.all[id] && XX._art.all[id].legacy && XX._art.all[id].fam === 'lq') ? 1 : 0).join(''));
    L('artRecipMatch', XX._art.list.every(function (d) { var r = XX._recipes[d.id];
      return !!r && r.bld === 'forge' && r.fam === d.fam && r.seg === d.seg &&
        r.outLv === d.seg && (r.out === 'art' || r.out === 'weapon') && r.reqLv === d.reqLv && Math.abs(r.rate - d.rate) < 1e-9; }) ? 'yes' : 'no');
    L('artOldNames', ['wp1', 'wp2', 'wp3', 'wp4'].map(id => XX._recipes[id].name).join(','));
    L('artOldRates', ['wp1', 'wp2', 'wp3', 'wp4'].map(id => XX._recipes[id].rate).join(','));
    L('artCurveLv', XX._art.curve.reqLv.join(','));
    L('artCurveTier', XX._art.curve.tier.join(','));
    L('artMatsOre', XX._art.list.every(function (d) {
      var r = XX._recipes[d.id], ore = (r.mats || []).filter(m => m.t === 'ore' && m.n > 0)[0];
      return !!ore && (d.legacy || (r.mats || []).length >= 2); }) ? 'yes' : 'no');
    /* 一张图谱只列一种材料一次：矿石管够，辅料另起一样（第 90 轮实拍抓到的「矿石写两遍」） */
    L('artMatsUniq', XX._art.list.every(function (d) {
      var ts = (XX._recipes[d.id].mats || []).map(m => m.t);
      return ts.length === new Set(ts).size; }) ? 'yes' : 'no');
    L('artAuxMax', Math.max.apply(null, XX._art.list.map(function (d) {
      return Math.max.apply(null, (XX._recipes[d.id].mats || [])
        .filter(m => m.t !== 'ore' && m.t !== 'stone').map(m => m.n)); })));
    /* 灵石按阶只走一档：新图谱写在 mats 里（与第 89 节 DAN_STONE 同口径），逐阶只涨不跌 */
    L('artStoneAll', XX._art.list.filter(function (d) {
      var r = XX._recipes[d.id], n = (r.mats || []).filter(m => m.t === 'stone').length;
      return n <= 1 && (r.stoneK != null || n === 1); }).length);
    L('artStoneUp', (function () { var prev = -1, ok = true;
      ['cai1', 'cai2', 'cai3', 'cai4', 'cai5', 'cai6', 'cai7', 'cai8', 'cai9'].forEach(function (id) {
        var s = (XX._recipes[id].mats || []).filter(m => m.t === 'stone')[0];
        if (!s || s.n <= prev) ok = false; prev = s ? s.n : prev; });
      return ok ? 'up' : 'no'; })());
    L('artBossGate', XX._art.list.filter(d => (XX._recipes[d.id].mats || []).some(m => m.t.indexOf('boss_') === 0)).map(d => d.seg).join(','));
    L('artHeads', document.querySelectorAll('#xx-forge .dan-fam').length);
    L('artHeadTxt', [].map.call(document.querySelectorAll('#xx-forge .dan-fam b'), b => b.textContent).join(','));
    L('artHeadArt', [].map.call(document.querySelectorAll('#xx-forge .dan-fam img'),
      i => (i.getAttribute('src') || '').replace('ui/icons/', '')).join(','));
    L('artRowsAll', document.querySelectorAll('#xx-forge .craft.art').length);
    L('artSegTags', document.querySelectorAll('#xx-forge .dan-seg').length);
    L('artEffTags', document.querySelectorAll('#xx-forge .craft-eff').length);
    L('artBand', ['f-lq', 'f-bg', 'f-brk', 'f-cai'].map(c => document.querySelectorAll('#xx-forge .craft.art.' + c).length).join(','));
    L('artSegTagTxt', (document.querySelector('#xx-forge .craft[data-recipe="wp1"] .dan-seg') || {}).textContent || '');
    L('artEffTxt', [].map.call(document.querySelectorAll('#xx-forge .craft[data-recipe="bg1"] .craft-eff, #xx-forge .craft[data-recipe="brk1"] .craft-eff, #xx-forge .craft[data-recipe="cai1"] .craft-eff'), e => e.textContent).join(' / '));
    L('artOwnedBtn', (function () { XX._s.weapon = 4; XX._s.art = { bg: 5, brk: 0, cai: 9 }; XX._render();
      return ['wp4', 'lq5', 'bg5', 'bg6', 'cai9'].map(function (id) {
        return (document.querySelector('#xx-forge .craft[data-recipe="' + id + '"] button') || {}).textContent || '';
      }).join(','); })());
    L('artHeadOwn', (document.querySelectorAll('#xx-forge .dan-fam')[1] || {}).textContent || '');
    /* 四个钩子：灵器 = weaponMult、战器 = 战力乘区、破器 = 突破加算、财器 = 灵石乘区。
       取元婴段（基础 0.45）量破器，避免 0.90 + 0.10 撞上 breakMax=0.98 的量不出增量。 */
    XX._s.rank = 15; XX._s.weapon = 0; XX._s.art = { bg: 0, brk: 0, cai: 0 }; XX._s.affix = []; XX._s.dan = 0;
    /* A4b（2026-11-20）：四族强化共用 S.weaponLv；这里锁 0，量的是四族基础乘区本身 */
    XX._s.weaponLv = 0;
    XX._render();
    var artE0 = XX._rate(), artP0 = XX._power(), artS0 = XX._stoneRate(), artB0 = XX._breakChanceWith(null);
    L('artB0', artB0);
    L('artName9', XX._weaponName(9));
    L('artMult9', XX._bal.weaponMult[9]);
    XX._s.weapon = 9; XX._s.art = { bg: 9, brk: 9, cai: 9 }; XX._render();
    var artBd = XX._statBreakdown();
    var artPwRow = artBd.power.mults.filter(function (x) { return x.label.indexOf('战器') >= 0; })[0];
    var artStRow = artBd.stone.mults.filter(function (x) { return x.label.indexOf('财器') >= 0; })[0];
    var artPwEx = Math.floor(artBd.power.base * artBd.power.mults.reduce((a, x) => a * x.v, 1)) +
                  artBd.power.flats.reduce((a, x) => a + x.v, 0);
    L('artHookPow', artPwRow && Math.abs(artPwRow.v - 1.56) < 1e-9 && artPwEx === XX._power() && XX._power() > artP0 ? 'yes' : 'no');
    L('artHookStone', artStRow && Math.abs(artStRow.v - 1.75) < 1e-9 &&
      Math.abs(XX._stoneRate() / artS0 - 1.75) < 1e-6 ? 'yes' : 'no');
    L('artHookBrk', Math.round((XX._breakChanceWith(null) - artB0) * 1000) / 1000);   /* 0.1 */
    L('artHookLq', Math.abs(XX._rate() / artE0 - 1.85) < 1e-6 ? 'yes' : 'no');
    L('artBdLabels', artBd.stone.mults.filter(function (x) { return x.label.indexOf('财器') >= 0; }).length +
      '/' + artBd.power.mults.filter(function (x) { return x.label.indexOf('战器') >= 0; }).length);
    L('artBdStoneEq', Math.abs(artBd.stone.total - artBd.stone.base * artBd.stone.mults.reduce((a, x) => a * x.v, 1)) < 1e-6 ? 'yes' : 'no');
    /* 四族各判各的：持有 9 阶不许回炉，低阶也一样 */
    XX._s.art = { bg: 5, brk: 0, cai: 0 }; XX._s.weapon = 6; XX._s.log = [];
    var artStBak = XX._s.stone;
    XX._craftItem('forge', 'bg5'); XX._craftItem('forge', 'bg4'); XX._craftItem('forge', 'lq6');
    L('artGuardFam', [XX._s.art.bg, XX._s.stone === artStBak ? 1 : 0,
      ((XX._s.log[0] || {}).t || '').indexOf('已持有') >= 0 ? 1 : 0].join(','));
    /* 真炼一件：战器 5 阶 → S.art.bg = 5，灵器与另两族一格不动 */
    XX._s.art = { bg: 0, brk: 0, cai: 0 }; XX._s.weapon = 3; XX._s.affix = []; XX._s.log = [];
    XX._s.ore = 999999; XX._s.stone = 1e6; XX._s.bag = [];
    for(var artI = 0; artI < 40; artI++) XX._s.bag.push({ t: 'mat_bone', n: '兽骨' });
    /* 五阶起还要一份辅料（战器是魔晶）——背包得备齐，否则炼不出来，测的就成了「缺料」 */
    for(var artJ = 0; artJ < 6; artJ++) XX._s.bag.push({ t: 'mat_eye', n: '魔晶' });
    var artRnd = Math.random; Math.random = function () { return 0; };
    XX._craftItem('forge', 'bg5');
    Math.random = artRnd;
    L('artEquip', [XX._s.art.bg, XX._s.weapon, XX._s.affix.length,
      ((XX._s.log[0] || {}).t || '').indexOf('战器') >= 0 ? 1 : 0].join(','));
    /* 灵器 5 阶：S.weapon 抬到 5、词条条数按品质封 4 条、名字仍从同一张表查 */
    XX._s.weapon = 4; XX._s.affix = []; XX._s.bag = []; XX._s.log = [];
    for(var artJ = 0; artJ < 10; artJ++) XX._s.bag.push({ t: 'mat_eye', n: '魔晶' });
    var artRnd2 = Math.random; Math.random = function () { return 0; };
    XX._craftItem('forge', 'lq5');
    Math.random = artRnd2;
    L('artEquipLq', [XX._s.weapon, XX._s.affix.length, XX._weaponName(5)].join(','));
    /* 法器不进背包：背包塞满也照炼（brk1 要 2 枚妖丹，正好把 20 格占满） */
    XX._s.art = { bg: 0, brk: 0, cai: 0 }; XX._s.bag = [];
    for(var artK = 0; artK < 18; artK++) XX._s.bag.push({ t: 'mat_bone', n: '兽骨' });
    XX._s.bag.push({ t: 'mat_core', n: '妖丹' }); XX._s.bag.push({ t: 'mat_core', n: '妖丹' });
    XX._s.ore = 999999; XX._s.stone = 1e6;
    var artRnd3 = Math.random; Math.random = function () { return 0; };
    XX._craftItem('forge', 'brk1');
    Math.random = artRnd3;
    L('artNoBag', [XX._s.art.brk, XX._s.bag.length].join(','));
    L('artEffectTxt', ['lq', 'bg', 'brk', 'cai'].map(f => XX._art.effect(f, 9)).join(' / '));
    XX._s.weapon = artBak.weapon; XX._s.art = artBak.art; XX._s.forge = artBak.forge;
    XX._s.mastery = artBak.mastery; XX._s.ore = artBak.ore; XX._s.stone = artBak.stone;
    XX._s.bag = artBak.bag; XX._s.log = artBak.log; XX._s.rank = artBak.rank; XX._s.dan = artBak.dan;
    XX._s.affix = artBak.affix; XX._s.weaponLv = artBak.weaponLv; XX._s.dao = artBak.dao;
    XX._s.failBonus = artBak.failBonus;
    window.switchTab('dong_alchemy');   /* 后面几段都在炼丹房页取行，别把 DOM 留在炼器坊上 */

    // ---- 材料账（第 73 节）：配方 / 建筑升级 / 强化统一写「持有/所需 + 灵石不足」 ----
    XX._s.dan = 5; XX._s.forge = 5;
    XX._s.mastery = { alchemyLv: 5, alchemyExp: 0, forgeLv: 3, forgeExp: 0 };
    XX._s.stone = 0; XX._s.herb = 2; XX._s.herb100 = 0; XX._s.herb10000 = 0;
    XX._s.ore = 0; XX._s.bag = []; XX._s.weapon = 3; XX._s.weaponLv = 5;
    XX._render();
    const lgDan = document.querySelector('#xx-alchemy .craft[data-recipe="dan1"]');
    L('lgDan', lgDan.querySelector('small').textContent);
    L('lgDanBtn', lgDan.querySelector('button').textContent);
    L('lgDanOff', lgDan.querySelector('button').disabled ? 'yes' : 'no');
    /* P0（2026-11-20 修复单）：设施页丹/器行降为镜像；材料账改由房内升级块承担 */
    L('lgUpRoom', (document.getElementById('xx-alchemy-up') || {}).textContent || '');
    window.switchTab('dong_forge');
    L('lgForge', document.querySelector('#xx-forge .craft[data-recipe="wp4"]').querySelector('small').textContent);
    L('lgForgeBtn', document.querySelector('#xx-forge .craft[data-recipe="wp4"]').querySelector('button').textContent);
    window.switchTab('dong_ups');
    L('lgUpg', document.querySelectorAll('#xx-ups .upg')[4].querySelector('button').textContent);
    window.switchTab('dong_enhance');
    L('lgEnh', document.querySelector('#xx-enhance .enh-cost').textContent);
    window.switchTab('dong_alchemy');
    XX._s.stone = 1e6; XX._s.herb = 999; XX._s.ore = 999;
    XX._render();
    const lgDan2 = document.querySelector('#xx-alchemy .craft[data-recipe="dan1"]');
    L('lgDanOk', lgDan2.querySelector('small').textContent.indexOf('（不足）') < 0 ? 'yes' : 'no');
    L('lgDanBtnOk', lgDan2.querySelector('button').textContent);
    XX._s.bagSize = 1; XX._s.bag = [{ t: 'mat_core', n: '妖丹' }];
    XX._render();
    const lgDan3 = document.querySelector('#xx-alchemy .craft[data-recipe="dan1"]');
    L('lgBagBtn', lgDan3.querySelector('button').textContent);
    L('lgBagTxt', lgDan3.querySelector('small').textContent.indexOf('背包已满') >= 0 ? 'yes' : 'no');
    XX._s.bagSize = 20; XX._s.bag = [];

    // ---- 逐层爬塔 / 旧猎妖已删 ----
    XX._s.trun = null; XX._s.trunLast = null;
    XX._s.tower = 1; XX._s.towerMax = 0;
    window.switchTab('tower');
    XX._s.rank = 25; XX._s.stone = 100000; XX._render();
    L('huntRemoved', document.querySelector('#xx-hunt') ? 'no' : 'yes');
    L('towerMobName', (document.querySelector('#xx-tower .tw-mob-main b') || {}).textContent || '');
    L('towerFightBtn', (document.querySelector('#xx-tower [data-act="fight"]') || {}).textContent || '');
    L('boss7', XX._towerBeast(7).name + '/' + (XX._towerBeast(7).boss ? 'boss' : 'no'));
    L('boss10', XX._towerBeast(10).name + '/' + (XX._towerBeast(10).boss ? 'boss' : 'no'));
    L('boss20', XX._towerBeast(20).name);
    L('boss30', XX._towerBeast(30).name);
    L('boss70', XX._towerBeast(70).name);
    L('danImgPng', XX._recipes.dan1.img.slice(-4) === '.png' && XX._recipes.dan4.img.slice(-4) === '.png' ? 'yes' : 'no');

    // ---- 秘境副本 ----
    window.switchTab('secret');
    L('secretShown', document.getElementById('page-secret').classList.contains('active') ? 'shown' : 'hidden');
    XX._s.secret = { prog:[0,0,0,0], day:'', swept:0 };
    XX._s.rank = 8; XX._render();
    L('secTotal0', XX._secretTotal());                        // 0
    const st5 = XX._s.stone;
    XX._challengeSecret(0);
    L('secProg1', XX._secretProg(0));                         // 1
    L('secStone', XX._s.stone > st5 ? 'yes' : 'no');
    /* 秘境通关的即时反馈：以前只有日志一行，现在右上角给一枚 chip */
    L('secChip', (function(){ var c=document.querySelectorAll('#loot-toast .loot-chip.one');
      return c.length ? (c[c.length-1].textContent||'') : ''; })());
    XX._s.rank = 0; XX._render();
    const beforeLock = XX._secretProg(1);
    XX._challengeSecret(1);
    L('secLocked', XX._secretProg(1) === beforeLock ? 'yes' : 'no');   // 境界不够打不了幽谷
    XX._s.rank = 8; XX._s.secret.prog = [10,0,0,0]; XX._s.secret.day = ''; XX._s.secret.swept = 0; XX._render();
    const st6 = XX._s.stone;
    XX._sweepSecret();
    L('secSweep', XX._s.stone > st6 ? 'yes' : 'no');
    L('secSweptFlag', XX._s.secret.swept);                    // 1
    const st7 = XX._s.stone;
    XX._sweepSecret();
    L('secSweepOnce', XX._s.stone === st7 ? 'yes' : 'no');    // 每日一次
    L('secBossMat', document.querySelectorAll('#page-secret .hub-nav [data-jump^="sec-ch"]').length);   // 4 章＝四个格子
    /* 第 88 轮 B 拆页：格子在 hub，战斗框只挂在被点开的那一章那一页 */
    L('secLeadCards', document.querySelectorAll('#page-secret .panel-body > .card').length);            // 1（卷首总览）
    L('secHubSeal', document.getElementById('xx-hub-sec-0').textContent);                                // 10/10 层
    window.switchTab('secret_ch0');
    L('secCh0Boxes', document.querySelectorAll('#page-secret .sec-ch').length);                          // 1
    L('secCh0Done', document.querySelectorAll('#page-secret .sec-lock.done').length);                    // 1
    window.switchTab('secret_ch1');
    L('secCh1Boxes', document.querySelectorAll('#page-secret .sec-ch').length);                          // 1
    L('secCh1Tag', (document.querySelector('#page-secret .sec-ch') || { dataset: {} }).dataset.ch);       // 1（挂的是幽谷）
    window.switchTab('secret');

    // ---- 论剑台 ----
    window.switchTab('arena');
    L('arenaShown', document.getElementById('page-arena').classList.contains('active') ? 'shown' : 'hidden');
    L('arenaBld', !!document.querySelector('[data-bld="arena"]'));
    // ---- 第 88 轮 B · 论剑台拆页：战绩 / 论剑榜 / 声望兑换 各自一页 ----
    L('arHubCells', document.querySelectorAll('#page-arena .hub-nav [data-jump]').length);    // 3
    L('arHubCards', document.querySelectorAll('#page-arena .panel-body > .card').length);     // 0
    window.switchTab('arena_board');
    XX._s.arena = { day:'', left:0, foes:[], tier:0, win:0, lose:0, rep:0 };
    XX._render();
    L('foes', XX._s.arena.foes.length);                       // 6 个对手
    L('arenaLeft', XX._s.arena.left);                         // 每日 5 次
    L('arenaRows', document.querySelectorAll('#xx-arena-foes .ar-row').length);
    const rep0 = XX._s.arena.rep, st8 = XX._s.stone;
    XX._challengeArena(0);
    L('arenaLeftAfter', XX._s.arena.left);                    // 4
    L('arenaRep', XX._s.arena.rep > rep0 ? 'yes' : 'no');
    L('arenaStone', XX._s.stone > st8 ? 'yes' : 'no');
    L('arenaFought', XX._s.arena.foes[0].beat ? 'yes' : 'no');
    /* 论剑胜负的即时反馈：同样是"打赢了"，不该只有日志 */
    L('arenaChip', (function(){ var c=document.querySelectorAll('#loot-toast .loot-chip.one');
      return c.length ? (c[c.length-1].textContent||'') : ''; })());
    XX._s.arena.left = 0;
    const rec0 = XX._s.arena.win + XX._s.arena.lose;
    XX._challengeArena(1);
    L('arenaBlocked', (XX._s.arena.win + XX._s.arena.lose) === rec0 ? 'yes' : 'no');   // 次数耗尽
    XX._s.arena.rep = 500; XX._s.bag = [];
    window.switchTab('arena_shop'); XX._render();
    L('shopRows', document.querySelectorAll('#xx-arena-shop .ar-row').length);         // 7 件
    L('shopFeather', Array.prototype.some.call(document.querySelectorAll('#xx-arena-shop .ar-row'), x => (x.textContent || '').indexOf('朱雀羽') >= 0) ? 'yes' : 'no');
    L('shopHeart', Array.prototype.some.call(document.querySelectorAll('#xx-arena-shop .ar-row'), x => (x.textContent || '').indexOf('九尾心') >= 0) ? 'yes' : 'no');
    const bag0 = XX._s.bag.length;
    XX._buyRep(0);                                            // 上品丹药 30 声望
    L('repDown', XX._s.arena.rep);                            // 470
    L('repItem', XX._s.bag.length > bag0 ? 'yes' : 'no');
    XX._s.arena.rep = 100; L('tier1', XX._tierOf());          // 1 = 内门弟子

    /* ---- 第 101 轮 · 起手式：论剑/秘境打之前先选，选完才结算 ----
       掷骰口子只有一处（论剑的临场发挥、秘境的固定收益），这里把 Math.random 钉成 0.5，
       于是「抢攻 ×1.10 / 守拙 ×0.99」与各档奖励都能直接算出来对账。 */
    (function(){
      const rnd = Math.random;
      Math.random = () => 0.5;
      const opts = () => [].slice.call(document.querySelectorAll('#st-opts [data-st]')).map(b => b.dataset.st).join(',');
      const pick = k => { const b = document.querySelector('#st-opts [data-st="' + k + '"]'); if(b) b.click(); };
      const fight = (i, k, power) => {
        XX._s.arena.foes[i].power = power;
        const st = XX._s.stone, rp = XX._s.arena.rep;
        XX._arenaPick(i); pick(k);
        return { stone: XX._s.stone - st, rep: XX._s.arena.rep - rp, beat: XX._s.arena.foes[i].beat };
      };
      XX._setBattleAnim(false);
      XX._s.rank = 8;
      const need = XX._needOf(8), cp = XX._power();
      XX._s.arena = { day: '', left: 9, foes: [], tier: 0, win: 0, lose: 0, rep: 500 };
      XX._render();
      XX._s.arena.tier = XX._tierOf();                 /* 先把段位钉住，免得赢一场多出晋升那份灵石 */
      XX._arenaPick(0);
      L('stArOpen', XX._stanceOpen() ? 'yes' : 'no');
      L('stArOpts', opts());
      L('stArTitle', document.getElementById('st-title').textContent);
      const left0 = XX._s.arena.left;
      document.getElementById('st-close').click();
      L('stArClosed', XX._stanceOpen() ? 'no' : 'yes');
      L('stArKept', (XX._s.arena.left === left0 && !XX._s.arena.foes[0].beat) ? 'yes' : 'no');
      /* 抢攻·胜：灵石 ×1.2、声望 ×1.5；守拙·胜：灵石 ×1.25、声望原样 */
      const rushW = fight(0, 'rush', 1), guardW = fight(1, 'guard', 1);
      L('stRushWinStone', rushW.stone - Math.floor(need * 0.8 * 1.2));
      L('stRushWinRep', rushW.rep);
      L('stRushWinBeat', rushW.beat ? 'yes' : 'no');
      L('stGuardWinStone', guardW.stone - Math.floor(need * 0.8 * 1.25));
      L('stGuardWinRep', guardW.rep);
      /* 抢攻·负：灵石 ×0.4；守拙·负：灵石 ×1.25 —— 这正是两式的取舍所在 */
      const rushL = fight(2, 'rush', cp * 1e6), guardL = fight(3, 'guard', cp * 1e6);
      L('stRushLoseStone', rushL.stone - Math.floor(need * 0.2 * 0.4));
      L('stRushLoseRep', rushL.rep);
      L('stGuardLoseStone', guardL.stone - Math.floor(need * 0.2 * 1.25));
      L('stGuardLoseRep', guardL.rep);

      /* 秘境：探路两选一，层数与守关战力都不变，只是灵石/材料的配比 */
      XX._s.rank = 8; XX._s.bag = [];
      XX._s.secret = { prog: [0, 0, 0, 0], day: '', swept: 0 }; XX._render();
      const sb = XX._secretReward(0, 1);
      XX._secretPick(0);
      L('stSecOpen', XX._stanceOpen() ? 'yes' : 'no');
      L('stSecOpts', opts());
      L('stSecTitle', document.getElementById('st-title').textContent);
      document.getElementById('st-close').click();
      L('stSecClosed', (XX._stanceOpen() ? 'no' : 'yes') + '/' + XX._secretProg(0));   /* 关掉不推层 */
      let st0 = XX._s.stone, bag0 = XX._s.bag.length;
      XX._secretPick(0); pick('stone');
      L('stSecStone', (XX._s.stone - st0) - Math.round(sb.stone * 1.6));               /* 取财：灵石 ×1.6 */
      L('stSecStoneMat', XX._s.bag.length - bag0);                                     /* 取财：不带材料 */
      L('stSecStoneProg', XX._secretProg(0));                                          /* 仍推进一层 */
      st0 = XX._s.stone; bag0 = XX._s.bag.length;
      const sb2 = XX._secretReward(0, 2);                                              /* 第二层，基准不同 */
      XX._secretPick(0); pick('mat');
      L('stSecMatStone', (XX._s.stone - st0) - Math.round(sb2.stone * 0.6));           /* 取料：灵石 ×0.6 */
      L('stSecMatBag', XX._s.bag.length - bag0);                                       /* 取料：材料 ×2 */
      L('stSecMatProg', XX._secretProg(0));
      /* 背包满：取料一颗也塞不进去，但不能崩、层数照样推进 */
      XX._s.secret = { prog: [2, 0, 0, 0], day: '', swept: 0 };
      XX._s.bag = new Array(XX._bagCap()).fill({ t: 'mat_bone', n: '兽骨' });
      const full0 = XX._s.bag.length;
      XX._secretPick(0); pick('mat');
      L('stSecFull', (XX._s.bag.length === full0 ? 'same' : 'grew') + '/' + XX._secretProg(0));
      Math.random = rnd;
    })();

    /* ---- 第 93 轮 · 一场演出三个场子 ----
       镇妖塔一直是整场演出，论剑台/秘境以前点「挑战」只飘一枚 chip（实测 modal:false），
       玩家等于对着日志盲掷骰子。这里钉三件事：
         1) 两处都真的开演，而且题签/对手/形象跟着场子换（不是套着镇妖塔的壳）；
         2) 结果先入账、演出后开：论剑掷负的那场照样得演，奖励数值不受动画影响；
         3) 连点不卡死——上一场没走完就被接管，btBusy 若留 true，之后所有挑战都点不动。 */
    const bt93 = (function () {
      const r = {};
      const vis = () => document.getElementById('battle-modal').classList.contains('hidden') ? 'no' : 'yes';
      const skip = () => { const s = document.getElementById('bt-skip'); if (s) s.click(); };
      XX._setBattleAnim(true);
      /* 秘境：必胜场子，题签要是卷名+层数，对手用这一层的妖兽立绘 */
      XX._s.rank = 8; XX._s.secret = { prog: [0, 0, 0, 0], day: '', swept: 0 }; XX._render();
      XX._challengeSecret(0);
      r.secModal = vis();
      r.secTitle = document.getElementById('bt-title').textContent;
      r.secMob = document.getElementById('bt-mname').textContent;
      r.secMobImg = document.getElementById('bt-mavatar').getAttribute('src') || '';
      skip();
      /* 论剑：连点五个不同对手，每次都撞进「上一场还没走完」这条接管路径 */
      XX._s.arena = { day: '', left: 5, foes: [], tier: 0, win: 0, lose: 0, rep: 0 }; XX._render();
      XX._challengeArena(0);
      r.arModal = vis();
      r.arTitle = document.getElementById('bt-title').textContent;
      r.arMobImg = document.getElementById('bt-mavatar').getAttribute('src') || '';
      skip();
      XX._s.arena.left = 5; XX._s.arena.foes.forEach(f => { f.beat = false; });
      for (let k = 0; k < 5 && k < XX._s.arena.foes.length; k++) XX._challengeArena(k);
      /* 打完这一串，塔必须还能开演——开不了就是 btBusy 卡死了 */
      XX._s.tower = 1; XX._s.towerMax = 1; XX._s.rank = 8; XX._s.trun = null; XX._render();
      XX._towerEnter(); XX._towerDoor('fight');
      r.afterSprint = vis();
      skip();
      /* 开关关掉（CI 走这条）：一处都不该开演 */
      XX._setBattleAnim(false);
      XX._s.arena.left = 5; XX._s.arena.foes.forEach(f => { f.beat = false; });
      XX._challengeArena(0);
      XX._s.secret = { prog: [0, 0, 0, 0], day: '', swept: 0 };
      XX._challengeSecret(1);
      r.animOffModal = vis();
      /* 论剑的结算行没有材料，只有灵石+声望：以前无条件渲染材料行会印出「undefined」 */
      XX._showBattleLoot({ stone: 1200, rep: 30 });
      const lb = document.getElementById('bt-loot');
      r.lootRows = lb.querySelectorAll('.bt-loot-row').length;
      r.lootTxt = (lb.textContent || '').replace(/\s+/g, '');
      /* 扫荡反过来：一次结十层的高频操作，按设计只飘字、不弹演出（弹了每天两次要点两分钟） */
      XX._s.rank = 8; XX._s.tower = 4; XX._s.towerMax = 3; XX._s.towerSwept = 0; XX._render();
      XX._sweepTower();
      r.sweepTowerModal = vis();
      XX._s.secret = { prog: [3, 0, 0, 0], day: '', swept: 0 }; XX._render();
      XX._sweepSecret();
      r.sweepSecretModal = vis();
      XX._setBattleAnim(true);
      return r;
    })();
    L('bt93', JSON.stringify(bt93));

    // ---- 限时活动（签到 + 仙盟争霸） ----
    window.switchTab('event');
    L('eventShown', document.getElementById('page-event').classList.contains('active') ? 'shown' : 'hidden');
    L('eventCards', document.querySelectorAll('.act-card[data-bld="event"]').length);   // 左侧两张卡都指向活动页
    // ---- 第 88 轮 B · 限时活动拆页：日常 / 签到 / 仙盟 / 兑奖 各自一页 ----
    L('evHubCells', document.querySelectorAll('#page-event .hub-nav [data-jump]').length);   // 4
    L('evHubSeal', (document.getElementById('xx-hub-ev-sign').textContent || '').charAt(0) === '第' ? 'ok' : 'bad');
    window.switchTab('event_sign');
    XX._s.sign = { days:0, last:'' }; XX._render();
    L('signDays', document.querySelectorAll('#xx-sign .ev-day').length);                // 7 格
    const st9 = XX._s.stone;
    XX._sign();
    L('signDay1', XX._s.sign.days);                                                     // 1
    L('signStone', XX._s.stone > st9 ? 'yes' : 'no');
    XX._sign();
    L('signTwice', XX._s.sign.days);                                                    // 仍是 1，不能重复领
    XX._s.union = { start: Date.now(), day:'', left:0, merit:0, claimed:[], season:1 }; XX._render();
    L('unionDay', XX._unionDay());                                                      // 1
    L('unionLeft', XX._s.union.left);                                                   // 每日 1 次
    const st10 = XX._s.stone;
    XX._unionFight();
    L('unionMerit', XX._s.union.merit > 0 ? 'yes' : 'no');
    L('unionStone', XX._s.stone > st10 ? 'yes' : 'no');
    const m0 = XX._s.union.merit;
    XX._unionFight();
    L('unionOnce', XX._s.union.merit === m0 ? 'yes' : 'no');                            // 每日只能出战一次
    XX._s.union.merit = 100; XX._s.bag = [];
    /* 战功兑奖在拆页后是它自己的一页；场景左侧「仙盟争霸」卡的老锚点 xx-union 要能直达 */
    window.switchTab('event', 'xx-union');
    L('evUnionDeep', window.ROUTER.current());                                                // event_union
    window.switchTab('event_rew'); XX._render();
    L('unionRows', document.querySelectorAll('#xx-union-rew .ev-row').length);          // 5 档
    XX._claimUnion(0);
    L('unionClaimed', XX._s.union.claimed.length);                                      // 1
    XX._claimUnion(0);
    L('unionClaimOnce', XX._s.union.claimed.length);                                    // 仍是 1

    // ---- 回归：修炼页核心 ----
    window.switchTab('xiu_acts');
    const sit=document.querySelector('.act[data-k="sit"]');
    const e0=XX._s.exp; sit.click(); await sleep(80);
    L('sitGained', XX._s.exp > e0 ? 'yes' : 'no');
    /* 手动操作的"看得见"兜底（2026-10-25 第 57 节）：
       高境界时 10 秒挂机只占一层 0.0x%，打坐等于没点 → 现在按当前层需求 0.2% 兜底 */
    /* 用「顿悟」测（打坐刚被上一条用例点过，冷却 8 秒还没走完；
       顿悟的保底是 1%、大悟 2%，两种分支都远高于"100 秒挂机"在该层的占比） */
    XX._s.rank = 22; XX._s.acts.enlight = 0; XX._s.exp = 0;
    const need22 = XX._need(22), enlE0 = XX._s.exp;
    XX._act('enlight'); await sleep(80);
    L('sitFloor', (XX._s.exp - enlE0) / need22);
    /* 离线封顶随境界抬：第 24 层 30 小时离线，只结算 cap 而不是死板的 8 小时 */
    XX._s.rank = 24; XX._s.exp = 0; XX._s.last = Date.now() - 30 * 3600 * 1000;
    const rate24 = XX._passiveRate();   /* 阶段二 N2：离线结算走被动速率（r24 = expRate × 2.90） */
    XX._offline();
    L('capByRank', XX._s.exp / (rate24 * 3600));
    /* 回执三值（W2 后措辞：「离线实经 X，本次结算封顶 Y，未计 Z」）——把 Y 的期望值也从同一口径取出来 */
    L('capMsg', (XX._s.log || []).map(x => x.t || '').filter(t => t.indexOf('本次结算封顶') >= 0).pop() || '');
    L('capExpTxt', (XX._offlineCap() / 3600).toFixed(1) + ' 小时');
    XX._s.rank = 0; XX._s.acts.sit = 0; XX._s.last = Date.now();
    /* ===== 阶段二（数值大改）追加断言：N2/N4/N5/N6/N9/N10/N11/N13 ===== */
    {
      const s2Rank = XX._s.rank, s2Wis = XX._s.wisdom | 0, s2Pets = XX._s.pets.slice(), s2Acts = Object.assign({}, XX._s.acts);
      /* N4：第 8 天必须真结算开新季（旧 min(7,…) 让清零分支成死代码） */
      XX._s.union.merit = 77; XX._s.union.start = Date.now() - 8 * 86400000;
      const uS0 = XX._s.union.season;
      XX._unionReset();
      L('unionReset8', [XX._s.union.season === uS0 + 1 ? 1 : 0, XX._s.union.merit, XX._unionDay()].join('/'));
      /* N5：每日首次打坐 +50×境界系数，且同日第二次不再给 */
      XX._resetCd(); XX._s.rank = 0; XX._s.acts.sit = 0; XX._s.wisdom = 0;
      XX._act('sit');
      const s2W1 = XX._s.wisdom | 0;
      XX._resetCd(); XX._act('sit');
      L('sitWisFirst', s2W1 === XX._wisdomGain(50) ? 'ok' : 'bad:' + s2W1);
      L('sitWisOnce', (XX._s.wisdom | 0) === s2W1 ? 'ok' : 'bad:' + (XX._s.wisdom | 0));
      /* N6：喂食灵石固定九段表 */
      L('petFeedTbl', [0,10,14,17,20,21,22,23,24].map(r => { XX._s.rank = r; return XX._petFeedStone(); }).join(','));
      /* N2：后期被动乘区 r18–24，r<18 恒 1 */
      XX._s.rank = 24; const s2LP24 = XX._latePassiveMult();
      XX._s.rank = 17; const s2LP17 = XX._latePassiveMult();
      XX._s.rank = 21; const s2RateRatio = XX._passiveRate() / XX._rate();
      L('latePassiveArr', [s2LP17, s2LP24, s2RateRatio.toFixed(2)].join('/'));
      /* N9：历练三档低段守住原常量，高段按 need 缩放 */
      XX._s.rank = 0;
      const s2Adv0 = [XX._advWinStone(), XX._advLossExp(), XX._advEscapeExp()].join(',');
      XX._s.rank = 19;
      const s2Adv19 = [XX._advWinStone() === Math.max(50, Math.floor(XX._need(19) * 0.5)) ? 1 : 0,
                       XX._advLossExp() === Math.max(10, Math.floor(XX._need(19) * 0.005)) ? 1 : 0,
                       XX._advEscapeExp() === Math.max(5, Math.floor(XX._need(19) * 0.01)) ? 1 : 0].join('');
      L('advFloor', s2Adv0); L('advScale', s2Adv19);
      /* N10：分母与上限统一为 5 */
      L('heardCap', [window.Npc.HEARD_CAP, XX._npcHeardTotal()].join('/'));
      /* N10：最短 rel≥15 路径 = 8 次对话（初见 +2 起手；重复正向 +1） */
      const s2Stele = { met: 0, rel: 0, stage: 0, seenGens: 0, lastSeen: 0, nudgeAt: 0, heard: [],
                        choice: { listened: 0, showoff: 0, promise: 0 }, cur: { lastRank: 0, talk: 0, promptTale: 0 } };
      const s2Ctx = { now: Date.now(), gens: 0 };
      const s2Seq = [['first','ask_black'],['stele1','listen'],['stele3','believe'],['stele4','note'],
                     ['stele2','modest'],['stele1','listen'],['stele1','listen'],['stele1','listen']];
      let s2Last = null;
      s2Seq.forEach(x => { s2Last = window.Npc.npcPick(s2Stele, s2Ctx, x[0], x[1]); });
      const s2HeardN = s2Stele.heard.length;
      const s2Stele5 = window.Npc.npcPick(s2Stele, s2Ctx, 'stele5', 'noncommittal');
      L('n10Path', [s2Last && s2Last.rel, s2Last && s2Last.stage, s2HeardN, s2Stele5 && s2Stele5.ok ? 1 : 0].join('/'));
      /* N11：九段矩阵——漂移断言 + 段内极差 + 当前段取值 */
      L('pathDrift', (function(){ try{ return XX._assertPathBonusNoDrift() ? 'ok' : 'bad'; }catch(e){ return 'bad:' + e.message; } })());
      const s2Spread = [];
      for(let i = 0; i < 9; i++){
        const vals = XX._pathIds.map(id => XX._pathBonusFor(id, i));
        s2Spread.push(Math.max.apply(null, vals) - Math.min.apply(null, vals));
      }
      L('pathSpread', (Math.max.apply(null, s2Spread) * 100).toFixed(2));
      XX._s.rank = 0; const s2Path0 = [XX._pathBonusFor('sword').toFixed(2), XX._pathBonusFor('dan').toFixed(2)].join('/');
      XX._s.rank = 17; const s2Path17 = XX._pathBonusFor('body');
      XX._s.rank = 0; const s2PathTxt = XX._pathBonusSegText('sword');
      L('pathCur', [s2Path0, s2Path17.toFixed(2)].join('#'));
      L('pathCardTxt', s2PathTxt);
      /* N13（制作人 2026-11-14 裁定④）：删除「握持」文案，五枚破境丹统一服食口径 */
      L('n13Usage', ['dan1','dan2','dan3','dan4','dan5'].map(id =>
        XX._items[id].usage.indexOf('握持') < 0 && XX._items[id].usage.indexOf('服食') >= 0 ? 1 : 0).join(''));
      L('n13DeadPill', XX._items.dan_juqi.usage.indexOf('不可服食') >= 0 ? 'ok' : 'bad');
      /* 还原场景，避免影响后续用例 */
      XX._s.rank = s2Rank; XX._s.wisdom = s2Wis; XX._s.pets = s2Pets; XX._s.acts = s2Acts; XX._s.last = Date.now();
    }

    /* 参悟（2026-10-25 第 58 节）：唯一的纯灵石、无上限口子 */
    L('ponderCards', document.querySelectorAll('#xx-actions .act').length);   // 5（4 日课 + 参悟）
    L('ponderWide', document.querySelectorAll('#xx-actions .act.wide').length); // 1
    /* 注意顺序：act() 里"次数上限"判定在"灵石"判定之前，所以测没钱必须让次数是充足的，
       否则会先被"今日次数已用完"挡掉，测出来的通过是假的 */
    XX._s.rank = 22; XX._s.acts.ponder = 0; XX._s.stone = 0;
    XX._act('ponder'); await sleep(60);
    L('ponderPoor', XX._s.acts.ponder);                                      // 仍是 0（先验钱，不扣次数）
    XX._s.stone = 1e12; XX._s.exp = 0; XX._s.acts.ponder = 0;
    const pCost = XX._ponderCost(), ps0 = XX._s.stone, pe0 = XX._s.exp;
    /* 扣费与加修为都是同步完成的：必须当场量。等 60ms 再量会被挂机收益
       （每 500ms 一次 tick 加灵石）混进来，量到的是"扣费 - 这段时间的收入" */
    XX._act('ponder');
    L('ponderCostUses', Math.round(ps0 - XX._s.stone) === pCost ? 'yes' : 'no');
    L('ponderPct', (XX._s.exp - pe0) / XX._need(22));
    await sleep(60);
    /* 定价口径：一次参悟花的钱 = 这一层灵石收入的 8%（不是固定价，也不是按境界需求） */
    const layerInc = XX._stoneRate() * (XX._need(22) / XX._rate());
    L('ponderShare', pCost / layerInc);
    XX._s.rank = 0; XX._s.acts.ponder = 0; XX._s.stone = 5000;
    /* 突破按钮在「修为 · 突破」那一页（第 88 轮 B 拆页），先过去再看它亮没亮 */
    window.switchTab('xiu_cult');
    XX._s.exp = XX._need(XX._s.rank) + 10; XX._render();
    L('breakReady', !document.getElementById('xx-break').disabled ? 'yes' : 'no');
    /* 第 91 轮：突破 CTA 改朱砂印，只认计算值——源码里写没写对不重要，落到屏幕上是什么色才算 */
    (function(){
      const c = getComputedStyle(document.getElementById('xx-break'));
      L('breakCtaBg', c.backgroundImage);
      L('breakCtaColor', c.color);
    })();

    // ---- 新手引导 js/guide_taixu.js（太虚真人 V1；2026-11-11 换代，旧 tutorial.js 已下线）----
    /* 换代口径：状态在 S.guide（与主存档同一事务），UI 是 #taixu-bubble > .tb-text / .tb-skip，
       台上时 body 挂 guide-active 与 data-guide-step，未教系统加 .guide-locked（只变灰、不挡点击）；
       不再有 tut-mask / tut-tip / tut-btn，也不再写 localStorage.hasFinishedTutorial。
       完成判定两条路都要拍到：POLL（认权威业务状态）与 Guide.complete()（业务成功后回调）。 */
    L('guideLoaded', !!window.Guide ? 'yes' : 'no');
    L('guideLegacyUi', (document.getElementById('tut-mask') || document.getElementById('tut-tip') ||
                        document.getElementById('tut-btn')) ? 'present' : 'none');
    const gR0 = XX._s.rank, gE0 = XX._s.exp, gS0 = XX._s.stone;
    const gBag0 = XX._s.bag.slice(), gLog0 = XX._s.log.slice(), gPlots0 = XX._s.plots.slice();
    const gSit0 = XX._s.stats.sit;
    const gMet0 = (XX._s.npcs && XX._s.npcs.stele) ? XX._s.npcs.stele.met : -1;
    const gbub = () => document.getElementById('taixu-bubble');
    const gtxt = () => { const b = gbub(); const t = b && b.querySelector('.tb-text'); return t ? t.textContent : '(no bubble)'; };
    const gstep = () => { const s = window.Guide._state(); return s ? s.step : 'nostate'; };
    const gDanN = () => XX._s.bag.filter(b => b.t === 'dan1').length;
    const gLogN = k => XX._s.log.filter(l => (l.t || '').indexOf(k) >= 0).length;
    const gkill = () => { const b = gbub(); if (b && b.parentNode) b.parentNode.removeChild(b); };
    const gLockN = () => document.querySelectorAll('.guide-locked').length;
    /* 界面推进是 400ms tick + 2600/3000/3200ms 演出定时器驱动的：一律轮询等，不写死 sleep */
    const gwait = async (cond, ms) => { let w = 0; while (!cond() && w++ < ms / 100) await sleep(100); return cond(); };
    // ① 旧档保护：没有引导档 + 已有业务进度 → init() 整段跳过，不建气泡、不写任何标记
    gkill(); delete XX._s.guide;
    XX._s.rank = 12; XX._s.exp = 8519000; XX._s.stats.sit = 0; XX._s.plots = [];
    window.Guide.init();
    L('guideOldSkip', (!gbub() && !XX._s.guide) ? 'ok' : ('bub=' + !!gbub() + '/state=' + !!XX._s.guide));
    // ② 新档起盘：14 拍（2026-11-20 呆呆审结论；台词拍点击推进 / 动作拍读状态）
    gkill(); delete XX._s.guide;
    XX._s.rank = 0; XX._s.exp = 0; XX._s.stone = 10; XX._s.stats.sit = 0; XX._s.plots = []; XX._s.bag = [];
    window.Guide.init();
    const gclick = () => { const b = gbub(); if (b) b.click(); };
    const gto = async (n) => { for (let i = 0; i < 60 && gstep() !== n; i++) { gclick(); await sleep(120); } return gstep() === n; };
    L('guideStart', (function(){ const b = gbub(); if (!b) return 'noBubble';
      const s = window.Guide._state();
      return (b.style.display !== 'none' && s && s.step === 0 && s.started === true &&
              document.body.classList.contains('guide-active') && document.body.dataset.guideStep === '0') ? 'ok' : 'bad'; })());
    gclick(); await sleep(150);
    L('guideEnterTxt', gtxt().indexOf('太虚真人') >= 0 ? 'ok' : gtxt().slice(0, 20));
    L('guideSkipBtn', (document.getElementById('taixu-skip') || (gbub() && gbub().querySelector('.tb-skip'))) ? 'ok' : 'bad');
    L('guideLocks0', gLockN());                                                     // 6：除入场拍（整页）外 6 个 target 全灰
    L('guideToSit', await gto(2) ? 'ok' : 'stuck@' + gstep());
    L('guideSitTxt', gtxt().indexOf('盘腿') >= 0 ? 'ok' : gtxt().slice(0, 20));
    L('guideLocks1', gLockN());                                                     // 5：已教到 sit，那一格去灰
    { const e1 = document.querySelector('#sc-acts .cave-act[data-k="sit"]');
      const e2 = document.querySelector('.scene-tab[data-tab="role"]');
      L('guideLockNow', [e1 ? (e1.classList.contains('guide-locked') ? 'greyed' : 'clear') : 'noEl',
                         e2 ? (e2.classList.contains('guide-locked') ? 'greyed' : 'clear') : 'noEl'].join('/')); }
    /* POLL 路径：只改权威业务状态（打过坐），引导自己认出来——不是猜点了哪一下 */
    XX._s.stats.sit = 1;
    L('guidePollSit', await gwait(() => gstep() === 3, 5000) ? 'ok' : 'stuck@' + gstep());
    L('guideSelfGrowTxt', gtxt().indexOf('它自己会涨') >= 0 ? 'ok' : gtxt().slice(0, 20));
    L('guideToBrkPre', await gto(5) ? 'ok' : 'stuck@' + gstep());
    L('guideToBrk', await gto(6) ? 'ok' : 'stuck@' + gstep());
    L('guideBrkTxt', gtxt().indexOf('攒够了') >= 0 ? 'ok' : gtxt().slice(0, 20));
    /* complete 路径：错步不推进 → 本步成功 → 追叙一句 → 2600ms 后才进下一步 → 重复调用幂等 */
    L('guideWrongStep', (window.Guide.complete('field') === false && gstep() === 6) ? 'ok' : 'bad');
    L('guideBrkComplete', window.Guide.complete('brk') === true ? 'ok' : 'bad');
    L('guideAfterTxt', gtxt().indexOf('完完整整') >= 0 ? 'ok' : gtxt().slice(0, 20));
    L('guideAfterKey', gtxt().indexOf('吓唬你的') >= 0 ? 'ok' : gtxt().slice(0, 26));
    L('guideBrkIdem', (window.Guide.complete('brk') === false && gstep() === 6) ? 'ok' : 'bad');
    L('guideFlagBrk', window.Guide._state().flags['c_brk'] === true ? 'ok' : 'bad');
    L('guideAfterAdvance', await gwait(() => gstep() === 7, 5000) ? 'ok' : 'stuck@' + gstep());
    L('guideFieldIntroTxt', gtxt().indexOf('这块地归你了') >= 0 ? 'ok' : gtxt().slice(0, 20));
    L('guideToFieldJoke', await gto(8) ? 'ok' : 'stuck@' + gstep());
    L('guideFieldJokeTxt', gtxt().indexOf('炖出一锅寂寞') >= 0 ? 'ok' : gtxt().slice(0, 20));
    L('guideToFieldAction', await gto(9) ? 'ok' : 'stuck@' + gstep());
    L('guideField', window.Guide.complete('field') === true ? 'ok' : 'bad');
    L('guideFieldAdvance', await gwait(() => gstep() === 10, 5000) ? 'ok' : 'stuck@' + gstep());
    /* bag 步（进入即发下品破境丹，唯一凭证 taixu_intro_dan_v1，与进度同一事务落盘） */
    L('guideDanCount', gDanN());                                                    // 1
    L('guideDanClaim', window.Guide._state().rewardClaims['taixu_intro_dan_v1'] === true ? 'ok' : 'bad');
    L('guideDanSaved', (function(){ try{ const j = JSON.parse(XX._saveText());
      return (j.guide && j.guide.rewardClaims && j.guide.rewardClaims['taixu_intro_dan_v1'] === true &&
              (j.bag || []).some(b => b.t === 'dan1')) ? 'ok' : 'bad'; }catch(e){ return 'ERR'; } })());
    // bag（点击）→ flash.a → flash.b（问句版）→ handoff
    L('guideToFlash', await gto(11) ? 'ok' : 'stuck@' + gstep());
    L('guideToFlashB', await gto(12) ? 'ok' : 'stuck@' + gstep());
    L('guideFlashBTxt', gtxt().indexOf('听课不专心') >= 0 ? 'ok' : gtxt().slice(0, 20));
    L('guideToHandoff', await gto(13) ? 'ok' : 'stuck@' + gstep());
    /* 收尾步 POLL：认「见过碑」这个业务状态（S.npcs.stele.met），不是猜点击 */
    L('guideSteleShape', (XX._s.npcs && XX._s.npcs.stele) ? 'set' : 'made');
    if (XX._s.npcs && XX._s.npcs.stele) XX._s.npcs.stele.met = 1;
    else { XX._s.npcs = XX._s.npcs || {}; XX._s.npcs.stele = { met: 1 }; }
    L('guideFinish', await gwait(() => window.Guide._state().done === true, 5000) ? 'ok' : 'stuck@' + gstep());
    L('guideFinishLog', gLogN('（太虚真人）去吧。后山那位') ? 'ok' : 'none');
    L('guideOutBubble', (function(){ const b = gbub();
      /* B1（2026-11-20）：走完即整组摘除，nodom / hidden 均属无残留 */
      return ((!b || b.style.display === 'none') && !document.body.classList.contains('guide-active') &&
              (document.body.dataset.guideStep || '') === '') ? 'ok' : 'bad'; })());
    L('guideLockCleared', gLockN());                                                // 0
    // ③ 断点续走：气泡被摘掉（等价刷新后重挂）→ init() 必须从档里那一步接着讲，不回第一步
    gkill();
    XX._s.guide = { step: 7, done: false, skipped: false, started: true,
                    flags: {}, rewardClaims: { taixu_intro_dan_v1: true }, toldSystems: {} };
    window.Guide.init();
    L('guideResume', (gstep() === 7 && gtxt().indexOf('这块地归你了') >= 0 &&
                      document.body.dataset.guideStep === '7') ? 'ok' : (gstep() + '/' + gtxt().slice(0, 16)));
    /* ④ 已完结再进：只留一个隐藏气泡壳，不再上台、不再写日志 */
    gkill();
    XX._s.guide = { step: 7, done: true, skipped: false, started: true,
                    flags: {}, rewardClaims: {}, toldSystems: {} };
    window.Guide.init();
    L('guideNoRepop', (function(){ const b = gbub();
      /* B1（2026-11-20）：完成档整组摘除，nodom / hidden 均属无残留 */
      return ((!b || b.style.display === 'none') && !document.body.classList.contains('guide-active')) ? 'ok' : 'bad'; })());
    // ⑤ 跳过路径：点「先别唠叨」→ 解除限制 + 收尾旁白，无残留气泡/灰置
    gkill(); delete XX._s.guide;
    XX._s.rank = 0; XX._s.stats.sit = 0; XX._s.plots = [];
    window.Guide.init();
    { const sb = document.getElementById('taixu-skip') || (gbub() && gbub().querySelector('.tb-skip')); if (sb) sb.click(); }
    L('guideSkip', (function(){ const s = window.Guide._state(); const b = gbub();
      return (s && s.skipped === true && s.done === true && (!b || b.style.display === 'none') &&
              !document.body.classList.contains('guide-active') && gLockN() === 0) ? 'ok' : 'bad'; })());
    L('guideSkipLog', gLogN('（太虚真人）罢了罢了') ? 'ok' : 'none');
    /* 跳过者补讲：各系统首次打开讲一次，再开不重复；没跳过的人不该被补讲 */
    { const n0 = gLogN('灵田这处'); window.Guide.tellSystem('field'); window.Guide.tellSystem('field');
      L('guideTellOnce', gLogN('灵田这处') - n0); }                                 // 1
    { gkill();
      XX._s.guide = { step: 7, done: true, skipped: false, started: true,
                      flags: {}, rewardClaims: {}, toldSystems: {} };
      window.Guide.reset();
      const n1 = gLogN('背包里的物件'); window.Guide.tellSystem('bag');
      L('guideTellSilent', gLogN('背包里的物件') - n1); }                            // 0
    /* 台词零开发残留（军规 5：SCAN_PATTERNS 全量扫描命中必须为 0） */
    L('guideResidue', (function(){ try{ const r = window.Guide.scanResidue(); return r.hits + '/' + r.lines.join(','); }
      catch(e){ return 'ERR'; } })());
    /* 恢复现场：引导留在「已完结」，rank/exp/stone/bag/log/灵田/统计/见碑全部还原，
       后面的用例照旧跑在自己的账上 */
    XX._s.rank = gR0; XX._s.exp = gE0; XX._s.stone = gS0;
    XX._s.bag = gBag0; XX._s.log = gLog0; XX._s.plots = gPlots0; XX._s.stats.sit = gSit0;
    if (XX._s.npcs && XX._s.npcs.stele && gMet0 >= 0) XX._s.npcs.stele.met = gMet0;
    XX._s.guide = { step: 7, done: true, skipped: false, started: true,
                    flags: {}, rewardClaims: { taixu_intro_dan_v1: true }, toldSystems: {} };
    window.Guide.reset();
    XX._render();

    /* ---- D-1 回归（制作人拍板 2026-11-13，落码第 6 项）----
       被回归的缺陷：突破提示条上那句「💊 背包里有【…】：点开背包服食，突破成功率 +NN%」以前读的是
       pm.bonus（= DAN_BY_ID[id].brk，UI 不可达的选丹口径），而真正到账的是 eatDan → S.pillBonus
       = DAN_BY_ID[id].buff。dan3 上两者一个 22% 一个 15%，玩家照着提示吃药会低估失败率。
       校法：九个境界段逐个「只留该段所需那一枚丹」真渲染一次，从 #xx-break-tip 上把百分数抠出来，
       期望值一律动态取 XX._dan.all[pillId].buff —— 一个数字都不写死（阶段二调数值时断言跟着走）。 */
    const d1R0 = XX._s.rank, d1Bag0 = XX._s.bag.slice(), d1Log0 = XX._s.log.slice();
    const d1Ins0 = XX._s.insight, d1Fb0 = XX._s.failBonus, d1Exp0 = XX._s.exp;
    window.switchTab('xiu_cult');
    {
      const rows = [];
      for (const tt of XX._breakTiers) {
        const pillId = tt.pill, dd = XX._dan.all[pillId];
        if (!dd) { rows.push(pillId + '/NODAN/-/-/-'); continue; }
        XX._s.rank = tt.from;
        XX._s.bag = [{ t: pillId }];                       /* 只留这一枚：pillHintText 让位给 pillUseText */
        XX._s.insight = 0; XX._s.failBonus = 0; XX._s.exp = XX._need(tt.from) + 10;
        XX._render();
        const el = document.getElementById('xx-break-tip');
        const tipTxt = el ? (el.textContent || '') : '(no tip)';
        const m = tipTxt.match(/服食，突破成功率 [+]([0-9]+)%/);   /* DIAG 是模板串：正则里不写反斜杠，[+] 代 \\+ */
        rows.push([pillId, m ? m[1] : 'nomatch', Math.round(dd.buff * 100),
                   Math.round((dd.brk || 0) * 100), tipTxt.indexOf('💊') >= 0 ? 'pill' : 'other'].join('/'));
      }
      L('d1Tips', rows.join(','));
      L('d1TierN', XX._breakTiers.length);
      L('d1DanN', XX._dan.list.length);
    }
    XX._s.rank = d1R0; XX._s.bag = d1Bag0; XX._s.log = d1Log0;
    XX._s.insight = d1Ins0; XX._s.failBonus = d1Fb0; XX._s.exp = d1Exp0;
    XX._render();


    // ---- 渡劫天象（突破演出：破晓/余烬/busy 锁/跳过；纯 CSS 零图片） ----
    L('tribModal', !!document.getElementById('trib-modal') ? 'yes' : 'no');
    L('tribHidden', document.getElementById('trib-modal').classList.contains('hidden') ? 'yes' : 'no');
    L('tribApi', typeof window.TRIB);
    { const bc0 = document.getElementById('b-close'); if(bc0) bc0.click(); }   /* 关掉残留结算弹窗 */
    /* 成功路径：顿悟圆满兜底必成 → 开演（cloud 段）→ 演出不拦结算 → 跳过 → 结算弹窗 */
    const tribR0 = XX._s.rank;
    XX._s.exp = 1e9; XX._s.insight = 100; XX._s.log = [];
    XX._break();
    const tp = window.TRIB._probe();
    L('tribPlaying', tp.busy ? 'yes' : 'no');
    L('tribPhase', tp.phase);
    L('tribRankDelta', XX._s.rank - tribR0);
    /* 防叠播：busy 期间再 play 不叠播、不重复收尾（TRIB 内部幂等） */
    let tribDoneN = 0;
    const stackR = window.TRIB.play(true, { onDone: function(){ tribDoneN++; } });
    L('tribStack', stackR && stackR.playing === false ? 'no' : 'yes');
    L('tribSkipR', window.TRIB.skip());
    await sleep(80);
    L('tribDoneOnce', tribDoneN);
    L('tribBreakShown', document.getElementById('break-modal').classList.contains('hidden') ? 'no' : 'yes');
    L('tribBTitle', document.getElementById('b-title').textContent);
    /* 失败路径：stub 随机数必败 → 劫雷余烬演出 → 跳过后数值照扣 */
    { const bc2 = document.getElementById('b-close'); if(bc2) bc2.click(); }
    const rndBak = Math.random;
    try{
      Math.random = () => 0.999;
      XX._s.exp = 1e9; XX._s.insight = 0; XX._s.log = [];
      XX._break();
      const tf = window.TRIB._probe();
      L('tribFailPhase', tf.phase);
      L('tribFailOk', tf.ok === false ? 'fail' : 'notfail');
      L('tribFailRank', XX._s.rank === tribR0 + 1 ? 'same' : 'up');
      L('tribSkipF', window.TRIB.skip());
      L('tribFailExp', XX._s.exp < 1e9 ? 'less' : 'same');
    }finally{ Math.random = rndBak; }
    /* 样式探针：层级 / 不挡点击 / 无图片 / 劫雷动画 / 字幕楷体 */
    const tm2 = document.getElementById('trib-modal');
    L('tribZ', getComputedStyle(tm2).zIndex);
    L('tribPe', getComputedStyle(tm2).pointerEvents);
    L('tribUrl', /url[(]/.test(getComputedStyle(tm2).backgroundImage + getComputedStyle(document.querySelector('.trib-sky')).backgroundImage + getComputedStyle(document.querySelector('.trib-dawn')).backgroundImage) ? 'yes' : 'no');
    L('tribBoltAnim', (function(){ const be = document.querySelector('.trib-bolt'); if(!be) return 'none'; be.classList.add('on'); const a = getComputedStyle(be).animationName; be.classList.remove('on'); return a; })());
    L('tribCapFont', getComputedStyle(document.getElementById('trib-cap')).fontFamily);

    // ---- 历练 · 文字冒险 ----
    L('advEvents', XX._advEvents.length);                                    // D-008 后 18 个随机事件
    /* D-008：历练池扩容后的运行时结构契约（真实 XX._advEvents 对象逐条校验） */
    (function(){
      let meta = 0, action = 0, dup = 0, html = 0, n = 0; const seen = {}; const ids = [];
      XX._advEvents.forEach(a => {
        n++;
        ids.push(a.id);
        if(typeof a.id !== 'number') meta++;
        if(!a.desc || !Array.isArray(a.options) || a.options.length !== 2) meta++;
        else a.options.forEach(o => { if(!o.text || ['battle','escape'].indexOf(o.action) < 0) action++; });
        if(/</.test(a.desc || '')) html++;
        if(seen[a.id]) dup++; seen[a.id] = 1;
      });
      /* 历练 id 必须为数字、严格连续 1..18（无缺号、无越界、重复已由 dup 覆盖） */
      const idsOk = ids.length === 18 && ids.every((v, i) => typeof v === 'number' && v === i + 1);
      L('advStructN', n);
      L('advStructMeta', meta);
      L('advStructAction', action);
      L('advStructDup', dup);
      L('advStructHtml', html);
      L('advStructIds', idsOk ? 'yes' : 'no');
    })();
    const advR0 = XX._s.rank, advE0 = XX._s.exp, advS0 = XX._s.stone, advA0 = XX._s.acts.train;
    const ev1 = XX._act('train');                                            // 走真实入口（含次数/冷却）
    L('advOpen', ev1 && ev1.desc && !document.getElementById('enc-modal').classList.contains('hidden') &&
                 document.getElementById('enc-text').textContent === ev1.desc ? 'ok' : 'bad');
    L('advOpts', document.querySelectorAll('#enc-opts .enc-opt').length);    // = 事件选项数（2）
    L('advActs', XX._s.acts.train === advA0 + 1 ? 'ok' : 'bad');             // 历练次数照常计数
    // 必赢对决（rank 30 战力碾压全妖兽池）→ 按当前层需求缩放后的灵石 + 资源栏刷新
    XX._s.rank = 30; XX._render();
    const advWinStone = XX._advWinStone();
    const won = XX._resolveAdventure(0);
    const chipWin = document.getElementById('sc-stone').textContent;
    L('advWin', won && won.win === true && XX._s.stone >= advS0 + advWinStone &&
                chipWin.trim().length > 0 &&
                document.getElementById('enc-text').textContent.indexOf(advWinStone + ' 灵石') >= 0 ? 'ok' : 'bad');
    L('advWinD', JSON.stringify({w: won && won.win, s: XX._s.stone, s0: advS0, chip: chipWin}));
    // 结果页 → 点「继续赶路」关窗
    document.querySelector('#enc-opts .enc-opt').click();
    L('advClose', document.getElementById('enc-modal').classList.contains('hidden') ? 'ok' : 'bad');
    // 必输对决：把整个妖兽池战力临时抬到天文数字（_beasts 是活引用）→ 我方必败 → −10 修为
    XX._resetCd();                                        /* 清历练冷却，走真实 act 入口 */
    XX._s.rank = 0; XX._s.exp = 500; XX._s.stone = advS0;
    const powBak = XX._beasts.map(b => b.power);
    XX._beasts.forEach(b => { b.power = 1e12; });
    XX._act('train');
    const lost = XX._resolveAdventure(0);
    XX._beasts.forEach((b, i) => { b.power = powBak[i]; });  /* 恢复全部妖兽战力 */
    L('advLose', lost && lost.win === false && XX._s.exp === 490 &&
                 document.getElementById('enc-text').textContent.indexOf('损失 10 修为') >= 0 ? 'ok' : 'bad');
    L('advLoseD', JSON.stringify({w: lost && lost.win, e: XX._s.exp}));
    document.querySelector('#enc-opts .enc-opt').click();
    // escape：明哲保身 → +5 修为（W1 后主动来源走当日档位；先把当日计数清零，单量这一条的产出）
    XX._resetCd();
    XX._s.day = { key: '', expGain: 0, sweepExp: 0 };
    const escExp0 = XX._s.exp;
    XX._act('train');
    const esc = XX._resolveAdventure(1);
    L('advEscape', esc && esc.action === 'escape' && XX._s.exp === escExp0 + 5 ? 'ok' : 'bad');
    L('advEscD', JSON.stringify({a: esc && esc.action, e: XX._s.exp, e0: escExp0}));
    document.querySelector('#enc-opts .enc-opt').click();

    // ---- 天骄榜（城镇入口 → 30 NPC + 玩家实时排名；容器 id 用 xx-hero-rank，避免撞藏经阁境界名 #xx-rank） ----
    document.querySelector('[data-bld="rank"]').click();
    L('rankPanel', !!document.getElementById('xx-hero-rank'));
    L('rankRows', document.querySelectorAll('#xx-hero-rank .rk-row').length);        // 31（30 NPC + 玩家）
    L('rankTop3', ['rk-1','rk-2','rk-3'].every(c => document.querySelector('#xx-hero-rank .' + c)) ? 'yes' : 'no');
    L('rankMe', !!document.querySelector('#xx-hero-rank .rk-me'));
    L('rankMePos', (document.getElementById('xx-hero-rank-tip').textContent.match(/第 ([0-9]+) 名/) || [])[1] || '');
    /* 装备养成 → 名次实时刷新 */
    const rkW = XX._s.weapon, rkWl = XX._s.weaponLv, rkAf = JSON.stringify(XX._s.affix);
    XX._s.weapon = 4; XX._s.weaponLv = 10; XX._s.affix = [{id:'pow', q:4}];
    XX._render();
    L('rankMePos2', (document.getElementById('xx-hero-rank-tip').textContent.match(/第 ([0-9]+) 名/) || [])[1] || '');
    XX._s.weapon = rkW; XX._s.weaponLv = rkWl; XX._s.affix = JSON.parse(rkAf); XX._render();
    window.ROUTER.back();

    // 恢复现场
    XX._s.rank = advR0; XX._s.exp = advE0; XX._s.stone = advS0; XX._render();

    // ---- 闭关归来 · 离线收益结算弹窗（2026-10-24）----
    const offM = document.getElementById('off-modal');
    L('offModalInDom', offM ? 'yes' : 'no');
    offM.classList.add('hidden');         /* 前文 ecoOfflineCap 测试已合法弹过一次，先替玩家收下 */
    XX._offlineModal({ used: 7200, cap: 7200, capped: true, ripe: 2, gExp: 12345, gStone: 6789, gOre: 12, gHunt: 3 });
    L('offModalShown', offM && !offM.classList.contains('hidden') ? 'yes' : 'no');
    L('offDur', (document.getElementById('off-dur') || {}).textContent || '');
    L('offRows', document.querySelectorAll('#off-rows .off-row').length);            // 修为/灵石/矿石/猎妖 4 行
    L('offRowHunt', Array.from(document.querySelectorAll('#off-rows .off-row')).some(r => r.textContent.indexOf('猎妖') >= 0) ? 'yes' : 'no');
    L('offNote', (document.getElementById('off-note') || {}).textContent || '');
    document.getElementById('off-close').click();
    L('offModalClosed', offM.classList.contains('hidden') ? 'yes' : 'no');
    /* 封顶提示必须按实际时长显示：境界抬高（每层 ×1.12）+ 玄冥洞天加时，不能再写死 8 小时 */
    const offR = XX._s.rank, offDt = XX._s.dt, offMain = XX._s.dtMain;
    XX._s.rank = 22; XX._s.dt = { qing:0, zhu:0, su:0, xuan:3, huang:0 }; XX._s.dtMain = 'xuan';
    const offCapS = XX._offlineCap();
    XX._offlineModal({ used: offCapS, cap: offCapS, capped: true, ripe: 0, gExp: 1, gStone: 1, gOre: 0, gHunt: 0 });
    L('offCapTxt', (document.getElementById('off-dur') || {}).textContent || '');
    L('offCapExp', (offCapS / 3600).toFixed(1) + ' 小时');
    document.getElementById('off-close').click();
    XX._s.rank = offR; XX._s.dt = offDt; XX._s.dtMain = offMain;
    /* 信匣（2026-10-25）：离线见闻逐封拆阅，拆了才领添头；主收益不卡在信上 */
    XX._s.letters = [];
    L('olMade', XX._pushLetters({ used: 3 * 3600, ripe: 3, gExp: 9000, gStone: 2000, gOre: 120, gHunt: 12 }));
    L('olCount', XX._letterCount());
    L('olCap', XX._makeLetters({ used: 5 * 60, ripe: 0, gExp: 10, gStone: 1, gOre: 0, gHunt: 0 }).length);
    L('olCapBig', XX._makeLetters({ used: 7 * 3600, ripe: 6, gExp: 9e5, gStone: 2e5, gOre: 900, gHunt: 60 }).length);
    L('olReal', (XX._letters()[0] || {}).text || '');
    XX._offlineModal({ used: 7200, cap: 7200, capped: true, ripe: 3, gExp: 12345, gStone: 6789, gOre: 12, gHunt: 3 });
    L('olBox', !!document.getElementById('off-letters') ? 'yes' : 'no');
    L('olHas', document.getElementById('off-letters').classList.contains('has') ? 'yes' : 'no');
    L('olN', document.querySelectorAll('#off-letters .ol-item').length);
    L('olHead', (document.querySelector('#off-letters .ol-head span') || {}).textContent || '');
    L('olSealTxt', (document.querySelector('#off-letters .ol-item b') || {}).textContent || '');
    /* 拆第一封：展开成素笺 + 添头入账；再点不再发（防连点刷） */
    const olW0 = XX._s.wisdom | 0, olH0 = XX._s.herb | 0;
    const olFirst = document.querySelector('#off-letters .ol-item');
    const olId = olFirst.getAttribute('data-lid');
    olFirst.click();
    L('olOpened', olFirst.classList.contains('opened') ? 'yes' : 'no');
    L('olBody', (olFirst.querySelector('.ol-body') || {}).textContent || '');
    L('olGain', (XX._s.wisdom > olW0 || XX._s.herb > olH0) ? 'yes' : 'no');
    const olW1 = XX._s.wisdom | 0;
    L('olNoRepeat', XX._openLetter(olId) === null ? 'yes' : 'no');
    L('olNoRepeatV', XX._s.wisdom === olW1 ? 'yes' : 'no');
    L('olLeft', XX._letterCount());
    L('olLog', (XX._s.log[0] || {}).t || '');
    document.getElementById('off-close').click();
    XX._s.letters = [];

    /* 离线提示文案必须跟着实际封顶走（第 72 节）：境界 + 洞天共同决定 */
    window.switchTab('xiu_cult');   /* 第 88 轮 B：离线提示跟着「修为 · 突破」页走 */
    const tipR = XX._s.rank, tipDt = XX._s.dt, tipMain = XX._s.dtMain;
    XX._s.rank = 22; XX._s.dt = { qing:0, zhu:0, su:0, xuan:3, huang:0 }; XX._s.dtMain = 'xuan';
    XX._render();
    L('offTip', (document.getElementById('xx-offline-tip') || {}).textContent || '');
    L('offTipExp', (Math.round(XX._offlineCap() / 360) / 10) + ' 小时');
    XX._s.rank = 0; XX._s.dt = { qing:0, zhu:0, su:0, xuan:0, huang:0 }; XX._s.dtMain = '';
    XX._render();
    L('offTip0', (document.getElementById('xx-offline-tip') || {}).textContent || '');
    XX._s.rank = tipR; XX._s.dt = tipDt; XX._s.dtMain = tipMain; XX._render();

    // ---- 入口红点 · 可领取提示（2026-10-24）----
    L('dotN', document.querySelectorAll('.e-dot').length);                           // 开局插好的红点（≥7）
    XX._s.arena = { day:'', left:3, foes:[], tier:0, win:0, lose:0, rep:0 };
    XX._dots(true);
    L('dotArenaOn', document.querySelector('[data-bld="arena"] .e-dot').classList.contains('on') ? 'yes' : 'no');
    XX._s.arena.left = 0; XX._dots(true);
    L('dotArenaOff', document.querySelector('[data-bld="arena"] .e-dot').classList.contains('on') ? 'no' : 'yes');
    XX._s.eggs = [{ bid: 'rat' }]; XX._dots(true);
    L('dotChongOn', document.querySelector('[data-bld="chong"] .e-dot').classList.contains('on') ? 'yes' : 'no');
    XX._s.eggs = [];
    XX._s.sign = { days: 0, last: '' };                                              // 今日未签 → 宝藏阁亮
    XX._dots(true);
    L('dotEventOn', document.querySelector('[data-bld="event"] .e-dot').classList.contains('on') ? 'yes' : 'no');
    XX._s.sign = { days: 1, last: new Date().getFullYear() + '-' + (new Date().getMonth() + 1) + '-' + new Date().getDate() };
    if(typeof Daily !== 'undefined' && Daily._reset) Daily._reset();                 // 任务进度清零 → 宝藏阁灭
    XX._dots(true);
    L('dotEventOff', document.querySelector('[data-bld="event"] .e-dot').classList.contains('on') ? 'no' : 'yes');

    // ---- W3·S2：镇妖塔红点 = 世界线（W1 塔底）此刻在塔里真有事可做 ----
    /* 六个档位全走现成闸门（worldFootCanDig / worldFootCanChoose），
       测完把碰过的四个字段原样还回去，不留残留给后面的断言。 */
    const wfSnap = XX._s.worldFoot, tmSnap = XX._s.towerMax, gmSnap = XX._s.guardMirror, npSnap = XX._s.npcs;
    const steleWith = heard => ({ met: 1, rel: 8, stage: 2, seenGens: 0, lastSeen: 0, nudgeAt: 0,
      heard: heard, choice: { listened: 1, showoff: 0, promise: 0 }, cur: { lastRank: 0, talk: 2, promptTale: 0 } });
    const towerDot = () => { const d = document.querySelector('[data-bld="tower"] .e-dot');
      return !d ? 'none' : (d.classList.contains('on') ? 'on' : 'off'); };
    XX._s.npcs = { stele: steleWith([]) };
    XX._s.worldFoot = ''; XX._s.towerMax = 5; XX._s.guardMirror = 0; XX._dots(true);
    L('dotTowerEl', document.querySelector('[data-bld="tower"] .e-dot') ? 'yes' : 'no');
    L('dotTowerNoClue', towerDot());                                   /* 没听过④：不进塔也点不亮（错指检查） */
    XX._s.npcs = { stele: steleWith(['stele1','stele3','stele4']) };
    XX._s.towerMax = 0; XX._dots(true);
    L('dotTowerNoTower', towerDot());                                  /* 听过④但没进过塔：还不该亮 */
    XX._s.towerMax = 1; XX._dots(true);
    L('dotTowerDig', towerDot());                                      /* 听过④ + 进过塔 → 该亮（可俯身） */
    XX._s.worldFoot = 'dug'; XX._dots(true);
    L('dotTowerWait', towerDot());                                     /* 挖了但契机未到（无镜且塔<3 层）→ 灭 */
    XX._s.towerMax = 3; XX._dots(true);
    L('dotTowerDoor', towerDot());                                     /* 契机到了（塔 3 层）→ 再亮（三扇门待选） */
    XX._s.worldFoot = 'seal'; XX._s.towerMax = 8; XX._dots(true);
    L('dotTowerDone', towerDot());                                     /* 终态：不管塔多高都不再亮 */
    XX._s.worldFoot = wfSnap; XX._s.towerMax = tmSnap; XX._s.guardMirror = gmSnap; XX._s.npcs = npSnap;
    XX._dots(true);

    // ---- 修行札记 · 人物面板统计卡（2026-10-24）----
    window.switchTab('role_journal');
    XX._s.stats = { sit: 12, herb: 3, train: 5, enlight: 1, craftPill: 2, explore: 4, hunt: 30, enhance: 7, stoneEarned: 123456 };
    XX._s.towerMax = 15; XX._render();
    L('journalN', document.querySelectorAll('#xx-role-journal .stat').length);      // 10 项
    L('journalHunt', Array.from(document.querySelectorAll('#xx-role-journal .stat')).some(s => s.textContent.indexOf('30 只') >= 0) ? 'yes' : 'no');
    L('journalTower', Array.from(document.querySelectorAll('#xx-role-journal .stat')).some(s => s.textContent.indexOf('第 15 层') >= 0) ? 'yes' : 'no');

    // ---- 战利品浮现（2026-10-24）----
    const lootBox = document.getElementById('bt-loot');
    XX._showBattleLoot({ mat: 'mat_bone', stone: 3731 });                            // 塔胜利掉落行
    L('lootRows', lootBox.querySelectorAll('.bt-loot-row').length);                 // 2 行（材料+灵石）
    const lootImgs = lootBox.querySelectorAll('.bt-loot-row img');
    L('lootMatImg', lootImgs.length === 1 && (lootImgs[0].getAttribute('src') || '').indexOf('mat_bone.png') >= 0 ? 'yes' : 'no');
    L('lootStone', lootBox.textContent.indexOf('灵石') >= 0 ? 'yes' : 'no');
    const lootRowsEl = lootBox.querySelectorAll('.bt-loot-row');
    L('lootRow2Delay', (lootRowsEl[1] || { style: {} }).style.animationDelay || ''); // 第二行错峰 110ms
    const toast = document.getElementById('loot-toast');
    toast.innerHTML = '';                                                            // 清掉论剑/秘境的结算 chip，单测猎妖飘字
    XX._lootFloat('mat_bone', 2);                                                   // 猎妖飘字
    L('lootChip1', toast.querySelectorAll('.loot-chip').length);
    for(let li = 0; li < 5; li++) XX._lootFloat('mat_bone', 1);                     // 连发 5 枚
    L('lootChipCap', toast.querySelectorAll('.loot-chip').length);                  // 堆叠封顶 3

    // ---- 妖踪（第 102 轮）：猎妖挂机里的限时机会 ----
    XX._setBattleAnim(false);
    const trBar = document.getElementById('trace-bar');
    XX._s.rank = 8; XX._s.huntBeast = null; XX._s.huntProg = 0; XX._render();
    XX._hunt('rat');
    L('trHunted', XX._s.huntBeast === 'rat' ? 'yes' : 'no');
    XX._traceReset();
    L('trSpawned', XX._traceSpawn() ? 'yes' : 'no');
    L('trShown', trBar.classList.contains('hidden') ? 'no' : 'yes');
    L('trName', (document.getElementById('tb-name') || {}).textContent || '');
    L('trDesc', (document.getElementById('tb-desc') || {}).textContent || '');
    L('trLeft', (document.getElementById('tb-t') || {}).textContent || '');
    /* 追击·胜：战力压得住 → 灵石 = need×0.18、材料 +1、浮片收起 */
    const tr = XX._trace();
    tr.power = 1; XX._renderTrace();
    XX._s.bag.length = 0;                                                            // 前面用例可能塞满背包
    const trSt = XX._s.stone, trBag = XX._s.bag.length, trNeed = XX._needOf(XX._s.rank);
    XX._traceChase();
    L('trWinStone', (XX._s.stone - trSt) - Math.round(trNeed * 0.18));
    L('trWinBag', XX._s.bag.length - trBag);
    L('trHidden', trBar.classList.contains('hidden') ? 'yes' : 'no');
    /* 追击·负：差得远时按钮置灰；硬追则猎杀进度清零、颗粒无收 */
    XX._traceSpawn();
    XX._trace().power = XX._power() * 1e6;
    XX._renderTrace();
    L('trFarBtn', (document.getElementById('tb-chase') || {}).disabled ? 'yes' : 'no');
    XX._s.huntProg = 12;
    const trSt2 = XX._s.stone, trBag2 = XX._s.bag.length;
    XX._traceChase();
    L('trLose', (XX._s.stone === trSt2 && XX._s.bag.length === trBag2 && XX._s.huntProg === 0) ? 'yes' : 'no');
    /* 放过：只拾一份小灵石，进度不动 */
    XX._traceSpawn();
    XX._s.huntProg = 5;
    const trSt3 = XX._s.stone;
    XX._traceLet();
    L('trLetStone', (XX._s.stone - trSt3) - Math.round(trNeed * 0.02));
    L('trLetProg', XX._s.huntProg);
    /* 过期：遁走，不扣灵石、不清进度 */
    XX._traceSpawn();
    const trSt4 = XX._s.stone, trProg4 = XX._s.huntProg;
    XX._trace().until = Date.now() - 1;
    XX._traceTick();
    L('trExpired', (XX._trace() === null && trBar.classList.contains('hidden') &&
                    XX._s.stone === trSt4 && XX._s.huntProg === trProg4) ? 'yes' : 'no');
    /* 收功：浮片一起收起 */
    XX._traceSpawn();
    XX._stopHunt();
    L('trStopped', (XX._trace() === null && trBar.classList.contains('hidden')) ? 'yes' : 'no');

    // ---- 山门议事（第 103 轮）：每天一条琐事，三选一 ----
    /* 未立山门：只留一句提示，不摆三签 */
    XX._s.gate = { lv: 0, disciples: [], grad: 0 };
    XX._s.council = { day: '', n: 0, last: '' };
    window.ROUTER.open('zong'); XX._render();
    L('coSealNoGate', (document.getElementById('xx-hub-zong-council') || {}).textContent || '');
    window.ROUTER.open('zong_council'); XX._render();
    L('coNoGate', (((document.getElementById('xx-council') || {}).textContent || '').indexOf('山门还没立起来') >= 0 ? 'yes' : 'no') +
      '/' + document.querySelectorAll('#xx-council .co-opt').length);
    L('coDayNoGate', (document.getElementById('sc-co-day') || {}).textContent || '');
    /* 立山门 + 一名闲弟子：第一条议题「山下蝗灾」三签齐全 */
    XX._s.gate = { lv: 1, disciples: [{ id: 'd1', name: '青禾', apt: 3, task: '', t0: 0, ret: 0, svc: 0, last: '', run: 0, bless: 0 }], grad: 0 };
    XX._s.stone = 1e6; XX._s.council = { day: '', n: 0, last: '' };
    const coHerb0 = XX._s.herb;
    window.ROUTER.open('zong_council'); XX._render();
    L('coTitle', (document.querySelector('#xx-council .co-head b') || {}).textContent || '');
    L('coOptN', document.querySelectorAll('#xx-council .co-opt').length);
    L('coOptNames', Array.from(document.querySelectorAll('#xx-council .co-opt .co-n')).map(e => e.textContent.trim()).join('/'));
    L('coEffRelief', (document.querySelector('#xx-council .co-opt[data-cok="relief"] .co-eff') || {}).textContent || '');
    L('coNeed', XX._needOf(XX._s.rank));
    /* 点面板上真的签：赈济 = 灵石 −need×0.35 换 灵草 +6、声望 +12 */
    const coSt0 = XX._s.stone, coRep0 = XX._s.arena.rep | 0;
    document.querySelector('#xx-council .co-opt[data-cok="relief"]').click();
    L('coPayStone', Math.round(XX._s.stone - coSt0));
    L('coPayHerb', Math.round(XX._s.herb - coHerb0));
    L('coPayRep', (XX._s.arena.rep | 0) - coRep0);
    L('coSealed', document.querySelectorAll('#xx-council .co-done').length);
    L('coDayDone', (document.getElementById('sc-co-day') || {}).textContent || '');
    L('coDoneHead', (document.querySelector('#xx-council .co-done b') || {}).textContent || '');
    L('coLast', (document.querySelector('#xx-council .co-done small') || {}).textContent || '');
    /* 同日不留第二笔 */
    const coSt1 = XX._s.stone, coN1 = XX._s.council.n;
    L('coAgain', String(XX._councilPick('relief')));
    L('coAgainPay', (XX._s.stone === coSt1 && XX._s.council.n === coN1) ? 'yes' : 'no');
    /* 次日解封：议题轮到第二条「邻山求药」 */
    XX._s.council.day = ''; XX._render();
    L('coRotate', (document.querySelector('#xx-council .co-head b') || {}).textContent || '');
    /* 灵草不足：赠药那签置灰并直接写原因 */
    XX._s.herb = 0; XX._render();
    const coGift = document.querySelector('#xx-council .co-opt[data-cok="gift"]');
    L('coBlockHerb', (coGift && coGift.disabled ? 'yes' : 'no') + '/' +
      ((coGift && coGift.querySelector('.co-eff').textContent) || ''));
    /* 无人可派：第四条议题的「准其下山」置灰 */
    XX._s.council.n = 3; XX._s.gate.disciples[0].task = 'seclude'; XX._render();
    const coAllow = document.querySelector('#xx-council .co-opt[data-cok="allow"]');
    L('coBlockIdle', (coAllow && coAllow.disabled ? 'yes' : 'no') + '/' +
      ((coAllow && coAllow.querySelector('.co-eff').textContent) || ''));
    L('coDayIdle', (document.getElementById('sc-co-day') || {}).textContent || '');
    /* 弟子回山：选「准其下山」→ 差事趟数 +1 */
    XX._s.gate.disciples[0].task = ''; XX._render();
    const coSvc0 = XX._gateSvc(XX._s.gate.disciples[0]);
    document.querySelector('#xx-council .co-opt[data-cok="allow"]').click();
    L('coSvc', XX._gateSvc(XX._s.gate.disciples[0]) - coSvc0);
    /* 五条议题轮完落在第五条（再往下就回第一条） */
    L('coCycle', XX._councilIssues.length + '/' + XX._councilIssue().id);
    L('coHubSecs', HUBKIT.secsOf('zong').length + '/' + HUBKIT.secsOf('zong')[1].view);
    XX._s.herb = coHerb0 + 6;

    // ---- 灵兽诞生 · 孵化演出（2026-10-25）----
    window.ROUTER.open('chong');
    XX._s.stone = 999999; XX._s.eggs = [{ bid: 'rat' }]; XX._s.pets = []; XX._s.petSlots = 2;
    XX._render();
    XX._hatch(0);                                                                   // 走真实孵化入口
    const hm = document.getElementById('hatch-modal');
    L('hatchModalShown', hm && !hm.classList.contains('hidden') ? 'yes' : 'no');
    L('hatchEggGone', XX._eggs().length === 0 ? 'yes' : 'no');
    L('hatchPetBid', (XX._pets()[0] || {}).bid || '');
    const hImg = document.getElementById('hatch-beast');
    L('hatchImg', hImg && (hImg.getAttribute('src') || '').indexOf('beast_rat.png') >= 0 ? 'yes' : 'no');
    L('hatchName', (document.getElementById('hatch-name') || {}).textContent || '');
    L('hatchDesc', (document.getElementById('hatch-desc') || {}).textContent || '');
    await sleep(1300);                                                              // 等 550 裂壳 + 950 诞生
    L('hatchBorn', document.getElementById('hatch-stage').classList.contains('born') ? 'yes' : 'no');
    L('hatchCrack', document.getElementById('hatch-stage').classList.contains('crack') ? 'yes' : 'no');
    document.getElementById('hatch-close').click();
    L('hatchClosed', hm.classList.contains('hidden') ? 'yes' : 'no');
    window.ROUTER.back();

    // ---- 主线《断天门》：进程内触发（2026-10-25 第 51 节口径）----
    /* 依赖注入用真的 XX 出口（finishBoot 里那套就是这个形状）；log 收集起来验证"指路句" */
    const stLogs = [];
    const stD = { s: () => XX._s, needOf: XX._needOf, wisdom: XX._wisdomGain, heroRank: XX._heroRank,
                  log: t => { stLogs.push(t); }, save: () => {}, render: () => XX._render() };
    /* 先把局面清成"刚出新手村"：只有 1-1 天然达成，其余全部未满足（否则前面的用例会把条件提前做完） */
    XX._s.story = { claimed: {} };
    XX._s.cave = 0; XX._s.rank = 0; XX._s.towerMax = 0; XX._s.mastery.alchemyExp = 0;
    XX._s.stats.farmN = 0; XX._s.secret.prog = [0, 0, 0, 0]; XX._s.pets = []; XX._s.enc.lastId = '';
    XX._s.arena.win = 0; XX._s.gong1 = 0; XX._s.gong2 = 0; XX._s.gong3 = 0;
    Story.init(stD);
    Story._resetBurst();
    L('storyTotal', Story._STORY.length);                                   // 23 段
    /* 境界常量必须与 RANK_NAMES 对得上：原稿 jindan=7 / yuanying=13 / huashen=19 全错位 */
    L('storyRK', XX.ranks[Story._rk.jindan] + '/' + XX.ranks[Story._rk.yuanying] + '/' + XX.ranks[Story._rk.huashen]);
    /* 秘境进度是四章层数数组，不能直接拿去比较 */
    L('storySecSum', Story._STORY.find(q => q.id === '2-4').prog({ secret: { prog: [10, 0, 0, 0] } }));
    L('story42Need', Story._STORY.find(q => q.id === '4-2').need);          // 改二值判定后 = 1
    L('storyNoEntry', document.querySelector('[data-bld="story"]') ? 'yes' : 'no');   // 城镇里不该再有入口
    L('storyModalInDom', !!document.getElementById('story-modal') ? 'yes' : 'no');
    L('storyFirst', Story._state(0));                                       // open
    L('storySecond', Story._state(1));                                      // lock

    /* 台上有人时让路：战斗弹窗开着 → 不允许插进来说话 */
    const SM = document.getElementById('story-modal');
    const hideAll = () => ['char-modal','battle-modal','off-modal','hatch-modal','trib-modal',
      'break-modal','enc-modal','treasure-modal','item-modal','reroll-modal','settings-modal']
      .forEach(id => { const e = document.getElementById(id); if(e) e.classList.add('hidden'); });
    hideAll();
    /* 先把剧情模块收回已知状态再谈「台上有人时让路」/「自动弹出」：前面几十节用例跑了很久，
       真正的 Story 一直在后台心跳，可能正有一张卡挂在台上 —— playing 只有 closeCard() 能复位，
       而 hideAll() 那份名单里不含 story-modal。不复位就是「永远弹不出来」，实测约 1/4 的运行
       栽在这，后面 4 条跟着连坐（假红）。 */
    Story.closeCard();
    Story._resetBurst();
    document.getElementById('battle-modal').classList.remove('hidden');
    Story._tick();
    L('storyYieldBattle', SM.classList.contains('hidden') ? 'yes' : 'no');
    document.getElementById('battle-modal').classList.add('hidden');

    /* 达成即触发：1-1 条件恒真 → 下一次心跳自己弹出来，奖励当场入账。
       ⚠️ 「下一次心跳」是 500ms 的循环，不保证落在调用 _tick() 的同一帧里，所以最多让 6 帧；
          弹不出来照样红，只是不再拿调度抖动当 bug。 */
    const wisBak = XX._s.wisdom | 0;
    let storyTicks = 0;
    while (storyTicks++ < 6 && SM.classList.contains('hidden')) { Story._tick(); await sleep(200); }
    L('storyTicks', storyTicks);
    L('storyAutoShown', SM.classList.contains('hidden') ? 'no' : 'yes');
    L('storyAutoName', (document.getElementById('sto-name') || {}).textContent || '');
    L('storyAutoText', ((document.getElementById('sto-text') || {}).textContent || '').slice(0, 6));
    L('storyGain', ((document.getElementById('sto-gain') || {}).textContent || '').indexOf('悟道值') >= 0 ? 'yes' : 'no');
    L('storyWisGain', (XX._s.wisdom | 0) > wisBak ? 'yes' : 'no');           // 原稿把 wisdomGain 的返回值丢了
    L('storyRec', typeof (XX._s.story.claimed || {})['1-1'] === 'number' ? 'yes' : 'no');
    L('storyHintLog', stLogs.some(t => t.indexOf('断天门 · 下一步') >= 0) ? 'yes' : 'no');
    L('storyHintTxt', ((stLogs.filter(t => t.indexOf('下一步') >= 0).pop() || '').split('下一步：')[1] || ''));

    /* 卡片在台上时不叠第二张 */
    XX._s.cave = 2;                                                          // 1-2 条件达成
    Story._tick();
    L('storyNoStack', (XX._s.story.claimed || {})['1-2'] ? 'yes' : 'no');    // 应为 no
    Story.closeCard();
    L('storyClosed', SM.classList.contains('hidden') ? 'yes' : 'no');
    /* 两张浮片之间至少隔 6 秒（不许刚关就怼一张）；这里把间隔清零，模拟"已经过了一会儿" */
    Story._resetBurst();
    Story._tick();
    L('storyNextAuto', (XX._s.story.claimed || {})['1-2'] ? 'yes' : 'no');   // 间隔过去后下一段自己接上
    L('storySeg2', SM.getAttribute('data-seg') || '');
    Story.closeCard();

    /* 4 段同时达成（1-4b 上线后：1-3 / 1-4 / 1-4b / 1-5 一次全成，
       正好达到既有补记阈值 MERGE_AT=4）→ 出一张补记卡，名目全列、奖励先记 */
    XX._s.story = { claimed: { '1-1': 1, '1-2': 1 } };
    XX._s.rank = 1;                                                          // 1-3 需 rank>=1
    XX._s.towerMax = 3;                                                      // 1-4 需 3（1-4b 读 claimed['1-4']）
    XX._s.mastery.alchemyExp = 0;                                            // 2-1 不给
    XX._s.stats.farmN = 0;
    Story._resetBurst();
    Story._tick();
    L('storyTripleN', Object.keys(XX._s.story.claimed).length);              // 2 + 4 = 6
    L('storyTripleSeg', SM.getAttribute('data-seg') || '');                  // merge
    L('storyTripleList', (document.getElementById('sto-list') || {}).textContent || '');
    Story.closeCard(); await sleep(700);
    L('storyTripleStop', SM.classList.contains('hidden') ? 'yes' : 'no');    // 队空才收手
    L('storyTripleClaimed', Object.keys(XX._s.story.claimed).length);        // 仍是 6

    /* 两张浮片之间至少隔 6 秒：同一秒里又达成一段，卡不会立刻怼上来，只排着 */
    XX._s.story = { claimed: { '1-1': 1 } };
    XX._s.cave = 2;                                                          // 1-2 满足
    XX._s.rank = 0; XX._s.towerMax = 0;                                      // 1-3/1-4 先不满足（否则凑够 4 段走补记）
    Story._resetBurst();
    Story._tick();
    L('storyGapFirst', SM.getAttribute('data-seg') || '');                   // 1-2
    Story.closeCard();
    XX._s.rank = 1;                                                          // 1-3 这时才满足
    Story._tick();                                                           // 但距上一张不足 6 秒
    L('storyGapWait', SM.classList.contains('hidden') ? 'yes' : 'no');       // 排着，先不弹
    L('storyGapQueued', Story._burst().queued);                              // 1
    L('storyGapRec', (XX._s.story.claimed || {})['1-3'] ? 'yes' : 'no');     // 奖励先记下，不等演

    /* 老档回归（真实场景）：一次补 15 段（1-4b 上线后多一段）→ 不逐段演，出一张补记卡 */
    XX._s.story = { claimed: {} };
    XX._s.rank = 12; XX._s.cave = 8; XX._s.towerMax = 20; XX._s.mastery.alchemyExp = 500;
    XX._s.stats.farmN = 40; XX._s.pets = [{ bid: 'rat', lv: 5, exp: 0 }]; XX._s.enc.lastId = 'beggar';
    XX._s.secret.prog = [12, 0, 0, 0]; XX._s.gong1 = 6; XX._s.gong2 = 6; XX._s.gong3 = 6;
    XX._s.arena.win = 5;
    Story._resetBurst();
    Story._tick();
    L('storyMergeN', Object.keys(XX._s.story.claimed).length);               // 15（1-1 ~ 3-4 + 1-4b）
    L('storyMergeSeg', SM.getAttribute('data-seg') || '');                   // merge
    L('storyMergeName', (document.getElementById('sto-name') || {}).textContent || '');
    L('storyMergeHead', (document.getElementById('sto-ch') || {}).textContent || '');
    L('storyMergeList', (document.getElementById('sto-list') || {}).textContent || '');
    L('storyMergeGain', (document.getElementById('sto-gain') || {}).textContent || '');
    L('storyMergeJump', (document.getElementById('sto-jump') || { style: {} }).style.display === 'none' ? 'no' : 'yes');
    L('storyMergeHint', (stLogs.filter(t => t.indexOf('下一步') >= 0).pop() || '').split('下一步：')[1] || '');
    Story.closeCard();

    /* 履历：断天门自成第 88 轮 B 的一页（只作回看，不是入口） */
    window.ROUTER.open('role_story');
    L('storyLogItems', document.querySelectorAll('#xx-role-story .sto-item').length);
    L('storyLogSub', (document.getElementById('xx-role-story-sub') || {}).textContent || '');
    L('storyLogNow', document.querySelectorAll('#xx-role-story .sto-now').length);
    L('storyLogHint', document.querySelectorAll('#xx-role-story .sto-hint').length > 0 ? 'yes' : 'no');
    /* 弹窗「去看这一段」的走法：面板名 + 履历锚点 → 直达独立页，底下仍压 hub 一层 */
    window.ROUTER.open('role', 'xx-role-story');
    L('storyDeep', window.ROUTER.current());
    L('storyDeepDepth', window.ROUTER.depth());

    /* ---- 悟道树（2026-10-25 第 59 节）：与天机阁抢同一笔悟道值 ---- */
    window.ROUTER.open('role_wu');
    XX._s.rank = 20; XX._s.wisdom = 1e6;
    XX._s.wu = { sword: 0, dan: 0, array: 0 }; XX._s.wuPaid = { sword: 0, dan: 0, array: 0 };
    XX._render();
    L('wuRows', document.querySelectorAll('#xx-role-wu .wu-row').length);          // 3 路
    L('wuNodes', document.querySelectorAll('#xx-role-wu .wu-node').length);        // 15 节点（五层）
    L('wuLit', document.querySelectorAll('#xx-role-wu .wu-node.on').length);       // 0
    const wuM0 = XX._wuMult();
    L('wuCost', XX._wuCost('dan'));                                               // 200×1.15^20 ≈ 3274（2026-11-19 首层 400→200 已批）
    L('wuBuyOk', XX._wuBuy('dan'));
    L('wuDanLv', XX._s.wu.dan);
    L('wuExpUp', XX._wuMult().exp > wuM0.exp ? 'yes' : 'no');
    L('wuPaidTracked', XX._s.wuPaid.dan === XX._wuCost('dan') ? 'no' : XX._s.wuPaid.dan);  // 已升级，现价不同；只要 >0
    const wuWisB = XX._s.wisdom;
    L('wuRespecOk', XX._wuRespec());
    L('wuRespecBack', XX._s.wisdom - wuWisB);                                     // 0.8 × 实付
    L('wuAfterRespec', XX._s.wu.dan + '/' + XX._s.wuPaid.dan);                    // 0/0
    L('wuExpBack', XX._wuMult().exp);                                             // 1
    /* 满级封顶：五层扩层后连点 6 次，第 6 次必须被拒；顺带核对后两层的新价 */
    XX._s.wisdom = 1e9;
    L('wuCostL1', XX._wuCost('sword'));                                           // 200×1.15^20
    XX._wuBuy('sword'); XX._wuBuy('sword'); XX._wuBuy('sword');
    L('wuCostL4', XX._wuCost('sword'));                                           // 3500×1.15^20
    XX._wuBuy('sword');
    L('wuCostL5', XX._wuCost('sword'));                                           // 5000×1.15^20
    XX._wuBuy('sword');
    L('wuMaxLv', XX._s.wu.sword);                                                 // 5
    L('wuBuyAtMax', XX._wuBuy('sword'));                                          // false
    L('wuSwordPct', XX._wuPct('sword'));                                          // 8+8+10+12+14 = 52
    window.ROUTER.back();

    /* ---- 山门 · 弟子（2026-10-25 第 61 节）：灵石出口 + 差事闭环 ---- */
    window.ROUTER.open('zong_gate');
    XX._s.rank = 12; XX._s.stone = 5e7;
    XX._s.gate = { lv: 0, disciples: [] };
    XX._render();
    L('gateCard', !!document.getElementById('sc-gate') ? 'yes' : 'no');
    L('gateLockedCost', (document.querySelector('#sc-gate [data-gact="build"]') || {}).textContent || '');
    const gateSt0 = XX._s.stone;
    L('gateBuildOk', XX._gateBuild());                                            // true
    L('gateLv', XX._s.gate.lv);                                                   // 1
    L('gateCostPaid', XX._s.stone < gateSt0 ? 'yes' : 'no');
    L('gateCap', XX._gateCap());                                                  // 4
    L('gateLvName', (document.getElementById('sc-gate-lv') || {}).textContent || '');
    const gd1 = XX._gateRecruit();
    L('gateRec', gd1 ? 'yes' : 'no');
    L('gateAptRange', (gd1 && gd1.apt >= 1 && gd1.apt <= 5) ? 'ok' : 'bad');
    L('gateCards', document.querySelectorAll('#sc-gate .dcard:not(.empty)').length);   // 1
    L('gateEmptySlots', document.querySelectorAll('#sc-gate .dcard.empty').length);    // 3
    /* 派差事：点面板上那颗真的按钮（不是直接调函数） */
    window.ROUTER.open('zong_gate');
    const gBtn = document.querySelector('#sc-gate .dact[data-gact="seclude"]');
    L('gateBtnInDom', !!gBtn ? 'yes' : 'no');
    if(gBtn) gBtn.click();
    L('gateBusyAfterClick', XX._gateBusy(XX._s.gate.disciples[0]) ? 'yes' : 'no');
    L('gateCardBusy', document.querySelectorAll('#sc-gate .dcard.busy').length);   // 1
    const gd = XX._s.gate.disciples[0];
    /* 时辰到 → 结算；三种差事各自落账 */
    const gExp0 = XX._s.exp, gHerb0 = XX._s.herb, gOre0 = XX._s.ore, gWis0 = XX._s.wisdom | 0;
    gd.t0 = Date.now() - 4 * 3600 * 1000 - 2000;
    L('gateSettleN', XX._gateSettle());                                           // 1
    L('gateExpUp', XX._s.exp > gExp0 ? 'yes' : 'no');
    L('gateFreed', XX._gateBusy(gd) ? 'busy' : 'idle');                            // idle
    L('gateLog', (XX._s.log.find(x => x.t.indexOf('弟子回山') >= 0) || {}).t || '');
    XX._gateAssign(gd.id, 'herb'); gd.t0 = Date.now() - 3 * 3600 * 1000;
    XX._gateSettle();
    L('gateHerbUp', XX._s.herb > gHerb0 ? 'yes' : 'no');
    XX._gateAssign(gd.id, 'patrol'); gd.t0 = Date.now() - 7 * 3600 * 1000;
    XX._gateSettle();
    L('gateOreUp', XX._s.ore > gOre0 ? 'yes' : 'no');
    L('gateWisUp', (XX._s.wisdom | 0) > gWis0 ? 'yes' : 'no');
    /* 时辰未到不许结算（防"点一下就回山"）：settle 必须返回 0，且人还在外面 */
    XX._gateAssign(gd.id, 'seclude');
    L('gateNotYet', (XX._gateSettle() === 0 && XX._gateBusy(gd)) ? 'yes' : 'no');
    /* 上限：收满即拒；升品阶后又能收 */
    XX._s.stone = 5e7;
    while(XX._s.gate.disciples.length < XX._gateCap()) XX._gateRecruit();
    L('gateFull', XX._gateRecruit() ? 'over' : 'blocked');                         // blocked
    L('gateFullBtn', (document.querySelector('#sc-gate [data-gact="recruit"]') || {}).disabled ? 'disabled' : 'enabled');
    L('gateUpOk', XX._gateUp());
    L('gateLv2', XX._s.gate.lv + '/' + XX._gateCap());                             // 2/6
    XX._s.stone = 5e7;
    L('gateRecruitAgain', XX._gateRecruit() ? 'yes' : 'no');
    /* 离线：人不在的这 8 小时里，差事照样到点结算（gateSettle 挂在 tick 上，offline 走同一条） */
    XX._gateAssign(XX._s.gate.disciples[0].id, 'seclude');
    XX._s.gate.disciples[0].t0 = Date.now() - 5 * 3600 * 1000;
    XX._s.last = Date.now() - 8 * 3600 * 1000;
    XX._offline();
    L('gateOffline', XX._gateBusy(XX._s.gate.disciples[0]) ? 'busy' : 'idle');
    XX._s.last = Date.now();
    /* ---- 弟子成长（第 62 节）：点化 → 出师 → 门风 ---- */
    XX._s.rank = 12; XX._s.stone = 5e7;
    XX._s.gate = { lv: 1, grad: 0, disciples: [
      { id: 'ga', name: '甲', apt: 2, task: '', t0: 0, ret: 0, svc: 0 },
      { id: 'gb', name: '乙', apt: 3, task: '', t0: 0, ret: 0, svc: 5 }
    ] };
    XX._render();
    L('aptCost', XX._gateAptCost());                                              // > 0
    L('aptBtnN', document.querySelectorAll('#sc-gate .dapt[data-gact="apt"]').length);   // 2
    const aSt = XX._s.stone;
    const aBtn = document.querySelector('#sc-gate .dapt[data-gact="apt"]');
    if(aBtn) aBtn.click();
    L('aptUp', XX._gateAptOf(XX._gateList()[0]) + '/' + (aSt - XX._s.stone === XX._gateAptCost() ? 'paid' : 'bad'));   // 3/paid
    L('aptChip', (document.querySelector('#sc-gate .dapt') || {}).textContent || '');    // 玄阶 ↑
    /* 到顶：天阶那枚签不再是按钮，函数也直接拒 */
    XX._s.gate.disciples[0].apt = 5; XX._render();
    L('aptMaxBtn', document.querySelectorAll('#sc-gate .dapt[data-gact="apt"]').length); // 1（只剩乙）
    L('aptMaxReject', XX._gateApt('ga'));                                         // false
    /* 人不在山上点化不了（也不扣钱、不给按钮） */
    const ga0 = XX._s.gate.disciples[0], gaSt = XX._s.stone;
    ga0.task = 'seclude'; ga0.t0 = Date.now(); XX._render();
    L('aptBusyReject', XX._gateApt('ga') + '/' + (XX._s.stone === gaSt ? 'kept' : 'lost'));  // false/kept
    L('aptBusyNoBtn', document.querySelectorAll('#sc-gate .dcard.busy .dapt[data-gact="apt"]').length);  // 0
    ga0.task = ''; ga0.t0 = 0;
    /* 差事满六趟 → 出师：空出一个位子、留一笔灵石、加一条门风 */
    const gb0 = XX._s.gate.disciples[1];
    L('gradNotYet', XX._gateGradReady(gb0) ? 'yes' : 'no');                       // no（才 5 趟）
    XX._gateAssign('gb', 'herb'); gb0.t0 = Date.now() - 3 * 3600 * 1000;
    XX._gateSettle();
    L('svcUp', XX._gateSvc(gb0));                                                 // 6
    XX._render();
    L('gradBtnN', document.querySelectorAll('#sc-gate [data-gact="grad"]').length);// 1
    const sSt = XX._s.stone, listN = XX._gateList().length, gain = XX._gateGradGain(gb0);
    L('gradOk', XX._gateGraduate('gb'));                                          // true
    L('gradGain', XX._s.stone - sSt - gain);                                      // 0（正好入账这么多）
    L('gradLeft', listN + '>' + XX._gateList().length);                            // 2>1
    L('gradN', XX._gateGradN());                                                  // 1
    L('gradLog', (XX._s.log.find(x => x.t.indexOf('出师') >= 0) || {}).t || '');
    L('fengPct', Math.round(XX._gateFeng() * 100));                               // 2
    L('fengMult', Math.round(XX._gateYieldMult() * 1000) / 1000);                 // 1.12
    L('fengShown', (document.querySelector('#sc-gate .gate-feng') || {}).textContent || '');
    L('gradSlotBack', (document.querySelector('#sc-gate [data-gact="recruit"]') || {}).disabled ? 'disabled' : 'open');  // open
    /* 弟子的话（第 63 节）：确定（不随机）、随资质与趟数变、真进了名牒 */
    const gv = XX._gateList()[0];
    L('voiceTxt', (document.querySelector('#sc-gate .dv-t') || {}).textContent || '');
    L('voiceNum', (document.querySelector('#sc-gate .dv-n') || {}).textContent || '');        // 差事 0/6
    L('voiceSame', XX._gateVoice(gv) === XX._gateVoice(gv) ? 'same' : 'diff');
    L('voiceTier0', XX._gateVoiceTier(gv));                                          // 0
    const v0 = XX._gateVoice(gv);
    gv.svc = 5; XX._render();
    L('voiceTier3', XX._gateVoiceTier(gv) + '/' + (XX._gateVoice(gv) !== v0 ? 'changed' : 'same'));  // 3/changed
    L('voiceNum3', (document.querySelector('#sc-gate .dv-n') || {}).textContent || '');       // 差事 5/6
    L('voiceAptDiff', XX._gateVoice({ id: 'ga', apt: 1, svc: 5 }) !== XX._gateVoice({ id: 'ga', apt: 5, svc: 5 }) ? 'diff' : 'same');
    let libBad = '';
    XX._gateVoiceLib.forEach((row, ai) => { row.forEach((pool, ti) => { pool.forEach(v => {
      if(!v || v.length > 20) libBad += ai + '-' + ti + ':' + (v || '').length + ' ';
    }); }); });
    L('voiceLibBad', libBad);
    /* 弟子记事（第 65 节）：连着两趟同一件事，话换成那件事的；换一件就从头数 */
    const vRun0 = XX._gateVoice({ id: 'gr', apt: 2, svc: 4 });
    const vRun2 = XX._gateVoice({ id: 'gr', apt: 2, svc: 4, last: 'herb', run: 2 });
    const vRun4 = XX._gateVoice({ id: 'gr', apt: 2, svc: 4, last: 'herb', run: 4 });
    L('runVoice', (vRun0 !== vRun2 ? 'changed' : 'same') + '/' + (vRun2 !== vRun4 ? 'changed' : 'same'));
    L('runTaskDiff', XX._gateVoice({ id: 'gr', apt: 2, svc: 4, last: 'herb', run: 3 }) !==
                     XX._gateVoice({ id: 'gr', apt: 2, svc: 4, last: 'patrol', run: 3 }) ? 'diff' : 'same');
    XX._gateAssign('ga', 'herb'); ga0.t0 = Date.now() - 3 * 3600 * 1000; XX._gateSettle();
    const rv1 = XX._gateRun(ga0) + '/' + XX._gateLast(ga0) + '/' + XX._gateRunBand(ga0);
    XX._gateAssign('ga', 'herb'); ga0.t0 = Date.now() - 3 * 3600 * 1000; XX._gateSettle();
    const rv2 = XX._gateRun(ga0) + '/' + XX._gateLast(ga0) + '/' + XX._gateRunBand(ga0);
    XX._gateAssign('ga', 'patrol'); ga0.t0 = Date.now() - 7 * 3600 * 1000; XX._gateSettle();
    const rv3 = XX._gateRun(ga0) + '/' + XX._gateLast(ga0) + '/' + XX._gateRunBand(ga0);
    L('runCount', rv1 + ' → ' + rv2 + ' → ' + rv3);    // 1/herb/0 → 2/herb/1 → 1/patrol/0
    let taskBad = '';
    Object.keys(XX._gateVoiceTaskLib).forEach(k => XX._gateVoiceTaskLib[k].forEach((row, ai) => row.forEach((pool, ri) => pool.forEach(v => {
      if(!v || v.length > 20) taskBad += k + ai + ri + ':' + (v || '').length + ' ';
    }))));
    L('voiceTaskBad', taskBad);
    /* 弟子主动开口（第 66 节）：run 恰好到门槛（2/4/6）那一趟才说话，1/3/5 不说；单次结算最多两句 */
    ga0.svc = 0; ga0.run = 0; ga0.last = '';
    XX._gateAssign('ga', 'herb'); ga0.t0 = Date.now() - 3 * 3600 * 1000; XX._gateSettle();   // run1 → 不开口
    L('homeSay1', /^💬/.test(XX._s.log[0].t) ? 'said' : 'silent');
    XX._gateAssign('ga', 'herb'); ga0.t0 = Date.now() - 3 * 3600 * 1000; XX._gateSettle();   // run2 → 开口
    const mSay2 = XX._s.log[0].t.match(/^💬 甲：「(.+)」$/);
    L('homeSay2', mSay2 ? mSay2[1] : '');
    L('homeSay2In', (mSay2 && XX._gateVoiceHomeLib.herb[0].indexOf(mSay2[1]) >= 0) ? 'in' : 'out');
    XX._gateAssign('ga', 'herb'); ga0.t0 = Date.now() - 3 * 3600 * 1000; XX._gateSettle();   // run3 → 沉默
    L('homeSay3', /^💬/.test(XX._s.log[0].t) ? 'said' : 'silent');
    XX._gateAssign('ga', 'herb'); ga0.t0 = Date.now() - 3 * 3600 * 1000; XX._gateSettle();   // run4 → 意见句
    const mSay4 = XX._s.log[0].t.match(/^💬 甲：「(.+)」$/);
    L('homeSay4In', (mSay4 && XX._gateVoiceHomeLib.herb[1].indexOf(mSay4[1]) >= 0) ? 'in' : 'out');
    XX._gateAssign('ga', 'herb'); ga0.t0 = Date.now() - 3 * 3600 * 1000; XX._gateSettle();   // run5 → 沉默
    L('homeSay5', /^💬/.test(XX._s.log[0].t) ? 'said' : 'silent');
    XX._gateAssign('ga', 'herb'); ga0.t0 = Date.now() - 3 * 3600 * 1000; XX._gateSettle();   // run6 → 临行句
    const mSay6 = XX._s.log[0].t.match(/^💬 甲：「(.+)」$/);
    L('homeSay6In', (mSay6 && XX._gateVoiceHomeLib.herb[2].indexOf(mSay6[1]) >= 0) ? 'in' : 'out');
    /* 上限：三人同趟到门槛，只落名册序前两名。先清空日志——log 有 40 条上限，
       前面的流程已把它塞满，再 unshift 只会挤掉旧条目，"数新增"会数出 0。 */
    XX._s.gate.disciples.push(
      { id: 'gc', name: '丙', apt: 2, task: 'patrol',  t0: Date.now() - 6 * 3600 * 1000 - 1500, ret: 0, svc: 1, last: 'patrol',  run: 1 },
      { id: 'gd', name: '丁', apt: 3, task: 'seclude', t0: Date.now() - 4 * 3600 * 1000 - 1500, ret: 0, svc: 1, last: 'seclude', run: 1 },
      { id: 'ge', name: '戊', apt: 1, task: 'herb',    t0: Date.now() - 2 * 3600 * 1000 - 1500, ret: 0, svc: 1, last: 'herb',    run: 1 }
    );
    XX._s.log = [];
    XX._gateSettle();
    const homeNew = XX._s.log.filter(x => /^💬/.test(x.t));
    L('homeCap', homeNew.length + '/' + homeNew.map(x => (x.t.match(/^💬 (.+?)：「/) || ['', '?'])[1]).join(','));
    let homeBad = '';
    Object.keys(XX._gateVoiceHomeLib).forEach(k => XX._gateVoiceHomeLib[k].forEach((row, hi) => row.forEach(v => {
      if(!v || v.length > 20) homeBad += k + hi + ':' + (v || '').length + ' ';
    })));
    L('homeLibBad', homeBad);
    /* 弟子对玩家的记忆（第 67 节）：点化当场开口 + 出师告别语分档 */
    ga0.apt = 2; ga0.bless = 0; ga0.task = ''; ga0.t0 = 0; XX._render();
    XX._s.log = []; XX._s.stone = 5e7;
    const bBtn = document.querySelector('#sc-gate .dapt[data-gact="apt"]');
    if(bBtn) bBtn.click();                    /* 点化甲：黄阶 → 玄阶（真按钮） */
    const mBl = (XX._s.log[0] || {}).t ? XX._s.log[0].t.match(/^💬 甲：「(.+)」$/) : null;
    L('blessSay', mBl ? mBl[1] : '');
    L('blessSayIn', (mBl && XX._gateVoiceBlessLib[XX._gateList()[0].apt - 2].indexOf(mBl[1]) >= 0) ? 'in' : 'out');
    L('blessCnt', XX._gateList()[0].bless | 0);                    // 1
    L('blessPaid', (5e7 - XX._s.stone === XX._gateAptCost()) ? 'paid' : 'bad');
    L('blessOrder', /^🌀/.test((XX._s.log[1] || {}).t || '') ? 'yes' : 'no');   /* 系统行在他话的下面 */
    /* 出师告别语：被点化过的说"记得你"，没点化的还是吃用那句 */
    ga0.bless = 2; ga0.svc = 6; XX._render();
    const fwN0 = XX._gateList().length;
    XX._s.log = [];
    XX._gateGraduate('ga');
    const fwLines = XX._s.log.filter(x => /^💬/.test(x.t));
    L('farewellIn', (fwLines.length === 1 && XX._gateVoiceFarewellLib[0].indexOf((fwLines[0].t.match(/^💬 甲：「(.+)」$/) || ['', ''])[1]) >= 0) ? 'in' : 'out');
    L('gradGone', fwN0 + '>' + XX._gateList().length);             // 4>3
    XX._s.gate.disciples.push({ id: 'gf', name: '己', apt: 2, task: '', t0: 0, ret: 0, svc: 6, last: '', run: 0, bless: 0 });
    XX._s.log = [];
    XX._gateGraduate('gf');
    L('farewellPlain', /^💬/.test(XX._s.log[0].t) ? 'voice' : (XX._s.log[0].t.indexOf('吃用') >= 0 ? 'plain' : 'other'));
    let blessBad = '';
    XX._gateVoiceBlessLib.forEach((row, bi) => row.forEach(v => { if(!v || v.length > 20) blessBad += bi + ':' + (v || '').length + ' '; }));
    XX._gateVoiceFarewellLib.forEach(row => row.forEach(v => { if(!v || v.length > 20) blessBad += 'F:' + (v || '').length + ' '; }));
    L('blessLibBad', blessBad);
    gv.svc = 0;
    /* 低境界没有山门：按钮禁用 + 说明是"需筑基" */
    XX._s.rank = 3; XX._s.gate = { lv: 0, disciples: [] }; XX._render();
    L('gateLockedAtLow', (document.querySelector('#sc-gate .gate-btn') || {}).disabled ? 'yes' : 'no');
    L('gateLockedHint', (document.querySelector('#sc-gate .hint') || {}).textContent || '');
    XX._s.rank = 12;
    window.ROUTER.back();

    /* ---- 洞天开辟（第 70 节） ----
       默认全 0 时所有钩子必须与旧口径一模一样；开启后才逐项生效。
       价格用「一层灵石收入 × 0.30」现算，不抄实现。 */
    window.switchTab('dong_dongtian');
    const dtReset = function(){ XX._s.dt = { qing:0, zhu:0, su:0, xuan:0, huang:0 }; XX._s.dtMain = ''; };
    XX._s.rank = 15; XX._s.stone = 1e9; XX._s.bag = []; XX._s.bagSize = 20;
    XX._s.weapon = 0; XX._s.weaponLv = 0; XX._s.weaponBless = 0;
    XX._s.pets = []; XX._s.equipment = { weapon:null, armor:null, accessory:null };
    XX._s.gong1 = 0; XX._s.gong2 = 0; XX._s.gong3 = 0;
    XX._s.dao = 0; XX._s.wu = { sword:0, dan:0, array:0 }; XX._s.wuPaid = { sword:0, dan:0, array:0 };
    XX._s.affix = []; XX._s.cave = 0; XX._s.rootIdx = 1;
    /* 第 69 节把炼丹/炼器等级与匠道留在高位时，成功率已经顶到 95% 上限，洞天的 +% 会被吃掉 */
    XX._s.dan = 1; XX._s.forge = 1;
    XX._s.mastery = { alchemyLv:1, alchemyExp:0, forgeLv:1, forgeExp:0 };
    dtReset(); XX._render();
    L('dtCards', document.querySelectorAll('#xx-dongtian .dt-card').length);
    L('dtTotals0', Object.keys(XX._dtTotals()).every(k => XX._dtTotals()[k] === 0) ? 'zero' : 'bad');
    L('dtSum0', (document.querySelector('#xx-dongtian .dt-sum') || {}).textContent || '');
    L('dtBag0', XX._bagCap() === XX._s.bagSize ? 'yes' : 'no');
    L('dtOff0', Math.round(XX._offlineCap()));
    const dtCraft0 = XX._craftRate(XX._recipes.dan1);
    const dtForge0 = XX._craftRate(XX._recipes.wp1);
    const dtBtn0 = document.querySelector('#xx-dongtian [data-dt-act="open"][data-id="qing"]');
    L('dtNoMat', dtBtn0 && dtBtn0.disabled ? 'yes' : 'no');
    L('dtCostOwned', (document.querySelector('#xx-dongtian [data-card="qing"] [data-f="cost"]') || {}).textContent || '');
    const dtSt0 = XX._s.stone;
    XX._dtOpen('qing');
    L('dtNoMatCost', XX._s.stone === dtSt0 && XX._dtLv('qing') === 0 ? 'yes' : 'no');
    const dtStBak = XX._s.stone;
    XX._s.stone = 0; XX._render();
    L('dtCostPoor', (document.querySelector('#xx-dongtian [data-card="qing"] [data-f="cost"]') || {}).textContent || '');
    XX._s.stone = dtStBak; XX._render();
    ['mat_feather','mat_eye','mat_bone'].forEach(t => { for(let i=0;i<20;i++) XX._s.bag.push({ t:t, n:t }); });
    ['boss_feather','boss_pearl','boss_heart'].forEach(t => { for(let i=0;i<5;i++) XX._s.bag.push({ t:t, n:t }); });
    XX._render();
    L('dtCostOwned2', (document.querySelector('#xx-dongtian [data-card="qing"] [data-f="cost"]') || {}).textContent || '');
    const dtCost1 = XX._dtCost('qing');
    const dtLayerInc = XX._stoneRate() * (XX._need(15) / XX._rate());
    L('dtCostAnchor', Math.abs(dtCost1 - Math.floor(dtLayerInc * 0.30)) <= 1 ? 'yes' : 'no');
    const dtSt1 = XX._s.stone;
    const dtOpenOk = XX._dtOpen('qing');
    L('dtOpen', (dtOpenOk && XX._dtLv('qing') === 1) ? 'yes' : 'no');
    L('dtPaid', XX._s.stone === dtSt1 - dtCost1 ? 'yes' : 'no');
    L('dtFirstMain', XX._dtMain());
    L('dtCraftUp', (Math.round((XX._craftRate(XX._recipes.dan1) - dtCraft0) * 1000) / 10).toFixed(1));
    L('dtForgeClean', Math.round((XX._craftRate(XX._recipes.wp1) - dtForge0) * 100));
    const dtSt2 = XX._s.stone;
    XX._dtOpen('qing');                                   /* 灵脉要 rank 17 */
    L('dtRankGate', XX._dtLv('qing') === 1 && XX._s.stone === dtSt2 ? 'yes' : 'no');
    XX._s.rank = 17; XX._render();
    XX._dtOpen('qing');
    L('dtLv2', XX._dtLv('qing'));
    L('dtMainCraft', (Math.round((XX._craftRate(XX._recipes.dan1) - dtCraft0) * 1000) / 10).toFixed(1));
    L('dtMainLocked', XX._dtMainSet('zhu') === false ? 'yes' : 'no');
    XX._s.rank = 18; XX._render();
    const dtPow0 = XX._power();
    XX._dtOpen('zhu');
    const dtPow1 = XX._power();
    L('dtPowEff', XX._dtEff('zhu').pow);
    L('dtPowUp', (dtPow1 > dtPow0 && Math.abs(dtPow1 / dtPow0 - 1.04) < 0.01) ? 'yes' : 'no');
    XX._dtMainSet('zhu');
    L('dtMainSwap', XX._dtMain());
    L('dtSwapCraft', (Math.round((XX._craftRate(XX._recipes.dan1) - dtCraft0) * 1000) / 10).toFixed(1));
    L('dtSwapPow', XX._dtTotals().pow);
    /* 重绘后真点一颗按钮：结构重建不能把委托丢掉 */
    XX._render();
    const dtSuBtn = document.querySelector('#xx-dongtian [data-dt-act="open"][data-id="su"]');
    const dtStSu = XX._s.stone;
    if(dtSuBtn && !dtSuBtn.disabled) dtSuBtn.click();
    L('dtBtnClick', XX._dtLv('su'));
    L('dtBtnPaid', XX._s.stone < dtStSu ? 'yes' : 'no');
    /* 素灵：强化成功率 / 矿石折扣 */
    XX._s.weapon = 1; XX._s.weaponLv = 10; XX._s.weaponBless = 0;
    L('dtEnh', Math.round(XX._enhanceChance() * 100));
    XX._s.dt.su = 3; XX._render();
    L('dtEnh3', Math.round(XX._enhanceChance() * 100));
    const dtOreBase = XX._bal.enhanceOreBase + XX._bal.enhanceOreStep * 10;
    L('dtOre', XX._enhanceCost().ore + '/' + Math.max(1, Math.ceil(dtOreBase * 0.8)));
    /* 玄冥：离线封顶 / 背包；主洞 ×1.5 */
    XX._s.rank = 22; XX._s.dt.xuan = 3; XX._s.dtMain = 'qing'; XX._render();
    L('dtXuanRaw', XX._dtTotals().off + '/' + XX._dtTotals().bag);
    L('dtBagCap', XX._bagCap() === XX._s.bagSize + 20 ? 'yes' : 'no');
    L('dtOffCap', Math.round(XX._offlineCap() - 8 * 3600 * Math.pow(1.12, 8)));
    XX._dtMainSet('xuan');
    L('dtXuanMain', XX._dtTotals().off + '/' + XX._dtTotals().bag);
    L('dtBagCapMain', XX._bagCap() === XX._s.bagSize + 30 ? 'yes' : 'no');
    XX._s.bag = new Array(50).fill(0).map(() => ({ t:'x', n:'x' }));
    L('dtBagFull', XX._bagCap() === XX._s.bagSize + 30 ? 'yes' : 'no');
    /* 玄冥从主洞降回未开：上限 50 → 20，但已有 50 件不能被删掉 */
    XX._s.dt.xuan = 0; XX._dtMainSet('qing'); XX._render();
    L('dtBagKeep', XX._s.bag.length + '/' + XX._bagCap());           /* 切主洞不删已有物品 */
    /* 黄庭：修炼/灵石是平的百分比，rank 15 与 25 比值一致 */
    const dtRatioAt = function(r){
      XX._s.rank = r; dtReset();
      const e0 = XX._rate(), s0 = XX._stoneRate();
      XX._s.dt.huang = 3; XX._s.dtMain = 'huang';
      return [XX._rate() / e0, XX._stoneRate() / s0];
    };
    const dtR15 = dtRatioAt(15), dtR25 = dtRatioAt(25);
    L('dtFlat', dtR15.map(x => x.toFixed(3)).join('/') + ';' + dtR25.map(x => x.toFixed(3)).join('/'));
    XX._s.dt = { qing:3, zhu:3, su:3, xuan:3, huang:3 }; XX._s.dtMain = 'qing'; XX._s.rank = 23;
    XX._s.bag = []; XX._render();
    const dtQingCard = document.querySelector('#xx-dongtian [data-card="qing"]');
    L('dtPanelMain', dtQingCard && dtQingCard.classList.contains('main') ? 'yes' : 'no');
    L('dtPanelEff', dtQingCard ? dtQingCard.querySelector('.dt-eff').textContent : '');
    L('dtPanelSum', (document.querySelector('#xx-dongtian .dt-sum') || {}).textContent || '');
    /* 青华主洞 ×1.5：失败返还 10% → 15%，面板行写 45%（30+15）—— 面板行在炼丹房那一页 */
    window.switchTab('dong_alchemy');
    L('dtRefundRow', (document.querySelector('#xx-alchemy .craft[data-recipe="dan1"] small') || {}).textContent || '');
    window.switchTab('dong_dongtian');
    /* 道碑：两块，MILE_TOTAL 跟着涨 */
    XX._s.miles = {}; XX._s.milesNew = []; XX._s.dt = { qing:1, zhu:0, su:0, xuan:0, huang:0 }; XX._s.dtMain = 'qing';
    XX._checkMiles(true);
    L('dtMile1', XX._s.miles.m_dt1 ? 'yes' : 'no');
    XX._s.dt = { qing:3, zhu:3, su:3, xuan:3, huang:3 };
    XX._checkMiles(true);
    L('dtMile2', XX._s.miles.m_dt2 ? 'yes' : 'no');
    L('dtMileTotal', XX._milesTotal());
    dtReset(); XX._s.rank = 12; XX._s.bag = []; XX._s.weapon = 0; XX._s.weaponLv = 0; XX._render();

    /* 幂等 + 脏 id */
    XX._s.story.claimed['zzz'] = 12345;
    Story.init(stD);
    L('storyKeep', Story._state(0));                                         // 已记的不被清
    L('storyDirty', (XX._s.story.claimed || {}).zzz || '-');                 // 脏 id 被丢

    /* ---- 存档备份（第 78 节）：设置入口 → 当前档摘要 → 导出 → 粘贴校验 → 覆盖写入 → 冻结写入 ---- */
    /* 放在最后：导入会把 save() 冻住，前面还有用例要落盘 */
    document.getElementById('sc-settings').click();
    L('svEntryShown', document.getElementById('settings-modal').classList.contains('hidden') ? 'no' : 'yes');
    document.getElementById('m-backup').click();
    L('svOpen', document.getElementById('save-modal').classList.contains('hidden') ? 'no' : 'yes');
    L('svSetClosed', document.getElementById('settings-modal').classList.contains('hidden') ? 'yes' : 'no');
    const svCurTxt = (document.getElementById('sv-cur') || {}).textContent || '';
    L('svCurName', svCurTxt.indexOf(XX._s.name) >= 0 ? 'yes' : 'no');
    L('svCurMeta', /存档 [0-9.]+ ?(B|KB|MB)/.test(svCurTxt) ? 'yes' : 'no');
    L('svApplyLocked', document.getElementById('sv-apply').disabled ? 'yes' : 'no');
    const svText = XX._saveText();
    L('svTextName', (function(){ try{ return JSON.parse(svText).name === XX._s.name ? 'yes' : 'no'; }catch(e){ return 'no'; } })());
    L('svParseOk', XX._parseSaveText(svText).ok ? 'yes' : 'no');
    L('svParseJunk', XX._parseSaveText('not json at all').ok ? 'no' : 'yes');
    L('svParseEmpty', XX._parseSaveText('   ').ok ? 'no' : 'yes');
    L('svParseNotGame', XX._parseSaveText('{"nope":1}').ok ? 'no' : 'yes');
    L('svParseRankBad', XX._parseSaveText('{"rank":"x","exp":1,"bag":[],"stats":{},"cave":1}').ok ? 'no' : 'yes');
    const svIn = document.getElementById('sv-in');
    svIn.value = svText; document.getElementById('sv-check').click();
    L('svPrevOk', document.getElementById('sv-prev').classList.contains('ok') ? 'yes' : 'no');
    L('svPrevName', (document.getElementById('sv-prev').textContent || '').indexOf(XX._s.name) >= 0 ? 'yes' : 'no');
    L('svApplyOn', document.getElementById('sv-apply').disabled ? 'no' : 'yes');
    svIn.value = '{"rank":1}'; document.getElementById('sv-check').click();
    L('svPrevBad', document.getElementById('sv-prev').classList.contains('bad') ? 'yes' : 'no');
    L('svErrTxt', (document.getElementById('sv-prev').textContent || '').indexOf('✗') === 0 ? 'yes' : 'no');
    L('svApplyOff', document.getElementById('sv-apply').disabled ? 'yes' : 'no');
    svIn.value = ''; svIn.dispatchEvent(new Event('input', { bubbles:true }));
    L('svReset', document.getElementById('sv-prev').classList.contains('show') ? 'no' : 'yes');
    document.getElementById('sv-close').click();
    L('svClosed', document.getElementById('save-modal').classList.contains('hidden') ? 'yes' : 'no');
    /* 写入：改个道号/灵石，last 故意写成三天前 → 落盘后 last 必须被改成此刻（挡重复导入刷离线） */
    XX._openSave();
    const svMod = JSON.parse(XX._saveText());
    svMod.name = '归档客'; svMod.stone = 321; svMod.last = Date.now() - 3 * 86400000;
    document.getElementById('sv-in').value = JSON.stringify(svMod);
    document.getElementById('sv-check').click();
    document.getElementById('sv-apply').click();
    L('svDoneShown', document.getElementById('sv-done').classList.contains('show') ? 'yes' : 'no');
    L('svDoneMeta', (document.getElementById('sv-done-meta').textContent || '').indexOf('归档客') >= 0 ? 'yes' : 'no');
    L('svFrozen', XX._importFrozen() ? 'yes' : 'no');
    const svSaved = (function(){ try{ return JSON.parse(localStorage.getItem('xiuxian_save')); }catch(e){ return {}; } })();
    L('svSavedName', svSaved.name);
    L('svSavedStone', svSaved.stone);
    L('svSavedLast', Math.abs(svSaved.last - Date.now()) < 5000 ? 'yes' : 'no');
    L('svMemOld', XX._s.name);                                          // 内存里还是旧档，等重载
    L('svCurFrozen', (document.getElementById('sv-cur').textContent || '').indexOf('新存档已写入') >= 0 ? 'yes' : 'no');
    L('svExportLocked', document.getElementById('sv-download').disabled &&
                        document.getElementById('sv-copy').disabled ? 'yes' : 'no');
    L('svApplyOff2', document.getElementById('sv-apply').disabled ? 'yes' : 'no');
    XX.save();                                                          // 冻结后 save() 不许盖新档
    const svSaved2 = (function(){ try{ return JSON.parse(localStorage.getItem('xiuxian_save')); }catch(e){ return {}; } })();
    L('svFrozenGuard', svSaved2.name === '归档客' && svSaved2.stone === 321 ? 'yes' : 'no');
    L('svApplyAgain', XX._applySaveText(JSON.stringify(svMod)) === false ? 'yes' : 'no');
    L('svPrevLock', (document.getElementById('sv-prev').textContent || '').indexOf('重新载入') >= 0 ? 'yes' : 'no');
    document.getElementById('sv-close').click();
    L('svClosed2', document.getElementById('save-modal').classList.contains('hidden') ? 'yes' : 'no');
    /* ---- 第 96 轮 · 寿元倒计时 / 坐化 / 转世 骨架 ----
       放在最末段：这几步会改 S.life / S.zuo / S.rank，结尾还用 _load() 整档换血测迁移，
       前面所有用例跑完了才动它。chip 四态 + 寿元页元素 + tick 记账 + 坐化停表 + 转世结算。 */
    (function(){
      const S = XX._s;
      const chipEl = document.getElementById('sc-life-chip');
      const txt = () => (document.getElementById('sc-life') || {}).textContent || '';
      const cls = () => chipEl.className.split(' ').filter(c => c === 'low' || c === 'zuo' || c === 'off').join('') || '-';
      S.zuo = 0; S.rank = 12; S.life = { age: 40, on: true }; XX._render();
      L('lfChipNorm', txt() + '/' + cls());
      S.life.age = 570; XX._render();
      L('lfChipLow', txt() + '/' + cls());
      S.zuo = Date.now(); XX._render();
      L('lfChipZuo', txt() + '/' + cls());
      S.zuo = 0; S.life.on = false; XX._render();
      L('lfChipOff', txt() + '/' + cls());
      S.life.on = true; S.rank = 25; XX._render();
      L('lfChipInf', txt() + '/' + cls());
      S.rank = 12; S.life = { age: 570, on: true }; S.zuo = 0; XX._render();
      window.ROUTER.open('life', 'xx-life-now');
      L('lfPageIds', ['xx-life-wick','xx-life-age','xx-life-max','xx-life-left','xx-life-barfill',
        'xx-life-stages','xx-life-enable','xx-life-reborn','xx-life-hint'].map(id => document.getElementById(id) ? 1 : 0).join(''));
      L('lfStages', document.querySelectorAll('#xx-life-stages .ls').length);
      L('lfNowCell', (document.querySelector('#xx-life-stages .ls.now b') || {}).textContent || '');
      L('lfBarLow', (document.getElementById('xx-life-barfill').parentNode.className || '').indexOf('low') >= 0 ? 'yes' : 'no');
      L('lfWick', Math.abs(parseFloat(getComputedStyle(document.getElementById('xx-life-wick')).getPropertyValue('--wick')) - 0.05) < 1e-6 ? 'yes' : 'no');
      L('lfLeftTxt', (document.getElementById('xx-life-left').textContent || '').indexOf('还剩 30 年') === 0 ? 'yes' : 'no');
      L('lfBtnHide', document.getElementById('xx-life-enable').hidden + '/' + document.getElementById('xx-life-reborn').hidden);
      window.ROUTER.open('life', 'xx-life-legacy');
      L('lfLegRows', document.querySelectorAll('#xx-life-leglist .leg-row').length);
      L('lfLegTxt', (function(){ const t = document.getElementById('xx-life-leglist').textContent || '';
        return t.indexOf('转世') >= 0 && t.indexOf('道统加成') >= 0 && t.indexOf('前世遗物') >= 0 ? 'yes' : 'no'; })());
      /* tick 记账（P1 已批：lifeYearSec 300→4320）→ 4320 秒 = 1 年；坐化后停表 */
      S.life = { age: 0, on: true }; S.zuo = 0; XX._tick(4320);
      L('lfTickAge', Math.abs(XX._life.age() - 1) < 0.05 ? 'yes' : 'no');
      S.zuo = Date.now(); const az = XX._life.age(); XX._tick(300);
      L('lfTickZuo', XX._life.age() === az ? 'yes' : 'no');
      /* 寿尽坐化：余命不足一个 tick → 当场坐化
         第 97 轮：死前背包里放三件法宝，验结算卡（享年/境界/突破次数）+ 三选一 */
      S.bag = [{ t: 'eq_qingfeng', n: '青锋剑' }, { t: 'eq_huxin', n: '照胆镜' }, { t: 'eq_yupei', n: '养元玉佩' }];
      S.equipment = { weapon: null, armor: null, accessory: null };
      S.legacy = { gens: 0, relic: null, hist: [], pick: null };
      /* 心魔照镜（第 99 轮）：初世镜中无人——按钮点不动，打也打不起来 */
      S.mirror = { gen: 0, rank: 0, age: 0, brk: 0, pow: 0, wins: 0, done: 0 };
      window.ROUTER.open('life', 'xx-life-mirror');
      L('mfNone', [XX._mirror.state(), XX._mirror.ready() ? 1 : 0, XX._mirror.fight() ? 1 : 0,
        document.getElementById('xx-mf-fight').disabled ? 1 : 0,
        document.getElementById('xx-mf-name').textContent,
        document.getElementById('xx-life-mirror-tag').textContent,
        document.getElementById('xx-mf-vs').dataset.state].join('/'));
      L('mfNoneIds', ['xx-mf-img','xx-mf-you','xx-mf-foe','xx-mf-youbar','xx-mf-foebar','xx-mf-tip','xx-mf-dao']
        .map(id => document.getElementById(id) ? 1 : 0).join(''));
      L('mfNoneTip', (document.getElementById('xx-mf-tip').textContent || '').indexOf('先走完这一世') > 0 ? 'yes' : 'no');
      /* hub 现在三格：本世寿元 / 心魔照镜 / 道统世系 */
      window.ROUTER.open('life');
      L('mfHub', document.querySelectorAll('#page-life .hub-nav .hub-cell').length + '/' +
        (document.getElementById('xx-hub-life-mirror') || {}).textContent);
      S.life = { age: 0, on: true, brk: 7 };
      S.zuo = 0;
      window.ROUTER.open('life', 'xx-life-now');
      S.life.age = XX._life.max() - 0.005; XX._tick(60);
      L('lfDie', XX._zuo() ? 'yes' : 'no');
      L('lfPicks', XX._relicPicks().join(','));
      L('lfPickDefault', XX._legacy.pick() + '/' +
        ((document.querySelector('#xx-life-picks .pick.on') || { dataset: {} }).dataset.relic || ''));
      L('lfPickBtns', document.querySelectorAll('#xx-life-picks .pick').length + '/' +
        (document.getElementById('xx-sum-age').textContent) + '/' +
        (document.getElementById('xx-sum-rank').textContent) + '/' +
        (document.getElementById('xx-sum-brk').textContent) + '/' +
        (document.getElementById('xx-life-sum').hidden ? 'hid' : 'show'));
      /* 改选第二件（照胆镜）→ 转世必须带它，而不是默认最强的那件 */
      document.querySelectorAll('#xx-life-picks .pick')[1].click();
      L('lfPickSwitch', XX._legacy.pick() + '/' +
        ((document.querySelector('#xx-life-picks .pick.on') || { dataset: {} }).dataset.relic || ''));
      const mfPow0 = XX._power();
      XX._reborn();
      L('lfReborn', [XX._legacy.gens(), XX._legacy.mult(), XX._life.age(), XX._zuo() ? 1 : 0, S.rank, XX._legacy.relic()].join('/'));
      /* 心魔定形：转世那一刻的战力被记下来，新一世的战力远不够 → 只能"还差" */
      L('mfBorn', [XX._mirror.data().gen, XX._mirror.data().rank, XX._mirror.data().pow === mfPow0 ? 1 : 0,
        XX._mirror.data().age, XX._mirror.data().brk, XX._mirror.power() === mfPow0 ? 1 : 0,
        XX._mirror.state(), XX._mirror.wins()].join('/'));
      window.ROUTER.open('life', 'xx-life-mirror');
      L('mfShortPage', [XX._mirror.state(), document.getElementById('xx-mf-fight').disabled ? 1 : 0,
        (document.getElementById('xx-mf-fight').textContent || '').indexOf('还差') === 0 ? 'yes' : 'no',
        document.getElementById('xx-mf-vs').dataset.state,
        document.getElementById('xx-mf-tip').textContent.indexOf('不削弱') > 0 ? 'yes' : 'no'].join('/'));
      /* 第 104 轮守心三息：面板只在「心魔在、未破镜」时出现；默守得心念、断喝得修为 */
      L('mcUi', [document.getElementById('xx-mf-calm').dataset.state,
        document.getElementById('xx-mf-calm-tag').textContent,
        document.querySelectorAll('#xx-mf-calm [data-calm]').length,
        (document.getElementById('xx-mf-calm-ask').textContent || '').length > 10 ? 'ask' : 'none'].join('~'));
      L('mcHold', (function(){
        const e0 = S.exp; XX._mirror.calm.pick('hold');
        return [XX._mirror.calm.count(), XX._mirror.calm.step(), S.exp === e0 ? 'noexp' : 'exp',
          document.getElementById('xx-mf-calm-tag').textContent].join('~');
      })());
      L('mcBreak', (function(){
        const e0 = S.exp, g = XX._mirror.calm.gain(); XX._mirror.calm.pick('break');
        return [XX._mirror.calm.count(), XX._mirror.calm.step(), Math.round(S.exp - e0), g,
          document.getElementById('xx-mf-calm-tag').textContent].join('~');
      })());
      L('mcOver', (function(){
        XX._mirror.calm.pick('hold');
        const st = document.getElementById('xx-mf-calm').dataset.state;
        const again = XX._mirror.calm.pick('hold') ? 1 : 0;
        return [XX._mirror.calm.done() ? 1 : 0, XX._mirror.calm.count(), XX._mirror.calm.step(),
          st, again, document.getElementById('xx-mf-calm-tag').textContent].join('~');
      })());
      /* 守心 2/3 → 门槛 ×0.97：把心魔战力抬到「原始线差一点、减完够」的位置，只靠守心就能照 */
      S.rank = 12;
      const mcMe = XX._power();
      S.mirror.pow = Math.round(mcMe * 1.01); XX._render();
      L('mcThresh', [S.mirror.pow > mcMe ? 'above' : 'not', XX._mirror.need() < mcMe ? 'under' : 'over',
        XX._mirror.state(), document.getElementById('xx-mf-fight').disabled ? 1 : 0,
        (document.getElementById('xx-mf-need').textContent || '').slice(0, 4)].join('~'));

      /* 把心魔战力压到当前战力（境界放回 12）→ 恰好可照；一拳赢了道心 +1 */
      S.rank = 12; S.mirror.pow = XX._power(); XX._render();
      L('mfReadyPage', [XX._mirror.state(), document.getElementById('xx-mf-fight').disabled ? 0 : 1,
        document.getElementById('xx-mf-you').textContent === document.getElementById('xx-mf-foe').textContent
          ? 'same' : 'differ',
        document.getElementById('xx-mf-img').getAttribute('src') ? 'img' : 'none'].join('/'));
      const rtMf0 = XX._rate();
      L('mfWin', [XX._mirror.fight() ? 1 : 0, XX._mirror.wins(), XX._mirror.state(),
        XX._mirror.fight() ? 1 : 0, XX._mirror.wins()].join('/'));
      L('mfRate', (XX._rate() / rtMf0).toFixed(2));
      L('mfDaoRow', XX._statBreakdown().exp.mults.filter(m => m.label.indexOf('道心') === 0)
        .map(m => m.label + '=' + m.v.toFixed(2)).join(','));
      L('mfDonePage', [document.getElementById('xx-mf-fight').disabled ? 1 : 0,
        document.getElementById('xx-mf-fight').textContent,
        document.getElementById('xx-life-mirror-tag').textContent].join('/'));
      L('lfRelicPick', [XX._legacy.relic(), S.bag.filter(b => b.t === 'eq_huxin').length,
        S.bag.filter(b => b.t === 'eq_qingfeng').length, XX._legacy.pick()].join('/'));
      L('lfHist', (function(){ const h = XX._legacy.hist(); if(!h.length) return 'none';
        return [h.length, h[0].gen, h[0].rank, h[0].age, h[0].relic].join('/'); })());
      window.ROUTER.open('life', 'xx-life-legacy');
      L('lfHistRows', document.querySelectorAll('#xx-life-hist .leg-row').length);
      /* 世系只留最近 12 世：再死转 13 次，列表必须封顶 */
      for(let i = 0; i < 13; i++){ S.zuo = Date.now(); XX._reborn(); }
      L('lfHistCap', XX._legacy.hist().length);
      /* 再转 13 世，心魔跟着换（gen 跟着道统走），道心胜场不归零 */
      L('mfCap', [XX._mirror.data().gen, XX._mirror.wins(), XX._mirror.state()].join('/'));
      L('lfRelicOnce', String(S.bag.filter(b => b.t === 'eq_huxin').length));
      L('lfDaoRow', XX._statBreakdown().exp.mults.some(m => m.label.indexOf('道统') === 0) ? 'yes' : 'no');
      /* 开启寿元不可逆 */
      S.life.on = false; XX._enableLife(); const on1 = XX._life.on();
      XX._enableLife();
      L('lfEnable', on1 && XX._life.on() ? 'yes' : 'no');
      /* 老档迁移：无 life 字段 → on=false；新档照读；飞升档的坐化状态作废 */
      const base = { name: '旧人', rank: 10, exp: 1, stone: 5, last: Date.now(), bag: [] };
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      L('lfMigOld', [XX._life.on() ? 1 : 0, XX._zuo() ? 1 : 0, XX._legacy.gens()].join(''));
      L('mfMigOld', [XX._mirror.data().gen, XX._mirror.data().pow, XX._mirror.state()].join('/'));
      base.life = { age: 5, on: true, brk: 3 };
      base.legacy = { gens: 2, relic: 'eq_qingfeng', pick: 'eq_huxin',
        hist: [{ gen: 1, rank: 10, age: 200, relic: 'eq_huxin' }, { gen: 2, rank: 9, age: 120, relic: 'nope' }] };
      base.zuo = 0;
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      L('lfMigNew', [XX._life.on() ? 1 : 0, XX._life.age(), XX._legacy.gens(), XX._legacy.relic()].join('/'));
      /* 第 97 轮字段：brk 照读、世系过滤非法遗物、pick 照读 */
      L('lfMig97', [S.life.brk, XX._legacy.hist().length, String(XX._legacy.hist()[1].relic), XX._legacy.pick()].join('/'));
      /* 第 99 轮字段：脏 mirror 读档即夹（世数夹到道统、境界夹到 TOP、负数与非数字一律归零） */
      base.mirror = { gen: 99, rank: 99, age: -5, brk: -2, pow: 'abc', wins: -3, done: 0 };
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      const mm = XX._mirror.data();
      L('mfMigDirty', [mm.gen, mm.pow, mm.wins, mm.done, mm.age, mm.brk, mm.rank === 99 ? 'raw' : 'clamp'].join('/'));
      /* 第 104 轮字段：守心（心念夹 0~3、步数夹 0~3） */
      base.mirror = { gen: 1, rank: 5, pow: 100, calm: 9, calmStep: -4 };
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      L('mfMigCalm', [XX._mirror.data().calm, XX._mirror.data().calmStep].join('/'));
      base.rank = 25; base.zuo = 12345; delete base.life;
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      L('lfMigAsc', [XX._life.on() ? 1 : 0, XX._zuo() ? 1 : 0].join(''));
      /* 第 103 轮字段：议事卷宗脏值读档即夹（n 0~9999、day/last 只收字符串） */
      base.council = { day: 123, n: -5, last: 7 };
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      L('coMigDirty', [typeof XX._council().day, XX._council().n, typeof XX._council().last].join('/'));
      base.council = { day: '2026-10-30', n: 123456, last: 'x'.repeat(10) };
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      L('coMigBigN', [XX._council().n, XX._council().last.length].join('/'));
      /* 第 109 轮 W1「塔底」：顶层标量 worldFoot 的迁移四件套
         （缺字段 → 空串；合法五值照读；数字 / 未知串 / 对象 → 空串；重复 load 幂等），
         再顺手证明「档里多出一个老代码不认识的键」不会把 load 拖垮。 */
      const wfVal = () => (XX._s.worldFoot === '' ? 'e' : String(XX._s.worldFoot));
      delete base.worldFoot;
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      const wfSeen = wfVal();
      XX._load();
      L('wfMigOld', [wfSeen, wfVal()].join('/'));
      base.worldFoot = 'seal';
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      L('wfMigLegal', wfVal());
      base.worldFoot = 123;
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      L('wfMigNum', wfVal());
      base.worldFoot = 'nope';
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      L('wfMigStr', wfVal());
      base.worldFoot = { k: 1 };
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      L('wfMigObj', wfVal());
      base.worldFoot = 'dug'; base.digAgain = true;
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      L('wfMigDigTwice', [wfVal(), XX._s.worldFoot === 'dug' ? 'same' : 'drift'].join('/'));
      base.brandNewKey = { deep: 1 }; base.worldFoot = 'open';
      localStorage.setItem('xiuxian_save', JSON.stringify(base)); XX._load();
      L('wfUnknownKey', [wfVal(), typeof XX._s.rank === 'number' ? 'n' : 'x'].join('/'));
      /* 未授权字段闸：W1 只多一个顶层标量，npcs 仍只有 stele，stele 仍是 2f 冻结的九个键。
         （base 是从没写过 npcs 的老档，这里读到的键集就是 load 重建出来的结构。） */
      const footMiles = XX._miles().filter(m => m.id === 'm_foot');
      /* 探针分隔符：diag 通道用 ' | ' 拼串，值里绝不能再出现竖线（会被拆成两段）。 */
      L('wfMileIds', [(footMiles.map(m => m.id).join(',') || 'none'), footMiles.length].join(':'));
      L('wfNpcsKeys', Object.keys(XX._s.npcs).sort().join(','));
      L('wfSteleKeys', Object.keys(XX._s.npcs.stele).sort().join(','));

      /* ===== 第 110 轮 · W2「塔底余波」三块后续碑 =====
         判据在 MILES 表里钉死写 false：把条件灌满、连扫三轮也点不亮任何一块，
         只有玩家在塔页真点那一下才写账。这一段先证这条硬边界，再走真 DOM 证
         门槛、三选一互斥、一次结算、零新存档字段，最后把动过的字段原样放回。 */
      const w2Base = JSON.parse(JSON.stringify(base));
      const w2q = () => { const a = document.querySelectorAll('#xx-tower [data-w2]');
        return a.length ? a[0].dataset.w2 + '@' + a.length : 'none'; };
      const w2new = () => XX._miles().filter(m => m.id.indexOf('m_foot_') === 0);
      const w2txt = () => { const e = document.getElementById('world-after'); return e ? e.textContent : '无'; };
      L('w2Ids', w2new().map(m => m.id + '@' + m.g).join(','));
      L('w2Total', String(XX._milesTotal()));
      /* 灌满条件：三条各当一次终态、塔层顶格，连扫三轮也一块点不亮（自动结算的死闸） */
      S.rank = 6; S.towerMax = 99; S.miles = { m_foot: Date.now() }; S.milesNew = [];
      const w2Auto = [];
      ['open', 'self', 'seal'].forEach(k => {
        S.worldFoot = k; XX._checkMiles(true);
        w2Auto.push(k + ':' + w2new().filter(m => m.at).length);
      });
      L('w2AutoLit', w2Auto.join(','));
      /* 门槛：第 4 层三条都不给（seal 5 / open 6 / self 7 是按 needOf 曲线核出来的下界）。
         塔页只有在「没在爬塔」时才写塔底那一段，先把可能残留的塔行之关掉。 */
      S.trun = null;
      window.ROUTER.open('tower');
      const w2Gate = [];
      ['open', 'self', 'seal'].forEach(k => {
        S.worldFoot = k; S.towerMax = 4; XX._render();
        w2Gate.push(k + ':' + w2q() + '/' + (w2txt() === '无' ? '空' : '有'));
      });
      L('w2Gate4', w2Gate.join(','));
      /* 到门槛：只冒本线那一条、只有一枚按钮；三条痕迹各是各的字 */
      const w2At = [];
      [['open', 6], ['self', 7], ['seal', 5]].forEach(p => {
        S.worldFoot = p[0]; S.towerMax = p[1]; XX._render();
        w2At.push(p[0] + ':' + w2q() + ':' + w2txt().slice(0, 6));
      });
      L('w2AtNeed', w2At.join(','));
      /* 差一层也不给：open 要 6，停在 5 就什么都没有 */
      S.worldFoot = 'open'; S.towerMax = 5; XX._render();
      L('w2OneShort', w2q() + '/' + (w2txt() === '无' ? '空' : '有'));
      /* 真点封存线：立自己的碑 + 一笔小额悟道；灵石、统计、道义全不动，入口当场消失 */
      const w2Keys0 = Object.keys(S).sort().join(',');
      S.worldFoot = 'seal'; S.towerMax = 5; S.miles = { m_foot: Date.now() }; S.milesNew = [];
      S.wisdom = 0; S.insight = 0; S.stone = 1000; S.dao = 0; S.log = []; S.stats.stoneEarned = 1000;
      XX._render();
      const w2b = document.querySelector('#xx-tower [data-w2]');
      const w2d0 = XX._milesDone();
      w2b.click();
      L('w2SealFx', [S.miles.m_foot_seal ? 1 : 0, S.wisdom | 0, S.insight | 0, S.dao | 0,
        (S.stone | 0) - 1000, (S.stats.stoneEarned | 0) - 1000, XX._milesDone() - w2d0,
        document.querySelectorAll('#xx-tower [data-w2]').length, w2txt().slice(0, 4), S.rank].join('/'));
      /* 摘下来的节点再点一次（重复进入 / 连点）：账本挡住，零重发 */
      w2b.click();
      L('w2SealAgain', [S.wisdom | 0, XX._milesDone() - w2d0, w2new().filter(m => m.at).length].join('/'));
      /* 共撬线换的是悟道、独撬线换的是顿悟：渠道不同，两块碑互不顶替 */
      S.worldFoot = 'open'; S.towerMax = 6; XX._render();
      const w2w1 = S.wisdom | 0;
      document.querySelector('#xx-tower [data-w2]').click();
      L('w2OpenFx', [S.miles.m_foot_open ? 1 : 0, S.miles.m_foot_seal ? 1 : 0,
        (S.wisdom | 0) - w2w1, S.insight | 0, w2new().filter(m => m.at).length, S.rank].join('/'));
      S.worldFoot = 'self'; S.towerMax = 7; XX._render();
      const w2i1 = S.insight | 0, w2w2 = S.wisdom | 0;
      document.querySelector('#xx-tower [data-w2]').click();
      L('w2SelfFx', [S.miles.m_foot_self ? 1 : 0, (S.insight | 0) - w2i1,
        (S.wisdom | 0) - w2w2, w2new().filter(m => m.at).length].join('/'));
      /* 零新存档字段：三块碑全走既有 miles 容器，S 顶层键集一个字没多 */
      L('w2NoNewKey', Object.keys(S).sort().join(',') === w2Keys0 ? 'same' : 'more');
      /* 落盘回读：新碑 id 不需要迁移代码；老档缺这三个键 = 一块没立。
         load() 对 miles 是**合并**（真·重开网页才从空表起），所以这里先归零再读，模拟冷启。 */
      const w2At0 = w2new().map(m => m.at ? 1 : 0).join('');
      const w2Sav = JSON.stringify(S);
      S.miles = {};
      localStorage.setItem('xiuxian_save', w2Sav); XX._load();
      L('w2Back', [w2At0, w2new().map(m => m.at ? 1 : 0).join(''), S.worldFoot].join('/'));
      const w2Old = JSON.parse(w2Sav);
      delete w2Old.miles.m_foot_open; delete w2Old.miles.m_foot_self; delete w2Old.miles.m_foot_seal;
      S.miles = {};
      localStorage.setItem('xiuxian_save', JSON.stringify(w2Old)); XX._load();
      L('w2OldSave', [w2new().map(m => m.at ? 1 : 0).join(''), S.worldFoot, XX._milesDone() >= 0 ? 'n' : 'x'].join('/'));
      /* 收尾：把 base 档原样写回并 reload，后面所有用例仍跑在 W1 结束时的同一份账上 */
      S.miles = {}; S.milesNew = [];
      localStorage.setItem('xiuxian_save', JSON.stringify(w2Base)); XX._load();
      L('w2Restored', [S.worldFoot, String(S.rank), XX._miles().filter(m => m.at).length].join('/'));
    })();

    /* ===== 第 105 轮 · 入门八事纸签 =====
       八件事的达成条件全读现成字段，所以这一段不造数据以外的任何东西：
       清零 → 纸签露头讲第 1 事 → 真点三次打坐 → 自己走到第 2 事并发奖 → 一路了完自动收起。 */
    (function(){
      const T = XX._trail, S = XX._s, box = document.getElementById('sc-trail');
      const txt = id => (document.getElementById(id) || {}).textContent || '';
      /* 迁移口径：旧档没有 trail 字段 = 八事已了；脏值一律夹进 0~8 */
      L('trMig', [T.migrate(undefined), T.migrate({ i: 3 }), T.migrate({ i: 99 }),
        T.migrate({ i: 'x' }), T.migrate({ i: -2 })].join(','));
      /* 新号：所有达成条件归零 */
      S.trail = { i: 0 };
      S.stats.sit = 0; S.stats.herb = 0; S.stats.craftPill = 0; S.stats.hunt = 0;
      S.rank = 0; S.exp = 0; S.cave = 0; S.towerMax = 0;
      S.secret = { prog: [0, 0, 0, 0], day: '', swept: 0 };
      S.acts = { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 };
      S.herb = 0; S.ore = 0; S.log = []; S.bag = []; S.bagSize = 20;
      XX._resetCd(); XX._render();
      L('trShow', [box.hidden, T.idx(), T.max, box.dataset.k].join('/'));               // false/0/8/sit
      L('trText', [txt('st-seal'), txt('st-name'), txt('st-prog'),
        document.querySelectorAll('#st-pips i').length,
        document.querySelectorAll('#st-pips i.now').length,
        document.querySelectorAll('#st-pips i.done').length].join('/'));               // 一/打坐三炷香/0/3/8/1/0
      /* W3·S1：只动文案，表的顺序 / 条数 / 键名 / 奖励系数一个都不许变——先原样取回来 */
      L('s1TrailKeys', T.list.map(s => s.key).join(','));
      L('s1TrailHints', T.list.map(s => s.hint || '').join('#'));
      /* W3·S1：纸签那行是 nowrap + ellipsis（style.css:1131），超长会被省略号吃掉——
         实拍抓到过一条 45 字的文案截断。逐条量真实几何，量不过就红。
         ⚠️ 两道假绿闸门：① 纸签在引导台上 / 两轨都了时会 hidden；② 场景被面板压着时整块
         display:none —— 两种情况下 clientWidth=0，"scrollWidth > clientWidth" 永远不成立。
         所以先退到场景、再显式解除 hidden，最后用 cap>150 证明这次真的量到了。 */
      for(var z0 = 0; z0 < 6 && window.ROUTER.depth() > 0; z0++) window.ROUTER.back();
      const hintBox = document.getElementById('st-hint');
      const tBox = document.getElementById('sc-trail');
      const tipEl = document.getElementById('tut-tip');
      const wasHidden = tBox.hidden, tipWas = tipEl ? tipEl.classList.contains('show') : false;
      if(tipEl) tipEl.classList.remove('show');
      tBox.hidden = false;
      const cap = hintBox.clientWidth;
      const clipped = [];
      [].concat(T.list, XX._trail2.list, XX._trail3.list).forEach(function(st){
        hintBox.textContent = st.hint;
        if(hintBox.scrollWidth > cap + 1) clipped.push(st.key + '(' + st.hint.length + '字/' + hintBox.scrollWidth + 'px)');
      });
      L('s1HintBox', cap + 'px');
      L('s1HintFit', (cap > 150 && clipped.length === 0) ? 'ok' : 'bad:cap=' + cap + ' ' + clipped.join(','));
      tBox.hidden = wasHidden;
      if(tipEl && tipWas) tipEl.classList.add('show');
      T.render();
      window.ROUTER.back && window.ROUTER.back();
      /* 点纸签：第 1 事就在本页 → 圈住打坐钮，不跳页 */
      box.click();
      L('trRing', (document.querySelector('#sc-acts .cave-act[data-k="sit"]').classList.contains('trail-ring') ? 'ring' : 'none')
        + '/' + window.ROUTER.current());
      /* 条件没到：心跳一帧不许动 */
      L('trIdle', T.tick());
      /* 真点三次打坐 → 当场推进第 1 事，奖 = 修为 4 / 灵石 5（这一件不发灵草） */
      for(let i = 0; i < 3; i++){ XX._resetCd(); XX._act('sit'); }
      L('trSit', [T.idx(), txt('st-name'), txt('st-prog'), S.herb].join('/'));          // 1/采两把灵草/0/2/0
      L('trSitLog', (S.log[0] || {}).t || '');
      /* 同一件事不重复发奖 */
      const stD = S.stone, hbD = S.herb;
      L('trNoDup', T.tick() + '/' + (S.stone === stD && S.herb === hbD ? 'same' : 'changed'));
      /* 采两把灵草：两下采药 → 第 2 事，奖里带灵草 +6 */
      for(let i = 0; i < 2; i++){ XX._resetCd(); XX._act('herb'); }
      L('trHerb', [T.idx(), txt('st-name'), txt('st-prog'), S.herb].join('/'));         // 2/破境至炼气三层/…%/12
      L('trHerbLog', ((S.log[0] || {}).t || '').indexOf('灵草 +6') >= 0 ? 'ok' : ((S.log[0] || {}).t || ''));
      /* 条件全补上 → 一帧把剩下六件一路了完：每件一笔「入门第X事」，末件再送一枚破境丹 */
      S.rank = 2; S.cave = 1; S.towerMax = 1; S.stats.craftPill = 1; S.stats.hunt = 1;
      S.secret = { prog: [1, 0, 0, 0], day: '', swept: 0 };
      const moved = T.tick();
      /* 第 106 轮起八事收口不再「纸签收起」，而是同一条纸签换道途第一程。
         kicker 报的是载入这一档时的第一件没做成的（本段前面动过 rank/塔/秘境，
         具体第几程随档而变），这里只钉「换轨了」这件事。 */
      L('trChain', [moved, T.idx(), box.hidden, box.dataset.mode,
        txt('st-kicker').indexOf('道途 · ') === 0 ? 'ok' : txt('st-kicker')].join('/'));
      // 6/8/false/dao/ok
      const trLines = S.log.filter(l => (l.t || '').indexOf('入门第') >= 0).map(l => l.t);
      L('trAwardN', trLines.length);                                                   // 8（每件只一笔）
      L('trAwardLast', (trLines[0] || '').indexOf('入门第八事 · 猎一只妖兽') > 0 ? 'ok' : (trLines[0] || ''));
      L('trEndNote', S.log.some(l => (l.t || '').indexOf('入门八事已了') >= 0) ? 'ok' : 'none');
      L('trEndBag', S.bag.filter(b => b.t === 'dan1').length);                         // 1
      L('trSaved', (function(){ try{ return JSON.parse(XX._saveText()).trail.i; }catch(e){ return 'ERR'; } })());
      /* R-4（制作人第 3 轮拍板）：这一段原来是 document.createElement 造一个 id=tut-tip 的 div
         挂上 .show，再去量 renderTrail 会不会让位——那是假绿：现行引导是 js/guide_taixu.js
         的 #taixu-bubble，全仓库没有任何运行时代码生成 tut-mask / tut-tip（game.js:9411 读的就是这俩
         早已不存在的节点），所以「教程在台上 → 纸签让位」这条分支在真实玩法里永远走不到，
         造出来的节点只是把分支自己喂成绿。
         改法：按现行机制校——把真气泡请上台（S.guide 归初值 + rank/stats.sit/plots 归零过掉
         guide_taixu.js:301 的老玩家闸门 + Guide.reset() 重建），量它当着台面时纸签的实际状态，
         再逐位留证「现行让位条件读的两个旧节点在不在」。
         实测结论（本轮跑出，不迁就）：真气泡 display=block 时纸签仍是 shown，即两套指引同屏 =
         R-3 缺陷；制作人批复 R-3 并入大改阶段一、本轮不动 game.js 行为，所以下面这条锁的是现状，
         标签写明是缺陷锁 —— game.js:9411 一旦改成认现行气泡，这条必红，逼着人来更正它。 */
      S.trail = { i: 0 };
      const rk0 = S.rank, sit0 = S.stats.sit, pl0 = S.plots;
      let bubNow = 'nodom', yieldNow = null, legacyNow = '00';
      try{
        S.rank = 0; S.stats.sit = 0; S.plots = [];
        S.guide = { step: 0, done: false, skipped: false, started: false, flags: {}, rewardClaims: {}, toldSystems: {} };
        if(window.Guide) Guide.reset();
        bubNow = (function(){ const b = document.getElementById('taixu-bubble');
          return b ? (b.style.display === 'none' ? 'hidden' : 'shown') : 'nodom'; })();
        T.render();
        yieldNow = box.hidden;
        legacyNow = (document.getElementById('tut-mask') ? '1' : '0') +
                    (document.getElementById('tut-tip') ? '1' : '0');
      }catch(e){ bubNow = 'ERR'; }
      /* 撤台：把借走的值恢复原样，并按文件开头的口径把引导标成已完结再 reset（停表 + 摘气泡 + 清灰置类）。
         这两步不放进上面的 try：万一请上台抛了错，也必须保证台面是撤干净的，否则后面整段用例都跑在
         一个「引导带着 400ms 定时器」的脏状态上，红的就不是这一条了。 */
      S.rank = rk0; S.stats.sit = sit0; S.plots = pl0;
      S.guide = { step: 7, done: true, skipped: false, started: true,
                  flags: {}, rewardClaims: { taixu_intro_dan_v1: true }, toldSystems: {} };
      try{ if(window.Guide) Guide.reset(); }catch(e){}
      T.render();
      L('trTut', bubNow + '/' + (yieldNow === null ? 'unmeasured' : (yieldNow ? 'hidden' : 'shown')) + '/' + legacyNow);   // shown/hidden/00（R-3 修复后实测口径；改前是 shown/shown/00）
      /* 八件事的「去」都得落到实处：本页两件圈钮，其余六件进得去对应面板 */
      const tg = [];
      T.list.forEach(function(st){
        if(st.go.indexOf('scene:') === 0){
          const el = st.go === 'scene:sit' ? document.querySelector('#sc-acts .cave-act[data-k="sit"]')
                                           : document.getElementById('sc-break');
          tg.push(el ? 'y' : 'n');
          return;
        }
        const p = st.go.split(':');
        try{ window.ROUTER.open(p[0], p[1]); }catch(e){}
        const want = p[1] ? ((window.HUBKIT && window.HUBKIT.subViewOf(p[1])) || p[1]) : p[0];
        tg.push(window.ROUTER.current() === want ? 'y' : window.ROUTER.current());
      });
      L('trTargets', tg.join(''));                                                     // yyyyyyyy
      window.ROUTER.back && window.ROUTER.back();
    })();

    /* ===== 第 106 轮 · 道途（八事之后的长线）+ 日课上限 + hub 题跋 + 丹药倒计时 =====
       道途十二程也全读现成字段，所以这一段只摆真实字段：清到第一程 → 心跳不动 →
       真把境界抬到筑基 → 当场入账、送丹、进第二程。 */
    (function(){
      const T2 = XX._trail2, S = XX._s, box = document.getElementById('sc-trail');
      const txt = id => (document.getElementById(id) || {}).textContent || '';
      /* 先摆一个"什么都还没做"的档：迁移函数要按这个档算第一件没做成的 */
      S.trail = { i: XX._trail.max };
      S.rank = 0; S.exp = 0; S.stone = 0; S.towerMax = 0;
      S.gate = { lv: 0, disciples: [], grad: 0 };
      S.dt = { qing: 0, zhu: 0, su: 0, xuan: 0, huang: 0 };
      S.wu = { sword: 0, dan: 0, array: 0 };
      S.secret = { prog: [0, 0, 0, 0], day: '', swept: 0 };
      L('t2Mig', [T2.migrate(undefined), T2.migrate({ i: 99 }), T2.migrate({ i: -3 }), T2.migrate({ i: 'x' })].join(','));
      L('t2K', T2.k + '/' + T2.max + '/' + T2.list.length);
      /* W3·S1：道途十二程同样只动文案——键序、条数、系数 0.15 都要原样 */
      L('s1T2Keys', T2.list.map(s => s.key).join(','));
      L('s1T2Hints', T2.list.map(s => s.hint || '').join('#'));
      /* W3·S1：道途十二程的「去」同样得落到实处（八事那条早已有断言，这条一直是空白） */
      const tg2 = [];
      T2.list.forEach(function(st){
        if(st.go.indexOf('scene:') === 0){
          tg2.push(document.getElementById('sc-break') ? 'y' : 'n');
          return;
        }
        const p = st.go.split(':');
        try{ window.ROUTER.open(p[0], p[1]); }catch(e){}
        const want = p[1] ? ((window.HUBKIT && window.HUBKIT.subViewOf(p[1])) || p[1]) : p[0];
        tg2.push(window.ROUTER.current() === want ? 'y' : window.ROUTER.current());
      });
      L('s1T2Targets', tg2.join(''));
      window.ROUTER.back && window.ROUTER.back();
      /* 第一程：纸签从「入门八事」换成道途（seal 固定「道」，kicker 报第几程，pips 十二条） */
      S.trail2 = { i: 0 }; S.bag = []; S.log = [];
      XX._render();
      L('t2Show', [box.hidden, box.dataset.mode, txt('st-seal'), txt('st-kicker'), txt('st-name')].join('/'));
      L('t2Pips', document.querySelectorAll('#st-pips i').length + '/' + document.querySelectorAll('#st-pips i.now').length);
      /* 条件没到：心跳一帧不许动 */
      L('t2Idle', T2.idx() + '~' + XX._trail.tick());
      /* 抬到筑基：入账 修为 / 灵石 = 当前层需求 × 0.15，并送一枚中品破境丹 */
      S.rank = 9;
      const need9 = XX._needOf(9), e0 = S.exp, s0 = S.stone;
      const mv = XX._trail.tick();
      L('t2First', [mv, T2.idx(), S.exp - e0, S.stone - s0, Math.round(need9 * T2.k)].join('/'));
      L('t2Log', (S.log[0] || {}).t || '');
      L('t2Pill', S.bag.filter(b => b.t === 'dan2').length);
      /* 同一程不重复发奖 */
      const e1 = S.exp, s1 = S.stone;
      L('t2Dup', XX._trail.tick() + '~' + ((S.exp === e1 && S.stone === s1) ? 'same' : 'changed'));
      /* 补上塔五层 + 秘境五层：两程连着入账，第三程（金丹）自己露出来 */
      S.towerMax = 5; S.secret = { prog: [5, 0, 0, 0], day: '', swept: 0 };
      const mv2 = XX._trail.tick();
      L('t2Chain', [mv2, T2.idx(), txt('st-name'), txt('st-kicker')].join('/'));
      L('t2ChainLog', S.log.filter(l => (l.t || '').indexOf('🧭 道途第') >= 0).length);
      /* 点纸签：金丹那一程要的是顶上【突破】，所以圈住突破钮、人不离开场景 */
      box.click();
      L('t2Go', (document.getElementById('sc-break').classList.contains('trail-ring') ? 'ring' : 'none')
        + '/' + window.ROUTER.current());
      /* 两轨都了才收起 */
      S.trail2 = { i: T2.max }; XX._render();
      L('t2Hide', box.hidden);
      S.trail2 = { i: 3 }; XX._render();
      /* hub 卷尾题跋：每个 hub 页都有一条，写的是同一句「此刻走到哪儿」 */
      window.ROUTER.open('xiu'); XX._render();
      const sc = document.querySelector('#page-xiu .hub-scroll');
      L('t2HubXiu', sc ? [!!sc.querySelector('.hs-seal'), (sc.querySelector('.hs-title') || {}).textContent,
        (sc.querySelector('.hs-idx') || {}).textContent].join('/') : 'none');
      window.ROUTER.open('zong'); XX._render();
      const sc2 = document.querySelector('#page-zong .hub-scroll');
      L('t2HubZong', sc2 ? [(sc2.querySelector('.hs-title') || {}).textContent,
        (sc2.querySelector('.hs-sub') || {}).textContent].join('/') : 'none');
      /* 丹药 buff 倒计时：三族各一槽，族头那行报「剩 X 分 Y 秒」 */
      S.danExp = { mult: 1.2, until: Date.now() + 95000 };
      S.danPow = { pct: 0.2, until: Date.now() + 300000 };
      S.danGain = { pct: 0.3, until: 0 };
      window.ROUTER.open('dong_alchemy'); XX._render();
      const fams = document.querySelectorAll('#xx-alchemy .dan-fam');
      L('t2Dan', fams.length + '/' + ((fams[1] && fams[1].querySelector('.dan-fam-n').textContent) || '')
        + '/' + ((fams[2] && fams[2].querySelector('.dan-fam-n').textContent) || '')
        + '/' + ((fams[3] && fams[3].querySelector('.dan-fam-n').textContent) || ''));
      /* 日课次数：打坐 10 → 30。真点十下之后按钮还得亮着，副标题写明剩几次 */
      L('t2ActLimit', [XX._bal.actLimit.sit, XX._bal.actLimit.herb, XX._bal.actLimit.train,
        XX._bal.actLimit.enlight, XX._bal.actLimit.ponder].join('/'));
      window.ROUTER.open('xiu_acts');
      S.acts = { sit: 0, herb: 0, train: 0, enlight: 0, ponder: 0 };
      S.stats.sit = 0; S.rank = 0; S.exp = 0;
      for(let i = 0; i < 10; i++){ XX._resetCd(); XX._act('sit'); }
      XX._resetCd(); XX._renderCd();
      const sb = document.querySelector('#xx-actions .act[data-k="sit"]');
      L('t2Act10', [(sb ? sb.disabled : 'none'), (sb ? (sb.querySelector('small') || {}).textContent : '')].join('/'));
    })();

    /* ===== 第 107 轮 · 轮回之途（第二世起的三关）=====
       只在「已经转世过」的档上出现：gens 摆 1、心魔摆成上一世的自己，
       然后真抬境界 / 真标照镜 —— 看纸签换轨、入账、道途不偷偷发账、收口后收起。 */
    (function(){
      const T3 = XX._trail3, T2 = XX._trail2, S = XX._s, box = document.getElementById('sc-trail');
      const txt = id => (document.getElementById(id) || {}).textContent || '';
      S.trail = { i: XX._trail.max };
      S.trail2 = { i: 0 };                       /* 道途还没走完：用来验「轮回优先」 */
      S.legacy = { gens: 1, relic: null, hist: [], pick: null };
      S.mirror = { gen: 1, rank: 24, age: 96, brk: 2, pow: 260000, wins: 1, done: 0, calm: 0, calmStep: 0 };
      S.trail3 = { i: 0, gen: 1 };
      S.rank = 10; S.exp = 0; S.stone = 0;
      XX._render();
      L('t3Show', [box.hidden, box.dataset.mode, txt('st-seal'), txt('st-kicker'), txt('st-name')].join('/'));
      L('t3Pips', document.querySelectorAll('#st-pips i').length + '/' + document.querySelectorAll('#st-pips i.done').length);
      /* 没到金丹：心跳一帧不许动；道途也不许在看不见的地方发账 */
      L('t3Idle', XX._trail.tick() + '~' + T3.idx() + '~' + S.trail2.i);
      S.rank = 12;
      const need12 = XX._needOf(12), e0 = S.exp, s0 = S.stone;
      const m3 = XX._trail.tick();
      L('t3First', [m3, T3.idx(), S.exp - e0, S.stone - s0, Math.round(need12 * T2.k)].join('/'));
      L('t3Log', (S.log[0] || {}).t || '');
      /* hub 题跋跟着换轨 */
      window.ROUTER.open('dong'); XX._render();
      const sc3 = document.querySelector('#page-dong .hub-scroll');
      L('t3Hub', sc3 ? [(sc3.querySelector('.hs-title') || {}).textContent,
        (sc3.querySelector('.hs-idx') || {}).textContent].join('/') : 'none');
      window.ROUTER.back && window.ROUTER.back();
      /* 换世 / 老档：定位到这一世第一件没做成的，不按上一世的进度硬套 */
      L('t3Mig', [T3.migrate({ i: 2, gen: 1 }, 1), T3.migrate({ i: 2, gen: 0 }, 1), T3.migrate(undefined, 1)].join(','));
      /* 道途这一世已走完 + 心魔已破 + 前世战力不成气候 → 后两关一帧连过，纸签收起 */
      S.trail2 = { i: T2.max };
      S.mirror.done = 1; S.mirror.pow = 1;
      const m4 = XX._trail.tick();
      L('t3All', [m4, T3.idx(), T3.active(), box.hidden].join('/'));
      L('t3End', S.log.filter(l => (l.t || '').indexOf('♻️ 轮回第') >= 0).length + '/' +
        (S.log.some(l => (l.t || '').indexOf('三关已过') >= 0) ? 'ok' : 'none'));
    })();
  }catch(e){ L('EXC', (e.stack||e.message||"").toString().slice(0,300)); }
  /* 虚拟时间用量：游戏自己有 500ms 心跳，页面永远不会 idle → 注入脚本必须在
     --virtual-time-budget 烧完之前跑完。把用量报出来，超没超预算一眼可见，
     不用再靠「F 整片 undefined」去猜是被截断了还是真挂了。 */
  /* 阶段三 S1/S2/S3 回归（放在 DIAG 末尾，跑完即不再依赖存档状态） */
  try{
    const S = XX._s;
    S.bag = []; S.letters = []; S.bagSize = 20;
    for(let i = 0; i < XX._bagCap(); i++) S.bag.push({ t:'mat_core', n:'妖丹' });
    const mr = XX._addItemEx('mat_core', '妖丹');
    L('s1Mail', mr.mail ? 'yes' : 'no');
    L('s1Pending', XX._ovPending());
    const ov = XX._ovLetter();
    S.bag.pop();
    const cg = ov ? XX._claimOverflow(ov.id) : 'none';
    L('s1Claim', cg || 'none');
    L('s1Pending2', XX._ovPending());
    const bp = XX._breakParts(null, false, false);
    const sum = bp.parts.reduce((a, p) => a + p.v, 0);
    L('s2Parts', sum.toFixed(6) === bp.raw.toFixed(6) ? 'yes' : 'no');
    L('s2Final', bp.final.toFixed(6) === XX._breakChanceFinal(null, false).toFixed(6) ? 'yes' : 'no');
    S.tianji = 1;
    window.ROUTER.openSub('market_tianji'); XX._render();
    const tj = document.querySelector('#tj-goods [data-buy-row="tianji"]');
    L('s3Own', tj && tj.textContent.indexOf('持有 1') >= 0 ? 'yes' : 'no');
    /* S4：事件页签到按钮跨 1.3s（≥2 个 500ms 渲染拍）仍在同一节点上 */
    window.ROUTER.openSub('event_sign'); XX._render();
    const s4Box = document.getElementById('xx-sign');
    const s4Btn = s4Box ? s4Box.querySelector('[data-act="sign"]') : null;
    await sleep(1300);
    L('s4Stable', s4Box && s4Box.isConnected && s4Btn && s4Btn.isConnected ? 'yes' : 'no');
  }catch(e){ L('s123EXC', (e.stack || e.message || '').toString().slice(0, 200)); }
  /* ===== 阶段三收尾：S8 当日四类决策计数（制作人 2026-11-14 批准方案 A） ===== */
  try{
    const S = XX._s;
    const decTxt = () => {
      const d = S.day && S.day.dec;
      return ['res', 'risk', 'grow', 'social'].map(k => d && d[k] === 1 ? 1 : 0).join('');
    };
    /* 1) 新档 / day 缺失：四键默认 0 */
    S.day = { key: '', expGain: 0, sweepExp: 0 };
    XX._ensureDay();
    const todayK = S.day.key;
    L('d0New', decTxt());
    /* 2) 旧档缺 dec：走真读档路径，补四 0 且已有当日主动计数不被清 */
    const rawBefore = localStorage.getItem('xiuxian_save');
    try{
      const oldObj = JSON.parse(rawBefore || '{}');
      oldObj.day = Object.assign({}, oldObj.day || {}, { expGain: 321 });
      delete oldObj.day.dec;
      localStorage.setItem('xiuxian_save', JSON.stringify(oldObj));
      XX._load();
      L('d0Mig', decTxt() + '/' + ((S.day && S.day.expGain) === 321 ? 'keep' : 'lost'));
    }finally{
      if(rawBefore !== null) localStorage.setItem('xiuxian_save', rawBefore);
      XX._load();
    }
    /* 3) 读档脏值：只接受 0/1，2 / "1" / -1 一律归 0 */
    S.day = { key: todayK, expGain: 0, sweepExp: 0, dec: { res: 2, risk: '1', grow: -1, social: 1 } };
    XX._ensureDay();
    L('d0Dirty', decTxt());
    /* 4) 跨天：昨日四 1 → 今日四 0 */
    S.day = { key: '2000-1-1', expGain: 500, sweepExp: 0, dec: { res: 1, risk: 1, grow: 1, social: 1 } };
    XX._ensureDay();
    L('d0Day', decTxt());
    /* 5) 四类真实写入点逐一置 1：派弟子 / 入塔 / 喂食 / 议事 */
    S.day = { key: '', expGain: 0, sweepExp: 0, dec: { res: 0, risk: 0, grow: 0, social: 0 } };
    XX._ensureDay();
    const seq = [];
    S.gate = { lv: 1, grad: 0, disciples: [{ id: 'gt0', name: '阿石', apt: 2, task: '', t0: 0, ret: 0, svc: 0, last: '', run: 0, bless: 0 }] };
    XX._gateAssign('gt0', 'herb');
    seq.push(decTxt());
    S.rank = 24; S.tower = 1; S.trun = null; S.trunLast = null;
    XX._towerEnter();
    seq.push(decTxt());
    S.pets = [{ bid: 'b_test', lv: 1, exp: 0 }];
    S.herb = 100; S.stone = 1e15;
    XX._feedPet(0);
    seq.push(decTxt());
    S.gate.lv = 1; S.council = { day: '', n: 0, last: '' };
    XX._councilPick('relief');
    seq.push(decTxt());
    S.trun = null;
    L('d0Seq', seq.join('>'));
    /* 6) 转世：当日四类决策不带到新世 */
    XX._resetForNewLife();
    L('d0Reborn', decTxt());
  }catch(e){ L('d0EXC', (e.stack || e.message || '').toString().slice(0, 200)); }
  /* R-S2-a：确认页 hidden 时程序化点 #bc-ok 不得涨境（handler 的 hidden 早退，不能只靠 disabled） */
  try{
    const S = XX._s;
    S.rank = 12; S.exp = XX._needOf(12) * 2; S.secludeUntil = 0;
    S.guardArray = 0; S.tianji = 0; S.insight = 0; S.failBonus = 0;
    XX._openBreakConfirm();
    const okBtn = document.getElementById('bc-ok');
    const bcM = document.getElementById('break-confirm-modal');
    const opened = !!(bcM && !bcM.classList.contains('hidden'));
    XX._closeBreakConfirm();
    const r0 = S.rank, e0 = S.exp, l0 = S.log.length;
    const hidden0 = !!(bcM && bcM.classList.contains('hidden'));
    if(okBtn) okBtn.click();                 /* 程序化 click（若 disabled 则天然拦下） */
    const r1 = S.rank;
    const ret = XX._confirmBreak();          /* 绕开 disabled，直接走 handler */
    const r2 = S.rank;
    L('s2HiddenOpened', opened ? 'yes' : 'no');
    L('s2HiddenNoBreak', (hidden0 && r1 === r0 && ret === false && r2 === r0 && S.exp === e0 && S.log.length === l0)
      ? 'yes' : 'no:' + [hidden0, r1, ret, r2, S.exp === e0, S.log.length === l0].join('/'));
    L('s2HiddenStill', (bcM && bcM.classList.contains('hidden')) ? 'yes' : 'no');
    S.rank = 0; S.exp = 0;
  }catch(e){ L('s2HiddenEXC', (e.stack || e.message || '').toString().slice(0, 200)); }
  L('vtUsed', Math.round(performance.now()));
  const d=document.createElement('pre'); d.id='diag'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>
</body>`;

(async () => {
  if (!EDGE) { console.log('无 Edge，跳过'); process.exit(0); }
  fs.mkdirSync(TMP, { recursive: true });
  const html = fs.readFileSync(SRC, 'utf8');
  const diagFile = path.join(TMP, '._diag.html');
  PAGE.writePage(diagFile, html.replace('</body>', DIAG), 'utf8');
  const clean = path.join(TMP, '._clean.html');
  PAGE.writePage(clean, html, 'utf8');
  /* profile 目录名带 pid + 时间戳：pid 会被系统复用，只用 pid 会命中上次的残留存档 */
  const ud = path.join(SCRATCH, 'xxstd' + process.pid + '_' + Date.now());

  /* 虚拟时间预算：游戏自己有 500ms 心跳，页面永不 idle，注入脚本必须在预算烧完前跑完。
     实测脚本用量 7~8 秒（vtUsed 那条就是量这个的），16000 本来够，但被"提前 dump"
     那类问题污染过、判不准，这里留到 30000 当保险；真钱只多几秒。
     ⚠️ 第 89 轮加到 30000 也不够了：炼丹房一页摆了 36 枚丹的图标，虚拟时钟在等真机
        解码时照样往前跑，同一条 30000ms 预算，主力版（5 枚）能跑完 836 条，开发版
        只跑到 164 条就被拦腰 dump；把预算放到 60000 又出现 532 / 871 两条都能出现的抖动。
        所以不再赌单值，改成一档一档加：30000 跑不通换 70000 再换 140000，每次都是
        独立 profile 目录重开。哪一档过的，日志里照实报出来，vtUsed 也按那一档算余量。
     ⚠️ 第 95 轮人物面板多了四次 _render + 一次点击往返，用量再不是 28.9s 那个数：同一份
        代码在 70000 预算下两次分别报 41.3s 和 63.8s（虚拟时钟在等真机解码与频道往返时照样
        往前走，抖动比预算本身还大）。30000 和试过的 50000 两档都成了「必空跑一次 Edge 白等
        三四十秒」，索性把第一档直接设成过去兜底用的 70000，余量门槛 4s 不变。 */
  const VT_LADDER = [70000, 140000];
  let VT_BUDGET = VT_LADDER[0];
  const dumpOnce = (tag, budget) => {
    let dom = '', err = '';
    try {
      dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run',
        '--user-data-dir=' + ud + tag, '--virtual-time-budget=' + budget, '--window-size=900,1200',
        '--dump-dom', 'file:///' + diagFile.replace(/\\/g, '/')],
        { encoding: 'utf8', timeout: budget > 60000 ? 240000 : 120000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) {
      dom = (e.stdout || '') + ''; err = String(e.stderr || e.message || '').slice(0, 200);
    }
    return { dom, err };
  };
  /* diag 交不出来就重来：这份 stdout 有 16 万字节、唯独缺 <pre id=diag>，说明注入脚本被
     虚拟时间预算拦腰截断（也可能是浏览器没起来）。两种都一样——F 整片 undefined、
     二十几条一起红，看着像产品炸了。换独立 profile 目录、并把预算抬高一档重试，最多三次。 */
  let dom = '', dumpErr = '';
  console.log('\n=== 九霄问道 · 三大系统端到端 ===');
  for (let tries = 1; tries <= VT_LADDER.length; tries++) {
    VT_BUDGET = VT_LADDER[tries - 1];
    const t0 = Date.now();
    const r = dumpOnce('t' + tries, VT_BUDGET);
    dom = r.dom; dumpErr = r.err;
    if (/<pre id="diag">/.test(dom)) {
      /* 交得出 diag 不代表预算够用：第 93 轮加了八段开关演出，用量从 28.5s 顶到 28.9s，
         离 30000 只剩 1.1s——余量断言（预算 -4000）当场报红。以前这种「差一点」是靠重跑碰运气，
         现在让它自动抬一档：哪一档真有余量，日志照实报哪一档。 */
      const used = Number((dom.match(/vtUsed=(\d+)/) || [])[1] || 0);
      if (used > VT_BUDGET - 4000 && tries < VT_LADDER.length) {
        console.log('    预算 ' + VT_BUDGET + 'ms 只剩 ' + (VT_BUDGET - used) + 'ms 余量（门槛 4000ms），抬一档重跑');
        continue;
      }
      if (tries > 1) console.log('    第 ' + tries + ' 次（预算 ' + VT_BUDGET + 'ms）交出 diag，真跑了 ' + Math.round((Date.now() - t0) / 100) / 10 + 's');
      break;
    }
    console.log('    Edge 第 ' + tries + ' 次没交出 diag（预算 ' + VT_BUDGET + 'ms、stdout ' + dom.length + ' 字节）' + (dumpErr ? ' stderr: ' + dumpErr : '') + '，抬一档重试');
  }
  /* 重试用的 profile 用完就删：一次 3 份，每份几十 MB，攒在 D 盘上就是几百 MB */
  for (let t = 1; t <= 3; t++) { try { fs.rmSync(ud + 't' + t, { recursive: true, force: true }); } catch (e) {} }

  const m = dom.match(/<pre id="diag">([\s\S]*?)<\/pre>/);
  ok(!!m, '注入脚本跑完', m ? '' : 'Edge 三次都没交出 diag' + (dumpErr ? '，最后一次 stderr: ' + dumpErr : ''));
  const raw = m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
  const F = {};
  raw.split('|').forEach(seg => { const i = seg.indexOf('='); if (i > 0) F[seg.slice(0, i).trim()] = seg.slice(i + 1).trim(); });
  console.log("    " + raw);

  /* DIAG 健壮性守卫（阶段三 S9 项 2，2026-11-14）。
     现场：diag 整片没交出来（Edge 三次都没 dump 到 <pre id=diag>），或只交出一半（注入脚本被
     虚拟时间预算拦腰截断），F 里就是一堆 undefined；断言把缺字段当字符串用的那批站点
     （F.<字段> 点 indexOf / slice / split / match / length 之类）当场抛 TypeError，
     整轮在第一条红之前就炸——D-4 指纹：几十条精确数字断言一起消失，看着像产品坏了，
     其实是取证管道坏了。
     口径：补洞名单不写死，跑前扫本文件自己的源码，收两组字段——
       USED = 以成员访问形式被断言用过的字段（就是会抛的那批）；
       TRI  = 以三态形式判定的字段（和 undefined 比、或 typeof），「没交出来」本身就是判据，
              一律不补，保持 undefined 原语义，免得把绿色路径的既有断言判成新红。
     USED 里 diag 没交出来的补空串并记进 F_MISS：判据一个字不改，缺字段那条照样红，
     只是不再带走整轮。既有断言 0 删 0 跳 0 降；扫描本身失败也只报不炸（退化成改前行为）。 */
  const F_MISS = [];
  const F_GUARD = (function () {
    try {
      const self = fs.readFileSync(__filename, 'utf8');
      const used = new Set(), tri = new Set();
      let g;
      const reUse = /\bF\.([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z_$]/g;
      while ((g = reUse.exec(self))) used.add(g[1]);
      const reTri = /\bF\.([A-Za-z_][A-Za-z0-9_]*)\s*(?:===|!==)\s*undefined\b|\bundefined\s*(?:===|!==)\s*F\.([A-Za-z_][A-Za-z0-9_]*)\b|\btypeof\s+F\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
      while ((g = reTri.exec(self))) { if (g[1]) tri.add(g[1]); if (g[2]) tri.add(g[2]); if (g[3]) tri.add(g[3]); }
      let abstain = 0;
      used.forEach(k => { if (Object.prototype.hasOwnProperty.call(F, k)) return;
        if (tri.has(k)) { abstain++; return; } F[k] = ''; F_MISS.push(k); });
      /* 链式下标站点：拆完段再取第 n 段的那批。补成空串以后拆出来只有一段，非 0 下标拿到
         undefined，后面再点方法照样抛——所以这类站点必须走 FSP，扫到残留就直接报数。 */
      let chain = 0;
      const reChain = /\bF\.[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_$]+\([^()\n]*\)\s*\[(?!0\s*\])/g;
      while ((g = reChain.exec(self))) chain++;
      return { used: used.size, tri: tri.size, abstain: abstain, chain: chain };
    } catch (e) { return { err: String((e && e.message) || e).slice(0, 90) }; }
  })();
  /* FSP(字段, 分隔符, 下标)：diag 字段拆段后取第 n 段，取不到就给空串。
     绿色路径下 FSP(k, sep, i) 与原写法逐字相等，只是缺字段时从「抛」变成「这条红」。 */
  const FSP = (k, sep, i) => {
    const v = Object.prototype.hasOwnProperty.call(F, k) ? F[k] : '';
    if (typeof v !== 'string') return '';
    const a = v.split(sep);
    return i >= 0 && i < a.length ? a[i] : '';
  };
  F_MISS.sort();
  console.log('    [DIAG 守卫] 成员访问字段 ' + (F_GUARD.used || 0) + ' 个（三态豁免 ' + (F_GUARD.tri || 0) + ' 个）'
    + '，本次补空串 ' + F_MISS.length + ' 处'
    + (F_GUARD.abstain ? '，三态字段缺失不补 ' + F_GUARD.abstain + ' 处' : '')
    + '，链式下标残留站点 ' + (F_GUARD.chain || 0) + ' 处'
    + (F_GUARD.err ? '，扫描失败（守卫未生效，退化成改前行为）: ' + F_GUARD.err : '')
    + (F_MISS.length ? '  缺: ' + F_MISS.join(',') : ''));
  ok(F_MISS.length === 0, 'DIAG 字段齐备（守卫补洞 ' + F_MISS.length + ' 处；改前每补一处就会抛 TypeError 炸整轮）', F_MISS.join(','));
  ok((F_GUARD.chain || 0) === 0, 'DIAG 字段的链式下标站点已全部改走 FSP（残留 ' + (F_GUARD.chain || 0) + ' 处）');

  /* 世界频道：服务端源码与面板样式（Node 侧直接读文件，浏览器里拿不到 server/） */
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server', 'sect-server.js'), 'utf8');
  const chatCss = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const roleViewSrc = fs.readFileSync(path.join(ROOT, 'js/views/role.js'), 'utf8');
  const routerSrc = fs.readFileSync(path.join(ROOT, 'js/router.js'), 'utf8');
  const chatCssOk = chatCss.indexOf('.ch-msg') >= 0 && chatCss.indexOf('.ch-msg.mine') >= 0 &&
    chatCss.indexOf('.ch-sys') >= 0 && chatCss.indexOf('.sys-dot') >= 0 &&
    chatCss.indexOf('.ch-input') >= 0;
  /* 洞天福地背景图：文件在位且是合法 JPEG（浏览器里只能算样式，文件本身在 Node 侧验） */
  const caveBgPath = path.join(ROOT, 'ui', 'cave-bg.jpg');
  let caveBgOk = false, caveBgSize = 0;
  try {
    const cb = fs.readFileSync(caveBgPath);
    caveBgOk = cb[0] === 0xFF && cb[1] === 0xD8 && cb[2] === 0xFF;   // JPEG SOI 魔数
    caveBgSize = cb.length;
  } catch (e) {}

  ok(F.EXC === undefined, '无异常', F.EXC);
  /* 预算余量：以前脚本被虚拟时间截断时只会表现为「F 整片 undefined」的怪红，查不动。
     现在把用量报出来，余量掉到 4 秒以内就直接红，逼着下一轮加预算而不是加 sleep。 */
  ok(Number(F.vtUsed) > 0 && Number(F.vtUsed) <= VT_BUDGET - 4000,
     '注入脚本在虚拟时间预算内跑完：用量 ' + F.vtUsed + 'ms / 预算 ' + VT_BUDGET + 'ms');
  ok(F.rank === '炼气一层', '境界正常');
  ok(F.acts === '5' && F.ups === '6', '修炼行动 5 项（含参悟）/ 升级 6 项（3 功法+洞府+炼丹房+炼器坊）', F.acts + '/' + F.ups);
  ok(F.xiuHubCells === '6' && F.xiuHubCards === '0',
     '藏经阁拆页：hub 六格（身份 / 功法 / 修为 / 修炼 / 任务 / 日志），功能卡一张不堆（格 ' + F.xiuHubCells + ' · 卡 ' + F.xiuHubCards + '）');
  ok(F.xiuHubSealRank === F.rank, '藏经阁 hub 身份格朱砂印跟着境界走（' + F.xiuHubSealRank + '）');
  ok(F.questDeep === 'xiu_quest' && F.questDeepDepth === '2' && Number(F.questRows) >= 1,
     '木牌 data-scroll="xx-quest" 直达任务独立页（当前 ' + F.questDeep + ' · 栈深 ' + F.questDeepDepth + ' · 任务 ' + F.questRows + ' 条）');
  ok(F.blds === '10' && F.sceneActive === 'true', '主界面场景 + 10 个建筑入口（洞府产业已化玉简节点 + 城镇 10，含天骄榜）（' + F.blds + '）');
  ok(F.sceneTabs === '5', '底部五签：人物 / 洞府 / 城镇 / 宗门 / 背包');
  ok(F.caveActive === 'yes' && F.townHidden === 'yes', '默认停在洞府（修炼主场）');
  ok(F.townActive === 'yes' && F.caveHiddenAfter === 'yes', '切到城镇 · 清虚观');
  ok(F.caveBack === 'yes', '切回洞府');
  ok(F.caveBgImg === 'yes' && F.caveBgWash === 'yes',
     '洞府铺洞天福地水墨图 + 宣纸 wash（图 ' + F.caveBgImg + ' / wash ' + F.caveBgWash + '）');
  ok(caveBgOk && caveBgSize > 100000, 'ui/cave-bg.jpg 在位且为合法 JPEG（' + Math.round(caveBgSize / 1024) + 'KB）');
  /* AI 水墨图标（2026-10-24）：game.js / views / index.html 引用的图标全部在位，且是带透明通道的 PNG */
  const gameSrc = fs.readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8');
  const viewDir = path.join(ROOT, 'js', 'views');
  let viewSrc = '';
  fs.readdirSync(viewDir).forEach(f => { viewSrc += fs.readFileSync(path.join(viewDir, f), 'utf8'); });
  const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  /* 第 88 轮：城镇建筑立绘是 CSS 引用的，扫描范围要把 style.css 也算进来，
     否则「引用即须存在」这张网漏掉了整个背景图通道 */
  const cssSrcForIcons = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const iconPaths = Array.from(new Set(
    (gameSrc + viewSrc + htmlSrc + cssSrcForIcons).match(/ui\/icons\/[a-z0-9_]+\.png/g) || [])).concat(
    Array.from(new Set(
      /* 第 84 轮：战斗演出开始直接引用 ui/avatar/ 立绘，一并纳入「引用即须存在」扫描 */
      (gameSrc + viewSrc + htmlSrc + cssSrcForIcons).match(/ui\/avatar\/[a-z0-9_]+\.png/g) || [])));
  /* 残留检查：任何代码/模板里都不该再引用 .svg 旧图标 */
  const svgLeftovers = Array.from(new Set(
    (gameSrc + viewSrc + htmlSrc + cssSrcForIcons).match(/ui\/icons\/[a-z0-9_]+\.svg/g) || []));
  const railPaths = ['role', 'bag', 'quest', 'chat', 'sfx', 'settings'].map(n => 'ui/icons/rail_' + n + '.png');
  let iconOk = 0; const iconMissing = [];
  iconPaths.concat(railPaths).forEach(p => {
    try {
      const b = fs.readFileSync(path.join(ROOT, p));
      if (b[0] === 0x89 && b[1] === 0x50 && b[25] === 6) iconOk++; else iconMissing.push(p);   // PNG 魔数 + colorType 6(RGBA)
    } catch (e) { iconMissing.push(p); }
  });
  ok(F.railIcons === '2' && F.handbookIcons === '3', '侧栏 2 钮（功法/设置）+ 仙途手札 3 钮（任务/传音/音效）；人物/背包走五签');
  ok(F.huntRemoved === 'yes', '塔页已无旧猎妖列表');
  ok(F.danImgPng === 'yes', '丹药图标切 PNG（dan1/dan4 各自独立图）');
  ok(iconPaths.length + railPaths.length >= 81 && iconOk === iconPaths.length + railPaths.length,
     'AI 水墨图标 ' + iconOk + '/' + (iconPaths.length + railPaths.length) + ' 全部在位（PNG+透明通道）' + (iconMissing.length ? ' 缺:' + iconMissing.join(',') : ''));
  ok(svgLeftovers.length === 0, '全项目无 .svg 旧图标残留引用' + (svgLeftovers.length ? ' 剩:' + svgLeftovers.join(',') : ''));
  /* 第 88 轮：城镇十件建筑的 CSS 画物（渐变 + clip-path 硬凑的那套）必须拆干净，
     不能只换图不留尸 —— 类名、@keyframes 一并查 */
  const legacyArt = ['art-coin', 'art-slips', 'art-compass', 'art-fu', 'art-plank',
                     'art-pagoda', 'art-sword', 'art-bi']
    .filter(k => cssSrcForIcons.indexOf('.' + k) >= 0 || htmlSrc.indexOf(k) >= 0)
    .concat(['dialSpin', 'dialNeedle'].filter(k => cssSrcForIcons.indexOf(k) >= 0));
  ok(legacyArt.length === 0, 'CSS 画物已彻底下线（残留 ' + legacyArt.length + '）' + (legacyArt.length ? ' 剩:' + legacyArt.join(',') : ''));
  /* 闭关归来 · 离线收益结算弹窗（2026-10-24） */
  ok(htmlSrc.indexOf('class="modal hidden" id="off-modal"') >= 0, '闭关归来弹窗开局默认隐藏（标记位）');
  ok(F.offModalInDom === 'yes', '闭关归来弹窗在 DOM');
  ok(F.offModalShown === 'yes' && F.offDur.indexOf('2.0 小时') >= 0 &&
     F.offDur.indexOf('本次按') >= 0 && F.offDur.indexOf('未计的') >= 0,
     '离线结算：时长+封顶提示正确（' + F.offDur + '）');
  ok(F.offCapTxt.indexOf('本次按 ' + F.offCapExp) >= 0 && F.offCapExp !== '2.0 小时',
     '封顶提示随境界/洞天变化（第 22 层主洞玄冥：' + F.offCapTxt + '）');
  ok(F.offTip.indexOf('最多 ' + F.offTipExp) >= 0 && F.offTipExp !== '8 小时',
     '修炼页离线提示按实际封顶上浮（' + F.offTip + '）');
  /* W2（阶段一，2026-11-14 已批）：封顶只补前段 —— 基准 8h 抬到 12h 地板，rank ≤ 17 一律 12 小时。
     改前这里锁的是「低境界仍写 8 小时」，改后字面应写 12 小时。 */
  ok(F.offTip0.indexOf('最多 12 小时') >= 0, 'W2 后低境界写 12 小时（' + F.offTip0 + '）');
  ok(gameSrc.indexOf('if(dt > cap) dt = cap;') >= 0,
     '页面挂机追赶与离线共用同一条封顶（不再是写死的 8 小时）');
  ok(F.offRows === '4' && F.offRowHunt === 'yes', '收获明细 4 行（修为/灵石/矿石/猎妖击杀）');
  ok(F.offNote.indexOf('2 株') >= 0, '成熟作物提醒（' + F.offNote + '）');
  ok(F.offModalClosed === 'yes', '「收入囊中」可关闭弹窗');
  /* 入口红点（2026-10-24） */
  ok(+F.dotN >= 7, '入口红点开局插好（' + F.dotN + ' 枚）');
  ok(F.dotArenaOn === 'yes' && F.dotArenaOff === 'yes', '论剑台红点随剩余次数亮/灭');
  ok(F.dotChongOn === 'yes', '灵兽园有蛋待孵 → 红点亮');
  ok(F.dotEventOn === 'yes' && F.dotEventOff === 'yes', '宝藏阁红点随签到/任务可领亮/灭');
  /* W3·S2：世界线红点（镇妖塔）——每一档都对着现成闸门，绝不错指 */
  ok(F.dotTowerEl === 'yes', 'W3·S2：镇妖塔格有红点宿主（复用 DOT_RULES 插点，无新 UI）');
  ok(F.dotTowerNoClue === 'off', 'W3·S2：塔 5 层但没听过沈碑④ → 不亮（不给做不到的提示）');
  ok(F.dotTowerNoTower === 'off', 'W3·S2：听过④可从没进过塔 → 不亮（俯身要 towerMax≥1）');
  ok(F.dotTowerDig === 'on', 'W3·S2：听过④ + 进过塔 + 未挖 → 亮（塔底可俯身）');
  ok(F.dotTowerWait === 'off', 'W3·S2：已挖但契机未到（无镜、塔不足 3 层）→ 灭');
  ok(F.dotTowerDoor === 'on', 'W3·S2：已挖 + 塔到 3 层 → 再亮（三扇门待选）');
  ok(F.dotTowerDone === 'off', 'W3·S2：进了终态（封好）→ 不再亮，玩家做完即消失');
  /* 修行札记（2026-10-24） */
  ok(F.journalN === '10' && F.journalHunt === 'yes' && F.journalTower === 'yes',
     '人物面板修行札记 10 项统计（猎妖 30 只 / 镇妖塔第 15 层在列）');
  /* 战利品浮现（2026-10-24） */
  ok(F.lootRows === '2' && F.lootMatImg === 'yes' && F.lootStone === 'yes',
     '镇妖塔胜利掉落行：兽骨行（图标在位）+ 灵石行');
  ok(F.lootRow2Delay === '110ms', '掉落行错峰 110ms 滑入（视觉暂存下限之上）');
  ok(F.lootChip1 === '1' && +F.lootChipCap >= 2 && +F.lootChipCap <= 3,
     '猎妖飘字 toast 出现且连发时堆叠封顶 3（实测 ' + F.lootChipCap + '）');
  ok(chatCss.indexOf('.loot-chip') >= 0 && chatCss.indexOf('lootChipOut') >= 0 &&
     chatCss.indexOf('prefers-reduced-motion') >= 0,
     '飘字样式 + 1.15s 淡出 + reduced-motion 直通降级在位');
  ok(htmlSrc.indexOf('id="bt-loot"') >= 0 && htmlSrc.indexOf('id="loot-toast"') >= 0 &&
     htmlSrc.indexOf('bt-reward') < 0, '战斗弹窗挂 #bt-loot + 全局 #loot-toast（旧 #bt-reward 已移除）');
  /* 妖踪（第 102 轮）：猎妖挂机里的限时机会 */
  ok(F.trHunted === 'yes' && F.trSpawned === 'yes' && F.trShown === 'yes',
     '猎妖中可生出「妖踪」浮片（.' + 'trace-bar 显形）');
  ok((F.trName || '').indexOf('异种 · ') === 0, '妖踪命名为「异种 · 妖兽名」（' + F.trName + '）');
  ok(/^战力 [\d.,]+ · (你压得住|胜负难料|差 [\d.,]+)$/.test(F.trDesc || ''),
     '浮片战力对比文案三态之一（' + F.trDesc + '）');
  ok(/^(1[0-5]|[1-9])s$/.test(F.trLeft || ''), '倒计时按整秒显示（' + F.trLeft + '）');
  ok(F.trWinStone === '0' && F.trWinBag === '1' && F.trHidden === 'yes',
     '追击得手：灵石 +need×0.18、材料 +1、浮片收起');
  ok(F.trFarBtn === 'yes' && F.trLose === 'yes',
     '差距过大时追击按钮置灰；硬追落空只清猎杀进度、零收入');
  ok(F.trLetStone === '0' && F.trLetProg === '5',
     '放过：拾 need×0.02 小份灵石，猎杀进度原样保留');
  ok(F.trExpired === 'yes', '十五息到点自动遁走，不扣灵石、不清进度');
  ok(F.trStopped === 'yes', '收功时浮片一并收起');
  ok(htmlSrc.indexOf('id="trace-bar"') >= 0 && htmlSrc.indexOf('id="tb-chase"') >= 0 &&
     htmlSrc.indexOf('id="tb-let"') >= 0 && htmlSrc.indexOf('id="trace-bar"') < htmlSrc.indexOf('id="trib-modal"'),
     '妖踪浮片挂在 #loot-toast 之后、渡劫弹窗之前（与飘字同层）');
  ok(chatCss.indexOf('.trace-bar') >= 0 && chatCss.indexOf('traceIn') >= 0 &&
     chatCss.indexOf('.trace-bar.hidden') >= 0,
     '妖踪浮片样式 + 进场动效 + hidden 直隐在位');
  /* 山门议事（第 103 轮）：每天一条琐事，三选一 */
  ok(F.coSealNoGate === '未立' && F.coNoGate === 'yes/0' && F.coDayNoGate === '未立山门',
     '未立山门时议事只留一句提示，不摆三签（' + F.coDayNoGate + '）');
  ok(F.coTitle === '山下蝗灾' && F.coOptN === '3' && F.coOptNames === '开仓赈济/派弟子帮工/闭门清修',
     '议事页：一条议题 + 三名签（' + F.coOptNames + '）');
  ok(/^灵石 −[\d.,]+ · 灵草 \+6 · 声望 \+12$/.test(F.coEffRelief || ''),
     '代价与所得按当前境界现算，写在签上（' + F.coEffRelief + '）');
  ok(F.coPayStone === String(-Math.max(1, Math.round(Number(F.coNeed) * 0.35))) &&
     F.coPayHerb === '6' && F.coPayRep === '12',
     '开仓赈济：灵石 −need×0.35，换灵草 +6、声望 +12（实测 ' + [F.coPayStone, F.coPayHerb, F.coPayRep].join('/') + '）');
  ok(F.coSealed === '1' && F.coDayDone === '今日已议' && F.coDoneHead === '山下蝗灾 · 开仓赈济' &&
     /^灵石 −[\d.,]+、灵草 \+6、声望 \+12$/.test(F.coLast || ''),
     '选完封卷：结论留在纸上（写刚议完那条，不是明天的）、印信换「今日已议」');
  ok(F.coAgain === 'false' && F.coAgainPay === 'yes', '同日再议不入第二笔（次数与灵石都不动）');
  ok(F.coRotate === '邻山求药', '次日解封并轮到下一条议题（' + F.coRotate + '）');
  ok(F.coBlockHerb === 'yes/灵草不足' && F.coBlockIdle === 'yes/无弟子在山上' && F.coDayIdle === '今日待议',
     '代价不够 / 无人可派的签直接置灰并写明原因');
  ok(F.coSvc === '1', '「准其下山」给闲置弟子的差事趟数 +1');
  ok(F.coCycle === '5/caravan' && F.coHubSecs === '5/zong_council' && F.zongHubCells === '5',
     '五条议题轮换、宗门 hub 多出第五格「山门议事」');
  ok(F.coMigDirty === 'string/0/string' && F.coMigBigN === '9999/10',
     '脏档议事字段读档即夹（n 0~9999、day/last 只收字符串）');
  /* W1「塔底」（第 109 轮）：唯一真值 worldFoot 的读档口径。
     老档缺键 = 从没俯身过；只认空串 / dug / open / self / seal 五值，其余回退空串；
     重复 load 幂等（迁移只读档不读旧 S）；档里多出老代码不认识的键也不能拖垮读档。 */
  ok(F.wfMigOld === 'e/e', '旧档没有 worldFoot 字段读成空串，连 load 两次仍是空串（' + F.wfMigOld + '）');
  ok(F.wfMigLegal === 'seal' && F.wfMigDigTwice === 'dug/same',
     'worldFoot 终态 / dug 照原样读回，重复 load 不变（' + F.wfMigLegal + ' · ' + F.wfMigDigTwice + '）');
  ok(F.wfMigNum === 'e' && F.wfMigStr === 'e' && F.wfMigObj === 'e',
     '脏 worldFoot（数字 / 未知串 / 对象）读档一律回退空串（' + F.wfMigNum + '/' + F.wfMigStr + '/' + F.wfMigObj + '）');
  ok(F.wfUnknownKey === 'open/n', '存档多出未定义的顶层键不影响 worldFoot 与境界读取（' + F.wfUnknownKey + '）');
  ok((F.wfNpcsKeys === 'stele' || F.wfNpcsKeys === 'cuijiu,stele') &&
     F.wfSteleKeys === 'attitude,choice,coldUntil,cur,events,heard,keyLogged,lastDecayAt,lastSeen,lastTower,met,nudgeAt,quest,rel,seenGens,stage,state,told,trust',
     '沈碑存档结构冻结：stele = 2f 九键 + 框架第一步 told/keyLogged/lastTower + 第二步 7 字段（均已批）；npcs 桶允许 stele 与 cuijiu（' + F.wfNpcsKeys + ' · ' + F.wfSteleKeys + '）');
  ok(chatCss.indexOf('#xx-council') >= 0 && chatCss.indexOf('.co-opt:disabled') >= 0 &&
     chatCss.indexOf('.co-day.muted') >= 0 && chatCss.indexOf('.co-eff') >= 0,
     '议事纸签样式 + 置灰签 + 印信灰态在位');
  /* 入门八事（第 105 轮）：第一局一直摆在眼前的八件事，点一下直达 */
  ok(F.trMig === '8,3,8,8,0', '旧档没有 trail 字段 = 八事已了；脏值一律夹进 0~8（' + F.trMig + '）');
  ok(F.trShow === 'false/0/8/sit', '新号开门：纸签露出第 1 事，八件一件没做（' + F.trShow + '）');
  ok(F.trText === '一/打坐三炷香/0/3/8/1/0',
     '纸签写着第几事、事名、进度，八道刻痕只亮当前一道（' + F.trText + '）');
  ok((F.trRing || '').indexOf('ring/') === 0, '点纸签 → 圈住本页的打坐钮，不跳页（' + F.trRing + '）');
  ok(F.trIdle === '0', '条件没到，心跳一帧不推进（' + F.trIdle + '）');
  ok(F.trSit === '1/采两把灵草/0/2/0', '点三次打坐 → 纸签自己走到第 2 事（' + F.trSit + '）');
  ok((F.trSitLog || '').indexOf('📜 入门第一事 · 打坐三炷香：修为 +') === 0 &&
     F.trSitLog.indexOf('灵石 +') > 0,
     '第一事落账：修为 / 灵石各一笔（' + F.trSitLog + '）');
  ok(F.trNoDup === '0/same', '同一件事不重复发奖（' + F.trNoDup + '）');
  ok((F.trHerb || '').split('/')[0] === '2' && (F.trHerb || '').split('/')[1] === '破境至炼气三层' &&
     (F.trHerb || '').slice(-3) === '/12',
     '采两把灵草 → 第 3 事，灵草 +6 到账（' + F.trHerb + '）');
  ok(F.trHerbLog === 'ok', '第二事落账写明灵草 +6（' + F.trHerbLog + '）');
  ok(F.trChain === '6/8/false/dao/ok',
     '条件补齐一帧了完剩下六件，纸签当场换成道途第一程（' + F.trChain + '）');
  ok(F.trAwardN === '8', '八件事各落一笔，不多不少（' + F.trAwardN + '）');
  ok(F.trAwardLast === 'ok' && F.trEndNote === 'ok', '末件送出并指路（' + F.trAwardLast + '）');  ok(F.trEndBag === '1', '末件那枚下品破境丹真进背包（' + F.trEndBag + '）');
  ok(F.trSaved === '8', '进度落盘（' + F.trSaved + '）');
  /* R-3 更正（本单要求 2）：上面 R-4 注释预告的「修好 renderTrail 认现行气泡 → 这条必红」已兑现。
     正向口径三位分别是 —— 第 1 位 bubNow：真气泡是否在台（必须 shown，否则这段取样没做成，红）；
     第 2 位 yieldNow：renderTrail 之后纸签有没有让位（必须 hidden = box.hidden === true，这就是修复本身）；
     第 3 位 legacyNow：让位判据原先只认的两个旧节点仍在不在（必须 00，留证「不是靠旧节点凑出来的绿」）。
     三位一起锁，谁退回旧行为谁红；不许拆成永真。 */
  ok(F.trTut === 'shown/hidden/00',
     'R-3 已修（2026-11-14 阶段一，game.js:9577-9580 让位判据补认 body.guide-active / 可见的 #taixu-bubble）：' +
     '现行真气泡上台（第 1 位 shown）时纸签当场让位（第 2 位 hidden），' +
     '且让位不是靠已下线的 tut-mask/tut-tip 撑出来的（第 3 位 00 = 两个旧节点确实仍不存在）→ 两套指引不再同屏（' + F.trTut + '）');
  ok(F.trTargets === 'yyyyyyyy', '八件事的「去」都落到实处（' + F.trTargets + '）');
  /* ===== W3·S1：新手目标连续性 = 只改文案与指向，表 / 顺序 / 奖励机制一个字节都不动 =====
     键序断言挡「顺手加一步 / 调顺序」，源码字面量断言挡「顺手调奖励系数」。 */
  /* ⚠️ 换代说明（制作人拍板 2026-11-13，落码第 4 项）：这一段原来 readFileSync 的是 js/tutorial.js，
     而 index.html 早就不挂它了（558 行挂的是 js/guide_taixu.js）——死文件里的字面量还在，
     所以那两条断言一直"绿"，属于假绿。现在把校源换成现行引导 guide_taixu.js，意图不变：
       ①引导毕业那份相赠的数值一字未动（旧：+100 灵石；新：一枚下品聚气丹，凭证号唯一幂等）
       ②引导收尾必须把玩家交到具体去处（旧：「去坊市看看」+ 底下那张纸签；新：指向【识人】按钮 + 点名后山守碑人）
     两条都同时校源码字面量与运行时结果，不因换机制而降低预期。 */
  const taixuSrc = fs.readFileSync(path.join(ROOT, 'js', 'guide_taixu.js'), 'utf8');
  /* ===== 阶段二静态校源：N10 / N11 / N13 ===== */
  const roleSrc = fs.readFileSync(path.join(ROOT, 'js', 'views', 'role.js'), 'utf8');
  const npcSrc = fs.readFileSync(path.join(ROOT, 'js', 'npc.js'), 'utf8');
  ok(roleSrc.indexOf("sealTxt: '0/5'") >= 0 && roleSrc.indexOf("sealTxt: '0/6'") < 0,
     'N10 人物页沈碑印章静态初值 0/5（不再 0/6→0/5 跳变）');
  ok(npcSrc.indexOf('var HEARD_CAP = 5;') >= 0, 'N10 沈碑可听上限 HEARD_CAP = 5');
  ok(gameSrc.indexOf('pathBonusSegText(o.id)') >= 0 && gameSrc.indexOf('cp-bonus') >= 0,
     'N11 创角/改道卡渲染九段加成（直读 PATH_BONUS 派生表，不另存副本）');
  ok(gameSrc.indexOf("log('⚔️ 本场道途加成：' + pathBonusLabel(S.path)") >= 0,
     'N11 战斗日志直读当前段矩阵值');
  ok(gameSrc.indexOf("'% 首通奖励</p>'") >= 0, 'N13 塔扫荡提示改为「首通奖励的 60%」口径');
  ok(gameSrc.indexOf("usage: '突破专用丹药：服食后自身突破成功率 +5%") >= 0,
     'N13 下品破境丹 usage 统一为服食口径（已删除握持文案）');
  ok(F.s1TrailKeys === 'sit,herb,brk,array,tower,secret,alchemy,hunt',
     'W3·S1：入门八事仍是这八件、这个顺序（' + F.s1TrailKeys + '）');
  ok(F.s1T2Keys === 'brk9,tower5,secret5,brk12,gate,brk15,dt1,brk18,wu5,brk21,brk23,brk25',
     'W3·S1：道途十二程仍是这十二程、这个顺序（' + F.s1T2Keys + '）');
  ok(F.s1T2Targets === 'yyyyyyyyyyyy',
     'W3·S1：道途十二程的「去」也全部落到实处（' + F.s1T2Targets + '）');
  ok(F.s1TrailHints.split('#').length === 8 && F.s1TrailHints.split('#').every(h => h.length > 4),
     'W3·S1：八事每条都有提示、没有空串');
  ok(F.s1T2Hints.split('#').length === 12 && F.s1T2Hints.split('#').every(h => h.length > 4),
     'W3·S1：道途十二程每条都有提示、没有空串');
  ok(FSP('s1TrailHints', '#', 1).indexOf('藏经阁') >= 0 && FSP('s1TrailHints', '#', 1).indexOf('两次') >= 0,
     'W3·S1：第二事提示仍指到藏经阁，并把「两次」写进文案（' + FSP('s1TrailHints', '#', 1) + '）');
  ok(FSP('s1T2Hints', '#', 1).indexOf('三扇门') >= 0 && FSP('s1T2Hints', '#', 1).indexOf('守碑') >= 0,
     'W3·S1：塔那一程既说清三扇门、也把玩家指回观前守碑人（世界线不再只靠玩家自己撞）');
  ok(FSP('s1T2Hints', '#', 3).indexOf('突破') >= 0 && FSP('s1T2Hints', '#', 10).indexOf('突破') >= 0,
     'W3·S1：两程原来只写结果的境界提示，现在补上了「点顶上【突破】」这个动作');
  ok(F.s1HintFit === 'ok',
     'W3·S1：23 条提示在纸签真实可测宽度（' + F.s1HintBox + '，cap>150 才算量到）内一条都不被省略号截断');
  ok(gameSrc.indexOf('const stone = Math.round(need * 0.12), exp = Math.round(need * 0.10);') >= 0,
     'W3·S1：八事每件事的奖励系数 0.12 / 0.10 一字未动');
  ok(gameSrc.indexOf('rw: { herb: 6 }') >= 0 && gameSrc.indexOf('rw: { herb: 10 }') >= 0
     && gameSrc.indexOf('rw: { herb: 14, ore: 12 }') >= 0,
     'W3·S1：八事的灵草 / 矿石附带奖励一字未动');
  ok(gameSrc.indexOf('while(trail2Active())') >= 0 && gameSrc.indexOf('if(!trail3Active())') >= 0,
     'W3·S1：三轨仍是串行（没并行触发、没提前发账）');
  ok(taixuSrc.indexOf("var DAN_ID = 'dan1';") >= 0 &&
     taixuSrc.indexOf("var DAN_NAME = '下品破境丹';") >= 0 &&
     taixuSrc.indexOf("var DAN_CLAIM = 'taixu_intro_dan_v1';") >= 0 &&
     F.guideDanCount === '1' && F.guideDanClaim === 'ok' && F.guideDanSaved === 'ok',
     'W3·S1 / 阶段二 N12-3：引导毕业一份丹药——现行改赠下品破境丹（丹号 dan1 / 丹名 / 唯一凭证号三条字面量都在），' +
     '运行时也真发到背包恰好 ' + F.guideDanCount + ' 枚、凭证只落一次并随档存下（' + F.guideDanClaim + '/' + F.guideDanSaved + '）');
  ok(taixuSrc.indexOf("target: '.scene-tab[data-tab=\"role\"]'") >= 0 &&
     taixuSrc.indexOf('后山那位，记得替我问好') >= 0 &&
     F.guideToHandoff === 'ok' && F.guideFinishLog === 'ok',
     'W3·S1：引导收尾把玩家交到具体去处——最后一步指着底部【人物】签（旧玉印已收，指向随拍板改挂五签），' +
     '运行时收尾那句旁白也真落进日志（' + F.guideToHandoff + '/' + F.guideFinishLog + '）');
  ok(chatCss.indexOf('.sc-trail') >= 0 && chatCss.indexOf('.st-seal') >= 0 &&
     chatCss.indexOf('trailRing') >= 0 && chatCss.indexOf('.sc-trail[hidden]') >= 0,
     '纸签样式（八道刻痕 / 朱砂印 / 圈三下的动效 / 收起）在位');
  /* 道途（第 106 轮）：八事之后同一条纸签换一张长表 */
  ok(F.t2Mig === '0,12,0,0', '道途迁移：老档静默定位到第一件没做成的，脏值夹进 0~12（' + F.t2Mig + '）');
  ok(F.t2K === '0.15/12/12', '一程 = 当前层需求 15%，共十二程（' + F.t2K + '）');
  ok(F.t2Show === 'false/dao/道/道途 · 1/12/筑基',
     '八事之后纸签换成道途：朱砂印写「道」、kicker 报第几程（' + F.t2Show + '）');
  ok(F.t2Pips === '12/1', '道途十二条刻痕、只亮当前一道（' + F.t2Pips + '）');
  ok(F.t2Idle === '0~0', '条件没到，心跳一帧不推进（' + F.t2Idle + '）');
  ok((F.t2First || '').split('/')[0] === '1' && (F.t2First || '').split('/')[1] === '1' &&
     (F.t2First || '').split('/')[2] === (F.t2First || '').split('/')[4] &&
     (F.t2First || '').split('/')[3] === (F.t2First || '').split('/')[4],
     '抬到筑基当场入账：修为 / 灵石各 = 需求 × 0.15（' + F.t2First + '）');
  ok((F.t2Log || '').indexOf('🧭 道途第一程 · 筑基：修为 +') === 0,
     '道途落账写明第几程、事名（' + F.t2Log + '）');
  ok(F.t2Pill === '1', '跨段那一程送一枚对得上段的中品破境丹（' + F.t2Pill + '）');
  ok(F.t2Dup === '0~same', '同一程不重复发奖（' + F.t2Dup + '）');
  ok(F.t2Chain === '2/3/金丹/道途 · 4/12', '两程同时达成一帧连了，第三程自己露出来（' + F.t2Chain + '）');
  ok(F.t2ChainLog === '3', '每程各落一笔、不多不少（' + F.t2ChainLog + '）');
  ok((F.t2Go || '').indexOf('ring/') === 0, '点纸签 → 圈住顶上【突破】，不跳页（' + F.t2Go + '）');
  ok(F.t2Hide === 'true', '两轨都了纸签才收起（' + F.t2Hide + '）');
  ok(F.t2HubXiu === 'true/道途 · 金丹/4 / 12', 'hub 卷尾题跋：写此刻走到哪儿（' + F.t2HubXiu + '）');
  ok((F.t2HubZong || '').indexOf('道途 · 金丹/第四程 · ') === 0,
     '宗门 hub 同样一条，副行报第几程与进度（' + F.t2HubZong + '）');
  ok((F.t2Dan || '').indexOf('4/') === 0 && (F.t2Dan || '').indexOf('剩 1 分') > 0 &&
     (F.t2Dan.match(/剩 /g) || []).length === 2,
     '丹药倒计时：只有挂了 buff 的族头报剩余（聚灵 95 秒 / 淬体 300 秒）（' + F.t2Dan + '）');
  ok(F.t2ActLimit === '30/30/12/6/4', '日课次数：打坐 / 采药 30、历练 12、顿悟 6、参悟 4（' + F.t2ActLimit + '）');
  /* W1 修 B（阶段一，2026-11-14 已批）：打坐副文从「修为 +10 秒」（等效挂机秒）改为
     「修为 +{实得}（今日主动 {pct}% · 效率 {eff}%）」—— 降档后必须让玩家看得见实得。 */
  ok(/^false\/修为 \+[\d,]+（今日主动 \d+% · 效率 (100|50|25)%） · 剩 20 次$/.test(F.t2Act10),
     '真点十下打坐按钮还亮着，副标题报实得、今日档位与剩余次数（' + F.t2Act10 + '）');
  /* 第 107 轮 · 轮回之途：第二世起纸签不空着，也不停在上一世那一程 */
  ok(F.t3Show === 'false/lun/轮/轮回 · 第1世 · 1/3/重修 · 结丹',
     '转世后的档：纸签换「轮回 · 第1世」，印信写「轮」（' + F.t3Show + '）');
  ok(F.t3Pips === '3/0', '轮回只有三关：三颗刻痕，一开始一颗没亮（' + F.t3Pips + '）');
  ok(F.t3Idle === '0~0~0', '还没结丹：心跳不动，道途也不会在看不见的地方发账（' + F.t3Idle + '）');
  ok((F.t3First || '').split('/')[0] === '1' && (F.t3First || '').split('/')[1] === '1' &&
     (F.t3First || '').split('/')[2] === (F.t3First || '').split('/')[4] &&
     (F.t3First || '').split('/')[3] === (F.t3First || '').split('/')[4],
     '修回金丹当场入账：修为 / 灵石各 = 需求 × 0.15（' + F.t3First + '）');
  ok((F.t3Log || '').indexOf('♻️ 轮回第一关 · 重修 · 结丹') === 0,
     '轮回落账写明第几关、事名（' + F.t3Log + '）');
  ok(F.t3Hub === '轮回 · 第1世 · 照见心魔/2 / 3', 'hub 题跋跟着换轨，报第几世第几关（' + F.t3Hub + '）');
  ok(F.t3Mig === '2,1,1', '换世 / 老档按这一世重算，不拿上一世的进度硬套（' + F.t3Mig + '）');
  ok(F.t3All === '2/3/false/true', '后两关一帧连过，走完纸签收起（' + F.t3All + '）');
  ok(F.t3End === '3/ok', '三关各落一笔，收口那句也在（' + F.t3End + '）');
  ok(chatCss.indexOf('.hub-scroll') >= 0 && chatCss.indexOf('.hs-seal') >= 0 &&
     chatCss.indexOf('.hs-title') >= 0, 'hub 题跋样式（宣纸底 / 朱砂印 / 两行字）在位');
  /* 字体补丁（第 105 轮）：本地 ZCOOL 子集里「回 / 圃 / 圊」是实心方块，
     用 unicode-range 把这三个码位让给后面的雅黑，别把子集的坏字形画到屏幕上 */
  ok(chatCss.indexOf('unicode-range:U+0-56DD, U+56DF-5702, U+5704-5709, U+570B-10FFFF') >= 0,
     '本地字体子集的三个坏字形码位已排除（回 / 圃 / 圊 回落雅黑）');
  /* 灵兽诞生 · 孵化演出（2026-10-25） */
  ok(htmlSrc.indexOf('class="modal hidden" id="hatch-modal"') >= 0, '孵化演出弹窗开局默认隐藏（标记位）');
  ok(F.hatchModalShown === 'yes' && F.hatchEggGone === 'yes' && F.hatchPetBid === 'rat',
     '孵化：扣蛋得宠 + 演出弹窗弹出');
  ok(F.hatchImg === 'yes' && F.hatchName.indexOf('妖鼠') >= 0 && F.hatchDesc.indexOf('战力') >= 0,
     '演出内容：灵兽图标 + 名牌 + 战力贡献（' + F.hatchDesc + '）');
  ok(F.hatchCrack === 'yes' && F.hatchBorn === 'yes', '裂壳（550ms）→ 诞生（950ms）时序到位');
  ok(F.hatchClosed === 'yes', '「收下它」可关闭演出');
  ok(chatCss.indexOf('.hatch-shell') >= 0 && chatCss.indexOf('hatchBorn') >= 0 &&
     chatCss.indexOf('hatchWobble') >= 0 && chatCss.indexOf('prefers-reduced-motion') >= 0,
     '演出样式（蛋壳/诞生/摇晃）与 reduced-motion 降级在位');
  /* 交易反馈（2026-10-24） */
  ok(chatCss.indexOf('.spend-float') >= 0 && chatCss.indexOf('spendRise') >= 0 &&
     chatCss.indexOf('.mk-row.flash') >= 0 && chatCss.indexOf('buyRing') >= 0,
     '交易反馈样式：花费浮字 + 购入行墨晕在位');
  ok(chatCss.indexOf('prefers-reduced-motion') >= 0 &&
     gameSrc.indexOf('spendFloat') >= 0 && gameSrc.indexOf('flashEl') >= 0,
     '交易反馈接线：spendFloat / flashEl 已在 game.js 落地');
  /* 信匣（2026-10-25） */
  ok(F.olMade >= 1 && F.olCap === '1' && F.olCapBig === '4',
     '信件数量随闭关时长分档（5 分钟 1 封 / 7 小时 4 封，实测 ' + F.olCap + '/' + F.olCapBig + '）');
  ok(F.olReal.indexOf('灵田') >= 0 || F.olReal.indexOf('猎得妖兽') >= 0 || F.olReal.indexOf('矿脉') >= 0,
     '信里只写这回真发生的事（' + F.olReal + '）');
  ok(F.olBox === 'yes' && F.olHas === 'yes' && F.olN >= 1 && F.olHead.indexOf(F.olN) === 0,
     '信匣挂进闭关归来弹窗（' + F.olHead + '）');
  ok(F.olSealTxt.indexOf('没拆') >= 0, '未拆的信不剧透内容（' + F.olSealTxt + '）');
  ok(F.olOpened === 'yes' && F.olBody.length > 0 && F.olGain === 'yes',
     '点开：展开素笺正文 + 添头入账（' + F.olBody + '）');
  ok(F.olNoRepeat === 'yes' && F.olNoRepeatV === 'yes', '同一封信重复点不再发奖（防连点刷）');
  ok(chatCss.indexOf('.off-letters') >= 0 && chatCss.indexOf('.ol-item.opened') >= 0,
     '信匣样式（信封 / 拆开后素笺）在位');
  /* 仙途道碑（2026-10-25） */
  ok(F.milesBox === 'yes' && F.milesN === F.milesTotal && Number(F.milesTotal) >= 25,
     '人物面板「仙途道碑」全部立出（' + F.milesN + '/' + F.milesTotal + '）');
  ok(F.milesLockMask !== '？？？' && F.milesHint.length > 0 && F.milesHiddenMask === '3',
     '未立之碑显示碑名 + 暗示（仅 3 块隐藏碑保留「？？？」，实测 ' + F.milesHiddenMask + '）');
  ok(F.milesCap === F.milesTotal && F.milesUpright.indexOf('vertical') >= 0,
     '碑林排版：每方碑各有碑额、碑名竖刻（' + F.milesUpright + '）');
  ok(F.milesHit === '1' && F.milesGot === '1' && F.milesReward === 'yes' && F.milesDoneTxt === '引气入体',
     '达成即自动立碑 + 发奖，不用点领取（' + F.milesDoneTxt + '）');
  ok(F.milesToast.indexOf('道碑') >= 0, '立碑提示走全局 toast（' + F.milesToast + '）');
  ok(+F.milesMultiHit >= 5 && F.milesToast2.indexOf('等') >= 0 && F.milesToast2.length <= 40,
     '连立多碑时 toast 只报前三个碑名 + 总数（' + F.milesToast2 + '）');
  ok(F.milesDotEl === 'yes' && F.milesDotOn === 'yes' && F.milesDotOff === 'yes',
     '人物入口红点：新碑亮 → 进面板看过即灭');
  ok(F.clockSkip === 'yes' && F.clockMsg.indexOf('更漏') >= 0,
     '更漏防篡改：存档时间在未来 → 离线收益作废（' + F.clockMsg + '）');
  ok(chatCss.indexOf('.miles{') >= 0 && chatCss.indexOf('.mile.lock') >= 0 &&
     chatCss.indexOf('.mile.done') >= 0, '道碑样式（网格 / 已立 / 未立）在位');
  /* 洞天开辟（第 70 节）：默认不改变旧口径，开启后逐项生效 */
  ok(F.dtCards === '5', '洞府页出五座洞天（' + F.dtCards + '）');
  /* W2（阶段一，2026-11-14 已批）：离线封顶 = max(12h, 8h×1.12^max(0,rank-14)) + 洞天加时。
     rank 15（8h×1.12=8.96h < 12h）改后取地板 12h = 43200 秒；改前是 32256 秒。 */
  ok(F.dtTotals0 === 'zero' && F.dtBag0 === 'yes' && F.dtOff0 === '43200',
     '未开洞天时所有钩子保持旧口径（总量 0 / 背包 20 / 离线 max(12h, 8h×1.12) = 12h）',
     [F.dtTotals0, F.dtBag0, F.dtOff0].join('/'));
  ok(F.dtSum0 === '', '未开洞天时合计行留白（不占高度、不出 "合计："）', F.dtSum0);
  ok(F.dtNoMat === 'yes' && F.dtNoMatCost === 'yes', '材料不够时按钮禁用，直接调也一块灵石不扣');
  ok(F.dtCostOwned.indexOf('仙羽 0/2') >= 0 && F.dtCostPoor.indexOf('（不足）') >= 0 &&
     F.dtCostOwned2.indexOf('仙羽 20/2') >= 0,
     '价目行写持有/所需（0/2 → 20/2），灵石不够直接标「不足」（' + F.dtCostOwned + '）');
  ok(F.dtCostAnchor === 'yes', '开辟价 = 一层灵石收入 × 0.30（与参悟同一把尺子）');
  ok(F.dtOpen === 'yes' && F.dtPaid === 'yes' && F.dtFirstMain === 'qing',
     'rank 15 开青华初辟：扣灵石、等级 +1、首座自动成主洞');
  ok(F.dtCraftUp === '1.5' && F.dtForgeClean === '0',
     '青华只加炼丹（主洞 ×1.5 → +1.5%），炼器不加（' + F.dtCraftUp + '/' + F.dtForgeClean + '）');
  ok(F.dtRankGate === 'yes' && F.dtLv2 === '2' && F.dtMainCraft === '3.0',
     '灵脉要 rank 17；二重主洞炼丹 +3%（' + F.dtLv2 + '/' + F.dtMainCraft + '）');
  ok(F.dtMainLocked === 'yes' && F.dtMainSwap === 'zhu' && F.dtSwapCraft === '2.0',
     '未开的洞天不能奉主洞；改奉后效果立即互换（青华回落 +2%）');
  ok(F.dtPowEff === '4' && F.dtPowUp === 'yes' && F.dtSwapPow === '6',
     '朱明战力：非主洞 +4% → 主洞 +6%（' + F.dtPowEff + '/' + F.dtSwapPow + '）');
  ok(F.dtBtnClick === '1' && F.dtBtnPaid === 'yes', '重绘后真点「开辟」仍生效（委托没丢）');
  ok(F.dtEnh === '72' && F.dtEnh3 === '80' && F.dtOre === '48/48',
     '素灵：强化成功率 +2%→+10%（72%→80%），矿石 −20%（' + F.dtOre + '）');
  ok(F.dtXuanRaw === '4.5/20' && F.dtBagCap === 'yes' && F.dtOffCap === '16200',
     '玄冥：离线 +4.5h / 背包 +20 格（' + F.dtXuanRaw + ' / ' + F.dtOffCap + 's）');
  ok(F.dtXuanMain === '6.75/30' && F.dtBagCapMain === 'yes',
     '奉玄冥为主洞：离线 +6.75h / 背包 +30（' + F.dtXuanMain + '）');
  ok(F.dtBagKeep === '50/20', '切主洞让背包上限下降时不删已有物品（只拦新拾取）', F.dtBagKeep);
  ok(F.dtFlat === '1.135/1.180;1.135/1.180',
     '黄庭修炼 +13.5% / 灵石 +18% 是平线，rank 15 与 25 完全一致（' + F.dtFlat + '）');
  ok(F.dtPanelMain === 'yes' && F.dtPanelEff.indexOf('炼丹成功率 +6%') >= 0 &&
     F.dtPanelEff.indexOf('失败返还 45%') >= 0,
     '面板：主洞有标记，效果文本写清 +6% / 返还 45%（' + F.dtPanelEff + '）');
  ok(F.dtPanelSum.indexOf('合计：') === 0 && F.dtPanelSum.indexOf('炼丹成功率 +6%') >= 0 &&
     F.dtPanelSum.indexOf('离线封顶 +4.5 小时') >= 0 && F.dtPanelSum.indexOf('背包 +20 格') >= 0,
     '合计行汇总五座当前生效值（主洞 ×1.5 已算进去）：' + F.dtPanelSum);
  ok(F.dtRefundRow.indexOf('失败返还 45% 材料（灵石不退）') >= 0,
     '青华主洞让返还率 45%，炼丹行按实际结算写成 45%（' + F.dtRefundRow + '）');
  ok(F.dtMile1 === 'yes' && F.dtMile2 === 'yes' && F.dtMileTotal === '35',
     '洞天两块道碑：洞天初开 / 五方洞天，MILE_TOTAL 到 35（第 109 轮 W1 加「塔下一线」一块 31→32，第 110 轮 W2 再加三条后续碑 32→35）');
  /* W1「塔底」：三条分支共用同一方碑，所以道碑表里只能多出这一条。 */
  ok(F.wfMileIds === 'm_foot:1', '塔底只在仙途道碑新增一条 m_foot，三条分支共用同一方碑（' + F.wfMileIds + '）');
  /* ===== W2「塔底余波」（第 110 轮）：三条终态各留一块后续碑 =====
     判据在表里写死 false —— 玩家不在塔里亲手点那一下，账本上就不许出现这三块碑。
     下面先把这条硬边界钉住（灌满条件连扫三轮），再钉门槛 / 互斥 / 一次结算 / 零新键。 */
  ok(F.w2Ids === 'm_foot_open@斗法,m_foot_self@斗法,m_foot_seal@斗法',
     'W2 只添这三块碑、且都归在「斗法」一组（' + F.w2Ids + '）');
  ok(F.w2AutoLit === 'open:0,self:0,seal:0',
     '三条各当一次终态、塔层顶格、连扫三轮：自动扫描一块也点不亮（判据 false 的硬证明）（' + F.w2AutoLit + '）');
  ok(F.w2Gate4 === 'open:none/空,self:none/空,seal:none/空',
     '塔只到第 4 层时三条线全不出现——门槛真的在挡（' + F.w2Gate4 + '）');
  ok(F.w2OneShort === 'none/空', '共撬线差一层（停在第 5 层）也不提前发（' + F.w2OneShort + '）');
  ok(F.w2AtNeed === 'open:open@1:碑座背面有一,self:self@1:石缝边压着半,seal:seal@1:封条的灰是新',
     '到各自门槛才登场：一次只冒本线那一条、只一枚按钮，三条痕迹字字不同（' + F.w2AtNeed + '）');
  const w2s = (F.w2SealFx || '').split('/');
  ok(w2s[0] === '1' && Number(w2s[1]) === Math.max(1, Math.floor(20 * Math.pow(1.15, Number(w2s[9])))) &&
     w2s[2] === '0' && w2s[3] === '0' && w2s[4] === '0' && w2s[5] === '0' && w2s[6] === '1' &&
     w2s[7] === '0' && w2s[8] === '封条按得',
     '真点「敲三下」：立 m_foot_seal、只发一笔小额悟道（20×境界系数），顿悟/道义/灵石/统计全零，立碑数 +1，按钮当场消失并换成常驻收尾句（' + F.w2SealFx + '）');
  const w2a = (F.w2SealAgain || '').split('/');
  ok(w2a[0] === w2s[1] && w2a[1] === w2s[6] && w2a[2] === '1',
     '同一枚按钮再点一次（重复进入 / 连点）：悟道没再涨、立碑增量还是第一次那一笔、点亮数仍一块（' + F.w2SealAgain + '）');
  const w2o = (F.w2OpenFx || '').split('/');
  ok(w2o[0] === '1' && w2o[1] === '1' &&
     Number(w2o[2]) === Math.max(1, Math.floor(30 * Math.pow(1.15, Number(w2o[5])))) &&
     w2o[3] === '0' && w2o[4] === '2',
     '共撬线走悟道（30×境界系数）且不动顿悟；封存线那块碑不会被顶掉——两块各记各的账（' + F.w2OpenFx + '）');
  const w2f = (F.w2SelfFx || '').split('/');
  ok(w2f[0] === '1' && w2f[1] === '6' && w2f[2] === '0' && w2f[3] === '3',
     '独撬线走的是另一条渠道（顿悟 +6、悟道值不再涨），三块碑同时成立才计 3（' + F.w2SelfFx + '）');
  ok(F.w2NoNewKey === 'same', '三块碑全走既有 miles 容器：S 顶层键集一个没多（零新存档字段）');
  ok(F.w2Back === '111/111/self', '写盘再读回：三块碑的账原样回来，终态仍是最后选定的那条（' + F.w2Back + '）');
  ok(F.w2OldSave === '000/self/n', '老档里没有这三个键 → 冷启读回一块没立，终态照旧、道碑清单不炸（' + F.w2OldSave + '）');
  ok(F.w2Restored.indexOf('open/') === 0 && FSP('w2Restored', '/', 2) === '0',
     'W2 用例收尾把 base 档写回并 reload：W1 的账没被带脏（' + F.w2Restored + '）');
  /* 山门气象（2026-10-25） */
  ok(F.wxCard === 'yes' && F.wxSlots === '4', '「山门气象」独立页四个挂点（统计/名录/动向/状态）');
  ok(F.zongHubCells === '5' && F.zongHubCards === '0',
     '宗门拆页：hub 五格（弟子 / 议事 / 气象 / 探索 / 互助），气象不再和互助上下堆（格 ' + F.zongHubCells + ' · 卡 ' + F.zongHubCards + '）');
  ok(String(F.zongHubSealGate).indexOf('·') >= 0, '山门弟子格朱砂印报品阶与名册（' + F.zongHubSealGate + '）');
  ok(F.wxFallback.indexOf('山门气象') >= 0, '未连服务时山门气象给降级文案，不留空白（' + F.wxFallback + '）');
  ok(F.wxPanelApi === 'yes' && F.wxStatsState === 'yes', 'SECT.panelOpen 接口 + stats 快照进 _state()');
  ok(chatCss.indexOf('.sc-stats') >= 0 && chatCss.indexOf('.sc-rchip') >= 0 &&
     chatCss.indexOf('.sc-ev-settle') >= 0 && chatCss.indexOf('.sc-stat') >= 0,
     '山门气象样式在位：四格统计 / 在场名录 / 动向时间轴');
  ok(gameSrc.indexOf('renderWeather') >= 0 && gameSrc.indexOf('fmtAgo') >= 0 &&
     gameSrc.indexOf("get('stats'") >= 0, '山门气象接线：renderWeather / fmtAgo / stats 拉取在 game.js');
  ok(srvSrc.indexOf("action === 'stats'") >= 0 && srvSrc.indexOf('SEEN_ONLINE_MS') >= 0 &&
     srvSrc.indexOf('pushEvent') >= 0, '服务端 stats 接口 + 在场判定 + 事件流在位');
  /* 宗门服务地址解析（2026-10-26）：以前默认只连本机 localhost:8787，等于人人各玩各的 */
  ok(F.candApi === 'true', 'SECT 暴露 _candidates / _firstAlive 两个测试口');
  /* 2026-11-06 B-35 裁定：无配置的 file:// 双击运行**不发起宗门探活**（返回空候选），
     以免每次开页都向 localhost:8787 打一条 ERR_CONNECTION_REFUSED。
     本断言原写于 B-35 之前（期望 http://localhost:8787），B-35 落地后未同步 → 长期假红。
     现已对齐裁定：空候选 = 不探活。file:// 下「已配置地址仍探活」由 candDupe 继续守护；
     完整五场景对照见 tools/b34b35-candidates-test.mjs 与 B34B35_VERIFICATION.md。 */
  ok(F.candFile === '',
     'B-35：file:// 打开且没存过地址 → 不探活（空候选）', F.candFile);
  ok(F.candQuery === 'https://t.example/aa,http://old.example,https://game.example,http://localhost:8787',
     '候选优先级 ?sect= → 手填 → 官方 → 同源 → 本机，尾斜杠削掉', F.candQuery);
  ok(F.candSame === 'https://game.example,http://localhost:8787',
     '发到公网上会去试同域服务（以前只在 localhost 才试 → 永远「山门未开」）', F.candSame);
  ok(F.candDupe === 'http://localhost:8787', '同一地址重复出现只留一个，不会把死地址探两遍', F.candDupe);
  ok(F.aliveNone === '', '并发探活全灭时返回空、不抛不挂', JSON.stringify(F.aliveNone));
  ok(F.sectTimer === 'true',
     '探活全灭也把轮询挂上（服务后起来时页面自己会连，不用玩家手点重连）', F.sectTimer);
  ok(F.sectOff.indexOf('山门未开') >= 0 && F.sectOff.indexOf('每 25 秒会自己再试一次') >= 0 &&
     F.sectOff.indexOf('sect-server.js') < 0,
     '连不上时的文案面向玩家：不再教人跑 node 命令，并说清会自动重试', F.sectOff);
  ok((F.sectStateTxt || '').indexOf('未连接') === 0 && (F.sectLabel || '').indexOf('宗门服务地址') === 0 &&
     (F.sectLabel || '').indexOf('默认本机') < 0,
     '设置里写明连接状态与自动挑选顺序', F.sectStateTxt + ' / ' + F.sectLabel);
  /* 天机阁双扣也要有花费浮字（2026-10-25 补） */
  ok(gameSrc.indexOf("spendFloat('-' + fmt(ps) + ' 灵石'") >= 0 &&
     gameSrc.indexOf("spendFloat('-' + fmt(pw) + ' 悟道'") >= 0 &&
     chatCss.indexOf('.spend-float.over') >= 0,
     '天机阁双扣浮字：灵石 + 悟道值两笔各飘一字（over 变体浮到揭晓弹窗之上）');
  ok(F.scBreak === 'true' && F.scActs === '2' && F.noHerbBtn === 'ok', '顶部突破按钮 + 主界面仅打坐/历练两按钮（采药/顿悟已删）');
  ok(F.sideActs === '5', '修炼页行动卡 5 项（4 个免费日课 + 参悟）', F.sideActs);
  ok(F.ponderCards === '5' && F.ponderWide === '1',
     '参悟独占一整行（视觉上与四个免费日课分开）', F.ponderCards + '/' + F.ponderWide);
  ok(F.ponderPoor === '0', '灵石不足时不扣次数（先验钱再记账）', F.ponderPoor);
  ok(F.ponderCostUses === 'yes', '参悟按 ponderCost() 实扣灵石');
  ok(Number(F.ponderPct) > 0.028 && Number(F.ponderPct) < 0.032,
     '一次参悟 = 当前层需求 ×3%', (100 * Number(F.ponderPct)).toFixed(2) + '%');
  ok(Number(F.ponderShare) > 0.075 && Number(F.ponderShare) < 0.085,
     '定价锚定"一层灵石收入的 8%"（任何境界贵得一样，不随境界漂移）',
     (100 * Number(F.ponderShare)).toFixed(1) + '%');
  ok(F.qiMotes === '8', '灵气汇聚特效 8 枚光点（' + F.qiMotes + '）', F.qiMotes);

  // 立绘选角
  ok(F.heroImgs === '2', '男女两套立绘素材（' + F.heroImgs + '）', F.heroImgs);
  ok(F.heroOfMale === 'ui/avatar/hero_male.png' && F.heroOfFemale === 'ui/avatar/hero_female.png',
     'heroImg() 按性别取对应立绘（' + F.heroOfMale + ' / ' + F.heroOfFemale + '）');
  ok(F.genderOfM === 'male/female', 'genderOf() 把 m/f 映射成 male/female（' + F.genderOfM + '）', F.genderOfM);
  ok(F.sexOfMale === 'm/f', 'sexOf() 把 male/female 映射回 m/f（老档兼容）', F.sexOfMale);
  ok(F.pickN === '2' && F.pickImgs === '2', '创角界面并排展示 2 张立绘（' + F.pickN + '/' + F.pickImgs + '）');
  ok(F.pickMImg === F.heroOfMale && F.pickFImg === F.heroOfFemale, '两张立绘各挂对的图');
  ok(F.pickActive0 === 'm', '默认选中男修');
  ok(F.pickActive1 === 'f', '点女修后高亮切过去');
  ok(F.pickActiveN === '1', '任何时候只有一个选中态');
  /* 道途必选（组 A/B 根因）：按钮在位 + 点中即回显；不点则 confirmChar 在 game.js:11579 挡回 */
  ok(F.cargPathBtn !== 'MISSING' && F.cargPathPicked === F.cargPathBtn,
     '创角道途四选一：容器在位、点中即选中并回显（' + F.cargPathBtn + ' → ' + F.cargPathPicked + '）', F.cargPathBtn + '/' + F.cargPathPicked);
  ok(F.cargPathPicked !== 'none' && F.modalClosed === 'hidden',
     '选了道途创角才放行（弹窗关得掉 = finishBoot 跑得下去 = Story 才可能 init）');
  ok(F.genderSaved === 'female', '确认后 gender 存进 playerState（' + F.genderSaved + '）', F.genderSaved);
  ok(F.sexSaved === 'f' && F.nameSaved === '碧落', 'sex 与道号一并落盘');
  ok(F.modalClosed === 'hidden', '确认后创角弹窗关闭');
  ok(F.sceneHeroSrc === F.heroOfFemale, '主界面中心立绘按 gender 显示女修（' + F.sceneHeroSrc + '）', F.sceneHeroSrc);
  ok(F.sceneBeam === 'true' && F.sceneForm === 'true', '立绘带阵法光柱 + 发光太极盘');
  ok(F.sceneHeroSrc2 === F.heroOfMale, '切回男修后主界面立绘同步换（' + F.sceneHeroSrc2 + '）', F.sceneHeroSrc2);
  ok(F.miniHeroSrc === F.heroOfMale, '顶栏头像与主界面立绘同源');
  ok(F.genderFromSex === 'male', '老档只有 sex 也能补出 gender');
  ok(F.dongShown === 'shown', '切洞府页成功');
  /* ---- 第 87 轮 · 真二级路由：hub 一格一功能，点进去只渲染那一功能 ---- */
  ok(F.caveNavN === '8', '洞府 hub 八格入口（' + F.caveNavN + '）');
  ok(F.hubCards === '1', 'hub 页不再上下堆八个分区，只剩卷首小景一张卡（' + F.hubCards + '）');
  ok(F.hubSealField === 'Lv.0' && F.hubSealDT === '0/5',
     '入口格的朱砂印报当前等级：灵田 ' + F.hubSealField + ' · 洞天 ' + F.hubSealDT);
  ok(F.subRoute === 'dong_alchemy', '点「炼丹房」这一格 → 路由到独立页（当前页=' + F.subRoute + '）');
  ok(F.subDepth === '2', '子页压在 hub 之上（栈深 ' + F.subDepth + '）');
  ok(F.subCards === '1' && F.subOnly === 'alone',
     '炼丹页里只有炼丹一张卡，灵田/矿脉/炼器/法宝/洞天/设施都不在场（' + F.subOnly + '）');
  ok(F.subHasAlch === 'yes', '炼丹页 own 的 #xx-alchemy-sec 与配方行都渲染出来了');
  ok(F.backHub === 'hub' && F.backSceneYet === 'no', '子页按 ← 先回 hub，没有一步跳回场景');
  ok(F.backScene === 'yes', 'hub 上再按 ← 才回主场景');
  ok(F.subPagesAlone === 'ok', '八个独立页逐个打开：一页一张卡，别的功能一张都不漏进来', F.subPagesAlone);
  /* ---- 第 86 轮 · 洞府界面重做（上）：材质是否真的挂上，全部按计算样式判 ---- */
  ok(F.caveHeroBg === 'ok' && Number(F.caveHeroH) >= 190,
     '洞府卷首是水墨小景横卷（scene.jpg 铺底，实测高 ' + F.caveHeroH + 'px），资源账压在下缘纸色带上', F.caveHeroBg);
  ok(F.caveCardPaper === 'ok' && F.caveCardEdge === 'ok',
     '洞府卡片换成手绘纸底 + 1px 墨金边 + 16px 卷卡圆角（不再是 5px 小圆角米色方块）',
     F.caveCardPaper + ' / ' + F.caveCardEdge);
  ok(F.hubIcN === '8' && F.hubIcLoaded === '8',
     'hub 八格各挂一枚水墨题签且全部加载成功（naturalWidth>0，' + F.hubIcLoaded + '/' + F.hubIcN + '）');
  ok(Number(F.caveTagLoaded) >= 1 && F.caveTagLoaded === F.caveTagN,
     '子页页眉题签加载成功（' + F.caveTagLoaded + '/' + F.caveTagN + '）');
  ok(F.hubCellPaper === 'ok', '入口格与卡片同一张宣纸底纹，不是一色填充', F.hubCellPaper);
  ok(F.caveH2Tick === 'gone' && F.caveH2Rule === 'ok',
     '卡标题改用一道 1px 墨金底线，不再 3px 渐变竖条', F.caveH2Tick + '/' + F.caveH2Rule);
  ok(F.caveNavSeal === 'ok', '入口格的朱砂印是渐变实底（不再是淡米胶囊）');
  ok(F.caveResEdge === 'ok', '资源账条左侧一道墨线立面，五个数不再像未加载的骨架屏', F.caveResEdge);
  ok(F.cavePlotSoil === 'ok', '田块改手绘木纹（soil.jpg 只作反例，不再铺田）');
  ok(F.caveRipeAnim === 'caveRipe',
     '成熟田块真的会呼吸（animationName=' + F.caveRipeAnim + '；原 plotPulse 三个关键帧同值＝没有动画）');
  ok((function(){
    const s = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
    const cv = fs.readFileSync(path.join(ROOT, 'js', 'views', 'cave.js'), 'utf8');
    return s.indexOf(':is(#page-dong,.ink-page) .plot.ripe{ animation:none; }') >= 0 &&
           s.indexOf(':is(#page-dong,.ink-page) .card.wide#xx-mine') >= 0 &&
           cv.indexOf('class="card wide" id="xx-mine"') >= 0 &&
           cv.indexOf('card stretch') < 0;
  })(), '新动画有 prefers-reduced-motion 降级；矿脉改横条卡（stretch 去齐右列六张丹方＝一柱死白，已废）');
  ok(F.towerBld === 'true', '镇妖塔建筑入口已实装');
  ok(F.towerFailRun === 'no', '战力不足时入塔不占局（不留进行中的 run）');
  ok(F.trunOpen === '0/3', '入塔即开一局五步：第 0 步、三扇门（' + F.trunOpen + '）');
  ok(F.trunDoors === 'elite,fight,vault', '每步三扇门不重样（镇守/精锐/藏宝）');
  ok(F.trunBrk === '1', '每局破防一张（' + F.trunBrk + '）');
  ok(F.towerAfterWin === '2of1', '镇守门通关：层数 1→2、历史最高 1（' + F.towerAfterWin + '）');
  ok(F.towerFailFloor === '5', '战力不足不推层（仍第 ' + F.towerFailFloor + ' 层）');
  ok(/实力不济/.test(F.towerFailMsg), '战力不足提示「实力不济，请先去提升」');
  ok(Number(F.towerWinStone) > 0, '通关灵石入账（' + F.towerWinStone + '）');
  ok(F.towerWinBag === '2', '通关材料 + 第 1 层装备（青锋剑）进背包（' + F.towerWinBag + ' 件）');
  ok(/第 1 层/.test(F.towerWinMsg), '通关提示写清第几层（' + F.towerWinMsg + '）');
  ok(F.towerTopbar !== '0' && F.towerTopbar !== '', '通关后顶部灵石栏已刷新（' + F.towerTopbar + '）');
  ok(F.trunStep1 === '1', '走一步就记一步（' + F.trunStep1 + '/5）');
  ok(F.vaultFloor === 'same', '藏宝室不推层（塔层原地不动）');
  ok(F.vaultHerb === 'up' && F.vaultOre === 'up', '藏宝室给灵草与矿石');
  ok(F.vaultCharm === '1', '藏宝室必得一枚塔内符（' + F.vaultCharm + '）');
  ok(Number(F.eliteStone) > 0 && Number(F.eliteBag) === 3, '精锐门：灵石更厚、材料 ×2 + 装备（' + F.eliteStone + ' / ' + F.eliteBag + '）');
  ok(F.trunDone === 'closed', '五步走完自动出塔（不留悬着的局）');
  ok(F.trunLastWhy === 'done/5', '上一局账本记满五步（' + F.trunLastWhy + '）');
  ok(F.eliteLocked === 'yes', '战力差太远的精锐门按不动');
  ok(/差/.test(F.eliteLockedTxt), '按不动的门照样写「差多少」（不把路藏起来）');
  ok(F.skBtns === '2' && F.skHidden === 'no', '战斗里按 opts.skills 渲染主动技条（' + F.skBtns + ' 个）');
  ok(F.skSwordLeft === '1', '剑势点一次减一次（剩 ' + F.skSwordLeft + '）');
  ok(F.skBreakCalled === 'yes' && F.skBreakUsed === 'yes', '破防按下即回调、并标成用掉');
  ok(F.skSkipWin === 'yes', '技能条的场子跳过照常判胜');
  ok(F.skEmpty === 'hidden', '没配技能的场子整条隐藏（论剑/秘境/心魔不受影响）');
  ok(F.battleModalInDom === 'true', '战斗演出弹窗 #battle-modal 已就位');
  ok(F.battleShown === 'yes', '开演出时点挑战 → 弹出全屏战斗演出');
  ok(Number(F.battleFloor) === 3, '演出填充当前层数（第 ' + F.battleFloor + ' 层）');
  /* 第 93 轮：论剑台 / 秘境也上演出（制作人原话「只有挑战没有动画」） */
  const B93 = JSON.parse(F.bt93 || '{}');
  ok(B93.secModal === 'yes' && B93.arModal === 'yes',
     '秘境、论剑点「挑战」同样弹出整场演出（' + B93.secModal + '/' + B93.arModal + '）');
  ok(/第 1 层/.test(B93.secTitle) && !/镇妖塔/.test(B93.secTitle),
     '秘境演出的题签换成本卷层数，不套镇妖塔的壳（' + B93.secTitle + '）');
  ok(/论剑台/.test(B93.arTitle) && !/镇妖塔/.test(B93.arTitle),
     '论剑演出的题签写对手道号（' + B93.arTitle + '）');
  ok(/beast_/.test(B93.secMobImg) && /hero_|av_/.test(B93.arMobImg) && /妖/.test(B93.secMob),
     '秘境对手用妖兽立绘、论剑对手用修士立绘（' + B93.secMobImg + ' / ' + B93.arMobImg + '）');
  ok(B93.afterSprint === 'yes', '连点五个对手后镇妖塔仍能开演（接管没把 btBusy 卡死）');
  ok(B93.animOffModal === 'no', '演出开关关掉时三处都不弹窗（CI 直接结算）');
  ok(B93.lootRows === 2 && (B93.lootTxt || '').indexOf('undefined') < 0 && /声望/.test(B93.lootTxt || ''),
     '论剑结算行只有灵石+声望两行，没有材料的空位（' + B93.lootTxt + '）');
  ok(B93.sweepTowerModal === 'no' && B93.sweepSecretModal === 'no',
     '两处扫荡仍不弹演出（一次结十层的高频操作，只飘字）');
  ok(F.battleMobNamed === 'yes' && F.btMobAvImg === 'yes', '演出守卫妖兽用真形象图（BEASTS[].img，不再是名首字占位框）');
  ok(F.btPavImg === 'yes' && F.btPavOfSex === 'hero_male.png',
     '玩家形象按性别取立绘（当前 ' + F.btPavOfSex + '）');
  ok(F.btMHueVar === 'yes' && F.btWrapShadow === 'yes',
     '换色皮与投影挂在外层壳上（--hue → hue-rotate + drop-shadow 都在计算样式里）');
  ok(F.btHitAnim === 'btHitGlow' && F.btWrapWhileHit === 'yes',
     '壳/芯解耦生效：本体正播 ' + F.btHitAnim + '，壳上的基线滤镜一帧都没被顶掉');
  ok(F.btBossCls === 'false', '第 ' + F.battleFloor + ' 层非首领 → 不加 .boss（首领图会放大）');
  ok(F.btHaloN === '2' && F.btTrailN === '2', '脚下灵光盘 ×2 + 血条掉血残影 ×2 就位（' + F.btHaloN + '/' + F.btTrailN + '）');
  ok(F.btBarLow === 'false', '满血时血条不带 .low（残血才闪）');
  ok(F.btBurstAnim === 'btBurst' && F.btBurstRays === 'yes' && F.btBurstRing === 'yes',
     '命中迸光真能亮：动画 ' + F.btBurstAnim + ' + 放射线 ' + F.btBurstRays + ' + 环形遮罩 ' + F.btBurstRing);
  ok(F.battleSlash === 'yes', '纯 CSS 半月剑光元素就位');
  ok(F.btArc === 'yes' && F.btVsTxt === '对决' && Number(F.btVsSealOp) >= 0.5,
     '中央剑气弧 + 「对决」朱砂印就位（印的不透明度 ' + F.btVsSealOp + '，旧版 VS 只有 .2 等于看不见）');
  ok(/\.bt-vs-txt\{[^}]*white-space:nowrap/.test(chatCss),
     '「对决」印不许折行（390 窄屏实拍过：不加 nowrap 会竖排成「对/决」两行）');
  /* 第 84 轮 · 战斗面板：源码侧锁住几处「一改就退回旧观」的要点 */
  ok(chatCss.indexOf('.bt-avatar') < 0 && htmlSrc.indexOf('bt-avatar') < 0 && gameSrc.indexOf('bt-avatar') < 0,
     '旧的 .bt-avatar 文字占位框已全量移除（CSS / HTML / JS 三处都不剩）');
  ok(/\.battle-stage\.impact \.bt-slash\{[^}]*animation-play-state:paused/.test(chatCss),
     '命中定格：.impact 期间剑光动画真暂停（不是只加了个 class）');
  ok(gameSrc.indexOf("stage.classList.add('impact')") >= 0 && gameSrc.indexOf("stage.classList.remove('impact')") >= 0,
     'JS 侧确实挂/摘 .impact（定格只持续 110ms）');
  ok(/\.bt-dmg-float\.me/.test(chatCss) && gameSrc.indexOf("' me'") >= 0,
     '伤害浮字分「我打的 / 打我的」两色（玩家侧 .me）');
  ok(/\.bt-bar\.low/.test(chatCss) && gameSrc.indexOf(".classList.toggle('low'") >= 0,
     '残血血条脉冲：CSS 规则与 JS 开关都在');
  ok(/\.bt-side\.wind \.bt-fig/.test(chatCss) && gameSrc.indexOf("btRestartAnim(pSide, 'wind')") >= 0,
     '出招有起手回摆（.wind 预备帧）');
  ok(F.aura0 === 'default' && F.aura1 === 'arc-zixiao' && F.aura2 === 'arc-chiyan' && F.aura3 === 'default',
     '三流派剑意循环切换（青莲 → 紫霄 → 赤炎 → 青莲）');
  ok(F.auraArc1.indexOf('arc-zixiao') >= 0 && F.auraArc0.indexOf('arc-') < 0,
     '流派 class 实时落到 #bt-arena（' + F.aura1 + '）');
  ok(Number(F.auraSaved) === 0, '剑意选择存盘记忆（swordAura=' + F.auraSaved + '）');
  /* ---- 第 94 轮 · 剑芒 / 剑气（制作人：「那些剑芒、剑气都给我调整一下」） ---- */
  const arcBreathe0 = (/@keyframes arcBreathe\{\s*0%,100%\{[^}]*opacity:([\d.]+)/.exec(chatCss) || [])[1];
  const arcRR = (F.arcEllipse || '').split('x');
  ok(arcRR.length === 2 && parseFloat(arcRR[1]) > parseFloat(arcRR[0]) * 1.3
     && /\.bt-vs-arc::before\{[^}]*mask:radial-gradient\(ellipse/.test(chatCss),
     '中央剑气弧的环带是**竖长椭圆** ' + F.arcEllipse + '（旧版 closest-side 正圆 → 上下左右一律 9.4px 等宽，读作加载转圈）');
  ok(/--arc-tip:#a9e2ee/.test(chatCss) && !/#e2f5f8/.test(chatCss),
     '青莲剑意的最亮停从 #e2f5f8（近乎白，落在 #f7f3e9 宣纸上等于没有）压到 #a9e2ee');
  ok(Number(arcBreathe0) >= 0.7,
     '呼吸动画谷值 ' + arcBreathe0 + ' ≥ .7（旧版 .55，四分之一个周期里弧是半透明的）');
  ok(F.auraShape0 !== F.auraShape1 && F.auraShape1 !== F.auraShape2 && F.auraShape0 !== F.auraShape2,
     '三流派各有一档月牙形状（青莲 ' + F.auraShape0 + ' / 紫霄 ' + F.auraShape1 + ' / 赤炎 ' + F.auraShape2 + '，旧版三档只换颜色）');
  const breathe = ['--arc-breathe:3\\.6s', '--arc-breathe:2\\.3s', '--arc-breathe:4\\.6s'];
  ok(breathe.every(b => new RegExp(b).test(chatCss)), '三流派呼吸三档速（2.3s 紫电急 / 3.6s 青莲 / 4.6s 赤炎缓）');
  const slashW = (F.slashBorder || '').split('/');
  ok(slashW.length === 2 && parseFloat(slashW[0]) > parseFloat(slashW[1]) * 2,
     '出鞘剑芒收尖：上嘴 ' + slashW[0] + ' 厚、右嘴 ' + slashW[1] + ' 薄（旧版四条边一律 14px，是一根等宽弯管）');
  ok(/^btSlashFly2@/.test(F.slashKid || ''), '辅芒 .bt-slash-b 跟着主芒一起飞（' + F.slashKid + '）');
  ok(/\.bt-slash\.fly \.bt-slash-b\{[^}]*animation:btSlashFly2/.test(chatCss)
     && /\.battle-stage\.impact \.bt-slash \.bt-slash-b\{[^}]*animation-play-state:paused/.test(chatCss),
     '辅芒的挂点与定格都在（命中那 110ms 主辅两道一起停，只停主芒会穿帮）');
  ok(htmlSrc.indexOf('bt-slash-b') >= 0, '辅芒在 index.html 里是实打实的节点，不是 CSS 凭空造的');
  ok(/100%|\/\s*/.test(F.battleHpInit) && F.battleHpInit !== '', '双方满血开战（' + F.battleHpInit + '）');
  ok(F.battleClosedAfterSkip === 'yes', '点「跳过」关闭演出');
  ok(Number(F.towerAfterSkip) === 4, '跳过后层数照常推进（' + F.towerAfterSkip + '）');
  ok(/第 \d+ 层/.test(F.battleLogWin), '跳过结算走胜利入账（含掉落日志）');

  /* ===== 第 84 轮收尾：战斗时序单一真值 + 壳/芯解耦的不变量 =====
     这两条都是「测试全绿也照样会坏」的隐患，所以拿源码当被测对象锁住。 */
  const tlLine = (gameSrc.match(/^\s*const BT_TL = \{.*\};\s*$/m) || [])[0];
  ok(!!tlLine, '战斗时序是 game.js 里唯一那行单行字面量 const BT_TL（截图脚本按此推算点位）');
  let TL = {};
  try { TL = JSON.parse(tlLine.slice(tlLine.indexOf('{'), tlLine.lastIndexOf('}') + 1)); } catch (e) {}
  ok(['open', 'wind', 'lunge', 'slash', 'impact', 'tail', 'mobGap', 'plyGap', 'loot', 'hold']
      .every(k => typeof TL[k] === 'number'),
     'BT_TL 十个字段齐全且可 JSON.parse（shot_battle.js 用的就是这段解析，缺一个它就直接抛）');
  const turnBody = gameSrc.slice(gameSrc.indexOf('function playerTurn'), gameSrc.indexOf('function winShow'));
  ok(turnBody.indexOf('BT_TL.wind') >= 0 && turnBody.indexOf('BT_TL.impact') >= 0 &&
     !/\}\s*,\s*\d+\s*\)/.test(turnBody.replace(/BT_TL\.\w+/g, '')),
     '两个回合函数里每段 btWait 都取 BT_TL，没有残留裸毫秒数（有裸数就等于藏了第二份真值）');
  const shotSrc = fs.readFileSync(path.join(ROOT, 'shot/shot_battle.js'), 'utf8');
  /* 只看 shot(...) 调用行：整份文件扫会把注释里的反例（VT(8000) 这种"以前错在哪"）也算进来，
     守卫就会对着解释自己的注释报红。 */
  const shotCalls = shotSrc.split('\n').filter(l => /^\s*shot\(/.test(l)).join('\n');
  ok(shotSrc.indexOf('const BT_TL') >= 0 && !/VT\(\d{4,}\)/.test(shotCalls) && !/RW\(\d{4,}\)/.test(shotCalls) &&
     shotCalls.indexOf('pk(1) + 120') >= 0,
     '截图脚本从 BT_TL 推导点位（解析失败即 throw），调用行里不再有 VT(4150)/RW(2760) 这类写死的毫秒');
  ok(/\.bt-figwrap\{[^}]*hue-rotate\(var\(--hue\)\)/.test(chatCss) &&
     /\.bt-figwrap\{[^}]*drop-shadow/.test(chatCss),
     '基线投影与换色皮都在外层壳 .bt-figwrap 上（芯只负责动）');
  const hitGlow = (chatCss.match(/@keyframes btHitGlow\{[\s\S]*?\n  \}/) || [''])[0];
  ok(hitGlow.length > 0 && hitGlow.indexOf('var(--hue)') < 0 &&
     hitGlow.indexOf('0 10px 16px') < 0,
     'btHitGlow 各帧不许再重抄基线滤镜（重抄 = 退回「漏一帧掉阴影」那个坑）');
  /* 第 84 轮返工第二条：淡出是 CSS 动画，不吃 --virtual-time-budget，
     所以「淡出结束后」这一帧必须走真实时钟。用 VT 拍会得到一张看着也挺对的半途帧。 */
  ok(/shot\('bt-win'[^\n]*RW\(/.test(shotSrc) && !/shot\('bt-win'[^\n]*VT\(/.test(shotSrc),
     'bt-win 走真实时钟拍（淡出终态属动画相位，虚拟时间拍不到）');
  ok(/shot\('bt-boss'[^\n]*VT\(/.test(shotSrc) && /shot\('bt-hue'[^\n]*VT\(/.test(shotSrc) &&
     /shot\('bt-small'[^\n]*VT\(/.test(shotSrc),
     '纯 DOM 状态帧（首领档 / 换色皮 / 窄屏）仍走虚拟时间，不必等真实秒数');
  ok(chatCss.indexOf('.bt-side.hurt .bt-fig{ filter:saturate') >= 0 ||
     /\.bt-side\.hurt \.bt-fig\{[^}]*saturate/.test(chatCss),
     '残血压暗只写在本体上，不需要重复 hue-rotate/drop-shadow');

  // ===== 淡墨云雾背景（宣纸晕染氛围层） =====
  ok(F.mist === 'yes', '淡墨云雾层 .scene-mist 已就位');
  ok(F.mistZ === '1' && F.mistPe === 'none',
     '云雾层 z-index=' + F.mistZ + ' 低于全部 UI 且 pointer-events:none（不挡点击、不影响阅读）');
  ok(F.mistFilter === 'none', '云雾层未使用 filter:blur（软边全靠渐变色标，省掉全屏重绘）');
  ok(F.mistUrl === 'no' && Number(F.mistGrad) >= 12,
     '三层合计 ' + F.mistGrad + ' 组 radial-gradient、零外部图片');
  ok(F.mistAnim === 'mistDrift' && F.mistBeforeAnim === 'mistBreathe' && F.mistAfterAnim === 'mistRise',
     '三层各跑一条独立动画：漂移 / 呼吸 / 上浮');
  ok(parseFloat(F.mistDur) >= 60, '主漂移周期 ' + F.mistDur + '（≥60s，缓慢不抢注意力）');
  ok(Math.abs(Number(F.mistOpTown) - 0.28) < 0.02 && Math.abs(Number(F.mistOpCave) - 0.92) < 0.02,
     '城镇云雾降到 0.28（降对比度已由米色遮罩接管）/ 洞府 0.92（米黄纸面补气韵）：' + F.mistOpTown + ' vs ' + F.mistOpCave);

  // ===== 修仙法宝功能入口（器物化城镇）=====
  ok(F.sealN === '10', '城镇 10 件法宝全部就位（' + F.sealN + '）');
  ok(F.sealOverlap === '0', '法宝两两不重叠（实测重叠数 ' + F.sealOverlap + '）');
  ok(F.sealInView === 'ok', '法宝全部落在可视区内，无出屏');
  ok(F.sealBlockHit === '0', '法宝不压顶栏 / 底部 Tab / 左右侧栏（碰撞数 ' + F.sealBlockHit + '）');
  ok(F.sealTier === 'ok', '主/次两档尺寸不倒挂：主档最宽 > 次档最窄（主 ' + F.sealLarge + ' 件 / 次 ' + F.sealSmall + ' 件）');
  ok(F.sealLarge === '3' && F.sealSmall === '7',
     '主功能 3 件（坊市/镇妖塔/藏经阁）/ 次功能 7 件：' + F.sealLarge + ' vs ' + F.sealSmall);
  ok(F.sealTxtFit === '0', '牌名不顶出框子（越界 ' + F.sealTxtFit + ' 片）');
  ok(String(F.artFont).indexOf('KaiTi') >= 0 || String(F.artFont).indexOf('STKaiti') >= 0,
     '牌名用楷体（' + F.artFont + '）');
  ok(F.artWriting === 'horizontal-tb',
     '牌名横排压在立绘下方（writing-mode = ' + F.artWriting + '，第 88 轮起不再竖刻在物件上）');
  ok(F.artShapeN === '10' && F.artImgN === '10' && F.artUrlKinds === '10',
     '10 座建筑各挂一张不同的水墨立绘：本体 ' + F.artShapeN + ' / 命中 bld_ ' + F.artImgN + ' / 去重 ' + F.artUrlKinds);
  ok(F.artLabelBad === '0', '纸签不顶穿立绘、牌名不超出纸签（越界 ' + F.artLabelBad + ' 处）');
  ok(F.artHoverGlow === 'yes', 'hover 灵气托起 + drop-shadow 微光规则在样式表中');
  ok(String(F.overlayBg).indexOf('rgba(253, 251, 247,') >= 0,
     '城镇背景仍挂半透明米色遮罩（压山水对比度，法宝才浮得出）');
  ok(F.sealAnimName === 'artFloat' && Number(F.sealDurMin) >= 8 && Number(F.sealDurKinds) >= 3,
     '悬浮动效：' + F.sealAnimName + ' 最慢档 ' + F.sealDurMin + 's，' + F.sealDurKinds + ' 种周期错开相位');

  // ===== 世界频道（传音：联机任务 1） =====
  ok(F.chatView === 'yes', '传音面板 VIEWS.chat 就位（router 动态注入 #panel-host）');
  ok(F.chatInput === 'yes', '输入框 + 传音按钮随面板注入');
  ok(F.chatRendered === 'yes', '消息流已渲染（未连接时显示空态提示）');
  ok(F.chatApi === 'yes', 'SECT 暴露 chatBind / chatOpen / chatClose / chatSend 四接口');
  ok(F.chatUnread === 'yes', '未读计数进 _state()（驱动侧栏红点）');
  ok(F.chatDot === 'yes', '侧栏传音按钮带未读红点元素 #sc-chat-dot');
  ok(srvSrc.indexOf('/api/chat/') >= 0 && srvSrc.indexOf('chatPushSys') >= 0 && srvSrc.indexOf('CHAT_CD') >= 0,
     '服务端挂世界频道：history / send / 冷却 2.5s / 护法自动播报');
  ok(chatCssOk, '传音面板水墨样式：宣纸浮牌 + 朱砂自牌 + 系统播报 + 红点');

  // 灵田（种田闭环）
  ok(F.field0 === '0', '灵田初始 0 级');
  ok(F.field1 === '1', '开垦后灵田 1 级');
  ok(F.stoneAfterField === '992', '开垦消耗 8 灵石（1000→992）', F.stoneAfterField);
  ok(F.fieldRate0 === '0 灵石/分', '灵石自动凝结随等级显示（' + F.fieldRate0 + '）');
  ok(F.fieldRate6 === '12 灵石/分', '6 级灵田每分钟自动凝 12 灵石（' + F.fieldRate6 + '）');
  ok(F.fieldPlots6 === '6/9', '6 级灵田 = 6/9 块田（' + F.fieldPlots6 + '）');
  ok(F.plots6 === '6', '田块网格渲染 6 块田（' + F.plots6 + '）');
  ok(F.chipN === '3', '三种作物可选：灵草/百年灵草/万年灵草（' + F.chipN + '）');
  ok(F.chipLocked === 'herb100', '百年灵草需灵田 10 级解锁（锁 ' + F.chipLocked + '）');
  ok(F.planted === '6', '一键播种 6 块田');
  ok(F.ripeTiles === '6', '时间快进后 6 块田全部成熟（' + F.ripeTiles + '）');
  ok(F.vistaBadge === '成熟 ×6', '灵田玉简显示成熟徽标（' + F.vistaBadge + '）');
  ok(F.grandArray === 'ok', '天地大阵背景：三层法阵环 + 八卦符号（' + F.grandArray + '）', F.grandArray);
  ok(F.jadeNodes === '4', '符文玉简 4 枚（丹/器/田/兽）（' + F.jadeNodes + '）', F.jadeNodes);
  ok(F.jadeGlyphs === 'ok', '玉简符文字齐全（丹器田兽）');
  ok(F.jadeScroll === '3', '丹/器/田玉简带直达分区（' + F.jadeScroll + '）', F.jadeScroll);
  ok(F.jadeTips === '4', '悬停介绍小字 4 条（' + F.jadeTips + '）', F.jadeTips);
  ok(F.harvestGain === '42', '收获 6 块 × 7 株 = 42 灵草直入炼丹房料仓（' + F.harvestGain + '）');
  ok(F.plotsEmptyAfter === '0', '收获后田块清空、可再播种');

  // 随机奇遇
  ok(F.encCfgChance === '0.3', '奇遇每 60 秒 30% 概率触发（' + F.encCfgChance + '）', F.encCfgChance);
  ok(F.encCfgEvery === '60', '奇遇判定间隔 60 秒', F.encCfgEvery);
  /* D-008：原断言是易碎魔数 `F.encEvtN === '4'`。内容池由 4 扩到 34 后，
     这里不是把 4 改成 34 就完事，而是升级为「规模 + 全表结构 + 档位白名单」的复合契约：
     34 条、既有 4 条仍在、每条字段完整、无 HTML 注入、fx 键合法、roll 分支完整、
     新增数值不越出既有档位。这样内容扩容本身也受回归保护，后续抹掉/写坏任一条都会红。 */
  ok(F.encEvtN === '34', 'D-008 奇遇池扩容到 34 条（' + F.encEvtN + '）', F.encEvtN);
  ok(F.encStructOrig4 === 'yes', '既有 4 条 beggar/pouch/stele/amulet 仍在');
  ok(F.encStructEvt === '34' && F.encStructMeta === '0' && F.encStructHtml === '0',
     '全表 34 条字段完整、无 HTML 注入（meta坏=' + F.encStructMeta + ' html坏=' + F.encStructHtml + '）');
  ok(F.encStructBadKey === '0' && F.encStructBadRoll === '0',
     'fx 键全在 8 类白名单、roll 分支 w/text/fx 完整（坏键=' + F.encStructBadKey + ' 坏roll=' + F.encStructBadRoll + '）');
  ok(F.encStructBadShape === '0',
     'fx 结构形状严格：boost 仅含 mult/sec、roll 分支仅含 w/text/fx，无额外字段（坏形=' + F.encStructBadShape + '）');
  ok(F.encStructBadType === '0',
     'fx 类型契约严格：fx 非 null/非数组/纯对象，boost 为对象、roll 为数组、分支 fx 合法（坏类型=' + F.encStructBadType + '）');
  ok(F.encStructBadTier === '0',
     '新增条目零新数值档位：fx 数值全部落在既有 4 条用过的档位集合内（越界=' + F.encStructBadTier + '）');
  ok(F.encBubbleHidden0 === 'hidden', '平时气泡隐藏');
  ok(F.encBubbleShown === 'shown', '刷出后气泡出现');
  ok(F.encBubbleName === '路畔快饿死的散修', '气泡显示事件名（' + F.encBubbleName + '）', F.encBubbleName);
  ok(F.encModalOpen === 'open', '点气泡弹出古风对话框');
  ok(F.encBubbleAfterClick === 'hidden', '点开气泡后气泡消失');
  ok(F.encOpts === '2', '弹窗内 2 个选项', F.encOpts);
  ok(F.encOptLabel === '给他 10 灵石', '选项文案正确（' + F.encOptLabel + '）', F.encOptLabel);
  ok(F.encStoneDown === '10', '选项A 扣 10 灵石', F.encStoneDown);
  ok(F.encWisdomUp === '50', '选项A 结算悟道值 +50（炼气一层系数 1.0）', F.encWisdomUp);
  ok(F.encModalClosed === 'hidden', '结算后弹窗关闭');
  ok(F.encBubbleGone === 'hidden', '结算后气泡消失');
  ok(F.encStateCleared === 'clear', '状态机里bubble 已清空');
  ok(F.pouchOpts === '2', '事件2 破囊有 2 个选项');
  ok(F.pouchRisk === '1', '事件2「强行打开」标记为风险项');
  ok(F.pouchChanged === 'yes', '强行打开必得灵石或受反噬（双分支都能结算）', F.pouchChanged);
  ok(F.pouchCleared === 'clear', '事件2 结算后气泡清空');
  ok(F.amuletOpts === '2', '事件4 老妪有 2 个选项');
  ok(F.amuletDisabled === '1', '灵石不足时买符选项置灰', F.amuletDisabled);
  ok(F.encBoostRate === 'up', '聚气符生效：修炼速度实时抬升');
  ok(F.encBuffOn === 'on', '临时修炼倍率挂上');
  ok(F.encTtlGone === 'gone', '气泡超过 TTL 无人问津自动消散');

  // 背包
  ok(F.bagCells === '20', '背包 20 格（基础容量）', F.bagCells);
  ok(F.bagItems === '2', '放入 2 个物品后显示 2 格');
  ok(F.eatExp === 'yes', '点丹药吃掉修为增加');
  ok(F.bagAfterEat === '1', '吃掉后背包剩 1 格');
  ok(F.itemModalShown === 'yes', '点背包格子弹出物品详情框');
  ok(F.itemNameDan === '下品丹药', '详情框显示物品名（' + F.itemNameDan + '）');
  ok(F.itemDescDan === 'yes', '详情框显示古风描述');
  ok(F.itemHasEat === 'true', '丹药详情有「服食」按钮');
  ok(F.itemModalClosed === 'yes', '详情框可关闭');
  ok(F.itemNameMat === '妖丹', '材料详情显示「妖丹」');
  ok(F.itemHasSell === 'true', '材料详情有「寄售」按钮');
  /* A31：寄售按钮改显示坊市实收价（sellPrice，随境界/行情浮动），不再写 ITEMS 的固定标价。
     断言同步升级为「与当时 _sellPrice 同源」的精确校验，而非硬编码 30。 */
  ok(Number((((F.itemSellTxt || '').match(/[\d,]+/) || [''])[0]).replace(/,/g, '')) === Number(F.itemSellDyn),
     '寄售按钮显示坊市实收价（与 _sellPrice 同源）', F.itemSellTxt + ' / ' + F.itemSellDyn);
  ok(F.itemHasNoEat === 'true', '材料详情不显示「服食」');

  /* ===== 第 83 轮 · 水墨图标（结构位去 emoji / 层序 / 查表兜底 / 文件存在） ===== */
  /* 材料档（妖丹）只有「寄售 + 丢弃」两颗，丹药档才有服食；两颗都必须是 img */
  ok(+F.itemActsImg >= 2 && F.itemActsEmo === 'no',
    '物品详情按钮走水墨 PNG：' + F.itemActsImg + ' 个 img、文字里无 emoji', F.itemActsImg + '/' + F.itemActsEmo);
  ok(F.inkFallback === 'ok' && F.inkMapped === 'ok',
    'inkIco 契约：配到图出 img、没配到原样返回 emoji（补图即生效，不会渲染成空串）',
    F.inkFallback + '/' + F.inkMapped);
  ok(+F.sysIcZ > +F.sysFaceZ,
    '侧栏水墨图标压在玉面之上（z-index ' + F.sysIcZ + ' > ::after ' + F.sysFaceZ + '）',
    F.sysIcZ + '/' + F.sysFaceZ);
  ok(F.njTick === 'ok', '法阵玉简有常显符文刻度环（rest 态不再是一块白盘）', F.njTick);
  ok(F.sectOffIco === 'ok', '「山门未开」的 ⛩️ 已换水墨关隘图', F.sectOffIco);
  /* 源码里引用到的每个水墨素材都必须存在：文件名打错＝图静默消失，肉眼看不出来。
     第 86 轮把口径从 ui/icons/*.png 扩到 icons/cave/avatar 三个目录与 jpg：
     洞府的卡片底纹 / 田块土 / 小景横卷是 CSS 里 url() 引用的 ui/cave/*.jpg，
     以前这类引用完全在扫描之外，打错只会静默回退成纯色。 */
  const srcIconRefs = (function(){
    const files = ['index.html', 'style.css', 'js/game.js', 'js/router.js', 'js/daily.js',
      'js/views/role.js', 'js/views/sect.js', 'js/views/cave.js', 'js/views/chat.js',
      'js/views/bag.js', 'js/views/market.js', 'js/views/secret.js', 'js/views/tower.js',
      'js/views/beast.js', 'js/views/event.js', 'js/views/arena.js', 'js/views/rank.js',
      'js/views/scripture.js'];
    const set = new Set();
    files.forEach(f => {
      let s; try { s = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return; }
      s.split(/\r?\n/).forEach(line => {
        if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;      /* 注释里的引用不算（会提到退役文件名） */
        (line.match(/ui\/(?:icons|cave|avatar)\/[\w.-]+\.(?:png|jpe?g)/g) || []).forEach(p => set.add(p));
      });
    });
    return [...set].sort();
  })();
  const srcIconMiss = srcIconRefs.filter(p => !fs.existsSync(path.join(ROOT, p)));
  ok(srcIconMiss.length === 0 && srcIconRefs.length >= 30,
    '源码引用的 ' + srcIconRefs.length + ' 个水墨素材（icons/cave/avatar，含 CSS url）全部存在',
    srcIconMiss.join(','));
  /* 第 85 轮 · 方案①：13 张妖兽图那层铺满整张的半透明纸底已重抠。
     口径 = 外圈 12px 里「0<alpha<200 的雾」占比（ringWash）。不用外圈平均 alpha：
     蛟龙/蝎子这类满铺图形的外圈本来就是真墨（改后平均还有 56/63），按均值判会误伤。
     实测分档：改前坏的那批 47.6~93.5，改后全部 ≤10.4，干净的那 25 张一直是 0~0.1 —— 阈值取 25。
     解码器直接 require 工具本身：两边各写一份 PNG 解码，口径一漂这条就变成永远为真的空检查。 */
  const veil = (function () {
    let m;
    try { m = require(path.join(ROOT, 'tools/_png_rekey.js')); } catch (e) { return { err: 'require 失败 ' + e.message }; }
    const dirP = path.join(ROOT, 'ui/icons');
    const files = fs.readdirSync(dirP).filter(f => /^beast_.*\.png$/.test(f)).sort();
    const bad = []; let zero = 0, worst = 0;
    files.forEach(f => {
      let s;
      try {
        const img = m.rgbaOf(m.readChunks(fs.readFileSync(path.join(dirP, f))));
        let wash = 0, n = 0;
        for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
          if (!(x < 12 || y < 12 || x >= img.w - 12 || y >= img.h - 12)) continue;
          const a = img.px[(y * img.w + x) * 4 + 3]; n++;
          if (a > 0 && a < 200) wash++;
        }
        s = { wash: 100 * wash / n, solid: m.stats(img).solid };
      } catch (e) { bad.push(f + ' 解不开(' + e.message + ')'); return; }
      worst = Math.max(worst, s.wash);
      if (s.wash === 0) zero++;
      if (s.wash > 25) bad.push(f.replace(/\.png$/, '') + ' 雾' + s.wash.toFixed(0) + '%');
      if (s.solid < 1) bad.push(f.replace(/\.png$/, '') + ' 没有实形墨');
    });
    return { n: files.length, bad, zero, worst };
  })();
  ok(!veil.err && veil.n >= 38 && veil.zero >= 20 && veil.worst <= 25,
    '38 张妖兽图外圈无半透明纸底（放大到 150px+ 不再显浅灰方框）：最差 ' + (veil.worst || 0).toFixed(1) + '% 雾、' + (veil.zero || 0) + ' 张外圈全净',
    veil.err || (veil.bad || []).join(','));
  /* 第 92 轮 · 8 枚 30px「细成一条线 / 淡得看不见」的题签做了等比加粗压暗（只动 alpha，RGB 一字未改）。
     钉住加粗后的实形墨占比（alpha>=200），下限取现值的 85%：以后谁再抠淡、或换回旧图，这条先红。
     尺子仍 require 工具本身，与素材回归同一把。 */
  const tagInk = (function () {
    let m;
    try { m = require(path.join(ROOT, 'tools/_png_rekey.js')); } catch (e) { return { err: 'require 失败 ' + e.message }; }
    const FLOOR = { ic_train: 6.3, mat_bone: 6.8, mat_feather: 10.7, ic_blade: 8.8,
      ic_candle: 15.2, ic_river: 63.0, bld_secret: 53.8, ic_pagoda: 19.6 };
    const bad = [], got = {};
    Object.keys(FLOOR).forEach(n => {
      try {
        const s = m.stats(m.rgbaOf(m.readChunks(fs.readFileSync(path.join(ROOT, 'ui/icons', n + '.png')))));
        got[n] = s.hi;
        if (s.hi < FLOOR[n]) bad.push(n + ' 墨' + s.hi.toFixed(1) + '%<' + FLOOR[n] + '%');
      } catch (e) { bad.push(n + ' 解不开'); }
    });
    return { n: Object.keys(FLOOR).length, bad, got };
  })();
  ok(!tagInk.err && tagInk.bad.length === 0,
    '8 枚小尺寸题签加粗后的实形墨占比守住下限（30px 不再细成一条线）',
    tagInk.err || tagInk.bad.join(','));
  /* 第 88 轮 · 城镇十座建筑的水墨立绘：解码 + 四角透明 + 有实形墨，全在 Node 侧量字节。
     口径同妖兽那批 —— 生成图最怕的就是带一层铺满整张的纸底（四角 alpha 不为 0），
     挂到画卷上就是一圈浅灰方框；再就是缩得太狠，124px 的框子里糊成一团。 */
  const bldArt = (function () {
    let m;
    try { m = require(path.join(ROOT, 'tools/_png_rekey.js')); } catch (e) { return { err: 'require 失败 ' + e.message }; }
    const dirP = path.join(ROOT, 'ui/icons');
    const files = fs.readdirSync(dirP).filter(f => /^bld_.*\.png$/.test(f)).sort();
    const bad = []; let minW = 1e9, maxWash = 0;
    files.forEach(f => {
      let img;
      try { img = m.rgbaOf(m.readChunks(fs.readFileSync(path.join(dirP, f)))); }
      catch (e) { bad.push(f + ' 解不开(' + e.message + ')'); return; }
      const st = m.stats(img);
      minW = Math.min(minW, st.w);
      if (st.w < 280) bad.push(f.replace(/\.png$/, '') + ' 只有 ' + st.w + 'px');
      if (st.solid < 1) bad.push(f.replace(/\.png$/, '') + ' 没有实形墨');
      const corner = [[0, 0], [st.w - 1, 0], [0, st.h - 1], [st.w - 1, st.h - 1]]
        .map(p => img.px[(p[1] * st.w + p[0]) * 4 + 3]);
      if (Math.max.apply(null, corner) > 8) bad.push(f.replace(/\.png$/, '') + ' 四角带纸底 alpha=' + Math.max.apply(null, corner));
      /* 外圈 12px 的半透明雾：立绘允许比妖兽多一点（云雾洞口本来就贴边），阈值放到 30% */
      let wash = 0, n = 0;
      for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
        if (!(x < 12 || y < 12 || x >= st.w - 12 || y >= st.h - 12)) continue;
        const a = img.px[(y * st.w + x) * 4 + 3]; n++;
        if (a > 0 && a < 200) wash++;
      }
      maxWash = Math.max(maxWash, 100 * wash / n);
      if (100 * wash / n > 30) bad.push(f.replace(/\.png$/, '') + ' 外圈雾 ' + (100 * wash / n).toFixed(0) + '%');
    });
    return { n: files.length, bad, minW: minW === 1e9 ? 0 : minW, maxWash };
  })();
  ok(!bldArt.err && bldArt.n === 10 && bldArt.bad.length === 0 && bldArt.minW >= 280,
    '城镇 10 张建筑立绘全部合法：≥' + (bldArt.minW || 0) + 'px、四角透明、有实形墨（外圈最雾 ' + (bldArt.maxWash || 0).toFixed(1) + '%）',
    bldArt.err || (bldArt.bad || []).join(','));
  /* 第 89 轮 · 三族丹药母图（聚灵 / 淬体 / 丰产）：口径同建筑立绘，但图标只有 22px
     见方，缩得比立绘更狠，所以宽度阈值提到 380、外圈雾卡到 8%（图标本该干干净净）。 */
  const danArt = (function () {
    let m;
    try { m = require(path.join(ROOT, 'tools/_png_rekey.js')); } catch (e) { return { err: 'require 失败 ' + e.message }; }
    const dirP = path.join(ROOT, 'ui/icons');
    const files = fs.readdirSync(dirP).filter(f => /^dan_(jl|ct|fc)\.png$/.test(f)).sort();
    const bad = []; let minW = 1e9, maxWash = 0;
    files.forEach(f => {
      let img;
      try { img = m.rgbaOf(m.readChunks(fs.readFileSync(path.join(dirP, f)))); }
      catch (e) { bad.push(f + ' 解不开(' + e.message + ')'); return; }
      const st = m.stats(img);
      minW = Math.min(minW, st.w);
      if (st.w < 380) bad.push(f.replace(/\.png$/, '') + ' 只有 ' + st.w + 'px');
      if (st.solid < 1) bad.push(f.replace(/\.png$/, '') + ' 没有实形墨');
      const corner = [[0, 0], [st.w - 1, 0], [0, st.h - 1], [st.w - 1, st.h - 1]]
        .map(p => img.px[(p[1] * st.w + p[0]) * 4 + 3]);
      if (Math.max.apply(null, corner) > 8) bad.push(f.replace(/\.png$/, '') + ' 四角带纸底 alpha=' + Math.max.apply(null, corner));
      let wash = 0, n = 0;
      for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) {
        if (!(x < 12 || y < 12 || x >= st.w - 12 || y >= st.h - 12)) continue;
        const a = img.px[(y * st.w + x) * 4 + 3]; n++;
        if (a > 0 && a < 200) wash++;
      }
      maxWash = Math.max(maxWash, 100 * wash / n);
      if (100 * wash / n > 8) bad.push(f.replace(/\.png$/, '') + ' 外圈雾 ' + (100 * wash / n).toFixed(0) + '%');
    });
    return { n: files.length, bad, minW: minW === 1e9 ? 0 : minW, maxWash };
  })();
  ok(!danArt.err && danArt.n === 3 && danArt.bad.length === 0 && danArt.minW >= 380,
    '三族丹母图（聚灵 / 淬体 / 丰产）全部合法：' + danArt.minW + 'px、四角透明、外圈无雾（最雾 ' + (danArt.maxWash || 0).toFixed(1) + '%）',
    danArt.err || (danArt.bad || []).join(','));
  ok(F.itemEatWorks === 'yes', '详情框点服食：服下丹药、背包减 1');
  ok(F.bagCapCells === '80', '背包格子按有效容量画（基础 50 + 洞天 30，' + F.bagCapCells + '）');
  ok(F.bagCapLabel === '已用 60 / 容量 80（洞天 +30）', '容量标签写已用/容量并注明洞天加格（' + F.bagCapLabel + '）');
  ok(F.bagOverLabel === '已用 60 / 容量 50（超 10 格）' && F.bagOverClass === 'yes',
    '主洞改奉后容量变小：物品不消失，标签标「超 N 格」（' + F.bagOverLabel + '）');
  ok(F.bagOverCells === '60', '超容量的物品仍渲染在背包里（' + F.bagOverCells + ' 格）');
  ok(F.equipOk === 'yes', '装备青锋剑成功');
  ok(F.equipDelta === '500', '穿上后战力 +500（武器加成，' + F.equipDelta + '）');
  ok(F.equipSlot === 'eq_qingfeng', '武器槽记录装备 id（' + F.equipSlot + '）');
  ok(F.equipBagAfter === '3', '装备后从背包取出（剩 ' + F.equipBagAfter + ' 件）');
  ok(F.equipSwapDelta === '1300', '换赤霄剑净增 +1300（1800−500，' + F.equipSwapDelta + '）');
  ok(F.equipReplaced === 'eq_qingfeng', '返回被换下的旧装备 id');
  ok(F.equipOldBack === 'yes', '换下的旧装备退回背包');
  ok(F.equipSum === '1800', '装备战力计入总战力（' + F.equipSum + '）');
  ok(F.multiSlotSum === '2200', '多槽累加：武器1800+防具400（' + F.multiSlotSum + '）');
  ok(F.unequipOk === 'yes' && F.unequipSlotEmpty === 'yes' && F.unequipBack === 'yes',
     '卸下成功：槽位清空 + 退回背包');
  ok(F.equipReject === 'yes', '丹药等非装备物品拒绝装备');
  ok(F.roleShown === 'yes', '「人物 · 装备」面板可打开');
  ok(F.roleHubCells === '6' && F.roleHubCards === '0',
     '人物拆页：hub 六格（法宝 / 札记 / 道碑 / 悟道 / 断天门 / 识人）（格 ' + F.roleHubCells + ' · 卡 ' + F.roleHubCards + '）');
  ok(String(F.roleHubSealMiles).indexOf('碑') >= 0, '道碑格朱砂印报立碑数（' + F.roleHubSealMiles + '）');
  ok(F.roleStatsOk === 'yes', '属性区显示道号/境界/战力/修为产出');
  ok(F.roleSlots === '3', '三个圆形装备槽位');
  ok(F.roleAllEmpty === '3', '三个槽位各自带一段空槽文案（' + F.roleAllEmpty + ' 个）');
  /* ---- 第 95 轮 · 角色面板三个空圈补内容 ---- */
  ok(F.roleEmptyTxt === '尚未到手 / 尚未到手 / 尚未到手',
     '空圈不再是一个 rgba(.34) 的「空」字，改说「尚未到手」（' + F.roleEmptyTxt + '）');
  ok(F.roleTipTxt === '武器槽 / 防具槽 / 饰品槽', '空圈第二行点明这一格收哪一类（' + F.roleTipTxt + '）');
  ok(F.roleGhost === '3/true', '空圈里各有一枚去色的法宝影子，且都指向 ui/icons 真图（' + F.roleGhost + '）');
  ok(F.slotRing === 'yes', '圆圈的暗金描边真的画出来了（inset 阴影进计算样式，旧版 border:none 配一句「暗金边框」注释）');
  ok(F.slotCanUp === 'yes' && F.slotCandTxt === '可装 1 件 最好 +400',
     '背包里有货时空圈改口报数量与最好一件的战力，并挂上朱砂点（' + F.slotCandTxt + ' / can-up ' + F.slotCanUp + '）');
  ok(F.slotCandTitle === '点击穿上【照胆镜】', '空圈的 title 跟着实情走（' + F.slotCandTitle + '）');
  ok(F.slotTapFilled === 'yes' && F.slotTapName === '照胆镜', '点空圈真的穿上（旧版只有已穿的圈答话，空圈点了没反应）');
  ok(F.slotTapDown === 'yes' && F.slotTapBack === '1', '再点一下真的卸下并退回背包');
  ok(F.slotTapNoCand === 'still-empty/尚未到手', '没货时点空圈不误装、不报错（' + F.slotTapNoCand + '）');
  const glowBody = (chatCss.split('@keyframes slotGlow')[1] || '').split('@media')[0];
  const glowSh = (glowBody.match(/box-shadow:[^;]+/g) || []).map(s => s.trim());
  ok(glowSh.length === 3 && glowSh[1] !== glowSh[0] && glowSh[2] === glowSh[0],
     'slotGlow 三停是「基线—亮峰—回到基线」（旧版三停 box-shadow 一模一样，「刚穿上」的脉冲从头到尾是空转）（' + glowSh.length + ' 停 / ' + new Set(glowSh).size + ' 样）');
  ok(/\.equip-slot\.can-up::after\{[^}]*radial-gradient/.test(chatCss), '朱砂点用 radial-gradient 画在 ::after，不新增图片');
  ok(/\.equip-slot:hover\{[^}]+/.test(chatCss), '悬停态不再是空规则（旧版 .equip-slot:hover{ } 里面什么都没有）');
  ok(roleViewSrc.indexOf('title="点击卸下"') < 0, '模板里写死的「点击卸下」撤了，改由 renderRole 按实情挂 title');
  ok((routerSrc.match(/querySelectorAll\('\.equip-slot'\)/g) || []).length === 1,
     '三个圈只有一处监听（第 95 轮先加了第二条，两条同挂一圈：点空圈刚穿上，第二条立刻接着弹 confirm）');
  ok(/\.equip-slot'\)\.forEach\(sl => sl\.addEventListener/.test(routerSrc) &&
     /XX\._slotTap\(k\)/.test(routerSrc), 'router.bindPanel 的那一处监听把空圈也接上了（已穿走 confirm+卸下，空圈走 _slotTap）');
  ok(F.itemEquipBtn === 'yes', '背包法宝详情出现「装备」按钮');
  ok(F.equipTreasureShown === 'yes', '点装备后弹出提示框');
  ok(/战力提升/.test(F.equipTreasureTxt), '提示「战力提升了 +500」（' + F.equipTreasureTxt + '）');
  ok(F.slotFilled === 'yes' && F.slotGlow === 'yes', '武器槽亮起并带发光动画类');
  ok(F.slotItemName === '青锋剑', '槽内显示装备名（' + F.slotItemName + '）');
  ok(F.roleUnequipOk === 'yes' && F.slotEmptyAfter === 'yes', '卸下后槽位回到暗灰空态');
  /* 道行拆账（第 77 节）：底 × 乘区 + 加区 必须与结算函数一致，且三块都不许出 NaN */
  ok(F.pwBtn === 'yes', '人物面板挂上「道行拆账」入口');
  ok(F.pwOpen === 'yes' && F.pwSecs === '3', '拆账弹窗三块：战力 / 修为 / 灵石（' + F.pwSecs + '）');
  ok(Number(F.pwRowN) >= 5, '拆账逐行列底/乘区/加区（' + F.pwRowN + ' 行）');
  ok(F.pwNoBad === 'yes', '拆账文本无 NaN / undefined / Infinity');
  ok(F.pwPowMatch === 'yes' && Number(F.pwPowCalc) === Number(F.pwPowNow),
     '战力：底 × 乘区 + 灵兽/装备 = 结算值（' + F.pwPowCalc + '）');
  ok(F.pwExpMatch === 'yes' && F.pwStoneMatch === 'yes', '修为与灵石的乘区连乘 = 每秒产出（浮点误差内）');
  ok(F.pwEquipFlat === 'yes', '已穿装备作为战力加区单独列出');
  ok(F.pwTxtHasPow === 'yes' && (F.pwSubTxt || '').indexOf('·') >= 0,
     '拆账正文三块齐全，副标题写「道号 · 境界」（' + F.pwSubTxt + '）');
  ok(F.pwClosed === 'yes', '拆账弹窗的关闭按钮可用');
  ok(F.pwChipOpen === 'yes' && F.pwChipTag === 'BUTTON', '顶栏战力 chip 是按钮，点开同一张拆账');

  // 寻宝
  ok(F.stoneAfterTreasure === '80', '寻宝消耗 20 灵石（100→80）', F.stoneAfterTreasure);
  ok(F.treasureModal === 'shown', '寻宝结果弹窗弹出');
  ok(F.treasureName === '探索收获', '探索出材料（' + F.treasureName + '）');

  // 坊市
  ok(F.marketBld === 'true', '坊市建筑入口已实装');
  ok(F.marketShown === 'shown', '切坊市页成功');
  ok(F.mkHubCells === '4' && F.mkHubCards === '0',
     '坊市拆页：hub 只放四格入口，一张功能卡都不堆（格 ' + F.mkHubCells + ' · 卡 ' + F.mkHubCards + '）');
  ok(F.mkSubOn === 'mk-goods' && F.mkSubDepth === '1',
     '进「今日货架」才是那一页，data-sec 落在货架（' + F.mkSubOn + '/' + F.mkSubDepth + '）');
  ok(String(F.mkSealRate).charAt(0) === '×', 'hub 格面的朱砂印报今日行情（' + F.mkSealRate + '）');
  ok(F.mkSlots === '5', '炼气期货架按境界解锁 5 种货（' + F.mkSlots + '）');
  ok(F.mkRows === '5', '货架渲染行数与商品位一致（' + F.mkRows + '）');
  ok(F.mkSlotsHigh === '6', '元婴期解锁全部 6 个货架位（' + F.mkSlotsHigh + '）');
  ok(F.mkPrice === 'ok', '商品价格锚定境界需求（' + F.mkPrice + '）');
  ok(F.mkBought === 'yes' && F.mkStoneDown === 'yes', '买入成功并扣灵石（扣款 ' + F.mkStoneDown + '）');
  ok(F.mkBuyBtnLive === 'yes' && F.mkSpendFloat === 'yes', '买入时从按钮飘起花费浮字（-N 灵石）');
  ok(F.mkRowFlash === '1' && F.mkRowPersist === 'yes', '购入行墨晕只打一次：行元素存活，脉冲能放完不重来（' + F.mkRowFlash + '）');
  ok(F.mkSoldGain === 'yes' && F.mkSoldCount === '1' && F.mkBagAfterSell === '0', '寄售卖出、计数 +1、背包清空');
  ok(F.mkOverPrice === 'yes', '超出每日额度后坊市压价');
  ok(F.mkSellAll === 'yes', '一键寄售清空可卖物品');
  ok(F.tjRows === '3', '天机阁上架 3 件保底道具');
  ok(F.tjDeepLink === 'market_tianji' && F.tjDeepDepth === '2',
     '木牌「天机阁」带的老锚点 xx-tianji 直达那一页，底下仍压 hub（← 两下才回场景：' + F.tjDeepLink + '/' + F.tjDeepDepth + '）');
  ok(F.tjNoStone === 'yes', '只有灵石（无悟道值）→ 双扣制拦截，天机令未发出');
  ok(F.tjExchange === 'yes', '800 悟道 + 35000 灵石（总资产 35%）双扣兑换护心镜');
  ok(F.tjLimit === '本周 1/2', '兑换后护心镜本周限购计数 1/2（' + F.tjLimit + '）');
  ok(F.ecoIncExp === 'yes', '灵石产出随境界指数增长（25 层为新手上百倍）');
  ok(F.ecoLag === 'yes', '产出远跟不上物价：25 层时「时产/物价」不足新手 1/10（永远缺钱）');
  ok(F.tjAssetRatio === 'yes', '护心镜灵石价 = 当前总资产 35%（4 亿 → 1.4 亿，不再是几千）');
  ok(F.tjAssetNoWisdom === 'yes', '悟道值不足时双扣拦截，灵石分文未扣');
  ok(F.tjAssetBuy === 'yes', '双扣成功：灵石 -35% 总资产、悟道值 -800×1.15^20');
  /* 大额灵石（3e9 / 9e9 都超 2^31）：整条钱路不许被位运算折负或压低 */
  ok(F.bigPrice === 'yes', '30 亿灵石时护心镜报价仍按真实总资产 35%（' + F.bigPrice + '）');
  ok(F.bigEnough === 'yes', '30 亿灵石在 UI 里被判定为"够"，不再显示买不起');
  ok(F.bigBuy === 'yes', '大额灵石购买成功且扣款精确（余额 ' + F.bigBuy + '）');
  ok(F.hugePricePos === 'yes', '90 亿总资产的报价本身就超 2^31，不再被折成 1.47 亿的"白菜价"（' + F.hugePricePos + '）');
  ok(F.hugeEnough === 'yes', '90 亿灵石同样判定为"够"');
  ok(F.hugeBuy === 'yes' && F.hugeRest === 'yes', '90 亿付款扣款精确、余额仍是正常大额（' + F.hugeBuy + '/' + F.hugeRest + '）');
  ok(F.bigStory === 'yes', '主线发奖（' + F.bigStorySeg + '）在大额余额上入账，绝不变负（' + F.bigStory + '）');
  ok(F.tjReveal === 'shown' && F.tjRevealName === '护心镜', '天机阁购得弹出珍宝揭晓（' + F.tjRevealName + '）');
  ok(F.tjRevealClosed === 'yes', '揭晓弹窗可合上');
  ok(F.ecoOfflineCap === 'yes', '离线 100 小时只结算当日封顶产出（上限生效，' + (F.ecoOfflineCap === 'yes' ? '封顶内' : F.ecoOfflineCap) + '）');

  // 法宝强化 / 洗练
  ok(F.enhBox === 'yes', '洞府页出现法宝强化卡片');
  ok(/下一级 \+1/.test(F.enhNextTxt || '') && /成功率 \d+%/.test(F.enhNextTxt || ''),
     '强化卡预览下一级的修炼/战力/成功率（' + F.enhNextTxt + '）');
  ok(F.enhNext6 === 'yes', '强化等级变了，下一级预览跟着变（+6）');
  ok(F.enhLv === '1', '祝福值满时强化成功（+' + F.enhLv + '）');
  ok(F.enhOreDown === 'yes', '强化扣除矿石');
  ok(F.enhPowUp === 'yes' && F.enhExpUp === 'yes', '强化提升战力与修炼速度');
  ok(F.enhBlessReset === '0', '成功后祝福值清零');
  ok(F.enhMat5 === 'boss_core', '+5 起要 Boss 稀有材料（' + F.enhMat5 + '）');
  ok(F.enhBlocked === 'yes', '缺稀有材料时无法强化');
  ok(F.affixN === '1', '下品法宝 1 条词条（' + F.affixN + '）');
  ok(F.rerollPay === 'yes', '洗练固定扣 5000 灵石（不再按境界取价）');
  ok(F.rerollNoMat === 'yes', '洗练不再消耗稀有材料');
  ok(F.rrInsufficient === 'yes', '灵石不足时洗练拦截，词条与灵石不动');
  ok(F.rrModal === 'yes', '洗练弹窗打开（老虎机词条槽）');
  ok(F.rrSlots === '4', '弹窗四个词条槽（神品第 4 条不再看不见）（' + F.rrSlots + '）');
  ok(F.rrSlot0 === 'yes', '已开启槽位显示当前词条');
  ok(F.rrLocked1 === 'yes', '未开启槽位显示锁定提示');
  ok(F.rrGo === 'yes', '洗练按钮显示固定价格 5000');
  ok(F.rrLockNone === '0', '只有 1 条词条时不显示锁钮（至少留一条洗练）');
  ok(F.rrSlots4On === '4', '神品法宝四槽全开、都有锁钮（' + F.rrSlots4On + '）');
  ok(F.rrSlot3 === 'yes', '第 4 条词条（灵石产出）已显示');
  ok(F.rrLockOn === 'yes', '点「锁」后槽位进入锁定态');
  ok(F.rrCostLock1.indexOf('1.00万') >= 0 && F.rrCostLock1.indexOf('保留 1') >= 0,
     '锁 1 条价格翻倍到 1.00万（' + F.rrCostLock1 + '）');
  ok(F.rrCostLock2.indexOf('2.00万') >= 0 && F.rrCostLock2.indexOf('保留 2') >= 0,
     '锁 2 条价格 2.00万（' + F.rrCostLock2 + '）');
  ok(F.rrLockMax === '3' && F.rrCostLock3.indexOf('4.00万') >= 0,
     '最多锁 3 条，第 4 条被拦下（' + F.rrCostLock3 + '）');
  ok(F.rrCostBack.indexOf('5000') >= 0, '全部解锁回到底价 5000');
  ok(F.rrKeepN === '4' && F.rrKeep0 === 'yes' && F.rrKeep2 === 'yes',
     '同步洗练保住锁定的 0/2 号词条');
  ok(F.rrKeepCost === '20000', '锁 2 条的同步洗练扣 20000 灵石（' + F.rrKeepCost + '）');
  ok(F.rrKeepUniq === 'yes', '重掷后四条词条仍不重复');
  ok(F.rrClosed === 'yes', '洗练弹窗可关闭');

  // 存档备份（第 78 节）：导出 / 校验 / 导入 / 冻结旧内存
  ok(F.svEntryShown === 'yes' && F.svOpen === 'yes' && F.svSetClosed === 'yes',
     '设置 → 存档备份打开弹窗，设置层自动收起');
  ok(F.svCurName === 'yes' && F.svCurMeta === 'yes', '当前存档显示道号与文件大小（' + F.svCurMeta + '）');
  ok(F.svApplyLocked === 'yes', '未校验时「覆盖并写入」置灰');
  ok(F.svTextName === 'yes' && F.svParseOk === 'yes', '导出的存档文本可被重新解析');
  ok(F.svParseJunk === 'yes' && F.svParseEmpty === 'yes' && F.svParseNotGame === 'yes' && F.svParseRankBad === 'yes',
     '乱码 / 空文本 / 无系统字段 / 境界非法都被拒');
  ok(F.svPrevOk === 'yes' && F.svPrevName === 'yes' && F.svApplyOn === 'yes',
     '校验通过后预览道号并解锁写入');
  ok(F.svPrevBad === 'yes' && F.svErrTxt === 'yes' && F.svApplyOff === 'yes',
     '非法内容显示 ✗ 原因并重新置灰');
  ok(F.svReset === 'yes' && F.svClosed === 'yes', '改动输入清空预览，× 可关闭');
  ok(F.svDoneShown === 'yes' && F.svDoneMeta === 'yes', '写入成功面板报出新档身份');
  ok(F.svFrozen === 'yes' && F.svSavedName === '归档客' && F.svSavedStone === '321',
     'localStorage 换成导入档（' + F.svSavedName + ' / ' + F.svSavedStone + '）');
  ok(F.svSavedLast === 'yes', '导入时把 last 改成此刻（反复导入旧档刷不到离线收益）');
  ok(F.svMemOld !== '归档客', '内存仍是旧档，等重新载入（' + F.svMemOld + '）');
  ok(F.svCurFrozen === 'yes' && F.svExportLocked === 'yes', '导入后提示重载，导出按钮同步锁死');
  ok(F.svFrozenGuard === 'yes', '冻结后自动保存不会盖掉刚导入的档');
  ok(F.svApplyAgain === 'yes' && F.svPrevLock === 'yes', '冻结期间再次导入被拦下');
  ok(F.svClosed2 === 'yes', '重新打开后仍可关闭');

  // ---- 第 96 轮 · 寿元倒计时 / 坐化 / 转世 骨架 ----
  ok(F.lfChipNorm === '40/600/-', '顶栏寿元 chip 常态显示 年龄/上限（' + F.lfChipNorm + '）');
  ok(F.lfChipLow === '570/600/low', '余命不足 15% → chip 挂 low（' + F.lfChipLow + '）');
  ok(F.lfChipZuo === '坐化/zuo', '坐化后 chip 改「坐化」+ zuo（' + F.lfChipZuo + '）');
  ok(F.lfChipOff === '未开/off', '未开寿元 → chip「未开」+ off（' + F.lfChipOff + '）');
  ok(F.lfChipInf === '无量/-', '飞升后寿元无量（' + F.lfChipInf + '）');
  ok(F.lfPageIds === '111111111', '寿元页九个挂点齐全（' + F.lfPageIds + '）');
  ok(F.lfStages === '10', '寿元表十格（' + F.lfStages + '）');
  ok(F.lfNowCell === '金丹', '当前大境界格高亮（' + F.lfNowCell + '）');
  ok(F.lfBarLow === 'yes' && F.lfWick === 'yes', '余命条与寿烛火苗同步到 5%（' + F.lfBarLow + '/' + F.lfWick + '）');
  ok(F.lfLeftTxt === 'yes', '余命折算成真实时间写清楚');
  ok(F.lfBtnHide === 'true/true', '开着寿元且未坐化：开启/转世两按钮都藏（' + F.lfBtnHide + '）');
  ok(F.lfLegRows === '4' && F.lfLegTxt === 'yes', '道统页四行账：转世/加成/遗物/道心（' + F.lfLegRows + '）');
  ok(F.lfTickAge === 'yes', '挂机 4320 秒记 1 年寿元（P1：lifeYearSec 300→4320）');
  ok(F.lfTickZuo === 'yes', '坐化后寿元停表');
  ok(F.lfDie === 'yes', '余命不足一个 tick → 当场坐化');
  ok(F.lfReborn === '1/1.1/0/0/0/eq_huxin', '转世结算：1 世/×1.10/年龄 0/未坐化/炼气/带走挑中的护心镜（' + F.lfReborn + '）');
  /* 第 97 轮 · 转世深度：结算卡 / 三选一 / 历代世系 */
  ok(F.lfPicks === 'eq_qingfeng,eq_huxin,eq_yupei', '遗物候选按战力取前三（' + F.lfPicks + '）');
  ok(F.lfPickDefault === 'eq_qingfeng/eq_qingfeng', '坐化默认选中最强那件（' + F.lfPickDefault + '）');
  ok(F.lfPickBtns === '3/600 年/金丹初期/7 次/show', '结算卡：三件备选 + 享年/止步境界/突破次数（' + F.lfPickBtns + '）');
  ok(F.lfPickSwitch === 'eq_huxin/eq_huxin', '点第二件 → 选择与高亮一起换（' + F.lfPickSwitch + '）');
  ok(F.lfRelicPick === 'eq_huxin/1/1/', '转世只带挑中的那件，默认最强的不特殊（' + F.lfRelicPick + '）');
  ok(F.lfHist === '1/1/12/600/eq_huxin', '历代世系记下这一世：世数/境界/享年/遗物（' + F.lfHist + '）');
  ok(F.lfHistRows === '1', '道统页画出历代世系（' + F.lfHistRows + '）');
  ok(F.lfHistCap === '12', '世系只留最近 12 世（' + F.lfHistCap + '）');
  ok(F.lfRelicOnce === '1', '遗物入新世背包只有一件（' + F.lfRelicOnce + '）');
  ok(F.lfDaoRow === 'yes', '道统加成进修为拆账乘区');
  ok(F.lfEnable === 'yes', '开启寿元不可逆（连点两次仍是开）');
  ok(F.lfMigOld === '000', '老档迁移：寿元默认关、无坐化、无道统（' + F.lfMigOld + '）');
  ok(F.lfMigNew === '1/5/2/eq_qingfeng', '新档字段照读（' + F.lfMigNew + '）');
  ok(F.lfMig97 === '3/2/null/eq_huxin', '第 97 轮字段迁移：突破数照读、世系滤掉非法遗物、pick 照读（' + F.lfMig97 + '）');
  ok(F.lfMigAsc === '00', '飞升档里的坐化状态作废（' + F.lfMigAsc + '）');

  // ---- 第 99 轮 · 心魔照镜（心魔 = 上一世的你） ----
  ok(F.mfNone === 'none/0/0/1/心魔 · 尚未成形/未照/none',
     '初世镜中无人：按钮置灰、打不起来（' + F.mfNone + '）');
  ok(F.mfNoneIds === '1111111', '心魔页七个挂点齐全（' + F.mfNoneIds + '）');
  ok(F.mfNoneTip === 'yes', '初世提示「先走完这一世」');
  ok(F.mfHub === '3/初世', '寿元 hub 三格、心魔印停在「初世」（' + F.mfHub + '）');
  ok(F.mfBorn === '1/12/1/600/7/1/short/0',
     '转世把上一世死时的战力定成心魔（世数/境界/战力/享年/突破数）（' + F.mfBorn + '）');
  ok(F.mfShortPage === 'short/1/yes/short/yes',
     '战力不够：按钮写清「还差」，条子进 short 态（' + F.mfShortPage + '）');
  ok(F.mfReadyPage === 'ready/1/same/img',
     '战力追平 → 可照，双方战力与立绘都画出来（' + F.mfReadyPage + '）');
  ok(F.mfWin === '1/1/done/0/1', '一拳破心魔：道心 +1，同一世再照被拒（' + F.mfWin + '）');
  ok(F.mfRate === '1.02', '道心一胜 → 修炼 ×1.02（' + F.mfRate + '）');
  ok(F.mfDaoRow === '道心 · 照镜 1 胜=1.02', '道心进修为拆账乘区（' + F.mfDaoRow + '）');
  ok(F.mfDonePage === '1/本世已破镜/道心 1 胜', '破镜后按钮与页眉题签同步（' + F.mfDonePage + '）');
  ok(F.mfCap.indexOf('14/1/') === 0, '心魔跟着转世换代（第 14 世），道心胜场不随转世归零（' + F.mfCap + '）');
  ok(F.mfMigOld === '0/0/none', '老档没有心魔字段 → 当作还没认识心魔（' + F.mfMigOld + '）');
  ok(F.mfMigDirty === '2/0/0/0/0/0/clamp', '脏心魔档读档即夹：世数夹道统、境界夹 TOP、负数归零（' + F.mfMigDirty + '）');

  // ---- 第 104 轮 · 心魔守心（照镜前过三息） ----
  ok(F.mcUi === 'ask~第 1 息 · 心念 0/3~2~ask',
     '守心三息：心魔在、未破镜时摆两张签，先说第一息（' + F.mcUi + '）');
  ok(F.mcHold === '1~1~noexp~第 2 息 · 心念 1/3',
     '默守：心念 +1、不拿修为，走到第二息（' + F.mcHold + '）');
  const mcB = (F.mcBreak || '').split('~');
  ok(mcB[0] === '1' && mcB[1] === '2' && mcB[2] === mcB[3] && Number(mcB[2]) > 0 && mcB[4] === '第 3 息 · 心念 1/3',
     '断喝：当场拿修为（= need×0.08），心念不进（' + F.mcBreak + '）');
  ok(F.mcOver === '1~2~3~over~0~已守心 · 2/3', '三息走完收签：心念 2/3，第四次点不动（' + F.mcOver + '）');
  ok(F.mcThresh === 'above~under~ready~0~守心 −',
     '守心 2/3 → 照镜线 ×0.97：心魔原始战力还高一点也照得动（' + F.mcThresh + '）');
  ok(F.mfMigCalm === '3/0', '守心脏档读档即夹：心念夹 3、步数夹 0（' + F.mfMigCalm + '）');

  // 生产建筑（炼丹房 / 炼器坊）+ 匠道阶位
  ok(F.upsDanRow === '6', '洞府升级行 6 项（新增炼丹房/炼器坊）（' + F.upsDanRow + '）');
  ok(F.upsMasteryTxt.indexOf('丹师 1 阶') >= 0 && F.upsMasteryTxt.indexOf('器师 1 阶') >= 0, '升级行显示丹师/器师阶位');
  ok(Number(F.upsArrowN) >= 4, '升级行带「当前 → 下一级」预览（' + F.upsArrowN + ' 处箭头）');
  ok(F.upsCaveArrow === 'yes' && F.upsDanArrow === 'yes', '洞府阵与炼丹房写清下一级的产出/成功率');
  ok(F.masteryLine === 'yes', '炼丹面板显示匠道修为进度行');
  ok(F.upgDanLv === '1', '炼丹房升到 1 级');
  ok(F.upgForgeLv === '1', '炼器坊升到 1 级');
  ok(F.bldStates === 'yes', '建筑状态总览含 2 座生产建筑');
  ok(F.craftDan1 === '1', '炼丹房炼制下品破境丹入背包');
  ok(F.masteryExp1 === '10', '炼成一炉涨匠道经验 10（' + F.masteryExp1 + '）');
  ok(F.craftRate === '92', '1 级炼丹房下品丹成功率 90%+2%=92%（' + F.craftRate + '）');
  ok(F.craftWp4 === '4', '器师三阶 + 5 级炼器坊炼制极品法宝并装备');

  // 丹方收集（第 69 节）：正方炼够炉数参透旁方
  ok(F.danCodex0.indexOf('丹方 0 / 5') >= 0 && F.danAltRows0 === '0' && F.danHint0 === 'yes' && F.danAltLocked === 'no',
     '丹方面板初始 0/5，旁方不显示、行上提示 0/5 炉、未参透不可炼');
  ok(F.recipeN1 === '1' && F.recipeN5 === '5' && F.variantUnlocked1 === 'yes' && F.variantCount1 === '1',
     '正方每炼一炉记一次（' + F.recipeN1 + '），炼满 5 炉参透旁方');
  ok(F.variantNextName === 'dan2' && F.danAltRows1 === '1' && F.danCodex1.indexOf('丹方 1 / 5') >= 0,
     '参透后丹方 1/5，下一卷指向 dan2，面板多出一行旁方');
  ok(F.altPillGain === '1' && F.altMatLeft === '0' && F.recipeNAfterAlt === '5' && F.altSameOut === 'yes' && F.altMatsDiff === 'yes',
     '旁方产出同一丹药、扣自己的材料、不反向计数正方炉数');
  ok(F.altLockedBag === '0', '未参透的旁方即使直接调用也炼不出东西，不扣料');
  ok(F.dan2FamilyN === '4' && F.dan2AltUnlocked === 'yes' && F.dan2UnlockLog === 'yes',
     '同丹的另一条传统配方（旧妖丹方）也记炉数，第 4 炉参透骨引方并留日志');

  /* ===== 第 89 节 · 丹药四族九阶 ===== */
  ok(F.danTblN === '36' && F.danPerFam === '9,9,9,9' && F.danSegUniq === '36',
     '丹药四族 × 九阶共 36 枚，族内阶号不重不漏（' + F.danPerFam + '）');
  ok(F.danLegacyFive === '11111' && F.danBreakMatch === 'yes',
     '老五枚认祖归宗到破境族，BREAK_PILLS 九行的名称 / 段位 / 加成与丹表一一对上');
  ok(F.danRecipMatch === 'yes',
     '36 枚丹在 RECIPES 里都有一张炼丹房配方，fam / seg / out 三个字段自洽');
  ok(F.danOldNames === '下品破境丹,中品破境丹,上品破境丹,极品破境丹,大乘破境丹' &&
     F.danOldImgs === 'ui/icons/dan1.png,ui/icons/dan2.png,ui/icons/dan3.png,ui/icons/dan4.png,ui/icons/dan5.png',
     '老五枚的背包名称与图标一字未改（' + F.danOldNames + '）');
  ok(F.danSellGate === '20' && F.danSellTier === 'yes',
     '寄售口径仍按品阶：一~三阶共 20 枚收，四阶以上不收');
  ok(F.danBagMeta === '31',
     '31 枚新丹都有背包详情（族 / 阶 / 功效 / 来源），老五枚沿用原条目');
  ok(F.danHeads === '4' &&
     F.danHeadTxt === '破境族 · 九阶,聚灵族 · 九阶,淬体族 · 九阶,丰产族 · 九阶' &&
     F.danHeadArt === 'dan1.png,dan_jl.png,dan_ct.png,dan_fc.png',
     '炼丹房一页四段族签全展开，族头各带本族母图（' + F.danHeadArt + '）');
  ok(F.danRowsAll === '37' && F.danSegTags === '37' && F.danEffTags === '37',
     '族内 36 行正方 + 1 行旧妖丹方，每行都带阶签与功效文案（' + F.danRowsAll + ' 行）');
  ok(F.danBand === '4,9,8,8,8',
     '品阶色带按阶分布 1/2/2/3/3/4/4/5/5 阶 → 四 / 九 / 八 / 八 / 八 行（' + F.danBand + '）');
  ok(F.danGate === '110',
     '阶 = 大境界段：金丹期认第 3 阶九转金丹与第 2 阶正本，第 1 阶下品丹不再顶用');
  ok(F.danHerb0 === '3' && F.danBuffs === '0.3,0.24,0.9' &&
     F.danHookExp === 'yes' && F.danHookPow === 'yes' && F.danHookMine === 'yes' &&
     F.danHookHerb === '5' && F.danHerbLog === 'yes',
     '三枚 5 阶丹下肚：修炼 ×1.30、战力 ×1.24、矿脉 ×1.90、采药 3→5 株并留日志');
  ok(F.danBdLabels === '1,1' && F.danBdExpEq === 'yes' && F.danBdPowEq === 'yes',
     '丹药两个槽进了道行拆账（聚灵 / 淬体各一行），乘积仍与实时数值相等');
  ok(F.danExpire === '0,0,0',
     '三个槽一过期同时归零，不留悬挂倍率');
  ok(F.danPoExp === 'yes' && F.danPoBonus === '0.12' && F.danPoSlots === '0,0,0' && F.danPoLog === 'yes',
     '破境族服食照旧：立得修为 + 10 分钟内破境再 +12%，且不占另外三个槽');
  var danNewEat = (F.danNewEat || '').split('/');
  ok(danNewEat[0] === '引气丹' && /(^|,)eat(,|$)/.test(danNewEat[1]) &&
     danNewEat[2] === 'on' && danNewEat[3] === 'up' && danNewEat[4] === '0',
     '新族丹走的是同一条真人路径：详情框给「服食」、落进聚灵槽、道行速率真的涨了、格子被吃掉（' + F.danNewEat + '）');

  /* ===== 第 90 节 · 法器四族九阶 ===== */
  ok(F.artTblN === '36' && F.artPerFam === '9,9,9,9' && F.artSegUniq === '36',
     '法器四族 × 九阶共 36 枚，族内阶号不重不漏（' + F.artPerFam + '）');
  ok(F.artLegacyFour === '1111' && F.artRecipMatch === 'yes',
     '老四条 wp1..wp4 认祖归宗到灵器族，36 枚在 RECIPES 里都有炼器坊配方且 fam / seg / outLv 自洽');
  ok(F.artOldNames === '下品法宝,中品法宝,上品法宝,极品法宝' && F.artOldRates === '0.9,0.75,0.6,0.35',
     '老四条法宝的名称与成功率一字未改（' + F.artOldNames + '）');
  ok(F.artCurveLv === '1,2,3,5,6,7,8,9,10' && F.artCurveTier === '1,2,3,4,4,5,5,5,5',
     '九阶闸门递进：建筑等级 1→10、品阶 1→5（九阶要炼器坊满级）');
  ok(F.artMatsOre === 'yes',
     '每张法器图谱都吃矿石打底（老四条只有矿石，新图谱一定带招牌辅料）', F.artMatsOre);
  ok(F.artMatsUniq === 'yes' && F.artAuxMax === '130',
     '一张图谱里同一种材料只列一次，辅料另起一样且按份计量（单样上限 ' + F.artAuxMax + '）', F.artMatsUniq);
  ok(F.artStoneAll === '36' && F.artStoneUp === 'up',
     '三十六张图谱都收灵石，只列一行且逐阶只涨不跌（' + F.artStoneAll + ' 张 · ' + F.artStoneUp + '）');
  ok(F.artBossGate === '4,7,8,9,7,8,9,7,8,9,7,8,9',
     'Boss 料从七阶起登场（灵器族的极品法宝四阶就有），八阶一份、九阶两份（' + F.artBossGate + '）');
  ok(F.artHeads === '4' &&
     F.artHeadTxt === '灵器族 · 九阶,战器族 · 九阶,破器族 · 九阶,财器族 · 九阶' &&
     F.artHeadArt === 'weapon1.png,weapon2.png,weapon3.png,weapon4.png',
     '炼器坊一页四段族签全展开，族头各带本族母图（' + F.artHeadArt + '）');
  ok(F.artRowsAll === '36' && F.artSegTags === '36' && F.artEffTags === '36',
     '族内 36 行法器，每行都带阶签与功效文案（' + F.artRowsAll + ' 行）');
  ok(F.artBand === '9,9,9,9' && F.artSegTagTxt === '1 阶',
     '四族色带各九行，阶签从第 1 阶起（' + F.artBand + '）');
  ok(F.artEffTxt === '战力 +4% / 突破成功率 +1% / 灵石产出 ×1.06',
     '一阶三族的功效文案各走各的钩子（' + F.artEffTxt + '）');
  ok(F.artOwnedBtn === '已装备,炼制,已装备,炼制,已装备',
     '持有 4 / 5 / 9 阶时：同阶与低阶一律「已装备」，高一阶还能炼', F.artOwnedBtn);
  ok((F.artHeadOwn || '').indexOf('持有 5 阶') >= 0 && (F.artHeadOwn || '').indexOf('战力 +22%') >= 0,
     '族头写清持有阶与当前效果，不再是干巴巴的族名（' + F.artHeadOwn + '）');
  ok(F.artName9 === '九霄灵枢剑' && F.artMult9 === '1.85',
     '灵器九阶接上老法宝表：九霄灵枢剑 → 修炼 ×1.85（' + F.artName9 + '）');
  ok(F.artHookLq === 'yes' && F.artHookPow === 'yes' && F.artHookStone === 'yes' && F.artHookBrk === '0.1',
     '四槽九阶：修炼 ×1.85、战力乘区 ×1.56、灵石乘区 ×1.75、突破加算 +10%');
  ok(F.artBdLabels === '1/1' && F.artBdStoneEq === 'yes',
     '战器 / 财器进了道行拆账（战力 / 灵石各一行），乘积仍与实时数值相等');
  ok(F.artGuardFam === '5,1,1',
     '四族各判各的持有阶：同阶或低阶回炉一律拦下，一格灵石都不扣', F.artGuardFam);
  ok(F.artEquip === '5,3,0,1',
     '真炼一件战器 5 阶：只写 S.art.bg=5，灵器阶位与词条一格不动，日志点名战器');
  ok(F.artEquipLq === '5,4,玄光剑',
     '灵器 5 阶照老规矩：S.weapon 抬到 5、词条重掷满 4 条、名字仍从同一张表查', F.artEquipLq);
  ok(F.artNoBag === '1,18',
     '法器直接上身不进背包：背包塞满也照炼，只扣材料');
  ok(F.artEffectTxt === '修炼速度 ×1.85 / 战力 +56% / 突破成功率 +10% / 灵石产出 ×1.75',
     '九阶四族的效果文案与数值表一一对上（' + F.artEffectTxt + '）');

  /* ===== 第 85 轮补 · 减少动效全局兜底 + 截图脚本不再写 C 盘 ===== */
  const cssAll = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  ok((function(){
    const i = cssAll.lastIndexOf('@media (prefers-reduced-motion: reduce)');
    if(i < 0) return false;
    const blk = cssAll.slice(i);
    return /\*\s*,\s*\*::before\s*,\s*\*::after\s*\{/.test(blk) &&
           /animation-duration:\.001ms !important/.test(blk) &&
           /animation-iteration-count:1 !important/.test(blk) &&
           /transition-duration:\.001ms !important/.test(blk);
  })(), '减少动效有一条全局兜底（* / ::before / ::after 三选一收口，78 个 keyframes 不再逐条补）');
  ok((function(){
    const i = cssAll.indexOf('/* ---------- 全局动效兜底');
    const body = i < 0 ? cssAll : cssAll.slice(0, i);
    const bad = (body.match(/(?:^|;|\{)\s*(?:-webkit-)?(?:animation|transition)[^;{}]*!important/g) || [])
      .filter(d => !/animation:\s*none\s*!important/.test(d));
    return bad.length === 0;
  })(), '没有任何 !important 的动画/过渡能绕过那条兜底（有的话全局规则对它无效）');
  ok((function(){
    const dir = path.join(ROOT, 'shot');
    return fs.readdirSync(dir).filter(f => /^shot_.*\.js$/.test(f)).every(f => {
      const t = fs.readFileSync(path.join(dir, f), 'utf8');
      return t.indexOf('os.tmpdir()') < 0 || t.indexOf("fs.existsSync('D:/')") >= 0;
    });
  })(), 'shot/*.js 的浏览器 profile 一律落 D:/xx-scratch（C 盘零写入，D 不可用才退系统 temp）');
  ok((function(){
    /* 收口时用整段替换改过一遍，五个 token 的定义被换成了自引用（var 指自己），
       环会让整条缓动失效、静默退回默认 ease——这是一类能整块吃掉动效的错，值得单钉一条。 */
    const names = ['enter','pop','soft','snap','glide'];
    const defs = {};
    (cssAll.match(/--ease-[a-z]+:[^;}]+/g) || []).forEach(d => {
      defs[d.slice(2, d.indexOf(':'))] = d.slice(d.indexOf(':') + 1).trim();
    });
    const badDef = names.filter(n => !/^cubic-bezier\(/.test(defs['ease-' + n] || ''));
    if (badDef.length) return false;
    const refs = (cssAll.match(/var\(--ease-[a-z]+\)/g) || []);
    return refs.length >= 15 && refs.every(r => defs[r.slice(6, -1)]);
  })(), '五条缓动 token 各是一条 literal cubic-bezier，指向它们的引用全部能解析（不自引、不悬空）');

  // 材料账（第 73 节）：五处成本写法统一
  ok(F.lgDan.indexOf('灵草 2/5') >= 0 && F.lgDan.indexOf('灵石 20（不足）') >= 0,
     '炼丹行写材料持有/所需，灵石不够标「不足」（' + F.lgDan + '）');
  ok(F.lgDan.indexOf('失败返还 30% 材料（灵石不退）') >= 0,
     '炼丹行在点下去之前就写明失败返还口径（' + F.lgDan + '）');
  ok(F.lgDanBtn === '缺料' && F.lgDanOff === 'yes', '缺料时按钮写明「缺料」并禁用（' + F.lgDanBtn + '）');
  ok(F.lgForge.indexOf('矿石 0/200') >= 0 && F.lgForge.indexOf('（不足）') >= 0 && F.lgForgeBtn === '缺料',
     '炼器行同口径：矿石持有/所需、灵石价格不足、按钮「缺料」（' + F.lgForge + '）');
  ok(F.lgForge.indexOf('失败返还 30% 材料（灵石不退）') >= 0,
     '炼器行同样把失败返还口径写在前面（' + F.lgForge + '）');
  ok(F.lgUpRoom.indexOf('灵草 2/175') >= 0 && F.lgUpRoom.indexOf('灵石差') >= 0 && F.lgUpg === '进页',
     '房间内升级块写材料持有/所需并标灵石差；设施页全量镜像「进页」（' + F.lgUpRoom + ' / ' + F.lgUpg + '）');
  ok(F.lgEnh.indexOf('矿石 0/') >= 0 && F.lgEnh.indexOf('兽王精魄 0/1') >= 0 && F.lgEnh.indexOf('（不足）') >= 0,
     '强化消耗写矿石/Boss 材料缺口与灵石不足（' + F.lgEnh + '）');
  ok(F.lgDanOk === 'yes' && F.lgDanBtnOk === '炼制', '材料够了后不足标记消失、按钮回到「炼制」');
  ok(F.lgBagBtn === '背包满' && F.lgBagTxt === 'yes', '背包满时按钮写「背包满」，行内点明原因');

  // 妖兽扩充
  ok(F.boss10 === '妖虎·兽王/boss', '10 层 Boss = 妖虎·兽王（' + F.boss10 + '）');
  ok(F.boss20 === '蛟龙·妖王' && F.boss30 === '朱雀·仙灵', '20/30 层 Boss = 蛟龙/朱雀');
  ok(F.boss70 === '混沌·凶兽之祖', '70 层 Boss = 混沌（' + F.boss70 + '）');
  ok(F.boss7 === '妖狼/no', '非 10 层不出 Boss（第 7 层 ' + F.boss7 + '）');
  ok(!!F.towerMobName && /挑战第/.test(F.towerFightBtn || ''), '塔页有当前层妖兽与挑战按钮');

  // 秘境副本
  ok(F.secretShown === 'shown', '切秘境页成功');
  ok(F.secTotal0 === '0', '初始未通任何层');
  ok(F.secProg1 === '1' && F.secStone === 'yes', '挑战成功：荒山古洞 1 层 + 灵石');
  ok(String(F.secChip).indexOf('层') >= 0 && String(F.secChip).indexOf('灵石') >= 0,
     '秘境通关给即时反馈（右上角 chip：' + F.secChip + '）');
  ok(F.secLocked === 'yes', '境界不足的章节打不了（幽谷秘境）');
  ok(F.secSweep === 'yes' && F.secSweptFlag === '1', '扫荡给灵石并标记今日已扫');
  ok(F.secSweepOnce === 'yes', '每日只能扫荡一次');
  ok(F.secBossMat === '4', '秘境 hub 四章四格（' + F.secBossMat + '）');
  ok(F.secLeadCards === '1' && F.secCh0Boxes === '1' && F.secCh1Boxes === '1' && F.secCh1Tag === '1',
     '秘境拆页：卷首只留总览，一章一页、一页一章（卡 ' + F.secLeadCards + ' · 章框 ' + F.secCh0Boxes + '/' + F.secCh1Boxes + '）');
  ok(F.secHubSeal === '10/10 层', '秘境 hub 朱砂印写本章层数（' + F.secHubSeal + '）');
  ok(F.secCh0Done === '1', '尽通章节显示「已通关」（' + F.secCh0Done + '）');

  // 论剑台
  ok(F.arenaShown === 'shown' && F.arenaBld === 'true', '论剑台已实装并切页成功');
  ok(F.arHubCells === '3' && F.arHubCards === '0',
     '论剑台拆页：hub 三格，战绩 / 论剑榜 / 声望兑换各自一页（格 ' + F.arHubCells + ' · 卡 ' + F.arHubCards + '）');
  ok(F.foes === '6' && F.arenaRows === '6', '每日 6 个对手（' + F.foes + '）');
  ok(F.arenaLeft === '5', '每日 5 次切磋（' + F.arenaLeft + '）');
  ok(F.arenaLeftAfter === '4' && F.arenaFought === 'yes', '切磋后次数 -1、对手标记已打');
  ok(String(F.arenaChip).indexOf('声望') >= 0 && (String(F.arenaChip).indexOf('胜') >= 0 || String(F.arenaChip).indexOf('不敌') >= 0),
     '论剑胜负给即时反馈（右上角 chip：' + F.arenaChip + '）');
  ok(F.arenaRep === 'yes' && F.arenaStone === 'yes', '切磋给声望和灵石');
  ok(F.arenaBlocked === 'yes', '次数耗尽后无法再挑战');
  ok(F.shopRows === '7', '声望兑换 7 件（' + F.shopRows + '）');
  ok(F.shopFeather === 'yes' && F.shopHeart === 'yes', '声望店补朱雀羽 / 九尾心');
  ok(F.repDown === '470' && F.repItem === 'yes', '兑换扣声望并入库（剩 ' + F.repDown + '）');
  /* ---- 第 101 轮 · 起手式 ---- */
  ok(F.stArOpen === 'yes' && F.stArOpts === 'rush,guard', '论剑点切磋先弹起手式（两式：' + F.stArOpts + '）');
  ok(String(F.stArTitle).indexOf('论剑台') >= 0, '起手式题签写明场子（' + F.stArTitle + '）');
  ok(F.stArClosed === 'yes' && F.stArKept === 'yes', '关掉起手式＝没打：次数与对手都留着');
  ok(F.stRushWinStone === '0' && F.stRushWinRep === '15' && F.stRushWinBeat === 'yes',
     '抢攻胜：灵石 ×1.2、声望 ×1.5 真入账（差 ' + F.stRushWinStone + ' / 声望 ' + F.stRushWinRep + '）');
  ok(F.stGuardWinStone === '0' && F.stGuardWinRep === '10',
     '守拙胜：灵石 ×1.25、声望原样（差 ' + F.stGuardWinStone + ' / 声望 ' + F.stGuardWinRep + '）');
  ok(F.stRushLoseStone === '0' && F.stRushLoseRep === '3', '抢攻负：灵石 ×0.4 落袋（差 ' + F.stRushLoseStone + '）');
  ok(F.stGuardLoseStone === '0' && F.stGuardLoseRep === '3', '守拙负：灵石 ×1.25 兜底（差 ' + F.stGuardLoseStone + '）');
  ok(F.stSecOpen === 'yes' && F.stSecOpts === 'stone,mat', '秘境点挑战先弹探路（两路：' + F.stSecOpts + '）');
  ok(F.stSecClosed === 'yes/0', '关掉探路＝没闯：层数不动（' + F.stSecClosed + '）');
  ok(F.stSecStone === '0' && F.stSecStoneMat === '0' && F.stSecStoneProg === '1',
     '取财：灵石 ×1.6、不带材料、照样推一层（' + F.stSecStone + '/' + F.stSecStoneMat + '/' + F.stSecStoneProg + '）');
  ok(F.stSecMatStone === '0' && F.stSecMatBag === '2' && F.stSecMatProg === '2',
     '取料：灵石 ×0.6、材料 ×2、推一层（' + F.stSecMatStone + '/' + F.stSecMatBag + '/' + F.stSecMatProg + '）');
  ok(F.stSecFull === 'same/3', '背包满时取料一颗也塞不进，但层数照推、不崩（' + F.stSecFull + '）');
  ok(F.tier1 === '1', '声望 100 → 内门弟子段位（' + F.tier1 + '）');

  // 限时活动
  ok(F.eventShown === 'shown' && F.eventCards === '2', '限时活动页：左侧两张卡都接进来了');
  ok(F.evHubCells === '4' && F.evHubSeal === 'ok',
     '限时活动拆页：hub 四格，签到格上盖着「第 N 天」的印（格 ' + F.evHubCells + ' · 印 ' + F.evHubSeal + '）');
  ok(F.evUnionDeep === 'event_union', '左侧「仙盟争霸」卡的老锚点 xx-union 直达它自己那一页');
  ok(F.signDays === '7', '七日签到 7 格（' + F.signDays + '）');
  ok(F.signDay1 === '1' && F.signStone === 'yes', '签到成功并发奖（第 ' + F.signDay1 + ' 天）');
  ok(F.signTwice === '1', '同一天不能重复签到');
  ok(F.unionDay === '1', '仙盟争霸赛季第 1 天（' + F.unionDay + '）');
  ok(F.unionMerit === 'yes' && F.unionStone === 'yes', '出战给战功 + 灵石');
  ok(F.unionOnce === 'yes', '每日只能出战一次');
  ok(F.unionRows === '5', '战功兑奖 5 档（' + F.unionRows + '）');
  ok(F.unionClaimed === '1' && F.unionClaimOnce === '1', '兑奖生效且不能重复领');
  /* ===== 阶段二追加：N2/N4/N5/N6/N9/N10/N11/N13 ===== */
  ok(F.unionReset8 === '1/0/1', 'N4 第 8 天真结算：开新季、战功清零、回到第 1 天（' + F.unionReset8 + '）');
  ok(F.sitWisFirst === 'ok' && F.sitWisOnce === 'ok', 'N5 每日首次打坐 +50×境界系数，同日第二次不再给（' + F.sitWisFirst + '/' + F.sitWisOnce + '）');
  ok(F.petFeedTbl === '20,50,120,300,700,1600,3500,8000,18000', 'N6 喂食灵石固定九段表（' + F.petFeedTbl + '）');
  ok(F.latePassiveArr === '1/2.9/1.70', 'N2 后期被动：r<18 恒 1、r24=2.90、r21 实际速率 ×1.70（' + F.latePassiveArr + '）');
  ok(F.advFloor === '50,10,5', 'N9 历练低段守住原常量 50/10/5（' + F.advFloor + '）');
  ok(F.advScale === '111', 'N9 历练高段三档均按 need 缩放（' + F.advScale + '）');
  ok(F.heardCap === '5/5', 'N10 沈碑可听上限与分母统一为 5（' + F.heardCap + '）');
  ok(F.n10Path === '15/2/4/1', 'N10 最短 rel≥15 路径 = 8 次对话，第 8 次后「他为何守着」解锁（rel/stage/heard/可点 = ' + F.n10Path + '）');
  ok(F.pathDrift === 'ok', 'N11 道途九段矩阵漂移断言通过（' + F.pathDrift + '）');
  ok(Number(F.pathSpread) <= 8.0001, 'N11 每段四道途极差 ≤8pp（实测 ' + F.pathSpread + 'pp）');
  ok(F.pathCur === '1.08/1.00#1.08', 'N11 当前段取值：炼气剑 1.08 / 丹 1.00、元婴体 1.08（' + F.pathCur + '）');
  ok((F.pathCardTxt || '').indexOf('本段炼气期 +8% · 九段 +8/+6/+4/+2/0/0/+2/+4/+6') === 0,
     'N11 创角道途卡直读九段派生表（' + F.pathCardTxt + '）');
  ok(F.n13Usage === '11111', 'N13 五枚破境丹 usage 均无「握持」且均写「服食」（' + F.n13Usage + '）');
  ok(F.n13DeadPill === 'ok', 'N13 死丹 dan_juqi 文案不再宣称可服食');
  /* 阶段三 S1/S2/S3 回归 */
  ok(F.s1Mail === 'yes' && F.s1Pending === '1', 'S1 满包奖励进信匣（不丢失）：' + F.s1Mail + '/' + F.s1Pending);
  ok(F.s1Claim === '妖丹 ×1' && F.s1Pending2 === '0', 'S1 信匣取回真进背包：' + F.s1Claim + ' / 余 ' + F.s1Pending2);
  ok(F.s2Parts === 'yes' && F.s2Final === 'yes', 'S2 确认页拆账合计=raw、最终=判定口径');
  ok(F.s3Own === 'yes', 'S3 天机令持有数读主状态（主线发放后显示「持有 1」）');
  ok(F.s4Stable === 'yes', 'S4 签到按钮跨 1.3s 重绘仍在同一节点（点击吞没根治）');
  ok(F.s123EXC === undefined, 'S1/S2/S3/S4 回归块无异常', F.s123EXC);
  /* 阶段三收尾：S8 当日四类决策计数（制作人 2026-11-14 批准方案 A，六条） */
  ok(F.d0EXC === undefined, 'S8 当日四类决策回归块无异常', F.d0EXC);
  ok(F.d0New === '0000', 'S8 新档四键默认 0（res/risk/grow/social = ' + F.d0New + '）');
  ok(F.d0Mig === '0000/keep', 'S8 旧档缺 dec：真读档后补四 0，既有当日计数不被清（' + F.d0Mig + '）');
  ok(F.d0Dirty === '0001', 'S8 读档脏值只收 0/1：2 / "1" / -1 归 0（' + F.d0Dirty + '）');
  ok(F.d0Day === '0000', 'S8 跨天归零：昨日四 1 → 今日四 0（' + F.d0Day + '）');
  ok(F.d0Seq === '1000>1100>1110>1111', 'S8 四类真实动作逐一置 1：派弟子 → 入塔 → 喂食 → 议事（' + F.d0Seq + '）');
  ok(F.d0Reborn === '0000', 'S8 转世归零：当日四类决策不带到新世（' + F.d0Reborn + '）');
  /* R-S2-a：hidden 状态下的程序化确认不得涨境（handler 早退；disabled 只是顺手一层） */
  ok(F.s2HiddenEXC === undefined && F.s2HiddenOpened === 'yes' && F.s2HiddenNoBreak === 'yes' && F.s2HiddenStill === 'yes',
     'R-S2-a 确认页 hidden 时程序化 click / 直接调 _confirmBreak 都不涨境、不扣修为、不写日志，且弹窗保持隐藏（' +
     [F.s2HiddenOpened, F.s2HiddenNoBreak, F.s2HiddenStill].join(' / ') + '）', F.s2HiddenEXC);

  // 回归
  ok(F.sitGained === 'yes', '打坐修为增加');
  ok(Number(F.sitFloor) >= 0.009,
     '高境界手动操作按当前层需求兜底（第 22 层一次顿悟 ≥1%，不再是 0.0x%）',
     (100 * Number(F.sitFloor)).toFixed(2) + '%');
  ok(Number(F.capByRank) > 20 && Number(F.capByRank) < 30,
     '离线封顶随境界抬：第 24 层 30 小时离线按 ~25 小时结算，不是死守 8 小时',
     Number(F.capByRank).toFixed(1) + 'h');
  ok(F.capMsg.indexOf('本次结算封顶 ' + F.capExpTxt) >= 0 && F.capMsg.indexOf('未计') >= 0,
     '封顶提示写的是真实封顶值（离线实经 / 本次结算封顶 / 未计 三值同句）', F.capMsg);
  ok(F.breakReady === 'yes', '突破按钮正常');
  ok(F.breakCtaBg.indexOf('rgb(200, 82, 60)') >= 0 && F.breakCtaColor === 'rgb(247, 243, 233)',
     '该点的那一下是朱砂印（朱砂底 + 纸白字），不是旧版那块米底红字（' + F.breakCtaBg + ' · ' + F.breakCtaColor + '）');

  // 新手引导 js/guide_taixu.js（太虚真人 V1；2026-11-11 换代，旧 tutorial.js 下线）
  ok(F.legacyTutorialApi === 'undefined', 'window.Tutorial 随换代下线，页内已无此全局（现类型 ' + F.legacyTutorialApi + '）');
  ok(htmlSrc.indexOf('js/guide_taixu.js') >= 0, 'index.html 挂的是 js/guide_taixu.js');
  ok(htmlSrc.indexOf('js/tutorial.js') < 0, 'index.html 不再加载旧 js/tutorial.js（换代不留尸）');
  ok(F.guideLoaded === 'yes', 'guide_taixu.js 已加载并接入 boot（window.Guide）');
  ok(F.guideLegacyUi === 'none', '旧引导 DOM（tut-mask / tut-tip / tut-btn）不再存在（' + F.guideLegacyUi + '）');
  ok(F.guideOldSkip === 'ok', '旧档保护：有业务进度 + 无引导档 → 不建气泡、不写引导标记（' + F.guideOldSkip + '）');
  ok(F.guideStart === 'ok', '新档起盘：step 0 上台 + body.guide-active + data-guide-step=0 + started 入档（' + F.guideStart + '）');
  ok(F.guideEnterTxt === 'ok', '入场台词 = 太虚真人自报家门（' + F.guideEnterTxt + '）');
  ok(F.guideSkipBtn === 'ok', '气泡带「先别唠叨」跳过钮');
  ok(F.guideLocks0 === '6' && F.guideLocks1 === '5',
     '渐进解锁只做视觉：入场步 6 个目标变灰，教到打坐后那一格去灰、余 5（' + F.guideLocks0 + '→' + F.guideLocks1 + '）');
  ok(F.guideLockNow === 'clear/greyed', '已教的去灰、未教的仍灰（打坐格/守碑钮：' + F.guideLockNow + '）');
  ok(F.guideToSit === 'ok' && F.guideSitTxt === 'ok',
     'enter 是脚本化演出（auto 2600ms）→ 自动进「打坐」步（' + F.guideToSit + ' / ' + F.guideSitTxt + '）');
  ok(F.guidePollSit === 'ok', 'POLL 路径认权威状态：打坐计数 +1 后引导自己推进到突破步（不是猜点击）');
  ok(F.guideBrkTxt === 'ok', '突破步台词在位（' + F.guideBrkTxt + '）');
  ok(F.guideWrongStep === 'ok', 'complete() 只认当前步：错步返回 false 且步骤不动');
  ok(F.guideBrkComplete === 'ok' && F.guideFlagBrk === 'ok', '业务成功 → complete(brk) true 且写完成标记 flags.c_brk');
  ok(F.guideAfterTxt === 'ok', '本步有追叙台词时先播追叙（' + F.guideAfterTxt + '）');
  ok(F.guideBrkIdem === 'ok', '同一步重复 complete 幂等：返回 false 且不跳步');
  ok(F.guideAfterAdvance === 'ok', '追叙播完（2600ms）才进下一步（' + F.guideAfterAdvance + '）');
  ok(F.guideField === 'ok' && F.guideFieldAdvance === 'ok', '灵田步 complete → 进背包步');
  ok(F.guideDanCount === '1' && F.guideDanClaim === 'ok', '进背包步发 1 枚下品聚气丹 + 唯一凭证（枚数 ' + F.guideDanCount + '）');
  ok(F.guideDanSaved === 'ok', '丹药与领取凭证在同一份存档里（发丹即落盘，不空口发）');
  ok(F.guideToFlash === 'ok' && F.guideToHandoff === 'ok', '背包 3000ms / 举重若轻 3200ms 演出步自动走完并落到交接步');
  ok(F.guideFinish === 'ok', '收尾步 POLL 认「见过碑」（S.npcs.stele.met）→ 引导 done（档形 ' + F.guideSteleShape + '）');
  ok(F.guideFinishLog === 'ok', '收尾旁白进日志（去吧。后山那位…）');
  ok(F.guideOutBubble === 'ok' && F.guideLockCleared === '0', '引导收工：气泡隐藏 + guide-active 退 + 灰置清零（灰置 ' + F.guideLockCleared + '）');
  ok(F.guideResume === 'ok', '断点续走：气泡摘掉重挂后从 step 3 接着讲，不回第一步（' + F.guideResume + '）');
  ok(F.guideNoRepop === 'ok', '已完结再进不复发（只剩隐藏壳、不上台）');
  ok(F.guideSkip === 'ok' && F.guideSkipLog === 'ok', '点「先别唠叨」→ skipped+done、限制解除、无残留 UI、跳过旁白进日志');
  ok(F.guideTellOnce === '1', '跳过者补讲：同一系统首次打开只讲一次（本次 ' + F.guideTellOnce + ' 遍）');
  ok(F.guideTellSilent === '0', '没跳过的人不被补讲（本次 ' + F.guideTellSilent + ' 遍）');
  ok(F.guideResidue === '0/', '引导台词零开发残留（命中 ' + F.guideResidue + '）');
  /* ===== D-1 回归（制作人拍板 2026-11-13）：突破提示条上的丹药百分数 =====
     期望值全部动态来自 XX._dan.all[pillId].buff（= eatDan 真正写进 S.pillBonus 的那个数），
     一个百分数都不写死；境界表加段、丹药调数值时这两条跟着走，不需要改测试。 */
  const D1 = (F.d1Tips || '').split(',').map(function (r) {
    const p = String(r).split('/');
    return { pill: p[0], tip: p[1], buff: p[2], brk: p[3], kind: p[4] };
  });
  ok(D1.length === Number(F.d1TierN) && D1.every(x => x.pill !== undefined && x.kind === 'pill' && x.tip === x.buff),
     'D-1：' + F.d1TierN + ' 个境界段的突破提示条都挂着「💊 背包里有…点开服食」那句，句里的 +NN% 段段等于该丹服食到账值 buff（' + F.d1Tips + '）');
  { const d3 = D1.filter(x => x.pill === 'dan3')[0] || {};
    ok(d3.tip === d3.buff && Number(d3.tip) > 0 && d3.brk !== d3.tip,
       'D-1·dan3（上品破境丹）：提示 ' + (d3.tip || '?') + '% 等于 buff ' + (d3.buff || '?') +
       '%，且没退回旧的选丹口径 brk ' + (d3.brk || '?') + '%（两个口径确实不同值，断言不是空转；数字随表走）'); }

  // 渡劫天象（突破演出）
  ok(F.tribModal === 'yes' && F.tribHidden === 'yes', '渡劫遮罩在 DOM 且默认隐藏');
  ok(F.tribApi === 'object', 'trib.js 已加载（window.TRIB）');
  ok(F.tribPlaying === 'yes' && F.tribPhase === 'cloud', '突破即开演：劫云汇聚阶段 + busy 上锁');
  ok(F.tribRankDelta === '1', '演出不拦结算：境界照常 +1（' + F.tribRankDelta + '）');
  ok(F.tribStack === 'no' && F.tribDoneOnce === '0', '演出中重复触发不叠播、不重复收尾');
  ok(F.tribSkipR === 'true' && F.tribBreakShown === 'yes', '跳过 → 照常弹出突破结算');
  ok(F.tribBTitle.indexOf('突破成功') >= 0, '结算文案：突破成功（' + F.tribBTitle + '）');
  ok(F.tribFailOk === 'fail' && F.tribFailPhase === 'cloud', '失败路径同样开演（劫雷压顶）');
  ok(F.tribFailRank === 'same' && F.tribFailExp === 'less', '失败演出不改数值逻辑：境界不变、修为照扣');
  ok(F.tribZ === '80' && F.tribPe === 'none', '渡劫层置顶（z80）且不挡挂机点击');
  ok(F.tribUrl === 'no', '渡劫层纯 CSS 零图片（无 url()）');
  ok(F.tribBoltAnim.indexOf('tribBolt') >= 0, '劫雷动画就位（' + F.tribBoltAnim + '）');
  ok(F.tribCapFont.indexOf('KaiTi') >= 0, '渡劫字幕楷体');

  // 历练 · 文字冒险
  ok(F.advEvents >= 3, 'adventureEvents 随机事件 ' + F.advEvents + ' 个（≥3）', F.advEvents);
  /* D-008：扩容后升级为「规模 18 + 全表结构 + action 合法 + id 唯一 + 无 HTML」契约 */
  ok(F.advStructN === '18' && F.advStructMeta === '0' && F.advStructAction === '0' &&
     F.advStructDup === '0' && F.advStructHtml === '0' && F.advStructIds === 'yes',
     'D-008 历练池 18 条结构合法（n=' + F.advStructN + ' meta坏=' + F.advStructMeta +
     ' action坏=' + F.advStructAction + ' 重复id=' + F.advStructDup + ' html坏=' + F.advStructHtml +
     ' id连续=' + F.advStructIds + '）');
  ok(F.advOpen === 'ok', '点历练 → 古风弹窗显示事件描述');
  ok(F.advOpts === '2', '事件展示 2 个选项');
  ok(F.advActs === 'ok', '历练次数/冷却照常计数');
  ok(F.advWin === 'ok', '迎战必胜：按当前层需求缩放灵石（高段 ' + F.advWinD + '）+ 弹窗结果 + 顶部资源栏刷新');
  ok(F.advClose === 'ok', '点「继续赶路」关闭对话框');
  ok(F.advLose === 'ok', '迎战必败：损失 10 修为');
  ok(F.advEscape === 'ok', '绕道而行：明哲保身 +5 修为');

  // 天骄榜
  ok(F.rankPanel === 'true', '天骄榜面板经城镇入口注入');
  ok(F.rankRows === '31', '榜单 30 NPC + 玩家共 31 行（' + F.rankRows + '）');
  ok(F.rankTop3 === 'yes', '前三名金/银/铜高亮');
  ok(F.rankMe === 'true', '玩家在榜且有专属青光高亮行');
  ok(Number(F.rankMePos2) < Number(F.rankMePos), '法宝强化 + 神品战力词条 → 名次实时上升（第 ' + F.rankMePos + ' → 第 ' + F.rankMePos2 + ' 名）');

  /* ===== 主线《断天门》：进程内触发（2026-10-25 第 51 节口径）===== */
  ok(F.storyNoEntry === 'no', '城镇不再有「断天门」入口——主线不是要去点的地方');
  ok(F.storyModalInDom === 'yes', '剧情浮片挂在主 DOM（挂机中随时可弹，不被面板重建冲掉）');
  ok(F.storyTotal === '24', '主线表 24 段（五章；1-4b 上线后 23→24）（' + F.storyTotal + '）');
  ok(F.storyRK === '金丹初期/元婴初期/化神初期', '境界常量与 RANK_NAMES 对齐（12/15/18，不是原稿的 7/13/19）', F.storyRK);
  ok(F.storySecSum === '10', '秘境进度按四章层数求和（数组不能直接比较）', F.storySecSum);
  ok(F.story42Need === '1', '榜九的灯改二值判定（进前十五即达成，不是只有第一名）', F.story42Need);
  ok(F.storyFirst === 'open' && F.storySecond === 'lock', '串行链：第一段已开、第二段还锁着', F.storyFirst + '/' + F.storySecond);
  ok(F.storyYieldBattle === 'yes', '战斗弹窗在台上时剧情让路（叙事不盖玩法）', F.storyYieldBattle);
  ok(F.storyAutoShown === 'yes', '条件达成 → 剧情自己弹出来，不需要去点任何入口', F.storyAutoShown);
  ok(F.storyAutoName === '碑上无名' && F.storyAutoText.length >= 4, '浮片内容是该段的名目与正文', F.storyAutoName + '/' + F.storyAutoText);
  ok(F.storyGain === 'yes', '浮片上写明所得', F.storyGain);
  ok(F.storyWisGain === 'yes', '奖励当场入账（原稿丢了 wisdomGain 的返回值）');
  ok(F.storyRec === 'yes', '记进 S.story.claimed（这是唯一新增写入）');
  ok(F.storyHintLog === 'yes' && String(F.storyHintTxt).indexOf('洞府') >= 0,
     '结算完在日志里落一句「下一步」——指路得递到玩家每天都看的地方', F.storyHintTxt);
  ok(F.storyNoStack === 'no', '卡片在台上时不叠第二张');
  ok(F.storyClosed === 'yes', '点「继续」即收');
  ok(F.storyNextAuto === 'yes' && F.storySeg2 === '1-2', '间隔过去后下一段自己接上（不回流到玩家手里）', F.storyNextAuto + '/' + F.storySeg2);
  ok(F.storyTripleN === '6' && F.storyTripleSeg === 'merge',
     '4 段同时达成（1-3/1-4/1-4b/1-5）→ 按既有 MERGE_AT 出一张补记卡', F.storyTripleN + '/' + F.storyTripleSeg);
  const tripleNames = String(F.storyTripleList || '').split('、').filter(Boolean);
  ok(tripleNames.length === 4 && tripleNames.indexOf('塔门口的数') >= 0,
     '补记卡把 4 段名目全列出来（一张不漏）', F.storyTripleList);
  ok(F.storyTripleStop === 'yes' && F.storyTripleClaimed === '6', '队空才收手，奖励全在（' + F.storyTripleClaimed + ' 段）');
  ok(F.storyMergeN === '15' && F.storyMergeSeg === 'merge',
     '老档一次补 15 段 → 不逐段演，改出一张补记卡（' + F.storyMergeSeg + '）', F.storyMergeN + '/' + F.storyMergeSeg);
  ok(F.storyMergeName === '补记 · 十五段' && String(F.storyMergeHead).indexOf('至') >= 0,
     '补记卡抬头：' + F.storyMergeHead + ' / ' + F.storyMergeName);
  ok(String(F.storyMergeList).split('、').length === 15, '补记卡把 15 段名目全列出来（不剧透正文，只给名目）', F.storyMergeList);
  ok(String(F.storyMergeGain).indexOf('悟道值') >= 0 && String(F.storyMergeGain).indexOf('灵石') >= 0,
     '补记卡的所得按类型累加（不是 15 行流水）', F.storyMergeGain);
  ok(F.storyMergeJump === 'yes', '补记卡上有「去看履历」入口（正文在那）');
  ok(String(F.storyMergeHint).indexOf('元婴') >= 0, '补记之后仍落一句下一步（' + F.storyMergeHint + '）');
  ok(F.storyGapFirst === '1-2' && F.storyGapWait === 'yes',
     '两张浮片之间至少隔 6 秒：同一秒里又达成一段，只排队不怼上来', F.storyGapFirst + '/' + F.storyGapWait);
  ok(F.storyGapQueued === '1' && F.storyGapRec === 'yes',
     '排着的那段奖励已经先记进账（演是演出，结算不等人）', F.storyGapQueued + '/' + F.storyGapRec);
  ok(Number(F.storyLogItems) >= 6, '人物面板有履历：' + F.storyLogItems + ' 段已发生');
  ok(String(F.storyLogSub).indexOf('已走过') >= 0, '履历抬头写清走过几段（' + F.storyLogSub + '）');
  ok(F.storyLogNow === '1' && F.storyLogHint === 'yes', '履历末尾是当前这一段 + 下一步指路');
  ok(F.storyDeep === 'role_story' && F.storyDeepDepth === '2',
     '断天门锚点深链直达「断天门」独立页（' + F.storyDeep + ' · 栈深 ' + F.storyDeepDepth + '）');
  ok(F.storyKeep === 'done' && F.storyDirty === '-', '二次 init 幂等，脏 id 被丢');

  /* ===== 悟道树（2026-10-25 第 59 节）===== */
  ok(F.wuRows === '3' && F.wuNodes === '15', '悟道树三路 / 十五节点', F.wuRows + '/' + F.wuNodes);
  ok(F.wuLit === '0', '未点时一个节点都不亮', F.wuLit);
  ok(Number(F.wuCost) > 3000 && Number(F.wuCost) < 3500,
     '价 = 基础 200 × 境界系数 1.15^20（2026-11-19 首层 400→200 已批）', F.wuCost);
  ok(F.wuBuyOk === 'true' && F.wuDanLv === '1', '点一层成功，等级 +1', F.wuDanLv);
  ok(F.wuExpUp === 'yes', '「归一」真的接进修炼速度（不是只改数字）');
  ok(Number(F.wuPaidTracked) > 0, '实付额被记下来（洗点要按它退，不能按现价）', F.wuPaidTracked);
  ok(F.wuRespecOk === 'true' && F.wuRespecBack !== '0', '可洗点', F.wuRespecBack);
  ok(Math.abs(Number(F.wuRespecBack) / Number(F.wuPaidTracked) - 0.8) < 0.001,
     '洗点返还实付的 80%（两成散在风里）', F.wuRespecBack + ' / ' + F.wuPaidTracked);
  ok(F.wuAfterRespec === '0/0', '洗完等级与实付都归零', F.wuAfterRespec);
  ok(F.wuExpBack === '1', '洗完乘数回到 1', F.wuExpBack);
  ok(F.wuMaxLv === '5', '每路封顶 5 层（第 68 节扩层）', F.wuMaxLv);
  ok(Math.abs(Number(F.wuCostL4) / Number(F.wuCostL1) - 17.5) < 0.01 &&
     Math.abs(Number(F.wuCostL5) / Number(F.wuCostL1) - 25) < 0.01,
     '后两层价格走同一境界系数（3500 / 5000 基础价，首层 200）', F.wuCostL4 + ' / ' + F.wuCostL5);
  ok(F.wuSwordPct === '52', '五层加成累计正确（锋芒 8+8+10+12+14）', F.wuSwordPct);
  ok(F.wuBuyAtMax === 'false', '满级后再点被拒（不白扣悟道值）');

  /* ===== 山门 · 弟子（第 61 节）=====
     它要同时满足三件事：① 是真金白银的灵石出口（扣钱、有上限、上限随品阶变）；
     ② 差事是"时间闭环"，不到点不许结算、到点必落账（离线也补）；
     ③ 面板上的按钮真能点（不是只有函数能调）。 */
  ok(F.gateCard === 'yes', '宗门面板有山门名册');
  ok(/灵石/.test(F.gateLockedCost || ''), '未立山门时按钮写明开山价（' + F.gateLockedCost + '）');
  ok(F.gateBuildOk === 'true' && F.gateLv === '1', '开山立派成功（品阶 1）', F.gateLv);
  ok(F.gateCostPaid === 'yes', '开山真的扣了灵石');
  ok(F.gateCap === '4', '五品山门容纳 4 名弟子', F.gateCap);
  ok(/五品/.test(F.gateLvName || ''), '面板标题写出品阶与人数（' + F.gateLvName + '）');
  ok(F.gateRec === 'yes' && F.gateAptRange === 'ok', '收徒成功且资质落在 1~5');
  ok(F.gateCards === '1' && F.gateEmptySlots === '3', '名牒一张 + 空位三张（容量看得见）', F.gateCards + '/' + F.gateEmptySlots);
  ok(F.gateBtnInDom === 'yes' && F.gateBusyAfterClick === 'yes' && F.gateCardBusy === '1',
     '点面板上的「闭关」真派出去了（名牒转成外表态）', F.gateBusyAfterClick + '/' + F.gateCardBusy);
  ok(F.gateSettleN === '1' && F.gateExpUp === 'yes' && F.gateFreed === 'idle',
     '闭关到点结修为，弟子回山待派', F.gateSettleN + '/' + F.gateExpUp + '/' + F.gateFreed);
  ok(/弟子回山/.test(F.gateLog || '') && /修为/.test(F.gateLog || ''), '回山只落一行汇总日志（' + (F.gateLog || '').slice(0, 28) + '…）');
  ok(F.gateHerbUp === 'yes', '采药落灵草');
  ok(F.gateOreUp === 'yes' && F.gateWisUp === 'yes', '巡山落矿石 + 悟道值');
  ok(F.gateNotYet === 'yes', '时辰未到不结算（不能点一下就回山）');
  ok(F.gateFull === 'blocked' && F.gateFullBtn === 'disabled', '收满即拒，按钮同步置灰');
  ok(F.gateUpOk === 'true' && F.gateLv2 === '2/6', '升品阶 → 二品，名额 6', F.gateLv2);
  ok(F.gateRecruitAgain === 'yes', '升品阶后又能收徒');
  ok(F.gateOffline === 'idle', '离线 8 小时回来，弟子的闭关照常结清（人不在也走）', F.gateOffline);
  ok(F.gateLockedAtLow === 'yes' && /筑基/.test(F.gateLockedHint || ''), '未筑基时按钮禁用并说明缘由');

  /* ===== 弟子成长（第 62 节）：点化 / 出师 / 门风 ===== */
  ok(Number(F.aptCost) > 0, '点化有价（一层收入的 12%）：' + F.aptCost);
  ok(F.aptBtnN === '2', '未到天阶的名牒上，资质签是可点的按钮', F.aptBtnN);
  ok(F.aptUp === '3/paid', '点资质真的提一档且只扣一份价（' + F.aptUp + '）');
  ok(/玄阶/.test(F.aptChip || ''), '点完当场换字（' + (F.aptChip || '').trim() + '）');
  ok(F.aptMaxBtn === '1' && F.aptMaxReject === 'false', '天阶到顶：签变回死字，硬点也拒（剩 ' + F.aptMaxBtn + ' 个可点）');
  ok(F.aptBusyReject === 'false/kept' && F.aptBusyNoBtn === '0',
     '人不在山上点化不了：不给按钮、不扣灵石');
  ok(F.gradNotYet === 'no', '差事不满六趟，出师条件不成立');
  ok(F.svcUp === '6', '每结一趟差事，趟数 +1（' + F.svcUp + '）');
  ok(F.gradBtnN === '1', '满六趟的名牒上冒出「出师」按钮', F.gradBtnN);
  ok(F.gradOk === 'true' && F.gradLeft === '2>1', '出师后弟子上山名录里少一个（' + F.gradLeft + '）');
  ok(F.gradGain === '0', '出师回馈按「一层收入 × 0.20 × 资质/3」入账，不多不少');
  ok(F.gradN === '1' && /出师/.test(F.gradLog || ''), '出师计数 +1 并落一行日志（' + (F.gradLog || '').slice(0, 20) + '…）');
  ok(F.fengPct === '2' && F.fengMult === '1.12', '门风：出师一人 → 差事收益 +2%（总倍率 ' + F.fengMult + '）');
  ok(/门风 \+2%/.test(F.fengShown || ''), '面板上把门风单独标出来（' + (F.fengShown || '').trim() + '）');
  ok(F.gradSlotBack === 'open', '空出的位子立刻能再收徒（名册是流水，不是永久格子）');

  /* 弟子的话（第 63 节）—— 一句话三个要求：确定了、会变、真写进名牒 */
  ok(/[\u4e00-\u9fa5]/.test(F.voiceTxt || '') && !/^差事 \d+\/\d+$/.test(F.voiceTxt || ''),
     '名牒上写着一句人话，不再是干巴巴的进度（' + (F.voiceTxt || '') + '）');
  ok(F.voiceNum === '差事 0/6', '出师门槛还在它右边（' + F.voiceNum + '）');
  ok(F.voiceSame === 'same', '同一状态永远同一句（不随机，500ms 重绘不会闪字）');
  ok(F.voiceTier0 === '0' && F.voiceTier3 === '3/changed',
     '趟数分四档，走满六趟会换四次话（' + F.voiceTier0 + ' → ' + F.voiceTier3 + '）');
  ok(F.voiceNum3 === '差事 5/6', '换话之后门槛数字跟着走（' + F.voiceNum3 + '）');
  ok(F.voiceAptDiff === 'diff', '同样走满六趟，天阶与凡骨说的不是一句');
  ok(F.voiceLibBad === '', '四十句台词都非空且不超一行长度（' + (F.voiceLibBad || 'ok') + '）');
  ok(F.runVoice === 'changed/changed', '连做两趟同一件事就换话，再连着做又换一档（' + F.runVoice + '）');
  ok(F.runTaskDiff === 'diff', '同样是连三趟，采药与巡山说的不是一句');
  ok(F.runCount === '1/herb/0 → 2/herb/1 → 1/patrol/0',
     '记事：同一件事往上数，换一件事就从头数（' + F.runCount + '）');
  ok(F.voiceTaskBad === '', '三十六句记事台词都非空且不超一行（' + (F.voiceTaskBad || 'ok') + '）');
  ok(F.homeSay1 === 'silent' && F.homeSay3 === 'silent' && F.homeSay5 === 'silent',
     'run=1/3/5 的那一趟不开口，话不满日志（' + F.homeSay1 + '/' + F.homeSay3 + '/' + F.homeSay5 + '）');
  ok(F.homeSay2 !== '' && F.homeSay2In === 'in', '连做两趟回山，弟子在日志里主动开口（' + F.homeSay2 + '）');
  ok(F.homeSay4In === 'in' && F.homeSay6In === 'in', '连到四趟有意见、满六趟临行，各说一句');
  ok(F.homeCap === '2/丙,丁', '单次结算全山门最多两句，多出的不落（' + F.homeCap + '）');
  ok(F.homeLibBad === '', '十八句回山短评都非空且不超一行（' + (F.homeLibBad || 'ok') + '）');
  ok(F.blessSay !== '' && F.blessSayIn === 'in', '点化当场，弟子说一句自己的反应（' + F.blessSay + '）');
  ok(F.blessCnt === '1' && F.blessPaid === 'paid', 'bless 记上账，点化照旧只扣一份价');
  ok(F.blessOrder === 'yes', '弟子的话压在系统账目行上面');
  ok(F.farewellIn === 'in', '被点化过的弟子出师，告别语是"记得你"那句');
  ok(F.farewellPlain === 'plain', '没被点化过的，告别语还是吃用那句');
  ok(F.blessLibBad === '', '十句记忆台词都非空且不超一行（' + (F.blessLibBad || 'ok') + '）');

  /* ===== 回归：真人开局链路（2026-10-25 修的两处 P0）=====
     ① 引导第三步让玩家点【突破】，但引导自己的点击锁把突破按钮拦掉 → 境界永远是 0、
        引导停死在 step 3、完成标记写不上，刷新回来继续卡。
     ② 同一层锁把突破结算弹窗的「继续修行」也拦了 → 打完突破关不掉结算，整局卡死。
     这里用全新存档真点一遍：创角 → 引导 → 打坐 → 突破 → 渡劫 → 结算 → 踏入练气。 */
  const onbFile = path.join(TMP, '._onboard.html');
  const ud3 = path.join(SCRATCH, 'xxonb' + process.pid + '_' + Date.now());
  /* ⚠️ 事件驱动，不是时间驱动（2026-10-25 第 59 节修）：
     原来写死了 t<600 点创角、t>=1600 补修为、t>=2400 点突破 —— 机器一忙（跑完前面几百条用例之后），
     虚拟时间跑到这些刻度时页面可能还没 boot 完，于是"什么都没发生"，却报成产品失败。
     连跑三次能复现一次，这是**测试自身的不稳定**，比没有测试更糟。
     现在改成：看到谁就点谁，条件一满足立刻收工；只在"确实没进展"时才补修为。
     ⚠️ 换代重写（制作人拍板 2026-11-13，落码第 2 项）：驱动认的还是旧引导那一套
     （tut-mask / tut-btn / localStorage.hasFinishedTutorial 在现行 DOM 与存档里都不存在了），
     而且创角那一下没点道途 —— confirmChar 在 game.js:11579 直接 return，弹窗不关、boot 不下去，
     #sc-break 根本没机会出现，于是 rank 永远 0（旧驱动插桩实测见 probe_old_onboard.out，逐 tick 记录）。
     现行口径：创角 = 选道途 + 取名 + 确认；收工 = S.guide.done（并核对真落盘）；
     七步按 window.Guide 的 step 索引逐条真点（打坐 / 突破 / 灵田开垦播种 / 顶栏【人物】→ 识人格子）。 */
  const onbInj = `<script>
var O={},t=0,idle=0,seen={};
function sh(id){var e=document.getElementById(id);if(!e||e.classList.contains("hidden"))return false;return getComputedStyle(e).display!=="none";}
function q(sel){var e=null;try{e=document.querySelector(sel);}catch(err){}if(!e){O.missN=(O.missN||0)+1;O.missLast=sel;}return e;}
function clk(sel,tag){var e=q(sel);if(!e)return 0;e.click();O["hit_"+tag]=(O["hit_"+tag]||0)+1;return 1;}
function gstep(){var g=XX._s.guide;return g?g.step:-1;}
function done(why){if(O.done)return;O.done=1;O.why=why;O.t=t;O.rank=XX._s.rank;O.steps=Object.keys(seen).join(",");
  var g=XX._s.guide||{};O.gdone=g.done===true;O.gskipped=g.skipped===true;O.gflags=Object.keys(g.flags||{}).sort().join("+");
  try{var j=JSON.parse(XX._saveText());O.gsave=!!(j.guide&&j.guide.done);}catch(e){O.gsave="ERR";}
  var b=document.getElementById("taixu-bubble");O.bub=b?(b.style.display==="none"?"hidden":"shown"):"nodom";
  O.locks=document.querySelectorAll(".guide-locked").length;
  var tr=document.getElementById("sc-trail");O.trail=tr?(tr.hidden?"hidden":"shown"):"noEl";
  O.claimed=Object.keys((XX._s.story||{}).claimed||{}).length;
  O.dan=(XX._s.bag||[]).filter(function(x){return x&&x.t==="dan1";}).length;
  O.legacy=localStorage.getItem("hasFinishedTutorial");
  document.title=JSON.stringify(O);}
var STEP=["enter.a","enter.b","sit","sit.b1","sit.b2","brk.pre","brk","field.intro","field.joke","field","bag","flash.a","flash.b","handoff"];
setInterval(function(){
  if(O.done)return;
  t+=200;
  if(typeof XX==="undefined"||!XX._s){O.waitN=(O.waitN||0)+1;return;}
  var st=gstep();seen["s"+st]=1;
  /* R-4 逐拍采样（2026-11-14 第 3 轮拍板）：真气泡在台的每一拍都记一次，同时记这一刻纸签在不在、
     有没有让位。DIAG 里那次是单点取样，这里是整段引导过程的逐拍账 —— 两套指引同屏（R-3）
     到底有没有真发生过，只认这个。bothNo = 气泡在台但纸签压根不在 DOM（切到灵田/人物页时）。 */
  var bb=document.getElementById("taixu-bubble");
  if(bb&&bb.style.display!=="none"){O.bubOn=(O.bubOn||0)+1;
    var tb=document.getElementById("sc-trail");
    if(tb&&!tb.hidden){O.bothOn=(O.bothOn||0)+1;
      /* R-3 更正轮补的证据位（不改判据）：把同屏那几拍的毫秒与当时的两个判据输入记下来，
         红了就直接能从末行读出「是哪几拍、判据在不在」，不必再开探针。 */
      if((O.bothAt=O.bothAt||[]).length<12)O.bothAt.push(t+"ms/gcls"+(document.body.classList.contains("guide-active")?1:0)+
        "/bub="+bb.style.display);
    }
    else if(!tb){O.bothNo=(O.bothNo||0)+1;}
    else{O.bothOff=(O.bothOff||0)+1;}}
  if(sh("char-modal")){                                   /* 创角：道途四选一必点，否则 game.js:11579 挡回 */
    if(!q("#char-path-picks .char-pick.active")){
      var p=q("#char-path-picks .char-pick[data-path]");
      if(p){O.path=p.getAttribute("data-path");p.click();}else O.path="MISSING";}
    var ni=document.getElementById("char-name");if(ni)ni.value="问心";
    clk("#char-confirm","confirm");return;}
  if(sh("trib-modal")){clk("#trib-skip","trib");return;}
  if(sh("break-modal")){O.brkModalSeen=1;clk("#b-close","bclose");return;}
  if(sh("story-modal")){                                    /* 主线卡也会压上来（A/B 探针实测 tick4-12 可见）。
       与 _playtest.js:210 的 __clearPopups 同口径点掉它，但不 return —— 拦路的一向只有 trib/break 两个，
       主线卡只是蹭屏；写死 return 会把引导驱动一起卡住。 */
    O.stoN=(O.stoN||0)+1;if(O.stoN<=3)clk("#sto-close","sto");}
  var g=XX._s.guide||{};
  if(g.done){done("guidedone");return;}
  if(st>=0&&STEP[st]!=="enter.a"&&STEP[st]!=="enter.b"){var tr0=document.getElementById("sc-trail");O.trailOnStage=tr0?(tr0.hidden?"hidden":"shown"):"noEl";}
  var id=STEP[st];
  /* 2026-11-20 B1 乙案 14 拍：台词拍点气泡推进 */
  if(id!=="sit"&&id!=="brk"&&id!=="field"&&id!=="handoff"){
    var bbq=document.getElementById("taixu-bubble"); if(bbq) bbq.click(); return;
  }
  if(id==="sit"){clk('#sc-acts .cave-act[data-k="sit"]',"sit");return;}
  if(id==="brk"){
    var need=XX._need(XX._s.rank),b=document.getElementById("sc-break");
    if(!O.brked){
      if(XX._s.exp<need){XX._s.exp=need+60;XX._render();O.refuelN=(O.refuelN||0)+1;}
      /* D-5 控骰（第 4 单批复·方案①，2026-11-14）：attemptBreakthrough 里的 if(Math.random() < p) 是真掷骰，
         炼气段 p=0.90（BREAK_TIERS[0].base，下限 BAL.breakMin=0.05），不控骰就会同码同档一遍绿一遍红（改前 2/16）。
         只在点这颗钮的这一拍把骰子钉成 0（breakChanceWith 出口有 Math.max(breakMin,…) 兜底，0 恒小于任何 p），
         点完当场还原 —— 写法照本文件 "// 必成" 那两支先例。O.before 仍在 click 之前取，下面三条 ON.* 判据一字未动。 */
      if(b&&!b.disabled){O.brked=1;O.before=XX._s.rank;
        var brkRnd=Math.random;Math.random=function(){return 0;};
        b.click();
        /* 阶段三 S2：突破入口先弹确认页，再点确认才真破。
           判据按负责人第 2 条收紧：必须判「确认页真的开着」，不是只看按钮存在/未禁用 ——
           初始 #bc-ok 已带 disabled，开页时按可否突破启用；confirmBreakNow 自 R-S2-a 起
           也有 hidden 早退，但这里仍显式判非 hidden，不把 UI 的 disabled 当成流程契约
           （#sc-break 走直破分支时仍可能拿到一个未禁用的确认钮）。 */
        var bcm=document.getElementById("break-confirm-modal");
        var bc=document.getElementById("bc-ok");
        if(bcm&&!bcm.classList.contains("hidden")&&bc&&!bc.disabled) bc.click();
        Math.random=brkRnd;O.hit_brk=1;}}
    return;}
  if(id==="field"){
    clk("#sc-field","fieldNode");
    var buy=document.getElementById("xx-field-buy");
    if(buy&&buy.disabled&&XX._s.stone<20000){XX._s.stone=20000;XX._render();O.stoneGiven=(O.stoneGiven||0)+1;}
    clk("#xx-field-buy","fieldBuy");
    var pl=q("#xx-plots .plot.empty");
    if(pl){pl.click();O.planted=1;}
    return;}
  if(id==="handoff"){                                     /* 真点底部【人物】签，再点人物页里的「识人 · 沈碑」 */
    if(!document.getElementById("npc-topics")){
      if(!O.roleHub){clk('.scene-tab[data-tab="role"]',"roleBtn");O.roleHub=1;return;}
      clk('#panel-host [data-role-jump="xx-role-npc"]',"npcCell");return;}
    return;}
  idle++;if(idle>=8){idle=0;O.stuckAt=(O.stuckAt||0)+1;}
},200);
setTimeout(function(){done("timeout");},25000);</scr` + `ipt>`;
  PAGE.writePage(onbFile, html.replace('</body>', onbInj + '\n</body>'), 'utf8');
  let ON = {};
  try{
    const odom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run',
      '--user-data-dir=' + ud3, '--virtual-time-budget=45000', '--window-size=900,1200',
      '--dump-dom', 'file:///' + onbFile.replace(/\\/g, '/')],
      { encoding: 'utf8', timeout: 180000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const mt2 = odom.match(/<title>([^<]*)<\/title>/);
    ON = mt2 ? JSON.parse(mt2[1]) : {};
  }catch(e){ ON = { err: String(e).slice(0, 80) }; }
  ok(ON.before === 0 && Number(ON.rank) >= 1 && ON.gskipped === false,
    '新人点【突破】真的突破成功（现行引导只变灰不拦点击，也没靠「跳过」抄近路）',
    JSON.stringify({ before: ON.before, rank: ON.rank, gskipped: ON.gskipped, why: ON.why, t: ON.t, steps: ON.steps }));
  ok(ON.gdone === true && ON.gsave === true && (ON.bub === 'hidden' || ON.bub === 'nodom') && Number(ON.locks) === 0 &&
     ON.brkModalSeen === 1 && Number(ON.hit_bclose) >= 1 && ON.trail === 'shown',
     '突破结算关得掉、现行引导走完并落盘：S.guide.done + 存档里 done + 气泡与灰置无残留 + 纸签接上',
     JSON.stringify({ gdone: ON.gdone, gsave: ON.gsave, bub: ON.bub, locks: ON.locks, brkModal: ON.brkModalSeen,
       bclose: ON.hit_bclose, trail: ON.trail, gflags: ON.gflags, why: ON.why, t: ON.t, steps: ON.steps,
       missLast: ON.missLast, stuckAt: ON.stuckAt }));
  try { fs.rmSync(ud3, { recursive: true, force: true }); } catch (e) {}
  /* R-4 新增（只追加，上面两条一字未动）：真人开局页逐拍采样出来的同屏账。
     ↓ 更正（本单要求 2）：R-3 已在 game.js:9577-9580 修复，这段注释原先预告的「bothOn 必归 0，这条会红，
       那时应把标签连同缺陷锁一起撤掉，而不是把它调绿」已按预告兑现。
       正向口径三件事一起锁，缺一即红：① 气泡确实台过（bubOn>=5，取样没空转）；
       ② 同屏未让位 0 拍（bothOn 归零 —— 这是修复本身；计数代码没数过就不写进键，
          所以取 || 0 的口径，undefined 与 0 在这里同义）；
       ③ 纸签确实在场且已让位 >=1 拍（bothOff>=1，防止「气泡在台时纸签压根不在 DOM」
          把 0 拍同屏蒙出来 —— 那种情形 bothNo 会顶上去，本条照样红）。 */
  ok(Number(ON.bubOn) >= 5 && Number(ON.bothOn || 0) === 0 && Number(ON.bothOff) >= 1,
     'R-3 已修（2026-11-14 阶段一）：真人开局逐拍 —— 太虚气泡在台 ' + ON.bubOn + ' 拍，其中纸签同屏未让位 ' +
     (ON.bothOn || 0) + ' 拍、纸签在场且已让位 ' + ON.bothOff + ' 拍（气泡在台但纸签不在 DOM ' + (ON.bothNo || 0) +
     ' 拍）→ 引导在台期间纸签一律让位，两套指引不再同屏；同屏拍次为 ' + ((ON.bothAt || []).join(' | ') || '无') + '（判据输入 gcls=body.guide-active、bub=气泡 inline display）',
     JSON.stringify({ bubOn: ON.bubOn, bothOn: ON.bothOn || 0, bothOff: ON.bothOff, bothNo: ON.bothNo,
       bothAt: ON.bothAt, why: ON.why, t: ON.t, steps: ON.steps }));

  /* ===== 回归：enc.bubble 为 null 的存档必须能完整读回（2026-10-25 修的真 bug）=====
     encClean 里 `!isFinite(e && e.bubble) || !encMeta(e.bubble.id)` 在 bubble=null 时短路到
     `null.id` 抛错，被 load() 的 catch 吞成"读档失败" → 排在它后面的字段（背包/统计/道碑/主线…）
     每次刷新全部丢失。这里用一份带 bubble:null 的真实存档做端到端回读。 */
  const reloadFile = path.join(TMP, '._reload.html');
  const ud2 = path.join(SCRATCH, 'xxrl' + process.pid + '_' + Date.now());
  const seedSave = { name: '回归档', sex: 'm', gender: 'male', rank: 12, last: Date.now(),
    enc: { t: 0, bubble: null, lastId: 'beggar' },
    arena: { day: '', left: 3, foes: [], tier: 0, win: 1, lose: 0, rep: 777 },
    dt: { qing: 1, zhu: 9, hax: 3 }, dtMain: 'hax',
    story: { claimed: { '1-1': 123 } } };
  PAGE.writePage(reloadFile, html
    .replace('</head>', '<script>try{localStorage.setItem("xiuxian_save",' +
      JSON.stringify(JSON.stringify(seedSave)) + ');}catch(e){}</scr' + 'ipt>\n</head>')
    .replace('</body>', '<script>setTimeout(function(){document.title=JSON.stringify({name:XX._s.name,' +
      'rep:XX._s.arena.rep,st:Object.keys((XX._s.story||{}).claimed||{}).length,' +
      'dt:XX._s.dt,dtm:XX._dtMain()});},800);</scr' + 'ipt>\n</body>'), 'utf8');
  let RL = {};
  try {
    const rdom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run',
      '--user-data-dir=' + ud2, '--virtual-time-budget=6000', '--window-size=720,1100',
      '--dump-dom', 'file:///' + reloadFile.replace(/\\/g, '/')],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const mt = rdom.match(/<title>([^<]*)<\/title>/);
    RL = mt ? JSON.parse(mt[1]) : {};
  } catch (e) { RL = { err: String(e).slice(0, 80) }; }
  ok(RL.name === '回归档' && RL.rep === 777 && RL.st === 1,
    'bubble:null 的存档能完整读回（encClean 不再吞掉整段读档）', JSON.stringify(RL));
  ok(RL.dt && RL.dt.qing === 1 && RL.dt.zhu === 3 && RL.dt.hax === undefined && RL.dtm === 'qing',
    '洞天存档只收五座 id、等级夹 0~3、脏主洞回落到已开的一座', JSON.stringify(RL.dt) + '/' + RL.dtm);
  try { fs.rmSync(ud2, { recursive: true, force: true }); } catch (e) {}

  /* ===== 回归：读档边界的三件事（第 79 节小黑屋抓出来的）=====
     ① 剑意流派以前只写不读：cycleAura 的注释写着"存盘记忆"，load() 却漏了这个字段；
     ② 大额灵石：| 0 把 30 亿折成 -12.9 亿，读一次档财富就废了；
     ③ 脏档闸门：localStorage 里被写进 {} 或 [] 时，原先会静默起一个 name=''、rank=0 的无名档，
        现在应当判为"没有存档"，让玩家走创角。 */
  function readBoot(seedRaw, expr, tag, extra){
    const f = path.join(TMP, '._boot_' + tag + '.html');
    const ud = path.join(SCRATCH, 'xxbt' + process.pid + '_' + Date.now() + Math.random().toString(36).slice(2, 6));
    const seed = Object.assign({ xiuxian_save: JSON.stringify(seedRaw) }, extra || {});
    const seedJs = Object.keys(seed).map(k =>
      'localStorage.setItem(' + JSON.stringify(k) + ',' + JSON.stringify(seed[k]) + ');').join('');
    PAGE.writePage(f, html
      .replace('</head>', '<script>try{' + seedJs + '}catch(e){}</scr' + 'ipt>\n</head>')
      .replace('</body>', '<script>setTimeout(function(){document.title=' + expr + ';},800);</scr' + 'ipt>\n</body>'), 'utf8');
    let out = {};
    try {
      const dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run',
        '--user-data-dir=' + ud, '--virtual-time-budget=6000', '--window-size=720,1100',
        '--dump-dom', 'file:///' + f.replace(/\\/g, '/')],
        { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const mt = dom.match(/<title>([^<]*)<\/title>/);
      out = mt ? JSON.parse(mt[1]) : {};
    } catch (e) { out = { err: String(e).slice(0, 80) }; }
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(f, { force: true }); } catch (e) {}
    return out;
  }
  const AURA = readBoot({ name: '剑意档', sex: 'm', gender: 'male', rank: 24, stone: 3e9,
    swordAura: 2, last: Date.now() },
    'JSON.stringify({aura:XX._auraIdx(),cls:XX._auraCls(),stone:XX._s.stone,name:XX._s.name})', 'aura');
  ok(AURA.aura === 2 && AURA.cls === 'arc-chiyan',
    '剑意流派读档保持（存 2 赤炎流光 → 起来还是 2，class=' + AURA.cls + '）', JSON.stringify(AURA));
  ok(AURA.stone >= 3e9 && AURA.name === '剑意档',
    '30 亿灵石过一遍存盘/读档不被折成负数（读回 ' + AURA.stone + '，含挂机入账）', JSON.stringify(AURA));
  /* 第 89 轮 · 丹药三个 buff 槽的读档闸门：脏值夹回可用区间，缺字段一律当 0；
     只有老五枚的旧档必须原样读回来——新表是加出来的，不许把老丹读成问号。 */
  const DANB = readBoot({ name: '丹药档', sex: 'm', gender: 'male', rank: 12, stone: 500, last: Date.now(),
    danExp: { mult: 'x', until: 'x' }, danPow: { pct: -3, until: Date.now() + 60000 },
    danGain: { pct: 1e9, until: Date.now() + 60000 } },
    'JSON.stringify(XX._dan.state())', 'danbuff');
  ok(DANB.danExp && DANB.danExp.mult === 0 && DANB.danExp.until === 0 &&
     DANB.danPow && DANB.danPow.pct === 0 && DANB.danGain && DANB.danGain.pct === 5,
    '丹药三槽脏值读档即夹：非数字 → 0、负数 → 0、超上限 → 5（' + JSON.stringify(DANB) + '）');
  const DANOLD = readBoot({ name: '老档', sex: 'm', gender: 'male', rank: 3, stone: 200, last: Date.now(),
    bag: [{ t: 'dan1', n: '下品丹药' }, { t: 'dan5', n: '大乘破境丹' }], pillUntil: 0, pillBonus: 0 },
    'JSON.stringify({buff:[XX._dan.buff().exp,XX._dan.buff().pow,XX._dan.buff().gain].join(","),' +
    'names:XX._s.bag.map(function(x){ return XX._items[x.t] ? XX._items[x.t].n : "?"; }).join(","),' +
    'po:XX._dan.ids.po.length})', 'danold');
  ok(DANOLD.buff === '0,0,0' && DANOLD.names === '下品破境丹,大乘破境丹' && DANOLD.po === 9,
    '只有老五枚的旧档读回来：三槽全 0、两枚丹仍在背包且认得名字（' + JSON.stringify(DANOLD) + '）');
  /* 第 90 节 · 法器三族的读档闸门：脏值夹 0~9、缺字段当 0；
     灵器仍是老字段 S.weapon，旧档不许因为多了三族就读成无器。 */
  const ARTB = readBoot({ name: '法器档', sex: 'm', gender: 'male', rank: 12, stone: 500, last: Date.now(),
    weapon: 3, art: { bg: 5, brk: 99, cai: -3 } },
    'JSON.stringify({art:XX._art.state(),lq:XX._s.weapon,name:XX._weaponName(3),pow:XX._art.powPct()})', 'artbuff');
  ok(ARTB.art && ARTB.art.bg === 5 && ARTB.art.brk === 9 && ARTB.art.cai === 0 && ARTB.lq === 3 &&
     ARTB.name === '上品法宝' && Math.abs(ARTB.pow - 0.22) < 1e-9,
     '法器三槽脏值读档即夹：超上限 → 9、负数 → 0，灵器老字段与战器效果照旧（' + JSON.stringify(ARTB) + '）');
  const ARTOLD = readBoot({ name: '无法器档', sex: 'm', gender: 'male', rank: 12, stone: 500, last: Date.now(),
    weapon: 2 },
    'JSON.stringify({art:XX._art.state(),lq:XX._s.weapon,pow:XX._art.powPct()})', 'artold');
  ok(ARTOLD.art && ARTOLD.art.bg === 0 && ARTOLD.art.brk === 0 && ARTOLD.art.cai === 0 &&
     ARTOLD.lq === 2 && ARTOLD.pow === 0,
     '第 90 节前的旧档读回来：三槽全 0、灵器仍是中品法宝（' + JSON.stringify(ARTOLD) + '）');
  /* R-5（第 3 轮拍板）：脏档这条路径原先只量了旧的 localStorage.hasFinishedTutorial，
     而现行引导（js/guide_taixu.js）的完成标记根本不在那个键上——它挂在 S.guide.done，
     随主存档走。取数探针 D:\xx-scratch\log\three_fix_20261114\probe_dirty_guide.js 实测：
     脏档闸门在 game.js:4043-4046，判「无存档」时 clearTutorialMark() 之后**直接 return false**，
     所以 game.js:4536 那段 guide 合并压根不跑，S.guide 停在模块初值（step 0 / done false / 无 started 键）。
     因此补第 4 件样例：一个「只偷带 guide 字段、没有任何本游戏核心字段」的脏档，
     它必须照样判为无存档，且内存里的引导状态不能被它顶成「已了」。 */
  const DIRTY = [{}, [], { zzz: 1 },
    { guide: { step: 7, done: true, skipped: false, started: true,
               flags: { c_sit: true }, rewardClaims: { taixu_intro_dan_v1: true } } }].map(function(seed, i){
    return readBoot(seed, 'JSON.stringify({char:!document.getElementById("char-modal").classList.contains("hidden"),' +
      'name:XX._s.name,rank:XX._s.rank,tut:localStorage.getItem("hasFinishedTutorial"),' +
      'gstep:(XX._s.guide||{}).step,gdone:(XX._s.guide||{}).done,gskip:(XX._s.guide||{}).skipped,' +
      'bub:(function(){var b=document.getElementById("taixu-bubble");' +
      'return b?(b.style.display==="none"?"exist-hidden":"exist-shown"):"nodom";}()),' +
      'gcls:document.body.classList.contains("guide-active")?1:0})', 'dirty' + i,
      { hasFinishedTutorial: '1' });
  });
  ok(DIRTY.every(d => d.char === true && d.name === ''),
    '脏档（{}/[]/无本游戏字段）判为无存档 → 走创角，不再静默起无名档', JSON.stringify(DIRTY));
  ok(DIRTY.every(d => d.tut === null),
    '脏档按「无存档」一并清掉引导完成标记（创角后重走引导）', JSON.stringify(DIRTY.map(d => d.tut)));
  /* ↓ R-5 新增两条：现行引导标记落点的覆盖补洞（不改上面两条的判据） */
  ok(DIRTY.every(d => d.gdone === false && d.gskip === false && d.gstep === 0),
    '脏档读回来的现行引导状态一律是初值：S.guide.done/skipped=false、step=0（' +
    JSON.stringify(DIRTY.map(d => [d.gstep, d.gdone, d.gskip])) + '）',
    '现行引导完成标记在 S.guide 上（game.js:4536 合并段），不在 hasFinishedTutorial 上');
  ok(DIRTY.every(d => d.bub === 'nodom' && d.gcls === 0),
    '脏档走创角这一拍：不建太虚气泡、不给 body 挂 guide-active（创角前不许把指引压到弹窗上）',
    JSON.stringify(DIRTY.map(d => d.bub + '~' + d.gcls)));

  /* ===== 阶段一 · W5 新增字段（day / secludeUntil）迁移断言（本单要求 1，只追加）=====
     口径：一律走现成的 readBoot() —— 独立 profile + 真页面启动 + 真 load()，
     不在 DIAG 里手工改 S 再自己喂（迁移是「读档那一下」的行为，只有真启动量得到）。
     被校实现（只读，本单不动业务代码）：
       game.js:4276-4277 备份键 xiuxian_save_pre_stage1（if(!getItem) 才写 → 只备一次）
       game.js:4285-4290 S.day / S.secludeUntil 迁移（只读 o 不读 S 旧值 → 重复 load 幂等；老档缺字段补零）
       game.js:12001-12002 resetAll 里两者归零
     数字口径：exp / stone 会随挂机入账变多，所以这两项只校「不因迁移而丢」（>= 种下值，
     NaN / 0 / undefined 一样过不了），其余（rank / NPC 关系 / day / secludeUntil）一律等值。 */
  const SECLUDE_TS = Date.now() + 600000;                 /* 闭关终点：未来 10 分钟，只作等值比对，不参与任何时间判定 */
  /* 当日键：迁移后 ensureDay() 会把空 key 补成本地今天；种旧档时也必须用今天，
     否则「2026-11-13」会被 ensureDay 判成跨天并把 expGain 清零（那是 W1 的自然日重置，不是迁移丢数据）。 */
  const TODAY = (function(){ const d = new Date(), p = n => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
  const DAY_OLD = { name: '旧日课档', sex: 'm', gender: 'male', rank: 7, exp: 1234, stone: 5678,
    last: Date.now(), herb: 5, ore: 3,
    npcs: { stele: { met: 1, rel: 23, stage: 2, seenGens: 0, lastSeen: 0, nudgeAt: 0,
      heard: ['塔'], choice: { listened: 1, showoff: 0, promise: 0 },
      cur: { lastRank: 7, talk: 2, promptTale: 0 } } } };
  const DAY_NEW = { name: '新字段档', sex: 'm', gender: 'male', rank: 9, exp: 2000, stone: 3000,
    last: Date.now(), day: { key: TODAY, expGain: 420, sweepExp: 77 }, secludeUntil: SECLUDE_TS,
    npcs: { stele: { met: 1, rel: -7, stage: 1, seenGens: 0, lastSeen: 0, nudgeAt: 0,
      heard: [], choice: { listened: 0, showoff: 0, promise: 0 },
      cur: { lastRank: 9, talk: 0, promptTale: 0 } } } };
  const PRE_SENTINEL = 'PRE_SENTINEL_DO_NOT_OVERWRITE';   /* 冒充「更早那份旧档原串」，用来验只备一次 */
  const DAYOLD = readBoot(DAY_OLD,
    '(function(){var s=XX._s;var bk=localStorage.getItem("xiuxian_save_pre_stage1");' +
    'return JSON.stringify({name:s.name,rank:s.rank,exp:s.exp,stone:s.stone,' +
    'rel:s.npcs.stele.rel,met:s.npcs.stele.met,stage:s.npcs.stele.stage,' +
    'dayK:Object.keys(s.day).join(","),day:s.day,seclude:s.secludeUntil,' +
    'bkNull:bk===null,bkEq:bk===' + JSON.stringify(JSON.stringify(DAY_OLD)) + '});})()', 'dayold');
  ok(DAYOLD.dayK === 'key,expGain,sweepExp,dec' && DAYOLD.day &&
     (DAYOLD.day.key === '' || DAYOLD.day.key === TODAY) &&
     DAYOLD.day.expGain === 0 && DAYOLD.day.sweepExp === 0 && DAYOLD.seclude === 0 &&
     DAYOLD.day.dec && DAYOLD.day.dec.res === 0 && DAYOLD.day.dec.risk === 0 &&
     DAYOLD.day.dec.grow === 0 && DAYOLD.day.dec.social === 0,
     'W5 迁移口径①（老档缺字段）：档里没有 day / secludeUntil 时读档补零值 —— S.day 是 key / expGain / sweepExp / dec 四键且计数为 0（key 为空串或由 ensureDay 补成今天；dec 四类决策补 0）、secludeUntil=0（' +
     JSON.stringify({ dayK: DAYOLD.dayK, day: DAYOLD.day, seclude: DAYOLD.seclude, today: TODAY }) + '）');
  ok(DAYOLD.name === '旧日课档' && DAYOLD.rank === 7 && DAYOLD.stone >= 5678 && DAYOLD.exp >= 1234 &&
     DAYOLD.rel === 23 && DAYOLD.met === 1 && DAYOLD.stage === 2,
     'W5 迁移口径①（不破坏旧档）：补零那一下不动境界 / 资源 / NPC 关系 —— rank=7、沈碑 rel=23、met=1、stage=2 原样读回，' +
     'stone / exp 只可能因挂机入账变多（读到 stone=' + DAYOLD.stone + ' exp=' + DAYOLD.exp + '，种下 5678 / 1234）',
     JSON.stringify(DAYOLD));
  ok(DAYOLD.bkNull === false && DAYOLD.bkEq === true,
     'W5 迁移口径③（备份键）：load() 读档前把主存档的原始串整份备份进独立键 xiuxian_save_pre_stage1，' +
     '备份内容与种下的那份原始串逐字相等（是原文比对，不是解析后再序列化）',
     'bkNull=' + DAYOLD.bkNull + ' bkEq=' + DAYOLD.bkEq);
  const CARRY = readBoot(DAY_NEW,
    '(function(){var s=XX._s;' +
    'var a=JSON.stringify([s.day,s.secludeUntil,s.rank,s.npcs.stele.rel]);' +
    'var l1=XX._load();var l2=XX._load();var t=XX._s;' +
    'var b=JSON.stringify([t.day,t.secludeUntil,t.rank,t.npcs.stele.rel]);' +
    'return JSON.stringify({a:a,b:b,same:a===b,l1:l1===true,l2:l2===true,' +
    'day:t.day,seclude:t.secludeUntil,rel:t.npcs.stele.rel,rank:t.rank,' +
    'bkNull:localStorage.getItem("xiuxian_save_pre_stage1")===null});})()', 'daycarry');
  ok(CARRY.day && CARRY.day.key === TODAY && CARRY.day.expGain === 420 && CARRY.day.sweepExp === 77 &&
     CARRY.seclude === SECLUDE_TS && CARRY.rel === -7 && CARRY.rank === 9,
     'W5 迁移口径①反向（新档有字段）：档里已带 day / secludeUntil 就原样读回，不是把有值的一律抹成零 —— ' +
     'key=' + TODAY + ' / expGain=420 / sweepExp=77 / secludeUntil=' + SECLUDE_TS + '，沈碑 rel=-7 与 rank=9 一并不动（' +
     JSON.stringify({ day: CARRY.day, seclude: CARRY.seclude, rel: CARRY.rel, rank: CARRY.rank }) + '）');
  ok(CARRY.l1 === true && CARRY.l2 === true && CARRY.same === true,
     'W5 迁移口径②（重复读档幂等）：同一档连续 load() 两次都成功，且 [day, secludeUntil, rank, 沈碑 rel] 四元组' +
     '第一次与第二次逐字相等 —— 迁移段只读档对象 o、不读 S 旧值，所以不会把 420 叠成 840（' +
     JSON.stringify({ l1: CARRY.l1, l2: CARRY.l2, same: CARRY.same, a: CARRY.a, b: CARRY.b }) + '）');
  const ONCE = readBoot(DAY_NEW,
    '(function(){var bk=localStorage.getItem("xiuxian_save_pre_stage1");' +
    'return JSON.stringify({bk:bk,sent:bk===' + JSON.stringify(PRE_SENTINEL) + '});})()',
    'dayonce', { xiuxian_save_pre_stage1: PRE_SENTINEL });
  ok(ONCE.sent === true,
     'W5 迁移口径③反向（只备一次）：xiuxian_save_pre_stage1 已有值时 load() 不再覆盖，' +
     '留的是最早那份（哨兵串仍在位）—— 反复读档不许把旧档原串刷成迁移后的新串（bk=' + ONCE.bk + '）',
     JSON.stringify(ONCE));
  const DWIPE = readBoot(DAY_NEW,
    '(function(){var err=null;window.confirm=function(){return true;};' +
    'try{XX.reset();}catch(e){err=String(e).slice(0,60);}' +
    'var s=XX._s;var bk=localStorage.getItem("xiuxian_save_pre_stage1");' +
    'return JSON.stringify({err:err,dayK:Object.keys(s.day).join(","),day:s.day,seclude:s.secludeUntil,' +
    'name:s.name,rank:s.rank,bkNull:bk===null,bkEq:bk===' + JSON.stringify(JSON.stringify(DAY_NEW)) + '});})()', 'daywipe');
  ok(DWIPE.err === null && DWIPE.dayK === 'key,expGain,sweepExp,dec' && DWIPE.day &&
     DWIPE.day.key === '' && DWIPE.day.expGain === 0 && DWIPE.day.sweepExp === 0 && DWIPE.seclude === 0 &&
     DWIPE.day.dec && DWIPE.day.dec.res === 0 && DWIPE.day.dec.risk === 0 &&
     DWIPE.day.dec.grow === 0 && DWIPE.day.dec.social === 0,
     'W5 迁移口径④（重置归零）：真点一次 resetAll 之后 S.day 四键回到空串与 0、secludeUntil=0（game.js:12001-12002），' +
     '旧档里的 420 / 77 / 闭关时间戳一个都不带进新角色（' +
     JSON.stringify({ err: DWIPE.err, dayK: DWIPE.dayK, day: DWIPE.day, seclude: DWIPE.seclude }) + '）');
  ok(DWIPE.bkNull === false && DWIPE.bkEq === true,
     '【现状锁 · 口径待拍板】W5 备份键不随 resetAll 清：重开之后 xiuxian_save_pre_stage1 仍在位且内容 = 重开前那份旧档原串' +
     '（全仓 pre_stage1 只有 game.js:4276-4277 两处引用，resetAll 未列该键）。任务单原文「resetAll 时两者归零」' +
     '若指「主存档 + 备份键」两个键，这条必红，须拍板后由实现侧更正，本测试不迁就；若指「day + secludeUntil」两个字段，' +
     '则由上面口径④那条锁住（bkNull=' + DWIPE.bkNull + ' bkEq=' + DWIPE.bkEq + '）',
     JSON.stringify({ bkNull: DWIPE.bkNull, bkEq: DWIPE.bkEq, name: DWIPE.name, rank: DWIPE.rank }));

  /* ===== 阶段一（路3 + W1 + W2 + W4）闸门与产出档位回归（2026-11-14 续单，只追加）=====
     口径：全部走现成 readBoot() —— 独立 profile + 真页面启动 + 真 load()，起点状态一律从存档种进去，
     不在 DIAG 里手工改 S 再自喂。只有两类例外，都在标签里写明：
       ① 单值纯函数表（_offlineCap 随 rank、_daoExpMult/_breakImprintK 随 dao/gens）：这些取值本来就是
          「读 S 的纯函数」，任务单点名要 8 个 rank / 4 组 dao·gens，为此在同页里临时覆写 S.rank / S.dao /
          S.legacy.gens 并当场还原（仓库既有写法同此，见 verify.js:1118、:2972 的 XX._s.rank= / S.zuo= 探针）；
       ② W1 的「day.key 改成昨天」是任务单第 7 条自己指定的动作。
     被校实现（只读）：game.js:446-449 BREAK_GATES/BREAK_CD/gateCdMs、:4706-4741 ensureDay/addActiveExp/
       activeBudget、:4761-4763 offlineCapSec、:2842-2847 daoExpMult/imprintExpMult/legacyChainMult/breakImprintK、
       :5192-5300 attemptBreakthrough、:8945-8946 resetForNewLife、:12006-12007 resetAll。
     浮动值口径：secludeUntil 是墙钟毫秒，断言只锁「与 now+CD 的差 < 5 s」与「前后相等」，不锁具体毫秒；
       exp 只锁「闸门期这一拍不许减少」，不锁具体数额（破境本身要扣 need）。 */
  const L3_TODAY = (function(){ const d = new Date(), p = n => (n < 10 ? '0' : '') + n;
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); })();
  const L3_H = 3600 * 1000;
  const L3_PAST = Date.now() - 3600 * L3_H;        /* 已过期的闸门（3600 小时 = ≈150 天前）：用来验「失败不触发、不延长」与段内不落闸 */
  const L3_FUT  = Date.now() + 96 * L3_H;          /* 未来的闸门：用来验拦截与清零 */
  /* 闸门拦截日志的三要素（任务单第 4 条原文）：「境界壁垒未消」+ 剩余时长 +「下次可破」。
     时长认 fmtCd 的五种输出（game.js:4745-4752：N 秒 / N 分钟 / N 小时 / N 小时 M 分 / N 天 M 小时）。
     写成函数而不是把句子写死，是因为页面抛错时 l2/l 可能是 undefined —— 直接 .indexOf 会把整轮 Node 炸掉。 */
  const gateTxt = function(t){ const s = String(t == null ? '' : t);
    return s.indexOf('境界壁垒未消') >= 0 && s.indexOf('下次可破') >= 0 &&
           /\d+\s*(秒|分钟|小时|分|天)/.test(s); };

  /* --- 前置：need(8) / need(9) / need(10) 由真页面读 XX._need，不在 Node 侧复刻公式 --- */
  const L3N = readBoot({ name: '门表档', sex: 'm', gender: 'male', rank: 8, exp: 0, stone: 100,
    last: Date.now() },
    '(function(){var n=[8,9,10,20,21];var o={};for(var i=0;i<n.length;i++){o["n"+n[i]]=XX._need(n[i]);}' +
    'o.g=XX._breakGates;o.c=XX._breakCd;return JSON.stringify(o);})()', 'l3need');
  ok(typeof L3N.n8 === 'number' && L3N.n8 > 0 && typeof L3N.n9 === 'number' && L3N.n9 > L3N.n8 &&
     typeof L3N.n10 === 'number' && L3N.n10 > L3N.n9 &&
     typeof L3N.n20 === 'number' && L3N.n20 > L3N.n10 && typeof L3N.n21 === 'number' && L3N.n21 > L3N.n20,
     '路3 前置：五档修为门槛由真页面 XX._need 读出且严格递增（need8=' + L3N.n8 + ' < need9=' + L3N.n9 +
     ' < need10=' + L3N.n10 + ' < need20=' + L3N.n20 + ' < need21=' + L3N.n21 +
     '），后面「exp=need」的种档全靠它，公式没在测试侧复刻（' + JSON.stringify(L3N) + '）');

  /* --- 1) 九门映射表 + _gateCdMs 逐门等值 + 非门 rank 返 0 --- */
  const L3MAP = readBoot({ name: '门表档', sex: 'm', gender: 'male', rank: 5, exp: 0, stone: 100,
    last: Date.now() },
    '(function(){var g=XX._breakGates,c=XX._breakCd,HS=[],CS=[],NG=[];' +
    'for(var i=0;i<g.length;i++){HS.push(XX._gateCdMs(g[i]));CS.push(c[i]*3600*1000);}' +
    '[0,7,9,10,12,13,15,16,18,19,25,26,-1].forEach(function(r){NG.push(r+":"+XX._gateCdMs(r));});' +
    'return JSON.stringify({g:g.join(","),c:c.join(","),len:g.length+"/"+c.length,HS:HS.join(","),' +
    'CS:CS.join(","),NG:NG.join(","),arr:Array.isArray(g)&&Array.isArray(c)});})()', 'l3map');
  ok(L3MAP.g === '8,11,14,17,20,21,22,23,24' && L3MAP.c === '96,336,672,156,156,288,552,1008,0' &&
     L3MAP.len === '9/9' && L3MAP.arr === true,
     '路3 九门映射：XX._breakGates=[8,11,14,17,20,21,22,23,24]、XX._breakCd=[96,336,672,156,156,288,552,1008,0]，' +
     '两表等长 9（实测 ' + L3MAP.len + '；gate=' + L3MAP.g + ' / cd=' + L3MAP.c + '）');
  ok(L3MAP.HS === L3MAP.CS,
     '路3 逐门时长：_gateCdMs(门 rank) 对九门逐一等于 CD×3600×1000 毫秒（实际 ' + L3MAP.HS +
     ' 对照 期望 ' + L3MAP.CS + '，按表序 8/11/14/17/20/21/22/23/24）');
  ok((L3MAP.NG || '').split(',').length === 13 &&
     (L3MAP.NG || '').split(',').every(function(x){ return x.split(':')[1] === '0'; }),
     '路3 非门不设闸：段内小境界与其它 rank（0/7/9/10/12/13/15/16/18/19/25/26/-1 共 13 个）的 _gateCdMs 一律返 0（' +
     L3MAP.NG + '）');

  /* --- 2) 跨段成功落闸 + 4) 承 2) 再破时的拦截（同页，两次都是天机令保底 → 无随机） --- */
  const L3X = readBoot({ name: '跨段档', sex: 'm', gender: 'male', rank: 8,
    exp: (L3N.n8 || 0) + (L3N.n9 || 0), stone: 1000, tianji: 4, insight: 0, secludeUntil: 0,
    day: { key: L3_TODAY, expGain: 0, sweepExp: 0 }, last: Date.now() },
    '(function(){var s=XX._s,o={};try{' +
    'o.t0=Date.now();o.e0=s.exp;o.r0=s.rank;o.su0=s.secludeUntil;o.tj0=s.tianji;' +
    'XX._attemptBreak({useTianji:true});' +
    'o.r1=s.rank;o.su1=s.secludeUntil;o.e1=s.exp;o.tj1=s.tianji;o.l1=(s.log[0]||{}).t||"";o.t1=Date.now();' +
    'o.gate1=XX._gateCdMs(s.rank);' +
    /* 段内照常：8→9 落闸之后，9→10 这一破不受闸门管（任务单第 3 条只挂跨段那一次） */
    'XX._attemptBreak({useTianji:true});' +
    'o.r2=s.rank;o.su2=s.secludeUntil;o.e2=s.exp;o.tj2=s.tianji;o.l2=(s.log[0]||{}).t||"";' +
    'o.hit2=(s.log||[]).some(function(x){return String((x||{}).t||"").indexOf("突破成功")>=0;});' +
    /* 再到 10→11（仍段内），然后停在本段最后一道门上 11→12，那里必须被 96 h 拦住 */
    's.exp=XX._need(10)+XX._need(11);' +
    'XX._attemptBreak({useTianji:true});' +
    'o.r3=s.rank;o.su3=s.secludeUntil;o.e3=s.exp;o.tj3=s.tianji;o.l3=(s.log[0]||{}).t||"";' +
    'o.hit3=(s.log||[]).some(function(x){return String((x||{}).t||"").indexOf("突破成功")>=0;});' +
    'o.need11=XX._need(11);o.need12=XX._need(12);' +
    'XX._attemptBreak({useTianji:true});' +
    'o.r4=s.rank;o.su4=s.secludeUntil;o.e4=s.exp;o.tj4=s.tianji;o.l4=(s.log[0]||{}).t||"";' +
    'o.need9=XX._need(9);}catch(e){o.err=String(e).slice(0,90);}' +
    'return JSON.stringify(o);})()', 'l3cross');
  ok(L3X.r1 === 9 && Math.abs(L3X.su1 - (L3X.t0 + 96 * L3_H)) < 5000,
     '路3 跨段成功落闸（任务单第 2 条）：rank=8、修为给到 need(8)+need(9)、天机令×2，_attemptBreak({useTianji:true}) 后 ' +
     'rank=9，且 S.secludeUntil 落在「成功这一刻 + 96 小时」±5 s 内（实测 su=' + L3X.su1 + '，' +
     'now+96h=' + (L3X.t0 + 96 * L3_H) + '，差 ' + (L3X.su1 - L3X.t0 - 96 * L3_H) + ' ms；起点 rank=' + L3X.r0 +
     ' / secludeUntil=' + L3X.su0 + '，天机令 ' + L3X.tj0 + '→' + L3X.tj1 + '，首破后一条日志：' +
     String(L3X.l1).slice(0, 60) + '；探针原始 ' + JSON.stringify(L3X).slice(0, 400) + '）');
  /* 4a 更正（阶段一 · 2026-11-14，测试侧按规格更正，不是调绿）：
     任务单第 3 条「只挂大境界突破、小境界不设闸」⇒ 8→9 落的 96 h 闸门，管的是本段最后一道门 11→12，
     不是紧接着的 9→10。原先这里断言「承 2) 再破必须被拦」，把「段内小境界」也当成闸门，与第 3 条冲突；
     现在按规格分四拍走完整段：8→9 落闸 → 9→10 照常 → 10→11 照常 → 11→12 被同一道闸拦住。 */
  ok(L3X.r2 === 10 && L3X.su2 === L3X.su1 && L3X.tj2 === L3X.tj1 - 1 && L3X.hit2 === true,
     '路3 闸门只挂跨段（第 3 条）：8→9 落闸后，9→10 这一破在段内照常成功 —— rank ' + L3X.r1 + '→' + L3X.r2 +
     '、secludeUntil 不变（' + L3X.su1 + '→' + L3X.su2 + '）、天机令 ' + L3X.tj1 + '→' + L3X.tj2 +
     '，本次有「突破成功」日志（' + L3X.hit2 + '；改前这条误把 9→10 当闸门期拦截，本轮按任务单第 3 条更正）');
  ok(L3X.r3 === 11 && L3X.su3 === L3X.su1 && L3X.hit3 === true && L3X.need11 > 0,
     '路3 段末进入门前一拍：10→11 仍在段内、照常成功（rank ' + L3X.r2 + '→' + L3X.r3 +
     '，secludeUntil 仍是 8→9 那一刻落的 ' + L3X.su3 + '，need(11)=' + L3X.need11 + '）；下一破（11→12）才是本段闸门所在');
  ok(L3X.r4 === 11 && L3X.e4 === L3X.e3 && L3X.su4 === L3X.su1 && L3X.tj4 === L3X.tj3 && gateTxt(L3X.l4),
     '路3 闸门期拦截（第 4 条口径 · 本段最后一道门）：rank=11 带天机令与足额修为（need(11)=' + L3X.need11 +
     ' / need(12)=' + L3X.need12 + '），承 8→9 落的 96 h 闸门再破必须原地返回 —— rank 仍 ' + L3X.r4 +
     '、exp 不减（' + L3X.e3 + '→' + L3X.e4 + '）、secludeUntil 不变（' + L3X.su1 + '→' + L3X.su4 + '）、天机令 ' +
     L3X.tj3 + '→' + L3X.tj4 + '，日志「' + String(L3X.l4).slice(0, 80) + '」；探针原始 ' + JSON.stringify(L3X).slice(0, 400) + '）');

  /* --- 4b) 拦截机制本身可达的那一拍：当前 rank 就是门 + secludeUntil 在未来 --- */
  const L3S = readBoot({ name: '闸门期档', sex: 'm', gender: 'male', rank: 8,
    exp: (L3N.n8 || 0) + (L3N.n9 || 0), stone: 1000, tianji: 1, insight: 0, secludeUntil: L3_FUT,
    day: { key: L3_TODAY, expGain: 0, sweepExp: 0 }, last: Date.now() },
    '(function(){var s=XX._s,o={};try{o.e0=s.exp;o.r0=s.rank;o.su0=s.secludeUntil;o.tj0=s.tianji;' +
    'o.now=Date.now();o.or0=(s.secludeUntil|0);' +
    'o.leftRaw=s.secludeUntil-o.now;o.leftOr0=Math.max(0,(s.secludeUntil|0)-o.now);' +
    'o.leftHelper=XX._secludeLeftMs();o.tsHelper=XX._secludeTs();' +
    'o.gate0=XX._gateCdMs(8);' +
    'XX._attemptBreak({useTianji:true});' +
    'o.r=s.rank;o.e=s.exp;o.su=s.secludeUntil;o.tj=s.tianji;o.l=(s.log[0]||{}).t||"";' +
    'o.need=XX._need(8);o.gate=XX._gateCdMs(8);}catch(e){o.err=String(e).slice(0,90);}' +
    'return JSON.stringify(o);})()', 'l3state');
  ok(L3S.r === 8 && L3S.e === L3S.e0 && L3S.su === L3S.su0 && L3S.tj === L3S.tj0 && gateTxt(L3S.l),
     '路3 闸门期拦截（第 4 条的可达状态版）：rank=8 本身是门、secludeUntil 在未来 96 h，此时无论修为多足、带不带天机令，' +
     '_attemptBreak 都必须原地返回 —— rank/exp/secludeUntil/天机令四样一个都不动，最新日志给「境界壁垒未消 + 剩余时长 + 下次可破」' +
     '（实测 rank=' + L3S.r + ' exp ' + L3S.e0 + '→' + L3S.e + ' su=' + L3S.su + ' 天机令 ' + L3S.tj +
     '；当前 rank 的 _gateCdMs=' + L3S.gate + '；日志「' + String(L3S.l).slice(0, 70) + '」）');
  /* 缺陷锁转正向（阶段一 · 2026-11-14 已修）：原锁绿 = `S.secludeUntil | 0` 把 ≈1.79e12 的墙钟毫秒截成 int32，
     闸门剩余恒为 0。现实现改走 secludeTs() / secludeLeftMs()（game.js:454-455 定义、:5209 等六处调用）；
     这条锁「助手读数 == 真实剩余」且远大于 0，同时保留左列原值作对照（int32 截断这个 JS 事实仍在，但代码不再用它判闸门）。
     修回去（再用 |0 读）时 leftHelper 会变 0，这条必红。 */
  ok(L3S.gate0 > 0 && L3S.leftRaw > 86400000 && L3S.or0 !== L3S.su0 &&
     Math.abs(L3S.tsHelper - L3S.su0) < 1 && Math.abs(L3S.leftHelper - L3S.leftRaw) < 50 && L3S.leftHelper > 86400000,
     '路3 闸门剩余读数已修（原缺陷锁转正向）：同一拍里 _gateCdMs(8)=' + L3S.gate0 + ' ms、种下 secludeUntil=' +
     L3S.su0 + ' 距页面 now=' + L3S.now + ' 真实剩 ' + L3S.leftRaw + ' ms（≈' + Math.round(L3S.leftRaw / 3600000) +
     ' h），XX._secludeTs() 逐值读回 ' + L3S.tsHelper + '、XX._secludeLeftMs() 读到 ' + L3S.leftHelper +
     ' ms（与真实剩余差 ' + Math.abs(L3S.leftHelper - L3S.leftRaw) + ' ms）；对照：旧的 (secludeUntil|0)=' + L3S.or0 +
     ' 与原文不等、按它算只剩 ' + L3S.leftOr0 + ' ms —— 实现已不再用 |0 判闸门（探针原始 ' + JSON.stringify(L3S).slice(0, 420) + '）');

  /* --- 4c) 闸门确实能「带进下一道门」：20→21 落闸 156 h，紧接着在 21 这一道门上被拦 --- */
  const L3G = readBoot({ name: '连门档', sex: 'm', gender: 'male', rank: 20,
    exp: (L3N.n20 || 0) + (L3N.n21 || 0), stone: 1000, tianji: 2, insight: 0, secludeUntil: 0,
    day: { key: L3_TODAY, expGain: 0, sweepExp: 0 }, last: Date.now() },
    '(function(){var s=XX._s,o={};try{' +
    'o.t0=Date.now();o.r0=s.rank;o.su0=s.secludeUntil;o.tj0=s.tianji;' +
    'XX._attemptBreak({useTianji:true});' +
    'o.r1=s.rank;o.su1=s.secludeUntil;o.e1=s.exp;o.tj1=s.tianji;o.l1=(s.log[0]||{}).t||"";' +
    'o.gate1=XX._gateCdMs(s.rank);' +
    'XX._attemptBreak({useTianji:true});' +
    'o.r2=s.rank;o.su2=s.secludeUntil;o.e2=s.exp;o.tj2=s.tianji;o.l2=(s.log[0]||{}).t||"";' +
    'o.need21=XX._need(21);}catch(e){o.err=String(e).slice(0,90);}' +
    'return JSON.stringify(o);})()', 'l3chain');
  ok(L3G.r1 === 21 && Math.abs(L3G.su1 - (L3G.t0 + 156 * L3_H)) < 5000 && L3G.gate1 === 288 * L3_H &&
     L3G.r2 === 21 && L3G.e2 === L3G.e1 && L3G.tj2 === L3G.tj1 && L3G.su2 === L3G.su1 && gateTxt(L3G.l2),
     '路3 闸门可延续到下一道门（第 4 条的正向可达版，用于区分「拦截逻辑坏」与「8→9 之后当前 rank 不是门」）：' +
     'rank=20 带天机令破成 → rank=21 且 secludeUntil = 成功这一刻 + 156 h（实测差 ' +
     (L3G.su1 - L3G.t0 - 156 * L3_H) + ' ms）；rank=21 本身也是门（_gateCdMs(21)=' + L3G.gate1 +
     ' ms = 288 h），此时 exp=' + L3G.e1 + ' 远够 need(21)=' + L3G.need21 + ' 且仍带天机令 ' + L3G.tj1 +
     '，再破必须原地不动：rank=' + L3G.r2 + '、exp ' + L3G.e1 + '→' + L3G.e2 + '、su ' + L3G.su1 + '→' + L3G.su2 +
     '、天机令 ' + L3G.tj1 + '→' + L3G.tj2 + '，日志「' + String(L3G.l2).slice(0, 70) + '」' +
     '（门表只有 20/21/22/23/24 这一段是连续门，跨段之后下一拍仍是门的情形只有这里）');

  /* --- 3) 段内不落闸：rank 9→10 成功之后 secludeUntil 前后相等 --- */
  const L3I = readBoot({ name: '段内档', sex: 'm', gender: 'male', rank: 9,
    exp: (L3N.n9 || 0) + (L3N.n10 || 0), stone: 1000, tianji: 1, insight: 0, secludeUntil: L3_PAST,
    day: { key: L3_TODAY, expGain: 0, sweepExp: 0 }, last: Date.now() },
    '(function(){var s=XX._s,o={};try{var su0=s.secludeUntil,r0=s.rank,g0=XX._gateCdMs(s.rank);' +
    'XX._attemptBreak({useTianji:true});' +
    'o.r0=r0;o.r=s.rank;o.su0=su0;o.su=s.secludeUntil;o.g0=g0;o.tj=s.tianji;o.e=s.exp;' +
    'o.l=(s.log[0]||{}).t||"";}catch(e){o.err=String(e).slice(0,90);}' +
    'return JSON.stringify(o);})()', 'l3intra');
  ok(L3I.r === 10 && L3I.g0 === 0 && L3I.su === L3I.su0,
     '路3 段内不落闸（任务单第 3 条）：rank=9→10 这一破在同一大境界段内（_gateCdMs(9)=' + L3I.g0 + '），天机令保底破成之后 rank=' +
     L3I.r + '，S.secludeUntil 与破之前逐字相等（' + L3I.su0 + ' → ' + L3I.su + '；种的是 3600 小时（≈150 天）前的过期闸门，' +
     '所以「不变」不是「一直是 0」的空转），天机令 ' + L3I.tj + '，最新日志「' + String(L3I.l).slice(0, 60) +
     '」；探针原始 ' + JSON.stringify(L3I).slice(0, 300) + '）');

  /* --- 5) 失败不触发、不延长：页内把 Math.random 打桩成 0.999（p 上限 0.98，必失败） --- */
  const L3F = readBoot({ name: '必败档', sex: 'm', gender: 'male', rank: 8,
    exp: (L3N.n8 || 0) * 3, stone: 1000, tianji: 0, insight: 0, secludeUntil: L3_PAST,
    day: { key: L3_TODAY, expGain: 0, sweepExp: 0 }, last: Date.now() },
    '(function(){var s=XX._s;var ori=Math.random;var o={};' +
    'try{Math.random=function(){return 0.999;};' +
    'o.r0=s.rank;o.X=s.secludeUntil;o.p=XX._breakChanceWith(null);o.mx=XX._bal.breakMax;' +
    'XX._attemptBreak();XX._attemptBreak();XX._attemptBreak();' +
    'o.r=s.rank;o.su=s.secludeUntil;o.tj=s.tianji;o.ins=s.insight;o.fb=s.failBonus;o.e=s.exp;' +
    'o.l=(s.log[0]||{}).t||"";}catch(e){o.err=String(e).slice(0,90);}' +
    'finally{Math.random=ori;}' +
    'return JSON.stringify(o);})()', 'l3fail');
  ok(L3F.r === 8 && L3F.su === L3F.X,
     '路3 失败不触发不延长（任务单第 5 条）：页内 Math.random 打桩 0.999（破境基础成功率 ' + L3F.p +
     '，硬顶 breakMax=' + L3F.mx + '，加满失败加成也 <1 → 三次必败；打桩在 finally 里已还原），' +
     'rank=8 且 secludeUntil=X（3600 小时前那个已过期的闸门，保证这一拍进得了掷骰而不是被闸门拦掉）连破 3 次后 ' +
     'rank=' + L3F.r + '、S.secludeUntil 与种下的同一个 X 逐字相等（' + L3F.X + ' → ' + L3F.su +
     '；天机令 ' + L3F.tj + '、顿悟进度 ' + L3F.ins + '、失败加成 ' + L3F.fb + '、exp=' + L3F.e +
     '，最新日志「' + String(L3F.l).slice(0, 60) + '」；探针原始 ' + JSON.stringify(L3F).slice(0, 300) + '）');

  /* --- 6) 新档 / 转世清零：resetAll 与 坐化转世（resetForNewLife 那条共用清单） --- */
  const L3R = readBoot({ name: '清零档', sex: 'm', gender: 'male', rank: 8, exp: 500, stone: 1000,
    secludeUntil: L3_FUT, day: { key: L3_TODAY, expGain: 420, sweepExp: 77 }, last: Date.now() },
    '(function(){var err=null;window.confirm=function(){return true;};' +
    'try{XX.reset();}catch(e){err=String(e).slice(0,60);}' +
    'var s=XX._s;return JSON.stringify({err:err,su:s.secludeUntil,rank:s.rank,day:s.day,name:s.name});})()',
    'l3reset');
  ok(L3R.err === null && L3R.su === 0,
     '路3 新档清零（第 6 条前半）：带着「未来 96 h 闸门」的档真点一次 XX.reset()，S.secludeUntil 归 0' +
     '（game.js:12006），rank=' + L3R.rank + '、day=' + JSON.stringify(L3R.day) +
     '（注：day 三键归零已由上面 W5 迁移口径④单独锁过，这条只补 secludeUntil 本身）');
  const L3RB = readBoot({ name: '转世档', sex: 'm', gender: 'male', rank: 12, exp: 500, stone: 1000,
    secludeUntil: L3_FUT, zuo: Date.now() - 1000, life: { age: 0, on: true, brk: 0 },
    legacy: { gens: 3, relic: null, hist: [], pick: null }, last: Date.now() },
    '(function(){var s=XX._s;var su0=s.secludeUntil,z0=s.zuo,g0=s.legacy.gens;' +
    'var ok=XX._reborn();' +
    'return JSON.stringify({ret:ok,su0:su0,z0:z0,g0:g0,su:s.secludeUntil,rank:s.rank,zuo:s.zuo,' +
    'gens:s.legacy.gens,day:s.day,err:null});})()', 'l3reborn');
  ok(L3RB.ret === true && L3RB.su0 === L3_FUT && L3RB.z0 > 0 && L3RB.su === 0 &&
     L3RB.gens === L3RB.g0 + 1,
     '路3 转世清零（第 6 条后半）：种 rank=12 / secludeUntil=未来 96 h / zuo=已坐化 / 第 3 世，真走一次 XX._reborn()' +
     '（坐化转世 → startNewLife → resetForNewLife，game.js:8945），返回 ' + L3RB.ret + '、世数 ' + L3RB.g0 +
     '→' + L3RB.gens + '，S.secludeUntil ' + L3RB.su0 + ' → ' + L3RB.su + '，闸门不带进新世（rank=' +
     L3RB.rank + ' / zuo=' + L3RB.zuo + ' / day=' + JSON.stringify(L3RB.day) + '）');

  /* --- 7) W1：当日预算 100% / 150% 两档折算与跨天重置 --- */
  const L3W1 = readBoot({ name: '预算档', sex: 'm', gender: 'male', rank: 0, exp: 0, stone: 100,
    day: { key: L3_TODAY, expGain: 0, sweepExp: 0 }, last: Date.now() },
    '(function(){var s=XX._s,o={},B;function step(v){var u0=s.day.expGain;var g=XX._addActiveExp(v);' +
    'S.push({u0:u0,u0B:u0/B,v:v,g:g,eff:g/v});return s.day.expGain;}' +
    'try{var S=o.S=[];' +
    'B=XX._activeBudget();' +
    'step(0.9*B);step(0.3*B);step(1000);step(1.6*B-s.day.expGain);step(1000);' +
    'var yk=o.yk=(function(){var d=new Date(Date.now()-86400000),p=function(n){return (n<10?"0":"")+n;};' +
    'return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());})();' +
    'var k0=o.k0=s.day.key;s.day.key=yk;s.day.expGain=12345;s.day.sweepExp=999;' +
    'XX._ensureDay();' +
    'o.B=B;o.today=XX._s.day.key;' +
    'o.after={key:s.day.key,expGain:s.day.expGain,sweepExp:s.day.sweepExp};' +
    'o.budget0=XX._activeBudget();}catch(e){o.err=String(e).slice(0,90);}' +
    'return JSON.stringify(o);})()',
    'l3w1');
  const L3S1 = (L3W1.S || [])[1] || {}, L3S3 = (L3W1.S || [])[2] || {}, L3S5 = (L3W1.S || [])[4] || {};
  ok(L3W1.B === 35933 && L3W1.budget0 === 35933,
     'W1 预算表：rank=0 落在第一大段，XX._activeBudget() = 35933（实测 ' + L3W1.B +
     '；整段探针跑完再读一次仍是 ' + L3W1.budget0 + '，说明预算不随当日累计漂移）');
  ok(Math.abs(L3S1.eff - 1) < 1e-9 && Math.abs(L3S3.eff - 0.5) < 1e-9 && Math.abs(L3S5.eff - 0.25) < 1e-9 &&
     Math.abs(L3S1.u0B - 0.9) < 1e-9 && Math.abs(L3S3.u0B - 1.2) < 1e-9 && Math.abs(L3S5.u0B - 1.6) < 1e-9,
     'W1 折算三档：以 rank=0 的 B=35933 为基准，把当日累计 driving 到 0.9B / 1.2B / 1.6B 三点各加一笔，' +
     '到账/名义分别必须是 1 / 0.5 / 0.25（实测 u0B=' + L3S1.u0B + '→eff ' + L3S1.eff + '；u0B=' + L3S3.u0B +
     '→eff ' + L3S3.eff + '；u0B=' + L3S5.u0B + '→eff ' + L3S5.eff + '；五步明细 ' + JSON.stringify(L3W1.S) + '）');
  ok(L3W1.after && L3W1.after.key === L3W1.today && L3W1.after.expGain === 0 &&
     L3W1.after.sweepExp === 0 && L3W1.k0 !== L3W1.yk,
     'W1 跨天重置（任务单第 7 条末句）：把 S.day.key 写成昨天（' + L3W1.yk + '，任务单指定的动作）再调 XX._ensureDay()，' +
     '三键回到「页面自己算的今天 + 0 + 0」—— 实测 after=' + JSON.stringify(L3W1.after) +
     '，改之前 key=' + L3W1.k0 + ' / today=' + L3W1.today +
     '（今天由页面读，不与 Node 侧日期做等值比对，避开跨零点假红；W5 迁移段已单独锁过种下的 key 原样读回）');

  /* --- 8) W2：离线封顶八档（rank 由同页覆写，纯函数取值；还原见探针末尾） --- */
  const L3W2 = readBoot({ name: '封顶档', sex: 'm', gender: 'male', rank: 0, exp: 0, stone: 100,
    last: Date.now() },
    '(function(){var s=XX._s,o={};var r0=s.rank;o.r0=r0;o.out=[];' +
    'function step(){[0,15,16,17,18,20,21,24].forEach(function(r){s.rank=r;o.out.push(r+":"+XX._offlineCap());});}' +
    'try{step();}catch(e){o.err=String(e).slice(0,90);}' +
    'finally{s.rank=r0;}' +
    'o.restored=s.rank;return JSON.stringify(o);})()', 'l3w2');
  const L3CAP = {};
  (L3W2.out || []).forEach(function(x){ const k = x.split(':'), v = x.slice(k[0].length + 1);
    L3CAP[k[0]] = Math.round(Number(v)); });
  ok(L3CAP['0'] === 43200 && L3CAP['15'] === 43200 && L3CAP['16'] === 43200 && L3CAP['17'] === 43200 &&
     L3CAP['18'] === 45317 && L3CAP['20'] === 56846 && L3CAP['21'] === 63668 && L3CAP['24'] === 89448 &&
     L3W2.restored === L3W2.r0,
     'W2 离线封顶八档（洞天 0 级）：rank 0/15/16/17/18/20/21/24 → 43200/43200/43200/43200/45317/56846/63668/89448 秒' +
     '（12 h 地板 + 8 h×1.12^(rank-14) 取大者；实测四舍五入到整秒 ' + JSON.stringify(L3CAP) +
     '，原始浮点 ' + (L3W2.out || []).join(' | ') + '；rank 覆写后已还原到 ' + L3W2.restored + '）');

  /* --- 9) W4：印记 / 道韵软顶 / 合成 ×6 封顶 --- */
  const L3W4 = readBoot({ name: '印记档', sex: 'm', gender: 'male', rank: 5, exp: 0, stone: 100,
    dao: 20, legacy: { gens: 10, relic: null, hist: [], pick: null }, last: Date.now() },
    '(function(){var s=XX._s,o={};var dao0=s.dao,g0=s.legacy.gens;o.dao0=dao0;o.g0=g0;' +
    'function step(){o.im=XX._imprintExpMult();o.chain=XX._legacyChainMult();o.kb=XX._breakImprintK();' +
    's.dao=5; o.d5=XX._daoExpMult(); s.dao=6; o.d6=XX._daoExpMult();' +
    's.dao=20; s.legacy.gens=20; o.kb20x20=XX._breakImprintK(); o.chain20x20=XX._legacyChainMult();' +
    'o.raw5=s.dao+"/"+s.legacy.gens;}' +
    'try{step();}catch(e){o.err=String(e).slice(0,90);}' +
    'finally{s.dao=dao0;s.legacy.gens=g0;}' +
    'o.restored=s.dao+"/"+s.legacy.gens;o.cfg=XX._imprintCfg;' +
    'return JSON.stringify(o);})()', 'l3w4');
  ok(Math.abs(L3W4.im - 1.2) < 1e-9,
     'W4 印记 exp 乘区封顶：gens=10 时 _imprintExpMult = 1.2（+2%/世 到 +20% 上限就锁死；实测 ' + L3W4.im +
     '，配置 ' + JSON.stringify(L3W4.cfg) + '，档内 dao=' + L3W4.dao0 + ' / gens=' + L3W4.g0 + ' 是真读回来的）');
  ok(Math.abs(L3W4.chain - 6.0) < 1e-9,
     'W4 合成乘区 ×6 封顶：dao=20 且 gens=10（道韵×道统×印记三通道 raw 早已破 6）时 _legacyChainMult = 6.0（实测 ' +
     L3W4.chain + '；同式在 gens=20 时仍 ' + L3W4.chain20x20 + '）');
  ok(Math.abs(L3W4.d5 - 3.25) < 1e-9 && Math.abs(L3W4.d6 - 3.35) < 1e-9,
     'W4 道韵软顶：_daoExpMult 前 5 点按原系数、第 6 点起每点 +10% → dao=5 得 3.25、dao=6 得 3.35（实测 ' +
     L3W4.d5 + ' / ' + L3W4.d6 + '；此处按任务单第 9 条在同页覆写 S.dao 取纯函数值，跑完还原到 ' + L3W4.restored + '）');
  ok(Math.abs(L3W4.kb - 0.08) < 1e-9 && Math.abs(L3W4.kb20x20 - 0.08) < 1e-9,
     'W4 突破印记合并封顶：_breakImprintK 在 dao=20/gens=10 与 dao=20/gens=20 两种组合下都锁在 +8%（0.08），' +
     '不与道韵每点 +2% 重复记功（实测 ' + L3W4.kb + ' / ' + L3W4.kb20x20 + '）');

  /* ===== 回归：清空存档重开必须连引导标记一起清（第 81 节）=====
     此前 resetAll() 只删 SAVE_KEY，hasFinishedTutorial 残留 → 新角色直接被丢进空档，
     新手引导不重播。这里用真页面点一次 XX.reset()（confirm 打桩放行）。 */
  const WIPE = (function(){
    const f = path.join(TMP, '._boot_wipe.html');
    const ud = path.join(SCRATCH, 'xxwp' + process.pid + '_' + Date.now());
    /* 旧档里埋四处可识别的标记（名 / sex / 主线已领 / 背包里的老丹），
       这样「零值新档有没有把旧档数据带过去」是量出来的，不是猜的。 */
    const seedJs = 'localStorage.setItem("xiuxian_save",' + JSON.stringify(JSON.stringify({
      name: '重开档', sex: 'f', gender: 'female', rank: 12, stone: 4321, last: Date.now(),
      story: { claimed: { '1-1': 5 } }, bag: [{ t: 'dan5', n: '大乘破境丹' }]
    })) + ');localStorage.setItem("hasFinishedTutorial","1");';
    PAGE.writePage(f, html
      .replace('</head>', '<script>try{' + seedJs + '}catch(e){}</scr' + 'ipt>\n</head>')
      .replace('</body>', `<script>setTimeout(function(){try{window.confirm=function(){return true;};XX.reset();}
catch(e){document.title=JSON.stringify({err:String(e).slice(0,60)});return;}
var raw=localStorage.getItem("xiuxian_save");
var j=null;try{j=raw===null?"NULL":JSON.parse(raw);}catch(e){j="ERR:"+String(e).slice(0,30);}
var leak=[];
if(j&&typeof j==="object"){
  if(j.name==="重开档")leak.push("name");
  if(j.sex==="f"||j.gender==="female")leak.push("sex");
  if(Number(j.rank)>0)leak.push("rank");
  if(Number(j.stone)>0)leak.push("stone");
  if(j.story&&j.story.claimed&&j.story.claimed["1-1"])leak.push("story");
  if((j.bag||[]).some(function(b){return b&&b.t==="dan5";}))leak.push("bag");
  if(j.guide&&(j.guide.done===true||j.guide.skipped===true))leak.push("guide");
}
document.title=JSON.stringify({tut:localStorage.getItem("hasFinishedTutorial"),
  key:raw===null?"NULL":"SET",
  jrank:j&&typeof j==="object"?Number(j.rank):null,
  jname:j&&typeof j==="object"?String(j.name):null,
  gdone:!!(XX._s.guide&&XX._s.guide.done),
  gstep:XX._s.guide?XX._s.guide.step:null,
  leak:leak.join("+")||"none",
  char:!document.getElementById("char-modal").classList.contains("hidden"),
  rank:XX._s.rank});},800);</scr` + `ipt>\n</body>`), 'utf8');
    let out = {};
    try {
      const dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run',
        '--user-data-dir=' + ud, '--virtual-time-budget=6000', '--window-size=720,1100',
        '--dump-dom', 'file:///' + f.replace(/\\/g, '/')],
        { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const mt = dom.match(/<title>([^<]*)<\/title>/);
      out = mt ? JSON.parse(mt[1]) : {};
    } catch (e) { out = { err: String(e).slice(0, 80) }; }
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch (e) {}
    try { fs.rmSync(f, { force: true }); } catch (e) {}
    return out;
  })();
  /* 口径变更（制作人拍板 2026-11-13，落码第 3 项 · 选①）：删档后立刻落一份零值新档是合理产品行为
     （game.js:11749 removeItem → :11835 Guide.reset() → guide_taixu.js:306 state.started=true + persist()），
     D-2 保持现状、不动 game.js。所以断言不再要求 key===null，改成钉死三件事：
     ① 引导标记清干净（旧 localStorage 标记 + 现行 S.guide.done 都要为假）；② 回到创角；
     ③ 键上那份必须是零值新档，且四处旧档标记一个都没带过来（leak=none）。 */
  ok(WIPE.tut === null && WIPE.gdone === false && WIPE.char === true && WIPE.rank === 0 &&
     WIPE.key === 'SET' && WIPE.jrank === 0 && WIPE.leak === 'none',
     '清空存档重开：引导标记清零、回到创角、存档键上是不含旧档数据的零值新档（旧档未泄露）', JSON.stringify(WIPE));

  /* ===== 回归：洞天加格里的物品读档不能丢（旧代码按 S.bagSize 截断）=====
     储物袋满级 50 + 玄冥主洞 30 = 80 格；存 60 件，读档后必须还是 60 件、格子 80 个。 */
  const bagReloadFile = path.join(TMP, '._bagreload.html');
  const ud4 = path.join(SCRATCH, 'xxbr' + process.pid + '_' + Date.now());
  const bagSeed = { name: '背包档', sex: 'm', gender: 'male', rank: 22, last: Date.now(),
    bagSize: 50, dt: { qing: 0, xuan: 3 }, dtMain: 'xuan',
    bag: new Array(60).fill(0).map(() => ({ t: 'dan1', n: '下品丹药' })) };
  PAGE.writePage(bagReloadFile, html
    .replace('</head>', '<script>try{localStorage.setItem("xiuxian_save",' +
      JSON.stringify(JSON.stringify(bagSeed)) + ');}catch(e){}</scr' + 'ipt>\n</head>')
    .replace('</body>', '<script>setTimeout(function(){try{window.switchTab("bag");}catch(e){}' +
      'setTimeout(function(){document.title=JSON.stringify({n:XX._s.bag.length,cap:XX._bagCap(),' +
      'txt:(document.getElementById("xx-bag-cap")||{}).textContent,' +
      'cells:document.querySelectorAll("#xx-bag .bag-cell").length});},400);},900);</scr' + 'ipt>\n</body>'), 'utf8');
  let BR = {};
  try {
    const bdom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run',
      '--user-data-dir=' + ud4, '--virtual-time-budget=9000', '--window-size=720,1100',
      '--dump-dom', 'file:///' + bagReloadFile.replace(/\\/g, '/')],
      { encoding: 'utf8', timeout: 60000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const mtb = bdom.match(/<title>([^<]*)<\/title>/);
    BR = mtb ? JSON.parse(mtb[1]) : {};
  } catch (e) { BR = { err: String(e).slice(0, 80) }; }
  ok(BR.n === 60 && BR.cap === 80 && BR.txt === '已用 60 / 容量 80（洞天 +30）' && BR.cells === 80,
    '洞天加格的物品读档不丢：60 件全读回、格子 80、标签写有效容量', JSON.stringify(BR));
  try { fs.rmSync(ud4, { recursive: true, force: true }); } catch (e) {}

  // 截图
  const shot = (srcFile, outName, w, h) => {
    execEdge(['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
      '--user-data-dir=' + ud, '--virtual-time-budget=4000', '--window-size=' + w + ',' + h,
      '--screenshot=' + path.join(SCRATCH, 'xiuxian-test-' + process.pid + '-' + outName), 'file:///' + srcFile.replace(/\\/g, '/')],
      { timeout: 60000, stdio: ['ignore', 'ignore', 'ignore'] });
    const pngPath = path.join(SCRATCH, 'xiuxian-test-' + process.pid + '-' + outName);
    const png = fs.readFileSync(pngPath);
    if(png.readUInt32BE(0) !== 0x89504e47 || png.readUInt32BE(16) !== w || png.readUInt32BE(20) !== h)
      throw new Error('截图尺寸或 PNG 数据无效：' + outName);
    fs.rmSync(pngPath, { force:true });
  };
  /* 洞府页 + 背包页截图 */
  const dongFile = path.join(TMP, '._dong.html');
  PAGE.writePage(dongFile, html.replace('</body>',
    '\n<script>window.addEventListener("load",()=>setTimeout(()=>{switchTab("dong_field");XX._s.field=9;XX._s.stone=88888;XX._render();XX._plantAll("herb");XX._s.plots.forEach((p,i)=>{if(i%2===0)p.t0=Date.now()-p.need*1000-5000;});XX._render();},200));</script>\n</body>'), 'utf8');
  const bagFile = path.join(TMP, '._bag.html');
  PAGE.writePage(bagFile, html.replace('</body>',
    '\n<script>window.addEventListener("load",()=>setTimeout(()=>{switchTab("bag");XX._s.bag=[{t:"dan1",n:"下品丹药"},{t:"dan2",n:"中品丹药"},{t:"paper",n:"法宝图纸"},{t:"iron",n:"废铁"},{t:"dan1",n:"下品丹药"}];XX._render();},200));</script>\n</body>'), 'utf8');
  shot(clean, 'screenshot.png', 900, 1300);
  shot(clean, 'screenshot-mobile-qa.png', 393, 720);
  shot(dongFile, 'screenshot-dong.png', 900, 1300);
  shot(bagFile, 'screenshot-bag.png', 900, 1300);

  /* 随机奇遇：气泡态+ 弹窗态（新 profile 首进会弹创角弹窗，需注入样式隐藏） */
  const HIDE_CHAR = '<style>#char-modal{display:none!important}</style>';
  const encBubbleFile = path.join(TMP, '._enc-bubble.html');
  PAGE.writePage(encBubbleFile, html.replace('</body>',
    HIDE_CHAR + '\n<script>window.addEventListener("load",()=>setTimeout(()=>{XX._s.stone=8888;XX._encSpawn("beggar");},200));</script>\n</body>'), 'utf8');
  const encModalFile = path.join(TMP, '._enc-modal.html');
  PAGE.writePage(encModalFile, html.replace('</body>',
    HIDE_CHAR + '\n<script>window.addEventListener("load",()=>setTimeout(()=>{XX._s.stone=8888;XX._encSpawn("pouch");XX._openEncounter();},200));</script>\n</body>'), 'utf8');
  shot(encBubbleFile, 'screenshot-enc-bubble.png', 900, 1300);
  shot(encModalFile, 'screenshot-enc-modal.png', 900, 1300);

  /* 新系统面板截图 */
  const mk = (name, js) => {
    const f = path.join(TMP, '._' + name + '.html');
    PAGE.writePage(f, html.replace('</body>',
      '\n<script>window.addEventListener("load",()=>setTimeout(()=>{' + js + '},200));</script>\n</body>'), 'utf8');
    shot(f, 'screenshot-' + name + '.png', 900, 1300);
    return f;
  };
  const extra = [
    mk('market', 'switchTab("market");XX._s.stone=88888;XX._s.bag=[{t:"mat_core",n:"妖丹"},{t:"boss_core",n:"兽王精魄"}];XX._render();'),
    mk('secret', 'switchTab("secret");XX._s.rank=12;XX._s.secret.prog=[6,2,0,0];XX._render();'),
    mk('arena', 'switchTab("arena");XX._s.arena.rep=520;XX._render();'),
    mk('event', 'switchTab("event");XX._s.sign.days=3;XX._s.sign.last="";XX._render();'),
    mk('enhance', 'switchTab("dong_enhance");XX._s.weapon=3;XX._s.weaponLv=6;XX._s.affix=[{id:"exp",q:3},{id:"pow",q:2},{id:"brk",q:1}];XX._render();'),
    mk('town', 'ROUTER.showScene("town");')
  ];

  ['._diag.html','._clean.html','._dong.html','._bag.html','._enc-bubble.html','._enc-modal.html','._reload.html','._bagreload.html','._onboard.html'].concat(extra).forEach(f=>{try{fs.rmSync(f,{force:true})}catch(e){}});
  try{ fs.rmSync(ud, { recursive:true, force:true }); }catch(e){}   /* 临时 profile 用完即删，避免攒一堆几十 MB 的目录 */
  console.log('\n----------------------------------------');
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
