// Accounts: where the money is (Trust Wallet, Ukrainian card, German card, …). A balance is typed in by hand or
// updated automatically (Trust Wallet public addresses, Monobank); each update is a history point. Totals are
// converted with NBU rates (or rates typed by hand). «Balance» stays as a manual correction for any account.
import { state, update } from '../state.js';
import { h, icon, money, uid, card, empty, toast } from '../ui.js';
import { t, locale } from '../i18n.js';
import { openModal, formModal } from '../modal.js';
import { lineChart, barList } from '../charts.js';
import { today, prettyDate } from '../dates.js';
import { netWorth, convert, setBalance, ratesFromNbu } from '../planner-calc.js';
import { accountName, accountNameValue, rateSource as sourceKey } from '../labels.js';
import { CURRENCY } from '../mono-import.js';
import { syncAccount, isSyncing, refreshStaleWallets } from '../account-sync.js';
import { validAddress, looksLikeSeed } from '../wallet-check.js';

const curs = () => [
  ['€', t('cur.eur')],
  ['₴', t('cur.uah')],
  ['$', t('cur.usd')],
];
const NETWORKS = ['tron', 'bsc', 'eth'];

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

const time = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const syncError = (code) => t(`sync.error.${['partial', 'no_token', 'bad_token', 'rate', 'network', 'no_addresses'].includes(code) ? code : 'http'}`);

/** «auto, updated at 14:05», the error, or the manual «updated on …». */
function syncNote(a) {
  const kind = a.sync?.kind;
  if (kind === 'trust' || kind === 'mono') {
    if (isSyncing(kind === 'mono' ? 'mono' : `trust:${a.id}`)) return t('sync.running');
    if (a.sync.error && a.sync.error !== 'partial') return `⚠ ${syncError(a.sync.error)}`;
    const note = a.sync.lastSync ? t('sync.autoAt', { time: time(a.sync.lastSync) }) : t('sync.autoNever');
    return a.sync.error === 'partial' ? `${note} · ${syncError('partial')}` : note;
  }
  return a.updatedAt ? t('accounts.updated', { date: prettyDate(a.updatedAt) }) : t('accounts.notEntered');
}

/** Trust Wallet: what makes up the balance, by coin and network. */
function breakdownModal(a) {
  const lines = (a.sync?.breakdown || []).filter((l) => l.amount > 0 || l.usd > 0);
  openModal(
    t('wallet.breakdown', { name: accountName(a) }),
    lines.length
      ? h(
          'div',
          { class: 'list' },
          lines.map((l) =>
            h(
              'div',
              { class: 'list-row compact' },
              h('div', { class: 'grow' }, h('div', { class: 'title' }, `${l.symbol} · ${t(`wallet.net.${l.network}`)}`), h('div', { class: 'meta' }, `${l.address.slice(0, 6)}…${l.address.slice(-4)}`)),
              h('div', { style: { textAlign: 'right' } }, h('div', { class: 'amount' }, `${l.amount.toLocaleString(locale(), { maximumFractionDigits: l.symbol === 'USDT' ? 2 : 6 })} ${l.symbol}`), h('div', { class: 'meta' }, fmt(l.usd, '$'))),
            ),
          ),
        )
      : empty(t('wallet.breakdownEmpty')),
  );
}

/** The editable list of public addresses in the account dialog. */
function addressEditor(list) {
  const box = h('div', { class: 'stack', style: { gap: '8px' } });
  const render = () => {
    const net = h('select', { class: 'input', style: { width: '170px' } }, NETWORKS.map((n) => h('option', { value: n }, t(`wallet.net.${n}`))));
    const input = h('input', { class: 'input', placeholder: t('wallet.addressPh'), style: { flex: 1 } });
    const add = () => {
      const v = input.value.trim();
      if (!v) return;
      if (looksLikeSeed(v)) {
        input.value = '';
        return toast(t('wallet.seedRejected'));
      }
      if (!validAddress(net.value, v)) return toast(t(`wallet.badAddress.${net.value}`));
      if (list.some((x) => x.address === v && x.network === net.value)) return;
      list.push({ network: net.value, address: v });
      render();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && (e.preventDefault(), add()));
    box.replaceChildren(
      h('div', { class: 'seed-warning' }, icon('alert', 18), t('wallet.seedWarning')),
      ...list.map((x, i) =>
        h(
          'div',
          { class: 'list-row compact' },
          h('span', { class: 'badge' }, t(`wallet.net.${x.network}`)),
          h('div', { class: 'grow title', style: { fontFamily: 'var(--mono)', fontSize: '12.5px' } }, x.address),
          h('button', { type: 'button', class: 'btn ghost sm icon-only', title: t('common.delete'), onclick: () => (list.splice(i, 1), render()) }, icon('trash', 14)),
        ),
      ),
      h('div', { class: 'row' }, net, input, h('button', { type: 'button', class: 'btn', onclick: add }, icon('plus', 14), t('common.add'))),
    );
  };
  render();
  return box;
}

/** Which Monobank cards make up this account. */
function monoPicker(selected) {
  const accounts = state.data.mono.accounts.filter((m) => CURRENCY[m.currencyCode]);
  if (!accounts.length) return h('p', { class: 'muted', style: { margin: 0 } }, t('mono.noAccounts'));
  return h(
    'div',
    { class: 'stack', style: { gap: '6px' } },
    accounts.map((m) =>
      h(
        'label',
        { class: 'row', style: { gap: '8px' } },
        h('input', { type: 'checkbox', checked: selected.includes(m.id), onchange: (e) => (e.target.checked ? selected.push(m.id) : selected.splice(selected.indexOf(m.id), 1)) }),
        monoLabel(m),
      ),
    ),
  );
}

export const monoLabel = (m) => `${t(`mono.type.${['black', 'white', 'platinum', 'iron', 'fop', 'yellow', 'eAid'].includes(m.type) ? m.type : 'other'}`)}${m.pan ? ` ·· ${m.pan}` : ''} · ${fmt(m.balance / 100, CURRENCY[m.currencyCode])}`;

/** kind: open the dialog with this source already chosen («Connect Trust Wallet / Monobank» buttons). */
function accountModal(a, kind) {
  const isNew = !a;
  const draft = { name: a ? accountName(a) : '', currency: a?.currency || '€', kind: kind || a?.sync?.kind || 'manual' };
  const addresses = [...(a?.sync?.addresses || [])];
  const monoIds = [...(a?.sync?.monoIds || [])];
  const name = h('input', { class: 'input', value: draft.name, placeholder: t('accounts.namePh'), required: true });
  const currency = h('select', { class: 'input' }, curs().map(([v, l]) => h('option', { value: v, selected: v === draft.currency ? 'selected' : null }, l)));
  const balance = h('input', { class: 'input', type: 'number', step: 'any' });
  const sourceBox = h('div');
  const seg = h('div', { class: 'seg' });
  const renderSource = () => {
    seg.replaceChildren(...['manual', 'trust', 'mono'].map((k) => h('button', { type: 'button', class: draft.kind === k ? 'on' : '', onclick: () => ((draft.kind = k), renderSource()) }, t(`sync.kind.${k}`))));
    sourceBox.replaceChildren(draft.kind === 'trust' ? addressEditor(addresses) : draft.kind === 'mono' ? monoPicker(monoIds) : isNew ? h('label', { class: 'field' }, t('accounts.balanceStart'), balance) : '');
  };
  renderSource();
  const modal = openModal(
    isNew ? t('accounts.new') : accountName(a),
    h(
      'div',
      { class: 'stack', style: { gap: '12px' } },
      h('div', { class: 'grid cols-2', style: { gap: '12px' } }, h('label', { class: 'field' }, t('common.name'), name), h('label', { class: 'field' }, t('common.currency'), currency)),
      h('label', { class: 'field' }, t('sync.source'), seg),
      sourceBox,
    ),
    {
      wide: true,
      onSubmit: () => {
        if (!name.value.trim()) return name.focus(), false;
        if (draft.kind === 'trust' && !addresses.length) return toast(t('wallet.needAddress')), false;
        if (draft.kind === 'mono' && !monoIds.length) return toast(t('mono.needCard')), false;
        const sync = draft.kind === 'manual' ? { kind: 'manual' } : { ...(a?.sync || {}), kind: draft.kind, addresses: draft.kind === 'trust' ? addresses : undefined, monoIds: draft.kind === 'mono' ? monoIds : undefined, error: '' };
        let saved;
        update((d) => {
          if (isNew) {
            saved = { ...setBalance({ id: uid(), name: name.value.trim(), currency: currency.value, history: [] }, Number(balance.value) || 0, today()), sync };
            d.accounts.push(saved);
          } else {
            const x = d.accounts.find((y) => y.id === a.id);
            Object.assign(x, { name: accountNameValue(a, name.value.trim()), currency: currency.value, sync });
            saved = x;
          }
        });
        if (draft.kind !== 'manual') syncAccount(saved);
      },
      danger:
        !isNew &&
        h(
          'button',
          {
            type: 'button',
            class: 'btn ghost',
            onclick: () => {
              update((d) => (d.accounts = d.accounts.filter((x) => x.id !== a.id)));
              modal.close();
            },
          },
          icon('trash', 16),
          t('common.delete'),
        ),
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

const isAuto = (a) => a.sync?.kind === 'trust' || a.sync?.kind === 'mono';
/** The standard crypto and Ukrainian accounts offer to connect their automatic source while they are manual. */
const setupKind = (a) => (isAuto(a) ? null : a.id === 'trust' ? 'trust' : a.id === 'ua' ? 'mono' : null);

export function accountsView() {
  const { accounts, rates, settings } = state.data;
  const main = settings.currency;
  const nw = netWorth(accounts, rates, main);
  const series = historySeries(accounts, rates, main);
  setTimeout(refreshStaleWallets, 0);
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
          { class: 'card stat', style: { textAlign: 'left', cursor: 'pointer' }, title: a.sync?.kind === 'trust' ? t('wallet.breakdownHint') : t('accounts.updateBalance'), onclick: () => (a.sync?.kind === 'trust' ? breakdownModal(a) : balanceModal(a)) },
          h('div', { class: 'stat-label' }, accountName(a)),
          h('div', { class: 'stat-value' }, fmt(a.balance, a.currency)),
          h('div', { class: 'stat-note' }, isAuto(a) ? syncNote(a) : a.currency === main ? (a.updatedAt ? t('accounts.updated', { date: prettyDate(a.updatedAt) }) : t('accounts.clickToEnter')) : `≈ ${money(convert(a.balance, a.currency, main, rates))}`),
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
                    h(
                      'div',
                      { class: 'grow' },
                      h('div', { class: 'title' }, accountName(a), isAuto(a) && h('span', { class: 'badge', style: { marginLeft: '8px' } }, t(`sync.kind.${a.sync.kind}`))),
                      h('div', { class: `meta${a.sync?.error && a.sync.error !== 'partial' ? ' sync-error' : ''}` }, syncNote(a)),
                    ),
                    h(
                      'div',
                      { style: { textAlign: 'right', cursor: a.sync?.kind === 'trust' ? 'pointer' : null }, title: a.sync?.kind === 'trust' ? t('wallet.breakdownHint') : null, onclick: a.sync?.kind === 'trust' ? () => breakdownModal(a) : null },
                      h('div', { class: 'amount' }, fmt(a.balance, a.currency)),
                      a.currency !== main && h('div', { class: 'meta' }, `≈ ${money(convert(a.balance, a.currency, main, rates))}`),
                    ),
                    setupKind(a) && h('button', { class: 'btn sm connect-btn', onclick: () => accountModal(a, setupKind(a)) }, icon('plus', 14), t(`sync.connect.${setupKind(a)}`)),
                    isAuto(a) && h('button', { class: 'btn ghost sm icon-only', title: t('common.update'), disabled: isSyncing(a.sync.kind === 'mono' ? 'mono' : `trust:${a.id}`), onclick: () => syncAccount(a) }, icon('refresh', 15)),
                    h('button', { class: 'btn sm', title: isAuto(a) ? t('sync.manualFix') : null, onclick: () => balanceModal(a) }, t('accounts.balance')),
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
