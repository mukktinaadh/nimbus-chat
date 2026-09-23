/**
 * The only place the browser talks to the backend.
 *
 * Every function here targets a same-origin `/api/*` route on our own Express
 * server. The provider API key lives on that server and is never part of the
 * bundle, which is the whole reason this layer exists instead of calling an
 * LLM vendor from the client.
 */

export class ChatApiError extends Error {
  constructor(code, message, status = 0) {
    super(message || 'The request failed.');
    this.name = 'ChatApiError';
    this.code = code;
    this.status = status;
  }
}

async function readErrorResponse(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const code = payload?.error?.code || 'unknown';
  const message = payload?.error?.message || `Request failed with status ${response.status}.`;
  return new ChatApiError(code, message, response.status);
}

/** Splits a raw SSE block into its `event:` name and `data` payload. */
function readSseBlock(block) {
  let event = 'message';
  const dataLines = [];
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue; // heartbeat comment
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

/**
 * Streams a completion for `messages`.
 *
 * @param {object} options
 * @param {{role: string, content: string}[]} options.messages conversation history
 * @param {(delta: string) => void} [options.onDelta] called for every text chunk
 * @param {(meta: object) => void} [options.onDone] called when the stream completes
 * @param {AbortSignal} [options.signal] aborts the request and the upstream call
 * @returns {Promise<void>}
 */
export async function streamChat({ messages, onDelta, onDone, signal }) {
  let response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new ChatApiError('aborted', 'Generation stopped.');
    throw new ChatApiError('network_error', 'Cannot reach the chat server. Is it running?');
  }

  if (!response.ok) throw await readErrorResponse(response);
  if (!response.body) throw new ChatApiError('unknown', 'The server sent an empty response.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const handleBlock = (block) => {
    const parsed = readSseBlock(block);
    if (!parsed) return;
    let data;
    try {
      data = JSON.parse(parsed.data);
    } catch {
      return; // ignore anything that is not a JSON event
    }
    if (parsed.event === 'delta' && typeof data.delta === 'string') {
      onDelta?.(data.delta);
    } else if (parsed.event === 'done') {
      onDone?.(data);
    } else if (parsed.event === 'error') {
      throw new ChatApiError(data.code || 'unknown', data.message);
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        handleBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) handleBlock(buffer);
  } catch (error) {
    if (error instanceof ChatApiError) throw error;
    if (error?.name === 'AbortError') throw new ChatApiError('aborted', 'Generation stopped.');
    throw new ChatApiError('stream_interrupted', 'The response was cut off before it finished.');
  } finally {
    reader.cancel?.().catch(() => {});
  }
}

/** Reads provider/model info so the UI can show what is answering. */
export async function fetchMeta() {
  try {
    const response = await fetch('/api/meta');
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
