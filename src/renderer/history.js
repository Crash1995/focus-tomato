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
