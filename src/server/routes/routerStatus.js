/**
 * routerStatus.js
 * ===============
 * GET /router/status endpoint.
 * Key-level health dashboard. Shows ranked positions for all keys across providers.
 */

import { Router } from 'express';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const { deps } = res.locals;
    const { providerRegistry } = deps;

    const routerStatus = {};

    for (const [id, provider] of providerRegistry.getAll()) {
      if (!provider.registry) continue;

      const ranked = provider.registry.rankedKeys();
      const allData = new Map();
      provider.registry.status().forEach(item => {
         // reconstruct full key (sort of) based on suffix if needed, or rely on suffix for mapping
         // The status() method returns objects with key_suffix.
      });

      // We need to attach rank to the status items.
      const rankedView = [];
      const statsMap = new Map();
      provider.registry.status().forEach(s => statsMap.set(s.key_suffix, s));

      // rankedKeys returns actual keys.
      ranked.forEach((key, index) => {
        const suffix = '…' + key.slice(-6);
        const st = statsMap.get(suffix);
        if (st) {
          st.rank = index + 1;
          rankedView.push(st);
        }
      });

      routerStatus[id] = {
        provider: id,
        total_keys: provider.registry.size,
        available_keys: provider.registry.availableCount(),
        ranked_keys: rankedView,
        default_model: provider.defaultModel,
      };
    }

    res.json(routerStatus);
  } catch (err) {
    next(err);
  }
});

export default router;
