const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyTaskToggleXP, TASK_XP, getLevel } = require('../src/core/gamification');

test('закрытие задачи даёт +25 XP', () => {
  const next = applyTaskToggleXP(100, true);
  assert.equal(next, 125);
});

test('открытие задачи обратно снимает 25 XP', () => {
  const next = applyTaskToggleXP(100, false);
  assert.equal(next, 75);
});

test('XP не уходит в минус', () => {
  const next = applyTaskToggleXP(10, false);
  assert.equal(next, 0);
});

test('TASK_XP = 25', () => {
  assert.equal(TASK_XP, 25);
});

test('getLevel всё ещё работает', () => {
  assert.equal(getLevel(0).level, 1);
  assert.equal(getLevel(350).level, 3);
});
