// ══════════════════════════════════════════════
// 状态条组件
// 迷你状态面板 (主窗口) — 带 emoji 图标 + 进度条 + 数值
// ══════════════════════════════════════════════

const StatusBarComponent = (() => {
  'use strict';

  // 字段 → DOM ID 映射 + 中文标签
  const MAPPING = {
    hunger: { barId: 'mini-hunger', valId: 'val-hunger', label: '饱食', labelId: 'lbl-hunger' },
    mood: { barId: 'mini-happy', valId: 'val-happy', label: '心情', labelId: 'lbl-happy' },
    stamina: { barId: 'mini-energy', valId: 'val-energy', label: '体力', labelId: 'lbl-energy' },
    hygiene: { barId: 'mini-clean', valId: 'val-clean', label: '清洁', labelId: 'lbl-clean' },
  };

  function init(engine) {
    // 状态条只接受后端 pet:state-push 推送（pet-controller.js 调用 updateMiniBars）
    // 不再监听前端 engine.on('tick')，避免双源冲突
  }

  function updateMiniBars(data) {
    console.log('[StatusBar] updateMiniBars called with:', JSON.stringify(data));
    for (const [key, ids] of Object.entries(MAPPING)) {
      if (data[key] === undefined) {
        console.log('[StatusBar] SKIP', key, '— undefined');
        continue;
      }
      const val = Math.round(data[key]);

      const barEl = document.getElementById(ids.barId);
      if (barEl) barEl.style.width = val + '%';
      else console.warn('[StatusBar] barEl not found:', ids.barId);

      const valEl = document.getElementById(ids.valId);
      if (valEl) valEl.textContent = val;
      else console.warn('[StatusBar] valEl not found:', ids.valId);
    }
  }

  function showFullPanel() {
    if (window.petAPI && window.petAPI.openPanel) {
      window.petAPI.openPanel('settings');
    }
  }

  return { init, updateMiniBars, showFullPanel };
})();
