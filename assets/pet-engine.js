// ══════════════════════════════════════════════
// 宠物引擎 — 纯逻辑层（无 DOM 操作）
// 负责状态管理、属性衰减、事件系统、物品效果
// ══════════════════════════════════════════════

const PetEngineModule = (() => {
  'use strict';

  // ─── 物品定义 ───
  const ITEMS = {
    // 食物
    DRIED_FISH: { id: 'dried_fish', name: '小鱼干', icon: '🐟', cost: 10, category: 'food', effect: { hunger: 25, happy: 5 }, desc: '最受欢迎的零食' },
    CAT_TREAT:  { id: 'cat_treat',  name: '猫条',   icon: '🧴', cost: 15, category: 'food', effect: { hunger: 30, happy: 10 }, desc: '营养丰富的猫条' },
    STEAK:      { id: 'steak',      name: '牛排',   icon: '🥩', cost: 30, category: 'food', effect: { hunger: 50, happy: 15 }, desc: '豪华大牛排' },
    MILK:       { id: 'milk',       name: '牛奶',   icon: '🥛', cost: 8,  category: 'food', effect: { hunger: 15, energy: 10 }, desc: '温温的牛奶' },
    JUICE:      { id: 'juice',      name: '果汁',   icon: '🧃', cost: 8,  category: 'food', effect: { hunger: 10, happy: 5 }, desc: '清爽果汁' },
    // 玩具
    YARN_BALL:  { id: 'yarn_ball',  name: '毛线球', icon: '🧶', cost: 12, category: 'toy',  effect: { happy: 25, energy: -10 }, desc: '追毛线球超开心' },
    MOUSE_TOY:  { id: 'mouse_toy',  name: '逗猫棒', icon: '🪶', cost: 15, category: 'toy',  effect: { happy: 20, energy: -8 }, desc: '飞来飞去好有趣' },
    LASER:      { id: 'laser',      name: '激光笔', icon: '🔴', cost: 5,  category: 'toy',  effect: { happy: 15, energy: -15 }, desc: '追不到的红点' },
    // 护理
    SOAP:       { id: 'soap',       name: '洗澡',   icon: '🛁', cost: 10, category: 'care', effect: { cleanliness: 40, happy: -5 }, desc: '猫猫不喜欢洗澡' },
    BRUSH:      { id: 'brush',      name: '梳毛',   icon: '🪮', cost: 5,  category: 'care', effect: { cleanliness: 20, happy: 10 }, desc: '舒服的梳毛' },
    MEDICINE:   { id: 'medicine',   name: '药',     icon: '💊', cost: 25, category: 'care', effect: { health: 30 }, cureDisease: true, desc: '治百病良药' },
    // 休息
    SLEEP:      { id: 'sleep',      name: '睡觉',   icon: '😴', cost: 0,  category: 'rest', effect: { energy: 60 }, desc: '睡一觉恢复精力' },
  };

  // ─── 性格定义 ───
  const PERSONALITIES = {
    playful: { id: 'playful', name: '活泼', walkSpeed: 1.3, coinBonus: 0.1, idlePhrases: ['喵～', '好无聊', '来玩嘛！'] },
    calm:    { id: 'calm',    name: '高冷', walkSpeed: 0.7, coinBonus: 0,   idlePhrases: ['……', '嗯。', '(≖ ‿ ≖)'] },
    glutton: { id: 'glutton', name: '贪吃', walkSpeed: 1.0, coinBonus: 0.05, hungerDecay: 1.3, idlePhrases: ['好饿…', '想吃东西', '肚子咕咕叫'] },
    clingy:  { id: 'clingy',  name: '黏人', walkSpeed: 1.1, coinBonus: 0.05, happyDecay: 0.7, idlePhrases: ['你在干嘛？', '陪陪我', '不要走…'] },
  };

  // ─── 成长阶段 ───
  const STAGES = [
    { id: 0, name: '蛋蛋',     growthMin: 0,    growthMax: 15,  size: 0.7 },
    { id: 1, name: '幼猫',     growthMin: 15,   growthMax: 35,  size: 0.85 },
    { id: 2, name: '小猫',     growthMin: 35,   growthMax: 55,  size: 0.95 },
    { id: 3, name: '少年猫',   growthMin: 55,   growthMax: 75,  size: 1.0 },
    { id: 4, name: '成年猫',   growthMin: 75,   growthMax: 95,  size: 1.1 },
    { id: 5, name: '老猫',     growthMin: 95,   growthMax: 100, size: 1.15 },
  ];

  // ─── 疾病定义 ───
  const DISEASES = {
    none:     { id: 'none',     name: '无' },
    cold:     { id: 'cold',     name: '感冒',       duration: 600000, symptoms: { energy: -0.5, happy: -0.3 } },
    stomach:  { id: 'stomach',  name: '拉肚子',     duration: 480000, symptoms: { hunger: -0.8, health: -0.3 } },
    flea:     { id: 'flea',     name: '跳蚤',       duration: 720000, symptoms: { happiness: -0.5, cleanliness: -0.4 } },
    fever:    { id: 'fever',    name: '发烧',       duration: 900000, symptoms: { energy: -1, health: -0.5 } },
  };

  // ─── 随机事件 ───
  const RANDOM_EVENTS = [
    { id: 'butterfly', name: '蝴蝶', desc: '一只蝴蝶飞了过来！', effect: { happy: 8 }, mood: 'happy', weight: 15 },
    { id: 'mouse',     name: '老鼠', desc: '发现一只小老鼠！', effect: { happy: 12, energy: -5 }, mood: 'happy', weight: 10 },
    { id: 'rain',      name: '下雨', desc: '突然下起了小雨…', effect: { cleanliness: -5, happy: -3 }, mood: 'unhappy', weight: 12 },
    { id: 'bird',      name: '小鸟', desc: '窗外有小鸟在唱歌～', effect: { happy: 5 }, mood: 'happy', weight: 10 },
    { id: 'spilled',   name: '打翻', desc: '不小心打翻了水盆！', effect: { cleanliness: -10 }, mood: 'angry', weight: 8 },
    { id: 'snack',     name: '零食', desc: '找到了藏起来的小鱼干！', effect: { hunger: 10, happy: 10 }, mood: 'happy', weight: 7 },
    { id: 'dream',     name: '美梦', desc: '做了一个好梦', effect: { happy: 8, energy: 5 }, mood: 'happy', weight: 8, requireSleeping: true },
    { id: 'nightmare', name: '噩梦', desc: '做了个噩梦吓醒了', effect: { happy: -10, energy: -5 }, mood: 'angry', weight: 5, requireSleeping: true },
  ];

  // ─── 台词 ───
  const PHRASES = {
    idle:      ['喵～', '呼噜呼噜…', '…', '嗷？', '(=・ω・=)', '发呆中'],
    happy:     ['好开心！', '喵呜～', '最喜欢了！', '嘿嘿', 'ฅ^•ﻌ•^ฅ', '蹭蹭～'],
    ecstatic:  ['太棒了！！！', '星星眼！', '好幸福啊', '开心到飞起！'],
    angry:     ['别戳我了！', '哼！', '好气哦', '爪爪生气了！', '(╬▔皿▔)'],
    surprised: ['哇！', '吓我一跳！', '喵？！', '什么？！'],
    sleeping:  ['zzZ…', '好困…', '让我睡会儿…', '呼噜呼噜…'],
    sick:      ['好难受…', '头好晕…', '不想动…', '喵呜…'],
    unhappy:   ['好无聊…', '没人陪我…', '呜呜…', '不开心'],
    hungry:    ['好饿…', '想吃鱼…', '投喂我！', '肚子咕咕叫'],
    tired:     ['好困…', '想睡觉了…', '眼皮打架了', 'zzZ'],
    dirty:     ['身上好脏…', '想洗澡…', '好黏糊'],
    love:      ['喵～❤️', '最喜欢你了！', '蹭蹭～', '好幸福', 'mua!', '贴贴～'],
    wokeup:    ['伸懒腰～', '早上好！', '睡醒了！', 'zzZ…啊？'],
  };

  // ═══ 引擎类 ═══
  class PetEngine {
    constructor() {
      this._listeners = {};
      this._tickTimer = null;
      this._eventTimer = null;
      this._diseaseTimer = null;

      this._state = this._createDefaultState();
      this._loadState();
    }

    _createDefaultState() {
      return {
        name: '爪爪',
        personality: PERSONALITIES.playful,
        hunger: 80,
        happy: 70,
        energy: 90,
        cleanliness: 80,
        health: 100,
        growth: 0,
        coins: 100,
        isSleeping: false,
        mood: 'idle',
        disease: { ...DISEASES.none },
        lastInteraction: Date.now(),
        lastTick: Date.now(),
      };
    }

    _loadState() {
      try {
        const saved = localStorage.getItem('pet-engine-state');
        if (saved) {
          const parsed = JSON.parse(saved);
          this._state = { ...this._createDefaultState(), ...parsed };
          // 恢复 personality 对象
          if (parsed.personality && parsed.personality.id) {
            this._state.personality = PERSONALITIES[parsed.personality.id] || PERSONALITIES.playful;
          }
        }
      } catch (e) { /* 忽略加载错误 */ }
    }

    _saveState() {
      try {
        localStorage.setItem('pet-engine-state', JSON.stringify(this._state));
      } catch (e) { /* 忽略保存错误 */ }
    }

    // ─── 事件系统 ───
    on(event, callback) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(callback);
    }

    _emit(event, data) {
      (this._listeners[event] || []).forEach(cb => {
        try { cb(data); } catch (e) { /* 忽略回调错误 */ }
      });
    }

    // ─── 启动 ───
    start() {
      // 每 10 秒衰减一次属性
      this._tickTimer = setInterval(() => this._tick(), 10000);
      // 每 30-90 秒随机事件
      this._eventTimer = setInterval(() => this._tryRandomEvent(), 45000);
      // 每 5 分钟疾病检查
      this._diseaseTimer = setInterval(() => this._checkDisease(), 300000);
    }

    stop() {
      clearInterval(this._tickTimer);
      clearInterval(this._eventTimer);
      clearInterval(this._diseaseTimer);
    }

    // ─── 属性衰减 ───
    _tick() {
      const s = this._state;
      const p = s.personality;
      const now = Date.now();

      // 计算离线时间补偿
      const offlineSeconds = (now - s.lastTick) / 1000;
      const tickMultiplier = Math.min(offlineSeconds / 10, 60); // 最多补偿 10 分钟

      if (s.isSleeping) {
        s.energy = Math.min(100, s.energy + 3 * tickMultiplier);
        s.hunger = Math.max(0, s.hunger - 0.5 * tickMultiplier);
        // 睡眠恢复
        if (s.energy >= 100) {
          this._wakeUp();
        }
      } else {
        const hungerDecay = (p.hungerDecay || 1) * 0.8;
        s.hunger = Math.max(0, s.hunger - hungerDecay * tickMultiplier);
        s.happy = Math.max(0, s.happy - (p.happyDecay || 1) * 0.4 * tickMultiplier);
        s.energy = Math.max(0, s.energy - 0.3 * tickMultiplier);
        s.cleanliness = Math.max(0, s.cleanliness - 0.3 * tickMultiplier);
      }

      // 疾病影响
      if (s.disease.id !== 'none' && s.disease.symptoms) {
        for (const [key, val] of Object.entries(s.disease.symptoms)) {
          const k = key === 'happiness' ? 'happy' : key;
          if (s[k] !== undefined) s[k] = Math.max(0, Math.min(100, s[k] + val * tickMultiplier));
        }
      }

      // 饥饿/疲惫影响健康
      if (s.hunger < 15) s.health = Math.max(0, s.health - 0.5 * tickMultiplier);
      if (s.energy < 10) s.health = Math.max(0, s.health - 0.3 * tickMultiplier);

      // 成长
      if (s.hunger > 50 && s.happy > 50 && s.health > 70) {
        s.growth = Math.min(100, s.growth + 0.1 * tickMultiplier);
      }

      s.lastTick = now;
      this._updateMood();
      this._saveState();
      this._emit('tick', this._getPublicState());
    }

    // ─── 心情判定 ───
    _updateMood() {
      const s = this._state;
      if (s.isSleeping) { s.mood = 'sleeping'; return; }
      if (s.disease.id !== 'none') { s.mood = 'sick'; return; }
      if (s.happy > 85) { s.mood = 'happy'; return; }
      if (s.hunger < 20) { s.mood = 'unhappy'; return; }
      s.mood = 'idle';
    }

    // ─── 交互 ───
    click(type) {
      const s = this._state;
      s.lastInteraction = Date.now();

      if (type === 'double') {
        // 双击 = 抱抱
        s.happy = Math.min(100, s.happy + 8);
        s.growth = Math.min(100, s.growth + 0.3);
        s.coins += 2;
        this._emit('interact', { type: 'love' });
        return { action: 'love' };
      }

      if (type === 'right') {
        // 右键 = 生气
        s.happy = Math.max(0, s.happy - 3);
        this._emit('interact', { type: 'angry' });
        return { action: 'angry' };
      }

      // 单击
      if (s.isSleeping) {
        this._wakeUp();
        return { action: 'wokeUp' };
      }
      s.happy = Math.min(100, s.happy + 3);
      s.growth = Math.min(100, s.growth + 0.1);
      s.coins += 1;
      this._emit('interact', { type: 'normal' });
      return { action: 'click' };
    }

    // ─── 物品使用 ───
    useItem(itemId) {
      const s = this._state;
      const item = ITEMS[itemId];
      if (!item) return { ok: false, reason: '物品不存在' };
      if (s.coins < item.cost) return { ok: false, reason: '金币不够！' };

      // 睡觉时的特殊判断
      if (item.category !== 'rest' && s.isSleeping) {
        this._wakeUp();
      }

      s.coins -= item.cost;

      // 应用效果
      if (item.effect) {
        for (const [key, val] of Object.entries(item.effect)) {
          const mapKey = key === 'happiness' ? 'happy' : key;
          if (s[mapKey] !== undefined) {
            s[mapKey] = Math.max(0, Math.min(100, s[mapKey] + val));
          }
        }
      }

      // 治疗疾病
      if (item.cureDisease && s.disease.id !== 'none') {
        const cured = { ...s.disease };
        s.disease = { ...DISEASES.none };
        this._emit('diseaseCured', { disease: cured });
      }

      // 睡觉特殊处理
      if (item.id === 'sleep' && !s.isSleeping) {
        s.isSleeping = true;
        this._emit('sleep', {});
      }

      s.lastInteraction = Date.now();
      this._updateMood();
      this._saveState();
      this._emit('itemUsed', { item, state: this._getPublicState() });
      return { ok: true, state: this._getPublicState() };
    }

    // ─── 睡觉/醒来 ───
    _wakeUp() {
      this._state.isSleeping = false;
      this._updateMood();
      this._saveState();
      this._emit('wokeUp', {});
    }

    // ─── 随机事件 ───
    _tryRandomEvent() {
      const s = this._state;
      if (Math.random() > 0.35) return; // 35% 概率触发

      // 根据睡眠状态筛选事件
      const candidates = RANDOM_EVENTS.filter(e => {
        if (e.requireSleeping && !s.isSleeping) return false;
        if (!e.requireSleeping && e.id === 'dream') return false;
        return true;
      });
      if (candidates.length === 0) return;

      // 加权随机
      const totalWeight = candidates.reduce((sum, e) => sum + e.weight, 0);
      let r = Math.random() * totalWeight;
      let chosen = candidates[0];
      for (const e of candidates) {
        r -= e.weight;
        if (r <= 0) { chosen = e; break; }
      }

      // 应用效果
      if (chosen.effect) {
        for (const [key, val] of Object.entries(chosen.effect)) {
          const mapKey = key === 'happiness' ? 'happy' : key;
          if (s[mapKey] !== undefined) {
            s[mapKey] = Math.max(0, Math.min(100, s[mapKey] + val));
          }
        }
      }

      // 睡眠事件可能唤醒
      if (chosen.requireSleeping && chosen.id === 'nightmare') {
        this._wakeUp();
      }

      this._saveState();
      this._emit('randomEvent', { event: chosen, result: { mood: chosen.mood } });
    }

    // ─── 疾病检查 ───
    _checkDisease() {
      const s = this._state;
      if (s.disease.id !== 'none') {
        // 有一定概率自愈
        if (Math.random() < 0.15) {
          const cured = { ...s.disease };
          s.disease = { ...DISEASES.none };
          this._emit('diseaseCured', { disease: cured });
        }
        return;
      }

      // 患病概率
      let chance = 0;
      if (s.cleanliness < 20) chance += 0.15;
      if (s.health < 40) chance += 0.1;
      if (s.hunger < 15) chance += 0.08;

      if (Math.random() > chance) return;

      const diseaseKeys = Object.keys(DISEASES).filter(k => k !== 'none');
      const picked = diseaseKeys[Math.floor(Math.random() * diseaseKeys.length)];
      s.disease = { ...DISEASES[picked] };
      this._updateMood();
      this._saveState();
      this._emit('disease', { disease: s.disease });
    }

    // ─── 改名 ───
    rename(name) {
      const trimmed = (name || '').trim().slice(0, 8);
      if (!trimmed) return false;
      this._state.name = trimmed;
      this._saveState();
      this._emit('tick', this._getPublicState());
      return true;
    }

    // ─── 改性格 ───
    setPersonality(id) {
      const p = PERSONALITIES[id];
      if (!p) return false;
      this._state.personality = p;
      this._saveState();
      return true;
    }

    // ─── 重置 ───
    reset() {
      this._state = this._createDefaultState();
      this._saveState();
      this._emit('reset', {});
      this._emit('tick', this._getPublicState());
    }

    // ─── 获取公开状态 ───
    _getPublicState() {
      const s = this._state;
      const stage = this._getStage(s.growth);
      return {
        name: s.name,
        personality: s.personality,
        hunger: s.hunger,
        happy: s.happy,
        energy: s.energy,
        cleanliness: s.cleanliness,
        health: s.health,
        growth: s.growth,
        growthPercent: s.growth,
        coins: s.coins,
        isSleeping: s.isSleeping,
        mood: s.mood,
        disease: s.disease,
        stage: stage,
        stageName: stage ? stage.name : '幼猫',
        lastInteraction: s.lastInteraction,
      };
    }

    getState() { return this._getPublicState(); }
    getMood() { return this._state.mood; }

    _getStage(growth) {
      for (let i = STAGES.length - 1; i >= 0; i--) {
        if (growth >= STAGES[i].growthMin) return STAGES[i];
      }
      return STAGES[0];
    }

    // ─── 检查升级 ───
    checkLevelUp() {
      const prev = this._getStage(this._state.growth - 0.1);
      const curr = this._getStage(this._state.growth);
      if (prev && curr && prev.id !== curr.id) {
        this._emit('levelUp', { fromStage: prev.id, toStage: curr.id });
        return true;
      }
      return false;
    }
  }

  return { PetEngine, ITEMS, PERSONALITIES, PHRASES, DISEASES, STAGES };
})();

// CommonJS 兼容导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PetEngineModule;
}
