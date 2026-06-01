// ══════════════════════════════════════════════
// time-manager.js — 时间管理和节日检测类
// 时间段判断、节日检测、生日检测、节日特效配置
// ══════════════════════════════════════════════

'use strict';

const { TIME_SLOTS, FESTIVALS } = require('./constants');

class TimeManager {
  /**
   * @param {PetDatabase} database 数据库实例
   */
  constructor(database) {
    /** @type {PetDatabase} */
    this.db = database;
  }

  /**
   * 获取当前时间段
   * @returns {string} TIME_SLOTS 中的枚举值
   */
  getTimeSlot() {
    const hour = new Date().getHours();

    // 07:00-08:00 → 起床
    if (hour >= 7 && hour < 8) {
      return TIME_SLOTS.MORNING;
    }
    // 12:00-13:00 → 午餐
    if (hour >= 12 && hour < 13) {
      return TIME_SLOTS.NOON;
    }
    // 19:00-21:00 → 活跃
    if (hour >= 19 && hour < 21) {
      return TIME_SLOTS.ACTIVE;
    }
    // 22:00-07:00 → 睡眠
    if (hour >= 22 || hour < 7) {
      return TIME_SLOTS.SLEEP;
    }
    // 其他
    return TIME_SLOTS.NORMAL;
  }

  /**
   * 检测今天是否节日
   * @returns {Object|null} 节日信息 { type, name, emoji, theme, monthDay }
   */
  getTodayFestival() {
    const now = new Date();
    const monthDay = String(now.getMonth() + 1).padStart(2, '0') + '-' +
                     String(now.getDate()).padStart(2, '0');

    const festival = FESTIVALS[monthDay];
    if (festival) {
      return {
        ...festival,
        monthDay: monthDay,
      };
    }
    return null;
  }

  /**
   * 获取节日特效配置
   * @param {string} type 节日类型
   * @returns {Object} 特效配置
   */
  getFestivalConfig(type) {
    const configs = {
      // ─── 春节 ────────────────────────────────
      spring_festival: {
        name: '春节',
        backgroundEffect: 'firecracker',   // 背景特效：鞭炮
        particleType: 'confetti',           // 粒子类型：彩纸
        petAccessory: 'red_envelope',       // 宠物配饰：红包
        bonusGold: 500,
        bonusItem: 'special_mystery_box',
        dialogues: [
          '新年快乐！爪爪给你拜年啦~',
          '恭喜发财！红包拿来~',
          '噼里啪啦，过年啦！',
        ],
        themeColor: '#FF4444',
        bgMusic: 'festival_spring',
      },

      // ─── 元旦 ────────────────────────────────
      new_year: {
        name: '元旦',
        backgroundEffect: 'fireworks',
        particleType: 'sparkle',
        petAccessory: 'party_hat',
        bonusGold: 200,
        bonusItem: 'food_cake',
        dialogues: [
          '新年新气象~',
          '新的一年，爪爪会继续陪你！',
        ],
        themeColor: '#FFD700',
        bgMusic: 'festival_newyear',
      },

      // ─── 情人节 ──────────────────────────────
      valentine: {
        name: '情人节',
        backgroundEffect: 'hearts',
        particleType: 'heart',
        petAccessory: 'bow',
        bonusGold: 100,
        bonusItem: 'special_heart_crystal',
        dialogues: [
          '情人节快乐！爪爪最喜欢你了~',
          '送你一颗心~',
        ],
        themeColor: '#FF69B4',
        bgMusic: 'festival_love',
      },

      // ─── 劳动节 ──────────────────────────────
      labor_day: {
        name: '劳动节',
        backgroundEffect: 'none',
        particleType: 'star',
        petAccessory: 'work_hat',
        bonusGold: 300,
        bonusItem: 'special_exp_book',
        dialogues: [
          '劳动最光荣！休息一下吧~',
          '辛苦了主人！爪爪给你捶捶背~',
        ],
        themeColor: '#4CAF50',
        bgMusic: null,
      },

      // ─── 儿童节 ──────────────────────────────
      childrens_day: {
        name: '儿童节',
        backgroundEffect: 'balloon',
        particleType: 'balloon',
        petAccessory: 'party_hat',
        bonusGold: 200,
        bonusItem: 'toy_bubble_machine',
        dialogues: [
          '儿童节快乐！永远做个小朋友~',
          '好多好多气球！爪爪好开心！',
        ],
        themeColor: '#00BCD4',
        bgMusic: 'festival_fun',
      },

      // ─── 国庆节 ──────────────────────────────
      national_day: {
        name: '国庆节',
        backgroundEffect: 'fireworks',
        particleType: 'confetti',
        petAccessory: 'flag',
        bonusGold: 500,
        bonusItem: 'special_gold_medal',
        dialogues: [
          '国庆快乐！祝祖国繁荣昌盛~',
          '长假愉快！爪爪想出去玩~',
        ],
        themeColor: '#FF0000',
        bgMusic: 'festival_national',
      },

      // ─── 万圣节 ──────────────────────────────
      halloween: {
        name: '万圣节',
        backgroundEffect: 'ghost',
        particleType: 'pumpkin',
        petAccessory: 'witch_hat',
        bonusGold: 150,
        bonusItem: 'special_mystery_box',
        dialogues: [
          '不给糖就捣蛋！',
          '喵呜~爪爪变成小幽灵啦~',
          '南瓜灯亮起来了！',
        ],
        themeColor: '#FF8C00',
        bgMusic: 'festival_spooky',
      },

      // ─── 圣诞节 ──────────────────────────────
      christmas: {
        name: '圣诞节',
        backgroundEffect: 'snow',
        particleType: 'snowflake',
        petAccessory: 'santa_hat',
        bonusGold: 300,
        bonusItem: 'special_golden_egg',
        dialogues: [
          'Merry Christmas! 圣诞快乐~',
          '爪爪准备了圣诞礼物哦~',
          '叮叮当叮叮当~',
        ],
        themeColor: '#2E7D32',
        bgMusic: 'festival_christmas',
      },

      // ─── 中秋节 ──────────────────────────────
      mid_autumn: {
        name: '中秋节',
        backgroundEffect: 'moon',
        particleType: 'mooncake',
        petAccessory: 'lantern',
        bonusGold: 200,
        bonusItem: 'food_cake',
        dialogues: [
          '中秋快乐！月饼好好吃~',
          '今晚月亮好圆好漂亮~',
          '举头望明月，低头吃月饼~',
        ],
        themeColor: '#FFC107',
        bgMusic: 'festival_mid_autumn',
      },

      // ─── 端午节 ──────────────────────────────
      dragon_boat: {
        name: '端午节',
        backgroundEffect: 'river',
        particleType: 'rice_dumpling',
        petAccessory: 'dragon_boat',
        bonusGold: 200,
        bonusItem: 'food_onigiri',
        dialogues: [
          '端午安康！吃粽子啦~',
          '赛龙舟好热闹！',
        ],
        themeColor: '#795548',
        bgMusic: null,
      },

      // ─── 七夕节 ──────────────────────────────
      qixi: {
        name: '七夕节',
        backgroundEffect: 'stars',
        particleType: 'star',
        petAccessory: 'flower',
        bonusGold: 150,
        bonusItem: 'special_heart_crystal',
        dialogues: [
          '七夕快乐！牛郎织女相会啦~',
          '星星好美~爪爪许个愿~',
        ],
        themeColor: '#9C27B0',
        bgMusic: 'festival_romantic',
      },

      // ─── 妇女节 ──────────────────────────────
      womens_day: {
        name: '妇女节',
        backgroundEffect: 'flowers',
        particleType: 'petal',
        petAccessory: 'flower',
        bonusGold: 200,
        bonusItem: 'food_cake',
        dialogues: [
          '节日快乐！今天是所有女性的节日~',
          '送你一朵花~',
        ],
        themeColor: '#E91E63',
        bgMusic: null,
      },

      // ─── 清明节 ──────────────────────────────
      qingming: {
        name: '清明节',
        backgroundEffect: 'rain',
        particleType: 'petal',
        petAccessory: null,
        bonusGold: 100,
        bonusItem: 'food_onigiri',
        dialogues: [
          '清明时节雨纷纷~',
          '踏青赏花，春天真美~',
        ],
        themeColor: '#8BC34A',
        bgMusic: null,
      },

      // ─── 建军节 ──────────────────────────────
      army_day: {
        name: '建军节',
        backgroundEffect: 'sparkle',
        particleType: 'star',
        petAccessory: 'flag',
        bonusGold: 200,
        bonusItem: 'special_exp_book',
        dialogues: [
          '向最可爱的人致敬！',
          '建军节快乐~',
        ],
        themeColor: '#D32F2F',
        bgMusic: null,
      },

      // ─── 重阳节 ──────────────────────────────
      chongyang: {
        name: '重阳节',
        backgroundEffect: 'autumn',
        particleType: 'leaf',
        petAccessory: null,
        bonusGold: 150,
        bonusItem: 'food_cake',
        dialogues: [
          '重阳登高，遥寄思念~',
          '九九重阳，长长久久~',
        ],
        themeColor: '#FF8F00',
        bgMusic: null,
      },

      // ─── 跨年 ────────────────────────────────
      new_year_eve: {
        name: '跨年',
        backgroundEffect: 'countdown',
        particleType: 'confetti',
        petAccessory: 'party_hat',
        bonusGold: 300,
        bonusItem: 'special_star_fragment',
        dialogues: [
          '倒数3、2、1！新年来啦！',
          '跨年快乐！明年也要一起哦~',
        ],
        themeColor: '#E91E63',
        bgMusic: 'festival_countdown',
      },
    };

    // 默认配置（未定义的节日）
    const defaultConfig = {
      name: type,
      backgroundEffect: 'sparkle',
      particleType: 'sparkle',
      petAccessory: null,
      bonusGold: 100,
      bonusItem: null,
      dialogues: ['节日快乐~'],
      themeColor: '#FFD700',
      bgMusic: null,
    };

    return configs[type] || defaultConfig;
  }

  /**
   * 检测用户生日
   * @param {string} birthDate 生日日期字符串 YYYY-MM-DD
   * @returns {boolean} 今天是否生日
   */
  checkUserBirthday(birthDate) {
    if (!birthDate) return false;

    const today = new Date();
    const birth = new Date(birthDate);

    return today.getMonth() === birth.getMonth() &&
           today.getDate() === birth.getDate();
  }

  /**
   * 获取今日节日奖励领取状态
   * @param {string} festivalType 节日类型
   * @returns {boolean} 是否已领取
   */
  hasClaimedFestivalReward(festivalType) {
    const year = new Date().getFullYear();
    const row = this.db.get(
      'SELECT rewards_claimed FROM festival_records WHERE user_id = 1 AND festival_type = ? AND year = ?',
      festivalType, year
    );
    return row ? row.rewards_claimed === 1 : false;
  }

  /**
   * 标记节日奖励已领取
   * @param {string} festivalType 节日类型
   */
  markFestivalRewardClaimed(festivalType) {
    const year = new Date().getFullYear();
    this.db.run(
      `INSERT INTO festival_records (user_id, festival_type, year, rewards_claimed)
       VALUES (1, ?, ?, 1)
       ON CONFLICT(user_id, festival_type, year) DO UPDATE SET rewards_claimed = 1`,
      festivalType, year
    );
  }

  /**
   * 获取时间段描述
   * @returns {string} 时间段中文描述
   */
  getTimeSlotDescription() {
    const slot = this.getTimeSlot();
    const descriptions = {
      [TIME_SLOTS.MORNING]: '早晨',
      [TIME_SLOTS.NOON]: '中午',
      [TIME_SLOTS.ACTIVE]: '活跃时段',
      [TIME_SLOTS.SLEEP]: '深夜',
      [TIME_SLOTS.NORMAL]: '日常',
    };
    return descriptions[slot] || '日常';
  }
}

module.exports = TimeManager;
