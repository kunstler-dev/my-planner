// Finance tabs: monthly budgets per category, recurring payments (rent, subscriptions, salary) and savings goals.
import { state, update } from '../state.js';
import { h, icon, money, uid, card, empty, toast } from '../ui.js';
import { formModal } from '../modal.js';
import { barList } from '../charts.js';
import { today, thisMonth, prettyDate, monthTitle } from '../dates.js';
import { inMonth, DEFAULT_CATEGORIES } from '../finance-calc.js';
import { budgetStatus, firstOccurrence, upcoming, recurringMonthly, goalPlan, applyRecurring } from '../planner-calc.js';
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
    category ? `Бюджет: ${category}` : 'Новый бюджет',
    [
      { key: 'category', label: 'Категория расходов', required: true, list: categories('expense') },
      { key: 'limit', label: `Лимит в месяц, ${state.data.settings.currency}`, type: 'number', required: true },
    ],
    { category: category || '', limit: cur ?? '' },
    {
      onSave: (v) => {
        if (!(v.limit > 0)) return false;
        update((d) => {
          if (category && category !== v.category) delete d.budgets[category];
          d.budgets[v.category] = v.limit;
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
    'Финансы',
    `Бюджеты на ${monthTitle(month).toLowerCase()}`,
    h('button', { class: 'btn primary', onclick: () => budgetModal(null) }, icon('plus', 16), 'Бюджет'),
    h(
      'div',
      { class: 'grid cols-3', style: { marginBottom: '16px' } },
      tile('Потрачено из бюджетов', money(totalSpent), `из ${money(totalLimit)}`, true),
      tile('Осталось', money(Math.max(0, totalLimit - totalSpent)), totalLimit ? `${Math.round((totalSpent / totalLimit) * 100)}% использовано` : null),
      tile('Превышено', String(over.length), over.length ? over.map((b) => b.category).join(', ') : 'всё в рамках'),
    ),
    card(
      'Лимиты по категориям',
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
                  h('div', { class: 'title' }, b.over ? `⚠ ${b.category}` : b.category),
                  h('div', { class: 'num muted' }, `${money(b.spent)} из ${money(b.limit)}`),
                ),
                h('div', { class: `bar-track${b.over ? ' over' : ''}` }, h('div', { class: 'bar-fill', style: { width: `${Math.min(100, b.share * 100)}%` } })),
                h('div', { class: 'meta' }, b.over ? `перерасход ${money(b.spent - b.limit)}` : `осталось ${money(b.limit - b.spent)}`),
              ),
            ),
          )
        : empty('Бюджетов пока нет. Задай лимит, например «Еда — 300 в месяц», и здесь будет видно, сколько осталось.'),
    ),
  );
}

// ---- recurring ----

function recurringModal(r) {
  const isNew = !r?.id;
  const v = { type: 'expense', title: '', amount: '', category: '', day: Number(today().slice(8, 10)), active: true, ...r };
  formModal(
    isNew ? 'Регулярный платёж' : v.title,
    [
      {
        key: 'type',
        label: 'Тип',
        type: 'select',
        options: [
          ['expense', 'Расход (аренда, подписка…)'],
          ['income', 'Доход (зарплата, стипендия…)'],
        ],
      },
      { key: 'title', label: 'Название', required: true, placeholder: 'Например, Аренда или Spotify' },
      { key: 'amount', label: `Сумма, ${state.data.settings.currency}`, type: 'number', required: true, half: true },
      { key: 'day', label: 'День месяца', type: 'number', required: true, half: true },
      { key: 'category', label: 'Категория', list: [...DEFAULT_CATEGORIES.expense, ...DEFAULT_CATEGORIES.income] },
      { key: 'active', label: 'Активен — записывать автоматически каждый месяц', type: 'checkbox' },
    ],
    v,
    {
      onSave: (x) => {
        const day = Math.min(31, Math.max(1, Math.round(x.day || 1)));
        if (!(x.amount > 0)) return false;
        const rec = {
          ...v,
          ...x,
          day,
          category: x.category || (x.type === 'income' ? 'Другое' : 'Связь и подписки'),
          id: v.id || uid(),
          next: isNew || day !== v.day ? firstOccurrence(day, today()) : v.next,
        };
        update((d) => {
          const i = d.recurring.findIndex((y) => y.id === rec.id);
          if (i >= 0) d.recurring[i] = rec;
          else d.recurring.push(rec);
        });
        toast(`Следующая запись: ${prettyDate(rec.next)}`);
      },
      onDelete: isNew ? null : () => update((d) => (d.recurring = d.recurring.filter((y) => y.id !== v.id))),
    },
  );
}

/** Creates finance entries for all due recurring payments. Called on start and on renders. */
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
      h('div', { class: 'grow' }, h('div', { class: 'title' }, r.title), h('div', { class: 'meta' }, `${r.category} · каждое ${r.day} число${r.active ? ` · следующий ${prettyDate(r.next)}` : ' · на паузе'}`)),
      h('div', { class: `amount${r.type === 'expense' ? ' out' : ''}` }, money(r.type === 'income' ? r.amount : -r.amount, { sign: true })),
    );
  return page(
    'Финансы',
    'Аренда, подписки, зарплата — записываются сами в нужный день',
    h('button', { class: 'btn primary', onclick: () => recurringModal(null) }, icon('plus', 16), 'Платёж'),
    h(
      'div',
      { class: 'grid cols-3', style: { marginBottom: '16px' } },
      tile('Обязательные расходы в месяц', money(m.expense), `${list.filter((r) => r.active && r.type === 'expense').length} платежей`, true),
      tile('Регулярный доход в месяц', money(m.income), null),
      tile('Остаётся после обязательных', money(m.income - m.expense), m.income ? `${Math.round(((m.income - m.expense) / m.income) * 100)}% дохода свободно` : null),
    ),
    h(
      'div',
      { class: 'grid cols-2', style: { alignItems: 'start' } },
      card('Все регулярные', null, list.length ? h('div', { class: 'list' }, list.map(row)) : empty('Добавь аренду, связь, подписки (Spotify, Telegram Premium) или зарплату.')),
      card('Ближайшие 30 дней', null, soon.length ? h('div', { class: 'list' }, soon.map(row)) : empty('Ничего не запланировано')),
    ),
  );
}

// ---- goals ----

function goalModal(g) {
  const isNew = !g?.id;
  formModal(
    isNew ? 'Новая цель' : g.title,
    [
      { key: 'title', label: 'На что копим', required: true, placeholder: 'Например, Подушка безопасности или Ноутбук' },
      { key: 'target', label: `Сумма, ${state.data.settings.currency}`, type: 'number', required: true, half: true },
      { key: 'deadline', label: 'К какой дате', type: 'date', half: true },
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
    `Пополнить: ${g.title}`,
    [
      { key: 'amount', label: `Сумма, ${state.data.settings.currency} (минус — снять)`, type: 'number', required: true, half: true },
      { key: 'date', label: 'Дата', type: 'date', half: true },
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
    'Финансы',
    'Цели накоплений',
    h('button', { class: 'btn primary', onclick: () => goalModal(null) }, icon('plus', 16), 'Цель'),
    goals.length
      ? h(
          'div',
          { class: 'grid cols-2' },
          goals.map((g) => {
            const p = goalPlan(g, today());
            return card(
              g.title,
              h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => contributeModal(g) }, icon('plus', 14), 'Пополнить'), h('button', { class: 'btn ghost sm icon-only', title: 'Изменить', onclick: () => goalModal(g) }, icon('edit', 15))),
              h('div', { class: 'stat-value' }, `${money(p.saved)}`),
              h('div', { class: 'muted', style: { marginBottom: '10px' } }, `из ${money(g.target)} · ${Math.round(p.share * 100)}%`),
              h('div', { class: 'bar-track', style: { height: '10px' } }, h('div', { class: 'bar-fill', style: { width: `${p.share * 100}%` } })),
              h(
                'p',
                { class: 'muted', style: { margin: '10px 0 0' } },
                p.done
                  ? 'Цель достигнута 🎉'
                  : p.perMonth != null
                    ? `Чтобы успеть к ${prettyDate(g.deadline)}, откладывай ${money(p.perMonth)} в месяц (осталось ${money(p.left)}).`
                    : `Осталось ${money(p.left)}. Укажи дату — посчитаю, сколько откладывать в месяц.`,
              ),
            );
          }),
        )
      : card(null, null, empty('Целей пока нет. Например: «Подушка безопасности — 1500 € к лету» или «Новый ноутбук для проектов».')),
    goals.length > 0 &&
      h(
        'div',
        { style: { marginTop: '16px' } },
        card(
          'Сводка',
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
