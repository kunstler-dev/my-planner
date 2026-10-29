// Channel tabs: content plan (ideas → planned → published) and ads (bought and sold posts, cost per subscriber).
import { state, update } from '../state.js';
import { h, icon, money, compact, uid, card, empty, toast } from '../ui.js';
import { t, locale } from '../i18n.js';
import { formModal } from '../modal.js';
import { today, prettyDate, addDays } from '../dates.js';
import { adStats } from '../planner-calc.js';
import { CAT } from '../finance-calc.js';
import { go } from '../app.js';

const statuses = () => ['idea', 'planned', 'done'].map((k) => [k, t(`plan.status.${k}`)]);

// ---- content plan ----

function postModal(ch, p) {
  const isNew = !p?.id;
  formModal(
    isNew ? t('plan.newPost') : t('plan.post'),
    [
      { key: 'title', label: t('plan.topic'), required: true },
      { key: 'date', label: t('plan.date'), type: 'date', half: true },
      { key: 'status', label: t('common.status'), type: 'select', options: statuses(), half: true },
      { key: 'note', label: t('plan.notes'), type: 'textarea', rows: 5 },
    ],
    { title: '', date: '', status: 'planned', note: '', ...p },
    {
      onSave: (v) => {
        const status = v.status === 'planned' && !v.date ? 'idea' : v.status;
        update((d) => {
          const i = d.contentPlan.findIndex((x) => x.id === p?.id);
          const rec = { ...(i >= 0 ? d.contentPlan[i] : { id: uid(), channel: ch.username }), ...v, status, doneAt: status === 'done' ? p?.doneAt || today() : null };
          if (i >= 0) d.contentPlan[i] = rec;
          else d.contentPlan.push(rec);
        });
      },
      onDelete: isNew ? null : () => update((d) => (d.contentPlan = d.contentPlan.filter((x) => x.id !== p.id))),
    },
  );
}

function writeWithGrok(ch, p) {
  go('grok', { prompt: t('prompt.post', { title: ch.title, username: ch.username, topic: p.title, notes: p.note ? `${t('prompt.myNotes', { note: p.note })}\n` : '' }) });
}

function postRow(ch, p) {
  const overdue = p.status === 'planned' && p.date && p.date < today();
  return h(
    'div',
    { class: `list-row${p.status === 'done' ? ' task-done' : ''}` },
    h(
      'button',
      {
        class: `check${p.status === 'done' ? ' on' : ''}`,
        title: p.status === 'done' ? t('plan.backToPlan') : t('plan.status.done'),
        onclick: () =>
          update((d) => {
            const x = d.contentPlan.find((y) => y.id === p.id);
            x.status = x.status === 'done' ? (x.date ? 'planned' : 'idea') : 'done';
            x.doneAt = x.status === 'done' ? today() : null;
          }),
      },
      p.status === 'done' && icon('check', 13),
    ),
    h(
      'div',
      { class: 'grow', style: { cursor: 'pointer' }, onclick: () => postModal(ch, p) },
      h('div', { class: 'title' }, p.title),
      h('div', { class: 'meta' }, [p.date ? `${overdue ? `${t('plan.overdue')} · ` : ''}${prettyDate(p.date)}` : t('plan.noDate'), p.note && p.note.slice(0, 60)].filter(Boolean).join(' · ')),
    ),
    p.status !== 'done' && h('button', { class: 'btn ghost sm', title: t('plan.draftHint'), onclick: () => writeWithGrok(ch, p) }, icon('spark', 14), 'Grok'),
  );
}

export function planTab(ch) {
  const all = state.data.contentPlan.filter((p) => p.channel === ch.username);
  const td = today();
  const planned = all.filter((p) => p.status === 'planned').sort((a, b) => a.date.localeCompare(b.date));
  const ideas = all.filter((p) => p.status === 'idea');
  const done = all
    .filter((p) => p.status === 'done')
    .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''))
    .slice(0, 10);
  const week = Array.from({ length: 7 }, (_, i) => addDays(td, i));
  const quick = h('input', { class: 'input', placeholder: t('plan.quickIdea'), style: { flex: 1 } });
  return [
    h(
      'div',
      { class: 'week-strip gap-b' },
      week.map((d) => {
        const items = planned.filter((p) => p.date === d);
        return h(
          'div',
          { class: `day-cell${items.length ? ' has' : ''}`, onclick: () => postModal(ch, { date: d, status: 'planned' }) },
          h('div', { class: 'day-name' }, new Date(`${d}T12:00`).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric' })),
          items.length ? items.map((p) => h('div', { class: 'day-post' }, p.title)) : h('div', { class: 'muted', style: { fontSize: '12px' } }, '+'),
        );
      }),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { alignItems: 'start' } },
      card(
        t('plan.planned'),
        h('button', { class: 'btn ghost sm', onclick: () => postModal(ch, { status: 'planned', date: td }) }, icon('plus', 14), t('plan.post')),
        planned.length ? h('div', { class: 'list' }, planned.map((p) => postRow(ch, p))) : empty(t('plan.plannedEmpty')),
      ),
      card(
        t('plan.ideas'),
        null,
        h(
          'form',
          {
            class: 'row',
            style: { marginBottom: '6px' },
            onsubmit: (e) => {
              e.preventDefault();
              if (!quick.value.trim()) return;
              update((d) => d.contentPlan.push({ id: uid(), channel: ch.username, title: quick.value.trim(), status: 'idea', date: '', note: '' }));
            },
          },
          quick,
          h('button', { class: 'btn primary icon-only', type: 'submit', title: t('common.add') }, icon('plus', 16)),
        ),
        ideas.length ? h('div', { class: 'list' }, ideas.map((p) => postRow(ch, p))) : empty(t('plan.ideasEmpty')),
      ),
      card(t('plan.published'), null, done.length ? h('div', { class: 'list' }, done.map((p) => postRow(ch, p))) : empty(t('plan.publishedEmpty'))),
    ),
  ];
}

// ---- ads ----

function syncAdFinance(d, ad) {
  d.finance = d.finance.filter((e) => e.adId !== ad.id);
  if (!ad.toFinance || !(ad.price > 0)) return;
  d.finance.push({
    id: uid(),
    adId: ad.id,
    type: ad.kind === 'buy' ? 'expense' : 'income',
    amount: ad.price,
    category: ad.kind === 'buy' ? CAT.adsExpense : CAT.adsIncome,
    date: ad.date || today(),
    note: t(ad.kind === 'buy' ? 'ads.noteBuy' : 'ads.noteSell', { partner: ad.partner, channel: ad.channel }),
  });
}

function adModal(ch, a) {
  const isNew = !a?.id;
  formModal(
    isNew ? t('ads.ad') : t('ads.adOf', { partner: a.partner }),
    [
      {
        key: 'kind',
        label: t('ads.what'),
        type: 'select',
        options: [
          ['buy', t('ads.kindBuy')],
          ['sell', t('ads.kindSell')],
        ],
      },
      { key: 'partner', label: t('ads.partner'), required: true, placeholder: t('ads.partnerPh') },
      { key: 'date', label: t('common.date'), type: 'date', half: true },
      { key: 'price', label: t('ads.price', { cur: state.data.settings.currency }), type: 'number', half: true },
      { key: 'gained', label: t('ads.gained'), type: 'number', half: true },
      { key: 'views', label: t('ads.views'), type: 'number', half: true },
      { key: 'note', label: t('ads.note'), placeholder: t('ads.notePh') },
      { key: 'toFinance', label: t('ads.toFinance'), type: 'checkbox' },
    ],
    { kind: 'buy', partner: '', date: today(), price: '', gained: '', views: '', note: '', toFinance: true, ...a },
    {
      onSave: (v) => {
        update((d) => {
          const i = d.ads.findIndex((x) => x.id === a?.id);
          const rec = { ...(i >= 0 ? d.ads[i] : { id: uid(), channel: ch.username }), ...v };
          if (i >= 0) d.ads[i] = rec;
          else d.ads.push(rec);
          syncAdFinance(d, rec);
        });
        if (v.toFinance && v.price > 0) toast(t('ads.savedToFinance'));
      },
      onDelete: isNew
        ? null
        : () =>
            update((d) => {
              d.ads = d.ads.filter((x) => x.id !== a.id);
              d.finance = d.finance.filter((e) => e.adId !== a.id);
            }),
    },
  );
}

function tile(label, value, note, dark) {
  return h(
    'div',
    { class: `card stat${dark ? ' dark' : ''}` },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-value' }, value),
    note && h('div', { class: 'stat-note' }, note),
  );
}

export function adsTab(ch) {
  const ads = state.data.ads.filter((a) => a.channel === ch.username).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const st = adStats(ads);
  const buys = ads.filter((a) => a.kind === 'buy' && a.gained > 0);
  const best = [...buys].sort((a, b) => a.price / a.gained - b.price / b.gained)[0];
  return [
    h(
      'div',
      { class: 'grid cols-4 gap-b' },
      tile(t('ads.costPerSub'), st.costPerSub != null ? money(st.costPerSub) : '—', t('ads.subsFor', { subs: compact(st.gained), amount: money(st.spent) }), true),
      tile(t('ads.spent'), money(st.spent), t('ads.buysN', { n: st.buys })),
      tile(t('ads.earned'), money(st.income), t('ads.sellsN', { n: st.sells })),
      tile(t('ads.result'), money(st.income - st.spent, { sign: true }), best ? t('ads.bestBuy', { partner: best.partner }) : null),
    ),
    card(
      t('ads.all'),
      h('button', { class: 'btn primary sm', onclick: () => adModal(ch, null) }, icon('plus', 14), t('ads.ad')),
      ads.length
        ? h(
            'div',
            { class: 'list' },
            ads.map((a) =>
              h(
                'div',
                { class: 'list-row', style: { cursor: 'pointer' }, onclick: () => adModal(ch, a) },
                h('span', { class: `badge${a.kind === 'sell' ? ' solid' : ''}` }, a.kind === 'buy' ? t('ads.buy') : t('ads.sell')),
                h('div', { class: 'grow' }, h('div', { class: 'title' }, a.partner), h('div', { class: 'meta' }, [a.date && prettyDate(a.date), a.views && t('ads.viewsShort', { v: compact(a.views) }), a.note].filter(Boolean).join(' · '))),
                a.kind === 'buy' && a.gained > 0 && h('div', { class: 'meta', style: { textAlign: 'right' } }, t('ads.subsShort', { v: compact(a.gained) }), h('br'), t('ads.perSub', { amount: money(a.price / a.gained) })),
                h('div', { class: `amount${a.kind === 'buy' ? ' out' : ''}` }, money(a.kind === 'buy' ? -a.price : a.price, { sign: true })),
              ),
            ),
          )
        : empty(t('ads.empty')),
    ),
  ];
}
