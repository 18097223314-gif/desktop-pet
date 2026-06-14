# 错误处理审计报告

> 审计日期：2026-06-07  
> 审计范围：`src/main/` 全部 19 个 JS 文件 + `renderer/` 关键文件  
> 方法：grep 全部 catch 块，逐个分析处理模式

---

## 一、统计

| 指标 | 数值 |
|------|------|
| catch 块总数 | ~50 |
| 有日志 + 有恢复 | 35（✅ 合格） |
| 有日志但无恢复 | 8（⚠️ 需关注） |
| 静默失败（无日志） | 5（🔴 需修复） |
| 重新抛出 | 2（✅ 合格） |
| 全局异常处理器 | 0（🔴 缺失） |

---

## 二、🔴 需修复项（5 项）

### 2.1 无全局异常处理器

**位置**：`src/main/index.js`

**问题**：没有 `process.on('uncaughtException')` 和 `process.on('unhandledRejection')`。未捕获的异常会导致 Electron 进程静默崩溃，用户看到的是窗口消失，没有任何错误提示。

**建议**：在 `app.whenReady()` 之前添加：
```javascript
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
  logger.error('[FATAL] uncaughtException', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
  logger.error('[FATAL] unhandledRejection', reason);
});
```

### 2.2 SimpleStore JSON 解析失败静默重置

**位置**：`src/main/index.js:25`

```javascript
} catch (e) { this.data = {}; }
```

**问题**：`settings.json` 损坏时静默重置为空对象，用户的所有设置丢失且无提示。

**建议**：至少记录警告日志，并备份损坏文件：
```javascript
} catch (e) {
  console.warn('[Store] settings.json 解析失败，已重置:', e.message);
  // 备份损坏文件
  try { fs.copyFileSync(this._path, this._path + '.corrupted'); } catch (_) {}
  this.data = {};
}
```

### 2.3 getVersion 静默降级

**位置**：`src/main/index.js:416`

```javascript
} catch (e) { return '1.0.0'; }
```

**问题**：版本号读取失败时静默返回 '1.0.0'，设置面板"关于"页会显示错误版本。

**建议**：
```javascript
} catch (e) {
  console.warn('[App] 版本号读取失败:', e.message);
  return 'unknown';
}
```

### 2.4 animation-system.js meta.json 加载失败无日志

**位置**：`renderer/components/animation-system.js:130`

```javascript
.catch(() => {
  // 降级：硬编码
  columns = 14;
  meta = { ... };
});
```

**问题**：meta.json 加载失败时使用硬编码降级，但没有记录错误。如果精灵图也加载失败，用户会看到空白窗口，没有任何诊断信息。

**建议**：
```javascript
.catch((err) => {
  console.error('[Animation] meta.json 加载失败，使用硬编码降级:', err);
  columns = 14;
  meta = { ... };
});
```

### 2.5 database.js 多处 catch 无日志

**位置**：`src/main/database.js` 的 9 个 catch 块中，部分只有 `console.error` 但没有上下文信息。

具体检查结果：
- L99 `runMigrations`：✅ 可接受（首次启动 db_meta 表不存在是正常情况）
- L133 `runMigrations` 循环内：⚠️ 只 log 不 throw，迁移失败会继续执行下一个
- L200 `all()`：✅ 有 try-catch + 降级
- L262 `get()`：✅ 有降级返回 null
- L281 `run()`：⚠️ 只 log 不 throw，写入失败被吞
- L354/386/430 `saveToFile`：✅ 有错误日志

**建议**：`run()` 方法的 catch 应考虑是否需要 re-throw，取决于调用方是否能处理写入失败。

---

## 三、⚠️ 需关注项（8 项）

### 3.1 save-manager.js 批量保存部分失败

**位置**：`src/main/save-manager.js:93-107`

多个组件的 save 操作在循环中执行，单个组件失败只 log 不中断。这意味着如果 petAI 保存失败，其他组件仍会尝试保存，但 petAI 的数据会丢失。

**评估**：当前设计是合理的（best-effort 保存），但应在日志中标记哪些组件保存失败，方便排查。

### 3.2 pet-ai.js 表查询降级

**位置**：`src/main/pet-ai.js:767-778`

`users` 和 `achievements` 表查询失败时用 `console.warn` + 默认值降级。如果数据库损坏，用户会看到 0 级、0 经验、0 成就，但不会知道原因。

**建议**：累计多次查询失败后应触发数据库恢复机制。

### 3.3 pet-ai.js pushState 失败

**位置**：`src/main/pet-ai.js:831`

状态推送失败只 log，不影响后端逻辑。前端会收不到状态更新，但后端状态是正确的。下次推送会自动恢复。

**评估**：合理设计，但频率过高可能掩盖窗口已关闭的问题。

### 3.4 event-manager.js 事件触发/日志失败

**位置**：`src/main/event-manager.js:212, 225`

随机事件触发失败只 log，不影响主流程。合理设计。

### 3.5 i18n.js 语言包加载失败

**位置**：`src/main/i18n.js:155, 180`

语言包文件不存在或解析失败时降级到英文/中文。合理设计。

### 3.6 performance.js 监控失败

**位置**：`src/main/performance.js:168, 231`

CPU/内存采样失败只 log。合理设计（监控不应影响主功能）。

### 3.7 logger.js 日志写入失败

**位置**：`src/main/logger.js:65, 91, 114, 119`

日志文件写入失败（磁盘满、权限等）只 log 到 console。合理设计（日志系统本身不应崩溃）。

### 3.8 renderer pet-controller.js 签到 catch

**位置**：`renderer/pet-controller.js:195`

```javascript
catch (err) {
  BubbleComponent.show('签到出错: ' + (err.message || '未知错误'), 2500);
}
```

✅ 合格 — 用户可见的错误提示。

---

## 四、合格项（35 项）

ipc-handlers.js 的 `_wrapHandler` 是全项目最规范的错误处理：

```javascript
} catch (err) {
  console.error(`[IPC] ${channel} 错误:`, err.message);
  return { success: false, data: null, error: err.message, requestId };
}
```

所有 28+ 个业务 IPC handler 都通过 `_wrapHandler` 包装，统一错误格式。这是正确的做法。

save-manager.js 的所有 catch 块都有 `console.error` + 组件名 + 错误信息，可追溯。

---

## 五、总结

| 类别 | 数量 | 严重程度 |
|------|------|----------|
| 全局异常处理器缺失 | 1 | 🔴 高 |
| 静默失败（无日志） | 4 | 🔴 中 |
| 有日志但无恢复 | 8 | ⚠️ 低 |
| 合格 | 35 | ✅ |

**优先修复顺序**：
1. 添加全局异常处理器（5 分钟）
2. SimpleStore 损坏备份（2 分钟）
3. animation-system.js 加日志（1 分钟）
4. getVersion 加日志（1 分钟）
5. database.js run() 评估是否需要 re-throw（需讨论）

整体评价：错误处理水平中上。`_wrapHandler` + 速率限制的设计是规范的，save-manager 的 best-effort 策略合理。主要缺失是全局异常处理器和少量静默失败点。
