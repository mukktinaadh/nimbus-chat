/**
 * One error type for the whole backend, one code vocabulary, one place that
 * decides what a user is allowed to read. Provider internals (raw upstream
 * bodies, stack traces, keys) never leave the server.
 */

export const ErrorCodes = Object.freeze({
  BAD_REQUEST: 'bad_request',
  MISSING_API_KEY: 'missing_api_key',
  INVALID_API_KEY: 'invalid_api_key',
  RATE_LIMITED: 'rate_limited',
  MODEL_NOT_FOUND: 'model_not_found',
  PROVIDER_UNAVAILABLE: 'provider_unavailable',
  NETWORK_ERROR: 'network_error',
  STREAM_INTERRUPTED: 'stream_interrupted',
  ABORTED: 'aborted',
  UNKNOWN: 'unknown',
});

/** User-facing copy for every code. Nothing else may be shown to the client. */
const MESSAGES = {
  [ErrorCodes.BAD_REQUEST]: 'That request could not be processed. Check the message and try again.',
  [ErrorCodes.MISSING_API_KEY]:
    'The server has no API key for the selected provider. Add one to .env and restart the server.',
  [ErrorCodes.INVALID_API_KEY]: 'The provider rejected the API key. Check the key in .env.',
  [ErrorCodes.RATE_LIMITED]: 'The AI service is temporarily rate-limited. Please try again shortly.',
  [ErrorCodes.MODEL_NOT_FOUND]: 'The configured model is unavailable. Check the model name in .env.',
  [ErrorCodes.PROVIDER_UNAVAILABLE]: 'The AI service is not responding right now. Please try again.',
  [ErrorCodes.NETWORK_ERROR]: 'Could not reach the AI service. Check the connection and try again.',
  [ErrorCodes.STREAM_INTERRUPTED]: 'The response was cut off before it finished. Please try again.',
  [ErrorCodes.ABORTED]: 'Generation stopped.',
  [ErrorCodes.UNKNOWN]: 'Something went wrong while generating the response.',
};

const STATUSES = {
  [ErrorCodes.BAD_REQUEST]: 400,
  [ErrorCodes.MISSING_API_KEY]: 503,
  [ErrorCodes.INVALID_API_KEY]: 502,
  [ErrorCodes.RATE_LIMITED]: 429,
  [ErrorCodes.MODEL_NOT_FOUND]: 502,
  [ErrorCodes.PROVIDER_UNAVAILABLE]: 502,
  [ErrorCodes.NETWORK_ERROR]: 502,
  [ErrorCodes.STREAM_INTERRUPTED]: 502,
  [ErrorCodes.ABORTED]: 499,
  [ErrorCodes.UNKNOWN]: 500,
};

export class AppError extends Error {
  /**
   * @param {string} code one of ErrorCodes
   * @param {object} [options]
   * @param {string} [options.message] developer-facing detail (server logs only)
   * @param {number} [options.status] HTTP status for JSON responses
   * @param {Error}  [options.cause]
   */
  constructor(code, { message, status, cause } = {}) {
    super(message || MESSAGES[code] || MESSAGES[ErrorCodes.UNKNOWN]);
    this.name = 'AppError';
    this.code = code;
    this.status = status || STATUSES[code] || 500;
  }
}

/** Maps any thrown value to `{ status, code, message }` safe to send to a client. */
export function describeError(error) {
  const code = error instanceof AppError ? error.code : ErrorCodes.UNKNOWN;
  return {
    status: error instanceof AppError ? error.status : 500,
    code,
    message: MESSAGES[code] || MESSAGES[ErrorCodes.UNKNOWN],
  };
}

/** True when the caller cancelled the request (client navigated away / stopped). */
export function isAbortError(error) {
  return (
    error?.name === 'AbortError' ||
    error?.code === 'ABORT_ERR' ||
    (error instanceof AppError && error.code === ErrorCodes.ABORTED)
  );
}
