// «Inbox»: operations and messages waiting for a decision. Item: { id, source: 'mono' | 'mail' | 'jobs',
// kind: 'expense' | 'income' | 'transfer' | 'career' | 'alert', title, amount, currency, date, category, ref,
// status: 'new' | 'accepted' | 'dismissed', createdAt, resolvedAt? }. Accepted and dismissed items stay for 60 days
// so the same operation isn't imported twice. Pure functions, unit-tested.
import { addDaysIso } from './planner-calc.js';

export const KEEP_DAYS = 60;

export const newItems = (items) => (items || []).filter((x) => x.status === 'new');

/** Drops resolved items older than 60 days; new ones always stay. */
export function pruneInbox(items, todayStr, days = KEEP_DAYS) {
  const from = addDaysIso(todayStr, -days);
  return (items || []).filter((x) => x.status === 'new' || (x.resolvedAt || x.createdAt || todayStr) >= from);
}

/** Inbox item (with the user's edits and chosen type) → finance entry; operation fields from the bank are kept. */
export function inboxToEntry(item, type, makeId) {
  const entry = {
    id: makeId(),
    type,
    amount: Math.abs(Number(item.amount) || 0),
    category: item.category,
    date: item.date,
    note: item.note ?? item.title ?? '',
  };
  for (const k of ['source', 'accountId', 'origAmount', 'origCurrency', 'desc', 'hold']) if (item[k] !== undefined) entry[k] = item[k];
  if (item.ref) entry.extId = item.ref;
  return entry;
}

export function resolve(items, id, status, todayStr) {
  return items.map((x) => (x.id === id ? { ...x, status, resolvedAt: todayStr } : x));
}
