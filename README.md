# 🐱 爪爪桌宠 — Desktop Pet

类QQ宠物桌面精灵，Electron 构建。

## 快速启动

```bash
cd desktop-pet
npm install
npm start
```

## 项目结构

```
desktop-pet/
├── package.json                    # 项目配置（入口 src/main/index.js）
├── main.js                         # 旧主进程入口（已废弃，保留备份）
├── migrations/                     # SQLite 数据库迁移
│   ├── 001_init.sql                # 建表 + 50条道具初始数据
│   ├── 002_add_festival.sql        # 节日记录表
│   └── 003_add_inventory_capacity.sql  # 背包容量字段
├── src/main/                       # 后端核心（Electron 主进程）
│   ├── index.js                    # 主进程入口（窗口管理 + 后端初始化）
│   ├── constants.js                # 全局共享常量
│   ├── database.js                 # SQLite 管理（WAL + 迁移 + 预编译缓存）
│   ├── timer.js                    # 可暂停定时器管理
│   ├── pet-ai.js                   # 宠物AI（行为树 + 情绪状态机 + 属性衰减）
│   ├── time-manager.js             # 时间感知 + 14种节日检测
│   ├── event-manager.js            # 随机事件系统（30种事件）
│   ├── economy.js                  # 经济系统（3货币 + 道具 + 背包）
│   ├── skill.js                    # 技能系统（9种技能）
│   ├── quest.js                    # 每日任务 + 50+成就
│   ├── sign-in.js                  # 签到系统（连续奖励）
│   ├── work.js                     # 打工系统（8种工作）
│   ├── mini-game.js                # 小游戏管理（4种游戏）
│   ├── save-manager.js             # 存档管理（脏标记 + 异常恢复）
│   └── ipc-handlers.js             # IPC 通信注册
├── renderer/                       # 前端（渲染进程）
│   ├── index.html                  # 主角色窗口
│   ├── preload.js                  # 安全桥接
│   ├── pet-controller.js           # 前端控制器
│   ├── components/                 # UI 组件
│   ├── panels/                     # 面板页面
│   └── styles/                     # CSS 样式
├── assets/                         # 资源文件
└── docs/                           # 架构文档
```

## 核心系统

| 系统 | 文件 | 说明 |
|------|------|------|
| AI 行为树 | pet-ai.js | 需求驱动 + 6种情绪 + 时间感知 |
| 经济 | economy.js | 金币/钻石/好感币 + 50+道具 |
| 成长 | quest.js + skill.js | 等级 + 9技能 + 50+成就 |
| 互动 | pet-ai.js | 抚摸/喂食/洗澡/好感度5阶段 |
| 签到 | sign-in.js | 连续1/3/7/15/30天递增奖励 |
| 打工 | work.js | 8种工作 30min~8h |
| 小游戏 | mini-game.js | 接食物/石头剪刀布/记忆翻牌/节奏点击 |
| 随机事件 | event-manager.js | 30种事件 每15分钟触发 |
| 节日 | time-manager.js | 14种节日自动检测 |

## 依赖

- Electron ^28.0.0
- sql.js ^1.14.1

## 数据库

SQLite 存储于 `app.getPath('userData')/pet.db`，WAL 模式，自动迁移。
