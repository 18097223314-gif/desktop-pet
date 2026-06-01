// ══════════════════════════════════════════════
// quest.js — 任务与成就系统
// 每日任务、成就检测与领取
// ══════════════════════════════════════════════

'use strict';


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
      { type: 'dress_up', name: '更换装扮1次', target: 1, gold: 60, exp: 25 },
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
    const existingTasks = this.db.all(
      'SELECT * FROM daily_tasks WHERE user_id = ? AND date = ?',
      userId, today
    );

    if (existingTasks.length === 0) {
      this.refreshDailyTasks(userId);
      return this.db.all(
        'SELECT * FROM daily_tasks WHERE user_id = ? AND date = ?',
        userId, today
      );
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
        userId, today, task.type, task.target, task.gold, task.exp
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
      increment, userId, today, taskType
    );

    // 标记完成的任务
    this.db.run(
      `UPDATE daily_tasks
       SET completed = 1
       WHERE user_id = ? AND date = ? AND task_type = ? AND current_count >= target_count AND completed = 0`,
      userId, today, taskType
    );
  }

  /**
   * 领取任务奖励
   * @param {number} userId 用户ID
   * @param {number} taskId 任务ID
   * @returns {{ success: boolean, message: string, reward: Object }}
   */
  claimTaskReward(userId, taskId) {
    const task = this.db.get(
      'SELECT * FROM daily_tasks WHERE id = ? AND user_id = ?',
      taskId, userId
    );

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
    this.db.run('UPDATE users SET gold = gold + ?, exp = exp + ? WHERE id = ?',
      task.reward_gold, task.reward_exp, userId);
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
        userId, achievement.id
      );
      if (existing) continue;

      // 检查触发条件
      if (!achievement.triggers.includes(trigger)) continue;

      // 检查条件是否满足
      if (this._checkAchievementCondition(userId, achievement)) {
        // 解锁成就
        this.db.run(
          'INSERT INTO achievements (user_id, achievement_id) VALUES (?, ?)',
          userId, achievement.id
        );
        newlyUnlocked.push(achievement);

        // 记录日志
        try {
          this.db.run(
            'INSERT INTO event_log (user_id, event_type, event_data) VALUES (?, ?, ?)',
            userId, 'achievement_unlock', JSON.stringify({ id: achievement.id, name: achievement.name })
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
      userId, achievementId
    );

    if (!achievement) {
      return { success: false, message: '成就未解锁', reward: {} };
    }
    if (achievement.claimed) {
      return { success: false, message: '奖励已领取', reward: {} };
    }

    // 获取成就定义
    const def = this.achievementList.find(a => a.id === achievementId);
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

    this.db.run('UPDATE achievements SET claimed = 1 WHERE user_id = ? AND achievement_id = ?',
      userId, achievementId);

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
    const unlocked = this.db.all(
      'SELECT achievement_id, claimed FROM achievements WHERE user_id = ?',
      userId
    );
    const unlockedMap = new Map(unlocked.map(a => [a.achievement_id, a]));

    return this.achievementList.map(a => ({
      id: a.id,
      name: a.name,
      description: a.description,
      category: a.category,
      emoji: a.emoji,
      rewardGold: a.rewardGold || 0,
      rewardExp: a.rewardExp || 0,
      rewardDiamond: a.rewardDiamond || 0,
      unlocked: unlockedMap.has(a.id),
      claimed: unlockedMap.has(a.id) ? (unlockedMap.get(a.id).claimed === 1) : false,
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
          userId, condition.eventType
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
          condition.skillType
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
          userId
        );
        return row && row.cnt >= condition.value;
      }
      case 'item_count': {
        const row = this.db.get(
          'SELECT COUNT(*) as cnt FROM inventory WHERE user_id = ? AND quantity > 0',
          userId
        );
        return row && row.cnt >= condition.value;
      }
      default:
        return false;
    }
  }

  /**
   * 初始化成就列表（50+个，8大类）
   * @private
   */
  _initAchievements() {
    return [
      // ═══ 1. 成长类 ═════════════════════════════
      { id: 'grow_lv5', name: '初出茅庐', description: '达到5级', emoji: '🌱', category: 'growth', triggers: ['level_up'], condition: { type: 'level', value: 5 }, rewardGold: 100, rewardExp: 50 },
      { id: 'grow_lv10', name: '小有成就', description: '达到10级', emoji: '🌿', category: 'growth', triggers: ['level_up'], condition: { type: 'level', value: 10 }, rewardGold: 300, rewardExp: 150 },
      { id: 'grow_lv20', name: '登峰造极', description: '达到20级', emoji: '🌳', category: 'growth', triggers: ['level_up'], condition: { type: 'level', value: 20 }, rewardGold: 800, rewardExp: 400 },
      { id: 'grow_lv30', name: '传奇冒险者', description: '达到30级', emoji: '🏔️', category: 'growth', triggers: ['level_up'], condition: { type: 'level', value: 30 }, rewardGold: 2000, rewardExp: 1000 },
      { id: 'grow_lv50', name: '至高荣耀', description: '达到50级', emoji: '👑', category: 'growth', triggers: ['level_up'], condition: { type: 'level', value: 50 }, rewardGold: 5000, rewardDiamond: 10 },
      { id: 'grow_first_exp', name: '第一步', description: '首次获得经验', emoji: '👣', category: 'growth', triggers: ['exp_gain'], condition: { type: 'count', eventType: 'exp_gain', value: 1 }, rewardGold: 20, rewardExp: 10 },

      // ═══ 2. 互动类 ═════════════════════════════
      { id: 'interact_pet_first', name: '初次触碰', description: '第一次抚摸爪爪', emoji: '🤗', category: 'interact', triggers: ['pet'], condition: { type: 'count', eventType: 'skill_use_pet', value: 1 }, rewardGold: 30, rewardExp: 20 },
      { id: 'interact_pet_100', name: '亲密无间', description: '抚摸爪爪100次', emoji: '💕', category: 'interact', triggers: ['pet'], condition: { type: 'count', eventType: 'skill_use_pet', value: 100 }, rewardGold: 300, rewardExp: 150 },
      { id: 'interact_feed_50', name: '美食家', description: '喂食50次', emoji: '🍽️', category: 'interact', triggers: ['feed'], condition: { type: 'count', eventType: 'skill_use_feed', value: 50 }, rewardGold: 200, rewardExp: 100 },
      { id: 'interact_wash_30', name: '爱干净', description: '洗澡30次', emoji: '🛁', category: 'interact', triggers: ['wash'], condition: { type: 'count', eventType: 'skill_use_wash', value: 30 }, rewardGold: 150, rewardExp: 80 },
      { id: 'interact_play_50', name: '玩家', description: '玩耍50次', emoji: '🎮', category: 'interact', triggers: ['play'], condition: { type: 'count', eventType: 'skill_use_play', value: 50 }, rewardGold: 200, rewardExp: 100 },
      { id: 'interact_dress_10', name: '时尚达人', description: '更换装扮10次', emoji: '👔', category: 'interact', triggers: ['dress_up'], condition: { type: 'count', eventType: 'dress_up', value: 10 }, rewardGold: 150, rewardExp: 70 },

      // ═══ 3. 收集类 ═════════════════════════════
      { id: 'collect_5', name: '小收藏家', description: '拥有5种不同道具', emoji: '📦', category: 'collect', triggers: ['item_add'], condition: { type: 'item_count', value: 5 }, rewardGold: 100, rewardExp: 50 },
      { id: 'collect_15', name: '收藏达人', description: '拥有15种不同道具', emoji: '🏛️', category: 'collect', triggers: ['item_add'], condition: { type: 'item_count', value: 15 }, rewardGold: 300, rewardExp: 150 },
      { id: 'collect_30', name: '大收藏家', description: '拥有30种不同道具', emoji: '💎', category: 'collect', triggers: ['item_add'], condition: { type: 'item_count', value: 30 }, rewardGold: 800, rewardExp: 400 },
      { id: 'collect_rare', name: '稀有猎人', description: '获得1件稀有道具', emoji: '✨', category: 'collect', triggers: ['item_add'], condition: { type: 'count', eventType: 'economy_item_add_rare', value: 1 }, rewardGold: 200, rewardExp: 100 },
      { id: 'collect_epic', name: '史诗收藏', description: '获得1件史诗道具', emoji: '🌟', category: 'collect', triggers: ['item_add'], condition: { type: 'count', eventType: 'economy_item_add_epic', value: 1 }, rewardGold: 500, rewardExp: 250 },

      // ═══ 4. 经济类 ═════════════════════════════
      { id: 'econ_1000', name: '小有积蓄', description: '持有1000金币', emoji: '💰', category: 'economy', triggers: ['gold_change'], condition: { type: 'gold', value: 1000 }, rewardGold: 0, rewardExp: 50 },
      { id: 'econ_10000', name: '富裕之家', description: '持有10000金币', emoji: '🏦', category: 'economy', triggers: ['gold_change'], condition: { type: 'gold', value: 10000 }, rewardGold: 0, rewardExp: 200, rewardDiamond: 3 },
      { id: 'econ_50000', name: '金库满满', description: '持有50000金币', emoji: '🤑', category: 'economy', triggers: ['gold_change'], condition: { type: 'gold', value: 50000 }, rewardGold: 0, rewardExp: 500, rewardDiamond: 10 },
      { id: 'econ_first_buy', name: '首次消费', description: '第一次在商店购买', emoji: '🛒', category: 'economy', triggers: ['buy'], condition: { type: 'count', eventType: 'economy_item_buy', value: 1 }, rewardGold: 30, rewardExp: 15 },
      { id: 'econ_first_sell', name: '第一桶金', description: '第一次出售道具', emoji: '🏷️', category: 'economy', triggers: ['sell'], condition: { type: 'count', eventType: 'economy_item_sell', value: 1 }, rewardGold: 20, rewardExp: 10 },
      { id: 'econ_diamond_first', name: '闪耀', description: '首次获得钻石', emoji: '💎', category: 'economy', triggers: ['diamond_gain'], condition: { type: 'count', eventType: 'diamond_gain', value: 1 }, rewardGold: 100, rewardExp: 50 },

      // ═══ 5. 打工类 ═════════════════════════════
      { id: 'work_first', name: '自食其力', description: '完成第一次打工', emoji: '💼', category: 'work', triggers: ['work_finish'], condition: { type: 'work_count', value: 1 }, rewardGold: 100, rewardExp: 50 },
      { id: 'work_10', name: '勤劳小蜜蜂', description: '完成10次打工', emoji: '🐝', category: 'work', triggers: ['work_finish'], condition: { type: 'work_count', value: 10 }, rewardGold: 300, rewardExp: 150 },
      { id: 'work_50', name: '打工人', description: '完成50次打工', emoji: '🔧', category: 'work', triggers: ['work_finish'], condition: { type: 'work_count', value: 50 }, rewardGold: 1000, rewardExp: 500 },
      { id: 'work_explorer', name: '探险家', description: '完成探险家工作', emoji: '🗺️', category: 'work', triggers: ['work_finish'], condition: { type: 'count', eventType: 'work_finish_explorer', value: 1 }, rewardGold: 200, rewardExp: 100 },
      { id: 'work_researcher', name: '学者', description: '完成研究员工作', emoji: '🔬', category: 'work', triggers: ['work_finish'], condition: { type: 'count', eventType: 'work_finish_researcher', value: 1 }, rewardGold: 300, rewardExp: 150 },
      { id: 'work_adventurer', name: '勇者', description: '完成冒险者工作', emoji: '⚔️', category: 'work', triggers: ['work_finish'], condition: { type: 'count', eventType: 'work_finish_adventurer', value: 1 }, rewardGold: 500, rewardExp: 250, rewardDiamond: 2 },

      // ═══ 6. 好感类 ═════════════════════════════
      { id: 'aff_100', name: '相识', description: '好感度达到100', emoji: '😊', category: 'affection', triggers: ['affection_change'], condition: { type: 'affection', value: 100 }, rewardGold: 200, rewardExp: 100 },
      { id: 'aff_500', name: '好友', description: '好感度达到500', emoji: '😄', category: 'affection', triggers: ['affection_change'], condition: { type: 'affection', value: 500 }, rewardGold: 500, rewardExp: 250 },
      { id: 'aff_1000', name: '挚友', description: '好感度达到1000', emoji: '🥰', category: 'affection', triggers: ['affection_change'], condition: { type: 'affection', value: 1000 }, rewardGold: 1000, rewardExp: 500 },
      { id: 'aff_3000', name: '灵魂伴侣', description: '好感度达到3000', emoji: '💖', category: 'affection', triggers: ['affection_change'], condition: { type: 'affection', value: 3000 }, rewardGold: 3000, rewardExp: 1500, rewardDiamond: 5 },
      { id: 'aff_6000', name: '命中注定', description: '好感度达到6000', emoji: '💫', category: 'affection', triggers: ['affection_change'], condition: { type: 'affection', value: 6000 }, rewardGold: 10000, rewardExp: 5000, rewardDiamond: 20 },

      // ═══ 7. 签到类 ═════════════════════════════
      { id: 'sign_7', name: '坚持一周', description: '累计签到7天', emoji: '📅', category: 'signin', triggers: ['sign_in'], condition: { type: 'sign_in_days', value: 7 }, rewardGold: 200, rewardExp: 100 },
      { id: 'sign_15', name: '半月坚持', description: '累计签到15天', emoji: '📆', category: 'signin', triggers: ['sign_in'], condition: { type: 'sign_in_days', value: 15 }, rewardGold: 400, rewardExp: 200 },
      { id: 'sign_30', name: '月度之星', description: '累计签到30天', emoji: '🌟', category: 'signin', triggers: ['sign_in'], condition: { type: 'sign_in_days', value: 30 }, rewardGold: 1000, rewardExp: 500 },
      { id: 'sign_100', name: '百日如一', description: '累计签到100天', emoji: '💯', category: 'signin', triggers: ['sign_in'], condition: { type: 'sign_in_days', value: 100 }, rewardGold: 3000, rewardExp: 1500, rewardDiamond: 5 },
      { id: 'sign_365', name: '年复一年', description: '累计签到365天', emoji: '🏆', category: 'signin', triggers: ['sign_in'], condition: { type: 'sign_in_days', value: 365 }, rewardGold: 10000, rewardExp: 5000, rewardDiamond: 30 },

      // ═══ 8. 技能类 ═════════════════════════════
      { id: 'skill_cooking_5', name: '小厨师', description: '烹饪技能达到5级', emoji: '👨‍🍳', category: 'skill', triggers: ['skill_use_cooking'], condition: { type: 'skill_level', skillType: 'cooking', value: 5 }, rewardGold: 100, rewardExp: 50 },
      { id: 'skill_cooking_10', name: '大厨', description: '烹饪技能达到10级', emoji: '🍳', category: 'skill', triggers: ['skill_use_cooking'], condition: { type: 'skill_level', skillType: 'cooking', value: 10 }, rewardGold: 300, rewardExp: 150 },
      { id: 'skill_cleaning_5', name: '清洁达人', description: '清洁技能达到5级', emoji: '✨', category: 'skill', triggers: ['skill_use_cleaning'], condition: { type: 'skill_level', skillType: 'cleaning', value: 5 }, rewardGold: 100, rewardExp: 50 },
      { id: 'skill_performance_5', name: '表演新星', description: '表演技能达到5级', emoji: '🎭', category: 'skill', triggers: ['skill_use_performance'], condition: { type: 'skill_level', skillType: 'performance', value: 5 }, rewardGold: 100, rewardExp: 50 },
      { id: 'skill_athletics_5', name: '运动健将', description: '运动技能达到5级', emoji: '🏃', category: 'skill', triggers: ['skill_use_athletics'], condition: { type: 'skill_level', skillType: 'athletics', value: 5 }, rewardGold: 100, rewardExp: 50 },
      { id: 'skill_studying_10', name: '学霸', description: '学习技能达到10级', emoji: '📚', category: 'skill', triggers: ['skill_use_studying'], condition: { type: 'skill_level', skillType: 'studying', value: 10 }, rewardGold: 300, rewardExp: 150 },
      { id: 'skill_lucky_10', name: '幸运之星', description: '幸运技能达到10级', emoji: '🍀', category: 'skill', triggers: ['skill_use_lucky'], condition: { type: 'skill_level', skillType: 'lucky', value: 10 }, rewardGold: 500, rewardExp: 250, rewardDiamond: 3 },
      { id: 'skill_all_5', name: '全能天才', description: '所有技能达到5级', emoji: '🌟', category: 'skill', triggers: ['skill_use'], condition: { type: 'skill_level', skillType: 'all', value: 5 }, rewardGold: 1000, rewardExp: 500, rewardDiamond: 5 },
    ];
  }
}

module.exports = QuestSystem;
