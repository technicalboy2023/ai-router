/**
 * messages.js
 * ===========
 * POST /v1/messages endpoint.
 * Anthropic Messages API compatible endpoint.
 *
 * Accepts requests in Anthropic format, translates to OpenAI format internally,
 * routes through the existing FallbackEngine, then translates the response
 * back to Anthropic format.
 *
 * Supports both streaming (Anthropic SSE events) and non-streaming responses.
 *
 * Usage with Claude Code:
 *   ANTHROPIC_BASE_URL=https://your-router.com
 *   ANTHROPIC_API_KEY=your-router-auth-token
 */

import { Router } from 'express';
import { ErrorTypes } from '../../services/ErrorNormalizer.js';
import {
  anthropicToOpenAI,
  openAIToAnthropic,
  AnthropicStreamState,
} from '../../services/AnthropicTranslator.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { deps, config, logger } = res.locals;
    const { fallbackEngine } = deps;
    const requestId = req.requestId;

    const body = req.body;

    // Validate required Anthropic fields
    if (!body.model) {
      return res.status(400).json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: "'model' is a required field.",
        },
      });
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return res.status(400).json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: "'messages' is a required field and must be a non-empty array.",
        },
      });
    }

    if (body.max_tokens == null) {
      return res.status(400).json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: "'max_tokens' is a required field.",
        },
      });
    }

    // Convert Anthropic request → OpenAI format
    const { messages, model, stream, extraParams } = anthropicToOpenAI(body);

    // Cache bypass when temperature or seed parameters are provided
    const useCache = config.cache?.enabled && extraParams.temperature === undefined && extraParams.seed === undefined;

    // Extract Anthropic-specific headers for logging
    const anthropicVersion = req.headers['anthropic-version'] || null;
    const anthropicBeta = req.headers['anthropic-beta'] || null;
    const sessionId = req.headers['x-claude-code-session-id'] || null;

    logger.info({
      requestId,
      model,
      stream,
      msg_count: messages.length,
      endpoint: '/v1/messages',
      ...(sessionId && { sessionId }),
      ...(anthropicVersion && { anthropicVersion }),
      ...(anthropicBeta && { anthropicBeta }),
    }, 'Incoming Anthropic messages request');

    // Attach AbortController for client disconnects
    const controller = new AbortController();
    const { signal } = controller;
    req.on('aborted', () => controller.abort());
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    // Execute via fallback engine
    const executePromise = fallbackEngine.execute(messages, model, {
      extraParams,
      stream,
      requestId,
      useCache,
      signal,
    });

    // ── Streaming (Anthropic SSE format) ──────────────────────────────────
    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Transfer-Encoding': 'chunked',
        'X-Request-ID': requestId,
      });

      const streamState = new AnthropicStreamState(body.model, requestId);

      try {
        const streamGenerator = await executePromise;

        // Emit message_start event (text block opens lazily on first content)
        res.write(streamState.emitMessageStart());

        for await (const chunk of streamGenerator) {
          // Convert each OpenAI SSE chunk → Anthropic SSE events
          const anthropicEvents = streamState.convertChunk(chunk);
          if (anthropicEvents) {
            res.write(anthropicEvents);
          }
        }

        // If stream ended without a finish_reason, emit closing events
        if (streamState.started) {
          res.write(streamState.emitEnd());
        }
      } catch (err) {
        logger.error({ requestId, error: err.message }, 'Anthropic streaming error');

        // If headers already sent, emit Anthropic error event
        const errorEvent = {
          type: 'error',
          error: {
            type: 'api_error',
            message: err.message || 'Internal server error',
          },
        };
        res.write(`event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`);
      }

      res.end();
      return;
    }

    // ── Non-Streaming ────────────────────────────────────────────────────
    const openAIResponse = await executePromise;

    // Convert OpenAI response → Anthropic format
    const anthropicResponse = openAIToAnthropic(openAIResponse, body.model);

    res.setHeader('X-Request-ID', requestId);
    res.json(anthropicResponse);

  } catch (err) {
    // Format error in Anthropic style
    const status = err.statusCode || err.status || 500;
    res.status(status).json({
      type: 'error',
      error: {
        type: mapErrorType(err.type || status),
        message: status === 500 ? 'Internal server error' : (err.message || 'An unexpected error occurred'),
      },
    });
  }
});

/**
 * Map error type/status to Anthropic error type strings.
 * @param {string|number} typeOrStatus
 * @returns {string}
 */
function mapErrorType(typeOrStatus) {
  if (typeOrStatus === 401 || typeOrStatus === 'auth_error') return 'authentication_error';
  if (typeOrStatus === 403) return 'permission_error';
  if (typeOrStatus === 404) return 'not_found_error';
  if (typeOrStatus === 429 || typeOrStatus === 'rate_limit') return 'rate_limit_error';
  if (typeOrStatus === 400 || typeOrStatus === 422 || typeOrStatus === 'validation_error') return 'invalid_request_error';
  if (typeOrStatus === 'exhausted') return 'overloaded_error';
  return 'api_error';
}

export default router;
