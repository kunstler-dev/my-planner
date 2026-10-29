// Project timer, habits that check themselves and the weekly review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { timerHours, elapsedText, habitRuleMet, autoHabitMarks, weekOf, weeklyReview, upsertReview } from '../src/renderer/js/productivity-calc.js';
import { dueNotifications } from '../src/renderer/js/notify-calc.js';

const { normalize } = createRequire(import.meta.url)('../src/main/store.js');
const H = 3600000;

test('timer: hours rounded to 0.05, at least 0.05; elapsed text', () => {
  assert.equal(timerHours(0, 1.5 * H), 1.5);
  assert.equal(timerHours(0, 62 * 60000), 1.05);
  assert.equal(timerHours(0, 60000), 0.05);
  assert.equal(elapsedText(65 * 60000), '1:05');
  assert.equal(elapsedText(-5), '0:00');
});

test('timer survives a restart and is validated', () => {
  assert.deepEqual(normalize({ timer: { projectId: 'p1', startedAt: 123 } }).timer, { projectId: 'p1', startedAt: 123 });
  assert.equal(normalize({ timer: { projectId: 'p1' } }).timer, null);
  assert.equal(normalize({}).timer, null);
});

test('habit rules', () => {
  const data = {
    career: { applications: [{ sentAt: '2026-10-29' }] },
    finance: [
      { type: 'expense', category: 'Еда', date: '2026-10-28' },
      { type: 'income', category: 'Зарплата', date: '2026-10-29' },
    ],
    tasks: [
      { done: true, doneAt: '2026-10-29' },
      { done: true, doneAt: '2026-10-29' },
      { done: false },
    ],
    projects: [{ id: 'p1', hours: [{ hours: 0.5, date: '2026-10-29' }] }],
    timer: null,
  };
  assert.ok(habitRuleMet({ kind: 'apply' }, data, '2026-10-29'));
  assert.ok(!habitRuleMet({ kind: 'apply' }, data, '2026-10-28'));
  assert.ok(habitRuleMet({ kind: 'spend' }, data, '2026-10-29'));
  assert.ok(!habitRuleMet({ kind: 'noSpend', category: 'Еда' }, data, '2026-10-28'));
  assert.ok(habitRuleMet({ kind: 'noSpend', category: 'Игры' }, data, '2026-10-28'));
  assert.ok(habitRuleMet({ kind: 'tasks', n: 2 }, data, '2026-10-29'));
  assert.ok(!habitRuleMet({ kind: 'tasks', n: 3 }, data, '2026-10-29'));
  assert.ok(habitRuleMet({ kind: 'project', minutes: 30 }, data, '2026-10-29'));
  assert.ok(!habitRuleMet({ kind: 'project', minutes: 45 }, data, '2026-10-29'));
  // The running timer counts too.
  const started = new Date(2026, 9, 29, 10, 0).getTime();
  assert.ok(habitRuleMet({ kind: 'project', minutes: 45, projectId: 'p1' }, { ...data, timer: { projectId: 'p1', startedAt: started } }, '2026-10-29', started + 20 * 60000));
});

test('auto marks: today for most rules, yesterday for «no spending», never a day unchecked by hand', () => {
  const data = {
    habits: [
      { id: 'h1', days: [], auto: { kind: 'tasks', n: 1 } },
      { id: 'h2', days: [], auto: { kind: 'noSpend', category: 'Игры' } },
      { id: 'h3', days: [], auto: { kind: 'tasks', n: 1 }, autoOff: ['2026-10-29'] },
      { id: 'h4', days: ['2026-10-29'], auto: { kind: 'tasks', n: 1 } },
      { id: 'h5', days: [] },
    ],
    tasks: [{ done: true, doneAt: '2026-10-29' }],
    finance: [],
  };
  assert.deepEqual(autoHabitMarks(data, '2026-10-29'), [
    { habitId: 'h1', date: '2026-10-29' },
    { habitId: 'h2', date: '2026-10-28' },
  ]);
});

test('weekly review: money vs last week, applications, habits, tasks, hours, ranks, subscribers', () => {
  const data = normalize({
    finance: [
      { type: 'income', amount: 100, category: 'Зарплата', date: '2026-10-27' },
      { type: 'expense', amount: 30, category: 'Еда', date: '2026-10-28' },
      { type: 'expense', amount: 20, category: 'Транспорт', date: '2026-10-29' },
      { type: 'expense', amount: 10, category: 'Еда', date: '2026-10-21' },
    ],
    career: {
      applications: [
        { id: 'a', sentAt: '2026-10-27', status: 'sent' },
        { id: 'b', sentAt: '2026-10-10', status: 'interview', statusAt: '2026-10-30' },
      ],
    },
    habits: [{ id: 'h', days: ['2026-10-26', '2026-10-27', '2026-10-28'] }],
    tasks: [{ done: true, doneAt: '2026-10-29' }],
    projects: [{ id: 'p', name: 'Planner', hours: [{ hours: 2, date: '2026-10-27' }, { hours: 1, date: '2026-10-01' }] }],
    ranks: { dota: { entries: [{ date: '2026-10-20', value: 3000 }, { date: '2026-10-30', value: 3050 }] } },
    channels: [{ username: 'x', snapshots: [{ date: '2026-10-25', subscribers: 100 }, { date: '2026-11-01', subscribers: 130 }] }],
  });
  assert.deepEqual(weekOf('2026-10-29'), { start: '2026-10-26', end: '2026-11-01' });
  const r = weeklyReview(data, '2026-10-26');
  assert.deepEqual([r.money.income, r.money.expense, r.money.prevExpense], [100, 50, 10]);
  assert.deepEqual(r.money.top.map((c) => c.category), ['Еда', 'Транспорт']);
  assert.deepEqual(r.career, { sent: 1, replies: 1, interviews: 1 });
  assert.equal(r.habits.done, 3);
  assert.equal(Math.round(r.habits.share * 100), 43);
  assert.equal(r.tasks, 1);
  assert.deepEqual(r.projects, [{ name: 'Planner', hours: 2 }]);
  assert.deepEqual(r.ranks.dota, { start: 3000, end: 3050, change: 50 });
  assert.deepEqual(r.subscribers, { end: 130, change: 30 });
});

test('saved weeks: one per Monday, the newest 52', () => {
  let list = [];
  for (let i = 0; i < 60; i++) list = upsertReview(list, { week: `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`, summary: {} });
  assert.equal(list.length, 52);
  assert.equal(upsertReview([{ week: 'a', grok: '1' }], { week: 'a', grok: '2' }).length, 1);
});

test('notifications: timer over 4 hours, weekly review on Sunday evening', () => {
  const now = new Date(2026, 10, 1, 19, 30); // Sunday
  const data = normalize({ settings: { reviewAt: '19:00' }, timer: { projectId: 'p', startedAt: now.getTime() - 5 * H }, projects: [{ id: 'p', name: 'Planner', hours: [] }] });
  const n = dueNotifications(data, now);
  assert.ok(n.some((x) => x.type === 'timer' && x.params.name === 'Planner'));
  assert.ok(n.some((x) => x.id === 'review:2026-11-01'));
  assert.ok(!dueNotifications(data, new Date(2026, 10, 1, 18, 0)).some((x) => x.type === 'review'));
  assert.ok(!dueNotifications(data, new Date(2026, 10, 2, 20, 0)).some((x) => x.type === 'review'), 'Monday');
});
