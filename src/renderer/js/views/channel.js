// Telegram channel analytics from the public page t.me/s/<name>: subscribers over time, reach, ERR,
// best time to post, top posts. Each refresh stores a subscriber snapshot for the day.
import { state, update, rerender } from '../state.js';
import { h, icon, compact, card, empty, toast } from '../ui.js';
import { openModal } from '../modal.js';
import { lineChart } from '../charts.js';
import { today, prettyDate, WEEKDAYS } from '../dates.js';
import { parseChannelPage, mergePosts, addSnapshot, postList, windowStats, subscriberDelta, timing, summaryForAI } from '../tg.js';
import { go } from '../app.js';

const STALE_MS = 3 * 3600 * 1000;
let loading = false;

const ERRORS = {
  bad_name: 'Неверное имя канала',
  not_public: 'Канал не найден или закрыт. Аналитика работает только для публичных каналов с @username.',
  network: 'Нет связи с t.me. Проверь интернет или VPN.',
};

export async function refreshChannel(username, { silent = false } = {}) {
  if (loading) return;
  loading = true;
  if (!silent) rerender();
  try {
    const name = username.replace(/^@|^https?:\/\/t\.me\/(s\/)?/g, '').trim();
    const first = await window.api.tgFetch(name);
    if (!first.ok) throw new Error(ERRORS[first.error] || first.message || first.error);
    const page = parseChannelPage(first.html);
    if (!page.title) throw new Error(ERRORS.not_public);
    const switching = state.data.channel.username.toLowerCase() !== (page.username || name).toLowerCase();
    const posts = switching ? {} : { ...state.data.channel.posts };
    const now = Date.now();
    let added = mergePosts(posts, page.posts, now);
    // Older pages: deep on the first load, a little on later refreshes (to update recent views).
    const pages = Object.keys(posts).length < 80 ? 5 : 1;
    let before = Math.min(...page.posts.map((p) => p.id));
    for (let i = 0; i < pages && Number.isFinite(before) && before > 1; i++) {
      const more = await window.api.tgFetch(name, before);
      if (!more.ok) break;
      const older = parseChannelPage(more.html).posts.filter((p) => p.id < before);
      if (!older.length) break;
      added += mergePosts(posts, older, now);
      before = Math.min(...older.map((p) => p.id));
    }
    update((d) => {
      d.settings.channel = page.username || name;
      d.channel = {
        title: page.title,
        username: page.username || name,
        snapshots: addSnapshot(switching ? [] : d.channel.snapshots, today(), page.subscribers),
        posts,
        fetchedAt: now,
      };
    });
    if (!silent) toast(added ? `Обновлено, новых постов: ${added}` : 'Данные обновлены');
  } catch (err) {
    toast(err.message);
  } finally {
    loading = false;
    rerender();
  }
}

function connectCard() {
  const input = h('input', { class: 'input', placeholder: '@username или ссылка t.me/…', style: { flex: 1 } });
  const submit = () => input.value.trim() && refreshChannel(input.value.trim());
  return card(
    'Подключить канал',
    null,
    h(
      'p',
      { class: 'muted', style: { marginTop: 0 } },
      'Данные берутся с публичной страницы канала t.me/s/…: подписчики, просмотры и реакции последних постов. Бот и ключи не нужны. ' +
        'Динамика подписчиков копится с этого момента: при каждом обновлении сохраняется значение за день.',
    ),
    h(
      'form',
      { class: 'row', onsubmit: (e) => (e.preventDefault(), submit()) },
      input,
      h('button', { class: 'btn primary', type: 'submit', disabled: loading }, loading ? 'Загружаю…' : 'Подключить'),
    ),
  );
}

function snapshotModal() {
  const date = h('input', { class: 'input', type: 'date', value: today(), required: true });
  const subs = h('input', { class: 'input', type: 'number', min: '0', required: true, placeholder: 'Например, 1250' });
  openModal(
    'Подписчики за дату',
    h(
      'div',
      { class: 'stack', style: { gap: '12px' } },
      h('p', { class: 'muted', style: { margin: 0 } }, 'Можно внести прошлые значения (например, из TGStat), чтобы график роста начинался раньше.'),
      h('div', { class: 'grid cols-2', style: { gap: '12px' } }, h('label', { class: 'field' }, 'Дата', date), h('label', { class: 'field' }, 'Подписчиков', subs)),
    ),
    {
      onSubmit: () => {
        const n = parseInt(subs.value, 10);
        if (!n) return false;
        update((d) => (d.channel.snapshots = addSnapshot(d.channel.snapshots, date.value, n)));
      },
    },
  );
}

const pct = (v) => `${(v * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
const postUrl = (p) => `https://t.me/${state.data.channel.username}/${p.id}`;
const when = (p) => new Date(p.date).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function postRow(p, subs) {
  return h(
    'a',
    { class: 'list-row', href: postUrl(p), target: '_blank', style: { color: 'inherit', textDecoration: 'none' } },
    h(
      'div',
      { class: 'grow' },
      h('div', { class: 'title post-text' }, p.text || (p.media ? `[${p.media}]` : '(без текста)')),
      h('div', { class: 'meta' }, `${when(p)}${p.media ? ` · ${p.media}` : ''}`),
    ),
    h('div', { class: 'badge', title: 'Реакции' }, `♥ ${compact(p.reactions)}`),
    h('div', { class: 'amount', title: subs ? `${pct(p.views / subs)} от подписчиков` : '' }, icon('eye', 15), ' ', compact(p.views)),
  );
}

function tile(label, value, note, dark) {
  return h(
    'div',
    { class: `card stat${dark ? ' dark' : ''}` },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-value' }, value),
    note && h('div', { class: 'stat-note' }, note),
  );
}

function heatmap(t) {
  const max = Math.max(1, ...t.weekdays.map((d) => d.avg), ...t.slots.map((s) => s.avg));
  const cell = (avg, n) => {
    const k = n ? avg / max : 0;
    return h(
      'div',
      {
        class: 'heat-cell',
        title: n ? `${compact(avg)} просмотров в среднем, постов: ${n}` : 'Нет постов',
        style: {
          background: n ? `color-mix(in srgb, var(--ink) ${Math.round(8 + k * 82)}%, var(--card))` : 'var(--card)',
          color: k > 0.5 ? 'var(--invert)' : 'var(--ink)',
        },
      },
      n ? compact(avg) : '—',
    );
  };
  const bestDay = t.weekdays.reduce((b, d, i) => (d.n && d.avg > (t.weekdays[b]?.avg || 0) ? i : b), 0);
  const bestSlot = t.slots.reduce((b, s, i) => (s.n && s.avg > (t.slots[b]?.avg || 0) ? i : b), 0);
  return h(
    'div',
    { class: 'stack', style: { gap: '14px' } },
    h('div', { class: 'heat', style: { gridTemplateColumns: 'repeat(7, 1fr)' } }, WEEKDAYS.map((w) => h('div', { class: 'heat-label' }, w)), t.weekdays.map((d) => cell(d.avg, d.n))),
    h(
      'div',
      { class: 'heat', style: { gridTemplateColumns: 'repeat(8, 1fr)' } },
      t.slots.map((s) => h('div', { class: 'heat-label' }, `${s.from}–${s.from + 3}`)),
      t.slots.map((s) => cell(s.avg, s.n)),
    ),
    h(
      'div',
      { class: 'muted', style: { fontSize: '12.5px' } },
      `Лучше всего заходят посты в ${['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'][bestDay]}, ` +
        `с ${t.slots[bestSlot].from}:00 до ${t.slots[bestSlot].from + 3}:00 (по твоему времени). Чем больше постов, тем точнее.`,
    ),
  );
}

export function askGrokAboutChannel() {
  const summary = summaryForAI(state.data.channel, today());
  go('grok', {
    prompt:
      'Проанализируй мой Telegram-канал по этим данным. Что работает лучше всего, что проседает, когда лучше публиковать, ' +
      'какие 5 конкретных шагов помогут вырасти по подписчикам и охватам в ближайший месяц?\n\n' +
      summary,
  });
}

export function channelView() {
  const ch = state.data.channel;
  if (!ch.username) {
    return h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Telegram-канал'), h('div', { class: 'sub' }, 'Аналитика публичного канала'))), connectCard());
  }
  if (!loading && Date.now() - ch.fetchedAt > STALE_MS) setTimeout(() => refreshChannel(ch.username, { silent: true }), 0);

  const posts = postList(ch);
  const subs = ch.snapshots.at(-1)?.subscribers || 0;
  const w7 = windowStats(posts, 7);
  const w30 = windowStats(posts, 30);
  const d7 = subscriberDelta(ch.snapshots, 7, today());
  const d30 = subscriberDelta(ch.snapshots, 30, today());
  const last30 = posts.slice(0, 30).reverse();
  const top = [...posts].sort((a, b) => b.views - a.views).slice(0, 7);
  const fmtDelta = (d) => (d ? `${d.delta >= 0 ? '+' : '−'}${compact(Math.abs(d.delta))} с ${prettyDate(d.from)}` : 'динамика появится со временем');

  return h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        {},
        h('h1', {}, ch.title),
        h(
          'div',
          { class: 'sub' },
          h('a', { href: `https://t.me/${ch.username}`, target: '_blank', style: { color: 'inherit' } }, `@${ch.username}`),
          ` · обновлено ${ch.fetchedAt ? new Date(ch.fetchedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}`,
        ),
      ),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn ghost',
            onclick: () => {
              if (confirm('Отключить канал? Сохранённая статистика будет удалена.')) {
                update((d) => {
                  d.settings.channel = '';
                  d.channel = { title: '', username: '', snapshots: [], posts: {}, fetchedAt: 0 };
                });
              }
            },
          },
          'Сменить канал',
        ),
        h('button', { class: 'btn', disabled: loading, onclick: () => refreshChannel(ch.username) }, icon('refresh', 16), loading ? 'Обновляю…' : 'Обновить'),
        h('button', { class: 'btn primary', disabled: !posts.length, onclick: askGrokAboutChannel }, icon('spark', 16), 'Разбор от Grok'),
      ),
    ),
    h(
      'div',
      { class: 'grid cols-4', style: { marginBottom: '16px' } },
      tile('Подписчики', compact(subs), d7 ? fmtDelta(d7) : fmtDelta(d30), true),
      tile('Средний охват · 7 дней', w7.avgViews ? compact(w7.avgViews) : '—', `за 30 дней: ${w30.avgViews ? compact(w30.avgViews) : '—'}`),
      tile('ERR · 30 дней', subs ? pct(w30.avgViews / subs) : '—', 'охват поста / подписчики'),
      tile('Постов · 7 дней', String(w7.count), `за 30 дней: ${w30.count} · реакций в среднем ${compact(w30.avgReactions)}`),
    ),
    h(
      'div',
      { class: 'grid cols-2', style: { marginBottom: '16px' } },
      card(
        'Подписчики',
        h('button', { class: 'btn ghost sm', onclick: snapshotModal }, icon('plus', 15), 'Внести вручную'),
        ch.snapshots.length > 1
          ? lineChart({
              points: ch.snapshots.slice(-90).map((s) => ({ label: s.date.slice(8, 10) + '.' + s.date.slice(5, 7), value: s.subscribers, tip: `${prettyDate(s.date)}\n${s.subscribers.toLocaleString('ru-RU')} подписчиков` })),
              format: compact,
              labelEvery: Math.ceil(Math.min(90, ch.snapshots.length) / 8),
            })
          : empty('График появится, когда накопится хотя бы два дня. Заходи сюда регулярно или внеси прошлые значения вручную.'),
      ),
      card(
        'Охват последних постов',
        null,
        last30.length > 1
          ? lineChart({
              points: last30.map((p) => ({ label: `#${p.id}`, value: p.views, tip: `${when(p)}\n${p.views.toLocaleString('ru-RU')} просмотров\n${(p.text || '').slice(0, 60)}` })),
              format: compact,
              labelEvery: 6,
            })
          : empty('Постов пока нет'),
      ),
    ),
    h(
      'div',
      { class: 'grid cols-2', style: { alignItems: 'start' } },
      h('div', { class: 'stack' }, card('Когда публиковать', null, posts.length ? heatmap(timing(posts.slice(0, 150))) : empty('Нужны посты')), card('Топ постов по охвату', null, top.length ? h('div', { class: 'list' }, top.map((p) => postRow(p, subs))) : empty('Нет данных'))),
      card('Последние посты', h('span', { class: 'muted' }, `в базе: ${posts.length}`), posts.length ? h('div', { class: 'list' }, posts.slice(0, 15).map((p) => postRow(p, subs))) : empty('Нет данных')),
    ),
  );
}
