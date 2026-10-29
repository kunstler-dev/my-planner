// Pure rules for background checks and notifications (unit-tested): when a task is due, quiet hours, the
// once-a-day journal and which notifications are due now. Texts are produced by the caller from `key` + `params`.
import { upcoming, budgetStatus, careerStats, addDaysIso } from './planner-calc.js';
import { cancelDeadline, gameBudgetFit, atTarget } from './money-calc.js';

export const MINUTE = 60000;

/** A task with `interval` ms is due if it never ran or the interval has passed (or the clock went backwards). */
export function isDue(lastRun, interval, now) {
  const last = Number(lastRun) || 0;
  return !last || now - last >= interval || now < last;
}

/** 'HH:MM' → minutes since midnight (bad input → null). */
export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Quiet hours may cross midnight (23:00–08:00). Equal bounds mean no quiet hours. */
export function inQuietHours(minutes, from, to) {
  const a = toMinutes(from);
  const b = toMinutes(to);
  if (a == null || b == null || a === b) return false;
  return a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

/** Journal entries older than `days` days are dropped. */
export function pruneNotified(notified, todayStr, days = 40) {
  const from = addDaysIso(todayStr, -days);
  return Object.fromEntries(Object.entries(notified || {}).filter(([, date]) => typeof date === 'string' && date >= from));
}

/**
 * The same id is shown at most once a day; `once` notifications (a budget threshold in a month) only once at all
 * while they stay in the journal.
 */
export function shouldNotify(notified, n, todayStr) {
  const last = notified?.[n.id];
  if (!last) return true;
  return !n.once && last !== todayStr;
}

const pad = (v) => String(v).padStart(2, '0');
const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Notifications due at `now` for the enabled types: [{ id, type, view, key, params, once? }].
 * Types: recurring (today and tomorrow), budget (90 % and over), followUp, habits (not checked by habitsAt).
 */
export function dueNotifications(data, now = new Date()) {
  const s = data.settings.notify || {};
  const today = localIso(now);
  const out = [];
  if (s.recurring !== false) {
    for (const r of upcoming(data.recurring || [], today, 1)) {
      if (r.next < today) continue;
      const when = r.next === today ? 'today' : 'tomorrow';
      out.push({ id: `recurring:${r.id}:${r.next}:${when}`, type: 'recurring', view: 'finance', key: `notify.recurring.${when}`, params: { title: r.title, amount: Number(r.amount) || 0, type: r.type } });
    }
  }
  if (s.budget !== false) {
    const month = today.slice(0, 7);
    const entries = (data.finance || []).filter((e) => e.date?.startsWith(month));
    for (const b of budgetStatus(entries, data.budgets || {})) {
      if (b.share < 0.9) continue;
      const level = b.over ? 'over' : 'near';
      out.push({ id: `budget:${level}:${b.category}:${month}`, once: true, type: 'budget', view: 'finance', key: `notify.budget.${level}`, params: { category: b.category, spent: b.spent, limit: b.limit } });
    }
  }
  if (s.followUp !== false) {
    for (const a of careerStats(data.career?.applications || [], today).followUps) {
      out.push({ id: `followUp:${a.id}:${a.followUp}`, type: 'followUp', view: 'career', key: 'notify.followUp', params: { company: a.company, position: a.position } });
    }
  }
  if (s.bills !== false) {
    const tomorrow = addDaysIso(today, 1);
    for (const b of data.bills || []) {
      if (b.paid || b.dueDate !== tomorrow) continue;
      out.push({ id: `bill:${b.id}`, once: true, type: 'bills', view: 'home', key: 'notify.bill', params: { title: b.title, amount: Number(b.amount) || 0, type: 'expense' } });
    }
  }
  if (s.alerts !== false) {
    for (const x of data.inbox || []) {
      if (x.kind !== 'alert' || x.status !== 'new') continue;
      out.push({ id: `alert:${x.id}`, once: true, type: 'alerts', view: 'inbox', key: 'notify.alert', params: { title: x.title, sender: x.domain || x.sender || '' } });
    }
  }
  if (s.contracts !== false) {
    for (const r of data.recurring || []) {
      const c = r.active && r.contract && cancelDeadline(r.contract, today);
      if (!c || ![30, 7, 1].includes(c.daysLeft)) continue;
      out.push({ id: `contract:${r.id}:${c.deadline}:${c.daysLeft}`, once: true, type: 'contracts', view: 'finance', key: 'notify.contract', params: { title: r.title, n: c.daysLeft, deadline: c.deadline } });
    }
  }
  if (s.steam !== false) {
    for (const g of data.wishlist || []) {
      if (!atTarget(g) || g.boughtAt) continue;
      const fit = gameBudgetFit(data, g, today);
      const key = !fit ? 'notify.steam' : fit.fits ? 'notify.steamFits' : 'notify.steamShort';
      out.push({ id: `steam:${g.id}:${g.price}`, once: true, type: 'steam', view: 'games', key, params: { name: g.name, price: `${g.price} ${g.currency || '₴'}`, after: fit?.after, short: fit?.short } });
    }
  }
  if (s.habits !== false && (data.habits || []).length) {
    const at = toMinutes(s.habitsAt) ?? 20 * 60;
    const open = data.habits.filter((hb) => !(hb.days || []).includes(today));
    if (now.getHours() * 60 + now.getMinutes() >= at && open.length) {
      out.push({ id: `habits:${today}`, type: 'habits', view: 'tasks', key: 'notify.habits', params: { n: open.length, list: open.map((hb) => hb.title).slice(0, 3).join(', ') } });
    }
  }
  return out;
}
