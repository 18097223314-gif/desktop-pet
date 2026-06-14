// ══════════════════════════════════════════════
// skill.js — 技能系统类
// 9种技能的使用、升级、加成计算
// ══════════════════════════════════════════════

'use strict';

const { SKILLS, SKILL_CONFIGS, EVOLUTION_BRANCHES, SKILL_EXP_BASE } = require('./constants');

class SkillSystem {
  /**
   * @param {PetDatabase} database 数据库实例
   */
  constructor(database) {
    /** @type {PetDatabase} */
    this.db = database;
  }

  /**
   * 使用技能（增加经验，可能升级）
   * @param {number} petId 宠物ID
   * @param {string} skillType 技能类型
   * @param {Object} context 使用上下文
   * @returns {{ success: boolean, message: string, expGain: number, levelUp: boolean, newLevel: number }}
   */
  useSkill(petId, skillType, context = {}) {
    // 验证技能类型
    if (!SKILL_CONFIGS[skillType]) {
      return { success: false, message: '未知技能类型', expGain: 0, levelUp: false, newLevel: 0 };
    }

    // 获取当前技能信息
    const skill = this.db.get('SELECT * FROM pet_skills WHERE pet_id = ? AND skill_type = ?', petId, skillType);
    if (!skill) {
      return { success: false, message: '技能未解锁', expGain: 0, levelUp: false, newLevel: 0 };
    }

    const config = SKILL_CONFIGS[skillType];

    // 检查等级上限
    if (skill.level >= config.maxLevel) {
      return { success: false, message: '技能已满级', expGain: 0, levelUp: false, newLevel: skill.level };
    }

    // 计算经验增量（0.5 ~ 2.0，受学习技能加成）
    let expGain = 0.5 + Math.random() * 1.5;

    // 学习技能加成
    const studyingSkill = this.db.get(
      'SELECT level FROM pet_skills WHERE pet_id = ? AND skill_type = ?',
      petId,
      SKILLS.STUDYING,
    );
    if (studyingSkill && skillType !== SKILLS.STUDYING) {
      const studyingConfig = SKILL_CONFIGS[SKILLS.STUDYING];
      expGain *= 1 + studyingSkill.level * studyingConfig.bonusPerLevel;
    }

    expGain = Math.round(expGain * 100) / 100; // 保留2位小数

    // 更新经验和使用次数
    const newExp = skill.exp + expGain;
    const currentLevelExp = this._getExpForSkillLevel(skill.level + 1);

    let levelUp = false;
    let newLevel = skill.level;

    if (newExp >= currentLevelExp) {
      // 升级
      newLevel = skill.level + 1;
      const remainingExp = newExp - currentLevelExp;

      this.db.run(
        'UPDATE pet_skills SET level = ?, exp = ?, used_count = used_count + 1 WHERE pet_id = ? AND skill_type = ?',
        newLevel,
        remainingExp,
        petId,
        skillType,
      );
      levelUp = true;
    } else {
      this.db.run(
        'UPDATE pet_skills SET exp = ?, used_count = used_count + 1 WHERE pet_id = ? AND skill_type = ?',
        newExp,
        petId,
        skillType,
      );
    }

    // 记录事件日志
    try {
      const eventType = `skill_use_${skillType || 'unknown'}`;
      this.db.run(
        'INSERT INTO event_log (user_id, event_type, event_data) VALUES (1, ?, ?)',
        eventType,
        JSON.stringify({ skillType, expGain, levelUp, newLevel, context }),
      );
    } catch (err) {
      console.error('[Skill] 日志记录失败:', err.message);
    }

    return {
      success: true,
      message: levelUp ? `${config.name} 升级了！当前等级: ${newLevel}` : `${config.name} 经验+${expGain}`,
      expGain,
      levelUp,
      newLevel,
    };
  }

  /**
   * 获取技能等级加成倍率
   * @param {number} petId 宠物ID
   * @param {string} skillType 技能类型
   * @returns {number} 加成倍率（1.0 = 无加成）
   */
  getBonus(petId, skillType) {
    const skill = this.db.get('SELECT level FROM pet_skills WHERE pet_id = ? AND skill_type = ?', petId, skillType);

    if (!skill) return 1.0;

    const config = SKILL_CONFIGS[skillType];
    if (!config) return 1.0;

    return 1.0 + skill.level * config.bonusPerLevel;
  }

  /**
   * 获取所有技能状态
   * @param {number} petId 宠物ID
   * @returns {Array} 技能列表
   */
  getAllSkills(petId) {
    const skills = this.db.all('SELECT * FROM pet_skills WHERE pet_id = ?', petId);

    return skills.map((skill) => {
      const config = SKILL_CONFIGS[skill.skill_type] || {};
      const nextLevelExp = this._getExpForSkillLevel(skill.level + 1);

      return {
        type: skill.skill_type,
        name: config.name || skill.skill_type,
        description: config.description || '',
        level: skill.level,
        maxLevel: config.maxLevel || 20,
        exp: skill.exp,
        nextLevelExp: nextLevelExp,
        expProgress: nextLevelExp > 0 ? Math.min(1, skill.exp / nextLevelExp) : 1,
        bonusPerLevel: config.bonusPerLevel || 0,
        currentBonus: config.bonusPerLevel ? 1 + skill.level * config.bonusPerLevel : 1,
        usedCount: skill.used_count,
      };
    });
  }

  /**
   * 计算技能升级所需经验
   * 公式：Math.floor(50 * level^1.2)，适配 0-100 等级平滑增长
   * @param {number} level 目标等级
   * @returns {number} 所需经验
   * @private
   */
  _getExpForSkillLevel(level) {
    if (level <= 1) return SKILL_EXP_BASE;
    return Math.floor(SKILL_EXP_BASE * Math.pow(level, 1.2));
  }

  // ══════════════════════════════════════════════
  // 进化专属技能
  // ══════════════════════════════════════════════

  /**
   * 注册进化专属技能到技能系统
   * @param {number} petId 宠物ID
   * @param {string} evolutionTypeId 进化类型 ('fire'|'ice'|'thunder')
   * @param {Object} skillConfig 技能配置（来自 EVOLUTION_BRANCHES）
   */
  addEvolutionSkill(petId, evolutionTypeId, skillConfig) {
    if (!skillConfig) return;

    const skillId = `evo_${evolutionTypeId}_${skillConfig.type}`;

    // 幂等插入：先检查是否已存在
    const existing = this.db.get('SELECT * FROM pet_skills WHERE pet_id = ? AND skill_type = ?', petId, skillId);

    if (existing) {
      console.log(`[Skill] 进化技能已存在: ${skillId}`);
      return;
    }

    // 插入新技能，初始等级 1，经验 0
    this.db.run(
      'INSERT INTO pet_skills (pet_id, skill_type, level, exp, used_count) VALUES (?, ?, 1, 0, 0)',
      petId,
      skillId,
    );

    console.log(`[Skill] 进化技能已注册: ${skillId} (等级1)`);
  }

  /**
   * 获取进化技能的额外加成（用于经验获取等场景）
   * @param {string} evolutionTypeId 进化类型
   * @returns {number} 加成倍率（1.0 = 无加成）
   */
  getEvolutionSkillBonus(evolutionTypeId) {
    if (!evolutionTypeId) return 1.0;

    const branch = EVOLUTION_BRANCHES[evolutionTypeId];
    if (!branch || !branch.exclusiveSkill) return 1.0;

    // 从 exclusiveSkill 中读取 expBonus（如 fire 进化的 expBonus: 1.2）
    const bonus = branch.exclusiveSkill.expBonus;
    return typeof bonus === 'number' ? bonus : 1.0;
  }
}

module.exports = SkillSystem;
