// Tasks (by date) and daily habits with streaks.
import { state, update } from '../state.js';
import { h, icon, uid, card, empty } from '../ui.js';
import { formModal } from '../modal.js';
import { today, prettyDate, addDays } from '../dates.js';
import { habitStreak } from '../planner-calc.js';
import { taskRow } from './home.js';

function addTaskForm() {
  const title = h('input', { class: 'input', placeholder: 'Новая задача…', style: { flex: 1 } });
  const date = h('input', { class: 'input', type: 'date', value: today(), style: { width: '150px' } });
  return h(
    'form',
    {
      class: 'row',
      onsubmit: (e) => {
        e.preventDefault();
        if (!title.value.trim()) return;
        update((d) => d.tasks.push({ id: uid(), title: title.value.trim(), date: date.value || today(), done: false }));
        setTimeout(() => document.querySelector('.task-add input')?.focus(), 0);
      },
    },
    (title.classList.add('task-add-title'), title),
    date,
    h('button', { class: 'btn primary', type: 'submit' }, icon('plus', 16), 'Добавить'),
  );
}

function habitModal(hb) {
  const isNew = !hb;
  formModal(
    isNew ? 'Новая привычка' : hb.title,
    [{ key: 'title', label: 'Привычка', required: true, placeholder: 'Например, 30 минут немецкого или Спорт' }],
    { title: '', ...hb },
    {
      onSave: (v) =>
        update((d) => {
          if (isNew) d.habits.push({ id: uid(), title: v.title, days: [] });
          else d.habits.find((x) => x.id === hb.id).title = v.title;
        }),
      onDelete: isNew ? null : () => update((d) => (d.habits = d.habits.filter((x) => x.id !== hb.id))),
    },
  );
}

function toggleHabit(id, date) {
  update((d) => {
    const hb = d.habits.find((x) => x.id === id);
    hb.days = hb.days.includes(date) ? hb.days.filter((x) => x !== date) : [...hb.days, date].sort();
  });
}

export function habitRow(hb, { compact = false } = {}) {
  const td = today();
  const done = hb.days.includes(td);
  const streak = habitStreak(hb.days, td);
  const last = Array.from({ length: compact ? 7 : 14 }, (_, i) => addDays(td, i - (compact ? 6 : 13)));
  return h(
    'div',
    { class: 'list-row' },
    h('button', { class: `check${done ? ' on' : ''}`, title: done ? 'Снять отметку' : 'Сделано сегодня', onclick: () => toggleHabit(hb.id, td) }, done && icon('check', 13)),
    h(
      'div',
      { class: 'grow', style: { cursor: compact ? 'default' : 'pointer' }, onclick: compact ? null : () => habitModal(hb) },
      h('div', { class: 'title' }, hb.title),
      h('div', { class: 'meta' }, streak ? `🔥 ${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд` : 'серия начнётся с первой отметки'),
    ),
    h(
      'div',
      { class: 'habit-dots' },
      last.map((d) => h('i', { class: hb.days.includes(d) ? 'on' : '', title: prettyDate(d), onclick: compact ? null : () => toggleHabit(hb.id, d) })),
    ),
  );
}

export function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function tasksView() {
  const td = today();
  const tm = addDays(td, 1);
  const open = state.data.tasks.filter((t) => !t.done).sort((a, b) => a.date.localeCompare(b.date));
  const groups = [
    ['Просрочено', open.filter((t) => t.date < td)],
    ['Сегодня', open.filter((t) => t.date === td)],
    ['Завтра', open.filter((t) => t.date === tm)],
    ['Позже', open.filter((t) => t.date > tm)],
  ].filter(([, list]) => list.length);
  const doneRecently = state.data.tasks
    .filter((t) => t.done && t.doneAt >= addDays(td, -7))
    .sort((a, b) => b.doneAt.localeCompare(a.doneAt));

  return h(
    'div',
    { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Задачи и привычки'), h('div', { class: 'sub' }, 'Дела по датам и ежедневные привычки — за каждое выполненное копится игровое время'))),
    h(
      'div',
      { class: 'grid cols-2', style: { alignItems: 'start' } },
      card(
        'Задачи',
        null,
        h('div', { class: 'task-add', style: { marginBottom: '8px' } }, addTaskForm()),
        groups.length
          ? groups.map(([title, list]) => [h('div', { class: 'day-head' }, h('span', {}, title), h('span', {}, String(list.length))), h('div', { class: 'list' }, list.map(taskRow))])
          : empty('Открытых задач нет 👌'),
        doneRecently.length > 0 && [h('div', { class: 'day-head' }, h('span', {}, 'Сделано за неделю'), h('span', {}, String(doneRecently.length))), h('div', { class: 'list' }, doneRecently.map(taskRow))],
      ),
      card(
        'Привычки',
        h('button', { class: 'btn ghost sm', onclick: () => habitModal(null) }, icon('plus', 14), 'Привычка'),
        state.data.habits.length
          ? h('div', { class: 'list' }, state.data.habits.map((hb) => habitRow(hb)))
          : empty('Например: «30 минут немецкого», «Один отклик в день», «Час на свой проект», «Спорт».'),
      ),
    ),
  );
}
