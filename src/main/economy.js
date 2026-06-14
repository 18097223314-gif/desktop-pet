// ══════════════════════════════════════════════
// economy.js — 经济系统类
// 货币管理、背包管理、道具使用/出售、道具效果执行
// ══════════════════════════════════════════════

'use strict';

const { STAT_LIMITS, ITEM_EFFECT_TYPES, INVENTORY_CONFIG, SELL_PRICE_RATIO, HEAL_STAT_RATIO } = require('./constants');

class Economy {
  /**
   * @param {PetDatabase} database 数据库实例
   */
  constructor(database) {
    /** @type {PetDatabase} */
    this.db = database;
  }

  // ══════════════════════════════════════════════
  // 货币操作
  // ══════════════════════════════════════════════

  /**
   * 增加金币
   * @param {number} userId 用户ID
   * @param {number} amount 金额
   * @param {string} reason 原因（日志用）
   */
  addGold(userId, amount, reason) {
    this.db.run('UPDATE users SET gold = gold + ? WHERE id = ?', amount, userId);
    this._logTransaction(userId, 'gold_add', { amount, reason });
  }

  /**
   * 增加钻石
   * @param {number} userId 用户ID
   * @param {number} amount 金额
   * @param {string} reason 原因
   */
  addDiamond(userId, amount, reason) {
    this.db.run('UPDATE users SET diamond = diamond + ? WHERE id = ?', amount, userId);
    this._logTransaction(userId, 'diamond_add', { amount, reason });
  }

  /**
   * 增加心币
   * @param {number} userId 用户ID
   * @param {number} amount 金额
   * @param {string} reason 原因
   */
  addHeartCoin(userId, amount, reason) {
    this.db.run('UPDATE users SET heart_coin = heart_coin + ? WHERE id = ?', amount, userId);
    this._logTransaction(userId, 'heart_coin_add', { amount, reason });
  }

  /**
   * 花费金币
   * @param {number} userId 用户ID
   * @param {number} amount 金额
   * @returns {{ success: boolean, message: string }} 是否成功
   * @throws {Error} 金币不足时抛出错误
   */
  spendGold(userId, amount) {
    const user = this.db.get('SELECT gold FROM users WHERE id = ?', userId);
    if (!user || user.gold < amount) {
      throw new Error('金币不足');
    }
    this.db.run('UPDATE users SET gold = gold - ? WHERE id = ?', amount, userId);
    this._logTransaction(userId, 'gold_spend', { amount });
    return { success: true, message: '支付成功' };
  }

  /**
   * 获取用户余额
   * @param {number} userId 用户ID
   * @returns {{ gold: number, diamond: number, heartCoin: number }}
   */
  getBalance(userId) {
    const user = this.db.get('SELECT gold, diamond, heart_coin FROM users WHERE id = ?', userId);
    return {
      gold: user ? user.gold : 0,
      diamond: user ? user.diamond : 0,
      heartCoin: user ? user.heart_coin : 0,
    };
  }

  // ══════════════════════════════════════════════
  // 道具操作
  // ══════════════════════════════════════════════

  /**
   * 添加道具到背包
   * @param {number} userId 用户ID
   * @param {string} itemId 道具ID
   * @param {number} quantity 数量
   * @returns {{ success: boolean, message: string }}
   */
  addItem(userId, itemId, quantity = 1) {
    // 检查背包容量
    const totalItems = this._getInventoryCount(userId);
    const capacity = this._getInventoryCapacity(userId);

    if (totalItems >= capacity) {
      return { success: false, message: '背包已满，请先清理' };
    }

    // 查询道具信息
    const item = this.db.get('SELECT * FROM items WHERE id = ?', itemId);
    if (!item) {
      return { success: false, message: '道具不存在' };
    }

    // 插入或更新数量
    this.db.run(
      `INSERT INTO inventory (user_id, item_id, quantity) VALUES (?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + ?`,
      userId,
      itemId,
      quantity,
      quantity,
    );

    this._logTransaction(userId, 'item_add', { itemId, quantity });
    return { success: true, message: `获得 ${item.name} ×${quantity}` };
  }

  /**
   * 从背包移除道具
   * @param {number} userId 用户ID
   * @param {string} itemId 道具ID
   * @param {number} quantity 数量
   * @returns {{ success: boolean, message: string }}
   */
  removeItem(userId, itemId, quantity = 1) {
    const inv = this.db.get('SELECT * FROM inventory WHERE user_id = ? AND item_id = ?', userId, itemId);

    if (!inv || inv.quantity < quantity) {
      return { success: false, message: '道具数量不足' };
    }

    if (inv.quantity === quantity) {
      this.db.run('DELETE FROM inventory WHERE user_id = ? AND item_id = ?', userId, itemId);
    } else {
      this.db.run(
        'UPDATE inventory SET quantity = quantity - ? WHERE user_id = ? AND item_id = ?',
        quantity,
        userId,
        itemId,
      );
    }

    this._logTransaction(userId, 'item_remove', { itemId, quantity });
    return { success: true, message: '道具已移除' };
  }

  /**
   * 使用道具（触发效果）
   * @param {number} userId 用户ID
   * @param {string} itemId 道具ID
   * @returns {{ success: boolean, message: string, effects: Object }}
   */
  useItem(userId, itemId) {
    // 检查背包
    const inv = this.db.get('SELECT * FROM inventory WHERE user_id = ? AND item_id = ?', userId, itemId);
    if (!inv || inv.quantity <= 0) {
      return { success: false, message: '背包中没有该道具', effects: {} };
    }

    // 获取道具信息
    const item = this.db.get('SELECT * FROM items WHERE id = ?', itemId);
    if (!item) {
      return { success: false, message: '道具信息异常', effects: {} };
    }

    // 非消耗品不能"使用"（如服装需装备、材料用于合成）
    // toy 是非消耗品但可以直接使用（反复获得心情加成，不会消耗）
    if (item.type === 'material') {
      return { success: false, message: '该道具无法直接使用', effects: {} };
    }

    // 执行道具效果（传入userId，不再硬编码为1）
    const effects = this.executeItemEffect(userId, item);

    // 消耗道具（消耗品）
    if (item.is_consumable === 1) {
      this.removeItem(userId, itemId, 1);
    }

    this._logTransaction(userId, 'item_use', { itemId, itemName: item.name });
    return { success: true, message: `使用了 ${item.name}`, effects };
  }

  /**
   * 出售道具（30%回收价）
   * @param {number} userId 用户ID
   * @param {string} itemId 道具ID
   * @param {number} quantity 数量
   * @returns {{ success: boolean, message: string, goldReceived: number }}
   */
  sellItem(userId, itemId, quantity = 1) {
    const inv = this.db.get('SELECT * FROM inventory WHERE user_id = ? AND item_id = ?', userId, itemId);
    if (!inv || inv.quantity < quantity) {
      return { success: false, message: '道具数量不足', goldReceived: 0 };
    }

    const item = this.db.get('SELECT * FROM items WHERE id = ?', itemId);
    if (!item) {
      return { success: false, message: '道具信息异常', goldReceived: 0 };
    }

    // 30%回收价（至少1金币）
    const sellPrice = Math.max(1, Math.floor(item.price_gold * SELL_PRICE_RATIO * quantity));

    // 移除道具
    this.removeItem(userId, itemId, quantity);

    // 增加金币
    this.addGold(userId, sellPrice, `出售${item.name}×${quantity}`);

    this._logTransaction(userId, 'item_sell', { itemId, quantity, sellPrice });
    return {
      success: true,
      message: `出售 ${item.name} ×${quantity}，获得 ${sellPrice} 金币`,
      goldReceived: sellPrice,
    };
  }

  // ══════════════════════════════════════════════
  // 背包操作
  // ══════════════════════════════════════════════

  /**
   * 获取背包内容（含道具详情）
   * @param {number} userId 用户ID
   * @returns {Array} 道具列表
   */
  getInventory(userId) {
    const rows = this.db.all(
      `SELECT i.id AS inv_id, i.user_id, i.item_id, i.quantity, i.acquired_at,
              it.id AS item_def_id, it.name, it.type, it.rarity, it.description, it.effect_type,
              it.effect_value, it.price_gold, it.is_consumable
       FROM inventory i
       JOIN items it ON i.item_id = it.id
       WHERE i.user_id = ? AND i.quantity > 0
       ORDER BY it.type, it.rarity`,
      userId,
    );
    return rows;
  }

  /**
   * 扩展背包容量（+5格，花费金币）
   * @param {number} userId 用户ID
   * @returns {{ success: boolean, message: string, newCapacity: number }}
   */
  expandInventory(userId) {
    const currentCapacity = this._getInventoryCapacity(userId);
    if (currentCapacity >= INVENTORY_CONFIG.MAX_CAPACITY) {
      return { success: false, message: '背包已达最大容量', newCapacity: currentCapacity };
    }

    // 计算费用（每次递增）
    const expandCount = Math.floor(
      (currentCapacity - INVENTORY_CONFIG.DEFAULT_CAPACITY) / INVENTORY_CONFIG.EXPAND_AMOUNT,
    );
    const cost = INVENTORY_CONFIG.EXPAND_COST * (expandCount + 1);

    try {
      this.spendGold(userId, cost);
    } catch (err) {
      return { success: false, message: `金币不足，需要 ${cost} 金币`, newCapacity: currentCapacity };
    }

    // 记录扩容并更新 users 表的 inventory_capacity 字段
    const newCapacity = currentCapacity + INVENTORY_CONFIG.EXPAND_AMOUNT;
    this.db.run('UPDATE users SET inventory_capacity = ? WHERE id = ?', newCapacity, userId);
    this._logTransaction(userId, 'inventory_expand', { from: currentCapacity, to: newCapacity, cost });

    return { success: true, message: `背包扩容成功！${currentCapacity} → ${newCapacity}`, newCapacity };
  }

  /**
   * 整理背包（按指定方式排序）
   * @param {number} userId 用户ID
   * @param {string} sortBy 排序方式 type/rarity/name
   * @param {string} sortOrder 排序方向 ASC/DESC
   * @returns {Array} 排序后的道具列表
   */
  sortInventory(userId, sortBy = 'type', sortOrder = 'ASC') {
    // ─── 白名单校验，防止 SQL 注入 ───
    const ALLOWED_SORT_FIELDS = ['name', 'type', 'rarity', 'quantity', 'acquired_at'];
    const ALLOWED_SORT_ORDERS = ['ASC', 'DESC'];

    if (!ALLOWED_SORT_FIELDS.includes(sortBy)) {
      sortBy = 'acquired_at';
    }
    if (!ALLOWED_SORT_ORDERS.includes(sortOrder.toUpperCase())) {
      sortOrder = 'DESC';
    }
    sortOrder = sortOrder.toUpperCase();

    // 构建 ORDER BY 子句（字段名已通过白名单校验，可安全拼接）
    let orderBy;
    switch (sortBy) {
      case 'rarity':
        orderBy = `CASE it.rarity
                    WHEN 'common' THEN 1
                    WHEN 'uncommon' THEN 2
                    WHEN 'rare' THEN 3
                    WHEN 'epic' THEN 4
                    WHEN 'legendary' THEN 5
                    END ${sortOrder}, it.type`;
        break;
      case 'name':
        orderBy = `it.name ${sortOrder}`;
        break;
      case 'quantity':
        orderBy = `i.quantity ${sortOrder}, it.type`;
        break;
      case 'acquired_at':
        orderBy = `i.acquired_at ${sortOrder}`;
        break;
      case 'type':
      default:
        orderBy = `it.type ${sortOrder}, it.rarity ${sortOrder}`;
        break;
    }

    const rows = this.db.all(
      `SELECT i.*, it.name, it.type, it.rarity, it.description, it.effect_type,
              it.effect_value, it.price_gold, it.is_consumable
       FROM inventory i
       JOIN items it ON i.item_id = it.id
       WHERE i.user_id = ? AND i.quantity > 0
       ORDER BY ${orderBy}`,
      userId,
    );
    return rows;
  }

  // ══════════════════════════════════════════════
  // 道具效果执行
  // ══════════════════════════════════════════════

  /**
   * 执行道具效果
   * @param {number} userId 用户ID（用于DB操作，不再硬编码为1）
   * @param {Object} item 道具数据行
   * @returns {Object} 效果结果（含对pet_status的变更，由调用方通过petAI.setStatusField写入）
   *
   * 修复说明：
   * - userId 不再硬编码 WHERE id = 1
   * - 宠物属性变更通过返回值传递给调用方（petAI.setStatusField），
   *   不再直接修改 petStatus 对象引用（useItem 场景下 petStatus 为 null，修改会丢失）
   */
  executeItemEffect(userId, item) {
    const effects = {};
    const petStatChanges = {}; // 收集宠物属性变更，由调用方写入
    const effectType = item.effect_type;
    const effectValue = item.effect_value || 0;

    switch (effectType) {
      case ITEM_EFFECT_TYPES.HUNGER:
        petStatChanges.hunger = effectValue;
        effects.hunger = effectValue;
        break;
      case ITEM_EFFECT_TYPES.HYGIENE:
        petStatChanges.hygiene = effectValue;
        effects.hygiene = effectValue;
        break;
      case ITEM_EFFECT_TYPES.MOOD:
        petStatChanges.mood = effectValue;
        effects.mood = effectValue;
        break;
      case ITEM_EFFECT_TYPES.STAMINA:
        petStatChanges.stamina = effectValue;
        effects.stamina = effectValue;
        break;
      case ITEM_EFFECT_TYPES.HEAL:
        petStatChanges.heal = true;
        petStatChanges.hunger = effectValue * HEAL_STAT_RATIO;
        petStatChanges.hygiene = effectValue * HEAL_STAT_RATIO;
        effects.heal = effectValue;
        break;
      case ITEM_EFFECT_TYPES.ALL_STATS:
        petStatChanges.hunger = effectValue;
        petStatChanges.hygiene = effectValue;
        petStatChanges.mood = effectValue;
        petStatChanges.stamina = effectValue;
        effects.allStats = effectValue;
        break;
      case ITEM_EFFECT_TYPES.EXP:
        this.db.run('UPDATE users SET exp = exp + ? WHERE id = ?', userId, effectValue);
        effects.exp = effectValue;
        break;
      case ITEM_EFFECT_TYPES.GOLD:
        this.db.run('UPDATE users SET gold = gold + ? WHERE id = ?', userId, effectValue);
        effects.gold = effectValue;
        break;
      case ITEM_EFFECT_TYPES.AFFECTION:
        this.db.run('UPDATE users SET affection = affection + ? WHERE id = ?', userId, effectValue);
        effects.affection = effectValue;
        break;
      case ITEM_EFFECT_TYPES.SPECIAL:
        // 特殊道具：由具体逻辑处理
        effects.special = true;
        break;
      default:
        break;
    }

    effects._petStatChanges = petStatChanges;
    return effects;
  }

  /**
   * 获取商店道具列表
   * @param {string} type 道具类型过滤（可选）
   * @returns {Array} 可购买的道具列表
   */
  getShopItems(type = null) {
    if (type) {
      return this.db.all(
        'SELECT * FROM items WHERE (price_gold > 0 OR price_diamond > 0) AND type = ? ORDER BY price_gold DESC, price_diamond DESC, rarity DESC',
        type,
      );
    }
    return this.db.all(
      'SELECT * FROM items WHERE (price_gold > 0 OR price_diamond > 0) ORDER BY type, price_gold DESC, price_diamond DESC, rarity DESC',
    );
  }

  /**
   * 购买道具
   * @param {number} userId 用户ID
   * @param {string} itemId 道具ID
   * @param {number} quantity 数量
   * @returns {{ success: boolean, message: string }}
   */
  buyItem(userId, itemId, quantity = 1) {
    const item = this.db.get('SELECT * FROM items WHERE id = ?', itemId);
    if (!item) {
      return { success: false, message: '道具不存在' };
    }

    // 计算总价
    const totalGold = item.price_gold * quantity;
    const totalDiamond = item.price_diamond * quantity;

    // 检查余额
    const balance = this.getBalance(userId);
    if (totalGold > 0 && balance.gold < totalGold) {
      return { success: false, message: '金币不足' };
    }
    if (totalDiamond > 0 && balance.diamond < totalDiamond) {
      return { success: false, message: '钻石不足' };
    }

    // 事务：扣款+加道具必须原子操作，防止扣钱成功道具没到账
    try {
      this.db.transaction(() => {
        // 扣款
        if (totalGold > 0) {
          this.spendGold(userId, totalGold);
        }
        if (totalDiamond > 0) {
          this.db.run('UPDATE users SET diamond = diamond - ? WHERE id = ?', totalDiamond, userId);
        }

        // 添加道具
        this.addItem(userId, itemId, quantity);
      });
    } catch (err) {
      this._logTransaction(userId, 'item_buy_failed', {
        itemId,
        quantity,
        totalGold,
        totalDiamond,
        error: err.message,
      });
      return { success: false, message: '购买失败，交易已回滚' };
    }

    this._logTransaction(userId, 'item_buy', { itemId, quantity, totalGold, totalDiamond });
    return { success: true, message: `购买成功: ${item.name} ×${quantity}` };
  }

  // ══════════════════════════════════════════════
  // 私有方法
  // ══════════════════════════════════════════════

  /**
   * 获取背包中道具种类数
   * @private
   */
  _getInventoryCount(userId) {
    const row = this.db.get('SELECT COUNT(*) as count FROM inventory WHERE user_id = ? AND quantity > 0', userId);
    return row ? row.count : 0;
  }

  /**
   * 获取背包容量（从 users 表 inventory_capacity 字段读取）
   * @private
   */
  _getInventoryCapacity(userId) {
    const row = this.db.get('SELECT inventory_capacity FROM users WHERE id = ?', userId);
    if (row && row.inventory_capacity) {
      return row.inventory_capacity;
    }
    return INVENTORY_CONFIG.DEFAULT_CAPACITY;
  }

  /**
   * 记录交易日志
   * @private
   */
  _logTransaction(userId, type, data) {
    try {
      const eventType = `economy_${type || 'unknown'}`;
      this.db.run(
        'INSERT INTO event_log (user_id, event_type, event_data) VALUES (?, ?, ?)',
        userId,
        eventType,
        JSON.stringify(data),
      );
    } catch (err) {
      console.error('[Economy] 日志记录失败:', err.message);
    }
  }
}

module.exports = Economy;
