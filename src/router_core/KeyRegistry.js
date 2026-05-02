/**
 * KeyRegistry.js
 * ==============
 * Manages a pool of API keys for one provider.
 * Direct port of router_core.py KeyRegistry.
 *
 * Key selection is health-score weighted: best key first,
 * cooled-down keys excluded (unless entire pool is in cooldown,
 * in which case all keys returned as last resort).
 */

import { KeyHealth } from './KeyHealth.js';

export class KeyRegistry {
  /**
   * @param {string[]} keys - Array of API key strings
   */
  constructor(keys = []) {
    /** @type {Map<string, KeyHealth>} */
    this._registry = new Map();

    // Deduplicate and register keys
    const seen = new Set();
    for (const key of keys) {
      const trimmed = key?.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        this._registry.set(trimmed, new KeyHealth(trimmed));
      }
    }
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  /**
   * Restore counters from saved JSON blob (best-effort).
   * @param {object} data - Keyed by API key string
   */
  loadPersisted(data) {
    if (!data) return;
    for (const [key, kh] of this._registry) {
      if (data[key]) {
        kh.loadPersisted(data[key]);
      }
    }
  }

  /**
   * Serialize all key health data for persistence.
   * @returns {object}
   */
  serialize() {
    const result = {};
    for (const [key, kh] of this._registry) {
      result[key] = kh.toStorageJSON();
    }
    return result;
  }

  // ── Selection ───────────────────────────────────────────────────────────

  /**
   * Get available keys ordered by round-robin.
   * If no keys are available (all cooled down), returns all keys as last resort.
   * @returns {string[]}
   */
  rankedKeys() {
    let available = [];
    for (const kh of this._registry.values()) {
      if (kh.isAvailable) {
        available.push(kh);
      }
    }

    // Last resort: if all keys are in cooldown, return all
    if (available.length === 0) {
      available = Array.from(this._registry.values());
    }

    // Determine the current round-robin index
    if (this._rrIndex === undefined) {
      this._rrIndex = 0;
    }

    const count = available.length;
    // Ensure index is within bounds if available keys shrank
    this._rrIndex = this._rrIndex % count;

    // Rotate the array so the next round-robin key is first
    const rotated = available.slice(this._rrIndex).concat(available.slice(0, this._rrIndex));

    // Advance the index for the next request
    this._rrIndex = (this._rrIndex + 1) % this._registry.size;

    return rotated.map(kh => kh.key);
  }

  // ── Telemetry Updates ───────────────────────────────────────────────────

  /**
   * Record a successful request for a key.
   * @param {string} key
   * @param {number} latency - Latency in seconds
   * @param {number} [tokens=0]
   */
  onSuccess(key, latency, tokens = 0) {
    const kh = this._registry.get(key);
    if (kh) {
      kh.recordSuccess(latency, tokens);
    }
  }

  /**
   * Record a failed request for a key.
   * @param {string} key
   * @param {boolean} [forceCooldown=false]
   * @param {object} [logger=null]
   */
  onError(key, forceCooldown = false, logger = null) {
    const kh = this._registry.get(key);
    if (kh) {
      kh.recordError(forceCooldown, logger);
    }
  }

  /**
   * Lift cooldown from a key. Used by circuit breaker when failure is
   * determined to be systemic (model unavailable), not per-key.
   * @param {string} key
   */
  uncool(key) {
    const kh = this._registry.get(key);
    if (kh) {
      kh.cooldownUntil = 0;
      kh.consecutiveErrors = 0;
    }
  }

  // ── Introspection ───────────────────────────────────────────────────────

  /**
   * Get status data for all keys.
   * @returns {object[]}
   */
  status() {
    return Array.from(this._registry.values()).map(kh => kh.toJSON());
  }

  /**
   * Number of registered keys.
   * @returns {number}
   */
  get size() {
    return this._registry.size;
  }

  /**
   * Number of currently available (non-cooled-down) keys.
   * @returns {number}
   */
  availableCount() {
    let count = 0;
    for (const kh of this._registry.values()) {
      if (kh.isAvailable) count++;
    }
    return count;
  }

  /**
   * Total tokens consumed across all keys.
   * @returns {number}
   */
  totalTokens() {
    let total = 0;
    for (const kh of this._registry.values()) {
      total += kh.totalTokens;
    }
    return total;
  }

  /**
   * Get a specific key's health record.
   * @param {string} key
   * @returns {KeyHealth|undefined}
   */
  getKeyHealth(key) {
    return this._registry.get(key);
  }

  /**
   * Reset cooldowns on all keys.
   * @returns {number} Number of keys that were in cooldown
   */
  resetAllCooldowns() {
    let count = 0;
    const now = Date.now() / 1000;
    for (const kh of this._registry.values()) {
      if (kh.cooldownUntil > now) {
        kh.cooldownUntil = 0;
        count++;
      }
    }
    return count;
  }
}

export default KeyRegistry;
