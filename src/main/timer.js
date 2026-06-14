// ══════════════════════════════════════════════
// timer.js — 可暂停的定时器管理类
// 支持暂停/恢复单个或全部定时器，用于睡眠/唤醒场景
// ══════════════════════════════════════════════

'use strict';

class Timer {
  constructor() {
    /** @type {Map<string, {callback: Function, interval: number, timerId: NodeJS.Timeout|null, timerType: 'interval'|'timeout'|null, paused: boolean, remaining: number, lastTick: number}>} */
    this.timers = new Map();
  }

  /**
   * 清除定时器（根据类型使用正确的 clear 函数）
   * @param {Object} timer 定时器对象
   * @private
   */
  _clearTimer(timer) {
    if (timer.timerId === null) return;
    if (timer.timerType === 'timeout') {
      clearTimeout(timer.timerId);
    } else {
      clearInterval(timer.timerId);
    }
    timer.timerId = null;
    timer.timerType = null;
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

    const timerId = setInterval(() => {
      const t = this.timers.get(id);
      if (t) t.lastTick = Date.now();
      callback();
    }, interval);

    this.timers.set(id, {
      callback,
      interval,
      timerId,
      timerType: 'interval',
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

    // 记录暂停时剩余时间
    const elapsed = Date.now() - timer.lastTick;
    timer.remaining = Math.max(0, timer.interval - elapsed);

    // 清除系统定时器
    this._clearTimer(timer);
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

    timer.paused = false;

    if (timer.remaining > 0) {
      // 先用剩余时间触发一次，然后恢复常规间隔
      timer.timerId = setTimeout(() => {
        timer.lastTick = Date.now();
        timer.callback();
        // 切换为 interval
        timer.timerId = setInterval(() => {
          timer.lastTick = Date.now();
          timer.callback();
        }, timer.interval);
        timer.timerType = 'interval';
      }, timer.remaining);
      timer.timerType = 'timeout';
    } else {
      // 无剩余时间，直接恢复 interval
      timer.timerId = setInterval(() => {
        timer.lastTick = Date.now();
        timer.callback();
      }, timer.interval);
      timer.timerType = 'interval';
    }

    timer.remaining = 0;
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

    this._clearTimer(timer);
    this.timers.delete(id);
    console.log(`[Timer] 销毁: ${id}`);
  }

  /**
   * 销毁所有定时器
   */
  destroyAll() {
    for (const [id, timer] of this.timers) {
      this._clearTimer(timer);
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
