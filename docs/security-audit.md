# 安全审计报告

> 审计日期：2026-06-07  
> 审计范围：Electron 安全配置、preload 暴露面、IPC 输入校验  
> 方法：代码审查 + 配置比对

---

## 一、Electron 安全配置

| 配置项 | 设置 | 评价 |
|--------|------|------|
| nodeIntegration | false | ✅ 正确 |
| contextIsolation | true | ✅ 正确 |
| sandbox | **未设置** | ⚠️ 建议启用 |
| webSecurity | 默认 true | ✅ 正确 |
| allowRunningInsecureContent | 默认 false | ✅ 正确 |
| experimentalFeatures | 默认 false | ✅ 正确 |

### 1.1 建议启用 sandbox

`webPreferences` 中未设置 `sandbox: true`。sandbox 模式下，preload 脚本在独立的 V8 上下文中运行，即使 preload 代码有漏洞，也无法访问 Node API。

**当前风险**：低（contextIsolation 已启用），但 sandbox 是 Electron 官方推荐的纵深防御。

**建议**：
```javascript
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,  // 新增
  preload: path.join(__dirname, '..', '..', 'renderer', 'preload.js'),
}
```

**注意**：启用 sandbox 后，preload 中不能使用 `require()`，需要改用 `@electron/remote` 或在 preload 中通过 `process.resourcesPath` 加载模块。当前 preload 只用了 `require('electron')` 的 `contextBridge` 和 `ipcRenderer`，这两个在 sandbox 模式下仍然可用。

---

## 二、Preload 暴露面分析

preload.js 通过 `contextBridge.exposeInMainWorld('petAPI', {...})` 暴露了 **36 个方法**。

### 2.1 按风险分类

| 风险等级 | 方法数 | 方法列表 |
|----------|--------|----------|
| 🟢 只读/无害 | 14 | getSettings, getDisplays, getSystemTime, getVersion, getAppPath, economyGetInventory, economyGetCoins, economyGetShop, signinCheck, signinGetInfo, workStatus, workGetJobs, minigameList, minigameGetRecords, questGetDaily, questGetAchievements, skillGetList, i18nGetLocale, i18nGetSupported, userInfo |
| 🟡 写操作 | 16 | petPet, petFeed, petWash, economyUseItem, economyBuy, signinClaim, workStart, workCancel, workFinish, minigameStart, minigameFinish, minigameRps, minigameReward, questClaim, questAchievementClaim, skillUse, userUpdate, i18nSetLocale, i18nT, saveSettings |
| 🟠 高权限 | 4 | eventTrigger, petBroadcastState, openPanel, resetSave |
| 🔴 系统级 | 2 | moveWindow, showNativeContextMenu |

### 2.2 需要关注的高权限方法

#### resetSave（🔴 高风险）

```javascript
resetSave: () => ipcRenderer.invoke('system:reset-save'),
```

**问题**：删除所有用户数据（inventory、equipped、game_records、work_records、sign_in、achievements、pet_status、daily_tasks），无二次确认。

**攻击场景**：如果渲染进程被 XSS 注入，攻击者可调用 `window.petAPI.resetSave()` 一键清空所有数据。

**建议**：
1. 在渲染进程调用时增加确认弹窗（已有 ModalComponent）
2. 在主进程 handler 中增加冷却时间（如 24 小时内只能重置一次）
3. 或者将此方法从 preload 移除，只在设置面板中通过特定 UI 触发

#### eventTrigger（🟠 中风险）

```javascript
eventTrigger: (eventId) => ipcRenderer.invoke('event:trigger', eventId),
```

**问题**：可触发任意事件类型，虽然事件效果由 eventManager 控制，但如果事件有奖励（金币/道具），可被反复调用刷取。

**当前缓解**：速率限制 10 次/分钟（写操作）。

**建议**：增加事件触发冷却时间，或限制可手动触发的事件类型。

#### petBroadcastState（🟠 中风险）

```javascript
petBroadcastState: (state) => ipcRenderer.invoke('pet:broadcast-state', state),
```

**问题**：渲染进程可推送任意状态到所有窗口。如果 payload 包含恶意数据，可能影响面板窗口的显示逻辑。

**当前缓解**：主进程 handler 中 `const state = payload || this.petAI.getStatus()`，如果 payload 为 falsy 则用后端状态覆盖。

**建议**：始终用后端权威状态覆盖，忽略 payload：
```javascript
const state = this.petAI.getStatus(); // 不用 payload
```

---

## 三、IPC 输入校验

### 3.1 _wrapHandler 校验

所有 44 个业务 IPC handler 通过 `_wrapHandler` 统一封装：
- ✅ try-catch 错误捕获
- ✅ 速率限制（写 10/min、读 60/min、其他 30/min）
- ✅ 统一返回格式 `{ success, data, error, requestId }`

### 3.2 输入校验现状

| 校验类型 | 覆盖情况 | 评价 |
|----------|----------|------|
| userId 校验 | `_getUserId()` 统一校验 | ✅ |
| itemId 校验 | L179-181 检查非空 | ✅ |
| bet 金额校验 | playRps 中检查 ≥10 ≤1000 | ✅ |
| gameType 校验 | playRps 中检查白名单 | ✅ |
| workType 校验 | startWork 中查表验证 | ✅ |
| score 校验 | finishGame 中检查 ≥0 | ✅ |
| eventType 校验 | **未校验** | ⚠️ |
| panelName 校验 | **未校验** | ⚠️ |
| locale 校验 | i18n handler 中查白名单 | ✅ |
| settings 校验 | **未校验**（直接写入） | ⚠️ |

### 3.3 缺失校验项

#### panelName 未校验

```javascript
// index.js
ipcMain.handle(IPC_CHANNELS.OPEN_PANEL, (event, panelName) => {
  // panelName 直接用于路径拼接
  panelWindows[name] = createPanelWindow(name, ...);
});
```

**风险**：如果 panelName 包含 `../` 等路径遍历字符，可能加载非预期的 HTML 文件。

**建议**：增加白名单校验：
```javascript
const ALLOWED_PANELS = ['inventory', 'status', 'work', 'mini-game', 'settings', 'theme'];
if (!ALLOWED_PANELS.includes(panelName)) {
  return { success: false, error: '无效的面板名称' };
}
```

#### eventType 未校验

```javascript
this._wrapHandler(IPC_CHANNELS.EVENT_TRIGGER, (payload) => {
  const eventType = payload?.eventType || null;
  if (eventType) {
    return this.eventManager.executeEvent(eventType);
  }
});
```

**风险**：可传入任意 eventType 字符串。

**建议**：在 eventManager.executeEvent 中校验 eventType 是否在已知事件列表中。

#### settings 未校验

```javascript
ipcMain.handle(IPC_CHANNELS.SAVE_SETTINGS, (event, settings) => {
  // settings 直接写入 SimpleStore
  for (const [key, value] of Object.entries(settings)) {
    store.set(key, value);
  }
});
```

**风险**：可写入任意 key-value 到 settings.json。

**建议**：校验 key 是否在已知设置项白名单中。

---

## 四、其他安全发现

### 4.1 无 CSP（Content Security Policy）

index.html 和面板 HTML 文件没有设置 Content Security Policy。如果渲染进程被注入恶意脚本，没有 CSP 限制其行为。

**建议**：在 index.html 中添加：
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;">
```

### 4.2 面板窗口共用 preload

所有面板窗口（inventory、settings、work 等）共用同一个 preload.js，拥有相同的 36 个 API。面板窗口的 HTML 文件通过 `<script>` 标签加载内联 JS，如果面板 HTML 被篡改，攻击面与主窗口相同。

**建议**：为面板窗口创建最小化 preload（只暴露面板所需的 API）。

### 4.3 moveWindow 无速率限制

```javascript
ipcMain.on('move-window', (event, { deltaX, deltaY }) => {
  // 直接移动窗口，无速率限制
});
```

**风险**：渲染进程可无限频率调用 moveWindow，可能导致主进程忙于处理窗口移动事件。

**建议**：在 preload 侧增加节流（throttle），或在主进程侧增加速率限制。

---

## 五、审计总结

| 类别 | 状态 | 数量 |
|------|------|------|
| ✅ 合格 | 无问题 | 12 项 |
| ⚠️ 建议改进 | 低风险 | 6 项 |
| 🔴 需修复 | 中高风险 | 3 项 |

### 优先修复顺序

| 优先级 | 项目 | 工作量 |
|--------|------|--------|
| P0 | panelName 白名单校验 | 5 分钟 |
| P0 | settings key 白名单校验 | 10 分钟 |
| P1 | resetSave 增加确认/冷却 | 15 分钟 |
| P1 | petBroadcastState 始终用后端状态 | 5 分钟 |
| P2 | eventType 校验 | 5 分钟 |
| P2 | 添加 CSP meta 标签 | 10 分钟 |
| P3 | 启用 sandbox | 需测试验证 |
| P3 | 面板窗口最小化 preload | 架构调整 |

### 整体评价

安全基础扎实（contextIsolation + contextBridge + 速率限制），主要风险在于部分 IPC 通道缺少输入校验和 resetSave 无确认机制。建议按优先级逐步加固。
