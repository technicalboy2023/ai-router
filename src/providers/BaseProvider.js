/**
 * BaseProvider.js
 * ===============
 * Abstract provider interface that all providers must implement.
 * Defines the contract for OpenRouter, Ollama, Gemini, etc.
 */

export class BaseProvider {
  /**
   * @param {string} id - Provider identifier
   * @param {object} config - Provider config section
   * @param {object} deps - Shared dependencies { logger, registry, cache, store }
   */
  constructor(id, config, deps = {}) {
    if (new.target === BaseProvider) {
      throw new Error('BaseProvider is abstract and cannot be instantiated directly');
    }
    this.id = id;
    this.config = config;
    this.logger = deps.logger || console;
    this.registry = deps.registry || null;
    this.cache = deps.cache || null;
    this.store = deps.store || null;
    this.displayName = id; // Default display name, children can override
  }

  /** @returns {string} Base URL for the provider API */
  get baseUrl() {
    return this.config.baseUrl || '';
  }

  /** @returns {string} Default model for this provider */
  get defaultModel() {
    return this.config.defaultModel || '';
  }

  /**
   * Execute a non-streaming chat completion.
   * @param {object[]} messages - Chat messages
   * @param {string} model - Model identifier
   * @param {object} [options] - { extraParams, requestId, useCache }
   * @returns {Promise<{ content: string, tokens: number, rawResponse: object }>}
   */
  async call(messages, model, options = {}) {
    throw new Error(`${this.id}: call() not implemented`);
  }

  /**
   * Execute a streaming chat completion.
   * Yields SSE-formatted byte chunks.
   * @param {object[]} messages
   * @param {string} model
   * @param {object} [options]
   * @returns {AsyncGenerator<string>}
   */
  async *stream(messages, model, options = {}) {
    throw new Error(`${this.id}: stream() not implemented`);
  }

  /**
   * List available models from this provider.
   * @returns {Promise<object[]>} Array of model objects in OpenAI format
   */
  async listModels() {
    throw new Error(`${this.id}: listModels() not implemented`);
  }

  /**
   * Check if this provider is available (has keys, is reachable).
   * @returns {boolean}
   */
  isAvailable() {
    return this.config.enabled !== false;
  }

  /**
   * Get provider status for observability endpoints.
   * @returns {object}
   */
  getStatus() {
    return {
      id: this.id,
      displayName: this.displayName,
      enabled: this.isAvailable(),
      defaultModel: this.defaultModel,
      keys: this.registry ? this.registry.size : 0,
      availableKeys: this.registry ? this.registry.availableCount() : 0,
    };
  }

  /**
   * Build HTTP headers for a request with a specific API key.
   * @param {string} key
   * @returns {object}
   */
  buildHeaders(key) {
    return {
      'Content-Type': 'application/json',
    };
  }

  /**
   * Build the request payload for this provider.
   * @param {object[]} messages
   * @param {string} model
   * @param {boolean} stream
   * @param {object} [extraParams]
   * @returns {object}
   */
  buildPayload(messages, model, stream = false, extraParams = {}) {
    return {
      model,
      messages,
      stream,
      ...extraParams,
    };
  }
}

export default BaseProvider;
