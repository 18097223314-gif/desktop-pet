// ══════════════════════════════════════════════
// event-manager.js — 随机事件管理类
// 每15分钟检测一次，30%基础概率触发随机事件
// 包含正面(18)/中性(7)/负面(5)共30种事件
// 事件定义从 data/events.json 加载
// ══════════════════════════════════════════════

'use strict';

const path = require('path');
const { IPC_CHANNELS } = require('./constants');

class EventManager {
  /**
   * @param {PetDatabase} database 数据库实例
   * @param {PetAI} petAI 宠物AI实例
   * @param {Timer} timer 定时器管理器
   * @param {Function} sendNotification 通知推送回调（channel, data）=> void
   */
  constructor(database, petAI, timer, sendNotification) {
    /** @type {PetDatabase} */
    this.db = database;
    /** @type {PetAI} */
    this.petAI = petAI;
    /** @type {Timer} */
    this.timer = timer;
    /** @type {Function} 通知推送回调 */
    this.sendNotification = sendNotification || (() => {});

    /** @type {number} 基础触发概率 */
    this.baseProbability = 0.3;

    /** @type {Object} 事件池定义 */
    this.eventPool = this._initEventPool();
  }

  /**
   * 初始化，启动15分钟定时器
   */
  init() {
    this.timer.add('randomEvent', () => this.tryTriggerEvent(), 15 * 60 * 1000);
    console.log('[EventManager] 初始化完成，15分钟检测一次随机事件');
  }

  /**
   * 尝试触发随机事件
   * 30%基础概率，幸运技能可提升
   * @returns {Object|null} 触发的事件，或null
   */
  tryTriggerEvent() {
    // 计算实际概率（考虑幸运技能加成）
    let probability = this.baseProbability;
    // 幸运技能加成（每级+2%）
    const luckySkill = this.db.get('SELECT level FROM pet_skills WHERE pet_id = 1 AND skill_type = ?', 'lucky');
    if (luckySkill) {
      probability += luckySkill.level * 0.02;
    }

    // 随机判定
    if (Math.random() > probability) {
      return null;
    }

    // 选择事件类型
    const rand = Math.random();
    let eventType;
    if (rand < 0.6) {
      eventType = 'positive'; // 60% 正面事件
    } else if (rand < 0.83) {
      eventType = 'neutral'; // 23% 中性事件
    } else {
      eventType = 'negative'; // 17% 负面事件
    }

    // 执行事件
    return this.executeEvent(eventType);
  }

  /**
   * 从事件池随机选择并执行事件
   * @param {string} eventType 事件类型 positive/neutral/negative
   * @returns {Object} 事件执行结果
   */
  executeEvent(eventType) {
    const pool = this.eventPool[eventType];
    if (!pool || pool.length === 0) return null;

    // 检查等级门槛过滤
    const userInfo = this.db.get('SELECT level FROM users WHERE id = 1');
    const userLevel = userInfo ? userInfo.level : 1;

    const availableEvents = pool.filter((e) => !e.minLevel || userLevel >= e.minLevel);
    if (availableEvents.length === 0) return null;

    // 随机选择一个事件
    const event = availableEvents[Math.floor(Math.random() * availableEvents.length)];

    // 执行事件效果（统一入口）
    const result = this.handleEvent(event, eventType);

    // 记录事件日志
    this._logEvent(eventType, event, result);

    // 通知 renderer（通过注入的回调，不再直接 require electron）
    this.sendNotification(IPC_CHANNELS.EVENT_TRIGGER, {
      type: event.id,
      category: eventType,
      name: event.name,
      message: event.message,
      emoji: event.emoji,
      result: result,
    });

    return { event, result };
  }

  /**
   * 统一事件效果执行（正面/中性/负面共用）
   * @param {Object} event 事件定义
   * @param {string} eventType 事件类型 positive/neutral/negative
   * @returns {Object} 执行结果
   * @private
   */
  _applyEffects(event, eventType) {
    const effects = event.effects || {};
    const result = {};
    // 正面事件属性为加，负面为减，中性用 moodChange/goldChange
    const sign = eventType === 'negative' ? -1 : 1;

    // 宠物属性变更（正面/负面事件用 hunger/hygiene/mood/stamina）
    const petStats = ['hunger', 'hygiene', 'mood', 'stamina'];
    for (const stat of petStats) {
      if (effects[stat]) {
        this.petAI.setStatusField(stat, this.petAI.status[stat] + effects[stat] * sign);
        result[stat] = effects[stat] * sign;
      }
    }

    // 中性事件专用字段（moodChange/goldChange）
    if (effects.moodChange) {
      this.petAI.setStatusField('mood', this.petAI.status.mood + effects.moodChange);
      result.mood = effects.moodChange;
    }

    // 金币变更（正面/负面用 gold，中性用 goldChange）
    if (effects.gold) {
      const op = eventType === 'negative' ? 'MAX(0, gold - ?)' : 'gold + ?';
      this.db.run(`UPDATE users SET gold = ${op} WHERE id = 1`, effects.gold);
      result.gold = effects.gold * sign;
    }
    if (effects.goldChange) {
      this.db.run('UPDATE users SET gold = MAX(0, gold + ?) WHERE id = 1', effects.goldChange);
      result.gold = effects.goldChange;
    }

    // 经验奖励
    if (effects.exp) {
      this.db.run('UPDATE users SET exp = exp + ? WHERE id = 1', effects.exp);
      result.exp = effects.exp;
    }

    // 道具奖励
    if (effects.item) {
      this.db.run(
        `INSERT INTO inventory (user_id, item_id, quantity) VALUES (1, ?, 1)
         ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + 1`,
        effects.item,
      );
      result.item = effects.item;
    }

    // 好感度
    if (effects.affection) {
      this.db.run('UPDATE users SET affection = affection + ? WHERE id = 1', effects.affection);
      result.affection = effects.affection;
    }

    // 对话台词（中性事件）
    if (effects.dialogue) {
      result.dialogue = effects.dialogue;
    }

    return result;
  }

  /**
   * 处理事件（统一入口，替代原 handlePositiveEvent/handleNeutralEvent/handleNegativeEvent）
   * @param {Object} event 事件定义
   * @param {string} eventType 事件类型
   * @returns {Object} 执行结果
   */
  handleEvent(event, eventType) {
    return this._applyEffects(event, eventType);
  }

  /**
   * 记录事件日志
   * @private
   */
  _logEvent(category, event, result) {
    try {
      const eventType = `random_${category || 'unknown'}`;
      const eventData = JSON.stringify({ eventId: event?.id, name: event?.name, result });
      this.db.run('INSERT INTO event_log (user_id, event_type, event_data) VALUES (1, ?, ?)', eventType, eventData);
    } catch (err) {
      console.error('[EventManager] 日志记录失败:', err.message);
    }
  }

  /**
   * 初始化事件池（从 data/events.json 加载，30种事件）
   * @private
   * @returns {Object} { positive: [], neutral: [], negative: [] }
   */
  _initEventPool() {
    try {
      return require(path.join(__dirname, '..', '..', 'data', 'events.json'));
    } catch (err) {
      console.error('[EventManager] 加载 events.json 失败，使用空事件池:', err.message);
      return { positive: [], neutral: [], negative: [] };
    }
  }
}

module.exports = EventManager;
