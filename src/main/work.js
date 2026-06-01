// ══════════════════════════════════════════════
// work.js — 打工系统类
// 8种工作、开始/取消/完成打工、奖励结算
// ══════════════════════════════════════════════

'use strict';

const { WORK_JOBS } = require('./constants');

class WorkSystem {
  /**
   * @param {PetDatabase} database 数据库实例
   * @param {Economy} economy 经济系统实例
   * @param {Timer} timer 定时器管理器
   */
  constructor(database, economy, timer) {
    /** @type {PetDatabase} */
    this.db = database;
    /** @type {Economy} */
    this.economy = economy;
    /** @type {Timer} */
    this.timer = timer;

    /** @type {Map<number, {workType: string, startTime: number, finishTime: number, recordId: number}>} 活跃打工记录 */
    this.activeWork = new Map();
  }

  /**
   * 开始打工
   * @param {number} userId 用户ID
   * @param {string} workType 工作类型
   * @returns {{ success: boolean, message: string, finishTime: number|null }}
   */
  startWork(userId, workType) {
    // 检查是否已在打工
    if (this.activeWork.has(userId)) {
      return { success: false, message: '你正在打工中，请先完成或取消当前工作', finishTime: null };
    }

    // 检查工作类型是否有效
    const jobConfig = WORK_JOBS[workType];
    if (!jobConfig) {
      return { success: false, message: '未知的工作类型', finishTime: null };
    }

    // 检查用户等级
    const user = this.db.get('SELECT level FROM users WHERE id = ?', userId);
    if (!user || user.level < jobConfig.minLevel) {
      return { success: false, message: `需要 ${jobConfig.minLevel} 级才能做这份工作`, finishTime: null };
    }

    // 检查体力
    const petStatus = this.db.get('SELECT stamina FROM pet_status WHERE pet_id = 1');
    if (petStatus && petStatus.stamina < jobConfig.staminaCost) {
      return { success: false, message: '体力不足，先休息一下吧', finishTime: null };
    }

    // 检查是否生病
    const sickCheck = this.db.get('SELECT is_sick FROM pet_status WHERE pet_id = 1');
    if (sickCheck && sickCheck.is_sick) {
      return { success: false, message: '爪爪生病了，不能打工', finishTime: null };
    }

    const now = Date.now();
    const finishTime = now + jobConfig.duration;

    // 扣除体力
    this.db.run(
      'UPDATE pet_status SET stamina = MAX(0, stamina - ?) WHERE pet_id = 1',
      jobConfig.staminaCost
    );

    // 创建打工记录（参数化查询，避免 SQL 注入）
    const durationSeconds = Math.floor(jobConfig.duration / 1000);
    const result = this.db.run(
      `INSERT INTO work_records (user_id, work_type, started_at, finish_at, reward, status)
       VALUES (?, ?, datetime('now'), datetime('now', '+' || ? || ' seconds'), ?, 'working')`,
      userId, workType, durationSeconds, jobConfig.baseReward
    );

    const recordId = result.lastInsertRowid;

    // 记录到活跃打工
    this.activeWork.set(userId, {
      workType,
      startTime: now,
      finishTime,
      recordId,
    });

    // 设置自动完成定时器
    const timerId = `work_${userId}`;
    this.timer.add(timerId, () => {
      this.finishWork(userId);
    }, jobConfig.duration);

    // 记录日志
    try {
      this.db.run(
        'INSERT INTO event_log (user_id, event_type, event_data) VALUES (?, ?, ?)',
        userId, 'work_start', JSON.stringify({ workType, finishTime })
      );
    } catch (err) {
      console.error('[Work] 日志记录失败:', err.message);
    }

    return {
      success: true,
      message: `开始${jobConfig.name}！预计${this._formatDuration(jobConfig.duration)}后完成`,
      finishTime,
    };
  }

  /**
   * 取消打工（惩罚：扣除20%金币奖励）
   * @param {number} userId 用户ID
   * @returns {{ success: boolean, message: string, penalty: number }}
   */
  cancelWork(userId) {
    const active = this.activeWork.get(userId);
    if (!active) {
      return { success: false, message: '没有进行中的打工', penalty: 0 };
    }

    const jobConfig = WORK_JOBS[active.workType];
    const penalty = Math.floor(jobConfig.baseReward * 0.2);

    // 更新记录状态
    this.db.run(
      "UPDATE work_records SET status = 'cancelled' WHERE id = ?",
      active.recordId
    );

    // 扣除惩罚金币
    this.db.run(
      'UPDATE users SET gold = MAX(0, gold - ?) WHERE id = ?',
      penalty, userId
    );

    // 清除定时器
    this.timer.destroy(`work_${userId}`);

    // 移除活跃记录
    this.activeWork.delete(userId);

    // 记录日志
    try {
      this.db.run(
        'INSERT INTO event_log (user_id, event_type, event_data) VALUES (?, ?, ?)',
        userId, 'work_cancel', JSON.stringify({ workType: active.workType, penalty })
      );
    } catch (err) {
      console.error('[Work] 取消日志记录失败:', err.message);
    }

    return {
      success: true,
      message: `打工已取消，扣除 ${penalty} 金币作为惩罚`,
      penalty,
    };
  }

  /**
   * 打工完成结算
   * @param {number} userId 用户ID
   * @returns {{ success: boolean, message: string, reward: Object }}
   */
  finishWork(userId) {
    const active = this.activeWork.get(userId);
    if (!active) {
      return { success: false, message: '没有进行中的打工', reward: {} };
    }

    const jobConfig = WORK_JOBS[active.workType];

    // 计算奖励（基础金币 + 采集技能加成）
    const gatheringBonus = this._getGatheringBonus(userId);
    const goldReward = Math.floor(jobConfig.baseReward * gatheringBonus);

    // 发放金币
    this.economy.addGold(userId, goldReward, `打工: ${jobConfig.name}`);

    // 经验奖励
    const expReward = Math.floor(jobConfig.baseReward * 0.3);
    this.db.run('UPDATE users SET exp = exp + ? WHERE id = ?', expReward, userId);

    // 检查 bonus 道具
    let bonusItem = null;
    if (jobConfig.bonusItems && jobConfig.bonusItems.length > 0) {
      // 30%概率获得bonus道具
      if (Math.random() < 0.3) {
        bonusItem = jobConfig.bonusItems[Math.floor(Math.random() * jobConfig.bonusItems.length)];
        this.economy.addItem(userId, bonusItem, 1);
      }
    }

    // 检查钻石奖励
    let bonusDiamond = 0;
    if (jobConfig.bonusDiamond) {
      bonusDiamond = jobConfig.bonusDiamond;
      this.economy.addDiamond(userId, bonusDiamond, `打工: ${jobConfig.name}`);
    }

    // 更新记录状态
    this.db.run(
      "UPDATE work_records SET status = 'completed', finished_at = datetime('now'), reward = ? WHERE id = ?",
      goldReward, active.recordId
    );

    // 清除定时器（可能已被触发或手动调用）
    if (this.timer.has(`work_${userId}`)) {
      this.timer.destroy(`work_${userId}`);
    }

    // 移除活跃记录
    this.activeWork.delete(userId);

    // 更新任务进度
    // 这里通过事件系统通知 quest
    try {
      this.db.run(
        'INSERT INTO event_log (user_id, event_type, event_data) VALUES (?, ?, ?)',
        userId, 'work_finish', JSON.stringify({ workType: active.workType, goldReward, expReward, bonusItem, bonusDiamond })
      );
    } catch (err) {
      console.error('[Work] 完成日志记录失败:', err.message);
    }

    return {
      success: true,
      message: `${jobConfig.name}完成！获得 ${goldReward} 金币`,
      reward: {
        gold: goldReward,
        exp: expReward,
        item: bonusItem,
        diamond: bonusDiamond,
      },
    };
  }

  /**
   * 获取当前打工状态
   * @param {number} userId 用户ID
   * @returns {Object} 打工状态
   */
  getWorkStatus(userId) {
    const active = this.activeWork.get(userId);
    if (!active) {
      return { isWorking: false, workType: null, remaining: 0, finishTime: null };
    }

    const now = Date.now();
    const remaining = Math.max(0, active.finishTime - now);
    const jobConfig = WORK_JOBS[active.workType];

    return {
      isWorking: true,
      workType: active.workType,
      workName: jobConfig.name,
      remaining,
      finishTime: active.finishTime,
      progress: remaining > 0 ? 1 - (remaining / jobConfig.duration) : 1,
    };
  }

  /**
   * 获取可用工作列表（按等级过滤）
   * @param {number} level 用户等级
   * @returns {Array} 可用工作列表
   */
  getAvailableJobs(level) {
    const jobs = [];
    for (const [key, config] of Object.entries(WORK_JOBS)) {
      jobs.push({
        type: key,
        name: config.name,
        description: config.description,
        duration: config.duration,
        durationText: this._formatDuration(config.duration),
        baseReward: config.baseReward,
        minLevel: config.minLevel,
        staminaCost: config.staminaCost,
        available: level >= config.minLevel,
        bonusItems: config.bonusItems || [],
        bonusDiamond: config.bonusDiamond || 0,
      });
    }
    return jobs;
  }

  // ══════════════════════════════════════════════
  // 私有方法
  // ══════════════════════════════════════════════

  /**
   * 获取采集技能加成倍率
   * @private
   */
  _getGatheringBonus(userId) {
    const skill = this.db.get(
      'SELECT level FROM pet_skills WHERE pet_id = 1 AND skill_type = ?',
      'gathering'
    );
    if (!skill) return 1.0;
    return 1.0 + skill.level * 0.05;
  }

  /**
   * 格式化持续时间
   * @param {number} ms 毫秒
   * @returns {string} 格式化文本
   * @private
   */
  _formatDuration(ms) {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) {
      return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
    }
    return `${minutes}分钟`;
  }
}

module.exports = WorkSystem;
