import { Router } from 'express';
import { createProvider } from '../providers/index.js';
import { validateChatRequest } from '../lib/validation.js';
import { describeError, isAbortError } from '../lib/errors.js';
import { openEventStream, sendEvent, startHeartbeat } from '../lib/sse.js';

// Free-tier guard: how many generations one client may have running at once.
// Rejects extra requests instead of queueing them, so a stuck tab cannot burn
// the provider quota.
const MAX_CONCURRENT_PER_CLIENT = 2;

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * POST /api/chat
 *
 * Body: `{ "messages": [{ "role": "user" | "assistant", "content": "..." }] }`
 * Returns an SSE stream of `delta` events, then `done`, or `error`.
 */
export function createChatRouter(config) {
  const router = Router();
  const inFlight = new Map(); // client key -> active generation count

  router.post('/', async (req, res) => {
    let messages;
    try {
      messages = validateChatRequest(req.body, config.limits);
    } catch (error) {
      const { status, code, message } = describeError(error);
      console.warn(`[chat] rejected request: ${error.message}`);
      return res.status(status).json({ error: { code, message } });
    }

    const key = clientKey(req);
    if ((inFlight.get(key) ?? 0) >= MAX_CONCURRENT_PER_CLIENT) {
      return res.status(429).json({
        error: {
          code: 'rate_limited',
          message: 'Too many requests at once. Wait for the current response to finish.',
        },
      });
    }
    inFlight.set(key, (inFlight.get(key) ?? 0) + 1);

    try {
      await streamResponse({ config, messages, req, res });
    } finally {
      const remaining = (inFlight.get(key) ?? 1) - 1;
      if (remaining <= 0) inFlight.delete(key);
      else inFlight.set(key, remaining);
    }
  });

  return router;
}

async function streamResponse({ config, messages, req, res }) {
  let provider;
  try {
    provider = createProvider(config);
  } catch (error) {
    const { status, code, message } = describeError(error);
    console.error('[chat] provider setup failed:', error.message);
    return res.status(status).json({ error: { code, message } });
  }

  const controller = new AbortController();
  let clientGone = false;
  // `close` fires when the browser navigates away or presses Stop. Aborting
  // here stops the upstream call instead of leaving it running unattended.
  res.on('close', () => {
    if (!res.writableEnded) {
      clientGone = true;
      controller.abort();
    }
  });
  // A half-open socket must not take the process down with an unhandled
  // 'error' event; the result is the same either way: stop generating.
  res.on('error', (error) => {
    clientGone = true;
    controller.abort();
    console.warn('[chat] response stream error:', error.message);
  });

  openEventStream(res);
  const stopHeartbeat = startHeartbeat(res);

  // System instruction first, then the conversation. Provider-agnostic.
  const providerMessages = [{ role: 'system', content: config.systemPrompt }, ...messages];
  const startedAt = Date.now();
  let chars = 0;

  try {
    for await (const delta of provider.streamChat(providerMessages, { signal: controller.signal })) {
      if (clientGone || res.writableEnded) break;
      chars += delta.length;
      sendEvent(res, 'delta', { delta });
    }
    if (!clientGone && !res.writableEnded) {
      sendEvent(res, 'done', {
        provider: provider.id,
        model: provider.model,
        latencyMs: Date.now() - startedAt,
      });
    }
  } catch (error) {
    if (isAbortError(error) || clientGone) {
      console.log('[chat] client aborted generation');
    } else {
      const { code, message } = describeError(error);
      console.warn(`[chat] provider error (${code}): ${error.message}`);
      sendEvent(res, 'error', { code, message });
    }
  } finally {
    stopHeartbeat();
    if (!res.writableEnded) res.end();
    console.log(
      `[chat] ${provider.id}/${provider.model} ${messages.length} msg in -> ${chars} chars out in ${Date.now() - startedAt}ms`,
    );
  }
}
