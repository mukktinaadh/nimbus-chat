/**
 * Minimal Server-Sent Events helpers. The response is a stream of named
 * events the browser reads with `fetch` + `ReadableStream`:
 *
 *   event: delta   data: {"delta":"Hel"}
 *   event: delta   data: {"delta":"lo"}
 *   event: done    data: {"model":"..."}
 *   event: error   data: {"code":"rate_limited","message":"..."}
 */

const HEARTBEAT_MS = 15000;

export function openEventStream(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Stops reverse proxies from buffering the stream.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
}

export function sendEvent(res, event, data) {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Comment-only pings keep idle connections alive while a slow model is still
 * thinking. Returns a stop function.
 */
export function startHeartbeat(res) {
  const timer = setInterval(() => {
    if (res.writableEnded) return;
    res.write(': keep-alive\n\n');
  }, HEARTBEAT_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
