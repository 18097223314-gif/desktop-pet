// ══════════════════════════════════════════════
// timer.js — 可暂停的定时器管理类
// 支持暂停/恢复单个或全部定时器，用于睡眠/唤醒场景
// ══════════════════════════════════════════════

'use strict';

class Timer {
  constructor() {
    /** @type {Map<string, {callback: Function, interval: number, timerId: NodeJS.Timeout|null, paused: boolean, remaining: number, lastTick: number}>} */
    this.timers = new Map();
  }

  /**
   * 添加一个定时器
   * @param {string} id 定时器唯一标识
   * @param {Function} callback 回调函数
   * @param {number} interval 间隔时间（毫秒）
   */
  add(id, callback, interval) {
    // 如果已存在则先销毁
    if (this.timers.has(id)) {
      this.destroy(id);
    }

    const timerId = setInterval(callback, interval);

    this.timers.set(id, {
      callback,
      interval,
      timerId,
      paused: false,
      remaining: 0,
      lastTick: Date.now(),
    });
  }

  /**
   * 暂停指定定时器
   * @param {string} id 定时器标识
   */
  pause(id) {
    const timer = this.timers.get(id);
    if (!timer || timer.paused) return;

    // 清除系统定时器
    clearInterval(timer.timerId);
    timer.timerId = null;

    // 记录暂停时剩余时间
    const elapsed = Date.now() - timer.lastTick;
    timer.remaining = timer.interval - elapsed;
    if (timer.remaining < 0) timer.remaining = 0;
    timer.paused = true;

    console.log(`[Timer] 暂停: ${id}, 剩余 ${timer.remaining}ms`);
  }

  /**
   * 恢复指定定时器
   * @param {string} id 定时器标识
   */
  resume(id) {
    const timer = this.timers.get(id);
    if (!timer || !timer.paused) return;

    // 先用剩余时间触发一次定时，之后恢复常规间隔
    const resumeCallback = () => {
      timer.callback();
      timer.lastTick = Date.now();
      // 恢复正常间隔
      timer.timerId = setInterval(() => {
        timer.callback();
        timer.lastTick = Date.now();
      }, timer.interval);
    };

    // 如果剩余时间 > 0，先等待剩余时间再恢复
    if (timer.remaining > 0) {
      timer.timerId = setTimeout(resumeCallback, timer.remaining);
    } else {
      resumeCallback();
    }

    timer.paused = false;
    console.log(`[Timer] 恢复: ${id}`);
  }

  /**
   * 暂停所有定时器（宠物睡眠时调用）
   */
  pauseAll() {
    for (const id of this.timers.keys()) {
      this.pause(id);
    }
    console.log('[Timer] 已暂停所有定时器');
  }

  /**
   * 恢复所有定时器（宠物唤醒时调用）
   */
  resumeAll() {
    for (const id of this.timers.keys()) {
      this.resume(id);
    }
    console.log('[Timer] 已恢复所有定时器');
  }

  /**
   * 销毁指定定时器
   * @param {string} id 定时器标识
   */
  destroy(id) {
    const timer = this.timers.get(id);
    if (!timer) return;

    if (timer.timerId !== null) {
      clearTimeout(timer.timerId);
      clearInterval(timer.timerId);
    }
    this.timers.delete(id);
    console.log(`[Timer] 销毁: ${id}`);
  }

  /**
   * 销毁所有定时器
   */
  destroyAll() {
    for (const id of this.timers.keys()) {
      const timer = this.timers.get(id);
      if (timer && timer.timerId !== null) {
        clearTimeout(timer.timerId);
        clearInterval(timer.timerId);
      }
    }
    this.timers.clear();
    console.log('[Timer] 已销毁所有定时器');
  }

  /**
   * 检查定时器是否存在
   * @param {string} id 定时器标识
   * @returns {boolean}
   */
  has(id) {
    return this.timers.has(id);
  }

  /**
   * 检查定时器是否暂停
   * @param {string} id 定时器标识
   * @returns {boolean}
   */
  isPaused(id) {
    const timer = this.timers.get(id);
    return timer ? timer.paused : false;
  }
}

module.exports = Timer;
