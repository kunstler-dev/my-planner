// JSON store in userData: atomic write (tmp + rename), a backup of the previous version and daily copies.
// defaultData() and normalize() are the migration: any older file is read into the current shape.
const fs = require('fs');
const path = require('path');
const { createBackups } = require('./backups');

const VERSION = 4;
const CURRENCIES = ['€', '₴'];
const LANGS = ['ru', 'uk', 'de'];

// Standard names are left empty and shown translated in the interface (older files keep their own text).
function defaultAccounts() {
  return [
    { id: 'trust', name: '', currency: '$', balance: 0, updatedAt: '', history: [] },
    { id: 'ua', name: '', currency: '₴', balance: 0, updatedAt: '', history: [] },
    { id: 'de', name: '', currency: '€', balance: 0, updatedAt: '', history: [] },
  ];
}

// Bewerbung checklist for Germany: doc0–doc6, titles come from the language files until edited.
function defaultDocs() {
  return Array.from({ length: 7 }, (_, i) => ({ id: `doc${i}`, title: '', done: false }));
}

// Notification types are switched on by default; quiet hours 23:00–08:00.
function defaultNotify() {
  return { recurring: true, budget: true, followUp: true, habits: true, bills: true, alerts: true, habitsAt: '20:00', quietFrom: '23:00', quietTo: '08:00' };
}

function defaultData() {
  return {
    version: VERSION,
    settings: {
      theme: 'light',
      lang: 'ru',
      currency: '€',
      pets: true,
      petsColor: false,
      grokModel: 'grok-4',
      grokMode: 'web',
      activeChannel: '',
      background: '',
      banner: '',
      veil: 70,
      closeToTray: true,
      autoStart: false,
      notify: defaultNotify(),
      density: 'compact',
      // Home cards: { order: [id…], hidden: [id…] }; ids unknown to this version are kept for newer ones.
      homeLayout: { order: [], hidden: [] },
      sidebarCollapsed: false,
      // Gmail (read only): the app password is the secret «imap», never here.
      mail: defaultMail(),
    },
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
    wishlist: [],
    ranks: { dota: { goal: null, entries: [] }, faceit: { goal: null, entries: [] }, deadlock: { goal: null, entries: [] } },
    clips: [],
    chat: [],
    // Background scheduler: task id → last run (ms).
    sync: {},
    // Notification journal: id → date it was last shown (one per day).
    notified: {},
    // «Always this category for …» rules for imported operations and e-mails.
    rules: [],
    // Operations and messages waiting for a decision.
    inbox: [],
    // Monobank cache from client-info (no names or full card numbers) and the newest operation time per account.
    mono: defaultMono(),
    // Sender rules for letters; empty = the built-in ones.
    mailRules: [],
    // Bills from letters with a due date: { id, title, amount, dueDate, paid, ref, category }.
    bills: [],
  };
}

function defaultMail() {
  return { enabled: false, address: '', interval: 15, grok: false };
}

function defaultMono() {
  return { accounts: [], jars: [], fetchedAt: 0, last: {}, error: '' };
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function normalizeChannel(c) {
  return { title: '', username: '', snapshots: [], posts: {}, fetchedAt: 0, ...c };
}

const arr = (v) => (Array.isArray(v) ? v : []);

function normalize(raw) {
  const d = defaultData();
  if (!raw || typeof raw !== 'object') return d;
  const settings = { ...d.settings, ...obj(raw.settings) };
  if (!CURRENCIES.includes(settings.currency)) settings.currency = '€';
  if (!LANGS.includes(settings.lang)) settings.lang = 'ru';
  settings.notify = { ...defaultNotify(), ...obj(raw.settings?.notify) };
  if (!['compact', 'spacious'].includes(settings.density)) settings.density = 'compact';
  const layout = obj(raw.settings?.homeLayout);
  const ids = (v) => arr(v).filter((x) => typeof x === 'string');
  settings.homeLayout = { order: ids(layout.order), hidden: ids(layout.hidden) };
  settings.sidebarCollapsed = settings.sidebarCollapsed === true;
  settings.mail = { ...defaultMail(), ...obj(raw.settings?.mail) };
  if (![5, 15, 30, 60].includes(settings.mail.interval)) settings.mail.interval = 15;
  // v1 kept a single channel in `channel`.
  let channels = arr(raw.channels);
  if (!channels.length && raw.channel?.username) channels = [raw.channel];
  channels = channels.map(normalizeChannel);
  if (!channels.some((c) => c.username === settings.activeChannel)) settings.activeChannel = channels[0]?.username || '';
  delete settings.channel;
  return {
    version: VERSION,
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
    wishlist: arr(raw.wishlist),
    ranks: Object.fromEntries(
      Object.entries(d.ranks).map(([k, v]) => [k, { goal: raw.ranks?.[k]?.goal ?? v.goal, entries: arr(raw.ranks?.[k]?.entries) }]),
    ),
    clips: arr(raw.clips),
    chat: arr(raw.chat),
    sync: obj(raw.sync),
    notified: obj(raw.notified),
    rules: arr(raw.rules),
    inbox: arr(raw.inbox),
    mailRules: arr(raw.mailRules),
    bills: arr(raw.bills),
    mono: { ...defaultMono(), ...obj(raw.mono), accounts: arr(raw.mono?.accounts), jars: arr(raw.mono?.jars), last: obj(raw.mono?.last) },
  };
}

function createStore(dir) {
  const file = path.join(dir, 'data.json');
  const backup = path.join(dir, 'data.backup.json');
  const backups = createBackups(dir);

  function read(p) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      return null;
    }
  }

  return {
    file,
    backups,
    load() {
      return normalize(read(file) || read(backup));
    },
    save(data) {
      fs.mkdirSync(dir, { recursive: true });
      const json = JSON.stringify(normalize(data), null, 1);
      try {
        backups.daily();
      } catch {
        // a failed daily copy must never block saving
      }
      if (fs.existsSync(file)) fs.copyFileSync(file, backup);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, json, 'utf8');
      fs.renameSync(tmp, file);
    },
  };
}

module.exports = { createStore, defaultData, normalize, VERSION };
