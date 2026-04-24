const {
  applyTaskToggleXP,
  getLevel,
  getLevelProgress,
  getTodaySessions,
  updateStreak,
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
  getHistoryDays
} = window.FocusForgeHistory;

const TIMER_RADIUS = 96;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;
const WORK_DURATIONS = [15, 25, 45];
const BREAK_DURATIONS = [5, 10, 15];
const HISTORY_DAYS = 14;
const MIDNIGHT_POLL_INTERVAL_MS = 30_000;

let data = null;
let timer = null;
let mode = 'work';
let isRunning = false;
let remainingSeconds = 25 * 60;
let endTime = 0;
let selectedWorkDuration = 25;
let selectedBreakDuration = 5;
let activeTab = 'open';
let draggedTaskId = null;
let todayDate = '';
let midnightPoller = null;
let historyAICache = '';
let audioContext = null;
let audioCompressor = null;
let openRouterConfig = {
  hasEnvAPIKey: false,
  defaultModel: 'openai/gpt-4o-mini'
};

const elements = {};

document.addEventListener('DOMContentLoaded', async () => {
  bindElements();
  bindEvents();
  openRouterConfig = await window.api.getOpenRouterConfig();
  data = await window.api.loadData();
  selectedWorkDuration = data.settings.workDuration;
  selectedBreakDuration = data.settings.breakDuration;
  todayDate = getToday();
  startMidnightPoller();
  await updateStreakOnLaunch();
  resetTimer();
  render();
});

function bindElements() {
  for (const element of document.querySelectorAll('[id]')) {
    elements[element.id] = element;
  }
  elements.timerProgress.style.strokeDasharray = String(TIMER_CIRCUMFERENCE);
}

function bindEvents() {
  elements.closeWindow.addEventListener('click', () => window.api.closeWindow());
  elements.minimizeWindow.addEventListener('click', () => window.api.minimizeWindow());
  elements.settingsButton.addEventListener('click', openSettings);
  elements.startPauseButton.addEventListener('click', toggleTimer);
  elements.resetButton.addEventListener('click', resetTimer);
  elements.openRouterLink.addEventListener('click', () => {
    window.api.openExternal('https://openrouter.ai/keys');
  });
  elements.cancelApiKeyButton.addEventListener('click', () => hideModal(elements.apiKeyModal));
  elements.saveApiKeyButton.addEventListener('click', saveApiKeyAndContinue);
  elements.cancelSettingsButton.addEventListener('click', () => hideModal(elements.settingsModal));
  elements.saveSettingsButton.addEventListener('click', saveSettings);
  elements.deleteKeyButton.addEventListener('click', deleteApiKey);
  elements.toggleKeyButton.addEventListener('click', toggleApiKeyVisibility);
  elements.tabOpen.addEventListener('click', () => { activeTab = 'open'; renderTasks(); });
  elements.tabDone.addEventListener('click', () => { activeTab = 'done'; renderTasks(); });
  elements.tasksBulkSubmit.addEventListener('click', onBulkSubmit);
  elements.tasksInlineInput.addEventListener('keydown', onInlineKeydown);
  elements.openHistoryButton.addEventListener('click', openHistory);
  elements.historyCloseButton.addEventListener('click', closeHistory);
  elements.pomodoroAgainButton.addEventListener('click', onPomodoroAgain);
  elements.pomodoroBreakButton.addEventListener('click', onPomodoroBreak);
}

function toggleTimer() {
  if (isRunning) {
    pauseTimer();
    return;
  }
  startTimer();
}

function startTimer() {
  if (isRunning) {
    return;
  }
  isRunning = true;
  ensureAudioReady();
  endTime = Date.now() + remainingSeconds * 1000;
  timer = setInterval(tickTimer, 1000);
  updateDockBadge();
  renderTimer();
}

function pauseTimer() {
  clearInterval(timer);
  timer = null;
  isRunning = false;
  endTime = 0;
  window.api.setDockBadge('');
  renderTimer();
}

function resetTimer() {
  pauseTimer();
  remainingSeconds = getModeDurationSeconds();
  renderTimer();
}

function tickTimer() {
  if (!isRunning) {
    return;
  }
  remainingSeconds = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  updateDockBadge();
  renderTimer();

  if (remainingSeconds === 0) {
    finishCurrentMode();
  }
}

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

async function updateStreakOnLaunch() {
  const nextStats = updateStreak(data.stats, data.sessions, getToday());
  if (JSON.stringify(nextStats) !== JSON.stringify(data.stats)) {
    data.stats = nextStats;
    await saveData();
  }
}

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

function openSettings() {
  selectedWorkDuration = data.settings.workDuration;
  selectedBreakDuration = data.settings.breakDuration;
  elements.settingsApiKey.value = data.settings.apiKey || '';
  renderDurationOptions();
  showModal(elements.settingsModal);
}

async function saveSettings() {
  data.settings.workDuration = selectedWorkDuration;
  data.settings.breakDuration = selectedBreakDuration;
  data.settings.apiKey = elements.settingsApiKey.value.trim();
  await saveData();
  hideModal(elements.settingsModal);

  if (!isRunning) {
    remainingSeconds = getModeDurationSeconds();
  }
  render();
  showToast('Настройки сохранены');
}

async function deleteApiKey() {
  data.settings.apiKey = '';
  elements.settingsApiKey.value = '';
  await saveData();
  showToast('Ключ удалён');
}

function toggleApiKeyVisibility() {
  const isHidden = elements.settingsApiKey.type === 'password';
  elements.settingsApiKey.type = isHidden ? 'text' : 'password';
  elements.toggleKeyButton.textContent = isHidden ? 'Скрыть' : 'Показать';
}

function render() {
  renderTimer();
  renderTasks();
  renderStats();
}

function renderTimer() {
  elements.timerTime.textContent = formatTimer(remainingSeconds);
  elements.startPauseButton.textContent = isRunning ? 'Пауза' : 'Старт';
  elements.modeText.textContent = mode === 'work' ? 'Работа' : 'Отдых';
  const modeColor = mode === 'work' ? 'var(--accent)' : 'var(--rest)';
  elements.modeDot.style.background = modeColor;
  elements.timerProgress.style.stroke = modeColor;

  const progress = remainingSeconds / getModeDurationSeconds();
  elements.timerProgress.style.strokeDashoffset = String(TIMER_CIRCUMFERENCE * (1 - progress));
}

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
  if (draggable) {
    row.addEventListener('dragstart', (event) => onTaskDragStart(event, task.id, row));
    row.addEventListener('dragover', (event) => onTaskDragOver(event, row));
    row.addEventListener('dragleave', () => row.classList.remove('is-drop-target'));
    row.addEventListener('drop', (event) => onTaskDrop(event, task.id, row));
    row.addEventListener('dragend', () => onTaskDragEnd(row));
  }
  return row;
}

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
  elements.tasksInlineInput.value = '';
  await saveData();
  render();
}

async function onTaskCheckboxClick(taskId, rowElement) {
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) {
    return;
  }
  const oldLevel = getLevel(data.stats.totalXP);
  const nextDone = !task.done;
  data.stats.totalXP = applyTaskToggleXP(data.stats.totalXP, nextDone);
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

function renderStats() {
  const todaySessions = getTodaySessions(data.sessions, getToday());
  const level = getLevel(data.stats.totalXP);
  const progress = getLevelProgress(data.stats.totalXP);
  elements.levelNumber.textContent = `Lvl ${level.level}`;
  elements.levelName.textContent = level.name;
  elements.streakText.textContent = `🔥 ${data.stats.currentStreak} дней`;
  elements.todaySessionsText.textContent = `Сессий: ${todaySessions.length}`;
  elements.totalXPText.textContent = `Всего XP: ${data.stats.totalXP}`;

  if (progress.required === 0) {
    elements.xpBarFill.style.width = '100%';
    elements.xpProgressText.textContent = 'Максимальный уровень';
  } else {
    elements.xpBarFill.style.width = `${Math.min(100, (progress.current / progress.required) * 100)}%`;
    elements.xpProgressText.textContent = `${progress.current} / ${progress.required} XP до Lvl ${progress.nextLevel}`;
  }
}

function renderDurationOptions() {
  renderSegmentedOptions(elements.workDurationOptions, WORK_DURATIONS, selectedWorkDuration, (value) => {
    selectedWorkDuration = value;
    renderDurationOptions();
  });
  renderSegmentedOptions(elements.breakDurationOptions, BREAK_DURATIONS, selectedBreakDuration, (value) => {
    selectedBreakDuration = value;
    renderDurationOptions();
  });
}

function renderSegmentedOptions(container, values, selectedValue, onSelect) {
  container.innerHTML = '';
  for (const value of values) {
    const button = document.createElement('button');
    button.className = `secondary-button ${value === selectedValue ? 'is-active' : ''}`;
    button.textContent = `${value} мин`;
    button.addEventListener('click', () => onSelect(value));
    container.appendChild(button);
  }
}

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

async function onHistoryAIClick() {
  const button = document.getElementById('historyAIButton');
  const text = document.getElementById('historyAIText');
  if (!button || !text) {
    return;
  }
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

function showLevelUp(levelName) {
  elements.levelUpText.textContent = `Level Up! ${levelName} 🎉`;
  elements.levelUpOverlay.classList.remove('hidden');
  const confettiInstance = window.confetti?.create(elements.confettiCanvas, { resize: true });
  confettiInstance?.({
    particleCount: 140,
    spread: 75,
    origin: { y: 0.55 }
  });
  setTimeout(() => elements.levelUpOverlay.classList.add('hidden'), 2000);
}

function showModal(modalElement) {
  modalElement.classList.remove('hidden');
}

function hideModal(modalElement) {
  modalElement.classList.add('hidden');
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');
  setTimeout(() => elements.toast.classList.add('hidden'), 3000);
}

async function saveData() {
  data = await window.api.saveData(data);
}

function getModeDurationSeconds() {
  const minutes = mode === 'work' ? data.settings.workDuration : data.settings.breakDuration;
  return minutes * 60;
}

function updateDockBadge() {
  window.api.setDockBadge(isRunning ? formatTimer(remainingSeconds) : '');
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(restSeconds).padStart(2, '0')}`;
}

function getToday() {
  return formatDateKey(new Date());
}

function getCurrentTime() {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date());
}

function getDisplayDate() {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());
}

const WORK_END_NOTES = [523.25, 659.25, 783.99];
const BREAK_END_NOTES = [783.99, 659.25, 523.25];
const NOTE_STRIDE_SECONDS = 0.22;
const NOTE_DECAY_SECONDS = 0.85;
const NOTE_PEAK_GAIN = 0.95;
const CHIME_REPEAT_COUNT = 3;
const CHIME_REPEAT_GAP_SECONDS = 0.3;

function ensureAudioReady() {
  if (!audioContext) {
    audioContext = new AudioContext();
    audioCompressor = audioContext.createDynamicsCompressor();
    audioCompressor.threshold.value = -10;
    audioCompressor.knee.value = 8;
    audioCompressor.ratio.value = 4;
    audioCompressor.attack.value = 0.003;
    audioCompressor.release.value = 0.1;
    audioCompressor.connect(audioContext.destination);
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
}

function playBeep() {
  ensureAudioReady();
  const notes = mode === 'work' ? WORK_END_NOTES : BREAK_END_NOTES;
  const cycleDuration = notes.length * NOTE_STRIDE_SECONDS + CHIME_REPEAT_GAP_SECONDS;
  for (let cycle = 0; cycle < CHIME_REPEAT_COUNT; cycle += 1) {
    const cycleStart = audioContext.currentTime + cycle * cycleDuration;
    for (let index = 0; index < notes.length; index += 1) {
      playBellNote(notes[index], cycleStart + index * NOTE_STRIDE_SECONDS);
    }
  }
}

function playBellNote(frequency, startAt) {
  const fundamental = audioContext.createOscillator();
  const overtone = audioContext.createOscillator();
  const fundamentalGain = audioContext.createGain();
  const overtoneGain = audioContext.createGain();
  const envelope = audioContext.createGain();

  fundamental.type = 'sine';
  overtone.type = 'sine';
  fundamental.frequency.value = frequency;
  overtone.frequency.value = frequency * 2;
  fundamentalGain.gain.value = 0.75;
  overtoneGain.gain.value = 0.25;

  fundamental.connect(fundamentalGain).connect(envelope);
  overtone.connect(overtoneGain).connect(envelope);
  envelope.connect(audioCompressor);

  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(NOTE_PEAK_GAIN, startAt + 0.015);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + NOTE_DECAY_SECONDS);

  fundamental.start(startAt);
  overtone.start(startAt);
  fundamental.stop(startAt + NOTE_DECAY_SECONDS + 0.05);
  overtone.stop(startAt + NOTE_DECAY_SECONDS + 0.05);
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
