const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AIRequestError,
  sendAIRequest
} = require('../src/main/openRouterClient');

test('sendAIRequest returns assistant content', async () => {
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.equal(JSON.parse(options.body).model, 'anthropic/claude-sonnet-4.5');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          { message: { content: 'Отличный день фокуса.' } }
        ]
      })
    };
  };

  const text = await sendAIRequest({
    sessions: [{ time: '10:30', description: 'Код' }],
    apiKey: 'test-key',
    model: 'anthropic/claude-sonnet-4.5',
    fetchImpl
  });

  assert.equal(text, 'Отличный день фокуса.');
});

test('sendAIRequest maps 401 to invalid key message', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    json: async () => ({})
  });

  await assert.rejects(
    () => sendAIRequest({ sessions: [], apiKey: 'bad-key', fetchImpl }),
    new AIRequestError('Неверный API ключ. Проверь на openrouter.ai/keys', 'invalid-key')
  );
});

test('sendAIRequest maps fetch network cause to offline message', async () => {
  const networkError = new TypeError('fetch failed');
  networkError.cause = { code: 'ENOTFOUND' };
  const fetchImpl = async () => {
    throw networkError;
  };

  await assert.rejects(
    () => sendAIRequest({ sessions: [], apiKey: 'test-key', fetchImpl }),
    new AIRequestError('Нет подключения к интернету', 'offline')
  );
});
