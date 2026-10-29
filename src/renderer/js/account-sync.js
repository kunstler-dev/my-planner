// Automatic accounts: Trust Wallet balances and Monobank (balances, statements, jars → goals), every 30 minutes
// through the shared scheduler and on the «Update» buttons. Network errors only mark the account as not updated.
import { state, update } from './state.js';
import { t } from './i18n.js';
import { toast, uid } from './ui.js';
import { today } from './dates.js';
import { setBalance, convert } from './planner-calc.js';
import { register } from './scheduler.js';
import { MINUTE } from './notify-calc.js';
import { CURRENCY, importStatement, statementWindows, nextFrom, jarContribution } from './mono-import.js';
import { pruneInbox } from './inbox.js';
import { scheduleMail } from './mail-sync.js';
import { checkJobs } from './jobs-sync.js';
import { isNewer } from './update-calc.js';
import { syncDota, importWishlist } from './games-sync.js';
import { refreshPrices } from './views/games.js';

const running = new Set();
export const isSyncing = (key) => running.has(key);
const round2 = (v) => Math.round(v * 100) / 100;

async function guard(key, fn) {
  if (running.has(key)) return;
  running.add(key);
  update(() => {});
  try {
    await fn();
  } finally {
    running.delete(key);
    update(() => {});
  }
}

function patchAccount(id, fn) {
  update((d) => {
    const i = d.accounts.findIndex((a) => a.id === id);
    if (i >= 0) d.accounts[i] = fn(d.accounts[i]);
  });
}

// ---- Trust Wallet ----

export function syncTrust(accountId, { silent = true } = {}) {
  return guard(`trust:${accountId}`, async () => {
    const acc = state.data.accounts.find((a) => a.id === accountId);
    if (!acc?.sync?.addresses?.length) return;
    const res = await window.api.wallet.balances(acc.sync.addresses);
    if (!res.ok) {
      patchAccount(accountId, (a) => ({ ...a, sync: { ...a.sync, error: res.error || 'network' } }));
      if (!silent) toast(t('sync.failed', { name: acc.name || acc.id }));
      return;
    }
    // The wallet is counted in $; an account in another currency gets the converted total.
    const total = round2(convert(res.total, '$', acc.currency, state.data.rates));
    patchAccount(accountId, (a) => ({ ...setBalance(a, total, today()), sync: { ...a.sync, lastSync: Date.now(), error: res.errors?.length ? 'partial' : '', breakdown: res.lines } }));
    if (!silent) toast(t('sync.updated'));
  });
}

const trustAccounts = () => state.data.accounts.filter((a) => a.sync?.kind === 'trust' && a.sync.addresses?.length);

// ---- Monobank ----

const monoAccounts = () => state.data.accounts.filter((a) => a.sync?.kind === 'mono' && a.sync.monoIds?.length);

/** Balances of the linked planner accounts and jar-linked goals from a fresh client-info. */
function applyClientInfo(d, info) {
  const now = Date.now();
  d.mono = { ...d.mono, accounts: info.accounts, jars: info.jars, fetchedAt: now, error: '' };
  const main = d.settings.currency;
  for (let i = 0; i < d.accounts.length; i++) {
    const a = d.accounts[i];
    if (a.sync?.kind !== 'mono') continue;
    const linked = info.accounts.filter((m) => a.sync.monoIds?.includes(m.id) && CURRENCY[m.currencyCode]);
    if (!linked.length) continue;
    const balance = round2(linked.reduce((s, m) => s + convert(m.balance / 100, CURRENCY[m.currencyCode], a.currency, d.rates), 0));
    d.accounts[i] = { ...setBalance(a, balance, today()), sync: { ...a.sync, lastSync: now, error: '' } };
  }
  for (const g of d.goals) {
    const jar = g.jarId && info.jars.find((j) => j.id === g.jarId);
    if (!jar || !CURRENCY[jar.currencyCode]) continue;
    const cur = CURRENCY[jar.currencyCode];
    const c = jarContribution(g, convert(jar.balance / 100, cur, main, d.rates), today());
    g.contributions = [...(g.contributions || []), ...(c ? [c] : [])];
    if (jar.goal > 0) g.target = round2(convert(jar.goal / 100, cur, main, d.rates));
    g.jarSync = now;
  }
}

/** Oldest operation still on hold for this account (seconds), so its final version is fetched again. */
function holdFrom(accountId, nowSec) {
  const dates = state.data.finance.filter((e) => e.source === 'mono' && e.hold && e.accountId === accountId).map((e) => e.date);
  if (!dates.length) return null;
  const [y, m, d] = dates.sort()[0].split('-').map(Number);
  return Math.max(nowSec - 31 * 86400, Math.floor(new Date(y, m - 1, d).getTime() / 1000));
}

/** All operations of one window, also when the bank returns its maximum of 500 at once. */
async function fetchWindow(id, from, to) {
  const all = [];
  let end = to;
  for (let page = 0; page < 10; page++) {
    const res = await window.api.mono.statement(id, from, end);
    if (!res.ok) return { ok: false, error: res.error, items: all };
    const items = Array.isArray(res.data) ? res.data : [];
    all.push(...items);
    if (items.length < 500) break;
    end = Math.min(...items.map((x) => x.time)) - 1;
    if (end <= from) break;
  }
  return { ok: true, items: all };
}

async function syncStatements() {
  const nowSec = Math.floor(Date.now() / 1000);
  for (const acc of monoAccounts()) {
    for (const id of acc.sync.monoIds) {
      const mono = state.data.mono.accounts.find((m) => m.id === id);
      const currency = mono && CURRENCY[mono.currencyCode];
      if (!currency) continue;
      const hold = holdFrom(acc.id, nowSec);
      const from = Math.min(nextFrom(state.data.mono.last[id], nowSec), hold ?? Infinity);
      for (const [a, b] of statementWindows(from, nowSec)) {
        const res = await fetchWindow(id, a, b);
        if (!res.ok) {
          update((d) => (d.mono.error = res.error));
          return;
        }
        const out = importStatement(res.items, { accountId: acc.id, currency, main: state.data.settings.currency, rates: state.data.rates, rules: state.data.rules, finance: state.data.finance, inbox: state.data.inbox, makeId: uid, today: today() });
        update((d) => {
          d.finance.push(...out.add);
          for (const u of out.update) Object.assign(d.finance.find((e) => e.id === u.id) || {}, u.patch);
          d.inbox.push(...out.inbox);
          d.mono.last[id] = Math.max(d.mono.last[id] || 0, out.last, b - 1);
        });
      }
    }
  }
}

export function syncMono({ silent = true } = {}) {
  return guard('mono', async () => {
    if (!(await window.api.secrets.has('mono'))) return;
    const info = await window.api.mono.clientInfo();
    if (!info.ok) {
      update((d) => {
        d.mono.error = info.error;
        for (const a of d.accounts) if (a.sync?.kind === 'mono') a.sync = { ...a.sync, error: info.error };
      });
      if (!silent) toast(monoErrorText(info.error));
      return;
    }
    update((d) => applyClientInfo(d, info));
    await syncStatements();
    if (!silent) toast(t('sync.updated'));
  });
}

/** «Check» in settings: reads cards and jars (one request), without statements. Returns the API answer. */
export async function checkMono() {
  const info = await window.api.mono.clientInfo();
  if (info.ok) update((d) => applyClientInfo(d, info));
  else update((d) => (d.mono.error = info.error));
  return info;
}

export const monoErrorText = (code) => t(`mono.error.${['no_token', 'bad_token', 'rate', 'network'].includes(code) ? code : 'http'}`);

/** Opening Accounts refreshes wallets whose balance is older than 2 minutes. */
let lastLook = 0;
// Set once background updates start for real (never in demo runs).
let live = false;
export function refreshStaleWallets() {
  if (!live || Date.now() - lastLook < 60000) return;
  lastLook = Date.now();
  for (const a of trustAccounts()) if (!a.sync.lastSync || Date.now() - a.sync.lastSync > 2 * MINUTE) syncTrust(a.id);
}

export async function checkUpdates() {
  const [info, res] = [await window.api.info(), await window.api.latestRelease()];
  if (!res.ok) return;
  const newer = !res.none && isNewer(res.tag, info.version);
  update((d) => (d.update = newer ? { version: res.tag.replace(/^v/i, ''), url: res.url, checkedAt: Date.now() } : null), { silent: true });
}

/** Refresh one account by its «Update» button. */
export function syncAccount(a) {
  if (a.sync?.kind === 'trust') return syncTrust(a.id, { silent: false });
  if (a.sync?.kind === 'mono') return syncMono({ silent: false });
}

export async function startAccountSync() {
  // Demo runs (screenshots) never touch real wallets or the bank.
  if ((await window.api.info()).demo) return;
  live = true;
  // Near real time: public wallet APIs every 5 minutes; Monobank allows one request a minute, so every 10.
  register('wallet', 5 * MINUTE, async () => {
    for (const a of trustAccounts()) await syncTrust(a.id);
  });
  register('mono', 10 * MINUTE, () => syncMono());
  // Wishlist prices once a day even when the Games screen isn't opened (target price notifications).
  register('steam-prices', 24 * 60 * MINUTE, () => refreshPrices({ silent: true }));
  scheduleMail();
  register('jobs', 24 * 60 * MINUTE, () => checkJobs());
  // OpenDota every 2 hours (free tier: 60 requests a minute, four per update); the Steam wishlist daily if on.
  register('dota', 120 * MINUTE, () => syncDota());
  register('steam-wishlist', 24 * 60 * MINUTE, () => (state.data.settings.steamWishlistSync ? importWishlist() : null));
  // Once a day: is there a newer release on GitHub? (The portable build only reports it.)
  register('updates', 24 * 60 * MINUTE, checkUpdates);
  register('inbox-prune', 24 * 60 * MINUTE, () => update((d) => (d.inbox = pruneInbox(d.inbox, today())), { silent: true }));
}
