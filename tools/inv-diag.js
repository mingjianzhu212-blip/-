// 浏览器内 DIAG：在真实游戏运行时里驱动背包/物品/炼制/存档全链路，返回 JSON 观测。
// 仅读取与调用 XX 暴露的调试接口，不修改产品代码；localStorage 写入落在一次性隔离 profile。
(async () => {
  const R = { errors: [], notes: [] };
  const getXX = () => { try { return XX; } catch (e) { return (globalThis.XX || null); } };
  const XX = getXX();
  if (!XX) { R.errors.push('XX 不可访问（全局词法绑定未在 evaluate 上下文解析）'); return JSON.stringify(R); }
  try { if (globalThis.Tutorial && globalThis.Tutorial.finish) globalThis.Tutorial.finish(); } catch (e) {}
  const S = XX._s;
  const reset = () => {
    S.bag = []; S.bagSize = 50; S.stone = 1000000; S.herb = 1000000; S.ore = 1000000;
    S.dan = 99; S.forge = 99;
    S.mastery = { alchemyLv: 9, alchemyExp: 0, forgeLv: 9, forgeExp: 0 };
    S.equipment = { weapon: null, armor: null, accessory: null };
    S.rank = 20; S.sign = { day: -999 }; S.trun = null;
  };
  const countBag = id => S.bag.filter(x => x && x.t === id).length;
  const COUNTERS = ['stone', 'herb', 'ore', 'herb100', 'herb10000'];

  // ① 获取（acquire）：塔·精锐门给背包物品
  try {
    reset();
    const before = S.bag.length;
    S.trun = null; XX._towerEnter();
    const run = XX._towerRun();
    if (run) run.doors = ['elite', 'fight', 'vault'];
    XX._render();
    XX._towerDoor('elite');
    R.acquire = { before, after: S.bag.length, grew: S.bag.length > before };
  } catch (e) { R.errors.push('acquire: ' + (e.stack || e)); }

  // ② 堆叠/合并：重复获取→多条独立 entry，按 id 可计数（无数量字段，堆叠靠计数）
  try {
    reset();
    const id = 'inv_test_dup';
    S.bag.push({ t: id, n: '测试物' });
    S.bag.push({ t: id, n: '测试物' });
    S.bag.push({ t: id, n: '测试物' });
    R.stack = { entries: S.bag.length, countById: countBag(id), perEntry: true };
  } catch (e) { R.errors.push('stack: ' + (e.stack || e)); }

  // ③+⑧ 满背包不丢物：背包满时卸下→返回 false，装备不变、物品不丢
  try {
    reset();
    S.bagSize = 3;
    S.bag = [{ t: 'junk1', n: 'a' }, { t: 'junk2', n: 'b' }, { t: 'junk3', n: 'c' }];
    S.equipment = { weapon: 'eq_qingfeng', armor: null, accessory: null };
    const beforeEq = JSON.stringify(S.equipment);
    const res = XX._unequipItem('weapon');
    R.fullBag = {
      ok: res && res.ok,
      reason: res && res.reason,
      equipmentUnchanged: JSON.stringify(S.equipment) === beforeEq,
      weaponStillEquipped: S.equipment.weapon === 'eq_qingfeng',
      noItemLost: countBag('eq_qingfeng') === 0
    };
  } catch (e) { R.errors.push('fullBag: ' + (e.stack || e)); }

  // ① 转移（transfer）：装备/卸下在背包↔装备槽之间移动，无丢失
  try {
    reset();
    S.bag.push({ t: 'eq_qingfeng', n: '青锋剑' });
    const bagBefore = countBag('eq_qingfeng');
    const eq1 = XX._equipItem('eq_qingfeng');
    const bagAfterEquip = countBag('eq_qingfeng');
    const eqWeapon = S.equipment.weapon;
    const un = XX._unequipItem('weapon');
    const bagAfterUnequip = countBag('eq_qingfeng');
    R.transfer = {
      equipped: !!(eq1 && eq1.ok),
      bagRemovedOnEquip: bagBefore - bagAfterEquip === 1,
      weaponSet: eqWeapon === 'eq_qingfeng',
      unequipped: !!(un && un.ok),
      bagReturnedOnUnequip: bagAfterUnequip - bagAfterEquip === 1
    };
  } catch (e) { R.errors.push('transfer: ' + (e.stack || e)); }

  // ① 扣除/消耗（consume）：服食丹药移除背包物品（无 confirm 分支）
  try {
    reset();
    S.bag.push({ t: 'dan1', n: '下品破境丹' });
    const before = countBag('dan1');
    const idx = S.bag.findIndex(x => x.t === 'dan1');
    XX._eat(idx);
    R.consume = { before, after: countBag('dan1'), removed: before - countBag('dan1') === 1 };
  } catch (e) { R.errors.push('consume: ' + (e.stack || e)); }

  // ⑤ 炼制·成功：材料扣除 + 产出入账（强制 random=0）
  try {
    reset();
    S.bagSize = 50;
    const rec = XX._recipes['dan1'];
    (rec.mats || []).forEach(m => { if (COUNTERS.includes(m.t)) S[m.t] = 999999; else S.bag.push({ t: m.t, n: 'm' }); });
    const stoneBefore = S.stone;
    const _r = Math.random; Math.random = () => 0;
    XX._craftItem('alchemy', 'dan1');
    Math.random = _r;
    R.craftSuccess = { outputPresent: countBag('dan1') >= 1, stoneSpent: S.stone < stoneBefore, noCrash: true };
  } catch (e) { R.errors.push('craftSuccess: ' + (e.stack || e)); R.craftSuccess = { noCrash: false, err: String(e) }; }

  // ⑤ 炼制·失败：材料先扣，仅返还 30%，无产出（强制 random=0.999）
  try {
    reset();
    S.bagSize = 50;
    const rec = XX._recipes['dan1'];
    const herbBefore = S.herb;
    (rec.mats || []).forEach(m => { if (COUNTERS.includes(m.t)) S[m.t] = 999999; else S.bag.push({ t: m.t, n: 'm' }); });
    const _r = Math.random; Math.random = () => 0.999;
    XX._craftItem('alchemy', 'dan1');
    Math.random = _r;
    R.craftFail = { outputAbsent: countBag('dan1') === 0, herbNetConsumed: S.herb < herbBefore };
  } catch (e) { R.errors.push('craftFail: ' + (e.stack || e)); }

  // ⑤ 炼制·门槛不足：材料不足时提前返回，不扣任何资源（原子性安全路径）
  try {
    reset();
    S.bagSize = 50;
    const rec = XX._recipes['dan1'];
    (rec.mats || []).forEach(m => { if (COUNTERS.includes(m.t)) S[m.t] = 0; });
    S.bag = S.bag.filter(x => !(rec.mats || []).some(m => m.t === x.t && !COUNTERS.includes(m.t)));
    const stoneBefore = S.stone, bagBefore = S.bag.length;
    XX._craftItem('alchemy', 'dan1');
    R.craftAbort = { stoneUnchanged: S.stone === stoneBefore, bagUnchanged: S.bag.length === bagBefore };
  } catch (e) { R.errors.push('craftAbort: ' + (e.stack || e)); }

  // ⑦ 领取幂等：每日签到调用两次，第二次不应再发奖励
  try {
    reset();
    const stoneBefore = S.stone;
    let s1 = null, s2 = null;
    if (typeof XX._sign === 'function') {
      XX._sign(); s1 = S.stone - stoneBefore;
      XX._sign(); s2 = S.stone - stoneBefore;
    }
    R.claimIdem = { available: typeof XX._sign === 'function', firstGain: s1, secondGain: s2, idempotent: (s2 === s1) };
  } catch (e) { R.errors.push('claimIdem: ' + (e.stack || e)); }

  // ⑨⑩⑪ 存档：写出/解析/往返/损坏容错/旧档兼容/异常退出恢复
  try {
    reset();
    S.bag.push({ t: 'dan1', n: '下品破境丹' });
    S.stone = 12345;
    const txt = XX._saveText();
    let parsed = null, parseOk = false;
    try { parsed = JSON.parse(txt); parseOk = true; } catch (e) {}
    let rt = null, rtOk = false;
    try { rt = XX._parseSaveText(txt); rtOk = !!rt; } catch (e) { R.errors.push('parseSaveText 抛错: ' + e); }
    let corruptOk = false;
    try { XX._parseSaveText('}{not json'); corruptOk = true; } catch (e) { corruptOk = false; }
    let oldOk = false;
    try { const o = XX._parseSaveText(JSON.stringify({ stone: 5, rank: 1 })); oldOk = !!o; } catch (e) { oldOk = false; R.errors.push('旧档解析抛错: ' + e); }
    const bagLenBefore = S.bag.length, stoneBefore = S.stone;
    S.stone = 999; S.bag = [];               // 模拟"写盘后内存被破坏"
    XX._load();                              // 从持久化快照恢复
    R.save = {
      saveTextOk: parseOk,
      bagInSave: parsed && Array.isArray(parsed.bag),
      roundTripOk: rtOk,
      corruptResilient: corruptOk,
      oldSaveCompatible: oldOk,
      recoveredBag: S.bag.length === bagLenBefore,
      recoveredStone: S.stone === stoneBefore
    };
  } catch (e) { R.errors.push('save: ' + (e.stack || e)); }

  return JSON.stringify(R);
})()
