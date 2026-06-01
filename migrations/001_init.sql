-- ══════════════════════════════════════════════
-- 001_init.sql — 爪爪桌宠数据库初始化脚本
-- 创建所有核心数据表并插入初始道具数据
-- ══════════════════════════════════════════════

PRAGMA foreign_keys = ON;
-- sql.js 不支持 WAL 模式，跳过 journal_mode 设置

-- ─── 数据库版本记录 ────────────────────────────
CREATE TABLE IF NOT EXISTS db_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO db_meta (key, value) VALUES ('version', '1');

-- ─── 用户信息表 ────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL DEFAULT '主人',
  level        INTEGER NOT NULL DEFAULT 1,
  exp          INTEGER NOT NULL DEFAULT 0,
  gold         INTEGER NOT NULL DEFAULT 500,
  diamond      INTEGER NOT NULL DEFAULT 0,
  heart_coin   INTEGER NOT NULL DEFAULT 0,
  birth_date   TEXT,                           -- 生日 YYYY-MM-DD
  affection    INTEGER NOT NULL DEFAULT 0,     -- 好感度
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login   DATETIME DEFAULT CURRENT_TIMESTAMP,
  db_version   INTEGER NOT NULL DEFAULT 1
);

-- 默认用户
INSERT OR IGNORE INTO users (id, name) VALUES (1, '主人');

-- ─── 宠物状态表 ────────────────────────────────
CREATE TABLE IF NOT EXISTS pet_status (
  pet_id       INTEGER PRIMARY KEY DEFAULT 1,
  hunger       INTEGER NOT NULL DEFAULT 80,
  hygiene      INTEGER NOT NULL DEFAULT 80,
  mood         INTEGER NOT NULL DEFAULT 80,
  stamina      INTEGER NOT NULL DEFAULT 80,
  emotion      TEXT    NOT NULL DEFAULT 'normal',
  state        TEXT    NOT NULL DEFAULT 'idle',
  is_sick      INTEGER NOT NULL DEFAULT 0,    -- 0=健康 1=生病
  sick_since   DATETIME,                       -- 开始生病时间
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 默认宠物状态
INSERT OR IGNORE INTO pet_status (pet_id) VALUES (1);

-- ─── 宠物技能表 ────────────────────────────────
CREATE TABLE IF NOT EXISTS pet_skills (
  pet_id     INTEGER NOT NULL DEFAULT 1,
  skill_type TEXT    NOT NULL,
  level      INTEGER NOT NULL DEFAULT 1,
  exp        REAL    NOT NULL DEFAULT 0.0,
  used_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (pet_id, skill_type)
);

-- 初始化9种技能
INSERT OR IGNORE INTO pet_skills (pet_id, skill_type) VALUES
  (1, 'cooking'),
  (1, 'cleaning'),
  (1, 'performance'),
  (1, 'athletics'),
  (1, 'studying'),
  (1, 'social'),
  (1, 'gathering'),
  (1, 'crafting'),
  (1, 'lucky');

-- ─── 背包道具表 ────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL DEFAULT 1,
  item_id     TEXT    NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  acquired_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, item_id)
);

-- ─── 已装备道具表 ──────────────────────────────
CREATE TABLE IF NOT EXISTS equipped (
  pet_id    INTEGER NOT NULL DEFAULT 1,
  slot_type TEXT    NOT NULL,     -- head/body/accessory/background
  item_id   TEXT    NOT NULL,
  PRIMARY KEY (pet_id, slot_type)
);

-- ─── 每日任务表 ────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL DEFAULT 1,
  date          TEXT    NOT NULL,              -- YYYY-MM-DD
  task_type     TEXT    NOT NULL,
  target_count  INTEGER NOT NULL DEFAULT 1,
  current_count INTEGER NOT NULL DEFAULT 0,
  reward_gold   INTEGER NOT NULL DEFAULT 0,
  reward_exp    INTEGER NOT NULL DEFAULT 0,
  reward_item   TEXT,
  completed     INTEGER NOT NULL DEFAULT 0,    -- 0=未完成 1=完成
  claimed       INTEGER NOT NULL DEFAULT 0,    -- 0=未领取 1=已领取
  UNIQUE(user_id, date, task_type)
);

-- ─── 成就表 ────────────────────────────────────
CREATE TABLE IF NOT EXISTS achievements (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL DEFAULT 1,
  achievement_id TEXT    NOT NULL,
  unlocked_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  claimed        INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, achievement_id)
);

-- ─── 签到记录表 ────────────────────────────────
CREATE TABLE IF NOT EXISTS sign_in (
  user_id          INTEGER PRIMARY KEY DEFAULT 1,
  last_sign_date   TEXT,                       -- YYYY-MM-DD
  consecutive_days INTEGER NOT NULL DEFAULT 0,
  total_days       INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO sign_in (user_id) VALUES (1);

-- ─── 好友表 ────────────────────────────────────
CREATE TABLE IF NOT EXISTS friends (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER NOT NULL,
  friend_id INTEGER NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, friend_id)
);

-- ─── 游戏记录表 ────────────────────────────────
CREATE TABLE IF NOT EXISTS game_records (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL DEFAULT 1,
  game_type TEXT    NOT NULL,
  score     INTEGER NOT NULL DEFAULT 0,
  reward    INTEGER NOT NULL DEFAULT 0,         -- 金币奖励
  played_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── 打工记录表 ────────────────────────────────
CREATE TABLE IF NOT EXISTS work_records (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL DEFAULT 1,
  work_type  TEXT    NOT NULL,
  started_at DATETIME NOT NULL,
  finish_at  DATETIME NOT NULL,                 -- 预计完成时间
  finished_at DATETIME,                          -- 实际完成时间
  reward     INTEGER NOT NULL DEFAULT 0,
  bonus_item TEXT,
  status     TEXT    NOT NULL DEFAULT 'working', -- working/completed/cancelled
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── 事件日志表 ────────────────────────────────
CREATE TABLE IF NOT EXISTS event_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL DEFAULT 1,
  event_type TEXT    NOT NULL,
  event_data TEXT,                               -- JSON字符串
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ─── 道具定义表 ────────────────────────────────
CREATE TABLE IF NOT EXISTS items (
  id               TEXT    PRIMARY KEY,
  name             TEXT    NOT NULL,
  type             TEXT    NOT NULL,             -- food/toy/medicine/clothing/special/material
  rarity           TEXT    NOT NULL DEFAULT 'common',
  price_gold       INTEGER NOT NULL DEFAULT 0,
  price_diamond    INTEGER NOT NULL DEFAULT 0,
  effect_type      TEXT,
  effect_value     INTEGER NOT NULL DEFAULT 0,
  effect_duration  INTEGER NOT NULL DEFAULT 0,   -- 秒，0表示即时
  description      TEXT    NOT NULL DEFAULT '',
  is_consumable    INTEGER NOT NULL DEFAULT 1,   -- 1=消耗品 0=非消耗品
  max_stack        INTEGER NOT NULL DEFAULT 99
);

-- ══════════════════════════════════════════════
-- 初始道具数据（50+条）
-- ══════════════════════════════════════════════

-- ─── 食物类（15种）────────────────────────────
INSERT OR IGNORE INTO items VALUES
  ('food_kibble',        '猫粮',       'food', 'common',    50,  0, 'hunger',   25, 0, '普通猫粮，填饱肚子', 1, 99),
  ('food_fish',          '小鱼干',     'food', 'common',    80,  0, 'hunger',   35, 0, '鲜美小鱼干，很受欢迎', 1, 99),
  ('food_milk',          '牛奶',       'food', 'common',    60,  0, 'mood',     20, 0, '香浓牛奶，心情变好', 1, 99),
  ('food_bread',         '面包',       'food', 'common',    40,  0, 'hunger',   20, 0, '软乎乎的面包', 1, 99),
  ('food_cake',          '生日蛋糕',   'food', 'uncommon', 200,  0, 'all_stats',15, 0, '特制生日蛋糕，全属性+15', 1, 10),
  ('food_sushi',         '寿司',       'food', 'uncommon', 150,  0, 'hunger',   50, 0, '精致寿司，营养丰富', 1, 99),
  ('food_steak',         '牛排',       'food', 'rare',     300,  0, 'hunger',   70, 0, '高级牛排，大补', 1, 30),
  ('food_ice_cream',     '冰激凌',     'food', 'common',    90,  0, 'mood',     30, 0, '甜甜的冰激凌', 1, 99),
  ('food_ramen',         '拉面',       'food', 'uncommon', 120,  0, 'hunger',   45, 0, '热腾腾的拉面', 1, 99),
  ('food_taiyaki',       '鲷鱼烧',     'food', 'uncommon', 130,  0, 'mood',     35, 0, '形状可爱的鲷鱼烧', 1, 99),
  ('food_onigiri',       '饭团',       'food', 'common',    55,  0, 'hunger',   22, 0, '方便携带的饭团', 1, 99),
  ('food_pudding',       '布丁',       'food', 'uncommon', 110,  0, 'mood',     28, 0, 'Q弹布丁', 1, 99),
  ('food_macarons',      '马卡龙',     'food', 'rare',     250,  0, 'mood',     50, 0, '精致马卡龙，心情大好', 1, 30),
  ('food_hotpot',        '小火锅',     'food', 'rare',     400,  0, 'hunger',   80, 0, '超级火锅，吃撑了', 1, 20),
  ('food_galaxy_candy',  '星空糖',     'food', 'epic',       0,  2, 'all_stats',30, 0, '神秘星空糖，全属性+30', 1, 5);

-- ─── 玩具类（12种）────────────────────────────
INSERT OR IGNORE INTO items VALUES
  ('toy_ball',           '毛线球',     'toy', 'common',    80,  0, 'mood',     20, 300, '经典毛线球，百玩不厌', 0, 1),
  ('toy_ribbon',         '逗猫棒',     'toy', 'common',   100,  0, 'mood',     25, 300, '带羽毛的逗猫棒', 0, 1),
  ('toy_balloon',        '气球',       'toy', 'common',    60,  0, 'mood',     15, 180, '彩色气球，快乐源泉', 1, 10),
  ('toy_rubiks_cube',    '魔方',       'toy', 'uncommon', 200,  0, 'mood',     30, 600, '六面魔方，锻炼智力', 0, 1),
  ('toy_plush',          '毛绒玩具',   'toy', 'uncommon', 250,  0, 'mood',     35, 0,   '软萌毛绒玩具，陪伴感+1', 0, 1),
  ('toy_music_box',      '八音盒',     'toy', 'rare',     500,  0, 'mood',     50, 900, '悦耳的音乐盒', 0, 1),
  ('toy_frisbee',        '飞盘',       'toy', 'uncommon', 180,  0, 'stamina',  20, 300, '飞盘，运动好帮手', 0, 1),
  ('toy_kite',           '风筝',       'toy', 'uncommon', 220,  0, 'mood',     40, 600, '五彩风筝，飞高高', 0, 1),
  ('toy_magic_wand',     '魔法棒',     'toy', 'rare',     600,  0, 'mood',     60, 0,   '神秘魔法棒，一挥就开心', 1, 5),
  ('toy_telescope',      '小望远镜',   'toy', 'rare',     700,  0, 'mood',     45, 900, '观星望远镜', 0, 1),
  ('toy_puzzle',         '拼图',       'toy', 'uncommon', 300,  0, 'mood',     35, 1200,'复杂拼图，专注力+1', 0, 1),
  ('toy_bubble_machine', '泡泡机',     'toy', 'rare',     450,  0, 'mood',     55, 600, '吹出无数泡泡', 1, 3);

-- ─── 药品类（8种）─────────────────────────────
INSERT OR IGNORE INTO items VALUES
  ('medicine_vitamin',   '维生素',     'medicine', 'common',   100, 0, 'stamina',  20, 0, '补充体力维生素', 1, 30),
  ('medicine_cold',      '感冒药',     'medicine', 'common',   150, 0, 'heal',     50, 0, '治疗感冒专用', 1, 20),
  ('medicine_tonic',     '滋补汤',     'medicine', 'uncommon', 300, 0, 'all_stats',20, 0, '全面滋补，身体棒棒', 1, 10),
  ('medicine_elixir',    '长生药水',   'medicine', 'rare',     800, 0, 'all_stats',50, 0, '传说中的长生药水', 1, 5),
  ('medicine_bandage',   '创可贴',     'medicine', 'common',    50, 0, 'heal',     20, 0, '小伤口快速处理', 1, 50),
  ('medicine_honey',     '蜂蜜',       'medicine', 'uncommon', 200, 0, 'mood',     40, 0, '甜蜜蜂蜜，心情变好', 1, 20),
  ('medicine_ginseng',   '人参',       'medicine', 'epic',    2000, 0, 'stamina',  80, 0, '极品人参，大补元气', 1, 3),
  ('medicine_cure_all',  '万灵药',     'medicine', 'legendary',0,  10, 'all_stats',100,0, '传说中的万灵药', 1, 1);

-- ─── 服装类（8种）─────────────────────────────
INSERT OR IGNORE INTO items VALUES
  ('cloth_hat_strawberry','草莓帽',    'clothing', 'common',   200, 0, 'mood',     5, 0, '可爱草莓帽子', 0, 1),
  ('cloth_hat_bear',     '熊猫耳朵',  'clothing', 'uncommon', 400, 0, 'mood',     8, 0, '超萌熊猫耳', 0, 1),
  ('cloth_bow',          '蝴蝶结',    'clothing', 'common',   150, 0, 'mood',     5, 0, '粉色蝴蝶结', 0, 1),
  ('cloth_scarf',        '围巾',      'clothing', 'uncommon', 350, 0, 'mood',     6, 0, '暖暖围巾', 0, 1),
  ('cloth_crown',        '皇冠',      'clothing', 'rare',     800, 0, 'mood',    10, 0, '闪闪皇冠', 0, 1),
  ('cloth_wings',        '天使翅膀',  'clothing', 'rare',    1000, 0, 'mood',    12, 0, '洁白天使翅膀', 0, 1),
  ('cloth_cloak',        '魔法披风',  'clothing', 'epic',    2500, 0, 'mood',    20, 0, '神秘魔法披风', 0, 1),
  ('cloth_space_suit',   '宇航服',    'clothing', 'legendary',0,  20, 'mood',    30, 0, '限定宇航服', 0, 1);

-- ─── 特殊道具（10种）──────────────────────────
INSERT OR IGNORE INTO items VALUES
  ('special_mystery_box',   '神秘礼盒',   'special', 'rare',   500, 0, 'special',  0, 0, '打开有惊喜', 1, 10),
  ('special_golden_egg',    '黄金蛋',     'special', 'epic',     0, 5, 'special',  0, 0, '孵化黄金蛋', 1, 3),
  ('special_star_fragment', '星屑碎片',   'special', 'rare',   800, 0, 'exp',    100, 0, '闪亮星屑，大量经验', 1, 10),
  ('special_time_stone',    '时间之石',   'special', 'epic',     0, 8, 'special',  0, 0, '时间流速加倍', 1, 3),
  ('special_rare_treasure', '稀有宝箱',   'special', 'epic',     0, 3, 'special',  0, 0, '珍贵宝箱', 1, 5),
  ('special_heart_crystal', '心意水晶',   'special', 'rare',   600, 0, 'affection',50, 0, '好感度大幅提升', 1, 10),
  ('special_exp_book',      '经验书',     'special', 'uncommon',300, 0, 'exp',     50, 0, '阅读增加经验', 1, 20),
  ('special_gold_medal',    '金牌奖章',   'special', 'epic',     0, 0, 'gold',   1000, 0,'兑换1000金币', 1, 5),
  ('special_rainbow_candy', '彩虹糖',     'special', 'legendary',0, 15, 'all_stats',50, 0,'彩虹糖，超级变变变', 1, 1),
  ('special_lucky_charm',   '幸运符',     'special', 'rare',   700, 0, 'special',  0, 3600,'持续1小时幸运加成', 1, 5);

-- ─── 材料类（5种）─────────────────────────────
INSERT OR IGNORE INTO items VALUES
  ('material_crystal',    '水晶碎片',   'material', 'uncommon', 0, 0, null, 0, 0, '合成材料', 1, 99),
  ('material_ancient_gem','远古宝石',   'material', 'rare',     0, 0, null, 0, 0, '稀有合成材料', 1, 30),
  ('material_star_dust',  '星尘',       'material', 'rare',     0, 0, null, 0, 0, '闪闪发光的星尘', 1, 30),
  ('material_dragon_scale','龙鳞片',    'material', 'epic',     0, 0, null, 0, 0, '传说中的龙鳞', 1, 10),
  ('material_moonstone',  '月光石',     'material', 'epic',     0, 0, null, 0, 0, '月光下闪耀的宝石', 1, 10);
