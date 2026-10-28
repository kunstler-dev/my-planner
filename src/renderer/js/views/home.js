// Home: money, channels, career and game time at a glance; today's tasks and habits, upcoming payments.
import { state, update } from '../state.js';
import { h, icon, money, compact, uid, card, empty } from '../ui.js';
import { lineChart } from '../charts.js';
import { today, thisMonth, longToday, prettyDate, addDays } from '../dates.js';
import { totals, inMonth } from '../finance-calc.js';
import { postList, subscriberDelta } from '../tg.js';
import { entryModal, entryRow } from './finance.js';
import { askGrokAboutChannel, activeChannel } from './channel.js';
import { go } from '../app.js';
import { netWorth, upcoming, careerStats, playBalance, minutesText, budgetStatus } from '../planner-calc.js';
import { habitRow } from './tasks.js';

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

export function taskRow(t) {
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

export function homeView() {
  const m = totals(inMonth(state.data.finance, thisMonth()));
  const channels = state.data.channels;
  const ch = activeChannel();
  const posts = ch ? postList(ch) : [];
  const subs = channels.reduce((s, c) => s + (c.snapshots.at(-1)?.subscribers || 0), 0);
  const deltas = channels.map((c) => subscriberDelta(c.snapshots, 7, today())).filter(Boolean);
  const d7 = deltas.length ? deltas.reduce((s, d) => s + d.delta, 0) : null;
  const recent = [...state.data.finance].sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1)).slice(0, 5);
  const nw = netWorth(state.data.accounts, state.data.rates, state.data.settings.currency);
  const cs = careerStats(state.data.career.applications, today());
  const pb = playBalance(state.data, today());
  const soon = upcoming(state.data.recurring, today(), 7);
  const overBudget = budgetStatus(inMonth(state.data.finance, thisMonth()), state.data.budgets).filter((b) => b.share >= 0.9);

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
      tile('Всего денег', 'card', money(nw.total), state.data.accounts.map((a) => a.name.split(' ')[0]).join(' · '), () => go('accounts')),
      tile('Месяц', 'wallet', money(m.net, { sign: true }), `доходы ${money(m.income)} · расходы ${money(m.expense)}`, () => go('finance')),
      tile(channels.length > 1 ? `Подписчики · ${channels.length} канала` : 'Подписчики', 'users', subs ? compact(subs) : '—', subs ? (d7 != null ? `${d7 >= 0 ? '+' : '−'}${compact(Math.abs(d7))} за неделю` : channels.map((c) => `@${c.username}`).join(', ')) : 'канал не подключён', () => go('channel')),
      tile('Откликов за неделю', 'briefcase', `${cs.week} / ${state.data.career.weeklyGoal}`, cs.followUps.length ? `⏰ написать повторно: ${cs.followUps.length}` : `всего отправлено ${cs.sent}`, () => go('career')),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { alignItems: 'start' } },
      h(
        'div',
        { class: 'stack' },
        tasksCard(),
        card(
          'Привычки',
          h('button', { class: 'btn ghost sm', onclick: () => go('tasks') }, 'Все', icon('right', 14)),
          state.data.habits.length ? h('div', { class: 'list' }, state.data.habits.map((hb) => habitRow(hb, { compact: true }))) : empty('Добавь привычки во вкладке «Задачи и привычки».'),
        ),
      ),
      h(
        'div',
        { class: 'stack' },
        card(
          'Последние операции',
          h('button', { class: 'btn ghost sm', onclick: () => go('finance') }, 'Все', icon('right', 14)),
          recent.length ? h('div', { class: 'list' }, recent.map((e) => entryRow(e, { showDate: true }))) : empty('Записей пока нет.'),
        ),
        card(
          'Ближайшие платежи',
          null,
          soon.length
            ? h(
                'div',
                { class: 'list' },
                soon.map((r) =>
                  h('div', { class: 'list-row' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, r.title), h('div', { class: 'meta' }, prettyDate(r.next))), h('div', { class: `amount${r.type === 'expense' ? ' out' : ''}` }, money(r.type === 'income' ? r.amount : -r.amount, { sign: true }))),
                ),
              )
            : empty('На неделе обязательных платежей нет.'),
          overBudget.length > 0 && h('div', { class: 'meta', style: { marginTop: '8px' } }, `⚠ Бюджет почти исчерпан: ${overBudget.map((b) => b.category).join(', ')}`),
        ),
      ),
      h(
        'div',
        { class: 'stack' },
        h(
          'button',
          { class: 'card stat dark', style: { textAlign: 'left', cursor: 'pointer' }, onclick: () => go('play') },
          h('div', { class: 'stat-label' }, icon('gamepad', 16), 'Игровое время'),
          h('div', { class: 'stat-value' }, pb.balance > 0 ? minutesText(pb.balance) : '0 мин'),
          h('div', { class: 'stat-note' }, pb.balance < 0 ? `долг ${minutesText(-pb.balance)} — сначала дела` : `заработано за неделю ${minutesText(pb.earned)}`),
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
    ),
  );
}
