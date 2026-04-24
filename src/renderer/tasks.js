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
