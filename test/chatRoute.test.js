import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config.js';

const realFetch = globalThis.fetch;

const config = loadConfig({
  LLM_PROVIDER: 'nvidia',
  NVIDIA_API_KEY: 'test-key',
  NVIDIA_MODEL: 'meta/llama-3.1-8b-instruct',
  UPSTREAM_TIMEOUT_MS: '5000',
});

/** Boots the app on an ephemeral port and hands the caller the base URL. */
async function withServer(run, appConfig = config) {
  const server = createApp(appConfig).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/** Replaces the upstream `fetch` so no real network call is made. */
function stubUpstream(implementation) {
  globalThis.fetch = implementation;
}
function restoreUpstream() {
  globalThis.fetch = realFetch;
}

function sseResponse(...parts) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) controller.enqueue(encoder.encode(part));
        controller.close();
      },
    }),
    { status: 200 },
  );
}

const deltaEvent = (text) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

function readEvents(body) {
  return body
    .split('\n\n')
    .filter((block) => block.trim() && !block.startsWith(':'))
    .map((block) => {
      const event = block.match(/^event: (.+)$/m)?.[1] ?? 'message';
      const data = block.match(/^data: (.+)$/m)?.[1];
      return { event, data: data ? JSON.parse(data) : undefined };
    });
}

test('POST /api/chat streams deltas then done, with the system prompt prepended', async () => {
  let upstreamBody;
  stubUpstream(async (url, options) => {
    upstreamBody = JSON.parse(options.body);
    return sseResponse(deltaEvent('Hel'), deltaEvent('lo'), 'data: [DONE]\n\n');
  });

  try {
    await withServer(async (base) => {
      const response = await realFetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      });

      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /text\/event-stream/);

      const events = readEvents(await response.text());
      assert.deepEqual(
        events.filter((e) => e.event === 'delta').map((e) => e.data.delta),
        ['Hel', 'lo'],
      );
      const done = events.find((e) => e.event === 'done');
      assert.equal(done.data.model, 'meta/llama-3.1-8b-instruct');
      assert.equal(typeof done.data.latencyMs, 'number');
    });
  } finally {
    restoreUpstream();
  }

  assert.equal(upstreamBody.messages[0].role, 'system');
  assert.match(upstreamBody.messages[0].content, /helpful general-purpose AI assistant/);
  assert.equal(upstreamBody.messages[1].content, 'Hi');
  assert.equal(upstreamBody.stream, true);
});

test('conversation history is forwarded in order', async () => {
  let upstreamBody;
  stubUpstream(async (url, options) => {
    upstreamBody = JSON.parse(options.body);
    return sseResponse('data: [DONE]\n\n');
  });

  try {
    await withServer(async (base) => {
      const response = await realFetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'user', content: 'What is React?' },
            { role: 'assistant', content: 'A UI library.' },
            { role: 'user', content: 'How does state work?' },
          ],
        }),
      });
      await response.text();
    });
  } finally {
    restoreUpstream();
  }

  assert.deepEqual(
    upstreamBody.messages.map((m) => m.content),
    [
      'You are a helpful general-purpose AI assistant. Answer clearly, accurately, and concisely. If you are uncertain, say so.',
      'What is React?',
      'A UI library.',
      'How does state work?',
    ],
  );
});

test('empty messages are rejected with 400 before any provider call', async () => {
  let upstreamCalled = false;
  stubUpstream(async () => {
    upstreamCalled = true;
    return sseResponse();
  });

  try {
    await withServer(async (base) => {
      const response = await realFetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      });
      assert.equal(response.status, 400);
      const payload = await response.json();
      assert.equal(payload.error.code, 'bad_request');
      assert.equal(typeof payload.error.message, 'string');
    });
  } finally {
    restoreUpstream();
  }

  assert.equal(upstreamCalled, false);
});

test('a trailing assistant message is rejected', async () => {
  await withServer(async (base) => {
    const response = await realFetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello' },
        ],
      }),
    });
    assert.equal(response.status, 400);
  });
});

test('a missing API key reaches the client as a friendly error event, not a crash', async () => {
  await withServer(
    async (base) => {
      const response = await realFetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      });
      assert.equal(response.status, 200);
      const events = readEvents(await response.text());
      const error = events.find((e) => e.event === 'error');
      assert.equal(error.data.code, 'missing_api_key');
      assert.match(error.data.message, /API key/i);
      assert.equal(JSON.stringify(events).includes('NVIDIA_API_KEY'), false);
    },
    loadConfig({ LLM_PROVIDER: 'nvidia', UPSTREAM_TIMEOUT_MS: '5000' }),
  );
});

test('an upstream rate limit becomes a rate_limited error event', async () => {
  stubUpstream(async () => new Response('slow down', { status: 429 }));
  try {
    await withServer(async (base) => {
      const response = await realFetch(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      });
      const events = readEvents(await response.text());
      const error = events.find((e) => e.event === 'error');
      assert.equal(error.data.code, 'rate_limited');
      assert.match(error.data.message, /rate-limited/i);
      assert.equal(/slow down/.test(JSON.stringify(events)), false, 'upstream body must not leak');
    });
  } finally {
    restoreUpstream();
  }
});

test('concurrent generations from one client are capped with 429', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });

  stubUpstream(async () => {
    await gate;
    return sseResponse(deltaEvent('done'), 'data: [DONE]\n\n');
  });

  try {
    await withServer(async (base) => {
      const post = () =>
        realFetch(`${base}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
        });

      const first = post();
      const second = post();
      // Let both requests reach the router before the third arrives.
      await new Promise((resolve) => setTimeout(resolve, 150));

      const third = await post();
      assert.equal(third.status, 429);
      assert.equal((await third.json()).error.code, 'rate_limited');

      release();
      await Promise.all([(await first).text(), (await second).text()]);
    });
  } finally {
    restoreUpstream();
  }
});

test('oversized request bodies are rejected with 413', async () => {
  await withServer(async (base) => {
    const response = await realFetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'x'.repeat(400000) }] }),
    });
    assert.equal(response.status, 413);
  });
});

test('malformed JSON is rejected with 400', async () => {
  await withServer(async (base) => {
    const response = await realFetch(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"messages": [{',
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, 'bad_request');
  });
});

test('GET /api/meta exposes provider and model but no endpoint or key', async () => {
  await withServer(async (base) => {
    const response = await realFetch(`${base}/api/meta`);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.provider, 'nvidia');
    assert.equal(payload.model, 'meta/llama-3.1-8b-instruct');
    assert.equal(payload.limits.maxMessageChars, 8000);
    assert.equal(JSON.stringify(payload).includes('integrate.api.nvidia.com'), false);
    assert.equal(JSON.stringify(payload).includes('test-key'), false);
  });
});

test('unknown API routes return JSON, not HTML', async () => {
  await withServer(async (base) => {
    const response = await realFetch(`${base}/api/nope`);
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, 'bad_request');
  });
});
