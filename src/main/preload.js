// The only bridge between the page and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const deltaListeners = new Set();
ipcRenderer.on('grok:delta', (_e, msg) => deltaListeners.forEach((fn) => fn(msg)));
const commandListeners = new Set();
ipcRenderer.on('app:command', (_e, msg) => commandListeners.forEach((fn) => fn(msg)));

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  info: () => ipcRenderer.invoke('app:info'),
  openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
  setStrings: (dict) => ipcRenderer.invoke('app:strings', dict),
  notify: (msg) => ipcRenderer.invoke('app:notify', msg),
  /** Tray menu and notification clicks: { cmd: 'go', view } | { cmd: 'expense' } | { cmd: 'income' }. */
  onCommand: (fn) => {
    commandListeners.add(fn);
    return () => commandListeners.delete(fn);
  },
  secrets: {
    has: (name) => ipcRenderer.invoke('secret:has', name),
    set: (name, value) => ipcRenderer.invoke('secret:set', name, value),
  },
  wallet: {
    balances: (addresses) => ipcRenderer.invoke('wallet:balances', addresses),
  },
  mono: {
    clientInfo: () => ipcRenderer.invoke('mono:clientInfo'),
    statement: (account, from, to) => ipcRenderer.invoke('mono:statement', account, from, to),
  },
  backups: {
    list: () => ipcRenderer.invoke('backups:list'),
    restore: (name) => ipcRenderer.invoke('backups:restore', name),
    open: () => ipcRenderer.invoke('backups:open'),
  },
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  saveFile: (name, content) => ipcRenderer.invoke('file:save', { name, content }),
  tgFetch: (username, before) => ipcRenderer.invoke('tg:fetch', { username, before }),
  fetchRates: () => ipcRenderer.invoke('rates:fetch'),
  media: {
    choose: (kind) => ipcRenderer.invoke('media:choose', kind),
    remove: (kind) => ipcRenderer.invoke('media:remove', kind),
    list: () => ipcRenderer.invoke('media:list'),
  },
  steam: {
    search: (term) => ipcRenderer.invoke('steam:search', term),
    prices: (ids) => ipcRenderer.invoke('steam:prices', ids),
    app: (id) => ipcRenderer.invoke('steam:app', id),
  },
  grokWeb: {
    logout: () => ipcRenderer.invoke('grokweb:logout'),
  },
  grok: {
    hasKey: () => ipcRenderer.invoke('secret:has', 'xai'),
    setKey: (key) => ipcRenderer.invoke('secret:set', 'xai', key),
    models: () => ipcRenderer.invoke('grok:models'),
    chat: (id, model, messages) => ipcRenderer.invoke('grok:chat', { id, model, messages }),
    abort: (id) => ipcRenderer.invoke('grok:abort', id),
    onDelta: (fn) => {
      deltaListeners.add(fn);
      return () => deltaListeners.delete(fn);
    },
  },
});
