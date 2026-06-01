// ══════════════════════════════════════════════
// Preload Script — 安全桥接渲染进程与主进程
// ══════════════════════════════════════════════

const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('petAPI', {
  // ─── 面板管理 ───
  openPanel: (panelName) => ipcRenderer.invoke('open-panel', panelName),
  closePanel: () => ipcRenderer.send('close-panel'),

  // ─── 设置读写 ───
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // ─── 系统信息 ───
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getSystemTime: () => ipcRenderer.invoke('get-system-time'),

  // ─── 窗口拖拽（send 而非 invoke，低延迟）───
  moveWindow: (deltaX, deltaY) => ipcRenderer.send('move-window', { deltaX, deltaY }),

  // ─── 右键菜单 ───
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  onContextMenuAction: (callback) => {
    ipcRenderer.on('context-menu-action', (_event, action) => callback(action));
  },

  // ─── 事件监听 ───
  onPanelAnimateIn: (callback) => ipcRenderer.on('panel-animate-in', callback),
  onPanelAnimateOut: (callback) => ipcRenderer.on('panel-animate-out', callback),

  // ─── 宠物状态推送 ───
  onPetStatePush: (callback) => {
    ipcRenderer.on('pet-state-push', (_event, state) => callback(state));
  },
});
