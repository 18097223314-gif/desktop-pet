// ══════════════════════════════════════════════
// test-sign-in.js — 签到系统测试
'use strict';

const { describe, assert, createFixture } = require('./test-runner');

describe('签到系统 SignIn', async (it) => {
  it('getSignInInfo 无记录返回默认值', async () => {
    const { signIn, db } = await createFixture();
    db.run('DELETE FROM sign_in WHERE user_id = 1');
    const info = signIn.getSignInInfo(1);
    assert.strictEqual(info.consecutiveDays, 0);
    assert.strictEqual(info.totalDays, 0);
    assert.strictEqual(info.todaySigned, false);
  });

  it('signIn 首次签到成功', async () => {
    const { signIn, db } = await createFixture();
    db.run('DELETE FROM sign_in WHERE user_id = 1');
    const result = signIn.signIn(1);
    assert.strictEqual(result.success, true);
    assert.ok(result.consecutiveDays >= 1);
    assert.ok(result.reward.gold > 0);
  });

  it('signIn 同一天重复签到应失败', async () => {
    const { signIn, db } = await createFixture();
    db.run('DELETE FROM sign_in WHERE user_id = 1');
    signIn.signIn(1);
    const result = signIn.signIn(1);
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('已经签到'));
  });

  it('getSignInInfo todaySigned 为 true', async () => {
    const { signIn, db } = await createFixture();
    db.run('DELETE FROM sign_in WHERE user_id = 1');
    signIn.signIn(1);
    const info = signIn.getSignInInfo(1);
    assert.strictEqual(info.todaySigned, true);
    assert.ok(info.consecutiveDays >= 1);
  });

  it('checkStreak 无记录不报错', async () => {
    const { signIn, db } = await createFixture();
    db.run('DELETE FROM sign_in WHERE user_id = 1');
    const result = signIn.checkStreak(1);
    assert.strictEqual(result.wasStreakBroken, false);
    assert.strictEqual(result.previousStreak, 0);
  });

  it('signIn 连续签到递增', async () => {
    const { signIn, db } = await createFixture();
    db.run('DELETE FROM sign_in WHERE user_id = 1');

    // 第1天签到
    const r1 = signIn.signIn(1);
    assert.strictEqual(r1.consecutiveDays, 1);

    // 模拟第二天：把 last_sign_date 改为昨天
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    db.run('UPDATE sign_in SET last_sign_date = ? WHERE user_id = 1', yStr);

    // 第2天签到 → 连续2天
    const r2 = signIn.signIn(1);
    assert.strictEqual(r2.consecutiveDays, 2);

    // 模拟第三天
    db.run('UPDATE sign_in SET last_sign_date = ? WHERE user_id = 1', yStr);
    const r3 = signIn.signIn(1);
    assert.strictEqual(r3.consecutiveDays, 3);
  });

  it('checkStreak 断签应重置连续天数', async () => {
    const { signIn, db } = await createFixture();
    db.run('DELETE FROM sign_in WHERE user_id = 1');

    // 先签到建立记录
    signIn.signIn(1);

    // 模拟断签：把 last_sign_date 改为前天（跳了一天）
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const agoStr = twoDaysAgo.toISOString().slice(0, 10);
    db.run('UPDATE sign_in SET last_sign_date = ?, consecutive_days = 5 WHERE user_id = 1', agoStr);

    const result = signIn.checkStreak(1);
    assert.strictEqual(result.wasStreakBroken, true);
    assert.strictEqual(result.previousStreak, 5);

    // 验证 consecutive_days 已被重置为 0
    const info = db.get('SELECT consecutive_days FROM sign_in WHERE user_id = 1');
    assert.strictEqual(info.consecutive_days, 0);
  });
});
