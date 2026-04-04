/**
 * KeyManager.js
 * =============
 * High-level orchestration for keys across all providers.
 * Delegates to individual provider KeyRegistries.
 */

export class KeyManager {
  /**
   * @param {import('../providers/ProviderRegistry.js').ProviderRegistry} providerRegistry
   */
  constructor(providerRegistry) {
    this.providerRegistry = providerRegistry;
  }

  /**
   * Get the best key for a specific provider.
   * @param {string} providerId
   * @returns {string|null}
   */
  getKey(providerId) {
    const provider = this.providerRegistry.get(providerId);
    if (!provider || !provider.registry) return null;
    const keys = provider.registry.rankedKeys();
    return keys.length > 0 ? keys[0] : null;
  }

  /**
   * Record success for a provider's key.
   */
  recordSuccess(providerId, key, latency, tokens = 0) {
    const provider = this.providerRegistry.get(providerId);
    if (provider && provider.registry) {
      provider.registry.onSuccess(key, latency, tokens);
    }
  }

  /**
   * Record error for a provider's key.
   */
  recordError(providerId, key, forceCooldown = false, logger = null) {
    const provider = this.providerRegistry.get(providerId);
    if (provider && provider.registry) {
      provider.registry.onError(key, forceCooldown, logger);
    }
  }
}

export default KeyManager;
