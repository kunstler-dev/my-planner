// Inbox: imported operations (and later e-mails and job ads) waiting for a decision. One click accepts; category,
// amount and date can be changed first; transfers ask «expense / income / skip». A ticked «always» saves a rule
// for that description, which later imports follow.
import { state, update } from '../state.js';
import { h, icon, money, uid, card, empty, toast } from '../ui.js';
import { t } from '../i18n.js';
import { formModal } from '../modal.js';
import { today, shortDate } from '../dates.js';
import { DEFAULT_CATEGORIES, CAT } from '../finance-calc.js';
import { catLabel, catValue } from '../labels.js';
import { newItems, inboxToEntry, resolve } from '../inbox.js';
import { upsertRule } from '../rules.js';
import { categories } from './finance.js';

// Rows with «always» ticked (by item id); kept while the screen is open.
const always = new Set();

function decide(item, type) {
  const keepRule = always.has(item.id) && item.desc;
  update((d) => {
    const cur = d.inbox.find((x) => x.id === item.id);
    if (!cur) return;
    if (type) d.finance.push(inboxToEntry({ ...cur, category: cur.category || (type === 'income' ? CAT.other : CAT.other) }, type, uid));
    d.inbox = resolve(d.inbox, item.id, type ? 'accepted' : 'dismissed', today());
    if (keepRule) d.rules = upsertRule(d.rules, { id: uid(), field: 'desc', value: cur.desc, category: type ? cur.category || CAT.other : null, kind: type || 'skip', createdAt: today() });
  });
  always.delete(item.id);
  if (keepRule) toast(t('rules.saved', { desc: item.desc }));
}

function editModal(item) {
  const type = item.kind === 'income' ? 'income' : 'expense';
  formModal(
    item.title || t('inbox.item'),
    [
      { key: 'category', label: t('common.category'), list: categories(type).map(catLabel) },
      { key: 'amount', label: t('common.amountCur', { cur: state.data.settings.currency }), type: 'number', half: true, required: true },
      { key: 'date', label: t('common.date'), type: 'date', half: true, required: true },
      { key: 'note', label: t('common.comment') },
    ],
    { category: catLabel(item.category || ''), amount: item.amount, date: item.date, note: item.note ?? item.title },
    {
      onSave: (v) => {
        if (!(v.amount > 0)) return false;
        update((d) => Object.assign(d.inbox.find((x) => x.id === item.id), { category: catValue(v.category) || null, amount: v.amount, date: v.date, note: v.note }));
      },
    },
  );
}

function categorySelect(item) {
  const type = item.kind === 'income' ? 'income' : 'expense';
  const opts = [...new Set([...(item.category ? [item.category] : []), ...categories(type), ...DEFAULT_CATEGORIES[type === 'income' ? 'expense' : 'income']])];
  return h(
    'select',
    { class: 'input inbox-cat', title: t('common.category'), onchange: (e) => update((d) => (d.inbox.find((x) => x.id === item.id).category = e.target.value || null), { silent: true }) },
    h('option', { value: '' }, t('inbox.pickCategory')),
    opts.map((c) => h('option', { value: c, selected: c === item.category ? 'selected' : null }, catLabel(c))),
  );
}

function itemRow(item) {
  const transfer = item.kind === 'transfer';
  const signed = item.kind === 'income' ? item.amount : -item.amount;
  return h(
    'div',
    { class: 'inbox-row', 'data-kind': item.kind },
    h('span', { class: 'op-date' }, shortDate(item.date)),
    h(
      'div',
      { class: 'grow', style: { minWidth: 0 } },
      h('div', { class: 'title' }, item.title || '—', h('span', { class: 'badge', style: { marginLeft: '8px' } }, t(`inbox.kind.${item.kind}`))),
      h('div', { class: 'meta' }, [t(`inbox.source.${item.source}`), item.hold && t('inbox.hold'), item.origCurrency && item.origCurrency !== state.data.settings.currency && `${item.origAmount} ${item.origCurrency}`].filter(Boolean).join(' · ')),
    ),
    transfer ? h('span') : categorySelect(item),
    h('span', { class: `amount${signed < 0 ? ' out' : ''}` }, transfer ? money(item.amount) : money(signed, { sign: true })),
    !item.desc
      ? h('span')
      : h(
        'label',
        { class: 'inbox-always', title: t('inbox.alwaysHint', { desc: item.desc }) },
        h('input', { type: 'checkbox', checked: always.has(item.id), onchange: (e) => (e.target.checked ? always.add(item.id) : always.delete(item.id)) }),
        t('inbox.always'),
      ),
    h(
      'div',
      { class: 'row inbox-actions' },
      h('button', { class: 'btn ghost sm icon-only', title: t('common.edit'), onclick: () => editModal(item) }, icon('edit', 14)),
      transfer
        ? [
            h('button', { class: 'btn sm', onclick: () => decide(item, 'expense') }, t('finance.expense')),
            h('button', { class: 'btn sm', onclick: () => decide(item, 'income') }, t('finance.income')),
          ]
        : h('button', { class: 'btn primary sm', disabled: !item.category, title: item.category ? null : t('inbox.pickCategory'), onclick: () => decide(item, item.kind === 'income' ? 'income' : 'expense') }, icon('check', 14), t('inbox.accept')),
      h('button', { class: 'btn ghost sm', onclick: () => decide(item, null) }, t('inbox.skip')),
    ),
  );
}

export function inboxView() {
  const items = newItems(state.data.inbox).sort((a, b) => b.date.localeCompare(a.date));
  const resolved = state.data.inbox.filter((x) => x.status !== 'new');
  return h(
    'div',
    { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, t('nav.inbox')), h('div', { class: 'sub' }, t('inbox.sub')))),
    card(
      items.length ? t('inbox.newN', { n: items.length }) : t('inbox.new'),
      resolved.length ? h('span', { class: 'muted' }, t('inbox.resolvedN', { n: resolved.length })) : null,
      items.length ? h('div', { class: 'list' }, items.map(itemRow)) : empty(t('inbox.empty')),
    ),
  );
}
