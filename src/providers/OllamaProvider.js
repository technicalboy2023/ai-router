/**
 * OllamaProvider.js
 * =================
 * Production-grade Ollama provider (OpenAI-compatible).
 * Full port of OpenRouterProvider setup for Ollama Cloud (https://api.ollama.com/v1).
 */

import { BaseProvider } from './BaseProvider.js';
import { httpFetch } from '../utils/httpClient.js';
import { backoffSleep } from '../utils/backoff.js';
import { estimateTokens } from '../utils/tokenEstimator.js';
import { newCompletionId, newRequestId } from '../utils/idGenerator.js';

/** HTTP status codes that freeze the key (true rate-limit / auth issues) */
const COOLING_STATUSES = new Set([429, 401, 402]);

/** HTTP status codes worth retrying with the same key */
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);

/** Maximum retries per key */
const MAX_RETRIES = 2;

/**
 * Check if an HTTP error body indicates the model is not found / not available.
 * If so, there's no point trying more keys — the model itself is the problem.
 * @param {string} bodyText - Response body text
 * @returns {boolean}
 */
function isModelNotFoundError(bodyText) {
  if (!bodyText) return false;
  const lower = bodyText.toLowerCase();
  return lower.includes('model') && (
    lower.includes('not found') ||
    lower.includes('not available') ||
    lower.includes('does not exist') ||
    lower.includes('not exist') ||
    lower.includes('unknown model') ||
    lower.includes('invalid model')
  );
}

export class OllamaProvider extends BaseProvider {
  constructor(config, deps = {}) {
    super('ollama', config, deps);
    this.displayName = 'Ollama';
  }

  get baseUrl() {
    return this.config.baseUrl || 'https://api.ollama.com/v1';
  }

  get chatEndpoint() {
    return `${this.baseUrl}/chat/completions`;
  }

  get modelsEndpoint() {
    return `${this.baseUrl}/models`;
  }

  get defaultModel() {
    return this.config.defaultModel || 'llama3';
  }

  // ── Headers ─────────────────────────────────────────────────────────────

  buildHeaders(key) {
    return {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
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
      throw Object.assign(new Error('No Ollama API keys configured.'), { statusCode: 503, type: 'provider_error' });
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
              text = OllamaProvider.safeContent(data);
              tokens = OllamaProvider.extractTokens(data);
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
            }, 'Ollama success');

            if (useCache && text && this.cache) {
              this.cache.set(messages, model, text);
            }

            return { content: text, tokens, rawResponse: data, fromCache: false };
          }

          // ── 403 Forbidden — could be model-not-found OR key issue ──
          if (response.status === 403) {
            const bodyText = await response.text().catch(() => '');
            // If the error is about the MODEL (not the key), stop immediately
            // — trying more keys won't help, the model itself is unavailable
            if (isModelNotFoundError(bodyText)) {
              this.logger.warn({
                requestId, model, status: 403,
                key_suffix: '…' + key.slice(-6),
              }, 'Model not available on Ollama (403) — skipping remaining keys');
              const err = new Error(bodyText || `Model "${model}" not available on Ollama`);
              err.statusCode = 404;
              throw err;
            }
            // Otherwise treat as a genuine key auth issue
            this.logger.warn({
              requestId, status: response.status,
              key_suffix: '…' + key.slice(-6),
            }, 'Key cooling (403 auth)');
            this.registry.onError(key, true, this.logger);
            break; // next key
          }

          // ── Rate-limited / auth error → cool key, next ───────────
          if (COOLING_STATUSES.has(response.status)) {
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

    this.logger.error({ requestId, model, keys_tried: keys.length }, 'All Ollama keys exhausted');
    throw Object.assign(
      new Error('All Ollama API keys exhausted. Please try again later.'),
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

          // ── 403 Forbidden — check model-not-found before key cycling ──
          if (response.status === 403) {
            const bodyText = await response.text().catch(() => '');
            if (isModelNotFoundError(bodyText)) {
              this.logger.warn({ requestId, model, status: 403 }, 'Model not available on Ollama (stream) — skipping remaining keys');
              const err = new Error(bodyText || `Model "${model}" not available on Ollama`);
              err.statusCode = 404;
              throw err;
            }
            this.registry.onError(key, true, this.logger);
            break; // next key (auth issue)
          }

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
          }, 'Ollama stream completed');

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
      new Error('All Ollama API keys exhausted. Please try again later.'),
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
            owned_by: 'ollama',
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

export default OllamaProvider;
