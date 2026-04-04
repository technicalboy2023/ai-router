/**
 * idGenerator.js
 * ==============
 * Request ID and Completion ID generators.
 * Port of router_core.py new_request_id / new_completion_id.
 */

import { randomUUID } from 'node:crypto';

/**
 * Generate a unique request ID.
 * Format: req_<12 hex chars>
 * @returns {string}
 */
export function newRequestId() {
  return 'req_' + randomUUID().replace(/-/g, '').slice(0, 12);
}

/**
 * Generate a unique chat completion ID.
 * Format: chatcmpl-<12 hex chars>
 * @returns {string}
 */
export function newCompletionId() {
  return 'chatcmpl-' + randomUUID().replace(/-/g, '').slice(0, 12);
}

/**
 * Generate a unique response ID (for /v1/responses).
 * Format: resp_<12 hex chars>
 * @returns {string}
 */
export function newResponseId() {
  return 'resp_' + randomUUID().replace(/-/g, '').slice(0, 12);
}

export default { newRequestId, newCompletionId, newResponseId };
