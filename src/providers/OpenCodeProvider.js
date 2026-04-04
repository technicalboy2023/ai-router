/**
 * OpenCodeProvider.js
 * ===================
 * OpenCode Zen API provider.
 * 
 * OpenCode Zen is an AI gateway service (https://opencode.ai/zen/v1)
 * that provides access to curated, benchmarked coding models.
 * It uses an OpenAI-compatible API format with Bearer token auth.
 *
 * Features:
 *  • OpenAI-compatible /chat/completions endpoint
 *  • Bearer token authentication
 *  • Streaming SSE support
 *  • Multi-key rotation with health-score routing
 *  • Retry with exponential backoff
 */

import { BaseProvider } from './BaseProvider.js';
import { httpFetch } from '../utils/httpClient.js';
import { backoffSleep } from '../utils/backoff.js';
import { estimateTokens } from '../utils/tokenEstimator.js';
import { newCompletionId, newRequestId } from '../utils/idGenerator.js';

/** HTTP status codes that freeze the key */
const COOLING_STATUSES = new Set([429, 402, 403]);

/** HTTP status codes worth retrying with the same key */
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

/** Maximum retries per key */
const MAX_RETRIES = 2;

export class OpenCodeProvider extends BaseProvider {
  constructor(config, deps = {}) {
    super('opencode', config, deps);
    this.displayName = 'OpenCode Zen';
  }

  get baseUrl() {
    return this.config.baseUrl || 'https://opencode.ai/zen/v1';
  }

  get chatEndpoint() {
    return `${this.baseUrl}/chat/completions`;
  }

  get modelsEndpoint() {
    return `${this.baseUrl}/models`;
  }

  get defaultModel() {
    return this.config.defaultModel || 'opencode/auto';
  }

  // ── Headers ─────────────────────────────────────────────────────────────

  buildHeaders(key) {
    return {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'X-Title': 'AI-Router',
    };
  }

  // ── Token extraction ────────────────────────────────────────────────────

  static extractTokens(data) {
    try {
      return data?.usage?.total_tokens || 0;
    } catch { return 0; }
  }

  static safeContent(data) {
    try {
      return data?.choices?.[0]?.message?.content || '';
    } catch { return ''; }
  }

  // ── Non-streaming call ──────────────────────────────────────────────────

  async call(messages, model, options = {}) {
    const {
      extraParams = {},
      requestId = newRequestId(),
      useCache = true,
      signal,
    } = options;

    // Cache check
    if (useCache && this.cache) {
      const cached = this.cache.get(messages, model);
      if (cached !== null) {
        this.logger.info({ requestId, model }, 'Cache hit (opencode)');
        return { content: cached, tokens: 0, rawResponse: null, fromCache: true };
      }
    }

    const payload = this.buildPayload(messages, model, false, extraParams);
    const keys = this.registry.rankedKeys();

    if (keys.length === 0) {
      this.logger.error({ requestId }, 'No API keys configured for OpenCode');
      throw Object.assign(new Error('No OpenCode API keys configured.'), { statusCode: 503, type: 'provider_error' });
    }

    for (const key of keys) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const t0 = performance.now();
        try {
          const response = await httpFetch(this.chatEndpoint, {
            method: 'POST',
            headers: this.buildHeaders(key),
            body: JSON.stringify(payload),
            signal,
          });

          const latency = (performance.now() - t0) / 1000;

          // ── Success ─────────────────────────────────────────────
          if (response.status === 200) {
            let data, text, tokens;
            try {
              data = await response.json();
              text = OpenCodeProvider.safeContent(data);
              tokens = OpenCodeProvider.extractTokens(data);
            } catch (parseErr) {
              this.logger.warn({ requestId, error: parseErr.message }, 'JSON parse error on success');
              text = '';
              tokens = 0;
              data = null;
            }

            this.registry.onSuccess(key, latency, tokens);

            this.logger.info({
              requestId, model,
              latency_s: parseFloat(latency.toFixed(3)),
              tokens,
              key_suffix: '…' + key.slice(-6),
              attempt: attempt + 1,
            }, 'OpenCode success');

            if (useCache && text && this.cache) {
              this.cache.set(messages, model, text);
            }

            return { content: text, tokens, rawResponse: data, fromCache: false };
          }

          // ── Rate-limited / forbidden → cool key, next ───────────
          if (COOLING_STATUSES.has(response.status)) {
            this.logger.warn({
              requestId, status: response.status,
              key_suffix: '…' + key.slice(-6),
            }, 'OpenCode key cooling');
            this.registry.onError(key, true, this.logger);
            break; // next key
          }

          // ── Transient 5xx → retry same key ──────────────────────
          if (TRANSIENT_STATUSES.has(response.status)) {
            this.logger.warn({
              requestId, status: response.status,
              attempt: attempt + 1,
              key_suffix: '…' + key.slice(-6),
            }, 'Transient server error, retrying');
            this.registry.onError(key, false, this.logger);
            await backoffSleep(attempt);
            continue;
          }

          // ── Unexpected status ───────────────────────────────────
          const bodyText = await response.text().catch(() => '');
          this.logger.error({
            requestId, status: response.status,
            body: bodyText.slice(0, 500),
            key_suffix: '…' + key.slice(-6),
          }, 'Unexpected HTTP status');
          this.registry.onError(key, false, this.logger);
          await backoffSleep(attempt);

        } catch (err) {
          const latency = (performance.now() - t0) / 1000;

          if (err.name === 'TimeoutError' || err.code === 'UND_ERR_CONNECT_TIMEOUT') {
            this.logger.warn({
              requestId, latency_s: parseFloat(latency.toFixed(3)),
              attempt: attempt + 1,
              key_suffix: '…' + key.slice(-6),
              error: err.message,
            }, 'Request timeout');
          } else {
            this.logger.error({
              requestId, error: err.message,
              key_suffix: '…' + key.slice(-6),
            }, 'HTTP request error');
          }
          this.registry.onError(key, false, this.logger);
          await backoffSleep(attempt);
        }
      }
    }

    this.logger.error({ requestId, model, keys_tried: keys.length }, 'All OpenCode keys exhausted');
    throw Object.assign(
      new Error('All OpenCode API keys exhausted. Please try again later.'),
      { statusCode: 503, type: 'exhausted' }
    );
  }

  // ── Streaming call ──────────────────────────────────────────────────────

  async *stream(messages, model, options = {}) {
    const {
      extraParams = {},
      requestId = newRequestId(),
      signal,
    } = options;

    const payload = this.buildPayload(messages, model, true, extraParams);
    const keys = this.registry.rankedKeys();

    for (const key of keys) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const t0 = performance.now();
        try {
          const response = await httpFetch(this.chatEndpoint, {
            method: 'POST',
            headers: this.buildHeaders(key),
            body: JSON.stringify(payload),
            signal,
          });

          if (COOLING_STATUSES.has(response.status)) {
            this.registry.onError(key, true, this.logger);
            break; // next key
          }

          if (TRANSIENT_STATUSES.has(response.status)) {
            this.registry.onError(key, false, this.logger);
            await backoffSleep(attempt);
            continue;
          }

          if (response.status !== 200) {
            this.registry.onError(key, false, this.logger);
            await backoffSleep(attempt);
            continue;
          }

          // ── Stream body ─────────────────────────────────────────
          let accumulatedTokens = 0;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line) continue;

                if (line.startsWith('data:')) {
                  const dataStr = line.slice(5).trim();
                  if (dataStr === '[DONE]') {
                    yield 'data: [DONE]\n\n';
                    break;
                  }

                  // Count tokens opportunistically
                  try {
                    const chunkData = JSON.parse(dataStr);
                    const delta = chunkData?.choices?.[0]?.delta?.content || '';
                    accumulatedTokens += estimateTokens(delta);
                  } catch { /* ignore parse errors in stream */ }

                  yield line + '\n\n';
                } else {
                  yield line + '\n\n';
                }
              }
            }
          } finally {
            reader.releaseLock();
          }

          const latency = (performance.now() - t0) / 1000;
          this.registry.onSuccess(key, latency, accumulatedTokens);

          this.logger.info({
            requestId, model,
            latency_s: parseFloat(latency.toFixed(3)),
            est_tokens: accumulatedTokens,
            key_suffix: '…' + key.slice(-6),
          }, 'OpenCode stream completed');

          return; // success

        } catch (err) {
          this.logger.error({
            requestId, error: err.message,
            key_suffix: '…' + key.slice(-6),
            attempt: attempt + 1,
          }, 'Stream error');
          this.registry.onError(key, false, this.logger);
          await backoffSleep(attempt);
        }
      }
    }

    // All keys exhausted — synthetic error chunk
    this.logger.error({ requestId, model }, 'All OpenCode keys exhausted for streaming');
    const errorChunk = {
      id: newCompletionId(),
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        delta: { content: 'Error: All OpenCode keys exhausted.' },
        finish_reason: 'stop',
      }],
    };
    yield `data: ${JSON.stringify(errorChunk)}\n\n`;
    yield 'data: [DONE]\n\n';
  }

  // ── Models endpoint ─────────────────────────────────────────────────────

  async listModels() {
    const keys = this.registry.rankedKeys();
    if (keys.length === 0) return [];

    for (const key of keys.slice(0, 3)) {
      try {
        const response = await httpFetch(this.modelsEndpoint, {
          method: 'GET',
          headers: this.buildHeaders(key),
        });

        if (response.status === 200) {
          const data = await response.json();
          return (data.data || []).map(m => ({
            id: m.id,
            object: 'model',
            owned_by: 'opencode',
            context_length: m.context_length || null,
          }));
        }
      } catch (err) {
        this.logger.warn({ key_suffix: '…' + key.slice(-6), error: err.message }, 'OpenCode model list failed');
      }
    }

    return [];
  }
}

export default OpenCodeProvider;
