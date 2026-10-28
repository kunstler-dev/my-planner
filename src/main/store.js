// JSON store in userData: atomic write (tmp + rename) and a backup of the previous version.
const fs = require('fs');
const path = require('path');

const CURRENCIES = ['€', '₴'];

function defaultData() {
  return {
    version: 2,
    settings: { theme: 'light', currency: '€', pets: true, petsColor: false, grokModel: 'grok-4', activeChannel: '' },
    finance: [],
    tasks: [],
    channels: [],
    games: { steamId: '', accountId: 0, persona: '', avatar: '', tab: 'dota', dota: null, deadlock: null, cs: null },
    chat: [],
  };
}

function normalizeChannel(c) {
  return { title: '', username: '', snapshots: [], posts: {}, fetchedAt: 0, ...c };
}

function normalize(raw) {
  const d = defaultData();
  if (!raw || typeof raw !== 'object') return d;
  const settings = { ...d.settings, ...(raw.settings || {}) };
  if (!CURRENCIES.includes(settings.currency)) settings.currency = '€';
  // v1 kept a single channel in `channel`.
  let channels = Array.isArray(raw.channels) ? raw.channels : [];
  if (!channels.length && raw.channel?.username) channels = [raw.channel];
  channels = channels.map(normalizeChannel);
  if (!channels.some((c) => c.username === settings.activeChannel)) settings.activeChannel = channels[0]?.username || '';
  delete settings.channel;
  return {
    version: 2,
    settings,
    finance: Array.isArray(raw.finance) ? raw.finance : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    channels,
    games: { ...d.games, ...(raw.games || {}) },
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
