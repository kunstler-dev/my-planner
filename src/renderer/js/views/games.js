// Games: one Steam account → Dota 2 (OpenDota), Deadlock (deadlock-api.com) and CS2 (Leetify).
import { state, update, rerender } from '../state.js';
import { h, icon, compact, card, empty, toast } from '../ui.js';
import { barList } from '../charts.js';
import { resolveSteam, LOADERS, ERRORS } from '../games.js';
import { dotaRank, winrate, pct, kda, duration, gameSummary } from '../games-calc.js';
import { go } from '../app.js';

const TABS = [
  ['dota', 'Dota 2'],
  ['deadlock', 'Deadlock'],
  ['cs', 'CS2'],
];
const STALE_MS = 60 * 60 * 1000;
const loading = {};
let linking = false;

export async function refreshGame(tab, { silent = false } = {}) {
  const g = state.data.games;
  if (!g.steamId || loading[tab]) return;
  loading[tab] = true;
  if (!silent) rerender();
  try {
    const data = await LOADERS[tab](g);
    update((d) => (d.games[tab] = { data, fetchedAt: Date.now(), error: null }));
    if (!silent) toast('Статистика обновлена');
  } catch (err) {
    update((d) => (d.games[tab] = { ...d.games[tab], fetchedAt: Date.now(), error: err.code || 'http' }));
  } finally {
    loading[tab] = false;
    rerender();
  }
}

function linkCard() {
  const input = h('input', { class: 'input', placeholder: 'Ссылка на профиль Steam, SteamID64 или ID в Dota', style: { flex: 1 } });
  setTimeout(() => input.focus(), 0);
  const submit = async () => {
    if (!input.value.trim() || linking) return;
    linking = true;
    rerender();
    try {
      const s = await resolveSteam(input.value);
      update((d) => {
        d.games = { ...d.games, steamId: s.id64, accountId: s.accountId, persona: s.persona, avatar: s.avatar, relink: false, dota: null, deadlock: null, cs: null };
      });
      for (const [tab] of TABS) refreshGame(tab, { silent: true });
    } catch (err) {
      toast(ERRORS[err.code] || err.message);
    } finally {
      linking = false;
      rerender();
    }
  };
  return card(
    'Подключить Steam',
    state.data.games.steamId && h('button', { class: 'btn ghost sm', onclick: () => update((d) => (d.games.relink = false)) }, 'Отмена'),
    h(
      'p',
      { class: 'muted', style: { marginTop: 0 } },
      'Один аккаунт Steam — три игры. Вставь ссылку вида steamcommunity.com/id/… или /profiles/…, либо SteamID64. Ключи не нужны.',
    ),
    h(
      'ul',
      { class: 'muted', style: { margin: '0 0 14px', paddingLeft: '18px', lineHeight: 1.7 } },
      h('li', {}, h('b', {}, 'Dota 2'), ' — OpenDota. В игре должна быть включена «Общедоступная история матчей».'),
      h('li', {}, h('b', {}, 'Deadlock'), ' — deadlock-api.com, работает для открытых профилей.'),
      h('li', {}, h('b', {}, 'CS2'), ' — Leetify. Нужно один раз войти на leetify.com через Steam, чтобы он начал собирать матчи.'),
    ),
    h(
      'form',
      { class: 'row', onsubmit: (e) => (e.preventDefault(), submit()) },
      input,
      h('button', { class: 'btn primary', type: 'submit', disabled: linking }, linking ? 'Ищу профиль…' : 'Подключить'),
    ),
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

/** Row of squares: filled = win, outline = loss (newest on the right). */
function wlStrip(results) {
  return h(
    'div',
    { class: 'wl' },
    [...results].reverse().map((w) => h('i', { class: w ? 'w' : '', title: w ? 'Победа' : 'Поражение' })),
  );
}

const ago = (ms) => new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

function matchRow(m, extra) {
  return h(
    'div',
    { class: 'list-row' },
    h('span', { class: `badge${m.win ? ' solid' : ''}`, style: { minWidth: '34px', justifyContent: 'center' } }, m.win ? 'W' : 'L'),
    h('div', { class: 'grow' }, h('div', { class: 'title' }, m.hero), h('div', { class: 'meta' }, `${ago(m.start)} · ${duration(m.duration)}${extra ? ` · ${extra(m)}` : ''}`)),
    h('div', { class: 'amount', title: 'Убийства / смерти / помощь' }, `${m.k}/${m.d}/${m.a}`),
  );
}

function heroBars(heroes, extra) {
  const max = Math.max(1, ...heroes.map((x) => x.games));
  return barList(
    heroes.map((x) => ({
      label: x.hero,
      share: x.games / max,
      text: `${x.games} игр · ${pct(winrate(x.wins, x.games))}${extra ? ` · ${extra(x)}` : ''}`,
    })),
  );
}

const avg = (arr, f) => (arr.length ? arr.reduce((s, x) => s + f(x), 0) / arr.length : 0);

function dotaTab(d) {
  const all = d.wl.win + d.wl.lose;
  const m30 = d.wl30.win + d.wl30.lose;
  const r20 = d.recent.slice(0, 20);
  return [
    h(
      'div',
      { class: 'grid cols-4', style: { marginBottom: '16px' } },
      tile('Ранг', dotaRank(d.rankTier, d.leaderboard), d.name, true),
      tile('Винрейт · 30 дней', m30 ? pct(winrate(d.wl30.win, m30)) : '—', `${d.wl30.win} побед, ${d.wl30.lose} поражений`),
      tile('Всего игр', compact(all), `винрейт ${pct(winrate(d.wl.win, all))}`),
      tile('KDA · последние 20', r20.length ? avg(r20, kda).toFixed(2) : '—', r20.length ? `GPM ${Math.round(avg(r20, (m) => m.gpm))} · XPM ${Math.round(avg(r20, (m) => m.xpm))}` : null),
    ),
    h(
      'div',
      { class: 'grid cols-2', style: { alignItems: 'start' } },
      card(
        'Последние матчи',
        r20.length && wlStrip(r20.map((m) => m.win)),
        r20.length ? h('div', { class: 'list' }, r20.map((m) => matchRow(m, (x) => `GPM ${x.gpm}`))) : empty('Матчей нет'),
      ),
      card('Герои за полгода', null, d.heroes.length ? heroBars(d.heroes) : empty('Нет данных')),
    ),
  ];
}

function deadlockTab(d) {
  const r20 = d.recent.slice(0, 20);
  return [
    h(
      'div',
      { class: 'grid cols-4', style: { marginBottom: '16px' } },
      tile('Ранг', d.rank, 'по последнему рейтинговому матчу', true),
      tile('Винрейт · 30 дней', d.last30.matches ? pct(winrate(d.last30.wins, d.last30.matches)) : '—', `${d.last30.matches} матчей`),
      tile('Всего матчей', compact(d.total.matches), `винрейт ${pct(winrate(d.total.wins, d.total.matches))}`),
      tile('KDA · последние 20', r20.length ? avg(r20, kda).toFixed(2) : '—', r20.length ? `net worth ${compact(avg(r20, (m) => m.nw))}` : null),
    ),
    h(
      'div',
      { class: 'grid cols-2', style: { alignItems: 'start' } },
      card(
        'Последние матчи',
        r20.length && wlStrip(r20.map((m) => m.win)),
        r20.length ? h('div', { class: 'list' }, r20.map((m) => matchRow(m, (x) => `${compact(x.nw)} душ`))) : empty('Матчей нет'),
      ),
      card('Герои', null, d.heroes.length ? heroBars(d.heroes, (x) => `KDA ${x.kda.toFixed(1)}`) : empty('Нет данных')),
    ),
  ];
}

function csTab(d) {
  const s = d.stats;
  const r = d.rating;
  const n = (v, digits = 1) => (typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: digits }) : '—');
  const r20 = d.recent.slice(0, 20);
  const statRow = (label, value) => h('div', { class: 'list-row' }, h('div', { class: 'grow' }, label), h('div', { class: 'amount' }, value));
  return [
    h(
      'div',
      { class: 'grid cols-4', style: { marginBottom: '16px' } },
      tile('Premier', d.premier ? d.premier.toLocaleString('ru-RU') : '—', d.name, true),
      tile('FACEIT', d.faceit ? `${d.faceit} lvl` : '—', d.faceitElo ? `${d.faceitElo} ELO` : 'не привязан'),
      tile('Винрейт', pct(d.winrate), `${compact(d.total)} матчей`),
      tile('Рейтинг Leetify', d.leetify != null ? n(d.leetify, 2) : '—', 'вклад в победу за раунд'),
    ),
    h(
      'div',
      { class: 'grid cols-3', style: { alignItems: 'start' } },
      card(
        'Навыки',
        null,
        barList(
          [
            ['Aim', r.aim],
            ['Позиционка', r.positioning],
            ['Утилити', r.utility],
          ].map(([label, v]) => ({ label, share: Math.max(0, Math.min(1, (v || 0) / 100)), text: n(v, 0) })),
        ),
        h(
          'div',
          { class: 'list', style: { marginTop: '8px' } },
          statRow('Клатчи', n((r.clutch || 0) * 100, 1)),
          statRow('Открывающие дуэли', n((r.opening || 0) * 100, 1)),
        ),
      ),
      card(
        'Стрельба и игра',
        null,
        h(
          'div',
          { class: 'list' },
          statRow('Попадания в голову', `${n(s.accuracy_head)}%`),
          statRow('Реакция', `${n(s.reaction_time_ms, 0)} мс`),
          statRow('Точность спрея', `${n(s.spray_accuracy)}%`),
          statRow('Preaim', `${n(s.preaim)}°`),
          statRow('Первые дуэли за CT / T', `${n(s.ct_opening_duel_success_percentage, 0)}% / ${n(s.t_opening_duel_success_percentage, 0)}%`),
          statRow('Успешные трейды', `${n(s.trade_kills_success_percentage, 0)}%`),
          statRow('Флешек до килла', n(s.flashbang_leading_to_kill)),
        ),
      ),
      card(
        'Последние матчи',
        r20.length && wlStrip(r20.map((m) => m.outcome === 'win')),
        r20.length
          ? h(
              'div',
              { class: 'list' },
              r20.map((m) =>
                h(
                  'div',
                  { class: 'list-row' },
                  h('span', { class: `badge${m.outcome === 'win' ? ' solid' : ''}`, style: { minWidth: '34px', justifyContent: 'center' } }, m.outcome === 'win' ? 'W' : m.outcome === 'tie' ? 'T' : 'L'),
                  h('div', { class: 'grow' }, h('div', { class: 'title' }, m.map), h('div', { class: 'meta' }, `${ago(Date.parse(m.date))} · HS ${n(m.hs, 0)}%`)),
                  h('div', { class: 'amount' }, m.score.join(':')),
                ),
              ),
            )
          : empty('Матчей нет'),
      ),
    ),
  ];
}

const RENDER = { dota: dotaTab, deadlock: deadlockTab, cs: csTab };

export function askGrokAboutGame(tab) {
  const data = state.data.games[tab]?.data;
  if (!data) return toast('Сначала загрузи статистику');
  const title = TABS.find(([k]) => k === tab)[1];
  go('grok', {
    prompt:
      `Разбери мою игру в ${title} по этим данным: сильные и слабые стороны, на каких героях/картах играть, что улучшить в первую очередь, ` +
      `3–5 конкретных упражнений или привычек на ближайшие две недели.\n\n${gameSummary(tab, data)}`,
  });
}

export function gamesView() {
  const g = state.data.games;
  const head = (right) =>
    h(
      'div',
      { class: 'page-head' },
      h(
        'div',
        { class: 'row', style: { gap: '14px' } },
        g.avatar && g.steamId && !g.relink && h('img', { src: g.avatar, class: 'avatar', width: 48, height: 48, alt: '' }),
        h('div', {}, h('h1', {}, 'Игры'), h('div', { class: 'sub' }, g.steamId && !g.relink ? g.persona : 'Dota 2 · Deadlock · CS2')),
      ),
      right,
    );
  if (!g.steamId || g.relink) return h('div', { class: 'page' }, head(null), linkCard());

  const tab = g.tab || 'dota';
  const slot = g[tab];
  if (!loading[tab] && (!slot || Date.now() - slot.fetchedAt > STALE_MS)) setTimeout(() => refreshGame(tab, { silent: true }), 0);

  let body;
  if (slot?.data && !slot.error) body = RENDER[tab](slot.data);
  else if (slot?.error) body = card(null, null, h('p', { style: { margin: 0 } }, ERRORS[slot.error] || ERRORS.http));
  else body = card(null, null, empty('Загружаю статистику…'));

  return h(
    'div',
    { class: 'page' },
    head(
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn ghost', onclick: () => update((d) => (d.games.relink = true)) }, 'Сменить аккаунт'),
        h('button', { class: 'btn', disabled: loading[tab], onclick: () => refreshGame(tab) }, icon('refresh', 16), loading[tab] ? 'Обновляю…' : 'Обновить'),
        h('button', { class: 'btn primary', disabled: !slot?.data || !!slot.error, onclick: () => askGrokAboutGame(tab) }, icon('spark', 16), 'Разбор от Grok'),
      ),
    ),
    h(
      'div',
      { class: 'row', style: { marginBottom: '18px' } },
      h(
        'div',
        { class: 'seg' },
        TABS.map(([k, label]) => h('button', { class: tab === k ? 'on' : '', onclick: () => update((d) => (d.games.tab = k)) }, label)),
      ),
      slot?.fetchedAt && h('span', { class: 'muted', style: { fontSize: '12.5px' } }, `обновлено ${new Date(slot.fetchedAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`),
    ),
    body,
  );
}
