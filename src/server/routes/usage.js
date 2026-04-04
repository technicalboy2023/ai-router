/**
 * usage.js
 * ========
 * GET /usage endpoint.
 * Aggregated per-key usage counters (anonymized: only last 6 chars shown).
 */

import { Router } from 'express';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const { deps } = res.locals;
    const { providerRegistry, store } = deps;

    // Sync current metrics to store
    for (const provider of providerRegistry.getAll().values()) {
       if (provider.registry && store) {
          store.syncFromRegistry(provider.registry);
       }
    }

    const usageData = {};
    for (const provider of providerRegistry.getAll().values()) {
        if (!provider.registry) continue;
        for (const [key, kh] of provider.registry._registry) {
           usageData[`${provider.id}_…${key.slice(-6)}`] = {
             total_requests: kh.totalRequests,
             success_count: kh.successCount,
             error_count: kh.errorCount,
             total_tokens: kh.totalTokens,
           };
        }
    }

    res.json(usageData);
  } catch (err) {
    next(err);
  }
});

export default router;
