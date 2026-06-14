# 爪爪桌宠 · 系统架构文档

> 版本：v2.0  
> 日期：2026-06-07  
> 项目路径：`D:\workbuddy\2026-05-30-11-30-24\desktop-pet\`

---

## 一、项目概述

类 QQ 宠物桌面精灵，Electron 构建，目标上架 Steam。  
技术栈：Electron 28 + sql.js（纯 JS SQLite）+ Canvas 2D 精灵图动画。  
代码量：~11000 行 / 70+ 文件。  
当前阶段：Phase 3 基本完成（四款小游戏、测试框架、面板系统），Phase 4 进行中（Steam 适配）。

---

## 二、目录结构

```
desktop-pet/
├── package.json                    # 入口 src/main/index.js，Electron 28 + sql.js
├── start.bat                       # 启动脚本
│
├── src/main/                       # 后端（Electron 主进程）
│   ├── index.js                    # 主进程入口：窗口管理 + 模块初始化 + 生命周期
│   ├── constants.js                # 全局常量：IPC 频道名、行为阈值、货币初始值等
│   ├── database.js                 # sql.js 封装：内存数据库 + 文件持久化 + 迁移
│   ├── timer.js                    # 可暂停定时器管理
│   ├── pet-ai.js                   # 宠物 AI：行为树 + 情绪状态机 + 属性衰减
│   ├── economy.js                  # 经济系统：金币/钻石/好感币 + 道具 + 背包
│   ├── quest.js                    # 每日任务 + 成就系统
│   ├── skill.js                    # 9 种技能 + 熟练度
│   ├── work.js                     # 打工系统：8 种工作
│   ├── sign-in.js                  # 每日签到 + 连续奖励
│   ├── mini-game.js                # 小游戏管理：猜拳/接食物/记忆翻牌/节奏点击
│   ├── event-manager.js            # 随机事件系统：30 种事件
│   ├── time-manager.js             # 时间感知 + 14 种节日检测
│   ├── save-manager.js             # 脏标记自动存档 + 异常恢复
│   ├── ipc-handlers.js             # IPC 通道注册中心 + 速率限制
│   ├── menu-def.js                 # 右键菜单 + 托盘菜单定义（单一来源）
│   ├── performance.js              # 性能监控：CPU/内存 + 三级降级策略
│   ├── i18n.js                     # 多语言模块（zh-CN/en/ja/ko）
│   └── logger.js                   # 日志轮转：每天切文件，保留 7 天
│
├── renderer/                       # 前端（渲染进程）
│   ├── index.html                  # 主角色窗口
│   ├── preload.js                  # contextBridge 安全桥接
│   ├── pet-controller.js           # 前端控制器：状态同步 + 事件分发
│   ├── components/
│   │   ├── animation-system.js     # Canvas 精灵图动画引擎（v6，优先级管线）
│   │   ├── panel-common.js         # 面板通用：拖拽 + 关闭 + 入退场动画
│   │   ├── bubble.js               # 气泡 + 打字机效果
│   │   ├── status-bar.js           # 状态栏组件
│   │   └── modal.js                # 弹窗系统
│   ├── panels/
│   │   ├── inventory.html          # 道具包面板
│   │   ├── status.html             # 宠物状态面板
│   │   ├── work.html               # 打工面板
│   │   ├── mini-game.html          # 小游戏面板（4 标签切换）
│   │   ├── settings.html           # 设置面板（4 页：声音/显示/通知/关于）
│   │   └── theme.html              # 主题面板
│   └── styles/                     # CSS 样式
│
├── assets/
│   ├── characters/cat/
│   │   ├── spritesheet.png         # 64×64 精灵图（896×4608，14 列 72 行）
│   │   └── meta.json               # 动画定义：rowMap + stateMap + stateTransitions
│   ├── sprites/                    # UI 精灵图
│   └── pet-engine.js               # 前端本地状态引擎（localStorage 缓存）
│
├── migrations/
│   ├── 001_init.sql                # 建表 DDL + 50 条道具初始数据
│   ├── 002_add_festival.sql        # 节日记录表
│   └── 003_add_inventory_capacity.sql  # 背包容量字段
│
├── locales/                        # 语言包
│   ├── zh-CN.json                  # 中文（完整）
│   ├── en.json                     # 英文（完整）
│   ├── ja.json                     # 日文（TODO）
│   └── ko.json                     # 韩文（TODO）
│
├── test/                           # 测试
│   ├── test-runner.js              # 测试框架：Node.js 原生 assert，零依赖
│   ├── test-economy.js             # 经济系统 10 项
│   ├── test-sign-in.js             # 签到系统 6 项
│   ├── test-work.js                # 打工系统 8 项
│   └── test-mini-game.js           # 小游戏 8 项
│
└── docs/
    ├── architecture.md             # 本文档
    └── architecture-problems.md    # 架构问题与风险记录
```

---

## 三、双窗口架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron 主进程 (index.js)                │
│                                                             │
│  ┌──────────────┐         ┌──────────────┐                 │
│  │  petWindow   │  IPC    │ adminWindow  │                 │
│  │  主角色窗口   │◄───────►│  管理后台     │                 │
│  │  260×320     │         │  800×600     │                 │
│  │  transparent │         │  正常窗口     │                 │
│  │  alwaysOnTop │         │              │                 │
│  │  frameless   │         │              │                 │
│  └──────────────┘         └──────────────┘                 │
│         │                                                   │
│         │ preload.js (contextBridge)                        │
│         ▼                                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              后端模块群 (Node.js)                      │  │
│  │                                                      │  │
│  │  PetAI ──► Economy ──► QuestSystem                   │  │
│  │    │         │           │                            │  │
│  │    ▼         ▼           ▼                            │  │
│  │  SaveManager ◄── Database (sql.js)                   │  │
│  │    │              ▲                                   │  │
│  │    ▼              │                                   │  │
│  │  Timer ◄──────────┘                                   │  │
│  │                                                      │  │
│  │  WorkSystem / SignInSystem / MiniGameManager          │  │
│  │  EventManager / TimeManager / SkillSystem             │  │
│  │  PerformanceMonitor / I18n / Logger                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
│                      pet.db (sql.js 文件)                   │
└─────────────────────────────────────────────────────────────┘
```

### 窗口配置

| 窗口 | 尺寸 | 特性 | preload |
|------|------|------|---------|
| petWindow | 260×320 | frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true | preload.js |
| adminWindow | 800×600 | 标准窗口 | preload.js（共用） |

两个窗口共用同一个 preload.js，共享 `window.petAPI` 接口。

---

## 四、安全模型

### 4.1 Electron 安全配置

```javascript
// src/main/index.js L127-131
webPreferences: {
  nodeIntegration: false,      // 渲染进程无法访问 Node API
  contextIsolation: true,      // preload 脚本与渲染进程隔离
  preload: 'renderer/preload.js',
}
```

**没有** `security.js` 文件。安全控制通过以下三层实现：

### 4.2 安全三层架构

```
┌─────────────────────────────────────────┐
│  第一层：Electron 原生沙箱               │
│  nodeIntegration: false                 │
│  contextIsolation: true                 │
│  渲染进程无法 require() 或访问 Node API  │
├─────────────────────────────────────────┤
│  第二层：contextBridge 白名单            │
│  renderer/preload.js                    │
│  只暴露 ~30 个方法到 window.petAPI       │
│  渲染进程只能调用这些方法                 │
├─────────────────────────────────────────┤
│  第三层：IPC 速率限制                    │
│  src/main/ipc-handlers.js               │
│  写操作：10 次/分钟                      │
│  读操作：60 次/分钟                      │
│  其他：30 次/分钟                        │
└─────────────────────────────────────────┘
```

### 4.3 preload.js 暴露接口清单

| 分类 | 方法 | IPC 通道 |
|------|------|----------|
| 面板管理 | openPanel, closePanel | open-panel, close-panel |
| 设置 | getSettings, saveSettings | get-settings, save-settings |
| 系统信息 | getDisplays, getSystemTime, getVersion, getAppPath | get-displays, get-system-time, get-version, get-app-path |
| 窗口拖拽 | moveWindow | move-window |
| 右键菜单 | showNativeContextMenu, onMenuAction | show-context-menu-native, pet:menu-action |
| 状态推送 | onPetStatePush, onDebugLog | pet:state-push, pet:debug-log |
| 宠物交互 | petPet, petFeed, petWash, petGetStatus, petBroadcastState | pet:pet, pet:feed, pet:wash, pet:status, pet:broadcast-state |
| 经济 | economyGetInventory, economyUseItem, economyBuy, economyGetCoins, economyGetShop | economy:inventory, economy:useItem, economy:buy, economy:balance, economy:shop |
| 签到 | signinCheck, signinClaim, signinGetInfo | signin:check, signin:claim, signin:info |
| 打工 | workStart, workCancel, workStatus, workFinish, workGetJobs | work:start, work:cancel, work:status, work:finish, work:jobs |
| 小游戏 | minigameList, minigameStart, minigameFinish | minigame:list, minigame:start, minigame:finish |
| 任务/成就 | questGetDaily, questClaim, questGetAchievements, questAchievementClaim | quest:daily, quest:claim, quest:achievements, quest:achievement-claim |
| 技能 | skillGetList, skillUse | skill:list, skill:use |

### 4.4 IPC 通道命名规范

- 使用冒号分隔：`pet:feed`、`economy:buy`、`quest:daily`
- 与 `constants.js` 中 `IPC_CHANNELS` 常量对齐
- preload.js 中的方法名使用 camelCase：`petFeed`、`economyBuy`

---

## 五、数据库层

### 5.1 技术选型

**sql.js 1.14.1**（纯 JS SQLite 实现，无需编译原生模块）。

- 内存数据库，手动 load/save 到文件
- 存储路径：`app.getPath('userData')/pet.db`
- 支持外键约束（`PRAGMA foreign_keys = ON`）
- 不支持 WAL 模式（sql.js 限制）

### 5.2 已知 Bug（sql.js 参数绑定）

sql.js 1.10.3 ~ 1.14.1 的 Prepared Statement 存在参数绑定缺陷：
- `stmt.bind(1, val)`（单参数）后 `stmt.getAsObject()` 返回 undefined
- `stmt.bind([1, val])`（数组绑定）正常，但 `stmt.step()` 循环返回空

**当前方案**：`_escapeSql()` 将参数直接拼接到 SQL 字符串，改用 `db.exec()` 执行。  
**安全性**：本应用所有 SQL 参数均为内部生成（userId、workType 等），无外部用户输入。  
**后续**：sql.js 修复此 bug 后，可移除 `_escapeSql` 回退到原生 prepared statement。

### 5.3 迁移系统

迁移文件位于 `migrations/` 目录，`database.js` 的 `runMigrations()` 按文件名排序执行。  
增量迁移（如添加列）通过 `_migrateAddEvolutionType()` 等方法实现幂等操作。

---

## 六、后端模块

### 6.1 模块清单

| 模块 | 文件 | 行数 | 职责 |
|------|------|------|------|
| 主入口 | index.js | ~669 | 窗口管理 + 模块初始化 + 生命周期 + 系统级 IPC |
| 常量 | constants.js | ~623 | IPC 频道名、行为阈值、货币初始值、随机行为池 |
| 数据库 | database.js | ~458 | sql.js 封装、迁移、_escapeSql workaround |
| 定时器 | timer.js | — | 可暂停定时器管理 |
| 宠物 AI | pet-ai.js | ~886 | 行为树 + 情绪状态机 + 属性衰减 + 状态推送 |
| 经济 | economy.js | ~530 | 三货币 + 道具商店 + 背包 + 扩容 |
| 任务 | quest.js | ~362 | 每日任务 20+ 种 + 成就 50+ |
| 技能 | skill.js | — | 9 种技能 + 熟练度 + 效果加成 |
| 打工 | work.js | — | 8 种工作（1-16 分钟） |
| 签到 | sign-in.js | — | 连续签到 1/3/7/15/30 天递增奖励 |
| 小游戏 | mini-game.js | — | 4 种游戏管理 |
| 事件 | event-manager.js | — | 30 种随机事件，每 15 分钟触发 |
| 时间 | time-manager.js | — | 时间感知 + 14 种节日检测 |
| 存档 | save-manager.js | — | 脏标记自动存档 + 异常恢复 |
| IPC | ipc-handlers.js | ~729 | 通道注册 + 速率限制 + _wrapHandler 封装 |
| 菜单 | menu-def.js | ~50 | 右键菜单 + 托盘菜单单一定义源 |
| 性能 | performance.js | — | CPU/内存监控 + 三级降级策略 |
| 国际化 | i18n.js | — | 多语言模块（zh-CN/en/ja/ko） |
| 日志 | logger.js | — | 日志轮转：每天切文件，保留 7 天，单文件 5MB |

### 6.2 模块依赖关系

```
index.js (主入口)
  ├── PetDatabase ──► sql.js
  ├── Timer
  ├── SaveManager ──► PetDatabase, Timer
  ├── PetAI ──► PetDatabase, Timer, SaveManager
  ├── Economy ──► PetDatabase, SaveManager
  ├── QuestSystem ──► PetDatabase, Economy, SaveManager
  ├── SkillSystem ──► PetDatabase, Economy, SaveManager
  ├── WorkSystem ──► PetDatabase, Economy, Timer
  ├── SignInSystem ──► PetDatabase, Economy
  ├── MiniGameManager ──► PetDatabase, Economy
  ├── EventManager ──► PetDatabase, PetAI, Timer
  ├── TimeManager
  ├── IPCHandlers ──► 所有业务模块
  ├── PerformanceMonitor
  ├── I18n
  └── Logger
```

### 6.3 初始化时序

```
app.whenReady()
  └── async () => {
        1. database.init()           // 加载 pet.db，运行迁移
        2. timer.init()
        3. saveManager.init()
        4. petAI.init(userId)
        5. economy.init(userId)
        6. questSystem.init(userId)
        7. skillSystem.init(userId)
        8. workSystem.init(userId)
        9. signInSystem.init(userId)
        10. miniGameManager.init(userId)
        11. eventManager.init(userId)
        12. timeManager.init()
        13. ipcHandlers.registerAll()  // 注册所有 IPC 通道
        14. createPetWindow()          // 创建主窗口
        15. i18n.init()
        16. performance.start()
      }
```

**关键**：`initBackendModules()` 是 async 函数，必须在 `app.whenReady()` 中 await，否则 IPC handler 未注册，前端 invoke 会永久挂起。

---

## 七、前端渲染层

### 7.1 架构

```
index.html (主角色窗口)
  ├── preload.js ──► window.petAPI (contextBridge)
  ├── pet-controller.js (前端控制器)
  │     ├── 接收后端 pet:state-push 推送
  │     ├── 调用 AnimationSystem 切换动画
  │     ├── 处理用户交互（拖拽、点击、右键）
  │     └── 管理面板窗口打开/关闭
  ├── components/
  │     ├── animation-system.js (Canvas 精灵图引擎 v6)
  │     ├── bubble.js (气泡 + 打字机)
  │     ├── status-bar.js (状态栏)
  │     ├── panel-common.js (面板通用逻辑)
  │     └── modal.js (弹窗)
  └── assets/pet-engine.js (前端本地状态缓存)
```

### 7.2 动画系统 (animation-system.js v6)

**统一状态管线**：`applyState(behavior, mood, force)`

优先级体系（数字越小优先级越高）：

| 优先级 | 状态 | 说明 |
|--------|------|------|
| P0 | dragged | 用户拖拽，最高优先级 |
| P1 | sick, sleep | 健康状态 |
| P2 | eat, wash, play, ball, dance, read, petting, sulking, wakeup, attention, work | 活动状态 |
| P3 | walk, run, sit | 运动状态 |
| P4 | idle | 默认状态 |

规则：
- 高优先级立即打断低优先级（无延迟）
- 同优先级有 3 秒驻留锁（防抖）
- 低优先级无法打断高优先级

**行为→动画映射**（BEHAVIOR_MAP）：

| 行为 | 动画 | 效果 |
|------|------|------|
| idle | idle | 循环 |
| walk | walk | 循环（含多方向） |
| sit | sit | 循环 |
| sleep | begin → sleep | oneShot 过渡 |
| run | sprint | 循环 |
| eat/wash/play/ball/petting | idle + CSS oneShot | jump/wiggle 效果 |
| dance | walk | 循环 |
| read/work | sit | 循环 |
| wakeup/attention | idle + CSS oneShot | stretch/shake 效果 |
| sick | sleep | 循环 |

**通用 oneShot 系统**：`oneShotQueue` 数组，任意动画播完一圈后自动过渡到目标动画。

### 7.3 精灵图

- 素材：`assets/characters/cat/spritesheet.png`（896×4608，64×64 单帧，14 列 72 行）
- 配置：`assets/characters/cat/meta.json`（rowMap 格式）
- 渲染：Canvas 2D `drawImage()` 逐帧裁切，64px × scale 2 = 128px
- SCAN：初始化时扫描每帧像素，过滤全透明空帧，构建 `_frameMap`

### 7.4 面板系统

面板通过 `panel-common.js` 统一处理：
- 拖拽：header mousedown/mousemove/mouseup → IPC move-window
- ESC 关闭
- 入场/退场动画
- 支持 `window._panelCloseHandler` 自定义关闭回调

---

## 八、IPC 通信

### 8.1 消息格式

```
渲染进程 → 主进程：ipcRenderer.invoke(channel, payload)
主进程 → 渲染进程：webContents.send(event, data)
```

### 8.2 速率限制（ipc-handlers.js）

| 类型 | 限制 | 适用通道 |
|------|------|----------|
| 写操作 | 10 次/分钟 | feed, wash, pet, buy, useItem, claim, start, finish 等 |
| 读操作 | 60 次/分钟 | status, inventory, shop, balance, daily, achievements 等 |
| 其他 | 30 次/分钟 | list, records, jobs 等 |

### 8.3 _wrapHandler 封装

所有业务 IPC handler 通过 `_wrapHandler` 统一封装：
- try-catch 错误捕获
- 速率限制检查
- 统一返回格式：`{ success: true, data }` 或 `{ success: false, error }`
- 速率超限时返回：`{ success: false, error: '请求过于频繁，请稍后再试' }`

---

## 九、测试

### 9.1 框架

- `test/test-runner.js`：Node.js 原生 assert，零外部依赖
- MockDatabase / MockEconomy / MockTimer 用于隔离测试
- 当前覆盖：32/32 全绿

### 9.2 测试覆盖

| 模块 | 测试数 | 覆盖内容 |
|------|--------|----------|
| Economy | 10 | 金币操作、道具购买、背包管理 |
| SignIn | 6 | 签到、连续天数、奖励发放 |
| Work | 8 | 开始/完成/取消工作、奖励结算 |
| MiniGame | 8 | 游戏开始/结算、分数验证 |

### 9.3 运行

```bash
node test/test-runner.js
```

---

## 十、构建与分发

### 10.1 electron-builder 配置

```json
{
  "build": {
    "appId": "com.zhuazhua.desktop-pet",
    "productName": "爪爪桌宠",
    "win": { "target": "nsis", "icon": "build/icon.ico" },
    "nsis": { "oneClick": false, "allowToChangeInstallationDirectory": true }
  }
}
```

### 10.2 依赖

| 包 | 版本 | 用途 |
|----|------|------|
| electron | ^28.0.0 | 桌面框架 |
| sql.js | ^1.14.1 | 纯 JS SQLite |
| pngjs | ^7.0.0 | PNG 解析（精灵图扫描） |

**无原生模块**：sql.js 是纯 JS 实现，无需 node-gyp 编译，降低构建复杂度。

### 10.3 启动

```bash
npm start          # 生产模式
npm run dev        # 开发模式（自动打开 DevTools）
npm test           # 运行测试
npm run pack       # electron-builder 打包（不生成安装包）
npm run dist       # electron-builder 生成安装包
```

---

## 十一、技术债务

| 项目 | 严重程度 | 说明 |
|------|----------|------|
| sql.js 参数绑定 bug | 中 | 1.10.3~1.14.1 均存在，当前用 _escapeSql 绕过 |
| 无 security.js 白名单 | 低 | 安全通过 contextBridge + 速率限制实现，效果等价 |
| better-sqlite3 残留 | 低 | package.json 依赖中未清理，实际未使用 |
| ja/ko 翻译未完成 | 低 | 语言包结构已搭好，内容用英文填充 + TODO 标注 |
| 气泡菜单未实现 | 低 | 推迟到正式版上线前 |
| 无 CI/CD | 中 | 无法自动验证提交质量 |

---

## 十二、开发路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | 精灵图资源补齐 | ✅ |
| Phase 2 | 角色资产化 + 安全层 + 双引擎打通 | ✅ |
| Phase 3 | 小游戏实装 + 测试框架 | ✅ |
| Phase 4 | Steam 适配 + 性能监控 | 进行中 |
| Phase 5 | 上架运营 | 待启动 |
| Phase 6 | 服务端扩展（远期） | 待启动 |
