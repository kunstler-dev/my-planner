// Dev check: starts the app on a temp data folder with demo data, opens every section in light and dark
// theme and saves screenshots. Usage: npx electron scripts/screenshots.js <outDir> [ch1,ch2]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const out = path.resolve(process.argv[2] || 'shots');
const channels = (process.argv[3] || 'durov,telegram').split(',');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-shots-'));
process.env.PLANNER_DATA_DIR = dataDir;

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
  return { version: 1, settings: { theme: 'light', currency: '₽', pets: true, petsColor: false, grokModel: 'grok-4', channel: '' }, finance, tasks, channel: { title: '', username: '', snapshots: [], posts: {}, fetchedAt: 0 }, chat: [
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
        for (const [view, name] of [['Главная', 'home'], ['Финансы', 'finance'], ['Telegram-каналы', 'channel'], ['Grok', 'grok'], ['Настройки', 'settings']]) {
          await click(view);
          await shot(`${name}-${theme}`);
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
