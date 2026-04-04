/**
 * chatCompletions.js
 * ==================
 * POST /v1/chat/completions endpoint.
 * Handles chat completions, streaming, and caching.
 */

import { Router } from 'express';
import { ErrorTypes } from '../../services/ErrorNormalizer.js';
import { normalizeStreamChunk } from '../../services/ResponseNormalizer.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { deps, config, logger } = res.locals;
    const { fallbackEngine } = deps;
    const requestId = req.requestId;

    const { messages, stream = false, model: bodyModel, ...extraParams } = req.body;
    let model = bodyModel;

    // Default model if none defined in request
    if (!model) {
      model = config.providers?.openrouter?.defaultModel || 'auto';
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(422).json({
        error: { message: "'messages' field is required and must be an array.", type: ErrorTypes.VALIDATION_ERROR }
      });
    }

    // Cache bypass when temperature or seed parameters are provided.
    const useCache = config.cache?.enabled && extraParams.temperature === undefined && extraParams.seed === undefined;

    logger.info({
      requestId,
      model,
      stream,
      msg_count: messages.length,
    }, 'Incoming chat completion request');

    // Attach AbortController for client disconnects
    const controller = new AbortController();
    const { signal } = controller;
    req.on('aborted', () => controller.abort());
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });

    // Execute via fallback engine
    const executePromise = fallbackEngine.execute(messages, model, { extraParams, stream, requestId, useCache, signal });

    // ── Streaming ───────────────────────────────────────────────────────────
    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Nginx compat
        'Transfer-Encoding': 'chunked',
        'X-Request-ID': requestId,
      });

      try {
        const streamGenerator = await executePromise;
        for await (const chunk of streamGenerator) {
          // Send raw SSE chunk
          res.write(normalizeStreamChunk(chunk, model));
        }
      } catch (err) {
        // Since headers are sent, emit an error chunk to close the stream gracefully
        logger.error({ requestId, error: err.message }, 'Streaming error');
        const errChunk = `data: ${JSON.stringify({
          error: { message: err.message, type: err.type || ErrorTypes.SERVER_ERROR }
        })}\n\n`;
        res.write(errChunk);
        res.write('data: [DONE]\n\n');
      }

      res.end();
      return;
    }

    // ── Non-Streaming ───────────────────────────────────────────────────────
    const data = await executePromise;
    res.setHeader('X-Request-ID', requestId);
    res.json(data);

  } catch (err) {
    next(err);
  }
});

export default router;
