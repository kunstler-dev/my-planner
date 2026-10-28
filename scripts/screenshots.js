// Dev check: starts the app on a temp data folder with demo data, opens every section in light and dark
// theme and saves screenshots. Usage: npx electron scripts/screenshots.js <outDir> [ch1,ch2]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const out = path.resolve(process.argv[2] || 'shots');
const channels = (process.argv[3] || 'durov').split(',');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-shots-'));
process.env.PLANNER_DATA_DIR = dataDir;
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
      { id: 'trust', name: 'Trust Wallet (крипта)', currency: '$', balance: 840, updatedAt: day(3), history: [{ date: day(20), balance: 700 }, { date: day(3), balance: 840 }] },
      { id: 'ua', name: 'Украинская карта', currency: '₴', balance: 12500, updatedAt: day(1), history: [{ date: day(20), balance: 9000 }, { date: day(1), balance: 12500 }] },
      { id: 'de', name: 'Немецкая карта', currency: '€', balance: 1630, updatedAt: day(0), history: [{ date: day(20), balance: 1200 }, { date: day(0), balance: 1630 }] },
    ],
    budgets: { Еда: 12000, Развлечения: 2000, Транспорт: 4000 },
    recurring: [
      { id: 'r1', active: true, type: 'expense', title: 'Аренда', amount: 25000, category: 'Жильё', day: 1, next: day(-4) },
      { id: 'r2', active: true, type: 'expense', title: 'Spotify', amount: 11, category: 'Связь и подписки', day: 2, next: day(-5) },
      { id: 'r3', active: true, type: 'income', title: 'Зарплата', amount: 60000, category: 'Зарплата', day: 25, next: day(-27) },
    ],
    goals: [{ id: 'g1', title: 'Подушка безопасности', target: 3000, deadline: day(-180), contributions: [{ amount: 900, date: day(30) }] }],
    habits: [
      { id: 'h1', title: '30 минут немецкого', days: [day(0), day(1), day(2), day(3), day(5)] },
      { id: 'h2', title: 'Один отклик в день', days: [day(1), day(2)] },
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
        { id: 'p2', company: 'Siemens', position: 'Fachinformatiker Systemintegration', kind: 'ausbildung', city: 'München', status: 'interview', sentAt: day(15) },
        { id: 'p3', company: 'REWE', position: 'Kaufmann im Einzelhandel', kind: 'ausbildung', city: 'Köln', status: 'wish' },
        { id: 'p4', company: 'Lidl', position: 'Werkstudent IT', kind: 'werkstudent', city: 'Berlin', status: 'sent', sentAt: day(1) },
        { id: 'p5', company: 'Zalando', position: 'Praktikum Frontend', kind: 'praktikum', city: 'Berlin', status: 'rejected', sentAt: day(25) },
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
  return { ...v3, version: 1, settings: { theme: 'light', currency: '₽', pets: true, petsColor: false, grokModel: 'grok-4', channel: '' }, finance, tasks, channel: { title: '', username: '', snapshots: [], posts: {}, fetchedAt: 0 }, chat: [
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
    const click = (text) => js(`[...document.querySelectorAll('.nav-item')].find(b => b.textContent.trim() === ${JSON.stringify(text)})?.click()`);
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
      await click('Telegram-каналы');
      for (const [i, ch] of channels.entries()) {
        if (i) await js(`[...document.querySelectorAll('main .btn')].find(b => b.textContent.trim() === 'Канал').click()`);
        await until(`!!document.querySelector('main form input')`);
        await submitInput(ch);
        await until(`document.querySelectorAll('main .stat-value').length > 0 && !document.querySelector('main form input')`, 30000);
        log('channel added', ch);
      }
      for (const theme of ['light', 'dark']) {
        if (theme === 'dark') await click('Тёмная тема');
        const tab = (label) => js(`[...document.querySelectorAll('main .seg button')].find(b => b.textContent === ${JSON.stringify(label)})?.click()`);
        const views = [
          ['Главная', 'home'],
          ['Финансы', 'finance', ['Бюджеты', 'Регулярные платежи', 'Цели', 'Операции']],
          ['Счета', 'accounts'],
          ['Карьера', 'career'],
          ['Проекты', 'projects'],
          ['Telegram-каналы', 'channel', ['Контент-план', 'Реклама', 'Аналитика']],
          ['Задачи и привычки', 'tasks'],
          ['Заметки', 'notes'],
          ['Игры', 'games', ['Ранги', 'Контент', 'Вишлист Steam']],
          ['Grok', 'grok'],
          ['Настройки', 'settings'],
        ];
        for (const [view, name, tabs] of views) {
          if (theme === 'dark' && !['home', 'finance', 'career', 'games', 'settings'].includes(name)) continue;
          await click(view);
          if (name === 'grok') await wait(6000);
          await shot(`${name}-${theme}`);
          for (const t of (theme === 'light' && tabs) || []) {
            if (t === tabs.at(-1)) {
              await tab(t);
              continue;
            }
            await tab(t);
            await shot(`${name}-${t.split(' ')[0].toLowerCase()}-${theme}`);
          }
        }
        if (theme === 'light') {
          await click('Grok');
          await js(`[...document.querySelectorAll('main .chip')].find(b => b.textContent === 'Разбор денег')?.click()`);
          await wait(8000);
          log('grok toast:', await js("document.getElementById('toast')?.textContent"));
          await shot('grok-filled-light');
        }
      }
      await click('Финансы');
      await js(`[...document.querySelectorAll('main .btn')].find(b => b.textContent.includes('Расход')).click()`);
      await shot('finance-modal');
      fs.writeFileSync(path.join(out, 'errors.txt'), errors.join('\n'));
    } catch (err) {
      fs.writeFileSync(path.join(out, 'errors.txt'), `${errors.join('\n')}\n${err.stack}`);
    }
    app.quit();
  });
});
