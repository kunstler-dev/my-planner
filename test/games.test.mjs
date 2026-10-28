import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSteamAppId,
  applyPrice,
  wishlistSummary,
  dotaMedal,
  faceitLevel,
  faceitToNext,
  deadlockValue,
  deadlockName,
  rankProgress,
  clipStats,
} from '../src/renderer/js/games-calc.js';

test('Steam app id from a link or a number', () => {
  assert.equal(parseSteamAppId('https://store.steampowered.com/app/1245620/ELDEN_RING/'), 1245620);
  assert.equal(parseSteamAppId('570'), 570);
  assert.equal(parseSteamAppId('elden ring'), null);
});

test('prices: history per day, lowest price, discounts and targets', () => {
  let item = { id: 1, name: 'X', target: 20, history: [] };
  item = applyPrice(item, { initial: 3999, final: 3999, discount_percent: 0 }, '2026-10-01');
  item = applyPrice(item, { initial: 3999, final: 1999, discount_percent: 50 }, '2026-10-10');
  item = applyPrice(item, { initial: 3999, final: 1599, discount_percent: 60 }, '2026-10-10');
  assert.equal(item.price, 15.99);
  assert.equal(item.initial, 39.99);
  assert.equal(item.discount, 60);
  assert.equal(item.lowest, 15.99);
  assert.equal(item.history.length, 2);
  assert.equal(item.currency, '₴'); // overview without a currency code
  const ua = applyPrice({ ...item, currency: '€' }, { currency: 'UAH', initial: 22500, final: 22500, discount_percent: 0 }, '2026-10-11');
  assert.deepEqual([ua.currency, ua.price, ua.history.length, ua.target], ['₴', 225, 1, null]);
  const free = applyPrice({ id: 2 }, null, '2026-10-10');
  assert.equal(free.price, null);
  const s = wishlistSummary([item, free, { price: 10, initial: 10, discount: 0, target: 5 }]);
  assert.equal(wishlistSummary([{ price: 100, initial: 100, currency: '₴' }], (v, c) => (c === '₴' ? v / 50 : v)).total, 2);
  assert.equal(s.onSale, 1);
  assert.equal(s.atTarget, 1);
  assert.ok(Math.abs(s.saving - 24) < 1e-9);
  assert.ok(Math.abs(s.total - 25.99) < 1e-9);
});

test('Dota medals, FACEIT levels and Deadlock ranks', () => {
  assert.equal(dotaMedal(0), 'Рекрут 1');
  assert.equal(dotaMedal(3100), 'Легенда 1');
  assert.equal(dotaMedal(4700), 'Божество 1');
  assert.equal(dotaMedal(6000), 'Титан');
  assert.equal(faceitLevel(400), 1);
  assert.equal(faceitLevel(1051), 5);
  assert.equal(faceitLevel(2001), 10);
  assert.equal(faceitToNext(1000), 51);
  assert.equal(faceitToNext(2500), null);
  assert.equal(deadlockValue(11, 6), 71);
  assert.equal(deadlockName(71), 'Eternus 6');
  assert.equal(deadlockName(deadlockValue(5, 3)), 'Mystic 3');
});

test('rank progress over 30 days and to the goal', () => {
  const p = rankProgress(
    [
      { date: '2026-09-01', value: 3000 },
      { date: '2026-09-25', value: 3100 },
      { date: '2026-10-20', value: 3300 },
    ],
    4000,
    '2026-10-28',
  );
  assert.deepEqual(p, { current: 3300, change30: 200, toGoal: 700, best: 3300 });
  assert.equal(rankProgress([], null, '2026-10-28').current, null);
});

test('clip stats count only published clips', () => {
  const s = clipStats([
    { status: 'published', views: { tiktok: 1000, shorts: 500, youtube: 0 } },
    { status: 'published', views: { tiktok: 200 } },
    { status: 'idea', views: { tiktok: 99999 } },
  ]);
  assert.equal(s.published, 2);
  assert.equal(s.inWork, 1);
  assert.equal(s.total, 1700);
  assert.equal(s.byPlatform.tiktok, 1200);
  assert.equal(s.avg, 850);
});
