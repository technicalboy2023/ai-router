/**
 * rateLimiter.js
 * ==============
 * Simple in-memory sliding window rate limiter.
 */

export function rateLimiter(opts = {}) {
  const { enabled = false, windowMs = 60000, maxRequests = 100 } = opts;

  // In-memory store: IP → { count, resetAt }
  const store = new Map();

  // Cleanup interval
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of store) {
      if (now > data.resetAt) store.delete(ip);
    }
  }, windowMs);

  // Don't prevent process exit
  if (cleanupInterval.unref) cleanupInterval.unref();

  return (req, res, next) => {
    if (!enabled) return next();

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();

    let record = store.get(ip);
    if (!record || now > record.resetAt) {
      record = { count: 0, resetAt: now + windowMs };
      store.set(ip, record);
    }

    record.count++;

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetAt / 1000));

    if (record.count > maxRequests) {
      return res.status(429).json({
        error: {
          message: 'Rate limit exceeded. Try again later.',
          type: 'rate_limit',
          code: 429,
        },
      });
    }

    next();
  };
}

export default rateLimiter;
