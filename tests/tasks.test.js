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
