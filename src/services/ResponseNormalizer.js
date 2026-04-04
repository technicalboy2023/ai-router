/**
 * ResponseNormalizer.js
 * =====================
 * Normalizes all provider responses to OpenAI chat.completion format.
 * Handles both full responses and streaming chunks.
 */

import { newCompletionId } from '../utils/idGenerator.js';

/**
 * Normalize a non-streaming provider result into OpenAI chat.completion format.
 * @param {object} result - { content, tokens, rawResponse, fromCache }
 * @param {string} model
 * @param {string} requestId
 * @returns {object} OpenAI-format response
 */
export function normalizeResponse(result, model, requestId) {
  const { content = '', tokens = 0, rawResponse = null } = result;

  // If rawResponse already has choices (OpenRouter passthrough), use it
  if (rawResponse?.choices && rawResponse?.id) {
    // Already OpenAI format — just ensure request_id header
    return rawResponse;
  }

  return {
    id: newCompletionId(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: tokens,
      total_tokens: tokens,
    },
  };
}

/**
 * Normalize a streaming chunk (already in SSE text format).
 * This is mostly a passthrough since providers convert to SSE internally.
 * @param {string} sseText - Raw SSE line
 * @param {string} model
 * @returns {string} Normalized SSE line
 */
export function normalizeStreamChunk(sseText, model) {
  // SSE chunks from providers are already normalized to OpenAI format
  return sseText;
}

/**
 * Build a full OpenAI-format response with tool calls.
 * @param {object} result
 * @param {string} model
 * @returns {object}
 */
export function normalizeToolCallResponse(result, model) {
  const { content = '', tokens = 0, rawResponse = null } = result;

  // If provider returned tool_calls in rawResponse, preserve them
  const toolCalls = rawResponse?.choices?.[0]?.message?.tool_calls || null;
  const message = { role: 'assistant', content: content || null };
  if (toolCalls) message.tool_calls = toolCalls;

  return {
    id: newCompletionId(),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: toolCalls ? 'tool_calls' : 'stop',
    }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: tokens,
      total_tokens: tokens,
    },
  };
}

export default { normalizeResponse, normalizeStreamChunk, normalizeToolCallResponse };
