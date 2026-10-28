// Pure helpers for game stats (unit-tested): Steam ids, ranks, compacting API answers, summaries for Grok.

const STEAM64_BASE = 76561197960265728n;

/** Profile link, SteamID64, /id/<vanity> or a bare vanity name → { id64 } | { vanity } | null. */
export function parseSteamInput(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const prof = s.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (prof) return { id64: prof[1] };
  const vanity = s.match(/steamcommunity\.com\/id\/([\w-]+)/);
  if (vanity) return { vanity: vanity[1] };
  if (/^7656\d{13}$/.test(s)) return { id64: s };
  if (/^\d{1,10}$/.test(s)) return { id64: String(BigInt(s) + STEAM64_BASE) }; // Dota friend id
  if (/^[\w-]{2,32}$/.test(s)) return { vanity: s };
  return null;
}

export const accountIdOf = (id64) => Number(BigInt(id64) - STEAM64_BASE);

/** Steam profile XML (?xml=1) → { id64, persona, avatar } or { error }. */
export function parseSteamXml(xml) {
  const tag = (name) => {
    const m = xml.match(new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`));
    return m ? m[1].trim() : '';
  };
  const error = tag('error');
  if (error || !tag('steamID64')) return { error: error || 'not_found' };
  return { id64: tag('steamID64'), persona: tag('steamID'), avatar: tag('avatarMedium'), privacy: tag('privacyState') };
}

// ---- Dota 2 (OpenDota) ----

const DOTA_MEDALS = ['', 'Рекрут', 'Страж', 'Рыцарь', 'Герой', 'Легенда', 'Властелин', 'Божество', 'Титан'];

/** rank_tier 54 → «Легенда 4», 80 → «Титан» (+ place on the leaderboard). */
export function dotaRank(rankTier, leaderboard) {
  if (!rankTier) return 'Без ранга';
  const medal = DOTA_MEDALS[Math.floor(rankTier / 10)] || '—';
  const stars = rankTier % 10;
  if (Math.floor(rankTier / 10) === 8) return leaderboard ? `Титан #${leaderboard}` : 'Титан';
  return stars ? `${medal} ${stars}` : medal;
}

const isRadiant = (slot) => slot < 128;

export function compactDota({ player, wl, wl30, recent, heroes }, heroNames) {
  return {
    name: player?.profile?.personaname || '',
    rankTier: player?.rank_tier || 0,
    leaderboard: player?.leaderboard_rank || 0,
    wl: { win: wl?.win || 0, lose: wl?.lose || 0 },
    wl30: { win: wl30?.win || 0, lose: wl30?.lose || 0 },
    recent: (recent || []).map((m) => ({
      id: m.match_id,
      hero: heroNames[m.hero_id] || `#${m.hero_id}`,
      k: m.kills,
      d: m.deaths,
      a: m.assists,
      gpm: m.gold_per_min,
      xpm: m.xp_per_min,
      lh: m.last_hits,
      win: m.radiant_win === isRadiant(m.player_slot),
      duration: m.duration,
      start: m.start_time * 1000,
    })),
    heroes: (heroes || [])
      .filter((x) => x.games > 0)
      .slice(0, 10)
      .map((x) => ({ hero: heroNames[x.hero_id] || `#${x.hero_id}`, games: x.games, wins: x.win })),
  };
}

// ---- Deadlock (deadlock-api.com) ----

/** ranked_display_badge 114 → «Eternus 4» using the ranks list [{ tier, name }]. */
export function deadlockRank(badge, ranks) {
  if (!badge) return 'Без ранга';
  const tier = Math.floor(badge / 10);
  const sub = badge % 10;
  const name = ranks.find((r) => r.tier === tier)?.name || `Tier ${tier}`;
  return sub ? `${name} ${sub}` : name;
}

// Heroes are aggregated from the match history: the hero-stats endpoint can lag far behind it.
export function compactDeadlock({ history }, heroNames, ranks) {
  const all = (history || []).slice().sort((a, b) => b.start_time - a.start_time);
  const badge = all.find((m) => m.ranked_display_badge)?.ranked_display_badge || 0;
  const monthAgo = Date.now() / 1000 - 30 * 86400;
  const last30 = all.filter((m) => m.start_time > monthAgo);
  const won = (m) => m.match_result === m.player_team;
  return {
    rank: deadlockRank(badge, ranks),
    total: { matches: all.length, wins: all.filter(won).length },
    last30: { matches: last30.length, wins: last30.filter(won).length },
    recent: all.slice(0, 30).map((m) => ({
      id: m.match_id,
      hero: heroNames[m.hero_id] || `#${m.hero_id}`,
      k: m.player_kills,
      d: m.player_deaths,
      a: m.player_assists,
      nw: m.net_worth,
      lh: m.last_hits,
      win: won(m),
      duration: m.match_duration_s,
      start: m.start_time * 1000,
    })),
    heroes: heroTotals(all, won, heroNames),
  };
}

function heroTotals(matches, won, heroNames) {
  const by = new Map();
  for (const m of matches) {
    const x = by.get(m.hero_id) || { games: 0, wins: 0, k: 0, d: 0, a: 0, nw: 0, sec: 0 };
    x.games++;
    x.wins += won(m) ? 1 : 0;
    x.k += m.player_kills;
    x.d += m.player_deaths;
    x.a += m.player_assists;
    x.nw += m.net_worth;
    x.sec += m.match_duration_s;
    by.set(m.hero_id, x);
  }
  return [...by]
    .sort((p, q) => q[1].games - p[1].games)
    .slice(0, 10)
    .map(([id, x]) => ({
      hero: heroNames[id] || `#${id}`,
      games: x.games,
      wins: x.wins,
      kda: (x.k + x.a) / Math.max(1, x.d),
      nwpm: Math.round(x.sec ? (x.nw / x.sec) * 60 : 0),
    }));
}

// ---- CS2 (Leetify public API) ----

export function compactCS(p) {
  return {
    name: p.name || '',
    winrate: p.winrate || 0,
    total: p.total_matches || 0,
    premier: p.ranks?.premier || 0,
    faceit: p.ranks?.faceit || 0,
    faceitElo: p.ranks?.faceit_elo || 0,
    leetify: p.ranks?.leetify ?? null,
    rating: p.rating || {},
    stats: p.stats || {},
    recent: (p.recent_matches || []).slice(0, 30).map((m) => ({
      id: m.id,
      date: m.finished_at,
      map: (m.map_name || '').replace(/^(de|cs)_/, ''),
      outcome: m.outcome,
      score: m.score || [],
      rating: m.leetify_rating,
      hs: m.accuracy_head,
      reaction: m.reaction_time_ms,
      premier: m.rank_type === 11 ? m.rank : null,
    })),
  };
}

// ---- shared ----

export const winrate = (wins, games) => (games ? wins / games : 0);
export const pct = (v) => `${Math.round(v * 100)}%`;
export const kda = (m) => (m.k + m.a) / Math.max(1, m.d);

export function duration(sec) {
  const m = Math.floor(sec / 60);
  return `${m}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

/** Text summary of one game's stats for Grok. */
export function gameSummary(game, data) {
  if (!data) return '';
  const line = (m) =>
    `- ${new Date(m.start).toISOString().slice(0, 10)} ${m.hero}: ${m.win ? 'победа' : 'поражение'}, ${m.k}/${m.d}/${m.a}` +
    (m.gpm ? `, GPM ${m.gpm}, XPM ${m.xpm}` : '') +
    (m.nw ? `, net worth ${m.nw}` : '') +
    `, ${duration(m.duration)}`;
  if (game === 'dota') {
    const all = data.wl.win + data.wl.lose;
    const m30 = data.wl30.win + data.wl30.lose;
    return [
      `Dota 2, игрок ${data.name}. Ранг: ${dotaRank(data.rankTier, data.leaderboard)}.`,
      `Всего игр: ${all}, винрейт ${pct(winrate(data.wl.win, all))}. За 30 дней: ${m30} игр, винрейт ${pct(winrate(data.wl30.win, m30))}.`,
      `Герои за полгода: ${data.heroes.map((x) => `${x.hero} ${x.games} игр (${pct(winrate(x.wins, x.games))})`).join(', ')}.`,
      'Последние матчи:',
      ...data.recent.slice(0, 20).map(line),
    ].join('\n');
  }
  if (game === 'deadlock') {
    return [
      `Deadlock. Ранг: ${data.rank}. Всего матчей: ${data.total.matches}, винрейт ${pct(winrate(data.total.wins, data.total.matches))}. За 30 дней: ${data.last30.matches}, винрейт ${pct(winrate(data.last30.wins, data.last30.matches))}.`,
      `Герои: ${data.heroes.map((x) => `${x.hero} ${x.games} игр (${pct(winrate(x.wins, x.games))}, KDA ${x.kda.toFixed(1)}, ${x.nwpm} душ/мин)`).join(', ')}.`,
      'Последние матчи:',
      ...data.recent.slice(0, 20).map(line),
    ].join('\n');
  }
  const s = data.stats;
  const r = data.rating;
  const num = (v, d = 1) => (typeof v === 'number' ? v.toFixed(d) : '—');
  return [
    `CS2 (по данным Leetify), игрок ${data.name}. Premier: ${data.premier || '—'}, FACEIT: ${data.faceit ? `${data.faceit} lvl, ${data.faceitElo} ELO` : '—'}. Матчей: ${data.total}, винрейт ${pct(data.winrate)}.`,
    `Рейтинги Leetify: aim ${num(r.aim)}, positioning ${num(r.positioning)}, utility ${num(r.utility)}, clutch ${num(r.clutch, 3)}, opening ${num(r.opening, 3)}.`,
    `Статистика: попадания в голову ${num(s.accuracy_head)}%, реакция ${num(s.reaction_time_ms, 0)} мс, точность спрея ${num(s.spray_accuracy)}%, preaim ${num(s.preaim)}°, ` +
      `открывающие дуэли CT ${num(s.ct_opening_duel_success_percentage)}% / T ${num(s.t_opening_duel_success_percentage)}%, трейды ${num(s.trade_kills_success_percentage)}%, флешки до килла ${num(s.flashbang_leading_to_kill)}.`,
    'Последние матчи:',
    ...data.recent
      .slice(0, 20)
      .map((m) => `- ${m.date.slice(0, 10)} ${m.map}: ${m.outcome === 'win' ? 'победа' : m.outcome === 'tie' ? 'ничья' : 'поражение'} ${m.score.join(':')}, рейтинг ${num((m.rating ?? 0) * 100, 1)}, HS ${num(m.hs, 0)}%`),
  ].join('\n');
}
