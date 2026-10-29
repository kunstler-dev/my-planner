// Money extras: cancellation deadlines, runway, safe to spend, Steam budget fit, quick entry parsing and the new
// notification types.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { addMonths, periodEnd, noticeDeadline, cancelDeadline, runway, nextIncomeDate, safeToSpend, gameBudgetFit } from '../src/renderer/js/money-calc.js';
import { parseQuick } from '../src/renderer/js/quick-parse.js';
import { dueNotifications } from '../src/renderer/js/notify-calc.js';

const { normalize } = createRequire(import.meta.url)('../src/main/store.js');

test('months: same day or the last day of a shorter month', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29', 'leap year');
  assert.equal(addMonths('2026-12-31', -3), '2026-09-30');
  assert.equal(addMonths('2026-03-15', 12), '2027-03-15');
});

test('period end as in § 188 BGB, including month ends and 29 February', () => {
  assert.equal(periodEnd('2025-01-15', 24), '2027-01-14');
  assert.equal(periodEnd('2026-01-31', 1), '2026-02-28', '31 January + 1 month ends on the last day of February');
  assert.equal(periodEnd('2024-02-29', 12), '2025-02-28', 'leap day');
  assert.equal(periodEnd('2026-03-01', 1), '2026-03-31');
  assert.equal(periodEnd('2028-01-30', 1), '2028-02-29', 'no 30 February in a leap year either');
});

test('notice deadline in days, weeks or months', () => {
  assert.equal(noticeDeadline('2026-12-31', { n: 3, unit: 'months' }), '2026-09-30');
  assert.equal(noticeDeadline('2026-12-31', { n: 4, unit: 'weeks' }), '2026-12-03');
  assert.equal(noticeDeadline('2026-03-01', { n: 14, unit: 'days' }), '2026-02-15');
});

test('cancellation deadline: first term, then automatic renewals', () => {
  const c = { start: '2025-01-15', minMonths: 24, notice: { n: 3, unit: 'months' }, renewMonths: 1 };
  assert.deepEqual(cancelDeadline(c, '2026-10-14'), { termEnd: '2027-01-14', deadline: '2026-10-14', daysLeft: 0 });
  // The first deadline has passed: the contract renews by one month at a time.
  assert.deepEqual(cancelDeadline(c, '2026-10-29'), { termEnd: '2027-02-14', deadline: '2026-11-14', daysLeft: 16 });
  // «To the end of the month», yearly renewal.
  const eom = { start: '2024-02-29', minMonths: 12, notice: { n: 1, unit: 'months' }, renewMonths: 12, endOfMonth: true };
  assert.deepEqual(cancelDeadline(eom, '2025-01-10'), { termEnd: '2025-02-28', deadline: '2025-01-28', daysLeft: 18 });
  assert.deepEqual(cancelDeadline(eom, '2025-02-01'), { termEnd: '2026-02-28', deadline: '2026-01-28', daysLeft: 361 });
  // No minimum term: the renewal period is the first term.
  assert.equal(cancelDeadline({ start: '2026-10-01', minMonths: 0, notice: { n: 14, unit: 'days' } }, '2026-10-05').termEnd, '2026-10-31');
  assert.equal(cancelDeadline({}, '2026-10-29'), null);
});

test('runway: money ÷ average expenses of the last full months with data', () => {
  const finance = [
    { type: 'expense', amount: 1000, date: '2026-09-10' },
    { type: 'expense', amount: 500, date: '2026-08-10' },
    { type: 'expense', amount: 999, date: '2026-10-02' },
    { type: 'income', amount: 9999, date: '2026-09-01' },
  ];
  assert.deepEqual(runway(3000, finance, '2026-10-29'), { months: 4, avg: 750, basedOn: 2 }, 'July without data and the current month are left out');
  assert.equal(runway(3000, [], '2026-10-29'), null);
});

test('next income and safe to spend today', () => {
  const data = normalize({
    settings: { currency: '€' },
    rates: { '€': 1, '₴': 50, $: 1.25 },
    accounts: [{ id: 'a', name: 'A', currency: '€', balance: 1000, history: [] }],
    recurring: [
      { id: 'r1', active: true, type: 'income', title: 'Salary', amount: 2000, day: 5, next: '2026-11-05' },
      { id: 'r2', active: true, type: 'expense', title: 'Rent', amount: 400, day: 1, next: '2026-11-01' },
      { id: 'r3', active: true, type: 'expense', title: 'Later', amount: 50, day: 10, next: '2026-11-10' },
    ],
    bills: [
      { id: 'b1', amount: 30, dueDate: '2026-11-02', paid: false },
      { id: 'b2', amount: 99, dueDate: '2026-11-02', paid: true },
    ],
    goals: [{ id: 'g', title: 'G', target: 300, deadline: '2027-01-29', contributions: [{ amount: 20, date: '2026-10-03' }] }],
  });
  assert.equal(nextIncomeDate(data.recurring, '2026-10-29'), '2026-11-05');
  assert.equal(nextIncomeDate([], '2026-10-29'), '2026-10-31', 'no regular income → end of month');
  const s = safeToSpend(data, '2026-10-29');
  assert.equal(s.days, 7);
  assert.equal(s.recurring, 400);
  assert.equal(s.bills, 30);
  // 280 left of the goal over 4 months (goalPlan rounds up) = 70 a month, 20 already paid this month.
  assert.equal(s.goals, 50);
  assert.equal(s.perDay, Math.round(((1000 - 400 - 30 - 50) / 7) * 100) / 100);
  data.accounts[0].balance = 100;
  assert.equal(safeToSpend(data, '2026-10-29').perDay, 0, 'never below zero');
});

test('wishlist game against the «Games» budget', () => {
  const data = normalize({
    settings: { currency: '€' },
    rates: { '€': 1, '₴': 50, $: 1.25 },
    budgets: { Игры: 20 },
    finance: [{ type: 'expense', amount: 5, category: 'Игры', date: '2026-10-02' }],
  });
  assert.deepEqual(gameBudgetFit(data, { price: 500, currency: '₴' }, '2026-10-29'), { fits: true, after: 5, short: -5, left: 15, price: 10 });
  assert.equal(gameBudgetFit(data, { price: 1000, currency: '₴' }, '2026-10-29').short, 5);
  data.budgets = {};
  assert.equal(gameBudgetFit(data, { price: 1, currency: '₴' }, '2026-10-29'), null);
});

test('quick entry line → entry', () => {
  const today = '2026-10-29';
  assert.deepEqual(parseQuick('кофе 3.5', { today }), { type: 'expense', amount: 3.5, category: 'Еда', date: today, note: 'кофе' });
  assert.deepEqual(parseQuick('3,5 кофе', { today }), { type: 'expense', amount: 3.5, category: 'Еда', date: today, note: 'кофе' });
  assert.deepEqual(parseQuick('+1200 зарплата', { today }), { type: 'income', amount: 1200, category: 'Зарплата', date: today, note: 'зарплата' });
  assert.deepEqual(parseQuick('такси 12 вчера', { today }), { type: 'expense', amount: 12, category: 'Транспорт', date: '2026-10-28', note: 'такси' });
  assert.equal(parseQuick('Kaffee 4,20 gestern', { today }).category, 'Еда');
  assert.equal(parseQuick('Spotify 11 25.10', { today }).date, '2026-10-25');
  assert.equal(parseQuick('таксі 8 позавчора', { today }).date, '2026-10-27');
  assert.equal(parseQuick('что-то 5', { today }).category, 'Другое');
  assert.equal(parseQuick('корм 5', { today, rules: [{ field: 'desc', value: 'корм', category: 'Подарок', kind: 'expense' }] }).category, 'Подарок', 'user rules first');
  assert.equal(parseQuick('без суммы', { today }), null);
  assert.equal(parseQuick('', { today }), null);
});

test('notifications: contract deadlines and wishlist games at the target price', () => {
  const data = normalize({
    settings: { currency: '€' },
    rates: { '€': 1, '₴': 50, $: 1.25 },
    budgets: { Игры: 20 },
    recurring: [{ id: 'c1', active: true, type: 'expense', title: 'Phone', amount: 20, day: 1, next: '2026-11-01', contract: { start: '2025-01-15', minMonths: 24, notice: { n: 3, unit: 'months' } } }],
    wishlist: [
      { id: 1, name: 'Game A', price: 500, currency: '₴', target: 600 },
      { id: 2, name: 'Game B', price: 900, currency: '₴', target: 600 },
    ],
  });
  const n = dueNotifications(data, new Date(2026, 8, 14, 10, 0));
  assert.ok(n.some((x) => x.id === 'contract:c1:2026-10-14:30' && x.params.n === 30));
  const steam = n.filter((x) => x.type === 'steam');
  assert.deepEqual(
    steam.map((x) => [x.params.name, x.key]),
    [['Game A', 'notify.steamFits']],
  );
  assert.equal(dueNotifications(data, new Date(2026, 8, 15, 10, 0)).filter((x) => x.type === 'contracts').length, 0, 'only 30, 7 and 1 days before');
});
