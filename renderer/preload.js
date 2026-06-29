// ══════════════════════════════════════════════
// Preload Script — 安全桥接渲染进程与主进程
// Channel 命名规范：冒号分隔（与 src/main/constants.js 对齐）
// ══════════════════════════════════════════════

const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('petAPI', {
  // ─── 面板管理（hyphen 命名，已有）───
  openPanel: (panelName) => ipcRenderer.invoke('open-panel', panelName),
  closePanel: () => ipcRenderer.send('close-panel'),

  // ─── 设置读写 ───
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:set', { settings }),

  // ─── 系统信息 ───
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  getSystemTime: () => ipcRenderer.invoke('get-system-time'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),

  // ─── 窗口拖拽（send 而非 invoke，低延迟）───
  moveWindow: (deltaX, deltaY) => ipcRenderer.send('move-window', { deltaX, deltaY }),

  // ─── 右键菜单（原生 Menu，主进程渲染）───
  showNativeContextMenu: () => ipcRenderer.send('show-context-menu-native'),
  onMenuAction: (callback) => {
    ipcRenderer.on('pet:menu-action', (_event, action) => callback(action));
  },

  // ─── 事件监听 ───
  onPanelAnimateIn: (callback) => ipcRenderer.on('panel-animate-in', callback),
  onPanelAnimateOut: (callback) => ipcRenderer.on('panel-animate-out', callback),

  // ─── 宠物状态推送 ───
  onPetStatePush: (callback) => {
    ipcRenderer.on('pet:state-push', (_event, state) => callback(state));
  },

  // ─── 调试日志推送 ───
  onDebugLog: (callback) => {
    ipcRenderer.on('pet:debug-log', (_event, msg) => callback(msg));
  },

  // ─── 升级/进化/里程碑推送（主进程 → 渲染进程）───
  onLevelUp: (callback) => {
    ipcRenderer.on('pet:level-up', (_event, data) => callback(data));
  },
  onMilestone: (callback) => {
    ipcRenderer.on('pet:milestone', (_event, data) => callback(data));
  },
  onEvolutionReady: (callback) => {
    ipcRenderer.on('pet:evolution-ready', (_event, data) => callback(data));
  },
  onPetEvent: (callback) => {
    ipcRenderer.on('pet:event', (_event, data) => callback(data));
  },
  onEvolved: (callback) => {
    ipcRenderer.on('pet:evolved', (_event, data) => callback(data));
  },

  // ══════════════════════════════════════════
  // 业务 IPC（冒号分隔，与 constants.js 对齐）
  // ══════════════════════════════════════════

  // ─── 宠物交互 ───
  petPet: () => ipcRenderer.invoke('pet:pet'),
  petFeed: (itemId) => ipcRenderer.invoke('pet:feed', { itemId }),
  petWash: () => ipcRenderer.invoke('pet:wash'),
  petGetStatus: () => ipcRenderer.invoke('pet:status'),
  petBroadcastState: (state) => ipcRenderer.invoke('pet:broadcast-state', state),

  // ─── 经济系统 ───
  economyGetInventory: () => ipcRenderer.invoke('economy:inventory'),
  economyUseItem: (itemId) => ipcRenderer.invoke('economy:useItem', { itemId }),
  economySell: (itemId, quantity) => ipcRenderer.invoke('economy:sell', { itemId, quantity: quantity || 1 }),
  economyBuy: (itemId) => ipcRenderer.invoke('economy:buy', { itemId }),
  economyGetCoins: () => ipcRenderer.invoke('economy:balance'),
  economyGetShop: () => ipcRenderer.invoke('economy:shop'),

  // ─── 签到系统 ───
  signinCheck: () => ipcRenderer.invoke('signin:check'),
  signinClaim: () => ipcRenderer.invoke('signin:claim'),
  signinGetInfo: () => ipcRenderer.invoke('signin:info'),

  // ─── 打工系统 ───
  workStart: (jobId) => ipcRenderer.invoke('work:start', { workType: jobId }),
  workCancel: () => ipcRenderer.invoke('work:cancel'),
  workStatus: () => ipcRenderer.invoke('work:status'),
  workFinish: () => ipcRenderer.invoke('work:finish'),
  workGetJobs: () => ipcRenderer.invoke('work:jobs'),

  // ─── 小游戏 ───
  minigameList: () => ipcRenderer.invoke('minigame:list'),
  minigameStart: (gameId) => ipcRenderer.invoke('minigame:start', { gameType: gameId }),
  minigameFinish: (gameId, score) => ipcRenderer.invoke('minigame:finish', { gameType: gameId, score }),
  minigameGetRecords: () => ipcRenderer.invoke('minigame:records'),
  minigameRps: (playerChoice, bet) => ipcRenderer.invoke('minigame:rps', { playerChoice, bet }),
  minigameReward: (gameType, hitCount) => ipcRenderer.invoke('minigame:reward', { gameType, hitCount }),

  // ─── 等级/进化 ───
  petGetLevelInfo: () => ipcRenderer.invoke('pet:level-info'),
  petEvolve: (evolutionType) => ipcRenderer.invoke('pet:evolve', { evolutionType }),

  // ─── 用户信息 ───
  userInfo: () => ipcRenderer.invoke('user:info'),
  userUpdate: (data) => ipcRenderer.invoke('user:update', data),

  // ─── 事件 ───
  eventTrigger: (eventId) => ipcRenderer.invoke('event:trigger', { eventType: eventId }),
  eventGetFestival: () => ipcRenderer.invoke('event:festival'),

  // ─── 任务/成就 ───
  questGetDaily: () => ipcRenderer.invoke('quest:daily'),
  questClaim: (questId) => ipcRenderer.invoke('quest:claim', { taskId: questId }),
  questGetAchievements: () => ipcRenderer.invoke('quest:achievements'),
  questAchievementClaim: (achievementId) => ipcRenderer.invoke('quest:achievement-claim', { achievementId }),

  // ─── 技能 ───
  skillGetList: () => ipcRenderer.invoke('skill:list'),
  skillUse: (skillId) => ipcRenderer.invoke('skill:use', { skillType: skillId }),

  // ─── 多语言 ───
  i18nGetLocale: () => ipcRenderer.invoke('i18n:get-locale'),
  i18nSetLocale: (locale) => ipcRenderer.invoke('i18n:set-locale', { locale }),
  i18nT: (key, params) => ipcRenderer.invoke('i18n:t', { key, params }),
  i18nGetSupported: () => ipcRenderer.invoke('i18n:get-supported'),

  // ─── 系统 ───
  resetSave: () => ipcRenderer.invoke('system:reset-save'),

  // ─── 主题 ───
  themeGet: () => ipcRenderer.invoke('theme:get'),
  themeSet: (themeId) => ipcRenderer.invoke('theme:set', { themeId }),
  themePurchase: (themeId) => ipcRenderer.invoke('theme:purchase', { themeId }),
  themeGetOwned: () => ipcRenderer.invoke('theme:owned-list'),
});
