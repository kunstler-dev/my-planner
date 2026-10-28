// Electron main process: window, data store, Grok streaming, Telegram page fetch, file export.
const { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell } = require('electron');
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
const NET_HOSTS = ['api.opendota.com', 'api.deadlock-api.com', 'api-public.cs-prod.leetify.com', 'steamcommunity.com'];

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

  // GET to the game stats APIs and Steam profile XML only; the page itself may not open connections (CSP).
  ipcMain.handle('net:get', async (_e, url) => {
    let host;
    try {
      host = new URL(url).hostname;
    } catch {
      return { ok: false, status: 0, error: 'bad_url' };
    }
    if (!NET_HOSTS.includes(host)) return { ok: false, status: 0, error: 'host_not_allowed' };
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Planner/1.0 (desktop app)', Accept: 'application/json, text/xml' } });
      return { ok: res.ok, status: res.status, text: await res.text() };
    } catch (err) {
      return { ok: false, status: 0, error: 'network', message: err.message };
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
