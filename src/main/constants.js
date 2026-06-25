// ══════════════════════════════════════════════
// constants.js — 爪爪桌宠全局共享常量
// 所有模块从此文件引入常量，禁止硬编码魔法数字
// ══════════════════════════════════════════════

'use strict';

// ─── 属性上下限 ───────────────────────────────
const STAT_LIMITS = {
  MIN: 0,
  MAX: 100,
  HUNGER_MIN: 0,
  HUNGER_MAX: 100,
  HYGIENE_MIN: 0,
  HYGIENE_MAX: 100,
  MOOD_MIN: 0,
  MOOD_MAX: 100,
  STAMINA_MIN: 0,
  STAMINA_MAX: 100,
};

// ─── 属性衰减速率（每分钟衰减量）─────────────
// 注意：decayTick 每分钟调用一次
const DECAY_RATES = {
  HUNGER_PER_TICK: 1, // 每3分钟 -1（内部计数器控制）
  HUNGER_TICK_INTERVAL: 3, // 每3次tick衰减一次
  HYGIENE_PER_TICK: 1, // 每5分钟 -1
  HYGIENE_TICK_INTERVAL: 5,
  MOOD_PER_TICK: 1, // 每2分钟 -1
  MOOD_TICK_INTERVAL: 2,
  STAMINA_ACTIVE_DRAIN: 2, // 活动时每分钟 -2
  STAMINA_REST_GAIN: 2, // 静止时每分钟 +2
  STAMINA_SLEEP_GAIN: 5, // 睡眠时每分钟 +5
};

// ─── 情绪阈值 ──────────────────────────────────
const EMOTION_THRESHOLDS = {
  HAPPY_HUNGER: 60, // 饱食 > 60 且 心情 > 60 → happy
  HAPPY_MOOD: 60,
  HUNGRY_HUNGER: 30, // 饱食 < 30 → hungry
  DIRTY_HYGIENE: 25, // 清洁 < 25 → dirty
  SICK_HUNGER: 15, // 饱食 < 15 且 清洁 < 15 持续10分钟 → sick
  SICK_HYGIENE: 15,
  SICK_DURATION_MIN: 10, // 持续10分钟才判定生病
  BORED_MOOD: 20, // 心情 < 20 → bored
  TIRED_STAMINA: 20, // 体力 < 20 → tired
};

// ─── 行为触发阈值（行为树优先级判断）─────────
const BEHAVIOR_THRESHOLDS = {
  NEED_EAT: 20, // 饱食 < 20 → 走向食盆
  NEED_WASH: 20, // 清洁 < 20 → 走向浴室
  NEED_PLAY: 25, // 心情 < 25 → 玩耍/撒娇
  NEED_SLEEP: 15, // 体力 < 15 → 睡觉
  AUTO_EAT_GAIN: 40, // 自动吃饭 +40
  AUTO_WASH_GAIN: 40, // 自动洗澡 +40
  AUTO_PLAY_GAIN: 30, // 自动玩耍 +30
};

// ─── 宠物情绪枚举 ──────────────────────────────
const EMOTIONS = {
  HAPPY: 'happy',
  HUNGRY: 'hungry',
  DIRTY: 'dirty',
  SICK: 'sick',
  BORED: 'bored',
  TIRED: 'tired',
  NORMAL: 'normal',
  EXCITED: 'excited',
  SAD: 'sad',
};

// ─── 宠物行为状态枚举 ──────────────────────────
const PET_STATES = {
  IDLE: 'idle', // 待机
  WALK: 'walk', // 行走
  SIT: 'sit', // 坐下
  SLEEP: 'sleep', // 睡觉
  EAT: 'eat', // 吃饭
  WASH: 'wash', // 洗澡
  PLAY: 'play', // 玩耍
  DANCE: 'dance', // 跳舞
  READ: 'read', // 看书
  BALL: 'ball', // 玩球
  PETTING: 'petting', // 被抚摸
  SULKING: 'sulking', // 撒娇
  WAKEUP: 'wakeup', // 起床
  ATTENTION: 'attention', // 吸引注意
  WORK: 'work', // 打工
  SICK: 'sick', // 生病
};

// ─── 时间段枚举 ────────────────────────────────
const TIME_SLOTS = {
  MORNING: 'morning', // 07:00-08:00 起床
  NOON: 'noon', // 12:00-13:00 午餐
  ACTIVE: 'active', // 19:00-21:00 活跃
  SLEEP: 'sleep', // 22:00-07:00 睡眠
  NORMAL: 'normal', // 其他时段
};

// ─── IPC 频道名称 ──────────────────────────────
const IPC_CHANNELS = {
  // 宠物操作
  PET_PET: 'pet:pet',
  PET_FEED: 'pet:feed',
  PET_WASH: 'pet:wash',
  PET_STATUS: 'pet:status',
  PET_STATE_PUSH: 'pet:state-push', // 主动推送
  PET_BROADCAST_STATE: 'pet:broadcast-state', // 面板请求广播状态给所有窗口

  // 经济系统
  ECONOMY_INVENTORY: 'economy:inventory',
  ECONOMY_USE_ITEM: 'economy:useItem',
  ECONOMY_SELL: 'economy:sell',
  ECONOMY_BALANCE: 'economy:balance',
  ECONOMY_SHOP: 'economy:shop',
  ECONOMY_BUY: 'economy:buy',

  // 任务系统
  QUEST_DAILY: 'quest:daily',
  QUEST_CLAIM: 'quest:claim',
  QUEST_ACHIEVEMENTS: 'quest:achievements',
  QUEST_ACHIEVEMENT_CLAIM: 'quest:achievement-claim',

  // 打工系统
  WORK_START: 'work:start',
  WORK_CANCEL: 'work:cancel',
  WORK_STATUS: 'work:status',
  WORK_FINISH: 'work:finish',
  WORK_JOBS: 'work:jobs',

  // 技能系统
  SKILL_LIST: 'skill:list',
  SKILL_USE: 'skill:use',

  // 设置
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // 签到
  SIGNIN_CHECK: 'signin:check',
  SIGNIN_CLAIM: 'signin:claim',
  SIGNIN_INFO: 'signin:info',

  // 小游戏
  MINIGAME_LIST: 'minigame:list',
  MINIGAME_START: 'minigame:start',
  MINIGAME_FINISH: 'minigame:finish',
  MINIGAME_RECORDS: 'minigame:records',
  MINIGAME_RPS: 'minigame:rps',
  MINIGAME_REWARD: 'minigame:reward',

  // 事件推送
  EVENT_TRIGGER: 'event:trigger',
  EVENT_FESTIVAL: 'event:festival',

  // 用户
  USER_INFO: 'user:info',
  USER_UPDATE: 'user:update',

  // 升级系统
  PET_LEVEL_INFO: 'pet:level-info',
  PET_EVOLVE: 'pet:evolve',

  // 基础窗口管理（index.js registerBaseIPCHandlers 使用）
  OPEN_PANEL: 'open-panel',
  CLOSE_PANEL: 'close-panel',
  GET_SETTINGS: 'get-settings',
  SAVE_SETTINGS: 'save-settings',
  GET_DISPLAYS: 'get-displays',
  GET_SYSTEM_TIME: 'get-system-time',
  PANEL_ANIMATE_IN: 'panel-animate-in',
  PANEL_ANIMATE_OUT: 'panel-animate-out',

  // 性能监控
  PERFORMANCE_REPORT_FPS: 'performance:report-fps',
  PERFORMANCE_GET_STATUS: 'performance:get-status',
  PERFORMANCE_DOWNGRADE: 'performance:downgrade',
  PERFORMANCE_RESTORE: 'performance:restore',

  // ─── 多语言 ────────────────────────────────────
  I18N_GET_LOCALE: 'i18n:get-locale',
  I18N_SET_LOCALE: 'i18n:set-locale',
  I18N_T: 'i18n:t',
  I18N_GET_SUPPORTED: 'i18n:get-supported',

  // ─── 系统 ────────────────────────────────────
  SYSTEM_RESET_SAVE: 'system:reset-save',
};

// ─── 技能列表 ──────────────────────────────────
const SKILLS = {
  COOKING: 'cooking', // 烹饪：喂食效果加成
  CLEANING: 'cleaning', // 清洁：洗澡效果加成
  PERFORMANCE: 'performance', // 表演：娱乐收益加成
  ATHLETICS: 'athletics', // 运动：体力消耗减少
  STUDYING: 'studying', // 学习：经验获取加成
  SOCIAL: 'social', // 社交：好感获取加成
  GATHERING: 'gathering', // 采集：打工道具奖励加成
  CRAFTING: 'crafting', // 制作：合成成功率加成
  LUCKY: 'lucky', // 幸运：随机事件正面概率加成
};

// 技能描述和每级加成
const SKILL_CONFIGS = {
  [SKILLS.COOKING]: {
    name: '烹饪',
    description: '每级喂食效果+5%',
    bonusPerLevel: 0.05,
    maxLevel: 100,
  },
  [SKILLS.CLEANING]: {
    name: '清洁',
    description: '每级洗澡效果+5%',
    bonusPerLevel: 0.05,
    maxLevel: 100,
  },
  [SKILLS.PERFORMANCE]: {
    name: '表演',
    description: '每级娱乐收益+5%',
    bonusPerLevel: 0.05,
    maxLevel: 100,
  },
  [SKILLS.ATHLETICS]: {
    name: '运动',
    description: '每级体力消耗-3%',
    bonusPerLevel: 0.03,
    maxLevel: 100,
  },
  [SKILLS.STUDYING]: {
    name: '学习',
    description: '每级经验获取+5%',
    bonusPerLevel: 0.05,
    maxLevel: 100,
  },
  [SKILLS.SOCIAL]: {
    name: '社交',
    description: '每级好感获取+5%',
    bonusPerLevel: 0.05,
    maxLevel: 100,
  },
  [SKILLS.GATHERING]: {
    name: '采集',
    description: '每级打工道具奖励+5%',
    bonusPerLevel: 0.05,
    maxLevel: 100,
  },
  [SKILLS.CRAFTING]: {
    name: '制作',
    description: '每级合成成功率+3%',
    bonusPerLevel: 0.03,
    maxLevel: 100,
  },
  [SKILLS.LUCKY]: {
    name: '幸运',
    description: '每级正面随机事件概率+2%',
    bonusPerLevel: 0.02,
    maxLevel: 100,
  },
};

// ─── 节日日历（基于月-日）─────────────────────
const FESTIVALS = {
  '01-01': { type: 'new_year', name: '元旦', emoji: '🎊', theme: 'fireworks' },
  '02-14': { type: 'valentine', name: '情人节', emoji: '💝', theme: 'hearts' },
  '03-08': { type: 'womens_day', name: '妇女节', emoji: '🌸', theme: 'flowers' },
  '04-05': { type: 'qingming', name: '清明节', emoji: '🌿', theme: 'spring' },
  '05-01': { type: 'labor_day', name: '劳动节', emoji: '🔨', theme: 'celebration' },
  '06-01': { type: 'childrens_day', name: '儿童节', emoji: '🎠', theme: 'toys' },
  '07-07': { type: 'qixi', name: '七夕节', emoji: '🌟', theme: 'starry' },
  '08-01': { type: 'army_day', name: '建军节', emoji: '⭐', theme: 'star' },
  '09-09': { type: 'chongyang', name: '重阳节', emoji: '🍂', theme: 'autumn' },
  '09-29': { type: 'mid_autumn', name: '中秋节', emoji: '🌕', theme: 'moon' },
  '10-01': { type: 'national_day', name: '国庆节', emoji: '🎉', theme: 'national' },
  '10-31': { type: 'halloween', name: '万圣节', emoji: '🎃', theme: 'spooky' },
  '12-25': { type: 'christmas', name: '圣诞节', emoji: '🎄', theme: 'snow' },
  '12-31': { type: 'new_year_eve', name: '跨年', emoji: '🥳', theme: 'countdown' },
  // 农历节日（2026年固定日期，每年需更新）
  '01-29': { type: 'spring_festival', name: '春节', emoji: '🧧', theme: 'lantern' },
  '06-22': { type: 'dragon_boat', name: '端午节', emoji: '🐉', theme: 'dragon' },
};

// ─── 好感度阶段 ────────────────────────────────
const AFFECTION_STAGES = [
  { min: 0, max: 99, stage: 'stranger', name: '陌生人', emoji: '🤝' },
  { min: 100, max: 299, stage: 'acquaintance', name: '熟人', emoji: '😊' },
  { min: 300, max: 699, stage: 'friend', name: '朋友', emoji: '😄' },
  { min: 700, max: 1499, stage: 'close_friend', name: '好朋友', emoji: '🥰' },
  { min: 1500, max: 2999, stage: 'best_friend', name: '挚友', emoji: '💖' },
  { min: 3000, max: 5999, stage: 'soulmate', name: '灵魂伴侣', emoji: '💞' },
  { min: 6000, max: Infinity, stage: 'bonded', name: '命中注定', emoji: '💫' },
];

// ─── 互动冷却时间（毫秒）──────────────────────
const COOLDOWNS = {
  PET: 10 * 1000, // 抚摸冷却 10秒
  WASH: 5 * 60 * 1000, // 洗澡冷却 5分钟
  FEED: 30 * 1000, // 喂食冷却 30秒
  ATTENTION_IDLE: 30 * 60 * 1000, // 用户30分钟无操作触发注意
};

// ─── 道具效果类型 ──────────────────────────────
const ITEM_EFFECT_TYPES = {
  HUNGER: 'hunger',
  HYGIENE: 'hygiene',
  MOOD: 'mood',
  STAMINA: 'stamina',
  HEAL: 'heal',
  EXP: 'exp',
  GOLD: 'gold',
  AFFECTION: 'affection',
  ALL_STATS: 'all_stats',
  SPECIAL: 'special',
};

// ─── 道具类型 ──────────────────────────────────
const ITEM_TYPES = {
  FOOD: 'food',
  TOY: 'toy',
  MEDICINE: 'medicine',
  CARE: 'care',
  SPECIAL: 'special',
  MATERIAL: 'material',
};

// ─── 道具稀有度 ────────────────────────────────
const ITEM_RARITIES = {
  COMMON: 'common',
  UNCOMMON: 'uncommon',
  RARE: 'rare',
  EPIC: 'epic',
  LEGENDARY: 'legendary',
};

// ─── 工作类型配置 ──────────────────────────────
const WORK_JOBS = {
  leaflet: {
    name: '发传单',
    duration: 5 * 1000, // 5秒（测试用）
    baseReward: 200,
    minLevel: 1,
    staminaCost: 10,
    description: '简单的体力活，适合新手',
    bonusItems: [],
  },
  waiter: {
    name: '当服务员',
    duration: 5 * 1000, // 5秒（测试用）
    baseReward: 500,
    minLevel: 2,
    staminaCost: 20,
    description: '餐厅服务员，偶尔能带点食物回来',
    bonusItems: ['food_bread', 'food_cake'],
  },
  delivery: {
    name: '快递员',
    duration: 5 * 1000, // 5秒（测试用）
    baseReward: 800,
    minLevel: 3,
    staminaCost: 30,
    description: '跑腿配送，收入还不错',
    bonusItems: [],
  },
  actor: {
    name: '表演者',
    duration: 5 * 1000, // 5秒（测试用）
    baseReward: 1500,
    minLevel: 5,
    staminaCost: 35,
    description: '街头表演，观众会给小费',
    bonusItems: ['toy_balloon', 'toy_ribbon'],
  },
  explorer: {
    name: '探险家',
    duration: 5 * 1000, // 5秒（测试用）
    baseReward: 1000,
    minLevel: 8,
    staminaCost: 40,
    description: '探索未知区域，可能带回神奇道具',
    bonusItems: ['special_mystery_box', 'material_crystal'],
  },
  teacher: {
    name: '家庭教师',
    duration: 5 * 1000, // 5秒（测试用）
    baseReward: 2000,
    minLevel: 10,
    staminaCost: 30,
    description: '教书育人，脑力消耗大',
    bonusItems: [],
  },
  researcher: {
    name: '研究员',
    duration: 5 * 1000, // 5秒（测试用）
    baseReward: 3000,
    minLevel: 15,
    staminaCost: 35,
    description: '深度研究项目，可能获得钻石',
    bonusItems: [],
    bonusDiamond: 1,
  },
  adventurer: {
    name: '冒险者',
    duration: 5 * 1000, // 5秒（测试用）
    baseReward: 5000,
    minLevel: 20,
    staminaCost: 50,
    description: '高风险高回报的冒险任务',
    bonusItems: ['special_rare_treasure', 'material_ancient_gem'],
  },
};

// ─── 随机行为池 ────────────────────────────────
// idle 占 60% 权重，确保猫大部分时间处于待机状态，偶尔才切换到其他行为
const RANDOM_BEHAVIOR_POOL = [
  { state: PET_STATES.IDLE, weight: 60, duration: 300000 }, // 300秒 = 5分钟（待机常驻）
  { state: PET_STATES.WALK, weight: 15, duration: 180000 }, // 180秒 = 3分钟
  { state: PET_STATES.SIT, weight: 10, duration: 240000 }, // 240秒 = 4分钟
  { state: PET_STATES.BALL, weight: 5, duration: 200000 }, // 200秒 ≈ 3.3分钟
  { state: PET_STATES.DANCE, weight: 5, duration: 160000 }, // 160秒 ≈ 2.7分钟
  { state: PET_STATES.READ, weight: 5, duration: 280000 }, // 280秒 ≈ 4.7分钟
];

// ─── 行为评分系统配置 ──────────────────────────
const BEHAVIOR_SCORING = {
  // 基础需求阈值（超过阈值才考虑）
  NEED_EAT: 20,
  NEED_WASH: 20,
  NEED_PLAY: 25,
  NEED_SLEEP: 15,

  // 基础分值
  BASE_SCORES: {
    SICK: 100,      // 生病最高优先级
    EAT: 80,        // 饥饿
    WASH: 70,       // 脏
    PLAY: 60,       // 无聊
    SLEEP: 50,      // 疲劳
    ATTENTION: 40,  // 吸引注意
  },

  // 情绪加成系数
  EMOTION_BONUS: {
    HUNGRY: { EAT: 1.5 },
    DIRTY: { WASH: 1.5 },
    BORED: { PLAY: 1.5 },
    TIRED: { SLEEP: 1.5 },
    SAD: { PLAY: 1.3, SULKING: 1.3 },
    HAPPY: { PLAY: 1.2, DANCE: 1.2 },
    EXCITED: { PLAY: 1.3, DANCE: 1.3, BALL: 1.3 },
  },

  // 好感度阶段加成
  AFFECTION_BONUS: {
    stranger: { SULKING: 1.5, ATTENTION: 1.5 },
    acquaintance: { PLAY: 1.2, SULKING: 1.2 },
    friend: { PLAY: 1.3, DANCE: 1.2 },
    close_friend: { PLAY: 1.4, DANCE: 1.3, BALL: 1.3 },
    best_friend: { PLAY: 1.5, DANCE: 1.4, BALL: 1.4, READ: 1.3 },
    soulmate: { PLAY: 1.6, DANCE: 1.5, BALL: 1.5, READ: 1.4 },
    bonded: { PLAY: 1.7, DANCE: 1.6, BALL: 1.6, READ: 1.5 },
  },

  // 时间段加成
  TIME_BONUS: {
    morning: { WAKEUP: 2.0, EAT: 1.3 },
    noon: { EAT: 1.5, SIT: 1.3 },
    active: { PLAY: 1.4, DANCE: 1.4, BALL: 1.4 },
    sleep: { SLEEP: 2.0, IDLE: 1.5 },
  },

  // 等级加成（每级+2%）
  LEVEL_MULTIPLIER: 0.02,

  // 自动恢复量
  AUTO_EAT_GAIN: 40,
  AUTO_WASH_GAIN: 40,
  AUTO_PLAY_GAIN: 30,
};

// ─── 签到奖励阶梯V2
// 连续签到奖励：里程碑式递增，断签重置
const SIGNIN_REWARDS_V2 = {
  30: { gold: 2000, diamond: 30, exp: 500, item: 'material_dragon_scale', title: '月度之星' },
  15: { gold: 1000, diamond: 10, exp: 250, item: 'toy_music_box', title: '坚持不懈' },
  7: { gold: 500, diamond: 5, exp: 120, item: 'toy_rubiks_cube', title: '周周签到' },
  3: { gold: 300, diamond: 2, exp: 60, item: 'food_sushi', title: null },
  1: { gold: 100, diamond: 0, exp: 20, item: 'food_kibble', title: null }, // 随机食物
};

// ─── 小游戏配置 ────────────────────────────────
const MINI_GAME_CONFIGS = {
  'catch-food': {
    name: '接食物',
    description: '用键盘左右控制爪爪接住掉落的食物，漏接3个结束',
    emoji: '🍱',
    dailyLimit: 5, // 每天5次
    timeLimit: 60 * 1000, // 60秒时限
    moodGain: 8, // 玩完心情+8
  },
  rps: {
    name: '石头剪刀布',
    description: '和爪爪猜拳，三局两胜制，好感度和幸运影响出拳',
    emoji: '✊',
    dailyLimit: 5,
    timeLimit: null, // 无时限（回合制）
    moodGain: 5,
  },
  memory: {
    name: '记忆翻牌',
    description: '4×4网格配对翻牌，步数越少奖励越高',
    emoji: '🃏',
    dailyLimit: 4,
    timeLimit: 120 * 1000, // 120秒时限
    moodGain: 6,
  },
  rhythm: {
    name: '节奏点击',
    description: '下落式音符节奏游戏，Perfect/Great/Good/Miss判定',
    emoji: '🎵',
    dailyLimit: 4,
    timeLimit: 90 * 1000, // 90秒时限
    moodGain: 10,
  },
};

// ─── 背包默认容量 ──────────────────────────────
const INVENTORY_CONFIG = {
  DEFAULT_CAPACITY: 30,
  EXPAND_AMOUNT: 5,
  EXPAND_COST: 500, // 金币
  MAX_CAPACITY: 200,
};

// ============ 升级系统 ============

// 升级经验曲线：Math.floor(100 * level^1.5)
// level^1.5, Lv1→Lv2 需要 100exp，Lv2→Lv3 需要 283exp，...，Lv19→Lv20 需要 8286exp
const LEVEL_EXP_CURVE = (() => {
  const curve = {};
  for (let level = 1; level < 20; level++) {
    curve[level] = Math.floor(100 * Math.pow(level, 1.5));
  }
  return curve;
})();
// 预计算值（用于快速查询，避免运行时计算）：
// { 1: 100, 2: 283, 3: 477, 4: 676, 5: 880, 6: 1095, 7: 1323, 8: 1561, 9: 1810, 10: 2071, 11: 2343, 12: 2627, 13: 2923, 14: 3230, 15: 3549, 16: 3880, 17: 4223, 18: 4578 }

// 升级里程碑奖励
const LEVEL_MILESTONES = {
  5: { title: '初出茅庐', rewards: { gold: 100, diamond: 0, heart_coin: 0, items: [] } },
  10: { title: '小有名气', rewards: { gold: 300, diamond: 10, heart_coin: 0, items: ['rare_toy'] } },
  15: { title: '人气之星', rewards: { gold: 500, diamond: 25, heart_coin: 5, items: ['rare_toy', 'rare_food'] } },
  20: {
    title: '传说之选',
    rewards: { gold: 1000, diamond: 50, heart_coin: 20, items: ['legendary_toy', 'legendary_food'] },
  },
};

// ============ 进化系统 ============

// 进化分支（Lv20触发，三选一，不可逆）
const EVOLUTION_BRANCHES = {
  fire: {
    id: 'fire',
    name: '火焰爪',
    description: '被火焰之力唤醒，攻击欲望大幅提升',
    bonus: { attackMultiplier: 1.2, defenseMultiplier: 1.0, speedMultiplier: 1.0 },
    exclusiveSkill: { name: '火焰冲击', type: 'fire_blast', expBonus: 1.2 },
    spriteSuffix: '_fire',
    color: '#FF4500',
  },
  ice: {
    id: 'ice',
    name: '冰霜爪',
    description: '被冰霜之力守护，防御能力超群',
    bonus: { attackMultiplier: 1.0, defenseMultiplier: 1.3, speedMultiplier: 1.0 },
    exclusiveSkill: { name: '冰霜护盾', type: 'ice_shield', staminaSave: 0.5 },
    spriteSuffix: '_ice',
    color: '#00BFFF',
  },
  thunder: {
    id: 'thunder',
    name: '雷霆爪',
    description: '被雷霆之力加持，行动速度惊人',
    bonus: { attackMultiplier: 1.0, defenseMultiplier: 1.0, speedMultiplier: 1.4 },
    exclusiveSkill: { name: '闪电突袭', type: 'thunder_strike', behaviorSpeed: 1.5 },
    spriteSuffix: '_thunder',
    color: '#FFD700',
  },
};

const EVOLUTION_BRANCH_IDS = ['fire', 'ice', 'thunder'];

// ─── 属性/用户默认值 ──────────────────────────────
const DEFAULT_STAT_VALUE = 100; // 初始属性默认值（hunger/hygiene/mood/stamina）
const INITIAL_GOLD = 500; // 新用户初始金币
const EVOLUTION_REQUIRED_LEVEL = 20; // 进化等级门槛

// ─── 定时器间隔（毫秒）────────────────────────
const STATUS_PUSH_INTERVAL = 3000; // 状态推送间隔
const MIN_STAY_DURATION = 60000; // 行为最短驻留时间

// ─── 行为持续时间（毫秒）────────────────────────
const BEHAVIOR_DURATION_SICK = 6000; // 生病持续
const BEHAVIOR_DURATION_EAT = 15000; // 自动吃饭
const BEHAVIOR_DURATION_WASH = 15000; // 自动洗澡
const BEHAVIOR_DURATION_PLAY = 15000; // 自动玩耍
const BEHAVIOR_DURATION_SLEEP = 60000; // 自动睡觉
const BEHAVIOR_DURATION_ATTENTION = 5000; // 吸引注意
const INTERACTION_DURATION_PETTING = 3000; // 抚摸动画
const INTERACTION_DURATION_EAT = 3000; // 喂食动画
const INTERACTION_DURATION_WASH = 4000; // 洗澡动画

// ─── 经济/打工比例 ──────────────────────────────
const SELL_PRICE_RATIO = 0.3; // 出售回收比例
const HEAL_STAT_RATIO = 0.3; // 治疗道具恢复比例
const WORK_CANCEL_PENALTY = 0.2; // 打工取消扣款比例
const WORK_EXP_RATIO = 0.3; // 打工经验比例
const WORK_BONUS_ITEM_CHANCE = 0.3; // 打工道具掉落概率

// ─── 技能 ───────────────────────────────────────
const SKILL_EXP_BASE = 50; // 技能经验基数

// ─── 速率限制 ───────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60000; // 速率限制窗口

module.exports = {
  STAT_LIMITS,
  DECAY_RATES,
  EMOTION_THRESHOLDS,
  BEHAVIOR_THRESHOLDS,
  EMOTIONS,
  PET_STATES,
  TIME_SLOTS,
  IPC_CHANNELS,
  SKILLS,
  SKILL_CONFIGS,
  FESTIVALS,
  AFFECTION_STAGES,
  COOLDOWNS,
  ITEM_EFFECT_TYPES,
  ITEM_TYPES,
  ITEM_RARITIES,
  WORK_JOBS,
  RANDOM_BEHAVIOR_POOL,
  BEHAVIOR_SCORING,
  SIGNIN_REWARDS_V2,
  MINI_GAME_CONFIGS,
  INVENTORY_CONFIG,
  LEVEL_EXP_CURVE,
  LEVEL_MILESTONES,
  EVOLUTION_BRANCHES,
  EVOLUTION_BRANCH_IDS,
  DEFAULT_STAT_VALUE,
  INITIAL_GOLD,
  EVOLUTION_REQUIRED_LEVEL,
  STATUS_PUSH_INTERVAL,
  MIN_STAY_DURATION,
  BEHAVIOR_DURATION_SICK,
  BEHAVIOR_DURATION_EAT,
  BEHAVIOR_DURATION_WASH,
  BEHAVIOR_DURATION_PLAY,
  BEHAVIOR_DURATION_SLEEP,
  BEHAVIOR_DURATION_ATTENTION,
  INTERACTION_DURATION_PETTING,
  INTERACTION_DURATION_EAT,
  INTERACTION_DURATION_WASH,
  SELL_PRICE_RATIO,
  HEAL_STAT_RATIO,
  WORK_CANCEL_PENALTY,
  WORK_EXP_RATIO,
  WORK_BONUS_ITEM_CHANCE,
  SKILL_EXP_BASE,
  RATE_LIMIT_WINDOW_MS,
};
