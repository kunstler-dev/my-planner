// The only bridge between the page and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const deltaListeners = new Set();
ipcRenderer.on('grok:delta', (_e, msg) => deltaListeners.forEach((fn) => fn(msg)));

contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('data:load'),
  save: (data) => ipcRenderer.invoke('data:save', data),
  info: () => ipcRenderer.invoke('app:info'),
  openDataDir: () => ipcRenderer.invoke('app:openDataDir'),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  saveFile: (name, content) => ipcRenderer.invoke('file:save', { name, content }),
  tgFetch: (username, before) => ipcRenderer.invoke('tg:fetch', { username, before }),
  grok: {
    hasKey: () => ipcRenderer.invoke('grok:hasKey'),
    setKey: (key) => ipcRenderer.invoke('grok:setKey', key),
    models: () => ipcRenderer.invoke('grok:models'),
    chat: (id, model, messages) => ipcRenderer.invoke('grok:chat', { id, model, messages }),
    abort: (id) => ipcRenderer.invoke('grok:abort', id),
    onDelta: (fn) => {
      deltaListeners.add(fn);
      return () => deltaListeners.delete(fn);
    },
  },
});
