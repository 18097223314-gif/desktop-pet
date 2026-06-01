// ══════════════════════════════════════════════
// index.js — 爪爪桌宠 Electron 主进程入口
// 替代原 main.js，保留窗口管理逻辑，初始化所有后端模块
// ══════════════════════════════════════════════

'use strict';

const { app, BrowserWindow, screen, ipcMain, globalShortcut, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// ─── 简易设置存储（替代 ESM-only 的 electron-store）─────────
class SimpleStore {
  constructor() {
    this._path = null;
    this.data = {};
  }
  _ensurePath() {
    if (!this._path) {
      this._path = path.join(app.getPath('userData'), 'settings.json');
      try {
        if (fs.existsSync(this._path)) {
          this.data = JSON.parse(fs.readFileSync(this._path, 'utf-8'));
        }
      } catch (e) { this.data = {}; }
    }
  }
  get(key, defaultValue) {
    this._ensurePath();
    const keys = key.split('.');
    let val = this.data;
    for (const k of keys) {
      if (val == null) return defaultValue;
      val = val[k];
    }
    return val !== undefined ? val : defaultValue;
  }
  set(key, value) {
    this._ensurePath();
    const keys = key.split('.');
    let obj = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]]) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this._save();
  }
  _save() {
    if (!this._path) return;
    try {
      fs.writeFileSync(this._path, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) { console.error('[Store] 保存失败:', e.message); }
  }
}
const store = new SimpleStore();
const PetDatabase = require('./database');
const Timer = require('./timer');
const PetAI = require('./pet-ai');
const Economy = require('./economy');
const SkillSystem = require('./skill');
const QuestSystem = require('./quest');
const WorkSystem = require('./work');
const EventManager = require('./event-manager');
const TimeManager = require('./time-manager');
const SaveManager = require('./save-manager');
const SignInSystem = require('./sign-in');
const MiniGameManager = require('./mini-game');
const IPCHandlers = require('./ipc-handlers');
const { IPC_CHANNELS } = require('./constants');

// ─── 后端模块 ─────────────────────────────────
let petWindow = null;    // 主角色窗口
let panelWindows = {};   // 面板窗口 { settings, dressUp, inventory, theme }

// ═══ 后端模块实例（延迟初始化）═══
let database = null;
let timer = null;
let petAI = null;
let economy = null;
let skillSystem = null;
let questSystem = null;
let workSystem = null;
let eventManager = null;
let timeManager = null;
let saveManager = null;
let signInSystem = null;
let miniGameManager = null;
let ipcHandlers = null;
let statusPushInterval = null;

// ══════════════════════════════════════════════
// 窗口管理（从原 main.js 保留）
// ══════════════════════════════════════════════

/**
 * 获取多显示器安全区域
 */
function getScreenBounds() {
  const primary = screen.getPrimaryDisplay();
  return primary.workArea;
}

/**
 * 创建主角色窗口
 */
function createPetWindow() {
  const bounds = getScreenBounds();

  petWindow = new BrowserWindow({
    width: 260,
    height: 320,
    x: bounds.x + bounds.width / 2 - 130,
    y: bounds.y + bounds.height - 350,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', '..', 'renderer', 'preload.js'),
    },
  });

  petWindow.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  petWindow.setIgnoreMouseEvents(false);

  // 开发模式打开 DevTools
  if (process.argv.includes('--dev')) {
    petWindow.webContents.openDevTools({ mode: 'detach' });
  }

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

/**
 * 创建面板窗口（通用工厂）
 */
function createPanelWindow(panelName, options = {}) {
  if (panelWindows[panelName]) {
    panelWindows[panelName].close();
    panelWindows[panelName] = null;
  }

  const bounds = getScreenBounds();
  const defaultOpts = {
    width: 520,
    height: 480,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    hasShadow: true,
    show: false,
    modal: false,
    x: bounds.x + (bounds.width - 520) / 2,
    y: bounds.y + (bounds.height - 480) / 2,
    backgroundColor: 'transparent',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', '..', 'renderer', 'preload.js'),
    },
  };

  const win = new BrowserWindow({ ...defaultOpts, ...options });
  win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'panels', `${panelName}.html`));

  win.once('ready-to-show', () => {
    win.show();
    win.webContents.send(IPC_CHANNELS.PANEL_ANIMATE_IN);
  });

  win.on('closed', () => {
    panelWindows[panelName] = null;
  });

  panelWindows[panelName] = win;
  return win;
}

// ══════════════════════════════════════════════
// 基础 IPC 处理器（窗口管理，使用 IPC_CHANNELS 常量）
// ══════════════════════════════════════════════

function registerBaseIPCHandlers() {
  // 打开面板
  ipcMain.handle(IPC_CHANNELS.OPEN_PANEL, (event, panelName) => {
    createPanelWindow(panelName);
  });

  // 关闭当前面板
  ipcMain.on(IPC_CHANNELS.CLOSE_PANEL, (event) => {
    event.sender.send(IPC_CHANNELS.PANEL_ANIMATE_OUT);
    setTimeout(() => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) win.close();
    }, 200);
  });

  // 获取用户设置（兼容旧接口）
  ipcMain.handle(IPC_CHANNELS.GET_SETTINGS, () => {
    return store.get('settings', {});
  });

  // 保存用户设置（兼容旧接口）
  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, (event, settings) => {
    store.set('settings', settings);
    return true;
  });

  // 获取所有显示器信息
  ipcMain.handle(IPC_CHANNELS.GET_DISPLAYS, () => {
    return screen.getAllDisplays().map(d => ({
      id: d.id,
      bounds: d.bounds,
      workArea: d.workArea,
      isPrimary: d.bounds === screen.getPrimaryDisplay().bounds,
    }));
  });

  // 获取系统时间
  ipcMain.handle(IPC_CHANNELS.GET_SYSTEM_TIME, () => {
    return Date.now();
  });

  // ─── 窗口拖拽（自定义拖拽，替代 -webkit-app-region: drag）───
  ipcMain.on('move-window', (event, { deltaX, deltaY }) => {
    if (petWindow && !petWindow.isDestroyed()) {
      const [x, y] = petWindow.getPosition();
      petWindow.setPosition(x + deltaX, y + deltaY);
    }
  });

  // ─── 右键菜单（原生 Menu，避免小窗口内被裁切）───
  ipcMain.on('show-context-menu', (event) => {
    const template = [
      { label: '👋 打招呼', click: () => event.sender.send('context-menu-action', 'wave') },
      { label: '💃 跳舞',   click: () => event.sender.send('context-menu-action', 'dance') },
      { label: '😴 睡觉',   click: () => event.sender.send('context-menu-action', 'sleep') },
      { type: 'separator' },
      { label: '👗 换装',   click: () => event.sender.send('context-menu-action', 'dressUp') },
      { label: '🎒 道具包', click: () => event.sender.send('context-menu-action', 'inventory') },
      { type: 'separator' },
      { label: '⚙️ 设置',   click: () => event.sender.send('context-menu-action', 'settings') },
      { type: 'separator' },
      { label: '🚪 退出',   click: () => app.quit() },
    ];
    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
  });
}

// ══════════════════════════════════════════════
// 后端模块初始化（按依赖注入顺序）
// ══════════════════════════════════════════════

async function initBackendModules() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'pet.db');

  // 1. 数据库（sql.js 初始化是异步的）
  database = new PetDatabase(dbPath);
  await database.init();

  // 2. 定时器
  timer = new Timer();

  // 3. 经济系统（PetAI 依赖 economy，所以先初始化）
  economy = new Economy(database);

  // 4. 技能系统（PetAI 依赖 skillSystem 用于进化技能注册，所以先初始化）
  skillSystem = new SkillSystem(database);

  // 5. 宠物AI（需要 database, 事件推送器, timer, economy, skillSystem）
  // 事件推送器：通过 petWindow.webContents 发送消息
  const eventEmitter = {
    send: (channel, data) => {
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send(channel, data);
      }
    },
  };
  petAI = new PetAI(database, eventEmitter, timer, economy, skillSystem);
  petAI.init();

  // 旧存档兼容检测：level >= 20 且未进化 → 延迟 3 秒后自动触发进化就绪事件
  setTimeout(() => {
    try {
      const levelInfo = petAI.getLevelInfo();
      if (levelInfo.level >= 20 && !levelInfo.evolutionType) {
        console.log('[Main] 检测到旧存档（Lv20 未进化），触发进化就绪');
        petAI._checkEvolutionReady();
      }
    } catch (err) {
      console.warn('[Main] 旧存档兼容检测失败:', err.message);
    }
  }, 3000);

  // 6. 任务系统
  questSystem = new QuestSystem(database);

  // 7. 打工系统
  workSystem = new WorkSystem(database, economy, timer);

  // 8. 时间管理
  timeManager = new TimeManager(database);

  // 9. 随机事件管理（传入 sendNotification 回调，不再内部 require electron）
  const sendNotification = (channel, data) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send(channel, data);
    }
  };
  eventManager = new EventManager(database, petAI, timer, sendNotification);
  eventManager.init();

  // 10. 签到系统（独立于 quest，使用 economy 发放道具）
  signInSystem = new SignInSystem(database, economy);

  // 11. 小游戏管理器
  miniGameManager = new MiniGameManager(database, economy, timer);

  // 12. 存档管理（传入所有可保存组件）
  saveManager = new SaveManager(database, petAI, {
    economy,
    questSystem,
    workSystem,
    skillSystem,
    signInSystem,
    miniGameManager,
  });
  saveManager.init(userDataPath);

  // 13. IPC 处理器
  ipcHandlers = new IPCHandlers({
    database,
    petAI,
    economy,
    questSystem,
    workSystem,
    skillSystem,
    saveManager,
    timeManager,
    signInSystem,
    miniGameManager,
    eventManager,
    store,
  });
  ipcHandlers.register();

  // 14. 启动状态推送（每3秒向 renderer 推送宠物状态）
  statusPushInterval = setInterval(() => {
    if (petWindow && !petWindow.isDestroyed()) {
      const status = petAI.getStatus();
      petWindow.webContents.send(IPC_CHANNELS.PET_STATE_PUSH, status);
    }
  }, 3000);

  console.log('[Main] 所有后端模块初始化完成');
}

// ══════════════════════════════════════════════
// 应用生命周期
// ══════════════════════════════════════════════

app.whenReady().then(() => {
  // 创建主窗口
  createPetWindow();

  // 注册基础 IPC 处理器（窗口管理等）
  registerBaseIPCHandlers();

  // 初始化所有后端模块
  initBackendModules();

  // 开机自启
  const autoLaunch = store.get('settings.autoLaunch', false);
  app.setLoginItemSettings({
    openAtLogin: autoLaunch,
    name: '爪爪桌宠',
  });

  // 全局快捷键：隐藏/显示桌宠
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    if (petWindow) {
      petWindow.isVisible() ? petWindow.hide() : petWindow.show();
    }
  });

  console.log('[Main] 爪爪桌宠启动完成');
});

// 所有窗口关闭
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (petWindow === null) {
    createPetWindow();
  }
});

// 应用退出前保存
app.on('before-quit', () => {
  console.log('[Main] 应用即将退出，保存数据...');

  // 强制保存
  if (saveManager) {
    saveManager.forceSave();
  }

  // 停止状态推送
  if (statusPushInterval) {
    clearInterval(statusPushInterval);
  }

  // 销毁所有定时器
  if (timer) {
    timer.destroyAll();
  }

  // 关闭数据库
  if (database) {
    database.close();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
