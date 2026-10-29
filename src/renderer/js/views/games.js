// Games: Steam wishlist with live prices and discounts, rank tracking (Dota MMR, FACEIT ELO, Deadlock rank) and a
// pipeline for game clips (TikTok / Shorts / YouTube) with views.
import { state, update, rerender } from '../state.js';
import { h, icon, money, compact, uid, card, empty, toast } from '../ui.js';
import { t, num, locale } from '../i18n.js';
import { openModal, formModal } from '../modal.js';
import { lineChart } from '../charts.js';
import { today, prettyDate } from '../dates.js';
import { convert } from '../planner-calc.js';
import { CAT } from '../finance-calc.js';
import {
  parseSteamAppId,
  applyPrice,
  STEAM_CURRENCY,
  wishlistSummary,
  dotaMedal,
  MEDAL_KEYS,
  faceitLevel,
  faceitToNext,
  DEADLOCK_TIERS,
  deadlockValue,
  deadlockName,
  rankProgress,
  parseRankInput,
  CLIP_STATUSES,
  PLATFORMS,
  clipViews,
  clipStats,
} from '../games-calc.js';
import { go } from '../app.js';

let tab = 'wishlist';
let refreshing = false;

const TABS = ['wishlist', 'ranks', 'clips'];

// Prices come from the Ukrainian Steam store (₴); older items may still be in another currency.
const fmtPrice = (v, cur = '₴') => `${(Math.round(v * 100) / 100).toLocaleString(locale(), { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })} ${cur}`;
const toMain = (v, cur = '₴') => convert(v, cur, state.data.settings.currency, state.data.rates);
/** Store price, plus the main currency next to it when they differ. */
const priceText = (v, cur = '₴') => (cur === state.data.settings.currency ? fmtPrice(v, cur) : `${fmtPrice(v, cur)} ≈ ${money(toMain(v, cur))}`);
const isPlaceholderName = (name) => !name || /^App \d+$/.test(name);
// Names are looked up once per session, so a game Steam doesn't know isn't requested on every render.
const triedNames = new Set();
const medalName = (mmr) => dotaMedal(mmr, MEDAL_KEYS.map((k) => t(`medal.${k}`)));
const clipStatusLabel = (k) => t(`clip.status.${k}`);

/** Full info for one game: real name, capsule image and price (used for links and old placeholder names). */
async function fetchApp(id) {
  const res = await window.api.steam.app(id);
  return res.ok ? res : null;
}

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
    if (!silent) toast(t('games.steamDown'));
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
  for (const i of state.data.wishlist.filter((x) => isPlaceholderName(x.name) && !triedNames.has(x.id))) {
    triedNames.add(i.id);
    const info = await fetchApp(i.id);
    if (info) update((d) => Object.assign(d.wishlist.find((x) => x.id === i.id), { name: info.name, image: info.image || i.image }));
  }
  if (!silent) toast(t('games.pricesUpdated'));
  else if (newSales) toast(t('games.newSales', { n: newSales }));
}

async function addGame(id, name, image) {
  if (state.data.wishlist.some((i) => i.id === id)) return toast(t('games.already'));
  const info = await fetchApp(id);
  if (!info && !name) return toast(t('games.notFound'));
  const item = {
    id,
    name: info?.name || name,
    image: info?.image || image || `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/capsule_231x87.jpg`,
    target: null,
    history: [],
    addedAt: today(),
  };
  update((d) => d.wishlist.push(info ? applyPrice(item, info.overview, today()) : item));
  toast(t('games.added', { name: item.name }));
}

function searchModal() {
  const input = h('input', { class: 'input', placeholder: t('games.searchPh') });
  const results = h('div', { class: 'list search-results' });
  let timer;
  const search = async () => {
    const q = input.value.trim();
    const appId = parseSteamAppId(q);
    if (appId) {
      results.replaceChildren(h('div', { class: 'list-row', style: { cursor: 'pointer' }, onclick: () => (addGame(appId, null), modal.close()) }, h('div', { class: 'grow' }, t('games.addById', { id: appId }))));
      return;
    }
    if (q.length < 2) return results.replaceChildren();
    results.replaceChildren(h('p', { class: 'muted' }, t('games.searching')));
    const res = await window.api.steam.search(q);
    if (input.value.trim() !== q) return;
    if (!res.ok) return results.replaceChildren(h('p', { class: 'muted' }, t('games.steamNoAnswer')));
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
              h('div', { class: 'meta' }, it.price ? fmtPrice(it.price.final / 100, STEAM_CURRENCY[it.price.currency]) : t('games.free')),
            ),
          )
        : [h('p', { class: 'muted' }, t('common.nothingFound'))]),
    );
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, 350);
  });
  const modal = openModal(t('games.addTitle'), h('div', { class: 'stack', style: { gap: '10px' } }, input, results));
}

function targetModal(item) {
  formModal(
    item.name,
    [{ key: 'target', label: t('games.targetLabel', { cur: item.currency || '₴' }), type: 'number', placeholder: t('games.targetPh') }],
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
          i.lowest != null && i.history?.length > 1 && t('games.lowest', { price: fmtPrice(i.lowest, i.currency) }),
          i.target > 0 && (hit ? t('games.targetHit', { price: fmtPrice(i.target, i.currency) }) : t('games.target', { price: fmtPrice(i.target, i.currency) })),
          i.updatedAt && t('games.checked', { date: prettyDate(i.updatedAt) }),
        ]
          .filter(Boolean)
          .join(' · '),
      ),
    ),
    i.boughtAt && h('span', { class: 'badge', title: prettyDate(i.boughtAt) }, t('games.bought')),
    i.discount > 0 && h('span', { class: 'badge solid' }, `−${i.discount}%`),
    h(
      'div',
      { style: { textAlign: 'right', minWidth: '96px' } },
      i.price == null ? h('div', { class: 'meta' }, t('games.noPrice')) : [i.discount > 0 && h('div', { class: 'meta strike' }, fmtPrice(i.initial, i.currency)), h('div', { class: 'amount' }, priceText(i.price, i.currency))],
    ),
    h('button', { class: 'btn ghost sm icon-only', title: t('games.targetHint'), onclick: () => targetModal(i) }, icon('edit', 15)),
    h('a', { class: 'btn ghost sm icon-only', title: t('games.openSteam'), href: `https://store.steampowered.com/app/${i.id}/`, target: '_blank' }, icon('up', 15)),
  );
}

function wishlistTab() {
  const items = state.data.wishlist;
  if (items.some((i) => i.updatedAt !== today() || (i.price != null && i.currency !== '₴') || (isPlaceholderName(i.name) && !triedNames.has(i.id)))) setTimeout(() => refreshPrices({ silent: true }), 0);
  const s = wishlistSummary(items, toMain);
  const sorted = [...items].sort((a, b) => (b.discount || 0) - (a.discount || 0) || (a.price ?? 1e9) - (b.price ?? 1e9));
  const gamesBudget = state.data.budgets[CAT.games];
  return [
    h(
      'div',
      { class: 'grid cols-4 gap-b' },
      tile(t('games.onSale'), String(s.onSale), s.onSale ? t('games.saving', { amount: money(s.saving) }) : t('games.noSales'), true),
      tile(t('games.atTarget'), String(s.atTarget), t('games.setTarget')),
      tile(t('games.whole'), money(s.total), t('games.wholeNote', { n: items.length })),
      tile(t('games.budget'), money(gamesBudget || 0), gamesBudget ? t('games.budgetNote') : t('games.budgetSet')),
    ),
    card(
      t('games.wishlist'),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn sm', disabled: refreshing || !items.length, onclick: () => refreshPrices() }, icon('refresh', 14), refreshing ? t('games.checking') : t('games.prices')),
        h('button', { class: 'btn primary sm', onclick: searchModal }, icon('plus', 14), t('games.game')),
      ),
      items.length ? h('div', { class: 'list' }, sorted.map(wishRow)) : empty(t('games.wishEmpty')),
    ),
  ];
}

// ---- ranks ----

const TRACKS = {
  dota: { title: () => 'Dota 2 · MMR', unit: 'MMR', fmt: (v) => num(Math.round(v)), sub: (v) => `≈ ${medalName(v)}` },
  faceit: {
    title: () => 'CS2 · FACEIT',
    unit: 'ELO',
    fmt: (v) => num(Math.round(v)),
    sub: (v) => `${faceitLevel(v)} lvl${faceitToNext(v) != null ? ` · ${t('games.toLevel', { level: faceitLevel(v) + 1, elo: faceitToNext(v) })}` : ''}`,
  },
  deadlock: { title: () => t('games.deadlockTitle'), unit: '', fmt: (v) => deadlockName(v), sub: () => 'Obscurus → Eternus' },
};

function rankEntryModal(key, entry) {
  const isNew = !entry;
  const deadlock = key === 'deadlock';
  const fields = deadlock
    ? [
        { key: 'tier', label: t('games.rank'), type: 'select', options: DEADLOCK_TIERS.map((x, i) => [i, x]), half: true },
        { key: 'sub', label: t('games.subrank'), type: 'select', options: [1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]), half: true },
      ]
    : [{ key: 'value', label: key === 'dota' ? 'MMR' : 'FACEIT ELO', type: 'number', required: true, half: true }];
  const last = state.data.ranks[key].entries.at(-1);
  const init = entry || {};
  const v = deadlock ? { tier: Math.floor((init.value ?? last?.value ?? 0) / 6), sub: ((init.value ?? last?.value ?? 0) % 6) + 1 } : { value: init.value ?? '' };
  formModal(
    `${TRACKS[key].title()}${isNew ? ` — ${t('games.record')}` : ''}`,
    [...fields, { key: 'date', label: t('common.date'), type: 'date', half: !deadlock }, { key: 'note', label: t('games.noteLabel'), type: 'textarea', rows: 3 }],
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
    t('games.goalOf', { title: TRACKS[key].title() }),
    deadlock
      ? [
          { key: 'tier', label: t('games.rank'), type: 'select', options: DEADLOCK_TIERS.map((x, i) => [i, x]), half: true },
          { key: 'sub', label: t('games.subrank'), type: 'select', options: [1, 2, 3, 4, 5, 6].map((n) => [n, String(n)]), half: true },
        ]
      : [{ key: 'value', label: t('games.goalValue', { unit: key === 'dota' ? 'MMR' : 'ELO' }), type: 'number' }],
    deadlock ? { tier: goal != null ? Math.floor(goal / 6) : 11, sub: goal != null ? (goal % 6) + 1 : 1 } : { value: goal ?? '' },
    {
      onSave: (x) => update((d) => (d.ranks[key].goal = deadlock ? deadlockValue(Number(x.tier), Number(x.sub)) : x.value > 0 ? x.value : null)),
      onDelete: goal != null ? () => update((d) => (d.ranks[key].goal = null)) : null,
    },
  );
}

/** Saves today's value (replacing an entry from today, keeping its note). */
function saveToday(key, value) {
  update((d) => {
    const list = d.ranks[key].entries;
    const i = list.findIndex((e) => e.date === today());
    if (i >= 0) list[i] = { ...list[i], value };
    else list.push({ id: uid(), date: today(), value, note: '' });
    list.sort((a, b) => a.date.localeCompare(b.date));
  });
  toast(t('games.saved'));
}

// The rank card whose current value is being edited in place (click on the big number).
let editingRank = null;

/**
 * Top of a rank card: the big current value and, in one line, an amount with − and + (Enter = +). Clicking the
 * value edits it in place («Set»). Deadlock: tier and subrank in one line with Save.
 */
function rankTop(key) {
  const tr = TRACKS[key];
  const last = state.data.ranks[key].entries.at(-1)?.value;
  if (key === 'deadlock') {
    const cur = last ?? 0;
    const tier = h('select', { class: 'input', title: t('games.rank') }, DEADLOCK_TIERS.map((name, i) => h('option', { value: i, selected: i === Math.floor(cur / 6) ? 'selected' : null }, name)));
    const sub = h('select', { class: 'input sub-pick', title: t('games.subrank') }, [1, 2, 3, 4, 5, 6].map((n) => h('option', { value: n, selected: n === (cur % 6) + 1 ? 'selected' : null }, String(n))));
    return [
      last != null && h('div', { class: 'rank-top' }, h('div', { class: 'rank-value', style: { cursor: 'default' } }, tr.fmt(last))),
      h(
        'form',
        { class: 'rank-top', onsubmit: (e) => (e.preventDefault(), saveToday(key, deadlockValue(Number(tier.value), Number(sub.value)))) },
        tier,
        sub,
        h('button', { class: 'btn primary', type: 'submit' }, t('common.save')),
      ),
    ];
  }
  const input = h('input', { class: 'input', inputmode: 'numeric', placeholder: last != null ? t('games.amountPh') : t('games.currentUnit', { unit: tr.unit }) });
  /** mode: 'add' | 'sub' | 'set'. A typed «+25» / «−25» also works with either button. */
  const apply = (mode, field = input) => {
    const raw = field.value.trim();
    const signed = /^[+−-]/.test(raw);
    const amount = parseRankInput(raw.replace(/^[+−-]/, ''), null);
    if (amount == null) {
      toast(t('games.enterNumber'));
      return field.focus();
    }
    let value;
    if (mode === 'set' && !signed) value = amount;
    else if (last == null) {
      toast(t('games.setCurrentFirst', { unit: tr.unit }));
      return field.focus();
    } else value = parseRankInput(signed ? raw : `${mode === 'sub' ? '-' : '+'}${amount}`, last);
    editingRank = null;
    saveToday(key, value);
  };
  if (last == null) {
    return h('form', { class: 'rank-top', onsubmit: (e) => (e.preventDefault(), apply('set')) }, input, h('button', { class: 'btn primary', type: 'submit' }, t('common.save')));
  }
  if (editingRank === key) {
    const field = h('input', {
      class: 'input rank-set',
      inputmode: 'numeric',
      value: String(Math.round(last)),
      onkeydown: (e) => e.key === 'Escape' && ((editingRank = null), rerender()),
    });
    setTimeout(() => (field.focus(), field.select()), 0);
    return h(
      'form',
      { class: 'rank-top', onsubmit: (e) => (e.preventDefault(), apply('set', field)) },
      field,
      h('button', { class: 'btn primary', type: 'submit', title: t('games.setHint') }, t('games.setBtn')),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => ((editingRank = null), rerender()) }, t('common.cancel')),
    );
  }
  return h(
    'form',
    { class: 'rank-top', onsubmit: (e) => (e.preventDefault(), apply('add')) },
    h('button', { class: 'rank-value', type: 'button', title: t('games.setHint'), onclick: () => ((editingRank = key), rerender()) }, tr.fmt(last)),
    input,
    h('button', { class: 'btn', type: 'button', title: t('games.subHint'), onclick: () => apply('sub') }, '−'),
    h('button', { class: 'btn primary', type: 'submit', title: t('games.addHint') }, '+'),
  );
}

function rankCard(key) {
  const tr = TRACKS[key];
  const { goal, entries } = state.data.ranks[key];
  const p = rankProgress(entries, goal, today());
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const subranks = (v) => t('games.subranks', { v });
  const delta = (v) => (key === 'deadlock' ? subranks(`${v > 0 ? '+' : ''}${v}`) : `${v > 0 ? '+' : ''}${Math.round(v)} ${tr.unit}`);
  return card(
    tr.title(),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn ghost sm', title: t('games.goal'), onclick: () => rankGoalModal(key) }, goal != null ? t('games.goalShort', { v: tr.fmt(goal) }) : t('games.setGoal')),
      h('button', { class: 'btn ghost sm icon-only', title: t('games.entryHint'), onclick: () => rankEntryModal(key) }, icon('edit', 14)),
    ),
    rankTop(key),
    p.current == null
      ? empty(goal != null ? t('games.goalNoCurrent', { goal: tr.fmt(goal), what: key === 'deadlock' ? t('games.rankWord') : tr.unit }) : t('games.enterCurrent'))
      : [
          h('div', { class: 'muted rank-sub' }, tr.sub(p.current)),
          h(
            'div',
            { class: 'meta', style: { margin: '0 0 8px' } },
            [
              p.change30 != null && t('games.change30', { v: delta(p.change30) }),
              goal != null && (p.toGoal <= 0 ? t('games.goalHit', { goal: tr.fmt(goal) }) : t('games.toGoal', { goal: tr.fmt(goal), left: key === 'deadlock' ? subranks(p.toGoal) : `${Math.round(p.toGoal)} ${tr.unit}` })),
            ]
              .filter(Boolean)
              .join(' · ') || t('games.moreEntries'),
          ),
          sorted.length > 1 &&
            lineChart({
              points: sorted.map((e) => ({ label: e.date.slice(8, 10) + '.' + e.date.slice(5, 7), value: e.value, tip: `${prettyDate(e.date)}\n${tr.fmt(e.value)}${e.note ? `\n${e.note.slice(0, 60)}` : ''}` })),
              height: 170,
              width: 380,
              format: key === 'deadlock' ? (v) => deadlockName(v).split(' ')[0] : (v) => compact(v),
              // One tick per Deadlock tier, so a tier name never repeats on the axis.
              step: key === 'deadlock' ? 6 : null,
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
                  h('div', { class: 'grow' }, h('div', { class: 'title' }, tr.fmt(e.value)), e.note && h('div', { class: 'meta' }, e.note)),
                  h('div', { class: 'meta' }, prettyDate(e.date)),
                ),
              ),
          ),
        ],
  );
}

function ranksTab() {
  const notes = ['dota', 'faceit', 'deadlock'].flatMap((k) => state.data.ranks[k].entries.filter((e) => e.note).map((e) => `- ${TRACKS[k].title()}, ${e.date}: ${e.note}`));
  return [
    h('div', { class: 'grid cols-3', style: { alignItems: 'start' } }, rankCard('dota'), rankCard('faceit'), rankCard('deadlock')),
    notes.length > 0 &&
      h(
        'div',
        { class: 'row gap-t' },
        h('button', { class: 'btn', onclick: () => go('grok', { prompt: t('prompt.gameNotes', { notes: notes.slice(-30).join('\n') }) }) }, icon('spark', 16), t('games.grokRepeat')),
      ),
  ];
}

// ---- clips ----

function clipModal(c) {
  const isNew = !c;
  formModal(
    isNew ? t('clips.new') : c.title,
    [
      { key: 'title', label: t('clips.title'), required: true, placeholder: t('clips.titlePh') },
      { key: 'game', label: t('clips.game'), list: ['Dota 2', 'CS2', 'Deadlock'], half: true },
      { key: 'status', label: t('common.status'), type: 'select', options: CLIP_STATUSES.map(([k]) => [k, clipStatusLabel(k)]), half: true },
      { key: 'idea', label: t('clips.idea'), type: 'textarea', rows: 3 },
      { key: 'tiktok', label: t('clips.viewsOf', { platform: 'TikTok' }), type: 'number', half: true },
      { key: 'shorts', label: t('clips.viewsOf', { platform: 'Shorts' }), type: 'number', half: true },
      { key: 'youtube', label: t('clips.viewsOf', { platform: 'YouTube' }), type: 'number', half: true },
      { key: 'date', label: t('clips.date'), type: 'date', half: true },
      { key: 'link', label: t('clips.link') },
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
  return t('prompt.clip', { game: c.game, title: c.title, idea: c.idea ? t('prompt.clipIdea', { idea: c.idea }) : '' });
}

function clipsTab() {
  const clips = state.data.clips;
  const st = clipStats(clips);
  return [
    h(
      'div',
      { class: 'grid cols-4 gap-b' },
      tile(t('clips.totalViews'), compact(st.total), t('clips.publishedAvg', { n: st.published, avg: compact(st.avg) }), true),
      ...PLATFORMS.map(([k, label]) => tile(label, compact(st.byPlatform[k]), st.best && clipViews(st.best) ? null : t('clips.viewsHint'))),
    ),
    h(
      'div',
      { class: 'kanban kanban-4 gap-b' },
      CLIP_STATUSES.map(([k], idx) => {
        const list = clips.filter((c) => c.status === k).sort((a, b) => (k === 'published' ? clipViews(b) - clipViews(a) : 0));
        return h(
          'div',
          { class: 'kanban-col' },
          h('div', { class: 'kanban-head' }, h('span', {}, clipStatusLabel(k)), h('span', { class: 'muted' }, String(list.length))),
          list.map((c) =>
            h(
              'div',
              { class: 'kanban-card' },
              h(
                'div',
                { style: { cursor: 'pointer' }, onclick: () => clipModal(c) },
                h('div', { class: 'title', style: { fontWeight: 600 } }, c.title),
                h('div', { class: 'row', style: { gap: '6px', marginTop: '6px', flexWrap: 'wrap' } }, h('span', { class: 'badge' }, c.game || t('clips.game')), k === 'published' && h('span', { class: 'badge solid' }, t('clips.viewsShort', { v: compact(clipViews(c)) }))),
              ),
              h(
                'div',
                { class: 'row', style: { gap: '2px', marginTop: '8px' } },
                idx > 0 && h('button', { class: 'btn ghost sm icon-only', title: t('clips.back'), onclick: () => moveClip(c, -1) }, icon('left', 14)),
                h('div', { class: 'spacer' }),
                k !== 'published' && h('button', { class: 'btn ghost sm', title: t('clips.scriptHint'), onclick: () => go('grok', { prompt: scriptPrompt(c) }) }, icon('spark', 13), t('clips.script')),
                c.link && h('a', { class: 'btn ghost sm icon-only', href: c.link, target: '_blank', title: t('clips.open') }, icon('up', 14)),
                idx < CLIP_STATUSES.length - 1 && h('button', { class: 'btn ghost sm icon-only', title: t('clips.next'), onclick: () => moveClip(c, 1) }, icon('right', 14)),
              ),
            ),
          ),
          k === 'idea' && h('button', { class: 'btn ghost sm', style: { width: '100%' }, onclick: () => clipModal(null) }, icon('plus', 14), t('clips.idea1')),
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
              prompt: t('prompt.clipIdeas', { list: clips.map((c) => `${c.title} (${c.game}, ${t('clips.viewsShort', { v: compact(clipViews(c)) })})`).join('; ') || t('prompt.nothingYet') }),
            }),
        },
        icon('spark', 16),
        t('clips.grokIdeas'),
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
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, t('nav.games')), h('div', { class: 'sub' }, t('games.sub')))),
    h(
      'div',
      { class: 'seg gap-b' },
      TABS.map((k) => h('button', { class: tab === k ? 'on' : '', 'data-tab': k, onclick: () => ((tab = k), rerender()) }, t(`games.tab.${k}`))),
    ),
    ...body,
  );
}

/** Small summary for the home screen. */
export function gamesCard() {
  const s = wishlistSummary(state.data.wishlist);
  const r = state.data.ranks;
  const last = (k) => r[k].entries.at(-1)?.value;
  const open = (x) => () => {
    tab = x;
    go('games');
  };
  const line = (label, value, onclick) => h('div', { class: 'list-row', style: { cursor: 'pointer' }, onclick }, h('div', { class: 'grow meta' }, label), h('div', { class: 'amount' }, value));
  return card(
    t('nav.games'),
    h('button', { class: 'btn ghost sm', onclick: () => go('games') }, t('common.open'), icon('right', 14)),
    h(
      'div',
      { class: 'list' },
      line(t('games.salesInWishlist'), state.data.wishlist.length ? (s.onSale ? `${s.onSale} 🔥` : t('common.no')) : '—', open('wishlist')),
      line('Dota 2 MMR', last('dota') != null ? num(Math.round(last('dota'))) : '—', open('ranks')),
      line('FACEIT', last('faceit') != null ? `${Math.round(last('faceit'))} · ${faceitLevel(last('faceit'))} lvl` : '—', open('ranks')),
      line('Deadlock', last('deadlock') != null ? deadlockName(last('deadlock')) : '—', open('ranks')),
    ),
  );
}
