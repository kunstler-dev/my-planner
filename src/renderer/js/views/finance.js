// Finance: operations (records, month overview, categories, 12-month chart, CSV) plus the Budgets, Recurring and
// Goals tabs from finance-extra.js.
import { state, update } from '../state.js';
import { h, icon, money, compact, uid, card, empty, toast } from '../ui.js';
import { openModal } from '../modal.js';
import { barChart, barList } from '../charts.js';
import { today, thisMonth, shiftMonth, monthTitle, monthShort, prettyDate } from '../dates.js';
import { totals, inMonth, byCategory, monthlySeries, dailyAverage, toCSV, DEFAULT_CATEGORIES } from '../finance-calc.js';
import { budgetsTab, recurringTab, goalsTab } from './finance-extra.js';

const ui = { month: thisMonth(), filter: 'all', query: '', tab: 'ops' };

const TABS = [
  ['ops', 'Операции'],
  ['budgets', 'Бюджеты'],
  ['recurring', 'Регулярные платежи'],
  ['goals', 'Цели'],
];

export function financeTabs() {
  return h(
    'div',
    { class: 'seg', style: { marginBottom: '18px' } },
    TABS.map(([k, label]) => h('button', { class: ui.tab === k ? 'on' : '', onclick: () => ((ui.tab = k), update(() => {})) }, label)),
  );
}

export function openFinanceTab(tab) {
  ui.tab = tab;
}

export function categories(type) {
  const used = state.data.finance.filter((e) => e.type === type).map((e) => e.category);
  return [...new Set([...DEFAULT_CATEGORIES[type], ...used])].filter(Boolean);
}

/** Add or edit an entry. `entry` = existing record or { type } for a new one. */
export function entryModal(entry) {
  const isNew = !entry.id;
  const draft = { type: 'expense', amount: '', category: '', date: today(), note: '', ...entry };
  const listId = `cats-${uid()}`;
  const datalist = h('datalist', { id: listId });
  const fillCats = () => datalist.replaceChildren(...categories(draft.type).map((c) => h('option', { value: c })));
  fillCats();

  const seg = h('div', { class: 'seg' });
  const renderSeg = () =>
    seg.replaceChildren(
      ...[
        ['expense', 'Расход'],
        ['income', 'Доход'],
      ].map(([k, label]) =>
        h(
          'button',
          {
            type: 'button',
            class: draft.type === k ? 'on' : '',
            onclick: () => {
              draft.type = k;
              renderSeg();
              fillCats();
            },
          },
          label,
        ),
      ),
    );
  renderSeg();

  const amount = h('input', { class: 'input', type: 'number', min: '0', step: '0.01', required: true, value: draft.amount, placeholder: '0' });
  const category = h('input', { class: 'input', list: listId, value: draft.category, placeholder: 'Например, Еда' });
  const date = h('input', { class: 'input', type: 'date', required: true, value: draft.date });
  const note = h('input', { class: 'input', value: draft.note, placeholder: 'Необязательно' });
  const projects = state.data.projects;
  const project = h(
    'select',
    { class: 'input' },
    h('option', { value: '' }, '— не относится к проекту —'),
    projects.map((p) => h('option', { value: p.id, selected: p.id === draft.projectId ? 'selected' : null }, p.name)),
  );

  const body = h(
    'div',
    { class: 'stack', style: { gap: '12px' } },
    seg,
    h('div', { class: 'grid cols-2', style: { gap: '12px' } }, h('label', { class: 'field' }, 'Сумма', amount), h('label', { class: 'field' }, 'Дата', date)),
    h('label', { class: 'field' }, 'Категория', category, datalist),
    h('label', { class: 'field' }, 'Комментарий', note),
    projects.length > 0 && h('label', { class: 'field' }, 'Проект', project),
  );

  const modal = openModal(isNew ? 'Новая запись' : 'Запись', body, {
    onSubmit: () => {
      const value = Math.abs(parseFloat(String(amount.value).replace(',', '.')));
      if (!value) {
        amount.focus();
        return false;
      }
      const rec = {
        ...entry,
        projectId: project.value || undefined,
        id: draft.id || uid(),
        type: draft.type,
        amount: value,
        category: category.value.trim() || 'Другое',
        date: date.value,
        note: note.value.trim(),
      };
      update((d) => {
        const i = d.finance.findIndex((e) => e.id === rec.id);
        if (i >= 0) d.finance[i] = rec;
        else d.finance.push(rec);
      });
      if (isNew) toast(`${rec.type === 'income' ? 'Доход' : 'Расход'} ${money(rec.amount)} записан`);
    },
    danger:
      !isNew &&
      h(
        'button',
        {
          type: 'button',
          class: 'btn ghost',
          onclick: () => {
            update((d) => (d.finance = d.finance.filter((e) => e.id !== entry.id)));
            modal.close();
            toast('Запись удалена');
          },
        },
        icon('trash', 16),
        'Удалить',
      ),
  });
  setTimeout(() => amount.focus(), 0);
}

export function entryRow(e, { showDate = false } = {}) {
  return h(
    'div',
    { class: 'list-row', style: { cursor: 'pointer' }, onclick: () => entryModal(e) },
    h(
      'div',
      { class: 'grow' },
      h('div', { class: 'title' }, e.category),
      (e.note || showDate) && h('div', { class: 'meta' }, [showDate && prettyDate(e.date), e.note].filter(Boolean).join(' · ')),
    ),
    h('div', { class: `amount${e.type === 'expense' ? ' out' : ''}` }, money(e.type === 'income' ? e.amount : -e.amount, { sign: true })),
  );
}

function statTile(label, value, note, dark) {
  return h(
    'div',
    { class: `card stat${dark ? ' dark' : ''}` },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-value' }, value),
    note && h('div', { class: 'stat-note' }, note),
  );
}

function pctChange(cur, prev) {
  if (!prev) return null;
  const p = Math.round(((cur - prev) / prev) * 100);
  return `${p > 0 ? '+' : ''}${p}% к прошлому месяцу`;
}

export function financeView() {
  if (ui.tab === 'budgets') return budgetsTab();
  if (ui.tab === 'recurring') return recurringTab();
  if (ui.tab === 'goals') return goalsTab();
  return opsView();
}

function opsView() {
  const all = state.data.finance;
  const month = inMonth(all, ui.month);
  const t = totals(month);
  const prev = totals(inMonth(all, shiftMonth(ui.month, -1)));
  const overall = totals(all);

  // Operations list grouped by day.
  const q = ui.query.toLowerCase();
  const rows = month
    .filter((e) => ui.filter === 'all' || e.type === ui.filter)
    .filter((e) => !q || `${e.category} ${e.note}`.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1));
  const byDay = new Map();
  for (const e of rows) byDay.set(e.date, [...(byDay.get(e.date) || []), e]);
  const list = h(
    'div',
    { class: 'list' },
    [...byDay].map(([date, items]) => {
      const dt = totals(items);
      return [
        h('div', { class: 'day-head' }, h('span', {}, prettyDate(date)), h('span', { class: 'num' }, money(dt.net, { sign: true }))),
        items.map((e) => entryRow(e)),
      ];
    }),
  );

  const filterSeg = h(
    'div',
    { class: 'seg' },
    [
      ['all', 'Все'],
      ['income', 'Доходы'],
      ['expense', 'Расходы'],
    ].map(([k, label]) =>
      h(
        'button',
        {
          class: ui.filter === k ? 'on' : '',
          onclick: () => {
            ui.filter = k;
            update(() => {}, {});
          },
        },
        label,
      ),
    ),
  );
  const search = h('input', {
    class: 'input',
    placeholder: 'Поиск',
    value: ui.query,
    style: { width: '160px', height: '34px' },
    oninput: (e) => {
      ui.query = e.target.value;
      const pos = e.target.selectionStart;
      update(() => {}, {});
      const again = document.querySelector('#fin-search');
      again?.focus();
      again?.setSelectionRange(pos, pos);
    },
    id: 'fin-search',
  });

  const catCard = (type, title) => {
    const cats = byCategory(month, type);
    return card(
      title,
      null,
      cats.length
        ? barList(cats.map((c) => ({ label: c.category, share: c.share, text: `${money(c.sum)} · ${Math.round(c.share * 100)}%` })))
        : empty('Пока пусто'),
    );
  };

  const keys = Array.from({ length: 12 }, (_, i) => shiftMonth(ui.month, i - 11));
  const series = monthlySeries(all, keys);

  return h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        {},
        h('h1', {}, 'Финансы'),
        h(
          'div',
          { class: 'row', style: { marginTop: '6px' } },
          h('button', { class: 'btn ghost sm icon-only', title: 'Предыдущий месяц', onclick: () => ((ui.month = shiftMonth(ui.month, -1)), update(() => {})) }, icon('left', 16)),
          h('span', { style: { minWidth: '130px', textAlign: 'center', fontWeight: 600 } }, monthTitle(ui.month)),
          h('button', { class: 'btn ghost sm icon-only', title: 'Следующий месяц', onclick: () => ((ui.month = shiftMonth(ui.month, 1)), update(() => {})) }, icon('right', 16)),
          ui.month !== thisMonth() && h('button', { class: 'btn ghost sm', onclick: () => ((ui.month = thisMonth()), update(() => {})) }, 'Сегодня'),
        ),
      ),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn',
            title: 'Экспорт всех записей в CSV (Excel)',
            onclick: async () => {
              if (!all.length) return toast('Нет записей для экспорта');
              if (await window.api.saveFile(`финансы-${today()}.csv`, toCSV(all))) toast('CSV сохранён');
            },
          },
          icon('download', 16),
          'CSV',
        ),
        h('button', { class: 'btn', onclick: () => entryModal({ type: 'income' }) }, icon('plus', 16), 'Доход'),
        h('button', { class: 'btn primary', onclick: () => entryModal({ type: 'expense' }) }, icon('plus', 16), 'Расход'),
      ),
    ),
    financeTabs(),
    h(
      'div',
      { class: 'grid cols-4', style: { marginBottom: '16px' } },
      statTile('Доходы', money(t.income), pctChange(t.income, prev.income) || `${month.filter((e) => e.type === 'income').length} записей`),
      statTile('Расходы', money(t.expense), pctChange(t.expense, prev.expense) || `${money(dailyAverage(all, ui.month, today()))} в день`),
      statTile('Итог месяца', money(t.net, { sign: true }), t.income ? `сохранено ${Math.max(0, Math.round((t.net / t.income) * 100))}% дохода` : null, true),
      statTile('Баланс за всё время', money(overall.net, { sign: true }), `${all.length} записей всего`),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { alignItems: 'start' } },
      h(
        'div',
        { class: 'span-2' },
        card(
          'Операции',
          [search, filterSeg],
          rows.length ? list : empty(month.length ? 'Ничего не найдено' : 'В этом месяце записей нет. Добавь первую кнопкой «Расход» или «Доход».'),
        ),
      ),
      h('div', { class: 'stack' }, catCard('expense', 'Расходы по категориям'), catCard('income', 'Доходы по категориям')),
    ),
    h(
      'div',
      { style: { marginTop: '16px' } },
      card(
        'Последние 12 месяцев',
        h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'sw-ink' }), 'Доходы'), h('span', {}, h('i', { class: 'sw-ghost' }), 'Расходы')),
        barChart({
          series: [
            { key: 'income', cls: 'ink' },
            { key: 'expense', cls: 'ghost' },
          ],
          points: series.map((s) => ({
            label: monthShort(s.key),
            values: s,
            tip: `${monthTitle(s.key)}\nДоходы: ${money(s.income)}\nРасходы: ${money(s.expense)}\nИтог: ${money(s.net, { sign: true })}`,
          })),
          format: compact,
        }),
      ),
    ),
  );
}
