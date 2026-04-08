/**
 * ModelRegistry.js
 * ================
 * Central model-to-provider lookup service.
 *
 * At startup, fetches model lists from every enabled provider and builds
 * an in-memory Map<modelId, providerId[]>.  When a request arrives, the
 * RoutingEngine calls `resolve(modelName)` to find which provider(s) own
 * that model — so the request goes ONLY to the right provider.
 *
 * Periodic background refresh keeps the registry in sync with upstream
 * provider catalogs (e.g. Ollama Cloud 200+ models).
 */

export class ModelRegistry {
  /**
   * @param {import('../providers/ProviderRegistry.js').ProviderRegistry} providerRegistry
   * @param {object} [config]
   * @param {object} [logger]
   */
  constructor(providerRegistry, config = {}, logger = console) {
    this.providerRegistry = providerRegistry;
    this.config = config;
    this.logger = logger;

    /** @type {Map<string, string[]>} modelId → [providerId, ...] */
    this._modelMap = new Map();

    /** @type {Map<string, Set<string>>} providerId → Set of modelIds */
    this._providerModels = new Map();

    /** Refresh timer handle */
    this._refreshTimer = null;

    /** Whether initial load has completed */
    this._initialized = false;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Initialize the registry by fetching models from all providers.
   * Call once at startup, after ProviderRegistry is ready.
   */
  async initialize() {
    await this._fetchAllModels();
    this._initialized = true;

    // Start periodic refresh
    const intervalMs = this.config.refreshIntervalMs || 1800000; // 30 min default
    if (intervalMs > 0) {
      this._refreshTimer = setInterval(() => {
        this._fetchAllModels().catch(err => {
          this.logger.error({ error: err.message }, 'ModelRegistry: periodic refresh failed');
        });
      }, intervalMs);
      // Don't block process exit
      if (this._refreshTimer.unref) this._refreshTimer.unref();
    }
  }

  /**
   * Resolve a model name to its owning provider ID.
   * Returns the first provider that has this model.
   *
   * @param {string} modelName
   * @returns {string|null} providerId or null if not found
   */
  resolve(modelName) {
    if (!modelName) return null;

    // 1. Exact match in registry
    const providers = this._modelMap.get(modelName);
    if (providers && providers.length > 0) {
      return providers[0];
    }

    // 2. Normalized match (lowercase, trim)
    const normalized = modelName.toLowerCase().trim();
    const providersNorm = this._modelMap.get(normalized);
    if (providersNorm && providersNorm.length > 0) {
      return providersNorm[0];
    }

    // 3. Check if model has an explicit provider prefix (e.g. "openrouter/auto")
    if (modelName.includes('/')) {
      const prefix = modelName.split('/')[0].toLowerCase();
      const provider = this.providerRegistry.get(prefix);
      if (provider && provider.isAvailable()) {
        return prefix;
      }
    }

    // 4. Not found in any provider
    return null;
  }

  /**
   * Get all provider IDs that have this model.
   * Useful for building a fallback chain of only relevant providers.
   *
   * @param {string} modelName
   * @returns {string[]} array of provider IDs
   */
  resolveAll(modelName) {
    if (!modelName) return [];

    const providers = this._modelMap.get(modelName) || this._modelMap.get(modelName.toLowerCase().trim());
    if (providers && providers.length > 0) {
      return [...providers];
    }

    // Prefix-based
    if (modelName.includes('/')) {
      const prefix = modelName.split('/')[0].toLowerCase();
      const provider = this.providerRegistry.get(prefix);
      if (provider && provider.isAvailable()) {
        return [prefix];
      }
    }

    return [];
  }

  /**
   * Get the total number of models in the registry.
   * @returns {number}
   */
  get size() {
    return this._modelMap.size;
  }

  /**
   * Get count of models per provider.
   * @returns {object} { providerId: count, ... }
   */
  stats() {
    const result = {};
    for (const [providerId, models] of this._providerModels) {
      result[providerId] = models.size;
    }
    return result;
  }

  /**
   * Check if the registry has been initialized.
   * @returns {boolean}
   */
  get initialized() {
    return this._initialized;
  }

  /**
   * Stop the periodic refresh timer.
   */
  destroy() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  /**
   * Fetch model lists from all enabled providers and rebuild the maps.
   */
  async _fetchAllModels() {
    const newModelMap = new Map();
    const newProviderModels = new Map();

    const allProviders = this.providerRegistry.getAll();
    const fetchPromises = [];

    for (const [providerId, provider] of allProviders) {
      if (!provider.isAvailable()) continue;

      fetchPromises.push(
        this._fetchProviderModels(providerId, provider)
          .then(models => ({ providerId, models }))
          .catch(err => {
            this.logger.warn(
              { providerId, error: err.message },
              'ModelRegistry: failed to fetch models from provider'
            );
            return { providerId, models: [] };
          })
      );
    }

    const results = await Promise.all(fetchPromises);

    for (const { providerId, models } of results) {
      const modelSet = new Set();

      for (const model of models) {
        const modelId = model.id || model;
        modelSet.add(modelId);

        // Add to model → providers map
        if (!newModelMap.has(modelId)) {
          newModelMap.set(modelId, []);
        }
        const existingProviders = newModelMap.get(modelId);
        if (!existingProviders.includes(providerId)) {
          existingProviders.push(providerId);
        }

        // Also store lowercase version for case-insensitive lookup
        const lower = modelId.toLowerCase();
        if (lower !== modelId) {
          if (!newModelMap.has(lower)) {
            newModelMap.set(lower, []);
          }
          const lowerProviders = newModelMap.get(lower);
          if (!lowerProviders.includes(providerId)) {
            lowerProviders.push(providerId);
          }
        }
      }

      newProviderModels.set(providerId, modelSet);
    }

    // Atomic swap
    this._modelMap = newModelMap;
    this._providerModels = newProviderModels;

    const stats = {};
    for (const [pid, ms] of newProviderModels) {
      stats[pid] = ms.size;
    }

    this.logger.info(
      { total_models: newModelMap.size, providers: stats },
      'ModelRegistry: initialized/refreshed'
    );
  }

  /**
   * Fetch model list from a single provider.
   * @param {string} providerId
   * @param {import('../providers/BaseProvider.js').BaseProvider} provider
   * @returns {Promise<object[]>}
   */
  async _fetchProviderModels(providerId, provider) {
    if (typeof provider.listModels !== 'function') {
      return [];
    }

    const models = await provider.listModels();
    return Array.isArray(models) ? models : [];
  }
}

export default ModelRegistry;
