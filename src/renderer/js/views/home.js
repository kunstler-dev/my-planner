// Home: money, channels, career and game time at a glance; today's tasks and habits, upcoming payments.
// Cards come from a registry (later features add theirs with registerHomeCard); «Customize» shows, hides and
// reorders them, the layout is kept in settings.homeLayout. Cards without data hide themselves.
import { state, update } from '../state.js';
import { h, icon, money, compact, uid, card, empty } from '../ui.js';
import { t, num } from '../i18n.js';
import { lineChart } from '../charts.js';
import { today, thisMonth, longToday, prettyDate, addDays } from '../dates.js';
import { totals, inMonth } from '../finance-calc.js';
import { postList, subscriberDelta } from '../tg.js';
import { entryModal, entryOp, opList } from './finance.js';
import { askGrokAboutChannel, activeChannel } from './channel.js';
import { go } from '../app.js';
import { netWorth, upcoming, careerStats, budgetStatus } from '../planner-calc.js';
import { catLabel, accountName } from '../labels.js';
import { layoutOrder, moveCard, toggleHidden, toColumns } from '../home-layout.js';
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
        { style: { marginTop: '6px' } },
        h('div', { class: 'day-head' }, t('home.later')),
        h('div', { class: 'list' }, later.slice(0, 3).map((x) => h('div', { class: 'list-row' }, h('div', { class: 'grow title' }, x.title), h('span', { class: 'meta' }, prettyDate(x.date))))),
      ),
  );
}

// ---- card registry ----

const CARDS = [];

/**
 * Adds a card to the home screen. card: { id, tile?: true for the top row of numbers, available?: () => bool
 * (false hides the card when it has nothing to show), render: () => Node }. New cards go to the end.
 */
export function registerHomeCard(def) {
  const i = CARDS.findIndex((c) => c.id === def.id);
  if (i >= 0) CARDS[i] = def;
  else CARDS.push(def);
}

const hasChannel = () => state.data.channels.length > 0;
// Default order; the three columns are filled row by row, so this gives tasks + habits | operations + payments | games + channel.
const DEFAULT_ORDER = ['money', 'month', 'subscribers', 'career', 'tasks', 'recent', 'games', 'habits', 'upcoming', 'channel'];
const knownIds = () => [...DEFAULT_ORDER.filter((id) => CARDS.some((c) => c.id === id)), ...CARDS.map((c) => c.id).filter((id) => !DEFAULT_ORDER.includes(id))];

registerHomeCard({
  id: 'money',
  tile: true,
  render: () => {
    const nw = netWorth(state.data.accounts, state.data.rates, state.data.settings.currency);
    return tile(t('home.totalMoney'), 'card', money(nw.total), state.data.accounts.map((a) => accountName(a).split(' ')[0]).join(' · '), () => go('accounts'));
  },
});
registerHomeCard({
  id: 'month',
  tile: true,
  render: () => {
    const m = totals(inMonth(state.data.finance, thisMonth()));
    return tile(t('home.month'), 'wallet', money(m.net, { sign: true }), t('home.monthNote', { income: money(m.income), expense: money(m.expense) }), () => go('finance'));
  },
});
registerHomeCard({
  id: 'subscribers',
  tile: true,
  available: hasChannel,
  render: () => {
    const channels = state.data.channels;
    const subs = channels.reduce((s, c) => s + (c.snapshots.at(-1)?.subscribers || 0), 0);
    const deltas = channels.map((c) => subscriberDelta(c.snapshots, 7, today())).filter(Boolean);
    const d7 = deltas.length ? deltas.reduce((s, d) => s + d.delta, 0) : null;
    return tile(
      channels.length > 1 ? t('home.subscribersN', { n: channels.length }) : t('home.subscribers'),
      'users',
      subs ? compact(subs) : '—',
      d7 != null ? t('home.perWeek', { delta: `${d7 >= 0 ? '+' : '−'}${compact(Math.abs(d7))}` }) : channels.map((c) => `@${c.username}`).join(', '),
      () => go('channel'),
    );
  },
});
registerHomeCard({
  id: 'career',
  tile: true,
  render: () => {
    const cs = careerStats(state.data.career.applications, today());
    return tile(t('home.appsWeek'), 'briefcase', `${cs.week} / ${state.data.career.weeklyGoal}`, cs.followUps.length ? t('home.followUps', { n: cs.followUps.length }) : t('home.sentTotal', { n: cs.sent }), () => go('career'));
  },
});
registerHomeCard({ id: 'tasks', render: tasksCard });
registerHomeCard({
  id: 'habits',
  render: () =>
    card(
      t('tasks.habits'),
      h('button', { class: 'btn ghost sm', onclick: () => go('tasks') }, t('common.all'), icon('right', 14)),
      state.data.habits.length ? h('div', { class: 'list' }, state.data.habits.map((hb) => habitRow(hb, { compact: true }))) : empty(t('home.noHabits')),
    ),
});
registerHomeCard({
  id: 'recent',
  render: () => {
    const recent = [...state.data.finance].sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1)).slice(0, 5);
    return card(
      t('home.recentOps'),
      h('button', { class: 'btn ghost sm', onclick: () => go('finance') }, t('common.all'), icon('right', 14)),
      recent.length ? opList(recent.map(entryOp)) : empty(t('home.noOps')),
    );
  },
});
registerHomeCard({
  id: 'upcoming',
  render: () => {
    const soon = upcoming(state.data.recurring, today(), 7);
    const overBudget = budgetStatus(inMonth(state.data.finance, thisMonth()), state.data.budgets).filter((b) => b.share >= 0.9);
    return card(
      t('home.upcoming'),
      null,
      soon.length
        ? opList(soon.map((r) => ({ date: r.next, title: r.title, note: catLabel(r.category), amount: r.type === 'income' ? r.amount : -r.amount, onclick: () => go('finance') })))
        : empty(t('home.noUpcoming')),
      overBudget.length > 0 && h('div', { class: 'meta', style: { marginTop: '6px' } }, t('home.budgetWarn', { list: overBudget.map((b) => catLabel(b.category)).join(', ') })),
    );
  },
});
registerHomeCard({ id: 'games', render: () => gamesCard() });
registerHomeCard({
  id: 'channel',
  available: hasChannel,
  render: () => {
    const channels = state.data.channels;
    const ch = activeChannel();
    const posts = postList(ch);
    return card(
      `@${ch.username}`,
      h(
        'div',
        { class: 'row' },
        channels.length > 1 &&
          h(
            'div',
            { class: 'seg' },
            channels.map((c, i) => h('button', { class: c === ch ? 'on' : '', title: `@${c.username}`, onclick: () => update((d) => (d.settings.activeChannel = c.username)) }, String(i + 1))),
          ),
        h('button', { class: 'btn ghost sm', onclick: () => go('channel') }, t('common.open'), icon('right', 14)),
      ),
      posts.length > 1
        ? h(
            'div',
            { class: 'stack', style: { gap: '8px' } },
            lineChart({
              points: posts
                .slice(0, 20)
                .reverse()
                .map((p) => ({ label: '', value: p.views, tip: `${t('channel.viewsN', { n: p.views, v: num(p.views) })}\n${(p.text || '').slice(0, 50)}` })),
              height: 150,
              width: 340,
              format: compact,
            }),
            h('div', { class: 'muted', style: { fontSize: '12.5px' } }, t('home.reach20')),
            h('button', { class: 'btn', onclick: askGrokAboutChannel }, icon('spark', 16), t('home.grokChannel')),
          )
        : empty(t('home.connectHint')),
    );
  },
});

// ---- layout ----

let editing = false;
const isTile = (id) => !!CARDS.find((c) => c.id === id)?.tile;

function setLayout(fn) {
  update((d) => {
    const cur = d.settings.homeLayout;
    d.settings.homeLayout = { ...cur, ...fn({ order: layoutOrder(cur.order, knownIds()), hidden: cur.hidden }) };
  });
}

/** In edit mode every card gets show/hide and up/down controls. */
function editable(c, node, hidden) {
  if (!editing) return node;
  return h(
    'div',
    { class: `home-card${hidden ? ' off' : ''}`, 'data-card': c.id },
    node,
    h(
      'div',
      { class: 'card-tools' },
      h('button', { class: 'btn ghost sm icon-only', title: hidden ? t('home.show') : t('home.hide'), onclick: () => setLayout((l) => ({ hidden: toggleHidden(l.hidden, c.id) })) }, icon(hidden ? 'eyeOff' : 'eye', 15)),
      h('button', { class: 'btn ghost sm icon-only', title: t('home.moveUp'), onclick: () => setLayout((l) => ({ order: moveCard(l.order, c.id, -1, (id) => isTile(id) === !!c.tile) })) }, icon('chevUp', 15)),
      h('button', { class: 'btn ghost sm icon-only', title: t('home.moveDown'), onclick: () => setLayout((l) => ({ order: moveCard(l.order, c.id, 1, (id) => isTile(id) === !!c.tile) })) }, icon('chevDown', 15)),
    ),
  );
}

export function homeView() {
  const { order: saved, hidden } = state.data.settings.homeLayout;
  const order = layoutOrder(saved, knownIds());
  const cards = order
    .map((id) => CARDS.find((c) => c.id === id))
    .filter((c) => c && (!c.available || c.available()))
    .filter((c) => editing || !hidden.includes(c.id));
  const tiles = cards.filter((c) => c.tile);
  const blocks = cards.filter((c) => !c.tile);
  const columns = toColumns(blocks, 3);
  const render = (c) => editable(c, c.render(), hidden.includes(c.id));

  return h(
    'div',
    { class: `page${editing ? ' home-editing' : ''}` },
    h(
      'div',
      { class: 'page-head' },
      h('div', {}, h('h1', {}, `${greeting()}!`), h('div', { class: 'sub' }, longToday())),
      h(
        'div',
        { class: 'row' },
        !editing && h('button', { class: 'btn ghost', 'data-action': 'customize', onclick: () => ((editing = true), update(() => {}, { silent: false })) }, icon('sliders', 16), t('home.customize')),
        h('button', { class: 'btn', onclick: () => entryModal({ type: 'income' }) }, icon('plus', 16), t('finance.income')),
        h('button', { class: 'btn primary', onclick: () => entryModal({ type: 'expense' }) }, icon('plus', 16), t('finance.expense')),
      ),
    ),
    editing &&
      h(
        'div',
        { class: 'edit-bar' },
        h('span', { class: 'grow muted' }, t('home.editHint')),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn ghost sm', onclick: () => update((d) => (d.settings.homeLayout = { order: [], hidden: [] })) }, t('home.reset')),
        h('button', { class: 'btn primary sm', onclick: () => ((editing = false), update(() => {})) }, t('home.done')),
      ),
    tiles.length > 0 && h('div', { class: 'home-tiles' }, tiles.map(render)),
    h(
      'div',
      { class: 'home-cols' },
      columns.map((ids) => h('div', { class: 'stack' }, ids.map((id) => render(blocks.find((c) => c.id === id))))),
    ),
  );
}
