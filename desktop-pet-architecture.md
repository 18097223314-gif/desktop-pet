---
AIGC:
    Label: "1"
    ContentProducer: 001191110102MACQD9K64018705
    ProduceID: 7638655264614301986-data_volume/files/所有对话/主对话/桌宠项目/desktop-pet-architecture.md
    ReservedCode1: ""
    ContentPropagator: 001191110102MACQD9K64028705
    PropagateID: 4351180354887164#1780281969748
    ReservedCode2: ""
---
# 爪爪桌宠 — 技术架构文档

> 版本：v1.0 | 日期：2026-06-01 | 作者：张牧之

---

## 一、项目概述

类QQ宠物桌面精灵，Electron构建，目标上架Steam。当前v1.0已完成前端精致版+后端15模块+安全修复，代码量~9094行。

## 二、架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────┐
│                   Electron 主进程                  │
│  ┌──────────┐  IPC  ┌──────────────────────────┐ │
│  │  渲染进程  │◄────►│     Node.js 后端模块群     │ │
│  │          │      │                          │ │
│  │ 角色窗口  │      │ database.js ← sql.js     │ │
│  │ 面板页面  │      │ pet-ai.js                │ │
│  │ 组件系统  │      │ economy.js               │ │
│  │ 动画系统  │      │ quest/skill/work/...     │ │
│  │          │      │ ipc-handlers.js           │ │
│  └──────────┘      └──────────────────────────┘ │
│                          │                       │
│                     SQLite DB                    │
└─────────────────────────────────────────────────┘
                         │ 以后扩展
                         ▼
               ┌──────────────────┐
               │  Python 扩展服务  │
               │  AI对话 / 云存储  │
               │  付费皮肤授权     │
               └──────────────────┘
```

### 2.2 架构决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 后端 | Node.js（保留现有） | 9094行已跑通，重写风险>收益 |
| 通信 | Electron IPC（保留） | 本地场景性能最优 |
| 数据库 | sql.js（保留） | bind()bug已修，稳定运行 |
| Python扩展 | 以后独立服务接入 | 不加AI则不需要，预留WebSocket接口 |
| 前端通信层 | 抽象化封装 | 以后换WebSocket只改一个文件 |

### 2.3 扩展路径

```
现有：Electron ←IPC→ Node.js后端 ←sql.js→ SQLite

扩展1（AI）：Node.js后端 ←WebSocket→ Python服务（LLM）
扩展2（上云）：Node.js后端 ←WebSocket→ 云端Python服务
扩展3（付费）：Node.js后端 ←HTTPS→ 皮肤授权服务
```

## 三、模块架构

### 3.1 后端模块（15个）

| 模块 | 文件 | 职责 |
|------|------|------|
| 入口 | index.js | 窗口管理 + 后端初始化（依赖注入） |
| 常量 | constants.js | 全局共享常量 |
| 数据库 | database.js | SQLite管理（WAL + 迁移 + 预编译缓存） |
| 定时器 | timer.js | 可暂停定时器管理 |
| 宠物AI | pet-ai.js | 行为树 + 情绪状态机 + 属性衰减 |
| 时间 | time-manager.js | 时间感知 + 14种节日检测 |
| 事件 | event-manager.js | 随机事件系统（30种事件） |
| 经济 | economy.js | 3货币 + 道具 + 背包 |
| 技能 | skill.js | 9种技能 |
| 任务 | quest.js | 每日任务 + 50+成就 |
| 签到 | sign-in.js | 连续1/3/7/15/30天递增奖励 |
| 打工 | work.js | 8种工作 30min~8h |
| 小游戏 | mini-game.js | 4种游戏（框架已有，待实装） |
| 存档 | save-manager.js | 脏标记 + 异常恢复 |
| 通信 | ipc-handlers.js | IPC通信注册 |

### 3.2 前端组件

| 组件 | 文件 | 职责 |
|------|------|------|
| 动画系统 | animation-system.js | 精灵图逐帧播放 + 状态机 |
| 气泡 | bubble.js | 气泡 + 打字机效果 |
| 右键菜单 | context-menu.js | SVG图标 + hover过渡 |
| 状态条 | status-bar.js | 宠物状态显示 |
| 弹窗 | modal.js | Promise式弹窗（confirm/alert/prompt） |

### 3.3 前端面板

| 面板 | 文件 | 功能 |
|------|------|------|
| 设置 | settings.html | 4页设置 |
| 换装 | dress-up.html | outfits保存/加载 |
| 背包 | inventory.html | 品质流光特效 |
| 主题 | theme.html | 主题商店 |

### 3.4 设计系统

| 文件 | 内容 |
|------|------|
| tokens.css | 75+ CSS自定义属性（色/间距/字号/阴影/模糊/圆角/缓动/层级） |
| animations.css | 9组@keyframes（panel-in/out, shimmer, glow-pulse等） |
| design-system.css | 遗留样式，逐步迁移 |

## 四、角色系统设计

### 4.1 多角色预留

先用猫咪开发，后期根据调研决定正式形象。角色形象与游戏逻辑彻底解耦。

### 4.2 资源目录结构

```
assets/
├── characters/
│   ├── cat/              ← 先开发
│   │   ├── idle.png      闲置动画（4帧）
│   │   ├── walk.png      行走动画（6帧）
│   │   ├── sit.png       坐下动画（2帧）
│   │   ├── sleep.png     睡觉动画（3帧）
│   │   ├── dragged.png   拖拽动画（2帧）
│   │   └── meta.json     角色元数据
│   ├── dog/              ← 以后扩展
│   └── fox/              ← 以后扩展
```

### 4.3 meta.json 格式

```json
{
  "name": "cat",
  "displayName": "猫咪",
  "version": "1.0",
  "frameSize": { "width": 64, "height": 64 },
  "offset": { "x": 0, "y": 0 },
  "animations": {
    "idle":    { "file": "idle.png",    "frames": 4, "fps": 8 },
    "walk":    { "file": "walk.png",    "frames": 6, "fps": 10 },
    "sit":     { "file": "sit.png",     "frames": 2, "fps": 4 },
    "sleep":   { "file": "sleep.png",   "frames": 3, "fps": 3 },
    "dragged": { "file": "dragged.png", "frames": 2, "fps": 6 }
  }
}
```

### 4.4 代码层解耦

- `animation-system.js` 不硬编码角色名，按 `meta.json` 读帧数和尺寸
- settings表加 `current_character` 字段
- 换装/皮肤系统跟角色解耦，每个角色独立一套outfit
- 后期加新角色 = 往 `characters/` 丢文件夹 + meta.json

## 五、数据库设计

### 5.1 现有13张表

pet_profile / pet_stats / inventory / outfits / economy / skills / quests / sign_in / work / mini_game / themes / festivals / settings

### 5.2 新增字段

| 表 | 字段 | 类型 | 说明 |
|----|------|------|------|
| settings | current_character | TEXT | 当前角色，默认"cat" |

### 5.3 迁移规范

- 每次改数据库结构必须写migration文件（004_xxx.sql）
- 不能手动改表，老用户升级自动执行migration
- migration必须幂等（可重复执行不出错）

## 六、通信层设计

### 6.1 现有：Electron IPC

```
渲染进程 → preload.js → ipcRenderer.invoke() → 主进程 ipc-handlers.js
```

### 6.2 通信层抽象（改造目标）

```javascript
// 前端统一调用接口
const api = {
  getPetStats: () => client.call('pet.getStats'),
  feedPet: (foodId) => client.call('pet.feed', { foodId }),
  // ...
};

// client 内部实现可替换
// 现在：走 IPC
// 以后：走 WebSocket
// 切换只改 client.js 一个文件
```

### 6.3 WebSocket预留

Node.js后端预留 `ws-client.js` 模块，以后连Python扩展服务时启用：
- 连接管理（自动重连、心跳检测）
- 消息格式：`{ type, action, payload, requestId }`
- 认证：预留 `auth` 消息类型

## 七、开发路线图

```
Phase 1 — 精灵图资源补齐（投产比最高）
  ├─ 找开源Shimeji精灵图（MIT/CC0），覆盖idle/walk/drag/climb
  ├─ 对接animation-system.js的steps()逐帧播放
  ├─ 替换index.html里SVG占位为帧动画
  └─ 工作量：找资源~1h + 对接~2h

Phase 2 — 角色资产化（动画状态机）
  ├─ 完善精灵图帧数：idle(4)/walk(6)/sit(2)/dragged(2)/sleep(3)
  ├─ animation-system.js状态机：idle→walk→sit→sleep→dragged
  ├─ 对接pet-ai.js行为驱动动画切换
  └─ 可选：攀爬窗口边缘动画

Phase 3 — 小游戏实装
  ├─ 接食物（反应类）
  ├─ 石头剪刀布（运气类）
  └─ 闭环：得分→奖励→金币→每日限制

Phase 4 — Steam适配
  ├─ electron-builder打包
  ├─ greenworks集成（成就/云存档/创意工坊）
  └─ Steam Direct $100上架

Phase 5 — 上架运营
  ├─ 审核提交 + 宣传素材
  └─ 社区运营 + 创意工坊内容

Phase 6 — 服务端扩展（远期）
  ├─ Python服务端（AI对话/云存储/付费皮肤）
  ├─ 数据库加user_id，本地默认→上云多用户
  └─ 付费皮肤：本地验证 + 服务端授权
```

**原则：每次只铺开一条路径，做完再做下一条。**

## 八、技术规范

### 8.1 版权协议

| 协议 | 可商用 | 备注 |
|------|--------|------|
| CC0 | ✅ | 无任何限制 |
| MIT | ✅ | 保留版权声明即可 |
| CC-BY-NC | ❌ | 禁止商用，上Steam不可用 |
| GPL | ⚠️ | 要求开源你的代码，慎用 |

找素材时标注协议，上Steam前复查。

### 8.2 版本控制

- 用Watt Toolkit加速GitHub
- 每次改完代码：`git add . && git commit -m "改了什么"`
- 每个Phase完成打tag：`git tag v0.1`
- 改坏了随时回退：`git checkout -- 文件名`

### 8.3 性能底线

| 指标 | 目标 |
|------|------|
| 空闲CPU | <2% |
| 空闲内存 | <150MB |
| 动画帧率 | requestAnimationFrame，不用setInterval |
| 打包体积 | <80MB |

### 8.4 数据备份

- 每次启动自动备份pet.db到backups/，保留7份
- 存档管理器加手动导出/导入功能

### 8.5 日志系统

- 关键操作写日志（启动/关闭/数据库操作/错误）
- 日志路径：`app.getPath('userData')/logs/`
- 自动清理7天前的日志

### 8.6 窗口规范

- 主窗口：`focusable: false`，不抢焦点
- 面板/菜单弹出时临时获取焦点，关闭后归还
- 多显示器兼容：坐标计算用屏幕相对值，DPI缩放一致

### 8.7 热更新

| 类型 | 方式 | 优先级 |
|------|------|--------|
| 资源（皮肤/音效/配置） | 监听文件变化自动生效 | 高 |
| 游戏逻辑 | 配置JSON热加载 | 中 |
| 框架/依赖 | 走安装包/Steam自动更新 | 低 |

### 8.8 皮肤系统

- 资源包热加载，不硬编码
- Steam创意工坊 = 核心卖点
- 免费皮肤：CC0素材包基础款
- 付费皮肤：原创设计或AI生成精修，定价6-18元

## 九、开发策略

### 9.1 拆小模块逐个击破

**正确做法** — 每次只让AI写一个独立小模块：
- "写一个Electron透明窗口，无边框、置顶、鼠标可穿透空白区域"
- "写一个精灵图动画类，支持横向spritesheet，可控制帧率"
- "写一个WebSocket服务端，监听8765端口，支持JSON消息收发"

**错误做法** — "帮我做一个桌面宠物"

### 9.2 视觉调试

- 改一处截一次图对比
- Electron DevTools（F12）查看元素实际渲染状态
- 代码审查抓不了视觉问题，必须看运行效果

### 9.3 AI分工

| 角色 | 工具 | 职责 |
|------|------|------|
| 主力编码 | 天工SkyClaw-v1.0 | 日常编码、模块开发 |
| 架构审查 | 张牧之 | 架构设计、业务逻辑、关键决策 |
| 深度审查 | 灵光 | 关键模块安全审查 |
| 日常扫描 | 千问 | 语法/边界/规范 |

三个意见交叉验证，两个以上说有问题再改。

## 十、已知问题

| 问题 | 状态 | 备注 |
|------|------|------|
| sql.js bind()bug | ✅ 已修 | stmt.step()异常后reset不执行，try-finally防护 |
| 五官不显示 | ✅ 已修 | 详情见归档文档 |
| WorkBuddy环境启动 | ⚠️ 需处理 | 清除ELECTRON_RUN_AS_NODE=1才能启动 |
| 小游戏未实装 | 📋 待做 | Phase 3 |
| assets/目录为空 | 📋 待做 | Phase 1 |

## 十一、环境信息

| 项目 | 值 |
|------|------|
| 项目路径 | D:\workbuddy\2026-05-30-11-30-24\desktop-pet\ |
| Electron | ^28.0.0 |
| 数据库 | sql.js ^1.10.3，WAL模式 |
| Node.js | 随Electron自带 |
| Git | v2.47.0 |
| 代码量 | ~9,094行 / 70文件 |
| 设计风格 | Dark Glassmorphism（主色 #7c5cfc） |

---

> 本内容由 Coze AI 生成，请遵循相关法律法规及《人工智能生成合成内容标识办法》使用与传播。
