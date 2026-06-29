// ══════════════════════════════════════════════
// dialogue-manager.js — 台词管理器
// JSON驱动的动态台词系统，支持亲密度覆盖层+情绪分类
// ══════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');

class DialogueManager {
  constructor() {
    this.dialogues = null;
    this.dialoguesPath = path.join(__dirname, 'dialogues.json');
    this._watcher = null;
    this.loadDialogues();
  }

  /**
   * 加载台词JSON
   */
  loadDialogues() {
    try {
      if (fs.existsSync(this.dialoguesPath)) {
        const data = fs.readFileSync(this.dialoguesPath, 'utf-8');
        this.dialogues = JSON.parse(data);
        console.log('[DialogueManager] 台词加载成功');
      } else {
        console.warn('[DialogueManager] dialogues.json 不存在，使用默认台词');
        this.dialogues = null;
      }
    } catch (err) {
      console.error('[DialogueManager] 加载失败:', err.message);
      this.dialogues = null;
    }
  }

  /**
   * 热更新：重新加载
   */
  reload() {
    console.log('[DialogueManager] 重新加载台词...');
    this.loadDialogues();
    return { success: true, message: '台词已重新加载' };
  }

  /**
   * 启动文件监听（修改JSON自动重载，无需重启）
   */
  startWatching() {
    if (this._watcher) return;
    try {
      this._watcher = fs.watchFile(this.dialoguesPath, { interval: 5000 }, () => {
        console.log('[DialogueManager] 检测到文件变化，自动重新加载');
        this.loadDialogues();
      });
      console.log('[DialogueManager] 文件监听已启动');
    } catch (err) {
      console.warn('[DialogueManager] 文件监听启动失败:', err.message);
    }
  }

  /**
   * 停止文件监听
   */
  stopWatching() {
    if (this._watcher) {
      fs.unwatchFile(this.dialoguesPath);
      this._watcher = null;
      console.log('[DialogueManager] 文件监听已停止');
    }
  }

  /**
   * 获取互动台词
   * @param {string} interactionType 互动类型：'pet' | 'feed' | 'wash' | 'work'
   * @param {Object} context 状态上下文
   * @param {string} context.emotion 情绪
   * @param {string} context.affectionTier 亲密度分档：stranger | acquaintance | friend | close_friend | best_friend | soulmate | bonded
   * @param {number} context.hunger 饱食度
   * @param {number} context.mood 心情
   * @param {string} [context.itemName] 道具名称（feed时需要）
   * @returns {string} 台词
   */
  getDialogue(interactionType, context) {
    if (!this.dialogues) {
      return this._getDefaultDialogue(interactionType, context);
    }

    const category = this.dialogues.interactions?.[interactionType];
    if (!category) {
      return this._getDefaultDialogue(interactionType, context);
    }

    // 优先取亲密度覆盖层
    const affectionPool = category._affection?.[context.affectionTier]?.[context.emotion];
    if (affectionPool && Array.isArray(affectionPool) && affectionPool.length > 0) {
      return this._pick(affectionPool, context);
    }

    // 兜底取情绪池
    const emotionPool = category[context.emotion];
    if (emotionPool && Array.isArray(emotionPool) && emotionPool.length > 0) {
      return this._pick(emotionPool, context);
    }

    // 情绪也没匹配到，取normal兜底
    const normalPool = category['normal'];
    if (normalPool && Array.isArray(normalPool) && normalPool.length > 0) {
      return this._pick(normalPool, context);
    }

    // 最终硬编码默认
    return this._getDefaultDialogue(interactionType, context);
  }

  /**
   * 获取打工台词（分阶段：work_start / work_finish / work_cancel）
   * @param {string} phase 打工阶段：'work_start' | 'work_finish' | 'work_cancel'
   * @param {Object} context 状态上下文（同 getDialogue）
   * @returns {string} 台词
   */
  getWorkDialogue(phase, context) {
    // work 的 phase 作为 interactionType 传入 getDialogue
    // 因为 dialogues.json 中 work 下分 work_start/work_finish/work_cancel 子键
    return this.getDialogue(phase, context);
  }

  /**
   * 获取冷却台词
   * @param {string} interactionType 互动类型
   * @param {Object} context
   * @param {number} context.remaining 剩余秒数
   * @returns {string}
   */
  getCooldownDialogue(interactionType, context) {
    if (!this.dialogues) {
      return this._getDefaultCooldown(interactionType, context);
    }

    const pool = this.dialogues.cooldowns?.[interactionType];
    if (pool && Array.isArray(pool) && pool.length > 0) {
      return this._pick(pool, context);
    }

    return this._getDefaultCooldown(interactionType, context);
  }

  /**
   * 获取里程碑台词
   * @param {string} milestoneType 里程碑类型
   * @param {Object} context
   * @returns {string}
   */
  getMilestoneDialogue(milestoneType, context) {
    if (!this.dialogues) {
      return this._getDefaultMilestoneDialogue(milestoneType, context);
    }

    const pool = this.dialogues.milestones?.[milestoneType];
    if (pool && Array.isArray(pool) && pool.length > 0) {
      return this._pick(pool, context);
    }

    return this._getDefaultMilestoneDialogue(milestoneType, context);
  }

  /**
   * 随机选取一条并替换变量
   * @private
   */
  _pick(pool, context) {
    const line = pool[Math.floor(Math.random() * pool.length)];
    return this._replaceVariables(line, context);
  }

  /**
   * 替换变量占位符
   * @private
   */
  _replaceVariables(template, context) {
    return template
      .replace(/\{\{itemName\}\}/g, context.itemName || '食物')
      .replace(/\{\{petName\}\}/g, context.petName || '爪爪')
      .replace(/\{\{level\}\}/g, context.level || 1)
      .replace(/\{\{stageName\}\}/g, context.stageName || '陌生人')
      .replace(/\{\{remaining\}\}/g, context.remaining || 0)
      .replace(/\{\{evolutionName\}\}/g, context.evolutionName || '');
  }

  /**
   * 硬编码默认台词（JSON不存在时的fallback）
   * @private
   */
  _getDefaultDialogue(type, context) {
    const defaults = {
      pet: '爪爪蹭了蹭你的手~',
      feed: `爪爪吃了${context.itemName || '食物'}，好满足~`,
      wash: '爪爪洗得干干净净~',
      work_start: '爪爪开始打工了！加油~',
      work_finish: '爪爪打工回来了！~',
      work_cancel: '爪爪取消了打工~',
    };
    return defaults[type] || '...';
  }

  /**
   * 硬编码默认冷却台词
   * @private
   */
  _getDefaultCooldown(type, context) {
    const defaults = {
      pet: `爪爪还在害羞中，${context.remaining}秒后再摸~`,
      feed: `爪爪刚吃过，${context.remaining}秒后再喂~`,
      wash: `爪爪刚洗过澡，${context.remaining}秒后再洗~`,
      work: `爪爪正在打工中，${context.remaining}秒后再来~`,
    };
    return defaults[type] || '冷却中...';
  }

  /**
   * 硬编码默认里程碑台词
   * @private
   */
  _getDefaultMilestoneDialogue(type, context) {
    const defaults = {
      level_up: `爪爪升级到Lv${context.level || 1}啦！`,
      first_interaction: '爪爪第一次见到你~',
      evolution: '爪爪进化了！',
      affection_stage_up: `爪爪和你的关系变成了${context.stageName || '朋友'}！`,
    };
    return defaults[type] || '...';
  }
}

module.exports = DialogueManager;
