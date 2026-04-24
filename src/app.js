const {
  calculateSessionXP,
  getLevel,
  getLevelProgress,
  getTodaySessions,
  updateStreak,
  buildShareText,
  formatDateKey
} = window.FocusForgeCore;

const TIMER_RADIUS = 96;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;
const WORK_DURATIONS = [15, 25, 45];
const BREAK_DURATIONS = [5, 10, 15];

let data = null;
let timer = null;
let mode = 'work';
let isRunning = false;
let remainingSeconds = 25 * 60;
let endTime = 0;
let selectedWorkDuration = 25;
let selectedBreakDuration = 5;
let aiReportText = '';
let isSummaryInFlight = false;
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
  elements.summaryButton.addEventListener('click', requestSummary);
  elements.sessionDescription.addEventListener('input', updateSessionXPPreview);
  elements.skipSessionButton.addEventListener('click', () => saveCompletedSession(''));
  elements.saveSessionButton.addEventListener('click', () => {
    saveCompletedSession(elements.sessionDescription.value);
  });
  elements.openRouterLink.addEventListener('click', () => {
    window.api.openExternal('https://openrouter.ai/keys');
  });
  elements.cancelApiKeyButton.addEventListener('click', () => hideModal(elements.apiKeyModal));
  elements.saveApiKeyButton.addEventListener('click', saveApiKeyAndContinue);
  elements.cancelSettingsButton.addEventListener('click', () => hideModal(elements.settingsModal));
  elements.saveSettingsButton.addEventListener('click', saveSettings);
  elements.deleteKeyButton.addEventListener('click', deleteApiKey);
  elements.toggleKeyButton.addEventListener('click', toggleApiKeyVisibility);
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
    elements.sessionDescription.value = '';
    updateSessionXPPreview();
    elements.sessionModalTitle.textContent = `Сессия #${getTodaySessions(data.sessions, getToday()).length + 1} завершена! 🎉`;
    showModal(elements.sessionModal);
    return;
  }

  mode = 'work';
  remainingSeconds = getModeDurationSeconds();
  renderTimer();
}

async function saveCompletedSession(description) {
  const trimmedDescription = String(description || '').trim();
  const xp = calculateSessionXP(trimmedDescription);
  const oldLevel = getLevel(data.stats.totalXP);

  data.sessions.unshift({
    date: getToday(),
    time: getCurrentTime(),
    description: trimmedDescription,
    xp
  });
  data.stats.totalXP += xp;
  data.stats.level = getLevel(data.stats.totalXP).level;
  await saveData();

  hideModal(elements.sessionModal);
  showToast(`+${xp} XP`);

  const newLevel = getLevel(data.stats.totalXP);
  if (newLevel.level > oldLevel.level) {
    showLevelUp(newLevel.name);
  }

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

async function requestSummary() {
  if (isSummaryInFlight) {
    return;
  }
  const todaySessions = getTodaySessions(data.sessions, getToday());
  if (todaySessions.length < 2) {
    return;
  }

  if (!data.settings.apiKey && !openRouterConfig.hasEnvAPIKey) {
    showModal(elements.apiKeyModal);
    return;
  }

  isSummaryInFlight = true;
  renderSummaryLoading();

  try {
    aiReportText = await window.api.sendAIRequest([...todaySessions].reverse(), data.settings.apiKey);
    renderSummaryCard();
  } catch (error) {
    renderSummaryError(error.message || 'Что-то пошло не так. Попробуй ещё раз');
  } finally {
    isSummaryInFlight = false;
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
  requestSummary();
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
  renderSessions();
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

function renderSessions() {
  const todaySessions = getTodaySessions(data.sessions, getToday());
  elements.sessionList.innerHTML = '';

  if (todaySessions.length === 0) {
    elements.sessionList.innerHTML = '<div class="empty-state">Ни одной сессии. Жми Старт и начинай</div>';
  } else {
    for (const session of todaySessions) {
      const card = document.createElement('article');
      card.className = 'session-card';
      card.innerHTML = `
        <div class="session-meta">
          <span>${escapeHTML(session.time)}</span>
          <span class="session-xp">+${session.xp} XP</span>
        </div>
        <div>${escapeHTML(session.description || 'без описания')}</div>
      `;
      elements.sessionList.appendChild(card);
    }
  }

  elements.summaryButton.classList.toggle('hidden', todaySessions.length < 2);
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

function renderSummaryLoading() {
  elements.centerPanel.innerHTML = `
    <div class="panel-header"><h1>Итоги дня</h1></div>
    <div class="loading-dots"><span></span><span></span><span></span></div>
  `;
}

function renderSummaryError(message) {
  elements.centerPanel.innerHTML = `
    <div class="panel-header"><h1>Итоги дня</h1></div>
    <p style="color: var(--error); margin: 18px 0;">${escapeHTML(message)}</p>
    <button class="secondary-button" id="backToSessionsButton">← Назад к сессиям</button>
  `;
  document.getElementById('backToSessionsButton').addEventListener('click', restoreSessionPanel);
}

function renderSummaryCard() {
  const todaySessions = getTodaySessions(data.sessions, getToday());
  const todayXP = todaySessions.reduce((sum, session) => sum + session.xp, 0);
  const summary = {
    dateTitle: getDisplayDate(),
    sessionsCount: todaySessions.length,
    xp: todayXP,
    streak: data.stats.currentStreak,
    aiText: aiReportText
  };

  elements.centerPanel.innerHTML = `
    <div class="summary-card" id="summaryCard">
      <h2>${escapeHTML(summary.dateTitle)}</h2>
      <div class="summary-meta">🍅 ${summary.sessionsCount} сессий  ⚡ ${summary.xp} XP  🔥 ${summary.streak} дней</div>
      <div class="summary-text">${escapeHTML(summary.aiText)}</div>
      <div class="summary-logo">FocusForge</div>
    </div>
    <div class="summary-actions">
      <button class="secondary-button" id="backToSessionsButton">← Назад к сессиям</button>
      <button class="secondary-button" id="copySummaryButton">Скопировать текст</button>
      <button class="primary-button" id="savePngButton">Сохранить PNG</button>
    </div>
  `;
  document.getElementById('backToSessionsButton').addEventListener('click', restoreSessionPanel);
  document.getElementById('copySummaryButton').addEventListener('click', () => copySummary(summary));
  document.getElementById('savePngButton').addEventListener('click', saveSummaryPNG);
}

function restoreSessionPanel() {
  elements.centerPanel.innerHTML = `
    <div class="panel-header"><h1>Сегодня</h1></div>
    <div class="session-list" id="sessionList"></div>
    <button class="primary-button day-summary-button hidden" id="summaryButton">Итоги дня ✨</button>
  `;
  elements.sessionList = document.getElementById('sessionList');
  elements.summaryButton = document.getElementById('summaryButton');
  elements.summaryButton.addEventListener('click', requestSummary);
  renderSessions();
}

async function copySummary(summary) {
  await window.api.copyToClipboard(buildShareText(summary));
  showToast('Текст скопирован');
}

async function saveSummaryPNG() {
  const card = document.getElementById('summaryCard');
  const exportCard = card.cloneNode(true);
  exportCard.id = 'summaryExportCard';
  exportCard.classList.add('export-card');
  document.body.appendChild(exportCard);

  try {
    const canvas = await html2canvas(exportCard, {
      backgroundColor: '#0a0a0f',
      width: 1080,
      height: 1080,
      scale: 1
    });
    const result = await window.api.saveImage(canvas.toDataURL('image/png'));
    if (result.saved) {
      showToast('Сохранено! Поделись #FocusForge');
    }
  } finally {
    exportCard.remove();
  }
}

function updateSessionXPPreview() {
  elements.sessionXpPreview.textContent = `+${calculateSessionXP(elements.sessionDescription.value)} XP`;
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
