// Games: game time is earned by being productive (tasks, applications, habits, project milestones) and spent by
// logging game sessions. Also shows this month's spending in the «Игры» finance category.
import { state, update } from '../state.js';
import { h, icon, money, uid, card, empty } from '../ui.js';
import { formModal } from '../modal.js';
import { today, prettyDate, thisMonth } from '../dates.js';
import { inMonth } from '../finance-calc.js';
import { playBalance, minutesText } from '../planner-calc.js';
import { entryModal } from './finance.js';

function sessionModal(s) {
  const isNew = !s;
  const games = [...new Set(state.data.play.sessions.map((x) => x.game).filter(Boolean))];
  formModal(
    isNew ? 'Игровая сессия' : 'Сессия',
    [
      { key: 'game', label: 'Игра', list: games.length ? games : ['Dota 2', 'CS2', 'Deadlock'], half: true },
      { key: 'minutes', label: 'Минут', type: 'number', required: true, half: true },
      { key: 'date', label: 'Дата', type: 'date' },
    ],
    { game: games[0] || '', minutes: '', date: today(), ...s },
    {
      onSave: (v) => {
        if (!(v.minutes > 0)) return false;
        update((d) => {
          const list = d.play.sessions;
          const i = list.findIndex((x) => x.id === s?.id);
          const rec = { id: s?.id || uid(), ...v, date: v.date || today() };
          if (i >= 0) list[i] = rec;
          else list.push(rec);
        });
      },
      onDelete: isNew ? null : () => update((d) => (d.play.sessions = d.play.sessions.filter((x) => x.id !== s.id))),
    },
  );
}

function rewardsModal() {
  const r = state.data.play.rewards;
  formModal(
    'Сколько минут даёт',
    [
      { key: 'task', label: 'Выполненная задача', type: 'number', half: true },
      { key: 'application', label: 'Отправленный отклик', type: 'number', half: true },
      { key: 'habit', label: 'Отметка привычки', type: 'number', half: true },
      { key: 'milestone', label: 'Этап проекта', type: 'number', half: true },
    ],
    r,
    { onSave: (v) => update((d) => (d.play.rewards = { task: v.task || 0, application: v.application || 0, habit: v.habit || 0, milestone: v.milestone || 0 })) },
  );
}

export function playView() {
  const b = playBalance(state.data, today());
  const r = state.data.play.rewards;
  const week = state.data.play.sessions.filter((s) => s.date >= b.weekStart).sort((a, c) => c.date.localeCompare(a.date));
  const spent = inMonth(state.data.finance, thisMonth())
    .filter((e) => e.type === 'expense' && e.category === 'Игры')
    .reduce((s, e) => s + e.amount, 0);
  const row = (label, min, note) => h('div', { class: 'list-row' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, label), note && h('div', { class: 'meta' }, note)), h('div', { class: 'amount' }, `+${minutesText(min)}`));

  return h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Игры'), h('div', { class: 'sub' }, 'Сначала дела — потом катка: игровое время зарабатывается откликами, задачами и проектами')),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: rewardsModal }, 'Награды'), h('button', { class: 'btn primary', onclick: () => sessionModal(null) }, icon('plus', 16), 'Сыграл')),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { marginBottom: '16px' } },
      h(
        'div',
        { class: 'card stat dark' },
        h('div', { class: 'stat-label' }, 'Можно играть'),
        h('div', { class: 'stat-value' }, b.balance > 0 ? minutesText(b.balance) : '0 мин'),
        h('div', { class: 'stat-note' }, b.balance < 0 ? `в долгу ${minutesText(-b.balance)} — отработай задачами` : 'баланс этой недели'),
      ),
      h('div', { class: 'card stat' }, h('div', { class: 'stat-label' }, 'Заработано за неделю'), h('div', { class: 'stat-value' }, minutesText(b.earned)), h('div', { class: 'stat-note' }, `с ${prettyDate(b.weekStart)}`)),
      h(
        'button',
        { class: 'card stat', style: { textAlign: 'left', cursor: 'pointer' }, title: 'Записать покупку в игре', onclick: () => entryModal({ type: 'expense', category: 'Игры' }) },
        h('div', { class: 'stat-label' }, 'Потрачено на игры · месяц'),
        h('div', { class: 'stat-value' }, money(spent)),
        h('div', { class: 'stat-note' }, 'скины, пропуски, игры — категория «Игры»'),
      ),
    ),
    h(
      'div',
      { class: 'grid cols-2', style: { alignItems: 'start' } },
      card(
        'Откуда время',
        null,
        h(
          'div',
          { class: 'list' },
          row('Задачи', b.parts.tasks, `${r.task} мин за каждую`),
          row('Отклики на Ausbildung и работу', b.parts.applications, `${r.application} мин за каждый`),
          row('Привычки', b.parts.habits, `${r.habit} мин за отметку`),
          row('Этапы проектов', b.parts.milestones, `${r.milestone} мин за этап`),
        ),
      ),
      card(
        'Сыграно за неделю',
        h('span', { class: 'muted' }, minutesText(b.played)),
        week.length
          ? h(
              'div',
              { class: 'list' },
              week.map((s) =>
                h(
                  'div',
                  { class: 'list-row', style: { cursor: 'pointer' }, onclick: () => sessionModal(s) },
                  h('div', { class: 'grow' }, h('div', { class: 'title' }, s.game || 'Игра'), h('div', { class: 'meta' }, prettyDate(s.date))),
                  h('div', { class: 'amount out' }, `−${minutesText(s.minutes)}`),
                ),
              ),
            )
          : empty('Нажми «Сыграл» после игры — время спишется с баланса.'),
      ),
    ),
  );
}
