/**
 * auth.js
 * =======
 * Optional bearer token authentication middleware.
 */

export function authMiddleware(opts = {}) {
  const { enabled = false, tokens = [], adminTokens = [] } = opts;

  const allTokens = new Set([...tokens, ...adminTokens]);
  const adminSet = new Set(adminTokens);

  return (req, res, next) => {
    if (!enabled) {
      req.isAdmin = true; // Grant admin access when auth is disabled (dev mode)
      return next();
    }

    // Skip auth for health check
    if (req.path === '/health') return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          message: 'Authentication required. Provide Bearer token.',
          type: 'auth_error',
          code: 401,
        },
      });
    }

    const token = authHeader.slice(7).trim();
    if (!allTokens.has(token)) {
      return res.status(403).json({
        error: {
          message: 'Invalid authentication token.',
          type: 'auth_error',
          code: 403,
        },
      });
    }

    // Mark admin access for admin endpoints
    req.isAdmin = adminSet.has(token) || tokens.length === 0;
    next();
  };
}

export default authMiddleware;
