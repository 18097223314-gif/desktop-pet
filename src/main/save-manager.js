// ══════════════════════════════════════════════
// save-manager.js — 存档管理类
// 脏数据标记、自动保存、强制保存、异常恢复
// ══════════════════════════════════════════════

'use strict';

const fs = require('fs');
const path = require('path');

class SaveManager {
  /**
   * @param {PetDatabase} database 数据库实例
   * @param {PetAI} petAI 宠物AI实例
   * @param {Object} components 可保存组件集合
   * @param {Economy} components.economy 经济系统实例
   * @param {QuestSystem} components.questSystem 任务系统实例
   * @param {WorkSystem} components.workSystem 打工系统实例
   * @param {SkillSystem} components.skillSystem 技能系统实例
   * @param {SignInSystem} components.signInSystem 签到系统实例
   * @param {MiniGameManager} components.miniGameManager 小游戏管理器实例
   */
  constructor(database, petAI, components = {}) {
    /** @type {PetDatabase} */
    this.db = database;
    /** @type {PetAI} */
    this.petAI = petAI;

    /** @type {Object} 可保存组件映射 */
    this.components = {
      economy: components.economy || null,
      questSystem: components.questSystem || null,
      workSystem: components.workSystem || null,
      skillSystem: components.skillSystem || null,
      signInSystem: components.signInSystem || null,
      miniGameManager: components.miniGameManager || null,
    };

    /** @type {Set<string>} 脏数据组件集合 */
    this.dirtyComponents = new Set();

    /** @type {number} 自动保存间隔（毫秒） */
    this.autoSaveInterval = 30 * 1000; // 30秒

    /** @type {NodeJS.Timeout|null} 自动保存定时器 */
    this.autoSaveTimer = null;

    /** @type {string} 退出状态标记文件路径 */
    this.exitFlagPath = null;

    /** @type {boolean} 是否已正常退出 */
    this.cleanExit = false;
  }

  /**
   * 初始化（检查上次退出是否正常，启动自动保存）
   * @param {string} userDataPath 用户数据目录路径
   */
  init(userDataPath) {
    this.exitFlagPath = path.join(userDataPath, '.exit_flag');

    // 检查异常恢复
    this.checkAndRecover();

    // 启动自动保存
    this.autoSaveTimer = setInterval(() => this.autoSave(), this.autoSaveInterval);

    console.log('[SaveManager] 初始化完成，自动保存间隔: 30秒');
  }

  /**
   * 标记脏数据
   * @param {string} component 组件名称（如 'petAI', 'economy', 'quest' 等）
   */
  markDirty(component) {
    this.dirtyComponents.add(component);
  }

  /**
   * 自动保存（每30秒调用一次）
   * 只保存脏数据组件
   */
  autoSave() {
    if (this.dirtyComponents.size === 0) return;

    const wasDirty = new Set(this.dirtyComponents);

    // 保存宠物状态
    if (this.dirtyComponents.has('petAI') || this.dirtyComponents.has('all')) {
      try {
        this.petAI.saveStatus();
        this.dirtyComponents.delete('petAI');
      } catch (err) {
        console.error('[SaveManager] 自动保存宠物状态失败:', err.message);
      }
    }

    // 遍历其他脏组件，调用对应的 save 方法
    for (const name of this.dirtyComponents) {
      if (name === 'petAI' || name === 'all') continue;
      const component = this.components[name];
      if (component && typeof component.save === 'function') {
        try {
          component.save();
          this.dirtyComponents.delete(name);
        } catch (err) {
          console.error(`[SaveManager] 自动保存组件 ${name} 失败:`, err.message);
        }
      }
    }

    // 如果有组件保存成功，写入时间戳并持久化 DB
    if (wasDirty.size > this.dirtyComponents.size) {
      try {
        this.db.run(
          "INSERT OR REPLACE INTO db_meta (key, value) VALUES ('last_auto_save', ?)",
          new Date().toISOString(),
        );
        this.db.save();
      } catch (err) {
        console.error('[SaveManager] 自动保存时间戳/DB持久化失败:', err.message);
      }
    }
  }

  /**
   * 强制保存（退出前调用）
   * 保存所有组件状态
   */
  forceSave() {
    // 保存宠物状态
    try {
      this.petAI.saveStatus();
      if (this.dirtyComponents.has('petAI')) {
        this.dirtyComponents.delete('petAI');
      }
    } catch (err) {
      console.error('[SaveManager] 保存宠物状态失败:', err.message);
    }

    // 保存所有可保存组件，只清除成功保存的标记
    for (const [name, component] of Object.entries(this.components)) {
      if (component && typeof component.save === 'function') {
        try {
          component.save();
          this.dirtyComponents.delete(name);
        } catch (err) {
          console.error(`[SaveManager] 保存组件 ${name} 失败:`, err.message);
        }
      }
    }

    // 标记正常退出
    this.markCleanExit();

    // sql.js 是内存数据库，需手动保存到文件
    try {
      this.db.forceSave();
    } catch (err) {
      console.error('[SaveManager] 数据库保存到文件失败:', err.message);
    }

    console.log('[SaveManager] 强制保存完成，剩余脏标记:', this.dirtyComponents.size);

    // 停止自动保存
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * 异常恢复检查
   * 检查上次退出状态，如果异常则尝试恢复
   */
  checkAndRecover() {
    if (!this.exitFlagPath) return;

    try {
      if (fs.existsSync(this.exitFlagPath)) {
        const flagContent = fs.readFileSync(this.exitFlagPath, 'utf-8').trim();

        if (flagContent === 'dirty') {
          console.warn('[SaveManager] 检测到上次异常退出，开始恢复...');

          // 尝试恢复：WAL 日志会自动回放
          // 检查宠物状态是否合理
          const status = this.db.get('SELECT * FROM pet_status WHERE pet_id = 1');
          if (status) {
            // 如果属性值异常（超出范围），修正
            let needFix = false;
            const fixes = {};

            for (const stat of ['hunger', 'hygiene', 'mood', 'stamina']) {
              if (status[stat] < 0) {
                fixes[stat] = 50; // 重置为默认值
                needFix = true;
              } else if (status[stat] > 100) {
                fixes[stat] = 100;
                needFix = true;
              }
            }

            if (needFix) {
              // 参数化查询修正异常属性（字段名来自固定白名单，值用参数传递）
              const ALLOWED_STATS = ['hunger', 'hygiene', 'mood', 'stamina'];
              const entries = Object.entries(fixes).filter(([k]) => ALLOWED_STATS.includes(k));
              const setSQL = entries.map(([k]) => `${k} = ?`).join(', ');
              const values = entries.map(([, v]) => v);
              this.db.run(`UPDATE pet_status SET ${setSQL} WHERE pet_id = 1`, ...values);
              console.log('[SaveManager] 修正异常属性:', fixes);
            }

            // 检查是否处于异常状态（如卡在某个行为）
            if (status.state === 'work') {
              // 检查是否有活跃打工记录
              const activeWork = this.db.get("SELECT * FROM work_records WHERE user_id = 1 AND status = 'working'");
              if (!activeWork) {
                this.db.run("UPDATE pet_status SET state = 'idle' WHERE pet_id = 1");
                console.log('[SaveManager] 修正异常状态: work → idle');
              }
            }
          }

          // 记录恢复日志
          try {
            this.db.run("INSERT INTO event_log (user_id, event_type, event_data) VALUES (1, 'recovery', '{}')");
          } catch (err) {
            console.error('[SaveManager] 恢复日志记录失败:', err.message);
          }

          console.log('[SaveManager] 恢复完成');
        }
        // 删除标记文件
        fs.unlinkSync(this.exitFlagPath);
      }
    } catch (err) {
      console.error('[SaveManager] 恢复检查失败:', err.message);
    }

    // 设置脏退出标记
    this.markDirtyExit();
  }

  /**
   * 标记退出状态为正常
   */
  markCleanExit() {
    this.cleanExit = true;
    if (this.exitFlagPath) {
      try {
        fs.writeFileSync(this.exitFlagPath, 'clean', 'utf-8');
      } catch (err) {
        // 忽略写入失败
      }
    }
  }

  /**
   * 标记退出状态为脏（启动时调用）
   */
  markDirtyExit() {
    if (this.exitFlagPath) {
      try {
        fs.writeFileSync(this.exitFlagPath, 'dirty', 'utf-8');
      } catch (err) {
        // 忽略写入失败
      }
    }
  }
}

module.exports = SaveManager;
