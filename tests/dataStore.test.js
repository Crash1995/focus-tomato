const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeWithDefaults } = require('../src/main/dataStore');

test('mergeWithDefaults добавляет пустой tasks[] если его нет', () => {
  const legacy = {
    sessions: [{ date: '2026-04-23', time: '10:00', description: 'x', xp: 25 }],
    stats: { totalXP: 100, level: 2, currentStreak: 1, bestStreak: 1, lastActiveDate: '2026-04-23' },
    settings: { workDuration: 25, breakDuration: 5, apiKey: '' }
  };
  const merged = mergeWithDefaults(legacy);
  assert.deepEqual(merged.tasks, []);
  assert.equal(merged.sessions.length, 1);
  assert.equal(merged.stats.totalXP, 100);
});

test('mergeWithDefaults сохраняет tasks если уже есть', () => {
  const data = {
    sessions: [],
    tasks: [{ id: 't-1', date: '2026-04-24', title: 'x', done: false, order: 0, createdAt: 1, completedAt: null }],
    stats: {},
    settings: {}
  };
  const merged = mergeWithDefaults(data);
  assert.equal(merged.tasks.length, 1);
  assert.equal(merged.tasks[0].id, 't-1');
});
