// Loading game stats through the main process (window.api.get, allow-listed hosts).
import { parseSteamInput, parseSteamXml, accountIdOf, compactDota, compactDeadlock, compactCS } from './games-calc.js';

class StatsError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

async function getJSON(url) {
  const res = await window.api.get(url);
  if (res.status === 404) throw new StatsError('not_found');
  if (res.status === 429) throw new StatsError('rate_limit');
  if (!res.ok) throw new StatsError(res.error === 'network' ? 'network' : 'http', res.message || `HTTP ${res.status}`);
  try {
    return JSON.parse(res.text);
  } catch {
    throw new StatsError('http', 'bad JSON');
  }
}

const cache = {};
async function cached(key, load) {
  if (!cache[key]) cache[key] = load().catch((err) => ((cache[key] = null), Promise.reject(err)));
  return cache[key];
}

/** Steam profile link / id / vanity → { id64, accountId, persona, avatar }. */
export async function resolveSteam(input) {
  const parsed = parseSteamInput(input);
  if (!parsed) throw new StatsError('bad_input');
  const url = parsed.id64
    ? `https://steamcommunity.com/profiles/${parsed.id64}/?xml=1`
    : `https://steamcommunity.com/id/${encodeURIComponent(parsed.vanity)}/?xml=1`;
  const res = await window.api.get(url);
  if (!res.ok) throw new StatsError(res.error === 'network' ? 'network' : 'steam_not_found');
  const info = parseSteamXml(res.text);
  if (info.error) throw new StatsError('steam_not_found');
  return { id64: info.id64, accountId: accountIdOf(info.id64), persona: info.persona, avatar: info.avatar };
}

export async function loadDota(accountId) {
  const base = `https://api.opendota.com/api/players/${accountId}`;
  const [names, player, wl, wl30, recent, heroes] = await Promise.all([
    cached('dotaHeroes', async () => {
      const list = await getJSON('https://api.opendota.com/api/constants/heroes');
      return Object.fromEntries(Object.values(list).map((x) => [x.id, x.localized_name]));
    }),
    getJSON(base),
    getJSON(`${base}/wl`),
    getJSON(`${base}/wl?date=30`),
    getJSON(`${base}/recentMatches`),
    getJSON(`${base}/heroes?date=180`),
  ]);
  if (!player?.profile) throw new StatsError('dota_private');
  return compactDota({ player, wl, wl30, recent, heroes }, names);
}

export async function loadDeadlock(accountId) {
  const [names, ranks, history] = await Promise.all([
    cached('dlHeroes', async () => {
      const list = await getJSON('https://api.deadlock-api.com/v1/assets/heroes');
      return Object.fromEntries(list.map((x) => [x.id, x.name]));
    }),
    cached('dlRanks', () => getJSON('https://api.deadlock-api.com/v1/assets/ranks')),
    getJSON(`https://api.deadlock-api.com/v1/players/${accountId}/match-history`),
  ]);
  if (!history?.length) throw new StatsError('deadlock_empty');
  return compactDeadlock({ history }, names, ranks);
}

export async function loadCS(id64) {
  try {
    return compactCS(await getJSON(`https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=${id64}`));
  } catch (err) {
    if (err.code === 'not_found') throw new StatsError('cs_no_leetify');
    throw err;
  }
}

export const LOADERS = {
  dota: (g) => loadDota(g.accountId),
  deadlock: (g) => loadDeadlock(g.accountId),
  cs: (g) => loadCS(g.steamId),
};

export const ERRORS = {
  bad_input: 'Не похоже на ссылку на профиль Steam или SteamID.',
  steam_not_found: 'Профиль Steam не найден. Проверь ссылку.',
  network: 'Нет связи с сервером статистики. Проверь интернет или VPN.',
  rate_limit: 'Сервер статистики просит подождать. Попробуй через минуту.',
  not_found: 'Данных нет.',
  http: 'Сервер статистики ответил ошибкой.',
  dota_private:
    'OpenDota не видит твои матчи. В Dota 2 включи «Настройки → Социальные → Общедоступная история матчей», сыграй матч и обнови.',
  deadlock_empty: 'Матчей Deadlock не найдено. Если ты играешь, профиль Steam должен быть открытым; новые матчи появляются с задержкой.',
  cs_no_leetify:
    'Leetify ещё не собирает твои матчи. Зайди на leetify.com через Steam (бесплатно) — после этого статистика CS2 появится здесь.',
};
