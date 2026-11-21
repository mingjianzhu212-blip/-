/* js/img_fallback.js — 全站图片加载兜底（A6 · 2026-11-20）
 *
 * 口径：
 *   1. 任何 <img> 加载失败 → 自动重试一次（缓存打破）；再失败 → 显示文字兜底
 *      （取 alt/邻近文本首字 + 底色块），不空白、不出蓝漩涡。
 *   2. 超过 3 秒仍未 complete 的图，先挂文字兜底；若之后加载成功，自动摘掉兜底。
 *   3. NPC 立绘（data-npc-art）走 js/npc_art.js 自己的「碑」字兜底，本模块跳过。
 *   4. 纯呈现层：不碰数值/存档/逻辑。
 */
(function () {
  'use strict';

  function labelOf(img) {
    if (img.dataset && img.dataset.fb) return String(img.dataset.fb).charAt(0);
    var alt = (img.getAttribute('alt') || '').trim();
    if (alt) return alt.charAt(0);
    var p = img.parentElement;
    for (var i = 0; p && i < 3; i++, p = p.parentElement) {
      var t = (p.textContent || '').replace(/\s+/g, '');
      if (t) return t.charAt(0);
    }
    return '图';
  }

  function showFallback(img) {
    if (!img || img.dataset.fbDone === '1') return;
    img.dataset.fbDone = '1';
    var r = img.getBoundingClientRect();
    var w = r.width || parseInt(img.getAttribute('width'), 10) || 24;
    var h = r.height || parseInt(img.getAttribute('height'), 10) || 24;
    var s = document.createElement('span');
    s.className = 'img-fb';
    s.textContent = labelOf(img);
    s.style.width = Math.max(14, Math.round(w)) + 'px';
    s.style.height = Math.max(14, Math.round(h)) + 'px';
    s.style.fontSize = Math.max(10, Math.round(Math.min(w, h) * 0.5)) + 'px';
    img.style.display = 'none';
    if (img.parentNode) img.parentNode.insertBefore(s, img.nextSibling);
  }

  function retry(img) {
    if (img.dataset.fbRetry === '1') { showFallback(img); return; }
    img.dataset.fbRetry = '1';
    var src = img.getAttribute('src') || '';
    img.src = src + (src.indexOf('?') < 0 ? '?' : '&') + 'fb=1';
  }

  function skip(img) { return !!(img.dataset && img.dataset.npcArt); }

  document.addEventListener('error', function (ev) {
    var t = ev.target;
    if (!t || t.tagName !== 'IMG' || skip(t)) return;
    retry(t);
  }, true);

  document.addEventListener('load', function (ev) {
    var t = ev.target;
    if (!t || t.tagName !== 'IMG' || skip(t)) return;
    var s = t.nextSibling;
    if (s && s.className === 'img-fb' && s.parentNode) s.parentNode.removeChild(s);
    if (t.dataset) { t.dataset.fbDone = ''; t.dataset.fbRetry = ''; }
    if (t.style.display === 'none') t.style.display = '';
  }, true);

  /* 超时兜底：3 秒仍未 complete 的图先挂兜底（后续加载成功会自动摘掉） */
  function sweep() {
    var imgs = document.getElementsByTagName('img');
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (skip(im)) continue;
      if (im.complete) {
        if (im.naturalWidth === 0 && im.getAttribute('src')) retry(im);
        continue;
      }
      if (im.dataset.fbTimer) continue;
      (function (img) {
        img.dataset.fbTimer = setTimeout(function () {
          if (!img.complete) showFallback(img);
        }, 3000);
      })(im);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sweep);
  else sweep();
  setTimeout(sweep, 1200);
  setTimeout(sweep, 3600);

  /* 运行期新插入的图（页面重绘/切页）也纳入超时兜底 */
  function watchImg(img) {
    if (!img || img.tagName !== 'IMG' || skip(img) || img.dataset.fbTimer || img.complete) return;
    img.dataset.fbTimer = setTimeout(function () {
      if (!img.complete) showFallback(img);
    }, 3000);
  }
  try {
    var mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var nodes = muts[i].addedNodes;
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j];
          if (!n || n.nodeType !== 1) continue;
          if (n.tagName === 'IMG') watchImg(n);
          else if (n.querySelectorAll) {
            var sub = n.querySelectorAll('img');
            for (var k = 0; k < sub.length; k++) watchImg(sub[k]);
          }
        }
      }
    });
    var startObserve = function () { try { mo.observe(document.body, { childList: true, subtree: true }); } catch (e) {} };
    if (document.body) startObserve(); else document.addEventListener('DOMContentLoaded', startObserve);
  } catch (e) {}
})();