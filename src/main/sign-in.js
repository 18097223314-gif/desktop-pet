// ══════════════════════════════════════════════
// sign-in.js — 独立签到系统
// 每日签到、连续签到奖励阶梯、断签检测与处理
// ══════════════════════════════════════════════

'use strict';

const { SIGNIN_REWARDS_V2 } = require('./constants');

class SignInSystem {
  /**
   * @param {PetDatabase} database 数据库实例
   * @param {Economy} economy 经济系统实例（用于发放道具奖励）
   */
  constructor(database, economy) {
    /** @type {PetDatabase} */
    this.db = database;
    /** @type {Economy} */
    this.economy = economy;
  }

  /**
   * 执行签到
   * @param {number} userId 用户ID
   * @returns {{ success: boolean, message: string, consecutiveDays: number, reward: Object, todaySigned: boolean }}
   */
  signIn(userId) {
    const today = this._getTodayStr();

    // 先检查断签
    this.checkStreak(userId);

    // 获取当前签到信息
    const signInfo = this.db.get('SELECT * FROM sign_in WHERE user_id = ?', userId);

    if (!signInfo) {
      // 首次签到：插入记录
      this.db.run(
        'INSERT INTO sign_in (user_id, last_sign_date, consecutive_days, total_days) VALUES (?, ?, 1, 1)',
        userId,
        today,
      );
    } else {
      // 检查今天是否已签到
      if (signInfo.last_sign_date === today) {
        return {
          success: false,
          message: '今天已经签到过了',
          consecutiveDays: signInfo.consecutive_days || 0,
          reward: {},
          todaySigned: true,
        };
      }

      // 判断是否连续（checkStreak 已处理断签重置，这里只需 +1）
      const yesterday = this._getYesterdayStr();
      const isConsecutive = signInfo.last_sign_date === yesterday;
      const newConsecutive = isConsecutive ? (signInfo.consecutive_days || 0) + 1 : 1;
      const newTotal = signInfo.total_days + 1;

      this.db.run(
        'UPDATE sign_in SET last_sign_date = ?, consecutive_days = ?, total_days = ? WHERE user_id = ?',
        today,
        newConsecutive,
        newTotal,
        userId,
      );
    }

    // 获取更新后的签到信息
    const updatedInfo = this.db.get('SELECT * FROM sign_in WHERE user_id = ?', userId);
    const consecutiveDays = updatedInfo ? updatedInfo.consecutive_days : 1;

    // 计算奖励（基于新的连续天数）
    const reward = this._calculateReward(consecutiveDays);

    // 发放奖励
    this._grantReward(userId, reward);

    // 记录事件日志
    try {
      this.db.run(
        'INSERT INTO event_log (user_id, event_type, event_data) VALUES (?, ?, ?)',
        userId,
        'sign_in',
        JSON.stringify({ consecutiveDays, reward }),
      );
    } catch (err) {
      console.error('[SignIn] 日志记录失败:', err.message);
    }

    return {
      success: true,
      message: `签到成功！连续${consecutiveDays}天`,
      consecutiveDays,
      reward,
      todaySigned: true,
    };
  }

  /**
   * 获取签到信息
   * @param {number} userId 用户ID
   * @returns {Object} 签到信息
   */
  getSignInInfo(userId) {
    const info = this.db.get('SELECT * FROM sign_in WHERE user_id = ?', userId);

    if (!info) {
      return {
        consecutiveDays: 0,
        totalDays: 0,
        todaySigned: false,
        lastSignDate: null,
        nextReward: this._calculateReward(1),
        milestones: this._getMilestones(0),
      };
    }

    const today = this._getTodayStr();
    const yesterday = this._getYesterdayStr();
    const todaySigned = info.last_sign_date === today;

    // 断签检测：last_sign_date 既不是今天也不是昨天 → 连续天数已断
    const streakBroken = !todaySigned && info.last_sign_date !== yesterday;
    const consecutiveDays = streakBroken ? 0 : info.consecutive_days || 0;

    // 计算下次签到时的连续天数（用于预览奖励）
    let nextConsecutive;
    if (todaySigned) {
      // 今天已签到，下次签到是明天，连续 +1
      nextConsecutive = consecutiveDays + 1;
    } else if (streakBroken) {
      // 断签了，下次签到重置为 1
      nextConsecutive = 1;
    } else {
      // 昨天签了今天没签（连续未断），下次签到 +1
      nextConsecutive = consecutiveDays + 1;
    }
    const nextReward = this._calculateReward(nextConsecutive);

    return {
      consecutiveDays,
      totalDays: info.total_days || 0,
      todaySigned,
      lastSignDate: info.last_sign_date,
      nextReward,
      milestones: this._getMilestones(consecutiveDays),
    };
  }

  /**
   * 检查并处理断签
   * 新一天首次调用时检查：如果上次签到不是昨天，重置连续天数
   * @param {number} userId 用户ID
   * @returns {{ wasStreakBroken: boolean, previousStreak: number }}
   */
  checkStreak(userId) {
    const info = this.db.get('SELECT * FROM sign_in WHERE user_id = ?', userId);
    if (!info || !info.last_sign_date) {
      return { wasStreakBroken: false, previousStreak: 0 };
    }

    const today = this._getTodayStr();
    const yesterday = this._getYesterdayStr();

    // 如果今天已签到，不需要检查
    if (info.last_sign_date === today) {
      return { wasStreakBroken: false, previousStreak: info.consecutive_days || 0 };
    }

    // 如果上次签到是昨天，连续签到仍然有效
    if (info.last_sign_date === yesterday) {
      return { wasStreakBroken: false, previousStreak: info.consecutive_days || 0 };
    }

    // 断签：上次签到既不是今天也不是昨天 → 重置连续天数
    const previousStreak = info.consecutive_days || 0;

    // 断签惩罚：重置连续天数为0（下次签到时变为1），不扣除任何东西
    this.db.run('UPDATE sign_in SET consecutive_days = 0 WHERE user_id = ?', userId);

    // 记录断签日志
    try {
      this.db.run(
        'INSERT INTO event_log (user_id, event_type, event_data) VALUES (?, ?, ?)',
        userId,
        'streak_broken',
        JSON.stringify({ previousStreak }),
      );
    } catch (err) {
      console.error('[SignIn] 断签日志记录失败:', err.message);
    }

    console.log(`[SignIn] 用户${userId}断签，之前连续${previousStreak}天`);

    return { wasStreakBroken: true, previousStreak };
  }

  // ══════════════════════════════════════════════
  // 私有方法
  // ══════════════════════════════════════════════

  /**
   * 计算签到奖励
   * @param {number} consecutiveDays 连续天数
   * @returns {Object} 奖励信息 { gold, diamond, exp, item, title? }
   * @private
   */
  _calculateReward(consecutiveDays) {
    // 查找匹配的奖励阶梯
    let matched = null;
    const thresholds = Object.keys(SIGNIN_REWARDS_V2)
      .map((k) => parseInt(k, 10))
      .sort((a, b) => b - a); // 从高到低排序

    for (const threshold of thresholds) {
      if (consecutiveDays >= threshold) {
        matched = SIGNIN_REWARDS_V2[threshold];
        break;
      }
    }

    if (!matched) {
      matched = SIGNIN_REWARDS_V2[1]; // 保底：第1天奖励
    }

    return { ...matched };
  }

  /**
   * 发放签到奖励
   * @param {number} userId 用户ID
   * @param {Object} reward 奖励信息
   * @private
   */
  _grantReward(userId, reward) {
    // 金币
    if (reward.gold) {
      this.db.run('UPDATE users SET gold = gold + ? WHERE id = ?', reward.gold, userId);
    }
    // 钻石
    if (reward.diamond) {
      this.db.run('UPDATE users SET diamond = diamond + ? WHERE id = ?', reward.diamond, userId);
    }
    // 经验
    if (reward.exp) {
      this.db.run('UPDATE users SET exp = exp + ? WHERE id = ?', reward.exp, userId);
    }
    // 道具
    if (reward.item) {
      this.economy.addItem(userId, reward.item, 1);
    }
  }

  /**
   * 获取签到里程碑信息
   * @param {number} currentDays 当前连续天数
   * @returns {Array} 里程碑列表
   * @private
   */
  _getMilestones(currentDays) {
    const milestones = [1, 3, 7, 15, 30];
    return milestones.map((day) => ({
      day,
      reward: this._calculateReward(day),
      reached: currentDays >= day,
    }));
  }

  /**
   * 获取今天日期字符串 YYYY-MM-DD
   * @private
   */
  _getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * 获取昨天日期字符串 YYYY-MM-DD
   * @private
   */
  _getYesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
}

module.exports = SignInSystem;
