import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convert,
  netWorth,
  ratesFromNbu,
  setBalance,
  firstOccurrence,
  nextOccurrence,
  applyRecurring,
  upcoming,
  budgetStatus,
  goalPlan,
  habitStreak,
  weekStart,
  careerStats,
  adStats,
  projectStats,
} from '../src/renderer/js/planner-calc.js';

const rates = { '€': 1, '₴': 50, $: 1.25 };

test('currency conversion and net worth', () => {
  assert.equal(convert(100, '₴', '€', rates), 2);
  assert.equal(convert(125, '$', '€', rates), 100);
  assert.equal(convert(10, '€', '₴', rates), 500);
  const nw = netWorth(
    [
      { id: 'a', name: 'Trust', currency: '$', balance: 125 },
      { id: 'b', name: 'UA', currency: '₴', balance: 5000 },
      { id: 'c', name: 'DE', currency: '€', balance: 200 },
    ],
    rates,
    '€',
  );
  assert.equal(nw.total, 400);
  assert.equal(nw.parts[2].share, 0.5);
  assert.equal(netWorth([{ id: 'c', name: 'DE', currency: '€', balance: 200 }], rates, '₴').total, 10000);
});

test('NBU rates → per-euro rates', () => {
  assert.deepEqual(
    ratesFromNbu([
      { cc: 'USD', rate: 40 },
      { cc: 'EUR', rate: 48 },
    ]),
    { '€': 1, '₴': 48, $: 1.2 },
  );
  assert.equal(ratesFromNbu([]), null);
});

test('setBalance keeps one history point per day', () => {
  let a = { id: 'x', balance: 0, history: [] };
  a = setBalance(a, 10, '2026-10-01');
  a = setBalance(a, 20, '2026-10-01');
  a = setBalance(a, 30, '2026-10-05');
  assert.deepEqual(a.history, [
    { date: '2026-10-01', balance: 20 },
    { date: '2026-10-05', balance: 30 },
  ]);
  assert.equal(a.balance, 30);
  assert.equal(a.updatedAt, '2026-10-05');
});

test('recurring payments: first date, month-end clamping, catch-up', () => {
  assert.equal(firstOccurrence(30, '2026-10-28'), '2026-10-30');
  assert.equal(firstOccurrence(5, '2026-10-28'), '2026-11-05');
  assert.equal(nextOccurrence('2027-01-31', 31), '2027-02-28');
  assert.equal(nextOccurrence('2027-02-28', 31), '2027-03-31');

  let n = 0;
  const { entries, recurring } = applyRecurring(
    [
      { id: 'r1', active: true, type: 'expense', amount: 500, category: 'Жильё', title: 'Аренда', day: 1, next: '2026-09-01' },
      { id: 'r2', active: false, type: 'expense', amount: 9, category: 'Связь и подписки', title: 'Spotify', day: 1, next: '2026-09-01' },
      { id: 'r3', active: true, type: 'income', amount: 1000, category: 'Зарплата', title: 'ЗП', day: 30, next: '2026-10-30' },
    ],
    '2026-10-28',
    () => `e${++n}`,
  );
  assert.deepEqual(
    entries.map((e) => [e.date, e.amount, e.recurringId]),
    [
      ['2026-09-01', 500, 'r1'],
      ['2026-10-01', 500, 'r1'],
    ],
  );
  assert.equal(recurring[0].next, '2026-11-01');
  assert.equal(recurring[1].next, '2026-09-01');
  assert.deepEqual(
    upcoming(recurring, '2026-10-28', 7).map((r) => r.id),
    ['r3', 'r1'],
  );
});

test('budgets and goals', () => {
  const st = budgetStatus(
    [
      { type: 'expense', category: 'Еда', amount: 120 },
      { type: 'expense', category: 'Еда', amount: 30 },
      { type: 'income', category: 'Еда', amount: 999 },
    ],
    { Еда: 100, Транспорт: 50, Пусто: 0 },
  );
  assert.deepEqual(
    st.map((b) => [b.category, b.spent, b.over]),
    [
      ['Еда', 150, true],
      ['Транспорт', 0, false],
    ],
  );
  const g = goalPlan({ target: 1000, deadline: '2027-04-28', contributions: [{ amount: 200 }, { amount: 100 }] }, '2026-10-28');
  assert.equal(g.saved, 300);
  assert.equal(g.left, 700);
  assert.equal(g.months, 6);
  assert.ok(Math.abs(g.perMonth - 700 / 6) < 1e-9);
  assert.equal(goalPlan({ target: 100, contributions: [{ amount: 150 }] }, '2026-10-28').done, true);
});

test('habit streak and week start', () => {
  assert.equal(habitStreak(['2026-10-26', '2026-10-27', '2026-10-28'], '2026-10-28'), 3);
  assert.equal(habitStreak(['2026-10-26', '2026-10-27'], '2026-10-28'), 2); // today not checked yet
  assert.equal(habitStreak(['2026-10-25'], '2026-10-28'), 0);
  assert.equal(weekStart('2026-10-28'), '2026-10-26'); // Wednesday → Monday
  assert.equal(weekStart('2026-11-01'), '2026-10-26'); // Sunday → Monday
});

test('career, ads and project stats', () => {
  const c = careerStats(
    [
      { status: 'wish' },
      { status: 'sent', sentAt: '2026-10-27', followUp: '2026-10-28' },
      { status: 'interview', sentAt: '2026-10-10' },
      { status: 'rejected', sentAt: '2026-10-01' },
    ],
    '2026-10-28',
  );
  assert.equal(c.sent, 3);
  assert.equal(c.week, 1);
  assert.equal(c.followUps.length, 1);
  assert.ok(Math.abs(c.responseRate - 1 / 3) < 1e-9);

  const a = adStats([
    { kind: 'buy', price: 50, gained: 100 },
    { kind: 'buy', price: 30, gained: 60 },
    { kind: 'sell', price: 40 },
  ]);
  assert.equal(a.costPerSub, 0.5);
  assert.equal(a.income, 40);

  const p = projectStats({ id: 'p', hours: [{ hours: 10 }, { hours: 5 }], milestones: [{ done: true }, { done: false }] }, [
    { projectId: 'p', type: 'income', amount: 200 },
    { projectId: 'p', type: 'expense', amount: 50 },
    { projectId: 'x', type: 'income', amount: 999 },
  ]);
  assert.deepEqual([p.profit, p.hours, p.perHour, p.milestonesDone], [150, 15, 10, 1]);
});

