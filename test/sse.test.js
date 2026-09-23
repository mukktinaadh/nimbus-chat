import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSseStream, readChunkText, readDataBlock, SSE_DONE } from '../server/providers/openaiCompat.js';

function streamOf(...parts) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  });
}

async function collect(stream) {
  const out = [];
  for await (const payload of parseSseStream(stream)) out.push(payload);
  return out;
}

const chunk = (text) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;

test('parses one SSE chunk per event', async () => {
  const payloads = await collect(streamOf(chunk('Hello'), chunk(' there'), `data: ${SSE_DONE}\n\n`));
  assert.equal(payloads.length, 3);
  assert.equal(readChunkText(JSON.parse(payloads[0])).text, 'Hello');
  assert.equal(payloads[2], SSE_DONE);
});

test('reassembles events split across byte chunks', async () => {
  const payloads = await collect(streamOf('data: {"choices":[{"delta"', ':{"content":"half"}}]}\n\n'));
  assert.equal(payloads.length, 1);
  assert.equal(readChunkText(JSON.parse(payloads[0])).text, 'half');
});

test('handles one response chunk holding several events', async () => {
  const payloads = await collect(streamOf(chunk('a') + chunk('b') + chunk('c')));
  assert.deepEqual(
    payloads.map((payload) => readChunkText(JSON.parse(payload)).text),
    ['a', 'b', 'c'],
  );
});

test('ignores heartbeat comment lines', async () => {
  const payloads = await collect(streamOf(': keep-alive\n\n', chunk('hi')));
  assert.equal(payloads.length, 1);
});

test('flushes a final event without a trailing blank line', async () => {
  const payloads = await collect(streamOf(`data: ${JSON.stringify({ choices: [{ delta: { content: 'tail' } }] })}`));
  assert.equal(payloads.length, 1);
  assert.equal(readChunkText(JSON.parse(payloads[0])).text, 'tail');
});

test('readDataBlock joins multi-line data and returns null for comments', () => {
  assert.equal(readDataBlock(': ping'), null);
  assert.equal(readDataBlock('event: delta\ndata: {"a":1}'), '{"a":1}');
});

test('readChunkText reports finish reasons and tolerates odd shapes', () => {
  assert.equal(readChunkText({ choices: [{ delta: { content: 'x' }, finish_reason: 'stop' }] }).finished, true);
  assert.equal(readChunkText({ choices: [{ delta: {} }] }).text, '');
  assert.equal(readChunkText({}).text, '');
  assert.equal(readChunkText(undefined).text, '');
});
