// ══════════════════════════════════════════════
// panel-common.js — 面板通用功能（拖拽 + 关闭 + 动画）
// 所有面板 HTML 引用此脚本即可获得：标题栏拖拽、ESC 关闭、入场退场动画
// ══════════════════════════════════════════════

(function () {
  'use strict';

  const DRAG_THRESHOLD = 4;
  const api = window.petAPI;

  // ─── 自动初始化：DOM 加载完毕后绑定 ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    setupDrag();
    setupClose();
    setupAnimations();
  }

  // ══════════════════════════════════════════════
  // 标题栏拖拽
  // ══════════════════════════════════════════════
  function setupDrag() {
    const header = document.querySelector('.dp-panel-header');
    if (!header) return;

    let isDragging = false;
    let dragStarted = false;
    let lastScreenX = 0;
    let lastScreenY = 0;
    let mouseDownX = 0;
    let mouseDownY = 0;

    header.addEventListener('mousedown', (e) => {
      // 不拦截按钮点击
      if (e.target.closest('button') || e.target.closest('input')) return;
      if (e.button !== 0) return;

      isDragging = true;
      dragStarted = false;
      lastScreenX = e.screenX;
      lastScreenY = e.screenY;
      mouseDownX = e.clientX;
      mouseDownY = e.clientY;
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const dx = e.clientX - mouseDownX;
      const dy = e.clientY - mouseDownY;

      if (!dragStarted && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
        dragStarted = true;
        header.style.cursor = 'grabbing';
      }

      if (dragStarted && api && api.moveWindow) {
        const deltaX = e.screenX - lastScreenX;
        const deltaY = e.screenY - lastScreenY;
        lastScreenX = e.screenX;
        lastScreenY = e.screenY;
        api.moveWindow(deltaX, deltaY);
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging && dragStarted) {
        header.style.cursor = '';
      }
      isDragging = false;
      dragStarted = false;
    });
  }

  // ══════════════════════════════════════════════
  // 关闭按钮 + ESC
  // ══════════════════════════════════════════════
  function setupClose() {
    const closeBtn = document.getElementById('close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closePanel);
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    });
  }

  function closePanel() {
    // 如果面板定义了自定义 closePanel，优先调用
    if (typeof window._panelCloseHandler === 'function') {
      window._panelCloseHandler();
      return;
    }
    const panel = document.querySelector('.dp-panel');
    if (panel) {
      panel.classList.add('dp-panel-exit');
    }
    setTimeout(() => {
      if (api) api.closePanel();
    }, 200);
  }

  // ══════════════════════════════════════════════
  // 入场/退场动画
  // ══════════════════════════════════════════════
  function setupAnimations() {
    if (!api) return;
    api.onPanelAnimateIn(() => {
      const panel = document.querySelector('.dp-panel');
      if (panel) panel.style.animation = 'dp-panel-in 200ms ease-out';
    });
    api.onPanelAnimateOut(() => {
      const panel = document.querySelector('.dp-panel');
      if (panel) panel.classList.add('dp-panel-exit');
    });
  }
})();
