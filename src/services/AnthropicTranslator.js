/**
 * AnthropicTranslator.js
 * ======================
 * Bidirectional translation layer between Anthropic Messages API
 * and OpenAI Chat Completions API formats.
 *
 * Enables the router to accept requests in Anthropic format (/v1/messages)
 * and route them through existing OpenAI-compatible providers.
 *
 * Conversions:
 *   anthropicToOpenAI()           — Request:  Anthropic → OpenAI
 *   openAIToAnthropic()           — Response: OpenAI → Anthropic (non-streaming)
 *   createAnthropicStreamEvents() — Response: OpenAI chunks → Anthropic SSE events (streaming)
 */

import { newCompletionId } from '../utils/idGenerator.js';

// ── Stop Reason Mapping ──────────────────────────────────────────────────────

const OPENAI_TO_ANTHROPIC_STOP = {
  'stop': 'end_turn',
  'length': 'max_tokens',
  'tool_calls': 'tool_use',
  'content_filter': 'end_turn',
  'function_call': 'tool_use',
};

// ── Request Translation ──────────────────────────────────────────────────────

/**
 * Convert an Anthropic Messages API request body to OpenAI Chat Completions format.
 *
 * Key differences handled:
 *  - system: top-level string → prepended as { role: "system" } message
 *  - max_tokens: required in Anthropic → mapped to max_tokens in OpenAI
 *  - messages content: array of blocks → flattened to string
 *  - tools: Anthropic tool format → OpenAI function format
 *
 * @param {object} body - Anthropic request body
 * @returns {{ messages: object[], model: string, stream: boolean, extraParams: object }}
 */
export function anthropicToOpenAI(body) {
  const {
    model,
    messages: anthropicMessages = [],
    system,
    max_tokens,
    stream = false,
    temperature,
    top_p,
    top_k,
    stop_sequences,
    tools,
    tool_choice,
    metadata,
    ...rest
  } = body;

  // Build OpenAI messages array
  const openAIMessages = [];

  // 1. System prompt → first message with role: "system"
  if (system) {
    if (typeof system === 'string') {
      openAIMessages.push({ role: 'system', content: system });
    } else if (Array.isArray(system)) {
      // Anthropic supports array of content blocks for system
      const systemText = system
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
      if (systemText) {
        openAIMessages.push({ role: 'system', content: systemText });
      }
    }
  }

  // 2. Convert each message
  for (const msg of anthropicMessages) {
    const converted = convertAnthropicMessage(msg);
    if (converted) {
      if (Array.isArray(converted)) {
        openAIMessages.push(...converted);
      } else {
        openAIMessages.push(converted);
      }
    }
  }

  // 3. Build extra params
  const extraParams = {};
  if (max_tokens != null) extraParams.max_tokens = max_tokens;
  if (temperature != null) extraParams.temperature = temperature;
  if (top_p != null) extraParams.top_p = top_p;
  if (stop_sequences) extraParams.stop = stop_sequences;

  // 4. Convert tools if present
  if (tools && Array.isArray(tools)) {
    extraParams.tools = tools.map(convertAnthropicTool);
  }

  // 5. Convert tool_choice if present
  if (tool_choice) {
    extraParams.tool_choice = convertAnthropicToolChoice(tool_choice);
  }

  return {
    messages: openAIMessages,
    model: model || 'openrouter/auto',
    stream,
    extraParams,
  };
}

/**
 * Convert a single Anthropic message to OpenAI format.
 * @param {object} msg - { role, content }
 * @returns {object|object[]|null}
 */
function convertAnthropicMessage(msg) {
  const { role, content } = msg;

  // Simple string content
  if (typeof content === 'string') {
    return { role, content };
  }

  // Array of content blocks
  if (Array.isArray(content)) {
    // Check if it contains tool_use or tool_result blocks
    const hasToolUse = content.some(b => b.type === 'tool_use');
    const hasToolResult = content.some(b => b.type === 'tool_result');

    if (hasToolResult) {
      // Convert tool_result blocks to OpenAI tool role messages
      const messages = [];
      for (const block of content) {
        if (block.type === 'tool_result') {
          messages.push({
            role: 'tool',
            tool_call_id: block.tool_use_id,
            content: typeof block.content === 'string'
              ? block.content
              : JSON.stringify(block.content),
          });
        } else if (block.type === 'text') {
          messages.push({ role, content: block.text });
        }
      }
      return messages;
    }

    if (hasToolUse && role === 'assistant') {
      // Convert assistant tool_use to OpenAI tool_calls format
      const textParts = content.filter(b => b.type === 'text').map(b => b.text).join('');
      const toolCalls = content
        .filter(b => b.type === 'tool_use')
        .map(b => ({
          id: b.id,
          type: 'function',
          function: {
            name: b.name,
            arguments: typeof b.input === 'string' ? b.input : JSON.stringify(b.input),
          },
        }));

      return {
        role: 'assistant',
        content: textParts || null,
        tool_calls: toolCalls,
      };
    }

    // Plain text/image content blocks → flatten to string
    const textContent = content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    // Check for image blocks
    const imageBlocks = content.filter(b => b.type === 'image');
    if (imageBlocks.length > 0) {
      // Convert to OpenAI vision format
      const parts = [];
      for (const block of content) {
        if (block.type === 'text') {
          parts.push({ type: 'text', text: block.text });
        } else if (block.type === 'image') {
          parts.push({
            type: 'image_url',
            image_url: {
              url: `data:${block.source.media_type};base64,${block.source.data}`,
            },
          });
        }
      }
      return { role, content: parts };
    }

    return { role, content: textContent };
  }

  return { role, content: String(content || '') };
}

/**
 * Convert Anthropic tool definition to OpenAI format.
 * @param {object} tool
 * @returns {object}
 */
function convertAnthropicTool(tool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema || {},
    },
  };
}

/**
 * Convert Anthropic tool_choice to OpenAI format.
 * @param {object} toolChoice
 * @returns {string|object}
 */
function convertAnthropicToolChoice(toolChoice) {
  if (typeof toolChoice === 'string') return toolChoice;
  if (toolChoice.type === 'auto') return 'auto';
  if (toolChoice.type === 'any') return 'required';
  if (toolChoice.type === 'tool') {
    return { type: 'function', function: { name: toolChoice.name } };
  }
  return 'auto';
}

// ── Response Translation (Non-Streaming) ─────────────────────────────────────

/**
 * Convert an OpenAI Chat Completion response to Anthropic Messages format.
 *
 * @param {object} openAIResponse - Full OpenAI response object
 * @param {string} requestModel - Model name from the original request
 * @returns {object} Anthropic-format response
 */
export function openAIToAnthropic(openAIResponse, requestModel) {
  const choice = openAIResponse?.choices?.[0];
  const message = choice?.message || {};
  const finishReason = choice?.finish_reason || 'stop';

  // Build content blocks
  const contentBlocks = [];

  // Text content
  if (message.content) {
    contentBlocks.push({
      type: 'text',
      text: message.content,
    });
  }

  // Tool calls → tool_use blocks
  if (message.tool_calls && Array.isArray(message.tool_calls)) {
    for (const tc of message.tool_calls) {
      contentBlocks.push({
        type: 'tool_use',
        id: tc.id || `toolu_${newCompletionId()}`,
        name: tc.function?.name || 'unknown',
        input: safeParseJSON(tc.function?.arguments || '{}'),
      });
    }
  }

  // If no content at all, add empty text block
  if (contentBlocks.length === 0) {
    contentBlocks.push({ type: 'text', text: '' });
  }

  // Build usage
  const usage = openAIResponse?.usage || {};
  const anthropicUsage = {
    input_tokens: usage.prompt_tokens || 0,
    output_tokens: usage.completion_tokens || usage.total_tokens || 0,
  };

  return {
    id: openAIResponse?.id || `msg_${newCompletionId()}`,
    type: 'message',
    role: 'assistant',
    model: requestModel,
    content: contentBlocks,
    stop_reason: OPENAI_TO_ANTHROPIC_STOP[finishReason] || 'end_turn',
    stop_sequence: null,
    usage: anthropicUsage,
  };
}

// ── Streaming Translation ────────────────────────────────────────────────────

/**
 * Streaming state tracker for converting OpenAI SSE → Anthropic SSE.
 * Create one instance per streaming request.
 */
export class AnthropicStreamState {
  constructor(model, requestId) {
    this.model = model;
    this.requestId = requestId;
    this.messageId = `msg_${newCompletionId()}`;
    this.started = false;
    this.blockStarted = false;
    this.outputTokens = 0;
    this.inputTokens = 0;
  }

  /**
   * Generate the opening SSE events (message_start + content_block_start).
   * @returns {string} SSE text
   */
  emitStart() {
    this.started = true;
    this.blockStarted = true;

    const messageStartEvent = {
      type: 'message_start',
      message: {
        id: this.messageId,
        type: 'message',
        role: 'assistant',
        model: this.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: this.inputTokens,
          output_tokens: 0,
        },
      },
    };

    const contentBlockStart = {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'text',
        text: '',
      },
    };

    return (
      `event: message_start\ndata: ${JSON.stringify(messageStartEvent)}\n\n` +
      `event: ping\ndata: {"type": "ping"}\n\n` +
      `event: content_block_start\ndata: ${JSON.stringify(contentBlockStart)}\n\n`
    );
  }

  /**
   * Convert a single OpenAI SSE chunk to Anthropic content_block_delta event.
   * @param {string} sseText - Raw OpenAI SSE line (e.g. "data: {...}\n\n")
   * @returns {string} Anthropic SSE event text, or empty string if not applicable
   */
  convertChunk(sseText) {
    const trimmed = sseText.trim();

    // Handle [DONE]
    if (trimmed === 'data: [DONE]' || trimmed.endsWith('[DONE]')) {
      return this.emitEnd();
    }

    // Extract JSON from "data: {...}"
    let dataStr = trimmed;
    if (dataStr.startsWith('data:')) {
      dataStr = dataStr.slice(5).trim();
    }

    if (!dataStr || dataStr === '[DONE]') {
      return this.emitEnd();
    }

    let parsed;
    try {
      parsed = JSON.parse(dataStr);
    } catch {
      return ''; // Skip unparseable chunks
    }

    // Check for error chunks
    if (parsed.error) {
      const errorEvent = {
        type: 'error',
        error: {
          type: 'api_error',
          message: parsed.error.message || 'Unknown error',
        },
      };
      return `event: error\ndata: ${JSON.stringify(errorEvent)}\n\n`;
    }

    const delta = parsed?.choices?.[0]?.delta;
    if (!delta) return '';

    const content = delta.content;
    const finishReason = parsed?.choices?.[0]?.finish_reason;

    let output = '';

    // Emit start events if not done yet
    if (!this.started) {
      output += this.emitStart();
    }

    // Text delta
    if (content) {
      const deltaEvent = {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: content,
        },
      };
      output += `event: content_block_delta\ndata: ${JSON.stringify(deltaEvent)}\n\n`;
      this.outputTokens++;
    }

    // Finish reason present → emit closing events
    if (finishReason && finishReason !== 'null') {
      output += this.emitEnd(finishReason);
    }

    return output;
  }

  /**
   * Generate the closing SSE events (content_block_stop + message_delta + message_stop).
   * @param {string} [finishReason='stop']
   * @returns {string} SSE text
   */
  emitEnd(finishReason = 'stop') {
    if (!this.started) return '';

    const stopReason = OPENAI_TO_ANTHROPIC_STOP[finishReason] || 'end_turn';

    const contentBlockStop = {
      type: 'content_block_stop',
      index: 0,
    };

    const messageDelta = {
      type: 'message_delta',
      delta: {
        stop_reason: stopReason,
        stop_sequence: null,
      },
      usage: {
        output_tokens: this.outputTokens,
      },
    };

    const messageStop = {
      type: 'message_stop',
    };

    // Prevent double-end
    this.started = false;

    return (
      `event: content_block_stop\ndata: ${JSON.stringify(contentBlockStop)}\n\n` +
      `event: message_delta\ndata: ${JSON.stringify(messageDelta)}\n\n` +
      `event: message_stop\ndata: ${JSON.stringify(messageStop)}\n\n`
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeParseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

export default {
  anthropicToOpenAI,
  openAIToAnthropic,
  AnthropicStreamState,
};
