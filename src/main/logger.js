// ══════════════════════════════════════════════
// logger.js — 轻量日志轮转模块
// 拦截 console.log/warn/error → 同时写文件
// 日志目录：desktop-pet/logs/
// 每天切文件，保留最近 7 天，单文件上限 5MB
// ══════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');

const MAX_DAYS = 7; // 保留最近 7 天
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 单文件 5MB 上限

let logsDir = null;
let currentFile = null;
let currentDate = null;
const originalConsole = {};
let enabled = false;

/**
 * 获取今天的日期字符串 YYYY-MM-DD
 */
function _today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 获取当前时间戳 HH:mm:ss.SSS
 */
function _timestamp() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/**
 * 确保日志目录存在
 */
function _ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 获取今天的日志文件路径，必要时切换
 */
function _getLogFile() {
  const today = _today();
  if (currentDate === today && currentFile && fs.existsSync(currentFile)) {
    // 检查文件大小
    try {
      const stat = fs.statSync(currentFile);
      if (stat.size < MAX_FILE_SIZE) {
        return currentFile;
      }
      // 超出大小限制，截断（保留后半部分）
      const content = fs.readFileSync(currentFile, 'utf-8');
      const lines = content.split('\n');
      const keep = lines.slice(Math.floor(lines.length / 2));
      fs.writeFileSync(currentFile, keep.join('\n'), 'utf-8');
      return currentFile;
    } catch (e) {
      // 文件异常，重新创建
    }
  }

  // 切换到今天的文件
  currentDate = today;
  currentFile = path.join(logsDir, `pet-${today}.log`);
  return currentFile;
}

/**
 * 写日志到文件
 */
function _writeFile(level, args) {
  try {
    const file = _getLogFile();
    const msg = args
      .map((a) => {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === 'object') {
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        }
        return String(a);
      })
      .join(' ');
    const line = `[${_timestamp()}] [${level}] ${msg}\n`;
    fs.appendFileSync(file, line, 'utf-8');
  } catch (e) {
    // 写日志失败不影响主流程
  }
}

/**
 * 清理过期日志文件（保留最近 MAX_DAYS 天）
 */
function _cleanOldLogs() {
  try {
    if (!fs.existsSync(logsDir)) return;
    const files = fs.readdirSync(logsDir).filter((f) => f.startsWith('pet-') && f.endsWith('.log'));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_DAYS);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;

    for (const file of files) {
      // pet-YYYY-MM-DD.log
      const dateStr = file.replace('pet-', '').replace('.log', '');
      if (dateStr < cutoffStr) {
        try {
          fs.unlinkSync(path.join(logsDir, file));
          originalConsole.log('[Logger] 清理过期日志:', file);
        } catch (e) {
          // 删除失败静默
        }
      }
    }
  } catch (e) {
    // 清理失败静默
  }
}

/**
 * 启用日志记录
 * @param {string} [projectDir] 项目根目录，默认从 __dirname 推断
 */
function enable(projectDir) {
  if (enabled) return;

  const root = projectDir || path.join(__dirname, '..');
  logsDir = path.join(root, 'logs');
  _ensureDir(logsDir);

  // 保存原始 console 方法
  originalConsole.log = console.log;
  originalConsole.warn = console.warn;
  originalConsole.error = console.error;

  // 拦截 console 方法
  console.log = (...args) => {
    originalConsole.log(...args);
    _writeFile('LOG', args);
  };
  console.warn = (...args) => {
    originalConsole.warn(...args);
    _writeFile('WARN', args);
  };
  console.error = (...args) => {
    originalConsole.error(...args);
    _writeFile('ERROR', args);
  };

  enabled = true;

  // 启动时清理过期日志
  _cleanOldLogs();

  originalConsole.log('[Logger] 日志已启用，目录:', logsDir);
}

/**
 * 禁用日志记录，恢复原始 console
 */
function disable() {
  if (!enabled) return;

  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;

  enabled = false;
  currentFile = null;
  currentDate = null;
}

module.exports = { enable, disable };
