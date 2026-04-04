/**
 * FallbackEngine.js
 * =================
 * Multi-layer fallback tree for cross-provider and cross-model retries.
 * Providers themselves handle same-key and subsequent keys for a single model/provider combo.
 * If a provider entirely fails (exhaustion), this engine attempts next provider/model in the hierarchy.
 */

import { RoutingEngine } from './RoutingEngine.js';
import { normalizeError, ErrorTypes } from './ErrorNormalizer.js';
import { normalizeResponse, normalizeToolCallResponse } from './ResponseNormalizer.js';
import { newRequestId } from '../utils/idGenerator.js';

export class FallbackEngine {
  /**
   * @param {object} config - The fallback configuration section
   * @param {import('../providers/ProviderRegistry.js').ProviderRegistry} providerRegistry
   * @param {RoutingEngine} routingEngine
   * @param {import('../utils/logger.js').Logger} logger
   */
  constructor(config, providerRegistry, routingEngine, logger) {
    this.config = config || {};
    this.providerRegistry = providerRegistry;
    this.routingEngine = routingEngine;
    this.logger = logger;
  }

  /**
   * Execute chat completion with cross-provider fallback handling.
   * @param {object[]} messages
   * @param {string} requestedModel
   * @param {object} options
   * @returns {Promise<object>}
   */
  async execute(messages, requestedModel, options = {}) {
    const { stream = false, requestId = newRequestId(), extraParams = {}, useCache = true, signal } = options;

    // Build list of provider+model targets
    const targets = this.routingEngine.getProviderChain(requestedModel);

    // If no targets, fallback to priority providers
    if (targets.length === 0) {
      throw Object.assign(
        new Error('No available providers found for routing.'),
        { statusCode: 503, type: ErrorTypes.PROVIDER_ERROR }
      );
    }

    let lastError = null;
    let fallbackValidationError = null;

    for (let i = 0; i < targets.length; i++) {
      const { provider, model } = targets[i];
      this.logger.info({ requestId, target_provider: provider.id, target_model: model, attempt: i + 1 }, 'FallbackEngine: trying target');

      try {
        if (stream) {
          // Streaming handled differently: we return the async generator.
          // Wait, if the provider fails before yielding the first chunk, we could catch and fallback.
          // Native streams in BaseProvider use generators, so we can't easily fallback inside a yielding generator unless we buffer.
          // So streaming fallback is limited. For now, try returning the stream.
          // The provider internally has multi-layer retry for its keys.
          return provider.stream(messages, model, { extraParams, requestId, useCache, signal });
        }

        const res = await provider.call(messages, model, { extraParams, requestId, useCache, signal });
        
        // Normalize response to OpenAI format based on whether it has tool calls
        const toolCalls = res?.rawResponse?.choices?.[0]?.message?.tool_calls;
        let finalResponse;
        if (toolCalls) {
          finalResponse = normalizeToolCallResponse(res, requestedModel);
        } else {
          finalResponse = normalizeResponse(res, requestedModel, requestId);
        }

        // Decorate with target info
        finalResponse.model = requestedModel; // Keep original model name for the client

        return finalResponse;

      } catch (err) {
        lastError = normalizeError(err, { requestId, provider: provider.id, model });
        
        // Track validation errors specifically, but continue looping so other providers get a chance
        if (lastError.error.type === ErrorTypes.VALIDATION_ERROR) {
          fallbackValidationError = lastError;
        }

        this.logger.warn({
          requestId,
          failed_provider: provider.id,
          failed_model: model,
          error: lastError.error.message,
          error_type: lastError.error.type
        }, 'FallbackEngine: target failed, checking for fallback');

        // Continue to next target in loop, regardless of whether it was a validation error, 
        // rate limit, or exhaustion error, so multi-provider resiliency works fully.

        // Continue to next target in loop
      }
    }

    // If we exhaust all targets
    this.logger.error({ requestId, requestedModel, targets_tried: targets.length }, 'FallbackEngine: all fallbacks exhausted');
    
    // If ANY provider failed due to a Validation Error (Client Error, 400/404),
    // and all fallbacks have failed, bubbling up the validation error is significantly more
    // informative than bubbling up generic "exhausted".
    if (fallbackValidationError) {
      throw Object.assign(
        new Error(fallbackValidationError.error.message),
        { statusCode: fallbackValidationError.error.code, type: ErrorTypes.VALIDATION_ERROR }
      );
    }

    throw Object.assign(
      new Error(lastError ? lastError.error.message : 'All fallback targets exhausted.'),
      { statusCode: lastError ? lastError.error.code : 503, type: ErrorTypes.EXHAUSTED }
    );
  }
}

export default FallbackEngine;
