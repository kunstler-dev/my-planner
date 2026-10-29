// Grok tab, two modes: 'web' — grok.com inside the app with the user's own subscription (no API costs);
// 'api' — chat through the xAI API with a key (paid per token), the key lives encrypted in the main process.
// Prompts and the system message are in the interface language, so Grok answers in it too.
import { state, update, save } from '../state.js';
import { h, icon, card, toast, uid, money } from '../ui.js';
import { t } from '../i18n.js';
import { markdown } from '../markdown.js';
import { today, thisMonth, shiftMonth, monthTitle } from '../dates.js';
import { totals, inMonth, byCategory } from '../finance-calc.js';
import { summaryForAI } from '../tg.js';
import { careerStats, projectStats, netWorth } from '../planner-calc.js';
import { catLabel, accountName } from '../labels.js';
import { go } from '../app.js';
import { showGrokWeb, fillGrokWeb, grokWeb } from '../grok-web.js';

const ERROR_CODES = ['no_key', 'bad_key', 'rate_limit', 'model', 'network', 'http'];
const errorText = (code) => t(`grok.error.${ERROR_CODES.includes(code) ? code : 'http'}`);

let hasKey = null;
let busy = null; // { id, el, text }

function financeSummary() {
  const all = state.data.finance;
  const m = thisMonth();
  const lines = [];
  for (const key of [shiftMonth(m, -2), shiftMonth(m, -1), m]) {
    const tot = totals(inMonth(all, key));
    lines.push(t('ai.fin.month', { month: monthTitle(key), income: money(tot.income), expense: money(tot.expense), net: money(tot.net, { sign: true }) }));
  }
  const cats = byCategory(inMonth(all, m), 'expense')
    .map((c) => `${catLabel(c.category)} — ${money(c.sum)} (${Math.round(c.share * 100)}%)`)
    .join('; ');
  const inc = byCategory(inMonth(all, m), 'income')
    .map((c) => `${catLabel(c.category)} — ${money(c.sum)}`)
    .join('; ');
  return [...lines, t('ai.fin.expenseCats', { list: cats || t('ai.none') }), t('ai.fin.incomeCats', { list: inc || t('ai.none') }), t('ai.fin.today', { date: today() })].join('\n');
}

function channelsSummary() {
  return state.data.channels.map((c) => summaryForAI(c, today())).join('\n\n---\n\n');
}

const QUICK = [
  ['finances', () => `${t('prompt.q.finances')}\n\n${financeSummary()}`],
  ['channels', () => (state.data.channels.length ? `${t('prompt.q.channels', { extra: state.data.channels.length > 1 ? t('prompt.q.channelsExtra') : '' })}\n\n${channelsSummary()}` : null)],
  ['posts', () => (state.data.channels.length ? `${t('prompt.q.posts')}\n\n${channelsSummary()}` : t('prompt.q.postsNoChannel'))],
  [
    'ausbildung',
    () => {
      const apps = state.data.career.applications;
      const st = careerStats(apps, today());
      const list = apps.map((a) => `- ${a.company}: ${a.position} (${a.kind}), ${t('ai.status')} ${a.status}${a.sentAt ? `, ${t('ai.sent')} ${a.sentAt}` : ''}`).join('\n');
      return t('prompt.q.ausbildung', { sent: st.sent, week: st.week, reply: Math.round(st.responseRate * 100), interviews: st.interviews, list: list || t('prompt.q.noApps') });
    },
  ],
  [
    'projects',
    () => {
      const ps = state.data.projects.map((p) => {
        const st = projectStats(p, state.data.finance);
        return t('ai.project', { name: p.name, status: p.status, description: p.description || '', profit: money(st.profit), hours: st.hours, money: p.money || t('ai.none') });
      });
      return t('prompt.q.projects', { list: ps.join('\n') || t('prompt.q.noProjects') });
    },
  ],
  [
    'money',
    () => {
      const { accounts, rates, settings } = state.data;
      const nw = netWorth(accounts, rates, settings.currency);
      return t('prompt.q.money', { list: accounts.map((a) => `- ${accountName(a)}: ${a.balance} ${a.currency}`).join('\n'), total: money(nw.total), finance: financeSummary() });
    },
  ],
  ['week', () => t('prompt.q.week')],
];

function messageEl(m, i) {
  if (m.role === 'user') return h('div', { class: 'msg user' }, m.content);
  if (m.role === 'error') return h('div', { class: 'msg error' }, m.content);
  return h(
    'div',
    { class: 'msg assistant' },
    h('div', { html: markdown(m.content) }),
    h(
      'div',
      { class: 'msg-actions' },
      h(
        'button',
        {
          class: 'btn ghost sm',
          onclick: () => {
            navigator.clipboard.writeText(m.content);
            toast(t('grok.copied'));
          },
        },
        t('grok.copy'),
      ),
      i === state.data.chat.length - 1 &&
        h(
          'button',
          {
            class: 'btn ghost sm',
            onclick: () => {
              update((d) => d.chat.pop(), { silent: true });
              send(null);
            },
          },
          icon('refresh', 14),
          t('grok.again'),
        ),
    ),
  );
}

async function send(text) {
  if (busy) return;
  if (text) update((d) => d.chat.push({ role: 'user', content: text }), { silent: true });
  const history = state.data.chat.filter((m) => m.role === 'user' || m.role === 'assistant').slice(-20);
  const id = uid();
  busy = { id, text: '' };
  renderLog();
  const off = window.api.grok.onDelta((msg) => {
    if (msg.id !== id || !busy) return;
    busy.text += msg.delta;
    const el = document.getElementById('grok-live');
    if (el) {
      el.innerHTML = markdown(busy.text);
      el.classList.add('cursor');
      scrollDown();
    }
  });
  const res = await window.api.grok.chat(id, state.data.settings.grokModel, [{ role: 'system', content: t('grok.system') }, ...history]);
  off();
  const partial = busy.text;
  busy = null;
  update(
    (d) => {
      if (res.ok && (res.text || partial)) d.chat.push({ role: 'assistant', content: res.text || partial });
      else if (!res.ok) {
        if (partial) d.chat.push({ role: 'assistant', content: partial });
        d.chat.push({ role: 'error', content: `${errorText(res.code)}${res.message && res.code !== 'no_key' ? `\n${String(res.message).slice(0, 300)}` : ''}` });
      }
    },
    { silent: true },
  );
  renderLog();
}

function scrollDown() {
  const log = document.getElementById('grok-log');
  if (log) log.scrollTop = log.scrollHeight;
}

/** Quick prompt chips; `use(prompt)` sends, pastes or opens the prompt depending on the mode. */
function quickChips(use, title) {
  return h(
    'div',
    { class: 'chips' },
    QUICK.map(([key, make]) =>
      h(
        'button',
        {
          class: 'chip',
          title,
          'data-quick': key,
          onclick: () => {
            const p = make();
            if (!p) return toast(t('grok.needChannel'));
            use(p);
          },
        },
        t(`grok.quick.${key}`),
      ),
    ),
  );
}

function renderLog() {
  const log = document.getElementById('grok-log');
  if (!log) return;
  const chat = state.data.chat;
  const items = chat.map(messageEl);
  if (busy) items.push(h('div', { class: 'msg assistant' }, h('div', { id: 'grok-live', class: 'cursor', html: markdown(busy.text) })));
  if (!chat.length && !busy) {
    const chips = quickChips(send);
    chips.style.justifyContent = 'center';
    items.push(
      h(
        'div',
        { class: 'stack', style: { margin: 'auto', alignItems: 'center', textAlign: 'center', maxWidth: '520px' } },
        h('div', { class: 'brand-mark', style: { width: '44px', height: '44px', borderRadius: '14px', fontSize: '20px' } }, icon('spark', 22)),
        h('h2', {}, t('grok.howHelp')),
        h('p', { class: 'muted', style: { margin: 0 } }, t('grok.howHelpHint')),
        chips,
      ),
    );
  }
  log.replaceChildren(...items);
  const stop = document.getElementById('grok-stop');
  const sendBtn = document.getElementById('grok-send');
  if (stop) stop.hidden = !busy;
  if (sendBtn) sendBtn.hidden = !!busy;
  scrollDown();
}

function keyCard() {
  const input = h('input', { class: 'input', type: 'password', placeholder: 'xai-…', style: { flex: 1 } });
  return card(
    t('grok.connect'),
    null,
    h('p', { class: 'muted', style: { marginTop: 0 } }, t('grok.keyHint1'), h('a', { href: 'https://console.x.ai', target: '_blank', style: { color: 'inherit' } }, 'console.x.ai'), t('grok.keyHint2')),
    h(
      'form',
      {
        class: 'row',
        onsubmit: async (e) => {
          e.preventDefault();
          if (!input.value.trim()) return;
          hasKey = await window.api.grok.setKey(input.value.trim());
          toast(t('settings.keySaved'));
          update(() => {});
        },
      },
      input,
      h('button', { class: 'btn primary', type: 'submit' }, t('common.save')),
    ),
  );
}

const MODES = ['web', 'browser', 'api'];

// Windows can't hand very long links to the browser; longer prompts go through the clipboard instead.
const MAX_LINK = 2000;

/** Opens grok.com in the user's own browser (their usual login) with the prompt prefilled via ?q=. */
export function openGrokInBrowser(text) {
  if (!text) return window.open('https://grok.com/', '_blank');
  navigator.clipboard.writeText(text).catch(() => {});
  const url = `https://grok.com/?q=${encodeURIComponent(text)}`;
  if (url.length <= MAX_LINK) {
    window.open(url, '_blank');
    toast(t('grok.openedBrowser'));
  } else {
    window.open('https://grok.com/', '_blank');
    toast(t('grok.longCopied'));
  }
}

function modeSeg() {
  const mode = state.data.settings.grokMode;
  return h(
    'div',
    { class: 'seg' },
    MODES.map((k) => h('button', { class: mode === k ? 'on' : '', onclick: () => update((d) => (d.settings.grokMode = k)) }, t(`grok.mode.${k}`))),
  );
}

/** Puts a prompt into grok.com (subscription mode); copies it to the clipboard as a fallback. */
export async function sendToGrokWeb(text) {
  navigator.clipboard.writeText(text).catch(() => {});
  toast(t('grok.pasting'));
  const ok = await fillGrokWeb(text);
  toast(ok ? t('grok.pasted') : t('grok.pasteFailed'));
}

function browserPage(pending) {
  if (pending) setTimeout(() => openGrokInBrowser(pending), 0);
  return h(
    'div',
    { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Grok'), h('div', { class: 'sub' }, t('grok.browserSub'))), modeSeg()),
    card(
      t('grok.quickTitle'),
      h('button', { class: 'btn primary', onclick: () => openGrokInBrowser(null) }, icon('up', 16), t('grok.openSite')),
      h('p', { class: 'muted', style: { marginTop: 0 } }, t('grok.browserHint')),
      quickChips(openGrokInBrowser),
    ),
  );
}

function webPage(pending) {
  const slot = h('div', { class: 'grok-web' });
  const tool = (iconName, title, fn) => h('button', { class: 'btn ghost sm icon-only', title, onclick: fn }, icon(iconName, 16));
  setTimeout(() => {
    showGrokWeb(slot);
    if (pending) sendToGrokWeb(pending);
  }, 0);
  return h(
    'div',
    { class: 'page page-wide' },
    h('div', { class: 'page-head', style: { marginBottom: '14px' } }, h('div', {}, h('h1', {}, 'Grok'), h('div', { class: 'sub' }, t('grok.webSub'))), modeSeg()),
    h(
      'div',
      { class: 'row', style: { marginBottom: '12px', flexWrap: 'wrap' } },
      quickChips(sendToGrokWeb, t('grok.pasteHint')),
      h('div', { class: 'spacer' }),
      tool('left', t('grok.back'), grokWeb.back),
      tool('refresh', t('grok.reload'), grokWeb.reload),
      tool('home', t('grok.home'), grokWeb.home),
      h(
        'button',
        {
          class: 'btn ghost sm',
          onclick: async () => {
            if (!confirm(t('grok.logoutConfirm'))) return;
            await grokWeb.logout();
            toast(t('grok.loggedOut'));
          },
        },
        t('grok.logout'),
      ),
    ),
    slot,
  );
}

export function grokView() {
  const page = h('div', { class: 'page' });
  const pending = state.viewOpts?.prompt;
  state.viewOpts = null;
  if (state.data.settings.grokMode === 'browser') return browserPage(pending);
  if (state.data.settings.grokMode !== 'api') return webPage(pending);

  const head = h(
    'div',
    { class: 'page-head' },
    h('div', {}, h('h1', {}, 'Grok'), h('div', { class: 'sub' }, `${t('grok.model', { model: state.data.settings.grokModel })} · `, h('a', { href: '#', style: { color: 'inherit' }, onclick: (e) => (e.preventDefault(), go('settings')) }, t('grok.change')))),
    h(
      'div',
      { class: 'row' },
      modeSeg(),
      h(
        'button',
        {
          class: 'btn ghost',
          onclick: () => {
            if (busy) return;
            update((d) => (d.chat = []));
          },
        },
        icon('trash', 16),
        t('grok.clear'),
      ),
    ),
  );

  if (hasKey === null) {
    window.api.grok.hasKey().then((v) => {
      hasKey = v;
      if (state.view === 'grok') {
        if (pending) state.viewOpts = { prompt: pending };
        update(() => {}, {});
      }
    });
    page.append(head);
    return page;
  }
  if (!hasKey) {
    page.append(head, keyCard());
    return page;
  }

  const input = h('textarea', {
    class: 'input',
    rows: 1,
    placeholder: t('grok.inputPh'),
    oninput: (e) => {
      e.target.style.height = 'auto';
      e.target.style.height = `${Math.min(180, e.target.scrollHeight)}px`;
    },
    onkeydown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
  });
  const submit = () => {
    const text = input.value.trim();
    if (!text || busy) return;
    input.value = '';
    input.style.height = 'auto';
    send(text);
  };

  page.append(
    head,
    h(
      'section',
      { class: 'card chat' },
      h('div', { class: 'chat-log', id: 'grok-log' }),
      h(
        'div',
        { class: 'chat-input' },
        input,
        h('button', { class: 'btn primary', id: 'grok-send', onclick: submit }, icon('send', 16), t('grok.send')),
        h('button', { class: 'btn', id: 'grok-stop', hidden: true, onclick: () => busy && window.api.grok.abort(busy.id) }, icon('stop', 16), t('grok.stop')),
      ),
    ),
  );
  setTimeout(() => {
    renderLog();
    input.focus();
    if (pending) send(pending);
  }, 0);
  save();
  return page;
}

export function resetGrokKeyCache() {
  hasKey = null;
}
