/**
 * httpClient.js
 * =============
 * Shared HTTP client with connection pooling.
 * Port of router_core.py shared async HTTP client.
 *
 * Uses undici (Node.js native) with:
 *  - Connection pooling (300 max, 80 keepalive pipelining)
 *  - HTTP/1.1 persistent connections
 *  - Configurable timeouts (connect: 10s, read: 120s)
 */

import { Agent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';

/** @type {Agent|null} */
let _agent = null;

/**
 * Default performance settings (mirrors Python httpx config).
 */
const DEFAULTS = {
  maxConnections: 300,
  maxKeepAlive: 80,
  keepAliveTimeout: 30_000,   // 30s keepalive expiry
  connectTimeout: 10_000,     // 10s connect
  bodyTimeout: 120_000,       // 120s read
  headersTimeout: 30_000,     // 30s for headers
  pipelining: 1,
};

/**
 * Initialize the global HTTP agent with connection pooling.
 * @param {object} [config] - Override defaults
 */
export function initHttpClient(config = {}) {
  const opts = { ...DEFAULTS, ...config };

  _agent = new Agent({
    connections: opts.maxConnections,
    pipelining: opts.pipelining,
    keepAliveTimeout: opts.keepAliveTimeout,
    keepAliveMaxTimeout: opts.keepAliveTimeout,
    connect: {
      timeout: opts.connectTimeout,
    },
    bodyTimeout: opts.bodyTimeout,
    headersTimeout: opts.headersTimeout,
  });

  setGlobalDispatcher(_agent);
  return _agent;
}

/**
 * Get the current HTTP agent (initializes if needed).
 * @returns {Agent}
 */
export function getHttpAgent() {
  if (!_agent) {
    initHttpClient();
  }
  return _agent;
}

/**
 * Close the HTTP agent and release all connections.
 */
export async function closeHttpClient() {
  if (_agent) {
    await _agent.close();
    _agent = null;
  }
}

/**
 * Make an HTTP request using undici fetch with the pooled agent.
 * @param {string} url
 * @param {object} options - fetch options (method, headers, body, etc.)
 * @returns {Promise<Response>}
 */
export async function httpFetch(url, options = {}) {
  // Ensure agent is initialized
  getHttpAgent();
  return fetch(url, {
    ...options,
    dispatcher: _agent,
  });
}

/**
 * Make a streaming HTTP request (returns raw response for SSE consumption).
 * @param {string} url
 * @param {object} options
 * @returns {Promise<Response>}
 */
export async function httpStream(url, options = {}) {
  getHttpAgent();
  return fetch(url, {
    ...options,
    dispatcher: _agent,
  });
}

export default { initHttpClient, getHttpAgent, closeHttpClient, httpFetch, httpStream };
