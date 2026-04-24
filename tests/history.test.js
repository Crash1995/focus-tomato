const { test } = require('node:test');
const assert = require('node:assert/strict');
const { aggregateDayStats, getHistoryDays } = require('../src/renderer/history');

test('aggregateDayStats считает закрытые/всего/помидоры/XP', () => {
  const date = '2026-04-24';
  const tasks = [
    { id: 't1', date, done: true, completedAt: 1 },
    { id: 't2', date, done: false, completedAt: null },
    { id: 't3', date, done: true, completedAt: 2 },
    { id: 't4', date: '2026-04-23', done: true, completedAt: 3 }
  ];
  const sessions = [
    { date, xp: 25 },
    { date, xp: 25 },
    { date: '2026-04-23', xp: 25 }
  ];
  const stats = aggregateDayStats(tasks, sessions, date);
  assert.equal(stats.closed, 2);
  assert.equal(stats.total, 3);
  assert.equal(stats.pomodoros, 2);
  assert.equal(stats.xp, 50);
  assert.equal(stats.date, date);
});

test('aggregateDayStats возвращает нули для пустого дня', () => {
  const stats = aggregateDayStats([], [], '2026-04-24');
  assert.deepEqual(stats, { date: '2026-04-24', closed: 0, total: 0, pomodoros: 0, xp: 0 });
});

test('getHistoryDays возвращает N календарных дней до anchor включительно', () => {
  const days = getHistoryDays([], [], '2026-04-24', 3);
  assert.equal(days.length, 3);
  assert.equal(days[0].date, '2026-04-22');
  assert.equal(days[1].date, '2026-04-23');
  assert.equal(days[2].date, '2026-04-24');
});
