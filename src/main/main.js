// Electron main process: window, data store, Grok (API streaming and the grok.com webview), Telegram page
// fetch, file export.
const { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { createStore } = require('./store');
const { createSecrets } = require('./secrets');
const { streamChat, listModels } = require('./grok');

if (process.env.PLANNER_DATA_DIR) app.setPath('userData', process.env.PLANNER_DATA_DIR);
// Keeps WebGL (pet corner) working on machines without a usable GPU.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

if (!app.requestSingleInstanceLock()) app.quit();

let win;
let store;
let secrets;
const chats = new Map();

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
// A plain Chrome user agent: some sign-in pages refuse anything that says "Electron".
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  const dir = app.getPath('userData');
  store = createStore(dir);
  secrets = createSecrets(dir);
  session.fromPartition(GROK_PARTITION).setUserAgent(CHROME_UA);
  ipcMain.handle('grokweb:logout', async () => {
    await session.fromPartition(GROK_PARTITION).clearStorageData();
    return true;
  });
  ipcMain.handle('grokweb:url', () => GROK_URL);

  ipcMain.handle('data:load', () => store.load());
  ipcMain.handle('data:save', (_e, data) => {
    store.save(data);
    return true;
  });
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataDir: dir }));
  ipcMain.handle('app:openDataDir', () => shell.openPath(dir));
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

  ipcMain.handle('grok:hasKey', () => secrets.has());
  ipcMain.handle('grok:setKey', (_e, key) => {
    secrets.set(key);
    return secrets.has();
  });
  ipcMain.handle('grok:models', async () => {
    try {
      return { ok: true, models: await listModels(secrets.get()) };
    } catch (err) {
      return { ok: false, code: err.code || 'http', message: err.message };
    }
  });
  ipcMain.handle('grok:chat', async (e, { id, model, messages }) => {
    const ctrl = new AbortController();
    chats.set(id, ctrl);
    try {
      const text = await streamChat({
        key: secrets.get(),
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
