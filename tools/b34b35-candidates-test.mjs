// tools/b34b35-candidates-test.mjs — 验证 SECT.candidates() 在各类环境下的候选产出
//
// 直接从真实 js/game.js 抽取 candidates() 源码运行（非复制逻辑），证明：
//   1) file:// 且无任何配置 → 返回 []（B-35：不发起宗门探活）
//   2) http(s) 部署 → 仍返回 [同源 origin, DEF_HOST]（保留连接能力）
//   3) file:// 但带 ?sect= → 仍返回 [该地址, DEF_HOST]（已配置优先探活）
//   4) file:// 但 localStorage 已存地址 → 仍返回 [已存地址, DEF_HOST]
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', 'js', 'game.js');
const src = fs.readFileSync(GAME, 'utf8');

// 抽取 candidates(env){ ... } 整段（括号配对）
const start = src.indexOf('function candidates(env){');
if (start < 0) { console.error('找不到 candidates 函数'); process.exit(2); }
let i = src.indexOf('{', start), depth = 0, end = -1;
for (; i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const fnText = src.slice(start, end);

// 在受控作用域里提供 candidates 引用的闭包常量，返回函数
const HOST_KEY = 'arcade_sect_host';
const PUB_HOST = '';
const DEF_HOST = 'http://localhost:8787';
const factory = new Function('HOST_KEY', 'PUB_HOST', 'DEF_HOST',
  fnText + '\n; return candidates;');
const candidates = factory(HOST_KEY, PUB_HOST, DEF_HOST);

const cases = [
  { name: 'B-35 file:// 无配置 → 空候选（不探活）', env: { protocol: 'file:', search: '', origin: '', stored: '' }, expect: [] },
  { name: 'http 部署 → 保留同源+DEF_HOST 探活', env: { protocol: 'http:', search: '', origin: 'http://localhost:9000', stored: '' }, expect: ['http://localhost:9000', 'http://localhost:8787'] },
  { name: 'https 部署 → 保留同源+DEF_HOST 探活', env: { protocol: 'https:', search: '', origin: 'https://play.example.com', stored: '' }, expect: ['https://play.example.com', 'http://localhost:8787'] },
  { name: 'file:// 带 ?sect= → 已配置优先探活', env: { protocol: 'file:', search: '?sect=http://sect.test/gate', origin: '', stored: '' }, expect: ['http://sect.test/gate', 'http://localhost:8787'] },
  { name: 'file:// 已存地址 → 仍探活已存地址', env: { protocol: 'file:', search: '', origin: '', stored: 'http://saved.host/sect' }, expect: ['http://saved.host/sect', 'http://localhost:8787'] },
];

let pass = 0, fail = 0;
for (const c of cases) {
  const got = candidates(c.env);
  const ok = JSON.stringify(got) === JSON.stringify(c.expect);
  if (ok) { pass++; console.log('  PASS  ' + c.name + '  → ' + JSON.stringify(got)); }
  else { fail++; console.error('  FAIL  ' + c.name + '  got=' + JSON.stringify(got) + ' expect=' + JSON.stringify(c.expect)); }
}
console.log('\ncandidates 单测：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
