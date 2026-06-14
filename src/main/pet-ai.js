// ══════════════════════════════════════════════
// pet-ai.js — 宠物AI核心类
// 属性衰减、行为树决策、情绪状态机、互动API
// ══════════════════════════════════════════════

'use strict';

const {
  STAT_LIMITS,
  DECAY_RATES,
  EMOTION_THRESHOLDS,
  BEHAVIOR_THRESHOLDS,
  EMOTIONS,
  PET_STATES,
  TIME_SLOTS,
  COOLDOWNS,
  RANDOM_BEHAVIOR_POOL,
  IPC_CHANNELS,
  ITEM_EFFECT_TYPES,
  LEVEL_EXP_CURVE,
  LEVEL_MILESTONES,
  EVOLUTION_BRANCHES,
  EVOLUTION_BRANCH_IDS,
  DEFAULT_STAT_VALUE,
  MIN_STAY_DURATION,
  EVOLUTION_REQUIRED_LEVEL,
  BEHAVIOR_DURATION_SICK,
  BEHAVIOR_DURATION_EAT,
  BEHAVIOR_DURATION_WASH,
  BEHAVIOR_DURATION_PLAY,
  BEHAVIOR_DURATION_SLEEP,
  BEHAVIOR_DURATION_ATTENTION,
  INTERACTION_DURATION_PETTING,
  INTERACTION_DURATION_EAT,
  INTERACTION_DURATION_WASH,
} = require('./constants');
const { BrowserWindow } = require('electron');

class PetAI {
  /**
   * @param {PetDatabase} database 数据库实例
   * @param {EventEmitter} eventEmitter 事件发射器（用于推送状态到renderer）
   * @param {Timer} timer 定时器管理器
   * @param {Economy} economy 经济系统实例（用于执行道具效果）
   */
  constructor(database, eventEmitter, timer, economy, skillSystem) {
    /** @type {PetDatabase} */
    this.db = database;
    /** @type {EventEmitter} */
    this.emitter = eventEmitter;
    /** @type {Timer} */
    this.timer = timer;
    /** @type {Economy} */
    this.economy = economy;
    /** @type {SkillSystem|null} */
    this.skill = skillSystem || null;

    /** @type {Object} 宠物当前状态缓存 */
    this.status = {
      hunger: DEFAULT_STAT_VALUE,
      hygiene: DEFAULT_STAT_VALUE,
      mood: DEFAULT_STAT_VALUE,
      stamina: DEFAULT_STAT_VALUE,
      emotion: EMOTIONS.NORMAL,
      state: PET_STATES.IDLE,
      isSick: false,
      sickSince: null,
    };

    /** @type {number} 宠物等级 */
    this.pet = {
      level: 1,
      exp: 0,
      evolutionType: null,
      evolutionName: null,
    };

    /** @type {boolean} 进化待处理标记（避免重复触发） */
    this._evolutionPending = false;

    /** @type {number} 衰减计数器 */
    this.decayCounter = {
      hunger: 0,
      hygiene: 0,
      mood: 0,
    };

    /** @type {Object} 冷却时间记录 */
    this.cooldowns = {
      pet: 0,
      wash: 0,
      feed: 0,
    };

    /** @type {number} 上次用户操作时间 */
    this.lastInteractionTime = Date.now();

    /** @type {string|null} 当前行为状态（持续时长控制） */
    this.currentBehavior = null;
    this.behaviorEndTime = 0;

    /** @type {number} 最短驻留时间（防止状态频繁切换） */
    this._minStayDuration = MIN_STAY_DURATION;
    this._minStayUntil = 0;

    /** @type {number} 生病状态持续计时（秒） */
    this.sickTimer = 0;

    /** @type {Object} 活跃时段行为频率修正 */
    this.behaviorFrequencyMultiplier = 1.0;

    // 绑定方法到实例，确保定时器回调中 this 正确
    this.decayTick = this.decayTick.bind(this);
    this.behaviorTick = this.behaviorTick.bind(this);
  }

  /**
   * 初始化宠物AI：从数据库加载状态，启动定时器
   */
  init() {
    console.log('[PetAI] ========== INIT v2.1 最短驻留60秒 ==========');
    // 从数据库加载状态
    this._loadStatus();

    // 启动衰减定时器（每分钟1次）
    this.timer.add('decay', this.decayTick, 60 * 1000);

    // 启动行为树定时器（每3秒1次）
    this.timer.add('behavior', this.behaviorTick, 3 * 1000);

    // 启动情绪更新定时器（每5秒1次）
    this.timer.add('emotion', () => this.updateEmotion(), 5 * 1000);

    // 启动时间段检查定时器（每分钟1次）
    this.timer.add('timecheck', () => this.checkTimeContext(), 60 * 1000);

    console.log('[PetAI] 初始化完成');
  }

  /**
   * 重置内存状态为初始值（存档重置时调用，数据库已由 IPC handler 清空）
   */
  resetState() {
    this.status = {
      hunger: DEFAULT_STAT_VALUE,
      hygiene: DEFAULT_STAT_VALUE,
      mood: DEFAULT_STAT_VALUE,
      stamina: DEFAULT_STAT_VALUE,
      emotion: EMOTIONS.NORMAL,
      state: PET_STATES.IDLE,
      isSick: false,
      sickSince: null,
    };
    this.pet = { level: 1, exp: 0, evolutionType: null, evolutionName: null };
    this._evolutionPending = false;
    this.decayCounter = { hunger: 0, hygiene: 0, mood: 0 };
    this.cooldowns = { pet: 0, wash: 0, feed: 0 };
    this.lastInteractionTime = Date.now();
    this.currentBehavior = null;
    this.behaviorEndTime = 0;
    this._minStayUntil = 0;
    this.sickTimer = 0;
    this.behaviorFrequencyMultiplier = 1.0;
    console.log('[PetAI] 状态已重置为初始值');
  }

  /**
   * 从数据库加载宠物状态
   * @private
   */
  _loadStatus() {
    const row = this.db.get('SELECT * FROM pet_status WHERE pet_id = 1');
    if (row) {
      this.status.hunger = row.hunger;
      this.status.hygiene = row.hygiene;
      this.status.mood = row.mood;
      this.status.stamina = row.stamina;
      this.status.emotion = row.emotion || EMOTIONS.NORMAL;
      this.status.state = row.state || PET_STATES.IDLE;
      // 同步 currentBehavior，确保驻留锁从数据库恢复的状态开始计时
      this.currentBehavior = this.status.state;
      this._minStayUntil = Date.now() + this._minStayDuration;
      this.status.isSick = row.is_sick === 1;
      this.status.sickSince = row.sick_since;
      // 加载等级/经验/进化信息
      this.pet.level = row.level || 1;
      this.pet.exp = row.exp || 0;
      this.pet.evolutionType = row.evolution_type || null;
      this.pet.evolutionName = row.evolution_name || null;
    }
    console.log('[PetAI] 状态加载:', this.status, '等级:', this.pet.level, '进化:', this.pet.evolutionType);
    console.log(
      '[PetAI] 驻留锁状态 → currentBehavior:',
      this.currentBehavior,
      '_minStayUntil:',
      this._minStayUntil,
      '距现在:',
      Math.round((this._minStayUntil - Date.now()) / 1000) + 's',
    );
  }

  /**
   * 保存宠物状态到数据库
   */
  saveStatus() {
    this.db.run(
      `UPDATE pet_status SET
        hunger = ?, hygiene = ?, mood = ?, stamina = ?,
        emotion = ?, state = ?, is_sick = ?, sick_since = ?,
        level = ?, exp = ?, evolution_type = ?, evolution_name = ?,
        last_updated = CURRENT_TIMESTAMP
      WHERE pet_id = 1`,
      this.status.hunger,
      this.status.hygiene,
      this.status.mood,
      this.status.stamina,
      this.status.emotion,
      this.status.state,
      this.status.isSick ? 1 : 0,
      this.status.sickSince,
      this.pet.level,
      this.pet.exp,
      this.pet.evolutionType,
      this.pet.evolutionName,
    );
  }

  // ══════════════════════════════════════════════
  // 属性衰减（每分钟 tick）
  // ══════════════════════════════════════════════

  /**
   * 每分钟属性衰减 tick
   * 饱食：每3次tick -1
   * 清洁：每5次tick -1
   * 心情：每2次tick -1
   * 体力：活动消耗 -2/min，静止 +2/min，睡觉 +5/min
   */
  decayTick() {
    // 进化加成：defenseMultiplier 降低衰减速率（衰减速率 *= 1/defenseMultiplier）
    const bonus = this._getEvolutionBonus();
    const decayFactor = 1 / bonus.defenseMultiplier;

    // 饱食衰减
    this.decayCounter.hunger++;
    if (this.decayCounter.hunger >= DECAY_RATES.HUNGER_TICK_INTERVAL) {
      this.status.hunger = Math.max(
        STAT_LIMITS.MIN,
        this.status.hunger - Math.round(DECAY_RATES.HUNGER_PER_TICK * decayFactor),
      );
      this.decayCounter.hunger = 0;
    }

    // 清洁衰减
    this.decayCounter.hygiene++;
    if (this.decayCounter.hygiene >= DECAY_RATES.HYGIENE_TICK_INTERVAL) {
      this.status.hygiene = Math.max(
        STAT_LIMITS.MIN,
        this.status.hygiene - Math.round(DECAY_RATES.HYGIENE_PER_TICK * decayFactor),
      );
      this.decayCounter.hygiene = 0;
    }

    // 心情衰减
    this.decayCounter.mood++;
    if (this.decayCounter.mood >= DECAY_RATES.MOOD_TICK_INTERVAL) {
      this.status.mood = Math.max(
        STAT_LIMITS.MIN,
        this.status.mood - Math.round(DECAY_RATES.MOOD_PER_TICK * decayFactor),
      );
      this.decayCounter.mood = 0;
    }

    // 体力变化（取决于当前状态）
    if (this.status.state === PET_STATES.SLEEP) {
      // 睡眠中恢复体力
      this.status.stamina = Math.min(STAT_LIMITS.MAX, this.status.stamina + DECAY_RATES.STAMINA_SLEEP_GAIN);
    } else if (this._isActiveState(this.status.state)) {
      // 活动消耗体力（受 defenseMultiplier 保护）
      this.status.stamina = Math.max(
        STAT_LIMITS.MIN,
        this.status.stamina - Math.round(DECAY_RATES.STAMINA_ACTIVE_DRAIN * decayFactor),
      );
    } else {
      // 静止恢复体力
      this.status.stamina = Math.min(STAT_LIMITS.MAX, this.status.stamina + DECAY_RATES.STAMINA_REST_GAIN);
    }

    // 生病检测
    this._checkSickness();
  }

  /**
   * 判断当前状态是否为活动状态
   * @param {string} state 当前状态
   * @returns {boolean}
   * @private
   */
  _isActiveState(state) {
    const activeStates = [
      PET_STATES.WALK,
      PET_STATES.PLAY,
      PET_STATES.DANCE,
      PET_STATES.BALL,
      PET_STATES.WORK,
      PET_STATES.WASH,
    ];
    return activeStates.includes(state);
  }

  /**
   * 检测是否生病/恢复
   * 饱食 < 15 且 清洁 < 15 持续10分钟 → 生病
   * 已生病时，饱食 >= 15 且 清洁 >= 15 持续10分钟 → 恢复
   * sickTimer 含义：正值=坏条件持续秒数；负值=恢复条件持续秒数（取绝对值）
   * 条件翻转时 timer 归零重新开始
   * @private
   */
  _checkSickness() {
    const SICK_SEC = EMOTION_THRESHOLDS.SICK_DURATION_MIN * 60;
    const bad =
      this.status.hunger < EMOTION_THRESHOLDS.SICK_HUNGER && this.status.hygiene < EMOTION_THRESHOLDS.SICK_HYGIENE;

    if (bad) {
      // ── 条件差 ──
      if (this.status.isSick) {
        // 已病且仍差 → 无事发生（保持生病）
        return;
      }
      // 还没病：首次进入或从恢复态切回 → 重置为正计时
      if (this.sickTimer <= 0) {
        this.status.sickSince = new Date().toISOString();
        this.sickTimer = 0;
      }
      this.sickTimer += 60;
      if (this.sickTimer >= SICK_SEC) {
        this.status.isSick = true;
      }
    } else {
      // ── 条件好 ──
      if (this.status.isSick) {
        // 已病但条件好转
        if (this.sickTimer > 0) {
          // 刚从坏条件切换到好条件 → 重置为负计时（恢复冷却入口）
          // 注意：不重置 sickSince，它记录的是发病时间，不是恢复开始时间
          this.sickTimer = 0;
        }
        // 累加恢复计时（用负值避免与发病计时混淆）
        this.sickTimer -= 60;
        if (this.sickTimer <= -SICK_SEC) {
          this._clearSickness();
        }
      } else if (this.sickTimer > 0) {
        // 健康但之前有发病计时积累（条件中途好转）→ 清除
        this.status.sickSince = null;
        this.sickTimer = 0;
      }
      // 健康且 timer<=0 → 无事发生
    }
  }

  /**
   * 清除生病状态（统一入口，替代散落在 wash/_checkSickness/_executeItemEffect 中的重复代码）
   * @private
   */
  _clearSickness() {
    this.status.isSick = false;
    this.status.sickSince = null;
    this.sickTimer = 0;
  }

  // ══════════════════════════════════════════════
  // 行为树决策（每3秒）
  // ══════════════════════════════════════════════

  /**
   * 行为树 tick
   * 检查当前行为是否结束，然后按优先级决策
   */
  behaviorTick() {
    const now = Date.now();
    const remaining = Math.round(Math.max(0, this._minStayUntil - now) / 1000);

    // 最短驻留保护：确保行为至少持续 _minStayDuration
    if (this.currentBehavior && now < this._minStayUntil) {
      // 每 30 秒推一次锁状态（避免刷屏）
      if (remaining % 30 < 3) {
        if (this.emitter)
          this.emitter.send(
            'pet:debug-log',
            `[PetAI] behaviorTick 驻留锁: ${this.currentBehavior}, 剩余 ${remaining}s`,
          );
      }
      return;
    }

    // 检查需求优先级
    const decision = this.checkNeeds();
    if (decision) {
      if (this.emitter)
        this.emitter.send('pet:debug-log', `[PetAI] 需求触发: ${decision.state}, 持续: ${decision.duration / 1000}s`);
      this._setState(decision.state, decision.duration);
      if (decision.effect) {
        decision.effect();
      }
    } else {
      // 全部正常 → 随机行为池
      this._executeRandomBehavior();
    }
  }

  /**
   * 行为树：检查需求并决策
   * 优先级：生病 > 饥饿 > 脏 > 无聊 > 疲劳 > 随机
   * @returns {Object|null} 决策对象 { state, duration, effect? }
   */
  checkNeeds() {
    const s = this.status;

    // 0. 生病优先
    if (s.isSick) {
      return {
        state: PET_STATES.SICK,
        duration: BEHAVIOR_DURATION_SICK,
        effect: () => {
          // 生病时缓慢恢复
          s.hunger = Math.min(STAT_LIMITS.MAX, s.hunger + 1);
          s.hygiene = Math.min(STAT_LIMITS.MAX, s.hygiene + 1);
        },
      };
    }

    // 1. 饱食 < 20 → 走向食盆 → 吃饭
    if (s.hunger < BEHAVIOR_THRESHOLDS.NEED_EAT) {
      return {
        state: PET_STATES.EAT,
        duration: BEHAVIOR_DURATION_EAT,
        effect: () => {
          s.hunger = Math.min(STAT_LIMITS.MAX, s.hunger + BEHAVIOR_THRESHOLDS.AUTO_EAT_GAIN);
        },
      };
    }

    // 2. 清洁 < 20 → 洗澡
    if (s.hygiene < BEHAVIOR_THRESHOLDS.NEED_WASH) {
      return {
        state: PET_STATES.WASH,
        duration: BEHAVIOR_DURATION_WASH,
        effect: () => {
          s.hygiene = Math.min(STAT_LIMITS.MAX, s.hygiene + BEHAVIOR_THRESHOLDS.AUTO_WASH_GAIN);
        },
      };
    }

    // 3. 心情 < 25 → 玩耍/撒娇
    if (s.mood < BEHAVIOR_THRESHOLDS.NEED_PLAY) {
      const playState = Math.random() < 0.5 ? PET_STATES.PLAY : PET_STATES.SULKING;
      return {
        state: playState,
        duration: BEHAVIOR_DURATION_PLAY,
        effect: () => {
          s.mood = Math.min(STAT_LIMITS.MAX, s.mood + BEHAVIOR_THRESHOLDS.AUTO_PLAY_GAIN);
        },
      };
    }

    // 4. 体力 < 15 → 睡觉
    if (s.stamina < BEHAVIOR_THRESHOLDS.NEED_SLEEP) {
      return {
        state: PET_STATES.SLEEP,
        duration: BEHAVIOR_DURATION_SLEEP,
      };
    }

    // 5. 用户30分钟无操作 → 吸引注意
    const idleTime = Date.now() - this.lastInteractionTime;
    if (idleTime > COOLDOWNS.ATTENTION_IDLE) {
      return {
        state: PET_STATES.ATTENTION,
        duration: BEHAVIOR_DURATION_ATTENTION,
        effect: () => {
          this.lastInteractionTime = Date.now(); // 重置计时
        },
      };
    }

    return null;
  }

  /**
   * 从随机行为池中选取并执行一个行为
   * @private
   */
  _executeRandomBehavior() {
    // 根据权重选择行为
    const pool = RANDOM_BEHAVIOR_POOL;
    const totalWeight = pool.reduce((sum, b) => sum + b.weight, 0);
    let rand = Math.random() * totalWeight;

    let selected = pool[0];
    for (const behavior of pool) {
      rand -= behavior.weight;
      if (rand <= 0) {
        selected = behavior;
        break;
      }
    }

    // 直接使用原始 duration，不再应用乘法修正
    // 之前 behaviorFrequencyMultiplier 和 speedMultiplier 会压缩持续时间，导致状态切换太快
    const duration = selected.duration;
    if (this.emitter)
      this.emitter.send('pet:debug-log', `[PetAI] 随机行为: ${selected.state}, 持续: ${(duration / 1000).toFixed(1)}s`);
    this._setState(selected.state, duration);
  }

  /**
   * 设置宠物行为状态
   * @param {string} state 行为状态
   * @param {number} duration 持续时间（毫秒）
   * @private
   */
  _setState(state, duration) {
    const now = Date.now();
    // 调试日志仅在 --dev 模式输出（减少生产环境噪音）
    if (process.argv.includes('--dev')) {
      const durationS = (duration / 1000).toFixed(1);
      const stayRemaining = Math.round(Math.max(0, this._minStayUntil - now) / 1000);
      console.log(
        `[PetAI] _setState: ${this.currentBehavior} → ${state}, duration: ${durationS}s, 驻留锁剩余: ${stayRemaining}s`,
      );
    }
    this.status.state = state;
    this.currentBehavior = state;
    this.behaviorEndTime = now + duration;
    // 最短驻留保护：确保行为至少持续 _minStayDuration
    this._minStayUntil = now + this._minStayDuration;

    // 通知 renderer 状态变化（发送完整状态，避免部分字段缺失）
    if (this.emitter) {
      this.emitter.send(IPC_CHANNELS.PET_STATE_PUSH, this.getStatus());
    }
  }

  // ══════════════════════════════════════════════
  // 情绪状态机
  // ══════════════════════════════════════════════

  /**
   * 根据属性值更新情绪状态
   */
  updateEmotion() {
    const s = this.status;
    let newEmotion = EMOTIONS.NORMAL;

    // 优先级：sick > hungry > dirty > tired > bored > happy > normal
    if (s.isSick) {
      newEmotion = EMOTIONS.SICK;
    } else if (s.hunger < EMOTION_THRESHOLDS.HUNGRY_HUNGER) {
      newEmotion = EMOTIONS.HUNGRY;
    } else if (s.hygiene < EMOTION_THRESHOLDS.DIRTY_HYGIENE) {
      newEmotion = EMOTIONS.DIRTY;
    } else if (s.stamina < EMOTION_THRESHOLDS.TIRED_STAMINA) {
      newEmotion = EMOTIONS.TIRED;
    } else if (s.mood < EMOTION_THRESHOLDS.BORED_MOOD) {
      newEmotion = EMOTIONS.BORED;
    } else if (s.hunger > EMOTION_THRESHOLDS.HAPPY_HUNGER && s.mood > EMOTION_THRESHOLDS.HAPPY_MOOD) {
      newEmotion = EMOTIONS.HAPPY;
    }

    // 情绪变化时通知 renderer（发送完整状态，避免部分字段缺失）
    if (newEmotion !== s.emotion) {
      s.emotion = newEmotion;
      if (this.emitter) {
        this.emitter.send(IPC_CHANNELS.PET_STATE_PUSH, this.getStatus());
      }
    }
  }

  // ══════════════════════════════════════════════
  // 时间感知
  // ══════════════════════════════════════════════

  /**
   * 检查当前时间段并触发对应行为
   */
  checkTimeContext() {
    // 驻留锁：行为未持续满 _minStayDuration 时，不触发时间段行为
    const now = Date.now();
    if (now < this._minStayUntil) {
      const remaining = Math.round((this._minStayUntil - now) / 1000);
      if (this.emitter) this.emitter.send('pet:debug-log', `[PetAI] checkTimeContext 驻留锁拦截, 剩余 ${remaining}s`);
      return;
    }

    const hour = new Date().getHours();

    // 07:00-08:00 → 起床动画
    if (hour >= 7 && hour < 8) {
      if (this.status.state === PET_STATES.SLEEP) {
        // 播放WAKEUP动画5秒，不要立即覆盖状态！
        // 行为tick会在 behaviorEndTime 后检查并发现WAKEUP不在需求列表中，自动转IDLE
        this._setState(PET_STATES.WAKEUP, 5000);
        // 同时恢复体力
        this.status.stamina = Math.min(STAT_LIMITS.MAX, this.status.stamina + 20);
      }
      this.behaviorFrequencyMultiplier = 1.0;
    }
    // 12:00-13:00 → 午餐提醒
    else if (hour >= 12 && hour < 13) {
      if (this.status.hunger < 50) {
        // 提醒喂食
        if (this.emitter) {
          this.emitter.send(IPC_CHANNELS.EVENT_TRIGGER, {
            type: 'lunch_reminder',
            message: '爪爪肚子饿了，该吃午饭啦！',
          });
        }
      }
      this.behaviorFrequencyMultiplier = 1.0;
    }
    // 19:00-21:00 → 活跃时段
    else if (hour >= 19 && hour < 21) {
      this.behaviorFrequencyMultiplier = 1.5;
    }
    // 22:00-07:00 → 睡眠时段
    else if (hour >= 22 || hour < 7) {
      this.behaviorFrequencyMultiplier = 0.2;
      // 如果不是在睡觉，有概率进入睡觉
      if (this.status.state !== PET_STATES.SLEEP && this.status.state !== PET_STATES.SICK) {
        if (Math.random() < 0.3) {
          this._setState(PET_STATES.SLEEP, 60000);
        }
      }
    }
    // 其他时段
    else {
      this.behaviorFrequencyMultiplier = 1.0;
    }

    console.log(
      `[PetAI] checkTimeContext: hour=${hour}, multiplier=${this.behaviorFrequencyMultiplier}, state=${this.status.state}`,
    );
    if (this.emitter)
      this.emitter.send(
        'pet:debug-log',
        `[PetAI] checkTimeContext: hour=${hour}, multiplier=${this.behaviorFrequencyMultiplier}`,
      );
  }

  // ══════════════════════════════════════════════
  // 互动 API（供 IPC 调用）
  // ══════════════════════════════════════════════

  /**
   * 抚摸互动
   * 心情 +5，好感 +1，冷却 10秒
   * @param {number} userId 用户ID
   * @returns {Object} { success, message, status }
   */
  pet(userId) {
    const now = Date.now();
    if (now < this.cooldowns.pet) {
      const remaining = Math.ceil((this.cooldowns.pet - now) / 1000);
      return {
        success: false,
        message: `爪爪还在害羞中，${remaining}秒后再摸~`,
        status: this.getStatus(),
      };
    }

    // 心情 +5
    this.status.mood = Math.min(STAT_LIMITS.MAX, this.status.mood + 5);

    // 好感 +1（更新数据库）
    this.db.run('UPDATE users SET affection = affection + 1 WHERE id = ?', userId);

    // 经验 +2
    this._addExp(2);

    // 记录互动时间
    this.lastInteractionTime = now;
    this.cooldowns.pet = now + COOLDOWNS.PET;

    // 设置抚摸动画
    this._setState(PET_STATES.PETTING, INTERACTION_DURATION_PETTING);

    // 记录事件日志
    this._logEvent('pet', { moodGain: 5, affectionGain: 1, expGain: 2 });

    return {
      success: true,
      message: '爪爪蹭了蹭你的手~',
      status: this.getStatus(),
    };
  }

  /**
   * 喂食互动
   * @param {number} userId 用户ID（传入而非硬编码1）
   * @param {string} itemId 道具ID
   * @returns {Object} { success, message, status }
   */
  feed(userId, itemId) {
    const now = Date.now();
    if (now < this.cooldowns.feed) {
      const remaining = Math.ceil((this.cooldowns.feed - now) / 1000);
      return {
        success: false,
        message: `爪爪刚吃过，${remaining}秒后再喂~`,
        status: this.getStatus(),
      };
    }

    // 查询道具信息
    const item = this.db.get('SELECT * FROM items WHERE id = ?', itemId);
    if (!item) {
      return { success: false, message: '道具不存在', status: this.getStatus() };
    }

    // 检查背包是否有该道具
    const inv = this.db.get('SELECT * FROM inventory WHERE user_id = ? AND item_id = ?', userId, itemId);
    if (!inv || inv.quantity <= 0) {
      return { success: false, message: '背包中没有该道具', status: this.getStatus() };
    }

    // 执行道具效果
    this._executeItemEffect(userId, item);

    // 经验 +5
    this._addExp(5);

    // 消耗道具
    this.db.run('UPDATE inventory SET quantity = quantity - 1 WHERE user_id = ? AND item_id = ?', userId, itemId);
    // 数量为0时删除记录
    this.db.run('DELETE FROM inventory WHERE user_id = ? AND item_id = ? AND quantity <= 0', userId, itemId);

    // 设置吃饭动画
    this._setState(PET_STATES.EAT, INTERACTION_DURATION_EAT);
    this.lastInteractionTime = now;
    this.cooldowns.feed = now + COOLDOWNS.FEED;

    // 记录事件日志
    this._logEvent('feed', { userId, itemId: itemId, itemName: item.name, expGain: 5 });

    return {
      success: true,
      message: `爪爪吃了${item.name}，好满足~`,
      status: this.getStatus(),
    };
  }

  /**
   * 洗澡互动
   * 清洁 +50，冷却 5分钟
   * @returns {Object} { success, message, status }
   */
  wash() {
    const now = Date.now();
    if (now < this.cooldowns.wash) {
      const remaining = Math.ceil((this.cooldowns.wash - now) / 1000);
      return {
        success: false,
        message: `爪爪刚洗过澡，${remaining}秒后再洗~`,
        status: this.getStatus(),
      };
    }

    // 清洁 +50
    this.status.hygiene = Math.min(STAT_LIMITS.MAX, this.status.hygiene + 50);

    // 设置洗澡动画
    this._setState(PET_STATES.WASH, INTERACTION_DURATION_WASH);
    this.lastInteractionTime = now;
    this.cooldowns.wash = now + COOLDOWNS.WASH;

    // 如果生病且清洁恢复，有可能治愈
    if (this.status.isSick && this.status.hygiene > 50) {
      this._clearSickness();
    }

    // 记录事件日志
    this._logEvent('wash', { hygieneGain: 50 });

    return {
      success: true,
      message: '爪爪洗得干干净净~',
      status: this.getStatus(),
    };
  }

  /**
   * 获取当前完整状态（合并 pet_status + users + achievements 数据）
   * @returns {Object} 完整状态对象
   */
  getStatus() {
    // 从 users 表获取用户侧数据（金币/钻石/好感度/用户名）
    let userData = {};
    try {
      const user = this.db.get('SELECT name, gold, diamond, affection FROM users WHERE id = 1');
      if (user) {
        userData = {
          name: user.name || '爪爪',
          gold: user.gold || 0,
          diamond: user.diamond || 0,
          affection: user.affection || 0,
        };
      }
    } catch (e) {
      console.warn('[PetAI] users 表查询失败:', e.message);
    }

    // 从 achievements 表获取成就数量
    let achievementCount = 0;
    try {
      const row = this.db.get('SELECT COUNT(*) as cnt FROM achievements WHERE user_id = 1');
      achievementCount = row ? row.cnt : 0;
    } catch (e) {
      console.warn('[PetAI] achievements 表查询失败:', e.message);
    }

    // 计算升级所需经验
    const nextLevelExp = this.pet.level < EVOLUTION_REQUIRED_LEVEL ? LEVEL_EXP_CURVE[this.pet.level] : null;
    const expToNext = nextLevelExp ? nextLevelExp : 0;

    // 根据等级生成称号
    const LEVEL_TITLES = {
      1: '新手宠物',
      2: '新手宠物',
      3: '小伙伴',
      4: '小伙伴',
      5: '好朋友',
      6: '好朋友',
      7: '好伙伴',
      8: '好伙伴',
      9: '小能手',
      10: '小能手',
      11: '资深伙伴',
      12: '资深伙伴',
      13: '高级伙伴',
      14: '高级伙伴',
      15: '精英伙伴',
      16: '精英伙伴',
      17: '传说伙伴',
      18: '传说伙伴',
      19: '神话伙伴',
      20: '终极进化',
    };

    return {
      // 四大属性
      hunger: this.status.hunger,
      hygiene: this.status.hygiene,
      mood: this.status.mood,
      stamina: this.status.stamina,
      // 情绪/行为状态
      emotion: this.status.emotion,
      state: this.status.state,
      isSick: this.status.isSick,
      behaviorFrequencyMultiplier: this.behaviorFrequencyMultiplier,
      // 等级/经验
      level: this.pet.level,
      exp: this.pet.exp,
      expToNext: expToNext,
      // 进化
      evolutionType: this.pet.evolutionType,
      evolutionName: this.pet.evolutionName,
      // 用户侧数据
      name: userData.name || '爪爪',
      title: this.pet.evolutionName || LEVEL_TITLES[this.pet.level] || '新手宠物',
      gold: userData.gold,
      diamond: userData.diamond,
      affection: userData.affection,
      // 成就
      achievements: achievementCount,
    };
  }

  /**
   * 立即向 renderer 推送当前宠物状态（不等待3秒定时器）
   * 用于关键操作（喂食/洗澡/使用道具等）后即时同步
   */
  pushState() {
    try {
      const state = this.getStatus();
      console.log('[PetAI] pushState:', state);
      this.emitter.send(IPC_CHANNELS.PET_STATE_PUSH, state);
    } catch (err) {
      console.error('[PetAI] pushState 失败:', err.message);
    }
  }

  /**
   * 安全设置单个状态字段（带范围校验）
   * 供外部模块（如 event-manager）修改宠物状态，避免直接操作 .status
   * @param {string} key 状态字段名（hunger/hygiene/mood/stamina/emotion/state）
   * @param {*} value 新值
   * @returns {{ success: boolean, oldValue: *, newValue: * }}
   */
  setStatusField(key, value) {
    const ALLOWED_FIELDS = ['hunger', 'hygiene', 'mood', 'stamina', 'emotion', 'state'];
    if (!ALLOWED_FIELDS.includes(key)) {
      return { success: false, oldValue: null, newValue: null };
    }

    const oldValue = this.status[key];

    // 数值字段做范围校验
    if (['hunger', 'hygiene', 'mood', 'stamina'].includes(key)) {
      value = Math.max(STAT_LIMITS.MIN, Math.min(STAT_LIMITS.MAX, value));
    }

    this.status[key] = value;
    return { success: true, oldValue, newValue: value };
  }

  /**
   * 执行道具效果（委托给 economy.executeItemEffect）
   * @param {number} userId 用户ID
   * @param {Object} item 道具数据行
   * @returns {Object} 效果结果
   * @private
   */
  _executeItemEffect(userId, item) {
    const effects = this.economy.executeItemEffect(userId, item);

    // 将宠物属性变更写入 this.status
    if (effects._petStatChanges) {
      const changes = effects._petStatChanges;
      if (changes.hunger !== undefined) {
        this.status.hunger = Math.min(STAT_LIMITS.MAX, this.status.hunger + changes.hunger);
      }
      if (changes.hygiene !== undefined) {
        this.status.hygiene = Math.min(STAT_LIMITS.MAX, this.status.hygiene + changes.hygiene);
      }
      if (changes.mood !== undefined) {
        this.status.mood = Math.min(STAT_LIMITS.MAX, this.status.mood + changes.mood);
      }
      if (changes.stamina !== undefined) {
        this.status.stamina = Math.min(STAT_LIMITS.MAX, this.status.stamina + changes.stamina);
      }
    }

    // 治疗道具额外处理：清除生病状态
    if (item.effect_type === ITEM_EFFECT_TYPES.HEAL && this.status.isSick) {
      this._clearSickness();
    }

    return effects;
  }

  /**
   * 记录事件日志
   * @param {string} eventType 事件类型
   * @param {Object} data 事件数据
   * @private
   */
  _logEvent(eventType, data = {}) {
    try {
      const type = eventType || 'unknown';
      this.db.run(
        'INSERT INTO event_log (user_id, event_type, event_data) VALUES (1, ?, ?)',
        type,
        JSON.stringify(data),
      );
    } catch (err) {
      console.error('[PetAI] 日志记录失败:', err.message);
    }
  }

  // ══════════════════════════════════════════════
  // 进化加成系统
  // ══════════════════════════════════════════════

  /**
   * 获取进化加成倍率
   * @returns {{ attackMultiplier: number, defenseMultiplier: number, speedMultiplier: number }}
   */
  _getEvolutionBonus() {
    if (!this.pet.evolutionType) {
      return { attackMultiplier: 1, defenseMultiplier: 1, speedMultiplier: 1 };
    }
    const branch = EVOLUTION_BRANCHES[this.pet.evolutionType];
    if (!branch || !branch.bonus) {
      return { attackMultiplier: 1, defenseMultiplier: 1, speedMultiplier: 1 };
    }
    return {
      attackMultiplier: branch.bonus.attackMultiplier || 1,
      defenseMultiplier: branch.bonus.defenseMultiplier || 1,
      speedMultiplier: branch.bonus.speedMultiplier || 1,
    };
  }

  // ══════════════════════════════════════════════
  // 升级系统（Lv1→Lv20，经验曲线 + 里程碑 + 进化）
  // ══════════════════════════════════════════════

  /**
   * 统一经验入口 — 所有 exp 获取必须调用此方法
   * @param {number} amount 本次获得的经验值
   */
  _addExp(amount) {
    if (typeof amount !== 'number' || amount <= 0) return;
    // 进化加成：attackMultiplier 影响打工/小游戏/互动收益
    const bonus = this._getEvolutionBonus();
    // 进化专属技能加成（如 fire 进化 expBonus: 1.2）
    let skillBonus = 1;
    if (this.skill && this.pet.evolutionType) {
      skillBonus = this.skill.getEvolutionSkillBonus(this.pet.evolutionType);
    }
    const finalAmount = Math.round(amount * bonus.attackMultiplier * skillBonus * 100) / 100;
    this.pet.exp += finalAmount;
    this._checkLevelUp();
  }

  /**
   * 升级检查（支持多跳）
   * 循环检查：while (level < 20 && exp >= 下一级所需exp)
   * @private
   */
  _checkLevelUp() {
    while (this.pet.level < EVOLUTION_REQUIRED_LEVEL) {
      const nextLevelExp = LEVEL_EXP_CURVE[this.pet.level];
      if (!nextLevelExp || this.pet.exp < nextLevelExp) break;

      this.pet.exp -= nextLevelExp;
      this.pet.level++;

      // 发送升级 IPC 事件
      this._sendIPCEvent('pet:level-up', {
        level: this.pet.level,
        remainingExp: this.pet.exp,
      });

      // 检查里程碑奖励
      this._grantMilestone(this.pet.level);

      // 检查是否达到 Lv20 触发进化
      if (this.pet.level >= EVOLUTION_REQUIRED_LEVEL) {
        this._checkEvolutionReady();
      }

      console.log(`[PetAI] 升级！Lv${this.pet.level - 1} → Lv${this.pet.level}`);
    }

    // 保存等级和经验到数据库
    this.saveStatus();
  }

  /**
   * 里程碑奖励发放（只触发一次）
   * @param {number} level 当前等级
   * @private
   */
  _grantMilestone(level) {
    const milestone = LEVEL_MILESTONES[level];
    if (!milestone) return;

    const rewards = milestone.rewards;
    const userId = 1;

    // 发放货币奖励
    if (rewards.gold > 0) {
      this.economy.addGold(userId, rewards.gold, `升级里程碑Lv${level}`);
    }
    if (rewards.diamond > 0) {
      this.economy.addDiamond(userId, rewards.diamond, `升级里程碑Lv${level}`);
    }
    if (rewards.heart_coin > 0) {
      this.economy.addHeartCoin(userId, rewards.heart_coin, `升级里程碑Lv${level}`);
    }

    // 发放物品奖励
    if (rewards.items && rewards.items.length > 0) {
      for (const itemId of rewards.items) {
        this.economy.addItem(userId, itemId, 1);
      }
    }

    // 发送里程碑 IPC 事件
    this._sendIPCEvent('pet:milestone', {
      level,
      title: milestone.title,
      rewards: milestone.rewards,
    });

    console.log(`[PetAI] 里程碑奖励：Lv${level} - ${milestone.title}`);
  }

  /**
   * 进化就绪检查
   * @private
   */
  _checkEvolutionReady() {
    if (this.pet.level >= EVOLUTION_REQUIRED_LEVEL && !this.pet.evolutionType && !this._evolutionPending) {
      this._evolutionPending = true;
      this._sendIPCEvent('pet:evolution-ready', { level: 20 });
      console.log('[PetAI] 进化就绪！请选择进化方向');
    }
  }

  /**
   * IPC 事件发送辅助 — 通过 webContents 发送到渲染进程
   * @param {string} channel 事件频道（如 'pet:level-up'）
   * @param {Object} data 事件数据
   * @private
   */
  _sendIPCEvent(channel, data) {
    try {
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        if (win.webContents && !win.webContents.isDestroyed()) {
          win.webContents.send('pet:event', { channel, data });
        }
      }
    } catch (err) {
      // 窗口未找到或已销毁，静默失败
      console.warn('[PetAI] IPC 事件发送失败:', err.message);
    }
  }

  /**
   * 宠物进化（Lv20 后调用，三选一，不可逆）
   * @param {string} evolutionTypeId 进化类型 ('fire'|'ice'|'thunder')
   * @throws {Error} 等级不足、已进化过、或无效进化类型
   */
  evolve(evolutionTypeId) {
    // 验证等级
    if (this.pet.level < EVOLUTION_REQUIRED_LEVEL) {
      throw new Error('等级不足，需要达到 Lv20 才能进化');
    }

    // 验证是否已进化
    if (this.pet.evolutionType) {
      throw new Error('宠物已经进化过，无法再次进化');
    }

    // 验证进化类型
    if (!EVOLUTION_BRANCHES[evolutionTypeId]) {
      throw new Error('无效的进化类型');
    }

    // 应用进化
    const branch = EVOLUTION_BRANCHES[evolutionTypeId];
    this.pet.evolutionType = evolutionTypeId;
    this.pet.evolutionName = branch.name;

    // 发送进化事件
    this._sendIPCEvent('pet:evolved', {
      evolutionType: evolutionTypeId,
      evolutionName: branch.name,
    });

    // 保存进化信息
    this.saveStatus();

    // 记录事件日志
    this._logEvent('evolve', { evolutionType: evolutionTypeId, evolutionName: branch.name });

    // 注册进化专属技能到技能系统
    if (this.skill && branch.exclusiveSkill) {
      this.skill.addEvolutionSkill(1, evolutionTypeId, branch.exclusiveSkill);
    }

    console.log(`[PetAI] 进化成功！→ ${branch.name}`);

    return {
      success: true,
      evolutionType: evolutionTypeId,
      evolutionName: branch.name,
      bonus: branch.bonus,
      exclusiveSkill: branch.exclusiveSkill,
    };
  }

  /**
   * 获取宠物等级信息
   * @returns {Object} 等级信息
   */
  getLevelInfo() {
    const level = this.pet.level;
    const exp = this.pet.exp;
    let nextLevelExp = null;
    let expToNext = null;

    if (level < 20) {
      nextLevelExp = LEVEL_EXP_CURVE[level];
      expToNext = nextLevelExp ? nextLevelExp - exp : null;
    }

    return {
      level,
      exp,
      nextLevelExp,
      expToNext,
      evolutionType: this.pet.evolutionType,
      evolutionName: this.pet.evolutionName,
    };
  }
}

module.exports = PetAI;
