// ══════════════════════════════════════════════
// performance.js — 性能监控模块
// 监控 CPU/内存使用，实现三级降级策略
// ══════════════════════════════════════════════

'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

/**
 * 性能降级级别
 * - 级别 0：正常（CPU < 30%）
 * - 级别 1：轻度降级（CPU 30-60%，动画帧率降 60%）
 * - 级别 2：重度降级（CPU > 60%，暂停面板动画和气泡打字机）
 */
const DOWNGRADE_LEVELS = {
  NORMAL: 0,
  LIGHT: 1,
  HEAVY: 2,
};

// 降级阈值
const THRESHOLDS = {
  CPU_LIGHT: 30, // CPU 30% → 级别 1
  CPU_HEAVY: 60, // CPU 60% → 级别 2
  MEMORY_WARNING: 500 * 1024 * 1024, // 500MB 内存警告
};

// 采样间隔（毫秒）
const SAMPLE_INTERVAL = 10 * 1000; // 10 秒

class PerformanceMonitor extends EventEmitter {
  constructor() {
    super();

    /** @type {boolean} 是否正在运行 */
    this._running = false;

    /** @type {NodeJS.Timer|null} 采样定时器 */
    this._timer = null;

    /** @type {number} 当前降级级别 */
    this._level = DOWNGRADE_LEVELS.NORMAL;

    /** @type {Object} 上一次 CPU 采样数据 */
    this._lastCpuUsage = null;

    /** @type {Object} 性能基线 */
    this._baseline = null;

    /** @type {Object[]} 历史采样记录（最近 60 个） */
    this._history = [];

    /** @type {number} 最大历史记录数 */
    this._maxHistory = 60;

    /** @type {number} 帧率（由 renderer 通过 IPC 上报） */
    this._fps = 0;
  }

  /**
   * 启动性能监控
   */
  start() {
    if (this._running) {
      console.warn('[Performance] 已在运行中');
      return;
    }

    this._running = true;
    this._lastCpuUsage = process.cpuUsage();

    // 立即采样一次
    this._sample();

    // 启动定时采样
    this._timer = setInterval(() => this._sample(), SAMPLE_INTERVAL);

    console.log('[Performance] 性能监控已启动，采样间隔:', SAMPLE_INTERVAL / 1000, '秒');
  }

  /**
   * 停止性能监控
   */
  stop() {
    if (!this._running) {
      return;
    }

    this._running = false;

    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }

    console.log('[Performance] 性能监控已停止');
  }

  /**
   * 获取当前性能状态
   * @returns {Object} 性能状态 { cpu, memory, level, fps }
   */
  getStatus() {
    const lastSample = this._history.length > 0 ? this._history[this._history.length - 1] : null;

    return {
      cpu: lastSample ? lastSample.cpuPercent : 0,
      memory: lastSample ? lastSample.heapUsed : 0,
      level: this._level,
      fps: this._fps,
    };
  }

  /**
   * 上报帧率（由 renderer 通过 IPC 调用）
   * @param {number} fps 当前帧率
   */
  reportFps(fps) {
    this._fps = typeof fps === 'number' ? fps : 0;
  }

  /**
   * 注册降级回调
   * @param {Function} callback 降级回调函数，参数为 (level, metrics)
   */
  onDowngrade(callback) {
    this.on('downgrade', callback);
  }

  /**
   * 注册恢复回调
   * @param {Function} callback 恢复回调函数，参数为 (level, metrics)
   */
  onRestore(callback) {
    this.on('restore', callback);
  }

  /**
   * 保存性能基线到文件
   * @param {string} filePath 文件路径
   */
  saveBaseline(filePath) {
    if (this._history.length === 0) {
      console.warn('[Performance] 无历史数据，无法生成基线');
      return;
    }

    // 计算平均值
    const avgCpu = this._history.reduce((sum, s) => sum + s.cpuPercent, 0) / this._history.length;
    const avgMemory = this._history.reduce((sum, s) => sum + s.heapUsed, 0) / this._history.length;

    this._baseline = {
      cpu: Math.round(avgCpu * 100) / 100,
      memory: Math.round(avgMemory),
      timestamp: Date.now(),
    };

    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(this._baseline, null, 2), 'utf-8');
      console.log('[Performance] 基线已保存:', filePath);
    } catch (err) {
      console.error('[Performance] 保存基线失败:', err.message);
    }
  }

  /**
   * 内部采样方法
   * @private
   */
  _sample() {
    try {
      // 1. CPU 使用率（差值计算）
      const cpuUsage = process.cpuUsage(this._lastCpuUsage);
      this._lastCpuUsage = process.cpuUsage();

      // 计算 CPU 百分比（user + system 时间 / 采样间隔）
      const cpuTime = (cpuUsage.user + cpuUsage.system) / 1000; // 微秒 → 毫秒
      const cpuPercent = (cpuTime / SAMPLE_INTERVAL) * 100;

      // 2. 内存使用
      const memoryUsage = process.memoryUsage();

      // 3. 组装采样数据
      const sample = {
        timestamp: Date.now(),
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        heapUsed: memoryUsage.heapUsed,
        heapUsedMB: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotal: memoryUsage.heapTotal,
        rss: memoryUsage.rss,
        external: memoryUsage.external,
      };

      // 4. 记录历史
      this._history.push(sample);
      if (this._history.length > this._maxHistory) {
        this._history.shift();
      }

      // 5. 判断降级级别
      const newLevel = this._calculateLevel(sample);

      // 6. 级别变化时触发事件
      if (newLevel !== this._level) {
        const oldLevel = this._level;
        this._level = newLevel;

        if (newLevel > oldLevel) {
          // 降级
          console.log(
            `[Performance] 降级: ${this._getLevelName(oldLevel)} → ${this._getLevelName(newLevel)}, CPU: ${sample.cpuPercent}%`,
          );
          this.emit('downgrade', newLevel, sample);
        } else {
          // 恢复
          console.log(
            `[Performance] 恢复: ${this._getLevelName(oldLevel)} → ${this._getLevelName(newLevel)}, CPU: ${sample.cpuPercent}%`,
          );
          this.emit('restore', newLevel, sample);
        }
      }

      // 7. 内存警告
      if (sample.heapUsed > THRESHOLDS.MEMORY_WARNING) {
        console.warn(`[Performance] 内存警告: ${sample.heapUsedMB} MB`);
      }
    } catch (err) {
      console.error('[Performance] 采样失败:', err.message);
    }
  }

  /**
   * 计算降级级别
   * @param {Object} sample 采样数据
   * @returns {number} 降级级别
   * @private
   */
  _calculateLevel(sample) {
    if (sample.cpuPercent >= THRESHOLDS.CPU_HEAVY) {
      return DOWNGRADE_LEVELS.HEAVY;
    }
    if (sample.cpuPercent >= THRESHOLDS.CPU_LIGHT) {
      return DOWNGRADE_LEVELS.LIGHT;
    }
    return DOWNGRADE_LEVELS.NORMAL;
  }

  /**
   * 获取级别名称
   * @param {number} level 级别
   * @returns {string} 级别名称
   * @private
   */
  _getLevelName(level) {
    switch (level) {
      case DOWNGRADE_LEVELS.NORMAL:
        return '正常';
      case DOWNGRADE_LEVELS.LIGHT:
        return '轻度降级';
      case DOWNGRADE_LEVELS.HEAVY:
        return '重度降级';
      default:
        return '未知';
    }
  }
}

// 导出单例
module.exports = new PerformanceMonitor();
