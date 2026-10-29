// Chart ticks without repeated labels, the customizable home layout and the new display settings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { valueTicks, uniqueLabels, categoryTicks } from '../src/renderer/js/charts-calc.js';
import { layoutOrder, moveCard, toggleHidden, toColumns } from '../src/renderer/js/home-layout.js';
import { deadlockName } from '../src/renderer/js/games-calc.js';

const { normalize } = createRequire(import.meta.url)('../src/main/store.js');

test('value ticks: even steps, or multiples of a step', () => {
  assert.deepEqual(
    valueTicks(0, 300, { count: 3 }).map((t) => t.value),
    [0, 100, 200, 300],
  );
  assert.deepEqual(
    valueTicks(49, 61, { step: 6 }).map((t) => t.value),
    [54, 60],
  );
  assert.deepEqual(valueTicks(50, 51, { step: 6 }), [{ value: 50, label: '50' }], 'a range without a multiple keeps its start');
});

test('Deadlock axis never shows the same tier twice', () => {
  const tier = (v) => deadlockName(v).split(' ')[0];
  // The old even split of Oracle 3 … Phantom 3 gave «Oracle, Oracle, Phantom, Phantom».
  const even = valueTicks(48, 58, { count: 3, format: tier }).map((t) => t.label);
  assert.equal(new Set(even).size, even.length);
  const byTier = valueTicks(45, 59, { step: 6, format: tier }).map((t) => t.label);
  assert.deepEqual(byTier, ['Oracle', 'Phantom']);
});

test('rounded labels are not repeated', () => {
  const ticks = valueTicks(1000, 1010, { count: 4, format: (v) => `${Math.round(v / 10) * 10}` });
  assert.deepEqual(
    ticks.map((t) => t.label),
    ['1000', '1010'],
  );
  assert.deepEqual(uniqueLabels([{ label: 'a' }, { label: 'a' }, { label: 'b' }]), [{ label: 'a' }, { label: 'b' }]);
});

test('category ticks: every n-th, the last one, no neighbours with the same label', () => {
  assert.deepEqual(categoryTicks(['1', '2', '3', '4', '5'], 2), [0, 2, 4]);
  assert.deepEqual(categoryTicks(['1', '2', '3', '4'], 2), [0, 2, 3]);
  assert.deepEqual(categoryTicks(['Phantom', 'Phantom', 'Oracle', 'Oracle'], 1), [0, 2]);
  assert.deepEqual(categoryTicks(['a', 'b', 'c', 'd', 'e', 'f'], 1, 2), [0, 2, 4]);
  assert.deepEqual(categoryTicks(['', '', ''], 1), []);
});

test('home layout: saved order kept, new cards appended, unknown ids survive', () => {
  assert.deepEqual(layoutOrder([], ['a', 'b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(layoutOrder(['c', 'x', 'a', 'a'], ['a', 'b', 'c']), ['c', 'x', 'a', 'b']);
});

test('home layout: move within a group, hide, columns row by row', () => {
  const tiles = new Set(['t1', 't2']);
  const order = ['t1', 'a', 't2', 'b', 'c'];
  const sameAsBlock = (id) => !tiles.has(id);
  assert.deepEqual(moveCard(order, 'b', -1, sameAsBlock), ['t1', 'b', 't2', 'a', 'c']);
  assert.deepEqual(moveCard(order, 'a', -1, sameAsBlock), order, 'first block stays');
  assert.deepEqual(moveCard(order, 'c', 1, sameAsBlock), order, 'last block stays');
  assert.deepEqual(moveCard(order, 't1', 1, (id) => tiles.has(id)), ['t2', 'a', 't1', 'b', 'c']);
  assert.deepEqual(toggleHidden(['a'], 'a'), []);
  assert.deepEqual(toggleHidden([], 'a'), ['a']);
  assert.deepEqual(
    toColumns(['tasks', 'recent', 'games', 'habits', 'upcoming', 'channel'].map((id) => ({ id }))),
    [
      ['tasks', 'habits'],
      ['recent', 'upcoming'],
      ['games', 'channel'],
    ],
  );
});

test('display settings: compact by default, layout and menu state validated', () => {
  const d = normalize({});
  assert.equal(d.settings.density, 'compact');
  assert.deepEqual(d.settings.homeLayout, { order: [], hidden: [] });
  assert.equal(d.settings.sidebarCollapsed, false);
  const x = normalize({ settings: { density: 'huge', homeLayout: { order: ['a', 3, 'b'], hidden: 'a' }, sidebarCollapsed: 'yes' } });
  assert.equal(x.settings.density, 'compact');
  assert.deepEqual(x.settings.homeLayout, { order: ['a', 'b'], hidden: [] });
  assert.equal(x.settings.sidebarCollapsed, false);
  assert.equal(normalize({ settings: { density: 'spacious', sidebarCollapsed: true } }).settings.density, 'spacious');
});
