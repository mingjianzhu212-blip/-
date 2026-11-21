/* 九霄问道 数值平衡模拟器（统一数值 v3）
   跑法：node xiuxian/tools/balance-sim.js
   ⚠️ 这里复刻了 index.html 里的 BAL 参数，改数值时两处同步改。 */
'use strict';
const RANK_NAMES = [];
['一层','二层','三层','四层','五层','六层','七层','八层','九层'].forEach(x=>RANK_NAMES.push('炼气'+x));
['初期','中期','后期'].forEach(x=>RANK_NAMES.push('筑基'+x));
['初期','中期','后期'].forEach(x=>RANK_NAMES.push('金丹'+x));
['初期','中期','后期'].forEach(x=>RANK_NAMES.push('元婴'+x));
['初期','中期','后期'].forEach(x=>RANK_NAMES.push('化神'+x));
RANK_NAMES.push('炼虚境','合体境','大乘境','渡劫期','飞升');
const TOP = RANK_NAMES.length-1;

// ===== 新数值（与 index.html BAL 一致）=====
const BAL = {
  need0: 40, needG: 1.85,
  v0: 1.6, rankH: 1.18,
  stone0: 0.5, stoneRankH: 1.48,
  caveR: 1.06, caveMax: 20,
  danR: 1.0, danMax: 20,
  fieldPer: 2, fieldMax: 30,
  caveK: 0.18, caveCostR: 1.30,
  danK: 0.20, danCostR: 1.35,
  fieldK: 0.20, fieldCostR: 1.15,
  treasureK: 0.5,
  daoExp: 0.45, daoStone: 0.2,
  breakBase: 0.85, breakMin: 0.05, breakMax: 0.95,
  daoBreak: 0.02, pillBreak: 0.15, pillDur: 600,
  actLimit: { sit: 30, herb: 30, train: 12, enlight: 6, ponder: 4 }
};
const GONGS = [
  { id:'gong1', unlock:0,  rate:1.03, max:10, costK:0.15, costR:1.30 },
  { id:'gong2', unlock:9,  rate:1.04, max:10, costK:0.18, costR:1.32 },
  { id:'gong3', unlock:12, rate:1.05, max:10, costK:0.22, costR:1.35 }
];
const WEAPON_MULT = [1.0, 1.05, 1.10, 1.20, 1.35]; // 法宝品质加成
const root = { mult:1.0, bonus:0.02 }; // 杂灵根
const needOf = i => Math.floor(BAL.need0 * Math.pow(BAL.needG, i));
const gongMult = s => GONGS.reduce((a,g)=>a*Math.pow(g.rate, Math.min(s[g.id],g.max)), 1);
const expRate = s => BAL.v0 * root.mult * Math.pow(BAL.rankH, s.rank) * gongMult(s) * WEAPON_MULT[s.weapon||0] * (1 + 0.45*s.dao);
const stoneRate = s => BAL.stone0 * Math.pow(BAL.stoneRankH, s.rank) * Math.pow(BAL.caveR, Math.min(s.cave,BAL.caveMax)) * (1 + 0.2*s.dao);
const fieldPerSec = f => Math.min(f, BAL.fieldMax) * BAL.fieldPer / 60;
const gongCost = (s,g) => Math.floor(needOf(s.rank) * g.costK * Math.pow(g.costR, s[g.id]));
const caveCost = s => Math.floor(needOf(s.rank) * BAL.caveK * Math.pow(BAL.caveCostR, s.cave));
const danCost = s => Math.floor(needOf(s.rank) * BAL.danK * Math.pow(BAL.danCostR, s.dan));
const fieldCost = s => Math.floor(needOf(s.rank) * BAL.fieldK * Math.pow(BAL.fieldCostR, s.field));
const breakChance = s => {
  const base = Math.pow(BAL.breakBase, s.rank);
  const b = base + root.bonus + Math.min(s.dan,BAL.danMax)*(BAL.danR/100) + s.dao*BAL.daoBreak;
  return Math.max(BAL.breakMin, Math.min(BAL.breakMax, b));
};
const fmt = n => { n=Math.floor(n||0); if(n<1e4)return String(n); if(n<1e8)return (n/1e4).toFixed(n<1e6?2:1)+'万'; return (n/1e8).toFixed(2)+'亿'; };
const dur = s => { s=Math.floor(s); if(s<90)return s+'秒'; if(s<5400)return Math.floor(s/60)+'分'; if(s<86400)return (s/3600).toFixed(1)+'时'; return (s/86400).toFixed(1)+'天'; };

function sim({ dao=0, totalDays=300 }){
  const s = { rank:0, exp:0, stone:0, cave:0, dan:0, field:0, mine:0, ore:0, weapon:0, dao, gong1:0, gong2:0, gong3:0 };
  let t=0; const DT=0.5;
  let firstBreak=0, firstBreakDone=false;
  const marks=[];
  while(t < totalDays*86400 && s.rank < TOP){
    t += DT;
    s.exp += expRate(s)*DT;
    s.stone += (stoneRate(s)+fieldPerSec(s.field))*DT;
    s.ore += Math.min(s.mine, BAL.mineMax) * BAL.minePer/60 * DT;  /* 矿脉产矿石 */
    /* 每日主动操作已限次，收益极小（约挂机的 0.1%），近似忽略，不再模拟 */
    /* 升级/炼器：买得起的就买（按成本升序） */
    for(let g=0;g<6;g++){
      const opts=[];
      GONGS.forEach(gg=>{ if(s.rank>=gg.unlock && s[gg.id]<gg.max) opts.push({c:gongCost(s,gg), b:()=>s[gg.id]++}); });
      if(s.cave<BAL.caveMax) opts.push({c:caveCost(s), b:()=>s.cave++});
      if(s.dan<BAL.danMax) opts.push({c:danCost(s), b:()=>s.dan++});
      if(s.field<BAL.fieldMax) opts.push({c:fieldCost(s), b:()=>s.field++});
      if(s.mine<BAL.mineMax) opts.push({c:Math.floor(needOf(s.rank)*BAL.mineK*Math.pow(BAL.mineCostR,s.mine)), b:()=>s.mine++});
      /* 炼器：矿石+灵石够就升下一阶法宝 */
      if(s.weapon < 4){
        const rec = { 1:{ore:10,stoneK:0.5}, 2:{ore:30,stoneK:2.0}, 3:{ore:80,stoneK:8.0}, 4:{ore:200,stoneK:30.0} }[s.weapon+1];
        if(s.ore >= rec.ore && s.stone >= needOf(s.rank)*rec.stoneK){
          s.ore -= rec.ore; s.stone -= needOf(s.rank)*rec.stoneK; s.weapon++;
        }
      }
      opts.sort((a,b)=>a.c-b.c);
      if(opts.length && s.stone>=opts[0].c){ s.stone-=opts[0].c; opts[0].b(); } else break;
    }
    if(s.exp >= needOf(s.rank)){
      if(Math.random() < breakChance(s)){
        s.exp -= needOf(s.rank); s.rank++;
        if(!firstBreakDone){ firstBreak = s.rank>=1 ? t : firstBreak; firstBreakDone = s.rank>=1; }
        marks.push({ rank:s.rank, t });
      } else {
        s.exp = Math.max(0, s.exp - Math.floor(needOf(s.rank)*0.45));
      }
    }
  }
  return { s, t, firstBreak, marks };
}

console.log('===== 统一数值 v3 节奏验证（功法3种 + 法宝 + 突破概率衰减 + 每日限次）=====\n');
console.log('突破概率：base=' + BAL.breakBase + '^层，硬上限 ' + (BAL.breakMax*100) + '%，丹炉 +' + BAL.danR + '%/级');
console.log('功法：', GONGS.map(g=>g.id+' ×'+g.rate+'^'+g.max).join(' · '), '总加成 ×'+(1.03**10*1.04**10*1.05**10).toFixed(2));
console.log('法宝：极品 ×1.35（矿石 200 + need×30）');

console.log('\n【飞升耗时】(挂机为主，主动操作已限次可忽略)');
for(const dao of [0,1]){
  const r = sim({dao});
  console.log('道韵'+dao+': '+(r.s.rank>=TOP?'飞升 '+dur(r.t):'未飞升 '+dur(r.t)+'→'+RANK_NAMES[r.s.rank])+
    ' | 终态 引气'+r.s.gong1+'/10 凝神'+r.s.gong2+'/10 金丹'+r.s.gong3+'/10 洞府'+r.s.cave+' 丹炉'+r.s.dan+' 灵田'+r.s.field+'/30 矿脉'+r.s.mine+'/30 法宝'+r.s.weapon+'阶');
}

console.log('\n【突破概率随境界】(杂灵根, 丹炉满20, 无丹药)');
for(const r of [0,5,9,12,15,18,20,22,25]){
  const s = { rank:r, dan:20, dao:0 };
  console.log(('r'+r).padEnd(4)+RANK_NAMES[r].padEnd(8)+(breakChance(s)*100).toFixed(1)+'%');
}

console.log('\n【里程碑】(道韵0)');
{
  const r = sim({dao:0});
  const tRank = {}; r.marks.forEach(m=>tRank[m.rank]=m.t);
  for(const m of [0,3,6,9,12,15,18,21,24,25]){
    console.log(RANK_NAMES[m].padEnd(8)+(m===0?'0秒':(tRank[m]?dur(tRank[m]):'—')));
  }
}

/* ===== 经济体检（防通胀三件套）=====
   1) 产出指数增长但增速(1.48)远低于物价(1.85) → 时产/物价随境界崩塌 → 永远缺钱；
   2) 离线收益 8 小时封顶 → 挂机两天再也攒不出亿万灵石；
   3) 天机阁保底道具按「总资产 35%~45% + 大额悟道值」双扣 → 囤多少都一把榨走。 */
const SHOP_RATIO = { heart_mirror:0.35, guard_array:0.40, tianji:0.45 };
const SHOP_WISDOM = { heart_mirror:800, guard_array:1500, tianji:3000 };
console.log('\n【经济体检】挂机时产 vs 物价（need）与天机阁吸血量');
console.log('境界'.padEnd(9)+'时产(石/时)'.padStart(14)+('need').padStart(12)+('时产/need').padStart(12)+('8h离线').padStart(12)+('护心镜=35%资产').padStart(16));
for(const r of [0,5,10,15,18,20,25]){
  const s = { rank:r, cave:BAL.caveMax, dao:0 };
  const inc = (stoneRate(s)+fieldPerSec(BAL.fieldMax))*3600;
  const need = needOf(r);
  const hoard = inc*8;                                    // 按 8 小时挂机的身家估算
  const mirror = Math.max(need*1.2, Math.floor(hoard*SHOP_RATIO.heart_mirror));
  console.log(('r'+r+' '+RANK_NAMES[r]).padEnd(11)+fmt(inc).padStart(13)+fmt(need).padStart(12)+
    (inc/need).toFixed(2).padStart(12)+fmt(hoard).padStart(12)+fmt(mirror).padStart(16));
}
console.log('悟道值消耗：护心镜 800 / 护道阵 1500 / 天机令 3000（×1.15^境界），' +
            '对比产出：突破失败 +5×系数、签到 +100×系数/天 → 必须长期省着花');
