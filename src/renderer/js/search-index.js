// Ctrl+K search (pure, unit-tested): one index over notes, tasks, operations, applications, projects, the
// wishlist, channels and the inbox, plus commands; simple fuzzy matching, recent things first.

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Index items { kind, id, title, sub, date, view, ref } from the data. `label` gives display texts:
 * { category(c), money(n), account(a) } so the index shows what the screens show.
 */
export function buildIndex(data, label = {}) {
  const cat = label.category || ((c) => c);
  const money = label.money || ((n) => String(n));
  const items = [];
  for (const n of data.notes || []) items.push({ kind: 'note', id: n.id, title: n.title || String(n.text || '').split('\n')[0], sub: String(n.text || '').slice(0, 80), date: n.updatedAt || '', view: 'notes' });
  for (const t of data.tasks || []) items.push({ kind: 'task', id: t.id, title: t.title, sub: t.date, date: t.done ? t.doneAt || t.date : t.date, view: 'tasks' });
  for (const e of data.finance || []) items.push({ kind: 'entry', id: e.id, title: `${cat(e.category)} ${e.type === 'income' ? '+' : '−'}${money(e.amount)}`, sub: [e.note, e.merchant].filter(Boolean).join(' · '), date: e.date, view: 'finance', ref: e.date?.slice(0, 7), extra: String(e.amount) });
  for (const a of data.career?.applications || []) items.push({ kind: 'application', id: a.id, title: `${a.company} — ${a.position}`, sub: a.city || '', date: a.sentAt || a.createdAt || '', view: 'career' });
  for (const p of data.projects || []) items.push({ kind: 'project', id: p.id, title: p.name, sub: p.description || '', date: p.createdAt || '', view: 'projects' });
  for (const g of data.wishlist || []) items.push({ kind: 'game', id: g.id, title: g.name, sub: '', date: g.addedAt || '', view: 'games', ref: 'wishlist' });
  for (const c of data.channels || []) items.push({ kind: 'channel', id: c.username, title: c.title || `@${c.username}`, sub: `@${c.username}`, date: '', view: 'channel' });
  for (const x of data.inbox || []) if (x.status === 'new') items.push({ kind: 'inbox', id: x.id, title: x.title || x.subject || '', sub: x.sender || '', date: x.date || '', view: 'inbox' });
  return items;
}

/** How well `q` matches `text`: whole substring (earlier is better), else letters in order, else 0. */
export function matchScore(text, q) {
  const s = norm(text);
  if (!q) return 1;
  const i = s.indexOf(q);
  if (i >= 0) return 100 - Math.min(50, i) + (i === 0 || /\s/.test(s[i - 1]) ? 20 : 0);
  let pos = 0;
  let gaps = 0;
  for (const ch of q) {
    const j = s.indexOf(ch, pos);
    if (j < 0) return 0;
    gaps += j - pos;
    pos = j + 1;
  }
  return Math.max(1, 40 - gaps);
}

/** Best matches for the query (title counts double), recent first on equal scores; at most `limit`. */
export function search(items, query, limit = 30) {
  const q = norm(query).trim();
  return items
    .map((it) => ({ it, score: q ? Math.max(matchScore(it.title, q) * 2, matchScore(`${it.sub} ${it.extra || ''}`, q)) : 1 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || String(b.it.date || '').localeCompare(String(a.it.date || '')))
    .slice(0, limit)
    .map((x) => x.it);
}
