import { AppError, ErrorCodes } from '../lib/errors.js';

/**
 * Shared OpenAI-compatible streaming client.
 *
 * NVIDIA NIM and Ollama both expose `POST {baseUrl}/chat/completions` with
 * `stream: true` and Server-Sent Events in the OpenAI chunk shape, so the
 * request/response handling lives here once and each provider file stays a
 * thin description of endpoint + auth + model.
 */

export const SSE_DONE = '[DONE]';

/** Joins the `data:` lines of one SSE block. Returns null when there is no payload. */
export function readDataBlock(block) {
  const lines = block.split('\n');
  const data = [];
  for (const line of lines) {
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  return data.join('\n');
}

/** Yields the raw `data:` payload of every SSE block in a byte stream. */
export async function* parseSseStream(body) {
  const decoder = new TextDecoder();
  let buffer = '';

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const payload = readDataBlock(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      if (payload !== null) yield payload;
      boundary = buffer.indexOf('\n\n');
    }
  }

  buffer += decoder.decode();
  const payload = readDataBlock(buffer);
  if (payload !== null) yield payload;
}

/** Pulls the incremental text out of one OpenAI chunk. */
export function readChunkText(json) {
  const choice = json?.choices?.[0];
  const raw = choice?.delta?.content ?? choice?.text ?? '';
  return {
    text: typeof raw === 'string' ? raw : '',
    finished: Boolean(choice?.finish_reason),
  };
}

function parseJson(payload) {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

async function httpError(response, providerId, model) {
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 500);
  } catch {
    detail = '';
  }
  const context = `${providerId} (model: ${model}) responded ${response.status}${detail ? `: ${detail}` : ''}`;

  if (response.status === 401 || response.status === 403) {
    return new AppError(ErrorCodes.INVALID_API_KEY, { message: context });
  }
  if (response.status === 404) {
    return new AppError(ErrorCodes.MODEL_NOT_FOUND, { message: context });
  }
  if (response.status === 429) {
    return new AppError(ErrorCodes.RATE_LIMITED, { message: context });
  }
  if (response.status === 400 || response.status === 422) {
    return new AppError(ErrorCodes.BAD_REQUEST, {
      message: context,
      status: 502, // bad request from upstream, not from our client
    });
  }
  return new AppError(ErrorCodes.PROVIDER_UNAVAILABLE, { message: context });
}

/**
 * Streams assistant text deltas from an OpenAI-compatible endpoint.
 *
 * @param {object} options
 * @param {string} options.providerId  provider id, used in log messages
 * @param {string} options.baseUrl     e.g. https://integrate.api.nvidia.com/v1
 * @param {string} [options.apiKey]    omitted for local providers
 * @param {string} options.model
 * @param {{role: string, content: string}[]} options.messages
 * @param {AbortSignal} [options.signal] aborts when the browser disconnects
 * @param {number} options.timeoutMs   upstream deadline
 * @returns {AsyncGenerator<string>} text deltas, in order
 */
export async function* streamOpenAIChat({
  providerId,
  baseUrl,
  apiKey,
  model,
  messages,
  signal,
  timeoutMs,
}) {
  const controller = new AbortController();
  let timedOut = false;

  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) throw new AppError(ErrorCodes.ABORTED);
    signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  timer.unref?.();

  const headers = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const fail = () => {
    if (timedOut) {
      return new AppError(ErrorCodes.PROVIDER_UNAVAILABLE, {
        message: `${providerId} did not answer within ${timeoutMs}ms`,
      });
    }
    if (signal?.aborted) return new AppError(ErrorCodes.ABORTED);
    return null;
  };

  try {
    let response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, messages, stream: true, temperature: 0.7 }),
        signal: controller.signal,
      });
    } catch (error) {
      const mapped = fail();
      if (mapped) throw mapped;
      throw new AppError(ErrorCodes.NETWORK_ERROR, {
        message: `Cannot reach ${providerId} at ${baseUrl}: ${error.message}`,
        cause: error,
      });
    }

    if (!response.ok) throw await httpError(response, providerId, model);
    if (!response.body) {
      throw new AppError(ErrorCodes.PROVIDER_UNAVAILABLE, {
        message: `${providerId} returned an empty stream`,
      });
    }

    for await (const payload of parseSseStream(response.body)) {
      if (payload === SSE_DONE) return;
      const json = parseJson(payload);
      if (!json) continue;
      if (json.error) {
        throw new AppError(ErrorCodes.PROVIDER_UNAVAILABLE, {
          message: `${providerId} stream error: ${json.error.message ?? 'unknown'}`,
        });
      }
      const { text } = readChunkText(json);
      if (text) yield text;
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    const mapped = fail();
    if (mapped) throw mapped;
    throw new AppError(ErrorCodes.STREAM_INTERRUPTED, {
      message: `Stream from ${providerId} broke: ${error.message}`,
      cause: error,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
