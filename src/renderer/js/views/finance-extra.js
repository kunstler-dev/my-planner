// Finance tabs: monthly budgets per category, recurring payments (rent, subscriptions, salary) and savings goals.
import { state, update } from '../state.js';
import { h, icon, money, uid, card, empty, toast } from '../ui.js';
import { t } from '../i18n.js';
import { formModal } from '../modal.js';
import { barList } from '../charts.js';
import { today, thisMonth, prettyDate, monthTitle } from '../dates.js';
import { inMonth, DEFAULT_CATEGORIES, CAT } from '../finance-calc.js';
import { budgetStatus, firstOccurrence, upcoming, recurringMonthly, goalPlan, applyRecurring } from '../planner-calc.js';
import { catLabel, catValue } from '../labels.js';
import { financeTabs, categories } from './finance.js';

function page(title, sub, actions, ...body) {
  return h(
    'div',
    { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), sub && h('div', { class: 'sub' }, sub)), actions && h('div', { class: 'row' }, actions)),
    financeTabs(),
    ...body,
  );
}

function tile(label, value, note, dark) {
  return h(
    'div',
    { class: `card stat${dark ? ' dark' : ''}` },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-value' }, value),
    note && h('div', { class: 'stat-note' }, note),
  );
}

// ---- budgets ----

function budgetModal(category) {
  const cur = state.data.budgets[category];
  formModal(
    category ? t('budget.titleOf', { category: catLabel(category) }) : t('budget.new'),
    [
      { key: 'category', label: t('budget.category'), required: true, list: categories('expense').map(catLabel) },
      { key: 'limit', label: t('budget.limit', { cur: state.data.settings.currency }), type: 'number', required: true },
    ],
    { category: category ? catLabel(category) : '', limit: cur ?? '' },
    {
      onSave: (v) => {
        if (!(v.limit > 0)) return false;
        const value = catValue(v.category);
        update((d) => {
          if (category && category !== value) delete d.budgets[category];
          d.budgets[value] = v.limit;
        });
      },
      onDelete: category ? () => update((d) => delete d.budgets[category]) : null,
    },
  );
}

export function budgetsTab() {
  const month = thisMonth();
  const st = budgetStatus(inMonth(state.data.finance, month), state.data.budgets);
  const totalLimit = st.reduce((s, b) => s + b.limit, 0);
  const totalSpent = st.reduce((s, b) => s + b.spent, 0);
  const over = st.filter((b) => b.over);
  return page(
    t('nav.finance'),
    t('budget.sub', { month: monthTitle(month) }),
    h('button', { class: 'btn primary', onclick: () => budgetModal(null) }, icon('plus', 16), t('budget.add')),
    h(
      'div',
      { class: 'grid cols-3 gap-b' },
      tile(t('budget.spent'), money(totalSpent), t('common.ofAmount', { amount: money(totalLimit) }), true),
      tile(t('budget.left'), money(Math.max(0, totalLimit - totalSpent)), totalLimit ? t('budget.used', { p: Math.round((totalSpent / totalLimit) * 100) }) : null),
      tile(t('budget.overCount'), String(over.length), over.length ? over.map((b) => catLabel(b.category)).join(', ') : t('budget.allOk')),
    ),
    card(
      t('budget.limits'),
      null,
      st.length
        ? h(
            'div',
            {},
            st.map((b) =>
              h(
                'div',
                { class: 'budget-row', onclick: () => budgetModal(b.category) },
                h(
                  'div',
                  { class: 'bar-top' },
                  h('div', { class: 'title' }, b.over ? `⚠ ${catLabel(b.category)}` : catLabel(b.category)),
                  h('div', { class: 'num muted' }, t('common.xOfY', { x: money(b.spent), y: money(b.limit) })),
                ),
                h('div', { class: `bar-track${b.over ? ' over' : ''}` }, h('div', { class: 'bar-fill', style: { width: `${Math.min(100, b.share * 100)}%` } })),
                h('div', { class: 'meta' }, b.over ? t('budget.overBy', { amount: money(b.spent - b.limit) }) : t('budget.leftOf', { amount: money(b.limit - b.spent) })),
              ),
            ),
          )
        : empty(t('budget.empty')),
    ),
  );
}

// ---- recurring ----

function recurringModal(r) {
  const isNew = !r?.id;
  const v = { type: 'expense', title: '', amount: '', category: '', day: Number(today().slice(8, 10)), active: true, ...r };
  formModal(
    isNew ? t('recurring.new') : v.title,
    [
      {
        key: 'type',
        label: t('common.type'),
        type: 'select',
        options: [
          ['expense', t('recurring.typeExpense')],
          ['income', t('recurring.typeIncome')],
        ],
      },
      { key: 'title', label: t('common.name'), required: true, placeholder: t('recurring.titlePh') },
      { key: 'amount', label: t('common.amountCur', { cur: state.data.settings.currency }), type: 'number', required: true, half: true },
      { key: 'day', label: t('recurring.day'), type: 'number', required: true, half: true },
      { key: 'category', label: t('common.category'), list: [...new Set([...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income])].map(catLabel) },
      { key: 'active', label: t('recurring.active'), type: 'checkbox' },
    ],
    { ...v, category: catLabel(v.category) },
    {
      onSave: (x) => {
        const day = Math.min(31, Math.max(1, Math.round(x.day || 1)));
        if (!(x.amount > 0)) return false;
        const rec = {
          ...v,
          ...x,
          day,
          category: catValue(x.category) || (x.type === 'income' ? CAT.other : CAT.subscriptions),
          id: v.id || uid(),
          next: isNew || day !== v.day ? firstOccurrence(day, today()) : v.next,
        };
        update((d) => {
          const i = d.recurring.findIndex((y) => y.id === rec.id);
          if (i >= 0) d.recurring[i] = rec;
          else d.recurring.push(rec);
        });
        toast(t('recurring.nextToast', { date: prettyDate(rec.next) }));
      },
      onDelete: isNew ? null : () => update((d) => (d.recurring = d.recurring.filter((y) => y.id !== v.id))),
    },
  );
}

/** Creates finance entries for all due recurring payments. Called on start and when the date changes. */
export function syncRecurring() {
  const res = applyRecurring(state.data.recurring, today(), uid);
  if (!res.entries.length) return 0;
  update(
    (d) => {
      d.recurring = res.recurring;
      d.finance.push(...res.entries);
    },
    { silent: true },
  );
  return res.entries.length;
}

export function recurringTab() {
  const list = state.data.recurring;
  const m = recurringMonthly(list);
  const soon = upcoming(list, today(), 30);
  const row = (r) =>
    h(
      'div',
      { class: 'list-row', style: { cursor: 'pointer', opacity: r.active ? 1 : 0.5 }, onclick: () => recurringModal(r) },
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'title' }, r.title),
        h('div', { class: 'meta' }, [catLabel(r.category), t('recurring.everyDay', { day: r.day }), r.active ? t('recurring.next', { date: prettyDate(r.next) }) : t('recurring.paused')].join(' · ')),
      ),
      h('div', { class: `amount${r.type === 'expense' ? ' out' : ''}` }, money(r.type === 'income' ? r.amount : -r.amount, { sign: true })),
    );
  return page(
    t('nav.finance'),
    t('recurring.sub'),
    h('button', { class: 'btn primary', onclick: () => recurringModal(null) }, icon('plus', 16), t('recurring.add')),
    h(
      'div',
      { class: 'grid cols-3 gap-b' },
      tile(t('recurring.monthlyExpense'), money(m.expense), t('recurring.paymentsN', { n: list.filter((r) => r.active && r.type === 'expense').length }), true),
      tile(t('recurring.monthlyIncome'), money(m.income), null),
      tile(t('recurring.leftAfter'), money(m.income - m.expense), m.income ? t('recurring.freeShare', { p: Math.round(((m.income - m.expense) / m.income) * 100) }) : null),
    ),
    h(
      'div',
      { class: 'grid cols-2', style: { alignItems: 'start' } },
      card(t('recurring.all'), null, list.length ? h('div', { class: 'list' }, list.map(row)) : empty(t('recurring.empty'))),
      card(t('recurring.next30'), null, soon.length ? h('div', { class: 'list' }, soon.map(row)) : empty(t('recurring.nothing'))),
    ),
  );
}

// ---- goals ----

function goalModal(g) {
  const isNew = !g?.id;
  formModal(
    isNew ? t('goal.new') : g.title,
    [
      { key: 'title', label: t('goal.what'), required: true, placeholder: t('goal.whatPh') },
      { key: 'target', label: t('common.amountCur', { cur: state.data.settings.currency }), type: 'number', required: true, half: true },
      { key: 'deadline', label: t('goal.deadline'), type: 'date', half: true },
    ],
    { title: '', target: '', deadline: '', ...g },
    {
      onSave: (v) => {
        if (!(v.target > 0)) return false;
        update((d) => {
          const i = d.goals.findIndex((x) => x.id === g?.id);
          if (i >= 0) d.goals[i] = { ...d.goals[i], ...v };
          else d.goals.push({ id: uid(), contributions: [], ...v });
        });
      },
      onDelete: isNew ? null : () => update((d) => (d.goals = d.goals.filter((x) => x.id !== g.id))),
    },
  );
}

function contributeModal(g) {
  formModal(
    t('goal.contributeTo', { title: g.title }),
    [
      { key: 'amount', label: t('goal.amountHint', { cur: state.data.settings.currency }), type: 'number', required: true, half: true },
      { key: 'date', label: t('common.date'), type: 'date', half: true },
    ],
    { amount: '', date: today() },
    {
      onSave: (v) => {
        if (!v.amount) return false;
        update((d) => d.goals.find((x) => x.id === g.id).contributions.push({ amount: v.amount, date: v.date || today() }));
      },
    },
  );
}

export function goalsTab() {
  const goals = state.data.goals;
  return page(
    t('nav.finance'),
    t('goal.sub'),
    h('button', { class: 'btn primary', onclick: () => goalModal(null) }, icon('plus', 16), t('goal.add')),
    goals.length
      ? h(
          'div',
          { class: 'grid cols-2' },
          goals.map((g) => {
            const p = goalPlan(g, today());
            return card(
              g.title,
              h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => contributeModal(g) }, icon('plus', 14), t('goal.contribute')), h('button', { class: 'btn ghost sm icon-only', title: t('common.edit'), onclick: () => goalModal(g) }, icon('edit', 15))),
              h('div', { class: 'stat-value' }, `${money(p.saved)}`),
              h('div', { class: 'muted', style: { marginBottom: '10px' } }, `${t('common.ofAmount', { amount: money(g.target) })} · ${Math.round(p.share * 100)}%`),
              h('div', { class: 'bar-track', style: { height: '10px' } }, h('div', { class: 'bar-fill', style: { width: `${p.share * 100}%` } })),
              h(
                'p',
                { class: 'muted', style: { margin: '10px 0 0' } },
                p.done
                  ? t('goal.done')
                  : p.perMonth != null
                    ? t('goal.plan', { date: prettyDate(g.deadline), perMonth: money(p.perMonth), left: money(p.left) })
                    : t('goal.noDate', { left: money(p.left) }),
              ),
            );
          }),
        )
      : card(null, null, empty(t('goal.empty'))),
    goals.length > 0 &&
      h(
        'div',
        { class: 'gap-t' },
        card(
          t('goal.summary'),
          null,
          barList(
            goals.map((g) => {
              const p = goalPlan(g, today());
              return { label: g.title, share: p.share, text: `${money(p.saved)} / ${money(g.target)}` };
            }),
          ),
        ),
      ),
  );
}
