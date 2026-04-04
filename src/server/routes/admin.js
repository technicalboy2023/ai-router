/**
 * admin.js
 * ========
 * POST /admin/reset-cooldowns
 * Clears all cooldowns across all providers. Requires admin auth.
 */

import { Router } from 'express';

const router = Router();

// Middleware to ensure admin access
router.use((req, res, next) => {
  // authMiddleware sets req.isAdmin
  if (!req.isAdmin) {
    return res.status(403).json({ error: { message: 'Admin access required', type: 'auth_error' } });
  }
  next();
});

router.post('/reset-cooldowns', (req, res, next) => {
  try {
    const { deps, logger } = res.locals;
    const { providerRegistry } = deps;

    let totalReset = 0;
    const details = {};

    for (const [id, provider] of providerRegistry.getAll()) {
      if (!provider.registry) continue;
      
      const count = provider.registry.resetAllCooldowns();
      if (count > 0) {
        details[id] = count;
        totalReset += count;
      }
    }

    logger.info({ totalReset, details }, 'Admin: Cooldowns reset manually');

    res.json({
      status: 'ok',
      message: `Reset cooldowns on ${totalReset} keys.`,
      details,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/cache/clear', (req, res, next) => {
  try {
    const { deps, logger } = res.locals;
    const { cache } = deps;

    if (!cache) {
      return res.status(400).json({ error: { message: 'Cache is not enabled' } });
    }

    cache.clear();
    logger.info('Admin: Cache cleared manually');

    res.json({
      status: 'ok',
      message: 'Cache cleared successfully'
    });
  } catch (err) {
    next(err);
  }
});

export default router;
