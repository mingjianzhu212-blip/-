'use strict';
/* rv4 扩展旁挂回归：43 料 / 12 丹 / 10 兽魂 / 6 装备 / 单一 S.rv4 / 万兽谱 / 路由 UI。 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.RV4_LOG_DIR || 'D:/xx-scratch/log/rv3_expansion_20261124';
const SCRATCH = (() => { try { const p = 'D:/xx-scratch'; fs.mkdirSync(p, { recursive: true }); return p; } catch (e) { return os.tmpdir(); } })();
const PAGE = require('../tools/page');
const { execEdge } = require('../tools/edge-run');
PAGE.use(ROOT);
const gameSrc = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
const indexSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const roleSrc = fs.readFileSync(path.join(ROOT, 'js/views/role.js'), 'utf8');
const caveSrc = fs.readFileSync(path.join(ROOT, 'js/views/cave.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (v, label, got) => { if (v) { pass++; console.log('PASS ' + label); } else { fail++; console.log('FAIL ' + label + ' :: ' + JSON.stringify(got)); } };

ok(/const combatPower = \(\) => Math\.floor\(10 \* POW_K/.test(gameSrc), '战力公式本体保持锁定');
ok(gameSrc.includes('POW_K = 100') && gameSrc.includes('needG: 1.85'), 'POW_K 与 needG=1.85 保持锁定');
ok(indexSrc.includes('20261126rv5'), 'JS/CSS 版本号已同步');
ok(!roleSrc.includes('xx-role-break') && !roleSrc.includes('data-role-jump') && !roleSrc.includes('xx-role-stats'), '人物页无拆账/四维/传送门');
ok(caveSrc.includes('data-forge-codex') && caveSrc.includes('data-forge-bestiary') && caveSrc.includes('VIEWS.hunt'), '炼器坊双入口与独立猎妖页已注册');

const probe = String.raw`
<script>
(async function(){
  await new Promise(r=>setTimeout(r,400));
  const R={err:''};
  try{
    const s=XX._s, rv=XX._rv4, mats=rv.mats, souls=rv.souls, equips=rv.equips;
    R.counts={mats:mats.length,beasts:XX._beasts.length,souls:souls.length,equips:equips.length,oldDan:XX._dan.list.length,newDan:XX._dan.rv4.list.length,oldEquip:Object.keys(XX._items).filter(k=>XX._items[k].slot).length};
    R.tierCounts=[1,2,3,4,5].map(t=>mats.filter(m=>m.tier===t).length);
    R.matMap=mats.length===XX._beasts.length && mats.every(m=>!!rv.matByBeast[m.beast] && m.id==='matb_'+(m.beast==='goldenCrow'?'goldencrow':m.beast));
    R.matUnique=new Set(mats.map(m=>m.id)).size===43 && new Set(mats.map(m=>m.n)).size===43;
    R.sellK=mats.map(m=>m.sellK);
    R.rates=mats.map(m=>m.rate).join(',');
    R.ratesValid=mats.every(m=>{const b=XX._beasts.find(x=>x.id===m.beast);const want=m.tier<=4?(b.boss?0.09:0.06):(b.boss?0.06:0.04);return m.rate===want;});
    R.matRegistered=mats.every(m=>XX._items[m.id] && XX._items[m.id].n===m.n && XX._items[m.id].usage.indexOf('寄售')>=0);
    R.marketExcluded=XX._marketPoolIds().every(id=>!rv.matById[id]);
    R.soulNames=souls.map(x=>x.name).join(',');
    R.soulShape=souls.every(x=>['bg','lq','brk','cai'].includes(x.fam) && x.seg>=1 && x.seg<=9 && XX._recipeById(x.id)===XX._recipes[x.id]);
    R.equipNames=equips.map(x=>x.name).join(',');
    R.equipSlots=['weapon','armor','accessory'].map(k=>equips.filter(x=>x.slot===k).length);
    R.equipSell=equips.map(x=>[x.power,x.sell]);
    R.equipRegistered=equips.every(x=>XX._items[x.id].rv4Equip && XX._items[x.id].sell===x.sell && XX._recipeById(x.id)===XX._recipes[x.id]);
    R.danSame=XX._dan.rv4.list.every(d=>{const q=XX._dan.all[XX._dan.ids[d.fam][d.seg-1]];return ['tier','seg','rate','reqLv','reqM','buff','exp','mult','pct','brk'].every(k=>d[k]===q[k]);});
    R.danRows=XX._dan.rv4.list.every(d=>XX._dan.rowsOf(d.fam).filter(x=>x.rec.recipeId===d.id).length===1);

    s.life={age:0,on:false}; s.zuo=0; s.weapon=6; s.art={bg:8,brk:2,cai:2}; s.rv4=rv.empty();
    s.rv4.souls=['soul_wolf','soul_scorpion','soul_crow','soul_horse','soul_qilin'];
    R.joint={lq:rv.artSeg('lq'),bg:rv.artSeg('bg'),brk:rv.artSeg('brk'),cai:rv.artSeg('cai')};
    R.oldOwned={lq:rv.oldArtSeg('lq'),bg:rv.oldArtSeg('bg')};
    const rateOld=XX._rate(); s.rv4.souls.push('soul_bat'); const rateLow=XX._rate(); s.rv4.souls.push('soul_kunpeng'); const rateHigh=XX._rate();
    R.noStack=[rateOld===rateLow,rateHigh>rateLow];
    s.rv4.souls=['soul_bat','soul_kunpeng']; R.soulOnly={lq:rv.artSeg('lq'),old:rv.oldArtSeg('lq')};

    s.rv4=rv.empty(); s.weapon=0; s.art={bg:0,brk:0,cai:0}; s.dan=7; s.forge=7; s.mastery={alchemyLv:7,alchemyExp:0,forgeLv:7,forgeExp:0};
    s.stone=1e9; s.ore=1000; s.bag=[
      {t:'matb_rat',n:XX._items.matb_rat.n,q:1},
      {t:'matb_crow',n:XX._items.matb_crow.n,q:1},
      {t:'mat_bone',n:'兽骨',q:3}
    ].concat(Array.from({length:47},()=>({t:'mat_bone',n:'兽骨',q:1}))); s.log=[];
    const wolf=souls[0], realRandom=Math.random; Math.random=()=>0;
    const stone0=s.stone, cells0=s.bag.length;
    XX._craftItem('forge',wolf.id);
    R.soulCraft={owned:rv.hasSoul(wolf.id),consumedOnly:s.bag.length===cells0-5&&!s.bag.some(x=>x.t===wolf.id),cells:s.bag.length,spent:stone0-s.stone};
    s.bag.push({t:'matb_rat',n:XX._items.matb_rat.n,q:1},{t:'matb_crow',n:XX._items.matb_crow.n,q:1});
    const stone1=s.stone, bag1=s.bag.map(x=>x.t+':'+x.q).join('|');
    XX._craftItem('forge',wolf.id);
    R.soulRepeat={count:s.rv4.souls.filter(x=>x===wolf.id).length,stone:s.stone===stone1,bag:s.bag.map(x=>x.t+':'+x.q).join('|')===bag1};
    Math.random=realRandom;

    s.rv4=rv.empty(); s.equipment={weapon:null,armor:null,accessory:null}; s.bag=[]; s.affix=[]; s.dt={qing:0,zhu:0,su:0,xuan:0,huang:0}; s.dtMain='';
    s.danExp={mult:0,until:0}; s.danPow={pct:0,until:0}; s.danGain={pct:0,until:0}; s.pillBonus=0; s.pillUntil=0; s.pets=[]; s.weaponLv=0;
    R.equipDelta=equips.map(e=>{s.rank=e.id==='eq_jiaoji'?13:(e.id==='eq_mangwen'||e.id==='eq_zhusi'?18:24);s.weapon=0;s.art={bg:0,brk:0,cai:0};s.equipment={weapon:null,armor:null,accessory:null};s.bag=[{t:e.id,n:XX._items[e.id].n,q:1}];const before=XX._power();const put=XX._equipItem(e.id);return {id:e.id,ok:put.ok,delta:XX._power()-before,want:e.power};});
    s.bag=[{t:'eq_jiaoji',n:'蛟脊枪',q:1},{t:'matb_rat',n:'鼠须',q:1}]; const sell0=s.stone; XX._setConfirmHandler((cfg,cb)=>cb(true)); XX._sellAll(); XX._setConfirmHandler(null);
    R.sellAll={stone:s.stone-sell0,left:s.bag.map(x=>x.t).join(',')};
    R.relicExcluded=equips.every(e=>!XX._relicPicks().includes(e.id));

    s.rank=0; s.weapon=0; s.art={bg:0,brk:0,cai:0}; s.rv4=rv.empty(); s.stone=0; s.bag=[]; s.letters=[]; s.stats.stoneEarned=0;
    R.claimEarly=rv.claim('t1');
    mats.filter(m=>m.tier===1).forEach(m=>rv.found(m.id)); const reward0=XX._needOf(s.rank)*3; const stoneB=s.stone;
    ROUTER.open('bestiary'); const claimBtn=document.querySelector('[data-bestiary-claim="t1"]');
    const claim=rv.claim('t1'); const again=rv.claim('t1');
    R.claims={first:claim.reward===reward0,delta:s.stone-stoneB===reward0,again:again.reason==='claimed',once:s.rv4.claimed.filter(x=>x==='t1').length===1,ui:!!claimBtn};
    ROUTER.open('dong','xx-forge-sec'); const fEntries=document.querySelectorAll('[data-forge-codex],[data-forge-bestiary]').length;
    document.querySelector('[data-forge-bestiary]').click(); const bestBack=ROUTER.current(); ROUTER.back(); const forgeBack=ROUTER.current();
    document.querySelector('[data-forge-codex]').click(); const tabs=document.querySelectorAll('[data-codex-tab]').length;
    document.querySelector('[data-codex-tab="soul"]').click(); R.codex={tabs,soul:document.querySelectorAll('#xx-codex .codex-card').length,prog:document.getElementById('codex-progress').textContent};
    R.forge={entries:fEntries,bestBack,forgeBack};

    s.rv4=rv.empty(); s.rank=25; s.bag=[]; s.letters=[]; s.huntBeast=null; ROUTER.open('hunt'); XX._renderHunt();
    R.huntUI={rows:document.querySelectorAll('#xx-hunt .hunt-row').length,tagged:Array.from(document.querySelectorAll('#xx-hunt .hunt-row')).filter(x=>x.textContent.includes('专属「')).length,rates:Array.from(document.querySelectorAll('#xx-hunt .hunt-row')).every(x=>/专属「[^」]+」\d+%/.test(x.textContent))};
    const rat=XX._beasts.find(x=>x.id==='rat'); s.rank=rat.rank; s.bag=[{t:rat.drop,n:XX._items[rat.drop].n,q:1}].concat(Array.from({length:49},()=>({t:'mat_bone',n:'兽骨',q:1})));
    s.rv4=rv.empty(); s.huntBeast=null; s.huntProg=0; s.letters=[]; s.eggs=[]; s.stats.hunt=0; Math.random=()=>0;
    XX._startHunt('rat'); XX._huntTick(XX._killTime(rat)+0.01);
    const overflow=JSON.stringify(XX._letters()); R.overflow={active:s.huntBeast==='rat',found:s.rv4.found.includes('matb_rat'),mail:overflow.includes('matb_rat'),cells:s.bag.length};
    XX._stopHunt(); Math.random=realRandom;

    const full=JSON.stringify(s); const old=JSON.parse(full); old.last=Date.now(); old.rv4={v:99,souls:['soul_wolf','soul_wolf','bad_soul',3],found:['matb_rat','matb_rat','bad_mat',3],claimed:['t1','t1','t9',3]};
    localStorage.setItem('xiuxian_save',JSON.stringify(old)); const loaded=XX._load();
    R.migration={loaded,v:rv.state().v,souls:rv.state().souls.join(','),found:rv.state().found.join(','),claimed:rv.state().claimed.join(',')};
    const noRv=JSON.parse(full); delete noRv.rv4; noRv.bag=[{t:'matb_rat',n:'鼠须',q:1}]; noRv.last=Date.now(); localStorage.setItem('xiuxian_save',JSON.stringify(noRv)); XX._load();
    R.missing={keys:Object.keys(rv.state()).sort().join(','),found:rv.state().found.length};
    rv.state().souls=['soul_wolf']; rv.state().found=['matb_rat']; rv.state().claimed=['t1']; XX._resetForNewLife();
    R.reborn={souls:rv.state().souls.length,found:rv.state().found.join(','),claimed:rv.state().claimed.join(',')};
    rv.state().souls=['soul_wolf']; rv.state().found=['matb_rat']; rv.state().claimed=['t1']; XX._resetAll(true);
    R.reset={souls:rv.state().souls.length,found:rv.state().found.length,claimed:rv.state().claimed.length};
  }catch(e){R.err=String((e&&e.stack)||e);}
  document.title=JSON.stringify(R);
})();
</scr`+String.raw`ipt>`;
fs.mkdirSync(OUT, { recursive: true });
const file=path.join(SCRATCH,'._verify_rv4_'+process.pid+'.html');
PAGE.writePage(file,indexSrc.replace('</body>',probe+'</body>'));
let dom='', exit=0;
try{
  dom=execEdge(['--headless=new','--disable-gpu','--no-first-run','--virtual-time-budget=8000','--window-size=900,1200','--dump-dom','file:///'+file.replace(/\\/g,'/')],{encoding:'utf8',timeout:90000,maxBuffer:1<<26,stdio:['ignore','pipe','pipe']}).toString();
}catch(e){exit=1;console.error(String(e.stderr||e.message||e));}
let R={}; const m=dom.match(/<title>([^<]*)<\/title>/);
if(m){try{R=JSON.parse(m[1]);}catch(e){R.parseError=String(e);}}
try{fs.rmSync(file,{force:true});}catch(e){}
ok(exit===0,'Edge/CDP 探针进程',exit);
ok(!R.err&&!R.parseError,'页面探针无异常',R.err||R.parseError);
ok(R.counts&&R.counts.mats===43&&R.counts.beasts===43&&R.counts.souls===10&&R.counts.equips===6&&R.counts.oldDan===36&&R.counts.newDan===12,'43/43/10/6 与旧36丹+新12丹',R.counts);
ok(R.counts.oldEquip===12,'装备总数旧6+新6=12',R.counts.oldEquip);
ok(JSON.stringify(R.tierCounts)==='[12,7,5,10,9]','43料五段数量',R.tierCounts);
ok(R.matMap&&R.matUnique,'43兽与43料一一映射且id/名称唯一',{map:R.matMap,unique:R.matUnique});
ok(R.sellK&&JSON.stringify(R.sellK)===JSON.stringify([0.18,0.36,0.90,1.80,4.80].flatMap((k,i)=>Array(i===0?12:i===1?7:i===2?5:i===3?10:9).fill(k))),'43料寄售系数分段正确',R.sellK);
ok(R.ratesValid,'43料普通/Boss掉率按分段表正确',R.rates);
ok(R.matRegistered&&R.marketExcluded,'专属料可寄售且不进入坊市买入池',{registered:R.matRegistered,excluded:R.marketExcluded});
ok(R.soulShape&&R.soulNames==='狼毫哨,蟾骨笛,骏影鞭,麟趾印,蝎尾铃,蝠影冕,鹤翎冠,乌羽灯,蛟脊索,鲲鹏翼','10兽魂名称/族段/配方注册',{shape:R.soulShape,names:R.soulNames});
ok(R.equipSlots.join(',')==='2,2,2'&&R.equipNames==='蛟脊枪,蟒纹甲,蛛丝绦,应龙戟,墨麟铠,白泽佩','新装备三槽各2件且命名正确',{slots:R.equipSlots,names:R.equipNames});
ok(R.equipSell&&JSON.stringify(R.equipSell)===JSON.stringify([[9731,4866],[73895,36948],[73895,36948],[841706,420853],[841706,420853],[841706,420853]]),'6件装备固定半价寄售小表',R.equipSell);
ok(R.equipRegistered&&R.danSame&&R.danRows,'装备/专属丹注册与同段效果',{equip:R.equipRegistered,dan:R.danSame,rows:R.danRows});
ok(R.joint&&JSON.stringify(R.joint)==='{"lq":6,"bg":8,"brk":3,"cai":4}'&&JSON.stringify(R.oldOwned)==='{"lq":6,"bg":8}','旧法宝与兽魂同族共同取最高',{joint:R.joint,old:R.oldOwned});
ok(R.noStack&&R.noStack[0]&&R.noStack[1]&&R.soulOnly.lq===9&&R.soulOnly.old===6,'低阶兽魂不叠加，高阶替代且不改旧阶位',{noStack:R.noStack,soulOnly:R.soulOnly});
ok(R.soulCraft&&R.soulCraft.owned&&R.soulCraft.consumedOnly&&R.soulCraft.cells===45&&R.soulCraft.spent===40,'兽魂满包可炼、入魂不占包',R.soulCraft);
ok(R.soulRepeat&&R.soulRepeat.count===1&&R.soulRepeat.stone&&R.soulRepeat.bag,'重复兽魂炼制零扣料零重复持有',R.soulRepeat);
ok(R.equipDelta&&R.equipDelta.every(x=>x.ok&&x.delta===x.want),'新装备走加法通道且delta等于锚定战力',R.equipDelta);
ok(R.sellAll&&R.sellAll.left==='eq_jiaoji','一键寄售排除新装备',R.sellAll);
ok(R.relicExcluded,'新装备排除转世遗物候选',R.relicExcluded);
ok(R.claimEarly&&R.claimEarly.reason==='incomplete','万兽谱未集齐不可领',R.claimEarly);
ok(R.claims&&R.claims.first&&R.claims.delta&&R.claims.again&&R.claims.once,'万兽谱K=3奖励与只领一次',R.claims);
ok(R.forge&&R.forge.entries===2&&R.forge.bestBack==='bestiary'&&R.forge.forgeBack==='dong_forge','炼器坊双入口与返回栈',R.forge);
ok(R.codex&&R.codex.tabs===2&&R.codex.soul===10,'图鉴兽魂页签10件',R.codex);
ok(R.huntUI&&R.huntUI.rows===43&&R.huntUI.tagged===43&&R.huntUI.rates,'猎妖43行均显示专属料名称与掉率',R.huntUI);
ok(R.overflow&&R.overflow.active&&R.overflow.found&&R.overflow.mail&&R.overflow.cells===50,'专属料满包入信匣、入谱且不停猎、不扩容量',R.overflow);
ok(R.migration&&R.migration.loaded&&R.migration.v===1&&R.migration.souls==='soul_wolf'&&R.migration.found==='matb_rat'&&R.migration.claimed==='t1','S.rv4脏id清洗/去重/版本冻结',R.migration);
ok(R.missing&&R.missing.keys==='claimed,found,souls,v'&&R.missing.found===0,'旧档补空容器且不从背包反推found',R.missing);
ok(R.reborn&&R.reborn.souls===0&&R.reborn.found==='matb_rat'&&R.reborn.claimed==='t1','转世清兽魂保留万兽谱',R.reborn);
ok(R.reset&&R.reset.souls===0&&R.reset.found===0&&R.reset.claimed===0,'重开整组清零',R.reset);
console.log('RESULT pass='+pass+' fail='+fail);
console.log('DETAIL '+JSON.stringify(R));
process.exit(fail?1:0);
