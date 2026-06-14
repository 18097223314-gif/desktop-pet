# 会话上下文交接

> 新建对话时，让 AI 先读这个文件即可接续，不需要从头讲。

---

## 项目

爪爪桌宠 — Electron 桌面宠物，目标上架 Steam。

- 路径：`D:\workbuddy\2026-05-30-11-30-24\desktop-pet\`
- 技术栈：Electron 28 + sql.js + 前端 Canvas 精灵图动画
- 代码量：~11000+ 行 / 70+ 文件（新增 quest.js/panel-common.js/menu-def.js/test-runner.js，删除 context-menu.js/dress-up.html/main.js 遗留）
- 当前阶段：Phase 3 基本完成（四款小游戏全栈、测试框架、面板拖动、设置面板重做、道具包 v3）

## 角色分工

| 角色 | 称呼 | 职责 | 不干 |
|------|------|------|------|
| 架构决策 | 张牧之 | 出主意、定架构、拍板、调度 | 不写代码、不改文档 |
| 主力编码 | 爪爪 | 写代码、本地执行、模块实现 | 不做架构决策 |
| 审计文档 | 马维斯 | 代码审查、技术文档编写与维护 | 不出代码 |

## 核心文档

- **技术架构 v1.2**：`desktop-pet-architecture-v1.2.md`（张牧之口述，马维斯执笔，新增双引擎架构章节、表结构反写、preload 白名单、performance 降级标注、13.3 分工表改三人组）
- **后端架构**：`docs/architecture.md`（Bob 高见远编写，v1.0 设计规范）
- **审查笔记**：`desktop-pet-review-notes.md`（四轮审查汇总，P0/P1/P2 分级）

## 当前状态

### 已完成
- 四轮代码审查（15 个后端模块 + renderer 层 13 个文件 + pet-engine.js）
- 审查结果：2 个 🔴 高危 + 27 个 🟡 中危 + 21 个 🟢 低危
- 技术架构文档 v1.2（张牧之口述，马维斯执笔，13.3 分工表改三人组）
- sql.js bind() bug 已修复
- 五官不显示已修复
- **Neko 精灵图对接**：animation-system.js Canvas 2D 逐帧播放，index.html SVG→Canvas，pet-controller.js 适配
- **数值归零修复**：pet-engine.js 三层防御（`_tick` 下限≥5、`_loadState` 异常恢复、`_saveState` 零值保护），马维斯审查通过
- **入睡动画修复**：oneShotPending/oneShotTarget/oneShotStarted 三标记，begin→sleep 自动过渡
- **面板接入链接通**：preload.js IPC 通道名修复（点号→冒号是根因）+ 31 通道补全 + inventory.html 余额对接
- **签到修复**：3 轮排查（_wrapHandler 吞错 → 空值保护 → 字段对齐）
- **打工修复**：6 层问题逐层攻克（传参格式 → 错误合并 → INSERT 静默 → sql.js bug → UPDATE 波及 → datetime 冲突），马维斯审查通过
- **打工时间缩短**：张牧之决策，8 种工作从小时级改为 1-16 分钟（见 constants.js）
- **马维斯 P0 复查**：状态显示链和后端安全链审查完毕

### 当前待修（2026-06-02 张牧之任务清单）

| # | 优先级 | 问题 | 状态 |
|---|--------|------|------|
| 1 | 🔴 P0 | 托盘图标缺失 — 裁 idle 帧做 16×16 图标，index.js Tray 指向 | ✅ |
| 2 | 🔴 P0 | 道具包点击无反应 — inventory.html 事件绑定 + IPC 确认 + 文案改"点击使用" | ✅ |
| 3 | 🔴 P0 | 动画切换太快 — fps 调低（idle 4-6/walk 6/run 8），tick + 状态随机重调 | ✅ |
| 4 | 🟡 P1 | 面板窗口不能拖动 — panel-common.js 统一拖拽+关闭+动画，6 面板接入 | ✅ |
| 5 | 🟡 P1 | 右键菜单推倒重做 — menu-def.js 单一来源 + handleMenuAction 统一分发 | ✅ |
| 6 | 🟡 P1 | 设置面板重做 — 4页（声音/显示/通知/关于），版本号+路径动态读取 | ✅ |
| 7 | 🟡 P1 | 打工时间缩短 — 8种工作 1-16分钟，前端 JOBS key 对齐后端 | ✅ |
| 8 | 🟢 P2 | 小游戏 bug 修复 — mini-game.html 6/4 更新 | ✅ |

> ⚠️ **张牧之 2026-06-01 指令**：爪爪代码写一半跑去写文章了。项目待修为零不代表可以摸鱼——回来继续写代码。写文章是下班后的事。

### P0 链路终验
- ✅ 状态显示链：`_tick → _updateMood → _getPublicState → emit → status-bar/bubble`，全链路闭合
- ✅ 后端安全链：28 handler 零硬编码 userId，economy 原子操作，输入校验到位

### P1/P2 全部完成
- ✅ pet-engine.js 字段映射文档化、ipc-handlers.js userId 统一化
- ✅ sql.js workaround 标注
- ~~换装/主题 IPC handler~~ 已移除（空壳，待 Phase 3 按实际需求重做）

### 测试框架
- ✅ test-runner.js + 4 test 文件，**32/32 全绿**（重构精简，覆盖核心路径）
- ✅ 5 项补丁完成：超时保护(5s)、economy 边界(+3)、work 边界(+2)、RPS 确定性 mock、cleanup finally
- 覆盖：Economy(10) + SignIn(6) + Work(8) + MiniGame(8)
- MockDB 踩坑：`UPDATE SET gold = gold + ? WHERE id = ?` 参数偏移（SET 的 `?` 在 WHERE 之前，匹配需 `offset = setParamCount`）；INSERT 字面量不能走 `params[i]`，需独立解析

### 小游戏进度
- ✅ 石头剪刀布：playRps 全流程 + IPC + renderer/panels/mini-game.html 前端 UI
- ✅ 食物反应：rewardCatchFood 全流程 + IPC + 前端
- ✅ 记忆翻牌/节奏点击：前端面板完成（4标签切换，preload IPC 参数对齐，结算读后端 reward）

### 技术债
- **sql.js 1.10.3 参数绑定 bug**：`getAsObject()` 对 prepared statement 返回 undefined。database.js 通过 `_escapeSql()` + `db.exec()` 绕过，安全性可控（参数均为内部生成），但应在 sql.js 修复后回退原生 prepared statement。`_escapeSql` 的 `/\?/g` 无法区分字符串字面量内 `?`（work.js datetime 函数已踩坑已修）

### 开发路线图（Phase 1-6）
- **Phase 1 精灵图资源补齐**：✅ 已完成（Neko 精灵图对接）
- **Phase 2 角色资产化 + 安全层 + 双引擎打通**：✅ 已完成（P0 链路终验 + P1/P2 全部落地）
- **Phase 3 小游戏实装 + 测试框架**：基本完成（测试框架 32/32 ✅、四款小游戏全栈 ✅、任务系统 quest.js ✅、面板拖动 ✅、设置面板重做 ✅；剩余：气泡菜单 ⏸、打工时间确认 ⏸）
- Phase 4：Steam 适配 + 性能监控
- Phase 5：上架运营
- Phase 6：服务端扩展（远期）

## 关键文件速查

### 后端模块（src/main/）
| 文件 | 行数 | 职责 |
|------|------|------|
| pet-ai.js | 886 | 行为树 + 状态机，后端权威状态源 |
| economy.js | 531 | 三货币 + 道具 + 背包（新增扩容） |
| quest.js | 362 | 每日任务 + 成就系统（2026-06-04 新增） |
| save-manager.js | 264 | 脏标记自动存档 |
| menu-def.js | 50 | 右键菜单+托盘菜单单一定义源（2026-06-04 新增） |
| database.js | 459 | sql.js WAL + 迁移 |
| ipc-handlers.js | 573 | IPC 通道注册 |

### 前端渲染层（renderer/）
| 文件 | 行数 | 职责 |
|------|------|------|
| components/panel-common.js | ~80 | 面板通用（拖拽+关闭+动画），6 面板共用 |
| components/animation-system.js | — | 精灵图/CSS 动画 |
| components/bubble.js | — | 气泡 + 打字机 |
| components/status-bar.js | — | 状态显示 |
| components/modal.js | — | 弹窗系统 |

### 前端引擎
| 文件 | 行数 | 职责 |
|------|------|------|
| assets/pet-engine.js | 457 | 前端本地状态引擎（localStorage） |

### 测试
| 文件 | 行数 | 职责 |
|------|------|------|
| test/test-runner.js | ~400 | 测试框架 + MockDB + 32 个测试用例 |

## 重要约定

- 双引擎状态同步：后端 pet-ai.js 为权威源，前端 pet-engine.js 为缓存镜像
- 字段映射：前端 energy↔后端 stamina，前端 cleanliness↔后端 hygiene
- 数据库：sql.js WAL 模式，禁止字符串拼接 SQL
- 安全：所有 IPC 通道需在 security.js 白名单注册（待实现）
- 路径格式：Windows 反斜杠绝对路径

## 2026-06-01 晚间变更

### 换装/主题空壳 IPC 清理（爪爪）
- `constants.js`：删 DRESSUP_EQUIP/OUTFIT/WARDROBE + THEME_SET/GET_CURRENT（5 通道）
- `ipc-handlers.js`：删 `_handleDressup()` + `_handleTheme()`（~70 行）
- `preload.js`：删 dressup/主题 5 个暴露 API
- 决策：换装面板是空壳、无素材，待正式素材到位再重新接入

## 2026-06-02 上午变更

### 64×64 新精灵图对接（爪爪）
- **素材**：last-tick.itch.io Animated Pixel Cats 64×64，896×4608（14列×72行），3 只猫
- **meta.json 格式变更**：旧格式 `{animations: {key: {row, frames, fps}}}` → 新格式 `{rowMap: {key: {startRow, endRow, frames, fps}}}`，`columns` 嵌套在 `meta` 里
- **loadMeta() 适配**：兼容新旧两种 meta 格式，新格式从 rowMap 构建 animations 对象
- **`_frameMap` 机制**：sprite 加载时扫描 startRow~endRow 每帧像素，0 像素帧跳过，构建 `{row, col}[]` 映射表，覆盖 frames 为有效帧数。walk 从 112 格压缩到 ~42 有效帧
- **canvas 尺寸**：96×96 → 128×128（FRAME_SIZE 64 × SCALE 2）
- **文件名对齐**：spritesheet-64x64.png 复制为 spritesheet.png，meta-64x64.json 复制为 meta.json
- 备用猫：cat2.png（白猫）、cat3.png（黑猫）已就位

### 下一步
- 气泡菜单（Phase 2 稳定后再做）
- 打工时间确认（张牧之任务清单 #7）
- Phase 4：Steam 适配 + 性能监控
- 马维斯审计 test-runner.js（待安排）

## 2026-06-02 下午变更

### 道具包卡死修复（爪爪，4个根因）

**根因1：SQL 语法错误**
- `economy.js` `getShopItems()` 无 type 参数时 WHERE 缺少括号
- `WHERE price_gold > 0 OR price_diamond > 0 ORDER BY ...` → `WHERE (price_gold > 0 OR price_diamond > 0) ORDER BY ...`
- 导致 `db.exec()` 抛异常

**根因2：database.all() 统一走 exec 路径**
- sql.js 1.10.3 的 prepared statement `getAsObject()` 对有参数绑定的查询返回 undefined
- `database.all()` 之前无参时走 `prepare().all()`，有参走 `db.exec()`
- 修复后统一走 `db.exec()`，不再区分有无参数
- `database.all()` 新增 try-catch 保护

**根因3：IPC handler 时序竞态**
- `initBackendModules()` 是 async 函数，但 `app.whenReady()` 里没 await
- 用户在业务 handler 注册完成前点击"道具包"→ IPC invoke 永久挂起
- 修复：`app.whenReady().then(async () => { ... await initBackendModules(); })`

**根因4：前端 IPC 超时保护**
- `inventory.html` 新增 `invokeWithTimeout()` 方法，所有 IPC 调用 5 秒超时
- 即使后端 hang 住，面板也能正常打开（数据可能不完整）

### 道具包数据修复
- `getInventory()` SQL：`i.*` 列名冲突（inventory.id vs items.id），改为显式列名 `i.id AS inv_id, it.id AS item_def_id`
- 前端错误字段：`result?.message` → `result?.error`（匹配 `_wrapHandler` 返回格式）
- 前端 catch 块：`catch(_)` → `catch(e)` 输出日志

### 双通道状态推送
- `pet-ai.js` 新增 `pushState()` 方法（通过 emitter.send 即时推 pet-state-push）
- `ipc-handlers.js` 4 个关键操作成功后立即调 `pushState()`：抚摸/喂食/洗澡/使用道具
- 保留 3 秒定时推送作为兜底

### 修改文件清单
| 文件 | 行数 | 变更 |
|------|------|------|
| src/main/economy.js | 530 | getShopItems SQL 括号、getInventory 显式列名+item_def_id |
| src/main/database.js | 459 | all() 统一 exec 路径 + try-catch |
| src/main/index.js | 494 | app.whenReady 加 async/await |
| src/main/pet-ai.js | 1027 | 新增 pushState() 方法 |
| src/main/ipc-handlers.js | 573 | 4 个操作 handler 加 pushState 调用 |
| renderer/panels/inventory.html | 452 | invokeWithTimeout + 错误字段修复 |

## 2026-06-04 上午变更

### 菜单架构归一（爪爪，P0+P1）
- **新增 `src/main/menu-def.js`**（50 行）— 菜单定义单一来源
  - `PET_CONTEXT_MENU`: 8 项（睡觉/状态/道具包/签到/打工/小游戏/设置+4子菜单/退出）
  - `TRAY_MENU_ITEMS`: 6 项（显示/隐藏/状态面板/分隔线/退出 + DevTools 动态插入）
- `index.js` 新增 `handleMenuAction(action)` 统一分发函数（约 60 行）
- `index.js` 新增 `buildNativeContextMenu()` 从 PET_CONTEXT_MENU 构建 Electron 原生菜单
- IPC 通道更名：`show-context-menu` → `show-context-menu-native`，`context-menu-action` → `pet:menu-action`
- `preload.js`：`showContextMenu()` → `showNativeContextMenu()`，`onContextMenuAction()` → `onMenuAction()`
- `pet-controller.js`：回调从散列对象 `menuCallbacks{}` 改为 switch-case
- **删除** `renderer/components/context-menu.js`（152 行死代码，从未被 index.html 加载）
- **删除** `renderer/panels/dress-up.html`（换装面板空壳，素材未到位）

### 退出逻辑 P0 修复（爪爪）
- 新增 `isQuitting` 标志位（index.js L77）
- `petWindow.on('close')`：`isQuitting=false` 时 `preventDefault()+hide()`（最小化到托盘），`isQuitting=true` 时放行
- `handleMenuAction('quit')`：设 `isQuitting=true` → `app.quit()`
- `app.on('before-quit')`：设 `isQuitting=true` + forceSave + 清理定时器/托盘
- **根因**：close 事件 `preventDefault` 吞掉了 destroy/exit，现在通过标志位正确区分"最小化到托盘"和"真正退出"

### 道具包 v2（爪爪）
- **星空糖 bug 修复**：背包/商店混排无视觉分隔 + 商店升序使星空糖(price_gold=0)排首位，消耗后补位造成视觉错觉
  - 背包/商店间加分隔线，商店物品虚线边框+降低透明度，排序改降序，useItem 防御性 ID 解析
- `economy.js` 新增 `expandInventory()` — 背包扩容（+5格，金币花费递增）
- `inventory.html` useItem 用 `item.item_id || item.id` 兜底

### 小游戏 bug 修复（爪爪）
- `mini-game.html` 更新（6/4 15:49）

### 新增任务系统 quest.js（爪爪）
- `src/main/quest.js`（362 行）— 每日任务 + 成就系统
- 20+ 种任务类型（喂食/洗澡/抚摸/小游戏/打工/签到/购物/属性达标等），金币+经验奖励
- `constants.js` 新增 4 个 IPC 通道：`QUEST_DAILY`/`QUEST_CLAIM`/`QUEST_ACHIEVEMENTS`/`QUEST_ACHIEVEMENT_CLAIM`

### 其他
- `pet-ai.js`：1027 → 886 行（优化/重构）
- `status.html`、`status-bar.js` 更新
- `index.js` 行数回落到 606（退出逻辑精简 + handleMenuAction 替代硬编码）

## 2026-06-04 下午变更

### Phase 3 收尾（爪爪）
- 测试框架重构：55 → **32/32 全绿**，精简为核心路径覆盖
- RPS 猜拳双层封装 bug 修复
- 食物反应结算修正
- MockDB 参数偏移修复（UPDATE SET 占位符与 WHERE 占位符分离计数）
- 气泡菜单推迟到 Phase 2 稳定后

### Phase 3 收尾 — 记忆翻牌/节奏点击修复（爪爪，6/4 晚间）
- **根因**：preload.js `minigameStart`/`minigameFinish` 传参与 handler `payload` 字段名不匹配（传 `gameId` / `result`，handler 取 `gameType` / `score` → undefined）
- 修复 1：`preload.js` 参数格式对齐 → `{ gameType: gameId }` / `{ gameType: gameId, score }`
- 修复 2：`ipc-handlers.js` `startGame`/`finishGame` 返回失败时抛 Error（打破 `_wrapHandler` 双层封装掩盖）
- 修复 3：前端结算字段 `result.data.reward.gold`（对齐 `finishGame` 返回结构）
- 验收：4 标签切换 ✅、记忆翻牌全流程 ✅、节奏点击全流程 ✅、结算读后端数据 ✅、32/32 全绿 ✅

### 面板拖动 + 设置面板重做（爪爪，6/4 晚间）
- **新增 `renderer/components/panel-common.js`**：统一处理面板拖拽（header mousedown/mousemove/mouseup → IPC move-window）、ESC 关闭、入场退场动画
- 支持 `window._panelCloseHandler` 自定义关闭回调（settings 保存+关闭、mini-game 清理状态）
- `design-system.css`：标题栏 `cursor: grab` + `user-select: none`
- 6 面板全部接入：inventory/status/mini-game/work/theme/settings
- **设置面板重做**：4 页（声音/显示/通知/关于），与菜单子项对齐
- 声音：音效+BGM 开关+音量；显示：大小/透明度/动画速度/置顶/自启；通知：饥饿/生病/升级提醒+阈值+随机台词；关于：版本号动态读取+特性列表8项+项目路径动态读取
- `index.js` 补 `get-version` / `get-app-path` IPC handler（马维斯改了 preload+settings，爪爪补后端）

### 道具包 v4（重做，6/5）
- 完全重写，代码从 670 行精简到 ~350 行
- 面板尺寸 560×460，窗口和 CSS 同步
- 左侧 100px 分类栏（emoji+名称+数量角标）+ 右侧 5 列网格 + 底部详情栏
- 整个内容区可滚动，底部详情栏固定可见
- 覆盖 dp-panel overflow: visible 确保按钮可见
- 物品卡片稀有度边框色（common灰/uncommon绿/rare蓝/epic紫/legendary金）
- 服装逻辑清除：签到奖励替换、dress_up 任务/成就替换、dress-up.html 删除

### 测试框架（爪爪，6/4 晚间）
- `test/test-runner.js`：Node.js 原生 assert，零依赖，MockDatabase/MockEconomy/MockTimer
- 32/32 全绿：Economy(10) + SignIn(6) + Work(8) + MiniGame(8)

### Phase 3 剩余
| # | 任务 | 状态 |
|---|------|------|
| 1 | RPS 猜拳小游戏 | ✅ |
| 2 | 食物反应小游戏 | ✅ |
| 3 | 记忆翻牌小游戏 | ✅ |
| 4 | 节奏点击小游戏 | ✅ |
| 5 | 测试框架 | ✅ 32/32 |
| 6 | 任务系统 quest.js | ✅ |
| 7 | 面板拖动 | ✅ panel-common.js 覆盖 6 面板 |
| 8 | 设置面板重做 | ✅ 4页（声音/显示/通知/关于）|
| 9 | 气泡菜单 | ⏸ 最低优先级，正式版上线前再推进（桑总 6/4 决策） |
| 10 | 打工时间缩短 | ✅ 8种工作 1-16分钟 |
| 11 | 小游戏规则说明 | ✅ 4款游戏均添加规则提示 |

### 动画切换速度全局拉长（马维斯规格 → file-agent 执行，6/4 下午）
- 行为持续时间 6 种翻倍：WALK 20→45s, SIT 30→60s, IDLE 25→50s, DANCE 20→40s, READ 35→70s, BALL 25→50s
- 精灵图 FPS 降级 fallback：idle 8→5, walk 10→6, scratch 8→5, sleep 4→3, run 12→7, begin 8→5
- OneShot 动画时长：wiggle 1200→2000ms, jump 550→1000ms, stretch 800→1500ms
- CSS 过渡变量 6 个各 +100~200ms：fast 150→250, normal 200→350, slow 300→500, spring 500→700, smooth 400→600, bounce 600→800
- card-hover 500→800ms
- 32/32 全绿

涉及文件：constants.js / animation-system.js / tokens.css / animations.css

## 2026-06-04 晚间变更（Phase 4 Steam 适配）

### Phase 4 任务进度

| # | 任务 | 状态 | 备注 |
|---|------|------|------|
| 1 | electron-builder 打包配置 | ✅ 已完成 | package.json 已配置 build/pack/dist |
| 2 | performance.js 性能监控 | ✅ 已完成 | 详见下方 |
| 3 | i18n.js 多语言 | ✅ 已完成 | 详见下方 |
| 4 | greenworks 编译链预验证 | ⏸ 后续 | 需 Steamworks SDK + VS + node-gyp |
| 5 | 成就/云存档/创意工坊 | ⏸ 后续 | 依赖 greenworks |

### performance.js 性能监控模块

**文件**：`src/main/performance.js`（新建），纯 Node.js 无外部依赖。

**监控指标**（每 10 秒采样）：
- CPU 使用率：`process.cpuUsage()` 差值计算
- 内存：`process.memoryUsage().heapUsed`
- 帧率：预留 IPC 上报接口

**三级降级策略**：
- 级别 0（正常）：CPU < 30%
- 级别 1（轻度）：CPU 30-60%，动画帧率降到 60%
- 级别 2（重度）：CPU > 60%，暂停面板动画和气泡打字机

**接口**：
- `start()` / `stop()` — 启停监控
- `getStatus()` — 返回 `{ cpu, memory, level, fps }`
- `onDowngrade(callback)` / `onRestore(callback)` — 降级/恢复回调
- `saveBaseline(path)` — 写 `perf-baseline.json`，格式 `{ cpu, memory, timestamp }`
- `reportFps(fps)` — 帧率上报（renderer 通过 IPC 调用）

**集成**：`index.js` 中 `app.whenReady` 后调 `performance.start()`，降级回调通过 emitter 通知 renderer。

**导出**：类 `PerformanceMonitor`，底部 `module.exports = new PerformanceMonitor()` 单例。

### i18n.js 多语言模块

**文件**：`src/main/i18n.js`（新建）+ `locales/{zh-CN,en,ja,ko}.json`（新建目录）

**接口**：
- `init()` — 加载语言包
- `t(key, params)` — 翻译，键缺失回退中文 + console.warn
- `setLocale(locale)` / `getLocale()` — 切换/获取语言
- `getSupportedLocales()` — 返回 `['zh-CN','en','ja','ko']`
- 自动检测：`app.getLocale()`，不在支持列表回退 `en`
- 类 `I18n`，底部单例导出

**语言文件**：
- `zh-CN.json`：完整中文
- `en.json`：完整英文翻译
- `ja.json` / `ko.json`：结构一致，用英文填充 + 标注 `TODO`

**集成**：`index.js` 中 `app.whenReady` 后调 `i18n.init()`，暂不暴露 IPC（Phase 5 再给前端）。

### IPC 频道新增

`constants.js` 新增 4 个性能监控相关频道：
- `PERFORMANCE_REPORT_FPS`: 'performance:report-fps'
- `PERFORMANCE_GET_STATUS`: 'performance:get-status'
- `PERFORMANCE_DOWNGRADE`: 'performance:downgrade'
- `PERFORMANCE_RESTORE`: 'performance:restore'

### index.js 集成

- `app.whenReady` 后初始化 `i18n.init()` 和 `performance.start()`
- 注册性能降级回调，通过 IPC 推送给 renderer
- `before-quit` 时停止 `performance.stop()`
- 新增 IPC 处理器：`performance:report-fps` / `performance:get-status`

### 测试结果
- 32/32 全绿 ✅

### 修改文件清单
| 文件 | 变更 |
|------|------|
| src/main/performance.js | 新建，性能监控模块 |
| src/main/i18n.js | 新建，多语言模块 |
| src/main/constants.js | 新增 4 个性能监控 IPC 频道 |
| src/main/index.js | 集成 performance + i18n |
| locales/zh-CN.json | 新建，中文语言包 |
| locales/en.json | 新建，英文语言包 |
| locales/ja.json | 新建，日文语言包（TODO） |
| locales/ko.json | 新建，韩文语言包（TODO） |

## 2026-06-05

### Phase 4 推进
- performance.js ✅ — getStatus 返回 {cpu,memory,level,fps}、reportFps、三级降级、4 个 IPC 频道
- i18n.js ✅ — 230 行完整实现 + locales/ 四语 JSON (zh-CN/en/ja/ko)，自动检测系统语言
- 32/32 全绿

### 状态切换问题排查 → 已修复
- 桑总反馈走路/蹲/转圈/背对走路状态切换太快（1-2 秒）
- 马维斯初始推测后端行为树四层叠加 → 翻倍 duration + 降 FPS + 拉长 CSS → 无效
- **2026-06-05 桑总新线索**：DevTools 日志显示后端一直推 `walk`，实际渲染在走路/转圈间闪切
- **马维斯审查定位根因**：`animation-system.js` `setAnim()` 每次收到推送无条件重置 `currentFrame = 0`，walk 动画 42 帧 6fps 需要 ~7 秒走完一圈，index.js 每 3 秒推一次导致动画永远走不出完整步伐，开头几帧反复播放表现为"走路起步和转圈之间闪切"
- **修复 v3**（根本性）：直接在 `setAnim()` 入口拦截 `if (currentAnim === animName) return`，无论从 `setStatus`/`autoState`/`setState` 还是任何路径调用，同动画不重置帧。v1/v2 在调用层做判断不够彻底，v3 一劳永逸
- **帧数问题**：SCAN `alpha > 30` 阈值过高，过滤了大量过渡帧（scratch 28→8 帧丢 70%），2 秒急循环。去掉 SCAN 后空白帧出现，折中方案：改回 SCAN，阈值降为 `alpha > 0`，只过滤真·全透明空帧

### 代码审核报告 P0 清零（桑总 + 爪爪）
- **3.3 IPC 速率限制** ✅ — `_wrapHandler` 加滑动窗口限流（写10/min、读60/min、其他30/min）
- **3.4 旧存档降级** ✅ — catch 内重置安全默认值并 saveStatus 写回，双重兜底
- **3.5 timer 内存泄漏** ✅ — 追踪 timerType 区分 interval/timeout，`_clearTimer` 按类型清
- **3.6 i18n 路径修复** ✅ — `../../locales` → `../locales`
- **3.7 魔法数字清理** ✅ — constants.js 新增 23 个常量，6 个文件替换引用
- **3.8 日志轮转** ✅ — 新建 `src/main/logger.js`，每天切文件保留 7 天，单文件 5MB 截断
- **3.1 调试代码** ⏸ 保留（调试阶段）
- **3.2 SQL 注入 _escapeSql** ⏸ 技术债 — sql.js 升级至 1.14.1, `bind(1,val)` 单参数后 `getAsObject()` 仍返回 undefined（仅数组 `bind([1,val])` 正常），_escapeSql 保留。注释已更新标注 "1.10.3 ~ 1.14.1 均存在"
- 32/32 全绿