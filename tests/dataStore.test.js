const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { mergeWithDefaults, createDataStore } = require('../src/main/dataStore');

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

test('saveData пишет через временный файл и rename', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ff-'));
  const store = createDataStore(dir);
  const data = await store.loadData();
  data.stats.totalXP = 999;
  await store.saveData(data);
  const reread = await store.loadData();
  assert.equal(reread.stats.totalXP, 999);
  const tmpFileExists = await fs.access(path.join(dir, 'data.json.tmp')).then(() => true, () => false);
  assert.equal(tmpFileExists, false, 'tmp файл должен быть переименован, а не оставлен');
  await fs.rm(dir, { recursive: true, force: true });
});
