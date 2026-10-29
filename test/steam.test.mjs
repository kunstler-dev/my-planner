// Steam profile and OpenDota helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSteamProfile, dotaAccountId, medalFromRankTier, matchWon, matchRows, winRate, topHeroes, wishlistDiff } from '../src/renderer/js/games-calc.js';

test('Steam profile input', () => {
  assert.deepEqual(parseSteamProfile('https://steamcommunity.com/profiles/76561197960287930/'), { id64: '76561197960287930' });
  assert.deepEqual(parseSteamProfile('76561197960287930'), { id64: '76561197960287930' });
  assert.deepEqual(parseSteamProfile('https://steamcommunity.com/id/some_name/'), { vanity: 'some_name' });
  assert.deepEqual(parseSteamProfile('some_name'), { vanity: 'some_name' });
  assert.equal(parseSteamProfile('https://example.com'), null);
  assert.equal(parseSteamProfile(''), null);
});

test('Dota account id = SteamID64 − 76561197960265728', () => {
  assert.equal(dotaAccountId('76561197960287930'), 22202);
  assert.equal(dotaAccountId('123'), null);
});

test('medal from rank_tier', () => {
  assert.deepEqual(medalFromRankTier(54), { medal: 4, star: 4 });
  assert.deepEqual(medalFromRankTier(11), { medal: 0, star: 1 });
  assert.deepEqual(medalFromRankTier(80), { medal: 7, star: null });
  assert.equal(medalFromRankTier(null), null);
  assert.equal(medalFromRankTier(5), null);
});

const matches = [
  { match_id: 1, hero_id: 14, player_slot: 1, radiant_win: true, kills: 10, deaths: 2, assists: 7, duration: 2400, start_time: 1793000000 },
  { match_id: 2, hero_id: 14, player_slot: 130, radiant_win: true, kills: 3, deaths: 9, assists: 4, duration: 1830, start_time: 1792990000 },
  { match_id: 3, hero_id: 8, player_slot: 128, radiant_win: false, kills: 5, deaths: 5, assists: 5, duration: 2100, start_time: 1792980000 },
];

test('matches: win or loss by side, rows, win rate, top heroes', () => {
  assert.deepEqual(matches.map(matchWon), [true, false, true]);
  const rows = matchRows(matches, { 14: 'Pudge', 8: 'Juggernaut' });
  assert.deepEqual(rows[0], { id: 1, hero: 'Pudge', win: true, k: 10, d: 2, a: 7, minutes: 40, date: new Date(1793000000 * 1000).toISOString().slice(0, 10) });
  assert.equal(rows[1].minutes, 31);
  assert.equal(winRate({ win: 15, lose: 5 }), 0.75);
  assert.equal(winRate({ win: 0, lose: 0 }), null);
  assert.deepEqual(topHeroes(matches, { 14: 'Pudge', 8: 'Juggernaut' }), [
    { hero: 'Pudge', games: 2, wins: 1 },
    { hero: 'Juggernaut', games: 1, wins: 1 },
  ]);
});

test('wishlist sync never deletes, only marks games gone from Steam', () => {
  const items = [{ id: 1, fromSteam: true }, { id: 2 }, { id: 3, fromSteam: true, steamRemoved: true }, { id: 4, fromSteam: true }];
  assert.deepEqual(wishlistDiff(items, [1, 3, 5]), { add: [5], removed: [4], back: [3] });
});
