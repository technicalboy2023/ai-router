/**
 * requestId.js
 * ============
 * Middleware: injects X-Request-ID on every request/response.
 * Port of main.py attach_request_id middleware.
 */

import { newRequestId } from '../../utils/idGenerator.js';

export function requestIdMiddleware() {
  return (req, res, next) => {
    const id = req.headers['x-request-id'] || newRequestId();
    req.requestId = id;
    res.setHeader('X-Request-ID', id);
    next();
  };
}

export default requestIdMiddleware;
