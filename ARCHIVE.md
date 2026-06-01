# 爪爪桌宠 — 项目归档

> **归档日期**: 2026-05-31
> **项目状态**: v1.0 完成（前端精致版）
> **项目路径**: `D:\workbuddy\2026-05-30-11-30-24\desktop-pet\`

---

## 项目概述

基于 Electron 28 + sql.js 的桌面宠物应用，采用 Dark Glassmorphism 设计风格（主色 #7c5cfc），支持宠物养成、背包系统、换装、打工、签到、小游戏、节日事件等完整玩法。

## 规模指标

| 指标 | 数值 |
|------|------|
| 总源代码 | ~9,094 行 |
| 后端模块 | 15 个（5,955 行） |
| 前端面板 | 4 个（设置/换装/背包/主题） |
| 前端组件 | 5 个（Modal/Bubble/ContextMenu/StatusBar/AnimationSystem） |
| SVG 图标 | 25 个 |
| 数据库表 | 13 张 |
| 初始道具 | 50 条 |
| 设计 Token | 75+ CSS 自定义属性 |
| 动画效果 | 9 组 @keyframes |

---

## 目录结构

```
desktop-pet/
├── main.js                  # Electron 入口
├── package.json             # 依赖配置
├── start.bat / start.ps1    # 启动脚本
├── README.md                # 项目说明
├── docs/
│   ├── architecture.md      # 架构文档
│   ├── er-diagram.mermaid   # ER 图
│   └── class-diagram.mermaid # 类依赖图
├── migrations/
│   ├── 001_init.sql         # 初始建表（13张表）
│   ├── 002_add_festival.sql # 节日系统
│   └── 003_add_inventory_capacity.sql # 背包容量
├── src/main/                # 后端模块（15个）
│   ├── constants.js         # 全局常量
│   ├── database.js          # sql.js 数据库封装
│   ├── timer.js             # 定时器管理
│   ├── pet-ai.js            # 宠物 AI 行为
│   ├── economy.js           # 经济系统（货币/交易）
│   ├── skill.js             # 技能系统
│   ├── quest.js             # 任务系统
│   ├── sign-in.js           # 签到系统
│   ├── work.js              # 打工系统
│   ├── mini-game.js         # 小游戏
│   ├── event-manager.js     # 事件管理
│   ├── time-manager.js      # 时间管理
│   ├── save-manager.js      # 存档管理
│   ├── ipc-handlers.js      # IPC 通信
│   └── index.js             # 后端入口（依赖注入）
├── renderer/
│   ├── index.html           # 主宠物窗体（SVG 猫咪角色）
│   ├── styles/
│   │   ├── tokens.css       # 设计 Token（167行，75+变量）
│   │   ├── animations.css   # 动画定义（120行，9组@keyframes）
│   │   └── design-system.css # 遗留样式（可逐步迁移）
│   ├── icons/               # SVG 图标（25个，24×24）
│   ├── components/
│   │   ├── modal.js         # Promise 弹窗组件（303行）
│   │   ├── bubble.js        # 气泡 + 打字机效果
│   │   ├── context-menu.js  # 右键菜单（SVG 图标）
│   │   ├── status-bar.js    # 状态条
│   │   └── animation-system.js # 动画系统
│   └── panels/
│       ├── settings.html    # 设置面板（4页）
│       ├── dress-up.html    # 换装面板
│       ├── inventory.html   # 背包面板（品质流光）
│       └── theme.html       # 主题面板
└── assets/                  # 资源文件
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Electron ^28.0.0 |
| 数据库 | sql.js ^1.10.3（纯 JS SQLite，替代 better-sqlite3） |
| 前端 | 原生 HTML/CSS/JS |
| 样式 | CSS Custom Properties + backdrop-filter Glassmorphism |
| 图标 | SVG（24×24 stroke 风格，currentColor） |
| 通信 | Electron IPC（preload.js 桥接） |
| 配置 | 自定义 SimpleStore（ESM-only 兼容） |

---

## 核心功能

### 宠物系统
- SVG 猫咪角色 + 4 种表情状态
- glow-pulse 光晕呼吸动画
- AI 行为驱动（情绪/饥饿/精力/亲密度）
- 自定义拖拽 + 点击交互（阈值区分）

### 背包系统
- 品质分级：普通/稀有/史诗（shimmer 流光特效）
- 50 条初始道具 + 背包容量管理
- 使用道具 Modal 确认流程

### 换装系统
-  outfits 保存/加载（Modal async 流程）
- 预览区域 glow 效果

### 经济系统
- 打工/签到/任务奖励
- 主题商店购买（Modal 确认）

### 社交交互
- 气泡打字机效果（逐字显示 + Promise）
- 右键菜单 7 项操作（SVG 图标 + hover 过渡）

---

## 设计系统

### 三文件 CSS 架构
1. **tokens.css** — 设计 Token（色/间距/字号/阴影/模糊/圆角/缓动/层级）
2. **animations.css** — 动画库（9 组 @keyframes + 工具类）
3. **design-system.css** — 遗留样式（逐步迁移中）

### 动画清单
| 动画 | 用途 |
|------|------|
| panel-in / panel-out | 面板滑入/滑出 |
| shimmer | 稀有/史诗品质流光 |
| particle-float | 粒子漂浮 |
| typewriter-cursor | 打字机光标 |
| modal-in / modal-out | Modal 弹出/消失 |
| card-hover | 卡片悬停浮起 |
| glow-pulse | 宠物光晕呼吸 |

### Modal 组件 API
```javascript
Modal.confirm(title, message, options)  // → Promise<{ok: boolean}>
Modal.alert(title, message)             // → Promise<void>
Modal.prompt(title, message, defaultVal) // → Promise<{ok: boolean, value: string}>
Modal.close()                           // 关闭当前 Modal
```

---

## 数据库

### 13 张表
- `pet_profile` — 宠物档案
- `pet_stats` — 状态值（饥饿/精力/亲密度/情绪）
- `inventory` — 背包
- `outfits` — 换装存档
- `economy` — 经济数据
- `skills` — 技能
- `quests` — 任务
- `sign_in` — 签到
- `work` — 打工
- `mini_game` — 小游戏
- `themes` — 主题
- `festivals` — 节日
- `settings` — 设置

### 安全修复
- ✅ SQL 参数化查询（消除注入风险）
- ✅ 白名单校验（work.js/economy.js）

---

## 启动方式

```batch
:: 方式1：双击
start.bat

:: 方式2：PowerShell
.\start.ps1

:: 方式3：手动（需清除 ELECTRON_RUN_AS_NODE）
$env:ELECTRON_RUN_AS_NODE = $null
npm start
```

**⚠️ 注意**：WorkBuddy 环境会设置 `ELECTRON_RUN_AS_NODE=1`，需清除后才能正常启动 Electron 窗口。

---

## 下一步迭代路径（按投产比排序）

> 基于 v1.0 归档现状制定，三条路径**不要同时铺开**，按顺序逐个击破。

### 路径一：精灵图资源补齐（投产比最高 · 立竿见影）

**现状**：`assets/` 目录为空，所有角色视觉是 SVG 占位，桌宠是「代码宠物」不是「视觉宠物」。

**做法**：
1. 找一套开源 Shimeji 精灵图（MIT 协议），覆盖 idle/walk/drag/climb 四个核心动画
2. 对接 `animation-system.js` 的 `steps()` 逐帧播放接口
3. 替换 `renderer/index.html` 里 SVG 占位为帧动画

**工作量**：找资源 ~1h + 对接 ~2h，纯前端不碰后端。

**收益**：项目有了「脸」，从技术 demo 变成能看的桌宠。**这是门面，优先级最高。**

**前置条件**：无，当前代码即可对接。

---

### 路径二：角色资产化（完善动画 · 成品感）

**现状**：即使有精灵图，也只是「能动」，没有完整的动画管线和状态机。

**做法**：
1. 制作/完善一套精灵图：idle（4帧）/ walk（6帧）/ sit（2帧）/ dragged（2帧）/ sleep（3帧）
2. 完善 `animation-system.js` 状态机：idle → walk → sit → sleep → dragged 自动切换
3. 对接 `pet-ai.js` 的行为状态驱动动画切换（情绪/饥饿/精力影响动画表现）
4. 可选：攀爬窗口边缘动画（Shimeji 经典行为）

**工作量**：中等。美术资源可以仍用开源素材验证管线，后续再替换原创。

**收益**：从「能看的桌宠」变成「有灵魂的桌宠」。动画状态机的完整性决定用户体验上限。

**前置条件**：路径一完成（精灵图管线跑通）。

---

### 路径三：小游戏实装（可玩性突破 · 用户粘性）

**现状**：`mini-game.js` 模块已存在，`mini_game` 数据表已建，但没有可玩的 game。

**做法**：
1. **接食物**（反应类）：食物从顶部落下，点击接住 → 得分 → 奖励结算 → 金币入账
2. **石头剪刀布**（运气类）：与宠物对战 → 胜负判定 → 奖励结算
3. 闭环：游戏得分 → 奖励结算 → 金币入账 → 每日次数限制
4. 可选：本机历史记录/排行榜

**工作量**：纯前端渲染逻辑，`mini-game.js` 框架已有，主要是写游戏画面和交互。

**收益**：从「挂机看」变成「可以玩」。用户粘性分水岭——有得玩的人才留得住。

**前置条件**：路径一/二完成更佳（先有面子再有里子），但技术上无硬性依赖。

---

### 执行顺序

```
路径一（精灵图资源补齐，立竿见影，项目有了「脸」）
  ↓
路径二（角色资产化，完善动画状态机，「脸」活起来）
  ↓
路径三（小游戏实装，用户「留下来」）
```

**原则**：每次只铺开一条路径，做完再做下一条。避免多线并行导致哪条都没做完。

---

## 版本历史

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-05-29 | v0.9 | 后端 15 模块 + QA 安全修复（SQL 参数化） |
| 2026-05-30 | v1.0 | 前端精致版：设计系统 + SVG 图标 + Modal + 动画 |
| 2026-05-31 | v1.0 | 项目归档 |
