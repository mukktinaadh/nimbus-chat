import { AppError, ErrorCodes } from '../lib/errors.js';
import { streamOpenAIChat } from './openaiCompat.js';

/**
 * NVIDIA NIM / NVIDIA API Catalog provider.
 * OpenAI-compatible, key required, key never leaves the server.
 *
 * The key is validated when the first request arrives rather than at boot, so
 * the server still starts (and can return a useful message) when .env is empty.
 */
export function createNvidiaProvider({ apiKey, model, baseUrl, timeoutMs }) {
  return {
    id: 'nvidia',
    label: 'NVIDIA NIM',
    model,

    async *streamChat(messages, { signal } = {}) {
      if (!apiKey) {
        throw new AppError(ErrorCodes.MISSING_API_KEY, {
          message: 'NVIDIA_API_KEY is not set. Add it to .env or switch LLM_PROVIDER to "ollama".',
        });
      }
      yield* streamOpenAIChat({
        providerId: 'nvidia',
        baseUrl,
        apiKey,
        model,
        messages,
        signal,
        timeoutMs,
      });
    },
  };
}
