// Home: money, channels, career and game time at a glance; today's tasks and habits, upcoming payments.
import { state, update } from '../state.js';
import { h, icon, money, compact, uid, card, empty } from '../ui.js';
import { t, num } from '../i18n.js';
import { lineChart } from '../charts.js';
import { today, thisMonth, longToday, prettyDate, addDays } from '../dates.js';
import { totals, inMonth } from '../finance-calc.js';
import { postList, subscriberDelta } from '../tg.js';
import { entryModal, entryRow } from './finance.js';
import { askGrokAboutChannel, activeChannel } from './channel.js';
import { go } from '../app.js';
import { netWorth, upcoming, careerStats, budgetStatus } from '../planner-calc.js';
import { catLabel, accountName } from '../labels.js';
import { gamesCard } from './games.js';
import { habitRow } from './tasks.js';

function greeting() {
  const hr = new Date().getHours();
  if (hr < 5) return t('home.greet.night');
  if (hr < 12) return t('home.greet.morning');
  if (hr < 18) return t('home.greet.day');
  return t('home.greet.evening');
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

export function taskRow(task) {
  const overdue = !task.done && task.date < today();
  return h(
    'div',
    { class: `list-row${task.done ? ' task-done' : ''}` },
    h(
      'button',
      {
        class: `check${task.done ? ' on' : ''}`,
        title: task.done ? t('tasks.undo') : t('tasks.done'),
        onclick: () =>
          update((d) => {
            const x = d.tasks.find((y) => y.id === task.id);
            x.done = !x.done;
            x.doneAt = x.done ? today() : null;
          }),
      },
      task.done && icon('check', 13),
    ),
    h('div', { class: 'grow' }, h('div', { class: 'title' }, task.title), overdue && h('div', { class: 'meta' }, t('tasks.since', { date: prettyDate(task.date) }))),
    h(
      'div',
      { class: 'hover-actions' },
      !task.done &&
        h(
          'button',
          {
            class: 'btn ghost sm',
            title: t('tasks.moveTomorrow'),
            onclick: () => update((d) => (d.tasks.find((y) => y.id === task.id).date = addDays(today(), 1))),
          },
          t('tasks.tomorrow'),
        ),
      h(
        'button',
        { class: 'btn ghost sm icon-only', title: t('common.delete'), onclick: () => update((d) => (d.tasks = d.tasks.filter((y) => y.id !== task.id))) },
        icon('trash', 15),
      ),
    ),
  );
}

function tasksCard() {
  const td = today();
  const list = state.data.tasks
    .filter((x) => (x.date <= td && !x.done) || (x.done && x.doneAt === td))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.date.localeCompare(b.date));
  const later = state.data.tasks.filter((x) => !x.done && x.date > td).sort((a, b) => a.date.localeCompare(b.date));
  const input = h('input', { class: 'input', placeholder: t('home.addTask'), style: { flex: 1 } });
  const doneCount = list.filter((x) => x.done).length;
  return card(
    t('home.todayTasks'),
    list.length ? h('span', { class: 'muted' }, t('common.nOfM', { n: doneCount, m: list.length })) : null,
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
      h('button', { class: 'btn primary icon-only', type: 'submit', title: t('common.add') }, icon('plus', 16)),
    ),
    list.length ? h('div', { class: 'list' }, list.map(taskRow)) : empty(t('home.noTasks')),
    later.length > 0 &&
      h(
        'div',
        { style: { marginTop: '10px' } },
        h('div', { class: 'day-head' }, t('home.later')),
        h('div', { class: 'list' }, later.slice(0, 5).map((x) => h('div', { class: 'list-row' }, h('div', { class: 'grow title' }, x.title), h('span', { class: 'meta' }, prettyDate(x.date))))),
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
        h('button', { class: 'btn', onclick: () => entryModal({ type: 'income' }) }, icon('plus', 16), t('finance.income')),
        h('button', { class: 'btn primary', onclick: () => entryModal({ type: 'expense' }) }, icon('plus', 16), t('finance.expense')),
      ),
    ),
    h(
      'div',
      { class: 'grid cols-4', style: { marginBottom: '16px' } },
      tile(t('home.totalMoney'), 'card', money(nw.total), state.data.accounts.map((a) => accountName(a).split(' ')[0]).join(' · '), () => go('accounts')),
      tile(t('home.month'), 'wallet', money(m.net, { sign: true }), t('home.monthNote', { income: money(m.income), expense: money(m.expense) }), () => go('finance')),
      tile(
        channels.length > 1 ? t('home.subscribersN', { n: channels.length }) : t('home.subscribers'),
        'users',
        subs ? compact(subs) : '—',
        subs ? (d7 != null ? t('home.perWeek', { delta: `${d7 >= 0 ? '+' : '−'}${compact(Math.abs(d7))}` }) : channels.map((c) => `@${c.username}`).join(', ')) : t('home.noChannel'),
        () => go('channel'),
      ),
      tile(t('home.appsWeek'), 'briefcase', `${cs.week} / ${state.data.career.weeklyGoal}`, cs.followUps.length ? t('home.followUps', { n: cs.followUps.length }) : t('home.sentTotal', { n: cs.sent }), () => go('career')),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { alignItems: 'start' } },
      h(
        'div',
        { class: 'stack' },
        tasksCard(),
        card(
          t('tasks.habits'),
          h('button', { class: 'btn ghost sm', onclick: () => go('tasks') }, t('common.all'), icon('right', 14)),
          state.data.habits.length ? h('div', { class: 'list' }, state.data.habits.map((hb) => habitRow(hb, { compact: true }))) : empty(t('home.noHabits')),
        ),
      ),
      h(
        'div',
        { class: 'stack' },
        card(
          t('home.recentOps'),
          h('button', { class: 'btn ghost sm', onclick: () => go('finance') }, t('common.all'), icon('right', 14)),
          recent.length ? h('div', { class: 'list' }, recent.map((e) => entryRow(e, { showDate: true }))) : empty(t('home.noOps')),
        ),
        card(
          t('home.upcoming'),
          null,
          soon.length
            ? h(
                'div',
                { class: 'list' },
                soon.map((r) =>
                  h('div', { class: 'list-row' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, r.title), h('div', { class: 'meta' }, prettyDate(r.next))), h('div', { class: `amount${r.type === 'expense' ? ' out' : ''}` }, money(r.type === 'income' ? r.amount : -r.amount, { sign: true }))),
                ),
              )
            : empty(t('home.noUpcoming')),
          overBudget.length > 0 && h('div', { class: 'meta', style: { marginTop: '8px' } }, t('home.budgetWarn', { list: overBudget.map((b) => catLabel(b.category)).join(', ') })),
        ),
      ),
      h(
        'div',
        { class: 'stack' },
        gamesCard(),
        card(
          ch ? `@${ch.username}` : t('home.channel'),
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
            h('button', { class: 'btn ghost sm', onclick: () => go('channel') }, t('common.open'), icon('right', 14)),
          ),
          posts.length > 1
            ? h(
                'div',
                { class: 'stack', style: { gap: '12px' } },
                lineChart({
                  points: posts
                    .slice(0, 20)
                    .reverse()
                    .map((p) => ({ label: '', value: p.views, tip: `${t('channel.viewsN', { n: p.views, v: num(p.views) })}\n${(p.text || '').slice(0, 50)}` })),
                  height: 170,
                  width: 340,
                  format: compact,
                }),
                h('div', { class: 'muted', style: { fontSize: '12.5px' } }, t('home.reach20')),
                h('button', { class: 'btn', onclick: askGrokAboutChannel }, icon('spark', 16), t('home.grokChannel')),
              )
            : h('div', {}, empty(t('home.connectHint')), h('button', { class: 'btn', onclick: () => go('channel') }, t('channel.connect'))),
        ),
      ),
    ),
  );
}
