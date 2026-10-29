// Windows notifications: due ones (notify-calc.js) are shown outside quiet hours and written to the journal.
import { state, update } from './state.js';
import { t } from './i18n.js';
import { money } from './ui.js';
import { catLabel } from './labels.js';
import { today, prettyDate } from './dates.js';
import { dueNotifications, shouldNotify, pruneNotified, inQuietHours } from './notify-calc.js';

// Never more than this many at once (the rest come on the next check).
const MAX_AT_ONCE = 4;

function texts(n) {
  const p = { ...n.params };
  if (p.amount != null) p.amount = money(p.type === 'income' ? p.amount : -p.amount, { sign: true });
  if (p.spent != null) p.spent = money(p.spent);
  if (p.limit != null) p.limit = money(p.limit);
  if (p.category) p.category = catLabel(p.category);
  if (p.after != null) p.after = money(p.after);
  if (p.short != null) p.short = money(p.short);
  if (p.deadline) p.deadline = prettyDate(p.deadline);
  return { title: t(`${n.key}.title`, p), body: t(`${n.key}.body`, p) };
}

export function checkNotifications(now = new Date()) {
  const s = state.data.settings.notify;
  if (inQuietHours(now.getHours() * 60 + now.getMinutes(), s.quietFrom, s.quietTo)) return 0;
  const td = today();
  const due = dueNotifications(state.data, now)
    .filter((n) => shouldNotify(state.data.notified, n, td))
    .slice(0, MAX_AT_ONCE);
  if (!due.length) return 0;
  for (const n of due) window.api.notify({ id: n.id, view: n.view, ...texts(n) });
  update(
    (d) => {
      d.notified = pruneNotified({ ...d.notified, ...Object.fromEntries(due.map((n) => [n.id, td])) }, td);
    },
    { silent: true },
  );
  return due.length;
}
