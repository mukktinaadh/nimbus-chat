import test from 'node:test';
import assert from 'node:assert/strict';
import { validateChatRequest } from '../server/lib/validation.js';
import { ErrorCodes } from '../server/lib/errors.js';

const limits = { maxMessageChars: 100, maxContextChars: 150, maxMessages: 5 };

test('accepts a valid conversation and trims content', () => {
  const messages = validateChatRequest(
    { messages: [{ role: 'user', content: '  hello  ' }] },
    limits,
  );
  assert.deepEqual(messages, [{ role: 'user', content: 'hello' }]);
});

test('accepts multi-turn history ending with a user message', () => {
  const messages = validateChatRequest(
    {
      messages: [
        { role: 'user', content: 'What is React?' },
        { role: 'assistant', content: 'A UI library.' },
        { role: 'user', content: 'How does state work?' },
      ],
    },
    limits,
  );
  assert.equal(messages.length, 3);
  assert.equal(messages[1].role, 'assistant');
});

test('rejects a missing or empty messages array', () => {
  for (const body of [{}, { messages: [] }, { messages: 'nope' }]) {
    assert.throws(() => validateChatRequest(body, limits), (error) => {
      assert.equal(error.code, ErrorCodes.BAD_REQUEST);
      return true;
    });
  }
});

test('rejects an unknown role', () => {
  assert.throws(
    () => validateChatRequest({ messages: [{ role: 'system', content: 'hi' }] }, limits),
    { code: ErrorCodes.BAD_REQUEST },
  );
});

test('rejects empty or whitespace-only content', () => {
  assert.throws(
    () => validateChatRequest({ messages: [{ role: 'user', content: '   ' }] }, limits),
    { code: ErrorCodes.BAD_REQUEST },
  );
});

test('rejects a message over the per-message limit', () => {
  assert.throws(
    () => validateChatRequest({ messages: [{ role: 'user', content: 'x'.repeat(101) }] }, limits),
    { code: ErrorCodes.BAD_REQUEST },
  );
});

test('rejects a conversation over the context limit', () => {
  const long = [
    { role: 'user', content: 'a'.repeat(90) },
    { role: 'assistant', content: 'b'.repeat(90) },
  ];
  assert.throws(() => validateChatRequest({ messages: long }, limits), {
    code: ErrorCodes.BAD_REQUEST,
  });
});

test('rejects more messages than the limit allows', () => {
  const many = Array.from({ length: 6 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: 'hi',
  }));
  assert.throws(() => validateChatRequest({ messages: many }, limits), {
    code: ErrorCodes.BAD_REQUEST,
  });
});

test('rejects a trailing assistant message', () => {
  assert.throws(
    () =>
      validateChatRequest(
        {
          messages: [
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello' },
          ],
        },
        limits,
      ),
    { code: ErrorCodes.BAD_REQUEST },
  );
});

test('drops unknown extra fields instead of forwarding them', () => {
  const messages = validateChatRequest(
    { messages: [{ role: 'user', content: 'hi', injected: 'nope' }], extra: true },
    limits,
  );
  assert.deepEqual(Object.keys(messages[0]), ['role', 'content']);
});
