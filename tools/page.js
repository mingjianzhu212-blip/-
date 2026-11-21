'use strict';
/* 临时探针页的统一写法（第 91 轮）。
   此前 verify / _playtest / _layout_check / shot/*.js 都把 `._xxx.html` 写在项目根目录，
   只因为 index.html 里全是相对路径（style.css、js/*.js、ui/*.png）。项目在 C 盘，
   等于每跑一次测试就往 C 盘写一堆临时文件。
   办法：页面文件写 D 盘，同时在 <head> 后补一条 <base href="file:///项目根/">，
   相对路径照旧解析到项目里。实测 21 个 <script> 与 style.css 全部正常加载、无 JS 报错；
   项目里没有任何地方依赖 location.href / baseURI / 锚点跳转，加 base 不改变行为。 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SCRATCH = (function(){
  try { const p = 'D:/xx-scratch'; fs.mkdirSync(p, { recursive: true }); return p; }
  catch (e) { return os.tmpdir(); }
})();

let ROOT = process.cwd();

function use(root) { ROOT = root; }

function baseTag() {
  const href = 'file:///' + String(ROOT).replace(/\\/g, '/').replace(/\/+$/, '') + '/';
  return '<base href="' + href + '">';
}

function writePage(file, html) {
  const out = (typeof html === 'string' && html.indexOf('<base ') < 0 && html.indexOf('<head>') >= 0)
    ? html.replace('<head>', '<head>' + baseTag())
    : html;
  fs.writeFileSync(file, out, 'utf8');
  return file;
}

function fileUrl(p) { return 'file:///' + String(p).replace(/\\/g, '/'); }

module.exports = { SCRATCH, use, writePage, fileUrl };
