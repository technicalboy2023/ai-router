/**
 * metrics.js
 * ==========
 * GET /metrics endpoint.
 * Detailed per-key and aggregate metrics for all providers.
 */

import { Router } from 'express';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const { deps } = res.locals;
    const { providerRegistry, cache } = deps;

    const perProvider = {};
    let totalReq = 0, totalOk = 0, totalErr = 0, totalTokens = 0;
    let sumLatency = 0, countLatency = 0;

    for (const [id, provider] of providerRegistry.getAll()) {
      if (!provider.registry) continue;
      
      const keysData = provider.registry.status();
      perProvider[id] = keysData;

      for (const d of keysData) {
        totalReq += d.total_requests;
        totalOk += d.success_count;
        totalErr += d.error_count;
        totalTokens += d.total_tokens;
        if (d.avg_latency_s < 9000) {
          sumLatency += d.avg_latency_s;
          countLatency++;
        }
      }
    }

    const avgLatency = countLatency > 0 ? (sumLatency / countLatency) : 0;
    
    res.json({
      aggregate: {
        total_requests: totalReq,
        total_successes: totalOk,
        total_errors: totalErr,
        total_tokens: totalTokens,
        overall_success_rate: totalReq > 0 ? parseFloat((totalOk / totalReq).toFixed(4)) : 1.0,
        avg_latency_s: parseFloat(avgLatency.toFixed(3)),
      },
      per_provider: perProvider,
      cache: cache ? cache.stats() : null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
