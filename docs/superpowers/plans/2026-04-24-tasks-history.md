# FocusForge Tasks & History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить FocusForge в задачник + помидоро: список задач на день с drag-and-drop, мини-модалка после помидора, full-screen History view с графиком 14 дней и лентой, AI-комментарий опционально.

**Architecture:** Electron main + renderer. Данные в `data.json`: существующие `sessions[]`, `stats{}`, `settings{}` + новое поле `tasks[]` (плоский массив с `date`). Renderer разделён на три модуля: `src/core/gamification.js` (без изменений в структуре, меняются константы), `src/renderer/tasks.js` (pure функции: парсер, CRUD, reorder, фильтры), `src/renderer/history.js` (агрегация дней). `src/app.js` — связующее звено: DOM, состояние, drag-and-drop, полуночный триггер.

**Tech Stack:** Electron 41, vanilla JS (CommonJS), Node 22. Встроенный `node:test` для unit-тестов чистых функций — без добавления npm-зависимостей.

**Spec:** `docs/superpowers/specs/2026-04-24-tasks-history-design.md`

---

## File Structure

**Modify:**
- `src/main.js` — IPC сигнатура `ai:request` меняется
- `src/preload.js` — сигнатура `sendAIRequest` меняется
- `src/main/dataStore.js` — atomic write, миграция `tasks: []`
- `src/main/openRouterClient.js` — промпт и сигнатура под задачи вместо сессий
- `src/core/gamification.js` — убрать session-XP константы, добавить `TASK_XP`, `applyTaskToggleXP`
- `src/index.html` — новая центральная колонка (табы, inline-input, приглашение), history overlay, мини-модалка помидора; удалить sessionModal
- `src/styles.css` — стили задач, drag-ghost, табы, history-view, мини-модалка
- `src/app.js` — интеграция всего: рендер задач, drag, toggle с анимацией, мини-модалка, history, AI, полуночный триггер; удалить старый session-UI код
- `package.json` — скрипт `"test": "node --test tests/"`
- `.gitignore` — добавить `.superpowers/`

**Create:**
- `src/renderer/tasks.js` — парсер, createTask, toggleTask, reorderTasks, фильтры (pure)
- `src/renderer/history.js` — aggregateDayStats, getHistoryDays (pure)
- `tests/tasks.test.js`
- `tests/history.test.js`
- `tests/gamification.test.js`
- `tests/dataStore.test.js`

**Test run command:** `npm test`

---

## Task 1: Test runner + миграция data.json

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `src/main/dataStore.js`
- Create: `tests/dataStore.test.js`

- [ ] **Step 1: Добавить скрипт test в package.json**

В `package.json` в секцию `scripts` добавить ключ `"test"`:

```json
"scripts": {
  "start": "electron src/main.js",
  "build:mac": "electron-builder --mac",
  "test": "node --test tests/"
}
```

- [ ] **Step 2: Добавить `.superpowers/` в .gitignore**

В `.gitignore` дописать строку `.superpowers/` (перед блоком `coverage/`).

- [ ] **Step 3: Написать упавший тест миграции**

Создать `tests/dataStore.test.js`:

```js
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
```

- [ ] **Step 4: Запустить тест — должен упасть**

```
npm test
```

Ожидаемо: FAIL (`merged.tasks` = undefined).

- [ ] **Step 5: Минимальная реализация — правка mergeWithDefaults**

В `src/main/dataStore.js` изменить `createDefaultData` и `mergeWithDefaults`:

```js
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
```

- [ ] **Step 6: Перезапустить тест — должен пройти**

```
npm test
```

Ожидаемо: 2/2 tests pass.

- [ ] **Step 7: Commit**

```
git add package.json .gitignore src/main/dataStore.js tests/dataStore.test.js
git commit -m "feat(tasks): добавить поле tasks[] в data.json и node:test runner"
```

---

## Task 2: Атомарная запись data.json

**Files:**
- Modify: `src/main/dataStore.js`
- Modify: `tests/dataStore.test.js`

- [ ] **Step 1: Написать тест атомарной записи**

В `tests/dataStore.test.js` дописать:

```js
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createDataStore } = require('../src/main/dataStore');

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
```

- [ ] **Step 2: Запустить — должен упасть или пройти случайно**

```
npm test
```

Ожидаемо: может упасть на проверке tmp файла или, если текущий `writeFile` пишет атомарно (на некоторых FS) — пройти случайно. В любом случае правим реализацию.

- [ ] **Step 3: Перевести saveData на atomic write**

В `src/main/dataStore.js` заменить функцию `saveData`:

```js
async function saveData(data) {
  await fs.mkdir(baseDirectory, { recursive: true });
  const normalizedData = mergeWithDefaults(data);
  const tmpFile = `${dataFile}.tmp`;
  await fs.writeFile(tmpFile, `${JSON.stringify(normalizedData, null, 2)}\n`, 'utf8');
  await fs.rename(tmpFile, dataFile);
  return normalizedData;
}
```

- [ ] **Step 4: Запустить — должен пройти**

```
npm test
```

Ожидаемо: 3/3 tests pass.

- [ ] **Step 5: Commit**

```
git add src/main/dataStore.js tests/dataStore.test.js
git commit -m "feat(storage): атомарная запись data.json через temp + rename"
```

---

## Task 3: Обновить gamification.js на задачи

**Files:**
- Modify: `src/core/gamification.js`
- Create: `tests/gamification.test.js`

- [ ] **Step 1: Написать тесты для applyTaskToggleXP**

Создать `tests/gamification.test.js`:

```js
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
```

- [ ] **Step 2: Запустить — должен упасть**

```
npm test
```

Ожидаемо: FAIL (`applyTaskToggleXP is not a function`).

- [ ] **Step 3: Правки в gamification.js**

В `src/core/gamification.js` заменить константы `BASE_SESSION_XP` и `DESCRIPTION_BONUS_XP` на `TASK_XP`, убрать `calculateSessionXP`, добавить `applyTaskToggleXP`. Внутри IIFE заменить блок констант и функцию:

```js
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
```

И в возвращаемом объекте:

```js
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
```

Удалить полностью: `BASE_SESSION_XP`, `DESCRIPTION_BONUS_XP`, `calculateSessionXP`. В `buildShareText` оставить подпись как есть.

- [ ] **Step 4: Запустить — должен пройти**

```
npm test
```

Ожидаемо: 5/5 новых + предыдущие.

- [ ] **Step 5: Commit**

```
git add src/core/gamification.js tests/gamification.test.js
git commit -m "feat(gamification): XP за закрытие задачи (+25/-25), убрать session-XP"
```

---

## Task 4: tasks.js — парсер многострочного ввода

**Files:**
- Create: `src/renderer/tasks.js`
- Create: `tests/tasks.test.js`

- [ ] **Step 1: Написать тесты парсера**

Создать `tests/tasks.test.js`:

```js
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
```

- [ ] **Step 2: Запустить — упадёт (модуля нет)**

```
npm test
```

Ожидаемо: FAIL.

- [ ] **Step 3: Создать src/renderer/tasks.js с parseTaskInput**

```js
(function exportTasks(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.FocusForgeTasks = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function createTasks() {
  const MAX_TITLE_LENGTH = 200;
  const MAX_PARSED_ROWS = 50;
  const LIST_MARKER = /^\s*(?:[-*•]|\d+\.)\s+/;
  const CHECKBOX_MARKER = /^\[( |x|X)\]\s*/;

  function parseTaskInput(raw) {
    const lines = String(raw || '').split('\n');
    const result = [];
    for (const rawLine of lines) {
      if (result.length >= MAX_PARSED_ROWS) {
        break;
      }
      let line = rawLine.trim();
      if (!line) {
        continue;
      }
      line = line.replace(LIST_MARKER, '');
      let done = false;
      const checkbox = line.match(CHECKBOX_MARKER);
      if (checkbox) {
        done = checkbox[1].toLowerCase() === 'x';
        line = line.replace(CHECKBOX_MARKER, '');
      }
      line = line.trim();
      if (!line) {
        continue;
      }
      if (line.length > MAX_TITLE_LENGTH) {
        line = line.slice(0, MAX_TITLE_LENGTH);
      }
      result.push({ title: line, done });
    }
    return result;
  }

  return {
    MAX_TITLE_LENGTH,
    MAX_PARSED_ROWS,
    parseTaskInput
  };
});
```

- [ ] **Step 4: Запустить — должны пройти**

```
npm test
```

Ожидаемо: все тесты парсера pass.

- [ ] **Step 5: Commit**

```
git add src/renderer/tasks.js tests/tasks.test.js
git commit -m "feat(tasks): парсер многострочного ввода с маркерами и чекбоксами"
```

---

## Task 5: tasks.js — createTask, toggleTask, reorderTasks, фильтры

**Files:**
- Modify: `src/renderer/tasks.js`
- Modify: `tests/tasks.test.js`

- [ ] **Step 1: Дописать тесты**

В конец `tests/tasks.test.js`:

```js
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
```

- [ ] **Step 2: Запустить — упадут**

```
npm test
```

Ожидаемо: FAIL по недостающим экспортам.

- [ ] **Step 3: Дописать функции в src/renderer/tasks.js**

В `src/renderer/tasks.js` внутри фабрики, перед `return`:

```js
function createTask(title, date, order, done = false) {
  const createdAt = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return {
    id: `t-${createdAt}-${random}`,
    date,
    title: String(title).slice(0, MAX_TITLE_LENGTH),
    done: Boolean(done),
    order,
    createdAt,
    completedAt: done ? createdAt : null
  };
}

function toggleTask(tasks, id) {
  return tasks.map((task) => {
    if (task.id !== id) {
      return task;
    }
    const nextDone = !task.done;
    return {
      ...task,
      done: nextDone,
      completedAt: nextDone ? Date.now() : null
    };
  });
}

function reorderTasks(tasks, draggedId, targetId) {
  const dragged = tasks.find((t) => t.id === draggedId);
  const target = tasks.find((t) => t.id === targetId);
  if (!dragged || !target || dragged.date !== target.date) {
    return tasks;
  }
  const date = dragged.date;
  const sameDay = tasks
    .filter((t) => t.date === date)
    .sort((a, b) => a.order - b.order);
  const withoutDragged = sameDay.filter((t) => t.id !== draggedId);
  const targetIndex = withoutDragged.findIndex((t) => t.id === targetId);
  withoutDragged.splice(targetIndex, 0, dragged);
  const renumbered = withoutDragged.map((t, index) => ({ ...t, order: index }));
  const byId = new Map(renumbered.map((t) => [t.id, t]));
  return tasks.map((t) => byId.get(t.id) || t);
}

function getOpenTodayTasks(tasks, date) {
  return tasks
    .filter((t) => t.date === date && !t.done)
    .sort((a, b) => a.order - b.order);
}

function getDoneTodayTasks(tasks, date) {
  return tasks
    .filter((t) => t.date === date && t.done)
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
}
```

И в возврате добавить:

```js
return {
  MAX_TITLE_LENGTH,
  MAX_PARSED_ROWS,
  parseTaskInput,
  createTask,
  toggleTask,
  reorderTasks,
  getOpenTodayTasks,
  getDoneTodayTasks
};
```

- [ ] **Step 4: Запустить — должны пройти**

```
npm test
```

- [ ] **Step 5: Commit**

```
git add src/renderer/tasks.js tests/tasks.test.js
git commit -m "feat(tasks): createTask, toggleTask, reorderTasks, фильтры по дню"
```

---

## Task 6: history.js — агрегация дней

**Files:**
- Create: `src/renderer/history.js`
- Create: `tests/history.test.js`

- [ ] **Step 1: Написать тесты**

Создать `tests/history.test.js`:

```js
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
```

- [ ] **Step 2: Запустить — упадут**

```
npm test
```

- [ ] **Step 3: Создать src/renderer/history.js**

```js
(function exportHistory(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.FocusForgeHistory = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function createHistory() {

  function aggregateDayStats(tasks, sessions, date) {
    const dayTasks = tasks.filter((t) => t.date === date);
    const closed = dayTasks.filter((t) => t.done).length;
    const total = dayTasks.length;
    const daySessions = sessions.filter((s) => s.date === date);
    const pomodoros = daySessions.length;
    const xp = daySessions.reduce((sum, s) => sum + (s.xp || 0), 0);
    return { date, closed, total, pomodoros, xp };
  }

  function getHistoryDays(tasks, sessions, anchorDate, daysCount) {
    const dates = [];
    const anchor = new Date(`${anchorDate}T12:00:00`);
    for (let offset = daysCount - 1; offset >= 0; offset -= 1) {
      const date = new Date(anchor);
      date.setDate(anchor.getDate() - offset);
      dates.push(formatDateKey(date));
    }
    return dates.map((d) => aggregateDayStats(tasks, sessions, d));
  }

  function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return {
    aggregateDayStats,
    getHistoryDays
  };
});
```

- [ ] **Step 4: Запустить — должны пройти**

```
npm test
```

- [ ] **Step 5: Commit**

```
git add src/renderer/history.js tests/history.test.js
git commit -m "feat(history): агрегация метрик дня и выборка за N дней"
```

---

## Task 7: openRouterClient.js — новый промпт под задачи

**Files:**
- Modify: `src/main/openRouterClient.js`
- Modify: `src/main.js`
- Modify: `src/preload.js`

- [ ] **Step 1: Переписать openRouterClient.js**

Полностью заменить содержимое `src/main/openRouterClient.js`:

```js
class AIRequestError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AIRequestError';
    this.code = code;
  }
}

async function sendAIRequest({ closedTasks, pomodoroCount, apiKey, model = 'openai/gpt-4o-mini', fetchImpl = fetch }) {
  const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildRequestBody(closedTasks, pomodoroCount, model))
  }).catch((error) => {
    const networkCode = error?.code || error?.cause?.code;
    if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETDOWN'].includes(networkCode)) {
      throw new AIRequestError('Нет подключения к интернету', 'offline');
    }
    throw new AIRequestError('Что-то пошло не так. Попробуй ещё раз', 'unknown');
  });

  if (response.status === 401) {
    throw new AIRequestError('Неверный API ключ. Проверь на openrouter.ai/keys', 'invalid-key');
  }
  if (!response.ok) {
    throw new AIRequestError('Что-то пошло не так. Попробуй ещё раз', 'unknown');
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new AIRequestError('Что-то пошло не так. Попробуй ещё раз', 'invalid-response');
  }
  return content;
}

function buildRequestBody(closedTasks, pomodoroCount, model = 'openai/gpt-4o-mini') {
  return {
    model,
    messages: [
      {
        role: 'system',
        content: [
          'Ты — продуктивити-коуч. Получаешь список задач пользователя, закрытых за день,',
          'и количество помидоров (25-минутных фокус-сессий). Напиши краткий энергичный отчёт:',
          '1) Главное достижение дня (1 предложение)',
          '2) Паттерн в работе — что заметил по списку задач (1-2 предложения)',
          '3) Совет на завтра (1 предложение)',
          'Русский язык, дружелюбно, энергично, без воды. Максимум 5 предложений.'
        ].join('\n')
      },
      {
        role: 'user',
        content: `Закрыто задач: ${closedTasks.length}. Помидоров: ${pomodoroCount}.\nСписок:\n${formatTasks(closedTasks)}`
      }
    ]
  };
}

function formatTasks(closedTasks) {
  if (!closedTasks.length) {
    return '(пусто)';
  }
  return closedTasks
    .map((task) => `— ${String(task.title || '').trim() || 'без названия'}`)
    .join('\n');
}

module.exports = {
  AIRequestError,
  sendAIRequest,
  buildRequestBody,
  formatTasks
};
```

- [ ] **Step 2: Обновить сигнатуру IPC в main.js**

В `src/main.js` заменить хэндлер `ai:request`:

```js
ipcMain.handle('ai:request', async (_event, closedTasks, pomodoroCount, apiKey) => {
  return sendAIRequest({ closedTasks, pomodoroCount, apiKey });
});
```

- [ ] **Step 3: Обновить preload.js**

В `src/preload.js` заменить строку sendAIRequest:

```js
sendAIRequest: (closedTasks, pomodoroCount, apiKey) =>
  ipcRenderer.invoke('ai:request', closedTasks, pomodoroCount, apiKey),
```

- [ ] **Step 4: Проверить что тесты всё ещё проходят**

```
npm test
```

Ожидаемо: все зелёные. Код main-процесса тестами не покрыт — запустить `npm start` вручную не обязательно на этом шаге.

- [ ] **Step 5: Commit**

```
git add src/main/openRouterClient.js src/main.js src/preload.js
git commit -m "feat(ai): перевести sendAIRequest на закрытые задачи дня"
```

---

## Task 8: Новая структура HTML — центральная колонка

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1: Заменить центральную секцию и модалки**

В `src/index.html` найти `<section class="sessions-column" id="centerPanel">…</section>` и заменить на:

```html
<section class="tasks-column" id="centerPanel">
  <div class="tasks-tabs" id="tasksTabs">
    <button class="tasks-tab is-active" data-tab="open" id="tabOpen">Задачи <span id="tabOpenCount">0/0</span></button>
    <button class="tasks-tab" data-tab="done" id="tabDone">Сделано · <span id="tabDoneCount">0</span></button>
  </div>

  <div class="tasks-view" id="tasksOpenView">
    <div class="tasks-empty hidden" id="tasksEmpty">
      <h1>Запланируй день</h1>
      <p class="subtitle">Каждая строка — задача. Маркеры <code>-</code> / <code>[ ]</code> срежутся автоматом.</p>
      <textarea id="tasksBulkInput" placeholder="- [ ] Веб3: скилл — описание&#10;- [ ] Вайбкод: помидоро — задачник&#10;…"></textarea>
      <button class="primary-button" id="tasksBulkSubmit">Запланировать</button>
    </div>
    <div class="tasks-list" id="tasksList"></div>
    <div class="tasks-inline-row hidden" id="tasksInlineRow">
      <input id="tasksInlineInput" maxlength="200" placeholder="+ Новая задача (Enter)">
    </div>
  </div>

  <div class="tasks-view hidden" id="tasksDoneView">
    <div class="tasks-list" id="tasksDoneList"></div>
  </div>
</section>
```

- [ ] **Step 2: Заменить sessionModal на мини-модалку помидора**

Найти блок `<div class="modal-root hidden" id="sessionModal">…</div>` и заменить на:

```html
<div class="modal-root hidden" id="pomodoroDoneModal">
  <div class="modal">
    <h2 id="pomodoroDoneTitle">🍅 Помидор готов</h2>
    <div class="modal-actions">
      <button class="secondary-button" id="pomodoroAgainButton">Ещё 🍅</button>
      <button class="primary-button" id="pomodoroBreakButton">Break</button>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Добавить history overlay**

Перед `<div class="level-up hidden" id="levelUpOverlay">` вставить:

```html
<div class="history-overlay hidden" id="historyOverlay">
  <div class="history-header">
    <h2>История</h2>
    <button class="icon-button" id="historyCloseButton" aria-label="Закрыть">✕</button>
  </div>
  <div class="history-body" id="historyBody"></div>
</div>
```

- [ ] **Step 4: Добавить кнопку «История» в stats-колонку**

В `<aside class="stats-column">` в конец, после `<p id="totalXPText">…</p>`, добавить:

```html
<button class="secondary-button" id="openHistoryButton">История</button>
```

- [ ] **Step 5: Подключить новые модули**

В `<body>` перед `<script src="./core/gamification.js"></script>` добавить:

```html
<script src="./renderer/tasks.js"></script>
<script src="./renderer/history.js"></script>
```

- [ ] **Step 6: Commit**

```
git add src/index.html
git commit -m "feat(ui): новая структура центральной колонки, history overlay, мини-модалка помидора"
```

---

## Task 9: Стили под новый UI

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Добавить стили задач, табов, inline-ввода, history, мини-модалки**

В конец `src/styles.css` дописать:

```css
/* Tasks column */
.tasks-column { display: flex; flex-direction: column; padding: 18px; gap: 12px; overflow: hidden; }
.tasks-tabs { display: flex; gap: 4px; border-bottom: 1px solid rgba(255,255,255,0.08); }
.tasks-tab { background: none; border: none; color: #8a8a95; padding: 8px 12px; font-size: 13px; cursor: pointer; border-bottom: 2px solid transparent; }
.tasks-tab.is-active { color: #fff; border-bottom-color: var(--accent); }
.tasks-view { flex: 1; display: flex; flex-direction: column; gap: 8px; overflow: hidden; }
.tasks-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 4px; }
.tasks-empty { display: flex; flex-direction: column; gap: 12px; padding: 24px 0; text-align: center; }
.tasks-empty h1 { margin: 0; font-size: 20px; }
.tasks-empty .subtitle { color: #8a8a95; font-size: 12px; margin: 0; }
.tasks-empty textarea { min-height: 180px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 10px; color: #fff; font-family: inherit; font-size: 13px; resize: none; }
.tasks-inline-row { padding-top: 4px; }
.tasks-inline-row input { width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 8px 10px; color: #fff; font-family: inherit; font-size: 13px; }

.task-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: rgba(255,255,255,0.03); border-radius: 6px; cursor: grab; user-select: none; transition: opacity 200ms; }
.task-row[draggable="true"]:active { cursor: grabbing; }
.task-row.is-dragging { opacity: 0.4; }
.task-row.is-drop-target { box-shadow: inset 0 2px 0 var(--accent); }
.task-row.is-leaving { opacity: 0; transform: translateX(8px); transition: opacity 200ms, transform 200ms; }
.task-row .checkbox { width: 16px; height: 16px; border: 1px solid #666; border-radius: 3px; flex-shrink: 0; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 11px; }
.task-row.is-done .checkbox { background: var(--accent); border-color: var(--accent); color: #fff; }
.task-row .title { flex: 1; font-size: 13px; color: #e5e5ea; }
.task-row.is-done .title { text-decoration: line-through; color: #8a8a95; }
.task-row .grip { color: #4a4a52; font-size: 12px; letter-spacing: -1px; }

/* History overlay */
.history-overlay { position: absolute; inset: 0; background: var(--bg); display: flex; flex-direction: column; z-index: 30; }
.history-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 22px; border-bottom: 1px solid rgba(255,255,255,0.06); }
.history-header h2 { margin: 0; font-size: 16px; }
.history-body { flex: 1; overflow-y: auto; padding: 18px 22px; display: flex; flex-direction: column; gap: 16px; }
.history-today { background: rgba(255,255,255,0.04); border-radius: 10px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.history-today h3 { margin: 0; font-size: 15px; }
.history-meta { color: #8a8a95; font-size: 12px; }
.history-closed-list { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #d0d0d5; }
.history-ai-button { align-self: flex-start; }
.history-ai-text { white-space: pre-wrap; line-height: 1.5; font-size: 13px; color: #e5e5ea; padding: 10px; background: rgba(255,255,255,0.03); border-radius: 6px; }
.history-chart { display: flex; align-items: flex-end; gap: 4px; height: 72px; padding: 8px; background: rgba(255,255,255,0.03); border-radius: 8px; }
.history-chart-bar { flex: 1; background: var(--accent); border-radius: 2px 2px 0 0; min-height: 2px; opacity: 0.85; }
.history-chart-bar.is-empty { background: rgba(255,255,255,0.06); }
.history-feed { display: flex; flex-direction: column; gap: 2px; }
.history-row { display: flex; justify-content: space-between; padding: 8px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.history-row:hover { background: rgba(255,255,255,0.04); }
.history-row.is-expanded { background: rgba(255,255,255,0.04); flex-direction: column; align-items: stretch; gap: 6px; cursor: default; }
.history-row .history-row-head { display: flex; justify-content: space-between; }
```

- [ ] **Step 2: Commit**

```
git add src/styles.css
git commit -m "feat(ui): стили задач, табов, history, drag-состояний"
```

---

## Task 10: app.js — базовое состояние задач и рендер

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Импорты и состояние**

В `src/app.js` в самом верху заменить блок с деструктуризацией `window.FocusForgeCore`:

```js
const {
  applyTaskToggleXP,
  getLevel,
  getLevelProgress,
  getTodaySessions,
  updateStreak,
  buildShareText,
  formatDateKey
} = window.FocusForgeCore;

const {
  parseTaskInput,
  createTask,
  toggleTask,
  reorderTasks,
  getOpenTodayTasks,
  getDoneTodayTasks
} = window.FocusForgeTasks;

const {
  aggregateDayStats,
  getHistoryDays
} = window.FocusForgeHistory;
```

В блоке module-level переменных добавить:

```js
let activeTab = 'open';
let draggedTaskId = null;
let todayDate = '';
let midnightPoller = null;
let historyAICache = '';
```

- [ ] **Step 2: Функция renderTasks и переключение видов**

Удалить функцию `renderSessions` целиком. Вместо неё добавить:

```js
function renderTasks() {
  const open = getOpenTodayTasks(data.tasks, todayDate);
  const done = getDoneTodayTasks(data.tasks, todayDate);

  elements.tabOpenCount.textContent = `${done.length}/${open.length + done.length}`;
  elements.tabDoneCount.textContent = String(done.length);

  elements.tabOpen.classList.toggle('is-active', activeTab === 'open');
  elements.tabDone.classList.toggle('is-active', activeTab === 'done');
  elements.tasksOpenView.classList.toggle('hidden', activeTab !== 'open');
  elements.tasksDoneView.classList.toggle('hidden', activeTab !== 'done');

  if (activeTab === 'open') {
    renderOpenList(open);
  } else {
    renderDoneList(done);
  }
}

function renderOpenList(open) {
  const hasAny = open.length > 0;
  elements.tasksEmpty.classList.toggle('hidden', hasAny);
  elements.tasksList.classList.toggle('hidden', !hasAny);
  elements.tasksInlineRow.classList.toggle('hidden', !hasAny);
  elements.tasksList.innerHTML = '';
  for (const task of open) {
    elements.tasksList.appendChild(buildTaskRow(task, true));
  }
}

function renderDoneList(done) {
  elements.tasksDoneList.innerHTML = '';
  if (!done.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Пока ничего не закрыто';
    elements.tasksDoneList.appendChild(empty);
    return;
  }
  for (const task of done) {
    elements.tasksDoneList.appendChild(buildTaskRow(task, false));
  }
}

function buildTaskRow(task, draggable) {
  const row = document.createElement('div');
  row.className = `task-row ${task.done ? 'is-done' : ''}`;
  row.dataset.taskId = task.id;
  if (draggable) {
    row.draggable = true;
  }
  row.innerHTML = `
    <div class="checkbox">${task.done ? '✓' : ''}</div>
    <div class="title">${escapeHTML(task.title)}</div>
    ${draggable ? '<span class="grip">⋮⋮</span>' : ''}
  `;
  row.querySelector('.checkbox').addEventListener('click', () => onTaskCheckboxClick(task.id, row));
  return row;
}
```

- [ ] **Step 3: Подписаться на клики по табам и inline**

В `bindEvents()` в конец дописать:

```js
elements.tabOpen.addEventListener('click', () => { activeTab = 'open'; renderTasks(); });
elements.tabDone.addEventListener('click', () => { activeTab = 'done'; renderTasks(); });
elements.tasksBulkSubmit.addEventListener('click', onBulkSubmit);
elements.tasksInlineInput.addEventListener('keydown', onInlineKeydown);
elements.openHistoryButton.addEventListener('click', openHistory);
elements.historyCloseButton.addEventListener('click', closeHistory);
elements.pomodoroAgainButton.addEventListener('click', onPomodoroAgain);
elements.pomodoroBreakButton.addEventListener('click', onPomodoroBreak);
```

- [ ] **Step 4: Обработчики ввода задач**

В `src/app.js` добавить функции:

```js
async function onBulkSubmit() {
  const raw = elements.tasksBulkInput.value;
  const parsed = parseTaskInput(raw);
  if (!parsed.length) {
    return;
  }
  let order = 0;
  for (const row of parsed) {
    const task = createTask(row.title, todayDate, order, row.done);
    data.tasks.push(task);
    if (row.done) {
      data.stats.totalXP = applyTaskToggleXP(data.stats.totalXP, true);
    }
    order += 1;
  }
  data.stats.level = getLevel(data.stats.totalXP).level;
  elements.tasksBulkInput.value = '';
  await saveData();
  render();
}

async function onInlineKeydown(event) {
  if (event.key !== 'Enter') {
    return;
  }
  event.preventDefault();
  const raw = elements.tasksInlineInput.value;
  const parsed = parseTaskInput(raw);
  if (!parsed.length) {
    return;
  }
  const existing = getOpenTodayTasks(data.tasks, todayDate);
  let order = existing.length;
  for (const row of parsed) {
    const task = createTask(row.title, todayDate, order, row.done);
    data.tasks.push(task);
    if (row.done) {
      data.stats.totalXP = applyTaskToggleXP(data.stats.totalXP, true);
    }
    order += 1;
  }
  data.stats.level = getLevel(data.stats.totalXP).level;
  elements.tasksInlineInput.value = '';
  await saveData();
  render();
}
```

- [ ] **Step 5: Обновить render() и DOMContentLoaded**

В `src/app.js` заменить функцию `render()`:

```js
function render() {
  renderTimer();
  renderTasks();
  renderStats();
}
```

И удалить старый вызов `renderSessions()` там где был.

В обработчике `DOMContentLoaded` после `selectedBreakDuration = …` и перед `await updateStreakOnLaunch()` добавить:

```js
todayDate = getToday();
startMidnightPoller();
```

- [ ] **Step 6: Обновить renderStats — убрать summary button**

В `renderStats()` удалить строку `elements.summaryButton.classList.toggle('hidden', …)` — кнопки больше нет.

- [ ] **Step 7: Проверить запуск**

```
npm start
```

Ожидаемо: приложение открылось, для пустой даты виден textarea и «Запланировать», после ввода — задачи рендерятся. Клик по чекбоксу пока не работает — будет в следующей задаче. Закрыть окно.

- [ ] **Step 8: Commit**

```
git add src/app.js
git commit -m "feat(app): рендер задач, табы, утренний bulk-ввод, inline-добавление"
```

---

## Task 11: app.js — toggle задачи с fade-анимацией

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Реализовать onTaskCheckboxClick**

В `src/app.js` добавить функции:

```js
async function onTaskCheckboxClick(taskId, rowElement) {
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) {
    return;
  }
  const oldLevel = getLevel(data.stats.totalXP);
  const nextDone = !task.done;
  data.stats.totalXP = applyTaskToggleXP(data.stats.totalXP, nextDone);
  data.stats.level = getLevel(data.stats.totalXP).level;
  data.tasks = toggleTask(data.tasks, taskId);

  rowElement.classList.add('is-leaving');
  await saveData();

  setTimeout(() => {
    render();
    showToast(nextDone ? '+25 XP' : '−25 XP');
    const newLevel = getLevel(data.stats.totalXP);
    if (newLevel.level > oldLevel.level) {
      showLevelUp(newLevel.name);
    }
  }, 200);
}
```

- [ ] **Step 2: Удалить старый блок saveCompletedSession**

В `src/app.js` удалить функции `saveCompletedSession` и `updateSessionXPPreview`. Удалить обработчики `elements.saveSessionButton` и `elements.skipSessionButton` из `bindEvents()`.

- [ ] **Step 3: Проверить руками**

```
npm start
```

- Ввести задачи → клик по чекбоксу → fade-out 200 мс → задача во вкладке «Сделано»
- Клик по чекбоксу в «Сделано» → возврат в «Задачи», XP откатывается
- При XP=0 и клике −25 — XP остаётся 0 (не уходит в минус).

Закрыть окно.

- [ ] **Step 4: Commit**

```
git add src/app.js
git commit -m "feat(tasks): toggle задачи с fade-анимацией и XP-откатом"
```

---

## Task 12: app.js — drag-and-drop

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Навесить dnd-обработчики в buildTaskRow**

В `src/app.js` в функции `buildTaskRow` после `row.querySelector('.checkbox').addEventListener…` перед `return row;` добавить:

```js
if (draggable) {
  row.addEventListener('dragstart', (event) => onTaskDragStart(event, task.id, row));
  row.addEventListener('dragover', (event) => onTaskDragOver(event, row));
  row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
  row.addEventListener('drop', (event) => onTaskDrop(event, task.id, row));
  row.addEventListener('dragend', () => onTaskDragEnd(row));
}
```

- [ ] **Step 2: Реализовать хэндлеры drag**

Добавить в `src/app.js`:

```js
function onTaskDragStart(event, taskId, row) {
  draggedTaskId = taskId;
  row.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', taskId);
}

function onTaskDragOver(event, row) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  if (row.dataset.taskId !== draggedTaskId) {
    row.classList.add('is-drop-target');
  }
}

async function onTaskDrop(event, targetId, row) {
  event.preventDefault();
  row.classList.remove('is-drop-target');
  if (!draggedTaskId || draggedTaskId === targetId) {
    return;
  }
  data.tasks = reorderTasks(data.tasks, draggedTaskId, targetId);
  await saveData();
  render();
}

function onTaskDragEnd(row) {
  row.classList.remove('is-dragging');
  row.classList.remove('is-drop-target');
  draggedTaskId = null;
  document.querySelectorAll('.task-row.is-drop-target').forEach((el) => el.classList.remove('is-drop-target'));
}
```

- [ ] **Step 3: Ручная проверка**

```
npm start
```

- Добавить 3-4 задачи
- Перетащить вторую на место первой → порядок поменялся
- Закрыть приложение и открыть заново → порядок сохранился
- Закрыть окно

- [ ] **Step 4: Commit**

```
git add src/app.js
git commit -m "feat(tasks): drag-and-drop переупорядочивание на HTML5 events"
```

---

## Task 13: Мини-модалка после помидора

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Заменить ветку work в finishCurrentMode**

В `src/app.js` в функции `finishCurrentMode()` заменить ветку `if (mode === 'work')`:

```js
function finishCurrentMode() {
  pauseTimer();
  playBeep();

  if (mode === 'work') {
    recordPomodoroSession();
    showModal(elements.pomodoroDoneModal);
    return;
  }

  mode = 'work';
  remainingSeconds = getModeDurationSeconds();
  renderTimer();
}

function recordPomodoroSession() {
  const session = {
    date: todayDate,
    time: getCurrentTime(),
    xp: 0
  };
  data.sessions.unshift(session);
  saveData();
}

async function onPomodoroAgain() {
  hideModal(elements.pomodoroDoneModal);
  mode = 'work';
  remainingSeconds = getModeDurationSeconds();
  renderTimer();
  startTimer();
}

async function onPomodoroBreak() {
  hideModal(elements.pomodoroDoneModal);
  mode = 'break';
  remainingSeconds = getModeDurationSeconds();
  startTimer();
  render();
}
```

- [ ] **Step 2: Проверить**

```
npm start
```

- Поставить рабочую длительность 1 минуту в settings
- Запустить таймер, дождаться окончания → звук + мини-модалка «Ещё 🍅 / Break»
- «Ещё 🍅» → новый рабочий помидор стартовал
- «Break» → break-таймер стартовал
- Закрыть

- [ ] **Step 3: Commit**

```
git add src/app.js
git commit -m "feat(pomodoro): мини-модалка «Ещё 🍅 / Break» вместо sessionModal"
```

---

## Task 14: History view — агрегация, график, лента

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Функции open/close/render history**

В `src/app.js` добавить:

```js
const HISTORY_DAYS = 14;

function openHistory() {
  historyAICache = '';
  renderHistory();
  elements.historyOverlay.classList.remove('hidden');
}

function closeHistory() {
  elements.historyOverlay.classList.add('hidden');
}

function renderHistory() {
  const days = getHistoryDays(data.tasks, data.sessions, todayDate, HISTORY_DAYS);
  const today = days[days.length - 1];
  elements.historyBody.innerHTML = '';

  elements.historyBody.appendChild(buildHistoryToday(today));
  elements.historyBody.appendChild(buildHistoryChart(days));
  elements.historyBody.appendChild(buildHistoryFeed(days.slice(0, -1).reverse()));
}

function buildHistoryToday(stats) {
  const container = document.createElement('div');
  container.className = 'history-today';
  container.innerHTML = `
    <h3>Сегодня · ${escapeHTML(getDisplayDate())}</h3>
    <div class="history-meta">${stats.closed}/${stats.total} задач · ${stats.pomodoros} 🍅 · ${stats.xp} XP</div>
    <div class="history-closed-list" id="historyTodayClosedList"></div>
    <button class="secondary-button history-ai-button" id="historyAIButton">AI-комментарий ✨</button>
    <div class="history-ai-text hidden" id="historyAIText"></div>
  `;
  const closedList = container.querySelector('#historyTodayClosedList');
  const closed = getDoneTodayTasks(data.tasks, todayDate);
  if (!closed.length) {
    closedList.textContent = 'Пока ничего не закрыто';
  } else {
    for (const task of closed) {
      const row = document.createElement('div');
      row.textContent = `✓ ${task.title}`;
      closedList.appendChild(row);
    }
  }
  container.querySelector('#historyAIButton').addEventListener('click', onHistoryAIClick);
  return container;
}

function buildHistoryChart(days) {
  const container = document.createElement('div');
  container.className = 'history-chart';
  for (const day of days) {
    const bar = document.createElement('div');
    const percent = day.total === 0 ? 0 : (day.closed / day.total) * 100;
    bar.className = `history-chart-bar ${day.total === 0 ? 'is-empty' : ''}`;
    bar.style.height = `${Math.max(2, percent)}%`;
    bar.title = `${day.date}: ${day.closed}/${day.total} задач · ${day.pomodoros} 🍅`;
    container.appendChild(bar);
  }
  return container;
}

function buildHistoryFeed(days) {
  const container = document.createElement('div');
  container.className = 'history-feed';
  if (!days.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'Нет истории за прошлые дни';
    container.appendChild(empty);
    return container;
  }
  for (const day of days) {
    container.appendChild(buildHistoryRow(day));
  }
  return container;
}

function buildHistoryRow(day) {
  const row = document.createElement('div');
  row.className = 'history-row';
  row.innerHTML = `
    <div class="history-row-head">
      <span>${formatHistoryDate(day.date)}</span>
      <span>${day.closed}/${day.total} задач · ${day.pomodoros} 🍅 · ${day.xp} XP</span>
    </div>
  `;
  row.addEventListener('click', () => expandHistoryRow(row, day));
  return row;
}

function expandHistoryRow(row, day) {
  if (row.classList.contains('is-expanded')) {
    return;
  }
  row.classList.add('is-expanded');
  const closed = getDoneTodayTasks(data.tasks, day.date);
  const list = document.createElement('div');
  list.className = 'history-closed-list';
  if (!closed.length) {
    list.textContent = 'Ничего не закрыто';
  } else {
    for (const task of closed) {
      const item = document.createElement('div');
      item.textContent = `✓ ${task.title}`;
      list.appendChild(item);
    }
  }
  row.appendChild(list);
}

function formatHistoryDate(dateKey) {
  const [y, m, d] = dateKey.split('-');
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(Number(y), Number(m) - 1, Number(d)));
}
```

- [ ] **Step 2: Проверить**

```
npm start
```

- Кнопка «История» открывает overlay
- Сегодняшний день — карточка сверху, график ниже, лента
- Клик по дню в ленте — раскрывает список закрытых
- Крестик закрывает overlay

- [ ] **Step 3: Commit**

```
git add src/app.js
git commit -m "feat(history): full-screen view с графиком, лентой и раскрытием дней"
```

---

## Task 15: AI-комментарий для сегодняшнего дня

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Обработчик клика по кнопке AI**

В `src/app.js` добавить:

```js
async function onHistoryAIClick() {
  const button = document.getElementById('historyAIButton');
  const text = document.getElementById('historyAIText');
  if (!data.settings.apiKey && !openRouterConfig.hasEnvAPIKey) {
    showModal(elements.apiKeyModal);
    return;
  }
  if (historyAICache) {
    text.textContent = historyAICache;
    text.classList.remove('hidden');
    return;
  }
  const closed = getDoneTodayTasks(data.tasks, todayDate);
  const pomodoros = data.sessions.filter((s) => s.date === todayDate).length;
  button.disabled = true;
  button.textContent = 'Думаю…';
  try {
    const reply = await window.api.sendAIRequest(closed, pomodoros, data.settings.apiKey);
    historyAICache = reply;
    text.textContent = reply;
    text.classList.remove('hidden');
  } catch (error) {
    text.textContent = error.message || 'Что-то пошло не так. Попробуй ещё раз';
    text.classList.remove('hidden');
  } finally {
    button.disabled = false;
    button.textContent = 'AI-комментарий ✨';
  }
}
```

- [ ] **Step 2: saveApiKeyAndContinue — убрать старый вызов requestSummary**

В `src/app.js` функция `saveApiKeyAndContinue()` сейчас вызывает `requestSummary()`. Удалить этот вызов, оставив только сохранение ключа:

```js
async function saveApiKeyAndContinue() {
  const apiKey = elements.apiKeyInput.value.trim();
  if (!apiKey) {
    return;
  }
  data.settings.apiKey = apiKey;
  await saveData();
  hideModal(elements.apiKeyModal);
  if (!elements.historyOverlay.classList.contains('hidden')) {
    onHistoryAIClick();
  }
}
```

- [ ] **Step 3: Ручная проверка**

С ключом OpenRouter:
- Закрыть 1-2 задачи, «История» → «AI-комментарий ✨» → загрузка → текст.

Без ключа:
- «AI-комментарий ✨» → модалка ключа → вставить → авто-повтор запроса.

- [ ] **Step 4: Commit**

```
git add src/app.js
git commit -m "feat(ai): AI-комментарий на карточке сегодня в history view"
```

---

## Task 16: Полуночный триггер + cleanup старого кода

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Реализовать startMidnightPoller**

В `src/app.js` добавить:

```js
const MIDNIGHT_POLL_INTERVAL_MS = 30_000;

function startMidnightPoller() {
  if (midnightPoller) {
    clearInterval(midnightPoller);
  }
  midnightPoller = setInterval(() => {
    const now = getToday();
    if (now !== todayDate) {
      todayDate = now;
      activeTab = 'open';
      render();
    }
  }, MIDNIGHT_POLL_INTERVAL_MS);
}
```

- [ ] **Step 2: Удалить мёртвый код**

Из `src/app.js` удалить функции которые больше не вызываются:
- `requestSummary`
- `renderSummaryLoading`
- `renderSummaryError`
- `renderSummaryCard`
- `restoreSessionPanel`
- `copySummary`
- `saveSummaryPNG`

Удалить из module-level: `aiReportText`, `isSummaryInFlight` (если остались).

Проверить что в `bindEvents()` нет обработчиков для удалённых кнопок (`summaryButton`, `sessionDescription`, `saveSessionButton`, `skipSessionButton`) — если есть, убрать.

Убрать из `bindElements` через `document.querySelectorAll('[id]')` ничего не надо — словарь строится автоматически и отсутствующие id просто не попадут в `elements`.

- [ ] **Step 3: Проверить** 

```
npm test && npm start
```

- Все тесты зелёные
- Приложение запускается, задачи работают, помидор работает, history работает
- Ничего не крашится при кликах

- [ ] **Step 4: Commit**

```
git add src/app.js
git commit -m "chore(app): полуночный триггер + удаление неиспользуемого session-UI кода"
```

---

## Task 17: Приёмочная проверка

**Files:** нет изменений

- [ ] **Step 1: Пройти 10 критериев приёмки из spec**

Запустить `npm start` и пройти по списку:

1. Пустой день → textarea + «Запланировать» видны
2. Вставить многострочный список с `- [ ]` / `- [x]` / `* ` / `1. ` → строки превращаются в задачи, `[x]` создаются сделанными с правильным XP
3. Перетащить задачу → порядок меняется → перезапустить → порядок сохранён
4. Чекбокс открытой → XP +25, в «Сделано»; чекбокс в «Сделано» → XP −25, в «Задачи»
5. Мини-модалка после помидора, текстового поля нет
6. «История» → full-screen, сегодня сверху, график 14 дней, лента прошлого
7. «AI-комментарий ✨» работает (при наличии ключа)
8. После ≥4 помидоров за день и перехода суток стрик продлевается
9. Закрыть приложение с помощью Cmd+Q во время сохранения — `data.json` валидный (можно проверить `cat ~/Library/Application\ Support/FocusForge/data.json | jq`)
10. Существующий пользователь без `tasks` в data.json — после запуска `tasks: []` появляется

- [ ] **Step 2: Починить всё что не проходит**

Для каждого провала — отдельный commit с описанием исправления.

- [ ] **Step 3: Финальный commit пустой если всё прошло**

Ничего не коммитить если всё работает.

---

## Self-Review Notes

**Spec coverage:** все секции spec'а имеют задачу:
- Утренний ввод + парсер → Task 4, 8, 10
- 3 колонки + табы → Task 8, 9, 10
- Мини-модалка P2 → Task 8, 13
- History view (V2) + график + лента + сегодня → Task 8, 9, 14, 15
- Модель данных tasks[] → Task 1, 5
- Атомарная запись → Task 2
- XP за задачу + откат + не в минус → Task 3, 11
- Drag-and-drop HTML5 → Task 12
- AI-отчёт под задачи → Task 7, 15
- Полуночный триггер → Task 16
- Удаление старого sessionModal / renderSessions / renderSummary* → Task 8, 11, 16
- Миграция → Task 1
- Лимит 50 строк при парсинге → Task 4
- Критерии приёмки → Task 17

**Type consistency проверена:**
- `applyTaskToggleXP(totalXP, nextDone)` — одна и та же сигнатура в Task 3 (implementation) и Task 10, 11 (использование).
- `createTask(title, date, order, done)` — одинаково в Task 5, 10.
- `reorderTasks(tasks, draggedId, targetId)` — одинаково в Task 5, 12.
- `sendAIRequest(closedTasks, pomodoroCount, apiKey)` на клиенте — соответствует `{ closedTasks, pomodoroCount, apiKey }` на бэке в Task 7.

**Placeholder scan:** никаких TBD / «добавь обработку ошибок» / «аналогично Task N» — каждый шаг содержит полный код.
