// Dev check: starts the app on a temp data folder with demo data, opens every section in light and dark
// theme and saves screenshots. Usage: npx electron scripts/screenshots.js <outDir> [ch1,ch2] [ru|uk|de]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const out = path.resolve(process.argv[2] || 'shots');
const channels = (process.argv[3] || 'durov').split(',');
const lang = ['ru', 'uk', 'de'].includes(process.argv[4]) ? process.argv[4] : 'ru';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-shots-'));
process.env.PLANNER_DATA_DIR = dataDir;
process.env.PLANNER_SILENT = '1';
// Optional background / banner files: PLANNER_SHOT_BG and PLANNER_SHOT_BANNER (copied like the settings buttons do).
for (const [kind, env] of [
  ['background', 'PLANNER_SHOT_BG'],
  ['banner', 'PLANNER_SHOT_BANNER'],
]) {
  const src = process.env[env];
  if (src && fs.existsSync(src)) {
    fs.mkdirSync(path.join(dataDir, 'media'), { recursive: true });
    fs.copyFileSync(src, path.join(dataDir, 'media', `${kind}-1${path.extname(src).toLowerCase()}`));
  }
}

function demoData() {
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const day = (offset) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const finance = [];
  const contractStart = () => {
    const d = new Date(now.getFullYear(), now.getMonth() - 24, now.getDate() + 52);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  let id = 0;
  const add = (type, amount, category, offset, note = '') => finance.push({ id: `d${id++}`, type, amount, category, date: day(offset), note });
  for (let m = 0; m < 10; m++) {
    add('income', 60000 + m * 1500, 'Зарплата', m * 30 + 3);
    add('income', 8000 + ((m * 3700) % 9000), 'Реклама в канале', m * 30 + 12, 'Пост для партнёра');
    add('expense', 25000, 'Жильё', m * 30 + 2, 'Аренда');
    add('expense', 9000 + ((m * 1300) % 4000), 'Еда', m * 30 + 6);
    add('expense', 3200, 'Транспорт', m * 30 + 9);
    add('expense', 4000 + ((m * 900) % 3000), 'Реклама канала', m * 30 + 15, 'Закуп в @somechannel');
    add('expense', 990, 'Связь и подписки', m * 30 + 18, 'Telegram Premium');
  }
  add('expense', 640, 'Еда', 0, 'Кофе и сэндвич');
  add('expense', 2100, 'Развлечения', 1, 'Кино');
  const tasks = [
    { id: 't1', title: 'Написать пост про итоги недели', date: day(0), done: false },
    { id: 't2', title: 'Ответить рекламодателю', date: day(1), done: false },
    { id: 't3', title: 'Оплатить интернет', date: day(0), done: true, doneAt: day(0) },
    { id: 't4', title: 'Подготовить розыгрыш', date: day(-2), done: false },
  ];
  // v3 sections (the rest of the object is v1 data, to exercise the migration).
  const v3 = {
    accounts: [
      // Automatic accounts with made-up addresses and cards; demo runs never contact the networks or the bank.
      {
        id: 'trust',
        name: 'Trust Wallet (крипта)',
        currency: '$',
        balance: 840,
        updatedAt: day(3),
        history: [{ date: day(20), balance: 700 }, { date: day(3), balance: 840 }],
        sync: {
          kind: 'trust',
          lastSync: Date.now() - 25 * 60000,
          error: '',
          addresses: [{ network: 'tron', address: `T${'X'.repeat(33)}` }, { network: 'bsc', address: `0x${'0'.repeat(40)}` }],
          breakdown: [
            { network: 'tron', address: `T${'X'.repeat(33)}`, symbol: 'TRX', amount: 300, usd: 99.4 },
            { network: 'tron', address: `T${'X'.repeat(33)}`, symbol: 'USDT', amount: 640.6, usd: 640.6 },
            { network: 'bsc', address: `0x${'0'.repeat(40)}`, symbol: 'BNB', amount: 0.134, usd: 100 },
            { network: 'bsc', address: `0x${'0'.repeat(40)}`, symbol: 'USDT', amount: 0, usd: 0 },
          ],
        },
      },
      { id: 'ua', name: 'Украинская карта', currency: '₴', balance: 12500, updatedAt: day(1), history: [{ date: day(20), balance: 9000 }, { date: day(1), balance: 12500 }], sync: { kind: 'mono', monoIds: ['demo-black'], lastSync: Date.now() - 12 * 60000, error: '' } },
      { id: 'de', name: 'Немецкая карта', currency: '€', balance: 1630, updatedAt: day(0), history: [{ date: day(20), balance: 1200 }, { date: day(0), balance: 1630 }] },
    ],
    budgets: { Еда: 12000, Развлечения: 2000, Транспорт: 4000, Игры: 60 },
    recurring: [
      { id: 'r1', active: true, type: 'expense', title: 'Аренда', amount: 25000, category: 'Жильё', day: 1, next: day(-4) },
      { id: 'r2', active: true, type: 'expense', title: 'Spotify', amount: 11, category: 'Связь и подписки', day: 2, next: day(-5) },
      { id: 'r3', active: true, type: 'income', title: 'Зарплата', amount: 60000, category: 'Зарплата', day: 25, next: day(-27) },
      // A phone contract whose cancellation deadline is three weeks away (24 months, one month notice).
      { id: 'r4', active: true, type: 'expense', title: 'Vodafone', amount: 40, category: 'Связь и подписки', day: 15, next: day(-12), contract: { start: contractStart(), minMonths: 24, notice: { n: 1, unit: 'months' }, renewMonths: 1, endOfMonth: false } },
    ],
    goals: [
      { id: 'g1', title: 'Подушка безопасности', target: 3000, deadline: day(-180), contributions: [{ amount: 900, date: day(30) }] },
      { id: 'g2', title: 'На ноутбук', target: 800, deadline: '', jarId: 'demo-jar', jarSync: Date.now() - 12 * 60000, contributions: [{ amount: 250, date: day(10), auto: true }] },
    ],
    mono: {
      accounts: [
        { id: 'demo-black', currencyCode: 980, balance: 1250000, creditLimit: 0, type: 'black', pan: '0000' },
        { id: 'demo-eur', currencyCode: 978, balance: 4200, creditLimit: 0, type: 'black', pan: '' },
      ],
      jars: [{ id: 'demo-jar', title: 'На ноутбук', currencyCode: 980, balance: 1250000, goal: 4000000 }],
      fetchedAt: Date.now() - 12 * 60000,
      last: {},
      error: '',
    },
    jobs: { searches: [{ id: 'js1', was: 'Fachinformatiker', wo: 'Berlin', umkreis: 30, type: 'ausbildung' }], ignored: [], lastRun: day(0), found: null, error: '' },
    // OpenDota cache with made-up matches (demo runs never call OpenDota).
    dota: {
      profile: { name: 'demo', rankTier: 54, leaderboard: null },
      wl: { win: 18, lose: 12 },
      heroes: { 14: 'Pudge', 8: 'Juggernaut', 74: 'Invoker', 86: 'Rubick', 2: 'Axe' },
      matches: Array.from({ length: 20 }, (_, i) => ({ match_id: 9000 + i, hero_id: [14, 14, 8, 74, 14, 86, 2, 8][i % 8], player_slot: i % 3 ? 1 : 130, radiant_win: i % 4 !== 1, kills: 3 + ((i * 7) % 12), deaths: 1 + ((i * 5) % 9), assists: 4 + ((i * 3) % 14), duration: 1500 + ((i * 337) % 1500), start_time: Math.floor(now.getTime() / 1000) - i * 30000 })),
      fetchedAt: Date.now() - 40 * 60000,
      error: '',
    },
    // A project timer running for 1 h 25 min.
    timer: { projectId: 'pr1', startedAt: Date.now() - 85 * 60000 },
    timerLast: 'pr1',
    rules: [{ id: 'ru1', field: 'desc', value: 'silpo', category: 'Еда', kind: 'expense', createdAt: day(5) }],
    // Letters (made up): a phone bill due soon, a receipt matching a bank operation, an invitation, a failed payment.
    bills: [{ id: 'b1', title: 'Vodafone', amount: 39.99, dueDate: day(-3), paid: false, ref: 'mail:demo-voda@example.test', category: 'Связь и подписки' }],
    inbox: [
      { id: 'in1', source: 'mono', kind: 'transfer', title: 'Переказ на банку «На ноутбук»', desc: 'Переказ на банку «На ноутбук»', amount: 24, currency: '€', date: day(0), category: null, ref: 'demo-op-1', status: 'new', createdAt: day(0), accountId: 'ua', origAmount: 1000, origCurrency: '₴' },
      { id: 'in2', source: 'mono', kind: 'income', title: 'Від: Олена К.', desc: 'Від: Олена К.', amount: 36, currency: '€', date: day(1), category: 'Подарок', ref: 'demo-op-2', status: 'new', createdAt: day(1), accountId: 'ua', origAmount: 1500, origCurrency: '₴' },
      { id: 'in4', source: 'mail', kind: 'alert', title: 'Payment failed', subject: 'Payment failed', sender: 'billing@starlink.com', domain: 'starlink.com', date: day(0), ref: 'mail:demo-sl@example.test', messageId: 'demo-sl@example.test', link: 'https://mail.google.com/', status: 'new', createdAt: day(0) },
      { id: 'in5', source: 'mail', kind: 'career', title: 'Einladung zum Vorstellungsgespräch', subject: 'Einladung zum Vorstellungsgespräch', sender: 'karriere@siemens.example', domain: 'siemens.example', date: day(0), ref: 'mail:demo-inv@example.test', messageId: 'demo-inv@example.test', link: 'https://mail.google.com/', status: 'new', createdAt: day(0), career: { status: 'interview', appId: 'p2', company: 'Siemens' } },
      { id: 'in6', source: 'mail', kind: 'expense', title: 'Vodafone', merchant: 'Vodafone', subject: 'Ihre Rechnung', sender: 'rechnung@kundenservice.vodafone.com', domain: 'kundenservice.vodafone.com', amount: 39.99, currency: '€', origAmount: 39.99, origCurrency: '€', date: day(1), dueDate: day(-3), category: 'Связь и подписки', suggested: 'Связь и подписки', ref: 'mail:demo-voda@example.test', messageId: 'demo-voda@example.test', link: 'https://mail.google.com/', status: 'new', createdAt: day(1) },
      { id: 'in7', source: 'mail', kind: 'expense', title: 'Silpo', merchant: 'Silpo', subject: 'Ваш чек', sender: 'check@silpo.example', domain: 'silpo.example', amount: 7.4, currency: '€', origAmount: 310, origCurrency: '₴', date: day(0), category: 'Еда', suggested: 'Еда', match: 'm1', ref: 'mail:demo-silpo@example.test', messageId: 'demo-silpo@example.test', link: 'https://mail.google.com/', status: 'new', createdAt: day(0) },
      { id: 'in8', source: 'mail', kind: 'unparsed', title: 'Zahlungserinnerung', subject: 'Zahlungserinnerung', sender: 'info@verein.example', domain: 'verein.example', date: day(2), ref: 'mail:demo-u@example.test', messageId: 'demo-u@example.test', link: 'https://mail.google.com/', status: 'new', createdAt: day(2) },
      { id: 'in3', source: 'mono', kind: 'transfer', title: 'Банкомат', desc: 'Банкомат', amount: 48, currency: '€', date: day(2), category: null, ref: 'demo-op-3', status: 'new', createdAt: day(2), accountId: 'ua', origAmount: 2000, origCurrency: '₴', hold: true },
    ],
    habits: [
      { id: 'h1', title: '30 минут немецкого', days: [day(0), day(1), day(2), day(3), day(5)] },
      { id: 'h2', title: 'Один отклик в день', days: [day(1), day(2)], auto: { kind: 'apply' } },
    ],
    notes: [
      { id: 'n1', title: 'Вопросы на собеседование', text: 'Wie sieht ein typischer Tag aus?\nGibt es eine Übernahme nach der Ausbildung?', pinned: true, updatedAt: day(2) },
      { id: 'n2', title: 'Идеи постов', text: 'Итоги месяца\nКак я делал планер', updatedAt: day(5) },
    ],
    contentPlan: [
      { id: 'c1', channel: channels[0], title: 'Итоги недели', date: day(-1), status: 'planned', note: '' },
      { id: 'c2', channel: channels[0], title: 'Розыгрыш', date: day(-3), status: 'planned', note: '' },
      { id: 'c3', channel: channels[0], title: 'Как я ищу Ausbildung', date: '', status: 'idea', note: '' },
    ],
    ads: [
      { id: 'a1', channel: channels[0], kind: 'buy', partner: '@techchannel', date: day(10), price: 40, gained: 120, views: 3000 },
      { id: 'a2', channel: channels[0], kind: 'sell', partner: 'Онлайн-школа', date: day(4), price: 60 },
    ],
    career: {
      weeklyGoal: 5,
      applications: [
        { id: 'p1', company: 'Deutsche Bahn', position: 'Fachinformatiker Anwendungsentwicklung', kind: 'ausbildung', city: 'Berlin', status: 'sent', sentAt: day(9), followUp: day(2) },
        { id: 'p2', company: 'Siemens', position: 'Fachinformatiker Systemintegration', kind: 'ausbildung', city: 'München', status: 'interview', sentAt: day(15), statusAt: day(1) },
        { id: 'p3', company: 'REWE', position: 'Kaufmann im Einzelhandel', kind: 'ausbildung', city: 'Köln', status: 'wish' },
        { id: 'p4', company: 'Lidl', position: 'Werkstudent IT', kind: 'werkstudent', city: 'Berlin', status: 'sent', sentAt: day(1) },
        { id: 'p5', company: 'Zalando', position: 'Praktikum Frontend', kind: 'praktikum', city: 'Berlin', status: 'rejected', sentAt: day(25) },
        // Found by the saved job search (made up).
        { id: 'p6', company: 'Beispiel IT GmbH', position: 'Ausbildung Fachinformatiker/in - Anwendungsentwicklung', kind: 'ausbildung', city: 'Berlin', status: 'wish', refnr: 'demo-1', link: 'https://www.arbeitsagentur.de/jobsuche/', isNew: true, source: 'jobs', createdAt: day(0) },
        { id: 'p7', company: 'Muster Systemhaus', position: 'Ausbildung Fachinformatiker/in - Systemintegration', kind: 'ausbildung', city: 'Potsdam', status: 'wish', refnr: 'demo-2', link: 'https://www.arbeitsagentur.de/jobsuche/', isNew: true, source: 'jobs', createdAt: day(0) },
      ],
    },
    projects: [
      { id: 'pr1', name: 'Planner', status: 'active', description: 'Десктопный планер', money: 'Продажа шаблонов', hours: [{ hours: 12, date: day(2) }], milestones: [{ id: 'm1', title: 'Релиз 1.3', done: true, doneAt: day(0) }, { id: 'm2', title: 'Сайт', done: false }] },
      { id: 'pr2', name: 'ELT-бот', status: 'launched', description: 'Telegram Mini App', money: 'Реклама, подписки', hours: [{ hours: 40, date: day(6) }], milestones: [] },
    ],
    wishlist: [
      { id: 1245620, name: 'ELDEN RING', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1245620/capsule_231x87.jpg', target: 40, history: [] },
      { id: 1091500, name: 'Cyberpunk 2077', image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/capsule_231x87.jpg', target: null, history: [] },
    ],
    ranks: {
      dota: { goal: 4000, entries: [{ id: 'k1', date: day(40), value: 3050 }, { id: 'k2', date: day(20), value: 3180, note: 'Проиграл линию, мало стакал' }, { id: 'k3', date: day(2), value: 3320, note: 'Хорошо зашёл Pudge' }] },
      faceit: { goal: 1351, entries: [{ id: 'f1', date: day(30), value: 1120 }, { id: 'f2', date: day(3), value: 1205 }] },
      deadlock: { goal: 71, entries: [{ id: 'l1', date: day(25), value: 50 }, { id: 'l2', date: day(1), value: 56 }] },
    },
    clips: [
      { id: 'v1', title: 'Хук через всю карту', game: 'Dota 2', status: 'published', date: day(5), views: { tiktok: 12400, shorts: 3100, youtube: 0 } },
      { id: 'v2', title: 'Эйс с дигла', game: 'CS2', status: 'edit', views: {} },
      { id: 'v3', title: 'Топ-5 фейлов недели', game: 'Deadlock', status: 'idea', views: {} },
    ],
  };
  finance.push({ id: 'pf1', type: 'income', amount: 300, category: 'Продажи', date: day(3), note: 'Заказ', projectId: 'pr1' });
  // Imported from Monobank (made up).
  finance.push(
    { id: 'm1', type: 'expense', amount: 7.4, category: 'Еда', date: day(0), note: 'Silpo', desc: 'Silpo', source: 'mono', extId: 'demo-m1', accountId: 'ua', origAmount: 310, origCurrency: '₴' },
    { id: 'm2', type: 'expense', amount: 3.1, category: 'Транспорт', date: day(1), note: 'Uklon', desc: 'Uklon', source: 'mono', extId: 'demo-m2', accountId: 'ua', origAmount: 130, origCurrency: '₴', hold: true },
  );
  return { ...v3, version: 1, settings: { theme: 'light', lang, steamId: '76561190000000001', mail: { enabled: true, address: 'name@example.com', interval: 15, grok: false }, currency: '₽', pets: true, petsColor: false, grokModel: 'grok-4', channel: '' }, finance, tasks, channel: { title: '', username: '', snapshots: [], posts: {}, fetchedAt: 0 }, chat: [
    { role: 'user', content: 'Посмотри на мои финансы и скажи, где я теряю деньги.' },
    { role: 'assistant', content: '### Коротко\nТы откладываешь **~40%** дохода — это хорошо.\n\n- Реклама канала: 5 тыс. ₽/мес — проверь окупаемость закупов\n- Еда: можно срезать 10–15%\n\n1. Заведи лимит на развлечения\n2. Считай цену подписчика с каждого закупа' },
  ] };
}

fs.writeFileSync(path.join(dataDir, 'data.json'), JSON.stringify(demoData()));
fs.mkdirSync(out, { recursive: true });

require('../src/main/main.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => fs.appendFileSync(path.join(out, 'progress.txt'), `${a.join(' ')}\n`);

app.on('browser-window-created', (_e, win) => {
  log('window created');
  win.webContents.once('did-finish-load', async () => {
    log('page loaded');
    const js = (code) => win.webContents.executeJavaScript(`(() => { try { return (${code}); } catch (e) { return 'ERR ' + e.message; } })()`);
    // Waits until the expression is truthy (max `ms`).
    const until = async (expr, ms = 20000) => {
      for (let t = 0; t < ms; t += 250) {
        if (await js(expr)) return true;
        await wait(250);
      }
      log('timeout waiting for', expr, '| main:', (await js("document.querySelector('main').innerText.slice(0, 300)")).replace(/s+/g, ' '), '| toast:', await js("document.getElementById('toast')?.textContent"));
      return false;
    };
    const click = (view) => js(`document.querySelector('.nav-item[data-view=${JSON.stringify(view)}]')?.click()`);
    const shot = async (name) => {
      log('shot', name);
      await wait(900);
      fs.writeFileSync(path.join(out, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    };
    const errors = [];
    win.webContents.on('console-message', (e) => e.level !== 'info' && e.level !== 'debug' && (errors.push(e.message), log('[page]', e.level, e.message)));
    try {
      await wait(1500);
      log('start');
      await js(`window.api.grok.setKey('xai-demo-key')`);
      const submitInput = (value) => js(`(() => { const i = document.querySelector('main form input'); i.value = ${JSON.stringify(value)}; i.form.requestSubmit(); })()`);
      await click('channel');
      for (const [i, ch] of channels.entries()) {
        if (i) await js(`[...document.querySelectorAll('main .btn.sm')].at(-1).click()`);
        await until(`!!document.querySelector('main form input')`);
        await submitInput(ch);
        await until(`document.querySelectorAll('main .stat-value').length > 0 && !document.querySelector('main form input')`, 30000);
        log('channel added', ch);
      }
      for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await js(`document.querySelector('.nav-item[data-action=theme]').click()`);
        const tab = (key) => js(`document.querySelector('main .seg button[data-tab=${JSON.stringify(key)}]')?.click()`);
        // [view, tabs to shoot; the last one switches back to the first tab]
        const views = [
          ['home'],
          ['finance', ['budgets', 'recurring', 'goals', 'ops']],
          ['accounts'],
          ['inbox'],
          ['career'],
          ['projects'],
          ['channel', ['plan', 'ads', 'stats']],
          ['tasks'],
          ['notes'],
          ['games', ['ranks', 'clips', 'wishlist']],
          ['review'],
          ['grok'],
          ['settings'],
        ];
        for (const [name, tabs] of views) {
          if (theme === 'dark' && !['home', 'finance', 'accounts', 'inbox', 'career', 'games', 'settings'].includes(name)) continue;
          await click(name);
          if (name === 'grok') await wait(6000);
          await shot(`${name}-${theme}`);
          if (name === 'home' && theme === 'light') {
            await js(`document.querySelector('[data-action=customize]').click()`);
            await shot('home-edit-light');
            await js(`document.querySelector('.edit-bar .btn.primary').click()`);
            await js(`document.querySelector('.sidebar-toggle').click()`);
            await shot('home-collapsed-light');
            await js(`document.querySelector('.sidebar-toggle').click()`);
          }
          if (name === 'accounts' && theme === 'light') {
            const esc = `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`;
            await js(`document.querySelectorAll('main .card.stat')[1].click()`);
            await shot('accounts-breakdown-light');
            await js(esc);
            await js(`document.querySelector('main .list .list-row').querySelectorAll('.btn')[2].click()`);
            await shot('accounts-trust-modal-light');
            await js(esc);
          }
          if (name === 'career' && theme === 'light') {
            await js(`document.querySelector('.status-pill .pill').click()`);
            await shot('career-status-menu-light');
            await js(`document.querySelector('.pill-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
          }
          if (name === 'settings') {
            await js(`document.querySelector('[data-section=mono]').scrollIntoView({ block: 'center' })`);
            await shot(`settings-mono-${theme}`);
            await js(`document.querySelector('[data-section=mail]').scrollIntoView({ block: 'start' })`);
            await shot(`settings-mail-${theme}`);
            await js(`document.getElementById('main').scrollTop = 1e6`);
            await shot(`settings-bottom-${theme}`);
            if (theme === 'light') {
              await js(`document.querySelector('main .seg button[data-value=spacious]').click()`);
              await click('home');
              await shot('home-spacious-light');
              await click('settings');
              await js(`document.querySelector('main .seg button[data-value=compact]').click()`);
            }
          }
          for (const t of (theme === 'light' && tabs) || []) {
            await tab(t);
            if (t !== tabs.at(-1)) await shot(`${name}-${t}-${theme}`);
          }
        }
        if (theme === 'light') {
          await click('grok');
          await js(`document.querySelector('main .chip[data-quick=money]')?.click()`);
          await wait(8000);
          log('grok toast:', await js("document.getElementById('toast')?.textContent"));
          await shot('grok-filled-light');
        }
      }
      // The quick entry window: open it, type a line, shoot it.
      await js(`window.api.quick.open()`);
      await wait(2500);
      const quick = BrowserWindow.getAllWindows().find((w) => w !== win && w.webContents.getURL().includes('quick=1'));
      if (quick) {
        await quick.webContents.executeJavaScript(`(() => { const i = document.querySelector('.quick-input'); i.value = '${lang === 'de' ? 'Taxi 12 gestern' : lang === 'uk' ? 'таксі 12 вчора' : 'такси 12 вчера'}'; i.dispatchEvent(new Event('input')); })()`);
        await wait(500);
        fs.writeFileSync(path.join(out, 'quick-entry.png'), (await quick.webContents.capturePage()).toPNG());
        quick.hide();
      }
      await click('finance');
      await js(`document.querySelector('main .page-head .btn.primary').click()`);
      await shot('finance-modal');
      fs.writeFileSync(path.join(out, 'errors.txt'), errors.join('\n'));
    } catch (err) {
      fs.writeFileSync(path.join(out, 'errors.txt'), `${errors.join('\n')}\n${err.stack}`);
    }
    app.quit();
  });
});
