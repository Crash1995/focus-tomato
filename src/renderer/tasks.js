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

  // Инвариант: одно-дневные задачи занимают свои же исходные позиции в outer
  // массиве, но в новом порядке (и с перенумерованным order 0..n). Задачи
  // других дней — неподвижны. Не сводить к `tasks.map((t) => byId.get(t.id) || t)`
  // — этот вариант сохраняет позиции same-day задач нетронутыми и ломает
  // drag-intuition + тесты.
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
    const result = [];
    let sameDayCursor = 0;
    for (const t of tasks) {
      if (t.date === date) {
        result.push(renumbered[sameDayCursor]);
        sameDayCursor += 1;
      } else {
        result.push(t);
      }
    }
    return result;
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
});
