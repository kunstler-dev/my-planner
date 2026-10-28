import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totals, byCategory, monthlySeries, dailyAverage, toCSV } from '../src/renderer/js/finance-calc.js';
import { parseCount, parseChannelPage, windowStats, subscriberDelta, addSnapshot, mergePosts } from '../src/renderer/js/tg.js';
import { markdown } from '../src/renderer/js/markdown.js';

const E = [
  { id: '1', type: 'income', amount: 1000, category: 'Зарплата', date: '2026-10-01', note: '' },
  { id: '2', type: 'expense', amount: 300, category: 'Еда', date: '2026-10-02', note: 'обед; кофе' },
  { id: '3', type: 'expense', amount: 100, category: 'Транспорт', date: '2026-10-03', note: '' },
  { id: '4', type: 'expense', amount: 50, category: 'Еда', date: '2026-09-30', note: '' },
];

test('totals and categories', () => {
  assert.deepEqual(totals(E), { income: 1000, expense: 450, net: 550 });
  const cats = byCategory(
    E.filter((e) => e.date.startsWith('2026-10')),
    'expense',
  );
  assert.equal(cats[0].category, 'Еда');
  assert.equal(cats[0].sum, 300);
  assert.equal(cats[0].share, 0.75);
});

test('monthly series and daily average', () => {
  const s = monthlySeries(E, ['2026-09', '2026-10']);
  assert.equal(s[0].expense, 50);
  assert.equal(s[1].net, 600);
  assert.equal(dailyAverage(E, '2026-10', '2026-10-04'), 100);
  assert.equal(dailyAverage(E, '2026-09', '2026-10-04'), 50 / 30);
});

test('CSV quotes separators and uses comma decimals', () => {
  const csv = toCSV([{ ...E[1], amount: 12.5 }]);
  assert.match(csv, /2026-10-02;Расход;Еда;12,5;"обед; кофе"/);
});

test('parseCount', () => {
  assert.equal(parseCount('1.2K'), 1200);
  assert.equal(parseCount('9.23M'), 9230000);
  assert.equal(parseCount('15 312'), 15312);
  assert.equal(parseCount(''), 0);
});

test('parseChannelPage reads counters, posts, views and reactions', () => {
  const html = `
<div class="tgme_channel_info_header_title"><span dir="auto">Мой &amp; канал</span></div>
<div class="tgme_channel_info_header_username"><a href="https://t.me/mych">@mych</a></div>
<div class="tgme_channel_info_counter"><span class="counter_value">1.5K</span> <span class="counter_type">subscribers</span></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="mych/10">
<div class="tgme_widget_message_text js-message_text" dir="auto">Привет<br/>мир</div>
<div class="tgme_widget_message_reactions"><span class="tgme_reaction"><i class="emoji"><b>👍</b></i>12</span><span class="tgme_reaction"><tg-emoji emoji-id="1"></tg-emoji>1.1K</span></div>
<span class="tgme_widget_message_views">2.4K</span><time datetime="2026-10-20T10:00:00+00:00" class="time">10:00</time></div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message" data-post="mych/11">
<div class="tgme_widget_message_photo_wrap"></div><time class="message_video_duration">0:10</time>
<span class="tgme_widget_message_views">800</span><time datetime="2026-10-21T10:00:00+00:00" class="time">10:00</time></div></div>`;
  const r = parseChannelPage(html);
  assert.equal(r.title, 'Мой & канал');
  assert.equal(r.username, 'mych');
  assert.equal(r.subscribers, 1500);
  assert.equal(r.posts.length, 2);
  const p = r.posts[0];
  assert.deepEqual({ id: p.id, views: p.views, reactions: p.reactions, text: p.text }, { id: 10, views: 2400, reactions: 1112, text: 'Привет\nмир' });
  assert.equal(r.posts[1].media, 'photo');
  assert.equal(r.posts[1].date, '2026-10-21T10:00:00+00:00');
});

test('channel stats', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const posts = [
    { id: 3, date: '2026-10-28T10:00:00Z', views: 10, reactions: 0 }, // < 24 h old: counted, not averaged
    { id: 2, date: '2026-10-25T10:00:00Z', views: 100, reactions: 4 },
    { id: 1, date: '2026-10-10T10:00:00Z', views: 300, reactions: 2 },
  ];
  assert.deepEqual(windowStats(posts, 7, now), { count: 2, avgViews: 100, avgReactions: 4 });
  assert.equal(windowStats(posts, 30, now).avgViews, 200);

  let snaps = addSnapshot([], '2026-10-01', 100);
  snaps = addSnapshot(snaps, '2026-10-20', 130);
  snaps = addSnapshot(snaps, '2026-10-28', 150);
  snaps = addSnapshot(snaps, '2026-10-28', 155);
  assert.equal(snaps.length, 3);
  assert.equal(subscriberDelta(snaps, 7, '2026-10-28'), null);
  assert.deepEqual(subscriberDelta(snaps, 10, '2026-10-28'), { delta: 25, from: '2026-10-20' });
  assert.deepEqual(subscriberDelta(snaps, 30, '2026-10-28'), { delta: 55, from: '2026-10-01' });

  const stored = { 1: { id: 1, views: 1 } };
  assert.equal(
    mergePosts(
      stored,
      [
        { id: 1, views: 5 },
        { id: 2, views: 3 },
      ],
      1,
    ),
    1,
  );
  assert.equal(stored[1].views, 5);
});

test('markdown escapes HTML', () => {
  const html = markdown('**жирный** <script>x</script>\n- a\n- b\n\n```\n<b>\n```');
  assert.match(html, /<b>жирный<\/b> &lt;script&gt;/);
  assert.match(html, /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(html, /<pre><code>&lt;b&gt;<\/code><\/pre>/);
});

test('store migrates old data: one channel → channels, rubles → euro, games dropped', async () => {
  const { createRequire } = await import('node:module');
  const { normalize } = createRequire(import.meta.url)('../src/main/store.js');
  const d = normalize({
    settings: { currency: '₽', channel: 'mych' },
    channel: { title: 'Мой', username: 'mych', snapshots: [{ date: '2026-10-01', subscribers: 5 }], posts: {}, fetchedAt: 1 },
    games: { steamId: '1' },
  });
  assert.equal(d.settings.currency, '€');
  assert.equal(d.settings.grokMode, 'web');
  assert.deepEqual(
    d.channels.map((c) => c.username),
    ['mych'],
  );
  assert.equal(d.settings.activeChannel, 'mych');
  assert.equal('channel' in d, false);
  assert.equal('games' in d, false);
  assert.equal(normalize({ settings: { currency: '₴', grokMode: 'api' } }).settings.grokMode, 'api');
});
