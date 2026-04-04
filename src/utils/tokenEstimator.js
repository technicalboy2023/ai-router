/**
 * tokenEstimator.js
 * =================
 * Rough token count estimator (no tiktoken dependency).
 * Port of router_core.py estimate_tokens.
 *
 * Approximation: ~4 characters per token.
 */

/**
 * Estimate token count from a text string.
 * @param {string} text
 * @returns {number} Estimated token count (minimum 1)
 */
export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  return Math.max(1, Math.floor(text.length / 4));
}

/**
 * Estimate tokens from an array of chat messages.
 * @param {Array<{role: string, content: string}>} messages
 * @returns {number}
 */
export function estimateMessagesTokens(messages) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const msg of messages) {
    // ~4 tokens per message overhead (role, formatting)
    total += 4;
    if (msg.content) {
      total += estimateTokens(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content));
    }
    if (msg.name) {
      total += estimateTokens(msg.name);
    }
  }
  // Every reply is primed with <|start|>assistant<|message|>
  total += 3;
  return total;
}

export default { estimateTokens, estimateMessagesTokens };
