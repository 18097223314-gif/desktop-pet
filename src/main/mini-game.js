// ══════════════════════════════════════════════
// mini-game.js — 小游戏管理器
// 4种小游戏的开始/结算/次数管理
// catch-food / rps / memory / rhythm
// ══════════════════════════════════════════════

'use strict';

const { MINI_GAME_CONFIGS } = require('./constants');

class MiniGameManager {
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

    /** @type {Map<number, {gameType: string, startTime: number}>} 当前进行中的游戏 */
    this.activeGames = new Map();
  }

  /**
   * 获取小游戏列表（含剩余次数）
   * @param {number} userId 用户ID
   * @returns {Array} 游戏列表
   */
  getGameList(userId) {
    const today = this._getTodayStr();
    const result = [];

    for (const [gameType, config] of Object.entries(MINI_GAME_CONFIGS)) {
      // 查询今天已玩次数
      const row = this.db.get(
        `SELECT COUNT(*) as cnt FROM game_records
         WHERE user_id = ? AND game_type = ? AND date(played_at) = ?`,
        userId, gameType, today
      );
      const playedToday = row ? row.cnt : 0;
      const remaining = Math.max(0, config.dailyLimit - playedToday);

      result.push({
        type: gameType,
        name: config.name,
        description: config.description,
        emoji: config.emoji,
        dailyLimit: config.dailyLimit,
        playedToday,
        remaining,
        isPlaying: this.activeGames.has(userId) && this.activeGames.get(userId).gameType === gameType,
      });
    }

    return result;
  }

  /**
   * 开始游戏（检查每日次数限制）
   * @param {number} userId 用户ID
   * @param {string} gameType 游戏类型
   * @returns {{ success: boolean, message: string, gameType: string, timeLimit: number|null }}
   */
  startGame(userId, gameType) {
    // 检查游戏类型是否有效
    const config = MINI_GAME_CONFIGS[gameType];
    if (!config) {
      return { success: false, message: '未知的小游戏', gameType, timeLimit: null };
    }

    // 检查是否已在游戏中
    if (this.activeGames.has(userId)) {
      return { success: false, message: '已有进行中的游戏', gameType, timeLimit: null };
    }

    // 检查每日次数限制
    const today = this._getTodayStr();
    const row = this.db.get(
      `SELECT COUNT(*) as cnt FROM game_records
       WHERE user_id = ? AND game_type = ? AND date(played_at) = ?`,
      userId, gameType, today
    );
    const playedToday = row ? row.cnt : 0;

    if (playedToday >= config.dailyLimit) {
      return { success: false, message: `今日${config.name}次数已用完`, gameType, timeLimit: null };
    }

    // 检查体力（玩小游戏需要5点体力）
    const petStatus = this.db.get('SELECT stamina FROM pet_status WHERE pet_id = 1');
    if (petStatus && petStatus.stamina < 5) {
      return { success: false, message: '体力不足，先休息一下吧', gameType, timeLimit: null };
    }

    // 扣除体力
    this.db.run('UPDATE pet_status SET stamina = MAX(0, stamina - 5) WHERE pet_id = 1');

    // 记录游戏开始
    this.activeGames.set(userId, {
      gameType,
      startTime: Date.now(),
    });

    // 如果有时间限制，设置超时自动结算
    if (config.timeLimit && config.timeLimit > 0) {
      this.timer.add(`game_${userId}`, () => {
        // 超时自动以最低分结算
        if (this.activeGames.has(userId)) {
          this.finishGame(userId, gameType, 0);
        }
      }, config.timeLimit);
    }

    return {
      success: true,
      message: `${config.name}开始！`,
      gameType,
      timeLimit: config.timeLimit || null,
    };
  }

  /**
   * 结束游戏（结算奖励）
   * @param {number} userId 用户ID
   * @param {string} gameType 游戏类型
   * @param {number} score 游戏得分
   * @returns {{ success: boolean, message: string, reward: Object, score: number }}
   */
  finishGame(userId, gameType, score) {
    // 检查是否在游戏中
    const active = this.activeGames.get(userId);
    if (!active || active.gameType !== gameType) {
      return { success: false, message: '没有进行中的该游戏', reward: {}, score };
    }

    const config = MINI_GAME_CONFIGS[gameType];
    if (!config) {
      return { success: false, message: '未知游戏类型', reward: {}, score };
    }

    // 计算奖励
    const reward = this._calculateReward(gameType, score);

    // 计算奖励倍率（1x-3x，基于得分百分比）
    const multiplier = this._getScoreMultiplier(gameType, score);
    reward.gold = Math.floor(reward.gold * multiplier);
    reward.exp = Math.floor(reward.exp * multiplier);

    // 发放金币
    if (reward.gold > 0) {
      this.economy.addGold(userId, reward.gold, `小游戏: ${config.name}`);
    }

    // 发放经验
    if (reward.exp > 0) {
      this.db.run('UPDATE users SET exp = exp + ? WHERE id = ?', reward.exp, userId);
    }

    // 心情恢复（玩游戏让宠物开心）
    this.db.run(
      'UPDATE pet_status SET mood = MIN(100, mood + ?) WHERE pet_id = 1',
      config.moodGain || 5
    );

    // 记录游戏结果
    this.db.run(
      'INSERT INTO game_records (user_id, game_type, score, reward) VALUES (?, ?, ?, ?)',
      userId, gameType, score, reward.gold
    );

    // 检查是否有道具奖励（10%概率获得随机食物）
    let bonusItem = null;
    if (Math.random() < 0.1) {
      const bonusItems = ['food_kibble', 'food_fish', 'food_milk', 'food_bread', 'food_onigiri'];
      bonusItem = bonusItems[Math.floor(Math.random() * bonusItems.length)];
      this.economy.addItem(userId, bonusItem, 1);
    }

    // 清除游戏状态
    this.activeGames.delete(userId);

    // 清除超时定时器
    if (this.timer.has(`game_${userId}`)) {
      this.timer.destroy(`game_${userId}`);
    }

    // 记录日志
    try {
      this.db.run(
        'INSERT INTO event_log (user_id, event_type, event_data) VALUES (?, ?, ?)',
        userId, 'mini_game_finish',
        JSON.stringify({ gameType, score, reward, multiplier, bonusItem })
      );
    } catch (err) {
      console.error('[MiniGame] 日志记录失败:', err.message);
    }

    return {
      success: true,
      message: `${config.name}结束！得分: ${score}，倍率: ${multiplier}x`,
      reward: { ...reward, item: bonusItem, multiplier },
      score,
    };
  }

  /**
   * 获取游戏记录
   * @param {number} userId 用户ID
   * @param {string} gameType 游戏类型（可选，null则返回所有）
   * @returns {Array} 游戏记录列表
   */
  getGameRecords(userId, gameType = null) {
    if (gameType) {
      return this.db.all(
        'SELECT * FROM game_records WHERE user_id = ? AND game_type = ? ORDER BY played_at DESC LIMIT 20',
        userId, gameType
      );
    }
    return this.db.all(
      'SELECT * FROM game_records WHERE user_id = ? ORDER BY played_at DESC LIMIT 50',
      userId
    );
  }

  // ══════════════════════════════════════════════
  // 私有方法：奖励计算
  // ══════════════════════════════════════════════

  /**
   * 计算游戏基础奖励（不含倍率）
   * @param {string} gameType 游戏类型
   * @param {number} score 游戏得分
   * @returns {{ gold: number, exp: number }}
   * @private
   */
  _calculateReward(gameType, score) {
    switch (gameType) {
      case 'catch-food':
        // 接食物：金币 = 接住数 × 10
        return {
          gold: Math.max(10, score * 10),
          exp: Math.max(5, Math.floor(score * 3)),
        };

      case 'rps': {
        // 石头剪刀布：赢200/平100/输50
        // score: 3=赢, 2=平, 1=输
        const rpsGold = score >= 3 ? 200 : (score >= 2 ? 100 : 50);
        const rpsExp = score >= 3 ? 60 : (score >= 2 ? 30 : 15);
        return { gold: rpsGold, exp: rpsExp };
      }

      case 'memory':
        // 记忆翻牌：金币 = max(100, 500 - 步数×20)
        return {
          gold: Math.max(100, 500 - score * 20),
          exp: Math.max(20, 150 - score * 5),
        };

      case 'rhythm':
        // 节奏点击：金币 = 得分 × 2
        return {
          gold: Math.max(10, score * 2),
          exp: Math.max(5, Math.floor(score * 0.5)),
        };

      default:
        return { gold: 10, exp: 5 };
    }
  }

  /**
   * 获取得分倍率（1x-3x）
   * 不同游戏有不同的满分标准
   * @param {string} gameType 游戏类型
   * @param {number} score 得分
   * @returns {number} 倍率 1.0 ~ 3.0
   * @private
   */
  _getScoreMultiplier(gameType, score) {
    let percentage = 0; // 0~1 表示表现百分比

    switch (gameType) {
      case 'catch-food':
        // 满分约30个食物
        percentage = Math.min(1, score / 30);
        break;
      case 'rps':
        // 3=赢(1.0), 2=平(0.5), 1=输(0.2)
        percentage = score >= 3 ? 1.0 : (score >= 2 ? 0.5 : 0.2);
        break;
      case 'memory':
        // 最优步数8步(4×4配对)，步数越少越好
        percentage = Math.max(0, Math.min(1, 1 - (score - 8) / 24));
        break;
      case 'rhythm':
        // 满分约500
        percentage = Math.min(1, score / 500);
        break;
      default:
        percentage = 0;
    }

    // 映射到 1x-3x
    return Math.round((1 + percentage * 2) * 10) / 10;
  }

  /**
   * 获取今天日期字符串
   * @private
   */
  _getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }
}

module.exports = MiniGameManager;
