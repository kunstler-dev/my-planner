// Grok tab, two modes: 'web' — grok.com inside the app with the user's own subscription (no API costs);
// 'api' — chat through the xAI API with a key (paid per token), the key lives encrypted in the main process.
import { state, update, save } from '../state.js';
import { h, icon, card, toast, uid, money } from '../ui.js';
import { markdown } from '../markdown.js';
import { today, thisMonth, shiftMonth, monthTitle } from '../dates.js';
import { totals, inMonth, byCategory } from '../finance-calc.js';
import { summaryForAI } from '../tg.js';
import { careerStats, projectStats, netWorth } from '../planner-calc.js';
import { go } from '../app.js';
import { showGrokWeb, fillGrokWeb, grokWeb } from '../grok-web.js';

const ERRORS = {
  no_key: 'Не задан ключ xAI API. Добавь его в Настройках.',
  bad_key: 'Ключ xAI не подошёл (401/403). Проверь его в Настройках.',
  rate_limit: 'Лимит запросов или кредитов xAI исчерпан. Попробуй позже или пополни баланс на console.x.ai.',
  model: 'Модель не найдена. Выбери другую в Настройках (кнопка «Загрузить список моделей»).',
  network: 'Нет связи с api.x.ai. Проверь интернет или VPN.',
  http: 'Ошибка xAI API.',
};

const SYSTEM =
  'Ты — Grok, личный помощник в приложении-планере. Отвечай по-русски, по делу и конкретно, без воды. ' +
  'Пользователь живёт в Германии, ищет Ausbildung и работу, ведёт учёт денег, развивает свои Telegram-каналы и хочет зарабатывать на своих приложениях и проектах. Когда даёшь советы — опирайся на цифры, ' +
  'которые он прислал, и предлагай конкретные шаги. Форматируй ответы коротким Markdown (заголовки, списки).';

let hasKey = null;
let busy = null; // { id, el, text }

function financeSummary() {
  const all = state.data.finance;
  const m = thisMonth();
  const lines = [];
  for (const key of [shiftMonth(m, -2), shiftMonth(m, -1), m]) {
    const t = totals(inMonth(all, key));
    lines.push(`${monthTitle(key)}: доходы ${money(t.income)}, расходы ${money(t.expense)}, итог ${money(t.net, { sign: true })}`);
  }
  const cats = byCategory(inMonth(all, m), 'expense')
    .map((c) => `${c.category} — ${money(c.sum)} (${Math.round(c.share * 100)}%)`)
    .join('; ');
  const inc = byCategory(inMonth(all, m), 'income')
    .map((c) => `${c.category} — ${money(c.sum)}`)
    .join('; ');
  return `${lines.join('\n')}\nРасходы этого месяца по категориям: ${cats || 'нет'}\nДоходы этого месяца по категориям: ${inc || 'нет'}\nСегодня ${today()}.`;
}

function channelsSummary() {
  return state.data.channels.map((c) => summaryForAI(c, today())).join('\n\n---\n\n');
}

const QUICK = [
  ['Разбор моих финансов', () => `Посмотри на мои финансы и скажи, где я теряю деньги и что можно урезать. Дай 3–5 конкретных советов.\n\n${financeSummary()}`],
  [
    'Разбор каналов',
    () =>
      state.data.channels.length
        ? `Разбери мои Telegram-каналы: сильные и слабые стороны каждого, лучшее время для постов, 5 шагов для роста${state.data.channels.length > 1 ? ' и как каналам помогать друг другу' : ''}.\n\n${channelsSummary()}`
        : null,
  ],
  [
    'Идеи для постов',
    () =>
      state.data.channels.length
        ? `Предложи по 7 идей для постов на ближайшие две недели для каждого моего канала, в их стиле. Учитывай, какие посты набрали больше охвата.\n\n${channelsSummary()}`
        : 'Предложи 10 идей для постов в Telegram-канал. Сначала спроси меня, о чём канал, если это непонятно.',
  ],
  [
    'Поиск Ausbildung',
    () => {
      const apps = state.data.career.applications;
      const st = careerStats(apps, today());
      const list = apps.map((a) => `- ${a.company}: ${a.position} (${a.kind}), статус ${a.status}${a.sentAt ? `, отправлено ${a.sentAt}` : ''}`).join('\n');
      return (
        'Я ищу Ausbildung/работу в Германии. Помоги с планом поиска: какие профессии мне подходят и востребованы, где искать, как улучшить Bewerbung, ' +
        `что делать на этой неделе. Сейчас: отправлено ${st.sent}, на этой неделе ${st.week}, отвечают ${Math.round(st.responseRate * 100)}%, собеседований ${st.interviews}.\n${list || 'Откликов пока нет.'}\nСначала спроси, что мне интересно и какой у меня уровень немецкого.`
      );
    },
  ],
  [
    'Заработок на проектах',
    () => {
      const ps = state.data.projects.map((p) => {
        const st = projectStats(p, state.data.finance);
        return `- ${p.name} (${p.status}): ${p.description || ''}; прибыль ${money(st.profit)}, часов ${st.hours}; монетизация: ${p.money || 'нет'}`;
      });
      return (
        'Хочу зарабатывать на своих приложениях и проектах, параллельно с поиском Ausbildung в Германии. ' +
        `Мои проекты:\n${ps.join('\n') || '(пока не внёс — спроси меня)'}\n` +
        'Предложи, на чём сфокусироваться, 5 реалистичных способов монетизации, как оформить доход в Германии (Kleingewerbe, налоги, что можно на Ausbildung) и план на месяц.'
      );
    },
  ],
  [
    'Разбор денег',
    () => {
      const { accounts, rates, settings } = state.data;
      const nw = netWorth(accounts, rates, settings.currency);
      return `Вот где лежат мои деньги:\n${accounts.map((a) => `- ${a.name}: ${a.balance} ${a.currency}`).join('\n')}\nВсего ≈ ${money(nw.total)}.\n${financeSummary()}\nСкажи, как лучше распределить деньги между картами и криптой, какую подушку держать и сколько откладывать. Без инвестиционных обещаний.`;
    },
  ],
  ['План на неделю', () => 'Помоги составить план на неделю: спроси, какие у меня цели и дела, и разложи их по дням.'],
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
            toast('Скопировано');
          },
        },
        'Копировать',
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
          'Ещё раз',
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
  const res = await window.api.grok.chat(id, state.data.settings.grokModel, [{ role: 'system', content: SYSTEM }, ...history]);
  off();
  const partial = busy.text;
  busy = null;
  update(
    (d) => {
      if (res.ok && (res.text || partial)) d.chat.push({ role: 'assistant', content: res.text || partial });
      else if (!res.ok) {
        if (partial) d.chat.push({ role: 'assistant', content: partial });
        d.chat.push({ role: 'error', content: `${ERRORS[res.code] || ERRORS.http}${res.message && res.code !== 'no_key' ? `\n${String(res.message).slice(0, 300)}` : ''}` });
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

function renderLog() {
  const log = document.getElementById('grok-log');
  if (!log) return;
  const chat = state.data.chat;
  const items = chat.map(messageEl);
  if (busy) items.push(h('div', { class: 'msg assistant' }, h('div', { id: 'grok-live', class: 'cursor', html: markdown(busy.text) })));
  if (!chat.length && !busy) {
    items.push(
      h(
        'div',
        { class: 'stack', style: { margin: 'auto', alignItems: 'center', textAlign: 'center', maxWidth: '520px' } },
        h('div', { class: 'brand-mark', style: { width: '44px', height: '44px', borderRadius: '14px', fontSize: '20px' } }, icon('spark', 22)),
        h('h2', {}, 'Чем помочь?'),
        h('p', { class: 'muted', style: { margin: 0 } }, 'Спроси что угодно или выбери быстрый запрос — Grok получит цифры из твоих финансов и канала.'),
        h(
          'div',
          { class: 'chips', style: { justifyContent: 'center' } },
          QUICK.map(([label, make]) =>
            h(
              'button',
              {
                class: 'chip',
                onclick: () => {
                  const p = make();
                  if (!p) return toast('Сначала подключи канал во вкладке «Telegram-каналы»');
                  send(p);
                },
              },
              label,
            ),
          ),
        ),
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
    'Подключить Grok',
    null,
    h(
      'p',
      { class: 'muted', style: { marginTop: 0 } },
      'Нужен ключ xAI API: зайди на ',
      h('a', { href: 'https://console.x.ai', target: '_blank', style: { color: 'inherit' } }, 'console.x.ai'),
      ' → API Keys → Create API key. Запросы оплачиваются с баланса xAI по их тарифам. Ключ хранится только на этом компьютере в зашифрованном виде.',
    ),
    h(
      'form',
      {
        class: 'row',
        onsubmit: async (e) => {
          e.preventDefault();
          if (!input.value.trim()) return;
          hasKey = await window.api.grok.setKey(input.value.trim());
          toast('Ключ сохранён');
          update(() => {});
        },
      },
      input,
      h('button', { class: 'btn primary', type: 'submit' }, 'Сохранить'),
    ),
  );
}

const MODES = [
  ['web', 'Внутри приложения'],
  ['browser', 'В браузере'],
  ['api', 'API-ключ'],
];

// Windows can't hand very long links to the browser; longer prompts go through the clipboard instead.
const MAX_LINK = 2000;

/** Opens grok.com in the user's own browser (their usual login) with the prompt prefilled via ?q=. */
export function openGrokInBrowser(text) {
  if (!text) return window.open('https://grok.com/', '_blank');
  navigator.clipboard.writeText(text).catch(() => {});
  const url = `https://grok.com/?q=${encodeURIComponent(text)}`;
  if (url.length <= MAX_LINK) {
    window.open(url, '_blank');
    toast('Открыл Grok в браузере — подтверди отправку там');
  } else {
    window.open('https://grok.com/', '_blank');
    toast('Запрос длинный — он скопирован, вставь его в Grok через Ctrl+V');
  }
}

function modeSeg() {
  const mode = state.data.settings.grokMode;
  return h(
    'div',
    { class: 'seg' },
    MODES.map(([k, label]) => h('button', { class: mode === k ? 'on' : '', onclick: () => update((d) => (d.settings.grokMode = k)) }, label)),
  );
}

/** Puts a prompt into grok.com (subscription mode); copies it to the clipboard as a fallback. */
export async function sendToGrokWeb(text) {
  navigator.clipboard.writeText(text).catch(() => {});
  toast('Вставляю запрос в Grok…');
  const ok = await fillGrokWeb(text);
  toast(ok ? 'Запрос вставлен — проверь и нажми Enter в Grok' : 'Не нашёл поле ввода — запрос скопирован, вставь его через Ctrl+V');
}

function browserPage(pending) {
  if (pending) setTimeout(() => openGrokInBrowser(pending), 0);
  return h(
    'div',
    { class: 'page' },
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Grok'), h('div', { class: 'sub' }, 'Grok открывается в твоём браузере — там, где ты уже вошёл (через Google, GitHub, X)')), modeSeg()),
    card(
      'Быстрые запросы',
      h('button', { class: 'btn primary', onclick: () => openGrokInBrowser(null) }, icon('up', 16), 'Открыть grok.com'),
      h('p', { class: 'muted', style: { marginTop: 0 } }, 'Запрос с твоими цифрами откроется в браузере уже вписанным — останется подтвердить отправку. Длинный запрос копируется в буфер, его вставляешь через Ctrl+V.'),
      h(
        'div',
        { class: 'chips' },
        QUICK.map(([label, make]) =>
          h(
            'button',
            {
              class: 'chip',
              onclick: () => {
                const p = make();
                if (!p) return toast('Сначала подключи канал во вкладке «Telegram-каналы»');
                openGrokInBrowser(p);
              },
            },
            label,
          ),
        ),
      ),
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
    h(
      'div',
      { class: 'page-head', style: { marginBottom: '14px' } },
      h('div', {}, h('h1', {}, 'Grok'), h('div', { class: 'sub' }, 'Твоя подписка на grok.com — без оплаты за токены. Войди один раз, вход сохранится.')),
      modeSeg(),
    ),
    h(
      'div',
      { class: 'row', style: { marginBottom: '12px', flexWrap: 'wrap' } },
      h(
        'div',
        { class: 'chips' },
        QUICK.map(([label, make]) =>
          h(
            'button',
            {
              class: 'chip',
              title: 'Вставить запрос с твоими цифрами в Grok',
              onclick: () => {
                const p = make();
                if (!p) return toast('Сначала подключи канал во вкладке «Telegram-каналы»');
                sendToGrokWeb(p);
              },
            },
            label,
          ),
        ),
      ),
      h('div', { class: 'spacer' }),
      tool('left', 'Назад', grokWeb.back),
      tool('refresh', 'Обновить страницу', grokWeb.reload),
      tool('home', 'На главную grok.com', grokWeb.home),
      h(
        'button',
        {
          class: 'btn ghost sm',
          onclick: async () => {
            if (!confirm('Выйти из аккаунта grok.com в планере?')) return;
            await grokWeb.logout();
            toast('Вышел из grok.com');
          },
        },
        'Выйти',
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
    h('div', {}, h('h1', {}, 'Grok'), h('div', { class: 'sub' }, `Модель: ${state.data.settings.grokModel} · `, h('a', { href: '#', style: { color: 'inherit' }, onclick: (e) => (e.preventDefault(), go('settings')) }, 'сменить'))),
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
        'Очистить чат',
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
    placeholder: 'Напиши сообщение… (Enter — отправить, Shift+Enter — новая строка)',
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
        h('button', { class: 'btn primary', id: 'grok-send', onclick: submit }, icon('send', 16), 'Отправить'),
        h('button', { class: 'btn', id: 'grok-stop', hidden: true, onclick: () => busy && window.api.grok.abort(busy.id) }, icon('stop', 16), 'Стоп'),
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
