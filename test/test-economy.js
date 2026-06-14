// ══════════════════════════════════════════════
// test-economy.js — 经济系统测试
'use strict';

const { describe, assert, createFixture } = require('./test-runner');

describe('经济系统 Economy', async (it) => {
  it('addGold 正常增加', async () => {
    const { economy } = await createFixture();
    const before = economy.getBalance(1);
    economy.addGold(1, 100, '测试');
    assert.strictEqual(economy.getBalance(1).gold, before.gold + 100);
  });

  it('addGold/addDiamond/addHeartCoin 三币种独立增加', async () => {
    const { economy } = await createFixture();
    const base = economy.getBalance(1);
    economy.addGold(1, 50, '测试');
    economy.addDiamond(1, 3, '测试');
    economy.addHeartCoin(1, 2, '测试');
    const after = economy.getBalance(1);
    assert.strictEqual(after.gold, base.gold + 50);
    assert.strictEqual(after.diamond, base.diamond + 3);
    assert.strictEqual(after.heartCoin, base.heartCoin + 2);
  });

  it('spendGold 金币不足应抛错', async () => {
    const { economy } = await createFixture();
    assert.throws(() => economy.spendGold(1, 99999999), /金币不足/);
  });

  it('spendGold 正常扣款', async () => {
    const { economy } = await createFixture();
    const before = economy.getBalance(1);
    const result = economy.spendGold(1, 10);
    assert.strictEqual(result.success, true);
    assert.strictEqual(economy.getBalance(1).gold, before.gold - 10);
  });

  it('spendGold 扣至0应成功', async () => {
    const { economy, db } = await createFixture();
    db.run('UPDATE users SET gold = 50 WHERE id = 1');
    const result = economy.spendGold(1, 50);
    assert.strictEqual(result.success, true);
    assert.strictEqual(economy.getBalance(1).gold, 0);
  });

  it('spendGold 扣0应成功不改变余额', async () => {
    const { economy } = await createFixture();
    const before = economy.getBalance(1);
    const result = economy.spendGold(1, 0);
    assert.strictEqual(result.success, true);
    assert.strictEqual(economy.getBalance(1).gold, before.gold);
  });

  it('spendGold 扣负数应增加余额（允许回退）', async () => {
    const { economy } = await createFixture();
    const before = economy.getBalance(1);
    const result = economy.spendGold(1, -10);
    assert.strictEqual(result.success, true);
    assert.strictEqual(economy.getBalance(1).gold, before.gold + 10);
  });

  it('buyItem 不存在的道具应失败', async () => {
    const { economy } = await createFixture();
    assert.strictEqual(economy.buyItem(1, 'nonexistent_999', 1).success, false);
  });

  it('buyItem 钻石不足应失败', async () => {
    const { economy } = await createFixture();
    const diamondItem = economy.getShopItems().find(i => i.price_diamond > 0);
    if (diamondItem) {
      assert.strictEqual(economy.buyItem(1, diamondItem.id, 1).success, false);
    }
  });

  it('sellItem 背包没有的道具应失败', async () => {
    const { economy } = await createFixture();
    assert.strictEqual(economy.sellItem(1, 'nonexistent_999', 1).success, false);
  });

  it('getBalance 返回三币种对象', async () => {
    const { economy } = await createFixture();
    const b = economy.getBalance(1);
    assert.ok(typeof b.gold === 'number' && typeof b.diamond === 'number' && typeof b.heartCoin === 'number');
  });

  it('addItem 不存在的道具应失败', async () => {
    const { economy } = await createFixture();
    assert.strictEqual(economy.addItem(1, 'fake_xyz', 1).success, false);
  });

  it('removeItem 数量不足应失败', async () => {
    const { economy } = await createFixture();
    assert.strictEqual(economy.removeItem(1, 'food_kibble', 9999).success, false);
  });
});
