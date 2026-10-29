// Electron main process: window, tray, data store with daily backups, named secrets, Windows notifications, Grok
// (API streaming and the grok.com webview), Telegram page fetch, Steam prices, the user's background/banner media,
// file export.
const { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell, session, protocol, net, Tray, Menu, Notification } = require('electron');
const { pathToFileURL } = require('url');
const fs = require('fs');
const path = require('path');
const { createStore } = require('./store');
const { createSecrets } = require('./secrets');
const { streamChat, listModels } = require('./grok');
const { validAddress, walletBalances } = require('./wallet');
const { createMono } = require('./mono');

if (process.env.PLANNER_DATA_DIR) app.setPath('userData', process.env.PLANNER_DATA_DIR);
// Keeps WebGL (pet corner) working on machines without a usable GPU.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

if (!app.requestSingleInstanceLock()) app.quit();

// The user's own background picture and banner video live in userData/media and are served as planner-media://media/<file>
// (never bundled with the app). Must be registered before the app is ready.
protocol.registerSchemesAsPrivileged([{ scheme: 'planner-media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);
const MEDIA_TYPES = {
  background: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  banner: ['mp4', 'webm', 'gif', 'png', 'jpg', 'jpeg', 'webp'],
};
const mediaDir = () => path.join(app.getPath('userData'), 'media');
const STEAM = 'https://store.steampowered.com/api';
// Ukrainian Steam store (prices in hryvnia), the user's account region.
const STEAM_CC = 'ua';

let win;
let tray = null;
let store;
let secrets;
let quitting = false;
const chats = new Map();
// Interface strings for the tray menu and system dialogs; sent by the renderer in the chosen language.
let strings = {};
const str = (key, fallback = '') => (typeof strings[key] === 'string' && strings[key]) || fallback;
// Started by Windows at login: stay in the tray.
const startHidden = process.argv.includes('--hidden');
// Notifications are kept referenced until closed, otherwise their click handler may be collected.
const shown = new Set();

// grok.com with the user's own subscription: a sandboxed <webview> with its own persistent session.
const GROK_PARTITION = 'persist:grok';
const GROK_URL = 'https://grok.com/';
const GROK_HOSTS = [/(^|\.)grok\.com$/, /(^|\.)x\.ai$/, /(^|\.)x\.com$/, /(^|\.)twitter\.com$/, /(^|\.)twimg\.com$/];
const AUTH_HOSTS = [
  /^accounts\.google\.com$/,
  /(^|\.)googleusercontent\.com$/,
  /^appleid\.apple\.com$/,
  /(^|\.)cloudflare\.com$/,
  /^github\.com$/,
  /(^|\.)githubassets\.com$/,
  /(^|\.)githubusercontent\.com$/,
];

function hostMatches(url, list) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && list.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}
const isGrokUrl = (url) => hostMatches(url, GROK_HOSTS);
const isGrokOrAuthUrl = (url) => isGrokUrl(url) || hostMatches(url, AUTH_HOSTS);

app.on('web-contents-created', (_e, contents) => {
  // Only the grok.com webview may be attached, never with node access or a preload.
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (params.partition !== GROK_PARTITION || !isGrokUrl(params.src)) event.preventDefault();
  });
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(({ url }) => {
    // Sign-in popups (X / Google / Apple) open as small windows sharing the grok.com session.
    if (isGrokOrAuthUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 720,
          parent: win,
          autoHideMenuBar: true,
          webPreferences: { partition: GROK_PARTITION, sandbox: true, contextIsolation: true, nodeIntegration: false },
        },
      };
    }
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isGrokOrAuthUrl(url)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });
});

function createWindow() {
  const data = store.load();
  nativeTheme.themeSource = data.settings.theme === 'dark' ? 'dark' : 'light';
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    title: 'Planner',
    backgroundColor: data.settings.theme === 'dark' ? '#0e0e0e' : '#fafafa',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../renderer/assets/icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true,
      // Timers of a window hidden in the tray must keep running (background checks, notifications).
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => !startHidden && win.show());
  win.on('close', (e) => {
    if (quitting || !store.load().settings.closeToTray) return;
    e.preventDefault();
    win.hide();
  });
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Asks the renderer to open a section or run a command (tray menu, notification click). */
function command(cmd) {
  showWindow();
  win?.webContents.send('app:command', cmd);
}

function buildTray() {
  const menu = Menu.buildFromTemplate([
    { label: str('main.tray.open', 'Planner'), click: showWindow },
    { type: 'separator' },
    { label: str('main.tray.expense', '+'), click: () => command({ cmd: 'expense' }) },
    { label: str('main.tray.income', '+'), click: () => command({ cmd: 'income' }) },
    { type: 'separator' },
    {
      label: str('main.tray.quit', 'Quit'),
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  if (!tray) {
    tray = new Tray(path.join(__dirname, '../renderer/assets/icon.png'));
    tray.on('click', showWindow);
  }
  tray.setToolTip('Planner');
  tray.setContextMenu(menu);
}

// Start with Windows: the portable build runs from a temporary unpack folder, so the login item has to point at
// the portable .exe itself (PORTABLE_EXECUTABLE_FILE), not at process.execPath.
let autoStartApplied = null;
function applyAutoStart(on) {
  if (!app.isPackaged || autoStartApplied === on) return;
  autoStartApplied = on;
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  app.setLoginItemSettings({ openAtLogin: !!on, path: exe, args: ['--hidden'] });
}

const NOTIFY_VIEWS = ['home', 'finance', 'accounts', 'career', 'projects', 'channel', 'tasks', 'notes', 'games', 'grok', 'settings', 'inbox'];
const clip = (v, max) => String(v ?? '').slice(0, max);

app.on('second-instance', showWindow);
app.on('before-quit', () => {
  quitting = true;
});

app.whenReady().then(() => {
  const dir = app.getPath('userData');
  store = createStore(dir);
  secrets = createSecrets(dir);

  protocol.handle('planner-media', (req) => {
    const name = path.basename(decodeURIComponent(new URL(req.url).pathname));
    const file = path.join(mediaDir(), name);
    if (!name || !fs.existsSync(file)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // Picks a file and copies it into userData/media; returns the stored file name.
  ipcMain.handle('media:choose', async (_e, kind) => {
    const exts = MEDIA_TYPES[kind];
    if (!exts) return null;
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: kind === 'banner' ? str('main.dialog.bannerTitle') : str('main.dialog.backgroundTitle'),
      properties: ['openFile'],
      filters: [{ name: kind === 'banner' ? str('main.dialog.videoAndImages', 'Media') : str('main.dialog.images', 'Images'), extensions: exts }],
    });
    if (canceled || !filePaths[0]) return null;
    const ext = path.extname(filePaths[0]).slice(1).toLowerCase();
    if (!exts.includes(ext)) return null;
    fs.mkdirSync(mediaDir(), { recursive: true });
    for (const old of fs.readdirSync(mediaDir())) if (old.startsWith(`${kind}-`)) fs.unlinkSync(path.join(mediaDir(), old));
    const name = `${kind}-${Date.now()}.${ext}`;
    fs.copyFileSync(filePaths[0], path.join(mediaDir(), name));
    return name;
  });
  ipcMain.handle('media:remove', (_e, kind) => {
    if (!MEDIA_TYPES[kind] || !fs.existsSync(mediaDir())) return true;
    for (const old of fs.readdirSync(mediaDir())) if (old.startsWith(`${kind}-`)) fs.unlinkSync(path.join(mediaDir(), old));
    return true;
  });
  /** Finds a stored media file left from before (e.g. copied in by hand) so settings can pick it up. */
  ipcMain.handle('media:list', () => (fs.existsSync(mediaDir()) ? fs.readdirSync(mediaDir()) : []));

  // Steam store (Ukrainian region): search by name, one game with its name, and current prices; no key needed.
  ipcMain.handle('steam:search', async (_e, term) => {
    try {
      const res = await fetch(`${STEAM}/storesearch/?term=${encodeURIComponent(String(term).slice(0, 80))}&l=russian&cc=${STEAM_CC}`);
      if (!res.ok) return { ok: false, error: 'http' };
      return { ok: true, items: (await res.json()).items || [] };
    } catch (err) {
      return { ok: false, error: 'network', message: err.message };
    }
  });
  ipcMain.handle('steam:app', async (_e, id) => {
    const appId = Number(id);
    if (!Number.isInteger(appId) || appId <= 0) return { ok: false, error: 'bad_id' };
    try {
      const res = await fetch(`${STEAM}/appdetails?appids=${appId}&cc=${STEAM_CC}&filters=basic,price_overview&l=russian`);
      if (!res.ok) return { ok: false, error: 'http' };
      const entry = (await res.json())[appId];
      if (!entry?.success) return { ok: false, error: 'not_found' };
      return { ok: true, name: entry.data.name, image: entry.data.capsule_image || entry.data.header_image || '', overview: entry.data.price_overview || null, free: !!entry.data.is_free };
    } catch (err) {
      return { ok: false, error: 'network', message: err.message };
    }
  });
  ipcMain.handle('steam:prices', async (_e, ids) => {
    const list = (ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
    if (!list.length) return { ok: true, prices: {} };
    try {
      const res = await fetch(`${STEAM}/appdetails?appids=${list.join(',')}&cc=${STEAM_CC}&filters=price_overview`);
      if (!res.ok) return { ok: false, error: 'http' };
      return { ok: true, prices: await res.json() };
    } catch (err) {
      return { ok: false, error: 'network', message: err.message };
    }
  });
  ipcMain.handle('grokweb:logout', async () => {
    await session.fromPartition(GROK_PARTITION).clearStorageData();
    return true;
  });
  ipcMain.handle('grokweb:url', () => GROK_URL);

  ipcMain.handle('data:load', () => store.load());
  ipcMain.handle('data:save', (_e, data) => {
    store.save(data);
    applyAutoStart(!!data?.settings?.autoStart);
    return true;
  });
  // demo: dev runs on demo data (PLANNER_SILENT) skip notifications and background bank/wallet updates.
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataDir: dir, packaged: app.isPackaged, demo: !!process.env.PLANNER_SILENT }));
  ipcMain.handle('app:openDataDir', () => shell.openPath(dir));
  // Translated strings for the main process (tray, dialogs); the tray appears once they arrive.
  ipcMain.handle('app:strings', (_e, dict) => {
    if (!dict || typeof dict !== 'object') return false;
    strings = Object.fromEntries(
      Object.entries(dict)
        .filter(([k, v]) => k.startsWith('main.') && typeof v === 'string')
        .map(([k, v]) => [k, v.slice(0, 200)]),
    );
    buildTray();
    return true;
  });

  // Daily backups: list, restore (current data is kept as data-before-restore-<time>.json first), open the folder.
  ipcMain.handle('backups:list', () => store.backups.list());
  ipcMain.handle('backups:restore', (_e, name) => {
    const raw = store.backups.read(name);
    if (!raw) return { ok: false };
    store.save(raw);
    return { ok: true, data: store.load() };
  });
  ipcMain.handle('backups:open', () => {
    fs.mkdirSync(store.backups.folder, { recursive: true });
    return shell.openPath(store.backups.folder);
  });

  // Windows notification; a click opens the window on the given section.
  ipcMain.handle('app:notify', (_e, msg) => {
    // PLANNER_SILENT: dev runs on demo data (screenshots) must not show real notifications.
    if (process.env.PLANNER_SILENT || !Notification.isSupported() || !msg || typeof msg !== 'object') return false;
    const view = NOTIFY_VIEWS.includes(msg.view) ? msg.view : 'home';
    const n = new Notification({ title: clip(msg.title, 120) || 'Planner', body: clip(msg.body, 300), icon: path.join(__dirname, '../renderer/assets/icon.png') });
    shown.add(n);
    n.on('click', () => command({ cmd: 'go', view }));
    n.on('close', () => shown.delete(n));
    n.show();
    setTimeout(() => shown.delete(n), 10 * 60 * 1000);
    return true;
  });
  ipcMain.handle('theme:set', (_e, theme) => {
    nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light';
  });

  ipcMain.handle('file:save', async (_e, { name, content }) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: name });
    if (canceled || !filePath) return false;
    // BOM so Excel opens Cyrillic CSV correctly.
    fs.writeFileSync(filePath, '﻿' + content, 'utf8');
    return true;
  });

  // Official NBU exchange rates (UAH per EUR / USD) for converting account balances.
  ipcMain.handle('rates:fetch', async () => {
    try {
      const res = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?json');
      if (!res.ok) return { ok: false, error: 'http' };
      const list = await res.json();
      return { ok: true, list: list.filter((x) => x.cc === 'EUR' || x.cc === 'USD').map((x) => ({ cc: x.cc, rate: x.rate, date: x.exchangedate })) };
    } catch (err) {
      return { ok: false, error: 'network', message: err.message };
    }
  });

  // Public channel preview page t.me/s/<name>; parsed in the renderer.
  ipcMain.handle('tg:fetch', async (_e, { username, before }) => {
    const name = String(username || '').replace(/[^A-Za-z0-9_]/g, '');
    if (!name) return { ok: false, error: 'bad_name' };
    const url = `https://t.me/s/${name}${before ? `?before=${Number(before)}` : ''}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Accept-Language': 'ru' },
        redirect: 'manual',
      });
      if (res.status !== 200) return { ok: false, error: 'not_public' };
      return { ok: true, html: await res.text() };
    } catch (err) {
      return { ok: false, error: 'network', message: err.message };
    }
  });

  // Trust Wallet: public addresses only, checked here again.
  ipcMain.handle('wallet:balances', async (_e, list) => {
    const addresses = (Array.isArray(list) ? list : [])
      .slice(0, 20)
      .map((x) => ({ network: String(x?.network || ''), address: String(x?.address || '').trim() }))
      .filter((x) => validAddress(x.network, x.address));
    if (!addresses.length) return { ok: false, error: 'no_addresses' };
    try {
      return { ok: true, ...(await walletBalances(addresses)) };
    } catch (err) {
      return { ok: false, error: err.code || 'network', message: err.message };
    }
  });

  // Monobank: the token stays here; only the fields the planner needs go to the page (no name, ids for
  // send.monobank.ua, webhook or full card numbers).
  const mono = createMono(() => secrets.get('mono'));
  ipcMain.handle('mono:clientInfo', async () => {
    const res = await mono.clientInfo();
    if (!res.ok) return res;
    const d = res.data || {};
    return {
      ok: true,
      accounts: (d.accounts || []).map((a) => ({
        id: String(a.id),
        currencyCode: Number(a.currencyCode),
        balance: Number(a.balance) || 0,
        creditLimit: Number(a.creditLimit) || 0,
        type: String(a.type || ''),
        pan: String((a.maskedPan || [])[0] || '').slice(-4),
      })),
      jars: (d.jars || []).map((j) => ({ id: String(j.id), title: String(j.title || '').slice(0, 80), currencyCode: Number(j.currencyCode), balance: Number(j.balance) || 0, goal: Number(j.goal) || 0 })),
    };
  });
  ipcMain.handle('mono:statement', (_e, account, from, to) => mono.statement(account, from, to));

  // The renderer may only ask whether a secret exists and replace it; values never leave the main process.
  // The PIN will get its own handler (stored as a hash), so it is not settable here.
  const RENDERER_SECRETS = ['xai', 'mono', 'imap'];
  ipcMain.handle('secret:has', (_e, name) => (RENDERER_SECRETS.includes(name) || name === 'pin' ? secrets.has(name) : false));
  ipcMain.handle('secret:set', (_e, name, value) => {
    if (!RENDERER_SECRETS.includes(name) || (value != null && typeof value !== 'string') || String(value ?? '').length > 4096) return false;
    secrets.set(name, value);
    return secrets.has(name);
  });
  ipcMain.handle('grok:models', async () => {
    try {
      return { ok: true, models: await listModels(secrets.get('xai')) };
    } catch (err) {
      return { ok: false, code: err.code || 'http', message: err.message };
    }
  });
  ipcMain.handle('grok:chat', async (e, { id, model, messages }) => {
    const ctrl = new AbortController();
    chats.set(id, ctrl);
    try {
      const text = await streamChat({
        key: secrets.get('xai'),
        model,
        messages,
        signal: ctrl.signal,
        onDelta: (delta) => e.sender.send('grok:delta', { id, delta }),
      });
      return { ok: true, text };
    } catch (err) {
      return { ok: false, code: err.code || 'http', message: err.message };
    } finally {
      chats.delete(id);
    }
  });
  ipcMain.handle('grok:abort', (_e, id) => chats.get(id)?.abort());

  createWindow();
});

app.on('window-all-closed', () => app.quit());
