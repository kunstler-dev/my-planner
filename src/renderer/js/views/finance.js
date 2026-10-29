// Finance: operations (records, month overview, categories, 12-month chart, CSV) plus the Budgets, Recurring and
// Goals tabs from finance-extra.js.
import { state, update } from '../state.js';
import { h, icon, money, compact, uid, card, empty, toast } from '../ui.js';
import { t } from '../i18n.js';
import { openModal } from '../modal.js';
import { barChart, barList } from '../charts.js';
import { today, thisMonth, shiftMonth, monthTitle, monthShort, prettyDate, shortDate } from '../dates.js';
import { totals, inMonth, byCategory, monthlySeries, dailyAverage, toCSV, DEFAULT_CATEGORIES, CAT } from '../finance-calc.js';
import { catLabel, catValue } from '../labels.js';
import { upsertRule } from '../rules.js';
import { budgetsTab, recurringTab, goalsTab } from './finance-extra.js';

const ui = { month: thisMonth(), filter: 'all', query: '', tab: 'ops' };

const TABS = ['ops', 'budgets', 'recurring', 'goals'];

export function financeTabs() {
  return h(
    'div',
    { class: 'seg gap-b' },
    TABS.map((k) => h('button', { class: ui.tab === k ? 'on' : '', 'data-tab': k, onclick: () => ((ui.tab = k), update(() => {})) }, t(`finance.tab.${k}`))),
  );
}

export function openFinanceTab(tab) {
  ui.tab = tab;
}

/** Stored category values for a type: the standard ones plus the user's own. */
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
  const fillCats = () => datalist.replaceChildren(...categories(draft.type).map((c) => h('option', { value: catLabel(c) })));
  fillCats();

  const seg = h('div', { class: 'seg' });
  const renderSeg = () =>
    seg.replaceChildren(
      ...['expense', 'income'].map((k) =>
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
          t(`finance.${k}`),
        ),
      ),
    );
  renderSeg();

  const amount = h('input', { class: 'input', type: 'number', min: '0', step: '0.01', required: true, value: draft.amount, placeholder: '0' });
  const category = h('input', { class: 'input', list: listId, value: catLabel(draft.category), placeholder: t('finance.categoryPh') });
  const date = h('input', { class: 'input', type: 'date', required: true, value: draft.date });
  const note = h('input', { class: 'input', value: draft.note, placeholder: t('common.optional') });
  const projects = state.data.projects;
  const project = h(
    'select',
    { class: 'input' },
    h('option', { value: '' }, t('finance.noProject')),
    projects.map((p) => h('option', { value: p.id, selected: p.id === draft.projectId ? 'selected' : null }, p.name)),
  );

  const body = h(
    'div',
    { class: 'stack', style: { gap: '12px' } },
    seg,
    h('div', { class: 'grid cols-2', style: { gap: '12px' } }, h('label', { class: 'field' }, t('common.amount'), amount), h('label', { class: 'field' }, t('common.date'), date)),
    h('label', { class: 'field' }, t('common.category'), category, datalist),
    h('label', { class: 'field' }, t('common.comment'), note),
    projects.length > 0 && h('label', { class: 'field' }, t('finance.project'), project),
  );

  const modal = openModal(isNew ? t('finance.newEntry') : t('finance.entry'), body, {
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
        category: catValue(category.value) || CAT.other,
        date: date.value,
        note: note.value.trim(),
      };
      update((d) => {
        const i = d.finance.findIndex((e) => e.id === rec.id);
        if (i >= 0) d.finance[i] = rec;
        else d.finance.push(rec);
      });
      if (isNew) toast(t(rec.type === 'income' ? 'finance.incomeSaved' : 'finance.expenseSaved', { amount: money(rec.amount) }));
      // An imported operation got another category: offer to remember it for this description.
      if (!isNew && entry.desc && rec.category !== entry.category && confirm(t('rules.ask', { desc: entry.desc, category: catLabel(rec.category) }))) {
        update((d) => (d.rules = upsertRule(d.rules, { id: uid(), field: 'desc', value: entry.desc, category: rec.category, kind: rec.type, createdAt: today() })));
        toast(t('rules.saved', { desc: entry.desc }));
      }
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
            toast(t('finance.entryDeleted'));
          },
        },
        icon('trash', 16),
        t('common.delete'),
      ),
  });
  setTimeout(() => amount.focus(), 0);
}

/**
 * One line per operation: date · title · comment (muted, cut with «…», full text on hover) · amount.
 * row: { date, title, note, amount (signed), onclick }; `date: null` leaves the date column empty under a day header.
 */
export function opRow(row) {
  return h(
    'div',
    { class: 'op-row', onclick: row.onclick, title: row.note || null },
    h('span', { class: 'op-date' }, row.date ? shortDate(row.date) : ''),
    h('span', { class: 'op-cat' }, row.title),
    h('span', { class: 'op-note' }, row.note || ''),
    h('span', { class: `amount${row.amount < 0 ? ' out' : ''}` }, money(row.amount, { sign: true })),
  );
}

/**
 * Rows in date order; a day with two or more rows gets a header with the day total and its rows drop the date,
 * a single row keeps the date in the line.
 */
export function opList(rows) {
  const byDay = new Map();
  for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) || []), r]);
  return h(
    'div',
    { class: 'list' },
    [...byDay].map(([date, items]) =>
      items.length < 2
        ? opRow(items[0])
        : [
            h('div', { class: 'day-head' }, h('span', {}, prettyDate(date)), h('span', { class: 'num' }, money(items.reduce((s, r) => s + r.amount, 0), { sign: true }))),
            items.map((r) => opRow({ ...r, date: null })),
          ],
    ),
  );
}

/** A finance entry as an opRow. */
export function entryOp(e) {
  return { date: e.date, title: catLabel(e.category), note: e.note, amount: e.type === 'income' ? e.amount : -e.amount, onclick: () => entryModal(e) };
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
  return t('finance.vsLastMonth', { p: `${p > 0 ? '+' : ''}${p}` });
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
  const tot = totals(month);
  const prev = totals(inMonth(all, shiftMonth(ui.month, -1)));
  const overall = totals(all);

  // Operations list grouped by day.
  const q = ui.query.toLowerCase();
  const rows = month
    .filter((e) => ui.filter === 'all' || e.type === ui.filter)
    .filter((e) => !q || `${e.category} ${catLabel(e.category)} ${e.note}`.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1));
  const list = opList(rows.map(entryOp));

  const filterSeg = h(
    'div',
    { class: 'seg' },
    [
      ['all', t('common.all')],
      ['income', t('finance.incomes')],
      ['expense', t('finance.expenses')],
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
    placeholder: t('common.search'),
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
    return card(title, null, cats.length ? barList(cats.map((c) => ({ label: catLabel(c.category), share: c.share, text: `${money(c.sum)} · ${Math.round(c.share * 100)}%` }))) : empty(t('common.emptyYet')));
  };

  const keys = Array.from({ length: 12 }, (_, i) => shiftMonth(ui.month, i - 11));
  const series = monthlySeries(all, keys);
  const csvLabels = {
    headers: [t('common.date'), t('finance.csv.type'), t('common.category'), t('common.amount'), t('common.comment')],
    income: t('finance.income'),
    expense: t('finance.expense'),
    category: catLabel,
  };

  return h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        {},
        h('h1', {}, t('nav.finance')),
        h(
          'div',
          { class: 'row', style: { marginTop: '6px' } },
          h('button', { class: 'btn ghost sm icon-only', title: t('finance.prevMonth'), onclick: () => ((ui.month = shiftMonth(ui.month, -1)), update(() => {})) }, icon('left', 16)),
          h('span', { style: { minWidth: '130px', textAlign: 'center', fontWeight: 600 } }, monthTitle(ui.month)),
          h('button', { class: 'btn ghost sm icon-only', title: t('finance.nextMonth'), onclick: () => ((ui.month = shiftMonth(ui.month, 1)), update(() => {})) }, icon('right', 16)),
          ui.month !== thisMonth() && h('button', { class: 'btn ghost sm', onclick: () => ((ui.month = thisMonth()), update(() => {})) }, t('common.today')),
        ),
      ),
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn',
            title: t('finance.csvHint'),
            onclick: async () => {
              if (!all.length) return toast(t('finance.csvEmpty'));
              if (await window.api.saveFile(`${t('finance.csvFile')}-${today()}.csv`, toCSV(all, csvLabels))) toast(t('finance.csvSaved'));
            },
          },
          icon('download', 16),
          'CSV',
        ),
        h('button', { class: 'btn', onclick: () => entryModal({ type: 'income' }) }, icon('plus', 16), t('finance.income')),
        h('button', { class: 'btn primary', onclick: () => entryModal({ type: 'expense' }) }, icon('plus', 16), t('finance.expense')),
      ),
    ),
    financeTabs(),
    h(
      'div',
      { class: 'grid cols-4 gap-b' },
      statTile(t('finance.incomes'), money(tot.income), pctChange(tot.income, prev.income) || t('finance.entriesN', { n: month.filter((e) => e.type === 'income').length })),
      statTile(t('finance.expenses'), money(tot.expense), pctChange(tot.expense, prev.expense) || t('finance.perDay', { amount: money(dailyAverage(all, ui.month, today())) })),
      statTile(t('finance.monthResult'), money(tot.net, { sign: true }), tot.income ? t('finance.savedShare', { p: Math.max(0, Math.round((tot.net / tot.income) * 100)) }) : null, true),
      statTile(t('finance.allTime'), money(overall.net, { sign: true }), t('finance.entriesTotal', { n: all.length })),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { alignItems: 'start' } },
      h('div', { class: 'span-2' }, card(t('finance.tab.ops'), [search, filterSeg], rows.length ? list : empty(month.length ? t('common.nothingFound') : t('finance.emptyMonth')))),
      h('div', { class: 'stack' }, catCard('expense', t('finance.expenseByCat')), catCard('income', t('finance.incomeByCat'))),
    ),
    h(
      'div',
      { class: 'gap-t' },
      card(
        t('finance.last12'),
        h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'sw-ink' }), t('finance.incomes')), h('span', {}, h('i', { class: 'sw-ghost' }), t('finance.expenses'))),
        barChart({
          series: [
            { key: 'income', cls: 'ink' },
            { key: 'expense', cls: 'ghost' },
          ],
          points: series.map((s) => ({
            label: monthShort(s.key),
            values: s,
            tip: `${monthTitle(s.key)}\n${t('finance.incomes')}: ${money(s.income)}\n${t('finance.expenses')}: ${money(s.expense)}\n${t('finance.result')}: ${money(s.net, { sign: true })}`,
          })),
          format: compact,
        }),
      ),
    ),
  );
}
