-- ══════════════════════════════════════════════
-- 002_add_festival.sql — 节日记录表
-- ══════════════════════════════════════════════

-- 节日领取记录表：防止重复领取节日奖励
CREATE TABLE IF NOT EXISTS festival_records (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL DEFAULT 1,
  festival_type  TEXT    NOT NULL,
  year           INTEGER NOT NULL,
  rewards_claimed INTEGER NOT NULL DEFAULT 0,
  created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, festival_type, year)
);

-- 更新数据库版本
UPDATE db_meta SET value = '2' WHERE key = 'version';
