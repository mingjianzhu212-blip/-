'use strict';
/* 九霄问道 · 沈碑 NPC 数据层专项验证（第一阶段）
   只测数据层：S.npcs.stele 初值 / 旧档兼容 / 旧字段不丢 / 畸形数据修复 / 边界 /
   刷新保留 / resetAll 清空 / 转世 resetForNewLife 不清跨世数据。
   运行：node verify_npc.js   （依赖无头 Edge） */
const { execEdge } = require('./tools/edge-run');
const fs = require('node:fs');
const os = require('node:os');
/* 2026-10-26 用户要求：临时产物一律落 D 盘，不写 C 盘；D 不可用时退回系统 temp。 */
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
  await sleep(400);
  const KEY='xiuxian_save';
  const ST=()=>XX._npcStele();
  /* 最小合法档：含 SAVE_KEYS 闸门字段，其余按需 spread 覆盖 */
  const mkSave=extra=>({ rank:3, exp:100, stone:500, name:'试', last:Date.now(), cave:1, log:['x'], bag:[], stats:{sit:0}, questsDone:[], ...(extra||{}) });
  try{
    /* 1) 新档 NPC 初始状态全默认 */
    let st=ST();
    L('initDefault',
      st && st.met===0 && st.rel===0 && st.stage===0 && st.seenGens===0 && st.lastSeen===0 && st.nudgeAt===0 &&
      Array.isArray(st.heard) && st.heard.length===0 &&
      st.choice.listened===0 && st.choice.showoff===0 && st.choice.promise===0 &&
      st.cur.lastRank===0 && st.cur.talk===0 && st.cur.promptTale===0 ? 'ok' : 'bad');

    /* 2) 旧档无 npcs → 正常加载 + 落默认 */
    localStorage.setItem(KEY, JSON.stringify(mkSave({ rank:5, stone:999, cave:2 })));
    XX._load();
    st=ST();
    L('oldNoNpcsDefault', st.met===0 && st.rel===0 && st.stage===0 && st.heard.length===0 ? 'ok' : 'bad:'+JSON.stringify(st));

    /* 3) 旧档原有字段不丢失 */
    L('oldFieldsKept', XX._s.rank===5 && XX._s.stone===999 && XX._s.cave===2 ? 'ok' : 'bad:'+XX._s.rank+'/'+XX._s.stone+'/'+XX._s.cave);

    /* 4) 畸形 npcs：高值/脏类型 → 钳回 */
    localStorage.setItem(KEY, JSON.stringify(mkSave({
      npcs:{ stele:{ met:5, rel:9999, stage:'x', seenGens:999, lastSeen:'abc', nudgeAt:-5,
        heard:['stele1','stele1','','stele2','toolongstring_over_sixteen','stele3','stele4','stele5','stele6','stele7',42],
        choice:{listened:-5, showoff:1e9, promise:'y'},
        cur:{lastRank:999, talk:-3, promptTale:7} } }
    })));
    XX._load();
    st=ST();
    L('malRelHi', st.rel===100 ? 'ok' : 'bad:'+st.rel);
    L('malStageStr', st.stage===0 ? 'ok' : 'bad:'+st.stage);
    L('malMetHi', st.met===1 ? 'ok' : 'bad:'+st.met);
    L('malSeenGensClamp', st.seenGens===XX._s.legacy.gens ? 'ok' : 'bad:'+st.seenGens);
    L('malTimeBad', st.lastSeen===0 && st.nudgeAt===0 ? 'ok' : 'bad:'+st.lastSeen+'/'+st.nudgeAt);
    L('malHeardClean', st.heard.length===6 && (new Set(st.heard)).size===6 && !st.heard.includes('stele7') &&
      st.heard.every(t=>typeof t==='string' && t.length>0 && t.length<=16) ? 'ok' : 'bad:'+JSON.stringify(st.heard));
    L('malChoice', st.choice.listened===0 && st.choice.showoff===999 && st.choice.promise===0 ? 'ok' : 'bad:'+JSON.stringify(st.choice));
    L('malCur', st.cur.lastRank===25 && st.cur.talk===0 && st.cur.promptTale===1 ? 'ok' : 'bad:'+JSON.stringify(st.cur));

    /* 5) 边界：低值 / 超长 heard / 计数上下限 */
    localStorage.setItem(KEY, JSON.stringify(mkSave({
      npcs:{ stele:{ rel:-9999, stage:9, heard:['a','b','c','d','e','f','g','h'], choice:{}, cur:{lastRank:-1, talk:1e9, promptTale:0} } }
    })));
    XX._load();
    st=ST();
    L('malRelLo', st.rel===-100 ? 'ok' : 'bad:'+st.rel);
    L('malStageHi', st.stage===3 ? 'ok' : 'bad:'+st.stage);
    L('heardCap6', st.heard.length===6 ? 'ok' : 'bad:'+st.heard.length);
    L('malCurLo', st.cur.lastRank===0 && st.cur.talk===9999 ? 'ok' : 'bad:'+JSON.stringify(st.cur));

    /* 6) 刷新保留（save → load 回读） */
    XX._s.legacy={ gens:2, relic:null, hist:[], pick:null };
    XX._s.npcs={ stele:{ met:1, rel:42, stage:3, seenGens:1, lastSeen:1700000000000, nudgeAt:1700000001000,
      heard:['stele3'], choice:{listened:2, showoff:1, promise:1}, cur:{lastRank:5, talk:7, promptTale:1} } };
    XX._saveText();
    XX._load();
    st=ST();
    L('reloadKeep',
      st.met===1 && st.rel===42 && st.stage===3 && st.seenGens===1 && st.lastSeen===1700000000000 && st.nudgeAt===1700000001000 &&
      st.heard.length===1 && st.heard[0]==='stele3' &&
      st.choice.listened===2 && st.choice.showoff===1 && st.choice.promise===1 &&
      st.cur.lastRank===5 && st.cur.talk===7 && st.cur.promptTale===1 ? 'ok' : 'bad:'+JSON.stringify(st));

    /* 7) 转世：cur（本世数据）三字段清零，跨世字段全保留 */
    XX._s.npcs={ stele:{ met:1, rel:77, stage:3, seenGens:2, lastSeen:1700000000000, nudgeAt:1700000000500,
      heard:['stele3'], choice:{listened:3, showoff:1, promise:1}, cur:{lastRank:8, talk:9, promptTale:1} } };
    XX._resetForNewLife();
    st=ST();
    L('rebornCurClear', st.cur.lastRank===0 && st.cur.talk===0 && st.cur.promptTale===0 ? 'ok' : 'bad:'+JSON.stringify(st.cur));
    L('rebornCrossLifeKeep', st.met===1 && st.rel===77 && st.stage===3 && st.seenGens===2 && st.lastSeen===1700000000000 && st.nudgeAt===1700000000500 &&
      st.heard.length===1 && st.heard[0]==='stele3' &&
      st.choice.listened===3 && st.choice.showoff===1 && st.choice.promise===1 ? 'ok' : 'bad:'+JSON.stringify(st));
    /* 转世后再保存/读档：cur 仍 0，跨世字段仍保留 */
    XX._saveText();
    XX._load();
    st=ST();
    L('rebornReloadKeep', st.cur.lastRank===0 && st.cur.talk===0 && st.cur.promptTale===0 &&
      st.rel===77 && st.stage===3 && st.seenGens===2 && st.heard[0]==='stele3' && st.choice.listened===3 ? 'ok' : 'bad:'+JSON.stringify(st));

    /* 8) resetAll 清空 npcs（先接管原生 confirm，防 headless 挂死） */
    const _c=window.confirm; window.confirm=()=>true;
    let rz=true; try{ XX._resetAll(); }catch(e){ rz=false; L('resetAllExc', e.message); }
    window.confirm=_c;
    st=ST();
    L('resetAllClear', rz && st.met===0 && st.rel===0 && st.stage===0 && st.seenGens===0 && st.heard.length===0 &&
      st.choice.listened===0 && st.cur.lastRank===0 ? 'ok' : 'bad:'+JSON.stringify(st));

    /* ===== 切片 2f：npcClues 四条「碑外一线」线索（纯派生，只读） ===== */
    const CT = Npc.NPC_STELE.topics;
    const loreOf = id => (CT.filter(t => t.id === id)[0] || {}).lore;
    const nameOf = id => (CT.filter(t => t.id === id)[0] || {}).name;
    const openOf = list => list.map(c => c.open ? '1' : '0').join('');
    const steleWith = ids => ({ met:1, rel:0, stage:0, seenGens:0, lastSeen:0, nudgeAt:0,
      heard:ids.slice(), choice:{ listened:0, showoff:0, promise:0 }, cur:{ lastRank:0, talk:0, promptTale:0 } });

    /* 9) 形状：恒定 4 条、顺序固定、文案逐字取配置引用（不许硬编码） */
    let cs = Npc.npcClues(steleWith([]));
    L('cluesShape',
      Array.isArray(cs) && cs.length === 4 &&
      cs.map(c => c.id).join(',') === 'clue1,clue2,clue3,clue4' &&
      cs.map(c => c.topicId).join(',') === 'stele1,stele3,stele4,stele5' &&
      cs.every((c, i) => c.name === nameOf(c.topicId) && c.line === loreOf(c.topicId)) &&
      cs.every(c => typeof c.open === 'boolean') ? 'ok' : 'bad:' + JSON.stringify(cs));

    /* 10) 确定性 / 无副作用 / 不动点 / 不给入参加字段 */
    const sample = steleWith(['stele3']);
    const before = JSON.stringify(sample);
    const r1 = Npc.npcClues(sample), r2 = Npc.npcClues(sample);
    const fp = JSON.stringify(Npc.npcClues(Npc.npcState(sample)));
    L('cluesPure', JSON.stringify(r1) === JSON.stringify(r2) ? 'ok' : 'bad:' + JSON.stringify([r1, r2]));
    L('cluesNoSide', JSON.stringify(sample) === before &&
      Object.keys(sample).sort().join(',') === 'choice,cur,heard,lastSeen,met,nudgeAt,rel,seenGens,stage' ? 'ok' : 'bad:' + JSON.stringify(sample));
    L('cluesFixedPoint', fp === JSON.stringify(r1) ? 'ok' : 'bad:' + fp);
    const emptyIn = {};
    Npc.npcClues(emptyIn);
    L('cluesNoWrite', Object.keys(emptyIn).length === 0 && Npc.npcClues(undefined).length === 4 && Npc.npcClues(null).length === 4 ? 'ok' : 'bad:' + JSON.stringify(emptyIn));

    /* 11) 新档（resetAll 之后）四条全未解锁；已解锁的 line 也不外显（UI 只看 open） */
    L('clues0', openOf(Npc.npcClues(ST())) === '0000' ? 'ok' : 'bad:' + openOf(Npc.npcClues(ST())));

    /* 12) 阶梯：逐条点亮，且只点亮对应那一条 */
    const steps = [['stele1'], ['stele1','stele3'], ['stele1','stele3','stele4'], ['stele1','stele3','stele4','stele5']];
    const ladder = steps.map(ids => openOf(Npc.npcClues(steleWith(ids))));
    L('cluesLadder', ladder.join(',') === '1000,1100,1110,1111' ? 'ok' : 'bad:' + ladder.join(' '));

    /* 13) 反例（关键）：stage=2 且 rel=20，但没点过④⑤ —— 线索③④必须未解锁，
          而话题④本身此时是「可点开」的（unlocked:true），证明条件绝不能写 stage/rel */
    const anti = { met:1, rel:20, stage:2, seenGens:0, lastSeen:0, nudgeAt:0,
      heard:['stele1','stele3'], choice:{ listened:1, showoff:0, promise:0 }, cur:{ lastRank:0, talk:2, promptTale:0 } };
    const antiT4 = Npc.npcSay(anti, {}).topics.filter(t => t.id === 'stele4')[0];
    L('cluesNotStage', openOf(Npc.npcClues(anti)) === '1100' &&
      antiT4 && antiT4.unlocked === true && antiT4.heard === false ? 'ok' : 'bad:' + openOf(Npc.npcClues(anti)) + '/' + JSON.stringify(antiT4));

    /* 14) 脏档：不抛错、恒 4 条，且 open 判定与 npcSay 的 heard 判定完全一致（同源 readState） */
    const dirty = { met:5, rel:9999, stage:'x', seenGens:999, lastSeen:'abc', nudgeAt:-5,
      heard:['stele1','stele1','','stele2','toolongstring_over_sixteen','stele3','stele4','stele5','stele6','stele7',42],
      choice:{ listened:-5, showoff:1e9, promise:'y' }, cur:{ lastRank:999, talk:-3, promptTale:7 } };
    const dirtySay = Npc.npcSay(dirty, {}).topics;
    const dirtyClues = Npc.npcClues(dirty);
    L('cluesDirty', dirtyClues.length === 4 && dirtyClues.every(c => {
      const t = dirtySay.filter(x => x.id === c.topicId)[0];
      return t && c.open === t.heard;
    }) ? 'ok' : 'bad:' + openOf(dirtyClues));

    /* 15) 负面选项按现有规则计入 heard（制作人 2f 定稿：维持现状，不收紧） */
    const neg = steleWith([]);
    Npc.npcPick(neg, { now:1700000000000, gens:0 }, 'stele1', 'interrupt');
    L('cluesNegCount', neg.heard.indexOf('stele1') >= 0 && neg.rel === -2 &&
      openOf(Npc.npcClues(neg)) === '1000' ? 'ok' : 'bad:' + JSON.stringify({ heard: neg.heard, rel: neg.rel }));

    /* 16) 转世后线索不回锁（跨世字段驱动）；重开归零；键集合 = 已批清单（用真实默认对象做底，避免手工少键） */
    XX._s.npcs = { stele: Object.assign({}, XX._s.npcs.stele, {
      met:1, rel:30, stage:3, seenGens:2, lastSeen:1700000000000, nudgeAt:1700000000500,
      heard:['stele1','stele3','stele4','stele5'], choice:{ listened:2, showoff:0, promise:1 }, cur:{ lastRank:8, talk:9, promptTale:1 } }) };
    const beforeReborn = openOf(Npc.npcClues(ST()));
    XX._resetForNewLife();
    const afterReborn = openOf(Npc.npcClues(ST()));
    const curCleared = XX._s.npcs.stele.cur.talk === 0 && XX._s.npcs.stele.cur.lastRank === 0;
    const keysTop = Object.keys(XX._s.npcs.stele).sort().join(',');
    const keysChoice = Object.keys(XX._s.npcs.stele.choice).sort().join(',');
    const keysCur = Object.keys(XX._s.npcs.stele.cur).sort().join(',');
    const _c2=window.confirm; window.confirm=()=>true;
    XX._resetAll();
    window.confirm=_c2;
    const afterReset = openOf(Npc.npcClues(ST()));
    L('cluesReborn', beforeReborn === '1111' && afterReborn === '1111' && curCleared && afterReset === '0000' ? 'ok' : 'bad:' + beforeReborn + '/' + afterReborn + '/' + curCleared + '/' + afterReset);
    L('keySetUnchanged',
      keysTop === 'attitude,choice,coldUntil,cur,events,heard,keyLogged,lastDecayAt,lastSeen,lastTower,met,nudgeAt,quest,rel,seenGens,stage,state,told,trust' &&
      keysChoice === 'listened,promise,showoff' &&
      keysCur === 'lastRank,promptTale,talk' ? 'ok' : 'bad:' + keysTop + '#' + keysChoice + '#' + keysCur);

    /* ============ W3·S3：未解锁话题的口吻提示（lockHint） ============
       四条硬规矩：只在锁着的那几行出现；逐字取配置；不含数字与内部条件名；
       解锁判定（isUnlocked）与存档键集合一字未动。diag 用 '|' 连接，
       所以这里任何值都不许含 '|'。 */
    const sayOf = s => Npc.npcSay(s, { now: 1700000000000, gens: 0 });
    const byId = (say, id) => say.topics.filter(t => t.id === id)[0];
    const cfgHint = id => Npc.NPC_STELE.topics.filter(t => t.id === id)[0].lockHint;
    const bareStele = extra => Object.assign({ met:1, rel:0, stage:0, seenGens:0, lastSeen:1700000000000,
      nudgeAt:0, heard:[], choice:{ listened:0, showoff:0, promise:0 }, cur:{ lastRank:0, talk:1, promptTale:0 } }, extra || {});
    /* 全新见面（met=1，什么都没聊）：①②⑥可谈、③④⑤锁 */
    const s0 = sayOf(bareStele());
    L('s3Marks0', s0.topics.map(t => t.unlocked ? '1' : '0').join('') === '110001' ? 'ok'
      : 'bad:' + s0.topics.map(t => t.unlocked ? '1' : '0').join(''));
    L('s3HintOnlyLocked',
      s0.topics.every(t => t.unlocked ? t.lockHint === '' : typeof t.lockHint === 'string') &&
      ['stele3','stele4','stele5'].every(id => byId(s0, id).lockHint.length > 0) ? 'ok'
      : 'bad:' + s0.topics.map(t => t.id + '=' + t.lockHint).join('#'));
    L('s3HintVerbatim',
      ['stele3','stele4','stele5'].every(id => byId(s0, id).lockHint === cfgHint(id)) ? 'ok'
      : 'bad:' + ['stele3','stele4','stele5'].map(id => byId(s0, id).lockHint).join('#'));
    /* 反剧透：提示里不许出现数字、比较符，也不许出现 stage / rel / promptTale / min 这些内部条件名 */
    const leaky = t => /[0-9０-９≥≤<>]|stage|rel|promptTale|min|门槛|条件/.test(t.lockHint);
    L('s3HintNoLeak', s0.topics.filter(t => !t.unlocked).every(t => !leaky(t)) ? 'ok'
      : 'bad:' + s0.topics.filter(leaky).map(t => t.id + '=' + t.lockHint).join('#'));
    /* ③ 解锁后（stage≥1）：它那行的提示必须跟着消失，④⑤ 仍各留一句 */
    const s1 = sayOf(bareStele({ stage:1, heard:['stele1'] }));
    L('s3HintGoneOnUnlock',
      byId(s1,'stele3').unlocked === true && byId(s1,'stele3').lockHint === '' &&
      byId(s1,'stele4').lockHint.length > 0 && byId(s1,'stele5').lockHint.length > 0 ? 'ok'
      : 'bad:' + byId(s1,'stele3').lockHint + '/' + byId(s1,'stele4').lockHint + '/' + byId(s1,'stele5').lockHint);
    /* 全解锁（stage=3 且 rel≥15）：六行一律不带提示 */
    const s3 = sayOf(bareStele({ stage:3, rel:30, heard:['stele1','stele3','stele4','stele5'] }));
    L('s3HintAllOpen', s3.topics.every(t => t.unlocked && t.lockHint === '') ? 'ok'
      : 'bad:' + s3.topics.map(t => t.id + '=' + (t.unlocked ? 'open' : 'lock') + ':' + t.lockHint).join('#'));
    /* 初见（met=0）走的是另一支：topics 为空数组，不该冒出任何提示 */
    L('s3HintFirstMeet', sayOf(bareStele({ met:0 })).topics.length === 0 ? 'ok' : 'bad');
    /* 确定性 + 无副作用：同一入参两次结果全等，且提示不落进 stele 对象 */
    const stPure = bareStele();
    const beforePure = JSON.stringify(stPure);
    const h1 = JSON.stringify(sayOf(stPure).topics.map(t => t.lockHint));
    const h2 = JSON.stringify(sayOf(stPure).topics.map(t => t.lockHint));
    L('s3HintPure', h1 === h2 && JSON.stringify(stPure) === beforePure &&
      stPure.lockHint === undefined && Object.keys(stPure).length === 9 ? 'ok'
      : 'bad:' + h1 + '/' + h2 + '/' + (stPure.lockHint !== undefined));
    /* 提示只是视图字段：写进存档的仍然是那 9 个键（真存一次再读回来验） */
    XX._s.npcs = { stele: bareStele() };
    XX._saveText();
    const savedStele = (JSON.parse(localStorage.getItem(KEY)).npcs || {}).stele || {};
    L('s3HintNotSaved', Object.keys(savedStele).sort().join(',') ===
      'choice,cur,heard,lastSeen,met,nudgeAt,rel,seenGens,stage' ? 'ok' : 'bad:' + Object.keys(savedStele).sort().join(','));
    L('s3UnlockUnchanged',
      sayOf(bareStele({ stage:0 })).topics.map(t => t.unlocked ? '1':'0').join('') === '110001' &&
      sayOf(bareStele({ stage:2, rel:14 })).topics.map(t => t.unlocked ? '1':'0').join('') === '111101' &&
      sayOf(bareStele({ stage:2, rel:15 })).topics.map(t => t.unlocked ? '1':'0').join('') === '111111' ? 'ok'
      : 'bad:' + sayOf(bareStele({ stage:2, rel:14 })).topics.map(t => t.unlocked ? '1':'0').join('') +
        '/' + sayOf(bareStele({ stage:2, rel:15 })).topics.map(t => t.unlocked ? '1':'0').join(''));

    /* ============ 崔九（守塔老卒，第 113 轮）：数据层专项 ============
       初值 / 旧档兼容 / 钳制 / npcPick 真实结算 / save→load 保真 / 转世 / resetAll。
       结算一律走 js/npc_tower.js 的真实导出（浏览器端 window.NpcTower），这里不复制任何规则。 */
    const CQ=()=>XX._npc().cuijiu;
    /* c1) 新档默认（resetAll 后即新档；先接管 confirm 防 headless 挂死） */
    const _cqc=window.confirm; window.confirm=()=>true;
    try{ XX._resetAll(); }catch(e){ L('cqExc', e.message); }
    window.confirm=_cqc;
    let cq=CQ();
    L('cqInitDefault', cq && cq.met===0 && cq.rel===0 && cq.lastSeen===0 &&
      Array.isArray(cq.heard) && cq.heard.length===0 &&
      cq.stage===0 && cq.coldUntil===0 &&
      cq.attitude.open===0 && cq.attitude.guarded===0 && cq.attitude.rude===0 &&
      Array.isArray(cq.events) && cq.events.length===0 &&
      cq.state.kind==='in' && cq.state.until===0 &&
      cq.lastDecayAt===0 && cq.seenGens===0 && cq.quest===null &&
      cq.choice.climb===0 && cq.choice.chat===0 && cq.choice.listen===0 && cq.cur.talk===0 ? 'ok' : 'bad:'+JSON.stringify(cq));
    /* c2) 旧档无 cuijiu 键 → 落默认；stele 带值原样保留（互不干扰） */
    localStorage.setItem(KEY, JSON.stringify(mkSave({ npcs:{ stele:{ met:1, rel:77, stage:2, seenGens:1, lastSeen:123, nudgeAt:0,
      heard:['stele1'], choice:{listened:3, showoff:0, promise:0}, cur:{lastRank:0, talk:2, promptTale:0} } } })));
    XX._load();
    cq=CQ();
    L('cqOldNoCuijiu', cq && cq.met===0 && cq.rel===0 && cq.heard.length===0 && cq.cur.talk===0 ? 'ok' : 'bad:'+JSON.stringify(cq));
    L('cqSteleUntouched', XX._npc().stele.rel===77 && XX._npc().stele.heard[0]==='stele1' ? 'ok' : 'bad');
    /* c3) 畸形值钳制（与 stele 同口径：met 0/1、rel ±100、heard 去重短串 ≤6、choice 封顶 999、cur.talk 0..9999） */
    localStorage.setItem(KEY, JSON.stringify(mkSave({ npcs:{ stele:{}, cuijiu:{ met:9, rel:9999, lastSeen:'x',
      heard:['ct1','ct1','','ct2','toolongstring_over_sixteen','ct3','ct4','ct5','ct6','ct7',42],
      choice:{climb:-5, chat:1e9, listen:'y'}, cur:{talk:-3} } } })));
    XX._load();
    cq=CQ();
    L('cqClamp', cq.met===1 && cq.rel===100 && cq.lastSeen===0 &&
      JSON.stringify(cq.heard)===JSON.stringify(['ct1','ct2','ct3','ct4','ct5','ct6']) &&
      cq.choice.climb===0 && cq.choice.chat===999 && cq.choice.listen===0 && cq.cur.talk===0 ? 'ok' : 'bad:'+JSON.stringify(cq));
    /* c3b) 第二样本 7 字段畸形钳制 */
    localStorage.setItem(KEY, JSON.stringify(mkSave({ npcs:{ stele:{}, cuijiu:{ met:1, rel:0, stage:9,
      coldUntil:-1, attitude:{open:-5,guarded:1e9,rude:'x'},
      events:['a','a','toolongstring_over_sixteen',1], state:{kind:'x',until:-1},
      lastDecayAt:-5, seenGens:999, quest:{id:'X',state:'x',at:-1}, heard:[], choice:{}, cur:{talk:0} } } })));
    XX._load();
    cq=CQ();
    L('cqClampNew', cq.stage===3 && cq.coldUntil===0 &&
      cq.attitude.open===0 && cq.attitude.guarded===99 && cq.attitude.rude===0 &&
      JSON.stringify(cq.events)===JSON.stringify(['a']) &&
      cq.state.kind==='in' && cq.state.until===0 && cq.lastDecayAt===0 &&
      cq.seenGens===XX._s.legacy.gens && cq.quest===null ? 'ok' : 'bad:'+JSON.stringify(cq));
    /* c3c) 合法 quest 保真（只认 CQ_T1 + 三态 + 时间戳） */
    localStorage.setItem(KEY, JSON.stringify(mkSave({ npcs:{ stele:{}, cuijiu:{ met:1, rel:0,
      quest:{id:'CQ_T1',state:'open',at:123}, heard:[], choice:{}, cur:{talk:0} } } })));
    XX._load();
    cq=CQ();
    L('cqQuestKeep', cq.quest && cq.quest.id==='CQ_T1' && cq.quest.state==='open' && cq.quest.at===123
      ? 'ok' : 'bad:'+JSON.stringify(cq.quest));
    /* c4) npcPick 真实结算：rel+2、met 置 1、heard 推进、计数、lastSeen */
    localStorage.setItem(KEY, JSON.stringify(mkSave({ npcs:{ stele:{}, cuijiu:{ met:0, rel:10, lastSeen:0, heard:[],
      choice:{climb:0, chat:0, listen:0}, cur:{talk:0} } } })));
    XX._load();
    cq=CQ();
    const cpr = window.NpcTower ? NpcTower.npcPick(cq, 'ct1', { now: 555000 }) : null;
    L('cqPick', cpr && cpr.ok===true && cpr.relDelta===2 && cpr.rel===12 && cq.met===1 &&
      cq.heard[cq.heard.length-1]==='ct1' && cq.choice.climb===1 && cq.cur.talk===1 && cq.lastSeen===555000
      ? 'ok' : 'bad:'+JSON.stringify(cpr));
    /* c5) save→load 保真 */
    XX._saveText(); XX._load();
    cq=CQ();
    L('cqReloadKeep', cq.rel===12 && cq.met===1 && cq.heard[cq.heard.length-1]==='ct1' &&
      cq.choice.climb===1 && cq.cur.talk===1 ? 'ok' : 'bad:'+JSON.stringify(cq));
    /* c6) 转世：本世对话计数清零，跨世字段（met/rel/heard）保留 */
    XX._resetForNewLife();
    cq=CQ();
    L('cqReborn', cq.cur.talk===0 && cq.rel===12 && cq.met===1 && cq.heard.length===1 ? 'ok' : 'bad:'+JSON.stringify(cq));
    /* c7) resetAll 全清空（重开 = 换一个全新的人，不认得你） */
    const _cqc2=window.confirm; window.confirm=()=>true;
    let crz=true; try{ XX._resetAll(); }catch(e){ crz=false; L('cqExc2', e.message); }
    window.confirm=_cqc2;
    cq=CQ();
    L('cqResetAll', crz && cq.met===0 && cq.rel===0 && cq.heard.length===0 && cq.cur.talk===0 &&
      cq.stage===0 && cq.coldUntil===0 && cq.events.length===0 && cq.state.kind==='in' &&
      cq.lastDecayAt===0 && cq.seenGens===0 && cq.quest===null ? 'ok' : 'bad:'+JSON.stringify(cq));
    /* c7b) P7：话题链 1→2→3（stele1→stele3→stele5）；同话题连点 10 次 stage 停在首次值 */
    const p7base = () => ({ met:1, rel:20, stage:0, seenGens:0, lastSeen:0, nudgeAt:0, heard:[], told:[], keyLogged:[],
      lastTower:0, trust:0, coldUntil:0, quest:null, attitude:{open:0,guarded:0,rude:0,cost:0},
      events:[], state:{kind:'in',until:0}, lastDecayAt:0,
      choice:{listened:0,showoff:0,promise:0}, cur:{lastRank:0,talk:0,promptTale:0} });
    const p7a=p7base(); Npc.npcPick(p7a,{now:1},'stele1','listen');
    const p7as=p7a.stage;
    Npc.npcPick(p7a,{now:2},'stele3','believe');
    const p7bs=p7a.stage;
    Npc.npcPick(p7a,{now:3},'stele5','promise');
    const p7cs=p7a.stage;
    const p7d=p7base(); p7d.rel=0;
    for(let i=0;i<10;i++) Npc.npcPick(p7d,{now:100+i},'stele1','listen');
    L('cqP7chain', p7as===1 && p7bs===2 && p7cs===3 && p7d.stage===1 && p7d.cur.talk===10
      ? 'ok' : 'bad:'+[p7as,p7bs,p7cs,p7d.stage,p7d.cur.talk].join('/'));
    /* c7c) 托付线：同日/次日/第 3 天/第 4 天；E2 open 才开 */
    const qs = age => { const s={quest:{id:'CQ_T1',state:'open',at:1000}};
      const r=NpcTower.questTick(s,{now:1000+age*86400000});
      return (r?Object.keys(r)[0]:'null')+'/'+s.quest.state; };
    L('cqQuestTick', qs(0.5)==='open/open' && qs(1)==='done/done' && qs(3)==='done/done' && qs(4)==='failed/failed'
      ? 'ok' : 'bad:'+[qs(0.5),qs(1),qs(3),qs(4)].join(','));
    const qe={met:1,rel:20,stage:1,events:['cq_e1'],quest:null,attitude:{open:0,guarded:0,rude:0},
      state:{kind:'in',until:0},cur:{talk:0}};
    NpcRel.applyEvent(qe,NpcTower.EVENTS3,'cq_e2','cq_e2_o1',{now:1000});
    L('cqQuestOpen', qe.quest && qe.quest.id==='CQ_T1' && qe.quest.state==='open'
      ? 'ok' : 'bad:'+JSON.stringify(qe.quest));
    /* ============ 崔九主动事件（NpcVisitQueue，第 114 轮）：数据层专项 ============
       装配点：cuijiuEnter 里跨日 ≥3 天 push back_days（在 npcArrive 刷 lastSeen 之前）；
       enter 时机 take 全部消费；转世/重开 clear。模块自身行为由工作台 12 条测试守，这里守装配。 */
    const VQ = window.NpcVisitQueue;
    /* c8) 跨日重逢：lastSeen = 4 天前 → enter → 队列出现 back_days，文案正确 */
    localStorage.setItem(KEY, JSON.stringify(mkSave({ npcs:{ stele:{}, cuijiu:{ met:1, rel:10, lastSeen: Date.now() - 4*86400000, heard:[],
      choice:{climb:0, chat:0, listen:0}, cur:{talk:0} } } })));
    XX._load();
    let vqSnap = [];
    /* 消费确认（审查 T-114 A1）：塔页模板未注入（DIAG 无壳 DOM）→ enter 不得消费，事件留在队列；
       注入最小壳后再 enter → 正常消费。 */
    try{ XX._cuijiu.enter(); }catch(e){ L('cqVisitExc', e.message); }
    const vqKept = VQ ? VQ.pending('cuijiu') : [];
    L('cqVisitKeptNoDom', vqKept.length===1 && vqKept[0].id==='back_days' && XX._cuijiu.visits().length===0
      ? 'ok' : 'bad:无 DOM 时应保留队列:'+JSON.stringify(vqKept));
    /* 注入最小壳（塔页模板四件套）模拟模板已注入 */
    const shellIds = ['xx-cuijiu-root','xx-cuijiu-greet','xx-cuijiu-topics','xx-cuijiu-reply','xx-cuijiu-visit'];
    shellIds.forEach(id => { if(!document.getElementById(id)){ const d=document.createElement('div'); d.id=id; document.body.appendChild(d); } });
    try{ XX._cuijiu.enter(); vqSnap = XX._cuijiu.visits(); }catch(e){ L('cqVisitExc2', e.message); }
    L('cqVisitBackDays', vqSnap.length===1 && vqSnap[0]==='好些日子没见你上塔了。塔还是那座塔。' ? 'ok' : 'bad:'+JSON.stringify(vqSnap));
    shellIds.forEach(id => { const d=document.getElementById(id); if(d && d.dataset.cuijiuShell) d.remove(); });
    /* c9) enter 已消费：take 在 enter 时机做掉，此刻队列应空；再 enter（今日）不重复触发 */
    L('cqVisitTakenOnEnter', VQ && VQ.pending('cuijiu').length===0 ? 'ok' : 'bad:enter 后队列应空');
    /* c10) 未跨日（刚来过）：lastSeen = 现在 → enter → 不触发 */
    localStorage.setItem(KEY, JSON.stringify(mkSave({ npcs:{ stele:{}, cuijiu:{ met:1, rel:10, lastSeen: Date.now(), heard:[],
      choice:{climb:0, chat:0, listen:0}, cur:{talk:0} } } })));
    XX._load();
    try{ XX._cuijiu.enter(); }catch(e){ L('cqVisitExc2', e.message); }
    L('cqVisitNoFresh', VQ && VQ.pending('cuijiu').length===0 ? 'ok' : 'bad:昨日来过不该触发');
    /* c11) 初见（lastSeen=0）：不触发"好些日子没见" */
    localStorage.setItem(KEY, JSON.stringify(mkSave({ npcs:{ stele:{}, cuijiu:{ met:0, rel:0, lastSeen: 0, heard:[],
      choice:{climb:0, chat:0, listen:0}, cur:{talk:0} } } })));
    XX._load();
    try{ XX._cuijiu.enter(); }catch(e){ L('cqVisitExc3', e.message); }
    L('cqVisitNoFirstMeet', VQ && VQ.pending('cuijiu').length===0 ? 'ok' : 'bad:初见不该触发');
    /* c12) 转世清队列：主动事件属于上一世 */
    if(VQ) VQ.push('cuijiu', 'congrats_max', '测试：破纪录贺喜');
    XX._resetForNewLife();
    L('cqVisitClearReborn', VQ && VQ.pending().length===0 ? 'ok' : 'bad:转世后队列应空');
    /* c13) 重开清队列 */
    if(VQ) VQ.push('cuijiu', 'back_days', '测试：跨日重逢');
    const _cqc3=window.confirm; window.confirm=()=>true;
    try{ XX._resetAll(); }catch(e){ L('cqVisitExc4', e.message); }
    window.confirm=_cqc3;
    L('cqVisitClearResetAll', VQ && VQ.pending().length===0 ? 'ok' : 'bad:重开后队列应空');
    /* c14) 独立键落盘：NpcVisitQueue 写 jxwd_npc_visit_v1，key_probe 不出现在主存档（主档可能已被重开清空，容两端） */
    if(VQ) VQ.push('cuijiu', 'key_probe', '测试：独立键');
    const visitRaw = localStorage.getItem('jxwd_npc_visit_v1');
    const mainRaw = localStorage.getItem(KEY);
    L('cqVisitOwnKey', visitRaw && visitRaw.indexOf('key_probe')>=0 && (!mainRaw || mainRaw.indexOf('key_probe')<0) ? 'ok' : 'bad:v='+(visitRaw||'null').slice(0,60));
  }catch(e){ L('EXC', e.message); }
  const d=document.createElement('pre'); d.id='diag'; d.textContent=out.join(' | '); document.body.appendChild(d);
})();
</script>
</body>`;

(async () => {
  if (!EDGE) { console.log('无 Edge，跳过'); process.exit(0); }
  fs.mkdirSync(TMP, { recursive: true });
  const html = fs.readFileSync(SRC, 'utf8');
  const diagFile = path.join(TMP, '._diag_npc.html');
  fs.writeFileSync(diagFile, html.replace('</body>', DIAG), 'utf8');
  const ud = path.join(SCRATCH, 'xxnpc' + process.pid);

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

  console.log('\n=== 九霄问道 · 沈碑 NPC 数据层专项 ===');
  const dom = dump();
  try { fs.rmSync(diagFile, { force: true }); } catch(e) {}
  const m = dom.match(/<pre id="diag">([\s\S]*?)<\/pre>/);
  ok(!!m, '注入脚本跑完');
  const raw = m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
  const F = {};
  raw.split('|').forEach(seg => { const i = seg.indexOf('='); if (i > 0) F[seg.slice(0, i).trim()] = seg.slice(i + 1).trim(); });

  ok(F.EXC === undefined, '无异常', F.EXC);
  const CASES = [
    ['initDefault', '新档 NPC 初始状态全默认'],
    ['oldNoNpcsDefault', '旧档无 npcs 时正常加载并落默认'],
    ['oldFieldsKept', '旧档原有字段不丢失（rank/stone/cave）'],
    ['malRelHi', 'rel 高值钳到 100'],
    ['malStageStr', 'stage 非数字钳到 0'],
    ['malMetHi', 'met 钳到 1'],
    ['malSeenGensClamp', 'seenGens 钳到当前已转世数'],
    ['malTimeBad', 'lastSeen/nudgeAt 脏值归 0'],
    ['malHeardClean', 'heard 去重、只收短字符串、≤6'],
    ['malChoice', 'choice 计数非负且封顶 999'],
    ['malCur', 'cur 计数钳制（lastRank 0~25 / talk / promptTale 0~1）'],
    ['malRelLo', 'rel 低值钳到 -100'],
    ['malStageHi', 'stage 高值钳到 3'],
    ['heardCap6', 'heard 超过 6 项截断'],
    ['malCurLo', 'cur 负数归 0、talk 封顶'],
    ['reloadKeep', '刷新（save→load）后 NPC 数据保留'],
    ['rebornCurClear', '转世后 cur（本世数据）三字段归零'],
    ['rebornCrossLifeKeep', '转世后跨世字段（met/rel/stage/seenGens/lastSeen/nudgeAt/heard/choice）全保留'],
    ['rebornReloadKeep', '转世后保存/读档，cur 仍 0、跨世字段仍保留'],
    ['resetAllClear', 'resetAll 清空 NPC 数据'],
    ['cluesShape', '2f：线索恒定 4 条、顺序 clue1-4 / stele1·3·4·5、文案逐字取配置 lore 引用'],
    ['cluesPure', '2f：同一入参两次调用结果全等（确定性）'],
    ['cluesNoSide', '2f：调用后入参逐字节不变、不被加字段（无副作用）'],
    ['cluesFixedPoint', '2f：对已规范化视图再取线索结果不变（不动点）'],
    ['cluesNoWrite', '2f：空对象 / undefined / null 入参不抛错、不写回、恒 4 条'],
    ['clues0', '2f：新档（resetAll 后）四条全未解锁'],
    ['cluesLadder', '2f：逐条点亮 1000 / 1100 / 1110 / 1111，只点亮对应那一条'],
    ['cluesNotStage', '2f：stage=2 且话题④可点开但未听 → 线索③④仍锁（条件绝不取 stage/rel）'],
    ['cluesDirty', '2f：脏档不抛错，open 判定与 npcSay 的 heard 判定逐条一致'],
    ['cluesNegCount', '2f：负面选项（打断）仍按现有规则计入 heard 并点亮线索'],
    ['cluesReborn', '2f：转世后四条不回锁、本世 cur 归零；重开后全锁'],
    ['keySetUnchanged', '2f：存档键集合与已批清单一致（2f 九键 + 第一步三字段 + 第二步七字段）'],
    ['s3Marks0', 'W3·S3：刚见过一面（met=1 全默认）——①②⑥可谈、③④⑤锁'],
    ['s3HintOnlyLocked', 'W3·S3：提示只在锁着的行出现，解锁的行恒为空串'],
    ['s3HintVerbatim', 'W3·S3：三句提示逐字取自配置（不在 UI 里另写一套）'],
    ['s3HintNoLeak', 'W3·S3：提示不含数字 / 比较符 / stage·rel·promptTale·min·门槛·条件（反剧透）'],
    ['s3HintGoneOnUnlock', 'W3·S3：③ 解锁后它自己那行提示消失，④⑤ 仍各留一句'],
    ['s3HintAllOpen', 'W3·S3：全解锁（stage=3 且 rel≥15）时六行都不带提示'],
    ['s3HintFirstMeet', 'W3·S3：初见（met=0）topics 仍为空数组，不冒出提示'],
    ['cqInitDefault', '崔九：新档默认（14 键：旧 6 键 + 框架 8 字段，quest=null）'],
    ['cqOldNoCuijiu', '崔九：旧档无 cuijiu 键 → 落默认，零破坏'],
    ['cqSteleUntouched', '崔九：迁移不动 stele（rel/heard 原样）'],
    ['cqClamp', '崔九：畸形值钳制（met/rel/heard/choice/cur 与 stele 同口径）'],
    ['cqClampNew', '崔九：stage/coldUntil/attitude/events/state/lastDecayAt/seenGens/quest 八字段钳制'],
    ['cqQuestKeep', '崔九：合法 quest（CQ_T1/open/at）读档保真'],
    ['cqPick', '崔九：npcPick 真实结算（rel+2 / met / heard / 计数 / lastSeen）'],
    ['cqReloadKeep', '崔九：save→load 后结算结果保真'],
    ['cqReborn', '崔九：转世 cur 清零、跨世字段保留'],
    ['cqResetAll', '崔九：resetAll 全清空（重开=不认得你；8 新字段含 quest 一并归零）'],
    ['cqP7chain', '崔九/P7：话题链 stage 1→2→3；talk10 停在 1'],
    ['cqQuestTick', '崔九托付：0.5 天 open、1 天 done、第 3 天 done、第 4 天 failed'],
    ['cqQuestOpen', '崔九托付：E2 open 开出 CQ_T1/open'],
    ['cqVisitBackDays', '崔九主动事件：注入壳后 enter → 消费进 visits 快照'],
    ['cqVisitKeptNoDom', '崔九主动事件：塔页壳不在时 enter 不消费（事件保留在队列，审查 T-114 A1）'],
    ['cqVisitTakenOnEnter', '崔九主动事件：enter 时机已 take 消费，队列不留存'],
    ['cqVisitNoFresh', '崔九主动事件：刚来过（未跨 3 天）不触发'],
    ['cqVisitNoFirstMeet', '崔九主动事件：初见（lastSeen=0）不触发'],
    ['cqVisitClearReborn', '崔九主动事件：转世清队列（事件属于上一世）'],
    ['cqVisitClearResetAll', '崔九主动事件：重开清队列'],
    ['cqVisitOwnKey', '崔九主动事件：独立键 jxwd_npc_visit_v1 落盘，不碰主存档'],
    ['s3HintPure', 'W3·S3：同入参两次结果全等、入参不被加字段（仍是那 9 个键）'],
    ['s3HintNotSaved', 'W3·S3：提示是视图字段，写进存档的 stele 键集合一字未增'],
    ['s3UnlockUnchanged', 'W3·S3：解锁判定没被动过（stage 0/2 + rel 14/15 三档阶梯逐条对齐）']
  ];
  for (const [k, label] of CASES) ok(F[k] === 'ok', label + '（' + k + '=' + F[k] + '）');

  console.log('\n通过 ' + pass + ' / 失败 ' + fail);
  process.exit(fail ? 1 : 0);
})();
