#!/usr/bin/env node
/* 玩家界面研发黑话静态扫描：只扫 HTML 可见文本/属性与 JS 字符串，不扫注释、变量名和逻辑代码。 */
import fs from 'node:fs';
import path from 'node:path';

const TERMS = [
  '服务端', '客户端', '养成快照', '快照', '服务端重算', '重算', '上报', '回执', '心跳',
  'runId', '写盘', '磁盘', '内存', '暂存内存', '凭据', '续接', '格式不兼容', 'health',
  'JSON', '系统字段', '纯数据', '同源', 'rv4', '整篇领悟', '残篇', '碎片',
  '不在一个维度', '现算', '高级玩家', '清缓存', 'BGM', 'node server', 'server/server.mjs',
  '同 WiFi', 'localhost', '127.0.0.1', 'token', 'localStorage', 'REST', 'SSE', 'DOM'
];
const args = process.argv.slice(2);
const root = path.resolve(args[0] || '.');
const allowHits = args.includes('--allow-hits');
const files = [path.join(root, 'index.html')];
for (const dir of ['js', path.join('js', 'views')]) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) continue;
  for (const name of fs.readdirSync(abs)) if (name.endsWith('.js')) files.push(path.join(abs, name));
}

function htmlVisible(src) {
  const clean = src.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, m => m.replace(/[^\n]/g, ' '))
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, m => m.replace(/[^\n]/g, ' '));
  return clean.split('\n').map(line => ({
    value: line.replace(/<[^>]*>/g, tag => {
      const attrs = [];
      for (const re of [/\btitle="([^"]*)"/g, /\bplaceholder="([^"]*)"/g, /\baria-label="([^"]*)"/g, /\balt="([^"]*)"/g]) {
        for (const m of tag.matchAll(re)) attrs.push(m[1]);
      }
      return ' ' + attrs.join(' ') + ' ';
    }),
    offset: 0
  }));
}

/* 仅排除已核实的内部用途；每项排除都打印原因，不能靠删词表凑零。 */
function exclusion(item, term, src) {
  const value = item.value;
  const lineStart = src.lastIndexOf('\n', Math.max(0, item.offset - 1)) + 1;
  const lineEnd = src.indexOf('\n', item.offset);
  const line = src.slice(lineStart, lineEnd < 0 ? src.length : lineEnd);
  if (/console\.(?:log|warn|error|info|debug)\s*\(/.test(line)) return '控制台诊断，不进入玩家界面';
  if (/DOMContentLoaded/.test(value)) return '浏览器内部事件名';
  if (/^(?:\/api\/|\/[a-z]+(?:\?|$))/.test(value.trim()) && /health|token/.test(term)) return '接口路径，不直接展示';
  if (/^BAD_JSON$/.test(value.trim())) return '内部错误码';
  if (/^[\w-]+(?:\s+[\w-]+)*$/.test(value) && term === 'rv4') return '样式类名，不是可见文案';
  if (/^localhost$/.test(value.trim()) || /^127\.0\.0\.1$/.test(value.trim())) return '地址过滤常量，不直接展示';
  if (term === '心跳' && /听见自己心跳/.test(value)) return '修仙氛围文案，不是联机状态术语';
  return '';
}

function jsStrings(src) {
  const out = [];
  const significant = [];
  function push(value, offset) { out.push({ value, offset }); }
  function quoted(i, quote) {
    const start = ++i;
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === quote) { push(src.slice(start, i), start); return i + 1; }
      i++;
    }
    return i;
  }
  function template(i) {
    const start = ++i;
    let piece = start;
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '`') { push(src.slice(piece, i), piece); return i + 1; }
      if (src[i] === '$' && src[i + 1] === '{') {
        push(src.slice(piece, i), piece);
        i = expression(i + 2);
        piece = i;
        continue;
      }
      i++;
    }
    push(src.slice(piece, i), piece);
    return i;
  }
  function expression(i) {
    let depth = 1;
    while (i < src.length && depth) {
      const c = src[i];
      if (c === "'" || c === '"') { i = quoted(i, c); continue; }
      if (c === '`') { i = template(i); continue; }
      if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
      if (src.startsWith('//', i)) { const e = src.indexOf('\n', i + 2); i = e < 0 ? src.length : e + 1; continue; }
      if (c === '{') depth++;
      if (c === '}') depth--;
      i++;
    }
    return i;
  }
  function regex(i) {
    i++;
    let cls = false;
    while (i < src.length) {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '[') cls = true;
      else if (src[i] === ']') cls = false;
      else if (src[i] === '/' && !cls) { i++; while (/[a-z]/i.test(src[i] || '')) i++; return i; }
      if (src[i] === '\n') return i;
      i++;
    }
    return i;
  }
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (c === "'" || c === '"') { i = quoted(i, c); continue; }
    if (c === '`') { i = template(i); continue; }
    if (src.startsWith('/*', i)) { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (src.startsWith('//', i)) { const e = src.indexOf('\n', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    if (c === '/') {
      const prev = significant[significant.length - 1] || '';
      if ('=(:,![{;?&|+-*%^~<>'.includes(prev) || ['return', 'case', 'throw', 'typeof', 'delete', 'void', 'in', 'of'].includes(prev)) {
        i = regex(i); continue;
      }
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i + 1; while (/[A-Za-z0-9_$]/.test(src[j] || '')) j++;
      significant.push(src.slice(i, j)); i = j; continue;
    }
    if (!/\s/.test(c)) significant.push(c);
    i++;
  }
  return out;
}

const hits = [], excluded = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const strings = file.endsWith('.html')
    ? htmlVisible(src).map((item, i) => ({ value: item.value, offset: item.offset, line: i + 1 }))
    : jsStrings(src).map(item => ({ ...item, line: null }));
  for (const item of strings) {
    const value = item.value.replace(/<!--[\s\S]*?-->/g, ' ');
    for (const term of TERMS) {
      let from = 0;
      while ((from = value.indexOf(term, from)) >= 0) {
        const offset = item.offset + from;
        const before = src.slice(0, offset);
        const line = item.line || before.split('\n').length;
        const col = offset - before.lastIndexOf('\n');
        const excerpt = value.slice(Math.max(0, from - 36), from + term.length + 56).replace(/\s+/g, ' ').trim();
        const found = { file: path.relative(root, file).replace(/\\/g, '/'), line, col, term, excerpt };
        const reason = exclusion(item, term, src);
        (reason ? excluded : hits).push({ ...found, reason });
        from += term.length;
      }
    }
  }
}
hits.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);
excluded.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);
console.log('UI_WORDING_SCAN files=' + files.length + ' terms=' + TERMS.length + ' hits=' + hits.length + ' internal_excluded=' + excluded.length);
for (const hit of hits) console.log([hit.file + ':' + hit.line + ':' + hit.col, hit.term, hit.excerpt].join('\t'));
for (const hit of excluded) console.log(['EXCLUDED', hit.file + ':' + hit.line + ':' + hit.col, hit.term, hit.reason].join('\t'));
console.log('UI_WORDING_SCAN=' + (hits.length ? 'FAIL' : 'PASS'));
process.exitCode = hits.length && !allowHits ? 1 : 0;
