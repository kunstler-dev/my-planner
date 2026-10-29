// PIN hashing and lockout, version comparison, the search index and the pets' mood.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { compareVersions, isNewer } from '../src/renderer/js/update-calc.js';
import { buildIndex, search, matchScore } from '../src/renderer/js/search-index.js';
import { petMood } from '../src/renderer/js/pet-mood.js';

const require = createRequire(import.meta.url);
const { createPin, hashPin, checkPin, lockoutMs, validPin } = require('../src/main/pin.js');

test('PIN: 4–8 digits, salted hash, checked in constant time', () => {
  assert.ok(validPin('1234') && validPin('12345678'));
  assert.ok(!validPin('123') && !validPin('123456789') && !validPin('12a4') && !validPin(1234));
  const a = hashPin('2468');
  const b = hashPin('2468');
  assert.notEqual(a, b, 'random salt');
  assert.ok(!a.includes('2468'));
  assert.ok(checkPin('2468', a));
  assert.ok(!checkPin('2469', a));
  assert.ok(!checkPin('2468', 'garbage'));
});

test('PIN: growing pause after 5 wrong tries, kept across restarts', () => {
  assert.deepEqual([0, 4, 5, 6, 7, 20].map(lockoutMs), [0, 0, 30000, 60000, 120000, 3600000]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-pin-'));
  const store = {};
  const secrets = { has: (n) => !!store[n], get: (n) => store[n] || null, set: (n, v) => (v ? (store[n] = v) : delete store[n]) };
  let now = 1000;
  try {
    const pin = createPin(dir, secrets, () => now);
    assert.deepEqual(pin.verify('0000'), { ok: true }, 'no PIN → open');
    assert.deepEqual(pin.set('12', null), { ok: false, error: 'format' });
    assert.deepEqual(pin.set('1357', null), { ok: true });
    assert.ok(pin.has());
    for (let i = 0; i < 4; i++) assert.equal(pin.verify('0000').wait, 0);
    const fifth = pin.verify('0000');
    assert.equal(fifth.wait, 30000);
    assert.equal(pin.verify('1357').ok, false, 'even the right PIN waits');
    // A restart keeps the counter.
    const again = createPin(dir, secrets, () => now);
    assert.ok(again.verify('1357').wait > 0);
    now += 30001;
    assert.deepEqual(again.verify('1357'), { ok: true });
    assert.equal(again.set('2468', '0000').error, 'wrong', 'changing needs the current PIN');
    assert.deepEqual(again.set(null, '1357'), { ok: true });
    assert.ok(!again.has());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('versions', () => {
  assert.equal(compareVersions('v1.12.0', '1.11.0'), 1);
  assert.equal(compareVersions('1.9.0', '1.10.0'), -1);
  assert.equal(compareVersions('1.10', '1.10.0'), 0);
  assert.equal(compareVersions('1.12.0-beta.1', '1.12.0'), -1);
  assert.equal(compareVersions('nightly', '1.0.0'), null);
  assert.ok(isNewer('v2.0.0', '1.12.0'));
  assert.ok(!isNewer('1.12.0', '1.12.0'));
});

test('search index: everything searchable, fuzzy, recent first', () => {
  const data = {
    notes: [{ id: 'n1', title: 'Вопросы на собеседование', text: 'Wie sieht ein Tag aus?', updatedAt: '2026-10-20' }],
    tasks: [{ id: 't1', title: 'Оплатить интернет', date: '2026-10-29' }],
    finance: [
      { id: 'e1', type: 'expense', amount: 12.5, category: 'Еда', note: 'Кофе', date: '2026-10-28' },
      { id: 'e2', type: 'expense', amount: 3, category: 'Еда', note: 'Кофе', date: '2026-10-29' },
    ],
    career: { applications: [{ id: 'a1', company: 'Siemens', position: 'Fachinformatiker', city: 'München' }] },
    projects: [{ id: 'p1', name: 'Planner' }],
    wishlist: [{ id: 570, name: 'Dota 2' }],
    channels: [{ username: 'durov', title: 'Durov' }],
    inbox: [{ id: 'i1', status: 'new', title: 'Vodafone', sender: 'rechnung@vodafone.test' }],
  };
  const idx = buildIndex(data);
  assert.equal(idx.length, 9);
  assert.equal(search(idx, 'siem')[0].id, 'a1');
  assert.equal(search(idx, 'фахинф').length, 0);
  assert.deepEqual(
    search(idx, 'кофе').map((x) => x.id),
    ['e2', 'e1'],
    'recent first',
  );
  assert.equal(search(idx, 'plnr')[0].id, 'p1', 'letters in order');
  assert.equal(search(idx, '12.5')[0].id, 'e1', 'by amount');
  assert.equal(search(idx, 'vodafone')[0].kind, 'inbox');
  assert.ok(matchScore('Einladung', 'einl') > matchScore('Neue Einladung', 'einl'));
});

test('pet mood', () => {
  const at = (h) => new Date(2026, 9, 29, h, 0);
  assert.equal(petMood({}, at(2)).mood, 'sleepy');
  assert.equal(petMood({}, at(12)).mood, 'neutral');
  assert.deepEqual(petMood({ inbox: [{ kind: 'alert', status: 'new' }] }, at(12)), { mood: 'sad', reason: 'pet.sad.alert' });
  assert.equal(petMood({ budgets: { Еда: 10 }, finance: [{ type: 'expense', category: 'Еда', amount: 11, date: '2026-10-02' }] }, at(12)).reason, 'pet.sad.budget');
  assert.equal(petMood({ tasks: [{ done: false, date: '2026-10-20' }] }, at(12)).reason, 'pet.sad.overdue');
  assert.equal(petMood({ habits: [{ days: ['2026-10-29'] }] }, at(12)).reason, 'pet.happy.habits');
  assert.equal(petMood({ tasks: [{ done: true, doneAt: '2026-10-29' }] }, at(12)).reason, 'pet.happy.task');
  assert.equal(petMood({ career: { applications: [{ sentAt: '2026-10-29' }] } }, at(12)).reason, 'pet.happy.applied');
});
