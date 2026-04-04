/**
 * ErrorNormalizer.js
 * ==================
 * Unified error format across all providers.
 *
 * Output format:
 * {
 *   error: {
 *     message: "...",
 *     type: "rate_limit | timeout | provider_error | validation_error | auth_error | exhausted",
 *     code: 429,
 *     provider: "openrouter",
 *     request_id: "req_xxx"
 *   }
 * }
 */

/**
 * Error type constants.
 */
export const ErrorTypes = {
  RATE_LIMIT: 'rate_limit',
  TIMEOUT: 'timeout',
  PROVIDER_ERROR: 'provider_error',
  VALIDATION_ERROR: 'validation_error',
  AUTH_ERROR: 'auth_error',
  EXHAUSTED: 'exhausted',
  SERVER_ERROR: 'server_error',
};

/**
 * Normalize any error into the unified format.
 * @param {Error|object} err
 * @param {object} [context] - { requestId, provider, model }
 * @returns {{ error: object }}
 */
export function normalizeError(err, context = {}) {
  const { requestId = 'unknown', provider = null, model = null } = context;

  let type = err.type || ErrorTypes.SERVER_ERROR;
  let code = err.statusCode || err.status || 500;
  let message = err.message || 'An unexpected error occurred';

  // Auto-detect type from status code
  if (code === 429) type = ErrorTypes.RATE_LIMIT;
  else if (code === 401) type = ErrorTypes.AUTH_ERROR;
  else if (code === 403) type = ErrorTypes.AUTH_ERROR;
  else if (code === 422 || code === 400 || code === 404) type = ErrorTypes.VALIDATION_ERROR;
  else if (code === 408) type = ErrorTypes.TIMEOUT;
  else if (code === 503 && err.type === 'exhausted') type = ErrorTypes.EXHAUSTED;

  // Auto-detect from error name
  if (err.name === 'TimeoutError' || err.code === 'UND_ERR_CONNECT_TIMEOUT') {
    type = ErrorTypes.TIMEOUT;
    code = 408;
  }

  const errorObj = {
    error: {
      message,
      type,
      code,
      request_id: requestId,
    },
  };

  if (provider) errorObj.error.provider = provider;
  if (model) errorObj.error.model = model;

  return errorObj;
}

/**
 * Create an error response for SSE streaming.
 * @param {string} message
 * @param {string} model
 * @returns {string} SSE-formatted error chunk
 */
export function streamErrorChunk(message, model) {
  const chunk = {
    id: 'chatcmpl-error',
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: model || 'unknown',
    choices: [{
      index: 0,
      delta: { content: `Error: ${message}` },
      finish_reason: 'stop',
    }],
  };
  return `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`;
}

export default { normalizeError, streamErrorChunk, ErrorTypes };
