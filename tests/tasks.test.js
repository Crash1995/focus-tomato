const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseTaskInput } = require('../src/renderer/tasks');

test('каждая непустая строка — задача', () => {
  const rows = parseTaskInput('первая\nвторая\nтретья');
  assert.equal(rows.length, 3);
  assert.equal(rows[0].title, 'первая');
  assert.equal(rows[0].done, false);
});

test('пустые строки пропускаются', () => {
  const rows = parseTaskInput('a\n\n\nb\n  \nc');
  assert.equal(rows.length, 3);
});

test('срезает маркеры списка', () => {
  const rows = parseTaskInput('- один\n* два\n• три\n1. четыре\n  2. пять');
  assert.deepEqual(rows.map((r) => r.title), ['один', 'два', 'три', 'четыре', 'пять']);
});

test('распознаёт [ ] и [x]', () => {
  const rows = parseTaskInput('- [ ] открытая\n- [x] сделанная\n- [X] тоже сделанная');
  assert.equal(rows[0].done, false);
  assert.equal(rows[0].title, 'открытая');
  assert.equal(rows[1].done, true);
  assert.equal(rows[1].title, 'сделанная');
  assert.equal(rows[2].done, true);
});

test('обрезает title до 200 символов', () => {
  const long = 'a'.repeat(300);
  const rows = parseTaskInput(long);
  assert.equal(rows[0].title.length, 200);
});

test('лимит 50 строк', () => {
  const many = Array.from({ length: 70 }, (_, i) => `line ${i}`).join('\n');
  const result = parseTaskInput(many);
  assert.equal(result.length, 50);
});

const {
  createTask,
  toggleTask,
  reorderTasks,
  getOpenTodayTasks,
  getDoneTodayTasks
} = require('../src/renderer/tasks');

test('createTask проставляет id, date, order, createdAt', () => {
  const t = createTask('проверка', '2026-04-24', 3);
  assert.match(t.id, /^t-\d+-[a-z0-9]+$/);
  assert.equal(t.title, 'проверка');
  assert.equal(t.date, '2026-04-24');
  assert.equal(t.order, 3);
  assert.equal(t.done, false);
  assert.equal(typeof t.createdAt, 'number');
  assert.equal(t.completedAt, null);
});

test('createTask c done=true проставляет completedAt', () => {
  const t = createTask('уже сделано', '2026-04-24', 0, true);
  assert.equal(t.done, true);
  assert.equal(typeof t.completedAt, 'number');
});

test('toggleTask переключает done и completedAt', () => {
  const open = createTask('x', '2026-04-24', 0);
  const closed = toggleTask([open], open.id);
  assert.equal(closed[0].done, true);
  assert.equal(typeof closed[0].completedAt, 'number');
  const reopen = toggleTask(closed, open.id);
  assert.equal(reopen[0].done, false);
  assert.equal(reopen[0].completedAt, null);
});

test('reorderTasks перевставляет и перенумеровывает order для даты', () => {
  const date = '2026-04-24';
  const a = createTask('a', date, 0);
  const b = createTask('b', date, 1);
  const c = createTask('c', date, 2);
  const other = createTask('z', '2026-04-23', 0);
  const reordered = reorderTasks([a, b, c, other], c.id, a.id);
  const todayOnly = reordered.filter((t) => t.date === date);
  assert.deepEqual(todayOnly.map((t) => t.title), ['c', 'a', 'b']);
  assert.deepEqual(todayOnly.map((t) => t.order), [0, 1, 2]);
  const otherDay = reordered.find((t) => t.date === '2026-04-23');
  assert.equal(otherDay.order, 0, 'задачи других дней не трогаются');
});

test('getOpenTodayTasks: фильтр по дате и done=false, сортировка по order', () => {
  const today = '2026-04-24';
  const a = createTask('a', today, 2);
  const b = createTask('b', today, 0);
  const c = createTask('c', today, 1);
  const d = createTask('d', today, 5);
  const done = { ...createTask('x', today, 3), done: true, completedAt: Date.now() };
  const other = createTask('other', '2026-04-23', 0);
  const open = getOpenTodayTasks([a, b, c, d, done, other], today);
  assert.deepEqual(open.map((t) => t.title), ['b', 'c', 'a', 'd']);
});

test('getDoneTodayTasks: фильтр по дате и done=true, сортировка по completedAt DESC', () => {
  const today = '2026-04-24';
  const old = { ...createTask('old', today, 0), done: true, completedAt: 100 };
  const newer = { ...createTask('newer', today, 1), done: true, completedAt: 200 };
  const done = getDoneTodayTasks([old, newer], today);
  assert.deepEqual(done.map((t) => t.title), ['newer', 'old']);
});
