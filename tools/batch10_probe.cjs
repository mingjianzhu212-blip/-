'use strict';
/* batch10 返回逻辑与防呆：真实 Edge DOM、来源路由、确认层、遮挡几何与同价锚。 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.BATCH10_LOG_DIR || 'D:/xx-scratch/log/rv4_batch10_20261125/final';
const SCRATCH = (() => { try { fs.mkdirSync('D:/xx-scratch', { recursive: true }); return 'D:/xx-scratch'; } catch (_) { return os.tmpdir(); } })();
const EDGE = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].find(p => fs.existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (v, label, got) => { if (v) { pass++; console.log('PASS ' + label); } else { fail++; console.log('FAIL ' + label + ' :: ' + JSON.stringify(got)); } };
if (!EDGE) { console.error('找不到 Edge'); process.exit(2); }
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const ud = path.join(SCRATCH, 'batch10_' + process.pid + '_' + Date.now());
fs.mkdirSync(ud, { recursive: true });
const portFile = path.join(ud, 'DevToolsActivePort');
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--user-data-dir=' + ud, '--remote-debugging-port=0', '--window-size=430,900', 'about:blank'], { stdio: 'ignore' });
const exited = new Promise(r => { edge.once('exit', r); edge.once('close', r); });
let ws = null;
class Page {
  constructor(socket) { this.s = socket; this.id = 0; this.pending = new Map(); this.loaded = false;
    socket.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m); this.pending.delete(m.id); } if (m.method === 'Page.loadEventFired') this.loaded = true; }; }
  send(method, params = {}) { return new Promise(resolve => { const id = ++this.id; this.pending.set(id, resolve); this.s.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text + ' ' + JSON.stringify(r.result.exceptionDetails.exception));
    return r.result.result.value; }
  async viewport(w, h) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(150); }
  async shot(file) { const r = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); }
}
function sourceFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name), st = fs.statSync(file);
    if (st.isDirectory()) { if (name !== 'node_modules' && name !== '.git') sourceFiles(file, out); } else if (/\.(?:js|mjs|html)$/.test(name)) out.push(file);
  }
  return out;
}
function countConfirm(files) {
  let count = 0; const hits = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => { const n = (line.match(/\bconfirm\s*\(/g) || []).length; if (n) { count += n; hits.push(path.relative(ROOT, file) + ':' + (i + 1)); } });
  }
  return { count, hits };
}
(async () => {
  try {
    const indexSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const runtimeRefs = Array.from(indexSrc.matchAll(/(?:src|href)="((?:js|server)\/[^"?]+\.(?:js|mjs))"/g), m => path.join(ROOT, m[1]));
    const serverFiles = sourceFiles(path.join(ROOT, 'server')).filter(f => !/BACKUP|evidence/i.test(f));
    const scan = countConfirm([path.join(ROOT, 'index.html'), ...new Set([...runtimeRefs, ...serverFiles])]);
    ok(scan.count === 0, '现行运行时源码 confirm( 计数为 0', scan);
    const allFiles = sourceFiles(ROOT).filter(f => !/node_modules/.test(f));
    const archiveScan = countConfirm(allFiles);
    console.log('CONFIRM_SCAN runtime=' + scan.count + ' all=' + archiveScan.count + ' archive_hits=' + JSON.stringify(archiveScan.hits));
    ok(!indexSrc.includes('20261125rv4m7') && !indexSrc.includes('20261125rv4m6') && (indexSrc.match(/20261126rv4m8/g) || []).length === 11, 'JS/CSS 版本号统一为 rv4m8', { old: indexSrc.includes('20261125rv4m7') || indexSrc.includes('20261125rv4m6'), refs: (indexSrc.match(/20261126rv4m8/g) || []).length });
    const gameSrc = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
    ok(/const combatPower = \(\) => Math\.floor\(10 \* POW_K/.test(gameSrc) && gameSrc.includes('needG: 1.85'), '战力公式与 needG=1.85 锁定未改');

    let port = 0;
    for (let i = 0; i < 120 && !port; i++) { await sleep(100); try { port = Number(fs.readFileSync(portFile, 'utf8').split(/\r?\n/)[0]) || 0; } catch (_) {} }
    if (!port) throw new Error('devtools 端口没起来');
    let target;
    for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).find(x => x.type === 'page'); } catch (_) { await sleep(100); } }
    if (!target) throw new Error('没有 page target');
    ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const p = new Page(ws); await p.send('Page.enable'); await p.send('Runtime.enable');
    await p.send('Page.navigate', { url: 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') });
    for (let i = 0; i < 200 && !p.loaded; i++) await sleep(100);
    if (!p.loaded) throw new Error('页面 load 超时');
    await p.eval(`(async()=>{for(let i=0;i<100&&(!window.XX||!XX._s);i++)await new Promise(r=>setTimeout(r,50));})()`);
    await p.eval(`(()=>{try{Story.show=()=>{};Story.tick=()=>{};}catch(e){} XX.reset(true);document.getElementById('char-name').value='验道子';document.querySelector('.char-pick[data-path="sword"]').click();document.getElementById('char-confirm').click();document.querySelectorAll('.modal').forEach(e=>e.classList.add('hidden'));document.getElementById('npc-visit').classList.add('hidden');})()`);
    await sleep(250);
    const click = async sel => p.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)throw new Error('missing '+${JSON.stringify(sel)});const r=e.getBoundingClientRect();if(!r.width||!r.height)throw new Error('not visible '+${JSON.stringify(sel)});const x=r.x+r.width/2,y=r.y+r.height/2,top=document.elementFromPoint(x,y);if(!top||!(e===top||e.contains(top)))throw new Error('blocked '+${JSON.stringify(sel)}+' by '+(top&&top.className));top.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,clientX:x,clientY:y,view:window}));return {tag:top.tagName,cls:top.className};})()`);

    await p.eval(`ROUTER.showScene('town')`);
    await click('[data-bld="market"][data-scroll="xx-tianji"]'); await sleep(120);
    let route = await p.eval(`({cur:ROUTER.current(),depth:ROUTER.depth()})`);
    ok(route.cur === 'market_tianji' && route.depth === 1, '城镇天机阁按来源直开且只压一层', route);
    await click('[data-back]'); await sleep(100);
    route = await p.eval(`({cur:ROUTER.current(),scene:document.getElementById('page-scene').classList.contains('active'),town:document.getElementById('scene-town').classList.contains('active')})`);
    ok(route.cur === 'scene' && route.scene && route.town, '天机阁返回城镇而非坊市', route);

    const direct = [
      ['[data-bld="dong"][data-scroll="xx-alchemy"]', 'dong_alchemy'],
      ['[data-bld="dong"][data-scroll="xx-forge"]', 'dong_forge'],
      ['[data-bld="dong"][data-scroll="xx-field"]', 'dong_field'],
      ['[data-bld="chong"]', 'chong']
    ];
    for (const [sel, want] of direct) {
      await p.eval(`ROUTER.showScene('cave')`); await click(sel); await sleep(100);
      const cur = await p.eval(`ROUTER.current()`); ok(cur === want, '主界面直进 ' + want, cur);
      await click('[data-back]'); await sleep(80);
      const back = await p.eval(`({cur:ROUTER.current(),scene:document.getElementById('page-scene').classList.contains('active')})`);
      ok(back.cur === 'scene' && back.scene, want + ' 直进返回主界面', back);
    }
    for (const [jump, want] of [['xx-alchemy-sec','dong_alchemy'],['xx-forge-sec','dong_forge'],['xx-field','dong_field']]) {
      await p.eval(`ROUTER.open('dong')`); await click('[data-jump="' + jump + '"]'); await sleep(80);
      const cur = await p.eval(`ROUTER.current()`); ok(cur === want, '洞府产业进入 ' + want, cur);
      await click('[data-back]'); await sleep(80);
      const back = await p.eval(`ROUTER.current()`); ok(back === 'dong', want + ' 从产业进入返回产业页', back);
    }
    await p.eval(`ROUTER.open('dong','xx-forge-sec')`); await click('[data-forge-bestiary]'); await sleep(80);
    const best = await p.eval(`ROUTER.current()`); await click('[data-back]'); await sleep(80);
    const forgeBack = await p.eval(`ROUTER.current()`);
    ok(best === 'bestiary' && forgeBack === 'dong_forge', '炼器坊图鉴/万兽谱返回炼器坊', { best, forgeBack });

    await click('.scene-tab[data-tab="role"]'); await sleep(100);
    const role = await p.eval(`({cur:ROUTER.current(),depth:ROUTER.depth(),crumb:document.querySelectorAll('#page-role [data-go-hub]').length,left:!!document.querySelector('#page-role .panel-back')})`);
    ok(role.cur === 'role_equip' && role.depth === 1 && role.crumb === 0 && role.left, '人物页删除右上人物按钮并保留左上返回', role);
    await click('[data-back]'); await sleep(80);
    ok(await p.eval(`ROUTER.current()==='scene'`), '人物页左上返回主场景');

    await p.eval(`(()=>{const e=document.getElementById('enc-bubble');e.classList.remove('hidden');const h=document.getElementById('sc-handbook');h.open=true;})()`); await sleep(150);
    const overlap = await p.eval(`(()=>{const h=document.getElementById('sc-handbook'),e=document.getElementById('enc-bubble'),sign=Array.from(h.querySelectorAll('.hb-act')).find(x=>x.textContent.includes('七日签到'));const er=e.getBoundingClientRect(),sr=sign.getBoundingClientRect();const area=Math.max(0,Math.min(er.right,sr.right)-Math.max(er.x,sr.x))*Math.max(0,Math.min(er.bottom,sr.bottom)-Math.max(er.y,sr.y));const x=sr.x+sr.width/2,y=sr.y+sr.height/2,top=document.elementFromPoint(x,y);return {display:getComputedStyle(e).display,z:getComputedStyle(h).zIndex,area,hit:top===sign||sign.contains(top),sign:{x:sr.x,y:sr.y,w:sr.width,h:sr.height}};})()`);
    ok(overlap.display === 'none' && overlap.area === 0 && overlap.hit, '手札展开奇遇让位且七日签到零遮挡', overlap);
    await p.shot(path.join(OUT, 'shots', 'handbook_430x900.png'));
    await p.eval(`document.getElementById('sc-handbook').open=false`);

    await p.eval(`S.equipment={weapon:null,armor:null,accessory:null};S.bag=[];XX._render();ROUTER.open('role')`); await sleep(100);
    await click('.equip-slot[data-slot="weapon"]'); await sleep(80);
    const empty = await p.eval(`({text:document.getElementById('toast').textContent,show:document.getElementById('toast').classList.contains('show'),filled:document.querySelector('.equip-slot[data-slot="weapon"]').classList.contains('filled')})`);
    ok(!empty.filled && empty.show && /武器槽尚无装备/.test(empty.text) && /坊市/.test(empty.text) && /炼器坊/.test(empty.text), '空装备槽提示尚无装备与去向', empty);

    await p.eval(`ROUTER.open('dong','xx-ups-sec')`); await sleep(100);
    const ups = await p.eval(`({rows:document.querySelectorAll('#xx-ups .upg-mirror').length,imgs:document.querySelectorAll('#xx-ups img,#xx-ups .upg-ico').length,buttons:document.querySelectorAll('#xx-ups button').length,text:document.getElementById('xx-ups').innerText})`);
    ok(ups.rows === 6 && ups.imgs === 0 && ups.buttons === 0 && /功法 · 引气诀/.test(ups.text) && /炼器坊/.test(ups.text), '洞府设施六行统一纯文本无图标位', ups);

    await p.eval(`ROUTER.open('xiu','xx-gong-sec')`); await sleep(100);
    const gongs = await p.eval(`Array.from(document.querySelectorAll('#xx-gong-list .upg')).map(x=>({name:x.querySelector('b').textContent.trim(),detail:x.querySelector('.gong-detail').textContent}))`);
    ok(gongs.length === 3 && gongs.every(x => x.detail.includes('功法倍率同时计入战力')), '三门功法均披露倍率计入战力', gongs);

    await p.eval(`S.bag=[{t:'mat_core',n:'妖丹',q:1}];S.market.sold=0;S.stone=10000;S.field=0;XX._render();ROUTER.open('market','mk-sell')`); await sleep(100);
    const beforeSingle = await p.eval(`({stone:S.stone,bag:S.bag.length,sold:S.market.sold,price:XX._sellPrice('mat_core'),rate:XX._stoneRate(),btn:document.querySelector('#mk-sell [data-sell="0"]').textContent.trim()})`);
    const passiveCap = Math.min(beforeSingle.price - 1e-6, beforeSingle.rate * 2 + 1e-6);
    ok(beforeSingle.btn === beforeSingle.price + ' 灵石', '单件寄售按钮显示全价 N 灵石', beforeSingle);
    await click('#mk-sell [data-sell="0"]'); await sleep(80);
    const singleCancel = await p.eval(`({stone:S.stone,delta:S.stone-${beforeSingle.stone},bag:S.bag.length,sold:S.market.sold,shown:!document.getElementById('stance-modal').classList.contains('hidden'),text:document.getElementById('st-text').textContent})`);
    ok(singleCancel.delta >= 0 && singleCancel.delta <= passiveCap && singleCancel.bag === 1 && singleCancel.sold === 0 && singleCancel.shown && /妖丹/.test(singleCancel.text) && /数量：1 件/.test(singleCancel.text) && /总价：/.test(singleCancel.text), '单件寄售先确认且件名数量总价齐全（不把挂机 passive 当寄售所得）', singleCancel);
    await click('#st-close'); await sleep(60);
    const singleClosed = await p.eval(`({stone:S.stone,delta:S.stone-${beforeSingle.stone},bag:S.bag.length,sold:S.market.sold})`);
    ok(singleClosed.delta >= 0 && singleClosed.delta <= passiveCap && singleClosed.bag === 1 && singleClosed.sold === 0, '单件寄售取消不扣货不发钱（仅允许至多 2 秒挂机产出）', singleClosed);
    await click('#mk-sell [data-sell="0"]'); await sleep(60);
    const singleDone = await p.eval(`(()=>{const before=S.stone;document.querySelector('#st-opts [data-st="ok"]').click();return {before,stone:S.stone,bag:S.bag.length,sold:S.market.sold};})()`);
    ok(singleDone.stone === singleDone.before + beforeSingle.price && singleDone.bag === 0 && singleDone.sold === 1, '单件寄售确认后按总价成交', singleDone);

    await p.eval(`S.bag=[{t:'mat_core',n:'妖丹',q:3},{t:'mat_bone',n:'兽骨',q:2}];S.market.sold=0;S.stone=10000;S.field=0;XX._render()`); await sleep(100);
    const beforeAll = await p.eval(`({stone:S.stone,bag:S.bag.length,rate:XX._stoneRate(),plan:XX._sellAllPlan()})`);
    const passiveCapAll = Math.min(beforeAll.plan.sum - 1e-6, beforeAll.rate * 2 + 1e-6);
    await click('#mk-sell .mk-all'); await sleep(80);
    const allText = await p.eval(`document.getElementById('st-text').textContent`);
    ok(/数量：5 件/.test(allText) && allText.includes('总价：') && /妖丹 ×3/.test(allText) && /兽骨 ×2/.test(allText), '一键寄售确认显示逐项件数与总价', allText);
    await click('#st-close'); await sleep(60);
    const allClosed = await p.eval(`({stone:S.stone,delta:S.stone-${beforeAll.stone},bag:S.bag.length,sold:S.market.sold})`);
    ok(allClosed.delta >= 0 && allClosed.delta <= passiveCapAll && allClosed.bag === 2 && allClosed.sold === 0, '一键寄售取消不扣货不发钱（仅允许至多 2 秒挂机产出）', allClosed);
    await click('#mk-sell .mk-all'); await sleep(60);
    const allDone = await p.eval(`(()=>{const before=S.stone;document.querySelector('#st-opts [data-st="ok"]').click();return {before,stone:S.stone,bag:S.bag.length,sold:S.market.sold};})()`);
    ok(allDone.stone === allDone.before + beforeAll.plan.sum && allDone.bag === 0 && allDone.sold === 5, '一键寄售确认数量与总价等于实际成交', { before: beforeAll.plan, after: allDone });

    const price = await p.eval(`(()=>{S.rank=0;S.market.day='';S.market.buyRate=1;XX._marketGoods();const g=XX._marketGoods().find(x=>x.g.id==='bag');ROUTER.open('bag');const t=document.getElementById('xx-bag-buy').textContent;const m=t.match(/灵石\\s*([\\d,]+)/);return {id:g.g.id,k:g.g.k,rate:S.market.buyRate,market:g.price,formula:Math.max(1,Math.floor(XX._needOf(S.rank)*g.g.k*S.market.buyRate)),bag:m?Number(m[1].replace(/,/g,'')):null,text:t};})()`);
    ok(price.market === price.formula && price.bag === price.market, '储物袋扩容与坊市同物同价（k=2.00、当日 buyRate）', price);
    await p.shot(path.join(OUT, 'shots', 'bag_price_430x900.png'));
  } catch (e) {
    fail++; console.log('FAIL 探针异常 :: ' + (e.stack || e));
  } finally {
    try { if (ws) ws.close(); } catch (_) {}
    try { if (process.platform === 'win32' && edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore', timeout: 8000 }); else edge.kill(); } catch (_) {}
    await Promise.race([exited, sleep(3000)]);
    try { fs.rmSync(ud, { recursive: true, force: true }); } catch (_) {}
    console.log('RESULT pass=' + pass + ' fail=' + fail);
    process.exitCode = fail ? 1 : 0;
  }
})();
