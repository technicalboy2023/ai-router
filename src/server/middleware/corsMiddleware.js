/**
 * corsMiddleware.js
 * =================
 * CORS configuration middleware.
 * Port of main.py CORSMiddleware setup.
 */

import corsLib from 'cors';

export function corsMiddleware(opts = {}) {
  return corsLib({
    origin: opts.origin || '*',
    methods: opts.methods || '*',
    allowedHeaders: opts.allowedHeaders || '*',
    credentials: opts.credentials || false,
  });
}

export default corsMiddleware;
