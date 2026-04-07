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

    // Support both OpenAI-style (Authorization: Bearer) and Anthropic-style (x-api-key) auth
    const authHeader = req.headers.authorization;
    const xApiKey = req.headers['x-api-key'];

    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (xApiKey) {
      token = xApiKey.trim();
    }

    if (!token) {
      return res.status(401).json({
        error: {
          message: 'Authentication required. Provide Bearer token or x-api-key header.',
          type: 'auth_error',
          code: 401,
        },
      });
    }
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
