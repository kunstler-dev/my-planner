// Accounts: where the money is (Trust Wallet, Ukrainian card, German card, …). Balances are typed in by hand,
// each update is kept as a history point; totals are converted with NBU rates (or rates typed by hand).
import { state, update } from '../state.js';
import { h, icon, money, uid, card, empty, toast } from '../ui.js';
import { t, locale } from '../i18n.js';
import { formModal } from '../modal.js';
import { lineChart, barList } from '../charts.js';
import { today, prettyDate } from '../dates.js';
import { netWorth, convert, setBalance, ratesFromNbu } from '../planner-calc.js';
import { accountName, accountNameValue, rateSource as sourceKey } from '../labels.js';

const curs = () => [
  ['€', t('cur.eur')],
  ['₴', t('cur.uah')],
  ['$', t('cur.usd')],
];

export function fmt(amount, cur) {
  const v = Math.round((Number(amount) || 0) * 100) / 100;
  return `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString(locale(), { maximumFractionDigits: 2 })} ${cur}`;
}

export async function refreshRates({ silent = false } = {}) {
  const res = await window.api.fetchRates();
  const rates = res.ok && ratesFromNbu(res.list);
  if (!rates) {
    if (!silent) toast(t('accounts.ratesFailed'));
    return;
  }
  update((d) => (d.rates = { ...rates, updatedAt: today(), source: 'nbu' }));
  if (!silent) toast(t('accounts.ratesUpdated'));
}

function balanceModal(a) {
  formModal(
    t('accounts.balanceOf', { name: accountName(a) }),
    [{ key: 'balance', label: t('accounts.balanceNow', { cur: a.currency }), type: 'number', required: true }],
    { balance: a.balance },
    {
      submitText: t('common.update'),
      onSave: (v) => {
        if (v.balance == null || Number.isNaN(v.balance)) return false;
        update((d) => {
          const i = d.accounts.findIndex((x) => x.id === a.id);
          d.accounts[i] = setBalance(d.accounts[i], v.balance, today());
        });
      },
    },
  );
}

function accountModal(a) {
  const isNew = !a;
  formModal(
    isNew ? t('accounts.new') : accountName(a),
    [
      { key: 'name', label: t('common.name'), required: true, placeholder: t('accounts.namePh') },
      { key: 'currency', label: t('common.currency'), type: 'select', options: curs() },
      ...(isNew ? [{ key: 'balance', label: t('accounts.balanceStart'), type: 'number' }] : []),
    ],
    { name: '', currency: '€', balance: '', ...a, ...(a ? { name: accountName(a) } : {}) },
    {
      onSave: (v) => {
        update((d) => {
          if (isNew) d.accounts.push(setBalance({ id: uid(), name: v.name, currency: v.currency, history: [] }, v.balance || 0, today()));
          else Object.assign(d.accounts.find((x) => x.id === a.id), { name: accountNameValue(a, v.name), currency: v.currency });
        });
      },
      onDelete: isNew ? null : () => update((d) => (d.accounts = d.accounts.filter((x) => x.id !== a.id))),
    },
  );
}

function ratesModal() {
  const r = state.data.rates;
  formModal(
    t('accounts.ratesManual'),
    [
      { key: 'uah', label: t('accounts.uahPerEur'), type: 'number', required: true, half: true },
      { key: 'usd', label: t('accounts.usdPerEur'), type: 'number', required: true, half: true },
    ],
    { uah: r['₴'], usd: r.$ },
    {
      onSave: (v) => {
        if (!(v.uah > 0 && v.usd > 0)) return false;
        update((d) => (d.rates = { '€': 1, '₴': v.uah, $: v.usd, updatedAt: today(), source: 'manual' }));
      },
    },
  );
}

/** Net worth over time from every account's balance history (rates of today). */
function historySeries(accounts, rates, main) {
  const dates = [...new Set(accounts.flatMap((a) => (a.history || []).map((x) => x.date)))].sort();
  return dates.map((date) => {
    const total = accounts.reduce((s, a) => {
      const last = (a.history || []).filter((x) => x.date <= date).at(-1);
      return s + (last ? convert(last.balance, a.currency, main, rates) : 0);
    }, 0);
    return { date, total };
  });
}

export function accountsView() {
  const { accounts, rates, settings } = state.data;
  const main = settings.currency;
  const nw = netWorth(accounts, rates, main);
  const series = historySeries(accounts, rates, main);
  if (!rates.updatedAt || rates.updatedAt < today()) setTimeout(() => sourceKey(rates) !== 'manual' && refreshRates({ silent: true }), 0);

  return h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head' },
      h('div', {}, h('h1', {}, t('nav.accounts')), h('div', { class: 'sub' }, t('accounts.sub'))),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => refreshRates() }, icon('refresh', 16), t('accounts.nbuRate')), h('button', { class: 'btn primary', onclick: () => accountModal(null) }, icon('plus', 16), t('accounts.add'))),
    ),
    h(
      'div',
      { class: 'grid cols-4 gap-b' },
      h(
        'div',
        { class: 'card stat dark' },
        h('div', { class: 'stat-label' }, t('accounts.total')),
        h('div', { class: 'stat-value' }, money(nw.total)),
        h('div', { class: 'stat-note' }, main === '€' ? `≈ ${fmt(convert(nw.total, '€', '₴', rates), '₴')}` : `≈ ${fmt(convert(nw.total, main, '€', rates), '€')}`),
      ),
      accounts.slice(0, 3).map((a) =>
        h(
          'button',
          { class: 'card stat', style: { textAlign: 'left', cursor: 'pointer' }, title: t('accounts.updateBalance'), onclick: () => balanceModal(a) },
          h('div', { class: 'stat-label' }, accountName(a)),
          h('div', { class: 'stat-value' }, fmt(a.balance, a.currency)),
          h('div', { class: 'stat-note' }, a.currency === main ? (a.updatedAt ? t('accounts.updated', { date: prettyDate(a.updatedAt) }) : t('accounts.clickToEnter')) : `≈ ${money(convert(a.balance, a.currency, main, rates))}`),
        ),
      ),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { alignItems: 'start' } },
      h(
        'div',
        { class: 'span-2 stack' },
        card(
          t('accounts.all'),
          null,
          accounts.length
            ? h(
                'div',
                { class: 'list' },
                accounts.map((a) =>
                  h(
                    'div',
                    { class: 'list-row' },
                    h('div', { class: 'grow' }, h('div', { class: 'title' }, accountName(a)), h('div', { class: 'meta' }, a.updatedAt ? t('accounts.updated', { date: prettyDate(a.updatedAt) }) : t('accounts.notEntered'))),
                    h('div', { style: { textAlign: 'right' } }, h('div', { class: 'amount' }, fmt(a.balance, a.currency)), a.currency !== main && h('div', { class: 'meta' }, `≈ ${money(convert(a.balance, a.currency, main, rates))}`)),
                    h('button', { class: 'btn sm', onclick: () => balanceModal(a) }, t('accounts.balance')),
                    h('button', { class: 'btn ghost sm icon-only', title: t('common.edit'), onclick: () => accountModal(a) }, icon('edit', 15)),
                  ),
                ),
              )
            : empty(t('accounts.none')),
        ),
        card(
          t('accounts.history'),
          null,
          series.length > 1
            ? lineChart({
                points: series.map((p) => ({ label: p.date.slice(8, 10) + '.' + p.date.slice(5, 7), value: p.total, tip: `${prettyDate(p.date)}\n${money(p.total)}` })),
                format: (v) => money(v).replace(/[,.]\d+(?=\s)/, ''),
                labelEvery: Math.ceil(series.length / 8),
              })
            : empty(t('accounts.historyEmpty')),
        ),
      ),
      h(
        'div',
        { class: 'stack' },
        card(t('accounts.split'), null, nw.total > 0 ? barList(nw.parts.map((p) => ({ label: accountName(accounts.find((a) => a.id === p.id)), share: p.share, text: `${money(p.value)} · ${Math.round(p.share * 100)}%` }))) : empty(t('accounts.enterBalances'))),
        card(
          t('accounts.rates'),
          h('button', { class: 'btn ghost sm', onclick: ratesModal }, t('accounts.manual')),
          h(
            'div',
            { class: 'list' },
            h('div', { class: 'list-row' }, h('div', { class: 'grow' }, '1 €'), h('div', { class: 'amount' }, fmt(rates['₴'], '₴'))),
            h('div', { class: 'list-row' }, h('div', { class: 'grow' }, '1 €'), h('div', { class: 'amount' }, fmt(rates.$, '$'))),
            h('div', { class: 'list-row' }, h('div', { class: 'grow' }, '1 $'), h('div', { class: 'amount' }, fmt(rates['₴'] / rates.$, '₴'))),
          ),
          h('p', { class: 'muted', style: { margin: '8px 0 0', fontSize: '12.5px' } }, rates.updatedAt ? t('accounts.ratesNote', { source: t(`accounts.source.${sourceKey(rates)}`), date: prettyDate(rates.updatedAt) }) : t('accounts.ratesNone')),
        ),
      ),
    ),
  );
}
