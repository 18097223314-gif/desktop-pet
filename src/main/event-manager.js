// ══════════════════════════════════════════════
// event-manager.js — 随机事件管理类
// 每15分钟检测一次，30%基础概率触发随机事件
// 包含正面(18)/中性(7)/负面(5)共30种事件
// ══════════════════════════════════════════════

'use strict';

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
    const luckySkill = this.db.get(
      'SELECT level FROM pet_skills WHERE pet_id = 1 AND skill_type = ?',
      'lucky'
    );
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
      eventType = 'positive';     // 60% 正面事件
    } else if (rand < 0.83) {
      eventType = 'neutral';      // 23% 中性事件
    } else {
      eventType = 'negative';     // 17% 负面事件
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

    const availableEvents = pool.filter(e => !e.minLevel || userLevel >= e.minLevel);
    if (availableEvents.length === 0) return null;

    // 随机选择一个事件
    const event = availableEvents[Math.floor(Math.random() * availableEvents.length)];

    // 执行事件效果
    let result;
    switch (eventType) {
      case 'positive':
        result = this.handlePositiveEvent(event);
        break;
      case 'neutral':
        result = this.handleNeutralEvent(event);
        break;
      case 'negative':
        result = this.handleNegativeEvent(event);
        break;
    }

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
   * 处理正面事件
   * @param {Object} event 事件定义
   * @returns {Object} 执行结果
   */
  handlePositiveEvent(event) {
    const effects = event.effects || {};
    const result = {};

    // 属性提升（通过 setStatusField 安全修改）
    if (effects.hunger) {
      this.petAI.setStatusField('hunger', this.petAI.status.hunger + effects.hunger);
      result.hunger = effects.hunger;
    }
    if (effects.hygiene) {
      this.petAI.setStatusField('hygiene', this.petAI.status.hygiene + effects.hygiene);
      result.hygiene = effects.hygiene;
    }
    if (effects.mood) {
      this.petAI.setStatusField('mood', this.petAI.status.mood + effects.mood);
      result.mood = effects.mood;
    }
    if (effects.stamina) {
      this.petAI.setStatusField('stamina', this.petAI.status.stamina + effects.stamina);
      result.stamina = effects.stamina;
    }

    // 金币奖励
    if (effects.gold) {
      this.db.run('UPDATE users SET gold = gold + ? WHERE id = 1', effects.gold);
      result.gold = effects.gold;
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
        effects.item
      );
      result.item = effects.item;
    }

    // 好感度
    if (effects.affection) {
      this.db.run('UPDATE users SET affection = affection + ? WHERE id = 1', effects.affection);
      result.affection = effects.affection;
    }

    return result;
  }

  /**
   * 处理中性事件
   * @param {Object} event 事件定义
   * @returns {Object} 执行结果
   */
  handleNeutralEvent(event) {
    const effects = event.effects || {};
    const result = {};

    // 中性事件可能同时有正面和负面效果
    if (effects.moodChange) {
      this.petAI.setStatusField('mood', this.petAI.status.mood + effects.moodChange);
      result.mood = effects.moodChange;
    }
    if (effects.goldChange) {
      this.db.run('UPDATE users SET gold = MAX(0, gold + ?) WHERE id = 1', effects.goldChange);
      result.gold = effects.goldChange;
    }
    if (effects.item) {
      this.db.run(
        `INSERT INTO inventory (user_id, item_id, quantity) VALUES (1, ?, 1)
         ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + 1`,
        effects.item
      );
      result.item = effects.item;
    }
    if (effects.dialogue) {
      result.dialogue = effects.dialogue;
    }

    return result;
  }

  /**
   * 处理负面事件
   * @param {Object} event 事件定义
   * @returns {Object} 执行结果
   */
  handleNegativeEvent(event) {
    const effects = event.effects || {};
    const result = {};

    // 属性降低
    if (effects.hunger) {
      this.petAI.setStatusField('hunger', this.petAI.status.hunger - effects.hunger);
      result.hunger = -effects.hunger;
    }
    if (effects.hygiene) {
      this.petAI.setStatusField('hygiene', this.petAI.status.hygiene - effects.hygiene);
      result.hygiene = -effects.hygiene;
    }
    if (effects.mood) {
      this.petAI.setStatusField('mood', this.petAI.status.mood - effects.mood);
      result.mood = -effects.mood;
    }
    if (effects.stamina) {
      this.petAI.setStatusField('stamina', this.petAI.status.stamina - effects.stamina);
      result.stamina = -effects.stamina;
    }

    // 金币损失
    if (effects.gold) {
      this.db.run('UPDATE users SET gold = MAX(0, gold - ?) WHERE id = 1', effects.gold);
      result.gold = -effects.gold;
    }

    return result;
  }

  /**
   * 记录事件日志
   * @private
   */
  _logEvent(category, event, result) {
    try {
      const eventType = `random_${category || 'unknown'}`;
      const eventData = JSON.stringify({ eventId: event?.id, name: event?.name, result });
      this.db.run(
        'INSERT INTO event_log (user_id, event_type, event_data) VALUES (1, ?, ?)',
        eventType,
        eventData
      );
    } catch (err) {
      console.error('[EventManager] 日志记录失败:', err.message);
    }
  }

  /**
   * 初始化事件池（30种事件）
   * @private
   * @returns {Object} { positive: [], neutral: [], negative: [] }
   */
  _initEventPool() {
    return {
      // ═══ 正面事件（18种）═══════════════════════
      positive: [
        {
          id: 'find_coin',
          name: '捡到金币',
          emoji: '💰',
          message: '爪爪在路上捡到了闪闪发光的东西！',
          minLevel: 1,
          effects: { gold: 50, mood: 5 },
        },
        {
          id: 'rainbow',
          name: '彩虹出现',
          emoji: '🌈',
          message: '天边出现了一道美丽的彩虹！',
          minLevel: 1,
          effects: { mood: 15, affection: 2 },
        },
        {
          id: 'treasure_map',
          name: '藏宝图',
          emoji: '🗺️',
          message: '爪爪在角落发现了一张神秘的藏宝图！',
          minLevel: 3,
          effects: { gold: 100, item: 'special_mystery_box' },
        },
        {
          id: 'lucky_star',
          name: '幸运星',
          emoji: '⭐',
          message: '一颗星星落在了爪爪头上！',
          minLevel: 1,
          effects: { mood: 20, exp: 30 },
        },
        {
          id: 'gourmet_discovery',
          name: '美食发现',
          emoji: '🍜',
          message: '爪爪发现了一家超好吃的餐厅！',
          minLevel: 2,
          effects: { hunger: 30, mood: 10 },
        },
        {
          id: 'friend_visit',
          name: '朋友来访',
          emoji: '🐱',
          message: '隔壁的小猫咪来找爪爪玩啦！',
          minLevel: 1,
          effects: { mood: 20, affection: 3 },
        },
        {
          id: 'bath_spa',
          name: '温泉发现',
          emoji: '♨️',
          message: '爪爪发现了一处天然温泉！',
          minLevel: 3,
          effects: { hygiene: 30, stamina: 20, mood: 10 },
        },
        {
          id: 'golden_leaf',
          name: '金叶子',
          emoji: '🍂',
          message: '一片金色的叶子飘落到爪爪面前！',
          minLevel: 1,
          effects: { gold: 30, mood: 5 },
        },
        {
          id: 'bird_song',
          name: '鸟儿歌唱',
          emoji: '🐦',
          message: '一只小鸟停在窗台唱起了歌！',
          minLevel: 1,
          effects: { mood: 15 },
        },
        {
          id: 'nap_blessing',
          name: '美梦祝福',
          emoji: '💤',
          message: '爪爪做了一个甜甜的梦！',
          minLevel: 1,
          effects: { stamina: 30, mood: 10 },
        },
        {
          id: 'craft_masterpiece',
          name: '手工作品',
          emoji: '🎨',
          message: '爪爪做了一件超可爱的手工作品！',
          minLevel: 5,
          effects: { mood: 25, exp: 50, item: 'material_crystal' },
        },
        {
          id: 'festival_firework',
          name: '烟花绽放',
          emoji: '🎆',
          message: '远处升起了绚丽的烟花！',
          minLevel: 1,
          effects: { mood: 20, affection: 2 },
        },
        {
          id: 'merchant_gift',
          name: '商人赠礼',
          emoji: '🎁',
          message: '路过的商人送给爪爪一份礼物！',
          minLevel: 5,
          effects: { gold: 80, item: 'food_sushi' },
        },
        {
          id: 'sunshine_bath',
          name: '阳光浴',
          emoji: '☀️',
          message: '温暖的阳光洒在爪爪身上！',
          minLevel: 1,
          effects: { mood: 10, stamina: 15, hygiene: 5 },
        },
        {
          id: 'secret_garden',
          name: '秘密花园',
          emoji: '🌷',
          message: '爪爪发现了一座秘密花园！',
          minLevel: 8,
          effects: { mood: 30, item: 'material_star_dust' },
        },
        {
          id: 'treasure_chest',
          name: '宝箱',
          emoji: '📦',
          message: '爪爪在角落发现了一个小宝箱！',
          minLevel: 10,
          effects: { gold: 200, item: 'special_star_fragment' },
        },
        {
          id: 'healing_spring',
          name: '治愈之泉',
          emoji: '⛲',
          message: '爪爪喝了神奇的泉水，元气满满！',
          minLevel: 7,
          effects: { hunger: 20, hygiene: 20, mood: 20, stamina: 20 },
        },
        {
          id: 'wishing_star',
          name: '流星许愿',
          emoji: '🌠',
          message: '一道流星划过天际，爪爪许了个愿！',
          minLevel: 5,
          effects: { mood: 25, affection: 5, exp: 100 },
        },
      ],

      // ═══ 中性事件（7种）═══════════════════════
      neutral: [
        {
          id: 'weather_change',
          name: '天气变化',
          emoji: '🌤️',
          message: '天气突然变了，爪爪有点困惑...',
          minLevel: 1,
          effects: { moodChange: 0, dialogue: '该带伞吗...' },
        },
        {
          id: 'stranger_cat',
          name: '路过的猫咪',
          emoji: '😼',
          message: '一只陌生的猫咪路过，互相看了看。',
          minLevel: 1,
          effects: { moodChange: 5 },
        },
        {
          id: 'dream',
          name: '奇怪的梦',
          emoji: '💭',
          message: '爪爪做了个奇怪的梦，醒来一脸茫然。',
          minLevel: 1,
          effects: { moodChange: -3, dialogue: '刚才梦到了什么来着...' },
        },
        {
          id: 'lost_item',
          name: '失物招领',
          emoji: '🔍',
          message: '爪爪捡到一样东西，但是不知道是谁的。',
          minLevel: 3,
          effects: { goldChange: 20, dialogue: '交给警察叔叔吧' },
        },
        {
          id: 'cloud_shape',
          name: '云朵形状',
          emoji: '☁️',
          message: '爪爪看着云朵，觉得像一条鱼。',
          minLevel: 1,
          effects: { moodChange: 5, dialogue: '好像好好吃的样子...' },
        },
        {
          id: 'lucky_draw',
          name: '抽奖活动',
          emoji: '🎰',
          message: '爪爪参加了一次抽奖！',
          minLevel: 5,
          effects: { goldChange: -50, item: 'food_kibble', dialogue: '至少中了个安慰奖' },
        },
        {
          id: 'photo_time',
          name: '拍照时间',
          emoji: '📷',
          message: '爪爪摆了个pose拍了张照！',
          minLevel: 1,
          effects: { moodChange: 8 },
        },
      ],

      // ═══ 负面事件（5种）═══════════════════════
      negative: [
        {
          id: 'rain_no_umbrella',
          name: '淋雨了',
          emoji: '🌧️',
          message: '突然下起了大雨，爪爪被淋湿了！',
          minLevel: 1,
          effects: { hygiene: 15, mood: 10 },
        },
        {
          id: 'stomachache',
          name: '肚子疼',
          emoji: '🤢',
          message: '爪爪吃了不干净的东西，肚子疼了...',
          minLevel: 1,
          effects: { hunger: 10, mood: 15, stamina: 10 },
        },
        {
          id: 'nightmare',
          name: '噩梦',
          emoji: '😱',
          message: '爪爪做了个可怕的噩梦！',
          minLevel: 1,
          effects: { mood: 20, stamina: 5 },
        },
        {
          id: 'lose_coin',
          name: '丢钱了',
          emoji: '😢',
          message: '爪爪不小心把零花钱弄丢了...',
          minLevel: 1,
          effects: { gold: 30, mood: 5 },
        },
        {
          id: 'quarrel',
          name: '小争吵',
          emoji: '😾',
          message: '爪爪和邻居家的猫吵了一架！',
          minLevel: 3,
          effects: { mood: 25, stamina: 5 },
        },
      ],
    };
  }
}

module.exports = EventManager;
