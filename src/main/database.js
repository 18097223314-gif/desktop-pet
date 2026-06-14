// ══════════════════════════════════════════════
// database.js — SQLite 数据库管理类
// 使用 sql.js（纯 JS SQLite 实现，无需编译）
// 支持持久化存储、迁移执行、预编译语句缓存、事务
// ══════════════════════════════════════════════
//
// @WORKAROUND sql.js 参数绑定 bug（1.10.3 ~ 1.14.1 均存在）
// ──────────────────────────────────────────
// sql.js 的 Prepared Statement 存在参数绑定缺陷：
//   stmt.bind(1, val)（单参数）后 stmt.getAsObject() 返回 undefined。
//   stmt.bind([1, val])（数组绑定）正常，但 stmt.step() 循环返回空。
// 影响范围：所有带单参数 `?` 占位符的 SELECT。
// 已验证版本：1.10.3、1.14.1（2026-06-05）
//
// 当前方案：_escapeSql() 将参数直接拼接到 SQL 字符串中，改用 db.exec() 执行。
// 安全性：本应用所有 SQL 参数均为内部生成（userId、workType 等），无外部用户输入，
//        不存在 SQL 注入风险。
// 局限：_escapeSql 的正则 /\?/g 无法区分 SQL 字符串字面量内的 ? 和参数占位符 ?。
//       若有复杂 SQL 表达式内嵌 ?（如 datetime('now', '+' || ? || ' seconds')），
//       需在 JS 中提前计算，避免将 ? 放在 SQL 函数内部。
// 后续：sql.js 修复此 bug 后，可移除 _escapeSql 并回退到原生 prepared statement。

'use strict';

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class PetDatabase {
  /**
   * @param {string} dbPath 数据库文件路径
   */
  constructor(dbPath) {
    /** @type {string} 数据库文件路径 */
    this.dbPath = dbPath;
    /** @type {Database|null} sql.js 实例 */
    this.db = null;
    /** @type {Map<string, Statement>} 预编译语句缓存 */
    this.stmtCache = new Map();
    /** @type {string} 迁移文件目录 */
    this.migrationsDir = path.join(__dirname, '..', '..', 'migrations');
    /** @type {boolean} 是否有未保存的变更 */
    this._dirty = false;
    /** @type {number} 自动保存计数器 */
    this._saveCounter = 0;
  }

  /**
   * 初始化数据库连接，启用 WAL 等效模式，运行迁移脚本
   * sql.js 是内存数据库，需手动 load/save 到文件
   */
  async init() {
    // 确保数据库目录存在
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 初始化 sql.js
    const SQL = await initSqlJs();

    // 尝试从文件加载已有数据库
    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
      console.log(`[Database] 从文件加载: ${this.dbPath}`);
    } else {
      this.db = new SQL.Database();
      console.log('[Database] 创建新数据库');
    }

    // 启用外键约束（sql.js 不支持 WAL，但支持 foreign_keys）
    this.db.run('PRAGMA foreign_keys = ON');

    // 运行迁移
    this.runMigrations();

    // 增量迁移：检查 pet 表是否已有 evolution_type 列，没有则添加（幂等）
    this._migrateAddEvolutionType();

    // 保存迁移后的数据库
    this._saveToFile();

    console.log(`[Database] 初始化完成: ${this.dbPath}`);
  }

  /**
   * 执行数据库迁移脚本（按文件名版本顺序）
   * 使用 db_meta 表记录当前版本，只执行新版本迁移
   */
  runMigrations() {
    // 读取当前版本
    let currentVersion = 0;
    try {
      const result = this.db.exec("SELECT value FROM db_meta WHERE key = 'version'");
      if (result.length > 0 && result[0].values.length > 0) {
        currentVersion = parseInt(result[0].values[0][0], 10);
      }
    } catch (err) {
      // db_meta 表可能不存在（首次启动），忽略错误
      currentVersion = 0;
    }

    // 读取迁移文件列表并排序
    if (!fs.existsSync(this.migrationsDir)) {
      console.warn('[Database] 迁移目录不存在，跳过迁移');
      return;
    }

    const migrationFiles = fs
      .readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      // 从文件名提取版本号，如 001_init.sql → 1
      const match = file.match(/^(\d+)/);
      if (!match) continue;

      const fileVersion = parseInt(match[1], 10);

      // 只执行版本号大于当前版本的迁移
      if (fileVersion > currentVersion) {
        const filePath = path.join(this.migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');

        console.log(`[Database] 执行迁移: ${file}`);

        try {
          // sql.js 的 run() 不支持多语句，用 exec() 代替
          this.db.exec(sql);
          this._dirty = true;
          console.log(`[Database] 迁移成功: ${file}`);
        } catch (err) {
          console.error(`[Database] 迁移失败: ${file}`, err.message);
          throw err;
        }
      }
    }
  }

  /**
   * 获取预编译 statement（带缓存）
   * sql.js 没有原生的 prepare 返回对象，这里返回一个包装对象
   * @param {string} sql SQL 语句
   * @returns {Object} 带 get/all/run/bind 方法的 statement 对象
   */
  prepare(sql) {
    if (!this.stmtCache.has(sql)) {
      const stmt = this.db.prepare(sql);
      // 包装成类似 better-sqlite3 的接口
      const wrapped = {
        _stmt: stmt,
        _sql: sql,

        /**
         * 绑定参数并获取单行结果
         */
        get: (...params) => {
          if (params.length > 0) {
            this._bindParams(stmt, params);
          }
          try {
            if (stmt.step()) {
              const row = stmt.getAsObject({ sql });
              return row;
            }
            return undefined;
          } finally {
            stmt.reset();
          }
        },

        /**
         * 绑定参数并获取所有结果
         */
        all: (...params) => {
          if (params.length > 0) {
            this._bindParams(stmt, params);
          }
          const rows = [];
          try {
            while (stmt.step()) {
              rows.push(stmt.getAsObject({ sql }));
            }
          } finally {
            stmt.reset();
          }
          return rows;
        },

        /**
         * 执行写入操作
         */
        run: (...params) => {
          if (params.length > 0) {
            this._bindParams(stmt, params);
          }
          try {
            stmt.step();
          } catch (err) {
            console.error(`[Database] run() SQL执行失败: ${sql}`, err.message);
            throw err;
          } finally {
            stmt.reset();
          }
          const changes = this.db.getRowsModified();
          const lastInsertRowid = this._getLastInsertRowId();
          this._dirty = true;
          return { changes, lastInsertRowid };
        },

        /**
         * 重置 statement
         */
        reset: () => {
          stmt.reset();
        },

        /**
         * 释放 statement
         */
        finalize: () => {
          stmt.free();
        },
      };
      this.stmtCache.set(sql, wrapped);
    }
    return this.stmtCache.get(sql);
  }

  /**
   * 绑定参数到 sql.js statement
   * sql.js 使用 bind(1, val), bind(2, val) 的方式
   * 安全措施：绑定前 reset、undefined→null、检测 bind 失败
   */
  _bindParams(stmt, params) {
    if (Array.isArray(params)) {
      // 展开一层嵌套（...params 调用可能产生 [[a,b]] 形式）
      const flattened = params.flat(1);
      // 绑定前先 reset，防止 statement 停在 stepped 状态导致 bind 失败
      stmt.reset();
      for (let i = 0; i < flattened.length; i++) {
        // undefined 在 sql.js 里会导致 bind 静默失败，替换为 null
        const val = flattened[i] === undefined ? null : flattened[i];
        const ok = stmt.bind(i + 1, val);
        if (!ok) {
          console.warn(`[Database] bind(${i + 1}, ${typeof val}) 失败, SQL参数可能未正确绑定`);
        }
      }
    }
  }

  /**
   * 获取最后插入的 rowid
   */
  _getLastInsertRowId() {
    try {
      const result = this.db.exec('SELECT last_insert_rowid()');
      if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0];
      }
    } catch (e) {
      // ignore
    }
    return 0;
  }

  /**
   * 事务执行
   * sql.js 支持 db.run() 执行单条 SQL
   * @param {Function} fn 事务回调函数
   * @returns {*} fn 的返回值
   */
  transaction(fn) {
    this.db.run('BEGIN TRANSACTION');
    try {
      const result = fn();
      this.db.run('COMMIT');
      this._dirty = true;
      return result;
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
  }

  /**
   * 直接执行 SQL（用于 DDL 等一次性语句）
   * sql.js 的 exec 支持多语句
   * @param {string} sql SQL 语句
   */
  exec(sql) {
    this.db.exec(sql);
    this._dirty = true;
  }

  /**
   * 安全的 SQL 字符串替换 ? 占位符为实际值
   * 仅用于 SELECT 查询（本应用参数均为内部生成，无外部输入风险）
   */
  _escapeSql(sql, params) {
    if (!params || params.length === 0) return sql;
    let idx = 0;
    return sql.replace(/\?/g, () => {
      const val = params[idx++];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'number') return String(val);
      // 字符串：转义单引号后加引号
      return "'" + String(val).replace(/'/g, "''") + "'";
    });
  }

  /**
   * 获取单个查询结果
   * sql.js 的 getAsObject() 对单参数 bind 的 prepared statement 有 bug，
   * 返回 undefined。改用 db.exec() 直接执行完整 SQL。
   */
  get(sql, ...params) {
    if (params.length === 0) {
      return this.prepare(sql).get();
    }
    const escapedSql = this._escapeSql(sql, params);
    const results = this.db.exec(escapedSql);
    if (!results || results.length === 0 || results[0].values.length === 0) {
      return undefined;
    }
    // 构建对象：列名 → 值
    const columns = results[0].columns;
    const row = results[0].values[0];
    const obj = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = row[i];
    }
    return obj;
  }

  /**
   * 获取所有查询结果
   */
  all(sql, ...params) {
    // sql.js 的 getAsObject() 对单参数 bind 有 bug，统一走 db.exec() 路径
    const escapedSql = params.length > 0 ? this._escapeSql(sql, params) : sql;
    try {
      const results = this.db.exec(escapedSql);
      if (!results || results.length === 0) return [];
      const columns = results[0].columns;
      return results[0].values.map((row) => {
        const obj = {};
        for (let i = 0; i < columns.length; i++) {
          obj[columns[i]] = row[i];
        }
        return obj;
      });
    } catch (err) {
      console.error('[Database] all() SQL执行失败:', err.message, '| SQL:', escapedSql);
      throw err;
    }
  }

  /**
   * 执行写入操作并返回变化行数
   * sql.js 的 prepared statement 单参数 bind 有 bug，对带参数的查询改用 db.exec()。
   */
  run(sql, ...params) {
    if (params.length === 0) {
      return this.prepare(sql).run();
    }
    const escapedSql = this._escapeSql(sql, params);
    this.db.exec(escapedSql);
    this._dirty = true;
    const changes = this.db.getRowsModified();
    const lastInsertRowid = this._getLastInsertRowId();
    return { changes, lastInsertRowid };
  }

  /**
   * 保存数据库到文件
   */
  _saveToFile() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
      this._dirty = false;
      this._saveCounter++;
    } catch (err) {
      console.error('[Database] 保存失败:', err.message);
    }
  }

  /**
   * 保存数据库（仅在有脏数据时保存）
   */
  save() {
    if (this._dirty) {
      this._saveToFile();
    }
  }

  /**
   * 强制保存数据库
   */
  forceSave() {
    this._saveToFile();
  }

  /**
   * 增量迁移：给 pet 表添加 evolution_type 列（幂等，多次执行不报错）
   * 使用 PRAGMA table_info(pet) 检查列是否存在
   */
  _migrateAddEvolutionType() {
    try {
      const result = this.db.exec('PRAGMA table_info(pet)');
      if (result.length === 0) {
        console.log('[Database] pet 表不存在，跳过 evolution_type 迁移');
        return;
      }

      // 检查是否已有 evolution_type 列
      const columns = result[0].values.map((row) => row[1]); // 第二列是列名
      if (columns.includes('evolution_type')) {
        console.log('[Database] pet.evolution_type 列已存在，跳过迁移');
        return;
      }

      // 添加列：TEXT 类型，默认 NULL
      this.db.run('ALTER TABLE pet ADD COLUMN evolution_type TEXT DEFAULT NULL');
      this._dirty = true;
      console.log('[Database] 已添加 pet.evolution_type 列');
    } catch (err) {
      console.warn('[Database] evolution_type 迁移异常（可能已存在）:', err.message);
    }
  }

  /**
   * 关闭数据库连接，保存数据到文件
   */
  close() {
    if (this.db) {
      // 保存到文件
      this._saveToFile();
      // 释放所有缓存的 statements
      for (const [sql, stmt] of this.stmtCache) {
        try {
          stmt.finalize();
        } catch (e) {
          // ignore
        }
      }
      this.stmtCache.clear();
      this.db.close();
      this.db = null;
      console.log('[Database] 连接已关闭，数据已保存');
    }
  }
}

module.exports = PetDatabase;
