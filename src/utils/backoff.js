/**
 * backoff.js
 * ==========
 * Exponential back-off helper.
 * Port of router_core.py backoff_sleep.
 *
 * Delays: 0.5s → 1s → 2s → 4s → 8s → 16s (capped)
 */

/** @type {number} Initial backoff in ms */
export const INITIAL_BACKOFF_MS = 500;

/** @type {number} Backoff multiplier */
export const BACKOFF_FACTOR = 2;

/** @type {number} Maximum backoff in ms */
export const MAX_BACKOFF_MS = 16_000;

/**
 * Calculate the backoff delay for a given attempt.
 * @param {number} attempt - Zero-indexed attempt number
 * @returns {number} Delay in milliseconds
 */
export function getBackoffDelay(attempt) {
  return Math.min(INITIAL_BACKOFF_MS * Math.pow(BACKOFF_FACTOR, attempt), MAX_BACKOFF_MS);
}

/**
 * Sleep for the exponential backoff duration.
 * @param {number} attempt - Zero-indexed attempt number
 * @returns {Promise<void>}
 */
export async function backoffSleep(attempt) {
  const delay = getBackoffDelay(attempt);
  return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
export async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default { getBackoffDelay, backoffSleep, sleep, INITIAL_BACKOFF_MS, BACKOFF_FACTOR, MAX_BACKOFF_MS };
