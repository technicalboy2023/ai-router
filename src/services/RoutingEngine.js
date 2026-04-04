/**
 * RoutingEngine.js
 * ================
 * Smart routing decision engine.
 * Determines which provider + model to use for a given request.
 *
 * Strategies:
 *  - priority: try providers in configured order
 *  - model-based: map model names/patterns to providers
 *  - latency-aware: prefer provider with lowest average latency
 *  - round-robin: distribute evenly across providers
 */

export class RoutingEngine {
  /**
   * @param {object} config - routing config section
   * @param {import('../providers/ProviderRegistry.js').ProviderRegistry} providerRegistry
   */
  constructor(config, providerRegistry) {
    this.config = config;
    this.providerRegistry = providerRegistry;
    this.strategy = config.strategy || 'priority';
    this.providerOrder = config.providerOrder || [];
    this.modelMapping = config.modelMapping || {};
    this.categoryMapping = config.categoryMapping || {};
    this._roundRobinIndex = 0;
  }

  /**
   * Determine the provider and model for a request.
   * @param {string} requestedModel - Model from client request
   * @param {object} [opts] - { category, preferredProvider }
   * @returns {{ provider: import('../providers/BaseProvider.js').BaseProvider, model: string }|null}
   */
  route(requestedModel, opts = {}) {
    switch (this.strategy) {
      case 'model-based':
        return this._routeByModel(requestedModel, opts);
      case 'latency-aware':
        return this._routeByLatency(requestedModel);
      case 'round-robin':
        return this._routeRoundRobin(requestedModel);
      case 'priority':
      default:
        return this._routeByPriority(requestedModel, opts);
    }
  }

  /**
   * Get ordered list of providers to try (for fallback engine).
   * @param {string} requestedModel
   * @returns {Array<{ provider: object, model: string }>}
   */
  getProviderChain(requestedModel) {
    const chain = [];
    
    // 1. Determine the optimal starting provider using current strategy (e.g. model-based)
    const initialRoute = this.route(requestedModel);
    if (initialRoute && initialRoute.provider) {
      chain.push(initialRoute);
    }

    // 2. Append the rest of the available providers based on configured priority order
    const priorityProviders = this.providerRegistry.getInOrder(this.providerOrder);
    for (const provider of priorityProviders) {
      if (initialRoute && provider.id === initialRoute.provider.id) continue; // Skip if already added
      const model = this._resolveModel(requestedModel, provider);
      chain.push({ provider, model });
    }

    return chain;
  }

  // ── Strategies ──────────────────────────────────────────────────────────

  _routeByPriority(requestedModel, opts = {}) {
    const providers = this.providerRegistry.getInOrder(this.providerOrder);

    if (opts.preferredProvider) {
      const preferred = this.providerRegistry.get(opts.preferredProvider);
      if (preferred?.isAvailable()) {
        return { provider: preferred, model: this._resolveModel(requestedModel, preferred) };
      }
    }

    for (const provider of providers) {
      return { provider, model: this._resolveModel(requestedModel, provider) };
    }

    return null;
  }

  _routeByModel(requestedModel, opts = {}) {
    // Check exact model mapping
    for (const [pattern, providerId] of Object.entries(this.modelMapping)) {
      if (this._matchPattern(requestedModel, pattern)) {
        const provider = this.providerRegistry.get(providerId);
        if (provider?.isAvailable()) {
          return { provider, model: requestedModel };
        }
      }
    }

    // Fall back to priority routing
    return this._routeByPriority(requestedModel, opts);
  }

  _routeByLatency(requestedModel) {
    const providers = Array.from(this.providerRegistry.getAll().values())
      .filter(p => p.isAvailable());

    if (providers.length === 0) return null;

    // Sort by average latency (via key registry health)
    providers.sort((a, b) => {
      const aLatency = a.registry ? this._avgProviderLatency(a.registry) : 9999;
      const bLatency = b.registry ? this._avgProviderLatency(b.registry) : 9999;
      return aLatency - bLatency;
    });

    const best = providers[0];
    return { provider: best, model: this._resolveModel(requestedModel, best) };
  }

  _routeRoundRobin(requestedModel) {
    const providers = this.providerRegistry.getInOrder(this.providerOrder);
    if (providers.length === 0) return null;

    const provider = providers[this._roundRobinIndex % providers.length];
    this._roundRobinIndex++;

    return { provider, model: this._resolveModel(requestedModel, provider) };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  _resolveModel(requestedModel, provider) {
    // If provider has a model mapping for categories, check it
    if (provider.config.models && typeof provider.config.models === 'object') {
      for (const [category, model] of Object.entries(provider.config.models)) {
        if (requestedModel === category) return model;
      }
    }

    // If model looks like it belongs to this provider, use as-is
    return requestedModel || provider.defaultModel;
  }

  _matchPattern(model, pattern) {
    // Support simple glob: gpt-* matches gpt-4o, gpt-3.5-turbo, etc.
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(model);
    }
    return model === pattern || model.startsWith(pattern);
  }

  _avgProviderLatency(registry) {
    const statuses = registry.status();
    if (statuses.length === 0) return 9999;
    const sum = statuses.reduce((acc, s) => acc + (s.avg_latency_s < 9000 ? s.avg_latency_s : 0), 0);
    const count = statuses.filter(s => s.avg_latency_s < 9000).length;
    return count > 0 ? sum / count : 9999;
  }
}

export default RoutingEngine;
