import { ConfigError, PROVIDER_IDS } from '../config.js';
import { createNvidiaProvider } from './nvidia.js';
import { createOllamaProvider } from './ollama.js';

/**
 * The provider layer, in full.
 *
 * Every provider implements one interface:
 *
 *   {
 *     id: string,
 *     label: string,          // shown in the UI
 *     model: string,          // shown in the UI
 *     streamChat(messages, { signal }): AsyncGenerator<string>
 *   }
 *
 * `streamChat` yields assistant text deltas in order and throws AppError with a
 * mapped code. Nothing above this layer knows which vendor is behind it, which
 * is all "provider abstraction" needs to mean for this app.
 */
const FACTORIES = {
  nvidia: createNvidiaProvider,
  ollama: createOllamaProvider,
};

export function createProvider(config, providerId = config.provider) {
  const factory = FACTORIES[providerId];
  if (!factory) {
    throw new ConfigError(
      `Unknown provider "${providerId}". Available: ${PROVIDER_IDS.join(', ')}.`,
    );
  }
  return factory({
    ...config.providers[providerId],
    timeoutMs: config.upstreamTimeoutMs,
  });
}

export { PROVIDER_IDS };
