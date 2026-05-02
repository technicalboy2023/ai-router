/**
 * RoutingEngine.js
 * ================
 * Smart routing decision engine.
 * Determines which provider + model to use for a given request.
 *
 * PRIMARY: ModelRegistry lookup — each model routes to the provider that owns it.
 * FALLBACK strategies (if ModelRegistry miss):
 *  - priority: try providers in configured order
 *  - model-based: map model names/patterns to providers
 *  - latency-aware: prefer provider with lowest average latency
 *  - round-robin: distribute evenly across providers
 */

export class RoutingEngine {
  /**
   * @param {object} config - routing config section
   * @param {import('../providers/ProviderRegistry.js').ProviderRegistry} providerRegistry
   * @param {import('./ModelRegistry.js').ModelRegistry} [modelRegistry] - Optional model registry for smart routing
   */
  constructor(config, providerRegistry, modelRegistry = null) {
    this.config = config;
    this.providerRegistry = providerRegistry;
    this.modelRegistry = modelRegistry;
    this.strategy = config.strategy || 'priority';
    this.providerOrder = config.providerOrder || [];
    this.modelMapping = config.modelMapping || {};
    this.categoryMapping = config.categoryMapping || {};
    this._roundRobinIndex = 0;
  }

  /**
   * Set the ModelRegistry (for deferred initialization).
   * @param {import('./ModelRegistry.js').ModelRegistry} modelRegistry
   */
  setModelRegistry(modelRegistry) {
    this.modelRegistry = modelRegistry;
  }

  /**
   * Determine the provider and model for a request.
   * @param {string} requestedModel - Model from client request
   * @param {object} [opts] - { category, preferredProvider }
   * @returns {{ provider: import('../providers/BaseProvider.js').BaseProvider, model: string }|null}
   */
  route(requestedModel, opts = {}) {
    // ── 1. ModelRegistry lookup (HIGHEST PRIORITY) ──────────────────────
    // If ModelRegistry knows which provider owns this model, use it directly.
    if (this.modelRegistry && this.modelRegistry.initialized) {
      const resolvedProviderId = this.modelRegistry.resolve(requestedModel);
      if (resolvedProviderId) {
        const provider = this.providerRegistry.get(resolvedProviderId);
        if (provider && provider.isAvailable()) {
          return { provider, model: requestedModel };
        }
      }
    }

    // ── 2. Explicit Provider Prefix (e.g., 'openrouter/auto') ──────────
    if (requestedModel && requestedModel.includes('/')) {
      const prefix = requestedModel.split('/')[0].toLowerCase();
      const provider = this.providerRegistry.get(prefix);
      if (provider) {
        if (provider.isAvailable()) {
          return { provider, model: requestedModel };
        }
      }
    }

    // ── 3. Config-based strategy fallback ────────────────────────────────
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
   * With ModelRegistry: only include providers that actually have the model.
   * Without: old behavior (all providers in priority order).
   *
   * @param {string} requestedModel
   * @returns {Array<{ provider: object, model: string }>}
   */
  getProviderChain(requestedModel) {
    const chain = [];

    // ── Smart chain: only providers that have this model ─────────────────
    if (this.modelRegistry && this.modelRegistry.initialized) {
      const owningProviderIds = this.modelRegistry.resolveAll(requestedModel);

      if (owningProviderIds.length > 0) {
        for (const pid of owningProviderIds) {
          const provider = this.providerRegistry.get(pid);
          if (provider && provider.isAvailable()) {
            chain.push({ provider, model: requestedModel });
          }
        }

        // If we found at least one provider via ModelRegistry, also add catch-all as last-resort.
        // This ensures that if the owning provider's keys are exhausted, the catch-all
        // (e.g. OpenRouter) can still handle the request via its aggregation.
        if (chain.length > 0) {
          const catchAllId = this.config.modelRegistry?.catchAllProvider || 'openrouter';
          const catchAllProvider = this.providerRegistry.get(catchAllId);
          if (catchAllProvider && catchAllProvider.isAvailable()) {
            const alreadyInChain = chain.some(t => t.provider.id === catchAllId);
            if (!alreadyInChain) {
              chain.push({ provider: catchAllProvider, model: requestedModel });
            }
          }
          return chain;
        }
      }
    }

    // ── Prefix-based routing (e.g. openrouter/auto) ─────────────────────
    if (requestedModel && requestedModel.includes('/')) {
      const prefix = requestedModel.split('/')[0].toLowerCase();
      const provider = this.providerRegistry.get(prefix);
      if (provider && provider.isAvailable()) {
        return [{ provider, model: requestedModel }];
      }
    }

    // ── Legacy fallback: all providers in priority order ──────────────────
    // Only used when ModelRegistry hasn't initialized or model not found anywhere
    const initialRoute = this.route(requestedModel);
    if (initialRoute && initialRoute.provider) {
      chain.push(initialRoute);
    }

    const catchAllId = this.config.modelRegistry?.catchAllProvider || 'openrouter';
    const catchAllProvider = this.providerRegistry.get(catchAllId);
    
    // If we have a catch-all provider configured, try that (instead of hitting all providers)
    if (catchAllProvider && catchAllProvider.isAvailable() && (!initialRoute || initialRoute.provider.id !== catchAllId)) {
      const model = this._resolveModel(requestedModel, catchAllProvider);
      chain.push({ provider: catchAllProvider, model });
    }

    // Only fallback to absolutely everything if the chain is somehow still empty
    if (chain.length === 0) {
      const priorityProviders = this.providerRegistry.getInOrder(this.providerOrder);
      for (const provider of priorityProviders) {
        if (initialRoute && provider.id === initialRoute.provider.id) continue;
        const model = this._resolveModel(requestedModel, provider);
        chain.push({ provider, model });
      }
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

    if (providers.length > 0) {
      return { provider: providers[0], model: this._resolveModel(requestedModel, providers[0]) };
    }

    return null;
  }

  _routeByModel(requestedModel, opts = {}) {
    // Check exact model mapping from config
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
    if (provider.config.models && typeof provider.config.models === 'object') {
      for (const [category, model] of Object.entries(provider.config.models)) {
        if (requestedModel === category) return model;
      }
    }

    return requestedModel || provider.defaultModel;
  }

  _matchPattern(model, pattern) {
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
