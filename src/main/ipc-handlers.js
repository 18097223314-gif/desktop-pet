// ══════════════════════════════════════════════
// ipc-handlers.js — IPC通信注册
// 所有主进程与渲染进程的通信都在此注册
// 统一消息格式：请求 { type, payload, requestId }
// 响应 { success, data, error, requestId }
// ══════════════════════════════════════════════

'use strict';

const { ipcMain } = require('electron');
const {
  IPC_CHANNELS,
  EVOLUTION_BRANCHES,
  EVOLUTION_BRANCH_IDS,
  INITIAL_GOLD,
  RATE_LIMIT_WINDOW_MS,
} = require('./constants');

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
   * @param {I18n} deps.i18n 多语言实例
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
    this.i18n = deps.i18n;

    // ─── 速率限制 ───
    /** @type {Map<string, number[]>} 每个 channel 的调用时间戳队列 */
    this._rateLimits = new Map();
    /** 写操作（修改数据）：每分钟最多 10 次 */
    this._RATE_WRITE = { max: 10, windowMs: RATE_LIMIT_WINDOW_MS };
    /** 读操作（查询数据）：每分钟最多 60 次 */
    this._RATE_READ = { max: 60, windowMs: RATE_LIMIT_WINDOW_MS };
    /** 默认：每分钟最多 30 次 */
    this._RATE_DEFAULT = { max: 30, windowMs: RATE_LIMIT_WINDOW_MS };
  }

  /**
   * 速率限制检查（滑动窗口）
   * @param {string} channel IPC 频道名
   * @returns {{ allowed: boolean, retryAfter?: number }}
   * @private
   */
  _checkRateLimit(channel) {
    const now = Date.now();
    const channelLower = channel.toLowerCase();

    // 根据频道名判断操作类型
    const isWrite = /buy|sell|use|start|finish|cancel|claim|feed|pet|wash|evolve|update|set|expand/.test(channelLower);
    const isRead = /get|list|status|info|check|balance|shop|inventory|record|jobs/.test(channelLower);
    const config = isWrite ? this._RATE_WRITE : isRead ? this._RATE_READ : this._RATE_DEFAULT;

    // 获取该频道的时间戳队列
    if (!this._rateLimits.has(channel)) {
      this._rateLimits.set(channel, []);
    }
    const timestamps = this._rateLimits.get(channel);

    // 清理窗口外的旧记录
    while (timestamps.length > 0 && timestamps[0] <= now - config.windowMs) {
      timestamps.shift();
    }

    // 检查是否超限
    if (timestamps.length >= config.max) {
      const retryAfter = Math.ceil((timestamps[0] + config.windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }

    // 记录本次调用
    timestamps.push(now);
    return { allowed: true };
  }

  /**
   * 从 payload 中获取用户ID，默认 1，非正整数则兜底为 1
   * @param {Object} [payload] IPC 请求 payload
   * @returns {number} 用户ID
   * @private
   */
  _getUserId(payload) {
    if (payload && typeof payload.userId === 'number' && Number.isInteger(payload.userId) && payload.userId > 0) {
      return payload.userId;
    }
    return 1;
  }

  /**
   * 确保用户 id=1 存在，不存在则自动创建
   * @private
   */
  _ensureUser() {
    let user = this.db.get('SELECT * FROM users WHERE id = 1');
    if (!user) {
      try {
        this.db.run(
          `INSERT INTO users (id, name, level, exp, gold, diamond, heart_coin, affection)
           VALUES (1, '主人', 1, 0, ${INITIAL_GOLD}, 0, 0, 0)`,
        );
      } catch (err) {
        throw new Error('用户初始化失败: ' + err.message);
      }
      user = this.db.get('SELECT * FROM users WHERE id = 1');
      if (!user) {
        throw new Error('用户创建后无法查询，数据库可能损坏');
      }
      console.log('[IPC] 用户创建成功');
    }
    return user;
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

      // 速率限制
      const rateCheck = this._checkRateLimit(channel);
      if (!rateCheck.allowed) {
        console.warn(`[IPC] ${channel} 速率限制，${rateCheck.retryAfter}s 后重试`);
        return { success: false, data: null, error: `操作太频繁，请 ${rateCheck.retryAfter} 秒后重试`, requestId };
      }

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
        return { success: false, data: null, error: err.message, requestId };
      }
    });
  }

  // ══════════════════════════════════════════════
  // 宠物操作
  // ══════════════════════════════════════════════

  _handlePetActions() {
    // 抚摸
    this._wrapHandler(IPC_CHANNELS.PET_PET, (payload) => {
      const userId = this._getUserId(payload);
      const result = this.petAI.pet(userId);
      this.saveManager.markDirty('petAI');
      if (result.success) this.petAI.pushState();
      return result;
    });

    // 喂食
    this._wrapHandler(IPC_CHANNELS.PET_FEED, (payload) => {
      const userId = this._getUserId(payload);
      const itemId = payload?.itemId;
      if (!itemId) throw new Error('缺少道具ID');
      const result = this.petAI.feed(userId, itemId);
      this.saveManager.markDirty('petAI');
      if (result.success) this.petAI.pushState();
      return result;
    });

    // 洗澡
    this._wrapHandler(IPC_CHANNELS.PET_WASH, () => {
      const result = this.petAI.wash();
      this.saveManager.markDirty('petAI');
      if (result.success) this.petAI.pushState();
      return result;
    });

    // 获取状态
    this._wrapHandler(IPC_CHANNELS.PET_STATUS, () => {
      return this.petAI.getStatus();
    });

    // 广播状态给所有窗口（面板窗口用，确保主窗口能收到）
    this._wrapHandler(IPC_CHANNELS.PET_BROADCAST_STATE, () => {
      // 始终使用后端权威状态，忽略渲染进程传入的 payload
      const state = this.petAI.getStatus();
      try {
        const { BrowserWindow } = require('electron');
        let pushed = 0;
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.PET_STATE_PUSH, state);
            pushed++;
          }
        }
        console.log(`[IPC] pet:broadcast-state sent to ${pushed} windows`);
        return { success: true, windows: pushed };
      } catch (err) {
        console.warn('[IPC] pet:broadcast-state failed:', err.message);
        return { success: false, error: err.message };
      }
    });
  }

  // ══════════════════════════════════════════════
  // 经济系统
  // ══════════════════════════════════════════════

  _handleEconomy() {
    // 获取背包
    this._wrapHandler(IPC_CHANNELS.ECONOMY_INVENTORY, (payload) => {
      const userId = this._getUserId(payload);
      return this.economy.getInventory(userId);
    });

    // 使用道具
    this._wrapHandler(IPC_CHANNELS.ECONOMY_USE_ITEM, (payload, event) => {
      const userId = this._getUserId(payload);
      const itemId = typeof payload === 'string' ? payload : payload?.itemId;
      if (!itemId) throw new Error('缺少道具ID');
      console.log('[IPC] economy:useItem itemId:', itemId);
      const result = this.economy.useItem(userId, itemId);
      console.log('[IPC] economy:useItem result:', result.success, result.message);
      if (result.effects && result.effects._petStatChanges) {
        const changes = result.effects._petStatChanges;
        for (const [key, value] of Object.entries(changes)) {
          if (key === 'heal') continue;
          if (['hunger', 'hygiene', 'mood', 'stamina'].includes(key) && value !== undefined) {
            const current = this.petAI.getStatus();
            const newVal = (current[key] || 0) + value;
            this.petAI.setStatusField(key, newVal);
          }
        }
        this.saveManager.markDirty('petAI');
      }
      this.saveManager.markDirty('economy');

      // 直接广播最新状态给所有窗口（不依赖 emitter）
      if (result.success) {
        const { BrowserWindow } = require('electron');
        const state = this.petAI.getStatus();
        const wins = BrowserWindow.getAllWindows();
        for (const w of wins) {
          if (!w.isDestroyed()) {
            w.webContents.send(IPC_CHANNELS.PET_STATE_PUSH, state);
            // 注入 console.log 到 renderer 上下文，确保在 DevTools 可见
            w.webContents.executeJavaScript(
              `console.log('[MainProcess] broadcast pet-state-push:', ${JSON.stringify(state)})`,
            );
          }
        }
        console.log(`[IPC] useItem broadcast to ${wins.length} windows, hunger=${state.hunger}`);
      }
      return result;
    });

    // 出售道具
    this._wrapHandler(IPC_CHANNELS.ECONOMY_SELL, (payload) => {
      const userId = this._getUserId(payload);
      const itemId = payload?.itemId;
      const quantity = payload?.quantity || 1;
      if (!itemId) throw new Error('缺少道具ID');
      const result = this.economy.sellItem(userId, itemId, quantity);
      this.saveManager.markDirty('economy');
      return result;
    });

    // 获取余额
    this._wrapHandler(IPC_CHANNELS.ECONOMY_BALANCE, (payload) => {
      const userId = this._getUserId(payload);
      return this.economy.getBalance(userId);
    });

    // 商店列表
    this._wrapHandler(IPC_CHANNELS.ECONOMY_SHOP, (payload) => {
      const type = payload?.type || null;
      return this.economy.getShopItems(type);
    });

    // 购买道具
    this._wrapHandler(IPC_CHANNELS.ECONOMY_BUY, (payload) => {
      const userId = this._getUserId(payload);
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
      const userId = this._getUserId(payload);
      return this.questSystem.getDailyTasks(userId);
    });

    // 领取任务奖励
    this._wrapHandler(IPC_CHANNELS.QUEST_CLAIM, (payload) => {
      const userId = this._getUserId(payload);
      const taskId = payload?.taskId;
      if (!taskId) throw new Error('缺少任务ID');
      const result = this.questSystem.claimTaskReward(userId, taskId);
      this.saveManager.markDirty('quest');
      return result;
    });

    // 获取成就列表
    this._wrapHandler(IPC_CHANNELS.QUEST_ACHIEVEMENTS, (payload) => {
      const userId = this._getUserId(payload);
      return this.questSystem.getAchievements(userId);
    });

    // 领取成就奖励
    this._wrapHandler(IPC_CHANNELS.QUEST_ACHIEVEMENT_CLAIM, (payload) => {
      const userId = this._getUserId(payload);
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
      this._ensureUser();
      const userId = this._getUserId(payload);
      const workType = payload?.workType;
      if (!workType) throw new Error('缺少工作类型');
      const result = this.workSystem.startWork(userId, workType);
      this.saveManager.markDirty('work');
      return result;
    });

    // 取消打工
    this._wrapHandler(IPC_CHANNELS.WORK_CANCEL, (payload) => {
      this._ensureUser();
      const userId = this._getUserId(payload);
      const result = this.workSystem.cancelWork(userId);
      this.saveManager.markDirty('work');
      return result;
    });

    // 获取打工状态
    this._wrapHandler(IPC_CHANNELS.WORK_STATUS, (payload) => {
      this._ensureUser();
      const userId = this._getUserId(payload);
      return this.workSystem.getWorkStatus(userId);
    });

    // 完成打工
    this._wrapHandler(IPC_CHANNELS.WORK_FINISH, (payload) => {
      this._ensureUser();
      const userId = this._getUserId(payload);
      const result = this.workSystem.finishWork(userId);
      this.saveManager.markDirty('work');
      return result;
    });

    // 获取可用工作列表
    this._wrapHandler(IPC_CHANNELS.WORK_JOBS, (payload) => {
      this._ensureUser();
      const userId = this._getUserId(payload);
      const user = this.db.get('SELECT level FROM users WHERE id = ?', userId);
      const level = user ? user.level : 1;
      return this.workSystem.getAvailableJobs(level);
    });
  }

  // ══════════════════════════════════════════════
  // 技能系统
  // ══════════════════════════════════════════════

  _handleSkills() {
    // 获取技能列表
    this._wrapHandler(IPC_CHANNELS.SKILL_LIST, (payload) => {
      const userId = this._getUserId(payload);
      return this.skillSystem.getAllSkills(userId);
    });

    // 使用技能
    this._wrapHandler(IPC_CHANNELS.SKILL_USE, (payload) => {
      const userId = this._getUserId(payload);
      const skillType = payload?.skillType;
      if (!skillType) throw new Error('缺少技能类型');
      const result = this.skillSystem.useSkill(userId, skillType, payload?.context || {});
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
    // 签到检查
    this._wrapHandler(IPC_CHANNELS.SIGNIN_CHECK, (payload) => {
      this._ensureUser();
      const userId = this._getUserId(payload);
      return this.signInSystem.getSignInInfo(userId);
    });

    // 获取签到详情（含里程碑）
    this._wrapHandler(IPC_CHANNELS.SIGNIN_INFO, (payload) => {
      this._ensureUser();
      const userId = this._getUserId(payload);
      return this.signInSystem.getSignInInfo(userId);
    });

    // 执行签到
    this._wrapHandler(IPC_CHANNELS.SIGNIN_CLAIM, (payload) => {
      this._ensureUser();
      const userId = this._getUserId(payload);
      const result = this.signInSystem.signIn(userId);
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
      const userId = this._getUserId(payload);
      return this.miniGameManager.getGameList(userId);
    });

    // 开始游戏
    this._wrapHandler(IPC_CHANNELS.MINIGAME_START, (payload) => {
      const userId = this._getUserId(payload);
      const gameType = payload?.gameType;
      if (!gameType) throw new Error('缺少游戏类型');
      const result = this.miniGameManager.startGame(userId, gameType);
      if (!result.success) throw new Error(result.message || '开始失败');
      this.saveManager.markDirty('minigame');
      return result;
    });

    // 结束游戏
    this._wrapHandler(IPC_CHANNELS.MINIGAME_FINISH, (payload) => {
      const userId = this._getUserId(payload);
      const gameType = payload?.gameType;
      const score = payload?.score || 0;
      if (!gameType) throw new Error('缺少游戏类型');
      const result = this.miniGameManager.finishGame(userId, gameType, score);
      if (!result.success) throw new Error(result.message || '结算失败');
      this.saveManager.markDirty('minigame');
      return result;
    });

    // 获取游戏记录
    this._wrapHandler(IPC_CHANNELS.MINIGAME_RECORDS, (payload) => {
      const userId = this._getUserId(payload);
      const gameType = payload?.gameType || null;
      return this.miniGameManager.getGameRecords(userId, gameType);
    });

    // 石头剪刀布（专用 handler）
    this._wrapHandler(IPC_CHANNELS.MINIGAME_RPS, (payload) => {
      const userId = this._getUserId(payload);
      const playerChoice = payload?.playerChoice;
      const bet = payload?.bet || 50;
      if (!playerChoice) throw new Error('缺少出拳选择');
      const result = this.miniGameManager.playRps(userId, playerChoice, bet);
      // playRps 已返回 { success, data, error } 格式，_wrapHandler 会再包一层
      // 前端期望 result.data 是游戏数据，所以只返回 data 部分
      if (!result.success) throw new Error(result.error || '猜拳失败');
      this.saveManager.markDirty('minigame');
      return result.data;
    });

    // 食物反应结算
    this._wrapHandler(IPC_CHANNELS.MINIGAME_REWARD, (payload) => {
      const userId = this._getUserId(payload);
      const gameType = payload?.gameType || 'catch-food';
      const hitCount = payload?.hitCount || 0;
      if (gameType !== 'catch-food') throw new Error('仅支持 catch-food 类型');
      const result = this.miniGameManager.rewardCatchFood(userId, hitCount);
      if (!result.success) throw new Error(result.error || '结算失败');
      this.saveManager.markDirty('minigame');
      return result.data;
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
    this._wrapHandler(IPC_CHANNELS.USER_INFO, (payload) => {
      const userId = this._getUserId(payload);
      let user = this.db.get('SELECT * FROM users WHERE id = ?', userId);

      // 如果用户不存在，创建默认用户记录
      if (!user) {
        this.db.run(
          `INSERT INTO users (id, name, level, exp, gold, diamond, heart_coin, affection)
           VALUES (?, '主人', 1, 0, ${INITIAL_GOLD}, 0, 0, 0)`,
          userId,
        );
        user = this.db.get('SELECT * FROM users WHERE id = ?', userId);
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
      const userId = this._getUserId(payload);
      const updates = payload?.updates;
      if (!updates) throw new Error('缺少更新数据');
      const allowedFields = ['name', 'birth_date'];
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          this.db.run(`UPDATE users SET ${field} = ? WHERE id = ?`, updates[field], userId);
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

    // ─── 多语言 ───
    // 获取当前语言
    this._wrapHandler(IPC_CHANNELS.I18N_GET_LOCALE, () => {
      return this.i18n.getLocale();
    });

    // 设置语言
    this._wrapHandler(IPC_CHANNELS.I18N_SET_LOCALE, (payload) => {
      const locale = payload?.locale;
      if (!locale) throw new Error('缺少语言参数');
      this.i18n.setLocale(locale);
      return { locale: this.i18n.getLocale() };
    });

    // 翻译
    this._wrapHandler(IPC_CHANNELS.I18N_T, (payload) => {
      const key = payload?.key;
      if (!key) throw new Error('缺少翻译键');
      return this.i18n.t(key, payload.params);
    });

    // 获取支持的语言列表
    this._wrapHandler(IPC_CHANNELS.I18N_GET_SUPPORTED, () => {
      return this.i18n.getSupportedLocales();
    });

    // ─── 系统 ───
    // 重置存档（清除所有用户数据，保留道具定义）
    this._wrapHandler(IPC_CHANNELS.SYSTEM_RESET_SAVE, () => {
      // 清除用户数据表
      this.db.run('DELETE FROM inventory WHERE user_id = 1');
      this.db.run('DELETE FROM equipped WHERE pet_id = 1');
      this.db.run('DELETE FROM daily_tasks WHERE user_id = 1');
      this.db.run('DELETE FROM achievements WHERE user_id = 1');
      this.db.run('DELETE FROM game_records WHERE user_id = 1');
      this.db.run('DELETE FROM work_records WHERE user_id = 1');
      this.db.run('DELETE FROM event_log WHERE user_id = 1');
      this.db.run('DELETE FROM friends WHERE user_id = 1');

      // 重置用户数据为初始值
      this.db.run(
        'UPDATE users SET level = 1, exp = 0, gold = 500, diamond = 0, heart_coin = 0, affection = 0, birth_date = NULL WHERE id = 1',
      );

      // 重置宠物状态
      this.db.run(
        "UPDATE pet_status SET hunger = 80, hygiene = 80, mood = 80, stamina = 80, emotion = 'normal', state = 'idle', is_sick = 0, sick_since = NULL WHERE pet_id = 1",
      );

      // 重置技能
      this.db.run('UPDATE pet_skills SET level = 1, exp = 0, used_count = 0 WHERE pet_id = 1');

      // 重置签到
      this.db.run('UPDATE sign_in SET last_sign_date = NULL, consecutive_days = 0, total_days = 0 WHERE user_id = 1');

      // 清除内存中的状态
      this.petAI.resetState();
      this.saveManager.markDirty('petAI');

      return { success: true };
    });
  }
}

module.exports = IPCHandlers;
