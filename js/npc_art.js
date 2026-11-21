/* js/npc_art.js — NPC 立绘公共缓存（B3 沈碑呈现位 · 必达三件）
 *
 * 纪律：
 *   1. 四呈现位（主页卡 / 对话页 / 现身事件 / 题记落款）共用同一图源与缓存，不许各拉各的。
 *   2. 创角完成后预加载；加载失败或超时（>3 秒）自动重试一次，再失败换本地兜底（各呈现位
 *      后面本就垫着「碑」字块，隐藏破图即露出，不出空白、不出蓝漩涡）。
 *   3. 崔九同构：ART.cuijiu 现在为 null（无图），接口先留——图到位后只填 src，四处自动生效。
 *   4. 不碰存档、不碰数值；纯呈现层。
 */
(function () {
  'use strict';

  /* 图源表：换图只改这里（主对话页立绘、主页卡头像、现身事件半身像、题记小头像同源） */
  var ART = {
    stele: { src: 'ui/avatar/npc_stele_full.jpg', retryMs: 3000 },
    cuijiu: null   /* 崔九：图未到，接口预留；填 { src:'ui/avatar/npc_cuijiu_full.jpg' } 即生效 */
  };

  var status = {};   /* key -> 'loading' | 'ok' | 'fail' */
  var imgCache = {}; /* key -> Image（共享缓存，避免四呈现位各拉一份） */

  function getDef(key) { return ART[key] || null; }

  /* 预加载单个：3 秒超时 → 重试一次（带缓存打破参数）→ 再失败标记 fail 并让各呈现位露出兜底 */
  function preload(key) {
    var def = getDef(key);
    if (!def || !def.src) return;
    if (status[key] === 'loading' || status[key] === 'ok') return;
    status[key] = 'loading';
    var done = false;
    var img = new Image();
    var to = setTimeout(function () {
      if (done) return;
      done = true;
      retry(key);
    }, def.retryMs || 3000);
    img.onload = function () {
      if (done) return;
      done = true;
      clearTimeout(to);
      status[key] = 'ok';
      imgCache[key] = img;
      apply(key);
    };
    img.onerror = function () {
      if (done) return;
      done = true;
      clearTimeout(to);
      retry(key);
    };
    img.src = def.src;
  }

  function retry(key) {
    var def = getDef(key);
    if (!def || !def.src) { status[key] = 'fail'; apply(key); return; }
    var img = new Image();
    var done = false;
    var to = setTimeout(function () {
      if (done) return;
      done = true;
      status[key] = 'fail';
      apply(key);
    }, def.retryMs || 3000);
    img.onload = function () {
      if (done) return;
      done = true;
      clearTimeout(to);
      status[key] = 'ok';
      imgCache[key] = img;
      apply(key);
    };
    img.onerror = function () {
      if (done) return;
      done = true;
      clearTimeout(to);
      status[key] = 'fail';
      apply(key);
    };
    img.src = def.src + (def.src.indexOf('?') < 0 ? '?' : '&') + 'r=1';
  }

  /* 把状态刷到所有呈现位：fail → 隐藏破图（露出后面的「碑」字块兜底）；ok → 保证显示 */
  function apply(key) {
    var list = [];
    try {
      list = document.querySelectorAll('img[data-npc-art="' + key + '"]');
    } catch (e) { return; }
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var box = el.parentNode;
      if (!box) continue;
      if (status[key] === 'fail') box.classList.add('art-failed');
      else box.classList.remove('art-failed');
    }
  }

  function preloadAll() {
    Object.keys(ART).forEach(function (k) { if (ART[k] && ART[k].src) preload(k); });
  }

  /* 单图失败兜底（动态插入的图也能吃到）：捕获阶段监听 error / load */
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('error', function (ev) {
      var t = ev.target;
      if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.npcArt) return;
      if (t.parentNode) t.parentNode.classList.add('art-failed');
    }, true);
    document.addEventListener('load', function (ev) {
      var t = ev.target;
      if (!t || t.tagName !== 'IMG' || !t.dataset || !t.dataset.npcArt) return;
      if (t.parentNode) t.parentNode.classList.remove('art-failed');
    }, true);
  }

  /* 玩家立绘预加载（女修立绘首载慢）：创角完成后后台拉一次，进场景即秒出 */
  function preloadHero(sex) {
    var src = (sex === 'f') ? 'ui/avatar/hero_female.png' : 'ui/avatar/hero_male.png';
    try { var im = new Image(); im.src = src; } catch (e) {}
  }

  window.NpcArt = {
    preload: preload,
    preloadAll: preloadAll,
    preloadHero: preloadHero,
    apply: apply,
    src: function (key) { var d = getDef(key); return d && d.src ? d.src : ''; },
    status: function (key) { return status[key] || 'idle'; },
    _art: ART
  };
})();