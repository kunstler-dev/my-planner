// Steam profile → OpenDota (medal from rank_tier, last matches, win rate) every 2 hours and by the button, and the
// public Steam wishlist imported on demand or daily. MMR stays manual: Valve doesn't publish the exact number.
import { state, update } from './state.js';
import { t } from './i18n.js';
import { toast } from './ui.js';
import { today } from './dates.js';
import { dotaAccountId, wishlistDiff, parseSteamProfile } from './games-calc.js';
import { refreshPrices } from './views/games.js';

const busy = new Set();
export const isGamesSyncing = (k) => busy.has(k);

async function guard(key, fn) {
  if (busy.has(key)) return;
  busy.add(key);
  update(() => {});
  try {
    return await fn();
  } finally {
    busy.delete(key);
    update(() => {});
  }
}

/** Profile link, custom URL name or SteamID64 → SteamID64 (resolving a name through Steam). */
export async function resolveSteamProfile(input) {
  const p = parseSteamProfile(input);
  if (!p) return { ok: false, error: 'bad_input' };
  if (p.id64) return { ok: true, id64: p.id64 };
  return window.api.steam.resolve(p.vanity);
}

/** Four OpenDota requests (profile, 30-day win/loss, recent matches, hero names once a week). */
export function syncDota({ silent = true } = {}) {
  return guard('dota', async () => {
    const account = dotaAccountId(state.data.settings.steamId);
    if (account == null) return;
    const get = (p) => window.api.opendota.get(p);
    const [profile, wl, recent] = [await get(`/players/${account}`), await get(`/players/${account}/wl?date=30`), await get(`/players/${account}/recentMatches`)];
    let heroes = state.data.dota.heroes;
    if (!Object.keys(heroes).length || Date.now() - (state.data.dota.heroesAt || 0) > 7 * 86400000) {
      const h = await get('/heroes');
      if (h.ok) heroes = Object.fromEntries(h.data.map((x) => [x.id, x.localized_name]));
    }
    const error = [profile, wl, recent].find((r) => !r.ok)?.error || '';
    if (error && !profile.ok) {
      update((d) => (d.dota = { ...d.dota, error }));
      if (!silent) toast(t('dota.failed'));
      return;
    }
    update(
      (d) =>
        (d.dota = {
          profile: profile.ok ? { name: profile.data.profile?.personaname || '', rankTier: profile.data.rank_tier ?? null, leaderboard: profile.data.leaderboard_rank ?? null } : d.dota.profile,
          wl: wl.ok ? { win: wl.data.win || 0, lose: wl.data.lose || 0 } : d.dota.wl,
          matches: recent.ok ? (recent.data || []).slice(0, 20).map((m) => ({ match_id: m.match_id, hero_id: m.hero_id, player_slot: m.player_slot, radiant_win: m.radiant_win, kills: m.kills, deaths: m.deaths, assists: m.assists, duration: m.duration, start_time: m.start_time })) : d.dota.matches,
          heroes,
          heroesAt: heroes === d.dota.heroes ? d.dota.heroesAt : Date.now(),
          fetchedAt: Date.now(),
          error,
        }),
    );
    if (!silent) toast(t('dota.updated'));
  });
}

/** Adds new games from the Steam wishlist (with prices); never deletes — games gone from Steam are only marked. */
export function importWishlist({ silent = true } = {}) {
  return guard('wishlist', async () => {
    const id64 = state.data.settings.steamId;
    if (!id64) return;
    const res = await window.api.steam.wishlist(id64);
    if (!res.ok) {
      if (!silent) toast(res.error === 'private' ? t('wishlist.private') : t('games.steamDown'));
      return;
    }
    const diff = wishlistDiff(state.data.wishlist, res.ids);
    const add = diff.add.slice(0, 100);
    update((d) => {
      for (const id of diff.removed) d.wishlist.find((i) => i.id === id).steamRemoved = true;
      for (const id of diff.back) d.wishlist.find((i) => i.id === id).steamRemoved = false;
      for (const id of add)
        d.wishlist.push({ id, name: `App ${id}`, image: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/capsule_231x87.jpg`, target: null, history: [], addedAt: today(), fromSteam: true });
      // Games already on both lists count as imported, so a later removal in Steam gets noticed.
      for (const i of d.wishlist) if (res.ids.includes(Number(i.id))) i.fromSteam = true;
    });
    if (add.length) await refreshPrices({ silent: true });
    if (!silent) toast(t('wishlist.imported', { n: add.length }));
  });
}
