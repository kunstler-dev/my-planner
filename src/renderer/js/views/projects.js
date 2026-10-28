// Projects: own apps and side projects — income linked from Finance, hours spent, € per hour, milestones and a
// Grok helper for monetization ideas.
import { state, update } from '../state.js';
import { h, icon, money, uid, card, empty } from '../ui.js';
import { formModal } from '../modal.js';
import { today, prettyDate } from '../dates.js';
import { projectStats } from '../planner-calc.js';
import { entryModal } from './finance.js';
import { go } from '../app.js';

const STATUSES = [
  ['idea', 'Идея'],
  ['active', 'В работе'],
  ['launched', 'Запущен'],
  ['paused', 'Пауза'],
];
const statusLabel = (k) => STATUSES.find(([v]) => v === k)?.[1] || k;

function projectModal(p) {
  const isNew = !p;
  formModal(
    isNew ? 'Новый проект' : p.name,
    [
      { key: 'name', label: 'Название', required: true, placeholder: 'Например, Planner, ELT-бот, Kitten Planner' },
      { key: 'status', label: 'Статус', type: 'select', options: STATUSES, half: true },
      { key: 'link', label: 'Ссылка (GitHub, сайт, бот)', half: true },
      { key: 'description', label: 'Что это и для кого', type: 'textarea', rows: 3 },
      { key: 'money', label: 'Как зарабатывает или может зарабатывать', type: 'textarea', rows: 3, placeholder: 'Подписка, донаты, заказы, реклама, продажа шаблонов…' },
    ],
    { name: '', status: 'active', link: '', description: '', money: '', ...p },
    {
      onSave: (v) =>
        update((d) => {
          if (isNew) d.projects.push({ id: uid(), ...v, hours: [], milestones: [], createdAt: today() });
          else Object.assign(d.projects.find((x) => x.id === p.id), v);
        }),
      onDelete: isNew
        ? null
        : () =>
            update((d) => {
              d.projects = d.projects.filter((x) => x.id !== p.id);
              for (const e of d.finance) if (e.projectId === p.id) delete e.projectId;
            }),
    },
  );
}

function hoursModal(p) {
  formModal(
    `Время: ${p.name}`,
    [
      { key: 'hours', label: 'Сколько часов', type: 'number', required: true, half: true },
      { key: 'date', label: 'Дата', type: 'date', half: true },
      { key: 'note', label: 'Что сделал' },
    ],
    { hours: '', date: today(), note: '' },
    {
      onSave: (v) => {
        if (!(v.hours > 0)) return false;
        update((d) => d.projects.find((x) => x.id === p.id).hours.push({ hours: v.hours, date: v.date || today(), note: v.note }));
      },
    },
  );
}

function monetizePrompt(p, st) {
  return (
    `Мой проект: ${p.name} (${statusLabel(p.status)}). ${p.description || ''}\n` +
    `Как сейчас зарабатывает: ${p.money || 'пока никак'}. Доход всего: ${money(st.income)}, расходы: ${money(st.expense)}, вложено часов: ${st.hours}.\n` +
    'Я живу в Германии и параллельно ищу Ausbildung. Предложи 5 реалистичных способов заработать на этом проекте (что сделать, сколько примерно можно получать, ' +
    'что учесть по налогам/Gewerbe в Германии), и план первых шагов на 2 недели.'
  );
}

function projectCard(p) {
  const st = projectStats(p, state.data.finance);
  const quick = h('input', { class: 'input', placeholder: 'Новый этап…', style: { flex: 1, height: '32px' } });
  return card(
    p.name,
    h('div', { class: 'row' }, h('span', { class: `badge${p.status === 'launched' ? ' solid' : ''}` }, statusLabel(p.status)), h('button', { class: 'btn ghost sm icon-only', title: 'Изменить', onclick: () => projectModal(p) }, icon('edit', 15))),
    p.description && h('p', { class: 'muted', style: { margin: '0 0 12px' } }, p.description),
    h(
      'div',
      { class: 'grid cols-3', style: { gap: '10px', marginBottom: '12px' } },
      h('div', { class: 'mini-stat' }, h('div', { class: 'meta' }, 'Прибыль'), h('div', { class: 'mini-value' }, money(st.profit, { sign: true }))),
      h('div', { class: 'mini-stat' }, h('div', { class: 'meta' }, 'Часов'), h('div', { class: 'mini-value' }, st.hours.toLocaleString('ru-RU'))),
      h('div', { class: 'mini-stat' }, h('div', { class: 'meta' }, 'За час'), h('div', { class: 'mini-value' }, st.perHour != null ? money(st.perHour) : '—')),
    ),
    p.money && h('div', { class: 'meta', style: { marginBottom: '10px' } }, `💰 ${p.money}`),
    h('div', { class: 'day-head' }, h('span', {}, 'Этапы'), h('span', {}, `${st.milestonesDone} из ${st.milestones}`)),
    h(
      'div',
      { class: 'list' },
      (p.milestones || []).map((m) =>
        h(
          'div',
          { class: `list-row${m.done ? ' task-done' : ''}` },
          h(
            'button',
            {
              class: `check${m.done ? ' on' : ''}`,
              onclick: () =>
                update((d) => {
                  const x = d.projects.find((y) => y.id === p.id).milestones.find((y) => y.id === m.id);
                  x.done = !x.done;
                  x.doneAt = x.done ? today() : null;
                }),
            },
            m.done && icon('check', 13),
          ),
          h('div', { class: 'grow title' }, m.title),
          h(
            'div',
            { class: 'hover-actions' },
            h('button', { class: 'btn ghost sm icon-only', title: 'Удалить', onclick: () => update((d) => (d.projects.find((y) => y.id === p.id).milestones = d.projects.find((y) => y.id === p.id).milestones.filter((y) => y.id !== m.id))) }, icon('trash', 14)),
          ),
        ),
      ),
    ),
    h(
      'form',
      {
        class: 'row',
        style: { margin: '6px 0 12px' },
        onsubmit: (e) => {
          e.preventDefault();
          if (!quick.value.trim()) return;
          update((d) => d.projects.find((y) => y.id === p.id).milestones.push({ id: uid(), title: quick.value.trim(), done: false }));
        },
      },
      quick,
      h('button', { class: 'btn sm icon-only', type: 'submit', title: 'Добавить этап' }, icon('plus', 14)),
    ),
    h(
      'div',
      { class: 'row', style: { flexWrap: 'wrap' } },
      h('button', { class: 'btn sm', onclick: () => hoursModal(p) }, icon('plus', 14), 'Часы'),
      h('button', { class: 'btn sm', onclick: () => entryModal({ type: 'income', projectId: p.id, category: 'Продажи', note: p.name }) }, icon('plus', 14), 'Доход'),
      h('button', { class: 'btn sm', onclick: () => entryModal({ type: 'expense', projectId: p.id, category: 'Связь и подписки', note: p.name }) }, icon('plus', 14), 'Расход'),
      h('div', { class: 'spacer' }),
      p.link && h('a', { class: 'btn ghost sm', href: p.link, target: '_blank' }, 'Открыть'),
      h('button', { class: 'btn ghost sm', onclick: () => go('grok', { prompt: monetizePrompt(p, st) }) }, icon('spark', 14), 'Как заработать'),
    ),
    (p.hours || []).length > 0 &&
      h(
        'div',
        { class: 'meta', style: { marginTop: '10px' } },
        `Последнее: ${prettyDate(p.hours.at(-1).date)} — ${p.hours.at(-1).hours} ч${p.hours.at(-1).note ? `, ${p.hours.at(-1).note}` : ''}`,
      ),
  );
}

export function projectsView() {
  const projects = state.data.projects;
  const all = projects.map((p) => projectStats(p, state.data.finance));
  const income = all.reduce((s, x) => s + x.income, 0);
  const profit = all.reduce((s, x) => s + x.profit, 0);
  const hours = all.reduce((s, x) => s + x.hours, 0);
  return h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Проекты'), h('div', { class: 'sub' }, 'Приложения и проекты, на которых хочешь зарабатывать')),
      h('button', { class: 'btn primary', onclick: () => projectModal(null) }, icon('plus', 16), 'Проект'),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { marginBottom: '16px' } },
      h('div', { class: 'card stat dark' }, h('div', { class: 'stat-label' }, 'Заработано на проектах'), h('div', { class: 'stat-value' }, money(income)), h('div', { class: 'stat-note' }, `прибыль ${money(profit, { sign: true })}`)),
      h('div', { class: 'card stat' }, h('div', { class: 'stat-label' }, 'Вложено времени'), h('div', { class: 'stat-value' }, `${hours.toLocaleString('ru-RU')} ч`), h('div', { class: 'stat-note' }, `${projects.length} проектов`)),
      h('div', { class: 'card stat' }, h('div', { class: 'stat-label' }, 'В среднем за час'), h('div', { class: 'stat-value' }, hours ? money(profit / hours) : '—'), h('div', { class: 'stat-note' }, 'прибыль / часы')),
    ),
    projects.length
      ? h('div', { class: 'grid cols-2', style: { alignItems: 'start' } }, projects.map(projectCard))
      : card(
          null,
          null,
          empty('Добавь свои проекты — например Planner, ELT-бот, Kitten Planner. Доходы и расходы привязываются к проекту прямо в записи финансов, часы — кнопкой «Часы».'),
        ),
  );
}
