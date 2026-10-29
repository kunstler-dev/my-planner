// Automatic accounts: wallet parsing, the Monobank queue and checks, MCC categories, rules, statement import,
// inbox and jar-linked goals. No real addresses or bank data: everything here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { categoryForMcc, isTransferMcc } from '../src/renderer/js/mcc.js';
import { matchRule, upsertRule, normalizeKey } from '../src/renderer/js/rules.js';
import { importStatement, statementWindows, nextFrom, jarContribution, MAX_SPAN } from '../src/renderer/js/mono-import.js';
import { pruneInbox, newItems, inboxToEntry, resolve } from '../src/renderer/js/inbox.js';
import { validAddress as validInPage, looksLikeSeed as seedInPage } from '../src/renderer/js/wallet-check.js';

const require = createRequire(import.meta.url);
const wallet = require('../src/main/wallet.js');
const mono = require('../src/main/mono.js');
const { normalize } = require('../src/main/store.js');

const TRON = `T${'X'.repeat(33)}`;
const EVM = `0x${'ab'.repeat(20)}`;

test('wallet addresses and seed phrases', () => {
  for (const check of [wallet.validAddress, validInPage]) {
    assert.ok(check('tron', TRON));
    assert.ok(!check('tron', `T${'0'.repeat(33)}`), 'base58 has no 0');
    assert.ok(!check('tron', TRON.slice(0, -1)));
    assert.ok(check('bsc', EVM) && check('eth', EVM.toUpperCase().replace('0X', '0x')));
    assert.ok(!check('eth', EVM.slice(0, -1)));
    assert.ok(!check('eth', TRON));
  }
  const seed = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
  for (const looks of [wallet.looksLikeSeed, seedInPage]) {
    assert.ok(looks(seed));
    assert.ok(looks(`${seed} ${seed}`));
    assert.ok(!looks(TRON));
    assert.ok(!looks('just a few words'));
  }
});

test('wallet: units, TronGrid answer, ERC-20 call, totals', () => {
  assert.equal(wallet.fromUnits('1500000', 6), 1.5);
  assert.equal(wallet.fromUnits('0x0de0b6b3a7640000', 18), 1);
  assert.equal(wallet.fromUnits('0x', 18), 0);
  assert.equal(wallet.fromUnits('garbage', 6), 0);
  const tron = wallet.parseTron({ data: [{ balance: 2500000, trc20: [{ Tsomething: '1' }, { TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: '12345678' }] }] });
  assert.deepEqual(tron, { native: 2.5, usdt: 12.345678 });
  assert.deepEqual(wallet.parseTron({ data: [] }), { native: 0, usdt: 0 }, 'unactivated address');
  assert.equal(wallet.balanceOfData(EVM), `0x70a08231${'0'.repeat(24)}${'ab'.repeat(20)}`);
  const s = wallet.summarize(
    [
      { network: 'tron', symbol: 'TRX', amount: 10 },
      { network: 'tron', symbol: 'USDT', amount: 5 },
      { network: 'eth', symbol: 'ETH', amount: 0.01 },
    ],
    { TRX: 0.3, ETH: 2000 },
  );
  assert.equal(s.total, 28);
  assert.equal(s.lines[1].usd, 5);
});

test('wallet: fetches every network, falls back to the second RPC, prices from CoinGecko', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push(url);
    const ok = (json) => ({ ok: true, json: async () => json });
    if (url.includes('trongrid')) return ok({ data: [{ balance: 1000000, trc20: [{ TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t: '2000000' }] }] });
    if (url.includes('coingecko')) return ok({ tron: { usd: 0.5 }, ethereum: { usd: 1000 } });
    if (url.includes('ethereum-rpc')) return { ok: false, status: 503, json: async () => ({}) };
    const body = JSON.parse(init.body);
    return ok({ result: body.method === 'eth_getBalance' ? '0x0de0b6b3a7640000' : '0x00000000000000000000000000000000000000000000000000000000000f4240' });
  };
  const res = await wallet.walletBalances(
    [
      { network: 'tron', address: TRON },
      { network: 'eth', address: EVM },
    ],
    fakeFetch,
  );
  assert.equal(res.total, 0.5 + 2 + 1000 + 1);
  assert.ok(calls.some((u) => u.includes('eth.drpc.org')), 'fallback used');
  assert.deepEqual(res.errors, []);
});

test('monobank: arguments are checked, the queue keeps 60 s between requests', async () => {
  assert.ok(mono.validAccountId('kKGVoZuHWzqVoZuH') && mono.validAccountId('0'));
  assert.ok(!mono.validAccountId('../client-info') && !mono.validAccountId(5));
  assert.ok(mono.validRange(1000, 1000 + mono.MAX_SPAN));
  assert.ok(!mono.validRange(1000, 1001 + mono.MAX_SPAN));
  assert.ok(!mono.validRange(2000, 1000));
  let clock = 0;
  const waits = [];
  const queue = mono.createQueue(60000, () => clock, async (ms) => (waits.push(ms), (clock += ms)));
  const order = [];
  await Promise.all([queue.push(async () => order.push(['a', clock])), queue.push(async () => order.push(['b', clock])), queue.push(async () => order.push(['c', clock]))]);
  assert.deepEqual(order, [
    ['a', 0],
    ['b', 60000],
    ['c', 120000],
  ]);
  const client = mono.createMono(() => 'token', async () => ({ status: 429, ok: false }), mono.createQueue(0));
  assert.deepEqual(await client.clientInfo(), { ok: false, error: 'rate' });
  assert.deepEqual(await client.statement('../x', 1, 2), { ok: false, error: 'bad_args' });
  const noToken = mono.createMono(() => null);
  assert.deepEqual(await noToken.clientInfo(), { ok: false, error: 'no_token' });
  let header;
  const good = mono.createMono(() => 'secret', async (url, init) => ((header = init.headers['X-Token']), { status: 200, ok: true, json: async () => [] }), mono.createQueue(0));
  assert.deepEqual(await good.statement('0', 1000, 2000), { ok: true, data: [] });
  assert.equal(header, 'secret');
});

test('MCC codes → categories, transfers recognised', () => {
  assert.equal(categoryForMcc(5411), 'Еда');
  assert.equal(categoryForMcc('5814'), 'Еда');
  assert.equal(categoryForMcc(4121), 'Транспорт');
  assert.equal(categoryForMcc(5968), 'Связь и подписки');
  assert.equal(categoryForMcc(5816), 'Игры');
  assert.equal(categoryForMcc(5661), 'Одежда');
  assert.equal(categoryForMcc(8050), 'Здоровье');
  assert.equal(categoryForMcc(8299), 'Учёба и курсы');
  assert.equal(categoryForMcc(7832), 'Развлечения');
  assert.equal(categoryForMcc(1234), 'Другое');
  assert.ok(isTransferMcc(4829) && !isTransferMcc(5411));
});

test('rules: matching ignores case and spaces, one rule per value', () => {
  const rules = upsertRule([], { id: 'r1', field: 'desc', value: '  Coffee   Shop ', category: 'Еда' });
  assert.equal(rules[0].value, 'coffee shop');
  assert.equal(matchRule(rules, { desc: 'COFFEE shop' }).id, 'r1');
  assert.equal(matchRule(rules, { desc: 'Coffee' }), null);
  const replaced = upsertRule(rules, { id: 'r2', field: 'desc', value: 'coffee shop', category: 'Развлечения' });
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0].category, 'Развлечения');
  assert.equal(matchRule([{ field: 'domain', value: 'stripe.com', category: 'x' }], { domain: 'Stripe.com' }).category, 'x');
  assert.equal(normalizeKey(null), '');
});

const ctx = (extra = {}) => {
  let n = 0;
  return { accountId: 'ua', currency: '₴', main: '€', rates: { '€': 1, '₴': 50, $: 1.25 }, rules: [], finance: [], inbox: [], makeId: () => `id${n++}`, today: '2026-10-29', ...extra };
};
const op = (id, amount, mcc, extra = {}) => ({ id, time: 1761730000 + Number(id.replace(/\D/g, '') || 0), description: `Shop ${id}`, mcc, amount, hold: false, ...extra });

test('statement import: MCC categories, conversion, transfers and incomes to the inbox', () => {
  const out = importStatement([op('a1', -12500, 5411), op('a2', -5000, 4829), op('a3', 100000, 4829), op('a4', 250000, 1234)], ctx());
  assert.equal(out.add.length, 1);
  assert.deepEqual(
    { type: out.add[0].type, amount: out.add[0].amount, category: out.add[0].category, extId: out.add[0].extId, origAmount: out.add[0].origAmount, origCurrency: out.add[0].origCurrency, source: out.add[0].source },
    { type: 'expense', amount: 2.5, category: 'Еда', extId: 'a1', origAmount: 125, origCurrency: '₴', source: 'mono' },
  );
  assert.deepEqual(
    out.inbox.map((x) => [x.ref, x.kind, x.amount]),
    [
      ['a2', 'transfer', 1],
      ['a3', 'transfer', 20],
      ['a4', 'income', 50],
    ],
  );
  assert.equal(out.last, Math.max(...[1, 2, 3, 4].map((i) => 1761730000 + i)));
});

test('statement import: rules beat MCC, «skip» is remembered, repeats and holds', () => {
  const rules = [
    { field: 'desc', value: 'shop a1', category: 'Развлечения' },
    { field: 'desc', value: 'shop a2', category: 'Зарплата', kind: 'income' },
    { field: 'desc', value: 'shop a3', kind: 'skip' },
  ];
  const out = importStatement([op('a1', -1000, 5411), op('a2', 100000, 4829), op('a3', -500, 5411)], ctx({ rules }));
  assert.deepEqual(
    out.add.map((e) => [e.extId, e.type, e.category]),
    [
      ['a1', 'expense', 'Развлечения'],
      ['a2', 'income', 'Зарплата'],
    ],
  );
  assert.deepEqual(
    out.inbox.map((x) => [x.ref, x.status]),
    [['a3', 'dismissed']],
  );
  // The same statement again: nothing new.
  const again = importStatement([op('a1', -1000, 5411), op('a3', -500, 5411)], ctx({ rules, finance: out.add, inbox: out.inbox }));
  assert.deepEqual([again.add.length, again.inbox.length, again.update.length], [0, 0, 0]);
  // An operation on hold becomes final with another amount.
  const held = importStatement([op('h1', -2000, 5411, { hold: true })], ctx());
  assert.equal(held.add[0].hold, true);
  const final = importStatement([op('h1', -2500, 5411, { hold: false })], ctx({ finance: held.add }));
  assert.deepEqual(final.update, [{ id: held.add[0].id, patch: { amount: 0.5, origAmount: 25, date: held.add[0].date, hold: false } }]);
});

test('statement windows and where the next sync starts', () => {
  assert.deepEqual(statementWindows(0, 100, 40), [
    [0, 40],
    [40, 80],
    [80, 100],
  ]);
  assert.equal(statementWindows(0, MAX_SPAN).length, 1);
  assert.deepEqual(statementWindows(10, 10), []);
  assert.equal(nextFrom(1000, 5000000), 1001);
  assert.equal(nextFrom(0, 5000000), 5000000 - 31 * 86400);
});

test('inbox: accept keeps the bank fields, resolved items stay 60 days', () => {
  const item = { id: 'i1', source: 'mono', kind: 'transfer', title: 'To jar', amount: 20, date: '2026-10-28', category: 'Другое', ref: 'a3', status: 'new', createdAt: '2026-10-28', accountId: 'ua', origAmount: 1000, origCurrency: '₴', desc: 'To jar' };
  const e = inboxToEntry(item, 'expense', () => 'e1');
  assert.deepEqual(e, { id: 'e1', type: 'expense', amount: 20, category: 'Другое', date: '2026-10-28', note: 'To jar', source: 'mono', accountId: 'ua', origAmount: 1000, origCurrency: '₴', desc: 'To jar', extId: 'a3' });
  const items = resolve([item, { ...item, id: 'i2' }], 'i1', 'accepted', '2026-10-29');
  assert.equal(newItems(items).length, 1);
  assert.equal(items[0].resolvedAt, '2026-10-29');
  const old = [
    { id: 'o1', status: 'accepted', resolvedAt: '2026-08-01' },
    { id: 'o2', status: 'dismissed', resolvedAt: '2026-10-01' },
    { id: 'o3', status: 'new', createdAt: '2026-01-01' },
  ];
  assert.deepEqual(
    pruneInbox(old, '2026-10-29').map((x) => x.id),
    ['o2', 'o3'],
  );
});

test('jar-linked goal follows the jar balance', () => {
  assert.deepEqual(jarContribution({ contributions: [{ amount: 100 }] }, 150, '2026-10-29'), { amount: 50, date: '2026-10-29', auto: true });
  assert.deepEqual(jarContribution({ contributions: [{ amount: 100 }] }, 80, '2026-10-29'), { amount: -20, date: '2026-10-29', auto: true });
  assert.equal(jarContribution({ contributions: [{ amount: 100 }] }, 100.004, '2026-10-29'), null);
});

test('data: rules, inbox and the Monobank cache get defaults and are kept', () => {
  const d = normalize({});
  assert.deepEqual([d.rules, d.inbox], [[], []]);
  assert.deepEqual(d.mono, { accounts: [], jars: [], fetchedAt: 0, last: {}, error: '' });
  const kept = normalize({ rules: [{ id: 'r' }], inbox: 'x', mono: { accounts: [{ id: 'a' }], last: { a: 5 }, jars: null } });
  assert.deepEqual(kept.rules, [{ id: 'r' }]);
  assert.deepEqual(kept.inbox, []);
  assert.deepEqual(kept.mono.accounts, [{ id: 'a' }]);
  assert.deepEqual(kept.mono.jars, []);
  assert.deepEqual(kept.mono.last, { a: 5 });
});
