// ══════════════════════════════════════════════
// 对话气泡组件
// 负责气泡显示/隐藏、随机台词、自动消失、打字机效果
// ══════════════════════════════════════════════

const BubbleComponent = (() => {
  'use strict';

  let bubbleEl = null;
  let hideTimer = null;
  let autoTalkTimer = null;
  let autoTalkEnabled = true;
  let isShowing = false;

  // 台词分组（从引擎获取）
  const phrases = PetEngineModule.PHRASES;

  function init(el, engine) {
    bubbleEl = el || document.getElementById('bubble');
    if (!bubbleEl) return;

    // 空闲时随机说话
    autoTalkTimer = setInterval(() => {
      if (!autoTalkEnabled) return;
      if (!engine) return;
      const state = engine.getState();
      // 睡觉或刚交互过就不说话
      if (state.isSleeping) return;
      if (Date.now() - state.lastInteraction < 15000) return;
      if (Math.random() > 0.25) return; // 25% 概率

      // 根据状态选择台词
      let group = 'idle';
      if (state.moodType === 'happy') group = 'happy';
      else if (state.moodType === 'sick') group = 'sick';
      else if (state.hunger < 20) group = 'hungry';
      else if (state.stamina < 20) group = 'tired';
      else if (state.hygiene < 20) group = 'dirty';
      else if (state.mood < 30) group = 'unhappy';

      say(group, 2500);
    }, 8000);
  }

  // ─── 打字机效果 ───
  function typeWriter(element, text, speed) {
    speed = speed || 30;
    return new Promise(function (resolve) {
      element.textContent = '';
      element.classList.add('anim-typewriter-cursor');
      let i = 0;
      function type() {
        if (i < text.length) {
          element.textContent += text[i];
          i++;
          setTimeout(type, speed);
        } else {
          element.classList.remove('anim-typewriter-cursor');
          resolve();
        }
      }
      type();
    });
  }

  function say(group, duration) {
    duration = duration || 2500;
    if (!bubbleEl || isShowing) return;
    const arr = phrases[group] || phrases.idle;
    const text = arr[Math.floor(Math.random() * arr.length)];
    isShowing = true;
    bubbleEl.classList.add('show');
    clearTimeout(hideTimer);
    typeWriter(bubbleEl, text, 30).then(function () {
      hideTimer = setTimeout(function () {
        bubbleEl.classList.remove('show');
        isShowing = false;
      }, duration);
    });
  }

  function show(text, duration) {
    if (!bubbleEl || isShowing) return;
    isShowing = true;
    bubbleEl.classList.add('show');
    clearTimeout(hideTimer);
    typeWriter(bubbleEl, text, 30).then(function () {
      hideTimer = setTimeout(function () {
        bubbleEl.classList.remove('show');
        isShowing = false;
      }, duration || 3000);
    });
  }

  function hide() {
    if (!bubbleEl) return;
    bubbleEl.classList.remove('show');
    bubbleEl.classList.remove('anim-typewriter-cursor');
    clearTimeout(hideTimer);
    isShowing = false;
  }

  function setAutoTalk(enabled) {
    autoTalkEnabled = enabled;
  }

  function destroy() {
    clearTimeout(hideTimer);
    clearInterval(autoTalkTimer);
  }

  return { init: init, say: say, show: show, hide: hide, setAutoTalk: setAutoTalk, destroy: destroy };
})();
