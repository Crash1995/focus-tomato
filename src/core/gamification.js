(function exportGamification(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.FocusForgeCore = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function createGamification() {
  const TASK_XP = 25;
  const PRODUCTIVE_DAY_SESSIONS = 4;

  const LEVELS = [
    { level: 1, name: 'Новичок', xpFrom: 0 },
    { level: 2, name: 'Фокусёр', xpFrom: 100 },
    { level: 3, name: 'Продуктивщик', xpFrom: 300 },
    { level: 4, name: 'Машина', xpFrom: 600 },
    { level: 5, name: 'Легенда', xpFrom: 1000 }
  ];

function applyTaskToggleXP(totalXP, nextDone) {
  const delta = nextDone ? TASK_XP : -TASK_XP;
  return Math.max(0, totalXP + delta);
}

function getLevel(totalXP) {
  return LEVELS.reduce((currentLevel, candidateLevel) => {
    return totalXP >= candidateLevel.xpFrom ? candidateLevel : currentLevel;
  }, LEVELS[0]);
}

function getLevelProgress(totalXP) {
  const currentLevel = getLevel(totalXP);
  const nextLevel = LEVELS.find((level) => level.xpFrom > currentLevel.xpFrom);

  if (!nextLevel) {
    return {
      current: totalXP - currentLevel.xpFrom,
      required: 0,
      nextLevel: null
    };
  }

  return {
    current: totalXP - currentLevel.xpFrom,
    required: nextLevel.xpFrom - currentLevel.xpFrom,
    nextLevel: nextLevel.level
  };
}

function getTodaySessions(sessions, today) {
  return sessions.filter((session) => session.date === today);
}

function updateStreak(stats, sessions, today) {
  if (stats.lastActiveDate === today) {
    return { ...stats };
  }

  const yesterday = getPreviousDate(today);
  const yesterdaySessions = getTodaySessions(sessions, yesterday);
  const wasYesterdayProductive = yesterdaySessions.length >= PRODUCTIVE_DAY_SESSIONS;
  const currentStreak = stats.lastActiveDate === yesterday && wasYesterdayProductive
    ? stats.currentStreak + 1
    : 0;

  return {
    ...stats,
    currentStreak,
    bestStreak: Math.max(stats.bestStreak, currentStreak),
    lastActiveDate: today
  };
}

function buildShareText({ dateTitle, sessionsCount, xp, streak, aiText }) {
  return [
    `FocusForge | ${dateTitle}`,
    `🍅 ${sessionsCount} сессий | ⚡ ${xp} XP | 🔥 ${streak} дня`,
    '---',
    aiText,
    '---',
    '#FocusForge'
  ].join('\n');
}

function getPreviousDate(dateText) {
  const date = new Date(`${dateText}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return formatDateKey(date);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

  return {
    TASK_XP,
    PRODUCTIVE_DAY_SESSIONS,
    LEVELS,
    applyTaskToggleXP,
    getLevel,
    getLevelProgress,
    getTodaySessions,
    updateStreak,
    buildShareText,
    formatDateKey
  };
});
