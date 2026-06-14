// ══════════════════════════════════════════════
// test-mini-game.js — 小游戏系统测试
'use strict';

const { describe, assert, createFixture } = require('./test-runner');

describe('小游戏 MiniGame', async (it) => {

  // ─── RPS playRps() ────────────────────────

  it('playRps 无效出拳应失败', async () => {
    const { miniGame } = await createFixture();
    const result = miniGame.playRps(1, 'spock', 50);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('无效'));
  });

  it('playRps 下注低于最小值应失败', async () => {
    const { miniGame } = await createFixture();
    const result = miniGame.playRps(1, 'rock', 5);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('10'));
  });

  it('playRps 下注超过上限应失败', async () => {
    const { miniGame } = await createFixture();
    const result = miniGame.playRps(1, 'rock', 1001);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('1000'));
  });

  it('playRps 金币不足应失败', async () => {
    const { miniGame, db } = await createFixture();
    db.run('UPDATE users SET gold = 0 WHERE id = 1');
    const result = miniGame.playRps(1, 'rock', 50);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('金币不足'));
  });

  // ── RPS 三种结果：mock Math.random 让结果确定性 ──
  // mini-game.js 中 cpuChoice = VALID_CHOICES[Math.floor(Math.random() * 3)]
  //   random∈[0,1/3)→0=rock, [1/3,2/3)→1=scissors, [2/3,1)→2=paper

  it('playRps 赢了应得双倍下注', async () => {
    const { miniGame } = await createFixture();
    const orig = Math.random;
    Math.random = () => 1 / 3; // → floor=1 → scissors
    try {
      // player=rock vs CPU=scissors → rock beats scissors → win
      const r = miniGame.playRps(1, 'rock', 100);
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.data.result, 'win');
      assert.strictEqual(r.data.goldEarned, 200);
    } finally { Math.random = orig; }
  });

  it('playRps 输了应扣除下注', async () => {
    const { miniGame, economy } = await createFixture();
    const orig = Math.random;
    Math.random = () => 0 / 3; // → floor=0 → rock
    try {
      const before = economy.getBalance(1);
      // player=scissors vs CPU=rock → lose
      const r = miniGame.playRps(1, 'scissors', 100);
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.data.result, 'lose');
      assert.strictEqual(r.data.goldEarned, 0);
      assert.strictEqual(economy.getBalance(1).gold, before.gold - 100);
    } finally { Math.random = orig; }
  });

  it('playRps 平局不扣不奖', async () => {
    const { miniGame, economy } = await createFixture();
    const orig = Math.random;
    Math.random = () => 0 / 3; // → floor=0 → rock
    try {
      const before = economy.getBalance(1);
      // player=rock vs CPU=rock → draw
      const r = miniGame.playRps(1, 'rock', 100);
      assert.strictEqual(r.success, true);
      assert.strictEqual(r.data.result, 'draw');
      assert.strictEqual(r.data.goldEarned, 0);
      assert.strictEqual(economy.getBalance(1).gold, before.gold);
    } finally { Math.random = orig; }
  });

  // ─── 食物反应 rewardCatchFood() ───────────

  it('rewardCatchFood 正常奖励金额正确', async () => {
    const { miniGame } = await createFixture();
    const result = miniGame.rewardCatchFood(1, 3);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.goldReward, 45); // 3 * 15
    assert.strictEqual(result.data.expReward, 15);  // 3 * 5
  });

  it('rewardCatchFood hitCount为0无奖励', async () => {
    const { miniGame } = await createFixture();
    const result = miniGame.rewardCatchFood(1, 0);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.goldReward, 0);
  });

  it('rewardCatchFood 非法参数兜底为0', async () => {
    const { miniGame } = await createFixture();
    // 负数被 clamp 到 0，字符串/NaN/null/undefined 经 Number||0 后为 0
    const cases = [-1, 'abc', NaN, null, undefined];
    for (const val of cases) {
      const result = miniGame.rewardCatchFood(1, val);
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.data.hitCount, 0);
    }
  });

  it('rewardCatchFood hitCount上限为5', async () => {
    const { miniGame } = await createFixture();
    const result = miniGame.rewardCatchFood(1, 100);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.data.hitCount, 5);
    assert.strictEqual(result.data.goldReward, 75); // 5 * 15
  });

  it('rewardCatchFood 超出每日限制应失败', async () => {
    const { miniGame } = await createFixture();
    // catch-food dailyLimit=5，连续调用 5 次后第 6 次应失败
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(miniGame.rewardCatchFood(1, 1).success, true);
    }
    const result = miniGame.rewardCatchFood(1, 1);
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('次数'));
  });

  // ─── 通用流程 startGame/finishGame ────────

  it('startGame 未知游戏类型应失败', async () => {
    const { miniGame } = await createFixture();
    const result = miniGame.startGame(1, 'nonexistent_game');
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('未知'));
  });

  it('startGame 体力不足应失败', async () => {
    const { miniGame, db } = await createFixture();
    db.run('UPDATE pet_status SET stamina = 3 WHERE pet_id = 1');
    const result = miniGame.startGame(1, 'rps');
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('体力'));
  });

  it('startGame 正常开始并扣除体力', async () => {
    const { miniGame, db } = await createFixture();
    db.run('UPDATE pet_status SET stamina = 50 WHERE pet_id = 1');
    try {
      const result = miniGame.startGame(1, 'memory');
      assert.strictEqual(result.success, true);
      const stamina = db.get('SELECT stamina FROM pet_status WHERE pet_id = 1');
      assert.strictEqual(stamina.stamina, 45);
    } finally {
      miniGame.finishGame(1, 'memory', 0);
    }
  });

  it('startGame 重复开始应失败', async () => {
    const { miniGame, db } = await createFixture();
    db.run('UPDATE pet_status SET stamina = 50 WHERE pet_id = 1');
    try {
      miniGame.startGame(1, 'rps');
      const result = miniGame.startGame(1, 'memory');
      assert.strictEqual(result.success, false);
      assert.ok(result.message.includes('进行'));
    } finally {
      miniGame.finishGame(1, 'rps', 0);
    }
  });

  it('finishGame 无进行中游戏应失败', async () => {
    const { miniGame } = await createFixture();
    const result = miniGame.finishGame(1, 'rps', 100);
    assert.strictEqual(result.success, false);
  });

  it('finishGame 游戏类型不匹配应失败', async () => {
    const { miniGame, db } = await createFixture();
    db.run('UPDATE pet_status SET stamina = 50 WHERE pet_id = 1');
    miniGame.startGame(1, 'rps');
    const result = miniGame.finishGame(1, 'memory', 100);
    assert.strictEqual(result.success, false);
    // 清理
    miniGame.finishGame(1, 'rps', 0);
  });

  it('finishGame 正常结算发金币和经验', async () => {
    const { miniGame, db, economy } = await createFixture();
    db.run('UPDATE pet_status SET stamina = 80 WHERE pet_id = 1');
    db.run('UPDATE users SET gold = 500, exp = 0 WHERE id = 1');

    miniGame.startGame(1, 'catch-food');
    const result = miniGame.finishGame(1, 'catch-food', 10);
    assert.strictEqual(result.success, true);
    assert.ok(result.reward.gold > 0);
    assert.ok(result.reward.exp > 0);

    const user = db.get('SELECT gold, exp FROM users WHERE id = 1');
    assert.ok(user.gold > 500, '金币应增加');
    assert.ok(user.exp > 0, '经验应增加');
  });

  // ─── getGameList ──────────────────────────

  it('getGameList 返回4种游戏', async () => {
    const { miniGame } = await createFixture();
    const list = miniGame.getGameList(1);
    assert.strictEqual(list.length, 4);
    const types = list.map(g => g.type);
    assert.ok(types.includes('catch-food'));
    assert.ok(types.includes('rps'));
    assert.ok(types.includes('memory'));
    assert.ok(types.includes('rhythm'));
  });

  it('getGameList 包含剩余次数', async () => {
    const { miniGame } = await createFixture();
    const list = miniGame.getGameList(1);
    for (const game of list) {
      assert.ok(typeof game.remaining === 'number');
      assert.ok(game.remaining >= 0);
      assert.ok(game.dailyLimit > 0);
    }
  });

  it('getGameRecords 无记录返回空数组', async () => {
    const { miniGame } = await createFixture();
    assert.deepStrictEqual(miniGame.getGameRecords(1), []);
  });
});
