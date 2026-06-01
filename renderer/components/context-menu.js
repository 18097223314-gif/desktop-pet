// ══════════════════════════════════════════════
// 右键菜单组件
// Dark Glassmorphism 风格的上下文菜单
// ══════════════════════════════════════════════

const ContextMenuComponent = (() => {
  'use strict';

  let menuEl = null;
  let callbacks = {};

  function init(callbacksObj) {
    callbacks = callbacksObj || {};
    // 监听全局右键
    document.addEventListener('contextmenu', onContextMenu);
    // 点击其他地方关闭
    document.addEventListener('click', hide);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hide();
    });
  }

  function onContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    show(e.clientX, e.clientY);
  }

  function show(x, y) {
    hide(); // 先关闭旧的

    menuEl = document.createElement('div');
    menuEl.id = 'dp-context-menu';
    menuEl.innerHTML = `
      <style>
        #dp-context-menu {
          position: fixed;
          min-width: 160px;
          background: rgba(30,30,30,0.95);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          box-shadow: 0 6px 30px rgba(0,0,0,0.5);
          z-index: 9999;
          padding: 6px 0;
          animation: dp-cmenu-in 150ms ease-out;
          font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
          font-size: 13px;
        }
        @keyframes dp-cmenu-in {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        #dp-context-menu .dp-ctx-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          cursor: pointer;
          color: #e8e8e8;
          transition: background 100ms;
        }
        #dp-context-menu .dp-ctx-item:hover {
          background: rgba(124, 92, 252, 0.15);
        }
        #dp-context-menu .ctx-icon {
          width: 16px;
          height: 16px;
          color: var(--dp-text-secondary);
          flex-shrink: 0;
          transition: color var(--dp-transition-fast);
        }
        #dp-context-menu .dp-ctx-item:hover .ctx-icon {
          color: var(--dp-primary-light);
        }
        #dp-context-menu .cmenu-divider {
          height: 1px;
          background: rgba(255,255,255,0.06);
          margin: 4px 0;
        }
        #dp-context-menu .dp-ctx-item.danger {
          color: #ff5555;
        }
        #dp-context-menu .dp-ctx-item.danger:hover {
          background: rgba(255, 85, 85, 0.12);
        }
      </style>
    `;

    // 菜单项 — emoji 替换为 SVG 图标
    var items = [
      { icon: '../icons/icon-wave.svg',  label: '打招呼',   action: 'wave' },
      { icon: '../icons/icon-dance.svg', label: '跳舞',     action: 'dance' },
      { icon: '../icons/icon-sleep.svg', label: '睡觉',     action: 'sleep' },
      null, // 分割线
      { icon: '../icons/icon-dress.svg', label: '换装',     action: 'dressUp' },
      { icon: '../icons/icon-bag.svg',   label: '道具包',   action: 'inventory' },
      null,
      { icon: '../icons/icon-settings.svg', label: '设置',  action: 'settings' },
      null,
      { icon: '../icons/icon-door.svg',  label: '退出',     action: 'quit', danger: true },
    ];

    items.forEach(function (item) {
      if (!item) {
        var div = document.createElement('div');
        div.className = 'cmenu-divider';
        menuEl.appendChild(div);
        return;
      }
      var el = document.createElement('div');
      el.className = 'dp-ctx-item' + (item.danger ? ' danger' : '');
      el.innerHTML = '<img class="ctx-icon" src="' + item.icon + '" width="16" height="16" alt=""><span>' + item.label + '</span>';
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        hide();
        if (callbacks[item.action]) callbacks[item.action]();
      });
      menuEl.appendChild(el);
    });

    document.body.appendChild(menuEl);

    // 定位（防止超出屏幕）
    requestAnimationFrame(function () {
      var rect = menuEl.getBoundingClientRect();
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var finalX = x, finalY = y;
      if (x + rect.width > vw - 8) finalX = vw - rect.width - 8;
      if (y + rect.height > vh - 8) finalY = vh - rect.height - 8;
      menuEl.style.left = finalX + 'px';
      menuEl.style.top = finalY + 'px';
    });
  }

  function hide() {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
  }

  return { init: init, show: show, hide: hide };
})();
