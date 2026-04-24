# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Проект

FocusForge — desktop-приложение для macOS на Electron. Pomodoro-таймер с геймификацией (XP, уровни, стрики) и AI-итогами дня через OpenRouter. UI и тексты — на русском.

Требования: Node.js ≥ 22, CommonJS (`"type": "commonjs"` в package.json).

## Команды

- `npm start` — запуск в dev-режиме (`electron src/main.js`).
- `npm run build:mac` — сборка DMG через electron-builder.
- Релиз — тег `v*` → GitHub Actions (`.github/workflows/release.yml`) собирает `.app` на `macos-latest`, архивирует `FocusForge-<version>-mac.zip` и публикует GitHub Release.

Тестов, линтеров и форматтеров в проекте нет. При добавлении не ставь зависимости без подтверждения пользователя.

## Архитектура

Классическое разделение Electron на main / preload / renderer. Renderer работает в sandbox (`nodeIntegration: false`, `contextIsolation: true`).

### Main process (`src/main.js`)

- Создаёт фиксированное окно 900×560, frameless (кастомные traffic lights в `index.html`).
- Регистрирует IPC-хендлеры (whitelist): `data:load`, `data:save`, `ai:request`, `openrouter:config`, `image:save`, `clipboard:copy`, `dock:setBadge`, `external:open`, `window:minimize`, `window:close`.
- `external:open` **намеренно** разрешает только URL `https://openrouter.ai/…` — при расширении валидации не смягчай проверку без явной причины.
- `image:save` получает dataURL, режет префикс `data:image/png;base64,` и пишет через `dialog.showSaveDialog` + `fs.writeFile`.
- Dock badge используется для отображения оставшегося времени активного таймера.

### Preload (`src/preload.js`)

Единственная точка контакта renderer ↔ main. Экспортирует `window.api` через `contextBridge.exposeInMainWorld`. Любой новый IPC-канал должен быть добавлен и в `main.js` (handle), и сюда (invoke), иначе renderer его не увидит.

### Хранилище (`src/main/dataStore.js`)

- JSON-файл `app.getPath('appData')/FocusForge/data.json`.
- Форма: `{ sessions: [], stats: { totalXP, level, currentStreak, bestStreak, lastActiveDate }, settings: { workDuration, breakDuration, apiKey } }`.
- `mergeWithDefaults` выполняет роль мягкой миграции — при добавлении новых полей обязательно обнови `createDefaultData` и `mergeWithDefaults`, иначе у существующих пользователей поле останется undefined.
- Сохранение — всегда полная перезапись файла.
- `apiKey` OpenRouter хранится здесь в открытом виде, как пользовательская настройка.

### OpenRouter-клиент (`src/main/openRouterClient.js`)

- POST `https://openrouter.ai/api/v1/chat/completions`, модель по умолчанию `openai/gpt-4o-mini`.
- Системный промпт формирует структуру отчёта (достижение дня / паттерн / совет), он жёстко задан в `buildRequestBody` — меняется вместе с UX.
- Бросает `AIRequestError` с кодами `offline` / `invalid-key` / `unknown` / `invalid-response`; renderer показывает `error.message` в `renderSummaryError`.

### Core (`src/core/gamification.js`)

- UMD-модуль: одновременно CommonJS-экспорт и `window.FocusForgeCore`. Это нужно, потому что файл подключается и в renderer через `<script>`, и теоретически доступен из Node. При правке сохраняй оба пути экспорта.
- Константы XP (`BASE_SESSION_XP = 25`, `DESCRIPTION_BONUS_XP = 10`, `PRODUCTIVE_DAY_SESSIONS = 4`) и таблица `LEVELS` — это источник правды для геймификации.
- Стрик продлевается только если вчерашний день был «продуктивным» (≥ `PRODUCTIVE_DAY_SESSIONS` сессий) и предыдущая активная дата равна вчерашнему дню; иначе сбрасывается в 0.

### Renderer (`src/app.js`, `src/index.html`, `src/styles.css`)

- Ванильный JS без фреймворков и без сборщика. Модули подключаются через `<script>` напрямую.
- В `bindElements` все элементы с `id` автоматически попадают в словарь `elements` — новые узлы достаточно пометить `id`, отдельная регистрация не нужна.
- Состояние UI держится в module-level переменных (`data`, `timer`, `mode`, `isRunning`, `remainingSeconds`, `aiReportText` и т.д.). Любое изменение сохраняемых данных — через `saveData()`, который возвращает нормализованную копию из main-процесса.
- Центральная панель (`#centerPanel`) **перерисовывается через `innerHTML`** при переключении между списком сессий и экраном AI-итогов — после этого `restoreSessionPanel` заново берёт ссылки на `sessionList` / `summaryButton` и вешает обработчики. Не держи долгоживущие ссылки на узлы внутри этой панели.
- Весь пользовательский ввод экранируется через `escapeHTML` перед вставкой в innerHTML.
- PNG-карточка итогов рендерится html2canvas в фиксированном размере 1080×1080 — для этого создаётся клон с классом `.export-card` и удаляется в `finally`.

### Vendor (`src/vendor/`)

`html2canvas.min.js` и `confetti.browser.js` лежат в репозитории как локальные копии (не через npm). Апдейтить — ручной замешивой файлов, не добавляй их в зависимости.

## Правила поведения для этого репозитория

- Перед любым изменением кода сначала показывай план (3–5 пунктов) и жди подтверждения — см. глобальный CLAUDE.md пользователя.
- Коммиты на русском, Conventional Commits (тип/scope на английском, заголовок и тело на русском). Без `Co-Authored-By`.
- Не добавляй npm-зависимости без подтверждения — проект намеренно минимальный (только `electron` + `electron-builder` в devDependencies).
- Не трогай `package-lock.json` вручную.
