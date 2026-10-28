// Accounts: where the money is (Trust Wallet, Ukrainian card, German card, …). Balances are typed in by hand,
// each update is kept as a history point; totals are converted with NBU rates (or rates typed by hand).
import { state, update } from '../state.js';
import { h, icon, money, uid, card, empty, toast } from '../ui.js';
import { formModal } from '../modal.js';
import { lineChart, barList } from '../charts.js';
import { today, prettyDate } from '../dates.js';
import { netWorth, convert, setBalance, ratesFromNbu } from '../planner-calc.js';

const CURS = [
  ['€', 'Евро €'],
  ['₴', 'Гривна ₴'],
  ['$', 'Доллар / USDT $'],
];

export function fmt(amount, cur) {
  const v = Math.round((Number(amount) || 0) * 100) / 100;
  return `${v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ${cur}`;
}

export async function refreshRates({ silent = false } = {}) {
  const res = await window.api.fetchRates();
  const rates = res.ok && ratesFromNbu(res.list);
  if (!rates) {
    if (!silent) toast('Не удалось получить курс НБУ — можно ввести вручную');
    return;
  }
  update((d) => (d.rates = { ...rates, updatedAt: today(), source: 'НБУ' }));
  if (!silent) toast('Курс обновлён по НБУ');
}

function balanceModal(a) {
  formModal(
    `Остаток: ${a.name}`,
    [{ key: 'balance', label: `Сейчас на счёте, ${a.currency}`, type: 'number', required: true }],
    { balance: a.balance },
    {
      submitText: 'Обновить',
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
    isNew ? 'Новый счёт' : a.name,
    [
      { key: 'name', label: 'Название', required: true, placeholder: 'Например, Monobank или Наличные' },
      { key: 'currency', label: 'Валюта', type: 'select', options: CURS },
      ...(isNew ? [{ key: 'balance', label: 'Остаток сейчас', type: 'number' }] : []),
    ],
    { name: '', currency: '€', balance: '', ...a },
    {
      onSave: (v) => {
        update((d) => {
          if (isNew) d.accounts.push(setBalance({ id: uid(), name: v.name, currency: v.currency, history: [] }, v.balance || 0, today()));
          else Object.assign(d.accounts.find((x) => x.id === a.id), { name: v.name, currency: v.currency });
        });
      },
      onDelete: isNew ? null : () => update((d) => (d.accounts = d.accounts.filter((x) => x.id !== a.id))),
    },
  );
}

function ratesModal() {
  const r = state.data.rates;
  formModal(
    'Курсы вручную',
    [
      { key: 'uah', label: 'Гривен за 1 €', type: 'number', required: true, half: true },
      { key: 'usd', label: 'Долларов за 1 €', type: 'number', required: true, half: true },
    ],
    { uah: r['₴'], usd: r.$ },
    {
      onSave: (v) => {
        if (!(v.uah > 0 && v.usd > 0)) return false;
        update((d) => (d.rates = { '€': 1, '₴': v.uah, $: v.usd, updatedAt: today(), source: 'вручную' }));
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
  if (!rates.updatedAt || rates.updatedAt < today()) setTimeout(() => rates.source !== 'вручную' && refreshRates({ silent: true }), 0);

  return h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Счета'), h('div', { class: 'sub' }, 'Где сколько лежит — крипта, украинская и немецкая карта')),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => refreshRates() }, icon('refresh', 16), 'Курс НБУ'), h('button', { class: 'btn primary', onclick: () => accountModal(null) }, icon('plus', 16), 'Счёт')),
    ),
    h(
      'div',
      { class: 'grid cols-4', style: { marginBottom: '16px' } },
      h(
        'div',
        { class: 'card stat dark' },
        h('div', { class: 'stat-label' }, 'Всего'),
        h('div', { class: 'stat-value' }, money(nw.total)),
        h('div', { class: 'stat-note' }, main === '€' ? `≈ ${fmt(convert(nw.total, '€', '₴', rates), '₴')}` : `≈ ${fmt(convert(nw.total, main, '€', rates), '€')}`),
      ),
      accounts.slice(0, 3).map((a) =>
        h(
          'button',
          { class: 'card stat', style: { textAlign: 'left', cursor: 'pointer' }, title: 'Обновить остаток', onclick: () => balanceModal(a) },
          h('div', { class: 'stat-label' }, a.name),
          h('div', { class: 'stat-value' }, fmt(a.balance, a.currency)),
          h('div', { class: 'stat-note' }, a.currency === main ? (a.updatedAt ? `обновлено ${prettyDate(a.updatedAt)}` : 'нажми, чтобы вписать') : `≈ ${money(convert(a.balance, a.currency, main, rates))}`),
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
          'Все счета',
          null,
          accounts.length
            ? h(
                'div',
                { class: 'list' },
                accounts.map((a) =>
                  h(
                    'div',
                    { class: 'list-row' },
                    h('div', { class: 'grow' }, h('div', { class: 'title' }, a.name), h('div', { class: 'meta' }, a.updatedAt ? `обновлено ${prettyDate(a.updatedAt)}` : 'остаток ещё не вписан')),
                    h('div', { style: { textAlign: 'right' } }, h('div', { class: 'amount' }, fmt(a.balance, a.currency)), a.currency !== main && h('div', { class: 'meta' }, `≈ ${money(convert(a.balance, a.currency, main, rates))}`)),
                    h('button', { class: 'btn sm', onclick: () => balanceModal(a) }, 'Остаток'),
                    h('button', { class: 'btn ghost sm icon-only', title: 'Изменить', onclick: () => accountModal(a) }, icon('edit', 15)),
                  ),
                ),
              )
            : empty('Счетов нет'),
        ),
        card(
          'Капитал во времени',
          null,
          series.length > 1
            ? lineChart({
                points: series.map((p) => ({ label: p.date.slice(8, 10) + '.' + p.date.slice(5, 7), value: p.total, tip: `${prettyDate(p.date)}\n${money(p.total)}` })),
                format: (v) => money(v).replace(/,\d+/, ''),
                labelEvery: Math.ceil(series.length / 8),
              })
            : empty('График появится, когда обновишь остатки хотя бы в два разных дня.'),
        ),
      ),
      h(
        'div',
        { class: 'stack' },
        card('Распределение', null, nw.total > 0 ? barList(nw.parts.map((p) => ({ label: p.name, share: p.share, text: `${money(p.value)} · ${Math.round(p.share * 100)}%` }))) : empty('Впиши остатки')),
        card(
          'Курсы',
          h('button', { class: 'btn ghost sm', onclick: ratesModal }, 'Вручную'),
          h(
            'div',
            { class: 'list' },
            h('div', { class: 'list-row' }, h('div', { class: 'grow' }, '1 €'), h('div', { class: 'amount' }, fmt(rates['₴'], '₴'))),
            h('div', { class: 'list-row' }, h('div', { class: 'grow' }, '1 €'), h('div', { class: 'amount' }, fmt(rates.$, '$'))),
            h('div', { class: 'list-row' }, h('div', { class: 'grow' }, '1 $'), h('div', { class: 'amount' }, fmt(rates['₴'] / rates.$, '₴'))),
          ),
          h('p', { class: 'muted', style: { margin: '8px 0 0', fontSize: '12.5px' } }, rates.updatedAt ? `${rates.source || 'НБУ'}, ${prettyDate(rates.updatedAt)}. Крипту вписывай в долларах (USDT).` : 'Курс ещё не загружен.'),
        ),
      ),
    ),
  );
}
