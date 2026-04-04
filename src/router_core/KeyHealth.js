/**
 * KeyHealth.js
 * ============
 * Per-key runtime telemetry for smart routing decisions.
 * Direct port of router_core.py KeyHealth dataclass.
 *
 * Tracks: requests, successes, errors, consecutive errors,
 * tokens, cooldown state, rolling latency (last 20 requests).
 *
 * Health score formula: 0.6 × successRate + 0.4 × (1 − avgLatency/30)
 */

/** @type {number} Rolling window size for latency tracking */
const LATENCY_WINDOW = 20;

/** @type {number} Cooldown duration in seconds after repeated errors */
const COOLDOWN_WINDOW = 60;

/** @type {number} Consecutive errors before auto-cooldown */
const ERROR_THRESHOLD = 3;

export class KeyHealth {
  /**
   * @param {string} key - The API key
   */
  constructor(key) {
    /** @type {string} */
    this.key = key;

    /** @type {number} */
    this.totalRequests = 0;

    /** @type {number} */
    this.successCount = 0;

    /** @type {number} */
    this.errorCount = 0;

    /** @type {number} */
    this.consecutiveErrors = 0;

    /** @type {number} */
    this.totalTokens = 0;

    /** @type {number} Unix timestamp (seconds) until which key is frozen */
    this.cooldownUntil = 0;

    /** @type {number} Last time this key was used (for LRU-style rotation) */
    this.lastUsedAt = 0;

    /**
     * Circular buffer for rolling latency tracking.
     * @type {number[]}
     */
    this._latencies = [];

    /** @type {number} Pointer into circular buffer */
    this._latencyPtr = 0;
  }

  // ── Derived Properties ──────────────────────────────────────────────────

  /**
   * Average latency over the rolling window (seconds).
   * Returns 9999 if no data (pushes key to bottom of ranking).
   * @returns {number}
   */
  get avgLatency() {
    if (this._latencies.length === 0) return 9999.0;
    const sum = this._latencies.reduce((a, b) => a + b, 0);
    return sum / this._latencies.length;
  }

  /**
   * Success rate ∈ [0, 1]. Returns 1.0 if no requests yet (benefit of doubt).
   * @returns {number}
   */
  get successRate() {
    if (this.totalRequests === 0) return 1.0;
    return this.successCount / this.totalRequests;
  }

  /**
   * Whether the key is currently available (not in cooldown).
   * @returns {boolean}
   */
  get isAvailable() {
    return Date.now() / 1000 >= this.cooldownUntil;
  }

  /**
   * Composite health score ∈ [0, 1]. Higher = healthier = preferred.
   *   60% weight → success_rate
   *   40% weight → inverse-normalised avg latency (capped at 30s)
   * @returns {number}
   */
  get healthScore() {
    const latencyScore = Math.max(0.0, 1.0 - this.avgLatency / 30.0);
    return parseFloat((0.6 * this.successRate + 0.4 * latencyScore).toFixed(6));
  }

  // ── Mutation Helpers ────────────────────────────────────────────────────

  /**
   * Record a successful request.
   * @param {number} latency - Request latency in seconds
   * @param {number} [tokens=0] - Tokens consumed
   */
  recordSuccess(latency, tokens = 0) {
    this.totalRequests += 1;
    this.successCount += 1;
    this.consecutiveErrors = 0;
    this.totalTokens += tokens;
    this.lastUsedAt = Date.now() / 1000;
    this._pushLatency(latency);
  }

  /**
   * Record a failed request. Optionally force cooldown (e.g. 429/403).
   * @param {boolean} [forceCooldown=false]
   * @param {import('./logger.js').Logger} [logger] - Optional logger
   */
  recordError(forceCooldown = false, logger = null) {
    this.totalRequests += 1;
    this.errorCount += 1;
    this.consecutiveErrors += 1;

    if (forceCooldown || this.consecutiveErrors >= ERROR_THRESHOLD) {
      this.cooldownUntil = Date.now() / 1000 + COOLDOWN_WINDOW;
      if (logger) {
        logger.warn({ keySuffix: this.keySuffix, until: this.cooldownUntil }, 'Key placed on cooldown');
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Push a latency value into the circular buffer.
   * @param {number} latency
   */
  _pushLatency(latency) {
    if (this._latencies.length < LATENCY_WINDOW) {
      this._latencies.push(latency);
    } else {
      this._latencies[this._latencyPtr] = latency;
      this._latencyPtr = (this._latencyPtr + 1) % LATENCY_WINDOW;
    }
  }

  /**
   * Anonymised key suffix (last 6 chars).
   * @returns {string}
   */
  get keySuffix() {
    return '…' + this.key.slice(-6);
  }

  /**
   * Serialize to a plain object for API responses.
   * @returns {object}
   */
  toJSON() {
    return {
      key_suffix: this.keySuffix,
      total_requests: this.totalRequests,
      success_count: this.successCount,
      error_count: this.errorCount,
      total_tokens: this.totalTokens,
      avg_latency_s: parseFloat(this.avgLatency.toFixed(3)),
      success_rate: parseFloat(this.successRate.toFixed(4)),
      health_score: this.healthScore,
      available: this.isAvailable,
      cooldown_until: this.cooldownUntil,
    };
  }

  /**
   * Serialize for persistence (only counters, not volatile state).
   * @returns {object}
   */
  toStorageJSON() {
    return {
      total_requests: this.totalRequests,
      success_count: this.successCount,
      error_count: this.errorCount,
      total_tokens: this.totalTokens,
    };
  }

  /**
   * Restore counters from persisted data.
   * @param {object} data
   */
  loadPersisted(data) {
    if (!data) return;
    this.totalRequests = data.total_requests || 0;
    this.successCount = data.success_count || 0;
    this.errorCount = data.error_count || 0;
    this.totalTokens = data.total_tokens || 0;
  }
}

// Export constants for external use
export { LATENCY_WINDOW, COOLDOWN_WINDOW, ERROR_THRESHOLD };

export default KeyHealth;
