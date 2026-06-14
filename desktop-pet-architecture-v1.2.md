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

> 版本：v1.2 | 日期：2026-06-01 | 作者：张牧之口述 | 执笔：马维斯 | 修订：基于v1.1补充安全、测试、性能、Steam集成等关键设计

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

**新增模块**：
| 模块 | 文件 | 职责 |
|------|------|------|
| 安全层 | security.js | IPC输入校验 + 消息白名单 + 序列化防护 |
| 测试框架 | test-runner.js | 模块边界测试 + 集成测试桩 |
| 性能监控 | performance.js | CPU/内存测量 + 降级策略 |
| 本地化 | i18n.js | UI文案多语言支持（Steam全球上架必需） |

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

## 四、核心模块设计展开

### 4.1 pet-ai.js 行为树设计

**节点类型**：
- **选择器（Selector）**：顺序执行子节点，直到一个成功
- **序列（Sequence）**：顺序执行子节点，直到一个失败
- **条件（Condition）**：检查属性阈值（饥饿<30、心情>70）
- **动作（Action）**：执行具体行为（觅食、睡觉、玩耍）
- **装饰器（Decorator）**：限制执行频率、添加随机性

**行为树结构示例**：
```
根选择器
├─ 条件：饥饿<30 → 动作：觅食
├─ 条件：精力<20 → 动作：睡觉
├─ 条件：心情<50 → 动作：玩耍
└─ 默认：闲逛
```

**与动画系统交互**：
- pet-ai 每 5 秒评估一次，输出 `{ action: 'walk', target: 'screen_edge' }`
- animation-system 监听行为变化，切换精灵图状态
- 优先级：dragged > sleep > sit > walk > idle

### 4.1-bis 双引擎架构与状态同步

⚠️ **现状说明**：项目实际存在两套独立的状态系统，v1.0 尚未打通。

#### 前端引擎（pet-engine.js）

- 位置：`assets/pet-engine.js`（457 行）
- 持久化：localStorage
- 通信方式：事件驱动（EventEmitter）
- 职责：前端即时状态管理、属性衰减、道具效果、UI 响应
- 状态字段：`hunger, energy, mood, cleanliness, health, coins, gems, level, exp`

#### 后端引擎（pet-ai.js）

- 位置：`src/main/pet-ai.js`（969 行）
- 持久化：SQLite（pet_status 表）
- 通信方式：Electron IPC
- 职责：行为树决策、全局定时衰减、存档持久化、跨会话恢复
- 状态字段：`hunger, hygiene, mood, stamina, emotion, state, is_sick, sick_since`

#### 状态同步策略（Phase 2 待实现）

| 规则 | 说明 |
|------|------|
| 权威源 | `pet-ai.js` 为状态权威源，`pet-engine.js` 为前端缓存镜像 |
| 单向推送 | `pet-ai.js` → IPC → `pet-engine.js`：每次 tick 后推送全量状态 |
| 用户操作 | 前端操作（喂食/玩耍/清洁）→ IPC invoke → 后端处理 → 推送更新 |
| 离线回退 | 后端断开时前端引擎继续工作，重连后后端状态覆盖前端 |
| 字段映射 | `energy↔stamina`、`cleanliness↔hygiene`、`mood↔mood`（仅 mood 一致） |

> ⚠️ 当前 status-bar.js（renderer/components/status-bar.js）使用前端字段名（happy/mood/energy/cleanliness），但 IPC 推送将来自后端字段名（mood/stamina/hygiene）。字段映射表已列入 Phase 2 修复清单。

### 4.2 安全层设计

**IPC 安全**：
```javascript
// security.js
const ALLOWED_ACTIONS = {
  'pet.feed': { foodId: 'number' },
  'pet.getStats': {},
  'economy.buy': { itemId: 'string', quantity: 'number' }
};

function validateIPC(action, params) {
  const schema = ALLOWED_ACTIONS[action];
  if (!schema) throw new Error(`禁止的操作: ${action}`);
  // 类型校验 + 范围校验
}
```

**preload.js 白名单强制校验**：
- `preload.js` 中通过 `contextBridge.exposeInMainWorld` 暴露的每个 IPC invoke 通道，必须在 `security.js` 的 `ALLOWED_ACTIONS` 中存在对应条目
- 建议 CI 加入 lint 规则：扫描 preload.js 的 `ipcRenderer.invoke` 调用，与 security.js 白名单做 diff，不匹配则报错
- 避免"preload 加了新通道但忘记同步白名单 → 运行时被静默拦截 → 前端功能异常无报错"

**序列化防护**：
- 所有 IPC 消息强制 JSON.parse 前检查长度（<10KB）
- 禁止传递函数、正则表达式、原型链对象
- SQL 参数化查询已在 economy.js 实现，需扩展到所有模块

**WebSocket 预留**：
- 认证：JWT token 或 session cookie
- 消息格式：`{ type: 'auth', token: '...' }` → `{ type: 'auth_ok' }`
- 心跳：30 秒无消息自动断开

### 4.3 数据库核心表结构

> 以下为当前代码实际使用的表结构（基于 pet-ai.js getStatus() 返回结构）。

**pet_status**（单行，宠物唯一状态记录）：
```sql
id INTEGER PRIMARY KEY,
hunger INTEGER DEFAULT 100,      -- 饱食度 0-100
hygiene INTEGER DEFAULT 100,     -- 清洁度 0-100
mood INTEGER DEFAULT 100,        -- 心情值 0-100
stamina INTEGER DEFAULT 100,     -- 体力值 0-100
coins INTEGER DEFAULT 100,       -- 金币
gems INTEGER DEFAULT 0,          -- 钻石
vouchers INTEGER DEFAULT 0,      -- 好感币
level INTEGER DEFAULT 1,
exp INTEGER DEFAULT 0,
emotion TEXT DEFAULT 'idle',     -- 情绪状态：idle/happy/sad/excited/sleepy/angry
state TEXT DEFAULT 'idle',       -- 行为状态：idle/walk/sit/sleep
is_sick INTEGER DEFAULT 0,       -- 是否生病 0/1
sick_since TEXT,                 -- 生病时间戳
personality TEXT,                -- JSON 字符串：性格参数
last_tick TEXT,                  -- 最后一次 tick 时间
created_at TEXT DEFAULT CURRENT_TIMESTAMP,
updated_at TEXT DEFAULT CURRENT_TIMESTAMP
```

**inventory**：
```sql
id INTEGER PRIMARY KEY,
item_id TEXT NOT NULL,           -- 道具 ID
quantity INTEGER DEFAULT 0,      -- 数量
acquired_at TEXT DEFAULT CURRENT_TIMESTAMP
```

**economy 交易记录**：
```sql
id INTEGER PRIMARY KEY,
type TEXT NOT NULL,              -- 交易类型：earn/spend
currency TEXT NOT NULL,          -- 币种：gold/gem/voucher
amount INTEGER NOT NULL,
reason TEXT,                     -- 交易原因
created_at TEXT DEFAULT CURRENT_TIMESTAMP
```

## 五、角色系统设计

### 5.1 多角色预留

先用猫咪开发，后期根据调研决定正式形象。角色形象与游戏逻辑彻底解耦。

### 5.2 资源目录结构

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

### 5.3 meta.json 格式

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

### 5.4 代码层解耦

- `animation-system.js` 不硬编码角色名，按 `meta.json` 读帧数和尺寸
- settings表加 `current_character` 字段
- 换装/皮肤系统跟角色解耦，每个角色独立一套outfit
- 后期加新角色 = 往 `characters/` 丢文件夹 + meta.json

## 六、测试策略

### 6.1 测试层级

| 层级 | 工具 | 覆盖率目标 |
|------|------|------------|
| 单元测试 | Jest + 模块桩 | 核心逻辑 80% |
| 集成测试 | 自定义 test-runner.js | IPC 通信 100% |
| 边界测试 | 手动用例生成 | 所有数值边界 |
| 性能测试 | performance.js 自动测量 | 每次提交记录 |

### 6.2 测试用例生成规范

每个模块开发完成后，让 AI 生成 3 类测试用例：
1. **正常流**：预期输入得到预期输出
2. **边界流**：最小值、最大值、空值、非法值
3. **错误流**：依赖失败、数据库异常、IPC 超时

### 6.3 测试桩设计

```javascript
// test-runner.js
class MockIPC {
  constructor() {
    this.calls = [];
  }
  invoke(channel, ...args) {
    this.calls.push({ channel, args });
    return Promise.resolve({ success: true });
  }
}
```

## 七、性能监控与降级

### 7.1 测量指标

| 指标 | 测量方法 | 降级阈值 |
|------|----------|----------|
| 空闲 CPU | `process.cpuUsage()` | >5% 持续 10 秒 |
| 内存占用 | `process.memoryUsage()` | >200MB |
| 动画帧率 | `requestAnimationFrame` 回调间隔 | <30 FPS |
| 数据库查询 | `performance.now()` 包裹 | >100ms |

### 7.2 降级策略

1. **CPU 高**：降低 pet-ai 评估频率（5秒→10秒），暂停非核心定时器
2. **内存高**：清理 SQLite 预编译语句缓存，释放 Canvas 离屏缓存
3. **帧率低**：减少精灵图帧数（6帧→4帧），关闭阴影模糊效果（精灵图接入 Phase 2 后生效；当前 SVG 动画阶段等效策略为降低 CSS 动画复杂度）
4. **查询慢**：启用数据库查询缓存，批量合并更新

### 7.3 性能基线

每次提交前运行 `npm run perf`，记录基线数据到 `perf-baseline.json`，波动超过 20% 需审查。

## 八、Steam 集成设计

### 8.1 greenworks 集成步骤

1. **SDK 准备**：下载 Steamworks SDK，提取 `steam_api64.dll` 和 `steam_api64.lib`
2. **greenworks 编译**：`npm install greenworks` + 手动编译绑定（需 Visual Studio）
3. **成就系统**：
   ```javascript
   greenworks.activateAchievement('FIRST_FEED', () => {
     console.log('成就解锁：首次喂食');
   });
   ```
4. **云存档**：冲突解决策略（本地优先 / 远程优先 / 手动选择）
5. **创意工坊**：UGC 上传/下载 + 内容审核流程

### 8.2 上架清单

- [ ] 打包配置（electron-builder）
- [ ] 成就列表（至少 10 个）
- [ ] 云存档测试（冲突处理）
- [ ] 创意工坊集成
- [ ] 多语言支持（英文 + 简体中文）
- [ ] 年龄分级问卷
- [ ] 宣传素材（封面图、截图、视频预告）

### 8.3 多语言支持

**i18n.js 设计**：
```javascript
const translations = {
  en: { 'feed': 'Feed', 'play': 'Play' },
  zh: { 'feed': '喂食', 'play': '玩耍' }
};

function t(key, lang = 'zh') {
  return translations[lang]?.[key] || key;
}
```

**资源分离**：所有 UI 文案抽离到 `locales/` 目录，打包时按用户 Steam 语言设置加载。

## 九、热更新方案（打包环境适配）

### 9.1 资源热更新

**开发环境**：监听 `assets/` 文件变化，实时重载
**打包环境**：解压 `app.asar` 到临时目录，监听变化后触发 `mainWindow.reload()`

### 9.2 配置热加载

```javascript
// 配置 JSON 从外部文件读取
const configPath = path.join(
  process.env.NODE_ENV === 'development' 
    ? __dirname 
    : path.dirname(process.execPath),
  'config.json'
);
```

### 9.3 皮肤热更新

1. 皮肤包为 `.zip` 格式，包含 `manifest.json` + 资源文件
2. 下载到 `skins/` 目录，解压验证
3. `animation-system.js` 动态加载新精灵图路径

## 十、通信层设计

### 10.1 现有：Electron IPC

```
渲染进程 → preload.js → ipcRenderer.invoke() → 主进程 ipc-handlers.js
```

### 10.2 通信层抽象（改造目标）

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

### 10.3 WebSocket预留

Node.js后端预留 `ws-client.js` 模块，以后连Python扩展服务时启用：
- 连接管理（自动重连、心跳检测）
- 消息格式：`{ type, action, payload, requestId }`
- 认证：JWT token 或 session cookie

## 十一、开发路线图

```
Phase 1 — 精灵图资源补齐（投产比最高）
  ├─ 找开源Shimeji精灵图（MIT/CC0），覆盖idle/walk/drag/climb
  ├─ 对接animation-system.js的steps()逐帧播放
  ├─ 替换index.html里SVG占位为帧动画
  └─ 工作量：找资源~1h + 对接~2h

Phase 2 — 角色资产化 + 安全层
  ├─ 完善精灵图帧数：idle(4)/walk(6)/sit(2)/dragged(2)/sleep(3)
  ├─ animation-system.js状态机：idle→walk→sit→sleep→dragged
  ├─ security.js IPC 输入校验 + 消息白名单
  ├─ 对接pet-ai.js行为驱动动画切换
  └─ 可选：攀爬窗口边缘动画

Phase 3 — 小游戏实装 + 测试框架
  ├─ 接食物（反应类）
  ├─ 石头剪刀布（运气类）
  ├─ test-runner.js + 每个模块3个边界用例
  └─ 闭环：得分→奖励→金币→每日限制

Phase 4 — Steam适配 + 性能监控
  ├─ electron-builder打包配置
  ├─ **greenworks编译链预验证**（需 VS + Steamworks SDK + node-gyp，国内网络环境不友好，建议 Phase 3 提前在目标机器上完整跑通编译流程，避免 Phase 4 卡进度）
  ├─ greenworks集成（成就/云存档/创意工坊）
  ├─ performance.js 基线测量 + 降级策略
  ├─ i18n.js 多语言支持
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

## 十二、技术规范

### 12.1 版权协议

| 协议 | 可商用 | 备注 |
|------|--------|------|
| CC0 | ✅ | 无任何限制 |
| MIT | ✅ | 保留版权声明即可 |
| CC-BY-NC | ❌ | 禁止商用，上Steam不可用 |
| GPL | ⚠️ | 要求开源你的代码，慎用 |

找素材时标注协议，上Steam前复查。

### 12.2 版本控制

- 用Watt Toolkit加速GitHub
- 每次改完代码：`git add . && git commit -m "改了什么"`
- 每个Phase完成打tag：`git tag v0.1`
- 改坏了随时回退：`git checkout -- 文件名`

### 12.3 性能底线

| 指标 | 目标 | 测量方法 |
|------|------|----------|
| 空闲CPU | <2% | `process.cpuUsage()` |
| 空闲内存 | <150MB | `process.memoryUsage()` |
| 动画帧率 | 60 FPS | `requestAnimationFrame` 回调间隔 |
| 打包体积 | <80MB | electron-builder 输出 |
| 启动时间 | <3秒 | `Date.now()` 差值 |

### 12.4 数据备份

- 每次启动自动备份pet.db到backups/，保留7份
- 存档管理器加手动导出/导入功能

### 12.5 日志系统

- 关键操作写日志（启动/关闭/数据库操作/错误）
- 日志路径：`app.getPath('userData')/logs/`
- 自动清理7天前的日志

### 12.6 窗口规范

- 主窗口：`focusable: false`，不抢焦点
- 面板/菜单弹出时临时获取焦点，关闭后归还
- 多显示器兼容：坐标计算用屏幕相对值，DPI缩放一致

### 12.7 热更新

| 类型 | 开发环境 | 打包环境 |
|------|----------|----------|
| 资源（皮肤/音效） | 文件监听实时重载 | 解压 asar 临时目录 |
| 游戏逻辑（JSON） | 热加载 | 需重启应用 |
| 框架/依赖 | Steam 自动更新 | Steam 自动更新 |

### 12.8 皮肤系统

- 资源包热加载，不硬编码
- Steam创意工坊 = 核心卖点
- 免费皮肤：CC0素材包基础款
- 付费皮肤：原创设计或AI生成精修，定价6-18元

## 十三、开发策略

### 13.1 拆小模块逐个击破

**正确做法** — 每次只让AI写一个独立小模块：
- "写一个Electron透明窗口，无边框、置顶、鼠标可穿透空白区域"
- "写一个精灵图动画类，支持横向spritesheet，可控制帧率"
- "写一个WebSocket服务端，监听8765端口，支持JSON消息收发"

**错误做法** — "帮我做一个桌面宠物"

### 13.2 视觉调试

- 改一处截一次图对比
- Electron DevTools（F12）查看元素实际渲染状态
- 代码审查抓不了视觉问题，必须看运行效果

### 13.3 AI分工（三人组）

| 角色 | 称呼 | 职责 | 不干 |
|------|------|------|------|
| 架构决策 | 张牧之 | 出主意、定架构、拍板、调度 | 不写代码、不改文档 |
| 主力编码 | 爪爪 | 写代码、本地执行、模块实现 | 不做架构决策 |
| 审计文档 | 马维斯 | 代码审查、技术文档编写与维护 | 不出代码 |

**协作模式**：张牧之口述决策 → 爪爪编码执行 → 马维斯审查/文档，两条线并行（如马维斯复查P0链路时爪爪同时推面板接入链）。

## 十四、已知问题

| 问题 | 状态 | 备注 |
|------|------|------|
| sql.js bind()bug | ✅ 已修 | stmt.step()异常后reset不执行，try-finally防护 |
| 五官不显示 | ✅ 已修 | 详情见归档文档 |
| WorkBuddy环境启动 | ⚠️ 需处理 | 清除ELECTRON_RUN_AS_NODE=1才能启动 |
| 小游戏未实装 | 📋 待做 | Phase 3 |
| assets/目录为空 | 📋 待做 | Phase 1 |
| 安全层缺失 | 📋 待做 | Phase 2 |
| 测试框架缺失 | 📋 待做 | Phase 3 |
| 多语言支持缺失 | 📋 待做 | Phase 4 |

## 十五、环境信息

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