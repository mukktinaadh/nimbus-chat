import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Single place where .env is read. Nothing else in the codebase touches
// process.env directly, so there is exactly one story for secrets.
dotenv.config({ path: path.join(projectRoot, '.env') });

export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful general-purpose AI assistant. Answer clearly, accurately, and concisely. If you are uncertain, say so.';

export const PROVIDER_IDS = ['nvidia', 'ollama'];

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

function asInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function trimTrailingSlash(url) {
  return String(url ?? '').replace(/\/+$/, '');
}

/**
 * Reads configuration from an env object. Pure function so tests can pass
 * their own env instead of mutating process.env.
 */
export function loadConfig(env = process.env) {
  const requested = String(env.LLM_PROVIDER ?? '').trim().toLowerCase();
  if (requested && !PROVIDER_IDS.includes(requested)) {
    throw new ConfigError(
      `LLM_PROVIDER="${requested}" is not supported. Use one of: ${PROVIDER_IDS.join(', ')}.`,
    );
  }

  // Auto-detect: a configured NVIDIA key wins, otherwise fall back to the
  // local runtime. This keeps the app runnable with zero credentials.
  const hasNvidiaKey = Boolean(String(env.NVIDIA_API_KEY ?? '').trim());
  const provider = requested || (hasNvidiaKey ? 'nvidia' : 'ollama');

  return {
    projectRoot,
    isProduction: env.NODE_ENV === 'production',
    port: asInt(env.PORT, 3001),
    provider,
    systemPrompt: String(env.SYSTEM_PROMPT ?? '').trim() || DEFAULT_SYSTEM_PROMPT,
    limits: {
      maxMessageChars: asInt(env.MAX_MESSAGE_CHARS, 8000),
      maxContextChars: asInt(env.MAX_CONTEXT_CHARS, 24000),
      maxMessages: asInt(env.MAX_MESSAGES, 40),
      maxBodyBytes: '256kb',
    },
    upstreamTimeoutMs: asInt(env.UPSTREAM_TIMEOUT_MS, 120000),
    providers: {
      nvidia: {
        apiKey: String(env.NVIDIA_API_KEY ?? '').trim(),
        model: String(env.NVIDIA_MODEL ?? '').trim() || 'meta/llama-3.1-8b-instruct',
        baseUrl: trimTrailingSlash(env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1'),
      },
      ollama: {
        baseUrl: trimTrailingSlash(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1'),
        model: String(env.OLLAMA_MODEL ?? '').trim() || 'llama3.2:latest',
      },
    },
  };
}

export const config = loadConfig();
