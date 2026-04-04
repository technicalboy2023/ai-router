/**
 * health.js
 * =========
 * GET /health endpoint.
 * Liveness probe + summary of all provider registries and keys.
 */

import { Router } from 'express';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const { deps, config } = res.locals;
    const { providerRegistry, cache } = deps;

    const availableKeys = Array.from(providerRegistry.getAll().values())
      .reduce((sum, provider) => sum + (provider.registry ? provider.registry.availableCount() : 0), 0);
    
    const totalKeys = Array.from(providerRegistry.getAll().values())
      .reduce((sum, provider) => sum + (provider.registry ? provider.registry.size : 0), 0);

    const totalTokensAll = Array.from(providerRegistry.getAll().values())
      .reduce((sum, provider) => sum + (provider.registry ? provider.registry.totalTokens() : 0), 0);

    res.json({
      status: 'ok',
      providers_count: providerRegistry.size,
      total_keys: totalKeys,
      available_keys: availableKeys,
      total_tokens_all: totalTokensAll,
      cache: cache ? cache.stats() : null,
      uptime_note: 'Use /metrics or /router/status for detailed telemetry.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
