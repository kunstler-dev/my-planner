// Weekly review, Monday to Sunday: money against the previous week, top expense categories and budgets;
// applications; habits, tasks and project hours; ranks and channel subscribers. A Grok comment streams right here
// in API mode or is pasted into grok.com otherwise. Each finished week is saved (the newest 52).
import { state, update } from '../state.js';
import { h, icon, money, card, compact, uid } from '../ui.js';
import { t, num } from '../i18n.js';
import { today, prettyDate } from '../dates.js';
import { addDaysIso } from '../planner-calc.js';
import { catLabel } from '../labels.js';
import { deadlockName } from '../games-calc.js';
import { markdown } from '../markdown.js';
import { weekOf, weeklyReview, upsertReview } from '../productivity-calc.js';
import { go } from '../app.js';

let shownWeek = null;
let streaming = null; // { week, text }

const pct = (a, b) => (b ? `${a >= b ? '+' : '−'}${Math.round(Math.abs((a - b) / b) * 100)}%` : '');

function line(label, value, note) {
  return h('div', { class: 'list-row compact' }, h('div', { class: 'grow meta' }, label), h('div', { class: 'amount' }, value), note && h('span', { class: 'meta', style: { minWidth: '52px', textAlign: 'right' } }, note));
}

const rankText = (key, r) => {
  if (r.end == null) return '—';
  const fmt = key === 'deadlock' ? deadlockName : (v) => num(Math.round(v));
  if (r.change == null || r.change === 0) return fmt(r.end);
  const d = key === 'deadlock' ? t('games.subranks', { v: `${r.change > 0 ? '+' : ''}${r.change}` }) : `${r.change > 0 ? '+' : ''}${Math.round(r.change)}`;
  return `${fmt(r.end)} (${d})`;
};

function prompt(s) {
  return t('prompt.review', {
    from: s.start,
    to: s.end,
    income: money(s.money.income),
    expense: money(s.money.expense),
    prevIncome: money(s.money.prevIncome),
    prevExpense: money(s.money.prevExpense),
    top: s.money.top.map((c) => `${catLabel(c.category)} ${money(c.sum)}`).join(', ') || '—',
    sent: s.career.sent,
    replies: s.career.replies,
    interviews: s.career.interviews,
    habits: s.habits.share != null ? Math.round(s.habits.share * 100) : '—',
    tasks: s.tasks,
    hours: s.projects.map((p) => `${p.name} ${p.hours}`).join(', ') || '0',
  });
}

/** Grok's comment: streamed here with an API key, otherwise the prompt goes to the Grok screen. */
async function askGrok(s) {
  if (state.data.settings.grokMode !== 'api') return go('grok', { prompt: prompt(s) });
  if (streaming) return;
  const id = uid();
  streaming = { week: s.start, text: '' };
  update(() => {});
  const off = window.api.grok.onDelta((m) => {
    if (m.id !== id || !streaming) return;
    streaming.text += m.delta;
    const el = document.getElementById('review-grok');
    if (el) el.innerHTML = markdown(streaming.text);
  });
  const res = await window.api.grok.chat(id, state.data.settings.grokModel, [
    { role: 'system', content: t('grok.system') },
    { role: 'user', content: prompt(s) },
  ]);
  off();
  const text = res.ok ? res.text || streaming.text : streaming.text;
  streaming = null;
  update((d) => (d.weeklyReviews = upsertReview(d.weeklyReviews, { week: s.start, summary: s, grok: text || '' })));
}

export function reviewView() {
  const current = weekOf(today()).start;
  shownWeek ||= current;
  const s = weeklyReview(state.data, shownWeek);
  const saved = state.data.weeklyReviews.find((w) => w.week === shownWeek);
  // A finished week is kept, so it can still be read once the data behind it changes.
  if (shownWeek < current && !saved) setTimeout(() => update((d) => (d.weeklyReviews = upsertReview(d.weeklyReviews, { week: s.start, summary: s, grok: '' })), { silent: true }), 0);
  const grokText = streaming?.week === shownWeek ? streaming.text : saved?.grok;
  const nav = (delta) => () => {
    shownWeek = addDaysIso(shownWeek, delta * 7);
    if (shownWeek > current) shownWeek = current;
    update(() => {});
  };
  const m = s.money;
  return h(
    'div',
    { class: 'page' },
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        {},
        h('h1', {}, t('nav.review')),
        h(
          'div',
          { class: 'row' },
          h('button', { class: 'btn ghost sm icon-only', title: t('review.prev'), onclick: nav(-1) }, icon('left', 16)),
          h('span', { style: { fontWeight: 600, minWidth: '190px', textAlign: 'center' } }, `${prettyDate(s.start)} — ${prettyDate(s.end)}`),
          h('button', { class: 'btn ghost sm icon-only', title: t('review.next'), disabled: shownWeek >= current, onclick: nav(1) }, icon('right', 16)),
        ),
      ),
      h('button', { class: 'btn primary', disabled: !!streaming, onclick: () => askGrok(s) }, icon('spark', 16), streaming ? t('common.loading') : t('review.grok')),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { alignItems: 'start' } },
      card(
        t('review.money'),
        null,
        h('div', { class: 'list' }, line(t('finance.incomes'), money(m.income), pct(m.income, m.prevIncome)), line(t('finance.expenses'), money(m.expense), pct(m.expense, m.prevExpense)), line(t('review.prevWeek'), `${money(m.prevIncome)} / ${money(m.prevExpense)}`)),
        h('div', { class: 'day-head' }, t('review.topCategories')),
        h('div', { class: 'list' }, m.top.length ? m.top.map((c) => line(catLabel(c.category), money(c.sum))) : h('p', { class: 'meta' }, '—')),
        s.budgets.length > 0 && [h('div', { class: 'day-head' }, t('review.budgets')), h('div', { class: 'list' }, s.budgets.map((b) => line(b.over ? `⚠ ${catLabel(b.category)}` : catLabel(b.category), `${Math.round(b.share * 100)}%`)))],
      ),
      card(
        t('review.work'),
        null,
        h(
          'div',
          { class: 'list' },
          line(t('review.sent'), String(s.career.sent)),
          line(t('review.replies'), String(s.career.replies)),
          line(t('review.interviews'), String(s.career.interviews)),
          line(t('review.habits'), s.habits.share != null ? `${Math.round(s.habits.share * 100)}%` : '—'),
          line(t('review.tasks'), String(s.tasks)),
          ...s.projects.map((p) => line(p.name, t('project.hoursValue', { v: num(p.hours) }))),
        ),
      ),
      card(
        t('review.games'),
        null,
        h(
          'div',
          { class: 'list' },
          line('Dota 2 MMR', rankText('dota', s.ranks.dota)),
          line('FACEIT ELO', rankText('faceit', s.ranks.faceit)),
          line('Deadlock', rankText('deadlock', s.ranks.deadlock)),
          s.subscribers && line(t('channel.subscribers'), compact(s.subscribers.end), `${s.subscribers.change >= 0 ? '+' : '−'}${compact(Math.abs(s.subscribers.change))}`),
        ),
      ),
    ),
    (grokText || streaming?.week === shownWeek) && h('div', { class: 'gap-t' }, card(t('review.grokTitle'), null, h('div', { id: 'review-grok', class: 'msg assistant review-grok', html: markdown(grokText || '') }))),
    h('p', { class: 'meta gap-t' }, t('review.savedN', { n: state.data.weeklyReviews.length })),
  );
}
