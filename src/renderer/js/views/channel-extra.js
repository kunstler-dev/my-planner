// Channel tabs: content plan (ideas → planned → published) and ads (bought and sold posts, cost per subscriber).
import { state, update } from '../state.js';
import { h, icon, money, compact, uid, card, empty, toast } from '../ui.js';
import { formModal } from '../modal.js';
import { today, prettyDate, addDays } from '../dates.js';
import { adStats } from '../planner-calc.js';
import { go } from '../app.js';

const STATUS = [
  ['idea', 'Идея'],
  ['planned', 'Запланирован'],
  ['done', 'Опубликован'],
];

// ---- content plan ----

function postModal(ch, p) {
  const isNew = !p?.id;
  formModal(
    isNew ? 'Пост в план' : 'Пост',
    [
      { key: 'title', label: 'Тема / заголовок', required: true },
      { key: 'date', label: 'Дата публикации (пусто — просто идея)', type: 'date', half: true },
      { key: 'status', label: 'Статус', type: 'select', options: STATUS, half: true },
      { key: 'note', label: 'Заметки, тезисы, ссылки', type: 'textarea', rows: 5 },
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
  go('grok', {
    prompt:
      `Помоги написать пост для моего Telegram-канала «${ch.title}» (@${ch.username}).\nТема: ${p.title}\n${p.note ? `Мои тезисы: ${p.note}\n` : ''}` +
      'Сделай 2 варианта: короткий и развёрнутый, с цепляющей первой строкой и призывом в конце. Пиши в стиле канала, без воды.',
  });
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
        title: p.status === 'done' ? 'Вернуть в план' : 'Опубликован',
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
      h('div', { class: 'meta' }, [p.date ? `${overdue ? 'просрочен · ' : ''}${prettyDate(p.date)}` : 'идея без даты', p.note && p.note.slice(0, 60)].filter(Boolean).join(' · ')),
    ),
    p.status !== 'done' && h('button', { class: 'btn ghost sm', title: 'Написать черновик с Grok', onclick: () => writeWithGrok(ch, p) }, icon('spark', 14), 'Grok'),
  );
}

export function planTab(ch) {
  const all = state.data.contentPlan.filter((p) => p.channel === ch.username);
  const td = today();
  const planned = all.filter((p) => p.status === 'planned').sort((a, b) => a.date.localeCompare(b.date));
  const ideas = all.filter((p) => p.status === 'idea');
  const done = all.filter((p) => p.status === 'done').sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 10);
  const week = Array.from({ length: 7 }, (_, i) => addDays(td, i));
  const quick = h('input', { class: 'input', placeholder: 'Быстро добавить идею поста…', style: { flex: 1 } });
  return [
    h(
      'div',
      { class: 'week-strip', style: { marginBottom: '16px' } },
      week.map((d) => {
        const items = planned.filter((p) => p.date === d);
        return h(
          'div',
          { class: `day-cell${items.length ? ' has' : ''}`, onclick: () => postModal(ch, { date: d, status: 'planned' }) },
          h('div', { class: 'day-name' }, new Date(`${d}T12:00`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })),
          items.length ? items.map((p) => h('div', { class: 'day-post' }, p.title)) : h('div', { class: 'muted', style: { fontSize: '12px' } }, '+'),
        );
      }),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { alignItems: 'start' } },
      card(
        'Запланировано',
        h('button', { class: 'btn ghost sm', onclick: () => postModal(ch, { status: 'planned', date: td }) }, icon('plus', 14), 'Пост'),
        planned.length ? h('div', { class: 'list' }, planned.map((p) => postRow(ch, p))) : empty('Нажми на день в полосе сверху, чтобы запланировать пост.'),
      ),
      card(
        'Идеи',
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
          h('button', { class: 'btn primary icon-only', type: 'submit', title: 'Добавить' }, icon('plus', 16)),
        ),
        ideas.length ? h('div', { class: 'list' }, ideas.map((p) => postRow(ch, p))) : empty('Записывай сюда идеи, пока не забыл.'),
      ),
      card('Опубликовано', null, done.length ? h('div', { class: 'list' }, done.map((p) => postRow(ch, p))) : empty('Отмечай посты галочкой, когда выкладываешь.')),
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
    category: ad.kind === 'buy' ? 'Реклама канала' : 'Реклама в канале',
    date: ad.date || today(),
    note: `${ad.kind === 'buy' ? 'Закуп у' : 'Реклама для'} ${ad.partner} (@${ad.channel})`,
  });
}

function adModal(ch, a) {
  const isNew = !a?.id;
  formModal(
    isNew ? 'Реклама' : `Реклама: ${a.partner}`,
    [
      {
        key: 'kind',
        label: 'Что',
        type: 'select',
        options: [
          ['buy', 'Купил рекламу (закуп)'],
          ['sell', 'Продал рекламу в своём канале'],
        ],
      },
      { key: 'partner', label: 'Канал или рекламодатель', required: true, placeholder: '@channel или название' },
      { key: 'date', label: 'Дата', type: 'date', half: true },
      { key: 'price', label: `Цена, ${state.data.settings.currency}`, type: 'number', half: true },
      { key: 'gained', label: 'Пришло подписчиков (для закупа)', type: 'number', half: true },
      { key: 'views', label: 'Просмотров поста', type: 'number', half: true },
      { key: 'note', label: 'Заметка', placeholder: 'Формат, что сработало' },
      { key: 'toFinance', label: 'Записать сумму в финансы', type: 'checkbox' },
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
        if (v.toFinance && v.price > 0) toast('Записано и в финансы');
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
      { class: 'grid cols-4', style: { marginBottom: '16px' } },
      tile('Цена подписчика', st.costPerSub != null ? money(st.costPerSub) : '—', `${compact(st.gained)} подписчиков за ${money(st.spent)}`, true),
      tile('Потрачено на закупы', money(st.spent), `${st.buys} закупов`),
      tile('Заработано на рекламе', money(st.income), `${st.sells} продаж`),
      tile('Итог рекламы', money(st.income - st.spent, { sign: true }), best ? `лучший закуп: ${best.partner}` : null),
    ),
    card(
      'Все размещения',
      h('button', { class: 'btn primary sm', onclick: () => adModal(ch, null) }, icon('plus', 14), 'Реклама'),
      ads.length
        ? h(
            'div',
            { class: 'list' },
            ads.map((a) =>
              h(
                'div',
                { class: 'list-row', style: { cursor: 'pointer' }, onclick: () => adModal(ch, a) },
                h('span', { class: `badge${a.kind === 'sell' ? ' solid' : ''}` }, a.kind === 'buy' ? 'закуп' : 'продажа'),
                h(
                  'div',
                  { class: 'grow' },
                  h('div', { class: 'title' }, a.partner),
                  h('div', { class: 'meta' }, [a.date && prettyDate(a.date), a.views && `${compact(a.views)} просм.`, a.note].filter(Boolean).join(' · ')),
                ),
                a.kind === 'buy' && a.gained > 0 && h('div', { class: 'meta', style: { textAlign: 'right' } }, `+${compact(a.gained)} подп.`, h('br'), `${money(a.price / a.gained)} / подп.`),
                h('div', { class: `amount${a.kind === 'buy' ? ' out' : ''}` }, money(a.kind === 'buy' ? -a.price : a.price, { sign: true })),
              ),
            ),
          )
        : empty('Записывай закупы рекламы и сколько пришло подписчиков — увидишь цену подписчика и какие площадки окупаются.'),
    ),
  ];
}
