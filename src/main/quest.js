// ══════════════════════════════════════════════
// quest.js — 任务与成就系统
// 每日任务、成就检测与领取
// 成就定义从 data/achievements.json 加载
// ══════════════════════════════════════════════

'use strict';

const path = require('path');

class QuestSystem {
  /**
   * @param {PetDatabase} database 数据库实例
   */
  constructor(database) {
    /** @type {PetDatabase} */
    this.db = database;

    // ─── 每日任务类型池（20+种）───────────────
    this.taskPool = [
      { type: 'feed_pet', name: '喂食1次', target: 1, gold: 50, exp: 20 },
      { type: 'feed_pet_3', name: '喂食3次', target: 3, gold: 100, exp: 40 },
      { type: 'wash_pet', name: '洗澡1次', target: 1, gold: 50, exp: 20 },
      { type: 'pet_head', name: '抚摸3次', target: 3, gold: 60, exp: 25 },
      { type: 'pet_head_5', name: '抚摸5次', target: 5, gold: 100, exp: 40 },
      { type: 'play_game', name: '玩小游戏1次', target: 1, gold: 80, exp: 30 },
      { type: 'play_game_3', name: '玩小游戏3次', target: 3, gold: 150, exp: 60 },
      { type: 'do_work', name: '打工1次', target: 1, gold: 100, exp: 40 },
      { type: 'do_work_long', name: '完成3小时以上打工', target: 1, gold: 200, exp: 80 },
      { type: 'sign_in', name: '每日签到', target: 1, gold: 30, exp: 10 },
      { type: 'buy_item', name: '商店购物1次', target: 1, gold: 60, exp: 25 },
      { type: 'sell_item', name: '出售道具1次', target: 1, gold: 40, exp: 15 },
      { type: 'use_medicine', name: '使用药品1次', target: 1, gold: 50, exp: 20 },
      { type: 'full_stats', name: '所有属性超过80', target: 1, gold: 200, exp: 80 },
      { type: 'high_mood', name: '心情超过90', target: 1, gold: 80, exp: 30 },
      { type: 'no_sick', name: '一天不生病', target: 1, gold: 100, exp: 40 },
      { type: 'skill_use', name: '使用技能5次', target: 5, gold: 80, exp: 35 },
      { type: 'explore_event', name: '触发随机事件', target: 1, gold: 60, exp: 25 },
      { type: 'collect_item', name: '收集3种不同道具', target: 3, gold: 100, exp: 40 },
      { type: 'friend_interact', name: '好友互动1次', target: 1, gold: 50, exp: 20 },
      { type: 'login_morning', name: '早上7-9点登录', target: 1, gold: 50, exp: 25 },
      { type: 'login_night', name: '晚上8-10点登录', target: 1, gold: 50, exp: 25 },
      { type: 'use_item', name: '使用道具1次', target: 1, gold: 60, exp: 25 },
    ];

    // ─── 成就列表（50+个，8大类）──────────────
    this.achievementList = this._initAchievements();
  }

  // ══════════════════════════════════════════════
  // 每日任务
  // ══════════════════════════════════════════════

  /**
   * 获取今日每日任务
   * @param {number} userId 用户ID
   * @returns {Array} 任务列表
   */
  getDailyTasks(userId) {
    const today = this._getTodayStr();

    // 检查是否需要刷新
    const existingTasks = this.db.all('SELECT * FROM daily_tasks WHERE user_id = ? AND date = ?', userId, today);

    if (existingTasks.length === 0) {
      this.refreshDailyTasks(userId);
      return this.db.all('SELECT * FROM daily_tasks WHERE user_id = ? AND date = ?', userId, today);
    }

    return existingTasks;
  }

  /**
   * 刷新每日任务（新的一天自动调用）
   * 每天随机选5个任务
   * @param {number} userId 用户ID
   */
  refreshDailyTasks(userId) {
    const today = this._getTodayStr();

    // 随机选5个任务
    const shuffled = [...this.taskPool].sort(() => Math.random() - 0.5);
    const selectedTasks = shuffled.slice(0, 5);

    // 插入今日任务
    for (const task of selectedTasks) {
      this.db.run(
        `INSERT OR IGNORE INTO daily_tasks
          (user_id, date, task_type, target_count, current_count, reward_gold, reward_exp)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        userId,
        today,
        task.type,
        task.target,
        task.gold,
        task.exp,
      );
    }
  }

  /**
   * 更新任务进度
   * @param {number} userId 用户ID
   * @param {string} taskType 任务类型
   * @param {number} increment 增量
   */
  updateTaskProgress(userId, taskType, increment = 1) {
    const today = this._getTodayStr();

    // 更新匹配的任务
    this.db.run(
      `UPDATE daily_tasks
       SET current_count = MIN(current_count + ?, target_count)
       WHERE user_id = ? AND date = ? AND task_type = ? AND completed = 0`,
      increment,
      userId,
      today,
      taskType,
    );

    // 标记完成的任务
    this.db.run(
      `UPDATE daily_tasks
       SET completed = 1
       WHERE user_id = ? AND date = ? AND task_type = ? AND current_count >= target_count AND completed = 0`,
      userId,
      today,
      taskType,
    );
  }

  /**
   * 领取任务奖励
   * @param {number} userId 用户ID
   * @param {number} taskId 任务ID
   * @returns {{ success: boolean, message: string, reward: Object }}
   */
  claimTaskReward(userId, taskId) {
    const task = this.db.get('SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?', taskId, userId);

    if (!task) {
      return { success: false, message: '任务不存在', reward: {} };
    }
    if (!task.completed) {
      return { success: false, message: '任务未完成', reward: {} };
    }
    if (task.claimed) {
      return { success: false, message: '奖励已领取', reward: {} };
    }

    // 发放奖励
    this.db.run(
      'UPDATE users SET gold = gold + ?, exp = exp + ? WHERE id = ?',
      task.reward_gold,
      task.reward_exp,
      userId,
    );
    this.db.run('UPDATE daily_tasks SET claimed = 1 WHERE id = ?', taskId);

    return {
      success: true,
      message: `领取成功！金币+${task.reward_gold} 经验+${task.reward_exp}`,
      reward: { gold: task.reward_gold, exp: task.reward_exp },
    };
  }

  // ══════════════════════════════════════════════
  // 成就系统
  // ══════════════════════════════════════════════

  /**
   * 检查成就（根据触发器）
   * @param {number} userId 用户ID
   * @param {string} trigger 触发类型
   * @returns {Array} 新解锁的成就列表
   */
  checkAchievements(userId, trigger) {
    const newlyUnlocked = [];

    for (const achievement of this.achievementList) {
      // 已解锁的跳过
      const existing = this.db.get(
        'SELECT 1 FROM achievements WHERE user_id = ? AND achievement_id = ?',
        userId,
        achievement.id,
      );
      if (existing) continue;

      // 检查触发条件
      if (!achievement.triggers.includes(trigger)) continue;

      // 检查条件是否满足
      if (this._checkAchievementCondition(userId, achievement)) {
        // 解锁成就
        this.db.run('INSERT INTO achievements (user_id, achievement_id) VALUES (?, ?)', userId, achievement.id);
        newlyUnlocked.push(achievement);

        // 记录日志
        try {
          this.db.run(
            'INSERT INTO event_log (user_id, event_type, event_data) VALUES (?, ?, ?)',
            userId,
            'achievement_unlock',
            JSON.stringify({ id: achievement.id, name: achievement.name }),
          );
        } catch (err) {
          console.error('[Quest] 成就日志记录失败:', err.message);
        }
      }
    }

    return newlyUnlocked;
  }

  /**
   * 领取成就奖励
   * @param {number} userId 用户ID
   * @param {string} achievementId 成就ID
   * @returns {{ success: boolean, message: string, reward: Object }}
   */
  claimAchievement(userId, achievementId) {
    const achievement = this.db.get(
      'SELECT * FROM achievements WHERE user_id = ? AND achievement_id = ?',
      userId,
      achievementId,
    );

    if (!achievement) {
      return { success: false, message: '成就未解锁', reward: {} };
    }
    if (achievement.claimed) {
      return { success: false, message: '奖励已领取', reward: {} };
    }

    // 获取成就定义
    const def = this.achievementList.find((a) => a.id === achievementId);
    if (!def) {
      return { success: false, message: '成就定义不存在', reward: {} };
    }

    // 发放奖励
    if (def.rewardGold) {
      this.db.run('UPDATE users SET gold = gold + ? WHERE id = ?', def.rewardGold, userId);
    }
    if (def.rewardExp) {
      this.db.run('UPDATE users SET exp = exp + ? WHERE id = ?', def.rewardExp, userId);
    }
    if (def.rewardDiamond) {
      this.db.run('UPDATE users SET diamond = diamond + ? WHERE id = ?', def.rewardDiamond, userId);
    }

    this.db.run('UPDATE achievements SET claimed = 1 WHERE user_id = ? AND achievement_id = ?', userId, achievementId);

    return {
      success: true,
      message: `成就 "${def.name}" 奖励已领取！`,
      reward: {
        gold: def.rewardGold || 0,
        exp: def.rewardExp || 0,
        diamond: def.rewardDiamond || 0,
      },
    };
  }

  /**
   * 获取所有成就状态
   * @param {number} userId 用户ID
   * @returns {Array} 成就列表（含解锁状态）
   */
  getAchievements(userId) {
    const unlocked = this.db.all('SELECT achievement_id, claimed FROM achievements WHERE user_id = ?', userId);
    const unlockedMap = new Map(unlocked.map((a) => [a.achievement_id, a]));

    return this.achievementList.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      category: a.category,
      emoji: a.emoji,
      rewardGold: a.rewardGold || 0,
      rewardExp: a.rewardExp || 0,
      rewardDiamond: a.rewardDiamond || 0,
      unlocked: unlockedMap.has(a.id),
      claimed: unlockedMap.has(a.id) ? unlockedMap.get(a.id).claimed === 1 : false,
    }));
  }

  // ══════════════════════════════════════════════
  // 私有方法
  // ══════════════════════════════════════════════

  /**
   * 获取今天日期字符串
   * @private
   */
  _getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * 检查单个成就条件
   * @private
   */
  _checkAchievementCondition(userId, achievement) {
    const condition = achievement.condition;
    if (!condition) return false;

    switch (condition.type) {
      case 'stat': {
        // 属性相关成就
        const row = this.db.get('SELECT * FROM pet_status WHERE pet_id = 1');
        if (!row) return false;
        return row[condition.stat] >= condition.value;
      }
      case 'count': {
        // 计数型成就
        const row = this.db.get(
          `SELECT COUNT(*) as cnt FROM event_log WHERE user_id = ? AND event_type = ?`,
          userId,
          condition.eventType,
        );
        return row && row.cnt >= condition.value;
      }
      case 'level': {
        const user = this.db.get('SELECT level FROM users WHERE id = ?', userId);
        return user && user.level >= condition.value;
      }
      case 'gold': {
        const user = this.db.get('SELECT gold FROM users WHERE id = ?', userId);
        return user && user.gold >= condition.value;
      }
      case 'affection': {
        const user = this.db.get('SELECT affection FROM users WHERE id = ?', userId);
        return user && user.affection >= condition.value;
      }
      case 'skill_level': {
        const skill = this.db.get(
          'SELECT level FROM pet_skills WHERE pet_id = 1 AND skill_type = ?',
          condition.skillType,
        );
        return skill && skill.level >= condition.value;
      }
      case 'sign_in_days': {
        const sign = this.db.get('SELECT total_days FROM sign_in WHERE user_id = ?', userId);
        return sign && sign.total_days >= condition.value;
      }
      case 'work_count': {
        const row = this.db.get(
          `SELECT COUNT(*) as cnt FROM work_records WHERE user_id = ? AND status = 'completed'`,
          userId,
        );
        return row && row.cnt >= condition.value;
      }
      case 'item_count': {
        const row = this.db.get('SELECT COUNT(*) as cnt FROM inventory WHERE user_id = ? AND quantity > 0', userId);
        return row && row.cnt >= condition.value;
      }
      default:
        return false;
    }
  }

  /**
   * 初始化成就列表（从 data/achievements.json 加载，47个，8大类）
   * @private
   */
  _initAchievements() {
    try {
      return require(path.join(__dirname, '..', '..', 'data', 'achievements.json'));
    } catch (err) {
      console.error('[QuestSystem] 加载 achievements.json 失败，使用空列表:', err.message);
      return [];
    }
  }
}

module.exports = QuestSystem;
