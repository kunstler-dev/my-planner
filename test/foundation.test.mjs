// Data v4 migration, daily backups, named secrets and background notifications.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { isDue, toMinutes, inQuietHours, pruneNotified, shouldNotify, dueNotifications } from '../src/renderer/js/notify-calc.js';

const require = createRequire(import.meta.url);
const { normalize, defaultData, createStore, VERSION } = require('../src/main/store.js');
const { backupsToDelete, isBackupName, createBackups } = require('../src/main/backups.js');
const { fileName, NAMES } = require('../src/main/secrets.js');

const v3 = JSON.parse(fs.readFileSync(new URL('./fixtures/data-v3.json', import.meta.url), 'utf8'));

test('a version 3 file opens as version 4 without losing anything', () => {
  assert.equal(v3.version, 3);
  const d = normalize(structuredClone(v3));
  assert.equal(d.version, VERSION);
  assert.equal(VERSION, 4);
  for (const key of Object.keys(v3)) {
    if (key === 'version' || key === 'settings') continue;
    assert.deepEqual(d[key], v3[key], `section ${key} changed`);
  }
  for (const [key, value] of Object.entries(v3.settings)) assert.deepEqual(d.settings[key], value, `setting ${key} changed`);
  // New v4 fields get their defaults.
  assert.equal(d.settings.lang, 'ru');
  assert.equal(d.settings.closeToTray, true);
  assert.equal(d.settings.autoStart, false);
  assert.deepEqual(d.settings.notify, defaultData().settings.notify);
  assert.deepEqual(d.sync, {});
  assert.deepEqual(d.notified, {});
  // Saving again is stable.
  assert.deepEqual(normalize(structuredClone(d)), d);
});

test('v4 settings are validated and partly kept', () => {
  const d = normalize({ settings: { lang: 'fr', notify: { budget: false, quietFrom: '22:00' } }, sync: [1], notified: { a: '2026-01-01' } });
  assert.equal(d.settings.lang, 'ru');
  assert.equal(d.settings.notify.budget, false);
  assert.equal(d.settings.notify.quietFrom, '22:00');
  assert.equal(d.settings.notify.quietTo, '08:00');
  assert.deepEqual(d.sync, {});
  assert.deepEqual(d.notified, { a: '2026-01-01' });
  assert.equal(normalize({ settings: { lang: 'de' } }).settings.lang, 'de');
});

test('default accounts and documents keep no language-specific text in data', () => {
  const d = defaultData();
  assert.deepEqual(
    d.accounts.map((a) => [a.id, a.name]),
    [
      ['trust', ''],
      ['ua', ''],
      ['de', ''],
    ],
  );
  assert.deepEqual(
    d.career.docs.map((x) => x.id),
    ['doc0', 'doc1', 'doc2', 'doc3', 'doc4', 'doc5', 'doc6'],
  );
  assert.ok(d.career.docs.every((x) => x.title === ''));
});

test('backups: only the newest 30 daily copies stay, other files are never touched', () => {
  const names = Array.from({ length: 35 }, (_, i) => `data-2026-01-${String(i + 1).padStart(2, '0')}.json`).filter((n) => !n.includes('-01-32') && !n.includes('-01-33') && !n.includes('-01-34') && !n.includes('-01-35'));
  names.push('data-2026-02-01.json', 'data-2026-02-02.json', 'data-2026-02-03.json', 'data-2026-02-04.json', 'notes.txt', 'data.json');
  const del = backupsToDelete(names, 30);
  assert.deepEqual(del, ['data-2026-01-01.json', 'data-2026-01-02.json', 'data-2026-01-03.json', 'data-2026-01-04.json', 'data-2026-01-05.json']);
  assert.deepEqual(backupsToDelete(['data-2026-01-01.json'], 30), []);
  const before = Array.from({ length: 12 }, (_, i) => `data-before-restore-2026-01-${String(i + 1).padStart(2, '0')}T10-00-00.json`);
  assert.deepEqual(backupsToDelete(before, 30), before.slice(0, 2));
});

test('backups: names from the renderer are checked', () => {
  assert.ok(isBackupName('data-2026-10-29.json'));
  assert.ok(isBackupName('data-before-restore-2026-10-29T12-30-00.json'));
  assert.ok(!isBackupName('../data.json'));
  assert.ok(!isBackupName('data-2026-10-29.json/../../x'));
  assert.ok(!isBackupName('secret.bin'));
  assert.ok(!isBackupName(42));
});

test('store: the first save of a day copies data.json, restore keeps the current data first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-test-'));
  try {
    const store = createStore(dir);
    store.save({ notes: [{ id: 'n1', title: 'one' }] });
    assert.deepEqual(store.backups.list(), [], 'nothing to copy before the first file exists');
    store.save({ notes: [{ id: 'n1', title: 'two' }] });
    const list = store.backups.list();
    assert.equal(list.length, 1);
    assert.match(list[0].name, /^data-\d{4}-\d{2}-\d{2}\.json$/);
    store.save({ notes: [{ id: 'n1', title: 'three' }] });
    assert.equal(store.backups.list().length, 1, 'one copy per day');
    const raw = store.backups.read(list[0].name);
    assert.equal(raw.notes[0].title, 'one');
    assert.ok(store.backups.list().some((b) => b.name.startsWith('data-before-restore-')));
    assert.equal(createBackups(dir).read('../data.json'), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('secrets: the xAI key keeps the old file name, the others get their own', () => {
  assert.deepEqual(NAMES, ['xai', 'mono', 'imap', 'pin']);
  assert.equal(fileName('xai'), 'secret.bin');
  assert.equal(fileName('mono'), 'secret-mono.bin');
  assert.equal(fileName('imap'), 'secret-imap.bin');
});

test('scheduler: due tasks and quiet hours', () => {
  assert.ok(isDue(undefined, 60000, 1000));
  assert.ok(!isDue(1000, 60000, 30000));
  assert.ok(isDue(1000, 60000, 61000));
  assert.ok(isDue(90000, 60000, 1000), 'clock went backwards');
  assert.equal(toMinutes('08:30'), 510);
  assert.equal(toMinutes('24:00'), null);
  assert.equal(toMinutes('x'), null);
  assert.ok(inQuietHours(23 * 60 + 30, '23:00', '08:00'));
  assert.ok(inQuietHours(7 * 60, '23:00', '08:00'));
  assert.ok(!inQuietHours(8 * 60, '23:00', '08:00'));
  assert.ok(!inQuietHours(12 * 60, '23:00', '08:00'));
  assert.ok(inQuietHours(13 * 60, '12:00', '14:00'));
  assert.ok(!inQuietHours(13 * 60, '12:00', '12:00'));
});

test('notification journal: once a day, budgets once, old entries dropped', () => {
  const n = { id: 'a' };
  assert.ok(shouldNotify({}, n, '2026-10-29'));
  assert.ok(!shouldNotify({ a: '2026-10-29' }, n, '2026-10-29'));
  assert.ok(shouldNotify({ a: '2026-10-28' }, n, '2026-10-29'));
  assert.ok(!shouldNotify({ a: '2026-10-28' }, { id: 'a', once: true }, '2026-10-29'));
  assert.deepEqual(pruneNotified({ a: '2026-10-29', b: '2026-08-01', c: 5 }, '2026-10-29'), { a: '2026-10-29' });
});

test('due notifications for payments, budgets, follow-ups and habits', () => {
  const data = normalize({
    recurring: [
      { id: 'r1', active: true, type: 'expense', title: 'Rent', amount: 500, day: 29, next: '2026-10-29' },
      { id: 'r2', active: true, type: 'income', title: 'Salary', amount: 900, day: 30, next: '2026-10-30' },
      { id: 'r3', active: true, type: 'expense', title: 'Later', amount: 9, day: 5, next: '2026-11-05' },
      { id: 'r4', active: false, type: 'expense', title: 'Off', amount: 9, day: 29, next: '2026-10-29' },
    ],
    budgets: { Еда: 100, Транспорт: 100, Игры: 100 },
    finance: [
      { id: 'f1', type: 'expense', amount: 95, category: 'Еда', date: '2026-10-02' },
      { id: 'f2', type: 'expense', amount: 120, category: 'Транспорт', date: '2026-10-03' },
      { id: 'f3', type: 'expense', amount: 20, category: 'Игры', date: '2026-10-03' },
      { id: 'f4', type: 'expense', amount: 500, category: 'Игры', date: '2026-09-03' },
    ],
    career: { applications: [{ id: 'a1', company: 'Acme', position: 'Dev', status: 'sent', sentAt: '2026-10-20', followUp: '2026-10-27' }] },
    habits: [
      { id: 'h1', title: 'Deutsch', days: ['2026-10-29'] },
      { id: 'h2', title: 'Sport', days: [] },
    ],
  });
  const morning = dueNotifications(data, new Date(2026, 9, 29, 10, 0));
  const ids = morning.map((n) => n.id).sort();
  assert.deepEqual(ids, ['budget:near:Еда:2026-10', 'budget:over:Транспорт:2026-10', 'followUp:a1:2026-10-27', 'recurring:r1:2026-10-29:today', 'recurring:r2:2026-10-30:tomorrow']);
  assert.ok(morning.find((n) => n.type === 'budget').once);
  assert.equal(morning.find((n) => n.id.startsWith('recurring:r2')).key, 'notify.recurring.tomorrow');

  const evening = dueNotifications(data, new Date(2026, 9, 29, 20, 5));
  const habits = evening.find((n) => n.type === 'habits');
  assert.equal(habits.params.n, 1);
  assert.equal(habits.params.list, 'Sport');

  data.settings.notify = { ...data.settings.notify, recurring: false, budget: false, followUp: false, habits: false };
  assert.deepEqual(dueNotifications(data, new Date(2026, 9, 29, 21, 0)), []);
});
