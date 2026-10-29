// Tasks (by date) and daily habits with streaks.
import { state, update } from '../state.js';
import { h, icon, uid, card, empty } from '../ui.js';
import { t } from '../i18n.js';
import { formModal } from '../modal.js';
import { today, prettyDate, addDays } from '../dates.js';
import { habitStreak } from '../planner-calc.js';
import { taskRow } from './home.js';
import { categories } from './finance.js';
import { catLabel } from '../labels.js';

function addTaskForm() {
  const title = h('input', { class: 'input', placeholder: t('tasks.newPh'), style: { flex: 1 } });
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
    h('button', { class: 'btn primary', type: 'submit' }, icon('plus', 16), t('common.add')),
  );
}

const RULES = ['', 'apply', 'spend', 'noSpend', 'tasks', 'project'];

function habitModal(hb) {
  const isNew = !hb;
  const a = hb?.auto || {};
  formModal(
    isNew ? t('tasks.newHabit') : hb.title,
    [
      { key: 'title', label: t('tasks.habit'), required: true, placeholder: t('tasks.habitPh') },
      // Optional rule: the habit checks itself; checking by hand still works.
      { key: 'kind', label: t('habit.auto'), type: 'select', options: RULES.map((k) => [k, t(`habit.rule.${k || 'none'}`)]) },
      { key: 'category', label: t('habit.category'), type: 'select', options: categories('expense').map((c) => [c, catLabel(c)]), half: true },
      { key: 'n', label: t('habit.tasksN'), type: 'number', half: true },
      { key: 'minutes', label: t('habit.minutes'), type: 'number', half: true },
      { key: 'projectId', label: t('habit.project'), type: 'select', options: [['', t('habit.anyProject')], ...state.data.projects.map((p) => [p.id, p.name])], half: true },
    ],
    { title: '', kind: a.kind || '', category: a.category || categories('expense')[0], n: a.n || 3, minutes: a.minutes || 60, projectId: a.projectId || '', ...hb },
    {
      onSave: (v) => {
        const auto = v.kind ? { kind: v.kind, ...(v.kind === 'noSpend' ? { category: v.category } : {}), ...(v.kind === 'tasks' ? { n: Math.max(1, Math.round(v.n || 1)) } : {}), ...(v.kind === 'project' ? { minutes: Math.max(1, Math.round(v.minutes || 1)), projectId: v.projectId || '' } : {}) } : undefined;
        update((d) => {
          if (isNew) d.habits.push({ id: uid(), title: v.title, days: [], auto, createdAt: today() });
          else Object.assign(d.habits.find((x) => x.id === hb.id), { title: v.title, auto });
        });
      },
      onDelete: isNew ? null : () => update((d) => (d.habits = d.habits.filter((x) => x.id !== hb.id))),
    },
  );
}

function toggleHabit(id, date) {
  update((d) => {
    const hb = d.habits.find((x) => x.id === id);
    const off = hb.days.includes(date);
    hb.days = off ? hb.days.filter((x) => x !== date) : [...hb.days, date].sort();
    // Unchecked by hand: the rule leaves that day alone from now on.
    if (hb.auto) hb.autoOff = off ? [...new Set([...(hb.autoOff || []), date])].slice(-60) : (hb.autoOff || []).filter((x) => x !== date);
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
    h('button', { class: `check${done ? ' on' : ''}`, title: done ? t('tasks.uncheck') : t('tasks.doneToday'), onclick: () => toggleHabit(hb.id, td) }, done && icon('check', 13)),
    h(
      'div',
      { class: 'grow', style: { cursor: compact ? 'default' : 'pointer' }, onclick: compact ? null : () => habitModal(hb) },
      h('div', { class: 'title' }, hb.title, hb.auto?.kind && h('span', { class: 'badge', style: { marginLeft: '6px' }, title: t(`habit.rule.${hb.auto.kind}`) }, t('habit.autoBadge'))),
      h('div', { class: 'meta' }, streak ? t('tasks.streak', { n: streak }) : t('tasks.streakStart')),
    ),
    h(
      'div',
      { class: 'habit-dots' },
      last.map((d) => h('i', { class: hb.days.includes(d) ? 'on' : '', title: prettyDate(d), onclick: compact ? null : () => toggleHabit(hb.id, d) })),
    ),
  );
}

export function tasksView() {
  const td = today();
  const tm = addDays(td, 1);
  const open = state.data.tasks.filter((x) => !x.done).sort((a, b) => a.date.localeCompare(b.date));
  const groups = [
    [t('tasks.overdue'), open.filter((x) => x.date < td)],
    [t('common.today'), open.filter((x) => x.date === td)],
    [t('tasks.tomorrow'), open.filter((x) => x.date === tm)],
    [t('tasks.later'), open.filter((x) => x.date > tm)],
  ].filter(([, list]) => list.length);
  const doneRecently = state.data.tasks.filter((x) => x.done && x.doneAt >= addDays(td, -7)).sort((a, b) => b.doneAt.localeCompare(a.doneAt));

  return h(
    'div',
    { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, t('nav.tasks')), h('div', { class: 'sub' }, t('tasks.sub')))),
    h(
      'div',
      { class: 'grid cols-2', style: { alignItems: 'start' } },
      card(
        t('tasks.tasks'),
        null,
        h('div', { class: 'task-add', style: { marginBottom: '8px' } }, addTaskForm()),
        groups.length ? groups.map(([title, list]) => [h('div', { class: 'day-head' }, h('span', {}, title), h('span', {}, String(list.length))), h('div', { class: 'list' }, list.map(taskRow))]) : empty(t('tasks.noOpen')),
        doneRecently.length > 0 && [h('div', { class: 'day-head' }, h('span', {}, t('tasks.doneWeek')), h('span', {}, String(doneRecently.length))), h('div', { class: 'list' }, doneRecently.map(taskRow))],
      ),
      card(
        t('tasks.habits'),
        h('button', { class: 'btn ghost sm', onclick: () => habitModal(null) }, icon('plus', 14), t('tasks.habit')),
        state.data.habits.length ? h('div', { class: 'list' }, state.data.habits.map((hb) => habitRow(hb))) : empty(t('tasks.habitsEmpty')),
      ),
    ),
  );
}
