const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateSessionXP,
  getLevel,
  getLevelProgress,
  getTodaySessions,
  updateStreak,
  buildShareText
} = require('../src/core/gamification');

test('calculateSessionXP adds description bonus only for non-empty text', () => {
  assert.equal(calculateSessionXP('Сделал структуру'), 35);
  assert.equal(calculateSessionXP('   '), 25);
  assert.equal(calculateSessionXP(''), 25);
});

test('getLevel returns level by total XP thresholds', () => {
  assert.equal(getLevel(0).name, 'Новичок');
  assert.equal(getLevel(100).name, 'Фокусёр');
  assert.equal(getLevel(300).name, 'Продуктивщик');
  assert.equal(getLevel(600).name, 'Машина');
  assert.equal(getLevel(1000).name, 'Легенда');
});

test('getLevelProgress returns progress inside current level range', () => {
  assert.deepEqual(getLevelProgress(450), {
    current: 150,
    required: 300,
    nextLevel: 4
  });
});

test('getTodaySessions filters sessions by date', () => {
  const sessions = [
    { date: '2026-04-12', time: '10:30', description: 'Код', xp: 35 },
    { date: '2026-04-11', time: '10:30', description: '', xp: 25 }
  ];

  assert.equal(getTodaySessions(sessions, '2026-04-12').length, 1);
});

test('updateStreak increments when yesterday had four sessions', () => {
  const sessions = Array.from({ length: 4 }, (_, index) => ({
    date: '2026-04-11',
    time: `10:0${index}`,
    description: '',
    xp: 25
  }));
  const stats = {
    totalXP: 0,
    level: 1,
    currentStreak: 2,
    bestStreak: 2,
    lastActiveDate: '2026-04-11'
  };

  assert.deepEqual(updateStreak(stats, sessions, '2026-04-12'), {
    totalXP: 0,
    level: 1,
    currentStreak: 3,
    bestStreak: 3,
    lastActiveDate: '2026-04-12'
  });
});

test('buildShareText matches requested format', () => {
  assert.equal(
    buildShareText({
      dateTitle: '12 апреля 2026',
      sessionsCount: 4,
      xp: 130,
      streak: 2,
      aiText: 'Главное достижение дня — стабильный фокус.'
    }),
    [
      'FocusForge | 12 апреля 2026',
      '🍅 4 сессий | ⚡ 130 XP | 🔥 2 дня',
      '---',
      'Главное достижение дня — стабильный фокус.',
      '---',
      '#FocusForge'
    ].join('\n')
  );
});
