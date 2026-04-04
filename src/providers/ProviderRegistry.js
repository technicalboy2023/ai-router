/**
 * ProviderRegistry.js
 * ===================
 * Factory + registry for provider instances.
 * Creates, stores, and retrieves provider instances by ID.
 */

import { OpenRouterProvider } from './OpenRouterProvider.js';
import { OllamaProvider } from './OllamaProvider.js';
import { GeminiProvider } from './GeminiProvider.js';
import { GroqProvider } from './GroqProvider.js';
import { KeyRegistry } from '../router_core/KeyRegistry.js';

/** Map of provider ID → class */
const PROVIDER_CLASSES = {
  openrouter: OpenRouterProvider,
  ollama: OllamaProvider,
  gemini: GeminiProvider,
  groq: GroqProvider,
};

export class ProviderRegistry {
  constructor() {
    /** @type {Map<string, import('./BaseProvider.js').BaseProvider>} */
    this._providers = new Map();
  }

  /**
   * Initialize providers from router config.
   * @param {object} config - Full router config
   * @param {object} deps - Shared dependencies { logger, cache, store }
   * @returns {ProviderRegistry}
   */
  initFromConfig(config, deps = {}) {
    const { providers: providerConfigs } = config;

    for (const [id, providerConfig] of Object.entries(providerConfigs)) {
      if (!providerConfig.enabled) continue;

      const ProviderClass = PROVIDER_CLASSES[id];
      if (!ProviderClass) {
        deps.logger?.warn({ providerId: id }, 'Unknown provider, skipping');
        continue;
      }

      // Create key registry for this provider
      const keys = providerConfig.keys || [];
      const registry = new KeyRegistry(keys);

      const provider = new ProviderClass(providerConfig, {
        logger: deps.logger,
        registry,
        cache: deps.cache,
        store: deps.store,
      });

      this._providers.set(id, provider);

      deps.logger?.info({
        providerId: id,
        keys: registry.size,
        defaultModel: provider.defaultModel,
      }, `Provider initialized: ${provider.displayName}`);
    }

    return this;
  }

  /**
   * Get a provider by ID.
   * @param {string} id
   * @returns {import('./BaseProvider.js').BaseProvider|undefined}
   */
  get(id) {
    return this._providers.get(id);
  }

  /**
   * Get all active providers.
   * @returns {Map<string, import('./BaseProvider.js').BaseProvider>}
   */
  getAll() {
    return this._providers;
  }

  /**
   * Get first available provider.
   * @returns {import('./BaseProvider.js').BaseProvider|undefined}
   */
  getFirst() {
    for (const provider of this._providers.values()) {
      if (provider.isAvailable()) return provider;
    }
    return undefined;
  }

  /**
   * Get providers in priority order.
   * @param {string[]} order - Provider IDs in priority order
   * @returns {import('./BaseProvider.js').BaseProvider[]}
   */
  getInOrder(order) {
    const result = [];
    for (const id of order) {
      const p = this._providers.get(id);
      if (p && p.isAvailable()) result.push(p);
    }
    // Add any remaining providers not in the order list
    for (const [id, p] of this._providers) {
      if (!order.includes(id) && p.isAvailable()) result.push(p);
    }
    return result;
  }

  /**
   * Get status of all providers.
   * @returns {object[]}
   */
  status() {
    return Array.from(this._providers.values()).map(p => p.getStatus());
  }

  /**
   * Number of active providers.
   */
  get size() {
    return this._providers.size;
  }

  /**
   * Restore persisted usage data for all providers.
   * @param {import('../router_core/UsageStore.js').UsageStore} store
   */
  restoreFromStore(store) {
    for (const provider of this._providers.values()) {
      if (provider.registry) {
        const seed = store.getRegistrySeed(provider.registry);
        if (Object.keys(seed).length > 0) {
          provider.registry.loadPersisted(seed);
        }
      }
    }
  }
}

export default ProviderRegistry;
