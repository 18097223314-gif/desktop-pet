// ══════════════════════════════════════════════
// 状态条组件
// 迷你状态面板 (主窗口) — 带 emoji 图标 + 进度条 + 数值
// ══════════════════════════════════════════════

const StatusBarComponent = (() => {
  'use strict';

  // 字段 → DOM ID 映射
  const MAPPING = {
    hunger:      { barId: 'mini-hunger',  valId: 'val-hunger' },
    happy:       { barId: 'mini-happy',   valId: 'val-happy' },
    energy:      { barId: 'mini-energy',  valId: 'val-energy' },
    cleanliness: { barId: 'mini-clean',   valId: 'val-clean' },
  };

  function init(engine) {
    if (!engine) return;
    engine.on('tick', (data) => updateMiniBars(data));
  }

  function updateMiniBars(data) {
    for (const [key, ids] of Object.entries(MAPPING)) {
      if (data[key] === undefined) continue;
      const val = Math.round(data[key]);

      const barEl = document.getElementById(ids.barId);
      if (barEl) barEl.style.width = val + '%';

      const valEl = document.getElementById(ids.valId);
      if (valEl) valEl.textContent = val;
    }
  }

  function showFullPanel() {
    if (window.petAPI && window.petAPI.openPanel) {
      window.petAPI.openPanel('settings');
    }
  }

  return { init, updateMiniBars, showFullPanel };
})();
