/**
 * app.js
 * ======
 * Express application factory.
 * Initializes the HTTP server with all middleware and routes.
 */

import express from 'express';
import { requestIdMiddleware } from './middleware/requestId.js';
import { corsMiddleware } from './middleware/corsMiddleware.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

import chatCompletionsRouter from './routes/chatCompletions.js';
import modelsRouter from './routes/models.js';
import healthRouter from './routes/health.js';
import usageRouter from './routes/usage.js';
import metricsRouter from './routes/metrics.js';
import routerStatusRouter from './routes/routerStatus.js';
import adminRouter from './routes/admin.js';
import messagesRouter from './routes/messages.js';

/**
 * Create an Express application configured with router components.
 * @param {object} config - Router config
 * @param {object} deps - { logger, providerRegistry, fallbackEngine, routingEngine, cache, store }
 * @returns {express.Application}
 */
export function createApp(config, deps) {
  const app = express();

  // ── Basic Settings ───────────────────────────────────────────────────────
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Required for Render / reverse proxy (correct IP for rate limiting)

  // ── Body Parser ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));

  // ── Security Headers ─────────────────────────────────────────────────────
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '0'); // Modern browsers: CSP preferred over XSS filter
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // ── Request ID injection (X-Request-ID) ──────────────────────────────────
  app.use(requestIdMiddleware());

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.use(corsMiddleware());

  // ── Rate Limiter ──────────────────────────────────────────────────────────
  if (config.rateLimit?.enabled) {
    app.use(rateLimiter(config.rateLimit));
  }

  // ── Auth (Bearer token) ───────────────────────────────────────────────────
  app.use(authMiddleware(config.auth || {}));

  // ── Inject dependencies into res.locals for routes to use ─────────────────
  app.use((req, res, next) => {
    res.locals.config = config;
    res.locals.deps = deps;
    res.locals.logger = deps.logger;
    next();
  });

  // ── API Endpoints ─────────────────────────────────────────────────────────
  app.use('/v1/chat/completions', chatCompletionsRouter);
  app.use('/v1/messages', messagesRouter);
  app.use('/v1/models', modelsRouter);
  app.use('/health', healthRouter);
  app.use('/usage', usageRouter);
  app.use('/metrics', metricsRouter);
  app.use('/router/status', routerStatusRouter);
  app.use('/admin', adminRouter);

  // ── 404 handler ───────────────────────────────────────────────────────────
  app.use((req, res) => {
    res.status(404).json({ error: { message: 'Not Found', type: 'not_found', code: 404 } });
  });

  // ── Global exception handler (must be last, 4-arg signature) ──────────────
  app.use(errorHandler(deps.logger));

  return app;
}

export default createApp;
