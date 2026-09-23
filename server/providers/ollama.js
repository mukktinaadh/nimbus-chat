import { AppError, ErrorCodes } from '../lib/errors.js';
import { streamOpenAIChat } from './openaiCompat.js';

/**
 * Local Ollama provider, speaking Ollama's OpenAI-compatible endpoint
 * (`{baseUrl}/chat/completions`). No API key, so the app runs with zero
 * credentials and no outbound calls beyond localhost.
 */
export function createOllamaProvider({ baseUrl, model, timeoutMs }) {
  return {
    id: 'ollama',
    label: 'Ollama (local)',
    model,

    async *streamChat(messages, { signal } = {}) {
      try {
        yield* streamOpenAIChat({
          providerId: 'ollama',
          baseUrl,
          model,
          messages,
          signal,
          timeoutMs,
        });
      } catch (error) {
        // Turn the most common local failure into something actionable.
        if (error instanceof AppError && error.code === ErrorCodes.NETWORK_ERROR) {
          throw new AppError(ErrorCodes.NETWORK_ERROR, {
            message:
              `${error.message}. Is Ollama running (\`ollama serve\`) and does the model exist ` +
              `(\`ollama pull ${model}\`)?`,
            cause: error,
          });
        }
        throw error;
      }
    },
  };
}
