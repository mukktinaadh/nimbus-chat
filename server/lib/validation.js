import { AppError, ErrorCodes } from './errors.js';

const ALLOWED_ROLES = new Set(['user', 'assistant']);

/**
 * Validates and normalises incoming chat messages.
 * Returns `[{ role, content }]` with trimmed content, or throws AppError.
 *
 * Guards implemented: shape, roles, empty bodies, per-message length,
 * total context length, message count, and a trailing user turn.
 */
export function validateChatRequest(body, limits) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(ErrorCodes.BAD_REQUEST, { message: 'Body must be a JSON object.' });
  }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AppError(ErrorCodes.BAD_REQUEST, { message: '`messages` must be a non-empty array.' });
  }
  if (messages.length > limits.maxMessages) {
    throw new AppError(ErrorCodes.BAD_REQUEST, {
      message: `Conversation has ${messages.length} messages, limit is ${limits.maxMessages}.`,
    });
  }

  const normalized = messages.map((message, index) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw new AppError(ErrorCodes.BAD_REQUEST, { message: `messages[${index}] must be an object.` });
    }
    const role = typeof message.role === 'string' ? message.role.trim() : '';
    if (!ALLOWED_ROLES.has(role)) {
      throw new AppError(ErrorCodes.BAD_REQUEST, {
        message: `messages[${index}].role must be "user" or "assistant".`,
      });
    }
    if (typeof message.content !== 'string') {
      throw new AppError(ErrorCodes.BAD_REQUEST, {
        message: `messages[${index}].content must be a string.`,
      });
    }
    const content = message.content.trim();
    if (!content) {
      throw new AppError(ErrorCodes.BAD_REQUEST, { message: `messages[${index}] is empty.` });
    }
    if (content.length > limits.maxMessageChars) {
      throw new AppError(ErrorCodes.BAD_REQUEST, {
        message: `messages[${index}] is longer than ${limits.maxMessageChars} characters.`,
      });
    }
    return { role, content };
  });

  const totalChars = normalized.reduce((sum, message) => sum + message.content.length, 0);
  if (totalChars > limits.maxContextChars) {
    throw new AppError(ErrorCodes.BAD_REQUEST, {
      message: `Conversation is ${totalChars} characters, limit is ${limits.maxContextChars}.`,
    });
  }

  if (normalized[normalized.length - 1].role !== 'user') {
    throw new AppError(ErrorCodes.BAD_REQUEST, {
      message: 'The last message in `messages` must have role "user".',
    });
  }

  return normalized;
}
