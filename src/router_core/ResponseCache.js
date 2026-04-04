/**
 * ResponseCache.js
 * ================
 * In-memory TTL cache keyed on SHA-256(model + messages).
 * Direct port of router_core.py ResponseCache.
 *
 * Features:
 *  - TTL-based expiration (default 30s)
 *  - Max size limit (default 512), LRU eviction via Map insertion order
 *  - Hit/miss rate tracking
 *  - Background purge support
 *  - Only used for non-streaming, deterministic requests
 */

import { createHash } from 'node:crypto';

export class ResponseCache {
  /**
   * @param {object} [opts]
   * @param {number} [opts.ttl=30] - TTL in seconds
   * @param {number} [opts.maxSize=512] - Maximum cache entries
   */
  constructor(opts = {}) {
    const { ttl = 30, maxSize = 512 } = opts;

    /** @type {number} */
    this._ttl = ttl;

    /** @type {number} */
    this._maxSize = maxSize;

    /**
     * Cache store. Map preserves insertion order for LRU eviction.
     * Values: { ts: number, value: any }
     * @type {Map<string, {ts: number, value: any}>}
     */
    this._store = new Map();

    /** @type {number} */
    this._hits = 0;

    /** @type {number} */
    this._misses = 0;
  }

  /**
   * Generate cache key from messages + model using SHA-256.
   * Uses stable stringification (sorted keys, recursively) for deterministic hashing.
   * @param {object[]} messages
   * @param {string} model
   * @returns {string}
   */
  static _cacheKey(messages, model) {
    const raw = JSON.stringify({ messages, model }, (_key, value) => {
      // Sort object keys recursively for deterministic output
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return Object.keys(value).sort().reduce((sorted, k) => {
          sorted[k] = value[k];
          return sorted;
        }, {});
      }
      return value;
    });
    return createHash('sha256').update(raw).digest('hex');
  }

  /**
   * Get a cached value. Returns null on miss or expiration.
   * @param {object[]} messages
   * @param {string} model
   * @returns {any|null}
   */
  get(messages, model) {
    const key = ResponseCache._cacheKey(messages, model);
    const entry = this._store.get(key);

    if (!entry) {
      this._misses++;
      return null;
    }

    const now = Date.now() / 1000;
    if (now - entry.ts > this._ttl) {
      this._store.delete(key);
      this._misses++;
      return null;
    }

    this._hits++;

    // Move to end of Map for LRU (delete + re-insert)
    this._store.delete(key);
    this._store.set(key, entry);

    return entry.value;
  }

  /**
   * Store a value in cache. Evicts oldest entry if at capacity.
   * @param {object[]} messages
   * @param {string} model
   * @param {any} value
   */
  set(messages, model, value) {
    const key = ResponseCache._cacheKey(messages, model);

    // If key already exists, delete first (for LRU ordering)
    if (this._store.has(key)) {
      this._store.delete(key);
    }

    // Evict oldest (first entry in Map) if at capacity
    if (this._store.size >= this._maxSize) {
      const oldestKey = this._store.keys().next().value;
      this._store.delete(oldestKey);
    }

    this._store.set(key, { ts: Date.now() / 1000, value });
  }

  /**
   * Purge all expired entries. Called by background GC task.
   * @returns {number} Number of evicted entries
   */
  purgeExpired() {
    const now = Date.now() / 1000;
    let evicted = 0;

    for (const [key, entry] of this._store) {
      if (now - entry.ts > this._ttl) {
        this._store.delete(key);
        evicted++;
      }
    }

    return evicted;
  }

  /**
   * Clear the entire cache.
   */
  clear() {
    this._store.clear();
  }

  /**
   * Get cache statistics.
   * @returns {object}
   */
  stats() {
    const total = this._hits + this._misses;
    return {
      size: this._store.size,
      ttl_seconds: this._ttl,
      hits: this._hits,
      misses: this._misses,
      hit_rate: total > 0 ? parseFloat((this._hits / total).toFixed(4)) : 0,
    };
  }
}

export default ResponseCache;
