// Pure helpers for the Games tab (unit-tested): Steam wishlist prices, Dota MMR / FACEIT / Deadlock ranks, game clips.

// ---- Steam wishlist ----

/** «https://store.steampowered.com/app/570/Dota_2/» or «570» → 570; anything else → null. */
export function parseSteamAppId(input) {
  const s = String(input || '').trim();
  const m = s.match(/store\.steampowered\.com\/app\/(\d+)/) || s.match(/^(\d{1,8})$/);
  return m ? Number(m[1]) : null;
}

/** Steam currency code → symbol used in the app. */
export const STEAM_CURRENCY = { UAH: '₴', EUR: '€', USD: '$' };

/**
 * Applies Steam's price_overview (cents) to a wishlist item: current/initial price, discount, one history point per
 * day and the lowest price seen. A free or unreleased game (no overview) keeps price null. When the currency changes
 * (another store region), history and the target price start over.
 */
export function applyPrice(item, overview, date) {
  if (!overview) return { ...item, price: null, initial: null, discount: 0, updatedAt: date };
  const price = overview.final / 100;
  const currency = STEAM_CURRENCY[overview.currency] || overview.currency || '₴';
  // A region switch changes the currency: older history would mix currencies, so it starts over.
  const history = (item.currency && item.currency !== currency ? [] : item.history || []).filter((h) => h.date !== date);
  history.push({ date, price });
  history.sort((a, b) => a.date.localeCompare(b.date));
  const lowest = Math.min(price, ...history.map((h) => h.price));
  const target = item.currency && item.currency !== currency ? null : item.target;
  return { ...item, price, currency, target, initial: overview.initial / 100, discount: overview.discount_percent || 0, lowest, history: history.slice(-180), updatedAt: date };
}

/** Totals; `toMain(amount, currency)` converts each game's price into one currency (identity by default). */
export function wishlistSummary(items, toMain = (v) => v) {
  const priced = items.filter((i) => i.price != null);
  return {
    total: priced.reduce((s, i) => s + toMain(i.price, i.currency), 0),
    saving: priced.reduce((s, i) => s + toMain(Math.max(0, (i.initial ?? i.price) - i.price), i.currency), 0),
    onSale: priced.filter((i) => i.discount > 0).length,
    atTarget: priced.filter((i) => i.target != null && i.target > 0 && i.price <= i.target).length,
  };
}

// ---- ranks ----

// Medal keys in order (Herald … Immortal); names come from the language files (medal.<key>).
export const MEDAL_KEYS = ['herald', 'guardian', 'crusader', 'archon', 'legend', 'ancient', 'divine', 'immortal'];
const MEDALS_RU = ['Рекрут', 'Страж', 'Рыцарь', 'Герой', 'Легенда', 'Властелин', 'Божество', 'Титан'];

/**
 * Approximate Dota medal for a solo MMR (≈154 MMR per star up to Ancient, 200 per Divine star, Immortal from 5620):
 * { medal: index into MEDAL_KEYS, star: 1–5 or null for Immortal }.
 */
export function dotaMedalParts(mmr) {
  const v = Number(mmr) || 0;
  if (v >= 5620) return { medal: 7, star: null };
  if (v >= 4620) return { medal: 6, star: Math.min(5, Math.floor((v - 4620) / 200) + 1) };
  const star = Math.floor(v / 154);
  return { medal: Math.min(5, Math.floor(star / 5)), star: (star % 5) + 1 };
}

/** Medal as text; `names` are the eight medal names (Russian by default). */
export function dotaMedal(mmr, names = MEDALS_RU) {
  const p = dotaMedalParts(mmr);
  return p.star == null ? names[p.medal] : `${names[p.medal]} ${p.star}`;
}

const FACEIT_LEVELS = [500, 750, 900, 1050, 1200, 1350, 1530, 1750, 2000];

/** FACEIT level (1–10) for an ELO. */
export function faceitLevel(elo) {
  const v = Number(elo) || 0;
  const i = FACEIT_LEVELS.findIndex((max) => v <= max);
  return i < 0 ? 10 : i + 1;
}

/** ELO left to the next FACEIT level (null at level 10). */
export function faceitToNext(elo) {
  const lvl = faceitLevel(elo);
  return lvl >= 10 ? null : FACEIT_LEVELS[lvl - 1] + 1 - elo;
}

export const DEADLOCK_TIERS = ['Obscurus', 'Initiate', 'Seeker', 'Acolyte', 'Sentinel', 'Mystic', 'Ritualist', 'Emissary', 'Oracle', 'Phantom', 'Ascendant', 'Eternus'];

/** Deadlock rank as one number for charts: tier 0–11 × 6 subranks (Eternus 6 = 71). */
export const deadlockValue = (tier, sub) => tier * 6 + (Math.min(6, Math.max(1, sub)) - 1);

export function deadlockName(value) {
  const v = Math.max(0, Math.round(value));
  const tier = Math.min(11, Math.floor(v / 6));
  return `${DEADLOCK_TIERS[tier]} ${(v % 6) + 1}`;
}

/**
 * MMR / ELO input: «3320» sets the value, «+25» / «-30» (also «−30») changes the current one.
 * Returns the new value or null for bad input (or a change with nothing to change yet).
 */
export function parseRankInput(text, current) {
  const s = String(text || '')
    .trim()
    .replace(/\s/g, '')
    .replace('−', '-')
    .replace(',', '.');
  const m = s.match(/^([+-])?(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const n = Number(m[2]);
  if (!m[1]) return n;
  if (current == null) return null;
  return Math.max(0, current + (m[1] === '-' ? -n : n));
}

/** Track numbers for a list of entries [{ date, value }]: current, change over 30 days, distance to goal. */
export function rankProgress(entries, goal, todayStr) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return { current: null, change30: null, toGoal: null, best: null };
  const current = sorted.at(-1).value;
  const monthAgo = new Date(new Date(`${todayStr}T12:00`).getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const base = [...sorted].reverse().find((e) => e.date <= monthAgo) || sorted[0];
  return {
    current,
    change30: base === sorted.at(-1) ? null : current - base.value,
    toGoal: goal != null ? goal - current : null,
    best: Math.max(...sorted.map((e) => e.value)),
  };
}

// ---- game clips (content) ----

export const CLIP_STATUSES = [
  ['idea', 'Идея'],
  ['record', 'Записать'],
  ['edit', 'Монтаж'],
  ['published', 'Опубликован'],
];
export const PLATFORMS = [
  ['tiktok', 'TikTok'],
  ['shorts', 'Shorts'],
  ['youtube', 'YouTube'],
];

export const clipViews = (c) => PLATFORMS.reduce((s, [k]) => s + (Number(c.views?.[k]) || 0), 0);

export function clipStats(clips) {
  const published = clips.filter((c) => c.status === 'published');
  const byPlatform = Object.fromEntries(PLATFORMS.map(([k]) => [k, published.reduce((s, c) => s + (Number(c.views?.[k]) || 0), 0)]));
  const total = Object.values(byPlatform).reduce((s, v) => s + v, 0);
  const best = [...published].sort((a, b) => clipViews(b) - clipViews(a))[0] || null;
  return { published: published.length, inWork: clips.length - published.length, total, byPlatform, avg: published.length ? total / published.length : 0, best };
}
