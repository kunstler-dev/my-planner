// Home: today's tasks, month money, channel at a glance, recent operations.
import { state, update } from '../state.js';
import { h, icon, money, compact, uid, card, empty } from '../ui.js';
import { lineChart } from '../charts.js';
import { today, thisMonth, longToday, prettyDate, addDays } from '../dates.js';
import { totals, inMonth } from '../finance-calc.js';
import { postList, windowStats, subscriberDelta } from '../tg.js';
import { entryModal, entryRow } from './finance.js';
import { askGrokAboutChannel, activeChannel } from './channel.js';
import { dotaRank, winrate, pct } from '../games-calc.js';
import { go } from '../app.js';

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return 'Доброй ночи';
  if (hr < 12) return 'Доброе утро';
  if (hr < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function tile(label, iconName, value, note, onclick) {
  return h(
    'button',
    { class: 'card stat', style: { textAlign: 'left', cursor: 'pointer' }, onclick },
    h('div', { class: 'stat-label' }, icon(iconName, 16), label),
    h('div', { class: 'stat-value' }, value),
    note && h('div', { class: 'stat-note' }, note),
  );
}

function taskRow(t) {
  const overdue = !t.done && t.date < today();
  return h(
    'div',
    { class: `list-row${t.done ? ' task-done' : ''}` },
    h(
      'button',
      {
        class: `check${t.done ? ' on' : ''}`,
        title: t.done ? 'Вернуть' : 'Готово',
        onclick: () =>
          update((d) => {
            const x = d.tasks.find((y) => y.id === t.id);
            x.done = !x.done;
            x.doneAt = x.done ? today() : null;
          }),
      },
      t.done && icon('check', 13),
    ),
    h('div', { class: 'grow' }, h('div', { class: 'title' }, t.title), overdue && h('div', { class: 'meta' }, `с ${prettyDate(t.date)}`)),
    h(
      'div',
      { class: 'hover-actions' },
      !t.done &&
        h(
          'button',
          {
            class: 'btn ghost sm',
            title: 'Перенести на завтра',
            onclick: () => update((d) => (d.tasks.find((y) => y.id === t.id).date = addDays(today(), 1))),
          },
          'Завтра',
        ),
      h(
        'button',
        { class: 'btn ghost sm icon-only', title: 'Удалить', onclick: () => update((d) => (d.tasks = d.tasks.filter((y) => y.id !== t.id))) },
        icon('trash', 15),
      ),
    ),
  );
}

function tasksCard() {
  const td = today();
  const list = state.data.tasks
    .filter((t) => (t.date <= td && !t.done) || (t.done && t.doneAt === td))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date));
  const upcoming = state.data.tasks.filter((t) => !t.done && t.date > td).sort((a, b) => a.date.localeCompare(b.date));
  const input = h('input', { class: 'input', placeholder: 'Добавить задачу на сегодня…', style: { flex: 1 } });
  const doneCount = list.filter((t) => t.done).length;
  return card(
    'Задачи на сегодня',
    list.length ? h('span', { class: 'muted' }, `${doneCount} из ${list.length}`) : null,
    h(
      'form',
      {
        class: 'row',
        style: { marginBottom: '6px' },
        onsubmit: (e) => {
          e.preventDefault();
          const title = input.value.trim();
          if (!title) return;
          update((d) => d.tasks.push({ id: uid(), title, date: td, done: false }));
          setTimeout(() => document.querySelector('.tasks-input')?.focus(), 0);
        },
      },
      (input.classList.add('tasks-input'), input),
      h('button', { class: 'btn primary icon-only', type: 'submit', title: 'Добавить' }, icon('plus', 16)),
    ),
    list.length ? h('div', { class: 'list' }, list.map(taskRow)) : empty('На сегодня задач нет.'),
    upcoming.length > 0 &&
      h(
        'div',
        { style: { marginTop: '10px' } },
        h('div', { class: 'day-head' }, 'Дальше'),
        h('div', { class: 'list' }, upcoming.slice(0, 5).map((t) => h('div', { class: 'list-row' }, h('div', { class: 'grow title' }, t.title), h('span', { class: 'meta' }, prettyDate(t.date))))),
      ),
  );
}

function gamesCard() {
  const g = state.data.games;
  const open = (tab) => () => {
    update((d) => (d.games.tab = tab), { silent: true });
    go('games');
  };
  const col = (tab, title, value, note) =>
    h(
      'button',
      { class: 'game-col', onclick: open(tab) },
      h('div', { class: 'stat-label' }, title),
      h('div', { class: 'game-value' }, value),
      h('div', { class: 'stat-note' }, note),
    );
  const dota = g.dota?.data;
  const dl = g.deadlock?.data;
  const cs = g.cs?.data;
  const games30 = dota ? dota.wl30.win + dota.wl30.lose : 0;
  return h(
    'div',
    { style: { marginTop: '16px' } },
    card(
      'Игры',
      h('button', { class: 'btn ghost sm', onclick: () => go('games') }, g.steamId ? 'Открыть' : 'Подключить Steam', icon('right', 14)),
      g.steamId
        ? h(
            'div',
            { class: 'grid cols-3', style: { gap: '12px' } },
            col('dota', 'Dota 2', dota ? dotaRank(dota.rankTier, dota.leaderboard) : '—', dota ? (games30 ? `винрейт за 30 дней ${pct(winrate(dota.wl30.win, games30))}` : 'за 30 дней игр нет') : 'нет данных'),
            col('deadlock', 'Deadlock', dl ? dl.rank : '—', dl ? `винрейт ${pct(winrate(dl.total.wins, dl.total.matches))} · ${dl.total.matches} матчей` : 'нет данных'),
            col('cs', 'CS2', cs?.premier ? cs.premier.toLocaleString('ru-RU') : '—', cs ? `Premier · винрейт ${pct(cs.winrate)}` : 'нет данных'),
          )
        : empty('Подключи профиль Steam — здесь будут ранги и винрейт в Dota 2, Deadlock и CS2.'),
    ),
  );
}

export function homeView() {
  const m = totals(inMonth(state.data.finance, thisMonth()));
  const channels = state.data.channels;
  const ch = activeChannel();
  const posts = ch ? postList(ch) : [];
  const subs = channels.reduce((s, c) => s + (c.snapshots.at(-1)?.subscribers || 0), 0);
  const deltas = channels.map((c) => subscriberDelta(c.snapshots, 7, today())).filter(Boolean);
  const d7 = deltas.length ? deltas.reduce((s, d) => s + d.delta, 0) : null;
  const w7 = windowStats(posts, 7);
  const recent = [...state.data.finance].sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1)).slice(0, 6);

  return h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head' },
      h('div', {}, h('h1', {}, `${greeting()}!`), h('div', { class: 'sub' }, longToday())),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', onclick: () => entryModal({ type: 'income' }) }, icon('plus', 16), 'Доход'),
        h('button', { class: 'btn primary', onclick: () => entryModal({ type: 'expense' }) }, icon('plus', 16), 'Расход'),
      ),
    ),
    h(
      'div',
      { class: 'grid cols-4', style: { marginBottom: '16px' } },
      tile('Доходы за месяц', 'up', money(m.income), null, () => go('finance')),
      tile('Расходы за месяц', 'down', money(m.expense), `итог ${money(m.net, { sign: true })}`, () => go('finance')),
      tile(channels.length > 1 ? `Подписчики · ${channels.length} канала` : 'Подписчики', 'users', subs ? compact(subs) : '—', subs ? (d7 != null ? `${d7 >= 0 ? '+' : '−'}${compact(Math.abs(d7))} за неделю` : channels.map((c) => `@${c.username}`).join(', ')) : 'канал не подключён', () => go('channel')),
      tile('Средний охват · 7 дней', 'eye', w7.avgViews ? compact(w7.avgViews) : '—', ch ? `@${ch.username} · ${w7.count} постов за неделю` : null, () => go('channel')),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { alignItems: 'start' } },
      tasksCard(),
      card(
        'Последние операции',
        h('button', { class: 'btn ghost sm', onclick: () => go('finance') }, 'Все', icon('right', 14)),
        recent.length ? h('div', { class: 'list' }, recent.map((e) => entryRow(e, { showDate: true }))) : empty('Записей пока нет.'),
      ),
      card(
        ch ? `@${ch.username}` : 'Telegram-канал',
        h(
          'div',
          { class: 'row' },
          channels.length > 1 &&
            h(
              'div',
              { class: 'seg' },
              channels.map((c, i) =>
                h('button', { class: c === ch ? 'on' : '', title: `@${c.username}`, onclick: () => update((d) => (d.settings.activeChannel = c.username)) }, String(i + 1)),
              ),
            ),
          h('button', { class: 'btn ghost sm', onclick: () => go('channel') }, 'Открыть', icon('right', 14)),
        ),
        posts.length > 1
          ? h(
              'div',
              { class: 'stack', style: { gap: '12px' } },
              lineChart({
                points: posts
                  .slice(0, 20)
                  .reverse()
                  .map((p) => ({ label: '', value: p.views, tip: `${p.views.toLocaleString('ru-RU')} просмотров\n${(p.text || '').slice(0, 50)}` })),
                height: 170,
                width: 340,
                format: compact,
              }),
              h('div', { class: 'muted', style: { fontSize: '12.5px' } }, 'Охват последних 20 постов'),
              h('button', { class: 'btn', onclick: askGrokAboutChannel }, icon('spark', 16), 'Разбор канала от Grok'),
            )
          : h('div', {}, empty('Подключи канал, чтобы видеть подписчиков и охваты.'), h('button', { class: 'btn', onclick: () => go('channel') }, 'Подключить')),
      ),
    ),
    gamesCard(),
  );
}
