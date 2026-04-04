/**
 * UsageStore.js
 * =============
 * Atomic-write persistent JSON usage storage.
 * Direct port of router_core.py UsageStore.
 *
 * Features:
 *  - Atomic file write (temp file + rename)
 *  - Save throttling (max 1 write per 30s)
 *  - Boot restore from JSON
 *  - Forced save on shutdown
 *  - API keys are SHA-256 hashed before storage (security)
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

/** @type {number} Minimum interval between saves (seconds) */
const SAVE_INTERVAL = 30;

/**
 * Hash an API key for safe storage (not reversible).
 * @param {string} key
 * @returns {string}
 */
function hashKey(key) {
  return 'key_' + createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export class UsageStore {
  /**
   * @param {string} [path='usage.json'] - Path to the usage JSON file
   */
  constructor(path = 'usage.json') {
    /** @type {string} */
    this._path = resolve(path);

    /** @type {number} */
    this._lastSave = 0;

    /** @type {object} */
    this._data = {};

    this._load();
  }

  /**
   * Load persisted data from disk (best-effort).
   * @private
   */
  _load() {
    try {
      if (existsSync(this._path)) {
        const raw = readFileSync(this._path, 'utf-8');
        this._data = JSON.parse(raw);
      }
    } catch (err) {
      // Corrupted file — start fresh
      this._data = {};
    }
  }

  /**
   * Save data to disk. Throttled to max 1 write per SAVE_INTERVAL seconds
   * unless force=true.
   *
   * Uses atomic write: write to .tmp then rename.
   * @param {boolean} [force=false] - Force immediate save
   */
  save(force = false) {
    const now = Date.now() / 1000;
    if (!force && now - this._lastSave < SAVE_INTERVAL) {
      return;
    }

    try {
      // Ensure directory exists
      const dir = dirname(this._path);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const tmpPath = this._path + '.tmp';
      writeFileSync(tmpPath, JSON.stringify(this._data, null, 2), 'utf-8');
      renameSync(tmpPath, this._path);
      this._lastSave = now;
    } catch (err) {
      // Log error but don't crash — usage persistence is best-effort
      console.error('[UsageStore] Save failed:', err.message);
    }
  }

  /**
   * Sync registry data into the store using hashed keys.
   * @param {import('./KeyRegistry.js').KeyRegistry} registry
   */
  syncFromRegistry(registry) {
    for (const [key, kh] of registry._registry) {
      const hashedKey = hashKey(key);
      this._data[hashedKey] = kh.toStorageJSON();
    }
  }

  /**
   * Get raw persisted data.
   * @returns {object}
   */
  raw() {
    return { ...this._data };
  }

  /**
   * Get only the persisted data for keys that exist in the registry.
   * Used to seed a registry on boot. Matches by hashed key.
   * @param {import('./KeyRegistry.js').KeyRegistry} registry
   * @returns {object}
   */
  getRegistrySeed(registry) {
    const result = {};
    for (const key of registry._registry.keys()) {
      const hashedKey = hashKey(key);
      if (this._data[hashedKey]) {
        result[key] = this._data[hashedKey];
      }
    }
    return result;
  }
}

export { SAVE_INTERVAL, hashKey };
export default UsageStore;
