const assert = require('node:assert/strict');

const PORT = Number(process.env.FOCUSFORGE_DEBUG_PORT || 9223);
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function main() {
  const client = await connectToPage();

  await waitFor(client, 'Boolean(window.api && window.FocusForgeCore && document.getElementById("timerTime"))');
  await resetAppData(client);
  await evaluate(client, 'location.reload()');
  await waitFor(client, 'Boolean(window.api && window.FocusForgeCore && document.getElementById("timerTime"))');
  await expectText(client, '#timerTime', '25:00');
  await expectText(client, '#modeText', 'Работа');

  await click(client, 'settingsButton');
  await waitFor(client, '!document.getElementById("settingsModal").classList.contains("hidden")');
  await clickByText(client, '#workDurationOptions button', '15 мин');
  await clickByText(client, '#breakDurationOptions button', '10 мин');
  await fill(client, 'settingsApiKey', 'invalid-test-key');
  await click(client, 'saveSettingsButton');
  await waitFor(client, 'document.getElementById("settingsModal").classList.contains("hidden")');
  await expectText(client, '#timerTime', '15:00');

  await click(client, 'settingsButton');
  await waitFor(client, '!document.getElementById("settingsModal").classList.contains("hidden")');
  await clickByText(client, '#workDurationOptions button', '45 мин');
  await click(client, 'toggleKeyButton');
  await waitFor(client, 'document.getElementById("settingsApiKey").type === "text"');
  await click(client, 'cancelSettingsButton');
  await waitFor(client, 'document.getElementById("settingsModal").classList.contains("hidden")');
  await expectText(client, '#timerTime', '15:00');

  await click(client, 'startPauseButton');
  await waitFor(client, 'document.getElementById("startPauseButton").textContent === "Пауза"');
  await delay(1200);
  const runningTime = await textContent(client, '#timerTime');
  assert.notEqual(runningTime, '15:00');

  await click(client, 'startPauseButton');
  await expectText(client, '#startPauseButton', 'Старт');
  await click(client, 'resetButton');
  await expectText(client, '#timerTime', '15:00');

  await evaluate(client, 'window.finishCurrentMode()');
  await waitFor(client, '!document.getElementById("sessionModal").classList.contains("hidden")');
  await fill(client, 'sessionDescription', 'Проверил UI-кнопки');
  await expectText(client, '#sessionXpPreview', '+35 XP');
  await click(client, 'saveSessionButton');
  await waitFor(client, 'document.getElementById("sessionModal").classList.contains("hidden")');
  await expectText(client, '#modeText', 'Отдых');
  await waitFor(client, 'document.querySelectorAll(".session-card").length === 1');
  assert.match(await textContent(client, '#totalXPText'), /35/);

  await evaluate(client, 'window.finishCurrentMode()');
  await expectText(client, '#modeText', 'Работа');
  await evaluate(client, 'window.finishCurrentMode()');
  await waitFor(client, '!document.getElementById("sessionModal").classList.contains("hidden")');
  await click(client, 'skipSessionButton');
  await waitFor(client, 'document.querySelectorAll(".session-card").length === 2');
  await waitFor(client, '!document.getElementById("summaryButton").classList.contains("hidden")');

  await click(client, 'settingsButton');
  await waitFor(client, '!document.getElementById("settingsModal").classList.contains("hidden")');
  await click(client, 'deleteKeyButton');
  await click(client, 'saveSettingsButton');
  await click(client, 'summaryButton');
  await waitFor(client, '!document.getElementById("apiKeyModal").classList.contains("hidden")');
  await click(client, 'cancelApiKeyButton');

  await click(client, 'settingsButton');
  await fill(client, 'settingsApiKey', 'mock-key');
  await click(client, 'saveSettingsButton');
  await click(client, 'summaryButton');
  await waitFor(client, 'document.getElementById("summaryCard") !== null');
  assert.match(await textContent(client, '#summaryCard'), /smoke test/);
  await click(client, 'copySummaryButton');
  await waitFor(client, 'document.getElementById("toast").textContent.includes("Текст скопирован")');
  await click(client, 'savePngButton');
  await waitFor(client, 'document.getElementById("toast").textContent.includes("Сохранено")');

  await resetAppData(client);
  await click(client, 'minimizeWindow');
  await delay(200);
  await click(client, 'closeWindow').catch(() => {});
  await client.close();
  console.log('UI smoke test passed');
}

async function resetAppData(client) {
  await evaluate(client, `
    window.api.saveData({
      sessions: [],
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
    })
  `);
}

async function connectToPage() {
  const targets = await fetch(`${BASE_URL}/json`).then((response) => response.json());
  const pageTarget = targets.find((target) => target.type === 'page');
  assert.ok(pageTarget, 'Не найден CDP page target');
  return CDPClient.connect(pageTarget.webSocketDebuggerUrl);
}

async function click(client, id) {
  await evaluate(client, `document.getElementById(${JSON.stringify(id)}).click()`);
}

async function clickByText(client, selector, text) {
  await evaluate(client, `
    [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((element) => element.textContent.trim() === ${JSON.stringify(text)})
      .click()
  `);
}

async function fill(client, id, value) {
  await evaluate(client, `
    (() => {
      const element = document.getElementById(${JSON.stringify(id)});
      element.value = ${JSON.stringify(value)};
      element.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
}

async function expectText(client, selector, expectedText) {
  const actualText = await textContent(client, selector);
  assert.equal(actualText.trim(), expectedText);
}

async function textContent(client, selector) {
  return evaluate(client, `document.querySelector(${JSON.stringify(selector)}).textContent`);
}

async function waitFor(client, expression, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(client, expression)) {
      return;
    }
    await delay(100);
  }
  throw new Error(`Timeout waiting for: ${expression}`);
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  }
  return result.result.value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CDPClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.callbacks = new Map();
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        return;
      }
      const callback = this.callbacks.get(message.id);
      if (!callback) {
        return;
      }
      this.callbacks.delete(message.id);
      if (message.error) {
        callback.reject(new Error(message.error.message));
      } else {
        callback.resolve(message.result);
      }
    });
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener('open', () => resolve(new CDPClient(socket)));
      socket.addEventListener('error', reject);
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
    });
  }

  close() {
    this.socket.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
