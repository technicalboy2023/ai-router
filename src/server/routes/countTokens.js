/**
 * countTokens.js
 * ===============
 * POST /v1/messages/count_tokens endpoint.
 * Anthropic-compatible token counting endpoint.
 *
 * Claude Code calls this to estimate context window usage
 * before sending large messages. Returns approximate token count.
 *
 * Response format: { input_tokens: <number> }
 */

import { Router } from 'express';

const router = Router();

/**
 * Rough token estimator.
 * Uses ~4 chars per token heuristic (standard BPE approximation).
 * Not exact, but sufficient for context window management.
 *
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text) return 0;
  // Average ~4 characters per token for English text (BPE tokenizers)
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens from Anthropic message content blocks.
 * @param {string|object[]} content
 * @returns {number}
 */
function estimateContentTokens(content) {
  if (typeof content === 'string') {
    return estimateTokens(content);
  }
  if (Array.isArray(content)) {
    let total = 0;
    for (const block of content) {
      if (block.type === 'text') {
        total += estimateTokens(block.text || '');
      } else if (block.type === 'tool_use') {
        total += estimateTokens(block.name || '');
        total += estimateTokens(JSON.stringify(block.input || {}));
      } else if (block.type === 'tool_result') {
        if (typeof block.content === 'string') {
          total += estimateTokens(block.content);
        } else if (Array.isArray(block.content)) {
          for (const sub of block.content) {
            if (sub.type === 'text') {
              total += estimateTokens(sub.text || '');
            }
          }
        }
      } else if (block.type === 'image') {
        // Images typically use ~1600 tokens for a standard resolution image
        total += 1600;
      } else if (block.type === 'thinking' || block.type === 'redacted_thinking') {
        total += estimateTokens(block.thinking || '');
      }
    }
    return total;
  }
  return 0;
}

router.post('/', async (req, res) => {
  try {
    const body = req.body;

    let totalTokens = 0;

    // Count system prompt tokens
    if (body.system) {
      if (typeof body.system === 'string') {
        totalTokens += estimateTokens(body.system);
      } else if (Array.isArray(body.system)) {
        for (const block of body.system) {
          if (block.type === 'text') {
            totalTokens += estimateTokens(block.text || '');
          }
        }
      }
    }

    // Count message tokens
    if (Array.isArray(body.messages)) {
      for (const msg of body.messages) {
        // Role token overhead (~4 tokens per message for role/formatting)
        totalTokens += 4;
        totalTokens += estimateContentTokens(msg.content);
      }
    }

    // Count tool definitions tokens
    if (Array.isArray(body.tools)) {
      for (const tool of body.tools) {
        totalTokens += estimateTokens(tool.name || '');
        totalTokens += estimateTokens(tool.description || '');
        totalTokens += estimateTokens(JSON.stringify(tool.input_schema || {}));
      }
    }

    // Add base overhead for message formatting (~10 tokens)
    totalTokens += 10;

    res.json({ input_tokens: totalTokens });

  } catch (err) {
    res.status(400).json({
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message: err.message || 'Failed to count tokens.',
      },
    });
  }
});

export default router;
