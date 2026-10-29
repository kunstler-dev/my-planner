// The pets' mood from what's going on (pure, unit-tested): sleepy at night, sad when a budget is over, a task is
// overdue or a payment failed, happy when today's habits are all done, a task was closed or an application sent.
import { budgetStatus } from './planner-calc.js';

const pad = (n) => String(n).padStart(2, '0');

/** Returns { mood: 'happy' | 'sad' | 'sleepy' | 'neutral', reason } — reason is a translation key. */
export function petMood(data, now = new Date()) {
  const hour = now.getHours();
  if (hour >= 23 || hour < 7) return { mood: 'sleepy', reason: 'pet.sleepy' };
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const month = today.slice(0, 7);
  if ((data.inbox || []).some((x) => x.kind === 'alert' && x.status === 'new')) return { mood: 'sad', reason: 'pet.sad.alert' };
  if (budgetStatus((data.finance || []).filter((e) => e.date?.startsWith(month)), data.budgets || {}).some((b) => b.over)) return { mood: 'sad', reason: 'pet.sad.budget' };
  if ((data.tasks || []).some((t) => !t.done && t.date && t.date < today)) return { mood: 'sad', reason: 'pet.sad.overdue' };
  const habits = data.habits || [];
  if (habits.length && habits.every((hb) => (hb.days || []).includes(today))) return { mood: 'happy', reason: 'pet.happy.habits' };
  if ((data.tasks || []).some((t) => t.done && t.doneAt === today)) return { mood: 'happy', reason: 'pet.happy.task' };
  if ((data.career?.applications || []).some((a) => a.sentAt === today)) return { mood: 'happy', reason: 'pet.happy.applied' };
  return { mood: 'neutral', reason: 'pet.neutral' };
}
