// Projects: own apps and side projects — income linked from Finance, hours spent, € per hour, milestones and a
// Grok helper for monetization ideas.
import { state, update } from '../state.js';
import { h, icon, money, uid, card, empty } from '../ui.js';
import { t, num } from '../i18n.js';
import { formModal } from '../modal.js';
import { today, prettyDate } from '../dates.js';
import { projectStats } from '../planner-calc.js';
import { CAT } from '../finance-calc.js';
import { entryModal } from './finance.js';
import { go } from '../app.js';

const STATUSES = ['idea', 'active', 'launched', 'paused'];
const statuses = () => STATUSES.map((k) => [k, t(`project.status.${k}`)]);
const statusLabel = (k) => (STATUSES.includes(k) ? t(`project.status.${k}`) : k);

function projectModal(p) {
  const isNew = !p;
  formModal(
    isNew ? t('project.new') : p.name,
    [
      { key: 'name', label: t('common.name'), required: true, placeholder: t('project.namePh') },
      { key: 'status', label: t('common.status'), type: 'select', options: statuses(), half: true },
      { key: 'link', label: t('project.link'), half: true },
      { key: 'description', label: t('project.description'), type: 'textarea', rows: 3 },
      { key: 'money', label: t('project.money'), type: 'textarea', rows: 3, placeholder: t('project.moneyPh') },
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
    t('project.timeOf', { name: p.name }),
    [
      { key: 'hours', label: t('project.hoursHowMany'), type: 'number', required: true, half: true },
      { key: 'date', label: t('common.date'), type: 'date', half: true },
      { key: 'note', label: t('project.whatDone') },
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
  return t('prompt.monetize', {
    name: p.name,
    status: statusLabel(p.status),
    description: p.description || '',
    money: p.money || t('prompt.nothingYet'),
    income: money(st.income),
    expense: money(st.expense),
    hours: st.hours,
  });
}

function projectCard(p) {
  const st = projectStats(p, state.data.finance);
  const quick = h('input', { class: 'input', placeholder: t('project.milestonePh'), style: { flex: 1, height: '32px' } });
  return card(
    p.name,
    h('div', { class: 'row' }, h('span', { class: `badge${p.status === 'launched' ? ' solid' : ''}` }, statusLabel(p.status)), h('button', { class: 'btn ghost sm icon-only', title: t('common.edit'), onclick: () => projectModal(p) }, icon('edit', 15))),
    p.description && h('p', { class: 'muted', style: { margin: '0 0 12px' } }, p.description),
    h(
      'div',
      { class: 'grid cols-3', style: { gap: '10px', marginBottom: '12px' } },
      h('div', { class: 'mini-stat' }, h('div', { class: 'meta' }, t('project.profit')), h('div', { class: 'mini-value' }, money(st.profit, { sign: true }))),
      h('div', { class: 'mini-stat' }, h('div', { class: 'meta' }, t('project.hours')), h('div', { class: 'mini-value' }, num(st.hours))),
      h('div', { class: 'mini-stat' }, h('div', { class: 'meta' }, t('project.perHour')), h('div', { class: 'mini-value' }, st.perHour != null ? money(st.perHour) : '—')),
    ),
    p.money && h('div', { class: 'meta', style: { marginBottom: '10px' } }, `💰 ${p.money}`),
    h('div', { class: 'day-head' }, h('span', {}, t('project.milestones')), h('span', {}, t('common.nOfM', { n: st.milestonesDone, m: st.milestones }))),
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
            h('button', { class: 'btn ghost sm icon-only', title: t('common.delete'), onclick: () => update((d) => (d.projects.find((y) => y.id === p.id).milestones = d.projects.find((y) => y.id === p.id).milestones.filter((y) => y.id !== m.id))) }, icon('trash', 14)),
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
      h('button', { class: 'btn sm icon-only', type: 'submit', title: t('project.addMilestone') }, icon('plus', 14)),
    ),
    h(
      'div',
      { class: 'row', style: { flexWrap: 'wrap' } },
      h('button', { class: 'btn sm', onclick: () => hoursModal(p) }, icon('plus', 14), t('project.hours')),
      h('button', { class: 'btn sm', onclick: () => entryModal({ type: 'income', projectId: p.id, category: CAT.sales, note: p.name }) }, icon('plus', 14), t('finance.income')),
      h('button', { class: 'btn sm', onclick: () => entryModal({ type: 'expense', projectId: p.id, category: CAT.subscriptions, note: p.name }) }, icon('plus', 14), t('finance.expense')),
      h('div', { class: 'spacer' }),
      p.link && h('a', { class: 'btn ghost sm', href: p.link, target: '_blank' }, t('common.open')),
      h('button', { class: 'btn ghost sm', onclick: () => go('grok', { prompt: monetizePrompt(p, st) }) }, icon('spark', 14), t('project.howToEarn')),
    ),
    (p.hours || []).length > 0 &&
      h(
        'div',
        { class: 'meta', style: { marginTop: '10px' } },
        t('project.lastHours', { date: prettyDate(p.hours.at(-1).date), hours: num(p.hours.at(-1).hours), note: p.hours.at(-1).note ? `, ${p.hours.at(-1).note}` : '' }),
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
      h('div', {}, h('h1', {}, t('nav.projects')), h('div', { class: 'sub' }, t('project.sub'))),
      h('button', { class: 'btn primary', onclick: () => projectModal(null) }, icon('plus', 16), t('project.add')),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { marginBottom: '16px' } },
      h('div', { class: 'card stat dark' }, h('div', { class: 'stat-label' }, t('project.earned')), h('div', { class: 'stat-value' }, money(income)), h('div', { class: 'stat-note' }, t('project.profitNote', { amount: money(profit, { sign: true }) }))),
      h('div', { class: 'card stat' }, h('div', { class: 'stat-label' }, t('project.timeSpent')), h('div', { class: 'stat-value' }, t('project.hoursValue', { v: num(hours) })), h('div', { class: 'stat-note' }, t('project.count', { n: projects.length }))),
      h('div', { class: 'card stat' }, h('div', { class: 'stat-label' }, t('project.avgHour')), h('div', { class: 'stat-value' }, hours ? money(profit / hours) : '—'), h('div', { class: 'stat-note' }, t('project.profitPerHour'))),
    ),
    projects.length ? h('div', { class: 'grid cols-2', style: { alignItems: 'start' } }, projects.map(projectCard)) : card(null, null, empty(t('project.empty'))),
  );
}
