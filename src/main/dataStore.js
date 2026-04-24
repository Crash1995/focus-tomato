const fs = require('node:fs/promises');
const path = require('node:path');

function createDefaultData() {
  return {
    sessions: [],
    tasks: [],
    stats: {
      totalXP: 0,
      level: 1,
      currentStreak: 0,
      bestStreak: 0,
      lastActiveDate: ''
    },
    settings: {
      workDuration: 25,
      breakDuration: 5,
      apiKey: ''
    }
  };
}

function createDataStore(baseDirectory) {
  const dataFile = path.join(baseDirectory, 'data.json');

  async function loadData() {
    await fs.mkdir(baseDirectory, { recursive: true });

    try {
      const rawData = await fs.readFile(dataFile, 'utf8');
      return mergeWithDefaults(JSON.parse(rawData));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }

      const data = createDefaultData();
      await saveData(data);
      return data;
    }
  }

  async function saveData(data) {
    await fs.mkdir(baseDirectory, { recursive: true });
    const normalizedData = mergeWithDefaults(data);
    const tmpFile = `${dataFile}.tmp`;
    await fs.writeFile(tmpFile, `${JSON.stringify(normalizedData, null, 2)}\n`, 'utf8');
    await fs.rename(tmpFile, dataFile);
    return normalizedData;
  }

  return {
    dataFile,
    loadData,
    saveData
  };
}

function mergeWithDefaults(data) {
  const defaultData = createDefaultData();
  return {
    ...defaultData,
    ...data,
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    tasks: Array.isArray(data.tasks) ? data.tasks : [],
    stats: {
      ...defaultData.stats,
      ...(data.stats || {})
    },
    settings: {
      ...defaultData.settings,
      ...(data.settings || {})
    }
  };
}

module.exports = {
  createDefaultData,
  createDataStore,
  mergeWithDefaults
};
