// ══════════════════════════════════════════════
// ipc-handlers.js — IPC通信注册
// 所有主进程与渲染进程的通信都在此注册
// 统一消息格式：请求 { type, payload, requestId }
// 响应 { success, data, error, requestId }
// ══════════════════════════════════════════════

'use strict';

const { ipcMain } = require('electron');
const { IPC_CHANNELS, EVOLUTION_BRANCHES, EVOLUTION_BRANCH_IDS } = require('./constants');

class IPCHandlers {
  /**
   * @param {Object} deps 依赖注入
   * @param {PetDatabase} deps.database 数据库实例
   * @param {PetAI} deps.petAI 宠物AI实例
   * @param {Economy} deps.economy 经济系统实例
   * @param {QuestSystem} deps.questSystem 任务系统实例
   * @param {WorkSystem} deps.workSystem 打工系统实例
   * @param {SkillSystem} deps.skillSystem 技能系统实例
   * @param {SaveManager} deps.saveManager 存档管理实例
   * @param {TimeManager} deps.timeManager 时间管理实例
   * @param {SignInSystem} deps.signInSystem 签到系统实例
   * @param {MiniGameManager} deps.miniGameManager 小游戏管理器实例
   * @param {EventManager} deps.eventManager 事件管理器实例
   * @param {Store} deps.store electron-store 实例
   */
  constructor(deps) {
    this.db = deps.database;
    this.petAI = deps.petAI;
    this.economy = deps.economy;
    this.questSystem = deps.questSystem;
    this.workSystem = deps.workSystem;
    this.skillSystem = deps.skillSystem;
    this.saveManager = deps.saveManager;
    this.timeManager = deps.timeManager;
    this.signInSystem = deps.signInSystem;
    this.miniGameManager = deps.miniGameManager;
    this.eventManager = deps.eventManager;
    this.store = deps.store;
  }

  /**
   * 注册所有 IPC handlers
   */
  register() {
    this._handlePetActions();
    this._handleEconomy();
    this._handleQuests();
    this._handleWork();
    this._handleSkills();
    this._handleSettings();
    this._handleSignIn();
    this._handleMiniGame();
    this._handleEvents();
    this._handleUser();
    this._handleLevel();

    console.log('[IPCHandlers] 所有IPC处理器已注册');
  }

  // ══════════════════════════════════════════════
  // 通用响应包装器
  // ══════════════════════════════════════════════

  /**
   * 包装异步handler，统一错误处理和响应格式
   * @param {string} channel IPC频道
   * @param {Function} handler 处理函数
   * @private
   */
  _wrapHandler(channel, handler) {
    ipcMain.handle(channel, async (event, payload) => {
      const requestId = payload?.requestId || Date.now().toString();
      try {
        // 基础输入校验
        if (payload?.quantity !== undefined && payload.quantity != null) {
          const q = Number(payload.quantity);
          if (!Number.isInteger(q) || q <= 0) {
            throw new Error('数量必须为正整数');
          }
        }
        if (payload?.itemId !== undefined && payload.itemId != null) {
          if (typeof payload.itemId !== 'string' || !payload.itemId.trim()) {
            throw new Error('道具ID不能为空');
          }
        }
        const data = await handler(payload, event);
        return { success: true, data, error: null, requestId };
      } catch (err) {
        console.error(`[IPC] ${channel} 错误:`, err.message);
        return { success: false, data: null, error: '操作失败，请稍后重试', requestId };
      }
    });
  }

  // ══════════════════════════════════════════════
  // 宠物操作
  // ══════════════════════════════════════════════

  _handlePetActions() {
    // 抚摸
    this._wrapHandler(IPC_CHANNELS.PET_PET, () => {
      const result = this.petAI.pet(1);
      this.saveManager.markDirty('petAI');
      return result;
    });

    // 喂食
    this._wrapHandler(IPC_CHANNELS.PET_FEED, (payload) => {
      const itemId = payload?.itemId;
      if (!itemId) throw new Error('缺少道具ID');
      const result = this.petAI.feed(itemId);
      this.saveManager.markDirty('petAI');
      return result;
    });

    // 洗澡
    this._wrapHandler(IPC_CHANNELS.PET_WASH, () => {
      const result = this.petAI.wash();
      this.saveManager.markDirty('petAI');
      return result;
    });

    // 获取状态
    this._wrapHandler(IPC_CHANNELS.PET_STATUS, () => {
      return this.petAI.getStatus();
    });
  }

  // ══════════════════════════════════════════════
  // 经济系统
  // ══════════════════════════════════════════════

  _handleEconomy() {
    // 获取背包
    this._wrapHandler(IPC_CHANNELS.ECONOMY_INVENTORY, (payload) => {
      const userId = 1;
      return this.economy.getInventory(userId);
    });

    // 使用道具
    this._wrapHandler(IPC_CHANNELS.ECONOMY_USE_ITEM, (payload) => {
      const userId = 1;
      const itemId = payload?.itemId;
      if (!itemId) throw new Error('缺少道具ID');
      const result = this.economy.useItem(userId, itemId);
      this.saveManager.markDirty('economy');
      return result;
    });

    // 出售道具
    this._wrapHandler(IPC_CHANNELS.ECONOMY_SELL, (payload) => {
      const userId = 1;
      const itemId = payload?.itemId;
      const quantity = payload?.quantity || 1;
      if (!itemId) throw new Error('缺少道具ID');
      const result = this.economy.sellItem(userId, itemId, quantity);
      this.saveManager.markDirty('economy');
      return result;
    });

    // 获取余额
    this._wrapHandler(IPC_CHANNELS.ECONOMY_BALANCE, (payload) => {
      const userId = 1;
      return this.economy.getBalance(userId);
    });

    // 商店列表
    this._wrapHandler(IPC_CHANNELS.ECONOMY_SHOP, (payload) => {
      const type = payload?.type || null;
      return this.economy.getShopItems(type);
    });

    // 购买道具
    this._wrapHandler(IPC_CHANNELS.ECONOMY_BUY, (payload) => {
      const userId = 1;
      const itemId = payload?.itemId;
      const quantity = payload?.quantity || 1;
      if (!itemId) throw new Error('缺少道具ID');
      const result = this.economy.buyItem(userId, itemId, quantity);
      this.saveManager.markDirty('economy');
      return result;
    });
  }

  // ══════════════════════════════════════════════
  // 任务系统
  // ══════════════════════════════════════════════

  _handleQuests() {
    // 每日任务
    this._wrapHandler(IPC_CHANNELS.QUEST_DAILY, (payload) => {
      const userId = 1;
      return this.questSystem.getDailyTasks(userId);
    });

    // 领取任务奖励
    this._wrapHandler(IPC_CHANNELS.QUEST_CLAIM, (payload) => {
      const userId = 1;
      const taskId = payload?.taskId;
      if (!taskId) throw new Error('缺少任务ID');
      const result = this.questSystem.claimTaskReward(userId, taskId);
      this.saveManager.markDirty('quest');
      return result;
    });

    // 获取成就列表
    this._wrapHandler(IPC_CHANNELS.QUEST_ACHIEVEMENTS, (payload) => {
      const userId = 1;
      return this.questSystem.getAchievements(userId);
    });

    // 领取成就奖励
    this._wrapHandler(IPC_CHANNELS.QUEST_ACHIEVEMENT_CLAIM, (payload) => {
      const userId = 1;
      const achievementId = payload?.achievementId;
      if (!achievementId) throw new Error('缺少成就ID');
      const result = this.questSystem.claimAchievement(userId, achievementId);
      this.saveManager.markDirty('quest');
      return result;
    });
  }

  // ══════════════════════════════════════════════
  // 打工系统
  // ══════════════════════════════════════════════

  _handleWork() {
    // 开始打工
    this._wrapHandler(IPC_CHANNELS.WORK_START, (payload) => {
      const userId = 1;
      const workType = payload?.workType;
      if (!workType) throw new Error('缺少工作类型');
      const result = this.workSystem.startWork(userId, workType);
      this.saveManager.markDirty('work');
      return result;
    });

    // 取消打工
    this._wrapHandler(IPC_CHANNELS.WORK_CANCEL, (payload) => {
      const userId = 1;
      const result = this.workSystem.cancelWork(userId);
      this.saveManager.markDirty('work');
      return result;
    });

    // 获取打工状态
    this._wrapHandler(IPC_CHANNELS.WORK_STATUS, (payload) => {
      const userId = 1;
      return this.workSystem.getWorkStatus(userId);
    });

    // 完成打工
    this._wrapHandler(IPC_CHANNELS.WORK_FINISH, (payload) => {
      const userId = 1;
      const result = this.workSystem.finishWork(userId);
      this.saveManager.markDirty('work');
      return result;
    });

    // 获取可用工作列表
    this._wrapHandler(IPC_CHANNELS.WORK_JOBS, (payload) => {
      const user = this.db.get('SELECT level FROM users WHERE id = 1');
      const level = user ? user.level : 1;
      return this.workSystem.getAvailableJobs(level);
    });
  }

  // ══════════════════════════════════════════════
  // 技能系统
  // ══════════════════════════════════════════════

  _handleSkills() {
    // 获取技能列表
    this._wrapHandler(IPC_CHANNELS.SKILL_LIST, () => {
      return this.skillSystem.getAllSkills(1);
    });

    // 使用技能
    this._wrapHandler(IPC_CHANNELS.SKILL_USE, (payload) => {
      const skillType = payload?.skillType;
      if (!skillType) throw new Error('缺少技能类型');
      const result = this.skillSystem.useSkill(1, skillType, payload?.context || {});
      this.saveManager.markDirty('skill');
      return result;
    });
  }

  // ══════════════════════════════════════════════
  // 设置
  // ══════════════════════════════════════════════

  _handleSettings() {
    // 获取设置
    this._wrapHandler(IPC_CHANNELS.SETTINGS_GET, () => {
      return this.store.get('settings', {});
    });

    // 保存设置
    this._wrapHandler(IPC_CHANNELS.SETTINGS_SET, (payload) => {
      const settings = payload?.settings;
      if (!settings) throw new Error('缺少设置数据');
      this.store.set('settings', settings);
      return { saved: true };
    });
  }

  // ══════════════════════════════════════════════
  // 签到（使用独立签到系统）
  // ══════════════════════════════════════════════

  _handleSignIn() {
    // 检查签到状态
    this._wrapHandler(IPC_CHANNELS.SIGNIN_CHECK, () => {
      return this.signInSystem.getSignInInfo(1);
    });

    // 获取签到详情（含里程碑）
    this._wrapHandler(IPC_CHANNELS.SIGNIN_INFO, () => {
      return this.signInSystem.getSignInInfo(1);
    });

    // 执行签到
    this._wrapHandler(IPC_CHANNELS.SIGNIN_CLAIM, () => {
      const result = this.signInSystem.signIn(1);
      this.saveManager.markDirty('signin');
      return result;
    });
  }

  // ══════════════════════════════════════════════
  // 小游戏
  // ══════════════════════════════════════════════

  _handleMiniGame() {
    // 获取小游戏列表
    this._wrapHandler(IPC_CHANNELS.MINIGAME_LIST, (payload) => {
      const userId = 1;
      return this.miniGameManager.getGameList(userId);
    });

    // 开始游戏
    this._wrapHandler(IPC_CHANNELS.MINIGAME_START, (payload) => {
      const userId = 1;
      const gameType = payload?.gameType;
      if (!gameType) throw new Error('缺少游戏类型');
      const result = this.miniGameManager.startGame(userId, gameType);
      this.saveManager.markDirty('minigame');
      return result;
    });

    // 结束游戏
    this._wrapHandler(IPC_CHANNELS.MINIGAME_FINISH, (payload) => {
      const userId = 1;
      const gameType = payload?.gameType;
      const score = payload?.score || 0;
      if (!gameType) throw new Error('缺少游戏类型');
      const result = this.miniGameManager.finishGame(userId, gameType, score);
      this.saveManager.markDirty('minigame');
      return result;
    });

    // 获取游戏记录
    this._wrapHandler(IPC_CHANNELS.MINIGAME_RECORDS, (payload) => {
      const userId = 1;
      const gameType = payload?.gameType || null;
      return this.miniGameManager.getGameRecords(userId, gameType);
    });
  }

  // ══════════════════════════════════════════════
  // 随机事件
  // ══════════════════════════════════════════════

  _handleEvents() {
    // 手动触发随机事件
    this._wrapHandler(IPC_CHANNELS.EVENT_TRIGGER, (payload) => {
      const eventType = payload?.eventType || null;
      if (eventType) {
        return this.eventManager.executeEvent(eventType);
      }
      return this.eventManager.tryTriggerEvent();
    });

    // 获取今日节日信息
    this._wrapHandler(IPC_CHANNELS.EVENT_FESTIVAL, () => {
      const festival = this.timeManager.getTodayFestival();
      if (!festival) {
        return { isFestival: false, festival: null };
      }
      const config = this.timeManager.getFestivalConfig(festival.type);
      const claimed = this.timeManager.hasClaimedFestivalReward(festival.type);
      return { isFestival: true, festival, config, claimed };
    });
  }

  // ══════════════════════════════════════════════
  // 用户信息
  // ══════════════════════════════════════════════

  _handleUser() {
    // 获取用户信息
    this._wrapHandler(IPC_CHANNELS.USER_INFO, () => {
      let user = this.db.get('SELECT * FROM users WHERE id = 1');

      // 如果用户不存在，创建默认用户记录
      if (!user) {
        this.db.run(
          `INSERT OR IGNORE INTO users (id, name, level, exp, gold, diamond, heart_coin, affection)
           VALUES (1, '主人', 1, 0, 500, 0, 0, 0)`
        );
        user = this.db.get('SELECT * FROM users WHERE id = 1');
      }

      const petStatus = this.petAI.getStatus();
      const timeSlot = this.timeManager.getTimeSlot();
      const festival = this.timeManager.getTodayFestival();
      return {
        user: {
          id: user.id,
          name: user.name,
          level: user.level,
          exp: user.exp,
          gold: user.gold,
          diamond: user.diamond,
          heartCoin: user.heart_coin,
          affection: user.affection,
          birthDate: user.birth_date,
          createdAt: user.created_at,
          lastLogin: user.last_login,
        },
        pet: petStatus,
        timeSlot,
        festival,
      };
    });

    // 更新用户信息
    this._wrapHandler(IPC_CHANNELS.USER_UPDATE, (payload) => {
      const updates = payload?.updates;
      if (!updates) throw new Error('缺少更新数据');
      const allowedFields = ['name', 'birth_date'];
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          this.db.run(`UPDATE users SET ${field} = ? WHERE id = 1`, updates[field]);
        }
      }
      return { updated: true };
    });
  }

  // ══════════════════════════════════════════════
  // 升级系统
  // ══════════════════════════════════════════════

  _handleLevel() {
    // 查询宠物等级信息
    this._wrapHandler(IPC_CHANNELS.PET_LEVEL_INFO, () => {
      return this.petAI.getLevelInfo();
    });

    // 选择进化（Lv20 后调用）
    this._wrapHandler(IPC_CHANNELS.PET_EVOLVE, (payload) => {
      const evolutionType = payload?.evolutionType;
      if (!evolutionType) throw new Error('缺少进化类型');
      if (!EVOLUTION_BRANCH_IDS.includes(evolutionType)) {
        throw new Error('无效的进化类型，可选: ' + EVOLUTION_BRANCH_IDS.join(', '));
      }
      const result = this.petAI.evolve(evolutionType);
      this.saveManager.markDirty('petAI');
      return result;
    });
  }
}

module.exports = IPCHandlers;
