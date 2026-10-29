// Productivity (pure, unit-tested): the project timer, habits that check themselves and the weekly review.
import { addDaysIso, weekStart, budgetStatus } from './planner-calc.js';
import { totals, byCategory, inMonth } from './finance-calc.js';

const HOUR = 3600000;

// ---- timer ----

/** Hours for a timer run, rounded to 0.05 (3 minutes), at least 0.05. */
export const timerHours = (startedAt, now) => Math.max(0.05, Math.round(((now - startedAt) / HOUR) * 20) / 20);

/** «1:05» from milliseconds. */
export function elapsedText(ms) {
  const min = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

// ---- habits that check themselves ----

/**
 * Habit rules (habit.auto): { kind: 'apply' } an application got its sent date that day; { kind: 'spend' } at
 * least one operation that day; { kind: 'noSpend', category } no expense in the category that day (checked for
 * yesterday); { kind: 'tasks', n } n tasks done that day; { kind: 'project', minutes, projectId? } time on a
 * project (or any) from recorded hours and the running timer.
 */
export function habitRuleMet(rule, data, date, now = Date.now()) {
  if (!rule?.kind) return false;
  if (rule.kind === 'apply') return (data.career?.applications || []).some((a) => a.sentAt === date);
  if (rule.kind === 'spend') return (data.finance || []).some((e) => e.date === date);
  if (rule.kind === 'noSpend') return !(data.finance || []).some((e) => e.type === 'expense' && e.date === date && e.category === rule.category);
  if (rule.kind === 'tasks') return (data.tasks || []).filter((x) => x.done && x.doneAt === date).length >= Math.max(1, Number(rule.n) || 1);
  if (rule.kind === 'project') {
    const projects = (data.projects || []).filter((p) => !rule.projectId || p.id === rule.projectId);
    let minutes = projects.reduce((s, p) => s + (p.hours || []).filter((x) => x.date === date).reduce((a, x) => a + (Number(x.hours) || 0) * 60, 0), 0);
    const tm = data.timer;
    if (tm && (!rule.projectId || tm.projectId === rule.projectId)) {
      const started = new Date(tm.startedAt);
      const startDay = `${started.getFullYear()}-${String(started.getMonth() + 1).padStart(2, '0')}-${String(started.getDate()).padStart(2, '0')}`;
      if (startDay === date) minutes += (now - tm.startedAt) / 60000;
    }
    return minutes >= Math.max(1, Number(rule.minutes) || 1);
  }
  return false;
}

/**
 * Days to check now: [{ habitId, date }]. «No spending» looks at yesterday (the day is over), the others at today.
 * A day the user unchecked by hand (habit.autoOff) is never checked again by the rule.
 */
export function autoHabitMarks(data, today, now = Date.now()) {
  const out = [];
  for (const hb of data.habits || []) {
    if (!hb.auto?.kind) continue;
    const date = hb.auto.kind === 'noSpend' ? addDaysIso(today, -1) : today;
    if ((hb.days || []).includes(date) || (hb.autoOff || []).includes(date)) continue;
    if (hb.auto.kind === 'noSpend' && hb.createdAt && date < hb.createdAt) continue;
    if (habitRuleMet(hb.auto, data, date, now)) out.push({ habitId: hb.id, date });
  }
  return out;
}

// ---- weekly review ----

const inRange = (d, from, to) => !!d && d >= from && d <= to;

/** Value of a rank track at the end of a day (last entry on or before it). */
const valueAt = (entries, date) => [...(entries || [])].filter((e) => e.date <= date).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.value ?? null;
const subscribersAt = (snapshots, date) => [...(snapshots || [])].filter((s) => s.date <= date).sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.subscribers ?? null;

/** The week (Monday–Sunday) that contains `date`. */
export const weekOf = (date) => {
  const start = weekStart(date);
  return { start, end: addDaysIso(start, 6) };
};

/** Everything the weekly review shows for the week starting on Monday `start`. */
export function weeklyReview(data, start) {
  const end = addDaysIso(start, 6);
  const prevStart = addDaysIso(start, -7);
  const prevEnd = addDaysIso(start, -1);
  const week = (data.finance || []).filter((e) => inRange(e.date, start, end));
  const prev = (data.finance || []).filter((e) => inRange(e.date, prevStart, prevEnd));
  const t = totals(week);
  const p = totals(prev);
  const apps = data.career?.applications || [];
  const habits = data.habits || [];
  const habitDays = habits.reduce((s, hb) => s + (hb.days || []).filter((d) => inRange(d, start, end)).length, 0);
  const rank = (key) => {
    const entries = data.ranks?.[key]?.entries || [];
    const a = valueAt(entries, prevEnd);
    const b = valueAt(entries, end);
    return { start: a, end: b, change: a != null && b != null ? b - a : null };
  };
  const subs = (data.channels || []).reduce(
    (acc, c) => {
      const a = subscribersAt(c.snapshots, prevEnd);
      const b = subscribersAt(c.snapshots, end);
      if (b != null) acc.end += b;
      if (a != null && b != null) acc.change += b - a;
      return acc;
    },
    { end: 0, change: 0 },
  );
  return {
    start,
    end,
    money: { income: t.income, expense: t.expense, prevIncome: p.income, prevExpense: p.expense, top: byCategory(week, 'expense').slice(0, 3) },
    budgets: budgetStatus(inMonth(data.finance || [], end.slice(0, 7)), data.budgets || {}),
    career: {
      sent: apps.filter((a) => inRange(a.sentAt, start, end)).length,
      replies: apps.filter((a) => ['interview', 'offer', 'rejected'].includes(a.status) && inRange(a.statusAt, start, end)).length,
      interviews: apps.filter((a) => a.status === 'interview' && inRange(a.statusAt, start, end)).length,
    },
    habits: { share: habits.length ? habitDays / (habits.length * 7) : null, done: habitDays, possible: habits.length * 7 },
    tasks: (data.tasks || []).filter((x) => x.done && inRange(x.doneAt, start, end)).length,
    projects: (data.projects || [])
      .map((pr) => ({ name: pr.name, hours: Math.round((pr.hours || []).filter((x) => inRange(x.date, start, end)).reduce((s, x) => s + (Number(x.hours) || 0), 0) * 100) / 100 }))
      .filter((x) => x.hours > 0),
    ranks: { dota: rank('dota'), faceit: rank('faceit'), deadlock: rank('deadlock') },
    subscribers: (data.channels || []).length ? subs : null,
  };
}

/** Keeps the newest 52 saved weeks, one per Monday. */
export function upsertReview(list, entry) {
  const rest = (list || []).filter((x) => x.week !== entry.week);
  return [...rest, entry].sort((a, b) => a.week.localeCompare(b.week)).slice(-52);
}
