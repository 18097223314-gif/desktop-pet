// ══════════════════════════════════════════════
// Electron 主进程 — 爪爪桌宠
// 负责创建透明置顶窗口、面板窗口管理、IPC通信
// ══════════════════════════════════════════════

const { app, BrowserWindow, screen, ipcMain, nativeDisplay } = require('electron');
const path = require('path');
const Store = require('electron-store');

// 用户设置持久化
const store = new Store();

// ═══ 全局引用 ═══
let petWindow = null;    // 主角色窗口
let panelWindows = {};   // 面板窗口 { settings, dressUp, inventory, theme }

// ═══ 获取多显示器安全区域 ═══
function getScreenBounds() {
  const primary = screen.getPrimaryDisplay();
  return primary.workArea;
}

// ═══ 创建主角色窗口 ═══
function createPetWindow() {
  const bounds = getScreenBounds();

  petWindow = new BrowserWindow({
    width: 200,
    height: 220,
    x: bounds.x + bounds.width / 2 - 100,
    y: bounds.y + bounds.height - 250,
    frame: false,            // 无边框
    transparent: true,       // 透明背景
    alwaysOnTop: true,       // 始终置顶
    skipTaskbar: true,       // 不在任务栏显示
    resizable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'renderer', 'preload.js'),
    },
  });

  // 加载主窗口 HTML
  petWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // 透明背景：点击穿透到桌面（由渲染进程处理）
  petWindow.setIgnoreMouseEvents(false);

  // 开发模式打开 DevTools
  if (process.argv.includes('--dev')) {
    petWindow.webContents.openDevTools({ mode: 'detach' });
  }

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

// ═══ 创建面板窗口（通用工厂）════
function createPanelWindow(panelName, options = {}) {
  // 如果已打开先关闭
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
    show: false,  // 先隐藏，加载完成后动画显示
    modal: false,
    x: bounds.x + (bounds.width - 520) / 2,
    y: bounds.y + (bounds.height - 480) / 2,
    backgroundColor: 'transparent',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'renderer', 'preload.js'),
    },
  };

  const win = new BrowserWindow({ ...defaultOpts, ...options });

  // 加载面板 HTML
  win.loadFile(path.join(__dirname, 'renderer', 'panels', `${panelName}.html`));

  // 加载完成后带入场动画显示
  win.once('ready-to-show', () => {
    win.show();
    win.webContents.send('panel-animate-in');
  });

  win.on('closed', () => {
    panelWindows[panelName] = null;
  });

  panelWindows[panelName] = win;
  return win;
}

// ═══ IPC 处理器 ═══

// 打开面板
ipcMain.handle('open-panel', (event, panelName) => {
  createPanelWindow(panelName);
});

// 关闭当前面板
ipcMain.on('close-panel', (event) => {
  event.sender.send('panel-animate-out');
  setTimeout(() => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  }, 200);
});

// 获取用户设置
ipcMain.handle('get-settings', () => {
  return store.get('settings', {});
});

// 保存用户设置
ipcMain.handle('save-settings', (event, settings) => {
  store.set('settings', settings);
  return true;
});

// 获取所有显示器信息（多显示器支持）
ipcMain.handle('get-displays', () => {
  return screen.getAllDisplays().map(d => ({
    id: d.id,
    bounds: d.bounds,
    workArea: d.workArea,
    isPrimary: d.bounds === screen.getPrimaryDisplay().bounds,
  }));
});

// 获取系统时间
ipcMain.handle('get-system-time', () => {
  return Date.now();
});

// ═══ 应用生命周期 ═══

app.whenReady().then(() => {
  createPetWindow();

  // 开机自启（通过设置面板控制）
  const autoLaunch = store.get('settings.autoLaunch', false);
  app.setLoginItemSettings({
    openAtLogin: autoLaunch,
    name: '爪爪桌宠',
  });
});

// 所有窗口关闭
app.on('window-all-closed', () => {
  // macOS 除外
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (petWindow === null) {
    createPetWindow();
  }
});

// 全局快捷键：隐藏/显示桌宠
app.whenReady().then(() => {
  const { globalShortcut } = require('electron');
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    if (petWindow) {
      petWindow.isVisible() ? petWindow.hide() : petWindow.show();
    }
  });
});

app.on('will-quit', () => {
  require('electron').globalShortcut.unregisterAll();
});
