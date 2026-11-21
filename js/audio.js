'use strict';
/* ============================================================
 * audio.js — 全局音频管理器（AudioManager 对象封装）
 * 依赖文件：audio/bgm.mp3（古风循环 BGM）
 *           audio/kenney/metal_click.ogg（按钮点击声，既有经核验资源，替换原不存在的 click.wav）
 *           audio/kenney/chop.ogg（突破 / 镇妖塔胜利提示声，既有经核验资源，替换原不存在的 levelup.wav）
 * 特性：文件缺失时静默无声、不报错；
 *       静音状态记忆 localStorage（设置弹窗「音频」按钮 + 右侧「音效」图标共用）；
 *       浏览器禁自动播放 → 玩家第一次点击页面任意位置才启动 BGM。
 * 与游戏主逻辑零耦合：只暴露 window.GameAudio / window.playLevelUpSound。
 * ============================================================ */
(function(){

  const AudioManager = {

    /* ---------- 三个音频对象（全部收拢在管理器内，不散落全局） ---------- */
    bgm:     new Audio('audio/bgm.mp3'),                 /* 古风背景音乐 */
    click:   new Audio('audio/kenney/metal_click.ogg'),  /* 按钮点击声（既有经核验资源） */
    levelup: new Audio('audio/kenney/chop.ogg'),         /* 突破 / 镇妖塔胜利（既有经核验资源） */

    muted:   false,   /* 静音总开关（记忆到 localStorage） */
    started: false,   /* BGM 是否已通过首次交互解锁 */

    init(){
      /* BGM：循环播放 + 0.3 音量（背景垫底，不能盖过音效） */
      this.bgm.loop = true;
      this.bgm.volume = 0.3;
      this.click.volume = 0.8;
      this.levelup.volume = 0.9;

      /* 静音状态恢复 */
      try { this.muted = localStorage.getItem('xiuxian_fileaudio_muted') === '1'; } catch(e){}
      this.applyMute();

      /* 关键防呆：浏览器禁止自动播放 → 玩家第一次点击页面任何地方，才触发 bgm.play()。
         play() 返回 Promise，仍被策略拦截时回滚 started，下次点击再试。 */
      document.addEventListener('click', () => {
        if (this.started) return;
        this.started = true;
        this.bgm.play().catch(() => { this.started = false; });
      });

      /* 事件委托：点页面里任意 <button> 响 click.wav
         （capture 阶段先于各按钮自身 handler，手感更跟手；disabled 按钮不响） */
      document.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest ? e.target.closest('button') : null;
        if (!btn || btn.disabled) return;
        this.playClick();
      }, true);

      /* 设置面板「音频」开关按钮绑定 */
      const tbtn = document.getElementById('fileaudio-toggle');
      if (tbtn) tbtn.addEventListener('click', () => { window.GameAudio.toggle(); });

      this.refreshBtn();
    },

    /* ---------- 点击音：重置进度，连续点击每次都有声 ---------- */
    playClick(){
      if (this.muted) return;
      try { this.click.currentTime = 0; this.click.play(); } catch(e){}
    },

    /* ---------- 场景音效：突破成功 / 镇妖塔战斗胜利 ---------- */
    playLevelUp(){
      if (this.muted) return;
      try { this.levelup.currentTime = 0; this.levelup.play(); } catch(e){}
    },

    /* ---------- 静音应用到三个音源 + 记忆 ---------- */
    applyMute(){
      this.bgm.muted = this.muted;
      this.click.muted = this.muted;
      this.levelup.muted = this.muted;
      try { localStorage.setItem('xiuxian_fileaudio_muted', this.muted ? '1' : '0'); } catch(e){}
    },

    /* ---------- 刷新设置按钮文案 + 右侧「音效」图标 ---------- */
    refreshBtn(){
      const b = document.getElementById('fileaudio-toggle');
      /* 用 innerHTML 而不是 textContent：按钮里的 <img> 不能被文字覆盖掉 */
      if (b) b.innerHTML = '<img class="btn-ic" src="ui/icons/rail_sfx.png" alt="">' +
        (this.muted ? '音频：关（点击开启）' : '音频：开（点击静音）');
      if (window.renderSfxBtn) window.renderSfxBtn();
    },

    setMuted(v){
      this.muted = v;
      this.applyMute();
      this.refreshBtn();
    }
  };

  AudioManager.init();

  /* ---------- 全局 API（game.js / 设置面板调用） ---------- */
  window.GameAudio = {
    toggle:  function(){ AudioManager.setMuted(!AudioManager.muted); return !AudioManager.muted; },
    mute:    function(){ AudioManager.setMuted(true); },
    unmute:  function(){ AudioManager.setMuted(false); },
    isMuted: function(){ return AudioManager.muted; },
    /* 只读探针（调试/测试用）：BGM 音量 / 循环 / 静音 / 解锁状态 */
    _probe:  function(){ return {
      volume: AudioManager.bgm.volume,
      loop:   AudioManager.bgm.loop,
      muted:  AudioManager.muted,
      started: AudioManager.started
    }; }
  };

  /* 场景音效全局入口：突破成功 / 镇妖塔胜利时调用 */
  window.playLevelUpSound = function(){ AudioManager.playLevelUp(); };
})();
