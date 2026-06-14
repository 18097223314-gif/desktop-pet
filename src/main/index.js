// ══════════════════════════════════════════════
// index.js — 爪爪桌宠 Electron 主进程入口
// 替代原 main.js，保留窗口管理逻辑，初始化所有后端模块
// ══════════════════════════════════════════════

'use strict';

const { app, BrowserWindow, screen, ipcMain, globalShortcut, Menu, Tray, nativeImage } = require('electron');
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
      } catch (e) {
        console.warn('[Store] settings.json 解析失败，已重置:', e.message);
        try {
          fs.copyFileSync(this._path, this._path + '.corrupted');
        } catch (_) {}
        this.data = {};
      }
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
    } catch (e) {
      console.error('[Store] 保存失败:', e.message);
    }
  }
}
// ─── 全局异常处理 ───────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
});

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
const { IPC_CHANNELS, STATUS_PUSH_INTERVAL, DEFAULT_STAT_VALUE } = require('./constants');
const { PET_CONTEXT_MENU, TRAY_MENU_ITEMS } = require('./menu-def');
const performance = require('./performance');
const logger = require('./logger');
const i18n = require('./i18n');

// ─── 后端模块 ─────────────────────────────────
let petWindow = null; // 主角色窗口
const panelWindows = {}; // 面板窗口 { settings, dressUp, inventory, theme }
let tray = null; // 系统托盘
let isQuitting = false; // 退出标志：true 时 petWindow.close 不再 preventDefault
let backendReady = false; // 后端初始化完成标志

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

  // 关闭窗口时隐藏到托盘，不退出（除非正在退出应用）
  petWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      petWindow.hide();
    }
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

  // 面板自定义尺寸
  const PANEL_SIZES = {
    inventory: { width: 560, height: 460 },
    status: { width: 480, height: 520 },
    work: { width: 520, height: 480 },
    'mini-game': { width: 520, height: 480 },
    settings: { width: 520, height: 480 },
    theme: { width: 520, height: 480 },
  };

  const size = PANEL_SIZES[panelName] || { width: 520, height: 480 };
  const defaultOpts = {
    width: size.width,
    height: size.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    hasShadow: true,
    show: false,
    modal: false,
    x: bounds.x + (bounds.width - size.width) / 2,
    y: bounds.y + (bounds.height - size.height) / 2,
    backgroundColor: 'transparent',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', '..', 'renderer', 'preload.js'),
    },
  };

  const win = new BrowserWindow({ ...defaultOpts, ...options });
  win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'panels', `${panelName}.html`));
  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

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
// 系统托盘
// ══════════════════════════════════════════════

function createTray() {
  // 从精灵图裁 idle 帧 (row 0, col 0, 64x64) 缩放到 16x16
  const spritePath = path.join(__dirname, '..', '..', 'assets', 'characters', 'cat', 'spritesheet.png');
  try {
    const fullImage = nativeImage.createFromFileSync(spritePath);
    // 裁切第一帧 64x64
    const cropped = fullImage.getCroppedImage({ x: 0, y: 0, width: 64, height: 64 });
    // 缩放到托盘图标尺寸
    const trayImage = cropped.resize({ width: 16, height: 16 });
    tray = new Tray(trayImage);
  } catch (e) {
    console.warn('[Tray] 无法从精灵图创建托盘图标:', e.message);
    // 降级：用 Electron 默认托盘
    tray = new Tray(nativeImage.createEmpty());
  }

  // 从 menu-def.js 读取托盘菜单定义，统一走 handleMenuAction
  const trayTemplate = [];
  for (const item of TRAY_MENU_ITEMS) {
    if (item.type === 'separator') {
      trayTemplate.push({ type: 'separator' });
    } else {
      trayTemplate.push({
        label: item.label,
        click: () => handleMenuAction(item.action),
      });
    }
  }
  // 🔧 开发模式：托盘加 DevTools 快捷项
  if (process.argv.includes('--dev')) {
    const quitIdx = trayTemplate.findIndex((t) => t.label === '退出');
    trayTemplate.splice(
      quitIdx,
      0,
      {
        label: '🔧 打开主窗口 DevTools',
        click: () => {
          if (petWindow && !petWindow.isDestroyed()) petWindow.webContents.openDevTools({ mode: 'detach' });
        },
      },
      { type: 'separator' },
    );
  }
  const trayMenu = Menu.buildFromTemplate(trayTemplate);
  tray.setToolTip('爪爪桌宠');
  tray.setContextMenu(trayMenu);

  // 左键点击显示/隐藏
  tray.on('click', () => {
    if (petWindow) {
      petWindow.isVisible() ? petWindow.hide() : petWindow.show();
    }
  });
}

// ══════════════════════════════════════════════
// 统一菜单动作处理
// ══════════════════════════════════════════════

/**
 * 统一菜单动作入口（右键菜单 + 托盘菜单共用）
 * @param {string} action 动作标识
 */
function handleMenuAction(action) {
  switch (action) {
    // ─── 窗口控制 ───
    case '_showPet':
      if (petWindow) petWindow.show();
      break;
    case '_hidePet':
      if (petWindow) petWindow.hide();
      break;

    // ─── 宠物行为（通知 renderer 执行动画+逻辑）───
    case 'sleep':
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:menu-action', 'sleep');
      }
      break;

    // ─── 面板 ───
    case 'status':
      createPanelWindow('status');
      break;
    case 'inventory':
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:menu-action', 'inventory');
      }
      break;
    case 'signin':
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:menu-action', 'signin');
      }
      break;
    case 'work':
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:menu-action', 'work');
      }
      break;
    case 'miniGame':
      if (petWindow && !petWindow.isDestroyed()) {
        petWindow.webContents.send('pet:menu-action', 'miniGame');
      }
      break;

    // ─── 设置子菜单（打开设置面板）───
    case 'settings':
    case 'settingSound':
    case 'settingDisplay':
    case 'settingNotification':
    case 'settingAbout':
      createPanelWindow('settings');
      break;

    // ─── 退出 ───
    case 'quit':
      isQuitting = true;
      app.quit();
      break;

    default:
      console.warn('[Menu] 未知动作:', action);
  }
}

/**
 * 从 PET_CONTEXT_MENU 构建 Electron 原生右键菜单
 */
function buildNativeContextMenu() {
  const template = PET_CONTEXT_MENU.map((item) => {
    if (item.children) {
      return {
        label: item.label,
        submenu: item.children.map((child) => ({
          label: child.label,
          click: () => handleMenuAction(child.action),
        })),
      };
    }
    return {
      label: item.label,
      type: item.type,
      click: () => handleMenuAction(item.action),
    };
  });
  return Menu.buildFromTemplate(template);
}

// ══════════════════════════════════════════════
// 基础 IPC 处理器（窗口管理，使用 IPC_CHANNELS 常量）
// ══════════════════════════════════════════════

function registerBaseIPCHandlers() {
  // 打开面板
  const ALLOWED_PANELS = ['inventory', 'status', 'work', 'mini-game', 'settings', 'theme'];
  ipcMain.handle(IPC_CHANNELS.OPEN_PANEL, (event, panelName) => {
    if (!ALLOWED_PANELS.includes(panelName)) {
      return { success: false, error: '无效的面板名称' };
    }
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
  const ALLOWED_SETTINGS = ['sound', 'display', 'notification', 'language', 'theme', 'advanced'];
  ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, (event, settings) => {
    if (!settings || typeof settings !== 'object') {
      return { success: false, error: '无效的设置数据' };
    }
    // 只保留白名单内的 key
    const filtered = {};
    for (const key of Object.keys(settings)) {
      if (ALLOWED_SETTINGS.includes(key)) {
        filtered[key] = settings[key];
      }
    }
    store.set('settings', filtered);
    return true;
  });

  // 获取所有显示器信息
  ipcMain.handle(IPC_CHANNELS.GET_DISPLAYS, () => {
    return screen.getAllDisplays().map((d) => ({
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
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      const [x, y] = win.getPosition();
      win.setPosition(x + deltaX, y + deltaY);
    }
  });

  // ─── 右键菜单（Electron 原生 Menu，menu-def.js 单一来源）───
  ipcMain.on('show-context-menu-native', (event) => {
    const menu = buildNativeContextMenu();
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) menu.popup({ window: win });
  });

  // ─── 应用信息 ───
  ipcMain.handle('get-version', () => {
    try {
      const pkg = require('../../package.json');
      return pkg.version || '1.0.0';
    } catch (e) {
      console.warn('[App] 版本号读取失败:', e.message);
      return 'unknown';
    }
  });

  ipcMain.handle('get-app-path', () => {
    return app.getAppPath();
  });

  // ─── 性能监控：帧率上报（renderer 定期调用）───
  ipcMain.on(IPC_CHANNELS.PERFORMANCE_REPORT_FPS, (event, fps) => {
    performance.reportFps(fps);
  });

  // ─── 性能监控：获取状态 ───
  ipcMain.handle(IPC_CHANNELS.PERFORMANCE_GET_STATUS, () => {
    return performance.getStatus();
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

  // TODO: 上线前删除以下测试代码（金币/钻石/属性重置）
  if (process.argv.includes('--dev')) {
    database.run('UPDATE users SET gold = 99999, diamond = 99 WHERE id = 1');
    database.run(
      `UPDATE pet_status SET hunger = ${DEFAULT_STAT_VALUE}, hygiene = ${DEFAULT_STAT_VALUE}, mood = ${DEFAULT_STAT_VALUE}, stamina = ${DEFAULT_STAT_VALUE} WHERE pet_id = 1`,
    );
    console.log('[Test] 金币/钻石已重置为 99999/99，宠物属性已重置为 100');
  }

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
  // 非关键功能，失败不影响核心流程（宠物正常运行、属性衰减、互动等均不受影响）
  setTimeout(() => {
    try {
      const levelInfo = petAI.getLevelInfo();
      if (levelInfo.level >= 20 && !levelInfo.evolutionType) {
        console.log('[Main] 检测到旧存档（Lv20 未进化），触发进化就绪');
        petAI._checkEvolutionReady();
      }
    } catch (err) {
      // 降级：重置等级数据为安全默认值，确保后续升级/进化逻辑不因脏数据崩溃
      console.warn('[Main] 旧存档兼容检测失败，降级为默认等级:', err.message, err.stack);
      try {
        petAI.pet.level = Math.max(1, Number(petAI.pet.level) || 1);
        petAI.pet.exp = Math.max(0, Number(petAI.pet.exp) || 0);
        petAI.pet.evolutionType = null;
        petAI.pet.evolutionName = null;
        petAI.saveStatus();
        console.log('[Main] 等级数据已降级为安全默认值');
      } catch (resetErr) {
        console.error('[Main] 等级数据降级也失败，跳过:', resetErr.message);
      }
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
    i18n,
  });
  ipcHandlers.register();
  backendReady = true;

  // 14. 启动状态推送（每3秒向 renderer 推送宠物状态）
  statusPushInterval = setInterval(() => {
    if (petWindow && !petWindow.isDestroyed()) {
      const status = petAI.getStatus();
      petWindow.webContents.send(IPC_CHANNELS.PET_STATE_PUSH, status);
    }
  }, STATUS_PUSH_INTERVAL);

  console.log('[Main] 所有后端模块初始化完成');
}

// ══════════════════════════════════════════════
// 应用生命周期
// ══════════════════════════════════════════════

app.whenReady().then(async () => {
  // 创建托盘
  createTray();

  // 创建主窗口
  createPetWindow();

  // 注册基础 IPC 处理器（窗口管理等）
  registerBaseIPCHandlers();

  // 启用日志轮转（写入 logs/pet-YYYY-MM-DD.log，保留 7 天）
  logger.enable();

  // 初始化多语言模块
  i18n.init();

  // 启动性能监控
  performance.start();

  // 注册性能降级回调（通知 renderer）
  performance.onDowngrade((level, metrics) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send(IPC_CHANNELS.PERFORMANCE_DOWNGRADE, { level, metrics });
    }
  });
  performance.onRestore((level, metrics) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send(IPC_CHANNELS.PERFORMANCE_RESTORE, { level, metrics });
    }
  });

  // 初始化所有后端模块（await 确保业务 handler 注册完毕后再返回）
  await initBackendModules();

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

// 所有窗口关闭 → 隐藏到托盘，不退出
app.on('window-all-closed', () => {
  // 不做任何事，托盘保持运行
});

app.on('activate', () => {
  if (petWindow === null) {
    createPetWindow();
  }
});

// 应用退出前保存
app.on('before-quit', () => {
  console.log('[Main] 应用即将退出，保存数据...');

  // 设置退出标志，让 petWindow.close 不再 preventDefault
  isQuitting = true;

  // 停止性能监控
  performance.stop();

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

  // 销毁托盘（释放图标资源）
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }

  // 关闭数据库
  if (database) {
    database.close();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
