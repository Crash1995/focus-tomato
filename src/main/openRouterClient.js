class AIRequestError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AIRequestError';
    this.code = code;
  }
}

async function sendAIRequest({ closedTasks, pomodoroCount, apiKey, model = 'openai/gpt-4o-mini', fetchImpl = fetch }) {
  // Защита от stale-вызовов: старый caller передавал (sessions, apiKey) и
  // apiKey оказался бы в `pomodoroCount`, улетев в prompt OpenRouter'у.
  if (!Array.isArray(closedTasks) || typeof pomodoroCount !== 'number') {
    throw new AIRequestError('Неверный формат запроса', 'invalid-request');
  }

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
