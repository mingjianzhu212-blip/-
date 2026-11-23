'use strict';
/* 九霄问道 · 全局突破系统专项验证（BREAK_TIERS / 悟道值 / 丹药分级 / 防爆与硬保底道具）
   + 生产建筑体系（炼丹房 / 炼器坊：升级 / 炼制公式 / 失败返还 / 品阶门槛 / 突破联动指路）
   运行：node verify_break.js   （依赖无头 Edge，验证后此脚本可删） */
const { execFileSync } = require('node:child_process');
const { execEdge } = require('./tools/edge-run');
const fs = require('node:fs');
const os = require('node:os');
/* 2026-10-26 用户要求：临时产物（浏览器 profile / 截图 / 中间 HTML）一律落 D 盘，不写 C 盘；D 不可用时退回系统 temp。 */
const SCRATCH = (function(){ try{ const p = 'D:/xx-scratch'; fs.mkdirSync(p, { recursive: true }); return p; }catch(e){ return os.tmpdir(); } })();
const path = require('node:path');

const ROOT = path.resolve(__dirname);
const SRC = path.join(ROOT, 'index.html');
const TMP = ROOT;
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
  const S=()=>XX._s;
  const realRandom=Math.random;
  const forceFail=()=>{Math.random=()=>0.999;};      // 必败
  const forceWin =()=>{Math.random=()=>0;};         // 必胜
  await sleep(400);
  try{
    /* ========== 一、配置表健全性 ========== */
    const T=XX._breakTiers, P=XX._breakPills, G=XX._breakGuards, W=XX._wisdomCfg, SC=XX._shopCfg;
    let cover=true, prev=-1, mono=true, lastBase=2;
    for(const t of T){ if(t.from!==prev+1) cover=false; prev=t.to; if(t.base>=lastBase) mono=false; lastBase=t.base; }
    L('tierCover', (cover && prev===24) ? 'ok' : 'bad:'+prev);
    L('tierMono', mono ? 'ok' : 'bad');
    let pillMono=true, lastTier=0, loseMono=true, lastLose=0;
    for(const t of T){
      const pm=P.find(p=>p.id===t.pill);
      if(!pm || pm.tier<lastTier) pillMono=false; lastTier=pm?pm.tier:0;
      if(t.lose<lastLose) loseMono=false; lastLose=t.lose;
    }
    L('tierPillMono', pillMono ? 'ok' : 'bad');
    L('tierLoseMono', loseMono ? 'ok' : 'bad');
    /* 三类道具：元数据（名称/类型/描述）齐全，数值统一在 SHOP_CFG */
    L('guardKeys', ['heart_mirror','guard_array','tianji'].every(k=>G[k]&&G[k].name&&G[k].type&&G[k].desc) ? 'ok' : 'bad');
    L('wisdomCfg', W.perFail>0 && W.failStep>0 && W.full>0 && W.wisdomPerFail>0 && W.wisdomSign>0 && W.wisdomQuest>0 && W.perPoint===undefined ? 'ok' : 'bad');
    const shopIds = Object.keys(SC.items);
    L('shopCfg', shopIds.length===3 && shopIds.every(k=>SC.items[k].baseWisdom>0 && SC.items[k].limit && SC.items[k].limit.n>0) ? 'ok' : 'bad');
    /* 需求 3：天机令按大境界限购 + 资产比例定价（悟道 3000） */
    L('tianjiNoStoneCfg', SC.items.tianji.baseWisdom===3000 && SC.items.tianji.limit.type==='rankTier' &&
                            SC.assetRatio.tianji===0.45 && SC.assetAnchor.tianji===3.0 ? 'ok' : 'bad');
    /* 需求 1/2：限购配置 */
    L('limitCfg', SC.items.heart_mirror.limit.type==='week' && SC.items.heart_mirror.limit.n===2 &&
                   SC.items.guard_array.limit.type==='week' && SC.items.guard_array.limit.n===1 ? 'ok' : 'bad');
    L('arrayBonusCfg', SC.guardArrayBonus===0.15 ? 'ok' : 'bad');

    /* ========== 二、丹药品阶校验 ========== */
    S().rank=20; S().exp=1e18; S().wisdom=0; S().insight=0; S().failBonus=0;
    L('pillLowInvalid', XX._pillValid('dan1')===false ? 'ok' : 'bad');     // 化神段 dan1 无效
    L('pillMidInvalid', XX._pillValid('dan2')===false ? 'ok' : 'bad');
    L('pillHighValid', XX._pillValid('dan3')===true ? 'ok' : 'bad');      // 化神段 dan3 有效
    L('pillTopValid', XX._pillValid('dan5')===true ? 'ok' : 'bad');       // 越阶丹药永远有效
    S().rank=5;
    L('pillLowValidEarly', XX._pillValid('dan1')===true ? 'ok' : 'bad');  // 炼气段 dan1 有效

    /* ========== 三、概率口径：UI 显示 = 实际判定 ========== */
    S().rank=20; S().wisdom=0; S().insight=0; S().failBonus=0; S().dao=0; S().pillUntil=0; S().pillBonus=0;
    S().rootIdx=0; S().dan=0; S().affix=[];                  /* 废灵根 bonus 0、无丹炉、无词条 → 纯段表基础值 */
    const t20=XX._breakTiers.find(t=>t.from<=20&&t.to>=20);
    L('chanceBase', Math.abs(XX._breakChanceWith(null)-t20.base)<1e-9 ? 'ok' : 'bad:'+XX._breakChanceWith(null));
    S().failBonus=0.2; S().wisdom=40;                        /* 悟道值货币不再加成功率 */
    L('chanceBonus', Math.abs(XX._breakChanceWith(null)-(t20.base+0.2))<1e-9 ? 'ok' : 'bad:'+XX._breakChanceWith(null));
    /* 阶段二 N1：软膝 0.85/0.15（raw≤0.85 原样；超过部分只兑现 15%），终夹 0.05–0.98 */
    L('kneeUnder', Math.abs(XX._breakSoftKnee(0.70)-0.70)<1e-12 ? 'ok' : 'bad');
    L('kneeOver', Math.abs(XX._breakSoftKnee(0.94)-0.8635)<1e-12 ? 'ok' : 'bad:'+XX._breakSoftKnee(0.94));
    L('kneeFull', Math.abs(XX._breakSoftKnee(1.70)-0.9775)<1e-12 ? 'ok' : 'bad:'+XX._breakSoftKnee(1.70));
    L('kneeClampMax', Math.min(XX._bal.breakMax, XX._breakSoftKnee(9))===0.98 ? 'ok' : 'bad');
    L('kneeMarginal', Math.abs((XX._breakSoftKnee(1.70)-XX._breakSoftKnee(1.55))-0.0225)<1e-12 ? 'ok' : 'bad');
    L('breakMaxCfg', XX._bal.breakMax===0.98 ? 'ok' : 'bad:'+XX._bal.breakMax);
    S().failBonus=0; S().wisdom=0;
    const st=XX._breakState('dan3');
    L('stateChance', Math.abs(st.chance-XX._breakChanceFinal('dan3', false))<1e-9 ? 'ok' : 'bad');
    L('stateArrayChance', Math.abs(st.chanceWithArray-XX._breakChanceFinal('dan3', true))<1e-9 ? 'ok' : 'bad:'+st.chanceWithArray);
    /* 第 89 轮：破境族九阶就是这张梯子。口径不写死下标，写成「以本轮所需丹为界，
       以下全无效、以上全有效」——段位再怎么调，梯子不能出现中间空洞或倒挂。 */
    const needIx = st.pills.findIndex(p => p.id === st.needPill);
    L('statePills', st.pills.length === 9 && st.pills[0].valid === false && needIx >= 0 &&
      st.pills.slice(0, needIx).every(p => p.valid === false) &&
      st.pills.slice(needIx).every(p => p.valid === true) ? 'ok'
      : 'bad:' + st.pills.length + '/' + needIx + '/' + st.pills.map(p => (p.valid ? 1 : 0)).join(''));
    L('stateNeed', st.needPill==='dan3' ? 'ok' : 'bad:'+st.needPill);

    /* ========== 四、失败 → 顿悟进度 + 悟道值（货币）双轨 + 扣修为 ========== */
    S().rank=15; S().exp=1e18; S().wisdom=0; S().insight=0; S().failBonus=0; S().guardMirror=0; S().guardArray=0; S().tianji=0;
    S().bag=[]; S().dao=0; S().pillUntil=0; S().pillBonus=0; S().rootIdx=1;
    const t15=XX._breakTiers.find(t=>t.from<=15&&t.to>=15);
    const need15=XX._need(15);
    const gain15=XX._wisdomGain(W.wisdomPerFail);           // 5 × 1.15^15
    forceFail(); XX._attemptBreak({});
    L('failInsight', S().insight===W.perFail ? 'ok' : 'bad:'+S().insight);
    L('failWisdom', S().wisdom===gain15 ? 'ok' : 'bad:'+S().wisdom);
    L('failBonus', Math.abs(S().failBonus-W.failStep)<1e-9 ? 'ok' : 'bad:'+S().failBonus);
    L('failLoseExp', S().exp===1e18-Math.floor(need15*t15.lose) ? 'ok' : 'bad:'+S().exp);
    L('failRankKeep', S().rank===15 ? 'ok' : 'bad');
    /* ---- 外部评审 2026-11-23 第 6 项：炼气段失败免扣灵石 ----
       炼气段失败只留修为反噬，灵石分文不动；筑基及以上保持现状（本单不改其数值，只锁行为防回加）。 */
    S().rank=0; S().exp=1e18; S().stone=8888; S().wisdom=0; S().insight=0; S().failBonus=0;
    S().guardMirror=0; S().guardArray=0; S().tianji=0; S().bag=[]; S().dao=0; S().pillUntil=0; S().pillBonus=0; S().rootIdx=1;
    const need0=XX._need(0), t0=XX._breakTiers.find(t=>t.from<=0&&t.to>=0);
    forceFail(); XX._attemptBreak({});
    L('failStoneLianqi', S().stone===8888 ? 'ok' : 'bad:'+S().stone);
    L('failExpLianqi', S().exp===1e18-Math.floor(need0*t0.lose) ? 'ok' : 'bad:'+S().exp);
    L('failBonusLianqi', Math.abs(S().failBonus-W.failStep)<1e-9 ? 'ok' : 'bad:'+S().failBonus);
    S().rank=9; S().exp=1e18; S().stone=8888; S().wisdom=0; S().insight=0; S().failBonus=0;
    S().guardMirror=0; S().guardArray=0; S().tianji=0; S().bag=[]; S().dao=0; S().pillUntil=0; S().pillBonus=0; S().rootIdx=1;
    const need9=XX._need(9), t9=XX._breakTiers.find(t=>t.from<=9&&t.to>=9);
    forceFail(); XX._attemptBreak({});
    L('failStoneZhuji', S().stone===8888 ? 'ok' : 'bad:'+S().stone);
    L('failExpZhuji', S().exp===1e18-Math.floor(need9*t9.lose) ? 'ok' : 'bad:'+S().exp);
    /* 恢复第四段后续断言依赖的基准态（rank15 / 满修为 / 灵根 1），不改任何断言 */
    S().rank=15; S().exp=1e18; S().rootIdx=1;
    /* 失败加成封顶 +30%，顿悟进度封顶 100 */
    S().failBonus=0.28; forceFail(); XX._attemptBreak({});
    L('failBonusCap', Math.abs(S().failBonus-0.30)<1e-9 ? 'ok' : 'bad:'+S().failBonus);
    S().insight=98; S().failBonus=0; forceFail(); XX._attemptBreak({});
    L('insightCap', S().insight===100 ? 'ok' : 'bad:'+S().insight);
    /* 悟道值货币无上限累积（与顿悟进度解耦） */
    S().insight=0; S().wisdom=5000; forceFail(); XX._attemptBreak({});
    L('wisdomNoCap', S().wisdom===5000+gain15 ? 'ok' : 'bad:'+S().wisdom);

    /* ========== 五、顿悟进度圆满 → 必定顿悟，仅清进度不清货币 ========== */
    S().rank=15; S().insight=100; S().wisdom=777; S().failBonus=0.29; S().exp=1e18;
    forceFail(); /* 即使随机数必败，保底优先 */
    XX._attemptBreak({});
    L('epiphanyWin', S().rank===16 ? 'ok' : 'bad:'+S().rank);
    L('epiphanyReset', S().insight===0 && S().failBonus===0 && S().wisdom===777 ? 'ok' : 'bad');

    /* ========== 六、天机令 → 必定成功且消耗 ========== */
    S().rank=15; S().wisdom=0; S().insight=0; S().failBonus=0; S().tianji=1; S().exp=1e18;
    forceFail();
    XX._attemptBreak({useTianji:true});
    L('tianjiWin', S().rank===16 ? 'ok' : 'bad:'+S().rank);
    L('tianjiUsed', S().tianji===0 ? 'ok' : 'bad:'+S().tianji);
    /* 没有天机令却勾选 → 拒绝且不动修为 */
    S().rank=15; S().tianji=0; S().exp=1e18; forceFail();
    XX._attemptBreak({useTianji:true});
    L('tianjiNone', S().rank===15 && S().exp===1e18 ? 'ok' : 'bad');

    /* ========== 七、护心镜（被动返 50%）/ 护道阵法（主动 +15%） ========== */
    S().rank=15; S().exp=1e18; S().insight=0; S().wisdom=0; S().failBonus=0; S().guardMirror=1; S().guardArray=0;
    const lose15=Math.floor(need15*t15.lose);
    forceFail(); XX._attemptBreak({});                       // 护心镜被动：无需 useGuard
    L('mirrorHalfExp', S().exp===1e18-lose15+Math.floor(lose15*0.5) ? 'ok' : 'bad:'+S().exp);
    L('mirrorUsed', S().guardMirror===0 ? 'ok' : 'bad:'+S().guardMirror);
    /* 护心镜在成功时不消耗（只有失败才触发） */
    S().exp=1e18; S().guardMirror=1; forceWin(); XX._attemptBreak({});
    L('mirrorKeepOnWin', S().guardMirror===1 && S().rank===16 ? 'ok' : 'bad');
    /* 护道阵法：勾选后成功率 +15%，且无论成败一用即耗 */
    S().rank=15; S().exp=1e18; S().guardMirror=0; S().guardArray=1;
    const pNoArr=XX._breakChanceWith(null);
    forceFail(); XX._attemptBreak({useArray:true});
    L('arrayUsedOnFail', S().guardArray===0 ? 'ok' : 'bad:'+S().guardArray);
    S().rank=15; S().exp=1e18; S().guardArray=1; forceWin(); XX._attemptBreak({useArray:true});
    L('arrayUsedOnWin', S().guardArray===0 && S().rank===16 ? 'ok' : 'bad');
    /* 无阵法却勾选 → 拒绝，不扣修为 */
    S().rank=15; S().exp=1e18; S().guardArray=0; forceFail(); XX._attemptBreak({useArray:true});
    L('arrayRefuse', S().exp===1e18 && S().rank===15 ? 'ok' : 'bad');
    /* 不勾选时阵法不会自动生效（不消耗） */
    S().exp=1e18; S().guardArray=1; forceFail(); XX._attemptBreak({});
    L('arrayNotAuto', S().guardArray===1 && S().exp<1e18 ? 'ok' : 'bad');
    /* 阵法 +15% 与丹药加算、不翻倍：勾选态概率 = 未勾选 + 0.15（封顶 0.95） */
    S().rank=15; S().failBonus=0; S().bag=[{t:'dan3',n:'上品丹药'}];
    const pPill=XX._breakChanceWith('dan3');
    S().bag=[{t:'dan3',n:'上品丹药'}]; S().guardArray=1;
    XX._render();
    const arrState=XX._breakState('dan3');
    /* 阵法 +15% 与丹药加算、不翻倍：勾选态与未勾选态在最终口径下相差 0.15（本段未触发软膝） */
    L('arrayAdditive', Math.abs((arrState.chanceWithArray - arrState.chance) - 0.15)<1e-9 &&
      Math.abs(arrState.chanceWithArray-XX._breakChanceFinal('dan3', true))<1e-9 ? 'ok' : 'bad');
    S().guardArray=0; S().bag=[];

    /* ========== 八、突破丹药：品阶不足拒绝 / 有效则消耗 ========== */
    S().rank=15; S().exp=1e18; S().wisdom=0; S().insight=0; S().failBonus=0; S().guardMirror=0; S().tianji=0;
    S().bag=[{t:'dan1',n:'下品丹药'}];
    forceFail(); XX._attemptBreak({pill:'dan1'});           // 元婴段 dan1 无效 → 拒绝
    L('pillTierRefuse', S().rank===15 && S().bag.length===1 ? 'ok' : 'bad');
    S().bag=[{t:'dan3',n:'上品丹药'}];
    forceWin(); XX._attemptBreak({pill:'dan3'});            // 有效 → 成功且消耗
    L('pillConsumed', S().rank===16 && S().bag.length===0 ? 'ok' : 'bad:'+S().rank+'/'+S().bag.length);
    /* 失败也消耗丹药（服用即入腹，防无限重试） */
    S().rank=15; S().bag=[{t:'dan3',n:'上品丹药'}];
    forceFail(); XX._attemptBreak({pill:'dan3'});
    L('pillConsumedOnFail', S().rank===15 && S().bag.length===0 ? 'ok' : 'bad');
    /* 背包没有该丹药 → 拒绝 */
    S().bag=[];
    forceWin(); XX._attemptBreak({pill:'dan3'});
    L('pillMissing', S().rank===15 ? 'ok' : 'bad');
    /* 修为不足 → 拒绝 */
    S().rank=15; S().exp=1; forceWin(); XX._attemptBreak({});
    L('expNotEnough', S().rank===15 ? 'ok' : 'bad');

    /* ========== 九、天机阁：资产比例定价 / 大额悟道值 / 双扣 / 限购 ========== */
    /* 灵石价双轨：家当薄 → 需求锚（随境界指数涨）；家当厚 → 总资产比例（与境界无关，囤多少都榨走三五成） */
    S().rank=0;  S().stone=0;      const p0=XX._shopPrice('heart_mirror','stone');   // 需求锚 40×1.2
    S().rank=10;                   const p10=XX._shopPrice('heart_mirror','stone');
    S().rank=25;                   const p25=XX._shopPrice('heart_mirror','stone');
    L('priceScale', p0===Math.floor(XX._needOf(0)*1.2) && p10===Math.floor(XX._needOf(10)*1.2) && p25>p10*2 ? 'ok' : 'bad:'+p0+'/'+p10+'/'+p25);
    S().rank=0; S().stone=4e8;
    L('priceAsset', XX._shopPrice('heart_mirror','stone')===Math.floor(4e8*0.35) &&
                     XX._shopPrice('guard_array','stone')===Math.floor(4e8*0.4) &&
                     XX._shopPrice('tianji','stone')===Math.floor(4e8*0.45) ? 'ok' : 'bad');
    S().rank=0; S().stone=0;
    L('priceWisdom', XX._shopPrice('heart_mirror','wisdom')===800 &&
                     XX._shopPrice('guard_array','wisdom')===1500 &&
                     XX._shopPrice('tianji','wisdom')===3000 ? 'ok' : 'bad');
    /* 悟道值产出与价格同系数 */
    S().rank=10;
    L('wisdomGainScale', XX._wisdomGain(100)===Math.floor(100*Math.pow(1.15,10)) ? 'ok' : 'bad:'+XX._wisdomGain(100));
    /* 兑换：rank0 护心镜 = 800 悟道 + max(48, 35% 灵石)，双扣 */
    S().rank=0; S().wisdom=800; S().guardMirror=0; S().guardArray=0; S().tianji=0; S().stone=100;
    S().shop={ week:'', heart_mirror:0, guard_array:0, tianjiTier:-1 };
    XX._exchangeWisdom('heart_mirror');
    L('exchOk', S().guardMirror===1 && S().wisdom===0 && S().stone===52 ? 'ok' : 'bad');
    S().wisdom=799; XX._exchangeWisdom('heart_mirror');
    L('exchPoor', S().guardMirror===1 && S().wisdom===799 ? 'ok' : 'bad');
    /* 护心镜每周限购 2 次：第 3 次售罄 */
    S().wisdom=800; XX._exchangeWisdom('heart_mirror');      // 第 2 次
    L('week2', S().guardMirror===2 ? 'ok' : 'bad:'+S().guardMirror);
    XX._exchangeWisdom('heart_mirror');                        // 第 3 次 → 售罄
    L('weekSoldOut', S().guardMirror===2 && XX._shopSoldOut('heart_mirror')===true ? 'ok' : 'bad');
    /* 护道阵法每周仅 1 次（1500 悟道 + 需求锚 80） */
    S().wisdom=1500; S().stone=100;
    XX._exchangeWisdom('guard_array');                         // 第 1 次
    XX._exchangeWisdom('guard_array');                         // 第 2 次 → 售罄
    L('arrayWeekLimit', S().guardArray===1 && XX._shopSoldOut('guard_array')===true ? 'ok' : 'bad');
    /* 跨周重置：伪造上周的周键 → 限购清零 */
    S().shop.week='2000-1-1'; S().wisdom=5000;
    XX._resetShopWeek();
    L('weekReset', S().shop.heart_mirror===0 && S().shop.guard_array===0 && S().shop.week===XX._weekKey() ? 'ok' : 'bad');
    /* 天机令：无悟道值被拒；3000 悟道 + 45% 资产兑换成功；同境界第 2 次售罄 */
    S().rank=0; S().stone=99999; S().wisdom=0; S().shop={ week:'', heart_mirror:0, guard_array:0, tianjiTier:-1 };
    XX._buyGuard('tianji');
    L('tianjiNoStone', S().tianji===0 && S().stone===99999 ? 'ok' : 'bad');
    S().wisdom=3000; XX._exchangeWisdom('tianji');
    L('tianjiExch', S().tianji===1 && S().wisdom===0 && S().stone===99999-Math.floor(99999*0.45) ? 'ok' : 'bad:'+S().wisdom+'/'+S().stone);
    S().wisdom=3000; XX._exchangeWisdom('tianji');
    L('tianjiTierLimit', S().tianji===1 ? 'ok' : 'bad:'+S().tianji);
    /* 突破到大境界新段后自动解锁（rank0 炼气 → rank9 筑基；悟道价 ×1.15^9 ≈ 10553） */
    S().rank=9; S().wisdom=20000; S().stone=1e6;
    XX._exchangeWisdom('tianji');
    L('tianjiNewTier', S().tianji===2 ? 'ok' : 'bad:'+S().tianji);
    L('shopList', XX._wisdomShop().length===3 ? 'ok' : 'bad');

    /* ========== 十、生产建筑：升级 / 炼制公式 / 失败返还 / 品阶门槛 ========== */
    const R=()=>XX._recipes, B=()=>XX._buildings();
    S().rank=20; S().stone=1e9; S().herb=9999; S().herb100=0; S().herb10000=0; S().bag=[]; S().bagSize=20;
    S().dan=10; S().forge=10; S().weapon=0; S().affix=[];
    S().mastery={alchemyLv:1,alchemyExp:0,forgeLv:1,forgeExp:0};      /* 阶位从一阶起步（公式纯度） */
    /* --- 建筑状态总览（数据结构字段） --- */
    L('bldMax', B().alchemy.maxLevel===10 && B().forge.maxLevel===10 ? 'ok' : 'bad');
    L('bldUnlockedAll', B().alchemy.unlockedRecipes.length===37 && B().forge.unlockedRecipes.length===36 ? 'ok' : 'bad:'+B().alchemy.unlockedRecipes.length+'/'+B().forge.unlockedRecipes.length);
    L('bldCostShape', B().alchemy.upgradeCost.stone>0 && B().alchemy.upgradeCost.mats.length===1 ? 'ok' : 'bad');
    /* --- 成功率公式：基础 + 建筑等级 × 2% + 匠道(阶-1)×1%（一阶时 0），硬上限 95% --- */
    L('rateFormula', Math.abs(XX._craftRate(R().dan5)-0.45)<1e-9 ? 'ok' : 'bad:'+XX._craftRate(R().dan5));   // 0.25 + 10×0.02
    L('rateCap', Math.abs(XX._craftRate(R().dan1)-0.95)<1e-9 ? 'ok' : 'bad:'+XX._craftRate(R().dan1));      // min(0.95, 0.90+0.20)
    S().dan=3;
    L('rateLv3', Math.abs(XX._craftRate(R().dan3)-0.66)<1e-9 ? 'ok' : 'bad:'+XX._craftRate(R().dan3));     // 0.60 + 3×0.02
    /* --- 建筑升级：扣料 +1 级 / 灵石不足 / 材料不足 / 满级拦截 --- */
    S().dan=0; S().stone=1e9; S().herb=9999;
    XX._upgradeBuilding('alchemy');
    L('upgradeOk', S().dan===1 && B().alchemy.unlockedRecipes.indexOf('dan1')>=0 ? 'ok' : 'bad:'+S().dan);
    XX._upgradeBuilding('alchemy');
    L('upgradeTwice', S().dan===2 ? 'ok' : 'bad:'+S().dan);
    S().stone=1; XX._upgradeBuilding('alchemy');
    L('upgradePoorStone', S().dan===2 ? 'ok' : 'bad:'+S().dan);
    S().herb=0; S().stone=1e9; XX._upgradeBuilding('alchemy');
    L('upgradePoorMat', S().dan===2 ? 'ok' : 'bad:'+S().dan);
    S().dan=10; XX._upgradeBuilding('alchemy');
    L('upgradeMaxRefuse', S().dan===10 ? 'ok' : 'bad:'+S().dan);
    S().dan=10; S().herb=9999; S().stone=1e9; forceWin();
    /* --- 炼丹：材料校验 + 产出入背包（百年/万年灵草绑定高阶丹方） --- */
    XX._craftItem('alchemy','dan1');
    L('dan1Craft', S().bag.length===1 && S().bag[0].t==='dan1' && S().herb===9999-5 && S().stone===1e9-20 ? 'ok' : 'bad');
    S().bag=[]; S().herb=9999; S().herb100=1;
    XX._craftItem('alchemy','dan2');
    L('dan2Craft', S().bag.filter(x=>x.t==='dan2').length===1 && S().herb100===0 && S().herb===9999-15 ? 'ok' : 'bad');
    /* 妖丹方：以妖丹代百年灵草，不受百年灵草门槛限制 */
    S().bag=[{t:'mat_core',n:'妖丹'},{t:'mat_core',n:'妖丹'}]; S().herb=9999; S().herb100=0;
    XX._craftItem('alchemy','dan2_core');
    L('dan2Core', S().bag.filter(x=>x.t==='dan2').length===1 && S().herb100===0 && S().bag.filter(x=>x.t==='mat_core').length===0 ? 'ok' : 'bad');
    /* --- 匠道经验：每次炼制 +10×品阶（成功全额），三炉后 10+20+20=50 --- */
    L('masteryExpGain', S().mastery.alchemyExp===50 && S().mastery.alchemyLv===1 ? 'ok' : 'bad:'+S().mastery.alchemyExp+'/'+S().mastery.alchemyLv);
    /* --- 阶位门槛：丹师一阶炼不了上品破境丹（reqM 2），拒绝且不扣料不涨经验 --- */
    S().bag=[]; S().herb=9999; S().herb100=2;
    XX._craftItem('alchemy','dan3');
    L('masteryGate', S().bag.length===0 && S().herb100===2 && S().mastery.alchemyExp===50 ? 'ok' : 'bad');
    /* --- 升阶：经验攒够 100 → 二阶，余量保留，成功率 +1% --- */
    S().mastery.alchemyExp=95; S().herb=9999; S().herb100=0; S().stone=1e9;
    forceWin(); XX._craftItem('alchemy','dan1');                       // +10 → 105 ≥ 100 升阶，余 5
    L('masteryUp', S().mastery.alchemyLv===2 && S().mastery.alchemyExp===5 ? 'ok' : 'bad:'+S().mastery.alchemyLv+'/'+S().mastery.alchemyExp);
    S().dan=3;
    L('rateWithMastery', Math.abs(XX._craftRate(R().dan3)-0.67)<1e-9 ? 'ok' : 'bad:'+XX._craftRate(R().dan3));  // 0.60+0.06+0.01
    S().dan=10;
    /* --- 高阶丹方：升到对应阶位后炼成 --- */
    S().mastery.alchemyLv=3; S().mastery.alchemyExp=0; S().bag=[]; S().herb100=2;
    XX._craftItem('alchemy','dan3');
    L('dan3Craft', S().bag.filter(x=>x.t==='dan3').length===1 && S().herb100===0 ? 'ok' : 'bad');
    S().bag=[]; S().herb10000=1; S().bag=[{t:'mat_eye',n:'魔晶'}];
    XX._craftItem('alchemy','dan4');
    L('dan4Craft', S().bag.filter(x=>x.t==='dan4').length===1 && S().herb10000===0 && S().bag.filter(x=>x.t==='mat_eye').length===0 ? 'ok' : 'bad');
    S().mastery.alchemyLv=5; S().mastery.alchemyExp=0;
    S().bag=[]; S().herb10000=2; S().bag=[{t:'boss_heart',n:'九尾心'}];
    XX._craftItem('alchemy','dan5');
    L('dan5Craft', S().bag.filter(x=>x.t==='dan5').length===1 && S().herb10000===0 ? 'ok' : 'bad');
    /* --- 品阶门槛：炼丹房 3 级炼不了大乘丹（需 7 级），拒绝且不扣料 --- */
    S().mastery.alchemyLv=5;
    S().dan=3; S().bag=[]; S().herb10000=2; S().bag=[{t:'boss_heart',n:'九尾心'}]; S().stone=1e9;
    XX._craftItem('alchemy','dan5');
    L('dan5Gate', S().bag.filter(x=>x.t==='dan5').length===0 && S().herb10000===2 && S().bag.length===1 ? 'ok' : 'bad');
    S().dan=10;
    /* --- 材料不足 → 拒绝 --- */
    S().bag=[]; S().herb=1; S().stone=1e9;
    XX._craftItem('alchemy','dan1');
    L('dan1Poor', S().bag.length===0 && S().stone===1e9 ? 'ok' : 'bad');
    /* --- 失败返还 30% 材料（灵石不退）+ 失败也涨 30% 经验 --- */
    S().bag=[]; S().herb=100; S().herb100=1; S().stone=1e9; S().mastery.alchemyLv=2; S().mastery.alchemyExp=0; forceFail();
    XX._craftItem('alchemy','dan2');                                   // 灵草 15→返 4，百年灵草 1→返 0，灵石 80 不退；经验 +20×0.3=6
    L('failRefund', S().bag.length===0 && S().herb===89 && S().herb100===0 && S().stone===1e9-80 ? 'ok' : 'bad:'+S().herb+'/'+S().herb100+'/'+S().stone);
    L('failMasteryExp', S().mastery.alchemyExp===6 ? 'ok' : 'bad:'+S().mastery.alchemyExp);
    forceWin();
    /* --- 背包满 → 拒绝炼制 --- */
    S().bag=new Array(20).fill(null).map(()=>({t:'herb',n:'灵草'})); S().herb=9999; S().stone=1e9;
    XX._craftItem('alchemy','dan1');
    L('bagFullRefuse', S().bag.length===20 ? 'ok' : 'bad:'+S().bag.length);
    S().bag=[];
    /* --- 炼器坊：品阶门槛 + 产出装备 + 已装备拦截回炉 + 器师阶位 --- */
    S().mastery.forgeLv=1; S().mastery.forgeExp=0;
    S().forge=5; S().ore=9999; S().weapon=0; S().stone=1e9; S().bag=[{t:'boss_core',n:'兽王精魄'}];
    XX._craftItem('forge','wp4');                                      // 极品法宝需器师三阶
    L('wp4MasteryGate', S().weapon===0 && S().ore===9999 && S().bag.length===1 ? 'ok' : 'bad');
    S().mastery.forgeLv=3; S().forge=3;
    XX._craftItem('forge','wp4');                                      // 器师够阶但炼器坊 3 级 < 5
    L('wp4Gate', S().weapon===0 && S().ore===9999 ? 'ok' : 'bad');
    S().forge=5; S().ore=200; S().bag=[{t:'boss_core',n:'兽王精魄'}];
    XX._craftItem('forge','wp4');
    L('wp4Craft', S().weapon===4 && S().ore===0 && S().bag.length===0 ? 'ok' : 'bad:'+S().weapon);
    XX._craftItem('forge','wp4');                                      // 已装备同阶 → 拒绝回炉
    L('wp4Owned', S().weapon===4 ? 'ok' : 'bad');
    S().forge=1; S().ore=10; S().weapon=0; S().stone=1e9;
    XX._craftItem('forge','wp1');
    L('wp1Craft', S().weapon===1 ? 'ok' : 'bad:'+S().weapon);
    L('weaponName', XX._weaponName(4)==='极品法宝' ? 'ok' : 'bad:'+XX._weaponName(4));

    /* ========== 十一、突破联动：缺丹药指路炼丹房 / 缺法宝指路炼器坊 ========== */
    S().rank=20; S().bag=[]; S().dan=10; S().forge=10; S().weapon=0; S().stone=1e9; S().herb=9999;
    S().mastery.alchemyLv=2; S().mastery.alchemyExp=0;                 /* 丹方解锁口径：建筑 + 阶位双达标 */
    const h1=XX._pillHint();
    L('pillHintCraft', h1 && h1.indexOf('炼丹房')>=0 && h1.indexOf('炼制')>=0 ? 'ok' : 'bad:'+h1);
    S().mastery.alchemyLv=1; S().dan=10;
    const h1b=XX._pillHint();
    L('pillHintMastery', h1b && h1b.indexOf('丹师')>=0 && h1b.indexOf('阶')>=0 ? 'ok' : 'bad:'+h1b);
    S().mastery.alchemyLv=2; S().dan=1;
    const h2=XX._pillHint();
    L('pillHintLocked', h2 && h2.indexOf('需炼丹房 3 级')>=0 ? 'ok' : 'bad:'+h2);
    S().bag=[{t:'dan3',n:'上品破境丹'}];
    L('pillHintHasPill', XX._pillHint()===null ? 'ok' : 'bad:'+XX._pillHint());
    S().bag=[];
    const wh=XX._weaponHint();
    L('weaponHintForge', wh && wh.indexOf('炼器坊')>=0 ? 'ok' : 'bad:'+wh);
    S().weapon=2;
    L('weaponHintDone', XX._weaponHint()===null ? 'ok' : 'bad');
    const st2=XX._breakState(null);
    L('stateLink', st2.alchemyLv===1 && st2.forgeLv===10 && !!st2.pillHint && st2.weaponHint===null ? 'ok' : 'bad');
    /* 无丹药点击突破：日志指路但不拦截突破本身 */
    S().rank=15; S().exp=1e18; S().wisdom=0; S().failBonus=0; S().bag=[]; S().dan=10; S().tianji=0; S().guardMirror=0; S().guardArray=0;
    forceWin(); XX._attemptBreak({});
    L('hintNoBlock', S().rank===16 ? 'ok' : 'bad:'+S().rank);

    /* ========== 十二、妖兽表健全性：境界覆盖 / 战力曲线 / tier5 神兽 ========== */
    const BS=XX._beasts;
    L('beastCount', BS.length===43 ? 'ok' : 'bad:'+BS.length);
    const rankCover=(()=>{ const seen=new Set(BS.map(b=>b.rank)); for(let r=0;r<=25;r++) if(!seen.has(r)) return false; return true; })();
    L('beastRankCover', rankCover ? 'ok' : 'bad');                      /* rank 0–25 每级都有怪可打 */
    const byRank=BS.slice().sort((a,b)=>a.rank-b.rank);
    let powMono=true; byRank.forEach((b,i)=>{ if(i>0 && b.power<byRank[i-1].power) powMono=false; });
    L('beastPowMono', powMono ? 'ok' : 'bad');                          /* 高境界战力不低于低境界 */
    const t5=BS.filter(b=>b.tier===5);
    L('beastTier5', t5.length===9 && t5.every(b=>b.rank>=22) ? 'ok' : 'bad:'+t5.length);
    L('beastTier5Boss', t5.filter(b=>b.boss && b.bossDrop==='boss_heart').length===3 ? 'ok' : 'bad');
    L('beastImg', BS.every(b=>b.img && b.id && b.name && b.power>0) ? 'ok' : 'bad');
    L('eggRateT5', XX._eggRate[5]===0.008 ? 'ok' : 'bad');
    L('marrowItem', (XX._items.mat_marrow||{}).n==='神兽之髓' && XX._beasts.some(b=>b.drop==='mat_marrow') ? 'ok' : 'bad');
    /* 高境界怪属性抽样（全局战力刻度 ×POW_K=100）：渡劫期应有无 Boss 怪在 4000–5000 万区间、飞升 Boss 9000 万 */
    L('beastLatePower', BS.some(b=>b.rank===24 && !b.boss && b.power>=40000000) && (BS.find(b=>b.id==='hundun')||{}).power===90000000 ? 'ok' : 'bad');
    /* 战力刻度统一：POW_K=100，最弱怪 1000、最强怪 9000 万、1 层镇妖塔守卫 1200（2026-11-19 制作人批）、秘境首章首层 3000 */
    L('powScale', XX._powK===100 && BS[0].power===1000 && BS[BS.length-1].power===90000000
      && XX._towerPower(1)===1200 && XX._secretPower(0,1)===3000 ? 'ok' : 'bad');
    /* 阶段二 N7：灵兽分档战力 + 三只合计 40% 境界战力总上限 */
    const petBak = S().pets.slice(), petRankBak = S().rank;
    S().rank = 17; S().pets = [{ bid: 'spider', lv: 1 }];
    L('petSpider1', XX._petPower(S().pets[0])===152955 ? 'ok' : 'bad:'+XX._petPower(S().pets[0]));
    S().pets[0].lv = 30;
    L('petSpider30', XX._petPower(S().pets[0])===282150 ? 'ok' : 'bad:'+XX._petPower(S().pets[0]));
    S().pets = [{ bid: 'spider', lv: 30 }, { bid: 'fox', lv: 30 }, { bid: 'hundun', lv: 30 }];
    const petCap = Math.floor(0.40 * 10 * XX._powK * Math.pow(1.5, 17));
    L('petCap', XX._petPowerSum()===petCap ? 'ok' : 'bad:'+XX._petPowerSum()+'/'+petCap);
    S().pets = petBak; S().rank = petRankBak;

    /* ========== 十三、探索产出百年/万年灵草 ========== */
    S().stone=1e9; S().herb100=0; S().herb10000=0; S().rank=20; S().bag=[];
    Math.random=()=>0.1;                                 // <0.35 掉百年；rank>=15 且 <0.15 掉万年
    XX._treasure();
    L('treasureHerb100', S().herb100>0 ? 'ok' : 'bad');
    L('treasureHerb10000', S().herb10000>0 ? 'ok' : 'bad');
    S().rank=3; S().herb100=0; S().herb10000=0; Math.random=()=>0.1; XX._treasure();
    L('treasureNoHerb10000Early', S().herb100>0 && S().herb10000===0 ? 'ok' : 'bad');

    /* ========== 十三、旧入口兼容 ========== */
    S().rank=0; S().exp=1e18; S().wisdom=0; S().failBonus=0; S().bag=[]; S().tianji=0;
    Math.random=realRandom;
    let oldOk=true; try{ XX._break(); }catch(e){ oldOk=false; }
    L('oldEntry', oldOk ? 'ok' : 'bad');

    /* ========== 十四、资源栏显示百年/万年灵草 ========== */
    window.switchTab('dong');
    S().herb100=7; S().herb10000=3; XX._render();
    L('resHerb100', document.getElementById('xx-herb100').textContent==='7' ? 'ok' : 'bad:'+document.getElementById('xx-herb100').textContent);
    L('resHerb10000', document.getElementById('xx-herb10000').textContent==='3' ? 'ok' : 'bad:'+document.getElementById('xx-herb10000').textContent);
  }catch(e){ L('EXC', e.message); }
  Math.random=realRandom;
  const d=document.createElement('pre'); d.id='diag'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>
</body>`;

(async () => {
  if (!EDGE) { console.log('无 Edge，跳过'); process.exit(0); }
  fs.mkdirSync(TMP, { recursive: true });
  const html = fs.readFileSync(SRC, 'utf8');
  const diagFile = path.join(TMP, '._diag_break.html');
  fs.writeFileSync(diagFile, html.replace('</body>', DIAG), 'utf8');
  const ud = path.join(SCRATCH, 'xxbrk' + process.pid);

  const dump = () => {
    let dom = '';
    try {
      dom = execEdge(['--headless=new', '--disable-gpu', '--no-first-run',
        '--user-data-dir=' + ud, '--virtual-time-budget=8000', '--window-size=900,1200',
        '--dump-dom', 'file:///' + diagFile.replace(/\\/g, '/')],
        { encoding: 'utf8', timeout: 90000, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch (e) { dom = (e.stdout || '') + ''; }
    return dom;
  };

  console.log('\n=== 九霄问道 · 全局突破系统专项 ===');
  const dom = dump();
  try { fs.rmSync(diagFile, { force: true }); } catch(e) {}
  const m = dom.match(/<pre id="diag">([\s\S]*?)<\/pre>/);
  ok(!!m, '注入脚本跑完');
  const raw = m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
  const F = {};
  raw.split('|').forEach(seg => { const i = seg.indexOf('='); if (i > 0) F[seg.slice(0, i).trim()] = seg.slice(i + 1).trim(); });

  ok(F.EXC === undefined, '无异常', F.EXC);
  const CASES = [
    ['tierCover', '境界段表无缝覆盖 rank 0–24'],
    ['tierMono', '基础概率随境界单调递减'],
    ['tierPillMono', '各段需求丹药品阶单调不降'],
    ['tierLoseMono', '失败扣修为比例随境界递增'],
    ['guardKeys', '三类道具元数据（名称/类型/描述）完整'],
    ['wisdomCfg', '悟道双轨配置完整（进度 + 货币产出）'],
    ['shopCfg', '天机阁配置表 3 项且含限购'],
    ['tianjiNoStoneCfg', '天机令按大境界限购、灵石按总资产 45% + 悟道 3000'],
    ['limitCfg', '护心镜每周 2 次 / 护道阵法每周 1 次'],
    ['arrayBonusCfg', '护道阵法固定 +15%'],
    ['pillLowInvalid', '化神段下品破境丹无效'],
    ['pillMidInvalid', '化神段中品破境丹无效'],
    ['pillHighValid', '化神段上品破境丹有效'],
    ['pillTopValid', '越阶丹药（大乘）全境界有效'],
    ['pillLowValidEarly', '炼气段下品破境丹有效'],
    ['chanceBase', '无加成时成功率 = 段表基础值'],
    ['chanceBonus', '失败加成按公式叠加（悟道值不再直接加概率）'],
    ['kneeUnder', 'N1 软膝：raw≤0.85 原样通过'],
    ['kneeOver', 'N1 软膝：0.94 → 0.8635（超出部分只兑现 15%）'],
    ['kneeFull', 'N1 软膝：满配 1.70 → 0.9775'],
    ['kneeClampMax', 'N1 终夹上限 0.98'],
    ['kneeMarginal', 'N1 软膝边际：+0.15 名义 → +0.0225 实际'],
    ['breakMaxCfg', 'N1 breakMax = 0.98'],
    ['stateChance', 'breakState.chance 与实际最终口径一致'],
    ['stateArrayChance', 'breakState 勾选阵法时概率 +15%'],
    ['statePills', 'breakState 丹药列表含有效性与持有数（破境族九阶梯子以本轮所需丹为界）'],
    ['stateNeed', 'breakState 正确指出当前段需求丹药'],
    ['failInsight', '失败顿悟进度 +5'],
    ['failWisdom', '失败悟道值 +5×境界系数'],
    ['failBonus', '失败下次成功率 +5%'],
    ['failLoseExp', '失败按段表比例扣除修为'],
    ['failRankKeep', '失败境界不变'],
    ['failStoneLianqi', '炼气段失败不扣灵石（外部评审第 6 项）'],
    ['failExpLianqi', '炼气段失败仍扣修为反噬'],
    ['failBonusLianqi', '炼气段失败仍累加下次成功率 +5%'],
    ['failStoneZhuji', '筑基段失败不扣灵石（保持现状）'],
    ['failExpZhuji', '筑基段失败仍扣修为反噬'],
    ['failBonusCap', '失败加成封顶 +30%'],
    ['insightCap', '顿悟进度封顶 100'],
    ['wisdomNoCap', '悟道值货币无上限累积（与顿悟解耦）'],
    ['epiphanyWin', '顿悟圆满必定突破成功'],
    ['epiphanyReset', '顿悟后仅清进度与失败加成、悟道值保留'],
    ['tianjiWin', '天机令必定突破成功'],
    ['tianjiUsed', '天机令使用后消耗'],
    ['tianjiNone', '无天机令时勾选被拒绝'],
    ['mirrorHalfExp', '护心镜失败返还 50% 已扣修为'],
    ['mirrorUsed', '护心镜失败消耗'],
    ['mirrorKeepOnWin', '护心镜成功时不消耗'],
    ['arrayUsedOnFail', '护道阵法失败也消耗（一用即耗）'],
    ['arrayUsedOnWin', '护道阵法成功也消耗'],
    ['arrayRefuse', '无阵法时勾选被拒绝且不扣修为'],
    ['arrayNotAuto', '不勾选时阵法不自动生效'],
    ['arrayAdditive', '护道阵法 +15% 为加算（不翻倍丹药）'],
    ['pillTierRefuse', '品阶不足的丹药被拒绝且不消耗'],
    ['pillConsumed', '有效丹药助突破成功并消耗'],
    ['pillConsumedOnFail', '失败也消耗丹药（防无限重试）'],
    ['pillMissing', '背包无此丹药时拒绝突破'],
    ['expNotEnough', '修为不足拒绝突破'],
    ['priceScale', '灵石价需求锚随境界指数增长（家当薄时）'],
    ['priceAsset', '灵石价按总资产比例（4 亿 × 35%/40%/45%，与境界无关）'],
    ['priceWisdom', '悟道价大额基础价 800/1500/3000'],
    ['wisdomGainScale', '悟道值产出与价格同系数缩放'],
    ['exchOk', '800 悟道 + 48 灵石双扣兑换护心镜成功'],
    ['exchPoor', '悟道值不足兑换被拒绝'],
    ['week2', '护心镜第 2 次兑换成功'],
    ['weekSoldOut', '护心镜第 3 次售罄（每周 2 次）'],
    ['arrayWeekLimit', '护道阵法每周限 1 次'],
    ['weekReset', '跨周自动重置周限购'],
    ['tianjiNoStone', '天机令无悟道值时被拒（灵石分文未扣）'],
    ['tianjiExch', '3000 悟道 + 45% 资产兑换天机令'],
    ['tianjiTierLimit', '天机令同境界第 2 次售罄'],
    ['tianjiNewTier', '突破到大境界新段后解锁兑换'],
    ['shopList', '天机阁商品列表 3 项'],
    ['bldMax', '炼丹房/炼器坊上限 10 级'],
    ['bldUnlockedAll', '满级建筑解锁全部配方（37 丹方 / 36 法器）'],
    ['bldCostShape', '建筑升级消耗 = 灵石 + 基础材料'],
    ['rateFormula', '成功率 = 基础 + 等级×2%（大乘丹 0.25+0.20=0.45）'],
    ['rateCap', '成功率硬上限 95%'],
    ['rateLv3', '3 级炼丹房成功率按公式加成'],
    ['upgradeOk', '升级扣料 +1 级并解锁配方'],
    ['upgradeTwice', '连续升级到 2 级'],
    ['upgradePoorStone', '灵石不足拒绝升级'],
    ['upgradePoorMat', '材料不足拒绝升级'],
    ['upgradeMaxRefuse', '满级后拒绝再升级'],
    ['dan1Craft', '下品破境丹炼成（灵草+灵石）'],
    ['dan2Craft', '中品破境丹炼成并扣百年灵草'],
    ['dan2Core', '妖丹方不受百年灵草门槛限制'],
    ['masteryExpGain', '炼制涨匠道经验（10×品阶，一阶起步）'],
    ['masteryGate', '丹师一阶炼不了上品破境丹（reqM 2）'],
    ['masteryUp', '经验满 100 升二阶且余量保留'],
    ['rateWithMastery', '阶位加成计入成功率（+1%/阶）'],
    ['dan3Craft', '丹师三阶后上品破境丹炼成'],
    ['dan4Craft', '极品破境丹（万年灵草+魔晶）炼成'],
    ['dan5Craft', '大乘破境丹（万年灵草×2+九尾心）炼成'],
    ['dan5Gate', '炼丹房 3 级炼不了大乘丹（需 7 级）且不扣料'],
    ['dan1Poor', '材料不足拒绝炼制且不扣灵石'],
    ['failRefund', '炼制失败返还 30% 材料、灵石不退'],
    ['failMasteryExp', '失败也涨 30% 匠道经验'],
    ['bagFullRefuse', '背包满时拒绝炼制'],
    ['wp4MasteryGate', '器师一阶炼不了极品法宝（reqM 3）'],
    ['wp4Gate', '炼器坊 3 级炼不了极品法宝（需 5 级）'],
    ['wp4Craft', '极品法宝炼成并装备'],
    ['wp4Owned', '已装备同阶法宝拒绝回炉'],
    ['wp1Craft', '下品法宝炼成并装备'],
    ['weaponName', '法宝名按品质查配方表'],
    ['pillHintCraft', '缺破境丹时指路「请前往炼丹房炼制」'],
    ['pillHintMastery', '阶位不足时提示需丹师几阶'],
    ['pillHintLocked', '丹方未解锁时提示所需炼丹房等级'],
    ['pillHintHasPill', '持有有效破境丹时无指路'],
    ['weaponHintForge', '高阶缺法宝时指路炼器坊'],
    ['weaponHintDone', '已有中品法宝时无指路'],
    ['stateLink', 'breakState 带炼丹房/炼器坊等级与指路文案'],
    ['hintNoBlock', '缺丹药点击突破：提示但不拦截'],
    ['beastCount', '妖兽表扩至 43 只'],
    ['beastRankCover', 'rank 0–25 每级都有妖兽可打'],
    ['beastPowMono', '妖兽战力随境界单调不降'],
    ['beastTier5', '新增 9 只神兽（合体期起）'],
    ['beastTier5Boss', '3 只神兽 Boss 掉九尾心（大乘丹材料）'],
    ['beastImg', '妖兽图标/名称/战力字段完整'],
    ['eggRateT5', '神兽掉蛋概率 0.8%'],
    ['marrowItem', '神兽之髓物品定义与掉落来源闭环'],
    ['beastLatePower', '渡劫/飞升期有 4000 万+ 战力 Boss 级内容'],
    ['powScale', '全局战力刻度 ×100（妖兽/秘境不变；镇妖塔 1 层按 2026-11-19 批降为 1200）'],
    ['petSpider1', 'N7 妖蛛 Lv1 战力 152,955（品阶 4 × 0.045 × 1.03）'],
    ['petSpider30', 'N7 妖蛛 Lv30 战力 282,150（等级系数 0.03/级）'],
    ['petCap', 'N7 三只灵兽合计封顶 40% 境界战力'],
    ['treasureHerb100', '探索产出百年灵草'],
    ['treasureHerb10000', '高境界探索产出万年灵草'],
    ['treasureNoHerb10000Early', '低境界探索不产万年灵草'],
    ['oldEntry', '旧入口 doBreak 兼容'],
    ['resHerb100', '洞府资源栏显示百年灵草'],
    ['resHerb10000', '洞府资源栏显示万年灵草']
  ];
  for (const [k, label] of CASES) ok(F[k] === 'ok', label + '（' + k + '=' + F[k] + '）');

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
