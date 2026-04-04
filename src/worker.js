/**
 * worker.js
 * =========
 * Router process entry point.
 * Initializes all core components, starts the Express server, 
 * and handles background maintenance tasks (Cache GC, Usage Save).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createLogger } from './utils/logger.js';
import { initHttpClient, closeHttpClient } from './utils/httpClient.js';
import { loadConfig } from './config/loader.js';
import { ProviderRegistry } from './providers/ProviderRegistry.js';
import { RoutingEngine } from './services/RoutingEngine.js';
import { FallbackEngine } from './services/FallbackEngine.js';
import { ResponseCache } from './router_core/ResponseCache.js';
import { UsageStore } from './router_core/UsageStore.js';
import { createApp } from './server/app.js';

// Parse CLI arguments
import { program } from 'commander';

program
  .option('-c, --config <path>', 'Path to router config JSON file', 'config/default.json')
  .option('-D, --dev', 'Run in development mode (no console file output)', false)
  .parse(process.argv);

const options = program.opts();

async function start() {
  // Load configuration
  const configResult = loadConfig(options.config);
  if (!configResult.success) {
    console.error(`FATAL: Configuration error - ${configResult.error}`);
    process.exit(1);
  }
  
  const config = configResult.config;
  const routerName = config.name || 'default';
  
  // Set up logger
  const logger = createLogger({
    name: `router-${routerName}`,
    level: config.logging?.level || 'info',
    logFile: config.logging?.file || `logs/${routerName}.log`,
    console: true,
  });

  logger.info(`Starting AI Router: ${routerName}`);

  // Init shared HTTP client
  initHttpClient(config.performance || {});

  // Init UsageStore
  const store = new UsageStore(`usage_${routerName}.json`);

  // Init Cache
  let cache = null;
  if (config.cache?.enabled) {
    cache = new ResponseCache({
      ttl: config.cache?.ttl || 30,
      maxSize: config.cache?.maxSize || 512,
    });
    logger.info(`Cache initialized (TTL: ${cache._ttl}s, MaxSize: ${cache._maxSize})`);
  }

  // Init Provider Registry
  const providerRegistry = new ProviderRegistry().initFromConfig(config, { logger, cache, store });
  providerRegistry.restoreFromStore(store);

  // Init Routing Engine
  const routingEngine = new RoutingEngine(config.routing || {}, providerRegistry);

  // Init Fallback Engine
  const fallbackEngine = new FallbackEngine(config.fallback || {}, providerRegistry, routingEngine, logger);

  // Create Express App
  const app = createApp(config, {
    logger,
    providerRegistry,
    routingEngine,
    fallbackEngine,
    cache,
    store,
  });

  const port = parseInt(process.env.PORT, 10) || config.port || 8000;
  const host = config.host || '0.0.0.0';

  const server = app.listen(port, host, () => {
    logger.info(`Server listening on http://${host}:${port}`);
    logger.info(`Available providers: ${providerRegistry.size}`);
  });

  // ── Background Tasks ────────────────────────────────────────────────────────

  const tasks = [];

  // Cache GC
  if (cache) {
    const gcInterval = setInterval(() => {
      const start = performance.now();
      const evicted = cache.purgeExpired();
      if (evicted > 0) {
         logger.debug(`Cache GC: Purged ${evicted} items in ${(performance.now() - start).toFixed(2)}ms`);
      }
    }, 30000); // every 30s
    tasks.push(gcInterval);
  }

  // Periodic usage data sync (every 30s) — replaces per-request save overhead
  const usageSyncInterval = setInterval(() => {
    try {
      for (const provider of providerRegistry.getAll().values()) {
        if (provider.registry) store.syncFromRegistry(provider.registry);
      }
      store.save();
    } catch (err) {
      logger.warn({ error: err.message }, 'Usage sync failed');
    }
  }, 30000);
  tasks.push(usageSyncInterval);

  // Graceful Shutdown Hook
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    
    tasks.forEach(clearInterval);

    server.close(async () => {
      logger.info('HTTP server closed.');
      
      // Force sync and save usage store
      for (const provider of providerRegistry.getAll().values()) {
        if (provider.registry) store.syncFromRegistry(provider.registry);
      }
      store.save(true);
      logger.info('Usage data persisted locally.');

      await closeHttpClient();
      logger.info('HTTP connections closed.');
      
      process.exit(0);
    });

    // Fallback force exit
    setTimeout(() => {
      logger.error('Graceful shutdown timed out. Forcing exit.');
      store.save(true);
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Catch unhandled promise rejections to prevent silent crashes
  process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason: reason?.message || reason, stack: reason?.stack }, 'Unhandled Promise Rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ error: err.message, stack: err.stack }, 'Uncaught Exception — shutting down');
    store.save(true);
    process.exit(1);
  });
}

start().catch(err => {
  console.error('Unhandled initialization error:', err);
  process.exit(1);
});
