// Games: Steam wishlist with live prices and discounts, rank tracking (Dota MMR, FACEIT ELO, Deadlock rank) and a
// pipeline for game clips (TikTok / Shorts / YouTube) with views.
import { state, update, rerender } from '../state.js';
import { h, icon, money, compact, uid, card, empty, toast } from '../ui.js';
import { openModal, formModal } from '../modal.js';
import { lineChart } from '../charts.js';
import { today, prettyDate } from '../dates.js';
import { convert } from '../planner-calc.js';
import {
  parseSteamAppId,
  applyPrice,
  wishlistSummary,
  dotaMedal,
  faceitLevel,
  faceitToNext,
  DEADLOCK_TIERS,
  deadlockValue,
  deadlockName,
  rankProgress,
  CLIP_STATUSES,
  PLATFORMS,
  clipViews,
  clipStats,
} from '../games-calc.js';
import { go } from '../app.js';

let tab = 'wishlist';
let refreshing = false;

const TABS = [
  ['wishlist', 'Вишлист Steam'],
  ['ranks', 'Ранги'],
  ['clips', 'Контент'],
];

const eur = (v) => `${(Math.round(v * 100) / 100).toLocaleString('ru-RU', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
/** Steam prices are in euro; show the main currency next to them when it's hryvnia. */
const priceText = (v) => (state.data.settings.currency === '€' ? eur(v) : `${eur(v)} ≈ ${money(convert(v, '€', state.data.settings.currency, state.data.rates))}`);

function tile(label, value, note, dark, onclick) {
  return h(
    onclick ? 'button' : 'div',
    { class: `card stat${dark ? ' dark' : ''}`, style: onclick ? { textAlign: 'left', cursor: 'pointer' } : null, onclick },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: 'stat-value' }, value),
    note && h('div', { class: 'stat-note' }, note),
  );
}

// ---- wishlist ----

export async function refreshPrices({ silent = false } = {}) {
  const items = state.data.wishlist;
  if (!items.length || refreshing) return;
  refreshing = true;
  if (!silent) rerender();
  const res = await window.api.steam.prices(items.map((i) => i.id));
  refreshing = false;
  if (!res.ok) {
    if (!silent) toast('Steam не ответил — попробуй позже');
    return rerender();
  }
  const date = today();
  let newSales = 0;
  update((d) => {
    d.wishlist = d.wishlist.map((i) => {
      const entry = res.prices[i.id];
      if (!entry?.success) return { ...i, updatedAt: date };
      const next = applyPrice(i, Array.isArray(entry.data) ? null : entry.data.price_overview, date);
      if (next.discount > 0 && !(i.discount > 0)) newSales++;
      return next;
    });
  });
  if (!silent) toast('Цены обновлены');
  else if (newSales) toast(`Новые скидки в вишлисте: ${newSales}`);
}

async function addGame(id, name, image) {
  if (state.data.wishlist.some((i) => i.id === id)) return toast('Уже в вишлисте');
  update((d) => d.wishlist.push({ id, name, image: image || `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/capsule_231x87.jpg`, target: null, history: [], addedAt: today() }));
  const res = await window.api.steam.prices([id]);
  const entry = res.ok && res.prices[id];
  if (entry?.success) update((d) => (d.wishlist = d.wishlist.map((i) => (i.id === id ? applyPrice(i, Array.isArray(entry.data) ? null : entry.data.price_overview, today()) : i))));
  toast(`${name} — в вишлисте`);
}

function searchModal() {
  const input = h('input', { class: 'input', placeholder: 'Название игры или ссылка на страницу в Steam' });
  const results = h('div', { class: 'list search-results' });
  let timer;
  const search = async () => {
    const q = input.value.trim();
    const appId = parseSteamAppId(q);
    if (appId) {
      results.replaceChildren(h('div', { class: 'list-row', style: { cursor: 'pointer' }, onclick: () => (addGame(appId, `App ${appId}`), modal.close()) }, h('div', { class: 'grow' }, `Добавить игру #${appId} по ссылке`)));
      return;
    }
    if (q.length < 2) return results.replaceChildren();
    results.replaceChildren(h('p', { class: 'muted' }, 'Ищу…'));
    const res = await window.api.steam.search(q);
    if (input.value.trim() !== q) return;
    if (!res.ok) return results.replaceChildren(h('p', { class: 'muted' }, 'Steam не ответил'));
    results.replaceChildren(
      ...(res.items.length
        ? res.items.slice(0, 8).map((it) =>
            h(
              'div',
              {
                class: 'list-row',
                style: { cursor: 'pointer' },
                onclick: () => {
                  addGame(it.id, it.name, it.tiny_image);
                  modal.close();
                },
              },
              h('img', { src: it.tiny_image, class: 'capsule', width: 92, height: 35, alt: '' }),
              h('div', { class: 'grow title' }, it.name),
              h('div', { class: 'meta' }, it.price ? eur(it.price.final / 100) : 'бесплатно'),
            ),
          )
        : [h('p', { class: 'muted' }, 'Ничего не нашлось')]),
    );
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, 350);
  });
  const modal = openModal('Добавить в вишлист', h('div', { class: 'stack', style: { gap: '10px' } }, input, results));
}

function targetModal(item) {
  formModal(
    item.name,
    [{ key: 'target', label: 'Куплю, если цена станет не выше, €', type: 'number', placeholder: 'например, 20' }],
    { target: item.target ?? '' },
    {
      onSave: (v) => update((d) => (d.wishlist.find((i) => i.id === item.id).target = v.target > 0 ? v.target : null)),
      onDelete: () => update((d) => (d.wishlist = d.wishlist.filter((i) => i.id !== item.id))),
    },
  );
}

function wishRow(i) {
  const hit = i.price != null && i.target > 0 && i.price <= i.target;
  return h(
    'div',
    { class: 'list-row wish-row' },
    h('img', { src: i.image, class: 'capsule', width: 120, height: 45, alt: '' }),
    h(
      'div',
      { class: 'grow' },
      h('div', { class: 'title' }, i.name),
      h(
        'div',
        { class: 'meta' },
        [
          i.lowest != null && i.history?.length > 1 && `мин. ${eur(i.lowest)}`,
          i.target > 0 && (hit ? `🎯 цель ${eur(i.target)} достигнута` : `цель ${eur(i.target)}`),
          i.updatedAt && `проверено ${prettyDate(i.updatedAt)}`,
        ]
          .filter(Boolean)
          .join(' · '),
      ),
    ),
    i.discount > 0 && h('span', { class: 'badge solid' }, `−${i.discount}%`),
    h(
      'div',
      { style: { textAlign: 'right', minWidth: '96px' } },
      i.price == null ? h('div', { class: 'meta' }, 'нет цены') : [i.discount > 0 && h('div', { class: 'meta strike' }, eur(i.initial)), h('div', { class: 'amount' }, priceText(i.price))],
    ),
    h('button', { class: 'btn ghost sm icon-only', title: 'Цель по цене / удалить', onclick: () => targetModal(i) }, icon('edit', 15)),
    h('a', { class: 'btn ghost sm icon-only', title: 'Открыть в Steam', href: `https://store.steampowered.com/app/${i.id}/`, target: '_blank' }, icon('up', 15)),
  );
}

function wishlistTab() {
  const items = state.data.wishlist;
  if (items.some((i) => i.updatedAt !== today())) setTimeout(() => refreshPrices({ silent: true }), 0);
  const s = wishlistSummary(items);
  const sorted = [...items].sort((a, b) => (b.discount || 0) - (a.discount || 0) || (a.price ?? 1e9) - (b.price ?? 1e9));
  return [
    h(
      'div',
      { class: 'grid cols-4', style: { marginBottom: '16px' } },
      tile('Со скидкой сейчас', String(s.onSale), s.onSale ? `экономия ${eur(s.saving)}` : 'скидок нет', true),
      tile('Достигли твоей цены', String(s.atTarget), 'задай цель кнопкой ✎'),
      tile('Весь вишлист', eur(s.total), `${items.length} игр`),
      tile('Бюджет на игры · месяц', money(state.data.budgets['Игры'] || 0), state.data.budgets['Игры'] ? 'лимит категории «Игры»' : 'задай в Финансы → Бюджеты'),
    ),
    card(
      'Вишлист',
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn sm', disabled: refreshing || !items.length, onclick: () => refreshPrices() }, icon('refresh', 14), refreshing ? 'Проверяю…' : 'Цены'),
        h('button', { class: 'btn primary sm', onclick: searchModal }, icon('plus', 14), 'Игра'),
      ),
      items.length ? h('div', { class: 'list' }, sorted.map(wishRow)) : empty('Добавь игры, которые хочешь купить — цены из Steam (DE) проверяются каждый день, скидки всплывают сверху.'),
    ),
  ];
}

// ---- ranks ----

const TRACKS = {
  dota: { title: 'Dota 2 · MMR', unit: 'MMR', fmt: (v) => Math.round(v).toLocaleString('ru-RU'), sub: (v) => `≈ ${dotaMedal(v)}` },
  faceit: {
    title: 'CS2 · FACEIT',
    unit: 'ELO',
    fmt: (v) => `${Math.round(v).toLocaleString('ru-RU')}`,
    sub: (v) => `${faceitLevel(v)} lvl${faceitToNext(v) != null ? ` · до ${faceitLevel(v) + 1} lvl: ${faceitToNext(v)} ELO` : ''}`,
  },
  deadlock: { title: 'Deadlock · ранг', unit: '', fmt: (v) => deadlockName(v), sub: () => 'Obscurus → Eternus' },
};

function rankEntryModal(key, entry) {
  const isNew = !entry;
  const deadlock = key === 'deadlock';
  const fields = deadlock
    ? [
        { key: 'tier', label: 'Ранг', type: 'select', options: DEADLOCK_TIERS.map((t, i) => [i, t]), half: true },
        { key: 'sub', label: 'Подранг', type: 'select', options: [1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]), half: true },
      ]
    : [{ key: 'value', label: key === 'dota' ? 'MMR' : 'FACEIT ELO', type: 'number', required: true, half: true }];
  const last = state.data.ranks[key].entries.at(-1);
  const init = entry || {};
  const v = deadlock ? { tier: Math.floor((init.value ?? last?.value ?? 0) / 6), sub: ((init.value ?? last?.value ?? 0) % 6) + 1 } : { value: init.value ?? '' };
  formModal(
    `${TRACKS[key].title}${isNew ? ' — записать' : ''}`,
    [...fields, { key: 'date', label: 'Дата', type: 'date', half: !deadlock }, { key: 'note', label: 'Заметка: что получилось, что улучшить', type: 'textarea', rows: 3 }],
    { ...v, date: init.date || today(), note: init.note || '' },
    {
      onSave: (x) => {
        const value = deadlock ? deadlockValue(Number(x.tier), Number(x.sub)) : x.value;
        if (value == null || Number.isNaN(value)) return false;
        update((d) => {
          const list = d.ranks[key].entries;
          const rec = { id: init.id || uid(), date: x.date || today(), value, note: x.note };
          const i = list.findIndex((e) => e.id === rec.id);
          if (i >= 0) list[i] = rec;
          else list.push(rec);
          list.sort((a, b) => a.date.localeCompare(b.date));
        });
      },
      onDelete: isNew ? null : () => update((d) => (d.ranks[key].entries = d.ranks[key].entries.filter((e) => e.id !== init.id))),
    },
  );
}

function rankGoalModal(key) {
  const goal = state.data.ranks[key].goal;
  const deadlock = key === 'deadlock';
  formModal(
    `Цель: ${TRACKS[key].title}`,
    deadlock
      ? [
          { key: 'tier', label: 'Ранг', type: 'select', options: DEADLOCK_TIERS.map((t, i) => [i, t]), half: true },
          { key: 'sub', label: 'Подранг', type: 'select', options: [1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]), half: true },
        ]
      : [{ key: 'value', label: key === 'dota' ? 'Цель по MMR' : 'Цель по ELO', type: 'number' }],
    deadlock ? { tier: goal != null ? Math.floor(goal / 6) : 11, sub: goal != null ? (goal % 6) + 1 : 1 } : { value: goal ?? '' },
    {
      onSave: (x) => update((d) => (d.ranks[key].goal = deadlock ? deadlockValue(Number(x.tier), Number(x.sub)) : x.value > 0 ? x.value : null)),
      onDelete: goal != null ? () => update((d) => (d.ranks[key].goal = null)) : null,
    },
  );
}

function rankCard(key) {
  const t = TRACKS[key];
  const { goal, entries } = state.data.ranks[key];
  const p = rankProgress(entries, goal, today());
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const delta = (v) => (key === 'deadlock' ? `${v > 0 ? '+' : ''}${v} подр.` : `${v > 0 ? '+' : ''}${Math.round(v)} ${t.unit}`);
  return card(
    t.title,
    h('div', { class: 'row' }, h('button', { class: 'btn ghost sm', onclick: () => rankGoalModal(key) }, 'Цель'), h('button', { class: 'btn primary sm', onclick: () => rankEntryModal(key) }, icon('plus', 14), 'Записать')),
    p.current == null
      ? empty(key === 'deadlock' ? 'Запиши свой ранг — можно поставить цель Eternus.' : `Запиши текущий ${t.unit} — после каждой сессии или раз в неделю.`)
      : [
          h('div', { class: 'stat-value' }, t.fmt(p.current)),
          h('div', { class: 'muted' }, t.sub(p.current)),
          h(
            'div',
            { class: 'meta', style: { margin: '6px 0 10px' } },
            [p.change30 != null && `за 30 дней: ${delta(p.change30)}`, goal != null && (p.toGoal <= 0 ? `🎯 цель ${t.fmt(goal)} достигнута` : `до цели ${t.fmt(goal)}: ${key === 'deadlock' ? `${p.toGoal} подр.` : `${Math.round(p.toGoal)} ${t.unit}`}`)].filter(Boolean).join(' · ') || 'добавь ещё записи — появится динамика',
          ),
          sorted.length > 1 &&
            lineChart({
              points: sorted.map((e) => ({ label: e.date.slice(8, 10) + '.' + e.date.slice(5, 7), value: e.value, tip: `${prettyDate(e.date)}\n${t.fmt(e.value)}${e.note ? `\n${e.note.slice(0, 60)}` : ''}` })),
              height: 170,
              width: 380,
              format: key === 'deadlock' ? (v) => deadlockName(v).split(' ')[0] : (v) => compact(v),
              labelEvery: Math.ceil(sorted.length / 6),
            }),
          h(
            'div',
            { class: 'list', style: { marginTop: '8px' } },
            [...sorted]
              .reverse()
              .slice(0, 4)
              .map((e) =>
                h(
                  'div',
                  { class: 'list-row', style: { cursor: 'pointer' }, onclick: () => rankEntryModal(key, e) },
                  h('div', { class: 'grow' }, h('div', { class: 'title' }, t.fmt(e.value)), e.note && h('div', { class: 'meta' }, e.note)),
                  h('div', { class: 'meta' }, prettyDate(e.date)),
                ),
              ),
          ),
        ],
  );
}

function ranksTab() {
  const notes = ['dota', 'faceit', 'deadlock'].flatMap((k) => state.data.ranks[k].entries.filter((e) => e.note).map((e) => `- ${TRACKS[k].title}, ${e.date}: ${e.note}`));
  return [
    h('div', { class: 'grid cols-3', style: { alignItems: 'start' } }, rankCard('dota'), rankCard('faceit'), rankCard('deadlock')),
    notes.length > 0 &&
      h(
        'div',
        { class: 'row', style: { marginTop: '16px' } },
        h(
          'button',
          {
            class: 'btn',
            onclick: () =>
              go('grok', {
                prompt: `Вот мои заметки после игр (Dota 2, CS2 FACEIT, Deadlock):\n${notes.slice(-30).join('\n')}\n\nНайди повторяющиеся ошибки и дай план тренировок на 2 недели для каждой игры — коротко и конкретно.`,
              }),
          },
          icon('spark', 16),
          'Grok: что я повторяю из игры в игру',
        ),
      ),
  ];
}

// ---- clips ----

function clipModal(c) {
  const isNew = !c;
  formModal(
    isNew ? 'Новый клип' : c.title,
    [
      { key: 'title', label: 'Название / хук', required: true, placeholder: 'Например, «Хук через всю карту»' },
      { key: 'game', label: 'Игра', list: ['Dota 2', 'CS2', 'Deadlock'], half: true },
      { key: 'status', label: 'Статус', type: 'select', options: CLIP_STATUSES, half: true },
      { key: 'idea', label: 'Идея, момент из игры, текст на экране', type: 'textarea', rows: 3 },
      { key: 'tiktok', label: 'Просмотры TikTok', type: 'number', half: true },
      { key: 'shorts', label: 'Просмотры Shorts', type: 'number', half: true },
      { key: 'youtube', label: 'Просмотры YouTube', type: 'number', half: true },
      { key: 'date', label: 'Дата публикации', type: 'date', half: true },
      { key: 'link', label: 'Ссылка на ролик' },
    ],
    { title: '', game: 'Dota 2', status: 'idea', idea: '', date: '', link: '', ...(c || {}), ...(c?.views || {}) },
    {
      onSave: (v) =>
        update((d) => {
          const rec = {
            id: c?.id || uid(),
            title: v.title,
            game: v.game,
            status: v.status,
            idea: v.idea,
            link: v.link,
            date: v.status === 'published' ? v.date || c?.date || today() : v.date,
            views: { tiktok: v.tiktok || 0, shorts: v.shorts || 0, youtube: v.youtube || 0 },
          };
          const i = d.clips.findIndex((x) => x.id === rec.id);
          if (i >= 0) d.clips[i] = rec;
          else d.clips.push(rec);
        }),
      onDelete: isNew ? null : () => update((d) => (d.clips = d.clips.filter((x) => x.id !== c.id))),
    },
  );
}

function moveClip(c, dir) {
  const idx = CLIP_STATUSES.findIndex(([k]) => k === c.status);
  const next = CLIP_STATUSES[Math.min(CLIP_STATUSES.length - 1, Math.max(0, idx + dir))][0];
  update((d) => {
    const x = d.clips.find((y) => y.id === c.id);
    x.status = next;
    if (next === 'published' && !x.date) x.date = today();
  });
}

function scriptPrompt(c) {
  return (
    `Помоги сделать короткий вертикальный ролик (TikTok / Shorts) из момента в ${c.game}: «${c.title}». ${c.idea ? `Что было: ${c.idea}. ` : ''}` +
    'Дай: 3 варианта хука на первые 2 секунды, текст на экране по секундам, идею для звука/мема, описание и 8 хештегов. Ролик до 30 секунд.'
  );
}

function clipsTab() {
  const clips = state.data.clips;
  const st = clipStats(clips);
  return [
    h(
      'div',
      { class: 'grid cols-4', style: { marginBottom: '16px' } },
      tile('Просмотров всего', compact(st.total), `${st.published} опубликовано · в среднем ${compact(st.avg)}`, true),
      ...PLATFORMS.map(([k, label]) => tile(label, compact(st.byPlatform[k]), st.best && clipViews(st.best) ? null : 'просмотры вписываются в клип')),
    ),
    h(
      'div',
      { class: 'kanban kanban-4', style: { marginBottom: '16px' } },
      CLIP_STATUSES.map(([k, label], idx) => {
        const list = clips.filter((c) => c.status === k).sort((a, b) => (k === 'published' ? clipViews(b) - clipViews(a) : 0));
        return h(
          'div',
          { class: 'kanban-col' },
          h('div', { class: 'kanban-head' }, h('span', {}, label), h('span', { class: 'muted' }, String(list.length))),
          list.map((c) =>
            h(
              'div',
              { class: 'kanban-card' },
              h(
                'div',
                { style: { cursor: 'pointer' }, onclick: () => clipModal(c) },
                h('div', { class: 'title', style: { fontWeight: 600 } }, c.title),
                h('div', { class: 'row', style: { gap: '6px', marginTop: '6px', flexWrap: 'wrap' } }, h('span', { class: 'badge' }, c.game || 'Игра'), k === 'published' && h('span', { class: 'badge solid' }, `${compact(clipViews(c))} просм.`)),
              ),
              h(
                'div',
                { class: 'row', style: { gap: '2px', marginTop: '8px' } },
                idx > 0 && h('button', { class: 'btn ghost sm icon-only', title: 'Назад', onclick: () => moveClip(c, -1) }, icon('left', 14)),
                h('div', { class: 'spacer' }),
                k !== 'published' && h('button', { class: 'btn ghost sm', title: 'Сценарий с Grok', onclick: () => go('grok', { prompt: scriptPrompt(c) }) }, icon('spark', 13), 'Сценарий'),
                c.link && h('a', { class: 'btn ghost sm icon-only', href: c.link, target: '_blank', title: 'Открыть ролик' }, icon('up', 14)),
                idx < CLIP_STATUSES.length - 1 && h('button', { class: 'btn ghost sm icon-only', title: 'Дальше', onclick: () => moveClip(c, 1) }, icon('right', 14)),
              ),
            ),
          ),
          k === 'idea' && h('button', { class: 'btn ghost sm', style: { width: '100%' }, onclick: () => clipModal(null) }, icon('plus', 14), 'Идея'),
        );
      }),
    ),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn',
          onclick: () =>
            go('grok', {
              prompt:
                'Я играю в Dota 2, CS2 и Deadlock и хочу снимать короткие ролики (TikTok, Shorts) и длинные на YouTube. ' +
                `Уже было: ${clips.map((c) => `${c.title} (${c.game}, ${compact(clipViews(c))} просм.)`).join('; ') || 'пока ничего'}. ` +
                'Предложи 15 идей роликов с хуками, какие форматы сейчас заходят, как часто выкладывать и как привести зрителей в мой Telegram-канал.',
            }),
        },
        icon('spark', 16),
        'Grok: идеи роликов',
      ),
    ),
  ];
}

// ---- page ----

export function gamesView() {
  const body = tab === 'ranks' ? ranksTab() : tab === 'clips' ? clipsTab() : wishlistTab();
  return h(
    'div',
    { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Игры'), h('div', { class: 'sub' }, 'Вишлист Steam со скидками, ранги и ролики из игр'))),
    h(
      'div',
      { class: 'seg', style: { marginBottom: '18px' } },
      TABS.map(([k, label]) => h('button', { class: tab === k ? 'on' : '', onclick: () => ((tab = k), rerender()) }, label)),
    ),
    ...body,
  );
}

/** Small summary for the home screen. */
export function gamesCard() {
  const s = wishlistSummary(state.data.wishlist);
  const r = state.data.ranks;
  const last = (k) => r[k].entries.at(-1)?.value;
  const open = (t) => () => {
    tab = t;
    go('games');
  };
  const line = (label, value, onclick) => h('div', { class: 'list-row', style: { cursor: 'pointer' }, onclick }, h('div', { class: 'grow meta' }, label), h('div', { class: 'amount' }, value));
  return card(
    'Игры',
    h('button', { class: 'btn ghost sm', onclick: () => go('games') }, 'Открыть', icon('right', 14)),
    h(
      'div',
      { class: 'list' },
      line('Скидки в вишлисте', state.data.wishlist.length ? (s.onSale ? `${s.onSale} 🔥` : 'нет') : '—', open('wishlist')),
      line('Dota 2 MMR', last('dota') != null ? Math.round(last('dota')).toLocaleString('ru-RU') : '—', open('ranks')),
      line('FACEIT', last('faceit') != null ? `${Math.round(last('faceit'))} · ${faceitLevel(last('faceit'))} lvl` : '—', open('ranks')),
      line('Deadlock', last('deadlock') != null ? deadlockName(last('deadlock')) : '—', open('ranks')),
    ),
  );
}
