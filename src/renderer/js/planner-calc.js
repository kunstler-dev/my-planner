// Pure calculations for accounts, recurring payments, budgets, goals, habits, career, ads, projects and
// game-time rewards (unit-tested). Dates are local 'YYYY-MM-DD' strings.

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');
const parse = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysIn = (y, m) => new Date(y, m + 1, 0).getDate(); // m: 0-based

export function addDaysIso(s, n) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

// ---- accounts & rates ----

/** rates: units of each currency per 1 € ({ '€': 1, '₴': 48, $: 1.08 }). */
export function convert(amount, from, to, rates) {
  const a = Number(amount) || 0;
  if (from === to) return a;
  const rf = rates[from] || 1;
  const rt = rates[to] || 1;
  return (a / rf) * rt;
}

export function netWorth(accounts, rates, main) {
  const parts = accounts.map((a) => ({ id: a.id, name: a.name, value: convert(a.balance, a.currency, main, rates) }));
  const total = parts.reduce((s, p) => s + p.value, 0);
  return { total, parts: parts.map((p) => ({ ...p, share: total > 0 ? Math.max(0, p.value) / total : 0 })) };
}

/** NBU answer [{ cc: 'EUR', rate }, { cc: 'USD', rate }] (UAH per unit) → rates per 1 €. */
export function ratesFromNbu(list) {
  const eur = list.find((x) => x.cc === 'EUR')?.rate;
  const usd = list.find((x) => x.cc === 'USD')?.rate;
  if (!eur || !usd) return null;
  return { '€': 1, '₴': Math.round(eur * 100) / 100, $: Math.round((eur / usd) * 10000) / 10000 };
}

/** One balance per day in the history (the latest one wins). */
export function setBalance(account, balance, date) {
  const history = (account.history || []).filter((h) => h.date !== date);
  history.push({ date, balance });
  history.sort((a, b) => a.date.localeCompare(b.date));
  return { ...account, balance, updatedAt: date, history: history.slice(-365) };
}

// ---- recurring payments ----

/** Date of `day` in the month of `monthDate` (clamped to the month length). */
function dayInMonth(monthDate, day) {
  return new Date(monthDate.getFullYear(), monthDate.getMonth(), Math.min(day, daysIn(monthDate.getFullYear(), monthDate.getMonth())));
}

/** First payment date for a new recurring item: this month if the day hasn't passed, else next month. */
export function firstOccurrence(day, todayStr) {
  const t = parse(todayStr);
  const thisMonth = dayInMonth(t, day);
  if (iso(thisMonth) >= todayStr) return iso(thisMonth);
  return iso(dayInMonth(new Date(t.getFullYear(), t.getMonth() + 1, 1), day));
}

export function nextOccurrence(dateStr, day) {
  const d = parse(dateStr);
  return iso(dayInMonth(new Date(d.getFullYear(), d.getMonth() + 1, 1), day));
}

/**
 * Creates finance entries for every due payment (next <= today) and moves `next` forward.
 * Returns { entries, recurring } without mutating the input.
 */
export function applyRecurring(recurring, todayStr, makeId) {
  const entries = [];
  const out = recurring.map((r) => {
    if (!r.active || !r.next) return r;
    let next = r.next;
    let guard = 0;
    while (next <= todayStr && guard++ < 60) {
      entries.push({ id: makeId(), type: r.type, amount: r.amount, category: r.category, date: next, note: r.title, recurringId: r.id });
      next = nextOccurrence(next, r.day);
    }
    return next === r.next ? r : { ...r, next };
  });
  return { entries, recurring: out };
}

/** Active payments due within `days` days from today, soonest first. */
export function upcoming(recurring, todayStr, days) {
  const until = addDaysIso(todayStr, days);
  return recurring.filter((r) => r.active && r.next && r.next <= until).sort((a, b) => a.next.localeCompare(b.next));
}

/** Monthly sum of active recurring items by type. */
export function recurringMonthly(recurring) {
  return recurring
    .filter((r) => r.active)
    .reduce((s, r) => ((s[r.type] += Number(r.amount) || 0), s), { income: 0, expense: 0 });
}

// ---- budgets & goals ----

/** budgets: { category: limit }; monthEntries: this month's entries. */
export function budgetStatus(monthEntries, budgets) {
  return Object.entries(budgets)
    .filter(([, limit]) => Number(limit) > 0)
    .map(([category, limit]) => {
      const spent = monthEntries.filter((e) => e.type === 'expense' && e.category === category).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      return { category, limit: Number(limit), spent, share: spent / Number(limit), over: spent > Number(limit) };
    })
    .sort((a, b) => b.share - a.share);
}

/** How much to save per month to reach the goal by its deadline. */
export function goalPlan(goal, todayStr) {
  const saved = (goal.contributions || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const left = Math.max(0, goal.target - saved);
  let months = null;
  if (goal.deadline && goal.deadline > todayStr) {
    months = Math.max(1, Math.ceil((parse(goal.deadline) - parse(todayStr)) / (30.44 * DAY)));
  }
  return { saved, left, share: goal.target ? Math.min(1, saved / goal.target) : 0, months, perMonth: months ? left / months : null, done: left === 0 };
}

// ---- habits ----

/** Consecutive days ending today (or yesterday, if today isn't checked yet). */
export function habitStreak(days, todayStr) {
  const set = new Set(days);
  let d = set.has(todayStr) ? todayStr : addDaysIso(todayStr, -1);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = addDaysIso(d, -1);
  }
  return n;
}

/** Monday of the week that contains `dateStr`. */
export function weekStart(dateStr) {
  const d = parse(dateStr);
  return addDaysIso(dateStr, -((d.getDay() + 6) % 7));
}

// ---- career ----

export const APP_STATUSES = [
  ['wish', 'Хочу отправить'],
  ['sent', 'Отправлено'],
  ['interview', 'Собеседование'],
  ['offer', 'Оффер'],
  ['rejected', 'Отказ'],
];

export function careerStats(apps, todayStr) {
  const ws = weekStart(todayStr);
  const sent = apps.filter((a) => a.status !== 'wish' && a.sentAt);
  const responded = sent.filter((a) => a.status === 'interview' || a.status === 'offer');
  return {
    sent: sent.length,
    week: sent.filter((a) => a.sentAt >= ws).length,
    interviews: apps.filter((a) => a.status === 'interview').length,
    offers: apps.filter((a) => a.status === 'offer').length,
    responseRate: sent.length ? responded.length / sent.length : 0,
    followUps: apps.filter((a) => a.followUp && a.followUp <= todayStr && (a.status === 'sent' || a.status === 'interview')),
  };
}

// ---- ads in channels ----

export function adStats(ads) {
  const buys = ads.filter((a) => a.kind === 'buy');
  const sells = ads.filter((a) => a.kind === 'sell');
  const spent = buys.reduce((s, a) => s + (Number(a.price) || 0), 0);
  const gained = buys.reduce((s, a) => s + (Number(a.gained) || 0), 0);
  return {
    spent,
    gained,
    costPerSub: gained ? spent / gained : null,
    income: sells.reduce((s, a) => s + (Number(a.price) || 0), 0),
    buys: buys.length,
    sells: sells.length,
  };
}

// ---- projects ----

export function projectStats(project, finance) {
  const linked = finance.filter((e) => e.projectId === project.id);
  const income = linked.filter((e) => e.type === 'income').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const expense = linked.filter((e) => e.type === 'expense').reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const hours = (project.hours || []).reduce((s, h) => s + (Number(h.hours) || 0), 0);
  const ms = project.milestones || [];
  return {
    income,
    expense,
    profit: income - expense,
    hours,
    perHour: hours ? (income - expense) / hours : null,
    milestonesDone: ms.filter((m) => m.done).length,
    milestones: ms.length,
  };
}

// ---- game time earned by being productive ----

/**
 * Minutes of game time earned this week: done tasks, sent applications, habit check-ins and finished
 * project milestones, minus the minutes already played this week.
 */
export function playBalance(data, todayStr) {
  const ws = weekStart(todayStr);
  const r = data.play.rewards;
  const inWeek = (d) => d && d >= ws && d <= todayStr;
  const parts = {
    tasks: data.tasks.filter((t) => t.done && inWeek(t.doneAt)).length * r.task,
    applications: data.career.applications.filter((a) => inWeek(a.sentAt)).length * r.application,
    habits: data.habits.reduce((s, h) => s + (h.days || []).filter(inWeek).length, 0) * r.habit,
    milestones: data.projects.reduce((s, p) => s + (p.milestones || []).filter((m) => m.done && inWeek(m.doneAt)).length, 0) * r.milestone,
  };
  const earned = parts.tasks + parts.applications + parts.habits + parts.milestones;
  const played = data.play.sessions.filter((s) => inWeek(s.date)).reduce((s, x) => s + (Number(x.minutes) || 0), 0);
  return { earned, played, balance: earned - played, parts, weekStart: ws };
}

export function minutesText(min) {
  const sign = min < 0 ? '−' : '';
  const m = Math.abs(Math.round(min));
  const h = Math.floor(m / 60);
  return `${sign}${h ? `${h} ч ` : ''}${m % 60} мин`;
}

export { DAY };
