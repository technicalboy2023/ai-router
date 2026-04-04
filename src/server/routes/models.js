/**
 * models.js
 * =========
 * GET /v1/models endpoint.
 * Combines available models from active providers.
 */

import { Router } from 'express';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const { deps, config, logger } = res.locals;
    const { providerRegistry } = deps;
    
    // Attempt fetching model list from available providers
    // Fetches in priority order defined by configuration
    const order = config?.routing?.providerOrder || ['openrouter', 'ollama', 'gemini', 'groq'];
    const providers = providerRegistry.getInOrder(order);
    
    let allModels = [];
    for (const provider of providers) {
      if (provider.isAvailable()) {
        try {
          const models = await provider.listModels();
          if (Array.isArray(models)) {
             allModels.push(...models);
          }
        } catch (err) {
          logger.warn({ provider: provider.id, error: err.message }, 'Failed to fetch models list for provider');
        }
      }
    }
    
    // Deduplicate models based on `id`
    const deduplicated = [];
    const seen = new Set();
    for (const item of allModels) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        deduplicated.push(item);
      }
    }

    res.json({
      object: 'list',
      data: deduplicated,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
