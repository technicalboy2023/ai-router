/**
 * OpenRouterProvider.js
 * =====================
 * Production-grade OpenRouter provider.
 * Full port of provider_openrouter.py (493 lines).
 *
 * Features preserved:
 *  • Async HTTP via fetch + undici pool
 *  • TRUE SSE streaming passthrough
 *  • Weighted key selection (health-score based)
 *  • Multi-layer retry: same-key → next key → exhaustion
 *  • Exponential back-off between same-key retries
 *  • Auto-cooldown for rate-limited keys (429/402)
 *  • Smart 403 handling: model-not-found → fast fail, auth → cooldown
 *  • 5xx transient retry with backoff
 *  • Token extraction from API response
 *  • Synthetic error chunk on stream exhaustion
 *  • Model list fetched from /models endpoint
 */

import { BaseProvider } from './BaseProvider.js';
import { httpFetch } from '../utils/httpClient.js';
import { backoffSleep } from '../utils/backoff.js';
import { estimateTokens } from '../utils/tokenEstimator.js';
import { newCompletionId, newRequestId } from '../utils/idGenerator.js';

/** HTTP status codes that freeze the key */
const COOLING_STATUSES = new Set([429, 402]);

/** HTTP status codes worth retrying with the same key */
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

/** Maximum retries per key */
const MAX_RETRIES = 2;

/** If N consecutive keys fail with the same status, stop */
const CIRCUIT_BREAKER_THRESHOLD = 3;

export class OpenRouterProvider extends BaseProvider {
  constructor(config, deps = {}) {
    super('openrouter', config, deps);
    this.displayName = 'OpenRouter';
  }

  get baseUrl() {
    return this.config.baseUrl || 'https://openrouter.ai/api/v1';
  }

  get chatEndpoint() {
    return `${this.baseUrl}/chat/completions`;
  }

  get modelsEndpoint() {
    return `${this.baseUrl}/models`;
  }

  get embeddingsEndpoint() {
    return `${this.baseUrl}/embeddings`;
  }

  get defaultModel() {
    return this.config.defaultModel || 'openrouter/auto';
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
        this.logger.info({ requestId, model }, 'Cache hit');
        return { content: cached, tokens: 0, rawResponse: null, fromCache: true };
      }
    }

    const payload = this.buildPayload(messages, model, false, extraParams);
    const keys = this.registry.rankedKeys();

    if (keys.length === 0) {
      this.logger.error({ requestId }, 'No API keys configured');
      throw Object.assign(new Error('No OpenRouter API keys configured.'), { statusCode: 503, type: 'provider_error' });
    }

    let consecutiveFailStatus = 0;
    let lastFailStatus = null;

    for (const key of keys) {
      if (consecutiveFailStatus >= CIRCUIT_BREAKER_THRESHOLD) {
        this.logger.warn({ requestId, model, status: lastFailStatus, keys_tried: consecutiveFailStatus },
          `Circuit breaker: ${consecutiveFailStatus}x ${lastFailStatus} — stopping key rotation`);
        const err = new Error(`All OpenRouter keys failing with HTTP ${lastFailStatus} for model "${model}"`);
        err.statusCode = lastFailStatus === 402 ? 402 : 503;
        throw err;
      }

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
              text = OpenRouterProvider.safeContent(data);
              tokens = OpenRouterProvider.extractTokens(data);
            } catch (parseErr) {
              this.logger.warn({ requestId, error: parseErr.message }, 'JSON parse error on success');
              const rawText = await response.text().catch(() => '');
              text = rawText.slice(0, 2000);
              tokens = estimateTokens(text);
              data = null;
            }

            this.registry.onSuccess(key, latency, tokens);
            if (this.store) {
              this.store.syncFromRegistry(this.registry);
              this.store.save();
            }

            this.logger.info({
              requestId, model,
              latency_s: parseFloat(latency.toFixed(3)),
              tokens,
              key_suffix: '…' + key.slice(-6),
              attempt: attempt + 1,
            }, 'OpenRouter success');

            if (useCache && text && this.cache) {
              this.cache.set(messages, model, text);
            }

            return { content: text, tokens, rawResponse: data, fromCache: false };
          }

          // ── 401/403 Forbidden — smart handling ──────────────────
          if (response.status === 401 || response.status === 403) {
            const body403 = await response.text().catch(() => '');
            const lower = body403.toLowerCase();
            const isModelErr = lower.includes('model') && (
              lower.includes('not found') || lower.includes('not available') ||
              lower.includes('does not exist') || lower.includes('invalid')
            );
            if (isModelErr) {
              const err = new Error(body403 || `Model "${model}" not available (HTTP ${response.status})`);
              err.statusCode = 404;
              throw err;
            }
            if (response.status === lastFailStatus) { consecutiveFailStatus++; } else { lastFailStatus = response.status; consecutiveFailStatus = 1; }
            this.logger.warn({ requestId, status: response.status, key_suffix: '…' + key.slice(-6) }, 'Key cooling');
            this.registry.onError(key, true, this.logger);
            break;
          }

          // ── Rate-limited → cool key, next ───────────────────────
          if (COOLING_STATUSES.has(response.status)) {
            if (response.status === lastFailStatus) { consecutiveFailStatus++; } else { lastFailStatus = response.status; consecutiveFailStatus = 1; }
            this.logger.warn({
              requestId, status: response.status,
              key_suffix: '…' + key.slice(-6),
            }, 'Key cooling');
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
          
          if (response.status === 400 || response.status === 404) {
            const err = new Error(bodyText || `HTTP ${response.status}`);
            err.statusCode = response.status;
            throw err;
          }

          this.logger.error({
            requestId, status: response.status,
            body: bodyText.slice(0, 500),
            key_suffix: '…' + key.slice(-6),
          }, 'Unexpected HTTP status');
          this.registry.onError(key, false, this.logger);
          await backoffSleep(attempt);

        } catch (err) {
          if (err.statusCode === 400 || err.statusCode === 404) throw err;
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

    this.logger.error({ requestId, model, keys_tried: keys.length }, 'All OpenRouter keys exhausted');
    throw Object.assign(
      new Error('All OpenRouter API keys exhausted. Please try again later.'),
      { statusCode: 503, type: 'exhausted' }
    );
  }

  // ── Embeddings call ─────────────────────────────────────────────────────

  async embed(input, model, options = {}) {
    const {
      extraParams = {},
      requestId = newRequestId(),
      signal,
    } = options;

    const payload = { input, model, ...extraParams };
    const keys = this.registry.rankedKeys();

    for (const key of keys) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const t0 = performance.now();
        try {
          const response = await httpFetch(this.embeddingsEndpoint, {
            method: 'POST',
            headers: this.buildHeaders(key),
            body: JSON.stringify(payload),
            signal,
          });

          if (response.ok) {
            const data = await response.json();
            const latency = (performance.now() - t0) / 1000;
            
            const tokens = data.usage?.prompt_tokens || data.usage?.total_tokens || 0;

            this.logger.info({
              requestId, model, latency_s: parseFloat(latency.toFixed(3)),
              status: 200, key_suffix: '…' + key.slice(-6),
            }, 'Embeddings call succeeded');

            this.registry.onSuccess(key, latency, tokens);

            return data;
          }

          if (COOLING_STATUSES.has(response.status)) {
            this.logger.warn({
              requestId, status: response.status,
              key_suffix: '…' + key.slice(-6),
            }, 'Key cooling');
            this.registry.onError(key, true, this.logger);
            break;
          }

          if (TRANSIENT_STATUSES.has(response.status)) {
            this.logger.warn({
              requestId, status: response.status, attempt: attempt + 1,
              key_suffix: '…' + key.slice(-6),
            }, 'Transient server error, retrying');
            this.registry.onError(key, false, this.logger);
            await backoffSleep(attempt);
            continue;
          }

          const bodyText = await response.text().catch(() => '');
          if (response.status === 400 || response.status === 404) {
            const err = new Error(bodyText || `HTTP ${response.status}`);
            err.statusCode = response.status;
            throw err;
          }

          this.logger.error({
            requestId, status: response.status, body: bodyText.slice(0, 500),
            key_suffix: '…' + key.slice(-6),
          }, 'Unexpected HTTP status');
          this.registry.onError(key, false, this.logger);
          await backoffSleep(attempt);

        } catch (err) {
          if (err.statusCode === 400 || err.statusCode === 404) throw err;
          const latency = (performance.now() - t0) / 1000;

          if (err.name === 'TimeoutError' || err.code === 'UND_ERR_CONNECT_TIMEOUT') {
            this.logger.warn({
              requestId, latency_s: parseFloat(latency.toFixed(3)),
              attempt: attempt + 1, key_suffix: '…' + key.slice(-6),
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

    this.logger.error({ requestId, model, keys_tried: keys.length }, 'All OpenRouter keys exhausted for embeddings');
    throw Object.assign(
      new Error('All OpenRouter API keys exhausted for embeddings. Please try again later.'),
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

    let consecutiveFailStatus = 0;
    let lastFailStatus = null;

    for (const key of keys) {
      if (consecutiveFailStatus >= CIRCUIT_BREAKER_THRESHOLD) {
        this.logger.warn({ requestId, model, status: lastFailStatus, keys_tried: consecutiveFailStatus },
          `Circuit breaker (stream): ${consecutiveFailStatus}x ${lastFailStatus}`);
        const err = new Error(`All OpenRouter keys failing with HTTP ${lastFailStatus}`);
        err.statusCode = lastFailStatus === 402 ? 402 : 503;
        throw err;
      }

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const t0 = performance.now();
        try {
          const response = await httpFetch(this.chatEndpoint, {
            method: 'POST',
            headers: this.buildHeaders(key),
            body: JSON.stringify(payload),
            signal,
          });

          // ── 401/403 — smart handling ──────────────────────────
          if (response.status === 401 || response.status === 403) {
            const body403 = await response.text().catch(() => '');
            const lower = body403.toLowerCase();
            const isModelErr = lower.includes('model') && (
              lower.includes('not found') || lower.includes('not available') ||
              lower.includes('does not exist') || lower.includes('invalid')
            );
            if (isModelErr) {
              const err = new Error(body403 || `Model "${model}" not available (HTTP ${response.status})`);
              err.statusCode = 404;
              throw err;
            }
            if (response.status === lastFailStatus) { consecutiveFailStatus++; } else { lastFailStatus = response.status; consecutiveFailStatus = 1; }
            this.registry.onError(key, true, this.logger);
            break;
          }

          if (COOLING_STATUSES.has(response.status)) {
            if (response.status === lastFailStatus) { consecutiveFailStatus++; } else { lastFailStatus = response.status; consecutiveFailStatus = 1; }
            this.registry.onError(key, true, this.logger);
            break; // next key
          }

          if (TRANSIENT_STATUSES.has(response.status)) {
            this.registry.onError(key, false, this.logger);
            await backoffSleep(attempt);
            continue;
          }

          if (response.status !== 200) {
            if (response.status === 400 || response.status === 404) {
              const bodyText = await response.text().catch(() => '');
              const err = new Error(bodyText || `HTTP ${response.status}`);
              err.statusCode = response.status;
              throw err;
            }
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
          if (this.store) {
            this.store.syncFromRegistry(this.registry);
            this.store.save();
          }

          this.logger.info({
            requestId, model,
            latency_s: parseFloat(latency.toFixed(3)),
            est_tokens: accumulatedTokens,
            key_suffix: '…' + key.slice(-6),
          }, 'OpenRouter stream completed');

          return; // success

        } catch (err) {
          if (err.statusCode === 400 || err.statusCode === 404) throw err;
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

    // All keys exhausted
    this.logger.error({ requestId, model }, 'All keys exhausted for streaming');
    throw Object.assign(
      new Error('All OpenRouter API keys exhausted. Please try again later.'),
      { statusCode: 503, type: 'exhausted' }
    );
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
            owned_by: 'openrouter',
            context_length: m.context_length || null,
            pricing: m.pricing || null,
          }));
        }
      } catch (err) {
        this.logger.warn({ key_suffix: '…' + key.slice(-6), error: err.message }, 'Model list fetch failed');
      }
    }

    return [];
  }
}

export default OpenRouterProvider;
