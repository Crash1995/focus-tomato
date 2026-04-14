const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createDefaultData,
  createDataStore
} = require('../src/main/dataStore');

test('createDataStore creates default data file on first load', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'focusforge-'));
  const dataStore = createDataStore(directory);

  const data = await dataStore.loadData();

  assert.deepEqual(data, createDefaultData());
  assert.equal(await pathExists(dataStore.dataFile), true);
});

test('createDataStore saves and loads data roundtrip', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'focusforge-'));
  const dataStore = createDataStore(directory);
  const expectedData = createDefaultData();
  expectedData.sessions.push({
    date: '2026-04-12',
    time: '10:30',
    description: 'Код',
    xp: 35
  });
  expectedData.stats.totalXP = 35;

  await dataStore.saveData(expectedData);
  const actualData = await dataStore.loadData();

  assert.deepEqual(actualData, expectedData);
});

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
