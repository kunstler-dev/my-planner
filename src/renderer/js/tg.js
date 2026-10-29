// Telegram channel analytics. Parses the public preview page t.me/s/<name> (no bot or API key needed)
// and computes stats from the stored posts and subscriber snapshots. Pure functions, unit-tested.
import { t } from './i18n.js';
import { weekdays } from './dates.js';

const decode = (s) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .trim();

/** '1.2K' → 1200, '3,4M' → 3400000, '15 312' → 15312. */
export function parseCount(s) {
  if (!s) return 0;
  const m = String(s)
    .replace(/\s/g, '')
    .replace(',', '.')
    .match(/([\d.]+)([KMB])?/i);
  if (!m) return 0;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
  return Math.round(parseFloat(m[1]) * mult);
}

/** { title, username, subscribers, posts: [{ id, date, views, reactions, text, media }] } */
export function parseChannelPage(html) {
  const title = decode(html.match(/class="tgme_channel_info_header_title"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '');
  const username = decode(html.match(/class="tgme_channel_info_header_username"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '').replace(
    /^@/,
    '',
  );
  let subscribers = 0;
  for (const m of html.matchAll(
    /<div class="tgme_channel_info_counter"><span class="counter_value">([^<]+)<\/span>\s*<span class="counter_type">([^<]+)<\/span>/g,
  )) {
    if (/subscriber|подписчик/i.test(m[2])) subscribers = parseCount(m[1]);
  }

  const posts = [];
  const chunks = html.split('<div class="tgme_widget_message_wrap').slice(1);
  for (const chunk of chunks) {
    const id = Number(chunk.match(/data-post="[^"/]+\/(\d+)"/)?.[1]);
    if (!id) continue;
    const datetime = chunk.match(/<time[^>]*datetime="([^"]+)"/)?.[1];
    const views = parseCount(chunk.match(/class="tgme_widget_message_views">([^<]+)</)?.[1]);
    let reactions = 0;
    // <span class="tgme_reaction"><tg-emoji …></tg-emoji>54.6K</span> (or <i>/<b> instead of tg-emoji)
    for (const r of chunk.matchAll(/<span class="tgme_reaction[^"]*">([\s\S]*?)<\/span>/g)) {
      reactions += parseCount(r[1].replace(/<[^>]+>[^<]*<\/[^>]+>|<[^>]+>/g, '').match(/[\d.,]+[KMB]?\s*$/i)?.[0]);
    }
    const textHtml = chunk.match(/class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1] || '';
    const media = /tgme_widget_message_(photo|video|roundvideo|document|poll|voice)/.exec(chunk)?.[1] || null;
    posts.push({ id, date: datetime || null, views, reactions, text: decode(textHtml).slice(0, 400), media });
  }
  return { title, username, subscribers, posts };
}

// ---- stats -------------------------------------------------------------------------------------

const DAY = 86400000;

/** Posts as a sorted array (newest first), only those with a date. */
export function postList(channel) {
  return Object.values(channel.posts || {})
    .filter((p) => p.date)
    .sort((a, b) => b.id - a.id);
}

function avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

/** Stats for posts published within the last `days` days before `now`. */
export function windowStats(posts, days, now = Date.now()) {
  // Fresh posts haven't collected their views yet — skip the last 24 h for averages.
  const inWin = posts.filter((p) => {
    const t = Date.parse(p.date);
    return t > now - days * DAY && t < now - DAY;
  });
  return {
    count: posts.filter((p) => Date.parse(p.date) > now - days * DAY).length,
    avgViews: avg(inWin.map((p) => p.views)),
    avgReactions: avg(inWin.map((p) => p.reactions)),
  };
}

/** Subscriber change over `days` using stored snapshots [{ date, subscribers }]. */
export function subscriberDelta(snapshots, days, todayStr) {
  if (!snapshots.length) return null;
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  const since = new Date(Date.parse(todayStr) - days * DAY).toISOString().slice(0, 10);
  const base = sorted.find((s) => s.date >= since) || sorted[0];
  if (base === last) return null;
  return { delta: last.subscribers - base.subscribers, from: base.date };
}

/** Average views by weekday (Mon=0) and by 3-hour slot of the local time. */
export function timing(posts) {
  const wd = Array.from({ length: 7 }, () => []);
  const hr = Array.from({ length: 8 }, () => []);
  for (const p of posts) {
    const d = new Date(p.date);
    wd[(d.getDay() + 6) % 7].push(p.views);
    hr[Math.floor(d.getHours() / 3)].push(p.views);
  }
  return {
    weekdays: wd.map((v) => ({ avg: avg(v), n: v.length })),
    slots: hr.map((v, i) => ({ from: i * 3, avg: avg(v), n: v.length })),
  };
}

/** Upsert parsed posts into the stored map; returns how many were new. */
export function mergePosts(stored, parsed, nowMs) {
  let added = 0;
  for (const p of parsed) {
    if (!stored[p.id]) added++;
    stored[p.id] = { ...stored[p.id], ...p, updatedAt: nowMs };
  }
  return added;
}

/** Keep one snapshot per day (the latest value of that day). */
export function addSnapshot(snapshots, date, subscribers) {
  if (!subscribers) return snapshots;
  const rest = snapshots.filter((s) => s.date !== date);
  return [...rest, { date, subscribers }].sort((a, b) => a.date.localeCompare(b.date));
}

/** Short text summary of the channel for Grok, in the interface language. */
export function summaryForAI(channel, todayStr, now = Date.now()) {
  const posts = postList(channel);
  const w7 = windowStats(posts, 7, now);
  const w30 = windowStats(posts, 30, now);
  const subs = channel.snapshots.at(-1)?.subscribers || 0;
  const d30 = subscriberDelta(channel.snapshots, 30, todayStr);
  const tm = timing(posts.slice(0, 100));
  const days = weekdays();
  const top = [...posts]
    .slice(0, 100)
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);
  const recent = posts.slice(0, 15);
  const line = (p) =>
    `- ${p.date.slice(0, 16).replace('T', ' ')} | ${t('ai.ch.views', { n: p.views })} | ${t('ai.ch.reactions', { n: p.reactions })} | ${p.media || t('ai.ch.text')} | ${p.text.replace(/\s+/g, ' ').slice(0, 140) || t('ai.ch.noText')}`;
  return [
    t('ai.ch.channel', { title: channel.title, username: channel.username }),
    t('ai.ch.subs', { n: subs }) + (d30 ? t('ai.ch.subsChange', { from: d30.from, delta: `${d30.delta >= 0 ? '+' : ''}${d30.delta}` }) : ''),
    t('ai.ch.week', { count: w7.count, views: Math.round(w7.avgViews), reactions: w7.avgReactions.toFixed(1) }),
    t('ai.ch.month', { count: w30.count, views: Math.round(w30.avgViews), err: subs ? ((w30.avgViews / subs) * 100).toFixed(1) : '—' }),
    t('ai.ch.byDay', { list: tm.weekdays.map((d, i) => `${days[i]} ${Math.round(d.avg)} (${d.n})`).join(', ') }),
    t('ai.ch.bySlot', { list: tm.slots.map((s) => `${s.from}–${s.from + 3} ${Math.round(s.avg)} (${s.n})`).join(', ') }),
    '',
    t('ai.ch.top'),
    ...top.map(line),
    '',
    t('ai.ch.recent'),
    ...recent.map(line),
  ].join('\n');
}
