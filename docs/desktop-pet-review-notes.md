---
AIGC:
    Label: "1"
    ContentProducer: 001191110102MACQD9K64018705
    ProduceID: 7638655264614301986-data_volume/files/所有对话/主对话/desktop-pet-review-notes.md
    ReservedCode1: ""
    ContentPropagator: 001191110102MACQD9K64028705
    PropagateID: 4351180354887164#1780286465392
    ReservedCode2: ""
---
# 桌宠项目规划要点

> 2026-06-01 更新，归档文档已确认

## 项目现状
- **项目路径**：`D:\workbuddy\2026-05-30-11-30-24\desktop-pet\`
- **代码量**：~9,094行，15个后端模块，13张表，50条初始道具
- **技术栈**：Electron 28 + sql.js + Node.js后端 + IPC通信
- **前端**：4个面板（设置/换装/背包/主题）+ 5个组件 + 25个SVG图标 + 9组动画
- **设计风格**：Dark Glassmorphism（主色 #7c5cfc），75+ CSS自定义属性
- **数据库**：sql.js（WAL模式，3个migration文件）
- **v1.0状态**：前端精致版完成，后端15模块+安全修复完成

## 架构决策（最终）
- **前端**：Electron（保留现有，透明窗口 + 精灵动画 + 交互层）
- **后端**：Node.js（保留现有15模块，不做Python重写）
- **通信**：Electron IPC（保留），前端通信层做抽象（以后换WebSocket只改一个文件）
- **数据库**：sql.js（按归档文件，bind()bug已修）
- **Python扩展**：以后需要AI/云端时，Python作为独立服务，通过WebSocket与Node.js后端通信
- **当前不加AI**，Python服务预留
- **有服务端通信野心**，架构预留上云接口

### 为什么不在现有基础上重写Python后端
1. 9094行代码已跑通，逻辑验证过，重写风险远大于收益
2. Python的唯一优势是AI生态，但现在不加AI
3. 以后加AI/上云，Python作为独立服务接入即可，不需要替换现有后端
4. 渐进式扩展比大爆炸重写安全得多

### 架构预留
```
现有架构（保留）
Electron ←IPC→ Node.js后端 ←sql.js→ SQLite
                         ↑
                    以后扩展
                         ↓
               Python服务（AI/云端）←WebSocket→ Node.js后端
```

- 前端通信层抽象化（IPC调用封装成统一接口）
- 后端模块接口标准化
- 数据库操作层保持现有
- WebSocket占位：Node.js后端预留WebSocket客户端模块，以后连Python服务

## 素材方向
- 不会画画，走素材库或AI生成
- CC0素材包确认可用，推荐LuizMelo的猫/狗包（免费，6-8只×12种动画）
- 归档中推荐：找开源Shimeji精灵图（MIT协议），覆盖idle/walk/drag/climb
- 现状：assets/目录为空，所有角色视觉是SVG占位

## 角色系统设计（多角色预留）
- **先用猫咪开发**，后期根据调研决定正式形象
- 角色形象与游戏逻辑彻底解耦，换皮=换资源包

### 资源目录结构
```
assets/
├── characters/
│   ├── cat/          ← 先开发
│   │   ├── idle.png
│   │   ├── walk.png
│   │   ├── sit.png
│   │   ├── sleep.png
│   │   ├── dragged.png
│   │   └── meta.json     ← 角色元数据（名称/帧数/尺寸/偏移量）
│   ├── dog/          ← 以后扩展
│   │   └── ...
│   └── fox/          ← 以后扩展
│       └── ...
```

### 代码层解耦
- `animation-system.js`不硬编码角色名，按`meta.json`读帧数和尺寸
- settings表加`current_character`字段，角色选择写配置
- 换装/皮肤系统跟角色解耦，每个角色独立一套outfit
- 后期加新角色=往`characters/`丢一个文件夹+一份meta.json

## 开发路线图（按归档三条路径 + 后续扩展）

### Phase 1：精灵图资源补齐（投产比最高）
- 找一套开源Shimeji精灵图（MIT协议），覆盖idle/walk/drag/climb
- 对接animation-system.js的steps()逐帧播放接口
- 替换renderer/index.html里SVG占位为帧动画
- 工作量：找资源~1h + 对接~2h

### Phase 2：角色资产化（动画状态机）
- 完善精灵图：idle(4帧)/walk(6帧)/sit(2帧)/dragged(2帧)/sleep(3帧)
- 完善animation-system.js状态机：idle→walk→sit→sleep→dragged自动切换
- 对接pet-ai.js行为状态驱动动画切换
- 可选：攀爬窗口边缘动画（Shimeji经典行为）

### Phase 3：小游戏实装
- 接食物（反应类）
- 石头剪刀布（运气类）
- 闭环：游戏得分→奖励结算→金币入账→每日次数限制

### Phase 4：Steam适配
- Electron打包 + greenworks集成
- 创意工坊 + 云存档 + 成就系统
- Steam Direct $100上架费

### Phase 5：上架运营
- 审核提交 + 宣传素材 + 社区运营

### Phase 6（远期）：服务端扩展
- Python服务端（AI对话/云存储/付费皮肤）
- 数据库加user_id，本地默认用户→上云多用户
- 付费皮肤：本地验证+服务端授权

## 热更新
- 资源热更新（皮肤/音效/配置）→ 监听文件变化自动生效
- 逻辑热更新 → Node.js端可做模块热重载，但优先级低
- 框架级更新 → 走安装包/Steam自动更新

## Steam上架
- 终极目标：上架Steam
- greenworks库提供Steam SDK Node.js绑定（成就/云存档/创意工坊）
- 创意工坊是杀手锏，用户自制皮肤
- 皮肤系统做资源包热加载，不硬编码
- 前端通信层预留auth消息类型

## 开发模型
- **主力**：天工SkyClaw-v1.0（百万token上下文，Agent优化，多轮任务完成率89%，工具调用92%+）
- 天工能力足够扛住这种规模项目

## AI分工（正式三人组）
- **张牧之**（我）— 架构设计 + 业务逻辑 + 关键决策
- **爪爪** — 写代码 + 本地执行
- **马维斯** — 代码审查 + 文档完善

之前说的千问和灵光审查已替换为马维斯，不再额外用千问。

## 开发策略
- **拆小模块，逐个击破** — 每次只让AI写一个独立小模块，测通了再接下一个
- 不要一次性让AI写完整项目
- 视觉渲染问题纯代码审查抓不到，改一处截一次图对比
- Electron自带DevTools（F12），遇到渲染问题先看元素实际状态
- **每次只铺开一条路径，做完再做下一条**（归档文档原则）

## 付费体系
- 后期计划：云存储数据 + 付费皮肤
- 免费皮肤靠CC0素材包，付费走原创设计或AI生成精修
- 定价参考Steam创意工坊：6-18元

## 注意事项

### 版权协议
- CC0和MIT可商用，Steam是商业行为
- CC-BY-NC不能商用，GPL要求开源你的代码
- 找素材时逐个标注协议类型，上Steam前复查一遍

### 数据备份
- SQLite单文件数据库，损坏=全完
- 每次启动自动备份pet.db到backups/目录，保留最近7份
- 存档管理器加手动导出/导入功能

### 版本控制（Git）
- 类似游戏存档系统，改代码=存档，改坏了=读档回退
- 必须上，不然大项目改出问题回不去
- 用Watt Toolkit（原Steam++）加速GitHub，本地反代，勾选+一键开启
- 每个Phase完成打一个tag（v0.1, v0.2...）

### 多显示器兼容
- 拖到副屏回不来、坐标计算错乱、DPI缩放不一致
- 前期就要处理，用户投诉第一名

### 性能底线
- 空闲状态CPU<2%，内存<150MB
- 动画帧率用requestAnimationFrame，不用setInterval
- 定期用任务管理器检查

### 打包体积
- Electron打包容易膨胀到200MB+
- 用electron-builder精简，排除devDependencies，asar压缩资源
- 目标控制在80MB以内

### 日志系统
- 现在项目没有日志，出bug两眼一抹黑
- 加简单日志模块，关键操作写文件（启动/关闭/数据库操作/错误）
- 日志文件放app.getPath('userData')/logs/，自动清理7天前的

### 数据库迁移
- 归档已有3个migration文件，思路正确
- 以后每改数据库结构必须写migration，不能手动改表
- 老用户升级时自动执行新migration，数据不丢

### 自动更新
- Steam版靠Steam自带更新
- 本地开发/beta阶段可用electron-updater给测试用户发更新

### 窗口焦点
- 桌宠不能抢焦点——用户打字时桌宠蹦出来吃键盘事件，体验灾难
- Electron窗口设focusable: false或做焦点保护
- 面板/菜单弹出时临时获取焦点，关闭后归还

## 已知问题记录
- sql.js bind()bug已修（stmt.step()异常后reset不执行）
- 五官问题已解决（详情在归档文档中）
- WorkBuddy环境需清除ELECTRON_RUN_AS_NODE=1才能启动Electron窗口
- anim-stretch CSS动画已补全到animations.css
- 前端眼睛占位符+跳跃整体位移 → 根因是SVG方案天花板，Phase 1精灵图一步到位解决
- preload.js和ipc-handlers.js channel两套体系 → 非bug，主页面用PetEngine本地引擎，面板页面需确认preload暴露

## 马维斯代码审查（四轮完整，12+1个文件）

### 审查范围
- 第一轮：ipc-handlers.js / database.js / preload.js
- 第二轮：pet-ai.js / economy.js / save-manager.js
- 第三轮：animation-system.js / bubble.js / status-bar.js / modal.js / context-menu.js / index.html / animations.css / design-system.css / tokens.css / dress-up.html / inventory.html / settings.html / theme.html
- 第四轮：pet-engine.js

### 🔴 P0 — 功能完全不可用（按链路修）

**链路1：状态显示链**（engine→status-bar→bubble，三处bug串成死链）
1. pet-engine.js `_updateMood`缺tired/dirty mood → bubble.js对应台词永不触发
2. pet-engine.js `_getPublicState`不导出health → inventory的MEDICINE效果不可见
3. status-bar.js字段名对不上（happy↔mood, energy↔stamina, cleanliness↔hygiene）→ 状态栏从未生效

**链路2：面板接入链**（preload补channel→面板接IPC）
4. preload.js未暴露业务channel → 面板调不了pet.feed/economy.buy等
5. inventory.html useItem是空壳 → 道具系统完全不可用
6. dress-up.html换装不调后端 → 纯内存，关面板即丢
7. theme.html购买不调后端 → 不扣金币不持久化

**链路3：后端安全链**
8. economy.js `executeItemEffect`硬编码userId=1 + 改petStatus不存DB（崩溃丢数据）
9. ipc-handlers.js userId改为硬编码1 + 基础输入校验
10. pet-ai.js起床bug（_setState被覆盖）+ feed() userId混用
11. context-menu.js图标路径在index.html下404

### 🟡 P1 — 尽快修
- economy.js buyItem加事务
- save-manager.js forceSave只清成功标记
- database.js _saveToFile改异步 + _bindParams去flat
- ipc-handlers.js错误信息不泄露前端
- pet-ai.js _checkSickness加恢复冷却
- pet-engine.js _tick末尾加checkLevelUp（离线不漏升级）
- pet-engine.js _checkDisease加duration超时治愈
- bubble.js多次say重叠
- animation-system.js setStatus未知状态回退 + playOneShot闭包捕获旧状态
- index.html glow-pulse keyframes冲突
- animations.css面板动画双跑
- design-system.css覆盖缓动函数
- settings.html输入校验 + catch吞错

### 🟢 P2 — 低危/下次重构
- engine: stop()不清listeners、coins无上限、_eventTimer注释不准、未暴露off()、useItem不查levelUp、localStorage同步IO、personality旧存档合并
- 随机行为池空保护、getStatus引用拷贝、recovery log写详情
- 背包扩容费用确认、stmtCache加LRU、requestId碰撞、migration回滚、transaction嵌套、removeListener
- 模板字符串拼SQL改对象映射
- CSS变量重复定义、tooltip无边界检测、modal ESC语义

## 待办
- [x] 归档文档已确认，架构方向已定
- [x] Git仓库初始化 + 首次提交
- [x] 技术架构文档v1.1（马维斯修订）
- [ ] 马维斯第三轮审查：animation-system.js + 面板HTML
- [ ] 爪爪修复🔴4个高优先级bug
- [ ] 确定桌宠形象/风格（猫咪？其他？）
- [ ] Phase 1：找精灵图资源并对接

---

> 本内容由 Coze AI 生成，请遵循相关法律法规及《人工智能生成合成内容标识办法》使用与传播。
