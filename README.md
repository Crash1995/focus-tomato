# FocusForge

FocusForge — macOS-приложение на Electron для фокус-сессий, XP, стриков и AI-итогов дня через OpenRouter.

## Возможности

- Pomodoro-таймер с рабочими сессиями и отдыхом.
- Сохранение описаний сессий, XP, уровней и стриков.
- AI-карточка итогов дня через OpenRouter.
- Копирование текста отчета и экспорт карточки в PNG.
- Локальное хранение данных в `~/Library/Application Support/FocusForge/data.json`.

## Требования

- macOS.
- Node.js `22+`.
- npm.

## Установка

```bash
npm install
```

## Запуск

```bash
npm start
```

## OpenRouter

API-ключ можно указать в настройках приложения. Для разработки также можно передать ключ через переменную окружения:

```bash
OPENROUTER_API_KEY=your_key npm start
```

Модель по умолчанию — `openai/gpt-4o-mini`. Ее можно заменить:

```bash
OPENROUTER_DEFAULT_MODEL=anthropic/claude-sonnet-4.5 npm start
```

Не коммитьте реальные ключи. Для примера используйте `.env.example`.

## Сборка macOS

```bash
npm run build:mac
```

Готовый DMG появится в `dist/`. Эта папка не хранится в Git.
