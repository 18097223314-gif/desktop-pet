// ══════════════════════════════════════════════
// test-runner.js — 爪爪桌宠测试框架
// Node.js 原生 assert，零依赖
// 用法：node test/test-runner.js
// ══════════════════════════════════════════════

'use strict';

const assert = require('assert');

// ─── 颜色输出 ───
const C = {
  green: s => `\x1b[32m${s}\x1b[0m`,
  red: s => `\x1b[31m${s}\x1b[0m`,
  dim: s => `\x1b[2m${s}\x1b[0m`,
  bold: s => `\x1b[1m${s}\x1b[0m`,
};

// ══════════════════════════════════════════════
// Mock 数据库（内存表，支持参数化 SQL）
// ══════════════════════════════════════════════
class MockDatabase {
  constructor() {
    this._tables = {};
    this._nextId = 1;
  }

  _ensure(t) { if (!this._tables[t]) this._tables[t] = []; }

  // 直接插入测试数据
  _seed(table, row) {
    this._ensure(table);
    const r = { ...row, _id: this._nextId++ };
    this._tables[table].push(r);
    return r._id;
  }

  // 查询单行
  get(sql, ...params) {
    const rows = this.all(sql, ...params);
    return rows[0] || undefined;
  }

  // 查询多行
  all(sql, ...params) {
    const m = sql.match(/FROM\s+(\w+)/i);
    if (!m) return [];
    const table = m[1];
    this._ensure(table);
    let rows = [...this._tables[table]];

    // WHERE 过滤
    const wm = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
    if (wm) rows = this._filter(rows, wm[1], params);

    // COUNT(*) 特殊处理
    if (/COUNT\(\*\)/i.test(sql)) {
      const col = sql.match(/COUNT\(\*\)\s+(?:AS\s+)?(\w+)/i);
      const key = col ? col[1] : 'cnt';
      return [{ [key]: rows.length }];
    }

    return rows;
  }

  // 执行写操作
  run(sql, ...params) {
    const up = sql.trim().toUpperCase();
    if (up.startsWith('INSERT')) return this._insert(sql, params);
    if (up.startsWith('UPDATE')) return this._update(sql, params);
    if (up.startsWith('DELETE')) return this._del(sql, params);
    return { changes: 0, lastInsertRowid: 0 };
  }

  // 事务支持（简化：直接执行回调）
  transaction(fn) { fn(); }

  close() {}

  // ─── INSERT ───
  _insert(sql, params) {
    // INSERT OR IGNORE INTO table (cols) VALUES (vals)
    // ON CONFLICT(...) DO UPDATE SET ...
    const tm = sql.match(/INTO\s+(\w+)/i);
    if (!tm) return { changes: 0, lastInsertRowid: 0 };
    const table = tm[1];
    this._ensure(table);

    // 检查 ON CONFLICT ... DO UPDATE
    const conflictMatch = sql.match(/ON\s+CONFLICT\s*\(([^)]+)\)\s+DO\s+UPDATE\s+SET\s+(.+?)(?:\s*$)/i);
    if (conflictMatch) {
      const conflictCols = conflictMatch[1].split(',').map(c => c.trim());
      const setClause = conflictMatch[2].trim();
      // 解析列
      const cm = sql.match(/\(([^)]+)\)\s*VALUES/i);
      if (!cm) return { changes: 0, lastInsertRowid: 0 };
      const cols = cm[1].split(',').map(c => c.trim());
      const vals = {};
      cols.forEach((c, i) => { if (i < params.length) vals[c] = params[i]; });

      // 查找已有行
      const existing = this._tables[table].find(row =>
        conflictCols.every(c => row[c] === vals[c])
      );
      if (existing) {
        // UPDATE：处理 quantity = quantity + ? 模式
        const addMatch = setClause.match(/(\w+)\s*=\s*(\w+)\s*\+\s*\?/);
        if (addMatch) {
          existing[addMatch[1]] = (existing[addMatch[1]] || 0) + params[params.length - 1];
        }
        return { changes: 1, lastInsertRowid: existing._id };
      }
      // 不存在则插入
      return this._doInsert(table, sql, params);
    }

    return this._doInsert(table, sql, params);
  }

  _doInsert(table, sql, params) {
    const cm = sql.match(/\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!cm) return { changes: 0, lastInsertRowid: 0 };
    const cols = cm[1].split(',').map(c => c.trim());
    const valExprs = cm[2].split(',').map(v => v.trim());
    const row = {};
    let paramIdx = 0;
    cols.forEach((col, i) => {
      const expr = valExprs[i];
      if (expr === '?') {
        row[col] = params[paramIdx++];
      } else if (expr === 'CURRENT_TIMESTAMP' || expr.startsWith('datetime')) {
        row[col] = new Date().toISOString();
      } else {
        // 字面量（数字或字符串）
        const num = Number(expr);
        row[col] = isNaN(num) ? expr.replace(/'/g, '') : num;
      }
    });
    const id = this._nextId++;
    row._id = id;
    this._tables[table].push(row);
    return { changes: 1, lastInsertRowid: id };
  }

  // ─── UPDATE ───
  _update(sql, params) {
    const tm = sql.match(/UPDATE\s+(\w+)/i);
    if (!tm) return { changes: 0 };
    const table = tm[1];
    this._ensure(table);

    // 分离 SET 和 WHERE
    const setWhere = sql.match(/SET\s+(.+?)\s+WHERE\s+(.+)$/i);
    if (!setWhere) return { changes: 0 };
    const setClause = setWhere[1];
    const whereClause = setWhere[2];

    // 参数按 SQL 中 ? 出现顺序分配：SET 在前，WHERE 在后
    const setParamCount = (setClause.match(/\?/g) || []).length;

    let changes = 0;
    for (const row of this._tables[table]) {
      if (!this._matchWhere(row, whereClause, params, setParamCount)) continue;
      this._applySet(row, setClause, params, 0);
      changes++;
    }
    return { changes, lastInsertRowid: 0 };
  }

  _applySet(row, clause, params, offset = 0) {
    const assignments = clause.split(',').map(s => s.trim());
    let paramIdx = offset;
    // 数一下 WHERE 前面用了几个参数
    for (const a of assignments) {
      // gold = gold + ?  /  gold = gold - ?  /  col = ?
      const addM = a.match(/^(\w+)\s*=\s*(\w+)\s*\+\s*\?$/);
      const subM = a.match(/^(\w+)\s*=\s*(?:MAX\(\d+,\s*)?(\w+)\s*-\s*\?(?:\))?$/);
      const setM = a.match(/^(\w+)\s*=\s*\?$/);
      const litM = a.match(/^(\w+)\s*=\s*'([^']*)'$/);
      const numM = a.match(/^(\w+)\s*=\s*(\d+)$/);
      const funcM = a.match(/^(\w+)\s*=\s*(?:datetime|CURRENT_TIMESTAMP)/i);

      if (addM) {
        row[addM[1]] = (row[addM[1]] || 0) + params[paramIdx++];
      } else if (subM) {
        row[subM[1]] = Math.max(0, (row[subM[1]] || 0) - params[paramIdx++]);
      } else if (setM) {
        row[setM[1]] = params[paramIdx++];
      } else if (litM) {
        row[litM[1]] = litM[2];
      } else if (numM) {
        row[numM[1]] = Number(numM[2]);
      } else if (funcM) {
        // 跳过 datetime 等函数调用
        paramIdx++;
      }
    }
  }

  // ─── DELETE ───
  _del(sql, params) {
    const tm = sql.match(/FROM\s+(\w+)/i);
    if (!tm) return { changes: 0 };
    const table = tm[1];
    this._ensure(table);
    const wm = sql.match(/WHERE\s+(.+)$/i);
    const before = this._tables[table].length;
    this._tables[table] = this._tables[table].filter(row =>
      wm ? !this._matchWhere(row, wm[1], params) : true
    );
    return { changes: before - this._tables[table].length };
  }

  // ─── 过滤行 ───
  _filter(rows, clause, params, offset = 0) {
    return rows.filter(row => this._matchWhere(row, clause, params, offset));
  }

  // ─── WHERE 匹配 ───
  _matchWhere(row, clause, params, offset = 0) {
    const conds = clause.split(/\s+AND\s+/i);
    let pi = offset;
    for (const cond of conds) {
      // col = ?
      const qm = cond.match(/^(\w+)\s*=\s*\?$/);
      if (qm) {
        if (row[qm[1]] !== params[pi++]) return false;
        continue;
      }
      // col = 'literal'
      const lm = cond.match(/^(\w+)\s*=\s*'([^']*)'$/);
      if (lm) {
        if (row[lm[1]] !== lm[2]) return false;
        continue;
      }
      // col = number
      const nm = cond.match(/^(\w+)\s*=\s*(\d+)$/);
      if (nm) {
        if (row[nm[1]] !== Number(nm[2])) return false;
        continue;
      }
    }
    return true;
  }
}

// ══════════════════════════════════════════════
// Mock Economy
// ══════════════════════════════════════════════
class MockEconomy {
  constructor(db) { this.db = db; this.calls = []; }

  addGold(userId, amount, reason) {
    this.calls.push({ method: 'addGold', userId, amount, reason });
    this.db.run('UPDATE users SET gold = gold + ? WHERE id = ?', amount, userId);
  }

  spendGold(userId, amount) {
    this.calls.push({ method: 'spendGold', userId, amount });
    const user = this.db.get('SELECT gold FROM users WHERE id = ?', userId);
    if (!user || user.gold < amount) throw new Error('金币不足');
    this.db.run('UPDATE users SET gold = gold - ? WHERE id = ?', amount, userId);
    return { success: true };
  }

  addDiamond(userId, amount, reason) {
    this.calls.push({ method: 'addDiamond', userId, amount, reason });
    this.db.run('UPDATE users SET diamond = diamond + ? WHERE id = ?', amount, userId);
  }

  addItem(userId, itemId, quantity) {
    this.calls.push({ method: 'addItem', userId, itemId, quantity });
    return { success: true };
  }

  getBalance(userId) {
    const u = this.db.get('SELECT gold, diamond, heart_coin FROM users WHERE id = ?', userId);
    return { gold: u?.gold || 0, diamond: u?.diamond || 0, heartCoin: u?.heart_coin || 0 };
  }
}

// ══════════════════════════════════════════════
// Mock Timer
// ══════════════════════════════════════════════
class MockTimer {
  constructor() { this._t = new Map(); }
  add(id, fn, ms) { this._t.set(id, { fn, ms }); }
  has(id) { return this._t.has(id); }
  destroy(id) { this._t.delete(id); }
  destroyAll() { this._t.clear(); }
}

// ══════════════════════════════════════════════
// 测试运行器
// ══════════════════════════════════════════════
let total = 0, passed = 0, failed = 0;
const fails = [];
const asyncTests = [];

function test(name, fn) {
  total++;
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      const p = result
        .then(() => { passed++; console.log(`  ${C.green('✓')} ${C.dim(name)}`); })
        .catch(e => { failed++; fails.push({ name, error: e }); console.log(`  ${C.red('✗')} ${name}\n    ${C.red(e.message)}`); });
      asyncTests.push(p);
    } else {
      passed++;
      console.log(`  ${C.green('✓')} ${C.dim(name)}`);
    }
  } catch (e) {
    failed++;
    fails.push({ name, error: e });
    console.log(`  ${C.red('✗')} ${name}`);
    console.log(`    ${C.red(e.message)}`);
  }
}

function suite(name, fn) {
  console.log(`\n${C.bold(name)}`);
  fn();
}

// ══════════════════════════════════════════════
// Economy 测试
// ══════════════════════════════════════════════
function testEconomy() {
  const Economy = require('../src/main/economy');

  suite('Economy — 金币操作', () => {
    test('addGold 增加金币', () => {
      const db = new MockDatabase();
      db._seed('users', { id: 1, gold: 100, diamond: 0, heart_coin: 0 });
      const eco = new Economy(db);
      eco.addGold(1, 50, '测试');
      const user = db.get('SELECT gold FROM users WHERE id = ?', 1);
      assert.ok(user, '用户应存在');
      assert.strictEqual(user.gold, 150, `期望150，实际${user.gold}`);
    });

    test('spendGold 扣除金币', () => {
      const db = new MockDatabase();
      db._seed('users', { id: 1, gold: 100, diamond: 0, heart_coin: 0 });
      const eco = new Economy(db);
      eco.spendGold(1, 30);
      assert.strictEqual(db.get('SELECT gold FROM users WHERE id = ?', 1).gold, 70);
    });

    test('spendGold 金币不足抛错', () => {
      const db = new MockDatabase();
      db._seed('users', { id: 1, gold: 10, diamond: 0, heart_coin: 0 });
      const eco = new Economy(db);
      assert.throws(() => eco.spendGold(1, 100), /金币不足/);
    });

    test('spendGold 不会变负数', () => {
      const db = new MockDatabase();
      db._seed('users', { id: 1, gold: 50, diamond: 0, heart_coin: 0 });
      const eco = new Economy(db);
      assert.throws(() => eco.spendGold(1, 100), /金币不足/);
      assert.strictEqual(db.get('SELECT gold FROM users WHERE id = ?', 1).gold, 50);
    });
  });

  suite('Economy — 道具操作', () => {
    test('addItem 添加道具', () => {
      const db = new MockDatabase();
      db._seed('users', { id: 1, gold: 100, diamond: 0, heart_coin: 0 });
      db._seed('items', { id: 'food_kibble', name: '猫粮', type: 'food', rarity: 'common', price_gold: 50, price_diamond: 0, effect_type: 'hunger', effect_value: 25, is_consumable: 1, max_stack: 99 });
      const eco = new Economy(db);
      const r = eco.addItem(1, 'food_kibble', 3);
      assert.strictEqual(r.success, true);
    });

    test('removeItem 数量不足返回失败', () => {
      const db = new MockDatabase();
      db._seed('users', { id: 1, gold: 100, diamond: 0, heart_coin: 0 });
      db._seed('inventory', { id: 1, user_id: 1, item_id: 'food_kibble', quantity: 1 });
      const eco = new Economy(db);
      const r = eco.removeItem(1, 'food_kibble', 5);
      assert.strictEqual(r.success, false);
    });

    test('useItem 材料类不能使用', () => {
      const db = new MockDatabase();
      db._seed('users', { id: 1, gold: 100, diamond: 0, heart_coin: 0 });
      db._seed('items', { id: 'mat_crystal', name: '水晶', type: 'material', rarity: 'uncommon', price_gold: 0, price_diamond: 0, effect_type: null, effect_value: 0, is_consumable: 1, max_stack: 99 });
      db._seed('inventory', { id: 1, user_id: 1, item_id: 'mat_crystal', quantity: 5 });
      const eco = new Economy(db);
      const r = eco.useItem(1, 'mat_crystal');
      assert.strictEqual(r.success, false);
    });

    test('useItem 材料类不能使用', () => {
      const db = new MockDatabase();
      db._seed('users', { id: 1, gold: 100, diamond: 0, heart_coin: 0 });
      db._seed('items', { id: 'mat_crystal', name: '水晶碎片', type: 'material', rarity: 'common', price_gold: 0, price_diamond: 0, effect_type: null, effect_value: 0, is_consumable: 1, max_stack: 99 });
      db._seed('inventory', { id: 1, user_id: 1, item_id: 'mat_crystal', quantity: 1 });
      const eco = new Economy(db);
      const r = eco.useItem(1, 'mat_crystal');
      assert.strictEqual(r.success, false);
    });
  });

  suite('Economy — 购买', () => {
    test('buyItem 成功购买', () => {
      const db = new MockDatabase();
      db._seed('users', { id: 1, gold: 500, diamond: 0, heart_coin: 0 });
      db._seed('items', { id: 'food_kibble', name: '猫粮', type: 'food', rarity: 'common', price_gold: 50, price_diamond: 0, effect_type: 'hunger', effect_value: 25, is_consumable: 1, max_stack: 99 });
      const eco = new Economy(db);
      const r = eco.buyItem(1, 'food_kibble', 2);
      assert.strictEqual(r.success, true);
    });

    test('buyItem 金币不足返回失败', () => {
      const db = new MockDatabase();
      db._seed('users', { id: 1, gold: 10, diamond: 0, heart_coin: 0 });
      db._seed('items', { id: 'food_steak', name: '牛排', type: 'food', rarity: 'rare', price_gold: 300, price_diamond: 0, effect_type: 'hunger', effect_value: 70, is_consumable: 1, max_stack: 30 });
      const eco = new Economy(db);
      const r = eco.buyItem(1, 'food_steak');
      assert.strictEqual(r.success, false);
    });
  });
}

// ══════════════════════════════════════════════
// SignIn 测试
// ══════════════════════════════════════════════
function testSignIn() {
  const SignInSystem = require('../src/main/sign-in');

  suite('SignIn — 基础签到', () => {
    test('首次签到成功', () => {
      const db = new MockDatabase();
      db._seed('users', { id: 1, gold: 100, diamond: 0, heart_coin: 0, exp: 0 });
      // sign_in 表为空 → 首次签到走 INSERT 分支
      const eco = new MockEconomy(db);
      const signIn = new SignInSystem(db, eco);
      const r = signIn.signIn(1);
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.consecutiveDays, 1);
    });

    test('重复签到返回失败', () => {
      const db = new MockDatabase();
      const today = new Date().toISOString().slice(0, 10);
      db._seed('users', { id: 1, gold: 100, diamond: 0, heart_coin: 0, exp: 0 });
      db._seed('sign_in', { user_id: 1, last_sign_date: today, consecutive_days: 1, total_days: 1 });
      const eco = new MockEconomy(db);
      const signIn = new SignInSystem(db, eco);
      const r = signIn.signIn(1);
      assert.strictEqual(r.success, false);
      assert.strictEqual(r.todaySigned, true);
    });
  });

  suite('SignIn — 连续签到', () => {
    test('连续签到天数递增', () => {
      const db = new MockDatabase();
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      db._seed('users', { id: 1, gold: 100, diamond: 0, heart_coin: 0, exp: 0 });
      db._seed('sign_in', { user_id: 1, last_sign_date: yesterday, consecutive_days: 3, total_days: 3 });
      const eco = new MockEconomy(db);
      const signIn = new SignInSystem(db, eco);
      const r = signIn.signIn(1);
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.consecutiveDays, 4);
    });

    test('断签后连续天数重置为1', () => {
      const db = new MockDatabase();
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
      db._seed('users', { id: 1, gold: 100, diamond: 0, heart_coin: 0, exp: 0 });
      db._seed('sign_in', { user_id: 1, last_sign_date: threeDaysAgo, consecutive_days: 10, total_days: 15 });
      const eco = new MockEconomy(db);
      const signIn = new SignInSystem(db, eco);
      const r = signIn.signIn(1);
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.consecutiveDays, 1);
    });
  });

  suite('SignIn — 奖励计算', () => {
    test('第1天奖励 gold=100 exp=20', () => {
      const db = new MockDatabase();
      db._seed('users', { id: 1, gold: 100, diamond: 0, heart_coin: 0, exp: 0 });
      const eco = new MockEconomy(db);
      const signIn = new SignInSystem(db, eco);
      const r = signIn.signIn(1);
      assert.strictEqual(r.reward.gold, 100);
      assert.strictEqual(r.reward.exp, 20);
    });

    test('连续7天奖励含道具', () => {
      const db = new MockDatabase();
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      db._seed('users', { id: 1, gold: 100, diamond: 0, heart_coin: 0, exp: 0 });
      db._seed('sign_in', { user_id: 1, last_sign_date: yesterday, consecutive_days: 6, total_days: 6 });
      const eco = new MockEconomy(db);
      const signIn = new SignInSystem(db, eco);
      const r = signIn.signIn(1);
      assert.strictEqual(r.consecutiveDays, 7);
      assert.strictEqual(r.reward.gold, 500);
      assert.strictEqual(r.reward.item, 'toy_rubiks_cube');
    });
  });
}

// ══════════════════════════════════════════════
// Work 测试
// ══════════════════════════════════════════════
function testWork() {
  const WorkSystem = require('../src/main/work');

  function makeWorkEnv() {
    const db = new MockDatabase();
    db._seed('users', { id: 1, gold: 500, level: 10, diamond: 0, heart_coin: 0, exp: 0 });
    db._seed('pet_status', { pet_id: 1, hunger: 80, hygiene: 80, mood: 80, stamina: 80, is_sick: 0 });
    db._seed('pet_skills', { pet_id: 1, skill_type: 'gathering', level: 1 });
    const eco = new MockEconomy(db);
    const timer = new MockTimer();
    const work = new WorkSystem(db, eco, timer);
    return { db, eco, timer, work };
  }

  suite('Work — 开始打工', () => {
    test('正常开始打工', () => {
      const { work } = makeWorkEnv();
      const r = work.startWork(1, 'leaflet');
      assert.strictEqual(r.success, true);
      assert.ok(r.finishTime > Date.now());
    });

    test('等级不足返回失败', () => {
      const { db, work } = makeWorkEnv();
      // 把等级改为1
      const user = db.get('SELECT * FROM users WHERE id = ?', 1);
      user.level = 1;
      const r = work.startWork(1, 'actor'); // minLevel: 5
      assert.strictEqual(r.success, false);
      assert.match(r.message, /级/);
    });

    test('体力不足返回失败', () => {
      const { db, work } = makeWorkEnv();
      const pet = db.get('SELECT * FROM pet_status WHERE pet_id = 1');
      pet.stamina = 3;
      const r = work.startWork(1, 'leaflet'); // staminaCost: 10
      assert.strictEqual(r.success, false);
      assert.match(r.message, /体力/);
    });

    test('生病返回失败', () => {
      const { db, work } = makeWorkEnv();
      const pet = db.get('SELECT * FROM pet_status WHERE pet_id = 1');
      pet.is_sick = 1;
      const r = work.startWork(1, 'leaflet');
      assert.strictEqual(r.success, false);
      assert.match(r.message, /生病/);
    });

    test('已在打工返回失败', () => {
      const { work } = makeWorkEnv();
      work.startWork(1, 'leaflet');
      const r = work.startWork(1, 'waiter');
      assert.strictEqual(r.success, false);
      assert.match(r.message, /打工中/);
    });
  });

  suite('Work — 取消打工', () => {
    test('取消扣除20%惩罚', () => {
      const { work } = makeWorkEnv();
      work.startWork(1, 'leaflet');
      const r = work.cancelWork(1);
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.penalty, 40); // 200 * 0.2
    });

    test('没有打工时取消返回失败', () => {
      const { work } = makeWorkEnv();
      const r = work.cancelWork(1);
      assert.strictEqual(r.success, false);
    });
  });

  suite('Work — 完成打工', () => {
    test('完成获得金币奖励', () => {
      const { work } = makeWorkEnv();
      work.startWork(1, 'leaflet');
      const r = work.finishWork(1);
      assert.strictEqual(r.success, true);
      assert.ok(r.reward.gold > 0);
    });

    test('没有打工时完成返回失败', () => {
      const { work } = makeWorkEnv();
      const r = work.finishWork(1);
      assert.strictEqual(r.success, false);
    });
  });
}

// ══════════════════════════════════════════════
// MiniGame 测试
// ══════════════════════════════════════════════
function testMiniGame() {
  const MiniGameManager = require('../src/main/mini-game');

  function makeGameEnv() {
    const db = new MockDatabase();
    db._seed('users', { id: 1, gold: 1000, diamond: 0, heart_coin: 0, exp: 0 });
    db._seed('pet_status', { pet_id: 1, hunger: 80, hygiene: 80, mood: 80, stamina: 80, is_sick: 0 });
    const eco = new MockEconomy(db);
    const timer = new MockTimer();
    const mg = new MiniGameManager(db, eco, timer);
    return { db, eco, timer, mg };
  }

  suite('MiniGame — 石头剪刀布', () => {
    test('有效出拳返回结果', () => {
      const { mg } = makeGameEnv();
      const r = mg.playRps(1, 'rock', 50);
      assert.strictEqual(r.success, true);
      assert.ok(['win', 'lose', 'draw'].includes(r.data.result));
    });

    test('无效出拳返回失败', () => {
      const { mg } = makeGameEnv();
      const r = mg.playRps(1, 'lizard', 50);
      assert.strictEqual(r.success, false);
    });

    test('下注<10返回失败', () => {
      const { mg } = makeGameEnv();
      const r = mg.playRps(1, 'rock', 5);
      assert.strictEqual(r.success, false);
    });

    test('金币不足返回失败', () => {
      const { db, mg } = makeGameEnv();
      db.get('SELECT * FROM users WHERE id = ?', 1).gold = 10;
      const r = mg.playRps(1, 'rock', 50);
      assert.strictEqual(r.success, false);
    });

    test('赢时金币+2倍下注', () => {
      const { db, mg } = makeGameEnv();
      // mock Math.random 让 CPU 出 scissors，player 出 rock 必赢
      const orig = Math.random;
      Math.random = () => 1 / 3; // → floor(1/3*3)=1 → scissors
      try {
        db.get('SELECT * FROM users WHERE id = ?', 1).gold = 1000;
        const r = mg.playRps(1, 'rock', 10);
        assert.strictEqual(r.success, true);
        assert.strictEqual(r.data.result, 'win');
        assert.strictEqual(r.data.goldEarned, 20);
      } finally {
        Math.random = orig;
      }
    });
  });

  suite('MiniGame — 食物反应', () => {
    test('正常结算返回奖励', () => {
      const { mg } = makeGameEnv();
      const r = mg.rewardCatchFood(1, 3);
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.data.hitCount, 3);
      assert.strictEqual(r.data.goldReward, 45);
    });

    test('hitCount>5 被截断为5', () => {
      const { mg } = makeGameEnv();
      const r = mg.rewardCatchFood(1, 99);
      assert.strictEqual(r.data.hitCount, 5);
    });
  });
}

// ══════════════════════════════════════════════
// Database 测试
// ══════════════════════════════════════════════
function testDatabase() {
  const PetDatabase = require('../src/main/database');
  const os = require('os');
  const path = require('path');
  const fs = require('fs');

  function createDb() {
    const tmpPath = path.join(os.tmpdir(), 'test-db-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.sqlite');
    const db = new PetDatabase(tmpPath);
    return db.init().then(() => ({ db, tmpPath }));
  }

  suite('Database — 初始化', () => {
    test('init() 创建表通过迁移', async () => {
      const { db, tmpPath } = await createDb();
      try {
        const tables = db.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
        const tableNames = tables.map(t => t.name);
        assert.ok(tableNames.includes('users'), '应包含 users 表');
        assert.ok(tableNames.includes('pet_status'), '应包含 pet_status 表');
        assert.ok(tableNames.includes('daily_tasks'), '应包含 daily_tasks 表');
        assert.ok(tableNames.includes('items'), '应包含 items 表');
      } finally {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });

    test('runMigrations() 幂等', async () => {
      const { db, tmpPath } = await createDb();
      try {
        await db.init();
        const tables = db.all("SELECT name FROM sqlite_master WHERE type='table'");
        assert.ok(tables.length > 0, '表应仍然存在');
        const users = db.all('SELECT * FROM users');
        assert.strictEqual(users.length, 1, '不应有重复用户');
      } finally {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });
  });

  suite('Database — CRUD 操作', () => {
    test('run() INSERT 和 get()', async () => {
      const { db, tmpPath } = await createDb();
      try {
        db.run("INSERT INTO users (id, name, gold) VALUES (100, '测试用户', 999)");
        const user = db.get('SELECT * FROM users WHERE id = ?', 100);
        assert.ok(user, '用户应存在');
        assert.strictEqual(user.name, '测试用户');
        assert.strictEqual(user.gold, 999);
      } finally {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });

    test('run() UPDATE', async () => {
      const { db, tmpPath } = await createDb();
      try {
        db.run('UPDATE users SET gold = 5000 WHERE id = 1');
        const user = db.get('SELECT gold FROM users WHERE id = ?', 1);
        assert.strictEqual(user.gold, 5000);
      } finally {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });

    test('all() 返回多行', async () => {
      const { db, tmpPath } = await createDb();
      try {
        db.run("INSERT INTO users (id, name) VALUES (2, '用户2')");
        const users = db.all('SELECT * FROM users ORDER BY id');
        assert.strictEqual(users.length, 2);
        assert.strictEqual(users[0].id, 1);
        assert.strictEqual(users[1].id, 2);
      } finally {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });

    test('get() 不存在的行返回 undefined', async () => {
      const { db, tmpPath } = await createDb();
      try {
        const user = db.get('SELECT * FROM users WHERE id = ?', 9999);
        assert.strictEqual(user, undefined);
      } finally {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });

    test('_escapeSql() 转义单引号', async () => {
      const { db, tmpPath } = await createDb();
      try {
        const escaped = db._escapeSql("SELECT * FROM users WHERE name = ?", ["it's a test"]);
        assert.ok(escaped.includes("it''s a test"), '单引号应被转义');
        db.run("INSERT INTO users (id, name) VALUES (201, ?)", "it's a test");
        const user = db.get('SELECT * FROM users WHERE id = ?', 201);
        assert.strictEqual(user.name, "it's a test");
      } finally {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });
  });

  suite('Database — 持久化', () => {
    test('saveToFile() 和 reload', async () => {
      const tmpPath = path.join(os.tmpdir(), 'test-db-persist-' + Date.now() + '.sqlite');
      try {
        const db1 = new PetDatabase(tmpPath);
        await db1.init();
        db1.run('UPDATE users SET gold = 7777 WHERE id = 1');
        db1.forceSave();
        db1.close();
        const db2 = new PetDatabase(tmpPath);
        await db2.init();
        const user = db2.get('SELECT gold FROM users WHERE id = ?', 1);
        assert.strictEqual(user.gold, 7777);
        db2.close();
      } finally {
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });
  });
}

// ══════════════════════════════════════════════
// Quest 测试
// ══════════════════════════════════════════════
function testQuest() {
  const QuestSystem = require('../src/main/quest');
  const PetDatabase = require('../src/main/database');
  const os = require('os');
  const path = require('path');
  const fs = require('fs');

  function createQuestEnv() {
    const tmpPath = path.join(os.tmpdir(), 'test-quest-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.sqlite');
    const db = new PetDatabase(tmpPath);
    return db.init().then(() => {
      const quest = new QuestSystem(db);
      return { db, quest, tmpPath };
    });
  }

  suite('Quest — 每日任务', () => {
    test('getDailyTasks 返回任务列表', async () => {
      const { db, quest, tmpPath } = await createQuestEnv();
      try {
        const tasks = quest.getDailyTasks(1);
        assert.ok(Array.isArray(tasks), '应返回数组');
        assert.ok(tasks.length > 0, '应有任务');
        assert.ok(tasks[0].task_type, '任务应有类型');
      } finally {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });

    test('updateTaskProgress 增加进度', async () => {
      const { db, quest, tmpPath } = await createQuestEnv();
      try {
        const tasks = quest.getDailyTasks(1);
        const taskType = tasks[0].task_type;
        const before = tasks[0].current_count;
        quest.updateTaskProgress(1, taskType);
        const updated = db.get(
          'SELECT * FROM daily_tasks WHERE user_id = 1 AND task_type = ?',
          taskType
        );
        assert.ok(updated.current_count > before, '进度应增加');
      } finally {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });

    test('claimReward 未完成任务返回失败', async () => {
      const { db, quest, tmpPath } = await createQuestEnv();
      try {
        const tasks = quest.getDailyTasks(1);
        const r = quest.claimTaskReward(1, tasks[0].id);
        assert.strictEqual(r.success, false);
      } finally {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });

    test('claimReward 完成任务返回成功', async () => {
      const { db, quest, tmpPath } = await createQuestEnv();
      try {
        const tasks = quest.getDailyTasks(1);
        const task = tasks[0];
        db.run(
          'UPDATE daily_tasks SET current_count = target_count, completed = 1 WHERE id = ?',
          task.id
        );
        const r = quest.claimTaskReward(1, task.id);
        assert.strictEqual(r.success, true);
        assert.ok(r.reward.gold > 0, '应有金币奖励');
      } finally {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });
  });

  suite('Quest — 成就系统', () => {
    test('getAchievements 返回成就列表', async () => {
      const { db, quest, tmpPath } = await createQuestEnv();
      try {
        const achievements = quest.getAchievements(1);
        assert.ok(Array.isArray(achievements), '应返回数组');
        assert.ok(achievements.length > 0, '应有成就');
        assert.ok(achievements[0].id, '成就应有ID');
        assert.ok(achievements[0].name, '成就应有名称');
      } finally {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });

    test('refreshDailyTasks 生成新任务', async () => {
      const { db, quest, tmpPath } = await createQuestEnv();
      try {
        quest.getDailyTasks(1);
        const today = new Date().toISOString().slice(0, 10);
        db.run('DELETE FROM daily_tasks WHERE user_id = 1 AND date = ?', today);
        quest.refreshDailyTasks(1);
        const tasks2 = db.all(
          'SELECT * FROM daily_tasks WHERE user_id = 1 AND date = ?',
          today
        );
        assert.strictEqual(tasks2.length, 5, '应有5个任务');
      } finally {
        db.close();
        try { fs.unlinkSync(tmpPath); } catch (e) { /* ignore */ }
      }
    });
  });
}

// ══════════════════════════════════════════════
// SaveManager 测试
// ══════════════════════════════════════════════
function testSaveManager() {
  const SaveManager = require('../src/main/save-manager');

  function makeSaveEnv() {
    const db = new MockDatabase();
    db._seed('users', { id: 1, gold: 100, diamond: 0, heart_coin: 0 });
    db._seed('pet_status', { pet_id: 1, hunger: 80, hygiene: 80, mood: 80, stamina: 80, state: 'idle', is_sick: 0 });
    db.forceSave = () => {};
    db.save = () => {};
    const petAI = { saveStatus: () => {} };
    const manager = new SaveManager(db, petAI);
    return { db, petAI, manager };
  }

  suite('SaveManager — 脏数据标记', () => {
    test('markDirty 添加组件', () => {
      const { manager } = makeSaveEnv();
      manager.markDirty('economy');
      assert.ok(manager.dirtyComponents.has('economy'));
    });
  });

  suite('SaveManager — 保存操作', () => {
    test('forceSave 调用脏组件的 save()', () => {
      const { manager } = makeSaveEnv();
      let saved = false;
      manager.components.economy = { save: () => { saved = true; } };
      manager.markDirty('economy');
      manager.forceSave();
      assert.ok(saved, 'save() 应被调用');
    });

    test('forceSave 清除脏标记', () => {
      const { manager } = makeSaveEnv();
      manager.components.economy = { save: () => {} };
      manager.components.questSystem = { save: () => {} };
      manager.markDirty('economy');
      manager.markDirty('questSystem');
      manager.forceSave();
      assert.strictEqual(manager.dirtyComponents.size, 0);
    });

    test('forceSave 处理 save 错误不崩溃', () => {
      const { manager } = makeSaveEnv();
      manager.components.economy = { save: () => { throw new Error('保存失败'); } };
      manager.markDirty('economy');
      assert.doesNotThrow(() => manager.forceSave());
    });
  });

  suite('SaveManager — 组件管理', () => {
    test('设置和清除组件', () => {
      const { manager } = makeSaveEnv();
      const mockComp = { save: () => {} };
      manager.components.custom = mockComp;
      assert.strictEqual(manager.components.custom, mockComp);
      manager.components.custom = null;
      assert.strictEqual(manager.components.custom, null);
    });

    test('markCleanExit 设置退出标记', () => {
      const { manager } = makeSaveEnv();
      manager.markCleanExit();
      assert.strictEqual(manager.cleanExit, true);
    });
  });
}

// ══════════════════════════════════════════════
// 运行
// ══════════════════════════════════════════════
(async () => {
  console.log(C.bold('\n🐾 爪爪桌宠 — 测试套件\n'));

  testEconomy();
  testSignIn();
  testWork();
  testMiniGame();
  testDatabase();
  testQuest();
  testSaveManager();

  await Promise.all(asyncTests);

  console.log('\n' + '─'.repeat(40));
  console.log(`${C.bold('总计')} ${total} 个测试`);
  console.log(`${C.green(`✓ 通过 ${passed}`)}`);
  if (failed > 0) {
    console.log(`${C.red(`✗ 失败 ${failed}`)}`);
    console.log('\n失败详情:');
    for (const f of fails) console.log(`  ${C.red('•')} ${f.name}: ${f.error.message}`);
    process.exit(1);
  } else {
    console.log(C.green('\n🎉 全部通过！'));
  }
})();
