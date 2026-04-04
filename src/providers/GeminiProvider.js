/**
 * GeminiProvider.js
 * =================
 * Google Gemini API provider.
 *
 * Handles:
 *  - Message format conversion (OpenAI ↔ Gemini)
 *  - API key auth via query parameter
 *  - Streaming via Gemini SSE format
 *  - Multi-key support with health-score routing
 */

import { BaseProvider } from './BaseProvider.js';
import { httpFetch } from '../utils/httpClient.js';
import { backoffSleep } from '../utils/backoff.js';
import { estimateTokens } from '../utils/tokenEstimator.js';
import { newCompletionId, newRequestId } from '../utils/idGenerator.js';

const COOLING_STATUSES = new Set([429, 401, 403]);
const TRANSIENT_STATUSES = new Set([500, 502, 503, 504]);
const MAX_RETRIES = 2;

export class GeminiProvider extends BaseProvider {
  constructor(config, deps = {}) {
    super('gemini', config, deps);
    this.displayName = 'Google Gemini';
  }

  get baseUrl() {
    return this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }

  get defaultModel() {
    return this.config.defaultModel || 'gemini-1.5-flash';
  }

  // ── Format Conversion ───────────────────────────────────────────────────

  /**
   * Convert OpenAI messages → Gemini contents format.
   */
  static toGeminiMessages(messages) {
    const systemInstruction = [];
    const contents = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction.push({ text: msg.content });
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) }],
        });
      }
    }

    return { contents, systemInstruction };
  }

  /**
   * Convert Gemini response → OpenAI content string.
   */
  static extractContent(data) {
    try {
      const parts = data?.candidates?.[0]?.content?.parts || [];
      return parts.map(p => p.text || '').join('');
    } catch { return ''; }
  }

  static extractTokens(data) {
    try {
      const usage = data?.usageMetadata;
      return (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);
    } catch { return 0; }
  }

  // ── Non-streaming ───────────────────────────────────────────────────────

  async call(messages, model, options = {}) {
    const { extraParams = {}, requestId = newRequestId(), useCache = true, signal } = options;

    if (useCache && this.cache) {
      const cached = this.cache.get(messages, model);
      if (cached !== null) {
        this.logger.info({ requestId, model }, 'Cache hit (gemini)');
        return { content: cached, tokens: 0, rawResponse: null, fromCache: true };
      }
    }

    const { contents, systemInstruction } = GeminiProvider.toGeminiMessages(messages);
    const keys = this.registry ? this.registry.rankedKeys() : [];

    if (keys.length === 0) {
      throw Object.assign(new Error('No Gemini API keys configured.'), { statusCode: 503, type: 'provider_error' });
    }

    for (const key of keys) {
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        const t0 = performance.now();
        try {
          const geminiModel = model || this.defaultModel;
          const url = `${this.baseUrl}/models/${geminiModel}:generateContent?key=${key}`;

          const body = {
            contents,
            generationConfig: {},
          };

          if (systemInstruction.length > 0) {
            body.systemInstruction = { parts: systemInstruction };
          }

          if (extraParams.temperature !== undefined) body.generationConfig.temperature = extraParams.temperature;
          if (extraParams.max_tokens !== undefined) body.generationConfig.maxOutputTokens = extraParams.max_tokens;
          if (extraParams.top_p !== undefined) body.generationConfig.topP = extraParams.top_p;
          if (extraParams.stop) body.generationConfig.stopSequences = Array.isArray(extraParams.stop) ? extraParams.stop : [extraParams.stop];

          const response = await httpFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
          });

          const latency = (performance.now() - t0) / 1000;

          if (response.status === 200) {
            const data = await response.json();
            const text = GeminiProvider.extractContent(data);
            const tokens = GeminiProvider.extractTokens(data) || estimateTokens(text);

            this.registry.onSuccess(key, latency, tokens);
            if (this.store) { this.store.syncFromRegistry(this.registry); this.store.save(); }

            this.logger.info({ requestId, model: geminiModel, latency_s: parseFloat(latency.toFixed(3)), tokens, key_suffix: '…' + key.slice(-6), attempt: attempt + 1 }, 'Gemini success');

            if (useCache && text && this.cache) this.cache.set(messages, model, text);

            return { content: text, tokens, rawResponse: data, fromCache: false };
          }

          if (COOLING_STATUSES.has(response.status)) {
            this.registry.onError(key, true, this.logger);
            break;
          }

          if (TRANSIENT_STATUSES.has(response.status)) {
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

          this.registry.onError(key, false, this.logger);
          await backoffSleep(attempt);

        } catch (err) {
          if (err.statusCode === 400 || err.statusCode === 404) throw err;
          this.logger.error({ requestId, error: err.message, key_suffix: '…' + key.slice(-6) }, 'Gemini request error');
          this.registry.onError(key, false, this.logger);
          await backoffSleep(attempt);
        }
      }
    }

    throw Object.assign(new Error('All Gemini keys exhausted.'), { statusCode: 503, type: 'exhausted' });
  }

  // ── Streaming ───────────────────────────────────────────────────────────

  async *stream(messages, model, options = {}) {
    const { extraParams = {}, requestId = newRequestId(), signal } = options;
    const { contents, systemInstruction } = GeminiProvider.toGeminiMessages(messages);
    const keys = this.registry ? this.registry.rankedKeys() : [];

    for (const key of keys) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const t0 = performance.now();
        try {
          const geminiModel = model || this.defaultModel;
          // Sanitize key from logged URLs
          const url = `${this.baseUrl}/models/${geminiModel}:streamGenerateContent?key=${key}&alt=sse`;

          const body = { contents, generationConfig: {} };
          if (systemInstruction.length > 0) body.systemInstruction = { parts: systemInstruction };
          if (extraParams.temperature !== undefined) body.generationConfig.temperature = extraParams.temperature;
          if (extraParams.max_tokens !== undefined) body.generationConfig.maxOutputTokens = extraParams.max_tokens;
          if (extraParams.top_p !== undefined) body.generationConfig.topP = extraParams.top_p;

          const response = await httpFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
          });

          if (response.status !== 200) {
            if (response.status === 400 || response.status === 404) {
              const bodyText = await response.text().catch(() => '');
              const err = new Error(bodyText || `HTTP ${response.status}`);
              err.statusCode = response.status;
              throw err;
            }
            if (COOLING_STATUSES.has(response.status)) { this.registry.onError(key, true, this.logger); break; }
            this.registry.onError(key, false, this.logger);
            await backoffSleep(attempt);
            continue;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let accumulatedTokens = 0;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line || !line.startsWith('data:')) continue;

                const dataStr = line.slice(5).trim();
                if (!dataStr) continue;

                try {
                  const geminiChunk = JSON.parse(dataStr);
                  const text = geminiChunk?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                  if (!text) continue;

                  accumulatedTokens += estimateTokens(text);

                  const sseChunk = {
                    id: newCompletionId(),
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model: geminiModel,
                    choices: [{
                      index: 0,
                      delta: { content: text },
                      finish_reason: geminiChunk?.candidates?.[0]?.finishReason === 'STOP' ? 'stop' : null,
                    }],
                  };
                  yield `data: ${JSON.stringify(sseChunk)}\n\n`;
                } catch { /* ignore */ }
              }
            }
          } finally {
            reader.releaseLock();
          }

          yield 'data: [DONE]\n\n';

          const latency = (performance.now() - t0) / 1000;
          this.registry.onSuccess(key, latency, accumulatedTokens);
          this.logger.info({ requestId, model: geminiModel, latency_s: parseFloat(latency.toFixed(3)), est_tokens: accumulatedTokens }, 'Gemini stream completed');
          return;

        } catch (err) {
          if (err.statusCode === 400 || err.statusCode === 404) throw err;
          this.logger.error({ requestId, error: err.message, attempt: attempt + 1 }, 'Gemini stream error');
          this.registry.onError(key, false, this.logger);
          await backoffSleep(attempt);
        }
      }
    }

    const errorChunk = {
      id: newCompletionId(), object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000), model,
      choices: [{ index: 0, delta: { content: 'Error: All Gemini keys exhausted.' }, finish_reason: 'stop' }],
    };
    yield `data: ${JSON.stringify(errorChunk)}\n\n`;
    yield 'data: [DONE]\n\n';
  }

  // ── Models ──────────────────────────────────────────────────────────────

  async listModels() {
    const keys = this.registry ? this.registry.rankedKeys() : [];
    if (keys.length === 0) return [];

    try {
      const url = `${this.baseUrl}/models?key=${keys[0]}`;
      const response = await httpFetch(url, { method: 'GET' });

      if (response.status === 200) {
        const data = await response.json();
        return (data.models || [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
          .map(m => ({
            id: m.name?.replace('models/', '') || m.displayName,
            object: 'model',
            owned_by: 'google',
            context_length: m.inputTokenLimit || null,
          }));
      }
    } catch (err) {
      this.logger.warn({ error: err.message }, 'Gemini model list failed');
    }
    return [];
  }
}

export default GeminiProvider;
