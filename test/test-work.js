// ══════════════════════════════════════════════
// test-work.js — 打工系统测试
'use strict';

const { describe, assert, createFixture } = require('./test-runner');

describe('打工系统 Work', async (it) => {
  it('getAvailableJobs 返回工作列表', async () => {
    const { work } = await createFixture();
    const jobs = work.getAvailableJobs(1);
    assert.ok(Array.isArray(jobs));
    assert.ok(jobs.length > 0);
    assert.ok(jobs.some(j => j.type === 'leaflet'));
  });

  it('getAvailableJobs 高等级解锁更多', async () => {
    const { work } = await createFixture();
    const jobs1 = work.getAvailableJobs(1);
    const jobs20 = work.getAvailableJobs(20);
    assert.ok(jobs20.length >= jobs1.length);
    assert.ok(jobs20.some(j => j.type === 'adventurer'));
  });

  it('startWork 未知工作类型应失败', async () => {
    const { work } = await createFixture();
    assert.strictEqual(work.startWork(1, 'fake_job_xyz').success, false);
  });

  it('startWork 等级不足应失败', async () => {
    const { work, db } = await createFixture();
    db.run('UPDATE users SET level = 1 WHERE id = 1');
    const result = work.startWork(1, 'adventurer');
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('需要') || result.message.includes('级'));
  });

  it('startWork 精确等级边界：达到minLevel应成功', async () => {
    const { work, db } = await createFixture();
    // adventurer minLevel=20，设level=20应该刚好能过
    db.run('UPDATE users SET level = 20 WHERE id = 1');
    db.run('UPDATE pet_status SET stamina = 80 WHERE pet_id = 1');
    try {
      const result = work.startWork(1, 'adventurer');
      assert.strictEqual(result.success, true);
    } finally {
      work.cancelWork(1);
    }
    // level=19应失败
    db.run('UPDATE users SET level = 19 WHERE id = 1');
    const failResult = work.startWork(1, 'adventurer');
    assert.strictEqual(failResult.success, false);
  });

  it('startWork 体力恰好等于消耗应成功', async () => {
    const { work, db } = await createFixture();
    db.run('UPDATE users SET level = 1 WHERE id = 1');
    // leaflet staminaCost=10，设stamina=10
    db.run('UPDATE pet_status SET stamina = 10 WHERE pet_id = 1');
    try {
      const result = work.startWork(1, 'leaflet');
      assert.strictEqual(result.success, true);
    } finally {
      work.cancelWork(1);
    }
    // stamina=9应失败
    db.run('UPDATE pet_status SET stamina = 9 WHERE pet_id = 1');
    const failResult = work.startWork(1, 'leaflet');
    assert.strictEqual(failResult.success, false);
  });

  it('startWork 体力不足应失败', async () => {
    const { work, db } = await createFixture();
    db.run('UPDATE pet_status SET stamina = 0 WHERE pet_id = 1');
    const result = work.startWork(1, 'leaflet');
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('体力'));
  });

  it('startWork 正常开始打工', async () => {
    const { work, db } = await createFixture();
    db.run('UPDATE users SET level = 1 WHERE id = 1');
    db.run('UPDATE pet_status SET stamina = 80 WHERE pet_id = 1');
    try {
      const result = work.startWork(1, 'leaflet');
      assert.strictEqual(result.success, true);
      assert.ok(result.finishTime > Date.now());
    } finally {
      work.cancelWork(1);
    }
  });

  it('startWork 重复打工应失败', async () => {
    const { work, db } = await createFixture();
    db.run('UPDATE users SET level = 1 WHERE id = 1');
    db.run('UPDATE pet_status SET stamina = 80 WHERE pet_id = 1');
    try {
      work.startWork(1, 'leaflet');
      const result = work.startWork(1, 'leaflet');
      assert.strictEqual(result.success, false);
    } finally {
      work.cancelWork(1);
    }
  });

  it('getWorkStatus 无打工返回空闲', async () => {
    const { work } = await createFixture();
    assert.strictEqual(work.getWorkStatus(1).isWorking, false);
  });

  it('cancelWork 无打工不报错', async () => {
    const { work } = await createFixture();
    assert.strictEqual(work.cancelWork(1).success, false);
  });

  it('finishWork 无打工不报错', async () => {
    const { work } = await createFixture();
    assert.strictEqual(work.finishWork(1).success, false);
  });

  it('finishWork 正向路径发金币和经验', async () => {
    const { work, db, economy } = await createFixture();
    db.run('UPDATE users SET level = 1, gold = 500, exp = 0 WHERE id = 1');
    db.run('UPDATE pet_status SET stamina = 80 WHERE pet_id = 1');
    try {
      work.startWork(1, 'leaflet');
      const result = work.finishWork(1);
      assert.strictEqual(result.success, true);
      assert.ok(result.reward.gold > 0, '应有金币奖励');
      assert.ok(result.reward.exp > 0, '应有经验奖励');

      const user = db.get('SELECT gold, exp FROM users WHERE id = 1');
      assert.ok(user.gold > 500, '金币应增加');
      assert.ok(user.exp > 0, '经验应增加');
    } finally {
      work.cancelWork(1);
    }
  });
});
