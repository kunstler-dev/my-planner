// JSON store in userData: atomic write (tmp + rename) and a backup of the previous version.
const fs = require('fs');
const path = require('path');

const CURRENCIES = ['€', '₴'];

function defaultAccounts() {
  return [
    { id: 'trust', name: 'Trust Wallet (крипта)', currency: '$', balance: 0, updatedAt: '', history: [] },
    { id: 'ua', name: 'Украинская карта', currency: '₴', balance: 0, updatedAt: '', history: [] },
    { id: 'de', name: 'Немецкая карта', currency: '€', balance: 0, updatedAt: '', history: [] },
  ];
}

// Bewerbung checklist for Germany.
function defaultDocs() {
  return [
    'Lebenslauf (резюме, с фото)',
    'Anschreiben — шаблон',
    'Zeugnisse — переводы аттестата/диплома',
    'Sprachzertifikat (B1/B2)',
    'Aufenthaltstitel / разрешение на работу',
    'Anerkennung — признание школьного аттестата',
    'Профиль на Arbeitsagentur / Azubiyo / Indeed',
  ].map((title, i) => ({ id: `doc${i}`, title, done: false }));
}

function defaultData() {
  return {
    version: 3,
    settings: { theme: 'light', currency: '€', pets: true, petsColor: false, grokModel: 'grok-4', grokMode: 'web', activeChannel: '' },
    // Units of each currency per 1 €; refreshed from the NBU or typed by hand.
    rates: { '€': 1, '₴': 48, $: 1.08, updatedAt: '' },
    accounts: defaultAccounts(),
    finance: [],
    budgets: {},
    recurring: [],
    goals: [],
    tasks: [],
    habits: [],
    notes: [],
    channels: [],
    contentPlan: [],
    ads: [],
    career: { applications: [], docs: defaultDocs(), weeklyGoal: 5 },
    projects: [],
    play: { sessions: [], rewards: { task: 15, application: 30, habit: 10, milestone: 30 } },
    chat: [],
  };
}

function normalizeChannel(c) {
  return { title: '', username: '', snapshots: [], posts: {}, fetchedAt: 0, ...c };
}

const arr = (v) => (Array.isArray(v) ? v : []);

function normalize(raw) {
  const d = defaultData();
  if (!raw || typeof raw !== 'object') return d;
  const settings = { ...d.settings, ...(raw.settings || {}) };
  if (!CURRENCIES.includes(settings.currency)) settings.currency = '€';
  // v1 kept a single channel in `channel`.
  let channels = arr(raw.channels);
  if (!channels.length && raw.channel?.username) channels = [raw.channel];
  channels = channels.map(normalizeChannel);
  if (!channels.some((c) => c.username === settings.activeChannel)) settings.activeChannel = channels[0]?.username || '';
  delete settings.channel;
  return {
    version: 3,
    settings,
    rates: { ...d.rates, ...(raw.rates || {}) },
    accounts: Array.isArray(raw.accounts) ? raw.accounts : d.accounts,
    finance: arr(raw.finance),
    budgets: raw.budgets && typeof raw.budgets === 'object' ? raw.budgets : {},
    recurring: arr(raw.recurring),
    goals: arr(raw.goals),
    tasks: arr(raw.tasks),
    habits: arr(raw.habits),
    notes: arr(raw.notes),
    channels,
    contentPlan: arr(raw.contentPlan),
    ads: arr(raw.ads),
    career: {
      ...d.career,
      ...(raw.career || {}),
      applications: arr(raw.career?.applications),
      docs: Array.isArray(raw.career?.docs) ? raw.career.docs : d.career.docs,
    },
    projects: arr(raw.projects),
    play: { sessions: arr(raw.play?.sessions), rewards: { ...d.play.rewards, ...(raw.play?.rewards || {}) } },
    chat: arr(raw.chat),
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
