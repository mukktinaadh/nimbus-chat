import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, ConfigError, DEFAULT_SYSTEM_PROMPT } from '../server/config.js';
import { createProvider } from '../server/providers/index.js';

test('falls back to the local provider when no NVIDIA key is present', () => {
  const config = loadConfig({});
  assert.equal(config.provider, 'ollama');
});

test('auto-selects nvidia when a key is present', () => {
  const config = loadConfig({ NVIDIA_API_KEY: 'abc123' });
  assert.equal(config.provider, 'nvidia');
});

test('an explicit LLM_PROVIDER wins over auto-detection', () => {
  const config = loadConfig({ LLM_PROVIDER: 'ollama', NVIDIA_API_KEY: 'abc123' });
  assert.equal(config.provider, 'ollama');
});

test('rejects an unsupported provider name', () => {
  assert.throws(() => loadConfig({ LLM_PROVIDER: 'gemini' }), ConfigError);
});

test('createProvider rejects an unknown provider id', () => {
  const config = loadConfig({});
  assert.throws(() => createProvider(config, 'nope'), ConfigError);
});

test('numeric limits fall back when the value is not a positive integer', () => {
  const config = loadConfig({ MAX_MESSAGE_CHARS: 'lots', PORT: '-3' });
  assert.equal(config.limits.maxMessageChars, 8000);
  assert.equal(config.port, 3001);
});

test('the system prompt is configurable and never empty', () => {
  assert.equal(loadConfig({}).systemPrompt, DEFAULT_SYSTEM_PROMPT);
  assert.equal(loadConfig({ SYSTEM_PROMPT: 'Be terse.' }).systemPrompt, 'Be terse.');
  assert.equal(loadConfig({ SYSTEM_PROMPT: '   ' }).systemPrompt, DEFAULT_SYSTEM_PROMPT);
});

test('trailing slashes are stripped from base URLs', () => {
  const config = loadConfig({ OLLAMA_BASE_URL: 'http://127.0.0.1:11434/v1/' });
  assert.equal(config.providers.ollama.baseUrl, 'http://127.0.0.1:11434/v1');
});
