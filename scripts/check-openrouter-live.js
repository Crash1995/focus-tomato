const { sendAIRequest } = require('../src/main/openRouterClient');

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main() {
  const apiKey = await readStdin();
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is empty');
  }

  const response = await sendAIRequest({
    sessions: [
      {
        time: '10:30',
        description: 'Проверил интеграцию OpenRouter'
      }
    ],
    apiKey,
    model: process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4o-mini'
  });

  if (!response || response.length < 10) {
    throw new Error('OpenRouter response is unexpectedly empty');
  }

  console.log('OpenRouter live check passed');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
