import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  parseSteamInput,
  parseSteamXml,
  accountIdOf,
  dotaRank,
  deadlockRank,
  compactDota,
  compactDeadlock,
  compactCS,
  gameSummary,
} from '../src/renderer/js/games-calc.js';

const require = createRequire(import.meta.url);
const { normalize } = require('../src/main/store.js');

test('parseSteamInput understands links, ids and vanity names', () => {
  assert.deepEqual(parseSteamInput('https://steamcommunity.com/profiles/76561198047011640/'), { id64: '76561198047011640' });
  assert.deepEqual(parseSteamInput('https://steamcommunity.com/id/some-name/'), { vanity: 'some-name' });
  assert.deepEqual(parseSteamInput('76561198047011640'), { id64: '76561198047011640' });
  assert.deepEqual(parseSteamInput('86745912'), { id64: '76561198047011640' }); // Dota friend id
  assert.deepEqual(parseSteamInput('gabelogannewell'), { vanity: 'gabelogannewell' });
  assert.equal(parseSteamInput(''), null);
  assert.equal(parseSteamInput('не ссылка !!'), null);
  assert.equal(accountIdOf('76561198047011640'), 86745912);
});

test('parseSteamXml', () => {
  const xml = `<?xml version="1.0"?><profile>
	<steamID64>76561197960287930</steamID64>
	<steamID><![CDATA[Rabscuttle]]></steamID>
	<avatarMedium><![CDATA[https://avatars.fastly.steamstatic.com/x_medium.jpg]]></avatarMedium></profile>`;
  assert.deepEqual(parseSteamXml(xml), {
    id64: '76561197960287930',
    persona: 'Rabscuttle',
    avatar: 'https://avatars.fastly.steamstatic.com/x_medium.jpg',
    privacy: '',
  });
  assert.deepEqual(parseSteamXml('<response><error><![CDATA[The specified profile could not be found.]]></error></response>'), {
    error: 'The specified profile could not be found.',
  });
});

test('ranks', () => {
  assert.equal(dotaRank(0), 'Без ранга');
  assert.equal(dotaRank(54), 'Легенда 4');
  assert.equal(dotaRank(70), 'Божество');
  assert.equal(dotaRank(80, 117), 'Титан #117');
  const ranks = [
    { tier: 5, name: 'Mystic' },
    { tier: 11, name: 'Eternus' },
  ];
  assert.equal(deadlockRank(114, ranks), 'Eternus 4');
  assert.equal(deadlockRank(53, ranks), 'Mystic 3');
  assert.equal(deadlockRank(null, ranks), 'Без ранга');
});

test('compactDota decides wins from the player slot', () => {
  const d = compactDota(
    {
      player: { profile: { personaname: 'me' }, rank_tier: 63 },
      wl: { win: 10, lose: 5 },
      wl30: { win: 2, lose: 1 },
      recent: [
        { match_id: 1, hero_id: 53, player_slot: 0, radiant_win: true, kills: 5, deaths: 1, assists: 7, gold_per_min: 600, xp_per_min: 700, last_hits: 200, duration: 2000, start_time: 100 },
        { match_id: 2, hero_id: 1, player_slot: 130, radiant_win: true, kills: 1, deaths: 9, assists: 2, gold_per_min: 300, xp_per_min: 400, last_hits: 50, duration: 1800, start_time: 50 },
      ],
      heroes: [
        { hero_id: 53, games: 7, win: 5 },
        { hero_id: 2, games: 0, win: 0 },
      ],
    },
    { 1: 'Anti-Mage', 53: "Nature's Prophet" },
  );
  assert.deepEqual(
    d.recent.map((m) => [m.hero, m.win]),
    [
      ["Nature's Prophet", true],
      ['Anti-Mage', false],
    ],
  );
  assert.equal(d.recent[0].start, 100000);
  assert.deepEqual(d.heroes, [{ hero: "Nature's Prophet", games: 7, wins: 5 }]);
});

test('compactDeadlock: wins, last 30 days and rank from the latest ranked match', () => {
  const now = Date.now() / 1000;
  const m = (id, start, team, result, badge) => ({
    match_id: id,
    hero_id: 7,
    start_time: start,
    player_team: team,
    match_result: result,
    player_kills: 3,
    player_deaths: 2,
    player_assists: 5,
    net_worth: 30000,
    last_hits: 100,
    match_duration_s: 1900,
    ranked_display_badge: badge,
  });
  const d = compactDeadlock(
    {
      history: [m(1, now - 40 * 86400, 0, 1, 52), m(2, now - 86400, 1, 1, 0), m(3, now - 3600, 0, 0, 0)],
    },
    { 7: 'Wraith' },
    [{ tier: 5, name: 'Mystic' }],
  );
  assert.equal(d.rank, 'Mystic 2');
  assert.deepEqual(d.total, { matches: 3, wins: 2 });
  assert.deepEqual(d.last30, { matches: 2, wins: 2 });
  assert.equal(d.recent[0].id, 3);
  assert.deepEqual(d.heroes, [{ hero: 'Wraith', games: 3, wins: 2, kda: 4, nwpm: Math.round(((3 * 30000) / (3 * 1900)) * 60) }]);
});

test('compactCS keeps ranks, ratings and recent matches', () => {
  const d = compactCS({
    name: 'p',
    winrate: 0.53,
    total_matches: 100,
    ranks: { premier: 25482, faceit: 10, faceit_elo: 3555, leetify: 3.45 },
    rating: { aim: 97 },
    stats: { accuracy_head: 27 },
    recent_matches: [{ id: 'a', finished_at: '2026-10-26T17:39:09.000Z', map_name: 'de_dust2', outcome: 'win', score: [13, 11], leetify_rating: 0.14, accuracy_head: 60, rank: 25482, rank_type: 11 }],
  });
  assert.equal(d.premier, 25482);
  assert.equal(d.recent[0].map, 'dust2');
  assert.equal(d.recent[0].premier, 25482);
  assert.match(gameSummary('cs', d), /Premier: 25482/);
});

test('store migrates v1 data: one channel → channels, rubles → euro', () => {
  const d = normalize({
    settings: { currency: '₽', channel: 'mych' },
    channel: { title: 'Мой', username: 'mych', snapshots: [{ date: '2026-10-01', subscribers: 5 }], posts: {}, fetchedAt: 1 },
  });
  assert.equal(d.settings.currency, '€');
  assert.equal(d.channels.length, 1);
  assert.equal(d.channels[0].username, 'mych');
  assert.equal(d.settings.activeChannel, 'mych');
  assert.equal('channel' in d, false);
  assert.equal('channel' in d.settings, false);
  assert.equal(d.games.tab, 'dota');
  assert.equal(normalize({ settings: { currency: '₴' } }).settings.currency, '₴');
});
