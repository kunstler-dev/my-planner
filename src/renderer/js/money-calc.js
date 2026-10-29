// Money extras (pure, unit-tested): contract cancellation deadlines (Kündigungsfrist), the cash runway in months,
// «safe to spend today» and whether a discounted wishlist game fits the «Games» budget.
import { convert, netWorth, goalPlan, nextOccurrence } from './planner-calc.js';
import { CAT } from './finance-calc.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s, n) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate(); // m: 0-based
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const round2 = (v) => Math.round(v * 100) / 100;

/** Same day n months later; when that day doesn't exist (31st, 29 Feb) — the last day of the month. */
export function addMonths(s, n) {
  const d = parse(s);
  const y = d.getFullYear();
  const m = d.getMonth() + n;
  const target = new Date(y, m, 1);
  return iso(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay(target.getFullYear(), target.getMonth()))));
}

/**
 * Last day of a period of `months` starting on `start` (as in § 188 BGB): the day before the same date `months`
 * later; if that date doesn't exist, the last day of that month. 15.01 + 24 → 14.01; 29.02.2024 + 12 → 28.02.2025.
 */
export function periodEnd(start, months) {
  const d = parse(start);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const len = lastDay(target.getFullYear(), target.getMonth());
  if (d.getDate() > len) return iso(new Date(target.getFullYear(), target.getMonth(), len));
  return addDays(iso(new Date(target.getFullYear(), target.getMonth(), d.getDate())), -1);
}

const toMonthEnd = (s) => {
  const d = parse(s);
  return iso(new Date(d.getFullYear(), d.getMonth(), lastDay(d.getFullYear(), d.getMonth())));
};

/** Latest day the notice may be given for a term ending on `termEnd`. notice: { n, unit: 'days' | 'weeks' | 'months' }. */
export function noticeDeadline(termEnd, notice) {
  const n = Math.max(0, Math.round(Number(notice?.n) || 0));
  if (notice?.unit === 'months') return addMonths(termEnd, -n);
  return addDays(termEnd, -(notice?.unit === 'weeks' ? 7 * n : n));
}

/**
 * contract: { start, minMonths, notice: { n, unit }, renewMonths = 1, endOfMonth }.
 * Returns { termEnd, deadline, daysLeft } for the current term — the first term whose deadline is today or later —
 * or null without a start date.
 */
export function cancelDeadline(contract, today) {
  if (!contract?.start || !/^\d{4}-\d{2}-\d{2}$/.test(contract.start)) return null;
  const snap = (s) => (contract.endOfMonth ? toMonthEnd(s) : s);
  const renew = Math.max(1, Math.round(Number(contract.renewMonths) || 1));
  let termEnd = snap(periodEnd(contract.start, Math.max(0, Math.round(Number(contract.minMonths) || 0)) || renew));
  for (let guard = 0; noticeDeadline(termEnd, contract.notice) < today && guard < 600; guard++) termEnd = snap(periodEnd(addDays(termEnd, 1), renew));
  const deadline = noticeDeadline(termEnd, contract.notice);
  return { termEnd, deadline, daysLeft: daysBetween(today, deadline) };
}

/**
 * Months the money lasts: everything on the accounts ÷ average expenses of the last 3 full months
 * (months without any expenses don't count). null when there is no expense history.
 */
export function runway(total, finance, today) {
  const month = today.slice(0, 7);
  const sums = [];
  for (let i = 1; i <= 3; i++) {
    const key = addMonths(`${month}-01`, -i).slice(0, 7);
    const spent = finance.filter((e) => e.type === 'expense' && e.date?.startsWith(key)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    if (spent > 0) sums.push(spent);
  }
  if (!sums.length) return null;
  const avg = sums.reduce((a, b) => a + b, 0) / sums.length;
  return { months: Math.round((total / avg) * 10) / 10, avg: round2(avg), basedOn: sums.length };
}

/** The nearest regular income from today on, else the last day of the month. */
export function nextIncomeDate(recurring, today) {
  const dates = (recurring || []).filter((r) => r.active && r.type === 'income' && r.next).map((r) => (r.next >= today ? r.next : nextOccurrence(r.next, r.day)));
  return dates.sort()[0] || toMonthEnd(today);
}

/**
 * «Safe to spend today»: (all money − regular expenses and unpaid bills before the next income − what goals still
 * need this month) ÷ days until the next income (at least 1). Never below 0. Returns the parts for the tooltip.
 */
export function safeToSpend(data, today) {
  const main = data.settings.currency;
  const total = netWorth(data.accounts, data.rates, main).total;
  const until = nextIncomeDate(data.recurring, today);
  const days = Math.max(1, daysBetween(today, until));
  let recurring = 0;
  for (const r of data.recurring || []) {
    if (!r.active || r.type !== 'expense' || !r.next) continue;
    for (let d = r.next, guard = 0; d < until && guard < 24; d = nextOccurrence(d, r.day), guard++) if (d >= today) recurring += Number(r.amount) || 0;
  }
  const bills = (data.bills || []).filter((b) => !b.paid && b.dueDate >= today && b.dueDate < until).reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const month = today.slice(0, 7);
  const goals = (data.goals || []).reduce((s, g) => {
    const plan = goalPlan(g, today);
    if (plan.done || plan.perMonth == null) return s;
    const thisMonth = (g.contributions || []).filter((c) => c.date?.startsWith(month)).reduce((a, c) => a + (Number(c.amount) || 0), 0);
    return s + Math.max(0, plan.perMonth - thisMonth);
  }, 0);
  const left = total - recurring - bills - goals;
  return { perDay: round2(Math.max(0, left / days)), total: round2(total), recurring: round2(recurring), bills: round2(bills), goals: round2(goals), days, until };
}

/**
 * A wishlist game at its target price against what's left of this month's «Games» budget (in the main currency).
 * Returns { fits, after, short, left, price } or null when there is no «Games» budget.
 */
export function gameBudgetFit(data, item, today) {
  const limit = Number(data.budgets?.[CAT.games]) || 0;
  if (!limit || item.price == null) return null;
  const main = data.settings.currency;
  const month = today.slice(0, 7);
  const spent = (data.finance || []).filter((e) => e.type === 'expense' && e.category === CAT.games && e.date?.startsWith(month)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const left = round2(limit - spent);
  const price = round2(convert(item.price, item.currency || '₴', main, data.rates));
  return { fits: price <= left, after: round2(left - price), short: round2(price - left), left, price };
}

export const atTarget = (i) => i.price != null && i.target > 0 && i.price <= i.target;
