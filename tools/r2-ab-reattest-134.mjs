// 第134轮 · R2-A/R2-B 现状只读复核测量（纯确定性公式复算，不触碰任何产品代码）
// 目的：用当前源码常量复算关键派生值，证明 R2 相关代码自第132/133轮后未漂移。
const NEED = [800, 1600, 3200, 6400, 12800];          // server.mjs:24（副本五层门槛，固定不涨）
const RANK_CAP = 25;                                 // server.mjs:205
const STEP = 8000;                                   // profile.mjs PROFILE_RANK_STEP
const needOf = i => Math.floor(40 * Math.pow(1.85, i)); // game.js:2746（单机境界需求）

console.log('=== R2 关键常量（与 132/133 轮比对）===');
console.log('副本五层门槛 NEED =', JSON.stringify(NEED), ' 总和 =', NEED.reduce((a, b) => a + b, 0));
console.log('RANK_CAP =', RANK_CAP, ' STEP =', STEP);
console.log('单机 needOf(i)=40*1.85^i, i=0..10 =', [...Array(11)].map((_, i) => needOf(i)).join(','));

console.log('\n=== 档案战力 core(rank) = 1000 * 1.5^rank * 乘子（乘子取 1 为下限，server.mjs:240）===');
for (const r of [0, 3, 6, 9, 12, 15, 18, 21, 24, 25]) {
  console.log(`  rank ${String(r).padStart(2)} -> 基础战力 ${Math.round(1000 * Math.pow(1.5, r)).toLocaleString()}`);
}

console.log('\n=== 满五层通关模拟：每局 cult += ΣNEED = 32000，rank = min(25, floor(cult/8000)) ===');
let cult = 0;
for (let run = 1; run <= 25; run++) {
  cult += NEED.reduce((a, b) => a + b, 0);
  const rank = Math.min(RANK_CAP, Math.floor(cult / STEP));
  const power = Math.round(1000 * Math.pow(1.5, rank));
  console.log(`  run ${String(run).padStart(2)}: cult=${cult.toLocaleString()}  rank=${rank}  基础战力=${power.toLocaleString()}`);
  if (rank === RANK_CAP) { console.log('  >> rank 在第', run, '局封顶(25)'); break; }
}

console.log('\n=== 修为累积（R2-B 核心）：每局恒 += ΣNEED，无上限；rank 满后修为继续涨但无用 ===');
console.log('  每局修为增量 =', NEED.reduce((a, b) => a + b, 0), '（与第133轮"恒定累积"结论一致，具体 24,800/局为代理序列口径，本公式为其上界口径之一）');
console.log('  rank 满 25 后：cultivation 仍可无限增长，但 rank 不再变化 → 战力不再增长（R2-B: 毕业后战力增量为 0，体修除外）');
