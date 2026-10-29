// Inbox: imported operations, letters and (later) job ads waiting for a decision. One click accepts; category,
// amount and date can be changed first; transfers ask «expense / income / skip». A ticked «always» (bank) or a
// changed category (mail) saves a rule that later imports follow. A bill that matches a bank operation is attached
// to it instead of creating a second one; status letters move applications in Career.
import { state, update } from '../state.js';
import { h, icon, money, uid, card, empty, toast } from '../ui.js';
import { t } from '../i18n.js';
import { formModal } from '../modal.js';
import { today, shortDate, prettyDate } from '../dates.js';
import { DEFAULT_CATEGORIES, CAT } from '../finance-calc.js';
import { catLabel, catValue } from '../labels.js';
import { newItems, inboxToEntry, resolve } from '../inbox.js';
import { upsertRule } from '../rules.js';
import { categories } from './finance.js';
import { applyLetter, createFromLetter } from './career.js';

// Bank rows with «always» ticked (by item id); kept while the screen is open.
const always = new Set();

function decide(row, type) {
  // The row may have been rendered before its category was picked: use the item as it is now.
  const item = state.data.inbox.find((x) => x.id === row.id) || row;
  const bankRule = always.has(item.id) && item.desc;
  // Letters learn from a changed category: the rule is by the sender's domain.
  const mailRule = type && item.source === 'mail' && item.domain && item.category && item.category !== item.suggested;
  update((d) => {
    const cur = d.inbox.find((x) => x.id === item.id);
    if (!cur) return;
    if (type && cur.match && d.finance.some((e) => e.id === cur.match)) {
      Object.assign(d.finance.find((e) => e.id === cur.match), { merchant: cur.merchant || cur.title, mailLink: cur.link, mailSubject: cur.subject });
    } else if (type) {
      d.finance.push({ ...inboxToEntry({ ...cur, category: cur.category || CAT.other }, type, uid), ...(cur.source === 'mail' ? { merchant: cur.merchant, mailLink: cur.link } : {}) });
      if (cur.steamId != null) {
        const game = d.wishlist.find((g) => g.id === cur.steamId);
        if (game) game.boughtAt = cur.date;
      }
    }
    for (const b of d.bills) if (type && b.ref === cur.ref) Object.assign(b, { paid: true, paidAt: today() });
    d.inbox = resolve(d.inbox, item.id, type ? 'accepted' : 'dismissed', today());
    if (bankRule) d.rules = upsertRule(d.rules, { id: uid(), field: 'desc', value: cur.desc, category: type ? cur.category || CAT.other : null, kind: type || 'skip', createdAt: today() });
    if (mailRule) d.rules = upsertRule(d.rules, { id: uid(), field: 'domain', value: cur.domain, category: cur.category, kind: type, createdAt: today() });
  });
  always.delete(item.id);
  if (bankRule) toast(t('rules.saved', { desc: item.desc }));
  if (mailRule) toast(t('rules.saved', { desc: item.domain }));
}

function careerDecision(item, create) {
  if (create) createFromLetter(item);
  else applyLetter(item);
  update((d) => (d.inbox = resolve(d.inbox, item.id, 'accepted', today())));
  toast(t('inbox.careerApplied', { status: t(`status.${item.career.status}`) }));
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
    { category: catLabel(item.category || ''), amount: item.amount ?? '', date: item.date, note: item.note ?? item.title },
    {
      onSave: (v) => {
        if (!(v.amount > 0)) return false;
        update((d) => {
          const x = d.inbox.find((y) => y.id === item.id);
          // A letter that couldn't be read becomes an expense once the amount is filled in.
          Object.assign(x, { category: catValue(v.category) || null, amount: v.amount, date: v.date, note: v.note, kind: x.kind === 'unparsed' ? 'expense' : x.kind });
        });
      },
    },
  );
}

function categorySelect(item) {
  const type = item.kind === 'income' ? 'income' : 'expense';
  const opts = [...new Set([...(item.category ? [item.category] : []), ...categories(type), ...DEFAULT_CATEGORIES[type === 'income' ? 'expense' : 'income']])];
  return h(
    'select',
    { class: 'input inbox-cat', title: t('common.category'), onchange: (e) => update((d) => (d.inbox.find((x) => x.id === item.id).category = e.target.value || null)) },
    h('option', { value: '' }, t('inbox.pickCategory')),
    opts.map((c) => h('option', { value: c, selected: c === item.category ? 'selected' : null }, catLabel(c))),
  );
}

const gmail = (item) => item.link && h('a', { class: 'btn ghost sm icon-only', href: item.link, target: '_blank', title: t('inbox.openGmail') }, icon('up', 14));

function meta(item) {
  const parts = [t(`inbox.source.${item.source}`)];
  if (item.source === 'mail' && item.sender) parts.push(item.sender);
  if (item.hold) parts.push(t('inbox.hold'));
  if (item.dueDate) parts.push(t('inbox.due', { date: prettyDate(item.dueDate) }));
  if (item.origCurrency && item.origCurrency !== state.data.settings.currency) parts.push(`${item.origAmount} ${item.origCurrency}`);
  const match = item.match && state.data.finance.find((e) => e.id === item.match);
  if (match) parts.push(t('inbox.matches', { date: shortDate(match.date), amount: money(match.amount) }));
  if (item.kind === 'career') parts.push(item.career.appId ? t('inbox.careerTo', { company: item.career.company, status: t(`status.${item.career.status}`) }) : t('inbox.careerNoApp', { company: item.career.company }));
  return parts.join(' · ');
}

function actions(item) {
  const skip = h('button', { class: 'btn ghost sm', onclick: () => decide(item, null) }, t('inbox.skip'));
  const edit = h('button', { class: 'btn ghost sm icon-only', title: t('common.edit'), onclick: () => editModal(item) }, icon('edit', 14));
  if (item.kind === 'career') {
    return [
      gmail(item),
      item.career.appId
        ? h('button', { class: 'btn primary sm', onclick: () => careerDecision(item, false) }, icon('check', 14), t('inbox.apply'))
        : h('button', { class: 'btn sm', onclick: () => careerDecision(item, true) }, icon('plus', 14), t('inbox.createApp')),
      skip,
    ];
  }
  if (item.kind === 'alert') return [gmail(item), h('button', { class: 'btn sm', onclick: () => decide(item, null) }, t('inbox.gotIt'))];
  if (item.kind === 'unparsed') return [gmail(item), edit, skip];
  if (item.kind === 'transfer') {
    return [edit, h('button', { class: 'btn sm', onclick: () => decide(item, 'expense') }, t('finance.expense')), h('button', { class: 'btn sm', onclick: () => decide(item, 'income') }, t('finance.income')), skip];
  }
  const accept = item.match ? t('inbox.attach') : t('inbox.accept');
  return [
    gmail(item),
    edit,
    h('button', { class: 'btn primary sm', disabled: !item.category && !item.match, title: item.category ? null : t('inbox.pickCategory'), onclick: () => decide(item, item.kind === 'income' ? 'income' : 'expense') }, icon('check', 14), accept),
    skip,
  ];
}

function itemRow(item) {
  const signed = item.kind === 'income' ? item.amount : -item.amount;
  const withCategory = item.kind === 'expense' || item.kind === 'income';
  const title = item.kind === 'unparsed' ? t('inbox.unparsed', { subject: item.subject || item.title }) : item.title || '—';
  return h(
    'div',
    { class: `inbox-row kind-${item.kind}`, 'data-kind': item.kind, 'data-id': item.id },
    h('span', { class: 'op-date' }, shortDate(item.date)),
    h('div', { class: 'grow', style: { minWidth: 0 } }, h('div', { class: 'title', title }, title, h('span', { class: 'badge', style: { marginLeft: '8px' } }, t(`inbox.kind.${item.kind}`))), h('div', { class: 'meta', title: meta(item) }, meta(item))),
    withCategory ? categorySelect(item) : h('span'),
    item.amount > 0 ? h('span', { class: `amount${signed < 0 ? ' out' : ''}` }, item.kind === 'transfer' ? money(item.amount) : money(signed, { sign: true })) : h('span'),
    item.desc
      ? h(
          'label',
          { class: 'inbox-always', title: t('inbox.alwaysHint', { desc: item.desc }) },
          h('input', { type: 'checkbox', checked: always.has(item.id), onchange: (e) => (e.target.checked ? always.add(item.id) : always.delete(item.id)) }),
          t('inbox.always'),
        )
      : h('span'),
    h('div', { class: 'row inbox-actions' }, actions(item)),
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
