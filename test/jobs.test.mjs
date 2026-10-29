// Job searches: query parameters, new ads without repeats, applications created from ads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobQuery, newJobs, jobToApplication, jobLink, MAX_NEW_PER_SEARCH } from '../src/renderer/js/jobs-calc.js';
import { dueNotifications } from '../src/renderer/js/notify-calc.js';
import { createRequire } from 'node:module';

const { normalize } = createRequire(import.meta.url)('../src/main/store.js');

test('saved search → query', () => {
  assert.deepEqual(jobQuery({ was: 'Fachinformatiker', wo: 'Berlin', umkreis: 30, type: 'ausbildung' }), { was: 'Fachinformatiker', wo: 'Berlin', umkreis: 30, angebotsart: 4, veroeffentlichtseit: 7, page: 1, size: 50 });
  assert.equal(jobQuery({ was: 'IT', wo: 'Köln', type: 'werkstudent' }).was, 'Werkstudent IT');
  assert.equal(jobQuery({ was: 'Werkstudent IT', wo: 'Köln', type: 'werkstudent' }).was, 'Werkstudent IT');
  assert.equal(jobQuery({ was: 'Koch', wo: 'X', type: 'job', umkreis: 999 }).umkreis, 200);
  assert.equal(jobQuery({ was: 'Koch', wo: 'X', type: 'job' }).angebotsart, 1);
});

test('new ads: no repeats, nothing «not interested», at most 20', () => {
  const jobs = Array.from({ length: 30 }, (_, i) => ({ refnr: `r${i}`, title: `Job ${i}` }));
  const out = newJobs([{ refnr: 'r0' }, ...jobs], { applications: [{ refnr: 'r1' }], ignored: ['r2'] });
  assert.equal(out.length, MAX_NEW_PER_SEARCH);
  assert.deepEqual(
    out.slice(0, 3).map((j) => j.refnr),
    ['r0', 'r3', 'r4'],
  );
  assert.deepEqual(newJobs([{ title: 'no refnr' }], {}), []);
});

test('ad → application «want to send», marked new, with the link', () => {
  const a = jobToApplication({ refnr: '10000-1-S', title: 'Ausbildung Fachinformatiker', company: 'Example GmbH', city: 'Berlin', published: '2026-10-22', start: '2027-08-01' }, { type: 'ausbildung' }, '2026-10-29', () => 'id1');
  assert.deepEqual(a, {
    id: 'id1',
    createdAt: '2026-10-29',
    company: 'Example GmbH',
    position: 'Ausbildung Fachinformatiker',
    kind: 'ausbildung',
    city: 'Berlin',
    status: 'wish',
    link: 'https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1-S',
    refnr: '10000-1-S',
    published: '2026-10-22',
    start: '01.08.2027',
    note: '',
    isNew: true,
    source: 'jobs',
  });
  assert.equal(jobLink('a b'), 'https://www.arbeitsagentur.de/jobsuche/jobdetail/a%20b');
});

test('job searches in data and the «N new jobs» notification once a day', () => {
  const d = normalize({});
  assert.deepEqual(d.jobs, { searches: [], ignored: [], lastRun: '', found: null, error: '' });
  d.jobs.found = { date: '2026-10-29', n: 3 };
  const n = dueNotifications(d, new Date(2026, 9, 29, 12, 0)).filter((x) => x.type === 'jobs');
  assert.deepEqual(n.map((x) => [x.id, x.params.n]), [['jobs:2026-10-29', 3]]);
  assert.equal(dueNotifications(d, new Date(2026, 9, 30, 12, 0)).filter((x) => x.type === 'jobs').length, 0);
});
