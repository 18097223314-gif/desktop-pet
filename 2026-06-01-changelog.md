# 爪爪桌宠 — 2026-06-01 操作日志

> 执行人：齐活林（交付总监）/ 爪爪桌宠项目
> 审查对象：马维斯
> 日志时间：2026-06-01 15:30

---

## 一、属性归零 Bug 修复（pet-engine.js）

### 问题描述
宠物核心属性（hunger/energy/cleanliness/health）启动时全为 0。根因：`_tick` 衰减逻辑使用 `Math.max(0, ...)`，叠加离线补偿 multiplier（最高 60 倍），属性被衰至 0 后由 `_saveState` 写入 localStorage，下次 `_loadState` 读到全是 0。

### 修复方案（三层防御）

**1. `_loadState` 异常恢复**
- 检测核心属性全为 0 时判定存档损坏
- 自动重置为默认值，输出 `[PetEngine][LOAD] 检测到存档损坏` 警告日志
- 位置：`assets/pet-engine.js`

**2. `_saveState` 零值保护**
- 写入 localStorage 前检测核心属性是否全为 0
- 全为 0 时拒绝写入，输出 `[PetEngine][SAVE] 零值保护` 警告日志
- 位置：`assets/pet-engine.js`

**3. `_tick` 衰减下限**
- 所有衰减路径 `Math.max(0, ...)` → `Math.max(5, ...)`
- 包括 hunger/happy/energy/cleanliness 基础衰减
- 包括疾病/饥饿/疲惫对 health 的影响路径
- 位置：`assets/pet-engine.js`

### 附加调试日志
- `_saveState` 添加 `[PetEngine][SAVE]` console.log
- `_loadState` 添加 `[PetEngine][LOAD]` console.log
- 注：调试日志已在用户确认修复后保留，便于后续排查

---

## 二、DevTools 调试入口（main.js）

### 问题描述
右键菜单被 `context-menu.js` 覆盖，无默认"检查"选项；快捷键 F12/Ctrl+Shift+I 也不生效。

### 修复
- 在 `main.js` 窗口创建后添加：`petWindow.webContents.openDevTools({ mode: 'detach' })`
- 启动时自动弹出独立 DevTools 窗口

---

## 三、动画过渡修复（animation-system.js）

### 问题描述
点击睡觉后，精灵图一直循环播放 `begin`（Row1，入睡过渡动画），未切换到 `sleep`（Row4，睡着循环动画）。

### 修复方案
- 新增三个状态标记：`oneShotPending`、`oneShotTarget`、`oneShotStarted`
- `setStatus('sleep')` 时先播 `begin` 一圈
- 在 `tick` 中检测帧回到 0（一圈播完），自动切换到 `sleep` 循环
- 可扩展同逻辑到 wakeup 过渡

---

## 四、IPC 通道全链路修复（preload.js 重写）

### 问题描述
**关键 Bug**：`preload.js` IPC 通道名使用点号分隔（`pet.feed`, `economy.buy`），但 `constants.js`/`ipc-handlers.js` 注册使用冒号分隔（`pet:feed`, `economy:buy`）。命名不匹配导致**所有业务 IPC 通信静默失败**——道具包、宠物交互、经济系统、签到、打工等功能全部无法使用。

此外，`preload.js` 缺失签到、打工、小游戏、等级/进化、用户信息、事件、任务/成就、技能等模块的全部通道。

### 修复内容

**已修复的通道名（点号→冒号）**：

| 旧名（错误） | 新名（正确） | 模块 |
|---|---|---|
| `pet.feed` | `pet:feed` | 宠物 |
| `pet.pet` | `pet:pet` | 宠物 |
| `pet.play` | `pet:wash` | 宠物（修正为洗澡） |
| `pet.sleep` | `pet:status` | 宠物（修正为状态查询） |
| `pet.get-status` | `pet:status` | 宠物 |
| `economy.buy` | `economy:buy` | 经济 |
| `economy.get-inventory` | `economy:inventory` | 经济 |
| `economy.get-shop` | `economy:shop` | 经济 |
| `economy.get-coins` | `economy:balance` | 经济 |
| `economy.use-item` | `economy:useItem` | 经济 |

**新增通道（31个）**：

| API 方法 | 通道名 | 模块 |
|---|---|---|
| signinCheck | `signin:check` | 签到 |
| signinClaim | `signin:claim` | 签到 |
| signinGetInfo | `signin:info` | 签到 |
| workStart | `work:start` | 打工 |
| workCancel | `work:cancel` | 打工 |
| workStatus | `work:status` | 打工 |
| workFinish | `work:finish` | 打工 |
| workGetJobs | `work:jobs` | 打工 |
| minigameList | `minigame:list` | 小游戏 |
| minigameStart | `minigame:start` | 小游戏 |
| minigameFinish | `minigame:finish` | 小游戏 |
| minigameGetRecords | `minigame:records` | 小游戏 |
| petGetLevelInfo | `pet:level-info` | 等级 |
| petEvolve | `pet:evolve` | 进化 |
| userInfo | `user:info` | 用户 |
| userUpdate | `user:update` | 用户 |
| eventTrigger | `event:trigger` | 事件 |
| eventGetFestival | `event:festival` | 事件 |
| questGetDaily | `quest:daily` | 任务 |
| questClaim | `quest:claim` | 任务 |
| questGetAchievements | `quest:achievements` | 成就 |
| questAchievementClaim | `quest:achievement-claim` | 成就 |
| skillGetList | `skill:list` | 技能 |
| skillUse | `skill:use` | 技能 |

**注意**：换装系统（dressup）和主题系统（theme）的 IPC handler 在 `ipc-handlers.js` 中未注册，preload 中的对应通道暂不生效。

---

## 五、道具包余额后端对接（inventory.html）

### 修改内容
1. 新增 `refreshCoins()` 函数：通过 `window.petAPI.economyGetCoins()` → `economy:balance` 通道从后端拉取余额
2. 初始化改为 async boot：先 `await refreshCoins()` 再 `renderItems()`
3. 使用物品后不再信任本地返回值，重新 `await refreshCoins()` 拉最新余额

---

## 六、签到/打工 UI 入口（多文件）

### 修改文件

**1. src/main/index.js（主进程右键菜单）**
- 在菜单模板中添加"📅 签到"和"💼 打工"项
- 签到 action → `signin`
- 打工 action → `work`

**2. renderer/components/context-menu.js（渲染层右键菜单）**
- 同步添加"签到"（icon-newspaper.svg）和"打工"（icon-paw.svg）菜单项

**3. renderer/pet-controller.js（回调处理）**
- `signin` 回调：调用 `window.petAPI.signinClaim()` → 气泡显示连续签到天数或失败提示
- `work` 回调：调用 `window.petAPI.openPanel('work')` 打开打工面板

**4. renderer/panels/work.html（新建）**
- 完整打工面板，520×480px
- 功能：
  - 从后端拉打工列表（`work:jobs`）和当前状态（`work:status`）
  - 显示 8 种工作（按等级解锁）、持续时间、体力消耗、金币奖励
  - 活跃打工倒计时显示
  - 取消打工（`work:cancel`）/ 完成打工（`work:finish`）按钮
  - Toast 提示状态变化
  - 本地数据兜底（后端不可达时显示本地 JOBS 配置）

---

## 七、修改文件清单

| 序号 | 文件路径（相对项目根） | 操作 | 说明 |
|------|----------------------|------|------|
| 1 | `assets/pet-engine.js` | 编辑 | 属性归零三层防御 + 调试日志 |
| 2 | `main.js` | 编辑 | 添加 DevTools 自动打开 |
| 3 | `renderer/components/animation-system.js` | 编辑 | sleep 动画 one-shot→loop 过渡 |
| 4 | `renderer/preload.js` | **重写** | IPC 通道名全对正 + 新增 31 个通道 |
| 5 | `renderer/panels/inventory.html` | 编辑 | 余额从后端读、用后刷新 |
| 6 | `renderer/panels/work.html` | **新建** | 打工面板（约 340 行） |
| 7 | `renderer/pet-controller.js` | 编辑 | 添加 signin/work 右键回调 |
| 8 | `renderer/components/context-menu.js` | 编辑 | 添加签到/打工菜单项 |
| 9 | `src/main/index.js` | 编辑 | 主进程右键菜单加签到/打工项 |

**合计**：编辑 8 个文件，新建 1 个文件，重写 1 个文件（preload.js）。

---

## 八、已知问题与待办

### 已知问题
1. **换装/主题 IPC 未注册**：`dressup:*` 和 `theme:*` 通道在 `ipc-handlers.js` 中无对应 handler，preload 中的映射暂不生效
2. **双持久化架构潜在冲突**：`pet-engine.js` 使用 localStorage（渲染进程），`save-manager.js` 使用 SQLite（主进程），两套存档系统独立运行，可能存在数据不一致
3. **main.js 已过时**：`package.json` 的 `"main"` 字段指向 `src/main/index.js`（完整版），`main.js`（旧版）不再作为入口，但 DevTools 代码添加在 `main.js` 中——需迁移到 `src/main/index.js`

### 待办
1. 在 `src/main/index.js` 中添加 DevTools 自动打开（替代 main.js 中的修改）
2. 注册换装/主题 IPC handler 或从 preload 移除未实现的通道
3. 统一 localStorage 和 SQLite 双持久化架构
4. 清理 pet-engine.js 中的调试 console.log（用户确认后可移除）

---

*日志生成时间：2026-06-01 15:30*
*项目名称：爪爪桌宠（Electron 28 + Canvas 2D + SQLite/sql.js）*
*项目路径：D:/workbuddy/2026-05-30-11-30-24/desktop-pet/*
