class AIRequestError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AIRequestError';
    this.code = code;
  }
}

async function sendAIRequest({ sessions, apiKey, model = 'openai/gpt-4o-mini', fetchImpl = fetch }) {
  const response = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildRequestBody(sessions, model))
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

function buildRequestBody(sessions, model = 'openai/gpt-4o-mini') {
  return {
    model,
    messages: [
      {
        role: 'system',
        content: [
          'Ты — продуктивити-коуч. Получаешь список рабочих сессий пользователя за день',
          '(25-минутные блоки помодоро). Напиши краткий энергичный отчёт:',
          '1) Главное достижение дня (1 предложение)',
          '2) Паттерн в работе — что заметил (1-2 предложения)',
          '3) Совет на завтра (1 предложение)',
          'Русский язык, дружелюбно, энергично, без воды. Максимум 5 предложений.'
        ].join('\n')
      },
      {
        role: 'user',
        content: `Мои сессии за сегодня:\n${formatSessions(sessions)}`
      }
    ]
  };
}

function formatSessions(sessions) {
  return sessions
    .map((session) => {
      const description = String(session.description || '').trim() || 'без описания';
      return `${session.time} — ${description}`;
    })
    .join('\n');
}

module.exports = {
  AIRequestError,
  sendAIRequest,
  buildRequestBody,
  formatSessions
};
