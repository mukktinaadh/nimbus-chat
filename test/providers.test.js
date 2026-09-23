import test from 'node:test';
import assert from 'node:assert/strict';
import { createProvider } from '../server/providers/index.js';
import { ErrorCodes } from '../server/lib/errors.js';
import { loadConfig } from '../server/config.js';

const nvidiaConfig = loadConfig({
  LLM_PROVIDER: 'nvidia',
  NVIDIA_API_KEY: 'test-key',
  NVIDIA_MODEL: 'meta/llama-3.1-8b-instruct',
  UPSTREAM_TIMEOUT_MS: '2000',
});

const ollamaConfig = loadConfig({ LLM_PROVIDER: 'ollama', OLLAMA_MODEL: 'llama3.2:latest' });

const messages = [{ role: 'user', content: 'hi' }];

const sseChunk = (text) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

/** Runs a provider stream with `fetch` replaced for the duration of the test. */
async function withFetch(implementation, run) {
  const original = globalThis.fetch;
  globalThis.fetch = implementation;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

async function drain(provider) {
  const chunks = [];
  for await (const delta of provider.streamChat(messages)) chunks.push(delta);
  return chunks.join('');
}

test('nvidia provider fails with missing_api_key when no key is configured', async () => {
  const provider = createProvider(loadConfig({ LLM_PROVIDER: 'nvidia' }), 'nvidia');
  await assert.rejects(drain(provider), { code: ErrorCodes.MISSING_API_KEY });
});

test('nvidia provider sends the key in an Authorization header, never in the body', async () => {
  let captured;
  await withFetch(
    async (url, options) => {
      captured = { url, options };
      return new Response(sseChunk('ok'), { status: 200 });
    },
    async () => {
      const provider = createProvider(nvidiaConfig);
      assert.equal(await drain(provider), 'ok');
    },
  );

  assert.equal(captured.url, 'https://integrate.api.nvidia.com/v1/chat/completions');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(captured.options.body);
  assert.equal(JSON.stringify(body).includes('test-key'), false);
  assert.equal(body.model, 'meta/llama-3.1-8b-instruct');
  assert.equal(body.stream, true);
  assert.deepEqual(body.messages, messages);
});

test('401 and 403 map to invalid_api_key', async () => {
  for (const status of [401, 403]) {
    await withFetch(
      async () => new Response('nope', { status }),
      async () => {
        await assert.rejects(drain(createProvider(nvidiaConfig)), {
          code: ErrorCodes.INVALID_API_KEY,
        });
      },
    );
  }
});

test('429 maps to rate_limited', async () => {
  await withFetch(
    async () => new Response('slow down', { status: 429 }),
    async () => {
      await assert.rejects(drain(createProvider(nvidiaConfig)), { code: ErrorCodes.RATE_LIMITED });
    },
  );
});

test('404 maps to model_not_found and 500 maps to provider_unavailable', async () => {
  await withFetch(
    async () => new Response('no such model', { status: 404 }),
    async () => {
      await assert.rejects(drain(createProvider(nvidiaConfig)), { code: ErrorCodes.MODEL_NOT_FOUND });
    },
  );
  await withFetch(
    async () => new Response('boom', { status: 500 }),
    async () => {
      await assert.rejects(drain(createProvider(nvidiaConfig)), {
        code: ErrorCodes.PROVIDER_UNAVAILABLE,
      });
    },
  );
});

test('a refused connection maps to network_error', async () => {
  await withFetch(
    async () => {
      throw new TypeError('fetch failed');
    },
    async () => {
      await assert.rejects(drain(createProvider(ollamaConfig)), { code: ErrorCodes.NETWORK_ERROR });
    },
  );
});

test('a stream that breaks mid-flight maps to stream_interrupted and keeps what arrived', async () => {
  // First pull delivers a real chunk, second pull kills the connection, which
  // is what a mid-response socket failure looks like.
  let pulls = 0;
  const encoder = new TextEncoder();
  await withFetch(
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            if (pulls === 0) {
              pulls += 1;
              controller.enqueue(encoder.encode(sseChunk('partial')));
            } else {
              controller.error(new Error('socket closed'));
            }
          },
        }),
        { status: 200 },
      ),
    async () => {
      const provider = createProvider(nvidiaConfig);
      const seen = [];
      await assert.rejects(
        (async () => {
          for await (const delta of provider.streamChat(messages)) seen.push(delta);
        })(),
        { code: ErrorCodes.STREAM_INTERRUPTED },
      );
      assert.deepEqual(seen, ['partial']);
    },
  );
});

test('an in-stream upstream error object surfaces as provider_unavailable', async () => {
  await withFetch(
    async () =>
      new Response(`data: ${JSON.stringify({ error: { message: 'quota exhausted' } })}\n\n`, {
        status: 200,
      }),
    async () => {
      await assert.rejects(drain(createProvider(nvidiaConfig)), {
        code: ErrorCodes.PROVIDER_UNAVAILABLE,
      });
    },
  );
});

test('a pre-aborted signal stops before any network call', async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await withFetch(
    async () => {
      called = true;
      return new Response('', { status: 200 });
    },
    async () => {
      const provider = createProvider(nvidiaConfig);
      await assert.rejects(
        (async () => {
          for await (const _ of provider.streamChat(messages, { signal: controller.signal })) {
            // no-op
          }
        })(),
        { code: ErrorCodes.ABORTED },
      );
    },
  );
  assert.equal(called, false);
});
