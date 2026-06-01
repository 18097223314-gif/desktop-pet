-- ══════════════════════════════════════════════
-- 003_add_inventory_capacity.sql — 用户背包容量字段
-- 将背包容量从 event_log 推算改为 users 表直接存储
-- ══════════════════════════════════════════════

-- 用户表新增 inventory_capacity 字段，默认30
ALTER TABLE users ADD COLUMN inventory_capacity INTEGER NOT NULL DEFAULT 30;

-- 更新数据库版本
UPDATE db_meta SET value = '3' WHERE key = 'version';
