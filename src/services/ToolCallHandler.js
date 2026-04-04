/**
 * ToolCallHandler.js
 * ==================
 * Normalizes tool/function calling logic across providers.
 */

export class ToolCallHandler {
  /**
   * Helper to format tools for the request body.
   * Basic pass-through since OpenAI format is generally a standard.
   */
  static formatTools(tools) {
    if (!Array.isArray(tools) || tools.length === 0) return undefined;
    
    // Validate tool structure briefly and return it
    // Some providers might need conversion (like Ollama or Gemini 
    // depending on their exact tool calling implementation), but typical
    // requests use the standard OpenAI tools structure.
    return tools;
  }

  /**
   * Format tool_choice.
   */
  static formatToolChoice(toolChoice) {
    return toolChoice;
  }
}

export default ToolCallHandler;
