// Telegram channel analytics from the public page t.me/s/<name>: subscribers over time, reach, ERR,
// best time to post, top posts. Each refresh stores a subscriber snapshot for the day.
import { state, update, rerender } from '../state.js';
import { h, icon, compact, card, empty, toast } from '../ui.js';
import { t, num } from '../i18n.js';
import { openModal } from '../modal.js';
import { lineChart } from '../charts.js';
import { today, prettyDate, weekdays, dateTime } from '../dates.js';
import { parseChannelPage, mergePosts, addSnapshot, postList, windowStats, subscriberDelta, timing, summaryForAI } from '../tg.js';
import { go } from '../app.js';
import { planTab, adsTab } from './channel-extra.js';

const STALE_MS = 3 * 3600 * 1000;
let loading = false;
let adding = false;
let chTab = 'stats';

const CH_TABS = ['stats', 'plan', 'ads'];

function channelTabs() {
  return h(
    'div',
    { class: 'seg gap-b' },
    CH_TABS.map((k) => h('button', { class: chTab === k ? 'on' : '', 'data-tab': k, onclick: () => ((chTab = k), rerender()) }, t(`channel.tab.${k}`))),
  );
}

export function openChannelTab(tab) {
  chTab = tab;
}

const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

/** The channel shown now (settings.activeChannel), or the first one. */
export function activeChannel() {
  const list = state.data.channels;
  return list.find((c) => sameName(c.username, state.data.settings.activeChannel)) || list[0] || null;
}

const errorText = (code) => (['bad_name', 'not_public', 'network'].includes(code) ? t(`channel.error.${code}`) : null);

export async function refreshChannel(username, { silent = false } = {}) {
  if (loading) return;
  loading = true;
  if (!silent) rerender();
  try {
    const name = username.replace(/^@|^https?:\/\/t\.me\/(s\/)?/g, '').trim();
    const first = await window.api.tgFetch(name);
    if (!first.ok) throw new Error(errorText(first.error) || first.message || first.error);
    const page = parseChannelPage(first.html);
    if (!page.title) throw new Error(errorText('not_public'));
    const uname = page.username || name;
    const existing = state.data.channels.find((c) => sameName(c.username, uname));
    const posts = { ...existing?.posts };
    const now = Date.now();
    let added = mergePosts(posts, page.posts, now);
    // Older pages: deep on the first load, a little on later refreshes (to update recent views).
    const pages = Object.keys(posts).length < 80 ? 5 : 1;
    let before = Math.min(...page.posts.map((p) => p.id));
    for (let i = 0; i < pages && Number.isFinite(before) && before > 1; i++) {
      const more = await window.api.tgFetch(name, before);
      if (!more.ok) break;
      const older = parseChannelPage(more.html).posts.filter((p) => p.id < before);
      if (!older.length) break;
      added += mergePosts(posts, older, now);
      before = Math.min(...older.map((p) => p.id));
    }
    update((d) => {
      const i = d.channels.findIndex((c) => sameName(c.username, uname));
      const rec = {
        title: page.title,
        username: uname,
        snapshots: addSnapshot(i >= 0 ? d.channels[i].snapshots : [], today(), page.subscribers),
        posts,
        fetchedAt: now,
      };
      if (i >= 0) d.channels[i] = rec;
      else d.channels.push(rec);
      if (!silent) d.settings.activeChannel = uname;
    });
    adding = false;
    if (!silent) toast(added ? t('channel.updatedNew', { n: added }) : t('channel.updated'));
  } catch (err) {
    if (!silent) toast(err.message);
  } finally {
    loading = false;
    rerender();
  }
}

function connectCard() {
  const input = h('input', { class: 'input', placeholder: t('channel.namePh'), style: { flex: 1 } });
  const submit = () => input.value.trim() && refreshChannel(input.value.trim());
  setTimeout(() => input.focus(), 0);
  return card(
    state.data.channels.length ? t('channel.addTitle') : t('channel.connectTitle'),
    state.data.channels.length > 0 && h('button', { class: 'btn ghost sm', onclick: () => ((adding = false), rerender()) }, t('common.cancel')),
    h('p', { class: 'muted', style: { marginTop: 0 } }, t('channel.connectHint')),
    h(
      'form',
      { class: 'row', onsubmit: (e) => (e.preventDefault(), submit()) },
      input,
      h('button', { class: 'btn primary', type: 'submit', disabled: loading }, loading ? t('common.loading') : t('channel.connect')),
    ),
  );
}

function snapshotModal() {
  const date = h('input', { class: 'input', type: 'date', value: today(), required: true });
  const subs = h('input', { class: 'input', type: 'number', min: '0', required: true, placeholder: t('channel.subsPh') });
  openModal(
    t('channel.subsForDate'),
    h(
      'div',
      { class: 'stack', style: { gap: '12px' } },
      h('p', { class: 'muted', style: { margin: 0 } }, t('channel.subsHint')),
      h('div', { class: 'grid cols-2', style: { gap: '12px' } }, h('label', { class: 'field' }, t('common.date'), date), h('label', { class: 'field' }, t('channel.subsLabel'), subs)),
    ),
    {
      onSubmit: () => {
        const n = parseInt(subs.value, 10);
        if (!n) return false;
        update((d) => {
          const c = d.channels.find((x) => sameName(x.username, activeChannel().username));
          c.snapshots = addSnapshot(c.snapshots, date.value, n);
        });
      },
    },
  );
}

const pct = (v) => `${num(v * 100, { maximumFractionDigits: 1 })}%`;
const postUrl = (p) => `https://t.me/${activeChannel().username}/${p.id}`;
const when = (p) => dateTime(new Date(p.date).getTime());

function postRow(p, subs) {
  return h(
    'a',
    { class: 'list-row', href: postUrl(p), target: '_blank', style: { color: 'inherit', textDecoration: 'none' } },
    h('div', { class: 'grow' }, h('div', { class: 'title post-text' }, p.text || (p.media ? `[${p.media}]` : t('channel.noText'))), h('div', { class: 'meta' }, `${when(p)}${p.media ? ` · ${p.media}` : ''}`)),
    h('div', { class: 'badge', title: t('channel.reactions') }, `♥ ${compact(p.reactions)}`),
    h('div', { class: 'amount', title: subs ? t('channel.ofSubs', { p: pct(p.views / subs) }) : '' }, icon('eye', 15), ' ', compact(p.views)),
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

function heatmap(tm) {
  const max = Math.max(1, ...tm.weekdays.map((d) => d.avg), ...tm.slots.map((s) => s.avg));
  const cell = (avg, n) => {
    const k = n ? avg / max : 0;
    return h(
      'div',
      {
        class: 'heat-cell',
        title: n ? t('channel.heatTip', { avg: compact(avg), n }) : t('channel.noPosts'),
        style: {
          background: n ? `color-mix(in srgb, var(--ink) ${Math.round(8 + k * 82)}%, var(--card))` : 'var(--card)',
          color: k > 0.5 ? 'var(--invert)' : 'var(--ink)',
        },
      },
      n ? compact(avg) : '—',
    );
  };
  const bestDay = tm.weekdays.reduce((b, d, i) => (d.n && d.avg > (tm.weekdays[b]?.avg || 0) ? i : b), 0);
  const bestSlot = tm.slots.reduce((b, s, i) => (s.n && s.avg > (tm.slots[b]?.avg || 0) ? i : b), 0);
  return h(
    'div',
    { class: 'stack', style: { gap: '14px' } },
    h('div', { class: 'heat', style: { gridTemplateColumns: 'repeat(7, 1fr)' } }, weekdays().map((w) => h('div', { class: 'heat-label' }, w)), tm.weekdays.map((d) => cell(d.avg, d.n))),
    h(
      'div',
      { class: 'heat', style: { gridTemplateColumns: 'repeat(8, 1fr)' } },
      tm.slots.map((s) => h('div', { class: 'heat-label' }, `${s.from}–${s.from + 3}`)),
      tm.slots.map((s) => cell(s.avg, s.n)),
    ),
    h('div', { class: 'muted', style: { fontSize: '12.5px' } }, t('channel.bestTime', { day: t(`channel.onDay.${bestDay}`), from: tm.slots[bestSlot].from, to: tm.slots[bestSlot].from + 3 })),
  );
}

export function askGrokAboutChannel() {
  go('grok', { prompt: `${t('prompt.channel')}\n\n${summaryForAI(activeChannel(), today())}` });
}

function channelSwitcher(ch) {
  const list = state.data.channels;
  return h(
    'div',
    { class: 'row gap-b', style: { flexWrap: 'wrap' } },
    list.length > 1 &&
      h(
        'div',
        { class: 'seg' },
        list.map((c) => h('button', { class: c === ch && !adding ? 'on' : '', onclick: () => ((adding = false), update((d) => (d.settings.activeChannel = c.username)), undefined) }, `@${c.username}`)),
      ),
    !adding && h('button', { class: 'btn sm', onclick: () => ((adding = true), rerender()) }, icon('plus', 15), t('channel.channel')),
  );
}

export function channelView() {
  const ch = activeChannel();
  if (!ch || adding) {
    return h('div', { class: 'page' }, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, t('nav.channel')), h('div', { class: 'sub' }, t('channel.sub')))), ch && channelSwitcher(ch), connectCard());
  }
  if (!loading && Date.now() - ch.fetchedAt > STALE_MS) setTimeout(() => refreshChannel(ch.username, { silent: true }), 0);

  const posts = postList(ch);
  const subs = ch.snapshots.at(-1)?.subscribers || 0;
  const w7 = windowStats(posts, 7);
  const w30 = windowStats(posts, 30);
  const d7 = subscriberDelta(ch.snapshots, 7, today());
  const d30 = subscriberDelta(ch.snapshots, 30, today());
  const last30 = posts.slice(0, 30).reverse();
  const top = [...posts].sort((a, b) => b.views - a.views).slice(0, 7);
  const fmtDelta = (d) => (d ? t('channel.deltaSince', { delta: `${d.delta >= 0 ? '+' : '−'}${compact(Math.abs(d.delta))}`, date: prettyDate(d.from) }) : t('channel.deltaLater'));

  const head = h(
    'div',
    { class: 'page-head' },
    h(
      'div',
      {},
      h('h1', {}, ch.title),
      h('div', { class: 'sub' }, h('a', { href: `https://t.me/${ch.username}`, target: '_blank', style: { color: 'inherit' } }, `@${ch.username}`), ` · ${t('channel.fetched', { when: ch.fetchedAt ? dateTime(ch.fetchedAt) : '—' })}`),
    ),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'btn ghost',
          onclick: () => {
            if (confirm(t('channel.removeConfirm', { username: ch.username }))) {
              update((d) => {
                d.channels = d.channels.filter((c) => !sameName(c.username, ch.username));
                d.settings.activeChannel = d.channels[0]?.username || '';
              });
            }
          },
        },
        t('channel.remove'),
      ),
      h('button', { class: 'btn', disabled: loading, onclick: () => refreshChannel(ch.username) }, icon('refresh', 16), loading ? t('common.updating') : t('common.update')),
      h('button', { class: 'btn primary', disabled: !posts.length, onclick: askGrokAboutChannel }, icon('spark', 16), t('channel.grok')),
    ),
  );
  if (chTab !== 'stats') return h('div', { class: 'page' }, head, channelSwitcher(ch), channelTabs(), ...(chTab === 'plan' ? planTab(ch) : adsTab(ch)));

  return h(
    'div',
    { class: 'page' },
    head,
    channelSwitcher(ch),
    channelTabs(),
    h(
      'div',
      { class: 'grid cols-4 gap-b' },
      tile(t('channel.subscribers'), compact(subs), d7 ? fmtDelta(d7) : fmtDelta(d30), true),
      tile(t('channel.avgReach7'), w7.avgViews ? compact(w7.avgViews) : '—', t('channel.for30', { v: w30.avgViews ? compact(w30.avgViews) : '—' })),
      tile(t('channel.err30'), subs && w30.avgViews ? pct(w30.avgViews / subs) : '—', t('channel.errHint')),
      tile(t('channel.posts7'), String(w7.count), t('channel.posts30', { n: w30.count, r: compact(w30.avgReactions) })),
    ),
    h(
      'div',
      { class: 'grid cols-2 gap-b' },
      card(
        t('channel.subscribers'),
        h('button', { class: 'btn ghost sm', onclick: snapshotModal }, icon('plus', 15), t('channel.addManually')),
        ch.snapshots.length > 1
          ? lineChart({
              points: ch.snapshots.slice(-90).map((s) => ({ label: s.date.slice(8, 10) + '.' + s.date.slice(5, 7), value: s.subscribers, tip: `${prettyDate(s.date)}\n${t('channel.subsN', { n: s.subscribers, v: num(s.subscribers) })}` })),
              format: compact,
              labelEvery: Math.ceil(Math.min(90, ch.snapshots.length) / 8),
            })
          : empty(t('channel.subsChartEmpty')),
      ),
      card(
        t('channel.reachRecent'),
        null,
        last30.length > 1
          ? lineChart({
              points: last30.map((p) => ({ label: `#${p.id}`, value: p.views, tip: `${when(p)}\n${t('channel.viewsN', { n: p.views, v: num(p.views) })}\n${(p.text || '').slice(0, 60)}` })),
              format: compact,
              labelEvery: 6,
            })
          : empty(t('channel.noPostsYet')),
      ),
    ),
    h(
      'div',
      { class: 'grid cols-2', style: { alignItems: 'start' } },
      h(
        'div',
        { class: 'stack' },
        card(t('channel.whenPost'), null, posts.length ? heatmap(timing(posts.slice(0, 150))) : empty(t('channel.needPosts'))),
        card(t('channel.topPosts'), null, top.length ? h('div', { class: 'list' }, top.map((p) => postRow(p, subs))) : empty(t('common.noData'))),
      ),
      card(t('channel.latestPosts'), h('span', { class: 'muted' }, t('channel.inBase', { n: posts.length })), posts.length ? h('div', { class: 'list' }, posts.slice(0, 15).map((p) => postRow(p, subs))) : empty(t('common.noData'))),
    ),
  );
}
