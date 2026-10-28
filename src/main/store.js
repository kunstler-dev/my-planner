// JSON store in userData: atomic write (tmp + rename) and a backup of the previous version.
const fs = require('fs');
const path = require('path');

function defaultData() {
  return {
    version: 1,
    settings: { theme: 'light', currency: '₽', pets: true, petsColor: false, grokModel: 'grok-4', channel: '' },
    finance: [],
    tasks: [],
    channel: { title: '', username: '', snapshots: [], posts: {}, fetchedAt: 0 },
    chat: [],
  };
}

function normalize(raw) {
  const d = defaultData();
  if (!raw || typeof raw !== 'object') return d;
  return {
    version: 1,
    settings: { ...d.settings, ...(raw.settings || {}) },
    finance: Array.isArray(raw.finance) ? raw.finance : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    channel: { ...d.channel, ...(raw.channel || {}) },
    chat: Array.isArray(raw.chat) ? raw.chat : [],
  };
}

function createStore(dir) {
  const file = path.join(dir, 'data.json');
  const backup = path.join(dir, 'data.backup.json');

  function read(p) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  }

  return {
    file,
    load() {
      return normalize(read(file) || read(backup));
    },
    save(data) {
      fs.mkdirSync(dir, { recursive: true });
      const json = JSON.stringify(normalize(data), null, 1);
      if (fs.existsSync(file)) fs.copyFileSync(file, backup);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, json, 'utf8');
      fs.renameSync(tmp, file);
    },
  };
}

module.exports = { createStore, defaultData, normalize };
